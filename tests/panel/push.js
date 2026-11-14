// 手机通知：开启 / 测试 / 关闭，后台服务收到推送后显示通知，点通知打开断线记录（真实 HTTP 服务器 + 真实 Service Worker）
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');

const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const CL = { subs: [], calls: [], mode: 'shown', wx: null, wxs: [] };
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x');
	let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); return J({ jsonrpc: '2.0', id: body.id, result: respond(body.method, body.params || {}) }); }
		if (u.pathname === '/cloud/push/key') return J({ key: 'BElsZ2tLeTFvN3h4eDF4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg' });
		if (u.pathname === '/cloud/push') {
			const x = JSON.parse(b || '{}');
			CL.calls.push(x);
			if (x.token !== 'testtoken1234567890') return J({ error: 'bad token' }, 403);
			if (x.op === 'sub') { CL.subs = CL.subs.filter((s) => s.endpoint !== x.sub.endpoint); CL.subs.push({ endpoint: x.sub.endpoint, name: x.name }); }
			if (x.op === 'unsub') CL.subs = CL.subs.filter((s) => s.endpoint !== x.endpoint);
			// 模拟手机回报：shown = 收到并弹出；noshow = 收到但弹不出；none = 没收到
			if (x.op === 'test') for (const s of CL.subs) { s.sent = Date.now(); s.recv = null; const m = CL.mode; if (m !== 'none') setTimeout(() => { s.recv = { t: Date.now(), shown: m === 'shown', err: m === 'shown' ? null : 'No notification permission has been granted for this origin.', perm: m === 'shown' ? 'granted' : 'denied' }; }, 1000); }
			if (x.op === 'wx') {
				if (x.wx && x.wx !== 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4') return J({ error: '微信没发出去：用户token不存在' }, 400);
				CL.wx = x.wx ? { on: true, tail: x.wx.slice(-4), ok: Date.now(), err: null } : null;
				if (x.wx) CL.wxs.push('微信推送已开启');
			}
			if (x.op === 'test' && CL.wx) { CL.wxs.push('测试'); CL.wx.ok = Date.now(); }
			const ep = x.endpoint || x.sub?.endpoint;
			const wxi = CL.wx || { on: false };
			if (x.op !== 'wx') return J({ ok: true, wx: wxi, sent: x.op === 'test' ? CL.subs.length : undefined, subs: CL.subs.map((s) => ({ name: s.name, at: 1, sent: s.sent || 0, recv: s.recv || null, me: s.endpoint === ep })) });
				return J({ ok: true, wx: wxi, subs: [] });
		}
		if (u.pathname === '/cloud/s') return J({ error: 'x' }, 403);
		if (!u.pathname.startsWith('/panel/')) { res.writeHead(404); return res.end('nf'); }
		let p = u.pathname.replace(/^\/panel\//, '') || 'index.html';
		const f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : 'image/png' });
		res.end(fs.readFileSync(f));
	});
});

// 无头浏览器没有真正的推送服务，用一个假的 PushManager 代替（只替换订阅这一步）
const fakePush = () => {
	const KEY = 'fake_push_sub';
	const mk = (ep) => ({ endpoint: ep, toJSON: () => ({ endpoint: ep, keys: { p256dh: 'BPk', auth: 'au' } }), unsubscribe: async () => { sessionStorage.removeItem(KEY); window.__unsub = (window.__unsub || 0) + 1; return true; } });
	PushManager.prototype.getSubscription = async function () { const ep = sessionStorage.getItem(KEY); return ep ? mk(ep) : null; };
	PushManager.prototype.subscribe = async function (opt) { window.__subOpt = { uv: opt.userVisibleOnly, keyLen: opt.applicationServerKey.length }; const ep = 'https://fcm.googleapis.com/fcm/send/fake' + Math.random().toString(36).slice(2); sessionStorage.setItem(KEY, ep); return mk(ep); };
};

async function swUnit() {
	const vm = require('vm');
	const H = {}, shown = [], posted = [], opened = [];
	let clientsList = [];
	const self = {
		location: new URL('https://router.example/panel/sw.js'),
		addEventListener: (t, f) => (H[t] = f),
		skipWaiting() {},
		registration: { scope: 'https://router.example/panel/', showNotification: async (t, o) => { shown.push({ t, ...o }); } },
		clients: { matchAll: async () => clientsList, openWindow: async (u) => { opened.push(u); }, claim: async () => {} },
	};
	const acks = [];
	const fetchMock = async (u, o) => { acks.push({ u, b: JSON.parse(o.body) }); return { ok: true }; };
	vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), { self, URL, caches: {}, fetch: fetchMock, Response, console, location: self.location });
	const fire = async (type, ev) => { let p = null; ev.waitUntil = (x) => (p = x); H[type](ev); await p; };
	const data = (v) => ({ json: () => JSON.parse(v), text: () => v });
	await fire('push', { data: data(JSON.stringify({ title: '⚠️ 路由器断电或死机', body: '平板还在报告…', tag: 'cloud', lvl: 'err', url: './?p=wd' })) });
	ok('收到推送后显示系统通知', shown[0] && shown[0].t === '⚠️ 路由器断电或死机' && shown[0].body === '平板还在报告…', JSON.stringify(shown[0]));
	ok('严重问题的通知会一直留着，直到点掉', shown[0].requireInteraction === true && shown[0].data.url === './?p=wd');
	ok('同一类通知用同一个标签（新的替换旧的，并重新提醒）', shown[0].tag === 'cloud' && shown[0].renotify === true);
	await fire('push', { data: data(JSON.stringify({ title: '路由器恢复正常', body: 'x', lvl: 'ok' })) });
	ok('普通通知不会一直挂着', shown[1].requireInteraction === false && shown[1].renotify === false);
	await fire('push', { data: data('not json 纯文字') });
	ok('收到看不懂的推送也能显示', shown[2].t === '我的路由器' && shown[2].body === 'not json 纯文字');
	await fire('push', { data: null });
	ok('空推送也不出错', shown[3].t === '我的路由器');
	ok('没带编号的推送不回报', acks.length === 0);
	// 带编号 → 显示后回报云端「收到了」
	clientsList = [{ url: 'https://router.example/panel/', postMessage: (m) => posted.push(m), focus: async () => {} }];
	await fire('push', { data: data(JSON.stringify({ title: '测试通知 🔔', body: 'x', tag: 'test', id: 'abc123' })) });
	ok('收到推送后回报云端：已收到并弹出', acks[0] && acks[0].u === 'https://router.example/cloud/push/ack' && acks[0].b.id === 'abc123' && acks[0].b.shown === true, JSON.stringify(acks[0]));
	ok('面板开着时也告诉面板收到了推送', posted.some((m) => m.pushed && m.pushed.id === 'abc123'));
	self.registration.showNotification = async () => { throw new TypeError('No notification permission has been granted for this origin.'); };
	await fire('push', { data: data(JSON.stringify({ title: 't', id: 'def456' })) });
	ok('弹不出来时也回报，并带上原因', acks[1] && acks[1].b.id === 'def456' && acks[1].b.shown === false && /permission/.test(acks[1].b.err));
	self.registration.showNotification = async (t, o) => { shown.push({ t, ...o }); };
	posted.length = 0;
	// 点通知：面板开着 → 切页面并切到前台；没开 → 打开
	let focused = 0;
	clientsList = [{ url: 'https://router.example/panel/', postMessage: (m) => posted.push(m), focus: async () => { focused++; } }];
	const n = { closed: 0, close() { this.closed++; }, data: { url: './?p=wd' } };
	await fire('notificationclick', { notification: n });
	ok('点通知：面板开着就切到断线记录并切到前台', n.closed === 1 && posted[0]?.go === 'wd' && focused === 1 && !opened.length);
	clientsList = [];
	await fire('notificationclick', { notification: { close() {}, data: { url: './?p=wd' } } });
	ok('点通知：面板没开就打开断线记录', opened[0] === 'https://router.example/panel/?p=wd', opened[0]);
}

(async () => {
	await new Promise((r) => server.listen(8098, r));
	const BASE = 'http://localhost:8098/panel/';
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 15; 23127PN0CC Build/AQ3A) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36 EdgA/130' });
	await ctx.grantPermissions(['notifications'], { origin: 'http://localhost:8098' });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
	await page.addInitScript(fakePush);
	// 无头浏览器里通知权限总是「拒绝」，页面这边当成已允许
	await page.addInitScript(() => { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); Notification.requestPermission = async () => 'granted'; ServiceWorkerRegistration.prototype.showNotification = async function (t, o) { (window.__local = window.__local || []).push({ t, ...o }); }; });

	// ?p=wd 直接打开断线记录（点通知进来就是这样）
	await page.goto(BASE + '?p=wd'); await page.waitForTimeout(2500);
	ok('带 ?p=wd 打开直接到断线记录', (await page.textContent('#pageTitle')) === '断线记录');
	ok('打开后地址栏去掉参数', !page.url().includes('?p='));
	ok('有「手机通知」卡片，显示未开启', (await page.textContent('#pushPill')) === '未开启' && (await page.locator('[data-pushon]').count()) === 1);
	ok('说明会推送哪些情况', /断电、断网/.test(await page.textContent('#pushCard')));
	ok('微信推送放在前面，标「推荐」，有获取 token 的步骤', /微信推送\s*推荐/.test(await page.textContent('#pushCard')) && /pushplus\.plus/.test(await page.textContent('#pushCard')) && (await page.locator('[data-wxin]').count()) === 1);
	ok('浏览器通知说明 Edge 收不到', /Edge 收不到/.test(await page.textContent('#pushCard')));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'push-01-off.png') });

	// 微信：先填个错的
	await page.fill('[data-wxin]', ' wrongtoken1234567890 '); await page.click('[data-wxon]'); await page.waitForTimeout(800);
	ok('token 不对：提示 PushPlus 的原因，仍未开启', /用户token不存在/.test(await page.textContent('#toast')) && (await page.textContent('#pushPill')) === '未开启');
	const wxCall = CL.calls.filter((c) => c.op === 'wx').pop();
	ok('粘贴时多出来的空格自动去掉', wxCall && wxCall.wx === 'wrongtoken1234567890');
	await page.fill('[data-wxin]', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'); await page.click('[data-wxon]'); await page.waitForTimeout(800);
	ok('微信推送开启：显示已开启、token 末尾、上一条已发到微信', /已开启 · token …c3d4/.test(await page.textContent('#pushCard')) && /已发到微信/.test(await page.textContent('#pushCard')) && (await page.textContent('#pushPill')) === '已开启');
	ok('开启后微信马上收到一条', CL.wxs[0] === '微信推送已开启' && /看看微信/.test(await page.textContent('#toast')));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'push-01b-wx.png'), fullPage: false });
	await page.click('[data-wxtest]'); await page.waitForTimeout(800);
	ok('微信「发一条测试」', CL.wxs[1] === '测试' && /已发到微信/.test(await page.textContent('#toast')));
	await page.reload(); await page.waitForTimeout(2500);
	ok('重开面板后微信仍显示已开启', /已开启 · token …c3d4/.test(await page.textContent('#pushCard')));
	await page.click('[data-wxoff]'); await page.waitForTimeout(800);
	ok('关闭微信推送', CL.wx === null && (await page.locator('[data-wxin]').count()) === 1 && (await page.textContent('#pushPill')) === '未开启');

	// 开启
	await page.click('[data-pushon]'); await page.waitForTimeout(1500);
	const subCall = CL.calls.find((c) => c.op === 'sub');
	ok('订阅时用了云端的公钥、只发看得见的通知', await page.evaluate(() => window.__subOpt && window.__subOpt.uv === true && window.__subOpt.keyLen === 65));
	ok('把订阅交给云端，带上手机型号', subCall && subCall.sub.endpoint.startsWith('https://fcm.') && subCall.name === '23127PN0CC', subCall && subCall.name);
	ok('开启后马上发一条测试', CL.calls.some((c) => c.op === 'test'));
	ok('卡片变成已开启', (await page.textContent('#pushPill')) === '已开启' && /这台手机已开启|已开启/.test(await page.textContent('#pushCard')));
	ok('有提示', /通知已开启/.test(await page.textContent('#toast')));
	await page.waitForTimeout(3500);
	ok('手机回报收到后：显示已送到这台手机', /已经收到了/.test(await page.textContent('#pushCard')) && /已送到这台手机/.test(await page.textContent('#pushCard')), await page.textContent('#pushCard'));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'push-02-on.png') });

	// 测试按钮：手机收到了但弹不出来
	CL.mode = 'noshow';
	const n0 = CL.calls.filter((c) => c.op === 'test').length;
	await page.click('[data-pushtest]'); await page.waitForTimeout(500);
	ok('发出后显示「正在等手机回应」', /正在等手机回应/.test(await page.textContent('#pushCard')));
	await page.waitForTimeout(3500);
	ok('「发一条测试」', CL.calls.filter((c) => c.op === 'test').length === n0 + 1);
	ok('收到但弹不出来：说明原因和怎么打开', /弹不出来/.test(await page.textContent('#pushCard')) && /设置 → 应用 → Edge → 通知/.test(await page.textContent('#pushCard')));
	// 手机根本没收到
	CL.mode = 'none';
	await page.click('[data-pushtest]'); await page.waitForTimeout(23000);
	const t3 = await page.textContent('#pushCard');
	ok('20 秒没收到：提示省电策略 / 换 Chrome', /20 秒内手机没收到/.test(t3) && /省电策略/.test(t3) && /手机没回应/.test(t3), t3);
	await page.screenshot({ path: path.join(__dirname, 'shots', 'push-03-none.png') });
	CL.mode = 'shown';
	// 本机弹一条
	await page.click('[data-pushlocal]'); await page.waitForTimeout(600);
	ok('「本机弹一条」直接在本机显示通知（不经过推送服务）', (await page.evaluate(() => window.__local && window.__local[0] && window.__local[0].t)) === '本机通知测试' && /本机弹了一条/.test(await page.textContent('#toast')));

	// 刷新后状态还在（重新从云端读）
	await page.reload(); await page.waitForTimeout(2500);
	ok('重开面板后仍显示已开启', (await page.textContent('#pushPill')) === '已开启');

	// 后台服务收到推送 → 系统通知（无头浏览器不能弹通知，这部分在 Node 里模拟后台服务环境来测）
	await swUnit();

	// 后台服务通知面板切页面（点通知时面板正开着）
	await page.evaluate(() => document.querySelector('#sidenav button[data-p="home"]').click()); await page.waitForTimeout(800);
	await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { go: 'wd' } })));
	await page.waitForTimeout(600);
	ok('点通知时面板开着：自动切到断线记录', (await page.textContent('#pageTitle')) === '断线记录');

	// 关闭
	await page.click('[data-pushoff]'); await page.waitForTimeout(1200);
	ok('关闭：云端删掉订阅、手机退订', CL.subs.length === 0 && (await page.evaluate(() => window.__unsub)) === 1);
	ok('卡片回到未开启', (await page.textContent('#pushPill')) === '未开启');

	// 权限被拒绝
	const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const p2 = await ctx2.newPage();
	await p2.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); Object.defineProperty(Notification, 'permission', { get: () => 'denied' }); });
	await p2.addInitScript(fakePush);
	await p2.goto(BASE + '?p=wd'); await p2.waitForTimeout(2500);
	ok('权限被拒绝时告诉怎么打开', /通知权限被关掉了/.test(await p2.textContent('#pushCard')));
	// 浏览器不支持
	const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const p3 = await ctx3.newPage();
	await p3.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); delete window.PushManager; });
	await p3.goto(BASE + '?p=wd'); await p3.waitForTimeout(2500);
	ok('不支持推送的浏览器给出提示，但微信推送照样能开', /不支持推送/.test(await p3.textContent('#pushCard')) && (await p3.locator('[data-wxin]').count()) === 1);

	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

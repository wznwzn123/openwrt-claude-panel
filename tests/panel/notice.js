// 4.0「通知」：顶栏铃铛 + 未读数、侧边栏「消息 → 通知」、通知页（分类、标新、点了去哪）、重要公告弹一次、App 新版本
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel')); const T = Date.now(), S = Math.round(T / 1000);
const R = []; const ok = (n, c, x) => R.push((c ? '✓ ' : '✗ ') + n + (c ? '' : '（' + x + '）'));
let SEEN = { t: T - 3 * 3600e3, pop: [] }, SEENCALLS = [], UPDNEW = true;
const ANN = [{ id: 'abcdefghij', title: '4.0 发布了', body: '面板里新加了「通知」：路由器的故障、公告、更新、反馈进度都在一个地方。\n第二行说明\n第三行说明', level: 'important', at: T - 3600e3, upd: T - 3600e3 },
	{ id: 'bcdefghijk', title: '今晚 2 点维护', body: '官网维护 10 分钟，家里上网不受影响。', level: 'normal', at: T - 2 * 864e5, upd: T - 2 * 864e5 }];
const EV = [{ t: S - 600, lvl: 'err', kind: 'clash', msg: 'OpenClash 停了，已自动重启', detail: '内存不够，被系统结束了', from: 0, to: 0 }, { t: S - 500, lvl: 'ok', kind: 'clash', msg: 'OpenClash 恢复正常', detail: '', from: 0, to: 0 },
	{ t: S - 5 * 3600, lvl: 'info', kind: 'newdev', msg: '新设备连上了：iPhone', detail: '192.168.1.23', from: 0, to: 0 }, { t: S - 864e5 / 1000 * 3, lvl: 'warn', kind: 'dns', msg: 'DNS 解析慢', detail: '', from: 0, to: 0 }];
const FB = [{ code: 'K7F2Q9AB', kind: '问题反馈', text: '节点页打不开', at: T - 2 * 864e5, state: 'fixed', stage: 3, ackAt: T - 1.5 * 864e5, done: 1, doneAt: T - 7200e3, reply: '修好了', updated: T - 7200e3, seen: T - 7200e3, history: [{ at: T - 7200e3, st: 'fixed', note: '修好了，升级到 4.0 就行' }] }];
const CLOUD = { now: T, s: { state: 'ok', since: T - 864e5, msg: '一切正常' }, label: { ok: '一切正常' }, r: { last: T - 30e3 }, t: null, probe: null,
	events: [{ t: T - 7 * 3600e3, lvl: 'err', kind: 'cloud', msg: '路由器断电或死机：平板还在报告', detail: '' }, { t: T - 6.5 * 3600e3, lvl: 'ok', kind: 'cloud', msg: '恢复正常（离线共 30 分钟）', detail: '' }],
	notes: [{ t: T - 864e5 - 3600e3, title: '✅ 托管服务已续期', body: '续了 90 天，到期时间 2027-02-12。', tag: 'svc', lvl: 'ok' }] };
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), a = body.params || {};
		let r;
		if (m === 'notices') r = { now: Math.round(Date.now() / 1000), app: a.app ? { version: '3.2.0', notes: 'App 修了一些问题', rel: new Date(T - 864e5).toISOString() } : null, ann: ANN, annAt: S, annFail: false, events: EV, fb: FB, hosted: true, seen: JSON.parse(JSON.stringify(SEEN)) };
		else if (m === 'notices_seen') { SEENCALLS.push(a); if (a.t) SEEN.t = Math.max(SEEN.t, a.t); if (a.pop) SEEN.pop.push(a.pop); r = { ok: true }; }
		else if (m === 'fb_replies') r = { list: FB, hosted: true };
		else if (m === 'update_check') r = UPDNEW ? { cur: '3.1.3', code: 'hosted-ai', latest: '4.0.0', notes: '新加了「通知」', rel: new Date(T - 1800e3).toISOString(), newer: true, force: false } : respond(m, a);
		else r = respond(m, a);
		res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: r })); }
	if (u.pathname === '/cloud/s') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(CLOUD)); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const overlap = (p, sel) => p.evaluate((sel) => {
	const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent && e.getBoundingClientRect().width);
	const bad = []; for (const e of els) { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1) bad.push('超出：' + (e.id || e.className || e.tagName) + ' ' + e.textContent.trim().slice(0, 8)); }
	for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { if (els[i].contains(els[j]) || els[j].contains(els[i])) continue; const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect(); if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) bad.push((els[i].id || els[i].className) + '×' + (els[j].id || els[j].className)); }
	return bad.join('；');
}, sel);
const OUT = path.join(__dirname, 'shots');
(async () => {
	await new Promise((r) => server.listen(8155, r)); const b = await chromium.launch();
	for (const dark of [false, true]) {
		SEEN = { t: T - 3 * 3600e3, pop: [] }; SEENCALLS = [];
		const sfx = dark ? '-dark' : '';
		const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light', userAgent: 'Mozilla/5.0 (Linux; Android 14; 23127PN0CC Build/UKQ1) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 RouterPanelApp/3.1.3' });
		const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
		await p.addInitScript(() => localStorage.setItem('rp_token', 'tok1234567890abcdefgh'));
		await p.clock.install();
		await p.goto('http://localhost:8155/panel/'); await p.clock.runFor(2000); await p.waitForTimeout(300);
		ok('顶栏有铃铛' + sfx, await p.isVisible('#bellBtn'));
		ok('顶栏：铃铛、标题、状态不重叠、不超出屏幕' + sfx, !(await overlap(p, '#topbar .brand > *, #bellBtn, #topbar .topcap, #jobPill')), await overlap(p, '#topbar .brand > *, #bellBtn, #topbar .topcap'));
		await p.clock.runFor(7000); await p.waitForTimeout(800);
		ok('打开 6 秒后：重要公告弹一次' + sfx, await p.isVisible('.modal[data-ann]') && /4\.0 发布了/.test(await p.textContent('.modal[data-ann]')), await p.isVisible('.modal'));
		ok('弹过的记下来（以后不再弹）', SEENCALLS.some((x) => x.pop === 'abcdefghij'));
		await p.screenshot({ path: path.join(OUT, 'nt-pop' + sfx + '.png') });
		await p.click('.modal[data-ann] [data-v="close"]'); await p.waitForTimeout(400);
		const badge = await p.textContent('#bellN');
		// 3 小时以内的：2 条路由器事件 + 公告 + 反馈修好 + 路由器新版本 + App 新版本 = 6
		ok('铃铛上的数字：3 小时内的新通知 5 条（App 新版本是昨天发的）', !(await p.isHidden('#bellN')) && badge === '5', badge);
		await p.screenshot({ path: path.join(OUT, 'nt-bell' + sfx + '.png'), clip: { x: 0, y: 0, width: 390, height: 80 } });
		await p.clock.runFor(70000); await p.waitForTimeout(500);
		ok('过一分钟再查：不会再弹同一条公告', !(await p.isVisible('.modal[data-ann]')));
		// 点铃铛进通知页
		await p.click('#bellBtn'); await p.waitForTimeout(1200);
		ok('点铃铛进「通知」页', await p.isVisible('#p-notice') && (await p.textContent('#pageTitle')) === '通知');
		ok('进来以后铃铛清零', await p.isHidden('#bellN'));
		ok('记下看到哪儿了（最新一条的时间）', SEENCALLS.some((x) => x.t >= T - 1800e3), JSON.stringify(SEENCALLS));
		const txt = await p.textContent('#p-notice');
		ok('路由器的事件、云端监测、托管服务、公告、更新、反馈、App 都在', ['OpenClash 停了', '路由器断电或死机', '托管服务已续期', '4.0 发布了', '今晚 2 点维护', '路由器面板有新版本 v4.0.0', '反馈 K7F2Q9AB：已修复', '安卓 App 有新版本 3.2.0'].every((s) => txt.includes(s)), txt.slice(0, 300));
		ok('按天分组：今天、昨天…', /今天/.test(txt) && /昨天/.test(txt));
		ok('新的标「新」：4 条（重要公告置顶在上面）', (await p.locator('#ntList .ntit.new').count()) === 4, await p.locator('#ntList .ntit.new').count());
		ok('重要公告置顶', /4\.0 发布了/.test(await p.textContent('#ntPin')) && /置顶/.test(await p.textContent('#ntPin')));
		ok('两个入口：实时联系开发者、我的反馈', /实时联系开发者/.test(await p.textContent('.ntent')) && /我的反馈/.test(await p.textContent('.ntent')) && /都处理好了/.test(await p.textContent('#ntFbSub')));
		ok('分类按钮带数量', /全部\d+/.test(await p.textContent('#ntChips')) && /公告2/.test(await p.textContent('#ntChips')) && /更新2/.test(await p.textContent('#ntChips')));
		ok('通知页排版不重叠、不超出' + sfx, !(await overlap(p, '#p-notice .hero > *, .ntent button, #ntChips .chip, .ntday, .ntpin, .ntit, .ntit > *, .ntm > *')), await overlap(p, '#p-notice .hero > *, .ntent button, #ntChips .chip, .ntday, .ntpin, .ntit, .ntit > *, .ntm > *'));
		ok('没有横向滚动' + sfx, (await p.evaluate(() => document.documentElement.scrollWidth)) <= 390);
		await p.screenshot({ path: path.join(OUT, 'nt-page' + sfx + '.png'), fullPage: true });
		// 筛选
		await p.click('[data-ntf="ann"]'); await p.waitForTimeout(200);
		ok('只看公告：置顶 1 条 + 列表 1 条', (await p.locator('#ntList .ntit').count()) === 1 && /4\.0 发布了/.test(await p.textContent('#ntPin')) && !(await p.textContent('#ntList')).includes('OpenClash'));
		// 公告点开看全文
		const a = p.locator('#ntPin .ntpin');
		const h0 = (await a.boundingBox()).height; await a.click(); await p.waitForTimeout(200);
		ok('点公告：展开看全文', (await a.getAttribute('class')).includes('open') && (await a.boundingBox()).height > h0);
		await p.screenshot({ path: path.join(OUT, 'nt-ann' + sfx + '.png') });
		await p.click('[data-ntf="sys"]'); await p.waitForTimeout(200);
		ok('只看系统：路由器 + 云端 + 托管服务', (await p.locator('#ntList .ntit').count()) === 7, await p.locator('#ntList .ntit').count());
		await p.locator('#ntList .ntit', { hasText: 'OpenClash 停了' }).click(); await p.waitForTimeout(800);
		ok('点路由器事件：去「断线记录」', await p.isVisible('#p-wd'));
		await p.click('#bellBtn'); await p.waitForTimeout(900);
		ok('再进来：刚才的不再标新', (await p.locator('#ntList .ntit.new').count()) === 0);
		await p.click('[data-ntf="fb"]'); await p.waitForTimeout(200);
		await p.locator('#ntList .ntit').first().click(); await p.waitForTimeout(1200);
		ok('点反馈进度：去「我的反馈」并展开那一条', await p.isVisible('#p-myfb') && await p.isVisible('[data-fbi="K7F2Q9AB"].hl, [data-fbi="K7F2Q9AB"]'));
		await p.click('#bellBtn'); await p.waitForTimeout(800); await p.click('[data-ntf="upd"]'); await p.waitForTimeout(200);
		await p.locator('#ntList .ntit', { hasText: '路由器面板有新版本' }).click(); await p.waitForTimeout(800);
		ok('点路由器新版本：打开更新窗口', await p.isVisible('.modal[data-upd]'));
		await p.click('.modal[data-upd] [data-v="close"]'); await p.waitForTimeout(400);
		await p.locator('#ntList .ntit', { hasText: '安卓 App 有新版本' }).click(); await p.waitForTimeout(300);
		ok('点 App 新版本：提示回 App 首页更新', /App 首页/.test(await p.textContent('#toast')));
		// 侧边栏
		await p.click('#menuBtn'); await p.waitForTimeout(500);
		const nav = await p.textContent('#sidenav');
		ok('侧边栏有「消息与帮助」分组：通知、实时联系开发者、我的反馈', /消息与帮助/.test(nav) && /通知/.test(nav) && /实时联系开发者/.test(nav) && /我的反馈/.test(nav));
		await p.screenshot({ path: path.join(OUT, 'nt-side' + sfx + '.png') });
		ok('页面没有报错' + sfx, !errs.length, errs.join(' | '));
		await c.close();
	}
	// 窄屏 320、宽屏 1280：顶栏不挤
	for (const w of [320, 360, 1280]) {
		const c = await b.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1 }); const p = await c.newPage();
		await p.addInitScript(() => localStorage.setItem('rp_token', 'tok1234567890abcdefgh'));
		await p.goto('http://localhost:8155/panel/?p=notice'); await p.waitForTimeout(2500);
		ok('宽 ' + w + '：顶栏不重叠、不超出', !(await overlap(p, '#topbar .brand > *, #bellBtn, #topbar .topcap')), await overlap(p, '#topbar .brand > *, #bellBtn, #topbar .topcap'));
		ok('宽 ' + w + '：通知页不重叠、没有横向滚动', !(await overlap(p, '#p-notice .hero > *, .ntent button, .ntpin, .ntit > *, .ntm > *')) && (await p.evaluate(() => document.documentElement.scrollWidth)) <= w, await overlap(p, '#p-notice .hero > *, .ntent button, .ntpin, .ntit > *, .ntm > *'));
		await p.screenshot({ path: path.join(OUT, 'nt-w' + w + '.png') });
		await c.close();
	}
	// 没有公告、没有新通知：铃铛不显示数字；不在 App 里：没有 App 那条
	SEEN = { t: T + 864e5, pop: ['abcdefghij'] }; UPDNEW = false;
	{ const c = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage(); await p.addInitScript(() => localStorage.setItem('rp_token', 'tok1234567890abcdefgh')); await p.clock.install();
		await p.goto('http://localhost:8155/panel/'); await p.clock.runFor(9000); await p.waitForTimeout(600);
		ok('都看过了：铃铛没有数字、不弹公告', await p.isHidden('#bellN') && !(await p.isVisible('.modal[data-ann]')));
		await p.click('#bellBtn'); await p.waitForTimeout(900);
		ok('不在 App 里打开：没有 App 新版本那条', !(await p.textContent('#ntList')).includes('安卓 App'));
		ok('都看过了：标「都看过了」', /都看过了/.test(await p.textContent('#ntPill')));
		await c.close(); }
	console.log(R.join('\n')); const pass = R.filter((x) => x.startsWith('✓')).length; console.log('\n通过 ' + pass + '/' + R.length);
	await b.close(); server.close();
})();

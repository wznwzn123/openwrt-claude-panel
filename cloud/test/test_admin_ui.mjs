// 4.0 新管理后台（真浏览器）：登录、每一页打得开没报错、各种屏幕不重叠不横向滚动、深浅色；
// 实时对话（收消息、回复、发图片、看图片）、反馈（看截图、标已修复）、公告、路由器、邀请码、续期码、登录记录、访问统计
// 用法：node test/test_admin_ui.mjs [--shots 目录]
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
const realFetch = globalThis.fetch;
let CFn = 0;
const MAILS = [];
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (u.hostname === 'api.cloudflare.com') { const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] })); if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 'tun' + ++CFn, token: 'tok' }); if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'dns' + ++CFn }); return R({}); }
	if (url === 'https://api.resend.com/emails') { MAILS.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); }
	if (u.hostname === 'localhost') return realFetch(input, init);
	if (u.hostname === 'api.github.com') return new Response(JSON.stringify({ tag_name: 'v4.0.0', assets: [{ name: 'router-panel.apk' }], body: '## 4.0\n- 通知', published_at: '2026-11-14T00:00:00Z' }));
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '', RESEND_API_KEY: 're', ADMIN_EMAIL: 'boss@x.com' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const hd = { ...req.headers, 'cf-connecting-ip': req.headers['x-ip'] || '127.0.0.1' };
	const r0 = new Request('http://localhost' + req.url, { method: req.method, headers: hd, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
	const r1 = Object.assign(r0, { cf: { country: 'TW', city: 'Taipei' } });
	const r = await mod.default.fetch(r1, env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
	res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8128, z));
const B = 'http://localhost:8128';
const api = async (path, body, hdr = {}, method) => (await realFetch(B + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const H = env.H.get('hub');
/* ---------- 准备数据 ---------- */
const inv = (await api('/api/admin/invites', { max: 5, svc: 7, note: '给朋友' }, ADM)).invite.code;
const R1 = await api('/api/register', { invite: inv, name: '客厅 Kwrt', model: 'JDCloud AX1800 Pro' });
const R2 = await api('/api/register', { invite: inv, name: 'OpenWrt', model: 'Xiaomi AX3000T' });
await api('/api/admin/renewals', { days: 90, count: 2, note: '阿明' }, ADM);
await api('/api/admin/ann', { title: '4.0 发布了', body: '面板里新加了「通知」和「实时联系开发者」。', level: 'important', days: 7 }, ADM);
await api('/api/admin/ann', { title: '今晚 2 点维护', body: '官网维护 10 分钟，家里上网不受影响。', level: 'normal' }, ADM);
const PNG = 'data:image/png;base64,' + (await import('fs')).readFileSync(new URL('./fixtures/shot.png', import.meta.url)).toString('base64');
await api('/api/chat', { sub: R1.sub, rkey: R1.rkey, op: 'send', text: '你好，节点页打不开了，点进去一直转圈', ver: '4.0.0', ua: 'Mozilla/5.0 (Linux; Android 14)' });
await api('/api/chat', { sub: R1.sub, rkey: R1.rkey, op: 'send', text: '截图在这', img: PNG });
const A = await api('/api/chat', { op: 'anon', name: 'OpenWrt-x86', model: 'x86/64' });
await api('/api/chat', { cid: A.cid, ckey: A.ckey, op: 'send', text: '自建版也能问吗？' + '很长的一句话'.repeat(12) });
await api('/api/dev/feedback', { sub: R1.sub, rkey: R1.rkey, text: '首页的流量图不动了', contact: '微信 ming', images: [PNG] });
const RP = await api('/api/report', { kind: 'install', text: '面板版本：3.1.3\n失败的步骤：安装依赖\n错误：opkg 崩溃', log: 'Segmentation fault\n'.repeat(30), email: 'ming@x.com' });
for (const [p, ip] of [['/', '1.2.3.4'], ['/', '1.2.3.4'], ['/app', '5.6.7.8'], ['/r', '9.9.9.9']]) await realFetch(B + p, { headers: { 'x-ip': ip } });
await realFetch(B + '/api/account/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ email: 'x@x.com', password: 'wrong-pass' }) });
await realFetch(B + '/api/admin/devices', { headers: { authorization: 'Bearer wrong-key-123456789' } });
ok('[准备] 安装失败上报成功', !!RP.code, JSON.stringify(RP));
await H.errLog('/api/test', 'TypeError: 模拟出错\n    at hub.js:1');
await H.mailLog('ming@x.com', '我们收到了你上报的安装问题', true, '');
/* ---------- 浏览器 ---------- */
const PAGES = ['dashboard', 'chat', 'feedback', 'ann', 'devices', 'users', 'applications', 'invites', 'renewals', 'visits', 'logins', 'oplog', 'mails', 'errors', 'settings'];
const DEV = {
	android: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 14; 23127PN0CC) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' },
	iphone: { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
	ipad: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
	windows: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120' },
	mac: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15' },
};
// 互相盖住的检查：同一层的卡片、按钮、文字块
const overlap = (p) => p.evaluate(() => {
	const sel = '.page-head > *, .bento-grid > *, .hub-stack > *, .todo-row > *, .hub-row > *, .hub-row-acts > *, .hub-tools > *, .hub-chips > *, .panel-head > *, .chat-wrap > *, .chat-head > *, .chat-in > *, .topbar > *, .hub-form > *';
	const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden');
	const bad = [];
	for (const e of els) { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1) bad.push('超出：' + (e.className || e.tagName).toString().slice(0, 30) + ' ' + (e.textContent || '').trim().slice(0, 8)); }
	for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
		const a = els[i], b = els[j]; if (a.contains(b) || b.contains(a) || a.parentElement !== b.parentElement) continue;
		const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
		if (x.left < y.right - 2 && y.left < x.right - 2 && x.top < y.bottom - 2 && y.top < x.bottom - 2) bad.push((a.className || a.tagName).toString().slice(0, 24) + '×' + (b.className || b.tagName).toString().slice(0, 24));
	}
	return [...new Set(bad)].slice(0, 6).join('；');
});
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const browser = await chromium.launch();
for (const [dn, dv] of Object.entries(DEV)) for (const dark of [false, true]) {
	if (process.env.ONLY && process.env.ONLY !== dn + (dark ? '-dark' : '')) continue;
	const sfx = ' [' + dn + (dark ? ' 深色' : '') + ']';
	const ctx = await browser.newContext({ ...dv, colorScheme: dark ? 'dark' : 'light', extraHTTPHeaders: { 'x-ip': '10.1.' + Object.keys(DEV).indexOf(dn) + '.' + (dark ? 2 : 1) } });
	const page = await ctx.newPage(); const errs = [], cons = [], ext = [];
	page.on('pageerror', (e) => errs.push(e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !/401|429|Failed to load resource/.test(m.text())) cons.push(m.text()); });
	page.on('request', (r) => { const u = new URL(r.url()); if (u.hostname !== 'localhost' && !u.protocol.startsWith('data') && !u.protocol.startsWith('blob')) ext.push(r.url()); });
	try {
	const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/adm-${n}-${dn}${dark ? '-dark' : ''}.png` }); };
	await page.goto(B + '/admin'); await W(1500);
	ok('打开后台：先到登录页' + sfx, page.url().includes('#/login') && await page.isVisible('input[type=password]'));
	await shot('login');
	await page.fill('input[type=password]', 'wrong-key-0000000000'); await page.click('button[type=submit]'); await W(800);
	ok('密钥不对：提示，不进去' + sfx, /密钥不对/.test(await page.textContent('body')) && page.url().includes('#/login'));
	await page.fill('input[type=password]', 'admin-key-1234567890'); await page.click('button[type=submit]'); await W(2500);
	ok('密钥对了：进工作台' + sfx, page.url().includes('#/dashboard') && /管理员/.test(await page.textContent('.page-title')));
	await W(800);
	await shot('dashboard');
	for (const pg of PAGES) {
		await page.goto(B + '/admin#/' + pg); await W(pg === 'visits' || pg === 'dashboard' ? 1600 : 1100);
		const o = await overlap(page), sw = await page.evaluate(() => document.documentElement.scrollWidth);
		ok(`「${pg}」打开了，排版不重叠、不超出、没有横向滚动` + sfx, !o && sw <= dv.viewport.width + 1 && !/页面不存在/.test(await page.textContent('.content')), o + ' 宽' + sw);
		if (pg !== 'dashboard') await shot(pg);
	}
	// 实时对话：打开对话 → 看到用户发的图片 → 回复文字和图片
	await page.goto(B + '/admin#/chat'); await W(1200);
	ok('对话列表：两个对话、未读数' + sfx, (await page.locator('.chat-th').count()) >= 2 && /客厅 Kwrt/.test(await page.textContent('.chat-threads')));
	await page.locator('.chat-th', { hasText: '客厅 Kwrt' }).click(); await W(1500);
	ok('打开对话：用户的文字和图片都在' + sfx, /一直转圈/.test(await page.textContent('.chat-msgs')) && (await page.locator('.chat-msgs img').count()) >= 1);
	ok('图片真的显示出来了（不是坏图）' + sfx, await page.evaluate(() => { const i = document.querySelector('.chat-msgs img'); return !!i && i.complete && i.naturalWidth > 0; }));
	ok('对话头部：路由器名、托管版、型号、版本' + sfx, /托管版/.test(await page.textContent('.chat-head')) && /JDCloud/.test(await page.textContent('.chat-head')) && /v4\.0\.0/.test(await page.textContent('.chat-head')));
	await shot('chat-open');
	const reply = '收到！先重启一下 OpenClash 试试 ' + dn + (dark ? 'd' : '');
	await page.fill('.chat-in textarea', reply);
	if (dv.isMobile) { await page.keyboard.press('Enter'); await W(300); ok('手机上回车是换行，不会误发' + sfx, (await page.inputValue('.chat-in textarea')).includes('\n')); await page.fill('.chat-in textarea', reply); await page.click('.chat-in button:has-text("发送")'); } else await page.keyboard.press('Enter');
	await W(1200);
	const um = await api('/api/chat', { sub: R1.sub, rkey: R1.rkey, op: 'get', after: 0 });
	ok('回复发出去了，用户那边拿得到' + sfx, um.msgs.some((m) => m.f === 'a' && m.x === reply), JSON.stringify(um.msgs.slice(-2)));
	await page.setInputFiles('.chat-in input[type=file]', { name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from(PNG.split(',')[1], 'base64') }); await W(800);
	ok('选了图片：预览' + sfx, await page.isVisible('.chat-pre img'), [...errs, ...cons].join(' | ') + ' ' + (await page.textContent('.toast-host, body')).slice(-200));
	if (await page.isEnabled('.chat-in button:has-text("发送")')) await page.click('.chat-in button:has-text("发送")'); await W(1500);
	const um2 = await api('/api/chat', { sub: R1.sub, rkey: R1.rkey, op: 'get', after: 0 });
	const last = um2.msgs[um2.msgs.length - 1];
	ok('开发者发的图片：用户那边能拿到原图' + sfx, last.f === 'a' && last.img && (await api('/api/chat', { sub: R1.sub, rkey: R1.rkey, op: 'img', seq: last.s })).data?.startsWith('data:image/jpeg'), JSON.stringify(last));
	// 用户再发一条：几秒内自动出现
	await api('/api/chat', { sub: R1.sub, rkey: R1.rkey, op: 'send', text: '好的谢谢 ' + dn });
	await W(4200);
	ok('用户的新消息几秒内自动出现（不用刷新）' + sfx, (await page.textContent('.chat-msgs')).includes('好的谢谢 ' + dn));
	await shot('chat-reply');
	// 反馈：截图显示、标已修复（发邮件）
	await page.goto(B + '/admin#/feedback'); await W(1500);
	await page.click('.hub-chip:has-text("全部")'); await W(800);
	ok('反馈：两条、截图显示出来' + sfx, (await page.locator('.hub-row').count()) >= 1 && await page.evaluate(() => [...document.querySelectorAll('.hub-imgs img')].some((i) => i.complete && i.naturalWidth > 0)));
	if (dn === 'windows' && !dark) {
		const row = page.locator('.hub-row', { hasText: '流量图' });
		await row.locator('button:has-text("已修复")').click(); await W(500);
		await page.fill('.ask-modal textarea', '已经修好了，更新到 4.0 就行'); await shot('fb-dialog');
		await page.click('.modal-foot button:has-text("标为已修复")'); await W(1200);
		const fl = (await api('/api/admin/feedback', null, ADM)).list.find((x) => /流量图/.test(x.text));
		ok('反馈：标为已修复，说明存下来了' + sfx, fl.done && fl.acts[0].note === '已经修好了，更新到 4.0 就行');
		// 安装日志
		await shot('fb-all');
		await page.locator('.hub-row', { hasText: '安装依赖' }).locator('button:has-text("安装日志")').click(); await W(800);
		ok('反馈：安装日志能打开' + sfx, /Segmentation fault/.test(await page.textContent('.modal')));
		await page.click('.modal-foot button:has-text("关闭")'); await W(300);
		// 公告：发一条
		await page.goto(B + '/admin#/ann'); await W(1000);
		await page.fill('.ann-form input', '测试公告'); await page.click('.ann-form button:has-text("发布公告")'); await W(1000);
		ok('公告：发布成功，公开接口拿得到' + sfx, (await api('/api/notices')).list.some((x) => x.title === '测试公告'));
		// 路由器：备注
		await page.goto(B + '/admin#/devices'); await W(1200);
		await page.locator('.hub-row', { hasText: '客厅 Kwrt' }).locator('button:has-text("备注")').click(); await W(500);
		await page.fill('.ask-modal textarea', '阿明家，微信 ming'); await page.click('.modal-foot button:has-text("保存")'); await W(1000);
		ok('路由器：备注保存了' + sfx, /阿明家/.test(await page.textContent('.hub-list')));
		// 路由器：删除要输入编号
		await page.locator('.hub-row', { hasText: 'OpenWrt' }).locator('button:has-text("删除")').click(); await W(500);
		ok('删除路由器：不输编号不能点' + sfx, await page.isDisabled('.modal-foot button:has-text("放进回收站")'));
		await page.fill('.ask-modal input', R2.sub); await W(200);
		await page.click('.modal-foot button:has-text("放进回收站")'); await W(1200);
		ok('删除路由器：进了回收站' + sfx, (await api('/api/admin/devices', null, ADM)).list.find((d) => d.sub === R2.sub).offWhy === 'deleted');
		// 邀请码
		await page.goto(B + '/admin#/invites'); await W(1000);
		const n0 = (await api('/api/admin/invites', null, ADM)).list.length;
		await page.click('button:has-text("生成邀请码")'); await W(1000);
		ok('邀请码：生成了' + sfx, (await api('/api/admin/invites', null, ADM)).list.length === n0 + 1);
		// 登录记录：有管理后台密钥错的记录（带 IP）
		await page.goto(B + '/admin#/logins'); await W(1000);
		ok('登录记录：账号登录失败、管理后台密钥错都在' + sfx, /没有这个账号/.test(await page.textContent('.content')) && /密钥不对/.test(await page.textContent('.content')));
		// 访问统计
		await page.goto(B + '/admin#/visits'); await W(1500);
		ok('访问统计：首页、账号页、查进度都有次数，有访客 IP' + sfx, /首页/.test(await page.textContent('.content')) && /账号页/.test(await page.textContent('.content')) && (await page.locator('.content td .mono').count()) >= 1);
		// 命令面板
		await page.keyboard.press('Control+k'); await W(500);
		await page.keyboard.type('邮件'); await W(300); await page.keyboard.press('Enter'); await W(800);
		ok('Ctrl+K 搜页面：跳到邮件记录' + sfx, page.url().includes('#/mails'));
	}
	// 手机上：侧边栏打开、点菜单跳转
	if (dv.isMobile && dv.viewport.width < 800) {
		await page.goto(B + '/admin#/dashboard'); await W(1000);
		await page.click('.topbar [aria-label="切换导航"]'); await W(600);
		await shot('rail');
		await page.click('.nav-item:has-text("问题反馈")'); await W(1000);
		ok('手机：打开菜单点「问题反馈」能跳过去' + sfx, page.url().includes('#/feedback'));
	}
	// 未读提醒：侧边栏和顶栏
	await api('/api/chat', { cid: A.cid, ckey: A.ckey, op: 'send', text: '新消息 ' + dn });
	await page.goto(B + '/admin#/dashboard'); await W(1800);
	ok('有没看的对话：顶栏显示数字' + sfx, await page.isVisible('.top-badge'));
	ok('没有加载任何外部网站的东西' + sfx, !ext.length, ext.join(' '));
	ok('页面没有报错' + sfx, !errs.length && !cons.length, [...errs, ...cons].join(' | ').slice(0, 300));
	// 退出
	await page.goto(B + '/admin#/settings'); await W(800);
	await page.click('button:has-text("退出")'); await W(400); await page.click('.modal-foot button:has-text("退出")'); await W(800);
	ok('退出以后回到登录页、再打开要重新输密钥' + sfx, page.url().includes('#/login'));
	} catch (e) { ok('测试中途出错' + sfx, false, e.message.split('\n').slice(0, 3).join(' ') + ' | ' + [...errs, ...cons].join(' | ')); }
	await ctx.close();
}
await browser.close(); server.close();
console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (!c && note ? '（' + String(note).slice(0, 300) + '）' : '')).join('\n'));
const pass = results.filter((r) => r[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

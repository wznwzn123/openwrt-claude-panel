// 5.0 管理后台新功能（真浏览器，iPhone 和 Mac）：对话筛选和已解决、公告定时和预览、设置里的对话提醒、两步验证（含旧版管理页）、数据备份和恢复
// 用法：node test/test_admin_v5_ui.mjs [--shots 目录]
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
await new Promise((z) => server.listen(8139, z));
const B = 'http://localhost:8139';
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
for (const [p, ip] of [['/', '1.2.3.4'], ['/', '1.2.3.4'], ['/app', '5.6.7.8'], ['/privacy', '2001:b011:7c05:1a2b:3c4d:5e6f:7a8b:9c0d'], ['/r', '9.9.9.9']]) await realFetch(B + p, { headers: { 'x-ip': ip } });
await realFetch(B + '/api/account/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ email: 'x@x.com', password: 'wrong-pass' }) });
await realFetch(B + '/api/admin/devices', { headers: { authorization: 'Bearer wrong-key-123456789' } });
ok('[准备] 安装失败上报成功', !!RP.code, JSON.stringify(RP));
await H.errLog('/api/test', 'TypeError: 模拟出错\n    at hub.js:1');
await H.mailLog('ming@x.com', '我们收到了你上报的安装问题', true, '');
/* ---------- 5.0 管理后台新功能（真浏览器）：对话筛选和已解决、公告定时和预览、对话提醒设置、两步验证、数据备份 ---------- */
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const browser = await chromium.launch();
const DEV = {
	iphone: { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
	mac: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15' },
};
let n = 0;
for (const [dn, dv] of Object.entries(DEV)) {
	const tag = ` [${dn}]`;
	const ctx = await browser.newContext({ ...dv, extraHTTPHeaders: { 'x-ip': '10.7.' + (n++) + '.1' } });
	const page = await ctx.newPage(); const errs = [];
	page.on('pageerror', (e) => errs.push(e.message));
	const shot = async (nm) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/v5-${nm}-${dn}.png` }); };
	await page.goto(B + '/admin'); await W(1200);
	await page.fill('input[type=password]', 'admin-key-1234567890'); await page.click('button[type=submit]'); await W(2200);
	ok('登录' + tag, page.url().includes('#/dashboard'));
	// 对话：筛选、已解决
	await page.goto(B + '/admin#/chat'); await W(1500);
	ok('对话：有「全部 / 等我回复 / 已解决」筛选' + tag, /等我回复/.test(await page.textContent('.chat-filter')));
	await page.locator('.chat-th', { hasText: '客厅 Kwrt' }).click(); await W(1400);
	await shot('chat-open');
	const bs = await page.$$eval('.chat-head button', (l) => l.map((b) => ({ t: b.textContent.trim(), a: b.getAttribute('aria-label'), v: !!b.offsetParent })));
	const reo = page.locator(dv.isMobile ? '.chat-head button[aria-label="重新打开"]' : '.chat-head button.act-txt:has-text("重新打开")');
	if (await reo.count()) { await reo.click(); await W(1200); }
	const doneBtn = page.locator(dv.isMobile ? '.chat-head button[aria-label="标为已解决"]' : '.chat-head button.act-txt:has-text("已解决")');
	await doneBtn.click({ timeout: 5000 }).catch((e) => ok('对话：找到「已解决」按钮' + tag, false, JSON.stringify(bs))); await W(1200);
	await page.goto(B + '/admin#/chat'); await W(1200);
	await page.locator('.chat-filter button', { hasText: '已解决' }).click(); await W(500);
	ok('对话：标为已解决后，在「已解决」里，带「已解决」标签' + tag, (await page.locator('.chat-th').count()) === 1 && /已解决/.test(await page.textContent('.chat-threads')), await page.textContent('.chat-threads'));
	await page.locator('.chat-filter button', { hasText: '等我回复' }).click(); await W(500);
	ok('对话：「等我回复」里没有它了' + tag, !(/客厅 Kwrt/.test(await page.textContent('.chat-threads'))));
	await shot('chat');
	// 公告：定时、预览
	await page.goto(B + '/admin#/ann'); await W(1300);
	await page.fill('.ann-form input[placeholder^="比如"]', '周末维护通知');
	await page.locator('.ann-form textarea').fill('周六凌晨 2 点维护十分钟');
	ok('公告：边写边预览面板里的样子' + tag, /周末维护通知/.test(await page.textContent('.ann-pv')) && /周六凌晨/.test(await page.textContent('.ann-pv')));
	await page.locator('.ann-form .segmented button', { hasText: '定时' }).click(); await W(300);
	const later = new Date(Date.now() + 26 * 3600e3 - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
	await page.fill('.ann-dt', later);
	await shot('ann-form');
	await page.locator('.ann-form button', { hasText: '发布公告' }).click(); await W(1500);
	ok('公告：定时发布的，列表里写着「定时 · 什么时候发布」' + tag, /定时 ·/.test(await page.textContent('.hub-stack')) && /还没到时间/.test(await page.textContent('.hub-stack')), (await page.textContent('.hub-stack')).slice(0, 300));
	const pub = await (await realFetch(B + '/api/notices')).json();
	ok('公告：定时的还没出现在面板的公告里' + tag, !pub.list.some((a) => a.title === '周末维护通知'), JSON.stringify(pub.list.map((a) => a.title)));
	ok('公告：已经发出的显示收到和点开的台数' + tag, /台路由器收到/.test(await page.textContent('.hub-stack')));
	// 设置：对话提醒、两步验证、数据备份
	await page.goto(B + '/admin#/settings'); await W(1600);
	const st = await page.textContent('.page');
	ok('设置：有「对话提醒」「两步验证」「数据备份」' + tag, /对话提醒/.test(st) && /你不在线时自动回复/.test(st) && /两步验证/.test(st) && /数据备份/.test(st), st.slice(0, 200));
	await shot('settings');
	// 数据备份：现在备份一份 → 恢复
	await page.locator('button', { hasText: '现在备份一份' }).click(); await W(1500);
	const bid = (await page.locator('.mono').filter({ hasText: /^\d{12}$/ }).first().textContent()).trim();
	ok('备份：点一下就备份好，列表里有编号和大小' + tag, /^\d{12}$/.test(bid) && /项数据/.test(await page.textContent('.page')));
	await page.locator('button', { hasText: '恢复到这一份' }).first().click(); await W(600);
	const dlg = page.locator('.ask-dialog, [role=dialog]').last();
	ok('备份：恢复要输入编号确认，说清楚后果' + tag, /会变回/.test(await dlg.textContent()));
	await dlg.locator('input').last().fill(bid); await W(200);
	await dlg.locator('button', { hasText: '恢复' }).last().click(); await W(2000);
	ok('备份：恢复成功' + tag, /恢复好了/.test(await page.textContent('body')), (await page.textContent('body')).slice(-200));
	// 两步验证（只在一台设备上开，开完再关）
	if (dn === 'mac') {
		await page.goto(B + '/admin#/settings'); await W(1400);
		await page.locator('button', { hasText: '开启两步验证' }).click(); await W(1000);
		const secret = (await page.textContent('.tfa-secret code')).replace(/\s/g, '');
		ok('两步验证：显示二维码和密钥' + tag, await page.isVisible('.tfa-qr') && /^[A-Z2-7]{32}$/.test(secret), secret);
		await shot('2fa-setup');
		await page.locator('.tfa-steps input').fill('000000'); await page.locator('button', { hasText: '确认开启' }).click(); await W(800);
		ok('两步验证：验证码错了不开' + tag, await page.isVisible('.tfa-qr'));
		await page.locator('.tfa-steps input').fill(await mod.totp(secret)); await page.locator('button', { hasText: '确认开启' }).click(); await W(1500);
		ok('两步验证：开了，这台浏览器不用马上重新登录' + tag, /已开启/.test(await page.textContent('.page')) && !page.url().includes('login'));
		await page.goto(B + '/admin#/devices'); await W(1300);
		ok('两步验证：开了以后这台浏览器照常用' + tag, page.url().includes('#/devices') && !(/重新登录/.test(await page.textContent('body'))));
		// 新开一个浏览器：要验证码
		const c2 = await browser.newContext({ ...dv, extraHTTPHeaders: { 'x-ip': '10.7.99.1' } }), p2 = await c2.newPage();
		await p2.goto(B + '/admin'); await W(1000);
		await p2.fill('input[type=password]', 'admin-key-1234567890'); await p2.click('button[type=submit]'); await W(1200);
		ok('两步验证：别的浏览器登录，密钥对了还要验证码' + tag, await p2.isVisible('.code-field input') && p2.url().includes('login'));
		if (SHOTS) await p2.screenshot({ path: `${SHOTS}/v5-login-2fa-${dn}.png` });
		await p2.fill('.code-field input', await mod.totp(secret)); await p2.click('button[type=submit]'); await W(2200);
		ok('两步验证：输对验证码就进去了' + tag, p2.url().includes('#/dashboard'), p2.url());
		await c2.close();
		// 旧版管理页也能用（会问验证码）
		const c3 = await browser.newContext({ ...dv, extraHTTPHeaders: { 'x-ip': '10.7.98.1' } }), p3 = await c3.newPage();
		p3.on('dialog', async (d) => d.accept(await mod.totp(secret)));
		await p3.goto(B + '/admin/old'); await W(800);
		await p3.fill('#fKey input[name=k]', 'admin-key-1234567890'); await p3.locator('#fKey button').click(); await W(2500);
		ok('两步验证：旧版管理页会问验证码，输对了能用' + tag, await p3.isVisible('#vMain'), (await p3.textContent('body')).slice(0, 200));
		await c3.close();
		// 关掉
		await page.goto(B + '/admin#/settings'); await W(1400);
		await page.locator('.tfa-setup ~ * button, button', { hasText: /^关闭$/ }).first().click(); await W(500);
		const d2 = page.locator('.ask-dialog, [role=dialog]').last();
		await d2.locator('input').last().fill(await mod.totp(secret)); await d2.locator('button', { hasText: '关闭' }).last().click(); await W(1500);
		ok('两步验证：输验证码关掉' + tag, /没开（默认）/.test(await page.textContent('.page')));
	}
	ok('没有脚本报错' + tag, !errs.length, errs.join(' | '));
	await ctx.close();
}
await browser.close(); server.close();
const fail = results.filter((r) => !r[1]);
for (const [nm, c, note] of results) console.log((c ? '  ✓ ' : '  ✗ ') + nm + (note && !c ? '（' + String(note).slice(0, 300) + '）' : ''));
console.log(`通过 ${results.length - fail.length}/${results.length}`);
process.exit(fail.length ? 1 : 0);

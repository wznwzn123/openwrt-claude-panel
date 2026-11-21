// 5.2 我的主页：顶栏和侧边栏显示官网账号的头像和名字，点开是「我的主页」整页（托管服务、这台路由器、家人、敏感信息要验证码、操作记录、我的反馈）；实时对话两边显示头像和名字
// 5.2.2：一次拿全（先显示上次的）；验证码框去邮箱复制再回来、刷新都不丢，输满 6 位自动确认；能打开面板的手机挪进敏感信息，官网的密码和设备去官网账号设置
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
// 1×1 的 png 头像
const AV = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
let hosted = true, accs = [{ uid: 'abcdefghijk2', email: 'al***@x.com', name: '小明', avatar: AV, at: Date.now() - 864e5 }, { uid: 'bcdefghijk23', email: 'bo***@y.com', name: '', avatar: '', at: 2 }];
let dev = { name: '王开发', avatar: '' }, me = { name: '小明', avatar: AV };
const calls = [];
let ROLE = 'owner', EMERG = false, DELAY = 0;
const DEVS0 = () => ({ abcd1234: { name: '安卓手机 · Edge', at: Math.floor(Date.now() / 1000) - 3600, via: '官网账号 xi***@qq.com' }, app00001: { name: '安卓手机 23127PN0CC · App', at: Math.floor(Date.now() / 1000) - 86400, via: '官网账号 xi***@qq.com' }, old00001: { name: '旧手机 · Chrome', at: Math.floor(Date.now() / 1000) - 9 * 86400, via: '账号 xi***@qq.com' } });
let DEVS = DEVS0();
const F = { name: '小明', avatar: AV, subs: [{ uid: 'sub000000002', name: '爸爸', email: 'ba***@x.com', avatar: '', perms: ['msg', 'node', 'speed'], exp: 0, off: false, at: Date.now() - 3 * 864e5 }], joins: [], sudo: '', sessOut: 0 };
const LOG = [{ t: Date.now() - 3600e3, ic: '👋', x: '爸爸 用加入码成为子账号（家人）' }, { t: Date.now() - 86400e3, ic: '🔗', x: '绑定到 小明 的账号，他是主账号' }, { t: Date.now() - 2 * 86400e3, ic: '✨', x: '开通托管服务（7 天）' }];
for (let i = 0; i < 6; i++) LOG.push({ t: Date.now() - (3 + i) * 86400e3, ic: '🔧', x: '主账号把 爸爸 的权限改成「家人」' });
function famOp(a) {
	const main = ROLE === 'owner';
	const needSudo = ['secret', 'sess_out', 'join_create', 'join_cancel', 'sub_set', 'sub_remove', 'transfer'];
	if (needSudo.includes(a.op) && (!a.sudo || a.sudo !== F.sudo)) return { error: '要先确认是你本人（邮箱验证码）' };
	switch (a.op) {
		case 'me': return { ok: true, me: { uid: 'abcdefghijk2', name: F.name, email: 'xi***@qq.com', avatar: F.avatar, created: Date.now() - 5 * 864e5 }, role: main ? 'main' : 'sub', perms: main ? ['msg', 'node', 'speed', 'parent', 'proxy', 'net', 'sys'] : ['msg', 'node', 'speed'], subExp: 0, router: { name: '客厅 Kwrt', model: 'Xiaomi AX3000T', created: Date.now() - 5 * 864e5, exp: Date.now() + 7 * 864e5 } };
		case 'members': return main ? { ok: true, owner: { uid: 'abcdefghijk2', name: F.name, email: 'xi***@qq.com', avatar: F.avatar }, subs: F.subs, joins: F.joins } : { ok: true, owner: { uid: 'own000000002', name: '妈妈', email: 'ma***@qq.com', avatar: '' }, subs: [], joins: [] };
		case 'log': return { ok: true, list: LOG };
		case 'profile': if (a.name !== undefined) F.name = a.name; if (a.avatar !== undefined) F.avatar = a.avatar; return { ok: true };
		case 'sudo_code': return { ok: true, mail: 'xi***@qq.com' };
		case 'sudo': if (a.code !== '123456') return { error: '验证码不对' }; F.sudo = 'sudotokensudotokensudotok'; return { ok: true, sudo: F.sudo, exp: Date.now() + 600e3, ...(a.want === 'secret' ? { secret: famOp({ op: 'secret', sudo: F.sudo }) } : {}) };
		case 'page': return { ok: true, me: famOp({ op: 'me' }), members: famOp({ op: 'members' }), log: LOG, secret: a.sudo && a.sudo === F.sudo ? famOp({ op: 'secret', sudo: a.sudo }) : null };
		case 'secret': return { ok: true, email: 'xiaoming2026@qq.com', verified: true, sessions: F.sessOut ? [] : [{ id: 's1', ua: '安卓手机 · Edge', place: '台北', at: Date.now() - 864e5, last: Date.now() - 3600e3 }, { id: 's2', ua: 'Windows 电脑 · Chrome', place: '台北', at: Date.now() - 2 * 864e5, last: Date.now() - 7200e3 }], logins: [{ t: Date.now() - 864e5, k: 'user', ok: true, why: '登录成功', place: '台北', ua: '安卓手机' }, { t: Date.now() - 864e5 - 60e3, k: 'user', ok: false, why: '密码错了', place: '台北', ua: '安卓手机' }, { t: Date.now() - 5 * 864e5, k: 'reg', ok: true, why: '注册', place: '台北', ua: 'Windows 电脑' }] };
		case 'sess_out': F.sessOut++; return { ok: true };
		case 'join_create': F.joins.push({ code: 'ABCD2345', name: a.name, perms: a.perms, exp: Date.now() + 864e5 }); F.lastJoin = a; return { ok: true, code: 'ABCD2345', exp: Date.now() + 864e5, link: 'https://panel.example/app?join=ABCD2345' };
		case 'join_cancel': F.joins = F.joins.filter((j) => j.code !== a.code); return { ok: true };
		case 'sub_set': { const x = F.subs.find((y) => y.uid === a.target); if (a.perms) x.perms = a.perms; if (a.off !== undefined) x.off = a.off; return { ok: true }; }
		case 'sub_remove': F.subs = F.subs.filter((y) => y.uid !== a.target); return { ok: true };
		case 'leave': F.left = 1; return { ok: true };
	}
	return { error: '不支持' };
}
const now = Date.now();
const LSU = 'l'.repeat(24); // 路由器后台密码换来的凭证
const msgs = [{ s: 1, f: 'u', t: now - 600e3, x: '节点页打不开了' }, { s: 2, f: 'u', t: now - 590e3, x: '一直转圈' }, { s: 3, f: 'a', t: now - 300e3, x: '你好，我看一下' }, { s: 4, f: 'a', t: now - 290e3, x: '先刷新试试' }];
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''); calls.push({ m, p: body.params }); res.writeHead(200, { 'content-type': 'application/json' });
		let result;
		if (m === 'svc_info') result = hosted ? { hosted: true, hub: 'https://panel.example', exp: Date.now() + 7 * 864e5 - 3600e3, off: false } : { hosted: false };
		else if (m === 'cloud_info') result = hosted ? { enabled: true, url: 'https://ab3cd4ef.panel.example/cloud', tablet: true, pkey: 'p'.repeat(32), hosted: true, hub: 'https://panel.example' } : { enabled: false };
		else if (m === 'hub_accounts') result = accs;
		// 6.0 第 63 项：登录着的手机要带着确认本人的凭证才给（邮箱验证码的，或者路由器后台密码换的）
		else if (['device_list', 'device_remove', 'ckey_info', 'tablet_url', 'rotate_key'].includes(m) && !body.params.self && !(body.params.sudo && (body.params.sudo === F.sudo || body.params.sudo === LSU))) return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: '要先确认是你本人：在「我的主页 → 敏感信息」里验证' } }));
		else if (m === 'sudo_local') { if (body.params.pw !== 'rootpw') return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: '密码不对（还能再试 4 次）' } })); result = { sudo: LSU, exp: Date.now() + 600e3 }; }
		else if (m === 'ckey_info') result = { ai: true, url: 'https://r.example/cgi-bin/mcp/' + 'c'.repeat(40), hosted };
		else if (m === 'tablet_url') result = { url: 'https://ab3cd4ef.panel.example/cloud/beat/t/' + 't'.repeat(32) };
		else if (m === 'device_list') result = { hosted, list: Object.entries(DEVS).map(([id, d]) => ({ id, name: d.name, at: d.at, via: d.via, seen: id === 'app00001' ? Math.floor(Date.now() / 1000) - 8 * 3600 : null, me: id === 'abcd1234' })) };
		else if (m === 'device_remove') { if (body.params.all_others) { for (const k of Object.keys(DEVS)) if (k !== 'abcd1234') delete DEVS[k]; } else delete DEVS[body.params.id]; result = { ok: true }; }
		else if (m === 'whoami') result = { hosted, hub: 'https://panel.example', emerg: EMERG, role: ROLE, perms: ROLE === 'sub' ? ['msg', 'node', 'speed'] : ['msg', 'node', 'speed', 'parent', 'proxy', 'net', 'sys'], uid: 'abcdefghijk2' };
		else if (m === 'fam') { const r = famOp(body.params); if (DELAY && body.params.op === 'page') { setTimeout(() => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: r })), DELAY); return; } if (r.error) return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: r.error } })); result = r; }
		else if (m === 'chat') result = body.params.op === 'get' ? { ok: true, msgs: body.params.after ? [] : msgs, seq: 4, uu: 0, hosted: true, ...(body.params.after ? {} : { dev, me }) } : { ok: true, s: 5, t: Date.now() };
		else result = respond(m, body.params || {});
		return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = path.join(__dirname, 'shots');
// 顶栏里的按钮互相不重叠、不超出屏幕
const topLay = (page) => page.evaluate(() => { const bar = document.querySelector('.top, header, #top') || document.body; const els = [...document.querySelectorAll('#meBtn, #meBtn ~ *, .topbar button, header button')].filter((e) => e.offsetParent && e.getBoundingClientRect().top < 80); const rs = els.map((e) => e.getBoundingClientRect()); const bad = []; rs.forEach((a, i) => { if (a.right > innerWidth + 1 || a.left < -1) bad.push('超出：' + (els[i].id || els[i].className)); rs.forEach((c, j) => { if (j > i && a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1 && !els[i].contains(els[j]) && !els[j].contains(els[i])) bad.push('重叠：' + (els[i].id || els[i].className) + ' / ' + (els[j].id || els[j].className)); }); }); return bad.join('；'); });
(async () => {
	await new Promise((r) => server.listen(8181, r));
	const browser = await chromium.launch();
	for (const [dn, w, h] of [['iPhone SE', 320, 568], ['安卓', 390, 844], ['电脑', 1280, 800]]) {
		const T = '［' + dn + '］';
		hosted = true; ROLE = 'owner'; EMERG = false; DELAY = 0; DEVS = DEVS0(); F.sudo = ''; F.sessOut = 0; F.joins = []; F.name = '小明'; F.avatar = AV;
		F.subs = [{ uid: 'sub000000002', name: '爸爸', email: 'ba***@x.com', avatar: '', perms: ['msg', 'node', 'speed'], exp: 0, off: false, at: Date.now() - 3 * 864e5 }];
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 });
		await ctx.route('https://panel.example/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '官网' }));
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890abc'); localStorage.setItem('rp_dev', 'abcd1234.' + 'x'.repeat(32)); });
		await page.goto('http://localhost:8181/panel/'); await W(2000);
		// 第 76 项：顶栏不再放头像，手机上从菜单（侧边栏）进我的主页
		const btn = '#sideMe', openMe = async (pg) => { if (w < 900) { await pg.click('#menuBtn'); await W(500); } await pg.click(btn); };
		ok('顶栏没有头像按钮' + T, (await page.locator('#meBtn').count()) === 0);
		if (w < 900) { await page.click('#menuBtn'); await W(500); }
		ok('托管版：侧边栏显示我的头像按钮' + T, await page.isVisible(btn));
		ok('头像是官网账号的头像（图片）' + T, /data:image\/png/.test(await page.evaluate((s) => getComputedStyle(document.querySelector(s + ' .av')).backgroundImage, btn)));
		if (w >= 900) ok('侧边栏显示名字' + T, (await page.textContent('#sideMeName')) === '小明');
		ok('顶栏不重叠、不超出' + T, (await topLay(page)) === '', await topLay(page));
		const c0 = calls.length;
		await page.click(btn); await W(1500);
		const t = await page.textContent('#meBox');
		const fc0 = calls.slice(c0).filter((c) => c.m === 'fam').map((c) => c.p.op);
		ok('打开我的主页：只问一次（page），不再一个接一个问 me / members / log' + T, fc0.join() === 'page', fc0.join());
		ok('点开是「我的主页」整页：头像、名字、打码邮箱、主账号' + T, (await page.textContent('#pageTitle')) === '我的主页' && /小明/.test(t) && /xi\*\*\*@qq\.com/.test(t) && /主账号/.test(t), t.slice(0, 200));
		ok('有托管服务、这台路由器、家人、敏感信息、操作记录、我的反馈' + T, ['托管服务', '这台路由器', '家人', '敏感信息', '操作记录', '我的反馈'].every((x) => t.includes(x)));
		ok('托管服务：到期时间、专属网址、输入续期码' + T, /还剩 7 天/.test(t) && /localhost:8181/.test(t) && await page.isVisible('[data-mp="renew"]'));
		ok('家人：列出爸爸（家人权限），能管理、添加、转让' + T, /爸爸/.test(t) && /家人/.test(t) && await page.isVisible('[data-mp="sub"]') && await page.isVisible('[data-mp="join"]') && await page.isVisible('[data-mp="transfer"]'));
		ok('敏感信息默认锁着，看不到完整邮箱，有「发验证码」' + T, !/xiaoming2026/.test(t) && await page.isVisible('#meBox [data-cwrap] [data-send]') && /发验证码到 xi\*\*\*@qq\.com/.test(t));
		ok('锁着时说清楚里面有：能打开这个面板的手机' + T, /哪些手机能打开这个面板/.test(t));
		ok('操作记录：先显示 6 条，有「看更多」' + T, (await page.locator('#meBox .mp-tl li').count()) === 6 && await page.isVisible('[data-mp="logall"]'));
		ok('整页不横向滚动' + T, (await page.evaluate(() => document.documentElement.scrollWidth)) <= w, String(await page.evaluate(() => document.documentElement.scrollWidth)));
		await page.screenshot({ path: path.join(SHOT, `me-page-${w}.png`), fullPage: true });
		// 改名字（不用验证码）
		await page.click('[data-mp="name"]'); await W(400); await page.fill('.modal input', '小明同学'); await page.click('.modal [data-ok]'); await W(900);
		ok('改名字：不用验证码，顶部和侧边栏跟着变' + T, F.name === '小明同学' && /小明同学/.test(await page.textContent('.mp-name')) && (await page.textContent('#sideMeName')) === '小明同学');
		// 换头像
		const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-mp="av"]')]);
		await fc.setFiles(path.join(__dirname, '..', '..', 'cloud', 'test', 'fixtures', 'shot.png')); await W(1500);
		ok('换头像：裁小压缩后上传（不用验证码）' + T, /^data:image\/(webp|jpeg);base64,/.test(F.avatar) && F.avatar.length < 60000, F.avatar.slice(0, 30));
		// 敏感信息：发验证码 → 输错（输满 6 位自动核对）→ 去邮箱复制验证码再回来（自动刷新）→ 关掉重开 → 输对
		const sc0 = calls.filter((c) => c.m === 'fam' && c.p.op === 'sudo_code').length;
		await page.click('#meBox [data-cwrap] [data-send]'); await W(700);
		ok('点「发验证码」：出现输验证码的框，说发到哪了' + T, await page.isVisible('#meBox [data-code]') && /验证码发到了 xi\*\*\*@qq\.com/.test(await page.textContent('#meBox [data-cwrap]')));
		ok('「重新发」按钮 1 分钟内不能点，显示还要等几秒' + T, await page.isDisabled('#meBox [data-resend]') && /秒后/.test(await page.textContent('#meBox [data-resend]')));
		await page.fill('#meBox [data-code]', '000000'); await W(900);
		ok('输满 6 位自动核对；验证码错了：还锁着，输入框还在' + T, calls.some((c) => c.m === 'fam' && c.p.op === 'sudo' && c.p.code === '000000') && !/xiaoming2026/.test(await page.textContent('#meBox')) && await page.isVisible('#meBox [data-code]'));
		await page.fill('#meBox [data-code]', '12'); await page.evaluate(() => { document.querySelector('#meBox [data-code]').dataset.keep = '1'; });
		const c1 = calls.length;
		await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await W(1200);
		ok('去邮箱复制验证码再回来（页面自动刷新）：输入框还在，输了一半的还在，没被重画' + T, calls.slice(c1).some((c) => c.m === 'fam' && c.p.op === 'page') && (await page.evaluate(() => { const i = document.querySelector('#meBox [data-code]'); return !!i && i.dataset.keep === '1' && i.value === '12'; })));
		await page.reload(); await W(1800); if ((await page.textContent('#pageTitle')) !== '我的主页') { await openMe(page); await W(1500); }
		ok('关掉面板重新打开（或侧滑退出再进来）：10 分钟内直接显示输入框，不用重新发' + T, await page.isVisible('#meBox [data-code]') && calls.filter((c) => c.m === 'fam' && c.p.op === 'sudo_code').length === sc0 + 1);
		const c2 = calls.length;
		await page.fill('#meBox [data-code]', '123456'); await W(1500);
		const t2 = await page.textContent('#meBox'), after = calls.slice(c2).map((c) => c.m + (c.m === 'fam' ? ':' + c.p.op : ''));
		ok('输对了自动确认：只问一次（验证码 + 敏感信息一起回来），同时读手机列表，不再整页重读' + T, after.filter((x) => x.startsWith('fam')).join() === 'fam:sudo' && after.includes('device_list') && calls.slice(c2).find((c) => c.m === 'fam').p.want === 'secret', after.join());
		ok('验证后：完整邮箱、登录记录（有一条失败）' + T, /xiaoming2026@qq\.com/.test(t2) && /密码错了/.test(t2), t2.slice(0, 300));
		ok('验证后：能打开面板的 3 台手机（这台、最近使用、能移除）' + T, /登录着的设备 · 3 台/.test(t2) && /安卓手机 23127PN0CC · App/.test(t2) && /这台/.test(t2) && /最近使用：8 小时前/.test(t2) && (await page.locator('#meBox [data-mp="drm"]').count()) === 2);
		ok('验证后：官网的设备不在这里列，改成「官网账号设置」入口（去官网）' + T, !/Windows 电脑 · Chrome/.test(t2) && /官网上登录着的 2 台设备/.test(t2) && (await page.getAttribute('#meBox a[href$="/app#settings"]', 'href')) === 'https://panel.example/app#settings');
		ok('显示多久后自动锁上' + T, /后自动锁上/.test(await page.textContent('#mpLeft')));
		ok('验证后整页不横向滚动' + T, (await page.evaluate(() => document.documentElement.scrollWidth)) <= w);
		await page.screenshot({ path: path.join(SHOT, `me-open-${w}.png`), fullPage: true });
		await page.locator('#meBox [data-mp="drm"]').first().click(); await W(400);
		ok('移除手机：先确认，写明哪台' + T, /移除这台手机/.test(await page.locator('.modal').last().textContent()) && /23127PN0CC|旧手机/.test(await page.locator('.modal').last().textContent()));
		await page.locator('.modal').last().locator('button:has-text("移除")').click(); await W(1000);
		ok('移除后列表跟着变（不用再输验证码）' + T, Object.keys(DEVS).length === 2 && /登录着的设备 · 2 台/.test(await page.textContent('#meBox')));
		await page.click('#meBox [data-mp="drmall"]'); await W(400); await page.locator('.modal').last().locator('button:has-text("全部移除")').click(); await W(1000);
		ok('除了这台，全部移除' + T, Object.keys(DEVS).join() === 'abcd1234' && /登录着的设备 · 1 台/.test(await page.textContent('#meBox')));
		await page.click('[data-mp="lock"]'); await W(500);
		ok('「现在锁上」：又锁起来了，显示「发验证码」' + T, !/xiaoming2026/.test(await page.textContent('#meBox')) && await page.isVisible('#meBox [data-cwrap] [data-send]') && !(await page.isVisible('#meBox [data-code]')));
		// 再打开我的主页：先显示上次的（官网慢也马上有内容）
		DELAY = 2500;
		await page.goto('http://localhost:8181/panel/?p=more'); await W(1200); await openMe(page); await W(500);
		ok('再打开我的主页：马上显示上次的内容（不等官网）' + T, /小明/.test(await page.textContent('#meBox')) && /爸爸/.test(await page.textContent('#meBox')) && !/读取中/.test(await page.textContent('#meBox')));
		await W(2600); DELAY = 0;
		// 添加家人：要验证码（锁上后重新确认）
		await page.click('[data-mp="join"]'); await W(600);
		await page.fill('.modal [data-n]', '奶奶'); await page.click('.modal [data-tpl="look"]'); await W(200);
		ok('添加家人：选「只看」模板，下面的勾跟着变' + T, (await page.$$eval('.modal .mp-perms input:checked', (l) => l.map((x) => x.value))).join() === 'msg');
		await page.screenshot({ path: path.join(SHOT, `me-join-${w}.png`) });
		await page.click('.modal [data-ok]'); await W(800);
		ok('生成加入码前要确认本人' + T, /先确认是你本人/.test(await page.locator('.modal').last().textContent()));
		await page.locator('.modal').last().locator('[data-send]').click(); await W(600);
		ok('弹窗里发验证码：出现输入框' + T, await page.locator('.modal').last().locator('[data-code]').isVisible());
		await page.locator('.modal').last().locator('[data-code]').fill('123456'); await W(1500);
		ok('确认后：显示加入码和链接，带着选的权限' + T, /ABCD 2345/.test(await page.locator('.modal').last().textContent()) && F.lastJoin && F.lastJoin.name === '奶奶' && F.lastJoin.perms.join() === 'msg');
		await page.screenshot({ path: path.join(SHOT, `me-joincode-${w}.png`) });
		await page.locator('.modal').last().locator('button:has-text("完成")').click(); await W(1300);
		ok('家人列表里出现还没用的加入码，能撤回' + T, /ABCD2345/.test(await page.textContent('#meBox')) && await page.isVisible('[data-mp="jcancel"]'));
		// 管理爸爸：加上完全控制
		await page.click('[data-mp="sub"]'); await W(600);
		ok('管理家人：没勾高风险权限时不显示提醒' + T, !(await page.isVisible('.modal [data-risk]')));
		await page.locator('.modal .mp-chk', { hasText: '代理设置' }).click(); await W(200);
		ok('管理家人：只勾「代理设置」不再算高风险（脚本、恢复备份挪到了「完全控制」）' + T, !(await page.isVisible('.modal [data-risk]')));
		await page.locator('.modal .mp-chk', { hasText: '代理设置' }).click(); await W(100);
		await page.locator('.modal .mp-chk', { hasText: '完全控制' }).click(); await W(200);
		ok('管理家人：勾上「完全控制」马上显示提醒' + T, await page.isVisible('.modal [data-risk]') && /跟主账号一样/.test(await page.textContent('.modal [data-risk]')));
		await page.screenshot({ path: path.join(SHOT, `me-risk-${w}.png`) });
		await page.click('.modal [data-ok]'); await W(600);
		ok('保存前再确认一次：问要不要给完全控制' + T, /完全控制/.test(await page.locator('.modal').last().textContent()) && /确定给/.test(await page.locator('.modal').last().textContent()));
		await page.screenshot({ path: path.join(SHOT, `me-riskconfirm-${w}.png`) });
		await page.locator('.modal').last().locator('button:has-text("取消")').click(); await W(800);
		ok('确认时点取消：不保存' + T, !F.subs[0].perms.includes('net'));
		await page.click('[data-mp="sub"]'); await W(600);
		await page.locator('.modal .mp-chk', { hasText: '完全控制' }).click(); await page.click('.modal [data-ok]'); await W(600);
		await page.locator('.modal').last().locator('button:has-text("确定给")').click(); await W(1300);
		ok('管理家人：勾上「完全控制」确认后保存（10 分钟内不用再输码）' + T, F.subs[0].perms.includes('net'));
		ok('家人列表里标出「有完全控制」' + T, /有完全控制/.test(await page.textContent('#meBox')));
		await page.screenshot({ path: path.join(SHOT, `me-rootbadge-${w}.png`) });
		await page.click('[data-mp="sub"]'); await W(600); await page.click('.modal [data-ok]'); await W(1000);
		ok('原来就有的完全控制：再保存不重复确认' + T, !/完全控制？/.test(await page.locator('.modal').last().textContent().catch(() => '')) && F.subs[0].perms.includes('net'));
		await page.click('[data-mp="sub"]'); await W(600); await page.click('.modal [data-v="off"]'); await W(400); await page.locator('.modal').last().locator('button:has-text("停用")').click(); await W(1300);
		ok('停用爸爸：列表里标「已停用」' + T, F.subs[0].off === true && /已停用/.test(await page.textContent('#meBox')));
		await page.click('[data-mp="logall"]'); await W(400);
		ok('操作记录「看更多」：全部显示' + T, (await page.locator('#meBox .mp-tl').last().locator('li').count()) === LOG.length);
		await page.click('[data-mp="fb"]'); await W(1200);
		ok('「我的反馈」：打开我的反馈页' + T, (await page.textContent('#pageTitle')) === '我的反馈');
		// 系统操作里没有「托管服务」「绑定到账号」了
		await page.goto('http://localhost:8181/panel/?p=more'); await W(1500);
		ok('系统操作里没有「托管服务」「绑定到账号」（搬到我的主页了）' + T, !/托管服务|绑定到账号/.test(await page.textContent('#p-more')));
		ok('系统操作里没有「已登录的手机」（挪到我的主页 → 敏感信息了）' + T, !(await page.isVisible('#devsBtn')));
		// 实时对话：两边头像和名字
		await page.goto('http://localhost:8181/panel/?p=chat'); await W(1800);
		const who = await page.$$eval('#chList .chwho', (l) => l.map((x) => ({ me: x.closest('.chrow').classList.contains('me'), t: x.querySelector(':scope > span:last-child').textContent.trim(), img: !!x.querySelector('.av.img') })));
		ok('对话：我这边显示我的名字和头像，开发者那边显示开发者名字' + T, who.some((x) => x.me && x.t === '小明' && x.img) && who.some((x) => !x.me && x.t === '王开发'), JSON.stringify(who));
		await ctx.close();
		// 子账号看到的主页
		ROLE = 'sub';
		const c3 = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 });
		const p3 = await c3.newPage(); p3.on('pageerror', (e) => problems.push('页面错误3' + T + '：' + e.message)); p3.on('dialog', (d) => d.accept());
		await p3.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890abc'); localStorage.setItem('rp_dev', 'abcd1234.' + 'x'.repeat(32)); });
		await p3.goto('http://localhost:8181/panel/?p=me'); await W(2400);
		const t3 = await p3.textContent('#meBox');
		ok('[子账号] 标着子账号 · 家人，列出能用的功能（打勾）和主账号' + T, /子账号 · 家人/.test(t3) && /✓ 切换节点/.test(t3) && /✕ 系统操作/.test(t3) && /妈妈/.test(t3), t3.slice(0, 300));
		ok('[子账号] 没有续期码、添加家人、转让；有「退出这台路由器」' + T, !(await p3.isVisible('[data-mp="renew"]')) && !(await p3.isVisible('[data-mp="join"]')) && await p3.isVisible('[data-mp="leave"]'));
		ok('[子账号] 整页不横向滚动' + T, (await p3.evaluate(() => document.documentElement.scrollWidth)) <= w);
		await p3.screenshot({ path: path.join(SHOT, `me-sub-${w}.png`), fullPage: true });
		await c3.close();
		// 用应急登录码进来的（看不到官网账号）：「我的主页」里只有这台路由器的敏感信息，用路由器后台密码验证
		ROLE = 'owner'; EMERG = true;
		const c4 = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 });
		const p4 = await c4.newPage(); p4.on('pageerror', (e) => problems.push('页面错误4' + T + '：' + e.message));
		await p4.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890abc'); localStorage.setItem('rp_dev', 'abcd1234.' + 'x'.repeat(32)); });
		await p4.goto('http://localhost:8181/panel/?p=more'); await W(2400);
		ok('[应急登录码] 系统操作里没有「已登录的手机」「连接器地址」「换登录密钥」了' + T, (await p4.locator('#devsBtn, #ckeyBtn, [data-t="rotatekey"]').count()) === 0);
		await p4.goto('http://localhost:8181/panel/?p=me'); await W(2200);
		const t4 = await p4.textContent('#meBox');
		ok('[应急登录码] 我的主页：说明是应急登录，敏感信息要输路由器后台密码' + T, /应急登录/.test(t4) && /输路由器后台密码验证/.test(t4) && /登录着的设备/.test(t4) && !/安卓手机/.test(t4), t4.slice(0, 200));
		await p4.fill('#meBox [data-pw]', 'rootpw'); await p4.click('#meBox [data-pwok]'); await W(1200);
		const t5 = await p4.textContent('#meBox');
		ok('[应急登录码] 验证后：登录着的手机、连接器地址、平板网址、换登录密钥都在这一处' + T, /登录着的设备 · \d+ 台/.test(t5) && /安卓手机/.test(t5) && /这台路由器的钥匙/.test(t5) && (await p4.locator('#meBox [data-mp="ktab"], #meBox [data-mp="krot"]').count()) === 2, t5.slice(0, 300));
		ok('[应急登录码] 托管版的「添加新手机」不在钥匙里（扫码只是打开官网，留在系统操作）' + T, (await p4.locator('#meBox [data-mp="kphone"]').count()) === 0);
		await p4.screenshot({ path: path.join(SHOT, `me-emerg-${w}.png`), fullPage: true });
		await p4.click('#meBox [data-mp="ktab"]'); await W(700);
		ok('[应急登录码] 平板网址：带着凭证才拿到，先打码' + T, /beat\/t\//.test(await p4.locator('.modal').last().textContent()) && (await p4.locator('.modal .keybox.blur').count()) === 1 && calls.some((c) => c.m === 'tablet_url' && c.p.sudo === LSU));
		await c4.close(); EMERG = false;
		// 自建版：顶部没有头像；侧边栏有「我的主页」（只有敏感信息）
		hosted = false; ROLE = 'owner';
		const ctx2 = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 });
		const p2 = await ctx2.newPage(); p2.on('pageerror', (e) => problems.push('页面错误2' + T + '：' + e.message));
		await p2.addInitScript(() => localStorage.setItem('rp_token', 'testtoken1234567890abc'));
		await p2.goto('http://localhost:8181/panel/'); await W(1500);
		ok('自建版：顶部没有头像；侧边栏有「我的主页」' + T, !(await p2.isVisible('#meBtn')) && (await p2.locator('#sideMe').evaluate((e) => !e.classList.contains('hidden'))) && /敏感信息/.test(await p2.textContent('#sideMe')));
		await ctx2.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

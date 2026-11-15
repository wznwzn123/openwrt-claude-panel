// 5.2 我的主页：顶栏和侧边栏显示官网账号的头像和名字，点开是「我的主页」整页（托管服务、这台路由器、家人、敏感信息要验证码、操作记录、我的反馈）；实时对话两边显示头像和名字
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
let ROLE = 'owner';
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
		case 'sudo': if (a.code !== '123456') return { error: '验证码不对' }; F.sudo = 'sudotokensudotokensudotok'; return { ok: true, sudo: F.sudo, exp: Date.now() + 600e3 };
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
const msgs = [{ s: 1, f: 'u', t: now - 600e3, x: '节点页打不开了' }, { s: 2, f: 'u', t: now - 590e3, x: '一直转圈' }, { s: 3, f: 'a', t: now - 300e3, x: '你好，我看一下' }, { s: 4, f: 'a', t: now - 290e3, x: '先刷新试试' }];
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''); calls.push({ m, p: body.params }); res.writeHead(200, { 'content-type': 'application/json' });
		let result;
		if (m === 'svc_info') result = hosted ? { hosted: true, hub: 'https://panel.example', exp: Date.now() + 7 * 864e5 - 3600e3, off: false } : { hosted: false };
		else if (m === 'cloud_info') result = hosted ? { enabled: true, url: 'https://ab3cd4ef.panel.example/cloud', tablet: 'x', pkey: 'p'.repeat(32), hosted: true, hub: 'https://panel.example' } : { enabled: false };
		else if (m === 'hub_accounts') result = accs;
		else if (m === 'whoami') result = { hosted, hub: 'https://panel.example', role: ROLE, perms: ROLE === 'sub' ? ['msg', 'node', 'speed'] : ['msg', 'node', 'speed', 'parent', 'proxy', 'net', 'sys'], uid: 'abcdefghijk2' };
		else if (m === 'fam') { const r = famOp(body.params); if (r.error) return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: r.error } })); result = r; }
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
		hosted = true; ROLE = 'owner'; F.sudo = ''; F.sessOut = 0; F.joins = []; F.name = '小明'; F.avatar = AV;
		F.subs = [{ uid: 'sub000000002', name: '爸爸', email: 'ba***@x.com', avatar: '', perms: ['msg', 'node', 'speed'], exp: 0, off: false, at: Date.now() - 3 * 864e5 }];
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 });
		await ctx.route('https://panel.example/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '官网' }));
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890abc'); localStorage.setItem('rp_dev', 'abcd1234.' + 'x'.repeat(32)); });
		await page.goto('http://localhost:8181/panel/'); await W(2000);
		const btn = w < 900 ? '#meBtn' : '#sideMe';
		ok('托管版：显示我的头像按钮' + T, await page.isVisible(btn));
		ok('头像是官网账号的头像（图片）' + T, /data:image\/png/.test(await page.evaluate((s) => getComputedStyle(document.querySelector(s + ' .av')).backgroundImage, btn)));
		if (w >= 900) ok('侧边栏显示名字' + T, (await page.textContent('#sideMeName')) === '小明');
		ok('顶栏不重叠、不超出' + T, (await topLay(page)) === '', await topLay(page));
		await page.click(btn); await W(1500);
		const t = await page.textContent('#meBox');
		ok('点开是「我的主页」整页：头像、名字、打码邮箱、主账号' + T, (await page.textContent('#pageTitle')) === '我的主页' && /小明/.test(t) && /xi\*\*\*@qq\.com/.test(t) && /主账号/.test(t), t.slice(0, 200));
		ok('有托管服务、这台路由器、家人、敏感信息、操作记录、我的反馈' + T, ['托管服务', '这台路由器', '家人', '敏感信息', '操作记录', '我的反馈'].every((x) => t.includes(x)));
		ok('托管服务：到期时间、专属网址、输入续期码' + T, /还剩 7 天/.test(t) && /localhost:8181/.test(t) && await page.isVisible('[data-mp="renew"]'));
		ok('家人：列出爸爸（家人权限），能管理、添加、转让' + T, /爸爸/.test(t) && /家人/.test(t) && await page.isVisible('[data-mp="sub"]') && await page.isVisible('[data-mp="join"]') && await page.isVisible('[data-mp="transfer"]'));
		ok('敏感信息默认锁着，看不到完整邮箱' + T, !/xiaoming2026/.test(t) && await page.isVisible('[data-mp="unlock"]'));
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
		// 敏感信息：发验证码 → 输错 → 输对
		await page.click('[data-mp="unlock"]'); await W(700);
		ok('点「发验证码」：出现输验证码的框，说发到哪了' + T, await page.isVisible('#mpCode input') && /xi\*\*\*@qq\.com/.test(await page.textContent('#mpCode')));
		await page.fill('#mpCode input', '000000'); await page.click('[data-mp="unlock2"]'); await W(700);
		ok('验证码错了：还锁着' + T, !/xiaoming2026/.test(await page.textContent('#meBox')));
		await page.fill('#mpCode input', '123456'); await page.click('[data-mp="unlock2"]'); await W(1500);
		const t2 = await page.textContent('#meBox');
		ok('验证码对了：看到完整邮箱、官网登录着的 2 台设备、登录记录（有一条失败）' + T, /xiaoming2026@qq\.com/.test(t2) && /Windows 电脑 · Chrome/.test(t2) && /密码错了/.test(t2), t2.slice(0, 300));
		ok('显示多久后自动锁上' + T, /后自动锁上/.test(await page.textContent('#mpLeft')));
		await page.screenshot({ path: path.join(SHOT, `me-open-${w}.png`), fullPage: true });
		await page.click('[data-mp="soutall"]'); await W(400); await page.locator('.modal').last().locator('button:has-text("全部退出")').click(); await W(1200);
		ok('官网全部退出（验证过了不用再输码）' + T, F.sessOut === 1 && /没有设备登录着官网/.test(await page.textContent('#meBox')));
		await page.click('[data-mp="lock"]'); await W(500);
		ok('「现在锁上」：又锁起来了' + T, !/xiaoming2026/.test(await page.textContent('#meBox')) && await page.isVisible('[data-mp="unlock"]'));
		// 添加家人：要验证码（锁上后重新确认）
		await page.click('[data-mp="join"]'); await W(600);
		await page.fill('.modal [data-n]', '奶奶'); await page.click('.modal [data-tpl="look"]'); await W(200);
		ok('添加家人：选「只看」模板，下面的勾跟着变' + T, (await page.$$eval('.modal .mp-perms input:checked', (l) => l.map((x) => x.value))).join() === 'msg');
		await page.screenshot({ path: path.join(SHOT, `me-join-${w}.png`) });
		await page.click('.modal [data-ok]'); await W(800);
		ok('生成加入码前要确认本人' + T, /先确认是你本人/.test(await page.locator('.modal').last().textContent()));
		await page.locator('.modal').last().locator('[data-send]').click(); await W(600);
		await page.locator('.modal').last().locator('input').fill('123456'); await page.locator('.modal').last().locator('[data-ok]').click(); await W(1500);
		ok('确认后：显示加入码和链接，带着选的权限' + T, /ABCD 2345/.test(await page.locator('.modal').last().textContent()) && F.lastJoin && F.lastJoin.name === '奶奶' && F.lastJoin.perms.join() === 'msg');
		await page.screenshot({ path: path.join(SHOT, `me-joincode-${w}.png`) });
		await page.locator('.modal').last().locator('button:has-text("完成")').click(); await W(1300);
		ok('家人列表里出现还没用的加入码，能撤回' + T, /ABCD2345/.test(await page.textContent('#meBox')) && await page.isVisible('[data-mp="jcancel"]'));
		// 管理爸爸：加上代理设置
		await page.click('[data-mp="sub"]'); await W(600);
		await page.locator('.modal .mp-chk', { hasText: '代理设置' }).click(); await page.click('.modal [data-ok]'); await W(1300);
		ok('管理家人：勾上「代理设置」保存（10 分钟内不用再输码）' + T, F.subs[0].perms.includes('proxy'));
		await page.click('[data-mp="sub"]'); await W(600); await page.click('.modal [data-v="off"]'); await W(400); await page.locator('.modal').last().locator('button:has-text("停用")').click(); await W(1300);
		ok('停用爸爸：列表里标「已停用」' + T, F.subs[0].off === true && /已停用/.test(await page.textContent('#meBox')));
		await page.click('[data-mp="logall"]'); await W(400);
		ok('操作记录「看更多」：全部显示' + T, (await page.locator('#meBox .mp-tl').last().locator('li').count()) === LOG.length);
		await page.click('[data-mp="fb"]'); await W(1200);
		ok('「我的反馈」：打开我的反馈页' + T, (await page.textContent('#pageTitle')) === '我的反馈');
		// 系统操作里没有「托管服务」「绑定到账号」了
		await page.goto('http://localhost:8181/panel/?p=more'); await W(1500);
		ok('系统操作里没有「托管服务」「绑定到账号」（搬到我的主页了）' + T, !/托管服务|绑定到账号/.test(await page.textContent('#p-more')));
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
		// 自建版：不显示
		hosted = false; ROLE = 'owner';
		const ctx2 = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 });
		const p2 = await ctx2.newPage(); p2.on('pageerror', (e) => problems.push('页面错误2' + T + '：' + e.message));
		await p2.addInitScript(() => localStorage.setItem('rp_token', 'testtoken1234567890abc'));
		await p2.goto('http://localhost:8181/panel/'); await W(1500);
		ok('自建版：没有头像按钮' + T, !(await p2.isVisible('#meBtn')) && !(await p2.isVisible('#sideMe')));
		await ctx2.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

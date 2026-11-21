// 5.2 托管版：新手机从官网打开（#open=票）；应急登录码；子账号只看到给了的功能；已登录的手机；Claude 连接器地址；退出登录
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (process.env.DBG) console.log((c ? 'OK ' : 'NO ') + n + ' ' + (c ? '' : String(note || '').slice(0, 300))); if (!c) problems.push(n + (note ? '：' + note : '')); };
const TOK = 'testtokentesttokentest';
let hosted = true, ai = true, ROLE = { role: 'owner', perms: ['msg', 'node', 'speed', 'parent', 'proxy', 'net', 'sys'] }, STOP = '';
const DEVS = { old00001: { s: 'x'.repeat(32), name: 'iPhone · Safari', at: 1761900000, via: '账号 al***@x.com' } };
const calls = []; let n = 0; const PASSES = {};
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname === '/cgi-bin/mcp/open') { const body = JSON.parse(b || '{}'); calls.push({ m: 'open', t: Date.now() });
		const R = (result) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })), E = (code, message) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code, message } }));
		// 6.0：登录码（官网的、应急的）也从「打开面板」的入口进，手机上不再存登录密钥
		if (body.method === 'panel/device_approve') {
			if (body.params.code !== 'ABCD2345') return E(-32000, '登录码不对');
			const id = 'new' + String(++n).padStart(5, '0'), s = 'y'.repeat(32); DEVS[id] = { s, name: body.params.name, at: Date.now() / 1000 | 0, via: '账号 al***@x.com' }; calls.push({ m: 'device_approve' }); return R({ dev: id + '.' + s, id });
		}
		if (body.method !== 'panel/open_login') return E(-32601, 'not found');
		if (body.params.ticket !== 'goodticketgoodticketgood') return E(-32000, '这个链接过期了：回到官网「我的路由器」重新点「打开面板」');
		const id = 'opn' + String(++n).padStart(5, '0'), s = 'z'.repeat(32); DEVS[id] = { s, name: body.params.name, at: Date.now() / 1000 | 0, via: '官网账号 al***@x.com' }; return R({ dev: id + '.' + s, id }); } // 6.0 起不给登录密钥
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const tok = decodeURIComponent(u.pathname.split('/').pop()); const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''); calls.push({ m, dev: body.dev, t: Date.now(), p: body.params });
		const isPass = tok === 'pass';
		if (!isPass && tok !== TOK) { res.writeHead(404); return res.end('{"error":"not found"}'); }
		const R = (result) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })), E = (code, message, data) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code, message, data } }));
		const dm = /^([a-z0-9]{8})\.([a-z0-9]{32})$/.exec(body.dev || ''), dmOk = dm && DEVS[dm[1]] && DEVS[dm[1]].s === dm[2] ? dm[1] : null;
		// 6.0 第 6 项：手机钥匙换通行证，平时的请求只带通行证
		if (isPass && m === 'pass_new') { const pm = /^([a-z0-9]{8})\.([a-z0-9]{32})$/.exec(body.params.dev || ''); const id = pm && DEVS[pm[1]] && DEVS[pm[1]].s === pm[2] ? pm[1] : null; if (!id) return E(-32010, '这台手机还没登录', { need_code: true, hub: 'https://hub.example' }); const ps = 'q' + String(++n).padStart(31, '0'); PASSES[ps] = id; return R({ pass: ps, exp: Date.now() + 3600e3 }); }
		const me = isPass ? (DEVS[PASSES[body.pass]] ? PASSES[body.pass] : null) : dmOk;
		if (isPass && !me) return E(-32013, '通行证过期了');
		if (me) calls[calls.length - 1].me = me;
		if (hosted && m !== 'device_approve' && !me) return E(-32010, '这台手机还没登录', { need_code: true, hub: 'https://hub.example' });
		if (STOP && me) return E(-32011, STOP, { hub: 'https://hub.example' });
		const OWN = ['term', 'fs_list', 'rotate_key', 'oc_set'];
		if (ROLE.role === 'sub' && OWN.includes(m)) return E(-32012, '只有主账号能用这个功能');
		if (m === 'whoami') return R({ hosted, hub: 'https://hub.example', role: ROLE.role, perms: ROLE.perms, uid: 'aaaaaaaaaaaa', dev: me, ai });
		// 6.0：自建版用登录地址换这台手机的钥匙
		if (m === 'pass_login') { if (hosted) return E(-32010, '这台手机还没登录', { need_code: true, hub: 'https://hub.example' }); const id = 'slf' + String(++n).padStart(5, '0'), s2 = 'w'.repeat(32); DEVS[id] = { s: s2, name: body.params.name, at: Date.now() / 1000 | 0, via: '登录地址' }; return R({ dev: id + '.' + s2, id }); }
		if (m === 'device_approve') {
			if (body.params.code !== 'ABCD2345') return E(-32000, '登录码不对');
			const id = 'new' + String(++n).padStart(5, '0'), s = 'y'.repeat(32); DEVS[id] = { s, name: body.params.name, at: Date.now() / 1000 | 0, via: '账号 al***@x.com' }; return R({ dev: id + '.' + s, id });
		}
		// 6.0 第 63 项：登录着的手机、连接器地址要带着确认本人的凭证（这里是路由器后台密码换的）
		if (m === 'sudo_local') return body.params.pw === 'rootpw' ? R({ sudo: 'l'.repeat(24), exp: Date.now() + 600e3 }) : E(-32000, '密码不对（还能再试 4 次）');
		if (['device_list', 'ckey_info'].includes(m) || (m === 'device_remove' && !body.params.self)) { if (body.params.sudo !== 'l'.repeat(24)) return E(-32000, '要先确认是你本人：在「我的主页 → 敏感信息」里验证'); }
		if (m === 'device_list') return R({ hosted, list: Object.entries(DEVS).map(([id, d]) => ({ id, name: d.name, at: d.at, via: d.via, seen: null, me: id === me })) });
		if (m === 'device_remove') { const id = body.params.self ? me : body.params.all_others ? null : body.params.id; if (body.params.all_others) { for (const k of Object.keys(DEVS)) if (k !== me) delete DEVS[k]; } else delete DEVS[id]; return R({ ok: true }); }
		if (m === 'ckey_info') return R(ai ? { ai: true, url: 'https://r.example.com/cgi-bin/mcp/' + 'c'.repeat(40), hosted } : { ai: false });
		if (m === 'cloud_info') return R({ enabled: false });
		return R(respond(m, body.params || {})); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const vis = (page, sel) => page.isVisible(sel);
(async () => {
	await new Promise((r) => server.listen(8143, r));
	const browser = await chromium.launch();
	const mk = async (scheme) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: scheme || 'light', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 EdgA/130.0' }); const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message)); page.on('dialog', (d) => d.accept()); return page; };
	let page = await mk();
	// 1. 新手机：有登录地址，还没从官网打开过
	await page.goto('http://localhost:8143/panel/'); await page.evaluate((t) => localStorage.setItem('rp_token', t), TOK);
	await page.goto('http://localhost:8143/panel/?p=home'); await W(1800);
	ok('托管版新手机：显示「从官网打开面板」', await vis(page, '#needcode') && /从官网打开面板/.test(await page.textContent('#lcTitle')));
	ok('说明去官网「我的路由器」点「打开面板」，按钮链接到官网账号页', /我的路由器/.test(await page.textContent('#needcode')) && /打开面板/.test(await page.textContent('#needcode')) && (await page.getAttribute('#lcHub', 'href')) === 'https://hub.example/app');
	ok('不再提「获取登录码」「配对码」这些老办法', !/获取登录码|配对码/.test(await page.textContent('#needcode')));
	ok('应急登录码收在「官网打不开」里面，默认不展开', !(await vis(page, '#lcInput')) && /cmcp-logincode/.test(await page.textContent('#needcode')));
	ok('没登录前路由器什么数据都没给', !calls.some((c) => c.m !== 'device_approve' && c.dev));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'lc-01-need.png') });
	// 2. 应急登录码
	await page.click('#lcEmerg summary'); await W(300);
	ok('点开「官网打不开」：出现应急登录码输入框', await vis(page, '#lcInput'));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'lc-01b-emerg.png') });
	await page.fill('#lcInput', '123'); await page.click('#lcBtn'); await W(300);
	ok('位数不对：提示 8 位', /8 位/.test(await page.textContent('#lcErr')));
	await page.fill('#lcInput', 'ZZZZ9999'); await page.click('#lcBtn'); await W(600);
	ok('应急登录码不对：显示原因，还停在这页', /不对/.test(await page.textContent('#lcErr')) && await vis(page, '#needcode'));
	calls.length = 0;
	await page.fill('#lcInput', 'abcd 2345'); await page.click('#lcBtn'); await W(2600);
	ok('应急登录码输对：进入面板', !(await vis(page, '#needcode')) && await vis(page, '#app'));
	ok('自动带上手机名字（安卓 · Edge）', DEVS.new00001 && DEVS.new00001.name === '安卓手机 Pixel 8 · Edge', DEVS.new00001 && DEVS.new00001.name);
	ok('手机钥匙存在这台手机上；之后的请求带的是通行证，认得出是这台（钥匙本身不再每次都发）', /^new00001\./.test(await page.evaluate(() => localStorage.getItem('rp_dev'))) && calls.filter((c) => !['device_approve', 'pass_new', 'open'].includes(c.m)).every((c) => c.me === 'new00001' && !c.dev));
	ok('手机上不再存登录密钥（6.0 第 6 项）', !(await page.evaluate(() => localStorage.getItem('rp_token'))));
	await page.reload(); await W(1500);
	ok('刷新后不用再登录', !(await vis(page, '#needcode')));
	// 3. 已登录的手机、Claude 连接器地址：6.0 起只在「我的主页 → 敏感信息」（应急登录的用路由器后台密码验证）；添加新手机（托管版：扫码打开官网）还在系统操作
	await page.goto('http://localhost:8143/panel/?p=more'); await W(1500);
	ok('「系统操作」里没有「已登录的手机」「Claude 连接器地址」了', (await page.locator('#devsBtn, #ckeyBtn').count()) === 0);
	await page.goto('http://localhost:8143/panel/?p=me'); await W(1800);
	ok('我的主页：没验证看不到手机列表', !/iPhone · Safari/.test(await page.textContent('#meBox')) && (await page.locator('#meBox [data-pw]').count()) === 1);
	await page.fill('#meBox [data-pw]', 'rootpw'); await page.click('#meBox [data-pwok]'); await W(1200);
	let t = await page.textContent('#meBox');
	ok('已登录的手机：列出两台，标出「这台」，这台没有移除按钮', /iPhone · Safari/.test(t) && /安卓手机 Pixel 8 · Edge/.test(t) && /这台/.test(t) && (await page.$$('#meBox [data-mp="drm"]')).length === 1);
	ok('已登录的手机：说移除后要从官网重新打开（不再说登录码）', /从官网重新打开/.test(t) && !/登录码/.test(t.replace(/应急登录码/g, '')));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'lc-02-devs.png'), fullPage: true });
	await page.click('#meBox [data-mp="drm"]'); await W(400); await page.locator('.modal').last().locator('button:has-text("移除")').click(); await W(900);
	ok('移除别的手机（带着凭证）', !DEVS.old00001 && (await page.$$('#meBox [data-mp="drm"]')).length === 0 && calls.some((c) => c.m === 'device_remove' && c.p && c.p.sudo));
	await page.click('#meBox [data-mp="kckey"]'); await W(800);
	t = await page.textContent('.modal');
	ok('Claude 连接器地址：先打码，说明打不开面板，提醒旧连接器要换', (await page.getAttribute('.modal .keybox', 'class')).includes('blur') && /打不开面板/.test(t) && /重新添加/.test(t) && t.includes('c'.repeat(40)));
	await page.click('.modal button:has-text("完成")'); await W(400);
	await page.goto('http://localhost:8143/panel/?p=more'); await W(1500);
	const addBtn = await page.$('[data-t="addphone"], #addPhoneBtn, button:has-text("添加新手机")');
	if (addBtn) {
		await addBtn.click(); await W(900); t = await page.textContent('.modal');
		ok('托管版「添加新手机」：扫码打开官网，不再给带密钥的链接', /官网/.test(t) && /打开面板/.test(t) && !t.includes(TOK) && !(await page.innerHTML('.modal')).includes(TOK));
		await page.screenshot({ path: path.join(__dirname, 'shots', 'lc-03-addphone.png') });
		await page.click('.modal button:has-text("完成")'); await W(400);
	} else ok('找到「添加新手机」按钮', false);
	// 4. 退出登录（侧边栏底部）
	await page.goto('http://localhost:8143/panel/?p=home'); await W(1500);
	await page.click('#menuBtn'); await W(500);
	ok('侧边栏底部有「退出登录」', await vis(page, '#sideOut'));
	await page.click('#sideOut'); await W(400);
	ok('退出前先确认，说明下次要从官网重新打开', /从官网/.test(await page.textContent('.modal')));
	calls.length = 0;
	await page.locator('.modal').last().locator('button:has-text("退出登录")').click(); await W(900);
	ok('退出：路由器忘掉这台手机、手机上的密钥清掉、回到登录页', calls.some((c) => c.m === 'device_remove') && !DEVS.new00001 && (await page.evaluate(() => JSON.stringify([localStorage.getItem('rp_token'), localStorage.getItem('rp_dev')]))) === '[null,null]' && await vis(page, '#login') && !(await vis(page, '#needcode')));
	// 5. 官网「打开面板」：#open=票，什么都不用输
	calls.length = 0;
	await page.goto('about:blank'); await page.goto('http://localhost:8143/panel/#open=goodticketgoodticketgood'); await W(2600);
	ok('[打开面板] 带票打开：自动登录进面板（不用登录地址、不用输码）', !(await vis(page, '#needcode')) && await vis(page, '#app') && !(await page.evaluate(() => localStorage.getItem('rp_token'))) && /^opn/.test(await page.evaluate(() => localStorage.getItem('rp_dev') || '')));
	ok('[打开面板] 地址栏里的票马上去掉', !(await page.evaluate(() => location.hash)));
	ok('[打开面板] 票发到 /cgi-bin/mcp/open，带着手机名字', calls.some((c) => c.m === 'open') && Object.values(DEVS).some((d) => d.name === '安卓手机 Pixel 8 · Edge'));
	const p6 = await mk();
	await p6.goto('http://localhost:8143/panel/#open=badticketbadticketbadtic'); await W(2000);
	ok('[打开面板] 票过期：说清楚原因，给「去官网打开」按钮', await vis(p6, '#needcode') && /过期/.test(await p6.textContent('#lcWhy')) && await vis(p6, '#lcHub'));
	await p6.screenshot({ path: path.join(__dirname, 'shots', 'lc-07-badticket.png') });
	// 6. 子账号：只显示给了的功能
	ROLE = { role: 'sub', perms: ['msg', 'node', 'speed'] };
	await page.goto('http://localhost:8143/panel/?p=home'); await W(2200);
	await page.click('#menuBtn'); await W(500);
	const nav = await page.textContent('#sidenav');
	ok('[子账号] 侧边栏没有终端、文件管理、配置文件、系统日志', !/终端|文件管理|配置文件|系统日志/.test(nav), nav.slice(0, 200));
	ok('[子账号] 侧边栏还有概览、节点、网速测试、实时联系开发者', /概览/.test(nav) && /网速测试/.test(nav) && /实时联系开发者/.test(nav));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'lc-08-sub-nav.png') });
	await page.goto('http://localhost:8143/panel/?p=term'); await W(1800);
	ok('[子账号] 直接打开终端的网址：回到首页，终端不显示', !(await vis(page, '#termIn')));
	ROLE = { role: 'owner', perms: ['msg', 'node', 'speed', 'parent', 'proxy', 'net', 'sys'] };
	await page.reload(); await W(2200); await page.click('#menuBtn'); await W(500);
	ok('[主账号] 侧边栏有终端和文件管理', /终端/.test(await page.textContent('#sidenav')) && /文件管理/.test(await page.textContent('#sidenav')));
	// 7. 主账号停用了这个子账号：显示原因
	STOP = '主账号暂时停用了你在这台路由器上的权限';
	await page.reload(); await W(2000);
	ok('[停用] 显示「从官网打开」页，上面写着原因', await vis(page, '#needcode') && /停用/.test(await page.textContent('#lcWhy')));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'lc-09-stopped.png') });
	STOP = '';
	// 8. 自建版：不用登录；纯面板版没有连接器地址
	hosted = false; ai = false;
	const p2 = await mk('dark');
	await p2.goto('http://localhost:8143/panel/'); await p2.evaluate((t) => localStorage.setItem('rp_token', t), TOK);
	await p2.goto('http://localhost:8143/panel/?p=more'); await W(1800);
	ok('自建版：不弹登录页；没有「已登录的手机」；纯面板版没有「Claude 连接器地址」', !(await vis(p2, '#needcode')) && !(await vis(p2, '#devsBtn')) && !(await vis(p2, '#ckeyBtn')));
	ok('「退出登录」也在系统操作里', /退出登录/.test(await p2.textContent('[data-t="logout"]')));
	// 9. 老链接 #login= 照样存密钥（之后托管版要从官网打开）
	hosted = true;
	const p5 = await mk();
	await p5.goto('http://localhost:8143/panel/#login=' + TOK + '&pair=PQRS2345'); await W(1800);
	ok('老的 #login= 链接：密钥存好、地址栏去掉，不再存配对码', (await p5.evaluate(() => localStorage.getItem('rp_token'))) === TOK && !(await p5.evaluate(() => location.hash)) && !(await p5.evaluate(() => localStorage.getItem('rp_pair'))));
	ok('老链接打开后：显示从官网打开', await vis(p5, '#needcode'));
	// 深色截图
	const p3 = await mk('dark'); await p3.goto('http://localhost:8143/panel/'); await p3.evaluate((t) => localStorage.setItem('rp_token', t), TOK);
	await p3.goto('http://localhost:8143/panel/?p=home'); await W(1800); await p3.screenshot({ path: path.join(__dirname, 'shots', 'lc-05-need-dark.png') });
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

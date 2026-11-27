// 6.0 第 36 项（面板）：远程页面——认识的页面列出来（端口、没在运行的灰掉）；点「打开」先开好新标签页，官网切好再跳过去；
// 正在开着的能关掉；手动加 / 删页面；自建版给教程、本地版给局域网地址；320 / 390 / 430、深色
// 第 37 项：家里的设备——默认没有；从局域网设备里选或者手动填 IP，提醒改默认密码；打开、删除
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
let S;
const fresh = (o = {}) => ({ calls: [], d: { mode: 'hosted', cur: 0, lan: '192.168.1.1', list: [{ id: 'oc', name: 'OpenClash 控制面板', port: 9090, path: '/ui/', https: false, up: true, auto: true }, { id: 'agh', name: 'AdGuard Home', port: 3000, path: '/', up: true, auto: true }, { id: 'ttyd', name: '网页终端（ttyd）', port: 7681, path: '/', https: true, up: false, auto: true }, { id: 'm9000', name: '一个名字特别长的 Docker 管理页面', port: 9000, path: '/', up: true }], curip: '', devs: [], cands: [{ ip: '192.168.1.20', mac: 'aa:bb:cc:00:00:20', name: 'DS920+' }, { ip: '192.168.1.130', mac: 'aa:bb:cc:00:00:30', name: '客厅摄像头一个特别长的名字' }], ...o } });
function handle(m, p) {
	S.calls.push({ m, p });
	const d = S.d;
	if (m === 'xp_get') return d;
	if (m === 'xp_open' && p.dev) { const x = d.devs.find((y) => y.id === p.dev); d.cur = x.port; d.curip = x.ip; return { url: 'http://localhost:8197/fake-x?port=' + x.ip + ':' + x.port, name: x.name, host: 'abcd2345-x.panel.example', wait: 1 }; }
	if (m === 'xp_open') { const x = d.list.find((y) => (p.port ? y.port === p.port : y.id === p.id)) || { name: '端口 ' + p.port, port: p.port }; d.cur = x.port; return { url: 'http://localhost:8197/fake-x?port=' + x.port, name: x.name, host: 'abcd2345-x.panel.example', wait: 1 }; }
	if (m === 'xp_close') { d.cur = 0; return { ok: true }; }
	if (m === 'xp_set' && p.op === 'dadd') { if (p.ip === '8.8.8.8') throw new Error('只能开家里局域网的设备'); d.devs.push({ id: 'd' + (d.devs.length + 1), name: p.name, mac: p.mac, ip: p.ip, port: +p.port, path: p.path, https: p.https }); return d; }
	if (m === 'xp_set' && p.op === 'ddel') { d.devs = d.devs.filter((x) => x.id !== p.id); return d; }
	if (m === 'xp_set') { if (p.op === 'del') d.list = d.list.filter((x) => x.port !== +p.port); else d.list.push({ id: 'm' + p.port, name: p.name, port: +p.port, path: p.path, https: p.https, up: true }); return d; }
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (x) => (b += x)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname === '/fake-luci') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<!doctype html><html><head><script src="/panel/lfx.js"></script></head><body><h1>终端</h1><iframe id="tt" src="http://' + req.headers.host.split(':')[0] + ':7681/" style="width:100%;height:300px"></iframe><button id="oc" onclick="window.open(\'http://' + req.headers.host.split(':')[0] + ':9090/ui/?hostname=192.168.1.1\')">打开控制面板</button><a id="same" href="/cgi-bin/luci/admin">同一个地址的链接</a></body></html>'); }
	if (u.pathname === '/cgi-bin/luci/admin/services/cmcp') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<!doctype html><html><head><script src="/panel/lfx.js"></script></head><body>正在打开路由器面板…</body></html>'); }
	if (u.pathname === '/fake-x') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<title>远程页面</title>端口 ' + u.searchParams.get('port')); }
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); const m = body.method.replace(/^panel\//, ''); return setTimeout(() => { try { J({ jsonrpc: '2.0', id: body.id, result: handle(m, body.params || {}) }); } catch (e) { J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }, 60); }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const lay = (page) => page.evaluate(() => {
	const bad = [];
	if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('横向滚动');
	document.querySelectorAll('#xpBody .xprow, #xpBody .btn, #xpBody .notice').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && (r.right > innerWidth - 8 || r.left < 8)) bad.push('出界：' + el.textContent.slice(0, 14)); });
	document.querySelectorAll('#xpBody .btn').forEach((b) => { if (b.offsetParent && b.scrollWidth > b.clientWidth + 1) bad.push('按钮字截断：' + b.textContent); });
	document.querySelectorAll('#xpBody .xprow').forEach((r) => { const t = r.querySelector('b'), bt = r.querySelector('.btn'); if (t && bt && t.getBoundingClientRect().right > bt.getBoundingClientRect().left + 1) bad.push('名字压到按钮：' + t.textContent); });
	return bad;
});
(async () => {
	await new Promise((r) => server.listen(8197, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S = fresh();
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8197/panel/?p=xpage'); await W(1500);
		const t = await page.textContent('#xpBody');
		ok('列出页面和端口；没在运行的写出来、「打开」灰掉' + T, /OpenClash 控制面板/.test(t) && /端口 9090/.test(t) && /没在运行/.test(t) && await page.isDisabled('[data-xo="ttyd"]') && !(await page.isDisabled('[data-xo="oc"]')));
		ok('手动加的能删，认识的不能删' + T, (await page.locator('[data-xd="9000"]').count()) === 1 && (await page.locator('[data-xd="9090"]').count()) === 0);
		let l = await lay(page); ok('不错位、不出界' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `xpage-${w}${dark ? '-dark' : ''}.png`) });
		// 打开
		const popP = ctx.waitForEvent('page');
		await page.click('[data-xo="agh"]');
		const pop = await popP; await W(2200);
		ok('打开：新标签页先开好，官网切好后跳到通行证地址' + T, S.calls.some((c) => c.m === 'xp_open' && c.p.id === 'agh') && /fake-x\?port=3000/.test(pop.url()), pop.url());
		await pop.close();
		ok('顶上写「正在开着：AdGuard Home」，能关掉；这一行标「正在用」' + T, /正在开着：AdGuard Home/.test(await page.textContent('#xpBody')) && /正在用/.test(await page.textContent('#xpBody')) && await page.isVisible('#xpClose'));
		l = await lay(page); ok('开着时不错位' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `xpage-open-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('#xpClose'); await W(400);
		ok('关掉' + T, S.calls.some((c) => c.m === 'xp_close') && !(await page.$('#xpClose')));
		// 添加
		await page.click('#xpAdd'); await W(300);
		await page.fill('.modal [data-a="name"]', 'NAS'); await page.fill('.modal [data-a="port"]', '5000'); await page.click('.modal [data-a="https"]');
		await page.click('.modal [data-ok]'); await W(500);
		ok('添加页面：名字、端口、https' + T, S.calls.some((c) => c.m === 'xp_set' && c.p.op === 'add' && c.p.name === 'NAS' && c.p.port === '5000' && c.p.https === true && c.p.path === '/') && /已添加：NAS/.test(await page.textContent('#toast')));
		await page.click('[data-xd="9000"]'); await W(300); await page.click('.modal [data-v="true"]'); await W(500);
		ok('删除前确认，删掉' + T, !S.d.list.some((x) => x.port === 9000));
		// ---------- 第 37 项：家里的设备 ----------
		ok('家里的设备：默认没有' + T, /家里的设备/.test(await page.textContent('#xpBody')) && /还没加设备/.test(await page.textContent('#xpBody')));
		await page.click('#xpDAdd'); await W(300);
		const mt = await page.textContent('.modal');
		ok('添加设备：提醒改默认密码、不能长时间看监控；默认选第一台，名字带出来，不用填 IP' + T, /先改掉设备的默认密码/.test(mt) && /不能长时间看监控视频/.test(mt) && (await page.inputValue('.modal [data-a="name"]')) === 'DS920+' && !(await page.isVisible('.modal [data-a="ip"]')));
		const mh = await page.evaluate(() => { const r = document.querySelector('.modal .sheet, .modal > div').getBoundingClientRect(); return [r.height <= innerHeight, document.querySelector('.modal [data-ok]').getBoundingClientRect().bottom <= innerHeight + 1]; });
		await page.screenshot({ path: path.join(SHOT, `xpage-dadd-${w}${dark ? '-dark' : ''}.png`) });
		ok('添加设备的框放得下' + T, mh[0], JSON.stringify(mh));
		await page.selectOption('.modal [data-a="dev"]', 'ip'); await W(100);
		ok('选「手动填 IP」：出现 IP 输入框' + T, await page.isVisible('.modal [data-a="ip"]'));
		await page.fill('.modal [data-a="ip"]', '8.8.8.8'); await page.fill('.modal [data-a="name"]', 'x'); await page.fill('.modal [data-a="port"]', '80');
		await page.click('.modal [data-ok]'); await W(500);
		ok('公网地址：说原因' + T, /只能开家里局域网/.test(await page.textContent('#toast')));
		await page.click('#xpDAdd'); await W(300);
		await page.fill('.modal [data-a="port"]', '5000'); await page.fill('.modal [data-a="path"]', '/webman');
		await page.click('.modal [data-ok]'); await W(500);
		ok('选局域网里的设备加：带 IP、MAC、名字、端口、路径' + T, S.calls.some((c) => c.m === 'xp_set' && c.p.op === 'dadd' && c.p.ip === '192.168.1.20' && c.p.mac === 'aa:bb:cc:00:00:20' && c.p.name === 'DS920+' && c.p.port === '5000' && c.p.path === '/webman') && /已添加：DS920\+/.test(await page.textContent('#toast')));
		await page.click('#xpDAdd'); await W(300);
		await page.selectOption('.modal [data-a="dev"]', '1'); await W(100);
		ok('换一台：名字跟着换' + T, (await page.inputValue('.modal [data-a="name"]')) === '客厅摄像头一个特别长的名字');
		await page.fill('.modal [data-a="port"]', '443'); await page.click('.modal [data-a="https"]');
		await page.click('.modal [data-ok]'); await W(500);
		let td = await page.textContent('#xpBody');
		ok('设备列出来：IP:端口、https' + T, /DS920\+/.test(td) && /192\.168\.1\.20:5000/.test(td) && /https · 192\.168\.1\.130:443/.test(td));
		l = await lay(page); ok('有设备时不错位' + T, !l.length, l.join('；'));
		const pop2P = ctx.waitForEvent('page');
		await page.click('[data-xdo="d1"]');
		const pop2 = await pop2P; await W(2200);
		ok('打开设备：新标签页跳到这台设备' + T, S.calls.some((c) => c.m === 'xp_open' && c.p.dev === 'd1') && /fake-x\?port=192\.168\.1\.20:5000/.test(pop2.url()), pop2.url());
		await pop2.close();
		td = await page.textContent('#xpBody');
		ok('顶上写「正在开着：DS920+」，路由器上的页面不再标「正在用」' + T, /正在开着：DS920\+/.test(td) && !/正在用/.test(td));
		await page.screenshot({ path: path.join(SHOT, `xpage-dev-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		await page.click('[data-xdd="d2"]'); await W(300);
		ok('删设备前确认：不影响设备本身' + T, /删除「客厅摄像头一个特别长的名字」/.test(await page.textContent('.modal')) && /不影响设备本身/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="true"]'); await W(500);
		ok('删掉设备' + T, S.d.devs.length === 1 && /已删除：客厅摄像头/.test(await page.textContent('#toast')));
		await ctx.close();
	}
	// 自建版、本地版
	for (const [mode, re] of [['self', /自建版要在你自己的 Cloudflare 里加一个地址/], ['local', /本地版：连着家里 Wi-Fi 时直接打开/]]) {
		S = fresh({ mode, devs: [{ id: 'd1', name: 'NAS', ip: '192.168.1.20', port: 5000, path: '/webman' }] });
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（' + mode + '）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8197/panel/?p=xpage'); await W(1500);
		const t = await page.textContent('#xpBody');
		if (mode === 'self') ok('自建版：说明 + 看教程，没有「打开」', re.test(t) && (await page.locator('a:has-text("看教程")').count()) === 1 && (await page.locator('[data-xo]').count()) === 0);
		else ok('本地版：「打开」是局域网地址（设备也是）', re.test(t) && (await page.getAttribute('#xpBody a:has-text("打开")', 'href')) === 'http://192.168.1.1:9090/ui/' && (await page.getAttribute('#xpBody .xprow:has-text("NAS") a', 'href')) === 'http://192.168.1.20:5000/webman');
		await page.screenshot({ path: path.join(SHOT, `xpage-${mode}.png`) });
		await ctx.close();
	}
	// 完整原版后台里嵌着的「路由器:端口」页面（lfx.js）：在外面拦下来交给面板
	{
		const b2 = await chromium.launch({ args: ['--host-resolver-rules=MAP panel.test 127.0.0.1'] });
		S = fresh();
		const ctx = await b2.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（原版后台）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://panel.test:8197/panel/?p=home'); await W(1500);
		await page.evaluate(() => { const f = document.createElement('iframe'); f.id = 'lf'; f.src = '/fake-luci'; f.style.cssText = 'position:fixed;inset:60px 0 0 0;width:100%;height:80%;z-index:99;background:#fff'; document.body.appendChild(f); });
		await W(400);
		const fr = page.frame({ url: /fake-luci/ });
		ok('原版后台里嵌着的终端（路由器:7681）：先写「正在打开…」', fr && /正在打开…/.test(await fr.textContent('body')));
		await W(2500);
		ok('官网切好后在原处打开（不另开标签页），地址换成远程页面的', S.calls.some((c) => c.m === 'xp_open' && c.p.port === 7681 && c.p.https === false) && /fake-x\?port=7681/.test(await fr.getAttribute('iframe#tt', 'src') || '') && /端口 7681/.test(await page.frame({ url: /fake-x\?port=7681/ })?.textContent('body') || ''), JSON.stringify(S.calls.filter((c) => c.m === 'xp_open')));
		await page.screenshot({ path: path.join(SHOT, 'xpage-lfull.png') });
		let popP, pop;
		S.calls = [];
		popP = ctx.waitForEvent('page');
		await fr.click('#oc');
		pop = await popP; await W(2200);
		ok('原版后台里 window.open 到「路由器:9090」：也交给面板', S.calls.some((c) => c.m === 'xp_open' && c.p.port === 9090 && /^\/ui\//.test(c.p.path)) && /fake-x\?port=9090/.test(pop.url()));
		await pop.close();
		S.calls = [];
		await fr.click('#same'); await W(500);
		ok('同一个地址的普通链接不拦', !S.calls.some((c) => c.m === 'xp_open'));
		// 概览「控制面板」按钮：在外面也用远程页面的地址打开
		await page.evaluate(() => document.getElementById('lf').remove());
		S.calls = [];
		popP = ctx.waitForEvent('page');
		await page.evaluate(() => document.getElementById('oDash').click());
		pop = await popP; await W(2200);
		ok('概览「控制面板」：在外面按端口 + 控制面板名字打开', S.calls.some((c) => c.m === 'xp_open' && c.p.port > 0 && typeof c.p.ui === 'string' && c.p.ui.length > 0) && /fake-x/.test(pop.url()), JSON.stringify(S.calls.filter((c) => c.m === 'xp_open')));
		await pop.close();
		// 用户 11/27：完整原版后台里点「服务 → 路由器面板」：回到面板首页，不在框里再开一个
		await page.goto('http://panel.test:8197/panel/?p=home'); await W(1200);
		await page.evaluate(() => { const f = document.createElement('iframe'); f.src = '/cgi-bin/luci/admin/services/cmcp'; document.body.appendChild(f); }); await W(1200);
		ok('完整后台里点「路由器面板」：回到面板首页，提示一句', /已回到路由器面板/.test(await page.textContent('#toast')) && await page.isVisible('#p-main'), await page.textContent('#toast'));
		await ctx.close(); await b2.close();
	}
	// 在家（网址是路由器的 IP）：不拦
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
		await page.goto('http://127.0.0.1:8197/fake-luci'); await W(600);
		ok('在家里（网址是 IP）：原版后台里的终端照常嵌着', !!(await page.$('iframe#tt')));
		await ctx.close();
	}
	// 用户 11/27：安卓 App 里不要弹去浏览器，就在 App 里打开（按返回键回到面板）
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 RouterPanelApp/6.0.0' });
		const page = await ctx.newPage(); let pops = 0; ctx.on('page', () => pops++);
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8197/panel/?p=xpage'); await W(1500);
		await page.click('[data-xo="agh"]');
		await page.waitForURL(/fake-x\?port=3000/, { timeout: 15000 }).catch(() => {});
		ok('App 里：不开新窗口，就在 App 里打开远程页面', pops === 0 && /fake-x\?port=3000/.test(page.url()), pops + ' ' + page.url());
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

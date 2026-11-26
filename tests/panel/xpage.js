// 6.0 第 36 项（面板）：远程页面——认识的页面列出来（端口、没在运行的灰掉）；点「打开」先开好新标签页，官网切好再跳过去；
// 正在开着的能关掉；手动加 / 删页面；自建版给教程、本地版给局域网地址；320 / 390 / 430、深色
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
let S;
const fresh = (o = {}) => ({ calls: [], d: { mode: 'hosted', cur: 0, lan: '192.168.1.1', list: [{ id: 'oc', name: 'OpenClash 控制面板', port: 9090, path: '/ui/', https: false, up: true, auto: true }, { id: 'agh', name: 'AdGuard Home', port: 3000, path: '/', up: true, auto: true }, { id: 'ttyd', name: '网页终端（ttyd）', port: 7681, path: '/', https: true, up: false, auto: true }, { id: 'm9000', name: '一个名字特别长的 Docker 管理页面', port: 9000, path: '/', up: true }], ...o } });
function handle(m, p) {
	S.calls.push({ m, p });
	const d = S.d;
	if (m === 'xp_get') return d;
	if (m === 'xp_open') { const x = d.list.find((y) => y.id === p.id); d.cur = x.port; return { url: 'http://localhost:8197/fake-x?port=' + x.port, name: x.name, host: 'abcd2345-x.panel.example', wait: 1 }; }
	if (m === 'xp_close') { d.cur = 0; return { ok: true }; }
	if (m === 'xp_set') { if (p.op === 'del') d.list = d.list.filter((x) => x.port !== +p.port); else d.list.push({ id: 'm' + p.port, name: p.name, port: +p.port, path: p.path, https: p.https, up: true }); return d; }
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (x) => (b += x)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
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
		await ctx.close();
	}
	// 自建版、本地版
	for (const [mode, re] of [['self', /自建版要在你自己的 Cloudflare 里加一个地址/], ['local', /本地版：连着家里 Wi-Fi 时直接打开/]]) {
		S = fresh({ mode });
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（' + mode + '）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8197/panel/?p=xpage'); await W(1500);
		const t = await page.textContent('#xpBody');
		if (mode === 'self') ok('自建版：说明 + 看教程，没有「打开」', re.test(t) && (await page.locator('a:has-text("看教程")').count()) === 1 && (await page.locator('[data-xo]').count()) === 0);
		else ok('本地版：「打开」是局域网地址', re.test(t) && (await page.getAttribute('#xpBody a:has-text("打开")', 'href')) === 'http://192.168.1.1:9090/ui/');
		await page.screenshot({ path: path.join(SHOT, `xpage-${mode}.png`) });
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

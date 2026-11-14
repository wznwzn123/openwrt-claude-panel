// 路由器升级后手机自动换成新版面板（面板先从缓存打开）；只刷新一次；开发版不管；首页设备合计/同名标注
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const TOK = 'testtoken1234567890abc';
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c]); if (!c) problems.push(n); console.log((c ? '✓ ' : '✗ ') + n + (note && !c ? '（' + note + '）' : '')); };
const S = { panel: '2.0.2', router: '2.0.2', htmlHits: 0, swHits: 0, swExtra: '' };
const html = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('<meta name="panel-ver" content="dev">', S.panel === 'dev' ? '<meta name="panel-ver" content="dev">' : `<meta name="panel-ver" content="${S.panel}">`);
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, '');
		let result;
		if (m === 'update_check') result = { cur: S.router, code: 'hosted-ai', latest: S.router, notes: '', newer: false, force: false };
		else if (m === 'home_stats') result = { today: { day: '2026-11-01', dl: 3261033089, ul: 389520538, counting: true, top: [{ id: '02:00:00:00:a1:01', name: 'Xiaomi-14', dl: 3185177582, ul: 351421241 }, { id: 'router', name: '路由器自己', dl: 66078706, ul: 33177817 }, { id: '02:00:00:00:c3:03', name: 'Xiaomi-14', dl: 9766553, ul: 4913644 }] }, devices: { online: 0, wifi: 0, wired: 0, total: 2 } };
		else if (m === 'cloud_info') result = { enabled: false };
		else result = respond(m, body.params || {});
		return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html';
	if (p === 'index.html') { S.htmlHits++; res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(html()); }
	if (p === 'sw.js') { S.swHits++; res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8') + S.swExtra); }
	const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8171, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
	await ctx.addInitScript((t) => { localStorage.setItem('rp_token', t); }, TOK);
	const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	let navs = 0; page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
	const ver = () => page.evaluate(() => document.querySelector('meta[name="panel-ver"]')?.content);
	const ctl = () => page.evaluate(() => !!navigator.serviceWorker.controller);

	// 1. 第一次打开：手机缓存住 2.0.2 的面板
	await page.goto('http://localhost:8171/panel/'); await W(2500);
	for (let i = 0; i < 20 && !(await ctl()); i++) await W(300);
	if (!(await ctl())) { await page.reload(); await W(2500); }
	ok('准备：面板已经缓存在手机上（离线也能打开的那份）', await ctl());
	navs = 0; await W(3000);
	ok('版本一样（都是 2.0.2）：不刷新', navs === 0 && (await ver()) === '2.0.2');

	// 2. 路由器升级到 2.0.3（终端里装的 / 远程升级），手机再打开
	S.panel = '2.0.3'; S.router = '2.0.3';
	navs = 0; await page.reload(); await W(1000);
	ok('升级后第一次打开：先显示的是缓存里的旧面板（这就是要修的情况）', (await ver()) === '2.0.2');
	for (let i = 0; i < 40 && (await ver().catch(() => '')) !== '2.0.3'; i++) await W(500);
	ok('发现路由器是 2.0.3：自动换成新版面板，不用关掉重开', (await ver()) === '2.0.3', 'ver=' + (await ver()));
	const n1 = navs; await W(5000);
	ok('换好之后不再刷新', navs === n1, `刷新了 ${navs} 次`);
	await page.reload(); await W(3000);
	ok('再打开一次：直接是新版，不再刷新', (await ver()) === '2.0.3');

	// 3. sw.js 也变了的升级（多数版本都会改到它）
	S.panel = '2.0.4'; S.router = '2.0.4'; S.swExtra = '\n// v2.0.4';
	navs = 0; await page.reload(); await W(1000);
	for (let i = 0; i < 40 && (await ver().catch(() => '')) !== '2.0.4'; i++) await W(500);
	ok('sw.js 也更新了的版本：同样自动换成新版', (await ver()) === '2.0.4', 'ver=' + (await ver()));

	// 4. 万一换不成功（路由器上的面板文件还是旧的）：只刷新一次，不会一直刷
	S.panel = '2.0.4'; S.router = '2.0.5';
	navs = 0; await page.reload(); await W(14000);
	ok('换不成功时只自动刷新一次，不会一直刷', navs <= 2, `刷新了 ${navs} 次`);
	ok('页面还能正常用（首页在）', await page.isVisible('#p-main'));

	// 5. 首页「今天用得最多」
	S.router = '2.0.4';
	await page.reload(); await W(4000);
	const t = await page.textContent('#mTopT'), rows = await page.$$eval('#mTop .mrow', (a) => a.map((x) => x.textContent));
	ok('首页设备一栏写明是「下行 + 上行合计」', /下行 \+ 上行合计/.test(t), t);
	ok('同名的第二个 Xiaomi-14 标上「另一个地址」，第一个不标', rows.length === 3 && !/另一个地址/.test(rows[0]) && /Xiaomi-14（另一个地址）/.test(rows[2]), JSON.stringify(rows));
	await page.locator('#p-main').screenshot({ path: path.join(__dirname, 'shots', 'verfix-home.png') });
	await ctx.close();

	// 6. 开发版（没打版本号）：不管
	S.panel = 'dev'; S.router = '2.0.4';
	const c2 = await browser.newContext({ viewport: { width: 412, height: 915 } }); await c2.addInitScript((t) => { localStorage.setItem('rp_token', t); }, TOK);
	const p2 = await c2.newPage(); let nv = 0; p2.on('framenavigated', (f) => { if (f === p2.mainFrame()) nv++; });
	await p2.goto('http://localhost:8171/panel/'); await W(6000);
	ok('没打版本号的开发版：不自动刷新', nv === 1, `刷新了 ${nv} 次`);
	await c2.close();

	await browser.close(); server.close();
	ok('页面没有报错', !problems.some((x) => /页面错误/.test(x)), problems.join(' | '));
	console.log(`通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

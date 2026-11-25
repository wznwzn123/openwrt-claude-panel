// 6.0 第 27 项（面板）：实时监控——网速、负载（1/5/15 分钟）、连接数三张曲线，每 2 秒更新；
// 负载超过核数标橙、连接数到上限 80% 标红；菜单「状态 → 实时监控」打开这页（不再跳原版后台）；离开这页就不再问
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const S = { n: 0, hot: false };
function handle(m, p) {
	if (m === 'mon') { S.n++; const k = S.n; return { load: S.hot ? [5.2, 3.1, 1.2] : [0.42 + (k % 3) * 0.1, 0.38, 0.31], cpus: 4, cpu: 20 + (k % 5), conn: S.hot ? 14000 : 1200 + k * 37, conn_max: 16384, rx: 150000 + (k % 4) * 90000, tx: 6000 + (k % 3) * 3000, mem: 60 }; }
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); try { return J({ jsonrpc: '2.0', id: body.id, result: handle(body.method.replace(/^panel\//, ''), body.params || {}) }); } catch (e) { return J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8192, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S.n = 0; S.hot = false;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8192/panel/?p=mon'); await W(7000);
		ok('每 2 秒问一次路由器' + T, S.n >= 3 && S.n <= 5, S.n);
		ok('网速：下载、上传' + T, /↓/.test(await page.textContent('#mnRx')) && /bps/.test(await page.textContent('#mnRx')) && /↑/.test(await page.textContent('#mnTx')));
		ok('负载：1/5/15 分钟三个数，CPU 使用率和核数' + T, /0\.38/.test(await page.textContent('#mnLoad')) && /0\.31/.test(await page.textContent('#mnLoad')) && /CPU \d+% · 4 核/.test(await page.textContent('#mnCpu')));
		ok('连接数：现在多少 / 上限' + T, /^1,\d{3} \/ 16,384$/.test((await page.textContent('#mnConn')).trim()), await page.textContent('#mnConn'));
		ok('三张曲线都画出来了' + T, (await page.locator('#mnNet path').count()) >= 2 && (await page.locator('#mnLd path').count()) >= 2 && (await page.locator('#mnCn path').count()) >= 2);
		ok('负载曲线上有一条核数的参考线' + T, (await page.locator('#mnLd line').count()) === 1);
		ok('不横向滚动，标题行不换行' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.mnhead')].every((x) => x.getBoundingClientRect().height < 30)));
		await page.screenshot({ path: path.join(SHOT, `mon-${w}${dark ? '-dark' : ''}.png`) });
		// 忙的时候
		S.hot = true; await W(2600);
		ok('负载超过核数：1 分钟那个标橙' + T, (await page.locator('#mnLoad b.ndwarn').count()) === 1);
		ok('连接数到上限 80%：标红' + T, await page.locator('#mnConn.ndbad').count() === 1);
		await page.screenshot({ path: path.join(SHOT, `mon-hot-${w}${dark ? '-dark' : ''}.png`) });
		// 离开这页就不再问
		await page.evaluate(() => { location.hash = ''; });
		await page.goto('http://localhost:8192/panel/?p=dev'); await W(500); const n0 = S.n; await W(4500);
		ok('离开这页：不再问' + T, S.n === n0, `${n0} → ${S.n}`);
		await ctx.close();
	}
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8192/panel/?p=home'); await W(1500);
		const nav = await page.evaluate(() => [...document.querySelectorAll('[data-p]')].map((b) => [b.dataset.p, b.textContent.trim()]));
		await page.click('#sCpu'); await W(1200);
		ok('概览点 CPU 格：进实时监控', await page.isVisible('#p-mon') && /实时监控/.test(await page.textContent('#topbar')));
		await page.goto('http://localhost:8192/panel/?p=home'); await W(1500);
		ok('菜单「实时监控」是这一页；「无线信号」还在（移到「更多状态」）', nav.some((x) => x[0] === 'mon' && /实时监控/.test(x[1])) && !nav.some((x) => /realtime\/(bandwidth|load|connections)/.test(x[0])), JSON.stringify(nav.filter((x) => /realtime|mon/.test(x[0]))));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

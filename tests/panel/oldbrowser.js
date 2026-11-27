// 老手机的系统浏览器（11/27 全面检查第 29 条）：缺 Object.fromEntries、Array.prototype.flatMap 也能用（页头补上）；
// 面板脚本跑不起来（老浏览器解析不了）时 10 秒后说清楚怎么办，不留白屏；正常打开不出这句
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel');
const results = [];
const ok = (n, c, note) => { results.push(!!c); console.log((c ? '✓ ' : '✗ ') + n + (note && !c ? '（' + note + '）' : '')); };
let BREAK = false;
const server = http.createServer((req, res) => {
	let b = ''; req.on('data', (d) => (b += d));
	req.on('end', () => {
		const u = new URL(req.url, 'http://x');
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, '');
			let result; try { result = respond(m, body.params || {}); } catch (e) { return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -1, message: e.message } })); }
			return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
		}
		if (u.pathname.startsWith('/cloud/')) return res.end('{"ok":true,"subs":[]}');
		const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
		let body = fs.readFileSync(f);
		// 模拟老浏览器解析不了面板脚本：在面板主脚本里塞一句语法错误（整段脚本都不会跑）
		if (BREAK && p === 'index.html') { const s = body.toString('utf8'), i = s.lastIndexOf('<script>'); body = Buffer.from(s.slice(0, i + 8) + 'let = = ;\n' + s.slice(i + 8)); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
		res.end(body);
	});
});
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8184, r));
	const browser = await chromium.launch();
	const shot = (n) => path.join(__dirname, 'shots', n);
	// 1. 缺两个新函数的浏览器：页头补上，面板照常用（侧边栏搜索要用 flatMap）
	{
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
		const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); delete Object.fromEntries; delete Array.prototype.flatMap; });
		await page.goto('http://localhost:8184/panel/?p=main'); await W(3500);
		await page.fill('#sideQ', '端口'); await W(500);
		const r = await page.evaluate(() => ({ fe: typeof Object.fromEntries, fm: typeof [].flatMap, side: document.getElementById('sidenav').textContent, old: !!document.getElementById('rpOld'), boot: window.__rpBoot }));
		ok('没有 Object.fromEntries、flatMap 的浏览器：页头补上，面板照常打开、侧边栏能搜', r.fe === 'function' && r.fm === 'function' && /端口转发/.test(r.side) && !r.old && r.boot === 1 && !errs.length, JSON.stringify({ ...r, side: r.side.slice(0, 60), errs }));
		await W(8000);
		ok('正常打开：10 秒后也不出「浏览器太旧」', !(await page.evaluate(() => !!document.getElementById('rpOld'))));
		await ctx.close();
	}
	// 2. 面板脚本跑不起来：10 秒后说清楚，不是白屏
	for (const [w, h, dark] of [[320, 568, false], [390, 844, true]]) {
		BREAK = true;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage();
		await page.addInitScript(() => localStorage.setItem('rp_token', 'testtoken1234567890'));
		await page.goto('http://localhost:8184/panel/?p=main'); await W(3000);
		ok(`［${w}］脚本跑不起来：前 10 秒先不说（慢的手机也许还在加载）`, !(await page.evaluate(() => !!document.getElementById('rpOld'))));
		await W(8000);
		const r = await page.evaluate(() => { const e = document.getElementById('rpOld'); if (!e) return null; const b = e.getBoundingClientRect(); return { t: e.textContent, full: b.width >= innerWidth - 1 && b.height >= innerHeight - 1, sw: document.documentElement.scrollWidth <= innerWidth }; });
		ok(`［${w}］10 秒后：盖满屏幕写清楚「浏览器太旧」和怎么办，不横向超出`, r && /浏览器版本太旧/.test(r.t) && /Android System WebView/.test(r.t) && r.full && r.sw, JSON.stringify(r));
		await page.screenshot({ path: shot(`oldbrowser-${w}${dark ? '-dark' : ''}.png`) });
		await ctx.close(); BREAK = false;
	}
	await browser.close(); server.close();
	console.log(`通过 ${results.filter(Boolean).length}/${results.length}`);
	process.exit(results.every(Boolean) ? 0 : 1);
})();

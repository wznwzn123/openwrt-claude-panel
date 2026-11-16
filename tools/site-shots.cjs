// 官网首页用的面板截图（演示数据）：用面板测试的模拟路由器（tests/panel/mock.js）打开 src/www/panel，按 2 倍清晰度截图，
// 再转成 cloud/site/img/名字.webp。改了面板界面以后可以重新生成：node tools/site-shots.cjs（要 Playwright 和 python3 的 Pillow）
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { respond } = require('../tests/panel/mock');
const ROOT = path.join(__dirname, '..', 'src', 'www', 'panel'), OUT = path.join(__dirname, '..', 'cloud', 'site', 'img');
const server = http.createServer((req, res) => {
	let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
		const u = new URL(req.url, 'http://x');
		if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: m === 'cloud_info' ? { enabled: false } : respond(m, body.params || {}) })); }
		if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
		const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
	});
});
const W = (ms) => new Promise((r) => setTimeout(r, ms));
// 名字 → [打开哪一页, 浅色/深色, 打开后要做的事]
const SHOTS = {
	home: ['main', 'light'],
	dev: ['dev', 'light'],
	pause: ['dev', 'light', async (page) => { await page.locator('#dvList [data-pause]').first().click(); await W(700); await page.click('[data-pz="60"]'); await W(900); }],
	traf: ['traf', 'light'],
	wd: ['wd', 'light'],
	dark: ['main', 'dark'],
};
(async () => {
	await new Promise((r) => server.listen(8197, r));
	const browser = await chromium.launch(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'site-shots-'));
	for (const [name, [p, scheme, act]] of Object.entries(SHOTS)) {
		const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, colorScheme: scheme, deviceScaleFactor: 2 });
		const page = await ctx.newPage();
		await page.addInitScript(() => { try { localStorage.setItem('rp_token', 'testtokentesttokentest'); localStorage.setItem('rp_bar_tip', '1'); } catch (e) {} });
		await page.goto('http://localhost:8197/panel/?p=' + p); await W(p === 'main' ? 12000 : 3500); // 首页等实时流量多攒几个点，曲线才自然
		if (scheme === 'dark') { await page.evaluate(() => document.documentElement.classList.add('dark')); await W(400); }
		if (act) await act(page);
		const png = path.join(tmp, name + '.png');
		await page.screenshot({ path: png });
		execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert("RGB").save(sys.argv[2], "WEBP", quality=80, method=6)', png, path.join(OUT, name + '.webp')]);
		console.log(name, fs.statSync(path.join(OUT, name + '.webp')).size, 'bytes');
		await ctx.close();
	}
	await browser.close(); server.close();
	fs.rmSync(tmp, { recursive: true, force: true });
})();

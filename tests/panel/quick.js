// 首页快捷操作：分三组、每组一行 4 个、文字一行不换行、窄屏也不挤；确认框用完整名称
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: respond(body.method.replace(/^panel\//, ''), body.params || {}) })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(403); return res.end('{}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
(async () => {
	await new Promise((r) => server.listen(8101, r));
	const browser = await chromium.launch();
	for (const [w, dark] of [[390, false], [390, true], [360, false]]) {
		const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => localStorage.setItem('rp_token', 'testtoken1234567890'));
		await page.goto('http://localhost:8101/panel/?p=home'); await page.waitForTimeout(1800);
		const info = await page.$$eval('#qGrid > *', (els) => els.map((e) => ({ h: e.classList.contains('qgh'), t: e.textContent.trim(), top: Math.round(e.getBoundingClientRect().top), lines: e.querySelector('span') ? Math.round(e.querySelector('span').getBoundingClientRect().height / 14) : 0, cut: e.querySelector('span') ? e.querySelector('span').scrollWidth > e.querySelector('span').clientWidth + 1 : false })));
		const T = `（${w}px${dark ? ' 深色' : ''}）`;
		const heads = info.filter((x) => x.h).map((x) => x.t);
		ok('分成 OpenClash / 清理 / 更新 三组' + T, heads.join(',') === 'OpenClash,清理,更新', heads.join(','));
		const btns = info.filter((x) => !x.h);
		const rows = [...new Set(btns.map((x) => x.top))];
		ok('12 个按钮正好 3 行，每行 4 个' + T, btns.length === 12 && rows.length === 3, rows.join(','));
		ok('文字都一行显示、没被截断' + T, btns.every((x) => x.lines <= 1 && !x.cut), JSON.stringify(btns.filter((x) => x.lines > 1 || x.cut)));
		const sw = await page.evaluate(() => document.documentElement.scrollWidth);
		ok('不横向滚动' + T, sw <= w, sw);
		if (w === 390 && !dark) {
			await page.click('[data-q="update_chnroute"]'); await page.waitForTimeout(400);
			ok('确认框标题用完整名称', /更新大陆 IP 白名单/.test(await page.textContent('.modal h3')));
			await page.click('.modal [data-v="false"]'); await page.waitForTimeout(400);
			await page.click('#dock [data-d="quick"]'); await page.waitForTimeout(500);
			ok('底栏「快捷」弹出的也是同样的分组', (await page.locator('.modal .qgh').count()) === 3 && (await page.locator('.modal .qbtn').count()) === 12);
			await page.screenshot({ path: path.join(__dirname, 'shots', 'quick-sheet.png') });
			await page.click('.modal [data-v="close"]'); await page.waitForTimeout(400);
		}
		await page.evaluate(() => document.getElementById('qGrid').scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
		await page.screenshot({ path: path.join(__dirname, 'shots', `quick-${w}${dark ? '-dark' : ''}.png`) });
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

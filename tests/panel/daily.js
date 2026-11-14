// 每日体检卡片（断线记录页）：没体检过、现在体检、问题排前面、详情、断网时用上次的结果
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond, DYD } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
let down = false;
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { if (down) return req.socket.destroy(); const body = JSON.parse(b || '{}'); const go = () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: respond(body.method.replace(/^panel\//, ''), body.params || {}) })); }; return body.params && body.params.run ? setTimeout(go, 700) : go(); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(403); return res.end('{}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8105, r));
	const browser = await chromium.launch();
	for (const dark of [false, true]) {
		DYD.d = null; DYD.runs = 0; down = false;
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => localStorage.setItem('rp_token', 'testtoken1234567890'));
		await page.goto('http://localhost:8105/panel/?p=wd'); await W(1800);
		const T = dark ? '（深色）' : '';
		if (!dark) {
			ok('断线记录页有「每日体检」卡片', (await page.locator('#dyCard').count()) === 1);
			ok('没体检过：说明每天 9:00 自动体检并推送，有「现在体检」', /每天 9:00 自动体检/.test(await page.textContent('#dyCard')) && (await page.locator('[data-dyrun]').count()) === 1 && /还没体检过/.test(await page.textContent('#dyPill')));
			await page.click('[data-dyrun]'); await W(250);
			ok('体检中按钮显示「体检中」', /体检中/.test(await page.textContent('[data-dyrun]')));
			await W(1000);
			const t = await page.textContent('#dyCard');
			ok('体检完成：提示结果、标签显示问题数', DYD.runs === 1 && /体检完成：发现 2 个问题/.test(await page.textContent('body')) && /发现 2 个问题/.test(await page.textContent('#dyPill')));
			const rows = await page.$$eval('#dyCard .dyrow', (e) => e.map((x) => x.querySelector('.wdot').className.replace('wdot ', '') + ':' + x.textContent.trim()));
			ok('问题排在前面：红（严重）→ 黄（注意）→ 绿（正常）', rows.length === 4 && /^err:温度过高/.test(rows[0]) && /^warn:24 小时内/.test(rows[1]) && /^ok/.test(rows[2]) && /^ok/.test(rows[3]), rows.join(' | '));
			ok('有详情的显示在下面一行', /检查通风/.test(t) && /iPhone（192\.168\.5\.50）/.test(t));
			ok('显示体检时间和项数', /今天 \d\d:\d\d 体检 · 共 4 项/.test(t), t.slice(0, 120));
			// 断网：用上次的结果
			down = true;
			await page.reload(); await W(2500);
			ok('连不上路由器时也能看上次的体检结果', /温度过高/.test(await page.textContent('#dyCard')));
			down = false;
			const w = await page.evaluate(() => document.documentElement.scrollWidth);
			ok('不横向滚动', w <= 390, w);
		} else {
			await page.click('[data-dyrun]'); await W(1400);
		}
		await page.evaluate(() => document.getElementById('dyCard').scrollIntoView({ block: 'center' })); await W(300);
		await page.screenshot({ path: path.join(__dirname, 'shots', 'daily' + (dark ? '-dark' : '') + '.png') });
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

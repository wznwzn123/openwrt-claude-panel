// 「打开控制面板」自动带上地址和密钥
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW || path.join(__dirname, '..', '..', 'src', 'www')); const problems = []; const results = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
(async () => {
	const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
	page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await ctx.route('http://panel.test/**', async (route) => { const u = new URL(route.request().url());
		if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(route.request().postData() || '{}'); await new Promise((r) => setTimeout(r, 150)); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: respond(body.method, body.params || {}) }) }); }
		let f = path.join(ROOT, u.pathname); if (f.endsWith('/')) f += 'index.html'; if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
		return route.fulfill({ status: 200, contentType: f.endsWith('.html') ? 'text/html' : 'application/octet-stream', body: fs.readFileSync(f) }); });
	await ctx.route('http://192.168.5.1:9090/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>dash</title>ok' }));
	await page.addInitScript(() => localStorage.setItem('rp_token', 'testtoken1234567890'));
	await page.goto('http://panel.test/panel/?p=home'); await page.waitForTimeout(1500);
	const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }), page.click('#oDash')]);
	await pop.waitForLoadState().catch(() => {}); await page.waitForTimeout(600);
	const u = pop.url();
	ok('不再弹确认框，直接打开', !(await page.locator('.modal').count()));
	ok('打开的是 MetaCubeXD 并带上地址、端口、密钥', u === 'http://192.168.5.1:9090/ui/metacubexd/#/setup?http=1&hostname=192.168.5.1&port=9090&secret=se%20cret%2F1', u);
	ok('新窗口拿不到面板（安全）', (await pop.evaluate(() => window.opener)) === null);
	ok('有提示', /自动登录/.test(await page.textContent('#toast')));
	await browser.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`); if (problems.length) console.log('问题：\n - ' + problems.join('\n - '));
})();

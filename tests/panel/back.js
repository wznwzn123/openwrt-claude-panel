// 安卓返回键：按两次才退出；先关弹窗 / 侧边栏；电脑和苹果手机不受影响
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: respond(body.method.replace(/^panel\//, ''), body.params || {}) })); }
	if (u.pathname === '/before') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<title>before</title>上一个网页'); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(403); return res.end('{}'); }
	let p = u.pathname.replace(/^\/panel\//, '') || 'index.html'; const f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const AND = 'Mozilla/5.0 (Linux; Android 15; 23127PN0CC) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36 EdgA/130';
(async () => {
	await new Promise((r) => server.listen(8090, r));
	const browser = await chromium.launch();
	const mk = async (ua) => {
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: ua });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8090/before'); await page.goto('http://localhost:8090/panel/'); await page.waitForTimeout(2500);
		return page;
	};
	const back = async (page) => { await page.goBack({ waitUntil: 'commit', timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500); };
	const onPanel = (page) => page.url().includes('/panel/');
	// 安卓
	let page = await mk(AND);
	await page.click('#pageTitle'); await page.waitForTimeout(200);
	await back(page);
	ok('安卓：按一次返回不退出，提示再按一次', onPanel(page) && /再按一次返回键退出/.test(await page.textContent('#toast')), page.url());
	await back(page);
	ok('安卓：连续按第二次才退出', !onPanel(page) && page.url().endsWith('/before'), page.url());
	// 先关侧边栏
	page = await mk(AND);
	await page.click('#menuBtn'); await page.waitForTimeout(500);
	ok('侧边栏打开了', await page.evaluate(() => document.getElementById('side').classList.contains('open')));
	await back(page);
	ok('安卓：返回键先关侧边栏，不退出', onPanel(page) && !(await page.evaluate(() => document.getElementById('side').classList.contains('open'))));
	await page.click('#pageTitle'); await page.waitForTimeout(200);
	await back(page);
	ok('关掉侧边栏后：再按返回又提示一次', onPanel(page) && /再按一次返回键退出/.test(await page.textContent('#toast')));
	// 先关弹窗
	await page.click('#pageTitle'); await page.waitForTimeout(200);
	await page.goto('http://localhost:8090/panel/?p=dev'); await page.waitForTimeout(2000);
	await page.click('#dvList [data-i="0"] [data-pause]'); await page.waitForTimeout(500);
	ok('弹窗打开了', (await page.locator('.modal').count()) === 1);
	await back(page);
	ok('安卓：返回键先关弹窗，不退出', onPanel(page) && (await page.locator('.modal').count()) === 0);
	// 电脑 / 苹果手机：不拦
	page = await mk('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
	await page.click('#pageTitle'); await page.waitForTimeout(200);
	await back(page);
	ok('苹果手机：返回键照常（按一次就回上一页）', !onPanel(page));
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

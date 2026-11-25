// 6.0 新手引导：第一次打开（含升级的老用户）在概览上出 4 步——左上角图标是菜单、往下拉刷新、铃铛、底部快捷栏；
// 每步高亮那一处、卡片不出屏幕；能跳过；看过不再出；有弹窗时不出；电脑宽屏换成「点 ● 在线 刷新」。
// 同时测：下拉刷新（拉够了刷新、拉一点不刷新、有弹窗不刷新）、点「● 在线」刷新、左上角图标打开菜单
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const S = { n: 0 };
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); const m = body.method.replace(/^panel\//, ''); if (m === 'overview') S.n++; try { return J({ jsonrpc: '2.0', id: body.id, result: mock.respond(m, body.params || {}) }); } catch (e) { return J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const inView = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; }, sel);
// 用 CDP 模拟手指从 y0 拉到 y1
async function drag(page, x, y0, y1) {
	const c = await page.context().newCDPSession(page);
	await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
	for (let i = 1; i <= 10; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 10 }] }); await W(16); }
	await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
(async () => {
	await new Promise((r) => server.listen(8173, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_tourtest', '1'); });
		await page.goto('http://localhost:8173/panel/?p=home'); await W(6500);
		ok('第一次打开：出引导' + T, await page.isVisible('.tour'), JSON.stringify(await page.evaluate(() => ({ dot: document.getElementById('statusDot').className, modal: [...document.querySelectorAll('.modal')].map((m) => m.textContent.slice(0, 40)), url: location.href }))));
		if (!(await page.isVisible('.tour'))) break;
		let t = await page.textContent('.tourcard');
		ok('第 1 步：左上角图标是菜单，写着从这里切换' + T, /点这里打开菜单/.test(t) && /切换/.test(t) && /1 \/ 4/.test(t), t);
		const hb = await page.locator('.tourhole').boundingBox(), mb = await page.locator('#menuBtn').boundingBox();
		ok('高亮框罩住左上角图标' + T, hb && mb && hb.x <= mb.x && hb.y <= mb.y && hb.x + hb.width >= mb.x + mb.width && hb.y + hb.height >= mb.y + mb.height);
		ok('卡片在屏幕里' + T, await inView(page, '.tourcard'));
		await page.screenshot({ path: path.join(SHOT, `tour-1-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.tournext'); await W(400);
		t = await page.textContent('.tourcard');
		ok('第 2 步：往下拉刷新' + T, /往下拉刷新/.test(t) && await inView(page, '.tourcard'));
		await page.screenshot({ path: path.join(SHOT, `tour-2-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.tournext'); await W(400);
		ok('第 3 步：铃铛是通知' + T, /通知在这里/.test(await page.textContent('.tourcard')) && await inView(page, '.tourcard'));
		await page.click('.tournext'); await W(400);
		t = await page.textContent('.tourcard');
		ok('第 4 步：底部快捷栏，卡片在它上面，按钮是「知道了」，没有「跳过」' + T, /常用操作/.test(t) && /知道了/.test(t) && !(await page.isVisible('.tourskip')) && (await page.locator('.tourcard').boundingBox()).y < (await page.locator('#dock').boundingBox()).y);
		await page.screenshot({ path: path.join(SHOT, `tour-4-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.tournext'); await W(300);
		ok('看完：关掉，记下来' + T, !(await page.isVisible('.tour')) && (await page.evaluate(() => localStorage.getItem('rp_tour6'))) === '1');
		await page.reload(); await W(6000);
		ok('再打开：不再出' + T, !(await page.isVisible('.tour')));
		// 下拉刷新
		const n0 = S.n;
		await drag(page, w / 2, 120, 160); await W(800);
		ok('拉一点点：不刷新' + T, S.n === n0, `${n0} → ${S.n}`);
		await page.evaluate(() => { window.__ptrSeen = false; new MutationObserver(() => { if (document.getElementById('ptr').classList.contains('run')) window.__ptrSeen = true; }).observe(document.getElementById('ptr'), { attributes: true }); });
		await drag(page, w / 2, 120, 320); await W(200);
		ok('拉够了：顶上出现转圈' + T, await page.evaluate(() => window.__ptrSeen));
		await W(1500);
		ok('拉够了：刷新，转圈收起' + T, S.n > n0 && !(await page.evaluate(() => document.getElementById('ptr').classList.contains('run'))), `${n0} → ${S.n}`);
		const n1 = S.n;
		await page.click('#statusPill'); await W(1500);
		ok('点「● 在线」：刷新' + T, S.n > n1);
		await page.click('#menuBtn'); await W(500);
		ok('点左上角图标：打开菜单' + T, await page.evaluate(() => document.getElementById('side').classList.contains('open')));
		const n2 = S.n;
		await drag(page, w - 20, 120, 360); await W(1200);
		ok('菜单开着时下拉：不刷新' + T, S.n === n2);
		ok('不横向滚动' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		ok('浏览器自己的下拉重新加载关掉了' + T, await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY === 'contain'));
		await ctx.close();
	}
	// 跳过
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_tourtest', '1'); });
		await page.goto('http://localhost:8173/panel/?p=home'); await W(6500);
		await page.click('.tourskip'); await W(300);
		ok('点「跳过」：关掉，以后不再出', !(await page.isVisible('.tour')) && (await page.evaluate(() => localStorage.getItem('rp_tour6'))) === '1');
		await ctx.close();
	}
	// 电脑宽屏：没有菜单那一步，刷新是「点这里」
	{
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（电脑）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_tourtest', '1'); });
		await page.goto('http://localhost:8173/panel/?p=home'); await W(6500);
		const t = await page.textContent('.tourcard');
		ok('电脑：第 1 步就是「点这里刷新」（高亮「● 在线」），共 3 步', /点这里刷新/.test(t) && /1 \/ 3/.test(t), t);
		await page.screenshot({ path: path.join(SHOT, 'tour-desktop.png') });
		await ctx.close();
	}
	// 自动化环境默认不出（不挡别的测试）
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8173/panel/?p=home'); await W(6500);
		ok('自动化测试环境：不出引导', !(await page.isVisible('.tour')));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

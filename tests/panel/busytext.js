// 没有按钮可转圈的操作（切模式、换节点、重启插件、切配置……共 34 处 busy(null)）：转圈旁边写「正在处理」，不写「正在刷新」；
// 超过 4 秒「正在处理 请耐心等待」；先弹确认框的，确认框开着时不转圈（11/27 全面检查第 9 条）
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel');
const results = [];
const ok = (n, c, note) => { results.push(!!c); console.log((c ? '✓ ' : '✗ ') + n + (note && !c ? '（' + note + '）' : '')); };
let SLOW = 0;
const server = http.createServer((req, res) => {
	let b = ''; req.on('data', (d) => (b += d));
	req.on('end', async () => {
		const u = new URL(req.url, 'http://x');
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, '');
			if (SLOW && m === 'set_mode') await new Promise((z) => setTimeout(z, SLOW));
			let result; try { result = respond(m, body.params || {}); } catch (e) { return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -1, message: e.message } })); }
			return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
		}
		if (u.pathname.startsWith('/cloud/')) return res.end('{"ok":true,"subs":[]}');
		const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8188, r));
	const browser = await chromium.launch();
	const errs = [];
	for (const [w, h, dark] of [[320, 568, false], [390, 844, true]]) {
		const T = `［${w}${dark ? ' 深色' : ''}］`;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
		await page.addInitScript(() => localStorage.setItem('rp_token', 'testtoken1234567890'));
		await page.goto('http://localhost:8188/panel/?p=home'); await W(3500);
		const ptr = () => page.evaluate(() => { const e = document.getElementById('ptr'), r = e.getBoundingClientRect(); return { run: e.classList.contains('run'), t: e.textContent.trim(), l: r.left, r: r.right, W: document.documentElement.clientWidth }; });
		const chip = page.locator('#modeChips [data-mode]:not(.on):not([data-mode="rule"])').first();
		SLOW = 6500;
		// 取消：不转圈、什么都不做
		await chip.click(); await W(700);
		const a = await ptr();
		ok('先弹确认框：确认框开着时不转圈' + T, (await page.locator('.modal').count()) === 1 && !a.run, JSON.stringify(a));
		await page.locator('.modal').last().locator('[data-v="false"]').click(); await W(600);
		ok('点「取消」：不转圈' + T, !(await ptr()).run);
		// 确认：写「正在处理」，超过 4 秒「正在处理 请耐心等待」，好了就收起
		await chip.click(); await W(700);
		await page.locator('.modal').last().locator('[data-v="true"]').click(); await W(700);
		const b1 = await ptr();
		ok('点了确认：转圈旁边写「正在处理」（不是「正在刷新」）' + T, b1.run && b1.t === '正在处理', JSON.stringify(b1));
		await W(4300);
		const b2 = await ptr();
		ok('超过 4 秒：「正在处理 请耐心等待」，不出屏幕' + T, b2.run && b2.t === '正在处理 请耐心等待' && b2.l >= 0 && b2.r <= b2.W, JSON.stringify(b2));
		await page.screenshot({ path: path.join(__dirname, 'shots', `busytext-${w}${dark ? '-dark' : ''}.png`) });
		SLOW = 0; await W(3500);
		ok('做完了：收起' + T, !(await ptr()).run);
		// 点「在线」刷新照样写「正在刷新」
		await page.evaluate(() => document.getElementById('statusPill').click()); await W(150);
		const c = await ptr();
		ok('点「在线」刷新：还是写「正在刷新」' + T, !c.run || c.t === '正在刷新', JSON.stringify(c));
		await W(2500);
		await ctx.close();
	}
	await browser.close(); server.close();
	ok('页面没有报错', !errs.length, errs.join(' | '));
	console.log(`通过 ${results.filter(Boolean).length}/${results.length}`);
	process.exit(results.every(Boolean) ? 0 : 1);
})();

// 强制更新：不在首页（直接打开别的页面）也会弹吗？开着面板放到后台、回来时会不会再查？
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
let FORCE = true, checks = 0;
const results = []; const ok = (n, c, note) => results.push([n, !!c, note || '']);
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), a = body.params || {};
			let result;
			if (m === 'update_check') { checks++; result = FORCE ? { cur: '3.0.1', latest: '3.0.2', notes: '测试', newer: true, force: true } : { cur: '3.0.1', latest: '3.0.1', notes: '', newer: false, force: false }; }
			else result = respond(m, a);
			res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
		}
		const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
	});
});
(async () => {
	await new Promise((r) => server.listen(8096, r));
	const browser = await chromium.launch();
	for (const pg of ['traf', 'dev', 'cbk', 'set']) {
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
		const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8096/panel/?p=' + pg); await page.waitForTimeout(7000);
		ok('直接打开「' + pg + '」页，也弹强制更新', await page.isVisible('.modal[data-upd]'));
		await ctx.close();
	}
	// 一开始没有强制更新，面板一直开着；之后发布了强制版本
	FORCE = false;
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
	const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
	await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); const n = Date.now.bind(Date); window.__off = 0; Date.now = () => n() + window.__off; });
	await page.goto('http://localhost:8096/panel/?p=traf'); await page.waitForTimeout(7000);
	ok('一开始没有新版本：不弹', !(await page.isVisible('.modal[data-upd]')));
	FORCE = true; let c0 = checks;
	const back = async () => { await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await page.waitForTimeout(2500); };
	await back();
	ok('刚查过（不到 10 分钟）切回来：不重复查', checks === c0, checks - c0);
	await page.evaluate(() => { window.__off += 601e3; });
	await back();
	ok('过了 10 分钟切回来：重新查了一次', checks === c0 + 1, checks - c0);
	ok('切回来后弹出强制更新（在流量页）', await page.isVisible('.modal[data-upd]'));
	await page.screenshot({ path: __dirname + '/shots/force-back.png' });
	// 一直亮着不切后台：每 4 秒的计时器里，过了 10 分钟也会查
	await page.evaluate(() => document.querySelector('.modal[data-upd]')?.remove());
	FORCE = false; await page.reload(); await page.waitForTimeout(7000);
	FORCE = true; c0 = checks;
	await page.evaluate(() => { window.__off += 601e3; }); await page.waitForTimeout(6000);
	ok('面板一直亮着、过了 10 分钟：自己查到并弹出', checks >= c0 + 1 && await page.isVisible('.modal[data-upd]'), checks - c0);
	c0 = checks; await page.waitForTimeout(9000);
	ok('弹窗开着时不会一直重复查', checks === c0, checks - c0);
	ok('页面没有报错', !errs.length, errs.join(' | '));
	await browser.close(); server.close();
	console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + x[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
	process.exit(results.every((x) => x[1]) ? 0 : 1);
})();

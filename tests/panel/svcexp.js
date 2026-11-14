// 截图：托管服务到期后，手机上的面板长什么样（网址已暂停：连不上路由器，用上次记下的到期时间提示）
// 还有快到期（剩 2 天）时首页的提醒
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const OUT = process.argv[2] || (__dirname + '/shots');
const results = []; const ok = (n, c, note) => results.push([n, !!c, note || '']);
let offline = false, exp = Date.now() + 2 * 86400e3;
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			if (offline) return req.socket.destroy();
			const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), a = body.params || {};
			const R = (result) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })); };
			if (m === 'svc_info') return R({ hosted: true, exp, hub: 'https://yrlove520.com' });
			return R(respond(m, a));
		}
		let p = u.pathname.replace(/^\/panel\//, '') || 'index.html';
		const f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
(async () => {
	await new Promise((r) => server.listen(8099, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => console.log('ERR', e.message));
	await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
	// 1 快到期：还剩 2 天
	await page.goto('http://localhost:8099/panel/?p=main'); await page.waitForTimeout(2500);
	ok('快到期（剩 2 天）：首页提示还剩几天，有「申请续期」', await page.isVisible('#mSvc') && /还剩 2 天到期/.test(await page.textContent('#mSvcT')));
	await page.screenshot({ path: OUT + '/panel-2days.png' });
	// 2 已到期：网址暂停，连不上路由器；面板用上次记下的到期时间提示
	exp = Date.now() - 3600e3;
	await page.evaluate((e) => { const s = JSON.parse(localStorage.getItem('rp_svc') || '{}'); s.exp = e; localStorage.setItem('rp_svc', JSON.stringify(s)); }, exp);
	offline = true;
	await page.reload(); await page.waitForTimeout(6000);
	const body = await page.evaluate(() => document.body.innerText), st = await page.textContent('#statusText');
	ok('已到期、连不上：首页写「托管服务已到期」，说清楚是专属网址暂停了、怎么续期', /托管服务已到期/.test(await page.textContent('#mSvcT')) && /专属网址暂停了，所以连不上路由器/.test(await page.textContent('#mSvcD')) && /申请续期/.test(await page.textContent('#mSvcD')));
	ok('已到期：右上角状态是「已到期暂停」，不说成手机网络的问题', /已到期暂停/.test(st) && !/手机网络/.test(body) && !/多半是你的手机/.test(body), st);
	ok('已到期：不再重复显示「连不上路由器」的橙色框', !(await page.isVisible('#mOffBox')));
	await page.screenshot({ path: OUT + '/panel-expired.png' });
	// 没到期、真的连不上：照旧提示连不上（不受影响）
	exp = Date.now() + 30 * 86400e3;
	await page.evaluate((e) => { const s = JSON.parse(localStorage.getItem('rp_svc') || '{}'); s.exp = e; localStorage.setItem('rp_svc', JSON.stringify(s)); }, exp);
	await page.reload(); await page.waitForTimeout(6000);
	ok('没到期、连不上：照旧显示「连不上路由器」，不提到期', await page.isVisible('#mOffBox') && !/已到期/.test(await page.textContent('#statusText')) && !(await page.isVisible('#mSvc')), await page.textContent('#statusText'));
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(results.every((r) => r[1]) ? 0 : 1);
})();

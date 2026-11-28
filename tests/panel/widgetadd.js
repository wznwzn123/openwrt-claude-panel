// 「系统操作 → 桌面小组件 →「添加」」（用户 11/28 16:38：小米没弹添加框点了好几次、「弹出太慢了」）：
// 点「添加」马上出「正在添加…」；等路由器回钥匙的时候再点不会再发一次；拿到钥匙跳 routerpanel://widget，转圈收起；路由器报错就显示原因
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [];
const ok = (n, c, note) => results.push([n, !!c, note || '']);
let NEW = 0, FAIL = '';
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, '');
			if (m === 'widget_new') { NEW++; return setTimeout(() => J(FAIL ? { jsonrpc: '2.0', id: body.id, error: { code: -32000, message: FAIL } } : { jsonrpc: '2.0', id: body.id, result: { k: 'abcd1234.' + 'x'.repeat(32), name: 'JDCloud RE-SS-01' } }), 1200); }
			return J(require('./mock').reply(body.id, m, body.params || {}));
		}
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
const UA = 'Mozilla/5.0 (Linux; Android 14; 23127PN0CC) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 RouterPanelApp/6.0.2';
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8206, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		NEW = 0; FAIL = '';
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, userAgent: UA, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
		const cdp = await ctx.newCDPSession(page); await cdp.send('Page.enable'); const navs = [];
		cdp.on('Page.frameRequestedNavigation', (e) => navs.push(e.url));
		await page.addInitScript(() => localStorage.setItem('rp_token', 'testtoken1234567890'));
		await page.goto('http://localhost:8206/panel/?p=more'); await W(2500);
		const btn = '#p-more [data-t="widget"]';
		ok('App 6.0.2 里有「桌面小组件」' + T, await page.isVisible(btn));
		await page.click(btn); await W(400);
		const addBtn = page.locator('.modal button', { hasText: '添加' }).last();
		await addBtn.click(); await W(250);
		const tt = await page.evaluate(() => { const t = document.getElementById('toast'); return { s: t.textContent.trim(), busy: t.classList.contains('busy'), hid: t.classList.contains('hidden') }; });
		ok('点「添加」马上出「正在添加…」（转圈）' + T, tt.s === '正在添加…' && tt.busy && !tt.hid, JSON.stringify(tt));
		if (w === 390) await page.screenshot({ path: path.join(SHOT, `widgetadd-busy-${w}${dark ? '-dark' : ''}.png`) });
		// 等的时候再点一次：不弹确认框、不再要一把钥匙
		await page.click(btn); await W(300);
		ok('等的时候再点：不再弹确认框' + T, !(await page.isVisible('.modal')));
		await W(1500);
		ok('只要了一把钥匙' + T, NEW === 1, String(NEW));
		ok('拿到钥匙跳 routerpanel://widget，带路由器名字' + T, navs.some((u) => /^routerpanel:\/\/widget\?k=abcd1234\.x{32}&n=JDCloud/.test(u)), JSON.stringify(navs));
		const t2 = await page.evaluate(() => document.getElementById('toast').className);
		ok('转圈收起' + T, /hidden|out/.test(t2), t2);
		// 路由器报错
		FAIL = '最多加 5 个小组件：先在「登录着的设备」里移除不用的';
		await page.click(btn); await W(400); await page.locator('.modal button', { hasText: '添加' }).last().click(); await W(1700);
		const t3 = await page.evaluate(() => { const t = document.getElementById('toast'); return { s: t.textContent.trim(), err: t.classList.contains('err') }; });
		ok('路由器报错：显示原因' + T, t3.err && /最多加 5 个/.test(t3.s), JSON.stringify(t3));
		if (w === 320) await page.screenshot({ path: path.join(SHOT, `widgetadd-err-${w}.png`) });
		ok('没有脚本错误' + T, !errs.length, errs.join('；'));
		await ctx.close();
	}
	await browser.close(); server.close();
	let fail = 0;
	for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
	console.log(`\n${results.length - fail}/${results.length} 通过`);
	process.exit(fail ? 1 : 0);
})();

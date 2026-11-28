// 侧边栏「切换路由器」（用户 11/28 15:0x）：App 6.0.2 起回 App 首页（routerpanel://home）；
// 浏览器和老 App 里托管版打开官网「我的路由器」；自建版在浏览器和老 App 里不显示。320 / 390 深色 / 430 截图
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [];
let HOSTED = false;
const ok = (n, c, note) => results.push([n, !!c, note || '']);
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), o = require('./mock').reply(body.id, m, body.params || {});
			// 路由器说这台是不是托管版（面板按 whoami 的 hosted、hub 记下来）
			if (m === 'whoami' && o.result) { o.result.hosted = HOSTED; if (HOSTED) o.result.hub = 'https://hub.example'; else delete o.result.hub; }
			return J(o);
		}
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
const AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8205, r));
	const browser = await chromium.launch();
	const run = async (name, { ua, hosted, w = 390, h = 844, dark = false, shot }) => {
		HOSTED = !!hosted;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, userAgent: ua || AND, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
		const cdp = await ctx.newCDPSession(page); await cdp.send('Page.enable'); const navs = [];
		cdp.on('Page.frameRequestedNavigation', (e) => navs.push(e.url));
		await page.addInitScript((hosted) => {
			localStorage.setItem('rp_token', 'testtoken1234567890');
			if (hosted) { localStorage.setItem('rp_hub', 'https://hub.example'); localStorage.setItem('rp_host', '1'); } else localStorage.setItem('rp_host', '0');
			window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; };
		}, hosted);
		await page.goto('http://localhost:8205/panel/?p=home'); await W(2500);
		await page.click('#menuBtn'); await W(600);
		const vis = await page.isVisible('#sideSw');
		let lay = [];
		if (vis) lay = await page.evaluate(() => { const bad = [], s = document.getElementById('side').getBoundingClientRect(), b = document.getElementById('sideSw').getBoundingClientRect(), f = document.querySelector('.sidefoot').getBoundingClientRect(); if (b.left < s.left || b.right > s.right) bad.push('出界'); if (b.bottom > f.top + 1) bad.push('跟底部按钮重叠'); if (b.height > 60) bad.push('换行了'); return bad; });
		if (shot) await page.screenshot({ path: path.join(SHOT, `sidesw-${w}${dark ? '-dark' : ''}.png`) });
		let after = null;
		if (vis) { navs.length = 0; await page.click('#sideSw'); await W(500); after = { navs: navs.slice(), opened: await page.evaluate(() => window.__opened).catch(() => null), sideOpen: await page.evaluate(() => document.getElementById('side').classList.contains('open')).catch(() => null) }; }
		await ctx.close();
		return { vis, lay, after, errs };
	};
	let r = await run('浏览器 自建版', {});
	ok('浏览器里的自建版：不显示（没有路由器列表）', !r.vis && !r.errs.length, r.errs.join('；'));
	r = await run('浏览器 托管版', { hosted: true });
	ok('浏览器里的托管版：显示', r.vis);
	ok('浏览器里的托管版：点了新开官网「我的路由器」，侧边栏收起', r.after && JSON.stringify(r.after.opened) === '["https://hub.example/app"]' && r.after.sideOpen === false, JSON.stringify(r.after));
	r = await run('老 App 自建版', { ua: AND + ' RouterPanelApp/6.0.0' });
	ok('老 App（6.0.0）自建版：不显示（老 App 不认 routerpanel://home）', !r.vis);
	r = await run('老 App 托管版', { ua: AND + ' RouterPanelApp/6.0.1', hosted: true });
	ok('老 App（6.0.1）托管版：显示，点了在 App 里打开官网「我的路由器」', r.vis && r.after && r.after.navs.includes('https://hub.example/app') && !r.after.opened.length, JSON.stringify(r.after));
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		r = await run('新 App 自建版', { ua: AND + ' RouterPanelApp/6.0.2', w, h, dark, shot: true });
		ok('App 6.0.2 自建版：显示' + T, r.vis);
		ok('点了跳 routerpanel://home 回 App 首页' + T, r.after && r.after.navs.includes('routerpanel://home'), JSON.stringify(r.after));
		ok('不出界、不跟底部按钮重叠、不换行' + T, !r.lay.length, r.lay.join('；'));
		ok('没有脚本报错' + T, !r.errs.length, r.errs.join('；'));
	}
	r = await run('新 App 托管版', { ua: AND + ' RouterPanelApp/6.1.0', hosted: true });
	ok('App 6.1.0 托管版：也是回 App 首页（不去官网）', r.vis && r.after && r.after.navs.includes('routerpanel://home') && !r.after.navs.includes('https://hub.example/app'), JSON.stringify(r.after));
	await browser.close(); server.close();
	let fail = 0;
	for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
	console.log(`\n通过 ${results.length - fail}/${results.length}`);
	process.exit(fail ? 1 : 0);
})();

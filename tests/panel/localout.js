// 托管版换成本地版以后在外面打开专属网址：Cloudflare 回 522（用户 11/28 17:49 截图「路由器返回 522」）
// 面板说清楚「路由器现在是本地版」，弹一次卡片，「换成 AI 版」去官网 /app?ed=…；自建版的 522 照旧
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [];
const ok = (n, c, note) => results.push([n, !!c, note || '']);
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		if (u.pathname.startsWith('/cgi-bin/mcp/') || u.pathname.startsWith('/cloud/')) { res.writeHead(522, { 'content-type': 'text/html' }); return res.end('<html>error code: 522</html>'); }
		const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8207, r));
	const browser = await chromium.launch();
	for (const [w, h, dark, hosted] of [[320, 640, false, true], [390, 844, true, true], [430, 932, false, true], [390, 844, false, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}${hosted ? '' : ' 自建版'}）`;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light', userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' });
		const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
		await page.addInitScript((hosted) => {
			localStorage.setItem('rp_token', 'testtoken1234567890');
			if (hosted) { localStorage.setItem('rp_hub', 'https://hub.example'); localStorage.setItem('rp_host', '1'); } else localStorage.setItem('rp_host', '0');
			window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; };
		}, hosted);
		await page.goto('http://localhost:8207/panel/?p=home'); await W(3500);
		const md = await page.locator('.modal').count();
		if (hosted) {
			const t = md ? await page.textContent('.modal') : '';
			ok('托管版 522：弹「路由器现在是本地版」' + T, /路由器现在是本地版/.test(t) && /换成 AI 版/.test(t), t);
			ok('状态写「本地版」，没缓存名字时顶上写「本地版：在外面打不开」' + T, /本地版：在外面打不开/.test(await page.textContent('#topSub')) && /本地版/.test(await page.innerText('header').catch(() => '本地版')));
			ok('不再写「路由器返回 522」' + T, !/返回 522/.test(await page.innerText('body')));
			const bt = await page.evaluate(() => { const c = document.querySelector('.modal .modalbox').getBoundingClientRect(); return [...document.querySelectorAll('.modal .btn')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= c.left - 1 && r.right <= c.right + 1 && r.height < 60; }); });
			ok('卡片按钮不出界、不换行' + T, bt);
			if (w !== 430) await page.screenshot({ path: path.join(SHOT, `localout-${w}${dark ? '-dark' : ''}.png`) });
			await page.click('.modal [data-v=go]'); await W(500);
			ok('点「换成 AI 版」：打开官网换版本' + T, (await page.evaluate(() => window.__opened.slice(-1)[0])) === 'https://hub.example/app?ed=local', JSON.stringify(await page.evaluate(() => window.__opened)));
			await page.click('#refreshBtn').catch(() => {}); await W(2500);
			ok('只弹一次（刷新不再弹）' + T, (await page.locator('.modal:not(.closing)').count()) === 0);
		} else {
			ok('自建版 522：不弹本地版的卡片' + T, md === 0 && !/本地版/.test(await page.textContent('#topSub')));
		}
		ok('没有脚本错误' + T, !errs.length, errs.join('；'));
		await ctx.close();
	}
	await browser.close(); server.close();
	let fail = 0;
	for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
	console.log(`\n${results.length - fail}/${results.length} 通过`);
	process.exit(fail ? 1 : 0);
})();

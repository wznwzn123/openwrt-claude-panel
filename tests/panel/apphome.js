// 6.0 第 40 项（App 首页，浏览器里模拟 App 接口）：家里 Wi-Fi 下找到的路由器列在「在家里找到」，点「打开」只是打开（不自动登录）；
// 已经在列表里的不重复列；局域网的面板在「我的路由器」里显示成 IP:端口；320 / 390 / 430、深色不错位
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const FILE = 'file://' + path.resolve(__dirname, '../../android/app/src/main/assets/home.html');
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [];
const ok = (n, c, note) => results.push([n, !!c, note || '']);
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
		await page.addInitScript((dark) => {
			const routers = [{ url: 'https://abcd2345.panel.example/panel/', name: '家里', at: Date.now() - 3600e3 }, { url: 'http://192.168.6.1:906/panel/', name: '书房', at: Date.now() - 86400e3 * 2 }];
			window.__opened = []; window.__disc = 0;
			window.App = { version: () => '6.0.0', dark: () => dark, hub: () => 'https://panel.example', routers: () => JSON.stringify(routers), saveRouters() {}, open: (u) => window.__opened.push(u), external() {}, scan() {}, pickQr() {}, clipboard: () => '', update() {},
				discover: () => { window.__disc++; setTimeout(() => window.onFound([{ ip: '192.168.1.1', url: 'http://192.168.1.1:906/panel/' }, { ip: '192.168.6.1', url: 'http://192.168.6.1:906/panel/' }]), 200); } };
		}, dark);
		await page.goto(FILE); await W(800);
		const t = await page.textContent('#found');
		ok('找到家里的路由器：列出来' + T, /在家里找到/.test(t) && /192\.168\.1\.1/.test(t));
		ok('已经在「我的路由器」里的不重复列' + T, !/192\.168\.6\.1/.test(t));
		ok('局域网的面板在列表里显示成 IP:端口' + T, /192\.168\.6\.1:906/.test(await page.textContent('#list')) && !/http:\/\//.test(await page.textContent('#list')));
		await page.click('#found [data-fo="0"]');
		ok('点「打开」：只是打开面板（登录在面板里做）' + T, JSON.stringify(await page.evaluate(() => window.__opened)) === '["http://192.168.1.1:906/panel/"]');
		await page.evaluate(() => window.refresh()); await W(300);
		ok('30 秒内不重复找' + T, (await page.evaluate(() => window.__disc)) === 1);
		const lay = await page.evaluate(() => { const bad = []; if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('横向滚动'); document.querySelectorAll('#found .card, #found .btn, #list .card').forEach((e) => { const r = e.getBoundingClientRect(); if (r.right > innerWidth - 8 || r.left < 8) bad.push('出界：' + e.textContent.slice(0, 10)); }); return bad; });
		ok('不错位、不横向滚动' + T, !lay.length, lay.join('；'));
		ok('没有脚本报错' + T, !errs.length, errs.join('；'));
		await page.screenshot({ path: path.join(SHOT, `apphome-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		await ctx.close();
	}
	await browser.close();
	let fail = 0;
	for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
	console.log(`\n${results.length - fail}/${results.length} 通过`);
	process.exit(fail ? 1 : 0);
})();

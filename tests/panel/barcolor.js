// 状态栏颜色：页面告诉手机最上面那一条是什么颜色（跟着深浅色、背景、变暗、相册图片走）；App 里状态栏透明时顶栏让开（--sat）
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const OUT = path.join(__dirname, 'shots');
const results = []; const ok = (n, c, note) => results.push([n, !!c, note || '']);
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), a = body.params || {};
			res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: respond(m, a) }));
		}
		const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
	});
});
const dark = (hex, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
(async () => {
	await new Promise((r) => server.listen(8097, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'light' });
	const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
	await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
	const tc = () => page.$$eval('meta[name=theme-color]', (m) => m.map((x) => x.getAttribute('content') + (x.media ? '@' + x.media : '')).join(','));
	const set = async (kv) => { await page.evaluate((kv) => { for (const [k, v] of Object.entries(kv)) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }, kv); await page.reload(); await page.waitForTimeout(1500); };
	await page.goto('http://localhost:8097/panel/?p=main'); await page.waitForTimeout(1500);
	ok('只有一个状态栏颜色，不再按系统深浅色分两个', (await page.$$('meta[name=theme-color]')).length === 1);
	ok('默认（浅色、玻璃、晨雾背景）：状态栏是晨雾顶部的颜色', (await tc()) === '#e3e2f8', await tc());
	await page.evaluate(() => A.theme ? A.theme() : null).catch(() => {});
	await set({ rp_dark: '1' });
	ok('夜间模式（星空背景，压暗 28%）', (await tc()) === dark('#191e4a', .72), await tc());
	await set({ rp_wall: 'aurora' });
	ok('夜间 + 极光背景', (await tc()) === dark('#2d5586', .72), await tc());
	await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
	await page.screenshot({ path: OUT + '/bar-aurora-dark.png' });
	await set({ rp_dark: '0', rp_wall: 'sunset', rp_wdim: '30' });
	ok('浅色 + 日落 + 背景变暗 30%', (await tc()) === dark('#ffcca8', .7), await tc());
	await set({ rp_glass: '0', rp_wdim: null });
	ok('简洁样式（没背景）浅色：页面底色 #f2f2f7', (await tc()) === '#f2f2f7', await tc());
	await set({ rp_dark: '1' });
	ok('简洁样式深色：黑色', (await tc()) === '#000000', await tc());
	// 当场切换：不用刷新就跟着变
	await set({ rp_glass: null, rp_dark: '0', rp_wall: 'ocean' });
	const before = await tc();
	await page.evaluate(() => { document.documentElement.classList.add('dark'); rpBar(); });
	ok('切换深色时当场跟着变', before === '#baddfe' && (await tc()) === dark('#baddfe', .72), before + ' → ' + (await tc()));
	// 相册图片：上红下蓝 → 顶部是红色（以前选的图片没算过，打开时补算）
	const img = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#d04040'; g.fillRect(0, 0, 400, 200); g.fillStyle = '#2040c0'; g.fillRect(0, 200, 400, 600); return c.toDataURL('image/jpeg', .9); });
	await set({ rp_dark: '0', rp_wall: 'photo', rp_wallimg: img, rp_walltop: null });
	await page.waitForTimeout(800);
	const pc = await tc(), [r, g, bb] = [1, 3, 5].map((i) => parseInt(pc.slice(i, i + 2), 16));
	ok('相册图片：取图片最上面一条的颜色（红）', r > 180 && g < 100 && bb < 100, pc);
	await set({ rp_wall: 'aurora', rp_wallimg: null, rp_walltop: null, rp_dark: '1' });
	// App 里状态栏透明：App 告诉页面状态栏多高（--sat），顶栏往下让开
	const t0 = await page.evaluate(() => document.querySelector('.top').getBoundingClientRect().top);
	await page.evaluate(() => document.documentElement.style.setProperty('--sat', '36px')); await page.waitForTimeout(300);
	const t1 = await page.evaluate(() => document.querySelector('.top').getBoundingClientRect().top);
	ok('App 状态栏 36px：顶栏往下让开 36px，背景铺到最上面', Math.abs(t1 - t0 - 36) < 1.5 && await page.evaluate(() => document.getElementById('wall').getBoundingClientRect().top === 0), t0 + ' → ' + t1);
	// 截图：画一条假的状态栏（时间、电量）看效果
	await page.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;right:0;top:0;height:36px;z-index:999;display:flex;justify-content:space-between;align-items:center;padding:0 22px;color:#fff;font:600 15px sans-serif;pointer-events:none'; d.innerHTML = '<span>03:01</span><span>5G ▮▮▮ 83%</span>'; document.body.appendChild(d); });
	await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
	const gap = await page.evaluate(() => { const t = document.querySelector('.top').getBoundingClientRect(), c = [...document.querySelectorAll('#p-main .card')].find((x) => x.offsetHeight > 40).getBoundingClientRect(); return [t.top, t.bottom, c.top]; });
	ok('App 状态栏 36px、滚到最上面：顶栏在状态栏下面，第一张卡片在顶栏下面，不重叠', gap[0] >= 36 && gap[2] >= gap[1] - 1, gap.join(','));
	await page.screenshot({ path: OUT + '/bar-app-edge.png' });
	ok('页面没有报错', !errs.length, errs.join(' | '));
	ok('页面声明支持铺到状态栏下面（RP_EDGE）', await page.evaluate(() => window.RP_EDGE === 1));
	await browser.close(); server.close();
	console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + x[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
	process.exit(results.every((x) => x[1]) ? 0 : 1);
})();

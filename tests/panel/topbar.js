// 6.0 第 76 项：顶栏去掉标题旁的头像；页面名、路由器名在 320–430 宽的手机上都显示完整；
// 放不下时先藏 logo，再把状态收成一个点（点一下看完整状态）；浅色、深色都截图
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); let result; try { result = respond(body.method.replace(/^panel\//, ''), body.params || {}); } catch (e) { return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } })); } return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(403); return res.end('{}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const full = (page, id) => page.evaluate((i) => { const e = document.getElementById(i); return e.scrollWidth <= e.clientWidth + 1; }, id);
(async () => {
	await new Promise((r) => server.listen(8187, r));
	const browser = await chromium.launch();
	for (const dark of [false, true]) for (const w of [320, 360, 390, 430]) {
		const T = `［${w}${dark ? ' 深色' : ''}］`;
		const ctx = await browser.newContext({ viewport: { width: w, height: 760 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => localStorage.setItem('rp_token', 'testtoken1234567890'));
		await page.goto('http://localhost:8187/panel/?p=home'); await W(1800);
		ok('顶栏没有头像按钮' + T, (await page.locator('#meBtn, .mebtn').count()) === 0);
		ok('概览页的标题是「概览」（跟侧边栏一样）' + T, (await page.textContent('#pageTitle')) === '概览');
		const bad = [];
		for (const pg of ['home', 'main', 'proxy', 'log', 'me', 'chat']) for (const [st, name] of [['在线', 'JDCloud RE-SS-01'], ['手机网络问题', 'JDCloud RE-SS-01'], ['线路不通', 'Xiaomi AX3000T'], ['在线', 'GL.iNet GL-MT6000']]) {
			if (pg !== 'home') { await page.goto('http://localhost:8187/panel/?p=' + pg); await W(900); }
			await page.evaluate(([s, n]) => { document.getElementById('statusText').textContent = s; document.getElementById('topSub').innerHTML = n + '<span class="subx"> · OpenClash 运行中</span>'; }, [st, name]); await W(150);
			const tOk = await full(page, 'pageTitle'), sOk = await full(page, 'topSub');
			const hs = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
			if (!tOk || !sOk || !hs) bad.push(`${pg}/${st}/${name}：${!tOk ? '页面名被截' : ''}${!sOk ? '路由器名被截' : ''}${!hs ? '横向滚动' : ''}`);
		}
		ok('各页面 × 各种状态：页面名、路由器名都显示完整，不横向滚动' + T, !bad.length, bad.join('；'));
		// 真实副标题（App 自己写的）：型号一定在；宽屏时插件状态也在
		await page.goto('http://localhost:8187/panel/?p=home'); await W(1500);
		const sub = await page.evaluate(() => { const e = document.getElementById('topSub'), x = e.querySelector('.subx'); return { t: e.textContent, full: e.scrollWidth <= e.clientWidth + 1, x: !!x && x.offsetWidth > 0 }; });
		ok('真实副标题：型号显示完整' + T, sub.full && /AX3000T|OpenWrt|RE-SS/.test(sub.t), sub.t);
		const stTxt = await page.evaluate(() => document.getElementById('statusText').offsetWidth > 0);
		if (w >= 430) ok('430 宽：状态字照常显示（副标题先让位，不先收状态）' + T, stTxt);
		// 特别长的型号：只能省略号，但不能把按钮挤出屏幕
		await page.evaluate(() => { document.getElementById('topSub').innerHTML = 'Very Long Vendor Router Model Name Pro Max 2026<span class="subx"> · OpenClash 运行中</span>'; }); await W(200);
		ok('特别长的型号：不横向滚动，右边按钮还在屏幕里' + T, await page.evaluate(() => { const b = [...document.querySelectorAll('.top .actions > *')].filter((e) => e.offsetWidth); return document.documentElement.scrollWidth <= innerWidth + 1 && b.every((e) => e.getBoundingClientRect().right <= innerWidth + 1); }));
		// 放不下时状态收成一个点：点一下显示完整状态
		await page.goto('http://localhost:8187/panel/?p=log'); await W(900);
		await page.evaluate(() => { document.getElementById('statusText').textContent = '手机网络问题'; document.getElementById('topSub').textContent = 'JDCloud RE-SS-01'; }); await W(200);
		const tight = await page.evaluate(() => document.getElementById('topbar').className);
		if (/tight2/.test(tight)) {
			await page.click('#statusPill'); await W(300);
			ok('状态收成点时：点一下弹出完整状态' + T, /手机网络问题/.test(await page.textContent('#toast')));
		} else ok('宽度够：状态文字照常显示' + T, await page.isVisible('#statusText'));
		await page.screenshot({ path: path.join(__dirname, 'shots', `topbar-${w}${dark ? '-dark' : ''}.png`), clip: { x: 0, y: 0, width: w, height: 90 } });
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

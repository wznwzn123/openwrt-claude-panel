// 首页：默认打开首页；侧边栏最上面单独一项；实时流量每 2 秒刷新；今日流量、在线设备；点卡片跳到对应页面；下拉刷新还停在原来那页
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const calls = []; let down = false;
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { if (down) { res.writeHead(530); return res.end('<h1>Error 1033</h1>'); } const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''); calls.push({ m, t: Date.now() });
		return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: m === 'cloud_info' ? { enabled: false } : respond(m, body.params || {}) })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8151, r));
	const browser = await chromium.launch();
	for (const scheme of ['light', 'dark']) {
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: scheme, deviceScaleFactor: 2 });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { try { localStorage.setItem('rp_token', 'tok1234567890abcdefgh'); if (!localStorage.getItem('x')) { localStorage.setItem('rp_page', 'proxy'); localStorage.setItem('x', 1); } } catch (e) {} });
		await page.goto('http://localhost:8151/panel/'); await W(scheme === 'dark' ? 30000 : 5000);
		if (scheme === 'dark') { await page.evaluate(() => { document.documentElement.classList.add('dark'); }); await W(300); await page.screenshot({ path: path.join(__dirname, 'shots', 'main-dark.png') }); await ctx.close(); continue; }
		ok('新打开面板：默认是首页（就算上次停在别的页面）', await page.isVisible('#p-main') && (await page.textContent('#pageTitle')) === '首页');
		ok('首页三张卡片：实时流量、今日流量、在线设备', await page.isVisible('#mLive') && await page.isVisible('#mToday') && await page.isVisible('#mDev'));
		const rx1 = await page.innerHTML('#mRx');
		ok('实时流量显示 Mbps', /Mbps/.test(rx1), rx1);
		const n1 = calls.filter((c) => c.m === 'live').length; await W(4300); const n2 = calls.filter((c) => c.m === 'live').length;
		ok('实时流量每 2 秒刷新一次', n2 - n1 >= 2 && n2 - n1 <= 3, n2 - n1);
		ok('曲线画出来了（下行面积 + 上行线）', (await page.$$('#mChart path')).length >= 3);
		ok('今日流量：总量和前 3 台设备（没名字的显示 MAC）', /24\.5 GB/.test(await page.textContent('#mDl')) && /2\.9 GB/.test(await page.textContent('#mUl')) && (await page.$$('#mTop .mrow')).length === 3 && /Living-Room-TV/.test(await page.textContent('#mTop')) && /aa:bb:cc:00:00:03/.test(await page.textContent('#mTop')));
		ok('在线设备：13 台，无线 9、有线 4、共 15 台', (await page.textContent('#mOn')) === '13' && (await page.textContent('#mWifi')) === '9' && (await page.textContent('#mWired')) === '4' && (await page.textContent('#mAll')) === '15');
		ok('今日流量和设备不跟着每 2 秒刷新（30 秒一次）', calls.filter((c) => c.m === 'home_stats').length === 1, calls.filter((c) => c.m === 'home_stats').length);
		await page.screenshot({ path: path.join(__dirname, 'shots', 'main-light.png') });
		await page.click('#menuBtn'); await W(500);
		const first = await page.evaluate(() => { const b = document.querySelector('#sidenav > *'); return b && b.tagName === 'BUTTON' ? b.textContent.trim() + '|' + b.dataset.p : ''; });
		ok('侧边栏最上面单独一项「首页」（在「状态」上面，不在任何分组里）', first === '首页|main', first);
		ok('首页在侧边栏里是选中状态', await page.evaluate(() => document.querySelector('#sidenav > button[data-p="main"]').classList.contains('on')));
		ok('「状态」里还有「概览」', await page.evaluate(() => [...document.querySelectorAll('#sidenav [data-g="状态"] button[data-p]')].some((b) => b.dataset.p === 'home')));
		await page.screenshot({ path: path.join(__dirname, 'shots', 'main-side.png') });
		await page.fill('#sideQ', '首页'); await W(300);
		ok('搜索「首页」能找到', await page.isVisible('#sidenav button[data-p="main"]'));
		await page.fill('#sideQ', ''); await W(200);
		await page.mouse.click(380, 400); await W(500);
		await page.click('#mToday'); await W(800);
		ok('点「今日流量」跳到流量统计', (await page.textContent('#pageTitle')) === '流量统计');
		await page.goBack().catch(() => {}); await page.goto('http://localhost:8151/panel/?p=main'); await W(1200);
		await page.click('#mDev'); await W(800);
		ok('点「在线设备」跳到设备页', (await page.textContent('#pageTitle')) === '设备');
		await page.reload(); await W(1500);
		ok('在别的页面下拉刷新：还停在那一页', (await page.textContent('#pageTitle')) === '设备');
		const n3 = calls.filter((c) => c.m === 'live').length; await W(4500);
		ok('不在首页时不刷新网速（不白白占路由器）', calls.filter((c) => c.m === 'live').length === n3);
		await page.click('#menuBtn'); await W(400); await page.click('#sidenav > button[data-p="main"]'); await W(1500);
		ok('从侧边栏回到首页', (await page.textContent('#pageTitle')) === '首页' && await page.isVisible('#mLive'));
		down = true; await W(5000);
		ok('连不上路由器：首页显示提示', await page.isVisible('#mOffBox') && /连不上路由器/.test(await page.textContent('#mOffBox')), await page.textContent('#mOffBox'));
		await page.screenshot({ path: path.join(__dirname, 'shots', 'main-off.png') });
		down = false; await W(5000);
		ok('恢复后提示自动消失', !(await page.isVisible('#mOffBox')));
		ok('不横向滚动', (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

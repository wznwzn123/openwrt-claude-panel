// 网络检测（出口 IP / 网站访问 / 流媒体·AI 解锁）实时检测的测试
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');

const ROOT = (process.env.PANEL_WWW || path.join(__dirname, '..', '..', 'src', 'www'));
const OUT = path.join(__dirname, 'shots');
const calls = [], problems = [], results = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
let slow = 0;

(async () => {
	const browser = await chromium.launch();
	const dark = process.argv.includes('--dark');
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !/serviceWorker|sw\.js|Failed to load resource/.test(m.text())) problems.push('控制台：' + m.text()); });
	await ctx.route('http://panel.test/**', async (route) => {
		const u = new URL(route.request().url());
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(route.request().postData() || '{}');
			calls.push({ m: body.method, p: body.params, t: Date.now() });
			const result = respond(body.method, body.params || {});
			const heavy = /myip|site_check|unlock/.test(body.method);
			await new Promise((r) => setTimeout(r, heavy ? 300 + slow : 30));
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) });
		}
		let f = path.join(ROOT, u.pathname);
		if (f.endsWith('/')) f += 'index.html';
		if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
		const ct = f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream';
		return route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(f) });
	});
	await page.addInitScript(() => { if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('rp_token', 'testtoken1234567890'); sessionStorage.setItem('init', '1'); } });
	const n = (m) => calls.filter((c) => c.m === 'panel/' + m).length;
	const sfx = dark ? '-dark' : '';
	const shot = async (name) => { await page.evaluate(() => document.getElementById('ncIp').scrollIntoView({ block: 'start' })); await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, name + sfx + '.png') }); };

	// 第一次打开：显示「检测中」，然后自动出结果
	slow = 1200;
	await page.goto('http://panel.test/panel/?p=home');
	await page.waitForTimeout(900);
	ok('第一次打开就自动检测（不用点）', n('myip') === 1 && n('site_check') === 1 && n('unlock') === 1);
	ok('检测中有提示', /检测中|正在查询/.test(await page.textContent('#ncIp') + await page.textContent('#siteTiles')));
	ok('标题旁显示「检测中」', (await page.textContent('#ncAgo')) === '检测中');
	await shot('net-01-checking');
	await page.waitForTimeout(1500);
	slow = 0;
	ok('出口 IP：国内 + 海外，重复的海外 IP 只显示一次，另有一行 IPv6（没有就写没有）', (await page.locator('#ipList .tg:not(.v6)').count()) === 2 && (await page.locator('#ipList .tg.v6').count()) === 1 && /没有 IPv6/.test(await page.textContent('#ipList')) && (await page.textContent('#ipList')).includes('36.1.2.3') && (await page.textContent('#ipList')).includes('45.1.2.3'));
	ok('网站 6 个，每个有图标', (await page.locator('#siteTiles .tile').count()) === 6 && (await page.locator('#siteTiles .tile .ic').count()) === 6);
	const sst = await page.$$eval('#siteTiles .st', (x) => x.map((e) => e.className.replace('st', '').trim() + ':' + e.textContent));
	ok('网站速度分颜色：快绿、慢橙、很慢/打不开红', sst.join('|') === 't-ok:45 ms|t-ok:117 ms|t-ok:260 ms|t-wa:640 ms|t-bad:1500 ms|t-bad:打不开', sst.join('|'));
	ok('解锁只留 6 个常用的', (await page.locator('#unlTiles .tile').count()) === 6 && JSON.stringify(calls.find((c) => c.m === 'panel/unlock').p.services) === JSON.stringify(['netflix', 'disney', 'ytb', 'openai', 'claude', 'gemini']));
	const ust = await page.$$eval('#unlTiles .tile', (x) => x.map((e) => e.querySelector('.nm').textContent + '=' + e.querySelector('.st').textContent));
	ok('解锁结果', ust.join('|') === 'Netflix=解锁 · HK|Disney+=解锁 · HK|YouTube=检测失败|ChatGPT=解锁 · HK|Claude=未解锁|Gemini=解锁 · HK', ust.join('|'));
	ok('显示用的是哪个节点', (await page.textContent('#unlNode')).includes('香港02'));
	ok('实时指示灯亮着', !(await page.evaluate(() => document.getElementById('ncLive').classList.contains('off'))) && (await page.textContent('#ncAgo')) === '刚刚');
	ok('旧的三个「检查」按钮和服务选择都去掉了', await page.evaluate(() => !document.getElementById('ipBtn') && !document.getElementById('siteBtn') && !document.getElementById('unlockBtn') && !document.getElementById('unlockChips')));
	const ov = await page.evaluate(() => [...document.querySelectorAll('#ncIp, #ncSite, #ncUnl, .tile')].filter((e) => e.scrollWidth > e.clientWidth + 1).length);
	ok('没有内容溢出', ov === 0, String(ov));
	await shot('net-02-done');

	// 概览每 4 秒刷新一次，但检测不跟着重复跑
	await page.waitForTimeout(8500);
	ok('不会每次刷新都重新检测', n('myip') === 1 && n('unlock') === 1);

	// 手动刷新
	await page.click('#ncBtn'); await page.waitForTimeout(150);
	ok('点 ↻ 三项都重新检测', n('myip') === 2 && n('site_check') === 2 && n('unlock') === 2);
	ok('重测时保留旧结果（变淡），不闪成空白', await page.evaluate(() => document.getElementById('ncSite').classList.contains('busyc')) && (await page.textContent('#siteTiles')).includes('45 ms'));
	await page.click('#ncBtn'); await page.waitForTimeout(100);
	ok('正在检测时再点不会重复发', n('myip') === 2);
	await page.waitForTimeout(700);

	// 改代理模式后自动重测
	await page.click('#modeChips [data-mode="global"]'); await page.waitForTimeout(500);
	if (await page.locator('.modal [data-v="true"]').count()) { await page.click('.modal [data-v="true"]'); }
	await page.waitForTimeout(3200);
	ok('切换模式后自动重新检测', n('myip') === 3 && n('unlock') === 3);
	await page.click('#modeChips [data-mode="rule"]'); await page.waitForTimeout(500);
	if (await page.locator('.modal [data-v="true"]').count()) { await page.click('.modal [data-v="true"]'); }
	await page.waitForTimeout(3200);

	// 去别的页面：不检测
	const c0 = n('myip');
	await page.click('#menuBtn'); await page.waitForTimeout(450);
	await page.click('#sidenav button[data-p="proxy"]'); await page.waitForTimeout(800);
	// 切换节点
	ok('在别的页面不跑检测', n('myip') === c0);

	// 重开面板：先显示上次的结果，没过期不重测
	const c1 = n('myip');
	await page.reload(); await page.waitForTimeout(250);
	await page.evaluate(() => document.querySelector('#sidenav button[data-p="home"]').click()); await page.waitForTimeout(150);
	ok('重开面板马上显示上次结果', (await page.textContent('#siteTiles')).includes('45 ms') && (await page.textContent('#ipList')).includes('36.1.2.3'));
	await page.waitForTimeout(1500);
	ok('一分钟内重开不重复检测', n('myip') === c1);

	// 过期了：自动重测（IP/网站 1 分钟，解锁 5 分钟）
	await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('rp_net')); o.at.ip = o.at.site = Date.now() - 61e3; o.at.unl = Date.now() - 120e3; localStorage.setItem('rp_net', JSON.stringify(o)); });
	const c2 = { ip: n('myip'), site: n('site_check'), unl: n('unlock') };
	await page.reload(); await page.waitForTimeout(1800);
	ok('IP、网站超过 1 分钟自动重测', n('myip') === c2.ip + 1 && n('site_check') === c2.site + 1);
	ok('解锁 5 分钟内不重测（省路由器资源）', n('unlock') === c2.unl);
	await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('rp_net')); o.at.unl = Date.now() - 301e3; localStorage.setItem('rp_net', JSON.stringify(o)); });
	await page.reload(); await page.waitForTimeout(1800);
	ok('解锁超过 5 分钟自动重测', n('unlock') === c2.unl + 1);

	// 底部快捷栏的 IP 检查
	await page.click('#dock [data-d="ip"]'); await page.waitForTimeout(900);
	ok('底部「IP 检查」弹窗正常', (await page.textContent('.modal')).includes('36.1.2.3'));
	await page.click('.modal [data-v="close"]'); await page.waitForTimeout(400);

	// 宽屏
	await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(300);
	const ov2 = await page.evaluate(() => [...document.querySelectorAll('.tile')].filter((e) => e.scrollWidth > e.clientWidth + 1).length);
	ok('宽屏不溢出', ov2 === 0);
	await shot('net-03-wide');

	await browser.close();
	const pass = results.filter((r) => r[1]).length;
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${pass}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

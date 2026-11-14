// 断线记录页 + 断线原因提示 专项测试
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { respond, WD, cloudStatus } = require('./mock');

const ROOT = (process.env.PANEL_WWW || path.join(__dirname, '..', '..', 'src', 'www'));
const OUT = path.join(__dirname, 'shots');
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };

async function open(browser, opt = {}) {
	const ctx = await browser.newContext({ viewport: opt.vp || { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: !opt.vp, hasTouch: !opt.vp, colorScheme: opt.dark ? 'dark' : 'light' });
	if (opt.storage) await ctx.addInitScript((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); if (st.rp_page) sessionStorage.setItem('rp_page', st.rp_page); /* 面板默认打开首页；测试里模拟「同一个标签页里刷新，停在原来那页」 */ }, opt.storage);
	const page = await ctx.newPage();
	const calls = [];
	page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !/serviceWorker|sw\.js|Failed to load resource/.test(m.text())) problems.push('控制台：' + m.text()); });
	const ctl = { mode: opt.mode || 'ok', cloud: opt.cloud, tablet: opt.tablet };
	await page.route('http://panel.test/**', async (route) => {
		const u = new URL(route.request().url());
		if (u.pathname === '/cloud/s') {
			calls.push('cloud');
			const body = JSON.parse(route.request().postData() || '{}');
			if (ctl.cloud === 'down') return route.abort('connectionrefused');
			if (body.token !== 'testtoken1234567890') return route.fulfill({ status: 403, body: '{"error":"bad token"}' });
			if (body.clear) ctl.cloudCleared = true;
			const st = cloudStatus(ctl.cloud || 'ok', ctl.tablet !== false);
			if (ctl.cloudCleared) st.events = [];
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(st) });
		}
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(route.request().postData() || '{}');
			calls.push(body.method);
			if (ctl.mode === '530') return route.fulfill({ status: 530, contentType: 'text/html', body: 'error code: 1033' });
			if (ctl.mode === '502') return route.fulfill({ status: 502, contentType: 'text/html', body: 'Bad gateway' });
			if (ctl.mode === 'down') return route.abort('connectionrefused');
			await new Promise((r) => setTimeout(r, 30));
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: respond(body.method, body.params || {}) }) });
		}
		let f = path.join(ROOT, u.pathname);
		if (f.endsWith('/')) f += 'index.html';
		if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
		return route.fulfill({ status: 200, contentType: f.endsWith('.html') ? 'text/html' : 'text/javascript', body: fs.readFileSync(f) });
	});
	await page.addInitScript(() => localStorage.setItem('rp_token', 'testtoken1234567890'));
	return { page, ctx, calls, ctl };
}
const txt = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent || '', sel);
const goWd = async (page) => { await page.click('#menuBtn'); await page.waitForTimeout(400); await page.click('#sidenav [data-p="wd"]'); await page.waitForTimeout(700); };

(async () => {
	const browser = await chromium.launch();
	let saved = null;
	for (const dark of [false, true]) {
		const sfx = dark ? '（深色）' : '';
		const { page, ctx, calls } = await open(browser, { dark });
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(1000);
		ok('侧边栏有「断线记录」' + sfx, (await txt(page, '#sidenav')).includes('断线记录'));
		await goWd(page);
		ok('标题' + sfx, (await txt(page, '#pageTitle')) === '断线记录');
		const body = await txt(page, '#wdBody');
		ok('看门狗状态' + sfx, body.includes('看门狗运行中'));
		ok('6 项检查状态' + sfx, (await page.$$eval('.wdst>div', (x) => x.length)) === 6 && (await page.$$eval('.wdst span.good', (x) => x.length)) === 6);
		ok('7 天统计' + sfx, body.includes('隧道断开 1 次') && body.includes('意外重启 1 次') && body.includes('自动修复 1 次'), (await page.$$eval('.wdsum .pill', (x) => x.map((y) => y.textContent).join(' | '))));
		ok('按天分组' + sfx, (body.includes('今天') || body.includes('昨天')) && /\d+ 月 \d+ 日/.test(body));
		ok('显示断线时段' + sfx, (await page.$$eval('.wdev', (x) => x.filter((e) => e.textContent.includes('→')).length)) >= 2);
		ok('记录条数' + sfx, (await page.$$eval('.wdev', (x) => x.filter((e) => !e.textContent.includes('· 云端')).length)) === 6);
		ok('详细信息里的 HTML 被转义' + sfx, !(await page.$('#wdBody pre script')) && (await txt(page, '#wdBody')).includes('<script>x</script>'));
		// 展开详细信息后，自动刷新不会收起
		await page.click('.wdev details summary');
		await page.waitForTimeout(200);
		const n0 = calls.filter((c) => c === 'panel/wd').length;
		await page.click('#refreshBtn');
		await page.waitForTimeout(600);
		ok('刷新后展开的详细信息还开着' + sfx, (await page.$$('#wdBody details[open]')).length === 1 && calls.filter((c) => c === 'panel/wd').length > n0);
		await page.screenshot({ path: path.join(OUT, 'wd' + (dark ? '-dark' : '') + '.png'), fullPage: true });
		// 立即检查
		await page.click('[data-wdcheck]');
		await page.waitForTimeout(600);
		ok('立即检查调用 wd_check' + sfx, calls.includes('panel/wd_check'));
		ok('检查完成提示' + sfx, (await txt(page, '#toast')).includes('检查完成'));
		// 横向不溢出
		ok('没有横向滚动' + sfx, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		// 自动刷新 12 秒一次
		const before = calls.filter((c) => c === 'panel/wd').length;
		await page.waitForTimeout(12600);
		const after = calls.filter((c) => c === 'panel/wd').length;
		ok('停在这页时约 12 秒自动刷新一次' + sfx, after - before >= 1 && after - before <= 2, `${after - before} 次`);
		if (!dark) saved = await page.evaluate(() => localStorage.getItem('rp_wd'));
		await ctx.close();
	}
	ok('记录缓存到手机', saved && JSON.parse(saved).events.length === 6);

	// 清空
	{
		const { page, ctx, calls } = await open(browser);
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(800);
		await goWd(page);
		await page.click('[data-wdclear]');
		await page.waitForTimeout(400);
		await page.click('.modal [data-v="true"]');
		await page.waitForTimeout(900);
		ok('清空记录', calls.includes('panel/wd_clear') && (await txt(page, '#wdBody')).includes('记录已清空'));
		await ctx.close();
		WD.cleared = false;
	}

	// 路由器断线：隧道断开（530 / 1033）
	// down = 手机完全没网：路由器和 Cloudflare 都连不上
	for (const [mode, short, key] of [['530', '隧道断开', '1033'], ['502', '无响应', '可能刚断电或断网'], ['down', '手机网络问题', '连不上']]) {
		const { page, ctx, ctl } = await open(browser, { storage: { rp_wd: saved, rp_ov: JSON.stringify(respond('panel/overview', {})), rp_page: 'home' } });
		ctl.mode = mode;
		if (mode === 'down') ctl.cloud = 'down';
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(1200);
		ok(`[${mode}] 顶部状态显示原因`, (await txt(page, '#statusText')) === short, await txt(page, '#statusText'));
		ok(`[${mode}] 首页说明连不上和原因`, (await txt(page, '#hHead')) === '连不上路由器' && (await txt(page, '#hDesc')).includes(key), await txt(page, '#hDesc'));
		ok(`[${mode}] 首页仍显示上次的数据`, (await txt(page, '#oCfg')) === 'zou.yaml');
		await goWd(page);
		const b = await txt(page, '#wdBody');
		ok(`[${mode}] 断线记录页显示原因`, b.includes('现在连不上路由器') && b.includes(key), b.slice(0, 120));
		ok(`[${mode}] 断线时仍能看到之前的记录`, (await page.$$eval('.wdev', (x) => x.filter((e) => !e.textContent.includes('· 云端')).length)) === 6 && b.includes('同步的，'));
		ok(`[${mode}] 离线时按钮不可用`, await page.$eval('[data-wdcheck]', (x) => x.disabled));
		ok(`[${mode}] 状态标记为离线`, b.includes('离线'));
		ok(`[${mode}] 离线时状态不显示「正常」`, (await page.$$('.wdst span.good')).length === 0 && (mode !== '530' || (await page.$$eval('.wdst span.bad', (x) => x.map((y) => y.textContent).join())) === '断开'));
		if (mode === '530') await page.screenshot({ path: path.join(OUT, 'wd-offline.png'), fullPage: false });
		// 恢复后自动回到在线
		ctl.mode = 'ok';
		await page.click('#refreshBtn');
		await page.waitForTimeout(700);
		ok(`[${mode}] 恢复后自动更新`, (await txt(page, '#statusText')) === '在线' && !(await txt(page, '#wdBody')).includes('现在连不上路由器'));
		await ctx.close();
	}
	// 从没同步过 + 断线
	{
		const { page, ctx } = await open(browser, { mode: '530', storage: { rp_page: 'wd' } });
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(1200);
		ok('没同步过时提示还没有记录', (await txt(page, '#wdBody')).includes('还没有同步过路由器的记录'));
		await ctx.close();
	}
	// 宽屏
	{
		const { page, ctx } = await open(browser, { vp: { width: 1280, height: 800 }, storage: { rp_page: 'wd' } });
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(1200);
		ok('宽屏正常显示', (await page.$$eval('.wdev', (x) => x.filter((e) => !e.textContent.includes('· 云端')).length)) === 6);
		await page.screenshot({ path: path.join(OUT, 'wd-wide.png') });
		await ctx.close();
	}
	{
		const { page, ctx } = await open(browser, { storage: { rp_page: 'home' } });
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(1200);
		ok('首页 CPU 显示真实使用率', (await txt(page, '#sCpu')) === '23%', await txt(page, '#sCpu'));
		await ctx.close();
	}
	// ===== 云端监测 =====
	{
		const { page, ctx, calls } = await open(browser, { storage: { rp_page: 'wd' } });
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(1500);
		const b = await txt(page, '#wdBody');
		ok('[云端] 显示云端监测卡片', b.includes('云端监测') && (await page.$('[data-cloud]')) !== null);
		ok('[云端] 在线时显示一切正常', (await txt(page, '[data-cloud]')).includes('平板（证人）') && b.includes('一切正常'));
		ok('[云端] 平板在报告', (await txt(page, '[data-cloud] .okc')).startsWith('正常'), await txt(page, '[data-cloud] .okc'));
		ok('[云端] 云端事件合并进时间线', (await page.$$eval('.wdev', (x) => x.some((e) => e.textContent.includes('云端') && e.textContent.includes('离线共 5 分钟')))));
		ok('[云端] 时间线按时间排序', await page.$$eval('.wdev .tm:first-child', (x) => x.length > 0));
		await page.click('[data-tablet]'); await page.waitForTimeout(500);
		const m = await txt(page, '.modal');
		ok('[云端] 平板设置方法：步骤和专用网址', m.includes('MacroDroid') && m.includes('不要连这台路由器的 Wi-Fi') && m.includes('/cloud/beat/t/tabletkey123'), m.slice(0, 80));
		await page.screenshot({ path: path.join(OUT, 'wd-tablet.png') });
		await page.click('.modal [data-v="close"]'); await page.waitForTimeout(400);
		await page.screenshot({ path: path.join(OUT, 'wd-cloud.png'), fullPage: true });
		// 清空也清云端
		await page.click('[data-wdclear]'); await page.waitForTimeout(400); await page.click('.modal [data-v="true"]'); await page.waitForTimeout(900);
		ok('[云端] 清空记录也清空云端事件', !(await txt(page, '#wdBody')).includes('离线共 5 分钟'));
		WD.cleared = false;
		await ctx.close();
	}
	for (const [cmode, key, label] of [['power', '平板还在报告', '路由器断电或死机'], ['net', '路由器和平板都没有报告', '家里断网']]) {
		const { page, ctx } = await open(browser, { mode: '530', cloud: cmode, storage: { rp_page: 'home', rp_wd: saved, rp_ov: JSON.stringify(respond('panel/overview', {})) } });
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(2500);
		ok(`[云端·${cmode}] 路由器断线时首页显示 Cloudflare 实时判断`, (await txt(page, '#hDesc')).includes('Cloudflare 实时判断') && (await txt(page, '#hDesc')).includes(key), await txt(page, '#hDesc'));
		ok(`[云端·${cmode}] 顶部状态用云端的判断`, (await txt(page, '#statusText')) === label, await txt(page, '#statusText'));
		if (cmode === 'power') await page.screenshot({ path: path.join(OUT, 'home-cloud-power.png') });
		await goWd(page);
		const b = await txt(page, '#wdBody');
		ok(`[云端·${cmode}] 断线记录页显示实时判断和离线时长`, b.includes('Cloudflare 实时判断') && b.includes(key) && /已经 \d+ 分钟/.test(b), b.slice(0, 200));
		ok(`[云端·${cmode}] 云端卡片显示路由器多久没报告`, (await txt(page, '[data-cloud]')).includes('分钟前'));
		ok(`[云端·${cmode}] 隧道探测显示 1033`, (await txt(page, '[data-cloud]')).includes('隧道断开 1033'));
		if (cmode === 'net') ok('[云端·net] 平板也没在报告', (await txt(page, '[data-cloud] .badc')).startsWith('没在报告'));
		if (cmode === 'power') await page.screenshot({ path: path.join(OUT, 'wd-cloud-power.png'), fullPage: true });
		await ctx.close();
	}
	{
		// 手机自己没网：路由器和云端都连不上
		const { page, ctx } = await open(browser, { mode: 'down', cloud: 'down', storage: { rp_page: 'wd', rp_wd: saved, rp_cloud: JSON.stringify({ ...cloudStatus('ok'), synced: Date.now() - 600e3 }) } });
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(2500);
		const b = await txt(page, '#wdBody');
		ok('[云端·都连不上] 说明连不上 Cloudflare，并显示缓存的云端数据', b.includes('连不上 Cloudflare') && b.includes('的云端数据'), b.slice(0, 300));
		await ctx.close();
	}
	{
		// 还没设置平板
		const { page, ctx } = await open(browser, { tablet: false, storage: { rp_page: 'wd' } });
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(1500);
		ok('[云端] 没设置平板时提示加平板', (await txt(page, '[data-cloud]')).includes('还没设置') && (await txt(page, '[data-cloud]')).includes('加一台平板作证'));
		await ctx.close();
	}
	// ===== 手机自己网络不好 =====
	{
		// 路由器连不上（网络错误），但 Cloudflare 说路由器一切正常 → 是手机的问题
		const { page, ctx } = await open(browser, { mode: 'down', cloud: 'ok', storage: { rp_page: 'home', rp_ov: JSON.stringify(respond('panel/overview', {})) } });
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(2500);
		ok('[手机网络] 云端说路由器正常时，提示是手机网络问题', (await txt(page, '#hDesc')).includes('Cloudflare 显示路由器一切正常') && (await txt(page, '#statusText')) === '手机网络问题', (await txt(page, '#statusText')) + ' / ' + (await txt(page, '#hDesc')));
		await goWd(page);
		ok('[手机网络] 断线记录页也说明', (await txt(page, '#wdBody')).includes('Cloudflare 显示路由器一切正常'));
		await ctx.close();
	}
	{
		// 路由器和 Cloudflare 都连不上 → 手机没网
		const { page, ctx } = await open(browser, { mode: 'down', cloud: 'down', storage: { rp_page: 'home', rp_ov: JSON.stringify(respond('panel/overview', {})) } });
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(2500);
		ok('[手机网络] 都连不上时提示手机没网', (await txt(page, '#hDesc')).includes('路由器和 Cloudflare 都连不上') && (await txt(page, '#statusText')) === '手机网络问题', await txt(page, '#hDesc'));
		await ctx.close();
	}
	{
		// 收到 Cloudflare 530：手机网络是通的，不能说是手机的问题
		const { page, ctx } = await open(browser, { mode: '530', cloud: 'ok', storage: { rp_page: 'home', rp_ov: JSON.stringify(respond('panel/overview', {})) } });
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(2500);
		ok('[手机网络] 收到 530 时不会误说是手机问题', (await txt(page, '#statusText')) === '隧道断开' && !(await txt(page, '#hDesc')).includes('手机'), (await txt(page, '#statusText')) + ' / ' + (await txt(page, '#hDesc')));
		await ctx.close();
	}
	// 顶部小字：停在别的页面刷新也要正确
	for (const pg of ['wd', 'proxy', 'files']) {
		const { page, ctx } = await open(browser, { storage: { rp_page: pg } });
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(2000);
		ok(`在「${pg}」页刷新后顶部小字正确（没有缓存）`, (await txt(page, '#topSub')) === 'Xiaomi AX3000T · OpenClash 运行中', await txt(page, '#topSub'));
		await ctx.close();
	}
	{
		const { page, ctx } = await open(browser, { storage: { rp_page: 'dev', rp_ov: JSON.stringify(respond('panel/overview', {})) }, mode: '530' });
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(400);
		ok('有缓存时别的页面刷新顶部小字立即正确', (await txt(page, '#topSub')).startsWith('Xiaomi AX3000T'), await txt(page, '#topSub'));
		await ctx.close();
	}
	{
		const { page, ctx } = await open(browser, { storage: { rp_page: 'dev' }, mode: '530' });
		await page.goto('http://panel.test/panel/');
		await page.waitForTimeout(2000);
		ok('从没连上过又断线时顶部写「连不上路由器」', (await txt(page, '#topSub')) === '连不上路由器', await txt(page, '#topSub'));
		await ctx.close();
	}
	await browser.close();
	for (const [n, c, note] of results) console.log((c ? '✅ ' : '❌ ') + n + (note && !c ? '  ' + note : ''));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) { console.log('\n问题：'); [...new Set(problems)].forEach((p) => console.log(' - ' + p)); }
})();

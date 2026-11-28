// 流量统计页：总量、代理/直连比例、14 天柱状图、按设备排行、切换时间范围、选设备
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond, TFD } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); return J(require('./mock').reply(body.id, body.method.replace(/^panel\//, ''), body.params || {})); }
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		let p = u.pathname.replace(/^\/panel\//, '') || 'index.html';
		const f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
(async () => {
	await new Promise((r) => server.listen(8095, r));
	const browser = await chromium.launch();
	for (const dark of [false, true]) {
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8095/panel/?p=traf'); await page.waitForTimeout(2500);
		const T = dark ? '【深色】' : '';
		const body = () => page.textContent('#tfBody');
		ok(T + '打开流量统计页', (await page.textContent('#pageTitle')) === '流量统计');
		if (dark) {
			await page.screenshot({ path: path.join(__dirname, 'shots', 'traf-01-dark.png') });
			const keep3 = TFD.d; TFD.d = { ...keep3, acct: 'nft', nx: { [keep3.today]: 1 }, warn: '开着「NSS 硬件加速」：被加速的流量数不到，每台设备的用量会偏少' };
			await page.click('#statusPill'); await page.waitForTimeout(1200);
			await page.screenshot({ path: path.join(__dirname, 'shots', 'traf-03-nx-390-dark.png'), fullPage: true });
			TFD.d = keep3; await ctx.close(); continue;
		}
		// 今天：iPhone 3.61G + TV 1.3G + 路由器 0.02G + 断开的 0.01G + 未知 0.001G ≈ 4.94 GB
		ok('今天总量、上下行、代理/直连比例', /今天一共/.test(await body()) && /4\.9\d? GB/.test(await body()) && /走代理/.test(await body()) && /直连/.test(await body()), (await body()).slice(0, 200));
		ok('顶部显示今天用量', /^今天 4\.9\d? GB$/.test(await page.textContent('#tfPill')), await page.textContent('#tfPill'));
		const names = await page.$$eval('.tfrow .tfn b:first-child', (e) => e.map((x) => x.textContent));
		ok('按设备从多到少排', names[0] === 'iPhone' && names[1] === 'TV', names.join(','));
		ok('路由器自己、断开的连接、不认识的设备都有名字', names.includes('路由器自己') && names.includes('已断开的连接') && names.includes('未知设备 00:01'), names.join(','));
		ok('14 天柱状图', (await page.locator('.tfcol').count()) === 14 && (await page.locator('.tfcol.in').count()) === 1);
		ok('柱状图下标日期，今天加粗', (await page.textContent('.tfx span.now')) === '29');
		await page.screenshot({ path: path.join(__dirname, 'shots', 'traf-01.png'), fullPage: true });
		// 7 天
		await page.click('[data-r="7"]'); await page.waitForTimeout(300);
		ok('最近 7 天：柱状图高亮 7 根', (await page.locator('.tfcol.in').count()) === 7 && /最近 7 天一共/.test(await body()));
		await page.click('[data-r="month"]'); await page.waitForTimeout(300);
		ok('本月：高亮本月的天', (await page.locator('.tfcol.in').count()) === 14 && /本月一共/.test(await body()));
		await page.click('[data-r="last"]'); await page.waitForTimeout(300);
		ok('上个月有数据', /上个月一共/.test(await body()) && !/没有流量/.test(await body()) && (await page.locator('.tfcol.in').count()) === 0);
		await page.click('[data-r="yday"]'); await page.waitForTimeout(300);
		ok('昨天', /昨天一共/.test(await body()) && (await page.locator('.tfcol.in').count()) === 1);
		// 选设备
		await page.click('[data-r="today"]'); await page.waitForTimeout(300);
		await page.locator('.tfrow', { hasText: 'TV' }).click(); await page.waitForTimeout(300);
		ok('点设备：柱状图只看这台', /「TV」最近 14 天/.test(await body()) && (await page.locator('.tfrow.on').count()) === 1);
		await page.screenshot({ path: path.join(__dirname, 'shots', 'traf-02-dev.png'), fullPage: true });
		await page.click('[data-tfall]'); await page.waitForTimeout(300);
		ok('「看全部」回到所有设备', !/「TV」/.test(await body()) && (await page.locator('.tfrow.on').count()) === 0);
		// 6.0 第五阶段（用户 11/28）：防火墙计数。没装代理插件、用 PassWall 等的也有数；用 PassWall 等的日子分不出走代理和直连
		{
			const keep2 = TFD.d, td = keep2.today;
			const reload = async () => { await page.click('#statusPill'); await page.waitForTimeout(1200); };
			TFD.d = { ...keep2, acct: 'nft', warn: null, nx: {} }; await reload();
			ok('防火墙计数：分开显示走代理和直连，不再写「没运行时算不到」', /走代理/.test(await body()) && !/算不到/.test(await body()));
			TFD.d = { ...keep2, acct: 'nft', nx: { [td]: 1 }, warn: '开着「Turbo ACC（快速转发）」：被加速的流量数不到，每台设备的用量会偏少' }; await reload();
			const b2 = await body();
			ok('用 PassWall 等的日子：只显示总数，不分走代理和直连', (await page.locator('#tfBody .tfleg, #tfBody .tfsplit').count()) === 0 && !/代理 [0-9]/.test(b2) && /分不出走代理和直连/.test(b2) && /↓ /.test(b2), b2.slice(0, 300));
			ok('开着绕过内核的加速：提示数不全', /Turbo ACC/.test(b2));
			for (const [w, h] of [[320, 700], [430, 932]]) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(300); await page.screenshot({ path: path.join(__dirname, 'shots', 'traf-03-nx-' + w + '.png'), fullPage: true }); ok('「只有总数」' + w + ' 宽不横向滚动', (await page.evaluate(() => document.documentElement.scrollWidth)) <= w + 1); }
			await page.setViewportSize({ width: 390, height: 844 });
			TFD.d = { ...keep2, acct: 'none' }; await reload();
			ok('没有防火墙计数（老固件什么都没有）：写「OpenClash 或 Nikki 没运行时的流量算不到」', /没运行时的流量算不到/.test(await body()));
			TFD.d = keep2;
		}
		// 侧边栏里有入口
		ok('侧边栏「状态」里有流量统计', (await page.locator('#sidenav [data-p="traf"]').count()) === 1);
		// 没有数据时
		const keep = TFD.d; TFD.d = { days: {}, names: {}, today: null, at: null };
		await page.click('#statusPill'); await page.waitForTimeout(1200);
		ok('还没数据：提示统计刚开始', /统计刚开始/.test(await body()));
		TFD.d = keep;
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

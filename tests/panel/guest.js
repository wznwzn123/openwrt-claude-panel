// 6.0 第 15 项：访客 Wi-Fi——Wi-Fi 页下面的卡片：开 2 小时 / 1 天 / 7 天、第一次打开的倒数确认、二维码、延长、关掉、开不了说原因
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WIFI } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
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
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
(async () => {
	await new Promise((r) => server.listen(8099, r));
	const browser = await chromium.launch();
	for (const [w, h, tag, dark] of [[390, 844, '手机', false], [320, 640, '小屏', true], [430, 932, '大屏', false]]) {
		WIFI.reset(); WIFI.wait = 0;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push(`[${tag}] 页面错误：` + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8099/panel/?p=wifi'); await page.waitForTimeout(2200);
		const card = page.locator('#wfGuest .wfg'), toastT = async () => (await page.textContent('#toast')) || '';
		const last = () => page.locator('.modal').last();
		ok(`[${tag}] Wi-Fi 页下面有访客 Wi-Fi：关着，三个按钮`, /访客 Wi-Fi/.test(await card.textContent()) && /关着/.test(await card.textContent()) && (await card.locator('[data-gu]').count()) === 3);
		ok(`[${tag}] 按钮字不截断`, await card.locator('[data-gu]').evaluateAll((bs) => bs.every((b) => b.scrollWidth <= b.clientWidth + 1)));
		ok(`[${tag}] 不横向滚动`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await card.screenshot({ path: path.join(SHOT, `guest-off-${w}${dark ? '-dark' : ''}.png`) });
		// 第一次打开
		await card.locator('[data-gu="2"]').click(); await page.waitForTimeout(400);
		ok(`[${tag}] 第一次打开：说清楚会重新加载网络、90 秒内要点保留`, /第一次打开/.test(await last().textContent()) && /90 秒/.test(await last().textContent()) && /打开访客 Wi-Fi 2 小时/.test(await last().textContent()));
		await last().locator('[data-v="true"]').click(); await page.waitForTimeout(900);
		ok(`[${tag}] 发了打开 2 小时`, JSON.stringify(WIFI.gsets[0]) === JSON.stringify({ on: true, hours: 2 }));
		const ng = page.locator('.modal[data-ng]');
		ok(`[${tag}] 倒数卡片问家里还能不能上网`, /访客网络加好了，家里还能上网吗/.test(await ng.textContent()) && /秒后自动撤销/.test(await ng.textContent()) && /撤销/.test(await ng.locator('[data-back]').textContent()));
		await page.screenshot({ path: path.join(SHOT, `guest-confirm-${w}${dark ? '-dark' : ''}.png`) });
		await ng.locator('[data-keep]').click(); await page.waitForTimeout(1500);
		const qr = page.locator('.modal[data-guqr]');
		ok(`[${tag}] 点「保留」：提示已打开，接着出二维码`, /访客 Wi-Fi 已打开/.test(await toastT()) && (await qr.count()) === 1 && (await qr.locator('svg').count()) === 1, await toastT());
		const qt = await qr.textContent();
		ok(`[${tag}] 二维码下面有名字、密码、几点自动关`, /Home-Guest/.test(qt) && /k7m2-p9xw-4hr/.test(qt) && /(今天|明天) \d\d:\d\d/.test(qt), qt);
		const bx = await qr.locator('.modalbox').boundingBox();
		ok(`[${tag}] 二维码卡片不超过屏幕 70%`, bx && bx.height <= h * 0.7 + 1, JSON.stringify(bx));
		const kb = await qr.locator('[data-v="close"]').boundingBox();
		ok(`[${tag}] 「好了」按钮整个看得到`, kb && bx && kb.y + kb.height <= bx.y + bx.height + 1 && kb.y + kb.height <= h, JSON.stringify(kb));
		await page.screenshot({ path: path.join(SHOT, `guest-qr-${w}${dark ? '-dark' : ''}.png`) });
		await qr.locator('[data-v="close"]').click(); await page.waitForTimeout(800);
		const ct = await card.textContent();
		ok(`[${tag}] 卡片：开着、还剩多久、几台设备、名字和密码`, /开着/.test(ct) && /还剩 2 小时/.test(ct) && /没有设备连着/.test(ct) && /Home-Guest/.test(ct) && /k7m2-p9xw-4hr/.test(ct), ct);
		ok(`[${tag}] 开着时的按钮：二维码、延长、关掉`, (await card.locator('[data-gu]').allTextContents()).join() === '二维码,延长,关掉');
		await card.screenshot({ path: path.join(SHOT, `guest-on-${w}${dark ? '-dark' : ''}.png`) });
		// 延长
		await card.locator('[data-gu="ext"]').click(); await page.waitForTimeout(500);
		ok(`[${tag}] 延长：选多久，显示现在几点关`, /延长访客 Wi-Fi/.test(await last().textContent()) && /自动关/.test(await last().textContent()));
		await last().locator('[data-v="24"]').click(); await page.waitForTimeout(800);
		ok(`[${tag}] 延长 1 天`, JSON.stringify(WIFI.gsets[1]) === JSON.stringify({ extend: 24 }) && /延长到/.test(await toastT()) && /还剩 1 天 2 小时/.test(await card.textContent()), await card.textContent());
		// 二维码按钮
		await card.locator('[data-gu="qr"]').click(); await page.waitForTimeout(600);
		ok(`[${tag}] 点「二维码」再看一次`, (await page.locator('.modal[data-guqr]').count()) === 1);
		await page.locator('.modal[data-guqr] [data-v="close"]').click(); await page.waitForTimeout(500);
		// 关掉
		await card.locator('[data-gu="off"]').click(); await page.waitForTimeout(400);
		ok(`[${tag}] 关掉前确认（红色按钮）`, /关掉访客 Wi-Fi/.test(await last().textContent()) && (await last().locator('[data-v="true"].danger').count()) === 1);
		await last().locator('[data-v="true"]').click(); await page.waitForTimeout(800);
		ok(`[${tag}] 关掉了`, JSON.stringify(WIFI.gsets[2]) === JSON.stringify({ on: false }) && /关着/.test(await card.textContent()) && /访客 Wi-Fi 已关/.test(await toastT()));
		// 再开：不是第一次，不用倒数确认，直接出二维码
		await card.locator('[data-gu="168"]').click(); await page.waitForTimeout(400);
		ok(`[${tag}] 再开：只说 Wi-Fi 会断几秒、访客进不了家里`, /断开几秒/.test(await last().textContent()) && /进不了家里/.test(await last().textContent()) && !/第一次/.test(await last().textContent()));
		await last().locator('[data-v="true"]').click(); await page.waitForTimeout(1200);
		ok(`[${tag}] 再开：直接出二维码`, (await page.locator('.modal[data-ng]').count()) === 0 && (await page.locator('.modal[data-guqr]').count()) === 1 && WIFI.gsets[3].hours === 168);
		await page.locator('.modal[data-guqr] [data-v="close"]').click(); await page.waitForTimeout(500);
		// 有频段没开起来
		WIFI.g.bands[1].up = false; WIFI.g.devs = 3;
		await page.reload(); await page.waitForTimeout(2200);
		ok(`[${tag}] 有频段没开起来：说清楚可能的原因`, /5G 上的访客 Wi-Fi 没开起来/.test(await card.textContent()) && /3 台设备连着/.test(await card.textContent()));
		await card.locator('[data-gu="off"]').click(); await page.waitForTimeout(400);
		ok(`[${tag}] 有设备连着时，关掉前说几台会断开`, /3 台设备会断开/.test(await last().textContent()));
		await last().locator('[data-v="false"]').click(); await page.waitForTimeout(300);
		// 第一次打开点「撤销」
		WIFI.reset();
		await page.reload(); await page.waitForTimeout(2200);
		await card.locator('[data-gu="24"]').click(); await page.waitForTimeout(400);
		await last().locator('[data-v="true"]').click(); await page.waitForTimeout(900);
		// 重新打开面板：卡片还在，还是问访客网络
		await page.reload(); await page.waitForTimeout(2500);
		ok(`[${tag}] 重新打开面板：还是问访客网络`, /访客网络加好了/.test(await page.locator('.modal[data-ng]').textContent()));
		await page.locator('.modal[data-ng] [data-back]').click(); await page.waitForTimeout(1500);
		ok(`[${tag}] 点「撤销」`, WIFI.calls.some((c) => c[0] === 'net_revert') && /正在撤销访客 Wi-Fi/.test(await toastT()) && (await page.locator('.modal[data-guqr]').count()) === 0, await toastT());
		// 开不了
		WIFI.reset(); Object.assign(WIFI.g, { can: false, why: '这台路由器的无线驱动（mtwifi）不支持在面板里加访客 Wi-Fi' });
		await page.reload(); await page.waitForTimeout(2200);
		ok(`[${tag}] 开不了：说清楚原因，没有按钮`, /无线驱动（mtwifi）不支持/.test(await card.textContent()) && (await card.locator('[data-gu]').count()) === 0);
		await card.screenshot({ path: path.join(SHOT, `guest-cant-${w}${dark ? '-dark' : ''}.png`) });
		// 没有无线：不显示访客卡片
		WIFI.reset(); WIFI.none = 'nocfg'; Object.assign(WIFI.g, { can: false, why: '这台路由器没有无线' });
		await page.reload(); await page.waitForTimeout(2000);
		ok(`[${tag}] 没有无线：只说一次，不再显示访客卡片`, (await page.locator('#wfGuest .wfg').count()) === 0);
		await ctx.close();
	}
	await browser.close(); server.close();
	let bad = 0;
	for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '\n    ' + note)); if (!c) bad++; }
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n${results.length - bad}/${results.length} 通过`);
	process.exit(bad || problems.length ? 1 : 0);
})();

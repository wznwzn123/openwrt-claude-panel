// 设备页（5.2.3）：给设备改名字、改回原名、显示原名和「已在线多久」；6.0 第 84 项起点名字直接在卡片上改
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond, DN } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}');
			try { return J(require('./mock').reply(body.id, body.method.replace(/^panel\//, ''), body.params || {})); }
			catch (e) { return J({ jsonrpc: '2.0', id: body.id, error: { code: e.code || -32000, message: e.message, data: e.data } }); }
		}
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		let p = u.pathname.replace(/^\/panel\//, '') || 'index.html';
		const f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
(async () => {
	await new Promise((r) => server.listen(8097, r));
	const browser = await chromium.launch();
	for (const [w, h, tag] of [[390, 844, '手机'], [320, 640, '小屏']]) {
		for (const k of Object.keys(DN)) delete DN[k];
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8097/panel/?p=dev'); await page.waitForTimeout(2500);
		const card = (i) => page.locator(`#dvList [data-i="${i}"]`), IN = () => card(0).locator('.dvin');
		ok(`[${tag}] 有 MAC 的设备：名字能点`, (await card(0).locator('[data-ren]').count()) === 1);
		ok(`[${tag}] 读不到 MAC 的设备：名字不能点`, (await card(2).locator('[data-ren]').count()) === 0);
		ok(`[${tag}] 显示「已在线多久」`, /已在线 2 小时 15 分/.test(await card(1).textContent()), await card(1).textContent());
		await card(0).locator('[data-ren]').click(); await page.waitForTimeout(400);
		ok(`[${tag}] 点名字：就在卡片上变成输入框，提示原来的名字`, (await IN().count()) === 1 && /iPhone/.test(await IN().getAttribute('placeholder')));
		await IN().fill('妈妈的手机');
		await IN().press('Enter'); await page.waitForTimeout(1200);
		ok(`[${tag}] 改完列表里显示新名字`, /妈妈的手机/.test(await card(0).textContent()));
		ok(`[${tag}] 下面显示原名`, /原名：iPhone/.test(await card(0).textContent()));
		ok(`[${tag}] 提示改好了`, /已改名：妈妈的手机/.test(await page.textContent('#toast')));
		// 改回原名
		await card(0).locator('[data-ren]').click(); await page.waitForTimeout(400);
		await IN().fill('');
		await IN().press('Enter'); await page.waitForTimeout(1200);
		ok(`[${tag}] 留空就改回原名`, /iPhone/.test(await card(0).textContent()) && !/原名：/.test(await card(0).textContent()));
		// 太长
		await card(0).locator('[data-ren]').click(); await page.waitForTimeout(400);
		await IN().fill('这是一个非常非常非常非常非常非常长的设备名字超过了二十个字');
		await IN().press('Enter'); await page.waitForTimeout(600);
		ok(`[${tag}] 名字太长有提示，不保存，输入框还在`, /太长/.test(await page.textContent('#toast')) && !Object.keys(DN).length && (await IN().count()) === 1);
		await IN().press('Escape'); await page.waitForTimeout(300);
		ok(`[${tag}] 按 Esc 不改，名字变回原样`, (await IN().count()) === 0 && /iPhone/.test(await card(0).textContent()));
		const ow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
		ok(`[${tag}] 设备页不横向滚动`, ow <= 0, ow);
		await page.screenshot({ path: path.join(__dirname, 'shots', 'devname-' + w + '.png'), fullPage: true });
		await ctx.close();
	}
	await browser.close(); server.close();
	for (const [n, c, note] of results) console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + note + '）'));
	console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
	if (problems.length) console.log('问题：\n' + problems.join('\n'));
	process.exit(problems.length ? 1 : 0);
})();

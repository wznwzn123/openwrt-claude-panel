// 6.0 第 80 项：自定义快捷操作——选显示哪些、排先后、加「打开某一页」（含原版页面）、恢复默认；每台手机各自记；没权限的页面不显示
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const M = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const ST = { sub: false };
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, '');
			if (m === 'whoami' && ST.sub) return J({ jsonrpc: '2.0', id: body.id, result: { ...M.respond('whoami', {}), role: 'sub', perms: ['msg', 'node'] } });
			return J(M.reply(body.id, m, body.params || {}));
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
	await new Promise((r) => server.listen(8104, r));
	const browser = await chromium.launch();
	for (const [w, h, tag, dark] of [[390, 844, '手机', false], [320, 640, '小屏', true], [430, 932, '大屏', false]]) {
		ST.sub = false;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push(`[${tag}] 页面错误：` + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8104/panel/?p=home'); await page.waitForTimeout(3500);
		const grid = page.locator('#qGrid'), last = () => page.locator('.modal').last();
		const tiles = async () => (await grid.locator('.qbtn span').allTextContents()).join(',');
		ok(`[${tag}] 默认：按分组显示 12 个`, (await grid.locator('.qbtn').count()) === 12 && (await grid.locator('.qgh').count()) === 3);
		ok(`[${tag}] 概览页「快捷操作」旁有「编辑」`, await page.locator('#qEdit').isVisible());
		await page.click('#qEdit'); await page.waitForTimeout(600);
		ok(`[${tag}] 编辑：列出显示的 12 个，「恢复默认」点不了（还没改过）`, /12 个/.test(await last().textContent()) && await last().locator('[data-qreset]').isDisabled());
		await page.screenshot({ path: path.join(SHOT, `qedit-${w}${dark ? '-dark' : ''}.png`) });
		await last().locator('[data-qr="stop"]').click(); await page.waitForTimeout(300);
		ok(`[${tag}] 移除「停止」：概览页马上少了，下面「可以加的」里有它`, !/停止/.test(await tiles()) && (await last().locator('[data-qa="stop"]').count()) === 1 && (await grid.locator('.qgh').count()) === 0);
		await last().locator('[data-qd="0"]').click(); await page.waitForTimeout(300);
		ok(`[${tag}] 往后挪：「重启」排到第二`, (await tiles()).startsWith('启动,重启'), await tiles());
		await last().locator('[data-qu="1"]').click(); await page.waitForTimeout(300);
		ok(`[${tag}] 往前挪回来`, (await tiles()).startsWith('重启,启动'));
		await last().locator('[data-qpage]').click(); await page.waitForTimeout(600);
		const ps = last();
		ok(`[${tag}] 加「打开某一页」：按侧边栏分组列出页面，包括原版页面`, /添加「打开某一页」/.test(await ps.textContent()) && (await ps.locator('[data-v="wifi"]').count()) === 1 && (await ps.locator('[data-v^="k:"]').count()) > 0);
		await ps.locator('[data-v="wifi"]').click(); await page.waitForTimeout(600);
		await last().locator('[data-qpage]').click(); await page.waitForTimeout(600);
		ok(`[${tag}] 加过的页面不再列出来`, (await last().locator('[data-v="wifi"]').count()) === 0);
		const k = await last().locator('[data-v^="k:"]').first().getAttribute('data-v');
		await last().locator(`[data-v="${k}"]`).click(); await page.waitForTimeout(600);
		ok(`[${tag}] 概览页最后多了 Wi-Fi 和一个原版页面`, /Wi-Fi/.test(await tiles()) && (await grid.locator('[data-qp]').count()) === 2, await tiles());
		ok(`[${tag}] 记在这台手机上`, JSON.parse(await page.evaluate(() => localStorage.getItem('rp_quick'))).items.includes('p:wifi'));
		await page.screenshot({ path: path.join(SHOT, `qedit2-${w}${dark ? '-dark' : ''}.png`) });
		await last().locator('[data-v="close"]').first().click(); await page.waitForTimeout(500);
		await page.reload(); await page.waitForTimeout(3000);
		ok(`[${tag}] 刷新后还是自己排的`, (await tiles()).startsWith('重启,启动') && /Wi-Fi/.test(await tiles()) && !/停止/.test(await tiles()));
		ok(`[${tag}] 概览页不横向滚动、按钮不截断`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await grid.locator('[data-qp="wifi"]').click(); await page.waitForTimeout(1500);
		ok(`[${tag}] 点「Wi-Fi」打开那一页`, /Wi-Fi/.test(await page.textContent('#pageTitle')));
		// 底栏「快捷」里也一样，也能编辑
		await page.locator('.dock [data-d="quick"]').click(); await page.waitForTimeout(1200);
		const qs = last();
		ok(`[${tag}] 底栏「快捷」也按自己排的，有「编辑」`, /Wi-Fi/.test(await qs.locator('[data-g]').textContent()) && (await qs.locator('[data-qedit]').count()) === 1);
		await qs.locator('[data-qedit]').click(); await page.waitForTimeout(600);
		await last().locator('[data-qreset]').click(); await page.waitForTimeout(400);
		ok(`[${tag}] 恢复默认`, !(await page.evaluate(() => localStorage.getItem('rp_quick'))) && /已恢复默认/.test(await page.textContent('#toast')));
		await ctx.close();
	}
	// 子账号：没权限的页面不显示
	{
		ST.sub = true;
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_quick', JSON.stringify({ items: ['restart', 'p:wifi', 'p:traf', 'p:term'] })); });
		await page.goto('http://localhost:8104/panel/?p=home'); await page.waitForTimeout(3500);
		const t = (await page.locator('#qGrid .qbtn span').allTextContents()).join(',');
		ok('子账号：加过的页面里没权限的（Wi-Fi、终端）不显示', /流量统计/.test(t) && !/Wi-Fi|终端/.test(t), t);
		await ctx.close();
	}
	await browser.close(); server.close();
	let bad = 0;
	for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '\n    ' + note)); if (!c) bad++; }
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n${results.length - bad}/${results.length} 通过`);
	process.exit(bad || problems.length ? 1 : 0);
})();

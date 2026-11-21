// 冲突梳理（6.0 第 62 项）：面板打开一个文件以后，别处（原版页面、Claude、别的手机）又改了它，
// 面板保存时不能悄悄盖掉；先问用户，确认才覆盖。没被改过照常保存。
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond, FSUM } = require('./mock');
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
			try { return J({ jsonrpc: '2.0', id: body.id, result: respond(body.method.replace(/^panel\//, ''), body.params || {}) }); }
			catch (e) { return J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); }
		}
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
(async () => {
	await new Promise((r) => server.listen(8098, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
	const open = async () => {
		await page.goto('http://localhost:8098/panel/?p=cfg'); await page.waitForTimeout(2200);
		await page.click('#cfgBody [data-f="1"]'); await page.waitForTimeout(400);
		await page.click('.modal [data-v="edit"]'); await page.waitForTimeout(700);
	};
	// 1) 没被改过：照常保存，带上打开时的指纹
	FSUM.v = 'S1'; FSUM.saved.length = 0;
	await open();
	await page.click('.modal [data-s]'); await page.waitForTimeout(600);
	ok('没被别处改过：照常保存', FSUM.saved.length === 1 && FSUM.saved[0].base === 'S1' && !FSUM.saved[0].overwrite, JSON.stringify(FSUM.saved));
	// 2) 打开以后被别处改了：先问，选「取消」就不保存、编辑框还在
	FSUM.saved.length = 0;
	await open();
	FSUM.v = 'S2';
	await page.click('.modal [data-s]'); await page.waitForTimeout(700);
	const ask = await page.locator('.modal').last().textContent();
	ok('被别处改过：先问要不要覆盖', /文件在别处改过/.test(ask) && /覆盖/.test(ask), ask.slice(0, 80));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'fileconflict-ask.png') });
	await page.locator('.modal').last().locator('[data-v="false"]').click(); await page.waitForTimeout(500);
	ok('选不覆盖：没有保存', FSUM.saved.length === 0);
	ok('选不覆盖：编辑框还开着，内容没丢', (await page.locator('.modal textarea[data-t]').count()) === 1);
	// 3) 再点保存，这次确认覆盖
	await page.click('.modal [data-s]'); await page.waitForTimeout(700);
	await page.locator('.modal').last().locator('[data-v="true"]').click(); await page.waitForTimeout(700);
	ok('确认覆盖：才保存', FSUM.saved.length === 1 && FSUM.saved[0].overwrite === true, JSON.stringify(FSUM.saved));
	await browser.close(); server.close();
	for (const [n, c, note] of results) console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + note + '）'));
	console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
	if (problems.length) console.log('问题：\n' + problems.join('\n'));
	process.exit(problems.length ? 1 : 0);
})();

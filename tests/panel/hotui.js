// 热更新配套（面板）：横幅公告（顶上一条，× 关掉同一条不再出）、远程开关（关掉的功能菜单里不显示、打不开）；320 / 390 / 430、深色
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const S = { pop: [], off: [] };
const BAN = { id: 'b1', level: 'banner', title: '今晚 23:00–23:30 官网维护，面板在家里照常能用，在外面可能打不开', body: '维护内容…', at: Math.floor(Date.now() / 1000) - 60 };
function handle(m, p) {
	if (m === 'notices') { const r = mock.respond(m, {}); return { ...r, ann: [BAN], seen: { ...r.seen, pop: S.pop.slice() } }; }
	if (m === 'notices_seen') { if (p.pop) S.pop.push(p.pop); return { ok: true }; }
	if (m === 'remote_flags') return { off: S.off };
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (x) => (b += x)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); const m = body.method.replace(/^panel\//, ''); try { return J({ jsonrpc: '2.0', id: body.id, result: handle(m, body.params || {}) }); } catch (e) { return J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8198, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S.pop = [];
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8198/panel/'); await W(2000);
		ok('横幅公告：一打开就在顶上' + T, await page.isVisible('#annBar') && /官网维护/.test(await page.textContent('#annBar')));
		ok('横幅不出界、不横向滚动' + T, await page.evaluate(() => { const r = document.getElementById('annBar').getBoundingClientRect(); return r.left >= 8 && r.right <= innerWidth - 8 && document.documentElement.scrollWidth <= innerWidth + 1; }));
		await page.screenshot({ path: path.join(SHOT, `hotui-banner-${w}${dark ? '-dark' : ''}.png`) });
		// 用户 11/27：手持喇叭 + 滚动字幕，扁平小条，没有「查看」和 ×；有正文时点整条看全文
		ok('横幅前面有喇叭、没有按钮' + T, await page.isVisible('#annBar .abi') && !(await page.$('#annBar button')));
		ok('横幅是没底色的一行（不超过 30 高）' + T, (await page.evaluate(() => document.getElementById('annBar').getBoundingClientRect().height)) <= 30 && (await page.evaluate(() => getComputedStyle(document.getElementById('annBar')).backgroundColor)) === 'rgba(0, 0, 0, 0)');
		const x0 = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('#annBar .abt')).transform).m41); await W(700);
		const x1 = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('#annBar .abt')).transform).m41);
		ok('放不下：字从右往左滚' + T, (await page.getAttribute('#annBar', 'class')).includes('roll') && x1 < x0 - 5, x0 + ' → ' + x1);
		if (process.env.GIF && w === 390) for (let i = 0; i < 60; i++) { await page.screenshot({ path: path.join(process.env.GIF, `f${String(i).padStart(3, '0')}.png`), clip: { x: 0, y: 0, width: 390, height: 120 } }); await W(80); }
		await page.click('#annBar'); await W(600);
		ok('点横幅：打开通知页看全文' + T, await page.isVisible('#p-notice'));
		await ctx.close();
	}
	// 远程开关
	{
		S.off = ['split', 'xpage']; S.pop = ['b1'];
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（远程开关）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8198/panel/'); await W(2000);
		ok('远程关掉的功能：菜单里不显示', (await page.locator('#sidenav [data-p="xpage"]').count()) === 0 && (await page.locator('#sidenav [data-p="lfull"]').count()) === 1);
		await page.goto('http://localhost:8198/panel/?p=xpage'); await W(1200);
		ok('硬要打开：说暂时关了，回首页', /暂时关了/.test(await page.textContent('#toast')) && !(await page.isVisible('#p-xpage')));
		S.off = [];
		await page.reload(); await W(2500);
		ok('开关打开后：菜单里又有了', (await page.locator('#sidenav [data-p="xpage"]').count()) === 1);
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

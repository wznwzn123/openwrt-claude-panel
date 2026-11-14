// 桌面快捷方式：manifest 里的 shortcuts 能被浏览器正确解析，每个链接打开对的页面
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); return J({ jsonrpc: '2.0', id: body.id, result: respond(body.method.replace(/^panel\//, ''), body.params || {}) }); }
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		let p = u.pathname.replace(/^\/panel\//, '') || 'index.html';
		const f = path.join(ROOT, p);
		if (/^icon/.test(p)) { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(fs.readFileSync(path.join(ROOT, 'sc2', 'wd.png'))); }
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.json') ? 'application/manifest+json' : p.endsWith('.png') ? 'image/png' : 'text/javascript' });
		res.end(fs.readFileSync(f));
	});
});
(async () => {
	await new Promise((r) => server.listen(8093, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
	await page.goto('http://localhost:8093/panel/?p=home'); await page.waitForTimeout(2000);
	const cdp = await ctx.newCDPSession(page);
	const m = await cdp.send('Page.getAppManifest');
	ok('浏览器解析 manifest 没有报错', m.errors.length === 0, JSON.stringify(m.errors));
	const man = JSON.parse(m.data);
	ok('有 4 个快捷方式', man.shortcuts.length === 4);
	const want = { '断线记录': ['?p=wd', '断线记录'], '节点': ['?p=proxy', '节点'], '设备': ['?p=dev', '设备'], '流量统计': ['?p=traf', '流量统计'] };
	for (const s of man.shortcuts) {
		const [q, title] = want[s.name] || [];
		ok(`「${s.name}」链接对`, s.url.endsWith(q), s.url);
		const ic = await page.request.get(new URL(s.icons[0].src, 'http://localhost:8093/panel/').href);
		ok(`「${s.name}」图标能取到`, ic.ok() && (await ic.body()).length > 800);
		await page.goto(new URL(s.url, 'http://localhost:8093/panel/').href); await page.waitForTimeout(1800);
		ok(`从「${s.name}」快捷方式打开，直接到这一页`, (await page.textContent('#pageTitle')) === title && !page.url().includes('?p='), await page.textContent('#pageTitle'));
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

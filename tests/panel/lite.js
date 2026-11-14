// 精简版（没有 Cloudflare 云端）：不请求 /cloud/、不显示云端监测卡片、手机通知卡片说明是完整版功能；之后装了完整版能自动恢复
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
let down = false, lite = true, cloudHits = 0;
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) {
		if (down) return req.socket.destroy();
		const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, '');
		res.writeHead(200, { 'content-type': 'application/json' });
		if (lite && m === 'cloud_info') return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { enabled: false } }));
		if (lite && m === 'bk_list') return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: '还没有设置云端（云端备份是完整版功能）' } }));
		return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: respond(m, body.params || {}) }));
	}
	if (u.pathname.startsWith('/cloud/')) { cloudHits++; if (lite) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'content-type': 'application/json' }); const now = Date.now(); return res.end(JSON.stringify(u.pathname === '/cloud/s' ? { now, s: { state: 'ok', since: now - 1e6 }, label: { ok: '正常' }, r: { last: now - 20e3 }, t: null, probe: { at: now - 30e3, code: 200, fail: 0 }, events: [] } : { ok: true, subs: [], key: null })); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8121, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript(() => { if (!sessionStorage.getItem('init')) { localStorage.setItem('rp_token', 'testtoken1234567890'); sessionStorage.setItem('init', '1'); } });
	await page.goto('http://localhost:8121/panel/?p=wd'); await W(2000);
	let t = await page.textContent('#p-wd');
	ok('精简版：断线记录页正常显示看门狗', /宽带/.test(t) && /立即检查/.test(t));
	ok('精简版：没有「云端监测」卡片', !/云端监测/.test(t));
	const nt = (await page.$$eval('#p-wd .notice', (e) => e.map((x) => x.textContent))).join(' | ');
	ok('精简版：不提示「连不上 Cloudflare」', !/Cloudflare|云端/.test(nt), nt);
	ok('精简版：手机通知卡片说明需要完整版', /手机通知/.test(t) && /未启用/.test(t) && /完整版/.test(t));
	ok('精简版：每日体检卡片照常', (await page.locator('#dyCard').count()) === 1);
	ok('精简版：一次都没请求 /cloud/', cloudHits === 0, cloudHits);
	await page.click('[data-wdcheck]'); await W(1200);
	ok('精简版：立即检查后仍不请求 /cloud/', cloudHits === 0, cloudHits);
	// 路由器连不上：首页不报错、不请求云端
	down = true;
	await page.goto('http://localhost:8121/panel/?p=home'); await W(4000);
	ok('精简版断网：首页提示连不上路由器', /连不上路由器/.test(await page.textContent('body')));
	ok('精简版断网：不请求 /cloud/', cloudHits === 0, cloudHits);
	down = false;
	// 云端备份页：提示是完整版功能
	await page.goto('http://localhost:8121/panel/?p=cbk'); await W(1800);
	ok('精简版：云端备份页提示是完整版功能', /完整版功能/.test(await page.textContent('#p-cbk')), (await page.textContent('#p-cbk')).slice(0, 200));
	// 之后装了完整版：缓存里还是「没云端」，打开断线记录页会重新问路由器，第二次渲染就出现云端监测
	lite = false;
	await page.goto('http://localhost:8121/panel/?p=wd'); await W(2500);
	await page.click('[data-wdcheck]'); await W(2000);
	t = await page.textContent('#p-wd');
	ok('升级完整版后：出现「云端监测」卡片', /云端监测/.test(t), t.slice(0, 200));
	ok('升级完整版后：开始请求 /cloud/', cloudHits > 0, cloudHits);
	const w = await page.evaluate(() => document.documentElement.scrollWidth);
	ok('不横向滚动', w <= 390, w);
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

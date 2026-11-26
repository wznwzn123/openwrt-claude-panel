// 用户 11/26：点任何「更新订阅」都自动查流量——点的时候就开始查（不等更新完），更新完一起告诉：剩多少、哪天到期；
// 一个订阅用提示条，多个用小卡片（快用完 / 快到期的标出来）；机场没提供的说清楚
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const S = { calls: [], busyUntil: 0, info: {} };
const G = 1073741824, NOW = Math.floor(Date.now() / 1000);
function handle(m, p) {
	S.calls.push({ m, p, at: Date.now() });
	if (m === 'sub_update') { S.busyUntil = Date.now() + 2500; return { ok: true }; }
	if (m === 'jobs') { const r = mock.respond(m, p); return { ...r, jobs: { ...r.jobs, sub: Date.now() < S.busyUntil } }; }
	if (m === 'oc_state') { const r = JSON.parse(JSON.stringify(mock.respond(m, p))); if (S.both) r.subs = r.subs.map((x) => ({ ...x, enabled: '1' })); return r; }
	if (m === 'sub_info') return S.info[p.sid] || { ok: false, msg: '这个机场没有提供流量信息' };
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (x) => (b += x)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); const m = body.method.replace(/^panel\//, ''); return setTimeout(() => { try { J({ jsonrpc: '2.0', id: body.id, result: handle(m, body.params || {}) }); } catch (e) { J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }, 50); }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8196, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		// 一个订阅（另一个停用了）：首页快捷「更新订阅」
		S.info = { cfg29b6bc: { ok: true, upload: 2 * G, download: 28 * G, total: 300 * G, expire: NOW + 40 * 86400 } };
		await page.goto('http://localhost:8196/panel/?p=home'); await W(1500);
		S.calls = [];
		await page.click('#qGrid [data-q="subs"]'); await W(300); await page.click('.modal [data-v="true"]'); await W(600);
		const up = S.calls.find((c) => c.m === 'sub_update'), inf = S.calls.find((c) => c.m === 'sub_info' && c.p.sid === 'cfg29b6bc');
		ok('点了就开始查流量，不等更新完' + T, up && inf && inf.at < S.busyUntil, JSON.stringify(S.calls.map((c) => c.m)));
		await W(4500);
		const exp = new Date((NOW + 40 * 86400) * 1000), md = `${exp.getMonth() + 1}/${exp.getDate()}`;
		let t = await page.textContent('#toast');
		ok('更新完：提示条写「订阅已更新 · 剩多少，哪天到期」' + T, t.includes('订阅已更新 · 剩 270') && t.includes(md + ' 到期'), t);
		await page.screenshot({ path: path.join(SHOT, `subflow-one-${w}${dark ? '-dark' : ''}.png`) });
		// 订阅页：单个订阅的「更新」，快用完
		S.info = { cfg29b6bc: { ok: true, upload: 0, download: 290 * G, total: 300 * G, expire: NOW + 3 * 86400 } };
		await page.goto('http://localhost:8196/panel/?p=subs'); await W(1500);
		S.calls = [];
		await page.click('#subList [data-up]'); await W(300);
		if (await page.$('.modal [data-v="true"]')) { await page.click('.modal [data-v="true"]'); }
		await W(4800);
		t = await page.textContent('#toast');
		ok('单个订阅更新完：同样带流量（快用完的用橙色提示）' + T, /「zou」已更新 · 剩 10\.0 GB/.test(t) && S.calls.some((c) => c.m === 'sub_info'), t);
		// 两个订阅：小卡片
		S.both = true;
		S.info = { cfg29b6bc: { ok: true, upload: 0, download: 290 * G, total: 300 * G, expire: NOW + 3 * 86400 }, cfg2ab6bc: { ok: true, upload: 0, download: G, total: 0 } };
		await page.goto('http://localhost:8196/panel/?p=subs'); await W(1500);
		await page.click('#subUpdAll'); await W(300); await page.click('.modal [data-v="true"]'); await W(4800);
		t = (await page.$('.modal')) ? await page.textContent('.modal') : '';
		ok('两个订阅：小卡片列出每个，快用完的标出来，不限流量的写「流量不限」' + T, /订阅已更新/.test(t) && /zou：剩 10\.0 GB/.test(t) && /liangxinyun：流量不限/.test(t) && /快用完了/.test(t), t);
		ok('小卡片不占满屏幕' + T, await page.evaluate(() => { const b = document.querySelector('.modal .modalbox'); return b && b.getBoundingClientRect().height < innerHeight * 0.7 && document.documentElement.scrollWidth <= innerWidth + 1; }));
		await page.screenshot({ path: path.join(SHOT, `subflow-two-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-v="close"]'); await W(400);
		S.both = false;
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

// 托管版：面板读云端、管推送都用单独的面板钥匙，登录密钥绝不发给云端
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const LOGIN = 'testtoken1234567890', PK = 'pppppppppppppppppppppppppppppppp';
const seen = [];
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''); res.writeHead(200, { 'content-type': 'application/json' });
		const result = m === 'cloud_info' ? { enabled: true, url: 'https://ab3cd4ef.panel.example/cloud', tablet: 'https://ab3cd4ef.panel.example/cloud/beat/t/tk', pkey: PK, hosted: true } : respond(m, body.params || {});
		return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })); }
	if (u.pathname.startsWith('/cloud/')) { seen.push({ p: u.pathname, b }); const j = JSON.parse(b || '{}'); if (j.token !== PK) { res.writeHead(403); return res.end('{"error":"bad token"}'); } res.writeHead(200, { 'content-type': 'application/json' }); const now = Date.now(); return res.end(JSON.stringify(u.pathname === '/cloud/s' ? { now, s: { state: 'ok', since: now - 1e6 }, label: { ok: '正常' }, r: { last: now - 20e3 }, t: null, probe: { at: now - 30e3, code: 200, fail: 0 }, events: [] } : { ok: true, subs: [], wx: { on: false } })); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8125, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript((t) => localStorage.setItem('rp_token', t), LOGIN);
	await page.goto('http://localhost:8125/panel/?p=wd'); await W(2500);
	const t = await page.textContent('#p-wd');
	ok('托管版：云端监测正常显示', /云端监测/.test(t) && !/云端密钥不对/.test(t), t.slice(0, 160));
	ok('托管版：手机通知卡片正常', (await page.locator('#pushCard').count()) === 1);
	await page.click('[data-wdcheck]'); await W(1500);
	ok('发给云端的请求不少于 2 个', seen.length >= 2, seen.length);
	ok('发给云端的全部用面板钥匙', seen.every((x) => JSON.parse(x.b || '{}').token === PK), seen.map((x) => x.p).join(','));
	ok('登录密钥一次都没发给云端', !seen.some((x) => x.b.includes(LOGIN)));
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

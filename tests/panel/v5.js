// 5.0：面板脚本出错自动上报（去重、最多 3 条）、对话里的「自动回复」、低端安卓手机自动关毛玻璃、低端路由器概览刷新放慢一倍
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const R = []; const ok = (n, c, x) => R.push((c ? '✓ ' : '✗ ') + n + (c ? '' : '（' + x + '）'));
const T = Date.now();
let ERRS = [], LOW = false, OV = 0;
const CHAT = [{ s: 1, f: 'u', t: T - 120e3, x: '节点打不开了' }, { s: 2, f: 'a', t: T - 119e3, x: '收到啦！开发者现在不在线', auto: 1 }, { s: 3, f: 'a', t: T - 60e3, x: '我看看' }];
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), a = body.params || {};
		let r;
		if (m === 'client_error') { ERRS.push(a); r = { ok: true, sent: true }; }
		else if (m === 'chat') r = { ok: true, msgs: a.op === 'get' ? CHAT.filter((x) => x.s > (+a.after || 0)) : [], uu: 0, seq: 3, hosted: true, adminSeen: 1 };
		else if (m === 'overview') { OV++; r = respond(m, a); if (LOW) r.system = { ...(r.system || {}), cpus: 1, mem_total: 128 * 1048576, mem_avail: 40 * 1048576 }; else r.system = { ...(r.system || {}), cpus: 4, mem_total: 512 * 1048576, mem_avail: 300 * 1048576 }; }
		else r = respond(m, a);
		res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: r })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'application/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
(async () => {
	await new Promise((z) => server.listen(8164, z));
	const B = 'http://localhost:8164/panel/';
	const browser = await chromium.launch();
	const mk = async (o = {}) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...o }); await ctx.addInitScript(() => { localStorage.setItem('rp_token', 'testtokentesttokentest'); }); return ctx; };
	const W = (ms) => new Promise((z) => setTimeout(z, ms));

	// 1. 脚本出错自动上报
	let ctx = await mk(), pg = await ctx.newPage();
	await pg.goto(B + '?p=home'); await W(2500);
	ERRS = [];
	await pg.evaluate(() => { for (let i = 0; i < 2; i++) setTimeout(() => { throw new TypeError('boom-A'); }, 10); for (const k of ['B', 'C', 'D', 'E']) setTimeout(() => { throw new Error('boom-' + k); }, 30); });
	await W(800);
	ok('出错了：经路由器上报（同一条只报一次，一次打开最多 3 条）', ERRS.length === 3 && ERRS[0].msg.includes('boom-A') && new Set(ERRS.map((e) => e.msg)).size === 3, JSON.stringify(ERRS.map((e) => e.msg)));
	ok('上报带着手机类型、屏幕大小、在哪一页；不带网址参数', ERRS[0] && /安卓|苹果|其它|Windows|Mac/.test(ERRS[0].ua) && ERRS[0].w === 390 && ERRS[0].page === 'home' && !/[?#]/.test(ERRS[0].where || ''), JSON.stringify(ERRS[0]));
	await ctx.close();
	ctx = await mk(); pg = await ctx.newPage(); ERRS = [];
	await pg.goto(B + '?p=home'); await W(2000);
	await pg.evaluate(() => { Promise.reject(new Error('路由器回的业务错误')); Promise.reject(new TypeError('x is not a function')); fetch('http://127.0.0.1:1/nope').catch(() => {}); });
	await W(600);
	ok('没接住的 Promise：只报程序错误，业务错误、断网不报', ERRS.length === 1 && ERRS[0].msg === 'x is not a function', JSON.stringify(ERRS.map((e) => e.msg)));
	// 2. 对话里的自动回复
	await pg.goto(B + '?p=chat'); await W(2500);
	const who = await pg.$$eval('.chwho', (l) => l.map((e) => e.textContent));
	ok('对话：自动回复标着「自动回复」，开发者本人的标「开发者」', who.includes('自动回复') && who.includes('开发者') && who.indexOf('自动回复') < who.lastIndexOf('开发者'), JSON.stringify(who));
	await ctx.close();

	// 3. 低端安卓手机：关掉毛玻璃
	for (const [name, mem, cores, ua, expect] of [['低端安卓（2GB）', 2, 8, 'Mozilla/5.0 (Linux; Android 11; Redmi 9A) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', true], ['低端安卓（4 核）', 4, 4, 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', true], ['好的安卓（8GB 8 核）', 8, 8, 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', false], ['iPhone', 0, 6, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', false]]) {
		ctx = await mk({ userAgent: ua });
		await ctx.addInitScript(([m, c]) => { if (m) Object.defineProperty(navigator, 'deviceMemory', { get: () => m }); Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => c }); localStorage.setItem('rp_glass', '1'); }, [mem, cores]);
		pg = await ctx.newPage(); const pe = []; pg.on('pageerror', (e) => pe.push(e.message));
		await pg.goto(B + '?p=home'); await W(2200);
		const r = await pg.evaluate(() => ({ low: document.documentElement.classList.contains('lowfx'), bf: getComputedStyle(document.querySelector('.top')).backdropFilter, card: getComputedStyle(document.querySelector('.card')).backgroundColor }));
		ok(`${name}：${expect ? '自动关掉毛玻璃，卡片底色不透明' : '保留毛玻璃'}`, r.low === expect && (expect ? r.bf === 'none' && /0\.9|rgb\(/.test(r.card) : r.bf !== 'none') && !pe.length, JSON.stringify(r) + pe.join());
		if (process.env.SHOTS) await pg.screenshot({ path: path.join(process.env.SHOTS, 'v5-lowfx-' + (expect ? 'on' : 'off') + '-' + mem + '-' + cores + '.png') });
		await ctx.close();
	}

	// 4. 低端路由器：概览刷新放慢一倍（4 秒 → 8 秒）
	for (const low of [false, true]) {
		LOW = low; ctx = await mk(); pg = await ctx.newPage();
		await pg.goto(B + '?p=home'); await W(3000);
		OV = 0; await W(16500);
		ok(`${low ? '低端路由器（单核、128 MB）：16 秒刷新 2 次' : '普通路由器：16 秒刷新 4 次（跟以前一样）'}`, low ? OV >= 1 && OV <= 3 : OV >= 3, OV);
		await ctx.close();
	}
	await browser.close(); server.close();
	R.forEach((x) => console.log(x));
	const f = R.filter((x) => x.startsWith('✗')).length;
	console.log(`通过 ${R.length - f}/${R.length}`);
	process.exit(f ? 1 : 0);
})();

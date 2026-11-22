// 打开面板时自己弹出来的弹窗（必须更新、重要公告、反馈有回复）：手机上是居中的小卡片，不占满屏幕；
// 内容很长时在卡片里上下滑，按钮一直看得到；不横向滚动、不截断
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel');
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const LONG = Array.from({ length: 14 }, (_, i) => '• 第 ' + (i + 1) + ' 条更新：这是一段比较长的更新说明，用来看看在小屏幕手机上会不会把弹窗撑得占满整个屏幕').join('\n');
let MODE = 'force';
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) {
		const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, '');
		let result;
		if (m === 'update_check') result = MODE === 'force' ? { cur: '5.2.3', code: 'hosted-ai', latest: '6.0.0', notes: LONG, newer: true, force: true } : { cur: '6.0.0', latest: '6.0.0', newer: false };
		else if (m === 'notices') result = { ...respond('notices', {}), ann: MODE === 'ann' ? [{ id: 'a1', title: '6.0 上线了：面板换了新的登录方式', level: 'important', body: LONG, at: Math.round(Date.now() / 1000) - 600 }] : [], seen: { t: 0, pop: [] } };
		else if (m === 'fb_replies') result = MODE === 'fb' ? { list: [{ code: 'abcd2345', at: Date.now() - 864e5, updated: Date.now() - 3600e3, seen: 0, reply: LONG, done: 1, stage: 3 }] } : { list: [] };
		else result = respond(m, body.params || {});
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
	}
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8171, r));
	const browser = await chromium.launch();
	for (const mode of ['force', 'ann', 'fb']) {
		MODE = mode;
		const sel = { force: '.modal[data-upd]', ann: '.modal[data-ann]', fb: '.modal[data-fbr]' }[mode], name = { force: '必须更新', ann: '重要公告', fb: '反馈有回复' }[mode];
		for (const [w, h, dark] of [[320, 568, false], [390, 844, true], [430, 932, false], [1280, 800, true]]) {
			const T = `［${name} ${w}${dark ? ' 深色' : ''}］`;
			const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900, colorScheme: dark ? 'dark' : 'light' });
			const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
			await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890abc'); if (matchMedia('(prefers-color-scheme: dark)').matches) localStorage.setItem('rp_dark', '1'); });
			await page.goto('http://localhost:8171/panel/'); await W(mode === 'ann' ? 9000 : mode === 'fb' ? 6000 : 6000);
			const g = await page.evaluate((s) => {
				const m = document.querySelector(s + ' .modalbox'); if (!m) return null;
				const r = m.getBoundingClientRect(), W = document.documentElement.clientWidth, H = innerHeight;
				const btns = [...m.querySelectorAll('.cfoot .btn')].map((b) => b.getBoundingClientRect());
				const sc = m.querySelector('.cscroll');
				return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, W, H, sw: document.documentElement.scrollWidth, btnIn: btns.length > 0 && btns.every((b) => b.bottom <= r.bottom + 0.5 && b.top >= r.top && b.height > 30), scroll: sc ? sc.scrollHeight > sc.clientHeight : false };
			}, sel);
			ok('打开面板自己弹出来' + T, !!g);
			if (g) {
				ok('不占满屏幕：高度不到屏幕的 75%，上下都留着空' + T, g.h <= g.H * 0.75 + 1 && g.top > 8 && g.H - g.bottom > 8, `高 ${Math.round(g.h)} / ${g.H}，上 ${Math.round(g.top)} 下 ${Math.round(g.H - g.bottom)}`);
				ok('左右不贴边、不横向滚动' + T, g.left >= 8 && g.W - g.right >= 8 && g.sw <= g.W, JSON.stringify({ l: g.left, r: g.W - g.right, sw: g.sw }));
				ok('按钮一直在卡片里看得到' + T, g.btnIn);
				if (mode !== 'fb') ok('内容太长：在卡片里上下滑' + T, g.scroll); // 反馈的回复本来就先折叠成 6 行
				await page.screenshot({ path: path.join(__dirname, 'shots', `pop-${mode}-${w}${dark ? '-dark' : ''}.png`) });
				if (mode === 'force') {
					await page.mouse.click(4, 4); await W(400);
					ok('必须更新：点外面关不掉' + T, (await page.locator(sel).count()) === 1);
				}
			}
			await ctx.close();
		}
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

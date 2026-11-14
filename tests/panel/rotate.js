// 换登录密钥：确认后这台手机自动换新密钥，之后的请求都用新的；新地址先打码；自建完整版提醒换 PANEL_TOKEN
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const OLD = 'oldtoken1234567890abc', NEW = 'n'.repeat(40);
let cur = OLD, selfcloud = false;
const calls = [];
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const tok = decodeURIComponent(u.pathname.split('/').pop()); const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''); calls.push({ m, tok });
		if (tok !== cur) { res.writeHead(404); return res.end('{"error":"not found"}'); }
		let result;
		if (m === 'rotate_key') { if (body.params.confirm !== 'ROTATE') result = { error: 'x' }; else { cur = NEW; result = { token: NEW, host: 'r.example.com', selfcloud }; } }
		else if (m === 'cloud_info') result = { enabled: false };
		else result = respond(m, body.params || {});
		return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8131, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript((t) => { if (!sessionStorage.getItem('i')) { localStorage.setItem('rp_token', t); sessionStorage.setItem('i', '1'); } }, OLD);
	await page.goto('http://localhost:8131/panel/?p=more'); await W(1500);
	ok('「系统操作」里有「换登录密钥」', await page.isVisible('[data-t="rotatekey"]'));
	// 取消：什么都不发生
	await page.click('[data-t="rotatekey"]'); await W(400);
	ok('先弹确认，说清楚后果', /旧的登录地址马上作废/.test(await page.textContent('.modal')) && /其他已经登录的手机要重新添加/.test(await page.textContent('.modal')) && /Claude/.test(await page.textContent('.modal')));
	await page.click('.modal [data-v="0"], .modal button:has-text("取消")'); await W(400);
	ok('点取消：没有换', !calls.some((c) => c.m === 'rotate_key') && cur === OLD);
	// 确认
	await page.click('[data-t="rotatekey"]'); await W(400);
	await page.click('.modal button:has-text("换新密钥")'); await W(800);
	ok('确认后：路由器换了新密钥', cur === NEW && calls.some((c) => c.m === 'rotate_key' && c.tok === OLD));
	ok('这台手机自动换成新密钥（存好了）', (await page.evaluate(() => localStorage.getItem('rp_token'))) === NEW);
	ok('新地址先打码，点一下才显示', (await page.getAttribute('.modal .keybox', 'class')).includes('blur') && (await page.textContent('.modal .keybox')).includes('/cgi-bin/mcp/' + NEW));
	ok('普通情况：不提 PANEL_TOKEN', !/PANEL_TOKEN/.test(await page.textContent('.modal')));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'rotate-01.png') });
	await page.click('.modal button:has-text("完成")'); await W(300);
	calls.length = 0;
	await page.goto('http://localhost:8131/panel/?p=home'); await W(1800);
	ok('之后的请求都用新密钥，不会掉线', calls.length > 0 && calls.every((c) => c.tok === NEW), JSON.stringify(calls.slice(0, 3)));
	await page.reload(); await W(1500);
	ok('刷新页面后还是登录状态（用的新密钥）', calls.some((c) => c.tok === NEW) && !(await page.isVisible('#login')));
	// 自建完整版：提醒换 Worker 的 PANEL_TOKEN
	selfcloud = true; cur = NEW;
	await page.goto('http://localhost:8131/panel/?p=more'); await W(1200);
	await page.click('[data-t="rotatekey"]'); await W(400); await page.click('.modal button:has-text("换新密钥")'); await W(800);
	ok('自建完整版：提醒把 Worker 的 PANEL_TOKEN 也换掉', /PANEL_TOKEN/.test(await page.textContent('.modal')));
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

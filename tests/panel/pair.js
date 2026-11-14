// 添加新手机（二维码登录）、托管版绑定到账号（配对码、已绑定账号、移除）
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const LOGIN = 'testtoken1234567890abc';
let hosted = false, accs = [{ uid: 'abcdefghijk2', email: 'al***@x.com', at: 1 }, { uid: 'bcdefghijk23', email: 'bo***@y.com', at: 2 }];
const calls = [];
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const tok = decodeURIComponent(u.pathname.split('/').pop()); const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''); calls.push({ m, tok, p: body.params }); res.writeHead(200, { 'content-type': 'application/json' });
		let result;
		if (m === 'cloud_info') result = hosted ? { enabled: true, url: 'https://ab3cd4ef.panel.example/cloud', tablet: 'x', pkey: 'p'.repeat(32), hosted: true, hub: 'https://panel.example' } : { enabled: false };
		else if (m === 'hub_pair') result = { code: 'ABCD2345', exp: Date.now() + 600e3, url: 'https://panel.example/app?pair=ABCD2345' };
		else if (m === 'hub_accounts') result = accs;
		else if (m === 'hub_unbind') { accs = accs.filter((a) => a.uid !== body.params.uid); result = { ok: true }; }
		else result = respond(m, body.params || {});
		return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8126, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
	const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript((t) => { if (!sessionStorage.getItem('i')) { localStorage.setItem('rp_token', t); sessionStorage.setItem('i', '1'); } }, LOGIN);
	await page.goto('http://localhost:8126/panel/?p=more'); await W(1500);
	ok('自建版：「绑定到账号」不显示', await page.evaluate(() => document.getElementById('hubBindBtn').classList.contains('hidden')));
	ok('二维码组件还没加载（用到才加载）', !(await page.evaluate(() => !!window.qrcode)));
	await page.click('[data-t="addphone"]'); await W(800);
	ok('添加新手机：显示二维码', (await page.locator('.modal .qrbox svg').count()) === 1);
	ok('二维码先打码，点一下才显示', (await page.getAttribute('.modal .qrbox', 'class')).includes('blur'));
	await page.click('.modal .qrbox'); await W(200);
	ok('点了之后显示清楚', !(await page.getAttribute('.modal .qrbox', 'class')).includes('blur'));
	ok('有不要截图、不要发给别人的提醒', /不要截图/.test(await page.textContent('.modal')));
	await page.click('.modal [data-copy]'); await W(300);
	const link = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
	ok('复制的链接是面板地址 + #login=登录密钥', link === 'http://localhost:8126/panel/#login=' + LOGIN, link);
	await page.click('.modal [data-v="close"]'); await W(400);
	// 新手机扫码打开
	const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const p2 = await ctx2.newPage(); p2.on('pageerror', (e) => problems.push('页面错误2：' + e.message));
	const before = calls.length;
	await p2.goto('http://localhost:8126/panel/#login=' + LOGIN); await W(2000);
	ok('新手机扫码打开：直接进面板（不显示登录页）', await p2.evaluate(() => document.getElementById('login').classList.contains('hidden')));
	ok('密钥存到了这台手机，地址栏里的 #login 去掉了', (await p2.evaluate(() => localStorage.getItem('rp_token'))) === LOGIN && !(await p2.evaluate(() => location.hash)));
	ok('新手机用这个密钥连路由器', calls.slice(before).some((c) => c.tok === LOGIN));
	const p3 = await ctx2.newPage();
	await p3.goto('http://localhost:8126/panel/#login=bad'); await W(800);
	ok('格式不对的 #login 不会覆盖已有密钥', (await p3.evaluate(() => localStorage.getItem('rp_token'))) === LOGIN);
	await ctx2.close();
	// 托管版：绑定到账号
	hosted = true;
	await page.goto('http://localhost:8126/panel/?p=more'); await W(1500);
	ok('托管版：「绑定到账号」显示出来', !(await page.evaluate(() => document.getElementById('hubBindBtn').classList.contains('hidden'))));
	await page.click('#hubBindBtn'); await W(1200);
	const t = await page.textContent('.modal');
	ok('显示配对码（分两段好读）', /ABCD 2345/.test(t), t.slice(0, 120));
	ok('配对二维码直接显示（不打码，它不是密钥）', (await page.locator('.modal .qrbox:not(.blur) svg').count()) === 1);
	ok('「打开官网」链接带配对码', (await page.getAttribute('.modal a.btn.primary', 'href')) === 'https://panel.example/app?pair=ABCD2345');
	ok('列出已绑定的账号（邮箱打码）', /al\*\*\*@x\.com/.test(t) && /bo\*\*\*@y\.com/.test(t));
	await page.click('.modal [data-unb="bcdefghijk23"]'); await W(500);
	await page.click('.modal:last-of-type [data-v="true"]'); await W(1200);
	ok('移除一个账号（先确认），列表更新', calls.some((c) => c.m === 'hub_unbind' && c.p.uid === 'bcdefghijk23') && !/bo\*\*\*@y\.com/.test(await page.textContent('.modal')));
	const w = await page.evaluate(() => document.documentElement.scrollWidth);
	ok('不横向滚动', w <= 390, w);
	await page.screenshot({ path: path.join(__dirname, 'shots', 'pair.png') });
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

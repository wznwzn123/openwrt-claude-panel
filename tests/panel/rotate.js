// 换登录密钥（6.0 第 63 项：只在「我的主页 → 敏感信息」里，自建版输路由器后台密码验证后才能换）：
// 确认后这台手机自动换新密钥，之后的请求都用新的；新地址先打码；自建完整版提醒换 PANEL_TOKEN
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (process.env.DBG) console.log((c ? 'OK ' : 'NO ') + n + ' ' + (c ? '' : String(note || '').slice(0, 300))); if (!c) problems.push(n + (note ? '：' + note : '')); };
const OLD = 'oldtoken1234567890abc', NEW = 'n'.repeat(40);
let cur = OLD, selfcloud = false;
const SU = 's'.repeat(24);
const calls = [];
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const tok = decodeURIComponent(u.pathname.split('/').pop()); const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''); calls.push({ m, tok });
		if (tok !== cur && tok !== 'pass') { res.writeHead(404); return res.end('{"error":"not found"}'); } // 6.0：平时走通行证地址（模拟路由器在 mock.js 里发通行证）
		let result;
		let error;
		if (m === 'sudo_local') { if (body.params.pw === 'rootpw') result = { sudo: SU, exp: Date.now() + 600e3 }; else error = { code: -32000, message: '密码不对（还能再试 4 次）' }; }
		else if (m === 'rotate_key') { if (body.params.sudo !== SU) error = { code: -32000, message: '要先确认是你本人：在「我的主页 → 敏感信息」里验证' }; else if (body.params.confirm !== 'ROTATE') error = { code: -32000, message: 'x' }; else { cur = NEW; result = { token: NEW, host: 'r.example.com', selfcloud }; } }
		else if (m === 'cloud_info') result = { enabled: false };
		else result = respond(m, body.params || {});
		if (error) return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error }));
		return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8182, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript((t) => { if (!sessionStorage.getItem('i')) { localStorage.setItem('rp_token', t); sessionStorage.setItem('i', '1'); } }, OLD);
	await page.goto('http://localhost:8182/panel/?p=more'); await W(1500);
	ok('「系统操作」里没有「换登录密钥」了（只在敏感信息里）', (await page.locator('[data-t="rotatekey"]').count()) === 0);
	ok('「系统操作」里也没有连接器地址、已登录的手机、（自建版的）添加新手机', (await page.locator('#p-more [data-t="ckey"], #p-more [data-t="devices"]').count()) === 0 && !(await page.isVisible('#p-more [data-t="addphone"]')));
	await page.goto('http://localhost:8182/panel/?p=me'); await W(1500);
	ok('自建版也有「我的主页」：敏感信息锁着，要输路由器后台密码', /输路由器后台密码验证/.test(await page.textContent('#meBox')) && (await page.locator('#meBox [data-pw]').count()) === 1 && !/换登录密钥<\/b>/.test(await page.innerHTML('#meBox [data-mp="krot"]').catch(() => '')));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'rotate-00-lock.png') });
	await page.fill('#meBox [data-pw]', 'wrong'); await page.click('#meBox [data-pwok]'); await W(700);
	ok('密码不对：说清楚，还锁着', /密码不对/.test(await page.textContent('#toast')) && (await page.locator('#meBox [data-pw]').count()) === 1);
	await page.fill('#meBox [data-pw]', 'rootpw'); await page.click('#meBox [data-pwok]'); await W(900);
	ok('密码对了：显示「这台路由器的钥匙」，有倒计时', /这台路由器的钥匙/.test(await page.textContent('#meBox')) && /后自动锁上/.test(await page.textContent('#mpLeft')) && (await page.locator('#meBox [data-mp="kphone"]').count()) === 1);
	ok('输进去的密码不留在页面上', (await page.locator('#meBox [data-pw]').count()) === 0);
	await page.screenshot({ path: path.join(__dirname, 'shots', 'rotate-00-keys.png') });
	// 取消：什么都不发生
	await page.click('#meBox [data-mp="krot"]'); await W(400);
	ok('先弹确认，说清楚后果（旧地址作废，已登录的手机不受影响）', /旧的登录地址马上作废/.test(await page.textContent('.modal')) && /不受影响/.test(await page.textContent('.modal')) && /AI 连接器/.test(await page.textContent('.modal')));
	await page.click('.modal [data-v="0"], .modal button:has-text("取消")'); await W(400);
	ok('点取消：没有换', !calls.some((c) => c.m === 'rotate_key') && cur === OLD);
	// 确认
	await page.click('#meBox [data-mp="krot"]'); await W(400);
	await page.click('.modal button:has-text("换新密钥")'); await W(800);
	ok('确认后：路由器换了新密钥', cur === NEW && calls.some((c) => c.m === 'rotate_key'));
	ok('这台手机不受影响：用的是自己的钥匙，新的登录密钥也不存在手机上（6.0 第 6 项）', !(await page.evaluate(() => localStorage.getItem('rp_token'))) && !!(await page.evaluate(() => localStorage.getItem('rp_dev'))));
	ok('新地址先打码，点一下才显示', (await page.getAttribute('.modal .keybox', 'class')).includes('blur') && (await page.textContent('.modal .keybox')).includes('/cgi-bin/mcp/' + NEW));
	ok('普通情况：不提 PANEL_TOKEN', !/PANEL_TOKEN/.test(await page.textContent('.modal')));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'rotate-01.png') });
	await page.click('.modal button:has-text("完成")'); await W(300);
	calls.length = 0;
	await page.goto('http://localhost:8182/panel/?p=home'); await W(1800);
	ok('之后的请求照常（走通行证，不用登录地址），不会掉线', calls.length > 0 && calls.every((c) => c.tok === 'pass'), JSON.stringify(calls.slice(0, 3)));
	await page.reload(); await W(1500);
	ok('刷新页面后还是登录状态', calls.some((c) => c.tok === 'pass') && !(await page.isVisible('#login')));
	// 自建完整版：提醒换 Worker 的 PANEL_TOKEN
	selfcloud = true; cur = NEW;
	await page.goto('http://localhost:8182/panel/?p=me'); await W(1500);
	ok('刷新后 10 分钟内不用再输密码', (await page.locator('#meBox [data-mp="krot"]').count()) === 1);
	await page.click('#meBox [data-mp="krot"]'); await W(400); await page.click('.modal button:has-text("换新密钥")'); await W(800);
	ok('自建完整版：提醒把 Worker 的 PANEL_TOKEN 也换掉', /PANEL_TOKEN/.test(await page.textContent('.modal')));
	await page.click('.modal button:has-text("完成")').catch(() => {}); await W(300);
	await page.click('#meBox [data-mp="lock"]'); await W(500);
	ok('「现在锁上」：又要输密码，路由器那边的凭证也作废', (await page.locator('#meBox [data-pw]').count()) === 1 && calls.some((c) => c.m === 'sudo_drop'));
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

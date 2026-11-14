// 面板锁防破解测试：用普通手段（点、按键、返回、链接、刷新、切后台、暴力试密码）都绕不过去
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
let rpcCalls = [];
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); rpcCalls.push(body.method); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: respond(body.method.replace(/^panel\//, ''), body.params || {}) })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(403); return res.end('{}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8102, r));
	const browser = await chromium.launch();
	const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: UA });
	const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	// 先正常开启面板锁（密码 2468），并存一份「上次的首页数据」看锁着时会不会露出来
	await page.addInitScript(() => { if (!sessionStorage.getItem('s0')) { localStorage.setItem('rp_token', 'testtoken1234567890'); sessionStorage.setItem('s0', '1'); } });
	await page.goto('http://localhost:8102/panel/?p=more'); await W(1500);
	await page.click('[data-t="lock"]'); await W(400); await page.locator('.modal [data-v="true"]').last().click(); await W(400);
	for (let i = 0; i < 2; i++) { await page.fill('.modal:last-of-type input', '2468'); await page.click('.modal:last-of-type [data-ok]'); await W(700); }
	if (await page.locator('.modal [data-v="false"]').count()) { await page.locator('.modal [data-v="false"]').last().click(); await W(400); }
	const c = await page.evaluate(() => JSON.parse(localStorage.getItem('rp_lock')));
	ok('密码不存明文，也不是简单哈希（PBKDF2 加盐）', c && c.on && !JSON.stringify(c).includes('2468') && c.salt && c.hash && c.hash.length === 44);
	await page.evaluate(() => localStorage.setItem('rp_ov', JSON.stringify({ secretMarker: 'XYZZY-SECRET', clash: { mode: 'rule' } })));
	const locked = () => page.evaluate(() => document.body.classList.contains('locked') && !document.getElementById('lock').classList.contains('hidden'));

	// 1. 冷启动（关掉 App 后再打开）：锁住时背后不加载、不请求路由器
	await page.evaluate(() => sessionStorage.removeItem('rp_lkact'));
	for (const url of ['/panel/', '/panel/?p=dev', '/panel/?p=cbk', '/panel/?p=term']) {
		rpcCalls = [];
		await page.goto('http://localhost:8102' + url); await W(2500);
		const body = await page.evaluate(() => document.getElementById('app').innerText);
		ok(`打开 ${url}：先锁住，不向路由器要任何数据`, (await locked()) && rpcCalls.length === 0, rpcCalls.join(','));
		ok(`打开 ${url}：锁屏背后没有面板内容`, !/XYZZY|设备|云端备份/.test(body) || body.trim().length < 40 || (await page.evaluate(() => getComputedStyle(document.getElementById('app')).visibility === 'hidden')));
	}
	const appEmpty = await page.evaluate(() => document.querySelectorAll('#qGrid .qbtn').length === 0 || getComputedStyle(document.getElementById('app')).visibility === 'hidden');
	ok('锁着时面板看不见', appEmpty);
	// 2. 点屏幕任何位置都点不到后面的按钮
	const pts = [[195, 60], [60, 800], [330, 800], [195, 400], [20, 20]];
	const hits = await page.evaluate((pts) => pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('#lock')); }), pts);
	ok('点屏幕任何位置都只会点到锁屏', hits.every(Boolean), JSON.stringify(hits));
	// 3. 键盘：Tab 走不到后面，回车、Esc 没用
	for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
	const inLock = await page.evaluate(() => { const a = document.activeElement; return !a || a === document.body || !!a.closest('#lock'); });
	await page.keyboard.press('Enter'); await page.keyboard.press('Escape'); await W(300);
	ok('Tab 键走不到锁屏后面的按钮，回车 / Esc 打不开', inLock && (await locked()));
	// 4. 安卓返回键 / 浏览器后退
	await page.mouse.click(195, 500); await W(200);
	await page.evaluate(() => history.back()); await W(500);
	ok('按返回键不会退掉锁屏', await locked());
	// 5. 切到后台再回来、窗口变化
	rpcCalls = [];
	await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); dispatchEvent(new Event('resize')); dispatchEvent(new Event('focus')); }); await W(1200);
	ok('切后台再回来：仍锁着，也不偷偷刷新数据', (await locked()) && !rpcCalls.some((m) => /panel\//.test(m)), rpcCalls.join(','));
	// 6. 后台弹出的通知 / 对话框看不到
	await page.evaluate(() => { const m = document.createElement('div'); m.className = 'modal'; m.id = 'fakeModal'; m.textContent = 'XYZZY'; document.body.appendChild(m); }); await W(200);
	ok('锁着时后面弹出的对话框看不到', await page.evaluate(() => getComputedStyle(document.getElementById('fakeModal')).visibility === 'hidden'));
	await page.evaluate(() => document.getElementById('fakeModal').remove());
	// 6b. 锁着时连续刷新、伪造「刚刚还在用」的时间（未来时间）都绕不过去
	for (let i = 0; i < 3; i++) { await page.reload(); await W(900); }
	ok('锁着时连续刷新 3 次：仍然锁着', await locked());
	await page.evaluate(() => sessionStorage.setItem('rp_lkact', String(Date.now() + 3600e3)));
	await page.reload(); await W(1200);
	ok('把「最近操作时间」改成未来时间也绕不过去', await locked());
	// 7. 暴力试密码：越错等越久，刷新不清零，累计 20 次断开手机
	const tryPin = async (v) => { await page.evaluate((v) => { for (const ch of v) document.querySelector(`#lkPad [data-k="${ch}"]`).click(); }, v); await W(1200); };
	for (let i = 0; i < 5; i++) await tryPin('1111');
	let cf = await page.evaluate(() => JSON.parse(localStorage.getItem('rp_lock')));
	ok('错 5 次：要等 30 秒', cf.until - Date.now() > 25000 && cf.until - Date.now() <= 30000);
	await tryPin('2468');
	ok('等待期间输对也打不开', await locked());
	await page.reload(); await W(1500);
	ok('刷新面板也不会清掉等待', /后再试/.test(await page.textContent('#lkMsg')));
	const skip = () => page.evaluate(() => { const c = JSON.parse(localStorage.getItem('rp_lock')); c.until = Date.now() - 1; localStorage.setItem('rp_lock', JSON.stringify(c)); });
	await skip(); await page.reload(); await W(1500);
	for (let i = 0; i < 5; i++) await tryPin('1111');
	cf = await page.evaluate(() => JSON.parse(localStorage.getItem('rp_lock')));
	ok('再错 5 次：等待翻倍到 1 分钟', cf.until - Date.now() > 55000 && cf.until - Date.now() <= 60000);
	await skip(); await page.reload(); await W(1500);
	for (let i = 0; i < 5; i++) await tryPin('1111');
	await skip(); await page.reload(); await W(1500);
	for (let i = 0; i < 4; i++) await tryPin('1111');
	ok('快到上限时提醒「再错几次会断开」', /再错 1 次会断开/.test(await page.textContent('#lkMsg')), await page.textContent('#lkMsg'));
	await tryPin('1111'); await W(800);
	const after = await page.evaluate(() => ({ tok: localStorage.getItem('rp_token'), lock: localStorage.getItem('rp_lock'), login: !document.getElementById('login').classList.contains('hidden') }));
	ok('累计错 20 次：断开这台手机（清掉密钥），只能重新粘贴连接器地址', !after.tok && !after.lock && after.login, JSON.stringify(after));
	// 8. 正确流程不受影响：重新登录后没有锁，开锁后输对能进
	await page.evaluate(() => localStorage.setItem('rp_token', 'testtoken1234567890'));
	await page.goto('http://localhost:8102/panel/?p=home'); await W(1500);
	ok('重新连接后不会被旧锁卡住', !(await locked()) && (await page.locator('#qGrid .qbtn').count()) === 12);
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

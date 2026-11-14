// 面板锁：开启（密码 + 指纹）、打开即锁、指纹解锁、密码解锁、输错 5 次等 30 秒、5 分钟没操作自动锁、修改/关闭要验证、忘记密码 = 断开
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
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8100, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	// 模拟手机的指纹（平台验证器）
	const cdp = await ctx.newCDPSession(page);
	await cdp.send('WebAuthn.enable', { enableUI: false });
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
	const setUV = (v) => cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: v });
	await page.addInitScript(() => { if (!sessionStorage.getItem('t0')) { localStorage.setItem('rp_token', 'testtoken1234567890'); sessionStorage.setItem('t0', '1'); } });
	const locked = () => page.evaluate(() => document.body.classList.contains('locked') && !document.getElementById('lock').classList.contains('hidden'));
	const appHidden = () => page.evaluate(() => getComputedStyle(document.getElementById('app')).visibility === 'hidden');
	const cfg = () => page.evaluate(() => JSON.parse(localStorage.getItem('rp_lock') || 'null'));
	const pin = async (v) => { for (const ch of v) await page.click(`#lkPad [data-k="${ch}"]`); await W(450); };
	const fill = async (v) => { await page.fill('.modal:last-of-type input', v); await page.click('.modal:last-of-type [data-ok]'); await W(450); };
	const okBtn = async () => { await page.locator('.modal [data-v="true"]').last().click(); await W(450); };

	await page.goto('http://localhost:8100/panel/?p=more'); await W(1500);
	ok('没开面板锁时不锁', !(await locked()));
	ok('「系统操作」里有面板锁，显示已关闭', /已关闭/.test(await page.textContent('#lockState')));
	// 开启：密码 1234 两次 + 指纹
	await page.click('[data-t="lock"]'); await W(500);
	ok('开启前说明会锁什么', /5 分钟没操作也会自动锁上/.test(await page.textContent('.modal')) && /验证指纹/.test(await page.textContent('.modal')));
	await okBtn();
	await fill('12'); ok('密码少于 4 位不收', /请输入 4–6 位数字/.test(await page.textContent('.modal:last-of-type')));
	await fill('1234'); await fill('1234');
	ok('问要不要也用指纹', /也用指纹解锁/.test(await page.textContent('.modal')));
	await okBtn(); await W(800);
	let c = await cfg();
	ok('保存的是加盐哈希，不是明文密码，并记下了指纹', c && c.on && c.len === 4 && c.salt && c.hash && !JSON.stringify(c).includes('1234') && !!c.cred, JSON.stringify(c));
	ok('状态显示「指纹 + 密码」', /指纹 \+ 密码/.test(await page.textContent('#lockState')));
	ok('刚开启时不会马上锁', !(await locked()));
	// 用着的时候下拉刷新（5 分钟内有操作）：不用重新解锁
	await page.mouse.click(200, 400); await W(200);
	await page.reload(); await W(1500);
	ok('正在用的时候下拉刷新：不用重新解锁', !(await locked()) && (await page.locator('#qGrid .qbtn').count()) === 12);
	// 已经 5 分钟没操作再刷新：要解锁
	await page.evaluate(() => sessionStorage.setItem('rp_lkact', String(Date.now() - 6 * 60e3)));
	await setUV(false);
	await page.reload(); await W(1500);
	ok('超过 5 分钟没操作再刷新：要解锁', await locked());
	await page.reload(); await W(1200);
	ok('锁着的时候下拉刷新：仍然锁着（刷新绕不过去）', await locked());
	// 关掉 App 再打开（新的会话）：要解锁
	const p2 = await ctx.newPage(); await p2.goto('http://localhost:8100/panel/?p=home'); await W(1500);
	ok('关掉 App 再打开：要解锁', await p2.evaluate(() => document.body.classList.contains('locked')));
	await p2.close();
	// 重新打开面板：先锁，再自动弹指纹 → 通过
	ok('重新打开面板：立刻锁上，后面的内容看不到', (await locked()) && (await appHidden()));
	ok('指纹没通过：提示改用密码', /指纹没通过|请输入密码|也可以用指纹解锁/.test(await page.textContent('#lkMsg')), await page.textContent('#lkMsg'));
	ok('点数和密码位数一样（4 个）', (await page.locator('#lkDots i').count()) === 4);
	await pin('1111');
	ok('密码不对：提示还剩几次，仍锁着', (await locked()) && /还能试 4 次/.test(await page.textContent('#lkMsg')), await page.textContent('#lkMsg'));
	for (let i = 0; i < 4; i++) await pin('0000');
	ok('输错 5 次：要等 30 秒，数字键按不了', /秒后再试/.test(await page.textContent('#lkMsg')) && (await page.evaluate(() => document.getElementById('lkPad').classList.contains('dis'))));
	const dbg = await page.evaluate(() => ({ dis: document.getElementById('lkPad').classList.contains('dis'), pe: getComputedStyle(document.querySelector('#lkPad [data-k="1"]')).pointerEvents }));
	await page.evaluate(() => ['1', '2', '3', '4'].forEach((k) => document.querySelector(`#lkPad [data-k="${k}"]`).click())); await W(500);
	ok('等待期间输对也不开', await locked(), JSON.stringify(dbg));
	await page.reload(); await W(1200);
	ok('等待时间重开面板也不会清零', /秒后再试/.test(await page.textContent('#lkMsg')));
	await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('rp_lock')); c.until = Date.now() - 1; localStorage.setItem('rp_lock', JSON.stringify(c)); });
	await page.reload(); await W(1200);
	await pin('1234');
	ok('密码对：解锁，内容出现', !(await locked()) && !(await appHidden()));
	await W(1200);
	ok('解锁后面板正常加载（首页快捷操作、数据都在）', (await page.locator('#qGrid .qbtn').count()) === 12 && (await page.textContent('#pageTitle')).length > 0);
	ok('解锁后清掉错误次数', !(await cfg()).until && !(await cfg()).fails);
	// 指纹解锁（模拟关掉 App 再打开）
	await setUV(true);
	await page.evaluate(() => sessionStorage.removeItem('rp_lkact'));
	await page.reload(); await W(1800);
	ok('指纹通过：自动解锁（不用输密码）', !(await locked()));
	// 5 分钟没操作自动锁
	await setUV(false);
	await page.evaluate(() => { const n = Date.now; Date.now = () => n() + 5.2 * 60e3; document.dispatchEvent(new Event('visibilitychange')); });
	await W(600);
	ok('5 分钟没操作（或切回来已超过 5 分钟）：自动锁上', await locked());
	await setUV(true);
	await page.reload(); await W(1800);
	// 修改 / 关闭要先验证当前密码
	await page.click('[data-t="lock"]'); await W(500);
	await page.click('.modal [data-v="off"]'); await W(450);
	await fill('9999'); await W(300);
	ok('关闭要验证密码：输错不关', (await cfg())?.on === 1);
	await page.click('[data-t="lock"]'); await W(500);
	await page.click('.modal [data-v="pin"]'); await W(450);
	await fill('1234'); await fill('567890'); await fill('567890');
	c = await cfg();
	ok('修改密码：换成 6 位，指纹保留', c.len === 6 && !!c.cred);
	await setUV(false);
	await page.click('[data-t="lock"]'); await W(500);
	await page.click('.modal [data-v="now"]'); await W(800);
	ok('「立即锁定」马上锁', await locked());
	ok('6 位密码显示 6 个点', (await page.locator('#lkDots i').count()) === 6);
	await pin('567890');
	ok('新密码能解锁', !(await locked()));
	// 忘记密码：要点两次，结果是断开这台手机
	await page.click('[data-t="lock"]'); await W(500); await page.click('.modal [data-v="now"]'); await W(500);
	await page.click('#lkForgot'); await W(300);
	ok('忘记密码第一次只提示后果', (await locked()) && /再点一次/.test(await page.textContent('#lkForgot')));
	await page.click('#lkForgot'); await W(800);
	ok('再点一次：断开这台手机，回到输入连接器地址，面板锁清掉', !(await page.evaluate(() => document.getElementById('login').classList.contains('hidden'))) && !(await page.evaluate(() => localStorage.getItem('rp_token'))) && !(await cfg()));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'lock-login.png') });
	// 截图：锁屏（浅色 / 深色）
	for (const dark of [false, true]) {
		const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const p2 = await c2.newPage(); p2.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await p2.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_lock', JSON.stringify({ on: 1, salt: 'x', hash: 'y', len: 4, cred: 'AAAA' })); });
		await p2.goto('http://localhost:8100/panel/?p=home'); await W(1400);
		await p2.click('#lkPad [data-k="1"]'); await p2.click('#lkPad [data-k="2"]'); await W(200);
		const w = await p2.evaluate(() => document.documentElement.scrollWidth);
		if (!dark) ok('锁屏不横向滚动', w <= 390, w);
		await p2.screenshot({ path: path.join(__dirname, 'shots', 'lock' + (dark ? '-dark' : '') + '.png') });
		await c2.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

// 6.0 第 57、58、60 项（面板）：系统操作「帮助改进、尝鲜」两个开关；功能开不了弹小卡片、能「报告这个问题」（内容填好）；
// 检查更新里装尝鲜版、退回正式版；推送「修好了」点进来打开检查更新
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel');
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const S = { on: true, want: false, betaOk: false, calls: [], upd: { cur: '6.0.0', latest: '6.0.0', newer: false, notes: '' } };
function handle(m, p) {
	S.calls.push({ m, p });
	if (m === 'compat_info') return { on: S.on, beta: { want: S.want, ok: S.betaOk, ver: S.betaOk ? '6.0.1' : '', tag: S.betaOk ? 'v6.0.1' : '' }, last: Math.floor(Date.now() / 1000) - 3600 };
	if (m === 'compat_set') { S.on = p.on; return handle('compat_info'); }
	if (m === 'beta_set') { S.want = p.want; return handle('compat_info'); }
	if (m === 'update_check') return S.upd;
	if (m === 'update_start') { S.started = p; return { started: true }; }
	if (m === 'update_status') return { state: 'downloading', msg: '正在下载' };
	if (m === 'sudo_local') throw Object.assign(new Error('这台路由器没有登录服务（rpcd），验证不了后台密码'), { code: -32020 });
	if (m === 'feedback_diag') return { text: '诊断信息', hosted: false };
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); try { return J({ jsonrpc: '2.0', id: body.id, result: handle(body.method.replace(/^panel\//, ''), body.params || {}) }); } catch (e) { return J({ jsonrpc: '2.0', id: body.id, error: { code: e.code || -32000, message: e.message } }); } }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = path.join(__dirname, 'shots');
(async () => {
	await new Promise((r) => server.listen(8173, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 568, false], [390, 844, true], [1280, 800, false]]) {
		const T = `［${w}${dark ? ' 深色' : ''}］`;
		S.on = true; S.want = false; S.betaOk = false; S.calls = []; S.started = null; S.upd = { cur: '6.0.0', latest: '6.0.0', newer: false, notes: '' };
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890abc'); if (matchMedia('(prefers-color-scheme: dark)').matches) localStorage.setItem('rp_dark', '1'); });
		await page.goto('http://localhost:8173/panel/?p=more'); await W(2200);
		ok('系统操作里有「帮助改进、尝鲜」' + T, await page.isVisible('[data-t="compat"]'));
		await page.click('[data-t="compat"]'); await W(800);
		let t = await page.textContent('.modal');
		ok('说清楚报什么、不报什么；默认开着' + T, /匿名/.test(t) && /不报账号、IP、设备、网址、钥匙/.test(t) && await page.isChecked('.modal [data-sw="on"]'));
		ok('尝鲜：说清楚只给自愿报名的、随时能退回' + T, /随时能退回正式版/.test(t) && !(await page.isChecked('.modal [data-sw="beta"]')));
		const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, W: document.documentElement.clientWidth }));
		ok('不横向滚动' + T, ov.sw <= ov.W);
		await page.screenshot({ path: path.join(SHOT, `compat-sheet-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-sw="on"]'); await W(800);
		ok('关掉上报：告诉路由器' + T, S.on === false && S.calls.some((c) => c.m === 'compat_set' && c.p.on === false) && !(await page.isChecked('.modal [data-sw="on"]')));
		await page.click('.modal [data-sw="beta"]'); await W(800);
		ok('报名尝鲜：告诉路由器，写着等开发者挑人' + T, S.want === true && /已经报名/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="close"]'); await W(500);
		// 检查更新：挑中了，有尝鲜版
		S.betaOk = true; S.upd = { cur: '6.0.0', latest: '6.0.0', newer: false, notes: '', beta: { ver: '6.0.1', tag: 'v6.0.1' } };
		await page.click('[data-t="update"]'); await W(1000);
		t = await page.textContent('.modal');
		ok('检查更新：写着可以先装尝鲜版 v6.0.1，有按钮' + T, /尝鲜版/.test(t) && await page.isVisible('.modal [data-ch="beta"]'));
		await page.screenshot({ path: path.join(SHOT, `compat-upd-beta-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-ch="beta"]'); await W(600);
		await page.locator('.modal').last().locator('[data-v="true"]').click(); await W(1200);
		ok('点「装尝鲜版」确认后：告诉路由器装尝鲜版' + T, S.started && S.started.channel === 'beta' && S.started.confirm === 'UPDATE', JSON.stringify(S.started));
		await page.goto('http://localhost:8173/panel/?p=more'); await W(1800);
		// 现在是尝鲜版：能退回正式版
		S.upd = { cur: '6.0.1', latest: '6.0.0', newer: false, notes: '', ahead: true }; S.started = null;
		await page.click('[data-t="update"]'); await W(1000);
		ok('在用尝鲜版：标着「尝鲜版」，能退回正式版' + T, /尝鲜版/.test(await page.textContent('.modal')) && await page.isVisible('.modal [data-ch="stable"]'));
		await page.click('.modal [data-ch="stable"]'); await W(600);
		await page.locator('.modal').last().locator('[data-v="true"]').click(); await W(1200);
		ok('退回正式版：告诉路由器' + T, S.started && S.started.channel === 'stable');
		// 功能开不了
		await page.goto('http://localhost:8173/panel/?p=me'); await W(2000);
		if (await page.locator('#meBox [data-pw]').count()) {
			await page.fill('#meBox [data-pw]', 'x'); await page.click('#meBox [data-pwok]'); await W(1200);
			t = await page.locator('.modal').last().textContent().catch(() => '');
			ok('功能开不了：弹小卡片说原因，有「报告这个问题」' + T, /开不了这个功能/.test(t) && /rpcd/.test(t) && await page.isVisible('.modal [data-rep]'), t.slice(0, 80));
			const toastShown = await page.evaluate(() => { const x = document.getElementById('toast'); return x && x.classList.contains('err') && !x.classList.contains('hidden') && /rpcd/.test(x.textContent); });
			ok('不会再重复弹一个红色提示' + T, !toastShown);
			await page.screenshot({ path: path.join(SHOT, `compat-fail-${w}${dark ? '-dark' : ''}.png`) });
			if (await page.locator('.modal [data-rep]').count()) { await page.click('.modal [data-rep]'); await W(1200); };
			ok('点「报告这个问题」：反馈框里内容已经填好' + T, (await page.locator('.modal [data-tx]').count()) && /功能开不了：这台路由器没有登录服务/.test(await page.inputValue('.modal [data-tx]')));
		} else ok('我的主页有输路由器密码的地方' + T, false);
		await ctx.close();
		// 推送「修好了」点进来
		const c2 = await browser.newContext({ viewport: { width: w, height: h } }); const p2 = await c2.newPage();
		p2.on('pageerror', (e) => problems.push('页面错误2' + T + '：' + e.message));
		S.upd = { cur: '6.0.0', latest: '6.0.1', newer: true, notes: '修好了你遇到的问题', force: false };
		await p2.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890abc'); });
		await p2.goto('http://localhost:8173/panel/?p=home&ask=update'); await W(3000);
		ok('推送「修好了」点进来：打开检查更新，能一键更新' + T, (await p2.locator('.modal[data-upd] [data-go]').count()) === 1);
		await c2.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

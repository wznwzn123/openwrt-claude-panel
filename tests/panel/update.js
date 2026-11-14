// 一键更新：首页提示、以后再说、检查更新、进度（中途面板服务重启）、成功、失败自动退回、必须更新
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const TOK = 'testtoken1234567890abc';
const U = { cur: '1.3.0', latest: '1.3.1', force: false, notes: '• 一键更新\n• 配对码更醒目', seq: [], down: 0, started: 0, startArgs: null };
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, '');
		if (U.down > 0 && m !== 'update_start') { U.down--; req.socket.destroy(); return; }   // 面板服务在重启：连不上
		let result;
		if (m === 'update_check') result = { cur: U.cur, code: 'hosted-ai', latest: U.latest, notes: U.notes, newer: U.cur !== U.latest, force: U.force && U.cur !== U.latest };
		else if (m === 'update_start') { U.started++; U.startArgs = body.params; result = { started: true }; }
		else if (m === 'update_status') { const st = U.seq.shift() || { state: 'idle' }; if (st.down) { U.down = st.down; req.socket.destroy(); return; } if (st.state === 'done') U.cur = U.latest; result = { ...st, cur: U.cur }; }
		else if (m === 'cloud_info') result = { enabled: false };
		else result = respond(m, body.params || {});
		return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8133, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript((t) => { if (!sessionStorage.getItem('i')) { localStorage.setItem('rp_token', t); sessionStorage.setItem('i', '1'); } }, TOK);
	await page.goto('http://localhost:8133/panel/'); await W(6000);
	ok('有新版本：首页顶部出现提示（版本号、现在的版本、更新内容）', await page.isVisible('#rUpd') && /v1\.3\.1/.test(await page.textContent('#rUpd')) && /现在是 v1\.3\.0/.test(await page.textContent('#rUpd')) && /配对码更醒目/.test(await page.textContent('#rUpd')));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'update-01-banner.png') });
	await page.click('#rUpdLater'); await W(200);
	ok('「以后再说」：提示收起', !(await page.isVisible('#rUpd')));
	await page.reload(); await W(6000);
	ok('当天再打开：不再提示', !(await page.isVisible('#rUpd')));
	await page.goto('http://localhost:8133/panel/?p=more'); await W(5500);
	ok('「系统操作 → 检查更新」写着有新版本', /有新版本 v1\.3\.1/.test(await page.textContent('#updState')));
	await page.click('[data-t="update"]'); await W(800);
	ok('检查更新：显示现在的版本、最新版本、更新内容', /v1\.3\.0/.test(await page.textContent('.modal')) && /v1\.3\.1/.test(await page.textContent('.modal')) && /一键更新/.test(await page.textContent('.modal')) && /不会断网/.test(await page.textContent('.modal')));
	// 一键更新：下载 → 安装 → 面板服务重启（连不上两次）→ 完成
	U.seq = [{ state: 'downloading', msg: '正在下载新版安装包' }, { state: 'installing', msg: '正在安装 v1.3.1' }, { down: 2 }, { state: 'done', msg: '已更新到 v1.3.1', to: '1.3.1' }];
	await page.click('.modal [data-go]'); await W(2500);
	ok('点一键更新：路由器开始更新（带确认）', U.started === 1 && U.startArgs?.confirm === 'UPDATE');
	ok('显示进度步骤', (await page.locator('.modal .updsteps li').count()) === 4);
	await page.screenshot({ path: path.join(__dirname, 'shots', 'update-02-progress.png') });
	ok('更新中点背景关不掉', await (async () => { await page.mouse.click(10, 10); await W(400); return page.isVisible('.modal [data-steps]'); })());
	let sawRestart = false;
	for (let i = 0; i < 20 && !(await page.isVisible('.modal [data-end]:not(.hidden)')); i++) { if (/面板服务正在重启/.test(await page.textContent('.modal').catch(() => ''))) sawRestart = true; await W(600); }
	ok('面板服务重启时：显示「马上回来」，不报错', sawRestart);
	ok('更新完成：显示已更新到 v1.3.1', /已更新到 v1\.3\.1/.test(await page.textContent('.modal')) && await page.isVisible('.modal [data-done]'));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'update-03-done.png') });
	await page.click('.modal [data-done]'); await W(5000);
	ok('点「完成」刷新面板：已经是最新版，没有提示', !(await page.isVisible('#rUpd')));
	// 失败：自动退回
	U.cur = '1.3.0'; U.latest = '1.3.2';
	await page.goto('http://localhost:8133/panel/?p=more'); await W(2500);
	U.seq = [{ state: 'downloading', msg: '下载中' }, { state: 'rollback', msg: '新版没能正常启动，正在退回 v1.3.0' }, { state: 'rolledback', msg: '更新没成功，已经退回 v1.3.0，一切照旧。原因：xxx' }];
	await page.click('[data-t="update"]'); await W(800); await page.click('.modal [data-go]'); await W(8000);
	ok('更新失败：说明已经自动退回旧版本', /已经退回 v1\.3\.0/.test(await page.textContent('.modal')));
	await page.click('.modal [data-done]'); await W(500);
	// 必须更新
	U.force = true; U.latest = '1.4.0'; U.cur = '1.3.0';
	await page.evaluate(() => localStorage.removeItem('rp_upd_later'));
	await page.goto('http://localhost:8133/panel/'); await W(6500);
	ok('必须更新：自动弹窗，没有「以后再说」和「关闭」', (await page.locator('.modal[data-upd]').count()) === 1 && !/以后再说|关闭/.test(await page.textContent('.modal[data-upd]')) && /必须更新/.test(await page.textContent('.modal[data-upd]')));
	await page.mouse.click(10, 10); await W(500);
	ok('必须更新：点背景关不掉', (await page.locator('.modal[data-upd]').count()) === 1);
	ok('必须更新：首页提示也没有「以后再说」', !(await page.isVisible('#rUpdLater')));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'update-04-force.png') });
	// 已经是最新版
	U.force = false; U.latest = U.cur = '1.4.0';
	await page.goto('http://localhost:8133/panel/?p=more'); await W(2500);
	await page.click('[data-t="update"]'); await W(800);
	ok('已经是最新版：检查更新说明是最新', /已经是最新版/.test(await page.textContent('.modal')) && !(await page.isVisible('.modal [data-go]')));
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

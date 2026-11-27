// 一键更新：首页提示、以后再说、检查更新、进度（中途面板服务重启）、成功、失败自动退回、必须更新
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const TOK = 'testtoken1234567890abc';
const U = { cur: '1.3.0', latest: '1.3.1', force: false, notes: '• 一键更新\n• 配对码更醒目', seq: [], down: 0, started: 0, startArgs: null, auto: true, auSets: [], seen: '' };
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, '');
		if (U.down > 0 && m !== 'update_start') { U.down--; req.socket.destroy(); return; }   // 面板服务在重启：连不上
		let result;
		if (m === 'update_check') result = { cur: U.cur, code: 'hosted-ai', latest: U.latest, notes: U.notes, newer: U.cur !== U.latest, hot: U.hot || 0, force: U.force && U.cur !== U.latest, auto: U.auto, seen: U.seen };
		else if (m === 'notices_seen') { if (body.params && body.params.upd) U.seen = body.params.upd; result = { ok: true }; }
		else if (m === 'autoupd_set') { U.auSets.push(body.params); U.auto = body.params.on !== false; result = { auto: U.auto }; }
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
	await new Promise((r) => server.listen(8183, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript((t) => { if (!sessionStorage.getItem('i')) { localStorage.setItem('rp_token', t); sessionStorage.setItem('i', '1'); } }, TOK);
	await page.goto('http://localhost:8183/panel/'); await W(6000);
	// 6.0 第 85 项：普通新版本每个版本弹一次居中小卡片，弹过记在路由器上
	const pop = () => page.locator('.modal[data-upd]');
	ok('普通新版本：打开面板弹一次小卡片（新版本号、现在的版本、更新内容、以后再说、一键更新）', (await pop().count()) === 1 && /路由器有新版本/.test(await pop().textContent()) && /v1\.3\.1/.test(await pop().textContent()) && /v1\.3\.0/.test(await pop().textContent()) && /配对码更醒目/.test(await pop().textContent()) && /以后再说/.test(await pop().textContent()) && (await pop().locator('[data-go]').count()) === 1);
	ok('弹过就记在路由器上（这个版本以后不再弹）', U.seen === '1.3.1', U.seen);
	await page.screenshot({ path: path.join(__dirname, 'shots', 'update-01-pop.png') });
	await page.click('.modal[data-upd] .cfoot [data-v="close"]'); await W(300);
	ok('点卡片里的「以后再说」：卡片关掉，首页横幅也收起', (await pop().count()) === 0 && !(await page.isVisible('#rUpd')));
	await page.reload(); await W(6000);
	ok('再打开：同一个版本不再弹，首页也没有横幅', (await pop().count()) === 0 && !(await page.isVisible('#rUpd')));
	{ const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p2 = await c2.newPage();
		await p2.addInitScript((t) => localStorage.setItem('rp_token', t), TOK); await p2.goto('http://localhost:8183/panel/'); await W(6000);
		ok('换手机（或清了缓存）：路由器记着，同一个版本也不再弹', (await p2.locator('.modal[data-upd]').count()) === 0 && !(await p2.isVisible('#rUpd')));
		await c2.close(); }
	await page.goto('http://localhost:8183/panel/?p=more'); await W(5500);
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
	await page.goto('http://localhost:8183/panel/?p=more'); await W(6000);
	U.seq = [{ state: 'downloading', msg: '下载中' }, { state: 'rollback', msg: '新版没能正常启动，正在退回 v1.3.0' }, { state: 'rolledback', msg: '更新没成功，已经退回 v1.3.0，一切照旧。原因：xxx' }];
	ok('发了更新的版本（v1.3.2）：又弹一次', (await pop().count()) === 1 && /v1\.3\.2/.test(await pop().textContent()) && U.seen === '1.3.2', U.seen);
	await page.click('.modal [data-go]'); await W(8000);
	ok('更新失败：说明已经自动退回旧版本', /已经退回 v1\.3\.0/.test(await page.textContent('.modal')));
	await page.click('.modal [data-done]'); await W(500);
	// 必须更新
	U.force = true; U.latest = '1.4.0'; U.cur = '1.3.0';
	U.seen = '1.4.0'; // 就算这个版本「弹过」，必须更新照样每次拦着
	await page.goto('http://localhost:8183/panel/'); await W(6500);
	ok('必须更新：自动弹窗（弹过也照样弹），没有「以后再说」和「关闭」', (await page.locator('.modal[data-upd]').count()) === 1 && !/以后再说|关闭/.test(await page.textContent('.modal[data-upd]')) && /必须更新/.test(await page.textContent('.modal[data-upd]')));
	await page.mouse.click(10, 10); await W(500);
	ok('必须更新：点背景关不掉', (await page.locator('.modal[data-upd]').count()) === 1);
	ok('必须更新：首页提示也没有「以后再说」', !(await page.isVisible('#rUpdLater')));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'update-04-force.png') });
	// 已经是最新版
	U.force = false; U.latest = U.cur = '1.4.0';
	await page.goto('http://localhost:8183/panel/?p=more'); await W(2500);
	await page.click('[data-t="update"]'); await W(800);
	ok('已经是最新版：检查更新说明是最新', /已经是最新(版|的正式版)/.test(await page.textContent('.modal')) && !(await page.isVisible('.modal [data-go]')));
	// 用户 11/27：装过热补丁的在版本后面写「V编号」
	{
		U.hot = 1;
		const p2 = await ctx.newPage(); await p2.goto(page.url()); await W(2500);
		ok('装过热补丁：版本后面写「V1」', /^v[0-9.]+ V1 · 已经是最新版$/.test(await p2.textContent('#updState')), await p2.textContent('#updState'));
		await p2.close(); U.hot = 0;
	}
	// 6.0 第 86 项：必须更新夜里自动装（默认开，关掉要确认）
	ok('检查更新里有「必须更新自动装」开关，默认开', /必须更新自动装/.test(await page.textContent('.modal')) && await page.isChecked('.modal [data-au]'));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'update-05-auto.png') });
	await page.click('.modal label.sw'); await W(500);
	ok('关掉时先问一句（说清楚安全修复要等自己点）', (await page.locator('.modal').count()) === 2 && /要等你打开面板/.test(await page.locator('.modal').last().textContent()));
	await page.locator('.modal').last().locator('[data-v="false"]').click(); await W(400);
	ok('取消：开关还是开着，没有改路由器', await page.isChecked('.modal [data-au]') && U.auSets.length === 0);
	await page.click('.modal label.sw'); await W(500);
	await page.locator('.modal').last().locator('[data-v="true"]').click(); await W(800);
	ok('确认关掉：路由器收到关掉，开关变成关', U.auSets.length === 1 && U.auSets[0].on === false && !(await page.isChecked('.modal [data-au]')) && U.auto === false);
	await page.click('.modal label.sw'); await W(800);
	ok('重新打开：不用确认，直接打开', U.auSets.length === 2 && U.auSets[1].on === true && await page.isChecked('.modal [data-au]') && (await page.locator('.modal').count()) === 1);
	// 布局：手机常见宽度、深浅色都不横向滚动、开关不被挤出卡片
	for (const dark of [false, true]) for (const w of [320, 390, 430]) {
		const c2 = await browser.newContext({ viewport: { width: w, height: 760 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const p2 = await c2.newPage(); p2.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await p2.addInitScript((t) => { localStorage.setItem('rp_token', t); localStorage.setItem('rp_theme', 'auto'); }, TOK);
		await p2.goto('http://localhost:8183/panel/?p=more'); await W(3500);
		await p2.click('[data-t="update"]'); await W(900);
		const g = await p2.evaluate(() => { const m = document.querySelector('.modal'), s = document.querySelector('.modal label.sw'); const mr = m.getBoundingClientRect(), sr = s.getBoundingClientRect(); return { over: document.documentElement.scrollWidth > document.documentElement.clientWidth || m.scrollWidth > m.clientWidth + 1, inside: sr.right <= mr.right + 1 && sr.left >= mr.left - 1 }; });
		ok(`布局 ${w} 宽${dark ? '（深色）' : ''}：不横向滚动，开关在卡片里`, !g.over && g.inside, JSON.stringify(g));
		await p2.screenshot({ path: path.join(__dirname, 'shots', `update-06-auto-${w}${dark ? '-dark' : ''}.png`) });
		await c2.close();
	}
	// 6.0 第 85 项：新版本小卡片的布局（居中、四周留空、高度不超过屏幕 70%、按钮看得到、不横向滚动）
	U.cur = '1.4.0'; U.latest = '1.5.0'; U.force = false; U.notes = Array.from({ length: 14 }, (_, i) => '• 第 ' + (i + 1) + ' 条：这是一段比较长的更新说明，用来看看小屏手机上会不会把卡片撑满整个屏幕').join('\n');
	for (const dark of [false, true]) for (const w of [320, 390, 430]) {
		U.seen = '';
		const c3 = await browser.newContext({ viewport: { width: w, height: 760 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const p3 = await c3.newPage(); p3.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await p3.addInitScript((t) => localStorage.setItem('rp_token', t), TOK);
		await p3.goto('http://localhost:8183/panel/'); await W(6500);
		const g = await p3.evaluate(() => { const o = document.querySelector('.modal[data-upd]'); if (!o) return null; const m = o.querySelector('.modalbox'), r = m.getBoundingClientRect(), b = m.querySelector('[data-go]').getBoundingClientRect(); return { compact: o.classList.contains('compact'), h: r.height / innerHeight, l: r.left, r: innerWidth - r.right, t: r.top, btn: b.bottom <= innerHeight && b.top >= 0, over: document.documentElement.scrollWidth > innerWidth }; });
		ok(`新版本卡片 ${w} 宽${dark ? '（深色）' : ''}：居中、四周留空、高度不超过 70%、按钮看得到、不横向滚动`, g && g.compact && g.h <= 0.7 && g.l >= 8 && g.r >= 8 && g.t >= 8 && g.btn && !g.over, JSON.stringify(g));
		await p3.screenshot({ path: path.join(__dirname, 'shots', `update-07-pop-${w}${dark ? '-dark' : ''}.png`) });
		await c3.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

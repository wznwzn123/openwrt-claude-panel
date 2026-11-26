// 5.3.0 尝鲜：「系统操作 → 尝鲜」申请（自建版要邮箱）、撤回、通过后在「检查更新」里装尝鲜版；截图 320 / 390 / 430、深色
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const TOK = 'testtoken1234567890abc';
const S = { hosted: false, linked: false, st: 'none', ver: '', calls: [], started: null };
const bst = () => ({ want: S.st !== 'none', st: S.st, ok: S.st === 'ok', ver: S.ver, tag: S.ver ? 'v' + S.ver : '', why: '', at: 1, note: '', hosted: S.hosted });
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), p = body.params || {};
		let result, error;
		if (m === 'update_check') result = { cur: '5.3.0', code: 'ai-lite', latest: '5.3.0', notes: '', newer: false, force: false, betast: bst(), ...(S.st === 'ok' && S.ver ? { beta: { ver: S.ver, tag: 'v' + S.ver } } : {}) };
		else if (m === 'beta_info') { S.calls.push(['info', p]); result = { beta: bst() }; }
		else if (m === 'beta_who') result = S.hosted ? { mail: 'ow***@x.com', login: false, hosted: true, hub: 'https://hub.test' } : S.linked ? { mail: 'm*@x.com', login: false, hosted: false, hub: 'https://hub.test' } : { mail: '', login: true, hosted: false, hub: 'https://hub.test', lk: 'abcdefghijkmnpqrstuvwxyz' };
		else if (m === 'beta_set') { S.calls.push(['set', p]); S.st = p.want ? 'wait' : 'none'; result = { beta: bst() }; }
		else if (m === 'update_start') { S.started = p; result = { started: true }; }
		else if (m === 'update_status') result = { state: 'downloading', msg: '正在下载新版安装包', cur: '5.3.0' };
		else if (m === 'cloud_info') result = { enabled: false };
		else result = respond(m, p);
		return res.end(JSON.stringify(error ? { jsonrpc: '2.0', id: body.id, error } : { jsonrpc: '2.0', id: body.id, result })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
// 弹窗里没有横向溢出、按钮文字没被截断
const fits = (page) => page.evaluate(() => { const m = document.querySelector('.modal .modalbox'); if (!m) return 'no modal'; if (m.scrollWidth > m.clientWidth + 1) return 'modal overflow ' + m.scrollWidth + '>' + m.clientWidth;
	for (const b of m.querySelectorAll('button')) if (b.scrollWidth > b.clientWidth + 1) return 'button cut: ' + b.textContent; return document.documentElement.scrollWidth > innerWidth + 1 ? 'page overflow' : ''; });
(async () => {
	await new Promise((r) => server.listen(8186, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript((t) => { localStorage.setItem('rp_token', t); }, TOK);
	await page.goto('http://localhost:8186/panel/?p=more'); await W(5500);
	ok('「系统操作」里有「尝鲜」', await page.isVisible('[data-t="beta"]') && (await page.textContent('#betaState')) === '先试新版本', await page.textContent('#betaState').catch(() => ''));
	await page.click('[data-t="beta"]'); await W(800);
	ok('打开「尝鲜」：问一次官网（refresh）', S.calls.some((c) => c[0] === 'info' && c[1].refresh === true));
	ok('没申请：按钮是「申请」', (await page.textContent('.modal [data-bt]')).trim() === '申请');
	await page.click('.modal [data-bt]'); await W(600);
	const txt = await page.textContent('.modal:last-of-type');
	ok('申请框：只写上报什么和怎么通知', /仅上报型号、系统、版本、闪存、内存和当前留言内容。审核通过后将以邮件的形式通知您。/.test(txt), txt.slice(0, 120));
	ok('自建版没关联：邮箱不能填 显示「登录官网账号」 申请灰着 留言写（选填）', (await page.isDisabled('#btMail')) && (await page.isVisible('.modal [data-login]')) && (await page.isDisabled('.modal [data-go]')) && /留言（选填）/.test(txt));
	ok('申请框按钮不截断', (await fits(page)) === '', await fits(page));
	await page.screenshot({ path: path.join(SHOTS, 'beta-01-apply-390.png') });
	await ctx.route('https://hub.test/**', (rt) => rt.fulfill({ body: 'ok' }));
	const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), page.click('.modal [data-login]')]);
	if (pop) await pop.waitForLoadState().catch(() => {});
	ok('点「登录官网账号」：打开官网 带着关联码', pop && pop.url() === 'https://hub.test/app?bl=abcdefghijkmnpqrstuvwxyz', pop && pop.url());
	if (pop) await pop.close();
	S.linked = true; await W(4600);
	ok('关联好回来：自动填上打码的邮箱 申请能点', (await page.inputValue('#btMail')) === 'm*@x.com' && !(await page.isVisible('.modal [data-login]')) && !(await page.isDisabled('.modal [data-go]')));
	await page.screenshot({ path: path.join(SHOTS, 'beta-01b-linked-390.png') });
	await page.fill('#btNote', '闪存只有 16 MB');
	await page.click('.modal [data-go]'); await W(1200);
	const set = S.calls.find((c) => c[0] === 'set');
	ok('申请：交给路由器（留言 不带邮箱）', set && set[1].want === true && set[1].email === undefined && set[1].note === '闪存只有 16 MB', JSON.stringify(set));
	ok('申请后：状态等审核 按钮变「撤回」 列表那一行也变', /等审核/.test(await page.textContent('.modal [data-body]')) && (await page.textContent('.modal [data-bt]')).trim() === '撤回' && (await page.textContent('#betaState')) === '等审核');
	ok('toast：已申请', /已申请/.test(await page.textContent('#toast')));
	await page.screenshot({ path: path.join(SHOTS, 'beta-02-wait-390.png') });
	await page.click('.modal [data-bt]'); await W(600);
	ok('撤回要确认：标题「撤回申请」', /撤回申请/.test(await page.textContent('.modal:last-of-type h3')));
	await page.click('.modal:last-of-type [data-v="true"]'); await W(1000);
	ok('撤回：状态回到没申请', S.st === 'none' && (await page.textContent('.modal [data-bt]')).trim() === '申请' && /已撤回申请/.test(await page.textContent('#toast')));
	// 通过了：检查更新里能装尝鲜版
	S.st = 'ok'; S.ver = '6.0.0';
	await page.goto('http://localhost:8186/panel/?p=more'); await W(5500);
	ok('通过后：「尝鲜」写着已通过 v6.0.0 可以装', /已通过：v6\.0\.0/.test(await page.textContent('#betaState')), await page.textContent('#betaState'));
	ok('通过后：「检查更新」写着尝鲜版可以装', /尝鲜版 v6\.0\.0 可以装了/.test(await page.textContent('#updState')), await page.textContent('#updState'));
	await page.click('[data-t="update"]'); await W(900);
	const ut = await page.textContent('.modal');
	ok('检查更新：说明是尝鲜用户 有「装尝鲜版 v6.0.0」按钮', /你是尝鲜用户：可以先装 v6\.0\.0/.test(ut) && (await page.textContent('.modal [data-beta]')).trim() === '装尝鲜版 v6.0.0' && !/已经是最新版了/.test(ut), ut.slice(0, 200));
	ok('检查更新弹窗不截断', (await fits(page)) === '', await fits(page));
	await page.screenshot({ path: path.join(SHOTS, 'beta-03-update-390.png') });
	await page.click('.modal [data-beta]'); await W(700);
	ok('装尝鲜版要确认：正文写版本和后果', /装尝鲜版/.test(await page.textContent('.modal:last-of-type h3')) && /v6\.0\.0（尝鲜版）/.test(await page.textContent('.modal:last-of-type')) && /不会断网/.test(await page.textContent('.modal:last-of-type')));
	await page.click('.modal:last-of-type [data-v="true"]'); await W(1500);
	ok('确认后：路由器开始装尝鲜版（channel beta）', S.started && S.started.channel === 'beta' && S.started.confirm === 'UPDATE', JSON.stringify(S.started));
	// 截图：320 / 430、深色
	for (const [w, dark] of [[320, false], [430, false], [390, true]]) {
		const c2 = await browser.newContext({ viewport: { width: w, height: 760 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const p2 = await c2.newPage(); p2.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await p2.addInitScript((a) => { localStorage.setItem('rp_token', a[0]); if (a[1]) localStorage.setItem('rp_dark', '1'); }, [TOK, dark]);
		S.st = 'none'; S.ver = ''; S.hosted = w === 430;
		await p2.goto('http://localhost:8186/panel/?p=more'); await W(5000);
		await p2.click('[data-t="beta"]'); await W(700); await p2.click('.modal [data-bt]'); await W(600);
		ok(w + (dark ? ' 深色' : '') + '：申请框不溢出', (await fits(p2)) === '', await fits(p2));
		await p2.screenshot({ path: path.join(SHOTS, `beta-apply-${w}${dark ? '-dark' : ''}.png`) });
		S.st = 'ok'; S.ver = '6.0.0';
		await p2.goto('http://localhost:8186/panel/?p=more'); await W(5000);
		await p2.click('[data-t="update"]'); await W(800);
		ok(w + (dark ? ' 深色' : '') + '：检查更新不溢出', (await fits(p2)) === '', await fits(p2));
		await p2.screenshot({ path: path.join(SHOTS, `beta-update-${w}${dark ? '-dark' : ''}.png`) });
		await c2.close();
	}
	// 子账号看不到「尝鲜」
	const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const p3 = await c3.newPage();
	await p3.addInitScript((t) => { localStorage.setItem('rp_token', t); localStorage.setItem('rp_role', JSON.stringify({ role: 'sub', perms: ['sys'] })); }, TOK);
	await p3.goto('http://localhost:8186/panel/?p=more'); await W(5000);
	ok('子账号：没有「尝鲜」这一行', !(await p3.isVisible('[data-t="beta"]')));
	await browser.close(); server.close();
	for (const [n, p, note] of results) console.log((p ? '✓ ' : '✗ ') + n + (p || !note ? '' : '  ' + note));
	for (const x of problems.filter((x) => /^页面错误/.test(x))) console.log('✗ ' + x);
	const bad = results.filter((x) => !x[1]).length + problems.filter((x) => /^页面错误/.test(x)).length;
	console.log(bad ? `失败 ${bad}/${results.length}` : `通过 ${results.length}/${results.length}`);
	process.exit(bad ? 1 : 0);
})();

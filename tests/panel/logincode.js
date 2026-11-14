// 托管版登录码：新手机要输登录码；输对后能用；#code= 自动填；已登录的手机；Claude 连接器地址；退出登录
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const TOK = 'tok1234567890abcdefgh';
let hosted = true, ai = true;
const DEVS = { old00001: { s: 'x'.repeat(32), name: 'iPhone · Safari', at: 1761900000, via: '账号 al***@x.com' } };
const calls = []; let n = 0;
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const tok = decodeURIComponent(u.pathname.split('/').pop()); const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''); calls.push({ m, dev: body.dev, t: Date.now() });
		if (tok !== TOK) { res.writeHead(404); return res.end('{"error":"not found"}'); }
		const dm = /^([a-z0-9]{8})\.([a-z0-9]{32})$/.exec(body.dev || ''), me = dm && DEVS[dm[1]] && DEVS[dm[1]].s === dm[2] ? dm[1] : null;
		const R = (result) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })), E = (code, message, data) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code, message, data } }));
		if (hosted && m !== 'device_approve' && !me) return E(-32010, '这台手机还没登录', { need_code: true, hub: 'https://hub.example' });
		if (m === 'device_approve') {
			if (body.params.code !== 'ABCD2345') return E(-32000, '登录码不对或已过期（10 分钟有效）');
			const id = 'new' + String(++n).padStart(5, '0'), s = 'y'.repeat(32); DEVS[id] = { s, name: body.params.name, at: Date.now() / 1000 | 0, via: '账号 al***@x.com' }; return R({ dev: id + '.' + s, id });
		}
		if (m === 'device_list') return R({ hosted, list: Object.entries(DEVS).map(([id, d]) => ({ id, name: d.name, at: d.at, via: d.via, seen: null, me: id === me })) });
		if (m === 'device_remove') { const id = body.params.self ? me : body.params.all_others ? null : body.params.id; if (body.params.all_others) { for (const k of Object.keys(DEVS)) if (k !== me) delete DEVS[k]; } else delete DEVS[id]; return R({ ok: true }); }
		if (m === 'ckey_info') return R(ai ? { ai: true, url: 'https://r.example.com/cgi-bin/mcp/' + 'c'.repeat(40), hosted } : { ai: false });
		if (m === 'cloud_info') return R({ enabled: false });
		return R(respond(m, body.params || {})); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const vis = (page, sel) => page.isVisible(sel);
(async () => {
	await new Promise((r) => server.listen(8143, r));
	const browser = await chromium.launch();
	const mk = async (scheme) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: scheme || 'light', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 EdgA/130.0' }); const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message)); page.on('dialog', (d) => d.accept()); return page; };
	let page = await mk();
	// 1. 新手机：有登录地址，没输过登录码
	await page.goto('http://localhost:8143/panel/'); await page.evaluate((t) => localStorage.setItem('rp_token', t), TOK);
	await page.goto('http://localhost:8143/panel/?p=home'); await W(1800);
	ok('托管版新手机：弹出「输入登录码」', await vis(page, '#needcode'));
	ok('说明从官网哪里拿登录码，链接到托管服务的账号页', /获取登录码/.test(await page.textContent('#needcode')) && (await page.getAttribute('#lcHub', 'href')) === 'https://hub.example/app' && (await page.textContent('#lcHubName')) === 'hub.example');
	ok('提到应急办法 cmcp-logincode，并说明是路由器后台终端', /cmcp-logincode/.test(await page.textContent('#needcode')) && /不是这个面板里的终端/.test(await page.textContent('#needcode')));
	ok('没登录前路由器什么数据都没给（只有「还没登录」的回答）', !calls.some((c) => c.m !== 'device_approve' && c.dev));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'lc-01-need.png') });
	await page.fill('#lcInput', '123'); await page.click('#lcBtn'); await W(300);
	ok('位数不对：提示 8 位', /8 位/.test(await page.textContent('#lcErr')));
	await page.fill('#lcInput', 'ZZZZ9999'); await page.click('#lcBtn'); await W(600);
	ok('登录码不对：显示原因，还停在输码页', /不对或已过期/.test(await page.textContent('#lcErr')) && await vis(page, '#needcode'));
	calls.length = 0;
	await page.fill('#lcInput', 'abcd 2345'); await page.click('#lcBtn'); await W(2600);
	const ap = calls.find((c) => c.m === 'device_approve'), after = calls.filter((c) => c.m !== 'device_approve' && c.t > ap.t + 300);
	ok('输对（小写、带空格也行）：登录成功，进入面板', !(await vis(page, '#needcode')) && await vis(page, '#app'));
	ok('自动带上手机名字（安卓 · Edge）', DEVS.new00001 && DEVS.new00001.name === '安卓手机 Pixel 8 · Edge', DEVS.new00001 && DEVS.new00001.name);
	ok('手机钥匙存在这台手机上，之后每个请求都带着', /^new00001\./.test(await page.evaluate(() => localStorage.getItem('rp_dev'))) && after.length > 0 && after.every((c) => /^new00001\./.test(c.dev || '')));
	ok('首页正常加载', !/连不上/.test(await page.textContent('#hHead')));
	await page.reload(); await W(1500);
	ok('刷新后不用再输', !(await vis(page, '#needcode')));
	// 2. 系统操作：已登录的手机、Claude 连接器地址
	await page.goto('http://localhost:8143/panel/?p=more'); await W(1500);
	ok('「系统操作」有「已登录的手机」和「Claude 连接器地址」', await vis(page, '#devsBtn') && await vis(page, '#ckeyBtn'));
	await page.click('#devsBtn'); await W(800);
	let t = await page.textContent('.modal');
	ok('已登录的手机：列出两台，标出「这台」，这台没有移除按钮', /iPhone · Safari/.test(t) && /安卓手机 Pixel 8 · Edge/.test(t) && /这台/.test(t) && (await page.$$('.modal [data-rm]')).length === 1);
	await page.screenshot({ path: path.join(__dirname, 'shots', 'lc-02-devs.png') });
	await page.click('.modal [data-rm]'); await W(400); await page.locator('.modal').last().locator('button:has-text("移除")').click(); await W(900);
	ok('移除别的手机', !DEVS.old00001 && (await page.$$('.modal [data-rm]')).length === 0);
	await page.click('.modal button:has-text("关闭")'); await W(400);
	await page.click('#ckeyBtn'); await W(800);
	t = await page.textContent('.modal');
	ok('Claude 连接器地址：先打码，说明打不开面板，提醒旧连接器要换', (await page.getAttribute('.modal .keybox', 'class')).includes('blur') && /打不开面板/.test(t) && /重新添加/.test(t) && t.includes('c'.repeat(40)));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'lc-03-ckey.png') });
	await page.click('.modal button:has-text("完成")'); await W(400);
	// 3. 退出登录（侧边栏底部）
	await page.goto('http://localhost:8143/panel/?p=home'); await W(1500);
	await page.click('#menuBtn'); await W(500);
	ok('侧边栏底部有「退出登录」', await vis(page, '#sideOut'));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'lc-04-side.png') });
	await page.click('#sideOut'); await W(400);
	ok('退出前先确认，说明要重新输登录码', /重新输登录码/.test(await page.textContent('.modal')));
	calls.length = 0;
	await page.locator('.modal').last().locator('button:has-text("退出登录")').click(); await W(900);
	ok('退出：路由器忘掉这台手机、手机上的密钥清掉、回到登录页', calls.some((c) => c.m === 'device_remove') && !DEVS.new00001 && (await page.evaluate(() => JSON.stringify([localStorage.getItem('rp_token'), localStorage.getItem('rp_dev')]))) === '[null,null]' && await vis(page, '#login') && !(await vis(page, '#needcode')));
	// 4. 粘贴登录地址 → 要输登录码；官网「打开面板」带 #code= 自动填好
	await page.fill('#lgInput', 'https://r.example.com/cgi-bin/mcp/' + TOK); await page.click('#lgBtn'); await W(1500);
	ok('粘贴登录地址后：接着要输登录码（密钥已存好）', await vis(page, '#needcode') && (await page.evaluate(() => localStorage.getItem('rp_token'))) === TOK);
	await page.click('#lcOut'); await W(400);
	ok('「换一个登录地址」：回到粘贴页', await vis(page, '#login') && !(await vis(page, '#needcode')));
	await page.evaluate((t) => localStorage.setItem('rp_token', t), TOK);
	await page.goto('about:blank'); await page.goto('http://localhost:8143/panel/#code=ABCD2345'); await W(2800);
	ok('官网点「打开面板」（#code=）：自动填好、自动登录', !(await vis(page, '#needcode')) && /^new/.test(await page.evaluate(() => localStorage.getItem('rp_dev') || '')) && !(await page.evaluate(() => location.hash)));
	// 5. 自建版：不用登录码；纯面板版没有连接器地址
	hosted = false; ai = false;
	const p2 = await mk('dark');
	await p2.goto('http://localhost:8143/panel/'); await p2.evaluate((t) => localStorage.setItem('rp_token', t), TOK);
	await p2.goto('http://localhost:8143/panel/?p=more'); await W(1800);
	ok('自建版：不弹登录码；没有「已登录的手机」；纯面板版没有「Claude 连接器地址」', !(await vis(p2, '#needcode')) && !(await vis(p2, '#devsBtn')) && !(await vis(p2, '#ckeyBtn')));
	ok('「退出登录」也在系统操作里', /退出登录/.test(await p2.textContent('[data-t="logout"]')));
	// 6. 托管版刚装好：终端给的链接带着配对码（#login=密钥&pair=配对码）
	hosted = true;
	const p4 = await mk();
	await p4.goto('http://localhost:8143/panel/#login=' + TOK + '&pair=PQRS2345'); await W(1800);
	ok('[配对] 打开带配对码的链接：密钥存好、地址栏去掉密钥', (await p4.evaluate(() => localStorage.getItem('rp_token'))) === TOK && !(await p4.evaluate(() => location.hash)));
	ok('[配对] 输登录码页先显示「绑定官网账号」，按钮带着配对码去官网', await vis(p4, '#lcPair') && !(await vis(p4, '#lcSteps')) && (await p4.getAttribute('#lcPairBtn', 'href')) === 'https://hub.example/app?pair=PQRS2345');
	await p4.screenshot({ path: path.join(__dirname, 'shots', 'lc-06-pair.png') });
	await p4.goto('about:blank'); await p4.goto('http://localhost:8143/panel/#code=ABCD2345'); await W(2800);
	ok('[配对] 官网绑定好点「打开面板」：自动登录，配对码清掉', !(await vis(p4, '#needcode')) && (await p4.evaluate(() => localStorage.getItem('rp_pair'))) === null);
	const p5 = await mk();
	await p5.goto('http://localhost:8143/panel/'); await p5.evaluate((t) => { localStorage.setItem('rp_token', t); localStorage.setItem('rp_pair', JSON.stringify({ code: 'PQRS2345', exp: Date.now() - 1000 })); }, TOK);
	await p5.goto('http://localhost:8143/panel/?p=home'); await W(1800);
	ok('[配对] 配对码过期了（超过 10 分钟）：不再显示绑定按钮，照常说怎么拿登录码', await vis(p5, '#needcode') && !(await vis(p5, '#lcPair')) && await vis(p5, '#lcSteps'));
	await p5.goto('http://localhost:8143/panel/#login=' + TOK); await W(1500);
	ok('[配对] 普通的 #login= 链接（添加新手机扫码）照样能用', (await p5.evaluate(() => localStorage.getItem('rp_token'))) === TOK);
	// 深色输码页截图
	hosted = true;
	const p3 = await mk('dark'); await p3.goto('http://localhost:8143/panel/'); await p3.evaluate((t) => localStorage.setItem('rp_token', t), TOK);
	await p3.goto('http://localhost:8143/panel/?p=home'); await W(1800); await p3.screenshot({ path: path.join(__dirname, 'shots', 'lc-05-need-dark.png') });
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

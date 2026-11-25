// 6.0 第 82 项（面板这边）：家里局域网直接打开面板（http://路由器地址:906）
// 没登录过：显示「在家里打开面板」输路由器后台密码；从原版后台点进来带 #lopen=票，不用输；
// 「我的主页」显示局域网地址，点一下复制；外网打开还是原来的登录页
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const TK = 'abcdefghijkmnpqrstuvwxyz';
const calls = []; let HOSTED = false;
const handler = (req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) {
		const ep = decodeURIComponent(u.pathname.split('/').pop()), body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, '');
		calls.push({ ep, m, p: body.params, ct: req.headers['content-type'] });
		const R = (result) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })), E = (code, message) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code, message } }));
		if (ep === 'lan') {
			if (m === 'lan_pw') return body.params.pw === 'rootpw' ? R({ dev: 'lan00001.' + 'v'.repeat(32), id: 'lan00001', name: body.params.name }) : E(-32000, '密码不对（还能再试 4 次）');
			if (m === 'lan_open') return body.params.ticket === TK ? R({ dev: 'lan00002.' + 'w'.repeat(32), id: 'lan00002', name: body.params.name }) : E(-32000, '这个链接过期了：回到原版后台再点一次「路由器面板」');
			return E(-32601, 'not found');
		}
		if (ep !== 'pass') { res.writeHead(404); return res.end('{}'); }
		if (m === 'whoami') return R({ hosted: HOSTED, hub: HOSTED ? 'https://hub.example.com' : null, ai: true, role: 'owner', perms: [], uid: null, emerg: true, lanin: true, dev: 'lan00001', lock: { on: false }, lan: { ip: '192.168.6.1', port: 906, url: 'http://192.168.6.1:906/panel/' } });
		if (m === 'cloud_info') return R({ enabled: false });
		return res.end(JSON.stringify(require('./mock').reply(body.id, m, body.params || {})));
	}
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(403); return res.end('{}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); };
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
(async () => {
	const s1 = http.createServer(handler), s2 = http.createServer(handler);
	await new Promise((r) => s1.listen(9906, r)); await new Promise((r) => s2.listen(8199, r));
	const browser = await chromium.launch();
	const L = 'http://127.0.0.1:9906/panel/';

	// 外网（不是局域网地址、不是 906 端口）：还是原来的登录页
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.goto('http://localhost:8199/panel/'); await W(1200);
		ok('外网打开：还是原来的登录页，不显示局域网登录', await page.isVisible('#login') && !(await page.isVisible('#lanlogin')));
		await ctx.close();
	}

	for (const dark of [false, true]) for (const w of [320, 390, 430]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		const ctx = await browser.newContext({ viewport: { width: w, height: 760 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.goto(L); await W(1200);
		ok('局域网打开、没登录过：显示「在家里打开面板」' + T, await page.isVisible('#lanlogin') && !(await page.isVisible('#login')) && /在家里打开面板/.test(await page.textContent('#lanlogin')));
		ok('不横向滚动' + T, await noHScroll(page));
		const box = await page.locator('#lanlogin .lgcard').boundingBox();
		ok('卡片在屏幕里，按钮看得到' + T, box && box.x >= 0 && box.x + box.width <= w + 1 && await page.locator('#llBtn').isVisible());
		await page.screenshot({ path: path.join(__dirname, 'shots', `lan-login-${w}${dark ? '-dark' : ''}.png`) });
		if (w !== 390) { await ctx.close(); continue; }
		await page.click('#llBtn'); await W(200);
		ok('没输密码就点：提示输密码' + T, /输一下路由器后台密码/.test(await page.textContent('#llErr')));
		await page.fill('#llPw', 'wrong'); await page.press('#llPw', 'Enter'); await W(800);
		ok('密码不对：说清楚，还停在这里' + T, /密码不对/.test(await page.textContent('#llErr')) && await page.isVisible('#lanlogin'));
		ok('请求是 JSON（路由器只认 JSON）' + T, calls.filter((c) => c.ep === 'lan').every((c) => /application\/json/.test(c.ct)));
		await page.fill('#llPw', 'rootpw'); await page.click('#llBtn'); await W(2000);
		ok('密码对了：进入面板' + T, !(await page.isVisible('#lanlogin')) && await page.isVisible('#app'));
		ok('手机上只留这台设备的钥匙，不留密码' + T, (await page.evaluate(() => localStorage.getItem('rp_dev'))) === 'lan00001.' + 'v'.repeat(32) && !(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).includes('rootpw'));
		ok('之后的请求走通行证' + T, calls.some((c) => c.ep === 'pass' && c.m === 'overview'));
		// 我的主页：局域网地址
		await page.goto(L + '?p=me'); await W(1500);
		ok('自建版我的主页：不说「应急登录码」' + T, /自建版/.test(await page.textContent('#meBox')) && !/应急登录/.test(await page.textContent('#meBox')));
		ok('我的主页：显示在家里打开的地址' + T, /在家里打开/.test(await page.textContent('#meBox')) && /192\.168\.6\.1:906/.test(await page.textContent('#meBox')));
		await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:9906' });
		await page.click('#meBox [data-mp="lancp"]'); await W(400);
		ok('点地址：复制完整网址' + T, (await page.evaluate(() => navigator.clipboard.readText())) === 'http://192.168.6.1:906/panel/');
		ok('我的主页不横向滚动' + T, await noHScroll(page));
		await page.screenshot({ path: path.join(__dirname, 'shots', `lan-me${dark ? '-dark' : ''}.png`), fullPage: true });
		await ctx.close();
	}

	// 从原版后台点进来（带票）：不用输密码
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.goto(L + '#lopen=' + TK); await W(2000);
		ok('带票打开：不用输密码直接进入面板', await page.isVisible('#app') && !(await page.isVisible('#lanlogin')));
		ok('带票打开：用的是 lan_open，钥匙存下', calls.some((c) => c.ep === 'lan' && c.m === 'lan_open' && c.p.ticket === TK) && (await page.evaluate(() => localStorage.getItem('rp_dev'))) === 'lan00002.' + 'w'.repeat(32));
		ok('带票打开：地址栏里的票清掉', !(await page.evaluate(() => location.hash)));
		await ctx.close();
	}
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.goto(L + '#lopen=' + 'z'.repeat(24)); await W(1500);
		ok('票过期：停在局域网登录页，说回原版后台再点一次，也能直接输密码', await page.isVisible('#lanlogin') && /回到原版后台再点一次/.test(await page.textContent('#llErr')) && await page.isVisible('#llPw'));
		await ctx.close();
	}
	// 托管版：局域网登录的也按「局域网登录」显示
	{
		HOSTED = true;
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.goto(L); await W(800);
		await page.fill('#llPw', 'rootpw'); await page.click('#llBtn'); await W(2000);
		await page.goto(L + '?p=me'); await W(1500);
		ok('托管版：我的主页显示「局域网登录」、提示从官网打开看完整主页', /局域网登录/.test(await page.textContent('#meBox')) && /在家里局域网直接登录/.test(await page.textContent('#meBox')) && !/应急登录码/.test(await page.textContent('#meBox')) && /从官网「我的路由器」点「打开面板」/.test(await page.textContent('#meBox')));
		await ctx.close();
	}
	await browser.close(); s1.close(); s2.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

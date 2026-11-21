// 6.0 第 6、12 项（面板这边）：自建版开了「登录要输路由器后台密码」时，粘贴登录地址后要再输一次路由器密码；
// 换到手机钥匙以后手机上不留登录密钥；敏感信息里能开关这个设置
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const TOK = 'selftoken1234567890abcd', SU = 's'.repeat(24);
let LPW = true; const calls = [];
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) {
		const tok = decodeURIComponent(u.pathname.split('/').pop()), body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, '');
		calls.push({ tok, m, p: body.params });
		const R = (result) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })), E = (code, message) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code, message } }));
		if (tok !== TOK && tok !== 'pass') { res.writeHead(404); return res.end('{}'); }
		if (tok === TOK) {
			if (m !== 'pass_login') return LPW ? E(-32015, '这台路由器开了「登录要输路由器后台密码」：输一下路由器后台（root）密码') : R(respond(m, body.params || {}));
			if (LPW && !body.params.pw) return E(-32015, '这台路由器开了「登录要输路由器后台密码」：输一下路由器后台（root）密码');
			if (LPW && body.params.pw !== 'rootpw') return E(-32000, '密码不对（还能再试 4 次）');
			return R({ dev: 'self0001.' + 'v'.repeat(32), id: 'self0001', name: body.params.name });
		}
		if (m === 'whoami') return R({ hosted: false, hub: null, ai: true, role: 'owner', perms: [], uid: null, dev: 'self0001', login_pw: LPW, lock: { on: false } });
		if (m === 'sudo_local') return body.params.pw === 'rootpw' ? R({ sudo: SU, exp: Date.now() + 600e3 }) : E(-32000, '密码不对');
		if (m === 'login_pw_set') { if (body.params.sudo !== SU) return E(-32000, '要先确认是你本人'); LPW = !!body.params.on; return R({ ok: true, on: LPW }); }
		if (m === 'device_list') return R({ hosted: false, list: [{ id: 'self0001', name: '这台', at: 1, via: '登录地址 + 路由器密码', me: true }] });
		if (m === 'cloud_info') return R({ enabled: false });
		return res.end(JSON.stringify(require('./mock').reply(body.id, m, body.params || {})));
	}
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(403); return res.end('{}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8196, r));
	const browser = await chromium.launch();
	for (const dark of [false, true]) {
		const T = dark ? '（深色）' : '';
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		LPW = true;
		await page.goto('http://localhost:8196/panel/'); await W(1200);
		await page.fill('#lgInput', 'https://r.example.com/cgi-bin/mcp/' + TOK); await page.click('#lgBtn'); await W(1200);
		ok('开了路由器密码：粘贴登录地址后，出现「路由器后台密码」输入框和说明（不弹红色错误）' + T, await page.isVisible('#lgPw') && /登录要输路由器后台密码/.test(await page.textContent('#lgPwRow')) && !(await page.isVisible('#lgErr')));
		ok('这时还没登录，也没把登录密钥留在手机上之外的地方（只等输密码）' + T, !(await page.evaluate(() => localStorage.getItem('rp_dev'))));
		await page.screenshot({ path: path.join(__dirname, 'shots', 'loginpw' + (dark ? '-dark' : '') + '.png') });
		const lay = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
		ok('登录页加了密码框以后不横向滚动' + T, lay);
		await page.fill('#lgPw', 'wrong'); await page.click('#lgBtn'); await W(1000);
		ok('路由器密码不对：说清楚，还停在登录页' + T, /密码不对/.test(await page.textContent('#lgErr')) && await page.isVisible('#login'));
		await page.fill('#lgPw', 'rootpw'); await page.click('#lgBtn'); await W(2000);
		ok('路由器密码对了：进入面板' + T, !(await page.isVisible('#login')) && await page.isVisible('#app'));
		ok('手机上只留这台手机的钥匙，登录密钥和路由器密码都不留' + T, (await page.evaluate(() => localStorage.getItem('rp_dev'))) === 'self0001.' + 'v'.repeat(32) && !(await page.evaluate(() => localStorage.getItem('rp_token'))) && !(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).includes('rootpw'));
		ok('之后的请求走通行证，不再用登录地址' + T, calls.filter((c) => c.tok === TOK).every((c) => c.m !== 'overview') && calls.some((c) => c.tok === 'pass' && c.m === 'overview'));
		if (!dark) {
			// 敏感信息里开关
			await page.goto('http://localhost:8196/panel/?p=me'); await W(1500);
			await page.fill('#meBox [data-pw]', 'rootpw'); await page.click('#meBox [data-pwok]'); await W(1200);
			ok('敏感信息：显示「登录要输路由器后台密码 · 已开启」', /登录要输路由器后台密码/.test(await page.textContent('#meBox')) && /已开启/.test(await page.textContent('#meBox [data-mp="kpw"]')));
			ok('敏感信息：自建版也能看到「登录着的设备」', /登录着的设备/.test(await page.textContent('#meBox')) && /登录地址 \+ 路由器密码/.test(await page.textContent('#meBox')));
			await page.screenshot({ path: path.join(__dirname, 'shots', 'loginpw-me.png'), fullPage: true });
			await page.click('#meBox [data-mp="kpw"]'); await W(400);
			ok('关掉前先确认，说清楚后果', /拿到登录地址就能登录新手机/.test(await page.textContent('.modal')));
			await page.locator('.modal').last().locator('button:has-text("关掉")').click(); await W(800);
			ok('关掉以后：路由器那边关了，显示「没开」', LPW === false && /没开/.test(await page.textContent('#meBox [data-mp="kpw"]')));
		}
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

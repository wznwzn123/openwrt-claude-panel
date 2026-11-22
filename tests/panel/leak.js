// 6.0 第 63 项：敏感信息只有一个入口——自动扫一遍面板的每一页和「系统操作」里的每个弹窗，
// 没验证时页面上（文字、属性、链接、二维码数据）不能出现登录密钥、AI 连接器地址、平板钥匙、完整邮箱。
// 以后每加一个页面或弹窗，这个测试会自动覆盖到（页面列表从面板自己的 TITLES 读）。
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const TOKEN = 'leaktok' + 'q'.repeat(25), CKEY = 'k'.repeat(40), TKEY = 'z'.repeat(32), EMAIL = 'leak.full.address@example.com';
const SECRETS = { 登录密钥: TOKEN, 连接器地址: CKEY, 平板钥匙: TKEY, 完整邮箱: EMAIL };
const SU = 's'.repeat(24);
let hosted = false;
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) {
		const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), p = body.params || {};
		const R = (result) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })), E = (message) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message } }));
		// 跟路由器一样：这几个没带凭证就不给
		if (['ckey_info', 'tablet_url', 'device_list', 'rotate_key'].includes(m) && p.sudo !== SU) return E('要先确认是你本人：在「我的主页 → 敏感信息」里验证');
		if (m === 'ckey_info') return R({ ai: true, url: 'https://r.example/cgi-bin/mcp/' + CKEY, hosted });
		if (m === 'tablet_url') return R({ url: 'https://r.example/cloud/beat/t/' + TKEY });
		if (m === 'cloud_info') return R({ enabled: true, url: 'https://r.example/cloud', tablet: true, pkey: null, hosted });
		if (m === 'whoami') return R({ hosted, ai: true, role: 'owner', perms: ['msg', 'node', 'speed', 'parent', 'proxy', 'net', 'sys'], uid: null, emerg: false, dev: null });
		if (m === 'svc_info') return R({ hosted: false });
		if (m === 'sudo_local') return p.pw === 'rootpw' ? R({ sudo: SU, exp: Date.now() + 600e3 }) : E('密码不对（还能再试 4 次）');
		try { return R(respond(m, p)); } catch (e) { return E(e.message); }
	}
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
// 页面上能看到、能复制、能扫出来的地方：整页 HTML（含属性、链接）+ 输入框里的值
const dump = (page) => page.evaluate(() => document.documentElement.outerHTML + '\n' + [...document.querySelectorAll('input,textarea')].map((x) => x.value).join('\n'));
const leaks = (html) => Object.entries(SECRETS).filter(([, v]) => html.includes(v)).map(([k]) => k);
(async () => {
	await new Promise((r) => server.listen(8186, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript((t) => localStorage.setItem('rp_token', t), TOKEN);
	await page.goto('http://localhost:8186/panel/'); await W(2000);
	// 页面列表从面板源码的 TITLES 读（以后加了页面自动扫到）
	const core = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'panel', '30-core.js'), 'utf8');
	const pages = [...(/const TITLES = \{([^}]*)\}/.exec(core) || ['', ''])[1].matchAll(/(\w+):\s*'/g)].map((m) => m[1]);
	ok('读到了面板的全部页面（' + pages.length + ' 页）', pages.length >= 20, pages.join());
	const bad = [];
	for (const pg of pages) {
		await page.goto('http://localhost:8186/panel/?p=' + pg); await W(1300);
		const l = leaks(await dump(page)); if (l.length) bad.push(pg + '：' + l.join('、'));
	}
	ok('没验证：每一页都没有登录密钥、连接器地址、平板钥匙、完整邮箱', !bad.length, bad.join('；'));
	// 系统操作里的每个弹窗（会动路由器的、退出登录的不点）
	await page.goto('http://localhost:8186/panel/?p=more'); await W(1500);
	const acts = await page.$$eval('#p-more [data-t]', (l) => l.filter((x) => x.offsetParent).map((x) => x.dataset.t));
	const SKIP = ['reboot', 'logout', 'feedback'];
	const bad2 = [];
	for (const t of acts.filter((x) => !SKIP.includes(x))) {
		await page.goto('http://localhost:8186/panel/?p=more'); await W(900);
		await page.click('#p-more [data-t="' + t + '"]').catch(() => {}); await W(900);
		const l = leaks(await dump(page)); if (l.length) bad2.push(t + '：' + l.join('、'));
	}
	ok('没验证：「系统操作」里的每个弹窗都没有这些（点了 ' + acts.filter((x) => !SKIP.includes(x)).length + ' 个）', !bad2.length, bad2.join('；'));
	// 断线记录的「平板设置方法」：不给网址
	await page.goto('http://localhost:8186/panel/?p=wd'); await W(1500);
	await page.click('[data-tablethelp], button:has-text("平板设置方法"), button:has-text("加一台平板")').catch(() => {}); await W(500);
	ok('没验证：「平板设置方法」里没有平板网址', !leaks(await dump(page)).length);
	// 验证以后，钥匙只在「我的主页 → 敏感信息」里出现
	await page.goto('http://localhost:8186/panel/?p=me'); await W(1500);
	await page.fill('#meBox [data-pw]', 'rootpw'); await page.click('#meBox [data-pwok]'); await W(1000);
	await page.click('#meBox [data-mp="kckey"]'); await W(800);
	ok('验证后：连接器地址在「我的主页 → 敏感信息」里能拿到（先打码）', leaks(await dump(page)).includes('连接器地址') && (await page.locator('.modal .keybox.blur').count()) === 1);
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

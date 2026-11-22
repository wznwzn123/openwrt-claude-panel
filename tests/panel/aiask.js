// 6.0 第 11 项：Claude 想做危险操作 → 面板弹出「允许 / 拒绝」；「AI 连接器地址」里选 AI 能做什么（只读 / 危险操作要确认 / 完全放开）
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const now = () => Math.floor(Date.now() / 1000);
const S = { mode: 'ask', list: [], calls: [], role: 'owner', perms: [] };
const fresh = () => { const t = now(); S.list = [
	{ id: 'aaaaaaaaa1', title: '执行命令', detail: 'opkg update && opkg install luci-app-ttyd && /etc/init.d/ttyd restart && echo "装好了，这是一串很长的命令，用来看看窄屏上会不会撑破弹窗：/usr/lib/lua/luci/controller/very/long/path/name.lua"', at: t - 5, exp: t + 295, st: 'wait' },
	{ id: 'aaaaaaaaa2', title: '重启路由器', detail: '整个网络会断 1–3 分钟', at: t - 2, exp: t + 298, st: 'wait' }]; };
function handle(m, p) {
	S.calls.push({ m, p });
	if (m === 'whoami') return { ...mock.respond('whoami', p), ai: true, role: S.role, perms: S.perms };
	if (m === 'ai_asks') { if (S.role === 'sub' && !S.perms.includes('net')) throw Object.assign(new Error('主账号没有给你开「完全控制」权限'), { code: -32012 }); return { ai: true, mode: S.mode, list: S.list }; }
	if (m === 'ai_answer') { const x = S.list.find((y) => y.id === p.id); if (!x || x.st !== 'wait') throw new Error('这个请求已经处理过了'); x.st = p.ok ? 'ok' : 'no'; return { ok: true, st: x.st }; }
	if (m === 'ckey_info') { if (!p.sudo) throw new Error('要先确认是你本人'); return { ai: true, url: 'https://r.example/cgi-bin/mcp/' + 'c'.repeat(40), hosted: false, mode: S.mode, asks: [{ id: 'x1', title: '重启路由器', at: now() - 3600, st: 'no' }, { id: 'x2', title: '修改路由器设置', at: now() - 600, st: 'done' }, { id: 'x3', title: '执行命令', at: now() - 60, st: 'exp' }] }; }
	if (m === 'ai_mode') { if (!p.sudo) throw new Error('要先确认是你本人'); S.mode = p.mode; return { ok: true, mode: p.mode }; }
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); try { return J({ jsonrpc: '2.0', id: body.id, result: handle(body.method.replace(/^panel\//, ''), body.params || {}) }); } catch (e) { return J({ jsonrpc: '2.0', id: body.id, error: { code: e.code || -32000, message: e.message } }); } }
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = path.join(__dirname, 'shots');
(async () => {
	await new Promise((r) => server.listen(8097, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 568, false], [390, 844, true], [430, 932, false], [1280, 800, true]]) {
		const T = `［${w}${dark ? ' 深色' : ''}］`;
		S.mode = 'ask'; S.role = 'owner'; S.perms = []; fresh(); S.calls = [];
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_ai', '1'); if (!sessionStorage.getItem('rp_sudo')) sessionStorage.setItem('rp_sudo', JSON.stringify({ tok: 's'.repeat(24), exp: Date.now() + 600e3, kind: 'local' })); });
		// 推送里点进来：?ask=ai
		await page.goto('http://localhost:8097/panel/?p=home&ask=ai'); await W(2600);
		const box = async () => (await page.locator('.modal .aiask').count()) ? page.textContent('.modal:has(.aiask) .modalbox') : '';
		let t = await box();
		ok('推送点进来：马上弹出 AI 的请求，写着想做什么、具体内容、多久后过期' + T, /AI 想要：执行命令/.test(t) && /opkg install luci-app-ttyd/.test(t) && /后过期/.test(t) && /后面还有 1 个/.test(t), t.slice(0, 120));
		ok('说清楚不是自己让做的怎么办' + T, /点「拒绝」/.test(t) && /换一下 AI 连接器地址/.test(t));
		ok('点外面关不掉（必须选允许或拒绝）' + T, await (async () => { await page.mouse.click(5, 5); await W(400); return (await page.locator('.modal .aiask').count()) === 1; })());
		const ov = await page.evaluate(() => { const W = document.documentElement.clientWidth, b = document.querySelector('.modal .modalbox').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, W, l: b.left, r: b.right }; });
		ok('弹窗不超出屏幕、不横向滚动' + T, ov.sw <= ov.W && ov.l >= 0 && ov.r <= ov.W + 0.5, JSON.stringify(ov));
		await page.screenshot({ path: path.join(SHOT, `aiask-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-ans="ok"]'); await W(1600);
		ok('点「允许」：告诉路由器允许了这一个' + T, S.list[0].st === 'ok' && S.calls.some((c) => c.m === 'ai_answer' && c.p.id === 'aaaaaaaaa1' && c.p.ok === true));
		t = await box();
		ok('接着弹出下一个（重启路由器，写着会断网多久）' + T, /AI 想要：重启路由器/.test(t) && /1–3 分钟/.test(t) && !/后面还有/.test(t), t.slice(0, 80));
		await page.click('.modal [data-ans="no"]'); await W(1400);
		ok('点「拒绝」：告诉路由器拒绝了，弹窗关掉' + T, S.list[1].st === 'no' && (await page.locator('.modal .aiask').count()) === 0);
		// 开着面板时有新请求：每 12 秒查一次
		const t0 = now(); S.list.push({ id: 'aaaaaaaaa3', title: '修改路由器设置', detail: 'set wireless.default_radio0.ssid=MyWiFi\nset wireless.default_radio0.key=******', at: t0, exp: t0 + 300, st: 'wait' });
		await W(13500);
		t = await box();
		ok('开着面板时来了新请求：十几秒内自己弹出来；密码打码' + T, /修改路由器设置/.test(t) && /key=\*\*\*\*\*\*/.test(t), t.slice(0, 80));
		await page.click('.modal [data-ans="no"]'); await W(800);
		// AI 连接器地址：选档位
		await page.goto('http://localhost:8097/panel/?p=me'); await W(2200);
		await page.click('#meBox [data-mp="kckey"]'); await W(1200);
		t = await page.textContent('.modal');
		ok('「AI 连接器地址」里有「AI 能做什么」三档，现在是「危险操作要确认」（推荐）' + T, /AI 能做什么/.test(t) && /只读/.test(t) && /完全放开/.test(t) && (await page.getAttribute('.modal [data-aim="ask"]', 'aria-pressed')) === 'true' && /推荐/.test(t));
		ok('最近的请求：已拒绝、已执行、过期了，时间写对' + T, /已拒绝/.test(t) && /已执行/.test(t) && /过期了/.test(t) && /1 小时前/.test(t) && !/天前/.test(t), t);
		const ov2 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, W: document.documentElement.clientWidth, bad: [...document.querySelectorAll('.modal .aimode, .modal .ailog .kv')].filter((e) => e.scrollWidth > e.clientWidth + 1).length }));
		ok('档位和请求列表不超出、不截断' + T, ov2.sw <= ov2.W && !ov2.bad, JSON.stringify(ov2));
		await page.screenshot({ path: path.join(SHOT, `aimode-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		await page.click('.modal [data-aim="ro"]'); await W(1000);
		ok('点「只读」：改了（带着确认本人的凭证），按钮跟着变' + T, S.mode === 'ro' && S.calls.some((c) => c.m === 'ai_mode' && c.p.mode === 'ro' && c.p.sudo) && (await page.getAttribute('.modal [data-aim="ro"]', 'aria-pressed')) === 'true');
		await page.click('.modal [data-aim="full"]'); await W(600);
		ok('点「完全放开」：先确认（说清楚风险）' + T, /完全放开/.test(await page.locator('.modal').last().textContent()) && /拿到连接器地址的人也一样/.test(await page.locator('.modal').last().textContent()) && S.mode === 'ro');
		await page.locator('.modal').last().locator('[data-v="false"]').click(); await W(500);
		ok('取消：还是只读' + T, S.mode === 'ro');
		await ctx.close();
		// 家人没有「完全控制」：不查、不弹
		S.role = 'sub'; S.perms = ['msg', 'node']; fresh(); S.calls = [];
		const c2 = await browser.newContext({ viewport: { width: w, height: h } }); const p2 = await c2.newPage();
		p2.on('pageerror', (e) => problems.push('页面错误2' + T + '：' + e.message));
		await p2.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_ai', '1'); localStorage.setItem('rp_role', JSON.stringify({ role: 'sub', perms: ['msg', 'node'] })); });
		await p2.goto('http://localhost:8097/panel/?p=home&ask=ai'); await W(3000);
		ok('家人没有「完全控制」：不弹 Claude 的请求，也不去问' + T, (await p2.locator('.modal .aiask').count()) === 0 && !S.calls.some((c) => c.m === 'ai_asks'));
		await c2.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

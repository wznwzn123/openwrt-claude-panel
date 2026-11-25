// 6.0 第 24 项（面板）：上网设置——状态卡片（已连上、外网地址、网关、DNS、连了多久；拨号密码不对时说清楚）、
// 选上网方式（分段开关）、宽带拨号（密码只能改、不显示）、固定 IP、DNS（用运营商的 / 自己填）；改了才出「保存」；
// 保存前确认（写后果），保存后弹「能上网了吗？」卡片；没装拨号组件时去软件中心；敏感信息里能看宽带账号和密码；菜单里有这一页
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const ST_UP = { up: true, pending: false, ip: '100.64.3.9', pl: 22, gw: '100.64.0.1', dns: ['202.96.128.86', '202.96.134.133'], uptime: 3 * 3600 + 50, err: [] };
const S = { calls: [], d: null };
const D0 = () => ({ iface: 'wan', proto: 'pppoe', proto_name: null, user: '0755123456@163.gd', has_pw: true, ip: null, mask: null, gw: null, dns: [], dns_auto: true, pppoe: true, status: ST_UP, pending: null });
function handle(m, p) {
	S.calls.push({ m, p });
	if (m === 'wan_get') return S.d;
	if (m === 'wan_set') { if (p.ip === '192.168.1.9') throw new Error('跟家里网段（192.168.1.1/24）冲突，换一个，或者先改家里的网段'); return { changed: true, token: 'tttttttttttttttt', wait: 90, what: '固定 IP' }; }
	if (m === 'net_confirm') return { ok: true };
	if (m === 'wan_secret') return { pppoe: true, user: '0755123456@163.gd', pw: 'Secret-Pw-9' };
	if (m === 'sudo_local') return { sudo: 'S'.repeat(24), exp: Date.now() + 600000 };
	if (m === 'store_list') return { list: [], total: 0, age: 100, free: 1e7, feeds: [], istore: false };
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); try { return J({ jsonrpc: '2.0', id: body.id, result: handle(body.method.replace(/^panel\//, ''), body.params || {}) }); } catch (e) { return J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8174, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S.calls = []; S.d = D0();
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8174/panel/?p=wan'); await W(1800);
		const st = await page.textContent('#wanSt');
		ok('状态：已连上、宽带拨号、连了 3 小时、外网地址、网关、DNS' + T, /已连上/.test(st) && /宽带拨号 · 连了 3 小时/.test(st) && /100\.64\.3\.9/.test(st) && /100\.64\.0\.1/.test(st) && /202\.96\.128\.86\s*202\.96\.134\.133/.test(st) && await page.evaluate(() => [...document.querySelectorAll('#wanSt dd')].every((d) => d.scrollWidth <= d.clientWidth + 1)), st);
		ok('分段开关：三种方式，宽带拨号选中' + T, (await page.locator('#wanMode .chip').count()) === 3 && /宽带拨号/.test(await page.textContent('#wanMode .chip.on')));
		ok('宽带账号填着；密码框是空的、不显示原来的密码' + T, (await page.inputValue('[data-wan="user"]')) === '0755123456@163.gd' && (await page.inputValue('[data-wan="pw"]')) === '' && (await page.getAttribute('[data-wan="pw"]', 'placeholder')) === '不改就不填' && !/Secret/.test(await page.content()));
		ok('用运营商的 DNS：开着，DNS 输入框收起' + T, (await page.isChecked('[data-wan="auto"]')) && (await page.locator('#wanDns').evaluate((e) => e.classList.contains('hidden'))));
		ok('没改：不出保存栏' + T, await page.locator('#wanBar').evaluate((e) => e.classList.contains('hidden')));
		ok('不横向滚动' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		const segOk = await page.evaluate(() => { const b = document.getElementById('wanMode'), cs = [...b.children].filter((c) => c.classList.contains('chip')); const r = b.getBoundingClientRect(); return cs.every((c) => { const q = c.getBoundingClientRect(); return q.top - r.top < 8 && c.scrollWidth <= c.clientWidth + 1; }); });
		ok('分段开关一行放下、字不截断' + T, segOk);
		await page.screenshot({ path: path.join(SHOT, `wan-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		// 密码「显示」只显示刚输的
		await page.fill('[data-wan="pw"]', 'newpw'); await page.click('[data-wan="eye"]');
		ok('密码「显示」：显示刚输的' + T, (await page.getAttribute('[data-wan="pw"]', 'type')) === 'text' && /隐藏/.test(await page.textContent('[data-wan="eye"]')));
		ok('输了新密码：出保存栏' + T, !(await page.locator('#wanBar').evaluate((e) => e.classList.contains('hidden'))));
		await page.click('#wanUndo'); await W(200);
		ok('撤销：回到原来的，保存栏收起' + T, (await page.inputValue('[data-wan="pw"]')) === '' && (await page.locator('#wanBar').evaluate((e) => e.classList.contains('hidden'))));
		// 换成固定 IP
		await page.click('#wanMode .chip[data-m="static"]'); await W(300);
		ok('固定 IP：IP 地址、子网掩码（默认 255.255.255.0）、网关；DNS 必填（没有「用运营商的」）' + T, (await page.locator('[data-wan="ip"]').count()) === 1 && (await page.inputValue('[data-wan="mask"]')) === '255.255.255.0' && (await page.locator('[data-wan="gw"]').count()) === 1 && (await page.locator('[data-wan="auto"]').count()) === 0 && !(await page.locator('#wanDns').evaluate((e) => e.classList.contains('hidden'))));
		ok('选填的写「（选填）」' + T, /DNS 2（选填）/.test(await page.textContent('#wanDns')));
		await page.screenshot({ path: path.join(SHOT, `wan-static-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		await page.click('#wanSave'); await W(300);
		ok('没填 IP 就点保存：光标到 IP 地址，不弹确认' + T, (await page.evaluate(() => document.activeElement?.dataset?.wan)) === 'ip' && (await page.locator('.modal').count()) === 0);
		await page.fill('[data-wan="ip"]', '192.168.1.9'); await page.fill('[data-wan="gw"]', '192.168.1.1'); await page.fill('[data-wan="dns0"]', '223.5.5.5');
		await page.click('#wanSave'); await W(400);
		let m = page.locator('.modal').last();
		ok('保存前确认：标题写动作，正文写后果（断网、掉线、90 秒自动改回）' + T, /修改上网设置/.test(await m.textContent()) && /断网一会儿/.test(await m.textContent()) && /90 秒后自动改回/.test(await m.textContent()));
		await m.locator('[data-v="true"]').click(); await W(700);
		ok('路由器不让（跟家里网段冲突）：红色提示原因' + T, /跟家里网段/.test(await page.textContent('#toast')));
		await page.fill('[data-wan="ip"]', '10.0.0.5'); await page.fill('[data-wan="gw"]', '10.0.0.1');
		await page.click('#wanSave'); await W(400);
		await page.locator('.modal').last().locator('[data-v="true"]').click(); await W(800);
		const set = S.calls.filter((c) => c.m === 'wan_set').pop();
		ok('传给路由器：固定 IP、地址、掩码、网关、DNS' + T, set && set.p.proto === 'static' && set.p.ip === '10.0.0.5' && set.p.mask === '255.255.255.0' && set.p.gw === '10.0.0.1' && JSON.stringify(set.p.dns) === '["223.5.5.5"]' && set.p.dns_auto === false, JSON.stringify(set && set.p));
		const ng = page.locator('.modal[data-ng]');
		ok('弹「能上网了吗？」卡片，带倒数，是小卡片' + T, (await ng.count()) === 1 && /能上网了吗/.test(await ng.textContent()) && /秒后改回原来的/.test(await ng.textContent()) && await ng.evaluate((e) => e.classList.contains('compact')));
		await page.screenshot({ path: path.join(SHOT, `wan-keep-${w}${dark ? '-dark' : ''}.png`) });
		await ng.locator('[data-keep]').click(); await W(900);
		ok('点「保留」：提示「已保留新的上网设置」' + T, /已保留新的上网设置/.test(await page.textContent('#toast')));
		await ctx.close();
	}
	// 拨号失败 / 自定义 DNS / 没装拨号组件 / 其他协议 / 没有 WAN 口
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		S.d = { ...D0(), status: { up: false, pending: false, ip: null, gw: null, dns: [], uptime: 0, err: ['AUTH_FAILED'] }, dns: ['223.5.5.5', '119.29.29.29'], dns_auto: false };
		await page.goto('http://localhost:8174/panel/?p=wan'); await W(1600);
		ok('拨号密码不对：状态写「账号或密码不对」，标红', /账号或密码不对/.test(await page.textContent('#wanSt')) && await page.locator('#wanSt b.ndbad').count() === 1);
		ok('自己填的 DNS：开关关着，两个 DNS 填着', !(await page.isChecked('[data-wan="auto"]')) && (await page.inputValue('[data-wan="dns0"]')) === '223.5.5.5' && (await page.inputValue('[data-wan="dns1"]')) === '119.29.29.29');
		await page.check('[data-wan="auto"]'); await W(200);
		ok('打开「用运营商的 DNS」：DNS 收起，出保存栏', (await page.locator('#wanDns').evaluate((e) => e.classList.contains('hidden'))) && !(await page.locator('#wanBar').evaluate((e) => e.classList.contains('hidden'))));
		S.d = { ...D0(), proto: 'dhcp', user: null, has_pw: false, pppoe: false };
		await page.goto('http://localhost:8174/panel/?p=wan'); await W(1600);
		await page.click('#wanMode .chip[data-m="pppoe"]'); await W(300);
		ok('没装拨号组件：说清楚，给「去软件中心装」按钮', /固件没装宽带拨号组件/.test(await page.textContent('#wanBody')) && (await page.locator('#wanPpp').count()) === 1);
		await page.click('#wanPpp'); await W(1200);
		ok('点了去软件中心，搜好 ppp-mod-pppoe', (await page.inputValue('#stFilter')) === 'ppp-mod-pppoe' && await page.evaluate(() => document.getElementById('p-store').classList.contains('on')));
		S.d = { ...D0(), proto: 'other', proto_name: 'l2tp', user: null };
		await page.goto('http://localhost:8174/panel/?p=wan'); await W(1600);
		ok('别的上网方式（L2TP）：说现在是什么，没有选中的', /现在是 L2TP/.test(await page.textContent('#wanBody')) && (await page.locator('#wanMode .chip.on').count()) === 0 && /L2TP/.test(await page.textContent('#wanSt')));
		S.d = { none: '没有 WAN 口：这台路由器可能当旁路由或者中继在用', pending: null };
		await page.goto('http://localhost:8174/panel/?p=wan'); await W(1600);
		ok('没有 WAN 口：说清楚，没有表单', /没有 WAN 口/.test(await page.textContent('#wanSt')) && (await page.locator('#wanMode').count()) === 0);
		// 菜单
		const nav = await page.evaluate(() => [...document.querySelectorAll('#sidenav [data-p]')].map((b) => [b.dataset.p, b.textContent.trim()]));
		ok('菜单「网络」里有「上网设置」', nav.some((x) => x[0] === 'wan' && /上网设置/.test(x[1])), JSON.stringify(nav.slice(0, 12)));
		await ctx.close();
	}
	// 敏感信息里看宽带账号和密码（自建版：路由器后台密码验证）
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_ppp', '1'); });
		await page.goto('http://localhost:8174/panel/?p=me'); await W(1800);
		const pw = page.locator('#meBox [data-pw]');
		if (await pw.count()) { await pw.fill('rootpw'); await page.locator('#meBox [data-pwok]').click(); await W(1200); }
		const row = page.locator('#meBox [data-mp="kppp"]');
		ok('敏感信息（验证后）：有「宽带账号和密码」', (await row.count()) === 1, await page.textContent('#meBox').catch(() => ''));
		if (await row.count()) {
			await row.click(); await W(700);
			const m = page.locator('.modal').last();
			ok('点开：账号、密码（先模糊，点一下显示）、复制按钮', /0755123456@163\.gd/.test(await m.textContent()) && /Secret-Pw-9/.test(await m.textContent()) && await m.locator('.keybox').evaluate((e) => e.classList.contains('blur')) && (await m.locator('[data-cp]').count()) === 1);
			await page.screenshot({ path: path.join(SHOT, 'wan-secret-390.png') });
			ok('要验证才拿得到（带凭证）', S.calls.some((c) => c.m === 'wan_secret' && c.p.sudo));
		}
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

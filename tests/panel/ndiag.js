// 6.0 第 21 项（面板）：网络诊断——Ping / 路由追踪 / 域名查询；结果一眼看懂（平均、丢包、每一跳、查到的 IP）；
// 固件没带的工具点了说原因；最近查过的点一下再查；菜单里「网络诊断」打开的是这一页
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const S = { calls: [], caps: { ping: true, trace: false, dns: true, route: true } };
const R = {
	ping: { tool: 'ping', addr: 'www.baidu.com', ip: '110.242.68.3', times: [12.345, 11.002, 14.1], sent: 4, recv: 3, loss: 25, min: 11.002, avg: 12.482, max: 14.1, fake: false },
	trace: { tool: 'trace', addr: '1.1.1.1', ip: '1.1.1.1', hops: [{ n: 1, ip: '192.168.1.1', ms: 0.512 }, { n: 2, ip: null, ms: null }, { n: 3, ip: '1.1.1.1', ms: 9.87 }], done: true, fake: false },
	dns: { tool: 'dns', addr: 'www.google.com', server: '127.0.0.1', ips: ['198.18.0.12'], cname: [], fake: true },
	route: { tool: 'route', v4: [{ dst: 'default', via: '192.168.0.1', dev: 'eth0', metric: 10 }, { dst: '192.168.1.0/24', dev: 'br-lan' }, { dst: '10.9.0.0/16', type: 'unreachable', metric: 5 }], v6: [{ dst: 'default', via: 'fe80::1', dev: 'pppoe-wan', metric: 512 }, { dst: '2408:8207:1234:5678:abcd::/80', dev: 'br-lan', metric: 1024 }] },
};
function handle(m, p) {
	S.calls.push({ m, p });
	if (m === 'netdiag_caps') return S.caps;
	if (m === 'netdiag') return R[p.tool];
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); const m = body.method.replace(/^panel\//, ''); return setTimeout(() => { try { J({ jsonrpc: '2.0', id: body.id, result: handle(m, body.params || {}) }); } catch (e) { J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }, m === 'netdiag' ? 700 : 0); }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8189, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S.calls = [];
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8189/panel/?p=ndiag'); await W(1800);
		ok('四个工具一行放下' + T, await page.evaluate(() => { const c = [...document.querySelectorAll('#ndTool .chip')]; return c.length === 4 && new Set(c.map((x) => Math.round(x.getBoundingClientRect().top))).size === 1 && c.every((x) => x.scrollWidth <= x.clientWidth + 1); }));
		ok('固件没带 traceroute：「路由追踪」变灰' + T, await page.locator('#ndTool [data-nt="trace"].off').count() === 1);
		await page.click('#ndTool [data-nt="trace"]'); await W(300);
		ok('点了说原因' + T, /固件没带 traceroute/.test(await page.textContent('#toast')));
		// Ping
		await page.fill('#ndAddr', 'www.baidu.com'); await page.click('#ndGo'); await W(250);
		ok('进行中写「正在 Ping…」' + T, /正在 Ping…/.test(await page.textContent('#ndOut')));
		await W(900);
		let t = await page.textContent('#ndOut');
		ok('Ping 结果：IP、平均、丢包、最快、最慢、每一个' + T, /110\.242\.68\.3/.test(t) && /12\.5 ms/.test(t) && /25%/.test(t) && /11 ms/.test(t) && /14\.1 ms/.test(t) && /第 3 个/.test(t), t.slice(0, 200));
		ok('丢包标成橙色' + T, await page.locator('#ndOut .ndwarn').count() === 1);
		ok('告诉路由器查什么' + T, S.calls.some((c) => c.m === 'netdiag' && c.p.tool === 'ping' && c.p.addr === 'www.baidu.com'));
		ok('不横向滚动' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await page.screenshot({ path: path.join(SHOT, `ndiag-${w}${dark ? '-dark' : ''}.png`) });
		// 最近查过的
		ok('最近查过的出现在下面' + T, /www\.baidu\.com/.test(await page.textContent('#ndRecent')));
		// 域名查询
		await page.click('#ndTool [data-nt="dns"]'); await W(200);
		ok('换工具：清掉上次结果，提示只填域名' + T, (await page.textContent('#ndOut')).trim() === '' && (await page.getAttribute('#ndAddr', 'placeholder')) === '域名');
		await page.fill('#ndAddr', 'www.google.com'); await page.press('#ndAddr', 'Enter'); await W(1200);
		t = await page.textContent('#ndOut');
		ok('域名查询：用的 DNS、查到的 IP，Fake-IP 标出来' + T, /DNS 127\.0\.0\.1/.test(t) && /198\.18\.0\.12/.test(t) && /Fake-IP/.test(t), t.slice(0, 200));
		await page.screenshot({ path: path.join(SHOT, `ndiag-dns-${w}${dark ? '-dark' : ''}.png`) });
		// 点最近查过的再查
		S.calls = [];
		await page.click('#ndRecent [data-a="www.baidu.com"]'); await W(1200);
		ok('点最近查过的：直接再查' + T, S.calls.some((c) => c.m === 'netdiag' && c.p.addr === 'www.baidu.com' && c.p.tool === 'dns'));
		// 路由表（第 33 项）：点了直接读，不用填地址
		S.calls = [];
		await page.click('#ndTool [data-nt="route"]'); await W(200);
		ok('路由表：藏起地址框和最近查过的' + T, !(await page.isVisible('#ndForm')) && !(await page.isVisible('#ndRecent')));
		ok('路由表：进行中写「正在读取…」' + T, /正在读取…/.test(await page.textContent('#ndOut')));
		await W(900);
		t = await page.textContent('#ndOut');
		ok('路由表：IPv4 / IPv6 分开，默认、网关、接口、跃点、不可达' + T, /IPv4/.test(t) && /IPv6/.test(t) && /默认/.test(t) && /经 192\.168\.0\.1/.test(t) && /eth0/.test(t) && /跃点 10/.test(t) && /不可达/.test(t) && S.calls.some((c) => c.m === 'netdiag' && c.p.tool === 'route' && !c.p.addr), t.slice(0, 200));
		ok('路由表：长地址不撑出屏幕' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#ndOut .ndrt')].every((x) => x.getBoundingClientRect().right <= innerWidth)));
		await page.screenshot({ path: path.join(SHOT, `ndiag-route-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('#ndTool [data-nt="ping"]'); await W(200);
		ok('换回 Ping：地址框回来' + T, await page.isVisible('#ndForm'));
		await ctx.close();
	}
	// 路由追踪（固件带了）
	{
		S.caps = { ping: true, trace: true, dns: true };
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（追踪）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8189/panel/?p=ndiag'); await W(1800);
		await page.click('#ndTool [data-nt="trace"]'); await page.fill('#ndAddr', '1.1.1.1'); await page.click('#ndGo'); await W(1200);
		const t = await page.textContent('#ndOut');
		ok('路由追踪：每一跳，没回应的写出来，到达终点', /192\.168\.1\.1/.test(t) && /没回应/.test(t) && /已到达/.test(t) && (await page.locator('#ndOut .file').count()) === 3, t.slice(0, 200));
		await page.screenshot({ path: path.join(SHOT, 'ndiag-trace.png') });
		// 菜单里的「网络诊断」打开这一页
		await page.goto('http://localhost:8189/panel/?p=home'); await W(1500);
		const nav = await page.evaluate(() => [...document.querySelectorAll('[data-p]')].filter((b) => /网络诊断/.test(b.textContent)).map((b) => b.dataset.p));
		ok('菜单里的「网络诊断」是这一页，不再跳原版后台', nav.includes('ndiag') && !nav.some((p) => /diagnostics/.test(p)), JSON.stringify(nav));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

// 5.2.3：手机连不上专属网址时，托管版自动改走官网中转；都连不上时说清楚是哪一段不通
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const SUB = 'abcdefgh', HUB = 'hub.test', ORIGIN = 'http://' + SUB + '.' + HUB;
async function scene(browser, opt) {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage();
	const st = { direct: 0, relay: 0, cloudRelay: 0, ping: 0, cn: 0, other: [] };
	page.on('pageerror', (e) => problems.push(opt.name + ' 页面错误：' + e.message));
	await page.addInitScript(([hub]) => { localStorage.setItem('rp_token', 'testtoken1234567890'); if (hub) localStorage.setItem('rp_hub', hub); }, [opt.hub === false ? '' : 'https://' + HUB]);
	await page.route('**/*', async (route) => {
		const req = route.request(), u = new URL(req.url());
		const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type, accept', 'access-control-expose-headers': 'x-cmcp-relay' };
		if (u.hostname === SUB + '.' + HUB && u.pathname.startsWith('/panel/')) {
			const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
			if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
			return route.fulfill({ status: 200, headers: { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }, body: fs.readFileSync(f) });
		}
		if (u.hostname === SUB + '.' + HUB && u.pathname.startsWith('/cgi-bin/mcp/')) { st.direct++; return opt.direct ? route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: respond(JSON.parse(req.postData()).method.replace(/^panel\//, ''), JSON.parse(req.postData()).params || {}) }) }) : route.abort('connectionfailed'); }
		if (u.hostname === SUB + '.' + HUB && u.pathname.startsWith('/cloud/')) return opt.direct ? route.fulfill({ status: 403, headers: { 'content-type': 'application/json' }, body: '{"error":"x"}' }) : route.abort('connectionfailed');
		if (u.hostname === HUB && u.pathname.startsWith('/api/relay/' + SUB + '/cgi-bin/mcp/')) {
			if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
			st.relay++;
			if (!opt.relay) return route.abort('connectionfailed');
			const b = JSON.parse(req.postData() || '{}');
			return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'x-cmcp-relay': '1', ...cors }, body: JSON.stringify({ jsonrpc: '2.0', id: b.id, result: respond(b.method.replace(/^panel\//, ''), b.params || {}) }) });
		}
		if (u.hostname === HUB && u.pathname === '/api/relay/' + SUB + '/cloud/s') { if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors }); st.cloudRelay++; return opt.relay ? route.fulfill({ status: 403, headers: { 'content-type': 'application/json', 'x-cmcp-relay': '1', ...cors }, body: '{"error":"x"}' }) : route.abort('connectionfailed'); }
		if (u.hostname === HUB && u.pathname === '/api/ping') { st.ping++; return opt.official ? route.fulfill({ status: 200, body: '{}' }) : route.abort('connectionfailed'); }
		if (u.hostname === 'www.baidu.com') { st.cn++; return opt.cn ? route.fulfill({ status: 200, body: '' }) : route.abort('connectionfailed'); }
		st.other.push(u.href);
		return route.abort('connectionfailed');
	});
	await page.goto(ORIGIN + '/panel/?p=home'); await page.waitForTimeout(opt.wait || 9000);
	const out = { st, cnt: JSON.stringify(st), desc: await page.textContent('#hDesc').catch(() => ''), status: await page.textContent('#stText').catch(async () => await page.textContent('#statusPill').catch(() => '')), toast: await page.textContent('#toast').catch(() => '') };
	await page.screenshot({ path: path.join(__dirname, 'shots', 'relay-' + opt.tag + '.png') });
	await ctx.close();
	return out;
}
(async () => {
	fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true });
	const browser = await chromium.launch();
	// 1) 专属网址连不上、官网中转能通：自动改走中转，数据照样出来
	let r = await scene(browser, { tag: 'ok', name: '中转', direct: false, relay: true, official: true, cn: true });
	ok('[中转] 专属网址连不上时，自动试了官网中转', r.st.relay > 0, JSON.stringify(r.st));
	ok('[中转] 改走中转后提示用户', /官网中转/.test(r.toast), r.toast);
	ok('[中转] 页面不显示「连不上路由器」', !/连不上路由器|没网|连不上 Cloudflare/.test(r.desc), r.desc);
	const d1 = r.st.direct;
	ok('[中转] 改走中转后，不再每次先试直连（10 分钟后再试）', d1 <= 3, '直连次数 ' + d1);
	// 2) 中转也不通，官网打不开，国内网站能开：说「连不上 Cloudflare」
	r = await scene(browser, { tag: 'cf', name: '连不上CF', direct: false, relay: false, official: false, cn: true, wait: 30000 });
	ok('[诊断] 手机有网但连不上 Cloudflare：说清楚，不说成手机没网', /连不上 Cloudflare/.test(r.desc) && !/好像没网/.test(r.desc), r.desc + ' ' + r.cnt);
	// 3) 都打不开：说手机没网
	r = await scene(browser, { tag: 'nonet', name: '没网', direct: false, relay: false, official: false, cn: false, wait: 30000 });
	ok('[诊断] 连国内网站都打不开：说手机好像没网', /好像没网/.test(r.desc), r.desc);
	// 4) 官网能开，但中转也连不上路由器：说是这个网址的问题
	r = await scene(browser, { tag: 'site', name: '网址', direct: false, relay: false, official: true, cn: true, wait: 30000 });
	ok('[诊断] 官网能开、专属网址不行：说清楚是专属网址这一段', /能打开官网/.test(r.desc), r.desc);
	// 5) 自建版（没有官网信息）：不往别处发请求
	r = await scene(browser, { tag: 'self', name: '自建', hub: false, direct: false, relay: true, official: true, cn: true, wait: 12000 });
	ok('[安全] 自建版不会把请求发到官网中转', r.st.relay === 0 && r.st.cloudRelay === 0 && r.st.ping === 0, JSON.stringify(r.st));
	// 6) 直连正常：完全不走中转
	r = await scene(browser, { tag: 'direct', name: '直连', direct: true, relay: true, official: true, cn: true, wait: 6000 });
	ok('[中转] 直连正常时不走中转', r.st.relay === 0 && r.st.direct > 0, JSON.stringify(r.st));
	await browser.close();
	for (const [n, c, note] of results) console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + note + '）'));
	console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
	if (problems.length) console.log('问题：\n' + problems.join('\n'));
	process.exit(problems.length ? 1 : 0);
})();

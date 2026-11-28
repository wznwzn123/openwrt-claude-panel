// 总表 #97（面板）：PassWall 2 / PassWall / HomeProxy / SSR Plus+ 的分流界面（用户 11/28）
// 菜单显示；PassWall 主节点要先换成分流节点（先问，点了才换）；只有直连 / 代理的插件选去向时写原因、没有节点；插件名；识别软件 DNS 模式的分组名
// 320 / 390 深色 / 430 截图
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const PXL = { passwall2: 'PassWall 2', passwall: 'PassWall', homeproxy: 'HomeProxy', shadowsocksr: 'SSR Plus+' };
let S;
const base = (kind, cap, o = {}) => ({ kind, pxn: PXL[kind], cap, live: true, pending: false, moved: [], nd: {}, pv: [], swl: [], own: [], ov: {},
	groups: cap.two ? [] : ['负载均衡'], main: cap.two ? '新加坡' : '香港 01', nodes: cap.two ? [] : [{ n: '香港 01', d: 0, reg: 'HK' }, { n: '日本 02 一个名字很长很长的节点', d: 0, reg: 'JP' }],
	dev: {}, app: {}, geo: {}, site: {}, capp: {}, av: 'tv1', geos: [],
	apps: [{ id: 'netflix', name: 'Netflix', doms: ['netflix.com'] }, { id: 'youtube', name: 'YouTube', doms: ['youtube.com'] }],
	devices: [{ mac: 'aa:aa:aa:aa:aa:01', name: '小米手机', ip: '192.168.1.10', online: true }], ...o });
const fresh = (kind, cap, o) => ({ calls: [], kind, d: base(kind, cap, o) });
function handle(m, p) {
	S.calls.push({ m, p });
	const d = S.d;
	if (m === 'px' || m === 'overview') mock.PXM.px = { active: S.kind, list: [{ id: S.kind, name: PXL[S.kind], kind: 'other', enabled: true, running: true }] };
	if (m === 'split_get') return d;
	if (m === 'split_prep') { d.cap = { node: true, dev: true, geo: true, need: null, cur: '分流（路由器面板）' }; d.pending = true; return { ...d, restart: true }; }
	if (m === 'split_set') {
		if (d.cap.two && p.app && p.app.t && !['DIRECT', 'PROXY'].includes(p.app.t)) throw new Error(d.cap.lim.split('\n')[0]);
		if (p.app) { if (p.app.t) d.app[p.app.id] = p.app.t; else delete d.app[p.app.id]; }
		if (p.dev) { if (p.dev.t) d.dev[p.dev.mac] = { t: p.dev.t, ip: p.dev.ip, name: p.dev.name }; else delete d.dev[p.dev.mac]; }
		d.pending = true; return { ...d, restart: true };
	}
	if (m === 'split_restart') { d.pending = false; return { ok: true }; }
	if (m === 'split_learn') return S.learn || { run: false };
	if (m === 'split_apps') return { v: 'tv1', cats: { video: '视频', sys: '系统后台' }, apps: [['netflix', 'Netflix', 'Netflix', 'video', ['netflix.com']], ['youtube', 'YouTube', 'YouTube', 'video', ['youtube.com']]] };
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (x) => (b += x)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); const m = body.method.replace(/^panel\//, ''); return setTimeout(() => { try { J({ jsonrpc: '2.0', id: body.id, result: handle(m, body.params || {}) }); } catch (e) { J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }, 20); }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const lay = (page) => page.evaluate(() => {
	const bad = [];
	if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('横向滚动');
	document.querySelectorAll('#splBody .card, #splBody .notice, #splBody .btn, .modal .mact, .modal .splim').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && (r.right > innerWidth - 2 || r.left < 2)) bad.push('出界：' + el.textContent.trim().slice(0, 14)); });
	return bad;
});
const nav = (page) => page.evaluate(() => [...document.querySelectorAll('#sidenav button[data-p]')].map((b) => b.dataset.p));
const calls = (m) => S.calls.filter((c) => c.m === m);
const open = async (browser, w, h, dark, kind, cap, o) => {
	S = fresh(kind, cap, o);
	const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
	const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_tour', '9'); });
	await page.goto('http://localhost:8203/panel/?p=split'); await W(1700);
	return { ctx, page };
};
(async () => {
	await new Promise((r) => server.listen(8203, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`, tag = `${w}${dark ? 'd' : ''}`;
		// PassWall：主节点不是分流类型
		let { ctx, page } = await open(browser, w, h, dark, 'passwall', { node: true, dev: true, geo: true, need: 'shunt', cur: '美国 01 一个很长的节点名字' });
		const nv = await nav(page);
		ok('侧边栏：用 PassWall 时也有「分流」' + T, nv.includes('split'), nv.join('|'));
		ok('PassWall 主节点不是分流类型：只显示要换成分流节点、现在用的节点、按钮，不显示分栏' + T, /PassWall 的主节点要换成分流节点/.test(await page.textContent('#splBody')) && /美国 01/.test(await page.textContent('#splBody')) && await page.isVisible('#splPrep') && !(await page.locator('#splTab').count()));
		ok('排版' + T, !(await lay(page)).length, (await lay(page)).join('；'));
		await page.screenshot({ path: path.join(SHOT, `splpx-need-${tag}.png`) });
		await page.click('#splPrep'); await W(500);
		ok('点了先问：新建分流节点 默认走原来的 原来的设置先备份' + T, /新建一个分流节点 默认走「美国 01 一个很长的节点名字」。原来的设置先备份/.test(await page.textContent('.modal')));
		await page.locator('.modal button', { hasText: '换成分流节点' }).last().click(); await W(1000);
		ok('换好：调 split_prep，出现分栏和「重启 PassWall 后生效」' + T, calls('split_prep').length === 1 && await page.locator('#splTab').count() === 1 && /重启 PassWall 后生效/.test(await page.textContent('#splBody')));
		await ctx.close();
		// PassWall 2：能选节点
		({ ctx, page } = await open(browser, w, h, dark, 'passwall2', { node: true, dev: true, geo: true }, { live: false }));
		ok('PassWall 2：不显示「没在运行 选不了节点」（那条只给 OpenClash / Nikki）' + T, !/没在运行/.test(await page.textContent('#splBody')));
		await page.locator('#splTab button', { hasText: '软件' }).click(); await W(400);
		await page.locator('#splBody .splrow', { hasText: 'Netflix' }).first().click(); await W(600);
		const opts = await page.locator('.modal .mact').allTextContents();
		ok('PassWall 2 选去向：直连、代理（默认节点）、负载均衡、节点（没测过的不写毫秒）' + T, opts.some((x) => /代理/.test(x) && /香港 01/.test(x)) && opts.some((x) => /负载均衡/.test(x)) && opts.some((x) => /日本 02/.test(x)) && !opts.some((x) => /ms/.test(x)) && !(await page.locator('.modal .splim').count()), opts.join('|'));
		await page.screenshot({ path: path.join(SHOT, `splpx-pw2-pick-${tag}.png`) });
		await page.locator('.modal .mact', { hasText: '日本 02' }).click(); await W(800);
		ok('选了节点：保存、提示重启 PassWall 2' + T, calls('split_set').some((c) => c.p.app && c.p.app.t === '日本 02 一个名字很长很长的节点') && /重启 PassWall 2 后生效/.test(await page.textContent('#splBody')));
		ok('排版' + T, !(await lay(page)).length, (await lay(page)).join('；'));
		await page.screenshot({ path: path.join(SHOT, `splpx-pw2-${tag}.png`) });
		await page.click('#splRs'); await W(400);
		ok('现在重启：确认框写 PassWall 2' + T, /重启 PassWall 2/.test(await page.textContent('.modal')));
		await page.locator('.modal button', { hasText: /^重启$/ }).last().click(); await W(800);
		ok('点了才重启' + T, calls('split_restart').length === 1);
		await ctx.close();
		// SSR Plus+：只有直连 / 代理
		({ ctx, page } = await open(browser, w, h, dark, 'shadowsocksr', { node: false, dev: true, geo: false, two: true, lim: 'SSR Plus+ 只能选直连或代理' }));
		await page.locator('#splTab button', { hasText: '软件' }).click(); await W(400);
		await page.locator('#splBody .splrow', { hasText: 'Netflix' }).first().click(); await W(600);
		const o2 = await page.locator('.modal .mact').allTextContents();
		ok('SSR Plus+ 选去向：最上面写只能直连或代理，没有策略组和节点' + T, /SSR Plus\+ 只能选直连或代理/.test(await page.textContent('.modal .splim')) && o2.length === 3 && o2.some((x) => /代理/.test(x) && /新加坡/.test(x)), o2.join('|'));
		ok('排版' + T, !(await lay(page)).length, (await lay(page)).join('；'));
		await page.screenshot({ path: path.join(SHOT, `splpx-ssr-pick-${tag}.png`) });
		await page.locator('.modal [data-v="close"]').click(); await W(300);
		await ctx.close();
		// HomeProxy 绕过大陆模式：原因两行
		({ ctx, page } = await open(browser, w, h, dark, 'homeproxy', { node: false, dev: true, geo: false, two: true, lim: 'HomeProxy 现在的路由模式只能选直连或代理\n要选节点 在 HomeProxy 里把路由模式改成「自定义路由」' }));
		await page.locator('#splBody .splrow', { hasText: '小米手机' }).first().click(); await W(600);
		ok('HomeProxy 别的路由模式：写清怎么改才能选节点' + T, /把路由模式改成「自定义路由」/.test(await page.textContent('.modal .splim')));
		await page.screenshot({ path: path.join(SHOT, `splpx-hp-pick-${tag}.png`) });
		await ctx.close();
		// 老版本 PassWall 2 不能按设备
		({ ctx, page } = await open(browser, w, h, dark, 'passwall2', { node: true, dev: false, geo: true }));
		ok('老版本不能按设备：设备栏写清楚' + T, /这个版本的 PassWall 2 不能按设备分流 升级后再设/.test(await page.textContent('#splBody')));
		await ctx.close();
	}
	// 识别软件 DNS 模式
	let { ctx, page } = await open(browser, 390, 844, false, 'passwall2', { node: true, dev: true, geo: true });
	S.learn = { ip: '192.168.1.10', mac: 'aa:aa:aa:aa:aa:01', name: '小米手机', at: Date.now() / 1000, until: Date.now() / 1000 + 170, run: true, mode: 'dns', hosts: [['www.youtube.com', 3], ['api.game.example', 2]], dips: [['14.116.242.216', 3]], nohost: 5 };
	await page.locator('#splTab button', { hasText: '软件' }).click(); await W(400);
	await page.locator('#splBody [data-sa="learn"]').click(); await W(600);
	const lm = await page.locator('.modal').last();
	if (await page.locator('.modal .mact', { hasText: '小米手机' }).count()) { await page.locator('.modal .mact', { hasText: '小米手机' }).first().click(); await W(1500); }
	await W(1500);
	const lt = await page.textContent('.modal');
	ok('识别软件 DNS 模式：只有 IP 的那组叫「只有 IP 的连接」，不写「还有 x 个连接只有 IP」', /只有 IP 的连接/.test(lt) && !/直连的 IP/.test(lt) && !/个连接只有 IP 没有网址/.test(lt), lt.slice(0, 300));
	await page.screenshot({ path: path.join(SHOT, 'splpx-learn-dns-390.png') });
	await ctx.close();
	await browser.close(); server.close();
	for (const [n, c, note] of results) console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '（' + String(note).slice(0, 300) + '）'));
	if (problems.length) console.log('问题：\n' + [...new Set(problems)].slice(0, 20).join('\n'));
	console.log(`通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(0);
})();

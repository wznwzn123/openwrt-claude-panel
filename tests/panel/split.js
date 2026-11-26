// 6.0 第 69 项（面板）：分流——设备 / 软件 / 国家和地区三栏；点一行选跟随全局、直连、代理（主策略组）或某个策略组；
// 要重启才生效时顶上提示「现在重启」，点了才重启；策略组没了的记录；不支持的插件说清楚；320 / 390 / 430、深色
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
let S;
const fresh = (o = {}) => ({ calls: [], d: { kind: 'openclash', live: true, groups: ['节点选择', '🎬 流媒体（Netflix、Disney+、HBO 这些都走这里的超长名字）', '♻️ 自动选择'], main: '节点选择', pending: false, moved: [],
	dev: { 'aa:aa:aa:aa:aa:09': { t: 'DIRECT', ip: '192.168.1.50', name: '旧电视' } }, app: { netflix: '🎬 流媒体（Netflix、Disney+、HBO 这些都走这里的超长名字）' }, geo: {},
	apps: [{ id: 'chatgpt', name: 'ChatGPT' }, { id: 'netflix', name: 'Netflix' }, { id: 'meta', name: 'Facebook / Instagram / WhatsApp' }, { id: 'bilibili', name: '哔哩哔哩' }],
	geos: [{ id: 'CN', name: '中国大陆' }, { id: 'JP', name: '日本' }, { id: 'US', name: '美国' }],
	devices: [{ mac: 'aa:aa:aa:aa:aa:01', name: '小米手机', ip: '192.168.1.10', online: true }, { mac: 'aa:aa:aa:aa:aa:02', name: '一台名字非常非常长的笔记本电脑设备', ip: '192.168.1.11', online: true }], ...o } });
function handle(m, p) {
	S.calls.push({ m, p });
	const d = S.d;
	if (m === 'split_get') return d;
	if (m === 'split_set') {
		const k = p.dev ? 'dev' : p.app ? 'app' : 'geo', x = p[k];
		if (k === 'dev') { if (x.t) d.dev[x.mac] = { t: x.t, ip: x.ip, name: x.name }; else delete d.dev[x.mac]; }
		else if (x.t) d[k][x.id] = x.t; else delete d[k][x.id];
		d.pending = true;
		return { ...d, restart: true };
	}
	if (m === 'split_restart') { d.pending = false; return { ok: true }; }
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (x) => (b += x)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); const m = body.method.replace(/^panel\//, ''); return setTimeout(() => { try { J({ jsonrpc: '2.0', id: body.id, result: handle(m, body.params || {}) }); } catch (e) { J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }, 60); }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const lay = (page) => page.evaluate(() => {
	const bad = [];
	if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('横向滚动');
	document.querySelectorAll('#splBody .splrow, #splBody .chip, #splBody .notice, .modal .mact').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && (r.right > innerWidth - 4 || r.left < 4)) bad.push('出界：' + el.textContent.slice(0, 14)); });
	document.querySelectorAll('#splBody .splrow').forEach((r) => { const b = r.querySelector('b'), p = r.querySelector('.pill'); if (b && p && b.getBoundingClientRect().right > p.getBoundingClientRect().left + 1) bad.push('名字压到去向：' + b.textContent); });
	document.querySelectorAll('#splTab .chip').forEach((c) => { if (c.scrollWidth > c.clientWidth + 1) bad.push('分栏字截断：' + c.textContent); });
	return bad;
});
(async () => {
	await new Promise((r) => server.listen(8195, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S = fresh();
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8195/panel/?p=split'); await W(1500);
		let t = await page.textContent('#splBody');
		ok('三栏：设备、软件、国家和地区，一行放下' + T, (await page.locator('#splTab .chip').count()) === 3 && await page.evaluate(() => new Set([...document.querySelectorAll('#splTab .chip')].map((c) => Math.round(c.getBoundingClientRect().top))).size === 1));
		ok('设备：设了分流的在前（离线的也列出），写去向' + T, /^旧电视/.test((await page.textContent('#splBody .splrow')).trim()) && /离线/.test(t) && /直连/.test(t) && /跟随全局/.test(t), t.slice(0, 160));
		let l = await lay(page); ok('不错位、不出界' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `split-${w}${dark ? '-dark' : ''}.png`) });
		// 软件栏
		await page.click('[data-st="app"]'); await W(200);
		t = await page.textContent('#splBody');
		ok('软件栏：Netflix 走「流媒体」组（长名字不撑出去）' + T, /Netflix/.test(t) && /流媒体/.test(t));
		l = await lay(page); ok('软件栏不错位' + T, !l.length, l.join('；'));
		await page.click('[data-sk="app"][data-sid="chatgpt"]'); await W(300);
		const opts = await page.$$eval('.modal .mact', (b) => b.map((x) => x.textContent.trim()));
		ok('选去向：跟随全局、直连、代理（主策略组）、其他策略组；现在的打勾' + T, opts[0] === '跟随全局✓' && opts[1] === '直连' && opts[2] === '代理（节点选择）' && opts.length === 5 && !opts.some((x) => x === '节点选择'), JSON.stringify(opts));
		l = await lay(page); ok('选项不出界' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `split-pick-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-v="o:PROXY"]'); await W(400);
		ok('选了代理：告诉路由器，提示结果' + T, S.calls.some((c) => c.m === 'split_set' && c.p.app && c.p.app.id === 'chatgpt' && c.p.app.t === 'PROXY') && /已设置：ChatGPT → 代理/.test(await page.textContent('#toast')));
		ok('要重启才生效：顶上提示「现在重启」' + T, /重启 OpenClash 后生效/.test(await page.textContent('#splBody')) && await page.isVisible('#splRs'));
		l = await lay(page); ok('提示条不错位' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `split-pend-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('#splRs'); await W(300);
		ok('重启前确认：断网十几秒' + T, /断网十几秒/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="true"]'); await W(400);
		ok('重启了，提示消失' + T, S.calls.some((c) => c.m === 'split_restart') && !(await page.$('#splRs')));
		// 国家栏、设备设置
		await page.click('[data-st="geo"]'); await W(200);
		await page.click('[data-sk="geo"][data-sid="JP"]'); await W(300); await page.click('.modal [data-v="o:♻️ 自动选择"]'); await W(400);
		ok('国家：日本 → 自动选择' + T, S.d.geo.JP === '♻️ 自动选择' && /自动选择/.test(await page.textContent('#splBody')));
		await page.click('[data-st="dev"]'); await W(200);
		await page.click('[data-sk="dev"][data-sid="aa:aa:aa:aa:aa:01"]'); await W(300); await page.click('.modal [data-v="o:DIRECT"]'); await W(400);
		ok('设备：带上 IP 和名字' + T, S.calls.some((c) => c.m === 'split_set' && c.p.dev && c.p.dev.mac === 'aa:aa:aa:aa:aa:01' && c.p.dev.ip === '192.168.1.10' && c.p.dev.name === '小米手机' && c.p.dev.t === 'DIRECT'));
		await page.click('[data-sk="dev"][data-sid="aa:aa:aa:aa:aa:09"]'); await W(300); await page.click('.modal [data-v="o:"]'); await W(400);
		ok('改回跟随全局：去掉' + T, !S.d.dev['aa:aa:aa:aa:aa:09']);
		await ctx.close();
	}
	// 策略组没了、插件没在跑、Nikki、不支持
	{
		S = fresh({ kind: 'nikki', live: false, moved: [{ g: '🎬 流媒体', at: Math.floor(Date.now() / 1000) - 3600 }], pending: true });
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（Nikki）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8195/panel/?p=split'); await W(1500);
		const t = await page.textContent('#splBody');
		ok('Nikki：「重启 Nikki 后生效」；没在运行说明；策略组没了的记录', /重启 Nikki 后生效/.test(t) && /Nikki 没在运行/.test(t) && /策略组「🎬 流媒体」没了，已改走代理（节点选择）/.test(t), t.slice(0, 200));
		await page.screenshot({ path: path.join(SHOT, 'split-nikki.png') });
		S.d = { kind: null };
		await page.reload(); await W(1500);
		ok('没装 OpenClash / Nikki：说只支持这两个', /分流只支持 OpenClash 和 Nikki/.test(await page.textContent('#splBody')));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

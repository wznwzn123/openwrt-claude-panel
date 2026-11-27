// 6.0 第 69 项（面板）：分流——设备 / 软件 / 网站 / 国家地区四栏（用户 11/27 加网站、单个节点、自己加软件、识别软件）；点一行选跟随全局、直连、代理（主策略组）或某个策略组；
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
	apps: [{ id: 'chatgpt', name: 'ChatGPT', doms: ['openai.com', 'chatgpt.com'] }, { id: 'netflix', name: 'Netflix', doms: ['netflix.com'] }, { id: 'youtube', name: 'YouTube', doms: ['youtube.com', 'ytimg.com'] }, { id: 'meta', name: 'Facebook / Instagram / WhatsApp', doms: ['facebook.com'] }, { id: 'bilibili', name: '哔哩哔哩', doms: ['bilibili.com'] }],
	site: {}, capp: {}, nodes: [{ n: '🇯🇵 日本 01', d: 80, reg: 'JP' }, { n: '🇯🇵 日本 02 一个名字很长很长的节点 IPLC 专线 3x', d: 0, reg: 'JP' }, { n: '🇭🇰 香港 02', d: 45, reg: 'HK' }, { n: '神秘节点', d: 120, reg: '?' }],
	geos: [{ id: 'CN', name: '中国大陆' }, { id: 'JP', name: '日本' }, { id: 'US', name: '美国' }],
	devices: [{ mac: 'aa:aa:aa:aa:aa:01', name: '小米手机', ip: '192.168.1.10', online: true }, { mac: 'aa:aa:aa:aa:aa:02', name: '一台名字非常非常长的笔记本电脑设备', ip: '192.168.1.11', online: true }], ...o } });
function handle(m, p) {
	S.calls.push({ m, p });
	const d = S.d;
	if (m === 'split_get') return d;
	if (m === 'whoami' && S.role) return { ...mock.respond('whoami', p), role: S.role, perms: S.perms || [] };
	if (m === 'split_learn') {
		if (p.act === 'start') S.learn = { ip: p.ip, name: p.name, at: Date.now() / 1000, until: Date.now() / 1000 + 180, run: true, hosts: [], nohost: 0 };
		else if (p.act === 'stop') S.learn.run = false;
		else if (S.learn) { S.learn.hosts = [['www.youtube.com', 5], ['i.ytimg.com', 3], ['api.game.example', 4], ['cdn.game.example', 2], ['login.othergame.co.jp', 1]]; S.learn.nohost = 2; }
		return S.learn || { run: false };
	}
	if (m === 'split_set') {
		const dom = (v) => String(v || '').toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#:].*$/, '').replace(/^www\./, '');
		if (p.site) { if (p.site.old) delete d.site[dom(p.site.old)]; if (p.site.t) d.site[dom(p.site.d)] = p.site.t; else delete d.site[dom(p.site.d)]; d.pending = true; return { ...d, restart: true }; }
		if (p.capp) { const x = p.capp, id = x.id || 'c' + Object.keys(d.capp).length; if (x.del) delete d.capp[id]; else d.capp[id] = { name: x.name ?? d.capp[id]?.name, doms: (x.doms ?? d.capp[id]?.doms).map(dom), t: 't' in x ? x.t || null : d.capp[id]?.t ?? null }; return { ...d, restart: true }; }
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
		ok('四栏：设备、软件、网站、国家地区，等宽一行放下、不截断' + T, (await page.locator('#splTab button').count()) === 4 && await page.evaluate(() => { const b = [...document.querySelectorAll('#splTab button')], r = b.map((c) => c.getBoundingClientRect()); return b.map((x) => x.textContent).join() === '设备,软件,网站,国家地区' && new Set(r.map((x) => Math.round(x.top))).size === 1 && Math.max(...r.map((x) => x.width)) - Math.min(...r.map((x) => x.width)) <= 1 && !b.some((x) => x.scrollWidth > x.clientWidth + 1); }));
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
		ok('选去向：跟随全局、直连、代理（主策略组）、其他策略组、按地区分的节点；现在的打勾' + T, opts[0] === '跟随全局✓' && opts[1] === '直连' && opts[2] === '代理节点选择' && opts.length === 9 && opts.includes('🇯🇵 日本 0180 ms') && !opts.some((x) => x === '节点选择'), JSON.stringify(opts));
		const heads = await page.$$eval('.modal .mgt', (b) => b.map((x) => x.textContent));
		ok('节点按地区分组：节点多的地区在前，认不出地区的放最后' + T, JSON.stringify(heads) === JSON.stringify(['策略组', '节点 · 日本', '节点 · 香港', '节点 · 其他']), JSON.stringify(heads));
		l = await lay(page); ok('选项不出界' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `split-pick-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-v="o:🇯🇵 日本 01"]'); await W(400);
		ok('选单个节点：告诉路由器，提示结果' + T, S.calls.some((c) => c.m === 'split_set' && c.p.app && c.p.app.id === 'chatgpt' && c.p.app.t === '🇯🇵 日本 01') && /已设置：ChatGPT → 🇯🇵 日本 01/.test(await page.textContent('#toast')));
		await page.click('[data-sk="app"][data-sid="chatgpt"]'); await W(300);
		await page.click('.modal [data-v="o:PROXY"]'); await W(400);
		ok('选了代理：告诉路由器，提示结果' + T, S.calls.some((c) => c.m === 'split_set' && c.p.app && c.p.app.id === 'chatgpt' && c.p.app.t === 'PROXY') && /已设置：ChatGPT → 代理/.test(await page.textContent('#toast')));
		ok('要重启才生效：顶上提示「现在重启」' + T, /重启 OpenClash 后生效/.test(await page.textContent('#splBody')) && await page.isVisible('#splRs'));
		l = await lay(page); ok('提示条不错位' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `split-pend-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('#splRs'); await W(300);
		ok('重启前确认：断网十几秒' + T, /断网十几秒/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="true"]'); await W(400);
		ok('重启了，提示消失' + T, S.calls.some((c) => c.m === 'split_restart') && !(await page.$('#splRs')));
		// 网站栏：自己加网站
		await page.click('[data-st="site"]'); await W(200);
		ok('网站栏：还没有加网站' + T, /还没有加网站/.test(await page.textContent('#splBody')));
		await page.click('[data-sa="site"]'); await W(300);
		await page.fill('.modal input', 'https://www.Example.com/a b.example.org'); await page.click('.modal [data-ok]'); await W(400);
		ok('添加网站：先问走哪里（两个网站）' + T, /2 个网站走哪里/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="o:DIRECT"]'); await W(800);
		ok('添加网站：两个都加上，提示结果' + T, S.d.site['example.com'] === 'DIRECT' && S.d.site['b.example.org'] === 'DIRECT' && /已添加 2 个网站/.test(await page.textContent('#toast')), JSON.stringify(S.d.site));
		l = await lay(page); ok('网站栏不错位' + T, !l.length, l.join('；'));
		await page.click('[data-sk="site"][data-sid="example.com"]'); await W(300);
		ok('点网站：能换去向、改网址、删除' + T, await page.isVisible('.modal [data-v="x:edit"]') && await page.isVisible('.modal [data-v="x:del"]'));
		await page.click('.modal [data-v="x:del"]'); await W(300); await page.click('.modal [data-v="true"]'); await W(400);
		ok('删网站：确认后删掉' + T, !S.d.site['example.com'] && S.calls.some((c) => c.m === 'split_set' && c.p.site && c.p.site.d === 'example.com' && c.p.site.t === ''));
		// 软件栏：自己加软件
		await page.click('[data-st="app"]'); await W(200);
		await page.click('[data-sa="capp"]'); await W(300);
		await page.fill('.modal [data-cn]', '我的游戏'); await page.fill('.modal [data-cd]', 'game.example\ncdn.game.example'); await page.click('.modal [data-ok]'); await W(400);
		await page.click('.modal [data-v="o:🇭🇰 香港 02"]'); await W(500);
		const ca = S.calls.filter((c) => c.m === 'split_set' && c.p.capp).pop();
		ok('添加软件：名字、网址、走哪里一起交给路由器' + T, ca && ca.p.capp.name === '我的游戏' && JSON.stringify(ca.p.capp.doms) === '["game.example","cdn.game.example"]' && ca.p.capp.t === '🇭🇰 香港 02' && /我的游戏/.test(await page.textContent('#splBody')) && /自己加的/.test(await page.textContent('#splBody')));
		await page.click('[data-sk="capp"]'); await W(300);
		ok('点自己的软件：能换去向、改名字和网址、删除' + T, await page.isVisible('.modal [data-v="x:edit"]') && await page.isVisible('.modal [data-v="x:del"]'));
		await page.click('.modal [data-v="close"]'); await W(300);
		// 识别软件（学习模式）
		await page.click('[data-sa="learn"]'); await W(300);
		ok('识别软件：先选在线的设备' + T, /识别哪台设备/.test(await page.textContent('.modal')) && /小米手机/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="d:aa:aa:aa:aa:aa:01"]'); await W(500);
		ok('开始识别：告诉路由器这台的 IP；写着在这台设备上打开 App、还剩多久' + T, S.calls.some((c) => c.m === 'split_learn' && c.p.act === 'start' && c.p.ip === '192.168.1.10') && /在这台设备上打开要分流的 App/.test(await page.textContent('.modal')) && /还剩 [23]:/.test(await page.textContent('.modal')));
		await W(2800);
		const lt = await page.textContent('.modal');
		ok('认得的写软件名，其他的按主域名合在一起，只有 IP 的说清楚' + T, /认出来的软件/.test(lt) && /YouTube/.test(lt) && /game\.example/.test(lt) && /othergame\.co\.jp/.test(lt) && !/i\.ytimg\.com/.test(lt) && /2 个连接只有 IP/.test(lt), lt.slice(0, 300));
		l = await lay(page); ok('识别结果不出界' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `split-learn-${w}${dark ? '-dark' : ''}.png`) });
		ok('没勾选时「加成软件」不能点' + T, await page.isDisabled('.modal [data-add]'));
		await page.check('.modal [data-lo="game.example"]'); await W(200);
		await page.click('.modal [data-add]'); await W(400);
		ok('勾选后加成软件：网址带进来，起名字' + T, (await page.inputValue('.modal [data-cd]')) === 'game.example');
		await page.fill('.modal [data-cn]', '另一个游戏'); await page.click('.modal [data-ok]'); await W(400);
		await page.click('.modal [data-v="o:DIRECT"]'); await W(500);
		ok('学到的网址加成了软件' + T, Object.values(S.d.capp).some((c) => c.name === '另一个游戏' && c.doms.join() === 'game.example' && c.t === 'DIRECT'));
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
		S = fresh({ kind: 'nikki', live: false, moved: [{ g: '🎬 流媒体', at: Math.floor(Date.now() / 1000) - 3600 }], pending: true, nd: { '🇯🇵 日本 01': Math.floor(Date.now() / 1000) - 300 } });
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（Nikki）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8195/panel/?p=split'); await W(1500);
		const t = await page.textContent('#splBody');
		ok('Nikki：「重启 Nikki 后生效」；没在运行说明；策略组没了的记录', /重启 Nikki 后生效/.test(t) && /Nikki 没在运行/.test(t) && /策略组「🎬 流媒体」没了，已改走代理（节点选择）/.test(t), t.slice(0, 200));
		ok('选的节点连不上：写「暂时改走代理」（11/27 全面检查第 14 条）', /节点「🇯🇵 日本 01」连不上，暂时改走代理（节点选择）/.test(t), t.slice(0, 300));
		await page.screenshot({ path: path.join(SHOT, 'split-nikki.png') });
		S.d = { kind: null };
		await page.reload(); await W(1500);
		ok('没装 OpenClash / Nikki：说只支持这两个', /分流只支持 OpenClash 和 Nikki/.test(await page.textContent('#splBody')));
		await ctx.close();
	}
	// 家人（有代理权限）：没有「识别软件」（能看到别人访问了哪些网站，只有主账号能用）
	{
		S = fresh(); S.role = 'sub'; S.perms = ['proxy'];
		const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_role', JSON.stringify({ role: 'sub', perms: ['proxy'] })); });
		await page.goto('http://localhost:8195/panel/?p=split'); await W(1500);
		await page.click('[data-st="app"]'); await W(200);
		ok('家人：软件栏没有「识别软件」，有「添加软件」', !(await page.$('[data-sa="learn"]')) && await page.isVisible('[data-sa="capp"]'));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

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
	av: 'tv1', site: {}, capp: {}, nodes: [{ n: '🇯🇵 日本 01', d: 80, reg: 'JP' }, { n: '🇯🇵 日本 02 一个名字很长很长的节点 IPLC 专线 3x', d: 0, reg: 'JP' }, { n: '🇭🇰 香港 02', d: 45, reg: 'HK' }, { n: '神秘节点', d: 120, reg: '?' }],
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
		else if (S.learn) { S.learn.hosts = [['www.youtube.com', 5], ['i.ytimg.com', 3], ['api.game.example', 4], ['cdn.game.example', 2], ['login.othergame.co.jp', 1], ['mmbiz.weixin.qq.com', 6], ['captive.apple.com', 2]]; S.learn.dips = [['14.116.242.216', 3], ['240e:e9:6002::1', 1]]; S.learn.nohost = 2; }
		return S.learn || { run: false };
	}
	if (m === 'split_apps') { S.tblCalls = (S.tblCalls || 0) + 1; return p.v === 'tv1' ? { v: 'tv1', same: true } : { v: 'tv1', cats: { social: '社交', video: '视频', game: '游戏', sys: '系统后台' }, apps: [['wechat', '微信', 'WeChat Weixin', 'social', 'weixin wx', ['weixin.qq.com', 'wechat.com']], ['iqiyi', '爱奇艺', 'iQIYI', 'video', 'aiqiyi aqy', ['iqiyi.com', 'qy.net']], ['tgame', '腾讯游戏', 'Tencent Games 王者荣耀', 'game', 'tengxunyouxi txyx', ['game.qq.com']], ['bilibili', '哔哩哔哩', 'Bilibili B站', 'video', 'bilibili blbl', ['bilibili.com']], ['sys_check', '联网检测', 'Connectivity', 'sys', '', ['captive.apple.com']]] }; }
	if (m === 'split_set') {
		const dom = (v) => String(v || '').toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#:].*$/, '').replace(/^www\./, '');
		if (p.site) { if (p.site.old) delete d.site[dom(p.site.old)]; if (p.site.t) d.site[dom(p.site.d)] = p.site.t; else delete d.site[dom(p.site.d)]; d.pending = true; return { ...d, restart: true }; }
		if (p.capp) { const x = p.capp, id = x.id || 'c' + Object.keys(d.capp).length; if (x.del) delete d.capp[id]; else d.capp[id] = { name: x.name ?? d.capp[id]?.name, doms: (x.doms ?? d.capp[id]?.doms).map(dom), t: 't' in x ? x.t || null : d.capp[id]?.t ?? null }; return { ...d, restart: true }; }
		const k = p.dev ? 'dev' : p.app ? 'app' : 'geo', x = p[k];
		if (k === 'dev') { if (x.t) d.dev[x.mac] = { t: x.t, ip: x.ip, name: x.name }; else delete d.dev[x.mac]; }
		else if (x.t) { d[k][x.id] = x.t; if (k === 'app' && !d.apps.some((a) => a.id === x.id)) d.apps.push({ id: x.id, name: { wechat: '微信', iqiyi: '爱奇艺' }[x.id] || x.id, doms: [], tbl: true }); } else delete d[k][x.id];
		d.pending = true;
		return { ...d, restart: true };
	}
	if (m === 'split_restart') { d.pending = false; return { ok: true }; }
	if (m === 'split_own_move') {
		const mv = (d.own || []).filter((x) => p.keys.includes(x.k));
		d.own = d.own.filter((x) => !p.keys.includes(x.k));
		for (const x of mv) { if (x.tag) { const c = Object.values(d.capp).find((y) => y.name === x.tag); if (c) c.doms.push(x.v); else d.capp['c' + Object.keys(d.capp).length] = { name: x.tag, doms: [x.v], t: x.t }; } else if (/^DOMAIN/.test(x.ty)) d.site[x.v] = x.t; else if (x.ty === 'SRC-IP-CIDR') { const dv = d.devices.find((y) => y.ip + '/32' === x.v); d.dev[dv.mac] = { t: x.t, ip: dv.ip, name: '' }; } }
		d.ov = {}; d.pending = true;
		return { ...d, restart: true, movedN: mv.length, skip: [] };
	}
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
		ok('一打开分流就去拿官网的「网址 → App」表（用户 11/28：不能点几次才出来）' + T, S.tblCalls === 1);
		let l = await lay(page); ok('不错位、不出界' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `split-${w}${dark ? '-dark' : ''}.png`) });
		// 软件栏
		await page.click('[data-st="app"]'); await W(200);
		t = await page.textContent('#splBody');
		ok('软件栏：Netflix 走「流媒体」组（长名字不撑出去）' + T, /Netflix/.test(t) && /流媒体/.test(t));
		l = await lay(page); ok('软件栏不错位' + T, !l.length, l.join('；'));
		// 软件栏搜索（用户 11/28：打字即出；中文名、拼音、英文、网址都能搜；官网表里几百个）
		const qph = await page.getAttribute('#splQ', 'placeholder');
		ok('软件栏有搜索框，写着一共多少个软件（系统后台的不算）' + T, qph === '搜软件 共 4 个', qph);
		const qs = async (v) => { await page.fill('#splQ', v); await W(150); return page.textContent('#splAL'); };
		let qt = await qs('aqy');
		ok('搜拼音首字母「aqy」：出来爱奇艺（官网表里的，写分类），别的不出来；光标还在框里' + T, /爱奇艺/.test(qt) && /视频/.test(qt) && !/ChatGPT/.test(qt) && (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'splQ', qt);
		qt = await qs('bili');
		ok('搜「bili」：内置的哔哩哔哩只出一个（不跟官网表里的重复）' + T, (qt.match(/哔哩哔哩/g) || []).length === 1, qt);
		ok('搜中文「微」出微信；搜英文「netf」出 Netflix；搜网址「qy.net」出爱奇艺' + T, /微信/.test(await qs('微')) && /Netflix/.test(await qs('netf')) && /爱奇艺/.test(await qs('qy.net')));
		ok('搜不到写「没有搜到」' + T, /没有搜到/.test(await qs('zzzzz')));
		qt = await qs('王者');
		ok('搜别名「王者」出腾讯游戏' + T, /腾讯游戏/.test(qt), qt);
		l = await lay(page); ok('搜索结果不错位' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `split-search-${w}${dark ? '-dark' : ''}.png`) });
		await qs('爱奇艺');
		await page.click('[data-sk="tapp"][data-sid="iqiyi"]'); await W(400);
		await page.click('.modal [data-v="o:DIRECT"]'); await W(500);
		ok('点官网表里的爱奇艺：选去向，告诉路由器编号' + T, S.calls.some((c) => c.m === 'split_set' && c.p.app && c.p.app.id === 'iqiyi' && c.p.app.t === 'DIRECT') && /已设置：爱奇艺 → 直连/.test(await page.textContent('#toast')));
		qt = await qs('');
		ok('清空搜索：回到原来的列表，选过的爱奇艺也在里面' + T, /ChatGPT/.test(qt) && /爱奇艺/.test(qt) && /直连/.test(await page.textContent('[data-sk="app"][data-sid="iqiyi"]')), qt.slice(0, 200));
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
		ok('开始识别：告诉路由器这台的 MAC 和 IP；写着在这台设备上打开 App、还剩多久' + T, S.calls.some((c) => c.m === 'split_learn' && c.p.act === 'start' && c.p.ip === '192.168.1.10' && c.p.mac === 'aa:aa:aa:aa:aa:01') && /在这台设备上打开要分流的 App/.test(await page.textContent('.modal')) && /还剩 [23]:/.test(await page.textContent('.modal')));
		const n0 = S.calls.filter((c) => c.m === 'split_learn').length;
		await W(2800);
		ok('每秒刷新一次（用户 11/28）' + T, S.calls.filter((c) => c.m === 'split_learn').length - n0 >= 2, S.calls.filter((c) => c.m === 'split_learn').length - n0);
		const lt = await page.textContent('.modal');
		ok('认得的写软件名（官网表里的微信也认得），其他的按主域名合在一起，只有 IP 的说清楚' + T, /认出来的软件/.test(lt) && /YouTube/.test(lt) && /微信/.test(lt) && /game\.example/.test(lt) && /othergame\.co\.jp/.test(lt) && !/i\.ytimg\.com/.test(await page.textContent('.modal [data-g="other"]')) && /i\.ytimg\.com/.test(await page.textContent('.modal [data-g="app"]')) && /2 个连接只有 IP/.test(lt), lt.slice(0, 400));
		ok('系统后台、直连的 IP 单独一组，默认收起，标数量' + T, /系统后台/.test(lt) && /直连的 IP/.test(lt) && !(await page.isVisible('.modal [data-g="sys"] .mlist')) && !(await page.isVisible('.modal [data-g="ip"] .mlist')));
		await page.click('.modal [data-gt="ip"]'); await W(300);
		ok('点开直连的 IP：列出 IP 和次数，刷新后照样开着' + T, /14\.116\.242\.216/.test(await page.textContent('.modal [data-g="ip"]')) && /3 次/.test(await page.textContent('.modal [data-g="ip"]')) && (await W(1300), await page.isVisible('.modal [data-g="ip"] .mlist')));
		await page.screenshot({ path: path.join(SHOT, `split-learn-ip-${w}${dark ? '-dark' : ''}.png`) });
		await page.fill('.modal [data-lq]', 'wx'); await W(300);
		let lq = await page.textContent('.modal [data-lb]');
		ok('搜索框：搜拼音首字母「wx」只剩微信' + T, /微信/.test(lq) && !/YouTube/.test(lq) && !/game\.example/.test(lq), lq.slice(0, 200));
		await page.fill('.modal [data-lq]', 'captive'); await W(300);
		ok('搜网址：收起的系统后台也搜得到（搜的时候展开）' + T, await page.isVisible('.modal [data-g="sys"] .mlist') && /联网检测/.test(await page.textContent('.modal [data-lb]')));
		await page.screenshot({ path: path.join(SHOT, `split-learn-q-${w}${dark ? '-dark' : ''}.png`) });
		await page.fill('.modal [data-lq]', 'zzzz'); await W(300);
		ok('没搜到写「没有搜到」' + T, /没有搜到/.test(await page.textContent('.modal [data-lb]')));
		await page.fill('.modal [data-lq]', ''); await W(300);
		l = await lay(page); ok('识别结果不出界' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `split-learn-${w}${dark ? '-dark' : ''}.png`) });
		ok('没勾选时「加成软件」不能点' + T, await page.isDisabled('.modal [data-add]'));
		await page.check('.modal [data-lo="game.example"]'); await W(200);
		await page.click('.modal [data-add]'); await W(400);
		ok('勾选后加成软件：网址带进来，起名字' + T, (await page.inputValue('.modal [data-cd]')) === 'game.example');
		await page.fill('.modal [data-cn]', '另一个游戏'); await page.click('.modal [data-ok]'); await W(400);
		await page.click('.modal [data-v="o:DIRECT"]'); await W(500);
		ok('学到的网址加成了软件' + T, Object.values(S.d.capp).some((c) => c.name === '另一个游戏' && c.doms.join() === 'game.example' && c.t === 'DIRECT'));
		// 官网表里认出来的软件（分流里还没有）：点了选去向，告诉路由器它的编号
		await page.click('[data-sa="learn"]'); await W(300); await page.click('.modal [data-v="d:aa:aa:aa:aa:aa:01"]'); await W(2600);
		ok('第二次打开：官网的表不再下载（版本没变）' + T, S.tblCalls === 1, S.tblCalls);
		await page.click('.modal [data-la="wechat"]'); await W(500);
		ok('点官网表里的微信：选去向（标题写名字）' + T, /微信/.test(await page.textContent('.modal .sheethead')));
		await page.click('.modal [data-v="o:DIRECT"]'); await W(500);
		ok('选了：告诉路由器编号 wechat' + T, S.calls.some((c) => c.m === 'split_set' && c.p.app && c.p.app.id === 'wechat' && c.p.app.t === 'DIRECT') && /已设置：微信 → 直连/.test(await page.textContent('#toast')));
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
	// 选的单个节点：挂了换哪个 + 最近切换（用户 11/28，跟特色功能「节点挂了自动换」一样）
	for (const [w, h, dark] of [[320, 568, false], [390, 844, true], [430, 932, false]]) {
		const now = Math.floor(Date.now() / 1000);
		S = fresh({ pv: [{ n: '🇹🇼台湾03 专线 3x（一个很长很长的节点名字）', d: 49, sibs: 3, to: '🇹🇼台湾02 专线 3x', td: 61, same: true }, { n: '🇯🇵 日本 01', d: 0, sibs: 0, to: null, td: 0 }], swl: [{ at: now - 600, a: '🇹🇼台湾03 专线 3x', b: '🇹🇼台湾02 专线 3x' }, { at: now - 86400, a: '🇹🇼台湾02 专线 3x', b: '🇹🇼台湾03 专线 3x' }] });
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（节点预告）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8195/panel/?p=split'); await W(1500);
		const r = await page.evaluate(() => { const c = document.querySelector('.splpvc'); if (!c) return null; const b = c.getBoundingClientRect(); return { t: c.textContent, inside: [...c.querySelectorAll('*')].every((e) => { const x = e.getBoundingClientRect(); return !x.width || (x.left >= b.left - 1 && x.right <= b.right + 1); }), sw: document.documentElement.scrollWidth <= innerWidth }; });
		ok(`［${w}${dark ? ' 深色' : ''}］选的节点：写多少毫秒、挂了换哪个；没有同地区的写不换；最近切换；不超出卡片`, r && /49 ms/.test(r.t) && /挂了换「🇹🇼台湾02 专线 3x」 61 ms/.test(r.t) && /没有同地区的节点，挂了不换/.test(r.t) && /最近切换/.test(r.t) && /🇹🇼台湾03 专线 3x → 🇹🇼台湾02 专线 3x/.test(r.t) && r.inside && r.sw, JSON.stringify(r));
		await page.locator('.splpvc').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(SHOT, `split-pv-${w}${dark ? '-dark' : ''}.png`) });
		await ctx.close();
	}
	// 策略组没了、插件没在跑、Nikki、不支持
	{
		S = fresh({ kind: 'nikki', live: false, moved: [{ g: '🎬 流媒体', at: Math.floor(Date.now() / 1000) - 3600 }], pending: true, nd: { '🇯🇵 日本 01': { at: Math.floor(Date.now() / 1000) - 300, to: '🇯🇵 日本 02' }, '🇹🇼台湾03 专线 3x': { at: Math.floor(Date.now() / 1000) - 60, to: null } } });
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（Nikki）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8195/panel/?p=split'); await W(1500);
		const t = await page.textContent('#splBody');
		ok('Nikki：「重启 Nikki 后生效」；没在运行说明；策略组没了的记录', /重启 Nikki 后生效/.test(t) && /Nikki 没在运行/.test(t) && /策略组「🎬 流媒体」没了，已改走代理（节点选择）/.test(t), t.slice(0, 200));
		ok('选的节点连不上：写换到哪个；同地区都连不上写「先不换」（用户 11/28）', /节点「🇯🇵 日本 01」连不上，暂时换到「🇯🇵 日本 02」/.test(t) && /节点「🇹🇼台湾03 专线 3x」连不上，同地区的节点也连不上，先不换/.test(t), t.slice(0, 300));
		await page.screenshot({ path: path.join(SHOT, 'split-nikki.png') });
		S.d = { kind: null };
		await page.reload(); await W(1500);
		ok('没装 OpenClash / Nikki：说只支持这两个', /分流只支持 OpenClash 和 Nikki/.test(await page.textContent('#splBody')));
		await ctx.close();
	}
	// 覆写里你自己写的规则（用户 11/28：显示在分流里标「覆写里的」；撞了按你写的走；点「交给分流管」才搬过来）；订阅合集里的节点选不了
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`, HK = '🇭🇰 香港 02';
		S = fresh({ own: [
			{ k: 'f1:DOMAIN-SUFFIX,netflix.com,DIRECT', ty: 'DOMAIN-SUFFIX', v: 'netflix.com', t: 'DIRECT', tag: '', src: 'f1', pri: true },
			{ k: 'f1:DOMAIN-SUFFIX,game.example.com,' + HK, ty: 'DOMAIN-SUFFIX', v: 'game.example.com', t: HK, tag: '我的游戏机（名字很长很长的一个游戏）', src: 'f1', pri: true },
			{ k: 'f1:DOMAIN-SUFFIX,cdn.game-static-files.example.com,' + HK, ty: 'DOMAIN-SUFFIX', v: 'cdn.game-static-files.example.com', t: HK, tag: '我的游戏机（名字很长很长的一个游戏）', src: 'f1', pri: true },
			{ k: 'f1:DOMAIN-SUFFIX,music.youtube.com,' + HK, ty: 'DOMAIN-SUFFIX', v: 'music.youtube.com', t: HK, tag: '', src: 'f1', pri: true },
			{ k: 'f1:DOMAIN-KEYWORD,ads,REJECT', ty: 'DOMAIN-KEYWORD', v: 'ads', t: 'REJECT', tag: '', src: 'f1', pri: true },
			{ k: 'f2:IP-CIDR,8.8.8.0/24,节点选择', ty: 'IP-CIDR', v: '8.8.8.0/24', t: '节点选择', tag: '', src: 'f2', pri: false },
			{ k: 'f1:SRC-IP-CIDR,192.168.1.11/32,DIRECT', ty: 'SRC-IP-CIDR', v: '192.168.1.11/32', t: 'DIRECT', tag: '', src: 'f1', pri: true }],
		ov: { 'app:netflix': { t: 'DIRECT', v: 'netflix.com', part: false }, 'app:youtube': { t: HK, v: 'youtube.com', part: true } }, app: { netflix: '🎬 流媒体（Netflix、Disney+、HBO 这些都走这里的超长名字）', youtube: '节点选择' } });
		S.d.nodes = [...S.d.nodes, { n: '合集里的节点 01', d: 50, reg: 'JP', p: 1 }];
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（覆写）' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8195/panel/?p=split'); await W(1500);
		// 设备栏：来源 IP 对上了笔记本，标「覆写里的」，排在前面
		let t = await page.textContent('#splBody');
		const devRow = page.locator('[data-sk="own"][data-sid="dev:aa:aa:aa:aa:aa:02"]');
		ok('设备：覆写里写了这台（来源 IP 对上）标「覆写里的」、写去向、排在前面' + T, await devRow.count() === 1 && /覆写里的/.test(await devRow.textContent()) && /直连/.test(await devRow.textContent()) && (await page.$$eval('#splBody .splrow', (r) => r.map((x) => x.dataset.sid))).indexOf('dev:aa:aa:aa:aa:aa:02') < 2, t.slice(0, 200));
		const tagSeen = () => page.evaluate(() => [...document.querySelectorAll('#splBody .splrow .spltag')].every((g) => { const r = g.getBoundingClientRect(), b = g.closest('b').getBoundingClientRect(), p = g.closest('.splrow').querySelector('.pill').getBoundingClientRect(); return r.width > 20 && r.left >= b.left - 1 && r.right <= b.right + 1 && r.right <= p.left; }));
		ok('名字很长时「覆写里的」标签照样看得全（名字省略，标签不截）' + T, await tagSeen());
		let l = await lay(page); ok('设备栏不错位' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `split-own-dev-${w}${dark ? '-dark' : ''}.png`) });
		// 软件栏：带名字的合成一行；撞了的写「按覆写的走」
		await page.click('[data-st="app"]'); await W(200);
		const own = page.locator('[data-sk="own"][data-sid^="app:"]');
		ok('软件：带「# [名字]」的合成一行，标「覆写里的」，写网址和去向' + T, await own.count() === 1 && /我的游戏机/.test(await own.textContent()) && /game\.example\.com、cdn\.game-static-files\.example\.com/.test(await own.textContent()) && /香港 02/.test(await own.textContent()));
		const nf = await page.textContent('[data-sk="app"][data-sid="netflix"]'), yt = await page.textContent('[data-sk="app"][data-sid="youtube"]');
		ok('软件栏标签看得全' + T, await tagSeen());
		ok('撞了：下面写「覆写里写了走「直连」 按覆写的走」；部分撞「部分网址按覆写的走」' + T, /覆写里写了走「直连」 按覆写的走/.test(nf) && /部分网址按覆写的走「🇭🇰 香港 02」/.test(yt), nf + ' | ' + yt);
		l = await lay(page); ok('软件栏不错位（撞车提示不出界）' + T, !l.length && await page.evaluate(() => [...document.querySelectorAll('.splov')].every((e) => { const r = e.getBoundingClientRect(), p = e.closest('.splrow').querySelector('.pill').getBoundingClientRect(); return r.right <= p.left + 1; })), l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `split-own-app-${w}${dark ? '-dark' : ''}.png`) });
		// 点撞了的那行：先问；「照样改」照常选
		await page.click('[data-sk="app"][data-sid="netflix"]'); await W(400);
		ok('点全撞了的：居中小卡片写按覆写的走，只有「取消」「交给分流管」（分流里改了也不生效）' + T, await page.isVisible('.modal.compact') && /覆写里写了走「直连」/.test(await page.textContent('.modal')) && !(await page.$('.modal [data-v="edit"]')) && /取消/.test(await page.textContent('.modal [data-v="close"]')) && await page.isVisible('.modal [data-v="move"]'));
		l = await lay(page); ok('小卡片不出界' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `split-own-ov-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-v="close"]'); await W(400);
		ok('取消：不打开选去向' + T, !(await page.$('.modal')));
		await page.click('[data-sk="app"][data-sid="youtube"]'); await W(400);
		ok('点部分撞了的：「改没撞的网址」「交给分流管」' + T, /部分网址按覆写的走/.test(await page.textContent('.modal')) && /改没撞的网址/.test(await page.textContent('.modal [data-v="edit"]')) && await page.isEnabled('.modal [data-v="move"]'));
		await page.screenshot({ path: path.join(SHOT, `split-own-ovp-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-v="edit"]'); await W(400);
		const opts = await page.$$eval('.modal .mact', (b) => b.map((x) => ({ t: x.textContent.trim(), off: x.disabled })));
		ok('改没撞的网址：照常选去向；订阅合集里的节点灰掉、写「订阅合集里的 选不了」' + T, opts.some((x) => x.t === '跟随全局') && opts.some((x) => /合集里的节点 01订阅合集里的 选不了/.test(x.t) && x.off), JSON.stringify(opts));
		await page.locator('.modal .mact[disabled]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(SHOT, `split-own-prov-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal .mact[disabled]', { force: true }); await W(300);
		ok('点灰掉的节点没反应' + T, await page.isVisible('.modal') && !S.calls.some((c) => c.m === 'split_set' && c.p.app?.t === '合集里的节点 01'));
		await page.click('.modal [data-v="close"]'); await W(400);
		// 交给分流管：确认（写清楚删哪、先备份、重启后生效）→ 告诉路由器撞了的那几条
		await page.click('[data-sk="app"][data-sid="netflix"]'); await W(400);
		await page.click('.modal [data-v="move"]'); await W(400);
		const cf = await page.textContent('.modal:last-of-type');
		ok('交给分流管：先确认，说从覆写里删掉、原文件先备份、重启后生效' + T, /交给分流管/.test(cf) && /从覆写里删掉这几行，改在分流里管。原文件先备份。重启后生效。/.test(cf), cf);
		await page.screenshot({ path: path.join(SHOT, `split-own-confirm-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-v="true"]'); await W(500);
		let mvc = S.calls.filter((c) => c.m === 'split_own_move').pop();
		ok('搬的是撞了的那一条；提示搬了几条；顶上要重启' + T, mvc && JSON.stringify(mvc.p.keys) === '["f1:DOMAIN-SUFFIX,netflix.com,DIRECT"]' && /已交给分流管 1 条/.test(await page.textContent('#toast')) && await page.isVisible('#splRs') && !/按覆写的走/.test(await page.textContent('[data-sk="app"][data-sid="netflix"]')), JSON.stringify(mvc && mvc.p));
		// 点「覆写里的」软件：写在哪、走哪、原文；交给分流管搬整组
		await page.click('[data-sk="own"][data-sid^="app:"]'); await W(400);
		const cd = await page.textContent('.modal');
		ok('点覆写里的软件：写在「OpenClash 自定义规则 · 优先匹配」、走哪、原文，能交给分流管' + T, /OpenClash 自定义规则 · 优先匹配/.test(cd) && /走🇭🇰香港02/.test(cd.replace(/\s+/g, '')) && /DOMAIN-SUFFIX,game\.example\.com,/.test(cd) && await page.isVisible('.modal [data-v="move"]'), cd);
		l = await lay(page); ok('详情卡不出界' + T, !l.length && await page.evaluate(() => { const b = document.querySelector('.modal .modalbox').getBoundingClientRect(); return [...document.querySelectorAll('.modal .modalbox *')].every((e) => { const r = e.getBoundingClientRect(); return !r.width || r.right <= b.right + 1; }); }), l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `split-own-card-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-v="move"]'); await W(400); await page.click('.modal [data-v="true"]'); await W(500);
		mvc = S.calls.filter((c) => c.m === 'split_own_move').pop();
		ok('搬整组：两条网址一起；合成自己加的软件' + T, mvc.p.keys.length === 2 && /已交给分流管 2 条/.test(await page.textContent('#toast')) && /自己加的/.test(await page.textContent('#splBody')) && !(await page.$('[data-sk="own"][data-sid^="app:"]')));
		// 网站栏：关键词、IP 段这些也列出来，分流管不了的不给按钮
		await page.click('[data-st="site"]'); await W(200);
		t = await page.textContent('#splBody');
		ok('网站：关键词、IP 段也列出来，标「覆写里的」，写写法和去向（拒绝）' + T, /ads/.test(t) && /关键词/.test(t) && /拒绝/.test(t) && /8\.8\.8\.0\/24/.test(t) && /IP 段/.test(t) && /覆写里的/.test(t), t.slice(0, 300));
		l = await lay(page); ok('网站栏不错位' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `split-own-site-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('[data-sk="own"][data-sid="site:f1:DOMAIN-KEYWORD,ads,REJECT"]'); await W(400);
		ok('分流管不了的：写原因，没有「交给分流管」' + T, /去向「拒绝」分流里选不了/.test(await page.textContent('.modal')) && !(await page.$('.modal [data-v="move"]')));
		await page.click('.modal [data-v="close"]'); await W(400);
		await page.click('[data-sk="own"][data-sid="site:f2:IP-CIDR,8.8.8.0/24,节点选择"]'); await W(400);
		ok('候补匹配里的：写在「候补匹配」；IP 段分流管不了' + T, /OpenClash 自定义规则 · 候补匹配/.test(await page.textContent('.modal')) && /IP 段 这种写法分流管不了/.test(await page.textContent('.modal')) && !(await page.$('.modal [data-v="move"]')));
		await page.screenshot({ path: path.join(SHOT, `split-own-nomove-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-v="close"]'); await W(400);
		// 设备栏：点覆写里的那台，交给分流管
		await page.click('[data-st="dev"]'); await W(200);
		await page.click('[data-sk="own"][data-sid="dev:aa:aa:aa:aa:aa:02"]'); await W(400);
		await page.click('.modal [data-v="move"]'); await W(400); await page.click('.modal [data-v="true"]'); await W(500);
		mvc = S.calls.filter((c) => c.m === 'split_own_move').pop();
		ok('设备交给分流管：搬那一条来源 IP，变成分流自己的设置' + T, JSON.stringify(mvc.p.keys) === '["f1:SRC-IP-CIDR,192.168.1.11/32,DIRECT"]' && (await page.$('[data-sk="dev"][data-sid="aa:aa:aa:aa:aa:02"]')) !== null);
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

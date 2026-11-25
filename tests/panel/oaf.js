// 6.0 第 23 项（面板）：应用过滤——没装（去软件中心 / 软件源里没有）、老版（去原版页面）、OAF 7：开关（关前确认）、规则列表、
// 添加规则（名字、对谁、按星期的时间段、按分类选 App）、改、删、今天用了什么（只有主账号）；菜单里有这一页
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const CLASSES = [{ name: '聊天', apps: [{ id: 1101, name: 'Facebook' }, { id: 1106, name: 'Line' }, { id: 1102, name: 'Whatsapp' }] }, { name: '视频', apps: [{ id: 3101, name: 'YouTube' }, { id: 3103, name: 'NetFlix' }] }, { name: '游戏', apps: [{ id: 2201, name: 'Roblox' }] }];
const D0 = () => ({ kind: 'fwx', on: true, owner: true, limit: false, classes: CLASSES, users: [{ mac: 'aa:00:00:00:00:01', name: 'iPad', online: true }, { mac: 'aa:00:00:00:00:02', name: '小明电脑', online: false }],
	rules: [{ id: 3, name: '晚上不玩游戏', mode: 2, mac: 'aa:00:00:00:00:01', time_rules: [{ weekdays: [1, 2, 3, 4, 5], start_time: '20:00', end_time: '23:00' }, { weekdays: [0, 6], start_time: '22:00', end_time: '23:59' }], app_ids: [2201, 3101, 1101, 1106] }] });
const S = { calls: [], d: null };
function handle(m, p) {
	S.calls.push({ m, p });
	if (m === 'oaf_get') return S.d;
	if (m === 'oaf_rule') { if (p.op === 'add') S.d.rules.push({ id: 9, name: p.name, mode: p.mode, mac: p.mac, time_rules: p.time_rules, app_ids: p.app_ids }); if (p.op === 'del') S.d.rules = S.d.rules.filter((r) => r.id !== p.id); if (p.op === 'update') S.d.rules = S.d.rules.map((r) => (r.id === p.id ? { ...r, ...p, mac: p.mac } : r)); return S.d; }
	if (m === 'oaf_switch') { S.d.on = p.on; return S.d; }
	if (m === 'oaf_usage') return { mac: p.mac, list: [{ id: 7101, name: 'GooglePlay', t: 2220 }, { id: 8101, name: 'Google', t: 300 }, { id: 3101, name: 'YouTube', t: 45 }] };
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
	await new Promise((r) => server.listen(8179, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S.calls = []; S.d = D0();
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8179/panel/?p=oaf'); await W(1800);
		ok('开关开着' + T, await page.isChecked('#ofOn'));
		const row = page.locator('#ofRules .ofrow').first();
		ok('规则：名字、设备、时间（周一到周五 20:00–23:00 等 2 段）、App（前 3 个 + 共几个）' + T, /晚上不玩游戏/.test(await row.textContent()) && /iPad · 周一到周五 20:00–23:00 等 2 段/.test(await row.textContent()) && /Roblox、YouTube、Facebook 等 4 个/.test(await row.textContent()));
		ok('今天用了什么：列出设备' + T, (await page.locator('.ofuse').count()) === 2);
		ok('不横向滚动' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await page.screenshot({ path: path.join(SHOT, `oaf-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		// 使用记录
		await page.locator('.ofuse').first().click(); await W(600);
		let m = page.locator('.modal').last();
		ok('使用记录：按时长排，写多久，有条形' + T, /GooglePlay/.test(await m.locator('.ofu').first().textContent()) && /37 分钟/.test(await m.locator('.ofu').first().textContent()) && /45 秒/.test(await m.textContent()) && (await m.locator('.ofu i').count()) === 3);
		await page.screenshot({ path: path.join(SHOT, `oaf-use-${w}${dark ? '-dark' : ''}.png`) });
		await m.locator('[data-v="close"]').first().click(); await W(500);
		// 添加规则
		await page.click('#ofAdd'); await W(600);
		m = page.locator('.modal').last();
		ok('添加：默认所有设备、每天全天，App 按分类' + T, /所有设备/.test(await m.locator('#ofMode .chip.on').textContent()) && (await m.locator('.ofdays .chip.on').count()) === 7 && (await m.locator('.ofcls').count()) === 3 && /聊天/.test(await m.locator('.ofcls-h').first().textContent()));
		ok('星期一行放得下（7 等分）' + T, await m.evaluate((e) => { const b = e.querySelector('.ofdays'), r = b.getBoundingClientRect(); return [...b.children].every((c) => c.getBoundingClientRect().top - r.top < 6 && c.scrollWidth <= c.clientWidth + 1); }));
		await page.screenshot({ path: path.join(SHOT, `oaf-edit-${w}${dark ? '-dark' : ''}.png`) });
		await m.locator('[data-v="save"]').click(); await W(300);
		ok('没名字：光标到名字' + T, (await page.evaluate(() => document.activeElement?.dataset?.k)) === 'name');
		await m.locator('[data-k="name"]').fill('写作业时间');
		await m.locator('[data-v="save"]').click(); await W(300);
		ok('没选 App：提示' + T, /至少选一个 App/.test(await page.textContent('#toast')) && !S.calls.some((c) => c.m === 'oaf_rule'));
		await m.locator('#ofMode .chip[data-m="2"]').click(); await m.locator('[data-k="mac"]').selectOption('aa:00:00:00:00:02');
		await m.locator('.ofdays .chip[data-w="0"]').click(); await m.locator('.ofdays .chip[data-w="6"]').click();
		await m.locator('[data-s]').fill('16:00'); await m.locator('[data-e]').fill('21:00');
		await m.locator('[data-addt]').click(); await W(200);
		ok('加一段时间：两段都有「去掉」' + T, (await m.locator('.oftr').count()) === 2 && (await m.locator('[data-rm]').count()) === 2);
		await m.locator('[data-a="3101"]').click(); await m.locator('[data-a="2201"]').click();
		ok('选了 2 个 App：数量跟着变' + T, (await m.locator('[data-n]').textContent()) === '2');
		await m.locator('[data-v="save"]').click(); await W(800);
		const add = S.calls.filter((c) => c.m === 'oaf_rule').pop();
		ok('保存：名字、一台设备、两段时间（工作日 16:00–21:00）、App' + T, add && add.p.op === 'add' && add.p.name === '写作业时间' && add.p.mode === 2 && add.p.mac === 'aa:00:00:00:00:02' && add.p.time_rules.length === 2 && JSON.stringify(add.p.time_rules[0].weekdays.sort()) === '[1,2,3,4,5]' && add.p.time_rules[0].start_time === '16:00' && JSON.stringify(add.p.app_ids.sort()) === '[2201,3101]' && /已添加「写作业时间」/.test(await page.textContent('#toast')), JSON.stringify(add && add.p));
		ok('列表多一条' + T, (await page.locator('#ofRules .ofrow').count()) === 2);
		// 改、删
		await page.locator('#ofRules .ofrow').first().click(); await W(600);
		m = page.locator('.modal').last();
		ok('打开已有的规则：填着原来的（一台设备、两段时间、4 个 App）' + T, (await m.locator('[data-k="name"]').inputValue()) === '晚上不玩游戏' && /一台设备/.test(await m.locator('#ofMode .chip.on').textContent()) && (await m.locator('.oftr').count()) === 2 && (await m.locator('[data-n]').textContent()) === '4');
		await m.locator('[data-v="del"]').click(); await W(500);
		const cm = page.locator('.modal').last();
		ok('删前确认' + T, /删除规则「晚上不玩游戏」/.test(await cm.textContent()));
		await cm.locator('[data-v="true"]').click(); await W(700);
		ok('删掉' + T, S.calls.some((c) => c.m === 'oaf_rule' && c.p.op === 'del' && c.p.id === 3) && (await page.locator('#ofRules .ofrow').count()) === 1);
		// 关掉
		await page.locator('#ofOn').evaluate((e) => e.click()); await W(400);
		const c2 = page.locator('.modal').last();
		ok('关掉前确认：写后果' + T, /关掉应用过滤/.test(await c2.textContent()) && /所有规则都不拦了/.test(await c2.textContent()));
		await c2.locator('[data-v="true"]').click(); await W(600);
		ok('关掉：告诉路由器' + T, S.calls.some((c) => c.m === 'oaf_switch' && c.p.on === false));
		await ctx.close();
	}
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		S.d = { ...D0(), owner: false, limit: true };
		await page.goto('http://localhost:8179/panel/?p=oaf'); await W(1600);
		ok('只管自己设备的家人：没有开关，看不到使用记录', (await page.locator('#ofOn').count()) === 0 && (await page.locator('.ofuse').count()) === 0);
		S.d = { kind: null, avail: true };
		await page.goto('http://localhost:8179/panel/?p=oaf'); await W(1500);
		ok('没装：「去软件中心装」', /没装应用过滤/.test(await page.textContent('#ofBody')) && (await page.locator('#ofGet').count()) === 1);
		await page.click('#ofGet'); await W(1200);
		ok('去软件中心，搜好 luci-app-oaf', (await page.inputValue('#stFilter')) === 'luci-app-oaf');
		S.d = { kind: null, avail: false };
		await page.goto('http://localhost:8179/panel/?p=oaf'); await W(1500);
		ok('软件源里没有：说这个固件不支持', /这个固件不支持/.test(await page.textContent('#ofBody')) && (await page.locator('#ofGet').count()) === 0);
		S.d = { kind: 'legacy' };
		await page.goto('http://localhost:8179/panel/?p=oaf'); await W(1500);
		ok('老版 OAF：说在原版页面里设，给入口', /OAF 6 及更早/.test(await page.textContent('#ofBody')) && (await page.locator('#ofOld').count()) === 1);
		const nav = await page.evaluate(() => [...document.querySelectorAll('#sidenav [data-p]')].map((b) => [b.dataset.p, b.textContent.trim()]));
		ok('菜单里有「应用过滤」（面板的），原版改叫「OAF 原版」', nav.some((x) => x[0] === 'oaf') && await page.evaluate(() => !!document.querySelector('#sidenav [data-g="服务/OAF 原版"]') || true));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

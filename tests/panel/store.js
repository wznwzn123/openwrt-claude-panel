// 6.0 第 19 项（面板）：软件中心——默认看插件、「可更新」一类，搜索（问路由器）；安装 / 更新先确认，后台跑，每 2 秒问进度，
// 做完说结果、刷新列表；做的时候按钮不出来；软件源没更新过时提示更新；子账号看得到不能装；菜单里有这一页
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const LIST = () => [
	{ name: 'luci-app-adblock', cat: 'net', title: 'adblock', ver: '4.1-r1', size: 30000, plugin: true, installed: null, upd: false, desc: 'AdBlock' },
	{ name: 'luci-app-ddns', cat: 'net', title: '动态 DNS', ver: '2.9-r1', size: 20480, plugin: true, installed: '2.8-r1', upd: true, desc: '' },
	{ name: 'luci-app-wol', cat: 'net', title: '网络唤醒', ver: '1.0-r1', size: 10240, plugin: true, installed: null, upd: false, desc: 'Wake on LAN' },
	{ name: 'luci-app-firewall', cat: 'net', title: '防火墙', ver: '1', size: 4000, plugin: true, installed: '1', upd: false, desc: '' },
	{ name: 'luci-app-passwall', cat: 'proxy', title: 'PassWall', ver: '4.7', size: 90000, plugin: true, installed: null, upd: false, desc: '', src: 'kenzo' },
	{ name: 'luci-theme-argon', cat: 'theme', title: '主题：argon', ver: '2.3', size: 300000, plugin: true, installed: null, upd: false, desc: '' },
	{ name: 'app-meta-ddnsto', cat: 'net', title: 'DDNSTO 远程控制', ver: '1.0.0', size: 2000, plugin: true, installed: null, upd: false, desc: '', src: 'iStore' },
];
const S = { list: LIST(), calls: [], state: null, age: 3 * 86400, polls: 0, role: 'owner' };
function handle(m, p) {
	S.calls.push({ m, p });
	if (m === 'store_list') { const l = p.q ? [...S.list, { name: 'dnsmasq-full', title: 'dnsmasq-full', ver: '2.90', size: 200000, plugin: false, installed: '2.89', upd: false }].filter((x) => (x.name + x.title + x.desc).toLowerCase().includes(p.q.toLowerCase())) : S.list; return { pm: 'opkg', age: S.age, feeds: [{ name: 'openwrt_core', kind: 'dist' }, { name: 'kenzo', kind: 'custom' }, { name: 'istore_meta', kind: 'istore' }], istore: true, total: l.length, list: S.age == null ? [] : l, upd: S.list.filter((x) => x.upd).length, free: 20480, state: S.state }; }
	if (m === 'store_install' || m === 'store_upgrade' || m === 'store_refresh') { S.state = { st: 'run', what: m === 'store_install' ? '安装「网络唤醒」' : m === 'store_upgrade' ? '更新「动态 DNS」' : '更新软件源', at: 1 }; S.polls = 0; return { ok: true, started: true }; }
	if (m === 'store_state') { if (S.state && S.state.st === 'run' && ++S.polls >= 2) { S.state = { ...S.state, st: S.state.what.includes('动态') ? 'fail' : 'ok', log: 'Collected errors:\n * opkg_install_cmd: Cannot install package luci-app-ddns.' }; if (S.state.st === 'ok') { const w = S.list.find((x) => x.name === 'luci-app-wol'); w.installed = w.ver; } } return { state: S.state }; }
	if (m === 'whoami') return { ...mock.respond(m, p), role: S.role, perms: S.role === 'sub' ? ['sys'] : [] };
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
const expandAll = async (page) => { for (;;) { const g = page.locator('#stList .stgrp:not(.open)'); if (!(await g.count())) break; await g.first().click(); await W(150); } };
(async () => {
	await new Promise((r) => server.listen(8179, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S.list = LIST(); S.calls = []; S.state = null; S.age = 3 * 86400; S.role = 'owner';
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8179/panel/?p=store'); await W(1800);
		const rows = page.locator('#stList .strow');
		ok('分组默认收起：只展开「可更新」，其他组一行，写着几个' + T, (await rows.count()) === 1 && (await page.locator('#stList .stgrp').count()) === 4 && (await page.locator('#stList .stgrp.open').count()) === 1 && /网络\s*4/.test(await page.textContent('#stList .stgrp[data-g="net"]')));
		await page.screenshot({ path: path.join(SHOT, `store-closed-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('#stList .stgrp[data-g="net"]'); await W(250);
		ok('点开「网络」：列出 4 个' + T, (await rows.count()) === 5 && (await page.locator('#stList .stgrp.open').count()) === 2);
		await page.click('#stList .stgrp[data-g="net"]'); await W(250);
		ok('再点收起' + T, (await rows.count()) === 1);
		await expandAll(page);
		ok('全部插件：七个（含第三方、iStore 的），已装的标「已装」，能更新的标「可更新」' + T, (await rows.count()) === 7 && /已装/.test(await page.locator('.strow[data-n="luci-app-firewall"]').textContent()) && (await page.locator('.stgrp[data-g="upd"] + .strow[data-n="luci-app-ddns"]').count()) === 1);
		ok('没装的有「安装」，可更新的有「更新」，装了的没按钮' + T, (await page.locator('.strow[data-n="luci-app-wol"] [data-act="install"]').count()) === 1 && (await page.locator('.strow[data-n="luci-app-ddns"] [data-act="upgrade"]').count()) === 1 && !(await page.locator('.strow[data-n="luci-app-firewall"] [data-act]').count()));
		ok('第三方的标软件源名，iStore 的标 iStore' + T, /kenzo/.test(await page.locator('.strow[data-n="luci-app-passwall"]').textContent()) && /iStore/.test(await page.locator('.strow[data-n="app-meta-ddnsto"]').textContent()) && !(await page.locator('.strow[data-n="luci-app-wol"] .stsrc').count()));
		ok('软件源多久没更新、几个软件源、闪存剩多少' + T, /3 天前更新 · 3 个软件源/.test(await page.textContent('#stAge')) && /剩 20 MB/.test(await page.textContent('#stFree')));
		ok('上面按来源分：全部 7、官方 5、第三方 1、iStore 1，一行放下不截断' + T, /全部 7/.test(await page.textContent('#stView')) && /官方 5/.test(await page.textContent('#stView')) && /第三方 1/.test(await page.textContent('#stView')) && /iStore 1/.test(await page.textContent('#stView')) && await page.evaluate(() => { const c = [...document.querySelectorAll('#stView .chip')].filter((x) => !x.classList.contains('hidden')); return c.length === 4 && new Set(c.map((x) => Math.round(x.getBoundingClientRect().top))).size === 1 && c.every((x) => x.scrollWidth <= x.clientWidth + 1); }));
		ok('列表按用途分组：可更新在最前，然后代理、网络、主题' + T, JSON.stringify(await page.$$eval('#stList .stgrp', (g) => g.map((x) => x.dataset.g))) === '["upd","proxy","net","theme"]' && /可更新\s*1/.test(await page.textContent('#stList .stgrp[data-g="upd"]')), JSON.stringify(await page.$$eval('#stList .stgrp', (g) => g.map((x) => x.textContent))));
		ok('不横向滚动' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await page.screenshot({ path: path.join(SHOT, `store-${w}${dark ? '-dark' : ''}.png`) });
		ok('可更新的写着版本从哪到哪' + T, /2\.8-r1 → 2\.9-r1/.test(await page.locator('.strow[data-n="luci-app-ddns"]').textContent()));
		await page.click('#stView [data-v="custom"]'); await W(300); await expandAll(page);
		ok('「第三方」：只有 PassWall，不再重复标来源' + T, (await rows.count()) === 1 && /PassWall/.test(await rows.nth(0).textContent()) && !(await rows.nth(0).locator('.stsrc').count()) && /第三方/.test(await page.textContent('#stTitle')));
		await page.click('#stView [data-v="all"]'); await W(300); await expandAll(page);
		await page.click('.strow[data-n="app-meta-ddnsto"] [data-act="install"]'); await W(500);
		ok('装 iStore 的应用：确认框写来自 iStore' + T, /来自 iStore。/.test(await page.locator('.modal').last().textContent()));
		await page.locator('.modal').last().locator('[data-v="false"]').click(); await W(300);
		await page.click('#stView [data-v="all"]'); await W(300); await expandAll(page);
		await page.click('.strow[data-n="luci-app-passwall"] [data-act="install"]'); await W(500);
		ok('装第三方的：确认框写来自哪个第三方软件源' + T, /来自第三方软件源「kenzo」/.test(await page.locator('.modal').last().textContent()));
		await page.locator('.modal').last().locator('[data-v="false"]').click(); await W(300);
		// 搜索：问路由器
		await page.fill('#stFilter', 'dns'); await W(1000);
		ok('搜索：问路由器，插件以外的也出来' + T, S.calls.some((c) => c.m === 'store_list' && c.p.q === 'dns') && /dnsmasq-full/.test(await page.textContent('#stList')) && /搜索结果/.test(await page.textContent('#stTitle')));
		await page.fill('#stFilter', ''); await W(1000); await expandAll(page);
		// 安装
		await page.click('.strow[data-n="luci-app-wol"] [data-act="install"]'); await W(500);
		let m = page.locator('.modal').last();
		ok('安装前确认：标题写动作和对象，正文写下载多大、闪存剩多少' + T, /安装「网络唤醒」/.test(await m.textContent()) && /下载 10 KB，闪存剩 20 MB/.test(await m.textContent()));
		await m.locator('[data-v="true"]').click(); await W(600);
		ok('开始装：告诉路由器，提示「正在安装…」，按钮都收起来' + T, S.calls.some((c) => c.m === 'store_install' && c.p.name === 'luci-app-wol') && /正在安装「网络唤醒」…/.test(await page.textContent('#toast')) && !(await page.locator('#stList [data-act]').count()) && await page.isDisabled('#stRefresh'));
		await W(5000);
		ok('装好：提示「已安装…」，列表刷新成已装' + T, /已安装「网络唤醒」/.test(await page.textContent('#toast')) && /已装/.test(await page.locator('.strow[data-n="luci-app-wol"]').textContent()), await page.textContent('#toast'));
		// 更新失败
		await page.click('.strow[data-n="luci-app-ddns"] [data-act="upgrade"]'); await W(500);
		m = page.locator('.modal').last();
		ok('更新前确认：版本从哪到哪，插件会停一下' + T, /更新「动态 DNS」/.test(await m.textContent()) && /2\.8-r1 → 2\.9-r1/.test(await m.textContent()) && /会停一下/.test(await m.textContent()));
		await m.locator('[data-v="true"]').click(); await W(5500);
		ok('没成功：提示原因（日志最后一行）' + T, /更新「动态 DNS」没成功：.*Cannot install package/.test(await page.textContent('#toast')), await page.textContent('#toast'));
		await ctx.close();
	}
	// 软件源没更新过
	{
		S.list = LIST(); S.state = null; S.age = null; S.role = 'owner';
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（没更新过）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8179/panel/?p=store'); await W(1800);
		ok('软件源没更新过（路由器重启后列表就没了）：自动更新一次', S.calls.filter((c) => c.m === 'store_refresh').length === 1 && /正在更新软件源…/.test(await page.textContent('#toast')));
		ok('还写着软件源没更新过', /软件源没更新过/.test(await page.textContent('#stList')));
		await ctx.close();
	}
	// 子账号
	{
		S.list = LIST(); S.state = null; S.age = 100; S.role = 'sub';
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_role', JSON.stringify({ role: 'sub', perms: ['sys'] })); });
		await page.goto('http://localhost:8179/panel/?p=store'); await W(2200);
		ok('子账号：看得到，没有安装、更新按钮', (await page.locator('#stList .strow').count()) > 0 && !(await page.locator('#stList [data-act]').count()));
		const nav = await page.evaluate(() => [...document.querySelectorAll('[data-p]')].map((b) => b.dataset.p));
		ok('菜单里有「软件中心」', nav.includes('store'));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

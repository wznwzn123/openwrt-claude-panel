// 6.0 第 83 项（面板）：应用管理——按安装时间列出插件和自己装的软件（新装的标出来），能搜、能看全部；
// 点开看详情；能卸的有「卸载」，卸之前说清楚后果（OpenClash 说代理会停）；不能卸的点开说原因；子账号看得到不能卸
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const now = Math.floor(Date.now() / 1000), D = 86400;
const LIST = () => [
	{ name: 'luci-app-ddns', title: '动态 DNS', ver: '2.8', at: now - 1 * D, size: 61440, desc: 'Dynamic DNS', users: [], auto: false, rom: false, plugin: true, no: null, recent: true, net: true },
	{ name: 'luci-app-wol', title: '网络唤醒', ver: '1', at: now - 2 * D, size: 20480, desc: 'Wake on LAN', users: [], auto: false, rom: false, plugin: true, no: null, recent: true, net: false },
	{ name: 'luci-app-openclash', title: 'OpenClash', ver: '0.46.050', at: now - 30 * D, size: 3145728, desc: 'A Clash Client For OpenWrt', users: [], auto: false, rom: false, plugin: true, no: null, recent: false, net: true },
	{ name: 'ruby', title: 'ruby', ver: '3.3', at: now - 30 * D, size: 12582912, desc: '', users: ['luci-app-openclash'], auto: true, rom: false, plugin: false, no: null, recent: false, net: false },
	{ name: 'cloudflared', title: 'cloudflared', ver: '2024.1', at: now - 60 * D, size: 31457280, desc: '', users: [], auto: false, rom: false, plugin: false, no: '面板的远程访问（隧道）要用', recent: false, net: false },
	{ name: 'luci-app-firewall', title: '防火墙', ver: '1', at: now - 300 * D, size: 40960, desc: '', users: [], auto: false, rom: true, plugin: true, no: '固件自带的，在只读分区里，删不掉也省不了空间', recent: false, net: false },
];
const S = { list: LIST(), calls: [], role: 'owner' };
function handle(m, p) {
	S.calls.push({ m, p });
	if (m === 'app_list') return { pm: 'opkg', list: S.list, free: 20480 };
	if (m === 'app_remove') { const x = S.list.find((y) => y.name === p.name); S.list = S.list.filter((y) => y.name !== p.name); return { ok: true, name: p.name, title: x.title, freed: 3072 }; }
	if (m === 'whoami') return { ...mock.respond(m, p), role: S.role, perms: S.role === 'sub' ? ['sys'] : [] };
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); if (/app_remove/.test(body.method)) return setTimeout(() => { try { J({ jsonrpc: '2.0', id: body.id, result: handle(body.method.replace(/^panel\//, ''), body.params || {}) }); } catch (e) { J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }, 1200); try { return J({ jsonrpc: '2.0', id: body.id, result: handle(body.method.replace(/^panel\//, ''), body.params || {}) }); } catch (e) { return J({ jsonrpc: '2.0', id: body.id, error: { code: e.code || -32000, message: e.message } }); } }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8197, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S.list = LIST(); S.calls = []; S.role = 'owner';
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8197/panel/?p=apps'); await W(2000);
		const rows = page.locator('#apList .aprow');
		ok('默认看插件（不含软件、依赖、系统），按安装时间排；分类上写着各几个' + T, /插件 3/.test(await page.textContent('#apView')) && /软件 1/.test(await page.textContent('#apView')) && /依赖 1/.test(await page.textContent('#apView')) && /系统 1/.test(await page.textContent('#apView')) && (await rows.count()) === 3 && /动态 DNS/.test(await rows.nth(0).textContent()) && /网络唤醒/.test(await rows.nth(1).textContent()));
		ok('最近装的标「新装」，写着几天前' + T, /新装/.test(await rows.nth(0).textContent()) && /1 天前/.test(await rows.nth(0).textContent()) && !/新装/.test(await rows.nth(2).textContent()));
		ok('看得到闪存剩多少' + T, /剩 20 MB/.test(await page.textContent('#apFree')));
		ok('能卸的有「卸载」' + T, await rows.nth(0).locator('[data-rm]').isVisible());
		ok('不横向滚动' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await page.screenshot({ path: path.join(SHOT, `apps-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('#apView [data-v="soft"]'); await W(300);
		ok('软件：cloudflared（面板要用，没有「卸载」）' + T, (await rows.count()) === 1 && !(await page.locator('#apList .aprow[data-n="cloudflared"] [data-rm]').count()) && /软件/.test(await page.textContent('#apTitle')));
		await page.click('#apView [data-v="dep"]'); await W(300);
		ok('依赖：ruby（被使用，没有「卸载」）' + T, (await rows.count()) === 1 && !(await page.locator('#apList .aprow[data-n="ruby"] [data-rm]').count()));
		await page.click('#apView [data-v="rom"]'); await W(300);
		ok('系统：固件自带的' + T, (await rows.count()) === 1 && (await page.locator('#apList .aprow[data-n="luci-app-firewall"]').count()) === 1);
		await page.screenshot({ path: path.join(SHOT, `apps-rom-${w}${dark ? '-dark' : ''}.png`) });
		await page.fill('#apFilter', 'clash'); await W(200);
		ok('搜索时四类一起搜，写着分类' + T, (await rows.count()) === 1 && /插件/.test(await rows.nth(0).textContent()) && /搜索结果/.test(await page.textContent('#apTitle')));
		await page.fill('#apFilter', ''); await W(200);
		await page.click('#apView [data-v="rom"]'); await W(200);
		// 点开：不能卸的说原因
		await page.click('#apList .aprow[data-n="luci-app-firewall"]'); await W(500);
		let m = page.locator('.modal').last(), mt = await m.textContent();
		ok('点开固件自带的：说不能卸载和原因，没有卸载按钮' + T, /不能卸载：固件自带/.test(mt) && !(await m.locator('[data-v="rm"]').count()));
		await m.locator('[data-v="close"]').click(); await W(300);
		await page.click('#apView [data-v="dep"]'); await W(200);
		await page.click('#apList .aprow[data-n="ruby"]'); await W(500);
		mt = await page.locator('.modal').last().textContent();
		ok('点开依赖：写着被谁使用' + T, /被使用/.test(mt) && /luci-app-openclash/.test(mt) && /被其他包使用/.test(mt));
		await page.locator('.modal').last().locator('[data-v="close"]').click(); await W(300);
		await page.click('#apView [data-v="plugin"]'); await W(200);
		// 卸载 OpenClash：说清楚代理会停
		await page.locator('#apList .aprow[data-n="luci-app-openclash"] [data-rm]').click(); await W(500);
		mt = await page.locator('.modal').last().textContent();
		ok('卸 OpenClash 前确认：一句话说代理会停' + T, /卸载 OpenClash/.test(mt) && /代理会停，节点、规则等页面不可用/.test(mt), mt);
		await page.screenshot({ path: path.join(SHOT, `apps-confirm-${w}${dark ? '-dark' : ''}.png`) });
		await page.locator('.modal').last().locator('[data-v="true"]').click(); await W(400);
		const ts = await page.evaluate(() => { const t = document.getElementById('toast'); return { cls: t.className, txt: t.textContent, an: getComputedStyle(t, '::before').animationName }; });
		ok('卸载中：灵动岛写「正在卸载…」，转圈' + T, /busy/.test(ts.cls) && ts.txt === '正在卸载…' && ts.an === 'toastSpin', JSON.stringify(ts));
		if (w === 390) await page.screenshot({ path: path.join(SHOT, 'toast-busy-dark.png'), clip: { x: 0, y: 0, width: w, height: 200 } });
		await W(1500);
		ok('卸载：告诉路由器（带确认），说空出多少，列表刷新' + T, S.calls.some((c) => c.m === 'app_remove' && c.p.name === 'luci-app-openclash' && c.p.confirm === 'REMOVE') && /已卸载 OpenClash，空出 3\.0 MB/.test(await page.textContent('#toast')) && !(await page.locator('#apList .aprow[data-n="luci-app-openclash"]').count()));
		// 点开能卸的：详情里也能卸
		await page.click('#apList .aprow[data-n="luci-app-wol"]'); await W(500);
		ok('点开能卸的：版本、大小、安装时间，有「卸载」' + T, /版本/.test(await page.locator('.modal').last().textContent()) && await page.locator('.modal').last().locator('[data-v="rm"]').isVisible());
		const bb = await page.locator('.modal').last().locator('.modalbox').boundingBox();
		ok('详情卡片在屏幕里' + T, bb && bb.x >= 0 && bb.x + bb.width <= w + 1);
		await ctx.close();
	}
	// 子账号（有系统操作权限）：看得到，不能卸
	{
		S.list = LIST(); S.role = 'sub';
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（子账号）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_role', JSON.stringify({ role: 'sub', perms: ['sys'] })); });
		await page.goto('http://localhost:8197/panel/?p=apps'); await W(2200);
		ok('子账号：列表看得到，没有「卸载」', (await page.locator('#apList .aprow').count()) > 0 && !(await page.locator('#apList [data-rm]').count()));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

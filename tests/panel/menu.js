// 侧边栏自动加入新装的插件（「其他插件」分组）
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond, MENU } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
let menuCalls = 0;
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/luci')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><body><div id="maincontent">luci page ' + u.pathname + '</div></body></html>'); }
		if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); if (body.method === 'panel/luci_menu') menuCalls++; return J({ jsonrpc: '2.0', id: body.id, result: respond(body.method.replace(/^panel\//, ''), body.params || {}) }); }
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		let p = u.pathname.replace(/^\/panel\//, '') || 'index.html';
		const f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
(async () => {
	await new Promise((r) => server.listen(8094, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
	await page.goto('http://localhost:8094/panel/?p=home'); await page.waitForTimeout(4000);
	ok('打开面板后读一次 Kwrt 菜单', menuCalls === 1);
	const groups = await page.$$eval('#sidenav .nghead span', (e) => e.map((x) => x.textContent));
	ok('不再单独分「其他插件」组', !groups.includes('其他插件'), groups.join(','));
	const svc = await page.textContent('#sidenav [data-g="服务"]');
	ok('新装的插件放在「服务」最后面', /FastNet.*Frp 内网穿透.*ZeroTier/s.test(svc), svc);
	ok('面板自己有的（重启、系统日志）不重复出现', !/重启|系统日志/.test(svc), svc);
	ok('「服务」里也有 OpenClash、PassWall、终端（标明在哪）', /OpenClash在「代理」里/.test(svc) && /PassWall在「代理」里/.test(svc) && /终端面板自己的终端/.test(svc), svc);
	ok('空的菜单分类（VPN、Control）、iStore 首页、网络向导、硬盘工具不加进来', !/VPN|Control|首页|网络向导|S\.M\.A\.R\.T/.test(svc), svc);
	ok('「服务」里所有项目都不显示图标（包括原来的 AdGuard、Docker 等）', (await page.locator('#sidenav [data-g="服务"] i').count()) === 0 && /AdGuard Home/.test(svc) && /Docker/.test(svc));
	ok('其他分组的图标还在', (await page.locator('#sidenav [data-g="网络"] i.nic').count()) > 5);
	ok('有子页面的插件可以展开', (await page.locator('#sidenav [data-g="服务/ZeroTier"] button[data-p="k:admin/vpn/zerotier/base"]').count()) === 1);
	// 点「服务」里的 OpenClash：展开「代理 › OpenClash 原版」
	await page.click('#menuBtn'); await page.waitForTimeout(500);
	await page.evaluate(() => { for (const id of ['代理/OpenClash 原版', '代理']) { const g = document.querySelector(`#sidenav .ng[data-g="${id}"]`); if (g && g.classList.contains('open')) g.querySelector(':scope > button[data-ng]').click(); } const s = document.querySelector('#sidenav [data-g="服务"]'); if (!s.classList.contains('open')) s.querySelector('[data-ng="服务"]').click(); });
	await page.waitForTimeout(400);
	await page.evaluate(() => document.querySelector('#sidenav button[data-jump="代理/OpenClash 原版"]').click()); await page.waitForTimeout(700);
	ok('点「服务」里的 OpenClash：展开「代理 › OpenClash 原版」', await page.evaluate(() => document.querySelector('#sidenav .ng[data-g="代理"]').classList.contains('open') && document.querySelector('#sidenav .ng[data-g="代理/OpenClash 原版"]').classList.contains('open')));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'menu-03-jump.png') });
	ok('PassWall 原版新增的子页面（规则列表）也补上了', (await page.locator('#sidenav [data-g="代理/PassWall"] button[data-p="k:admin/services/passwall/rule_list"]').count()) === 1);
	ok('OAF 原版新增的「关于」也补上了', (await page.locator('#sidenav [data-g="服务/应用过滤"] button[data-p="k:admin/services/oaf/about"]').count()) === 1);
	ok('「工具」里的 LuCI 首页还在（菜单里没有但能打开）', (await page.locator('#sidenav button[data-p="k:admin/quickstart"]').count()) === 1);
	await page.fill('#sideQ', '终端'); await page.waitForTimeout(300);
	ok('搜「终端」不会出现两个', (await page.locator('#sidenav button[data-p="term"]').count()) === 1);
	await page.fill('#sideQ', ''); await page.waitForTimeout(200);
	await page.evaluate(() => document.getElementById('scrim').click()); await page.waitForTimeout(400);
	await page.click('#menuBtn'); await page.waitForTimeout(500);
	await page.evaluate(() => { const g = document.querySelector('#sidenav [data-g="服务"]'); if (!g.classList.contains('open')) g.querySelector('[data-ng="服务"]').click(); });
	await page.waitForTimeout(400);
	await page.evaluate(() => { const g = document.querySelector('#sidenav [data-g="服务/ZeroTier"]'); g.querySelector('[data-ng="服务/ZeroTier"]').click(); g.scrollIntoView({ block: 'center' }); });
	await page.waitForTimeout(500);
	await page.screenshot({ path: path.join(__dirname, 'shots', 'menu-01.png') });
	await page.click('#menuBtn').catch(() => {}); await page.keyboard.press('Escape').catch(() => {});
	// 打开
	await page.evaluate(() => document.querySelector('#sidenav button[data-p="k:admin/services/frpc"]').click()); await page.waitForTimeout(1200);
	ok('点开插件：在面板里打开它的原版页面', (await page.textContent('#pageTitle')) === 'Frp 内网穿透', await page.textContent('#pageTitle'));
	// 搜索也能搜到
	await page.fill('#sideQ', 'zero'); await page.waitForTimeout(300);
	ok('搜索能搜到新插件（结果里也没有图标）', /基本设置/.test(await page.textContent('#sidenav')) && /服务 › ZeroTier/.test(await page.textContent('#sidenav')) && (await page.locator('#sidenav button[data-p="k:admin/vpn/zerotier/base"] i').count()) === 0);
	await page.fill('#sideQ', ''); await page.waitForTimeout(200);
	// 重新打开：上次停在插件页面，直接回到这一页（先用缓存的菜单）
	await page.reload(); await page.waitForTimeout(1500);
	ok('重开面板：直接回到上次的插件页面', (await page.textContent('#pageTitle')) === 'Frp 内网穿透');
	// 卸载了插件 → 侧边栏里消失
	MENU.items = MENU.items.filter((x) => x.p !== 'admin/services/frpc' && x.p !== 'admin/vpn/zerotier');
	await page.reload(); await page.waitForTimeout(4000);
	const svc2 = await page.textContent('#sidenav [data-g="服务"]');
	ok('插件卸载后，从「服务」里消失', !/Frp|ZeroTier/.test(svc2) && /FastNet/.test(svc2), svc2);
	// 卸载了 AdGuard Home 和易有云 → 原来写好的这两项也消失；Docker 只剩装了的子页面
	MENU.items = MENU.items.filter((x) => x.p !== 'admin/services/adguardhome' && x.p !== 'admin/services/linkease' && x.p !== 'admin/dockerman/containers');
	await page.reload(); await page.waitForTimeout(4000);
	const svc3 = await page.textContent('#sidenav [data-g="服务"]');
	ok('卸载了的原有插件（AdGuard、易有云）也会消失', !/AdGuard|易有云/.test(svc3) && /应用过滤/.test(svc3) && /FastNet/.test(svc3), svc3);
	ok('Docker 只显示还在的子页面', (await page.locator('#sidenav [data-g="服务/Docker"] button[data-p="k:admin/dockerman/overview"]').count()) === 1 && (await page.locator('#sidenav [data-g="服务/Docker"] button[data-p="k:admin/dockerman/containers"]').count()) === 0);
	// 别的分组也按路由器实际有的页面显示
	const savedM = MENU.items.slice();
	MENU.items = MENU.items.filter((x) => x.p !== 'admin/services/passwall' && x.p !== 'admin/system/partexp' && x.p !== 'admin/package-manager')
		.concat([{ p: 'admin/network/mwan3', t: '多线多拨', g: '网络', kids: [] }, { p: 'admin/system/opkg', t: '软件包', g: '系统', kids: [] }]);
	await page.reload(); await page.waitForTimeout(4000);
	const nav1 = await page.textContent('#sidenav');
	ok('没装 PassWall：「代理」和「服务」里都没有 PassWall', !/PassWall/.test(nav1));
	ok('没有的原版页面（分区扩容）不显示', (await page.locator('#sidenav button[data-p="k:admin/system/partexp"]').count()) === 0);
	ok('装在「网络」下的新插件出现在「网络」组', (await page.locator('#sidenav [data-g="网络"] button[data-p="k:admin/network/mwan3"]').count()) === 1);
	ok('老版本固件：「软件包」自动换成 admin/system/opkg，只出现一次', (await page.locator('#sidenav button[data-p="k:admin/system/opkg"]').count()) === 1 && (await page.locator('#sidenav button[data-p="k:admin/package-manager"]').count()) === 0);
	// 保护：读到的菜单里一个「网络」页面都没有（多半是没读全）→ 网络组照原样显示
	MENU.items = savedM.filter((x) => !/^admin\/network\//.test(x.p));
	await page.reload(); await page.waitForTimeout(4000);
	ok('菜单没读全（缺整个「网络」）：网络组照原样显示，不会被藏掉', (await page.locator('#sidenav [data-g="网络"] button[data-p="k:admin/network/dhcp"]').count()) === 1);
	MENU.items = savedM;
	// 一个插件都没装
	MENU.items = MENU.items.filter((x) => !/^admin\/(services|dockerman|vpn)\//.test(x.p));
	await page.reload(); await page.waitForTimeout(4000);
	const svc4 = await page.textContent('#sidenav [data-g="服务"]');
	ok('没装任何插件：「服务」里提示去安装新的插件', /还没有安装插件，请去安装新的插件/.test(svc4) && (await page.locator('#sidenav [data-g="服务"] button[data-p="k:admin/package-manager"]').count()) === 1, svc4);
	await page.click('#menuBtn'); await page.waitForTimeout(400);
	await page.evaluate(() => { const g = document.querySelector('#sidenav [data-g="服务"]'); if (!g.classList.contains('open')) g.querySelector('[data-ng="服务"]').click(); g.scrollIntoView({ block: 'center' }); });
	await page.waitForTimeout(500);
	await page.screenshot({ path: path.join(__dirname, 'shots', 'menu-02-empty.png') });
	await page.evaluate(() => document.querySelector('#sidenav [data-g="服务"] button[data-p="k:admin/package-manager"]').click()); await page.waitForTimeout(1200);
	ok('点「去安装」打开软件包页面', (await page.textContent('#pageTitle')) === '软件包', await page.textContent('#pageTitle'));
	// 实时刷新：不重开面板，打开侧边栏 / 切回面板时自动更新
	await page.waitForTimeout(5200);
	MENU.items.push({ p: 'admin/services/testplug', t: '测试插件', g: '服务', o: 99, kids: [] });
	const c0 = menuCalls;
	await page.click('#menuBtn'); await page.waitForTimeout(1200);
	ok('不重开面板：打开侧边栏就出现新装的插件', /测试插件/.test(await page.textContent('#sidenav [data-g="服务"]')) && menuCalls === c0 + 1);
	await page.evaluate(() => document.getElementById('scrim').click()); await page.waitForTimeout(300); await page.click('#menuBtn'); await page.waitForTimeout(800);
	ok('5 秒内反复开侧边栏不重复请求', menuCalls === c0 + 1, menuCalls - c0);
	await page.evaluate(() => document.getElementById('scrim').click()); await page.waitForTimeout(5200);
	MENU.items = MENU.items.filter((x) => x.p !== 'admin/services/testplug');
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(1200);
	const svc5 = await page.textContent('#sidenav [data-g="服务"]');
	ok('切回面板：卸载的插件自动消失、提示恢复', !/测试插件/.test(svc5) && /请去安装新的插件/.test(svc5), svc5);
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

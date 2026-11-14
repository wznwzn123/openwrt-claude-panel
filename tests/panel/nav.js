// 侧边栏分组、内嵌 Kwrt 原版页面、系统日志、进程 的测试
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { respond, LK, KILLED } = require('./mock');

const ROOT = (process.env.PANEL_WWW || path.join(__dirname, '..', '..', 'src', 'www'));
const OUT = path.join(__dirname, 'shots');
const calls = [], problems = [], results = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
let gateKey = 'lk123', luciMode = 'ok', luciHits = [];

// 模拟 Argon 主题的原版页面（有自己的顶栏、侧边栏、页脚）
const argon = (p) => `<!DOCTYPE html><html><head><title>Kwrt - LuCI</title><meta name="viewport" content="width=device-width"><style>
body{margin:0;font:14px sans-serif;background:#eee}.main{display:flex;height:100vh}.main-left{width:13rem;background:#333;color:#fff}
.main-right{flex:1;display:flex;flex-direction:column}header{background:#5e72e4;color:#fff;padding:20px}footer{padding:10px;background:#ccc}
#maincontent>.container{margin:0 2rem}.showSide{display:inline-block}</style></head>
<body><div class="main"><div class="main-left" id="mainmenu">ARGON MENU</div><div class="main-right"><header><a class="showSide">≡</a>ARGON HEADER</header>
<div id="maincontent"><div class="container"><h2 name="content">原版页面 ${p}</h2><p id="lfbody">${p}</p>
<a id="lflink" href="/cgi-bin/luci/admin/network/dns">去 DNS</a><a id="lfother" href="/cgi-bin/luci/admin/whatever">去别的</a></div></div>
<footer>ARGON FOOTER</footer></div></div></body></html>`;

(async () => {
	const browser = await chromium.launch();
	const dark = process.argv.includes('--dark');
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !/serviceWorker|sw\.js|Failed to load resource/.test(m.text())) problems.push('控制台：' + m.text()); });
	await ctx.route('http://panel.test/**', async (route) => {
		const u = new URL(route.request().url());
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(route.request().postData() || '{}');
			calls.push({ m: body.method, p: body.params });
			const result = respond(body.method, body.params || {});
			await new Promise((r) => setTimeout(r, 30));
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) });
		}
		if (u.pathname.startsWith('/cgi-bin/luci/')) {
			const ck = (await route.request().allHeaders()).cookie || '';
			const p = u.pathname.slice('/cgi-bin/luci/'.length);
			luciHits.push({ p, ck });
			await new Promise((r) => setTimeout(r, 150));
			if (luciMode === 'cf') return route.fulfill({ status: 530, contentType: 'text/html', body: '<html><head><title>Cloudflare Tunnel error | router.example.com | Cloudflare</title></head><body>Error 1033</body></html>' });
			if (luciMode === 'hang') await new Promise((r) => setTimeout(r, 2500)); // 很久才回
			if (!ck.split(/;\s*/).includes('cmcp_l=' + gateKey))
				return route.fulfill({ status: 403, contentType: 'text/html; charset=utf-8', body: '<p>请从路由器面板里打开这个页面。</p>' });
			return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: argon(p) });
		}
		let f = path.join(ROOT, u.pathname);
		if (f.endsWith('/')) f += 'index.html';
		if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
		const ct = f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream';
		return route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(f) });
	});
	await page.addInitScript(() => { if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('rp_token', 'testtoken1234567890'); sessionStorage.setItem('init', '1'); } });
	await page.goto('http://panel.test/panel/?p=home');
	await page.waitForTimeout(1500);
	const sfx = dark ? '-dark' : '';
	const shot = (n) => page.screenshot({ path: path.join(OUT, n + sfx + '.png') });
	const menu = async () => { await page.click('#menuBtn'); await page.waitForTimeout(450); };
	const vis = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.height > 4 && r.width > 4 && getComputedStyle(e).visibility !== 'hidden'; }, sel);

	/* ---------- 侧边栏分组 ---------- */
	await menu();
	await shot('nav-01-side');
	ok('7 个一级分组（「消息」：通知、我的反馈）', await page.locator('#sidenav .nghead').count() === 7);
	ok('默认展开 状态/代理/网络/工具，收起 服务/系统', await page.evaluate(() => ['状态', '代理', '网络', '工具'].every((g) => document.querySelector(`.ng[data-g="${g}"]`).classList.contains('open')) && ['服务', '系统'].every((g) => !document.querySelector(`.ng[data-g="${g}"]`).classList.contains('open'))));
	ok('收起的分组里的入口看不见', !(await vis('#sidenav button[data-p="k:admin/system/system"]')));
	ok('二级分组默认收起', !(await vis('#sidenav button[data-p="k:admin/network/firewall/forwards"]')));
	ok('不加多余标记，界面干净', await page.locator('#sidenav .org').count() === 0);
	ok('当前页高亮', await page.evaluate(() => document.querySelector('#sidenav button.on')?.dataset.p === 'home'));
	await page.click('.ng[data-g="系统"] > .nghead'); await page.waitForTimeout(450);
	ok('点「系统」展开', await vis('#sidenav button[data-p="k:admin/system/system"]'));
	await page.click('.ng[data-g="网络/防火墙"] > .nsub'); await page.waitForTimeout(450);
	ok('点「防火墙」展开下一级', await vis('#sidenav button[data-p="k:admin/network/firewall/forwards"]'));
	await shot('nav-02-expanded');
	await page.click('.ng[data-g="状态"] > .nghead'); await page.waitForTimeout(450);
	ok('点「状态」收起', !(await vis('#sidenav button[data-p="conn"]')));
	ok('展开状态记住了', await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('rp_nav')); return o['系统'] === 1 && o['网络/防火墙'] === 1 && o['状态'] === 0; }));
	ok('点分组标题不会关掉侧边栏', await page.evaluate(() => document.getElementById('side').classList.contains('open')));

	/* ---------- 搜索 ---------- */
	await page.fill('#sideQ', '端口');
	await page.waitForTimeout(200);
	ok('搜「端口」找到端口转发', await page.locator('#sidenav button[data-p="k:admin/network/firewall/forwards"]').count() === 1);
	ok('搜索结果显示所在位置', /网络 › 防火墙/.test(await page.locator('#sidenav button[data-p="k:admin/network/firewall/forwards"] .path').textContent()));
	await shot('nav-03-search');
	await page.fill('#sideQ', '没有这个功能xyz'); await page.waitForTimeout(150);
	ok('搜不到有提示', /没有找到/.test(await page.locator('#sidenav').textContent()));
	await page.fill('#sideQ', 'dhcp'); await page.waitForTimeout(150);
	await page.press('#sideQ', 'Enter'); await page.waitForTimeout(900);
	ok('回车打开第一个结果', await page.evaluate(() => localStorage.getItem('rp_page')) === 'k:admin/network/dhcp');
	ok('回车后清空搜索、恢复分组', (await page.inputValue('#sideQ')) === '' && await page.locator('#sidenav .nghead').count() === 7);

	/* ---------- 内嵌原版页面 ---------- */
	await page.waitForTimeout(600);
	ok('先向路由器要门禁钥匙', calls.some((c) => c.m === 'panel/luci_key'));
	ok('门禁 cookie 已设置', (await ctx.cookies('http://panel.test/cgi-bin/luci/')).some((c) => c.name === 'cmcp_l' && c.value === 'lk123'));
	ok('打开的是 DHCP 原版页', luciHits.some((h) => h.p === 'admin/network/dhcp' && /cmcp_l=lk123/.test(h.ck)));
	ok('顶上标题是 DHCP', (await page.textContent('#pageTitle')) === 'DHCP');
	const fr = () => page.frame({ url: /cgi-bin\/luci/ });
	ok('原版页面显示出来了', !!fr() && (await fr().textContent('#lfbody')) === 'admin/network/dhcp');
	ok('加载遮罩已消失', await page.evaluate(() => document.getElementById('lfMask').classList.contains('hidden')));
	const hid = await fr().evaluate(() => ['header', '.main-left', 'footer', '.showSide'].map((s) => getComputedStyle(document.querySelector(s)).display));
	ok('Argon 的顶栏/侧边栏/页脚都隐藏了', hid.every((d) => d === 'none'), hid.join(','));
	ok('底部快捷栏在原版页面隐藏', !(await vis('#dock')));
	const box = await page.evaluate(() => { const r = document.getElementById('lfr').getBoundingClientRect(), t = document.getElementById('topbar').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, w: r.width, tb: t.bottom }; });
	ok('原版页面铺满顶栏下方', Math.abs(box.top - box.tb) <= 3 && box.bottom >= 840 && box.w >= 389, JSON.stringify(box));
	ok('侧边栏里 DHCP 高亮', await page.evaluate(() => document.querySelector('#sidenav button.on')?.dataset.p === 'k:admin/network/dhcp'));
	await shot('nav-04-luci');
	// 在原版页面里点到别的页面
	await fr().click('#lflink'); await page.waitForTimeout(700);
	ok('原版页面里跳转后标题跟着变', (await page.textContent('#pageTitle')) === 'DNS');
	await fr().click('#lfother'); await page.waitForTimeout(700);
	ok('跳到目录里没有的页面用它自己的标题', (await page.textContent('#pageTitle')) === '原版页面 admin/whatever');
	ok('跳转后依然隐藏 Argon 外壳', (await fr().evaluate(() => getComputedStyle(document.querySelector('header')).display)) === 'none');
	// 刷新按钮重新打开
	const n0 = luciHits.length;
	await page.click('#refreshBtn'); await page.waitForTimeout(700);
	ok('刷新按钮重新打开当前原版页', luciHits.length > n0 && luciHits[luciHits.length - 1].p === 'admin/network/dhcp');
	// 自动刷新不会重新载入原版页面
	const n1 = luciHits.length;
	await page.waitForTimeout(4500);
	ok('定时刷新不打扰原版页面', luciHits.length === n1);

	/* ---------- 门禁钥匙换了：自动重新取 ---------- */
	gateKey = 'lk999'; LK.key = 'lk999';
	await menu();
	await page.click('#sidenav button[data-p="k:admin/network/dns"]'); await page.waitForTimeout(1200);
	ok('钥匙过期会自动重新取并打开', (await fr()?.textContent('#lfbody')) === 'admin/network/dns' && calls.filter((c) => c.m === 'panel/luci_key').length >= 2);
	gateKey = 'nope';
	await page.click('#refreshBtn'); await page.waitForTimeout(1500);
	ok('真的没权限时显示提示和重试按钮', /没有权限/.test(await page.textContent('#lfMsg')) && await vis('#lfRetry'));
	gateKey = 'lk999';
	await page.click('#lfRetry'); await page.waitForTimeout(900);
	ok('点重试恢复', await page.evaluate(() => document.getElementById('lfMask').classList.contains('hidden')));

	/* ---------- 路由器连不上（Cloudflare 错误页） ---------- */
	luciMode = 'cf';
	await page.click('#refreshBtn'); await page.waitForTimeout(900);
	ok('Cloudflare 错误页不直接显示，改成提示', /连不上路由器/.test(await page.textContent('#lfMsg')) && await vis('#lfMask'));
	await shot('nav-05-luci-off');
	luciMode = 'ok';

	/* ---------- 回到面板自己的页面 ---------- */
	await menu();
	await page.click('#sidenav button[data-p="dev"]'); await page.waitForTimeout(700);
	ok('回到面板页面：原版页面关掉', await page.evaluate(() => document.getElementById('lfr').getAttribute('src') === 'about:blank' && !document.getElementById('p-luci').classList.contains('on')));
	ok('底部快捷栏回来了', await vis('#dock'));
	ok('顶上进度条没卡住', !(await page.evaluate(() => document.getElementById('tload').classList.contains('on'))));

	/* ---------- 重开面板后停在原版页面 ---------- */
	await menu();
	await page.click('#sidenav button[data-p="k:admin/services/upnp"]').catch(async () => {
		await page.click('.ng[data-g="服务"] > .nghead'); await page.waitForTimeout(400); await page.click('#sidenav button[data-p="k:admin/services/upnp"]');
	});
	await page.waitForTimeout(900);
	await page.reload(); await page.waitForTimeout(2200);
	ok('重开面板回到上次的原版页', (await page.textContent('#pageTitle')) === 'UPnP' && (await fr()?.textContent('#lfbody')) === 'admin/services/upnp');
	await menu();
	ok('重开后它所在的分组是展开的', await vis('#sidenav button[data-p="k:admin/services/upnp"]'));
	await page.mouse.click(375, 500); await page.waitForTimeout(400);

	/* ---------- 一直没反应 ---------- */
	luciMode = 'hang';
	await page.evaluate(() => { window.__st = setTimeout; window.setTimeout = (f, ms, ...a) => window.__st(f, ms === 30000 ? 800 : ms, ...a); });
	await page.click('#refreshBtn'); await page.waitForTimeout(1600);
	ok('太久没打开显示提示', /太慢/.test(await page.textContent('#lfMsg')) && await vis('#lfRetry'));
	await page.evaluate(() => { window.setTimeout = window.__st; });
	luciMode = 'ok';
	await page.click('#lfRetry'); await page.waitForTimeout(3500);
	ok('重试后正常', await page.evaluate(() => document.getElementById('lfMask').classList.contains('hidden')), await page.textContent('#lfMsg') + ' / ' + luciHits.slice(-2).map((h) => h.p).join(','));

	/* ---------- 系统日志 ---------- */
	await menu();
	await page.click('#sidenav button[data-p="slog"]').catch(async () => { await page.click('.ng[data-g="状态"] > .nghead'); await page.waitForTimeout(400); await page.click('#sidenav button[data-p="slog"]'); });
	await page.waitForTimeout(800);
	ok('系统日志读到了', /dnsmasq/.test(await page.textContent('#slBox')) && (await page.textContent('#slCount')) === '4 行');
	ok('最新的在最上面', (await page.locator('#slBox span').first().textContent()).includes('br-lan'));
	ok('错误标红', await page.locator('#slBox span.e').count() === 1 && await page.locator('#slBox span.w').count() === 1);
	await shot('nav-06-slog');
	await page.fill('#slFilter', 'odhcpd'); await page.waitForTimeout(200);
	ok('筛选关键字', (await page.textContent('#slCount')) === '1 行');
	await page.fill('#slFilter', '');
	await page.click('#slErr'); await page.waitForTimeout(200);
	ok('只看错误', (await page.textContent('#slCount')) === '1 行' && (await page.textContent('#slErr')) === '显示全部');
	await page.click('#slErr');
	await page.click('#slSeg [data-k="kern"]'); await page.waitForTimeout(800);
	ok('切到内核日志', /Booting Linux/.test(await page.textContent('#slBox')) && calls.some((c) => c.m === 'panel/slog' && c.p.kind === 'kern'));
	const sl0 = calls.filter((c) => c.m === 'panel/slog').length;
	await page.waitForTimeout(4300);
	ok('系统日志自动刷新', calls.filter((c) => c.m === 'panel/slog').length > sl0);

	/* ---------- 进程 ---------- */
	await menu();
	await page.click('#sidenav button[data-p="proc"]'); await page.waitForTimeout(800);
	const names = await page.$$eval('#prList b', (x) => x.map((b) => b.childNodes[0].textContent.trim()));
	ok('按 CPU 排序，默认不显示内核线程', names.join(',') === 'dockerd,clash,cloudflared,procd', names.join(','));
	ok('内存合计', /内存已用 361 MB \/ 406 MB/.test(await page.textContent('#prMem')));
	ok('CPU 高的标红', await page.locator('#prList .prrow').first().locator('.pill.red').count() === 1);
	await shot('nav-07-proc');
	await page.click('#prSort [data-s="mem"]'); await page.waitForTimeout(150);
	ok('按内存排序', (await page.$$eval('#prList b', (x) => x[0].childNodes[0].textContent)) === 'clash');
	await page.click('#prSort [data-s="kt"]'); await page.waitForTimeout(150);
	ok('显示内核线程', (await page.textContent('#prCount')) === '6 个');
	await page.click('#prSort [data-s="kt"]');
	await page.fill('#prFilter', 'openclash'); await page.waitForTimeout(150);
	ok('搜索进程', (await page.textContent('#prCount')) === '1 个');
	await page.fill('#prFilter', '');
	await page.click('#prList [data-pid="8286"]'); await page.waitForTimeout(450);
	ok('系统进程不能结束', await page.evaluate(() => document.querySelector('.modal [data-v="term"]').disabled && /不能在这里结束/.test(document.querySelector('.modal').textContent)));
	await shot('nav-08-proc-sys');
	await page.click('.modal [data-v="false"]'); await page.waitForTimeout(400);
	await page.click('#prList [data-pid="22919"]'); await page.waitForTimeout(450);
	await page.click('.modal [data-v="kill"]'); await page.waitForTimeout(450);
	ok('结束前再确认一次', /结束「clash」/.test(await page.textContent('.modal h3')));
	await page.click('.modal [data-v="true"]'); await page.waitForTimeout(800);
	ok('强制结束发给路由器', KILLED.some((k) => k.pid === 22919 && k.force === true));
	ok('结束后提示', /已结束/.test(await page.textContent('#toast')));

	/* ---------- 宽屏：侧边栏常驻 ---------- */
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.evaluate(() => document.querySelector('#sidenav button[data-p="k:admin/network/dhcp"]')?.click());
	await page.waitForTimeout(1000);
	const wb = await page.evaluate(() => { const r = document.getElementById('lfr').getBoundingClientRect(), s = document.getElementById('side').getBoundingClientRect(); return { l: r.left, sr: s.right, w: r.width }; });
	ok('宽屏时原版页面在侧边栏右边', Math.abs(wb.l - wb.sr) <= 2 && wb.w > 900, JSON.stringify(wb));
	await shot('nav-09-wide');

	await browser.close();
	const pass = results.filter((r) => r[1]).length;
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${pass}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

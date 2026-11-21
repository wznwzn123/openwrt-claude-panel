// 6.0 第 1 项：完整原版后台（面板这边）：侧边栏入口、要入口票、原样打开 LuCI 登录页、退出、离开时清掉入口票、
// 跟「原版页面」互不影响、入口过期自动重新取、没有「完全控制」的家人看不到；布局（390 / 320 宽，浅色 / 深色）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');
const ROOT = process.env.PANEL_WWW || path.join(__dirname, '..', '..', 'src', 'www');
const OUT = path.join(__dirname, 'shots');
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const W = (ms) => new Promise((r) => setTimeout(r, ms));
let ROLE = { role: 'owner', perms: [] }, calls = [], hits = [], ticketN = 0, expireNext = false;
const login = '<!doctype html><html><head><title>Kwrt - LuCI</title><meta name="viewport" content="width=device-width"></head><body style="margin:0;font:14px sans-serif"><header style="background:#5e72e4;color:#fff;padding:16px">ARGON HEADER</header><form id="lgf" method="post" style="padding:20px"><h2>需要授权</h2><input name="luci_username" value="root"><input name="luci_password" type="password"><button>登录</button></form></body></html>';
(async () => {
	const browser = await chromium.launch();
	for (const dark of [false, true]) {
		const sfx = dark ? '-dark' : '';
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await ctx.route('http://panel.test/**', async (route) => {
			const u = new URL(route.request().url());
			if (u.pathname.startsWith('/cgi-bin/mcp/')) {
				const body = JSON.parse(route.request().postData() || '{}'), m = body.method.replace(/^panel\//, '');
				calls.push(m);
				const R = (result) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) });
				if (m === 'whoami') return R({ hosted: true, hub: 'https://hub.example', role: ROLE.role, perms: ROLE.perms, uid: 'u1', dev: 'abcd1234' });
				if (m === 'luci_full') { ticketN++; return R({ ticket: String(ticketN).padStart(32, 'a'), exp: Date.now() / 1000 + 43200, locked: null }); }
				return R(respond(body.method, body.params || {}));
			}
			if (u.pathname.startsWith('/cgi-bin/luci')) {
				const ck = (await route.request().allHeaders()).cookie || '';
				hits.push({ p: u.pathname, ck });
				if (!/cmcp_l=/.test(ck)) return route.fulfill({ status: 403, contentType: 'text/html; charset=utf-8', body: '<p>请从路由器面板里打开这个页面。</p>' });
				if (/cmcp_f=/.test(ck) && expireNext) { expireNext = false; return route.fulfill({ status: 403, contentType: 'text/html; charset=utf-8', body: '<h2>入口过期了</h2>' }); }
				return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: /cmcp_f=/.test(ck) ? login : '<p id="lfbody">' + u.pathname + '</p>' });
			}
			if (u.pathname.startsWith('/cloud/')) return route.fulfill({ status: 403, body: '{}' });
			let f = path.join(ROOT, u.pathname); if (f.endsWith('/')) f += 'index.html';
			if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
			return route.fulfill({ status: 200, contentType: f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream', body: fs.readFileSync(f) });
		});
		await page.addInitScript(() => { if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('rp_dev', 'abcd1234.' + 'k'.repeat(32)); sessionStorage.setItem('init', '1'); } });
		ROLE = { role: 'owner', perms: [] };
		await page.goto('http://panel.test/panel/?p=home'); await W(1500);
		await page.click('#menuBtn'); await W(500);
		ok('侧边栏「工具」里有「完整原版后台」' + sfx, await page.locator('#sidenav button[data-p="lfull"]').count() === 1);
		calls = []; hits = [];
		await page.click('#sidenav button[data-p="lfull"]'); await W(1500);
		const cks = await ctx.cookies('http://panel.test/cgi-bin/luci/');
		ok('打开时先要入口票，门禁钥匙和入口票都放进 Cookie（关掉浏览器就没了）' + sfx, calls.includes('luci_full') && cks.some((c) => c.name === 'cmcp_f' && c.expires === -1) && cks.some((c) => c.name === 'cmcp_l'));
		const fr = page.frame({ url: /cgi-bin\/luci/ });
		ok('原样打开原版后台的登录页（顶栏、主题都是它自己的，不注入样式）' + sfx, !!fr && (await fr.textContent('h2')) === '需要授权' && await fr.evaluate(() => getComputedStyle(document.querySelector('header')).display !== 'none'));
		ok('顶上写着「完整原版后台」，下面有说明和「退出完整后台」' + sfx, (await page.textContent('#pageTitle')) === '完整原版后台' && /路由器密码登录/.test(await page.textContent('#lffBar')) && await page.isVisible('#lffOut'));
		ok('底部快捷栏在完整后台隐藏' + sfx, !(await page.isVisible('.dock')));
		const box = await page.evaluate(() => { const r = document.getElementById('lff').getBoundingClientRect(); return { w: r.width, h: r.height, b: r.bottom, sw: document.documentElement.scrollWidth }; });
		ok('完整后台铺满屏幕、不横向滚动' + sfx, box.w >= 389 && box.b >= 840 && box.sw <= 390, JSON.stringify(box));
		await page.screenshot({ path: path.join(OUT, 'lfull' + sfx + '.png') });
		await page.setViewportSize({ width: 320, height: 640 }); await W(400);
		const bar = await page.evaluate(() => { const b = document.getElementById('lffOut').getBoundingClientRect(); return { r: b.right, sw: document.documentElement.scrollWidth }; });
		ok('320 宽的手机：说明条不挤掉按钮、不横向滚动' + sfx, bar.r <= 320 && bar.sw <= 320, JSON.stringify(bar));
		await page.screenshot({ path: path.join(OUT, 'lfull-320' + sfx + '.png') });
		await page.setViewportSize({ width: 390, height: 844 }); await W(300);
		// 入口过期：自动重新取一次
		if (!dark) {
			expireNext = true; calls = [];
			await page.click('#menuBtn'); await W(400); await page.click('#sidenav button[data-p="home"]'); await W(600);
			await page.click('#menuBtn'); await W(400); await page.click('#sidenav button[data-p="lfull"]'); await W(2000);
			ok('入口过期：自动重新取一次入口票，照常打开', calls.filter((c) => c === 'luci_full').length === 2 && (await page.frame({ url: /cgi-bin\/luci/ })?.textContent('h2')) === '需要授权');
		}
		// 退出
		await page.click('#lffOut'); await W(400);
		ok('退出前确认，说明要重新输密码' + sfx, /重新输路由器密码/.test(await page.textContent('.modal')));
		await page.locator('.modal').last().locator('button:has-text("退出")').click(); await W(1800);
		const ck2 = await ctx.cookies('http://panel.test/cgi-bin/luci/');
		ok('退出：让原版后台自己退出、回到概览、清掉入口票' + sfx, hits.some((h) => /admin\/logout/.test(h.p)) && (await page.textContent('#pageTitle')) === '概览' && !ck2.some((c) => c.name === 'cmcp_f'));
		// 之后打开面板里的「原版页面」：不带入口票，照旧自动登录
		hits = [];
		await page.goto('http://panel.test/panel/?p=k:admin/network/dhcp'); await W(1800);
		ok('之后打开面板里的「原版页面」：不带入口票（照旧自动登录）' + sfx, hits.length > 0 && hits.every((h) => !/cmcp_f=/.test(h.ck)), JSON.stringify(hits.map((h) => h.ck)));
		// 没有「完全控制」的家人：看不到入口，直接打开也不行
		ROLE = { role: 'sub', perms: ['msg', 'node', 'proxy'] };
		await page.goto('http://panel.test/panel/?p=home'); await W(1500); await page.reload(); await W(1500);
		await page.click('#menuBtn'); await W(500);
		ok('家人没有「完全控制」：侧边栏看不到「完整原版后台」' + sfx, await page.locator('#sidenav button[data-p="lfull"]').count() === 0);
		calls = [];
		await page.goto('http://panel.test/panel/?p=lfull'); await W(1500);
		ok('家人没有「完全控制」：直接打开也不行，不去要入口票' + sfx, !calls.includes('luci_full') && (await page.textContent('#pageTitle')) !== '完整原版后台');
		ROLE = { role: 'sub', perms: ['net'] };
		await page.reload(); await W(1500); await page.reload(); await W(1200);
		await page.click('#menuBtn'); await W(500);
		ok('家人有「完全控制」：能看到入口' + sfx, await page.locator('#sidenav button[data-p="lfull"]').count() === 1);
		await ctx.close();
	}
	await browser.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

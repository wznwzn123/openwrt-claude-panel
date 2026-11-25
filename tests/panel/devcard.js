// 6.0 第 84、87、88 项：设备卡片的图标（自动认 / 自己选 / 相册照片）、离线设备删除和一键清除、卡片只留「暂停上网」「更多」、「更多」分组
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const M = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}');
			const m = body.method.replace(/^panel\//, '');
			if (m === 'whoami' && SUB.on) return J({ jsonrpc: '2.0', id: body.id, result: { ...M.respond('whoami', {}), role: 'sub', perms: ['msg'] } });
			try { return J(M.reply(body.id, m, body.params || {})); }
			catch (e) { return J({ jsonrpc: '2.0', id: body.id, error: { code: e.code || -32000, message: e.message } }); }
		}
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
	});
});
const SUB = { on: false };
const reset = () => { for (const o of [M.DN, M.DI, M.DH, M.DIMG]) for (const k of Object.keys(o)) delete o[k]; M.DEVFORGET.length = 0; for (const k of Object.keys(M.PZ.devs)) delete M.PZ.devs[k]; };
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8098, r));
	const browser = await chromium.launch();
	// ---- 功能（390 宽） ----
	{
		reset();
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8098/panel/?p=dev'); await W(2500);
		const card = (i) => page.locator(`#dvList [data-i="${i}"]`);
		const kind = (i) => card(i).locator('.dvic').getAttribute('aria-label');
		// 第 84 项：自动认图标
		ok('按名字认：iPhone 是手机', /手机/.test(await kind(0)), await kind(0));
		ok('按名字认：TV 是电视', /电视/.test(await kind(1)), await kind(1));
		ok('按厂商认：乐鑫（ESP）模块是智能家居', /智能家居/.test(await kind(3)), await kind(3));
		ok('随机 MAC、没名字的认成手机', /手机/.test(await kind(4)), await kind(4));
		ok('按名字认：DiskStation 是电脑', /电脑/.test(await kind(5)), await kind(5));
		ok('读不到 MAC 的设备：图标不能点、名字不能改', (await card(2).locator('button.dvic').count()) === 0 && (await card(2).locator('[data-ren]').count()) === 0);
		// 第 88 项：卡片上只留「暂停上网」「更多」
		ok('卡片上只有「暂停上网」和「更多」', (await card(0).locator('.rowbtns button').allTextContents()).join() === '暂停上网,更多', (await card(0).locator('.rowbtns button').allTextContents()).join());
		ok('读不到 MAC 的：只有「更多」', (await card(2).locator('.rowbtns button').allTextContents()).join() === '更多');
		// 更多：分组
		await card(0).locator('[data-more]').click(); await W(600);
		const groups = await page.$$eval('.modal .mgrp', (gs) => gs.map((g) => [(g.querySelector('.mgt') || {}).textContent || '', [...g.querySelectorAll('.mact b')].map((b) => b.textContent)]));
		ok('在线设备的「更多」：看连接 / 名字和图标 / 上网控制（6.0 第 16 项加了上网计划，第 20 项加了限速），三组，没有删除', JSON.stringify(groups) === JSON.stringify([['', ['看连接']], ['名字和图标', ['改名字', '换图标']], ['上网控制', ['暂停上网', '上网计划', '限速', '不走代理']]]), JSON.stringify(groups));
		await page.screenshot({ path: path.join(__dirname, 'shots', 'devcard-more.png') });
		await page.click('.modal [data-v="icon"]'); await W(700);
		// 换内置图标
		ok('选图标：有「用相册里的照片」、十几种内置图标、自动识别', (await page.locator('.modal [data-photo]').count()) === 1 && (await page.locator('.modal .dvpick').count()) === 13 && /自动识别（现在认成「手机」）/.test(await page.textContent('.modalbox')));
		await page.click('.modal .dvpick[data-k="tablet"]'); await W(900);
		ok('换成平板：存到路由器，卡片上跟着变', M.DI['aa:bb:cc:dd:ee:ff'] === 'tablet' && /平板/.test(await kind(0)), JSON.stringify(M.DI));
		// 相册照片
		await card(0).locator('[data-icon]').click(); await W(600);
		const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.modal [data-photo]')]);
		await fc.setFiles(path.join(__dirname, 'devphoto.png')); await W(1500);
		const im = M.DIMG['aa:bb:cc:dd:ee:ff'];
		ok('选了照片：裁成小方图（不到 40 KB）传到路由器', im && /^data:image\/(webp|jpeg);base64,/.test(im.u) && im.u.length < 40000, im ? im.u.slice(0, 30) + ' ' + im.u.length : '没传');
		ok('卡片上显示照片', /url\("?data:image/.test(await card(0).locator('.dvic').evaluate((e) => e.style.backgroundImage)) && /照片/.test(await kind(0)));
		await page.locator('#dvList').screenshot({ path: path.join(__dirname, 'shots', 'devcard-photo.png') });
		// 刷新页面：照片从路由器再取一次
		await page.reload(); await W(2800);
		ok('重新打开面板：照片还在（从路由器取）', /url\("?data:image/.test(await card(0).locator('.dvic').evaluate((e) => e.style.backgroundImage)));
		await card(0).locator('[data-icon]').click(); await W(600);
		ok('有照片时：能「换一张照片」「不用照片」', /换一张照片/.test(await page.textContent('.modalbox')) && /不用照片/.test(await page.textContent('.modalbox')));
		await page.click('.modal .mact.danger'); await W(900);
		ok('不用照片：改回之前选的平板', !M.DIMG['aa:bb:cc:dd:ee:ff'] && /平板/.test(await kind(0)));
		await card(0).locator('[data-icon]').click(); await W(600);
		await page.click('.modal button[data-k=""]'); await W(900);
		ok('改回自动识别', !M.DI['aa:bb:cc:dd:ee:ff'] && /手机/.test(await kind(0)));
		// 第 87 项：离线设备删除
		await card(3).locator('[data-more]').click(); await W(600);
		const last = await page.$$eval('.modal .mgrp', (gs) => [...gs.pop().querySelectorAll('.mact')].map((b) => [b.className, b.textContent]));
		ok('离线设备的「更多」最下面单独一组：从列表删除（红色）', last.length === 1 && /danger/.test(last[0][0]) && /从列表删除/.test(last[0][1]), JSON.stringify(last));
		await page.click('.modal [data-v="forget"]'); await W(600);
		ok('删前确认：说清楚以后再连上会重新出现', /再连上，会作为新设备重新出现/.test(await page.textContent('.modalbox')));
		await page.click('.modal [data-v="true"]'); await W(1200);
		ok('删掉了：列表里没了', M.DEVFORGET.length === 1 && !/ESP_1A2B3C/.test(await page.textContent('#dvList')));
		// 有设置的设备：删前列出会一起删掉的设置
		M.PZ.devs['00:11:32:aa:bb:cc'] = { name: 'DiskStation', sched: [{ from: '23:00', to: '07:00' }] };
		M.DN['00:11:32:aa:bb:cc'] = '书房 NAS';
		await page.click('#nav-dev, [data-p="dev"]').catch(() => {});
		await page.reload(); await W(2800);
		const nas = page.locator('#dvList .dvcard', { hasText: '书房 NAS' });
		await nas.locator('[data-more]').click(); await W(600);
		await page.click('.modal [data-v="forget"]'); await W(600);
		const t = await page.textContent('.modalbox');
		ok('有设置的设备删前列出：定时断网、改过的名字', /每天定时断网（23:00–07:00）/.test(t) && /改过的名字「书房 NAS」/.test(t) && /上面的设置要重新设/.test(t), t);
		await page.screenshot({ path: path.join(__dirname, 'shots', 'devcard-forget.png') });
		await page.click('.modal [data-v="false"]'); await W(500);
		// 一键清除：有设置的跳过
		ok('有离线设备时显示「清除离线设备」', await page.isVisible('#dvClear'));
		await page.click('#dvClear'); await W(600);
		const ct = await page.textContent('.modalbox');
		ok('一键清除：说清楚删几台、有设置的几台不删', /会从列表删掉 2 台离线设备/.test(ct) && /有设置的 1 台不删/.test(ct), ct);
		await page.click('.modal [data-v="true"]'); await W(1200);
		const fg = M.DEVFORGET[M.DEVFORGET.length - 1];
		ok('一键清除只传没设置的，并标明 only_plain', fg && fg.only_plain === true && fg.items.length === 2 && !fg.items.some((x) => x.mac === '00:11:32:aa:bb:cc'), JSON.stringify(fg));
		ok('清完：只剩在线的和有设置的', (await page.locator('#dvList .dvcard').count()) === 3, String(await page.locator('#dvList .dvcard').count()));
		await ctx.close();
	}
	// ---- 子账号没有「家长控制」：不能改名、换图标、删除 ----
	{
		reset(); SUB.on = true;
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
		const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8098/panel/?p=dev'); await W(2500);

		const c = page.locator('#dvList [data-i="3"]');
		ok('子账号：名字、图标不能点，没有「清除离线设备」', (await page.locator('#dvList [data-ren]').count()) === 0 && (await page.locator('#dvList button.dvic').count()) === 0 && !(await page.isVisible('#dvClear')));
		await c.locator('[data-more]').click(); await W(600);
		ok('子账号的「更多」只有看连接', (await page.locator('.modal .mact b').allTextContents()).join() === '看连接', (await page.locator('.modal .mact b').allTextContents()).join());
		await ctx.close(); SUB.on = false;
	}
	// ---- 布局：320 / 390 / 430、浅色深色 ----
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		reset(); M.DN['aa:bb:cc:dd:ee:ff'] = '妈妈的 iPhone 15 Pro Max 长名字测试';
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8098/panel/?p=dev'); await W(2500);
		const tag = `${w}${dark ? ' 深色' : ''}`;
		const g = await page.evaluate(() => {
			const bad = [];
			for (const c of document.querySelectorAll('#dvList .dvcard')) {
				const cr = c.getBoundingClientRect();
				for (const e of c.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (r.width && (r.right > cr.right + 1 || r.left < cr.left - 1)) bad.push(e.className || e.tagName); }
				const n = c.querySelector('.dvname'), p = c.querySelector('.pill');
				if (n && p && n.getBoundingClientRect().right > p.getBoundingClientRect().left + 1) bad.push('名字压到状态');
				const btns = [...c.querySelectorAll('.rowbtns button')];
				if (btns.some((b) => b.getBoundingClientRect().height > 40)) bad.push('按钮折行');
				const mac = c.querySelector('.dvaddr'); if (mac && mac.scrollWidth > mac.clientWidth + 1) bad.push('MAC 被截');
			}
			return { ow: document.documentElement.scrollWidth - innerWidth, bad };
		});
		ok(`[${tag}] 设备页不横向滚动、卡片里没有东西出界或被截`, g.ow <= 0 && !g.bad.length, JSON.stringify(g));
		ok(`[${tag}] 长名字一行放不下时省略，不顶出卡片`, await page.locator('#dvList [data-i="0"] .dvname .ell').evaluate((e) => e.scrollWidth > e.clientWidth && getComputedStyle(e).textOverflow === 'ellipsis'));
		await page.screenshot({ path: path.join(__dirname, 'shots', `devcard-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		await page.locator('#dvList [data-i="3"] [data-more]').click(); await W(700);
		const m = await page.evaluate(() => { const b = document.querySelector('.modal .modalbox').getBoundingClientRect(); return { h: b.height, top: b.top, sw: document.querySelector('.modal .modalbox').scrollWidth - document.querySelector('.modal .modalbox').clientWidth }; });
		ok(`[${tag}] 「更多」从下面弹出，不占满屏幕、不横向滚动`, m.top > 40 && m.sw <= 0, JSON.stringify(m));
		await page.screenshot({ path: path.join(__dirname, 'shots', `devcard-more-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-v="close"]'); await W(500);
		await page.locator('#dvList [data-i="0"] [data-icon]').click(); await W(700);
		const ic = await page.evaluate(() => { const b = document.querySelector('.modal .modalbox'); const bad = [...b.querySelectorAll('.dvpick span:last-child')].filter((s) => s.scrollWidth > s.clientWidth + 1).length; return { sw: b.scrollWidth - b.clientWidth, bad }; });
		ok(`[${tag}] 选图标：图标名字不被截、不横向滚动`, ic.sw <= 0 && !ic.bad, JSON.stringify(ic));
		await page.screenshot({ path: path.join(__dirname, 'shots', `devcard-icon-${w}${dark ? '-dark' : ''}.png`) });
		await ctx.close();
	}
	await browser.close(); server.close();
	for (const [n, c, note] of results) console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + note + '）'));
	console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

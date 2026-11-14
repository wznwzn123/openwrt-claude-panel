// 代理插件适配 + 断线原因提示 专项测试
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { respond, WD, cloudStatus, AUTO, PXM, OC } = require('./mock');

const ROOT = (process.env.PANEL_WWW || path.join(__dirname, '..', '..', 'src', 'www'));
const OUT = path.join(__dirname, 'shots');
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };

async function open(browser, opt = {}) {
	const ctx = await browser.newContext({ viewport: opt.vp || { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: !opt.vp, hasTouch: !opt.vp, colorScheme: opt.dark ? 'dark' : 'light' });
	if (opt.storage) await ctx.addInitScript((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); if (st.rp_page) sessionStorage.setItem('rp_page', st.rp_page); /* 面板默认打开首页；测试里模拟「同一个标签页里刷新，停在原来那页」 */ }, opt.storage);
	const page = await ctx.newPage();
	const calls = [];
	page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !/serviceWorker|sw\.js|Failed to load resource/.test(m.text())) problems.push('控制台：' + m.text()); });
	const ctl = { mode: opt.mode || 'ok', cloud: opt.cloud, tablet: opt.tablet };
	await page.route('http://panel.test/**', async (route) => {
		const u = new URL(route.request().url());
		if (u.pathname === '/cloud/s') {
			calls.push('cloud');
			const body = JSON.parse(route.request().postData() || '{}');
			if (ctl.cloud === 'down') return route.abort('connectionrefused');
			if (body.token !== 'testtoken1234567890') return route.fulfill({ status: 403, body: '{"error":"bad token"}' });
			if (body.clear) ctl.cloudCleared = true;
			const st = cloudStatus(ctl.cloud || 'ok', ctl.tablet !== false);
			if (ctl.cloudCleared) st.events = [];
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(st) });
		}
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(route.request().postData() || '{}');
			calls.push(body.method);
			if (ctl.mode === '530') return route.fulfill({ status: 530, contentType: 'text/html', body: 'error code: 1033' });
			if (ctl.mode === '502') return route.fulfill({ status: 502, contentType: 'text/html', body: 'Bad gateway' });
			if (ctl.mode === 'down') return route.abort('connectionrefused');
			await new Promise((r) => setTimeout(r, 30));
			let res; try { res = { result: respond(body.method, body.params || {}) }; } catch (e) { res = { error: { code: -32000, message: e.message } }; }
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, ...res }) });
		}
		let f = path.join(ROOT, u.pathname);
		if (f.endsWith('/')) f += 'index.html';
		if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
		return route.fulfill({ status: 200, contentType: f.endsWith('.html') ? 'text/html' : 'text/javascript', body: fs.readFileSync(f) });
	});
	await page.addInitScript(() => localStorage.setItem('rp_token', 'testtoken1234567890'));
	return { page, ctx, calls, ctl };
}
const txt = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent || '', sel);
const PL = (active, list) => ({ active, list });
const PW = { id: 'passwall', name: 'PassWall', kind: 'other', enabled: true, running: true };
const OCX = { id: 'openclash', name: 'OpenClash', kind: 'clash', enabled: true, running: true };
const NK = { id: 'nikki', name: 'Nikki', kind: 'clash', enabled: true, running: true };
const vis = (page, sel) => page.isVisible(sel);
const navTxt = (page) => page.evaluate(() => [...document.querySelectorAll('#sidenav button[data-p]')].map((b) => b.dataset.p).filter((p) => !p.startsWith('k:')).join('|'));
const home = async (page) => { await page.goto('http://panel.test/panel/?p=home'); await page.waitForTimeout(1600); };
(async () => {
	const browser = await chromium.launch();
	// 1 PassWall 在用
	PXM.px = { ...PL('passwall', [{ ...OCX, enabled: false, running: false }, PW]), cur: 'n1', curName: '香港 01', count: 3 };
	let { page, ctx } = await open(browser);
	await home(page);
	ok('[PassWall] 概览：开关写着「PassWall 已开启」，下面是当前节点', /PassWall 已开启/.test(await txt(page, '#pxTitle')) && /香港 01/.test(await txt(page, '#pxSub')));
	ok('[PassWall] 不显示 OpenClash 的代理模式、运行模式、OpenClash 卡片、OpenClash 快捷操作', !(await vis(page, '#modeBox')) && !(await vis(page, '#runBox')) && !(await vis(page, '#ocCard')) && !(await vis(page, '#qCard')));
	ok('[PassWall] 显示 PassWall 卡片：当前节点、节点数、状态', await vis(page, '#pgCard') && /PassWall/.test(await txt(page, '#pgName')) && /香港 01/.test(await txt(page, '#pgCur')) && /3 个/.test(await txt(page, '#pgCnt')));
	ok('[PassWall] 右上角是「在线」，标签写着 PassWall 运行中', /在线/.test(await txt(page, '#statusText')) && /PassWall 运行中/.test(await txt(page, '#ocPill')));
	await page.screenshot({ path: path.join(OUT, 'px-passwall.png') });
	const nt = await navTxt(page);
	const has = (t, x) => ('|' + t + '|').includes('|' + x + '|');
	ok('[PassWall] 侧边栏：不显示 Clash 内核才有的「节点」「连接」；OpenClash 装着（关着），它的页面还在', !has(nt, 'proxy') && !has(nt, 'conn') && has(nt, 'cfg'), nt.slice(0, 200));
	await page.click('#pgNodes'); await page.waitForTimeout(700);
	ok('[PassWall] 换节点：列出节点，正在用的标出来', (await page.evaluate(() => document.querySelectorAll('.modal [data-v^="n:"]').length)) === 3 && /正在用/.test(await txt(page, '.modal [data-v="n:n1"]')));
	await page.click('.modal [data-t]'); await page.waitForTimeout(800);
	ok('[PassWall] 测延迟：显示毫秒和「不通」', /260 ms/.test(await txt(page, '.modal [data-v="n:n3"]')) && /不通/.test(await txt(page, '.modal [data-v="n:n2"]')) && PXM.calls.some((c) => c[0] === 'delay'));
	await page.screenshot({ path: path.join(OUT, 'px-nodes.png') });
	await page.click('.modal [data-v="n:n3"]'); await page.waitForTimeout(500);
	await page.click('.modal [data-v="true"]'); await page.waitForTimeout(800);
	ok('[PassWall] 点节点、确认：切换到这个节点', PXM.calls.some((c) => c[0] === 'set' && c[1] === 'passwall' && c[2] === 'n3'));
	await page.locator('#pxRow .sw').click(); await page.waitForTimeout(500);
	ok('[PassWall] 关开关：先问一下（会断网）', await vis(page, '.modal') && /关闭 PassWall/.test(await txt(page, '.modal h3')));
	await page.click('.modal [data-v="true"]'); await page.waitForTimeout(800);
	ok('[PassWall] 确认后：关掉 PassWall 的总开关', PXM.calls.some((c) => c[0] === 'ctl' && c[1] === 'passwall' && c[2] === 'disable'));
	await ctx.close();
	PXM.px = { ...PL('passwall', [PW]), cur: 'n1', curName: '香港 01', count: 3 };
	({ page, ctx } = await open(browser)); await home(page);
	const nt3 = await navTxt(page), has3 = (t, x) => ('|' + t + '|').includes('|' + x + '|');
	ok('[只装 PassWall] 侧边栏没有 OpenClash 的订阅、配置文件、覆写、规则、拉黑名单、插件设置、日志', !['subs', 'cfg', 'ow', 'rules', 'black', 'set', 'log', 'proxy', 'conn'].some((x) => has3(nt3, x)) && has3(nt3, 'home') && has3(nt3, 'wd'), nt3.slice(0, 200));
	await ctx.close();
	// 装了两个插件：概览里能切换
	PXM.px = { ...PL('openclash', [OCX, { ...PW, enabled: false, running: false }]) };
	({ page, ctx } = await open(browser)); await home(page);
	ok('[切换插件] 装了两个：概览里显示「代理插件：OpenClash · 还装了 PassWall　切换」', await vis(page, '#pxPick') && /OpenClash/.test(await txt(page, '#pxPick')) && /还装了 PassWall/.test(await txt(page, '#pxPick')));
	await page.click('#pxPick'); await page.waitForTimeout(600);
	ok('[切换插件] 列出装了的插件，正在用的标出来', (await page.evaluate(() => document.querySelectorAll('.modal [data-v^="p:"]').length)) === 2 && /正在用/.test(await txt(page, '.modal [data-v="p:openclash"]')));
	await page.screenshot({ path: path.join(OUT, 'px-switch.png') });
	await page.click('.modal [data-v="p:passwall"]'); await page.waitForTimeout(500);
	ok('[切换插件] 选 PassWall：先问一下，写清楚会先关掉 OpenClash、断网十几秒', await vis(page, '.modal') && /先关掉 OpenClash/.test(await txt(page, '.modal')));
	await page.click('.modal [data-v="true"]'); await page.waitForTimeout(700);
	ok('[切换插件] 确认后：换成 PassWall', PXM.calls.some((c) => c[0] === 'switch' && c[1] === 'passwall'));
	await ctx.close();
	PXM.px = PL('openclash', [OCX]);
	({ page, ctx } = await open(browser)); await home(page);
	ok('[切换插件] 只装了一个：不显示切换', !(await vis(page, '#pxPick')));
	await ctx.close();
	// 2 没装代理插件
	PXM.px = PL('', []);
	({ page, ctx } = await open(browser)); await home(page);
	ok('[没装插件] 概览：写着没装代理插件、哪些功能照常能用，不显示代理开关', await vis(page, '#pxNone') && !(await vis(page, '#pxRow')) && /没装代理插件/.test(await txt(page, '#ocPill')) && /照常能用/.test(await txt(page, '#pxNone')));
	ok('[没装插件] 不显示 OpenClash 卡片，也不报错，右上角在线', !(await vis(page, '#ocCard')) && !(await vis(page, '#pgCard')) && /在线/.test(await txt(page, '#statusText')) && /网络一切正常/.test(await txt(page, '#hHead')));
	await page.screenshot({ path: path.join(OUT, 'px-none.png') });
	await ctx.close();
	// 3 OpenClash 开着但没在跑：不能说成「连不上路由器」
	PXM.px = PL('openclash', [{ ...OCX, running: false }]); OC.running = false;
	({ page, ctx } = await open(browser)); await home(page);
	ok('[OpenClash 没在跑] 右上角还是「在线」（路由器连得上），概览写着 OpenClash 没有运行', /在线/.test(await txt(page, '#statusText')) && /OpenClash 没有运行/.test(await txt(page, '#hHead')));
	OC.running = true;
	await ctx.close();
	// 4 Nikki：Clash 内核，有代理模式，没有 OpenClash 专用的东西
	PXM.px = PL('nikki', [NK]);
	({ page, ctx } = await open(browser)); await home(page);
	ok('[Nikki] 有代理模式，没有运行模式、配置文件、订阅、控制面板按钮', await vis(page, '#modeBox') && !(await vis(page, '#runBox')) && await vis(page, '#ocCard') && /Nikki/.test(await txt(page, '#ocName')) && !(await vis(page, '#oDash')) && !(await page.locator('#oCfgBtn').isVisible()));
	const nt2 = await navTxt(page);
	const has2 = (t, x) => ('|' + t + '|').includes('|' + x + '|');
	ok('[Nikki] 侧边栏：有节点、连接；没装 OpenClash，就没有订阅、配置文件、覆写设置、拉黑名单', has2(nt2, 'proxy') && has2(nt2, 'conn') && !has2(nt2, 'subs') && !has2(nt2, 'cfg') && !has2(nt2, 'ow') && !has2(nt2, 'black'), nt2.slice(0, 200));
	await ctx.close();
	// 5 OpenClash：跟以前一样
	PXM.px = PL('openclash', [OCX]);
	({ page, ctx } = await open(browser)); await home(page);
	ok('[OpenClash] 跟以前一样：代理模式、运行模式、OpenClash 卡片都在', await vis(page, '#modeBox') && await vis(page, '#runBox') && await vis(page, '#ocCard') && await vis(page, '#oDash') && !(await vis(page, '#pgCard')));
	await ctx.close();
	// 6 问题反馈
	({ page, ctx } = await open(browser));
	await page.goto('http://panel.test/panel/'); await page.waitForTimeout(1500);
	ok('[反馈] 首页最下面有「遇到问题、想要新功能？」卡片', await page.isVisible('#mFb'));
	ok('[反馈] 侧边栏底部有「问题反馈」，跟「退出登录」并排', await page.evaluate(() => !!document.querySelector('.sidefoot #sideFb') && !!document.querySelector('.sidefoot #sideOut')));
	await page.click('#menuBtn'); await page.waitForTimeout(500); await page.click('#sideFb'); await page.waitForTimeout(800);
	ok('[反馈] 点侧边栏的「问题反馈」，弹出填写框，附上路由器信息（默认勾上、能看到内容）', await vis(page, '.modal [data-tx]') && /PassWall/.test(await txt(page, '.modal pre')) && await page.isChecked('.modal [data-dg]'));
	await page.screenshot({ path: path.join(OUT, 'px-feedback.png') });
	// 截图：生成两张 PNG 传上去
	const pic = path.join(__dirname, 'shots', 'fbpic.png'); await page.screenshot({ path: pic, clip: { x: 0, y: 0, width: 200, height: 300 } });
	ok('[反馈] 有「添加截图」按钮', await page.isVisible('.modal [data-addw]'));
	await page.setInputFiles('.modal [data-file]', [pic, pic]); await page.waitForTimeout(1200);
	ok('[反馈] 选两张截图：显示两个缩略图', (await page.evaluate(() => document.querySelectorAll('.modal .fbim img').length)) === 2);
	ok('[反馈] 加好后有提示「已添加 2 张截图」，按钮写着「已添加 2 / 3 张」', /已添加 2 张截图/.test(await page.textContent('body')) && /已添加 2 \/ 3 张/.test(await page.textContent('.modal [data-addw]')));
	await page.click('.modal .fbim [data-rm="1"]'); await page.waitForTimeout(200);
	ok('[反馈] 点 × 删掉一张', (await page.evaluate(() => document.querySelectorAll('.modal .fbim img').length)) === 1);
	ok('[反馈] 删掉后按钮跟着变成「已添加 1 / 3 张」', /已添加 1 \/ 3 张/.test(await page.textContent('.modal [data-addw]')));
	await page.setInputFiles('.modal [data-file]', [pic, pic, pic]); await page.waitForTimeout(1500);
	ok('[反馈] 最多 3 张，满了「添加截图」按钮就藏起来', (await page.evaluate(() => document.querySelectorAll('.modal .fbim img').length)) === 3 && !(await page.isVisible('.modal [data-addw]')));
	await page.screenshot({ path: path.join(OUT, 'px-feedback-img.png') });
	await page.fill('.modal [data-tx]', '一键更新一直停在准备更新'); await page.fill('.modal [data-ct]', '微信 ming');
	await page.click('.modal [data-go]'); await page.waitForTimeout(900);
	ok('[反馈] 发送：内容、联系方式、路由器信息、3 张截图（压成 JPEG）都发出去，提示已发送', PXM.calls.some((c) => c[0] === 'fb' && c[1] === '一键更新一直停在准备更新' && c[2] === '微信 ming' && c[3] === true && c[4] === 3 && c[5] === true) && await page.evaluate(() => /已发送/.test(document.body.textContent)));
	await ctx.close();
	// 自己搭的（没有官网）：没有上传按钮，提示去 GitHub 贴图
	PXM.selfbuilt = true;
	({ page, ctx } = await open(browser));
	await page.goto('http://panel.test/panel/'); await page.waitForTimeout(1500);
	await page.click('#mFb'); await page.waitForTimeout(800);
	ok('[反馈] 自己搭的：没有「添加截图」，写着可以在 GitHub 里贴截图', await vis(page, '.modal [data-tx]') && !(await page.isVisible('.modal [data-addw]')) && /GitHub/.test(await txt(page, '.modal')));
	PXM.selfbuilt = false;
	await ctx.close();
	await browser.close();
	for (const [n, c, note] of results) console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '（' + note + '）'));
	if (problems.length) console.log('问题：\n' + [...new Set(problems)].join('\n'));
	console.log(`通过 ${results.filter((r) => r[1]).length}/${results.length}`);
})();

// App 首页（浏览器里模拟 App 接口）。6.0.2 重做成「石墨」（用户 11/28 14:51）：
// 有路由器：「我的路由器」列表，点一行打开，「⋯」里打开 / 改名 / 移除；右上角「+」和「添加路由器」弹出添加方式
// 没有路由器：大图标 +「登录官网账号」+ 自建版的扫码 / 相册 / 粘贴 / 输入登录地址
// 家里 Wi-Fi 下找到的路由器列在「在家里找到」，点「打开」只是打开（不自动登录），已经在列表里的不重复列
// 只有一台路由器、从桌面图标打开 App：直接进它的面板；有必须更新时不进
// 返回键先关弹出的面板和卡片；320 / 390 深色 / 430 不错位
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const FILE = 'file://' + path.resolve(__dirname, '../../android/app/src/main/assets/home.html');
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [];
const ok = (n, c, note) => results.push([n, !!c, note || '']);
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const TWO = [{ url: 'https://abcd2345.panel.example/panel/', name: '家里', at: Date.now() - 3600e3 }, { url: 'http://192.168.6.1:906/panel/', name: '192.168.6.1', at: Date.now() - 86400e3 * 2 }];
const ONE = [{ url: 'https://abcd2345.panel.example/panel/', name: '家里', at: Date.now() - 3600e3 }];
(async () => {
	const browser = await chromium.launch();
	// o: routers, plain（从桌面图标打开）, upd（官网返回的版本信息）, clip（剪贴板）
	const mk = async (w, h, dark, o = {}) => {
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
		await page.addInitScript(([dark, o]) => {
			let routers = o.routers || [];
			window.__opened = []; window.__disc = 0; window.__saved = null; window.__scan = 0; window.__pick = 0; window.__upd = null;
			window.App = { version: () => '6.0.0', dark: () => dark, hub: () => 'https://panel.example', routers: () => JSON.stringify(routers), saveRouters: (j) => { window.__saved = JSON.parse(j); routers = window.__saved; }, open: (u) => window.__opened.push(u), external() {}, scan: () => window.__scan++, pickQr: () => window.__pick++, clipboard: () => o.clip || '', update: (u) => (window.__upd = u),
				plainLaunch: () => !!o.plain,
				discover: () => { window.__disc++; setTimeout(() => window.onFound([{ ip: '192.168.1.1', url: 'http://192.168.1.1:906/panel/' }, { ip: '192.168.6.1', url: 'http://192.168.6.1:906/panel/' }]), 200); } };
			window.fetch = async () => new Response(JSON.stringify(o.upd || {}));
		}, [dark, o]);
		await page.goto(FILE); await W(900);
		return { ctx, page, errs };
	};
	const layout = (page) => page.evaluate(() => {
		const bad = []; if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('横向滚动');
		document.querySelectorAll('#main .card, #main .btn, .sheet .card, .sheet .btn').forEach((e) => { const r = e.getBoundingClientRect(); if (r.width && (r.right > innerWidth - 8 || r.left < 8)) bad.push('出界：' + e.textContent.trim().slice(0, 10)); });
		document.querySelectorAll('.tx b, .row .tx>span').forEach((e) => { if (e.getBoundingClientRect().height > 26) bad.push('换行：' + e.textContent.slice(0, 10)); });
		return bad;
	});
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		// 有两台
		let { ctx, page, errs } = await mk(w, h, dark, { routers: TWO, plain: true });
		let t = await page.textContent('#main');
		ok('两台：不自动进面板' + T, (await page.evaluate(() => window.__opened.length)) === 0);
		const sec = (name) => page.evaluate((n) => { const l = [...document.querySelectorAll('#main .lbl')].find((x) => x.textContent === n); return l ? l.nextElementSibling.textContent : null; }, name);
		const mine = await sec('我的路由器'), lan = await sec('在家里找到');
		ok('「我的路由器」两台：托管的写网址，局域网的名字就是 IP 时不再重复写一遍' + T, /家里/.test(mine) && /abcd2345\.panel\.example · /.test(mine) && /192\.168\.6\.1/.test(mine) && !/192\.168\.6\.1:906/.test(mine) && !/http:\/\//.test(mine), mine);
		ok('找到家里的路由器：列出来，已经在列表里的不重复列' + T, /192\.168\.1\.1/.test(lan || '') && !/192\.168\.6\.1/.test(lan || ''), lan);
		ok('右上角有「+」' + T, await page.isVisible('#addTop'));
		let lay = await layout(page);
		ok('列表不错位、不横向滚动' + T, !lay.length, lay.join('；'));
		await page.screenshot({ path: path.join(SHOT, `apphome-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		await page.click('[data-fo="0"]');
		ok('点「在家里找到」的「打开」：只是打开面板' + T, JSON.stringify(await page.evaluate(() => window.__opened)) === '["http://192.168.1.1:906/panel/"]');
		await page.click('[data-i="0"] .tx');
		ok('点一行：打开这台' + T, (await page.evaluate(() => window.__opened[1])) === TWO[0].url);
		await page.evaluate(() => window.refresh()); await W(300);
		ok('30 秒内不重复找' + T, (await page.evaluate(() => window.__disc)) === 1);
		// 添加
		await page.click('#addTop'); await W(450);
		t = await page.textContent('#sheet');
		ok('「+」弹出添加：登录官网账号、扫码、相册、粘贴、输入' + T, ['登录官网账号', '扫码', '从相册识别二维码', '粘贴登录地址', '输入登录地址'].every((x) => t.includes(x)), t);
		lay = await layout(page);
		ok('添加面板不错位' + T, !lay.length, lay.join('；'));
		if (w === 390) await page.screenshot({ path: path.join(SHOT, `apphome-add${dark ? '-dark' : ''}.png`) });
		await page.click('#sheet [data-a=scan]');
		ok('点「扫码」：打开扫码' + T, (await page.evaluate(() => window.__scan)) === 1);
		const bk = await page.evaluate(() => window.appBack()); await W(350);
		ok('返回键：先关添加面板，不退出' + T, bk === true && !(await page.isVisible('#sheet .card')));
		// ⋯：改名、移除
		await page.click('[data-m="0"]'); await W(450);
		ok('「⋯」：打开、改名、移除' + T, /打开[\s\S]*改名[\s\S]*移除/.test(await page.textContent('#sheet')));
		await page.click('#sheet [data-x=ren]'); await W(450);
		await page.fill('#renIn', '公司'); await page.click('#renForm button'); await W(400);
		ok('改名：存下来、列表跟着变' + T, (await page.evaluate(() => window.__saved && window.__saved.find((r) => r.url === 'https://abcd2345.panel.example/panel/').name)) === '公司' && /公司/.test(await page.textContent('#main')));
		await page.click('[data-m="1"]'); await W(450);
		await page.click('#sheet [data-x=del]'); await W(450);
		ok('移除先确认：标题写对象，正文写后果' + T, /移除「192\.168\.6\.1」/.test(await page.textContent('#dlg')) && /路由器本身不受影响/.test(await page.textContent('#dlg')));
		if (w === 390 && !dark) await page.screenshot({ path: path.join(SHOT, 'apphome-del.png') });
		ok('确认卡片按返回键能关' + T, (await page.evaluate(() => window.appBack())) === true && !(await page.isVisible('#dlg')));
		await page.click('[data-m="1"]'); await W(450); await page.click('#sheet [data-x=del]'); await W(450); await page.click('#dlg [data-y]'); await W(300);
		ok('移除：存下来，只剩一台' + T, (await page.evaluate(() => window.__saved.length)) === 1 && !/192\.168\.6\.1:906/.test(await page.textContent('#main')));
		ok('没有脚本报错' + T, !errs.length, errs.join('；'));
		await ctx.close();
		// 没有路由器
		({ ctx, page, errs } = await mk(w, h, dark, { routers: [], plain: true }));
		t = await page.textContent('#main');
		ok('没有路由器：大图标、登录官网账号、自建版四种方式，顶栏不重复显示' + T, /路由器面板/.test(t) && /登录官网账号/.test(t) && /扫码/.test(t) && /输入登录地址/.test(t) && !(await page.isVisible('#head')));
		lay = await layout(page);
		ok('没有路由器：不错位' + T, !lay.length, lay.join('；'));
		await page.screenshot({ path: path.join(SHOT, `apphome-empty-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		await page.click('#main [data-a=hub]');
		ok('点「登录官网账号」：在 App 里打开官网账号页' + T, (await page.evaluate(() => window.__opened[0])) === 'https://panel.example/app');
		await page.click('#main [data-a=type]'); await W(450);
		await page.fill('#addr', 'hello'); await page.click('#addBtn'); await W(200);
		ok('输入的不是登录地址：框下面说原因（不弹系统提示）' + T, /不是登录地址/.test(await page.textContent('#aerr')) && (await page.evaluate(() => window.__opened.length)) === 1);
		ok('输入框有没添加的地址：第一次返回只提醒' + T, (await page.evaluate(() => window.appBack())) === true && /再按一次返回/.test(await page.textContent('#aerr')));
		await page.fill('#addr', 'https://abc.example.com/cgi-bin/mcp/abcdefghijklmnop1234'); await page.click('#addBtn'); await W(300);
		ok('输入登录地址：打开面板并带上登录' + T, (await page.evaluate(() => window.__opened[1])) === 'https://abc.example.com/panel/#login=abcdefghijklmnop1234' && !(await page.isVisible('#sheet .inp')));
		ok('没有脚本报错（没有路由器）' + T, !errs.length, errs.join('；'));
		await ctx.close();
	}
	// 粘贴
	let { ctx, page, errs } = await mk(390, 844, false, { routers: [], clip: 'https://abc.example.com/panel/' });
	await page.click('#main [data-a=paste]'); await W(300);
	ok('粘贴：剪贴板里是面板地址就直接打开', (await page.evaluate(() => window.__opened[0])) === 'https://abc.example.com/panel/');
	await ctx.close();
	({ ctx, page, errs } = await mk(390, 844, false, { routers: [], clip: '随便一段字' }));
	await page.click('#main [data-a=paste]'); await W(500);
	ok('粘贴：不是登录地址就放进输入框给你看', (await page.inputValue('#addr')) === '随便一段字' && /不是登录地址/.test(await page.textContent('#aerr')));
	await ctx.close();
	// 只有一台：从桌面图标打开直接进；带着网址打开不进；有必须更新不进
	({ ctx, page, errs } = await mk(390, 844, false, { routers: ONE, plain: true }));
	await W(1200);
	ok('只有一台、从桌面打开：直接进它的面板', JSON.stringify(await page.evaluate(() => window.__opened)) === JSON.stringify([ONE[0].url]));
	await page.evaluate(() => window.refresh()); await W(300);
	ok('回到首页再刷新：不会又自动进', (await page.evaluate(() => window.__opened.length)) === 1);
	await ctx.close();
	({ ctx, page, errs } = await mk(390, 844, false, { routers: ONE, plain: false }));
	await W(1200);
	ok('只有一台、App 带着网址打开：不自动进', (await page.evaluate(() => window.__opened.length)) === 0);
	await ctx.close();
	({ ctx, page, errs } = await mk(390, 844, false, { routers: ONE, plain: true, upd: { version: '6.0.2', force: true, notes: '- 首页重做' } }));
	await W(1200);
	ok('有必须更新：不自动进，卡片关不掉', (await page.evaluate(() => window.__opened.length)) === 0 && (await page.isVisible('#dlg')) && !(await page.isVisible('#dlg [data-later]')));
	ok('必须更新：返回键关不掉（退出 App）', (await page.evaluate(() => window.appBack())) === false && (await page.isVisible('#dlg')));
	await page.screenshot({ path: path.join(SHOT, 'apphome-force.png') });
	await page.click('#dlg [data-upgo]');
	ok('点「立即更新」：从官网下载新版', (await page.evaluate(() => window.__upd)) === 'https://panel.example/app/router-panel.apk' && /正在下载/.test(await page.textContent('#dlg [data-upgo]')));
	await page.evaluate(() => window.onUpdateFail()); await W(100);
	ok('下载失败：按钮恢复', /立即更新/.test(await page.textContent('#dlg [data-upgo]')));
	await ctx.close();
	({ ctx, page, errs } = await mk(390, 844, false, { routers: ONE, plain: true, upd: { version: '6.0.2', force: false, notes: '- 首页重做' } }));
	await W(1200);
	ok('普通新版本：照样直接进面板，提示留在首页', (await page.evaluate(() => window.__opened.length)) === 1 && (await page.isVisible('#dlg')) && (await page.isVisible('#upd')));
	await page.click('#dlg [data-later]'); await W(200);
	ok('「以后再说」：关掉，顶上的更新条还在', !(await page.isVisible('#dlg')) && (await page.isVisible('#upd')));
	ok('没有脚本报错（更新）', !errs.length, errs.join('；'));
	await ctx.close();
	await browser.close();
	let fail = 0;
	for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
	console.log(`\n通过 ${results.length - fail}/${results.length}`);
	process.exit(fail ? 1 : 0);
})();

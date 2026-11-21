// 返回（6.0 第 68 项）：手机侧滑、返回键、电脑后退键都回到上一步——先关弹窗 / 侧边栏，再回上一页，有没保存的修改先问；
// 安卓在第一页：按两次才退出；苹果手机添加到主屏幕后：左边缘往右滑也能返回
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(require('./mock').reply(body.id, body.method.replace(/^panel\//, ''), body.params || {}))); }
	if (u.pathname === '/before') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<title>before</title>上一个网页'); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(403); return res.end('{}'); }
	let p = u.pathname.replace(/^\/panel\//, '') || 'index.html'; const f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const AND = 'Mozilla/5.0 (Linux; Android 15; 23127PN0CC) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36 EdgA/130';
process.on('unhandledRejection', (e) => { console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n')); console.log('\n异常：' + String(e.message).split('\n')[0]); process.exit(1); });
(async () => {
	await new Promise((r) => server.listen(8090, r));
	const browser = await chromium.launch();
	const mk = async (ua, o = {}) => {
		const ctx = await browser.newContext(o.desk ? { viewport: { width: 1280, height: 860 }, userAgent: ua } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: ua });
		if (o.solo) await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8090/before'); await page.goto('http://localhost:8090/panel/'); await page.waitForTimeout(2500);
		return page;
	};
	const back = async (page) => { await page.goBack({ waitUntil: 'commit', timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500); };
	const onPanel = (page) => page.url().includes('/panel/');
	// 安卓
	let page = await mk(AND);
	await page.click('#pageTitle'); await page.waitForTimeout(200);
	await back(page);
	ok('安卓：按一次返回不退出，提示再按一次', onPanel(page) && /再按一次返回键退出/.test(await page.textContent('#toast')), page.url());
	await back(page);
	ok('安卓：连续按第二次才退出', !onPanel(page) && page.url().endsWith('/before'), page.url());
	// 先关侧边栏
	page = await mk(AND);
	await page.click('#menuBtn'); await page.waitForTimeout(500);
	ok('侧边栏打开了', await page.evaluate(() => document.getElementById('side').classList.contains('open')));
	await back(page);
	ok('安卓：返回键先关侧边栏，不退出', onPanel(page) && !(await page.evaluate(() => document.getElementById('side').classList.contains('open'))));
	await page.click('#pageTitle'); await page.waitForTimeout(200);
	await back(page);
	ok('关掉侧边栏后：再按返回又提示一次', onPanel(page) && /再按一次返回键退出/.test(await page.textContent('#toast')));
	// 先关弹窗
	await page.click('#pageTitle'); await page.waitForTimeout(200);
	await page.goto('http://localhost:8090/panel/?p=dev'); await page.waitForTimeout(2000);
	await page.click('#dvList [data-i="0"] [data-pause]'); await page.waitForTimeout(500);
	ok('弹窗打开了', (await page.locator('.modal').count()) === 1);
	await back(page);
	ok('安卓：返回键先关弹窗，不退出', onPanel(page) && (await page.locator('.modal').count()) === 0);
	// 正在输入（键盘开着）：返回只收起键盘，不关弹窗、不退出（5.2.2：输验证码时想先收起键盘）
	await page.goto('http://localhost:8090/panel/?p=main'); await page.waitForTimeout(1800);
	await page.click('#menuBtn'); await page.waitForTimeout(500); await page.click('#sideFb'); await page.waitForTimeout(700);
	const fld = '.modal:not(.closing) textarea';
	ok('反馈弹窗打开了（有输入框）', (await page.locator(fld).count()) >= 1);
	await page.locator(fld).first().click(); await page.keyboard.type('12'); await page.waitForTimeout(200);
	await back(page);
	ok('安卓：输入框里正在打字时按返回：只收起键盘，弹窗还在、打的字还在', onPanel(page) && (await page.locator('.modal:not(.closing)').count()) === 1 && (await page.locator(fld).first().inputValue()) === '12' && !(await page.evaluate(() => document.activeElement && document.activeElement.matches('.modal textarea'))));
	await page.locator('.modal:not(.closing) h3').first().click(); await page.waitForTimeout(200);
	await back(page);
	ok('安卓：键盘收起后再按返回：关弹窗', onPanel(page) && (await page.locator('.modal:not(.closing)').count()) === 0);
	// 电脑 / 苹果手机：不拦
	page = await mk('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
	await page.click('#pageTitle'); await page.waitForTimeout(200);
	await back(page);
	ok('苹果手机：返回键照常（按一次就回上一页）', !onPanel(page));
	// ===== 第 68 项：回到上一页 =====
	const title = (pg) => pg.textContent('#pageTitle');
	const nav = async (pg, p, q) => { if ((await pg.evaluate(() => innerWidth < 900 && !document.getElementById('side').classList.contains('open')))) { await pg.click('#menuBtn'); await pg.waitForTimeout(450); } await pg.fill('#sideQ', q); await pg.waitForTimeout(150); await pg.click(`#sidenav button[data-p="${p}"]`); await pg.waitForTimeout(900); await pg.fill('#sideQ', '').catch(() => {}); await pg.evaluate(() => document.activeElement && document.activeElement.blur()); };
	const DESK = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
	page = await mk(DESK, { desk: true });
	const t0 = await title(page);
	await nav(page, 'dev', '设备'); await nav(page, 'proxy', '节点');
	ok('电脑：打开了两页', (await title(page)) === '节点', await title(page));
	await back(page);
	ok('电脑：后退键回到上一页（设备），不离开面板', onPanel(page) && (await title(page)) === '设备', await title(page));
	await back(page);
	ok('电脑：再后退回到第一页', onPanel(page) && (await title(page)) === t0, await title(page));
	await back(page);
	ok('电脑：第一页再后退：离开面板（回到之前的网页）', page.url().endsWith('/before'), page.url());
	// 弹窗：后退先关弹窗
	page = await mk(DESK, { desk: true });
	await nav(page, 'dev', '设备'); await page.waitForTimeout(800);
	await page.click('#dvList [data-i="0"] [data-pause]'); await page.waitForTimeout(500);
	ok('电脑：弹窗打开了', (await page.locator('.modal:not(.closing)').count()) === 1);
	await back(page);
	ok('电脑：后退先关弹窗，还在设备页', (await page.locator('.modal:not(.closing)').count()) === 0 && (await title(page)) === '设备');
	await back(page);
	ok('电脑：再后退才回上一页', (await title(page)) === t0, await title(page));
	// 用按钮关掉的弹窗：不会多出一步「空按」
	await nav(page, 'dev', '设备'); await page.waitForTimeout(800);
	await page.click('#dvList [data-i="0"] [data-pause]'); await page.waitForTimeout(500);
	await page.click('.modal:not(.closing) [data-v="false"]').catch(async () => { await page.locator('.modal:not(.closing)').click({ position: { x: 5, y: 5 } }); }); await page.waitForTimeout(500);
	ok('电脑：点按钮关了弹窗', (await page.locator('.modal:not(.closing)').count()) === 0);
	await back(page);
	ok('电脑：用按钮关掉弹窗后，后退一次就回上一页（不会按了没反应）', (await title(page)) === t0, await title(page));
	// 没保存的修改：先问
	await nav(page, 'set', '插件设置'); await page.waitForTimeout(1200);
	const tx = page.locator('#setBody input[data-f="txt"]:visible').first();
	await tx.fill(String(Number((await tx.inputValue()) || 0) + 7)); await tx.press('Tab');
	await page.waitForTimeout(300);
	const dbg0 = await page.evaluate(() => JSON.stringify(history.state) + ' len=' + history.length + ' bar=' + (document.querySelector('#setBody .savebar, .savebar') ? document.querySelector('.savebar').className : '-'));
	await back(page);
	const ask = await page.locator('.modal:not(.closing)').textContent().catch(() => '');
	ok('有没保存的修改时后退：先问，不直接丢掉', /没保存的修改/.test(ask) && (await title(page)) === '插件设置', ask + ' | ' + dbg0 + ' | ' + page.url() + ' ' + (await title(page).catch(() => '?')));
	await page.click('.modal:not(.closing) [data-v="false"]', { timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500);
	ok('选「取消」：还在插件设置页', (await title(page)) === '插件设置' && (await page.locator('.modal:not(.closing)').count()) === 0);
	await back(page);
	await page.click('.modal:not(.closing) [data-v="true"]', { timeout: 3000 }).catch(() => {}); await page.waitForTimeout(800);
	ok('再后退选「不保存，离开」：回到上一页', (await title(page)) === t0, await title(page));
	// 手机：从侧边栏点了一页以后，返回一次就回上一页
	const IPH = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
	page = await mk(IPH);
	await nav(page, 'dev', '设备');
	ok('苹果手机：从侧边栏打开设备页，侧边栏收起', (await title(page)) === '设备' && !(await page.evaluate(() => document.getElementById('side').classList.contains('open'))));
	await back(page);
	ok('苹果手机：返回一次就回到上一页', onPanel(page) && (await title(page)) === t0, await title(page));
	// 苹果手机在 Safari 里：左边缘留给 Safari 自己的侧滑返回，面板不抢着开菜单
	const swipe = (pg) => pg.evaluate(() => { const mk = (x) => new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 400 }); document.body.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(6)], changedTouches: [mk(6)], bubbles: true })); document.body.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(150)], bubbles: true })); });
	await swipe(page); await page.waitForTimeout(500);
	ok('苹果手机 Safari：左边缘右滑不开菜单（那是 Safari 的返回）', !(await page.evaluate(() => document.getElementById('side').classList.contains('open'))));
	// 苹果手机添加到主屏幕：没有系统侧滑返回，面板自己做
	page = await mk(IPH, { solo: true });
	await nav(page, 'dev', '设备');
	await swipe(page); await page.waitForTimeout(800);
	ok('添加到主屏幕：左边缘往右滑 = 返回上一页', (await title(page)) === t0, await title(page));
	await swipe(page); await page.waitForTimeout(500);
	ok('添加到主屏幕：已经在第一页时，左边缘右滑打开菜单', await page.evaluate(() => document.getElementById('side').classList.contains('open')));
	// 安卓：先回上一页，到第一页才提示「再按一次退出」
	page = await mk(AND);
	await page.click('#pageTitle'); await page.waitForTimeout(200);
	await nav(page, 'dev', '设备');
	await back(page);
	ok('安卓：在设备页按返回：回到上一页，不提示退出', onPanel(page) && (await title(page)) === t0, await title(page));
	await page.waitForTimeout(3200);
	await back(page);
	ok('安卓：到第一页再按返回：提示再按一次', onPanel(page) && /再按一次返回键退出/.test(await page.textContent('#toast')));
	await back(page);
	ok('安卓：再按一次才退出', page.url().endsWith('/before'), page.url());
	// 安卓 App 里：提示的是回到 App 首页
	page = await mk(AND + ' RouterPanelApp/6.0.0');
	await page.click('#pageTitle'); await page.waitForTimeout(200);
	await back(page);
	ok('安卓 App：第一页按返回提示「再按一次返回键回到 App 首页」', /回到 App 首页/.test(await page.textContent('#toast')));
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

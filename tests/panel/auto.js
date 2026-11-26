// 断线记录页 + 断线原因提示 专项测试
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { respond, WD, cloudStatus, AUTO } = require('./mock');

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
			let res; try { res = { result: respond(body.method, body.params || {}) }; } catch (e) { res = { error: { code: e.code || -32000, message: e.message, data: e.data } }; }
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
const goWd = async (page) => { await page.click('#menuBtn'); await page.waitForTimeout(400); await page.click('#sidenav [data-p="auto"]'); await page.waitForTimeout(900); };
const loadAgain = async (page) => { await page.reload(); await page.waitForTimeout(1200); await goWd(page); };
const goWdReal = async (page) => { await page.click('#menuBtn'); await page.waitForTimeout(400); await page.click('#sidenav [data-p="wd"]'); await page.waitForTimeout(900); };
const st = (page) => page.evaluate(() => ({ pill: document.querySelector('#auPill')?.textContent, rows: [...document.querySelectorAll('#auCard [data-au]')].map((l) => l.dataset.au + ':' + l.querySelector('input').checked), txt: document.querySelector('#auCard')?.textContent || '' }));
(async () => {
	const ALL = ['tunrestart', 'panelrestart', 'cacheclean', 'memguard', 'autosw', 'tunbypass', 'route', 'daily', 'weekly', 'newdev', 'cloudbackup', 'loginalert', 'autoban', 'ipchange', 'health', 'diskfull'];
	const flip = async (page, k) => { await page.locator(`#auCard [data-au="${k}"] .sw`).click(); await page.waitForTimeout(600); };
	const browser = await chromium.launch();
	let { page, ctx } = await open(browser);
	await page.goto('http://panel.test/panel/'); await page.waitForTimeout(1200);
	await goWd(page);
	let s = await st(page);
	ok('自动任务页：所有自动任务都有开关（16 项），默认只有「公网 IP 变了提醒」关着', s.rows.map((r) => r.split(':')[0]).join() === ALL.join() && s.rows.every((r) => r.endsWith(r.startsWith('ipchange') ? ':false' : ':true')) && s.pill === '开了 15 / 16 项', JSON.stringify(s));
	ok('分成五组，每组一张卡片：出问题时自动修、网络、提醒和备份、安全、状态提醒', await page.evaluate(() => [...document.querySelectorAll('#auCard .sectitle b')].map((x) => x.textContent).join()) === '出问题时自动修,网络,提醒和备份,安全,状态提醒' && await page.evaluate(() => document.querySelectorAll('#auCard section.card').length) === 5);
	ok('侧边栏「特色功能」（以前叫自动任务）用的是画好的图标（跟其他项一样）', await page.evaluate(() => !!document.querySelector('#sidenav [data-p="auto"] .nic svg')));
	ok('每一项都写清楚关掉以后会怎样', /关掉后只记录/.test(s.txt) && /关掉后保持现在的走法/.test(s.txt) && /「现在体检」照样能用/.test(s.txt) && /「立即备份」照样能用/.test(s.txt) && /在「设备」页能看到/.test(s.txt));
	await page.locator('#auCard').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(OUT, 'auto.png') });
	ok('自动任务是侧边栏里单独的一页，标题「特色功能」', /特色功能/.test(await txt(page, '#pageTitle')) && await page.isVisible('#p-auto #auCard'));
	// 6.0 第 70 项：改名「特色功能」，特色功能的入口也在这一页；搜旧名也找得到；老用户第一次进来说一声
	ok('[第 70 项] 特色功能页：按用途分组列出 Wi-Fi、访客 Wi-Fi、上网计划、不走代理、流量统计、云端备份这些入口', /上网管理/.test(await txt(page, '#auGo')) && /Wi-Fi 设置/.test(await txt(page, '#auGo')) && /访客 Wi-Fi/.test(await txt(page, '#auGo')) && /上网计划/.test(await txt(page, '#auGo')) && /流量统计/.test(await txt(page, '#auGo')), await txt(page, '#auGo'));
	ok('[第 70 项] 老用户第一次进来：说一声改名了', /「自动任务」改名叫「特色功能」了/.test(await txt(page, '#auNew')));
	await page.fill('#sideQ', '自动任务').catch(() => {}); await page.waitForTimeout(300);
	ok('[第 70 项] 搜旧名「自动任务」也找得到', (await page.locator('#sidenav [data-p="auto"]').count()) >= 1 && /特色功能/.test(await page.locator('#sidenav').textContent()));
	await page.fill('#sideQ', '').catch(() => {});
	await page.locator('#auGo [data-augo="traf"]').click(); await page.waitForTimeout(800);
	ok('[第 70 项] 点入口去那一页', /流量统计/.test(await txt(page, '#pageTitle')));
	await page.goBack().catch(() => {}); await page.waitForTimeout(800);
	await flip(page, 'memguard'); s = await st(page);
	ok('关掉「内存不够时自动重启 OpenClash」：路由器那边关了，显示「开了 14 / 16 项」', AUTO.memguard === false && s.pill === '开了 14 / 16 项', JSON.stringify(s));
	ok('关掉后有提示', await page.evaluate(() => /已关闭：内存不够时自动重启 OpenClash/.test(document.body.textContent)));
	for (const k of ['tunrestart', 'panelrestart', 'cacheclean', 'route', 'daily', 'weekly', 'newdev', 'cloudbackup', 'loginalert', 'autoban', 'health', 'diskfull']) { await flip(page, k); }
	await flip(page, 'autosw'); await flip(page, 'tunbypass'); s = await st(page);
	ok('每一项都能关：隧道重启、面板重启、清缓存、线路自动选择、每日体检、每周报告、新设备提醒、云端备份、节点自动换、隧道直连、登录提醒、自动拉黑、温度负载、存储', Object.values(AUTO.on).every((v) => v === false) && AUTO.autosw === false && AUTO.tb.on === false && s.pill === '全部关闭', JSON.stringify([AUTO.on, s.pill]));
	for (const k of ALL) if (k !== 'ipchange') await flip(page, k);
	await flip(page, 'ipchange');
	s = await st(page);
	ok('全部打开（包括默认关的「公网 IP 变了提醒」）', Object.values(AUTO.on).every(Boolean) && AUTO.autosw && AUTO.memguard && AUTO.tb.on && s.pill === '全部开启', JSON.stringify(s));
	AUTO.failSet = true;
	await flip(page, 'tunbypass'); await page.waitForTimeout(300); s = await st(page);
	ok('设置失败：开关退回原样，提示失败原因', s.rows.includes('tunbypass:true') && await page.evaluate(() => /设置失败/.test(document.body.textContent)), JSON.stringify(s));
	AUTO.failSet = false;
	// 自动拉黑：封着的地址列在下面，能解封（先确认）
	AUTO.ban.ips = { '198.51.100.7': { until: Math.floor(Date.now() / 1000) + 3000, at: Math.floor(Date.now() / 1000) - 600, n: 5 }, '203.0.113.9': { until: Math.floor(Date.now() / 1000) + 600, at: Math.floor(Date.now() / 1000) - 100, n: 5, noblock: true } };
	await loadAgain(page);
	ok('[拉黑] 封着的地址列在「自动拉黑」下面，写着封到什么时候', /198\.51\.100\.7/.test(await txt(page, '#auCard .banlist')) && /封到/.test(await txt(page, '#auCard .banlist')) && /没能封/.test(await txt(page, '#auCard .banlist')));
	await page.setViewportSize({ width: 320, height: 700 }); await page.waitForTimeout(300);
	await page.locator('#auCard .banlist').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(OUT, 'auto-ban-320.png') });
	ok('[拉黑] 320 宽的手机：列表不横向滚动、解封按钮在屏幕里', await page.evaluate(() => document.documentElement.scrollWidth <= 320 && [...document.querySelectorAll('[data-unban]')].every((b) => b.getBoundingClientRect().right <= 320)));
	await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
	await page.click('[data-unban="198.51.100.7"]'); await page.waitForTimeout(400);
	ok('[拉黑] 解封前确认，说明后果', /马上就能再连路由器的后台和 SSH/.test(await txt(page, '.modal')));
	await page.locator('.modal').last().locator('button:has-text("解封")').click(); await page.waitForTimeout(1200);
	ok('[拉黑] 确认后解封，列表里没了', AUTO.unbans.includes('198.51.100.7') && !/198\.51\.100\.7/.test(await txt(page, '#auCard')));
	AUTO.ban = { tool: null, ips: {} };
	await loadAgain(page);
	ok('[拉黑] 防火墙没法封的路由器：开关下面写明只推送提醒', /没法自动封禁/.test(await txt(page, '#auCard [data-au="autoban"]')));
	AUTO.ban = { tool: 'nft', ips: {} };
	await goWdReal(page);
	ok('断线记录页：有一行「特色功能」入口，点了跳过去', await page.isVisible('#wdBody [data-goauto]'));
	await page.click('#wdBody [data-goauto]'); await page.waitForTimeout(900);
	ok('点入口：打开特色功能页', /特色功能/.test(await txt(page, '#pageTitle')) && await page.isVisible('#auCard [data-au="daily"]'));
	await ctx.close();
	// 打开了，但有的插件还没生效：开关是开着的，下面提示
	AUTO.tb = { on: false, want: true, auto: false, at: 0, status: '还没生效' };
	({ page, ctx } = await open(browser));
	await page.goto('http://panel.test/panel/'); await page.waitForTimeout(1200); await goWd(page);
	s = await st(page);
	ok('打开了直连、有的插件还没生效：开关显示开着，下面写着还没生效的原因', s.rows.includes('tunbypass:true') && /还有代理插件没生效/.test(s.txt), JSON.stringify(s));
	await ctx.close();
	// 6.0 第 44 项：用的是 Nikki，打开了还没生效：给「现在重启 Nikki」，先确认
	AUTO.px = 'Nikki';
	({ page, ctx } = await open(browser));
	await page.goto('http://panel.test/panel/'); await page.waitForTimeout(1200); await goWd(page);
	s = await st(page);
	ok('Nikki 还没生效：写「Nikki 重启后生效」，给「现在重启 Nikki」', /Nikki 重启后生效/.test(s.txt) && (await page.locator('#auCard [data-nkrs]').count()) === 1, JSON.stringify(s).slice(0, 200));
	page.__calls = [];
	await page.route('**/cgi-bin/mcp/**', async (route) => { const b = JSON.parse(route.request().postData() || '{}'); if (/px_ctl/.test(b.method)) { page.__calls.push(b.params); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: b.id, result: { ok: true } }) }); } return route.fallback(); });
	await page.click('#auCard [data-nkrs]'); await page.waitForTimeout(400);
	ok('点了先确认：断网多久', /重启 Nikki/.test(await txt(page, '.modal')) && /断网 10–30 秒/.test(await txt(page, '.modal')));
	await page.locator('.modal').last().locator('[data-v="true"]').click(); await page.waitForTimeout(800);
	ok('确认后才重启 Nikki', page.__calls.some((p) => p.id === 'nikki' && p.op === 'restart') && /正在重启 Nikki/.test(await txt(page, '#toast')), JSON.stringify(page.__calls));
	await ctx.close();
	delete AUTO.px;
	// 直连被自动关掉
	AUTO.tb = { on: false, auto: true, at: Math.floor(Date.now() / 1000) - 3600, status: '已关闭：自动：直连连不上' };
	({ page, ctx } = await open(browser));
	await page.goto('http://panel.test/panel/'); await page.waitForTimeout(1200); await goWd(page);
	s = await st(page);
	ok('直连连不上被自动关掉：写明已改回走代理、一天后再试', /已自动改回走代理/.test(s.txt) && /一天后/.test(s.txt) && s.rows.includes('tunbypass:false'), JSON.stringify(s));
	await ctx.close();
	// 6.0 第 42、43 项：用的是 PassWall（没有切换节点的接口）
	AUTO.autosw_save = AUTO.autosw; AUTO.autosw = null; AUTO.autosw_why = 'PassWall 没有切换节点的接口。用它自带的自动切换，在原版页面里开'; AUTO.route_save = AUTO.route; AUTO.route = false; AUTO.route_why = 'PassWall 做不到：换路线要靠 OpenClash 的规则集（不重启、不断网）';
	({ page, ctx } = await open(browser));
	await page.goto('http://panel.test/panel/'); await page.waitForTimeout(1200); await goWd(page);
	s = await st(page);
	ok('别的代理插件：「节点挂了自动换」「面板线路自动选择」写明为什么用不了，不能开关，不算进开了几项', /PassWall 没有切换节点的接口/.test(s.txt) && /PassWall 做不到/.test(s.txt) && (await page.locator('#auCard .auna').count()) === 2 && (await page.locator('#auCard .auna input').count()) === 0 && !/\/ 1[5-9] 项/.test(s.pill), JSON.stringify(s).slice(0, 300));
	await ctx.close();
	AUTO.autosw = AUTO.autosw_save; AUTO.route = AUTO.route_save; delete AUTO.autosw_why; delete AUTO.route_why;
	// 没装代理插件、没开云端
	AUTO.oc = false; AUTO.cloud = false; AUTO.tb = { on: true, auto: false, at: 0, status: '已开启' };
	({ page, ctx } = await open(browser, { dark: true }));
	await page.goto('http://panel.test/panel/'); await page.waitForTimeout(1200); await goWd(page);
	s = await st(page);
	await page.locator('#auCard').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(OUT, 'auto_dark.png') });
	ok('没装代理插件、没开云端：只显示用得上的（隧道重启、面板重启、清缓存、每日体检、每周报告、新设备提醒、安全和状态提醒）', s.rows.map((r) => r.split(':')[0]).join() === 'tunrestart,panelrestart,cacheclean,daily,weekly,newdev,loginalert,autoban,ipchange,health,diskfull' && /没装代理插件/.test(s.txt), JSON.stringify(s));
	await ctx.close();
	await browser.close();
	for (const [n, c, note] of results) console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '（' + note + '）'));
	if (problems.length) console.log('问题：\n' + [...new Set(problems)].join('\n'));
	console.log(`通过 ${results.filter((r) => r[1]).length}/${results.length}`);
})();

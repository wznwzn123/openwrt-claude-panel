// 4.0「通知」：顶栏铃铛 + 未读数、侧边栏「消息 → 通知」、通知页（分类、标新、点了去哪）、重要公告弹一次、App 新版本
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel')); const T = Date.now(), S = Math.round(T / 1000);
const R = []; const ok = (n, c, x) => R.push((c ? '✓ ' : '✗ ') + n + (c ? '' : '（' + x + '）'));
let SEEN = { t: T - 3 * 3600e3, pop: [] }, SEENCALLS = [], UPDNEW = true;
const ANN = [{ id: 'abcdefghij', title: '4.0 发布了', body: '面板里新加了「通知」：路由器的故障、公告、更新、反馈进度都在一个地方。\n第二行说明\n第三行说明', level: 'important', at: T - 3600e3, upd: T - 3600e3 },
	{ id: 'bcdefghijk', title: '今晚 2 点维护', body: '官网维护 10 分钟，家里上网不受影响。', level: 'normal', at: T - 2 * 864e5, upd: T - 2 * 864e5 }];
const EV = [{ t: S - 600, lvl: 'err', kind: 'clash', msg: 'OpenClash 停了，已自动重启', detail: '内存不够，被系统结束了', from: 0, to: 0 }, { t: S - 500, lvl: 'ok', kind: 'clash', msg: 'OpenClash 恢复正常', detail: '', from: 0, to: 0 },
	{ t: S - 5 * 3600, lvl: 'info', kind: 'newdev', msg: '新设备连上了：iPhone', detail: '192.168.1.23', from: 0, to: 0 }, { t: S - 864e5 / 1000 * 3, lvl: 'warn', kind: 'dns', msg: 'DNS 解析慢', detail: '', from: 0, to: 0 }];
const FB = [{ code: 'K7F2Q9AB', kind: '问题反馈', text: '节点页打不开', at: T - 2 * 864e5, state: 'fixed', stage: 3, ackAt: T - 1.5 * 864e5, done: 1, doneAt: T - 7200e3, reply: '修好了', updated: T - 7200e3, seen: T - 7200e3, history: [{ at: T - 7200e3, st: 'fixed', note: '修好了，升级到 4.0 就行' }] }];
const CLOUD = { now: T, s: { state: 'ok', since: T - 864e5, msg: '一切正常' }, label: { ok: '一切正常' }, r: { last: T - 30e3 }, t: null, probe: null,
	events: [{ t: T - 7 * 3600e3, lvl: 'err', kind: 'cloud', msg: '路由器断电或死机：平板还在报告', detail: '' }, { t: T - 6.5 * 3600e3, lvl: 'ok', kind: 'cloud', msg: '恢复正常（离线共 30 分钟）', detail: '' }],
	notes: [{ t: T - 864e5 - 3600e3, title: '✅ 托管服务已续期', body: '续了 90 天，到期时间 2027-02-12。', tag: 'svc', lvl: 'ok' }] };
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), a = body.params || {};
		let r;
		if (m === 'notices') r = { now: Math.round(Date.now() / 1000), app: a.app ? { version: '3.2.0', notes: 'App 修了一些问题', rel: new Date(T - 864e5).toISOString() } : null, ann: ANN, annAt: S, annFail: false, events: EV, fb: FB, hosted: true, seen: JSON.parse(JSON.stringify((SEEN.ack = SEEN.ack || SEEN.pop.slice(), SEEN))) };
		else if (m === 'notices_seen') { SEENCALLS.push(a); if (a.t) SEEN.t = Math.max(SEEN.t, a.t); if (a.pop) SEEN.pop.push(a.pop); if (a.ack) SEEN.ack.push(a.ack); r = { ok: true }; }
		else if (m === 'fb_replies') r = { list: FB, hosted: true };
		// seen：这个新版本已经弹过（6.0 第 85 项：没弹过的会先弹新版本卡片，这里测的是公告，所以当成弹过了）
		else if (m === 'update_check') r = UPDNEW ? { cur: '3.1.3', code: 'hosted-ai', latest: '4.0.0', notes: '新加了「通知」', rel: new Date(T - 1800e3).toISOString(), newer: true, force: false, seen: '4.0.0' } : respond(m, a);
		else r = respond(m, a);
		res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: r })); }
	if (u.pathname === '/cloud/s') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(CLOUD)); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const overlap = (p, sel) => p.evaluate((sel) => {
	const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent && e.getBoundingClientRect().width);
	const bad = []; for (const e of els) { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1) bad.push('超出：' + (e.id || e.className || e.tagName) + ' ' + e.textContent.trim().slice(0, 8)); }
	for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { if (els[i].contains(els[j]) || els[j].contains(els[i])) continue; const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect(); if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) bad.push((els[i].id || els[i].className) + '×' + (els[j].id || els[j].className)); }
	return bad.join('；');
}, sel);
const OUT = path.join(__dirname, 'shots');
(async () => {
	await new Promise((r) => server.listen(8155, r)); const b = await chromium.launch();
	for (const dark of [false, true]) {
		SEEN = { t: T - 3 * 3600e3, pop: [] }; SEENCALLS = [];
		const sfx = dark ? '-dark' : '';
		const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light', userAgent: 'Mozilla/5.0 (Linux; Android 14; 23127PN0CC Build/UKQ1) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 RouterPanelApp/3.1.3' });
		const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
		await p.addInitScript(() => localStorage.setItem('rp_token', 'testtokentesttokentest'));
		await p.clock.install();
		await p.goto('http://localhost:8155/panel/'); await p.clock.runFor(2000); await p.waitForTimeout(300);
		ok('顶栏有铃铛' + sfx, await p.isVisible('#bellBtn'));
		ok('顶栏：铃铛、标题、状态不重叠、不超出屏幕' + sfx, !(await overlap(p, '#topbar .brand > *, #bellBtn, #topbar .topcap, #jobPill')), await overlap(p, '#topbar .brand > *, #bellBtn, #topbar .topcap'));
		await p.clock.runFor(7000); await p.waitForTimeout(800);
		ok('打开 6 秒后：重要公告弹一次' + sfx, await p.isVisible('.modal[data-ann]') && /4\.0 发布了/.test(await p.textContent('.modal[data-ann]')), await p.isVisible('.modal'));
		ok('弹过的记下来（以后不再弹）', SEENCALLS.some((x) => x.pop === 'abcdefghij'));
		await p.screenshot({ path: path.join(OUT, 'nt-pop' + sfx + '.png') });
		// 点外面关掉（没点「知道了」）：这条还留在通知页的「待处理」里
		await p.mouse.click(8, 8); await p.waitForTimeout(400);
		ok('点外面关掉公告：不算「知道了」', !(await p.isVisible('.modal[data-ann]')) && !SEENCALLS.some((x) => x.ack));
		const badge = await p.textContent('#bellN');
		// 3 小时以内的：2 条路由器事件 + 公告 + 反馈修好 + 路由器新版本 + App 新版本 = 6
		ok('铃铛上的数字：3 小时内的新通知 5 条（App 新版本是昨天发的）', !(await p.isHidden('#bellN')) && badge === '5', badge);
		await p.screenshot({ path: path.join(OUT, 'nt-bell' + sfx + '.png'), clip: { x: 0, y: 0, width: 390, height: 80 } });
		await p.clock.runFor(70000); await p.waitForTimeout(500);
		ok('过一分钟再查：不会再弹同一条公告', !(await p.isVisible('.modal[data-ann]')));
		// 点铃铛进通知页
		await p.click('#bellBtn'); await p.waitForTimeout(1200);
		ok('点铃铛进「通知」页', await p.isVisible('#p-notice') && (await p.textContent('#pageTitle')) === '通知');
		ok('进来以后铃铛清零', await p.isHidden('#bellN'));
		ok('记下看到哪儿了（最新一条的时间）', SEENCALLS.some((x) => x.t >= T - 1800e3), JSON.stringify(SEENCALLS));
		const txt = await p.textContent('#p-notice');
		ok('都在：路由器的事件、云端监测、托管服务、公告、更新、反馈、App', ['OpenClash 停止 1 分', '路由器断电或死机 30 分', '托管服务已续期', '4.0 发布了', '今晚 2 点维护', '新版本 v4.0.0', '反馈 K7F2Q9AB 已修复', 'App 新版本 3.2.0'].every((s) => txt.includes(s)), txt.slice(0, 400));
		// 6.0 第 93 项：顶部写现在的状态和近 7 天具体出了什么事
		ok('顶部：运行正常', (await p.textContent('#ntHead')) === '运行正常', await p.textContent('#ntHead'));
		const sum = await p.textContent('#ntSum');
		ok('近 7 天：按种类写具体次数，恢复了的说清楚', /^近 7 天/.test(sum) && /OpenClash 停止 1 次，已自动重启/.test(sum) && /路由器断电或死机 1 次，已恢复/.test(sum) && /DNS 出问题 1 次/.test(sum), sum);
		ok('7 天健康条：7 格，今天在最后', (await p.locator('#ntStrip .ntbars button').count()) === 7 && /今天$/.test(await p.textContent('#ntStrip .ntdays')));
		// 待处理
		const pend = await p.$$eval('#ntPin .ntact b', (bs) => bs.map((b) => b.textContent));
		ok('待处理：重要公告、新版本、反馈修好了、App 新版本', pend.length === 4 && /重要4\.0 发布了/.test(pend[0]) && /新版本 v4\.0\.0/.test(pend[1]) && /反馈 K7F2Q9AB 已修复/.test(pend[2]) && /App 新版本 3\.2\.0/.test(pend[3]), JSON.stringify(pend));
		ok('新版本卡片直接带「一键更新」', /一键更新/.test(await p.locator('#ntPin .ntact', { hasText: '新版本 v4.0.0' }).textContent()));
		ok('待处理里的不在时间线里重复', !(await p.textContent('#ntList')).includes('新版本 v4.0.0') && !(await p.textContent('#ntList')).includes('4.0 发布了'));
		// 时间线
		const mg = p.locator('#ntList .ntev', { hasText: 'OpenClash 停止' });
		ok('同一件事合成一条：标题写多久、已自动重启，下面写原因，带两个时间', (await mg.count()) === 1 && /OpenClash 停止 1 分[^，]*，已自动重启/.test(await mg.locator('b').textContent()) && /内存不够，被系统结束了/.test(await mg.textContent()) && (await mg.locator('.ntmg span').count()) === 2, await mg.textContent());
		ok('合并后不再单独出现「停了」「恢复」两条', (await p.locator('#ntList .ntev').filter({ hasText: 'OpenClash 恢复正常' }).count()) === 0 && (await p.locator('#ntList .ntev').filter({ hasText: '已自动重启' }).count()) === 1);
		ok('断电合成一条：写多久、已恢复，原因是冒号后面那段', /路由器断电或死机 30 分[^，]*，已恢复/.test(await p.textContent('#ntList')) && /平板还在报告/.test(await p.textContent('#ntList')));
		ok('公告、托管带小标签；托管标题去掉了表情', /公告今晚 2 点维护/.test(await p.textContent('#ntList')) && /托管托管服务已续期/.test(await p.textContent('#ntList')) && !(await p.textContent('#ntList')).includes('✅'));
		ok('按天分组：今天、昨天…', /今天/.test(await p.textContent('#ntList')) && /昨天|月/.test(await p.textContent('#ntList')));
		ok('今天的写「几分钟前」', /分钟前/.test(await mg.locator('.nttm').textContent()));
		ok('没看过的加粗：1 条', (await p.locator('#ntList .ntev.new').count()) === 1, await p.locator('#ntList .ntev.new').count());
		ok('入口：联系开发者、我的反馈（有 1 条反馈进度）', /联系开发者/.test(await p.textContent('.ntqb')) && (await p.textContent('#ntFbN')) === '1');
		ok('通知页排版不重叠、不超出' + sfx, !(await overlap(p, '#p-notice .nthero > *, .ntqb button, .ntact, .ntact .ntbtns > *, .ntday, .ntev > *, .ntmg > *')), await overlap(p, '#p-notice .nthero > *, .ntqb button, .ntact, .ntact .ntbtns > *, .ntday, .ntev > *, .ntmg > *'));
		ok('没有横向滚动' + sfx, (await p.evaluate(() => document.documentElement.scrollWidth)) <= 390);
		await p.screenshot({ path: path.join(OUT, 'nt-page' + sfx + '.png'), fullPage: true });
		// 重要公告：看全文、知道了
		const ac = p.locator('#ntPin .ntact', { hasText: '4.0 发布了' });
		const h0 = (await ac.boundingBox()).height; await ac.locator('[data-pa="annfull"]').click(); await p.waitForTimeout(200);
		ok('重要公告：点「看全文」展开', (await ac.boundingBox()).height > h0 && /收起/.test(await ac.textContent()));
		await ac.locator('[data-pa="ack"]').click(); await p.waitForTimeout(700);
		ok('点「知道了」：记到路由器，移到下面的时间线', SEENCALLS.some((x) => x.ack === 'abcdefghij') && !(await p.textContent('#ntPin')).includes('4.0 发布了') && /重要4\.0 发布了/.test(await p.textContent('#ntList')));
		const an = p.locator('#ntList .ntev', { hasText: '4.0 发布了' });
		await an.click(); await p.waitForTimeout(200);
		ok('时间线里的公告点开看全文', (await an.getAttribute('class')).includes('open') && /第三行说明/.test(await an.textContent()));
		// 点健康条的某一天：跳到那天
		await p.locator('#ntStrip .ntbars button').last().click(); await p.waitForTimeout(500);
		ok('点健康条上的「今天」：跳到今天那一组', await p.evaluate(() => { const g = [...document.querySelectorAll('#ntList .ntday')].find((x) => x.dataset.day === '今天'); const r = g.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight / 2; }));
		await p.locator('#ntList .ntev', { hasText: 'OpenClash 停止' }).click(); await p.waitForTimeout(800);
		ok('点路由器事件：去「断线记录」', await p.isVisible('#p-wd'));
		await p.click('#bellBtn'); await p.waitForTimeout(900);
		ok('再进来：刚才的不再加粗', (await p.locator('#ntList .ntev.new').count()) === 0);
		ok('看过的反馈进度不再放在「待处理」', !(await p.textContent('#ntPin')).includes('K7F2Q9AB'));
		await p.locator('#ntList .ntev', { hasText: 'K7F2Q9AB' }).first().click(); await p.waitForTimeout(1200);
		ok('点反馈进度：去「我的反馈」并展开那一条', await p.isVisible('#p-myfb') && await p.isVisible('[data-fbi="K7F2Q9AB"].hl, [data-fbi="K7F2Q9AB"]'));
		await p.click('#bellBtn'); await p.waitForTimeout(800);
		await p.locator('#ntPin .ntact', { hasText: '新版本 v4.0.0' }).locator('[data-pa="updinfo"]').click(); await p.waitForTimeout(800);
		ok('点「更新内容」：打开更新窗口', await p.isVisible('.modal[data-upd]'));
		await p.click('.modal[data-upd] [data-v="close"]'); await p.waitForTimeout(400);
		await p.locator('#ntPin .ntact', { hasText: '新版本 v4.0.0' }).locator('[data-pa="upd"]').click(); await p.waitForTimeout(500);
		ok('点「一键更新」：先确认', /更新到 v4\.0\.0/.test(await p.textContent('.modal .modalbox')));
		await p.click('.modal [data-v="false"]'); await p.waitForTimeout(400);
		await p.locator('#ntPin .ntact', { hasText: 'App 新版本' }).locator('[data-pa="app"]').click(); await p.waitForTimeout(300);
		ok('点 App 新版本：提示回 App 首页更新', /App 首页/.test(await p.textContent('#toast')));
		// 侧边栏
		await p.click('#menuBtn'); await p.waitForTimeout(500);
		const nav = await p.textContent('#sidenav');
		ok('侧边栏有「消息与帮助」分组：通知、实时联系开发者、我的反馈', /消息与帮助/.test(nav) && /通知/.test(nav) && /实时联系开发者/.test(nav) && /我的反馈/.test(nav));
		await p.screenshot({ path: path.join(OUT, 'nt-side' + sfx + '.png') });
		ok('页面没有报错' + sfx, !errs.length, errs.join(' | '));
		await c.close();
	}
	// 窄屏 320、宽屏 1280：顶栏不挤
	for (const w of [320, 360, 1280]) {
		const c = await b.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1 }); const p = await c.newPage();
		await p.addInitScript(() => localStorage.setItem('rp_token', 'testtokentesttokentest'));
		await p.goto('http://localhost:8155/panel/?p=notice'); await p.waitForTimeout(2500);
		ok('宽 ' + w + '：顶栏不重叠、不超出', !(await overlap(p, '#topbar .brand > *, #bellBtn, #topbar .topcap')), await overlap(p, '#topbar .brand > *, #bellBtn, #topbar .topcap'));
		const SEL = '#p-notice .nthero > *, .ntqb button, .ntact, .ntact .ntbtns > *, .ntday, .ntev > *, .ntmg > *, .ntdays span';
		ok('宽 ' + w + '：通知页不重叠、没有横向滚动', !(await overlap(p, SEL)) && (await p.evaluate(() => document.documentElement.scrollWidth)) <= w, await overlap(p, SEL));
		ok('宽 ' + w + '：「联系开发者」「我的反馈」不折行、不被截', await p.evaluate(() => [...document.querySelectorAll('.ntqb span')].every((x) => x.scrollWidth <= x.clientWidth + 1)));
		await p.screenshot({ path: path.join(OUT, 'nt-w' + w + '.png') });
		await c.close();
	}
	// 没有公告、没有新通知：铃铛不显示数字；不在 App 里：没有 App 那条
	SEEN = { t: T + 864e5, pop: ['abcdefghij'] }; UPDNEW = false;
	{ const c = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage(); await p.addInitScript(() => localStorage.setItem('rp_token', 'testtokentesttokentest')); await p.clock.install();
		await p.goto('http://localhost:8155/panel/'); await p.clock.runFor(9000); await p.waitForTimeout(600);
		ok('都看过了：铃铛没有数字、不弹公告', await p.isHidden('#bellN') && !(await p.isVisible('.modal[data-ann]')));
		await p.click('#bellBtn'); await p.waitForTimeout(900);
		ok('不在 App 里打开：没有 App 新版本那条', !(await p.textContent('#p-notice')).includes('App 新版本'));
		ok('都看过了：没有「待处理」', !(await p.textContent('#ntPin')).includes('待处理'));
		await c.close(); }
	// 6.0 第 85 项：新装的路由器（since = 刚开始记）只弹 7 天以内发的重要公告；更早的不弹，在「通知」里能看到
	ANN.push({ id: 'cdefghijkm', title: '十天前的重要公告', body: '旧的', level: 'important', at: T - 10 * 864e5, upd: T - 10 * 864e5 });
	SEEN = { t: T, since: T, pop: [] }; SEENCALLS = [];
	{ const c = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage(); await p.addInitScript(() => localStorage.setItem('rp_token', 'testtokentesttokentest')); await p.clock.install();
		await p.goto('http://localhost:8155/panel/'); await p.clock.runFor(9000); await p.waitForTimeout(600);
		ok('新装的路由器：7 天内的重要公告照样弹', await p.isVisible('.modal[data-ann]') && /4\.0 发布了/.test(await p.textContent('.modal[data-ann]')));
		await p.click('.modal[data-ann] [data-v="close"]'); await p.waitForTimeout(300);
		await p.waitForTimeout(500); ok('公告弹窗点「知道了」：记下来，不再放进「待处理」', SEENCALLS.some((x) => x.ack === 'abcdefghij'), JSON.stringify(SEENCALLS));
		await p.clock.runFor(75000); await p.waitForTimeout(800);
		ok('新装的路由器：十天前的重要公告不弹', !(await p.isVisible('.modal[data-ann]')) && !SEENCALLS.some((x) => x.pop === 'cdefghijkm'), JSON.stringify(SEENCALLS));
		await p.click('#bellBtn'); await p.waitForTimeout(900);
		ok('十天前的那条在「通知」里还能看到', (await p.textContent('#p-notice')).includes('十天前的重要公告'));
		await c.close(); }
	// 从老版本升上来的（没有 since）：照旧，没弹过的重要公告都弹（弹过的记着，不会重弹）
	SEEN = { t: T - 3 * 3600e3, pop: ['abcdefghij'] }; SEENCALLS = [];
	{ const c = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage(); await p.addInitScript(() => localStorage.setItem('rp_token', 'testtokentesttokentest')); await p.clock.install();
		await p.goto('http://localhost:8155/panel/'); await p.clock.runFor(9000); await p.waitForTimeout(600);
		ok('老版本升上来的：没弹过的重要公告照旧弹（不管多久以前）', await p.isVisible('.modal[data-ann]') && /十天前的重要公告/.test(await p.textContent('.modal[data-ann]')));
		await c.close(); }
	console.log(R.join('\n')); const pass = R.filter((x) => x.startsWith('✓')).length; console.log('\n通过 ' + pass + '/' + R.length);
	await b.close(); server.close();
})();

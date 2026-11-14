// 问题反馈的回复：打开面板时提示一次（处理好了 / 有回复）；看过的不再提示；没有回复不打扰；发反馈后显示编号
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel')), OUT = path.join(__dirname, 'shots');
const results = []; const ok = (n, c, note) => results.push([n, !!c, note || '']);
// 弹窗里每一块（标题、文字、编号行、按钮）互相不重叠、不超出弹窗
const noOverlap = (page, sel) => page.evaluate((sel) => {
	const m = document.querySelector(sel); if (!m) return 'no modal';
	const box = m.querySelector('.sheet, .box') || m.firstElementChild, B = box.getBoundingClientRect();
	const els = [...box.children].filter((e) => e.offsetParent && e.getBoundingClientRect().height > 0);
	const bad = [];
	const all = [...els, ...box.querySelectorAll('[data-fbcode] > *, .btngrid > *')];
	for (const e of all) { const r = e.getBoundingClientRect(); if (r.left < B.left - 1 || r.right > B.right + 1) bad.push('超出：' + (e.textContent || '').trim().slice(0, 12)); }
	const check = (list) => { for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = list[i].getBoundingClientRect(), b = list[j].getBoundingClientRect(); if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push((list[i].textContent || '').trim().slice(0, 10) + ' × ' + (list[j].textContent || '').trim().slice(0, 10)); } };
	check(els); const fs = box.querySelector('.fsteps'); if (fs) { check([...fs.children]); for (const d of fs.children) check([...d.children]); }
	const row = box.querySelector('[data-fbcode]'); if (row) check([...row.children]); const g = box.querySelector('.btngrid'); if (g) check([...g.children]);
	return bad.join('；');
}, sel);
let LIST = [], SEEN = [], FBN = 0, HOSTED = true, STALE = false, FBP = [];
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), a = body.params || {}; let r;
		if (m === 'fb_replies') { FBN++; FBP.push(a); r = HOSTED ? { list: LIST, hosted: true, stale: STALE } : { list: [], hosted: false }; }
		else if (m === 'fb_seen') { SEEN.push(a); LIST = LIST.map((x) => x.code === a.code ? { ...x, seen: a.updated } : x); r = { ok: true }; }
		else if (m === 'feedback') r = { ok: true, sent: 'hub', images: 1, code: 'K7F2Q9AB', track: 'https://yrlove520.com/r/K7F2Q9AB' };
		else if (m === 'cloud_info') r = { enabled: false };
		else r = respond(m, a);
		res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: r })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
(async () => {
	await new Promise((r) => server.listen(8153, r));
	const browser = await chromium.launch();
	const open = async (dark) => {
		const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
		await ctx.route('https://yrlove520.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
		const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
		await page.addInitScript((d) => { localStorage.setItem('rp_token', 'tok1234567890abcdefgh'); localStorage.setItem('rp_dark', d ? '1' : '0'); }, dark);
		await page.goto('http://localhost:8153/panel/'); return { ctx, page, errs };
	};
	// 1 没有回复：不弹
	LIST = [{ code: 'WAIT2345', at: Date.now() - 86400e3, done: 0, reply: '', updated: 0, seen: 0 }];
	let { ctx, page, errs } = await open(false); await page.waitForTimeout(11000);
	ok('没有回复的反馈：不弹窗，不打扰', FBN >= 1 && !(await page.isVisible('.modal[data-fbr]')));
	await ctx.close();
	// 2 处理好了、写了回复：弹一次
	LIST = [{ code: 'K7F2Q9AB', at: Date.now() - 2 * 86400e3, done: 1, reply: '是首页卡片的问题。\n已经在 v3.1.0 修好，点「一键更新」就行。', replyAt: Date.now() - 3600e3, updated: Date.now() - 3600e3, seen: 0, track: 'https://yrlove520.com/r/K7F2Q9AB' }];
	({ ctx, page, errs } = await open(false)); await page.waitForTimeout(11000);
	ok('修好了：打开面板提示「你反馈的问题修好了」', await page.isVisible('.modal[data-fbr]') && /你反馈的问题修好了/.test(await page.textContent('.modal[data-fbr]')));
	ok('进度条：只有三段文字「反馈成功 / 开发人员已收到 / 已修复」，三段都亮', (await page.textContent('.modal[data-fbr] .fsteps')).replace(/[✓✕\d\s]/g, '') === '反馈成功开发人员已收到已修复' && (await page.locator('.modal[data-fbr] .fsteps > .on').count()) === 3, await page.textContent('.modal[data-fbr] .fsteps'));
	const txt = await page.textContent('.modal[data-fbr]');
	ok('提示里有编号和开发者的回复（换行保留）', /K7F2Q9AB/.test(txt) && /已经在 v3\.1\.0 修好/.test(txt) && await page.evaluate(() => getComputedStyle(document.querySelector('.modal[data-fbr] [data-txt]')).whiteSpace) === 'pre-wrap', txt);
	ok('告诉路由器「看过了」（处理好的编号以后不再问）', SEEN.length === 1 && SEEN[0].code === 'K7F2Q9AB' && SEEN[0].done === 1, JSON.stringify(SEEN));
	await page.screenshot({ path: OUT + '/fbreply-light.png' });
	ok('回复弹窗：排版不重叠、不超出', (await noOverlap(page, '.modal[data-fbr]')) === '', await noOverlap(page, '.modal[data-fbr]'));
	await page.click('.modal[data-fbr] [data-cc]'); await page.waitForTimeout(300);
	ok('回复弹窗：点「复制」复制编号', (await page.evaluate(() => navigator.clipboard.readText())) === 'K7F2Q9AB' && /已复制/.test(await page.textContent('#toast')));
	await page.click('.modal[data-fbr] [data-track]'); await page.waitForTimeout(1500);
	ok('回复弹窗：「查看完整记录」关掉弹窗，打开面板里的「我的反馈」，这一条展开了记录', !(await page.isVisible('.modal[data-fbr]')) && await page.isVisible('#p-myfb') && (await page.textContent('#pageTitle')) === '我的反馈' && await page.isVisible('[data-fbi="K7F2Q9AB"] [data-histbox]'));
	ok('页面没有报错', !errs.length, errs.join(' | '));
	await ctx.close();
	// 3 看过以后再打开：不再弹
	({ ctx, page } = await open(false)); await page.waitForTimeout(11000);
	ok('看过的回复：再打开面板不再提示', !(await page.isVisible('.modal[data-fbr]')));
	await ctx.close();
	// 4 还在处理、有新回复：深色模式下看看样子
	LIST = [{ code: 'WAIT2345', at: Date.now() - 86400e3, done: 0, reply: '收到了，正在查是哪一步出的问题，明天告诉你。', replyAt: Date.now() - 600e3, updated: Date.now() - 600e3, seen: 0 }];
	({ ctx, page } = await open(true)); await page.waitForTimeout(11000);
	ok('还在处理、有说明：提示「你的反馈有新的说明」', await page.isVisible('.modal[data-fbr]') && /有新的说明/.test(await page.textContent('.modal[data-fbr]')));
	ok('写了说明但没标已收到（旧数据）：进度条也亮到第二段', (await page.getAttribute('.modal[data-fbr] .fsteps', 'data-stage')) === '2');
	ok('没有网页网址时也能「查看完整记录」（在面板里看）', await page.isVisible('.modal[data-fbr] [data-track]') && (await noOverlap(page, '.modal[data-fbr]')) === '');
	await page.screenshot({ path: OUT + '/fbreply-dark.png' });
	await page.click('.modal[data-fbr] [data-v="close"]'); await page.waitForTimeout(500);
	ok('点「知道了」关掉', !(await page.isVisible('.modal[data-fbr]')));
	await ctx.close();
	// 4a 无法修复：如实提示，第三段变成「无法修复」，带原因；看过以后不再问
	const NOFX = [{ code: 'NOFX2345', at: Date.now() - 86400e3, done: 0, nofix: 1, stage: 3, ackAt: Date.now() - 7200e3, reply: '这是固件自带的 opkg 的问题，面板这边改不了。\n换成 Kwrt 稳定版以后可以再试一次。', updated: Date.now() - 600e3, seen: 0, track: 'https://yrlove520.com/r/NOFX2345' }]; SEEN = [];
	for (const dark of [false, true]) {
		LIST = NOFX.map((x) => ({ ...x }));
		({ ctx, page, errs } = await open(dark)); await page.waitForTimeout(11000);
		const tx = await page.textContent('.modal[data-fbr]').catch(() => '');
		if (!dark) {
			ok('无法修复：提示「你反馈的问题暂时没法修复」，写着原因', /暂时没法修复/.test(tx) && /开发者说明的原因/.test(tx) && /面板这边改不了/.test(tx), tx);
			ok('无法修复：进度条第三段是红色的「✕ 无法修复」，没有「已修复」', (await page.textContent('.modal[data-fbr] .fsteps .bad')) === '✕无法修复' && !/已修复/.test(await page.textContent('.modal[data-fbr] .fsteps')));
			ok('无法修复：看过以后编号不再问', SEEN.length === 1 && SEEN[0].code === 'NOFX2345' && SEEN[0].done === 1, JSON.stringify(SEEN));
			ok('无法修复弹窗：排版不重叠', (await noOverlap(page, '.modal[data-fbr]')) === '', await noOverlap(page, '.modal[data-fbr]'));
			ok('页面没有报错', !errs.length, errs.join(' | '));
		} else ok('深色：无法修复弹窗排版不重叠', (await noOverlap(page, '.modal[data-fbr]')) === '', await noOverlap(page, '.modal[data-fbr]'));
		await page.screenshot({ path: OUT + '/fbreply-nofix' + (dark ? '-dark' : '') + '.png' });
		await ctx.close();
	}
	// 4b 回复很长：先折叠，点「查看全部」展开，再点收起；短的不折叠
	LIST = [{ code: 'LONG2345', at: Date.now() - 86400e3, done: 1, reply: Array.from({ length: 14 }, (_, i) => '第 ' + (i + 1) + ' 行：这是一段比较长的回复，说明问题的原因和处理办法。').join('\n'), updated: Date.now(), seen: 0 }];
	({ ctx, page } = await open(false)); await page.waitForTimeout(11000);
	const h0 = await page.evaluate(() => document.querySelector('.modal[data-fbr] [data-txt]').getBoundingClientRect().height);
	ok('回复很长：先折叠（只显示几行），有「查看全部」', await page.isVisible('.modal[data-fbr] [data-more]') && h0 < 200 && (await page.textContent('.modal[data-fbr] [data-more]')) === '查看全部', String(h0));
	await page.screenshot({ path: OUT + '/fbreply-long.png' });
	await page.click('.modal[data-fbr] [data-more]'); await page.waitForTimeout(400);
	const h1 = await page.evaluate(() => document.querySelector('.modal[data-fbr] [data-txt]').getBoundingClientRect().height);
	ok('点「查看全部」：全部展开，按钮变成「收起」', h1 > h0 * 2 && (await page.textContent('.modal[data-fbr] [data-more]')) === '收起' && /第 14 行/.test(await page.textContent('.modal[data-fbr] [data-txt]')), h0 + ' → ' + h1);
	await page.screenshot({ path: OUT + '/fbreply-long-open.png' });
	ok('长回复展开后：排版不重叠', (await noOverlap(page, '.modal[data-fbr]')) === '', await noOverlap(page, '.modal[data-fbr]'));
	ok('展开后弹窗能往下滑看到「知道了」', await page.evaluate(() => { const b = document.querySelector('.modal[data-fbr] [data-v="close"]'); b.scrollIntoView(); const r = b.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0; }));
	await page.click('.modal[data-fbr] [data-more]'); await page.waitForTimeout(300);
	ok('再点「收起」：又折叠回去', Math.abs((await page.evaluate(() => document.querySelector('.modal[data-fbr] [data-txt]').getBoundingClientRect().height)) - h0) < 2);
	await ctx.close();
	LIST = [{ code: 'SHRT2345', at: Date.now() - 86400e3, done: 1, reply: '修好了。', updated: Date.now(), seen: 0 }];
	({ ctx, page } = await open(false)); await page.waitForTimeout(11000);
	ok('回复很短：不折叠，没有「查看全部」', await page.isVisible('.modal[data-fbr]') && !(await page.isVisible('.modal[data-fbr] [data-more]')));
	await ctx.close();
	// 5 有更新提示（必须更新弹窗）开着时：不叠在一起
	LIST = [{ code: 'K7F2Q9AB', at: Date.now(), done: 1, reply: 'x', updated: Date.now(), seen: 0 }];
	({ ctx, page } = await open(false)); await page.waitForTimeout(2500);
	await page.evaluate(() => { const d = document.createElement('div'); d.className = 'modal'; d.id = 'fake'; document.body.appendChild(d); });
	await page.waitForTimeout(9000);
	ok('别的弹窗开着时不弹（不叠在一起）', !(await page.isVisible('.modal[data-fbr]')));
	await ctx.close();
	// 6 发反馈：弹「反馈已发送」卡片，编号能复制、能打开进度页
	for (const dark of [false, true]) {
	({ ctx, page } = await open(dark)); await page.waitForTimeout(3000);
	await page.evaluate(() => { const b = document.querySelector('[data-t="feedback"]'); b && b.click(); }); await page.waitForTimeout(800);
	const ta = await page.$('.modal textarea'); if (ta) { await ta.fill('首页的今日流量一直是 0，刷新也没用'); }
	await page.evaluate(() => { const g = [...document.querySelectorAll('.modal button')].find((b) => /发送/.test(b.textContent)); g && g.click(); }); await page.waitForTimeout(1500);
	const st = await page.textContent('.modal[data-fbsent]').catch(() => '');
	await page.screenshot({ path: OUT + '/fbreply-sent' + (dark ? '-dark' : '') + '.png' });
	if (!dark) {
		ok('发反馈成功：弹「反馈已发送」，有编号、截图张数、回复会在打开面板时弹出', /反馈已发送/.test(st) && /K7F2Q9AB/.test(st) && /1 张截图也一起发过去了/.test(st) && /打开面板时会自动弹出来/.test(st), st);
		ok('发送成功卡片：进度条只亮第一段「反馈成功」', (await page.getAttribute('.modal[data-fbsent] .fsteps', 'data-stage')) === '1' && (await page.locator('.modal[data-fbsent] .fsteps > .on').count()) === 1);
		ok('发送成功卡片：排版不重叠、不超出', (await noOverlap(page, '.modal[data-fbsent]')) === '', await noOverlap(page, '.modal[data-fbsent]'));
		await page.click('.modal[data-fbsent] [data-cc]'); await page.waitForTimeout(300);
		ok('发送成功卡片：点「复制」复制编号', (await page.evaluate(() => navigator.clipboard.readText())) === 'K7F2Q9AB');
		await page.click('.modal[data-fbsent] [data-track]'); await page.waitForTimeout(1500);
		ok('发送成功卡片：「查看处理进度」到面板里的「我的反馈」', !(await page.isVisible('.modal[data-fbsent]')) && await page.isVisible('#p-myfb'));
	} else {
		ok('深色模式：发送成功卡片排版不重叠', (await noOverlap(page, '.modal[data-fbsent]')) === '', await noOverlap(page, '.modal[data-fbsent]'));
		await page.click('.modal[data-fbsent] [data-v="close"]'); await page.waitForTimeout(400);
		ok('点「好的」关掉', !(await page.isVisible('.modal[data-fbsent]')));
	}
	await ctx.close();
	}
	// 7 「我的反馈」页面
	const T = Date.now();
	const MY = () => [
		{ code: 'K7F2Q9AB', kind: '问题反馈', text: '首页的今日流量一直是 0，刷新也没用。\n换了浏览器也一样。', at: T - 3 * 864e5, state: 'fixed', stage: 3, ackAt: T - 2 * 864e5, done: 1, nofix: 0, reply: '已经在 v3.1.0 修好，点「一键更新」就行。', updated: T - 3600e3, seen: T - 3600e3, track: 'https://yrlove520.com/r/K7F2Q9AB',
			history: [{ at: T - 3600e3, st: 'fixed', note: '已经在 v3.1.0 修好，点「一键更新」就行。' }, { at: T - 1.5 * 864e5, st: 'note', note: '找到原因了，是统计脚本没跑起来。' }] },
		{ code: 'NOFX2345', kind: '问题反馈', text: '想在面板里直接刷固件', at: T - 2 * 864e5, state: 'nofix', stage: 3, ackAt: T - 864e5, nofix: 1, reply: '刷固件风险太大，面板不打算做。', updated: T - 7200e3, seen: 0, track: 'https://yrlove520.com/r/NOFX2345', history: [{ at: T - 7200e3, st: 'nofix', note: '刷固件风险太大，面板不打算做。' }] },
		{ code: 'ACKD2345', kind: '问题反馈', text: '设备列表里有一台叫不出名字', at: T - 864e5, state: 'open', stage: 2, ackAt: T - 600e3, reply: '', updated: T - 600e3, seen: 0, track: 'https://yrlove520.com/r/ACKD2345', history: [] },
		{ code: 'SENT2345', kind: '问题反馈', text: '一个很长很长的反馈'.repeat(12), at: T - 600e3, state: 'open', stage: 1, ackAt: 0, reply: '', updated: 0, seen: 0, track: 'https://yrlove520.com/r/SENT2345', history: [] },
	];
	const listOverlap = (page) => page.evaluate(() => {
		const bad = [];
		for (const card of document.querySelectorAll('#myfbList .fbitem')) {
			const C = card.getBoundingClientRect();
			const groups = [[...card.children].filter((e) => !e.classList.contains('hidden')), [...card.querySelectorAll('.fbhd > *')], [...card.querySelectorAll('.fsteps > div')], [...card.querySelectorAll('[data-fbcode] > *')], [...card.querySelectorAll('.btngrid > *')], ...[...card.querySelectorAll('.fsteps > div')].map((d) => [...d.children])];
			for (const g of groups) { const v = g.filter((e) => e.getBoundingClientRect().height);
				for (const e of v) { const r = e.getBoundingClientRect(); if (r.left < C.left - 1 || r.right > C.right + 1) bad.push(card.dataset.fbi + ' 超出 ' + e.textContent.trim().slice(0, 8)); }
				for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) { const a = v[i].getBoundingClientRect(), b = v[j].getBoundingClientRect(); if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(card.dataset.fbi + ' ' + v[i].textContent.trim().slice(0, 6) + '×' + v[j].textContent.trim().slice(0, 6)); } }
		}
		if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('页面横向超出');
		return bad.join('；');
	});
	for (const dark of [false, true]) {
		LIST = MY(); SEEN = []; FBP = [];
		const ctx2 = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
		await ctx2.route('https://yrlove520.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
		const pg = await ctx2.newPage(); const er = []; pg.on('pageerror', (e) => er.push(e.message));
		await pg.addInitScript((d) => { localStorage.setItem('rp_token', 'tok1234567890abcdefgh'); localStorage.setItem('rp_dark', d ? '1' : '0'); }, dark);
		await pg.clock.install(); await pg.goto('http://localhost:8153/panel/?p=myfb'); await pg.waitForTimeout(2500);
		const sfx = dark ? '（深色）' : '';
		if (!dark) {
			ok('我的反馈：单独一页（标题「我的反馈」），侧边栏「消息与帮助」里有入口', (await pg.textContent('#pageTitle')) === '我的反馈' && await pg.locator('#sidenav [data-g="消息与帮助"] button[data-p="myfb"]').count() === 1);
			ok('打开这一页：马上重新问路由器（不用缓存）', FBP.some((a) => a.force === true), JSON.stringify(FBP));
			const pills = await pg.$$eval('#myfbList .fbitem .fbpill i', (e) => e.map((x) => x.textContent));
			ok('每条的状态：已修复 / 无法修复 / 开发人员已收到 / 等开发人员查看', pills.join('|') === '已修复|无法修复|开发人员已收到|等开发人员查看', pills.join('|'));
			const stg = await pg.$$eval('#myfbList .fsteps', (e) => e.map((x) => x.dataset.stage + (x.querySelector('.bad') ? 'x' : '')));
			ok('每条的进度条：3 / 3（无法修复）/ 2 / 1', stg.join(',') === '3,3x,2,1', stg.join(','));
			ok('有新进展、还没看过的标「新」', (await pg.locator('#myfbList .fbpill em').count()) === 2 && await pg.locator('[data-fbi="NOFX2345"] .fbpill em').count() === 1 && await pg.locator('[data-fbi="K7F2Q9AB"] .fbpill em').count() === 0);
			ok('在这一页看到了：有新进展的记成看过（以后不会再弹窗）', SEEN.map((x) => x.code).sort().join() === 'ACKD2345,NOFX2345', JSON.stringify(SEEN));
			ok('自己写的内容最多显示 3 行', await pg.evaluate(() => { const p = document.querySelector('[data-fbi="SENT2345"] .fbtext'); return p.scrollHeight > p.clientHeight && p.clientHeight < 80; }));
			ok('排版：每条卡片里不重叠、不超出，页面不横向超出', (await listOverlap(pg)) === '', await listOverlap(pg));
			await pg.screenshot({ path: OUT + '/myfb.png', fullPage: true });
			await pg.click('[data-fbi="K7F2Q9AB"] [data-hist]'); await pg.waitForTimeout(300);
			const ev = await pg.$$eval('[data-fbi="K7F2Q9AB"] .fbev b', (e) => e.map((x) => x.textContent));
			ok('「完整记录」展开：新的在前，最下面是反馈成功；按钮变「收起记录」', ev.join('|') === '已修复|补充说明|开发人员已收到|反馈成功' && (await pg.textContent('[data-fbi="K7F2Q9AB"] [data-hist]')) === '收起记录', ev.join('|'));
			ok('展开记录后排版不重叠', (await listOverlap(pg)) === '', await listOverlap(pg));
			await pg.clock.fastForward(61000); await pg.waitForTimeout(2500);
			ok('展开着的时候自动刷新（每分钟）：还是展开的', await pg.isVisible('[data-fbi="K7F2Q9AB"] [data-histbox]') && (await pg.textContent('[data-fbi="K7F2Q9AB"] [data-hist]')) === '收起记录');
			await pg.screenshot({ path: OUT + '/myfb-hist.png', fullPage: true });
			await pg.click('[data-fbi="K7F2Q9AB"] [data-hist]'); await pg.waitForTimeout(200);
			ok('再点收起', await pg.isHidden('[data-fbi="K7F2Q9AB"] [data-histbox]'));
			await pg.click('[data-fbi="ACKD2345"] [data-cc]'); await pg.waitForTimeout(300);
			ok('列表里点「复制」复制那一条的编号', (await pg.evaluate(() => navigator.clipboard.readText())) === 'ACKD2345');
			const [pop] = await Promise.all([ctx2.waitForEvent('page', { timeout: 3000 }).catch(() => null), pg.click('[data-fbi="NOFX2345"] [data-web]')]);
			ok('「在网页上看」打开官网 /r/编号', pop && /\/r\/NOFX2345$/.test(pop.url()), pop && pop.url()); if (pop) await pop.close();
			await pg.click('#myfbNew'); await pg.waitForTimeout(800);
			ok('「发新反馈」打开发反馈的窗口', await pg.isVisible('.modal textarea'));
			await pg.evaluate(() => document.querySelector('.modal [data-v="close"], .modal .sheethead button')?.click()); await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
			// 在这一页时有新进展：不弹窗，列表直接更新
			LIST = MY().map((x) => (x.code === 'SENT2345' ? { ...x, stage: 2, ackAt: Date.now(), updated: Date.now() } : { ...x, seen: x.updated }));
			await pg.evaluate(() => document.querySelectorAll('.modal').forEach((m) => m.remove())); await pg.clock.fastForward(61000); await pg.waitForTimeout(2500);
			ok('开着「我的反馈」时有新进展：不弹窗，列表自己更新（每分钟查一次）', !(await pg.isVisible('.modal[data-fbr]')) && (await pg.getAttribute('[data-fbi="SENT2345"] .fsteps', 'data-stage')) === '2');
			ok('页面没有报错', !er.length, er.join(' | '));
		} else {
			ok('深色：排版不重叠', (await listOverlap(pg)) === '', await listOverlap(pg));
			await pg.screenshot({ path: OUT + '/myfb-dark.png', fullPage: true });
		}
		await ctx2.close();
	}
	// 没发过、自建版、连不上托管服务
	for (const [name, setup, re] of [['没发过反馈：提示怎么发', () => { LIST = []; }, /还没有发过反馈/], ['自建版：说明反馈在 GitHub 上', () => { HOSTED = false; }, /自建版的反馈发到 GitHub/], ['连不上托管服务：显示上次的，写明', () => { HOSTED = true; STALE = true; LIST = MY(); }, /暂时连不上托管服务/]]) {
		setup(); ({ ctx, page } = await open(false)); await page.goto('http://localhost:8153/panel/?p=myfb'); await page.waitForTimeout(2500);
		ok('我的反馈 · ' + name, re.test(await page.textContent('#myfbList')), await page.textContent('#myfbList'));
		await ctx.close();
	}
	HOSTED = true; STALE = false;
	// 8 面板开着、在别的页面：标了「已收到」，一分钟内弹出来；切回前台也会马上查
	LIST = MY().map((x) => ({ ...x, seen: x.updated }));
	ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
	page = await ctx.newPage(); await page.addInitScript(() => { localStorage.setItem('rp_token', 'tok1234567890abcdefgh'); });
	await page.clock.install(); await page.goto('http://localhost:8153/panel/'); await page.waitForTimeout(5000);
	ok('都看过了：不弹窗', !(await page.isVisible('.modal[data-fbr]')));
	LIST = LIST.map((x) => (x.code === 'SENT2345' ? { ...x, stage: 2, ackAt: Date.now(), updated: Date.now() } : x));
	await page.clock.fastForward(61000); await page.waitForTimeout(2500);
	ok('开着面板时标了「已收到」：一分钟内弹出「开发人员已收到你的反馈」，进度第 2 段', await page.isVisible('.modal[data-fbr]') && /开发人员已收到你的反馈/.test(await page.textContent('.modal[data-fbr] h3')) && (await page.getAttribute('.modal[data-fbr] .fsteps', 'data-stage')) === '2');
	ok('只是已收到（没写说明）：弹窗里没有「开发者的说明」', !/开发者的说明/.test(await page.textContent('.modal[data-fbr]')) && (await noOverlap(page, '.modal[data-fbr]')) === '');
	await page.screenshot({ path: OUT + '/fbreply-ack.png' });
	await page.click('.modal[data-fbr] [data-v="close"]'); await page.waitForTimeout(400);
	LIST = LIST.map((x) => (x.code === 'ACKD2345' ? { ...x, state: 'fixed', stage: 3, done: 1, reply: '修好了', updated: Date.now() } : x));
	await page.clock.fastForward(21000); const n0 = FBN; await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(500); await page.clock.fastForward(2000); await page.waitForTimeout(1500);
	ok('从后台切回面板：马上查，弹出「修好了」', await page.isVisible('.modal[data-fbr]') && /修好了/.test(await page.textContent('.modal[data-fbr] h3')));
	await ctx.close();
	await browser.close(); server.close();
	console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + x[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
	process.exit(results.every((x) => x[1]) ? 0 : 1);
})();

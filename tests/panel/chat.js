// 4.0「实时联系开发者」：说明、发文字/图片、发送中/失败重发、几秒内收到开发者回复、已读、拉黑、自建版、各种屏幕不重叠
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel')); const T = Date.now();
const R = []; const ok = (n, c, x) => R.push((c ? '✓ ' : '✗ ') + n + (c ? '' : '（' + x + '）'));
let S;
const reset = (o = {}) => { S = { msgs: [], seq: 0, uu: 0, hosted: true, none: false, blocked: false, failNext: false, sends: [], adminSeen: 0, ...o }; };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), a = body.params || {};
		let r, err;
		if (m === 'chat') {
			if (a.op === 'get') { if (a.read) S.uu = 0; r = { ok: true, msgs: S.msgs.filter((x) => x.s > (a.after || 0)), uu: S.uu, seq: S.seq, hosted: S.hosted, none: S.none && !S.msgs.length, blocked: S.blocked, adminSeen: S.adminSeen }; }
			else if (a.op === 'send') { if (S.failNext) { S.failNext = false; err = '连不上开发者那边（官网），检查一下路由器能不能上网，稍后再试'; } else { S.sends.push(a); const msg = { s: ++S.seq, f: 'u', t: Date.now(), x: a.text || '', img: a.img ? { type: 'image/jpeg', size: 100 } : null }; S.msgs.push(msg); S.none = false; r = { ok: true, msg, hosted: S.hosted }; } }
			else if (a.op === 'img') r = { ok: true, data: 'data:image/png;base64,' + PNG };
			else if (a.op === 'peek') r = { ok: true, uu: S.uu, seq: S.seq };
		} else if (m === 'notices') r = { now: Math.round(Date.now() / 1000), ann: [], events: [], fb: [], hosted: true, seen: { t: Date.now() + 864e5, pop: [] }, chat: { at: Math.round(Date.now() / 1000), uu: S.uu, seq: S.seq } };
		else r = respond(m, a);
		res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(err ? { jsonrpc: '2.0', id: body.id, error: { code: -32000, message: err } } : { jsonrpc: '2.0', id: body.id, result: r })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const overlap = (p, sel) => p.evaluate((sel) => {
	const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent && e.getBoundingClientRect().width);
	const bad = []; for (const e of els) { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1) bad.push('超出：' + (e.id || e.className || e.tagName)); }
	for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { if (els[i].contains(els[j]) || els[j].contains(els[i])) continue; const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect(); if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) bad.push((els[i].id || els[i].className) + '×' + (els[j].id || els[j].className)); }
	return bad.join('；');
}, sel);
const OUT = path.join(__dirname, 'shots');
const DEV = {
	android: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 14; 23127PN0CC) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' },
	iphone: { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
	windows: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120' },
	mac: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15' },
};
const LAY = '.chhero .chtop > *, #chTips, .chrow, .chbub, .chday, .chbox, .chin > *:not(.hidden), #dock';
(async () => {
	await new Promise((r) => server.listen(8156, r)); const b = await chromium.launch();
	for (const [dn, dv] of Object.entries(DEV)) for (const dark of [false, true]) {
		reset(); const sfx = '-' + dn + (dark ? '-dark' : '');
		const c = await b.newContext({ ...dv, colorScheme: dark ? 'dark' : 'light' }); const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
		await p.addInitScript(() => localStorage.setItem('rp_token', 'testtokentesttokentest'));
		await p.goto('http://localhost:8156/panel/?p=chat'); await p.waitForTimeout(1500);
		const first = dn === 'android' && !dark;
		ok('打开就是对话页，有说明' + sfx, await p.isVisible('#p-chat') && /这是干嘛的/.test(await p.textContent('#chTips')) && /别发密码/.test(await p.textContent('#chTips')));
		ok('对话页底部快捷栏隐藏（不挡输入框）' + sfx, !(await p.isVisible('#dock')));
		ok('还没消息：有提示和快捷问题' + sfx, /还没有消息/.test(await p.textContent('#chList')) && (await p.locator('#chList [data-q]').count()) === 4);
		ok('排版不重叠、不超出（空的）' + sfx, !(await overlap(p, LAY)) && (await p.evaluate(() => document.documentElement.scrollWidth)) <= dv.viewport.width, await overlap(p, LAY));
		if (first || dn === 'iphone' || dn === 'windows') await p.screenshot({ path: path.join(OUT, 'chat-empty' + sfx + '.png') });
		// 快捷问题填进输入框
		await p.click('#chList [data-q]'); ok('点快捷问题：填进输入框' + sfx, /面板打不开了：/.test(await p.inputValue('#chText')));
		await p.fill('#chText', '你好，节点页打不开了，点进去一直转圈');
		await p.click('#chSend'); await p.waitForTimeout(700);
		ok('发出去：出现在右边，输入框清空' + sfx, (await p.locator('.chrow.me').count()) === 1 && /一直转圈/.test(await p.textContent('.chrow.me')) && (await p.inputValue('#chText')) === '' && S.sends.length === 1 && /Mozilla/.test(S.sends[0].ua));
		// 开发者回复：4 秒内出现
		S.msgs.push({ s: ++S.seq, f: 'a', t: Date.now(), x: '收到！先重启一下 OpenClash 试试，还不行的话发张截图给我。' }); S.uu = 1; S.adminSeen = 1;
		await p.waitForTimeout(4800);
		ok('开发者回复：几秒内自动出现在左边（不用刷新）' + sfx, (await p.locator('.chrow:not(.me)').count()) === 1 && /开发者/.test(await p.textContent('.chrow:not(.me)')) && S.uu === 0);
		ok('我的消息显示「开发者已读」' + sfx, /开发者已读/.test(await p.textContent('.chrow.me')));
		// 发图
		const f = path.join(__dirname, 'shots', 'chat-test.png'); fs.writeFileSync(f, Buffer.from(PNG, 'base64'));
		await p.setInputFiles('#chFile', f); await p.waitForTimeout(600);
		ok('选了图片：输入框上面预览' + sfx, await p.isVisible('#chPre'));
		await p.fill('#chText', '截图在这'); await p.click('#chSend'); await p.waitForTimeout(800);
		ok('图片和文字一起发出去' + sfx, S.sends.length === 2 && /^data:image\/jpeg;base64,/.test(S.sends[1].img) && S.sends[1].text === '截图在这' && (await p.locator('.chrow.me img').count()) === 1 && !(await p.isVisible('#chPre')));
		// 发送失败 → 点重发
		S.failNext = true; await p.fill('#chText', '这条会失败'); await p.click('#chSend'); await p.waitForTimeout(800);
		ok('没发出去：标红，说明原因' + sfx, /没发出去/.test(await p.textContent('#chList')) && /连不上开发者那边/.test(await p.textContent('#chList')));
		if (first) await p.screenshot({ path: path.join(OUT, 'chat-fail' + sfx + '.png') });
		await p.click('[data-retry]'); await p.waitForTimeout(800);
		ok('点一下重发成功' + sfx, !/没发出去/.test(await p.textContent('#chList')) && S.sends.length === 3 && S.sends[2].text === '这条会失败');
		// 长消息、很长的单词不撑破
		await p.fill('#chText', '很长的一段 ' + 'a'.repeat(300) + '\n第二行\n第三行'); await p.click('#chSend'); await p.waitForTimeout(800);
		ok('很长的消息不撑破屏幕' + sfx, (await p.evaluate(() => document.documentElement.scrollWidth)) <= dv.viewport.width);
		S.msgs.push({ s: ++S.seq, f: 'a', t: Date.now(), x: '', img: { type: 'image/png', size: 70 } }); await p.waitForTimeout(5000);
		ok('开发者发的图片：自动加载出来' + sfx, (await p.locator('.chrow:not(.me) img').count()) === 1);
		ok('排版不重叠、不超出（有消息）' + sfx, !(await overlap(p, LAY)), await overlap(p, LAY));
		ok('输入框一直在屏幕底部看得到' + sfx, await p.evaluate(() => { const r = document.querySelector('.chbox').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top > innerHeight * 0.5; }));
		await p.screenshot({ path: path.join(OUT, 'chat' + sfx + '.png') });
		// 输入框随内容变高，最多到一定高度
		await p.fill('#chText', '1\n2\n3\n4\n5\n6\n7\n8\n9\n10'); await p.dispatchEvent('#chText', 'input');
		const th = await p.evaluate(() => document.getElementById('chText').offsetHeight);
		ok('输入框随内容变高，最多 132 像素' + sfx, th > 50 && th <= 133, th);
		if (dv.isMobile) { await p.fill('#chText', '换行'); await p.press('#chText', 'Enter'); ok('手机上回车是换行，不会误发' + sfx, (await p.inputValue('#chText')).includes('\n') && S.sends.length === 4); }
		else { await p.fill('#chText', '电脑上回车直接发'); await p.press('#chText', 'Enter'); await p.waitForTimeout(600); ok('电脑上回车直接发（Shift+回车换行）' + sfx, S.sends.length === 5 && S.sends[4].text === '电脑上回车直接发'); }
		// 说明能收起，下次也记得
		await p.click('#chTipBtn'); ok('说明能收起' + sfx, !(await p.isVisible('#chTips')));
		await p.reload(); await p.waitForTimeout(1500); ok('收起的说明下次打开还是收起' + sfx, !(await p.isVisible('#chTips')) && (await p.locator('.chrow').count()) >= 5);
		// 密码提醒
		p.once('dialog', (d) => { ok('消息里像是有密码：发之前提醒' + sfx, /密码或节点链接/.test(d.message())); d.dismiss(); });
		await p.fill('#chText', '我的密码: abc12345'); await p.click('#chSend'); await p.waitForTimeout(300);
		ok('提醒后取消：没发' + sfx, (await p.inputValue('#chText')) === '我的密码: abc12345');
		ok('页面没有报错' + sfx, !errs.length, errs.join(' | '));
		await c.close();
	}
	// 拉黑
	reset({ blocked: true, msgs: [{ s: 1, f: 'u', t: T, x: 'hi' }], seq: 1 });
	{ const c = await b.newContext(DEV.android); const p = await c.newPage(); await p.addInitScript(() => localStorage.setItem('rp_token', 'testtokentesttokentest')); await p.goto('http://localhost:8156/panel/?p=chat'); await p.waitForTimeout(1500);
		ok('被拉黑：输入框不能用，说明原因', await p.isDisabled('#chText') && await p.isDisabled('#chSend') && /暂时不能发消息/.test(await p.textContent('#chNote')));
		await c.close(); }
	// 自建版：还没对话
	reset({ hosted: false, none: true });
	{ const c = await b.newContext(DEV.android); const p = await c.newPage(); await p.addInitScript(() => localStorage.setItem('rp_token', 'testtokentesttokentest')); await p.goto('http://localhost:8156/panel/?p=chat'); await p.waitForTimeout(1500);
		ok('自建版：说明第一次发消息时自动建立对话、回复半小时内推送', /自建版也能用/.test(await p.textContent('#chSub')) && /半小时内推送/.test(await p.textContent('#chNote')));
		await p.fill('#chText', '自建版能问吗'); await p.click('#chSend'); await p.waitForTimeout(700);
		ok('自建版：能发', S.sends.length === 1);
		await c.close(); }
	// 别的页面：开发者回复了 → 铃铛 + 侧边栏红点 + 通知里一条
	reset({ msgs: [{ s: 1, f: 'u', t: T - 6e4, x: 'hi' }, { s: 2, f: 'a', t: T, x: '回复' }], seq: 2, uu: 1 });
	{ const c = await b.newContext(DEV.android); const p = await c.newPage(); await p.addInitScript(() => localStorage.setItem('rp_token', 'testtokentesttokentest')); await p.clock.install(); await p.goto('http://localhost:8156/panel/'); await p.clock.runFor(8000); await p.waitForTimeout(600);
		ok('在别的页：铃铛上显示开发者回复', (await p.textContent('#bellN')) === '1');
		await p.click('#menuBtn'); await p.waitForTimeout(500);
		ok('侧边栏「实时联系开发者」上有红点', (await p.textContent('#sidenav button[data-p="chat"]')).includes('1'));
		await p.screenshot({ path: path.join(OUT, 'chat-side.png') });
		await p.click('#scrim', { force: true }); await p.waitForTimeout(400); await p.click('#bellBtn'); await p.waitForTimeout(1500);
		ok('通知页：入口卡片上显示 1 条没看、列表里有「开发者回复了你」', (await p.textContent('#ntChatN')) === '1' && /开发者回复了你/.test(await p.textContent('#ntList')));
		await p.screenshot({ path: path.join(OUT, 'nt-chat.png') });
		await p.click('.ntent [data-goto="chat"]'); await p.waitForTimeout(1500);
		ok('点入口进对话页，看过以后红点消失', await p.isVisible('#p-chat') && S.uu === 0 && (await p.isHidden('#bellN')));
		await c.close(); }
	console.log(R.join('\n')); const pass = R.filter((x) => x.startsWith('✓')).length; console.log('\n通过 ' + pass + '/' + R.length);
	await b.close(); server.close();
})();

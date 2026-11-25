// 6.0 第 16 项：孩子上网计划——设备「更多 → 上网计划」：按星期加时段、删时段、延长、删计划；保存后马上断网要先确认；
// 推送点进来延长（?ask=ext）、换了 MAC 把计划也用到新地址（?ask=plancopy）；子账号没有「家长控制」看不到
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { PZ } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), M = require('./mock');
			// 模拟子账号（只有「反馈和联系开发者」）
			if (m === 'whoami' && SUB.on) return J({ jsonrpc: '2.0', id: body.id, result: { ...M.respond('whoami', {}), role: 'sub', perms: ['msg'] } });
			return J(M.reply(body.id, m, body.params || {}));
		}
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		let p = u.pathname.replace(/^\/panel\//, '') || 'index.html';
		const f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
const SUB = { on: false };
const TV = '11:22:33:44:55:66', IP = 'aa:bb:cc:dd:ee:ff', NEW = '5c:cf:7f:12:34:56';
const reset = () => { for (const k of Object.keys(PZ.devs)) delete PZ.devs[k]; PZ.calls.length = 0; PZ.planOk = true; PZ.schedOn = false; };
(async () => {
	await new Promise((r) => server.listen(8100, r));
	const browser = await chromium.launch();
	for (const [w, h, tag, dark] of [[390, 844, '手机', false], [320, 640, '小屏', true], [430, 932, '大屏', false]]) {
		reset();
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light', timezoneId: 'Asia/Shanghai' });
		const page = await ctx.newPage();
		// 手机上的时间固定在周三 17:00（北京时间），「现在能不能上网」的判断才是确定的
		await page.clock.setFixedTime(new Date('2026-11-25T17:00:00+08:00'));
		page.on('pageerror', (e) => problems.push(`[${tag}] 页面错误：` + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8100/panel/?p=dev'); await page.waitForTimeout(2200);
		const last = () => page.locator('.modal').last(), toastT = async () => (await page.textContent('#toast')) || '';
		const more = async (i) => { await page.locator(`#dvList [data-i="${i}"] [data-more]`).click(); await page.waitForTimeout(500); };
		await more(1);
		ok(`[${tag}] 「更多」里有「上网计划」`, (await last().locator('[data-v="plan"]').count()) === 1);
		await last().locator('[data-v="plan"]').click(); await page.waitForTimeout(600);
		const sh = () => page.locator('.modal').last();
		ok(`[${tag}] 打开计划：标题、默认周一到周五、16:00 到 21:00，没有延长和删除按钮`, /「TV」上网计划/.test(await sh().textContent()) && (await sh().locator('.plwk .chip.on').count()) === 5 && (await sh().locator('[data-from]').inputValue()) === '16:00' && (await sh().locator('[data-pl="30"]').count()) === 0);
		ok(`[${tag}] 不是随机 MAC：不提示关「私有地址」`, !/私有地址/.test(await sh().textContent()));
		ok(`[${tag}] 星期按钮一行放得下、不截断`, await sh().locator('.plwk .chip').evaluateAll((bs) => bs.every((b) => b.scrollWidth <= b.clientWidth + 1) && new Set(bs.map((b) => Math.round(b.getBoundingClientRect().top))).size === 1));
		await sh().locator('[data-pl="add"]').click(); await page.waitForTimeout(800);
		ok(`[${tag}] 添加时段：发给路由器`, JSON.stringify(PZ.calls[0]) === JSON.stringify({ mac: TV, name: 'TV', plan: [{ d: [1, 2, 3, 4, 5], from: '16:00', to: '21:00' }] }), JSON.stringify(PZ.calls[0]));
		let t = await sh().textContent();
		ok(`[${tag}] 列表里显示时段、现在能不能上网、几点停`, /周一到周五 16:00–21:00/.test(t) && /能上网，\d\d:\d\d 停网/.test(t) && /已添加：周一到周五 16:00–21:00/.test(await toastT()), t);
		ok(`[${tag}] 有计划后出现延长和删除`, (await sh().locator('[data-pl="30"]').count()) === 1 && (await sh().locator('[data-pl="del"]').count()) === 1);
		await page.screenshot({ path: path.join(SHOT, `plan-${w}${dark ? '-dark' : ''}.png`) });
		// 周末
		for (const x of ['1', '2', '3', '4', '5']) await sh().locator(`[data-wk="${x}"]`).click();
		await sh().locator('[data-pl="add"]').click(); await page.waitForTimeout(300);
		ok(`[${tag}] 一天都没选：不让加`, /至少选一天/.test(await toastT()) && PZ.calls.length === 1);
		await sh().locator('[data-wk="6"]').click(); await sh().locator('[data-wk="7"]').click();
		await sh().locator('[data-from]').fill('09:00'); await sh().locator('[data-to]').fill('22:00');
		await sh().locator('[data-pl="add"]').click(); await page.waitForTimeout(800);
		ok(`[${tag}] 加周末 9:00–22:00（选过的星期、时间不会被重置）`, /周末 09:00–22:00/.test(await sh().textContent()) && PZ.calls[1].plan.length === 2 && (await sh().locator('[data-from]').inputValue()) === '09:00');
		await sh().locator('[data-pl="add"]').click(); await page.waitForTimeout(300);
		ok(`[${tag}] 一样的时段不重复加`, /已经有这个时段了/.test(await toastT()));
		await sh().locator('[data-wk="5"]').click(); await sh().locator('[data-from]').fill('20:00'); await sh().locator('[data-to]').fill('01:00');
		await sh().locator('[data-pl="add"]').click(); await page.waitForTimeout(800);
		ok(`[${tag}] 跨到第二天的时段写清楚`, /周五到周日 20:00–01:00（到第二天）/.test(await sh().textContent()), await sh().textContent());
		await page.screenshot({ path: path.join(SHOT, `plan-slots-${w}${dark ? '-dark' : ''}.png`) });
		// 延长
		await sh().locator('[data-pl="30"]').click(); await page.waitForTimeout(800);
		ok(`[${tag}] 延长 30 分钟`, PZ.calls[PZ.calls.length - 1].ext === 30 && /已延长到 \d\d:\d\d/.test(await toastT()) && /延长过/.test(await sh().textContent()), await toastT());
		// 删一个时段
		await sh().locator('[data-pldel="2"]').click(); await page.waitForTimeout(800);
		ok(`[${tag}] 删掉一个时段`, PZ.calls[PZ.calls.length - 1].plan.length === 2 && !/20:00–01:00/.test(await sh().textContent()));
		await sh().locator('[data-v="close"]').click(); await page.waitForTimeout(600);
		// 设备页上方的「暂停 / 定时断网」列表
		const row = page.locator(`#pzBox [data-pzm="${TV}"]`);
		ok(`[${tag}] 设备页上方列出有计划的设备`, /上网计划：能上网/.test(await row.textContent()), await row.textContent());
		ok(`[${tag}] 不横向滚动`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await row.locator('[data-pzset]').click(); await page.waitForTimeout(600);
		ok(`[${tag}] 点「设置」：只有计划的打开计划`, /上网计划/.test(await sh().locator('h3').textContent()));
		// 删计划
		await sh().locator('[data-pl="del"]').click(); await page.waitForTimeout(400);
		ok(`[${tag}] 删计划前确认（红色按钮）`, /任何时间都能上网/.test(await last().textContent()) && (await last().locator('[data-v="true"].danger').count()) === 1);
		await last().locator('[data-v="true"]').click(); await page.waitForTimeout(800);
		ok(`[${tag}] 删掉了`, PZ.calls[PZ.calls.length - 1].plan === null && !PZ.devs[TV] && /已删除上网计划/.test(await toastT()));
		await sh().locator('[data-v="close"]').click(); await page.waitForTimeout(500);
		// 保存后马上断网：先确认
		const hr = await page.evaluate(() => new Date().getHours());
		await more(1); await last().locator('[data-v="plan"]').click(); await page.waitForTimeout(600);
		for (const x of ['6', '7']) await sh().locator(`[data-wk="${x}"]`).click();
		const f = String((hr + 2) % 24).padStart(2, '0') + ':00', to = String((hr + 3) % 24).padStart(2, '0') + ':00';
		await sh().locator('[data-from]').fill(f); await sh().locator('[data-to]').fill(to);
		const nc = PZ.calls.length;
		await sh().locator('[data-pl="add"]').click(); await page.waitForTimeout(500);
		ok(`[${tag}] 现在不在能上网的时段里：保存前说会马上断网（红色按钮）`, /保存后「TV」马上断网/.test(await last().textContent()) && (await last().locator('[data-v="true"].danger').count()) === 1 && PZ.calls.length === nc);
		await page.screenshot({ path: path.join(SHOT, `plan-warn-${w}${dark ? '-dark' : ''}.png`) });
		await last().locator('[data-v="false"]').click(); await page.waitForTimeout(400);
		ok(`[${tag}] 取消就不存`, PZ.calls.length === nc);
		await sh().locator('[data-v="close"]').click(); await page.waitForTimeout(400);
		// 随机 MAC 提示
		await more(0); await last().locator('[data-v="plan"]').click(); await page.waitForTimeout(600);
		ok(`[${tag}] 随机 MAC：提示关「私有地址」`, /随机 MAC/.test(await sh().textContent()) && /私有地址/.test(await sh().textContent()));
		await sh().locator('[data-v="close"]').click(); await page.waitForTimeout(400);
		// 推送点进来：延长
		reset();
		PZ.devs[TV] = { name: 'TV', plan: { slots: [{ d: [1, 2, 3, 4, 5], from: '16:00', to: '21:00' }], by: 'u1' }, pn: { ok: true, at: Math.floor(Date.now() / 1000) + 540, ext: null }, on: false };
		await page.goto(`http://localhost:8100/panel/?p=dev&ask=ext&min=60&mac=${TV}`); await page.waitForTimeout(2800);
		const ex = page.locator('.modal[data-ext]');
		ok(`[${tag}] 推送点「延长 1 小时」进来：问延长多久，1 小时是蓝色的`, (await ex.count()) === 1 && /「TV」能上网，\d\d:\d\d 停网/.test(await ex.textContent()) && /primary/.test(await ex.locator('[data-e="60"]').getAttribute('class')) && !/primary/.test(await ex.locator('[data-e="30"]').getAttribute('class')), (await ex.count()) && await ex.textContent());
		const bx = await ex.locator('.modalbox').boundingBox();
		ok(`[${tag}] 是居中的小卡片`, bx && bx.height < h * 0.7 && bx.y > 0);
		await page.screenshot({ path: path.join(SHOT, `plan-ext-${w}${dark ? '-dark' : ''}.png`) });
		await ex.locator('[data-e="60"]').click(); await page.waitForTimeout(900);
		ok(`[${tag}] 点了才延长`, JSON.stringify(PZ.calls[0]) === JSON.stringify({ mac: TV, ext: 60 }) && /「TV」已延长到 \d\d:\d\d/.test(await toastT()) && !(await page.locator('.modal[data-ext]').count()), await toastT());
		// 推送点进来：换了 MAC
		await page.goto(`http://localhost:8100/panel/?p=dev&ask=plancopy&mac=${NEW}&src=${TV}`); await page.waitForTimeout(2800);
		ok(`[${tag}] 换了 MAC：说清楚把哪个计划用到哪台`, /把「TV」的上网计划（周一到周五 16:00–21:00）也用到「ESP_1A2B3C」（5c:cf:7f:12:34:56）/.test(await last().textContent()), await last().textContent());
		await last().locator('[data-v="true"]').click(); await page.waitForTimeout(800);
		ok(`[${tag}] 新地址也用上计划`, JSON.stringify(PZ.calls[1]) === JSON.stringify({ mac: NEW, name: 'ESP_1A2B3C', plan: [{ d: [1, 2, 3, 4, 5], from: '16:00', to: '21:00' }] }), JSON.stringify(PZ.calls[1]));
		await ctx.close();
	}
	// 子账号没有「家长控制」
	{
		reset(); SUB.on = true;
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_role', JSON.stringify({ role: 'sub', perms: ['msg'] })); });
		PZ.devs[TV] = { name: 'TV', plan: { slots: [{ d: [1], from: '16:00', to: '21:00' }] }, pn: { ok: true, at: Math.floor(Date.now() / 1000) + 540 } };
		await page.goto(`http://localhost:8100/panel/?p=dev&ask=ext&mac=${TV}`); await page.waitForTimeout(2800);
		ok('子账号没有「家长控制」：推送点进来也不能延长', /不能延长上网时间/.test(await page.textContent('#toast')) && !(await page.locator('.modal[data-ext]').count()) && !PZ.calls.length);
		await page.locator('#dvList [data-i="1"] [data-more]').click(); await page.waitForTimeout(500);
		ok('子账号没有「家长控制」：「更多」里没有上网计划', (await page.locator('.modal').last().locator('[data-v="plan"]').count()) === 0);
		await ctx.close();
	}
	await browser.close(); server.close();
	let bad = 0;
	for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '\n    ' + note)); if (!c) bad++; }
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n${results.length - bad}/${results.length} 通过`);
	process.exit(bad || problems.length ? 1 : 0);
})();

// 设备页：暂停上网（暂停多久、一直暂停、每天定时、恢复）
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond, PZ } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); return J({ jsonrpc: '2.0', id: body.id, result: respond(body.method.replace(/^panel\//, ''), body.params || {}) }); }
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		let p = u.pathname.replace(/^\/panel\//, '') || 'index.html';
		const f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
const MAC = 'aa:bb:cc:dd:ee:ff';
(async () => {
	await new Promise((r) => server.listen(8096, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
	await page.goto('http://localhost:8096/panel/?p=dev'); await page.waitForTimeout(2500);
	const card = () => page.locator('#dvList [data-i="0"]');
	ok('设备卡片有「暂停」按钮', (await card().locator('[data-pause]').count()) === 1 && (await card().locator('[data-pause]').textContent()) === '暂停');
	ok('没有暂停的设备时，不显示暂停列表', (await page.textContent('#pzBox')).trim() === '');
	ok('读不到 MAC 的设备也有按钮（点了提示）', (await page.locator('#dvList [data-i="2"] [data-pause]').count()) === 1);
	await page.locator('#dvList [data-i="2"] [data-pause]').click(); await page.waitForTimeout(400);
	ok('读不到 MAC：提示没法暂停', /读不到 MAC/.test(await page.textContent('#toast')));

	// 打开暂停面板
	await card().locator('[data-pause]').click(); await page.waitForTimeout(500);
	const box = () => page.textContent('.modalbox');
	ok('暂停面板：标题、几个时长、一直暂停、每天定时', /暂停「iPhone」上网/.test(await box()) && /30 分钟/.test(await box()) && /一直暂停/.test(await box()) && /每天定时断网/.test(await box()));
	ok('说明暂停的影响（会断开现有连接、自己的手机面板也会打不开）', /马上断开/.test(await box()) && /面板也会打不开/.test(await box()));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'pause-01-sheet.png') });
	await page.click('[data-pz="60"]'); await page.waitForTimeout(600);
	const c1 = PZ.calls[PZ.calls.length - 1];
	const dUntil = c1.until - Math.floor(Date.now() / 1000);
	ok('暂停 1 小时：发给路由器的是 1 小时后的时间', c1.mac === MAC && dUntil > 3500 && dUntil <= 3600 && c1.name === 'iPhone', JSON.stringify(c1));
	ok('暂停后面板里显示「暂停中」和「马上恢复」', /暂停中/.test(await box()) && (await page.locator('[data-pz="resume"]').count()) === 1);
	ok('提示几点自动恢复', /自动恢复/.test(await page.textContent('#toast')));
	// 加定时
	await page.fill('[data-from]', '22:30'); await page.fill('[data-to]', '06:45');
	await page.click('[data-pz="add"]'); await page.waitForTimeout(600);
	const c2 = PZ.calls[PZ.calls.length - 1];
	ok('添加每天定时：22:30–06:45', JSON.stringify(c2.sched) === JSON.stringify([{ from: '22:30', to: '06:45' }]));
	ok('跨夜的定时标「第二天」', /22:30 – 06:45（第二天）/.test(await box()));
	await page.fill('[data-from]', '22:30'); await page.fill('[data-to]', '06:45');
	await page.click('[data-pz="add"]'); await page.waitForTimeout(400);
	ok('同一条定时不能重复加', /已经有这条定时了/.test(await page.textContent('#toast')) && PZ.calls.length === 2);
	await page.fill('[data-from]', '12:00'); await page.fill('[data-to]', '12:00');
	await page.click('[data-pz="add"]'); await page.waitForTimeout(400);
	ok('开始和结束一样时提示', /不能一样/.test(await page.textContent('#toast')));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'pause-02-on.png') });
	// 关掉面板，看设备卡片和顶部列表
	await page.click('[data-v="close"]'); await page.waitForTimeout(800);
	ok('设备卡片显示「已暂停」和恢复时间、定时', (await card().locator('.pill').first().textContent()) === '已暂停' && /自动恢复/.test(await card().textContent()) && /每天 22:30–06:45 断网/.test(await card().textContent()));
	ok('顶部列出暂停中的设备', /暂停 \/ 定时断网/.test(await page.textContent('#pzBox')) && /1 台暂停中/.test(await page.textContent('#pzBox')));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'pause-03-list.png') });
	// 一直暂停
	await card().locator('[data-pause]').click(); await page.waitForTimeout(500);
	await page.click('[data-pz="ever"]'); await page.waitForTimeout(600);
	ok('一直暂停：显示直到手动恢复', /直到手动恢复/.test(await box()));
	// 恢复
	await page.click('[data-pz="resume"]'); await page.waitForTimeout(600);
	ok('马上恢复', PZ.calls[PZ.calls.length - 1].resume === true && !PZ.devs[MAC].until && /已恢复上网/.test(await page.textContent('#toast')));
	// 删除定时 → 列表里没有了
	await page.click('[data-pzdel="0"]'); await page.waitForTimeout(600);
	ok('删除定时后这台设备不再有暂停设置', !PZ.devs[MAC]);
	await page.click('[data-v="close"]'); await page.waitForTimeout(800);
	ok('卡片恢复「在线」、顶部列表消失', (await card().locator('.pill').first().textContent()) === '在线' && (await page.textContent('#pzBox')).trim() === '');
	// 正在定时断网时间里（没有临时暂停）
	PZ.schedOn = true;
	PZ.devs[MAC] = { name: 'iPhone', sched: [{ from: '00:00', to: '23:59' }], on: true };
	await page.reload(); await page.waitForTimeout(2500);
	ok('定时断网时间里：卡片显示已暂停，并注明现在就在这个时间里', (await card().locator('.pill').first().textContent()) === '已暂停' && /现在就在这个时间里/.test(await card().textContent()));
	await card().locator('[data-pause]').click(); await page.waitForTimeout(500);
	ok('定时断网时间里：面板说明要恢复得删掉定时', /删掉下面对应的定时/.test(await box()));
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

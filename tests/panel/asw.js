// 节点页：自动切换卡片（开关、换策略组、最近切换、模拟一次）
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond, ASW } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const calls = [];
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', async () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}'); const m = (body.params || {}).name || body.method;
			if (body.method === 'panel/autosw') { calls.push(body.params || {}); if ((body.params || {}).dry) await new Promise((r) => setTimeout(r, 600)); }
			return J({ jsonrpc: '2.0', id: body.id, result: respond(body.method.replace(/^panel\//, ''), body.params || {}) });
		}
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		let p = u.pathname.replace(/^\/panel\//, '') || 'index.html';
		const f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
(async () => {
	await new Promise((r) => server.listen(8097, r));
	const browser = await chromium.launch();
	for (const dark of [false, true]) {
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8097/panel/?p=proxy'); await page.waitForTimeout(2500);
		const T = dark ? '【深色】' : '';
		const txt = async () => page.textContent('#aswCard');
		ok(T + '节点页有「自动切换」卡片，显示已开启', (await page.textContent('#aswPill')) === '已开启' && /节点挂了自动换/.test(await txt()) && await page.locator('[data-aswon]').isChecked());
		ok(T + '说明看的是哪个策略组、同地区优先、推送到微信', /「Zou」正在用的节点/.test(await txt()) && /同地区/.test(await txt()) && /微信/.test(await txt()));
		ok(T + '显示最近切换（换了地区的有标注）', /香港04 专线 3x → 🇭🇰香港02/.test(await txt()) && /换了地区/.test(await txt()));
		ok(T + '多个手动策略组时可以选看哪个', (await page.locator('[data-aswg] option').count()) === 2);
		await page.locator('#aswCard').scrollIntoViewIfNeeded();
		await page.screenshot({ path: path.join(__dirname, 'shots', `asw-01${dark ? '-dark' : ''}.png`) });
		if (dark) { await ctx.close(); continue; }
		// 模拟一次
		await page.click('[data-aswdry]'); await page.waitForTimeout(200);
		ok('模拟时按钮显示正在测', /正在测所有节点/.test(await page.textContent('[data-aswdry]')));
		await page.waitForTimeout(1200);
		ok('模拟结果：当前节点正常 + 挂了会换到同地区的哪个 + 测了多少个', /当前「🇭🇰香港02 专线 3x」88 ms，正常/.test(await txt()) && /同地区的「🇭🇰香港05 专线」（41 ms）/.test(await txt()) && /一共测了 30 个节点，27 个能用/.test(await txt()), await txt());
		await page.screenshot({ path: path.join(__dirname, 'shots', 'asw-02-dry.png') });
		ASW.dryRes = { cur: 'X', node: true, curDelay: 0, region: 'HK', pick: null, same: false, tested: 30, ok: 0 };
		await page.click('[data-aswdry]'); await page.waitForTimeout(1500);
		ok('模拟：所有节点都不通时说明会提醒', /测不通/.test(await txt()) && /其他节点也都测不通/.test(await txt()));
		ASW.dryRes = { err: '家里宽带现在上不了网，先不动节点' };
		await page.click('[data-aswdry]'); await page.waitForTimeout(1500);
		ok('模拟：家里断网时给出原因', /家里宽带现在上不了网/.test(await txt()));
		// 关闭 / 开启
		await page.click('#aswCard .sw'); await page.waitForTimeout(600);
		ok('关闭自动切换', calls.some((c) => c.set && c.enabled === false) && (await page.textContent('#aswPill')) === '已关闭' && /已关闭节点自动切换/.test(await page.textContent('#toast')));
		await page.click('#aswCard .sw'); await page.waitForTimeout(600);
		ok('重新开启', ASW.enabled === true && (await page.textContent('#aswPill')) === '已开启');
		// 换策略组：选的是策略组（不是具体节点）时提示
		await page.selectOption('[data-aswg]', 'Media'); await page.waitForTimeout(600);
		ok('换成看别的策略组', ASW.group === 'Media' && /「Media」正在用的节点/.test(await txt()));
		ok('该组选的是策略组时提示不会起作用', /选的是「Auto」（策略组）/.test(await txt()), await txt());
		await page.selectOption('[data-aswg]', 'Zou'); await page.waitForTimeout(600);
		// 断线记录里的切换事件显示「节点」
		ok('显示机场订阅：剩余流量和到期日', /机场订阅/.test(await txt()) && /剩 270(\.\d)? GB \/ 共 300(\.0)? GB/.test(await txt()) && /2026-11-\d\d 到期/.test(await txt()), await txt());
		ok('订阅正常时不显示「不会自动切换」', !/不会自动切换/.test(await txt()));
		ASW.sub = { ...ASW.sub, down: ASW.sub.total };
		await page.click('[data-aswdry]'); await page.waitForTimeout(1500);
		ok('流量用光：卡片标红并说明不会自动切换', /订阅流量用光了/.test(await txt()) && /不会自动切换/.test(await txt()) && /剩 0 B/.test(await txt()), await txt());
		await page.screenshot({ path: path.join(__dirname, 'shots', 'asw-03-subbad.png') });
		ASW.dryRes = { ...ASW.dryRes, sub: ASW.sub, subbad: 'traffic', err: undefined, cur: 'X', node: true, curDelay: 0, pick: null };
		await page.click('[data-aswdry]'); await page.waitForTimeout(1500);
		ok('模拟：订阅流量用光时说明就算挂了也不切换', /就算当前节点挂了也不会自动切换/.test(await txt()), await txt());
		ASW.sub = { ...ASW.sub, down: 1, expire: Math.floor(Date.now() / 1000) - 100 }; ASW.dryRes = { err: 'x' };
		await page.click('[data-aswdry]'); await page.waitForTimeout(1500);
		ok('到期：说明订阅已经到期', /订阅已经到期/.test(await txt()));
		ok('节点页其它功能正常（策略组列表还在）', (await page.locator('#pxList .grp').count()) === 2);
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

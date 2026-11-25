// 6.0 第 79 项：快捷操作里换节点——策略组的节点和延迟、点一下换、星标常用放前面、换看哪个策略组、测延迟；
// 测不通先问；没有「切换节点」权限不显示；PassWall 这类给入口；不是 OpenClash / Nikki / PassWall 说清楚
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const M = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const TOOLS = [], ST = { sub: false, nodeOk: true };
const G = { groups: [
	{ name: 'Zou', type: 'Selector', now: '香港 02', nodes: [{ name: 'Auto', type: 'URLTest', group: true }, { name: '香港 02', type: 'Trojan', delay: 88 }, { name: '日本 01 很长很长很长的名字节点名字', type: 'Vmess', delay: 260 }, { name: '美国 03', type: 'Trojan', delay: 0 }, { name: '新加坡 04', type: 'Trojan' }] },
	{ name: 'Media', type: 'Selector', now: '美国 03', nodes: [{ name: '美国 03', type: 'Trojan', delay: 120 }, { name: '香港 02', type: 'Trojan', delay: 88 }] },
	{ name: 'Auto', type: 'URLTest', now: '香港 02', nodes: [{ name: '香港 02', type: 'Trojan', delay: 88 }] }] };
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), R = (result) => J({ jsonrpc: '2.0', id: body.id, result });
			if (m === 'groups') return R(JSON.parse(JSON.stringify(G)));
			if (m === 'node_check') return R(ST.nodeOk ? { ok: true, delay: 150 } : { ok: false, delay: 0 });
			if (m === 'tools/call') { TOOLS.push(body.params); if (body.params.name === 'switch_proxy') G.groups.find((g) => g.name === body.params.arguments.group).now = body.params.arguments.node; return R({ content: [{ type: 'text', text: '好的' }] }); }
			if (m === 'whoami' && ST.sub) return R({ ...M.respond('whoami', {}), role: 'sub', perms: ['msg'] });
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
(async () => {
	await new Promise((r) => server.listen(8103, r));
	const browser = await chromium.launch();
	for (const [w, h, tag, dark] of [[390, 844, '手机', false], [320, 640, '小屏', true], [430, 932, '大屏', false]]) {
		TOOLS.length = 0; G.groups[0].now = '香港 02'; ST.nodeOk = true; ST.sub = false;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push(`[${tag}] 页面错误：` + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8103/panel/'); await page.waitForTimeout(2200);
		const toastT = async () => (await page.textContent('#toast')) || '';
		const openQ = async () => { await page.locator('.dock [data-d="quick"]').click(); await page.waitForTimeout(1200); return page.locator('.modal').last(); };
		let m = await openQ();
		const qn = () => m.locator('[data-qn]').first();
		ok(`[${tag}] 快捷操作最下面有「换节点」，看第一个能手动切换的策略组`, /换节点/.test(await qn().textContent()) && /Zou/.test(await qn().textContent()));
		const names = await m.locator('.qnn b').allTextContents();
		ok(`[${tag}] 只列节点（不列子策略组），正在用的标出来，有延迟`, names.join('|') === '香港 02|日本 01 很长很长很长的名字节点名字|美国 03|新加坡 04' && /正在用/.test(await m.locator('.qnrow.cur').textContent()) && /260/.test(await qn().textContent()), names.join('|'));
		ok(`[${tag}] 长名字不撑破、不横向滚动`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && await m.locator('.qnn').first().evaluate((e) => e.getBoundingClientRect().right <= innerWidth));
		await page.screenshot({ path: path.join(SHOT, `qnode-${w}${dark ? '-dark' : ''}.png`) });
		// 星标常用
		await m.locator('[data-qs="美国 03"]').click(); await page.waitForTimeout(300);
		ok(`[${tag}] 点星号：常用节点放到最前面，记在这台手机上`, (await m.locator('.qnn b').first().textContent()) === '美国 03' && /美国 03/.test(await page.evaluate(() => localStorage.getItem('rp_qfav'))));
		// 换节点（延迟好的）
		await m.locator('[data-qn="日本 01 很长很长很长的名字节点名字"]').click(); await page.waitForTimeout(800);
		const sw = TOOLS.find((t) => t.name === 'switch_proxy');
		ok(`[${tag}] 点一下就换（手动切换，10 分钟内不会被自动换走由路由器记）`, sw && sw.arguments.group === 'Zou' && sw.arguments.node === '日本 01 很长很长很长的名字节点名字' && /已切换到 日本 01/.test(await toastT()), JSON.stringify(TOOLS));
		ok(`[${tag}] 换完马上标成正在用`, /日本 01/.test(await m.locator('.qnrow.cur').textContent()));
		// 测不通的节点：先问
		ST.nodeOk = false; const n0 = TOOLS.length;
		await m.locator('[data-qn="美国 03"]').click(); await page.waitForTimeout(800);
		ok(`[${tag}] 测不通的节点：先说清楚后果再问`, /这个节点测不通/.test(await page.locator('.modal').last().textContent()) && TOOLS.length === n0);
		await page.locator('.modal').last().locator('[data-v="false"]').click(); await page.waitForTimeout(400);
		ok(`[${tag}] 取消就不换`, TOOLS.length === n0);
		// 测延迟
		await m.locator('[data-qt]').click(); await page.waitForTimeout(800);
		ok(`[${tag}] 测延迟：测这个策略组`, TOOLS.some((t) => t.name === 'test_delay' && t.arguments.name === 'Zou'));
		// 换策略组
		await m.locator('[data-qg]').click(); await page.waitForTimeout(500);
		ok(`[${tag}] 换看哪个策略组：只列能手动切换的`, (await page.locator('.modal').last().locator('[data-v="Media"]').count()) === 1 && (await page.locator('.modal').last().locator('[data-v="Auto"]').count()) === 0);
		await page.locator('.modal').last().locator('[data-v="Media"]').click(); await page.waitForTimeout(500);
		ok(`[${tag}] 换成 Media，下次打开还是它`, /Media/.test(await m.locator('[data-qg]').textContent()) && (await page.evaluate(() => localStorage.getItem('rp_qgrp'))) === 'Media');
		await m.locator('[data-v="close"]').first().click(); await page.waitForTimeout(500);
		await ctx.close();
	}
	// 没有「切换节点」权限：不显示
	{
		ST.sub = true;
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8103/panel/'); await page.waitForTimeout(2200);
		await page.locator('.dock [data-d="quick"]').click(); await page.waitForTimeout(1200);
		ok('家人没有「切换节点」权限：不显示换节点', !/换节点/.test(await page.locator('.modal').last().textContent()));
		await ctx.close();
	}
	await browser.close(); server.close();
	let bad = 0;
	for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '\n    ' + note)); if (!c) bad++; }
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n${results.length - bad}/${results.length} 通过`);
	process.exit(bad || problems.length ? 1 : 0);
})();

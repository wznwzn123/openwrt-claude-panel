// 6.0 第 17 项：家人只管自己的设备——只管自己的家人：设备页只有自己名下的、「认领设备」；主账号：确认 / 拒绝认领、「更多 → 归谁」；
// 「我的主页 → 家人」：权限里有「看和管所有设备」、列表写清楚、6.0 以前加入的家人有提示
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const M = require('./mock');
const { OWNM } = M;
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const ROLE = { sub: false };
const MEM = { owner: { uid: 'momaaaaaaaa2', name: '妈妈', email: 'm***@x.com' }, subs: [
	{ uid: 'kidaaaaaaaa2', name: '小明', email: 'k***@x.com', tpl: 'family', perms: ['msg', 'node', 'speed'], old: false },
	{ uid: 'dadaaaaaaaa2', name: '爸爸', email: 'd***@x.com', tpl: 'family', perms: ['msg', 'node', 'speed', 'alldev'], old: true }], joins: [], pick: false, users: [], kick: {} };
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), R = (result) => J({ jsonrpc: '2.0', id: body.id, result });
			if (m === 'svc_info') return R({ hosted: true, hub: 'https://panel.example', exp: Date.now() + 30 * 864e5 });
			if (m === 'whoami' && ROLE.sub) return R({ ...M.respond('whoami', {}), role: 'sub', perms: ['msg', 'parent'], uid: 'kidaaaaaaaa2' });
			if (m === 'whoami') return R({ ...M.respond('whoami', {}), uid: 'momaaaaaaaa2' });
			if (m === 'fam' && body.params.op === 'members') return R(MEM);
			if (m === 'fam' && body.params.op === 'me') return R({ ok: true, me: { uid: ROLE.sub ? 'kidaaaaaaaa2' : 'momaaaaaaaa2', name: ROLE.sub ? '小明' : '妈妈', email: 'x***@x.com' }, role: ROLE.sub ? 'sub' : 'main', perms: ROLE.sub ? ['msg', 'parent'] : ['msg', 'node', 'speed', 'parent', 'alldev', 'proxy', 'net', 'sys'], owner: null, nsub: 2, router: { name: 'Home' } });
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
const TV = '11:22:33:44:55:66', IPH = 'aa:bb:cc:dd:ee:ff';
(async () => {
	await new Promise((r) => server.listen(8101, r));
	const browser = await chromium.launch();
	for (const [w, h, tag, dark] of [[390, 844, '手机', false], [320, 640, '小屏', true], [430, 932, '大屏', false]]) {
		// ---------- 只管自己的家人 ----------
		ROLE.sub = true; Object.assign(OWNM, { own: { [IPH]: { uid: 'kidaaaaaaaa2', ok: true, how: 'auto' } }, limit: true, sub: true, cands: [{ mac: TV, name: 'TV', online: true }, { mac: '5c:cf:7f:12:34:56', name: 'ESP_1A2B3C', online: false }], calls: [] });
		let ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		let page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push(`[${tag}] 页面错误：` + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_dev', 'abcdefgh.' + 'x'.repeat(32)); });
		await page.goto('http://localhost:8101/panel/?p=dev'); await page.waitForTimeout(2600);
		const toastT = async () => (await page.textContent('#toast')) || '';
		ok(`[${tag}] 只管自己的家人：标题是「我的设备」，只有自己名下的`, (await page.textContent('#dvHead')) === '我的设备' && (await page.textContent('#dvAllT')) === '我名下的设备' && (await page.locator('#dvList [data-i]').count()) === 1, await page.textContent('#dvHead'));
		ok(`[${tag}] 有「认领设备」按钮`, await page.locator('#dvClaim').isVisible());
		ok(`[${tag}] 不横向滚动`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await page.screenshot({ path: path.join(SHOT, `own-sub-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('#dvClaim'); await page.waitForTimeout(700);
		const sh = page.locator('.modal').last();
		ok(`[${tag}] 认领：列出没主的设备，在线的写在线`, /哪台是你的/.test(await sh.textContent()) && /TV/.test(await sh.textContent()) && /在线/.test(await sh.textContent()) && (await sh.locator('[data-cl]').count()) === 2);
		await sh.locator(`[data-cl="${TV}"]`).click(); await page.waitForTimeout(700);
		ok(`[${tag}] 点「这是我的」：发给主账号确认`, JSON.stringify(OWNM.calls[0]) === JSON.stringify(['claim', TV]) && /已发给主账号确认/.test(await toastT()) && /等确认/.test(await sh.textContent()));
		await page.screenshot({ path: path.join(SHOT, `own-claim-${w}${dark ? '-dark' : ''}.png`) });
		await sh.locator('[data-v="close"]').click(); await page.waitForTimeout(500);
		ok(`[${tag}] 设备页上方写着哪些在等确认`, /等主账号确认/.test(await page.textContent('#ownBox')) && /TV/.test(await page.textContent('#ownBox')));
		await page.locator('#dvList [data-i="0"] [data-more]').click(); await page.waitForTimeout(500);
		ok(`[${tag}] 子账号的「更多」里没有「归谁」`, (await page.locator('.modal').last().locator('[data-v="owner"]').count()) === 0);
		await ctx.close();
		// ---------- 主账号 ----------
		ROLE.sub = false; Object.assign(OWNM, { own: { [TV]: { uid: 'kidaaaaaaaa2', ok: false, how: 'claim' }, [IPH]: { uid: 'kidaaaaaaaa2', ok: true, how: 'auto' } }, limit: false, sub: false, calls: [] });
		ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push(`[${tag}] 页面错误：` + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_dev', 'abcdefgh.' + 'x'.repeat(32)); });
		await page.goto('http://localhost:8101/panel/?p=dev&ask=claims'); await page.waitForTimeout(3000);
		const ob = await page.textContent('#ownBox');
		ok(`[${tag}] 主账号：上方列出家人认领的设备，写清楚是谁说的`, /家人认领的设备/.test(ob) && /1 台等确认/.test(ob) && /TV/.test(ob) && /小明说是他的/.test(ob), ob);
		ok(`[${tag}] 主账号：标题照旧是「设备」、没有认领按钮`, (await page.textContent('#dvHead')) === '设备' && !(await page.locator('#dvClaim').isVisible()));
		ok(`[${tag}] 认领那一行按钮不挤出去`, await page.locator('#ownBox .ownbtn').evaluate((e) => e.getBoundingClientRect().right <= innerWidth));
		await page.screenshot({ path: path.join(SHOT, `own-main-${w}${dark ? '-dark' : ''}.png`) });
		await page.locator('#ownBox [data-oa="ok"]').click(); await page.waitForTimeout(700);
		ok(`[${tag}] 点「确认」`, JSON.stringify(OWNM.calls[0]) === JSON.stringify(['set', TV, 'kidaaaaaaaa2']) && /已确认：这台设备归小明/.test(await toastT()) && !(await page.textContent('#ownBox')).trim());
		// 归谁
		const idx = await page.evaluate((mac) => [...document.querySelectorAll('#dvList [data-i]')].findIndex((x) => x.textContent.includes('TV')), TV);
		await page.locator(`#dvList [data-i="${idx}"] [data-more]`).click(); await page.waitForTimeout(500);
		let mm = page.locator('.modal').last();
		ok(`[${tag}] 主账号「更多」里有「归谁」，写着现在归谁`, (await mm.locator('[data-v="owner"]').count()) === 1 && /小明/.test(await mm.locator('[data-v="owner"]').textContent()), await mm.locator('[data-v="owner"]').textContent().catch(() => ''));
		await mm.locator('[data-v="owner"]').click(); await page.waitForTimeout(700);
		mm = page.locator('.modal').last();
		ok(`[${tag}] 「归谁」：列出家人，能看所有设备的写出来，还能「谁的都不是」`, /小明（现在）/.test(await mm.textContent()) && /爸爸/.test(await mm.textContent()) && /能看和管所有设备/.test(await mm.textContent()) && (await mm.locator('[data-v="none"]').count()) === 1);
		await mm.locator('[data-v="u:dadaaaaaaaa2"]').click(); await page.waitForTimeout(700);
		ok(`[${tag}] 改成归爸爸`, JSON.stringify(OWNM.calls[1]) === JSON.stringify(['set', TV, 'dadaaaaaaaa2']) && /这台设备归爸爸了/.test(await toastT()));
		// 我的主页 → 家人
		await page.goto('http://localhost:8101/panel/?p=me'); await page.waitForTimeout(3000);
		const meT = await page.textContent('#meBox').catch(() => '');
		ok(`[${tag}] 家人列表：写清楚只管自己的设备 / 所有设备`, /只管自己的设备/.test(meT) && /所有设备/.test(meT), meT.slice(0, 400));
		ok(`[${tag}] 6.0 以前加入的家人：提示主账号自己决定`, /「爸爸」是 6\.0 以前加入的，还能看和管所有设备/.test(meT));
		await ctx.close();
	}
	await browser.close(); server.close();
	let bad = 0;
	for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '\n    ' + note)); if (!c) bad++; }
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n${results.length - bad}/${results.length} 通过`);
	process.exit(bad || problems.length ? 1 : 0);
})();

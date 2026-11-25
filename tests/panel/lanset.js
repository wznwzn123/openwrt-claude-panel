// 6.0 第 25 项（面板）：局域网设置——路由器地址、子网掩码（子账号只读）、DHCP 开关 / 范围 / 租期（分段开关）；
// 改路由器地址时范围跟着搬到新网段；保存前确认（改地址、关 DHCP 是危险操作）；用旧地址在家里打开的弹「去新地址点保留」；
// 新地址上带 #ngkeep=编号 打开：不用登录直接问保不保留；菜单里有这一页
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const S = { calls: [], d: null, keep: [] };
const HOSTS = () => [{ id: 'nas', mac: '00:11:22:33:44:55', ip: '192.168.1.20', name: '', edit: true, black: false }, { id: 'bl1', mac: 'aa:aa:aa:aa:aa:aa', ip: '192.168.1.40', name: 'TV', edit: true, black: true }];
const D0 = (o = {}) => ({ ip: '192.168.1.1', mask: '255.255.255.0', pl: 24, dhcp: { on: true, from: '192.168.1.100', to: '192.168.1.249', lease: '12h' }, port: 906, owner: true, pending: null, hosts: HOSTS(), ...o });
function handle(m, p) {
	S.calls.push({ m, p });
	if (m === 'lanset_get') return S.d;
	if (m === 'lanset_set') return { changed: true, token: 'abcdefgh23456789', wait: 90, ip: p.ip && p.ip !== S.d.ip ? p.ip : null, port: 906, moved: { host: 1, pf: 0 } };
	if (m === 'net_confirm') return { ok: true };
	if (m === 'devices') return { devices: [{ mac: '00:11:22:33:44:55', ip: '192.168.1.20', name: '群晖', online: true }, { mac: '66:77:88:99:aa:bb', ip: '192.168.1.123', name: 'iPad', online: true }, { mac: 'cc:cc:cc:cc:cc:cc', ip: '192.168.1.124', name: '打印机', online: false }] };
	if (m === 'lan_host_set') { if (p.op === 'add') S.d.hosts.push({ id: 'cmcp_h1', mac: p.mac, ip: p.ip, name: '', edit: true, black: false }); if (p.op === 'del') S.d.hosts = S.d.hosts.filter((x) => x.id !== p.id); if (p.op === 'edit') S.d.hosts.find((x) => x.id === p.id).ip = p.ip; return { changed: true, what: p.op === 'add' ? '「iPad」固定用 ' + p.ip : p.op === 'del' ? '去掉了「群晖」的固定地址' : '「群晖」改成固定用 ' + p.ip, hosts: S.d.hosts }; }
	if (m === 'lan_keep') { S.keep.push(p); return p.peek ? { left: 70, what: '局域网设置' } : { ok: true }; }
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); try { return J({ jsonrpc: '2.0', id: body.id, result: handle(body.method.replace(/^panel\//, ''), body.params || {}) }); } catch (e) { return J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const hidden = (page, sel) => page.locator(sel).evaluate((e) => e.classList.contains('hidden'));
(async () => {
	await new Promise((r) => server.listen(8175, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S.calls = []; S.d = D0();
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8175/panel/?p=lanset'); await W(1800);
		ok('读：路由器地址、掩码、DHCP 开着、范围、租期 12 小时选中' + T, (await page.inputValue('[data-ls="ip"]')) === '192.168.1.1' && (await page.inputValue('[data-ls="mask"]')) === '255.255.255.0' && (await page.isChecked('[data-ls="on"]')) && (await page.inputValue('[data-ls="from"]')) === '192.168.1.100' && (await page.inputValue('[data-ls="to"]')) === '192.168.1.249' && /12 小时/.test(await page.textContent('#lsLease .chip.on')));
		ok('没改：不出保存栏' + T, await hidden(page, '#lsBar'));
		ok('不横向滚动' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		ok('租期分段开关一行放下、字不截断' + T, await page.evaluate(() => { const b = document.getElementById('lsLease'), r = b.getBoundingClientRect(); return [...b.querySelectorAll('.chip')].every((c) => c.getBoundingClientRect().top - r.top < 8 && c.scrollWidth <= c.clientWidth + 1); }));
		await page.screenshot({ path: path.join(SHOT, `lanset-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		// 改地址：范围跟着搬
		await page.fill('[data-ls="ip"]', '192.168.5.1'); await W(150);
		ok('改路由器地址：地址范围跟着搬到新网段' + T, (await page.inputValue('[data-ls="from"]')) === '192.168.5.100' && (await page.inputValue('[data-ls="to"]')) === '192.168.5.249' && !(await hidden(page, '#lsBar')));
		await page.click('#lsSave'); await W(400);
		let m = page.locator('.modal').last();
		ok('改地址前确认：标题「改路由器地址」，正文写断网、重连 Wi-Fi、面板新地址' + T, /改路由器地址/.test(await m.textContent()) && /重连 Wi-Fi/.test(await m.textContent()) && /http:\/\/192\.168\.5\.1:906/.test(await m.textContent()));
		await m.locator('[data-v="true"]').click(); await W(800);
		const set = S.calls.filter((c) => c.m === 'lanset_set').pop();
		ok('传给路由器：新地址、掩码、DHCP 范围、租期' + T, set && set.p.ip === '192.168.5.1' && set.p.mask === '255.255.255.0' && set.p.from === '192.168.5.100' && set.p.to === '192.168.5.249' && set.p.lease === '12h' && set.p.dhcp_on === true, JSON.stringify(set && set.p));
		const ng = page.locator('.modal[data-ng]');
		ok('从外面打开的（不是旧地址）：弹「保留吗」小卡片，提示重连 Wi-Fi' + T, (await ng.count()) === 1 && /新的局域网设置要保留吗/.test(await ng.textContent()) && /重连 Wi-Fi/.test(await ng.textContent()) && await ng.evaluate((e) => e.classList.contains('compact')));
		await page.screenshot({ path: path.join(SHOT, `lanset-keep-${w}${dark ? '-dark' : ''}.png`) });
		await ng.locator('[data-keep]').click(); await W(900);
		ok('点「保留」：提示' + T, /已保留新的局域网设置/.test(await page.textContent('#toast')));
		// 固定地址
		await page.goto('http://localhost:8175/panel/?p=lanset'); await W(1500);
		const hr = page.locator('#lsHosts .lshrow');
		ok('固定地址：列表（名字用设备名，IP · MAC），带数量' + T, (await hr.count()) === 2 && /群晖/.test(await hr.nth(0).textContent()) && /192\.168\.1\.20 · 00:11:22:33:44:55/.test(await hr.nth(0).textContent()) && (await page.textContent('#lsHN')) === '2');
		await page.click('#lsHAdd'); await W(500);
		let hm = page.locator('.modal').last();
		ok('添加：设备从列表选（已经固定的不列），IP 先填它现在的' + T, (await hm.locator('[data-h="dev"] option').count()) === 3 && !/群晖/.test(await hm.locator('[data-h="dev"]').textContent()) && (await hm.locator('[data-h="ip"]').inputValue()) === '192.168.1.123');
		await page.screenshot({ path: path.join(SHOT, `lanset-host-${w}${dark ? '-dark' : ''}.png`) });
		await hm.locator('[data-h="ip"]').fill('192.168.1.60'); await hm.locator('[data-v="save"]').click(); await W(700);
		const hs = S.calls.filter((c) => c.m === 'lan_host_set').pop();
		ok('添加：传 MAC、IP、设备名，提示结果，列表多一条' + T, hs && hs.p.op === 'add' && hs.p.mac === '66:77:88:99:aa:bb' && hs.p.ip === '192.168.1.60' && hs.p.name === 'iPad' && /固定用 192\.168\.1\.60/.test(await page.textContent('#toast')) && (await hr.count()) === 3 && (await page.textContent('#lsHN')) === '3');
		await hr.nth(1).click(); await W(500);
		hm = page.locator('.modal').last();
		ok('不走代理要用的固定地址：删除按钮写原因、不能点' + T, /不能删：不走代理要用/.test(await hm.textContent()) && await hm.locator('[data-v="del"]').isDisabled());
		await hm.locator('[data-h="ip"]').press('Escape').catch(() => {}); await page.locator('.modal').last().locator('[data-v="close"], .sheethead [data-v="close"]').first().click().catch(() => {}); await page.mouse.click(5, 5); await W(500);
		await page.evaluate(() => document.querySelectorAll('.modal').forEach((m) => m.remove()));
		await hr.nth(0).click(); await W(500);
		hm = page.locator('.modal').last();
		await hm.locator('[data-v="del"]').click(); await W(500);
		const cm = page.locator('.modal').last();
		ok('删固定地址前确认：标题写动作和对象，正文写后果' + T, /去掉「群晖」的固定地址/.test(await cm.textContent()) && /下次连上可能换地址/.test(await cm.textContent()));
		await cm.locator('[data-v="true"]').click(); await W(700);
		ok('删掉：告诉路由器，列表少一条' + T, S.calls.some((c) => c.m === 'lan_host_set' && c.p.op === 'del' && c.p.id === 'nas') && (await hr.count()) === 2);
		S.d = D0();
		// 只改 DHCP：关掉
		await page.goto('http://localhost:8175/panel/?p=lanset'); await W(1500);
		await page.uncheck('[data-ls="on"]'); await W(150);
		ok('关掉 DHCP：范围、租期收起' + T, await hidden(page, '#lsDh'));
		await page.click('#lsSave'); await W(400);
		m = page.locator('.modal').last();
		ok('关 DHCP 前确认：写后果' + T, /关掉 DHCP/.test(await m.textContent()) && /拿不到地址/.test(await m.textContent()));
		await m.locator('[data-v="true"]').click(); await W(800);
		const s2 = S.calls.filter((c) => c.m === 'lanset_set').pop();
		ok('只改 DHCP：不传路由器地址' + T, s2 && s2.p.dhcp_on === false && s2.p.ip === undefined && s2.p.mask === undefined, JSON.stringify(s2 && s2.p));
		await page.locator('.modal[data-ng] [data-keep]').click(); await W(600);
		await ctx.close();
	}
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		// 子账号：路由器地址只读
		S.d = D0({ owner: false });
		await page.goto('http://localhost:8175/panel/?p=lanset'); await W(1500);
		ok('子账号：路由器地址、掩码只读，写原因', (await page.getAttribute('[data-ls="ip"]', 'readonly')) !== null && /只有主账号能改/.test(await page.textContent('#lsBody')));
		// 用旧地址在家里打开（测试里旧地址就是 localhost）
		S.d = D0({ ip: 'localhost' });
		await page.goto('http://localhost:8175/panel/?p=lanset'); await W(1500);
		await page.fill('[data-ls="ip"]', '192.168.5.1'); await W(100);
		await page.click('#lsSave'); await W(400);
		await page.locator('.modal').last().locator('[data-v="true"]').click(); await W(800);
		const mv = page.locator('.modal[data-ng]');
		ok('用旧地址打开的：弹「去新地址点保留」，按钮打开新地址（带编号）', /去新地址点「保留」/.test(await mv.textContent()) && (await mv.locator('a[data-go]').getAttribute('href')) === 'http://192.168.5.1:906/panel/#ngkeep=abcdefgh23456789');
		await page.screenshot({ path: path.join(SHOT, 'lanset-move-390.png') });
		await ctx.close();
		// 新地址上打开：不用登录直接问
		const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
		const p2 = await c2.newPage(); p2.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		S.keep = [];
		await p2.goto('http://localhost:8175/panel/#ngkeep=abcdefgh23456789'); await W(1500);
		const k = p2.locator('.modal[data-ng]');
		ok('新地址上：没登录也弹「新地址能打开了，保留吗？」，倒数用路由器说的剩余秒数', (await k.count()) === 1 && /新地址能打开了，保留吗/.test(await k.textContent()) && /^(6\d|70)$/.test((await k.locator('[data-n]').textContent()).trim()));
		ok('网址里的编号马上去掉', !/ngkeep/.test(await p2.evaluate(() => location.href)));
		await p2.screenshot({ path: path.join(SHOT, 'lanset-newaddr-390.png') });
		await k.locator('[data-keep]').click(); await W(800);
		ok('点「保留」：凭编号告诉路由器，提示新地址', S.keep.some((x) => x.token === 'abcdefgh23456789' && !x.peek && !x.revert) && /已保留，路由器地址是 localhost/.test(await p2.textContent('#toast')));
		await c2.close();
	}
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8175/panel/?p=home'); await W(1500);
		const nav = await page.evaluate(() => [...document.querySelectorAll('#sidenav [data-p]')].map((b) => [b.dataset.p, b.textContent.trim()]));
		ok('菜单「网络」里有「局域网设置」', nav.some((x) => x[0] === 'lanset' && /局域网设置/.test(x[1])));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

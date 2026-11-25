// 6.0 第 18 项（面板）：端口转发——列表（名字、协议 外部端口 → 设备:端口、开关）、外网地址（内网地址时说连不进来）、
// 添加（设备能从列表选）、改、关（先确认）、删（先确认）；改完弹「保留」卡片（90 秒确认）；认不全的规则只能删；菜单里是这一页
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const LIST = () => [
	{ id: 'nas', name: 'NAS', proto: 'tcp', ext: '5000', ip: '192.168.5.20', port: '5000', on: true, mine: false, edit: true },
	{ id: 'cfg1', name: 'Game', proto: 'udp', ext: '27015-27020', ip: '192.168.5.30', port: '', on: false, mine: false, edit: true },
	{ id: 'odd', name: 'Only from office', proto: 'tcp udp', ext: '3389', ip: '192.168.5.40', port: '', on: true, mine: false, edit: false },
];
const S = { list: LIST(), calls: [], inner: false, pend: null };
function handle(m, p) {
	S.calls.push({ m, p });
	if (m === 'pf_list') return { list: S.list, wan: { ip: S.inner ? '100.72.3.4' : '58.33.1.2', inner: S.inner }, lan: '192.168.5.1/24', reserved: [{ port: 80, what: '路由器网页后台' }, { port: 906, what: '面板' }, { port: 22, what: 'SSH' }], pending: null };
	if (m === 'pf_set') {
		if (p.ext === '80') throw new Error('不能转发 80 端口：路由器网页后台要用');
		if (p.op === 'add') S.list.push({ id: 'cmcp_pf_abc123', name: p.name || p.ip + ' ' + p.ext, proto: p.proto === 'both' ? 'tcp udp' : p.proto, ext: p.ext, ip: p.ip, port: p.port || p.ext, on: true, mine: true, edit: true });
		if (p.op === 'del') S.list = S.list.filter((x) => x.id !== p.id);
		if (p.op === 'on' || p.op === 'off') S.list.find((x) => x.id === p.id).on = p.op === 'on';
		return { changed: true, token: 'tttttttttttttttt', wait: 90 };
	}
	if (m === 'net_confirm') return { ok: true };
	if (m === 'devices') return { devices: [{ ip: '192.168.5.8', name: 'iPhone', online: true }, { ip: '192.168.5.50', name: '摄像头', online: true }, { ip: '192.168.5.20', name: '群晖', online: false }] };
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
(async () => {
	await new Promise((r) => server.listen(8185, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S.list = LIST(); S.calls = []; S.inner = w === 320;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8185/panel/?p=pf'); await W(1800);
		const rows = page.locator('#pfList .pfrow');
		ok('列表：三条，名字、协议 外部端口 → 设备名 IP:端口' + T, (await rows.count()) === 3 && /NAS/.test(await rows.nth(0).textContent()) && /TCP 5000 → 群晖\s*$/.test(await rows.nth(0).textContent()) && /UDP 27015-27020 → 192\.168\.5\.30/.test(await rows.nth(1).textContent()), await rows.nth(0).textContent());
		ok('开关：开着的打勾，关着的不打勾' + T, (await rows.nth(0).locator('input').isChecked()) && !(await rows.nth(1).locator('input').isChecked()));
		const wan = await page.textContent('#pfWan');
		ok(S.inner ? '外网地址是内网地址：说清楚从外面连不进来' + T : '外网地址' + T, S.inner ? /外网地址是内网地址/.test(wan) && /连不进来/.test(wan) : /58\.33\.1\.2/.test(wan), wan);
		ok('不横向滚动' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await page.screenshot({ path: path.join(SHOT, `pf-${w}${dark ? '-dark' : ''}.png`) });
		// 添加
		await page.click('#pfAdd'); await W(500);
		let m = page.locator('.modal').last();
		ok('添加：设备能从局域网设备里选；写着哪些端口不能用' + T, (await m.locator('datalist option').count()) === 3 && /不能用：80、906、22/.test(await m.textContent()));
		const bb = await m.locator('.modalbox').boundingBox();
		ok('添加卡片在屏幕里' + T, bb && bb.x >= 0 && bb.x + bb.width <= w + 1);
		await page.screenshot({ path: path.join(SHOT, `pf-add-${w}${dark ? '-dark' : ''}.png`) });
		await m.locator('[data-k="ip"]').fill('192.168.5.50'); await m.locator('[data-k="ext"]').fill('80');
		await m.locator('[data-v="save"]').click(); await W(600);
		ok('路由器不让（管理端口）：提示，卡片还在' + T, /路由器网页后台要用/.test(await page.textContent('#toast')) && (await page.locator('.modal').count()) === 1);
		await m.locator('[data-k="name"]').fill('摄像头'); await m.locator('[data-k="ext"]').fill('8080'); await m.locator('[data-k="port"]').fill('80');
		await m.locator('[data-p="tcp"]').click();
		await m.locator('[data-v="save"]').click(); await W(800);
		ok('保存：传给路由器（名字、设备、端口、协议）' + T, S.calls.some((c) => c.m === 'pf_set' && c.p.op === 'add' && c.p.name === '摄像头' && c.p.ip === '192.168.5.50' && c.p.ext === '8080' && c.p.port === '80' && c.p.proto === 'tcp'));
		const ng = page.locator('.modal[data-ng]');
		ok('弹「保留新的端口转发？」卡片，带倒数' + T, (await ng.count()) === 1 && /保留新的端口转发/.test(await ng.textContent()) && /秒后改回原来的/.test(await ng.textContent()));
		await page.screenshot({ path: path.join(SHOT, `pf-keep-${w}${dark ? '-dark' : ''}.png`) });
		await ng.locator('[data-keep]').click(); await W(1200);
		ok('点「保留」：告诉路由器，提示「已保留」，列表多一条' + T, S.calls.some((c) => c.m === 'net_confirm') && /已保留/.test(await page.textContent('#toast')) && (await rows.count()) === 4);
		// 关掉：先确认
		await rows.nth(0).locator('.sw i').click(); await W(500);
		m = page.locator('.modal').last();
		ok('关掉前确认：标题写动作和对象，正文只写后果' + T, /关掉「NAS」/.test(await m.textContent()) && /外面再连这个端口就连不上了/.test(await m.textContent()));
		await m.locator('[data-v="true"]').click(); await W(800);
		ok('关掉：告诉路由器' + T, S.calls.some((c) => c.m === 'pf_set' && c.p.op === 'off' && c.p.id === 'nas'));
		await page.locator('.modal[data-ng] [data-keep]').click(); await W(1200);
		// 认不全的规则：只能删
		await page.locator('#pfList .pfrow[data-id="odd"]').click(); await W(500);
		m = page.locator('.modal').last();
		ok('认不全的规则：说不能改的原因，只有删除和关闭' + T, /不能在面板里改/.test(await m.textContent()) && !(await m.locator('[data-v="save"]').count()) && (await m.locator('[data-v="del"]').count()) === 1);
		await m.locator('[data-v="del"]').click(); await W(500);
		m = page.locator('.modal').last();
		ok('删除前确认' + T, /删除「Only from office」/.test(await m.textContent()));
		await m.locator('[data-v="true"]').click(); await W(800);
		ok('删除：告诉路由器' + T, S.calls.some((c) => c.m === 'pf_set' && c.p.op === 'del' && c.p.id === 'odd'));
		await page.locator('.modal[data-ng] [data-keep]').click(); await W(1000);
		await ctx.close();
	}
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8185/panel/?p=home'); await W(1500);
		const nav = await page.evaluate(() => [...document.querySelectorAll('[data-p]')].map((b) => [b.dataset.p, b.textContent.trim()]));
		ok('菜单「端口转发」是这一页，防火墙里不再有原版的端口转发', nav.some((x) => x[0] === 'pf') && !nav.some((x) => /firewall\/forwards/.test(x[0])), JSON.stringify(nav.filter((x) => /pf|forwards/.test(x[0]))));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

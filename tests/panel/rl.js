// 6.0 第 20 项（面板）：设备限速——「更多 → 上网控制 → 限速」，下载 / 上传（Mbps，选填），「更多」里显示现在的上限；
// 取消限速；开着加速时弹窗里提示限速不准；用不了的固件直接说原因
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const TV = '11:22:33:44:55:66';
const S = { scan: { found: 5, fresh: [{ ip: '192.168.5.77', mac: 'aa:00:00:00:00:77' }, { ip: '192.168.5.78', mac: 'aa:00:00:00:00:78' }], range: '192.168.5.0/24', part: false }, calls: [], devs: {}, caps: { ok: true, mode: 'nft', why: null, warn: null } };
function handle(m, p) {
	S.calls.push({ m, p });
	if (m === 'lan_scan') return S.scan;
	if (m === 'rl_get') return { devs: S.devs, caps: S.caps };
	if (m === 'rl_set') { if (p.down || p.up) S.devs[p.mac] = { down: p.down, up: p.up, name: p.name || null }; else delete S.devs[p.mac]; return { devs: S.devs, caps: S.caps }; }
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
	await new Promise((r) => server.listen(8177, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S.calls = []; S.devs = {}; S.caps = { ok: true, mode: 'nft', why: null, warn: null };
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8177/panel/?p=dev'); await W(2000);
		const last = () => page.locator('.modal').last();
		const more = async () => { await page.locator('#dvList [data-i="1"] [data-more]').click(); await W(500); };
		await more();
		ok('「更多 → 上网控制」里有「限速」' + T, (await last().locator('[data-v="rl"]').count()) === 1);
		await last().locator('[data-v="rl"]').click(); await W(600);
		let m = last();
		ok('限速弹窗：标题写设备，下载、上传（选填），单位 Mbps，默认不限' + T, /限速「TV」/.test(await m.textContent()) && /下载（选填）/.test(await m.textContent()) && /上传（选填）/.test(await m.textContent()) && (await m.locator('.rlin span').first().textContent()) === 'Mbps' && (await m.locator('[data-r="down"]').getAttribute('placeholder')) === '不限');
		ok('不横向滚动、输入框和单位在一行' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && await m.evaluate((e) => { const i = e.querySelector('[data-r="up"]').getBoundingClientRect(), s = e.querySelectorAll('.rlin span')[1].getBoundingClientRect(); return Math.abs(i.top + i.height / 2 - (s.top + s.height / 2)) < 4 && s.right <= innerWidth; }));
		await page.screenshot({ path: path.join(SHOT, `rl-${w}${dark ? '-dark' : ''}.png`) });
		await m.locator('[data-r="down"]').fill('abc'); await m.locator('[data-v="save"]').click(); await W(300);
		ok('填的不是数字：光标回到那一格，不保存' + T, (await page.evaluate(() => document.activeElement?.dataset?.r)) === 'down' && !S.calls.some((c) => c.m === 'rl_set'));
		await m.locator('[data-r="down"]').fill('10'); await m.locator('[data-r="up"]').fill('2.5'); await m.locator('[data-v="save"]').click(); await W(800);
		const set = S.calls.filter((c) => c.m === 'rl_set').pop();
		ok('保存：换算成 kbit/s 传给路由器，提示结果' + T, set && set.p.mac === TV && set.p.down === 10000 && set.p.up === 2500 && /已限速「TV」：下载 10 · 上传 2\.5 Mbps/.test(await page.textContent('#toast')), JSON.stringify(set && set.p));
		await more();
		ok('「更多」里显示现在的上限' + T, /下载 10 · 上传 2\.5 Mbps/.test(await last().locator('[data-v="rl"]').textContent()));
		await last().locator('[data-v="rl"]').click(); await W(600);
		m = last();
		ok('再打开：填着现在的上限，按钮是「取消限速」' + T, (await m.locator('[data-r="down"]').inputValue()) === '10' && (await m.locator('[data-r="up"]').inputValue()) === '2.5' && (await m.locator('[data-v="clear"]').count()) === 1);
		await m.locator('[data-v="clear"]').click(); await W(700);
		ok('取消限速：都传 0，提示' + T, S.calls.filter((c) => c.m === 'rl_set').pop().p.down === 0 && /已取消「TV」的限速/.test(await page.textContent('#toast')));
		await ctx.close();
	}
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		S.devs = {}; S.caps = { ok: true, mode: 'nft', why: null, warn: '开着「Turbo ACC（快速转发）」：被限速的设备也会被加速，限速不准。在原版后台关掉加速才准' };
		await page.goto('http://localhost:8177/panel/?p=dev'); await W(2000);
		await page.locator('#dvList [data-i="1"] [data-more]').click(); await W(500);
		await page.locator('.modal').last().locator('[data-v="rl"]').click(); await W(600);
		ok('开着加速：弹窗里提示限速不准、在哪关', /Turbo ACC/.test(await page.locator('.modal').last().textContent()) && /限速不准/.test(await page.locator('.modal').last().textContent()));
		await page.screenshot({ path: path.join(SHOT, 'rl-warn-390.png') });
		await page.locator('.modal').last().locator('[data-v="close"]').click(); await W(500);
		S.caps = { ok: false, mode: 'ipt', why: '固件缺 iptables 限速模块（kmod-ipt-hashlimit）', warn: null };
		await page.goto('http://localhost:8177/panel/?p=dev'); await W(2000);
		await page.locator('#dvList [data-i="1"] [data-more]').click(); await W(500);
		await page.locator('.modal').last().locator('[data-v="rl"]').click(); await W(600);
		ok('用不了的固件：直接说原因，不弹设置', /缺 iptables 限速模块/.test(await page.textContent('#toast')) && !(await page.locator('.modal [data-r="down"]').count()));
		// 6.0 第 26 项：深度扫描
		await page.locator('.modal').last().locator('[data-v="close"]').click().catch(() => {}); await W(400);
		ok('设备页有「扫描」按钮', await page.locator('#dvScan').isVisible());
		const n0 = S.calls.filter((c) => c.m === 'black_state').length;
		await page.click('#dvScan'); await W(900);
		ok('点「扫描」：扫完提示扫到几台新设备，刷新列表', S.calls.some((c) => c.m === 'lan_scan') && /扫到 2 台新设备/.test(await page.textContent('#toast')) && S.calls.filter((c) => c.m === 'black_state').length > n0);
		S.scan = { found: 3, fresh: [], range: '10.0.1.0/24', part: true };
		await page.click('#dvScan'); await W(900);
		ok('没有新设备、网段太大只扫了一段：都说清楚', /没有新设备（只扫了 10\.0\.1\.0\/24）/.test(await page.textContent('#toast')));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

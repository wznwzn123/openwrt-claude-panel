// 6.0 第 22 项（面板）：无线中继——状态（没在中继 / 已连上 / 连不上 / 原版后台设的 / 跟家里网段冲突）、扫描（打开就扫、信号格、锁、连不了的写原因）、
// 换频段、点一个输密码连上（信道要改时说清楚）、手动输入、断开（先确认）；连上后弹「保留」卡片；固件不支持时说清楚；菜单里有这一页
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const RADIOS = [{ id: 'radio0', band: '2g', name: '2.4G', on: true, ch: 1 }, { id: 'radio1', band: '5g', name: '5G', on: true, ch: 'auto' }];
const S = { calls: [], d: null };
const D0 = (o = {}) => ({ radios: RADIOS, on: false, mine: false, ssid: null, radio: null, status: null, clash: false, lan: '192.168.1.1', can: true, pending: null, ...o });
const LIST = { radio0: [{ ssid: 'Hotel', ch: 11, q: 86, enc: 'none', lock: false, ok: true }, { ssid: 'Neighbor 家里的 Wi-Fi 名字很长很长很长', ch: 6, q: 71, enc: 'psk2', lock: true, ok: true }, { ssid: 'Office', ch: 1, q: 40, enc: null, lock: true, ok: false }, { ssid: 'W3', ch: 1, q: 20, enc: 'sae', lock: true, ok: false }], radio1: [{ ssid: 'Fast-5G', ch: 149, q: 60, enc: 'psk2', lock: true, ok: true }] };
function handle(m, p) {
	S.calls.push({ m, p });
	if (m === 'wisp_get') return S.d;
	if (m === 'wisp_scan') return { band: p.radio === 'radio1' ? '5g' : '2g', list: LIST[p.radio] };
	if (m === 'wisp_set') return { changed: true, token: 'tttttttttttttttt', wait: 90, what: p.op === 'off' ? '断开中继' : '连「' + p.ssid + '」' };
	if (m === 'net_confirm') return { ok: true };
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
	await new Promise((r) => server.listen(8176, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S.calls = []; S.d = D0();
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8176/panel/?p=wisp'); await W(2000);
		ok('状态：没在中继' + T, /没在中继/.test(await page.textContent('#wsSt')));
		ok('打开就扫 2.4G' + T, S.calls.some((c) => c.m === 'wisp_scan' && c.p.radio === 'radio0'));
		const rows = page.locator('#wsList .wsrow[data-i]');
		ok('列表：名字、信道、信号格、锁；连不了的写原因' + T, (await rows.count()) === 4 && /信道 11/.test(await rows.nth(0).textContent()) && (await rows.nth(0).locator('.wsbars i.on').count()) === 4 && (await rows.nth(1).locator('.wslock').count()) === 1 && /连不了：企业认证/.test(await rows.nth(2).textContent()) && /连不了：只支持 WPA3/.test(await rows.nth(3).textContent()));
		ok('最后有「手动输入」' + T, (await page.locator('#wsList [data-manual]').count()) === 1);
		ok('频段分段开关' + T, (await page.locator('#wsBand .chip').count()) === 2 && /2\.4G/.test(await page.textContent('#wsBand .chip.on')));
		ok('不横向滚动；长名字不撑破' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await page.screenshot({ path: path.join(SHOT, `wisp-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		// 连不了的点了没反应
		await rows.nth(2).click({ force: true }); await W(300);
		ok('连不了的点了不弹' + T, (await page.locator('.modal').count()) === 0);
		// 连要密码的（信道要改）
		await rows.nth(1).click(); await W(500);
		let m = page.locator('.modal').last();
		ok('连要密码的：写信道会改成上级的' + T, /连「Neighbor/.test(await m.textContent()) && /信道改成 6/.test(await m.textContent()) && (await m.locator('[data-w="key"]').count()) === 1);
		await page.screenshot({ path: path.join(SHOT, `wisp-pw-${w}${dark ? '-dark' : ''}.png`) });
		await m.locator('[data-v="go"]').click(); await W(300);
		ok('没填密码：光标到密码框，不连' + T, (await page.evaluate(() => document.activeElement?.dataset?.w)) === 'key' && !S.calls.some((c) => c.m === 'wisp_set'));
		await m.locator('[data-w="key"]').fill('neighbor-pass'); await m.locator('[data-v="go"]').click(); await W(800);
		const set = S.calls.filter((c) => c.m === 'wisp_set').pop();
		ok('传给路由器：频段、名字、密码、加密、信道' + T, set && set.p.op === 'on' && set.p.radio === 'radio0' && /^Neighbor/.test(set.p.ssid) && set.p.key === 'neighbor-pass' && set.p.enc === 'psk2' && set.p.ch === 6, JSON.stringify(set && set.p));
		const ng = page.locator('.modal[data-ng]');
		ok('弹「保留新的中继设置？」小卡片，提示重连 Wi-Fi' + T, (await ng.count()) === 1 && /保留新的中继设置/.test(await ng.textContent()) && /重连 Wi-Fi/.test(await ng.textContent()));
		await ng.locator('[data-keep]').click(); await W(800);
		// 开放的：不要密码；自动信道的不改信道
		await page.click('#wsBand .chip[data-b="radio1"]'); await W(800);
		ok('换到 5G：重新扫 5G' + T, S.calls.some((c) => c.m === 'wisp_scan' && c.p.radio === 'radio1') && /Fast-5G/.test(await page.textContent('#wsList')));
		await page.locator('#wsList .wsrow[data-i="0"]').click(); await W(400);
		m = page.locator('.modal').last();
		ok('5G 信道是自动的：不说改信道' + T, !/信道改成/.test(await m.textContent()) && /家里 5G Wi-Fi 会断开几秒/.test(await m.textContent()));
		await m.locator('[data-v="close"]').click(); await W(400);
		// 手动输入
		await page.locator('#wsList [data-manual]').click(); await W(400);
		m = page.locator('.modal').last();
		ok('手动输入：名字、密码（选填）' + T, (await m.locator('[data-w="ssid"]').count()) === 1 && /密码（选填）/.test(await m.textContent()));
		await m.locator('[data-w="ssid"]').fill('Hidden'); await m.locator('[data-v="go"]').click(); await W(700);
		const s2 = S.calls.filter((c) => c.m === 'wisp_set').pop();
		ok('手动输入没密码：按开放的连' + T, s2.p.ssid === 'Hidden' && s2.p.enc === 'none' && s2.p.radio === 'radio1');
		await page.locator('.modal[data-ng] [data-keep]').click(); await W(600);
		await ctx.close();
	}
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		S.d = D0({ on: true, mine: true, ssid: 'Hotel', radio: 'radio0', status: { up: true, ip: '10.20.0.8', uptime: 600 } });
		await page.goto('http://localhost:8176/panel/?p=wisp'); await W(1800);
		const st = await page.textContent('#wsSt');
		ok('已连上：连着谁、频段、地址、连了多久，有「断开」', /已连上「Hotel」/.test(st) && /2\.4G · 10\.20\.0\.8 · 连了 10 分钟/.test(st) && (await page.locator('#wsOff').count()) === 1, st);
		ok('列表里正在用的标「在用」', /在用/.test(await page.locator('#wsList .wsrow[data-i="0"]').textContent()));
		await page.screenshot({ path: path.join(SHOT, 'wisp-on-390.png') });
		await page.click('#wsOff'); await W(400);
		const m = page.locator('.modal').last();
		ok('断开前确认：标题写动作和对象，正文写后果', /断开「Hotel」/.test(await m.textContent()) && /不再用它上网/.test(await m.textContent()));
		await m.locator('[data-v="true"]').click(); await W(700);
		ok('断开：告诉路由器', S.calls.some((c) => c.m === 'wisp_set' && c.p.op === 'off'));
		await page.locator('.modal[data-ng] [data-keep]').click().catch(() => {}); await W(500);
		S.d = D0({ on: true, mine: true, ssid: 'Hotel', radio: 'radio0', status: { up: true, ip: '192.168.1.50', uptime: 60 }, clash: true });
		await page.goto('http://localhost:8176/panel/?p=wisp'); await W(1600);
		ok('跟家里网段冲突：说清楚，给「改家里网段」', /也是 192\.168\.1\.x 网段，跟家里冲突/.test(await page.textContent('#wsSt')) && (await page.locator('#wsLan').count()) === 1);
		await page.click('#wsLan'); await W(1200);
		ok('点「改家里网段」去局域网设置', await page.evaluate(() => document.getElementById('p-lanset').classList.contains('on')));
		S.d = D0({ on: true, mine: false, ssid: 'Boss', radio: 'radio0', status: { up: false, pending: false } });
		await page.goto('http://localhost:8176/panel/?p=wisp'); await W(1600);
		ok('原版后台设的、连不上：标红，写「原版后台里设的」，没有断开按钮', /连不上「Boss」/.test(await page.textContent('#wsSt')) && /原版后台里设的/.test(await page.textContent('#wsSt')) && (await page.locator('#wsOff').count()) === 0 && (await page.locator('#wsSt b.ndbad').count()) === 1);
		S.d = D0({ can: false });
		await page.goto('http://localhost:8176/panel/?p=wisp'); await W(1600);
		ok('固件不支持：说清楚，不扫', /没有 wpa_supplicant/.test(await page.textContent('#wsSt')) && (await page.locator('#wsList').count()) === 0);
		const nav = await page.evaluate(() => [...document.querySelectorAll('#sidenav [data-p]')].map((b) => [b.dataset.p, b.textContent.trim()]));
		ok('菜单「网络」里有「无线中继」', nav.some((x) => x[0] === 'wisp' && /无线中继/.test(x[1])));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

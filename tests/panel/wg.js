// 6.0 第 55 项（面板）：加密通道——没装给软件中心入口；没公网 IP 写原因、开关灰掉；开 / 关前确认；
// 加手机：先确认本人，配置只显示一次（二维码、复制、下载）；删手机确认；只通指定设备；改端口、地址；320 / 390 / 430、深色
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
let S;
const CONF = '[Interface]\nPrivateKey = aaaa\nAddress = 10.77.0.3/32\n\n[Peer]\nPublicKey = bbbb\nEndpoint = abcd2345-w.panel.example:51820\nAllowedIPs = 10.77.0.0/24, 192.168.1.0/24\nPersistentKeepalive = 25\n';
const fresh = (o = {}) => ({ calls: [], d: { caps: true, pkg: 'luci-proto-wireguard', on: false, port: 51820, reach: { ok: true, msg: '', nat: false, wan4: '1.2.3.4' }, host: 'abcd2345-w.panel.example', own: '', peers: [{ id: '1', name: '我的手机', ip: '10.77.0.2', hs: Math.floor(Date.now() / 1000) - 180, rx: 2e6, tx: 3e8 }, { id: '2', name: '一个名字特别长特别长的平板电脑', ip: '10.77.0.3', hs: 0, rx: 0, tx: 0 }], only: null, cands: [{ ip: '192.168.1.20', mac: 'aa:bb:cc:00:00:20', name: 'NAS' }, { ip: '192.168.1.30', mac: 'aa:bb:cc:00:00:30', name: '客厅摄像头' }], ...o } });
function handle(m, p) {
	S.calls.push({ m, p });
	const d = S.d;
	if (m === 'fam' && p.op === 'sudo_code') return { nomail: true };
	if (m === 'fam' && p.op === 'sudo') return { sudo: 'tok'.repeat(8), exp: Date.now() + 600e3 };
	if (m === 'wg_get') return d;
	if (m === 'wg_set') {
		let msg = '';
		if (p.on === true) { d.on = true; msg = '已开启加密通道'; }
		else if (p.on === false) { d.on = false; msg = '已关闭加密通道'; }
		else if (p.add) { if (p.sudo !== 'tok'.repeat(8)) throw new Error('要先确认是你本人：在「我的主页 → 敏感信息」里验证'); d.peers.push({ id: '3', name: p.add, ip: '10.77.0.4', hs: 0, rx: 0, tx: 0 }); return { ...d, conf: CONF, name: p.add, file: 'home-3.conf', msg: '已添加「' + p.add + '」' }; }
		else if (p.del) { const x = d.peers.find((y) => y.id === p.del); d.peers = d.peers.filter((y) => y.id !== p.del); msg = '已删除「' + x.name + '」'; }
		else if ('only' in p) { d.only = p.only; msg = p.only ? '只通 ' + p.only.length + ' 台设备' : '能连整个家里网络'; }
		else if (p.port) { if (+p.port < 1024) throw new Error('端口要在 1024–65535 之间'); d.port = +p.port; msg = '端口改成 ' + p.port + '，手机要重新扫码'; }
		else if ('host' in p) { d.own = p.host; d.host = p.host || 'abcd2345-w.panel.example'; msg = p.host ? '地址改成 ' + p.host : '地址改回自动'; }
		return { ...d, msg };
	}
	const r = mock.respond(m, p);
	return m === 'whoami' ? { ...r, hosted: S.hosted !== false } : r;
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (x) => (b += x)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); const m = body.method.replace(/^panel\//, ''); return setTimeout(() => { try { J({ jsonrpc: '2.0', id: body.id, result: handle(m, body.params || {}) }); } catch (e) { J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }, 60); }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const lay = (page, sel = '#wgBody') => page.evaluate((sel) => {
	const bad = [];
	if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('横向滚动');
	document.querySelectorAll(sel + ' .kv, ' + sel + ' .btn, ' + sel + ' .file, ' + sel + ' .notice, ' + sel + ' .chip').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && (r.right > innerWidth - 8 || r.left < 8)) bad.push('出界：' + el.textContent.slice(0, 14)); });
	document.querySelectorAll(sel + ' .btn, ' + sel + ' .chip').forEach((b) => { if (b.offsetParent && b.scrollWidth > b.clientWidth + 1) bad.push('字截断：' + b.textContent); });
	document.querySelectorAll(sel + ' .file').forEach((r) => { const t = r.querySelector('b'), bt = r.querySelector('.btn'); if (t && bt && t.getBoundingClientRect().right > bt.getBoundingClientRect().left + 1) bad.push('名字压到按钮：' + t.textContent); });
	document.querySelectorAll(sel + ' .wgkv').forEach((k) => { const a = k.children[0], b = k.children[1], c = k.children[2]; if (a.getBoundingClientRect().right > b.getBoundingClientRect().left + 1 || b.getBoundingClientRect().right > c.getBoundingClientRect().left + 1) bad.push('重叠：' + k.textContent); });
	return bad;
}, sel);
const INIT = ({ hosted }) => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_host', hosted ? '1' : '0'); localStorage.setItem('rp_tour', '9'); };
const init = (page, hosted) => page.addInitScript(INIT, { hosted });
(async () => {
	await new Promise((r) => server.listen(8198, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S = fresh();
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true });
		await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8198' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await init(page, true);
		await page.goto('http://localhost:8198/panel/?p=wg'); await W(1500);
		ok('没开：只有开关' + T, (await page.isVisible('#wgOn')) && !(await page.isChecked('#wgOn')) && !(await page.$('#wgAdd')));
		// 开
		await page.click('#wgOn'); await W(300);
		ok('开之前确认：放行的端口、网络重新加载' + T, /开启加密通道/.test(await page.textContent('.modal')) && /防火墙放行 UDP 51820，网络会重新加载几秒/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="false"]'); await W(300);
		ok('取消：开关拨回去' + T, !(await page.isChecked('#wgOn')) && !S.calls.some((c) => c.m === 'wg_set'));
		await page.click('#wgOn'); await W(300); await page.click('.modal [data-v="true"]'); await W(500);
		let t = await page.textContent('#wgBody');
		ok('开了：地址、端口、手机、能连的设备' + T, /已开启加密通道/.test(await page.textContent('#toast')) && /abcd2345-w\.panel\.example/.test(t) && /UDP 51820/.test(t) && /我的手机/.test(t) && /10\.77\.0\.2 · 3 分钟前连过 · ↓286\.1 MB ↑1\.9 MB/.test(t) && /没连过/.test(t) && /整个家里网络/.test(t), t.slice(0, 400));
		let l = await lay(page); ok('不错位、不出界、不横向滚动' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `wg-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		// 加手机
		await page.click('#wgAdd'); await W(300);
		await page.fill('.modal [data-a="name"]', '老婆的手机'); await page.click('.modal [data-ok]'); await W(500);
		ok('加手机：先确认是你本人' + T, /先确认是你本人/.test(await page.textContent('.modal')) && /添加手机要先确认是你本人/.test(await page.textContent('.modal')) && !S.calls.some((c) => c.p && c.p.add));
		await page.click('.modal [data-send]'); await W(1200);
		const mt = await page.textContent('.modal');
		ok('加手机：带确认本人的凭证；只显示一次、二维码' + T, S.calls.some((c) => c.m === 'wg_set' && c.p.add === '老婆的手机' && c.p.sudo === 'tok'.repeat(8)) && /只显示这一次/.test(mt) && (await page.locator('.modal .wgqr svg').count()) === 1, mt);
		const qb = await page.evaluate(() => { const r = document.querySelector('.modal .wgqr').getBoundingClientRect(); const sh = document.querySelector('.modal .sheet, .modal > div').getBoundingClientRect(); return { w: r.width, ok: r.right <= innerWidth && r.left >= 0, fit: sh.height <= innerHeight }; });
		ok('二维码放得下' + T, qb.ok && qb.w >= 200 && qb.fit, JSON.stringify(qb));
		await page.screenshot({ path: path.join(SHOT, `wg-qr-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-wgcopy]'); await W(200);
		ok('复制配置' + T, (await page.evaluate(() => navigator.clipboard.readText())) === CONF);
		const dl = page.waitForEvent('download'); await page.click('.modal a[download]'); const f = await dl;
		ok('下载配置文件' + T, f.suggestedFilename() === 'home-3.conf' && fs.readFileSync(await f.path(), 'utf8') === CONF);
		await page.click('.modal [data-v="close"]'); await W(300);
		ok('关掉后列表里多了这台' + T, /老婆的手机/.test(await page.textContent('#wgBody')) && !(await page.$('.modal')));
		// 删手机
		await page.click('[data-wgdel="2"]'); await W(300);
		ok('删手机前确认' + T, /删除「一个名字特别长特别长的平板电脑」/.test(await page.textContent('.modal')) && /连不上家里了/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="true"]'); await W(400);
		ok('删掉了' + T, !/特别长的平板/.test(await page.textContent('#wgBody')) && /已删除/.test(await page.textContent('#toast')));
		// 只通指定设备
		await page.click('[data-wgmode="only"]'); await W(300);
		ok('只通指定设备：列出家里的设备' + T, /NAS/.test(await page.textContent('.modal')) && /客厅摄像头/.test(await page.textContent('.modal')));
		await page.screenshot({ path: path.join(SHOT, `wg-pick-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-i="0"]'); await page.click('.modal [data-ok]'); await W(500);
		t = await page.textContent('#wgBody');
		ok('保存：只通 NAS' + T, S.calls.some((c) => c.m === 'wg_set' && Array.isArray(c.p.only) && c.p.only.length === 1 && c.p.only[0].ip === '192.168.1.20' && c.p.only[0].mac === 'aa:bb:cc:00:00:20') && /只通 1 台设备/.test(await page.textContent('#toast')) && /NAS/.test(t) && (await page.getAttribute('[data-wgmode="only"]', 'class')).includes('on'));
		l = await lay(page); ok('只通指定设备时不错位' + T, !l.length, l.join('；'));
		await page.click('[data-wgmode="all"]'); await W(500);
		ok('改回整个家里网络' + T, S.d.only === null && /能连整个家里网络/.test(await page.textContent('#toast')));
		// 改端口
		await page.click('#wgPort'); await W(300);
		await page.fill('.modal [data-a="v"]', '51999'); await page.click('.modal [data-ok]'); await W(300);
		ok('改端口：已加的手机要重新扫码，先确认' + T, /要重新扫码/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="true"]'); await W(500);
		ok('端口改好' + T, /UDP 51999/.test(await page.textContent('#wgBody')));
		// 改地址
		await page.click('#wgHost'); await W(300);
		await page.fill('.modal [data-a="v"]', 'home.example.com'); await page.click('.modal [data-ok]'); await W(500);
		ok('填自己的域名' + T, /home\.example\.com/.test(await page.textContent('#wgBody')));
		// 关
		await page.click('#wgOn'); await W(300);
		ok('关之前确认：手机连不上、再开不用重新扫码' + T, /关闭加密通道/.test(await page.textContent('.modal')) && /再打开不用重新扫码/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="true"]'); await W(500);
		ok('关了' + T, !(await page.isChecked('#wgOn')) && !(await page.$('#wgAdd')));
		await ctx.close();
	}
	// 没装、没公网 IP、光猫后面、自建版没确认本人
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（其他）：' + e.message));
		await init(page, true);
		S = fresh({ caps: false });
		await page.goto('http://localhost:8198/panel/?p=wg'); await W(1500);
		ok('没装：给软件中心入口', /没装/.test(await page.textContent('#wgBody')) && (await page.locator('[data-wgget]').count()) === 1);
		await page.screenshot({ path: path.join(SHOT, 'wg-none.png') });
		S = fresh({ reach: { ok: false, msg: '没有公网 IP：宽带口是运营商的内网地址 100.72.1.2。找运营商要公网 IP，或者开 IPv6', nat: false, wan4: '100.72.1.2' } });
		await page.goto('http://localhost:8198/panel/?p=wg'); await W(1500);
		ok('没公网 IP：写原因，开关灰掉', /没有公网 IP：宽带口是运营商的内网地址 100\.72\.1\.2/.test(await page.textContent('#wgBody')) && (await page.isDisabled('#wgOn')));
		let l = await lay(page); ok('没公网 IP 时不错位', !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, 'wg-nopub.png') });
		S = fresh({ on: true, reach: { ok: true, msg: '', nat: true, wan4: '192.168.0.5' } });
		await page.goto('http://localhost:8198/panel/?p=wg'); await W(1500);
		ok('光猫后面：写要转发的端口和地址', /上一级路由器（光猫）要把 UDP 51820 转发到 192\.168\.0\.5/.test(await page.textContent('#wgBody')));
		await ctx.close();
		const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p2 = await ctx2.newPage();
		await init(p2, false);
		S = fresh({ on: true }); S.hosted = false;
		await p2.goto('http://localhost:8198/panel/?p=wg'); await W(1500);
		await p2.click('#wgAdd'); await W(300); await p2.fill('.modal [data-a="name"]', 'x'); await p2.click('.modal [data-ok]'); await W(800);
		ok('自建版没确认本人：去「我的主页 → 敏感信息」', /先在「我的主页 → 敏感信息」里验证是你本人/.test(await p2.textContent('#toast')) && !S.calls.some((c) => c.m === 'wg_set'));
		await ctx2.close();
	}
	await browser.close(); server.close();
	let fail = 0;
	for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n${results.length - fail}/${results.length} 通过`);
	process.exit(fail ? 1 : 0);
})();

// 6.0 第 30、34 项（面板）：固件升级、恢复出厂——在外面灰掉写「要连家里 Wi-Fi」；分块上传带进度；检查不通过说原因；
// 没备份先备份（云端 / 下载到手机）；最后一步说后果、输密码；320 / 390 / 430、深色不错位
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
let S;
const fresh = (o = {}) => ({ calls: [], chunks: 0, got: 0, size: 0, bad: false, bkAt: 0,
	d: { owner: true, home: 'wan', fw: { desc: 'OpenWrt 24.10.0 r28427', target: 'mediatek/filogic', model: 'Xiaomi Mi Router AX3000T', board: 'xiaomi,mi-router-ax3000t' }, mem: 180, reset: true, up: true, cloud: true, bk_last: null, bk_fresh: false, job: null, file: null, ...o } });
function handle(m, p) {
	S.calls.push({ m, p });
	const d = S.d;
	if (m === 'sysmnt_get') { if (S.bkAt && Date.now() > S.bkAt) d.bk_fresh = true; return d; }
	if (m === 'fw_lan') return { url: 'http://localhost:8194/panel/?p=fwup&lan=1#lopen=abcdefghijkmnpqrstuvwxyz' };
	if (m === 'bk_now') { S.bkAt = Date.now() + 1500; return { ok: true }; }
	if (m === 'sys_lbk') return { url: 'dl/x/backup.tar.gz', name: 'backup.tar.gz', size: 1000 };
	if (m === 'fw_up') {
		if (p.op === 'begin') { S.size = p.size; S.got = 0; return { ok: true, got: 0 }; }
		if (p.op === 'cancel') { d.file = null; return { ok: true }; }
		S.chunks++;
		S.got += Buffer.from(p.data, 'base64').length;
		const done = S.got >= S.size;
		if (done) d.file = { name: 'openwrt-sysupgrade.bin', size: S.size, ok: !S.bad, msg: S.bad ? '这个固件不是这台路由器的型号' : '' };
		return { ok: true, got: S.got, done, good: done ? !S.bad : undefined, msg: S.bad && done ? '这个固件不是这台路由器的型号' : '' };
	}
	if (m === 'fw_flash' || m === 'factory_reset') { if (p.pw !== 'right') throw new Error('密码不对，还能试 4 次'); return { ok: true, keep: p.keep }; }
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (x) => (b += x)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); const m = body.method.replace(/^panel\//, ''); return setTimeout(() => { try { J({ jsonrpc: '2.0', id: body.id, result: handle(m, body.params || {}) }); } catch (e) { J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }, 60); }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const IMG = path.join(SHOT, '_fw.bin'); fs.writeFileSync(IMG, Buffer.alloc(1300 * 1024, 5));
const lay = (page) => page.evaluate(() => {
	const bad = [];
	if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('横向滚动');
	document.querySelectorAll('#fwBody .card, #fwBody .btn, #fwBody dd').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && (r.right > innerWidth - 8 || r.left < 8)) bad.push('出界：' + el.textContent.slice(0, 12)); });
	document.querySelectorAll('#fwBody .btn').forEach((b) => { if (b.offsetParent && b.scrollWidth > b.clientWidth + 1) bad.push('按钮字截断：' + b.textContent); });
	return bad;
});
(async () => {
	await new Promise((r) => server.listen(8194, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S = fresh();
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8194/panel/?p=fwup'); await W(1500);
		let t = await page.textContent('#fwBody');
		ok('现在的固件、型号、平台' + T, /OpenWrt 24\.10\.0/.test(t) && /AX3000T/.test(t) && /mediatek\/filogic/.test(t));
		ok('在家：能选固件、能恢复出厂' + T, !(await page.isDisabled('#fwFile')) && !(await page.isDisabled('#fwReset')) && !/要连家里 Wi-Fi/.test(t));
		let l = await lay(page); ok('不错位、不出界' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `fwup-${w}${dark ? '-dark' : ''}.png`) });
		// 上传
		await page.setInputFiles('#fwFile', IMG); await W(200);
		ok('上传中显示进度' + T, /上传中 \d+%/.test(await page.textContent('#fwBody')) && await page.isVisible('.fwbar'));
		await W(1500);
		t = await page.textContent('#fwBody');
		ok('分块传完（512 KB 一块），检查通过，可以升级' + T, S.chunks === 3 && S.got === 1300 * 1024 && /检查通过/.test(t) && !(await page.isDisabled('#fwGo')) && await page.isChecked('#fwKeep'), `chunks=${S.chunks} ${t.slice(0, 120)}`);
		l = await lay(page); ok('传好后不错位' + T, !l.length, l.join('；'));
		await page.screenshot({ path: path.join(SHOT, `fwup-ready-${w}${dark ? '-dark' : ''}.png`) });
		// 升级：先备份（云端）
		await page.click('#fwGo'); await W(300);
		ok('没备份：先备份到云端' + T, /先备份/.test(await page.textContent('.modal')) && /备份到云端/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="true"]'); await W(5000);
		ok('备份完了：说后果、要密码' + T, S.calls.some((c) => c.m === 'bk_now') && /升级固件/.test(await page.textContent('.modal')) && /设置和面板保留/.test(await page.textContent('.modal')) && await page.isVisible('#fwPw'));
		await page.screenshot({ path: path.join(SHOT, `fwup-pw-${w}${dark ? '-dark' : ''}.png`) });
		await page.fill('#fwPw', 'wrong'); await page.click('.modal [data-ok]'); await W(400);
		ok('密码错：说清楚，不刷' + T, /密码不对/.test(await page.textContent('#toast')));
		await page.click('#fwGo'); await W(300);
		ok('备份过了不再问备份' + T, !/先备份/.test(await page.textContent('.modal')));
		await page.fill('#fwPw', 'right'); await page.press('#fwPw', 'Enter'); await W(400);
		ok('升级：保留设置，页面写「正在升级」' + T, S.calls.some((c) => c.m === 'fw_flash' && c.p.keep === true && c.p.pw === 'right') && /正在升级/.test(await page.textContent('#fwBody')));
		await ctx.close();
	}
	// 在外面
	{
		S = fresh({ home: null });
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（在外面）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8194/panel/?p=fwup'); await W(1500);
		ok('在外面：写「要连家里 Wi-Fi」，按钮灰掉', /要连家里 Wi-Fi/.test(await page.textContent('#fwBody')) && await page.isDisabled('#fwFile') && await page.isDisabled('#fwReset'));
		await page.screenshot({ path: path.join(SHOT, 'fwup-away.png') });
		await ctx.close();
	}
	// 在家但没认出来（手机连面板走了代理节点）：「用家里地址打开」，一点跳到局域网面板（用户 11/28）；320 / 390 深色 / 430
	for (const [w, h, dark] of [[320, 568, false], [390, 844, true], [430, 932, false]]) {
		S = fresh({ home: null, lan: true });
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（家里地址）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8194/panel/?p=fwup'); await W(1500);
		const n = await page.evaluate(() => { const e = document.querySelector('#fwBody .nbtn'), b = document.getElementById('fwLan'); if (!e || !b) return null; const r = e.getBoundingClientRect(), rb = b.getBoundingClientRect(), sp = e.querySelector('span'); return { t: e.textContent, inside: rb.right <= r.right + 1 && rb.left >= r.left - 1, lines: Math.round(sp.getBoundingClientRect().height / parseFloat(getComputedStyle(sp).lineHeight)), sw: document.documentElement.scrollWidth <= innerWidth }; });
		ok(`［${w}${dark ? ' 深色' : ''}］没认出在家：写「没认出你连着家里 Wi-Fi」+「用家里地址打开」按钮，按钮在条里、不横向超出`, n && /没认出你连着家里 Wi-Fi/.test(n.t) && /用家里地址打开/.test(n.t) && n.inside && n.sw, JSON.stringify(n));
		await page.screenshot({ path: path.join(SHOT, `fwup-lan-${w}${dark ? '-dark' : ''}.png`) });
		if (w === 390) {
			const navs = []; page.on('request', (q) => { if (q.isNavigationRequest()) navs.push(q.url()); });
			await page.click('#fwLan'); await W(1200);
			ok('点「用家里地址打开」：跳到路由器给的局域网面板地址', navs.some((u) => /\?p=fwup&lan=1/.test(u)) && S.calls.some((c) => c.m === 'fw_lan'), navs.join(' '));
		}
		await ctx.close();
	}
	// 不是主账号、或者家里地址关着：照旧只写「要连家里 Wi-Fi」，不给按钮
	{
		S = fresh({ home: null, lan: false });
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8194/panel/?p=fwup'); await W(1500);
		ok('家里地址关着：只写「要连家里 Wi-Fi」，没有按钮', /要连家里 Wi-Fi/.test(await page.textContent('#fwBody')) && !(await page.locator('#fwLan').count()));
		await ctx.close();
	}
	// 型号不对、没有云端、恢复出厂
	{
		S = fresh({ cloud: false }); S.bad = true;
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（型号不对）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8194/panel/?p=fwup'); await W(1500);
		await page.setInputFiles('#fwFile', IMG); await W(1800);
		ok('型号不对：说原因，不能升级', /不是这台路由器的型号/.test(await page.textContent('#fwBody')) && await page.isDisabled('#fwGo') && !(await page.$('#fwKeep')));
		await page.screenshot({ path: path.join(SHOT, 'fwup-bad.png') });
		await page.click('#fwCancel'); await W(400);
		ok('换一个：回到选择文件', S.calls.some((c) => c.m === 'fw_up' && c.p.op === 'cancel') && await page.isVisible('label:has(#fwFile)'));
		await page.click('#fwReset'); await W(300);
		ok('恢复出厂、没有云端：先下载备份到手机', /下载到手机/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="true"]'); await W(600);
		ok('下载备份后：说后果（面板要重新安装）、要密码', S.calls.some((c) => c.m === 'sys_lbk') && /恢复出厂/.test(await page.textContent('.modal')) && /面板会被删掉/.test(await page.textContent('.modal')));
		await page.fill('#fwPw', 'right'); await page.click('.modal [data-ok]'); await W(400);
		ok('恢复出厂：带确认码和密码', S.calls.some((c) => c.m === 'factory_reset' && c.p.confirm === 'RESET' && c.p.pw === 'right') && /正在恢复出厂/.test(await page.textContent('#fwBody')));
		// 菜单
		await page.goto('http://localhost:8194/panel/?p=home'); await W(1200);
		ok('菜单「系统」里有「固件升级」', await page.evaluate(() => [...document.querySelectorAll('[data-p="fwup"]')].some((b) => /固件升级/.test(b.textContent))));
		await ctx.close();
	}
	await browser.close(); server.close(); fs.unlinkSync(IMG);
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

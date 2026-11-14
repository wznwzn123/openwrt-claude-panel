// v2.0.1：托管服务到期（系统操作里显示、快到期首页提示、输入续期码）、IP 检查（机房 IP 标记、IPv6、完整检测入口）
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const DAY = 86400e3; let SVC = { hosted: true, hub: 'https://hub.example', exp: Date.now() + 2.5 * DAY, off: false }; const calls = [];
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''); calls.push({ m, p: body.params });
		const R = (result) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })), E = (message) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message } }));
		if (m === 'svc_info') return R(SVC);
		if (m === 'svc_renew') { if (body.params.code !== 'RENEW23456') return E('续期码不对'); SVC = { ...SVC, exp: SVC.exp + 90 * DAY }; return R({ exp: SVC.exp, days: 90 }); }
		if (m === 'myip') return R({ domestic: { src: 'IPIP.net', ip: '36.1.2.3', geo: '中国 台湾 台北 中华电信' }, overseas: [{ src: 'IP.SB', ip: '45.1.2.3', geo: 'HK' }, { src: 'ip-api', ip: '45.1.2.3', geo: '香港 某云', kind: '机房 IP' }], v6: '2001:db8::1' });
		if (m === 'cloud_info') return R({ enabled: false });
		return R(respond(m, body.params || {})); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8155, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
	const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript(() => { try { localStorage.setItem('rp_token', 'testtokentesttokentest'); } catch (e) {} });
	await page.goto('http://localhost:8155/panel/'); await W(2500);
	ok('快到期（还剩 3 天以内）：首页最上面提示「托管服务还剩 3 天到期」，有「申请续期」按钮', await page.isVisible('#mSvc') && /还剩 3 天到期/.test(await page.textContent('#mSvcT')));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'svc-home.png') });
	await page.goto('http://localhost:8155/panel/?p=more'); await W(1800);
	ok('系统操作里有「托管服务」，显示到期日期和还剩几天', await page.isVisible('#svcBtn') && /到期 \d{4}-\d\d-\d\d（还剩 3 天）/.test(await page.textContent('#svcState')), await page.textContent('#svcState'));
	await page.click('#svcBtn'); await W(800);
	ok('托管服务弹窗：到期时间、去官网申请续期（链接到官网账号页）、输入续期码', /到期时间/.test(await page.textContent('.modal')) && (await page.getAttribute('.modal a.btn', 'href')) === 'https://hub.example/app' && await page.isVisible('.modal [data-code]'));
	await page.screenshot({ path: path.join(__dirname, 'shots', 'svc-sheet.png') });
	await page.click('.modal [data-code]'); await W(400);
	await page.locator('.modal').last().locator('input').fill('renew23456'.toUpperCase()); await page.locator('.modal').last().locator('button:has-text("确定"), [data-v="true"]').first().click(); await W(1000);
	ok('输入续期码：续上 90 天', calls.some((c) => c.m === 'svc_renew') && /还剩 93 天/.test(await page.textContent('#svcState')), await page.textContent('#svcState'));
	SVC = { hosted: true, hub: 'https://hub.example', exp: 0 };
	await page.reload(); await W(1800);
	ok('不限期：显示「不限期」，首页不提示', /不限期/.test(await page.textContent('#svcState')));
	SVC = { hosted: false };
	await page.reload(); await W(1800);
	ok('自建版：系统操作里没有「托管服务」', !(await page.isVisible('#svcBtn')));
	await page.goto('http://localhost:8155/panel/?p=home'); await W(3500);
	const ipt = await page.textContent('#ipList');
	ok('IP 检查：同一个 IP 只显示一行，标出「机房 IP」，显示中文归属地', (ipt.match(/45\.1\.2\.3/g) || []).length === 1 && /机房 IP/.test(ipt) && /香港 某云/.test(ipt), ipt);
	ok('IP 检查：显示 IPv6', /IPv6/.test(ipt) && /2001:db8::1/.test(ipt));
	ok('IP 检查：右上角有「完整检测」，打开 ipcheck.ing', (await page.getAttribute('#ncIp .ipfull', 'href')) === 'https://ipcheck.ing/');
	await page.locator('#ncIp').scrollIntoViewIfNeeded(); await W(300);
	await page.screenshot({ path: path.join(__dirname, 'shots', 'svc-ip.png') });
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

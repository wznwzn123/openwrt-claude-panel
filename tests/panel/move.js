// 6.0 第 29 项（面板）：换路由器——旧路由器打包、复制搬家码、重新打包要确认；新路由器粘贴搬家码 → 看要搬什么、旧路由器的网络设置（不搬）→ 确认后搬过来；
// 搬家码不对说原因；自建版给云端备份入口；320 / 390 / 430、深色不错位不横向滚动
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
let S;
const CODE = 'abcd2345-5ba1cafc822a2cf0226938ee8ff38749';
const fresh = (hosted = true) => ({ calls: [], n: 0, hosted });
function handle(m, p) {
	S.calls.push({ m, p });
	if (m === 'move_out') { S.n++; return { code: S.n === 1 ? CODE : 'zzzz2345-' + '1'.repeat(32), exp: Date.now() + 864e5, items: ['设备名字和图标', '设备归谁（家人的设备）', '不走代理的设备', '暂停上网和上网计划', '限速', '定时重启、定时关 Wi-Fi', '分流'] }; }
	if (m === 'move_in') {
		if (!/^[a-z2-9]{8}-[0-9a-f]{32}$/i.test(p.code)) throw new Error('搬家码不对：是旧路由器上「打包」后给的那一串');
		if (p.apply) return { ok: true, items: [], fam: p.fam ? 2 : 0, restart: true };
		return { from: '客厅的一台名字特别长的旧路由器 AX6000', items: ['设备名字和图标', '不走代理的设备', '暂停上网和上网计划'], off: 2, net: { wifi: ['MyHome', 'MyHome-5G-一个很长的名字'], lan: '192.168.1.1', wan: 'pppoe' }, here: { lan: '10.0.0.1', wan: 'dhcp' } };
	}
	const r = mock.respond(m, p);
	if (m === 'whoami') return { ...r, hosted: S.hosted };
	return r;
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (x) => (b += x)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); const m = body.method.replace(/^panel\//, ''); return setTimeout(() => { try { J({ jsonrpc: '2.0', id: body.id, result: handle(m, body.params || {}) }); } catch (e) { J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }, 80); }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const calls = (m, k) => S.calls.filter((c) => c.m === m && (!k || k(c.p)));
const layout = (page) => page.evaluate(() => {
	const bad = [];
	if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('横向滚动');
	document.querySelectorAll('#mvBody .kv, #mvBody .btn, #mvBody .pill, #mvBody .mvcode, #mvBody .input').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && (r.right > innerWidth - 8 || r.left < 8)) bad.push('出界：' + el.className + ' ' + el.textContent.slice(0, 12)); });
	document.querySelectorAll('#mvBody .btn').forEach((b) => { if (b.offsetParent && b.scrollWidth > b.clientWidth + 1) bad.push('按钮字截断：' + b.textContent); });
	document.querySelectorAll('#mvBody .kv').forEach((k) => { const a = k.firstElementChild, b = k.lastElementChild; if (a && b && a !== b && a.getBoundingClientRect().right > b.getBoundingClientRect().left + 1 && a.getBoundingClientRect().top === b.getBoundingClientRect().top) bad.push('重叠：' + k.textContent.slice(0, 16)); });
	return bad;
});
(async () => {
	await new Promise((r) => server.listen(8195, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S = fresh();
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8195' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_host', '1'); localStorage.setItem('rp_tour', '9'); });
		await page.goto('http://localhost:8195/panel/?p=move'); await W(1600);
		let t = await page.textContent('#mvBody');
		ok('两块：搬到新路由器、从旧路由器搬过来' + T, /搬到新路由器/.test(t) && /从旧路由器搬过来/.test(t) && (await page.isVisible('#mvOut')) && (await page.isVisible('#mvIn')), t.slice(0, 120));
		ok('标题是「换路由器」' + T, /换路由器/.test(await page.textContent('#title').catch(() => '')) || /换路由器/.test(await page.title()) || /换路由器/.test(await page.textContent('body')));
		// 打包
		await page.click('#mvOut'); await W(500);
		t = await page.textContent('#mvBody');
		ok('打包：显示搬家码、有效期、搬了什么' + T, (await page.textContent('#mvCode')) === CODE && /只能用一次/.test(t) && /设备名字和图标/.test(t) && /分流/.test(t) && /已打包/.test(await page.textContent('#toast')));
		let lay = await layout(page);
		ok('打包后不错位、不出界、不横向滚动' + T, !lay.length, lay.join('；'));
		await page.screenshot({ path: path.join(SHOT, `move-out-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		await page.click('#mvCopy'); await W(300);
		ok('复制搬家码' + T, (await page.evaluate(() => navigator.clipboard.readText())) === CODE && /已复制/.test(await page.textContent('#toast')));
		// 重新打包：确认
		await page.click('#mvOut'); await W(300);
		ok('重新打包前确认：之前的码不能再用' + T, /重新打包/.test(await page.textContent('.modal')) && /之前的搬家码不能再用/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="false"]'); await W(300);
		ok('取消：没重新打包' + T, calls('move_out').length === 1);
		await page.click('#mvOut'); await W(300); await page.click('.modal [data-v="true"]'); await W(500);
		ok('确认后换了新码' + T, calls('move_out').length === 2 && /zzzz2345/.test(await page.textContent('#mvCode')));
		// 新路由器：搬家码不对
		await page.click('#mvLook'); await W(300);
		ok('空着点查看：提示先输入' + T, /先输入搬家码/.test(await page.textContent('#toast')) && !calls('move_in').length);
		await page.fill('#mvIn', 'xyz'); await page.click('#mvLook'); await W(500);
		ok('搬家码不对：说原因' + T, /搬家码不对/.test(await page.textContent('#toast')) && !(await page.$('#mvApply')));
		await page.fill('#mvIn', CODE); await page.press('#mvIn', 'Enter'); await W(500);
		t = await page.textContent('#mvBody');
		ok('查看：来自哪台、搬什么、特色功能' + T, /客厅的一台名字特别长的旧路由器/.test(t) && /不走代理的设备/.test(t) && /关了 2 项/.test(t) && (await page.isVisible('#mvApply')), t.slice(0, 300));
		ok('旧路由器的网络设置：只给看，跟这台不一样的标出来' + T, /网络设置（不搬）/.test(t) && /MyHome、MyHome-5G/.test(t) && /192\.168\.1\.1/.test(t) && /这台：10\.0\.0\.1/.test(t) && /拨号/.test(t) && /这台：自动获取/.test(t));
		ok('家人一起转过来：默认打开' + T, await page.isChecked('#mvFam'));
		lay = await layout(page);
		ok('查看后不错位、不出界、不横向滚动' + T, !lay.length, lay.join('；'));
		await page.screenshot({ path: path.join(SHOT, `move-in-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		// 搬过来：确认
		await page.click('#mvApply'); await W(300);
		const mt = await page.textContent('.modal');
		ok('搬之前确认：标题写从哪台，正文写后果' + T, /从「客厅的一台名字特别长的旧路由器 AX6000」搬过来/.test(mt) && /同类设置会被替换/.test(mt) && /家人转到这台/.test(mt));
		const box = await page.evaluate(() => { const r = document.querySelector('.modal .sheet, .modal > div')?.getBoundingClientRect(); return r ? r.height / innerHeight : 0; });
		ok('确认框不占满屏幕' + T, box > 0 && box < 0.7, String(box));
		await page.screenshot({ path: path.join(SHOT, `move-confirm-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-v="false"]'); await W(300);
		ok('取消：没搬' + T, !calls('move_in', (p) => p.apply).length);
		if (w === 390) { await page.click('#mvFam'); await W(100); }
		await page.click('#mvApply'); await W(300); await page.click('.modal [data-v="true"]'); await W(600);
		const ap = calls('move_in', (p) => p.apply)[0];
		ok('搬过来：带搬家码和家人选项' + T, ap && ap.p.code === CODE && ap.p.fam === (w !== 390));
		ok('搬完：提示结果，回到空的输入框' + T, (w === 390 ? /已搬过来；分流要重启代理才生效/ : /已搬过来，家人 2 个；分流要重启代理才生效/).test(await page.textContent('#toast')) && (await page.inputValue('#mvIn')) === '' && !(await page.$('#mvApply')));
		await ctx.close();
	}
	// 自建版
	{
		S = fresh(false);
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（自建版）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_host', '0'); localStorage.setItem('rp_tour', '9'); });
		await page.goto('http://localhost:8195/panel/?p=move'); await W(1600);
		ok('自建版：说用云端备份，给入口', /自建版不能用搬家码/.test(await page.textContent('#mvBody')) && !(await page.$('#mvOut')));
		await page.screenshot({ path: path.join(SHOT, 'move-self.png') });
		await page.click('[data-go="cbk"]'); await W(800);
		ok('点了打开云端备份', await page.evaluate(() => document.querySelector('#p-cbk')?.classList.contains('on') || location.search.includes('cbk') || location.hash.includes('cbk')));
		await ctx.close();
	}
	// 搜索能找到
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_host', '1'); localStorage.setItem('rp_tour', '9'); });
		await page.goto('http://localhost:8195/panel/'); await W(1500);
		ok('菜单「工具」里有「换路由器」', await page.evaluate(() => [...document.querySelectorAll('[data-p="move"], [data-page="move"]')].length > 0 || document.body.innerHTML.includes('换路由器')));
		await ctx.close();
	}
	await browser.close(); server.close();
	let fail = 0;
	for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n${results.length - fail}/${results.length} 通过`);
	process.exit(fail ? 1 : 0);
})();

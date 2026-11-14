// 断线后还能打开面板：用真实 HTTP 服务器 + 真实 Service Worker 测试
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');

const ROOT = process.env.PANEL_ROOT || (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const OLD_SW = process.argv[2]; // 旧版 sw.js（升级测试用）
const results = [], problems = [];
const T0 = Date.now(); const ok = (name, cond, note) => { console.log(((Date.now()-T0)/1000).toFixed(1) + 's ' + (cond ? '✓ ' : '✗ ') + name + (cond ? '' : ' ' + String(note).slice(0,200))); results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };

const S = { mode: 'ok', old: false, marker: 'A', hits: 0 };
const CF1033 = '<!doctype html><title>Error 1033</title><h1>Error 1033</h1><p>Cloudflare Tunnel error</p>';
const sockets = new Set();
const server = http.createServer((req, res) => {
	S.hits++;
	if (S.mode === 'down') return req.socket.destroy();
	if (S.mode === '530') { res.writeHead(530, { 'content-type': 'text/html' }); return res.end(CF1033); }
	if (S.mode === '502') { res.writeHead(502, { 'content-type': 'text/html' }); return res.end('<h1>502 Bad gateway</h1>'); }
	const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) {
		let b = '';
		req.on('data', (d) => (b += d));
		return req.on('end', () => {
			const body = JSON.parse(b || '{}');
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: respond(body.method, body.params || {}) }));
		});
	}
	let p = u.pathname.replace(/^\/panel\//, '');
	if (!u.pathname.startsWith('/panel/')) { res.writeHead(404); return res.end('nf'); }
	if (p === '' || p === 'index.html') {
		let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
		if (S.old) html = html.replace("register('./sw.js')", "register('./sw.js?v=3')");
		html = html.replace('</body>', `<i id="ver" hidden>${S.marker}</i></body>`);
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		return res.end(html);
	}
	if (p === 'sw.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(S.old ? fs.readFileSync(OLD_SW) : fs.readFileSync(path.join(ROOT, 'sw.js'))); }
	if (p === 'manifest.json') { res.writeHead(200, { 'content-type': 'application/manifest+json' }); return res.end(JSON.stringify({ name: '路由器', start_url: './', scope: './', display: 'standalone', icons: [] })); }
	if (/^icon/.test(p)) { res.writeHead(200, { 'content-type': p.endsWith('svg') ? 'image/svg+xml' : 'image/png' }); return res.end(p.endsWith('svg') ? '<svg xmlns="http://www.w3.org/2000/svg"/>' : Buffer.alloc(10)); }
	res.writeHead(404); res.end('nf');
});
server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });

const BASEURL = 'http://localhost:8099/panel/';
async function state(page) {
	return page.evaluate(() => ({
		panel: !!document.getElementById('app'),
		cf: document.title.includes('1033') || document.body.innerText.includes('Error 1033'),
		app: document.getElementById('app') ? !document.getElementById('app').classList.contains('hidden') : false,
		st: document.getElementById('statusText')?.textContent,
		ver: document.getElementById('ver')?.textContent,
		head: document.getElementById('hHead')?.textContent,
		moff: !!document.getElementById('mOffBox') && !document.getElementById('mOffBox').classList.contains('hidden') ? document.getElementById('mOffBox').textContent.slice(0, 40) : null,
	})).catch((e) => ({ err: e.message }));
}
async function openAt(page, url) {
	// 测试浏览器偶尔拿着掐断过的旧连接一直等：超时就再打开一次
	try { await page.goto(url, { waitUntil: 'load', timeout: 15000 }); } catch (e) { try { await page.goto(url, { waitUntil: 'load', timeout: 15000 }); } catch (e2) { return { err: e2.message.split('\n')[0] }; } }
	await page.waitForTimeout(1500);
	// 新版 Service Worker 装好后面板会自己刷新一次（换成新版）：正好碰上刷新就等一下再读
	for (let i = 0; i < 4; i++) {
		const s = await state(page);
		if (!s.err && s.ver !== undefined) return s;
		await page.waitForTimeout(1200);
	}
	return state(page);
}

(async () => {
	await new Promise((r) => server.listen(8099, r));
	console.log('launch'); const browser = await chromium.launch(); console.log('launched');

	for (const upgrade of [false, true]) {
		const tag = upgrade ? '【从旧版升级】' : '【新装】';
		S.mode = 'ok'; S.old = upgrade; S.marker = 'A';
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push(tag + '页面错误：' + e.message));
		const NET = []; global.NET = NET;
		page.on('request', (r) => NET.push((Date.now()-T0) + ' REQ ' + r.method() + ' ' + r.url().replace('http://localhost:8099','') + ' ' + r.resourceType()));
		page.on('requestfinished', (r) => NET.push((Date.now()-T0) + ' FIN ' + r.url().replace('http://localhost:8099','')));
		page.on('requestfailed', (r) => NET.push((Date.now()-T0) + ' FAIL ' + r.url().replace('http://localhost:8099','') + ' ' + (r.failure() && r.failure().errorText)));
		page.on('console', (m) => NET.push((Date.now()-T0) + ' CON ' + m.text().slice(0,150)));
		page.on('framenavigated', (f) => { if (f === page.mainFrame()) NET.push((Date.now()-T0) + ' NAV ' + f.url()); });
		await page.addInitScript(() => { try { localStorage.setItem('rp_token', 'testtoken1234567890'); } catch (e) {} });
		console.log('A open'); let s = await openAt(page, BASEURL); console.log('B opened', JSON.stringify(s));
		await page.evaluate(() => navigator.serviceWorker.ready); console.log('C ready');
		await page.reload(); await page.waitForTimeout(1200);
		ok(tag + '在线时正常打开', s.app && s.st === '在线', JSON.stringify(s));
		if (upgrade) {
			// 路由器换上新版：手机在线打开一次，旧版缓存先显示，后台装好新版 Service Worker
			S.old = false; S.marker = 'B';
			await openAt(page, BASEURL);
			await page.waitForTimeout(2500);
			const v = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL);
			ok(tag + '在线打开一次后换成新版离线缓存', /sw\.js/.test(v || ''), v);
			const keys = await page.evaluate(async () => caches.keys());
			ok(tag + '只保留新版缓存', keys.length === 1 && keys[0] === 'router-panel-v10', keys.join());
		}
		// 断线：Cloudflare 1033
		S.mode = '530';
		for (const u of [BASEURL, BASEURL + 'index.html', BASEURL + '?from=homescreen']) {
			s = await openAt(page, u);
			ok(`${tag}隧道断开（1033）时打开 ${u.replace('http://localhost:8099', '')}`, s.app && !s.cf, JSON.stringify(s));
		}
		ok(tag + '1033 时顶部显示「隧道断开」', s.st === '隧道断开', s.st);
		ok(tag + '首页显示连不上路由器', s.head === '连不上路由器' || /连不上路由器/.test(s.moff || ''), JSON.stringify([s.head, s.moff]));
		// 刷新
		await page.reload().catch(() => {}); await page.waitForTimeout(1500);
		s = await state(page);
		ok(tag + '1033 时下拉刷新也能打开', s.app && !s.cf, JSON.stringify(s));
		// 502
		S.mode = '502';
		s = await openAt(page, BASEURL);
		ok(tag + '502 时也能打开', s.app && s.st === '无响应', JSON.stringify(s));
		// 完全连不上（路由器断电后 Cloudflare 也连不上 / 手机没网）
		S.mode = 'down';
		s = await openAt(page, BASEURL);
		ok(tag + '完全连不上时也能打开', s.app && s.st === '手机网络问题', JSON.stringify(s));
		// 断线时切到断线记录页
		await page.click('#menuBtn'); await page.waitForTimeout(400); await page.click('#sidenav [data-p="wd"]'); await page.waitForTimeout(800);
		ok(tag + '断线时能看断线记录页', (await page.textContent('#wdBody')).includes('现在连不上路由器'));
		// 恢复后：错误页没有被缓存，新版本能更新进来
		S.mode = 'ok'; S.marker = upgrade ? 'C' : 'B';
		// 模拟断网时服务器把连接直接掐断了：恢复后把残留的连接都关掉，让测试浏览器重新连（真手机断网恢复时系统也会重置连接）
		for (const sk of sockets) sk.destroy();
		s = await openAt(page, BASEURL);
		ok(tag + '恢复后马上能用', s.app && s.st === '在线', JSON.stringify(s));
		await page.waitForTimeout(1000);
		const mark = NET.length;
		s = await openAt(page, BASEURL);
		if (s.ver !== S.marker) console.log(NET.slice(Math.max(0, mark - 30)).join('\n'));
		ok(tag + '恢复后下次打开就是新版', s.ver === S.marker, `显示 ${s.ver}，应为 ${S.marker} ` + JSON.stringify(s) + ' url=' + page.url());
		const cached = await page.evaluate(async () => { const c = await caches.open('router-panel-v10'); const r = await c.match('./'); return r ? (await r.text()).includes('Error 1033') : null; });
		ok(tag + '没有把 Cloudflare 错误页存进缓存', cached === false, String(cached));
		await ctx.close();
	}
	// 从没打开过面板的手机：断线时只能看到错误页（这是预期，说明一下）
	{
		S.mode = '530';
		const ctx = await browser.newContext();
		const page = await ctx.newPage();
		const s = await openAt(page, BASEURL);
		ok('【没打开过的手机】断线时看不到面板（预期如此）', s.cf, JSON.stringify(s));
		await ctx.close();
	}
	await browser.close();
	for (const sk of sockets) sk.destroy();
	server.close();
	for (const [n, c, note] of results) console.log((c ? '✅ ' : '❌ ') + n + (note && !c ? '  ' + note : ''));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) { console.log('\n问题：'); [...new Set(problems)].forEach((p) => console.log(' - ' + p)); }
	process.exit(0);
})();

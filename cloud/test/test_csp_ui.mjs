// 6.0 第 8 项：官网内容安全策略（CSP）——脚本只放行本站文件和打包时算好摘要的内联脚本，不再放行「随便哪段内联脚本」
// 真浏览器把官网每一页（含登录后的账号页、账号设置、弹窗）都打开一遍：一条都不能被拦；再验证外来的内联脚本确实跑不起来
// 用法：node test/test_csp_ui.mjs
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => { const u = new URL(typeof input === 'string' ? input : input.url); if (u.hostname === 'localhost') return realFetch(input, init); if (u.hostname === 'api.github.com') return new Response(JSON.stringify([{ tag_name: 'v5.2.3', name: '5.2.3', body: '- 修好了', published_at: '2026-11-20T00:00:00Z' }])); return new Response('{}'); };
const env = { OLD_ADMIN: '1', BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const H = env.H.get('hub');
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const r = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
	const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) h['set-cookie'] = sc;
	res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8193, z));
const B = 'http://localhost:8193';
const W = (ms) => new Promise((z) => setTimeout(z, ms));
// 1. 响应头：脚本不再放行 'unsafe-inline'；每页都带摘要；有上报地址
const PAGES = ['/', '/app', '/privacy', '/security', '/notice', '/terms', '/changelog', '/status', '/help', '/r', '/admin/old'];
for (const p of PAGES) {
	const r = await realFetch(B + p), csp = r.headers.get('content-security-policy') || '';
	const ss = (/script-src ([^;]*)/.exec(csp) || [])[1] || '';
	ok('响应头 ' + p + '：脚本不放行任意内联脚本，只认本站和摘要', r.status === 200 && !/unsafe-inline|unsafe-eval/.test(ss) && /'sha256-[A-Za-z0-9+/=]{44}'/.test(ss) && /report-uri \/api\/csp/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp), csp.slice(0, 300));
}
// 2. 真浏览器：每页打开、点一点，一条都不能被拦
const browser = await chromium.launch();
const bad = [];
const watch = (p, tag) => {
	p.on('console', (m) => { if (/Content Security Policy|Refused to (execute|load|apply|connect)/i.test(m.text())) bad.push(tag + '：' + m.text().slice(0, 200)); });
	p.on('pageerror', (e) => bad.push(tag + ' 页面出错：' + e.message.slice(0, 160)));
};
for (const [w, h] of [[390, 844], [1280, 860]]) {
	const T = '［' + w + '］';
	const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 });
	await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.log('Content Security Policy violation: ' + e.violatedDirective + ' ' + e.blockedURI)));
	const p = await ctx.newPage(); watch(p, T); p.on('dialog', (d) => d.accept());
	for (const pg of PAGES) {
		await p.goto(B + pg).catch(async () => { await W(500); await p.goto(B + pg); }); await W(900);
		await p.mouse.wheel(0, 2000); await W(400); // 滚动触发动效组件按需加载
		if (w < 900 && (await p.$('.nav__toggle'))) { await p.click('.nav__toggle').catch(() => {}); await W(300); await p.click('.nav__toggle').catch(() => {}); }
	}
	// 登录后的账号页、账号设置、弹窗
	await p.goto(B + '/app#reg'); await W(700);
	await p.fill('#fReg [name=email]', 'csp' + w + '@x.com'); await p.fill('#fReg [name=password]', 'pass-csp-1234'); await p.click('#fReg button.primary'); await W(1600);
	await p.click('#setBtn').catch(() => {}); await W(700);
	await p.click('#meEdit').catch(() => {}); await W(400);
	await p.keyboard.press('Escape'); await p.click('.mask [data-x]').catch(() => {}); await W(300);
	await p.goto(B + '/security'); await W(800);
	ok('官网每一页（含登录后的账号页、设置、弹窗）都没有被内容安全策略拦下的东西' + T, !bad.length, bad.slice(0, 6).join('\n'));
	bad.length = 0;
	// 3. 外来的内联脚本跑不起来（模拟页面被插进一段坏脚本）
	await p.goto(B + '/help'); await W(600);
	const ran = await p.evaluate(async () => { window.__x = 0; const s = document.createElement('script'); s.textContent = 'window.__x = 1'; document.body.appendChild(s); await new Promise((z) => setTimeout(z, 200)); return window.__x; });
	ok('插进来的内联脚本跑不起来（被拦下）' + T, ran === 0);
	const ran2 = await p.evaluate(async () => { window.__y = 0; const d = document.createElement('div'); d.innerHTML = '<img src="x" onerror="window.__y=1">'; document.body.appendChild(d); await new Promise((z) => setTimeout(z, 400)); return window.__y; });
	ok('插进来的 onerror= 这类内联事件也跑不起来' + T, ran2 === 0);
	await W(300); await ctx.close(); bad.length = 0; // 上面是故意插的坏脚本，被拦是对的，不算进下一轮
}
await browser.close();
// 4. 上报：记进出错记录；每小时最多 30 条
await W(300);
const el0 = (await H.errList()).filter((x) => /^CSP/.test(x.path)).length;
ok('浏览器上报的拦截记进了后台「出错记录」（刚才模拟的坏脚本）', el0 >= 1, JSON.stringify((await H.errList()).slice(0, 3)));
for (let i = 0; i < 40; i++) await realFetch(B + '/api/csp', { method: 'POST', headers: { 'content-type': 'application/csp-report' }, body: JSON.stringify({ 'csp-report': { 'document-uri': B + '/help?x=1', 'violated-directive': 'script-src-elem', 'blocked-uri': 'inline' } }) });
const el1 = (await H.errList()).filter((x) => /^CSP/.test(x.path)).length;
ok('上报有上限：每小时最多记 30 条（防止被刷）', el1 === 30, String(el1));
const big = await realFetch(B + '/api/csp', { method: 'POST', headers: { 'content-type': 'application/csp-report' }, body: 'x'.repeat(20000) });
ok('太大的上报不处理', big.status === 204);
server.close();
console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 600) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
process.exit(results.every((r) => r[1]) ? 0 : 1);

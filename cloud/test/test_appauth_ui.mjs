// 6.0 第 71 项（官网账号页，真浏览器）：App 6.0 里只显示「用官网登录」「用登录着的手机扫码」（没有密码框）；
// 浏览器打开 /app?ok=编号：没登录先登录，登录后弹「允许 App 登录」，看清设备，允许 / 拒绝；App 那边自动登录进去
// 需要 Playwright：node test/test_appauth_ui.mjs [--shots 目录]
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => { const url = typeof input === 'string' ? input : input.url; if (new URL(url).hostname === 'localhost') return realFetch(input, init); return new Response(JSON.stringify({ success: true, result: {}, errors: [] })); };
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const r = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
	const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) h['set-cookie'] = sc;
	res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8136, z));
const B = 'http://localhost:8136';
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const APPUA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 RouterPanelApp/6.0.0';
const browser = await chromium.launch();
// 先在浏览器里注册一个账号
const web = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: APPUA.replace(' RouterPanelApp/6.0.0', '') });
const wp = await web.newPage(); const werr = []; wp.on('pageerror', (x) => werr.push(x.message));
await wp.goto(B + '/app#reg'); await W(700);
await wp.fill('#fReg [name=email]', 'alice@x.com'); await wp.fill('#fReg [name=password]', 'pass-alic-1234'); await wp.click('#fReg button.primary'); await W(1500);
ok('浏览器里注册登录照常', await wp.isVisible('#vDash'));
for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
	const T = `（${w}${dark ? ' 深色' : ''}）`;
	const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, userAgent: APPUA, colorScheme: dark ? 'dark' : 'light' });
	const ap = await ctx.newPage(); const errs = []; ap.on('pageerror', (x) => errs.push(x.message));
	await ap.goto(B + '/app'); await W(1200);
	ok('App 里：只有「用官网登录」和扫码，没有密码框' + T, (await ap.isVisible('#lgApp')) && (await ap.isVisible('#apGo')) && (await ap.isVisible('#apQrBtn')) && !(await ap.isVisible('#fLogin [name=password]')) && !(await ap.isVisible('#lgWelcome')));
	const href = await ap.getAttribute('#apGo', 'href');
	ok('「用官网登录」是 /app?ok=编号' + T, /\/app\?ok=[a-z2-9]{8}$/.test(href), href);
	const lay = await ap.evaluate(() => { const bad = []; if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('横向滚动'); document.querySelectorAll('#lgApp .lgbig, #lgApp h1, #lgApp p').forEach((e) => { const r = e.getBoundingClientRect(); if (r.width && (r.right > innerWidth - 8 || r.left < 8)) bad.push('出界：' + e.textContent.slice(0, 10)); if (e.scrollWidth > e.clientWidth + 1) bad.push('截断：' + e.textContent.slice(0, 10)); }); return bad; });
	ok('不错位、不出界' + T, !lay.length, lay.join('；'));
	if (SHOTS) await ap.screenshot({ path: `${SHOTS}/appauth-${w}${dark ? '-dark' : ''}.png` });
	await ap.click('#apQrBtn'); await W(800);
	ok('扫码：显示二维码' + T, (await ap.locator('#apQr svg').count()) === 1 && /扫码确认/.test(await ap.textContent('#apMsg')));
	const qb = await ap.evaluate(() => { const r = document.getElementById('apQr').getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0 && r.width >= 150; });
	ok('二维码放得下' + T, qb);
	if (SHOTS) await ap.screenshot({ path: `${SHOTS}/appauth-qr-${w}${dark ? '-dark' : ''}.png`, fullPage: true });
	// 浏览器里确认
	await wp.goto(B + href.replace(/^https?:\/\/[^/]+/, '')); await W(1200);
	const mt = await wp.textContent('.mask').catch(() => '');
	ok('浏览器：弹「允许 App 登录」，写设备和时间' + T, /允许 App 登录/.test(mt) && /路由器面板 App/.test(mt) && /刚刚|分钟前/.test(mt) && /不是你自己点的，就拒绝/.test(mt), mt);
	if (SHOTS && w === 390) await wp.screenshot({ path: `${SHOTS}/appauth-ok.png` });
	if (w === 430) {
		await wp.click('.mask [data-no]'); await W(600);
		ok('拒绝' + T, /已拒绝/.test(await wp.textContent('.mask')));
		await W(2600);
		ok('App 那边写「已拒绝」，再要一个新码' + T, !(await ap.isVisible('#vDash')));
		await wp.click('.mask [data-x]').catch(() => {});
	} else {
		await wp.click('.mask [data-ok]'); await W(600);
		const dt = await wp.textContent('.mask');
		ok('允许：安卓上给「回到 App」' + T, /已允许/.test(dt) && (await wp.getAttribute('.mask a.btn', 'href')) === 'routerpanel://auth', dt);
		await wp.evaluate(() => document.querySelector('.mask')?.remove());
		await W(3000);
		ok('App 自动登录进去' + T, await ap.isVisible('#vDash'), await ap.textContent('body').then((x) => x.slice(0, 120)));
		ok('网址里不留编号' + T, !/ok=/.test(wp.url()));
	}
	ok('没有脚本报错' + T, !errs.length, errs.join('；'));
	await ctx.close();
}
// 没登录的浏览器打开 /app?ok=：先登录，提示是在确认 App 登录
{
	const ctx = await browser.newContext({ userAgent: APPUA, viewport: { width: 390, height: 844 } }); const ap = await ctx.newPage();
	await ap.goto(B + '/app'); await W(1200);
	const href = await ap.getAttribute('#apGo', 'href');
	const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p2 = await c2.newPage();
	await p2.goto(B + href.replace(/^https?:\/\/[^/]+/, '')); await W(1200);
	ok('没登录：先登录，提示在确认 App 登录', /登录后确认 App 登录/.test(await p2.textContent('#vAuth')));
	await p2.fill('#fLogin [name=email]', 'alice@x.com'); await p2.fill('#fLogin [name=password]', 'pass-alic-1234'); await p2.click('#fLogin button.primary'); await W(1800);
	ok('登录后弹确认', /允许 App 登录/.test(await p2.textContent('.mask').catch(() => '')));
	await c2.close(); await ctx.close();
}
ok('浏览器那边没有脚本报错', !werr.length, werr.join('；'));
await browser.close(); server.close();
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

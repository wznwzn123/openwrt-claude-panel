// 6.0 第 94 项（官网「我的路由器」，真浏览器）：本地版的标签、第一次打开面板先说要连着家里 Wi-Fi、
// 换版本（先确认本人、说清楚后果）、等路由器执行 / 失败在哪一步
// 需要 Playwright：node test/test_edition_ui.mjs [--shots 目录]
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (u.hostname === 'localhost') return realFetch(input, init);
	if (u.hostname === 'api.cloudflare.com') { const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] })); if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 't' + Math.random(), token: 'tok' }); if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'd' + Math.random() }); return R({}); }
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const S = () => env.H.get('hub').ctx.storage;
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const r = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
	const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) h['set-cookie'] = sc;
	res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8134, z));
const B = 'http://localhost:8134';
const api = async (path, body, hdr = {}) => (await realFetch(B + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const inv = (await api('/api/admin/invites', { direct: true, max: 9 }, ADM)).invite.code;
const browser = await chromium.launch();
for (const [w, h] of [[320, 700], [390, 844], [1280, 860]]) {
	const T = '［' + w + '］';
	const R = await api('/api/register', { invite: inv, name: 'Home', model: 'Xiaomi AX3000T', local: true });
	await env.W.get('dev:' + R.sub).ctx.storage.put('r', { last: Date.now(), rep: { ver: '6.0.0', ed: 'local', lan: '192.168.6.1:906' } });
	const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 });
	const page = await ctx.newPage(); const errs = []; page.on('pageerror', (x) => errs.push(x.message));
	let jumped = '';
	await ctx.route('http://192.168.6.1:906/**', (rt) => { jumped = rt.request().url(); rt.fulfill({ status: 200, body: 'panel' }); });
	await page.goto(B + '/app#reg'); await W(700);
	await page.fill('#fReg [name=email]', 'a' + w + '@x.com'); await page.fill('#fReg [name=password]', 'pass-a' + w + '-1234'); await page.click('#fReg button.primary'); await W(1500);
	if (!(await page.isVisible('#fBind [name=code]'))) await page.click('.oldpair summary');
	await page.fill('#fBind [name=code]', (await api('/api/pair/start', { sub: R.sub, rkey: R.rkey })).code); await page.click('#fBind button'); await W(1200);
	if (await page.isVisible('.mask')) { await page.click('.mask [data-x]'); await W(300); }
	await page.reload(); await W(1500);
	const card = page.locator(`[data-sub="${R.sub}"]`);
	const ct = await card.textContent();
	ok('卡片上标「本地版」' + T, /本地版/.test(ct), ct.slice(0, 200));
	ok('主账号有「换版本」' + T, await card.locator('[data-ed]').isVisible());
	ok('不横向滚动' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/ed-card-${w}.png`, fullPage: w < 900 });
	// 第一次打开面板：先说要连着家里的 Wi-Fi
	await card.locator('[data-open]').click(); await W(500);
	const hint = await page.locator('.mask').textContent().catch(() => '');
	ok('第一次打开：先说本地版只能在家里打开' + T, /本地版只能在家里打开/.test(hint) && /家里的 Wi-Fi/.test(hint), hint);
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/ed-hint-${w}.png` });
	await page.click('.mask [data-ok]'); await W(1500);
	jumped = page.url();
	ok('点「打开面板」：跳到家里局域网的地址，带一次性的票' + T, /^http:\/\/192\.168\.6\.1:906\/panel\/#open=[a-z2-9]{24}$/.test(jumped), jumped);
	await page.goto(B + '/app'); await W(1500); jumped = '';
	await page.locator(`[data-sub="${R.sub}"] [data-open]`).click(); await W(1500);
	jumped = page.url();
	ok('第二次打开：不再提示，直接跳' + T, /^http:\/\/192\.168\.6\.1:906\/panel\/#open=/.test(jumped), jumped);
	// App 里「换成 AI 版」打开 /app?ed=local：登录后直接弹换版本，选好 AI 版（用户 11/28 17:32）
	await page.goto(B + '/app?ed=local'); await W(1800);
	const ab = page.locator('.mask .card');
	ok('?ed=local：直接弹换版本，选好 AI 版' + T, (await ab.count()) === 1 && /本地版（现在）/.test(await ab.textContent()) && await ab.locator('input[value=ai]').isChecked() && (await ab.locator('[data-ok]').textContent()) === '换成 AI 版' && !(await ab.locator('[data-ok]').isDisabled()));
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/ed-ask-${w}.png` });
	await page.reload(); await W(1500);
	ok('同一次只弹一回（刷新不再弹）' + T, (await page.locator('.mask').count()) === 0);
	await page.goto(B + '/app'); await W(1500);
	// 换版本
	await page.locator(`[data-sub="${R.sub}"] [data-ed]`).click(); await W(400);
	const box = page.locator('.mask .card');
	ok('换版本：现在的版本点不了、按钮先不能点' + T, /本地版（现在）/.test(await box.textContent()) && await box.locator('input[value=local]').isDisabled() && await box.locator('[data-ok]').isDisabled());
	await box.locator('label:has(input[value=ai])').click(); await W(200);
	ok('选 AI 版：按钮写「换成 AI 版」、说清楚要下载隧道程序、没装上自动退回' + T, (await box.locator('[data-ok]').textContent()) === '换成 AI 版' && /下载隧道程序/.test(await box.textContent()) && /自动退回本地版/.test(await box.textContent()));
	const bb = await box.boundingBox();
	ok('换版本的框在屏幕里' + T, bb && bb.x >= 0 && bb.x + bb.width <= w + 1 && bb.y >= 0 && bb.y + bb.height <= h + 1);
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/ed-box-${w}.png` });
	await box.locator('[data-ok]').click(); await W(800);
	ok('没确认过本人：先要邮箱验证码' + T, /先确认是你本人/.test(await page.locator('.mask').last().textContent()));
	await page.locator('.mask [data-c]').fill('123456'); await page.locator('.mask [data-ok]').last().click(); await W(1500);
	const ct2 = await page.locator(`[data-sub="${R.sub}"]`).textContent();
	ok('发出去以后：卡片上显示「正在换成 AI 版：等路由器执行」' + T, /正在换成 AI 版：等路由器执行/.test(ct2), ct2.slice(0, 300));
	const cmd = (await env.W.get('dev:' + R.sub).getCfg()).cmd;
	ok('指令记下来等路由器心跳带走' + T, cmd && cmd.to === 'ai');
	// 路由器报失败
	await api('/api/dev/edres', { sub: R.sub, rkey: R.rkey, id: cmd.id, to: 'ai', ok: false, step: 'space', why: '闪存只剩 5 MB，放不下隧道程序（约 30 MB）' });
	await page.reload(); await W(1500);
	const ct3 = await page.locator(`[data-sub="${R.sub}"]`).textContent();
	ok('失败：卡片上说「没成功（路由器空间不够）」和原因、已退回' + T, /换成 AI 版没成功（路由器空间不够）/.test(ct3) && /闪存只剩 5 MB/.test(ct3) && /已退回原来的版本/.test(ct3), ct3.slice(0, 300));
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/ed-fail-${w}.png`, fullPage: w < 900 });
	// 用户 11/28 17:14：在外面换成 AI 版以后页面还写着本地版，「本地版」点不了，换不回去
	// 等路由器执行时：再点「换版本」直接说在等；路由器换好以后页面自己刷新（不用手动刷新），能换回本地版
	await page.locator(`[data-sub="${R.sub}"] [data-ed]`).click(); await W(400);
	await page.locator('.mask .card label:has(input[value=ai])').click(); await page.locator('.mask .card [data-ok]').click(); await W(1500);
	const cmd2 = (await env.W.get('dev:' + R.sub).getCfg()).cmd;
	await page.locator(`[data-sub="${R.sub}"] [data-ed]`).click(); await W(400);
	const tw = await page.locator('#toast').textContent().catch(() => '');
	ok('等路由器执行时再点「换版本」：说正在换、不弹框' + T, cmd2 && cmd2.id !== cmd.id && /正在换成 AI 版：等路由器做完再换/.test(tw) && !(await page.locator('.mask').count()), tw);
	await api('/api/dev/edition', { sub: R.sub, rkey: R.rkey, to: 'ai' });
	await api('/api/dev/edres', { sub: R.sub, rkey: R.rkey, id: cmd2.id, to: 'ai', ok: true });
	await env.W.get('dev:' + R.sub).ctx.storage.put('r', { last: Date.now(), rep: { ver: '6.0.0', ed: 'ai' } });
	await W(9500);
	const tok = await page.locator('#toast').textContent().catch(() => '');
	const ct4 = await page.locator(`[data-sub="${R.sub}"]`).textContent();
	ok('路由器换好：不用刷新，提示「已换成 AI 版」，卡片上没有「正在换」' + T, /已换成 AI 版/.test(tok) && !/正在换成/.test(ct4), tok + ' | ' + ct4.slice(0, 200));
	await page.locator(`[data-sub="${R.sub}"] [data-ed]`).click(); await W(400);
	const box2 = page.locator('.mask .card');
	ok('换好以后能换回本地版' + T, /AI 版（现在）/.test(await box2.textContent()) && !(await box2.locator('input[value=local]').isDisabled()) && await box2.locator('input[value=ai]').isDisabled());
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/ed-back-${w}.png` });
	ok('没有页面错误' + T, !errs.length, errs.join(' | '));
	await ctx.close();
}
await browser.close(); server.close();
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + note)); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

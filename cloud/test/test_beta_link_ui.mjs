// 自建版申请尝鲜：路由器面板带着关联码打开 /app?bl=关联码，没登录先登录，登录后弹「关联尝鲜申请」，点「关联」（真浏览器）
// 需要 Playwright：node test/test_beta_link_ui.mjs [--shots 目录]
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
await new Promise((z) => server.listen(8137, z));
const B = 'http://localhost:8137';
const api = async (path, body, hdr = {}) => (await realFetch(B + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const browser = await chromium.launch();
const LK = 'abcdefghijkmnpqrstuvwxyz';
for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [1280, 860, false]]) {
	const T = '［' + w + (dark ? ' 深色' : '') + '］';
	const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900, colorScheme: dark ? 'dark' : 'light' });
	const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
	const lk = LK.slice(0, 20) + String(w).padStart(4, 'x').replace(/[01]/g, 'z');
	await p.goto(B + '/app?bl=' + lk); await W(1200);
	ok('没登录：登录框上写着登录后关联尝鲜申请' + T, /登录后关联尝鲜申请/.test(await p.textContent('#vAuth')));
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/bl-login-${w}${dark ? '-d' : ''}.png` });
	const email = 'u' + w + '@x.com';
	await p.click('[data-tab="reg"]').catch(() => {}); await W(300);
	await p.fill('#fReg [name=email]', email); await p.fill('#fReg [name=password]', 'pass-u' + w + '-1234'); await p.click('#fReg button.primary');
	await p.waitForSelector('.mask', { timeout: 8000 }).catch(() => {}); await W(300);
	const mt = await p.textContent('.mask').catch(() => '');
	ok('登录后：弹「关联尝鲜申请」 说清楚结果发到账号邮箱' + T, /关联尝鲜申请/.test(mt) && /审核结果发到这个账号的邮箱/.test(mt), mt);
	const box = await p.locator('.mask .card').boundingBox();
	ok('弹窗在屏幕里 不横向滚动' + T, box && box.x >= 0 && box.x + box.width <= w + 1 && (await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)));
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/bl-box-${w}${dark ? '-d' : ''}.png` });
	await p.click('.mask [data-ok]'); await W(800);
	const uid = await S().get('e:' + email), l = await S().get('blk:' + lk);
	ok('点「关联」：官网记下关联码对应这个账号' + T, l && l.uid === uid);
	ok('关联后：显示打码的邮箱 说回到面板点申请' + T, /已关联/.test(await p.textContent('.mask')) && new RegExp(email.slice(0, 2).replace('.', '\\.') + '\\*\\*\\*@x\\.com').test(await p.textContent('.mask')) && /回到路由器面板点「申请」/.test(await p.textContent('.mask')), await p.textContent('.mask'));
	ok('地址栏里的关联码清掉了' + T, !/bl=/.test(p.url()));
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/bl-done-${w}${dark ? '-d' : ''}.png` });
	ok('页面没报错' + T, !errs.length, errs.join(' | '));
	await c.close();
}
// 链接不完整
{
	const c = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage();
	await p.goto(B + '/app#reg'); await W(600);
	await p.fill('#fReg [name=email]', 'bad@x.com'); await p.fill('#fReg [name=password]', 'pass-bad-1234'); await p.click('#fReg button.primary'); await W(1500);
	await p.goto(B + '/app?bl=short'); await p.waitForSelector('.mask', { timeout: 8000 }).catch(() => {});
	ok('关联码不完整：说回面板重新点 没有「关联」按钮', /链接不完整/.test(await p.textContent('.mask').catch(() => '')) && !(await p.$('.mask [data-ok]')));
	await c.close();
}
// 升级提醒邮件里的「不再提醒这台路由器」：/app?ovoff=专属网址编号，主账号登录后确认（用户 11/27）
{
	const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p = await c.newPage();
	const errs = []; p.on('pageerror', (e) => errs.push(e.message));
	await p.goto(B + '/app?ovoff=ovtestaa'); await W(1000);
	ok('[不再提醒] 没登录：登录框上写着用主账号登录后关掉', /用路由器主账号登录后关掉升级提醒/.test(await p.textContent('#vAuth')));
	await p.click('[data-tab="reg"]').catch(() => {}); await W(300);
	await p.fill('#fReg [name=email]', 'ov@x.com'); await p.fill('#fReg [name=password]', 'pass-ov-12345'); await p.click('#fReg button.primary');
	await p.waitForSelector('.mask', { timeout: 8000 }).catch(() => {});
	ok('[不再提醒] 不是这台的主账号：说关不了', /关不了升级提醒/.test(await p.textContent('.mask').catch(() => '')) && /只有这台路由器的主账号/.test(await p.textContent('.mask').catch(() => '')));
	await p.click('.mask [data-no]'); await W(300);
	const uid = await S().get('e:ov@x.com');
	await S().put('d:ovtestaa', { sub: 'ovtestaa', state: 'ok', name: '客厅路由器', owner: uid, users: [uid] });
	await p.goto(B + '/app?ovoff=ovtestaa'); await p.waitForSelector('.mask', { timeout: 8000 }).catch(() => {});
	const t = await p.textContent('.mask').catch(() => '');
	ok('[不再提醒] 主账号：确认框写着路由器名字和后果', /不再提醒「客厅路由器」升级/.test(t) && /打开面板时照样会提示更新/.test(t), t);
	await W(700); if (SHOTS) await p.screenshot({ path: `${SHOTS}/ovoff-box-390.png` });
	await p.click('.mask [data-ok]'); await W(800);
	ok('[不再提醒] 点了：官网记下 不再提醒', !!(await S().get('ovoff:ovtestaa')) && /已关掉升级提醒/.test(await p.textContent('.mask')));
	await p.goto(B + '/app?ovoff=ovtestaa'); await p.waitForSelector('.mask', { timeout: 8000 }).catch(() => {});
	ok('[不再提醒] 再点一次链接：说已经关了', /已经关了/.test(await p.textContent('.mask').catch(() => '')));
	ok('[不再提醒] 页面没报错', !errs.length, errs.join(' | '));
	await c.close();
}
await browser.close(); server.close();
console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 300) + '）')).join('\n'));
const pass = results.filter((r) => r[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

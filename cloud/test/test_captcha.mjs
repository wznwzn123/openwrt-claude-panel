// 6.0 第 66 项：人机验证（平时不要，可疑时才要）+ 后台「受攻击模式」（官网自己的，路由器接口不受影响）
// 用法：node test/test_captcha.mjs [--shots 目录]
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
const realFetch = globalThis.fetch;
const VER = [];
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (u.hostname === 'localhost') return realFetch(input, init);
	if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') { const p = new URLSearchParams(String(init.body)); VER.push(Object.fromEntries(p)); return new Response(JSON.stringify({ success: p.get('response') === 'tok-ok' && p.get('secret') === 'ts-secret' })); }
	const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] }));
	if (u.hostname === 'api.cloudflare.com') { if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 't' + Math.random(), token: 'tok' }); if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'd' + Math.random() }); return R({}); }
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '', TURNSTILE_SITE: '0x4AAAAAAATEST', TURNSTILE_SECRET: 'ts-secret' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const H = env.H.get('hub');
const call = async (path, body, ip = '1.1.1.1', hdr = {}) => { const r = await mod.default.fetch(new Request('http://localhost' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', 'cf-connecting-ip': ip, ...hdr }, body: body === undefined ? undefined : JSON.stringify(body) }), env); let j = {}; try { j = await r.json(); } catch (e) {} return { st: r.status, j, h: r.headers }; };
const ADM = { authorization: 'Bearer admin-key-1234567890' };

// ---- 平时：不要人机验证；同一来源试太多次才要 ----
await call('/api/account/register', { email: 'u1@x.com', password: 'pass-u1-1234' }, '2.0.0.1');
const codes = [];
for (let i = 0; i < 6; i++) codes.push((await call('/api/account/login', { email: 'u1@x.com', password: 'wrong-' + i }, '2.0.0.2')).st);
ok('平时：前 5 次登录照常（不弹人机验证）', codes.slice(0, 5).every((c) => c === 401), codes.join());
let r = await call('/api/account/login', { email: 'u1@x.com', password: 'pass-u1-1234' }, '2.0.0.2');
ok('同一来源 15 分钟里试太多次：要人机验证（带验证框的站点编号）', r.st === 403 && r.j.captcha && r.j.site === env.TURNSTILE_SITE, JSON.stringify(r.j));
r = await call('/api/account/login', { email: 'u1@x.com', password: 'pass-u1-1234', cft: 'tok-bad' }, '2.0.0.2');
ok('验证没通过：还是不让登录', r.st === 403 && r.j.captcha);
r = await call('/api/account/login', { email: 'u1@x.com', password: 'pass-u1-1234', cft: 'tok-ok' }, '2.0.0.2');
ok('验证通过：照常登录', r.st === 200 && r.j.ok, JSON.stringify(r.j));
ok('凭证拿去 Cloudflare 核对时带着来源 IP 和密钥', VER.some((v) => v.remoteip === '2.0.0.2' && v.secret === 'ts-secret'));
r = await call('/api/account/login', { email: 'u1@x.com', password: 'pass-u1-1234' }, '2.0.0.3');
ok('别的来源不受影响', r.st === 200, JSON.stringify(r.j));
// ---- 受攻击模式：表单都要人机验证；路由器接口不受影响 ----
ok('受攻击模式的开关只有管理员能动', (await call('/api/admin/atk', { on: true })).st === 401);
r = await call('/api/admin/atk', { on: true }, '9.9.9.9', ADM);
ok('后台开启受攻击模式（24 小时后自动关）', r.j.ok && r.j.atk.on && r.j.atk.until - Date.now() > 23 * 3600e3 && r.j.captcha === true, JSON.stringify(r.j));
r = await call('/api/account/login', { email: 'u1@x.com', password: 'pass-u1-1234' }, '2.0.0.4');
ok('受攻击模式：第一次登录就要人机验证', r.st === 403 && r.j.captcha);
r = await call('/api/account/register', { email: 'u2@x.com', password: 'pass-u2-1234' }, '2.0.0.5');
ok('受攻击模式：注册也要', r.st === 403 && r.j.captcha);
r = await call('/api/account/register', { email: 'u2@x.com', password: 'pass-u2-1234', cft: 'tok-ok' }, '2.0.0.5');
ok('受攻击模式：过了验证照常注册', r.st === 200, JSON.stringify(r.j));
const inv = (await call('/api/admin/invites', { direct: true, max: 5 }, '9.9.9.9', ADM)).j.invite.code;
const R1 = (await call('/api/register', { invite: inv, name: 'Living', model: 'x' }, '3.0.0.1')).j;
ok('受攻击模式：路由器开通不受影响', !!R1.sub && !!R1.rkey, JSON.stringify(R1).slice(0, 200));
r = await call('/api/dev/feedback', { sub: R1.sub, rkey: R1.rkey, text: '路由器面板里的反馈' }, '3.0.0.1');
ok('受攻击模式：面板反馈（路由器发的）不受影响', r.st === 200 && r.j.ok, JSON.stringify(r.j));
r = await call('/api/report', { kind: 'install', text: '安装失败上报内容超过十个字', sub: R1.sub, rkey: R1.rkey }, '3.0.0.1');
ok('受攻击模式：终端里的安装失败上报不受影响', r.st === 200 && r.j.ok, JSON.stringify(r.j));
ok('受攻击模式：公开状态接口照常', (await call('/api/ping')).st === 200);
r = await call('/api/admin/atk', undefined, '9.9.9.9', ADM);
ok('后台能看到受攻击模式开着', r.j.atk.on === true);
ok('开关记进操作记录', (await H.adminLog()).some((x) => x.op === 'atk_on'));
// 24 小时后自动关
{ const a = await H.ctx.storage.get('atk'); a.until = Date.now() - 1; await H.ctx.storage.put('atk', a); }
r = await call('/api/account/login', { email: 'u2@x.com', password: 'pass-u2-1234' }, '2.0.0.6');
ok('到时间自动关：照常登录不用验证', r.st === 200, JSON.stringify(r.j));
// ---- 没配置人机验证：受攻击模式只收紧限速 ----
const ts = [env.TURNSTILE_SITE, env.TURNSTILE_SECRET]; delete env.TURNSTILE_SITE; delete env.TURNSTILE_SECRET;
await call('/api/admin/atk', { on: true }, '9.9.9.9', ADM);
const cs = [];
for (let i = 0; i < 4; i++) cs.push((await call('/api/account/login', { email: 'u2@x.com', password: 'wrong-x' + i }, '2.0.0.7')).st);
ok('没配置人机验证：受攻击模式下同一来源 10 分钟最多试 3 次，再试说「10 分钟后再试」', cs.slice(0, 3).every((c) => c === 401) && cs[3] === 429, cs.join());
ok('没配置人机验证：从不要求验证（不会卡住用户）', !(await call('/api/account/login', { email: 'u2@x.com', password: 'x' }, '2.0.0.8')).j.captcha);
let csp = (await call('/app')).h.get('content-security-policy');
ok('没配置人机验证：账号页不放行 Cloudflare 验证脚本', !/challenges\.cloudflare\.com/.test(csp));
await call('/api/admin/atk', { on: false }, '9.9.9.9', ADM);
[env.TURNSTILE_SITE, env.TURNSTILE_SECRET] = ts;
csp = (await call('/app')).h.get('content-security-policy');
ok('配置了人机验证：账号页放行验证脚本和验证框（只放行 challenges.cloudflare.com）', /script-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(csp) && /frame-src https:\/\/challenges\.cloudflare\.com/.test(csp), csp);
csp = (await call('/help')).h.get('content-security-policy');
ok('用不到验证的页面不放行', !/challenges\.cloudflare\.com/.test(csp));

// ---- 真浏览器：账号页弹人机验证，过了自动接着提交 ----
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const rr = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: { ...req.headers, 'cf-connecting-ip': '5.5.5.5' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
	const h = {}; rr.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
	const sc = rr.headers.getSetCookie ? rr.headers.getSetCookie() : []; if (sc.length) h['set-cookie'] = sc;
	res.writeHead(rr.status, h); res.end(Buffer.from(await rr.arrayBuffer()));
});
await new Promise((z) => server.listen(8194, z));
await call('/api/admin/atk', { on: true }, '9.9.9.9', ADM);
const FAKE = `window.turnstile = { render(el, o) { const b = document.createElement('button'); b.type = 'button'; b.id = 'fakeTs'; b.textContent = '我是真人'; b.style.cssText = 'width:300px;height:65px;border:1px solid #ccc;border-radius:6px;background:#fafafa;color:#333'; b.onclick = () => o.callback('tok-ok'); el.appendChild(b); return 'w1'; } };`;
const browser = await chromium.launch();
for (const [w, dark] of [[390, false], [390, true], [1280, false]]) {
	const T = '［' + w + (dark ? ' 深色' : '') + '］';
	const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, isMobile: w < 900, hasTouch: w < 900, colorScheme: dark ? 'dark' : 'light' });
	await ctx.route('https://challenges.cloudflare.com/**', (rt) => rt.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE }));
	const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) errs.push(m.text().slice(0, 160)); });
	await p.goto('http://localhost:8194/app#reg'); await new Promise((z) => setTimeout(z, 800));
	await p.fill('#fReg [name=email]', 'web' + w + (dark ? 'd' : '') + '@x.com'); await p.fill('#fReg [name=password]', 'pass-web-1234'); await p.click('#fReg button.primary'); await new Promise((z) => setTimeout(z, 1200));
	ok('受攻击模式：点注册弹出人机验证小窗' + T, await p.isVisible('.capm #fakeTs'));
	const lay = await p.evaluate(() => { const c = document.querySelector('.capm .capc').getBoundingClientRect(); return c.left >= 0 && c.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1; });
	ok('人机验证小窗不超出屏幕' + T, lay);
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/captcha-${w}${dark ? '-dark' : ''}.png` });
	await p.click('#fakeTs'); await new Promise((z) => setTimeout(z, 1800));
	ok('验证过了自动接着注册，进到账号页' + T, !(await p.isVisible('.capm')) && (await p.isVisible('#setBtn')));
	ok('页面没有报错、没有被安全策略拦下' + T, !errs.length, errs.join('；'));
	await ctx.close();
}
// 验证组件加载不出来：说明原因，不会跳过
{
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	await ctx.route('https://challenges.cloudflare.com/**', (rt) => rt.abort('connectionfailed'));
	const p = await ctx.newPage();
	await p.goto('http://localhost:8194/app#reg'); await new Promise((z) => setTimeout(z, 800));
	await p.fill('#fReg [name=email]', 'nets@x.com'); await p.fill('#fReg [name=password]', 'pass-web-1234'); await p.click('#fReg button.primary'); await new Promise((z) => setTimeout(z, 1500));
	ok('验证组件加载不出来：小窗里说明原因（换个网络或稍后再试）', /加载不出来/.test(await p.textContent('.capm').catch(() => '')));
	await p.click('.capm [data-x]'); await new Promise((z) => setTimeout(z, 500));
	ok('点取消：没有注册（不会跳过验证）', !(await p.isVisible('#setBtn')) && /已取消/.test(await p.textContent('body')));
	await ctx.close();
}
await browser.close(); server.close();
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 400) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

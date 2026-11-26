// 6.0 第 71 项（官网这边）：App 登录只能授权——App 6.0 起不能输密码（登录、注册、找回密码都不行）；
// App 要授权码 → 浏览器（已登录）看设备、允许 / 拒绝 → App 凭编号 + 钥匙取到登录；授权码 10 分钟、用一次；钥匙不对拿不到
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
globalThis.fetch = async () => new Response(JSON.stringify({ success: true, result: {}, errors: [] }));
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: '', VAPID_PRIV: '', TRIAL_DAYS: '7' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const S = () => env.H.get('hub').ctx.storage;
const APP6 = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 RouterPanelApp/6.0.0', APP5 = APP6.replace('6.0.0', '5.2.3');
let ipn = 0;
async function call(c, path, body, ua) {
	const h = { 'content-type': 'application/json', origin: 'https://panel.example', 'cf-connecting-ip': '1.1.1.' + (++ipn % 200), ...(ua ? { 'user-agent': ua } : {}) };
	if (c && c.sid) h.cookie = '__Host-sid=' + c.sid;
	const res = await mod.default.fetch(new Request('https://panel.example' + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
	const sc = res.headers.get('set-cookie');
	if (c && sc) { const mm = /__Host-sid=([a-z2-9]*);/.exec(sc); if (mm) c.sid = mm[1]; }
	let j = {}; try { j = await res.json(); } catch (e) {}
	return { st: res.status, j, sc };
}
const A = { sid: '' };
await call(A, '/api/account/register', { email: 'alice@x.com', password: 'pass-alic-123' });
ok('浏览器里注册、登录照常', !!A.sid);
// App 6.0 不能输密码
let r = await call({}, '/api/account/login', { email: 'alice@x.com', password: 'pass-alic-123' }, APP6);
ok('App 6.0：不能输密码登录', r.st === 403 && r.j.app === true && /用官网登录/.test(r.j.error), JSON.stringify(r.j));
ok('App 6.0：不能注册、找回密码', (await call({}, '/api/account/register', { email: 'x@x.com', password: 'pass-xxxx-123' }, APP6)).st === 403 && (await call({}, '/api/account/reset', { email: 'alice@x.com' }, APP6)).st === 403);
const old = {};
r = await call(old, '/api/account/login', { email: 'alice@x.com', password: 'pass-alic-123' }, APP5);
ok('老 App（5.x）照常能登录（会被要求更新）', r.st === 200 && !!old.sid);
// 授权
const P = {};
r = await call(P, '/api/account/app_start', {}, APP6);
const { code, key } = r.j;
ok('App 要授权码：编号 8 位、钥匙 24 位、10 分钟', r.st === 200 && /^[a-z2-9]{8}$/.test(code) && /^[a-z2-9]{24}$/.test(key) && r.j.exp - Date.now() > 590e3 && !P.sid, JSON.stringify(r.j));
r = await call(P, '/api/account/app_poll', { code, key }, APP6);
ok('还没确认：等着', r.st === 200 && r.j.wait === true && !P.sid);
ok('钥匙不对：拿不到', (await call({}, '/api/account/app_poll', { code, key: 'a'.repeat(24) }, APP6)).st === 403);
ok('没登录的浏览器：不能确认', (await call({}, '/api/account/app_ok', { code, ok: true })).st === 401);
r = await call(A, '/api/account/app_info', { code });
ok('浏览器看到是哪台设备', r.st === 200 && /路由器面板 App/.test(r.j.ua) && r.j.at > 0, JSON.stringify(r.j));
r = await call(A, '/api/account/app_ok', { code, ok: true });
ok('允许', r.st === 200 && r.j.ok);
ok('再点一次：已经用过了', (await call(A, '/api/account/app_ok', { code, ok: true })).st === 409);
r = await call(P, '/api/account/app_poll', { code, key }, APP6);
ok('App 取到登录（Cookie）', r.st === 200 && !!P.sid && /HttpOnly; Secure/.test(r.sc), JSON.stringify(r.j) + r.sc);
r = await call(P, '/api/account/me', undefined, APP6);
ok('App 登录上了这个账号', r.st === 200 && r.j.ok === true);
ok('授权码用一次就删', (await call({}, '/api/account/app_poll', { code, key }, APP6)).st === 404 && !(await S().get('aa:' + code)));
// 拒绝
const Q = {};
const r2 = (await call(Q, '/api/account/app_start', {}, APP6)).j;
await call(A, '/api/account/app_ok', { code: r2.code, ok: false });
r = await call(Q, '/api/account/app_poll', { code: r2.code, key: r2.key }, APP6);
ok('拒绝：App 拿到「已拒绝」，没有登录', r.st === 200 && r.j.denied === true && !Q.sid);
// 过期
const r3 = (await call({}, '/api/account/app_start', {}, APP6)).j;
const m = await S().get('aa:' + r3.code); m.exp = Date.now() - 1; await S().put('aa:' + r3.code, m);
ok('过期：浏览器和 App 都说过期了', (await call(A, '/api/account/app_info', { code: r3.code })).st === 404 && (await call({}, '/api/account/app_poll', { code: r3.code, key: r3.key }, APP6)).j.expired === true);
// 登录记录
r = await call(A, '/api/account/sessions', {});
const lg = (await S().get('ll')) || [];
ok('记一笔：允许 / 拒绝 App 登录', lg.some((x) => x.k === 'app' && x.ok && /允许 App 登录/.test(x.why)) && lg.some((x) => x.k === 'app' && !x.ok));
ok('App 的登录跟别的一样能退出（在登录列表里）', ((await S().get('u:' + (await S().get('s:' + P.sid)).uid)).sids || []).includes(P.sid));

let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

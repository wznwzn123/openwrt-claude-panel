// 6.0 第 36 项（官网这边）：在外面打开路由器上其他端口的页面——「子域名-x」用的时候才建、同一时间只指向一个端口；
// Worker 先验路由器签的通行证（RKEY 签，绑定子域名、端口、到期时间），切到别的页面后旧通行证失效；本地版、删除时一起删掉
import { load, memStorage } from './load.mjs';
const mod = await load();
// 跟路由器同样的签法（独立写一遍，核对 Worker）
const xSign = async (key, sub, port, exp) => { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(sub + '|' + port + '|' + exp)))].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const CF = [], ORIGIN = []; let dnsFull = false;
globalThis.fetch = async (input, init = {}) => {
	const req = typeof input === 'string' ? null : input;
	const url = req ? req.url : input, u = new URL(url), m = ((req && req.method) || init.method || 'GET').toUpperCase();
	const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] }));
	if (u.hostname !== 'api.cloudflare.com') { ORIGIN.push({ url, cookie: req ? req.headers.get('cookie') : null }); return new Response('origin page'); }
	const body = init.body ? JSON.parse(init.body) : null;
	CF.push({ m, p: u.pathname, body });
	if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 'tun' + CF.length, token: 'tok' + CF.length });
	if (m === 'POST' && u.pathname.endsWith('/dns_records')) return dnsFull && /-x\./.test(body.name) ? new Response(JSON.stringify({ success: false, errors: [{ code: 81045, message: 'Record quota exceeded' }] }), { status: 400 }) : R({ id: 'dns' + CF.length });
	return R({});
};
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: '', VAPID_PRIV: '', TRIAL_DAYS: '7' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const S = () => env.H.get('hub').ctx.storage, W = (sub) => env.W.get('dev:' + sub);
let ipn = 0;
async function call(c, path, body) {
	const h = { 'content-type': 'application/json', origin: 'https://panel.example', 'cf-connecting-ip': '1.1.1.' + (++ipn % 200) };
	if (c && c.sid) h.cookie = '__Host-sid=' + c.sid;
	const res = await mod.default.fetch(new Request('https://panel.example' + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
	const sc = res.headers.get('set-cookie');
	if (c && sc) { const mm = /sid=([a-z2-9]*);/.exec(sc); if (mm) c.sid = mm[1]; }
	let j = {}; try { j = await res.json(); } catch (e) {}
	return { st: res.status, j };
}
const post = async (path, body, hdr = {}) => { const r = await mod.default.fetch(new Request('https://panel.example' + path, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '9.9.9.' + (++ipn % 200), ...hdr }, body: JSON.stringify(body) }), env); let j = {}; try { j = await r.json(); } catch (e) {} return { st: r.status, j }; };
const xget = (sub, path, cookie) => mod.default.fetch(new Request('https://' + sub + '-x.panel.example' + path, { headers: cookie ? { cookie } : {} }), env);

const A = { sid: '' };
await call(A, '/api/account/register', { email: 'alice@x.com', password: 'pass-alic-123' });
const tr = (await call(A, '/api/account/trial', {})).j;
const R = (await post('/api/register', { invite: tr.code, name: 'Home', model: 'AX3000T' })).j;
ok('开通 AI 版（有隧道）', R.sub && R.rkey && R.token, JSON.stringify(R).slice(0, 200));
CF.length = 0;
ok('开通时不建「子域名-x」（用的时候才建，不占名额）', !(await S().get('d:' + R.sub)).xdns);
let r = await post('/api/dev/xtarget', { sub: R.sub, rkey: 'wrong', port: 9090 });
ok('钥匙不对：拒绝', r.st === 403);
r = await post('/api/dev/xtarget', { sub: R.sub, rkey: R.rkey, port: 18765 });
ok('面板自己的端口不能开', r.st === 400);
r = await post('/api/dev/xtarget', { sub: R.sub, rkey: R.rkey, port: 9090 });
const dnsX = CF.find((x) => x.m === 'POST' && /dns_records/.test(x.p));
const cfg1 = CF.find((x) => x.m === 'PUT' && /configurations/.test(x.p));
ok('第一次打开：建「子域名-x」，指向同一条隧道', r.st === 200 && r.j.host === R.sub + '-x.panel.example' && dnsX && dnsX.body.name === R.sub + '-x.panel.example' && dnsX.body.proxied === true, JSON.stringify(r.j));
ok('隧道设置：面板照旧，「-x」指到 9090，其他 404', cfg1 && JSON.stringify(cfg1.body.config.ingress) === JSON.stringify([{ hostname: R.sub + '.panel.example', service: 'http://127.0.0.1:18765' }, { hostname: R.sub + '-x.panel.example', service: 'http://127.0.0.1:9090' }, { service: 'http_status:404' }]), JSON.stringify(cfg1 && cfg1.body));
CF.length = 0;
r = await post('/api/dev/xtarget', { sub: R.sub, rkey: R.rkey, port: 3000 });
ok('切到别的页面：不再建域名记录，只改隧道设置', r.st === 200 && !CF.some((x) => /dns_records/.test(x.p)) && CF.some((x) => x.m === 'PUT' && JSON.stringify(x.body).includes('127.0.0.1:3000')));
ok('官网记着现在指向哪个端口', (await W(R.sub).getCfg()).x === 3000);
r = await post('/api/dev/xtarget', { sub: R.sub, rkey: R.rkey, port: 8443, https: true });
ok('https 的页面：用 https 连、不验路由器自签的证书', CF.some((x) => x.m === 'PUT' && JSON.stringify(x.body).includes('"https://127.0.0.1:8443"') && JSON.stringify(x.body).includes('"noTLSVerify":true')));
await post('/api/dev/xtarget', { sub: R.sub, rkey: R.rkey, port: 3000 });

// ---------- Worker 看门 ----------
let res = await xget(R.sub, '/');
ok('没有通行证：挡掉，写「要从面板打开」', res.status === 403 && /要从面板打开/.test(await res.text()) && !ORIGIN.length);
const now = Math.floor(Date.now() / 1000), exp = now + 3600;
const sign = async (key, port, e) => xSign(key, R.sub, port, e);
res = await xget(R.sub, `/__cmcpx?p=3000&e=${exp}&s=${await sign('not-the-key', 3000, exp)}`);
ok('别的钥匙签的：挡掉', res.status === 403);
res = await xget(R.sub, `/__cmcpx?p=3000&e=${now - 5}&s=${await sign(R.rkey, 3000, now - 5)}`);
ok('过期的：挡掉', res.status === 403);
res = await xget(R.sub, `/__cmcpx?p=3000&e=${now + 86400}&s=${await sign(R.rkey, 3000, now + 86400)}`);
ok('超过 12 小时的：挡掉', res.status === 403);
const s1 = await sign(R.rkey, 3000, exp);
res = await xget(R.sub, `/__cmcpx?p=3000&e=${exp}&s=${s1}&to=/dashboard`);
const sc = res.headers.get('set-cookie') || '';
ok('通行证对：写进这个地址自己的 Cookie（HttpOnly、Secure），跳到页面', res.status === 302 && res.headers.get('location') === '/dashboard' && /^cmcpx=3000\.\d+\.[0-9a-f]{64}; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax$/.test(sc) && !/Domain=/i.test(sc), sc);
res = await xget(R.sub, `/__cmcpx?p=3000&e=${exp}&s=${s1}&to=//evil.example`);
ok('跳转只能是本站路径', res.headers.get('location') === '/');
const ck = sc.split(';')[0];
res = await xget(R.sub, '/control', ck + '; agh_session=abc');
ok('带通行证：放行到隧道，自己的 Cookie 拿掉、页面自己的 Cookie 留着', res.status === 200 && (await res.text()) === 'origin page' && ORIGIN.length === 1 && ORIGIN[0].cookie === 'agh_session=abc', JSON.stringify(ORIGIN));
await post('/api/dev/xtarget', { sub: R.sub, rkey: R.rkey, port: 9090 });
res = await xget(R.sub, '/control', ck);
ok('切到别的页面后，旧通行证失效', res.status === 403 && /切到别的页面/.test(await res.text()));
res = await xget('zzzzzzzz', '/', ck);
ok('不存在的路由器：没开', res.status === 404);
// 关掉
r = await post('/api/dev/xtarget', { sub: R.sub, rkey: R.rkey, port: 0 });
ok('关掉：「-x」指向 404，记录清空', r.st === 200 && CF.some((x) => x.m === 'PUT' && JSON.stringify(x.body).includes('"service":"http_status:404"},{"service"')) && !(await W(R.sub).getCfg()).x);
// 本地版：删掉
const dX = (await S().get('d:' + R.sub)).xdns;
CF.length = 0;
await call(A, '/api/account/sudo_code', {}); await call(A, '/api/account/sudo', { code: '000000' });
r = await post('/api/dev/edition', { sub: R.sub, rkey: R.rkey, to: 'local' });
ok('换成本地版：「子域名-x」一起删掉', r.j.ok && CF.some((x) => x.m === 'DELETE' && x.p.endsWith('/dns_records/' + dX)) && !(await S().get('d:' + R.sub)).xdns, JSON.stringify(CF.map((x) => x.m + ' ' + x.p)));
r = await post('/api/dev/xtarget', { sub: R.sub, rkey: R.rkey, port: 9090 });
ok('本地版：说没有隧道', r.st === 409 && /本地版/.test(r.j.error));
// 名额满了
const B = { sid: '' }; await call(B, '/api/account/register', { email: 'bob@x.com', password: 'pass-bob-1234' });
const tr2 = (await call(B, '/api/account/trial', {})).j;
const R2 = (await post('/api/register', { invite: tr2.code, name: 'Home2', model: 'X' })).j;
dnsFull = true;
r = await post('/api/dev/xtarget', { sub: R2.sub, rkey: R2.rkey, port: 9090 });
ok('网址名额满了：说清楚', r.st === 502 && /名额满了/.test(r.j.error), JSON.stringify(r.j));

let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

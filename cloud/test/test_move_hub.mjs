// 6.0 第 29 项（官网这边）：搬家——只存密文、24 小时、用一次；只能搬到同一个主账号的路由器；搬完家人转过去
// （下面是从 test_xpage 抄的准备工作）
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

const A = { sid: '' }, B = { sid: '' }, C = { sid: '' };
await call(A, '/api/account/register', { email: 'alice@x.com', password: 'pass-alic-123' });
await call(B, '/api/account/register', { email: 'bob@x.com', password: 'pass-bob-1234' });
await call(C, '/api/account/register', { email: 'carol@x.com', password: 'pass-carol-12' });
const R1 = (await post('/api/register', { invite: (await call(A, '/api/account/trial', {})).j.code, name: '旧路由器', model: 'X' })).j;
const R2 = (await post('/api/register', { invite: (await call(B, '/api/account/trial', {})).j.code, name: '新路由器', model: 'Y' })).j;
const R3 = (await post('/api/register', { invite: (await call(C, '/api/account/trial', {})).j.code, name: '别人的', model: 'Z' })).j;
// 让 R2 也归 alice（新买的路由器开在自己账号下），bob 是 R1 的家人
const uidOf = async (c) => (await call(c, '/api/account/me')).j.me?.uid || (await call(c, '/api/account/me')).j.uid;
const ua = (await S().get('d:' + R1.sub)).owner || (await S().get('d:' + R1.sub)).users[0], ub = (await S().get('d:' + R2.sub)).users[0];
const d2 = await S().get('d:' + R2.sub); d2.users = [ua]; d2.owner = ua; delete d2.subs; await S().put('d:' + R2.sub, d2);
const d1 = await S().get('d:' + R1.sub); d1.owner = ua; d1.users = [ua, ub]; d1.subs = { [ub]: { tpl: 'family', perms: ['msg', 'node'], exp: 0, at: 1 } }; await S().put('d:' + R1.sub, d1);
const u_b = await S().get('u:' + ub); u_b.devs = [{ sub: R1.sub, at: 1 }]; await S().put('u:' + ub, u_b);
let r = await post('/api/dev/move_put', { sub: R1.sub, rkey: R1.rkey, blob: 'QUJD' });
ok('旧路由器放搬家包：拿到编号', r.st === 200 && /^[a-z2-9]{8}$/.test(r.j.id), JSON.stringify(r.j));
const id = r.j.id;
ok('官网只存密文（存的就是路由器给的那串）', (await S().get('mv:' + id)).blob === 'QUJD');
ok('格式不对：拒绝', (await post('/api/dev/move_put', { sub: R1.sub, rkey: R1.rkey, blob: '<script>' })).st === 400);
ok('钥匙不对：拒绝', (await post('/api/dev/move_get', { sub: R2.sub, rkey: 'x', id })).st === 403);
r = await post('/api/dev/move_get', { sub: R3.sub, rkey: R3.rkey, id });
ok('别人的路由器拿不到（主账号不同）', r.st === 403 && /自己账号下/.test(r.j.error));
ok('旧路由器自己拿：说在新路由器上输', (await post('/api/dev/move_get', { sub: R1.sub, rkey: R1.rkey, id })).st === 400);
r = await post('/api/dev/move_get', { sub: R2.sub, rkey: R2.rkey, id });
ok('自己的新路由器：拿到密文和旧路由器的名字', r.st === 200 && r.j.blob === 'QUJD' && r.j.fromName === '旧路由器', JSON.stringify(r.j));
r = await post('/api/dev/move_done', { sub: R2.sub, rkey: R2.rkey, id, fam: true });
const n2 = await S().get('d:' + R2.sub), n1 = await S().get('d:' + R1.sub), nb = await S().get('u:' + ub);
ok('搬完：家人连权限一起转到新路由器，旧的去掉', r.j.fam === 1 && n2.users.includes(ub) && n2.subs[ub].perms.join() === 'msg,node' && !n1.users.includes(ub) && !n1.subs[ub] && nb.devs.some((x) => x.sub === R2.sub) && !nb.devs.some((x) => x.sub === R1.sub), JSON.stringify({ n2: n2.subs, n1: n1.users }));
ok('搬家包用一次就删', !(await S().get('mv:' + id)) && (await post('/api/dev/move_get', { sub: R2.sub, rkey: R2.rkey, id })).st === 404);
const mv2 = (await post('/api/dev/move_put', { sub: R1.sub, rkey: R1.rkey, blob: 'QUJD' })).j.id;
const m = await S().get('mv:' + mv2); m.exp = Date.now() - 1; await S().put('mv:' + mv2, m);
ok('过期的：拿不到', (await post('/api/dev/move_get', { sub: R2.sub, rkey: R2.rkey, id: mv2 })).st === 404);
const mv3 = (await post('/api/dev/move_put', { sub: R1.sub, rkey: R1.rkey, blob: 'QUJD' })).j.id;
const mv4 = (await post('/api/dev/move_put', { sub: R1.sub, rkey: R1.rkey, blob: 'QUJE' })).j.id;
ok('重新打包：之前的搬家码作废', (await post('/api/dev/move_get', { sub: R2.sub, rkey: R2.rkey, id: mv3 })).st === 404 && (await post('/api/dev/move_get', { sub: R2.sub, rkey: R2.rkey, id: mv4 })).j.blob === 'QUJE');

let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

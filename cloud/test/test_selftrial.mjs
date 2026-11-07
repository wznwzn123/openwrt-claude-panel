// 新账号免费试用：账号页领试用码，开通后自动加到账号里
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);

/* ---------- 模拟 Cloudflare API ---------- */
const CF = { tunnels: new Map(), dns: new Map(), n: 0, fail: null, calls: [], probes: [] };
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url;
	const u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (u.hostname !== 'api.cloudflare.com') { CF.probes.push(url); return new Response('{}', { status: 200 }); }
	CF.calls.push(m + ' ' + u.pathname);
	const auth = (init.headers || {}).authorization;
	const R = (result, st = 200) => new Response(JSON.stringify({ success: st < 300, result, errors: st < 300 ? [] : [{ message: 'mock error ' + st }] }), { status: st });
	if (auth !== 'Bearer cf-token') return R(null, 403);
	const body = init.body ? JSON.parse(init.body) : null;
	const p = u.pathname.replace('/client/v4', '');
	let x;
	if (CF.fail && p.includes(CF.fail)) return R(null, 500);
	if (m === 'POST' && p === '/accounts/acc1/cfd_tunnel') { const id = 'tun-' + ++CF.n; CF.tunnels.set(id, { name: body.name, src: body.config_src, cfg: null }); return R({ id, token: 'tok-' + id }); }
	if ((x = p.match(/^\/accounts\/acc1\/cfd_tunnel\/([^/]+)\/configurations$/)) && m === 'PUT') { const t = CF.tunnels.get(x[1]); if (!t) return R(null, 404); t.cfg = body.config; return R({}); }
	if ((x = p.match(/^\/accounts\/acc1\/cfd_tunnel\/([^/]+)\/token$/)) && m === 'GET') return R('tok-' + x[1]);
	if ((x = p.match(/^\/accounts\/acc1\/cfd_tunnel\/([^/]+)\/connections$/)) && m === 'DELETE') return R({});
	if ((x = p.match(/^\/accounts\/acc1\/cfd_tunnel\/([^/]+)$/)) && m === 'DELETE') { if (!CF.tunnels.delete(x[1])) return R(null, 404); return R({}); }
	if (m === 'POST' && p === '/zones/zone1/dns_records') { const id = 'dns-' + ++CF.n; CF.dns.set(id, body); return R({ id }); }
	if ((x = p.match(/^\/zones\/zone1\/dns_records\/([^/]+)$/)) && m === 'DELETE') { if (!CF.dns.delete(x[1])) return R(null, 404); return R({}); }
	return R(null, 404);
};

/* ---------- 模拟 Durable Object ---------- */
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 'cf-token', CF_ACCOUNT_ID: 'acc1', CF_ZONE_ID: 'zone1', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '20', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(), st = new Map(); return { objs, st, idFromName: (n) => n, get(id) { if (!objs.has(id)) { const s = memStorage(); st.set(id, s); objs.set(id, new Cls({ storage: s }, env)); } return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const req = (method, url, body, headers = {}) => mod.default.fetch(new Request(url, { method, body: body == null ? undefined : (typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body)), headers: { 'content-type': 'application/json', ...headers } }), env);
const api = (method, path, body, h) => req(method, 'https://panel.example' + path, body, h);
const adm = (method, path, body) => api(method, '/api/admin' + path, body, { authorization: 'Bearer admin-key-1234567890' });
const reg = (invite, ip = '1.1.1.1', extra = {}) => api('POST', '/api/register', { invite, name: 'Kwrt', model: 'JD RE-SS-01', ...extra }, { 'cf-connecting-ip': ip });
const hub = () => env.H.get('hub');
const dev = async (sub) => (await hub().ctx.storage.get('d:' + sub));
const DAY = 86400e3;
const MAILS = []; env.RESEND_API_KEY = 're_test';
const f0 = globalThis.fetch; globalThis.fetch = async (input, init = {}) => { const url = typeof input === 'string' ? input : input.url; if (url === 'https://api.resend.com/emails') { MAILS.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); } return f0(input, init); };
let T = Date.now(); const realNow = Date.now; Date.now = () => T;
// 记下推送给路由器的通知（Watch.push）
const PUSH = [];
const origPush = mod.Watch.prototype.push; mod.Watch.prototype.push = async function (m) { PUSH.push(m); return 1; };

// 账号用正常的注册流程建（这时还没开邮件，不用验证码），之后再打开邮件
const RK = env.RESEND_API_KEY; delete env.RESEND_API_KEY;
const jar = () => ({ sid: '' });
const call = async (c, path, b, method = 'POST') => {
	const h = { 'content-type': 'application/json', origin: 'https://panel.example', 'cf-connecting-ip': '9.9.9.' + Math.floor(Math.random() * 200) };
	if (c.sid) h.cookie = 'sid=' + c.sid;
	const res = await mod.default.fetch(new Request('https://panel.example' + path, { method, headers: h, body: method === 'GET' ? undefined : JSON.stringify(b || {}) }), env);
	const sc = res.headers.get('set-cookie'); if (sc) { const m = /sid=([a-z2-9]*);/.exec(sc); c.sid = m ? m[1] : ''; }
	let j = {}; try { j = await res.json(); } catch (e) {}
	return { st: res.status, ...j };
};
const UA = jar(), UB = jar(), UM = jar();
await call(UA, '/api/account/register', { email: 'alice@x.com', password: 'abcdefgh1' });
await call(UB, '/api/account/register', { email: 'bob@x.com', password: 'abcdefgh2' });
await call(UM, '/api/account/register', { email: 'boss@x.com', password: 'abcdefgh3' });
env.RESEND_API_KEY = RK; env.ADMIN_EMAIL = 'boss@x.com';
const uidOf = async (email) => hub().ctx.storage.get('e:' + email);
const uA = await uidOf('alice@x.com'), uB = await uidOf('bob@x.com'), uM = await uidOf('boss@x.com');
ok('三个账号都建好了', uA && uB && uM, [uA, uB, uM].join());
const bind = async (uid, sub) => { const u = await hub().ctx.storage.get('u:' + uid), d = await dev(sub); u.devs = [...(u.devs || []), { sub, at: T }]; d.users = [...(d.users || []), uid]; await hub().ctx.storage.put({ ['u:' + uid]: u, ['d:' + sub]: d }); };
let r = await (await adm('POST', '/invites', { max: 20, svc: 7, note: '给阿明' })).json();
const INV = r.invite.code;
const A = await (await reg(INV, '3.3.3.1')).json(), B = await (await reg(INV, '3.3.3.2')).json(), C = await (await reg(INV, '3.3.3.3')).json();
await bind(uA, A.sub); await bind(uA, B.sub); await bind(uB, C.sub);
const LOG = async () => (await (await adm('GET', '/log')).json()).list;

/* ---------- 新账号领试用 ---------- */
await hub().ctx.storage.put('u:' + uA, { ...(await hub().ctx.storage.get('u:' + uA)), verified: true });
let me = await call(UA, '/api/account/me', null, 'GET');
ok('[试用] 账号页能看到「免费试用 7 天」，还没领', me.trial && me.trial.days === 7 && !me.trial.got && !me.trial.code, JSON.stringify(me.trial));
r = await call(UA, '/api/account/trial', {});
ok('[试用] 领到试用码：7 天内有效', r.st === 200 && /^[A-Z2-9]{10}$/.test(r.code) && Math.abs(r.exp - (T + 7 * DAY)) < 5, JSON.stringify(r));
const code = r.code;
r = await call(UA, '/api/account/trial', {});
ok('[试用] 再点一次：还是同一个码，不会多领', r.st === 200 && r.code === code);
me = await call(UA, '/api/account/me', null, 'GET');
ok('[试用] 账号页显示这个码', me.trial.code === code && me.trial.got);
const inv = await hub().ctx.storage.get('i:' + code);
ok('[试用] 码只能开通 1 台，开通后用 7 天，管理页标着「官网自助试用」', inv.max === 1 && inv.svc === 7 && inv.trial === 1 && inv.uid === uA && /alice@x\.com/.test(inv.note));
const before = (await hub().ctx.storage.get('u:' + uA)).devs.length;
const D = await (await reg(code, '4.4.4.4')).json();
ok('[试用] 用这个码开通：成功，告诉安装程序已经自动加到账号里', D.sub && D.bound === true && Math.abs(D.exp - (T + 7 * DAY)) < 5, JSON.stringify(D));
const uu = await hub().ctx.storage.get('u:' + uA), dd = await dev(D.sub);
ok('[试用] 路由器自动加到这个账号里（不用配对）', uu.devs.length === before + 1 && uu.devs.some((x) => x.sub === D.sub) && dd.users.includes(uA));
me = await call(UA, '/api/account/me', null, 'GET');
ok('[试用] 开通以后账号页不再显示试用码', me.trial.used > 0 && !me.trial.code && me.devs.some((x) => x.sub === D.sub));
r = await call(UA, '/api/account/trial', {});
ok('[试用] 用过了还点领取：返回原来的码、标着用过了，不会再发新的', r.st === 200 && r.code === code && r.used > 0);
ok('[试用] 这个码不能再开通第二台', (await reg(code, '4.4.4.5')).status === 403);
ok('[试用] 记进操作记录', (await LOG()).some((x) => x.op === 'trial') && (await LOG()).some((x) => x.op === 'trial-used'));
// 邮箱没验证（开了邮件验证时）不能领
await hub().ctx.storage.put('u:' + uB, { ...(await hub().ctx.storage.get('u:' + uB)), verified: false });
r = await call(UB, '/api/account/trial', {});
ok('[试用] 邮箱没验证：不能领', r.st === 403 && /验证邮箱/.test(r.error), JSON.stringify(r));
// 关掉试用
env.TRIAL_DAYS = '0';
await hub().ctx.storage.put('u:' + uB, { ...(await hub().ctx.storage.get('u:' + uB)), verified: true });
r = await call(UB, '/api/account/trial', {});
me = await call(UB, '/api/account/me', null, 'GET');
ok('[试用] TRIAL_DAYS 设成 0：不发试用，账号页也不显示', r.st === 403 && me.trial === null, JSON.stringify([r, me.trial]));
env.TRIAL_DAYS = '14';
r = await call(UB, '/api/account/trial', {});
ok('[试用] TRIAL_DAYS 设成 14：试用 14 天', r.st === 200 && r.days === 14 && (await hub().ctx.storage.get('i:' + r.code)).svc === 14);
delete env.TRIAL_DAYS;
ok('[试用] 没登录不能领', (await call(jar(), '/api/account/trial', {})).st === 401);

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

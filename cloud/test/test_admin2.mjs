// 管理后台：加天数、备注、操作记录、账号管理（删除先进回收站、恢复、彻底删除）、用户自己注销也能恢复、统计用的「续过期」标记
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

/* ---------- 加天数 ---------- */
const e0 = (await dev(A.sub)).exp;
r = await (await adm('POST', '/devices/' + A.sub + '/extend', { days: '30天' })).json();
ok('[加天数] 管理员直接给路由器加 30 天（认「30天」）', r.ok && Math.abs(r.exp - (e0 + 30 * DAY)) < 5 && (await dev(A.sub)).exp === r.exp, JSON.stringify(r));
ok('[加天数] 推送告诉用户续了多少天', PUSH.some((m) => /续了 30 天/.test(m.body)));
let rr = await adm('POST', '/devices/' + A.sub + '/extend', { days: 'abc' });
ok('[加天数] 天数不对：报错，不加', rr.status === 400 && (await dev(A.sub)).exp === r.exp);
{ const d = await dev(C.sub); d.exp = 0; await hub().ctx.storage.put('d:' + C.sub, d); }
rr = await adm('POST', '/devices/' + C.sub + '/extend', { days: 30 });
ok('[加天数] 不限期的：不用加，报错', rr.status === 400);
ok('[加天数] 记进操作记录（加几天、从哪天到哪天）', (await LOG()).some((x) => x.op === 'extend' && x.target === A.sub && /加 30 天/.test(x.detail)));

/* ---------- 统计用：续过期的 ---------- */
let L = (await (await adm('GET', '/devices')).json()).list;
ok('[统计] 加过天数的标成「续过期」，没续过的不标', L.find((d) => d.sub === A.sub).renewed === true && L.find((d) => d.sub === B.sub).renewed === false);

/* ---------- 备注 ---------- */
r = await (await adm('POST', '/devices/' + B.sub + '/note', { note: '阿明家<script>，微信 ming' })).json();
L = (await (await adm('GET', '/devices')).json()).list;
ok('[备注] 能给路由器写备注（去掉 < > 这类符号）', r.ok && L.find((d) => d.sub === B.sub).anote === '阿明家script，微信 ming', JSON.stringify(L.find((d) => d.sub === B.sub).anote));
await adm('POST', '/devices/' + B.sub + '/note', { note: '' });
ok('[备注] 清空备注', !(await dev(B.sub)).anote);

/* ---------- 操作记录 ---------- */
await adm('POST', '/devices/' + B.sub + '/off');
await adm('POST', '/devices/' + B.sub + '/on');
await adm('POST', '/devices/' + B.sub + '/delete', { confirm: B.sub });
await adm('POST', '/devices/' + B.sub + '/restore');
await adm('POST', '/renewals', { days: 60, count: 2 });
let lg = await LOG();
ok('[操作记录] 封禁、解封、删除、恢复、生成邀请码和续期码都记下来了（最新的在前面）', ['restore', 'delete', 'on', 'off', 'invite', 'renewal'].every((op) => lg.some((x) => x.op === op)) && lg[0].op === 'renewal' && lg.every((x, i) => i === 0 || lg[i - 1].t >= x.t), lg.map((x) => x.op).join());
rr = await adm('POST', '/devices/' + B.sub + '/delete', { confirm: 'wrong' });
ok('[操作记录] 没做成的（编号输错）不记', rr.status === 400 && (await LOG()).filter((x) => x.op === 'delete').length === 1);
// 路由器自己卸载
const c0 = await env.W.get('dev:' + C.sub).getCfg();
r = await (await api('POST', '/api/unregister', { sub: C.sub, rkey: c0.rkey })).json();
lg = await LOG();
ok('[操作记录] 路由器上运行卸载、网址交还：也记下来（以后查得到是谁删的）', r.ok && lg[0].op === 'unregister' && lg[0].target === C.sub && lg[0].by === 'router', JSON.stringify(lg[0]));
ok('[操作记录] 没有管理员密钥看不了', (await api('GET', '/api/admin/log')).status === 401);

/* ---------- 账号管理 ---------- */
let U = (await (await adm('GET', '/users')).json());
const ua = U.list.find((x) => x.email === 'alice@x.com');
ok('[账号] 列表里有每个账号、注册时间、最近登录、绑定的路由器', U.list.length === 3 && ua.devs.length === 2 && ua.devs.every((x) => x.name) && ua.lastAt > 0 && ua.created > 0, JSON.stringify(ua));
ok('[账号] 管理员自己的账号标出来', U.list.find((x) => x.email === 'boss@x.com').admin === true);
rr = await adm('POST', '/users/' + uM + '/delete', { confirm: 'boss@x.com' });
ok('[账号] 管理员自己的账号：不能删', rr.status === 403 && !!(await uidOf('boss@x.com')));
rr = await adm('POST', '/users/' + uA + '/delete', { confirm: 'alice' });
ok('[账号] 删除要输入完整邮箱确认，输错不删', rr.status === 400 && !!(await uidOf('alice@x.com')));
r = await (await adm('POST', '/users/' + uA + '/delete', { confirm: 'Alice@X.com' })).json();
ok('[账号] 输对邮箱：放进回收站，给出彻底删除的日期', r.ok && Math.abs(r.purgeAt - (T + 30 * DAY)) < 5, JSON.stringify(r));
ok('[账号] 删除后：登录态失效、路由器解除绑定（路由器本身还在、还能用）', (await call(UA, '/api/account/me', null, 'GET')).st === 401 && !(await dev(A.sub)).users.includes(uA) && !(await dev(A.sub)).off);
let lr = await call(jar(), '/api/account/login', { email: 'alice@x.com', password: 'abcdefgh1' });
ok('[账号] 被删的账号登录：告诉他已被停用、哪天前能恢复', lr.st === 403 && /已经被停用/.test(lr.error) && /前联系提供服务的人可以恢复/.test(lr.error), JSON.stringify(lr));
lr = await call(jar(), '/api/account/login', { email: 'alice@x.com', password: 'wrongpass1' });
ok('[账号] 密码不对时不透露账号状态', lr.st === 401);
U = (await (await adm('GET', '/users')).json());
ok('[账号] 回收站里能看到它（删除日期、彻底删除日期、原来绑定的路由器）', U.list.some((x) => x.email === 'alice@x.com' && x.deleted && x.purgeAt && x.devs.length === 2));
r = await (await adm('POST', '/users/' + uA + '/restore')).json();
lr = await call(UA, '/api/account/login', { email: 'alice@x.com', password: 'abcdefgh1' });
const meA = await call(UA, '/api/account/me', null, 'GET');
ok('[账号] 恢复：能登录，原来的路由器重新绑定回来', r.ok && r.devs === 2 && lr.st === 200 && meA.devs.length === 2 && (await dev(A.sub)).users.includes(uA), JSON.stringify(meA).slice(0, 200));
ok('[账号] 删除、恢复都记进操作记录', (await LOG()).some((x) => x.op === 'user-delete' && x.target === 'alice@x.com') && (await LOG()).some((x) => x.op === 'user-restore'));
// 彻底删除
await adm('POST', '/users/' + uA + '/delete', { confirm: 'alice@x.com' });
rr = await adm('POST', '/users/' + uB + '/purge', { confirm: 'bob@x.com' });
ok('[账号] 彻底删除：只能删回收站里的', rr.status === 400 && !!(await uidOf('bob@x.com')));
r = await (await adm('POST', '/users/' + uA + '/purge', { confirm: 'alice@x.com' })).json();
ok('[账号] 彻底删除回收站里的账号', r.ok && !(await hub().ctx.storage.get('xu:' + uA)) && !(await (await adm('GET', '/users')).json()).list.some((x) => x.email === 'alice@x.com'));
lr = await call(jar(), '/api/account/register', { email: 'alice@x.com', password: 'abcdefgh1', code: '' });
ok('[账号] 彻底删除后，这个邮箱可以重新注册（要验证码）', lr.st === 400 && /验证码/.test(lr.error), JSON.stringify(lr));

/* ---------- 用户自己注销：也先进回收站 ---------- */
await call(UB, '/api/account/login', { email: 'bob@x.com', password: 'abcdefgh2' });
r = await call(UB, '/api/account/delete', { password: 'abcdefgh2' });
U = (await (await adm('GET', '/users')).json());
ok('[自己注销] 用户自己注销：进回收站（标着「自己注销」），管理员 30 天内能帮他恢复', r.st === 200 && U.list.some((x) => x.email === 'bob@x.com' && x.deleted && x.delWhy === 'self'));
lr = await call(jar(), '/api/account/login', { email: 'bob@x.com', password: 'abcdefgh2' });
ok('[自己注销] 再登录：提示已注销、哪天前能恢复', lr.st === 403 && /已经注销/.test(lr.error), JSON.stringify(lr));
// 30 天后自动彻底删除
T += 31 * DAY;
await adm('POST', '/cleanup');
ok('[自己注销] 满 30 天：自动彻底删除，记进操作记录', !(await hub().ctx.storage.get('xu:' + uB)) && (await LOG()).some((x) => x.op === 'user-purge' && x.target === 'bob@x.com' && x.by === 'system'));

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

// 5.2 安装码：邀请码要在官网兑换成安装码才能装；装好自动加到账号里（主账号）；没用的安装码过期后名额退回
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

const jar = () => ({ sid: '' });
const call = async (c, path, b, method = 'POST') => {
	const h = { 'content-type': 'application/json', origin: 'https://panel.example', 'cf-connecting-ip': '9.9.9.' + Math.floor(Math.random() * 200) };
	if (c.sid) h.cookie = 'sid=' + c.sid;
	const res = await mod.default.fetch(new Request('https://panel.example' + path, { method, headers: h, body: method === 'GET' ? undefined : JSON.stringify(b || {}) }), env);
	const sc = res.headers.get('set-cookie'); if (sc) { const m = /sid=([a-z2-9]*);/.exec(sc); c.sid = m ? m[1] : ''; }
	let j = {}; try { j = await res.json(); } catch (e) {}
	return { st: res.status, ...j };
};
const RK = env.RESEND_API_KEY; delete env.RESEND_API_KEY;
const UA = jar(), UB = jar();
await call(UA, '/api/account/register', { email: 'alice@x.com', password: 'abcdefgh1' });
await call(UB, '/api/account/register', { email: 'bob@x.com', password: 'abcdefgh2' });
const uidOf = async (email) => hub().ctx.storage.get('e:' + email);
const uA = await uidOf('alice@x.com'), uB = await uidOf('bob@x.com');
const INV = (await (await adm('POST', '/invites', { max: 2, svc: 30, note: '给阿明' })).json()).invite.code;
const inv = async (c) => hub().ctx.storage.get('i:' + c);

// 1. 管理后台发的邀请码不能直接在路由器上装
let r = await reg(INV, '5.5.5.1'); let j = await r.json();
ok('邀请码直接在路由器上用：不行，告诉他去官网注册、兑换成安装码', r.status === 403 && /官网兑换成安装码/.test(j.error) && /panel\.example\/app/.test(j.error), j.error);
ok('没成功的不占名额', (await inv(INV)).used === 0);
// 2. 兑换
ok('没登录不能兑换', (await call(jar(), '/api/account/redeem', { code: INV })).st === 401);
ok('邀请码写错：说不对', /不对/.test((await call(UA, '/api/account/redeem', { code: 'ZZZZZZZZZZ' })).error));
r = await call(UA, '/api/account/redeem', { code: INV.toLowerCase() });
ok('兑换成功（不分大小写）：拿到 10 位安装码，7 天有效', r.st === 200 && /^[A-Z2-9]{10}$/.test(r.code) && Math.abs(r.exp - (T + 7 * DAY)) < 5 && r.svc === 30, JSON.stringify(r));
const IC = r.code;
ok('邀请码用掉一个名额，记下谁兑换的', (await inv(INV)).used === 1 && (await inv(INV)).reds[0].uid === uA && (await inv(INV)).reds[0].code === IC);
let me = await call(UA, '/api/account/me', null, 'GET');
ok('账号页「我的安装码」里有它', me.inst.length === 1 && me.inst[0].code === IC && me.inst[0].kind === 'inst' && me.inst[0].svc === 30, JSON.stringify(me.inst));
ok('安装码不能再拿去兑换', /已经是你的安装码/.test((await call(UA, '/api/account/redeem', { code: IC })).error));
ok('别人的安装码也不能兑换', /别人的安装码/.test((await call(UB, '/api/account/redeem', { code: IC })).error));
// 3. 用安装码装：自动加到账号，当主账号
const D = await (await reg(IC, '5.5.5.2')).json();
ok('用安装码装：开通成功，告诉安装程序已经加到账号里', D.sub && D.bound === true && Math.abs(D.exp - (T + 30 * DAY)) < 5, JSON.stringify(D));
const dd = await dev(D.sub);
ok('路由器加到这个账号里，他是主账号', dd.owner === uA && dd.users.join() === uA && (await hub().ctx.storage.get('u:' + uA)).devs.some((x) => x.sub === D.sub));
me = await call(UA, '/api/account/me', null, 'GET');
ok('装好以后「我的安装码」里没了，「我的路由器」里有了', !me.inst.length && me.devs.some((x) => x.sub === D.sub && x.role === 'main'));
ok('同一个安装码不能装第二台', (await reg(IC, '5.5.5.3')).status === 403);
ok('这台路由器的操作记录里写着开通、谁是主账号', ((await hub().ctx.storage.get('rl:' + D.sub)) || []).some((x) => /开通托管服务/.test(x.x) && /主账号/.test(x.x)));
// 4. 名额用完、过期
r = await call(UB, '/api/account/redeem', { code: INV });
ok('B 兑换第二个名额', r.st === 200);
const IC2 = r.code;
ok('邀请码名额用完了：再兑换说用完了', /用完/.test((await call(UA, '/api/account/redeem', { code: INV })).error));
// B 的安装码 7 天没用：过期清掉，名额还给邀请码
{ const i = await inv(IC2); i.exp = T - 1; await hub().ctx.storage.put('i:' + IC2, i); }
const L = (await (await adm('GET', '/invites')).json()).list;
ok('过期没用的安装码清掉，名额还给邀请码，记下「退回」', !(await inv(IC2)) && (await inv(INV)).used === 1 && (await inv(INV)).reds.find((x) => x.code === IC2).back > 0);
ok('管理后台的邀请码列表里能看到兑换记录', L.find((x) => x.code === INV).reds.length === 2);
ok('过期的安装码在路由器上用不了', (await reg(IC2, '5.5.5.4')).status === 403);
// 5. 手上没用的安装码最多 5 个
const BIG = (await (await adm('POST', '/invites', { max: 20 })).json()).invite.code;
for (let i = 0; i < 5; i++) await call(UB, '/api/account/redeem', { code: BIG });
r = await call(UB, '/api/account/redeem', { code: BIG });
ok('手上没用的安装码最多 5 个', r.st === 400 && /5 个/.test(r.error), JSON.stringify(r));
// 6. 过期的邀请码
const OLD = (await (await adm('POST', '/invites', { max: 5, days: 1 })).json()).invite.code;
{ const i = await inv(OLD); i.exp = T - 1; await hub().ctx.storage.put('i:' + OLD, i); }
ok('过期的邀请码：说过期了', /过期/.test((await call(UA, '/api/account/redeem', { code: OLD })).error));
// 7. 开了邮件：邮箱没验证不能兑换
env.RESEND_API_KEY = RK;
ok('邮箱没验证（开了邮件验证时）：不能兑换', /验证邮箱/.test((await call(UA, '/api/account/redeem', { code: BIG })).error));
ok('记进操作记录', ((await (await adm('GET', '/log')).json()).list).some((x) => x.op === 'redeem') && ((await (await adm('GET', '/log')).json()).list).some((x) => x.op === 'inst-used'));

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

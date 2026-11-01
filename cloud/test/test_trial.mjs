// 试用期和续期码：试用码开通的路由器有到期时间；提前 3 天提醒；到期暂停（网址打不开、云端停）；续期码续上马上恢复；管理员封禁的续期也不解封；不限期的不用续
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
let T = Date.now(); const realNow = Date.now; Date.now = () => T;
// 记下推送给路由器的通知（Watch.push）
const PUSH = [];
const origPush = mod.Watch.prototype.push; mod.Watch.prototype.push = async function (m) { PUSH.push(m); return 1; };
// 账号：直接写进存储（注册流程在别的测试里测过）
const sid = 's'.repeat(32), sidB = 'b'.repeat(32);
await hub().ctx.storage.put({ ['u:u1']: { uid: 'u1', email: 'alice@x.com', devs: [] }, ['s:' + sid]: { uid: 'u1', exp: T + 30 * DAY }, ['u:u2']: { uid: 'u2', email: 'bob@x.com', devs: [] }, ['s:' + sidB]: { uid: 'u2', exp: T + 30 * DAY } });
const acc = (s, path, b) => api('POST', '/api/account/' + path, b, { cookie: 'sid=' + s, origin: 'https://panel.example' });
const me = async (s) => (await (await api('GET', '/api/account/me', null, { cookie: 'sid=' + s })).json());

let r = await (await adm('POST', '/invites', { max: 20, days: 7, note: '酷安', svc: 7 })).json();
const TRIAL = r.invite.code;
ok('生成试用邀请码：7 天内能用来开通，开通后能用 7 天', r.ok && r.invite.svc === 7 && r.invite.exp > T, JSON.stringify(r.invite));
const PERM = (await (await adm('POST', '/invites', { max: 5 })).json()).invite.code;
const A = await (await reg(TRIAL, '2.2.2.1')).json();
ok('用试用码开通：到期时间 = 7 天后', A.sub && A.exp && Math.abs(A.exp - (T + 7 * DAY)) < 5000, JSON.stringify({ exp: A.exp }));
const P = await (await reg(PERM, '2.2.2.2')).json();
ok('普通邀请码开通：不限期', P.sub && P.exp === 0);
// 绑定到 alice 的账号
await hub().ctx.storage.put('u:u1', { uid: 'u1', email: 'alice@x.com', devs: [{ sub: A.sub, at: T }, { sub: P.sub, at: T }] });
let m = await me(sid);
ok('官网账号页看得到到期时间', m.devs.find((d) => d.sub === A.sub).exp === A.exp && m.devs.find((d) => d.sub === P.sub).exp === 0);
r = await (await api('POST', '/api/dev/info', { sub: A.sub, rkey: A.rkey })).json();
ok('路由器凭钥匙查自己的到期时间', r.exp === A.exp && r.off === false);
ok('钥匙不对查不到', (await api('POST', '/api/dev/info', { sub: A.sub, rkey: P.rkey })).status === 403);

// 生成续期码
r = await (await adm('POST', '/renewals', { days: 90, count: 3, note: 'alice' })).json();
const [K1, K2, K3] = r.list.map((x) => x.code);
ok('管理员一次生成 3 个 90 天的续期码', r.ok && r.list.length === 3 && r.list.every((x) => x.days === 90 && /^[A-Z2-9]{10}$/.test(x.code)));
ok('续期码列表', (await (await adm('GET', '/renewals')).json()).list.length === 3);
ok('续期码不能当邀请码用', (await reg(K1, '2.2.2.3')).status === 403);

// 到期前 3 天提醒（只提醒一次）
T += 3.5 * DAY; await hub().cleanup();
ok('还剩 3.5 天：还没提醒（3 天以内才提醒）', !PUSH.some((x) => /到期/.test(x.title)));
T += 1 * DAY; PUSH.length = 0; await hub().cleanup();
ok('还剩不到 3 天：推送提醒「托管服务 xx 到期」', PUSH.some((x) => /^托管服务 \d{4}-\d\d-\d\d 到期$/.test(x.title)), PUSH.map((x) => x.title).join('|'));
PUSH.length = 0; T += 3600e3; await hub().cleanup();
ok('提醒只推一次；不限期的那台也不提醒', !PUSH.length);

// 到期：暂停
T = A.exp + 60e3; PUSH.length = 0;
const dnsBefore = CF.dns.size;
await hub().cleanup();
let d = await dev(A.sub);
ok('到期：自动暂停，子域名删掉（网址打不开）', d.off && d.offWhy === 'exp' && CF.dns.size === dnsBefore - 1);
ok('到期推送「已到期，已暂停」，说清楚家里上网不受影响、怎么续', PUSH.some((x) => /已到期，已暂停/.test(x.title) && /不受影响/.test(x.body) && /续期/.test(x.body)));
ok('到期后云端心跳被拒（推送、备份、断线判断都停）', (await req('POST', 'https://' + A.host + '/cloud/beat/r/' + A.rkey, {})).status === 404);
ok('不限期的那台照常', !(await dev(P.sub)).off);
m = await me(sid);
ok('官网账号页显示「已到期」', m.devs.find((x) => x.sub === A.sub).expired === true);

// 续期
ok('续期码不对：拒绝', (await acc(sid, 'renew', { sub: A.sub, code: 'ZZZZZZZZZZ' })).status === 400);
ok('别人的账号不能给这台续期', (await acc(sidB, 'renew', { sub: A.sub, code: K1 })).status === 404);
PUSH.length = 0;
r = await (await acc(sid, 'renew', { sub: A.sub, code: K1.toLowerCase() })).json();
d = await dev(A.sub);
ok('在官网账号页输入续期码（不分大小写）：续上 90 天（从今天算）', r.ok && Math.abs(r.exp - (T + 90 * DAY)) < 5000 && d.exp === r.exp, JSON.stringify(r));
ok('到期暂停的：续期后马上恢复，子域名加回来', !d.off && !d.offWhy && CF.dns.size === dnsBefore && (await req('POST', 'https://' + A.host + '/cloud/beat/r/' + A.rkey, {})).status === 200);
ok('续期成功推送到手机', PUSH.some((x) => /已续期/.test(x.title)));
ok('续期码只能用一次', (await acc(sid, 'renew', { sub: A.sub, code: K1 })).status === 400);
ok('不限期的路由器不用续期', /不限期/.test((await (await acc(sid, 'renew', { sub: P.sub, code: K2 })).json()).error));
const exp1 = d.exp;
r = await (await api('POST', '/api/dev/renew', { sub: A.sub, rkey: A.rkey, code: K2 })).json();
ok('路由器上也能输续期码：没到期时在原到期时间上再加 90 天', r.ok && r.exp === exp1 + 90 * DAY, JSON.stringify(r));
ok('路由器钥匙不对：不能续', (await api('POST', '/api/dev/renew', { sub: A.sub, rkey: 'x'.repeat(32), code: K3 })).status === 403);
const kl = (await (await adm('GET', '/renewals')).json()).list;
ok('管理页能看到续期码给哪台用了', kl.find((x) => x.code === K1).sub === A.sub && kl.find((x) => x.code === K1).used > 0);

// 管理员封禁的：续期也不解封
await adm('POST', '/devices/' + A.sub + '/off');
await acc(sid, 'renew', { sub: A.sub, code: K3 });
ok('管理员封禁的：续期只加天数，不会自动解封', (await dev(A.sub)).off && (await dev(A.sub)).offWhy === 'admin');
await adm('POST', '/devices/' + A.sub + '/on');

// 暂停 30 天还没续：删掉，腾出名额
const TRIAL2 = (await (await adm('POST', '/invites', { max: 1, days: 1, svc: 7 })).json()).invite.code;
const B = await (await reg(TRIAL2, '2.2.2.9')).json();
T = B.exp + 60e3; await hub().cleanup();
ok('另一台试用到期：暂停', (await dev(B.sub)).off);
T += 31 * DAY; const cnt0 = (await (await api('GET', '/api/ping')).json()).count; await hub().cleanup();
ok('暂停超过 30 天还没续：删掉，腾出名额', !(await dev(B.sub)) && (await (await api('GET', '/api/ping')).json()).count === cnt0 - 1);
ok('作废续期码', (await adm('DELETE', '/renewals/' + K3)).status === 200 && !(await (await adm('GET', '/renewals')).json()).list.some((x) => x.code === K3));

mod.Watch.prototype.push = origPush; Date.now = realNow;
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] !== undefined && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

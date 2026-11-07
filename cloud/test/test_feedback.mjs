// 问题反馈：路由器面板发来（凭钥匙），管理页看、标处理好、删除，发邮件提醒管理员
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

const cfgA = await env.W.get('dev:' + A.sub).getCfg();
const fb = (b) => api('POST', '/api/dev/feedback', b);
MAILS.length = 0;
r = await fb({ sub: A.sub, rkey: cfgA.rkey, text: '一键更新一直停在准备更新', contact: '微信 ming', diag: '面板版本：2.0.6\n代理插件：PassWall（正在用）' });
ok('[反馈] 路由器凭钥匙发来：成功', r.status === 200, r.status);
let L = (await (await adm('GET', '/feedback')).json()).list;
ok('[反馈] 管理页能看到：内容、联系方式、路由器信息、绑定的账号', L.length === 1 && L[0].text === '一键更新一直停在准备更新' && L[0].contact === '微信 ming' && /PassWall/.test(L[0].diag) && L[0].emails.includes('alice@x.com') && L[0].sub === A.sub && !L[0].done, JSON.stringify(L));
ok('[反馈] 发邮件提醒管理员（带内容和账号）', MAILS.some((m) => m.to === 'boss@x.com' || (Array.isArray(m.to) && m.to.includes('boss@x.com'))) && MAILS.some((m) => /问题反馈/.test(m.subject) && /一键更新/.test(m.html) && /alice@x\.com/.test(m.html)), JSON.stringify(MAILS.map((m) => m.subject)));
ok('[反馈] 邮件里的内容转义了，不会被当成网页代码', (await fb({ sub: A.sub, rkey: cfgA.rkey, text: '<img src=x onerror=alert(1)>' })).status === 200 && MAILS.every((m) => !/<img src=x/.test(m.html)));
ok('[反馈] 钥匙不对：拒绝', (await fb({ sub: A.sub, rkey: 'x'.repeat(32), text: '随便写写看看' })).status === 403);
ok('[反馈] 太短：报错', (await fb({ sub: A.sub, rkey: cfgA.rkey, text: '啊' })).status === 400);
const long = await fb({ sub: A.sub, rkey: cfgA.rkey, text: '很长'.repeat(1500) });
L = (await (await adm('GET', '/feedback')).json()).list;
ok('[反馈] 太长的截到 2000 字', long.status === 200 && L[0].text.length === 2000);
let n429 = 0; for (let i = 0; i < 4; i++) if ((await fb({ sub: A.sub, rkey: cfgA.rkey, text: '再发一条试试看' })).status === 429) n429++;
ok('[反馈] 一台路由器一天最多 5 条', n429 >= 2, n429);
const id = L.find((x) => /一键更新/.test(x.text)).id;
r = await (await adm('POST', '/feedback/' + id + '/done', { done: true })).json();
L = (await (await adm('GET', '/feedback')).json()).list;
ok('[反馈] 标成处理好了', r.ok && L.find((x) => x.id === id).done > 0);
await adm('POST', '/feedback/' + id + '/done', { done: false });
L = (await (await adm('GET', '/feedback')).json()).list;
ok('[反馈] 再标回没处理', L.find((x) => x.id === id).done === 0);
r = await (await adm('DELETE', '/feedback/' + id)).json();
L = (await (await adm('GET', '/feedback')).json()).list;
ok('[反馈] 删除', r.ok && !L.some((x) => x.id === id));
ok('[反馈] 没有管理员密钥看不了', (await api('GET', '/api/admin/feedback')).status === 401);

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

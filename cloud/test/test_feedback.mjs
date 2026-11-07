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
// 标已修复 / 撤回时发邮件给对方（可写补充说明），每次记一条处理记录
{
	const F0 = L.find((x) => x.id === id);
	ok('[回复] 列表里算好了能发给谁：路由器绑定的账号邮箱', JSON.stringify(F0.mailTo) === JSON.stringify(['alice@x.com']), JSON.stringify(F0.mailTo));
	let m0 = MAILS.length;
	r = await (await adm('POST', '/feedback/' + id + '/done', { done: true, note: '已在 3.0.1 修好，\n到面板「一键更新」更新一下 <b>就行</b>', mail: true })).json();
	let M = MAILS.slice(m0);
	ok('[回复] 标为已修复 + 发邮件：发给 alice，标题「已修复」', r.ok && JSON.stringify(r.mailed) === '["alice@x.com"]' && M.length === 1 && M[0].to[0] === 'alice@x.com' && M[0].subject === '你反馈的问题已修复', JSON.stringify(r) + JSON.stringify(M.map((x) => [x.to, x.subject])));
	ok('[回复] 邮件里有补充说明（换行保留、HTML 转义）和对方当时写的内容', /已在 3\.0\.1 修好，<br>到面板/.test(M[0].html) && /&lt;b&gt;就行&lt;\/b&gt;/.test(M[0].html) && !/<b>就行/.test(M[0].html) && /一键更新一直停在准备更新/.test(M[0].html) && /已经修复了/.test(M[0].html));
	L = (await (await adm('GET', '/feedback')).json()).list;
	let F1 = L.find((x) => x.id === id);
	ok('[回复] 记下处理记录：已修复、说明、发给谁', F1.done > 0 && F1.acts.at(-1).done === 1 && /3\.0\.1/.test(F1.acts.at(-1).note) && F1.acts.at(-1).mailed[0] === 'alice@x.com', JSON.stringify(F1.acts));
	const nActs = F1.acts.length;
	m0 = MAILS.length;
	r = await (await adm('POST', '/feedback/' + id + '/done', { done: false, note: '还有一种情况没修好', mail: true })).json();
	M = MAILS.slice(m0);
	ok('[回复] 撤回为未修复也能发邮件：标题「还在处理中」，有说明', r.ok && M.length === 1 && M[0].subject === '你反馈的问题还在处理中' && /还有一种情况没修好/.test(M[0].html) && /还在继续处理/.test(M[0].html));
	m0 = MAILS.length;
	r = await (await adm('POST', '/feedback/' + id + '/done', { done: true, note: '只记给自己看' })).json();
	L = (await (await adm('GET', '/feedback')).json()).list; F1 = L.find((x) => x.id === id);
	ok('[回复] 不勾发邮件：不发，只改状态、记录里写「没发」', r.ok && MAILS.length === m0 && F1.done > 0 && F1.acts.length === nActs + 2 && F1.acts.at(-1).mailed.length === 0 && F1.acts.at(-1).note === '只记给自己看');
	await adm('POST', '/feedback/' + id + '/done', { done: false });
	// 官网报告：联系方式里写了邮箱就能回；安装失败（没留联系方式）发不了
	await api('POST', '/api/report', { kind: 'other', text: '官网的常见问题页打不开，一直转圈圈', contact: 'QQ 12345 / Me.Test@example.org' }, { 'cf-connecting-ip': '7.7.7.1' });
	await api('POST', '/api/report', { kind: 'install', text: '安装失败：失败的步骤 下载', log: 'xxx' }, { 'cf-connecting-ip': '7.7.7.2' });
	L = (await (await adm('GET', '/feedback')).json()).list;
	const W1 = L.find((x) => /常见问题页/.test(x.text)), W2 = L.find((x) => x.kind === 'install');
	ok('[回复] 官网报告：从联系方式里认出邮箱', W1 && JSON.stringify(W1.mailTo) === '["Me.Test@example.org"]', JSON.stringify(W1 && W1.mailTo));
	m0 = MAILS.length;
	r = await (await adm('POST', '/feedback/' + W1.id + '/done', { done: true, mail: true })).json();
	ok('[回复] 官网报告标已修复：邮件发到联系方式里的邮箱（没写说明也行）', r.ok && MAILS.length === m0 + 1 && MAILS[m0].to[0] === 'Me.Test@example.org' && !/补充说明/.test(MAILS[m0].html));
	m0 = MAILS.length;
	r = await (await adm('POST', '/feedback/' + W2.id + '/done', { done: true, mail: true })).json();
	ok('[回复] 没留邮箱的：照样标已修复，告诉管理员「对方没留邮箱」，不发', r.ok && MAILS.length === m0 && r.mailErr === '对方没留邮箱' && W2.mailTo.length === 0);
	const RK2 = env.RESEND_API_KEY; delete env.RESEND_API_KEY;
	r = await (await adm('POST', '/feedback/' + W1.id + '/done', { done: false, mail: true })).json();
	ok('[回复] 邮件服务没设置：状态照改，说清楚原因', r.ok && /RESEND_API_KEY/.test(r.mailErr));
	env.RESEND_API_KEY = RK2;
	ok('[回复] 没有管理员密钥不能改', (await api('POST', '/api/admin/feedback/' + id + '/done', { done: true, mail: true })).status === 401);
	L = (await (await adm('GET', '/feedback')).json()).list;
}
r = await (await adm('DELETE', '/feedback/' + id)).json();
L = (await (await adm('GET', '/feedback')).json()).list;
ok('[反馈] 删除', r.ok && !L.some((x) => x.id === id));
ok('[反馈] 没有管理员密钥看不了', (await api('GET', '/api/admin/feedback')).status === 401);

/* ---------- 截图 ---------- */
const jpg = (n) => { const u = new Uint8Array(n); u[0] = 0xff; u[1] = 0xd8; for (let i = 2; i < n; i++) u[i] = (i * 7) & 255; return u; };
const b64 = (u) => Buffer.from(u).toString('base64');
const big = jpg(300 * 1024), small = jpg(5000);
const cfgB = await env.W.get('dev:' + B.sub).getCfg();
r = await fb({ sub: B.sub, rkey: cfgB.rkey, text: '截图里这个按钮点不动', images: ['data:image/jpeg;base64,' + b64(big), 'data:image/png;base64,' + b64(small), 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/jpeg;base64,' + b64(small)] });
L = (await (await adm('GET', '/feedback')).json()).list;
const F = L.find((x) => /按钮点不动/.test(x.text));
ok('[截图] 只看前 3 个，不是图片的不要：收到 2 张', r.status === 200 && F && F.imgs.length === 2 && F.imgs[0].type === 'image/jpeg' && F.imgs[1].type === 'image/png', JSON.stringify(F && F.imgs));
let ir = await adm('GET', '/feedback/' + F.id + '/img/0'), got = new Uint8Array(await ir.arrayBuffer());
ok('[截图] 300KB 的大图切块存，取回来一模一样，类型对', ir.status === 200 && ir.headers.get('content-type') === 'image/jpeg' && got.length === big.length && got.every((v, i) => v === big[i]));
ok('[截图] 没有管理员密钥拿不到', (await api('GET', '/api/admin/feedback/' + F.id + '/img/0')).status === 401);
ok('[截图] 第二张也能取，不存在的第三张 404', (await adm('GET', '/feedback/' + F.id + '/img/1')).status === 200 && (await adm('GET', '/feedback/' + F.id + '/img/2')).status === 404);
ok('[截图] 邮件里写着附了几张截图', MAILS.some((m) => /附了 2 张截图/.test(m.html)));
const keysBefore = [...(await hub().ctx.storage.list({ prefix: 'fbi:' + F.id })).keys()].length;
await adm('DELETE', '/feedback/' + F.id);
const keysAfter = [...(await hub().ctx.storage.list({ prefix: 'fbi:' + F.id })).keys()].length;
ok('[截图] 删反馈时截图一起删掉', keysBefore >= 4 && keysAfter === 0, keysBefore + ' → ' + keysAfter);
ok('[截图] 太大的图（超过 1.5MB）不收', (await fb({ sub: C.sub, rkey: (await env.W.get('dev:' + C.sub).getCfg()).rkey, text: '大图测试一下', images: ['data:image/jpeg;base64,' + b64(jpg(1600 * 1024))] })).status === 200 && (await (await adm('GET', '/feedback')).json()).list[0].imgs.length === 0);

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

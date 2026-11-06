// 管理页删除路由器：先进回收站（30 天内能恢复）、要输入编号确认、受保护的不能删、发邮件告诉用户、满 30 天彻底删除
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
// 账号：直接写进存储（注册流程在别的测试里测过）
const sid = 's'.repeat(32), sidB = 'b'.repeat(32);
await hub().ctx.storage.put({ ['u:u1']: { uid: 'u1', email: 'alice@x.com', devs: [] }, ['s:' + sid]: { uid: 'u1', exp: T + 30 * DAY }, ['u:u2']: { uid: 'u2', email: 'bob@x.com', devs: [] }, ['s:' + sidB]: { uid: 'u2', exp: T + 30 * DAY } });
const acc = (s, path, b) => api('POST', '/api/account/' + path, b, { cookie: 'sid=' + s, origin: 'https://panel.example' });
const me = async (s) => (await (await api('GET', '/api/account/me', null, { cookie: 'sid=' + s })).json());

const bind = async (uid, sub) => { const u = await hub().ctx.storage.get('u:' + uid), d = await dev(sub); u.devs = [...(u.devs || []), { sub, at: T }]; d.users = [...(d.users || []), uid]; await hub().ctx.storage.put({ ['u:' + uid]: u, ['d:' + sub]: d }); };
const dnsOf = async (sub) => (await dev(sub)).dns;
const tunOf = async (sub) => (await dev(sub)).tunnel;
let r = await (await adm('POST', '/invites', { max: 20 })).json();
const INV = r.invite.code;
const A = await (await reg(INV, '3.3.3.1')).json(), B = await (await reg(INV, '3.3.3.2')).json(), Cc = await (await reg(INV, '3.3.3.3')).json(), O = await (await reg(INV, '3.3.3.4')).json();
await bind('u1', A.sub); await bind('u1', B.sub); await bind('u2', Cc.sub);
// 管理员自己的账号（邮箱 = ADMIN_EMAIL）
await hub().ctx.storage.put({ ['u:u9']: { uid: 'u9', email: 'boss@x.com', devs: [] }, ['e:boss@x.com']: 'u9' });
env.ADMIN_EMAIL = 'boss@x.com'; await bind('u9', O.sub);
ok('准备：开通 4 台，绑好账号', A.sub && B.sub && Cc.sub && O.sub && (await dev(A.sub)).users.includes('u1'));

/* ---------- 删除要输入编号 ---------- */
const del = (sub, confirm) => adm('POST', '/devices/' + sub + '/delete', confirm === undefined ? {} : { confirm });
r = await del(A.sub); ok('删除：没输入编号 → 不删', r.status === 400 && /输入这台路由器的编号/.test((await r.json()).error) && !(await dev(A.sub)).off);
r = await del(A.sub, 'abcdefgh'); ok('删除：编号输错 → 不删', r.status === 400 && !(await dev(A.sub)).off);
/* ---------- 受保护的不能删 ---------- */
r = await del(O.sub, O.sub); ok('管理员自己账号上的路由器：自动受保护，不能删', r.status === 403 && /受保护/.test((await r.json()).error) && !(await dev(O.sub)).off);
let L = (await (await adm('GET', '/devices')).json());
ok('管理页列表：标出受保护、带回收站天数', L.list.find((x) => x.sub === O.sub).prot === true && L.list.find((x) => x.sub === A.sub).prot === false && L.trashDays === 30);
await adm('POST', '/devices/' + Cc.sub + '/protect'); r = await del(Cc.sub, Cc.sub);
ok('手动标「保护」的：也不能删', r.status === 403 && !(await dev(Cc.sub)).off);
await adm('POST', '/devices/' + Cc.sub + '/unprotect');
ok('取消保护后：列表里不再标受保护', (await (await adm('GET', '/devices')).json()).list.find((x) => x.sub === Cc.sub).prot === false);

/* ---------- 删除 = 放进回收站 ---------- */
const tunA = await tunOf(A.sub), tunnelsBefore = CF.tunnels.size;
MAILS.length = 0; PUSH.length = 0;
r = await (await del(A.sub, A.sub.toUpperCase())).json();
let dA = await dev(A.sub);
ok('删除（编号大小写不敏感）：进回收站，网址停用', r.ok && dA.off && dA.offWhy === 'deleted' && dA.delAt === T && !dA.dns, JSON.stringify({ off: dA.off, why: dA.offWhy, dns: dA.dns }));
ok('回收站里：隧道还在（恢复时用户什么都不用做）', CF.tunnels.size === tunnelsBefore && dA.tunnel === tunA);
ok('回收站里：30 天后彻底删除', r.purgeAt === T + 30 * DAY);
ok('删除：推送告诉用户「已被停用，某日前可以恢复」', PUSH.some((x) => /已被停用/.test(x.title) && /前联系提供服务的人可以恢复/.test(x.body)));
ok('删除：发邮件给绑定的账号，写清家里上网不受影响、几号前能恢复', MAILS.some((m) => m.to[0] === 'alice@x.com' && /已被停用/.test(m.subject) && /家里上网/.test(m.html) && /前<\/b>联系提供服务的人可以恢复/.test(m.html)) && r.mailed === true);
let m = await me(sid);
ok('账号页：这台显示「已被停用」，带可以恢复的期限', m.devs.find((x) => x.sub === A.sub).trashed === T + 30 * DAY && m.devs.find((x) => x.sub === A.sub).off === true);
r = await del(A.sub, A.sub); ok('已经在回收站的：不能再删一次', r.status === 400);
L = (await (await adm('GET', '/devices')).json()).list.find((x) => x.sub === A.sub);
ok('管理页列表：回收站里的带「彻底删除日期」', L.purgeAt === T + 30 * DAY);

/* ---------- 恢复 ---------- */
MAILS.length = 0; PUSH.length = 0;
r = await (await adm('POST', '/devices/' + A.sub + '/restore')).json();
dA = await dev(A.sub);
ok('恢复：网址马上回来，隧道还是原来那个', r.ok && !dA.off && !dA.offWhy && !dA.delAt && dA.dns && dA.tunnel === tunA);
ok('恢复：推送 + 发邮件告诉用户恢复了、什么都不用做', PUSH.some((x) => /恢复了/.test(x.title)) && MAILS.some((x) => /恢复了/.test(x.subject) && /什么都不用做/.test(x.html)));
r = await adm('POST', '/devices/' + A.sub + '/restore'); ok('不在回收站的：不能恢复', r.status === 404);

/* ---------- 彻底删除 ---------- */
r = await adm('POST', '/devices/' + A.sub + '/purge', { confirm: A.sub }); ok('不在回收站的：不能直接彻底删除', r.status === 400 && (await dev(A.sub)));
await del(A.sub, A.sub);
r = await adm('POST', '/devices/' + A.sub + '/purge', {}); ok('彻底删除：没输编号 → 不删', r.status === 400 && (await dev(A.sub)));
MAILS.length = 0;
r = await (await adm('POST', '/devices/' + A.sub + '/purge', { confirm: A.sub })).json();
ok('彻底删除：路由器、隧道都删掉，从账号里移除', r.ok && !(await dev(A.sub)) && !CF.tunnels.has(tunA) && !(await hub().ctx.storage.get('u:u1')).devs.some((x) => x.sub === A.sub));
const pm = MAILS.find((x) => /已被删除/.test(x.subject));
ok('彻底删除：邮件里写着怎么用新邀请码重新开通（安装命令、配对码）', pm && pm.to[0] === 'alice@x.com' && /新的邀请码/.test(pm.html) && /install\.sh --invite 新邀请码/.test(pm.html) && /hosted-noai/.test(pm.html) && /配对码/.test(pm.html), pm && pm.html.slice(0, 200));

/* ---------- 回收站满 30 天自动彻底删除 ---------- */
await del(B.sub, B.sub); const tunB = await tunOf(B.sub);
T += 29 * DAY; await hub().cleanup(T);
ok('回收站第 29 天：还在，能恢复', (await dev(B.sub)) && (await dev(B.sub)).offWhy === 'deleted');
MAILS.length = 0; T += 2 * DAY; await hub().cleanup(T);
ok('回收站满 30 天：自动彻底删除，隧道也删了，发邮件告诉怎么重新开通', !(await dev(B.sub)) && !CF.tunnels.has(tunB) && MAILS.some((x) => /已被删除/.test(x.subject) && x.to[0] === 'alice@x.com'));

/* ---------- 放进回收站期间到期了：恢复成「到期暂停」 ---------- */
const E = await (await reg(INV, '3.3.3.5')).json(); await bind('u2', E.sub);
let dE = await dev(E.sub); dE.exp = T + 2 * DAY; await hub().ctx.storage.put('d:' + E.sub, dE);
await del(E.sub, E.sub); T += 5 * DAY;
r = await (await adm('POST', '/devices/' + E.sub + '/restore')).json(); dE = await dev(E.sub);
ok('回收站期间到期了：恢复后是「到期暂停」，续期后自动恢复', r.ok && dE.off && dE.offWhy === 'exp' && !dE.delAt);
r = await (await adm('POST', '/renewals', { days: 30, count: 1 })).json();
await hub().ctx.storage.put('s:' + sidB, { uid: 'u2', exp: T + 30 * DAY });  // 时间往后跳了几十天，测试用的登录也过期了，重新登录
await acc(sidB, 'renew', { sub: E.sub, code: r.list[0].code });
dE = await dev(E.sub);
ok('续期后：网址恢复', !dE.off && dE.dns);

/* ---------- 不是管理员 ---------- */
ok('不是管理员：不能删除 / 恢复 / 彻底删除 / 保护', (await api('POST', '/api/admin/devices/' + Cc.sub + '/delete', { confirm: Cc.sub })).status === 401 && (await api('POST', '/api/admin/devices/' + Cc.sub + '/protect')).status === 401);

mod.Watch.prototype.push = origPush; Date.now = realNow;
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] !== undefined && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

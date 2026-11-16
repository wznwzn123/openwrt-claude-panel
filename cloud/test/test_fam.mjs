// 5.2 主账号 + 子账号：选主账号、加入码、权限、停用、到期、移除、退出、转让、打开面板的票、管理后台改主账号
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const MAIL = [];
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] }));
	if (u.hostname === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return new Response('{}'); }
	if (u.hostname !== 'api.cloudflare.com') return new Response('{}');
	if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 'tun' + Math.random(), token: 'tok' });
	if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'dns' + Math.random() });
	return R({});
};
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const hub = () => env.H.get('hub'), S = () => hub().ctx.storage;
const jar = (name) => ({ name, sid: '' });
let ipn = 0;
async function call(c, path, body) {
	const h = { 'content-type': 'application/json', origin: 'https://panel.example', 'cf-connecting-ip': '1.1.1.' + (++ipn % 200) };
	if (c && (c.sid || c.did)) h.cookie = [c.sid && '__Host-sid=' + c.sid, c.did && '__Host-did=' + c.did].filter(Boolean).join('; ');
	const res = await mod.default.fetch(new Request('https://panel.example' + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
	const sc = res.headers.get('set-cookie');
	if (c && sc) { const m = /sid=([a-z2-9]*);/.exec(sc); if (m || !/did=/.test(sc)) c.sid = m ? m[1] : ''; const d = /did=([a-z2-9]{32});/.exec(sc); if (d) c.did = d[1]; }
	let j = {}; try { j = await res.json(); } catch (e) {}
	return { st: res.status, j };
}
const post = async (path, body, hdr = {}) => { const r = await mod.default.fetch(new Request('https://panel.example' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...hdr }, body: JSON.stringify(body) }), env); let j = {}; try { j = await r.json(); } catch (e) {} return { st: r.status, j }; };
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const admGet = async (path) => { const r = await mod.default.fetch(new Request('https://panel.example' + path, { headers: ADM }), env); return { st: r.status, j: await r.json() }; };
const lastCode = () => (MAIL.slice(-1)[0].html.match(/>(\d{6})</) || [])[1];
const uidOf = async (email) => S().get('e:' + email);
const reg = async (c, email) => { await call(c, '/api/account/register', { email, password: 'pass-' + email.slice(0, 4) + '-123' }); return uidOf(email); };

// 账号（先不开邮件服务，注册不要验证码）
const A = jar('A'), B = jar('B'), C = jar('C'), D = jar('D'), E = jar('E');
const ua = await reg(A, 'alice@x.com'), ub = await reg(B, 'bob@x.com'), uc = await reg(C, 'carol@x.com'), ud = await reg(D, 'dave@x.com'), ue = await reg(E, 'eve@x.com');
// A 领试用、装路由器：A 是主账号
env.TRIAL_DAYS = '7';
const tr = await call(A, '/api/account/trial', {});
const R1 = (await post('/api/register', { invite: tr.j.code, name: 'Home', model: 'AX3000T' }, { 'cf-connecting-ip': '9.9.9.1' })).j;
let me = (await call(A, '/api/account/me')).j, dv = me.devs.find((x) => x.sub === R1.sub);
ok('用官网试用码装的路由器：装好的账号就是主账号', dv && dv.role === 'main' && dv.nsub === 0, JSON.stringify(dv));
// 别人不能再用配对码绑定
const pair = async (R) => (await post('/api/pair/start', { sub: R.sub, rkey: R.rkey })).j.code;
ok('已经有主账号：别人用配对码绑不上，提示找主账号要加入码', /加入码/.test((await call(B, '/api/account/bind', { code: await pair(R1) })).j.error || ''));
// 路由器经面板做主账号的事：要先确认是本人
const fam = (R, op, body) => post('/api/dev/fam/' + op, { sub: R.sub, rkey: R.rkey, ...body });
ok('没确认本人：不能发加入码', (await fam(R1, 'join_create', { uid: ua, name: '妈妈', perms: ['msg'] })).j.sudo === true);
ok('别的路由器的钥匙：不行', (await post('/api/dev/fam/members', { sub: R1.sub, rkey: 'x'.repeat(32), uid: ua })).st === 403);
env.RESEND_API_KEY = 're_test';
ok('发确认验证码到主账号邮箱', (await fam(R1, 'sudo_code', { uid: ua })).j.mail === 'al***@x.com' && MAIL.slice(-1)[0].to[0] === 'alice@x.com');
ok('验证码错：不给凭证', (await fam(R1, 'sudo', { uid: ua, code: lastCode() === '111111' ? '222222' : '111111' })).j.error === '验证码不对');
let SU = (await fam(R1, 'sudo', { uid: ua, code: lastCode() })).j.sudo;
ok('验证码对：拿到 10 分钟的凭证', /^[a-z2-9]{24}$/.test(SU || ''));
ok('凭证不能拿去给别的账号用', (await fam(R1, 'join_create', { uid: ub, sudo: SU, name: 'x' })).j.sudo === true);
// 面板「我的主页」一次拿全（5.2.2）：我是谁、家人、操作记录；带着有效凭证再加上敏感信息
{
	const pg = (await fam(R1, 'page', { uid: ua })).j;
	ok('「我的主页」一次拿全：我是谁（打码邮箱）、家人、操作记录；没带凭证不给敏感信息', pg.ok && pg.me && pg.me.role === 'main' && pg.me.me.email === 'al***@x.com' && pg.me.st === undefined && pg.members && pg.members.ok && Array.isArray(pg.members.subs) && Array.isArray(pg.log) && pg.secret === null, JSON.stringify(pg).slice(0, 300));
	const pg2 = (await fam(R1, 'page', { uid: ua, sudo: SU })).j;
	ok('「我的主页」带着有效凭证：加上敏感信息（完整邮箱、官网设备、登录记录）', pg2.secret && pg2.secret.email === 'alice@x.com' && Array.isArray(pg2.secret.sessions) && Array.isArray(pg2.secret.logins) && pg2.secret.st === undefined, JSON.stringify(pg2.secret).slice(0, 200));
	ok('「我的主页」凭证是乱写的：不给敏感信息', (await fam(R1, 'page', { uid: ua, sudo: 'a'.repeat(24) })).j.secret === null);
	ok('「我的主页」不是这台路由器的成员：什么都不给', (await fam(R1, 'page', { uid: ub, sudo: SU })).j.error && !(await fam(R1, 'page', { uid: ub })).j.me);
	ok('「我的主页」钥匙不对：不给', (await post('/api/dev/fam/page', { sub: R1.sub, rkey: 'x'.repeat(32), uid: ua })).st === 403);
	await S().delete('r:su1:' + ua);
	await fam(R1, 'sudo_code', { uid: ua });
	const v = (await fam(R1, 'sudo', { uid: ua, code: lastCode(), want: 'secret' })).j;
	ok('验证码对、要敏感信息：凭证和敏感信息一起回来（少转发一次）', /^[a-z2-9]{24}$/.test(v.sudo || '') && v.secret && v.secret.email === 'alice@x.com' && v.secret.st === undefined, JSON.stringify(v).slice(0, 200));
	await S().delete('r:su1:' + ua);
	await fam(R1, 'sudo_code', { uid: ua });
	const w = (await fam(R1, 'sudo', { uid: ua, code: lastCode() === '111111' ? '222222' : '111111', want: 'secret' })).j;
	ok('验证码错、要敏感信息：不给凭证也不给敏感信息', w.error === '验证码不对' && !w.secret && !w.sudo);
	const w2 = (await fam(R1, 'sudo', { uid: ua, code: lastCode() })).j;
	ok('没要敏感信息：照旧只回凭证', /^[a-z2-9]{24}$/.test(w2.sudo || '') && w2.secret === undefined);
	SU = w2.sudo;
}
// 加入码
let jc = (await fam(R1, 'join_create', { uid: ua, sudo: SU, name: '妈妈', perms: ['msg', 'node', 'speed', 'bogus'] })).j;
ok('主账号发加入码：8 位、24 小时、带链接', /^[A-Z2-9]{8}$/.test(jc.code || '') && jc.link === 'https://panel.example/app?join=' + jc.code && jc.exp - Date.now() > 23 * 3600e3, JSON.stringify(jc));
let info = (await call(B, '/api/account/fam/join_info', { code: jc.code.toLowerCase() })).j;
ok('家人先看一眼：哪台路由器、谁邀请的（没设名字的显示打码的邮箱开头）、什么权限（不认识的权限去掉）', info.router === 'Home' && info.owner === 'al***' && info.tpl === 'family' && JSON.stringify(info.perms) === '["msg","node","speed"]', JSON.stringify(info));
ok('没登录不能加入', (await call(jar(), '/api/account/fam/join', { code: jc.code })).st === 401);
const n0 = MAIL.length;
ok('家人加入成功', (await call(B, '/api/account/fam/join', { code: jc.code })).j.ok === true);
ok('主账号收到「谁加入了」的邮件', MAIL.length === n0 + 1 && MAIL.slice(-1)[0].to[0] === 'alice@x.com' && /加入了/.test(MAIL.slice(-1)[0].subject));
dv = (await call(B, '/api/account/me')).j.devs.find((x) => x.sub === R1.sub);
ok('子账号的「我的路由器」：标着子账号、主账号是谁、有什么权限', dv && dv.role === 'sub' && dv.owner && dv.owner.name === 'al***' && JSON.stringify(dv.perms) === '["msg","node","speed"]', JSON.stringify(dv));
ok('加入码只能用一次', /不对或已过期/.test((await call(C, '/api/account/fam/join', { code: jc.code })).j.error || ''));
ok('主账号不能加入自己的路由器', await (async () => { const x = (await fam(R1, 'join_create', { uid: ua, sudo: SU, name: 'x' })).j; const r = await call(A, '/api/account/fam/join', { code: x.code }); await fam(R1, 'join_cancel', { uid: ua, sudo: SU, code: x.code }); return /主账号/.test(r.j.error || ''); })());
// 过期的加入码
{ const x = (await fam(R1, 'join_create', { uid: ua, sudo: SU, name: 'x' })).j; const v = await S().get('jc:' + x.code); v.exp = Date.now() - 1; await S().put('jc:' + x.code, v); ok('过期的加入码：不能用', /过期/.test((await call(C, '/api/account/fam/join', { code: x.code })).j.error || '')); }
// 打开面板：一次性票
let op = (await call(A, '/api/account/fam/open', { sub: R1.sub })).j;
const tk = (op.url || '').split('#open=')[1];
ok('主账号点「打开面板」：拿到带一次性票的面板地址', op.url && op.url.startsWith('https://' + R1.sub + '.panel.example/panel/#open=') && /^[a-z2-9]{24}$/.test(tk));
let tt = (await post('/api/dev/ticket', { sub: R1.sub, rkey: R1.rkey, ticket: tk })).j;
ok('路由器拿票换身份：主账号、全部权限', tt.ok && tt.uid === ua && tt.role === 'main' && tt.perms.length === 7, JSON.stringify(tt));
ok('同一张票不能再用', (await post('/api/dev/ticket', { sub: R1.sub, rkey: R1.rkey, ticket: tk })).st === 400);
op = (await call(B, '/api/account/fam/open', { sub: R1.sub })).j;
tt = (await post('/api/dev/ticket', { sub: R1.sub, rkey: R1.rkey, ticket: op.url.split('#open=')[1] })).j;
ok('子账号的票：身份是子账号、只有主账号给的权限', tt.role === 'sub' && tt.uid === ub && JSON.stringify(tt.perms) === '["msg","node","speed"]');
ok('别的路由器拿不了这张票', await (async () => { const o = (await call(B, '/api/account/fam/open', { sub: R1.sub })).j; return (await post('/api/dev/ticket', { sub: 'zzzzzzzz', rkey: R1.rkey, ticket: o.url.split('#open=')[1] })).st === 403; })());
ok('没绑这台路由器的人：打不开', (await call(C, '/api/account/fam/open', { sub: R1.sub })).st === 404);
// 路由器检查权限用的视图
let view = (await post('/api/dev/fam/view', { sub: R1.sub, rkey: R1.rkey })).j;
ok('路由器拿到：主账号、每个子账号的权限', view.owner === ua && view.subs[ub] && view.subs[ub].ok && JSON.stringify(view.subs[ub].perms) === '["msg","node","speed"]');
// 改权限、停用、到期
ok('主账号改子账号权限', (await fam(R1, 'sub_set', { uid: ua, sudo: SU, target: ub, perms: ['msg'] })).j.ok && JSON.stringify((await post('/api/dev/fam/view', { sub: R1.sub, rkey: R1.rkey })).j.subs[ub].perms) === '["msg"]');
ok('子账号不能改别人的权限', (await fam(R1, 'sub_set', { uid: ub, sudo: SU, target: ub, perms: PERM_ALL() })).j.sudo === true);
function PERM_ALL() { return ['msg', 'node', 'speed', 'parent', 'proxy', 'net', 'sys']; }
await fam(R1, 'sub_set', { uid: ua, sudo: SU, target: ub, off: true });
view = (await post('/api/dev/fam/view', { sub: R1.sub, rkey: R1.rkey })).j;
ok('停用子账号：路由器那边标成不能用、记下踢出时间（手机钥匙作废）', view.subs[ub].ok === false && view.kick[ub] > 0);
ok('停用的子账号打不开面板', /停用/.test((await call(B, '/api/account/fam/open', { sub: R1.sub })).j.error || ''));
await fam(R1, 'sub_set', { uid: ua, sudo: SU, target: ub, off: false, subExp: Date.now() + 1000 });
await new Promise((z) => setTimeout(z, 1100));
ok('到期的子账号打不开面板', /期限/.test((await call(B, '/api/account/fam/open', { sub: R1.sub })).j.error || ''));
await fam(R1, 'sub_set', { uid: ua, sudo: SU, target: ub, subExp: 0 });
ok('取消期限：又能打开', !!(await call(B, '/api/account/fam/open', { sub: R1.sub })).j.url);
// 成员列表（面板「我的主页」用）
let mem = (await fam(R1, 'members', { uid: ua })).j;
ok('成员列表：主账号、子账号（邮箱打码）', mem.owner.uid === ua && mem.subs.length === 1 && mem.subs[0].email === 'bo***@x.com' && !JSON.stringify(mem).includes('bob@x.com'));
// 最多 10 个
{ const codes = []; for (let i = 0; i < 9; i++) codes.push((await fam(R1, 'join_create', { uid: ua, sudo: SU, name: 'k' + i })).j.code); ok('子账号 + 没接受的加入码最多 10 个', codes.every(Boolean) && /最多 10/.test((await fam(R1, 'join_create', { uid: ua, sudo: SU, name: 'x' })).j.error || '')); for (const c of codes) await fam(R1, 'join_cancel', { uid: ua, sudo: SU, code: c }); }
// C 加入、自己退出
jc = (await fam(R1, 'join_create', { uid: ua, sudo: SU, name: '卡罗', perms: [] })).j;
await call(C, '/api/account/fam/join', { code: jc.code });
ok('子账号自己退出', (await call(C, '/api/account/fam/leave', { sub: R1.sub })).j.ok && !(await call(C, '/api/account/me')).j.devs.some((x) => x.sub === R1.sub) && /退出/.test(MAIL.slice(-1)[0].subject));
ok('主账号不能直接退出', /转给别人/.test((await call(A, '/api/account/fam/leave', { sub: R1.sub })).j.error || ''));
// 移除子账号
jc = (await fam(R1, 'join_create', { uid: ua, sudo: SU, name: 'D' })).j; await call(D, '/api/account/fam/join', { code: jc.code });
ok('主账号移除子账号：他的账号里就没有这台了，还发邮件告诉他', (await fam(R1, 'sub_remove', { uid: ua, sudo: SU, target: ud })).j.ok && !(await call(D, '/api/account/me')).j.devs.some((x) => x.sub === R1.sub) && MAIL.slice(-1)[0].to[0] === 'dave@x.com');
// 转让
await fam(R1, 'transfer', { uid: ua, sudo: SU, target: ub });
view = (await post('/api/dev/fam/view', { sub: R1.sub, rkey: R1.rkey })).j;
ok('转让：B 成了主账号，A 变成子账号（几乎全部）、A 原来的手机钥匙作废', view.owner === ub && view.subs[ua] && view.subs[ua].perms.length === 7 && view.kick[ua] > 0);
ok('原主账号的凭证不能再做主账号的事', /主账号/.test((await fam(R1, 'join_create', { uid: ua, sudo: SU, name: 'x' })).j.error || ''));
// 老路由器：好几个账号平等绑定，第一次打开面板选主账号
delete env.RESEND_API_KEY;
const R2 = (await post('/api/register', { invite: (await (await mod.default.fetch(new Request('https://panel.example/api/admin/invites', { method: 'POST', headers: { ...ADM, 'content-type': 'application/json' }, body: JSON.stringify({ max: 3, direct: true }) }), env)).json()).invite.code, name: 'Old', model: 'x86' }, { 'cf-connecting-ip': '9.9.9.2' })).j;
await call(C, '/api/account/bind', { code: await pair(R2) });
{ const d = await S().get('d:' + R2.sub); d.users = [uc, ud, ue]; delete d.owner; delete d.subs; await S().put('d:' + R2.sub, d); for (const [u, j] of [[ud, D], [ue, E]]) { const x = await S().get('u:' + u); x.devs = [...(x.devs || []), { sub: R2.sub, at: 1 }]; await S().put('u:' + u, x); } }
env.RESEND_API_KEY = 're_test';
op = (await call(D, '/api/account/fam/open', { sub: R2.sub })).j;
ok('老路由器绑了 3 个账号：打开面板先要选主账号，列出这 3 个人', op.pick === true && op.users.length === 3 && !op.url);
ok('选主账号：验证码发到被选的人邮箱', (await call(D, '/api/account/fam/pick_code', { sub: R2.sub, target: ue })).j.mail === 'ev***@x.com' && MAIL.slice(-1)[0].to[0] === 'eve@x.com');
ok('只能从已绑定的人里选', /只能从/.test((await call(D, '/api/account/fam/pick_code', { sub: R2.sub, target: ua })).j.error || ''));
ok('验证码错：不算', (await call(D, '/api/account/fam/pick', { sub: R2.sub, code: '000000' })).j.error === '验证码不对');
await S().delete('r:pk1:' + R2.sub); await call(D, '/api/account/fam/pick_code', { sub: R2.sub, target: ue });
const n1 = MAIL.length;
ok('验证码对：选好了', (await call(D, '/api/account/fam/pick', { sub: R2.sub, code: lastCode() })).j.ok === true);
view = (await post('/api/dev/fam/view', { sub: R2.sub, rkey: R2.rkey })).j;
ok('被选的人是主账号，其他人自动变子账号（家人）', view.owner === ue && view.subs[uc] && view.subs[ud] && JSON.stringify(view.subs[uc].perms) === '["msg","node","speed"]' && !view.pick);
ok('3 个人都收到邮件通知', MAIL.length === n1 + 3);
ok('选好以后不能再选', /已经有主账号/.test((await call(C, '/api/account/fam/pick_code', { sub: R2.sub, target: uc })).j.error || ''));
// 管理后台
let ag = await admGet('/api/admin/fam/' + R2.sub);
ok('后台看成员：邮箱完整', ag.j.owner.email === 'eve@x.com' && ag.j.subs.some((x) => x.email === 'carol@x.com'));
ok('后台改主账号：不写原因不行', (await post('/api/admin/fam/' + R2.sub + '/owner', { email: 'carol@x.com' }, ADM)).st === 400);
ok('后台按邮箱把主账号换成 carol（原主账号移除）', (await post('/api/admin/fam/' + R2.sub + '/owner', { email: 'carol@x.com', why: '本人联系，邮箱丢了', dropOld: true }, ADM)).j.ok);
view = (await post('/api/dev/fam/view', { sub: R2.sub, rkey: R2.rkey })).j;
ok('换好了：carol 主账号，eve 不在了、手机钥匙作废', view.owner === uc && !view.subs[ue] && view.kick[ue] > 0 && !(await call(E, '/api/account/me')).j.devs.some((x) => x.sub === R2.sub));
ok('后台日志记了原因', ((await admGet('/api/admin/log')).j.list || []).some((x) => /邮箱丢了/.test(x.detail)));
ok('后台改子账号权限', (await post('/api/admin/fam/' + R2.sub + '/sub', { target: ud, perms: ['msg'], why: '家里要求' }, ADM)).j.ok && JSON.stringify((await post('/api/dev/fam/view', { sub: R2.sub, rkey: R2.rkey })).j.subs[ud].perms) === '["msg"]');
ok('后台让账号所有设备退出', (await post('/api/admin/famuser/' + ud + '/kick', { why: '账号被盗' }, ADM)).j.ok && (await call(D, '/api/account/me')).st === 401);
ok('后台改登录邮箱：新邮箱能用，旧邮箱登录不了', (await post('/api/admin/famuser/' + ud + '/email', { email: 'dave2@x.com', why: '本人确认' }, ADM)).j.ok && (await S().get('e:dave2@x.com')) === ud && !(await S().get('e:dave@x.com')));
// 主账号在官网解绑：整台路由器从所有人账号里拿掉
await call(C, '/api/account/sudo_code', {}); await call(C, '/api/account/sudo', { code: lastCode() });
ok('主账号确认本人后解绑：所有人（包括子账号）的账号里都没有这台了', (await call(C, '/api/account/unbind', { sub: R2.sub })).j.all === true && !(await S().get('d:' + R2.sub)).users.length);

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

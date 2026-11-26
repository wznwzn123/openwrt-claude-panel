// 6.0 第 46 项：托管名额——满了照样能注册账号（用户 11/27：名额只管开通托管），领试用 / 开通时说名额已满、用账号邮箱排队；腾出名额按排队先后发邮件，后台能调上限、看排队的人
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const MAILS = [];
let tn = 0;
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (url === 'https://api.resend.com/emails') { MAILS.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); }
	if (u.hostname !== 'api.cloudflare.com') return new Response('{}');
	const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] }));
	const p = u.pathname.replace('/client/v4', '');
	if (m === 'POST' && p === '/accounts/acc1/cfd_tunnel') { tn++; return R({ id: 'tun-' + tn, token: 'tok' }); }
	if (m === 'POST' && p === '/zones/zone1/dns_records') return R({ id: 'dns-' + ++tn });
	return R({});
};
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 'x', CF_ACCOUNT_ID: 'acc1', CF_ZONE_ID: 'zone1', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '2', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
let ipn = 0;
const api = async (method, path, body, h = {}) => { const r = await mod.default.fetch(new Request('https://panel.example' + path, { method, body: body == null ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.1.0.' + ++ipn, ...h } }), env); let j = {}; try { j = await r.json(); } catch (e) {} return { st: r.status, ...j }; };
const adm = (method, path, body) => api(method, '/api/admin' + path, body, { authorization: 'Bearer admin-key-1234567890' });
const inv = (await adm('POST', '/invites', { direct: true, max: 50, svc: 0 })).invite.code;
const reg = () => api('POST', '/api/register', { invite: inv, name: 'R', model: 'M' });
const userReg = (email) => api('POST', '/api/account/register', { email, password: 'Str0ng-pass-123', code: '' });
// 带登录的账号接口（注册时拿到 Cookie）
const sess = async (email) => { const r = await mod.default.fetch(new Request('https://panel.example/api/account/register', { method: 'POST', body: JSON.stringify({ email, password: 'Str0ng-pass-123', code: '' }), headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.2.0.' + ++ipn } }), env); const m = /sid=([a-z2-9]+);/.exec(r.headers.get('set-cookie') || ''); return { ok: r.status === 200, sid: m ? m[1] : '' }; };
const acct = async (sid, a, body = {}) => { const r = await mod.default.fetch(new Request('https://panel.example/api/account/' + a, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.3.0.' + ++ipn, cookie: '__Host-sid=' + sid } }), env); let j = {}; try { j = await r.json(); } catch (e) {} return { st: r.status, ...j }; };
let r = await api('GET', '/api/ping');
ok('没满：ping 说没满（只说满没满，不给数量）', r.full === false && !('count' in r) && !('max' in r), JSON.stringify(r));
ok('没满：能注册账号', (await userReg('a@x.com')).ok === true);
ok('没满：不让排队（直接注册就行）', /直接注册/.test((await api('POST', '/api/account/wait', { email: 'w@x.com' })).error || ''));
const s1 = (await reg()).sub, s2 = (await reg()).sub;
ok('开通到上限（2 台）', !!s1 && !!s2);
r = await api('GET', '/api/ping');
ok('满了：ping 说满了', r.full === true);
const B = await sess('b@x.com');
ok('满了：照样能注册账号（自建版申请尝鲜、反馈要用）', B.ok && !!B.sid, JSON.stringify(B));
r = await acct(B.sid, 'trial');
ok('满了：领试用说托管名额已满', r.st === 403 && r.full === true && /托管名额已满/.test(r.error), JSON.stringify(r));
ok('满了：开通也说名额已满', (await reg()).error === '名额已满，暂时不能开通');
ok('没开发邮件：不能排队（没法通知）', (await api('POST', '/api/account/wait', { email: 'w9@x.com' })).st === 501);
env.RESEND_API_KEY = 're_x';
r = await api('POST', '/api/account/wait', { email: 'W1@X.com' });
ok('满了：能留邮箱排队，告诉排第几', r.ok && r.pos === 1, JSON.stringify(r));
r = await api('POST', '/api/account/wait', { email: 'w1@x.com' });
ok('同一个邮箱再留：不重复，还是第 1', r.ok && r.pos === 1);
ok('第二个人排第 2', (await api('POST', '/api/account/wait', { email: 'w2@x.com' })).pos === 2);
ok('已经注册过的邮箱：不登录不能排（登录后在账号页排）', (await api('POST', '/api/account/wait', { email: 'a@x.com' })).st === 409);
r = await acct(B.sid, 'wait_me');
ok('登录后排队：用账号邮箱，排第 3', r.ok && r.pos === 3, JSON.stringify(r));
ok('没登录不能用账号排队', (await acct('nope', 'wait_me')).st === 401);
ok('邮箱不对', (await api('POST', '/api/account/wait', { email: 'nope' })).st === 400);
let H = await adm('GET', '/health');
ok('后台：现在几台、上限、满没满、排队几个人', H.count === 2 && H.max === 2 && H.maxEnv === 2 && H.full === true && H.wait === 3, JSON.stringify(H));
const W = await adm('GET', '/wait');
ok('后台：看排队的人（按先后）', W.list.length === 3 && W.list[2].email === 'b@x.com' && W.list[0].email === 'w1@x.com' && !W.list[0].sent);
// 删一台：腾出 1 个名额，只给排第一的发邮件
MAILS.length = 0;
await env.H.get('hub').remove(s1);
ok('腾出 1 个名额：给排第一的发邮件（有注册链接）', MAILS.length === 1 && MAILS[0].to.includes('w1@x.com') && /有空位了/.test(MAILS[0].subject) && /panel\.example\/app/.test(MAILS[0].html), JSON.stringify(MAILS.map((m) => m.to)));
H = await adm('GET', '/health');
ok('发过的不算在排队里', H.wait === 2 && H.waitSent === 1, JSON.stringify(H));
delete env.RESEND_API_KEY;
const W1 = await sess('w1@x.com');
ok('排到的人注册了还在队里（还没领到）', W1.ok && (await adm('GET', '/wait')).list.some((x) => x.email === 'w1@x.com'));
r = await acct(W1.sid, 'trial');
env.RESEND_API_KEY = 're_x';
ok('排到的人领到试用，从队里去掉', r.ok === true && !!r.code && !(await adm('GET', '/wait')).list.some((x) => x.email === 'w1@x.com'), JSON.stringify(r));
// 后台调上限
MAILS.length = 0;
ok('后台调上限：范围检查', (await adm('POST', '/max', { max: 0 })).st === 400 && (await adm('POST', '/max', { max: 5000 })).st === 400);
r = await adm('POST', '/max', { max: 10 });
ok('后台把上限调到 10：生效，马上给排队的人发邮件', r.ok && r.max === 10 && r.full === false && MAILS.length === 2 && MAILS[0].to.includes('w2@x.com') && MAILS[1].to.includes('b@x.com') && /领试用或开通/.test(MAILS[0].html), JSON.stringify(r));
delete env.RESEND_API_KEY;
ok('上限调大以后能注册了', (await userReg('c@x.com')).ok === true && (await api('GET', '/api/ping')).full === false);
const L = (await adm('GET', '/log')).list;
ok('操作记录：改上限、给排队的人发邮件', L.some((x) => x.op === 'max') && L.some((x) => x.op === 'wait-mail'));
let pass = 0; for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '  ' + (note || '').slice(0, 400))); if (c) pass++; }
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

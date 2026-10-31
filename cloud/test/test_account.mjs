// 官网账号：注册、登录、会话、配对绑定、解绑、改名、改密码、找回密码、注销、跨站防护、限流、账号之间互相隔离
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);

const MAIL = []; let mailOk = true;
const CF = { n: 0 };
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] }));
	if (u.hostname === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return new Response('{}', { status: mailOk ? 200 : 500 }); }
	if (u.hostname !== 'api.cloudflare.com') return new Response('{}');
	if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 'tun' + ++CF.n, token: 'tok' });
	if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'dns' + ++CF.n });
	return R({});
};
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const hub = () => env.H.get('hub');

// 模拟浏览器：带 cookie、Origin、JSON
const jar = (name) => ({ name, sid: '' });
async function call(c, path, body, extra = {}) {
	const h = { 'content-type': 'application/json', origin: 'https://panel.example', 'cf-connecting-ip': extra.ip || '1.1.1.1', ...(extra.headers || {}) };
	if (c && c.sid) h.cookie = 'sid=' + c.sid;
	const res = await mod.default.fetch(new Request('https://panel.example' + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
	const sc = res.headers.get('set-cookie');
	if (c && sc) { const m = /sid=([a-z2-9]*);/.exec(sc); c.sid = m ? m[1] : ''; c.cookie = sc; }
	let j = {}; try { j = await res.json(); } catch (e) {}
	return { st: res.status, j };
}
const A = jar('A'), B = jar('B'), anon = jar('x');

// 开两台路由器
const inv = (await (await mod.default.fetch(new Request('https://panel.example/api/admin/invites', { method: 'POST', headers: { authorization: 'Bearer admin-key-1234567890', 'content-type': 'application/json' }, body: JSON.stringify({ max: 5 }) }), env)).json()).invite.code;
const regDev = async (ip) => (await (await mod.default.fetch(new Request('https://panel.example/api/register', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify({ invite: inv, name: 'R' + ip }) }), env)).json());
const R1 = await regDev('9.0.0.1'), R2 = await regDev('9.0.0.2');

// ---- 没开邮件服务时：直接注册 ----
ok('没开邮件服务：发验证码返回「还没开通」', (await call(anon, '/api/account/code', { email: 'a@x.com', kind: 'reg' })).st === 501);
ok('邮箱格式不对：拒绝', (await call(A, '/api/account/register', { email: 'nope', password: 'abcdefgh1' })).st === 400);
ok('密码太短：拒绝', (await call(A, '/api/account/register', { email: 'a@x.com', password: 'abc12' })).st === 400);
ok('纯数字密码：拒绝', (await call(A, '/api/account/register', { email: 'a@x.com', password: '12345678' })).st === 400);
let r = await call(A, '/api/account/register', { email: 'Alice@X.com', password: 'alice-pass-1' });
ok('注册成功并自动登录（Cookie：HttpOnly、Secure、SameSite=Lax，30 天）', r.st === 200 && /^[a-z2-9]{32}$/.test(A.sid) && /HttpOnly/.test(A.cookie) && /Secure/.test(A.cookie) && /SameSite=Lax/.test(A.cookie) && /Max-Age=2592000/.test(A.cookie), A.cookie);
ok('会话号不出现在返回内容里', !JSON.stringify(r.j).includes(A.sid));
ok('同一个邮箱（不分大小写）不能再注册', (await call(B, '/api/account/register', { email: 'alice@x.com', password: 'other-pass-1' })).st === 409);
const stored = [...(await hub().ctx.storage.list({ prefix: 'u:' })).values()][0];
ok('密码不明文保存', !JSON.stringify(stored).includes('alice-pass-1') && /^[0-9a-f]{64}$/.test(stored.pw));
r = await call(A, '/api/account/me');
ok('登录后看到自己的邮箱，路由器列表是空的', r.st === 200 && r.j.email === 'alice@x.com' && r.j.devs.length === 0);
ok('没登录：看不到', (await call(anon, '/api/account/me')).st === 401);
ok('乱填的会话号：看不到', (await call({ sid: 'a'.repeat(32) }, '/api/account/me')).st === 401);

// ---- 跨站防护 ----
ok('别的网站发来的请求（Origin 不对）：拒绝', (await call(A, '/api/account/unbind', { sub: 'x' }, { headers: { origin: 'https://evil.example' } })).st === 403);
ok('路由器子域名上的页面发来的也拒绝（只认主域名）', (await call(A, '/api/account/unbind', { sub: 'x' }, { headers: { origin: 'https://' + R1.host } })).st === 403);
ok('不是 JSON 的请求（普通表单）：拒绝', (await call(A, '/api/account/bind', { code: 'x' }, { headers: { 'content-type': 'application/x-www-form-urlencoded' } })).st === 415);

// ---- 配对绑定 ----
const pairOf = async (R) => (await mod.default.fetch(new Request('https://panel.example/api/pair/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sub: R.sub, rkey: R.rkey }) }), env)).json();
ok('拿别的路由器的钥匙要配对码：拒绝', (await (await mod.default.fetch(new Request('https://panel.example/api/pair/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sub: R1.sub, rkey: R2.rkey }) }), env)).status) === 403);
let P = await pairOf(R1);
ok('路由器凭自己的钥匙拿到 8 位配对码，10 分钟有效', /^[A-Z2-9]{8}$/.test(P.code) && P.exp > Date.now() + 590e3, JSON.stringify(P));
ok('没登录不能绑定', (await call(anon, '/api/account/bind', { code: P.code })).st === 401);
ok('配对码不对：拒绝', (await call(A, '/api/account/bind', { code: 'ZZZZZZZZ' })).st === 400);
r = await call(A, '/api/account/bind', { code: P.code.toLowerCase() });
ok('输入配对码（不分大小写）绑定成功', r.st === 200 && r.j.name === 'R9.0.0.1');
ok('配对码只能用一次', (await call(B, '/api/account/register', { email: 'bob@x.com', password: 'bob-pass-12' })).st === 200 && (await call(B, '/api/account/bind', { code: P.code })).st === 400);
r = await call(A, '/api/account/me');
ok('列表里有这台：名字、专属网址、状态', r.j.devs.length === 1 && r.j.devs[0].host === R1.host && r.j.devs[0].name === 'R9.0.0.1' && 'last' in r.j.devs[0]);
ok('列表里没有任何钥匙', !/rkey|tkey|pkey|token/.test(JSON.stringify(r.j)));
// 过期的配对码
P = await pairOf(R2);
const pk = 'p:' + P.code, pv = await hub().ctx.storage.get(pk); pv.exp = Date.now() - 1; await hub().ctx.storage.put(pk, pv);
ok('过期的配对码：拒绝', (await call(B, '/api/account/bind', { code: P.code })).st === 400);
P = await pairOf(R2);
ok('B 绑定第二台', (await call(B, '/api/account/bind', { code: P.code })).st === 200);

// ---- 账号之间隔离 ----
ok('A 改不了 B 的路由器名字', (await call(A, '/api/account/rename', { sub: R2.sub, alias: 'hack' })).st === 404);
await call(A, '/api/account/unbind', { sub: R2.sub });
ok('A 解绑 B 的路由器：B 那边不受影响', (await call(B, '/api/account/me')).j.devs.length === 1);
ok('A 看不到 B 的路由器', !(await call(A, '/api/account/me')).j.devs.some((d) => d.sub === R2.sub));
ok('改名只改自己账号里的显示', (await call(A, '/api/account/rename', { sub: R1.sub, alias: '客厅' })).st === 200 && (await call(A, '/api/account/me')).j.devs[0].name === '客厅');

// ---- 托管版登录码 ----
const lcOf = async (R, code) => { const res = await mod.default.fetch(new Request('https://panel.example/api/dev/logincode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sub: R.sub, rkey: R.rkey, code }) }), env); return { st: res.status, j: await res.json() }; };
ok('没登录拿不到登录码', (await call(anon, '/api/account/logincode', { sub: R1.sub })).st === 401);
ok('账号里没有的路由器：拿不到登录码', (await call(A, '/api/account/logincode', { sub: R2.sub })).st === 404);
let LC = await call(A, '/api/account/logincode', { sub: R1.sub });
ok('绑定了的路由器：拿到 8 位登录码，10 分钟有效', LC.st === 200 && /^[A-Z2-9]{8}$/.test(LC.j.code) && LC.j.exp > Date.now() + 590e3, JSON.stringify(LC.j));
ok('别的路由器拿这个登录码去核对：不对', (await lcOf(R2, LC.j.code)).st === 400);
ok('钥匙不对：拒绝核对', (await lcOf({ sub: R1.sub, rkey: R2.rkey }, LC.j.code)).st === 403);
r = await lcOf(R1, LC.j.code.toLowerCase());
ok('路由器核对登录码（不分大小写）：通过，带上打了码的账号邮箱', r.st === 200 && r.j.ok && r.j.email === 'al***@x.com', JSON.stringify(r.j));
ok('登录码只能用一次', (await lcOf(R1, LC.j.code)).st === 400);
LC = await call(A, '/api/account/logincode', { sub: R1.sub });
{ const k = 'l:' + R1.sub + ':' + LC.j.code, v = await hub().ctx.storage.get(k); v.exp = Date.now() - 1; await hub().ctx.storage.put(k, v); }
ok('过期的登录码：不对', (await lcOf(R1, LC.j.code)).st === 400);
await hub().cleanup();
ok('每天清理时删掉过期的登录码', !(await hub().ctx.storage.get('l:' + R1.sub + ':' + LC.j.code)));
LC = await call(A, '/api/account/logincode', { sub: R1.sub });
await call(A, '/api/account/unbind', { sub: R1.sub });
ok('拿码的账号解绑了这台路由器：登录码作废', (await lcOf(R1, LC.j.code)).st === 400);
P = await pairOf(R1); await call(A, '/api/account/bind', { code: P.code }); await call(A, '/api/account/rename', { sub: R1.sub, alias: '客厅' });
{ let n = 0; for (let i = 0; i < 40; i++) if ((await lcOf(R1, 'ZZZZZZZZ')).st === 429) n++; ok('乱试登录码：一小时 30 次以后就拒绝（前面已经核对过 4 次）', n === 14, n); }

// ---- 自建版路由器：账号里只记网址，不记密钥 ----
let L1 = await call(A, '/api/account/link', { name: '公司', url: 'https://router.example.com/panel/' });
ok('添加自建版路由器', L1.st === 200 && L1.j.ok && !L1.j.stripped, JSON.stringify(L1.j));
let meA = (await call(A, '/api/account/me')).j;
ok('自建版出现在「我的路由器」里（只有名字和网址）', meA.links.length === 1 && meA.links[0].url === 'https://router.example.com/panel/' && meA.links[0].name === '公司' && Object.keys(meA.links[0]).sort().join() === 'at,id,name,url', JSON.stringify(meA.links));
let L2 = await call(A, '/api/account/link', { name: '', url: 'https://home.example.net/cgi-bin/mcp/abcdefghijklmnop1234' });
meA = (await call(A, '/api/account/me')).j;
ok('粘贴登录地址：密钥去掉，只存面板网址', L2.st === 200 && L2.j.stripped === true && meA.links[1].url === 'https://home.example.net/panel/' && !JSON.stringify(meA).includes('abcdefghijklmnop1234'), JSON.stringify(meA.links));
ok('没填名字：用网址当名字', meA.links[1].name === 'home.example.net');
let L3 = await call(A, '/api/account/link', { url: 'https://x.example.org/panel/#login=abcdefghijklmnop1234' });
ok('#login=密钥 的链接：也去掉密钥', L3.st === 200 && L3.j.stripped === true && !JSON.stringify((await call(A, '/api/account/me')).j).includes('abcdefghijklmnop1234'));
ok('同一个网址不能重复添加', (await call(A, '/api/account/link', { url: 'https://router.example.com/panel/' })).st === 400);
for (const bad of ['http://router.example.com/panel/', 'javascript:alert(1)', 'https://user:pw@router.example.com/panel/', 'https://router.example.com/other/', 'hello', 'https://localhost/panel/'])
	ok('不收奇怪的网址：' + bad, (await call(A, '/api/account/link', { url: bad })).st === 400);
ok('托管版网址要用配对码', /配对码/.test((await call(A, '/api/account/link', { url: 'https://' + R1.sub + '.panel.example/panel/' })).j.error || ''));
ok('B 看不到 A 的自建版路由器', ((await call(B, '/api/account/me')).j.links || []).length === 0);
ok('B 删不了 A 的', (await call(B, '/api/account/unlink', { id: L1.j.id })).st === 404);
ok('没登录不能添加', (await call(anon, '/api/account/link', { url: 'https://a.example.com/panel/' })).st === 401);
ok('移除自建版路由器', (await call(A, '/api/account/unlink', { id: L1.j.id })).st === 200 && (await call(A, '/api/account/me')).j.links.length === 2);

// ---- 路由器那边看/移除绑定的账号 ----
P = await pairOf(R1); await call(B, '/api/account/bind', { code: P.code });
const devAcc = async (R, key) => (await mod.default.fetch(new Request('https://panel.example/api/dev/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sub: R.sub, rkey: key }) }), env));
let L = await (await devAcc(R1, R1.rkey)).json();
ok('路由器看到绑定了它的账号（邮箱打码）', L.list.length === 2 && L.list.every((x) => /\*\*\*@|\*@/.test(x.email)) && !JSON.stringify(L).includes('alice@x.com'), JSON.stringify(L));
ok('用别的钥匙看不到', (await devAcc(R1, R2.rkey)).status === 403);
const bobUid = L.list.find((x) => x.email.startsWith('bo')).uid;
await mod.default.fetch(new Request('https://panel.example/api/dev/unbind', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sub: R1.sub, rkey: R1.rkey, uid: bobUid }) }), env);
ok('路由器移除某个账号后，那个账号里就没有这台了', !(await call(B, '/api/account/me')).j.devs.some((d) => d.sub === R1.sub));

// ---- 登录、退出、改密码 ----
const A2 = jar('A2');
ok('密码错：拒绝', (await call(A2, '/api/account/login', { email: 'alice@x.com', password: 'wrong-pass' })).st === 401);
ok('账号不存在和密码错提示一样（不泄露账号是否存在）', (await call(A2, '/api/account/login', { email: 'nobody@x.com', password: 'wrong-pass' })).j.error === '邮箱或密码不对');
ok('正确登录：第二台设备', (await call(A2, '/api/account/login', { email: 'alice@x.com', password: 'alice-pass-1' })).st === 200 && A2.sid && A2.sid !== A.sid);
ok('改密码要原密码', (await call(A, '/api/account/password', { old: 'nope-nope', password: 'alice-pass-2' })).st === 403);
ok('改密码成功', (await call(A, '/api/account/password', { old: 'alice-pass-1', password: 'alice-pass-2' })).st === 200);
ok('改密码后其他设备上的登录被踢掉，当前设备保留', (await call(A2, '/api/account/me')).st === 401 && (await call(A, '/api/account/me')).st === 200);
ok('旧密码登录不了，新密码可以', (await call(jar(), '/api/account/login', { email: 'alice@x.com', password: 'alice-pass-1' })).st === 401 && (await call(jar(), '/api/account/login', { email: 'alice@x.com', password: 'alice-pass-2' })).st === 200);
await call(A2, '/api/account/login', { email: 'alice@x.com', password: 'alice-pass-2' });
r = await call(A2, '/api/account/logout', {});
ok('退出：会话作废，Cookie 清掉', r.st === 200 && A2.sid === '' && (await call({ sid: (await hub().ctx.storage.get('u:' + stored.uid)).sids.slice(-1)[0] }, '/api/account/me')).st === 200);

// ---- 登录限流 ----
let codes = [];
for (let i = 0; i < 11; i++) codes.push((await call(jar(), '/api/account/login', { email: 'bob@x.com', password: 'bad-pass-' + i }, { ip: '5.5.5.' + i })).st);
ok('同一个账号连续输错 10 次：锁 15 分钟（换 IP 也没用）', codes.slice(0, 10).every((c) => c === 401) && codes[10] === 429, codes.join(','));
ok('锁住时正确密码也进不去', (await call(jar(), '/api/account/login', { email: 'bob@x.com', password: 'bob-pass-12' }, { ip: '6.6.6.6' })).st === 429);

// ---- 开了邮件服务：注册要验证码、能找回密码 ----
env.RESEND_API_KEY = 're_test'; env.MAIL_FROM = 'noreply@panel.example';
const C = jar('C');
ok('开了邮件服务：没有验证码不能注册', (await call(C, '/api/account/register', { email: 'carol@x.com', password: 'carol-pass-1' })).st === 400);
r = await call(anon, '/api/account/code', { email: 'carol@x.com', kind: 'reg' }, { ip: '7.7.7.7' });
const code1 = (MAIL.slice(-1)[0].html.match(/>(\d{6})</) || [])[1];
ok('发出注册验证码邮件', r.st === 200 && MAIL.slice(-1)[0].to[0] === 'carol@x.com' && MAIL.slice(-1)[0].from === 'noreply@panel.example' && /^\d{6}$/.test(code1));
ok('1 分钟内不能再发', (await call(anon, '/api/account/code', { email: 'carol@x.com', kind: 'reg' }, { ip: '7.7.7.7' })).st === 429);
ok('验证码错：注册失败', (await call(C, '/api/account/register', { email: 'carol@x.com', password: 'carol-pass-1', code: code1 === '111111' ? '222222' : '111111' })).st === 400);
ok('验证码对：注册成功', (await call(C, '/api/account/register', { email: 'carol@x.com', password: 'carol-pass-1', code: code1 })).st === 200);
ok('已注册的邮箱不发注册验证码', (await call(anon, '/api/account/code', { email: 'carol@x.com', kind: 'reg' })).st === 409);
const n0 = MAIL.length;
ok('找回密码：没注册的邮箱也返回成功，但不发邮件（不泄露谁注册了）', (await call(anon, '/api/account/code', { email: 'ghost@x.com', kind: 'reset' })).st === 200 && MAIL.length === n0);
await hub().ctx.storage.delete('r:m1:alice@x.com');
r = await call(anon, '/api/account/code', { email: 'alice@x.com', kind: 'reset' }, { ip: '8.8.8.8' });
const code2 = (MAIL.slice(-1)[0].html.match(/>(\d{6})</) || [])[1];
ok('发出找回密码邮件', r.st === 200 && /重置密码/.test(MAIL.slice(-1)[0].subject));
let bad = [];
for (let i = 0; i < 5; i++) bad.push((await call(anon, '/api/account/reset', { email: 'alice@x.com', code: String(100000 + i), password: 'alice-pass-3' })).st);
ok('验证码猜错 5 次就作废（再猜对也没用）', bad.every((x) => x === 400) && (await call(anon, '/api/account/reset', { email: 'alice@x.com', code: code2, password: 'alice-pass-3' })).st === 400);
await hub().ctx.storage.delete('r:m1:alice@x.com');
await call(anon, '/api/account/code', { email: 'alice@x.com', kind: 'reset' }, { ip: '8.8.8.9' });
const code3 = (MAIL.slice(-1)[0].html.match(/>(\d{6})</) || [])[1];
const D = jar('D');
r = await call(D, '/api/account/reset', { email: 'alice@x.com', code: code3, password: 'alice-pass-3' });
ok('用验证码重置密码：成功并登录，旧登录全部退出', r.st === 200 && D.sid && (await call(A, '/api/account/me')).st === 401);
ok('重置后账号里的路由器还在', (await call(D, '/api/account/me')).j.devs.some((x) => x.sub === R1.sub));

// ---- 删除路由器、注销账号 ----
await mod.default.fetch(new Request('https://panel.example/api/unregister', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sub: R1.sub, rkey: R1.rkey }) }), env);
ok('路由器卸载后，自动从账号里消失', !(await call(D, '/api/account/me')).j.devs.some((x) => x.sub === R1.sub));
ok('注销账号要密码', (await call(D, '/api/account/delete', { password: 'nope-nope-1' })).st === 403);
r = await call(D, '/api/account/delete', { password: 'alice-pass-3' });
ok('注销账号：账号删除、会话作废、邮箱可以重新注册', r.st === 200 && (await call(D, '/api/account/me')).st === 401 && !(await hub().ctx.storage.get('e:alice@x.com')));

// ---- 页面 ----
for (const [p, t] of [['/', '路由器面板'], ['/app', '我的路由器'], ['/admin', '托管服务管理']]) {
	const res = await mod.default.fetch(new Request('https://panel.example' + p), env);
	const html = await res.text();
	ok('页面 ' + p + ' 能打开，带安全响应头', res.status === 200 && html.includes(t) && /frame-ancestors 'none'/.test(res.headers.get('content-security-policy')) && res.headers.get('x-frame-options') === 'DENY');
}
ok('页面里没有残留的样式占位符', !(await (await mod.default.fetch(new Request('https://panel.example/app'), env)).text()).includes('COMMON_CSS'));

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

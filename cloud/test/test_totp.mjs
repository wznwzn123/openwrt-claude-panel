// 6.0 第 5 项：官网账号两步验证（验证器 App 的 6 位动态码）——开启、恢复码、新设备登录要输、关掉要输、找回密码以后也要输、
// 确认本人可以用它、注销要输、管理员帮忙关掉；没开的人一切照旧
import crypto from 'crypto';
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const MAIL = [];
globalThis.fetch = async (input, init = {}) => { const url = typeof input === 'string' ? input : input.url; if (url === 'https://api.resend.com/emails') { MAIL.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); } return new Response(JSON.stringify({ success: true, result: { id: 'x', token: 't' } })); };
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: '', VAPID_PRIV: '', RESEND_API_KEY: 're_x' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const S = () => env.H.get('hub').ctx.storage;
let T = Date.now(); Date.now = () => T;
const jar = () => ({ sid: '', did: '' });
async function call(c, path, body, extra = {}) {
	const h = { 'content-type': 'application/json', origin: 'https://panel.example', 'cf-connecting-ip': extra.ip || '1.1.1.' + Math.floor(Math.random() * 200), 'user-agent': extra.ua || 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36' };
	if (c && (c.sid || c.did)) h.cookie = [c.sid && '__Host-sid=' + c.sid, c.did && '__Host-did=' + c.did].filter(Boolean).join('; ');
	if (extra.auth) h.authorization = 'Bearer ' + extra.auth;
	const res = await mod.default.fetch(new Request('https://panel.example' + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
	const sc = res.headers.get('set-cookie') || '';
	if (c) { const m = /__Host-sid=([a-z2-9]*);/.exec(sc); if (m) c.sid = m[1]; const d = /__Host-did=([a-z2-9]{32});/.exec(sc); if (d) c.did = d[1]; }
	let j = {}; try { j = await res.json(); } catch (e) {}
	return { st: res.status, ...j };
}
// 验证器 App 算码（RFC 6238，跟手机上的一样）
const b32dec = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, v = 0; const o = []; for (const c of s.replace(/=+$/, '')) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const otp = (secret, t = T) => { const step = Math.floor(t / 1000 / 30), m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(step)); const h = crypto.createHmac('sha1', b32dec(secret)).update(m).digest(); const o = h[19] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); };
ok('算码对得上标准测试向量（RFC 6238：59 秒 → 287082）', otp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59e3) === '287082');
const lastCode = (re = /验证码 (\d{6})/) => (re.exec((MAIL[MAIL.length - 1] || {}).subject || '') || [])[1] || '';
const sudo = async (c) => { T += 61e3; await call(c, '/api/account/sudo_code', {}); return call(c, '/api/account/sudo', { code: lastCode() }); };
const regUser = async (c, email) => { await call(null, '/api/account/code', { email, kind: 'reg' }); return call(c, '/api/account/register', { email, password: 'pass-word-1', code: lastCode() }); };

const A = jar();
await regUser(A, 'alice@x.com');
let me = await call(A, '/api/account/me');
ok('没开的账号：账号页显示「没开启」', me.st === 200 && me.totp && me.totp.on === false);
// ---- 开启 ----
let r = await call(A, '/api/account/totp_setup', {});
ok('开启前要先确认本人（邮箱验证码）', r.st === 403 && r.sudo === true && !r.secret);
await sudo(A);
r = await call(A, '/api/account/totp_setup', {});
const secret = r.secret;
ok('确认本人以后：给密钥和扫码用的地址（otpauth，写着「路由器面板」和邮箱）', r.st === 200 && /^[A-Z2-7]{32}$/.test(secret) && r.uri.startsWith('otpauth://totp/') && r.uri.includes('secret=' + secret) && r.uri.includes(encodeURIComponent('路由器面板')) && r.uri.includes('alice%40x.com'), r.uri);
ok('没输对验证器上的码之前：还没开启', !(await S().get('u:' + (await S().get('e:alice@x.com')))).totp);
r = await call(A, '/api/account/totp_on', { code: '000000' === otp(secret) ? '111111' : '000000' });
ok('输错：说清楚（看看手机时间）、不开启', r.st === 400 && /手机时间/.test(r.error));
const B = jar(); await call(B, '/api/account/login', { email: 'alice@x.com', password: 'pass-word-1' }); // 另一台设备，下面才登录
const n0 = MAIL.length;
r = await call(A, '/api/account/totp_on', { code: otp(secret) });
const codes = r.codes || [];
ok('输对：开启，给 10 个备用恢复码（xxxx-xxxx）', r.st === 200 && codes.length === 10 && codes.every((c) => /^[a-z2-9]{4}-[a-z2-9]{4}$/.test(c)) && new Set(codes).size === 10, JSON.stringify(codes));
const u0 = await S().get('u:' + (await S().get('e:alice@x.com')));
ok('账号里不存恢复码原文（只存摘要）', u0.totp && u0.totp.rc.length === 10 && !JSON.stringify(u0).includes(codes[0].replace('-', '')));
ok('开启时发邮件告诉本人', MAIL.slice(n0).some((m) => /开启了两步验证/.test(m.subject)));
me = await call(A, '/api/account/me');
ok('账号页显示：已开启、恢复码还剩 10 个', me.totp.on === true && me.totp.rc === 10 && me.totp.at > 0);
ok('密钥不会再给出来（账号页、/me 里都没有）', !JSON.stringify(me).includes(secret));
ok('已经开着：不能再开一次', (await call(A, '/api/account/totp_setup', {})).st === 409);
ok('开启的这台设备照常登录着', (await call(A, '/api/account/me')).st === 200);
// ---- 新设备登录 ----
const C = jar(); const m1 = MAIL.length;
r = await call(C, '/api/account/login', { email: 'alice@x.com', password: 'pass-word-1' });
ok('新设备输对密码：要输验证器上的码，不发邮箱验证码', r.st === 200 && r.need === 'totp' && r.token && !C.sid && MAIL.length === m1, JSON.stringify(r));
const tok = r.token;
ok('「重新发送」：不发邮件，说清楚要用验证器', (await call(C, '/api/account/login2', { token: tok, op: 'resend' })).st === 400 && MAIL.length === m1);
ok('乱输：不对', (await call(C, '/api/account/login2', { token: tok, code: '12345' })).st === 400 && !C.sid);
T += 31e3;
const cc = otp(secret);
r = await call(C, '/api/account/login2', { token: tok, code: cc });
ok('输对验证器上的码：登录成功，这台设备记住', r.st === 200 && C.sid && C.did && (await call(C, '/api/account/me')).st === 200);
await call(C, '/api/account/logout', {});
r = await call(C, '/api/account/login', { email: 'alice@x.com', password: 'pass-word-1' });
ok('验证过的设备再登录：只要密码', r.st === 200 && !r.need && C.sid);
const D = jar();
r = await call(D, '/api/account/login', { email: 'alice@x.com', password: 'pass-word-1' });
ok('同一个码不能用第二次（别人偷看到了也没用）', (await call(D, '/api/account/login2', { token: r.token, code: cc })).st === 400 && !D.sid);
// 恢复码
const m2 = MAIL.length;
r = await call(D, '/api/account/login2', { token: r.token, code: codes[0].toUpperCase().replace('-', ' ') });
ok('手机丢了：用恢复码登录（大小写、空格不管），告诉还剩几个，发邮件', r.st === 200 && D.sid && r.rcLeft === 9 && MAIL.slice(m2).some((m) => /恢复码登录/.test(m.subject) && /9/.test(m.html)), JSON.stringify(r));
const E = jar(); r = await call(E, '/api/account/login', { email: 'alice@x.com', password: 'pass-word-1' });
ok('用过的恢复码不能再用', (await call(E, '/api/account/login2', { token: r.token, code: codes[0] })).st === 400 && !E.sid);
// 输错太多
for (let i = 0; i < 3; i++) await call(E, '/api/account/login2', { token: r.token, code: '000001' });
r = await call(E, '/api/account/login2', { token: r.token, code: '000002' });
ok('同一次登录错 5 次：要重新输密码', r.st === 400 && r.again === true);
for (let i = 0; i < 2; i++) { const t = (await call(E, '/api/account/login', { email: 'alice@x.com', password: 'pass-word-1' })).token; for (let k = 0; k < 2; k++) await call(E, '/api/account/login2', { token: t, code: '000003' }); }
let t2 = (await call(E, '/api/account/login', { email: 'alice@x.com', password: 'pass-word-1' })).token;
r = await call(E, '/api/account/login2', { token: t2, code: otp(secret, T + 30e3) });
ok('换着登录一直猜：15 分钟内错 10 次就先停（码对了也不行）', r.st === 429 && !E.sid, JSON.stringify(r));
T += 16 * 60e3;
t2 = (await call(E, '/api/account/login', { email: 'alice@x.com', password: 'pass-word-1' })).token;
ok('15 分钟后：输对就能登录', (await call(E, '/api/account/login2', { token: t2, code: otp(secret) })).st === 200 && E.sid);
// ---- 确认本人可以用验证器上的码 ----
T += 31e3; const m3 = MAIL.length;
r = await call(D, '/api/account/sudo', { code: otp(secret) });
ok("确认本人：输验证器上的码也行（不用等邮件）", r.st === 200 && MAIL.length === m3 && (await call(D, '/api/account/sessions', {})).st === 200);
// ---- 重新生成恢复码 ----
T += 31e3;
ok('重新生成恢复码：要输验证器上的码', (await call(A, '/api/account/totp_rc', { code: '' })).st === 400);
r = await call(A, '/api/account/totp_rc', { code: otp(secret) });
ok('重新生成：给 10 个新的，旧的全部作废', r.st === 200 && r.codes.length === 10 && (await call(A, '/api/account/me')).totp.rc === 10);
const codes2 = r.codes;
const F = jar(); r = await call(F, '/api/account/login', { email: 'alice@x.com', password: 'pass-word-1' });
ok('旧的恢复码登录不了', (await call(F, '/api/account/login2', { token: r.token, code: codes[1] })).st === 400);
// ---- 找回密码以后也要输 ----
const G = jar();
await call(null, '/api/account/code', { email: 'alice@x.com', kind: 'reset' });
T += 61e3;
r = await call(G, '/api/account/reset', { email: 'alice@x.com', code: lastCode(), password: 'new-pass-22' });
ok('找回密码（只有邮箱）：密码改好了，但登录还要输验证器上的码', r.st === 200 && r.need === 'totp' && !G.sid, JSON.stringify(r));
ok('找回密码以后：别的设备都退出了', (await call(A, '/api/account/me')).st === 401 && (await call(C, '/api/account/me')).st === 401);
ok('找回密码以后：输恢复码登录', (await call(G, '/api/account/login2', { token: r.token, code: codes2[0] })).st === 200 && G.sid);
// ---- 注销要输 ----
r = await call(G, '/api/account/delete', { password: 'new-pass-22' });
ok('注销：开了两步验证的，光有密码不行', r.st === 403 && r.totp === true && (await call(G, '/api/account/me')).st === 200);
// ---- 关闭 ----
T += 31e3;
ok('关闭：不输码不行', (await call(G, '/api/account/totp_off', { code: '' })).st === 400);
const m4 = MAIL.length;
r = await call(G, '/api/account/totp_off', { code: otp(secret) });
ok('关闭：输对验证器上的码，关掉，发邮件', r.st === 200 && !(await call(G, '/api/account/me')).totp.on && MAIL.slice(m4).some((m) => /关闭了两步验证/.test(m.subject)));
const H2 = jar(); const m5 = MAIL.length;
r = await call(H2, '/api/account/login', { email: 'alice@x.com', password: 'new-pass-22' });
ok('关掉以后：新设备登录又变回邮箱验证码', r.st === 200 && r.need === 'code' && MAIL.length === m5 + 1);
// ---- 管理员帮忙关 ----
const K = jar(); await regUser(K, 'kate@x.com'); await sudo(K);
const ks = (await call(K, '/api/account/totp_setup', {})).secret; await call(K, '/api/account/totp_on', { code: otp(ks) });
const kid = await S().get('e:kate@x.com');
const list = await call(null, '/api/admin/users', undefined, { auth: 'admin-key-1234567890' });
ok('管理后台账号列表：看得到谁开了两步验证（看不到密钥）', list.list.find((x) => x.email === 'kate@x.com').totp === true && list.list.find((x) => x.email === 'alice@x.com').totp === false && !JSON.stringify(list).includes(ks));
ok('管理员关两步验证：要写原因', (await call(null, '/api/admin/famuser/' + kid + '/totp_off', { why: '' }, { auth: 'admin-key-1234567890' })).st === 400);
const m6 = MAIL.length;
r = await call(null, '/api/admin/famuser/' + kid + '/totp_off', { why: '手机丢了，本人邮件确认' }, { auth: 'admin-key-1234567890' });
ok('管理员确认本人后关掉：关了、发邮件写着原因', r.st === 200 && !(await S().get('u:' + kid)).totp && MAIL.slice(m6).some((m) => /被开发者关掉/.test(m.subject) && /手机丢了/.test(m.html)));
// ---- 没开邮件服务的自建版 ----
const RK = env.RESEND_API_KEY; delete env.RESEND_API_KEY;
const N = jar(); await call(N, '/api/account/register', { email: 'nina@x.com', password: 'pass-word-1' });
await call(N, '/api/account/sudo_code', {}); await call(N, '/api/account/sudo', { code: '' });
const nsec = (await call(N, '/api/account/totp_setup', {})).secret;
r = await call(N, '/api/account/totp_on', { code: otp(nsec) });
ok('没开邮件服务也能开启', r.st === 200 && r.codes.length === 10);
const N2 = jar(); r = await call(N2, '/api/account/login', { email: 'nina@x.com', password: 'pass-word-1' });
ok('没开邮件服务：新设备登录也要输验证器上的码（以前只要密码）', r.st === 200 && r.need === 'totp' && !N2.sid);
T += 31e3;
ok('没开邮件服务：确认本人要输验证器上的码（以前直接过）', (await call(N, '/api/account/sudo', { code: '' })).st === 400 && (await call(N, '/api/account/sudo', { code: otp(nsec) })).st === 200);
env.RESEND_API_KEY = RK;
// ---- 跨站、没登录 ----
ok('没登录：开不了', (await call(jar(), '/api/account/totp_setup', {})).st === 401);
ok('别的网站发来的：拒绝', (await call(G, '/api/account/totp_off', { code: '123456' }, {}).then(() => 0), 1) && (await mod.default.fetch(new Request('https://panel.example/api/account/totp_off', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie: '__Host-sid=' + G.sid }, body: '{"code":"1"}' }), env)).status === 403);

console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
process.exit(results.every((r) => r[1]) ? 0 : 1);

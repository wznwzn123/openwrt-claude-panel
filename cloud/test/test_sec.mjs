// 安全检查修的问题：__Host- 登录 Cookie（子域名改不了）、旧版管理页下线、管理后台静态文件的特殊名字、
// 文件额度（匿名身份、按 IP）、PDF 一律下载、默认名字不露邮箱、「收到了」邮件只发给本人、两步验证码不能重复登录
import { load, memStorage, memR2 } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const MAILS = [];
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (url === 'https://api.resend.com/emails') { MAILS.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); }
	const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] }));
	if (u.hostname !== 'api.cloudflare.com') return new Response('{}');
	if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 'tun' + Math.random(), token: 'tok' });
	if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'dns' + Math.random() });
	return R({});
};
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: '', VAPID_PRIV: '', RESEND_API_KEY: 're_test', NEW_DEVICE_CODE: '0' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub); env.F = memR2();
const hub = () => env.H.get('hub'), S = () => hub().ctx.storage;
const go = (path, init = {}) => mod.default.fetch(new Request('https://panel.example' + path, init), env);
const post = async (path, body, hdr = {}) => { const r = await go(path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://panel.example', ...hdr }, body: JSON.stringify(body) }); let j = {}; try { j = await r.clone().json(); } catch (e) {} return { st: r.status, j, r }; };
const cookies = (r) => (r.headers.getSetCookie ? r.headers.getSetCookie() : String(r.headers.get('set-cookie') || '').split(/, (?=[_a-zA-Z-]+=)/));
const ADM = { authorization: 'Bearer admin-key-1234567890' };

// 1. 登录 Cookie
const mk = async (email) => { const uid = 'u' + Math.random().toString(36).slice(2, 13).replace(/[^a-z2-9]/g, 'k').padEnd(11, 'k').slice(0, 11), salt = 'x'.repeat(16); return uid; };
void mk;
let r = await post('/api/account/code', { email: 'alice@x.com', kind: 'reg' });
const code = /验证码 (\d{6})/.exec(MAILS.at(-1)?.subject || '')?.[1];
r = await post('/api/account/register', { email: 'alice@x.com', password: 'alice-pass-1', code });
let sc = cookies(r.r);
const hostSid = /^__Host-sid=([a-z2-9]{32});/.exec(sc.find((x) => x.startsWith('__Host-sid=')) || '')?.[1];
ok('注册：登录 Cookie 用 __Host-sid（Secure、Path=/、不带 Domain，子域名改不了）', !!hostSid && sc.some((x) => /^__Host-sid=.*; Path=\/; HttpOnly; Secure; SameSite=Lax/.test(x) && !/Domain=/i.test(x)), sc.join(' | '));
ok('注册：同时删掉旧名字的 sid', sc.some((x) => /^sid=; .*Max-Age=0/.test(x)));
let me = await (await go('/api/account/me', { headers: { cookie: '__Host-sid=' + hostSid } })).json();
ok('带 __Host-sid 能用', me.ok && me.email === 'alice@x.com');
// 子域名用 Domain= 塞进来一个别人的 sid（Cookie 头里排在前面）：认 __Host-sid，不认它
await post('/api/account/code', { email: 'mallory@x.com', kind: 'reg' });
const code2 = /验证码 (\d{6})/.exec(MAILS.at(-1)?.subject || '')?.[1];
r = await post('/api/account/register', { email: 'mallory@x.com', password: 'mallory-pass-1', code: code2 });
const evil = /^__Host-sid=([a-z2-9]{32});/.exec(cookies(r.r).find((x) => x.startsWith('__Host-sid=')) || '')?.[1];
me = await (await go('/api/account/me', { headers: { cookie: 'sid=' + evil + '; __Host-sid=' + hostSid } })).json();
ok('子域名塞进来的 sid 不管用：还是自己的账号', me.ok && me.email === 'alice@x.com', me.email);
// 没登录的人（没有 __Host-sid）被子域名塞了一个新登录的 sid（攻击者自己的账号）：不认，不会被登录成别人的账号
r = await go('/api/account/me', { headers: { cookie: 'sid=' + evil } });
ok('没登录时子域名塞进来一个新登录的 sid：不认（不会被登录成别人的账号）', r.status === 401 && !cookies(r).some((x) => x.startsWith('__Host-sid=' + evil)), r.status);
r = await post('/api/report', { kind: 'other', text: '没登录，带着塞进来的旧名字 Cookie', email: '' }, { 'cf-connecting-ip': '3.3.3.9', cookie: 'sid=' + evil });
ok('报告表单也不认塞进来的 sid（不会记到别人的账号下）', r.st === 200 && !(await hub().feedbacks())[0].uid, JSON.stringify((await hub().feedbacks())[0]));
// 改名之前就登录着的（只有旧的 sid，会话里没有 h）：照样认，并换成新的 Cookie
const ss = await S().get('s:' + hostSid); delete ss.h; await S().put('s:' + hostSid, ss);
r = await go('/api/account/me', { headers: { cookie: 'sid=' + hostSid } });
sc = cookies(r);
ok('改名之前登录的旧 Cookie 照样认，顺便换成 __Host-sid、删掉旧的（不用重新登录）', (await r.clone().json()).email === 'alice@x.com' && sc.some((x) => x.startsWith('__Host-sid=' + hostSid + ';')) && sc.some((x) => /^sid=; /.test(x)), sc.join(' | '));
r = await post('/api/account/logout', {}, { cookie: '__Host-sid=' + hostSid });
sc = cookies(r.r);
ok('退出：新旧 Cookie 都删掉', sc.some((x) => /^__Host-sid=; /.test(x)) && sc.some((x) => /^sid=; /.test(x)));

// 2. 旧版管理页下线；管理后台静态文件的特殊名字
r = await go('/admin/old');
ok('旧版管理页下线：打开跳到新版 /admin/', r.status === 301 && r.headers.get('location') === '/admin/');
for (const n of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
	r = await go('/admin/assets/' + n);
	ok('管理后台静态文件：「' + n + '」这种名字返回 404', r.status === 404, r.status);
}

// 3. 文件额度
const reg = async (ip) => (await post('/api/register', { invite: INV, name: 'Kwrt', model: 'x86' }, { 'cf-connecting-ip': ip })).j;
const INV = (await post('/api/admin/invites', { direct: true, max: 10 }, ADM)).j.invite.code;
const R1 = await reg('1.1.1.1');
const chat = (b, ip = '9.9.9.9') => post('/api/chat', b, { 'cf-connecting-ip': ip });
const anon = (await chat({ op: 'anon', name: '自建', model: 'x86' }, '7.7.7.7')).j;
r = await chat({ op: 'up', cid: anon.cid, ckey: anon.ckey, name: 'a.zip', size: 200 * 1024 * 1024, type: 'application/zip' }, '7.7.7.7');
ok('匿名身份：200MB 的文件能传', r.st === 200, JSON.stringify(r.j));
r = await chat({ op: 'up', cid: anon.cid, ckey: anon.ckey, name: 'a2.zip', size: 101 * 1024 * 1024, type: 'application/zip' }, '7.7.7.7');
ok('自建版匿名身份：每天最多 300MB（再传 101MB 不行）', r.st === 429 && /300MB/.test(r.j.error), JSON.stringify(r.j));
for (let i = 0; i < 9; i++) await chat({ op: 'up', cid: anon.cid, ckey: anon.ckey, name: 'b' + i + '.txt', size: 1000, type: 'text/plain' }, '7.7.7.7');
r = await chat({ op: 'up', cid: anon.cid, ckey: anon.ckey, name: 'c.txt', size: 1000, type: 'text/plain' }, '7.7.7.7');
ok('匿名身份：每天最多 10 个', r.st === 429 && /10 个/.test(r.j.error), JSON.stringify(r.j));
// 同一个 IP 攒了很多匿名身份（比如分好几天、在别的网络建的）轮着传：每个 IP 每天最多 2GB
const anons = [];
for (let i = 0; i < 12; i++) anons.push((await chat({ op: 'anon', name: 'x' + i, model: 'x86' }, '5.5.5.' + (i + 1))).j);
let tot = 0, blocked = false;
for (const a of anons) for (let k = 0; k < 1 && !blocked; k++) { const x = await chat({ op: 'up', cid: a.cid, ckey: a.ckey, name: 'p.zip', size: 199 * 1024 * 1024, type: 'application/zip' }, '6.6.6.6'); if (x.st === 200) tot += 199; else if (/这个网络/.test(x.j.error || '')) blocked = true; }
ok('同一个 IP 换着匿名身份传：每天到 2GB 就不让传了', blocked && tot === 1990, tot + 'MB');
r = await chat({ op: 'up', sub: R1.sub, rkey: R1.rkey, name: 'ok.zip', size: 199 * 1024 * 1024, type: 'application/zip' }, '1.1.1.1');
ok('别的网络（托管路由器）不受影响', r.st === 200, JSON.stringify(r.j));
// PDF 一律下载
const PDF = new TextEncoder().encode('%PDF-1.4 test');
r = await chat({ op: 'up', sub: R1.sub, rkey: R1.rkey, name: '说明.pdf', size: PDF.length, type: 'application/pdf' }, '1.1.1.1');
const up = r.j;
await go(up.url.replace('https://panel.example', '') + '/1', { method: 'PUT', headers: { 'content-length': String(PDF.length) }, body: PDF });
const done = await (await go(up.url.replace('https://panel.example', '') + '/done', { method: 'POST' })).json();
r = await chat({ op: 'send', sub: R1.sub, rkey: R1.rkey, text: 'pdf', files: [done.id] }, '1.1.1.1');
const fu = r.j.msg.files[0];
const d = await go(fu.url.replace('https://panel.example', ''));
ok('PDF：类型保留，但一律当附件下载（不在主域名下直接打开）', fu.type === 'application/pdf' && /^attachment/.test(d.headers.get('content-disposition')), d.headers.get('content-disposition'));
const im = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
r = await chat({ op: 'up', sub: R1.sub, rkey: R1.rkey, name: 'a.png', size: im.length, type: 'image/png' }, '1.1.1.1');
await go(r.j.url.replace('https://panel.example', '') + '/1', { method: 'PUT', headers: { 'content-length': String(im.length) }, body: im });
const d2 = await (await go(r.j.url.replace('https://panel.example', '') + '/done', { method: 'POST' })).json();
const m2 = (await chat({ op: 'send', sub: R1.sub, rkey: R1.rkey, text: 'png', files: [d2.id] }, '1.1.1.1')).j.msg.files[0];
ok('图片照样直接显示', /^inline/.test((await go(m2.url.replace('https://panel.example', ''))).headers.get('content-disposition')));

// 4. 默认名字不露邮箱
const uid = await S().get('e:alice@x.com'); const u = await S().get('u:' + uid);
const p = await hub().famPerson(uid);
ok('没设名字：默认名字是打了码的（xi*** 这种），拼不出完整邮箱', p.name === 'al***' && p.email === 'al***@x.com' && !JSON.stringify(p).includes('alice@'), JSON.stringify(p));
void u;

// 5. 「收到了」邮件只发给登录账号本人的邮箱
const n0 = MAILS.length;
r = await post('/api/report', { kind: 'other', text: '不登录，填了别人的邮箱试一下', email: 'victim@x.com' }, { 'cf-connecting-ip': '3.3.3.3' });
ok('没登录、填了邮箱：不发「收到了」邮件（邮箱照样记下，回复时再发）', r.st === 200 && MAILS.length === n0 && r.j.mailed === 0 && (await hub().feedbacks())[0].emails[0] === 'victim@x.com', MAILS.slice(n0).map((m) => String(m.to)).join(','));
r = await post('/api/report', { kind: 'other', text: '登录了，填自己的邮箱' + ' ', email: 'alice@x.com' }, { 'cf-connecting-ip': '3.3.3.4', cookie: '__Host-sid=' + evil });
ok('登录了但填的不是自己的邮箱：也不发', MAILS.length === n0, MAILS.slice(n0).map((m) => String(m.to)).join(','));
const ls = (await post('/api/account/login', { email: 'alice@x.com', password: 'alice-pass-1' }, { 'cf-connecting-ip': '3.3.3.5' })).r;
const s2 = /^__Host-sid=([a-z2-9]{32});/.exec(cookies(ls).find((x) => x.startsWith('__Host-sid=')) || '')?.[1];
r = await post('/api/report', { kind: 'other', text: '登录了，填自己的邮箱试一下', email: 'Alice@X.com' }, { 'cf-connecting-ip': '3.3.3.6', cookie: '__Host-sid=' + s2 });
ok('登录了、填的是自己的邮箱：发「收到了」', r.j.mailed === 1 && MAILS.length === n0 + 1 && String(MAILS.at(-1).to).toLowerCase() === 'alice@x.com', JSON.stringify(r.j));

// 6. 两步验证码不能重复登录
r = await post('/api/admin/2fa/begin', {}, ADM);
const secret = r.j.secret;
const totp = mod.totp;
await post('/api/admin/2fa/enable', { code: await totp(secret) }, ADM);
const c1 = await totp(secret);
r = await post('/api/admin/login', { code: c1 }, { ...ADM, 'cf-connecting-ip': '4.4.4.4' });
ok('两步验证：输对验证码能登录', r.st === 200 && r.j.sess, JSON.stringify(r.j));
r = await post('/api/admin/login', { code: c1 }, { ...ADM, 'cf-connecting-ip': '4.4.4.5' });
ok('同一个验证码再登录一次：不行', r.st === 401 && /用过了/.test(r.j.error), JSON.stringify(r.j));

const bad = results.filter((x) => !x[1]);
for (const [n, c, note] of results) console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300)));
console.log(bad.length ? `失败 ${bad.length}/${results.length}` : `通过 ${results.length}/${results.length}`);
process.exit(bad.length ? 1 : 0);

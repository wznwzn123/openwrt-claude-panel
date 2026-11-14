// 5.0：对话离线自动回复 / 已解决 / 提醒管理员（邮件、推送）、公告定时发布和统计、前端报错上报、
// 管理后台新 IP 登录提醒、两步验证、数据备份（每天自动、手动、导出、恢复）
import { load, memStorage } from './load.mjs';
const mod = await load();
const v5 = mod;
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const MAILS = [], PUSHES = [];
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url;
	if (url === 'https://api.resend.com/emails') { MAILS.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); }
	if (url.startsWith('https://push.example/')) { PUSHES.push(url); return new Response('', { status: url.includes('gone') ? 410 : 201 }); }
	const u = new URL(url); if (u.hostname === 'api.cloudflare.com') return new Response(JSON.stringify({ success: true, result: { id: 'x' + Math.random(), token: 't' }, errors: [] }));
	return new Response('{}');
};
// 推送要用的 VAPID 密钥（测试里现生成）
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
const b64u = (u8) => Buffer.from(u8).toString('base64url');
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 'cf-token', CF_ACCOUNT_ID: 'acc1', CF_ZONE_ID: 'zone1', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '20', VAPID_PUB: b64u(pubRaw), VAPID_PRIV: JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey)), RESEND_API_KEY: 're', ADMIN_EMAIL: 'boss@x.com' };
const ns = (Cls) => { const objs = new Map(); return { objs, idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const req = (method, url, body, headers = {}) => mod.default.fetch(new Request(url, { method, body: body == null ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } }), env);
const api = (m, p, b, h) => req(m, 'https://panel.example' + p, b, h);
let SESS = '';
const adm = (m, p, b, ip = '9.9.9.9', extra = {}) => api(m, '/api/admin' + p, b, { authorization: 'Bearer admin-key-1234567890', 'cf-connecting-ip': ip, ...(SESS ? { 'x-adm-sess': SESS } : {}), ...extra });
const H = env.H.get('hub');
let T = Date.now(); Date.now = () => T;
const chat = (b, ip = '2.2.2.2') => api('POST', '/api/chat', b, { 'cf-connecting-ip': ip });

const inv = (await (await adm('POST', '/invites', { max: 5 })).json()).invite.code;
const R1 = await (await api('POST', '/api/register', { invite: inv, name: '客厅 Kwrt', model: 'JD' }, { 'cf-connecting-ip': '1.1.1.1' })).json();
ok('[准备] 开通了一台路由器', !!R1.sub);
const tid = 'd' + R1.sub;

/* ---------- 对话：离线自动回复、提醒管理员 ---------- */
T += 10 * 60e3; MAILS.length = 0; // 管理员 10 分钟没动静 = 不在线
// 管理员这台手机打开推送
let r = await adm('POST', '/push/sub', { sub: { endpoint: 'https://push.example/a1', keys: { p256dh: b64u(pubRaw), auth: b64u(new Uint8Array(16)) } }, label: 'Android Chrome' });
ok('[推送] 后台打开推送：记下这台设备', r.status === 200);
T += 10 * 60e3; PUSHES.length = 0; MAILS.length = 0;
r = await chat({ sub: R1.sub, rkey: R1.rkey, op: 'send', text: '你好，节点打不开' }); let j = await r.json();
ok('[对话] 用户发消息', r.status === 200 && j.msg.s === 1);
j = await (await chat({ sub: R1.sub, rkey: R1.rkey, op: 'get' })).json();
ok('[自动回复] 开发者不在线：自动回一句，标着「自动回复」', j.msgs.length === 2 && j.msgs[1].f === 'a' && j.msgs[1].auto === 1 && /不在线/.test(j.msgs[1].x), JSON.stringify(j.msgs));
ok('[提醒] 发邮件给管理员，带着用户说的话', MAILS.length === 1 && MAILS[0].to[0] === 'boss@x.com' && /客厅 Kwrt/.test(MAILS[0].subject) && /节点打不开/.test(MAILS[0].html), JSON.stringify(MAILS.map((m) => m.subject)));
ok('[提醒] 推送到管理员手机', PUSHES.length === 1 && PUSHES[0] === 'https://push.example/a1', JSON.stringify(PUSHES));
T += 60e3;
await chat({ sub: R1.sub, rkey: R1.rkey, op: 'send', text: '还在吗' });
j = await (await chat({ sub: R1.sub, rkey: R1.rkey, op: 'get' })).json();
ok('[自动回复] 开发者还没回：不重复自动回复', j.msgs.length === 3 && j.msgs.filter((m) => m.auto).length === 1, j.msgs.length);
ok('[提醒] 30 分钟内不重复提醒', MAILS.length === 1 && PUSHES.length === 1, MAILS.length + '/' + PUSHES.length);
// 管理员打开后台：不算未读、在线
j = await (await adm('GET', '/badge')).json();
ok('[自动回复] 后台的未读数只算用户发的（自动回复不算）', j.chat === 2 && j.chatWaiting === 1, JSON.stringify(j));
j = await (await adm('GET', '/chat')).json();
ok('[自动回复] 对话列表最后一句还是用户说的', j.list[0].preview === '还在吗' && j.list[0].lastFrom === 'u', JSON.stringify(j.list[0]));
r = await adm('POST', '/chat/' + tid, { text: '在的，我看看' });
ok('[对话] 开发者回复', r.status === 200);
T += 60e3; MAILS.length = 0; PUSHES.length = 0;
await chat({ sub: R1.sub, rkey: R1.rkey, op: 'send', text: '好的谢谢' });
j = await (await chat({ sub: R1.sub, rkey: R1.rkey, op: 'get' })).json();
ok('[自动回复] 开发者在线（后台开着）：不自动回复、不发邮件', !j.msgs[j.msgs.length - 1].auto && MAILS.length === 0 && PUSHES.length === 0, JSON.stringify(j.msgs.slice(-1)));
T += 10 * 60e3;
await chat({ sub: R1.sub, rkey: R1.rkey, op: 'send', text: '又坏了' });
j = await (await chat({ sub: R1.sub, rkey: R1.rkey, op: 'get' })).json();
ok('[自动回复] 开发者回复过以后又离线：可以再自动回复一次', j.msgs[j.msgs.length - 1].auto === 1, JSON.stringify(j.msgs.slice(-2)));
// 设置
r = await adm('POST', '/v5cfg', { autoOn: false, autoText: '我晚点回你', mailOn: false, pushOn: true });
j = await (await adm('GET', '/v5cfg')).json();
ok('[设置] 可以关掉自动回复、改文字、关掉邮件', j.cfg.autoOn === false && j.cfg.autoText === '我晚点回你' && j.cfg.mailOn === false && j.subs.length === 1 && j.vapid, JSON.stringify(j));
await adm('POST', '/v5cfg', { autoOn: true, mailOn: true });
// 已解决
r = await adm('POST', '/chat/' + tid + '/done');
j = await (await adm('GET', '/chat')).json();
ok('[已解决] 标为已解决', r.status === 200 && j.list[0].done > 0);
T += 10 * 60e3;
await chat({ sub: R1.sub, rkey: R1.rkey, op: 'send', text: '新问题' });
j = await (await adm('GET', '/chat')).json();
ok('[已解决] 用户又发消息：自动重新打开', !j.list[0].done, JSON.stringify(j.list[0]));
r = await adm('POST', '/chat/zzzzzzzzz/done');
ok('[已解决] 没有的对话：404', r.status === 404);
// 推送：失效的订阅自动删掉
await adm('POST', '/push/sub', { sub: { endpoint: 'https://push.example/gone1', keys: { p256dh: b64u(pubRaw), auth: b64u(new Uint8Array(16)) } }, label: '旧手机' });
r = await adm('POST', '/push/test');
j = await (await adm('GET', '/v5cfg')).json();
ok('[推送] 测试推送；失效的手机自动去掉', r.status === 200 && j.subs.length === 1, JSON.stringify(j.subs));
r = await adm('POST', '/push/sub', { sub: { endpoint: 'http://evil/x', keys: {} } });
ok('[推送] 不对的订阅拒绝', r.status === 400);

/* ---------- 公告：定时发布、收到和点开的统计 ---------- */
r = await adm('POST', '/ann', { title: '明天的公告', body: '定时发', level: 'important', start: T + 3600e3, days: 3 });
const later = (await r.json()).ann;
r = await adm('POST', '/ann', { title: '现在的公告', body: '马上发', level: 'normal' });
const nowAnn = (await r.json()).ann;
j = await (await api('GET', '/api/notices?r=0123456789abcdef')).json();
ok('[定时] 没到时间的公告面板看不到', j.list.length === 1 && j.list[0].id === nowAnn.id, JSON.stringify(j.list.map((a) => a.title)));
ok('[定时] 定时的公告发布时间 = 设定的时间（路由器按这个判断推不推送）', later.at === T + 3600e3 && later.start === T + 3600e3 && later.exp === T + 3600e3 + 3 * 86400e3, JSON.stringify(later));
T += 3601e3;
j = await (await api('GET', '/api/notices?r=0123456789abcdef')).json();
ok('[定时] 到时间了：出现', j.list.length === 2, j.list.length);
await api('GET', '/api/notices?r=fedcba9876543210');
await api('GET', '/api/notices?r=fedcba9876543210');
await api('GET', '/api/notices?r=BAD');
await api('GET', '/api/notices');
r = await api('POST', '/api/notices/seen', { r: 'fedcba9876543210', ids: [later.id, 'zzzzzzzzzz'] });
j = await (await adm('GET', '/ann-stats')).json();
ok('[统计] 收到：2 台（同一台只算一次，乱写的编号不算）；点开：1 台', j.stats[later.id].got === 2 && j.stats[later.id].seen === 1 && j.stats[nowAnn.id].got === 2, JSON.stringify(j.stats));
r = await adm('POST', '/ann', { title: 'x', start: T + 100 * 86400e3 });
ok('[定时] 最多提前 90 天', r.status === 400);

/* ---------- 前端报错上报 ---------- */
let n0 = ((await H.ctx.storage.get('el')) || []).length;
r = await api('POST', '/api/cerr', { msg: 'TypeError: x is undefined ?token=abc123', where: 'index.html?p=home', stack: 'at f (https://r.example.com/panel/:12:3)', ver: '5.0.0', ua: '安卓手机 · 浏览器', w: 390, h: 844, page: 'home' }, { 'cf-connecting-ip': '3.3.3.3' });
await api('POST', '/api/cerr', { msg: 'TypeError: x is undefined ?token=abc123', where: 'index.html?p=home' }, { 'cf-connecting-ip': '3.3.3.3' });
let el = (await H.ctx.storage.get('el')) || [];
ok('[报错] 面板报错记进出错记录（同一条一小时只记一次）', r.status === 200 && el.length === n0 + 1 && /面板前端/.test(el[0].path), JSON.stringify(el[0]));
ok('[报错] 网址里的密钥、地址去掉', !/abc123/.test(el[0].msg) && !/r\.example\.com/.test(el[0].msg) && /390×844/.test(el[0].msg), el[0].msg);
r = await adm('POST', '/cerr', { msg: 'ReferenceError: y', where: '/admin/#/visits', w: 386, h: 800 });
el = (await H.ctx.storage.get('el')) || [];
ok('[报错] 管理后台报错也记', r.status === 200 && /管理后台前端/.test(el[0].path), JSON.stringify(el[0]));
for (let i = 0; i < 40; i++) await api('POST', '/api/cerr', { msg: 'spam ' + i }, { 'cf-connecting-ip': '4.4.4.4' });
el = (await H.ctx.storage.get('el')) || [];
ok('[报错] 同一个 IP 一小时最多 30 条（防刷）', el.filter((x) => /spam/.test(x.msg)).length === 30, el.filter((x) => /spam/.test(x.msg)).length);
r = await api('POST', '/api/cerr', { msg: '' });
ok('[报错] 空的不记', r.status === 200);

/* ---------- 新 IP 登录提醒 ---------- */
MAILS.length = 0;
await adm('POST', '/login', {}, '9.9.9.9');
ok('[登录提醒] 第一次登录不提醒', MAILS.length === 0, MAILS.map((m) => m.subject).join());
await adm('POST', '/login', {}, '9.9.9.9');
ok('[登录提醒] 同一个 IP 再登录不提醒', MAILS.length === 0);
await adm('POST', '/login', {}, '5.6.7.8');
ok('[登录提醒] 新的 IP 登录：发邮件，写着 IP 和怎么处理', MAILS.length === 1 && /新的地方登录/.test(MAILS[0].subject) && /5\.6\.7\.8/.test(MAILS[0].html) && /HUB_ADMIN_KEY/.test(MAILS[0].html), MAILS.map((m) => m.subject).join());

/* ---------- 两步验证 ---------- */
j = await (await adm('POST', '/2fa/begin')).json();
ok('[两步验证] 开启第一步：给密钥和二维码内容', j.ok && /^[A-Z2-7]{32}$/.test(j.secret) && j.uri.startsWith('otpauth://totp/'), JSON.stringify(j));
const sec = j.secret;
r = await adm('POST', '/2fa/enable', { code: '000000' });
ok('[两步验证] 验证码不对：不开', r.status === 400);
r = await adm('POST', '/2fa/enable', { code: await v5.totp(sec, T) });
ok('[两步验证] 验证码对：开了', r.status === 200);
r = await adm('GET', '/overview');
ok('[两步验证] 开了以后：只有密钥不行', r.status === 401 && (await r.json()).need2fa);
r = await adm('POST', '/login', {});
ok('[两步验证] 登录不带验证码：要验证码', r.status === 401 && (await r.json()).need2fa);
r = await adm('POST', '/login', { code: '123456' });
ok('[两步验证] 验证码错：不让进', r.status === 401);
r = await adm('POST', '/login', { code: await v5.totp(sec, T) }); j = await r.json();
ok('[两步验证] 验证码对：拿到 12 小时的通行证', r.status === 200 && j.sess && j.sess.length >= 20, JSON.stringify(j));
SESS = j.sess;
r = await adm('GET', '/overview');
ok('[两步验证] 带着通行证：能用', r.status === 200);
const sess0 = SESS; SESS = '';
r = await adm('GET', '/overview', null, '9.9.9.9', { 'x-adm-otp': await v5.totp(sec, T) });
ok('[两步验证] GitHub 自动任务现算验证码：能用', r.status === 200);
T += 13 * 3600e3; SESS = sess0;
r = await adm('GET', '/overview');
ok('[两步验证] 通行证 12 小时后过期', r.status === 401);
SESS = (await (await adm('POST', '/login', { code: await v5.totp(sec, T) })).json()).sess;
r = await adm('POST', '/2fa/disable', { code: '111111' });
ok('[两步验证] 关掉要验证码，错了不关', r.status === 400);
r = await adm('POST', '/2fa/disable', { code: await v5.totp(sec, T) });
SESS = '';
r = await adm('GET', '/overview');
ok('[两步验证] 关掉以后：只有密钥就行（跟以前一样）', r.status === 200);
// 标准测试向量（RFC 6238，SHA-1，8 位里取后 6 位）
const rfc = v5.b32enc(new TextEncoder().encode('12345678901234567890'));
ok('[两步验证] 验证码算法对（RFC 6238 标准例子）', (await v5.totp(rfc, 59e3)) === '287082' && (await v5.totp(rfc, 1111111109e3)) === '081804', await v5.totp(rfc, 59e3));

/* ---------- 数据备份 ---------- */
await adm('POST', '/chat/' + tid, { text: '图片测试' });
const before = await H.exportAll();
r = await adm('POST', '/backups/now'); j = await r.json();
ok('[备份] 手动备份一份', r.status === 200 && /^\d{12}$/.test(j.id) && j.n > 10, JSON.stringify(j));
const bid = j.id;
j = await (await adm('GET', '/backups')).json();
ok('[备份] 备份列表', j.list.length === 1 && j.list[0].id === bid && j.list[0].why === '手动' && j.list[0].size > 0, JSON.stringify(j.list));
ok('[备份] 备份存在另一个独立的存储里（不在主存储）', env.H.objs.has('hub-backup') && !(await H.ctx.storage.get('bl')), [...env.H.objs.keys()].join());
r = await adm('GET', '/export');
const gz = new Uint8Array(await r.arrayBuffer());
ok('[导出] 导出全部数据：压缩文件可以下载', r.status === 200 && r.headers.get('content-type') === 'application/gzip' && /attachment; filename="hub-export-\d{12}\.json\.gz"/.test(r.headers.get('content-disposition')) && gz[0] === 0x1f && gz[1] === 0x8b);
const exp = JSON.parse(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
ok('[导出] 里面有账号、路由器、对话、公告、统计；通行证这类不导出', exp.v === 1 && exp.data.cth && exp.data.ann && Object.keys(exp.data).some((k) => k.startsWith('cm:')) && !exp.data['adm:sess'], Object.keys(exp.data).slice(0, 20).join());
// 改坏一些数据，再恢复
await H.ctx.storage.delete('cth'); await H.ctx.storage.put('ann', []);
r = await adm('POST', '/backups/' + bid + '/restore', { confirm: 'wrong' });
ok('[恢复] 要输入备份编号确认', r.status === 400);
r = await adm('POST', '/backups/' + bid + '/restore', { confirm: bid }); j = await r.json();
ok('[恢复] 恢复成功', r.status === 200 && j.n > 10, JSON.stringify(j));
const after = await H.exportAll();
const same = Object.keys(before.data).filter((k) => !k.startsWith('r:') && !k.startsWith('adm:') && k !== 'bak:day' && k !== 'alog').every((k) => JSON.stringify(before.data[k]) === JSON.stringify(after.data[k]));
const diff = Object.keys(before.data).filter((k) => !k.startsWith('r:') && !k.startsWith('adm:') && k !== 'bak:day' && k !== 'alog').filter((k) => JSON.stringify(before.data[k]) !== JSON.stringify(after.data[k]));
ok('[恢复] 恢复后数据跟备份时一模一样', same && (await H.chatThreads()).length >= 1 && (await H.anns(true)).length === 2, diff.join() + ' ' + (await H.anns(true)).length);
j = await (await adm('GET', '/backups')).json();
ok('[恢复] 恢复前自动先存一份（万一恢复错了）', j.list.some((x) => x.why === '恢复前'), JSON.stringify(j.list.map((x) => x.why)));
r = await adm('GET', '/backups/' + bid + '/download');
ok('[备份] 每份备份都能下载', r.status === 200 && r.headers.get('content-type') === 'application/gzip');
// 每天自动：一天只备份一次，留最近 7 份
const sched = mod.default.scheduled;
for (let d = 0; d < 10; d++) { await sched({}, env); await sched({}, env); T += 86400e3; }
j = await (await adm('GET', '/backups')).json();
ok('[备份] 每天自动备份一次；自动的只留最近 7 份', j.list.filter((x) => x.why === '每天自动').length === 7, JSON.stringify(j.list.map((x) => x.why + x.id)));
const bs = env.H.get('hub-backup').ctx.storage.mem;
const parts = [...bs.keys()].filter((k) => k.startsWith('b:'));
ok('[备份] 过期的备份内容也删掉了（不越存越多）', new Set(parts.map((k) => k.split(':')[1])).size === j.list.length, parts.length);

for (const [n, c, note] of results) console.log((c ? '  ✓ ' : '  ✗ ') + n + (c || note == null ? '' : '（' + String(note).slice(0, 300) + '）'));
const fail = results.filter((r) => !r[1]).length;
console.log(`\n通过 ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);

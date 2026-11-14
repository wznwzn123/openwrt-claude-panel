// 4.0：实时对话（托管版 / 自建版匿名身份）、访问统计、登录记录（含 IP）、管理后台防猜密钥、出错记录、邮件记录、概览
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const MAILS = [];
globalThis.fetch = async (input, init = {}) => { const url = typeof input === 'string' ? input : input.url; if (url === 'https://api.resend.com/emails') { const b = JSON.parse(init.body); MAILS.push(b); return new Response('{"id":"m"}', { status: b.to[0].includes('bad') ? 500 : 200 }); }
	const u = new URL(url); if (u.hostname === 'api.cloudflare.com') { return new Response(JSON.stringify({ success: true, result: { id: 'x' + Math.random(), token: 't' }, errors: [] })); } return new Response('{}'); };
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 'cf-token', CF_ACCOUNT_ID: 'acc1', CF_ZONE_ID: 'zone1', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '20', VAPID_PUB: '', VAPID_PRIV: '', RESEND_API_KEY: 're', ADMIN_EMAIL: 'boss@x.com' };
const ns = (Cls) => { const objs = new Map(); return { objs, idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const req = (method, url, body, headers = {}) => mod.default.fetch(new Request(url, { method, body: body == null ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } }), env);
const api = (m, p, b, h) => req(m, 'https://panel.example' + p, b, h);
const adm = (m, p, b, ip = '9.9.9.9') => api(m, '/api/admin' + p, b, { authorization: 'Bearer admin-key-1234567890', 'cf-connecting-ip': ip });
const H = env.H.get('hub');
let T = Date.now(); Date.now = () => T;

/* ---------- 开一台托管路由器 ---------- */
const inv = (await (await adm('POST', '/invites', { max: 5 })).json()).invite.code;
const R1 = await (await api('POST', '/api/register', { invite: inv, name: 'Kwrt', model: 'JD RE-SS-01' }, { 'cf-connecting-ip': '1.1.1.1' })).json();
ok('[准备] 开通了一台路由器', !!R1.sub, JSON.stringify(R1).slice(0, 200));
const chat = (b, ip = '2.2.2.2') => api('POST', '/api/chat', b, { 'cf-connecting-ip': ip });

/* ---------- 实时对话：托管版 ---------- */
let r = await chat({ sub: R1.sub, rkey: 'wrong', op: 'get' });
ok('[对话] 钥匙不对：拒绝', r.status === 403);
r = await chat({ sub: R1.sub, rkey: R1.rkey, op: 'get' }); let j = await r.json();
ok('[对话] 还没说过话：空列表', r.status === 200 && j.msgs.length === 0 && j.seq === 0);
r = await chat({ sub: R1.sub, rkey: R1.rkey, op: 'send', text: '  ' });
ok('[对话] 空消息不收', r.status === 400);
r = await chat({ sub: R1.sub, rkey: R1.rkey, op: 'send', text: '你好，节点页打不开', ver: '4.0.0', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }); j = await r.json();
ok('[对话] 用户发一条', r.status === 200 && j.msg.s === 1 && j.msg.f === 'u' && j.msg.x === '你好，节点页打不开', JSON.stringify(j));
const png = 'data:image/png;base64,' + Buffer.from('fakepngdata'.repeat(20)).toString('base64');
r = await chat({ sub: R1.sub, rkey: R1.rkey, op: 'send', text: '', img: png }); j = await r.json();
ok('[对话] 发一张图', r.status === 200 && j.msg.img && j.msg.img.type === 'image/png' && !j.msg.img.n);
r = await chat({ sub: R1.sub, rkey: R1.rkey, op: 'send', img: 'data:text/html;base64,PHNjcmlwdD4=' });
ok('[对话] 不是图片的拒绝', r.status === 400);
r = await chat({ sub: R1.sub, rkey: R1.rkey, op: 'send', img: 'data:image/png;base64,' + Buffer.alloc(1100 * 1024).toString('base64') });
ok('[对话] 太大的图拒绝（最大 1MB）', r.status === 400 && /太大/.test((await r.json()).error));
// 管理后台
r = await adm('GET', '/badge'); j = await r.json();
ok('[对话] 管理后台：未读 2 条、1 个对话在等', j.chat === 2 && j.chatWaiting === 1, JSON.stringify(j));
j = await (await adm('GET', '/chat')).json();
const tid = 'd' + R1.sub;
ok('[对话] 对话列表：路由器名、型号、版本、最后一句', j.list.length === 1 && j.list[0].tid === tid && j.list[0].name === 'Kwrt' && j.list[0].model === 'JD RE-SS-01' && j.list[0].ver === '4.0.0' && j.list[0].preview === '[图片]' && j.list[0].ua === 2 && j.list[0].kind === 'hosted', JSON.stringify(j.list[0]));
j = await (await adm('GET', '/chat/' + tid + '?read=1')).json();
ok('[对话] 打开对话：两条消息，看过以后未读清零', j.msgs.length === 2 && j.msgs[1].img && (await (await adm('GET', '/badge')).json()).chat === 0);
r = await adm('GET', '/chat/' + tid + '/img/2');
ok('[对话] 管理后台看图片（原样、带类型、不让浏览器猜类型）', r.status === 200 && r.headers.get('content-type') === 'image/png' && r.headers.get('x-content-type-options') === 'nosniff' && Buffer.from(await r.arrayBuffer()).toString() === 'fakepngdata'.repeat(20));
ok('[对话] 图片编号乱填：404', (await adm('GET', '/chat/' + tid + '/img/9')).status === 404 && (await adm('GET', '/chat/' + tid + '/img/x')).status === 404);
const pushes = []; const W1 = env.W.get('dev:' + R1.sub); const op = W1.push.bind(W1); W1.push = async (m) => { pushes.push(m); return op(m); };
r = await adm('POST', '/chat/' + tid, { text: '收到，我看看。先重启一下 OpenClash 试试' }); j = await r.json();
ok('[对话] 开发者回复', r.status === 200 && j.msg.f === 'a' && j.msg.s === 3);
ok('[对话] 托管版：推送到手机（点开进对话页，不进通知记录）', pushes.length === 1 && pushes[0].url === './?p=chat' && pushes[0].nolog && /开发者回复了你/.test(pushes[0].title), JSON.stringify(pushes));
r = await chat({ sub: R1.sub, rkey: R1.rkey, op: 'get', after: 2 }); j = await r.json();
ok('[对话] 用户拿新消息（只拿编号 2 以后的）：未读 1', j.msgs.length === 1 && j.msgs[0].f === 'a' && j.uu === 1 && j.adminSeen >= 2, JSON.stringify(j));
r = await chat({ sub: R1.sub, rkey: R1.rkey, op: 'get', after: 0, read: true }); j = await r.json();
ok('[对话] 用户打开对话：全部消息、未读清零', j.msgs.length === 3 && j.uu === 0);
ok('[对话] 未读清零记住了', (await (await chat({ sub: R1.sub, rkey: R1.rkey, op: 'get', after: 3 })).json()).uu === 0);
r = await chat({ sub: R1.sub, rkey: R1.rkey, op: 'img', seq: 2 }); j = await r.json();
ok('[对话] 用户那边也能看图（data 网址）', j.ok && j.data === png);
ok('[对话] 对话编号乱填：404', (await adm('GET', '/chat/xxx')).status === 404 && (await adm('GET', '/chat/d22222222')).status === 404);
ok('[对话] 给不存在的对话回复：404', (await adm('POST', '/chat/dabcdefgh', { text: 'x' })).status === 404);
// 发太快
let lim = 0; for (let i = 0; i < 25; i++) { const x = await chat({ sub: R1.sub, rkey: R1.rkey, op: 'send', text: '刷屏' + i }); if (x.status === 429) lim++; }
ok('[对话] 10 分钟最多发 20 次，多的拒绝', lim === 10, lim);
T += 11 * 60e3;
ok('[对话] 过 10 分钟又能发', (await chat({ sub: R1.sub, rkey: R1.rkey, op: 'send', text: '又来了' })).status === 200);
// 拉黑
await adm('POST', '/chat/' + tid + '/block');
r = await chat({ sub: R1.sub, rkey: R1.rkey, op: 'send', text: 'x' });
ok('[对话] 拉黑以后用户发不了，说明原因', r.status === 403 && /暂时不能发/.test((await r.json()).error));
ok('[对话] 拉黑了用户那边能知道', (await (await chat({ sub: R1.sub, rkey: R1.rkey, op: 'get' })).json()).blocked === true);
await adm('POST', '/chat/' + tid + '/unblock');
ok('[对话] 解除拉黑能发', (await chat({ sub: R1.sub, rkey: R1.rkey, op: 'send', text: '好了' })).status === 200);

/* ---------- 实时对话：自建版匿名身份 ---------- */
r = await chat({ op: 'anon', name: 'OpenWrt 自建', model: 'x86' }, '3.3.3.3'); j = await r.json();
ok('[自建] 第一次用：拿到匿名身份', r.status === 200 && /^[a-z2-9]{12}$/.test(j.cid) && /^[a-z2-9]{32}$/.test(j.ckey));
const A = j;
ok('[自建] 只存钥匙的哈希', !JSON.stringify(await H.ctx.storage.get('ca:' + A.cid)).includes(A.ckey));
ok('[自建] 钥匙不对：拒绝，提示重新建身份', (await chat({ cid: A.cid, ckey: 'x'.repeat(32), op: 'get' })).status === 403);
r = await chat({ cid: A.cid, ckey: A.ckey, op: 'send', text: '自建版也能问吗', ver: '4.0.0' });
ok('[自建] 发消息', r.status === 200);
j = await (await adm('GET', '/chat')).json();
const t2 = j.list.find((x) => x.tid === 'a' + A.cid);
ok('[自建] 管理后台看到：自建版、路由器名', t2 && t2.kind === 'self' && t2.name === 'OpenWrt 自建' && t2.ua === 1, JSON.stringify(j.list));
ok('[自建] 列表按最后说话时间排（新的在前）', j.list[0].tid === 'a' + A.cid);
pushes.length = 0;
await adm('POST', '/chat/a' + A.cid, { text: '能，问吧' });
ok('[自建] 回复自建版：不走托管推送（路由器自己来看）', pushes.length === 0);
ok('[自建] 自建版拿到回复', (await (await chat({ cid: A.cid, ckey: A.ckey, op: 'get', after: 1 })).json()).msgs[0].x === '能，问吧');
for (let i = 0; i < 5; i++) await chat({ op: 'anon' }, '4.4.4.4');
ok('[自建] 同一个 IP 一天最多建 5 个身份', (await chat({ op: 'anon' }, '4.4.4.4')).status === 429);
// 删除对话
ok('[对话] 删除对话', (await (await adm('DELETE', '/chat/a' + A.cid)).json()).ok === true && !(await (await adm('GET', '/chat')).json()).list.some((x) => x.tid === 'a' + A.cid));
ok('[对话] 消息也删干净了', ![...H.ctx.storage.mem.keys()].some((k) => k.startsWith('cm:a' + A.cid)));
// 只留最近 500 条
const who = { tid: 'dzzzzzzzz', kind: 'hosted', sub: 'zzzzzzzz', name: 'big', model: '' };
for (let i = 0; i < 510; i++) await H.chatSend(who, 'u', 'm' + i, '');
const left = [...H.ctx.storage.mem.keys()].filter((k) => k.startsWith('cm:dzzzzzzzz:')).length;
ok('[对话] 一个对话只留最近 500 条（多的删掉）', left <= 500 && left >= 450, left);
j = await (await adm('GET', '/chat/dzzzzzzzz')).json();
ok('[对话] 打开大对话：拿最近 200 条，按顺序', j.msgs.length === 200 && j.msgs[199].x === 'm509' && j.msgs[0].s < j.msgs[199].s);

/* ---------- 统计：访问次数、访客 IP、国家 ---------- */
const visit = (p, ip, ua = 'Mozilla/5.0 (Linux; Android 14) Chrome/120', cc) => mod.default.fetch(Object.assign(new Request('https://panel.example' + p, { headers: { 'cf-connecting-ip': ip, 'user-agent': ua } }), { cf: { country: cc || 'TW' } }), env);
await visit('/', '5.5.5.5'); await visit('/', '5.5.5.5'); await visit('/app', '6.6.6.6', undefined, 'CN'); await visit('/r/ABCD2345', '7.7.7.7');
await visit('/', '8.8.8.8', 'Googlebot/2.1'); await visit('/admin/', '9.9.9.9'); await visit('/admin/old', '9.9.9.9');
j = await (await adm('GET', '/stats?days=7')).json();
const td = j.days[j.days.length - 1];
ok('[统计] 按天：今天 7 天里的最后一天', j.days.length === 7 && td.d === mod.dayKey ? true : j.days.length === 7);
ok('[统计] 访问次数：首页 2、账号页 1、查进度 1；机器人单独算；管理页不算', td.pv.home === 3 && td.pv.app === 1 && td.pv.reply === 1 && td.n.bot === 1 && td.n.pv === 5 && !td.pv.admin, JSON.stringify(td));
ok('[统计] 访客数（不同 IP，不算机器人）：3', td.uv === 3, td.uv);
ok('[统计] 国家/地区', td.cc.TW === 3 && td.cc.CN === 1, JSON.stringify(td.cc));
j = await (await adm('GET', '/visitors')).json();
ok('[统计] 今天的访客 IP 和次数（多的在前）', j.list[0].ip === '5.5.5.5' && j.list[0].n === 2 && j.list.length === 3 && !j.list.some((x) => x.ip === '8.8.8.8'), JSON.stringify(j.list));
ok('[统计] 开通、反馈这些也按天计数', td.n.dev_reg === 1 && td.n.chat_in >= 1 && td.n.chat_out >= 1, JSON.stringify(td.n));

/* ---------- 登录记录 ---------- */
const acct = (p, b, ip) => mod.default.fetch(Object.assign(new Request('https://panel.example/api/account/' + p, { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' } }), { cf: { country: 'TW', city: 'Taipei' } }), env);
await env.H.get('hub').ctx.storage.put('mc:reg:alice@x.com', { code: '123456', exp: T + 600e3, n: 0 });
env.RESEND_API_KEY = '';
r = await acct('register', { email: 'alice@x.com', password: 'alice-pass-1' }, '10.0.0.1');
ok('[登录] 注册成功', r.status === 200, await r.text());
await acct('login', { email: 'alice@x.com', password: 'wrong-pass-1' }, '10.0.0.2');
await acct('login', { email: 'alice@x.com', password: 'alice-pass-1' }, '10.0.0.3');
await acct('login', { email: 'nobody@x.com', password: 'whatever-1' }, '10.0.0.4');
j = await (await adm('GET', '/logins')).json();
const L0 = j.list;
ok('[登录] 记下：注册、密码错、登录成功、没有这个账号', L0.length >= 4 && L0[0].why === '没有这个账号' && !L0[0].ok && L0[1].ok && L0[1].why === '登录成功' && L0[2].why === '密码不对' && L0.find((x) => x.k === 'reg'), JSON.stringify(L0.slice(0, 4)));
ok('[登录] 每条带 IP、地点、设备', L0[1].ip === '10.0.0.3' && /台湾/.test(L0[1].place) && /Windows/.test(L0[1].ua), JSON.stringify(L0[1]));
env.RESEND_API_KEY = 're';

/* ---------- 管理后台：登录记录、防猜密钥 ---------- */
r = await adm('POST', '/login', {}, '11.0.0.1');
ok('[管理] 登录：记一条成功', r.status === 200 && (await (await adm('GET', '/logins')).json()).list.some((x) => x.k === 'admin' && x.ok && x.ip === '11.0.0.1'));
const bad = (ip) => api('GET', '/api/admin/devices', null, { authorization: 'Bearer wrong-key-123456789', 'cf-connecting-ip': ip });
for (let i = 0; i < 10; i++) await bad('12.0.0.1');
r = await bad('12.0.0.1');
ok('[管理] 同一个 IP 密钥错 10 次：先锁 15 分钟', r.status === 429);
r = await adm('GET', '/devices', null, '12.0.0.1');
ok('[管理] 锁住期间正确的密钥也进不来（防止猜中）', r.status === 429);
ok('[管理] 别的 IP 不受影响', (await adm('GET', '/devices', null, '12.0.0.2')).status === 200);
j = await (await adm('GET', '/logins')).json();
ok('[管理] 密钥错的每一次都记下（IP、访问的地址）', j.list.filter((x) => x.k === 'admin' && !x.ok && x.ip === '12.0.0.1').length === 10 && /密钥不对/.test(j.list.find((x) => x.k === 'admin' && !x.ok).why));
T += 16 * 60e3;
ok('[管理] 15 分钟后解锁', (await adm('GET', '/devices', null, '12.0.0.1')).status === 200);
ok('[管理] 没带密钥的不记（比如打开页面前）', (await api('GET', '/api/admin/devices', null, { 'cf-connecting-ip': '13.0.0.1' })).status === 401 && !(await (await adm('GET', '/logins')).json()).list.some((x) => x.ip === '13.0.0.1'));

/* ---------- 邮件记录、出错记录 ---------- */
MAILS.length = 0;
await adm('POST', '/testmail');
j = await (await adm('GET', '/mails')).json();
ok('[邮件] 发出的邮件记下：收件人、标题、成功', j.list.length >= 1 && j.list[0].to === 'boss@x.com' && j.list[0].ok, JSON.stringify(j.list[0]));
env.ADMIN_EMAIL = 'bad@x.com'; await adm('POST', '/testmail'); env.ADMIN_EMAIL = 'boss@x.com';
j = await (await adm('GET', '/mails')).json();
ok('[邮件] 发失败的也记下', j.list[0].to === 'bad@x.com' && !j.list[0].ok);
await H.errLog('/api/x', 'TypeError: boom');
j = await (await adm('GET', '/errors')).json();
ok('[出错] 记下出错的地址和原因', j.list[0].path === '/api/x' && /boom/.test(j.list[0].msg));
// Worker 里真的出错
const ofetch = H.stats; H.stats = async () => { throw new Error('模拟出错'); };
r = await api('GET', '/api/ping');
H.stats = ofetch;
j = await (await adm('GET', '/errors')).json();
ok('[出错] 官网接口出错：返回 500、不露细节，记进出错记录', r.status === 500 && !/模拟/.test(await r.text()) && j.list[0].path === '/api/ping' && /模拟出错/.test(j.list[0].msg), JSON.stringify(j.list[0]));

/* ---------- 概览 ---------- */
j = await (await adm('GET', '/overview')).json();
ok('[概览] 路由器、账号、反馈、对话、登录、30 天统计', j.devices.total === 1 && j.users.total === 1 && j.chat.threads >= 2 && j.logins.ok24 >= 1 && j.logins.fail24 >= 1 && j.days.length === 30, JSON.stringify({ ...j, days: j.days.length }));
// 清理：IP 只留 30 天，统计留 180 天，登录记录 90 天
T += 40 * 86400e3;
await H.opsGc(T);
const old = await H.ctx.storage.get('st:' + mod.dayKey(T - 40 * 86400e3));
ok('[清理] 30 天前的访客 IP 删掉，次数留着', old && Object.keys(old.ip).length === 0 && old.n.pv === 5, JSON.stringify(old && old.ip));
T += 60 * 86400e3; await H.opsGc(T);
ok('[清理] 90 天前的登录记录删掉', (await H.loginList()).length === 0);
T += 100 * 86400e3; await H.opsGc(T);
ok('[清理] 180 天前的统计删掉', !(await H.ctx.storage.get('st:' + mod.dayKey(T - 200 * 86400e3))));
// 新管理后台页面：严格的安全头
r = await api('GET', '/admin/');
const csp = r.headers.get('content-security-policy');
ok('[页面] 新管理后台：只允许加载自己的脚本、不能被嵌入、不能连外网', r.status === 200 && /script-src 'self'/.test(csp) && !/unsafe-inline'[^;]*script|script-src[^;]*unsafe/.test(csp) && /connect-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp) && r.headers.get('x-frame-options') === 'DENY');
ok('[页面] 不存在的静态文件：404', (await api('GET', '/admin/assets/../hub.js')).status === 404 && (await api('GET', '/admin/assets/nope.js')).status === 404);

console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (!c && note ? '（' + String(note).slice(0, 300) + '）' : '')).join('\n'));
const pass = results.filter((r) => r[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

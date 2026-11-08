// 反馈编号：上报 / 反馈拿到编号，用编号查处理结果和回复（不用账号、不用邮箱）；查询页；小闪存模式的 cloudflared 下载转发
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
let T = Date.now(); Date.now = () => T;
env.ADMIN_EMAIL = 'boss@x.com';
const H = hub();
const rp = (b, ip = '5.5.5.5') => api('POST', '/api/report', b, { 'cf-connecting-ip': ip });
const st = (code, ip = '6.6.6.6') => api('GET', '/api/fb/' + code, null, { 'cf-connecting-ip': ip });

// 终端安装失败上报：拿到编号
let r = await rp({ kind: 'install', text: '面板版本：3.0.3\n失败的步骤：安装依赖\n错误：opkg 崩溃', log: 'Segmentation fault' });
let j = await r.json();
ok('[上报] 安装失败上报：返回 8 位编号', r.status === 200 && /^[a-z2-9]{8}$/.test(j.code || ''), JSON.stringify(j));
const code = j.code;
let L = (await (await adm('GET', '/feedback')).json()).list;
ok('[上报] 管理页列表里有编号', L[0].code === code);
const id = L[0].id;

// 用编号查：大小写都行；还没处理
r = await st(code.toUpperCase()); j = await r.json();
ok('[查询] 用编号查到：还没处理、没回复、类型是安装失败', r.status === 200 && j.ok && j.done === 0 && j.reply === '' && j.kind === '安装失败' && j.code === code.toUpperCase(), JSON.stringify(j));
ok('[查询] 不返回原文和日志（编号泄露也看不到内容）', !('text' in j) && !('log' in j) && !JSON.stringify(j).includes('Segmentation'));

// 进度三段：反馈成功 → 开发人员已收到 → 已修复 / 无法修复；补充说明不改进度
{
	let r2 = await rp({ kind: 'install', text: '进度测试：安装依赖失败', log: 'x' }, '5.5.5.9'); const c2 = (await r2.json()).code;
	const id2 = (await (await adm('GET', '/feedback')).json()).list.find((x) => x.code === c2).id;
	let k = await (await st(c2)).json();
	ok('[进度] 刚提交：第 1 段（反馈成功），state=open', k.stage === 1 && k.state === 'open' && k.ackAt === 0 && k.history.length === 0, JSON.stringify(k));
	await adm('POST', '/feedback/' + id2 + '/ack', { on: true }); k = await (await st(c2)).json();
	ok('[进度] 管理员点「标为已收到」：第 2 段，有收到时间', k.stage === 2 && k.ackAt > 0 && k.state === 'open', JSON.stringify(k));
	ok('[进度] 标已收到也算新进展（updated 变了，面板会提示），但没有说明', k.updated === k.ackAt && k.reply === '');
	await adm('POST', '/feedback/' + id2 + '/ack', { on: false }); k = await (await st(c2)).json();
	ok('[进度] 撤回已收到：回到第 1 段', k.stage === 1 && k.ackAt === 0);
	r2 = await adm('POST', '/feedback/' + id2 + '/done', { state: 'nofix', note: '', mail: false });
	ok('[无法修复] 不写原因：不让标（400，说清楚）', r2.status === 400 && /为什么没法修复/.test((await r2.json()).error));
	k = await (await st(c2)).json(); ok('[无法修复] 没写原因时状态不变', k.state === 'open' && k.stage === 1);
	await adm('POST', '/feedback/' + id2 + '/done', { state: 'nofix', note: '这是固件自带的 opkg 的问题，面板这边改不了。', mail: false }); k = await (await st(c2)).json();
	ok('[无法修复] 标了以后：state=nofix，第 3 段，done=0，nofix=1，原因就是回复', k.state === 'nofix' && k.stage === 3 && k.done === 0 && k.nofix === 1 && /opkg 的问题/.test(k.reply) && k.doneAt > 0, JSON.stringify(k));
	ok('[无法修复] 处理完了也算收到了（第 2 段自动亮）', k.ackAt > 0);
	r2 = await adm('POST', '/feedback/' + id2 + '/done', { state: 'note', note: '', mail: false });
	ok('[补充说明] 空的不让发', r2.status === 400);
	await adm('POST', '/feedback/' + id2 + '/done', { state: 'note', note: '换成 Kwrt 稳定版以后可以再试一次。', mail: false }); k = await (await st(c2)).json();
	ok('[补充说明] 发了以后：进度不变（还是无法修复），回复换成最新这条', k.state === 'nofix' && k.stage === 3 && k.reply === '换成 Kwrt 稳定版以后可以再试一次。', JSON.stringify(k));
	ok('[完整记录] 两条都在，新的在前，不含发邮件给谁', k.history.length === 2 && k.history[0].st === 'note' && k.history[1].st === 'nofix' && /opkg 的问题/.test(k.history[1].note) && !JSON.stringify(k.history).includes('mailed'), JSON.stringify(k.history));
	const L2 = (await (await adm('GET', '/feedback')).json()).list.find((x) => x.id === id2);
	ok('[管理页] 处理记录里分得清：无法修复、补充说明', L2.acts.map((a) => a.st).join() === 'nofix,note' && L2.nofix > 0 && !L2.done);
	await adm('POST', '/feedback/' + id2 + '/done', { state: 'open', note: '', mail: false }); k = await (await st(c2)).json();
	ok('[撤回] 撤回为未处理：回到第 2 段（已收到还在）', k.state === 'open' && k.stage === 2 && k.nofix === 0, JSON.stringify(k));
	r2 = await adm('POST', '/feedback/' + id2 + '/done', { state: 'gone', note: 'x' }); ok('[状态] 不认识的状态：400', r2.status === 400);
	await adm('POST', '/feedback/' + id2 + '/done', { state: 'fixed', note: '', mail: false }); k = await (await st(c2)).json();
	ok('[已修复] 第 3 段是已修复', k.state === 'fixed' && k.stage === 3 && k.done === 1 && k.nofix === 0);
	// 邮件：无法修复 / 补充说明的标题和内容
	env.RESEND_API_KEY = 're_x'; const sent = []; const of = globalThis.fetch;
	globalThis.fetch = async (u, i) => { if (String(u).includes('resend')) { sent.push(JSON.parse(i.body)); return new Response('{"id":"1"}', { status: 200 }); } return of(u, i); };
	r2 = await rp({ kind: 'other', text: '邮件测试邮件测试邮件测试', contact: 'u@x.com' }, '5.5.5.8'); const c3 = (await r2.json()).code;
	const id3 = (await (await adm('GET', '/feedback')).json()).list.find((x) => x.code === c3).id;
	await adm('POST', '/feedback/' + id3 + '/done', { state: 'nofix', note: '这个功能路由器不支持', mail: true });
	await adm('POST', '/feedback/' + id3 + '/done', { state: 'note', note: '补充一句', mail: true });
	globalThis.fetch = of; delete env.RESEND_API_KEY; sent.splice(0, sent.length, ...sent.filter((m) => m.to[0] === 'u@x.com'));
	ok('[邮件] 无法修复：标题「暂时没法修复」，内容写原因', sent[0] && sent[0].subject === '你反馈的问题暂时没法修复（受理编号 ' + c3.toUpperCase() + '）' && sent[0].html.includes('受理编号：<b style="letter-spacing:.06em">' + c3.toUpperCase()) && sent[0].html.includes('/r/' + c3.toUpperCase()) && /暂时没法修复/.test(sent[0].html) && /原因/.test(sent[0].html) && /路由器不支持/.test(sent[0].html), JSON.stringify(sent[0] || {}).slice(0, 200));
	ok('[邮件] 补充说明：标题「有新的说明」', sent[1] && sent[1].subject === '你反馈的问题有新的说明（受理编号 ' + c3.toUpperCase() + '）' && /补充一句/.test(sent[1].html), JSON.stringify(sent[1] || {}).slice(0, 200));
}

// 管理员标已修复、写说明 → 查到回复
r = await adm('POST', '/feedback/' + id + '/done', { done: true, note: '是固件的 opkg 坏了。\n换成 Kwrt 稳定版再装就行。', mail: false });
j = await (await st(code)).json();
ok('[查询] 标为已修复后：done=1，看到回复（换行保留）', j.done === 1 && j.reply === '是固件的 opkg 坏了。\n换成 Kwrt 稳定版再装就行。' && j.doneAt > 0 && j.replyAt > 0, JSON.stringify(j));
// 撤回，再写一条
await adm('POST', '/feedback/' + id + '/done', { done: false, note: '还有一种情况没修好', mail: false });
j = await (await st(code)).json();
ok('[查询] 撤回后：done=0，回复换成最新的一条', j.done === 0 && j.reply === '还有一种情况没修好', JSON.stringify(j));
// 只改状态不写说明：回复还是上一条
await adm('POST', '/feedback/' + id + '/done', { done: true, note: '', mail: false });
j = await (await st(code)).json();
ok('[查询] 再标已修复但没写说明：显示已修复，回复是上一条说明', j.done === 1 && j.reply === '还有一种情况没修好', JSON.stringify(j));

// 编号不对、格式不对
r = await st('abcd2345'); ok('[查询] 不存在的编号：404，说清楚', r.status === 404 && /没有这个编号/.test((await r.json()).error));
r = await st('../admin'); ok('[查询] 格式不对：404', r.status === 404);
r = await st('abc'); ok('[查询] 太短：404', r.status === 404);

// 官网报告也有编号
r = await rp({ kind: 'security', text: '发现一个安全问题发现一个安全问题', contact: 'a@b.com' }, '5.5.5.6'); j = await r.json();
ok('[上报] 官网报告也返回编号', /^[a-z2-9]{8}$/.test(j.code || ''));
j = await (await st(j.code)).json();
ok('[查询] 官网报告查到的类型是「官网报告」', j.kind === '官网报告', JSON.stringify(j));

// 面板里发的反馈（托管版）也有编号：用邀请码开通一台路由器，用它的钥匙发
const INV = (await (await adm('POST', '/invites', { max: 5, svc: 7, note: '测试' })).json()).invite.code;
const A = await (await reg(INV, '3.3.3.1')).json();
r = await api('POST', '/api/dev/feedback', { sub: A.sub, rkey: A.rkey, text: '面板里反馈的问题：首页打不开' }); j = await r.json();
ok('[面板反馈] 返回编号', r.status === 200 && j.ok && /^[a-z2-9]{8}$/.test(j.code || ''), JSON.stringify(j));
const pc = j.code;
j = await (await st(pc)).json();
ok('[面板反馈] 查到的类型是「问题反馈」', j.ok && j.kind === '问题反馈', JSON.stringify(j));
r = await api('POST', '/api/dev/feedback', { sub: A.sub, rkey: 'x'.repeat(32), text: '钥匙不对的反馈' });
ok('[面板反馈] 钥匙不对：403，不给编号', r.status === 403);

// 面板「我的反馈」：路由器凭钥匙一次拿到自己发过的反馈（带自己写的内容、进度、完整记录）
{
	const pushed = []; const H0 = hub(); const ow = H0.watch.bind(H0);
	H0.watch = (sub) => { const w = ow(sub); return new Proxy(w, { get: (t, k) => (k === 'push' ? async (m) => { pushed.push({ sub, ...m }); return 1; } : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) }); };
	r = await api('POST', '/api/dev/fb', { sub: A.sub, rkey: A.rkey }); j = await r.json();
	ok('[我的反馈] 路由器拿到自己发的反馈：带内容、编号、进度第 1 段', r.status === 200 && j.list.length === 1 && j.list[0].code === pc.toUpperCase() && j.list[0].text === '面板里反馈的问题：首页打不开' && j.list[0].stage === 1, JSON.stringify(j).slice(0, 300));
	r = await api('POST', '/api/dev/fb', { sub: A.sub, rkey: 'y'.repeat(32) }); ok('[我的反馈] 钥匙不对：403', r.status === 403);
	ok('[我的反馈] 不会拿到别人的（官网报告、终端上报都不在里面）', !j.list.some((x) => x.kind !== '问题反馈'));
	const fid = (await (await adm('GET', '/feedback')).json()).list.find((x) => x.code === pc).id;
	await adm('POST', '/feedback/' + fid + '/ack', { on: true });
	ok('[推送] 标为已收到：马上推送到这台路由器绑定的手机，点开到「我的反馈」', pushed.length === 1 && pushed[0].sub === A.sub && /已收到/.test(pushed[0].title) && pushed[0].body.includes(pc.toUpperCase()) && pushed[0].url === './?p=myfb', JSON.stringify(pushed));
	await adm('POST', '/feedback/' + fid + '/ack', { on: true });
	ok('[推送] 已经是已收到再点：不重复推送', pushed.length === 1);
	await adm('POST', '/feedback/' + fid + '/done', { state: 'fixed', note: '修好了', mail: false });
	ok('[推送] 标为已修复：推送「修好了」', pushed.length === 2 && /修好了/.test(pushed[1].title));
	j = await (await api('POST', '/api/dev/fb', { sub: A.sub, rkey: A.rkey })).json();
	ok('[我的反馈] 处理后：第 3 段、说明、完整记录、有新进展的时间', j.list[0].stage === 3 && j.list[0].reply === '修好了' && j.list[0].history.length === 1 && j.list[0].updated > 0);
	const rep = await (await rp({ kind: 'other', text: '官网报告的不推送官网报告的不推送' }, '5.5.6.1')).json();
	const rid = (await (await adm('GET', '/feedback')).json()).list.find((x) => x.code === rep.code).id;
	await adm('POST', '/feedback/' + rid + '/ack', { on: true });
	ok('[推送] 官网报告（没有路由器）：不推送', pushed.length === 2);
	H0.watch = ow;
}

// 官网报告：填邮箱 / 登录了用账号邮箱；发「收到了」邮件，带受理编号
{
	env.RESEND_API_KEY = 're_x'; const sent = []; const of = globalThis.fetch;
	globalThis.fetch = async (u, i) => { if (String(u).includes('resend')) { sent.push(JSON.parse(i.body)); return new Response('{"id":"1"}', { status: 200 }); } return of(u, i); };
	r = await rp({ kind: 'other', text: '官网报告带邮箱官网报告带邮箱', email: 'bad-mail' }, '5.5.6.2');
	ok('[邮箱] 格式不对：400', r.status === 400 && /邮箱格式不对/.test((await r.json()).error));
	r = await rp({ kind: 'other', text: '官网报告带邮箱官网报告带邮箱', email: 'me@x.com' }, '5.5.6.2'); j = await r.json();
	const mine = sent.filter((m) => m.to[0] === 'me@x.com'), other = j.code.toUpperCase();
	ok('[邮箱] 填了邮箱：马上发「收到了」邮件，标题和内容都有受理编号和查进度网址', j.ok && j.mailed === 1 && mine.length === 1 && mine[0].subject === '我们收到了你的报告（受理编号 ' + j.code.toUpperCase() + '）' && mine[0].html.includes('/r/' + j.code.toUpperCase()), JSON.stringify(mine[0] || {}).slice(0, 200));
	const L3 = (await (await adm('GET', '/feedback')).json()).list.find((x) => x.code === j.code);
	ok('[邮箱] 管理页里能发邮件给他', JSON.stringify(L3.mailTo) === '["me@x.com"]');
	// 登录了官网账号：不填邮箱也会用账号邮箱
	const uid = 'u' + 'a'.repeat(9), sid = 'b'.repeat(32);
	await hub().ctx.storage.put('u:' + uid, { uid, email: 'acc@x.com', devs: [{ sub: A.sub, at: Date.now(), alias: '客厅' }] });
	await hub().ctx.storage.put('s:' + sid, { uid, exp: Date.now() + DAY, kid: 'k', at: Date.now(), last: Date.now() });
	r = await api('POST', '/api/report', { kind: 'privacy', text: '登录了账号再报告的问题，不填邮箱' }, { 'cf-connecting-ip': '5.5.6.3', cookie: 'sid=' + sid }); j = await r.json();
	const L4 = (await (await adm('GET', '/feedback')).json()).list.find((x) => x.code === j.code);
	ok('[邮箱] 登录了官网账号、没填邮箱：自动用账号邮箱', JSON.stringify(L4.mailTo) === '["acc@x.com"]' && L4.uid === uid && sent.some((m) => m.to[0] === 'acc@x.com'));
	globalThis.fetch = of; delete env.RESEND_API_KEY;
	// 官网账号页「我的反馈」：账号里路由器发的 + 用这个账号报告的
	r = await api('POST', '/api/account/fb', {}, { cookie: 'sid=' + sid, origin: 'https://panel.example' }); j = await r.json();
	const codes = j.list.map((x) => x.code);
	ok('[账号页] 我的反馈：有账号里路由器在面板发的、有登录后在官网报告的，带内容和路由器名', r.status === 200 && codes.includes(pc.toUpperCase()) && codes.includes(L4.code.toUpperCase()) && j.list.find((x) => x.code === pc.toUpperCase()).name === '客厅' && j.list.every((x) => typeof x.text === 'string'), JSON.stringify(j).slice(0, 300));
	ok('[账号页] 别人的不会出现（没登录时填别的邮箱报告的）', !codes.includes(other));
	r = await api('POST', '/api/account/fb', {}, { origin: 'https://panel.example' }); ok('[账号页] 没登录：401', r.status === 401);
}

// 限次：同一个 IP 一天最多查 120 次
let last = 0; for (let i = 0; i < 121; i++) last = (await st(code, '9.9.9.9')).status;
ok('[查询] 同一个 IP 查太多次：429', last === 429, String(last));

// 查询页
r = await api('GET', '/r/' + code.toUpperCase()); let html = await r.text();
ok('[页面] /r/编号 打开查询页', r.status === 200 && /处理进度/.test(html) && /\/api\/fb\//.test(html) && /noindex/.test(html));
ok('[页面] 安全头：不能被嵌入、不带来源', r.headers.get('x-frame-options') === 'DENY' && r.headers.get('referrer-policy') === 'no-referrer');
r = await api('GET', '/r/abc'); ok('[页面] 编号格式不对：404', r.status === 404);
for (const p of ['/r', '/r/']) { r = await api('GET', p); ok('[页面] ' + p + ' 打开「输入编号查进度」', r.status === 200 && /输入编号查进度/.test(await r.text())); }
r = await api('GET', '/r/ABCDEFGH/x'); ok('[页面] /r/编号/多余的路径：404', r.status === 404);
// 页面把回复当文字显示（不会被当成网页代码执行）
ok('[页面] 说明用 esc() 转义后再显示', /esc\(x\.note\)/.test(html) && !/\$\{d\.reply\}|\$\{x\.note\}/.test(html));

// 小闪存模式：cloudflared 下载转发
const GH = []; const f1 = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => { const url = typeof input === 'string' ? input : input.url; if (url.startsWith('https://github.com/cloudflare/')) { GH.push(url); return new Response('CFDBIN', { status: 200, headers: { 'content-length': '6' } }); } return f1(input, init); };
r = await api('GET', '/dl/cfd/2026.8.3/cloudflared-linux-arm64');
ok('[下载] 转发 Cloudflare 官方 GitHub 发布的 cloudflared', r.status === 200 && (await r.text()) === 'CFDBIN' && GH[0] === 'https://github.com/cloudflare/cloudflared/releases/download/2026.8.3/cloudflared-linux-arm64', GH.join(','));
ok('[下载] 是二进制下载、长时间缓存', r.headers.get('content-type') === 'application/octet-stream' && /max-age=2592000/.test(r.headers.get('cache-control') || ''));
for (const bad of ['2026.8.3/cloudflared-linux-mips', '2026.8.3/../../x', 'latest/cloudflared-linux-arm64', '2026.8.3/cloudflared-linux-arm64.exe', '2026.8.3/cloudflared-windows-amd64.exe']) {
	r = await api('GET', '/dl/cfd/' + bad);
	ok('[下载] 不认识的文件不转发：' + bad, r.status === 404 && GH.length === 1);
}
globalThis.fetch = async (input, init = {}) => { const url = typeof input === 'string' ? input : input.url; if (url.startsWith('https://github.com/cloudflare/')) return new Response('nf', { status: 404 }); return f1(input, init); };
r = await api('GET', '/dl/cfd/2026.8.3/cloudflared-linux-amd64');
ok('[下载] GitHub 上没有：502（路由器会改从 GitHub 直接下）', r.status === 502);
globalThis.fetch = f1;

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

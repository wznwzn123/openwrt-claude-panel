// 第二轮安全审查修复：封禁的路由器、外人解绑、别人锁不住你的常用设备
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
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: '', VAPID_PRIV: '', RESEND_API_KEY: 're_test' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const hub = () => env.H.get('hub');
let ipn = 0;
const req = async (path, { body, cookie, ip, headers = {} } = {}) => {
	const h = { 'content-type': 'application/json', origin: 'https://panel.example', 'cf-connecting-ip': ip || '10.1.' + (Math.floor(++ipn / 200) % 250) + '.' + (ipn % 200), ...headers };
	if (cookie) h.cookie = cookie;
	const r = await mod.default.fetch(new Request('https://panel.example' + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
	let j = null; try { j = await r.clone().json(); } catch (e) {}
	return { st: r.status, j, sc: r.headers.getSetCookie ? r.headers.getSetCookie() : [] };
};
const ck = (r, n) => ((r.sc.join(';').match(new RegExp('__Host-' + n + '=([a-z2-9]{32})')) || [])[1]) || '';
const lastCode = () => (MAIL.slice(-1)[0].html.match(/>(\d{6})</) || MAIL.slice(-1)[0].subject.match(/(\d{6})/) || [])[1];
const reg = async (email, pw) => { await req('/api/account/code', { body: { email, kind: 'reg' } }); const r = await req('/api/account/register', { body: { email, password: pw, code: lastCode() } }); return { sid: ck(r, 'sid'), did: ck(r, 'did') }; };
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const router = async () => { const inv = (await req('/api/admin/invites', { body: { direct: true, max: 1 }, headers: ADM })).j.invite.code; return (await req('/api/register', { body: { invite: inv, name: 'Home', model: 'x' } })).j; };

/* ---------- 封禁的路由器 ---------- */
{
	const R = await router();
	const send0 = await req('/api/chat', { body: { op: 'send', sub: R.sub, rkey: R.rkey, text: '封禁前' } });
	ok('[封禁] 前提：正常时能发消息', send0.st === 200, JSON.stringify(send0.j));
	await hub().setOff(R.sub, true);
	const send = await req('/api/chat', { body: { op: 'send', sub: R.sub, rkey: R.rkey, text: '封禁后' } });
	const up = await req('/api/chat', { body: { op: 'up', sub: R.sub, rkey: R.rkey, name: 'a.jpg', size: 1024, type: 'image/jpeg' } });
	const get = await req('/api/chat', { body: { op: 'get', sub: R.sub, rkey: R.rkey } });
	ok('[封禁] 管理员封禁后：不能发消息、不能领上传票', send.st === 403 && up.st === 403, send.st + '/' + up.st);
	ok('[封禁] 还能看以前的对话（开发者可能写了原因）', get.st === 200 && (get.j.msgs || []).length >= 1, get.st);
	const pair = await req('/api/pair/start', { body: { sub: R.sub, rkey: R.rkey } });
	ok('[封禁] 不能再给它加账号（配对码）', pair.st === 403, pair.st + ' ' + JSON.stringify(pair.j));
	const info = await req('/api/dev/info', { body: { sub: R.sub, rkey: R.rkey } });
	ok('[封禁] 路由器还能查自己的状态（面板上显示「已停用」）', info.st === 200 && info.j.off === true, JSON.stringify(info.j));
	await hub().setOff(R.sub, false);
	ok('[封禁] 解封后：又能发消息', (await req('/api/chat', { body: { op: 'send', sub: R.sub, rkey: R.rkey, text: '解封后' } })).st === 200);
	// 到期暂停的：还能联系开发者（要续期）
	const d = await hub().ctx.storage.get('d:' + R.sub); d.exp = Date.now() - 1000; await hub().ctx.storage.put('d:' + R.sub, d);
	await hub()._setOff(R.sub, true, 'exp');
	ok('[封禁] 到期暂停的路由器：照样能发消息联系开发者', (await req('/api/chat', { body: { op: 'send', sub: R.sub, rkey: R.rkey, text: '想续期' } })).st === 200);
}

/* ---------- 外人解绑 ---------- */
{
	const A = await reg('alice@x.com', 'alice-pass-1');
	const R = await router();
	const ua = await hub().ctx.storage.get('e:alice@x.com');
	{ const d = await hub().ctx.storage.get('d:' + R.sub); d.users = [ua]; d.owner = ua; d.subs = {}; await hub().ctx.storage.put('d:' + R.sub, d); const u = await hub().ctx.storage.get('u:' + ua); u.devs = [{ sub: R.sub, at: Date.now() }]; await hub().ctx.storage.put('u:' + ua, u); }
	const B = await reg('bob@x.com', 'bob-pass-12');
	const r = await req('/api/account/unbind', { body: { sub: R.sub }, cookie: '__Host-sid=' + B.sid });
	ok('[解绑] 外人拿别人路由器的编号解绑：说没有这台路由器（以前回「成功」）', r.st === 404, r.st + ' ' + JSON.stringify(r.j));
	const d = await hub().ctx.storage.get('d:' + R.sub);
	ok('[解绑] 主人的绑定没动', d.users.includes(ua) && d.owner === ua);
}

/* ---------- 别人锁不住你的常用设备 ---------- */
{
	const C = await reg('carol@x.com', 'carol-pass-1');
	for (let i = 0; i < 10; i++) await req('/api/account/login', { body: { email: 'carol@x.com', password: 'wrong-' + i }, ip: '10.200.' + i + '.1' });
	const stranger = await req('/api/account/login', { body: { email: 'carol@x.com', password: 'carol-pass-1' }, ip: '10.201.0.1' });
	ok('[登录锁] 别人连输错 10 次后：没验证过的设备被锁 15 分钟', stranger.st === 429, stranger.st);
	const mine = await req('/api/account/login', { body: { email: 'carol@x.com', password: 'carol-pass-1' }, cookie: '__Host-did=' + C.did, ip: '10.202.0.1' });
	ok('[登录锁] 本人在验证过的常用设备上：照样能登录', mine.st === 200 && !!ck(mine, 'sid'), mine.st + ' ' + JSON.stringify(mine.j));
	const wrongMine = await req('/api/account/login', { body: { email: 'carol@x.com', password: 'nope-nope' }, cookie: '__Host-did=' + C.did, ip: '10.203.0.1' });
	ok('[登录锁] 常用设备上输错密码：照样是密码不对（不会因此放行）', wrongMine.st === 401);
}

console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 300) + '）')).join('\n'));
const pass = results.filter((x) => x[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

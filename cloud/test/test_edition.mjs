// 6.0 第 94 项（官网这边）：托管版的「AI 版 / 本地版」
// 开通本地版不建隧道（子域名指向 100::，心跳、推送照常）；换版本（路由器问这里要 / 关隧道）；官网主账号让路由器换（心跳带回指令）；
// 结果和失败原因记下来（管理后台能看到）；本地版从官网打开面板跳到家里局域网的地址
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const CF = []; let failTunnel = false, failDns = false;
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] }));
	const E = (msg) => new Response(JSON.stringify({ success: false, result: null, errors: [{ code: 1000, message: msg }] }), { status: 400 });
	if (u.hostname !== 'api.cloudflare.com') return new Response('{}');
	const body = init.body ? JSON.parse(init.body) : null;
	CF.push({ m, p: u.pathname, body });
	if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return failTunnel ? E('tunnel quota') : R({ id: 'tun' + CF.length, token: 'tok' + CF.length });
	if (m === 'POST' && u.pathname.endsWith('/dns_records')) return failDns && body.type === 'CNAME' ? E('dns broken') : R({ id: 'dns' + CF.length });
	return R({});
};
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: '', VAPID_PRIV: '', TRIAL_DAYS: '7' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const hub = () => env.H.get('hub'), S = () => hub().ctx.storage, W = (sub) => env.W.get('dev:' + sub);
let ipn = 0;
async function call(c, path, body) {
	const h = { 'content-type': 'application/json', origin: 'https://panel.example', 'cf-connecting-ip': '1.1.1.' + (++ipn % 200) };
	if (c && c.sid) h.cookie = '__Host-sid=' + c.sid;
	const res = await mod.default.fetch(new Request('https://panel.example' + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
	const sc = res.headers.get('set-cookie');
	if (c && sc) { const m = /sid=([a-z2-9]*);/.exec(sc); if (m) c.sid = m[1]; }
	let j = {}; try { j = await res.json(); } catch (e) {}
	return { st: res.status, j };
}
const post = async (path, body, hdr = {}, host = 'panel.example') => { const r = await mod.default.fetch(new Request('https://' + host + path, { method: 'POST', headers: { 'content-type': 'application/json', ...hdr }, body: JSON.stringify(body) }), env); let j = {}; try { j = await r.json(); } catch (e) {} return { st: r.status, j }; };
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const admGet = async (path) => { const r = await mod.default.fetch(new Request('https://panel.example' + path, { headers: ADM }), env); return { st: r.status, j: await r.json() }; };
const beat = (R, rep) => post('/cloud/beat/r/' + R.rkey, rep, {}, R.sub + '.panel.example');
const dev = (sub) => S().get('d:' + sub);

const A = { sid: '' }, B = { sid: '' };
await call(A, '/api/account/register', { email: 'alice@x.com', password: 'pass-alic-123' });
await call(B, '/api/account/register', { email: 'bob@x.com', password: 'pass-bob-1234' });

// ---------- 开通本地版 ----------
const tr = (await call(A, '/api/account/trial', {})).j;
CF.length = 0;
const R1 = (await post('/api/register', { invite: tr.code, name: 'Home', model: 'AX3000T', local: true }, { 'cf-connecting-ip': '9.9.9.1' })).j;
ok('本地版开通成功，回复里标着 local、没有隧道令牌', R1.sub && R1.local === true && R1.token === '' && R1.rkey, JSON.stringify(R1).slice(0, 200));
ok('本地版不建隧道', !CF.some((x) => /cfd_tunnel/.test(x.p)), JSON.stringify(CF.map((x) => x.m + ' ' + x.p)));
const dnsReq = CF.find((x) => /dns_records/.test(x.p));
ok('子域名还是有一条（心跳、推送要用）：指向 100::，走 Cloudflare 代理', dnsReq && dnsReq.body.type === 'AAAA' && dnsReq.body.content === '100::' && dnsReq.body.proxied === true);
let d1 = await dev(R1.sub);
ok('官网记着这台是本地版，没有隧道编号', d1.local === true && !d1.tunnel && d1.dns);
ok('本地版不探测面板网址（断线只看心跳）', (await W(R1.sub).getCfg()).probe === '');
let r = await beat(R1, { wan: 'ok', net: 'ok', dns: 'ok', tun: 'ok', panel: 'ok', clash: 'ok', ver: '6.0.0', ed: 'local', lan: '192.168.6.1:906' });
ok('心跳照常收', r.st === 200 && r.j.ok === true && !r.j.cmd, JSON.stringify(r.j));
ok('心跳里的版本、家里地址记下来了', (await W(R1.sub).brief()).ed === 'local' && (await W(R1.sub).brief()).lan === '192.168.6.1:906');
await beat(R1, { ver: '6.0.0', ed: 'local', lan: 'evil.example:80' });
ok('家里地址不是「IP:端口」的不认', (await W(R1.sub).brief()).lan === '');
await beat(R1, { ver: '6.0.0', ed: 'local', lan: '8.8.8.8:906' });
ok('公网地址不认（官网不会把人带到外面的网址）', (await W(R1.sub).brief()).lan === '');
await beat(R1, { ver: '6.0.0', ed: 'local', lan: '192.168.6.1:906' });

// ---------- 账号页：版本、打开面板 ----------
let me = (await call(A, '/api/account/me')).j, dv = me.devs.find((x) => x.sub === R1.sub);
ok('「我的路由器」里显示本地版', dv && dv.ed === 'local' && dv.role === 'main', JSON.stringify(dv).slice(0, 300));
r = await call(A, '/api/account/fam/open', { sub: R1.sub });
ok('本地版「打开面板」：跳到家里局域网的地址，带一次性的票', r.j.local === true && /^http:\/\/192\.168\.6\.1:906\/panel\/#open=[a-z2-9]{24}$/.test(r.j.url || ''), JSON.stringify(r.j));
const t1 = /#open=(\w+)/.exec(r.j.url)[1];
r = await post('/api/dev/ticket', { sub: R1.sub, rkey: R1.rkey, ticket: t1 });
ok('路由器拿这张票能换到身份（跟 AI 版一样，不用输密码）', r.j.ok === true && r.j.role === 'main', JSON.stringify(r.j).slice(0, 200));

// ---------- 官网让路由器换版本 ----------
r = await call(A, '/api/account/edition', { sub: R1.sub, to: 'ai' });
ok('换版本要先确认是本人', r.st === 403 && r.j.sudo === true);
await call(A, '/api/account/sudo_code', {}); await call(A, '/api/account/sudo', { code: '000000' });
r = await call(B, '/api/account/edition', { sub: R1.sub, to: 'ai' });
ok('别人的路由器不能换', r.st === 403);
r = await call(A, '/api/account/edition', { sub: R1.sub, to: 'local' });
ok('已经是本地版：说清楚', /已经是本地版/.test(r.j.error || ''));
r = await call(A, '/api/account/edition', { sub: R1.sub, to: 'ai' });
ok('主账号让路由器换成 AI 版：记下等路由器执行', r.j.ok === true && r.j.job && r.j.job.state === 'wait' && r.j.job.to === 'ai', JSON.stringify(r.j));
const cmdId = r.j.job.id;
r = await call(A, '/api/account/edition', { sub: R1.sub, to: 'ai' });
ok('上一次还没做完：不能再发', /还没做完/.test(r.j.error || ''));
r = await beat(R1, { ver: '6.0.0', ed: 'local', lan: '192.168.6.1:906', wan: 'down' });
ok('路由器下次心跳时把指令带回去', r.j.cmd && r.j.cmd.id === cmdId && r.j.cmd.to === 'ai', JSON.stringify(r.j));
me = (await call(A, '/api/account/me')).j; dv = me.devs.find((x) => x.sub === R1.sub);
ok('账号页能看到「正在换」', dv.edJob && dv.edJob.state === 'wait');

// 路由器执行：问官网要隧道
CF.length = 0;
r = await post('/api/dev/edition', { sub: R1.sub, rkey: 'x'.repeat(32), to: 'ai' });
ok('钥匙不对：不给隧道', r.st === 403);
r = await post('/api/dev/edition', { sub: R1.sub, rkey: R1.rkey, to: 'ai' });
ok('换成 AI 版：建隧道、给令牌', r.j.ok === true && /^tok/.test(r.j.token || '') && r.j.local === false, JSON.stringify(r.j));
ok('隧道只转发到路由器上的面板', CF.some((x) => /configurations/.test(x.p) && JSON.stringify(x.body).includes('127.0.0.1:18765')));
ok('子域名改指向隧道（先删 100:: 那条）', CF.some((x) => x.m === 'DELETE' && /dns_records/.test(x.p)) && CF.some((x) => x.m === 'POST' && x.body && x.body.type === 'CNAME'));
d1 = await dev(R1.sub);
ok('官网记成 AI 版、有隧道编号', !d1.local && d1.tunnel && d1.dns);
ok('又开始探测面板网址', /^https:\/\/.+\/panel\/manifest\.json$/.test((await W(R1.sub).getCfg()).probe));
r = await post('/api/dev/edres', { sub: R1.sub, rkey: R1.rkey, id: cmdId, to: 'ai', ok: true });
ok('路由器报成功', r.j.ok === true);
ok('指令清掉了，心跳不再带', !(await W(R1.sub).getCfg()).cmd);
d1 = await dev(R1.sub);
ok('记下这次换好了（官网发起的）', d1.edJob.state === 'ok' && d1.edJob.by === 'web' && !d1.edFail);

// ---------- 换回本地版（面板发起） ----------
CF.length = 0;
r = await post('/api/dev/edition', { sub: R1.sub, rkey: R1.rkey, to: 'local' });
ok('换成本地版：成功', r.j.ok === true && r.j.local === true, JSON.stringify(r.j));
ok('删隧道、子域名改回 100::', CF.some((x) => /cfd_tunnel\/tun/.test(x.p) && x.m === 'DELETE') && CF.some((x) => x.body && x.body.type === 'AAAA'));
d1 = await dev(R1.sub);
ok('官网记成本地版，不探测了', d1.local === true && !d1.tunnel && (await W(R1.sub).getCfg()).probe === '');
r = await post('/api/dev/edition', { sub: R1.sub, rkey: R1.rkey, to: 'local' });
ok('已经是本地版再要一次：照样成功（路由器重试时不出错）', r.j.ok === true);

// ---------- 失败：官网开不了隧道 ----------
failTunnel = true;
r = await post('/api/dev/edition', { sub: R1.sub, rkey: R1.rkey, to: 'ai' });
ok('官网开不了隧道：说清楚，标上是官网这一步', r.st === 502 && r.j.step === 'hub' && /开不了隧道/.test(r.j.error), JSON.stringify(r.j));
d1 = await dev(R1.sub);
ok('开不了隧道：还是本地版，子域名还在', d1.local === true && d1.dns);
failTunnel = false;
// DNS 改不过去：退回 100::，删掉建了一半的隧道
failDns = true; CF.length = 0;
r = await post('/api/dev/edition', { sub: R1.sub, rkey: R1.rkey, to: 'ai' });
d1 = await dev(R1.sub);
ok('子域名改不过去：退回本地版的子域名，删掉建了一半的隧道', r.st === 502 && d1.local === true && d1.dns && CF.some((x) => x.m === 'DELETE' && /cfd_tunnel\/tun/.test(x.p)), JSON.stringify(CF.map((x) => x.m + ' ' + x.p + ' ' + (x.body && x.body.type || ''))));
failDns = false;
// 路由器报失败（接不上隧道）
r = await post('/api/dev/edres', { sub: R1.sub, rkey: R1.rkey, id: 'abcdefghij', to: 'ai', ok: false, step: 'tunnel', why: '隧道 90 秒都没接上 <script>' });
d1 = await dev(R1.sub);
ok('失败原因记下来（去掉了尖括号）', d1.edFail && d1.edFail.step === 'tunnel' && /90 秒/.test(d1.edFail.why) && !/</.test(d1.edFail.why));
me = (await call(A, '/api/account/me')).j; dv = me.devs.find((x) => x.sub === R1.sub);
ok('账号页能看到失败在哪一步', dv.edJob && dv.edJob.state === 'fail' && dv.edJob.step === 'tunnel');
const ad = (await admGet('/api/admin/devices')).j;
const ar = (ad.list || ad.devices || ad).find ? (ad.list || ad.devices || ad).find((x) => x.sub === R1.sub) : null;
ok('管理后台：标本地版、能看到换版本失败', ar && ar.ed === 'local' && ar.edFail && ar.edFail.step === 'tunnel', JSON.stringify(ar || ad).slice(0, 300));
const lg = JSON.stringify((await admGet('/api/admin/log')).j);
ok('管理后台的操作记录里有这次失败', /换成 AI 版失败/.test(lg), lg.slice(0, 200));

// ---------- 过期 / 停用 ----------
await hub()._setOff(R1.sub, true, 'exp');
r = await post('/api/dev/edition', { sub: R1.sub, rkey: R1.rkey, to: 'ai' });
ok('到期了：不能换', r.st === 403 && /到期/.test(r.j.error));
await hub().setOff(R1.sub, false);
d1 = await dev(R1.sub);
const lastDns = CF.filter((x) => x.body && x.body.type).slice(-1)[0];
ok('本地版恢复以后：子域名还是指向 100::（不是隧道）', d1.local === true && lastDns && lastDns.body.type === 'AAAA');

// ---------- 普通 AI 版开通照旧 ----------
const tr2 = (await call(B, '/api/account/trial', {})).j;
CF.length = 0;
const R2 = (await post('/api/register', { invite: tr2.code, name: 'B', model: 'x' }, { 'cf-connecting-ip': '9.9.9.2' })).j;
ok('AI 版开通照旧：建隧道、给令牌', R2.sub && /^tok/.test(R2.token) && !R2.local && CF.some((x) => /cfd_tunnel/.test(x.p)));
r = await call(B, '/api/account/fam/open', { sub: R2.sub });
ok('AI 版打开面板照旧走专属网址', /^https:\/\/[a-z0-9]+\.panel\.example\/panel\/#open=/.test(r.j.url || '') && !r.j.local);
await beat(R2, { ver: '6.0.0', ed: 'noai' });
me = (await call(B, '/api/account/me')).j;
ok('旧的托管纯面板版：账号页标出来', me.devs.find((x) => x.sub === R2.sub).ed === 'noai');
await call(B, '/api/account/sudo_code', {}); await call(B, '/api/account/sudo', { code: '000000' });
await beat(R2, { ver: '5.2.3', ed: 'noai' });
r = await call(B, '/api/account/edition', { sub: R2.sub, to: 'local' });
ok('路由器还是旧版面板：先升级再换', /太旧/.test(r.j.error || ''), JSON.stringify(r.j));

let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + note)); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

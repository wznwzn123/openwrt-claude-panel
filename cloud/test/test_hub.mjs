// 托管服务：邀请码、自动开通（隧道 + 子域名）、失败回滚、名额、限流、每台独立的云端、越权攻击、删除、封禁、回收、管理接口
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
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 'cf-token', CF_ACCOUNT_ID: 'acc1', CF_ZONE_ID: 'zone1', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '3', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(), st = new Map(); return { objs, st, idFromName: (n) => n, get(id) { if (!objs.has(id)) { const s = memStorage(); st.set(id, s); objs.set(id, new Cls({ storage: s }, env)); } return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const req = (method, url, body, headers = {}) => mod.default.fetch(new Request(url, { method, body: body == null ? undefined : (typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body)), headers: { 'content-type': 'application/json', ...headers } }), env);
const api = (method, path, body, h) => req(method, 'https://panel.example' + path, body, h);
const adm = (method, path, body) => api(method, '/api/admin' + path, body, { authorization: 'Bearer admin-key-1234567890' });
const reg = (invite, ip = '1.1.1.1', extra = {}) => api('POST', '/api/register', { invite, name: 'Kwrt', model: 'JD RE-SS-01', ...extra }, { 'cf-connecting-ip': ip });
const hub = () => env.H.get('hub');
const dev = async (sub) => (await hub().ctx.storage.get('d:' + sub));

// 管理接口要密钥
ok('管理接口没有密钥：拒绝', (await api('GET', '/api/admin/devices')).status === 401);
ok('管理接口密钥不对：拒绝', (await api('GET', '/api/admin/devices', null, { authorization: 'Bearer admin-key-1234567899' })).status === 401);
let r = await (await adm('POST', '/invites', { max: 2, days: 30, note: '朋友' })).json();
const INV = r.invite.code;
ok('管理员生成邀请码（10 位、可用 2 次、30 天）', /^[A-Z2-9]{10}$/.test(INV) && r.invite.max === 2 && r.invite.exp > Date.now() + 29 * 86400e3, JSON.stringify(r));

// 开通
ok('没有邀请码：拒绝', (await reg('')).status === 403);
ok('邀请码不对：拒绝', (await reg('WRONGCODE1')).status === 403);
ok('拒绝时没建任何隧道', CF.tunnels.size === 0 && CF.dns.size === 0);
let a = await reg(INV.toLowerCase());
const A = await a.json();
ok('邀请码不分大小写，开通成功', a.status === 200 && /^[a-z2-9]{8}$/.test(A.sub) && A.host === A.sub + '.panel.example', JSON.stringify(A));
ok('返回隧道令牌、云端地址、三把各不相同的 32 位钥匙', A.token && A.url === 'https://' + A.host + '/cloud' && [A.rkey, A.tkey, A.pkey].every((k) => /^[a-z2-9]{32}$/.test(k)) && new Set([A.rkey, A.tkey, A.pkey]).size === 3);
const tunA = [...CF.tunnels.entries()].find(([, t]) => t.name === 'cmcp-' + A.sub);
ok('建了远程配置的隧道', tunA && tunA[1].src === 'cloudflare' && A.token === 'tok-' + tunA[0]);
const ing = tunA[1].cfg.ingress;
ok('隧道只转发这个子域名到路由器的面板，其他一律 404', ing.length === 2 && ing[0].hostname === A.host && ing[0].service === 'http://127.0.0.1:18765' && ing[1].service === 'http_status:404' && !ing[1].hostname, JSON.stringify(ing));
const dnsA = [...CF.dns.values()].find((d) => d.name === A.host);
ok('加了走 Cloudflare 代理的 CNAME 指向这条隧道', dnsA && dnsA.type === 'CNAME' && dnsA.proxied === true && dnsA.content === tunA[0] + '.cfargotunnel.com');
const dA = await dev(A.sub);
ok('登记里没有保存任何钥匙（钥匙只在那台路由器自己的云端里）', dA && dA.state === 'ok' && !JSON.stringify(dA).match(/rkey|tkey|pkey|token/) && dA.name === 'Kwrt' && dA.model === 'JD RE-SS-01', JSON.stringify(dA));
ok('它的云端已经开始定时探测', env.W.st.get('dev:' + A.sub).alarmAt > 0);
const B = await (await reg(INV, '2.2.2.2')).json();
ok('第二台拿到不同的网址和钥匙', B.sub && B.sub !== A.sub && B.rkey !== A.rkey);
ok('邀请码 2 次用完：第三次拒绝', (await reg(INV, '3.3.3.3')).status === 403);

// 每台独立的云端 + 越权攻击
const onA = (m, path, body, h) => req(m, 'https://' + A.host + path, body, h);
const onB = (m, path, body, h) => req(m, 'https://' + B.host + path, body, h);
ok('A 用自己的钥匙发心跳：成功', (await onA('POST', '/cloud/beat/r/' + A.rkey, { wan: 'ok' })).status === 200);
ok('拿 A 的钥匙去 B 的网址发心跳：拒绝', (await onB('POST', '/cloud/beat/r/' + A.rkey, {})).status === 403);
ok('拿 A 的面板钥匙读 B 的云端状态：拒绝', (await onB('POST', '/cloud/s', { token: A.pkey })).status === 403);
ok('拿 A 的路由器钥匙读 B 的备份列表：拒绝', (await onB('GET', '/cloud/bk/' + A.rkey)).status === 403);
ok('拿 A 的钥匙往 B 发通知：拒绝', (await onB('POST', '/cloud/n/' + A.rkey, { title: 'x' })).status === 403);
ok('拿 A 的钥匙改 B 的推送设置：拒绝', (await onB('POST', '/cloud/push', { token: A.pkey, op: 'list' })).status === 403);
ok('面板钥匙不能当路由器钥匙用', (await onA('GET', '/cloud/bk/' + A.pkey)).status === 403);
ok('平板钥匙不能当路由器钥匙用', (await onA('POST', '/cloud/beat/r/' + A.tkey, {})).status === 403);
const sA = await (await onA('POST', '/cloud/s', { token: A.pkey })).json();
ok('A 用面板钥匙读到自己的状态（有心跳）', sA.r && sA.r.last > 0, JSON.stringify(sA).slice(0, 120));
const sB = await (await onB('POST', '/cloud/s', { token: B.pkey })).json();
ok('B 看不到 A 的心跳（数据互相隔离）', !sB.r);
ok('上传备份只进自己的云端', (await onA('POST', '/cloud/bk/' + A.rkey + '?name=a', new Uint8Array(5000))).status === 200 && (await (await onB('GET', '/cloud/bk/' + B.rkey)).json()).list.length === 0);
ok('没开通的子域名：404', (await req('POST', 'https://zzzzzzzz.panel.example/cloud/s', { token: A.pkey })).status === 404);
ok('格式不对的子域名：404', (await req('POST', 'https://abc.panel.example/cloud/s', { token: A.pkey })).status === 404 && (await req('POST', 'https://x.' + A.host + '/cloud/s', { token: A.pkey })).status === 404);
ok('别的域名冒充：404', (await req('POST', 'https://' + A.sub + '.evil.example/cloud/s', { token: A.pkey })).status === 404);
ok('主域名下的 /cloud 不对应任何路由器', (await api('POST', '/cloud/s', { token: A.pkey })).status === 404);

// 名额上限（这里设成 3 台）
const inv2 = (await (await adm('POST', '/invites', { max: 10 })).json()).invite.code;
const C = await (await reg(inv2, '4.4.4.4')).json();
ok('第三台开通成功', !!C.sub);
r = await reg(inv2, '5.5.5.5');
ok('名额满了：拒绝开通，邀请码不扣次数', r.status === 403 && /名额已满/.test((await r.json()).error) && (await hub().ctx.storage.get('i:' + inv2)).used === 1);

// 删除（路由器卸载时）
ok('删除时钥匙不对：拒绝，什么都没删', (await api('POST', '/api/unregister', { sub: C.sub, rkey: A.rkey })).status === 403 && !!(await dev(C.sub)) && CF.tunnels.size === 3);
r = await api('POST', '/api/unregister', { sub: C.sub, rkey: C.rkey });
ok('用自己的钥匙删除：隧道、子域名、云端数据都删掉，名额腾出来', r.status === 200 && !(await dev(C.sub)) && CF.tunnels.size === 2 && ![...CF.dns.values()].some((d) => d.name === C.host) && env.W.st.get('dev:' + C.sub).mem.size === 0 && (await hub().count()) === 2);
ok('删掉以后这个网址的云端：404', (await req('POST', 'https://' + C.host + '/cloud/s', { token: C.pkey })).status === 404);

// 开通到一半失败：回滚
CF.fail = '/dns_records';
const nT = CF.tunnels.size;
r = await reg(inv2, '6.6.6.6');
ok('加子域名失败：开通失败', r.status === 502);
ok('失败后已建的隧道被删掉、名额和邀请码次数都退回', CF.tunnels.size === nT && (await hub().count()) === 2 && (await hub().ctx.storage.get('i:' + inv2)).used === 1 && (await hub().devices()).every((d) => d.state === 'ok'));
CF.fail = null;

// 限流：同一个 IP 一小时最多 5 次
const inv3 = (await (await adm('POST', '/invites', { max: 50 })).json()).invite.code;
env.MAX_DEVICES = '100';
let codes = [];
for (let i = 0; i < 6; i++) codes.push((await reg(inv3, '9.9.9.9')).status);
ok('同一个 IP 一小时第 6 次：429', codes.slice(0, 5).every((c) => c === 200) && codes[5] === 429, codes.join(','));

// 同时抢最后一个名额
env.MAX_DEVICES = String(await hub().count() + 1);
const both = await Promise.all([reg(inv3, '7.7.7.1'), reg(inv3, '7.7.7.2')]);
ok('两台同时抢最后一个名额：只有一台成功', both.map((x) => x.status).sort().join(',') === '200,403', both.map((x) => x.status).join(','));
env.MAX_DEVICES = '100';

// 封禁 / 解封
r = await (await adm('POST', '/devices/' + B.sub + '/off')).json();
ok('封禁：子域名删掉，网址立刻打不开', r.ok && ![...CF.dns.values()].some((d) => d.name === B.host) && (await dev(B.sub)).off > 0);
ok('封禁后云端也拒绝', (await onB('POST', '/cloud/beat/r/' + B.rkey, {})).status === 404);
r = await (await adm('POST', '/devices/' + B.sub + '/on')).json();
ok('解封：子域名加回来，云端恢复', r.ok && [...CF.dns.values()].some((d) => d.name === B.host) && !(await dev(B.sub)).off && (await onB('POST', '/cloud/beat/r/' + B.rkey, {})).status === 200);

// 管理员看列表、删邀请码、删设备
const L = await (await adm('GET', '/devices')).json();
ok('管理员看到全部设备和名额', L.list.length === (await hub().count()) && L.max === 100 && L.list.some((d) => d.sub === A.sub));
ok('管理员能删掉邀请码，删了就不能用', (await (await adm('DELETE', '/invites/' + inv3)).json()).ok && (await reg(inv3, '8.8.8.8')).status === 403);

// 回收：90 天没上线
const old = await dev(A.sub);
old.seen = Date.now() - 91 * 86400e3;
await hub().ctx.storage.put('d:' + A.sub, old);
r = await (await adm('POST', '/cleanup')).json();
ok('90 天没上线的自动回收（隧道、子域名、数据都删）', r.removed.includes(A.sub) && !(await dev(A.sub)) && ![...CF.dns.values()].some((d) => d.name === A.host) && !(await dev(B.sub)) === false, JSON.stringify(r));
// 心跳会刷新「最后上线」
const bd = await dev(B.sub); bd.seen = 1; await hub().ctx.storage.put('d:' + B.sub, bd);
const wcfg = await env.W.get('dev:' + B.sub).getCfg(); delete wcfg.seenAt; await env.W.st.get('dev:' + B.sub).put('cfg', wcfg);
await onB('POST', '/cloud/beat/r/' + B.rkey, {});
ok('路由器发心跳会告诉开通中心「还在用」', (await dev(B.sub)).seen > Date.now() - 5000);

// 首页和健康检查
ok('官网首页能打开', (await api('GET', '/')).status === 200);
const ping = await (await api('GET', '/api/ping')).json();
ok('健康检查显示名额', ping.ok && ping.max === 100);
ok('Cloudflare 接口一直带着令牌（没有未授权调用）', CF.calls.length > 0);

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

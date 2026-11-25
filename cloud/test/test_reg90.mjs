// 6.0 第 90 项：开通中途断了，安装码不再白白用掉——同一台路由器重试拿回结果、出错退回、开通后 1 天没连上收回
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
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 'cf-token', CF_ACCOUNT_ID: 'acc1', CF_ZONE_ID: 'zone1', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '30', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(), st = new Map(); return { objs, st, idFromName: (n) => n, get(id) { if (!objs.has(id)) { const s = memStorage(); st.set(id, s); objs.set(id, new Cls({ storage: s }, env)); } return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const req = (method, url, body, headers = {}) => mod.default.fetch(new Request(url, { method, body: body == null ? undefined : (typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body)), headers: { 'content-type': 'application/json', ...headers } }), env);
const api = (method, path, body, h) => req(method, 'https://panel.example' + path, body, h);
const adm = (method, path, body) => api(method, '/api/admin' + path, body, { authorization: 'Bearer admin-key-1234567890' });
const reg = (invite, ip = '1.1.1.1', extra = {}) => api('POST', '/api/register', { invite, name: 'Kwrt', model: 'JD RE-SS-01', ...extra }, { 'cf-connecting-ip': ip });
const hub = () => env.H.get('hub');
const dev = async (sub) => (await hub().ctx.storage.get('d:' + sub));

const RID = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', DAY = 86400e3;
const mkInv = async (max = 1) => (await (await adm('POST', '/invites', { direct: true, max, days: 30, note: 't' })).json()).invite.code;
const inv = async (c) => hub().ctx.storage.get('i:' + c);
// ① 同一台路由器重试：拿回上次的结果，不再扣码
let C1 = await mkInv(1);
let a = await (await reg(C1, '1.1.1.1', { rid: RID })).json();
ok('带编号开通成功', a.sub && a.rkey, JSON.stringify(a));
const t0 = CF.tunnels.size;
let b = await reg(C1, '1.1.1.1', { rid: RID }); let B = await b.json();
ok('没收到回复再装一次（同一个编号）：拿回同一个网址和钥匙，标明是重拿的', b.status === 200 && B.again === true && B.sub === a.sub && B.rkey === a.rkey && B.token === a.token, JSON.stringify(B));
ok('重拿不再建隧道、不再扣码', CF.tunnels.size === t0 && (await inv(C1)).used === 1);
b = await reg(C1, '1.1.1.1', { rid: 'ffffffffffffffffffffffffffffffff' }); B = await b.json();
ok('换一个编号（别的路由器）拿不到：提示用完了', b.status === 403 && /用完/.test(B.error) && !B.rkey, JSON.stringify(B));
b = await reg('WRONGCODE9', '1.1.1.1', { rid: RID });
ok('编号对、安装码不对：拿不到', b.status === 403);
ok('不带编号（老版安装脚本）：照旧提示用完了', (await reg(C1, '1.1.1.1')).status === 403);
// 路由器连上官网以后，开通结果删掉
await hub().seen(a.sub, Date.now());
ok('路由器第一次连上官网：开通结果删掉、不再算「刚开通」', !(await hub().ctx.storage.get('rr:' + (await dev(a.sub)).rr)) && !(await dev(a.sub)).fresh && !(await dev(a.sub)).rr);
ok('之后再用同一个编号：拿不到', (await reg(C1, '1.1.1.1', { rid: RID })).status === 403);
// ② 建好隧道以后出错：删掉建了一半的、退回安装码
const C2 = await mkInv(1);
const W0 = hub().watch.bind(hub());
hub().watch = (s) => ({ setup: async () => { throw new Error('模拟出错'); }, wipe: async () => {} });
const nT = CF.tunnels.size, nD = CF.dns.size;
b = await reg(C2, '2.2.2.2', { rid: 'b'.repeat(32) }); B = await b.json();
hub().watch = W0;
ok('建好隧道以后出错：报开通失败，说清楚安装码没扣', b.status === 502 && /安装码没扣/.test(B.error), JSON.stringify(B));
ok('建了一半的隧道、子域名删掉，安装码退回', CF.tunnels.size === nT && CF.dns.size === nD && (await inv(C2)).used === 0 && !(await hub().devices()).some((d) => d.invite === C2));
b = await reg(C2, '2.2.2.2', { rid: 'b'.repeat(32) });
ok('再装一次就成功', b.status === 200);
// 建隧道就失败（以前就会退回）
const C3 = await mkInv(1);
CF.fail = '/configurations'; b = await reg(C3, '3.3.3.3'); CF.fail = null;
ok('建隧道失败：退回安装码，提示可以再装', b.status === 502 && (await inv(C3)).used === 0 && /再装一次/.test((await b.json()).error));
// ③ 开通到一半卡住超过 1 小时（官网中途断了）：清理时删掉隧道、退回安装码
const C4 = await mkInv(1);
const st = hub().ctx.storage;
{ const i = await inv(C4); i.used = 1; await st.put('i:' + C4, i); }
CF.tunnels.set('tun-stuck', { name: 'cmcp-stuck001', src: 'cloudflare', cfg: null }); CF.dns.set('dns-stuck', { name: 'x' });
await st.put('d:stuck001', { sub: 'stuck001', state: 'pending', created: Date.now() - 2 * 3600e3, invite: C4, tunnel: 'tun-stuck', dns: 'dns-stuck' });
let r = await (await adm('POST', '/cleanup')).json();
ok('卡住的半成品：清掉隧道和子域名、退回安装码', !(await dev('stuck001')) && !CF.tunnels.has('tun-stuck') && !CF.dns.has('dns-stuck') && (await inv(C4)).used === 0, JSON.stringify(r));
// ④ 开通好了但 1 天没连上过官网：收回、退回安装码；连上过的不动
const C5 = await mkInv(2);
const x1 = await (await reg(C5, '5.5.5.5', { rid: 'c'.repeat(32) })).json();
const x2 = await (await reg(C5, '5.5.5.5', { rid: 'd'.repeat(32) })).json();
await hub().seen(x2.sub, Date.now());
for (const s of [x1.sub, x2.sub]) { const d = await dev(s); d.created = Date.now() - 2 * DAY; await st.put('d:' + s, d); }
const nt1 = CF.tunnels.size;
r = await (await adm('POST', '/cleanup')).json();
ok('开通后 1 天都没连上官网的：收回网址（删隧道）、退回安装码', !(await dev(x1.sub)) && CF.tunnels.size === nt1 - 1 && (await inv(C5)).used === 1, JSON.stringify(r));
ok('连上过官网的：不动', !!(await dev(x2.sub)) && (await dev(x2.sub)).state === 'ok');
ok('收回后安装码能再用：同一台再装一次，重新开通', (await reg(C5, '5.5.5.5', { rid: 'c'.repeat(32) })).status === 200 && (await inv(C5)).used === 2);
// 官网账号的安装码：退回时放回账号里，提示改成「每个安装码只能装一台」
await st.put('u:uidtest01', { uid: 'uidtest01', email: 'z@x.com', devs: [], inst: ['INSTCODE01'] });
await st.put('i:INSTCODE01', { code: 'INSTCODE01', uid: 'uidtest01', max: 1, used: 0, exp: Date.now() + DAY, at: Date.now() });
const y = await (await reg('INSTCODE01', '6.6.6.6', { rid: 'e'.repeat(32) })).json();
ok('安装码开通：加到账号里、从账号的安装码里去掉', y.bound === true && (await st.get('u:uidtest01')).devs.length === 1 && !(await st.get('u:uidtest01')).inst.includes('INSTCODE01'), JSON.stringify(y));
b = await reg('INSTCODE01', '6.6.6.6', { rid: 'f'.repeat(32) }); B = await b.json();
ok('安装码用过了：提示每个安装码只能装一台、回官网重新拿', b.status === 403 && /每个安装码只能装一台/.test(B.error) && /重新拿一个/.test(B.error), JSON.stringify(B));
{ const d = await dev(y.sub); d.created = Date.now() - 2 * DAY; await st.put('d:' + y.sub, d); }
await adm('POST', '/cleanup');
const u = await st.get('u:uidtest01');
ok('1 天没连上收回后：账号里的路由器去掉，安装码放回账号、可以再用', !u.devs.length && u.inst.includes('INSTCODE01') && (await inv('INSTCODE01')).used === 0, JSON.stringify(u));


console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

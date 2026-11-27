// 公告即时送达（用户 11/27：后台发出、修改都要所有路由器马上收到）：
// 托管版每分钟的心跳回复里带公告版本号（annv）；自建版问 /api/notices/v。发布、修改、删除、定时发布到点、到期都会让版本号变
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
globalThis.fetch = async () => new Response('{}', { status: 200 });
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 'cf-token', CF_ACCOUNT_ID: 'acc1', CF_ZONE_ID: 'zone1', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '20', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls, e) => { const objs = new Map(); return { objs, idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, e)); return objs.get(id); } }; };
env.W = ns(mod.Watch, env); env.H = ns(mod.Hub, env);
const req = (e, method, url, body, headers = {}) => mod.default.fetch(new Request(url, { method, body: body == null ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } }), e);
const adm = (m, p, b) => req(env, m, 'https://panel.example/api/admin' + p, b, { authorization: 'Bearer admin-key-1234567890' });
let T = Date.now(); Date.now = () => T;
// 一台路由器的心跳（单台模式，跟官网用同一个 Hub）
const env1 = { RKEY: 'rk', TKEY: 'tk', PANEL_TOKEN: 'pt', VAPID_PUB: '', VAPID_PRIV: '', PROBE_URL: 'https://x/p', H: env.H };
const W1 = new mod.Watch({ storage: memStorage() }, env1);
env1.W = { idFromName: () => 'id', get: () => W1 };
const beat = async () => (await req(env1, 'POST', 'https://router.example/cloud/beat/r/rk', { wan: 'ok', net: 'ok', dns: 'ok', tun: 'ok', panel: 'ok', clash: 'ok', ready: 4 })).json();
const selfv = async () => (await req(env, 'GET', 'https://panel.example/api/notices/v')).json();

let b = await beat(), v0 = b.annv;
ok('心跳回复里带公告版本号', b.ok && typeof v0 === 'string' && /^\d+\.\d+$/.test(v0), JSON.stringify(b));
let s = await selfv();
ok('自建版的版本号接口：跟心跳的一样，不缓存', s.ok && s.v === v0);
let r = await adm('POST', '/ann', { title: '今晚维护', body: '2 点到 3 点', level: 'normal' }), j = await r.json();
const a1 = j.ann.id;
b = await beat();
ok('后台发一条公告：版本号马上变（下一次心跳就带新的）', b.annv && b.annv !== v0, `${v0} → ${b.annv}`);
const v1 = b.annv;
ok('再来一次心跳：没改就不变', (await beat()).annv === v1);
await adm('POST', '/ann/' + a1, { title: '今晚维护（改到 3 点）', body: '3 点到 4 点', level: 'normal' });
const v2 = (await beat()).annv;
ok('修改公告：版本号也变', v2 && v2 !== v1, `${v1} → ${v2}`);
await adm('DELETE', '/ann/' + a1);
const v3 = (await beat()).annv;
ok('删除公告：版本号也变', v3 && v3 !== v2, `${v2} → ${v3}`);
// 定时发布：发的时候变一次，到点（公告出现）又变一次；到期消失也变
r = await adm('POST', '/ann', { title: '明早升级', body: 'x', level: 'normal', start: T + 3600e3, days: 1 }); j = await r.json();
const v4 = (await beat()).annv;
ok('定时发布：保存时变', v4 !== v3);
T += 3600e3 + 1000;
const v5 = (await beat()).annv;
ok('定时发布到点：版本号又变（路由器马上去取，公告出现）', v5 !== v4, `${v4} → ${v5}`);
T += 86400e3 + 1000;
const v6 = (await beat()).annv;
ok('到期：版本号又变（路由器取了以后公告消失）', v6 !== v5, `${v5} → ${v6}`);
ok('自建版接口跟着变', (await selfv()).v === v6);
// 心跳合并（同样的状态 60 秒内不交给 Durable Object）时也带版本号：用一个有缓存的环境看一下
{
	const store = new Map();
	globalThis.caches = { default: { match: async (k) => { const x = store.get(k.url); return x ? new Response(x) : undefined; }, put: async (k, res) => { store.set(k.url, await res.text()); }, delete: async (k) => store.delete(k.url) } };
	const b1 = await beat(), b2 = await beat();
	ok('心跳被合并（没交给 Durable Object）的那次也带版本号', b2.m === 1 && b2.annv === b1.annv && !!b1.annv, JSON.stringify([b1, b2]));
	await adm('POST', '/ann', { title: '缓存里也要马上变', body: 'x', level: 'normal' });
	const b3 = await beat();
	ok('后台改了公告：同一个机房的缓存马上清掉，下一次心跳就是新版本号', b3.annv !== b2.annv, `${b2.annv} → ${b3.annv}`);
	delete globalThis.caches;
}

let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

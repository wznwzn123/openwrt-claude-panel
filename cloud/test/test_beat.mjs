// 省用量：一切正常、状态没变时，心跳最多每 3 分钟交给 Durable Object 一次；状态一变马上交；
// 正常时不另外定时叫醒，心跳断了才定时检查；断电照样能判断出来
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
let T = 1.8e12; const realNow = Date.now; Date.now = () => T;
// 假的 Cloudflare 缓存（同一个机房）
const C = new Map();
globalThis.caches = { default: { async match(r) { const v = C.get(r.url); return v ? new Response(v) : undefined; }, async put(r, res) { C.set(r.url, await res.text()); } } };
let probeCode = 200, probes = 0;
globalThis.fetch = async (u) => { if (String(u).startsWith('https://x/p')) { probes++; return new Response('', { status: probeCode }); } return new Response('{}'); };
const env = { RKEY: 'rk', TKEY: 'tk', PANEL_TOKEN: 'pt', PROBE_URL: 'https://x/p', VAPID_PUB: '', VAPID_PRIV: '' };
const storage = memStorage();
const obj = new mod.Watch({ storage }, env);
let wakes = 0; const beat0 = obj.beatIn.bind(obj); obj.beatIn = async (...a) => { wakes++; return beat0(...a); };
env.W = { idFromName: (n) => n, get: () => obj };
const call = (path, body) => mod.default.fetch(new Request('https://r.example.com' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }), env);
const OK = { wan: 'ok', net: 'ok', dns: 'ok', tun: 'ok', panel: 'ok', clash: 'ok', ready: 4, up: 100, mem: 80 };

let r = await call('/cloud/beat/r/rk', OK);
ok('第一次心跳：交给 Durable Object，判断为一切正常', r.status === 200 && wakes === 1 && (await storage.get('s')).state === 'ok');
ok('收心跳时顺便探测隧道', probes === 1);
const a1 = storage.alarmAt;
ok('一切正常：下一次定时检查排在「心跳断了」那一刻（5 分钟后），平时不另外叫醒', a1 - T >= 300e3, (a1 - T) / 1000);
for (let i = 1; i <= 2; i++) { T += 60e3; r = await call('/cloud/beat/r/rk', { ...OK, up: 100 + i * 60, mem: 70 + i }); }
ok('状态没变（只有开机时间、内存变了）：1 分钟、2 分钟后的心跳不叫醒它', r.status === 200 && wakes === 1, wakes);
T += 60e3; await call('/cloud/beat/r/rk', OK);
ok('隔了 3 分钟：照常交一次', wakes === 2, wakes);
ok('隧道探测也是 3 分钟左右一次', probes === 2, probes);
ok('定时检查跟着往后推', storage.alarmAt - T >= 300e3);
T += 30e3; await call('/cloud/beat/r/rk', { ...OK, dns: 'fail' });
ok('状态变了（DNS 出问题）：马上交，马上判断', wakes === 3 && (await storage.get('s')).state === 'partial', (await storage.get('s')).state);
ok('有小问题但心跳还在：不另外每分钟叫醒，只在心跳断了那一刻检查（省用量；恢复靠心跳马上报上来）', storage.alarmAt - T >= 270e3 && storage.alarmAt - T <= 305e3, (storage.alarmAt - T) / 1000);
T += 30e3; await call('/cloud/beat/r/rk', OK);
ok('恢复正常：也马上交', wakes === 4 && (await storage.get('s')).state === 'ok');
T += 20e3; r = await call('/cloud/beat/r/WRONG', OK);
ok('钥匙不对：就算刚交过也要核对，拒绝', r.status === 403 && wakes === 5);
r = await call('/cloud/beat/t/tk', {}); T += 60e3; await call('/cloud/beat/t/tk', {});
ok('平板心跳不合并（已装的面板按 150 秒判断平板在不在，合并会误报）', r.status === 200 && wakes === 7, wakes);
ok('平板钥匙不能当路由器钥匙', (await call('/cloud/beat/r/tk', OK)).status === 403);
C.clear(); T += 10e3; await call('/cloud/beat/r/rk', OK);
ok('缓存没了（换了机房）：照常交，不会漏', wakes === 9, wakes);

// 突然断电：心跳不来了
const w0 = wakes; T += 5 * 60e3 + 6e3; probeCode = 530;
await obj.alarm();
ok('心跳断了 5 分钟：定时检查醒来，隧道探测失败 1 次，先不下结论，改成每分钟检查', storage.alarmAt - T === 60e3 && (await storage.get('probe')).fail === 1);
T += 60e3; await obj.alarm();
const s = await storage.get('s');
ok('再过 1 分钟：判断为断电或断网，记事件', ['down', 'power', 'net'].includes(s.state), s.state);
ok('断电时间从最后一次心跳算起', s.since <= T - 6 * 60e3);
probeCode = 200; T += 60e3; await call('/cloud/beat/r/rk', OK);
ok('来电后第一次心跳：马上重新探测隧道，马上恢复「一切正常」（不用再等 1 分钟）', (await storage.get('s')).state === 'ok' && wakes === w0 + 1, (await storage.get('s')).state);
ok('恢复后又回到「平时不另外叫醒」', storage.alarmAt - T >= 300e3);

// 粗算：一天 1440 次心跳，状态一直没变时叫醒几次
const w1 = wakes; for (let i = 0; i < 1440; i++) { T += 60e3; await call('/cloud/beat/r/rk', { ...OK, up: i }); }
ok('一切正常的一天：叫醒约 480 次（原来 1440 次心跳 + 1440 次定时检查）', wakes - w1 >= 470 && wakes - w1 <= 490, wakes - w1);

// 省用量：探测在 Durable Object 外面做，回包马上释放
let inDO = 0, probedInDO = 0, cancelled = 0;
for (const k of ['beatIn', 'probeIn']) { const f = obj[k].bind(obj); obj[k] = async (...a) => { inDO++; try { return await f(...a); } finally { inDO--; } }; }
globalThis.fetch = async (u) => {
	if (String(u).startsWith('https://x/p')) { probes++; if (inDO) probedInDO++; const body = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(10)); }, cancel() { cancelled++; } }); return new Response(body, { status: probeCode }); }
	return new Response('{}');
};
C.clear(); T += 200e3; const p0 = probes;
await call('/cloud/beat/r/rk', OK);
ok('收心跳时的隧道探测在 Durable Object 外面做（等路由器回话的时间不算 Durable Object 用量）', probes === p0 + 1 && probedInDO === 0, probedInDO);
ok('探测只看状态码，回包马上释放', cancelled === 1, cancelled);
ok('探测结果交回去后照样判断、排下一次检查', (await storage.get('s')).state === 'ok' && (await storage.get('probe')).at === T && storage.alarmAt - T >= 300e3);
ok('过期的探测结果（比已有的还旧）不会覆盖', (await obj.probeIn(T - 120e3, 530), (await storage.get('probe')).fail === 0));

// 长时间断线：查得越来越少
probeCode = 530; const off0 = T; let n = 0;
while (T - off0 < 24 * 3600e3) { T = storage.alarmAt; await obj.alarm(); n++; }
const st = await storage.get('s');
ok('断线一整天：判断为断电或断网', ['down', 'power', 'net'].includes(st.state), st.state);
ok('断线一整天：定时检查约 90 次（原来每分钟一次是 1440 次）', n >= 70 && n <= 110, n);
ok('断了 6 小时以上：每 30 分钟查一次', storage.alarmAt - T === 1800e3, (storage.alarmAt - T) / 1000);
ok('刚断的 15 分钟内照样每分钟检查（断电提醒不晚发）', mod.gapFor(5 * 60e3) === 60e3 && mod.gapFor(14 * 60e3) === 60e3 && mod.gapFor(30 * 60e3) === 180e3 && mod.gapFor(2 * 3600e3) === 600e3);
probeCode = 200; C.clear(); const ev0 = ((await storage.get('ev')) || []).length;
await call('/cloud/beat/r/rk', OK);
ok('断了一天后来电：第一次心跳就恢复「一切正常」，不用等定时检查', (await storage.get('s')).state === 'ok');
ok('恢复时只记一条「恢复正常」，不会多记一条「隧道断开」', ((await storage.get('ev')) || []).slice(0, ((await storage.get('ev')) || []).length - ev0).every((e) => !/隧道断开/.test(e.msg)));
ok('恢复后又回到「平时不另外叫醒」', storage.alarmAt - T >= 300e3);
// 探测结果万一没交回来：1 分钟内有定时检查兜底
const pi = obj.probeIn; obj.probeIn = async () => { throw new Error('x'); };
C.clear(); T += 200e3; probeCode = 200; await call('/cloud/beat/r/rk', OK);
ok('探测结果没交回来：1 分钟内有定时检查兜底', storage.alarmAt - T <= 60e3, (storage.alarmAt - T) / 1000);
obj.probeIn = pi;
// 心跳钥匙不对时不探测（不能被人拿来刷路由器）
const p1 = probes; C.clear(); T += 200e3; await call('/cloud/beat/r/WRONG', OK);
ok('钥匙不对：不探测路由器', probes === p1);
// 用户 11/28：后台「打开面板 x 前」+ 补丁号——心跳带的 po（秒）、hot 变了马上交过去；路由器重启后报 0 不覆盖；比现在晚太多的不认
C.clear(); T += 200e3; await call('/cloud/beat/r/rk', OK);
let wpo = wakes, po1 = Math.floor(T / 1000) - 120;
T += 60e3; await call('/cloud/beat/r/rk', { ...OK, po: po1, hot: 7 });
let b = await obj.brief();
ok("打开面板时间、补丁号：变了马上交过去，后台读得到", wakes === wpo + 1 && b.po === po1 * 1000 && b.hot === 7, JSON.stringify(b));
T += 60e3; await call('/cloud/beat/r/rk', { ...OK, po: 0, hot: 7 });
b = await obj.brief();
ok('路由器重启后报 0：还是上次的时间', b.po === po1 * 1000, JSON.stringify(b));
T += 60e3; await call('/cloud/beat/r/rk', { ...OK, po: Math.floor(T / 1000) + 86400, hot: 7 });
ok('比现在晚一天的（路由器时间不准）：不认', (await obj.brief()).po === po1 * 1000);
T += 60e3; await call('/cloud/beat/r/rk', { ...OK, po: po1 - 600, hot: 99999 });
b = await obj.brief();
ok('更早的时间不往回改；补丁号乱的不认', b.po === po1 * 1000 && b.hot === 0, JSON.stringify(b));
Date.now = realNow;
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] !== undefined && !x[1] ? '（' + String(x[2]).slice(0, 200) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

// 热补丁分批推送和退回（用户 11/28）：尝鲜 → 10% → 50% → 全部，每批 6 小时；一台装失败就暂停；手动「检查更新」直接装；
// 后台推下一批 / 暂停 / 继续 / 全部退回 / 重新推送；按台固定；V0 能退回原样；老的 cmcp-hot 只拿推到「全部」的
// 在 cloud 目录里运行：node test/test_hotro.mjs
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
// 假的 GitHub：发布列表（REL）、补丁下载地址（HEAD 能不能下到）
let REL = [];
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url;
	if (url.includes('api.github.com') && url.includes('/releases?')) return new Response(JSON.stringify(REL));
	if (init.method === 'HEAD') { const m = /\/releases\/download\/(hot-[^/]+)\/SHA256SUMS\.sig2$/.exec(url); if (m && REL.some((r) => r.tag_name === m[1])) return new Response(null, { status: 302, headers: { location: 'https://objects.example/x' } }); }
	if (url.includes('api.resend.com')) return new Response('{"id":"x"}');
	return new Response('nope', { status: 404 });
};
let NOW = Date.UTC(2026, 10, 28, 2, 0, 0);
const realNow = Date.now; Date.now = () => NOW;
const pub = (tag, body, at) => REL.unshift({ tag_name: tag, body: body || tag, prerelease: true, published_at: new Date(at || NOW).toISOString() });
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'k'.repeat(20), ADMIN_EMAIL: 'admin@example.com', RESEND_API_KEY: 'r', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const hub = env.H.get('hub'), S = hub.ctx.storage;
const call = async (p, o = {}) => { const r = await mod.default.fetch(new Request('https://panel.example' + p, o), env); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { st: r.status, t, j }; };
const ask = async (q) => (await call('/api/router/hot?' + new URLSearchParams(q))).j;
const adm = (p, b) => call('/api/admin/' + p, { method: b === undefined ? 'GET' : 'POST', headers: { authorization: 'Bearer ' + env.ADMIN_KEY, 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
const rep = (b) => call('/api/router/hotrep', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.' + (1 + Math.floor(Math.random() * 200)) }, body: JSON.stringify(b) });
const hr = async (base, n) => S.get('hr:' + base + '-' + n);
// 分到哪一批：跟官网同一个算法，挑几台在 10% 里、在 50% 里、都不在的
const bucket = async (key, n) => { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key + '|' + n))); return (d[0] * 256 + d[1]) % 100; };
async function keysFor(n) {
	const o = {};
	for (let i = 0; i < 4000 && !(o.in10 && o.in50 && o.out); i++) {
		const id = ('a' + i.toString(32).padStart(15, '2')).replace(/[01lo]/g, 'z').slice(0, 16), k = 'i:' + id, b = await bucket(k, n);
		if (b < 10 && !o.in10) o.in10 = id; else if (b >= 10 && b < 50 && !o.in50) o.in50 = id; else if (b >= 50 && !o.out) o.out = id;
	}
	return o;
}
const H6 = 6 * 3600e3;

// ① 分批推送上线以前发的补丁：直接算推给全部（V1–V3）
pub('hot-6.0.0-1', '补丁一', NOW - 5 * 86400e3); pub('hot-6.0.0-2', '补丁二', NOW - 3 * 86400e3); pub('hot-6.0.0-3', '补丁三', NOW - 86400e3);
let j = await ask({ v: '6.0.0' });
ok('上线以前发的补丁算推给全部：老的 cmcp-hot 照样拿到第 3 个', j && j.n === 3 && j.tag === 'hot-6.0.0-3', JSON.stringify(j));
ok('记录是「全部」', (await hr('6.0.0', 3)).stage === 'all' && (await hr('6.0.0', 1)).stage === 'all');

// ② 新补丁 V4：尝鲜里没人 4 天内打开过面板 → 跳过尝鲜，直接 10%
NOW += 3600e3; pub('hot-6.0.0-4', '补丁四');
const K4 = await keysFor(4);
j = await ask({ v: '6.0.0', h: 3, k: 'i:' + K4.in10, id: K4.in10 });
ok('新补丁：尝鲜里没有 4 天内打开过面板的，跳过尝鲜直接 10%', (await hr('6.0.0', 4)).stage === 'p10', JSON.stringify(await hr('6.0.0', 4)));
ok('在 10% 里的路由器：装第 4 个', j.n === 4 && j.tag === 'hot-6.0.0-4' && !j.back, JSON.stringify(j));
j = await ask({ v: '6.0.0', h: 3, k: 'i:' + K4.in50, id: K4.in50 });
ok('不在 10% 里的：还是第 3 个（不装）', j.n === 3 && !j.back, JSON.stringify(j));
j = await ask({ v: '6.0.0' });
ok('老的 cmcp-hot（不带参数）：没推到全部就不给', j.n === 3, JSON.stringify(j));
j = await ask({ v: '6.0.0', h: 3 });
ok('关了兼容上报的自建版（没有编号）：最后一批才给', j.n === 3, JSON.stringify(j));
j = await ask({ v: '6.0.0', h: 3, k: 'i:' + K4.out, id: K4.out, f: 1 });
ok('点了「检查更新」：直接装最新的', j.n === 4, JSON.stringify(j));
let t = (await call('/api/notices?v=6.0.0&k=h')).j;
ok('公告接口带的 hot 是正在推的最新补丁（轮没轮到这台由 /api/router/hot 说了算）', t.hot === 4 && !t.hotw, JSON.stringify(t));

// ③ 6 小时没出问题：10% → 50% → 全部
NOW += H6 - 60e3; await ask({ v: '6.0.0' });
ok('不到 6 小时：还是 10%', (await hr('6.0.0', 4)).stage === 'p10');
NOW += 120e3; j = await ask({ v: '6.0.0', h: 3, k: 'i:' + K4.in50, id: K4.in50 });
ok('满 6 小时：推到 50%，在 50% 里的装上', (await hr('6.0.0', 4)).stage === 'p50' && j.n === 4, JSON.stringify(j));
j = await ask({ v: '6.0.0', h: 3, k: 'i:' + K4.out, id: K4.out });
ok('50% 以外的还等着', j.n === 3);
NOW += H6 + 1000; await hub.hotTick([{ base: '6.0.0', list: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }] }]);
ok('每小时的定时任务也会推到下一批：全部', (await hr('6.0.0', 4)).stage === 'all');
j = await ask({ v: '6.0.0' });
ok('推到全部以后老的 cmcp-hot 也拿到', j.n === 4);

// ④ 尝鲜：后台通过的路由器（兼容上报的编号），4 天内打开过面板 → 新补丁先给它们
const BETA = 'b2b2b2b2b2b2b2b2', IDLEB = 'c3c3c3c3c3c3c3c3';
await S.put('cp:' + BETA, { last: NOW, ap: { st: 'ok' } }); await S.put('cp:' + IDLEB, { last: NOW, ap: { st: 'ok' } });
hub._hrb = null;
await ask({ v: '6.0.0', h: 4, k: 'i:' + BETA, id: BETA, po: Math.floor(NOW / 1000) - 3600 });
await ask({ v: '6.0.0', h: 4, k: 'i:' + IDLEB, id: IDLEB, po: Math.floor(NOW / 1000) - 5 * 86400 });
NOW += 60e3; pub('hot-6.0.0-5', '补丁五');
const K5 = await keysFor(5);
j = await ask({ v: '6.0.0', h: 4, k: 'i:' + BETA, id: BETA, po: Math.floor(NOW / 1000) - 3600 });
ok('有 4 天内打开过面板的尝鲜路由器：新补丁从尝鲜开始，它先装', (await hr('6.0.0', 5)).stage === 'beta' && j.n === 5, JSON.stringify(j));
j = await ask({ v: '6.0.0', h: 4, k: 'i:' + IDLEB, id: IDLEB, po: Math.floor(NOW / 1000) - 5 * 86400 });
ok('尝鲜里 4 天没打开过面板的：不算尝鲜，不先给', j.n === 4, JSON.stringify(j));
j = await ask({ v: '6.0.0', h: 4, k: 'i:' + K5.in10, id: K5.in10 });
ok('尝鲜这一批：别的路由器（哪怕在 10% 里）先不给', j.n === 4, JSON.stringify(j));

// ⑤ 一台装失败就停：托管版（凭专属网址编号和路由器钥匙认）
await env.W.get('dev:abcd2345').ctx.storage.put('cfg', { sub: 'abcd2345', rkey: 'R'.repeat(32) });
let r = await rep({ v: '6.0.0', n: 5, ok: 0, err: '装完面板打不开，已退回原来的', s: 'abcd2345', rk: 'wrong' });
ok('钥匙不对的报告不收', r.st === 403 && (await hr('6.0.0', 5)).stage === 'beta', r.t);
r = await rep({ v: '6.0.0', n: 5, ok: 0, err: '下载失败', id: BETA });
ok('下载失败（多半是网络）：记下来，不暂停', r.st === 200 && (await hr('6.0.0', 5)).stage === 'beta' && (await hr('6.0.0', 5)).fails.some((x) => x.soft), r.t);
r = await rep({ v: '6.0.0', n: 5, ok: 0, err: '装完面板打不开，已退回原来的', id: 'zzzzzzzzzzzzzzzz' });
ok('认不出的路由器（没有兼容上报记录）报的失败：不算', r.j.skip && (await hr('6.0.0', 5)).stage === 'beta');
r = await rep({ v: '6.0.0', n: 5, ok: 0, err: '装完面板打不开，已退回原来的 http://192.168.1.1/x', s: 'abcd2345', rk: 'R'.repeat(32) });
let rec = await hr('6.0.0', 5);
ok('托管版装失败：自动暂停', r.j.paused && rec.stage === 'paused' && rec.prev === 'beta', JSON.stringify(rec));
ok('失败原因洗掉网址', rec.fails.some((x) => x.key === 's:abcd2345' && !/192\.168|http/.test(x.err) && /<网址>/.test(x.err)), JSON.stringify(rec.fails));
j = await ask({ v: '6.0.0', h: 4, k: 'i:' + BETA, id: BETA, po: Math.floor(NOW / 1000) - 3600, f: 1 });
ok('暂停时：点了「检查更新」也不给', j.n === 4, JSON.stringify(j));
t = (await call('/api/notices?v=6.0.0&k=h')).j;
ok('暂停时公告接口的 hot 回到上一个', t.hot === 4, JSON.stringify(t));
let b = (await adm('badge')).j;
ok('后台菜单「补丁」红点：1 个暂停着', b.hot === 1, JSON.stringify(b));
NOW += 7 * H6; await ask({ v: '6.0.0' });
ok('暂停着不会到时间自己往下推', (await hr('6.0.0', 5)).stage === 'paused');

// ⑥ 后台：列表、继续、推下一批、暂停
let L = (await adm('hot')).j;
ok('后台列表：每个补丁一行，有批次、失败原因、记录', L.ok && L.list.some((x) => x.n === 5 && x.stage === 'paused' && x.fails.length >= 1 && x.log.length >= 2) && L.list[0].n === 5, JSON.stringify(L.list.map((x) => [x.n, x.stage])));
r = await adm('hot/6.0.0-5/next', {});
ok('暂停着不能直接推下一批', r.st === 400);
r = await adm('hot/6.0.0-5/resume', {});
ok('继续：回到暂停前那一批（尝鲜），重新算 6 小时', r.st === 200 && (await hr('6.0.0', 5)).stage === 'beta' && (await hr('6.0.0', 5)).at === NOW, r.t);
r = await adm('hot/6.0.0-5/next', {});
ok('推下一批：尝鲜 → 10%', r.st === 200 && (await hr('6.0.0', 5)).stage === 'p10');
j = await ask({ v: '6.0.0', h: 4, k: 'i:' + K5.in10, id: K5.in10 });
ok('推到 10% 以后，10% 里的装上', j.n === 5);
r = await adm('hot/6.0.0-5/pause', {});
ok('手动暂停', r.st === 200 && (await hr('6.0.0', 5)).stage === 'paused');
await adm('hot/6.0.0-5/resume', {});

// ⑦ 全部退回：退到上一个（V4）；装着 V5 的往回装，公告接口带 hotw
r = await adm('hot/6.0.0-5/back', {});
ok('全部退回：退到 V4', r.st === 200 && r.j.to === 4 && (await hr('6.0.0', 5)).stage === 'back', r.t);
j = await ask({ v: '6.0.0', h: 5, k: 'i:' + K5.in10, id: K5.in10 });
ok('装着 V5 的：往回装 V4（back）', j.n === 4 && j.back === true && j.tag === 'hot-6.0.0-4', JSON.stringify(j));
j = await ask({ v: '6.0.0', h: 4, k: 'i:' + K5.out, id: K5.out, f: 1 });
ok('退回以后点「检查更新」也不给 V5', j.n === 4 && !j.back);
t = (await call('/api/notices?v=6.0.0&k=h')).j;
ok('公告接口：hot = 4、hotw = 5（装着 V5 的马上问一次）', t.hot === 4 && t.hotw === 5, JSON.stringify(t));
j = await ask({ v: '6.0.0' });
ok('老的 cmcp-hot 拿到的也是 4（它本来就不会往回装）', j.n === 4 && !j.back);
// 退回以后又发了 V6：V6 照常分批，装着 V5 的直接装 V6 也行
NOW += 60e3; pub('hot-6.0.0-6', '补丁六');
const K6 = await keysFor(6);
j = await ask({ v: '6.0.0', h: 5, k: 'i:' + K6.out, id: K6.out });
ok('退回以后又发了新补丁：不在这批的、装着退回的 V5 → 先退回 V4', j.n === 4 && j.back, JSON.stringify(j));
ok('新补丁 V6 从尝鲜开始（那台尝鲜路由器 4 天内打开过面板）', (await hr('6.0.0', 6)).stage === 'beta');
await adm('hot/6.0.0-6/next', {});
j = await ask({ v: '6.0.0', h: 5, k: 'i:' + K6.in10, id: K6.in10 });
ok('在新补丁这一批里的：直接装 V6（补丁是累计的）', j.n === 6 && !j.back, JSON.stringify(j));
r = await adm('hot/6.0.0-5/redo', {});
ok('退回的能重新推送（从头分批）', r.st === 200 && ['beta', 'p10'].includes((await hr('6.0.0', 5)).stage), r.t);
await adm('hot/6.0.0-5/back', {});
ok('全部退回会连带后面的补丁一起退回', (await hr('6.0.0', 6)).stage === 'back', JSON.stringify(await hr('6.0.0', 6)));

// ⑧ 按台退回：固定在 V3；取消固定后照常
r = await adm('hotpin', { key: 'i:' + K4.in10, base: '6.0.0', n: 3 });
ok('按台固定在 V3', r.st === 200, r.t);
j = await ask({ v: '6.0.0', h: 4, k: 'i:' + K4.in10, id: K4.in10, f: 1 });
ok('固定的路由器：往回装 V3，点「检查更新」也不变', j.n === 3 && j.back && j.tag === 'hot-6.0.0-3', JSON.stringify(j));
r = await adm('hotpin', { key: 'i:' + K4.in10, base: '6.0.0', n: 5 });
ok('不能固定在退回了的补丁上', r.st === 400);
await env.W.get('dev:abcd2345').ctx.storage.put('cfg', { sub: 'abcd2345', rkey: 'R'.repeat(32) });
r = await adm('hotpin', { key: 's:abcd2345', base: '6.0.0', n: 3 });
const cfg = await env.W.get('dev:abcd2345').ctx.storage.get('cfg');
ok('托管版固定：心跳回复里带一次 hotc，路由器马上问', r.st === 200 && cfg.hotc > 0, JSON.stringify(cfg));
const out = await env.W.get('dev:abcd2345').beat('r', { wan: 'ok' });
ok('心跳回复带 hotc 以后清掉（只带一次）', out && out.hotc === 1 && !(await env.W.get('dev:abcd2345').ctx.storage.get('cfg')).hotc, JSON.stringify(out));
r = await adm('hotpin', { key: 'i:' + K4.in10, base: '6.0.0', n: null });
j = await ask({ v: '6.0.0', h: 3, k: 'i:' + K4.in10, id: K4.in10 });
ok('取消固定：照常（V4）', r.st === 200 && j.n === 4 && !j.back, JSON.stringify(j));
r = await adm('hotpin', { key: 'x:bad', base: '6.0.0', n: 3 });
ok('编号格式不对：拒绝', r.st === 400);

// ⑨ V0（6.0.1 起每个版本发布时带一个，正式版原样）：能一直退回原样；更新日志、版本下拉不列 V0
pub('hot-6.0.1-0', '正式版原样'); NOW += 60e3; pub('hot-6.0.1-1', '6.0.1 补丁一');
await adm('hot/6.0.1-1/next', {}); await adm('hot/6.0.1-1/next', {}); await adm('hot/6.0.1-1/next', {});
j = await ask({ v: '6.0.1', h: 0, k: 'i:' + K4.out, id: K4.out });
ok('6.0.1 V1 推到全部：装上', j.n === 1, JSON.stringify(j));
r = await adm('hot/6.0.1-1/back', {});
ok('6.0.1 V1 全部退回：退到 V0', r.st === 200 && r.j.to === 0, r.t);
j = await ask({ v: '6.0.1', h: 1, k: 'i:' + K4.out, id: K4.out });
ok('装着 V1 的往回装 V0（正式版原样）', j.n === 0 && j.back && j.tag === 'hot-6.0.1-0', JSON.stringify(j));
r = await adm('hot/6.0.0-4/back', {}); await adm('hot/6.0.0-3/back', {}); await adm('hot/6.0.0-2/back', {});
r = await adm('hot/6.0.0-1/back', {});
ok('没有 V0 的版本（6.0.0）：V1 不能全部退回', r.st === 400 && /V0/.test(r.j.error), r.t);
L = (await adm('hot')).j;
ok('后台列表按版本分组：6.0.1 在前，V0 标「正式版原样」', L.list[0].base === '6.0.1' && L.list.some((x) => x.base === '6.0.1' && x.n === 0 && x.stage === 'v0'), JSON.stringify(L.list.map((x) => x.base + ' ' + x.n)));
REL.push({ tag_name: 'v6.0.0', body: '最低版本：v6.0.0【必须更新】\n\n**新功能**\n- 分流', prerelease: false, published_at: new Date(NOW - 9 * 86400e3).toISOString() });
REL.push({ tag_name: 'v6.0.1', body: '**修复**\n- 一条', prerelease: false, published_at: new Date(NOW - 86400e3).toISOString() });
const cl = (await call('/api/changelog')).j;
const c600 = (cl.list || []).find((x) => x.v === 'v6.0.0'), c601 = (cl.list || []).find((x) => x.v === 'v6.0.1');
ok('更新日志：全部退回了的补丁不列（6.0.0 只剩没退回的）', c600 && !(c600.hot || []).some((h) => h.n >= 2), JSON.stringify(c600 && c600.hot));
ok('更新日志：V0 不列', c601 && !(c601.hot || []).some((h) => h.n === 0), JSON.stringify(c601 && c601.hot));
const vl = (await adm('versions')).j;
ok('公告版本下拉不列 V0', !vl.list.some((x) => x.hot === 0 && x.base), JSON.stringify(vl.list.slice(0, 6)));


// ⑪ 补丁记录 180 天后删除（隐私政策写的）
NOW += 181 * 86400e3; await hub.hotTick([]);
ok('补丁记录 180 天后删除', !(await S.list({ prefix: 'hr:' })).size);
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
Date.now = realNow;
process.exit(fail ? 1 : 0);

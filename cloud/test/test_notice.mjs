// 4.0「通知」：公告（管理页发、公开读）、云端/托管服务发的通知记录（面板里能翻到）
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
globalThis.fetch = async () => new Response('{}', { status: 200 });
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 'cf-token', CF_ACCOUNT_ID: 'acc1', CF_ZONE_ID: 'zone1', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '20', VAPID_PUB: '', VAPID_PRIV: '', RKEY: 'rk', TKEY: 'tk', PANEL_TOKEN: 'pt' };
const ns = (Cls) => { const objs = new Map(); return { objs, idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const req = (method, url, body, headers = {}) => mod.default.fetch(new Request(url, { method, body: body == null ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } }), env);
const api = (m, p, b, h) => req(m, 'https://panel.example' + p, b, h);
const adm = (m, p, b) => api(m, '/api/admin' + p, b, { authorization: 'Bearer admin-key-1234567890' });
let T = Date.now(); Date.now = () => T;
const DAY = 86400e3;

/* ---------- 公告 ---------- */
let r = await api('GET', '/api/notices'), j = await r.json();
ok('[公告] 没有公告时返回空列表', r.status === 200 && j.ok && j.list.length === 0);
ok('[公告] 公开接口缓存 5 分钟', r.headers.get('cache-control') === 'public, max-age=300');
ok('[公告] 管理接口要管理密钥', (await api('GET', '/api/admin/ann')).status === 401 || (await api('GET', '/api/admin/ann')).status === 403);
ok('[公告] 普通访问者不能发公告', [401, 403].includes((await api('POST', '/api/admin/ann', { title: 'x' })).status));
r = await adm('POST', '/ann', { title: '  ', body: 'x' });
ok('[公告] 标题空的不收', r.status === 400 && /标题/.test((await r.json()).error));
r = await adm('POST', '/ann', { title: '4.0 发布了', body: '新加了「通知」', level: 'important', days: 7 }); j = await r.json();
ok('[公告] 发一条重要公告（7 天）', r.status === 200 && j.ok && /^[a-z2-9]{10}$/.test(j.ann.id) && j.ann.level === 'important' && j.ann.exp === T + 7 * DAY, JSON.stringify(j));
const a1 = j.ann.id;
T += 1000;
r = await adm('POST', '/ann', { title: '维护通知', body: '今晚 2 点维护', level: '乱填', days: 0 }); j = await r.json();
ok('[公告] 级别乱填当普通，0 天 = 一直显示', j.ann.level === 'normal' && j.ann.exp === 0);
const a2 = j.ann.id;
r = await api('GET', '/api/notices'); j = await r.json();
ok('[公告] 公开列表：新的在前，有标题、正文、级别、时间', j.list.length === 2 && j.list[0].id === a2 && j.list[1].title === '4.0 发布了' && j.list[1].body === '新加了「通知」' && j.list[1].level === 'important' && j.list[1].at > 0);
ok('[公告] 公开列表不带多余字段', Object.keys(j.list[0]).sort().join() === 'at,body,exp,id,level,title,upd');
T += 1000;
r = await adm('POST', '/ann/' + a1, { title: '4.0 发布了（更新）', body: '改了', level: 'important', days: 1 }); j = await r.json();
ok('[公告] 修改：标题、正文、过期时间都变，发布时间不变', j.ok && j.ann.title === '4.0 发布了（更新）' && j.ann.upd === T && j.ann.at < T && j.ann.exp === T + DAY);
ok('[公告] 改一条不存在的 → 404', (await adm('POST', '/ann/abcdefghij', { title: 'x' })).status === 404);
ok('[公告] 编号格式不对 → 不处理', (await adm('POST', '/ann/../x', { title: 'x' })).status >= 400);
T += 2 * DAY;
j = await (await api('GET', '/api/notices')).json();
ok('[公告] 过期的公开列表里不再显示', j.list.length === 1 && j.list[0].id === a2);
const has2 = async (id, q) => (await (await api('GET', '/api/notices' + q)).json()).list.some((x) => x.id === id);
{ // 6.0：只发给某些路由器（托管版 / 自建版、版本范围）
	r = await adm('POST', '/ann', { body: '自建版 5.x 升级提醒', level: 'banner', ed: 's', vmin: '5.0', vmax: '5.2.3' }); j = await r.json();
	ok('[公告定向] 存下发给谁：自建版、版本 5.0 到 5.2.3、横幅', j.ok && j.ann.ed === 's' && j.ann.vmin === '5.0' && j.ann.vmax === '5.2.3' && j.ann.level === 'banner', JSON.stringify(j));
	const t1 = j.ann.id, has = async (q) => (await (await api('GET', '/api/notices' + q)).json()).list.some((x) => x.id === t1);
	ok('[公告定向] 自建版 5.1：收到', await has('?r=x&v=5.1.0&k=s'));
	ok('[公告定向] 自建版 6.0：版本不在范围里，收不到', !(await has('?r=x&v=6.0.0&k=s')));
	ok('[公告定向] 托管版 5.1：收不到', !(await has('?r=x&v=5.1.0&k=h')));
	// 用户 11/28：选「1.0 到 5.3.1」时 5.3.0 以前的老路由器（不带版本）一台都没收到——改成：范围包括 5.3.0 以前的版本就给
	ok('[公告定向] 老版本不带版本和类型（5.3.0 以前）：范围是 5.0 到 5.2.3，收到', await has('?r=x'));
	ok('[公告定向] 5.2.3 正好在范围里（含两头）', await has('?r=x&v=5.2.3&k=s'));
	ok('[公告定向] 版本写错不收', /版本写成/.test((await (await adm('POST', '/ann', { title: 'x', vmin: '六点零' })).json()).error));
	ok('[公告定向] 范围前大后小不收', /前面的要比后面的小/.test((await (await adm('POST', '/ann', { title: 'x', vmin: '6.0', vmax: '5.0' })).json()).error));
	r = await adm('POST', '/ann/' + t1, { title: '改成都发', level: 'normal' }); j = await r.json();
	ok('[公告定向] 改成都发：去掉发给谁', j.ok && !j.ann.ed && !j.ann.vmin && !j.ann.vmax && await has('?r=x&v=6.0.0&k=h'));
	await adm('DELETE', '/ann/' + t1);
	// 用户 11/28：版本能细到修复补丁（6.0.0.3 = 6.0.0 V3），路由器带 h=补丁编号；写到第三段时这个版本的补丁都算
	r = await adm('POST', '/ann', { title: '补丁 V3 到 6.0.1 的', vmin: '6.0.0.3', vmax: '6.0.1' }); j = await r.json();
	const t2 = j.ann && j.ann.id;
	ok('[公告定向·补丁] 存下 6.0.0 V3 到 6.0.1', j.ok && j.ann.vmin === '6.0.0.3' && j.ann.vmax === '6.0.1', JSON.stringify(j));
	ok('[公告定向·补丁] 6.0.0 V2：收不到；V3、V7：收到', !(await has2(t2, '?r=x&v=6.0.0&h=2&k=h')) && await has2(t2, '?r=x&v=6.0.0&h=3&k=h') && await has2(t2, '?r=x&v=6.0.0&h=7&k=h'));
	ok('[公告定向·补丁] 6.0.1 带补丁 V5：也算 6.0.1（范围写到第三段）；6.0.2 收不到；没带补丁号的 6.0.0 当成 V0 收不到', await has2(t2, '?r=x&v=6.0.1&h=5&k=h') && !(await has2(t2, '?r=x&v=6.0.2&k=h')) && !(await has2(t2, '?r=x&v=6.0.0&k=h')));
	await adm('DELETE', '/ann/' + t2);
	for (const [lo, hi, want, why] of [['1.0', '5.3.1', true, '1.0 到 5.3.1'], ['', '5.2.3', true, '5.2.3 及以下'], ['5.3.0', '', false, '5.3.0 及以上'], ['6.0.0', '6.0.1', false, '6.0.0 到 6.0.1']]) {
		const id = (await (await adm('POST', '/ann', { title: '老版本 ' + why, vmin: lo, vmax: hi })).json()).ann.id;
		ok('[公告定向·老版本] 不带版本的老路由器：' + why + (want ? ' 收到' : ' 收不到'), (await has2(id, '?r=x')) === want);
		await adm('DELETE', '/ann/' + id);
	}
	{ const r1 = await api('GET', '/api/notices?r=y&v=6.0.0&h=7&k=h'); ok('[公告·补丁号] 带 h 也照样返回（补丁号查法不受版本写法影响）', r1.status === 200); }
}
{ // 用户 11/27：同时只能有一条横幅
	// 横幅只有内容、没有标题（用户 11/27）：标题用内容第一行；没内容不收
	ok('[横幅] 没写内容不收', /横幅内容不能是空的/.test((await (await adm('POST', '/ann', { title: '只有标题', level: 'banner' })).json()).error));
	{ const x = (await (await adm('POST', '/ann', { title: '不用这个', body: '\n  今晚维护  \n面板照常能用', level: 'banner', days: 1 })).json()).ann; ok('[横幅] 标题用内容第一行，填了标题也不用', x && x.title === '今晚维护' && x.body === '今晚维护  \n面板照常能用', JSON.stringify(x)); await adm('DELETE', '/ann/' + x.id); }
	const b1 = (await (await adm('POST', '/ann', { body: '横幅一', level: 'banner' })).json()).ann.id;
	j = await (await adm('POST', '/ann', { body: '横幅二', level: 'banner' })).json();
	const L = (await (await adm('GET', '/ann')).json()).list, x1 = L.find((x) => x.id === b1);
	ok('[横幅] 发第二条横幅：第一条改成普通公告（还在通知里）', j.ok && j.replaced && j.replaced[0] === '横幅一' && x1.level === 'normal' && L.filter((x) => x.level === 'banner').length === 1, JSON.stringify(j.replaced));
	const b2 = j.ann.id;
	j = await (await adm('POST', '/ann', { body: '横幅三', level: 'banner', start: T + 2 * 3600e3 })).json();
	const x2 = (await (await adm('GET', '/ann')).json()).list.find((x) => x.id === b2);
	ok('[横幅] 定时发的新横幅：旧的显示到新的开始那一刻', j.ok && x2.level === 'banner' && x2.exp === T + 2 * 3600e3, JSON.stringify(x2));
	j = await (await adm('POST', '/ann', { title: '普通', level: 'normal' })).json();
	ok('[横幅] 发普通公告不影响横幅', j.ok && !j.replaced);
	for (const id of [b1, b2, j.ann.id, (await (await adm('GET', '/ann')).json()).list.find((x) => x.title === '横幅三').id]) await adm('DELETE', '/ann/' + id);
}
j = await (await adm('GET', '/ann')).json();
ok('[公告] 管理页仍能看到过期的', j.list.length === 2);
ok('[公告] 删除', (await (await adm('DELETE', '/ann/' + a2)).json()).ok === true);
ok('[公告] 再删一次 → 404', (await adm('DELETE', '/ann/' + a2)).status === 404);
j = await (await api('GET', '/api/notices')).json();
ok('[公告] 删了就看不到了', j.list.length === 0);
const log = (await env.H.get('hub').ctx.storage.get('alog')) || [];
ok('[公告] 新建、修改、删除都记操作日志', ['ann_new', 'ann_edit', 'ann_del'].every((o) => JSON.stringify(log).includes(o)), JSON.stringify(log).slice(0, 300));
for (let i = 0; i < 55; i++) await adm('POST', '/ann', { title: '第' + i + '条' });
j = await (await adm('GET', '/ann')).json();
ok('[公告] 最多留 50 条', j.list.length === 50 && j.list[0].title === '第54条');
j = await (await api('GET', '/api/notices')).json();
ok('[公告] 公开最多给 20 条', j.list.length === 20);
r = await adm('POST', '/ann', { title: 'x'.repeat(300), body: 'y'.repeat(5000), days: 9999 }); j = await r.json();
ok('[公告] 标题、正文、天数都有上限', j.ann.title.length === 80 && j.ann.body.length === 2000 && j.ann.exp === T + 365 * DAY);

/* ---------- 云端通知记录 ---------- */
const w = new mod.Watch({ storage: memStorage() }, env);
await w.push({ title: '⚠️ 路由器断电或死机', body: '平板还在报告', tag: 'cloud', lvl: 'err' });
await w.push({ title: '路由器发的', body: 'x', nolog: true });
let nl = await w.ctx.storage.get('nlog');
ok('[记录] 没订阅也记下云端通知', nl.length === 1 && nl[0].title === '⚠️ 路由器断电或死机' && nl[0].lvl === 'err' && nl[0].t === T);
ok('[记录] 标了 nolog 的不记（路由器自己已经记了）', !nl.some((x) => x.title === '路由器发的'));
for (let i = 0; i < 120; i++) await w.push({ title: 'n' + i, body: 'b'.repeat(900) });
nl = await w.ctx.storage.get('nlog');
ok('[记录] 最多留 100 条、新的在前、正文截到 500 字', nl.length === 100 && nl[0].title === 'n119' && nl[0].body.length === 500);
const st = await w.status();
ok('[记录] 状态里带最近 50 条通知', Array.isArray(st.notes) && st.notes.length === 50 && st.notes[0].title === 'n119');
// 路由器经 /n/ 发来的：推送照常、但不进云端记录
const env1 = { RKEY: 'rk', TKEY: 'tk', PANEL_TOKEN: 'pt', VAPID_PUB: '', VAPID_PRIV: '', PROBE_URL: 'https://x/p' };
const W2 = new mod.Watch({ storage: memStorage() }, env1);
env1.W = { idFromName: () => 'id', get: () => W2 };
const call1 = (m, path, body) => mod.default.fetch(new Request('https://router.example' + path, { method: m, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), env1);
r = await call1('POST', '/cloud/n/rk', { lvl: 'err', kind: 'dns', title: 'DNS 解析失败', body: '…' });
ok('[记录] 路由器通知接口照常工作', r.status === 200, String(r.status));
ok('[记录] 路由器通知不在云端重复记', !(await W2.ctx.storage.get('nlog')));
r = await call1('POST', '/cloud/push', { token: 'pt', op: 'test' });
ok('[记录] 测试通知不记', !(await W2.ctx.storage.get('nlog')));
await W2.push({ title: '✅ 托管服务已续期', lvl: 'ok', tag: 'svc' });
ok('[记录] 托管服务发的（续期、到期、停用）照常记', (await W2.ctx.storage.get('nlog')).length === 1);
// 断电 → 恢复：断线记录里有，通知记录里不重复
await call1('POST', '/cloud/beat/r/rk', { wan: 'ok', net: 'ok', dns: 'ok', tun: 'ok', panel: 'ok', clash: 'ok', ready: 4 });
await W2.alarm();
const st0 = await W2.ctx.storage.get('r'); st0.last = Date.now() - 320e3; await W2.ctx.storage.put('r', st0);
globalThis.fetch = async () => new Response('', { status: 530 });
await W2.alarm(); await W2.alarm();
const s2 = await W2.status();
ok('[记录] 断电/断网在断线记录（events）里有', (s2.events || []).some((e) => e.lvl === 'err'), JSON.stringify(s2).slice(0, 400));
ok('[记录] 断电/断网不在通知记录里重复', (await W2.ctx.storage.get('nlog')).length === 1);

console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (!c && note ? '（' + note + '）' : '')).join('\n'));
const pass = results.filter((r) => r[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

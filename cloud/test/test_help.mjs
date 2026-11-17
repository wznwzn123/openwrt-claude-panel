// 官网「服务状态」(/status) 和「常见问题」(/help)：公开接口、后台增删改、搜不到的词、每小时检查
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
let ghOk = true;
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url);
	if (u.hostname === 'github.com') return new Response(ghOk ? 'sums' : 'no', { status: ghOk ? 200 : 503 });
	if (u.hostname === 'api.cloudflare.com') return new Response(JSON.stringify({ success: true, result: { id: 'x', token: 't' }, errors: [] }));
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: 'p', VAPID_PRIV: 'q', RESEND_API_KEY: 're_test' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const hub = () => env.H.get('hub');
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const req = async (path, { body, headers = {}, method, ip } = {}) => {
	const h = { 'content-type': 'application/json', origin: 'https://panel.example', 'cf-connecting-ip': ip || '10.9.9.9', ...headers };
	const r = await mod.default.fetch(new Request('https://panel.example' + path, { method: method || (body === undefined ? 'GET' : 'POST'), headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
	let j = null; try { j = await r.clone().json(); } catch (e) {}
	return { st: r.status, j, r };
};

/* ---------- 页面 ---------- */
for (const p of ['/status', '/help']) {
	const r = await req(p); const html = await r.r.text();
	ok('[页面] ' + p + ' 能打开', r.st === 200 && /text\/html/.test(r.r.headers.get('content-type') || '') && html.length > 2000, r.st);
}

/* ---------- 常见问题：公开 ---------- */
{
	const r = await req('/api/help');
	ok('[常见问题] 没改过时用默认内容（34 条，7 类）', r.st === 200 && r.j.items.length === 34 && r.j.cats.length === 7, r.j && r.j.items.length);
	ok('[常见问题] 每条都有编号、分类、问题、回答', r.j.items.every((x) => x.id && x.cat && x.q && x.a && r.j.cats.some((c) => c.k === x.cat)));
	ok('[常见问题] 编号不重复', new Set(r.j.items.map((x) => x.id)).size === r.j.items.length);
	ok('[常见问题] 浏览器缓存 60 秒', /max-age=60/.test(r.r.headers.get('cache-control') || ''));
	ok('[常见问题] 回答里的链接只用站内地址或 https', r.j.items.every((x) => [...x.a.matchAll(/\]\(([^)]*)\)/g)].every((m) => /^(\/|https:\/\/)/.test(m[1]))));
}

/* ---------- 常见问题：后台 ---------- */
{
	ok('[后台] 没有管理员密钥：读不到、改不了', (await req('/api/admin/faq')).st === 401 && (await req('/api/admin/faq', { body: { q: 'x', a: 'y' } })).st === 401);
	const g = await req('/api/admin/faq', { headers: ADM });
	ok('[后台] 读到默认内容，并标着「默认」', g.st === 200 && g.j.dflt === true && g.j.items.length === 34);
	const bad = await req('/api/admin/faq', { body: { q: '', a: 'x' }, headers: ADM });
	ok('[后台] 问题或回答空着：不让存', bad.st === 400);
	const add = await req('/api/admin/faq', { body: { q: '支持 IPv6 吗？', a: '支持。', cat: 'install', kw: 'ipv6' }, headers: ADM });
	ok('[后台] 加一条', add.st === 200 && add.j.item.id, JSON.stringify(add.j));
	const id = add.j.item.id;
	let pub = (await req('/api/help')).j;
	ok('[后台] 加完官网上就有（35 条），排在「安装」的最后', pub.items.length === 35 && pub.items.filter((x) => x.cat === 'install').slice(-1)[0].id === id);
	await req('/api/admin/faq/' + id + '/move', { body: { dir: 'up' }, headers: ADM });
	pub = (await req('/api/help')).j; const ins = pub.items.filter((x) => x.cat === 'install');
	ok('[后台] 往前挪一位（只在同一类里挪）', ins[ins.length - 2].id === id);
	const first = ins[0].id; await req('/api/admin/faq/' + first + '/move', { body: { dir: 'up' }, headers: ADM });
	ok('[后台] 第一条再往前挪：不动', (await req('/api/help')).j.items.filter((x) => x.cat === 'install')[0].id === first);
	const ed = await req('/api/admin/faq/' + id, { body: { q: '支持 IPv6 吗？', a: '支持，**托管版**也支持。', cat: 'proxy', kw: 'ipv6 v6' }, headers: ADM });
	pub = (await req('/api/help')).j;
	ok('[后台] 修改：回答和分类都变了', ed.st === 200 && pub.items.find((x) => x.id === id).cat === 'proxy' && /托管版/.test(pub.items.find((x) => x.id === id).a));
	ok('[后台] 改不存在的：说没有', (await req('/api/admin/faq/nope123', { body: { q: 'a', a: 'b' }, headers: ADM })).st === 404);
	const big = await req('/api/admin/faq', { body: { q: 'x'.repeat(500), a: 'y'.repeat(9000), cat: 'bogus', kw: 'k'.repeat(900) }, headers: ADM });
	ok('[后台] 太长的截短、乱写的分类归到第一类', big.st === 200 && big.j.item.q.length <= 120 && big.j.item.a.length <= 4000 && big.j.item.kw.length <= 300 && big.j.item.cat === 'install');
	const d = await req('/api/admin/faq/' + big.j.item.id, { method: 'DELETE', headers: ADM });
	ok('[后台] 删除', d.st === 200 && !(await req('/api/help')).j.items.some((x) => x.id === big.j.item.id));
	ok('[后台] 删不存在的：说没有', (await req('/api/admin/faq/nope123', { method: 'DELETE', headers: ADM })).st === 404);
	const log = (await req('/api/admin/log', { headers: ADM })).j.list.map((x) => x.op);
	ok('[后台] 操作记录里有：加、改、删', ['faq_new', 'faq_edit', 'faq_del'].every((k) => log.includes(k)), log.slice(0, 8).join(','));
	await req('/api/admin/faq/reset', { body: {}, headers: ADM });
	const af = (await req('/api/admin/faq', { headers: ADM })).j;
	ok('[后台] 恢复默认：回到 34 条，自己加的没了', af.dflt === true && af.items.length === 34 && !af.items.some((x) => x.id === id));
}

/* ---------- 搜不到的词 ---------- */
{
	const miss = (q, ip) => req('/api/help/miss', { body: { q }, ip });
	await miss('投屏', '1.1.1.1'); await miss('投屏', '1.1.1.2'); await miss('  IPV6  ', '1.1.1.3');
	await miss('a@b.com', '1.1.1.4'); await miss('13800138000', '1.1.1.4'); await miss('https://x.y', '1.1.1.4'); await miss('abcdefghijklmnopqrstuvwxyz0123', '1.1.1.4'); await miss('a', '1.1.1.4');
	const l = (await req('/api/admin/faqmiss', { headers: ADM })).j.list;
	ok('[搜不到] 记下词和次数，按次数排', l[0].q === '投屏' && l[0].n === 2 && l.some((x) => x.q === 'ipv6'), JSON.stringify(l));
	ok('[搜不到] 像邮箱、电话、网址、长编号、单个字的不记', l.length === 2, l.map((x) => x.q).join(','));
	ok('[搜不到] 不记是谁搜的（没有 IP、没有账号）', !JSON.stringify(l).includes('1.1.1.') && l.every((x) => Object.keys(x).sort().join() === 'first,last,n,q'));
	for (let i = 0; i < 35; i++) await miss('词' + i, '2.2.2.2');
	const l2 = (await req('/api/admin/faqmiss', { headers: ADM })).j.list;
	ok('[搜不到] 同一个地方一天最多记 30 个（防刷）', l2.filter((x) => /^词/.test(x.q)).length === 30, l2.length);
	ok('[搜不到] 外人读不到', (await req('/api/admin/faqmiss')).st === 401);
	await req('/api/admin/faqmiss/del', { body: { q: '投屏' }, headers: ADM });
	ok('[搜不到] 忽略一个', !(await req('/api/admin/faqmiss', { headers: ADM })).j.list.some((x) => x.q === '投屏'));
	await req('/api/admin/faqmiss/del', { body: { q: '*' }, headers: ADM });
	ok('[搜不到] 全部清掉', (await req('/api/admin/faqmiss', { headers: ADM })).j.list.length === 0);
}

/* ---------- 服务状态 ---------- */
{
	const s0 = (await req('/api/status')).j;
	ok('[状态] 还没检查过：有 90 天的格子，没有服务', s0.ok && s0.days.length === 90 && s0.at === 0, JSON.stringify(s0).slice(0, 200));
	await hub().statusTick();
	const s1 = (await req('/api/status')).j;
	const k = (c) => s1.comps.find((x) => x.k === c);
	ok('[状态] 检查一次以后：官网、推送、邮件、下载都正常', k('web').now === 'ok' && k('push').now === 'ok' && k('mail').now === 'ok' && k('dl').now === 'ok', JSON.stringify(s1.comps));
	ok('[状态] 没配文件存储：不显示「发文件」', !k('files'));
	ok('[状态] 浏览器缓存 60 秒', /max-age=60/.test((await req('/api/status')).r.headers.get('cache-control') || ''));
	ghOk = false;
	const chk = await req('/api/admin/status/check', { body: {}, headers: ADM });
	ok('[状态] 后台「马上检查一次」：GitHub 拿不到时「安装和更新」是故障', chk.st === 200 && chk.j.comps.find((x) => x.k === 'dl').now === 'down', JSON.stringify(chk.j.comps));
	ghOk = true;
	ok('[状态] 外人不能手动检查', (await req('/api/admin/status/check', { body: {} })).st === 401);
	// 隔一天的记录
	await hub().statusTick(Date.now() - 86400e3);
	const s2 = (await req('/api/status')).j;
	ok('[状态] 按天汇总：最后两个格子有记录', s2.days.slice(-2).every((d) => d.web), JSON.stringify(s2.days.slice(-2)));
	ok('[状态] 当天有一小时故障：那天显示「部分有问题」', s2.days[s2.days.length - 1].dl === 'part', JSON.stringify(s2.days.slice(-1)));
	// 92 天前的记录会被清掉
	await hub().ctx.storage.put('svc:2000-01-01', { 1: { t: 1, web: 'ok' } });
	await hub().statusTick();
	ok('[状态] 太早的记录自动清掉', !(await hub().ctx.storage.get('svc:2000-01-01')));
	// 每小时的定时任务也会检查
	await hub().ctx.storage.delete('svc:' + new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10));
	await mod.default.scheduled({ cron: '17 * * * *' }, env, { waitUntil() {} });
	ok('[状态] 每小时的定时任务会检查一次', (await req('/api/status')).j.days.slice(-1)[0].web === 'ok');
	// 不能碰到访问统计（访问统计也是按天存的）
	await hub().track('pv', { page: 'home', ip: '9.9.9.9' }); await hub().track('pv', { page: 'home', ip: '9.9.9.8' });
	await hub().statusTick();
	const vd = (await hub().statDays(1))[0];
	ok('[状态] 检查不会动到访问统计', vd.pv.home === 2 && vd.uv === 2 && !Object.keys(vd).some((x) => /^\d+$/.test(x)), JSON.stringify(vd));
	const sv = (await req('/api/status')).j;
	ok('[状态] 访问统计也不会被当成检查记录', sv.at > 0 && sv.comps.every((c) => c.now), JSON.stringify(sv.comps));
}

/* ---------- 故障说明 ---------- */
{
	ok('[故障] 外人不能发', (await req('/api/admin/incidents', { body: { title: 'x' } })).st === 401);
	ok('[故障] 没写标题：不让发', (await req('/api/admin/incidents', { body: { title: '' }, headers: ADM })).st === 400);
	const n = await req('/api/admin/incidents', { body: { title: '部分专属网址打不开', level: 'part', comps: ['tunnel', 'bogus'], text: '收到反馈，正在查原因。' }, headers: ADM });
	ok('[故障] 发布', n.st === 200 && n.j.inc.id && n.j.inc.comps.join() === 'tunnel', JSON.stringify(n.j));
	const id = n.j.inc.id;
	let s = (await req('/api/status')).j;
	ok('[故障] 官网上能看到，在「正在处理」', s.inc.some((x) => x.id === id && !x.end));
	await req('/api/admin/incidents/' + id, { body: { text: '已经找到原因' }, headers: ADM });
	s = (await req('/api/status')).j;
	ok('[故障] 补充进展：最新的在最前面', s.inc.find((x) => x.id === id).ups[0].text === '已经找到原因');
	await req('/api/admin/incidents/' + id, { body: { resolve: true }, headers: ADM });
	s = (await req('/api/status')).j; const x = s.inc.find((i) => i.id === id);
	ok('[故障] 标为已恢复：有结束时间，没写说明时写「已恢复」', x.end > 0 && x.ups[0].text === '已恢复' && x.ups[0].done === true);
	ok('[故障] 补充不存在的：说没有', (await req('/api/admin/incidents/nope', { body: { text: 'x' }, headers: ADM })).st === 404);
	const log = (await req('/api/admin/log', { headers: ADM })).j.list.map((y) => y.op);
	ok('[故障] 操作记录里有：发布、补充、恢复', ['inc_new', 'inc_update', 'inc_resolve'].every((k) => log.includes(k)));
	const d = await req('/api/admin/incidents/' + id, { method: 'DELETE', headers: ADM });
	ok('[故障] 删除', d.st === 200 && !(await req('/api/status')).j.inc.some((i) => i.id === id));
	const big = await req('/api/admin/incidents', { body: { title: '标'.repeat(300), text: '字'.repeat(5000) }, headers: ADM });
	ok('[故障] 太长的截短', big.j.inc.title.length <= 80 && big.j.inc.ups[0].text.length <= 1000);
}

console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 300) + '）')).join('\n'));
const pass = results.filter((x) => x[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

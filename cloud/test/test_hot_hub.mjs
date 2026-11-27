// 热补丁（官网这边）：/api/router/hot?v= 找这个版本最新的 hot-版本-编号；/dl/h/标签/文件 只转发补丁的三个文件
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const GH = []; let limited = false;
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url; GH.push(url);
	if (url.includes('api.github.com') && limited) return new Response('rate limited', { status: 403 });
	if (url.includes('api.github.com') && url.includes('/releases?')) return new Response(JSON.stringify([
		{ tag_name: 'v6.0.0', body: '正式版' }, { tag_name: 'hot-6.0.0-1', body: '修了订阅页\n细节' }, { tag_name: 'hot-6.0.0-3', body: '加了横幅公告\n…' },
		{ tag_name: 'hot-6.0.0-4', body: '草稿', draft: true }, { tag_name: 'hot-5.2.3-9', body: '老版本的' }]));
	if (url.includes('/releases/download/hot-6.0.0-3/hot.tar.gz')) return new Response('TGZ');
	if (init.method === 'HEAD' && /\/releases\/download\/hot-(6\.0\.0-[1-5]|6\.0\.2-1)\/SHA256SUMS\.sig2$/.test(url)) return new Response(null, { status: 302, headers: { location: 'https://objects.example/x' } });
	return new Response('nope', { status: 404 });
};
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'k'.repeat(20), VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const get = async (p) => { const r = await mod.default.fetch(new Request('https://panel.example' + p), env); return { st: r.status, t: await r.text() }; };
let r = await get('/api/router/hot?v=6.0.0'), j = JSON.parse(r.t);
ok('6.0.0 最新的补丁是第 3 个（草稿不算、别的版本不算），说明取第一行；顺着试到第 5 个', j.ok && j.n === 5 && j.tag === 'hot-6.0.0-5', r.t);
j = JSON.parse((await get('/api/router/hot?v=6.0.1')).t);
ok('没有补丁的版本：n = 0', j.ok && j.n === 0);
ok('版本号不对：拒绝', (await get('/api/router/hot?v=../x')).st === 400);
// 用户 11/27：紧急补丁不用等 6 小时——路由器每 30 分钟问公告时，官网顺便说这个版本最新的热补丁是第几个
j = JSON.parse((await get('/api/notices?v=6.0.0&k=h')).t);
ok('公告接口顺便带上这个版本最新的热补丁编号', j.ok && j.hot === 5, JSON.stringify(j));
j = JSON.parse((await get('/api/notices?v=5.3.1&k=h')).t);
ok('没有补丁的版本：hot = 0', j.ok && j.hot === 0, JSON.stringify(j));
j = JSON.parse((await get('/api/notices')).t);
ok('老版本不带版本号：不带 hot', j.ok && !('hot' in j), JSON.stringify(j));
r = await get('/dl/h/hot-6.0.0-3/hot.tar.gz');
ok('下载中转：补丁文件', r.st === 200 && r.t === 'TGZ');
ok('只转发补丁的三个文件', (await get('/dl/h/hot-6.0.0-3/install.sh')).st === 404 && (await get('/dl/h/v6.0.0/hot.tar.gz')).st === 404);
// 用户 11/27：刚发的补丁，列表还在缓存里（10 分钟）——顺着编号试下一个的下载地址，马上能查到
{
	const j4 = JSON.parse((await get('/api/router/hot?v=6.0.0')).t);
	ok('列表里最新是第 3 个，但第 4、5 个已经能下载：马上查到第 5 个', j4.ok && j4.n === 5 && j4.tag === 'hot-6.0.0-5', JSON.stringify(j4));
	const j5 = JSON.parse((await get('/api/router/hot?v=6.0.1')).t);
	ok('没有补丁的版本：试一下第 1 个没有，还是 0', j5.ok && j5.n === 0, JSON.stringify(j5));
}
// 11/27 线上：GitHub 接口被限流（403）时官网返回 502，路由器一直装不上补丁
limited = true; GH.length = 0;
j = JSON.parse((await get('/api/router/hot?v=6.0.0')).t);
ok('GitHub 接口限流：用上次存的列表，再顺着编号试下载地址，找到第 5 个', j.ok && j.n === 5 && j.tag === 'hot-6.0.0-5', JSON.stringify(j));
ok('限流时只从第 4 个往后试（存过的不再试）', !GH.some((u) => u.includes('hot-6.0.0-3/SHA256SUMS.sig2')) && GH.some((u) => u.includes('hot-6.0.0-6/')), GH.join(' '));
j = JSON.parse((await get('/api/router/hot?v=6.0.2')).t);
ok('限流时存的列表里没有的版本：也能试出来', j.ok && j.n === 1 && j.tag === 'hot-6.0.2-1', JSON.stringify(j));
j = JSON.parse((await get('/api/router/hot?v=6.0.1')).t);
ok('限流时没有补丁的版本：n = 0', j.ok && j.n === 0, JSON.stringify(j));
j = JSON.parse((await get('/api/notices?v=6.0.0&k=h')).t);
ok('限流时公告接口也带对补丁编号', j.ok && j.hot === 5, JSON.stringify(j));
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

// 热补丁（官网这边）：/api/router/hot?v= 找这个版本最新的 hot-版本-编号；/dl/h/标签/文件 只转发补丁的三个文件
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const GH = [];
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url; GH.push(url);
	if (url.includes('api.github.com') && url.includes('/releases?')) return new Response(JSON.stringify([
		{ tag_name: 'v6.0.0', body: '正式版' }, { tag_name: 'hot-6.0.0-1', body: '修了订阅页\n细节' }, { tag_name: 'hot-6.0.0-3', body: '加了横幅公告\n…' },
		{ tag_name: 'hot-6.0.0-4', body: '草稿', draft: true }, { tag_name: 'hot-5.2.3-9', body: '老版本的' }]));
	if (url.includes('/releases/download/hot-6.0.0-3/hot.tar.gz')) return new Response('TGZ');
	return new Response('nope', { status: 404 });
};
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'k'.repeat(20), VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const get = async (p) => { const r = await mod.default.fetch(new Request('https://panel.example' + p), env); return { st: r.status, t: await r.text() }; };
let r = await get('/api/router/hot?v=6.0.0'), j = JSON.parse(r.t);
ok('6.0.0 最新的补丁是第 3 个（草稿不算、别的版本不算），说明取第一行', j.ok && j.n === 3 && j.tag === 'hot-6.0.0-3' && j.notes === '加了横幅公告', r.t);
j = JSON.parse((await get('/api/router/hot?v=6.0.1')).t);
ok('没有补丁的版本：n = 0', j.ok && j.n === 0);
ok('版本号不对：拒绝', (await get('/api/router/hot?v=../x')).st === 400);
// 用户 11/27：紧急补丁不用等 6 小时——路由器每 30 分钟问公告时，官网顺便说这个版本最新的热补丁是第几个
j = JSON.parse((await get('/api/notices?v=6.0.0&k=h')).t);
ok('公告接口顺便带上这个版本最新的热补丁编号', j.ok && j.hot === 3, JSON.stringify(j));
j = JSON.parse((await get('/api/notices?v=5.3.1&k=h')).t);
ok('没有补丁的版本：hot = 0', j.ok && j.hot === 0, JSON.stringify(j));
j = JSON.parse((await get('/api/notices')).t);
ok('老版本不带版本号：不带 hot', j.ok && !('hot' in j), JSON.stringify(j));
r = await get('/dl/h/hot-6.0.0-3/hot.tar.gz');
ok('下载中转：补丁文件', r.st === 200 && r.t === 'TGZ');
ok('只转发补丁的三个文件', (await get('/dl/h/hot-6.0.0-3/install.sh')).st === 404 && (await get('/dl/h/v6.0.0/hot.tar.gz')).st === 404);
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

// 安卓 App 的检查更新和安装包下载（从 GitHub Release 转过来）
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
let rel = null, gh = 0; const dl = [];
globalThis.fetch = async (input) => {
	const url = typeof input === 'string' ? input : input.url;
	if (url.includes('api.github.com/repos/wznwzn123/openwrt-claude-panel/releases/latest')) { gh++; return rel ? new Response(JSON.stringify(rel)) : new Response('{}', { status: 404 }); }
	if (url.startsWith('https://github.com/wznwzn123/openwrt-claude-panel/releases/latest/download/openwrt-claude-panel-') || url.endsWith('/latest/download/SHA256SUMS')) { dl.push(url); return rel ? new Response(new Uint8Array([31, 139, 8, 0]), { status: 200 }) : new Response('nf', { status: 404 }); }
	if (url === 'https://github.com/wznwzn123/openwrt-claude-panel/releases/latest/download/router-panel.apk') return rel ? new Response(new Uint8Array([80, 75, 3, 4, 1, 2]), { status: 200 }) : new Response('nf', { status: 404 });
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'panel.example', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const get = (p) => mod.default.fetch(new Request('https://panel.example' + p), env);
let r = await get('/api/app/version');
ok('还没发布 App：返回 404，带跨域头（App 首页能读）', r.status === 404 && r.headers.get('access-control-allow-origin') === '*');
ok('还没发布：下载也是 404', (await get('/app/router-panel.apk')).status === 404);
rel = { tag_name: 'v1.2.0', published_at: '2026-11-01T00:00:00Z', body: 'OpenWrt 路由器的手机控制面板。\n\n## 这个版本的更新\n\n- 新增安卓 App\n- 修复了一些问题\n\n## 下载哪个？\n表格', assets: [{ name: 'router-panel.apk' }, { name: 'x.tar.gz' }] };
r = await get('/api/app/version');
const j = await r.json();
ok('发布后：返回版本号（去掉 v）', r.status === 200 && j.version === '1.2.0', JSON.stringify(j));
ok('更新说明只取「这个版本的更新」那一节', j.notes === '- 新增安卓 App\n- 修复了一些问题', JSON.stringify(j.notes));
ok('安装包地址走自己的域名', j.apk === '/app/router-panel.apk');
ok('普通版本：不强制更新', j.force === false && j.min === '');
r = await get('/app/router-panel.apk');
const b = new Uint8Array(await r.arrayBuffer());
ok('下载安装包：内容原样转过来，类型是安卓安装包', r.status === 200 && b[0] === 80 && b[1] === 75 && r.headers.get('content-type') === 'application/vnd.android.package-archive' && /router-panel\.apk/.test(r.headers.get('content-disposition')));
rel.assets = [{ name: 'x.tar.gz' }];
ok('最新发布里没有 App 安装包：当作没发布', (await get('/api/app/version')).status === 404);
// 强制更新：发布说明里写【必须更新】，或者写「最低版本：x.y.z」
rel = { tag_name: 'v1.2.1', body: '## 这个版本的更新\n\n- 修复安全问题【必须更新】\n\n## 其他\n最低版本：1.2.0', assets: [{ name: 'router-panel.apk' }] };
let k = await (await get('/api/app/version')).json();
ok('发布说明写了【必须更新】：force=true', k.force === true, JSON.stringify(k));
ok('写了「最低版本：1.2.0」：min=1.2.0', k.min === '1.2.0', JSON.stringify(k));
rel.body = '## 这个版本的更新\n\n- 小修复\n\n最低版本: v1.1';
k = await (await get('/api/app/version')).json();
ok('「最低版本」半角冒号、带 v、两段也认', k.force === false && k.min === '1.1', JSON.stringify(k));
// 安装包也能从官网下载（转发 GitHub 最新发布）
for (const n of ['openwrt-claude-panel-hosted-ai.tar.gz', 'openwrt-claude-panel-hosted-noai.tar.gz', 'openwrt-claude-panel-noai-lite.tar.gz', 'openwrt-claude-panel-ai-full.tar.gz', 'SHA256SUMS']) {
	const x = await get('/dl/' + n); const bb = new Uint8Array(await x.arrayBuffer());
	ok('官网下载安装包：' + n, x.status === 200 && (n === 'SHA256SUMS' || (bb[0] === 31 && bb[1] === 139 && x.headers.get('content-type') === 'application/gzip')) && dl.some((u) => u.endsWith('/' + n)));
}
for (const bad of ['../etc/passwd', 'router-panel.apk', 'openwrt-claude-panel-hosted-x.tar.gz', 'openwrt-claude-panel-ai-lite.tar.gz.exe', '%2e%2e%2fsecret'])
	ok('不认识的文件名不转发：' + bad, (await get('/dl/' + bad)).status === 404);
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

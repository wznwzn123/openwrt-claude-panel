// 安卓 App 的检查更新和安装包下载（从 GitHub Release 转过来）
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
let rel = null, gh = 0, apiDown = false, allDown = false; const dl = [], raw = [];
let flaky = 0;
globalThis.fetch = async (input) => {
	const url = typeof input === 'string' ? input : input.url;
	if (url.includes('api.github.com/repos/wznwzn123/openwrt-claude-panel/releases/latest')) { gh++; if (apiDown) return new Response('{"message":"API rate limit exceeded"}', { status: 403 }); return rel ? new Response(JSON.stringify(rel)) : new Response('{}', { status: 404 }); }
	if (url === 'https://github.com/wznwzn123/openwrt-claude-panel/releases/latest') { if (allDown) throw new Error('down'); return rel ? new Response('', { status: 302, headers: { location: 'https://github.com/wznwzn123/openwrt-claude-panel/releases/tag/' + rel.tag_name } }) : new Response('nf', { status: 404 }); }
	if (url.startsWith('https://raw.githubusercontent.com/wznwzn123/openwrt-claude-panel/')) { raw.push(url); return rel ? new Response(rel.body) : new Response('nf', { status: 404 }); }
	if (url.startsWith('https://github.com/wznwzn123/openwrt-claude-panel/releases/download/')) return rel && rel.assets.some((a) => url.endsWith('/' + a.name)) ? new Response(null, { status: 302, headers: { location: 'https://objects.example/x' } }) : new Response('nf', { status: 404 });
	if (url.startsWith('https://github.com/wznwzn123/openwrt-claude-panel/releases/latest/download/openwrt-claude-panel-') || url.endsWith('/latest/download/SHA256SUMS') || url.endsWith('/latest/download/SHA256SUMS.sig')) { dl.push(url); if (flaky > 0) { flaky--; return new Response('busy', { status: 502 }); } return rel ? new Response(new Uint8Array([31, 139, 8, 0]), { status: 200 }) : new Response('nf', { status: 404 }); }
	if (url === 'https://github.com/wznwzn123/openwrt-claude-panel/releases/latest/download/app-version.json') return rel && rel.appver ? new Response(typeof rel.appver === 'string' ? rel.appver : JSON.stringify(rel.appver)) : new Response('Not Found', { status: 404 });
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
ok('更新说明只取「这个版本的更新」那一节（列表符号换成 •）', j.notes === '• 新增安卓 App\n• 修复了一些问题', JSON.stringify(j.notes));
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
for (const n of ['openwrt-claude-panel-hosted-ai.tar.gz', 'openwrt-claude-panel-hosted-noai.tar.gz', 'openwrt-claude-panel-noai-lite.tar.gz', 'openwrt-claude-panel-ai-full.tar.gz', 'SHA256SUMS', 'SHA256SUMS.sig']) {
	const x = await get('/dl/' + n); const bb = new Uint8Array(await x.arrayBuffer());
	ok('官网下载安装包：' + n, x.status === 200 && (n.startsWith('SHA256SUMS') || (bb[0] === 31 && bb[1] === 139 && x.headers.get('content-type') === 'application/gzip')) && dl.some((u) => u.endsWith('/' + n)));
}
// GitHub 偶尔失败一次：官网马上再试一次，路由器拿到的照样是对的
{ let n0 = dl.length; flaky = 1; const x = await get('/dl/SHA256SUMS.sig'); ok('GitHub 偶尔失败一次：官网自己再试一次，照样下得到', x.status === 200 && dl.length - n0 === 2 && flaky === 0, x.status + ' ' + (dl.length - n0));
  n0 = dl.length; flaky = 5; const y = await get('/dl/SHA256SUMS'); ok('GitHub 一直不行：只多试一次，然后告诉路由器没拿到（路由器会改从 GitHub 直接下）', y.status === 404 && dl.length - n0 === 2, y.status + ' ' + (dl.length - n0)); flaky = 0; }
// 官网首页的截图：单独由 /img/名字-摘要.webp 发（不塞进页面里），浏览器长期缓存；乱写的名字 404
{ const home = await (await get('/')).text(), imgs = [...new Set(home.match(/\/img\/[a-z0-9_-]+-[0-9a-f]{10}\.webp/g) || [])];
  let good = imgs.length >= 7;
  for (const u of imgs) { const x = await get(u); const b = new Uint8Array(await x.arrayBuffer()); if (!(x.status === 200 && x.headers.get('content-type') === 'image/webp' && /immutable/.test(x.headers.get('cache-control')) && b[0] === 0x52 && b[8] === 0x57)) good = false; }
  ok('官网首页的截图单独发（webp、长期缓存），页面里不再塞图片内容', good && !/data:image\/webp;base64/.test(home) && home.length < 200000, imgs.length + ' 张，页面 ' + home.length + ' 字节');
  let bad404 = true; for (const u of ['/img/__proto__', '/img/toString', '/img/home.webp', '/img/home-0000000000.webp', '/img/../site.js']) if ((await get(u)).status !== 404) bad404 = false;
  ok('乱写的图片名字：404', bad404); }
for (const bad of ['../etc/passwd', 'router-panel.apk', 'openwrt-claude-panel-hosted-x.tar.gz', 'openwrt-claude-panel-ai-lite.tar.gz.exe', '%2e%2e%2fsecret'])
	ok('不认识的文件名不转发：' + bad, (await get('/dl/' + bad)).status === 404);
rel = { tag_name: 'v1.3.1', body: '## 这个版本的更新\n\n- **只用手机就能装**：见 [📱 手机教程](https://x/y.md)，运行 `cmcp-pair`', assets: [{ name: 'router-panel.apk' }] };
k = await (await get('/api/app/version')).json();
ok('更新说明去掉 Markdown 符号（App 弹窗是纯文字）', k.notes === '• 只用手机就能装：见 📱 手机教程，运行 cmcp-pair', JSON.stringify(k.notes));
// GitHub 接口被限流（Cloudflare 出口 IP 共用，每小时 60 次常被用光）：改从发布页跳转和原始文件读
rel = { tag_name: 'v1.3.2', body: '## 这个版本的更新\n\n- 修复登录码\n\n最低版本：1.3.0', assets: [{ name: 'router-panel.apk' }] };
apiDown = true;
r = await get('/api/app/version'); k = await r.json();
ok('GitHub 接口返回 403：从发布页拿到版本号、从原始文件拿到更新说明', r.status === 200 && k.version === '1.3.2' && k.notes.startsWith('• 修复登录码') && k.min === '1.3.0' && raw.some((u) => u.includes('/v1.3.2/tools/release-notes.md')), JSON.stringify(k));
rel = { tag_name: 'v1.3.3', body: '## 这个版本的更新\n\n- 只有安装包', assets: [{ name: 'x.tar.gz' }] };
ok('接口被限流、这个版本没有 App 安装包：当作没发布', (await get('/api/app/version')).status === 404);
allDown = true;
r = await get('/api/app/version'); k = await r.json();
ok('GitHub 完全连不上：用上一次查到的版本，照样有更新提示', r.status === 200 && k.version === '1.3.2', JSON.stringify(k));

/* ---------- App 自己的版本（app-version.json）：只有 App 真改了才提示 ---------- */
apiDown = false; allDown = false;
rel = { tag_name: 'v2.0.3', published_at: '2026-11-01T09:00:00Z', body: '## 这个版本的更新\n\n- 路由器那边的修复【必须更新】\n\n最低版本：2.0.0', assets: [{ name: 'router-panel.apk' }], appver: { version: '1.3.0', body: '## 这个版本的更新\n\n- App 首页间距\n\n## 下载哪个？\n表格', force: true } };
k = await (await get('/api/app/version')).json();
ok('[App 版本] 这次发布 App 没改：报 App 上次改动的版本 1.3.0，不是 2.0.3', k.version === '1.3.0', JSON.stringify(k));
ok('[App 版本] 更新说明用 App 那个版本的，不用路由器这次的', k.notes === '• App 首页间距', JSON.stringify(k.notes));
ok('[App 版本] 路由器发布说明里的【必须更新】/最低版本不影响 App', k.min === '' && !/路由器/.test(k.notes));
ok('[App 版本] App 改了的版本：必须更新', k.force === true);
rel.appver = { version: '2.1.0', body: '## 这个版本的更新\n\n- App 新功能', force: false };
k = await (await get('/api/app/version')).json();
ok('[App 版本] App 改了、发布时写了不强制：照着不强制', k.version === '2.1.0' && k.force === false, JSON.stringify(k));
rel.appver = '{"version":"<script>"}';
k = await (await get('/api/app/version')).json();
ok('[App 版本] app-version.json 内容不对：当作没有，照旧用发布的版本号', k.version === '2.0.3', JSON.stringify(k));
delete rel.appver;
k = await (await get('/api/app/version')).json();
ok('[App 版本] 老的发布没有 app-version.json：照旧用发布的版本号', k.version === '2.0.3' && k.force === true && k.min === '2.0.0', JSON.stringify(k));

/* ---------- 路由器的版本：跟 App 的版本分开 ---------- */
rel = { tag_name: 'v2.0.4', published_at: '2026-11-07T00:00:00Z', body: '## 这个版本的更新\n\n- **隧道直连**\n\n## 下载哪个？', assets: [{ name: 'router-panel.apk' }, { name: 'x.tar.gz' }], appver: { version: '1.3.0', body: '## 这个版本的更新\n\n- App 首页', force: true } };
const getUA = (p, ua) => mod.default.fetch(new Request('https://panel.example' + p, { headers: { 'user-agent': ua } }), env);
k = await (await get('/api/router/version')).json();
ok('[路由器版本] /api/router/version：报最新发布的版本 2.0.4（不是 App 的 1.3.0）', k.version === '2.0.4' && k.notes === '• 隧道直连' && k.force === false, JSON.stringify(k));
k = await (await getUA('/api/app/version', 'curl/8.6.0')).json();
ok('[路由器版本] 老路由器（curl）问 /api/app/version：回答路由器的版本 2.0.4，能看到更新', k.version === '2.0.4', JSON.stringify(k));
k = await (await getUA('/api/app/version', 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36')).json();
ok('[路由器版本] App（安卓浏览器内核）问 /api/app/version：还是 App 的版本 1.3.0', k.version === '1.3.0', JSON.stringify(k));
rel.body = '## 这个版本的更新\n\n- 安全修复【必须更新】\n\n最低版本：2.0.2';
k = await (await get('/api/router/version')).json();
ok('[路由器版本] 发布说明写了【必须更新】/最低版本：路由器版本带上', k.force === true && k.min === '2.0.2', JSON.stringify(k));
// 5.2.3 的问题：沿用上一版的「最低版本：v2.0.3【必须更新】」→ 只表示比 2.0.3 旧的必须更新，这一版（2.0.4）本身不强制
rel.body = '## 这个版本的更新\n\n- 小修复\n\n最低版本：v2.0.3【必须更新】（安全更新）';
k = await (await get('/api/router/version')).json();
ok('[路由器版本] 「最低版本：更早的版本【必须更新】」：这一版不强制，比最低版本旧的照样要更新', k.force === false && k.min === '2.0.3', JSON.stringify(k));
rel.body = '## 这个版本的更新\n\n- 小修复\n\n最低版本：v2.0.4【必须更新】';
k = await (await get('/api/router/version')).json();
ok('[路由器版本] 「最低版本：就是这一版【必须更新】」：强制', k.force === true && k.min === '2.0.4', JSON.stringify(k));
rel.body = '## 这个版本的更新\n\n- 安全修复【必须更新】\n\n最低版本：v2.0.3【必须更新】';
k = await (await get('/api/router/version')).json();
ok('[路由器版本] 别处另外写了【必须更新】：照样强制', k.force === true, JSON.stringify(k));
ok('[路由器版本] 判断函数：v 前缀、全角半角冒号都认', mod.mustUpdate('最低版本: 1.2【必须更新】', 'v1.2') === true && mod.mustUpdate('最低版本：1.1【必须更新】', '1.2') === false && mod.mustUpdate('', '1.2') === false);
allDown = true; apiDown = true;
k = await (await get('/api/router/version')).json();
ok('[路由器版本] GitHub 连不上：用上一次查到的', k.version === '2.0.4', JSON.stringify(k));
allDown = false; apiDown = false;

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

// 官网「更新日志」（/changelog）：从 GitHub 发布说明里取每个版本「这个版本的更新」；接口缓存、被限流时用上次存的；页面能打开、能筛选、能展开、开着时新版本自动出现
import fs from 'fs';
import http from 'http';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { load, memStorage } from './load.mjs';
import { parseNotes, changelogOf } from '../changelog.js';
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);

// ---------- 解析 ----------
const B521 = '简介。\n\n最低版本：v5.2.1【必须更新】（安全更新）\n\n## 这个版本的更新\n\n**安全更新（建议所有人都更新）：**\n- **一键更新会验证安装包的签名**：就算下载的中转站被人改了也装不上\n- 对话里收到的 PDF 改成下载后打开\n\n**其它：**\n- 开发者这边：[管理后台](https://x.example/a)的两步验证码只能用一次；`cmcp-update` 更稳\n\nv5.2.0 的更新：\n**家里人一起用：**\n- 这是上一个版本的，不该算进来\n\n## 下载哪个？\n| a | b |';
const p1 = parseNotes(B521);
ok('只取「这个版本的更新」：两组（安全更新、其它），上一个版本的不算', p1.groups.length === 2 && p1.groups[0].t === '安全更新（建议所有人都更新）' && p1.groups[0].items.length === 2 && p1.groups[1].t === '其它' && !JSON.stringify(p1).includes('上一个版本'), JSON.stringify(p1));
ok('保留加粗和代码标记，链接只留文字', p1.groups[0].items[0].startsWith('**一键更新会验证安装包的签名**') && p1.groups[1].items[0] === '开发者这边：管理后台的两步验证码只能用一次；`cmcp-update` 更稳');
const p2 = parseNotes('## 这个版本的更新\n\n- 第一条\n- 第二条\n\n更新后用法和以前一样，不用重新登录。\n\n**怎么升级：**v2 以后点一键更新');
ok('没有小标题的：一组；「更新后…」单独放成备注；「怎么升级」不算进来', p2.groups.length === 1 && p2.groups[0].t === '' && p2.groups[0].items.join() === '第一条,第二条' && p2.note === '更新后用法和以前一样，不用重新登录。', JSON.stringify(p2));
const p3 = parseNotes('首个版本。手机控制面板。\n\n## 下载哪个？\n\n| 版本 | 下载 | 包含 | 教程 |\n|---|---|---|---|\n| **AI 版 · 精简版** | `a.tar.gz` | 对话管理 + 面板 | [📖](x) |\n| **纯面板版** | `b.tar.gz` | 只有面板 | [📖](y) |');
ok('首个版本（没有「这个版本的更新」）：第一段说明 + 表格里每个版本包含什么', p3.groups.length === 1 && p3.groups[0].items.join('|') === '首个版本。手机控制面板。|AI 版 · 精简版：对话管理 + 面板|纯面板版：只有面板', JSON.stringify(p3));
ok('乱七八糟的输入不出错', parseNotes(null).groups.length === 0 && parseNotes('<script>alert(1)</script>').groups.every((g) => g.items.every((x) => !/<script/i.test(x))));
const rel = (tag, body, at, extra = {}) => ({ tag_name: tag, body, published_at: at, draft: false, prerelease: false, ...extra });
const L = changelogOf([
	rel('v5.2.0', '最低版本：v5.2.0【必须更新】\n## 这个版本的更新\n**家里人一起用：**\n- 加入码', '2026-11-15T19:42:12Z'),
	rel('v5.2.1', B521, '2026-11-16T04:49:28Z'),
	rel('v5.0.0', '最低版本：v4.0.0\n## 这个版本的更新\n- 更省内存', '2026-11-14T15:16:14Z'),
	rel('v9.9.9', '## 这个版本的更新\n- 草稿', '2026-11-17T00:00:00Z', { draft: true }),
	rel('v9.9.8', '## 这个版本的更新\n- 预览版', '2026-11-17T00:00:00Z', { prerelease: true }),
	rel('nightly', '## 这个版本的更新\n- 乱的标签', '2026-11-17T00:00:00Z'),
	rel('v1.0.0', '首个版本。面板。', '2026-10-31T03:32:42Z'),
]);
ok('版本从新到旧；草稿、预览版、不是版本号的标签不要', L.map((x) => x.v).join() === 'v5.2.1,v5.2.0,v5.0.0,v1.0.0', L.map((x) => x.v).join());
ok('必须更新只认「最低版本」写的就是这个版本；大版本、安全、首个版本、发布时间', L[0].must && L[0].sec && !L[0].major && L[1].must && !L[2].must && L[2].major && L[3].first && L[0].at === Date.parse('2026-11-16T04:49:28Z'));

// 热补丁（11/27 全面检查第 26 条）：hot-<版本>-<编号> 挂到那个版本的「修复补丁」，新的在前，去掉「只给 vX 的路由器」那行；版本本身是预发布时不显示
const H = changelogOf([
	rel('v6.0.0', '## 这个版本的更新\n- 分流', '2026-11-27T02:00:00Z'),
	rel('hot-6.0.0-1', '软件中心修好了\n\n只给 v6.0.0 的路由器，自动静默安装。', '2026-11-27T06:36:00Z', { prerelease: true }),
	rel('hot-6.0.0-2', '- 热补丁自检\n- AI 确认弹窗马上出来\n\n只给 v6.0.0 的路由器，自动静默安装。', '2026-11-27T07:23:00Z', { prerelease: true }),
	rel('hot-5.9.9-1', '没有这个版本', '2026-11-27T07:23:00Z', { prerelease: true }),
	rel('hot-6.0.0-x', '乱的标签', '2026-11-27T07:23:00Z', { prerelease: true }),
]);
ok('热补丁：挂到版本下面，新的在前，说明去掉「只给」那行', H.length === 1 && H[0].hot.length === 2 && H[0].hot[0].n === 2 && H[0].hot[0].items.join('|') === '热补丁自检|AI 确认弹窗马上出来' && H[0].hot[1].items.join() === '软件中心修好了', JSON.stringify(H[0].hot));
ok('热补丁：版本还是预发布（尝鲜）时不显示；没有补丁的版本不带 hot', changelogOf([rel('v6.0.0', '## 这个版本的更新\n- x', '2026-11-27T02:00:00Z', { prerelease: true }), rel('hot-6.0.0-1', 'y', '2026-11-27T06:36:00Z', { prerelease: true })]).length === 0 && !L[0].hot);

// ---------- 接口 ----------
const mod = await load();
let gh = { mode: 'ok', calls: 0 };
const REL = JSON.parse(fs.readFileSync(new URL('./fixtures/releases.json', import.meta.url), 'utf8'));
// 热补丁也在发布列表里（预发布）：不算版本数，挂在 v5.2.1 下面
const HOTREL = [rel('hot-5.2.1-1', '软件中心修好了\n\n只给 v5.2.1 的路由器，自动静默安装。', '2026-11-16T06:00:00Z', { prerelease: true }), rel('hot-5.2.1-2', '- 热补丁装完马上自检\n- AI 确认弹窗不用刷新就出来\n\n只给 v5.2.1 的路由器，自动静默安装。', '2026-11-16T08:00:00Z', { prerelease: true })];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url);
	if (u.hostname === 'localhost') return realFetch(input, init);
	if (u.hostname === 'api.github.com') { gh.calls++; if (gh.mode !== 'ok') return new Response('{"message":"API rate limit exceeded"}', { status: 403 }); if (u.pathname.endsWith('/releases')) return new Response(JSON.stringify([...REL, ...HOTREL])); return new Response(JSON.stringify(REL[0])); }
	if (u.hostname === 'github.com' && u.pathname.endsWith('/releases/latest')) return new Response(null, { status: 302, headers: { location: 'https://github.com/x/y/releases/tag/v5.3.0' } });
	if (u.hostname === 'raw.githubusercontent.com') return new Response('最低版本：v5.2.1\n## 这个版本的更新\n- 限流时补上的最新一版\n\nv5.2.1 的更新：\n- 旧的');
	if (u.hostname === 'github.com') return new Response('', { status: 404 });
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const get = async (p) => { const r = await mod.default.fetch(new Request('https://panel.example' + p), env); let j = null; try { j = await r.clone().json(); } catch (e) {} return { st: r.status, j, r }; };
let a = await get('/api/changelog');
ok('接口：GitHub 正常时，全部版本（新的在前），每个都有分组和时间', a.st === 200 && a.j.ok && a.j.list.length === REL.length && a.j.list[0].v === 'v5.2.1' && a.j.list.every((x) => x.groups.length && x.at > 0), a.st + ' ' + JSON.stringify(a.j).slice(0, 200));
ok('接口：返回的内容里没有 HTML 标签、没有 Markdown 链接', !/<[a-z]|\]\(http/i.test(JSON.stringify(a.j.list)));
gh.mode = 'limited';
a = await get('/api/changelog');
ok('接口：GitHub 接口被限流（403）：用上次存下的，再把最新一版补上', a.st === 200 && a.j.list[0].v === 'v5.3.0' && a.j.list[0].groups[0].items[0] === '限流时补上的最新一版' && a.j.list.length === REL.length + 1, JSON.stringify(a.j).slice(0, 200));
// 后台公告的版本下拉（用户 11/28 截图：线上只有「不限」）：GitHub 接口被限流时拼存下的更新日志 + 最新一版
{ const r = await mod.default.fetch(new Request('https://panel.example/api/admin/versions', { headers: { authorization: 'Bearer admin-key-1234567890' } }), env); const j = await r.json(); const vs = (j.list || []).map((x) => x.v);
  ok('后台版本列表：GitHub 接口被限流时照样有（最新一版 + 更新日志里的版本，新的在前）', r.status === 200 && vs[0] === '5.3.0' && vs.includes('5.2.1') && vs.includes('1.0.0'), JSON.stringify(j).slice(0, 300)); }
// 一次都没成功过、又被限流：只有最新一版
env.H = ns(mod.Hub);
a = await get('/api/changelog');
ok('接口：从没拿到过、又被限流：至少有最新一版', a.st === 200 && a.j.list.length === 1 && a.j.list[0].v === 'v5.3.0');
const page = await get('/changelog');
const html = await page.r.text();
ok('页面 /changelog 能打开，有标题、节奏图、筛选、时间线', page.st === 200 && /<title>更新日志 · 路由器面板<\/title>/.test(html) && /id="clPulse"/.test(html) && /id="clFilter"/.test(html) && /id="clList"/.test(html));
ok('页面：顶栏和页脚都有「更新日志」入口', (html.match(/href="\/changelog"/g) || []).length >= 2 && (await (await get('/')).r.text()).includes('href="/changelog"'));

// ---------- 页面 ----------
gh.mode = 'ok';
env.H = ns(mod.Hub);
let extra = null;
const server = http.createServer(async (req, res) => {
	if (req.url === '/api/changelog' && extra) { const base = await (await mod.default.fetch(new Request('https://panel.example/api/changelog'), env)).json(); base.list = [extra, ...base.list]; res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(base)); }
	const r = await mod.default.fetch(new Request('https://panel.example' + req.url, { method: req.method }), env);
	const h = {}; r.headers.forEach((v, k) => { h[k] = v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8147, z));
const browser = await chromium.launch();
for (const [w, h] of [[320, 640], [390, 844], [1280, 860]]) {
	const T = '［' + w + '］';
	const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 });
	const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/cloudflareinsights|Failed to load resource/.test(m.text())) errs.push(m.text()); });
	await p.goto('http://localhost:8147/changelog'); await p.waitForTimeout(2600);
	ok('页面：列出全部版本，最新的在最上面' + T, (await p.locator('.cl-rel').count()) === REL.length && (await p.locator('.cl-rel').first().getAttribute('data-v')) === 'v5.2.1');
	ok('页面：节奏图一个版本一根柱子，最新那根亮着' + T, (await p.locator('#clSvg .cl-bar').count()) === REL.length && (await p.locator('#clSvg .cl-bar.last').count()) === 1);
	ok('页面：顶上的数字是真的（当前版本、版本数）' + T, (await p.textContent('#stV')) === 'v5.2.1' && (await p.textContent('#stN')) === String(REL.length));
	ok('页面：实时同步提示' + T, /实时同步 · 最近一次发布/.test(await p.textContent('#clLive')));
	ok('页面：发布说明原文（加粗显示成粗体）' + T, /一键更新会验证安装包的签名/.test(await p.textContent('#v5-2-1')) && (await p.locator('#v5-2-1 .cl-g li b').count()) >= 1);
	const hot = await p.evaluate(() => { const e = document.querySelector('#v5-2-1 .cl-hot'); if (!e) return null; const r = e.getBoundingClientRect(), c = e.closest('.cl-card').getBoundingClientRect(); return { t: e.textContent, li: e.querySelectorAll('li').length, inside: r.left >= c.left - 1 && r.right <= c.right + 1, vis: r.height > 0 }; });
	ok('页面：版本下面列出修复补丁（V 编号、日期、改了什么，新的在前），不超出卡片' + T, hot && hot.li === 2 && /修复补丁/.test(hot.t) && hot.t.indexOf('v5.2.1 V2') < hot.t.indexOf('v5.2.1 V1') && /AI 确认弹窗不用刷新就出来/.test(hot.t) && !/只给/.test(hot.t) && hot.inside && hot.vis && !(await p.locator('#v5-2-0 .cl-hot').count()), JSON.stringify(hot));
	if (w !== 1280) { await p.locator('#v5-2-1 .cl-hot').scrollIntoViewIfNeeded(); await p.screenshot({ path: new URL('../../tests/panel/shots/changelog-hot-' + w + '.png', import.meta.url).pathname }); }
	ok('页面：不横向滚动' + T, (await p.evaluate(() => document.documentElement.scrollWidth)) <= w, String(await p.evaluate(() => document.documentElement.scrollWidth)));
	ok('页面：顶上的数字不折行、不超出' + T, await p.evaluate(() => [...document.querySelectorAll('.cl-stats dd, .cl-stats dt')].every((e) => e.scrollWidth <= e.clientWidth + 1 && e.getBoundingClientRect().height < 48)));
	// 展开、筛选
	const more = p.locator('#v5-2-0 .cl-more');
	const hid0 = await p.locator('#v5-2-0 li.x').first().isVisible();
	await more.click(); await p.waitForTimeout(200);
	ok('页面：多的先收起，点「展开全部」才显示' + T, !hid0 && await p.locator('#v5-2-0 li.x').first().isVisible() && /收起/.test(await more.textContent()));
	await p.click('#clFilter [data-f="major"]'); await p.waitForTimeout(200);
	const vis = await p.$$eval('.cl-rel:not([hidden])', (l) => l.map((x) => x.dataset.v));
	ok('页面：筛「大版本」只剩 x.0.0' + T, vis.length >= 3 && vis.every((v) => /\.0\.0$/.test(v)), vis.join());
	await p.click('#clFilter [data-f="all"]'); await p.waitForTimeout(200);
	// 读到哪亮到哪
	await p.evaluate(() => document.getElementById('v3-0-0').scrollIntoView({ block: 'center' })); await p.waitForTimeout(400);
	ok('页面：往下读，左边的线亮到当前位置，读过的版本圆点亮起来' + T, (await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('clList')).getPropertyValue('--prog')))) > 200 && await p.evaluate(() => document.getElementById('v5-2-1').classList.contains('on')));
	// 开着页面时发布了新版本
	extra = { v: 'v9.0.0', at: Date.now() - 20e3, must: false, major: true, sec: false, first: false, groups: [{ t: '', items: ['新发布的版本'] }], note: '' };
	await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p.waitForTimeout(900);
	ok('页面：开着时发布了新版本，自动出现在最上面，标「刚刚发布」' + T, (await p.locator('.cl-rel').first().getAttribute('data-v')) === 'v9.0.0' && /刚刚发布/.test(await p.locator('.cl-rel').first().textContent()) && (await p.textContent('#stV')) === 'v9.0.0');
	extra = null;
	ok('页面：没有报错' + T, !errs.length, errs.join(' | '));
	await ctx.close();
}
// 读不到的时候
gh.mode = 'limited';
env.H = ns(mod.Hub);
globalThis.fetch = async (input, init = {}) => { const u = new URL(typeof input === 'string' ? input : input.url); if (u.hostname === 'localhost') return realFetch(input, init); return new Response('', { status: 500 }); };
{
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const p = await ctx.newPage();
	await p.route('**/api/changelog', (r) => r.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false}' }));
	await p.goto('http://localhost:8147/changelog'); await p.waitForTimeout(1500);
	ok('页面：读不到时写清楚，给 GitHub 发布页的链接', /暂时读不到更新日志/.test(await p.textContent('#clList')) && await p.isVisible('#clList a[href*="github.com"]') && /暂时连不上/.test(await p.textContent('#clLive')));
	await ctx.close();
}
await browser.close(); server.close();
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

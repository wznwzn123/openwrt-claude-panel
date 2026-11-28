// 后台「补丁」页（热补丁分批推送和退回，用户 11/28）：真浏览器打开，各批次、失败原因、按钮；推下一批、全部退回、退回这台、取消固定；
// 路由器列表里「退回补丁」；320 / 390 深色 / 430 / 电脑不重叠、不横向滚动。用法：node test/test_hot_ui.mjs [--shots 目录]
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
const realFetch = globalThis.fetch;
const T0 = Date.now();
const REL = [];
const pub = (tag, body, at) => REL.unshift({ tag_name: tag, body, prerelease: true, draft: false, published_at: new Date(at).toISOString() });
pub('v6.0.0', '## 6.0\n- x', T0 - 9 * 86400e3);
for (let n = 1; n <= 7; n++) pub('hot-6.0.0-' + n, '修复补丁 ' + n + ' 的说明', T0 - (9 - n) * 86400e3);
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url);
	if (u.hostname === 'localhost') return realFetch(input, init);
	if (u.hostname === 'api.github.com' && u.pathname.endsWith('/releases')) return new Response(JSON.stringify(u.searchParams.get('page') > 1 ? [] : REL));
	if ((init.method || '') === 'HEAD') { const m = /\/releases\/download\/(hot-[^/]+)\/SHA256SUMS\.sig2$/.exec(url); if (m && REL.some((r) => r.tag_name === m[1])) return new Response(null, { status: 302 }); return new Response(null, { status: 404 }); }
	if (url === 'https://api.resend.com/emails') return new Response('{"id":"m"}');
	if (u.hostname === 'api.cloudflare.com') return new Response(JSON.stringify({ success: true, result: { id: 'x' }, errors: [] }));
	if (u.hostname === 'api.github.com') return new Response(JSON.stringify({ tag_name: 'v6.0.0', assets: [], body: '## 6.0\n- x', published_at: '2026-11-27T00:00:00Z' }));
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '', RESEND_API_KEY: 're', ADMIN_EMAIL: 'boss@x.com' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const r = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: { ...req.headers, 'cf-connecting-ip': '127.0.0.' + (1 + Math.floor(Math.random() * 250)) }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
	res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8129, z));
const B = 'http://localhost:8129';
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const api = async (path, body, hdr = {}) => (await realFetch(B + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const H = env.H.get('hub'), S = H.ctx.storage;
/* ---------- 准备：V1–V7 在分批推送上线以前发的（全部）；V8 推给全部、V9 在 50%、V10 暂停（有失败）、V11 退回 ---------- */
await api('/api/router/hot?v=6.0.0');
const inv = (await api('/api/admin/invites', { direct: true, max: 5, svc: 7, note: 'x' }, ADM)).invite.code;
const R1 = await api('/api/register', { invite: inv, name: '客厅 Kwrt', model: 'JDCloud AX1800 Pro' });
await S.put('cp:b2b2b2b2b2b2b2b2', { last: Date.now(), ap: { st: 'ok' } }); H._hrb = null;
for (const [n, body] of [[8, '分流选的节点挂了先换同名的 再换同地区的'], [9, '识别软件重做 认得出几百个常用软件 能搜索'], [10, '流量统计不用代理插件也能看'], [11, '一条很长很长的补丁说明 用来看窄屏会不会挤出去 覆写里你自己写的规则优先 分流里标覆写里的']]) {
	pub('hot-6.0.0-' + n, body, Date.now()); await api('/api/router/hot?v=6.0.0');
}
// 尝鲜里没人 4 天内打开过面板：新补丁都从 10% 开始
await api('/api/admin/hot/6.0.0-8/next', {}, ADM); await api('/api/admin/hot/6.0.0-8/next', {}, ADM);
await api('/api/admin/hot/6.0.0-9/next', {}, ADM);
await env.W.get('dev:' + R1.sub).ctx.storage.put('cfg', { ...(await env.W.get('dev:' + R1.sub).ctx.storage.get('cfg')), rkey: R1.rkey });
const rp = await api('/api/router/hotrep', { v: '6.0.0', n: 10, ok: 0, err: '装完面板打不开，已退回原来的', s: R1.sub, rk: R1.rkey });
await api('/api/router/hotrep', { v: '6.0.0', n: 10, ok: 0, err: '下载失败', id: 'b2b2b2b2b2b2b2b2' });
await api('/api/admin/hot/6.0.0-11/back', {}, ADM);
const L0 = await api('/api/admin/hot', undefined, ADM);
ok('[准备] V10 暂停、V11 退回、V9 在 50%、V8 全部', rp.paused && L0.list.find((x) => x.n === 10).stage === 'paused' && L0.list.find((x) => x.n === 11).stage === 'back' && L0.list.find((x) => x.n === 9).stage === 'p50', JSON.stringify(L0.list.map((x) => [x.n, x.stage])));
/* ---------- 浏览器 ---------- */
const DEV = {
	w320: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
	'w390-dark': { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, dark: true },
	w430: { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
	w1280: { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 },
};
const overlap = (p) => p.evaluate(() => {
	const sel = '.page-head > *, .hub-stack > *, .hub-row > *, .hub-row-acts > *, .hub-row-title > *, .hot-fail > *, .panel-head > *';
	const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent && e.getBoundingClientRect().width > 0);
	const bad = [];
	for (const e of els) { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1) bad.push('超出：' + (e.className || e.tagName).toString().slice(0, 30)); }
	for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
		const a = els[i], b = els[j]; if (a.contains(b) || b.contains(a) || a.parentElement !== b.parentElement) continue;
		const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
		if (x.left < y.right - 2 && y.left < x.right - 2 && x.top < y.bottom - 2 && y.top < x.bottom - 2) bad.push((a.className || a.tagName).toString().slice(0, 24) + '×' + (b.className || b.tagName).toString().slice(0, 24));
	}
	return [...new Set(bad)].slice(0, 6).join('；');
});
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const browser = await chromium.launch();
for (const [dn, dv] of Object.entries(DEV)) {
	const sfx = ' [' + dn + ']';
	const ctx = await browser.newContext({ ...dv, colorScheme: dv.dark ? 'dark' : 'light' });
	const page = await ctx.newPage(); const errs = [];
	page.on('pageerror', (e) => errs.push(e.message));
	// 一屏一屏往下截（用滚轮滚，不管是哪一层在滚动），最后回到顶上
	const shot = async (n) => {
		if (!SHOTS) return;
		const vh = dv.viewport.height;
		await page.mouse.move(dv.viewport.width / 2, vh / 2);
		let last = '';
		for (let i = 0; i < 8; i++) {
			await page.screenshot({ path: `${SHOTS}/hot-${n}-${dn}-${i}.png` });
			const pos = await page.evaluate(() => [...document.querySelectorAll('*')].map((e) => e.scrollTop).join(',') + window.scrollY);
			if (pos === last && i) break; last = pos;
			await page.mouse.wheel(0, vh * 0.85); await W(350);
			if ((await page.evaluate(() => [...document.querySelectorAll('*')].map((e) => e.scrollTop).join(',') + window.scrollY)) === pos) break;
		}
		await page.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollTop) e.scrollTop = 0; window.scrollTo(0, 0); });
		await W(200);
	};
	try {
		await page.goto(B + '/admin'); await W(1200);
		await page.fill('input[type=password]', 'admin-key-1234567890'); await page.click('button[type=submit]'); await W(2000);
		await page.goto(B + '/admin#/hot'); await W(1500);
		const txt = await page.textContent('.content');
		ok('「补丁」页：每个补丁一行，批次、说明、失败原因' + sfx, /V10/.test(txt) && /已暂停/.test(txt) && /已退回/.test(txt) && /50%/.test(txt) && /装完面板打不开/.test(txt) && /网络/.test(txt), txt.slice(0, 300));
		ok('暂停着的补丁：菜单上有红点' + sfx, /1/.test(await page.locator('.nav-badge').allTextContents().then((a) => a.join(' '))));
		const o = await overlap(page), sw = await page.evaluate(() => document.documentElement.scrollWidth);
		ok('排版不重叠、不超出、没有横向滚动' + sfx, !o && sw <= dv.viewport.width + 1, o + ' 宽' + sw);
		await shot('list');
		// 展开记录
		await page.locator('.hot-row', { hasText: 'V10' }).getByRole('button', { name: '记录' }).click(); await W(400);
		ok('点「记录」：看到自动暂停的原因' + sfx, /自动暂停/.test(await page.textContent('.content')));
		ok('展开记录后排版照样不重叠' + sfx, !(await overlap(page)));
		await shot('log');
		if (dn === 'w1280') {
			// 继续 → 推下一批
			await page.locator('.hot-row', { hasText: 'V10' }).getByRole('button', { name: '继续' }).click(); await W(400);
			await shot('confirm');
			await page.locator('.modal').getByRole('button', { name: '继续' }).click(); await W(1200);
			ok('继续：V10 回到暂停前那一批' + sfx, (await api('/api/admin/hot', undefined, ADM)).list.find((x) => x.n === 10).stage !== 'paused');
			await page.locator('.hot-row', { hasText: 'V9' }).first().getByRole('button', { name: '推下一批' }).click(); await W(400);
			await page.locator('.modal').getByRole('button', { name: '推下一批' }).click(); await W(1200);
			ok('推下一批：V9 50% → 全部' + sfx, (await api('/api/admin/hot', undefined, ADM)).list.find((x) => x.n === 9).stage === 'all');
			// 失败的那台：退回这台（固定在 V9）
			await page.locator('.hot-row', { hasText: 'V10' }).locator('.hot-fail', { hasText: '托管版' }).getByRole('button', { name: '退回这台' }).click(); await W(400);
			ok('退回这台：给出可选的补丁编号（比现在早、没退回的；6.0.0 没有 V0 就不列）' + sfx, /V9/.test(await page.textContent('.modal')) && /V5/.test(await page.textContent('.modal')) && !/V4|V0/.test(await page.textContent('.modal')), await page.textContent('.modal'));
			await shot('pin');
			await page.locator('.modal').getByRole('button', { name: 'V9', exact: true }).click(); await page.locator('.modal').getByRole('button', { name: '退回这台' }).click(); await W(1200);
			const L = await api('/api/admin/hot', undefined, ADM);
			ok('固定好了：「按台退回的」里有这台' + sfx, L.pins.some((p) => p.key === 's:' + R1.sub && p.n === 9) && /按台退回的/.test(await page.textContent('.content')), JSON.stringify(L.pins));
			const c = await env.W.get('dev:' + R1.sub).ctx.storage.get('cfg');
			ok('托管版：心跳会带 hotc 让它马上退回' + sfx, c.hotc > 0);
			// 路由器列表：标「固定在 V9」，按钮「取消固定补丁」
			await page.goto(B + '/admin#/devices'); await W(1400);
			ok('路由器列表：标「固定在 V9」' + sfx, /固定在 V9/.test(await page.textContent('.content')));
			await page.getByRole('button', { name: '取消固定补丁' }).click(); await W(400);
			await page.locator('.modal').getByRole('button', { name: '取消固定' }).click(); await W(1200);
			ok('取消固定' + sfx, !(await api('/api/admin/hot', undefined, ADM)).pins.length);
			await page.goto(B + '/admin#/hot'); await W(1200);
			// 全部退回 V10
			await page.locator('.hot-row', { hasText: 'V10' }).getByRole('button', { name: '全部退回' }).click(); await W(400);
			ok('全部退回：确认框写清楚后果' + sfx, /30 分钟内退回上一个补丁/.test(await page.textContent('.modal')));
			await page.locator('.modal').getByRole('button', { name: '全部退回' }).click(); await W(1200);
			ok('全部退回 V10：退到 V9' + sfx, (await api('/api/admin/hot', undefined, ADM)).list.find((x) => x.n === 10).stage === 'back');
			await shot('after');
		}
		ok('页面没有脚本报错' + sfx, !errs.length, errs.join(' | '));
	} catch (e) { ok('没出意外' + sfx, false, e.message); }
	await ctx.close();
}
await browser.close(); server.close();
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

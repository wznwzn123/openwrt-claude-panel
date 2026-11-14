// 管理后台排版全面检查：各种手机、平板、电脑（安卓 / iPhone / iPad / Windows / Mac）、横竖屏、深浅色、普通字体和更宽的字体（模拟 Windows 微软雅黑），
// 每一页：文字不被截掉、不压在一起、不贴卡片边、不超出屏幕；手机上图表和表格能左右滑、有滑动条。
// 用法：node test/test_admin_layout.mjs   （ONLY=iPhone 只跑名字里有它的设备；SHOTS=目录 有问题时截图，ALL=1 全部截图）
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
const realFetch = globalThis.fetch;
let CFn = 0;
const MAILS = [];
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (u.hostname === 'api.cloudflare.com') { const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] })); if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 'tun' + ++CFn, token: 'tok' }); if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'dns' + ++CFn }); return R({}); }
	if (url === 'https://api.resend.com/emails') { MAILS.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); }
	if (u.hostname === 'localhost') return realFetch(input, init);
	if (u.hostname === 'api.github.com') return new Response(JSON.stringify({ tag_name: 'v4.0.0', assets: [{ name: 'router-panel.apk' }], body: '## 4.0\n- 通知', published_at: '2026-11-14T00:00:00Z' }));
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '', RESEND_API_KEY: 're', ADMIN_EMAIL: 'boss@x.com' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const hd = { ...req.headers, 'cf-connecting-ip': req.headers['x-ip'] || '127.0.0.1' };
	const r0 = new Request('http://localhost' + req.url, { method: req.method, headers: hd, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
	const r1 = Object.assign(r0, { cf: { country: 'TW', city: 'Taipei' } });
	const r = await mod.default.fetch(r1, env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
	res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8137, z));
const B = 'http://localhost:8137';
const api = async (path, body, hdr = {}, method) => (await realFetch(B + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const H = env.H.get('hub');
/* ---------- 准备数据 ---------- */
const inv = (await api('/api/admin/invites', { max: 5, svc: 7, note: '给朋友' }, ADM)).invite.code;
const R1 = await api('/api/register', { invite: inv, name: '客厅 Kwrt', model: 'JDCloud AX1800 Pro' });
const R2 = await api('/api/register', { invite: inv, name: 'OpenWrt', model: 'Xiaomi AX3000T' });
await api('/api/admin/renewals', { days: 90, count: 2, note: '阿明' }, ADM);
await api('/api/admin/ann', { title: '4.0 发布了', body: '面板里新加了「通知」和「实时联系开发者」。', level: 'important', days: 7 }, ADM);
await api('/api/admin/ann', { title: '今晚 2 点维护', body: '官网维护 10 分钟，家里上网不受影响。', level: 'normal' }, ADM);
const PNG = 'data:image/png;base64,' + (await import('fs')).readFileSync(new URL('./fixtures/shot.png', import.meta.url)).toString('base64');
await api('/api/chat', { sub: R1.sub, rkey: R1.rkey, op: 'send', text: '你好，节点页打不开了，点进去一直转圈', ver: '4.0.0', ua: 'Mozilla/5.0 (Linux; Android 14)' });
await api('/api/chat', { sub: R1.sub, rkey: R1.rkey, op: 'send', text: '截图在这', img: PNG });
const A = await api('/api/chat', { op: 'anon', name: 'OpenWrt-x86', model: 'x86/64' });
await api('/api/chat', { cid: A.cid, ckey: A.ckey, op: 'send', text: '自建版也能问吗？' + '很长的一句话'.repeat(12) });
await api('/api/dev/feedback', { sub: R1.sub, rkey: R1.rkey, text: '首页的流量图不动了', contact: '微信 ming', images: [PNG] });
const RP = await api('/api/report', { kind: 'install', text: '面板版本：3.1.3\n失败的步骤：安装依赖\n错误：opkg 崩溃', log: 'Segmentation fault\n'.repeat(30), email: 'ming@x.com' });
for (const [p, ip] of [['/', '1.2.3.4'], ['/', '1.2.3.4'], ['/app', '5.6.7.8'], ['/privacy', '2001:b011:7c05:1a2b:3c4d:5e6f:7a8b:9c0d'], ['/r', '9.9.9.9']]) await realFetch(B + p, { headers: { 'x-ip': ip } });
await realFetch(B + '/api/account/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ email: 'x@x.com', password: 'wrong-pass' }) });
await realFetch(B + '/api/admin/devices', { headers: { authorization: 'Bearer wrong-key-123456789' } });
ok('[准备] 安装失败上报成功', !!RP.code, JSON.stringify(RP));
await H.errLog('/api/test', 'TypeError: 模拟出错\n    at hub.js:1');
await H.mailLog('ming@x.com', '我们收到了你上报的安装问题', true, '');
// 30 天的访问统计（让图表和表格够宽，需要左右滑）
{ const DAY = 864e5; for (let i = 1; i < 30; i++) { const d = mod.dayKey ? mod.dayKey(Date.now() - i * DAY) : new Date(Date.now() - i * DAY).toISOString().slice(0, 10); await H.ctx.storage.put('st:' + d, { n: { pv: 20 + (i * 7) % 40, bot: i % 4, login_ok: i % 5, login_fail: i % 3, reg: i % 2, mail_ok: 1, chat_in: i % 4, dev_reg: i % 3 }, pv: { home: 10 + i, app: 5 + (i % 6), privacy: 2 }, ip: {}, ipn: 5 + (i % 9), cc: { TW: 9, US: 3, DE: 2, JP: 1, HK: 1, CN: 2 } }); } }
/* ---------- 布局检查 ---------- */
const PAGES = ['dashboard', 'chat', 'chat-open', 'feedback', 'ann', 'devices', 'users', 'applications', 'invites', 'renewals', 'visits', 'logins', 'oplog', 'mails', 'errors', 'settings'];
const DEV = {
	'安卓 360': { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36 EdgA/124' },
	'安卓 412': { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36' },
	'iPhone SE': { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1' },
	'iPhone 15': { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
	'iPhone 横屏': { viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
	'iPad 竖屏': { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
	'iPad 横屏': { viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
	'Windows 1280': { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.25, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 Edg/124' },
	'Windows 1920': { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' },
	'Mac 13 寸': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15' },
	'Mac 小窗口': { viewport: { width: 960, height: 700 }, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15' },
};
// 字体模式：普通；「宽字体」模拟 Windows 微软雅黑这类更宽更大的字（字号放大 8%、字距加宽、换成很宽的西文字体）
const FONTS = process.env.FONTS ? process.env.FONTS.split(',') : ['普通', '宽字体'];
const check = (p) => p.evaluate(() => {
	const bad = [], vis = (e) => { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity === 0 || cs.display === 'none') return false; for (let q = e; q; q = q.parentElement) { const c = getComputedStyle(q); if (+c.opacity === 0 || c.display === 'none') return false; if (q.classList && (q.classList.contains('rail') && getComputedStyle(document.querySelector('.app-frame')).gridTemplateColumns.split(' ').length < 2 && !document.querySelector('.is-mobile-open'))) return false; } return true; };
	const own = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
	const txt = [...document.querySelectorAll('body *')].filter((e) => own(e) && !e.closest('details:not([open]) > :not(summary)') && !['SCRIPT', 'STYLE', 'TITLE', 'OPTION'].includes(e.tagName) && e.getBoundingClientRect().width > 0 && vis(e));
	const name = (e) => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14);
	const clipBox = (e) => { for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) { const c = getComputedStyle(q); if (c.overflowX !== 'visible' || c.overflowY !== 'visible') return q; } return null; };
	const scrollAnc = (e) => { for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) if (q.classList.contains('hs-sc') || q.classList.contains('chat-quick') || q.classList.contains('content') || q.classList.contains('chat-msgs') || q.classList.contains('chat-threads') || getComputedStyle(q).overflowX === 'auto') return q; return null; };
	const clipR = (e) => { let L = 0, T = 0, R = innerWidth, Bm = innerHeight * 50; for (let q = e; q && q !== document.documentElement; q = q.parentElement) { const c = getComputedStyle(q); if (c.overflowX !== 'visible' || c.overflowY !== 'visible') { const b = q.getBoundingClientRect(); const m = q.parentElement && q.parentElement.classList.contains('can-r') && q.classList.contains('hs-sc') ? 30 : 0, ml = q.parentElement && q.parentElement.classList.contains('can-l') && q.classList.contains('hs-sc') ? 30 : 0; L = Math.max(L, b.left + ml); R = Math.min(R, b.right - m); if (c.overflowY !== 'visible' && !q.classList.contains('content')) { T = Math.max(T, b.top); Bm = Math.min(Bm, b.bottom); } } } return { L, T, R, B: Bm }; };
	const vrects = (e) => { const range = document.createRange(); range.selectNodeContents(e); const C = clipR(e); return [...range.getClientRects()].map((r) => ({ left: Math.max(r.left, C.L), right: Math.min(r.right, C.R), top: Math.max(r.top, C.T), bottom: Math.min(r.bottom, C.B), cutL: r.left < C.L - 1, cutR: r.right > C.R + 1 })).filter((r) => r.right - r.left > 1 && r.bottom - r.top > 1); };
	// 1. 文字被截掉（不是故意的省略号）
	for (const e of txt) {
		const cs = getComputedStyle(e);
		if (cs.textOverflow === 'ellipsis' || e.closest('.ellipsis, [class*="ellipsis"], .cell-text, .hs-hint, .odo-cell, .sr-only, .hs-sc') || !vrects(e).length) continue;
		if ((cs.overflowX !== 'visible') && e.scrollWidth > e.clientWidth + 1 && !/auto|scroll/.test(cs.overflowX)) { bad.push('文字被截：' + name(e)); continue; }
		const b = clipBox(e); if (!b || /auto|scroll/.test(getComputedStyle(b).overflowX) || b.classList.contains('content')) continue;
		const r = e.getBoundingClientRect(), R = b.getBoundingClientRect();
		const range = document.createRange(); range.selectNodeContents(e); const tr = range.getBoundingClientRect();
		if (b.closest('.ellipsis') || getComputedStyle(b).textOverflow === 'ellipsis') continue;
		const vScroll = /auto|scroll/.test(getComputedStyle(b).overflowY);
		if (tr.right > R.right + 1.5 || tr.left < R.left - 1.5 || (!vScroll && (tr.bottom > R.bottom + 2 || tr.top < R.top - 2))) bad.push('文字超出框被裁：' + name(e) + '<' + e.tagName + '.' + String(e.className.baseVal ?? e.className).slice(0, 20) + ' in ' + b.tagName + '.' + String(b.className.baseVal ?? b.className).slice(0, 20) + '>');
	}
	// 2. 文字互相压住
	const boxes = txt.map((e) => e.closest('.odo-cell, .sr-only') ? [] : vrects(e));
	outer: for (let i = 0; i < txt.length; i++) for (let j = i + 1; j < txt.length; j++) {
		const a = txt[i], b = txt[j]; if (a.contains(b) || b.contains(a)) continue;
		if (a.closest('.img-view, .trend-tip, .toast') || b.closest('.img-view, .trend-tip, .toast')) continue;
		for (const x of boxes[i]) for (const y of boxes[j]) {
			const ix = Math.min(x.right, y.right) - Math.max(x.left, y.left), iy = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
			if (ix > 2 && iy > 3) {
				bad.push('文字压在一起：「' + name(a) + '」×「' + name(b) + '」'); break outer;
			}
		}
	}
	// 3. 文字贴着卡片边（左右小于 8 像素）；滑动区里滑到边上被遮住的不算
	for (const e of txt) {
		const card = e.closest('.panel, .bento, .todo-card, .m-surface, .chat-wrap'); if (!card || e.closest('.odo-cell, .sr-only')) continue;
		const C = card.getBoundingClientRect();
		for (const r of vrects(e)) {
			if (r.cutL || r.cutR) continue;
			const d = Math.min(r.left - C.left, C.right - r.right);
			if (d < 8) { bad.push('文字贴边：' + name(e) + ' ' + Math.round(d) + 'px'); break; }
		}
	}
	// 4. 超出屏幕
	const inBox = (e) => { for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) { const cs = getComputedStyle(q); if (cs.overflowX !== 'visible' && q.getBoundingClientRect().right <= innerWidth + 1) return true; } return false; };
	for (const e of document.querySelectorAll('.content *, .topbar *')) { const r = e.getBoundingClientRect(); if (r.width && r.right > innerWidth + 1 && !inBox(e) && vis(e)) { bad.push('超出屏幕：' + name(e)); break; } }
	if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('整页横向超出 ' + document.documentElement.scrollWidth);
	return [...new Set(bad)];
});
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const browser = await chromium.launch();
const ONLY = process.env.ONLY;
let n = 0;
for (const [dn, dv] of Object.entries(DEV)) for (const font of FONTS) for (const dark of [false, true]) {
	if (ONLY && !dn.includes(ONLY)) continue;
	if (dark && font !== '普通') continue;
	const tag = ` [${dn}${font === '普通' ? '' : ' ' + font}${dark ? ' 深色' : ''}]`;
	const ctx = await browser.newContext({ ...dv, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce', extraHTTPHeaders: { 'x-ip': '10.9.' + (n++) + '.1' } });
	await ctx.addInitScript(() => { try { sessionStorage.setItem('hub.adminKey', 'admin-key-1234567890') } catch {} });
	const page = await ctx.newPage(); const errs = [];
	page.on('pageerror', (e) => errs.push(e.message));
	try {
		await page.goto(B + '/admin#/login'); await W(900);
		if (await page.isVisible('input[type=password]')) { ok('登录页排版' + tag, !(await check(page)).length, (await check(page)).join('；')); await page.fill('input[type=password]', 'admin-key-1234567890'); await page.click('button[type=submit]'); await W(1800); }
		for (const pg of PAGES) {
			await page.goto(B + '/admin#/' + (pg === 'chat-open' ? 'chat' : pg)); await W(1400);
			if (pg === 'chat-open') { await page.locator('.chat-th', { hasText: '客厅 Kwrt' }).click(); await W(1300); }
			if (font === '宽字体') {
				await page.reload(); await W(1500);
				if (pg === 'chat-open' && !(await page.locator('.chat-head').isVisible())) { await page.locator('.chat-th', { hasText: '客厅 Kwrt' }).click(); await W(1300); }
				await page.addStyleTag({ content: ':root, body, button, input, textarea { font-family: "DejaVu Sans", "Noto Sans CJK SC", sans-serif !important; letter-spacing: .015em !important; }' });
				await page.evaluate(() => { const els = [...document.querySelectorAll('body *')]; const fs = els.map((e) => parseFloat(getComputedStyle(e).fontSize)); els.forEach((e, i) => { e.style.fontSize = (fs[i] * 1.08) + 'px'; }); });
				await W(500);
			}
			const b = await check(page);
			ok(`「${pg}」文字不截断、不压在一起、不贴边、不超出屏幕` + tag, !b.length, b.slice(0, 5).join('；'));
			if (process.env.SHOTS && (b.length || process.env.ALL)) await page.screenshot({ path: `${process.env.SHOTS}/lay-${pg}-${dn.replace(/\s/g, '')}${font === '普通' ? '' : '-wide'}${dark ? '-dark' : ''}.png`, fullPage: false });
		}
		// 滑动区：手机上能左右滑、有滑动条、拖滑动条会动
		if (dv.isMobile && dv.viewport.width < 500) {
			await page.goto(B + '/admin#/visits'); await W(1600);
			const hs = await page.evaluate(() => [...document.querySelectorAll('.hs.is-on')].map((h) => ({ bar: !!h.querySelector('.hs-thumb'), sw: h.querySelector('.hs-sc').scrollWidth, cw: h.querySelector('.hs-sc').clientWidth, sl: h.querySelector('.hs-sc').scrollLeft })));
			ok('手机：访问统计里的图表、各项次数、按天表格都能左右滑，有滑动条' + tag, hs.length >= 3 && hs.every((x) => x.bar && x.sw > x.cw), JSON.stringify(hs));
			ok('手机：趋势图一打开就停在最新的日期（最右边）' + tag, hs.length && hs[0].sl > 0, JSON.stringify(hs[0]));
			const k = await page.evaluate(() => { const l = [...document.querySelectorAll('.hs.is-on')]; const i = l.findIndex((h) => h.querySelector('table')); l[i].scrollIntoView({ block: 'center' }); return i; }); await W(400);
			const t = page.locator('.hs.is-on .hs-track').nth(k); await t.scrollIntoViewIfNeeded(); await W(500); const bb = await t.boundingBox();
			const before = await page.evaluate((k) => document.querySelectorAll('.hs.is-on .hs-sc')[k].scrollLeft, k);
			await page.mouse.move(bb.x + 6, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width - 4, bb.y + bb.height / 2, { steps: 6 }); await page.mouse.up(); await W(300);
			const after = await page.evaluate((k) => document.querySelectorAll('.hs.is-on .hs-sc')[k].scrollLeft, k);
			ok('手机：拖滑动条，内容跟着左右动' + tag, after > before + 20, before + '→' + after + ' k=' + k + ' ' + JSON.stringify(bb));
		}
		// 有的手机浏览器（用户的安卓 Edge）不把内容区当成滚动区来算宽度：模拟这种情况，工作区也不能被里面的宽表格、图表撑宽
		if (font === '普通' && !dark) for (const pg of ['visits', 'oplog', 'dashboard', 'logins']) {
			await page.goto(B + '/admin#/' + pg); await W(1400);
			await page.addStyleTag({ content: '.content{overflow:visible!important}' }); await W(400);
			const r = await page.evaluate(() => ({ top: Math.round(document.querySelector('.topbar').getBoundingClientRect().right), page: Math.round(document.querySelector('.page').getBoundingClientRect().width), w: innerWidth }));
			ok(`「${pg}」浏览器不把内容区当滚动区时，整页也不会被撑宽（顶栏按钮都在屏幕里）` + tag, r.top <= r.w + 1 && r.page <= r.w + 1, JSON.stringify(r));
			await page.reload(); await W(800);
		}
		ok('没有脚本报错' + tag, !errs.length, errs.slice(0, 2).join(' | '));
	} catch (e) { ok('跑完' + tag, false, e.message.split('\n')[0]); }
	await ctx.close();
}
await browser.close(); server.close();
const fail = results.filter((r) => !r[1]);
for (const [nm, c, note] of results) if (!c || process.env.V) console.log((c ? '  ✓ ' : '  ✗ ') + nm + (note && !c ? '（' + note + '）' : ''));
console.log(`通过 ${results.length - fail.length}/${results.length}`);
process.exit(fail.length ? 1 : 0);

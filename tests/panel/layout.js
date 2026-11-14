// 路由器面板排版全面检查：各种手机/平板/电脑，普通字体和更宽的字体；每页文字不截、不压、不贴边、不超出屏幕
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW || path.join(__dirname, '..', '..', 'src', 'www'));
const results = []; const ok = (n, c, note) => results.push([n, !!c, note || '']);
const PAGES = ['home', 'proxy', 'subs', 'cfg', 'ow', 'rules', 'set', 'log', 'dev', 'traf', 'notice', 'chat', 'myfb', 'speed', 'cbk', 'conn', 'black', 'files', 'wd', 'auto', 'slog', 'proc', 'more'];
const DEV = {
	'安卓 360': { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36 EdgA/124' },
	'iPhone SE': { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1' },
	'iPhone 15': { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
	'iPad': { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
	'Windows': { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 Edg/124' },
	'Mac': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15' },
};
const FONTS = process.env.FONTS ? process.env.FONTS.split(',') : ['普通', '宽字体'];
const check = (p) => p.evaluate(() => {
	const bad = [], vis = (e) => { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity === 0 || cs.display === 'none') return false; for (let q = e; q; q = q.parentElement) { const c = getComputedStyle(q); if (+c.opacity === 0 || c.display === 'none') return false; if (q.classList && (false)) return false; } return true; };
	const own = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
	const txt = [...document.querySelectorAll('body *')].filter((e) => own(e) && !e.closest('details:not([open]) > :not(summary)') && !['SCRIPT', 'STYLE', 'TITLE', 'OPTION'].includes(e.tagName) && e.getBoundingClientRect().width > 0 && vis(e));
	const name = (e) => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14);
	const clipBox = (e) => { for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) { const c = getComputedStyle(q); if (c.overflowX !== 'visible' || c.overflowY !== 'visible') return q; } return null; };
	const scrollAnc = (e) => { for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) if (q.classList.contains('hs-sc') || q.classList.contains('chat-quick') || false || q.classList.contains('chat-msgs') || q.classList.contains('chat-threads') || getComputedStyle(q).overflowX === 'auto') return q; return null; };
	const clipR = (e) => { let L = 0, T = 0, R = innerWidth, Bm = innerHeight * 50; for (let q = e; q && q !== document.documentElement; q = q.parentElement) { const c = getComputedStyle(q); if (c.overflowX !== 'visible' || c.overflowY !== 'visible') { const b = q.getBoundingClientRect(); const m = q.parentElement && q.parentElement.classList.contains('can-r') && q.classList.contains('hs-sc') ? 30 : 0, ml = q.parentElement && q.parentElement.classList.contains('can-l') && q.classList.contains('hs-sc') ? 30 : 0; L = Math.max(L, b.left + ml); R = Math.min(R, b.right - m); if (c.overflowY !== 'visible' && !false) { T = Math.max(T, b.top); Bm = Math.min(Bm, b.bottom); } } } return { L, T, R, B: Bm }; };
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
		const fixedAnc = (e) => { for (let q = e; q && q !== document.body; q = q.parentElement) { const p = getComputedStyle(q).position; if (p === 'fixed' || p === 'sticky') return q; } return null; };
		if (fixedAnc(a) !== fixedAnc(b)) continue;
		for (const x of boxes[i]) for (const y of boxes[j]) {
			const ix = Math.min(x.right, y.right) - Math.max(x.left, y.left), iy = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
			if (ix > 2 && iy > 3) {
				bad.push('文字压在一起：「' + name(a) + '」×「' + name(b) + '」'); break outer;
			}
		}
	}
	// 3. 文字贴着卡片边（左右小于 8 像素）；滑动区里滑到边上被遮住的不算
	for (const e of txt) {
		const card = e.closest('.card, .ntcard, .chbub, .sheet, .modal'); if (!card || e.closest('.odo-cell, .sr-only')) continue;
		const C = card.getBoundingClientRect();
		for (const r of vrects(e)) {
			if (r.cutL || r.cutR) continue;
			const d = Math.min(r.left - C.left, C.right - r.right);
			if (d < 8) { bad.push('文字贴边：' + name(e) + ' ' + Math.round(d) + 'px'); break; }
		}
	}
	// 4. 超出屏幕
	const inBox = (e) => { for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) { const cs = getComputedStyle(q); if (cs.overflowX !== 'visible' && q.getBoundingClientRect().right <= innerWidth + 1) return true; } return false; };
	for (const e of document.querySelectorAll('main *, #top *, header *')) { const r = e.getBoundingClientRect(); if (r.width && r.right > innerWidth + 1 && !inBox(e) && vis(e)) { bad.push('超出屏幕：' + name(e)); break; } }
	if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('整页横向超出 ' + document.documentElement.scrollWidth);
	return [...new Set(bad)];
});

const W = (ms) => new Promise((z) => setTimeout(z, ms));
(async () => {
	const browser = await chromium.launch();
	for (const [dn, dv] of Object.entries(DEV)) for (const font of FONTS) for (const dark of [false, true]) {
		if (process.env.ONLY && !dn.includes(process.env.ONLY)) continue;
		if (dark && font !== '普通') continue;
		const tag = ` [${dn}${font === '普通' ? '' : ' ' + font}${dark ? ' 深色' : ''}]`;
		const ctx = await browser.newContext({ ...dv, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce' });
		await ctx.route('http://panel.test/**', async (route) => {
			const u = new URL(route.request().url());
			if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(route.request().postData() || '{}'); const result = respond(body.method, body.params || {}); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) }); }
			if (u.pathname.startsWith('/cgi-bin/luci/')) return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>luci</p>' });
			let f = path.join(ROOT, u.pathname); if (f.endsWith('/')) f += 'index.html';
			if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
			const ct = f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'application/javascript' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream';
			return route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(f) });
		});
		await ctx.route(/^https?:\/\/(?!panel\.test)/, (r) => r.fulfill({ status: 200, body: '{}' }));
		const page = await ctx.newPage(); const errs = [];
		page.on('pageerror', (e) => errs.push(e.message));
		await page.addInitScript((d) => { localStorage.setItem('rp_token', 'tok1234567890abcdefgh'); localStorage.setItem('rp_dark', d ? '1' : '0'); }, dark);
		try {
			for (const pg of PAGES) {
				await page.goto('http://panel.test/panel/?p=' + pg); await W(1800);
				if (font === '宽字体') {
					await page.addStyleTag({ content: ':root, body, button, input, textarea { font-family: "DejaVu Sans", "Noto Sans CJK SC", sans-serif !important; letter-spacing: .015em !important; }' });
					await page.evaluate(() => { const els = [...document.querySelectorAll('body *')]; const fs = els.map((e) => parseFloat(getComputedStyle(e).fontSize)); els.forEach((e, i) => { e.style.fontSize = (fs[i] * 1.08) + 'px'; }); });
					await W(400);
				}
				const b = await check(page);
				ok(`「${pg}」文字不截、不压、不贴边、不超出` + tag, !b.length, b.slice(0, 4).join('；'));
				if (process.env.SHOTS && b.length) await page.screenshot({ path: `${process.env.SHOTS}/pl-${pg}-${dn.replace(/\s/g, '')}${font === '普通' ? '' : '-wide'}${dark ? '-dark' : ''}.png` });
			}
			ok('没有脚本报错' + tag, !errs.length, errs.slice(0, 2).join(' | '));
		} catch (e) { ok('跑完' + tag, false, e.message.split('\n')[0]); }
		await ctx.close();
	}
	await browser.close();
	const fail = results.filter((r) => !r[1]);
	for (const [n, c, note] of fail) console.log('  ✗ ' + n + (note ? '（' + note + '）' : ''));
	console.log(`通过 ${results.length - fail.length}/${results.length}`);
})();

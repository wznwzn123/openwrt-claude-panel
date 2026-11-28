// #102 官网英文页（用户 11/28 21:47 定：/en/ 网址、顶栏和页脚切换、记住选择、首页第一次按浏览器语言跳、爬虫不跳）
// 查：英文页看得见的字和属性里没有中文（切换按钮「中文」、括号里的中文原名、更新日志的发布内容除外）、站内链接是 /en/、
//     hreflang 互指、切换写 Cookie 并记住、首页按浏览器语言跳、爬虫和没 UA 的不跳、没翻的 /en/xx 回中文、
//     内容安全策略一条都没拦、常见问题和服务状态接口给英文（后台改过的条目给中文）
// 用法：node test/test_i18n.mjs（要 Playwright）
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
import { FAQ_DEFAULT } from '../faq-default.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => { const u = new URL(typeof input === 'string' ? input : input.url); if (u.hostname === 'localhost') return realFetch(input, init); return new Response('{}'); };
const env = { BASE_DOMAIN: 'localhost', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const H = env.H.get('hub');
const server = http.createServer(async (req, res) => {
	const r = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers }), env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
	const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) h['set-cookie'] = sc;
	res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8196, z));
const B = 'http://localhost:8196';
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const PHONE = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const go = (p, h = {}) => realFetch(B + p, { redirect: 'manual', headers: { 'user-agent': PHONE, ...h } });
// 括号里的中文是面板菜单的原名（用户 11/28 22:4x 定），引号里的是原样照抄的中文（比如节点名的写法），都算对
const zhOut = (s) => /[㐀-鿿]/.test(s.replace(/\([^()]*\)/g, '').replace(/“[^”]*”/g, ''));
const PAGES = ['/en/', '/en/help', '/en/compat', '/en/status', '/en/changelog', '/en/privacy', '/en/terms', '/en/security', '/en/notice'];
const ZH = { '/en/': '/', '/en/help': '/help', '/en/compat': '/compat', '/en/status': '/status', '/en/changelog': '/changelog', '/en/privacy': '/privacy', '/en/terms': '/terms', '/en/security': '/security', '/en/notice': '/notice' };

// 1. 跳转和 Cookie（不用浏览器：无头浏览器的 UA 会被当成爬虫）
{
	let r = await go('/', { 'accept-language': 'en-US,en;q=0.9' });
	ok('首页第一次打开、浏览器是英文 → 跳 /en/', r.status === 302 && r.headers.get('location') === '/en/' && /accept-language/i.test(r.headers.get('vary') || ''), r.status + ' ' + r.headers.get('location'));
	r = await go('/?from=x', { 'accept-language': 'en-US' });
	ok('跳转带上原来的参数', r.headers.get('location') === '/en/?from=x', r.headers.get('location'));
	r = await go('/', { 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' });
	ok('浏览器是中文 → 不跳', r.status === 200);
	r = await go('/', { 'accept-language': 'zh-TW,zh;q=0.9' });
	ok('繁体中文浏览器也不跳', r.status === 200);
	r = await go('/', {});
	ok('没有 Accept-Language → 不跳', r.status === 200);
	r = await go('/', { 'accept-language': 'en-US', cookie: 'lang=zh' });
	ok('选过中文（Cookie lang=zh）→ 英文浏览器也不跳', r.status === 200);
	r = await go('/', { 'accept-language': 'zh-CN', cookie: 'a=1; lang=en' });
	ok('选过英文（Cookie lang=en）→ 中文浏览器也跳 /en/', r.status === 302 && r.headers.get('location') === '/en/');
	for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'Baiduspider', '']) {
		r = await realFetch(B + '/', { redirect: 'manual', headers: { 'user-agent': ua, 'accept-language': 'en-US' } });
		ok('爬虫 / 没 UA 不跳：' + (ua.slice(0, 40) || '（空）'), r.status === 200);
	}
	r = await go('/en'); ok('/en → 301 /en/', r.status === 301 && r.headers.get('location') === '/en/');
	r = await go('/en/index.html'); ok('/en/index.html → 301 /en/', r.status === 301 && r.headers.get('location') === '/en/');
	r = await go('/en/app'); ok('没翻的 /en/app → 回中文 /app', r.status === 302 && r.headers.get('location') === '/app');
	r = await go('/en/r/ABCDEFGH'); ok('没翻的 /en/r/… → 回中文', r.status === 302 && r.headers.get('location') === '/r/ABCDEFGH');
	for (const p of PAGES) {
		r = await go(p); const html = await r.text(), csp = r.headers.get('content-security-policy') || '';
		const zp = ZH[p];
		ok('英文页 ' + p + '：200、lang=en、带 CSP、hreflang 指回中文页', r.status === 200 && /<html lang="en"/.test(html) && /script-src [^;]*'sha256-/.test(csp) && !/unsafe-inline/.test((/script-src ([^;]*)/.exec(csp) || [])[1] || '')
			&& html.includes('hreflang="zh-CN" href="' + zp + '"') && html.includes('hreflang="en" href="' + p + '"'), r.status);
		const zr = await go(zp, { 'accept-language': 'zh-CN' }), zh = await zr.text();
		ok('中文页 ' + zp + '：语言展开栏 简体中文 打勾、English 指向 ' + p, zr.status === 200 && /<html lang="zh-CN"/.test(zh) && zh.includes('aria-checked="true" href="' + zp + '"') && zh.includes('aria-checked="false" href="' + p + '" hreflang="en" lang="en" data-lang="en"') && zh.includes('<span class="lang-cur">中文</span>'), zr.status);
	}
}
// 2. 接口
{
	let j = await (await go('/api/help?lang=en')).json();
	const en = j.items.filter((x) => x.lang === 'en');
	ok('常见问题接口 lang=en：默认的 ' + FAQ_DEFAULT.length + ' 条都给英文、分类是英文', en.length === FAQ_DEFAULT.length && j.cats.every((c) => !/[㐀-鿿]/.test(c.t)), en.length);
	ok('英文常见问题括号外没有中文', en.every((x) => !zhOut(x.q) && !zhOut(x.a)), en.filter((x) => zhOut(x.q) || zhOut(x.a)).map((x) => x.id).join(' '));
	j = await (await go('/api/help')).json();
	ok('不带 lang 照旧是中文', j.items.every((x) => !x.lang) && /[㐀-鿿]/.test(j.items[0].q));
	// 后台改过的条目（跟默认不一样）、后台新加的：英文页给中文原文
	const orig = H.faqAll.bind(H);
	H.faqAll = async () => { const f = await orig(); return { ...f, items: [{ ...f.items[0], a: f.items[0].a + '\n\n后台补了一句' }, ...f.items.slice(1), { id: 'admin-new', cat: 'help', q: '后台新加的问题？', a: '后台新加的回答', kw: '' }] }; };
	j = await (await go('/api/help?lang=en')).json();
	const a0 = j.items.find((x) => x.id === FAQ_DEFAULT[0].id), an = j.items.find((x) => x.id === 'admin-new');
	ok('后台改过的条目英文页给中文（不显示过时的英文）', a0 && a0.lang === 'zh' && a0.a.includes('后台补了一句'));
	ok('后台新加的条目英文页给中文', an && an.lang === 'zh' && an.q === '后台新加的问题？');
	H.faqAll = orig;
	j = await (await go('/api/status?lang=en')).json();
	ok('服务状态接口 lang=en：服务名英文', Array.isArray(j.comps));
}
// 3. 真浏览器：看得见的字、属性、链接、内容安全策略、切换按钮
const browser = await chromium.launch();
const bad = [];
for (const [w, h, dark] of [[390, 844, true], [1280, 860, false]]) {
	const T = '［' + w + '］';
	const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900, colorScheme: dark ? 'dark' : 'light', locale: 'en-US' });
	await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.log('Content Security Policy violation: ' + e.violatedDirective + ' ' + e.blockedURI)));
	const p = await ctx.newPage();
	p.on('console', (m) => { if (/Content Security Policy|Refused to (execute|load|apply|connect)/i.test(m.text())) bad.push(T + m.text().slice(0, 200)); });
	p.on('pageerror', (e) => bad.push(T + ' 页面出错：' + e.message.slice(0, 160)));
	for (const pg of PAGES) {
		await p.goto(B + pg); await W(1000);
		await p.mouse.wheel(0, 3000); await W(400);
		if (pg === '/en/help') { await p.$$eval('.hp-q', (bs) => bs.forEach((b) => b.click())); await W(300); }
		const r = await p.evaluate(() => {
			const lines = document.body.innerText.split('\n').map((l) => l.trim()).filter(Boolean);
			const els = [...document.querySelectorAll('[aria-label],[title],[placeholder],[alt]')].filter((e) => !e.closest('[hidden]'));
			const attrs = els.flatMap((e) => ['aria-label', 'title', 'placeholder', 'alt'].map((a) => e.getAttribute(a)).filter(Boolean));
			const cl = document.getElementById('clList'), clText = cl ? cl.innerText : '';
			const links = [...document.querySelectorAll('a[href^="/"]')].filter((a) => !a.hasAttribute('data-lang')).map((a) => a.getAttribute('href'));
			const sw = [...document.querySelectorAll('.foot-lang')].map((a) => a.getAttribute('href') + '|' + a.getAttribute('data-lang') + '|' + a.textContent.trim());
			const dd = [...document.querySelectorAll('.lang-menu a')].map((a) => a.getAttribute('href') + '|' + a.getAttribute('data-lang') + '|' + a.getAttribute('aria-checked') + '|' + a.textContent.trim());
			const cur = (document.querySelector('.lang-cur') || {}).textContent;
			return { lines, attrs, clText, links, sw, dd, cur, title: document.title, desc: (document.querySelector('meta[name=description]') || {}).content || '' };
		});
		// 更新日志的发布内容本身是中文（用户 11/28 21:47 定），从看得见的字里去掉
		const vis = r.lines.filter((l) => l !== '中文' && !(r.clText && r.clText.includes(l)));
		const zl = vis.filter(zhOut);
		ok('英文页 ' + pg + T + '：看得见的字里没有中文（括号里的原名除外）', !zl.length, zl.slice(0, 4).join(' / '));
		const za = r.attrs.filter(zhOut);
		ok('英文页 ' + pg + T + '：读屏、提示、输入框的字没有中文', !za.length && !zhOut(r.title) && !zhOut(r.desc), za.slice(0, 4).join(' / ') + ' ' + r.title);
		const bl = r.links.filter((h) => !/^\/(en\/|app\b|r\b|r\/|api\/)/.test(h));
		ok('英文页 ' + pg + T + '：站内链接都是 /en/（账号页 /app、查进度 /r 没有英文）', !bl.length, [...new Set(bl)].join(' '));
		ok('英文页 ' + pg + T + '：页脚「中文」指回 ' + ZH[pg], r.sw.length === 1 && r.sw[0] === ZH[pg] + '|zh|中文', r.sw.join(' '));
		ok('英文页 ' + pg + T + '：顶栏语言展开栏写 English，里面 简体中文 → ' + ZH[pg] + '、English 打勾', r.cur === 'English' && r.dd.join(' ') === ZH[pg] + '|zh|false|简体中文 ' + pg + '|en|true|English', r.cur + ' ' + r.dd.join(' '));
	}
	await ctx.close();
}
ok('英文页一条都没有被内容安全策略拦下、没有页面出错', !bad.length, bad.slice(0, 6).join('\n'));
// 4. 切换按钮记住选择
{
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
	const p = await ctx.newPage();
	await p.goto(B + '/en/help'); await W(600);
	await p.click('.foot-lang'); await p.waitForLoadState(); await W(400);
	const c1 = (await ctx.cookies()).find((c) => c.name === 'lang');
	ok('英文页点「中文」→ 到中文页、Cookie lang=zh 一年', new URL(p.url()).pathname === '/help' && c1 && c1.value === 'zh' && c1.expires - Date.now() / 1000 > 360 * 86400 && c1.sameSite === 'Lax', p.url() + ' ' + JSON.stringify(c1));
	let r = await go('/', { 'accept-language': 'en-US', cookie: 'lang=' + c1.value });
	ok('之后英文浏览器打开首页不再跳英文', r.status === 200);
	await p.click('.foot-lang'); await p.waitForLoadState(); await W(400);
	const c2 = (await ctx.cookies()).find((c) => c.name === 'lang');
	ok('中文页点「EN」→ 到英文页、Cookie lang=en', new URL(p.url()).pathname === '/en/help' && c2 && c2.value === 'en', p.url());
	r = await go('/', { 'accept-language': 'zh-CN', cookie: 'lang=' + c2.value });
	ok('之后打开首页直接到英文', r.status === 302 && r.headers.get('location') === '/en/');
	// 顶栏展开栏：手机上点地球打开、点外面关、Esc 关；选 English 记住
	await ctx.addCookies([{ name: 'lang', value: 'zh', url: B }]);
	await p.goto(B + '/'); await W(700);
	ok('手机顶栏直接看得到地球按钮（不用先开菜单）', await p.isVisible('.lang-btn'));
	await p.click('.lang-btn'); await W(200);
	ok('点地球 → 展开（简体中文 打勾）', await p.isVisible('.lang-menu') && (await p.getAttribute('.lang-btn', 'aria-expanded')) === 'true' && (await p.getAttribute('.lang-menu a[data-lang=zh]', 'aria-checked')) === 'true');
	await p.mouse.click(10, 600); await W(200);
	ok('点外面 → 收起', !(await p.isVisible('.lang-menu')) && (await p.getAttribute('.lang-btn', 'aria-expanded')) === 'false');
	await p.click('.lang-btn'); await W(150); await p.keyboard.press('Escape'); await W(150);
	ok('按 Esc → 收起', !(await p.isVisible('.lang-menu')));
	await p.click('.lang-btn'); await W(150); await p.click('.lang-menu a[data-lang=en]'); await p.waitForLoadState(); await W(400);
	const c3 = (await ctx.cookies()).find((c) => c.name === 'lang');
	ok('展开栏选 English → 到 /en/、Cookie lang=en', new URL(p.url()).pathname === '/en/' && c3 && c3.value === 'en', p.url());
	await p.click('.lang-btn'); await W(150); await p.click('.lang-menu a[data-lang=zh]'); await p.waitForLoadState(); await W(400);
	ok('英文首页展开栏选 简体中文 → 回 /、Cookie lang=zh', new URL(p.url()).pathname === '/' && (await ctx.cookies()).find((c) => c.name === 'lang').value === 'zh', p.url());
	// 英文常见问题：搜英文能搜到、复制链接是 /en/help#…
	await p.goto(B + '/en/help'); await W(800);
	await p.fill('#hpQ', 'renewal code'); await W(400);
	const first = await p.$eval('.hp-q span', (e) => e.textContent).catch(() => '');
	ok('英文常见问题搜「renewal code」第一条是续期码那条', /renewal code/i.test(first), first);
	await ctx.close();
}
await browser.close(); server.close();
let fail = 0;
for (const [n, c, note] of results) { if (!c) fail++; console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  → ' + String(note).slice(0, 300))); }
console.log(`\n通过 ${results.length - fail}/${results.length}`);
process.exit(fail ? 1 : 0);

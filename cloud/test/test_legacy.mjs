// 旧内核手机浏览器（不认识 color-mix()、oklch(from…)、:has()、svh）打开官网：卡片不透明、打勾看得见、首页排版不塌
// 做法：把样式里这些新写法改成无效写法（旧浏览器就是这样整条丢掉的），再看页面
// 需要 Playwright：node test/test_legacy.mjs
import fs from 'fs';
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
import { applyLegacy, styleBlocks } from '../../tools/css-legacy.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);

// 1. 备用颜色表要覆盖所有样式（改了样式没重新算，就会漏）
{
	const dir = new URL('../site/', import.meta.url), T = JSON.parse(fs.readFileSync(new URL('legacy-colors.json', dir), 'utf8')), miss = [];
	const walk = (rel) => { for (const e of fs.readdirSync(new URL('k/' + rel, dir), { withFileTypes: true })) { const r = rel + e.name; if (e.isDirectory()) walk(r + '/'); else if (r.endsWith('.css')) applyLegacy(fs.readFileSync(new URL('k/' + r, dir), 'utf8'), T, miss); } };
	walk('');
	for (const f of ['index.html', 'app.html', 'reply.html', 'notice.html', 'terms.html', 'privacy.html', 'security.html', '_kit_head.html', '_kit_doc.html', '_kit_me.html'])
		for (const t of styleBlocks(fs.readFileSync(new URL(f, dir), 'utf8'))) applyLegacy(t, T, miss);
	ok('[备用颜色] 每条新颜色写法都算好了旧浏览器用的颜色（漏了就运行 node tools/gen-legacy-colors.mjs）', !miss.length, [...new Set(miss)].slice(0, 3).join(' ;; '));
}

const mod = await load();
{ const sj = fs.readFileSync(new URL('../site.js', import.meta.url), 'utf8'); ok('[打包] 页面里的 :has 编号已经填好', !sj.includes('/*HAS_ARGS*/[]') && /var A = \[\[0,/.test(sj)); }
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
globalThis.fetch = async () => new Response('{}');
const server = http.createServer(async (req, res) => {
	const r = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers }), env);
	const h = {}; r.headers.forEach((v, k) => { h[k] = v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8131, z));
const B = 'http://localhost:8131';
const breakCss = (t) => t.replace(/color-mix\(/g, 'xcolor-mix(').replace(/\b(oklch|oklab|lch|lab)\(from /g, 'x$1(from ').replace(/\b(oklch|oklab)\(/g, 'x$1(').replace(/:has\(/g, ':xhas(').replace(/(\d)(svh|dvh|lvh)\b/g, '$1xvh');
const browser = await chromium.launch();
const look = async (old) => {
	const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	if (old) {
		await c.addInitScript(() => { for (const P of [Element.prototype, Document.prototype, DocumentFragment.prototype]) for (const k of ['querySelector', 'querySelectorAll', 'matches', 'closest']) { const f = P[k]; if (!f) continue; P[k] = function (s) { if (/:has\(/.test(s)) throw new DOMException('bad selector', 'SyntaxError'); return f.apply(this, arguments); }; } });
		await c.route('**/*', async (r) => { const res = await r.fetch(); const ct = res.headers()['content-type'] || ''; if (/text\/(html|css)/.test(ct)) return r.fulfill({ response: res, body: breakCss(await res.text()) }); return r.fulfill({ response: res }); });
	}
	const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
	await p.goto(B + '/'); await p.waitForTimeout(1500);
	await p.evaluate(() => document.querySelector('#features').scrollIntoView()); await p.waitForTimeout(1500);
	const r = await p.evaluate(() => {
		const a = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return s.includes('oklab') || s.includes('color(') ? 1 : 0; const v = m[1].split(/[ ,/]+/).filter(Boolean); return v.length > 3 ? +v[3] : 1; };
		const card = getComputedStyle(document.querySelector('.ly-piece--speed')).backgroundColor;
		const box = document.querySelector('.ui-check.is-done .ui-check__box'), cs = getComputedStyle(box);
		const art = document.querySelector('.hero__art').getBoundingClientRect().height;
		const sec = getComputedStyle(document.querySelector('.hero .btn--secondary')).backgroundColor;
		return { card: a(card), tick: cs.color !== cs.backgroundColor, tickc: cs.color, boxc: cs.backgroundColor, art, sec: a(sec), hasMarks: document.querySelectorAll('[data-h0],[data-h1],[data-h2],[data-h3],[data-h4],[data-h5]').length };
	});
	await p.goto(B + '/app#login'); await p.waitForTimeout(1200);
	r.tabPill = await p.evaluate(() => getComputedStyle(document.querySelector('#lgCard .tabs'), '::before').opacity);
	await c.close();
	return { ...r, errs };
};
const NEW = await look(false), OLD = await look(true);
ok('[新浏览器] 不受影响：没有 data-h 标记（只有旧浏览器才标）', NEW.hasMarks === 0, JSON.stringify(NEW));
ok('[新浏览器] 登录页「登录 / 注册」切换的绿色滑块看得见（补给旧浏览器的规则不能影响新浏览器）', NEW.tabPill === '1', NEW.tabPill);
ok('[旧浏览器] 登录页切换滑块也看得见', OLD.tabPill === '1', OLD.tabPill);
ok('[旧浏览器] 首屏「实时网速」卡片不透明', OLD.card > 0.5, JSON.stringify(OLD));
ok('[旧浏览器] 看门狗检查的勾看得见（勾和底色不一样）', OLD.tick, OLD.tickc + ' / ' + OLD.boxc);
ok('[旧浏览器] 首屏手机截图区域没塌（和新浏览器差不多高）', Math.abs(OLD.art - NEW.art) < 40, OLD.art + ' / ' + NEW.art);
ok('[旧浏览器] 「看怎么装」按钮有底色', OLD.sec > 0.5, JSON.stringify(OLD));
ok('[旧浏览器] 页面没有报错', !OLD.errs.length, OLD.errs.join(' | '));
ok('[旧浏览器] 不认识 :has 时，补的规则用上了（有元素被标记）', OLD.hasMarks > 0, String(OLD.hasMarks));
await browser.close(); server.close();
console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 300) + '）')).join('\n'));
const pass = results.filter((r) => r[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

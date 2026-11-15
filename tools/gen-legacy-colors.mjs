// 算出旧内核浏览器用的备用颜色，写进 cloud/site/legacy-colors.json（见 tools/css-legacy.mjs 的说明）。
// 改了官网的样式（cloud/site/*.html 里的 <style>、cloud/site/k/ 下的 css）以后，在本机运行一次：
//   1. 起一个本地官网（cloud/test 里的测试服务器就行），比如 http://localhost:8199
//   2. node tools/gen-legacy-colors.mjs http://localhost:8199
// 用新版 Chromium（Playwright）打开每个页面，在每条样式实际作用的元素上算出颜色，换成 rgb/rgba。
import fs from 'fs';
import { createRequire } from 'module';
import { parse, rules, NEEDS, keyOf } from './css-legacy.mjs';
const { chromium } = createRequire(new URL('../cloud/test/', import.meta.url))('playwright');
const B = process.argv[2] || 'http://localhost:8199';
const OUT = new URL('../cloud/site/legacy-colors.json', import.meta.url);
const PAGES = ['/', '/app', '/notice', '/terms', '/privacy', '/security', '/r', '/r?c=K7F2Q9AB'];

// 在页面里运行：给每条样式找一个它作用的元素，放一个探针进去算出值，再把新颜色写法换成 rgb/rgba
function evaluate(items) {
	const cv = document.createElement('canvas'); cv.width = cv.height = 1; const g = cv.getContext('2d', { willReadFrequently: true });
	const f3 = (x) => +x.toFixed(3);
	const out8 = (r, gg, b, a) => { const c = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255); a = a == null ? 1 : Math.min(1, Math.max(0, a)); return a >= 0.999 ? `rgb(${c(r)}, ${c(gg)}, ${c(b)})` : `rgba(${c(r)}, ${c(gg)}, ${c(b)}, ${f3(a)})`; };
	const enc = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
	const oklab = (L, a, b, al) => { const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b; const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3; return out8(enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), enc(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s), al); };
	const num = (t, pct = 1) => (t.endsWith('%') ? parseFloat(t) / 100 * pct : t === 'none' ? 0 : parseFloat(t));
	const canvasColor = (c) => { g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = c; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return d[3] === 255 ? `rgb(${d[0]}, ${d[1]}, ${d[2]})` : `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${f3(d[3] / 255)})`; };
	const conv = (fn) => {
		const m = /^([a-z]+)\((.*)\)$/.exec(fn); if (!m) return fn;
		const [body, al] = m[2].split('/').map((x) => x.trim()); const p = body.split(/\s+/); const A = al == null ? 1 : num(al);
		if (m[1] === 'oklab') return oklab(num(p[0]), num(p[1], 0.4), num(p[2], 0.4), A);
		if (m[1] === 'oklch') { const L = num(p[0]), C = num(p[1], 0.4), h = (parseFloat(p[2]) || 0) * Math.PI / 180; return oklab(L, C * Math.cos(h), C * Math.sin(h), A); }
		if (m[1] === 'color' && p[0] === 'srgb') return out8(num(p[1]), num(p[2]), num(p[3]), A);
		if (m[1] === 'color' && p[0] === 'srgb-linear') return out8(enc(num(p[1])), enc(num(p[2])), enc(num(p[3])), A);
		return canvasColor(fn);
	};
	const fix = (s) => s.replace(/\b(?:oklab|oklch|lab|lch|color)\([^()]*\)/g, conv);
	const strip = (s) => s.replace(/::?(?:before|after|placeholder|selection|marker|backdrop|first-line|first-letter|-webkit-[a-z-]+|-moz-[a-z-]+)(?:\([^)]*\))?/g, '').replace(/:(?:hover|focus-visible|focus-within|focus|active|visited|checked|disabled|enabled|placeholder-shown|target|open)\b/g, '').trim();
	const split = (s) => { const r = []; let d = 0, a = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (c === ',' && !d) { r.push(s.slice(a, i)); a = i + 1; } } r.push(s.slice(a)); return r.map((x) => x.trim()).filter(Boolean); };
	const find = (sel) => { if (/^(from|to|\d)/.test(sel)) return null; for (const s of split(sel)) { const t = strip(s).replace(/>\s*$/, '').trim() || ':root'; try { const e = document.querySelector(t); if (e) return e; } catch (e) {} } return null; };
	const SENT = 'rgb(1, 2, 3)';
	const res = {};
	for (const it of items) {
		const el = find(it.sel), host = el && !['IMG', 'INPUT', 'TEXTAREA', 'SELECT', 'BR', 'HR', 'svg', 'path', 'circle', 'rect', 'IFRAME', 'CANVAS', 'VIDEO'].includes(el.tagName) && el.namespaceURI === 'http://www.w3.org/1999/xhtml' ? el : (el && el.parentElement) || document.body;
		const w = document.createElement('div'); w.style.cssText = `color:${SENT};position:absolute;visibility:hidden;pointer-events:none`;
		const p = document.createElement('div'); w.appendChild(p); host.appendChild(w);
		if (el && el !== host) for (const k of Array.from(getComputedStyle(el))) if (k.startsWith('--')) p.style.setProperty(k, getComputedStyle(el).getPropertyValue(k));
		for (const [k, v] of it.customs) p.style.setProperty(k, v);
		if (it.colorDecl) p.style.setProperty('color', it.colorDecl);
		let val = '';
		try {
			if (it.prop.startsWith('--')) {
				p.style.setProperty(it.prop, it.value);
				for (const t of /gradient\(/.test(it.value) ? ['background-image', 'color', 'box-shadow'] : ['color', 'box-shadow', 'background-image', 'border', 'filter']) {
					p.style.setProperty(t, `var(${it.prop})`);
					const v = getComputedStyle(p).getPropertyValue(t);
					p.style.removeProperty(t);
					if (v && v !== SENT && v !== 'none' && !(t === 'border' && /^0px none/.test(v))) { val = v; break; }
				}
			} else {
				p.style.setProperty(it.prop, it.value);
				val = getComputedStyle(p).getPropertyValue(it.prop);
				if (!val && it.prop === 'background') val = ['background-color', 'background-image'].map((k) => getComputedStyle(p).getPropertyValue(k)).join(' ');
				if (it.prop === 'color' && val === SENT) val = '';
			}
		} catch (e) { val = ''; }
		w.remove();
		val = val ? fix(val) : '';
		res[it.key] = { val: val && !/color-mix\(|\b(?:ok)?l(?:ab|ch)\(|\bcolor\(/.test(val) ? val : '-', hit: !!el };
	}
	return res;
}

const table = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const found = {}, hit = {};
const b = await chromium.launch();
for (const [w, h] of [[390, 844], [1366, 900]]) {
	const c = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 640 });
	const p = await c.newPage();
	for (const u of PAGES) {
		await p.goto(B + u, { waitUntil: 'load' }); await p.waitForTimeout(800);
		const H = await p.evaluate(() => document.documentElement.scrollHeight);
		for (let y = 0; y < H; y += h * 0.8) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(150); }
		await p.waitForTimeout(500);
		// 拿到这个页面所有的样式原文：<style> 里的、/k/ 下 <link> 进来的（包括组件按需加载的）
		const texts = await p.evaluate(async () => { const out = []; for (const s of document.styleSheets) { const n = s.ownerNode; if (!n) continue; if (n.tagName === 'STYLE') out.push(n.textContent); else if (n.href && n.href.startsWith(location.origin)) out.push(await (await fetch(n.href)).text()); } return out; });
		const items = [], seen = new Set();
		for (const t of texts) for (const r of rules(parse(t))) {
			const customs = r.decls.filter((d) => d.prop.startsWith('--')).map((d) => [d.prop, d.value]);
			const colorDecl = (r.decls.find((d) => d.prop === 'color') || {}).value;
			for (const d of r.decls) { if (!NEEDS.test(d.value)) continue; const key = keyOf(r, d); if (seen.has(key) || hit[key]) continue; seen.add(key); items.push({ key, sel: r.sel, prop: d.prop, value: d.value, customs, colorDecl }); }
		}
		const res = await p.evaluate(evaluate, items);
		for (const [k, v] of Object.entries(res)) { if (v.hit || !found[k]) found[k] = v.val; if (v.hit) hit[k] = 1; }
		console.log(w, u, '样式', items.length, '条');
	}
	await c.close();
}
await b.close();
const keys = Object.keys(found).sort();
const next = {}; for (const k of keys) next[k] = found[k];
// 以前算过、这次页面上没出现的（比如登录以后才有的）保留
for (const [k, v] of Object.entries(table)) if (!(k in next)) next[k] = v;
fs.writeFileSync(OUT, JSON.stringify(next, null, 1) + '\n');
console.log('写好了', Object.keys(next).length, '条；找到元素的', Object.keys(hit).length, '条；算不出来的', Object.values(next).filter((v) => v === '-').length, '条');

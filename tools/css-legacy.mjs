// 旧内核浏览器（Chrome 111 以前，很多手机自带浏览器、套壳浏览器还是这个内核）不认识 color-mix()、oklch()、
// 「oklch(from …)」这类新颜色写法：整条样式被丢掉，卡片背景变透明、白底白勾。
// 这里把每条用了新写法的样式，在前面补一条算好的普通颜色（rgb/rgba）：
//   普通属性：  background: rgba(…);  background: color-mix(…);   新浏览器用后一条，旧浏览器用前一条
//   自定义变量，和带 var() 的值：旧浏览器读的时候都当成「合法」，后一条会盖掉前一条，所以改成紧跟在这条规则后面加
//               @supports not (color: color-mix(in srgb, red, red)) { 同样的选择器 { --x: rgba(…) } }
// 算好的颜色在 cloud/site/legacy-colors.json（用 node tools/gen-legacy-colors.mjs 在本机用新浏览器算出来的）。
export const NEEDS = /color-mix\(|\b(?:ok)?l(?:ab|ch)\(/i;
export const SUPPORTS_NOT = '@supports not (color: color-mix(in srgb, red, red))';

// 很小的 CSS 解析：只认规则、@ 块、声明；跳过注释、字符串、括号里的内容（data: 网址里有分号）
export function parse(css) {
	const root = { type: 'root', children: [], ctx: [] };
	const stack = [root];
	let seg = 0, depth = 0;
	const top = () => stack[stack.length - 1];
	const addDecl = (a, b) => {
		const node = top(); if (node.type !== 'rule') return;
		const raw = css.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length)); if (!raw.trim()) return;
		let d = 0, q = '', k = -1;
		for (let j = 0; j < raw.length; j++) { const c = raw[j]; if (q) { if (c === '\\') j++; else if (c === q) q = ''; continue; } if (c === '"' || c === "'") q = c; else if (c === '(') d++; else if (c === ')') d--; else if (c === ':' && d === 0) { k = j; break; } }
		if (k < 0) return;
		const lead = raw.length - raw.trimStart().length;
		let value = raw.slice(k + 1).trim(), important = false;
		const m = /\s*!\s*important\s*$/i.exec(value); if (m) { important = true; value = value.slice(0, m.index).trim(); }
		value = value.replace(/\/\*[\s\S]*?\*\//g, '').trim();
		node.decls.push({ prop: raw.slice(0, k).replace(/\/\*[\s\S]*?\*\//g, '').trim(), value, important, start: a + lead, end: b });
	};
	for (let i = 0; i < css.length; i++) {
		const c = css[i];
		if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 1; continue; }
		if (c === '"' || c === "'") { for (i++; i < css.length && css[i] !== c; i++) if (css[i] === '\\') i++; continue; }
		if (c === '(') { depth++; continue; }
		if (c === ')') { depth = Math.max(0, depth - 1); continue; }
		if (depth) continue;
		if (c === '{') {
			const prelude = css.slice(seg, i).replace(/\/\*[\s\S]*?\*\//g, '').trim();
			const parent = top();
			const node = prelude.startsWith('@') && !/^@(font-face|page)\b/.test(prelude)
				? { type: 'at', prelude, children: [], ctx: [...parent.ctx, prelude], start: i }
				: { type: 'rule', sel: prelude, decls: [], ctx: parent.ctx, start: i };
			(parent.children || []).push(node); stack.push(node); seg = i + 1;
		} else if (c === ';') { addDecl(seg, i); seg = i + 1; }
		else if (c === '}') { addDecl(seg, i); const n = stack.pop(); if (n) n.end = i + 1; seg = i + 1; if (!stack.length) stack.push(root); }
	}
	return root;
}
export function* rules(node) { for (const n of node.children || []) { if (n.type === 'rule') yield n; else yield* rules(n); } }
export const keyOf = (r, d) => [r.ctx.join(' / '), r.sel.replace(/\s+/g, ' '), d.prop, d.value.replace(/\s+/g, ' ')].join(' | ');

// 旧内核也不认识 svh / dvh / lvh（手机地址栏高度）：补一条换成 vh 的
const VH = /(\d)(svh|dvh|lvh)\b/;
const SUPPORTS_NO_SVH = '@supports not (height: 1svh)';

// 旧内核（Chrome 105 以前）不认识 :has()：整条规则被丢掉。做法：
//   每个 :has(…) 里的条件编一个号 N，样式里紧跟原规则补一条把 :has(…) 换成 [data-hN] 的同样规则；
//   页面里一小段脚本（只在不认识 :has 的浏览器里跑）把满足条件的元素标上 data-hN（页面变化时重新标）。
//   新浏览器不会有 data-hN，补的规则不起作用。
function hasArgs(sel, has, out) {
	let res = '', i = 0;
	while (i < sel.length) {
		const k = sel.indexOf(':has(', i);
		if (k < 0) { res += sel.slice(i); break; }
		res += sel.slice(i, k);
		let d = 0, j = k + 4;
		for (; j < sel.length; j++) { if (sel[j] === '(') d++; else if (sel[j] === ')') { d--; if (!d) break; } }
		const inner = hasArgs(sel.slice(k + 5, j), has, out).trim();
		let id = has.map.get(inner);
		if (id == null) { id = has.list.length; has.map.set(inner, id); has.list.push([id, inner]); }
		res += `[data-h${id}]`;
		i = j + 1;
	}
	return res;
}
export const hasRewrite = (sel, has) => hasArgs(sel, has);
// 补的规则只在不认识 :has 的浏览器里生效：那时小脚本会给 <html> 加 data-nohas。
// 不然像 :not(:has(…)) 换成 :not([data-hN]) 以后，新浏览器里永远成立，会把原来的样式盖掉
function splitList(s) { const r = []; let d = 0, a = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (c === ',' && !d) { r.push(s.slice(a, i)); a = i + 1; } } r.push(s.slice(a)); return r.map((x) => x.trim()).filter(Boolean); }
export function noHasOnly(sel) {
	return splitList(sel).map((x) => {
		const m = /^(:root|html)(?![\w-])/.exec(x);
		return m ? ':root[data-nohas]' + x.slice(m[0].length) : ':root[data-nohas] ' + x;
	}).join(', ');
}
export function hasScan(css, has) { for (const r of rules(parse(css))) if (r.sel.includes(':has(')) hasArgs(r.sel, has); }

// 按算好的表改写一段 CSS；misses 收集表里没有的（CSS 改了以后要重新算）
export function applyLegacy(css, table, misses, has) {
	css = applyColors(css, table, misses);
	if (!has) return css;
	const edits = [];
	for (const r of rules(parse(css))) if (r.sel.includes(':has(')) edits.push([r.end, `\n${noHasOnly(hasArgs(r.sel, has))} ${css.slice(r.start, r.end)}\n`]);
	edits.sort((a, b) => b[0] - a[0]);
	for (const [at, text] of edits) css = css.slice(0, at) + text + css.slice(at);
	return css;
}
function applyColors(css, table, misses) {
	const edits = [];
	for (const r of rules(parse(css))) {
		if (/^(from|to|\d)/.test(r.sel) && r.ctx.some((c) => /^@(-webkit-)?keyframes/.test(c))) {
			// 动画关键帧里只能补普通属性
		}
		const custom = [];
		for (const d of r.decls) {
			if (!NEEDS.test(d.value)) continue;
			const fb = table[keyOf(r, d)];
			if (!fb) { if (misses) misses.push(keyOf(r, d)); continue; }
			if (fb === '-') continue; // 算不出来（比如只在某些状态下才有意义），保持原样
			// 有 var() 的值，旧浏览器读样式时不会丢掉（要等用的时候才发现不认识，那时已经盖掉了前一条），所以也放进 @supports 块
			const inKf = r.ctx.some((c) => /^@(-webkit-)?keyframes/.test(c));
			if (!inKf && (d.prop.startsWith('--') || /var\(/.test(d.value))) custom.push(`${d.prop}: ${fb}${d.important ? ' !important' : ''}`);
			else if (!d.prop.startsWith('--')) edits.push([d.start, `${d.prop}: ${fb}${d.important ? ' !important' : ''}; `]);
		}
		if (custom.length && !r.ctx.some((c) => /^@(-webkit-)?keyframes/.test(c))) edits.push([r.end, `\n${SUPPORTS_NOT} { ${r.sel} { ${custom.join('; ')} } }\n`]);
		// svh → vh
		const vh = [];
		for (const d of r.decls) {
			if (!VH.test(d.value) || NEEDS.test(d.value) || d.prop.startsWith('--') && !/^-?[\d.]+[sdl]vh$/.test(d.value)) continue;
			const fb = d.value.replace(/(\d)(svh|dvh|lvh)\b/g, '$1vh');
			if (/var\(/.test(d.value) || d.prop.startsWith('--')) vh.push(`${d.prop}: ${fb}${d.important ? ' !important' : ''}`);
			else edits.push([d.start, `${d.prop}: ${fb}${d.important ? ' !important' : ''}; `]);
		}
		if (vh.length && !r.ctx.some((c) => /^@(-webkit-)?keyframes/.test(c))) edits.push([r.end, `\n${SUPPORTS_NO_SVH} { ${r.sel} { ${vh.join('; ')} } }\n`]);
	}
	edits.sort((a, b) => b[0] - a[0]);
	for (const [at, text] of edits) css = css.slice(0, at) + text + css.slice(at);
	return css;
}
// 页面里的 <style>…</style> 一段一段改
export const applyLegacyHtml = (html, table, misses, has) => html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (m, a, b, c) => a + applyLegacy(b, table, misses, has) + c);
export const styleBlocks = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);

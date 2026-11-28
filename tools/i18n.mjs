// 官网英文页（总表 #102，用户 11/28 21:47 定）：中文页面只有一份，打包时按 cloud/site/i18n/en.json 的对照表生成英文页。
// 切法：页面里含中文的「一段话」= 一串连着的文字（中文、英文字母、数字、空格和常见标点），遇到 < > " ' ` = { } \ $ 就断开；
// HTML 注释、脚本和样式里的注释跳过（注释里的中文不算，也不改）。每段去掉首尾空白、中间的空白缩成一个空格，拿去整段查表。
// 表里没有的段：打包失败并列出来（中文改了英文没跟上，不会上线半中半英的页面）。
// 表里的英文不许有 ' " `（会弄坏脚本里的字符串和属性），引号用 “ ” ’。表里写成跟中文一样 = 故意不翻（脚本里拿来比对服务器回的中文提示的那种）。
const HAN = /[㐀-鿿豈-﫿]/;
const CJKP = /[　-〿＀-￯]/;
// 一段话里能有的字符
const RUN = /[　-〿㐀-鿿豈-﫿＀-￯A-Za-z0-9 \t\r\n.,:;!?()\[\]%+\-\/&#*_~@^| -ÿ‐-‧‰-⁯←-⇿∀-⋿①-⓿─-╿■-◿☀-➿]+/g;
export const norm = (s) => s.replace(/\s+/g, ' ').trim();

// 跳过的区间：HTML 注释；<script> 里的 // 和 /* */ 注释（要认得字符串、模板、正则，免得把字符串里的 // 当注释）；<style> 里的 /* */
export function skipRanges(html) {
	const out = [];
	for (const m of html.matchAll(/<!--[\s\S]*?-->/g)) out.push([m.index, m.index + m[0].length]);
	for (const m of html.matchAll(/(<script\b[^>]*>)([\s\S]*?)<\/script>/gi)) {
		// 脚本里只有字符串、模板的字算（代码、注释、正则一律跳过）：先找出字符串的区间，其余的都是跳过区间
		const base = m.index + m[1].length, keep = [];
		jsLex(m[2], base, keep);
		let at = base;
		for (const [a, b] of keep.sort((x, y) => x[0] - y[0])) { if (a > at) out.push([at, a]); at = Math.max(at, b); }
		if (at < base + m[2].length) out.push([at, base + m[2].length]);
	}
	for (const m of html.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style>/gi)) for (const c of m[2].matchAll(/\/\*[\s\S]*?\*\//g)) out.push([m.index + m[1].length + c.index, m.index + m[1].length + c.index + c[0].length]);
	return out.sort((a, b) => a[0] - b[0]);
}
// 简单的 JS 词法：记下字符串和模板里文字的区间（keep），注释、正则、代码都不算
function jsLex(s, base, out) {
	let i = 0, prev = '';
	const n = s.length;
	const tpl = () => { // 已经过了开头的 `，读到结尾的 `（${…} 里面递归）；每一段文字记进 out
		let st = i;
		while (i < n) {
			const c = s[i];
			if (c === '\\') { i += 2; continue; }
			if (c === '`') { out.push([base + st, base + i]); i++; return; }
			if (c === '$' && s[i + 1] === '{') { out.push([base + st, base + i]); i += 2; code('}'); i++; st = i; continue; }
			i++;
		}
	};
	const code = (end) => {
		let depth = 0;
		while (i < n) {
			const c = s[i];
			if (end && c === '}' && depth === 0) return;
			if (c === '{') depth++;
			else if (c === '}') depth--;
			if (c === '/' && s[i + 1] === '/') { const j = s.indexOf('\n', i); i = j < 0 ? n : j; continue; }
			if (c === '/' && s[i + 1] === '*') { const j = s.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
			if (c === '"' || c === "'") { const q = c, st = ++i; while (i < n && s[i] !== q && s[i] !== '\n') { if (s[i] === '\\') i++; i++; } out.push([base + st, base + i]); i++; prev = 'x'; continue; }
			if (c === '`') { i++; tpl(); prev = 'x'; continue; }
			if (c === '/') {
				// 正则字面量：前一个有意义的字符是运算符、括号开头、逗号这类，或者 return / typeof 这类词后面
				if (!prev || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /\b(return|typeof|case|in|of|delete|void|throw|new)$/.test(s.slice(Math.max(0, i - 8), i).trimEnd())) {
					i++; let cls = false;
					while (i < n && s[i] !== '\n') { const d = s[i]; if (d === '\\') { i += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; i++; }
					i++; while (i < n && /[a-z]/i.test(s[i])) i++;
					prev = 'x'; continue;
				}
			}
			if (!/\s/.test(c)) prev = c;
			i++;
		}
	};
	code(null);
}

// 页面里所有含中文的段：[{ s: 开始, e: 结束（不含首尾空白）, k: 查表用的 }]
export function segments(html) {
	const skip = skipRanges(html), segs = [];
	const add = (s, t) => {
		if (!HAN.test(t) && !CJKP.test(t)) return;
		const lead = t.length - t.trimStart().length, core = t.trim();
		if (core) segs.push({ s: s + lead, e: s + lead + core.length, k: norm(core) });
	};
	let si = 0;
	for (const m of html.matchAll(RUN)) {
		let s = m.index; const e = m.index + m[0].length;
		while (si < skip.length && skip[si][1] <= s) si++;
		// 被跳过区间切开：只要区间外面的部分
		for (let j = si; j < skip.length && skip[j][0] < e; j++) {
			if (skip[j][0] > s) add(s, html.slice(s, skip[j][0]));
			s = Math.max(s, skip[j][1]);
		}
		if (s < e) add(s, html.slice(s, e));
	}
	return segs;
}

// 中文在加粗、链接、代码前后不用空格，英文要：紧挨着 </b> </a> </code> 这类结束标签的段前面补一个空格，紧挨着 <b> <a> <code> 开始标签的段后面补一个（表里已经写了空格、标点开头结尾的不补）
const INL = 'b|a|code|strong|em';
const CLOSE_BEFORE = new RegExp('</(?:' + INL + ')>$'), OPEN_AFTER = new RegExp('^<(?:' + INL + ')[\\s>]');
export function gap(html, g, v) {
	if (/^[A-Za-z0-9(“]/.test(v) && CLOSE_BEFORE.test(html.slice(Math.max(0, g.s - 10), g.s))) v = ' ' + v;
	if (/[A-Za-z0-9:;,.)”’]$/.test(v) && OPEN_AFTER.test(html.slice(g.e, g.e + 10))) v += ' ';
	return v;
}

// 按表把一页换成英文。miss 收集表里没有的段
export function translate(html, dict, miss, page) {
	const segs = segments(html);
	let out = '', last = 0;
	for (const g of segs) {
		const v = dict[g.k];
		if (v == null) { miss.push((page ? page + '：' : '') + g.k); continue; }
		out += html.slice(last, g.s) + gap(html, g, v);
		last = g.e;
	}
	return out + html.slice(last);
}

// 对照表本身的检查：英文里不许有 ' " `；中文只许出现在括号里（面板只有中文：菜单名后面带中文原名，比如 My page (我的主页)，用户 11/28 22:4x 定）
export const zhOutside = (v) => HAN.test(v.replace(/\([^()]*\)/g, ''));
export function checkDict(dict) {
	const bad = [];
	for (const [k, v] of Object.entries(dict)) if (typeof v !== 'string' || /['"`]/.test(v) || (v !== k && zhOutside(v))) bad.push(k);
	return bad;
}

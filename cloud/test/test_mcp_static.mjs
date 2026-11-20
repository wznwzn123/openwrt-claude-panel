// 路由器程序（src/mcp/*.uc 按文件名顺序拼成一个文件）的静态检查：
// 后面文件里才声明的变量 / 函数，不能在前面的文件里用（ucode 编译时认不出，运行到那一行才报「undeclared variable」）
// 5.2.2 的「网站访问」检测就是这样坏掉的：22-openclash.uc 用了 26-backup.uc 里才声明的 ROLE
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/mcp');
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const BUILTIN = new Set(['int', 'print', 'length', 'index', 'type', 'keys', 'values', 'push', 'pop', 'join', 'split', 'match', 'replace', 'json', 'sprintf', 'time', 'die', 'exists', 'filter', 'map', 'sort', 'substr', 'trim', 'ltrim', 'rtrim', 'lc', 'uc', 'min', 'max', 'require', 'include', 'render', 'call', 'signal', 'sleep', 'system', 'hex', 'chr', 'ord', 'reverse', 'slice', 'splice', 'unshift', 'shift', 'uniq', 'b64enc', 'b64dec', 'localtime', 'gmtime', 'timelocal', 'timegm', 'clock', 'iptoarr', 'arrtoip', 'wildcard', 'regexp', 'assert', 'warn', 'exit', 'getenv', 'proto', 'sourcepath', 'loadstring', 'loadfile', 'gc']);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, "''")
	.replace(/([(,=:!&|?]\s*)\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^\/\n\\[])+\/[gimsu]*/g, '$1/re/');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.uc')).sort();
const decl = files.map((f) => {
	const s = strip(fs.readFileSync(path.join(dir, f), 'utf8')), names = new Set();
	for (const m of s.matchAll(/^(?:let|const)\s+([^;]+)/gm)) for (const p of m[1].split(',')) { const n = /^\s*([A-Za-z_$][\w$]*)\s*(=|$)/.exec(p); if (n) names.add(n[1]); }
	for (const m of s.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
	return { f, s, names };
});
const bad = [];
decl.forEach((d, i) => {
	for (const n of d.names) {
		if (BUILTIN.has(n)) continue;
		for (let j = 0; j < i; j++) {
			if (decl[j].names.has(n)) continue;
			const e = n.replace(/\$/g, '\\$');
			// 用到：前面不是字母、点；后面不是字母，也不是「名字:」这种对象键
			const re = new RegExp('(?<![\\w$.])' + e + '(?![\\w$])(?!\\s*:(?!:))');
			const decl1 = new RegExp('^\\s*(let|const)\\s+([^;]*[,\\s])?' + e + '\\s*=');
			const hit = decl[j].s.split('\n').find((l) => re.test(l) && !decl1.test(l));
			if (hit) bad.push(`${n}（${d.f} 声明，${decl[j].f} 先用：${hit.trim().slice(0, 80)}）`);
		}
	}
});
ok('[路由器程序] 没有「先用后声明」的变量（会在运行时报 undeclared variable）', !bad.length, bad.join('；'));
console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 600) + '）')).join('\n'));
const pass = results.filter((x) => x[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

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
// 反过来：顶层声明了跟内置函数同名的变量（比如 30-plugin-switch.uc 的 int = 参数说明），它后面的代码再调这个内置函数就会调错（6.0 第 15 项踩过）
const shadow = [];
decl.forEach((d, i) => {
	for (const n of d.names) {
		if (!BUILTIN.has(n)) continue;
		const at = d.s.split('\n').findIndex((l) => new RegExp('^(?:let|const)\\s+([^;]*[,\\s])?' + n + '\\s*=').test(l));
		const later = [d.s.split('\n').slice(at + 1).join('\n'), ...decl.slice(i + 1).map((x) => x.s)];
		const re = new RegExp('(?<![\\w$.])' + n + '\\s*\\((?![^)]*\\)\\s*=>)');
		// 同名变量自己的用法（int('说明')）算正常：只看传数字算式的
		for (const s of later) { const hit = s.split('\n').find((l) => re.test(l) && !new RegExp(n + "\\(''").test(l)); if (hit) shadow.push(`${n}（${d.f} 里改成了别的东西，后面还当内置函数用：${hit.trim().slice(0, 80)}）`); }
	}
});
ok('[路由器程序] 内置函数被同名变量盖住以后，后面没再当内置函数用', !shadow.length, shadow.join('；'));
// 11/28：拼好的路由器程序和 src/bin 下的 ucode 小工具都要能编译（一处注释把后面的 } 吃掉了，上面两项检查都没发现，接口全挂）。要 UCODE 才查
if (process.env.UCODE) {
	const { spawnSync } = await import('child_process');
	const bins = fs.readdirSync(path.join(dir, '../bin')).filter((f) => /^#!\/usr\/bin\/ucode/.test(fs.readFileSync(path.join(dir, '../bin', f), 'utf8')));
	const bad = [];
	for (const f of [path.join(dir, '../www/cgi-bin/mcp'), ...bins.map((b) => path.join(dir, '../bin', b))]) {
		const r = spawnSync('sh', ['-c', process.env.UCODE + ' -c -o /dev/null ' + JSON.stringify(f)], { encoding: 'utf8' });
		if (r.status !== 0) bad.push(path.basename(f) + '：' + (r.stderr || r.stdout).split('\n').slice(0, 2).join(' '));
	}
	ok(`[路由器程序] 拼好的接口程序和 ${bins.length} 个 ucode 小工具都能编译`, !bad.length, bad.join('；'));
}
console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 600) + '）')).join('\n'));
const pass = results.filter((x) => x[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

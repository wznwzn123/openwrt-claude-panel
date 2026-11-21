// 官网后台的代码检查：路由代码拿到的 Durable Object 是远程句柄（只能调方法），不能直接读它的存储（xx.ctx）、环境（xx.env）。
// 测试里拿到的是对象本身，这样写测试照样过，上线就报「出错了」——管理后台的「邮件记录」「出错记录」就是这样坏的（6.0 第 65 项）。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, "''");
const bad = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'site.js' && x !== 'changelog.js' && x !== 'faq-default.js')) {
	const lines = strip(fs.readFileSync(path.join(dir, f), 'utf8')).split('\n');
	lines.forEach((l, i) => { for (const m of l.matchAll(/\b(H|w|W|hub|stub)\.(ctx|env)\b|\)\.(ctx|env)\b/g)) bad.push(`${f}:${i + 1} ${l.trim().slice(0, 90)}`); });
}
ok('路由代码不直接读 Durable Object 的 ctx / env（只调它的方法）', !bad.length, bad.join('；'));
console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 800) + '）')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

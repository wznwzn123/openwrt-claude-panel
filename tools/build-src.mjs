// 把拆开的源文件拼回路由器上用的两个文件（拼出来跟拆开前一模一样，功能不变）：
//   src/panel/*  → src/www/panel/index.html   （面板：页头、样式、页面结构、各页面的脚本）
//   src/mcp/*    → src/www/cgi-bin/mcp         （路由器服务：工具、各页面的接口）
// 按文件名顺序拼接。改面板或路由器服务时改 src/panel、src/mcp 里的文件，再运行：
//   node tools/build-src.mjs          生成
//   node tools/build-src.mjs --check  只检查生成的文件是不是最新的（打包、发布前会检查）
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const jobs = [
	{ dir: 'src/panel', out: 'src/www/panel/index.html', mode: 0o644 },
	{ dir: 'src/mcp', out: 'src/www/cgi-bin/mcp', mode: 0o755 },
];
const check = process.argv.includes('--check');
let bad = 0;
for (const j of jobs) {
	const dir = path.join(root, j.dir);
	const files = fs.readdirSync(dir).filter((f) => /^\d\d-.+\.(html|css|js|uc)$/.test(f)).sort();
	const text = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
	const out = path.join(root, j.out);
	const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
	if (check) {
		if (cur !== text) { console.error(`✗ ${j.out} 不是最新的：改了 ${j.dir} 以后要运行 node tools/build-src.mjs`); bad++; }
		else console.log(`✓ ${j.out}（${files.length} 个源文件）`);
		continue;
	}
	if (cur !== text) fs.writeFileSync(out, text);
	fs.chmodSync(out, j.mode);
	console.log(`${j.out}：${files.length} 个源文件，${Buffer.byteLength(text)} 字节${cur === text ? '（没变）' : ''}`);
}
process.exit(bad ? 1 : 0);

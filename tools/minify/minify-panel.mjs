// 打包时精简面板（只改打进安装包的那一份，仓库里的源文件不动）：
//   index.html：样式和脚本去掉空白、注释，脚本里的局部变量名缩短；页面结构只去掉行首缩进和注释
//   qr.js：同样精简
// 不改变任何行为：不降级语法、不改字符串和模板里的内容。
// 用法：node tools/minify/minify-panel.mjs <面板目录>     （例如打包目录里的 src/www/panel）
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'index.html'))) { console.error('用法：node minify-panel.mjs <面板目录>'); process.exit(2); }
const MANGLE = process.env.PANEL_MANGLE !== '0';
const js = async (code) => (await esbuild.transform(code, { loader: 'js', target: 'esnext', minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: MANGLE, legalComments: 'none', charset: 'utf8' })).code.replace(/\n$/, '');
const css = async (code) => (await esbuild.transform(code, { loader: 'css', minify: true, charset: 'utf8', target: ['chrome80', 'safari14', 'firefox78'] })).code.replace(/\n$/, '');

const f = path.join(dir, 'index.html');
const src = fs.readFileSync(f, 'utf8');
let out = '', i = 0;
const re = /<(script|style)(\s[^>]*)?>([\s\S]*?)<\/\1>/g;
let m;
const html = (h) => h.replace(/<!--(?!\[)[\s\S]*?-->/g, '').replace(/\n[ \t]+/g, '\n').replace(/\n{2,}/g, '\n');
while ((m = re.exec(src))) {
	out += html(src.slice(i, m.index));
	const [all, tag, attrs = '', body] = m;
	let b = body;
	if (tag === 'style') b = await css(body);
	else if (!/type=["']?(application\/json|text\/template)/.test(attrs)) b = await js(body);
	out += `<${tag}${attrs}>${b}</${tag}>`;
	i = m.index + all.length;
}
out += html(src.slice(i));
fs.writeFileSync(f, out);
const q = path.join(dir, 'qr.js');
let qb = 0, qa = 0;
if (fs.existsSync(q)) { const s = fs.readFileSync(q, 'utf8'); qb = s.length; const o = await js(s); qa = o.length; fs.writeFileSync(q, o + '\n'); }
console.log(`面板精简：index.html ${Buffer.byteLength(src)} → ${Buffer.byteLength(out)} 字节；qr.js ${qb} → ${qa}`);

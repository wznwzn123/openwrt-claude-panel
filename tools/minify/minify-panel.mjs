// 打包时精简面板（只改打进安装包的那一份，仓库里的源文件不动）：
//   index.html：样式和脚本去掉空白、注释，脚本里的局部变量名缩短；页面结构只去掉行首缩进和注释
//   qr.js：同样精简
// 不改变任何行为：不改字符串和模板里的内容；脚本语法降到老浏览器能跑的写法（见 OLD）。
// 用法：node tools/minify/minify-panel.mjs <面板目录>     （例如打包目录里的 src/www/panel）
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import * as acorn from 'acorn';

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'index.html'))) { console.error('用法：node minify-panel.mjs <面板目录>'); process.exit(2); }
const MANGLE = process.env.PANEL_MANGLE !== '0';
// 脚本降到 Chrome 64 / Safari 12 能跑的写法（?. ?? 这些改成老写法；11/27 全面检查第 29 条：没更新过系统 WebView 的老安卓手机原来是白屏）
const OLD = ['chrome64', 'safari12', 'firefox68', 'edge79'];
const js = async (code) => (await esbuild.transform(code, { loader: 'js', target: OLD, minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: MANGLE, legalComments: 'none', charset: 'utf8' })).code.replace(/\n$/, '');
const css = async (code) => (await esbuild.transform(code, { loader: 'css', minify: true, charset: 'utf8', target: OLD })).code.replace(/\n$/, '');

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
// 再检查一遍：精简后的脚本要能被只认 ES2018（Chrome 64 那一代）的解析器解析，不然老手机还是白屏——不行就让打包失败，不发出去
{
	const bad = [];
	const chk = (name, code) => { try { acorn.parse(code, { ecmaVersion: 2018, sourceType: 'script' }); } catch (e) { bad.push(name + '：' + e.message + ' → ' + code.slice(Math.max(0, e.pos - 50), e.pos + 30)); } };
	let k = 0;
	for (const x of out.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (!/type=["']?(application\/json|text\/template)/.test(x[1] || '')) chk('index.html 第 ' + ++k + ' 段脚本', x[2]);
	for (const n of fs.readdirSync(dir)) if (n.endsWith('.js')) chk(n, fs.readFileSync(path.join(dir, n), 'utf8'));
	if (bad.length) { console.error('✗ 老浏览器解析不了：\n' + bad.join('\n')); process.exit(1); }
	console.log('✓ 脚本都能按 ES2018 解析（Chrome 64 / Safari 12 能跑）');
}

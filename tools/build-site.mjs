// 把 cloud/site/*.html 打包成 cloud/site.js（Worker 直接把页面内容返回给浏览器）
// 改了页面以后运行：node tools/build-site.mjs
import fs from 'fs';
const dir = new URL('../cloud/site/', import.meta.url);
const css = fs.readFileSync(new URL('common.css', dir), 'utf8');
const pages = { HOME: 'index.html', APP: 'app.html', ADMIN: 'admin.html' };
let out = '// 自动生成，不要直接改：改 cloud/site/ 里的文件后运行 node tools/build-site.mjs\n';
for (const [k, f] of Object.entries(pages)) {
	const html = fs.readFileSync(new URL(f, dir), 'utf8').replace('/*COMMON_CSS*/', css);
	out += `export const ${k} = ${JSON.stringify(html)};\n`;
}
fs.writeFileSync(new URL('../cloud/site.js', import.meta.url), out);
console.log('site.js', out.length, 'bytes');

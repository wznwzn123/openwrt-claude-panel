// 把 cloud/site/*.html 打包成 cloud/site.js（Worker 直接把页面内容返回给浏览器）
// 改了页面以后运行：node tools/build-site.mjs
import fs from 'fs';
const dir = new URL('../cloud/site/', import.meta.url);
const css = fs.readFileSync(new URL('common.css', dir), 'utf8');
const pages = { HOME: 'index.html', APP: 'app.html', ADMIN: 'admin.html', PRIVACY: 'privacy.html', SECURITY: 'security.html', REPLY: 'reply.html' };
let out = '// 自动生成，不要直接改：改 cloud/site/ 里的文件后运行 node tools/build-site.mjs\n';
for (const [k, f] of Object.entries(pages)) {
	// 页面里的截图：写成 /*IMG:名字*/，打包时换成 cloud/site/img/名字.webp 的内容（页面只允许加载自己和 data: 图片）
	const html = fs.readFileSync(new URL(f, dir), 'utf8').replace('/*COMMON_CSS*/', css)
		.replace(/\/\*IMG:([a-z0-9_-]+)\*\//g, (m, n) => 'data:image/webp;base64,' + fs.readFileSync(new URL('img/' + n + '.webp', dir)).toString('base64'));
	out += `export const ${k} = ${JSON.stringify(html)};\n`;
}
fs.writeFileSync(new URL('../cloud/site.js', import.meta.url), out);
console.log('site.js', out.length, 'bytes');

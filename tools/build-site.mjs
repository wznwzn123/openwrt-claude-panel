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
// 4.0 管理后台：cloud/admin 打包好的页面（cd cloud/admin && npm run build）；只有 js / css，全部放进 site.js，不从外部加载
const ad = new URL('../cloud/admin/dist/', import.meta.url), files = {};
let adminHtml = '<!doctype html><meta charset="utf-8"><title>管理后台</title><p>管理后台还没打包：cd cloud/admin && npm run build';
if (fs.existsSync(new URL('index.html', ad))) {
	adminHtml = fs.readFileSync(new URL('index.html', ad), 'utf8');
	const T = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml' };
	for (const f of fs.readdirSync(new URL('assets/', ad))) {
		const ext = f.split('.').pop();
		if (!T[ext]) throw new Error('管理后台里有不认识的文件：' + f);
		files[f] = { type: T[ext], body: fs.readFileSync(new URL('assets/' + f, ad), 'utf8') };
	}
}
out += `export const ADMIN_APP = ${JSON.stringify(adminHtml)};\nexport const ADMIN_FILES = ${JSON.stringify(files)};\n`;
fs.writeFileSync(new URL('../cloud/site.js', import.meta.url), out);
console.log('site.js', out.length, 'bytes');

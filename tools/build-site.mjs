// 把 cloud/site/*.html 打包成 cloud/site.js（Worker 直接把页面内容返回给浏览器）
// 改了页面以后运行：node tools/build-site.mjs
import fs from 'fs';
import { createHash } from 'crypto';
import { applyLegacy, applyLegacyHtml, hasScan, styleBlocks } from './css-legacy.mjs';
import { translate, checkDict } from './i18n.mjs';
const dir = new URL('../cloud/site/', import.meta.url);
const css = fs.readFileSync(new URL('common.css', dir), 'utf8');
// 旧内核浏览器用的备用颜色（见 tools/css-legacy.mjs）
const LEG = JSON.parse(fs.readFileSync(new URL('legacy-colors.json', dir), 'utf8')), legMiss = [];
const pages = { HOME: 'index.html', APP: 'app.html', ADMIN: 'admin.html', PRIVACY: 'privacy.html', SECURITY: 'security.html', REPLY: 'reply.html', NOTICE: 'notice.html', TERMS: 'terms.html', CHANGELOG: 'changelog.html', STATUS: 'status.html', HELP: 'help.html', COMPAT: 'compat.html' };
// 旧内核不认识 :has()：先把所有样式里的 :has(条件) 编好号（页面里的小脚本要用同一份编号）
const HAS = { map: new Map(), list: [] };
const expand = (html) => { for (let i = 0; i < 3; i++) html = html.replace(/<!--KIT_(HEAD|NAV|FOOT|JS|DOC|ME|HAS|BACK|CAP)-->/g, (m, n) => fs.readFileSync(new URL('_kit_' + n.toLowerCase() + '.html', dir), 'utf8')); return html; };
const kitCss = []; const walkCss = (rel) => { for (const e of fs.readdirSync(new URL('k/' + rel, dir), { withFileTypes: true })) { const r = rel + e.name; if (e.isDirectory()) walkCss(r + '/'); else if (r.endsWith('.css')) kitCss.push(fs.readFileSync(new URL('k/' + r, dir), 'utf8')); } };
walkCss('');
for (const t of kitCss) hasScan(t, HAS);
for (const f of Object.values(pages)) if (f !== 'admin.html') for (const t of styleBlocks(expand(fs.readFileSync(new URL(f, dir), 'utf8')))) hasScan(t, HAS);
let out = '// 自动生成，不要直接改：改 cloud/site/ 里的文件后运行 node tools/build-site.mjs\n';
// 页面里的截图单独由 /img/名字-内容摘要.webp 发（浏览器长期缓存；内容变了摘要跟着变），不再塞进页面：页面小一半，打开更快
const IMG = {};
const imgUrl = (n) => { const b = fs.readFileSync(new URL('img/' + n + '.webp', dir)), f = n + '-' + createHash('sha256').update(b).digest('hex').slice(0, 10) + '.webp'; IMG[f] = b.toString('base64'); return '/img/' + f; };
// 6.0 第 8 项：官网的内容安全策略不再放行「随便哪段内联脚本」，只放行打包时算好摘要的这些（页面里自己写的 <script>）
const CSP_SCRIPTS = {};
const scriptHashes = (html) => [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)].filter((m) => !/\ssrc\s*=/i.test(m[1] || '')).map((m) => "'sha256-" + createHash('sha256').update(m[2], 'utf8').digest('base64') + "'");
// #102 官网英文页（用户 11/28 21:47：介绍类页面，网址带 /en/）：按 cloud/site/i18n/en.json 整段换成英文，表里缺的打包失败
const EN = { HOME: '/', HELP: '/help', COMPAT: '/compat', PRIVACY: '/privacy', TERMS: '/terms', SECURITY: '/security', STATUS: '/status', CHANGELOG: '/changelog', NOTICE: '/notice' };
const enDict = JSON.parse(fs.readFileSync(new URL('i18n/en.json', dir), 'utf8')), enMiss = [];
{ const bad = checkDict(enDict); if (bad.length) throw new Error('i18n/en.json 里这些英文有 \' " ` 或者还有中文：\n  ' + bad.slice(0, 20).join('\n  ')); }
const enPath = (p) => p === '/' ? '/en/' : '/en' + p;
// 英文页里指向已翻译页面的站内链接换成 /en/ 开头的（/app 账号页这类没翻的不动）
const enLinks = (html) => html.replace(/(\shref=")(\/(?:help|compat|privacy|terms|security|status|changelog|notice)?)(?=[#?"])/g, (m, a, p) => a + enPath(p || '/'));
const langSw = (html, k, lang) => {
	const zhP = EN[k] || '/', enP = EN[k] ? enPath(EN[k]) : '/en/';
	const to = lang === 'en' ? { href: zhP, hl: 'zh-CN', to: 'zh', txt: '中文', txt2: '中文' } : { href: enP, hl: 'en', to: 'en', txt: 'EN', txt2: 'English' };
	// 顶栏语言展开栏（用户 11/29 00:09）：两种语言都列，当前的打勾；语言名在这里填，不走对照表；没有英文的页面（账号页这些）「简体中文」指向本页
	html = html.replaceAll('/*LANG_CUR*/', lang === 'en' ? 'English' : '中文').replaceAll('/*LANG_ZHNAME*/', '简体中文').replaceAll('/*LANG_ZHON*/', String(lang !== 'en')).replaceAll('/*LANG_ENON*/', String(lang === 'en'))
		.replaceAll('/*LANG_ZH*/', EN[k] || '').replaceAll('/*LANG_EN*/', enP);
	html = html.replaceAll('/*LANG_HREF*/', to.href).replaceAll('/*LANG_HL*/', to.hl).replaceAll('/*LANG_TO*/', to.to).replaceAll('/*LANG_TXT*/', to.txt).replaceAll('/*LANG_TXT2*/', to.txt2);
	// 搜索引擎：两种语言的页面互相指着
	if (EN[k]) html = html.replace('</head>', `<link rel="alternate" hreflang="zh-CN" href="${zhP}"><link rel="alternate" hreflang="en" href="${enP}"><link rel="alternate" hreflang="x-default" href="${zhP}">\n</head>`);
	return html;
};
const build = (k, f, lang) => {
	// 页面里的截图：写成 /*IMG:名字*/，打包时换成 /img/名字-摘要.webp（cloud/site/img/名字.webp，见上面的 imgUrl）
	// 新设计的页面共用的顶栏、页脚、样式和脚本：写成 <!--KIT_HEAD--> 这样，打包时换成 cloud/site/_kit_*.html 的内容
	let html = fs.readFileSync(new URL(f, dir), 'utf8');
	html = expand(html);
	if (/<!--KIT_/.test(html)) throw new Error(f + ' 里有不认识的 <!--KIT_...-->');
	if (lang === 'en') html = enLinks(translate(html, enDict, enMiss, f)).replace(/<html lang="zh-CN"/, '<html lang="en"');
	html = langSw(html, k, lang);
	if (f !== 'admin.html') html = applyLegacyHtml(html, LEG, legMiss, HAS).replace('/*HAS_ARGS*/[]', () => JSON.stringify(HAS.list));
	html = html.replace('/*COMMON_CSS*/', css)
		.replace(/\/\*IMG:([a-z0-9_-]+)\*\//g, (m, n) => imgUrl(n));
	const kk = lang === 'en' ? k + '_EN' : k;
	out += `export const ${kk} = ${JSON.stringify(html)};\n`;
	CSP_SCRIPTS[kk] = [...new Set(scriptHashes(html))].join(' ');
};
for (const [k, f] of Object.entries(pages)) build(k, f, 'zh');
for (const k of Object.keys(EN)) build(k, pages[k], 'en');
if (enMiss.length) {
	const mm = {};
	for (const x of enMiss) { const i = x.indexOf('：'); (mm[x.slice(i + 1)] ||= []).includes(x.slice(0, i)) || mm[x.slice(i + 1)].push(x.slice(0, i)); }
	fs.writeFileSync(new URL('i18n/en-missing.json', dir), JSON.stringify(mm, null, 1));
	// 翻译做到一半时本地看效果：I18N_ALLOW_MISSING=1 只提醒不失败（部署用的 Actions 不设，缺了就失败）
	if (process.env.I18N_ALLOW_MISSING === '1') console.warn('英文页还有 ' + Object.keys(mm).length + ' 段没翻（I18N_ALLOW_MISSING=1，先照中文留着）');
	else throw new Error('英文页还有 ' + Object.keys(mm).length + ' 段没翻（i18n/en.json 里没有），列在 cloud/site/i18n/en-missing.json（不进仓库）：\n  ' + Object.keys(mm).slice(0, 12).join('\n  '));
}
out += `export const CSP_SCRIPTS = ${JSON.stringify(CSP_SCRIPTS)};\n`;
// 官网字体 Geist（SIL OFL 1.1，见 cloud/site/img/geist-OFL.txt）：从本站 /fonts/geist.woff2 发，页面不从外部加载东西
out += `export const FONT_GEIST = ${JSON.stringify(fs.readFileSync(new URL('img/geist.woff2', dir)).toString('base64'))};\n`;
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
// 官网首页的版式和动效组件（taste-skill，MIT，见 cloud/site/k/LICENSE-taste-skill.txt）：cloud/site/k/ 下的文件原样放进 site.js，
// 由 /k/... 发给浏览器（组件按需互相加载，所以要按原来的目录结构发）
const kit = {}, KT = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', svg: 'image/svg+xml', txt: 'text/plain; charset=utf-8' };
const walk = (rel) => { for (const e of fs.readdirSync(new URL('k/' + rel, dir), { withFileTypes: true })) { const r = rel + e.name; if (e.isDirectory()) walk(r + '/'); else { const ext = e.name.split('.').pop(); if (!KT[ext]) throw new Error('cloud/site/k 里有不认识的文件：' + r); let body = fs.readFileSync(new URL('k/' + r, dir), 'utf8'); if (ext === 'css') body = applyLegacy(body, LEG, legMiss, HAS); kit[r] = { type: KT[ext], body }; } } };
walk('');
// 6.0 第 5 项：账号设置里开两步验证要显示二维码——跟面板用同一个生成二维码的脚本（MIT，文件开头写着），由 /k/qr.js 发，只在开启时才加载
kit['qr.js'] = { type: KT.js, body: fs.readFileSync(new URL('../src/www/panel/qr.js', import.meta.url), 'utf8') };
out += `export const KIT_FILES = ${JSON.stringify(kit)};\n`;
out += `export const IMG_FILES = ${JSON.stringify(IMG)};\n`;
out += `export const ADMIN_APP = ${JSON.stringify(adminHtml)};\nexport const ADMIN_FILES = ${JSON.stringify(files)};\n`;
if (legMiss.length) console.warn('旧浏览器备用颜色缺 ' + new Set(legMiss).size + ' 条（样式改过了）：运行 node tools/gen-legacy-colors.mjs 重新算\n  ' + [...new Set(legMiss)].slice(0, 8).join('\n  '));
if (out.includes('/*HAS_ARGS*/[]')) throw new Error('有页面没换掉 /*HAS_ARGS*/');
fs.writeFileSync(new URL('../cloud/site.js', import.meta.url), out);
console.log('site.js', out.length, 'bytes');

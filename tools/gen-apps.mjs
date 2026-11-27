// 生成「网址 → App」公开表 cloud/apps-data.js（6.0，用户 11/28 选「官网放公开表 路由器下载对照」）
// 用法：git clone --depth 1 https://github.com/v2fly/domain-list-community /tmp/dlc
//       npm i --prefix /tmp/pp pinyin-pro@3
//       PINYIN_PRO=/tmp/pp/node_modules/pinyin-pro node tools/gen-apps.mjs /tmp/dlc
// 规则：社区列表里 include: 一路展开；regexp: / keyword: 不要；带 @ads 的不要（系统后台那几组要）；full: 当普通网址用（按后缀认）。
// 同一个网址在几个软件里都有，归网址最少的那个（抖音的网址归抖音，不归字节跳动）；一个软件里子域名被主域名包住的去掉。
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { SRC, CATS } from './apps-src.mjs';

const DLC = process.argv[2];
if (!DLC || !fs.existsSync(path.join(DLC, 'data'))) { console.error('用法：node tools/gen-apps.mjs <domain-list-community 目录>'); process.exit(1); }
const req = createRequire(import.meta.url);
let pinyin;
try { ({ pinyin } = req(process.env.PINYIN_PRO || 'pinyin-pro')); } catch (e) { console.error('要先装 pinyin-pro（见文件开头）'); process.exit(1); }
const DOM = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const cache = {};
// ads = true：系统后台那几组照样要带 @ads 的（HTTPDNS、统计在社区列表里都标了 @ads）
function list(name, ads = false, seen = new Set()) {
	const ck = name + (ads ? '@' : '');
	if (cache[ck]) return cache[ck];
	if (seen.has(name)) return [];
	seen.add(name);
	const f = path.join(DLC, 'data', name);
	if (!fs.existsSync(f)) throw new Error('社区列表里没有：' + name);
	const out = new Set();
	for (let l of fs.readFileSync(f, 'utf8').split('\n')) {
		l = l.replace(/#.*$/, '').trim();
		if (!l) continue;
		const [v, ...attrs] = l.split(/\s+/);
		if (attrs.includes('@ads') && !ads) continue;
		if (v.startsWith('include:')) { for (const d of list(v.slice(8), ads, seen)) out.add(d); continue; }
		if (v.startsWith('regexp:') || v.startsWith('keyword:')) continue;
		const d = v.replace(/^(domain|full):/, '').toLowerCase();
		if (DOM.test(d) && d.length <= 253) out.add(d);
	}
	return (cache[ck] = [...out]);
}
const ents = SRC.map(([id, name, en, cat, src, add]) => {
	if (!/^[a-z0-9_]{1,30}$/.test(id) || !CATS[cat]) throw new Error('编号或分类不对：' + id);
	const s = new Set();
	for (const n of src || []) for (const d of list(n, cat === 'sys')) s.add(d);
	for (const d of add || []) { if (!DOM.test(d)) throw new Error('网址不对：' + id + ' ' + d); s.add(d); }
	return { id, name, en, cat, doms: s };
});
const ids = new Set();
for (const e of ents) { if (ids.has(e.id)) throw new Error('编号重复：' + e.id); ids.add(e.id); }
// 同一个网址归网址最少的那个软件
const owner = new Map();
for (const e of ents) for (const d of e.doms) { const o = owner.get(d); if (!o || e.doms.size < o.doms.size) owner.set(d, e); }
const under = (d, set) => { const p = d.split('.'); for (let i = 1; i < p.length - 1; i++) if (set.has(p.slice(i).join('.'))) return true; return false; };
const apps = [];
for (const e of ents) {
	const mine = new Set([...e.doms].filter((d) => owner.get(d) === e));
	const doms = [...mine].filter((d) => !under(d, mine)).sort((a, b) => a.length - b.length || a.localeCompare(b));
	if (!doms.length) { console.warn('没有网址，跳过：' + e.id); continue; }
	const py = pinyin(e.name, { toneType: 'none', type: 'array', nonZh: 'removed' });
	apps.push([e.id, e.name, e.en, e.cat, py.join('') + (py.length ? ' ' + py.map((x) => x[0]).join('') : ''), doms.slice(0, 600)]);
}
const body = JSON.stringify(apps);
const v = crypto.createHash('sha1').update(JSON.stringify(CATS) + body).digest('hex').slice(0, 10);
const out = `// 生成的文件，不要手改：node tools/gen-apps.mjs（来源 tools/apps-src.mjs + v2fly/domain-list-community）
// 网址列表来自 https://github.com/v2fly/domain-list-community ，MIT 协议：Copyright (c) 2018-2019 V2Ray
// 每一项 [编号, 名字, 英文名或别名, 分类, 拼音 + 拼音首字母, [网址后缀]]
export const APPS_V = '${v}';
export const APPS_CATS = ${JSON.stringify(CATS)};
export const APPS = ${body};
`;
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'cloud', 'apps-data.js');
fs.writeFileSync(OUT, out);
console.log(`${apps.length} 个软件，${apps.reduce((n, a) => n + a[5].length, 0)} 个网址，${(out.length / 1024).toFixed(0)} KB，版本 ${v}`);

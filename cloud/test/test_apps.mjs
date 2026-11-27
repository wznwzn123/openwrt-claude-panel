// 「网址 → App」公开表（用户 11/28 选「官网放公开表 路由器下载对照」）：官网 /api/apps 给路由器下载；表本身的数据对不对
import { load, memStorage } from './load.mjs';
import fs from 'fs';
const mod = await load();
const { APPS, APPS_V, APPS_CATS } = await import('../apps-data.js');
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
globalThis.fetch = async () => new Response('{}', { status: 200 });
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 'cf-token', CF_ACCOUNT_ID: 'acc1', CF_ZONE_ID: 'zone1', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '20', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls, e) => { const objs = new Map(); return { objs, idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, e)); return objs.get(id); } }; };
env.W = ns(mod.Watch, env); env.H = ns(mod.Hub, env);
const req = (method, url, headers = {}) => mod.default.fetch(new Request(url, { method, headers }), env);

let r = await req('GET', 'https://panel.example/api/apps');
const j = await r.json();
ok('官网 /api/apps：公开、不用登录，带版本、分类、来源', r.status === 200 && j.ok && j.v === APPS_V && j.cats.sys === '系统后台' && /domain-list-community/.test(j.src) && j.apps.length === APPS.length, JSON.stringify(j).slice(0, 200));
ok('缓存一小时，带 ETag', /max-age=3600/.test(r.headers.get('cache-control')) && r.headers.get('etag') === '"' + APPS_V + '"');
r = await req('GET', 'https://panel.example/api/apps', { 'if-none-match': '"' + APPS_V + '"' });
ok('版本一样回 304（路由器一天来拿一次，没变不用再下）', r.status === 304);
const raw = fs.readFileSync(new URL('../apps-data.js', import.meta.url), 'utf8');
ok('大小合适（路由器放内存里）：小于 400 KB', raw.length < 400 * 1024, raw.length);
ok('写明网址列表的来源和协议（MIT）', /v2fly\/domain-list-community/.test(raw) && /MIT/.test(raw));
const DOM = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const ids = new Set(), owner = new Map();
let bad = [];
for (const a of APPS) {
	if (!/^[a-z0-9_]{1,30}$/.test(a[0]) || ids.has(a[0]) || !a[1] || !APPS_CATS[a[3]] || !Array.isArray(a[5]) || !a[5].length) bad.push(a[0]);
	ids.add(a[0]);
	for (const d of a[5]) { if (!DOM.test(d)) bad.push(a[0] + ':' + d); if (owner.has(d)) bad.push('重复 ' + d); owner.set(d, a[0]); }
}
ok('每一项：编号不重复、有名字、分类对、网址都是像样的域名、同一个网址只归一个软件', !bad.length, bad.slice(0, 5).join(' '));
ok('几百个软件（软件页搜索也用它）', APPS.length >= 300, APPS.length);
const of = (id) => APPS.find((a) => a[0] === id);
const find = (h) => { const p = h.split('.'); for (let i = 0; i < p.length - 1; i++) { const o = owner.get(p.slice(i).join('.')); if (o) return o; } return null; };
ok('按最长的后缀认：抖音的网址归抖音、不归字节跳动；微信归微信、QQ 的归 QQ', find('www.douyin.com') === 'douyin' && find('v26-web.douyinvod.com') === 'douyin' && find('weixin.qq.com') === 'wechat' && find('dldir1.qq.com') === 'qq' && find('y.qq.com') === 'qqmusic', [find('www.douyin.com'), find('weixin.qq.com'), find('dldir1.qq.com')].join());
ok('国内外常用的都认得：哔哩哔哩、淘宝、支付宝、ChatGPT、Netflix、Steam、米哈游', find('api.bilibili.com') === 'bilibili' && find('h5.m.taobao.com') === 'taobao' && find('mobilegw.alipay.com') === 'alipay' && find('chatgpt.com') === 'chatgpt' && find('nflxvideo.net') === 'netflix' && find('store.steampowered.com') === 'steam' && find('ys.mihoyo.com') === 'hoyoverse');
ok('系统后台（联网检测、推送、对时）单独一类', of('sys_check')?.[3] === 'sys' && find('captive.apple.com') === 'sys_check' && of('sys_push')?.[3] === 'sys' && find('mtalk.google.com') === 'sys_push');
ok('有拼音和首字母（软件页搜「blbl」「wx」能找到）', / blbl$/.test(of('bilibili')[4]) && /^weixin wx$/.test(of('wechat')[4]), of('bilibili')[4] + ' | ' + of('wechat')[4]);

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[1] || x[2] == null ? '' : '（' + x[2] + '）')).join('\n'));
const n = results.filter((x) => x[1]).length;
console.log(`\n通过 ${n}/${results.length}`);
process.exit(n === results.length ? 0 : 1);

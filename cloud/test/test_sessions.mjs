// 官网登录过的设备：列表、单独退出、退出其他所有、新设备登录邮件提醒、以前的登录照常能用
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const MAILS = [];
globalThis.fetch = async (input, init = {}) => { const url = typeof input === 'string' ? input : input.url; if (url === 'https://api.resend.com/emails') { MAILS.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); } return new Response('{}'); };
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '20', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const UA = {
	edgeAndroid: 'Mozilla/5.0 (Linux; Android 14; 23013RK75C) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0',
	chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
	safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
	wechat: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/116 Mobile Safari/537.36 MicroMessenger/8.0.50',
	app: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36 RouterPanelApp/1.3.0',
	mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
};
const jar = () => ({ sid: '' });
const call = async (c, path, b, { ua = UA.edgeAndroid, cf } = {}) => {
	const h = { 'content-type': 'application/json', origin: 'https://panel.example', 'cf-connecting-ip': '9.9.9.' + Math.floor(Math.random() * 200), 'user-agent': ua };
	if (c.sid) h.cookie = 'sid=' + c.sid;
	const rq = new Request('https://panel.example' + path, { method: 'POST', headers: h, body: JSON.stringify(b || {}) });
	if (cf) Object.defineProperty(rq, 'cf', { value: cf });
	const res = await mod.default.fetch(rq, env);
	const sc = res.headers.get('set-cookie'); if (sc) { const m = /sid=([a-z2-9]*);/.exec(sc); c.sid = m ? m[1] : ''; }
	let j = {}; try { j = await res.json(); } catch (e) {} return { st: res.status, ...j };
};
let T = Date.now(); Date.now = () => T;
const A = jar(); await call(A, '/api/account/register', { email: 'alice@x.com', password: 'abcdefgh1' }, { cf: { city: 'Taipei', country: 'TW' } });
env.RESEND_API_KEY = 're_x';
let L = (await call(A, '/api/account/sessions')).list;
ok('注册后：列出这台设备（安卓手机 · Edge、台湾 · Taipei），标着「这台设备」', L.length === 1 && L[0].ua === '安卓手机 · Edge' && L[0].place === '台湾 · Taipei' && L[0].cur === true && L[0].at > 0, JSON.stringify(L));
ok('列表里不会给出登录凭证（sid）', !JSON.stringify(L).includes(A.sid));
// 其他设备登录
const B = jar(); MAILS.length = 0;
await call(B, '/api/account/login', { email: 'alice@x.com', password: 'abcdefgh1' }, { ua: UA.chromeWin, cf: { city: 'Shanghai', country: 'CN' } });
ok('新设备（Windows 电脑）登录：给本人发提醒邮件，写着设备和地点', MAILS.length === 1 && MAILS[0].to.includes('alice@x.com') && /新设备登录/.test(MAILS[0].subject) && /Windows 电脑 · Chrome/.test(MAILS[0].html) && /中国大陆 · Shanghai/.test(MAILS[0].html), JSON.stringify(MAILS.map((m) => m.subject)));
const A2 = jar(); MAILS.length = 0;
await call(A2, '/api/account/login', { email: 'alice@x.com', password: 'abcdefgh1' }, { ua: UA.edgeAndroid });
ok('同一种设备再登录：不发提醒（不吵）', MAILS.length === 0);
T += 3600e3;
L = (await call(A, '/api/account/sessions')).list;
ok('列表：这台设备排第一，另外两台按最近使用排', L.length === 3 && L[0].cur && L.filter((x) => !x.cur).length === 2);
const win = L.find((x) => x.ua === 'Windows 电脑 · Chrome');
// 单独退出
let r = await call(A, '/api/account/session_out', { id: win.id });
ok('点「退出」：那台设备退出了', r.st === 200 && r.ok);
ok('被退出的设备：马上不能用了（要重新登录）', (await call(B, '/api/account/sessions')).st === 401);
ok('不能退出自己正在用的这台（要用「退出登录」）', (await call(A, '/api/account/session_out', { id: L[0].id })).st === 400);
ok('退出不存在的：提示已经退出了', (await call(A, '/api/account/session_out', { id: 'zzzzzzzzzz' })).st === 404);
// 别人的账号的设备退不了
const RK = env.RESEND_API_KEY; delete env.RESEND_API_KEY; const C = jar(); await call(C, '/api/account/register', { email: 'bob@x.com', password: 'abcdefgh1' }); env.RESEND_API_KEY = RK;
const aid = (await call(A, '/api/account/sessions')).list.find((x) => !x.cur).id;
ok('别的账号拿不到、也退不了我的设备', (await call(C, '/api/account/session_out', { id: aid })).st === 404 && (await call(A2, '/api/account/sessions')).st === 200);
// 退出其他所有
const D = jar(); await call(D, '/api/account/login', { email: 'alice@x.com', password: 'abcdefgh1' }, { ua: UA.safariIphone });
r = await call(A, '/api/account/sessions_out_others');
ok('「退出其他所有设备」：只留下这台', r.st === 200 && r.n === 2 && (await call(A, '/api/account/sessions')).list.length === 1 && (await call(D, '/api/account/sessions')).st === 401 && (await call(A2, '/api/account/sessions')).st === 401);
ok('自己这台还能用', (await call(A, '/api/account/sessions')).st === 200);
// 以前登录的（没有设备信息）：照常能用，列表里显示「以前登录的」，也能退出
const H = env.H.get('hub'); const u = await H.ctx.storage.get('u:' + (await H.ctx.storage.get('e:alice@x.com')));
const old = 'a'.repeat(32).replace(/a/g, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]);
await H.ctx.storage.put('s:' + old, { uid: u.uid, exp: T + 10 * 86400e3 }); u.sids.push(old); await H.ctx.storage.put('u:' + u.uid, u);
const O = { sid: old };
ok('以前登录的设备：照常能用，不用重新登录', (await call(O, '/api/account/sessions')).st === 200);
L = (await call(A, '/api/account/sessions')).list;
const ol = L.find((x) => !x.cur);
ok('以前登录的：列表里显示出来（没有设备信息），能退出', !!ol && ol.ua === '' && (await call(A, '/api/account/session_out', { id: ol.id })).st === 200 && (await call(O, '/api/account/sessions')).st === 401);
// 过期的不列出来、顺手清掉
const E = jar(); await call(E, '/api/account/login', { email: 'alice@x.com', password: 'abcdefgh1' }, { ua: UA.mac });
T += 31 * 86400e3;
const A3 = jar(); await call(A3, '/api/account/login', { email: 'alice@x.com', password: 'abcdefgh1' }, { ua: UA.mac });
L = (await call(A3, '/api/account/sessions')).list;
ok('过期的登录（30 天）不列出来，记录也清掉', L.length === 1 && L[0].cur && (await H.ctx.storage.get('u:' + u.uid)).sids.length === 1, JSON.stringify(L));
// 最近使用：用的时候更新（10 分钟最多写一次）
const t0 = L[0].last; T += 20 * 60e3; await call(A3, '/api/account/me'); 
ok('用的时候更新「最近使用」', (await call(A3, '/api/account/sessions')).list[0].last > t0);
// 改密码：其他设备退出（跟以前一样）
const F = jar(); await call(F, '/api/account/login', { email: 'alice@x.com', password: 'abcdefgh1' }, { ua: UA.wechat });
await call(A3, '/api/account/password', { old: 'abcdefgh1', password: 'newpass123' });
ok('改密码：其他设备自动退出（跟以前一样）', (await call(F, '/api/account/sessions')).st === 401 && (await call(A3, '/api/account/sessions')).list.length === 1);
// 设备类型认得出
const lab = (await import('fs')).readFileSync(new URL('../hub.js', import.meta.url), 'utf8');
const seen = [];
for (const [k, ua] of Object.entries(UA)) { const X = jar(); await call(X, '/api/account/login', { email: 'alice@x.com', password: 'newpass123' }, { ua }); }
L = (await call(A3, '/api/account/sessions')).list.map((x) => x.ua);
ok('认得出常见设备：iPhone · Safari、安卓手机 · 微信、路由器面板 App、Mac · Safari', L.includes('iPhone · Safari') && L.includes('安卓手机 · 微信') && L.includes('安卓手机 · 路由器面板 App') && L.includes('Mac · Safari'), L.join(' | '));
env.LOGIN_ALERT = '0'; MAILS.length = 0; const G = jar(); await call(G, '/api/account/login', { email: 'alice@x.com', password: 'newpass123' }, { ua: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0' });
ok('设了 LOGIN_ALERT=0：不发提醒邮件', MAILS.length === 0);

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

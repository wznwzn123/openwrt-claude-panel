// 申请尝鲜的邮箱一律用官网账号的（用户 11/26 定）：自建版在官网登录后把路由器的关联码关联到账号（/api/account/beta_link），
// 路由器问 /api/compat/who 拿打码的邮箱；没登录不能关联；关联码不对不关联
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
globalThis.fetch = async () => new Response('{}');
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const S = () => env.H.get('hub').ctx.storage;
let ipn = 0;
async function call(c, path, body) {
	const h = { 'content-type': 'application/json', origin: 'https://panel.example', 'cf-connecting-ip': '1.1.1.' + (++ipn % 200) };
	if (c && c.sid) h.cookie = '__Host-sid=' + c.sid;
	const res = await mod.default.fetch(new Request('https://panel.example' + path, { method: 'POST', headers: h, body: JSON.stringify(body) }), env);
	const sc = res.headers.get('set-cookie');
	if (c && sc) { const m = /sid=([a-z2-9]*);/.exec(sc); if (m) c.sid = m[1]; }
	let j = {}; try { j = await res.json(); } catch (e) {}
	return { st: res.status, j };
}
const A = { sid: '' };
await call(A, '/api/account/register', { email: 'alice@x.com', password: 'pass-alic-123' });
const uid = await S().get('e:alice@x.com');
ok('注册登录', !!A.sid && !!uid);
const LK = 'abcdefghijkmnpqrstuvwxyz'.slice(0, 24);
let r = await call(null, '/api/account/beta_link', { lk: LK });
ok('没登录：不能关联', r.st === 401 && !(await S().get('blk:' + LK)));
r = await call(A, '/api/account/beta_link', { lk: 'short' });
ok('关联码不对：不关联', r.st === 400);
r = await call(null, '/api/compat/who', { app: { lk: LK } });
ok('关联前：路由器问到的是要登录', r.j.ok && r.j.login === true && !r.j.mail, JSON.stringify(r.j));
r = await call(A, '/api/account/beta_link', { lk: LK });
ok('登录后关联：回打码的邮箱', r.st === 200 && r.j.mail === 'al***@x.com', JSON.stringify(r.j));
ok('关联记着账号（不记邮箱）', (await S().get('blk:' + LK)).uid === uid && !JSON.stringify(await S().get('blk:' + LK)).includes('alice'));
r = await call(null, '/api/compat/who', { app: { lk: LK } });
ok('关联后：路由器问到打码的邮箱', r.j.ok && r.j.login === false && r.j.mail === 'al***@x.com', JSON.stringify(r.j));
ok('不回完整邮箱', !JSON.stringify(r.j).includes('alice@'));
r = await call(null, '/api/compat/who', { app: { sub: 'nosuch', rkey: 'x' } });
ok('托管版钥匙不对：认不出 不让登录关联', r.j.ok && !r.j.mail && r.j.login === false && /认不出/.test(r.j.why), JSON.stringify(r.j));
const bad = results.filter((x) => !x[1]);
for (const [n, p, note] of results) console.log((p ? '✓ ' : '✗ ') + n + (p || !note ? '' : '  ' + note));
console.log(bad.length ? `失败 ${bad.length}/${results.length}` : `通过 ${results.length}/${results.length}`);
process.exit(bad.length ? 1 : 0);

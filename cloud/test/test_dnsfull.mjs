// Cloudflare 子域名（DNS 记录）名额满了：开通提示「名额已满」、不留半截隧道、提醒管理员、腾出名额后恢复
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);

const CF = { tunnels: new Map(), dns: new Map(), n: 0, quota: 3, calls: [] };
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url;
	const u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (url === 'https://api.resend.com/emails') { MAILS.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); }
	if (u.hostname !== 'api.cloudflare.com') return new Response('{}', { status: 200 });
	CF.calls.push(m + ' ' + u.pathname);
	const R = (result, st = 200, errors) => new Response(JSON.stringify({ success: st < 300, result, errors: errors || (st < 300 ? [] : [{ code: 1000, message: 'mock error ' + st }]) }), { status: st });
	const body = init.body ? JSON.parse(init.body) : null;
	const p = u.pathname.replace('/client/v4', '');
	let x;
	if (m === 'POST' && p === '/accounts/acc1/cfd_tunnel') { const id = 'tun-' + ++CF.n; CF.tunnels.set(id, {}); return R({ id, token: 'tok-' + id }); }
	if ((x = p.match(/^\/accounts\/acc1\/cfd_tunnel\/([^/]+)\/configurations$/)) && m === 'PUT') return R({});
	if ((x = p.match(/^\/accounts\/acc1\/cfd_tunnel\/([^/]+)\/connections$/)) && m === 'DELETE') return R({});
	if ((x = p.match(/^\/accounts\/acc1\/cfd_tunnel\/([^/]+)$/)) && m === 'DELETE') { CF.tunnels.delete(x[1]); return R({}); }
	if (m === 'POST' && p === '/zones/zone1/dns_records') { if (CF.err) return R(null, 500); if (CF.dns.size >= CF.quota) return R(null, 400, [{ code: 81045, message: 'Record quota exceeded.' }]); const id = 'dns-' + ++CF.n; CF.dns.set(id, body); return R({ id }); }
	if ((x = p.match(/^\/zones\/zone1\/dns_records\/([^/]+)$/)) && m === 'DELETE') { CF.dns.delete(x[1]); return R({}); }
	return R(null, 404);
};
const MAILS = [];
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 'cf-token', CF_ACCOUNT_ID: 'acc1', CF_ZONE_ID: 'zone1', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '1000', VAPID_PUB: '', VAPID_PRIV: '', RESEND_API_KEY: 're_x', ADMIN_EMAIL: 'boss@x.com' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const api = (method, path, body, h = {}) => mod.default.fetch(new Request('https://panel.example' + path, { method, body: body == null ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...h } }), env);
const adm = (method, path, body) => api(method, '/api/admin' + path, body, { authorization: 'Bearer admin-key-1234567890' });
let T = Date.now(); Date.now = () => T; const DAY = 86400e3;
const inv = (await (await adm('POST', '/invites', { max: 50, svc: 0 })).json()).invite.code;
let ip = 0; const reg = async () => { const r = await api('POST', '/api/register', { invite: inv, name: 'R', model: 'M' }, { 'cf-connecting-ip': '10.0.0.' + ++ip }); return { st: r.status, ...(await r.json()) }; };
const subs = [];
for (let i = 0; i < 3; i++) { const r = await reg(); subs.push(r.sub); }
ok('名额内：照常开通', subs.every(Boolean));
const tun0 = CF.tunnels.size;
let r = await reg();
ok('Cloudflare 子域名名额满了：提示「名额已满，暂时不能开通」（不是开通失败的报错）', r.st === 403 && r.error === '名额已满，暂时不能开通', JSON.stringify(r));
ok('不留半截：建了的隧道删掉了', CF.tunnels.size === tun0);
const S = await (await adm('GET', '/devices')).json();
ok('不占名额：路由器数量还是 3', S.count === 3 && S.list.length === 3, S.count);
const I = (await (await adm('GET', '/invites')).json()).list.find((x) => x.code === inv);
ok('邀请码次数退回去了', I.used === 3, I.used);
ok('发邮件提醒管理员', MAILS.some((m) => /托管名额满了/.test(m.subject) && /Record quota exceeded/.test(m.html)));
ok('管理页能看到名额满了', !!S.dnsFull && S.dnsFull.count === 3);
const n0 = CF.calls.length; r = await reg();
ok('之后再开通：直接说名额已满，不再去建隧道', r.st === 403 && r.error === '名额已满，暂时不能开通' && CF.calls.length === n0);
const L = (await (await adm('GET', '/log')).json()).list;
ok('操作记录里记了一笔', L.some((x) => x.op === 'dnsfull'));
// 腾出名额：彻底删掉一台
await env.H.get('hub').remove(subs[0]);
r = await reg();
ok('删掉一台腾出名额后：能开通了', r.st === 200 && !!r.sub, JSON.stringify(r));
ok('开通成功后清掉「名额满了」的标记', !(await (await adm('GET', '/devices')).json()).dnsFull);
// 名额满了一天后（比如升级了套餐）：再试一次
CF.quota = 3; r = await reg(); ok('又满了', r.st === 403);
CF.quota = 100; const n1 = CF.calls.length; r = await reg();
ok('一天之内：还是直接说满了（不去试）', r.st === 403 && CF.calls.length === n1);
T += DAY + 1000; r = await reg();
ok('过了一天（升级了套餐）：自己再试一次，能开通了', r.st === 200 && !!r.sub, JSON.stringify(r));
// 别的错误照旧报「开通失败」，也不会标成名额满
CF.quota = 100; CF.err = true; r = await reg();
ok('子域名出了别的错（不是名额）：照旧报「开通失败」，不标名额满', r.st === 502 && /开通失败/.test(r.error) && !(await (await adm('GET', '/devices')).json()).dnsFull, JSON.stringify(r));
CF.err = false; r = await reg(); ok('恢复后照常开通', r.st === 200);

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

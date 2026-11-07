// 官网公开的报告表单（安全、隐私、滥用）和限次记录清理
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);

/* ---------- 模拟 Cloudflare API ---------- */
const CF = { tunnels: new Map(), dns: new Map(), n: 0, fail: null, calls: [], probes: [] };
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url;
	const u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (u.hostname !== 'api.cloudflare.com') { CF.probes.push(url); return new Response('{}', { status: 200 }); }
	CF.calls.push(m + ' ' + u.pathname);
	const auth = (init.headers || {}).authorization;
	const R = (result, st = 200) => new Response(JSON.stringify({ success: st < 300, result, errors: st < 300 ? [] : [{ message: 'mock error ' + st }] }), { status: st });
	if (auth !== 'Bearer cf-token') return R(null, 403);
	const body = init.body ? JSON.parse(init.body) : null;
	const p = u.pathname.replace('/client/v4', '');
	let x;
	if (CF.fail && p.includes(CF.fail)) return R(null, 500);
	if (m === 'POST' && p === '/accounts/acc1/cfd_tunnel') { const id = 'tun-' + ++CF.n; CF.tunnels.set(id, { name: body.name, src: body.config_src, cfg: null }); return R({ id, token: 'tok-' + id }); }
	if ((x = p.match(/^\/accounts\/acc1\/cfd_tunnel\/([^/]+)\/configurations$/)) && m === 'PUT') { const t = CF.tunnels.get(x[1]); if (!t) return R(null, 404); t.cfg = body.config; return R({}); }
	if ((x = p.match(/^\/accounts\/acc1\/cfd_tunnel\/([^/]+)\/token$/)) && m === 'GET') return R('tok-' + x[1]);
	if ((x = p.match(/^\/accounts\/acc1\/cfd_tunnel\/([^/]+)\/connections$/)) && m === 'DELETE') return R({});
	if ((x = p.match(/^\/accounts\/acc1\/cfd_tunnel\/([^/]+)$/)) && m === 'DELETE') { if (!CF.tunnels.delete(x[1])) return R(null, 404); return R({}); }
	if (m === 'POST' && p === '/zones/zone1/dns_records') { const id = 'dns-' + ++CF.n; CF.dns.set(id, body); return R({ id }); }
	if ((x = p.match(/^\/zones\/zone1\/dns_records\/([^/]+)$/)) && m === 'DELETE') { if (!CF.dns.delete(x[1])) return R(null, 404); return R({}); }
	return R(null, 404);
};

/* ---------- 模拟 Durable Object ---------- */
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 'cf-token', CF_ACCOUNT_ID: 'acc1', CF_ZONE_ID: 'zone1', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '20', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(), st = new Map(); return { objs, st, idFromName: (n) => n, get(id) { if (!objs.has(id)) { const s = memStorage(); st.set(id, s); objs.set(id, new Cls({ storage: s }, env)); } return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const req = (method, url, body, headers = {}) => mod.default.fetch(new Request(url, { method, body: body == null ? undefined : (typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body)), headers: { 'content-type': 'application/json', ...headers } }), env);
const api = (method, path, body, h) => req(method, 'https://panel.example' + path, body, h);
const adm = (method, path, body) => api(method, '/api/admin' + path, body, { authorization: 'Bearer admin-key-1234567890' });
const reg = (invite, ip = '1.1.1.1', extra = {}) => api('POST', '/api/register', { invite, name: 'Kwrt', model: 'JD RE-SS-01', ...extra }, { 'cf-connecting-ip': ip });
const hub = () => env.H.get('hub');
const dev = async (sub) => (await hub().ctx.storage.get('d:' + sub));
const DAY = 86400e3;
const MAILS = []; env.RESEND_API_KEY = 're_test';
const f0 = globalThis.fetch; globalThis.fetch = async (input, init = {}) => { const url = typeof input === 'string' ? input : input.url; if (url === 'https://api.resend.com/emails') { MAILS.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); } return f0(input, init); };
let T = Date.now(); Date.now = () => T;
env.ADMIN_EMAIL = 'boss@x.com';
const rp = (b, ip = '5.5.5.5') => api('POST', '/api/report', b, { 'content-type': 'application/json', 'cf-connecting-ip': ip });
const H = hub();

// 提交
let r = await rp({ kind: 'security', text: '面板某个接口没校验参数，可以读到别的文件', contact: 'sec@x.com' });
ok('[报告] 不用登录就能提交安全问题', r.status === 200 && (await r.json()).ok === true);
let L = await (await adm('GET', '/feedback')).json();
ok('[报告] 管理页反馈列表里能看到，标着「官网 · 安全问题」、联系方式', L.list.length === 1 && L.list[0].name === '官网 · 安全问题' && L.list[0].kind === 'security' && L.list[0].web === 1 && L.list[0].contact === 'sec@x.com' && L.list[0].sub === '', JSON.stringify(L.list[0]));
ok('[报告] 不记 IP', !JSON.stringify(L.list).includes('5.5.5.5'));
ok('[报告] 发邮件提醒管理员（内容转义）', MAILS.some((m) => /官网报告（安全问题）/.test(m.subject) && /没校验参数/.test(m.html)));
await rp({ kind: 'privacy', text: '<img src=x onerror=alert(1)> 想删除我的数据' });
ok('[报告] 邮件里的内容转义了', MAILS.every((m) => !/<img src=x/.test(m.html)));
await rp({ kind: 'abuse', text: '有人用这个服务转发违法内容，网址是……' });
await rp({ kind: 'hack', text: '不认识的类型会归到「其他」去' });
L = (await (await adm('GET', '/feedback')).json()).list;
ok('[报告] 隐私、滥用、不认识的类型（归到其他）都能提交', L[0].name === '官网 · 其他' && L[1].name === '官网 · 滥用举报' && L[2].name === '官网 · 隐私和数据', L.map((x) => x.name).join(','));
// 安装脚本失败时（用户输入 y）发来的
MAILS.length = 0; r = await rp({ kind: 'install', text: '面板版本：3.0.0（hosted-ai）\n失败的步骤：安装依赖\n错误：依赖安装失败：cloudflared' }, '6.6.6.6');
L = (await (await adm('GET', '/feedback')).json()).list;
ok('[安装失败] 终端上报的：反馈列表里标着「安装失败（终端上报）」，内容完整', r.status === 200 && L[0].name === '安装失败（终端上报）' && L[0].kind === 'install' && /依赖安装失败/.test(L[0].text) && L[0].text.split('\n').length === 3);
ok('[安装失败] 邮件标题「有人安装失败了」', MAILS.some((m) => m.subject === '有人安装失败了' && /cloudflared/.test(m.html)));
// 安装日志：单独存；管理员能看；删除时一起删；别的类型带日志不收
r = await rp({ kind: 'install', text: '面板版本：3.0.0\n错误：依赖安装失败', log: '==> 安装依赖\n ✗ 依赖安装失败：cloudflared\n' + 'x'.repeat(70000) }, '6.6.6.7');
L = (await (await adm('GET', '/feedback')).json()).list;
const lid = L[0].id;
ok('[安装日志] 存下来了：列表里只记长度（最多 64000 字）', r.status === 200 && L[0].log === 64000 && !('logText' in L[0]) && JSON.stringify(L[0]).length < 2000);
let lr = await adm('GET', '/feedback/' + lid + '/log'); let lt = await lr.text();
ok('[安装日志] 管理员能看（纯文本，留的是最后那段）', lr.status === 200 && /text\/plain/.test(lr.headers.get('content-type')) && lt.length === 64000 && lt.endsWith('x'));
ok('[安装日志] 没有管理员密钥看不了', (await api('GET', '/api/admin/feedback/' + lid + '/log')).status === 401);
const H2 = env.H.get('hub');
ok('[安装日志] 删除这条报告：日志也删掉', (await (await adm('DELETE', '/feedback/' + lid)).json()).ok === true && !(await H2.ctx.storage.get('fblog:' + lid)));
r = await rp({ kind: 'security', text: '安全问题报告的内容在这里', log: '不该收的日志' }, '6.6.6.8');
L = (await (await adm('GET', '/feedback')).json()).list;
ok('[安装日志] 别的类型带日志：不收', !L[0].log && (await adm('GET', '/feedback/' + L[0].id + '/log')).status === 404);
// 校验
r = await rp({ kind: 'security', text: '太短了' }); ok('[报告] 太短的不收（至少 10 个字）', r.status === 400 && /至少 10 个字/.test((await r.json()).error));
r = await rp({ kind: 'security', text: 'x'.repeat(5000) }); L = (await (await adm('GET', '/feedback')).json()).list;
ok('[报告] 太长的截到 4000 字', r.status === 200 && L[0].text.length === 4000);
const n0 = L.length; r = await rp({ kind: 'security', text: '我是机器人我是机器人我是机器人', website: 'http://spam' }); L = (await (await adm('GET', '/feedback')).json()).list;
ok('[报告] 机器人填了陷阱字段：假装成功，但不存', r.status === 200 && L.length === n0);
// 限次：同一个 IP 一天 5 次
let st = []; for (let i = 0; i < 6; i++) st.push((await rp({ kind: 'other', text: '同一个人连着提交了很多次' + i }, '7.7.7.7')).status);
ok('[报告] 同一个 IP 一天最多 5 次', st.slice(0, 5).every((x) => x === 200) && st[5] === 429, st.join(','));
ok('[报告] 换个 IP 照常能提交', (await rp({ kind: 'other', text: '另一个人提交的内容在这里' }, '8.8.8.8')).status === 200);
ok('[报告] 只收 POST', (await api('GET', '/api/report')).status === 404);
// 管理页照常能处理、删除
const id = L[0].id;
ok('[报告] 管理页能标处理好、删除', (await (await adm('POST', '/feedback/' + id + '/done', { done: true })).json()).ok === true && (await (await adm('DELETE', '/feedback/' + id)).json()).ok === true);
// 限次记录（带 IP）过两天自动清掉
const keys = async () => [...(await H.ctx.storage.list({ prefix: 'r:' })).keys()];
ok('[清理] 限次记录里有 IP', (await keys()).some((k) => k.includes('7.7.7.7')));
T += 1 * DAY; await H.gcRate(T);
ok('[清理] 一天后还在（限次窗口是一天）', (await keys()).some((k) => k.includes('7.7.7.7')));
T += 1.5 * DAY; const nn = await H.gcRate(T);
ok('[清理] 超过两天没动的整条删掉', !(await keys()).some((k) => k.includes('7.7.7.7') || k.includes('5.5.5.5')) && nn >= 3, nn + ' ' + (await keys()).join(','));
await H.ctx.storage.put('rl', { all: [T - 2 * 3600e3], ip: { '1.2.3.4': [T - 2 * 3600e3], '4.3.2.1': [T - 60e3] } });
await H.gcRate(T); const rl = await H.ctx.storage.get('rl');
ok('[清理] 开通限流里一小时以前的 IP 清掉，最近的留着', !('1.2.3.4' in rl.ip) && ('4.3.2.1' in rl.ip) && rl.all.length === 0, JSON.stringify(rl));
ok('[清理] 每小时的定时任务会调用', /gcRate/.test(String(mod.default.scheduled || '')) || /gcRate/.test((await import('fs')).readFileSync(new URL('../hub.js', import.meta.url), 'utf8').match(/export async function hubScheduled[^\n]*/)[0]));

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

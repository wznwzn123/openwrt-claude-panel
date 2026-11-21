// 5.2 主账号 / 子账号：路由器这边（cgi-bin/mcp）从官网打开面板、按账号检查权限、踢出、老手机作废
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_fam.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawnSync } from 'child_process';
import { load, memStorage } from './load.mjs';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (u.hostname === 'localhost') return realFetch(input, init);
	if (u.hostname === 'api.cloudflare.com') { const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] })); if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 't' + Math.random(), token: 'tok' }); if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'd' + Math.random() }); return R({}); }
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const H = () => env.H.get('hub'), S = () => H().ctx.storage;
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const r = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
	const h = {}; r.headers.forEach((v, k) => { h[k] = v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8134, z));
const B = 'http://localhost:8134';
const api = async (p, body, hdr = {}) => (await realFetch(B + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const ADM = { authorization: 'Bearer admin-key-1234567890' };

// 路由器：一台托管版
const inv = (await api('/api/admin/invites', { direct: true,  max: 5 }, ADM)).invite.code;
const R = await api('/api/register', { invite: inv, name: 'Home', model: 'x86' });
const ETC = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpfam-'));
const TOKEN = 'tok' + 'x'.repeat(30);
fs.writeFileSync(ETC + '/config.json', JSON.stringify({ token: TOKEN, ckey: 'c'.repeat(40) }));
fs.writeFileSync(ETC + '/hub.conf', `HUB=${B}\nSUB=${R.sub}\nRKEY=${R.rkey}\n`);
for (const f of ['/tmp/cmcp_fam.json', '/tmp/cmcp_lcfail', '/tmp/cmcp_devseen.json']) try { fs.rmSync(f); } catch (e) {}
try { fs.rmSync('/tmp/cmcp_fam.lock', { recursive: true }); } catch (e) {}
// 跑一次 CGI（异步，等官网回话）
const cgi = (pathInfo, msg) => new Promise((z) => {
	const body = JSON.stringify(msg);
	import('child_process').then(({ spawn }) => {
		const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: ETC + '/config.json', PATH_INFO: pathInfo, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)) } });
		let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
		p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
		p.stdin.end(body);
	});
});
let rid = 0;
const call = (dev, method, params) => cgi('/' + TOKEN, { jsonrpc: '2.0', id: ++rid, method: 'panel/' + method, params: params || {}, client: 'panel', dev });
const open = (ticket, name) => cgi('/open', { jsonrpc: '2.0', id: ++rid, method: 'panel/open_login', params: { ticket, name }, client: 'panel' });
const devs = () => JSON.parse(fs.readFileSync(ETC + '/devices.json', 'utf8'));
const ticketOf = async (uid) => { const r = await H().famOpen(uid, R.sub); return (/#open=([a-z2-9]{24})$/.exec(r.url || '') || [])[1]; };
const clearCache = () => { try { fs.rmSync('/tmp/cmcp_fam.json'); } catch (e) {} };

// 账号：A 主账号，B 子账号（家人模板），C 外人
const mkUser = async (email) => { await api('/api/account/register', { email, password: 'pass-' + email.slice(0, 3) + '-1234' }); return S().get('e:' + email); };
const ua = await mkUser('alice@x.com'), ub = await mkUser('bob@x.com'), uc = await mkUser('carol@x.com');
{ const d = await S().get('d:' + R.sub); d.users = [ua]; d.owner = ua; d.subs = {}; await S().put('d:' + R.sub, d); const u = await S().get('u:' + ua); u.devs = [{ sub: R.sub, at: Date.now() }]; await S().put('u:' + ua, u); }

// 1. 主账号从官网打开面板
const ta = await ticketOf(ua);
ok('官网给主账号发了打开面板的票', !!ta);
const oa = await open(ta, 'A 的手机');
ok('路由器拿票换到手机钥匙和登录密钥', oa.result && /^[a-z0-9]{8}\.[a-z0-9]{32}$/.test(oa.result.dev) && oa.result.token === TOKEN, JSON.stringify(oa));
const devA = oa.result && oa.result.dev;
ok('手机记录里有账号编号和身份', devs()[devA.slice(0, 8)].uid === ua && devs()[devA.slice(0, 8)].role === 'owner');
ok('同一张票不能用第二次', !!(await open(ta, 'x')).error);
ok('乱写的票不行', !!(await open('abcdefghijkmnpqrstuvwxyz', 'x')).error);
ok('/open 地址只能换钥匙，调别的接口不行', (await cgi('/open', { jsonrpc: '2.0', id: 1, method: 'panel/overview', params: {}, client: 'panel' })).error?.code === -32601);
const wa = await call(devA, 'whoami');
ok('主账号：whoami 是 owner，有全部权限', wa.result && wa.result.role === 'owner' && wa.result.uid === ua && wa.result.perms.length === 7, JSON.stringify(wa));
ok('手机管理：没确认本人看不到登录着的手机（6.0 第 63 项）', /确认是你本人/.test((await call(devA, 'device_list')).error?.message || ''));

// 2. 主账号确认本人 → 发加入码 → B 加入
const su = await call(devA, 'fam', { op: 'sudo', code: '' });
ok('主账号在面板里确认本人', su.result && /^[a-z2-9]{24}$/.test(su.result.sudo), JSON.stringify(su));
ok('主账号确认本人后能看登录着的手机', !!(await call(devA, 'device_list', { sudo: su.result.sudo })).result);
const jc = await call(devA, 'fam', { op: 'join_create', sudo: su.result.sudo, name: 'Bob', perms: ['msg', 'node', 'speed'] });
ok('主账号在面板里生成加入码', jc.result && /^[A-Z2-9]{8}$/.test(jc.result.code), JSON.stringify(jc));
ok('没确认本人不能生成加入码', !!(await call(devA, 'fam', { op: 'join_create', sudo: 'x', name: 'x', perms: [] })).error);
const jr = await H().famJoin(ub, jc.result.code);
ok('B 在官网用加入码加入', jr.ok, JSON.stringify(jr));
const ob = await open(await ticketOf(ub), 'B 的手机');
const devB = ob.result && ob.result.dev;
ok('子账号也能从官网打开面板', !!devB, JSON.stringify(ob));
const wb = await call(devB, 'whoami');
ok('子账号：whoami 是 sub，权限是主账号给的', wb.result && wb.result.role === 'sub' && wb.result.perms.join() === 'msg,node,speed', JSON.stringify(wb));
const code = async (dev, m, p) => { const r = await call(dev, m, p); return r.error ? r.error.code : 0; };
ok('子账号：看首页可以（不是权限错误）', (await code(devB, 'overview')) !== -32012);
ok('子账号：切换节点可以（给了）', (await code(devB, 'px_set', {})) !== -32012);
ok('子账号：改代理设置不行（没给）', (await code(devB, 'oc_set', {})) === -32012);
ok('子账号：终端不行（只有主账号）', (await code(devB, 'term', {})) === -32012);
ok('子账号：文件管理不行', (await code(devB, 'fs_list', {})) === -32012);
ok('子账号：换登录密钥不行', (await code(devB, 'rotate_key', {})) === -32012);
ok('子账号：家人管理（生成加入码）不行', /只有主账号/.test((await call(devB, 'fam', { op: 'join_create', sudo: su.result.sudo })).error?.message || ''));
ok('子账号：AI 工具里的执行命令不行', (await cgi('/' + TOKEN, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'run_command', arguments: { command: 'id' } }, client: 'panel', dev: devB })).error?.code === -32012);
ok('子账号：权限错误的提示说清楚是哪一项', /代理设置/.test((await call(devB, 'oc_set', {})).error?.message || ''));
const suB = (await call(devB, 'fam', { op: 'sudo', code: '' })).result.sudo;
ok('子账号：拿主账号的凭证看不了（凭证只认发给的那个账号）', /确认是你本人/.test((await call(devB, 'device_list', { sudo: su.result.sudo })).error?.message || ''));
const lb = await call(devB, 'device_list', { sudo: suB });
ok('子账号：登录的手机列表里只有自己的', lb.result && lb.result.list.length === 1 && lb.result.list[0].me, JSON.stringify(lb.result));
ok('子账号：不能移除主账号的手机', !!(await call(devB, 'device_remove', { id: devA.slice(0, 8), sudo: suB })).error && !!devs()[devA.slice(0, 8)]);
const mb = await call(devB, 'fam', { op: 'members' });
ok('子账号看家人列表：只看到主账号和自己', mb.result && mb.result.owner && mb.result.subs.length === 1 && mb.result.subs[0].uid === ub, JSON.stringify(mb.result));

// 3. 主账号改权限：缓存 30 秒内会刷新；改完（面板里改的）马上生效
const ss = await call(devA, 'fam', { op: 'sub_set', sudo: su.result.sudo, target: ub, perms: ['msg', 'node', 'speed', 'proxy'] });
ok('主账号给子账号加「代理设置」', !!ss.result, JSON.stringify(ss));
ok('马上生效：子账号能改代理设置了', (await code(devB, 'oc_set', {})) !== -32012);
// 安全加固（第二轮）：「代理设置」不再包括能以 root 运行的东西（自定义脚本、覆写、恢复备份、原版后台），这些要「完全控制」
ok('[完全控制] 代理设置：改两份自定义规则可以', (await code(devB, 'file_save', { kind: 'custom', name: 'openclash_custom_rules.list', content: '' })) !== -32012);
ok('[完全控制] 代理设置：写自定义脚本（.sh）不行', (await code(devB, 'file_save', { kind: 'custom', name: 'openclash_custom_firewall_rules.sh', content: 'id' })) === -32012);
ok('[完全控制] 代理设置：写覆写文件不行', (await code(devB, 'file_save', { kind: 'overwrite', name: 'x.conf', content: 'x' })) === -32012);
ok('[完全控制] 代理设置：改覆写模块设置不行', (await code(devB, 'oc_sec', { op: 'add', type: 'config_overwrite' })) === -32012);
ok('[完全控制] 代理设置：恢复备份、下载覆写模块、原版后台钥匙都不行', (await code(devB, 'restore', {})) === -32012 && (await code(devB, 'overwrite_fetch', {})) === -32012 && (await code(devB, 'luci_key', {})) === -32012);
ok('[完全控制] 代理设置：改配置文件、订阅照样可以', (await code(devB, 'file_save', { kind: 'config', name: 'a.yaml', content: '' })) !== -32012 && (await code(devB, 'oc_sec', { op: 'add', type: 'config_subscribe' })) !== -32012);
{
	const sr = await call(devA, 'fam', { op: 'sub_set', sudo: su.result.sudo, target: ub, perms: ['msg', 'node', 'speed', 'proxy', 'net'] });
	ok('[完全控制] 主账号给了「完全控制」：写自定义脚本、恢复备份可以', !!sr.result && (await code(devB, 'file_save', { kind: 'custom', name: 'openclash_custom_firewall_rules.sh', content: '' })) !== -32012 && (await code(devB, 'restore', {})) !== -32012);
	await call(devA, 'fam', { op: 'sub_set', sudo: su.result.sudo, target: ub, perms: ['msg', 'node', 'speed', 'proxy'] });
	ok('[完全控制] 收回后：又不能写自定义脚本了', (await code(devB, 'file_save', { kind: 'custom', name: 'openclash_custom_firewall_rules.sh', content: '' })) === -32012);
}
// 安全加固（第二轮）：同一台路由器的家人，联系开发者、问题反馈各是各的
{
	const sa = await call(devA, 'chat', { op: 'send', text: '主账号问的：账号转让怎么弄' });
	const sb = await call(devB, 'chat', { op: 'send', text: '家人问的：网速慢' });
	const ga = await call(devA, 'chat', { op: 'get' }), gb = await call(devB, 'chat', { op: 'get' });
	const ta = (ga.result?.msgs || []).map((m) => m.x).join('|'), tb = (gb.result?.msgs || []).map((m) => m.x).join('|');
	ok('[分开对话] 主账号和家人都能发', !!sa.result?.ok && !!sb.result?.ok, JSON.stringify(sa).slice(0, 200) + JSON.stringify(sb).slice(0, 200));
	ok('[分开对话] 主账号只看到自己的', /账号转让/.test(ta) && !/网速慢/.test(ta), ta);
	ok('[分开对话] 家人只看到自己的，看不到主账号的', /网速慢/.test(tb) && !/账号转让/.test(tb), tb);
	const th = await H().chatThreads();
	ok('[分开对话] 官网后台是两个对话：主账号的还是原来那个（d+路由器），家人的写着名字', th.some((t) => t.tid === 'd' + R.sub) && th.some((t) => t.tid === 'd' + R.sub + '.' + ub && /（/.test(t.name)), JSON.stringify(th.map((t) => [t.tid, t.name])));
	const fa = await call(devA, 'feedback', { text: '主账号的反馈内容' }), fbb = await call(devB, 'feedback', { text: '家人的反馈内容' });
	const la = await call(devA, 'fb_replies', { force: true }), lb = await call(devB, 'fb_replies', { force: true });
	const xa = (la.result?.list || []).map((x) => x.text).join('|'), xb = (lb.result?.list || []).map((x) => x.text).join('|');
	ok('[分开反馈] 我的反馈：各看各的', !!fa.result?.code && !!fbb.result?.code && /主账号的反馈/.test(xa) && !/家人的反馈/.test(xa) && /家人的反馈/.test(xb) && !/主账号的反馈/.test(xb), xa + ' / ' + xb);
}
// 在官网上改（路由器缓存还在）：30 秒后才生效；这里把缓存放旧
await H().devSubSet({ sub: R.sub, uid: ua, target: ub, perms: ['msg'] });
{ const t = new Date(Date.now() - 40e3); fs.utimesSync('/tmp/cmcp_fam.json', t, t); }
await call(devB, 'whoami'); // 用旧缓存，后台去拿新的
await new Promise((z) => setTimeout(z, 1500));
ok('官网改的权限：缓存过期后自动拿新的，子账号不能切换节点了', (await code(devB, 'px_set', {})) === -32012);

// 安全加固（第二轮）：路由器连不上官网时，子账号最多按 6 小时内的名单用原来的权限，再久就只能看；主账号不受影响
{
	await H().devSubSet({ sub: R.sub, uid: ua, target: ub, perms: ['msg', 'node'] }); clearCache();
	ok('[连不上官网] 前提：子账号能切换节点', (await code(devB, 'px_set', {})) !== -32012);
	const hc = fs.readFileSync(ETC + '/hub.conf', 'utf8');
	fs.writeFileSync(ETC + '/hub.conf', hc.replace(/^HUB=.*$/m, 'HUB=http://127.0.0.1:9'));
	const old = (h) => { const t = new Date(Date.now() - h * 3600e3); fs.utimesSync('/tmp/cmcp_fam.json', t, t); try { fs.rmSync('/tmp/cmcp_fam.lock', { recursive: true }); } catch (e) {} };
	old(1);
	ok('[连不上官网] 名单是 1 小时前的：子账号照旧能用原来的权限', (await code(devB, 'px_set', {})) !== -32012);
	old(7);
	ok('[连不上官网] 名单是 7 小时前的：子账号只能看（切换节点不行）', (await code(devB, 'px_set', {})) === -32012 && (await code(devB, 'overview')) !== -32012);
	old(7);
	ok('[连不上官网] 名单是 7 小时前的：主账号照常（切换节点可以）', (await code(devA, 'px_set', {})) !== -32012);
	fs.writeFileSync(ETC + '/hub.conf', hc); clearCache();
	ok('[连不上官网] 官网恢复后：子账号马上恢复', (await code(devB, 'px_set', {})) !== -32012);
	await H().devSubSet({ sub: R.sub, uid: ua, target: ub, perms: ['msg'] }); clearCache();
	await call(devB, 'whoami');
}

// 4. 停用子账号：手机钥匙作废
await H().devSubSet({ sub: R.sub, uid: ua, target: ub, off: true }); clearCache();
const off = await call(devB, 'whoami');
ok('子账号被停用：再请求就被挡住，要重新从官网进', !!off.error && [-32010, -32011].includes(off.error.code), JSON.stringify(off));
await H().devSubSet({ sub: R.sub, uid: ua, target: ub, off: false }); clearCache();
const ob2 = await open(await ticketOf(ub), 'B 的手机'); const devB2 = ob2.result && ob2.result.dev;
ok('恢复后重新从官网打开面板就能用', !!devB2 && !!(await call(devB2, 'whoami')).result);
// 5. 移除子账号
await H().devSubRemove({ sub: R.sub, uid: ua, target: ub }); clearCache();
const rm = await call(devB2, 'whoami');
ok('子账号被移除：手机钥匙作废，记录也删了', rm.error?.code === -32010 && !devs()[devB2.slice(0, 8)], JSON.stringify(rm));
ok('被移除的人拿不到票', !(await ticketOf(ub)));

// 6. 外人、老手机、应急登录码
ok('外人拿不到票', !(await ticketOf(uc)));
{ const d = devs(); d.oldphone = { s: 'o'.repeat(32), name: '老手机', at: 1, via: '账号 a***@x.com' }; d.emergenc = { s: 'e'.repeat(32), name: '应急', at: 1, via: '路由器终端的应急登录码' }; fs.writeFileSync(ETC + '/devices.json', JSON.stringify(d)); }
const old = await call('oldphone.' + 'o'.repeat(32), 'whoami');
ok('5.2 以前用登录码登录的手机：作废，提示从官网重新进', old.error?.code === -32010 && /官网/.test(old.error.message) && !devs().oldphone, JSON.stringify(old));
const em = await call('emergenc.' + 'e'.repeat(32), 'whoami');
ok('路由器终端应急登录码登录的手机：按主账号算', em.result?.role === 'owner', JSON.stringify(em));
ok('应急登录码的手机不能管理家人（要从官网进）', /官网/.test((await call('emergenc.' + 'e'.repeat(32), 'fam', { op: 'members' })).error?.message || ''));

// 7. 管理后台「让这个账号所有设备退出」
await new Promise((z) => setTimeout(z, 1100));
await api('/api/admin/famuser/' + ua + '/kick', { why: '测试' }, ADM); clearCache();
const k = await call(devA, 'whoami');
ok('管理后台让主账号所有设备退出：主账号的手机钥匙也作废', k.error?.code === -32010 && !devs()[devA.slice(0, 8)], JSON.stringify(k));
const oa2 = await open(await ticketOf(ua), 'A 的手机');
ok('之后从官网重新打开就好了', !!oa2.result && (await call(oa2.result.dev, 'whoami')).result?.role === 'owner');

// 8. 主账号转让：老主账号变子账号
await H().famJoin(uc, (await H().devJoinCreate({ sub: R.sub, uid: ua, name: 'C', perms: ['msg'] })).code);
await H().devTransfer({ sub: R.sub, uid: ua, target: uc }); clearCache();
const tr = await call(oa2.result.dev, 'whoami');
ok('转让后老主账号原来的手机要重新进', !!tr.error, JSON.stringify(tr));
const oa3 = await open(await ticketOf(ua), 'A 的手机');
ok('老主账号重新进来就是子账号了', (await call(oa3.result.dev, 'whoami')).result?.role === 'sub');
const oc = await open(await ticketOf(uc), 'C 的手机');
ok('新主账号是 owner', (await call(oc.result.dev, 'whoami')).result?.role === 'owner');

// 9. 我的主页：我是谁、改名字、操作记录、敏感信息（要确认本人）、子账号自己退出、同一台手机再从官网打开不算新手机
const devC = oc.result.dev;
const me = await call(devC, 'fam', { op: 'me' });
ok('[主页] 我是谁：名字、打了码的邮箱、身份、路由器名字', me.result && me.result.role === 'main' && /^ca\*\*\*@x\.com$/.test(me.result.me.email) && me.result.router.name === 'Home', JSON.stringify(me));
const pf = await call(devC, 'fam', { op: 'profile', name: '姐姐' });
ok('[主页] 面板里改名字（不用验证码）', !!pf.result && (await S().get('u:' + uc)).name === '姐姐', JSON.stringify(pf));
const lg = await call(devC, 'fam', { op: 'log' });
ok('[主页] 操作记录：有加入、移除、换主账号，不出现邮箱', lg.result && lg.result.list.some((x) => /加入|子账号/.test(x.x)) && lg.result.list.some((x) => /主账号换成/.test(x.x)) && !JSON.stringify(lg.result).includes('@x.com'), JSON.stringify(lg.result).slice(0, 400));
ok('[主页] 敏感信息没确认本人拿不到', !!(await call(devC, 'fam', { op: 'secret', sudo: 'x' })).error);
const su2 = (await call(devC, 'fam', { op: 'sudo', code: '' })).result.sudo;
const sec = await call(devC, 'fam', { op: 'secret', sudo: su2 });
ok('[主页] 确认本人后：完整邮箱、官网登录着的设备、登录记录', sec.result && sec.result.email === 'carol@x.com' && Array.isArray(sec.result.sessions) && sec.result.logins.some((x) => x.k === 'reg'), JSON.stringify(sec).slice(0, 300));
const so = await call(devC, 'fam', { op: 'sess_out', sudo: su2, all: true });
ok('[主页] 官网所有设备退出', so.result && (await S().get('u:' + uc)).sids.length === 0, JSON.stringify(so));
const nb = Object.keys(devs()).length;
const oc2 = await open(await ticketOf(uc), 'C 的手机'.replace('', ''));
const oc3 = await cgi('/open', { jsonrpc: '2.0', id: 1, method: 'panel/open_login', params: { ticket: await ticketOf(uc), name: 'C 的手机', old: oc2.result.dev }, client: 'panel' });
ok('[主页] 同一台手机再从官网打开：换掉旧记录，不多出一条', !!oc3.result && Object.keys(devs()).length === nb + 1 && !devs()[oc2.result.dev.slice(0, 8)], Object.keys(devs()).length + ' / ' + nb);
const lv = await call(oa3.result.dev, 'fam', { op: 'leave' });
ok('[主页] 子账号在面板里自己退出：账号里没了，这台路由器上他的手机都删了', !!lv.result && !(await S().get('d:' + R.sub)).subs[ua] && !Object.values(devs()).some((x) => x.uid === ua), JSON.stringify(lv));
ok('[主页] 主账号不能「退出」（要先转让或解绑）', !!(await call(oc3.result.dev, 'fam', { op: 'leave' })).error);

// 10. 没托管的（自建版）不受影响：不要手机钥匙，全部能用
fs.rmSync(ETC + '/hub.conf');
const self = await cgi('/' + TOKEN, { jsonrpc: '2.0', id: 1, method: 'panel/whoami', params: {}, client: 'panel' });
ok('自建版：不用手机钥匙，whoami 是 owner', self.result?.role === 'owner' && self.result?.hosted === false, JSON.stringify(self));
ok('自建版：没有 /open 入口', !(await cgi('/open', { jsonrpc: '2.0', id: 1, method: 'panel/open_login', params: {} })).result);

server.close(); fs.rmSync(ETC, { recursive: true });
console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 300) + '）')).join('\n'));
const pass = results.filter((r) => r[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

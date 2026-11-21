// 6.0 第 63 项：敏感信息只有一个入口——路由器这边没确认本人就不返回登录密钥、Claude 连接器地址、平板网址、登录着的手机
// 托管版用官网发的凭证（邮箱验证码），自建版 / 应急登录用路由器后台密码换的凭证
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
await new Promise((z) => server.listen(8141, z));
const B = 'http://localhost:8141';
const api = async (p, body, hdr = {}) => (await realFetch(B + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const ADM = { authorization: 'Bearer admin-key-1234567890' };

// 路由器：一台托管版
const inv = (await api('/api/admin/invites', { direct: true,  max: 5 }, ADM)).invite.code;
const R = await api('/api/register', { invite: inv, name: 'Home', model: 'x86' });
const ETC = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpsu-'));
const TOKEN = 'tok' + 'x'.repeat(30);
fs.writeFileSync(ETC + '/config.json', JSON.stringify({ token: TOKEN, ckey: 'c'.repeat(40) }));
fs.writeFileSync(ETC + '/hub.conf', `HUB=${B}\nSUB=${R.sub}\nRKEY=${R.rkey}\n`);
for (const f of ['/tmp/cmcp_fam.json', '/tmp/cmcp_lcfail', '/tmp/cmcp_devseen.json']) try { fs.rmSync(f); } catch (e) {}
try { fs.rmSync('/tmp/cmcp_fam.lock', { recursive: true }); } catch (e) {}
// 跑一次 CGI（异步，等官网回话）
const cgi = (pathInfo, msg, xenv = {}, conf = ETC) => new Promise((z) => {
	const body = JSON.stringify(msg);
	import('child_process').then(({ spawn }) => {
		const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, ...xenv, CLAUDE_MCP_CONF: conf + '/config.json', PATH_INFO: pathInfo, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)) } });
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


for (const f of ['/tmp/cmcp_sudo.json', '/tmp/cmcp_sudo_fail.json']) try { fs.rmSync(f); } catch (e) {}
const mkUser = async (email) => { await api('/api/account/register', { email, password: 'pass-' + email.slice(0, 3) + '-1234' }); return S().get('e:' + email); };
const ua = await mkUser('alice@x.com'), ub = await mkUser('bob@x.com');
{ const d = await S().get('d:' + R.sub); d.users = [ua, ub]; d.owner = ua; d.subs = { [ub]: { perms: ['msg', 'node', 'net'], at: Date.now() } }; await S().put('d:' + R.sub, d);
	for (const u0 of [ua, ub]) { const u = await S().get('u:' + u0); u.devs = [{ sub: R.sub, at: Date.now() }]; await S().put('u:' + u0, u); } }
const devA = (await open(await ticketOf(ua), 'A 的手机')).result.dev;
const devA2 = (await open(await ticketOf(ua), 'A 的平板')).result.dev;
const devB = (await open(await ticketOf(ub), 'B 的手机')).result.dev;
const err = (r) => (r && r.error && r.error.message) || '';

// ---------- 托管版：没确认本人，什么钥匙都拿不到 ----------
ok('[托管] Claude 连接器地址：没确认本人不给', /确认是你本人/.test(err(await call(devA, 'ckey_info'))));
ok('[托管] 平板网址：没确认本人不给', /确认是你本人/.test(err(await call(devA, 'tablet_url'))));
ok('[托管] 登录着的手机：没确认本人不给', /确认是你本人/.test(err(await call(devA, 'device_list'))));
ok('[托管] 移除别的手机：没确认本人不行', /确认是你本人/.test(err(await call(devA, 'device_remove', { id: devB.slice(0, 8) }))) && !!devs()[devB.slice(0, 8)]);
ok('[托管] 换登录密钥：没确认本人不行，密钥没变', /确认是你本人/.test(err(await call(devA, 'rotate_key', { confirm: 'ROTATE' }))) && JSON.parse(fs.readFileSync(ETC + '/config.json', 'utf8')).token === TOKEN);
ok('[托管] 乱写的凭证不行', /确认是你本人/.test(err(await call(devA, 'ckey_info', { sudo: 'abcdefghijkmnpqrstuvwxyz' }))));
const ci = (await call(devA, 'cloud_info')).result || {};
ok('[托管] 云端信息里不再带平板网址（只说有没有）', !/beat\/t\//.test(JSON.stringify(ci)), JSON.stringify(ci));
// 确认本人（官网发的凭证）
const suA = (await call(devA, 'fam', { op: 'sudo', code: '' })).result.sudo;
const ck = await call(devA, 'ckey_info', { sudo: suA });
ok('[托管] 确认本人后：连接器地址给了（测试环境没有专属网址，所以是空的）', ck.result && ck.result.ai === true && !ck.error, JSON.stringify(ck));
ok('[托管] 确认本人后：登录着的手机给了', ((await call(devA, 'device_list', { sudo: suA })).result || {}).list?.length >= 2);
ok('[托管] 凭证记在路由器上，只认发给的那台手机', JSON.parse(fs.readFileSync('/tmp/cmcp_sudo.json', 'utf8'))[suA]?.dev === devA.slice(0, 8));
ok('[托管] 同一个账号的另一台手机拿这个凭证也不行', /确认是你本人/.test(err(await call(devA2, 'ckey_info', { sudo: suA }))));
const suB = (await call(devB, 'fam', { op: 'sudo', code: '' })).result.sudo;
ok('[托管] 子账号（就算有完全控制）：连接器地址不给', /只有主账号/.test(err(await call(devB, 'ckey_info', { sudo: suB }))));
ok('[托管] 子账号：平板网址不给', /只有主账号/.test(err(await call(devB, 'tablet_url', { sudo: suB }))));
ok('[托管] 子账号：拿主账号的凭证不行', /确认是你本人/.test(err(await call(devB, 'device_list', { sudo: suA }))));
ok('[托管] 退出自己这台手机不用确认', !!(await call(devA2, 'device_remove', { self: true })).result && !devs()[devA2.slice(0, 8)]);
// 官网那边凭证过期了：路由器记的也跟着过期
{ const m = JSON.parse(fs.readFileSync('/tmp/cmcp_sudo.json', 'utf8')); m[suA].exp = Math.floor(Date.now() / 1000) - 1; fs.writeFileSync('/tmp/cmcp_sudo.json', JSON.stringify(m)); await S().delete('su:' + suA); }
ok('[托管] 凭证过期（10 分钟）以后不能再用', /确认是你本人/.test(err(await call(devA, 'ckey_info', { sudo: suA }))));

// ---------- 自建版：用路由器后台密码确认本人 ----------
const E2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpsu2-'));
fs.writeFileSync(E2 + '/config.json', JSON.stringify({ token: TOKEN, ckey: 'd'.repeat(40) }));
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpbin-'));
fs.writeFileSync(BIN + '/ubus', `#!/bin/sh
case "$1 $2" in
"list session") echo session ;;
"call session") case "$3" in
	login) case "$4" in *'"right-pw"'*) echo '{"ubus_rpc_session":"0123456789abcdef0123456789abcdef"}' ;; *) exit 6 ;; esac ;;
	destroy) echo "$4" >> ${BIN}/destroyed; exit 0 ;; esac ;;
esac
`, { mode: 0o755 });
fs.writeFileSync(E2 + '/shadow', 'root:$1$ab$cdefghijklmnopqrstuvw:19000:0:99999:7:::\n');
const X = { PATH: BIN + ':' + process.env.PATH, CMCP_SHADOW: E2 + '/shadow' };
let TK2 = TOKEN;
const scall = (method, params, x = X) => cgi('/' + TK2, { jsonrpc: '2.0', id: ++rid, method: 'panel/' + method, params: params || {}, client: 'panel' }, x, E2);
for (const f of ['/tmp/cmcp_sudo_fail.json']) try { fs.rmSync(f); } catch (e) {}
ok('[自建] 没确认本人：连接器地址不给', /确认是你本人/.test(err(await scall('ckey_info'))));
ok('[自建] 没确认本人：换登录密钥不行', /确认是你本人/.test(err(await scall('rotate_key', { confirm: 'ROTATE' }))));
let w = await scall('sudo_local', { pw: 'wrong' });
ok('[自建] 密码不对：说还能再试几次', /密码不对（还能再试 4 次）/.test(err(w)), err(w));
for (let i = 0; i < 3; i++) await scall('sudo_local', { pw: 'wrong' + i });
w = await scall('sudo_local', { pw: 'wrong-5' });
ok('[自建] 连续输错 5 次：锁 15 分钟', /15 分钟后再试/.test(err(w)), err(w));
ok('[自建] 锁着的时候，密码对了也不行', /分钟后再试/.test(err(await scall('sudo_local', { pw: 'right-pw' }))));
fs.rmSync('/tmp/cmcp_sudo_fail.json');
const sl = await scall('sudo_local', { pw: 'right-pw' });
ok('[自建] 密码对了：给一个 10 分钟的凭证', sl.result && /^[a-z0-9]{24}$/.test(sl.result.sudo) && sl.result.exp - Date.now() > 590e3, JSON.stringify(sl));
ok('[自建] 核对完马上注销路由器登录会话', fs.existsSync(BIN + '/destroyed') && /0123456789abcdef0123456789abcdef/.test(fs.readFileSync(BIN + '/destroyed', 'utf8')), JSON.stringify(sl));
ok('[自建] 密码没留在路由器上（临时文件删了）', !fs.readdirSync('/tmp').some((f) => f.startsWith('cmcp_pw.')));
ok('[自建] 输对以后错误次数清零', !fs.existsSync('/tmp/cmcp_sudo_fail.json'));
const ck2 = await scall('ckey_info', { sudo: sl.result?.sudo });
ok('[自建] 有凭证：连接器地址给了', ck2.result && ck2.result.ai === true && !ck2.error, JSON.stringify(ck2));
const rk = await scall('rotate_key', { confirm: 'ROTATE', sudo: sl.result.sudo });
ok('[自建] 有凭证：能换登录密钥', rk.result && /^[a-z0-9]{40}$/.test(rk.result.token || ''), JSON.stringify(rk).slice(0, 200));
if (rk.result) TK2 = rk.result.token;
fs.writeFileSync(E2 + '/shadow', 'root::19000:0:99999:7:::\n');
{ const e = err(await scall('sudo_local', { pw: 'x' })); ok('[自建] 路由器没设后台密码：不拿空密码当验证', /还没设后台密码/.test(e), e); }
{ const e = err(await scall('sudo_local', { pw: 'right-pw' }, { PATH: '/usr/bin:/bin', CMCP_SHADOW: E2 + '/none' })); ok('[自建] 没有登录服务（rpcd）的路由器：说清楚', /没有登录服务/.test(e), e); }

server.close();
for (const d of [ETC, E2, BIN]) fs.rmSync(d, { recursive: true, force: true });
for (const f of ['/tmp/cmcp_sudo.json', '/tmp/cmcp_sudo_fail.json']) try { fs.rmSync(f); } catch (e) {}
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

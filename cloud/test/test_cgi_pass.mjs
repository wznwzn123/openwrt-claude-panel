// 6.0 第 6、12、13 项（路由器这边）：手机钥匙 + 1 小时通行证；钥匙被复制会让那台手机退出；
// 自建版用登录地址换手机钥匙、可以要求再输路由器密码；面板锁由路由器核对（指纹每天至少要一次密码）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_pass.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { load, memStorage } from './load.mjs';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const TMPF = ['/tmp/cmcp_popen', '/tmp/cmcp_pass.json', '/tmp/cmcp_lkok.json', '/tmp/cmcp_lkfail.json', '/tmp/cmcp_sudo.json', '/tmp/cmcp_sudo_fail.json', '/tmp/cmcp_devseen.json', '/tmp/cmcp_fam.json', '/tmp/cmcp_lcfail'];
const clean = () => { for (const f of TMPF) try { fs.rmSync(f); } catch (e) {} };
clean();
const cgi = (conf, pathInfo, msg, xenv = {}) => new Promise((z) => {
	import('child_process').then(({ spawn }) => {
		const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, ...xenv, CLAUDE_MCP_CONF: conf + '/config.json', PATH_INFO: pathInfo, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(JSON.stringify(msg))) } });
		let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
		p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
		p.stdin.end(JSON.stringify(msg));
	});
});
let rid = 0;
const err = (r) => (r && r.error ? r.error.message : '');
const code = (r) => (r && r.error ? r.error.code : 0);

// ---------- 自建版 ----------
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcppass-'));
const TOKEN = 'tok' + 'y'.repeat(30);
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: TOKEN, ckey: 'c'.repeat(40) }));
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpbin-'));
fs.writeFileSync(BIN + '/ubus', `#!/bin/sh
case "$1 $2" in
"list session") echo session ;;
"call session") case "$3" in
	login) case "$4" in *'"right-pw"'*) echo '{"ubus_rpc_session":"0123456789abcdef0123456789abcdef"}' ;; *) exit 6 ;; esac ;;
	destroy) exit 0 ;; esac ;;
esac
`, { mode: 0o755 });
fs.writeFileSync(E + '/shadow', 'root:$1$ab$cdefghijklmnopqrstuvw:19000:0:99999:7:::\n');
const X = { PATH: BIN + ':' + process.env.PATH, CMCP_SHADOW: E + '/shadow' };
const tok = (method, params, extra = {}) => cgi(E, '/' + TOKEN, { jsonrpc: '2.0', id: ++rid, method: 'panel/' + method, params: params || {}, client: 'panel', ...extra }, X);
const pas = (pass, method, params, extra = {}) => cgi(E, '/pass', { jsonrpc: '2.0', id: ++rid, method: method.includes('/') ? method : 'panel/' + method, params: params || {}, client: 'panel', pass, ...extra }, X);
const devs = () => JSON.parse(fs.readFileSync(E + '/devices.json', 'utf8'));

ok('[自建] 旧手机照常能用登录地址（没开路由器密码时不变）', (await tok('whoami')).result?.hosted === false);
let r = await tok('pass_login', { name: '我的手机' });
const D1 = r.result?.dev;
ok('[自建] 用登录地址换到这台手机自己的钥匙', /^[a-z0-9]{8}\.[a-z0-9]{32}$/.test(D1 || ''), JSON.stringify(r));
ok('[自建] 手机钥匙记在路由器上（名字、来源）', devs()[D1.split('.')[0]]?.name === '我的手机' && /登录地址/.test(devs()[D1.split('.')[0]]?.via));
r = await pas('', 'whoami');
ok('[自建] 通行证地址：不带通行证不行（-32013）', code(r) === -32013);
r = await pas('', 'pass_new', { dev: D1 });
const P1 = r.result?.pass;
ok('[自建] 拿手机钥匙换 1 小时的通行证', /^[a-z0-9]{32}$/.test(P1 || '') && Math.abs(r.result.exp - Date.now() - 3600e3) < 60e3, JSON.stringify(r));
r = await pas(P1, 'whoami');
ok('[自建] 带通行证就能用，路由器认得出是哪台手机', r.result && r.result.dev === D1.split('.')[0] && r.result.devName === '我的手机', JSON.stringify(r));
ok('[自建] 通行证地址只给手机面板用（Claude 等别的客户端不行）', /只给手机面板用/.test(err(await pas(P1, 'tools/list', {}, { client: 'claude' }))));
ok('[自建] 乱填的手机钥匙换不到通行证（-32010）', code(await pas('', 'pass_new', { dev: 'abcdefgh.' + 'z'.repeat(32) })) === -32010);
// 通行证过期
{ const m = JSON.parse(fs.readFileSync('/tmp/cmcp_pass.json', 'utf8')); m[P1].exp = Math.floor(Date.now() / 1000) - 1; fs.writeFileSync('/tmp/cmcp_pass.json', JSON.stringify(m)); }
ok('[自建] 通行证过期：-32013（手机会自动再换一张）', code(await pas(P1, 'whoami')) === -32013);
ok('[自建] 路由器重启（内存清空）：通行证全部作废', (() => { fs.rmSync('/tmp/cmcp_pass.json'); return true; })() && code(await pas(P1, 'whoami')) === -32013);
// 钥匙 12 小时自动换新；旧钥匙在新钥匙用过以后又出现 = 被复制
{ const d = devs(); d[D1.split('.')[0]].rot = Math.floor(Date.now() / 1000) - 13 * 3600; fs.writeFileSync(E + '/devices.json', JSON.stringify(d)); }
r = await pas('', 'pass_new', { dev: D1 });
const D2 = r.result?.dev;
ok('[自建] 钥匙用了 12 小时：换通行证时顺便换一把新钥匙', /^[a-z0-9]{8}\.[a-z0-9]{32}$/.test(D2 || '') && D2 !== D1 && D2.split('.')[0] === D1.split('.')[0], JSON.stringify(r));
r = await pas('', 'pass_new', { dev: D1 });
ok('[自建] 新钥匙还没用过时旧钥匙又来（手机没收到回答）：把新钥匙再给一次，不算被复制', r.result?.dev === D2, JSON.stringify(r));
r = await pas('', 'pass_new', { dev: D2 });
const P2 = r.result?.pass;
ok('[自建] 用新钥匙照常换通行证', !!P2 && !r.result.dev);
r = await pas('', 'pass_new', { dev: D1 });
ok('[自建] 新钥匙用过以后旧钥匙又来：判定被复制，让这台手机退出', code(r) === -32010 && /可能被复制/.test(err(r)), JSON.stringify(r));
ok('[自建] 被复制以后：这台手机的钥匙和通行证都作废', !devs()[D1.split('.')[0]] && code(await pas(P2, 'whoami')) === -32013 && code(await pas('', 'pass_new', { dev: D2 })) === -32010);
// 面板锁（路由器核对）
r = await tok('pass_login', { name: '锁屏手机' });
const L = r.result.dev, LID = L.split('.')[0];
let LP = (await pas('', 'pass_new', { dev: L })).result.pass;
const SALT = 'c2FsdHNhbHRzYWx0c2FsdA==', PROOF = 'A'.repeat(43) + '=', BAD = 'B'.repeat(43) + '=';
r = await pas(LP, 'lock_set', { on: 1, salt: SALT, len: 6, lkp: PROOF, fp: 1 });
ok('[锁] 开启面板锁：路由器只存摘要（不存密码，也不存手机算出来的值）', r.result?.on === true && devs()[LID].lk && devs()[LID].lk.h !== PROOF && !JSON.stringify(devs()[LID]).includes(PROOF), JSON.stringify(r));
ok('[锁] whoami 告诉手机这台有面板锁（盐和位数，不给摘要）', (await pas(LP, 'whoami')).result?.lock?.on === true && !(await pas(LP, 'whoami')).result.lock.h);
r = await pas(LP, 'pass_drop');
ok('[锁] 锁上：这台手机的通行证马上作废', r.result?.ok && code(await pas(LP, 'whoami')) === -32013);
{ const LP2 = (await pas('', 'pass_new', { dev: L })).result?.pass; const r2 = await pas('', 'pass_new', { dev: L, prev: LP2 }); ok('[锁] 手上的通行证还没过期：续一张不用输密码', !!r2.result?.pass, JSON.stringify(r2)); }
r = await pas('', 'pass_new', { dev: L });
ok('[锁] 刚输过密码（今天之内）：指纹解锁后能直接换通行证', !!r.result?.pass, JSON.stringify(r));
{ const m = JSON.parse(fs.readFileSync('/tmp/cmcp_lkok.json', 'utf8')); m[LID] = Math.floor(Date.now() / 1000) - 25 * 3600; fs.writeFileSync('/tmp/cmcp_lkok.json', JSON.stringify(m)); }
r = await pas('', 'pass_new', { dev: L });
ok('[锁] 超过一天没输过密码：只用指纹不行，要输一次密码（-32014）', code(r) === -32014 && r.error.data.need_pin && /今天第一次解锁/.test(err(r)), JSON.stringify(r));
r = await pas('', 'pass_new', { dev: L, lkp: BAD });
ok('[锁] 密码不对：说还能试几次', code(r) === -32014 && /还能试 4 次/.test(err(r)), JSON.stringify(r));
r = await pas('', 'pass_new', { dev: L, lkp: PROOF });
LP = r.result?.pass;
ok('[锁] 密码对了：换到通行证，之后一天内指纹就行', !!LP && !!(await pas('', 'pass_new', { dev: L })).result?.pass);
for (let i = 0; i < 5; i++) await pas('', 'pass_new', { dev: L, lkp: BAD });
r = await pas('', 'pass_new', { dev: L, lkp: PROOF });
ok('[锁] 连错 5 次要等（密码对了也先等）', code(r) === -32014 && /后再试/.test(err(r)), JSON.stringify(r));
{ const f = JSON.parse(fs.readFileSync('/tmp/cmcp_lkfail.json', 'utf8')); f[LID].until = 0; f[LID].total = 19; fs.writeFileSync('/tmp/cmcp_lkfail.json', JSON.stringify(f)); }
r = await pas('', 'pass_new', { dev: L, lkp: BAD });
ok('[锁] 累计输错 20 次：这台手机退出（清浏览器数据也绕不过去，钥匙在路由器上作废了）', code(r) === -32010 && !devs()[LID], JSON.stringify(r));
// 只开密码（没开指纹）：新会话一律要输密码，只有拿着没过期的通行证续期才不用
{
	r = await tok('pass_login', { name: '只用密码' });
	const Q = r.result.dev; let QP = (await pas('', 'pass_new', { dev: Q })).result.pass;
	await pas(QP, 'lock_set', { on: 1, salt: SALT, len: 4, lkp: PROOF });
	r = await pas('', 'pass_new', { dev: Q });
	ok('[锁·只有密码] 新会话：今天输过密码也要再输（-32014）', code(r) === -32014 && r.error.data.need_pin, JSON.stringify(r));
	r = await pas('', 'pass_new', { dev: Q, prev: QP });
	ok('[锁·只有密码] 拿着没过期的通行证续期：不用输', !!r.result?.pass, JSON.stringify(r));
	await pas(r.result.pass, 'pass_drop');
	ok('[锁·只有密码] 锁屏作废通行证以后，拿旧通行证也续不了', code(await pas('', 'pass_new', { dev: Q, prev: r.result.pass })) === -32014);
	ok('[锁·只有密码] 输对密码就行', !!(await pas('', 'pass_new', { dev: Q, lkp: PROOF })).result?.pass);
	QP = (await pas('', 'pass_new', { dev: Q, lkp: PROOF })).result.pass;
	ok('[锁] 打开指纹要告诉路由器', (await pas(QP, 'lock_fp', { fp: true })).result?.fp === true && devs()[Q.split('.')[0]].lk.fp === true);
	ok('[锁] 打开指纹以后：今天输过密码，新会话不用再输', !!(await pas('', 'pass_new', { dev: Q })).result?.pass);
}
// 改 / 关面板锁要旧密码
r = await tok('pass_login', { name: '另一台' });
const M = r.result.dev; let MP = (await pas('', 'pass_new', { dev: M })).result.pass;
await pas(MP, 'lock_set', { on: 1, salt: SALT, len: 4, lkp: PROOF });
ok('[锁] 关面板锁：旧密码不对不行', /密码不对/.test(err(await pas(MP, 'lock_set', { on: 0, old: BAD }))));
ok('[锁] 关面板锁：旧密码对了才行', (await pas(MP, 'lock_set', { on: 0, old: PROOF })).result?.on === false && !devs()[M.split('.')[0]].lk);
ok('[锁] 格式不对的密码摘要不收', /格式不对/.test(err(await pas(MP, 'lock_set', { on: 1, salt: 'x', len: 6, lkp: PROOF }))));
// 第 12 项：登录要输路由器密码
ok('[12] 开关要先确认本人', /确认是你本人/.test(err(await pas(MP, 'login_pw_set', { on: 1 }))));
const su = (await pas(MP, 'sudo_local', { pw: 'right-pw' })).result.sudo;
r = await pas(MP, 'login_pw_set', { on: 1, sudo: su });
ok('[12] 确认本人以后能开启「登录要输路由器密码」', r.result?.on === true && fs.existsSync(E + '/login_pw'));
r = await tok('whoami');
ok('[12] 开了以后：光有登录地址不能直接操作路由器（-32015）', code(r) === -32015, JSON.stringify(r));
ok('[12] 开了以后：别的客户端拿登录地址也不行，提示用 AI 连接器地址', /连接器地址/.test(err(await tok('whoami', {}, { client: 'claude' }))));
r = await tok('pass_login', { name: '新手机' });
ok('[12] 开了以后：换手机钥匙要输路由器密码（-32015）', code(r) === -32015 && /路由器后台/.test(err(r)), JSON.stringify(r));
ok('[12] 路由器密码不对：不给钥匙', /密码不对/.test(err(await tok('pass_login', { name: '新手机', pw: 'wrong' }))));
try { fs.rmSync('/tmp/cmcp_sudo_fail.json'); } catch (e) {}
r = await tok('pass_login', { name: '新手机', pw: 'right-pw' });
ok('[12] 路由器密码对了：给手机钥匙', /^[a-z0-9]{8}\.[a-z0-9]{32}$/.test(r.result?.dev || ''), JSON.stringify(r));
ok('[12] 已经登录的手机（用通行证）不受影响', !!(await pas(MP, 'whoami')).result);
ok('[12] whoami 告诉手机开着', (await pas(MP, 'whoami')).result?.login_pw === true);
r = await pas(MP, 'login_link', { sudo: su });
ok('[12] 「添加新手机」的登录链接只在确认本人以后给', r.result?.token === TOKEN && r.result.pw === true && /确认是你本人/.test(err(await pas(MP, 'login_link'))));
await pas(MP, 'login_pw_set', { on: 0, sudo: su });
ok('[12] 关掉以后登录地址恢复原来的用法', !!(await tok('whoami')).result);

// ---------- 托管版：官网打开面板 → 手机钥匙 → 通行证；权限照旧按账号 ----------
const mod = await load();
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => { const u = new URL(typeof input === 'string' ? input : input.url), m = (init.method || 'GET').toUpperCase(); if (u.hostname === 'localhost') return realFetch(input, init); if (u.hostname === 'api.cloudflare.com') { const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] })); if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 't' + Math.random(), token: 'tok' }); if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'd' + Math.random() }); return R({}); } return new Response('{}'); };
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const H = () => env.H.get('hub');
const server = http.createServer(async (req, res) => { const chunks = []; for await (const c of req) chunks.push(c); const body = chunks.length ? Buffer.concat(chunks) : undefined; const rr = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env); const h = {}; rr.headers.forEach((v, k) => { h[k] = v; }); res.writeHead(rr.status, h); res.end(Buffer.from(await rr.arrayBuffer())); });
await new Promise((z) => server.listen(8195, z));
const B = 'http://localhost:8195';
const api = async (p, body, hdr = {}) => (await realFetch(B + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const inv = (await api('/api/admin/invites', { direct: true, max: 5 }, ADM)).invite.code;
const R = await api('/api/register', { invite: inv, name: 'Home', model: 'x86' });
const E3 = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcppass3-'));
fs.writeFileSync(E3 + '/config.json', JSON.stringify({ token: TOKEN, ckey: 'c'.repeat(40) }));
fs.writeFileSync(E3 + '/hub.conf', `HUB=${B}\nSUB=${R.sub}\nRKEY=${R.rkey}\n`);
clean();
const reg = async (email) => { const c = await realFetch(B + '/api/account/register', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ email, password: 'pass-' + email.slice(0, 3) + '-123' }) }); return (await H().ctx.storage.get('e:' + email)); };
const ua = await reg('owner@x.com');
{ const d = await H().ctx.storage.get('d:' + R.sub); d.users = [ua]; d.owner = ua; await H().ctx.storage.put('d:' + R.sub, d); const u = await H().ctx.storage.get('u:' + ua); u.devs = [{ sub: R.sub, name: 'Home' }]; await H().ctx.storage.put('u:' + ua, u); }
const tk = (await H().famOpen(ua, R.sub)).url; const ticket = (/#open=([a-z2-9]{24})$/.exec(tk || '') || [])[1];
r = await cgi(E3, '/open', { jsonrpc: '2.0', id: ++rid, method: 'panel/open_login', params: { ticket, name: '主账号手机' }, client: 'panel' });
const HD = r.result?.dev;
ok('[托管] 官网打开面板：拿到手机钥匙，不再给登录密钥', /^[a-z0-9]{8}\.[a-z0-9]{32}$/.test(HD || '') && !('token' in (r.result || {})), JSON.stringify(r));
const hp = (pass, method, params) => cgi(E3, '/pass', { jsonrpc: '2.0', id: ++rid, method: 'panel/' + method, params: params || {}, client: 'panel', pass });
r = await hp('', 'pass_new', { dev: HD });
const HP = r.result?.pass;
ok('[托管] 手机钥匙换通行证', !!HP, JSON.stringify(r));
try { fs.rmSync('/tmp/cmcp_popen'); } catch (e) {}
r = await hp(HP, 'whoami');
const po = Number(fs.existsSync('/tmp/cmcp_popen') ? fs.readFileSync('/tmp/cmcp_popen', 'utf8') : 0);
ok('[托管] 手机面板用着：记下最后打开面板的时间（后台「打开面板 x 前」，用户 11/28）', Math.abs(po - Date.now() / 1000) < 30, String(po));
ok('[托管] 心跳带上打开面板时间、几秒前打开的（pa，V4 起用官网的钟算）和补丁号', /"po":%s,"pa":%s,"hot":%s/.test(fs.readFileSync('../src/bin/cmcp-watchdog', 'utf8')));
ok('[托管] 通行证地址照样按账号查权限（主账号）', r.result?.role === 'owner' && r.result.uid === ua, JSON.stringify(r));
ok('[托管] 托管版不能用登录地址换钥匙（要走官网）', /官网/.test(err(await cgi(E3, '/' + TOKEN, { jsonrpc: '2.0', id: ++rid, method: 'panel/pass_login', params: {}, client: 'panel', dev: HD }))));
ok('[托管] 没登录的手机换通行证：提示从官网打开（带 need_code）', (() => true)() && (await hp('', 'pass_new', { dev: 'x' })).error?.data?.need_code === true);
server.close();
clean();
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

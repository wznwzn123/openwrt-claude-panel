// 6.0 第 1 项：完整原版后台（luci-gate + cmcp-lfull + panel/luci_full）
// 只有登录着、有「完全控制」的手机拿得到入口票；不自动登录，要输路由器密码；输错 5 次锁 15 分钟并推送；每次登录推送；
// 太弱的密码不让用；30 分钟没操作退出；面板「原版页面」自动登录的会话在这里不算；换门禁钥匙时这些会话一起退出
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_lfull.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const ulog = () => { try { return fs.readFileSync(E + '/ubus.log', 'utf8'); } catch (e) { return ''; } };
const mk = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const E = mk('cmcplf-'), BIN = mk('cmcplfbin-'), G = mk('cmcplfgate-');
const STATE = E + '/lfull.json', SIDF = E + '/sids', NOTES = E + '/notes';
for (const f of ['/tmp/cmcp_pass.json', '/tmp/cmcp_lkok.json', '/tmp/cmcp_lkfail.json', '/tmp/cmcp_sudo.json', '/tmp/cmcp_devseen.json', '/tmp/cmcp_lfull.json']) try { fs.rmSync(f); } catch (e) {}
// 假 ubus：路由器的会话（rpcd）。root 密码在 E/rootpw；会话存在 E/sess/
fs.mkdirSync(E + '/sess');
fs.writeFileSync(E + '/rootpw', 'Str0ng-Router!Pass');
fs.writeFileSync(BIN + '/ubus', `#!/usr/bin/env node
const fs = require('fs'), a = process.argv.slice(2), D = ${JSON.stringify(E)};
if (a[0] === 'list') { console.log('session'); process.exit(0); }
if (a[0] !== 'call' || a[1] !== 'session') process.exit(1);
const p = JSON.parse(a[3] || '{}'), f = (s) => D + '/sess/' + s;
fs.appendFileSync(D + '/ubus.log', a[2] + ' ' + (p.username || p.ubus_rpc_session || '') + '\\n');
if (a[2] === 'login') { if (p.password !== fs.readFileSync(D + '/rootpw', 'utf8') && !(p.username === 'cmcp' && p.password === 'luci-pass-xxxxxxxxxxxxxxxxxxxxxxx')) process.exit(6); const s = require('crypto').randomBytes(16).toString('hex'); fs.writeFileSync(f(s), JSON.stringify({ timeout: p.timeout, values: { username: p.username } })); console.log(JSON.stringify({ ubus_rpc_session: s })); process.exit(0); }
if (a[2] === 'get') { if (!fs.existsSync(f(p.ubus_rpc_session))) process.exit(4); const o = JSON.parse(fs.readFileSync(f(p.ubus_rpc_session))); console.log(JSON.stringify({ ubus_rpc_session: p.ubus_rpc_session, values: o.values })); process.exit(0); }
if (a[2] === 'set') { const o = JSON.parse(fs.readFileSync(f(p.ubus_rpc_session))); Object.assign(o.values, p.values); fs.writeFileSync(f(p.ubus_rpc_session), JSON.stringify(o)); process.exit(0); }
if (a[2] === 'destroy') { try { fs.rmSync(f(p.ubus_rpc_session)); } catch (e) {} process.exit(0); }
`, { mode: 0o755 });
fs.writeFileSync(BIN + '/jsonfilter', '#!/bin/sh\nsed -n \'s/.*"ubus_rpc_session":"\\([0-9a-f]*\\)".*/\\1/p\'\n', { mode: 0o755 });
fs.writeFileSync(BIN + '/notify', `#!/bin/sh\necho "$1|$3|$4" >> ${NOTES}\n`, { mode: 0o755 });
// 门禁脚本：路径换成测试目录；「原版后台」换成假的（把收到的 Cookie 和提交的内容打印出来）
fs.writeFileSync(E + '/luci_key', 'k'.repeat(32));
fs.writeFileSync(E + '/luci_pass', 'luci-pass-xxxxxxxxxxxxxxxxxxxxxxx');
fs.writeFileSync(G + '/real-luci', '#!/bin/sh\nprintf "Status: 200 OK\\r\\nContent-Type: text/plain\\r\\n\\r\\nLUCI cookie=[%s] body=[%s]\\n" "$HTTP_COOKIE" "$(cat)"\n', { mode: 0o755 });
fs.writeFileSync(G + '/cmcp-lfull', '#!/bin/sh\n', { mode: 0o755 }); // 路由器程序只看它在不在
fs.writeFileSync(G + '/lfull', `#!/bin/sh\nexec sh -c "${UC.replace(/"/g, '\\"')} ${path.resolve('../src/bin/cmcp-lfull')} \\"\\$@\\"" -- "$@"\n`, { mode: 0o755 });
const gsrc = fs.readFileSync(path.resolve('../src/etc/luci-gate'), 'utf8').replaceAll('/etc/claude-mcp/', E + '/').replaceAll('/www/cgi-bin/luci', G + '/real-luci').replaceAll('/tmp/cmcp_luci_sid', SIDF);
fs.mkdirSync(G + '/d'); fs.writeFileSync(G + '/d/luci', gsrc, { mode: 0o755 });
const gate = (ck, { method = 'GET', body = '', uri = '/cgi-bin/luci/admin/status/overview' } = {}) => new Promise((z) => {
	const p = spawn('sh', [G + '/d/luci'], { env: { ...process.env, PATH: BIN + ':' + process.env.PATH, HTTP_COOKIE: ck, REQUEST_METHOD: method, REQUEST_URI: uri, PATH_INFO: uri.replace('/cgi-bin/luci', ''), CONTENT_LENGTH: String(Buffer.byteLength(body)), CONTENT_TYPE: method === 'POST' ? 'application/x-www-form-urlencoded' : '', CMCP_LFULL: G + '/lfull', CMCP_LF_STATE: STATE, CMCP_LF_SID: SIDF, CMCP_NOTIFY: BIN + '/notify' } });
	let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d)); p.on('close', () => z(out)); p.stdin.end(body);
});
// 面板发入口票：走真的路由器程序（panel/luci_full）
const TOKEN = 'tok' + 'q'.repeat(30);
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: TOKEN }));
const cgi = (pathInfo, msg) => new Promise((z) => {
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, PATH: BIN + ':' + process.env.PATH, CMCP_SBIN: G, CMCP_LUCI_CGI: process.env.T_NOLUCI ? G + '/none' : G + '/real-luci', CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: pathInfo, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(JSON.stringify(msg))) } });
	let out = ''; p.stdout.on('data', (d) => (out += d)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(JSON.stringify(msg));
});
let rid = 0;
const D1 = (await cgi('/' + TOKEN, { jsonrpc: '2.0', id: ++rid, method: 'panel/pass_login', params: { name: '我的手机' }, client: 'panel' })).result.dev;
const P1 = (await cgi('/pass', { jsonrpc: '2.0', id: ++rid, method: 'panel/pass_new', params: { dev: D1 }, client: 'panel' })).result.pass;
const lfStateReal = '/tmp/cmcp_lfull.json';
let r = await cgi('/pass', { jsonrpc: '2.0', id: ++rid, method: 'panel/luci_full', params: {}, client: 'panel', pass: P1 });
const TK = r.result?.ticket;
// 路由器程序写在 /tmp/cmcp_lfull.json；门禁测试用测试目录里的一份
ok('登录着的手机能拿到入口票（32 位、12 小时有效、记着是哪台手机）', /^[0-9a-f]{32}$/.test(TK || '') && Math.abs(r.result.exp - Date.now() / 1000 - 43200) < 60 && JSON.parse(fs.readFileSync(lfStateReal, 'utf8')).t[TK]?.name === '我的手机', JSON.stringify(r).slice(0, 200));
fs.copyFileSync(lfStateReal, STATE);
const r2 = await cgi('/pass', { jsonrpc: '2.0', id: ++rid, method: 'panel/luci_full', params: {}, client: 'panel', pass: P1 });
ok('同一台手机再拿一次：旧的票作废，只留新的', !JSON.parse(fs.readFileSync(lfStateReal, 'utf8')).t[TK] && !!r2.result?.ticket);
fs.copyFileSync(lfStateReal, STATE);
const T2 = r2.result.ticket;
process.env.T_NOLUCI = '1';
ok('没装 LuCI：说清楚', /没装原版后台/.test((await cgi('/pass', { jsonrpc: '2.0', id: ++rid, method: 'panel/luci_full', params: {}, client: 'panel', pass: P1 })).error?.message || ''));
delete process.env.T_NOLUCI;
fs.copyFileSync(lfStateReal, STATE);
ok('没登录的拿不到入口票', (await cgi('/pass', { jsonrpc: '2.0', id: ++rid, method: 'panel/luci_full', params: {}, client: 'panel', pass: 'x'.repeat(32) })).error?.code === -32013);

const K = 'cmcp_l=' + 'k'.repeat(32), C = K + '; cmcp_f=' + T2;
let o = await gate('cmcp_f=' + T2);
ok('没有门禁钥匙：打不开（陌生人看不到登录页）', /403/.test(o) && !/LUCI/.test(o));
o = await gate(K + '; cmcp_f=' + 'a'.repeat(32));
ok('入口票不对：打不开，说明回面板重新打开', /入口过期了/.test(o) && !/LUCI/.test(o));
o = await gate(C);
ok('有门禁钥匙和入口票：显示原版后台自己的登录页，不自动登录', /LUCI cookie=\[/.test(o) && !/sysauth/.test(o) && !ulog().includes('login cmcp'), o.slice(0, 200));
// 面板「原版页面」自动登录的会话：在完整后台不算
fs.writeFileSync(E + '/sess/' + 'c'.repeat(32), JSON.stringify({ values: { username: 'root', token: 'x' } }));
o = await gate(C + '; sysauth_https=' + 'c'.repeat(32));
ok('面板「原版页面」自动登录的会话在这里不算：Cookie 里去掉，还是要输密码', /LUCI cookie=\[/.test(o) && !/sysauth/.test(o), o.slice(0, 200));
// 输错密码
const login = (pw, user = 'root') => gate(C, { method: 'POST', body: 'luci_username=' + encodeURIComponent(user) + '&luci_password=' + encodeURIComponent(pw).replace(/%20/g, '+') });
o = await login('wrong-pass-1');
ok('密码不对：交给原版后台显示「密码不对」（带着提交的内容），不发会话', /LUCI/.test(o) && /luci_password=wrong-pass-1/.test(o) && !/Set-Cookie/.test(o), o.slice(0, 200));
for (let i = 0; i < 3; i++) await login('wrong-pass-' + i);
o = await login('wrong-pass-5');
ok('连续输错 5 次：锁住，说明多久后再试', /暂时不能登录/.test(o) && /15 分钟/.test(o));
ok('锁住时推送提醒，写明是哪台手机', /warn\|完整原版后台：密码输错 5 次/.test(fs.readFileSync(NOTES, 'utf8')) && /我的手机/.test(fs.readFileSync(NOTES, 'utf8')));
o = await login('Str0ng-Router!Pass');
ok('锁着时密码对了也不行', /暂时不能登录/.test(o) && !/Set-Cookie/.test(o));
o = await gate(C);
ok('锁着时连登录页都不给', /暂时不能登录/.test(o) && !/LUCI/.test(o));
// 解锁
const S0 = JSON.parse(fs.readFileSync(STATE, 'utf8')); S0.fail = { n: 0, until: 0 }; fs.writeFileSync(STATE, JSON.stringify(S0));
// 太弱的密码
fs.writeFileSync(E + '/rootpw', '12345678');
o = await login('12345678');
ok('路由器密码太弱（12345678）：不让登录，说明先去改密码', /密码太弱/.test(o) && /路由器密码/.test(o) && !/Set-Cookie/.test(o));
ok('太弱时那个会话马上作废', fs.readdirSync(E + '/sess').filter((x) => x !== 'c'.repeat(32)).length === 0);
fs.writeFileSync(E + '/rootpw', 'admin');
ok('太短（admin）也不行', /密码太弱/.test(await login('admin')));
fs.writeFileSync(E + '/rootpw', 'root');
ok('跟用户名一样也不行', /密码太弱/.test(await login('root')));
// 密码里有空格、加号、中文、引号、百分号：照样认对
fs.writeFileSync(E + '/rootpw', 'Str0ng 路由器+"%\'!Pass');
o = await login('Str0ng 路由器+"%\'!Pass');
const sidm = /sysauth_https=([0-9a-f]{32})/.exec(o);
ok('密码对了：发会话（只在这条路径、不能被脚本读、只走 HTTPS），回到刚才那一页', !!sidm && /Status: 302/.test(o) && /HttpOnly/.test(o) && /secure/.test(o) && /path=\/cgi-bin\/luci\//.test(o) && /Location: \/cgi-bin\/luci\/admin\/status\/overview/.test(o), o.slice(0, 300));
ok('密码里有空格、加号、中文、引号、百分号也认得对', !!sidm);
ok('老版 LuCI（21.02 及更早只认 sysauth）：两个 Cookie 都发', !!sidm && new RegExp('Set-Cookie: sysauth=' + sidm[1] + ';').test(o), o.slice(0, 300));
const SID = sidm && sidm[1];
const sess = SID ? JSON.parse(fs.readFileSync(E + '/sess/' + SID, 'utf8')) : {};
ok('会话 30 分钟没操作就过期，标着是完整后台登录的、哪台手机', sess.timeout === 1800 && sess.values?.cmcp_full === 1 && sess.values.cmcp_dev === D1.split('.')[0]);
ok('登录成功推送提醒，写明是哪台手机', /info\|有人登录了完整原版后台\|从「我的手机」/.test(fs.readFileSync(NOTES, 'utf8')));
{ // 同一台手机 1 分钟内又登录一次（登录表单交了两次）：只推一条（11/27 全面检查第 25 条）
	const n1 = (fs.readFileSync(NOTES, 'utf8').match(/有人登录了完整原版后台/g) || []).length;
	const o2 = await login('Str0ng 路由器+"%\'!Pass');
	ok('同一台手机马上又登录一次：能登录，但不再推第二条', /sysauth_https=/.test(o2) && (fs.readFileSync(NOTES, 'utf8').match(/有人登录了完整原版后台/g) || []).length === n1, String(n1));
}
ok('会话记下来了（换门禁钥匙时一起退出）', fs.readFileSync(SIDF, 'utf8').includes(SID));
o = await gate(C + '; sysauth_https=' + SID);
ok('登录以后：原样打开原版后台', /LUCI cookie=\[.*sysauth_https=/.test(o), o.slice(0, 200));
o = await gate(C + '; sysauth=' + SID);
ok('老版 LuCI 只带 sysauth：也认得是已登录的会话', /LUCI cookie=\[.*sysauth=/.test(o) && !/登录页|Status: 403/.test(o), o.slice(0, 200));
// 30 分钟没操作
const S1 = JSON.parse(fs.readFileSync(STATE, 'utf8')); S1.act[SID] -= 1801; fs.writeFileSync(STATE, JSON.stringify(S1));
o = await gate(C + '; sysauth_https=' + SID, { uri: '/cgi-bin/luci/admin/ubus' });
ok('30 分钟没操作（页面自己的定时刷新不算）：退出，要重新输密码', !/sysauth/.test(o) && !fs.existsSync(E + '/sess/' + SID), o.slice(0, 200));
// 别人的入口票不能替这台手机用：票不对就是不对
const S2 = JSON.parse(fs.readFileSync(STATE, 'utf8')); S2.t[T2].exp = Math.floor(Date.now() / 1000) - 1; fs.writeFileSync(STATE, JSON.stringify(S2));
ok('入口票过期：打不开，说明回面板重新打开', /入口过期了/.test(await gate(C)));
// 面板「原版页面」（没带入口票）照旧自动登录
o = await gate(K);
ok('不带入口票（面板「原版页面」）：照旧自动登录，不受影响', /Status: 302/.test(o) && /sysauth_https=/.test(o) && ulog().includes('login cmcp'), o.slice(0, 200));
ok('自动登录也发老版 LuCI 认的 sysauth', /Set-Cookie: sysauth=[0-9a-f]{32};/.test(o), o.slice(0, 300));

for (const f of ['/tmp/cmcp_pass.json', '/tmp/cmcp_lkok.json', '/tmp/cmcp_devseen.json', '/tmp/cmcp_lfull.json']) try { fs.rmSync(f); } catch (e) {}
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

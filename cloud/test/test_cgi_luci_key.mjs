// 6.0 第 53 项：原版页面（LuCI）的门禁钥匙跟着换——换登录密钥、移除手机时换新，旧钥匙马上作废，
// 门禁替手机自动登录的原版后台会话一起退出；换手机钥匙、改名字这类不换；门禁脚本只认新钥匙
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_luci_key.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SIDF = '/tmp/cmcp_luci_sid';
const TMPF = ['/tmp/cmcp_pass.json', '/tmp/cmcp_lkok.json', '/tmp/cmcp_lkfail.json', '/tmp/cmcp_sudo.json', '/tmp/cmcp_sudo_fail.json', '/tmp/cmcp_devseen.json', '/tmp/cmcp_fam.json', SIDF];
const clean = () => { for (const f of TMPF) try { fs.rmSync(f); } catch (e) {} };
clean();
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcplk-'));
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcplkbin-'));
const UBUS_LOG = E + '/ubus.log';
fs.writeFileSync(BIN + '/ubus', `#!/bin/sh
echo "$*" >> ${UBUS_LOG}
case "$1 $2" in
"list session") echo session ;;
"call session") case "$3" in
	login) case "$4" in *'"right-pw"'*) echo '{"ubus_rpc_session":"0123456789abcdef0123456789abcdef"}' ;; *) exit 6 ;; esac ;;
	destroy) exit 0 ;; esac ;;
esac
`, { mode: 0o755 });
fs.writeFileSync(E + '/shadow', 'root:$1$ab$cdefghijklmnopqrstuvw:19000:0:99999:7:::\n');
const TOKEN = 'tok' + 'z'.repeat(30);
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: TOKEN, ckey: 'c'.repeat(40) }));
const OLDK = 'o'.repeat(32);
fs.writeFileSync(E + '/luci_key', OLDK);
const X = { PATH: BIN + ':' + process.env.PATH, CMCP_SHADOW: E + '/shadow' };
const cgi = (pathInfo, msg) => new Promise((z) => {
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, ...X, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: pathInfo, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(JSON.stringify(msg))) } });
	let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(JSON.stringify(msg));
});
let rid = 0;
const tok = (m, p) => cgi('/' + TOKEN, { jsonrpc: '2.0', id: ++rid, method: 'panel/' + m, params: p || {}, client: 'panel' });
const pas = (pass, m, p) => cgi('/pass', { jsonrpc: '2.0', id: ++rid, method: 'panel/' + m, params: p || {}, client: 'panel', pass });
const key = () => fs.readFileSync(E + '/luci_key', 'utf8');
const destroyed = () => (fs.existsSync(UBUS_LOG) ? fs.readFileSync(UBUS_LOG, 'utf8') : '').split('\n').filter((l) => /session destroy/.test(l));

// 两台手机登录
const D1 = (await tok('pass_login', { name: '我的手机' })).result.dev;
const D2 = (await tok('pass_login', { name: '旧手机' })).result.dev;
const P1 = (await pas('', 'pass_new', { dev: D1 })).result.pass;
ok('手机登录（新加手机）不换门禁钥匙', key() === OLDK);
let r = await pas(P1, 'luci_key');
ok('登录着的手机能拿到现在的门禁钥匙', r.result?.key === OLDK, JSON.stringify(r));
await pas('', 'pass_new', { dev: D1 });
ok('续通行证不换', key() === OLDK);

// 门禁替手机自动登录过两次（记在 /tmp/cmcp_luci_sid），外加一行乱写的
const S1 = 'a'.repeat(32), S2 = 'b'.repeat(32);
fs.writeFileSync(SIDF, S1 + '\n' + S2 + '\n' + "x'; reboot; '\n");
const su = (await pas(P1, 'sudo_local', { pw: 'right-pw' })).result.sudo;
r = await pas(P1, 'device_remove', { id: D2.split('.')[0], sudo: su });
const K2 = key();
ok('移除一台手机：门禁钥匙马上换新', r.result?.ok && K2 !== OLDK && /^[a-z0-9]{32}$/.test(K2), JSON.stringify(r));
ok('门禁钥匙文件只有路由器自己能读（600）', (fs.statSync(E + '/luci_key').mode & 0o777) === 0o600);
const ds = destroyed();
ok('门禁替手机自动登录的原版后台会话全部退出', ds.some((l) => l.includes(S1)) && ds.some((l) => l.includes(S2)), ds.join(' | '));
ok('会话记录里乱写的内容不会被拿去执行', !ds.some((l) => /reboot/.test(l)));
ok('退出以后会话记录清掉', !fs.existsSync(SIDF));
r = await pas(P1, 'luci_key');
ok('留下的手机照常能用，拿到的是新钥匙', r.result?.key === K2);
ok('被移除的手机换不到通行证，也就拿不到新钥匙', (await pas('', 'pass_new', { dev: D2 })).error?.code === -32010);

// 换登录密钥
r = await pas(P1, 'rotate_key', { confirm: 'ROTATE', sudo: su });
const K3 = key();
ok('换登录密钥：门禁钥匙一起换', !!r.result?.token && K3 !== K2 && /^[a-z0-9]{32}$/.test(K3), JSON.stringify(r).slice(0, 200));
ok('换登录密钥：这台手机照常能用、拿到新钥匙', (await pas(P1, 'luci_key')).result?.key === K3);

// 退出自己这台也换（钥匙被复制、面板锁输错太多被退出，都是移除手机）
const NT = JSON.parse(fs.readFileSync(E + '/config.json', 'utf8')).token;
ok('旧登录地址马上作废', (await tok('whoami')).error != null);
const D3 = (await cgi('/' + NT, { jsonrpc: '2.0', id: ++rid, method: 'panel/pass_login', params: { name: '第三台' }, client: 'panel' })).result?.dev;
const P3 = (await pas('', 'pass_new', { dev: D3 })).result?.pass;
await pas(P3, 'device_remove', { self: true });
ok('手机自己退出登录：门禁钥匙也换', key() !== K3);

// 没装原版页面入口的老安装：不凭空生成
fs.rmSync(E + '/luci_key');
const D4 = (await cgi('/' + NT, { jsonrpc: '2.0', id: ++rid, method: 'panel/pass_login', params: { name: '第四台' }, client: 'panel' })).result?.dev;
const P4 = (await pas('', 'pass_new', { dev: D4 || '' })).result?.pass;
await pas(P4, 'device_remove', { self: true });
ok('没有门禁钥匙的老安装：移除手机时不凭空生成', !!D4 && !fs.existsSync(E + '/luci_key'));

// ---------- 门禁脚本（luci-gate）：只认现在的钥匙；自动登录的会话记下来 ----------
const G = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpgate-'));
fs.writeFileSync(G + '/luci_key', 'n'.repeat(32));
fs.writeFileSync(G + '/luci_pass', 'p'.repeat(32));
fs.writeFileSync(G + '/real-luci', '#!/bin/sh\nprintf "Status: 200 OK\\r\\nContent-Type: text/plain\\r\\n\\r\\nLUCI %s\\n" "$HTTP_COOKIE"\n', { mode: 0o755 });
fs.writeFileSync(BIN + '/jsonfilter', '#!/bin/sh\nsed -n \'s/.*"ubus_rpc_session":"\\([0-9a-f]*\\)".*/\\1/p\'\n', { mode: 0o755 });
fs.writeFileSync(BIN + '/ubus', `#!/bin/sh
case "$3" in
	get) exit 1 ;;
	login) echo '{"ubus_rpc_session":"cccccccccccccccccccccccccccccccc"}' ;;
esac
`, { mode: 0o755 });
const gsrc = fs.readFileSync(path.resolve('../src/etc/luci-gate'), 'utf8').replaceAll('/etc/claude-mcp/', G + '/').replaceAll('/www/cgi-bin/luci', G + '/real-luci').replaceAll('/tmp/cmcp_luci_sid', G + '/sid');
fs.mkdirSync(G + '/d');
fs.writeFileSync(G + '/d/luci', gsrc, { mode: 0o755 }); // 门禁脚本按自己的名字（luci）判断要转给谁
const gate = (ck) => spawnSync('sh', [G + '/d/luci'], { env: { ...process.env, PATH: BIN + ':' + process.env.PATH, HTTP_COOKIE: ck, REQUEST_METHOD: 'POST', REQUEST_URI: '/cgi-bin/luci/' }, encoding: 'utf8' }).stdout;
ok('门禁：旧钥匙打不开（403）', /403/.test(gate('cmcp_l=' + 'o'.repeat(32))));
ok('门禁：没带钥匙打不开', /403/.test(gate('')));
const out = gate('cmcp_l=' + 'n'.repeat(32));
ok('门禁：新钥匙能进，自动登录后转给原版后台', /LUCI sysauth_https=c{32}/.test(out), out.slice(0, 200));
ok('门禁：自动登录的会话记下来（换钥匙时退出用）', fs.existsSync(G + '/sid') && fs.readFileSync(G + '/sid', 'utf8').trim() === 'c'.repeat(32), fs.existsSync(G + '/sid') ? fs.readFileSync(G + '/sid', 'utf8') : '没有记录');
for (let i = 0; i < 60; i++) gate('cmcp_l=' + 'n'.repeat(32));
ok('门禁：会话记录最多留 50 个', !fs.existsSync(G + '/sid') || fs.readFileSync(G + '/sid', 'utf8').trim().split('\n').length <= 50);

clean();
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

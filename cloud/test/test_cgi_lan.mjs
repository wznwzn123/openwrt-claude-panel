// 6.0 第 82 项：家里局域网直接打开面板（http://路由器地址:906）
// 原版后台「服务 → 路由器面板」发一张 2 分钟、用一次的票（rpcd 插件），或者输路由器后台密码，换这台设备的钥匙，按主账号算；
// 只认家里局域网来的请求（隧道进来的 127.0.0.1、经过反向代理的、别的网站偷偷发的、DNS 重绑定的都不认）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_lan.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const TMPF = ['/tmp/cmcp_pass.json', '/tmp/cmcp_sudo.json', '/tmp/cmcp_sudo_fail.json', '/tmp/cmcp_devseen.json'];
const clean = () => { for (const f of TMPF) try { fs.rmSync(f); } catch (e) {} };
clean();

const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcplan-'));
const CFG = E + '/uci'; fs.mkdirSync(CFG);
fs.writeFileSync(CFG + '/network', "config interface 'lan'\n\toption proto 'static'\n\toption ipaddr '192.168.6.1'\n\toption netmask '255.255.255.0'\n");
const LT = E + '/lt';
const TOKEN = 'tok' + 'l'.repeat(30);
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: TOKEN, ckey: 'c'.repeat(40), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG }));
fs.writeFileSync(E + '/lan_port', '9906\n');
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpbin-'));
fs.writeFileSync(BIN + '/ubus', `#!/bin/sh
case "$1 $2" in
"list session") echo session ;;
"call session") case "$3" in
	login) case "$4" in *'"right-pw"'*) echo '{"ubus_rpc_session":"0123456789abcdef0123456789abcdef"}' ;; *) exit 6 ;; esac ;;
	destroy) exit 0 ;; esac ;;
esac
`, { mode: 0o755 });
fs.writeFileSync(BIN + '/cmcp-notify', `#!/bin/sh\necho "$*" >> ${BIN}/notified\n`, { mode: 0o755 });
fs.writeFileSync(E + '/shadow', 'root:$1$ab$cdefghijklmnopqrstuvw:19000:0:99999:7:::\n');
const LANENV = { REMOTE_ADDR: '192.168.6.23', HTTP_HOST: '192.168.6.1:9906', CONTENT_TYPE: 'application/json' };
const X = { PATH: BIN + ':' + process.env.PATH, CMCP_SHADOW: E + '/shadow', CMCP_LAN_T: LT, CMCP_SBIN: BIN };

const cgi = (pathInfo, msg, xenv = {}) => new Promise((z) => {
	const body = JSON.stringify(msg);
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, ...X, ...xenv, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: pathInfo, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)) } });
	let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
let rid = 0;
const err = (r) => (r && r.error ? r.error.message : '');
const lan = (method, params, env = LANENV) => cgi('/lan', { jsonrpc: '2.0', id: ++rid, method: 'panel/' + method, params: params || {}, client: 'panel' }, env);
const pas = (pass, method, params) => cgi('/pass', { jsonrpc: '2.0', id: ++rid, method: 'panel/' + method, params: params || {}, client: 'panel', pass }, LANENV);
const devs = () => { try { return JSON.parse(fs.readFileSync(E + '/devices.json', 'utf8')); } catch (e) { return {}; } };
// rpcd 插件：原版后台登录了的人点「路由器面板」时调
const rpcd = (...a) => spawnSync('sh', [path.resolve('../src/luci/rpcd-cmcp'), ...a], { env: { ...process.env, CMCP_LAN_T: LT, CMCP_LAN_ETC: E }, encoding: 'utf8' }).stdout;
const ticket = () => JSON.parse(rpcd('call', 'ticket'));

// ---------- rpcd 插件 ----------
ok('rpcd 插件：列出 ticket 方法', JSON.parse(rpcd('list')).ticket !== undefined);
let t1 = ticket();
ok('rpcd 插件：发一张 24 位的票，带上局域网端口', /^[a-z2-9]{24}$/.test(t1.ticket) && t1.port === 9906, JSON.stringify(t1));
ok('rpcd 插件：票只有 root 能看（目录 700）', (fs.statSync(LT).mode & 0o777) === 0o700);
ok('rpcd 插件：一张票一个文件', fs.existsSync(LT + '/' + t1.ticket));

// ---------- 用票换钥匙 ----------
let r = await lan('lan_open', { ticket: t1.ticket, name: 'Windows 电脑' }, { ...LANENV, REMOTE_ADDR: '127.0.0.1' });
ok('隧道进来的（127.0.0.1）：不认', /只能在家里局域网里用/.test(err(r)), err(r));
r = await lan('lan_open', { ticket: t1.ticket }, { ...LANENV, REMOTE_ADDR: '203.0.113.9' });
ok('外网地址：不认', /只能在家里局域网里用/.test(err(r)));
r = await lan('lan_open', { ticket: t1.ticket }, { ...LANENV, HTTP_X_FORWARDED_FOR: '203.0.113.9' });
ok('经过反向代理转发的（带 X-Forwarded-For）：不认', /只能在家里局域网里用/.test(err(r)));
r = await lan('lan_open', { ticket: t1.ticket }, { ...LANENV, CONTENT_TYPE: 'text/plain' });
ok('不是 JSON 请求（别的网站在浏览器里偷偷发的）：不认', /只能在家里局域网里用/.test(err(r)));
r = await lan('lan_open', { ticket: t1.ticket }, { ...LANENV, HTTP_HOST: 'evil.example.com:9906' });
ok('网址是外面的域名（DNS 重绑定）：不认', /只能在家里局域网里用/.test(err(r)));
ok('被拒的请求没有用掉票', fs.existsSync(LT + '/' + t1.ticket));
r = await lan('lan_open', { ticket: 'abc' });
ok('票不完整：说回原版后台再点一次', /回到原版后台再点一次/.test(err(r)), err(r));
r = await lan('lan_open', { ticket: 'a'.repeat(24) });
ok('没发过的票：过期', /过期了/.test(err(r)), err(r));
r = await lan('lan_open', { ticket: t1.ticket, name: 'Windows 电脑' });
const D1 = r.result?.dev;
ok('局域网 + 有效的票：换到这台电脑的钥匙', /^[a-z0-9]{8}\.[a-z0-9]{32}$/.test(D1 || ''), JSON.stringify(r));
ok('票用一次就删', !fs.existsSync(LT + '/' + t1.ticket));
r = await lan('lan_open', { ticket: t1.ticket });
ok('同一张票不能用第二次', /过期了/.test(err(r)));
const d1 = devs()[(D1 || '.').split('.')[0]];
ok('钥匙记在路由器上：名字、来源是原版后台', d1?.name === 'Windows 电脑' && d1?.via === '原版后台（局域网）' && !d1.uid, JSON.stringify(d1));
ok('有设备登录：推送提醒（写了来源地址）', /局域网里有设备打开了面板/.test(fs.readFileSync(BIN + '/notified', 'utf8')) && /192\.168\.6\.23/.test(fs.readFileSync(BIN + '/notified', 'utf8')));
const t2 = ticket();
fs.utimesSync(LT + '/' + t2.ticket, new Date(Date.now() - 200e3), new Date(Date.now() - 200e3));
r = await lan('lan_open', { ticket: t2.ticket });
ok('超过 2 分钟的票：过期，并删掉', /过期了/.test(err(r)) && !fs.existsSync(LT + '/' + t2.ticket));

// ---------- 局域网入口只能换钥匙 ----------
r = await lan('whoami');
ok('局域网入口不能直接操作路由器（只能换钥匙）', r.error && r.error.code === -32601, JSON.stringify(r));

// ---------- 拿钥匙用面板：主账号 ----------
r = await pas('', 'pass_new', { dev: D1 });
const PS = r.result?.pass;
ok('钥匙能换通行证', !!PS, JSON.stringify(r).slice(0, 200));
r = await pas(PS, 'whoami');
ok('按主账号算', r.result?.role === 'owner', JSON.stringify(r).slice(0, 300));
ok('whoami 带局域网地址（端口按 lan_port）', r.result?.lan?.url === 'http://192.168.6.1:9906/panel/', JSON.stringify(r.result?.lan));
ok('whoami 说明是局域网登录（没有官网账号）', r.result?.lanin === true && r.result?.emerg === true);

// ---------- 输路由器后台密码 ----------
clean();
r = await lan('lan_pw', { pw: 'wrong' });
ok('密码不对：说还能再试几次', /还能再试 4 次/.test(err(r)), err(r));
r = await lan('lan_pw', { pw: 'right-pw' }, { ...LANENV, REMOTE_ADDR: '127.0.0.1' });
ok('密码对了但不是局域网来的：不认', /只能在家里局域网里用/.test(err(r)));
r = await lan('lan_pw', { pw: 'right-pw', name: 'iPhone' });
const D2 = r.result?.dev, d2 = devs()[(D2 || '.').split('.')[0]];
ok('密码对了：换到钥匙，来源是路由器后台密码', /^[a-z0-9]{8}\.[a-z0-9]{32}$/.test(D2 || '') && d2?.via === '路由器后台密码（局域网）', JSON.stringify(r));
ok('密码没留在路由器上', !fs.readdirSync('/tmp').some((f) => f.startsWith('cmcp_pw.')));
for (let i = 0; i < 5; i++) await lan('lan_pw', { pw: 'x' + i });
r = await lan('lan_pw', { pw: 'right-pw' });
ok('连续输错 5 次：锁 15 分钟，密码对了也不行', /分钟后再试/.test(err(r)), err(r));
clean();

// ---------- 关掉局域网入口 / 没有局域网地址 ----------
fs.writeFileSync(E + '/lan_off', '');
r = await pas((await pas('', 'pass_new', { dev: D1 })).result?.pass, 'whoami');
ok('关掉了局域网入口：whoami 不给地址', r.result && r.result.lan === null, JSON.stringify(r.result?.lan));
ok('关掉了：rpcd 插件说清楚', /已关闭/.test(rpcd('call', 'ticket')));
fs.rmSync(E + '/lan_off');

// ---------- 托管版：局域网登录也按主账号 ----------
fs.writeFileSync(E + '/hub.conf', 'HUB=http://127.0.0.1:9\nSUB=abc\nRKEY=' + 'k'.repeat(40) + '\n');
r = await pas((await pas('', 'pass_new', { dev: D2 })).result?.pass, 'whoami');
ok('托管版：局域网登录按主账号、标成局域网登录', r.result?.role === 'owner' && r.result?.hosted === true && r.result?.lanin === true, JSON.stringify(r).slice(0, 300));
fs.rmSync(E + '/hub.conf');

clean();
fs.rmSync(E, { recursive: true, force: true }); fs.rmSync(BIN, { recursive: true, force: true });
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + note)); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

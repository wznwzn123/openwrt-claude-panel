// 6.0 第 55 项（路由器）：家庭加密通道（WireGuard）——没装说装什么；没公网 IP 说原因；开启写 network / firewall（只放行 UDP 端口）；
// 加手机要先确认本人，配置只给这一次（路由器只留公钥），只有去家里的流量走通道；只通指定设备；托管版地址跟着家里 IP 变；关掉、删手机
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_wg.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpwg-')), CFG = E + '/config', R = E + '/root', APPLY = E + '/apply.log', DUMP = E + '/dump';
fs.mkdirSync(CFG, { recursive: true });
fs.writeFileSync(CFG + '/network', "config interface 'lan'\n\toption ipaddr '192.168.1.1'\n");
fs.writeFileSync(CFG + '/firewall', "config zone 'lan'\n\toption name 'lan'\n");
// 假 wg：genkey / genpsk 给随机钥匙；pubkey 从私钥算出一个固定的；show dump 读文件
const WG = E + '/wg';
fs.writeFileSync(WG, `#!/bin/sh
case "$1" in
genkey|genpsk) head -c 32 /dev/urandom | base64 ;;
pubkey) k=$(cat); printf 'PUB%s' "$k" | sha256sum | head -c 43 | tr -dc 'a-f0-9' | head -c 43; echo = ;;
show) cat ${DUMP} 2>/dev/null ;;
esac
`, { mode: 0o755 });
const SUB = 'abcd2345', HUBC = [];
const srv = http.createServer((q, s) => { let b = ''; q.on('data', (x) => (b += x)); q.on('end', () => { const j = JSON.parse(b || '{}'); HUBC.push({ path: q.url, b: j }); s.setHeader('content-type', 'application/json'); s.end(JSON.stringify(j.off ? { ok: true } : { ok: true, host: SUB + '-w.panel.example' })); }); });
await new Promise((z) => srv.listen(8766, '127.0.0.1', z));
fs.writeFileSync(E + '/cloud.conf', `RKEY=${'r'.repeat(40)}\nPKEY=pk\n`);
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: 'tok' + 'w'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
const LKF = '/etc/claude-mcp/local.key', LK0 = fs.existsSync(LKF);
if (!LK0) { fs.mkdirSync('/etc/claude-mcp', { recursive: true }); fs.writeFileSync(LKF, 'k'.repeat(40) + '\n'); }
const LK = fs.readFileSync(LKF, 'utf8').trim();
const SUDO = 's'.repeat(24), SUDOF = '/tmp/cmcp_sudo.json', SUDO0 = fs.existsSync(SUDOF) ? fs.readFileSync(SUDOF) : null;
let ENV = { CMCP_SM_WAN4: '1.2.3.4', CMCP_WG_WAN6: '' };
const cgi = (method, params, xenv = {}) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel', dev: 'local.' + LK });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/tok' + 'w'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)),
		CMCP_WG_ROOT: R, CMCP_WG_BIN: WG, CMCP_WG_APPLY: `echo apply >> ${APPLY}`, CMCP_WG_LAN: '192.168.1.1/24', CMCP_XP_ADDRS: '192.168.1.1/24 1.2.3.4/24', CMCP_SM_PUB4: '', NO_PROXY: '*', no_proxy: '*', ...ENV, ...xenv } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const err = (r) => r.error?.message || '';
const cfg = (n) => fs.readFileSync(CFG + '/' + n, 'utf8');
try {
	let r = await cgi('wg_get');
	ok('没装：说装哪个包', r.result?.caps === false && r.result.pkg === 'luci-proto-wireguard', JSON.stringify(r));
	ok('没装：不能开', /先装 WireGuard/.test(err(await cgi('wg_set', { on: true }))));
	fs.mkdirSync(R + '/lib/netifd/proto', { recursive: true }); fs.writeFileSync(R + '/lib/netifd/proto/wireguard.sh', '');
	// 没公网 IP
	r = await cgi('wg_get', {}, { CMCP_SM_WAN4: '100.72.1.2' });
	ok('运营商内网地址（100.64/10）：说没有公网 IP、怎么办', r.result?.caps === true && r.result.reach.ok === false && /没有公网 IP：宽带口是运营商的内网地址 100\.72\.1\.2。找运营商要公网 IP，或者开 IPv6/.test(r.result.reach.msg), JSON.stringify(r.result?.reach));
	ok('没公网 IP：不能开', /没有公网 IP/.test(err(await cgi('wg_set', { on: true }, { CMCP_SM_WAN4: '100.72.1.2' }))));
	r = await cgi('wg_get', {}, { CMCP_SM_WAN4: '100.72.1.2', CMCP_WG_WAN6: '2408:8000:1::5' });
	ok('有公网 IPv6 也行', r.result.reach.ok === true && r.result.host === '[2408:8000:1::5]');
	r = await cgi('wg_get', {}, { CMCP_SM_WAN4: '192.168.0.5', CMCP_SM_PUB4: '5.6.7.8' });
	ok('上一级还有路由器（光猫）：能开，标出来要转发端口', r.result.reach.ok === true && r.result.reach.nat === true && r.result.reach.wan4 === '192.168.0.5' && r.result.host === '5.6.7.8');
	r = await cgi('wg_get');
	ok('有公网 IPv4：没开，地址是 IP', r.result.reach.ok === true && r.result.on === false && r.result.host === '1.2.3.4' && r.result.port === 51820);
	// 开
	r = await cgi('wg_set', { on: true });
	const net = cfg('network'), fw = cfg('firewall');
	ok('开启：建接口（WireGuard、端口 51820、10.77.0.1/24）', r.result?.on === true && /config interface 'cmcp_wg'/.test(net) && /option proto 'wireguard'/.test(net) && /option listen_port '51820'/.test(net) && /list addresses '10\.77\.0\.1\/24'/.test(net) && /option private_key '[A-Za-z0-9+\/]{43}='/.test(net), JSON.stringify(r).slice(0, 300) + net);
	ok('防火墙：通道自己一个区，能连家里（整个局域网），外网只放行 UDP 51820', /config zone 'cmcp_wg_z'/.test(fw) && /option forward 'REJECT'/.test(fw) && /config forwarding 'cmcp_wg_f'[\s\S]*option src 'cmcp_wg'[\s\S]*option dest 'lan'/.test(fw) && /config rule 'cmcp_wg_in'[\s\S]*option src 'wan'[\s\S]*option proto 'udp'[\s\S]*option dest_port '51820'/.test(fw), fw);
	ok('生效了', fs.readFileSync(APPLY, 'utf8').includes('apply') && r.result.msg === '已开启加密通道');
	ok('不把路由器的私钥发给手机', !JSON.stringify(r).includes(net.match(/private_key '([^']+)'/)[1]));
	// 加手机：要先确认本人
	ok('加手机：没确认本人不行', /确认是你本人/.test(err(await cgi('wg_set', { add: '我的手机' }))));
	fs.writeFileSync(SUDOF, JSON.stringify({ [SUDO]: { exp: Math.floor(Date.now() / 1000) + 600, dev: '', kind: 'local' } }));
	ok('名字不对', /名字不对/.test(err(await cgi('wg_set', { add: '<b>', sudo: SUDO }))));
	r = await cgi('wg_set', { add: '我的手机', sudo: SUDO });
	const conf = r.result?.conf || '';
	const priv = (conf.match(/PrivateKey = (\S+)/) || [])[1];
	ok('配置：手机自己的私钥、地址 10.77.0.2', /^\[Interface\]\nPrivateKey = [A-Za-z0-9+\/]{43}=\nAddress = 10\.77\.0\.2\/32\n/.test(conf), conf);
	ok('配置：路由器公钥、预共享密钥、地址:端口、保活', /PublicKey = [a-f0-9]{43}=/.test(conf) && /PresharedKey = [A-Za-z0-9+\/]{43}=/.test(conf) && /Endpoint = 1\.2\.3\.4:51820/.test(conf) && /PersistentKeepalive = 25/.test(conf));
	ok('只有去家里的流量走通道（通道网段 + 家里局域网）', /AllowedIPs = 10\.77\.0\.0\/24, 192\.168\.1\.0\/24\n/.test(conf), conf);
	const n2 = cfg('network');
	ok('路由器只留公钥，不留手机的私钥', /config wireguard_cmcp_wg 'cmcp_wgp_1'/.test(n2) && /option description '我的手机'/.test(n2) && /list allowed_ips '10\.77\.0\.2\/32'/.test(n2) && !n2.includes(priv), n2);
	ok('列出手机', r.result.peers.length === 1 && r.result.peers[0].name === '我的手机' && r.result.peers[0].ip === '10.77.0.2' && r.result.peers[0].hs === 0);
	r = await cgi('wg_set', { add: '平板', sudo: SUDO });
	ok('第二台：10.77.0.3', /Address = 10\.77\.0\.3\/32/.test(r.result?.conf || '') && r.result.peers.length === 2);
	// 握手时间
	const pub1 = n2.match(/public_key '([^']+)'/)[1];
	fs.writeFileSync(DUMP, `srvpriv\tsrvpub\t51820\toff\n${pub1}\t(none)\t5.5.5.5:1234\t10.77.0.2/32\t1800000000\t1000\t2000\t25\n`);
	r = await cgi('wg_get');
	ok('最近连过的时间、流量', r.result.peers.find((x) => x.id === '1').hs === 1800000000 && r.result.peers.find((x) => x.id === '1').rx === 1000);
	ok('不把预共享密钥、公钥发给面板', !JSON.stringify(r).includes(pub1) && !/PresharedKey|preshared/.test(JSON.stringify(r)));
	// 只通指定设备
	ok('只通指定设备：不在局域网的不行', /不在家里局域网里/.test(err(await cgi('wg_set', { only: [{ ip: '10.9.9.9', name: 'x' }] }))));
	r = await cgi('wg_set', { only: [{ ip: '192.168.1.20', mac: 'AA:BB:CC:00:00:20', name: 'NAS' }, { ip: '192.168.1.30', name: '摄像头' }] });
	let f2 = cfg('firewall');
	ok('只通指定设备：去掉整个局域网的转发，每台一条规则', !/cmcp_wg_f/.test(f2) && /config rule 'cmcp_wg_d1'[\s\S]*option dest_ip '192\.168\.1\.20'/.test(f2) && /config rule 'cmcp_wg_d2'[\s\S]*option dest_ip '192\.168\.1\.30'/.test(f2) && r.result.msg === '只通 2 台设备' && r.result.only.length === 2, f2);
	// 设备 IP 变了：看门狗更新规则
	fs.writeFileSync(CFG + '/dhcp', "config host\n\toption mac 'aa:bb:cc:00:00:20'\n\toption ip '192.168.1.50'\n");
	await cgi('wg_check');
	f2 = cfg('firewall');
	ok('设备换了 IP：看门狗把规则改成新 IP', /option dest_ip '192\.168\.1\.50'/.test(f2) && !/192\.168\.1\.20/.test(f2), f2);
	fs.unlinkSync(CFG + '/dhcp');
	r = await cgi('wg_set', { only: null });
	f2 = cfg('firewall');
	ok('改回整个家里网络', /config forwarding 'cmcp_wg_f'/.test(f2) && !/cmcp_wg_d1/.test(f2) && r.result.only === null && r.result.msg === '能连整个家里网络');
	// 端口、地址
	ok('端口不对', /1024–65535/.test(err(await cgi('wg_set', { port: 80 }))));
	r = await cgi('wg_set', { port: 51999 });
	ok('改端口：接口和防火墙一起改，提醒重新扫码', /listen_port '51999'/.test(cfg('network')) && /dest_port '51999'/.test(cfg('firewall')) && /重新扫码/.test(r.result.msg));
	ok('自己的域名不对', /域名不对/.test(err(await cgi('wg_set', { host: 'a b' }))));
	r = await cgi('wg_set', { host: 'home.example.com' });
	ok('填自己的域名：配置里用它', r.result.host === 'home.example.com' && /Endpoint = home\.example\.com:51999/.test((await cgi('wg_set', { add: '电脑', sudo: SUDO })).result.conf));
	await cgi('wg_set', { host: '' });
	// 删手机
	r = await cgi('wg_set', { del: '1' });
	ok('删手机：路由器上它的公钥删掉', !/cmcp_wgp_1'/.test(cfg('network')) && r.result.peers.length === 2 && r.result.msg === '已删除「我的手机」');
	ok('删不存在的', /没有这台手机/.test(err(await cgi('wg_set', { del: '9' }))));
	// 托管版：官网给地址，IP 变了更新
	fs.writeFileSync(E + '/hub.conf', `HUB=http://127.0.0.1:8766\nSUB=${SUB}\n`);
	HUBC.length = 0;
	r = await cgi('wg_set', { on: true });
	ok('托管版：官网给「子域名-w」，配置里用它', HUBC.some((x) => x.path === '/api/dev/wgdns' && x.b.ip4 === '1.2.3.4') && r.result.host === SUB + '-w.panel.example', JSON.stringify(HUBC));
	HUBC.length = 0;
	await cgi('wg_check');
	ok('IP 没变：不找官网', !HUBC.length);
	await cgi('wg_check', {}, { CMCP_SM_WAN4: '9.9.9.9' });
	ok('IP 变了：告诉官网', HUBC.some((x) => x.b.ip4 === '9.9.9.9'));
	// 关
	HUBC.length = 0;
	r = await cgi('wg_set', { on: false });
	ok('关掉：接口停用、外网端口关上，手机留着（再开不用重新扫码）', r.result.on === false && /option disabled '1'/.test(cfg('network')) && /config rule 'cmcp_wg_in'[\s\S]*option enabled '0'/.test(cfg('firewall')) && /cmcp_wgp_2/.test(cfg('network')) && HUBC.some((x) => x.b.off === true));
	r = await cgi('wg_set', { on: true });
	ok('再打开：还是原来的钥匙和手机', r.result.on === true && r.result.peers.length === 2 && !/disabled/.test(cfg('network')));
	const fam = fs.readFileSync('../src/mcp/26-backup.uc', 'utf8');
	ok('只有主账号能用（不在任何权限组里）', !/'wg_(get|set)'/.test(fam));
} finally {
	srv.close(); fs.rmSync(E, { recursive: true, force: true }); if (!LK0) fs.rmSync(LKF, { force: true });
	if (SUDO0) fs.writeFileSync(SUDOF, SUDO0); else fs.rmSync(SUDOF, { force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 500))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

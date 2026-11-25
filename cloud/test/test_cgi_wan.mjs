// 6.0 第 24 项（路由器）：上网设置——自动获取 / 宽带拨号 / 固定 IP、DNS；拨号密码只能改、不给面板看（要看走「敏感信息」）；
// 找 WAN 口（wan 或防火墙 wan 区域里的）；没装拨号组件说清楚；固定 IP 跟家里网段冲突不让；改完走「90 秒确认」，不点自动改回
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_wan.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpwan-'));
const CFG = D + '/config', SB = D + '/sbin', NG = D + '/ng', RUN = D + '/reload.log', NOTE = D + '/notify.log', ETC = D + '/etc', BIN = D + '/bin', ROOT = D + '/root';
for (const d of [CFG, SB, ETC, BIN, ROOT + '/lib/netifd/proto', ROOT + '/usr/lib/pppd/2.4.9']) fs.mkdirSync(d, { recursive: true });
fs.copyFileSync(path.resolve('../src/bin/cmcp-netguard'), SB + '/cmcp-netguard'); fs.chmodSync(SB + '/cmcp-netguard', 0o755);
fs.writeFileSync(SB + '/cmcp-notify', `#!/bin/sh\necho "$@" >> ${NOTE}\n`); fs.chmodSync(SB + '/cmcp-notify', 0o755);
fs.writeFileSync(SB + '/cmcp-compat', '#!/bin/sh\n'); fs.chmodSync(SB + '/cmcp-compat', 0o755);
// 假 ubus：WAN 口状态
fs.writeFileSync(BIN + '/ubus', `#!/bin/sh
case "$2" in network.interface.wan|network.interface.wan1) echo '{"up":true,"uptime":3600,"ipv4-address":[{"address":"100.64.3.9","mask":22}],"route":[{"target":"0.0.0.0","mask":0,"nexthop":"100.64.0.1"}],"dns-server":["202.96.128.86"]}' ;; *) exit 4 ;; esac
`); fs.chmodSync(BIN + '/ubus', 0o755);
const pppOn = (on) => { for (const f of [ROOT + '/lib/netifd/proto/ppp.sh', ROOT + '/usr/lib/pppd/2.4.9/rp-pppoe.so']) on ? fs.writeFileSync(f, '') : fs.rmSync(f, { force: true }); };
const NET = `config interface 'loopback'
	option device 'lo'
	option proto 'static'
	option ipaddr '127.0.0.1'
	option netmask '255.0.0.0'

config interface 'lan'
	option device 'br-lan'
	option proto 'static'
	option ipaddr '192.168.1.1'
	option netmask '255.255.255.0'

config interface 'wan'
	option device 'eth1'
	option proto 'dhcp'
	option mtu '1480'

config interface 'wan6'
	option device 'eth1'
	option proto 'dhcpv6'
`;
const FW = `config zone
	option name 'wan'
	list network 'wan'
	list network 'wan6'
`;
const reset = (net = NET, fw = FW) => { fs.writeFileSync(CFG + '/network', net); fs.writeFileSync(CFG + '/firewall', fw); fs.rmSync(NG, { recursive: true, force: true }); fs.rmSync(NOTE, { force: true }); fs.rmSync(RUN, { force: true }); };
const N = () => fs.readFileSync(CFG + '/network', 'utf8');
const wanSec = () => N().split(/\n(?=config )/).find((x) => /interface 'wan1?'\n/.test(x)) || '';
fs.writeFileSync(D + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
const cgi = (method, params) => new Promise((z) => {
	const msg = { jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' }, body = JSON.stringify(msg);
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, PATH: BIN + ':' + process.env.PATH, CLAUDE_MCP_CONF: D + '/config.json', PATH_INFO: '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_SBIN: SB, CMCP_NG: NG, CMCP_NG_WAIT: '3', CMCP_NG_RUN: RUN, CMCP_ETC: ETC, CMCP_WAN_ROOT: ROOT } });
	let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const runs = () => (fs.existsSync(RUN) ? fs.readFileSync(RUN, 'utf8').trim().split('\n').filter(Boolean) : []);
const waitFor = async (f, ms = 9000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(150); } return false; };
const err = (r) => r.error?.message || '';
try {
	reset(); pppOn(true);
	let r = await cgi('wan_get');
	let g = r.result || {};
	ok('读：自动获取、DNS 自动、拨号能用', g.iface === 'wan' && g.proto === 'dhcp' && g.dns_auto === true && g.pppoe === true, JSON.stringify(r).slice(0, 300));
	ok('读：WAN 口现在的状态（地址、网关、DNS、连了多久）', g.status?.up && g.status.ip === '100.64.3.9' && g.status.gw === '100.64.0.1' && g.status.dns[0] === '202.96.128.86' && g.status.uptime === 3600, JSON.stringify(g.status));
	// ---- 不让改的 ----
	const bad = [
		[{ proto: 'l2tp' }, /只能选/, '不认识的方式'],
		[{ proto: 'pppoe', user: '', pw: 'x' }, /填宽带账号/, '拨号没填账号'],
		[{ proto: 'pppoe', user: 'a', pw: '' }, /填宽带密码/, '第一次拨号没填密码'],
		[{ proto: 'pppoe', user: 'a\nb', pw: 'x' }, /不能用的字符/, '账号里有换行'],
		[{ proto: 'static', ip: '192.168.1.50', gw: '192.168.1.254', dns: ['223.5.5.5'] }, /跟家里网段（192\.168\.1\.1\/24）冲突/, '固定 IP 跟家里网段冲突'],
		[{ proto: 'static', ip: '10.0.0.5', gw: '10.0.1.1', dns: ['223.5.5.5'] }, /同一个网段/, '网关不在同一网段'],
		[{ proto: 'static', ip: '10.0.0.5', mask: '255.0.255.0', gw: '10.0.0.1', dns: ['223.5.5.5'] }, /子网掩码不对/, '掩码不连续'],
		[{ proto: 'static', ip: '10.0.0.255', gw: '10.0.0.1', dns: ['223.5.5.5'] }, /第一个或最后一个/, '广播地址'],
		[{ proto: 'static', ip: '10.0.0.5', gw: '10.0.0.1' }, /固定 IP 要填 DNS/, '固定 IP 没填 DNS'],
		[{ proto: 'static', ip: '10.0.0.5; reboot', gw: '10.0.0.1', dns: ['1.1.1.1'] }, /IP 地址不对/, '地址里夹命令'],
		[{ proto: 'dhcp', dns: ['8.8.8.8', '1.1.1.1', '9.9.9.9', '223.5.5.5'] }, /最多填 3 个/, 'DNS 太多'],
		[{ proto: 'dhcp', dns: ['dns.google'] }, /DNS 不对/, 'DNS 写成域名'],
		[{ proto: 'dhcp', dns: ['300.1.1.1'] }, /DNS 不对，比如 223\.5\.5\.5/, 'DNS 地址超范围（中英文之间有空格）'],
	];
	for (const [p, re, why] of bad) { r = await cgi('wan_set', p); ok('不让改：' + why, re.test(err(r)), JSON.stringify(r).slice(0, 200)); }
	ok('出错时配置一点没动、也没开始等确认', N() === NET && !fs.existsSync(NG));
	r = await cgi('wan_set', { proto: 'dhcp', dns_auto: true });
	ok('什么都没改：不动配置、不等确认', r.result?.changed === false && N() === NET && !fs.existsSync(NG), JSON.stringify(r));
	// ---- 改成宽带拨号 ----
	r = await cgi('wan_set', { proto: 'pppoe', user: '0755123456@163.gd', pw: 'p@ss "w0rd" 中' });
	ok('改成拨号：开始 90 秒确认', r.result?.changed === true && /^[a-z0-9]{16}$/.test(r.result.token) && r.result.what === '宽带拨号', JSON.stringify(r).slice(0, 200));
	let w = wanSec();
	ok('写进去：协议、账号、密码（带空格、引号、中文也原样）', /proto 'pppoe'/.test(w) && /username '0755123456@163\.gd'/.test(w) && w.includes('p@ss "w0rd" 中'), w);
	ok('网口、MTU 等别的选项原样保留，wan6 不动', /device 'eth1'/.test(w) && /mtu '1480'/.test(w) && /interface 'wan6'\n\toption device 'eth1'\n\toption proto 'dhcpv6'/.test(N()));
	ok('重新加载网络（只认这一种命令）', await waitFor(() => runs().includes('/etc/init.d/network reload')), runs().join('|'));
	ok('推送：上网方式改成宽带拨号', /上网方式改成宽带拨号/.test(fs.existsSync(NOTE) ? fs.readFileSync(NOTE, 'utf8') : ''));
	g = (await cgi('wan_get')).result || {};
	ok('读：拨号账号给、密码不给（只说设过了）', g.proto === 'pppoe' && g.user === '0755123456@163.gd' && g.has_pw === true && !JSON.stringify(g).includes('w0rd'), JSON.stringify(g).slice(0, 300));
	ok('等确认时：别的网络设置先不让改', /还在等你确认/.test(err(await cgi('wan_set', { proto: 'dhcp' }))));
	ok('等确认时：读到的「在等确认」是上网设置', g.pending?.what === '上网设置' && g.pending.token === r.result.token);
	// 不点保留：自动改回去
	ok('90 秒（测试里 3 秒）没点保留：自动改回原来的，并推送', await waitFor(() => N() === NET && !fs.existsSync(NG)) && /上网设置已改回原来的/.test(fs.existsSync(NOTE) ? fs.readFileSync(NOTE, 'utf8') : ''), N());
	// 点保留
	r = await cgi('wan_set', { proto: 'pppoe', user: 'u1', pw: 'pw1' });
	await sleep(400);
	ok('点「保留」：留下新的', (await cgi('net_confirm', { token: r.result?.token })).result?.ok === true && /proto 'pppoe'/.test(wanSec()));
	// 已经是拨号：密码留空 = 不改
	r = await cgi('wan_set', { proto: 'pppoe', user: 'u2', pw: '' });
	w = wanSec();
	ok('已经是拨号、密码留空：只改账号，密码不动', r.result?.changed && /username 'u2'/.test(w) && /password 'pw1'/.test(w), w);
	await cgi('net_confirm', { token: r.result?.token });
	// 自定义 DNS
	r = await cgi('wan_set', { proto: 'pppoe', user: 'u2', dns: ['223.5.5.5', ' 119.29.29.29 ', '223.5.5.5', '2400:3200::1'] });
	w = wanSec();
	ok('自己填 DNS：去重、不用运营商给的（peerdns=0），IPv6 地址也行', r.result?.changed && /list dns '223\.5\.5\.5'\n\tlist dns '119\.29\.29\.29'\n\tlist dns '2400:3200::1'/.test(w) && /peerdns '0'/.test(w), w);
	await cgi('net_confirm', { token: r.result?.token });
	g = (await cgi('wan_get')).result || {};
	ok('读：DNS 不是自动的，三个都在', g.dns_auto === false && g.dns.length === 3);
	r = await cgi('wan_set', { proto: 'pppoe', user: 'u2', dns_auto: true });
	w = wanSec();
	ok('改回自动 DNS：删掉自己填的和 peerdns', !/dns/.test(w), w);
	await cgi('net_confirm', { token: r.result?.token });
	// 敏感信息：要验证才给密码
	ok('看拨号密码：没验证不给', /确认是你本人/.test(err(await cgi('wan_secret', {}))));
	const SU = 'S'.repeat(24);
	fs.writeFileSync('/tmp/cmcp_sudo.json', JSON.stringify({ [SU]: { exp: Math.floor(Date.now() / 1000) + 300, dev: '', kind: 'local' } }));
	r = await cgi('wan_secret', { sudo: SU });
	ok('看拨号密码：验证过才给（账号 + 密码）', r.result?.pppoe === true && r.result.user === 'u2' && r.result.pw === 'pw1', JSON.stringify(r).slice(0, 200));
	// 固定 IP
	r = await cgi('wan_set', { proto: 'static', ip: '10.0.0.5', mask: '255.255.255.0', gw: '10.0.0.1', dns: ['223.5.5.5'] });
	w = wanSec();
	ok('改成固定 IP：地址、掩码、网关、DNS；拨号账号密码留着（换回拨号不用重输）', r.result?.what === '固定 IP' && /proto 'static'/.test(w) && /ipaddr '10\.0\.0\.5'/.test(w) && /netmask '255\.255\.255\.0'/.test(w) && /gateway '10\.0\.0\.1'/.test(w) && /list dns '223\.5\.5\.5'/.test(w) && /password 'pw1'/.test(w), w);
	await cgi('net_confirm', { token: r.result?.token });
	g = (await cgi('wan_get')).result || {};
	ok('读：固定 IP 的地址、掩码、网关', g.proto === 'static' && g.ip === '10.0.0.5' && g.mask === '255.255.255.0' && g.gw === '10.0.0.1' && g.dns_auto === false && g.user === null, JSON.stringify(g).slice(0, 200));
	ok('看拨号密码：现在不是拨号，不给', (await cgi('wan_secret', { sudo: SU })).result?.pppoe === false);
	// 改回自动获取：删掉固定 IP 的选项
	r = await cgi('wan_set', { proto: 'dhcp', dns_auto: true });
	w = wanSec();
	ok('改回自动获取：删掉地址、掩码、网关、DNS', /proto 'dhcp'/.test(w) && !/ipaddr|netmask|gateway|dns/.test(w), w);
	await cgi('net_confirm', { token: r.result?.token });
	// 22.03 起的写法：ipaddr 带 /24
	reset(NET.replace("option proto 'dhcp'\n\toption mtu '1480'", "option proto 'static'\n\toption ipaddr '10.9.8.7/16'\n\toption gateway '10.9.0.1'\n\tlist dns '1.1.1.1'"));
	g = (await cgi('wan_get')).result || {};
	ok('认 22.03 起的写法：地址/前缀', g.proto === 'static' && g.ip === '10.9.8.7' && g.mask === '255.255.0.0', JSON.stringify(g).slice(0, 200));
	r = await cgi('wan_set', { proto: 'static', ip: '10.9.8.7', mask: '255.255.0.0', gw: '10.9.0.1', dns: ['1.1.1.1'] });
	ok('没改：不动', r.result?.changed === false, JSON.stringify(r));
	// 没装拨号组件
	reset(); pppOn(false);
	g = (await cgi('wan_get')).result || {};
	r = await cgi('wan_set', { proto: 'pppoe', user: 'a', pw: 'b' });
	ok('没装拨号组件：读的时候说不能拨号，改的时候说清楚缺什么', g.pppoe === false && /没装宽带拨号组件（ppp-mod-pppoe）/.test(err(r)) && r.error?.code === -32020 && N() === NET, JSON.stringify(r).slice(0, 200));
	pppOn(true);
	// WAN 口不叫 wan：找防火墙 wan 区域里的
	reset(NET.replace("interface 'wan'\n", "interface 'wan1'\n"), FW.replace("list network 'wan'", "list network 'wan1'"));
	g = (await cgi('wan_get')).result || {};
	ok('WAN 口不叫 wan：从防火墙 wan 区域里找（不会找成 wan6）', g.iface === 'wan1' && g.proto === 'dhcp', JSON.stringify(g).slice(0, 200));
	// 没有 WAN 口（旁路由）
	reset(NET.replace(/config interface 'wan'[\s\S]*?(?=config interface 'wan6')/, ''), "config zone\n\toption name 'wan'\n\tlist network 'wan6'\n");
	r = await cgi('wan_get');
	ok('没有 WAN 口（旁路由）：说清楚', /没有 WAN 口/.test(r.result?.none || ''), JSON.stringify(r).slice(0, 200));
	ok('没有 WAN 口：改不了', /没有 WAN 口/.test(err(await cgi('wan_set', { proto: 'dhcp' }))));
} finally {
	try { fs.rmSync('/tmp/cmcp_sudo.json'); } catch (e) {}
	fs.rmSync(D, { recursive: true, force: true });
}
let pass = 0; for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '  ' + (note || '').slice(0, 400))); if (c) pass++; }
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

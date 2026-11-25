// 6.0 第 25 项（路由器）：局域网设置——路由器地址、子网掩码、DHCP 开关 / 范围 / 租期；改路由器地址只有主账号能做；
// 新网段不能跟外网、访客网络等重叠；网段变了设备的固定地址、端口转发跟着搬，原版后台绑在旧地址上的也换；
// 改完走「90 秒确认」，可以在新地址上不登录点「保留」（凭编号、只认局域网来的）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_lanset.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpls-'));
const CFG = D + '/config', SB = D + '/sbin', NG = D + '/ng', RUN = D + '/reload.log', NOTE = D + '/notify.log', ETC = D + '/etc', BIN = D + '/bin';
for (const d of [CFG, SB, ETC, BIN]) fs.mkdirSync(d, { recursive: true });
fs.copyFileSync(path.resolve('../src/bin/cmcp-netguard'), SB + '/cmcp-netguard'); fs.chmodSync(SB + '/cmcp-netguard', 0o755);
fs.writeFileSync(SB + '/cmcp-notify', `#!/bin/sh\necho "$@" >> ${NOTE}\n`); fs.chmodSync(SB + '/cmcp-notify', 0o755);
// 假 ubus（WAN 口 10.0.0.x/24）、假 ip（网卡上的地址：家里、访客、代理网卡）
fs.writeFileSync(BIN + '/ubus', `#!/bin/sh\ncase "$2" in network.interface.wan) echo '{"up":true,"ipv4-address":[{"address":"10.0.0.23","mask":24}],"route":[]}' ;; *) exit 4 ;; esac\n`); fs.chmodSync(BIN + '/ubus', 0o755);
fs.writeFileSync(BIN + '/ip', `#!/bin/sh\necho '1: lo    inet 127.0.0.1/8 scope host lo'\necho '5: br-lan    inet 192.168.1.1/24 brd 192.168.1.255 scope global br-lan'\necho '9: br-guest    inet 192.168.33.1/24 scope global br-guest'\necho '12: utun    inet 198.18.0.1/16 scope global utun'\necho '3: eth1    inet 10.0.0.23/24 scope global eth1'\n`); fs.chmodSync(BIN + '/ip', 0o755);
const NET = `config interface 'lan'
	option device 'br-lan'
	option proto 'static'
	option ipaddr '192.168.1.1'
	option netmask '255.255.255.0'
	option ip6assign '60'

config interface 'wan'
	option device 'eth1'
	option proto 'dhcp'

config interface 'guest'
	option proto 'static'
	option ipaddr '192.168.33.1'
	option netmask '255.255.255.0'
`;
const DHCP = `config dnsmasq
	option domain 'lan'

config dhcp 'lan'
	option interface 'lan'
	option start '100'
	option limit '150'
	option leasetime '12h'

config host 'nas'
	option name 'NAS'
	option mac '00:11:22:33:44:55'
	option ip '192.168.1.20'

config host 'far'
	option name 'Other'
	option mac '00:11:22:33:44:66'
	option ip '10.9.9.9'
`;
const FW = `config zone
	option name 'wan'

config redirect 'nas'
	option src 'wan'
	option dest_ip '192.168.1.20'
	option src_dport '5000'
`;
const UH = `config uhttpd 'main'
	list listen_http '0.0.0.0:80'
	list listen_https '0.0.0.0:443'
`;
const reset = (o = {}) => { fs.writeFileSync(CFG + '/network', o.net || NET); fs.writeFileSync(CFG + '/dhcp', o.dhcp || DHCP); fs.writeFileSync(CFG + '/firewall', FW); fs.writeFileSync(CFG + '/uhttpd', o.uh || UH); fs.rmSync(NG, { recursive: true, force: true }); fs.rmSync(NOTE, { force: true }); fs.rmSync(RUN, { force: true }); };
const R = (f) => fs.readFileSync(CFG + '/' + f, 'utf8');
const lanSec = () => R('network').split(/\n(?=config )/).find((x) => /interface 'lan'\n/.test(x)) || '';
const dhcpSec = () => R('dhcp').split(/\n(?=config )/).find((x) => /dhcp 'lan'\n/.test(x)) || '';
fs.writeFileSync(D + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
fs.writeFileSync(ETC + '/lan_port', '906');
const cgi = (method, params, { lan = false, ra = '192.168.5.23' } = {}) => new Promise((z) => {
	const msg = { jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' }, body = JSON.stringify(msg);
	const env = { ...process.env, PATH: BIN + ':' + process.env.PATH, CLAUDE_MCP_CONF: D + '/config.json', PATH_INFO: lan ? '/lan' : '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CONTENT_TYPE: 'application/json', CMCP_SBIN: SB, CMCP_NG: NG, CMCP_NG_WAIT: '3', CMCP_NG_RUN: RUN, CMCP_ETC: ETC };
	if (lan) { env.REMOTE_ADDR = ra; env.HTTP_HOST = '192.168.5.1:906'; }
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env });
	let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const runs = () => (fs.existsSync(RUN) ? fs.readFileSync(RUN, 'utf8').trim().split('\n').filter(Boolean) : []);
const waitFor = async (f, ms = 9000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(150); } return false; };
const err = (r) => r.error?.message || '';
try {
	reset();
	let r = await cgi('lanset_get'), g = r.result || {};
	ok('读：路由器地址、掩码、DHCP 开着、范围 .100–.249、租期 12 小时、面板端口', g.ip === '192.168.1.1' && g.mask === '255.255.255.0' && g.dhcp?.on && g.dhcp.from === '192.168.1.100' && g.dhcp.to === '192.168.1.249' && g.dhcp.lease === '12h' && g.port === 906 && g.owner === true, JSON.stringify(r).slice(0, 300));
	const bad = [
		[{ ip: '8.8.8.1' }, /要用内网地址/, '公网地址'],
		[{ ip: '192.168.1.0' }, /第一个或最后一个/, '网络地址'],
		[{ ip: '192.168.5.1', mask: '255.255.0.255' }, /子网掩码不对/, '掩码不连续'],
		[{ ip: '10.0.0.1' }, /跟外网的网段重叠（光猫或上级路由器也是这个网段）/, '跟外网重叠'],
		[{ ip: '192.168.33.1' }, /跟正在用的网段 192\.168\.33\.0\/24 重叠/, '跟访客网络重叠'],
		[{ ip: '198.18.5.1' }, /要用内网地址/, '代理网卡的网段（198.18 不是内网地址）'],
		[{ ip: '192.168.1.1', from: '192.168.1.200', to: '192.168.1.100' }, /开始地址要比结束地址小/, '范围倒过来'],
		[{ ip: '192.168.1.1', from: '192.168.2.10', to: '192.168.2.20' }, /地址范围要在 192\.168\.1\.0\/24 里/, '范围不在网段里'],
		[{ ip: '192.168.1.1', from: '192.168.1.1', to: '192.168.1.20' }, /不能有路由器地址/, '范围里有路由器地址'],
		[{ ip: '192.168.1.1', lease: '3h' }, /租期只能选/, '租期不认识'],
		[{ ip: '192.168.5.1', mask: '255.255.255.128' }, /原来的地址范围放不进新网段/, '网段变小、范围放不进'],
		[{ ip: '192.168.1.1; reboot' }, /路由器地址不对/, '地址里夹命令'],
	];
	for (const [p, re, why] of bad) { r = await cgi('lanset_set', p); ok('不让改：' + why, re.test(err(r)), JSON.stringify(r).slice(0, 200)); }
	ok('出错时配置一点没动、也没开始等确认', R('network') === NET && R('dhcp') === DHCP && !fs.existsSync(NG));
	r = await cgi('lanset_set', { ip: '192.168.1.1', mask: '255.255.255.0', dhcp_on: true, from: '192.168.1.100', to: '192.168.1.249', lease: '12h' });
	ok('什么都没改：不动、不等确认', r.result?.changed === false && !fs.existsSync(NG), JSON.stringify(r));
	// 只改 DHCP
	r = await cgi('lanset_set', { ip: '192.168.1.1', from: '192.168.1.50', to: '192.168.1.99', lease: '1d' });
	ok('改 DHCP 范围和租期：写成 start / limit / leasetime', r.result?.changed && /start '50'/.test(dhcpSec()) && /limit '50'/.test(dhcpSec()) && /leasetime '1d'/.test(dhcpSec()), dhcpSec());
	ok('只改 DHCP：重新加载网络和 dnsmasq，面板入口不动', await waitFor(() => runs().includes('/etc/init.d/dnsmasq reload')) && !runs().includes('/etc/init.d/claude-mcp reload'), runs().join('|'));
	await cgi('net_confirm', { token: r.result?.token });
	r = await cgi('lanset_set', { dhcp_on: false });
	ok('关掉 DHCP：ignore=1', r.result?.changed && /ignore '1'/.test(dhcpSec()), dhcpSec());
	await cgi('net_confirm', { token: r.result?.token });
	r = await cgi('lanset_set', { dhcp_on: true });
	ok('打开 DHCP：去掉 ignore', r.result?.changed && !/ignore/.test(dhcpSec()), dhcpSec());
	await cgi('net_confirm', { token: r.result?.token });
	// 改路由器地址（换网段）
	reset(); fs.rmSync(RUN, { force: true });
	r = await cgi('lanset_set', { ip: '192.168.5.1', mask: '255.255.255.0' });
	ok('改路由器地址：开始 90 秒确认，回新地址和面板端口', r.result?.changed && r.result.ip === '192.168.5.1' && r.result.port === 906, JSON.stringify(r).slice(0, 300));
	ok('写进去：地址、掩码；别的选项（IPv6 分配）原样', /ipaddr '192\.168\.5\.1'/.test(lanSec()) && /netmask '255\.255\.255\.0'/.test(lanSec()) && /ip6assign '60'/.test(lanSec()), lanSec());
	ok('设备的固定地址搬到新网段（主机号不变），不在家里网段的不动', /ip '192\.168\.5\.20'/.test(R('dhcp')) && /ip '10\.9\.9\.9'/.test(R('dhcp')) && r.result.moved?.host === 1, R('dhcp'));
	ok('端口转发的目标地址搬到新网段', /dest_ip '192\.168\.5\.20'/.test(R('firewall')) && r.result.moved?.pf === 1, R('firewall'));
	ok('DHCP 范围不用动（本来就是相对网段的）', /start '100'/.test(dhcpSec()) && /limit '150'/.test(dhcpSec()));
	ok('重新加载：网络、dnsmasq、防火墙、面板局域网入口', await waitFor(() => ['/etc/init.d/network reload', '/etc/init.d/dnsmasq reload', '/etc/init.d/firewall reload', '/etc/init.d/claude-mcp reload'].every((x) => runs().includes(x))), runs().join('|'));
	ok('原版后台没绑在旧地址上：不动', R('uhttpd') === UH && !runs().includes('/etc/init.d/uhttpd reload'));
	ok('推送：路由器地址改成 192.168.5.1', /路由器地址改成 192\.168\.5\.1/.test(fs.readFileSync(NOTE, 'utf8')));
	// 在新地址上确认（不用登录）
	const tok = r.result.token;
	ok('新地址上：外网来的请求不认', /只能在家里局域网/.test(err(await cgi('lan_keep', { token: tok }, { lan: true, ra: '58.33.1.2' }))));
	ok('新地址上：编号不对，说已经没了', (await cgi('lan_keep', { token: 'x'.repeat(16) }, { lan: true })).result?.gone === true);
	const pk = (await cgi('lan_keep', { token: tok, peek: true }, { lan: true })).result;
	ok('新地址上：先问还剩几秒、改的是什么', pk?.left > 0 && pk.what === '局域网设置', JSON.stringify(pk));
	ok('新地址上：点「保留」', (await cgi('lan_keep', { token: tok }, { lan: true })).result?.ok === true && !fs.existsSync(NG));
	await sleep(3500);
	ok('保留以后过了时间也不改回', /192\.168\.5\.1/.test(lanSec()));
	// 不点保留：网络、DHCP、防火墙一起改回去
	reset(); fs.rmSync(RUN, { force: true });
	r = await cgi('lanset_set', { ip: '172.20.0.1', mask: '255.255.0.0', from: '172.20.1.1', to: '172.20.1.200' });
	ok('换成 172.20.0.1/16：地址、范围一起改', r.result?.changed && /ipaddr '172\.20\.0\.1'/.test(lanSec()) && /netmask '255\.255\.0\.0'/.test(lanSec()) && /start '257'/.test(dhcpSec()) && /limit '200'/.test(dhcpSec()) && /ip '172\.20\.0\.20'/.test(R('dhcp')), lanSec() + dhcpSec());
	ok('90 秒（测试里 3 秒）没点保留：网络、DHCP、防火墙全部改回', await waitFor(() => R('network') === NET && R('dhcp') === DHCP && R('firewall') === FW && !fs.existsSync(NG)), lanSec());
	// 新地址上点「不保留」
	reset();
	r = await cgi('lanset_set', { ip: '192.168.8.1' });
	await cgi('lan_keep', { token: r.result?.token, revert: true }, { lan: true });
	ok('新地址上点「不保留」：马上改回', await waitFor(() => R('network') === NET));
	// 原版后台绑在旧地址上
	reset({ uh: "config uhttpd 'main'\n\tlist listen_http '192.168.1.1:80'\n\tlist listen_http '[::]:80'\n" }); fs.rmSync(RUN, { force: true });
	r = await cgi('lanset_set', { ip: '192.168.9.1' });
	ok('原版后台绑在旧地址上：一起换成新地址，重新加载', /listen_http '192\.168\.9\.1:80'/.test(R('uhttpd')) && /listen_http '\[::\]:80'/.test(R('uhttpd')) && await waitFor(() => runs().includes('/etc/init.d/uhttpd reload')), R('uhttpd'));
	await cgi('net_confirm', { token: r.result?.token });
	// 网段里的主机号放不进新网段
	reset({ dhcp: DHCP.replace("option ip '192.168.1.20'", "option ip '192.168.1.200'") });
	r = await cgi('lanset_set', { ip: '192.168.5.1', mask: '255.255.255.128', from: '192.168.5.10', to: '192.168.5.100' });
	ok('固定地址放不进新网段：说是哪个，什么都不改', /固定地址（192\.168\.1\.200）放不进新网段/.test(err(r)) && R('network') === NET, JSON.stringify(r).slice(0, 200));
	// 同一网段里只换主机号（192.168.1.1 → 192.168.1.254）：固定地址不搬
	reset();
	r = await cgi('lanset_set', { ip: '192.168.1.254' });
	ok('同一网段只换路由器地址：固定地址、端口转发不动', r.result?.changed && /ipaddr '192\.168\.1\.254'/.test(lanSec()) && R('dhcp') === DHCP && R('firewall') === FW && r.result.moved.host === 0, lanSec());
	await cgi('net_confirm', { token: r.result?.token });
	// 固定地址
	reset(); fs.rmSync(RUN, { force: true });
	g = (await cgi('lanset_get')).result || {};
	ok('读：固定地址列表（MAC、IP、名字）', g.hosts?.length === 2 && g.hosts[0].id === 'nas' && g.hosts[0].mac === '00:11:22:33:44:55' && g.hosts[0].ip === '192.168.1.20' && g.hosts[0].name === 'NAS' && g.hosts[0].edit, JSON.stringify(g.hosts));
	const hb = [
		[{ op: 'add', mac: '00:11:22:33:44:77', ip: '192.168.1.20' }, /已经固定给「NAS」了/, '地址被占了'],
		[{ op: 'add', mac: '00:11:22:33:44:55', ip: '192.168.1.30' }, /已经有固定地址了（192\.168\.1\.20）/, '设备已经有了'],
		[{ op: 'add', mac: 'zz', ip: '192.168.1.30' }, /MAC 地址不对/, 'MAC 不对'],
		[{ op: 'add', mac: '00:11:22:33:44:77', ip: '192.168.2.30' }, /要在家里网段/, '不在网段里'],
		[{ op: 'add', mac: '00:11:22:33:44:77', ip: '192.168.1.1' }, /路由器自己的地址/, '路由器地址'],
		[{ op: 'add', mac: '00:11:22:33:44:77', ip: '192.168.1.255' }, /第一个或最后一个/, '广播地址'],
	];
	for (const [p, re, why] of hb) { r = await cgi('lan_host_set', p); ok('固定地址不让加：' + why, re.test(err(r)), JSON.stringify(r).slice(0, 200)); }
	ok('出错时 DHCP 配置不动', R('dhcp') === DHCP);
	r = await cgi('lan_host_set', { op: 'add', mac: '00:11:22:33:44:77', ip: '192.168.1.30', name: 'iPad' });
	ok('加固定地址：马上写进去（不等确认），重新加载 dnsmasq', r.result?.changed && /config host 'cmcp_h001122334477'\n\toption mac '00:11:22:33:44:77'\n\toption ip '192\.168\.1\.30'\n\toption name 'iPad'/.test(R('dhcp')) && !fs.existsSync(NG) && await waitFor(() => runs().includes('/etc/init.d/dnsmasq reload')), R('dhcp'));
	r = await cgi('lan_host_set', { op: 'add', mac: '00:11:22:33:44:88', ip: '192.168.1.31', name: '客厅电视' });
	ok('中文名字不写进 dnsmasq（它只认英文）', r.result?.changed && !/客厅电视/.test(R('dhcp')) && /ip '192\.168\.1\.31'/.test(R('dhcp')));
	r = await cgi('lan_host_set', { op: 'edit', id: 'nas', ip: '192.168.1.21' });
	ok('改固定地址', r.result?.changed && /ip '192\.168\.1\.21'/.test(R('dhcp')) && r.result.hosts.find((x) => x.id === 'nas').ip === '192.168.1.21');
	r = await cgi('lan_host_set', { op: 'del', id: 'nas' });
	ok('删固定地址', r.result?.changed && !/config host 'nas'/.test(R('dhcp')));
	fs.appendFileSync(CFG + '/dhcp', "\nconfig host 'bl1'\n\toption mac 'aa:aa:aa:aa:aa:aa'\n\toption ip '192.168.1.40'\n\toption cmcp_black '1'\n");
	ok('「不走代理」要用的固定地址不能删', /不能删：不走代理要用/.test(err(await cgi('lan_host_set', { op: 'del', id: 'bl1' }))));
	// 等确认时不让再改
	reset();
	r = await cgi('lanset_set', { ip: '192.168.6.1' });
	ok('等确认时：别的网络设置先不让改', /还在等你确认/.test(err(await cgi('lanset_set', { ip: '192.168.7.1' }))));
	await cgi('net_confirm', { token: r.result?.token });
} finally {
	fs.rmSync(D, { recursive: true, force: true });
}
let pass = 0; for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '  ' + (note || '').slice(0, 400))); if (c) pass++; }
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

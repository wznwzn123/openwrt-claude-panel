// 6.0 第 15 项：访客 Wi-Fi——单独的网络和防火墙区域、随机密码、两个频段都开、到点自动关、第一次打开要 90 秒确认
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_guest.mjs（在 cloud 目录里运行）
// uci 用 test/fake/uci.py 代替；等待时间改成 3 秒；重新加载只记下来不真跑；会写 /tmp/dhcp.leases（跑完还原）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, execFileSync } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpguest-'));
const CFG = D + '/config', SB = D + '/sbin', NG = D + '/ng', RUN = D + '/reload.log', NOTE = D + '/notify.log';
const LEASES = '/tmp/dhcp.leases', LBAK = fs.existsSync(LEASES) ? fs.readFileSync(LEASES) : null;
fs.mkdirSync(CFG); fs.mkdirSync(SB);
for (const b of ['cmcp-netguard', 'cmcp-guest']) { fs.copyFileSync(path.resolve('../src/bin/' + b), SB + '/' + b); fs.chmodSync(SB + '/' + b, 0o755); }
fs.writeFileSync(SB + '/cmcp-notify', `#!/bin/sh\necho "$@" >> ${NOTE}\n`); fs.chmodSync(SB + '/cmcp-notify', 0o755);
fs.writeFileSync(SB + '/cmcp-compat', '#!/bin/sh\nexit 0\n'); fs.chmodSync(SB + '/cmcp-compat', 0o755);
fs.writeFileSync(D + '/wifi', '#!/bin/sh\n'); fs.chmodSync(D + '/wifi', 0o755);
const UCI = 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG;
const WL = `config wifi-device 'radio0'
	option type 'mac80211'
	option band '2g'
	option channel '6'

config wifi-device 'radio1'
	option type 'mac80211'
	option band '5g'
	option channel '36'

config wifi-iface 'default_radio0'
	option device 'radio0'
	option network 'lan'
	option mode 'ap'
	option ssid 'Home'
	option encryption 'psk2'
	option key 'Home-Pass-2024!'

config wifi-iface 'default_radio1'
	option device 'radio1'
	option network 'lan'
	option mode 'ap'
	option ssid 'Home'
	option encryption 'psk2'
	option key 'Home-Pass-2024!'
`;
const NET = `config device
	option name 'br-lan'
	option type 'bridge'
	list ports 'lan1'

config interface 'lan'
	option device 'br-lan'
	option proto 'static'
	option ipaddr '192.168.1.1'
	option netmask '255.255.255.0'

config interface 'iot'
	option proto 'static'
	option ipaddr '192.168.33.1/24'

config interface 'wan'
	option device 'wan'
	option proto 'dhcp'
`;
const FW = `config defaults
	option input 'ACCEPT'

config zone
	option name 'lan'
	list network 'lan'
	option input 'ACCEPT'
	option forward 'ACCEPT'

config zone
	option name 'wan'
	list network 'wan'
	list network 'wan6'
	option input 'REJECT'
`;
const DH = `config dnsmasq
	option domainneeded '1'

config dhcp 'lan'
	option interface 'lan'
	option start '100'
`;
const reset = (o = {}) => {
	for (const f of fs.readdirSync(CFG)) fs.rmSync(CFG + '/' + f);
	fs.writeFileSync(CFG + '/wireless', o.wl ?? WL); fs.writeFileSync(CFG + '/network', o.net ?? NET);
	if (o.fw !== null) fs.writeFileSync(CFG + '/firewall', o.fw ?? FW);
	fs.writeFileSync(CFG + '/dhcp', DH);
	fs.rmSync(NG, { recursive: true, force: true }); fs.rmSync(D + '/guest_until', { force: true }); fs.rmSync(RUN, { force: true }); fs.rmSync(NOTE, { force: true });
};
const R = (f) => fs.readFileSync(CFG + '/' + f, 'utf8');
fs.writeFileSync(D + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30), uci: UCI, uci_dir: CFG, wifi_bin: D + '/wifi' }));
const ENV = { CMCP_SBIN: SB, CMCP_NG: NG, CMCP_NG_WAIT: '3', CMCP_NG_RUN: RUN, CMCP_GUEST_ETC: D, CMCP_UCI: UCI, CMCP_UCI_DIR: CFG };
const cgi = (method, params) => new Promise((z) => {
	const msg = { jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' }, body = JSON.stringify(msg);
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, ...ENV, CLAUDE_MCP_CONF: D + '/config.json', PATH_INFO: '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)) } });
	let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const runs = () => (fs.existsSync(RUN) ? fs.readFileSync(RUN, 'utf8').trim().split('\n').filter(Boolean) : []);
const waitFor = async (f, ms = 9000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(150); } return false; };
const sec = (txt, name) => { const m = new RegExp(`config [a-z-]+ '${name}'\\n((?:\\t[^\\n]*\\n?)*)`).exec(txt); return m ? m[1] : ''; };
const guest = (a) => execFileSync('sh', [SB + '/cmcp-guest', a], { env: { ...process.env, ...ENV } }).toString();
try {
	reset();
	let r = await cgi('guest_get');
	ok('没开过：能开，现在关着', r.result?.can === true && r.result.on === false && r.result.net === null && r.result.key === null, JSON.stringify(r));
	r = await cgi('guest_set', { on: true, hours: 5 });
	ok('只能开 2 小时、1 天、7 天', /2 小时、1 天或 7 天/.test(r.error?.message || ''));
	// ---- 第一次打开 ----
	r = await cgi('guest_set', { on: true, hours: 2 });
	const g = r.result || {};
	ok('第一次打开：要 90 秒确认（加了网络设置）', /^[a-z0-9]{16}$/.test(g.token || '') && g.wait === 3, JSON.stringify(r).slice(0, 300));
	ok('两个频段都开，同名同密码', g.on === true && g.bands.map((b) => b.name).join() === '2.4G,5G' && g.ssid === 'Home-Guest');
	ok('随机密码：三段、不含容易看错的字', /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/.test(g.key || ''), g.key);
	ok('2 小时后到期', Math.abs(g.until - (Date.now() / 1000 + 7200)) < 5 && +fs.readFileSync(D + '/guest_until', 'utf8') === g.until);
	let net = R('network');
	ok('访客网络用没人用的地址段（跳过家里和 192.168.33.x）', /option ipaddr '192\.168\.66\.1'/.test(sec(net, 'cmcpguest')) && g.net === '192.168.66.1', sec(net, 'cmcpguest'));
	ok('新版写法：单独的网桥', /option name 'br-cmcpguest'/.test(sec(net, 'cmcp_guest_dev')) && /option type 'bridge'/.test(sec(net, 'cmcp_guest_dev')) && /option device 'br-cmcpguest'/.test(sec(net, 'cmcpguest')));
	ok('家里的网络设置没动', net.startsWith(NET.trimEnd().split('\n\n')[0].split('\n')[0]) && /option ipaddr '192\.168\.1\.1'/.test(sec(net, 'lan')));
	const fw = R('firewall');
	ok('防火墙：访客区域进不了路由器、不能转发到家里', /option input 'REJECT'/.test(sec(fw, 'cmcp_guest_zone')) && /option forward 'REJECT'/.test(sec(fw, 'cmcp_guest_zone')) && /option network 'cmcpguest'/.test(sec(fw, 'cmcp_guest_zone')));
	ok('防火墙：只能转发到外网', /option src 'cmcpguest'/.test(sec(fw, 'cmcp_guest_fwd')) && /option dest 'wan'/.test(sec(fw, 'cmcp_guest_fwd')) && !/dest 'lan'/.test(fw));
	ok('防火墙：只放行 DHCP 和 DNS', /dest_port '67-68'/.test(sec(fw, 'cmcp_guest_dhcp')) && /dest_port '53'/.test(sec(fw, 'cmcp_guest_dns')));
	const dh = R('dhcp');
	ok('DHCP：访客拿公共 DNS（不经过代理插件）', /option interface 'cmcpguest'/.test(sec(dh, 'cmcpguest')) && /list dhcp_option '6,223\.5\.5\.5,119\.29\.29\.29'/.test(sec(dh, 'cmcpguest')), sec(dh, 'cmcpguest'));
	let wl = R('wireless');
	ok('Wi-Fi：每个频段一个访客 Wi-Fi，互相隔离', ['radio0', 'radio1'].every((x) => { const s = sec(wl, 'cmcp_guest_' + x); return new RegExp(`option device '${x}'`).test(s) && /option network 'cmcpguest'/.test(s) && /option isolate '1'/.test(s) && /option encryption 'psk2'/.test(s) && /option cmcp_guest '1'/.test(s) && s.includes(`option key '${g.key}'`); }), wl);
	ok('家里的 Wi-Fi 没动', /option ssid 'Home'\n\toption encryption 'psk2'\n\toption key 'Home-Pass-2024!'/.test(sec(wl, 'default_radio0')));
	ok('备份了 4 个配置文件', ['network', 'firewall', 'dhcp', 'wireless'].every((f) => fs.existsSync(NG + '/files/' + f)) && fs.readFileSync(NG + '/files/network', 'utf8') === NET);
	ok('2 秒后重新加载网络、防火墙、DHCP、Wi-Fi', await waitFor(() => runs().length === 4) && runs().join('|') === '/etc/init.d/network reload|/etc/init.d/firewall reload|/etc/init.d/dnsmasq reload|wifi reload', runs().join('|'));
	r = await cgi('guest_get');
	ok('等确认时显示「访客 Wi-Fi」', r.result?.pending?.what === '访客 Wi-Fi' && r.result.pending.token === g.token);
	r = await cgi('net_confirm', { token: g.token });
	ok('点「保留」', r.result?.ok === true);
	// ---- 访客连上 ----
	const T = Math.floor(Date.now() / 1000) + 3600;
	fs.writeFileSync(LEASES, `${T} aa:00:00:00:00:01 192.168.66.120 phone *\n${T} aa:00:00:00:00:02 192.168.66.121 pad *\n${T} aa:00:00:00:00:03 192.168.1.50 pc *\n`);
	r = await cgi('guest_get');
	ok('显示几台访客设备连着', r.result?.devs === 2, JSON.stringify(r.result));
	// ---- 再打开（已经有访客网络了） ----
	fs.rmSync(RUN, { force: true });
	r = await cgi('guest_set', { on: true, hours: 24 });
	ok('再打开：不用再确认，换新密码，名字不变', !r.result?.token && r.result.key !== g.key && r.result.ssid === 'Home-Guest' && Math.abs(r.result.until - (Date.now() / 1000 + 86400)) < 5, JSON.stringify(r).slice(0, 300));
	ok('只改 Wi-Fi、只重新加载 Wi-Fi，网络设置没再改', R('network') === net && await waitFor(() => runs().length === 1, 3000) && runs()[0] === 'wifi reload');
	// ---- 延长 ----
	const u0 = r.result.until;
	r = await cgi('guest_set', { extend: 2 });
	ok('延长 2 小时', r.result?.until === u0 + 7200);
	r = await cgi('guest_set', { extend: 168 });
	ok('最多还剩 7 天', Math.abs(r.result.until - (Date.now() / 1000 + 7 * 86400)) < 5);
	// ---- 关掉 ----
	fs.rmSync(RUN, { force: true });
	r = await cgi('guest_set', { on: false });
	wl = R('wireless');
	ok('关掉：两个访客 Wi-Fi 都关，到期时间删掉', r.result?.on === false && /option disabled '1'/.test(sec(wl, 'cmcp_guest_radio0')) && /option disabled '1'/.test(sec(wl, 'cmcp_guest_radio1')) && !fs.existsSync(D + '/guest_until') && r.result.key === null);
	ok('关掉也重新加载 Wi-Fi', await waitFor(() => runs()[0] === 'wifi reload', 3000));
	r = await cgi('guest_set', { extend: 2 });
	ok('关着不能延长', /已经关了/.test(r.error?.message || ''));
	// ---- 到点自动关 ----
	await cgi('guest_set', { on: true, hours: 2 });
	fs.writeFileSync(D + '/guest_until', String(Math.floor(Date.now() / 1000) - 5));
	r = await cgi('guest_get');
	ok('到点了：面板上已经算关了', r.result?.on === false);
	fs.rmSync(RUN, { force: true });
	guest('tick');
	wl = R('wireless');
	ok('看门狗跑 tick：关掉、推送', /option disabled '1'/.test(sec(wl, 'cmcp_guest_radio0')) && !fs.existsSync(D + '/guest_until') && /info guest 访客 Wi-Fi 已关/.test(fs.readFileSync(NOTE, 'utf8')) && runs()[0] === 'wifi reload');
	fs.rmSync(NOTE, { force: true }); guest('tick');
	ok('没开着的时候 tick 什么都不做', !fs.existsSync(NOTE));
	// ---- 卸载 ----
	fs.rmSync(RUN, { force: true });
	guest('remove');
	ok('卸载：访客 Wi-Fi、网络、防火墙、DHCP 都删掉', !/cmcp/.test(R('wireless')) && !/cmcp/.test(R('network')) && !/cmcp/.test(R('firewall')) && !/cmcp/.test(R('dhcp')) && runs().length === 4);
	fs.rmSync(RUN, { force: true }); guest('remove');
	ok('没开过访客 Wi-Fi 时卸载：不重新加载网络', runs().length === 0);
	// ---- 第一次打开没确认：全部撤销 ----
	reset();
	r = await cgi('guest_set', { on: true, hours: 2 });
	ok('不点「保留」：时间到全部改回原来的（网络、防火墙、DHCP、Wi-Fi）', await waitFor(() => !fs.existsSync(NG) && R('network') === NET && R('firewall') === FW && R('dhcp') === DH && R('wireless') === WL, 9000));
	ok('到期时间也删掉，看门狗不会再推送「已关」', !fs.existsSync(D + '/guest_until') && /warn net 访客 Wi-Fi已改回原来的/.test(fs.readFileSync(NOTE, 'utf8')), fs.existsSync(NOTE) ? fs.readFileSync(NOTE, 'utf8') : '');
	// ---- 各种路由器 ----
	reset({ wl: WL.replace("option band '5g'", "option band '5g'\n\toption disabled '1'") });
	r = await cgi('guest_set', { on: true, hours: 2 });
	ok('只有一个频段开着：只开那一个', r.result?.bands?.map((b) => b.id).join() === 'radio0' && !/cmcp_guest_radio1/.test(R('wireless')));
	await cgi('net_confirm', { token: r.result?.token });
	reset({ net: NET.replace(/config device\n[^]*?\n\n/, '') });
	r = await cgi('guest_set', { on: true, hours: 2 });
	net = R('network');
	ok('老版写法（没有 device 段）：网络自己当网桥', /option type 'bridge'/.test(sec(net, 'cmcpguest')) && !/cmcp_guest_dev/.test(net), net);
	await cgi('net_confirm', { token: r.result?.token });
	reset({ net: NET.replace("option netmask '255.255.255.0'", "option netmask '255.255.0.0'") });
	r = await cgi('guest_set', { on: true, hours: 2 });
	ok('家里网络是 192.168.0.0/16：访客换成 10.x', r.result?.net === '10.233.66.1', JSON.stringify(r).slice(0, 200));
	await cgi('net_confirm', { token: r.result?.token });
	reset({ wl: WL.replace("option ssid 'Home'", "option ssid '一二三四五六七八九十'") });
	r = await cgi('guest_set', { on: true, hours: 2 });
	ok('名字太长：前面按整字截短，加「-Guest」不超过 32 字节', r.result?.ssid === '一二三四五六七八-Guest' && Buffer.byteLength(r.result.ssid) <= 32, r.result?.ssid);
	await cgi('net_confirm', { token: r.result?.token });
	reset({ wl: WL.replace(/option type 'mac80211'/g, "option type 'mtwifi'") });
	r = await cgi('guest_get');
	ok('无线驱动不是 mac80211：说清楚开不了', r.result?.can === false && /无线驱动（mtwifi）不支持/.test(r.result.why));
	r = await cgi('guest_set', { on: true, hours: 2 });
	ok('硬件开不了：报给兼容性（错误码 -32020）', r.error?.code === -32020);
	reset({ fw: null });
	r = await cgi('guest_get');
	ok('没有防火墙：说清楚开不了', r.result?.can === false && /没法把访客和家里网络隔开/.test(r.result.why));
	reset({ wl: WL.replace(/option network 'lan'/g, "option network 'lan'\n\toption disabled '1'").replace(/option band '(\dg)'/g, "option band '$1'\n\toption disabled '1'") });
	r = await cgi('guest_set', { on: true, hours: 2 });
	ok('家里 Wi-Fi 都关着：让先打开（不算兼容问题）', /先打开一个/.test(r.error?.message || '') && r.error.code !== -32020, JSON.stringify(r));
	// ---- Wi-Fi 设置页不把访客当成家里的 Wi-Fi ----
	reset();
	r = await cgi('guest_set', { on: true, hours: 2 }); await cgi('net_confirm', { token: r.result.token });
	r = await cgi('wifi_get');
	ok('Wi-Fi 设置页里不出现访客 Wi-Fi', r.result.radios.every((x) => x.wifi.ssid === 'Home') && r.result.same === true);
	// ---- 权限 ----
	const src = fs.readFileSync(path.resolve('../src/mcp/26-backup.uc'), 'utf8');
	const grp = (n) => (src.match(new RegExp('\\t' + n + ": \\[([^\\]]*)\\]")) || [])[1] || '';
	ok('子账号要「完全控制」', grp('net').includes("'guest_get'") && grp('net').includes("'guest_set'") && !grp('view').includes("'guest_"));
	ok('看门狗每分钟调 tick；安装、卸载都带上', /cmcp-guest tick/.test(fs.readFileSync(path.resolve('../src/bin/cmcp-watchdog'), 'utf8')) && /cmcp-guest remove/.test(fs.readFileSync(path.resolve('../uninstall.sh'), 'utf8')) && /\/usr\/sbin\/cmcp-guest /.test(fs.readFileSync(path.resolve('../install.sh'), 'utf8')));
} catch (e) { ok('出错：' + e.stack, false); }
if (LBAK) fs.writeFileSync(LEASES, LBAK); else fs.rmSync(LEASES, { force: true });
fs.rmSync(D, { recursive: true, force: true });
let bad = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '\n    ' + note)); if (!c) bad++; }
console.log(`\n${results.length - bad}/${results.length} 通过`);
process.exit(bad ? 1 : 0);

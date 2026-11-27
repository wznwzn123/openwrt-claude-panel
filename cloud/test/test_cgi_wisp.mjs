// 6.0 第 22 项（路由器）：无线中继（连上级 Wi-Fi 上网）——扫描（去重、按信号排、标加密、不列自己发的）、连上（加 sta + wwan + 防火墙外网区域，
// 固定信道改成上级的）、断开（只删自己加的，信道改回去）；原版后台设的中继只显示；不支持的加密说清楚；90 秒确认
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_wisp.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpwi-'));
const CFG = D + '/config', SB = D + '/sbin', NG = D + '/ng', RUN = D + '/reload.log', NOTE = D + '/notify.log', ETC = D + '/etc', BIN = D + '/bin', ROOT = D + '/root';
for (const d of [CFG, SB, ETC, BIN, ROOT + '/usr/sbin']) fs.mkdirSync(d, { recursive: true });
fs.copyFileSync(path.resolve('../src/bin/cmcp-netguard'), SB + '/cmcp-netguard'); fs.chmodSync(SB + '/cmcp-netguard', 0o755);
fs.writeFileSync(SB + '/cmcp-notify', `#!/bin/sh\necho "$@" >> ${NOTE}\n`); fs.chmodSync(SB + '/cmcp-notify', 0o755);
fs.writeFileSync(SB + '/cmcp-compat', '#!/bin/sh\n'); fs.chmodSync(SB + '/cmcp-compat', 0o755);
fs.writeFileSync(D + '/wifi', '#!/bin/sh\n'); fs.chmodSync(D + '/wifi', 0o755);
const enc = (o) => JSON.stringify(o);
const SCAN = { results: [
	{ ssid: 'Neighbor-5G', bssid: 'AA:00:00:00:00:01', channel: 149, signal: -60, quality: 50, quality_max: 70, encryption: { enabled: true, wpa: [2], authentication: ['psk'], ciphers: ['ccmp'] } },
	{ ssid: 'Hotel', bssid: 'AA:00:00:00:00:02', channel: 6, signal: -70, quality: 40, quality_max: 70, encryption: { enabled: false } },
	{ ssid: 'Hotel', bssid: 'AA:00:00:00:00:03', channel: 11, signal: -50, quality: 60, quality_max: 70, encryption: { enabled: false } },
	{ ssid: 'Office', bssid: 'AA:00:00:00:00:04', channel: 1, signal: -65, quality: 45, quality_max: 70, encryption: { enabled: true, wpa: [2], authentication: ['802.1x'] } },
	{ ssid: 'NewHome', bssid: 'AA:00:00:00:00:05', channel: 11, signal: -55, quality: 55, quality_max: 70, encryption: { enabled: true, wpa: [3], authentication: ['sae'] } },
	{ ssid: 'Mixed', bssid: 'AA:00:00:00:00:06', channel: 3, signal: -58, quality: 52, quality_max: 70, encryption: { enabled: true, wpa: [2, 3], authentication: ['psk', 'sae'] } },
	{ ssid: 'MyHome', bssid: 'AA:00:00:00:00:07', channel: 6, signal: -30, quality: 70, quality_max: 70, encryption: { enabled: true, wpa: [2], authentication: ['psk'] } },
	{ ssid: '', bssid: 'AA:00:00:00:00:08', channel: 6, signal: -40, quality: 65, quality_max: 70, encryption: { enabled: true, wpa: [2], authentication: ['psk'] } },
] };
fs.writeFileSync(BIN + '/ubus', `#!/bin/sh
[ "$1" = -t ] && shift 2
case "$2" in
network.wireless) echo '{"radio0":{"interfaces":[{"ifname":"phy0-ap0"}]},"radio1":{"interfaces":[]}}' ;;
iwinfo) [ -f ${D}/noiw ] && exit 4; echo '${enc(SCAN)}' ;;
network.interface.wan) [ -f ${D}/wanup ] || exit 4; echo '{"up":true,"uptime":300,"ipv4-address":[{"address":"192.168.0.2","mask":24}],"route":[{"target":"0.0.0.0","mask":0,"nexthop":"192.168.0.1"}]}' ;;
network.interface.wwan) echo '{"up":true,"uptime":120,"ipv4-address":[{"address":"'"$(cat ${D}/wwanip 2>/dev/null || echo 10.20.0.8)"'","mask":24}]}' ;;
*) exit 4 ;;
esac
`); fs.chmodSync(BIN + '/ubus', 0o755);
fs.writeFileSync(BIN + '/opkg', `#!/bin/sh\ncat ${D}/pkgs 2>/dev/null\n`); fs.chmodSync(BIN + '/opkg', 0o755);
const WL = `config wifi-device 'radio0'
	option type 'mac80211'
	option band '2g'
	option channel '1'

config wifi-device 'radio1'
	option type 'mac80211'
	option band '5g'
	option channel 'auto'
	option disabled '1'

config wifi-iface 'default_radio0'
	option device 'radio0'
	option mode 'ap'
	option network 'lan'
	option ssid 'MyHome'
	option encryption 'psk2'
	option key 'homepass1'
`;
const NET = `config interface 'lan'
	option proto 'static'
	option ipaddr '192.168.1.1'
	option netmask '255.255.255.0'

config interface 'wan'
	option proto 'dhcp'
`;
const FW = `config zone 'wanz'
	option name 'wan'
	option network 'wan wan6'
`;
const reset = (o = {}) => { fs.writeFileSync(CFG + '/wireless', o.wl || WL); fs.writeFileSync(CFG + '/network', NET); fs.writeFileSync(CFG + '/firewall', FW); fs.rmSync(NG, { recursive: true, force: true }); fs.rmSync(NOTE, { force: true }); fs.rmSync(RUN, { force: true }); };
const R = (f) => fs.readFileSync(CFG + '/' + f, 'utf8');
const sec = (f, re) => R(f).split(/\n(?=config )/).find((x) => re.test(x)) || '';
fs.writeFileSync(D + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG, wifi_bin: D + '/wifi' }));
const cgi = (method, params) => new Promise((z) => {
	const msg = { jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' }, body = JSON.stringify(msg);
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, PATH: BIN + ':' + process.env.PATH, CLAUDE_MCP_CONF: D + '/config.json', PATH_INFO: '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_SBIN: SB, CMCP_NG: NG, CMCP_NG_WAIT: '3', CMCP_NG_RUN: RUN, CMCP_ETC: ETC, CMCP_WISP_ROOT: ROOT } });
	let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const runs = () => (fs.existsSync(RUN) ? fs.readFileSync(RUN, 'utf8').trim().split('\n').filter(Boolean) : []);
const waitFor = async (f, ms = 9000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(150); } return false; };
const err = (r) => r.error?.message || '';
try {
	reset(); fs.writeFileSync(ROOT + '/usr/sbin/wpad', ''); fs.writeFileSync(D + '/pkgs', 'wpad-basic-mbedtls - 2023\n');
	let r = await cgi('wisp_get'), g = r.result || {};
	ok('读：两个频段，2.4G 开着能扫、5G 关着；没在中继', g.radios?.length === 2 && g.radios[0].on && !g.radios[1].on && g.on === false && g.can === true, JSON.stringify(r).slice(0, 300));
	ok('5G 关着：扫描说先打开', /5G 关着，先在 Wi-Fi 页打开/.test(err(await cgi('wisp_scan', { radio: 'radio1' }))));
	r = await cgi('wisp_scan', { radio: 'radio0' });
	const L = r.result?.list || [];
	const by = Object.fromEntries(L.map((x) => [x.ssid, x]));
	ok('扫描：同名的只留信号最好的，按信号排，不列隐藏的和自己发的', L.length === 5 && by.Hotel?.ch === 11 && by.Hotel.q === 86 && !by.MyHome && L[0].ssid === 'Hotel', JSON.stringify(L).slice(0, 400));
	ok('扫描：加密方式（开放 / WPA2 / WPA2+WPA3 按 WPA2 / 只有 WPA3 / 企业认证连不了）', by.Hotel.enc === 'none' && !by.Hotel.lock && by['Neighbor-5G'].enc === 'psk2' && by['Neighbor-5G'].lock && by.Mixed.enc === 'psk2' && by.NewHome.enc === 'sae' && by.NewHome.ok && by.Office.enc === null && !by.Office.ok, JSON.stringify(L));
	fs.writeFileSync(D + '/pkgs', 'wpad-mini - 2019\n');
	r = await cgi('wisp_scan', { radio: 'radio0' });
	ok('无线组件是 mini 版：只有 WPA3 的标成连不了', r.result.list.find((x) => x.ssid === 'NewHome').ok === false);
	r = await cgi('wisp_set', { op: 'on', radio: 'radio0', ssid: 'NewHome', key: '12345678', enc: 'sae', ch: 11 });
	ok('mini 版连只有 WPA3 的：说清楚，什么都不改', /只用 WPA3，这台路由器的无线组件不支持/.test(err(r)) && R('wireless') === WL && !fs.existsSync(NG), JSON.stringify(r).slice(0, 200));
	fs.writeFileSync(D + '/pkgs', 'wpad-basic-mbedtls - 2023\n');
	const bad = [
		[{ op: 'on', radio: 'radio0', ssid: 'Office', enc: 'wpa2' }, /企业认证、WEP 不支持/, '企业认证'],
		[{ op: 'on', radio: 'radio0', ssid: 'X', key: '123', enc: 'psk2' }, /密码是 8–63 位/, '密码太短'],
		[{ op: 'on', radio: 'radio9', ssid: 'X', enc: 'none' }, /没有这个频段/, '频段不对'],
		[{ op: 'on', radio: 'radio0', ssid: '', enc: 'none' }, /名字不对/, '没名字'],
		[{ op: 'off' }, /没有在中继/, '没中继时断开'],
	];
	for (const [p, re, why] of bad) { r = await cgi('wisp_set', p); ok('不让改：' + why, re.test(err(r)), JSON.stringify(r).slice(0, 200)); }
	ok('出错时配置一点没动', R('wireless') === WL && R('network') === NET && R('firewall') === FW && !fs.existsSync(NG));
	// 没装 rpcd-mod-iwinfo：用 iwinfo 命令扫
	fs.writeFileSync(D + '/noiw', '');
	fs.writeFileSync(BIN + '/iwinfo', `#!/bin/sh
cat <<'X'
Cell 01 - Address: AA:00:00:00:00:11
          ESSID: "Cafe WiFi"
          Mode: Master  Channel: 6
          Signal: -52 dBm  Quality: 58/70
          Encryption: mixed WPA/WPA2 PSK (TKIP, CCMP)

Cell 02 - Address: AA:00:00:00:00:12
          ESSID: "Lab"
          Mode: Master  Channel: 11
          Signal: -70 dBm  Quality: 40/70
          Encryption: WPA2 802.1X (CCMP)

Cell 03 - Address: AA:00:00:00:00:13
          ESSID: "Free"
          Mode: Master  Channel: 1
          Signal: -60 dBm  Quality: 50/70
          Encryption: none

Cell 04 - Address: AA:00:00:00:00:14
          ESSID: "W3"
          Mode: Master  Channel: 1
          Signal: -60 dBm  Quality: 49/70
          Encryption: WPA3 SAE (CCMP)
X
`); fs.chmodSync(BIN + '/iwinfo', 0o755);
	r = await cgi('wisp_scan', { radio: 'radio0' });
	const c = Object.fromEntries((r.result?.list || []).map((x) => [x.ssid, x]));
	ok('没装 rpcd-mod-iwinfo：用 iwinfo 命令扫，加密方式也认得', c['Cafe WiFi']?.enc === 'psk-mixed' && c['Cafe WiFi'].ch === 6 && c['Cafe WiFi'].q === 83 && c.Lab?.enc === null && c.Free?.enc === 'none' && c.W3?.enc === 'sae', JSON.stringify(r).slice(0, 500));
	fs.rmSync(D + '/noiw');
	// 连上
	r = await cgi('wisp_set', { op: 'on', radio: 'radio0', ssid: 'Neighbor-5G', key: 'upstream-pass', enc: 'psk2', ch: 6 });
	ok('连上：开始 90 秒确认', r.result?.changed && r.result.what === '连「Neighbor-5G」', JSON.stringify(r).slice(0, 200));
	const sta = sec('wireless', /wifi-iface 'cmcp_wisp'/);
	ok('加客户端：频段、模式 sta、接到 wwan、名字、加密、密码；记下原来的信道', /device 'radio0'/.test(sta) && /mode 'sta'/.test(sta) && /network 'wwan'/.test(sta) && /ssid 'Neighbor-5G'/.test(sta) && /encryption 'psk2'/.test(sta) && /key 'upstream-pass'/.test(sta) && /cmcp_ch '1'/.test(sta), sta);
	ok('固定信道改成上级的（家里 Wi-Fi 跟着上级）', /channel '6'/.test(sec('wireless', /wifi-device 'radio0'/)));
	ok('加上网接口 wwan（DHCP，带标记）', /config interface 'wwan'\n\toption proto 'dhcp'\n\toption cmcp_wisp '1'/.test(R('network')), R('network'));
	ok('网线优先：wwan 的跳数比宽带口大（用户 11/28：插着网线又开中继，两条都通时走哪条说不准）', /option metric '20'/.test(sec('network', /interface 'wwan'/)), R('network'));
	ok('防火墙外网区域加上 wwan（老写法的字符串也认）', /list network 'wan'\n\tlist network 'wan6'\n\tlist network 'wwan'/.test(R('firewall')), R('firewall'));
	ok('重新加载：网络、无线、防火墙', await waitFor(() => ['/etc/init.d/network reload', 'wifi reload', '/etc/init.d/firewall reload'].every((x) => runs().includes(x))), runs().join('|'));
	ok('推送', /无线中继：连「Neighbor-5G」/.test(fs.readFileSync(NOTE, 'utf8')));
	await cgi('net_confirm', { token: r.result.token });
	g = (await cgi('wisp_get')).result || {};
	ok('读：在中继、连的是谁、拿到的地址', g.on && g.mine && g.ssid === 'Neighbor-5G' && g.radio === 'radio0' && g.status?.up && g.status.ip === '10.20.0.8' && g.clash === false, JSON.stringify(g).slice(0, 300));
	ok('网线没上网：不标网线优先', g.cable === false);
	fs.writeFileSync(D + '/wanup', '1');
	ok('网线能上网：标出来（面板写网线优先）', ((await cgi('wisp_get')).result || {}).cable === true);
	fs.rmSync(D + '/wanup');
	fs.writeFileSync(D + '/wwanip', '192.168.1.50');
	g = (await cgi('wisp_get')).result || {};
	ok('上级给的地址跟家里网段一样：标出冲突', g.clash === true && g.lan === '192.168.1.1');
	fs.rmSync(D + '/wwanip');
	// 同一个 Wi-Fi 重新连，密码不填用原来的
	r = await cgi('wisp_set', { op: 'on', radio: 'radio0', ssid: 'Neighbor-5G', key: '', enc: 'psk2', ch: 6 });
	ok('同一个 Wi-Fi 重新连、密码不填：用原来的', r.result?.changed && /key 'upstream-pass'/.test(sec('wireless', /wifi-iface 'cmcp_wisp'/)) && (R('network').match(/interface 'wwan'/g) || []).length === 1 && (R('firewall').match(/'wwan'/g) || []).length === 1, R('firewall'));
	await cgi('net_confirm', { token: r.result.token });
	// 换开放的
	r = await cgi('wisp_set', { op: 'on', radio: 'radio0', ssid: 'Hotel', enc: 'none', ch: 11 });
	const s2 = sec('wireless', /wifi-iface 'cmcp_wisp'/);
	ok('换成开放的 Wi-Fi：不写密码，信道改成 11，原来的信道还记着 1', /encryption 'none'/.test(s2) && !/key/.test(s2) && /cmcp_ch '1'/.test(s2) && /channel '11'/.test(sec('wireless', /wifi-device 'radio0'/)), s2);
	await cgi('net_confirm', { token: r.result.token });
	// 断开
	r = await cgi('wisp_set', { op: 'off' });
	ok('断开：只删自己加的（客户端、wwan、防火墙里的 wwan），信道改回 1', r.result?.changed && !/cmcp_wisp/.test(R('wireless')) && /channel '1'/.test(sec('wireless', /wifi-device 'radio0'/)) && !/wwan/.test(R('network')) && !/wwan/.test(R('firewall')) && /'wan6'/.test(R('firewall')), R('wireless') + R('firewall'));
	await cgi('net_confirm', { token: r.result.token });
	// 不点保留：全部改回
	reset();
	r = await cgi('wisp_set', { op: 'on', radio: 'radio0', ssid: 'Hotel', enc: 'none', ch: 11 });
	ok('90 秒（测试里 3 秒）没点保留：无线、网络、防火墙全部改回', await waitFor(() => R('wireless') === WL && R('network') === NET && R('firewall') === FW && !fs.existsSync(NG)));
	// 原版后台设的中继
	reset({ wl: WL + "\nconfig wifi-iface 'wwan_sta'\n\toption device 'radio0'\n\toption mode 'sta'\n\toption network 'wwan'\n\toption ssid 'Boss'\n" });
	g = (await cgi('wisp_get')).result || {};
	ok('原版后台设的中继：显示在连谁，标着不是面板设的', g.on && !g.mine && g.ssid === 'Boss');
	ok('原版后台设的中继：面板不改', /原版后台里已经设了中继/.test(err(await cgi('wisp_set', { op: 'on', radio: 'radio0', ssid: 'Hotel', enc: 'none' }))) && /原版后台里设的/.test(err(await cgi('wisp_set', { op: 'off' }))));
	// 没有 wpa_supplicant
	reset(); fs.rmSync(ROOT + '/usr/sbin/wpad');
	g = (await cgi('wisp_get')).result || {};
	r = await cgi('wisp_set', { op: 'on', radio: 'radio0', ssid: 'Hotel', enc: 'none' });
	ok('固件没有 wpa_supplicant：读的时候说不能用，连的时候说清楚', g.can === false && /没有 wpa_supplicant/.test(err(r)) && r.error?.code === -32020);
} finally {
	fs.rmSync(D, { recursive: true, force: true });
}
let pass = 0; for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '  ' + (note || '').slice(0, 500))); if (c) pass++; }
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);


/* ---------------- 6.0 第 15 项：访客 Wi-Fi ----------------
 * 开 2 小时 / 1 天 / 7 天，到点自动关（看门狗每分钟跑 cmcp-guest tick）。每次打开换一个随机密码，面板出二维码。
 * 访客走单独的网络 cmcpguest（自己选一个跟现有网络不冲突的 192.168.x.0/24），防火墙单独一个区域：
 *   只能上外网，进不了家里网络和路由器后台（只放行 DHCP、DNS），访客之间也互相看不到（isolate）。
 *   DNS 直接给公共 DNS（223.5.5.5、119.29.29.29）：不经过路由器上的代理插件，访客默认直连（风险 11）。
 * 有家里 Wi-Fi 的频段都开（同名同密码），只有一个就开那一个（用户 11/25 定）。
 * 第一次打开要加网络、防火墙、DHCP 设置：用「90 秒确认」（cmcp-netguard），家里网络出问题会自动撤销。 */
const GU_UNTIL = ETC + '/guest_until', GU_NET = 'cmcpguest', GU_DNS = '6,223.5.5.5,119.29.29.29';
const GU_HOURS = [2, 24, 168];

function v4int(ip) {
	let m = match('' + ip, /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	return m ? ((+m[1]) * 16777216 + (+m[2]) * 65536 + (+m[3]) * 256 + (+m[4])) : null;
}
function pow2(n) { let x = 1; for (let i = 0; i < n; i++) x *= 2; return x; }
function cidr_has(net, plen, ip) {
	let a = v4int(net), b = v4int(ip);
	if (a == null || b == null) return false;
	let size = pow2(32 - plen);
	return a - a % size == b - b % size; // 不用 int()：30-plugin-switch.uc 里有个同名的 int（工具参数说明）
}
function mask_len(nm) {
	let n = v4int(nm), pl = 0;
	if (n == null) return 24;
	for (let b = 31; b >= 0; b--) { let v = pow2(b); if (n >= v) { n -= v; pl++; } else break; }
	return pl;
}
// 重新加载（测试时只记下来）
function gu_reload(c) {
	let f = getenv('CMCP_NG_RUN');
	bg(f ? 'sleep 1; echo ' + shq(c) + ' >> ' + shq(f) : 'sleep 1; ' + c);
}
// 路由器上已经在用的地址段（network 配置 + 实际网卡上的）
function used_nets() {
	let out = [];
	for (let s in (uci_load('network') ?? [])) {
		if (s['.type'] != 'interface') continue;
		for (let a in as_list(s.ipaddr)) {
			let m = match(a, /^([0-9.]+)(\/(\d+))?$/);
			if (!m) continue;
			push(out, [m[1], m[3] ? +m[3] : s.netmask ? mask_len(s.netmask) : 24]);
		}
	}
	for (let l in split(sh('ip -4 -o addr show 2>/dev/null').out, '\n')) {
		let m = match(l, /inet ([0-9.]+)\/(\d+)/);
		if (m) push(out, [m[1], +m[2]]);
	}
	return out;
}
function gu_pick_net() {
	let used = used_nets();
	for (let c in ['192.168.33.1', '192.168.66.1', '192.168.88.1', '192.168.99.1', '192.168.123.1', '192.168.166.1', '10.233.66.1', '172.30.66.1']) {
		let bad = false;
		for (let u in used) if (cidr_has(u[0], u[1] < 24 ? u[1] : 24, c) || cidr_has(c, 24, u[0])) bad = true;
		if (!bad) return c;
	}
	return null;
}
function gu_secs() {
	let W = uci_load('wireless') ?? [], out = [];
	for (let s in W) if (s['.type'] == 'wifi-iface' && s.cmcp_guest == '1') push(out, s);
	return out;
}
function gu_wan_zone() {
	for (let s in (uci_load('firewall') ?? [])) if (s['.type'] == 'zone' && (s.name == 'wan' || index(as_list(s.network), 'wan') >= 0)) return s.name;
	return null;
}
// 能不能开、能开在哪些频段上；开不了说原因
function gu_can() {
	let ws = wifi_state();
	if (ws.none) return { why: '这台路由器没有无线', hw: true };
	if (!stat(wifi_bin())) return { why: '这台路由器没有 wifi 命令，改不了无线设置', hw: true };
	if (!stat(ucdir() + '/firewall')) return { why: '路由器没有防火墙设置，没法把访客和家里网络隔开', hw: true };
	if (!stat(ucdir() + '/dhcp')) return { why: '路由器没有 DHCP 设置，访客连上拿不到地址', hw: true };
	if (!gu_wan_zone()) return { why: '防火墙里没有外网（wan）区域，访客没法上网', hw: true };
	let ok = [], drv = null;
	for (let x in ws.radios) {
		if (!x.main || x.r.disabled == '1') continue;
		let t = x.r.type ?? 'mac80211';
		if (t != 'mac80211') { drv = t; continue; }
		if (!match(x.id, /^[A-Za-z0-9_]+$/)) continue;
		push(ok, x);
	}
	if (!length(ok)) return drv ? { why: '这台路由器的无线驱动（' + drv + '）不支持在面板里加访客 Wi-Fi', hw: true } : { why: '家里的 Wi-Fi 都关着，先打开一个' };
	return { radios: ok };
}
function gu_until() { let u = +trim(readfile(GU_UNTIL) ?? '0'); return u > 0 ? u : 0; }
function gu_net_addr() {
	for (let s in (uci_load('network') ?? [])) if (s['.name'] == GU_NET) return s.ipaddr ?? null;
	return null;
}
function gu_devs(addr) {
	let n = 0, m = match('' + addr, /^(\d+\.\d+\.\d+)\./);
	if (!m) return 0;
	for (let l in split(trim(readfile('/tmp/dhcp.leases') ?? ''), '\n')) {
		let f = split(l, ' ');
		if (length(f) >= 3 && index(f[2], m[1] + '.') == 0 && +f[0] > time()) n++;
	}
	return n;
}
function gu_state() {
	let gs = gu_secs(), c = gu_can(), ws = wifi_state(), st = wifi_ifnames(), bands = [];
	let on = false;
	for (let g in gs) {
		if (g.disabled == '1') continue;
		on = true;
		let x = null;
		for (let y in (ws.radios ?? [])) if (y.id == g.device) x = y;
		let up = null;
		if (type(st[g.device]) == 'object') { up = false; for (let i in (st[g.device].interfaces ?? [])) if (i?.section == g['.name'] && i?.ifname) up = true; }
		push(bands, { id: g.device, name: x ? (BAND_NAME[x.band] ?? x.band) : g.device, up });
	}
	// 刚打开 40 秒内 Wi-Fi 还在启动，不算「没开起来」
	if (time() - (stat(GU_UNTIL)?.mtime ?? 0) < 40) for (let b in bands) if (b.up === false) b.up = null;
	let u = gu_until(), addr = gu_net_addr();
	if (on && u && u <= time()) on = false; // 到点了，看门狗马上会关
	return {
		can: !c.why, why: c.why ?? null, on, until: on ? u : 0, left: on && u ? u - time() : 0,
		ssid: length(gs) ? gs[0].ssid : null, key: on && length(gs) ? (gs[0].key ?? '') : null,
		bands: on ? bands : [], devs: on ? gu_devs(addr) : 0, net: addr, pending: ng_pending()
	};
}
P.guest_get = function() { return gu_state(); };

// 新密码：去掉容易看错的 0 o 1 l i，分成三段好念
function gu_key() {
	let r = trim(sh("tr -dc 'abcdefghjkmnpqrstuvwxyz23456789' < /dev/urandom | head -c 12").out);
	if (length(r) != 12) die('路由器生成不了随机密码，稍后再试');
	return substr(r, 0, 4) + '-' + substr(r, 4, 4) + '-' + substr(r, 8, 4);
}
// 默认名字：家里 Wi-Fi 的名字加「-Guest」，超过 32 字节就把前面截短（按整字截，不截半个中文）
function gu_ssid(base) {
	base = '' + (base ?? 'OpenWrt');
	while (length(base) > 26) {
		base = substr(base, 0, length(base) - 1);
		while (length(base) && (ord(base, length(base) - 1) & 0xc0) == 0x80) base = substr(base, 0, length(base) - 1);
		if (length(base) && ord(base, length(base) - 1) >= 0xc0) base = substr(base, 0, length(base) - 1);
	}
	return base + '-Guest';
}
function gu_off_cmds(U) {
	let cmds = [];
	for (let g in gu_secs()) if (g.disabled != '1') push(cmds, U + ' set ' + shq('wireless.' + g['.name'] + '.disabled=1'));
	return cmds;
}

// a：{ on: true, hours } 打开；{ on: false } 关掉；{ extend: hours } 延长
P.guest_set = function(a) {
	let U = conf().uci;
	if (a?.on === false) {
		let cmds = gu_off_cmds(U);
		unlink(GU_UNTIL);
		if (length(cmds)) {
			let r = sh(join(' && ', cmds) + ' && ' + U + ' commit wireless');
			if (r.code != 0) die('关不掉：' + trim_nl(r.out));
			gu_reload('wifi reload');
		}
		return gu_state();
	}
	if (exists(a ?? {}, 'extend')) {
		let h = +a.extend, s = gu_state();
		if (index(GU_HOURS, h) < 0) die('只能延长 2 小时、1 天或 7 天');
		if (!s.on) die('访客 Wi-Fi 已经关了，重新打开就行');
		let u = gu_until(), nu = (u > time() ? u : time()) + h * 3600;
		if (nu > time() + 7 * 86400) nu = time() + 7 * 86400;
		writefile(GU_UNTIL, '' + nu);
		return gu_state();
	}
	let h = +(a?.hours ?? 0);
	if (index(GU_HOURS, h) < 0) die('只能开 2 小时、1 天或 7 天');
	let c = gu_can();
	if (c.why) { if (c.hw) compat_die('wifi', c.why); die(c.why); }
	ng_busy();
	let addr = gu_net_addr(), setup = !addr, cmds = [];
	let set = (k, v) => push(cmds, U + ' set ' + shq(k + '=' + v));
	if (setup) {
		addr = gu_pick_net();
		if (!addr) die('找不到空闲的地址段给访客网络用');
		let net = uci_load('network') ?? [], dsa = false;
		for (let s in net) if (s['.type'] == 'device' && s.type == 'bridge') dsa = true;
		if (!dsa) { let rel = match(readfile('/etc/openwrt_release') ?? '', /DISTRIB_RELEASE='?(\d+)\./); if (rel && +rel[1] >= 21) dsa = true; }
		if (dsa) {
			set('network.cmcp_guest_dev', 'device'); set('network.cmcp_guest_dev.name', 'br-' + GU_NET); set('network.cmcp_guest_dev.type', 'bridge'); set('network.cmcp_guest_dev.bridge_empty', '1');
		}
		set('network.' + GU_NET, 'interface'); set('network.' + GU_NET + '.proto', 'static');
		if (dsa) set('network.' + GU_NET + '.device', 'br-' + GU_NET); else set('network.' + GU_NET + '.type', 'bridge');
		set('network.' + GU_NET + '.ipaddr', addr); set('network.' + GU_NET + '.netmask', '255.255.255.0');
		set('firewall.cmcp_guest_zone', 'zone'); set('firewall.cmcp_guest_zone.name', GU_NET); set('firewall.cmcp_guest_zone.network', GU_NET);
		set('firewall.cmcp_guest_zone.input', 'REJECT'); set('firewall.cmcp_guest_zone.output', 'ACCEPT'); set('firewall.cmcp_guest_zone.forward', 'REJECT');
		set('firewall.cmcp_guest_fwd', 'forwarding'); set('firewall.cmcp_guest_fwd.src', GU_NET); set('firewall.cmcp_guest_fwd.dest', gu_wan_zone());
		set('firewall.cmcp_guest_dhcp', 'rule'); set('firewall.cmcp_guest_dhcp.name', 'Allow-Guest-DHCP'); set('firewall.cmcp_guest_dhcp.src', GU_NET);
		set('firewall.cmcp_guest_dhcp.proto', 'udp'); set('firewall.cmcp_guest_dhcp.dest_port', '67-68'); set('firewall.cmcp_guest_dhcp.target', 'ACCEPT');
		set('firewall.cmcp_guest_dns', 'rule'); set('firewall.cmcp_guest_dns.name', 'Allow-Guest-DNS'); set('firewall.cmcp_guest_dns.src', GU_NET);
		set('firewall.cmcp_guest_dns.proto', 'tcp udp'); set('firewall.cmcp_guest_dns.dest_port', '53'); set('firewall.cmcp_guest_dns.target', 'ACCEPT');
		set('dhcp.' + GU_NET, 'dhcp'); set('dhcp.' + GU_NET + '.interface', GU_NET); set('dhcp.' + GU_NET + '.start', '100');
		set('dhcp.' + GU_NET + '.limit', '150'); set('dhcp.' + GU_NET + '.leasetime', '2h');
		push(cmds, U + ' -q delete ' + shq('dhcp.' + GU_NET + '.dhcp_option'));
		push(cmds, U + ' add_list ' + shq('dhcp.' + GU_NET + '.dhcp_option=' + GU_DNS));
	}
	let key = gu_key(), old = gu_secs(), ssid = length(old) ? old[0].ssid : gu_ssid(c.radios[0].main.ssid), want = {};
	for (let x in c.radios) {
		let sid = 'cmcp_guest_' + x.id;
		want[sid] = 1;
		set('wireless.' + sid, 'wifi-iface'); set('wireless.' + sid + '.device', x.id); set('wireless.' + sid + '.mode', 'ap');
		set('wireless.' + sid + '.network', GU_NET); set('wireless.' + sid + '.ssid', ssid); set('wireless.' + sid + '.encryption', 'psk2');
		set('wireless.' + sid + '.key', key); set('wireless.' + sid + '.isolate', '1'); set('wireless.' + sid + '.cmcp_guest', '1'); set('wireless.' + sid + '.disabled', '0');
	}
	// 家里 Wi-Fi 关掉了的频段：上面的访客也关掉
	for (let g in old) if (!want[g['.name']] && g.disabled != '1') set('wireless.' + g['.name'] + '.disabled', '1');
	let cfgs = setup ? ['network', 'firewall', 'dhcp', 'wireless'] : ['wireless'], tok = null;
	if (setup) {
		tok = rand_str(16);
		if (!tok) die('路由器生成不了随机数，稍后再试');
		sh('rm -rf ' + shq(NG) + ' && mkdir -p ' + shq(NG + '/files'));
		for (let f in cfgs) sh('cp -f ' + shq(ucdir() + '/' + f) + ' ' + shq(NG + '/files/' + f));
		for (let f in cfgs) if (!stat(NG + '/files/' + f)) { sh('rm -rf ' + shq(NG)); die('备份原来的设置失败，没有改'); }
		writefile(NG + '/what', '访客 Wi-Fi');
		writefile(NG + '/reload', '/etc/init.d/network reload\n/etc/init.d/firewall reload\n/etc/init.d/dnsmasq reload\nwifi reload\n');
		writefile(NG + '/drop', GU_UNTIL + '\n');
		writefile(NG + '/until', '' + (time() + NG_WAIT + 15));
		writefile(NG + '/token', tok);
	}
	let r = sh(join(' && ', cmds) + ' && ' + join(' && ', map(cfgs, (f) => U + ' commit ' + f)));
	if (r.code != 0) {
		if (setup) { sh(join('; ', map(cfgs, (f) => U + ' revert ' + f + '; cp -f ' + shq(NG + '/files/' + f) + ' ' + shq(ucdir() + '/' + f))) + '; rm -rf ' + shq(NG)); }
		die('打开失败，没有改：' + trim_nl(r.out));
	}
	writefile(GU_UNTIL, '' + (time() + h * 3600));
	if (setup) bg(sprintf('CMCP_NG=%s CMCP_UCI_DIR=%s CMCP_SBIN=%s CMCP_GUEST_ETC=%s %s/cmcp-netguard run %s', shq(NG), shq(ucdir()), shq(SBIN), shq(ETC), SBIN, tok));
	else gu_reload('wifi reload');
	let s = gu_state();
	s.token = tok; s.wait = tok ? NG_WAIT : 0;
	return s;
};

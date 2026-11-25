/* ---------------- 6.0 第 24 项：上网设置（自动获取 / 宽带拨号 / 固定 IP、DNS） ----------------
 * 只改 WAN 口那一个接口（一般叫 wan；没有就找防火墙 wan 区域里的）；其他选项（网口、MTU、IPv6）原样保留。
 * 宽带拨号的密码只能改、不给面板看（用户 11/25 定）：要看只能在「我的主页 → 敏感信息」验证后看（wan_secret）。
 * 改完走「90 秒确认」（cmcp-netguard）：拨号失败、地址填错连不上外网，90 秒没点「保留」自动改回，并推送。
 * 兼容：18.06 起的 netifd 都是这几个选项（proto / username / password / ipaddr / netmask / gateway / dns / peerdns）；
 * 22.03 起 ipaddr 可以写成 1.2.3.4/24 或列表，读的时候都认；拨号要固件装了 ppp 和 PPPoE 插件，没装就说清楚。 */
const WAN_ROOT = getenv('CMCP_WAN_ROOT') || '';
function wan_iface() {
	let net = uci_load('network') ?? [], by = {};
	for (let s in net) if (s['.type'] == 'interface') by[s['.name']] = s;
	let ok = (s) => s && length(s.proto ?? '') && index(['none', 'dhcpv6', '6in4', '6to4', '6rd', 'dslite', 'map'], s.proto) < 0;
	if (ok(by.wan)) return by.wan;
	for (let z in (uci_load('firewall') ?? [])) if (z['.type'] == 'zone' && z.name == 'wan')
		for (let n in as_list(z.network)) if (ok(by[n])) return by[n];
	return null;
}
function wan_pppoe_ok() {
	if (!stat(WAN_ROOT + '/lib/netifd/proto/ppp.sh')) return false;
	return length(trim(sh('ls ' + WAN_ROOT + '/usr/lib/pppd/*/*pppoe*.so 2>/dev/null').out)) > 0;
}
function wan_status(n) {
	let w = null;
	try { w = json(sh('ubus call network.interface.' + n + ' status 2>/dev/null').out); } catch (e) {}
	if (type(w) != 'object') return null;
	let a = w['ipv4-address']?.[0], gw = null;
	for (let r in (w.route ?? [])) if (r.target == '0.0.0.0' && +r.mask == 0) gw = r.nexthop;
	return { up: !!w.up, pending: !!w.pending, ip: a?.address ?? null, pl: a?.mask ?? null, gw, dns: w['dns-server'] ?? [], uptime: w.up ? +w.uptime || 0 : 0, err: map(w.errors ?? [], (e) => e.code) };
}
function v4mask(pl) { let n = pow2(32) - pow2(32 - pl), o = []; for (let i = 3; i >= 0; i--) { let d = pow2(i * 8); push(o, '' + ((n - n % d) / d) % 256); } return join('.', o); }
function wan_static(s) {
	let ips = as_list(s.ipaddr), ip = null, pl = null;
	if (length(ips)) { let m = match(ips[0], /^([0-9.]+)(\/([0-9]+))?$/); if (m) { ip = m[1]; pl = m[3] ? +m[3] : null; } }
	if (pl == null && length(s.netmask ?? '')) pl = mask_len(s.netmask);
	return { ip, mask: ip ? v4mask(pl ?? 24) : null, gw: s.gateway ?? null };
}
P.wan_get = function() {
	let s = wan_iface();
	if (!s) return { none: '没有 WAN 口：这台路由器可能当旁路由或者中继在用', pending: ng_pending() };
	let p = s.proto, kind = index(['dhcp', 'pppoe', 'static'], p) >= 0 ? p : 'other', st = wan_static(s);
	let dns = as_list(s.dns);
	// 面板认不得的选项（比如手动加的静态路由参数）在面板里改也会原样保留；只有协议不认识时整页只读
	return {
		iface: s['.name'], proto: kind, proto_name: kind == 'other' ? p : null,
		user: p == 'pppoe' ? (s.username ?? '') : null, has_pw: length(s.password ?? '') > 0,
		ip: kind == 'static' ? st.ip : null, mask: kind == 'static' ? st.mask : null, gw: kind == 'static' ? st.gw : null,
		dns, dns_auto: kind != 'static' && !length(dns) && (s.peerdns ?? '1') != '0',
		pppoe: wan_pppoe_ok(), status: wan_status(s['.name']), pending: ng_pending()
	};
};
function wan_ip_check(ip, what) {
	if (v4int(ip) == null || !match(ip, /^(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])){3}$/)) die(what + (match(what, /[A-Za-z]$/) ? ' ' : '') + '不对，比如 ' + (what == '子网掩码' ? '255.255.255.0' : what == 'DNS' ? '223.5.5.5' : '192.168.0.10'));
}
function wan_txt(v, what, max) {
	v = '' + (v ?? '');
	if (length(v) > max) die(what + '太长');
	if (match(v, /[\x01-\x1f\x7f]/)) die(what + '里有不能用的字符');
	return v;
}
// a: { proto: dhcp|pppoe|static, user, pw（留空 = 不改）, ip, mask, gw, dns: [..], dns_auto }
P.wan_set = function(a) {
	let s = wan_iface();
	if (!s) die('没有 WAN 口：这台路由器可能当旁路由或者中继在用');
	ng_busy();
	let n = s['.name'], cur = s.proto, p = a?.proto;
	if (index(['dhcp', 'pppoe', 'static'], p) < 0) die('只能选自动获取、宽带拨号、固定 IP');
	let U = conf().uci, cmds = [], o = 'network.' + n + '.', set = (k, v) => push(cmds, U + ' set ' + shq(o + k + '=' + v)), del = (k) => { if (s[k] != null) push(cmds, U + ' -q delete ' + shq(o + k)); }, add = (k, v) => push(cmds, U + ' add_list ' + shq(o + k + '=' + v));
	let what = '';
	if (p == 'pppoe') {
		if (!wan_pppoe_ok()) compat_die('pppoe', '固件没装宽带拨号组件（ppp-mod-pppoe）');
		let user = trim(wan_txt(a?.user, '宽带账号', 128)), pw = wan_txt(a?.pw, '宽带密码', 128);
		if (!length(user)) die('填宽带账号');
		if (!length(pw) && !(cur == 'pppoe' && length(s.password ?? ''))) die('填宽带密码');
		if (cur != 'pppoe') set('proto', 'pppoe');
		if (user != (s.username ?? '')) set('username', user);
		if (length(pw) && pw != (s.password ?? '')) set('password', pw);
		del('ipaddr'); del('netmask'); del('gateway');
		what = '宽带拨号';
	} else if (p == 'static') {
		let ip = trim('' + (a?.ip ?? '')), mask = trim('' + (a?.mask ?? '')) || '255.255.255.0', gw = trim('' + (a?.gw ?? ''));
		wan_ip_check(ip, 'IP 地址'); wan_ip_check(mask, '子网掩码'); wan_ip_check(gw, '网关');
		let pl = mask_len(mask);
		if (pl < 8 || pl > 30 || v4int(mask) != pow2(32) - pow2(32 - pl)) die('子网掩码不对，比如 255.255.255.0');
		if (!cidr_has(ip, pl, gw)) die('网关要跟 IP 地址在同一个网段');
		if (ip == gw) die('IP 地址不能跟网关一样');
		let size = pow2(32 - pl), off = v4int(ip) % size;
		if (off == 0 || off == size - 1) die('IP 地址不能是网段的第一个或最后一个');
		let lan = pf_lan();
		if (lan && (cidr_has(lan.ip, lan.pl, ip) || cidr_has(ip, pl, lan.ip))) die('跟家里网段（' + lan.ip + '/' + lan.pl + '）冲突，换一个，或者先改家里的网段');
		if (cur != 'static') set('proto', 'static');
		let old = wan_static(s);
		if (cur != 'static' || old.ip != ip || old.mask != mask) { del('ipaddr'); set('ipaddr', ip); set('netmask', mask); }
		if (gw != (s.gateway ?? '')) set('gateway', gw);
		what = '固定 IP';
	} else {
		if (cur != 'dhcp') set('proto', 'dhcp');
		del('ipaddr'); del('netmask'); del('gateway');
		what = '自动获取';
	}
	// DNS：固定 IP 必须填；其他的可以自动（用运营商给的）
	let dns = [];
	for (let d in (type(a?.dns) == 'array' ? a.dns : [])) {
		d = trim('' + (d ?? ''));
		if (!length(d)) continue;
		if (v4int(d) != null) wan_ip_check(d, 'DNS');
		else if (!match(d, /^[0-9A-Fa-f:]+$/) || !match(d, /:/)) die('DNS 不对：' + d + '，比如 223.5.5.5');
		if (index(dns, d) < 0) push(dns, d);
	}
	if (length(dns) > 3) die('DNS 最多填 3 个');
	let auto = p != 'static' && (a?.dns_auto || !length(dns));
	if (p == 'static' && !length(dns)) die('固定 IP 要填 DNS，比如 223.5.5.5');
	let olddns = as_list(s.dns);
	if (auto) { if (length(olddns)) del('dns'); if ((s.peerdns ?? '1') == '0') del('peerdns'); }
	else {
		if (join(' ', olddns) != join(' ', dns)) { del('dns'); for (let d in dns) add('dns', d); }
		if (p != 'static' && (s.peerdns ?? '1') != '0') set('peerdns', '0');
		if (p == 'static' && (s.peerdns ?? '1') == '0') del('peerdns');
	}
	if (!length(cmds)) return { changed: false };
	let tok = rand_str(16);
	if (!tok) die('路由器生成不了随机数，稍后再试');
	sh('rm -rf ' + shq(NG) + ' && mkdir -p ' + shq(NG + '/files') + ' && cp -f ' + shq(ucdir() + '/network') + ' ' + shq(NG + '/files/network'));
	if (!stat(NG + '/files/network')) die('备份原来的设置失败，没有改');
	writefile(NG + '/what', '上网设置');
	writefile(NG + '/reload', '/etc/init.d/network reload\n');
	writefile(NG + '/until', '' + (time() + NG_WAIT + 15));
	writefile(NG + '/token', tok);
	let r = sh(join(' && ', cmds) + ' && ' + U + ' commit network');
	if (r.code != 0) {
		sh(U + ' revert network; cp -f ' + shq(NG + '/files/network') + ' ' + shq(ucdir() + '/network') + '; rm -rf ' + shq(NG));
		die('保存失败，没有改：' + trim_nl(r.out));
	}
	try { sh(sprintf('%s/cmcp-notify info net %s %s net >/dev/null 2>&1', SBIN, shq(cur == p ? '上网设置改了' : '上网方式改成' + what), shq('90 秒内没点「保留」会自动改回去。'))); } catch (e) {}
	bg(sprintf('CMCP_NG=%s CMCP_UCI_DIR=%s CMCP_SBIN=%s %s/cmcp-netguard run %s', shq(NG), shq(ucdir()), shq(SBIN), SBIN, tok));
	return { changed: true, token: tok, wait: NG_WAIT, what };
};
// 宽带账号和密码：只在「我的主页 → 敏感信息」验证后给（只有主账号）
P.wan_secret = function(a) {
	need_sudo(a, true);
	let s = wan_iface();
	if (!s || s.proto != 'pppoe') return { pppoe: false };
	return { pppoe: true, user: s.username ?? '', pw: s.password ?? '' };
};

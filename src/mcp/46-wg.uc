/* ---------------- 6.0 第 55 项：家庭加密通道（WireGuard） ----------------
 * 用户 11/26 定：用 WireGuard（路由器大多自带），家里没有公网 IP 的写清楚为什么用不了；默认能连整个家里网络，可以改成只通指定设备；
 * 手机只有访问家里的流量走通道（AllowedIPs 只写通道网段和家里局域网），上网照常走手机自己的网络。
 * 只有主账号能用；每台手机单独一把钥匙（加的时候在路由器上生成，只给手机看这一次，路由器只留公钥），删了就连不上。
 * 加手机要先确认本人（配置里有私钥）。托管版：官网给一个「子域名-w」的地址跟着家里的 IP 变（看门狗每 5 分钟查一次）；
 * 自建版用 IP，或者填自己的域名。
 * uci：network.cmcp_wg（接口）、network.cmcp_wgp_N（手机）、firewall.cmcp_wg_z / cmcp_wg_f / cmcp_wg_in / cmcp_wg_dN。fw3、fw4 都是这套 uci。
 * 测试用：CMCP_WG_ROOT（假根目录，看 netifd 的 wireguard.sh）、CMCP_WG_BIN（假 wg）、CMCP_WG_APPLY（生效命令）、
 *         CMCP_WG_WAN6（宽带口的 IPv6，空 = 没有）、CMCP_WG_LAN（家里局域网，「IP/前缀」空格分开） */
const WG_F = ETC + '/wg.json', WG_BIN = getenv('CMCP_WG_BIN') || 'wg', WG_PKG = 'luci-proto-wireguard';
function wg_read() { let o = cmcp_readj(WG_F, {}); return type(o) == 'object' ? o : {}; }
function wg_caps() {
	let proto = !!stat((getenv('CMCP_WG_ROOT') ?? '') + '/lib/netifd/proto/wireguard.sh');
	let tool = trim(sh('command -v ' + shq(WG_BIN) + ' >/dev/null 2>&1 && echo y').out ?? '') == 'y';
	return { proto, tool };
}
function wg_key(cmd, input) {
	let r = input != null ? sh(sprintf('printf %%s %s | %s %s 2>/dev/null', shq(input), shq(WG_BIN), cmd)) : sh(shq(WG_BIN) + ' ' + cmd + ' 2>/dev/null');
	let k = trim(r.out ?? '');
	if (!match(k, /^[A-Za-z0-9+\/]{43}=$/)) die('生成钥匙失败（wg ' + cmd + '）');
	return k;
}
const wg_priv4 = (ip) => !!match(ip ?? '', /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.|169\.254\.)/);
const wg_cgnat = (ip) => !!match(ip ?? '', /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./);
// 家里能不能从外面连进来：有公网 IPv4、或者宽带口有公网 IPv6；上一级还有路由器（光猫）的要它转发端口
function wg_reach() {
	let w4 = getenv('CMCP_SM_WAN4') ?? sm_ubus('wan')?.['ipv4-address']?.[0]?.address, v6 = getenv('CMCP_WG_WAN6'), r = { wan4: w4 ?? '' };
	if (v6 == null) { v6 = ''; for (let o in ['wan6', 'wan']) for (let a in (sm_ubus(o)?.['ipv6-address'] ?? [])) if (!length(v6) && match(a.address ?? '', /^[23][0-9a-f]{0,3}:/i)) v6 = a.address; }
	if (length(v6)) r.v6 = v6;
	if (w4 && !wg_priv4(w4) && !wg_cgnat(w4)) r.v4 = w4;
	else if (wg_cgnat(w4)) r.why = 'cgnat';
	else if (w4) { r.why = 'nat'; for (let p in sm_pub4()) if (!wg_priv4(p) && !wg_cgnat(p)) r.pub4 = p; }
	else r.why = 'nowan';
	r.ok = !!(r.v4 || r.v6 || (r.why == 'nat' && r.pub4));
	if (!r.ok) r.msg = r.why == 'cgnat' ? '没有公网 IP：宽带口是运营商的内网地址 ' + w4 + '。找运营商要公网 IP，或者开 IPv6'
		: r.why == 'nat' ? '没有公网 IP：路由器上一级还有路由器（' + w4 + '），也没有 IPv6'
		: '宽带口没有地址';
	return r;
}
// 家里局域网的网段（手机这边只有去这些地址的流量走通道）
function wg_lan() {
	let e = getenv('CMCP_WG_LAN'), out = [];
	let l = e != null ? map(split(e, ' '), (x) => { let p = split(x, '/'); return { address: p[0], mask: +p[1] }; }) : (sm_ubus('lan')?.['ipv4-address'] ?? []);
	for (let a in l) {
		let n = xp_ip2n(a.address), m = +a.mask, sz = 1;
		if (n == null || m < 8 || m > 30) continue;
		for (let i = 0; i < 32 - m; i++) sz *= 2;
		let b = n - n % sz;
		// 不用 int()：30-plugin-switch.uc 里有个同名的 int（工具参数说明）；整数相除本来就是整数
		push(out, sprintf('%d.%d.%d.%d/%d', (b - b % 16777216) / 16777216, ((b - b % 65536) / 65536) % 256, ((b - b % 256) / 256) % 256, b % 256, m));
	}
	return out;
}
// 通道自己的网段：挑一个跟路由器现有地址不撞的
function wg_net() {
	let cur = uci_get('network.cmcp_wg.addresses');
	let m = match(cur ?? '', /([0-9]+\.[0-9]+\.[0-9]+)\.1\/24/);
	if (m) return m[1];
	for (let c in ['10.77.0', '10.78.0', '10.79.0', '172.31.77']) {
		let used = false;
		for (let a in xp_addrs()) if (a.ip != c + '.1' && index(a.ip, c + '.') == 0) used = true;
		for (let s in wg_lan()) if (index(s, c + '.') == 0) used = true;
		if (!used) return c;
	}
	die('找不到空着的网段');
}
function wg_on() { return uci_get('network.cmcp_wg.proto') == 'wireguard' && uci_get('network.cmcp_wg.disabled') != '1'; }
function wg_port() { return +(uci_get('network.cmcp_wg.listen_port') ?? 0) || 51820; }
function wg_peers() {
	let out = [], hs = {};
	if (wg_on()) for (let l in split(sh(shq(WG_BIN) + ' show cmcp_wg dump 2>/dev/null').out ?? '', '\n')) {
		let f = split(l, '\t');
		if (length(f) >= 8 && match(f[0], /^[A-Za-z0-9+\/]{43}=$/)) hs[f[0]] = { hs: +f[4], rx: +f[5], tx: +f[6] };
	}
	for (let s in (uci_load('network') ?? [])) {
		if (s['.type'] != 'wireguard_cmcp_wg' || !match(s['.name'] ?? '', /^cmcp_wgp_[0-9]+$/)) continue;
		let ip = match('' + (type(s.allowed_ips) == 'array' ? s.allowed_ips[0] : s.allowed_ips ?? ''), /^([0-9.]+)\/32$/), h = hs[s.public_key] ?? {};
		push(out, { id: substr(s['.name'], 9), name: s.description ?? '手机', ip: ip ? ip[1] : '', hs: h.hs ?? 0, rx: h.rx ?? 0, tx: h.tx ?? 0 });
	}
	return out;
}
function wg_allowed(net) { let l = [net + '.0/24']; for (let x in wg_lan()) push(l, x); return l; }
// 手机连过来时用的地址：自己填的域名 > 托管版的「子域名-w」 > IP
function wg_host(o, r) {
	if (o.host) return o.host;
	if (o.dns) return o.dns;
	if (r.v4) return r.v4;
	if (r.pub4) return r.pub4;
	if (r.v6) return '[' + r.v6 + ']';
	return '';
}
function wg_apply() { let c = getenv('CMCP_WG_APPLY'); return sh(c != null ? c : 'ifup cmcp_wg >/dev/null 2>&1; /etc/init.d/firewall reload >/dev/null 2>&1'); }
function wg_uci(cmds, cfgs) {
	let U = conf().uci, r = sh(join(' && ', cmds) + ' && ' + join(' && ', map(cfgs, (c) => U + ' commit ' + c)));
	if (r.code != 0) { for (let c in cfgs) sh(U + ' revert ' + c); die('写设置失败：' + trim(r.out ?? '')); }
}
// 只通指定设备：防火墙规则跟着设备现在的 IP 走
function wg_only_cmds(o) {
	let U = conf().uci, cmds = [], ip = sp_ipmap();
	for (let s in (uci_load('firewall') ?? [])) if (match(s['.name'] ?? '', /^cmcp_wg_d[0-9]+$/)) push(cmds, U + ' delete ' + shq('firewall.' + s['.name']));
	if (type(o.only) == 'array') {
		push(cmds, U + ' -q delete firewall.cmcp_wg_f || true');
		let n = 0;
		for (let d in o.only) {
			let a = (d.mac && ip[d.mac]) || d.ip;
			if (!a || xp_ipok(a)) continue;
			n++;
			let k = 'firewall.cmcp_wg_d' + n;
			push(cmds, U + ' set ' + shq(k + '=rule'), U + ' set ' + shq(k + '.name=cmcp-wg-' + (d.name ?? a)), U + ' set ' + shq(k + '.src=cmcp_wg'), U + ' set ' + shq(k + '.dest=lan'), U + ' set ' + shq(k + '.dest_ip=' + a), U + ' set ' + shq(k + '.proto=all'), U + ' set ' + shq(k + '.target=ACCEPT'));
		}
	} else push(cmds, U + " set firewall.cmcp_wg_f=forwarding", U + " set firewall.cmcp_wg_f.src=cmcp_wg", U + " set firewall.cmcp_wg_f.dest=lan");
	return cmds;
}
function wg_dns(o, r, off) {
	if (!is_hosted()) return;
	try {
		let d = hub_call('/api/dev/wgdns', off ? { off: true } : { ip4: r.v4 ?? r.pub4 ?? '', ip6: r.v6 ?? '' }, 20);
		if (off) delete o.dns; else if (d?.host) o.dns = d.host;
		o.dip = off ? null : (r.v4 ?? r.pub4 ?? '') + '|' + (r.v6 ?? '');
	} catch (e) { if (!off) o.dnserr = '' + e; }
}
P.wg_get = function(a) {
	if (ROLE != 'owner') die('只有主账号能用');
	let c = wg_caps(), o = wg_read(), out = { caps: c.proto && c.tool, pkg: WG_PKG, on: false };
	if (!out.caps) return out;
	let r = wg_reach();
	out.on = wg_on(); out.port = wg_port(); out.reach = { ok: r.ok, msg: r.msg ?? '', nat: r.why == 'nat' && r.ok, wan4: r.wan4 };
	out.host = wg_host(o, r); out.own = o.host ?? ''; out.peers = wg_peers();
	out.only = type(o.only) == 'array' ? o.only : null;
	if (a?.cands) out.cands = xp_cands();
	out.net = uci_get('network.cmcp_wg.addresses') ?? '';
	return out;
};
// a: { on } / { port } / { host } / { only: [{mac, ip, name}] | null } / { add: 名字, sudo } / { del: id }
P.wg_set = function(a) {
	if (ROLE != 'owner') die('只有主账号能用');
	let c = wg_caps();
	if (!c.proto || !c.tool) die('先装 WireGuard（' + WG_PKG + '）');
	let o = wg_read(), U = conf().uci, r = wg_reach(), res = {};
	if (a?.on === true) {
		if (!r.ok) die(r.msg);
		let port = wg_port(), net = wg_net(), cmds = [];
		if (!uci_get('network.cmcp_wg.private_key')) {
			push(cmds, U + ' set network.cmcp_wg=interface', U + ' set network.cmcp_wg.proto=wireguard', U + ' set ' + shq('network.cmcp_wg.private_key=' + wg_key('genkey')),
				U + ' set ' + shq('network.cmcp_wg.listen_port=' + port), U + ' add_list ' + shq('network.cmcp_wg.addresses=' + net + '.1/24'));
		}
		push(cmds, U + ' -q delete network.cmcp_wg.disabled || true',
			U + ' set firewall.cmcp_wg_z=zone', U + ' set firewall.cmcp_wg_z.name=cmcp_wg', U + ' set firewall.cmcp_wg_z.network=cmcp_wg',
			U + ' set firewall.cmcp_wg_z.input=ACCEPT', U + ' set firewall.cmcp_wg_z.output=ACCEPT', U + ' set firewall.cmcp_wg_z.forward=REJECT',
			U + ' set firewall.cmcp_wg_in=rule', U + ' set firewall.cmcp_wg_in.name=cmcp-wg', U + ' set firewall.cmcp_wg_in.src=wan', U + ' set firewall.cmcp_wg_in.proto=udp',
			U + ' set ' + shq('firewall.cmcp_wg_in.dest_port=' + port), U + ' set firewall.cmcp_wg_in.target=ACCEPT', U + ' -q delete firewall.cmcp_wg_in.enabled || true');
		for (let x in wg_only_cmds(o)) push(cmds, x);
		wg_uci(cmds, ['network', 'firewall']);
		wg_apply();
		wg_dns(o, r);
		res.msg = '已开启加密通道';
	} else if (a?.on === false) {
		wg_uci([U + ' set network.cmcp_wg.disabled=1', U + ' set firewall.cmcp_wg_in.enabled=0'], ['network', 'firewall']);
		sh(getenv('CMCP_WG_APPLY') ?? 'ifdown cmcp_wg >/dev/null 2>&1; /etc/init.d/firewall reload >/dev/null 2>&1');
		wg_dns(o, r, true);
		res.msg = '已关闭加密通道';
	} else if (a?.port != null) {
		let p = +a.port;
		if (!match('' + a.port, /^[0-9]+$/) || p < 1024 || p > 65535) die('端口要在 1024–65535 之间');
		if (index([18765, 51413], p) >= 0) die('这个端口路由器自己在用');
		wg_uci([U + ' set ' + shq('network.cmcp_wg.listen_port=' + p), U + ' set ' + shq('firewall.cmcp_wg_in.dest_port=' + p)], ['network', 'firewall']);
		if (wg_on()) wg_apply();
		res.msg = '端口改成 ' + p + '，手机要重新扫码';
	} else if (a?.host != null) {
		let h = lc(trim('' + a.host));
		if (length(h) && (length(h) > 100 || !match(h, /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/))) die('域名不对');
		if (length(h)) o.host = h; else delete o.host;
		res.msg = length(h) ? '地址改成 ' + h : '地址改回自动';
	} else if (type(a) == 'object' && 'only' in a) {
		if (a.only == null) delete o.only;
		else {
			if (type(a.only) != 'array' || length(a.only) > 50) die('设备列表不对');
			let l = [];
			for (let d in a.only) {
				let ip = trim('' + (d?.ip ?? '')), bad = xp_ipok(ip);
				if (bad) die(bad + '：' + ip);
				let mac = lc(trim('' + (d?.mac ?? '')));
				push(l, { mac: match(mac, /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/) ? mac : '', ip, name: substr(trim('' + (d?.name ?? ip)), 0, 40) });
			}
			o.only = l;
		}
		if (uci_get('network.cmcp_wg.proto') == 'wireguard') { wg_uci(wg_only_cmds(o), ['firewall']); if (wg_on()) wg_apply(); }
		res.msg = type(o.only) == 'array' ? '只通 ' + length(o.only) + ' 台设备' : '能连整个家里网络';
	} else if (a?.add != null) {
		need_sudo(a, true);
		if (!uci_get('network.cmcp_wg.private_key')) die('先开启加密通道');
		let name = trim('' + a.add);
		if (!length(name) || length(name) > 30 || match(name, /[<>"'\x01-\x1f]/)) die('名字不对');
		let ps = wg_peers();
		if (length(ps) >= 20) die('最多 20 台手机');
		let net = wg_net(), used = {}, n = 0, id = 1;
		for (let p in ps) { used[p.ip] = true; if (+p.id >= id) id = +p.id + 1; }
		for (let i = 2; i < 255 && !n; i++) if (!used[net + '.' + i]) n = i;
		let priv = wg_key('genkey'), pub = wg_key('pubkey', priv), psk = wg_key('genpsk'), spub = wg_key('pubkey', uci_get('network.cmcp_wg.private_key'));
		let k = 'network.cmcp_wgp_' + id;
		wg_uci([U + ' set ' + shq(k + '=wireguard_cmcp_wg'), U + ' set ' + shq(k + '.description=' + name), U + ' set ' + shq(k + '.public_key=' + pub),
			U + ' set ' + shq(k + '.preshared_key=' + psk), U + ' add_list ' + shq(k + '.allowed_ips=' + net + '.' + n + '/32'), U + ' set ' + shq(k + '.route_allowed_ips=0')], ['network']);
		if (wg_on()) wg_apply();
		let host = wg_host(o, r);
		res.conf = sprintf('[Interface]\nPrivateKey = %s\nAddress = %s.%d/32\n\n[Peer]\nPublicKey = %s\nPresharedKey = %s\nEndpoint = %s:%d\nAllowedIPs = %s\nPersistentKeepalive = 25\n',
			priv, net, n, spub, psk, host, wg_port(), join(', ', wg_allowed(net)));
		res.name = name; res.file = 'home-' + id + '.conf';
		res.msg = '已添加「' + name + '」';
	} else if (a?.del != null) {
		let id = '' + a.del;
		if (!match(id, /^[0-9]+$/) || uci_get('network.cmcp_wgp_' + id) == null) die('没有这台手机');
		let nm = uci_get('network.cmcp_wgp_' + id + '.description') ?? '手机';
		wg_uci([U + ' delete ' + shq('network.cmcp_wgp_' + id)], ['network']);
		if (wg_on()) wg_apply();
		res.msg = '已删除「' + nm + '」';
	} else die('不知道要改什么');
	cmcp_writej(WG_F, o);
	return { ...P.wg_get({ cands: true }), ...res };
};
// 看门狗每 5 分钟：家里 IP 变了更新官网的地址；只通指定设备的，设备 IP 变了更新防火墙
P.wg_check = function() {
	if (!wg_on()) return { ok: true };
	let o = wg_read(), r = wg_reach(), ch = false;
	if (is_hosted() && r.ok && (r.v4 ?? r.pub4 ?? '') + '|' + (r.v6 ?? '') != o.dip) { wg_dns(o, r); ch = true; }
	if (type(o.only) == 'array') {
		let ip = sp_ipmap(), cur = {}, stale = false;
		for (let s in (uci_load('firewall') ?? [])) if (match(s['.name'] ?? '', /^cmcp_wg_d[0-9]+$/)) cur[s.dest_ip] = true;
		for (let d in o.only) { let a = (d.mac && ip[d.mac]) || d.ip; if (a && !cur[a]) stale = true; }
		if (stale) { wg_uci(wg_only_cmds(o), ['firewall']); sh(getenv('CMCP_WG_APPLY') ?? '/etc/init.d/firewall reload >/dev/null 2>&1'); }
	}
	if (ch) cmcp_writej(WG_F, o);
	return { ok: true, dns: ch };
};

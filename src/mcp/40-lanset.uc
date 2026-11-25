/* ---------------- 6.0 第 25 项：局域网设置（路由器地址、子网掩码、DHCP 地址范围和租期） ----------------
 * 改路由器地址只有主账号能做（用户 11/26 定），走「90 秒确认」：在新地址上点「保留」，不点自动改回。
 * 网段变了：设备的固定地址（dhcp host）、端口转发的目标地址跟着搬到新网段（同一个主机号），面板局域网入口换到新地址；
 * 原版后台（uhttpd）如果绑在旧地址上也一起换。新网段不能跟外网、访客网络、代理网卡这些已经在用的网段重叠。
 * DHCP 的范围在 uci 里本来就是「从网段第几个开始、给几个」，网段变了范围自动跟着走。
 * 新地址上确认用 lan_keep（局域网入口，不用登录，凭改的时候发的 16 位编号；只认家里局域网来的请求）。 */
const LS_LEASE = { '1h': '1 小时', '12h': '12 小时', '1d': '1 天', '7d': '7 天' };
function ls_int2ip(n) { let o = []; for (let i = 3; i >= 0; i--) { let d = pow2(i * 8); push(o, '' + ((n - n % d) / d) % 256); } return join('.', o); }
function ls_private(ip) { return !!(match(ip, /^10\./) || match(ip, /^192\.168\./) || match(ip, /^172\.(1[6-9]|2[0-9]|3[01])\./)); }
function ls_dhcp() {
	for (let s in (uci_load('dhcp') ?? [])) if (s['.type'] == 'dhcp' && (s.interface ?? s['.name']) == 'lan') return s;
	return null;
}
function ls_lease_norm(v) {
	v = lc('' + (v ?? '12h'));
	let m = match(v, /^([0-9]+)([smhdw]?)$/);
	if (!m) return v;
	let n = +m[1], u = m[2] || 's', sec = n * ({ s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[u]);
	for (let k in keys(LS_LEASE)) if ({ '1h': 3600, '12h': 43200, '1d': 86400, '7d': 604800 }[k] == sec) return k;
	return v;
}
// 设备的固定地址（dhcp host）。名字先用面板里给设备起的，没有再用配置里的
function ls_hosts() {
	let al = {}, out = [];
	try { for (let m, x in CL.dev_aliases()) if (type(x) == 'object' && x.name) al[lc(m)] = x.name; } catch (e) {}
	for (let s in (uci_load('dhcp') ?? [])) {
		if (s['.type'] != 'host') continue;
		let macs = map(type(s.mac) == 'array' ? s.mac : as_list(s.mac), lc), mac = macs[0] ?? '';
		push(out, { id: s['.name'], mac, ip: s.ip ?? '', name: al[mac] ?? s.name ?? '', edit: length(macs) == 1 && v4int(s.ip ?? '') != null && !s.tag && !s.duid, black: s.cmcp_black == '1' });
	}
	return out;
}
P.lanset_get = function() {
	let lan = pf_lan();
	if (!lan) return { none: '没有家里网络（lan）的设置' };
	let d = ls_dhcp(), size = pow2(32 - lan.pl), base = v4int(lan.ip) - v4int(lan.ip) % size;
	let start = +(d?.start ?? 100), limit = +(d?.limit ?? 150);
	let from = base + start, to = base + start + limit - 1;
	if (to > base + size - 2) to = base + size - 2;
	return {
		ip: lan.ip, mask: v4mask(lan.pl), pl: lan.pl,
		dhcp: d ? { on: (d.ignore ?? '0') != '1', from: ls_int2ip(from), to: ls_int2ip(to), lease: ls_lease_norm(d.leasetime) } : null,
		port: +trim(readfile(ETC + '/lan_port') ?? '') || 906, owner: ROLE == 'owner', pending: ng_pending(), hosts: ls_hosts()
	};
};
// a: { ip, mask, dhcp_on, from, to, lease }
P.lanset_set = function(a) {
	let lan = pf_lan();
	if (!lan) die('没有家里网络（lan）的设置');
	ng_busy();
	let ip = trim('' + (a?.ip ?? lan.ip)), mask = trim('' + (a?.mask ?? v4mask(lan.pl)));
	wan_ip_check(ip, '路由器地址'); wan_ip_check(mask, '子网掩码');
	let pl = mask_len(mask);
	if (pl < 16 || pl > 30 || v4int(mask) != pow2(32) - pow2(32 - pl)) die('子网掩码不对，比如 255.255.255.0');
	if (!ls_private(ip)) die('路由器地址要用内网地址：192.168.x.x、10.x.x.x 或 172.16–31.x.x');
	let size = pow2(32 - pl), base = v4int(ip) - v4int(ip) % size, off = v4int(ip) - base;
	if (off == 0 || off == size - 1) die('路由器地址不能是网段的第一个或最后一个');
	let ipchg = ip != lan.ip || pl != lan.pl, netchg = ipchg && (pl != lan.pl || !cidr_has(lan.ip, lan.pl, ip));
	if (ipchg && ROLE != 'owner') die('只有主账号能改路由器地址');
	// 新网段不能跟别的网段重叠（外网、访客网络、代理网卡……；家里网络自己的不算）
	if (netchg) {
		let w = wan_iface(), ws = w ? wan_status(w['.name']) : null;
		if (ws?.ip && ws.pl && (cidr_has(ip, pl, ws.ip) || cidr_has(ws.ip, ws.pl, ip))) die('跟外网的网段重叠（光猫或上级路由器也是这个网段），换一个，比如 192.168.' + (match(ip, /^192\.168\.5\./) ? '6' : '5') + '.1');
		for (let u in used_nets()) {
			if (match(u[0], /^127\./) || u[0] == lan.ip) continue;
			if (cidr_has(ip, pl, u[0]) || cidr_has(u[0], u[1], ip)) die('跟正在用的网段 ' + ls_int2ip(v4int(u[0]) - v4int(u[0]) % pow2(32 - u[1])) + '/' + u[1] + ' 重叠，换一个');
		}
	}
	let U = conf().uci, cmds = [], files = { network: 1 }, reload = ['/etc/init.d/network reload'];
	let set = (k, v) => push(cmds, U + ' set ' + shq(k + '=' + v));
	if (ipchg) {
		// 原来是「地址/前缀」或列表的，也换成一个地址 + 掩码（18.06 起的 netifd 都认）
		push(cmds, U + ' -q delete network.lan.ipaddr');
		set('network.lan.ipaddr', ip); set('network.lan.netmask', mask);
	}
	// DHCP
	let d = ls_dhcp(), dchg = false;
	if (a?.dhcp_on != null || a?.from != null || a?.lease != null) {
		if (!d) die('没有家里网络的 DHCP 设置，在原版后台里加');
		let sid = d['.name'];
		let on = a?.dhcp_on == null ? (d.ignore ?? '0') != '1' : !!a.dhcp_on;
		if (on != ((d.ignore ?? '0') != '1')) { if (on) push(cmds, U + ' -q delete ' + shq('dhcp.' + sid + '.ignore')); else set('dhcp.' + sid + '.ignore', '1'); dchg = true; }
		if (on && a?.from != null) {
			let f = trim('' + a.from), t = trim('' + (a?.to ?? ''));
			wan_ip_check(f, '开始地址'); wan_ip_check(t, '结束地址');
			if (!cidr_has(ip, pl, f) || !cidr_has(ip, pl, t)) die('地址范围要在 ' + ls_int2ip(base) + '/' + pl + ' 里');
			let fo = v4int(f) - base, to = v4int(t) - base;
			if (fo < 1 || to > size - 2) die('地址范围不能包括网段的第一个和最后一个');
			if (fo > to) die('开始地址要比结束地址小');
			if (off >= fo && off <= to) die('地址范围里不能有路由器地址（' + ip + '）');
			if (fo != +(d.start ?? 100) || to - fo + 1 != +(d.limit ?? 150)) { set('dhcp.' + sid + '.start', '' + fo); set('dhcp.' + sid + '.limit', '' + (to - fo + 1)); dchg = true; }
		}
		if (a?.lease != null && ls_lease_norm(a.lease) != ls_lease_norm(d.leasetime)) {
			if (!LS_LEASE[a.lease]) die('租期只能选 1 小时、12 小时、1 天、7 天');
			set('dhcp.' + sid + '.leasetime', a.lease); dchg = true;
		}
	}
	// 网段变了：没跟着改的 DHCP 范围会跑出网段（比如 /24 → /25 后 start 100 + limit 150）
	if (netchg && d && (d.ignore ?? '0') != '1' && !(a?.from != null)) {
		let st = +(d.start ?? 100), li = +(d.limit ?? 150);
		if (st + li - 1 > size - 2 || (off >= st && off <= st + li - 1)) die('原来的地址范围放不进新网段，把地址范围也改一下');
	}
	// 网段变了：设备的固定地址、端口转发跟着搬
	let moved = { host: 0, pf: 0 };
	if (netchg) {
		let mv = (old) => {
			let n = v4int(old);
			if (n == null || !cidr_has(lan.ip, lan.pl, old)) return null;
			let o = n % pow2(32 - lan.pl);
			if (o < 1 || o > size - 2 || o == off) die('有设备的固定地址（' + old + '）放不进新网段，先在设备页改掉');
			return ls_int2ip(base + o);
		};
		for (let s in (uci_load('dhcp') ?? [])) if (s['.type'] == 'host' && length(s.ip ?? '')) {
			let n = mv(s.ip);
			if (n) { set('dhcp.' + s['.name'] + '.ip', n); moved.host++; }
		}
		for (let s in (uci_load('firewall') ?? [])) if ((s['.type'] == 'redirect' || s['.type'] == 'rule') && length(s.dest_ip ?? '') && v4int(s.dest_ip) != null) {
			let n = cidr_has(lan.ip, lan.pl, s.dest_ip) ? mv(s.dest_ip) : null;
			if (n) { set('firewall.' + s['.name'] + '.dest_ip', n); moved.pf++; }
		}
		// 原版后台绑在旧地址上的（少数固件）：一起换
		let uh = [];
		for (let k in ['listen_http', 'listen_https']) {
			let l = as_list(uci_get('uhttpd.main.' + k) ?? '');
			if (length(filter(l, (x) => index(x, lan.ip + ':') == 0))) {
				push(cmds, U + ' -q delete ' + shq('uhttpd.main.' + k));
				for (let x in l) push(cmds, U + ' add_list ' + shq('uhttpd.main.' + k + '=' + (index(x, lan.ip + ':') == 0 ? ip + substr(x, length(lan.ip)) : x)));
				push(uh, k);
			}
		}
		if (length(uh)) { files.uhttpd = 1; push(reload, '/etc/init.d/uhttpd reload'); }
	}
	if (dchg || moved.host) { files.dhcp = 1; push(reload, '/etc/init.d/dnsmasq reload'); }
	if (moved.pf) { files.firewall = 1; push(reload, '/etc/init.d/firewall reload'); }
	if (ipchg) push(reload, '/etc/init.d/claude-mcp reload'); // 面板的局域网入口（只绑在局域网地址上）换到新地址
	if (!length(cmds)) return { changed: false };
	let tok = rand_str(16);
	if (!tok) die('路由器生成不了随机数，稍后再试');
	sh('rm -rf ' + shq(NG) + ' && mkdir -p ' + shq(NG + '/files'));
	for (let f in keys(files)) {
		sh('cp -f ' + shq(ucdir() + '/' + f) + ' ' + shq(NG + '/files/' + f));
		if (!stat(NG + '/files/' + f)) { sh('rm -rf ' + shq(NG)); die('备份原来的设置失败，没有改'); }
	}
	writefile(NG + '/what', '局域网设置');
	writefile(NG + '/reload', join('\n', reload) + '\n');
	writefile(NG + '/until', '' + (time() + NG_WAIT + 15));
	writefile(NG + '/token', tok);
	let commit = join(' && ', map(keys(files), (f) => U + ' commit ' + f));
	let r = sh(join(' && ', cmds) + ' && ' + commit);
	if (r.code != 0) {
		for (let f in keys(files)) sh(U + ' revert ' + f + '; cp -f ' + shq(NG + '/files/' + f) + ' ' + shq(ucdir() + '/' + f));
		sh('rm -rf ' + shq(NG));
		die('保存失败，没有改：' + trim_nl(r.out));
	}
	try { sh(sprintf('%s/cmcp-notify info net %s %s net >/dev/null 2>&1', SBIN, shq(ipchg ? '路由器地址改成 ' + ip : '局域网设置改了'), shq('90 秒内没点「保留」会自动改回去。'))); } catch (e) {}
	bg(sprintf('CMCP_NG=%s CMCP_UCI_DIR=%s CMCP_SBIN=%s %s/cmcp-netguard run %s', shq(NG), shq(ucdir()), shq(SBIN), SBIN, tok));
	return { changed: true, token: tok, wait: NG_WAIT, ip: ipchg ? ip : null, port: +trim(readfile(ETC + '/lan_port') ?? '') || 906, moved };
};
// 新地址上点「保留」/「不保留」：局域网入口，不用登录；凭改的时候发的编号（16 位，3 分钟内有效），只认家里局域网来的请求
P.lan_keep = function(a) {
	if (!lan_client()) die('只能在家里局域网里用');
	let t = trim(readfile(NG + '/token') ?? ''), st = stat(NG + '/token');
	if (!length(t) || t != '' + (a?.token ?? '') || !st || time() - st.mtime > 300) return { gone: true };
	if (a?.peek) { let u = +trim(readfile(NG + '/until') ?? '0'); return { left: u > time() ? u - time() : 0, what: trim(readfile(NG + '/what') ?? '') }; }
	if (a?.revert) { bg(sprintf('sleep 1; CMCP_NG=%s CMCP_UCI_DIR=%s CMCP_SBIN=%s %s/cmcp-netguard revert %s', shq(NG), shq(ucdir()), shq(SBIN), SBIN, t)); return { ok: true }; }
	sh('rm -rf ' + shq(NG));
	return { ok: true };
};
// 固定地址：加、改、删（不会断网，直接生效，不走 90 秒确认）
// a: { op: add | edit | del, id, mac, ip, name }
P.lan_host_set = function(a) {
	let op = a?.op, lan = pf_lan();
	if (index(['add', 'edit', 'del'], op) < 0) die('不支持的操作');
	if (!lan) die('没有家里网络（lan）的设置');
	if (!stat(ucdir() + '/dhcp')) die('路由器没有 DHCP 设置');
	let L = ls_hosts(), cur = null;
	if (op != 'add') { for (let x in L) if (x.id == a?.id) cur = x; if (!cur) die('没有这个固定地址'); }
	let U = conf().uci, cmds = [], what = '';
	if (op == 'del') {
		if (cur.black) die('不能删：不走代理要用');
		push(cmds, U + ' delete ' + shq('dhcp.' + cur.id));
		what = '去掉了「' + (cur.name || cur.mac) + '」的固定地址';
	} else {
		if (op == 'edit' && !cur.edit) die('这个固定地址有面板不认识的设置，在原版后台里改');
		let mac = op == 'edit' ? cur.mac : lc(trim('' + (a?.mac ?? '')));
		if (!match(mac, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) die('MAC 地址不对，比如 aa:bb:cc:dd:ee:ff');
		let ip = trim('' + (a?.ip ?? ''));
		wan_ip_check(ip, 'IP 地址');
		if (!cidr_has(lan.ip, lan.pl, ip)) die('要在家里网段（' + lan.ip + '/' + lan.pl + '）里');
		if (ip == lan.ip) die('不能用路由器自己的地址');
		let size = pow2(32 - lan.pl), off = v4int(ip) % size;
		if (off == 0 || off == size - 1) die('不能用网段的第一个或最后一个地址');
		for (let x in L) {
			if (cur && x.id == cur.id) continue;
			if (x.ip == ip) die(ip + ' 已经固定给「' + (x.name || x.mac) + '」了');
			if (op == 'add' && x.mac == mac) die('这台设备已经有固定地址了（' + x.ip + '）');
		}
		let nm = trim('' + (a?.name ?? ''));
		if (op == 'add') {
			let sid = 'cmcp_h' + replace(mac, /:/g, '');
			push(cmds, U + ' set ' + shq('dhcp.' + sid + '=host'));
			push(cmds, U + ' set ' + shq('dhcp.' + sid + '.mac=' + mac));
			push(cmds, U + ' set ' + shq('dhcp.' + sid + '.ip=' + ip));
			// dnsmasq 的名字只能是英文字母、数字和横杠：中文名不写（面板里的名字另外存着）
			if (match(nm, /^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/)) push(cmds, U + ' set ' + shq('dhcp.' + sid + '.name=' + nm));
			what = '「' + (nm || mac) + '」固定用 ' + ip;
		} else {
			if (ip == cur.ip) return { changed: false };
			push(cmds, U + ' set ' + shq('dhcp.' + cur.id + '.ip=' + ip));
			what = '「' + (cur.name || cur.mac) + '」改成固定用 ' + ip;
		}
	}
	let r = sh(join(' && ', cmds) + ' && ' + U + ' commit dhcp');
	if (r.code != 0) { sh(U + ' revert dhcp'); die('保存失败，没有改：' + trim_nl(r.out)); }
	let f = getenv('CMCP_NG_RUN');
	bg(f ? 'echo /etc/init.d/dnsmasq reload >> ' + shq(f) : '/etc/init.d/dnsmasq reload');
	return { changed: true, what, hosts: ls_hosts() };
};

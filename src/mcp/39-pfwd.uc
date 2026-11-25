
/* ---------------- 6.0 第 18 项：端口转发 ----------------
 * 手机上增删改端口转发（防火墙的 redirect，fw3 / fw4 都是同一份 uci 配置）。
 * 安全：不让把路由器自己的管理端口（网页后台、SSH、面板局域网入口）转出去，也不让转到路由器自己；
 * 目标只能是家里局域网里的设备；改完走「90 秒确认」（cmcp-netguard），不点「保留」自动改回去，并推送。
 * 面板新建的规则名字叫 cmcp_pf_xxxxxx；原来就有的规则也列出来，能开关、删除，简单的也能改。 */
const PF_OPTS = { name: 1, src: 1, dest: 1, target: 1, proto: 1, src_dport: 1, dest_ip: 1, dest_port: 1, enabled: 1, family: 1, reflection: 1 };
function pf_lan() {
	let v = uci_get('network.lan.ipaddr') ?? '', ip = trim(split(split(v, ' ')[0], '/')[0]), m = match(v, /\/([0-9]+)/);
	let pl = m ? +m[1] : mask_len(uci_get('network.lan.netmask') ?? '255.255.255.0');
	return v4int(ip) == null ? null : { ip, pl };
}
// 路由器自己在用的端口：网页后台（uhttpd 的 http / https）、SSH（dropbear）、面板局域网入口
function pf_reserved() {
	let r = {};
	for (let k in ['listen_http', 'listen_https']) for (let a in as_list(uci_get('uhttpd.main.' + k))) { let m = match(a, /:([0-9]+)$/); if (m) r[+m[1]] = '路由器网页后台'; }
	if (!length(keys(r))) { r[80] = '路由器网页后台'; r[443] = '路由器网页后台'; }
	let ssh = false;
	for (let s in (uci_load('dropbear') ?? [])) if (s['.type'] == 'dropbear') { r[+(s.Port ?? s.port ?? 22) || 22] = 'SSH'; ssh = true; }
	if (!ssh) r[22] = 'SSH';
	r[+trim(readfile(ETC + '/lan_port') ?? '') || 906] = '面板';
	return r;
}
function pf_range(s) {
	let m = match(trim('' + (s ?? '')), /^([0-9]{1,5})(-([0-9]{1,5}))?$/);
	if (!m) return null;
	let a = +m[1], b = m[3] ? +m[3] : a;
	return a >= 1 && b <= 65535 && a <= b ? [a, b] : null;
}
function pf_protos(p) {
	let l = as_list(p ?? 'tcp udp');
	return length(l) && index(l, 'all') < 0 ? l : ['tcp', 'udp'];
}
function pf_rules() {
	let L = [];
	for (let s in (uci_load('firewall') ?? [])) {
		if (s['.type'] != 'redirect' || (s.target ?? 'DNAT') != 'DNAT' || (s.src ?? '') != 'wan') continue;
		let x = { id: s['.name'], name: s.name ?? '', proto: join(' ', pf_protos(s.proto)), ext: s.src_dport ?? '', ip: s.dest_ip ?? '', port: s.dest_port ?? '', on: (s.enabled ?? '1') != '0', mine: !!match(s['.name'], /^cmcp_pf_/) };
		x.edit = !!pf_range(x.ext) && v4int(x.ip) != null;
		for (let k in keys(s)) if (substr(k, 0, 1) != '.' && !PF_OPTS[k]) x.edit = false;
		push(L, x);
	}
	return L;
}
function pf_wan() {
	let w = null;
	try { w = json(sh('ubus call network.interface.wan status 2>/dev/null').out); } catch (e) {}
	let ip = w?.['ipv4-address']?.[0]?.address ?? null;
	// 运营商给的是内网地址（大内网 / 光猫拨号）：从外面连不进来
	let inner = ip ? !!(match(ip, /^10\./) || match(ip, /^192\.168\./) || match(ip, /^172\.(1[6-9]|2[0-9]|3[01])\./) || match(ip, /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./)) : false;
	return { ip, inner };
}
P.pf_list = function() {
	let res = pf_reserved(), lan = pf_lan();
	return { list: pf_rules(), wan: pf_wan(), lan: lan ? lan.ip + '/' + lan.pl : null, reserved: map(sort(keys(res), (a, b) => +a - +b), (k) => ({ port: +k, what: res[k] })), pending: ng_pending() };
};
// a: { op: add | edit | del | on | off, id, name, proto: tcp|udp|both, ext, ip, port }
P.pf_set = function(a) {
	let op = a?.op;
	if (index(['add', 'edit', 'del', 'on', 'off'], op) < 0) die('不支持的操作');
	ng_busy();
	let L = pf_rules(), cur = null;
	if (op != 'add') { for (let x in L) if (x.id == a?.id) cur = x; if (!cur) die('没有这条端口转发'); }
	let U = conf().uci, cmds = [], set = (sid, k, v) => push(cmds, U + ' set ' + shq('firewall.' + sid + (k ? '.' + k : '') + '=' + v)), sum = '';
	if (op == 'add' || op == 'edit') {
		if (op == 'edit' && !cur.edit) die('这条规则有面板不认识的设置，在原版后台里改');
		let ext = pf_range(a?.ext);
		if (!ext) die('外部端口填 1–65535 的数字，或者一段，比如 8000-8010');
		let port = length(trim('' + (a?.port ?? ''))) ? pf_range(a.port) : ext;
		if (!port) die('内部端口填 1–65535 的数字');
		if (port[1] - port[0] != ext[1] - ext[0]) die('外部和内部端口的个数要一样');
		let res = pf_reserved();
		for (let k in keys(res)) if (+k >= ext[0] && +k <= ext[1]) die('不能转发 ' + k + ' 端口：' + res[k] + (match(res[k], /[A-Za-z]$/) ? ' ' : '') + '要用');
		let ip = trim('' + (a?.ip ?? '')), lan = pf_lan();
		if (v4int(ip) == null) die('设备地址不对，比如 192.168.1.100');
		if (!lan || !cidr_has(lan.ip, lan.pl, ip)) die('只能转到家里局域网的设备' + (lan ? '（' + lan.ip + '/' + lan.pl + '）' : ''));
		if (ip == lan.ip) die('不能转到路由器自己');
		let size = pow2(32 - lan.pl), off = v4int(ip) % size;
		if (lan.pl <= 30 && (off == 0 || off == size - 1)) die('设备地址不对，比如 ' + replace(lan.ip, /[0-9]+$/, '100'));
		let pr = a?.proto == 'tcp' ? 'tcp' : a?.proto == 'udp' ? 'udp' : 'tcp udp';
		// 跟别的开着的规则撞端口（同一个协议）
		for (let x in L) {
			if (!x.on || (cur && x.id == cur.id)) continue;
			let r = pf_range(x.ext);
			if (!r || r[1] < ext[0] || r[0] > ext[1]) continue;
			for (let p in split(pr, ' ')) if (index(split(x.proto, ' '), p) >= 0) die('外部端口 ' + x.ext + ' 已经转给' + (length(x.name) ? '「' + x.name + '」' : ' ' + x.ip) + '了');
		}
		let nm = trim('' + (a?.name ?? ''));
		if (match(nm, /[[:cntrl:]]/) || length(nm) > 60) die('名字太长或有不能用的字符');
		if (!length(nm)) nm = ip + ' ' + (ext[0] == ext[1] ? ext[0] : ext[0] + '-' + ext[1]);
		let sid = cur ? cur.id : null;
		if (!sid) { let r = rand_str(6); if (!r) die('路由器生成不了随机数，稍后再试'); sid = 'cmcp_pf_' + r; set(sid, null, 'redirect'); }
		let es = ext[0] == ext[1] ? '' + ext[0] : ext[0] + '-' + ext[1], ps = port[0] == port[1] ? '' + port[0] : port[0] + '-' + port[1];
		set(sid, 'name', nm); set(sid, 'target', 'DNAT'); set(sid, 'src', 'wan'); set(sid, 'dest', 'lan'); set(sid, 'proto', pr);
		set(sid, 'src_dport', es); set(sid, 'dest_ip', ip); set(sid, 'dest_port', ps);
		if (op == 'add') set(sid, 'enabled', '1');
		sum = '外部端口 ' + es + ' → ' + ip + ':' + ps;
	} else if (op == 'del') {
		push(cmds, U + ' delete ' + shq('firewall.' + cur.id));
		sum = '删掉了「' + (cur.name || cur.ext) + '」';
	} else {
		if (op == 'on') { let r = pf_range(cur.ext); for (let x in L) { let q = pf_range(x.ext); if (x.on && x.id != cur.id && r && q && !(q[1] < r[0] || q[0] > r[1])) die('外部端口 ' + x.ext + ' 已经转给' + (length(x.name) ? '「' + x.name + '」' : ' ' + x.ip) + '了，先关掉它'); } }
		set(cur.id, 'enabled', op == 'on' ? '1' : '0');
		sum = (op == 'on' ? '打开了「' : '关掉了「') + (cur.name || cur.ext) + '」';
	}
	let tok = rand_str(16);
	if (!tok) die('路由器生成不了随机数，稍后再试');
	sh('rm -rf ' + shq(NG) + ' && mkdir -p ' + shq(NG + '/files') + ' && cp -f ' + shq(ucdir() + '/firewall') + ' ' + shq(NG + '/files/firewall'));
	if (!stat(NG + '/files/firewall')) die('备份原来的设置失败，没有改');
	writefile(NG + '/what', '端口转发');
	writefile(NG + '/reload', '/etc/init.d/firewall reload\n');
	writefile(NG + '/until', '' + (time() + NG_WAIT + 15));
	writefile(NG + '/token', tok);
	let r = sh(join(' && ', cmds) + ' && ' + U + ' commit firewall');
	if (r.code != 0) {
		sh(U + ' revert firewall; cp -f ' + shq(NG + '/files/firewall') + ' ' + shq(ucdir() + '/firewall') + '; rm -rf ' + shq(NG));
		die('保存失败，没有改：' + trim_nl(r.out));
	}
	bg(sprintf('CMCP_NG=%s CMCP_UCI_DIR=%s CMCP_SBIN=%s %s/cmcp-netguard run %s', shq(NG), shq(ucdir()), shq(SBIN), SBIN, tok));
	try { sh(sprintf('%s/cmcp-notify info net %s %s net >/dev/null 2>&1', SBIN, shq('端口转发改了：' + sum), shq('90 秒内没点「保留」会自动改回去。'))); } catch (e) {}
	return { changed: true, token: tok, wait: NG_WAIT };
};

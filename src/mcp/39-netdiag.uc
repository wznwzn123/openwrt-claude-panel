
/* ---------------- 6.0 第 21 项：网络诊断（Ping、路由追踪、域名查询） ----------------
 * 只收域名或 IP（字母、数字、点、冒号、横线，不能以横线开头），用 shq 包起来，不会被当成命令执行。
 * 固件没带 traceroute / nslookup 的，直接说原因。
 * 测试用环境变量：CMCP_ND_BIN（命令所在目录，放假的 ping / traceroute / nslookup） */
const ND_BIN = getenv('CMCP_ND_BIN') ? getenv('CMCP_ND_BIN') + '/' : '';
function nd_has(c) { return ND_BIN ? !!stat(ND_BIN + c) : length(trim(sh('command -v ' + c).out)) > 0; }
function nd_addr(a) {
	let s = trim('' + (a ?? ''));
	s = replace(s, /^[a-z]+:\/\//i, '');
	if (!match(s, /^\[?[0-9A-Fa-f:]+\]?$/)) s = replace(s, /[\/:].*$/, ''); // 网址：只留主机名；IPv6 原样
	s = replace(s, /^\[(.*)\]$/, '$1');
	if (!match(s, /^[A-Za-z0-9][A-Za-z0-9.:-]{0,252}$/)) die('请输入域名或 IP，例如 www.baidu.com');
	return s;
}
const ND_FAKE = /^198\.1[89]\./; // OpenClash Fake-IP 的虚拟地址
function nd_ping(addr) {
	let v6 = !!match(addr, /:/), cmd = 'ping';
	if (v6 && !ND_BIN && nd_has('ping6')) cmd = 'ping6';
	if (!nd_has(cmd)) die('不能 Ping：固件没带 ping');
	let o = sh('timeout 20 ' + ND_BIN + cmd + ' -c 4 -W 2 ' + shq(addr)), t = o.out ?? '';
	if (match(t, /bad address|unknown host|Name or service not known|Temporary failure in name resolution/i)) die('找不到「' + addr + '」：域名不对，或者路由器的 DNS 有问题');
	let r = { tool: 'ping', addr, ip: null, times: [], sent: 0, recv: 0, loss: null, min: null, avg: null, max: null };
	let m = match(t, /PING [^ ]+ \(([0-9A-Fa-f.:]+)\)/);
	if (m) r.ip = m[1];
	for (let l in split(t, '\n')) { let x = match(l, /time[=<]([0-9.]+) ?ms/); if (x) push(r.times, +x[1]); }
	m = match(t, /([0-9]+) packets transmitted, ([0-9]+) (packets )?received/);
	if (m) { r.sent = +m[1]; r.recv = +m[2]; r.loss = r.sent ? +sprintf("%.0f", (r.sent - r.recv) * 100 / r.sent) : null; }
	m = match(t, /min\/avg\/max[^=]*= *([0-9.]+)\/([0-9.]+)\/([0-9.]+)/);
	if (m) { r.min = +m[1]; r.avg = +m[2]; r.max = +m[3]; }
	if (!r.sent && !length(r.times)) die('Ping 没有结果：' + substr(trim(t), 0, 200));
	r.fake = !!(r.ip && match(r.ip, ND_FAKE));
	return r;
}
function nd_trace(addr) {
	let v6 = !!match(addr, /:/), cmd = 'traceroute';
	if (v6 && !ND_BIN && nd_has('traceroute6')) cmd = 'traceroute6';
	if (!nd_has(cmd)) die('不能追踪路由：固件没带 traceroute');
	let o = sh('timeout 50 ' + ND_BIN + cmd + ' -n -q 1 -w 2 -m 20 ' + shq(addr)), t = o.out ?? '';
	if (match(t, /bad address|unknown host|Name or service not known/i)) die('找不到「' + addr + '」：域名不对，或者路由器的 DNS 有问题');
	let r = { tool: 'trace', addr, ip: null, hops: [], done: false };
	let m = match(t, /traceroute to [^ ]+ \(([0-9A-Fa-f.:]+)\)/);
	if (m) r.ip = m[1];
	for (let l in split(t, '\n')) {
		let x = match(l, /^ *([0-9]+) +(.*)$/);
		if (!x) continue;
		let ip = match(x[2], /^([0-9A-Fa-f.:]+[0-9A-Fa-f])/), ms = match(x[2], /([0-9.]+) ms/);
		push(r.hops, { n: +x[1], ip: ip ? ip[1] : null, ms: ms ? +ms[1] : null });
	}
	if (!length(r.hops)) die('路由追踪没有结果：' + substr(trim(t), 0, 200));
	let last = r.hops[length(r.hops) - 1];
	r.done = !!(r.ip && last.ip == r.ip);
	r.fake = !!(r.ip && match(r.ip, ND_FAKE));
	return r;
}
function nd_dns(addr) {
	if (match(addr, /^[0-9.]+$/) || match(addr, /:/)) die('域名查询只能输入域名');
	if (!nd_has('nslookup')) die('不能查询域名：固件没带 nslookup');
	let o = sh('timeout 15 ' + ND_BIN + 'nslookup ' + shq(addr)), t = o.out ?? '';
	let r = { tool: 'dns', addr, server: null, ips: [], cname: [] };
	let m = match(t, /Server:[ \t]*([^ \t\n]+)/);
	if (m) r.server = m[1];
	let ans = false;
	for (let l in split(t, '\n')) {
		if (match(l, /^Name:/)) { ans = true; continue; }
		let c = match(l, /canonical name = ([^ \t]+)$/);
		if (c) { let cn = replace(c[1], /\.$/, ''); if (index(r.cname, cn) < 0) push(r.cname, cn); continue; }
		let a = match(l, /^Address( [0-9]+)?:[ \t]*([0-9A-Fa-f.:]+)/);
		if (a && ans) { let ip = replace(a[2], /#.*$/, ''); if (index(r.ips, ip) < 0) push(r.ips, ip); }
	}
	if (!length(r.ips)) {
		if (match(t, /NXDOMAIN|can't find|can't resolve|not found/i)) die('找不到「' + addr + '」：这个域名不存在');
		die('查不到「' + addr + '」：' + (length(trim(t)) ? substr(trim(t), -200) : '路由器的 DNS 没有回应'));
	}
	r.fake = length(filter(r.ips, (ip) => match(ip, ND_FAKE))) > 0;
	return r;
}
P.netdiag = function(a) {
	let addr = nd_addr(a?.addr), t = a?.tool;
	if (t == 'ping') return nd_ping(addr);
	if (t == 'trace') return nd_trace(addr);
	if (t == 'dns') return nd_dns(addr);
	die('不支持的诊断');
};
P.netdiag_caps = function() {
	return { ping: nd_has('ping'), trace: nd_has('traceroute'), dns: nd_has('nslookup') };
};


/* ---------------- 6.0 第 27 项：实时监控（网速、负载、连接数） ----------------
 * 面板每 2 秒要一次，曲线在面板里画（路由器不存历史，不写闪存）。
 * 连接数是系统的连接跟踪（conntrack），不只是代理的连接；满了新连接会被丢，所以把上限也给出去。
 * 测试用环境变量：CMCP_MON_ROOT（/proc 前面加的目录） */
const MON_R = getenv('CMCP_MON_ROOT') || '';
P.mon = function() {
	let o = { load: null, cpus: 1, cpu: null, conn: null, conn_max: null, rx: null, tx: null, mem: null };
	let la = split(trim(readfile(MON_R + '/proc/loadavg') ?? ''), ' ');
	if (length(la) >= 3) o.load = [+la[0], +la[1], +la[2]];
	o.cpus = length(filter(split(readfile(MON_R + '/proc/cpuinfo') ?? '', '\n'), (l) => match(l, /^processor[ \t]*:/))) || 1;
	let c = trim(readfile(MON_R + '/proc/sys/net/netfilter/nf_conntrack_count') ?? ''), cm = trim(readfile(MON_R + '/proc/sys/net/netfilter/nf_conntrack_max') ?? '');
	if (match(c, /^[0-9]+$/)) o.conn = +c;
	if (match(cm, /^[0-9]+$/)) o.conn_max = +cm;
	// CPU 使用率：跟上一次（2 秒前）比
	let m = match(readfile(MON_R + '/proc/stat') ?? '', /^cpu +([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ?([0-9]*)/);
	if (m) {
		let tot = 0; for (let i = 1; i <= 8; i++) tot += +(m[i] || 0);
		let idle = +m[4] + +m[5], CF = '/tmp/cmcp_moncpu.json', p = null;
		try { p = json(readfile(CF) ?? 'null'); } catch (e) {}
		if (p && tot > p.tot) o.cpu = +sprintf('%.0f', 100 - (idle - p.idle) * 100.0 / (tot - p.tot));
		writefile(CF, sprintf('%J', { tot, idle }));
	}
	let mi = readfile(MON_R + '/proc/meminfo') ?? '', mt = +(match(mi, /MemTotal:[ \t]+([0-9]+)/)?.[1] ?? 0), ma = +(match(mi, /MemAvailable:[ \t]+([0-9]+)/)?.[1] ?? 0);
	if (mt) o.mem = +sprintf('%.0f', (mt - ma) * 100.0 / mt);
	try { let l = P.live(); o.rx = l.rx; o.tx = l.tx; } catch (e) {}
	return o;
};

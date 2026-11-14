const P = {};

/* CPU 使用率：读 /proc/stat，两次之间的空闲比例 */
function cpu_stat() {
	let m = match(readfile('/proc/stat') ?? '', /^cpu\s+(\d+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) ?(\d*)/);
	if (!m) return null;
	let tot = 0;
	for (let i = 1; i <= 8; i++) tot += +(m[i] || 0);
	return { tot, idle: +m[4] + +m[5] };
}

/* OpenClash 正在做什么：启动日志最后一行（中文），日志没变就用缓存，不重复翻译 */
function oc_line() {
	// 启动/停止过程中看启动日志；平时（启动日志被 OpenClash 网页清空后）看插件日志最后一行
	let raw = trim(sh("{ grep . /tmp/openclash_start.log 2>/dev/null || tail -n 400 /tmp/openclash.log 2>/dev/null | grep -v '^time='; } | tail -n 1").out);
	if (!length(raw)) return null;
	let cf = '/tmp/cmcp_ocline.json', c = null;
	try { c = json(readfile(cf) ?? 'null'); } catch (e) {}
	if (c?.raw == raw) return c.line;
	let line = null;
	try { line = json(trim(sh('printf "%s\\n" ' + shq(raw) + ' | lua /etc/claude-mcp/oc_line.lua').out)); } catch (e) {}
	if (line) writefile(cf, sprintf('%J', { raw, line }));
	return line;
}

P.overview = function() {
	let o = { clash: { running: false }, system: {}, wan: null, speed: null };

	try {
		let v = api('GET', '/version', null, 4);
		o.clash.running = true;
		o.clash.version = v?.version;
		let c = api('GET', '/configs', null, 4);
		o.clash.mode = c?.mode;
		let cn = api('GET', '/connections', null, 4);
		o.clash.connections = length(cn?.connections ?? []);
		o.clash.download_total = cn?.downloadTotal ?? 0;
		o.clash.upload_total = cn?.uploadTotal ?? 0;
	} catch (e) {
		o.clash.error = '' + e;
	}
	// 装了哪些代理插件、正在用哪个（OpenClash 以外的插件也认）
	try { o.px = P.px(); } catch (e) {}
	o.clash.config = uci_get('openclash.config.config_path');
	o.clash.line = oc_line();
	// OpenClash 是否正在启动/停止（只查这一个进程，比查全部后台任务快）
	o.clash.busy = +trim(sh("ps w | grep '/etc/init.d/openclash' | grep -v grep | grep -c .").out) > 0;
	// 启动早就完成了：不再显示启动日志最后一句（「请等待服务器上线」之类），改成「运行正常 · 已运行多久」
	if (!o.clash.busy && o.clash.running) {
		let pid = trim(split(trim(sh('pidof clash').out), ' ')[0] ?? ''), st = length(pid) ? readfile('/proc/' + pid + '/stat') : null;
		let f = st ? split(trim(substr(st, index(st, ')') + 1)), ' ') : [];
		let age = length(f) > 19 ? +split(readfile('/proc/uptime') ?? '0', ' ')[0] - +f[19] / 100.0 : 0;
		if (age > 60) {
			let d = age / 86400 | 0, h = (age % 86400) / 3600 | 0, m = (age % 3600) / 60 | 0;
			o.clash.line = { t: null, lv: null, msg: '运行正常 · 内核已运行 ' + (d ? d + ' 天 ' + h + ' 小时' : h ? h + ' 小时 ' + m + ' 分' : m + ' 分钟') };
		}
	}
	o.clash.custom_rules = uci_get('openclash.config.enable_custom_clash_rules') == '1';

	let s = o.system;
	let cs0 = cpu_stat(), CF = '/tmp/cmcp_cpu.json', pc = null;
	try { pc = json(readfile(CF) ?? 'null'); } catch (e) {}
	s.model = trim(readfile('/tmp/sysinfo/model') ?? readfile('/proc/device-tree/model') ?? '');
	s.firmware = match(readfile('/etc/openwrt_release') ?? '', /DISTRIB_DESCRIPTION='([^']*)'/)?.[1];
	s.uptime = +split(readfile('/proc/uptime') ?? '0', ' ')[0];
	s.load = split(trim(readfile('/proc/loadavg') ?? ''), ' ')[0];
	let cpus = length(filter(split(readfile('/proc/cpuinfo') ?? '', '\n'), (l) => match(l, /^processor\s*:/)));
	s.cpus = cpus || 1;
	let mem = readfile('/proc/meminfo') ?? '';
	s.mem_total = +(match(mem, /MemTotal:\s+(\d+)/)?.[1] ?? 0) * 1024;
	s.mem_avail = +(match(mem, /MemAvailable:\s+(\d+)/)?.[1] ?? 0) * 1024;
	let t = trim(sh("cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null").out);
	if (match(t, /^[0-9]+$/)) s.temp = +t > 1000 ? +t / 1000 : +t;

	let w = null;
	try { w = json(sh('ubus call network.interface.wan status').out); } catch (e) {}
	let dev = null;
	if (type(w) == 'object') {
		o.wan = { up: !!w.up, proto: w.proto, ip: w['ipv4-address']?.[0]?.address, uptime: w.uptime ?? 0 };
		dev = w.l3_device ?? w.device;
	}
	if (!dev) dev = trim(sh("ip route show default | awk '{for(i=1;i<=NF;i++) if($i==\"dev\"){print $(i+1); exit}}'").out);
	if (length(dev ?? '')) {
		/* 用上一次的采样算网速，不用每次都等 1 秒；没有近期采样时只等 0.4 秒 */
		let up = () => +split(readfile('/proc/uptime') ?? '0', ' ')[0];
		let SF = '/tmp/cmcp_speed.json', prev = null;
		try { prev = json(readfile(SF) ?? 'null'); } catch (e) {}
		let b = read_ifbytes(dev), tb = up(), a = null, dt = 0;
		if (b && prev?.dev == dev && tb - prev.t >= 0.8 && tb - prev.t <= 20 && b.rx >= prev.rx && b.tx >= prev.tx) { a = prev; dt = tb - prev.t; }
		else if (b) {
			a = b; let ta = tb;
			sh('F=/tmp/cmcp_sp.$$; mkfifo $F && { read -t 0.4 x <> $F; rm -f $F; }');
			b = read_ifbytes(dev); tb = up(); dt = tb - ta;
		}
		if (a && b) {
			if (dt < 0.1) dt = 0.1;
			o.speed = { dev, rx: int((b.rx - a.rx) / dt + 0.5), tx: int((b.tx - a.tx) / dt + 0.5), rx_total: b.rx, tx_total: b.tx };
			writefile(SF, sprintf('%J', { dev, t: tb, rx: b.rx, tx: b.tx }));
		}
	}
	/* 有近期采样就跟它比（准），没有就跟这次请求开头比（中间等过 0.4 秒） */
	let cs1 = cpu_stat(), ut = +split(readfile('/proc/uptime') ?? '0', ' ')[0];
	if (cs1) {
		let a = (pc && ut - pc.t >= 0.5 && ut - pc.t <= 20 && cs1.tot > pc.tot) ? pc : cs0;
		if (a && cs1.tot - a.tot >= 10) s.cpu = int(1000 * (1 - (cs1.idle - a.idle) * 1.0 / (cs1.tot - a.tot)) + 0.5) / 10;
		writefile(CF, sprintf('%J', { t: ut, tot: cs1.tot, idle: cs1.idle }));
	}
	return o;
};

P.groups = function() {
	let px = api('GET', '/proxies')?.proxies ?? {};
	let names = px.GLOBAL?.all ?? keys(px);
	let out = [];
	for (let n in names) {
		let g = px[n];
		if (!g || !GROUP_TYPES[g.type] || n == 'GLOBAL') continue;
		let nodes = [];
		for (let m in (g.all ?? [])) {
			let p = px[m] ?? {};
			push(nodes, { name: m, type: p.type ?? '', delay: last_delay(p), group: !!GROUP_TYPES[p.type] });
		}
		push(out, { name: n, type: g.type, now: g.now, nodes });
	}
	return { groups: out };
};

function lease_map() {
	let names = {};
	for (let l in split(trim(readfile('/tmp/dhcp.leases') ?? ''), '\n')) {
		let p = split(l, ' ');
		if (length(p) >= 4) names[p[2]] = { mac: lc(p[1]), name: p[3] != '*' ? p[3] : null };
	}
	return names;
}

/* ---------- 首页：实时网速（每 2 秒一次，只读 /proc/net/dev，很轻）、今日流量、在线设备 ---------- */
P.live = function() {
	let SF = '/tmp/cmcp_speed.json', prev = null;
	try { prev = json(readfile(SF) ?? 'null'); } catch (e) {}
	let dev = prev?.dev;
	if (!dev) {
		let w = null;
		try { w = json(sh('ubus call network.interface.wan status').out); } catch (e) {}
		dev = w?.l3_device ?? w?.device ?? trim(sh("ip route show default | awk '{for(i=1;i<=NF;i++) if($i==\"dev\"){print $(i+1); exit}}'").out);
	}
	if (!length(dev ?? '')) return { dev: null, rx: null, tx: null };
	let b = read_ifbytes(dev), t = +split(readfile('/proc/uptime') ?? '0', ' ')[0];
	if (!b) { sh('rm -f ' + SF); return { dev, rx: null, tx: null }; }
	let dt = prev?.dev == dev ? t - prev.t : -1;
	// 两次请求挨得太近：直接给上一次算好的，不重新算（不准）
	if (dt >= 0 && dt < 0.5 && prev.rr != null) return { dev, rx: prev.rr, tx: prev.tr };
	let o = { dev, rx: null, tx: null };
	if (dt >= 0.5 && dt <= 20 && b.rx >= prev.rx && b.tx >= prev.tx) { o.rx = int((b.rx - prev.rx) / dt + 0.5); o.tx = int((b.tx - prev.tx) / dt + 0.5); }
	writefile(SF, sprintf('%J', { dev, t, rx: b.rx, tx: b.tx, rr: o.rx, tr: o.tx }));
	return o;
};
// 连在 Wi-Fi 上的设备（MAC 地址）
function wifi_macs() {
	let out = sh("for i in $(iw dev 2>/dev/null | awk '/Interface/{print $2}'); do iw dev $i station dump 2>/dev/null | awk '/^Station/{print $2}'; done").out;
	if (!length(trim(out)))
		out = sh("for i in $(iwinfo 2>/dev/null | awk '/ESSID/{print $1}'); do iwinfo $i assoclist 2>/dev/null | awk '/^[0-9A-Fa-f][0-9A-Fa-f]:/{print $1}'; done").out;
	let m = {};
	for (let l in split(out, '\n')) { l = lc(trim(l)); if (match(l, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) m[l] = 1; }
	return m;
}
P.home_stats = function() {
	// 今日流量（cmcp-traffic 每分钟统计一次，按设备分开；要 OpenClash 在运行才统计得到）
	let tr = null;
	try { tr = P.traffic(); } catch (e) {}
	let day = tr?.today, td = (day && tr.days?.[day]) ?? {}, dl = 0, ul = 0, list = [];
	for (let k in td) {
		let a = td[k];
		if (type(a) != 'array') continue;
		let u = (+a[0] || 0) + (+a[2] || 0), d = (+a[1] || 0) + (+a[3] || 0);
		ul += u; dl += d;
		push(list, { id: k, name: k == 'other' ? '其他' : k == 'router' ? '路由器自己' : (tr.names?.[k] ?? null), dl: d, ul: u });
	}
	list = sort(list, (x, y) => (y.dl + y.ul) - (x.dl + x.ul));
	let top = slice(filter(list, (x) => x.id != 'other' && x.dl + x.ul > 0), 0, 3);
	// 在线设备：局域网里有 ARP 记录的（去掉外网口），按 Wi-Fi 连接列表分出无线、有线
	let wdev = {};
	for (let w in ['wan', 'wan6']) try { let st = json(sh('ifstatus ' + w).out); if (st?.l3_device) wdev[st.l3_device] = 1; if (st?.device) wdev[st.device] = 1; } catch (e) {}
	let on = {};
	for (let l in split(readfile('/proc/net/arp') ?? '', '\n')) {
		let m = match(l, /^(\d+\.\d+\.\d+\.\d+)\s+\S+\s+(0x\S+)\s+([0-9a-fA-F:]{17})\s+\S+\s+(\S+)/);
		if (m && m[2] != '0x0' && m[3] != '00:00:00:00:00:00' && !wdev[m[4]]) on[lc(m[3])] = 1;
	}
	let wm = wifi_macs(), wifi = 0, all = {};
	for (let mac in on) if (wm[mac]) wifi++;
	// Wi-Fi 上连着但还没有 ARP 记录的（刚连上、或者没要 IP），也算在线
	for (let mac in wm) if (!on[mac]) { on[mac] = 1; wifi++; }
	for (let mac in on) all[mac] = 1;
	let lm = lease_map();
	for (let ip in lm) if (lm[ip]?.mac) all[lm[ip].mac] = 1;
	let n = length(keys(on));
	return { today: { day, dl, ul, top, counting: !!tr?.at && time() - tr.at < 600 }, devices: { online: n, wifi, wired: n - wifi, total: length(keys(all)) } };
};


P.wd = function(a) {
	let lines = split(trim(readfile(WD_EV) ?? ''), '\n'), ev = [], lim = +(a?.limit ?? 300);
	for (let i = length(lines) - 1; i >= 0 && length(ev) < lim; i--) {
		if (!length(lines[i])) continue;
		try { push(ev, json(lines[i])); } catch (e) {}
	}
	let st = {};
	for (let l in split(readfile('/tmp/cmcp_wd.state') ?? '', '\n'))
		for (let kv in split(l, ';')) {
			let m = match(trim(kv), /^([A-Z_]+)="?([^"]*)"?$/);
			if (m) st[m[1]] = m[2];
		}
	let run = false;
	try { run = !!json(sh("ubus call service list '{\"name\":\"cmcp-watchdog\"}'").out)?.['cmcp-watchdog']?.instances?.watchdog?.running; } catch (e) {}
	return {
		events: ev, state: st, running: run, now: time(),
		uptime: +split(readfile('/proc/uptime') ?? '0', ' ')[0],
		heartbeat: +(trim(readfile('/etc/claude-mcp/heartbeat') ?? '0') || 0),
	};
};
/* 云端监测：给面板平板（证人）的报告网址 */
/* 切节点前先测一下这个节点通不通（测不通就提醒，免得切过去连面板都打不开） */
P.node_check = function(a) {
	if (!a?.node) die('需要 node');
	try {
		let r = api('GET', '/proxies/' + urlenc(a.node) + '/delay?timeout=3000&url=' + urlenc('https://www.gstatic.com/generate_204'), null, 8);
		return { ok: (+r?.delay || 0) > 0, delay: +r?.delay || 0 };
	} catch (e) { return { ok: false, delay: 0 }; }
};

/* ---------- 节点自动切换 ---------- */
function cmcp_readj(f, def) { try { let s = readfile(f); return s ? json(s) : def; } catch (e) { return def; } }
function cmcp_writej(f, o) { writefile(f + '.tmp', sprintf('%J', o)); sh('mv ' + shq(f + '.tmp') + ' ' + shq(f)); }

P.autosw = function(a) {
	let f = '/etc/claude-mcp/autosw.json', c = cmcp_readj(f, { enabled: true, group: 'Zou' });
	if (a?.set) {
		if (a.enabled != null) c.enabled = !!a.enabled;
		if (a.group) c.group = '' + a.group;
		cmcp_writej(f, c);
	}
	let groups = [], now = null;
	try {
		for (let n, p in api('GET', '/proxies', null, 6)?.proxies ?? {})
			if (p.type == 'Selector' && n != 'GLOBAL') { push(groups, n); if (n == c.group) now = p.now; }
	} catch (e) {}
	let r = { enabled: !!c.enabled, group: c.group, now, groups, hist: cmcp_readj('/etc/claude-mcp/autosw_hist.json', []), sub: cmcp_readj('/tmp/cmcp_subinfo.json', null) };
	// 模拟一次：当前节点要是挂了，会换到哪个
	if (a?.dry) {
		let o = trim(sh('/usr/sbin/cmcp-autosw test').out), j = null;
		try { j = json(o); } catch (e) {}
		if (!j) die('模拟失败：' + (o || '没有输出'));
		r.dry = j;
	}
	return r;
};

/* ---------- 设备暂停上网 ---------- */
function pause_out() {
	let p = cmcp_readj('/etc/claude-mcp/pause.json', {}), st = {}, ps = {}, any = false;
	for (let m in p) if (length(p[m]?.plan?.slots ?? [])) any = true;
	try { st = json(trim(sh(SBIN + '/cmcp-pause status').out)) ?? {}; } catch (e) {}
	// 6.0 第 16 项：上网计划现在怎样（能不能上、几点停 / 几点能上、延长到几点）
	if (any) try { ps = json(trim(sh(SBIN + '/cmcp-pause state').out)) ?? {}; } catch (e) {}
	for (let m in p) { p[m].on = !!st[m]; if (ps[m]) p[m].pn = ps[m]; if (p[m].plan) delete p[m].plan.host; }
	return { devs: p, now: time() };
}
// 本地时间比 UTC 快多少分钟
function tz_off() { let m = match(trim(sh('date +%z').out), /^([+-])(\d\d)(\d\d)$/); return m ? (m[1] == '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : 480; }
P.pause_list = function() { return pause_out(); };
// 6.0 第 16 项：这台手机开通知时告诉官网「这是哪个账号的手机」，这样计划提醒只推给设计划的家长。
// sig = sha256(路由器推送密钥 + ':push:' + 账号)：官网核对得上才记，别人冒充不了
P.push_id = function() {
	let uid = DEV?.uid ?? null;
	if (!uid || !match(uid, /^[a-z2-9]{12}$/)) return { uid: null };
	let k = match(readfile(ETC + '/cloud.conf') ?? '', /RKEY=([A-Za-z0-9_-]+)/);
	if (!k) return { uid: null };
	let h = match(sh('printf %s ' + shq(k[1] + ':push:' + uid) + ' | sha256sum').out, /^([0-9a-f]{64})/);
	return h ? { uid, sig: h[1] } : { uid: null };
};
P.pause_set = function(a) {
	let mac = lc(a?.mac ?? '');
	if (!match(mac, /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/)) die('这台设备读不到 MAC 地址，没法暂停');
	let f = '/etc/claude-mcp/pause.json', p = cmcp_readj(f, {}), e = p[mac] ?? {};
	if (a.name) e.name = substr('' + a.name, 0, 40);
	if (a.resume) delete e.until;
	if (+a.minutes > 0) e.until = time() + int(+a.minutes * 60);
	if (+a.until > time()) e.until = int(+a.until);
	if (type(a.sched) == 'array') {
		e.sched = [];
		for (let s in a.sched)
			if (match(s?.from ?? '', /^([01]?\d|2[0-3]):[0-5]\d$/) && match(s?.to ?? '', /^([01]?\d|2[0-3]):[0-5]\d$/) && s.from != s.to)
				push(e.sched, { from: s.from, to: s.to });
		e.sched = slice(e.sched, 0, 6);
	}
	// 6.0 第 16 项：上网计划（能上网的时段，按星期）；null = 删掉计划
	if (exists(a, 'plan')) {
		if (a.plan == null) { delete e.plan; delete e.ext; }
		else {
			let sl = CL.plan_norm(a.plan), host = null;
			if (!length(sl)) die('至少要有一个能上网的时段');
			// 记下它现在的设备名：以后有新 MAC 用同一个名字（换地址绕过计划）能认出来
			for (let l in split(readfile('/tmp/dhcp.leases') ?? '', '\n')) { let x = split(l, ' '); if (length(x) >= 4 && lc(x[1]) == mac && x[3] != '*') host = x[3]; }
			e.plan = { slots: sl, by: DEV?.uid ?? null, host: host ?? e.plan?.host ?? null, at: time() };
		}
	}
	// 临时延长：在本来停网的时间（或上次延长到的时间）上加 30 分钟 / 1 小时；已经停网了就从现在算
	if (exists(a, 'ext')) {
		if (!length(e.plan?.slots ?? [])) die('这台设备没有上网计划');
		let m = +a.ext, t = time();
		if (m != 30 && m != 60) die('只能延长 30 分钟或 1 小时');
		let n = CL.plan_now(e.plan.slots, t, tz_off()), base = t;
		if (e.ext > t) base = e.ext; else if (n.ok && n.at) base = n.at;
		if (base + m * 60 > t + 12 * 3600) die('最多延长到 12 小时以后');
		e.ext = base + m * 60;
	}
	if (a.ext_off) delete e.ext;
	if (!e.until && !length(e.sched ?? []) && !length(e.plan?.slots ?? [])) delete p[mac]; else p[mac] = e;
	cmcp_writej(f, p);
	// 生成规则；刚开始暂停的设备，现有连接会被马上断开
	sh(SBIN + '/cmcp-pause apply');
	return pause_out();
};


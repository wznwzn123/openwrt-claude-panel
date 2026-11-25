/* ---------- 流量统计 ---------- */
P.traffic = function() {
	let days = {}, names = {};
	for (let f in split(trim(sh('ls /etc/claude-mcp/traffic/*.json 2>/dev/null').out), '\n')) {
		if (!length(f)) continue;
		let m = cmcp_readj(f, null);
		if (!m) continue;
		for (let d in m.days ?? {}) days[d] = m.days[d];
		for (let k in m.names ?? {}) names[k] = m.names[k];
	}
	let st = cmcp_readj('/tmp/cmcp_traf.json', null);
	if (st?.day) { days[st.day] = st.today; for (let k in st.names ?? {}) names[k] = st.names[k]; }
	// 名字：认识的设备 → 现在的 DHCP 名字 → 静态分配起的名字（后面的优先）
	let kn = cmcp_readj('/etc/claude-mcp/known_devices.json', {});
	for (let m in kn) if (kn[m].name && !names[m]) names[m] = kn[m].name;
	for (let l in split(readfile('/tmp/dhcp.leases') ?? '', '\n')) { let f = split(l, ' '); if (length(f) >= 4 && f[3] != '*') names[lc(f[1])] = f[3]; }
	let cur = null;
	for (let l in split(sh("uci -q show dhcp | grep -E '\\.(mac|name)='").out, '\n')) {
		let m = match(l, /^dhcp\.([^.]+)\.(mac|name)='?([^']*)'?$/);
		if (!m) continue;
		cur ??= {}; cur[m[1]] ??= {}; cur[m[1]][m[2]] = m[3];
	}
	for (let s in cur ?? {}) if (cur[s].mac && cur[s].name) for (let mm in split(lc(cur[s].mac), ' ')) names[mm] = cur[s].name;
	// 解开被转码的名字；面板里改过名字的优先
	for (let k in names) names[k] = CL.name_clean(names[k]) ?? names[k];
	for (let m, x in CL.dev_aliases()) if (type(x) == 'object' && x.name) names[m] = x.name;
	return { days, names, today: st?.day ?? null, at: st?.at ?? null };
};

/* ---------- Kwrt 后台菜单（侧边栏自动加入新装的插件） ---------- */
const LUCI_CGI = getenv('CMCP_LUCI_CGI') || '/www/cgi-bin/luci';
// 用面板的自动登录账号读一次 LuCI 菜单，翻译成中文；只有装 / 卸软件包以后才重新读
P.luci_menu = function(a) {
	let key = trim(sh('date -r /usr/lib/opkg/status +%s 2>/dev/null; ls /usr/share/luci/menu.d /usr/lib/lua/luci/controller 2>/dev/null | md5sum').out);
	let cf = '/tmp/cmcp_menu_list.json', c = cmcp_readj(cf, null);
	if (c && c.key == key && !a?.force) return { items: c.items };
	let pass = trim(readfile(ETC + '/luci_pass') ?? '');
	if (!length(pass)) die('还没启用 LuCI 页面的自动登录');
	// 直接运行 LuCI 的 CGI 读菜单（不走 HTTP）：不依赖 curl、不管后台开在哪个端口、是不是只开了 HTTPS。
	// 会话用面板专用账号临时登录一个，读完就退出；两个 Cookie 名都给（21.02 及更早只认 sysauth）
	let L = null;
	try { L = json(sh(sprintf('ubus call session login %s', shq(sprintf('%J', { username: 'cmcp', password: pass, timeout: 60 })))).out); } catch (e) {}
	let sid = L?.ubus_rpc_session;
	if (!match(sid ?? '', /^[0-9a-f]{32}$/)) die('读不到 LuCI 的菜单');
	sh(sprintf('ubus call session set %s', shq(sprintf('%J', { ubus_rpc_session: sid, values: { token: sid, username: 'root' } }))));
	let r = sh(sprintf("HTTP_COOKIE=%s HTTPS=on REQUEST_METHOD=GET SCRIPT_NAME=/cgi-bin/luci PATH_INFO=/admin/menu REQUEST_URI=/cgi-bin/luci/admin/menu SERVER_PORT=443 REMOTE_ADDR=127.0.0.1 timeout 20 %s", shq('sysauth_https=' + sid + '; sysauth=' + sid), shq(LUCI_CGI)));
	sh(sprintf('ubus call session destroy %s', shq(sprintf('%J', { ubus_rpc_session: sid }))));
	// 去掉 CGI 的响应头（到第一个空行为止）
	let out = r.out ?? '', hb = index(out, '\r\n\r\n'), hn = index(out, '\n\n');
	if (hb >= 0 && (hn < 0 || hb < hn)) out = substr(out, hb + 4); else if (hn >= 0) out = substr(out, hn + 2);
	let m = null;
	try { m = json(out); } catch (e) {}
	let adm = m?.children?.admin?.children;
	if (!adm) die('读不到 LuCI 的菜单');
	let C = null;
	try { C = require('luci.core'); C.load_catalog('zh-cn', '/usr/lib/lua/luci/i18n'); C.change_catalog('zh-cn'); } catch (e) { C = null; }
	const tr = (s) => (C ? C.translate(s) : null) ?? s;
	const ok = (n) => n && n.title && n.satisfied !== false;
	const kids = (base, n) => {
		let o = [];
		for (let k in n.children ?? {}) if (ok(n.children[k])) push(o, [base + '/' + k, tr(n.children[k].title), +n.children[k].order || 0]);
		return map(sort(o, (x, y) => x[2] - y[2]), (x) => [x[0], x[1]]);
	};
	let items = [];
	for (let cat in adm) {
		let c = adm[cat];
		if (!ok(c) || cat in ['logout', 'menu', 'translations', 'ubus', 'uci']) continue;
		let ch = filter(keys(c.children ?? {}), (k) => ok(c.children[k]));
		// 没有下一级的一级菜单本身就是一个页面
		if (!length(ch)) { push(items, { p: 'admin/' + cat, t: tr(c.title), g: tr(c.title), o: +c.order || 0, kids: [] }); continue; }
		for (let it in ch) {
			let n = c.children[it], p = 'admin/' + cat + '/' + it;
			if (p == 'admin/services/cmcp') continue; // 6.0 第 82 项：原版后台里的「路由器面板」入口，面板里不显示（免得面板里套面板）
			push(items, { p, t: tr(n.title), g: tr(c.title), o: +n.order || 0, kids: kids(p, n) });
		}
	}
	cmcp_writej(cf, { key, items });
	return { items };
};

// 延迟：同一连接连发 3 次请求，取「发出请求 → 收到第一个字节」最短的一次（不受 fake-ip 本地握手影响）
function cmcp_rtt(px, url) {
	let o = sh('curl -s -m 6 ' + px + ' -o /dev/null -o /dev/null -o /dev/null -w ' + shq('%{time_starttransfer} %{time_pretransfer}\n') + ' ' + shq(url) + ' ' + shq(url) + ' ' + shq(url)).out, best = null;
	for (let l in split(trim(o), '\n')) { let x = split(l, ' '), v = (+x[0] - +x[1]) * 1000; if (+x[0] > 0 && (best == null || v < best)) best = v; }
	return best == null ? null : int(best + 0.5);
}
P.speedtest = function(a) {
	let d = '/tmp/cmcp_st', r = { kind: a.kind == 'direct' ? 'direct' : 'proxy' };
	// 同一时间只测一个，避免互相抢带宽（超过 2 分钟的旧锁当作残留）
	if (sh('[ -d ' + d + ' ] && [ $(( $(date +%s) - $(date -r ' + d + ' +%s) )) -lt 120 ]').code == 0) die('正在测速，请稍等');
	sh('rm -rf ' + d + '; mkdir -p ' + d);
	let f = (n) => split(trim(readfile(d + '/' + n) ?? ''), ' ');
	if (r.kind == 'direct') {
		r.ping = cmcp_rtt('', 'https://www.baidu.com/favicon.ico');
		sh(sprintf("curl -sL -o /dev/null -m 8 -w '%%{size_download} %%{time_total}' %s > %s/a & curl -sL -o /dev/null -m 8 -w '%%{size_download} %%{time_total}' %s > %s/b & wait",
			shq('https://mirrors.aliyun.com/ubuntu/ls-lR.gz'), d, shq('https://mirrors.cloud.tencent.com/ubuntu/ls-lR.gz'), d));
		let x = f('a'), y = f('b'), bytes = (+x[0] || 0) + (+y[0] || 0), tt = max(+x[1] || 0, +y[1] || 0);
		r.down = tt > 0 ? (bytes * 8 / tt / 1e6) : 0;
		r.bytes = bytes;
		r.via = '宽带直连（阿里云、腾讯云镜像）';
	} else {
		let user = uci_get('openclash.@authentication[0].username'), pass = uci_get('openclash.@authentication[0].password'), port = uci_get('openclash.config.mixed_port') || '7893';
		let px = '-x ' + shq('http://' + (user && uci_get('openclash.@authentication[0].enabled') == '1' ? user + ':' + pass + '@' : '') + '127.0.0.1:' + port);
		r.ping = cmcp_rtt(px, 'https://speed.cloudflare.com/__down?bytes=0');
		sh(sprintf("curl -s -o /dev/null -m 6 %s -w '%%{size_download} %%{time_total}' 'https://speed.cloudflare.com/__down?bytes=50000000' > %s/a 2>/dev/null </dev/null & curl -s -o /dev/null -m 6 %s -w '%%{size_download} %%{time_total}' 'https://speed.cloudflare.com/__down?bytes=50000000' > %s/b 2>/dev/null </dev/null & sleep 2; true", px, d, px, d));
		// 看看测速走的是哪个节点
		try {
			for (let c in api('GET', '/connections', null, 4)?.connections ?? [])
				if (index(c.metadata?.host ?? '', 'speed.cloudflare.com') >= 0) { r.via = join(' → ', reverse(c.chains ?? [])); break; }
		} catch (e) {}
		sh('i=0; while [ $i -lt 10 ] && [ ! -s ' + d + '/a -o ! -s ' + d + '/b ]; do sleep 1; i=$((i+1)); done');
		let x = f('a'), y = f('b'), bytes = (+x[0] || 0) + (+y[0] || 0), tt = max(+x[1] || 0, +y[1] || 0);
		r.down = tt > 0 ? (bytes * 8 / tt / 1e6) : 0;
		// 上传：从 /dev/zero 边读边传，不占内存
		let u = split(trim(sh("head -c 60000000 /dev/zero | curl -s -o /dev/null -m 5 " + px + " -X POST -T - -H 'Content-Type: application/octet-stream' -w '%{size_upload} %{time_total}' 'https://speed.cloudflare.com/__up'").out), ' ');
		r.up = +u[1] > 0 ? (+u[0] * 8 / +u[1] / 1e6) : 0;
		r.bytes = bytes + (+u[0] || 0);
	}
	sh('rm -rf ' + d);
	r.down = int(r.down * 10 + 0.5) / 10.0; if (r.up != null) r.up = int(r.up * 10 + 0.5) / 10.0;
	r.t = time();
	writefile('/tmp/cmcp_speed_' + r.kind + '.json', sprintf('%J', r));
	return r;
};
P.speed_last = function() {
	return { proxy: cmcp_readj('/tmp/cmcp_speed_proxy.json', null), direct: cmcp_readj('/tmp/cmcp_speed_direct.json', null) };
};


/* ---------- 云端备份（存在 Cloudflare，经路由器转发，面板拿不到云端密钥） ---------- */
// 6.0 第 9 项：一律加密。加密、下载解密、还原都由 cmcp-backup 在后台做（自带加密在慢的路由器上要一两分钟，
// 经 Cloudflare 的请求等不了那么久），进度在 /tmp/cmcp_bkjob.json，面板隔几秒看一次 bk_list
const BK_JOB = '/tmp/cmcp_bkjob.json';
function bk_cloud() {
	let c = {};
	for (let l in split(readfile(ETC + '/cloud.conf') ?? '', '\n')) { let m = match(l, /^([A-Z]+)=(.*)$/); if (m) c[m[1]] = m[2]; }
	if (!c.URL || !c.RKEY) die('还没有设置云端（云端备份是完整版功能）');
	return c;
}
function bk_id(a) { let id = '' + (a.id ?? ''); if (!match(id, /^[a-z0-9]{4,16}$/)) die('备份编号不对'); return id; }
// 现在的后台任务：超过 30 分钟还没做完的当作卡住了（比如中途断电），不再挡着
function bk_job() {
	let j = cmcp_readj(BK_JOB, null);
	if (type(j) != 'object') return null;
	if ((j.state == 'running' || j.state == 'restoring') && time() - (j.at ?? 0) > 1800) j.state = 'stale';
	return j;
}
function bk_start(op, id, extra) {
	let j = bk_job();
	if (j && (j.state == 'running' || j.state == 'restoring')) die(j.op == 'restore' ? '正在还原，等它做完' : j.op == 'now' ? '正在备份，等它做完' : '正在准备下载，等它做完');
	writefile(BK_JOB, sprintf('%J\n', { op, id: id ?? '', state: 'running', msg: '', at: time() }));
	sh(sprintf('( %s/cmcp-backup job %s %s %s ) >/dev/null 2>&1 </dev/null &', SBIN, op, id ?? '""', extra ?? ''));
	return { ok: true, running: true };
}

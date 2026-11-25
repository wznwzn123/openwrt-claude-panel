
/* ---------------- 6.0 第 17 项：家人只管自己的设备 ----------------
 * 子账号没有「看和管所有设备」（alldev）权限时：设备、流量、连接、暂停 / 计划只看得到自己名下的设备，也只能管这些（在路由器上过滤和检查）。
 * 设备归谁：/etc/claude-mcp/devown.json { MAC: { uid, ok, how: auto|claim|set, at } }
 *   auto  = 他打开面板用的那台手机（局域网直连看来源地址；走隧道时看代理插件里谁在连面板的域名，只有一台才算）
 *   claim = 他自己点「这是我的」，主账号确认后 ok 才是 true
 *   set   = 主账号指定
 * 另外（风险 16、用户 11/24 定的「孩子改不了自己的计划」）：设备归某个子账号，而暂停 / 上网计划是别人设的，这个子账号改不了。
 * 官网还是旧版（没有 alldev 这一项）时不限制（FAM_PV < 3）。 */
const OWN_PATH = ETC + '/devown.json', OWN_AUTO = '/tmp/cmcp_ownauto.json';
const MAC_RE = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/;
function own_load() { let o = cmcp_readj(OWN_PATH, {}); return type(o) == 'object' ? o : {}; }
function own_save(o) { cmcp_writej(OWN_PATH, o); }
function own_only() { return ROLE == 'sub' && FAM_PV >= 3 && index(PERMS, 'alldev') < 0; }
function own_mine(o) { o = o ?? own_load(); let m = {}; for (let k in o) if (o[k]?.uid && o[k].uid == DEV?.uid && o[k].ok) m[k] = 1; return m; }
// 他打开面板用的那台设备：IPv4 地址 → MAC
function own_ip_mac(ip) {
	let lm = lease_map();
	if (lm[ip]?.mac) return lm[ip].mac;
	let m = match(sh('ip neigh show ' + shq(ip) + ' 2>/dev/null').out, /lladdr ([0-9a-f:]{17})/);
	return m ? m[1] : null;
}
// 局域网直连进来的：来源地址就是这台手机
function own_lan_ip() {
	let ra = replace(getenv('REMOTE_ADDR') ?? '', /^::ffff:/, '');
	return match(ra, /^\d+\.\d+\.\d+\.\d+$/) && !match(ra, /^127\./) ? ra : null;
}
// 走隧道进来的：代理插件里正在连面板域名的局域网设备；只有一台才算（几个人同时开着面板就认不出来）
function own_clash_ip() {
	let dom = CL.panel_domain();
	if (!dom) return null;
	let d = null;
	try { d = CL.api('GET', '/connections', null, 4).json; } catch (e) {}
	let ips = {};
	for (let c in (d?.connections ?? [])) {
		let h = lc(c.metadata?.host ?? ''), s = c.metadata?.sourceIP ?? '';
		if (length(h) && (h == dom || substr(h, -length(dom) - 1) == '.' + dom) && match(s, /^\d+\.\d+\.\d+\.\d+$/) && !match(s, /^127\./)) ips[s] = 1;
	}
	let k = keys(ips);
	return length(k) == 1 ? k[0] : null;
}
// 自动认：子账号打开面板时。局域网直连每次都看；走隧道要问代理插件，同一台手机 10 分钟最多问一次。这台设备已经归别人就不动
function own_auto() {
	if (ROLE != 'sub' || !DEV?.uid || !DEV_ID) return;
	let ip = own_lan_ip();
	if (!ip) {
		let st = cmcp_readj(OWN_AUTO, {});
		if (type(st) != 'object') st = {};
		if (time() - (st[DEV_ID] ?? 0) < 600) return;
		st[DEV_ID] = time();
		for (let k in keys(st)) if (time() - st[k] > 86400) delete st[k];
		cmcp_writej(OWN_AUTO, st);
		ip = own_clash_ip();
	}
	let mac = ip ? own_ip_mac(ip) : null;
	if (!mac || !match(mac, MAC_RE)) return;
	let o = own_load();
	if (o[mac] && (o[mac].uid != DEV.uid || o[mac].ok)) return;
	o[mac] = { uid: DEV.uid, ok: true, how: 'auto', at: time() };
	own_save(o);
}
// 这个子账号能不能管这台设备
function own_check(mac) {
	if (!own_only()) return;
	if (!match(lc('' + (mac ?? '')), MAC_RE) || !own_mine()[lc(mac)]) die('这台设备不是你的：只能管自己名下的设备');
}
// 设备归这个子账号、但暂停 / 计划是别人设的：改不了
function own_guard_pause(mac) {
	if (ROLE != 'sub' || !DEV?.uid) return;
	let o = own_load(), e = o[lc('' + mac)];
	if (!e || e.uid != DEV.uid) return;
	let p = cmcp_readj('/etc/claude-mcp/pause.json', {})[lc('' + mac)];
	let by = p?.plan?.by ?? p?.by ?? null;
	if (p && by && by != DEV.uid) die('这台设备的暂停和上网计划是家长设的，你改不了');
}

/* ---- 看：只留自己的设备 ---- */
function own_ips(mine) {
	let ips = {};
	let lm = lease_map();
	for (let ip in lm) if (mine[lm[ip].mac]) ips[ip] = 1;
	for (let l in split(sh('ip neigh show 2>/dev/null').out, '\n')) { let m = match(l, /^(\S+) .*lladdr ([0-9a-f:]{17})/); if (m && mine[m[2]]) ips[m[1]] = 1; }
	return ips;
}
const OWN_DEVICES = P.devices;
P.devices = function(a) {
	own_auto();
	let r = OWN_DEVICES(a);
	if (own_only()) { let mine = own_mine(); r.devices = filter(r.devices ?? [], (d) => d.mac && mine[d.mac]); r.own = true; }
	return r;
};
const OWN_BLACK = P.black_state;
P.black_state = function(a) {
	let r = OWN_BLACK(a);
	if (own_only()) {
		let mine = own_mine(), ips = own_ips(mine);
		r.entries = filter(r.entries ?? [], (e) => (e.mac && mine[lc(e.mac)]) || (!e.mac && ips[e.ip]));
		r.own = true;
	}
	return r;
};
const OWN_PAUSE_LIST = P.pause_list;
function own_pz(r) {
	if (own_only() && type(r?.devs) == 'object') { let mine = own_mine(); for (let k in keys(r.devs)) if (!mine[k]) delete r.devs[k]; }
	return r;
}
P.pause_list = function(a) { return own_pz(OWN_PAUSE_LIST(a)); };
const OWN_PAUSE_SET = P.pause_set;
P.pause_set = function(a) { own_check(a?.mac); own_guard_pause(a?.mac); return own_pz(OWN_PAUSE_SET(a)); };
const OWN_IMGS = P.dev_imgs;
P.dev_imgs = function(a) {
	let r = OWN_IMGS(a);
	if (own_only() && type(r?.imgs) == 'object') { let mine = own_mine(); for (let k in keys(r.imgs)) if (!mine[k]) delete r.imgs[k]; }
	return r;
};
const OWN_CONNS = P.connections;
P.connections = function(a) {
	let r = OWN_CONNS(a);
	if (own_only()) { let ips = own_ips(own_mine()); r.connections = filter(r.connections ?? [], (c) => ips[c.src]); r.total = length(r.connections); delete r.download_total; delete r.upload_total; r.own = true; }
	return r;
};
const OWN_TRAFFIC = P.traffic;
P.traffic = function(a) {
	let r = OWN_TRAFFIC(a);
	if (own_only()) {
		let mine = own_mine();
		for (let d in r.days ?? {}) { let x = r.days[d]; if (type(x) == 'object') for (let k in keys(x)) if (!mine[k]) delete x[k]; }
		for (let k in keys(r.names ?? {})) if (!mine[k]) delete r.names[k];
		r.own = true;
	}
	return r;
};
/* ---- 管：只能管自己的设备 ---- */
const OWN_RENAME = P.dev_rename;
P.dev_rename = function(a) { own_check(a?.mac); return OWN_RENAME(a); };
const OWN_BLSET = P.black_set;
P.black_set = function(a) {
	if (own_only()) {
		let mac = a?.mac;
		if (!mac) { let lm = lease_map(); mac = lm[a?.ip]?.mac; }
		own_check(mac);
	}
	return OWN_BLSET(a);
};
const OWN_FORGET = P.dev_forget;
P.dev_forget = function(a) {
	if (own_only()) for (let it in (a?.items ?? [])) own_check(it?.mac);
	return OWN_FORGET(a);
};

/* ---- 设备归谁 ---- */
// 子账号：自己名下的（含等确认的）、没主的设备（能认领）；主账号：全部
P.dev_own = function() {
	let o = own_load(), out = {};
	if (ROLE != 'sub') out = o;
	else for (let k in o) if (o[k]?.uid == DEV?.uid) out[k] = o[k];
	let r = { own: out, limit: own_only() };
	if (ROLE == 'sub') {
		// 没主的设备（在线的排前面，最多 50 台）：只给名字和图标，看不到流量和连接
		let c = [];
		for (let d in (OWN_DEVICES().devices ?? [])) if (d.mac && !o[d.mac]) push(c, { mac: d.mac, name: d.name, icon: d.icon ?? null, online: !!d.online });
		r.cands = slice(sort(c, (x, y) => (y.online ? 1 : 0) - (x.online ? 1 : 0)), 0, 50);
	}
	return r;
};
// 子账号点「这是我的」：等主账号确认
P.dev_claim = function(a) {
	if (ROLE != 'sub' || !DEV?.uid) die('主账号不用认领：在设备的「更多 → 归谁」里指定');
	let mac = lc('' + (a?.mac ?? ''));
	if (!match(mac, MAC_RE)) die('设备地址不对');
	let o = own_load();
	if (o[mac] && o[mac].uid != DEV.uid) die('这台设备已经有主人了，找主账号改');
	if (o[mac]?.ok) return { ok: true, own: o[mac] };
	let n = 0;
	for (let k in o) if (o[k]?.uid == DEV.uid && !o[k].ok) n++;
	if (n >= 10) die('等确认的设备太多了，先让主账号确认');
	let d = null;
	for (let x in (OWN_DEVICES().devices ?? [])) if (x.mac == mac) d = x;
	if (!d) die('找不到这台设备');
	o[mac] = { uid: DEV.uid, ok: false, how: 'claim', at: time() };
	own_save(o);
	let owner = fam_read()?.owner ?? '';
	sh(sprintf('%s/cmcp-notify info claim %s %s %s %s >/dev/null 2>&1 &', SBIN, shq('有家人认领了设备「' + (d.name ?? mac) + '」'), shq('确认以后，这台设备算他的：他能看到、能管。点开确认。'), shq('claim-' + mac), shq(owner)));
	return { ok: true, own: o[mac] };
};
// 主账号：确认 / 拒绝认领、指定归谁（uid: null = 谁的都不是）
P.dev_own_set = function(a) {
	if (ROLE == 'sub') die('只有主账号能改设备归谁');
	let mac = lc('' + (a?.mac ?? ''));
	if (!match(mac, MAC_RE)) die('设备地址不对');
	let o = own_load(), uid = a?.uid;
	if (uid == null || uid === '') delete o[mac];
	else {
		uid = '' + uid;
		if (!match(uid, /^[a-z2-9]{12}$/)) die('账号不对');
		o[mac] = { uid, ok: true, how: o[mac]?.uid == uid && o[mac]?.how ? o[mac].how : 'set', at: time() };
	}
	own_save(o);
	return { ok: true, own: o };
};
// AI 工具里的设备列表、连接列表：只管自己的家人不给（面板「设备」页里看自己的）
for (let tn in ['device_list', 'list_connections']) {
	let orig = T[tn];
	if (type(orig) == 'function') T[tn] = function(a) { if (own_only()) die('你只能看自己的设备：到面板「设备」页里看'); return orig(a); };
}

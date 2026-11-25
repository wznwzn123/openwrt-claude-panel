/* ---------------- 6.0 第 23 项：应用过滤（OAF）——规则 + 每台设备的 App 使用记录 ----------------
 * OAF 7（fanchmwrt，ubus 对象 fwx）：规则、开关、使用记录都在面板里（接口在用户路由器上看过：fwx common {api, data}）。
 * OAF 6 及更早（ubus 对象 appfilter / uci appfilter）：面板不改，说清楚、给原版页面入口。
 * 没装：用户 11/26 定，给软件中心一键安装的入口；软件源里没有就说这个固件不支持。
 * 使用记录只有主账号能看（oaf_usage 不在任何权限组里 = 只有主账号）；家人能改规则（parent 组），只管自己设备的家人只能给自己的设备设。 */
const OAF_UBUS = getenv('CMCP_OAF_UBUS') || 'ubus';
function oaf_kind() {
	let l = sh(OAF_UBUS + ' list 2>/dev/null').out;
	if (match(l, /(^|\n)fwx(\n|$)/)) return 'fwx';
	if (match(l, /(^|\n)appfilter(\n|$)/) || stat('/usr/bin/oafd') || stat('/etc/init.d/appfilter')) return 'legacy';
	return null;
}
function fwx(api, data) {
	let r = null;
	try { r = json(sh(sprintf('%s -t 15 call fwx common %s 2>/dev/null', OAF_UBUS, shq(sprintf('%J', { CopyRight: 'www.fanchmwrt.com', api, data: data ?? {} })))).out); } catch (e) {}
	return type(r) == 'object' && r.code == 2000 ? (r.data ?? {}) : null;
}
// 分类名：OAF 给的是英文
const OAF_CLASS = { Chat: '聊天', Game: '游戏', Video: '视频', Shopping: '购物', Music: '音乐', Download: '下载', Website: '网站', Social: '社交', News: '新闻', Live: '直播', Reading: '阅读', Tools: '工具', Finance: '理财', Education: '学习', Travel: '出行', Map: '地图', Email: '邮件', Office: '办公', Vpn: 'VPN', VPN: 'VPN', Other: '其他' };
function oaf_classes() {
	let d = fwx('class_list'), out = [];
	for (let c in (d?.class_list ?? [])) {
		let apps = [];
		for (let a in (c.app_list ?? [])) { let p = split('' + a, ','); if (+p[0] > 0) push(apps, { id: +p[0], name: p[1] ?? ('' + p[0]) }); }
		if (length(apps)) push(out, { name: OAF_CLASS[c.name] ?? c.name, apps });
	}
	return out;
}
function oaf_avail() {
	let pm = app_pm();
	if (!pm) return false;
	let I = st_index(pm);
	if (I.age == null) return null;
	return !!(I.idx['luci-app-oaf'] || I.idx['app-meta-oaf'] || I.idx['luci-app-appfilter']);
}
P.oaf_get = function() {
	let k = oaf_kind();
	if (!k) return { kind: null, avail: oaf_avail() };
	if (k == 'legacy') return { kind: 'legacy' };
	let rules = fwx('get_filter_rules')?.list ?? [], adv = fwx('get_app_filter_adv'), users = fwx('get_all_users')?.list ?? [];
	if (own_only()) { let mine = own_mine(); rules = filter(rules, (r) => r.mode == 2 && mine[lc(r.user_mac ?? '')]); users = filter(users, (u) => mine[lc(u.mac ?? '')]); }
	return {
		kind: 'fwx', on: adv ? +adv.enable == 1 : null, owner: ROLE == 'owner', limit: own_only(),
		rules: map(rules, (r) => ({ id: +r.id, name: r.name ?? '', mode: +r.mode, mac: lc(r.user_mac ?? ''), time_rules: r.time_rules ?? [], app_ids: r.app_ids ?? [] })),
		classes: oaf_classes(), users: map(users, (u) => ({ mac: lc(u.mac ?? ''), name: u.nickname || u.hostname || '', online: !!u.online }))
	};
};
P.oaf_switch = function(a) {
	if (oaf_kind() != 'fwx') die('在原版页面里改');
	if (own_only()) die('只有能管所有设备的家人能开关');
	if (fwx('set_app_filter_adv', { enable: a?.on ? 1 : 0 }) == null) die('应用过滤没响应，稍后再试');
	return P.oaf_get();
};
// a: { op: add | update | del, id, name, mode（1 所有设备 / 2 一台设备）, mac, time_rules: [{ weekdays: [0..6，0 是周日], start_time, end_time }], app_ids }
P.oaf_rule = function(a) {
	if (oaf_kind() != 'fwx') die('在原版页面里改');
	let op = a?.op, cur = null, rules = fwx('get_filter_rules')?.list ?? [];
	if (index(['add', 'update', 'del'], op) < 0) die('不支持的操作');
	if (op != 'add') { for (let r in rules) if (+r.id == +a?.id) cur = r; if (!cur) die('没有这条规则'); }
	// 只管自己设备的家人：只能动给自己设备的规则
	if (own_only() && cur && !(cur.mode == 2 && own_mine()[lc(cur.user_mac ?? '')])) die('这条规则管的不只是你的设备，找主账号改');
	if (op == 'del') {
		if (fwx('delete_filter_rule', { id: +cur.id }) == null) die('删除失败，稍后再试');
		return P.oaf_get();
	}
	let name = trim('' + (a?.name ?? ''));
	if (!length(name) || length(name) > 48 || match(name, /[\x01-\x1f\x7f<>"]/)) die('名字不对（最多 16 个字）');
	let mode = +a?.mode == 2 ? 2 : 1, mac = lc(trim('' + (a?.mac ?? '')));
	if (mode == 1 && own_only()) die('你只能给自己的设备设规则');
	if (mode == 2) { if (!match(mac, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) die('选一台设备'); own_check(mac); }
	let tr = [];
	for (let t in (type(a?.time_rules) == 'array' ? slice(a.time_rules, 0, 8) : [])) {
		let wd = [];
		for (let w in (type(t?.weekdays) == 'array' ? t.weekdays : [])) if (+w >= 0 && +w <= 6 && index(wd, +w) < 0) push(wd, +w);
		let s = '' + (t?.start_time ?? ''), e = '' + (t?.end_time ?? '');
		if (!length(wd)) die('每段时间至少选一天');
		if (!match(s, /^([01][0-9]|2[0-3]):[0-5][0-9]$/) || !match(e, /^([01][0-9]|2[0-3]):[0-5][0-9]$/)) die('时间不对，比如 08:00');
		if (s >= e) die('开始时间要比结束时间早（跨夜的分成两段）');
		push(tr, { weekdays: sort(wd, (x, y) => x - y), start_time: s, end_time: e });
	}
	if (!length(tr)) die('至少设一段时间');
	let ids = [];
	for (let i in (type(a?.app_ids) == 'array' ? slice(a.app_ids, 0, 500) : [])) if (+i > 0 && index(ids, +i) < 0) push(ids, +i);
	if (!length(ids)) die('至少选一个 App');
	if (op == 'add' && length(rules) >= 32) die('最多 32 条规则');
	let uname = '';
	if (mode == 2) for (let u in (fwx('get_all_users')?.list ?? [])) if (lc(u.mac ?? '') == mac) uname = u.nickname || u.hostname || '';
	let d = { name, mode, time_rules: tr, app_ids: ids, user_mac: mode == 2 ? mac : '', user_name: uname };
	if (op == 'update') d.id = +cur.id;
	if (fwx(op == 'add' ? 'add_filter_rule' : 'update_filter_rule', d) == null) die('保存失败，稍后再试');
	return P.oaf_get();
};
// 一台设备用了哪些 App、各用了多久（今天，OAF 自己的统计）
P.oaf_usage = function(a) {
	if (oaf_kind() != 'fwx') die('在原版页面里看');
	let mac = lc(trim('' + (a?.mac ?? '')));
	if (!match(mac, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) die('选一台设备');
	let l = fwx('dev_visit_time', { mac })?.list ?? [];
	return { mac, list: sort(map(filter(l, (x) => +x.t > 0), (x) => ({ id: +x.id, name: x.name ?? '', t: +x.t })), (p, q) => q.t - p.t) };
};

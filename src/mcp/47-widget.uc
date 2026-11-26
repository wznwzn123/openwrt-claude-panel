/* ---------------- 6.0 第 38 项：安卓桌面小组件（网速、在线设备数） ----------------
 * 用户 11/26 定：小组件用一把只能看网速和在线设备数的钥匙，能在「登录着的设备」里撤销。
 * 在 App 里打开面板 →「系统操作 → 桌面小组件」→ 路由器发一把小组件钥匙（编号.密钥，存 widget.json）→ App 存起来。
 * 小组件只走 /cgi-bin/mcp/widget，只能调 panel/widget，只回网速、在线设备数和路由器名字。
 * 列在「登录着的设备」里（编号前面加 w:），移除就失效；子账号只看得到、只能移除自己加的。 */
const WD_F = ETC + '/widget.json';
function wd_read() { let o = cmcp_readj(WD_F, {}); return type(o) == 'object' ? o : {}; }
function wd_name() { return trim(readfile('/proc/sys/kernel/hostname') ?? '') || '路由器'; }
P.widget_new = function(a) {
	let d = wd_read(), mine = 0;
	for (let k in d) if ((d[k].uid ?? '') == (DEV?.uid ?? '')) mine++;
	if (mine >= 5) die('最多加 5 个小组件：先在「登录着的设备」里移除不用的');
	let id = rand_str(8), s = rand_str(32);
	if (!id || !s) die('生成钥匙失败，再试一次');
	d[id] = { s, name: substr(DEV?.name ?? '手机', 0, 40), at: time(), uid: DEV?.uid ?? '', dev: DEV_ID ?? '' };
	cmcp_writej(WD_F, d);
	return { k: id + '.' + s, name: wd_name() };
};
// 小组件来取数据（只在 /widget 地址上能调）
P.widget = function(a) {
	let m = match('' + (a?.k ?? ''), /^([a-z0-9]{8})\.([a-z0-9]{32})$/), d = m ? wd_read()[m[1]] : null;
	if (!d || d.s != m[2]) die('小组件失效了：在 App 里重新添加');
	// 隔 1 秒采两次，算现在的网速（小组件很久才来一次，不能用上一次的采样）
	let l = P.live();
	if (l.rx == null) { sh('F=/tmp/cmcp_wd.$$; mkfifo $F && { read -t 1 x <> $F; rm -f $F; }'); l = P.live(); }
	let n = null; try { n = P.home_stats()?.devices?.online; } catch (e) {}
	let sn = seen_read(), t = time();
	if (t - (sn['w:' + m[1]] ?? 0) > 60) { sn['w:' + m[1]] = t; writefile(SEEN_PATH, sprintf('%J', sn)); }
	return { rx: l.rx, tx: l.tx, n, name: wd_name(), t };
};
// 「登录着的设备」：小组件也列出来，能移除
const WD_LIST0 = P.device_list, WD_RM0 = P.device_remove;
P.device_list = function(a) {
	let r = WD_LIST0(a), d = wd_read(), sn = seen_read();
	for (let id in d) if (ROLE != 'sub' || (DEV?.uid && d[id].uid == DEV.uid)) push(r.list, { id: 'w:' + id, name: '桌面小组件（' + d[id].name + '）', at: d[id].at, seen: sn['w:' + id] ?? null, kind: 'widget' });
	return r;
};
P.device_remove = function(a) {
	let id = '' + (a?.id ?? '');
	if (match(id, /^w:[a-z0-9]{8}$/)) {
		need_sudo(a);
		let d = wd_read(), k = substr(id, 2);
		if (!d[k] || (ROLE == 'sub' && d[k].uid != DEV?.uid)) die('没有这个小组件');
		delete d[k];
		cmcp_writej(WD_F, d);
		return { ok: true };
	}
	let r = WD_RM0(a);
	// 「让其他手机都退出」：小组件一起失效（子账号只清自己的）
	if (a?.all_others) {
		let d = wd_read();
		for (let k in keys(d)) if (ROLE != 'sub' || d[k].uid == DEV?.uid) delete d[k];
		cmcp_writej(WD_F, d);
	}
	return r;
};

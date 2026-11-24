/* 6.0 第 57、58、60 项：兼容情况上报（匿名，默认开，设置里能关）、尝鲜、修好了通知（实际干活的是 /usr/sbin/cmcp-compat） */
const CP_OFF = ETC + '/compat_off', CP_BW = ETC + '/beta_want', CP_RES = ETC + '/compat_res.json';
const AU_OFF = ETC + '/autoupd_off'; // 6.0 第 86 项：有这个文件 = 关掉「必须更新夜里自动装」
function compat_res() { let r = null; try { r = json(readfile(CP_RES) ?? 'null'); } catch (e) {} return type(r) == 'object' ? r : {}; }
P.compat_info = function() {
	let r = compat_res(), b = r.beta ?? null;
	return { on: !stat(CP_OFF), beta: { want: !!stat(CP_BW), ok: !!b?.ok, ver: b?.ver ?? '', tag: b?.tag ?? '' }, last: r.at ?? 0 };
};
P.compat_set = function(a) {
	if (ROLE == 'sub') die('只有主账号能改');
	if (a?.on === false) writefile(CP_OFF, '1'); else sh('rm -f ' + CP_OFF);
	return P.compat_info();
};
// 报名 / 退出尝鲜：马上跟官网说一声（后台，不等）
P.beta_set = function(a) {
	if (ROLE == 'sub') die('只有主账号能改');
	if (a?.want === true) writefile(CP_BW, '1'); else sh('rm -f ' + CP_BW);
	sh(sprintf('(CMCP_COMPAT_D=%s %s/cmcp-compat send now >/dev/null 2>&1 &) </dev/null', shq(ETC), SBIN));
	return P.compat_info();
};
// 一键更新：有挑中的尝鲜版就告诉面板；在用尝鲜版的能退回正式版
const UPD_CHECK0 = P.update_check;
P.update_check = function(a) {
	let r = UPD_CHECK0(a), b = compat_res().beta ?? null;
	if (b?.ok && match('' + (b.tag ?? ''), /^v\d+\.\d+\.\d+$/) && ver_newer(b.ver, r.cur ?? '0') && ver_newer(b.ver, r.latest ?? '0')) r.beta = { ver: b.ver, tag: b.tag };
	if (length(r.cur ?? '') && ver_newer(r.cur, r.latest ?? '0')) r.ahead = true; // 现在用的比正式版新（尝鲜版）
	r.auto = !stat(AU_OFF); // 6.0 第 86 项：必须更新夜里自动装（默认开）
	return r;
};
// 6.0 第 86 项：必须更新（安全修复）每天夜里自动装，默认开；关掉以后只能自己点「一键更新」。只有主账号能改
P.autoupd_set = function(a) {
	if (ROLE == 'sub') die('只有主账号能改');
	if (a?.on === false) writefile(AU_OFF, '1'); else sh('rm -f ' + shq(AU_OFF) + ' ' + shq(ETC + '/autoupd_fail'));
	return { auto: !stat(AU_OFF) };
};
const UPD_START0 = P.update_start;
P.update_start = function(a) {
	if (a?.channel != 'beta' && a?.channel != 'stable') return UPD_START0(a);
	if (a?.confirm != 'UPDATE') die('需要确认');
	if (ROLE == 'sub' && index(PERMS, 'sys') < 0) die('主账号没有给你开「系统操作」权限');
	let arg = 'stable';
	if (a.channel == 'beta') {
		let b = compat_res().beta ?? null;
		if (!b?.ok || !match('' + (b.tag ?? ''), /^v\d+\.\d+\.\d+$/)) die('这台路由器还没被选为尝鲜用户，或者现在没有尝鲜版');
		arg = 'beta ' + b.tag;
	}
	if (!stat('/usr/sbin/cmcp-update')) die('没能开始更新：路由器上没有 cmcp-update');
	let out = trim(sh('/usr/sbin/cmcp-update start ' + arg + ' 2>/dev/null').out ?? ''), r = null;
	try { r = json(out ? split(out, '\n')[-1] : ''); } catch (e) {}
	if (type(r) != 'object') die('没能开始更新：后台更新程序没有正常回应，稍后再试');
	if (r.busy) die('已经在更新了，等一会儿');
	return { started: true };
};

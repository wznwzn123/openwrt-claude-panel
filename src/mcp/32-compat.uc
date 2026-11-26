/* 6.0 第 57、58、60 项：兼容情况上报（匿名，默认开，设置里能关）、尝鲜、修好了通知（实际干活的是 /usr/sbin/cmcp-compat） */
const CP_OFF = ETC + '/compat_off', CP_BW = ETC + '/beta_want', CP_RES = ETC + '/compat_res.json';
const AU_OFF = ETC + '/autoupd_off'; // 6.0 第 86 项：有这个文件 = 关掉「必须更新夜里自动装」
function compat_res() { let r = null; try { r = json(readfile(CP_RES) ?? 'null'); } catch (e) {} return type(r) == 'object' ? r : {}; }
// 尝鲜申请（第 95 项）：beta_want 里是申请时间、留言（邮箱一律用官网账号的，不在路由器上填）
function beta_app() { let a = null; try { a = json(readfile(CP_BW) ?? 'null'); } catch (e) {} return type(a) == 'object' ? a : (stat(CP_BW) ? { at: 0 } : null); }
// 尝鲜的状态：none 没申请；wait 等审核；ok 已通过；no 没通过；rev 被撤销（这两种要重新申请）；err 申请没交上（原因在 why）；sending 刚申请还没报上去
function beta_state() {
	let a = beta_app(), b = compat_res().beta ?? null;
	if (!a) return { want: false, st: 'none' };
	let st = b?.st ?? (b?.ok ? 'ok' : null);
	// 拒绝 / 撤销以后又申请了（申请时间比那次决定晚）：等这次报上去
	if ((st == 'no' || st == 'rev') && (+a.at || 0) * 1000 > (+b?.dec || 0)) st = 'sending';
	if (st == 'err' && (+a.at || 0) > (compat_res().at ?? 0)) st = 'sending';
	return { want: true, st: st ?? 'sending', ok: st == 'ok', ver: b?.ver ?? '', tag: b?.tag ?? '', why: st == 'err' ? (b?.why ?? '') : '', at: +a.at || 0, note: a.note ?? '', mail: b?.mail ?? '', hosted: !!stat(ETC + '/hub.conf') };
}
P.compat_info = function(a) {
	// 等审核时打开面板看一眼：马上问一次官网（每天最多几次，官网也限次）
	if (a?.refresh && stat(CP_BW) && index(['wait', 'sending'], beta_state().st) >= 0) {
		let t = cmcp_readj('/tmp/cmcp_beta_ask.json', {}), now = time();
		if (now - (t.at ?? 0) > 600) { cmcp_writej('/tmp/cmcp_beta_ask.json', { at: now }); sh(sprintf('CMCP_COMPAT_D=%s %s/cmcp-compat send now >/dev/null 2>&1', shq(ETC), SBIN)); }
	}
	let r = compat_res();
	return { on: !stat(CP_OFF), beta: beta_state(), last: r.at ?? 0 };
};
P.compat_set = function(a) {
	if (ROLE == 'sub') die('只有主账号能改');
	if (a?.on === false) writefile(CP_OFF, '1'); else sh('rm -f ' + CP_OFF);
	return P.compat_info();
};
// 申请 / 撤回申请 / 退出尝鲜：马上跟官网说一声（等它报完，最多 25 秒，好告诉你交上了没有）
P.beta_set = function(a) {
	if (ROLE == 'sub') die('只有主账号能改');
	if (a?.want === true) {
		let note = substr(trim(replace('' + (a.note ?? ''), /[[:cntrl:]]/g, ' ')), 0, 200);
		writefile(CP_BW, sprintf('%J', { at: time(), note }));
	} else sh('rm -f ' + shq(CP_BW));
	sh(sprintf('CMCP_COMPAT_D=%s %s/cmcp-compat send now >/dev/null 2>&1', shq(ETC), SBIN));
	return P.compat_info();
};
// 申请框打开时：问官网申请用哪个邮箱（官网账号的，打码）；自建版没关联账号时带回关联码，面板拿它去官网登录
P.beta_who = function() {
	if (ROLE == 'sub') die('只有主账号能申请');
	let r = null; try { r = json(trim(sh(sprintf('CMCP_COMPAT_D=%s %s/cmcp-compat who 2>/dev/null', shq(ETC), SBIN)).out ?? '')); } catch (e) {}
	if (type(r) != 'object') die('连不上官网，稍后再试');
	if (r.error) die('' + r.error);
	return r;
};
// 一键更新：有挑中的尝鲜版就告诉面板；在用尝鲜版的能退回正式版
const UPD_CHECK0 = P.update_check;
P.update_check = function(a) {
	let r = UPD_CHECK0(a), b = compat_res().beta ?? null;
	if (!stat(CP_BW)) b = null; // 退出了尝鲜
	if (b?.ok && match('' + (b.tag ?? ''), /^v\d+\.\d+\.\d+$/) && ver_newer(b.ver, r.cur ?? '0') && ver_newer(b.ver, r.latest ?? '0')) r.beta = { ver: b.ver, tag: b.tag };
	if (length(r.cur ?? '') && ver_newer(r.cur, r.latest ?? '0')) r.ahead = true; // 现在用的比正式版新（尝鲜版）
	r.auto = !stat(AU_OFF); // 6.0 第 86 项：必须更新夜里自动装（默认开）
	r.seen = '' + (nt_seen().upd ?? ''); // 6.0 第 85 项：哪个新版本已经弹过（记在路由器上，换手机也不再弹）
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
		let b = stat(CP_BW) ? compat_res().beta ?? null : null;
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

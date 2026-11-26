/* 5.3.0：申请尝鲜（实际干活的是 /usr/sbin/cmcp-compat）。文件名和格式跟 6.0 一样，升到 6.0 以后接着用
 * 申请 → 官网后台同意 / 拒绝 / 撤销；同意了在「检查更新」里能装尝鲜版 */
const CP_BW = ETC + '/beta_want', CP_RES = ETC + '/compat_res.json';
function compat_res() { let r = null; try { r = json(readfile(CP_RES) ?? 'null'); } catch (e) {} return type(r) == 'object' ? r : {}; }
function beta_app() { let a = null; try { a = json(readfile(CP_BW) ?? 'null'); } catch (e) {} return type(a) == 'object' ? a : (stat(CP_BW) ? { at: 0 } : null); }
// 状态：none 没申请；sending 刚申请还没报上去；wait 等审核；ok 已通过；no 没通过；rev 被撤销（这两种要重新申请）；err 没交上（原因在 why）
function beta_state() {
	let a = beta_app(), b = compat_res().beta ?? null;
	if (!a) return { want: false, st: 'none', hosted: !!stat(ETC + '/hub.conf') };
	let st = b?.st ?? (b?.ok ? 'ok' : null);
	if ((st == 'no' || st == 'rev') && (+a.at || 0) * 1000 > (+b?.dec || 0)) st = 'sending';
	if (st == 'err' && (+a.at || 0) > (compat_res().at ?? 0)) st = 'sending';
	return { want: true, st: st ?? 'sending', ok: st == 'ok', ver: b?.ver ?? '', tag: b?.tag ?? '', why: st == 'err' ? (b?.why ?? '') : '', at: +a.at || 0, note: a.note ?? '', hosted: !!stat(ETC + '/hub.conf') };
}
function beta_send() { sh(sprintf('CMCP_COMPAT_D=%s %s/cmcp-compat send now >/dev/null 2>&1', shq(ETC), getenv('CMCP_SBIN') || '/usr/sbin')); }
P.beta_info = function(a) {
	// 等审核时打开看一眼：马上问一次官网（10 分钟最多一次，官网也限次）
	if (a?.refresh && stat(CP_BW) && index(['wait', 'sending'], beta_state().st) >= 0) {
		let t = cmcp_readj('/tmp/cmcp_beta_ask.json', {}), now = time();
		if (now - (t.at ?? 0) > 600) { cmcp_writej('/tmp/cmcp_beta_ask.json', { at: now }); beta_send(); }
	}
	return { beta: beta_state() };
};
// 申请 / 撤回 / 退出：马上跟官网说一声（等它报完，最多 25 秒，好告诉你交上了没有）
P.beta_set = function(a) {
	if (ROLE == 'sub') die('只有主账号能改');
	if (a?.want === true) {
		let hosted = !!stat(ETC + '/hub.conf'), email = trim('' + (a.email ?? '')), note = substr(trim(replace('' + (a.note ?? ''), /[[:cntrl:]]/g, ' ')), 0, 200);
		if (!hosted && !match(email, /^[^ \t@<>]{1,64}@[^ \t@<>]{1,190}\.[A-Za-z]{2,24}$/)) die('邮箱格式不对');
		writefile(CP_BW, sprintf('%J', { at: time(), note, ...(hosted ? {} : { email }) }));
	} else sh('rm -f ' + shq(CP_BW));
	beta_send();
	return P.beta_info();
};
// 检查更新：同意了尝鲜、有比现在新的尝鲜版，就告诉面板
const UPD_CHECK0 = P.update_check;
P.update_check = function(a) {
	let r = UPD_CHECK0(a), b = stat(CP_BW) ? compat_res().beta ?? null : null;
	if (b?.ok && match('' + (b.tag ?? ''), /^v\d+\.\d+\.\d+$/) && ver_newer(b.ver, r.cur ?? '0') && ver_newer(b.ver, r.latest ?? '0')) r.beta = { ver: b.ver, tag: b.tag };
	r.betast = beta_state(); // 面板「系统操作 → 尝鲜」那一行显示状态用
	return r;
};
const UPD_START0 = P.update_start;
P.update_start = function(a) {
	if (a?.channel != 'beta') return UPD_START0(a);
	if (a?.confirm != 'UPDATE') die('需要确认');
	if (ROLE == 'sub' && index(PERMS, 'sys') < 0) die('主账号没有给你开「系统操作」权限');
	let b = stat(CP_BW) ? compat_res().beta ?? null : null;
	if (!b?.ok || !match('' + (b.tag ?? ''), /^v\d+\.\d+\.\d+$/)) die('这台路由器的尝鲜申请还没通过，或者现在没有尝鲜版');
	if (!stat('/usr/sbin/cmcp-update')) die('没能开始更新：路由器上没有 cmcp-update');
	let out = trim(sh('/usr/sbin/cmcp-update start beta ' + b.tag + ' 2>/dev/null').out ?? ''), r = null;
	try { r = json(out ? split(out, '\n')[-1] : ''); } catch (e) {}
	if (type(r) != 'object') die('没能开始更新：后台更新程序没有正常回应，稍后再试');
	if (r.busy) die('已经在更新了，等一会儿');
	return { started: true };
};

/* ---------- 6.0 第 6、12、13 项：手机钥匙 + 1 小时通行证 ----------
 * 手机不再存路由器的登录密钥（主密钥）。每台手机有自己的钥匙（编号.密钥，存在 devices.json，能单独让它退出），
 * 平时每个请求只带 1 小时的通行证（放在内存 /tmp 里，路由器重启就全部作废，手机会自动再领），走 /cgi-bin/mcp/pass，
 * 钥匙和通行证都在请求内容里，不在网址里。
 *   · 手机钥匙每 12 小时自动换一把；换过以后，如果旧钥匙又被拿来用（新钥匙已经用过了），说明可能被人复制了：
 *     让这台手机退出并推送提醒（你 11/21 定）
 *   · 自建版：登录地址（带登录密钥）只用来换一把手机钥匙（panel/pass_login），换完手机上就不留登录密钥了；
 *     可以开启「登录要输路由器后台密码」（第 12 项），开了以后光有登录地址进不来
 *   · 面板锁（第 13 项）：密码由路由器核对。手机把「密码 + 盐」算一遍（PBKDF2）发来，路由器只存它的摘要；
 *     指纹解锁保留，但每天至少要输一次密码（你 11/21 定）；一直输错会让这台手机退出 */
const PASS_F = '/tmp/cmcp_pass.json', LKOK_F = '/tmp/cmcp_lkok.json', LKF_F = '/tmp/cmcp_lkfail.json', LOGINPW_F = ETC + '/login_pw';
const PASS_TTL = 3600, DEV_ROT = 43200, LK_DAY = 86400, LK_WIPE = 20;
let ERR_CODE = null; // 报错时要给手机的特殊错误码（比如 -32015 要输路由器密码），见 90-rpc
function pass_read() { let m = cmcp_readj(PASS_F, {}); return type(m) == 'object' ? m : {}; }
function pass_write(m) {
	let t = time();
	for (let k in keys(m)) if (!(m[k]?.exp > t)) delete m[k];
	cmcp_writej(PASS_F, m); sh('chmod 600 ' + shq(PASS_F));
}
// 发一张通行证；每台手机同时最多 5 张（开了几个页面）
function pass_issue(id) {
	let p = rand_str(32);
	if (!p) die('生成通行证失败，再试一次');
	let m = pass_read(), t = time();
	let mine = sort(filter(keys(m), (k) => m[k]?.dev == id), (a, b) => (m[a].exp ?? 0) - (m[b].exp ?? 0));
	while (length(mine) >= 5) delete m[shift(mine)];
	m[p] = { dev: id, exp: t + PASS_TTL };
	pass_write(m);
	return { pass: p, exp: (t + PASS_TTL) * 1000 };
}
function pass_drop_dev(id) {
	let m = pass_read(), ch = false;
	for (let k in keys(m)) if (m[k]?.dev == id) { delete m[k]; ch = true; }
	if (ch) pass_write(m);
}
// 请求带的通行证对不对；对的话记下是哪台手机（DEV_ID / DEV）
function pass_ok(p) {
	if (type(p) != 'string' || !match(p, /^[a-z0-9]{32}$/)) return false;
	let e = pass_read()[p];
	if (type(e) != 'object' || !(e.exp > time())) return false;
	let d = devs_read()[e.dev];
	if (type(d) != 'object') return false;
	DEV_ID = e.dev; DEV = d;
	let sn = seen_read(), t = time();
	if (t - (sn[e.dev] ?? 0) > 60) { sn[e.dev] = t; writefile(SEEN_PATH, sprintf('%J', sn)); }
	return true;
}
// 拿手机钥匙换通行证时核对钥匙：{ id, d, cred（换了新钥匙时是新的，手机要存下） }；钥匙不对返回 null；被复制返回 'copied'
function dev_renew(cred) {
	let m = match(type(cred) == 'string' ? cred : '', /^([a-z0-9]{8})\.([a-z0-9]{32})$/);
	if (!m) return null;
	let all = devs_read(), d = all[m[1]], t = time();
	if (type(d) != 'object') return null;
	if (d.s == m[2]) {
		let ch = false;
		if (!d.su) { d.su = 1; ch = true; } // 新钥匙用过了：从现在起旧钥匙再出现就算被复制
		let out = null;
		if (t - (d.rot ?? d.at ?? 0) >= DEV_ROT) {
			let ns = rand_str(32);
			if (ns) { d.ps = d.s; d.s = ns; d.rot = t; d.su = 0; out = m[1] + '.' + ns; ch = true; }
		}
		if (ch) { all[m[1]] = d; devs_write(all); }
		return { id: m[1], d, cred: out };
	}
	if (d.ps && d.ps == m[2]) {
		// 刚换的新钥匙还没用过：多半是手机没收到换钥匙的回答，把新钥匙再给它一次
		if (!d.su) return { id: m[1], d, cred: m[1] + '.' + d.s };
		// 新钥匙已经用过了，旧钥匙又来：两个人手上都有这台手机的钥匙
		delete all[m[1]]; devs_write(all); pass_drop_dev(m[1]);
		try { sh(sprintf('/usr/sbin/cmcp-notify warn login %s %s login', shq('「' + (d.name ?? '手机') + '」的钥匙可能被复制了'), shq('同一台手机的旧钥匙在换新以后又被拿来用，已经让这台手机退出。是你自己的话重新登录就行；不是的话，在面板「我的主页 → 敏感信息」换一下登录密钥'))); } catch (e) {}
		return 'copied';
	}
	return null;
}
/* ---------- 面板锁（路由器核对） ---------- */
// 字符串的摘要（sha256，没有就 md5）：内容写进只有 root 能读的临时文件再算，不出现在命令行里
function hash_str(s) {
	let tf = trim(sh('mktemp /tmp/cmcp_h.XXXXXX').out);
	if (!match(tf, /^\/tmp\/cmcp_h\.[A-Za-z0-9]+$/)) die('路由器上建不了临时文件');
	writefile(tf, s);
	let r = sh(sprintf('(sha256sum %s 2>/dev/null || md5sum %s) | cut -d" " -f1; rm -f %s', tf, tf, tf)).out;
	let h = trim(split(r, '\n')[0] ?? '');
	if (!match(h, /^[0-9a-f]{32,64}$/)) die('路由器上算不了摘要');
	return h;
}
function lk_proof(p) { return type(p) == 'string' && match(p, /^[A-Za-z0-9+\/=]{40,100}$/) ? p : null; }
function lkok_read() { let m = cmcp_readj(LKOK_F, {}); return type(m) == 'object' ? m : {}; }
function lkok_set(id) { let m = lkok_read(); m[id] = time(); cmcp_writej(LKOK_F, m); }
function lkok_fresh(id) { return time() - (lkok_read()[id] ?? 0) < LK_DAY; }
// 核对面板锁密码：对了返回 null；错了返回 { msg, revoked }
function lk_verify(id, d, proof) {
	let f = cmcp_readj(LKF_F, {}), x = f[id] ?? { n: 0, total: 0, k: 0, until: 0 }, t = time();
	if ((x.until ?? 0) > t) { let w = x.until - t; return { msg: sprintf('错误次数太多，%s后再试', w >= 120 ? int((w + 59) / 60) + ' 分钟' : w + ' 秒'), wait: w }; }
	let p = lk_proof(proof);
	if (p && d.lk?.h && hash_str(d.lk.salt + ':' + p) == d.lk.h) { delete f[id]; cmcp_writej(LKF_F, f); return null; }
	x.n++; x.total++;
	if (x.total >= LK_WIPE) {
		delete f[id]; cmcp_writej(LKF_F, f);
		let all = devs_read(); delete all[id]; devs_write(all); pass_drop_dev(id);
		try { sh(sprintf('/usr/sbin/cmcp-notify warn login %s %s login', shq('「' + (d.name ?? '手机') + '」面板锁密码输错太多次'), shq('累计输错 ' + LK_WIPE + ' 次，已经让这台手机退出。不是你自己输的话，说明有人拿到了这台手机'))); } catch (e) {}
		return { msg: '密码输错太多次，已经让这台手机退出，要重新登录', revoked: true };
	}
	// 每错 5 次要等，等的时间翻倍：30 秒、1 分钟、2 分钟……最长 15 分钟
	if (x.n >= 5) { x.n = 0; x.k = (x.k ?? 0) + 1; let w = 30 * (1 << (x.k - 1)); x.until = t + (w > 900 ? 900 : w); }
	f[id] = x; cmcp_writej(LKF_F, f);
	let left = LK_WIPE - x.total;
	return { msg: left <= 5 ? sprintf('密码不对，再错 %d 次会让这台手机退出', left) : x.until > t ? '密码不对，30 秒后再试' : sprintf('密码不对，还能试 %d 次', 5 - x.n) };
}
// 拿手机钥匙换通行证（只有这个方法不用带通行证）。返回整条 JSON-RPC 回答（错误码手机要分开处理）
function pass_new_rpc(id, p) {
	let err = (code, message, data) => { let dd = { need_code: is_hosted(), hub: hub_conf(true)?.HUB ?? null }; for (let k in keys(data ?? {})) dd[k] = data[k]; return { jsonrpc: '2.0', id, error: { code, message, data: dd } }; };
	let r = dev_renew(p?.dev);
	if (r == 'copied') return err(-32010, '这台手机的钥匙可能被复制了，已经让它退出：重新登录就行');
	if (!r) return err(-32010, is_hosted() ? '这台手机还没登录：从官网「我的路由器」点「打开面板」进来' : '这台手机的登录失效了：重新打开登录地址（或在另一台已登录的手机上「添加新手机」扫码）');
	DEV_ID = r.id; DEV = r.d;
	try {
		if (r.d.lk) {
			if (p?.lkp != null) {
				let why = lk_verify(r.id, r.d, p.lkp);
				if (why) return why.revoked ? err(-32010, why.msg) : err(-32014, why.msg, { need_pin: true, bad: true, wait: why.wait ?? 0, salt: r.d.lk.salt, len: r.d.lk.len });
				lkok_set(r.id);
			} else {
				// 手上的通行证还没过期（正在用、快到期续一张）：接着用，不用再输
				let pv = type(p?.prev) == 'string' ? pass_read()[p.prev] : null;
				if (!(type(pv) == 'object' && pv.dev == r.id && pv.exp > time())) {
					// 新开的会话（锁屏后、关掉重开、过期了）：只开了密码的要输密码；开了指纹的（指纹只能在手机上验证）每天至少输一次
					if (!r.d.lk.fp) return err(-32014, '输面板锁密码解锁', { need_pin: true, salt: r.d.lk.salt, len: r.d.lk.len });
					if (!lkok_fresh(r.id)) return err(-32014, '今天第一次解锁，要输一次面板锁密码', { need_pin: true, salt: r.d.lk.salt, len: r.d.lk.len });
				}
			}
		}
		let ps = pass_issue(r.id);
		if (r.cred) ps.dev = r.cred;
		return { jsonrpc: '2.0', id, result: ps };
	} catch (e) { return { jsonrpc: '2.0', id, error: { code: -32000, message: type(e) == 'object' ? e.message : '' + e } }; }
}
// 面板「现在锁上」、退出登录：作废这台手机手上的通行证（之后要指纹或密码才能再领）
P.pass_drop = function() { if (DEV_ID) pass_drop_dev(DEV_ID); return { ok: true }; };
// 设置 / 修改 / 关闭面板锁（只能改自己这台手机的）。已经有锁时要先核对旧密码
P.lock_set = function(a) {
	if (!DEV_ID || !DEV) die('先登录');
	let all = devs_read(), d = all[DEV_ID];
	if (type(d) != 'object') die('这台手机已经退出了');
	if (d.lk) {
		let why = lk_verify(DEV_ID, d, a?.old);
		if (why) die(why.msg);
	}
	if (a?.on) {
		let salt = '' + (a?.salt ?? ''), p = lk_proof(a?.lkp), len = +(a?.len ?? 0);
		if (!match(salt, /^[A-Za-z0-9+\/=]{16,64}$/) || !p || len < 4 || len > 6) die('面板锁密码的格式不对');
		d.lk = { salt, h: hash_str(salt + ':' + p), len, at: time(), fp: !!a?.fp };
	} else delete d.lk;
	all[DEV_ID] = d; devs_write(all);
	if (a?.on) lkok_set(DEV_ID);
	return { ok: true, on: !!a?.on };
};
// 开 / 关指纹解锁（开之前面板已经核对过密码）：路由器据此决定新会话要不要每次都输密码
P.lock_fp = function(a) {
	let all = devs_read(), d = all[DEV_ID ?? ''];
	if (type(d) != 'object' || !d.lk) die('这台手机没开面板锁');
	d.lk.fp = !!a?.fp; all[DEV_ID] = d; devs_write(all);
	return { ok: true, fp: d.lk.fp };
};
// 核对面板锁密码（改密码、开指纹前确认是本人）
P.lock_check = function(a) {
	if (!DEV?.lk) return { ok: true, none: true };
	let why = lk_verify(DEV_ID, DEV, a?.lkp);
	if (why) die(why.msg);
	lkok_set(DEV_ID);
	return { ok: true };
};
P.lock_state = function() { return DEV?.lk ? { on: true, len: DEV.lk.len, salt: DEV.lk.salt } : { on: false }; };
/* ---------- 自建版：用登录地址换手机钥匙（第 6、12 项） ---------- */
function login_pw_on() { return trim(readfile(LOGINPW_F) ?? '') == '1'; }
// 开了「登录要输路由器密码」又没带密码：手机要弹出输密码（错误码 -32015，见 90-rpc）
function die2_need_pw() { ERR_CODE = -32015; die('这台路由器开了「登录要输路由器后台密码」：输一下路由器后台（root）密码'); }
P.pass_login = function(a) {
	if (is_hosted()) die('托管版要从官网「我的路由器」点「打开面板」进来');
	if (login_pw_on()) {
		if (a?.pw == null || a?.pw == '') die2_need_pw();
		rootpw_check(a?.pw, '登录面板时的路由器密码');
	}
	let id = rand_str(8), sec = rand_str(32);
	if (!id || !sec) die('生成手机钥匙失败，再试一次');
	let d = devs_read();
	let ids = sort(keys(d), (x, y) => (d[x].at ?? 0) - (d[y].at ?? 0));
	while (length(ids) >= 30) delete d[shift(ids)];
	let name = substr(replace('' + (a?.name ?? ''), /[[:cntrl:]<>"]/g, ''), 0, 40) || '手机';
	let via = login_pw_on() ? '登录地址 + 路由器密码' : '登录地址';
	d[id] = { s: sec, name, at: time(), rot: time(), via };
	devs_write(d);
	DEV_ID = id;
	// 以前就在用的手机（6.0 以前直接存着登录密钥）换成手机钥匙：不当成新手机推送
	if (!a?.migrate) try { sh(sprintf('/usr/sbin/cmcp-notify info login %s %s login', shq('新手机登录了面板：' + name), shq('用' + via + '登录。不是你自己的话，马上在面板「我的主页 → 敏感信息」让它退出，并换一下登录密钥'))); } catch (e) {}
	return { dev: id + '.' + sec, id, name };
};
// 开关「登录要输路由器后台密码」：只有主账号、确认过本人才能改（敏感信息里）
P.login_pw_set = function(a) {
	if (is_hosted()) die('托管版登录要过官网账号，不用这个');
	need_sudo(a, true);
	if (a?.on) {
		let sh0 = match(readfile(getenv('CMCP_SHADOW') ?? '/etc/shadow') ?? '', /(^|\n)root:([^:\n]*):/);
		if (sh0 && !length(sh0[2])) die('路由器还没设后台密码：先在原版后台「系统 → 管理权」设一个');
		writefile(LOGINPW_F, '1\n');
	} else sh('rm -f ' + shq(LOGINPW_F));
	return { ok: true, on: !!a?.on };
};
// 自建版「添加新手机」：给新手机的登录链接（带登录密钥）只在确认本人以后给
P.login_link = function(a) {
	if (is_hosted()) die('托管版添加新手机用官网');
	need_sudo(a, true);
	return { token: conf().token, pw: login_pw_on() };
};

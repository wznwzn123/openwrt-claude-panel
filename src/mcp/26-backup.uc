P.bk_list = function() {
	let c = bk_cloud(), r = sh(sprintf('curl -s -m 20 %s', shq(c.URL + '/bk/' + c.RKEY))), j = null;
	try { j = json(r.out); } catch (e) {}
	if (!j?.ok) die('连不上云端备份' + (j?.error ? '：' + j.error : ''));
	let cron = sh("grep -q cmcp-backup /etc/crontabs/root 2>/dev/null").code == 0;
	// 用哪种方式加密：有 openssl 用它（快），没有就用面板自带的（慢一些，不用装东西）
	let ssl = sh('command -v openssl >/dev/null 2>&1').code == 0;
	return { list: j.list, max: j.max, auto: cron, running: !!stat('/tmp/cmcp_bk.lock'), crypt: ssl ? 'openssl' : 'builtin', job: bk_job() };
};
P.bk_now = function() {
	bk_cloud();
	return bk_start('now');
};
P.bk_del = function(a) {
	let c = bk_cloud(), id = bk_id(a);
	let r = sh(sprintf('curl -s -m 20 -X DELETE %s', shq(c.URL + '/bk/' + c.RKEY + '/' + id))), j = null;
	try { j = json(r.out); } catch (e) {}
	if (!j?.ok) die('删除失败');
	return { ok: true };
};
// 下载：先在后台下载并解密（running），做完了面板再调一次拿下载链接
P.bk_dl = function(a) {
	let id = bk_id(a), j = bk_job(), f = '/tmp/cmcp_bkdl.' + id + '.tgz';
	if (j && j.op == 'dl' && j.id == id && j.state == 'done' && stat(f)) {
		writefile(BK_JOB, sprintf('%J\n', { ...j, state: 'taken' }));
		return dl_put(f, (match('' + (a.name ?? ''), /^[A-Za-z0-9_.-]{1,60}$/) ? a.name : 'router-backup-' + id) + '.tar.gz');
	}
	bk_cloud();
	return bk_start('dl', id);
};
// 还原：在后台先下载并检查、再把现在的设置备份一份，都成功了才还原（sysupgrade -r，和 LuCI「恢复备份」一样），然后重启。
// 钥匙类文件（登录密钥、登录着的手机、门禁钥匙等）保持现在的，见 cmcp-backup 的 KEEP
P.bk_restore = function(a) {
	let id = bk_id(a);
	bk_cloud();
	return bk_start('restore', id, a.force ? 'force' : '');
};

/* ---------- 每日体检：读最近一次结果；run=1 现在体检一次（只更新面板，不推送） ---------- */
P.daily = function(a) {
	if (a?.run) {
		let r = sh('/usr/sbin/cmcp-daily local 2>&1');
		if (r.code != 0) die('体检失败：' + substr(trim(r.out), 0, 200));
	}
	return cmcp_readj('/etc/claude-mcp/daily.json', null) ?? { none: true };
};

/* ---------- 托管版：绑定到官网账号（配对码）、看/移除绑定了这台路由器的账号 ---------- */
function hub_conf(quiet) {
	let c = {};
	for (let f in [ETC + '/hub.conf', ETC + '/cloud.conf'])
		for (let l in split(readfile(f) ?? '', '\n')) { let m = match(l, /^([A-Z]+)=(.*)$/); if (m) c[m[1]] = m[2]; }
	if (!c.HUB || !c.SUB || !c.RKEY) { if (quiet) return null; die('这台路由器没有用托管服务'); }
	return c;
}
function hub_call(path, extra, tmo) {
	let c = hub_conf();
	let b = { sub: c.SUB, rkey: c.RKEY };
	for (let k in extra ?? {}) b[k] = extra[k];
	// 内容先写进临时文件再发（带截图时很大，放在命令行里会超长）
	let tf = trim(sh('mktemp /tmp/cmcp_hub.XXXXXX').out);
	if (!match(tf, /^\/tmp\/cmcp_hub\.[A-Za-z0-9]+$/)) die('路由器上建不了临时文件');
	writefile(tf, sprintf('%J', b));
	let r = sh(sprintf("curl -s -m %d -X POST -H 'Content-Type: application/json' --data-binary @%s %s; rm -f %s", tmo ?? 20, tf, shq(c.HUB + path), tf));
	let o = null;
	try { o = json(r.out); } catch (e) {}
	if (type(o) != 'object') die('连不上托管服务，稍后再试');
	if (o.error) die(o.error);
	return o;
}
P.hub_pair = function() {
	let o = hub_call('/api/pair/start');
	return { code: o.code, exp: o.exp, url: hub_conf().HUB + '/app?pair=' + o.code };
};
/* 托管服务的到期时间（试用 / 续期）：问官网，缓存 1 小时 */
P.svc_info = function(a) {
	let c = hub_conf(true);
	if (!c) return { hosted: false };
	let cf = '/tmp/cmcp_svc.json', o = cmcp_readj(cf, null);
	if (!o || a?.force || time() - (o.at ?? 0) > 3600) {
		let r = null;
		try { r = hub_call('/api/dev/info'); } catch (e) {}
		if (r) { o = { at: time(), exp: r.exp ?? 0, off: !!r.off, files: !!r.files }; writefile(cf, sprintf('%J', o)); }
	}
	return { hosted: true, hub: c.HUB, exp: o?.exp ?? null, off: !!o?.off, files: !!o?.files };
};
P.svc_renew = function(a) {
	let code = uc(replace('' + (a?.code ?? ''), /[^A-Za-z0-9]/g, ''));
	if (length(code) < 6) die('续期码不对');
	let r = hub_call('/api/dev/renew', { code });
	sh('rm -f /tmp/cmcp_svc.json');
	return { exp: r.exp, days: r.days };
};
P.hub_accounts = function() { return hub_call('/api/dev/accounts').list ?? []; };
P.hub_unbind = function(a) {
	let uid = '' + (a.uid ?? '');
	if (!match(uid, /^[a-z2-9]{12}$/)) die('账号编号不对');
	hub_call('/api/dev/unbind', { uid });
	return { ok: true };
};
/* ---------- 托管版：每台手机第一次打开面板要输一次登录码 ----------
 * 登录码在官网账号里拿（只有绑定了这台路由器的账号才能拿），或者在路由器后台终端运行 cmcp-logincode 拿一个应急的。
 * 输对以后给这台手机发一个「手机钥匙」（存在手机浏览器里），以后每次请求都带上；没有它，光有登录密钥也进不来。
 * AI 连接器用单独的连接器地址（config.json 的 ckey），不用登录码，但打不开面板。 */
const DEV_PATH = ETC + '/devices.json', SEEN_PATH = '/tmp/cmcp_devseen.json', LC_PATH = '/tmp/cmcp_logincode', LCFAIL_PATH = '/tmp/cmcp_lcfail';
// DEV_ID、DEV、ROLE、PERMS 在 00-base.uc 里声明（更早的模块也要用到，比如网站访问检测）
function is_hosted() { return length(trim(readfile(ETC + '/hub.conf') ?? '')) > 0; }
function rand_str(n) { let r = trim(sh(sprintf("tr -dc 'a-z0-9' < /dev/urandom | head -c %d", n)).out); return length(r) == n ? r : null; }
function devs_read() { let d = null; try { d = json(readfile(DEV_PATH) ?? '{}'); } catch (e) {} return type(d) == 'object' ? d : {}; }
/* ---------- 6.0 第 53 项：原版页面（LuCI）的门禁钥匙换新 ----------
 * 面板在手机上打开原版页面靠一把门禁钥匙（luci_key，路由器上 luci-gate 核对）。换登录密钥、移除手机（包括钥匙被复制、
 * 面板锁输错太多被退出）时一起换：旧钥匙马上作废，被移除的手机就算还留着它也打不开原版页面；门禁替手机自动登录的
 * 原版后台会话（luci-gate 记在 /tmp/cmcp_luci_sid）也全部退出。还在用的手机下次打开原版页面会自动拿新钥匙，用户无感。 */
const LUCI_KEY = ETC + '/luci_key', LUCI_SID = '/tmp/cmcp_luci_sid';
function luci_key_new() {
	if (!length(trim(readfile(LUCI_KEY) ?? ''))) return false; // 没装原版页面入口的老安装：不管
	let k = rand_str(32);
	if (!k) return false;
	writefile(LUCI_KEY + '.tmp', k);
	sh('chmod 600 ' + shq(LUCI_KEY + '.tmp'));
	rename(LUCI_KEY + '.tmp', LUCI_KEY);
	for (let sid in split(readfile(LUCI_SID) ?? '', '\n'))
		if (match(sid, /^[0-9a-f]{32}$/)) sh(sprintf("ubus call session destroy '{\"ubus_rpc_session\":\"%s\"}' >/dev/null 2>&1", sid));
	sh('rm -f ' + shq(LUCI_SID));
	return true;
}
function devs_write(d) {
	// 有手机被移除：原版页面的门禁钥匙一起换（换钥匙、改名字这类不算）
	let old = devs_read(), gone = false;
	for (let k in old) if (!d[k]) { gone = true; break; }
	writefile(DEV_PATH + '.tmp', sprintf('%J\n', d)); sh('chmod 600 ' + shq(DEV_PATH + '.tmp')); rename(DEV_PATH + '.tmp', DEV_PATH);
	if (gone) luci_key_new();
}
function seen_read() { let d = null; try { d = json(readfile(SEEN_PATH) ?? '{}'); } catch (e) {} return type(d) == 'object' ? d : {}; }
function dev_ok(cred) {
	if (type(cred) != 'string') return false;
	let m = match(cred, /^([a-z0-9]{8})\.([a-z0-9]{32})$/);
	if (!m) {
		// 路由器自己的小工具（每日报告、一键更新的检查）
		let lm = match(cred, /^local\.([a-z0-9]{32,64})$/);
		return !!lm && lm[1] == CL.local_key();
	}
	let d = devs_read()[m[1]];
	if (type(d) != 'object' || d.s != m[2]) return false;
	DEV_ID = m[1]; DEV = d;
	// 最后使用时间记在内存里（/tmp），不每次写闪存
	let sn = seen_read(), t = time();
	if (t - (sn[m[1]] ?? 0) > 60) { sn[m[1]] = t; writefile(SEEN_PATH, sprintf('%J', sn)); }
	return true;
}
function lc_fails() {
	let t = time(), a = filter(map(split(readfile(LCFAIL_PATH) ?? '', '\n'), (x) => +x), (x) => x > t - 600);
	return a;
}
function lc_fail() { let a = lc_fails(); push(a, time()); writefile(LCFAIL_PATH, join('\n', a) + '\n'); }
P.device_approve = function(a) {
	if (!is_hosted()) die('只有托管版需要登录码');
	if (length(lc_fails()) >= 10) die('登录码输错太多次了，10 分钟后再试');
	let code = uc(replace('' + (a?.code ?? ''), /[^A-Za-z0-9]/g, ''));
	if (!match(code, /^[A-Z2-9]{8}$/)) { lc_fail(); die('登录码是 8 位字母和数字，再检查一下'); }
	let via = null, acct = null;
	// 应急登录码（路由器后台终端运行 cmcp-logincode 拿的）
	let lm = match(readfile(LC_PATH) ?? '', /^([A-Z2-9]{8}) ([0-9]+)/);
	if (lm && lm[1] == code && +lm[2] > time()) { via = '路由器终端的应急登录码'; sh('rm -f ' + LC_PATH); }
	else {
		let c = hub_conf(true);
		if (!c) { lc_fail(); die('登录码不对'); }
		let r = sh(sprintf("curl -s -m 20 -X POST -H 'Content-Type: application/json' --data-binary %s %s",
			shq(sprintf('%J', { sub: c.SUB, rkey: c.RKEY, code })), shq(c.HUB + '/api/dev/logincode')));
		let o = null;
		try { o = json(r.out); } catch (e) {}
		if (type(o) != 'object') die('连不上官网，核对不了登录码。稍后再试；急的话在路由器后台终端运行 cmcp-logincode 拿一个应急登录码');
		if (!o.ok) { lc_fail(); die(o.error ?? '登录码不对'); }
		via = '账号 ' + (o.email ?? '');
		acct = o;
	}
	let id = rand_str(8), sec = rand_str(32);
	if (!id || !sec) die('生成手机钥匙失败，再试一次');
	let d = devs_read();
	// 最多记 30 台，超过了去掉最早的
	let ids = sort(keys(d), (x, y) => (d[x].at ?? 0) - (d[y].at ?? 0));
	while (length(ids) >= 30) delete d[shift(ids)];
	let name = substr(replace('' + (a?.name ?? ''), /[[:cntrl:]<>"]/g, ''), 0, 40) || '手机';
	d[id] = { s: sec, name, at: time(), rot: time(), via };
	if (acct?.uid) { d[id].uid = acct.uid; d[id].sat = acct.now ?? 0; }
	else if (!acct) d[id].emerg = true;
	devs_write(d);
	DEV_ID = id;
	try { sh(sprintf('/usr/sbin/cmcp-notify info login %s %s login', shq('新手机登录了面板：' + name), shq('用' + via + ' 登录。不是你自己的话，马上在面板「我的主页 → 敏感信息 → 登录着的设备」里把它移除（用应急登录码进来的手机在「我的主页 → 敏感信息 → 登录着的设备」）。'))); } catch (e) {}
	return { dev: id + '.' + sec, id, name };
};
/* ---------- 敏感信息（6.0 第 63 项）：登录密钥、AI 连接器地址、平板网址、登录着的手机 ----------
 * 只在「我的主页 → 敏感信息」里给，路由器这边没确认本人就不返回（不靠界面藏起来）。
 * 确认本人的凭证（10 分钟）两种：
 *   · 有官网账号的（托管版从官网打开）：官网发的，邮箱验证码换来的；路由器问一下官网它还有效没有
 *   · 自建版、用应急登录码进来的：路由器自己发的，输对路由器后台（root）密码换来的
 * 凭证只认发给的那台手机（DEV_ID）；路由器重启就全部作废（放在内存 /tmp 里） */
const SUDO_F = '/tmp/cmcp_sudo.json', SUDO_FAIL = '/tmp/cmcp_sudo_fail.json', SUDO_TTL = 600;
function sudo_read() { let m = cmcp_readj(SUDO_F, {}); return type(m) == 'object' ? m : {}; }
function sudo_keep(m, t, exp, kind) {
	let now = time();
	for (let k in keys(m)) if (!(m[k]?.exp > now)) delete m[k];
	m[t] = { exp, dev: DEV_ID ?? '', kind };
	cmcp_writej(SUDO_F, m);
}
function sudo_ok(t) {
	t = '' + (t ?? '');
	if (!match(t, /^[A-Za-z0-9]{20,48}$/)) return false;
	let m = sudo_read(), x = m[t], now = time();
	// 只认这台路由器发出去 / 转交过的凭证，而且只认发给的那台手机
	if (!x || !(x.exp > now) || x.dev != (DEV_ID ?? '')) return false;
	if (x.kind != 'hub') return true;
	// 官网发的凭证：再问一下官网还有效没有（账号被移出、凭证作废了就不认）；连不上官网就不认
	if (!DEV?.uid || !is_hosted()) return false;
	let r = null;
	try { r = hub_call('/api/dev/fam/sudo_ok', { uid: DEV.uid, sudo: t }, 12); } catch (e) { r = null; }
	return !!(r?.ok && +r.exp > now * 1000);
}
// owner = 只有主账号（自建版就是用登录密钥的人）能看：登录密钥、连接器地址、平板网址是整台路由器的钥匙
function need_sudo(a, owner) {
	if (owner && ROLE != 'owner') die('只有主账号能看');
	if (!sudo_ok(a?.sudo)) die('要先确认是你本人：在「我的主页 → 敏感信息」里验证');
}
// 用路由器后台密码确认本人：输错 5 次锁 15 分钟（并推送）；密码交给路由器自己的登录服务（rpcd）核对，路由器不存也不记
// 核对路由器后台（root）密码：交给路由器自己的登录服务（rpcd）核对，不存密码；输错 5 次锁 15 分钟并推送
// what：推送里说是在哪里输错的。对了返回 true，错了直接报错（带还能试几次）
function rootpw_check(pw, what) {
	let now = time(), f = cmcp_readj(SUDO_FAIL, { n: 0, until: 0 });
	if ((f.until ?? 0) > now) die(sprintf('密码输错太多次，%d 分钟后再试', int(((f.until - now) + 59) / 60)));
	pw = '' + (pw ?? '');
	if (!length(pw) || length(pw) > 256) die('请输入路由器后台密码');
	// 没设后台密码的路由器：不能拿空密码当验证（先去原版后台设一个）
	let sh0 = match(readfile(getenv('CMCP_SHADOW') ?? '/etc/shadow') ?? '', /(^|\n)root:([^:\n]*):/);
	if (sh0 && !length(sh0[2])) die('路由器还没设后台密码：先在原版后台「系统 → 管理权」设一个，再回来验证');
	if (!match(sh('ubus list session 2>/dev/null').out, /session/)) compat_die('sudo', '这台路由器没有登录服务（rpcd），验证不了后台密码');
	let tf = trim(sh('mktemp /tmp/cmcp_pw.XXXXXX').out);
	if (!match(tf, /^\/tmp\/cmcp_pw\.[A-Za-z0-9]+$/)) die('路由器上建不了临时文件');
	writefile(tf, sprintf('%J', { username: 'root', password: pw, timeout: 30 }));
	// 临时文件只有 root 能读（mktemp 建的是 600），用完马上删
	let r = sh(sprintf('ubus call session login "$(cat %s)" 2>/dev/null; rm -f %s', tf, tf)).out, sid = null;
	try { sid = json(r)?.ubus_rpc_session; } catch (e) {}
	if (!sid || !match(sid, /^[0-9a-f]{32}$/)) {
		f.n = (f.n ?? 0) + 1;
		if (f.n >= 5) {
			f = { n: 0, until: now + 900 };
			try { sh(sprintf('/usr/sbin/cmcp-notify warn login %s %s login', shq('面板里连续 5 次输错路由器后台密码'), shq((what ?? '「我的主页 → 敏感信息」的验证') + '锁了 15 分钟。不是你自己输的话，说明有人拿到了这台手机或者登录地址，换一下登录密钥和路由器后台密码'))); } catch (e) {}
		}
		cmcp_writej(SUDO_FAIL, f);
		die(f.until > now ? '密码输错太多次，15 分钟后再试' : sprintf('密码不对（还能再试 %d 次）', 5 - f.n));
	}
	sh(sprintf('ubus call session destroy %s >/dev/null 2>&1', shq(sprintf('{"ubus_rpc_session":"%s"}', sid))));
	sh('rm -f ' + SUDO_FAIL);
	return true;
}
P.sudo_local = function(a) {
	rootpw_check(a?.pw);
	let now = time(), t = rand_str(24);
	if (!t) die('生成凭证失败，再试一次');
	sudo_keep(sudo_read(), t, now + SUDO_TTL, 'local');
	return { sudo: t, exp: (now + SUDO_TTL) * 1000 };
};
// 「现在锁上」：作废这台手机的凭证（只能作废自己的）
P.sudo_drop = function(a) {
	let m = sudo_read(), t = '' + (a?.sudo ?? '');
	if (m[t] && m[t].dev == (DEV_ID ?? '')) { delete m[t]; cmcp_writej(SUDO_F, m); }
	return { ok: true };
};
// 平板（证人）每分钟要访问的网址：带着平板的钥匙，只在敏感信息里给
P.tablet_url = function(a) {
	need_sudo(a, true);
	let c = {};
	for (let l in split(readfile('/etc/claude-mcp/cloud.conf') ?? '', '\n')) { let m = match(l, /^([A-Z]+)=(.*)$/); if (m) c[m[1]] = m[2]; }
	if (!c.URL || !c.TKEY) return { url: null };
	return { url: c.URL + '/beat/t/' + c.TKEY };
};
P.device_list = function(a) {
	need_sudo(a);
	let d = devs_read(), sn = seen_read(), list = [];
	// 子账号只看得到自己登录的手机
	for (let id in d) if (ROLE != 'sub' || (DEV?.uid && d[id].uid == DEV.uid)) push(list, { id, name: d[id].name, at: d[id].at, via: d[id].via, seen: sn[id] ?? null, me: id == DEV_ID });
	list = sort(list, (x, y) => ((y.me ? 1 : 0) - (x.me ? 1 : 0)) || ((y.seen ?? y.at) - (x.seen ?? x.at)));
	return { hosted: is_hosted(), list };
};
P.device_remove = function(a) {
	// 退出自己这台（「退出登录」）不用确认；移除别的手机要先确认本人
	if (!a?.self) need_sudo(a);
	let d = devs_read(), id = a?.self ? (DEV_ID ?? '') : '' + (a?.id ?? '');
	if (ROLE == 'sub') {
		// 子账号只能退出自己的手机
		if (a?.all_others) { for (let k in keys(d)) if (k != DEV_ID && d[k].uid == DEV?.uid) delete d[k]; devs_write(d); return { ok: true }; }
		if (!d[id] || d[id].uid != DEV?.uid) die('没有这台手机');
	}
	if (a?.all_others) { for (let k in keys(d)) if (k != DEV_ID) delete d[k]; devs_write(d); return { ok: true }; }
	if (!d[id]) die('没有这台手机');
	delete d[id];
	devs_write(d);
	return { ok: true, me: id == DEV_ID };
};
/* ---------- 5.2 主账号 / 子账号 ----------
 * 一台路由器一个主账号（权限最大），最多 10 个子账号（家人），子账号能做什么由主账号在官网或面板里勾选。
 * 手机都从官网「我的路由器 → 打开面板」进来：官网发一张 2 分钟、只能用一次的票，路由器拿票去官网问「这是谁、什么身份」，再发手机钥匙。
 * 每个请求都按这台手机属于哪个账号检查权限；谁是主账号、子账号有什么权限，从官网拿，在内存里缓存 30 秒（连不上官网时用上一次的）。 */
const FAM_PATH = '/tmp/cmcp_fam.json', FAM_LOCK = '/tmp/cmcp_fam.lock', FAM_STALE = 6 * 3600;
const EMERG_VIA = '路由器终端的应急登录码';
// 子账号的权限分组：view 人人都有；其他的由主账号勾选；不在任何一组里的（终端、文件管理、备份、托管服务设置、手机管理、换密钥……）只有主账号能用
const FAM_GROUPS = {
	view: ['compat_info', 'overview', 'groups', 'live', 'home_stats', 'devices', 'connections', 'oc_state', 'sub_info', 'jobs', 'myip', 'site_check', 'providers', 'rules', 'dashboard_state', 'logs', 'wd', 'traffic', 'speed_last', 'px', 'px_nodes', 'pause_list', 'black_state', 'dev_imgs', 'wifi_get', 'net_pending', 'push_id', 'notices', 'notices_seen', 'client_error', 'svc_info', 'update_check', 'update_status', 'wd_check', 'daily', 'whoami', 'fam', 'device_list', 'device_remove',
		'tools:router_status', 'tools:list_proxy_groups', 'tools:list_connections', 'tools:list_rules', 'tools:net_speed', 'tools:device_list'],
	msg: ['chat', 'feedback', 'fb_replies', 'fb_seen', 'feedback_diag'],
	node: ['px_set', 'node_check', 'px_delay', 'tools:switch_proxy', 'tools:test_delay', 'tools:close_connections'],
	speed: ['speedtest'],
	parent: ['pause_set', 'black_setup', 'black_set', 'dev_rename', 'dev_forget'],
	proxy: ['oc_set', 'oc_sec', 'sub_update', 'files', 'file_read', 'file_save', 'file_delete', 'file_rename', 'cfg_switch', 'versions', 'unlock', 'provider_update', 'backup', 'oc_schema', 'oc_button', 'set_mode', 'run_mode', 'age', 'backup_file', 'file_download', 'oc_reset', 'core_ps', 'oc_sections', 'oc_move', 'px_ctl', 'px_switch', 'autosw', 'quick', 'dashboard',
		'tools:set_mode', 'tools:restart_openclash', 'tools:openclash_log', 'tools:get_logs'],
	// 安全加固（第二轮）：「完全控制」——能在路由器上以 root 运行任何东西的都在这组：原版后台、恢复备份（会换掉内核和脚本）、下载覆写模块；
	// 另外写 OpenClash 自定义脚本 / 覆写文件、改覆写模块的设置，也按这组算（见 fam_group）
	net: ['guest_get', 'guest_set', 'wifi_key', 'wifi_set', 'net_confirm', 'net_revert', 'luci_menu', 'luci_key', 'luci_full', 'restore', 'overwrite_fetch', 'ai_asks', 'ai_answer', 'ai_mode'],
	sys: ['compat_set', 'beta_set', 'update_start', 'auto', 'ban_del', 'slog', 'procs', 'kill', 'diag', 'wd_clear',
		'tools:system_info', 'tools:network_info', 'tools:firewall_overview', 'tools:list_services', 'tools:system_log', 'tools:service_control', 'tools:reboot_router']
};
function fam_group(m, p) {
	// 同一个接口，写的东西不同、风险不同：自定义脚本（.sh 等，OpenClash 以 root 运行）、覆写文件、覆写模块设置，算「完全控制」；两份自定义规则照旧算「代理设置」
	if (m == 'file_save' && (p?.kind == 'overwrite' || (p?.kind == 'custom' && p?.name != 'openclash_custom_rules.list' && p?.name != 'openclash_custom_rules_2.list'))) return 'net';
	if (m == 'oc_sec' && (p?.type == 'config_overwrite' || (p?.sid && ucur().get('openclash', '' + p.sid) == 'config_overwrite'))) return 'net';
	for (let g in FAM_GROUPS) if (index(FAM_GROUPS[g], m) >= 0) return g;
	return null;
}
function fam_read() {
	let st = stat(FAM_PATH), o = null;
	if (!st) return null;
	try { o = json(readfile(FAM_PATH) ?? 'null'); } catch (e) {}
	if (type(o) != 'object' || !o.ok) return null;
	o.age = time() - st.mtime;
	return o;
}
// 从官网拿最新的成员和权限；wait=false 时在后台拿（这次先用缓存）
function fam_fetch(wait) {
	let c = hub_conf(true);
	if (!c) return;
	let lk = stat(FAM_LOCK);
	if (lk && time() - lk.mtime < 20) { if (!wait) return; }
	else { sh('rm -rf ' + FAM_LOCK); if (!mkdir(FAM_LOCK)) { if (!wait) return; } }
	let body = shq(sprintf('%J', { sub: c.SUB, rkey: c.RKEY }));
	let cmd = sprintf("curl -s -m 8 -X POST -H 'Content-Type: application/json' --data-binary %s %s -o %s.tmp; grep -q '\"ok\":true' %s.tmp && mv %s.tmp %s; rm -f %s.tmp; rm -rf %s",
		body, shq(c.HUB + '/api/dev/fam/view'), FAM_PATH, FAM_PATH, FAM_PATH, FAM_PATH, FAM_PATH, FAM_LOCK);
	if (wait) sh(cmd); else sh('(' + cmd + ') >/dev/null 2>&1 </dev/null &');
}
function fam_view() {
	let v = fam_read();
	if (v && v.age < 30) return v;
	if (v && v.age < 600) { fam_fetch(false); return v; }
	fam_fetch(true);
	return fam_read() ?? v;
}
function fam_drop_dev(msg) { let d = devs_read(); if (DEV_ID && d[DEV_ID]) { delete d[DEV_ID]; devs_write(d); } DEV = null; DEV_ID = null; return msg; }
// 算出这台手机现在的身份。返回 null 表示可以继续；返回字符串表示不让进（原因）
function fam_check() {
	ROLE = 'owner'; PERMS = [];
	if (!DEV) return null; // 路由器自己的小工具
	if (DEV.emerg || (!DEV.uid && DEV.via == EMERG_VIA)) return null; // 在路由器终端拿应急登录码进来的：能碰到路由器的人，按主账号算
	if (!DEV.uid) return fam_drop_dev('面板升级到 5.2 了：每台手机要从官网「我的路由器」点「打开面板」重新进一次');
	let v = fam_view();
	// 安全加固（第二轮）：连不上官网时，子账号最多按 6 小时内的成员名单用原来的权限；再久就只能看（主账号不受影响）。
	// 不然主账号在官网移除了某个家人，而路由器一直连不上官网，这个人就一直能用
	if (!v) { ROLE = DEV.role ?? 'sub'; PERMS = time() - (DEV.at ?? 0) < FAM_STALE ? (DEV.perms ?? []) : []; return null; } // 连不上官网，也没有缓存：按登录时的身份
	let k = v.kick?.[DEV.uid];
	if (k && (DEV.sat ?? 0) <= k) return fam_drop_dev('这个账号在别处被要求退出所有设备了：从官网「我的路由器」重新打开面板');
	if (v.owner == DEV.uid) return null;
	let s = v.subs?.[DEV.uid];
	if (type(s) == 'object') {
		if (!s.ok) return '主账号暂时停用了你在这台路由器上的权限，或者使用期限到了';
		ROLE = 'sub'; PERMS = (v.age ?? 0) < FAM_STALE ? (s.perms ?? []) : [];
		return null;
	}
	if (v.pick) { ROLE = 'sub'; PERMS = []; return null; } // 老路由器还没选主账号：先只能看
	return fam_drop_dev('你已经不是这台路由器的成员了');
}
function fam_allowed(m, p) {
	if (ROLE != 'sub') return true;
	let g = fam_group(m, p);
	return g == 'view' || (g != null && index(PERMS, g) >= 0);
}
const PERM_NAMES = { msg: '反馈和联系开发者', node: '切换节点', speed: '测速', parent: '家长控制', proxy: '代理设置', net: '完全控制', sys: '系统操作' };
function fam_deny_msg(m, p) { let g = fam_group(m, p); return g && PERM_NAMES[g] ? '主账号没有给你开「' + PERM_NAMES[g] + '」权限' : '只有主账号能用这个功能'; }

// 官网「打开面板」：拿票换手机钥匙（这个请求走 /cgi-bin/mcp/open，不需要登录密钥）
// 安全加固（第二轮）：打开面板用的票是官网发的 24 位随机串、2 分钟内有效、只能用一次，猜不出来，不用锁；
// 以前坏票跟登录码共用一把锁，谁都能发 10 次坏票，让全家 10 分钟打不开面板（路由器拿不到访问者的真实 IP，没法按 IP 锁）
P.open_login = function(a) {
	if (!is_hosted()) die('这台路由器没有用托管服务');
	let t = '' + (a?.ticket ?? '');
	if (!match(t, /^[a-z2-9]{24}$/)) die('链接不完整：回到官网「我的路由器」重新点「打开面板」');
	let c = hub_conf(true);
	let r = sh(sprintf("curl -s -m 20 -X POST -H 'Content-Type: application/json' --data-binary %s %s",
		shq(sprintf('%J', { sub: c.SUB, rkey: c.RKEY, ticket: t })), shq(c.HUB + '/api/dev/ticket')));
	let o = null;
	try { o = json(r.out); } catch (e) {}
	if (type(o) != 'object') die('连不上官网，稍后再试；急的话在路由器后台终端运行 cmcp-logincode 拿一个应急登录码');
	if (!o.ok || !match('' + o.uid, /^[a-z2-9]{12}$/)) die(o.error ?? '这个链接用不了了：回到官网重新点「打开面板」');
	let id = rand_str(8), sec = rand_str(32);
	if (!id || !sec) die('生成手机钥匙失败，再试一次');
	let d = devs_read();
	// 这台手机以前从官网打开过（同一个账号）：换掉旧的那条，不算新手机
	let om = match('' + (a?.old ?? ''), /^([a-z0-9]{8})\.([a-z0-9]{32})$/), again = false;
	if (om && type(d[om[1]]) == 'object' && d[om[1]].s == om[2] && d[om[1]].uid == o.uid) { delete d[om[1]]; again = true; }
	let ids = sort(keys(d), (x, y) => (d[x].at ?? 0) - (d[y].at ?? 0));
	while (length(ids) >= 30) delete d[shift(ids)];
	let name = substr(replace('' + (a?.name ?? ''), /[[:cntrl:]<>"]/g, ''), 0, 40) || '手机';
	let who = substr(replace('' + (o.name ?? ''), /[[:cntrl:]<>"]/g, ''), 0, 40);
	d[id] = { s: sec, name, at: time(), rot: time(), via: '官网账号 ' + (o.email ?? ''), uid: o.uid, sat: +(o.now ?? 0), role: o.role == 'main' ? 'owner' : 'sub', perms: type(o.perms) == 'array' ? o.perms : [] };
	devs_write(d);
	DEV_ID = id;
	sh('rm -f ' + FAM_PATH); // 成员可能刚变过，下个请求重新拿
	if (!again) try { sh(sprintf('/usr/sbin/cmcp-notify info login %s %s login', shq('新手机打开了面板：' + name), shq((who ? who + '（' + (o.email ?? '') + '）' : '账号 ' + (o.email ?? '')) + (o.role == 'main' ? '' : '，子账号') + '从官网打开了面板。不是你们家的人的话，马上在面板「我的主页 → 敏感信息 → 登录着的设备」里把它移除。'))); } catch (e) {}
	return { dev: id + '.' + sec, id, name }; // 6.0 起不再把登录密钥给手机（第 6 项）
};
// 我是谁：面板「我的主页」用
P.whoami = function() {
	let h = hub_conf(true);
	// ai：装的是不是 AI 版（有没有 AI 连接器）；连接器地址本身只在敏感信息里给
	return { hosted: !!h, hub: h?.HUB ?? null, ai: conf().ai !== false, role: ROLE, perms: ROLE == 'sub' ? PERMS : keys(PERM_NAMES), uid: DEV?.uid ?? null, emerg: !!DEV?.emerg, dev: DEV_ID, devName: DEV?.name ?? null,
		// 6.0：自建版是否开了「登录要输路由器密码」；这台手机在路由器上有没有面板锁
		login_pw: !h && trim(readfile(ETC + '/login_pw') ?? '') == '1', lock: DEV?.lk ? { on: true, len: DEV.lk.len, salt: DEV.lk.salt } : { on: false } };
};
// 家人管理、确认本人：转给官网（账号编号由路由器按这台手机填，手机自己填的不算）
const FAM_OPS = { me: 0, page: 0, profile: 0, log: 0, leave: 0, members: 0, sudo_code: 0, sudo: 0, secret: 0, sess_out: 0, join_create: 1, join_cancel: 1, sub_set: 1, sub_remove: 1, transfer: 1 };
P.fam = function(a) {
	let op = '' + (a?.op ?? '');
	if (!exists(FAM_OPS, op)) die('不支持的操作');
	if (!DEV?.uid) die(DEV?.emerg ? '用应急登录码进来的手机不能管理家人：从官网打开面板再操作' : '先从官网打开面板');
	if (FAM_OPS[op] && ROLE != 'owner') die('只有主账号能管理家人');
	let x = { uid: DEV.uid };
	for (let k in ['sudo', 'code', 'name', 'perms', 'subExp', 'target', 'off', 'avatar', 'id', 'all', 'want']) if (exists(a, k)) x[k] = a[k];
	let r = hub_call('/api/dev/fam/' + op, x);
	// 官网发的确认凭证：记下是发给这台手机的（别的手机拿去用不行），10 分钟内有效
	if (op == 'sudo' && match('' + (r?.sudo ?? ''), /^[a-z2-9]{24}$/)) sudo_keep(sudo_read(), r.sudo, min(time() + SUDO_TTL, int((+r.exp || 0) / 1000) || time() + SUDO_TTL), 'hub');
	if (FAM_OPS[op] || op == 'leave') sh('rm -f ' + FAM_PATH);
	if (op == 'leave') { let d = devs_read(); for (let k in keys(d)) if (d[k].uid == DEV.uid) delete d[k]; devs_write(d); }
	if (op == 'members' && ROLE == 'sub') { r.subs = filter(r.subs ?? [], (y) => y.uid == DEV.uid); r.joins = []; }
	// 「我的主页」一次拿全：子账号同样只看得到自己
	if (op == 'page' && ROLE == 'sub' && type(r.members) == 'object') { r.members.subs = filter(r.members.subs ?? [], (y) => y.uid == DEV.uid); r.members.joins = []; }
	return r;
};

/* AI 连接器地址：只给 AI 用，打不开面板（托管版的面板要登录码，连接器不用） */
function ckey_get(make) {
	let c = json(readfile(CONF_PATH) ?? '{}') ?? {};
	if (length(c.ckey ?? '') >= 16 || !make) return c.ckey ?? null;
	c.ckey = rand_str(40);
	if (!c.ckey) die('生成连接器地址失败，再试一次');
	writefile(CONF_PATH + '.tmp', sprintf('%.J\n', c));
	rename(CONF_PATH + '.tmp', CONF_PATH);
	CONF = null;
	return c.ckey;
}
function ckey_url(k) { let h = trim(readfile('/etc/claude-mcp/hostname') ?? ''); return length(h) ? 'https://' + h + '/cgi-bin/mcp/' + k : null; }
P.ckey_info = function(a) {
	if (conf().ai === false) return { ai: false };
	need_sudo(a, true);
	let k = ckey_get(true);
	return { ai: true, url: ckey_url(k), hosted: is_hosted() };
};
P.ckey_rotate = function(a) {
	if (a?.confirm != 'CKEY') die('需要确认');
	need_sudo(a, true);
	if (conf().ai === false) die('纯面板版没有 AI 连接器');
	let c = json(readfile(CONF_PATH) ?? '{}') ?? {};
	c.ckey = rand_str(40);
	if (!c.ckey) die('生成连接器地址失败，再试一次');
	writefile(CONF_PATH + '.tmp', sprintf('%.J\n', c));
	rename(CONF_PATH + '.tmp', CONF_PATH);
	CONF = null;
	try { sh(sprintf('/usr/sbin/cmcp-notify info key %s %s key', shq('AI 连接器地址已更换'), shq('旧的连接器地址已经作废，在 AI 应用里把连接器换成新地址。'))); } catch (e) {}
	return { url: ckey_url(c.ckey) };
};
/* ---------- 一键更新：查最新版本、开始更新、看进度（真正的更新由 cmcp-update 在后台做） ---------- */
function ver_info() {
	let v = readfile('/etc/claude-mcp/version') ?? '', o = {};
	for (let l in split(v, '\n')) { let m = match(l, /^([A-Z]+)=(.*)$/); if (m) o[m[1]] = m[2]; }
	return { cur: o.VER ?? '', code: o.CODE ?? '' };
}
// 版本号比大小：1.3.10 > 1.3.9
function ver_newer(a, b) {
	let x = map(split(replace(a ?? '', /^v/, ''), '.'), (n) => +n || 0), y = map(split(replace(b ?? '', /^v/, ''), '.'), (n) => +n || 0);
	for (let i = 0; i < 3; i++) if ((x[i] ?? 0) != (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
	return false;
}

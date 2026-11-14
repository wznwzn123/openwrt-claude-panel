P.bk_list = function() {
	let c = bk_cloud(), r = sh(sprintf('curl -s -m 20 %s', shq(c.URL + '/bk/' + c.RKEY))), j = null;
	try { j = json(r.out); } catch (e) {}
	if (!j?.ok) die('连不上云端备份' + (j?.error ? '：' + j.error : ''));
	let cron = sh("grep -q cmcp-backup /etc/crontabs/root 2>/dev/null").code == 0;
	let ssl = sh('command -v openssl >/dev/null 2>&1').code == 0, srun = !!stat(SSL_RUN);
	return { list: j.list, max: j.max, auto: cron, running: !!stat('/tmp/cmcp_bk.lock'), ssl, noenc: !!stat(BK_NOENC), ssl_run: srun, ssl_err: !ssl && !srun && stat(SSL_LOG) ? substr(trim(readfile(SSL_LOG) ?? ''), -200) : null };
};
// 开启备份加密：用户在云端备份页点了才装 openssl-util（不会自己装）；闪存剩不到 4MB 不装
// 在后台装（软件源慢的话超过一分多钟，经 Cloudflare 的请求会被断开），面板隔几秒看一次 bk_list 的 ssl / ssl_run / ssl_err
P.bk_ssl = function() {
	if (sh('command -v openssl >/dev/null 2>&1').code == 0) return { ok: true, already: true };
	if (stat(SSL_RUN)) return { ok: true, running: true };
	// 分区名很长时 BusyBox df 会换行：把数据行拼起来、从后往前数取「可用」（KB）
	let free = +trim(sh("{ df -k /overlay 2>/dev/null || df -k /; } | awk 'NR > 1 { l = l \" \" $0 } END { n = split(l, f, \" \"); if (n >= 6) print f[n - 2] }'").out);
	if (free > 0 && free < 4096) die(sprintf('闪存只剩 %d KB，装加密工具至少要 4 MB，先清理一下空间', free));
	sh(sprintf("( touch %s; if command -v opkg >/dev/null 2>&1; then opkg update >/dev/null 2>&1; opkg install openssl-util; elif command -v apk >/dev/null 2>&1; then apk update >/dev/null 2>&1; apk add openssl-util; else echo 没有软件包管理器; fi; rm -f %s ) >%s 2>&1 </dev/null &", SSL_RUN, SSL_RUN, SSL_LOG));
	return { ok: true, running: true };
};
// 「加密上传」开关：关 = 留一个标记文件，备份时不加密（密钥不删，以前加密的照样能还原）；
// 开 = 删掉标记；没有 openssl 的话顺便开始装（跟以前的「开启加密」按钮一样）
P.bk_enc = function(a) {
	if (a?.on) {
		if (stat(BK_NOENC)) sh('rm -f ' + BK_NOENC);
		return P.bk_ssl();
	}
	writefile(BK_NOENC, sprintf('%d\n', time()));
	return { ok: true, off: true };
};
P.bk_now = function() {
	let r = sh('/usr/sbin/cmcp-backup manual 2>&1');
	let j = null; try { j = json(trim(r.out)); } catch (e) {}
	if (r.code != 0 || !j?.ok) die(trim(r.out) || '备份失败');
	return j;
};
P.bk_del = function(a) {
	let c = bk_cloud(), id = bk_id(a);
	let r = sh(sprintf('curl -s -m 20 -X DELETE %s', shq(c.URL + '/bk/' + c.RKEY + '/' + id))), j = null;
	try { j = json(r.out); } catch (e) {}
	if (!j?.ok) die('删除失败');
	return { ok: true };
};
P.bk_dl = function(a) {
	let id = bk_id(a), f = bk_fetch(id);
	return dl_put(f, (match('' + (a.name ?? ''), /^[A-Za-z0-9_.-]{1,60}$/) ? a.name : 'router-backup-' + id) + '.tar.gz');
};
// 还原：先下载并检查，确认没问题才动手；还原 = sysupgrade -r（和 LuCI「恢复备份」一样），然后重启
P.bk_restore = function(a) {
	let id = bk_id(a), f = bk_fetch(id), keep = '/tmp/cmcp_restore.tgz';
	sh('mv -f ' + f + ' ' + keep);
	// 动手前先把现在的设置也存一份（目标备份已经下载到本地，不怕被挤掉）
	let pre = sh('/usr/sbin/cmcp-backup manual 2>&1');
	if (pre.code != 0 && !a.force) { sh('rm -f ' + keep); die('还原前备份当前设置失败：' + trim(pre.out)); }
	sh('( sleep 3; /usr/sbin/cmcp-watchdog shutdown; sysupgrade -r ' + keep + ' && sync && reboot ) >/dev/null 2>&1 </dev/null &');
	return { ok: true };
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
	for (let f in ['/etc/claude-mcp/hub.conf', '/etc/claude-mcp/cloud.conf'])
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
		if (r) { o = { at: time(), exp: r.exp ?? 0, off: !!r.off }; writefile(cf, sprintf('%J', o)); }
	}
	return { hosted: true, hub: c.HUB, exp: o?.exp ?? null, off: !!o?.off };
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
 * Claude 连接器用单独的连接器地址（config.json 的 ckey），不用登录码，但打不开面板。 */
const ETC = replace(CONF_PATH, /\/[^\/]*$/, ''); // 一般是 /etc/claude-mcp（测试时可以换目录）
const DEV_PATH = ETC + '/devices.json', SEEN_PATH = '/tmp/cmcp_devseen.json', LC_PATH = '/tmp/cmcp_logincode', LCFAIL_PATH = '/tmp/cmcp_lcfail';
let DEV_ID = null;
function is_hosted() { return length(trim(readfile(ETC + '/hub.conf') ?? '')) > 0; }
function rand_str(n) { let r = trim(sh(sprintf("tr -dc 'a-z0-9' < /dev/urandom | head -c %d", n)).out); return length(r) == n ? r : null; }
function devs_read() { let d = null; try { d = json(readfile(DEV_PATH) ?? '{}'); } catch (e) {} return type(d) == 'object' ? d : {}; }
function devs_write(d) { writefile(DEV_PATH + '.tmp', sprintf('%J\n', d)); sh('chmod 600 ' + shq(DEV_PATH + '.tmp')); rename(DEV_PATH + '.tmp', DEV_PATH); }
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
	DEV_ID = m[1];
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
	let via = null;
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
	}
	let id = rand_str(8), sec = rand_str(32);
	if (!id || !sec) die('生成手机钥匙失败，再试一次');
	let d = devs_read();
	// 最多记 30 台，超过了去掉最早的
	let ids = sort(keys(d), (x, y) => (d[x].at ?? 0) - (d[y].at ?? 0));
	while (length(ids) >= 30) delete d[shift(ids)];
	let name = substr(replace('' + (a?.name ?? ''), /[[:cntrl:]<>"]/g, ''), 0, 40) || '手机';
	d[id] = { s: sec, name, at: time(), via };
	devs_write(d);
	DEV_ID = id;
	try { sh(sprintf('/usr/sbin/cmcp-notify info login %s %s login', shq('新手机登录了面板：' + name), shq('用' + via + ' 登录。不是你自己的话，马上在面板「系统操作 → 已登录的手机」里把它移除。'))); } catch (e) {}
	return { dev: id + '.' + sec, id, name };
};
P.device_list = function() {
	let d = devs_read(), sn = seen_read(), list = [];
	for (let id in d) push(list, { id, name: d[id].name, at: d[id].at, via: d[id].via, seen: sn[id] ?? null, me: id == DEV_ID });
	list = sort(list, (x, y) => ((y.me ? 1 : 0) - (x.me ? 1 : 0)) || ((y.seen ?? y.at) - (x.seen ?? x.at)));
	return { hosted: is_hosted(), list };
};
P.device_remove = function(a) {
	let d = devs_read(), id = a?.self ? (DEV_ID ?? '') : '' + (a?.id ?? '');
	if (a?.all_others) { for (let k in keys(d)) if (k != DEV_ID) delete d[k]; devs_write(d); return { ok: true }; }
	if (!d[id]) die('没有这台手机');
	delete d[id];
	devs_write(d);
	return { ok: true, me: id == DEV_ID };
};
/* Claude 连接器地址：只给 AI 用，打不开面板（托管版的面板要登录码，连接器不用） */
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
P.ckey_info = function() {
	if (conf().ai === false) return { ai: false };
	let k = ckey_get(true);
	return { ai: true, url: ckey_url(k), hosted: is_hosted() };
};
P.ckey_rotate = function(a) {
	if (a?.confirm != 'CKEY') die('需要确认');
	if (conf().ai === false) die('纯面板版没有 Claude 连接器');
	let c = json(readfile(CONF_PATH) ?? '{}') ?? {};
	c.ckey = rand_str(40);
	if (!c.ckey) die('生成连接器地址失败，再试一次');
	writefile(CONF_PATH + '.tmp', sprintf('%.J\n', c));
	rename(CONF_PATH + '.tmp', CONF_PATH);
	CONF = null;
	try { sh(sprintf('/usr/sbin/cmcp-notify info key %s %s key', shq('Claude 连接器地址已更换'), shq('旧的连接器地址已经作废，在 Claude 里把连接器换成新地址。'))); } catch (e) {}
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

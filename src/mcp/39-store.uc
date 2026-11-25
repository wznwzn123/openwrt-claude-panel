
/* ---------------- 6.0 第 19 项：软件中心（搜索、安装、更新） ----------------
 * 自动识别路由器上的软件源和应用商店（用户 11/26：所有软件包和应用商店都要适配）：
 *   opkg：/etc/opkg.conf 和 /etc/opkg/*.conf 里所有 src 行（distfeeds = 固件自带，其他 = 第三方，比如 customfeeds）；
 *   apk：/etc/apk/repositories 和 /etc/apk/repositories.d/*.list；
 *   iStore（luci-app-store 的 is-opkg）：它自己的软件源在 /tmp/is-root/etc/opkg、列表在 /tmp/is-root/tmp/opkg-lists，装和更新用 is-opkg。
 * 每个包标出来自哪里（第三方的、iStore 的在面板里标出来，装之前确认框里也写）。卸载在「应用管理」（第 83 项）。
 * 装之前算空间：要装的包和还没装的依赖加起来，闪存不够就不装。
 * 更新软件源、安装、更新都在后台跑（要几十秒），面板每 2 秒问一次进度；同一时间只跑一个。
 * 系统组件（APP_CORE）不在这里更新：一个个升级系统组件可能把路由器弄坏，要升级固件。
 * 测试用环境变量：CMCP_APPS_ROOT / CMCP_APPS_PM（同应用管理）、CMCP_STORE_DIR（状态目录）、CMCP_STORE_RUN（命令只记下来）、
 *   CMCP_STORE_FREE（剩余空间 KB）、CMCP_STORE_APKLIST（apk list 的输出）、CMCP_STORE_ISTORE（1 = 当成装了 iStore） */
const ST_DIR = getenv('CMCP_STORE_DIR') || '/tmp/cmcp_store', IS_ROOT = APP_ROOT + '/tmp/is-root';
function st_src_lines(f, kind, out) {
	for (let l in split(readfile(f) ?? '', '\n')) { let m = match(l, /^src(\/gz)?[ \t]+([^ \t]+)[ \t]+([^ \t]+)/); if (m) push(out, { name: m[2], url: m[3], kind }); }
}
function st_conf_files(dir) { return sort(filter(require('fs').lsdir(dir) ?? [], (x) => match(x, /\.conf$/))); }
function st_istore() {
	let e = getenv('CMCP_STORE_ISTORE');
	if (e != null) return e == '1';
	return length(trim(sh('command -v is-opkg').out)) > 0;
}
function st_feeds(pm) {
	let f = [];
	if (pm == 'opkg') {
		st_src_lines(APP_ROOT + '/etc/opkg.conf', 'custom', f);
		let D = APP_ROOT + '/etc/opkg';
		if (stat(D + '/distfeeds.conf')) st_src_lines(D + '/distfeeds.conf', 'dist', f);
		for (let c in st_conf_files(D)) if (c != 'distfeeds.conf') st_src_lines(D + '/' + c, 'custom', f);
		if (st_istore()) for (let c in st_conf_files(IS_ROOT + '/etc/opkg')) {
			let g = []; st_src_lines(IS_ROOT + '/etc/opkg/' + c, 'istore', g);
			// iStore 把系统的软件源也拷了一份过去，那些不算 iStore 的
			for (let x in g) { let dup = false; for (let y in f) if (y.url == x.url) dup = true; if (!dup) push(f, x); }
		}
	} else {
		let add = (file, kind) => { for (let l in split(readfile(file) ?? '', '\n')) { l = trim(l); if (length(l) && substr(l, 0, 1) != '#') push(f, { name: replace(replace(l, /\/packages\.adb$/, ''), /^.*\/([^\/]+)$/, '$1'), url: l, kind }); } };
		add(APP_ROOT + '/etc/apk/repositories', 'custom');
		for (let c in sort(filter(require('fs').lsdir(APP_ROOT + '/etc/apk/repositories.d') ?? [], (x) => match(x, /\.list$/)))) add(APP_ROOT + '/etc/apk/repositories.d/' + c, c == 'distfeeds.list' ? 'dist' : 'custom');
	}
	return f;
}
function st_lists_dir() {
	let m = match(readfile(APP_ROOT + '/etc/opkg.conf') ?? '', /lists_dir[ \t]+[^ \t]+[ \t]+([^ \t\n]+)/);
	return m ? m[1] : '/var/opkg-lists';
}
// 软件源里有哪些包：{ name: { ver, size, isize, desc, deps, feed, kind } }；同一个包在几个源里都有时，固件自带的优先，其次第三方，最后 iStore
// age：软件源多久没更新（秒，null = 还没更新过）
function st_index(pm) {
	let idx = {}, age = null;
	if (pm == 'opkg') {
		let sys = APP_ROOT + st_lists_dir();
		for (let kind in ['dist', 'custom', 'istore']) for (let f in st_feeds(pm)) {
			if (f.kind != kind) continue;
			let file = (kind == 'istore' ? IS_ROOT + '/tmp/opkg-lists' : sys) + '/' + f.name, st = stat(file);
			if (!st) continue;
			let a = time() - st.mtime; if (age == null || a > age) age = a;
			for (let b in split(readfile(file) ?? '', /\n\n+/)) {
				let k = app_kv(b, ':'), n = k.Package;
				if (!n || idx[n]) continue;
				idx[n] = { ver: k.Version ?? '', size: +(k.Size ?? 0) || 0, isize: +(k['Installed-Size'] ?? 0) || 0, desc: split(k.Description ?? '', '\n')[0], deps: app_dep_names(k.Depends), feed: f.name, kind };
			}
		}
	} else {
		let o = getenv('CMCP_STORE_APKLIST') ? readfile(getenv('CMCP_STORE_APKLIST')) ?? '' : sh('apk list --available 2>/dev/null').out;
		for (let l in split(o, '\n')) {
			let m = match(l, /^([A-Za-z0-9_.+-]+)-([0-9][^ ]*-r[0-9]+) /);
			if (m && !idx[m[1]]) idx[m[1]] = { ver: m[2], size: 0, isize: 0, desc: '', deps: [], feed: null, kind: 'dist' };
		}
		let t = +trim(readfile(ST_DIR + '/apk_at') ?? '');
		age = t ? time() - t : (length(keys(idx)) ? 0 : null);
	}
	return { idx, age };
}
function st_free() { let f = getenv('CMCP_STORE_FREE'); if (f) return +f; let m = match(sh('df -k /overlay 2>/dev/null | awk \'NR==2 { print $4 }\'').out, /([0-9]+)/); return m ? +m[1] : null; }
function st_state() {
	let s = cmcp_readj(ST_DIR + '/state', null);
	if (type(s) != 'object') return null;
	// 后台任务没了（路由器重启、被杀）但状态还是「进行中」：当成失败
	let rc = trim(readfile(ST_DIR + '/rc') ?? '');
	if (s.st == 'run' && length(rc)) s.st = rc == '0' ? 'ok' : 'fail';
	else if (s.st == 'run' && !getenv('CMCP_STORE_RUN') && time() - (s.at ?? 0) > 10 && (!stat(ST_DIR + '/pid') || !stat('/proc/' + trim(readfile(ST_DIR + '/pid') ?? 'x')))) { s.st = 'fail'; s.msg = '没做完就停了'; }
	s.log = substr(trim(readfile(ST_DIR + '/log') ?? ''), -1500);
	return s;
}
function st_busy() { let s = st_state(); if (s && s.st == 'run') die('正在' + (s.what ?? '处理') + '，等它做完'); }
// 后台跑：先写状态，跑完写结果；测试时只把命令记下来
function st_run(what, cmd, name, after) {
	st_busy();
	sh('mkdir -p ' + shq(ST_DIR) + ' && rm -f ' + shq(ST_DIR + '/rc') + ' ' + shq(ST_DIR + '/log'));
	cmcp_writej(ST_DIR + '/state', { st: 'run', what, name, at: time() });
	if (getenv('CMCP_STORE_RUN')) { writefile(getenv('CMCP_STORE_RUN'), cmd + '\n'); return { ok: true, started: true }; }
	let D = shq(ST_DIR);
	bg('sh -c ' + shq(sprintf('echo $$ > %s/pid; ( %s ) > %s/log 2>&1; rc=$?; %s; echo $rc > %s/rc; rm -f %s/pid', D, cmd, D, after ?? 'true', D, D)));
	return { ok: true, started: true };
}
// 按用途分类（用户 11/26 选的）：代理 / 网络 / 存储 / 系统 / 主题 / 其他；按插件名里的关键词认，iStore 的 app-meta-xxx 同样
const ST_CAT = [
	['theme', /^luci-theme-|argon-config|design-config|-theme-config$/],
	['proxy', /openclash|passwall|ssr-plus|ssrplus|vssr|bypass|homeproxy|nikki|mihomo|clash|shadowsocks|v2ray|xray|sing-?box|trojan|helloworld|momo|daed|fchomo|naive|hysteria|tuic|ssr$/],
	['disk', /samba|ksmbd|diskman|hd-?idle|minidlna|dlna|aria2|transmission|qbittorrent|alist|filebrowser|nfs|vsftpd|ftp|webdav|usb|syncthing|rclone|linkease|cifs|kodexplorer|nextcloud|quickstart|disk|mount|raid|unishare|istorepanel/],
	['net', /adguard|smartdns|mosdns|ddns|upnp|wol|wireguard|zerotier|tailscale|frp|nps|natmap|natter|lucky|sqm|mwan|turboacc|nlbw|oaf|appfilter|accesscontrol|arpbind|eqos|qos|adblock|dnsfilter|unblock|openvpn|ipsec|softether|n2n|cloudflared|iperf|speedtest|bandix|timecontrol|parentcontrol|firewall|dnsmasq|dhcp|ipv6|nat|vpn|socat|udpxy|igmp|wifi|wireless|wechatpush|serverchan|pushbot|bark/],
	['sys', /ttyd|terminal|statistics|autoreboot|reboot|cpufreq|cpu-?perf|ramfree|store|package|docker|commands|wizard|attendedsysupgrade|upgrade|watchcat|netdata|uptime|poweroff|cron|log|acme|nginx|uhttpd|advanced|filetransfer|backup|fan|temp|led|vlmcsd|kms|ota/],
];
function st_cat(n) {
	let k = replace(replace(n, /^luci-app-/, ''), /^app-meta-/, '');
	if (match(n, /^luci-theme-/)) return 'theme';
	for (let c in ST_CAT) if (match(k, c[1])) return c[0];
	return 'other';
}
function st_kb(k) { return k >= 1024 ? sprintf('%.1f MB', k / 1024.0) : sprintf('%d KB', k); }
function logger_note(s) { if (!getenv('CMCP_STORE_RUN')) sh('logger -t claude-mcp ' + shq(s)); }
// 装完：清原版后台的菜单缓存（新插件的菜单马上出来），推送结果
function st_after(n, ok) {
	return sprintf('rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache 2>/dev/null; if [ $rc = 0 ]; then %s/cmcp-notify info apps %s "" apps >/dev/null 2>&1; fi',
		SBIN, shq('「' + app_title(n) + '」' + ok));
}
P.store_list = function(a) {
	let pm = app_pm();
	if (!pm) die('没有 opkg 或 apk');
	let I = st_index(pm), inst = {}, q = lc(trim('' + (a?.q ?? ''))), all = !!a?.all;
	for (let x in app_scan().list) inst[x.name] = x.ver;
	let L = [];
	for (let n in keys(I.idx)) {
		let x = I.idx[n], plugin = !!match(n, /^luci-(app|theme)-/) || (x.kind == 'istore' && !!match(n, /^app-meta-/));
		if (!all && !plugin && !length(q)) continue;
		if (match(n, /^luci-i18n-/) || match(n, /^kmod-/) && !length(q)) continue;
		let t = x.kind == 'istore' && match(n, /^app-meta-/) ? (length(x.desc) && length(x.desc) <= 24 ? x.desc : substr(n, 9)) : app_title(n);
		if (length(q) && index(lc(n + ' ' + t + ' ' + x.desc), q) < 0) continue;
		push(L, { name: n, title: t, ver: x.ver, size: x.size, isize: x.isize, desc: x.desc, plugin, cat: st_cat(n), installed: inst[n] ?? null, upd: inst[n] != null && inst[n] != x.ver && !match(n, APP_CORE), src: x.kind == 'dist' ? null : x.kind == 'istore' ? 'iStore' : x.feed });
	}
	L = sort(L, (p, r) => (r.plugin - p.plugin) || (p.name < r.name ? -1 : 1));
	let upd = filter(L, (x) => x.upd);
	let F = st_feeds(pm);
	return { pm, age: I.age, feeds: map(F, (f) => ({ name: f.name, kind: f.kind })), istore: pm == 'opkg' && st_istore(), total: length(L), list: slice(L, 0, 300), upd: length(upd), free: st_free(), state: st_state() };
};
P.store_state = function() { return { state: st_state() }; };
P.store_refresh = function() {
	let pm = app_pm();
	if (!pm) die('没有 opkg 或 apk');
	if (pm == 'opkg') return st_run('更新软件源', st_istore() ? 'opkg update; a=$?; is-opkg update; b=$?; [ $a = 0 ] && [ $b = 0 ]' : 'opkg update', null);
	return st_run('更新软件源', 'apk update', null, '[ $rc = 0 ] && date +%s > ' + shq(ST_DIR + '/apk_at'));
};
// 还没装的依赖（软件源里找得到的），连自己一起，算要多少空间（KB）
function st_need(I, inst, n) {
	let seen = {}, todo = [n], kb = 0, cnt = 0;
	while (length(todo) && cnt < 200) {
		let p = shift(todo);
		if (seen[p] || inst[p] != null) continue;
		seen[p] = 1;
		let x = I.idx[p];
		if (!x) continue;
		cnt++;
		kb += x.isize ? x.isize / 1024.0 : x.size * 2.5 / 1024.0;
		for (let d in x.deps) push(todo, d);
	}
	return { kb: +sprintf('%.0f', kb), n: cnt };
}
P.store_install = function(a) {
	if (ROLE == 'sub') die('只有主账号能装软件');
	let n = '' + (a?.name ?? '');
	if (!match(n, /^[A-Za-z0-9_.+-]{1,80}$/)) die('包名不对');
	let pm = app_pm(), I = st_index(pm), inst = {};
	for (let x in app_scan().list) inst[x.name] = x.ver;
	if (inst[n] != null) die('「' + app_title(n) + '」已经装了');
	if (!I.idx[n]) die('软件源里没有「' + n + '」');
	let need = st_need(I, inst, n), free = st_free();
	if (free != null && need.kb + 512 > free) die('空间不够：要 ' + st_kb(need.kb) + '，剩 ' + st_kb(free));
	let cmd = pm == 'apk' ? 'apk add ' + shq(n) : I.idx[n].kind == 'istore' ? 'is-opkg install ' + shq(n) : 'opkg install ' + shq(n);
	logger_note('面板里安装 ' + n);
	let r = st_run('安装「' + app_title(n) + '」', cmd, n, st_after(n, '装好了'));
	r.need = need;
	return r;
};
P.store_upgrade = function(a) {
	if (ROLE == 'sub') die('只有主账号能更新软件');
	let n = '' + (a?.name ?? '');
	if (!match(n, /^[A-Za-z0-9_.+-]{1,80}$/)) die('包名不对');
	if (match(n, APP_CORE)) die('「' + app_title(n) + '」是系统组件：升级固件来更新');
	let pm = app_pm(), I = st_index(pm), cur = null;
	for (let x in app_scan().list) if (x.name == n) cur = x;
	if (!cur) die('没有装「' + n + '」');
	if (!I.idx[n] || I.idx[n].ver == cur.ver) die('「' + app_title(n) + '」已经是最新的');
	let cmd = pm == 'apk' ? 'apk add --upgrade ' + shq(n) : I.idx[n].kind == 'istore' ? 'is-opkg upgrade ' + shq(n) : 'opkg upgrade ' + shq(n);
	logger_note('面板里更新 ' + n);
	return st_run('更新「' + app_title(n) + '」', cmd, n, st_after(n, '更新好了'));
};

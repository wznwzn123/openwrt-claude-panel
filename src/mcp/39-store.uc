
/* ---------------- 6.0 第 19 项：软件中心（搜索、安装、更新） ----------------
 * 只从固件自带的软件源装（opkg：/etc/opkg/distfeeds.conf；apk：/etc/apk/repositories.d/distfeeds.list），
 * 自己加的软件源（customfeeds）里的不列、不装。卸载在「应用管理」（第 83 项）。
 * 装之前算空间：要装的包和还没装的依赖加起来，闪存不够就不装。
 * 更新软件源、安装、更新都在后台跑（要几十秒），面板每 2 秒问一次进度；同一时间只跑一个。
 * 系统组件（APP_CORE）不在这里更新：一个个升级系统组件可能把路由器弄坏，要升级固件。
 * 测试用环境变量：CMCP_APPS_ROOT / CMCP_APPS_PM（同应用管理）、CMCP_STORE_DIR（状态目录）、CMCP_STORE_RUN（命令只记下来）、CMCP_STORE_FREE（剩余空间 KB） */
const ST_DIR = getenv('CMCP_STORE_DIR') || '/tmp/cmcp_store';
function st_feeds(pm) {
	let f = [];
	if (pm == 'opkg') {
		for (let l in split(readfile(APP_ROOT + '/etc/opkg/distfeeds.conf') ?? '', '\n')) { let m = match(l, /^src(\/gz)?[ \t]+([^ \t]+)[ \t]+([^ \t]+)/); if (m) push(f, { name: m[2], url: m[3] }); }
	} else {
		for (let l in split(readfile(APP_ROOT + '/etc/apk/repositories.d/distfeeds.list') ?? '', '\n')) { l = trim(l); if (length(l) && substr(l, 0, 1) != '#') push(f, { name: replace(l, /^.*\/([^\/]+)\/[^\/]*$/, '$1'), url: l }); }
	}
	return f;
}
function st_lists_dir() {
	let m = match(readfile(APP_ROOT + '/etc/opkg.conf') ?? '', /lists_dir[ \t]+[^ \t]+[ \t]+([^ \t\n]+)/);
	return m ? m[1] : '/var/opkg-lists';
}
// 软件源里有哪些包：{ name: { ver, size, isize, desc, deps, feed } }；age：软件源多久没更新（秒，null = 还没更新过）
function st_index(pm) {
	let idx = {}, age = null;
	if (pm == 'opkg') {
		let dir = APP_ROOT + st_lists_dir();
		for (let f in st_feeds(pm)) {
			let st = stat(dir + '/' + f.name);
			if (!st) continue;
			let a = time() - st.mtime; if (age == null || a > age) age = a;
			for (let b in split(readfile(dir + '/' + f.name) ?? '', /\n\n+/)) {
				let k = app_kv(b, ':'), n = k.Package;
				if (!n || idx[n]) continue;
				idx[n] = { ver: k.Version ?? '', size: +(k.Size ?? 0) || 0, isize: +(k['Installed-Size'] ?? 0) || 0, desc: split(k.Description ?? '', '\n')[0], deps: app_dep_names(k.Depends), feed: f.name };
			}
		}
	} else {
		let rf = APP_ROOT + '/etc/apk/repositories.d/distfeeds.list';
		let o = getenv('CMCP_STORE_APKLIST') ? readfile(getenv('CMCP_STORE_APKLIST')) ?? '' : sh('apk --repositories-file ' + shq(rf) + ' list --available 2>/dev/null').out;
		for (let l in split(o, '\n')) {
			let m = match(l, /^([A-Za-z0-9_.+-]+)-([0-9][^ ]*-r[0-9]+) /);
			if (m && !idx[m[1]]) idx[m[1]] = { ver: m[2], size: 0, isize: 0, desc: '', deps: [], feed: 'distfeeds' };
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
		let x = I.idx[n], plugin = !!match(n, /^luci-(app|theme)-/);
		if (!all && !plugin && !length(q)) continue;
		if (match(n, /^luci-i18n-/) || match(n, /^kmod-/) && !length(q)) continue;
		let t = app_title(n);
		if (length(q) && index(lc(n + ' ' + t + ' ' + x.desc), q) < 0) continue;
		push(L, { name: n, title: t, ver: x.ver, size: x.size, isize: x.isize, desc: x.desc, plugin, installed: inst[n] ?? null, upd: inst[n] != null && inst[n] != x.ver && !match(n, APP_CORE) });
	}
	L = sort(L, (p, r) => (r.plugin - p.plugin) || (p.name < r.name ? -1 : 1));
	let upd = filter(L, (x) => x.upd);
	return { pm, age: I.age, feeds: map(st_feeds(pm), (f) => f.name), total: length(L), list: slice(L, 0, 300), upd: length(upd), free: st_free(), state: st_state() };
};
P.store_state = function() { return { state: st_state() }; };
P.store_refresh = function() {
	let pm = app_pm();
	if (!pm) die('没有 opkg 或 apk');
	if (pm == 'opkg') return st_run('更新软件源', 'opkg update', null);
	return st_run('更新软件源', 'apk --repositories-file ' + shq(APP_ROOT + '/etc/apk/repositories.d/distfeeds.list') + ' update', null,
		'[ $rc = 0 ] && date +%s > ' + shq(ST_DIR + '/apk_at'));
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
	if (!I.idx[n]) die('固件自带的软件源里没有「' + n + '」');
	let need = st_need(I, inst, n), free = st_free();
	if (free != null && need.kb + 512 > free) die('空间不够：要 ' + st_kb(need.kb) + '，剩 ' + st_kb(free));
	let cmd = pm == 'apk' ? 'apk --repositories-file ' + shq(APP_ROOT + '/etc/apk/repositories.d/distfeeds.list') + ' add ' + shq(n) : 'opkg install ' + shq(n);
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
	let cmd = pm == 'apk' ? 'apk --repositories-file ' + shq(APP_ROOT + '/etc/apk/repositories.d/distfeeds.list') + ' add --upgrade ' + shq(n) : 'opkg upgrade ' + shq(n);
	logger_note('面板里更新 ' + n);
	return st_run('更新「' + app_title(n) + '」', cmd, n, st_after(n, '更新好了'));
};

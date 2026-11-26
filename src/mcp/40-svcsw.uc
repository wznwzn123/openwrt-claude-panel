/* ---------------- 6.0 第 32 项：常用服务——文件共享（Samba / ksmbd）、FTP、SSH、指示灯 ----------------
 * 手机上开关这些服务。开 FTP、改 SSH 时说清楚风险；SSH 默认只对家里局域网开放；外网能连（防火墙放行了端口）的标出来。
 * 共享：Samba 4（samba4）、Samba 3.6（samba）、ksmbd 都认；只能共享 /mnt、/media、/data、/srv 下面的文件夹。
 * 指示灯：/sys/class/leds 下所有的灯；关的时候记下原来的状态，并写进 system 配置（cmcp_led_N），重启后也是关的；开的时候删掉、还原。
 * 只有主账号能用（这几个方法不在任何权限组里）。
 * 测试用：CMCP_SS_ROOT（假的根目录，放 etc/init.d、sys/class/leds、etc/vsftpd.conf、proc/mounts…） */
const SS_ROOT = getenv('CMCP_SS_ROOT') || '', SS_LED_F = ETC + '/led.json';
const SS_SHARE_DIR = /^\/(mnt|media|data|srv)\/[^\n]+$/;
function ss_init(n) { let f = SS_ROOT + '/etc/init.d/' + n; return stat(f) ? f : null; }
function ss_on(n) { let f = ss_init(n); return !!f && sh(shq(f) + ' enabled >/dev/null 2>&1').code == 0; }
function ss_run(n, procs) {
	let f = ss_init(n);
	if (f && sh(shq(f) + ' running >/dev/null 2>&1').code == 0) return true;
	if (SS_ROOT) return false;
	for (let p in procs) if (length(trim(sh('pidof ' + p + ' 2>/dev/null').out ?? ''))) return true;
	return false;
}
function ss_do(n, act) { let f = ss_init(n); if (f) sh(shq(f) + ' ' + act + ' >/dev/null 2>&1'); }
// 软件源里有没有（null = 还没读过软件列表）
function ss_pkg(names) {
	let pm = app_pm();
	if (!pm) return false;
	let I = st_index(pm);
	if (I.age == null) return null;
	for (let n in names) if (I.idx[n]) return n;
	return false;
}
// 外网能不能连到路由器的这个端口：wan 区域入站全放行，或者有放行这个端口的通信规则
function ss_wan(port) {
	let fw = uci_load('firewall') ?? [];
	for (let s in fw) if (s['.type'] == 'zone' && s.name == 'wan' && uc('' + (s.input ?? '')) == 'ACCEPT') return true;
	for (let s in fw) {
		if (s['.type'] != 'rule' || s.enabled == '0' || s.src != 'wan' || s.dest || uc('' + (s.target ?? '')) != 'ACCEPT') continue;
		let pr = lc(join(' ', as_list(s.proto ?? 'tcp udp')));
		if (!match(pr, /tcp|all/)) continue;
		for (let p in as_list(s.dest_port)) {
			let m = match('' + p, /^([0-9]+)([-:]([0-9]+))?$/);
			if (m && +port >= +m[1] && +port <= +(m[3] ?? m[1])) return true;
		}
	}
	return false;
}
function ss_uci(cfg, cmds) {
	if (!length(cmds)) return;
	let U = conf().uci, r = sh(join(' && ', map(cmds, (c) => U + ' ' + c)) + ' && ' + U + ' commit ' + cfg);
	if (r.code != 0) die('保存失败：' + trim(r.err ?? r.out ?? ''));
}
// ---- 文件共享 ----
function smb_kind() {
	if (ss_init('samba4')) return { k: 'samba4', cfg: 'samba4', st: 'sambashare', gl: 'samba' };
	if (ss_init('ksmbd')) return { k: 'ksmbd', cfg: 'ksmbd', st: 'share', gl: 'globals' };
	if (ss_init('samba')) return { k: 'samba', cfg: 'samba', st: 'sambashare', gl: 'samba' };
	return null;
}
function ss_disks() {
	let out = [];
	for (let l in split(readfile(SS_ROOT + '/proc/mounts') ?? '', '\n')) {
		let w = split(l, ' '), mp = replace(w[1] ?? '', /\\040/g, ' ');
		if (match(mp, SS_SHARE_DIR) && index(out, mp) < 0 && !match(w[2] ?? '', /^(tmpfs|proc|sysfs|overlay|squashfs)$/)) push(out, mp);
	}
	return slice(out, 0, 20);
}
function smb_get() {
	let K = smb_kind();
	if (!K) return { kind: null, pkg: ss_pkg(['luci-app-samba4', 'luci-app-ksmbd', 'samba4-server', 'ksmbd-server']) };
	let c = uci_load(K.cfg) ?? [], shares = [], ifs = [];
	for (let s in c) {
		if (s['.type'] == K.st) push(shares, { id: s['.name'], name: s.name ?? '', path: s.path ?? '', ro: s.read_only == 'yes', guest: s.guest_ok != 'no' });
		if (s['.type'] == K.gl) ifs = as_list(s.interface ?? 'lan');
	}
	return { kind: K.k, name: K.k == 'ksmbd' ? 'ksmbd' : 'Samba', on: ss_on(K.k), run: ss_run(K.k, ['smbd', 'ksmbd.mountd']), lan: !length(ifs) || (length(ifs) == 1 && ifs[0] == 'lan'), wan: ss_wan(445), shares, disks: ss_disks() };
}
// ---- FTP ----
function ftp_kind() { for (let k in ['vsftpd', 'pure-ftpd', 'proftpd']) if (ss_init(k)) return k; return null; }
function ftp_get() {
	let k = ftp_kind();
	if (!k) return { kind: null, pkg: ss_pkg(['luci-app-vsftpd', 'vsftpd']) };
	return { kind: k, on: ss_on(k), run: ss_run(k, [k == 'pure-ftpd' ? 'pure-ftpd' : k]), wan: ss_wan(21) };
}
// ---- SSH ----
function ssh_keys() { let n = 0; for (let l in split(readfile(SS_ROOT + '/etc/dropbear/authorized_keys') ?? '', '\n')) if (match(l, /^(ssh-|ecdsa-|sk-)/)) n++; return n; }
function ssh_db() { for (let s in (uci_load('dropbear') ?? [])) if (s['.type'] == 'dropbear') return s; return null; }
function ssh_get() {
	if (ss_init('dropbear')) {
		let s = ssh_db() ?? {}, port = +(s.Port ?? 22) || 22, pw = !match('' + (s.PasswordAuth ?? 'on'), /^(off|0|no)$/);
		return { kind: 'dropbear', on: ss_on('dropbear') && s.enable != '0', run: ss_run('dropbear', ['dropbear']), port, lan: s.Interface == 'lan', pw, keys: ssh_keys(), wan: ss_wan(port), sec: s['.name'] ?? null };
	}
	if (ss_init('sshd')) {
		let m = match(readfile(SS_ROOT + '/etc/ssh/sshd_config') ?? '', /(^|\n)[ \t]*Port[ \t]+([0-9]+)/), port = m ? +m[2] : 22;
		return { kind: 'openssh', on: ss_on('sshd'), run: ss_run('sshd', ['sshd']), port, wan: ss_wan(port) };
	}
	return { kind: null };
}
// ---- 指示灯 ----
function led_dir() { return SS_ROOT + '/sys/class/leds'; }
function led_list() { return sort(filter(split(sh('ls ' + shq(led_dir()) + ' 2>/dev/null').out ?? '', '\n'), (n) => match(n, /^[A-Za-z0-9_:.+-]+$/) && !match(n, /^\./))); }
function led_off_now() { for (let s in (uci_load('system') ?? [])) if (s['.type'] == 'led' && match(s['.name'], /^cmcp_led_/)) return true; return false; }
function led_trig(n) { let m = match(readfile(led_dir() + '/' + n + '/trigger') ?? '', /\[([^\]]+)\]/); return m ? m[1] : 'none'; }
function led_get() { let l = led_list(); return { n: length(l), on: !led_off_now() }; }

P.svcsw_get = function() {
	return { smb: smb_get(), ftp: ftp_get(), ssh: ssh_get(), led: led_get() };
};
// a: { smb: { on } } / { smb: { add: { name, path, ro } } } / { smb: { del: id } } / { ftp: { on } } / { ssh: { on, port, lan, pw } } / { led: { on } }
P.svcsw_set = function(a) {
	if (a?.smb) {
		let K = smb_kind(), x = a.smb;
		if (!K) die('没装文件共享');
		if (x.add) {
			let nm = trim('' + (x.add.name ?? '')), p = replace(trim('' + (x.add.path ?? '')), /\/+$/, '');
			if (!length(nm) || length(nm) > 48 || match(nm, /[\x01-\x1f\x7f]/) || match(nm, /[\/\\:;|=,+*?<>"%]/) || index(nm, '[') >= 0 || index(nm, ']') >= 0) die('名字不对（不能有 / \\ : * ? " < > | 这些符号）');
			if (!match(p, SS_SHARE_DIR) || match(p, /(^|\/)\.\.?(\/|$)/)) die('只能共享 /mnt、/media 下面的文件夹（插的硬盘、U 盘）');
			let st = stat(SS_ROOT + p);
			if (!st || st.type != 'directory') die('没有这个文件夹：' + p);
			let have = {};
			for (let s in (uci_load(K.cfg) ?? [])) { have[s['.name']] = true; if (s['.type'] == K.st && lc(s.name ?? '') == lc(nm)) die('已经有叫「' + nm + '」的共享了'); }
			let i = 1; while (have['cmcp_share' + i]) i++;
			let id = 'cmcp_share' + i;
			ss_uci(K.cfg, [
				'set ' + shq(K.cfg + '.' + id + '=' + K.st), 'set ' + shq(K.cfg + '.' + id + '.name=' + nm), 'set ' + shq(K.cfg + '.' + id + '.path=' + p),
				'set ' + shq(K.cfg + '.' + id + '.read_only=' + (x.add.ro ? 'yes' : 'no')), 'set ' + shq(K.cfg + '.' + id + '.guest_ok=yes'),
				'set ' + shq(K.cfg + '.' + id + '.browseable=yes'), 'set ' + shq(K.cfg + '.' + id + '.create_mask=0666'), 'set ' + shq(K.cfg + '.' + id + '.dir_mask=0777')
			]);
			if (ss_on(K.k)) ss_do(K.k, 'reload');
		} else if (x.del != null) {
			let ok = false;
			for (let s in (uci_load(K.cfg) ?? [])) if (s['.type'] == K.st && s['.name'] == '' + x.del) ok = true;
			if (!ok) die('没有这个共享');
			ss_uci(K.cfg, ['delete ' + shq(K.cfg + '.' + x.del)]);
			if (ss_on(K.k)) ss_do(K.k, 'reload');
		} else if (x.on) { ss_do(K.k, 'enable'); ss_do(K.k, 'restart'); }
		else { ss_do(K.k, 'stop'); ss_do(K.k, 'disable'); }
	}
	if (a?.ftp) {
		let k = ftp_kind();
		if (!k) die('没装 FTP');
		if (a.ftp.on) { ss_do(k, 'enable'); ss_do(k, 'restart'); }
		else { ss_do(k, 'stop'); ss_do(k, 'disable'); }
	}
	if (a?.ssh) {
		let x = a.ssh, g = ssh_get();
		if (!g.kind) die('没装 SSH');
		if (g.kind == 'openssh') {
			if (x.port != null || x.lan != null || x.pw != null) die('这台路由器用的是 OpenSSH，端口等设置在原版后台改');
			if (x.on) { ss_do('sshd', 'enable'); ss_do('sshd', 'restart'); } else { ss_do('sshd', 'stop'); ss_do('sshd', 'disable'); }
		} else {
			let sec = g.sec, cmds = [];
			if (!sec) { sec = 'cmcp_ssh'; push(cmds, 'set ' + shq('dropbear.' + sec + '=dropbear')); }
			let S = (k, v) => push(cmds, 'set ' + shq('dropbear.' + sec + '.' + k + '=' + v));
			if (x.port != null) {
				let p = +x.port;
				if (!match('' + x.port, /^[0-9]+$/) || p < 1 || p > 65535) die('端口要在 1–65535 之间');
				for (let used in [80, 443, 53, 67, 906]) if (p == used) die('端口 ' + p + ' 路由器自己在用');
				S('Port', '' + p);
			}
			if (x.lan != null) S('Interface', x.lan ? 'lan' : '');
			if (x.pw != null) {
				if (!x.pw && !ssh_keys()) die('先在原版后台「SSH 密钥」里加一个密钥，不然关了密码就登不进去');
				S('PasswordAuth', x.pw ? 'on' : 'off'); S('RootPasswordAuth', x.pw ? 'on' : 'off');
			}
			if (x.on != null) S('enable', x.on ? '1' : '0');
			ss_uci('dropbear', cmds);
			if (x.on === false) { ss_do('dropbear', 'stop'); }
			else { if (x.on) ss_do('dropbear', 'enable'); ss_do('dropbear', 'restart'); }
		}
	}
	if (a?.led) {
		let l = led_list(), sv = cmcp_readj(SS_LED_F, {});
		if (!length(l)) die('这台路由器没有能控制的指示灯');
		if (!a.led.on) {
			if (!led_off_now()) {
				sv = {};
				for (let n in l) sv[n] = { t: led_trig(n), b: trim(readfile(led_dir() + '/' + n + '/brightness') ?? '0') };
				cmcp_writej(SS_LED_F, sv);
			}
			let cmds = [], i = 0;
			for (let n in l) {
				let id = 'system.cmcp_led_' + i++;
				push(cmds, 'set ' + shq(id + '=led'), 'set ' + shq(id + '.name=cmcp'), 'set ' + shq(id + '.sysfs=' + n), 'set ' + shq(id + '.trigger=none'), 'set ' + shq(id + '.default=0'));
				writefile(led_dir() + '/' + n + '/trigger', 'none');
				writefile(led_dir() + '/' + n + '/brightness', '0');
			}
			ss_uci('system', cmds);
		} else {
			let cmds = [];
			for (let s in (uci_load('system') ?? [])) if (s['.type'] == 'led' && match(s['.name'], /^cmcp_led_/)) push(cmds, 'delete ' + shq('system.' + s['.name']));
			ss_uci('system', cmds);
			for (let n in l) if (sv[n]) { writefile(led_dir() + '/' + n + '/trigger', sv[n].t); if (sv[n].t == 'none') writefile(led_dir() + '/' + n + '/brightness', sv[n].b); }
			unlink(SS_LED_F);
			ss_do('led', 'restart');
		}
	}
	return P.svcsw_get();
};

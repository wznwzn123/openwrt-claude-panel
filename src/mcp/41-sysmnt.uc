/* ---------------- 6.0 第 30、34 项：恢复出厂、固件升级 ----------------
 * 用户 11/26 定：只能连着家里 Wi-Fi 时做（在外面灰掉，写「要连家里 Wi-Fi」）；做之前必须备份（云端备份，或者没有云端的下载一份到手机），还要输路由器后台密码。
 * 「在家」= 从家里局域网直接打开面板（lan_client），或者经过隧道、但手机的外网地址就是这台路由器的（IPv4 同一个公网地址 / IPv6 在路由器分到的前缀里）。
 * 固件：手机分块上传到路由器内存（/tmp），传完先用 sysupgrade -T 检查（型号不对、文件坏了都过不了），再刷。保留设置时面板跟着保留（keep.d + 开机补回自启）。
 * 只有主账号能用（这些方法不在任何权限组里）。
 * 测试用：CMCP_SM_RUN（把要执行的命令记到这个文件，不真执行）、CMCP_SM_WAN4 / CMCP_SM_PUB4 / CMCP_SM_PFX6、CMCP_FW_F、CMCP_SM_BIN（sysupgrade、firstboot 所在目录）、CMCP_SM_MEM（可用内存 MB） */
const FW_F = getenv('CMCP_FW_F') || '/tmp/cmcp_fw.bin', FW_META = FW_F + '.json', SM_RUN = getenv('CMCP_SM_RUN'), SM_BIN = getenv('CMCP_SM_BIN') || '';
const LBK_AT = FW_F + '.lbk';
function sm_run(cmd) { if (SM_RUN) { let f = fs_open(SM_RUN, 'a'); if (f) { f.write(cmd + '\n'); f.close(); } return; } bg(cmd); }
function sm_has(c) { return SM_BIN ? !!stat(SM_BIN + '/' + c) : sh('command -v ' + c + ' >/dev/null 2>&1').code == 0; }
function sm_cmd(c) { return SM_BIN ? SM_BIN + '/' + c : c; }
function sm_mem() { if (getenv('CMCP_SM_MEM')) return +getenv('CMCP_SM_MEM'); let m = match(readfile('/proc/meminfo') ?? '', /MemAvailable:[ \t]+([0-9]+)/); return m ? +sprintf('%.0f', +m[1] / 1024) : 0; }
// IPv6 地址拆成 8 段数字
function v6_parts(s) {
	s = lc(trim('' + s));
	if (!match(s, /^[0-9a-f:]+$/) || length(split(s, '::')) > 2) return null;
	let h = split(s, '::'), a = length(h[0]) ? split(h[0], ':') : [], b = length(h) > 1 && length(h[1]) ? split(h[1], ':') : [];
	if (length(h) == 1 && length(a) != 8) return null;
	let out = [];
	for (let x in a) push(out, hex(x));
	for (let i = length(a) + length(b); i < 8; i++) push(out, 0);
	for (let x in b) push(out, hex(x));
	if (length(out) != 8) return null;
	for (let x in out) if (type(x) != 'int' || x < 0 || x > 65535) return null;
	return out;
}
function v6_in(ip, pfx) {
	let m = match(pfx, /^([0-9a-fA-F:]+)\/([0-9]+)$/), a = v6_parts(ip), b = m ? v6_parts(m[1]) : null;
	if (!a || !b) return false;
	let bits = +m[2];
	if (bits < 16 || bits > 64) bits = 64;
	for (let i = 0; i < 8 && bits > 0; i++) {
		let n = bits >= 16 ? 16 : bits, mask = (0xffff << (16 - n)) & 0xffff;
		if ((a[i] & mask) != (b[i] & mask)) return false;
		bits -= n;
	}
	return true;
}
function sm_ubus(o) { try { return json(sh('ubus call network.interface.' + o + ' status 2>/dev/null').out); } catch (e) { return null; } }
function sm_pub4() {
	let w = getenv('CMCP_SM_WAN4') ?? sm_ubus('wan')?.['ipv4-address']?.[0]?.address, out = [];
	if (w) push(out, w);
	// 宽带口拿到的是上级路由器分的内网地址：再问一次外网看到的地址（10 分钟缓存）
	if (!w || match(w, /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.)/)) {
		let p = getenv('CMCP_SM_PUB4');
		if (p == null) {
			let f = '/tmp/cmcp_pub4', st = stat(f);
			if (st && time() - st.mtime < 600) p = trim(readfile(f) ?? '');
			else { p = trim(sh('curl -s -m 4 http://ip.3322.net 2>/dev/null').out ?? ''); if (match(p, /^\d+\.\d+\.\d+\.\d+$/)) writefile(f, p); }
		}
		if (match(p ?? '', /^\d+\.\d+\.\d+\.\d+$/)) push(out, p);
	}
	return out;
}
function sm_pfx6() {
	let e = getenv('CMCP_SM_PFX6');
	if (e != null) return length(e) ? split(e, ' ') : [];
	let out = [];
	for (let o in ['wan6', 'wan']) for (let p in (sm_ubus(o)?.['ipv6-prefix'] ?? [])) if (p.address) push(out, p.address + '/' + (p.mask ?? 64));
	return out;
}
// 手机连面板走了代理节点（用户 11/28：在家却显示「要连家里 Wi-Fi」，官网看到的是节点的地址）：
// 问 OpenClash / Nikki 现在哪些家里设备在连这个面板网址。有一台归这个账号（设备归谁），或者只有一台、也没归别人，就算在家
function sm_proxy_home() {
	// 测试用：CMCP_SM_DOM（面板网址）、CMCP_SM_CONNS（假的连接列表文件）、CMCP_SM_NEIGH（IP → MAC 的 JSON）
	let dom = getenv('CMCP_SM_DOM') ?? CL.panel_domain();
	if (!dom) return false;
	let d = null, cf = getenv('CMCP_SM_CONNS'), nb = null;
	try { d = cf ? json(readfile(cf) ?? 'null') : CL.api('GET', '/connections', null, 4).json; } catch (e) {}
	try { nb = getenv('CMCP_SM_NEIGH') ? json(getenv('CMCP_SM_NEIGH')) : null; } catch (e) {}
	let ips = {};
	for (let c in (d?.connections ?? [])) {
		let h = lc(c.metadata?.host ?? ''), s = c.metadata?.sourceIP ?? '';
		if (length(h) && (h == dom || substr(h, -length(dom) - 1) == '.' + dom) && length(s) && !match(s, /^(127\.|::1$)/)) ips[s] = 1;
	}
	let l = keys(ips);
	if (!length(l)) return false;
	let o = own_load(), uid = DEV?.uid ?? null, mine = 0, other = 0;
	for (let ip in l) {
		let mac = nb ? nb[ip] : own_ip_mac(ip), e = mac ? o[mac] : null;
		if (e && uid && e.uid == uid && e.ok) mine++;
		else if (e && e.ok) other++;
	}
	return mine > 0 || (length(l) == 1 && !other);
}
// 'lan'：家里局域网直接打开；'wan'：经过隧道，但手机就在家里；'proxy'：在家，手机连面板走了代理节点；null：在外面
function home_where() {
	if (lan_client()) return 'lan';
	let ra = replace(getenv('REMOTE_ADDR') ?? '', /^::ffff:/, ''), ci = lc(trim(getenv('HTTP_CF_CONNECTING_IP') ?? ''));
	if (!match(ra, /^(127\.[0-9.]+|::1)$/) || !length(ci)) return null;
	if (match(ci, /^\d+\.\d+\.\d+\.\d+$/)) { for (let ip in sm_pub4()) if (ip == ci) return 'wan'; }
	else for (let p in sm_pfx6()) if (v6_in(ci, p)) return 'wan';
	return sm_proxy_home() ? 'proxy' : null;
}
// 认不出在家：给一张局域网面板的一次性票（2 分钟、用一次），按钮「用家里地址打开」直接跳过去，不用输密码；在外面打不开
P.fw_lan = function() {
	if (ROLE != 'owner') die('只有主账号能用');
	let a = lan_addr();
	if (!a) die('家里局域网打开面板已关闭');
	let t = '', cs = 'abcdefghijkmnpqrstuvwxyz23456789', b = readfile('/dev/urandom', 48) ?? '';
	for (let i = 0; i < length(b) && length(t) < 24; i++) t += substr(cs, ord(b, i) % 32, 1);
	if (length(t) != 24) die('生成不了链接，再试一次');
	sh('mkdir -p ' + shq(LAN_T) + ' && chmod 700 ' + shq(LAN_T));
	writefile(LAN_T + '/' + t, '');
	return { url: a.url + '?p=fwup#lopen=' + t };
};
function sm_guard() {
	if (ROLE != 'owner') die('只有主账号能用');
	if (!home_where()) die('要连家里 Wi-Fi');
}
function sm_cloud() { let c = {}; for (let l in split(readfile(ETC + '/cloud.conf') ?? '', '\n')) { let m = match(l, /^([A-Z]+)=(.*)$/); if (m) c[m[1]] = m[2]; } return !!(c.URL && c.RKEY && stat(SBIN + '/cmcp-backup')); }
// 30 分钟内备份过（云端备份成功，或者下载过一份到手机）
function sm_bk_fresh() {
	let now = time(), c = +trim(readfile(ETC + '/backup_last') ?? '0'), l = +trim(readfile(LBK_AT) ?? '0');
	return (c && now - c < 1800) || (l && now - l < 1800);
}
function sm_fwinfo() {
	let r = readfile('/etc/openwrt_release') ?? '', g = (k) => { let m = match(r, regexp('(^|\n)' + k + "='?([^'\n]*)'?")); return m ? m[2] : ''; };
	let b = null; try { b = json(sh('ubus call system board 2>/dev/null').out); } catch (e) {}
	return { desc: g('DISTRIB_DESCRIPTION') || b?.release?.description || '', target: g('DISTRIB_TARGET') || b?.release?.target || '', model: b?.model ?? '', board: b?.board_name ?? '' };
}
function sm_b64() {
	try { if (type(global.b64dec) == 'function') return 'uc'; } catch (e) {}
	if (sh('echo aGk= | base64 -d 2>/dev/null').out == 'hi') return 'bb';
	if (sh('echo aGk= | openssl base64 -d 2>/dev/null').out == 'hi') return 'ssl';
	return null;
}
function fw_meta() { let o = cmcp_readj(FW_META, null); return type(o) == 'object' ? o : null; }
P.sysmnt_get = function() {
	let m = fw_meta(), st = stat(FW_F);
	return {
		owner: ROLE == 'owner', home: home_where(), lan: !!lan_addr(), fw: sm_fwinfo(), mem: sm_mem(),
		reset: sm_has('firstboot') || sm_has('jffs2reset'), up: sm_has('sysupgrade') ? (sm_b64() ? true : '固件缺少解码工具（base64）') : '固件没有 sysupgrade',
		cloud: sm_cloud(), bk_last: +trim(readfile(ETC + '/backup_last') ?? '0') || null, bk_fresh: sm_bk_fresh(), job: bk_job(),
		file: st && m?.done ? { name: m.name, size: st.size, ok: m.ok, msg: m.msg ?? '' } : null
	};
};
// 没有云端备份的：打包一份设置给手机下载（sysupgrade -b）
P.sys_lbk = function() {
	sm_guard();
	let f = '/tmp/cmcp_lbk.tar.gz';
	sh('rm -f ' + f);
	let r = sh(sm_cmd('sysupgrade') + ' -b ' + f + ' 2>&1');
	if (!stat(f)) die('打包设置失败：' + trim(r.out ?? ''));
	writefile(LBK_AT, '' + time());
	let name = 'backup-' + replace(trim(sh('date +%Y%m%d-%H%M').out), /[^0-9-]/g, '') + '.tar.gz';
	return dl_put(f, name);
};
P.factory_reset = function(a) {
	sm_guard();
	if (a?.confirm != 'RESET') die('需要确认');
	let tool = sm_has('firstboot') ? 'firstboot -y' : sm_has('jffs2reset') ? 'jffs2reset -y' : null;
	if (!tool) die('这台路由器的固件不支持恢复出厂（没有 firstboot）');
	if (!sm_bk_fresh()) die('先备份一次（30 分钟内的才算）');
	rootpw_check(a?.pw, '恢复出厂时的路由器后台密码');
	try { sh(sprintf('%s/cmcp-notify warn sys %s %s sys >/dev/null 2>&1', SBIN, shq('路由器正在恢复出厂'), shq('重启后是全新的系统，面板要重新安装。'))); } catch (e) {}
	sm_run('sleep 3; ' + sm_cmd(tool) + ' && reboot');
	return { ok: true };
};
// 上传固件：begin { size, name } → chunk { off, data（base64） }，传完自动检查
P.fw_up = function(a) {
	sm_guard();
	let op = a?.op;
	if (op == 'cancel') { sh(sprintf('rm -f %s %s %s', shq(FW_F), shq(FW_F + '.part'), shq(FW_META))); return { ok: true }; }
	if (op == 'begin') {
		if (!sm_has('sysupgrade')) die('固件没有 sysupgrade，不能在面板里升级');
		if (!sm_b64()) die('固件缺少解码工具（base64），不能在面板里升级');
		let size = +a?.size, mem = sm_mem(), name = substr(replace('' + (a?.name ?? 'firmware.bin'), /[^A-Za-z0-9._+-]/g, '_'), 0, 80);
		if (!(size >= 1048576 && size <= 200 * 1048576)) die('文件大小不对：固件一般是几 MB 到几十 MB');
		if (size / 1048576 + 32 > mem) die(sprintf('内存不够：固件 %d MB，路由器可用内存只有 %d MB', +sprintf('%.0f', size / 1048576), mem));
		sh(sprintf('rm -f %s %s', shq(FW_F), shq(FW_F + '.part')));
		writefile(FW_F + '.part', '');
		writefile(FW_META, sprintf('%J', { size, name, got: 0, at: time() }));
		return { ok: true, got: 0 };
	}
	if (op != 'chunk') die('不支持的操作');
	let m = fw_meta();
	if (!m || m.done) die('先选固件文件');
	if (+a?.off != m.got) return { ok: false, got: m.got };
	let d = '' + (a?.data ?? ''), k = sm_b64(), bin = null;
	if (!match(d, /^[A-Za-z0-9+\/=]+$/) || length(d) > 1500000) die('数据不对');
	if (k == 'uc') bin = global.b64dec(d);
	else {
		let tf = FW_F + '.b64';
		writefile(tf, d);
		bin = sh(sprintf('%s -d < %s; rm -f %s', k == 'ssl' ? 'openssl base64 -A' : 'base64', shq(tf), shq(tf))).out;
	}
	if (bin == null || !length(bin) || m.got + length(bin) > m.size) die('数据不对，重新选文件');
	let f = fs_open(FW_F + '.part', 'a');
	if (!f) die('写不进路由器内存');
	f.write(bin); f.close();
	m.got += length(bin);
	if (m.got == m.size) {
		rename(FW_F + '.part', FW_F);
		let r = sh(sm_cmd('sysupgrade') + ' -T ' + shq(FW_F) + ' 2>&1');
		m.done = true; m.ok = r.code == 0;
		m.msg = m.ok ? '' : (match(r.out ?? '', /not supported|board|device/i) ? '这个固件不是这台路由器的型号' : '固件检查没通过：' + substr(trim(r.out ?? ''), 0, 200));
		m.sha = trim(split(sh('sha256sum ' + shq(FW_F) + ' 2>/dev/null').out ?? '', ' ')[0]);
	}
	writefile(FW_META, sprintf('%J', m));
	return { ok: true, got: m.got, done: !!m.done, good: m.ok, msg: m.msg ?? '', sha: m.sha ?? '' };
};
// 保留设置刷机时，面板的文件一起留下；刷完第一次开机补回自启和计划任务
const SM_KEEP = ['/etc/claude-mcp/', '/www-claude-mcp/', '/usr/share/ucode/cmcp/', '/etc/init.d/claude-mcp', '/etc/init.d/cmcp-watchdog', '/etc/hotplug.d/ntp/90-cmcp-synced',
	'/usr/libexec/rpcd/cmcp', '/usr/share/rpcd/acl.d/luci-app-cmcp.json', '/usr/share/luci/menu.d/luci-app-cmcp.json', '/www/luci-static/resources/view/cmcp/', '/usr/lib/lua/luci/controller/cmcp.lua', '/usr/bin/cloudflared', '/etc/uci-defaults/99-cmcp-keep'];
function sm_keep(root) {
	root ??= '';
	let bins = filter(split(sh('ls /usr/sbin/cmcp-* 2>/dev/null').out ?? '', '\n'), (x) => length(x));
	sh('mkdir -p ' + shq(root + '/lib/upgrade/keep.d') + ' ' + shq(root + '/etc/uci-defaults'));
	let all = slice(SM_KEEP);
	for (let b in bins) push(all, b);
	writefile(root + '/lib/upgrade/keep.d/claude-mcp', join('\n', all) + '\n');
	let cron = filter(split(readfile('/etc/crontabs/root') ?? '', '\n'), (l) => match(l, /\/usr\/sbin\/cmcp-/));
	writefile(ETC + '/cron.keep', join('\n', cron) + '\n');
	writefile(root + '/etc/uci-defaults/99-cmcp-keep', `#!/bin/sh
# 路由器面板：刷完固件第一次开机，补回自启和计划任务（保留设置刷机时才会有这个文件）
[ -x /etc/init.d/claude-mcp ] || exit 0
/etc/init.d/claude-mcp enable; /etc/init.d/cmcp-watchdog enable
touch /etc/crontabs/root
while IFS= read -r l; do [ -n "$l" ] && ! grep -qF "$l" /etc/crontabs/root && echo "$l" >> /etc/crontabs/root; done < /etc/claude-mcp/cron.keep
exit 0
`);
	sh('chmod 755 ' + shq(root + '/etc/uci-defaults/99-cmcp-keep'));
}
P.fw_flash = function(a) {
	sm_guard();
	let m = fw_meta();
	if (!m?.done || !stat(FW_F)) die('先选固件文件');
	if (!m.ok) die(m.msg || '固件检查没通过');
	if (!sm_bk_fresh()) die('先备份一次（30 分钟内的才算）');
	rootpw_check(a?.pw, '升级固件时的路由器后台密码');
	let keep = a?.keep !== false;
	if (keep) sm_keep(getenv('CMCP_SM_ROOT'));
	try { sh(sprintf('%s/cmcp-notify warn sys %s %s sys >/dev/null 2>&1', SBIN, shq('路由器正在升级固件'), shq(keep ? '大约 3–5 分钟，期间断网。' : '大约 3–5 分钟，期间断网。不保留设置，面板要重新安装。'))); } catch (e) {}
	sm_run('sleep 3; ' + sm_cmd('sysupgrade') + (keep ? ' ' : ' -n ') + FW_F);
	return { ok: true, keep };
};

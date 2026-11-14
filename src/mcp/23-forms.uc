P.oc_schema = function(a) {
	if (!OC_PAGES[a.page]) die('未知页面：' + a.page);
	if (a.sid != null && !match(a.sid, /^[A-Za-z0-9_]+$/)) die('sid 不合法');
	let key = a.page + (a.sid ? '_x' : '');
	let cf = '/tmp/cmcp_schema_' + key + '.json', st = stat(cf);
	let ucst = stat('/etc/config/openclash');
	if (!a.fresh && st && time() - st.mtime < 600 && ucst && st.mtime >= ucst.mtime) {
		try { return json(readfile(cf)); } catch (e) {}
	}
	let sid = a.sid;
	if ((a.page == 'config-subscribe-edit' || a.page == 'custom-dns-edit') && !sid) {
		let t = a.page == 'config-subscribe-edit' ? 'config_subscribe' : 'dns_servers';
		let c = ucur();
		c.foreach('openclash', t, (s) => { if (!sid) sid = s['.name']; });
		if (!sid) {
			sid = c.add('openclash', t);
			c.commit('openclash');
			let j = cbi_call(['schema', a.page, sid]);
			c = ucur(); c.delete('openclash', sid); c.commit('openclash');
			writefile(cf, sprintf('%J', j));
			return j;
		}
	}
	let args = ['schema', a.page];
	if (sid) push(args, sid);
	let j = cbi_call(args);
	writefile(cf, sprintf('%J', j));
	return j;
};

P.oc_button = function(a) {
	if (!OC_PAGES[a.page]) die('未知页面：' + a.page);
	if (type(a.option) != 'string' || !length(a.option) || length(a.option) > 80) die('按钮名不合法');
	let args = ['press', a.page, a.option];
	if (a.sid) push(args, a.sid);
	cbi_call(args, 100);
	return { ok: true };
};

/* 和 OpenClash 原版一样：同时修改运行中的内核和插件设置，重启后也保持 */
P.set_mode = function(a) {
	if (index(['rule', 'global', 'direct'], a.mode) < 0) die('模式只能是 rule / global / direct');
	let live = false;
	try { api('PATCH', '/configs', { mode: a.mode }, 5); live = true; } catch (e) {}
	// 记进设置，下次启动还是这个模式（Nikki 记在 mixin.mode）
	let c = require('uci').cursor();
	if (CL.clash_ctl()?.id == 'nikki') { c.load('nikki'); c.set('nikki', 'mixin', 'mode', a.mode); c.commit('nikki'); }
	else { c.load('openclash'); c.set('openclash', 'config', 'proxy_mode', a.mode); c.commit('openclash'); }
	return { ok: true, live };
};

P.run_mode = function(a) {
	const OK = { 'fake-ip': 1, 'fake-ip-tun': 1, 'fake-ip-mix': 1, 'redir-host': 1, 'redir-host-tun': 1, 'redir-host-mix': 1 };
	if (!OK[a.mode]) die('运行模式不对：' + a.mode);
	let c = ucur();
	c.set('openclash', 'config', 'en_mode', a.mode);
	c.commit('openclash');
	restart_openclash_bg();
	return { ok: true };
};

P.diag = function(a) {
	let addr = trim('' + (a.addr ?? ''));
	addr = replace(addr, /^[a-z]+:\/\//i, '');
	addr = replace(addr, /[\/:].*$/, '');
	if (!match(addr, /^[A-Za-z0-9.-]{1,253}$/)) die('请输入域名或 IP，例如 www.google.com');
	let script = a.type == 'dns' ? 'openclash_debug_dns.lua' : 'openclash_debug_getcon.lua';
	if (a.type == 'dns' && match(addr, /^[0-9.]+$/)) die('DNS 诊断只能输入域名');
	let r = sh(sprintf('timeout 40 %s/%s %s', OC_SH, script, shq(addr)));
	let t = trim(r.out);
	return { text: length(t) ? t : '没有输出（OpenClash 可能没有运行）' };
};

P.logs = function(a) {
	let n = +a.lines || 300;
	if (n > 2000) n = 2000;
	let plugin = trim(sh(sprintf("grep -v '^time=\"' /tmp/openclash.log | tail -n %d", n)).out);
	let core = trim(sh(sprintf("grep '^time=\"' /tmp/openclash.log | tail -n %d", n)).out);
	let start = trim(readfile('/tmp/openclash_start.log') ?? '');
	let level = null;
	try { level = api('GET', '/configs', null, 3)?.['log-level']; } catch (e) {}
	return { plugin, core, start, level, size: stat('/tmp/openclash.log')?.size ?? 0 };
};

P.dashboard_state = function() {
	let ui = '/usr/share/openclash/ui/', c = ucur();
	return {
		dashboard_type: c.get('openclash', 'config', 'dashboard_type') || 'Official',
		yacd_type: c.get('openclash', 'config', 'yacd_type') || 'Official',
		default_dashboard: c.get('openclash', 'config', 'default_dashboard') || '',
		installed: { dashboard: !!stat(ui + 'dashboard'), yacd: !!stat(ui + 'yacd'), metacubexd: !!stat(ui + 'metacubexd'), zashboard: !!stat(ui + 'zashboard') },
		port: c.get('openclash', 'config', 'cn_port') || '9090',
		lan_ip: replace(uci_get('network.lan.ipaddr') ?? '', /\/.*/, ''),
		secret: uci_get('openclash.config.dashboard_password') ?? '',
	};
};

P.dashboard = function(a) {
	const NAMES = { Dashboard: 1, Yacd: 1, Metacubexd: 1, Zashboard: 1 };
	if (!NAMES[a.name]) die('未知面板：' + a.name);
	let c = ucur();
	if (a.op == 'default') {
		if (!stat('/usr/share/openclash/ui/' + lc(a.name))) die('这个面板还没安装');
		c.set('openclash', 'config', 'default_dashboard', lc(a.name));
		c.commit('openclash');
		return { ok: true };
	}
	if (a.op == 'delete') {
		sh('rm -rf ' + shq('/usr/share/openclash/ui/' + lc(a.name)));
		return { ok: true };
	}
	let t = a.type == 'Meta' ? 'Meta' : 'Official';
	let r = sh(sprintf('timeout 100 %s/openclash_download_dashboard.sh %s %s', OC_SH, shq(a.name), shq(t)));
	if (r.code != 0) die('下载失败（退出码 ' + r.code + '），可能是网络问题，稍后再试');
	if (a.name == 'Dashboard') c.set('openclash', 'config', 'dashboard_type', t);
	if (a.name == 'Yacd') c.set('openclash', 'config', 'yacd_type', t);
	c.commit('openclash');
	return { ok: true };
};

P.age = function(a) {
	let core = '/etc/openclash/core/clash_meta';
	if (a.op == 'public') {
		if (!match(a.secret ?? '', /^AGE-SECRET-KEY-[A-Z0-9-]+$/)) die('私钥格式不对');
		let o = trim(sh(sprintf('%s age convert %s', core, shq(a.secret))).out);
		if (!match(o, /^age1/)) die('无法计算公钥：' + o);
		return { public: o };
	}
	let o = sh(sprintf('%s age %s', core, a.algo == 'pq' ? 'keygen-pq' : 'keygen')).out;
	let sec = match(o, /(AGE-SECRET-KEY-[A-Z0-9-]+)/), pub = match(o, /(age1[a-z0-9]+)/);
	if (!sec) die('生成失败：' + trim(o));
	return { secret: sec[1], public: pub ? pub[1] : null };
};

/* 备份文件放到面板的 dl 目录，用随机文件名直接下载，10 分钟后删除 */
function dl_put(src, name) {
	mkdir(DL_DIR);
	sh(sprintf('find %s -type f -mmin +10 -delete 2>/dev/null', DL_DIR));
	let rnd = trim(sh("tr -dc 'a-z0-9' < /dev/urandom | head -c 24").out);
	let dir = DL_DIR + '/' + rnd;
	mkdir(dir);
	let dst = dir + '/' + name;
	sh(sprintf('mv -f %s %s', shq(src), shq(dst)));
	sh(sprintf("nohup sh -c 'sleep 600; rm -rf %s' >/dev/null 2>&1 </dev/null &", dir));
	return { url: 'dl/' + rnd + '/' + urlenc(name), name, size: stat(dst)?.size };
}

P.backup_file = function(a) {
	const SCOPES = {
		all: 'cp -f /etc/config/openclash /etc/openclash/openclash; tar -C /etc/openclash -czf %s . ; rm -f /etc/openclash/openclash',
		ex_core: "cp -f /etc/config/openclash /etc/openclash/openclash; echo core > /tmp/cmcp_ex.txt; echo ./core >> /tmp/cmcp_ex.txt; tar -C /etc/openclash -X /tmp/cmcp_ex.txt -czf %s . ; rm -f /etc/openclash/openclash /tmp/cmcp_ex.txt",
		config: "cp -f /etc/config/openclash /etc/openclash/openclash; tar -C /etc/openclash -czf %s ./openclash ./config ./custom ./overwrite 2>/dev/null; rm -f /etc/openclash/openclash",
		core: 'tar -C /etc/openclash -czf %s ./core',
		rule: 'tar -C /etc/openclash -czf %s ./rule_provider',
		proxy: 'tar -C /etc/openclash -czf %s ./proxy_provider',
	};
	let s = a.scope || 'config';
	if (!SCOPES[s]) die('未知备份类型');
	let tmp = '/tmp/cmcp_bk.tar.gz';
	sh('rm -f ' + tmp);
	sh(sprintf(SCOPES[s], tmp));
	if (!stat(tmp)) die('打包失败');
	return dl_put(tmp, sprintf('openclash-%s-%s.tar.gz', s, now_str()));
};

P.file_download = function(a) {
	let p = oc_file_path(a.kind, a.name);
	if (!stat(p)) die('文件不存在');
	let tmp = '/tmp/cmcp_dlfile';
	sh(sprintf('cp -f %s %s', shq(p), tmp));
	return dl_put(tmp, a.name);
};

P.restore = function(a) {
	if (type(a.b64) != 'string' || length(a.b64) < 40) die('没有收到备份文件');
	let tmp = '/tmp/cmcp_restore.tar.gz', dir = '/tmp/cmcp_restore';
	writefile(tmp + '.b64', a.b64);
	sh(sprintf('rm -rf %s; mkdir -p %s; base64 -d %s.b64 > %s; rm -f %s.b64', dir, dir, tmp, tmp, tmp));
	let t = sh(sprintf('tar -xzf %s -C %s 2>&1', tmp, dir));
	sh('rm -f ' + tmp);
	if (t.code != 0) { sh('rm -rf ' + dir); die('不是有效的 OpenClash 备份（tar.gz）：' + trim(t.out)); }
	let ls = sh(sprintf('cd %s && find . -maxdepth 2 | head -50', dir)).out;
	if (!match(ls, /\.\/(openclash|config|custom|overwrite|core|rule_provider|proxy_provider)/)) {
		sh('rm -rf ' + dir); die('备份里没有 OpenClash 的文件');
	}
	sh(sprintf('mkdir -p /etc/claude-mcp/bak; cp -f /etc/config/openclash /etc/claude-mcp/bak/openclash.uci.before-restore.%s; ' + BAK_PRUNE, now_str()));
	sh(sprintf('cd %s && for d in config custom overwrite core rule_provider proxy_provider; do [ -d "$d" ] && mkdir -p /etc/openclash/$d && cp -rf "$d"/. /etc/openclash/$d/; done; [ -f openclash ] && cp -f openclash /etc/config/openclash; chmod 755 /etc/openclash/core/* 2>/dev/null', dir));
	sh('rm -rf ' + dir);
	if (a.restart) restart_openclash_bg();
	return { ok: true, files: trim(ls) };
};

P.oc_reset = function(a) {
	if (a.confirm !== 'RESET') die('需要确认');
	sh(sprintf('mkdir -p /etc/claude-mcp/bak; cp -f /etc/config/openclash /etc/claude-mcp/bak/openclash.uci.before-reset.%s; ' + BAK_PRUNE, now_str()));
	sh("uci set openclash.config.enable=0; uci commit openclash; /etc/init.d/openclash stop >/dev/null 2>&1; mkdir -p /etc/openclash/custom /etc/openclash/overwrite /etc/openclash/rule_provider; cp -f /usr/share/openclash/backup/openclash /etc/config/openclash; cp -f /usr/share/openclash/backup/openclash_custom* /etc/openclash/custom/; cp -f /usr/share/openclash/backup/openclash_force_sniffing* /etc/openclash/custom/; cp -f /usr/share/openclash/backup/openclash_sniffing* /etc/openclash/custom/; cp -f /usr/share/openclash/backup/china_ip_route.ipset /etc/openclash/china_ip_route.ipset; cp -f /usr/share/openclash/backup/china_ip6_route.ipset /etc/openclash/china_ip6_route.ipset; cp -f /usr/share/openclash/backup/overwrite/default /etc/openclash/overwrite/default");
	return { ok: true };
};

P.overwrite_fetch = function(a) {
	let s = a.sid ? ucur().get_all('openclash', a.sid) : null;
	if (!s || s['.type'] != 'config_overwrite') die('找不到这个覆写模块');
	if (!match(s.url ?? '', /^https?:\/\/\S+$/)) die('这个模块没有订阅地址');
	if (!match(s.name ?? '', /^[A-Za-z0-9._-]+$/)) die('模块名只能包含字母、数字、点、下划线和横线');
	let tmp = '/tmp/cmcp_ow_dl';
	let r = sh(sprintf('curl -fsSL --connect-timeout 5 -m 30 --retry 2 %s -o %s', shq(s.url), tmp));
	if (r.code != 0 || !stat(tmp)?.size) { sh('rm -f ' + tmp); die('下载失败：' + trim(r.out)); }
	let p = '/etc/openclash/overwrite/' + s.name;
	oc_backup_file('overwrite', p);
	sh(sprintf('mv -f %s %s', tmp, shq(p)));
	return { ok: true, size: stat(p)?.size };
};

P.core_ps = function() {
	let pid = trim(sh("pidof clash 2>/dev/null | awk '{print $1}'").out);
	if (!length(pid)) return { running: false };
	let st = readfile('/proc/' + pid + '/status') ?? '';
	let rss = +(match(st, /VmRSS:\s+(\d+)/)?.[1] ?? 0) * 1024;
	return { running: true, pid: +pid, rss };
};

/* 快捷操作第二批，其余交给原来的 P.quick */
const QUICK_BASE = P.quick;
P.quick = function(a) {
	switch (a.action) {
	case 'flush_smart':
		try { api('POST', '/cache/smart/flush', null, 5); }
		catch (e) {
			if (index('' + (type(e) == 'object' ? e.message : e), '404') >= 0) return { ok: true, msg: '当前内核不是 Smart 版，没有 Smart 缓存，不需要清理' };
			die(type(e) == 'object' ? e.message : '' + e);
		}
		return { ok: true, msg: 'Smart 策略缓存已清空' };
	case 'stream_cache':
		sh('rm -rf /etc/openclash/history/streaming_unlock_cache');
		return { ok: true, msg: '流媒体解锁检测缓存已清空' };
	case 'one_key_update':
		bg('bash ' + OC_SH + "/openclash_update.sh 'one_key_update'");
		return { ok: true, msg: '一键更新已开始（插件 + 内核），完成后会自动重启' };
	case 'update_model':
		bg(OC_SH + '/openclash_lgbm.sh');
		return { ok: true, msg: 'LightGBM 模型开始在后台更新' };
	case 'update_geo_one': {
		let t = { ipdb: 1, geoip: 1, geosite: 1, geoasn: 1 };
		if (!t[a.arg]) die('未知数据库');
		bg(sprintf('%s/openclash_geo.sh %s', OC_SH, a.arg));
		return { ok: true, msg: '已开始在后台更新' };
	}
	case 'clear_start_log':
		sh(': > /tmp/openclash_start.log');
		return { ok: true, msg: '启动日志已清空' };
	}
	return QUICK_BASE(a);
};

P.oc_sections = function(a) {
	if (!OC_SEC_TYPES[a.type]) die('不支持的类型：' + a.type);
	let out = [];
	ucur().foreach('openclash', a.type, (s) => {
		let o = { sid: s['.name'] };
		for (let k, v in s) if (substr(k, 0, 1) != '.') o[k] = v;
		push(out, o);
	});
	return { sections: out };
};

P.oc_move = function(a) {
	let c = ucur(), t = a.sid ? c.get('openclash', a.sid) : null;
	if (!t || !OC_SEC_TYPES[t]) die('找不到这个条目');
	let list = [];
	c.foreach('openclash', t, (s) => push(list, s['.name']));
	let i = index(list, a.sid), j = i + (a.dir == 'up' ? -1 : 1);
	if (j < 0 || j >= length(list)) return { ok: true };
	let all = [];
	c.foreach('openclash', null, (s) => push(all, s['.name']));
	let pos = index(all, list[j]);
	c.reorder('openclash', a.sid, pos);
	c.commit('openclash');
	return { ok: true };
};

/* ---------------- 面板：第三批（终端、文件管理、拉黑） ---------------- */

function shell_allowed() { if (conf().allow_shell === false) die('路由器上已关闭命令行功能（claude-mcp shell on 可以重新打开）'); }

P.term = function(a) {
	shell_allowed();
	let cmd = '' + (a.cmd ?? ''), cwd = '' + (a.cwd || '/root');
	if (!length(trim(cmd))) die('命令为空');
	if (!stat(cwd)) cwd = '/';
	let t = +a.timeout || 60;
	if (t > 110) t = 110;
	let mark = '__CMCP_CWD__';
	let script = sprintf('cd %s 2>/dev/null || cd /\n%s\n__rc=$?\necho\necho %s"$(pwd)"\nexit $__rc', shq(cwd), cmd, mark);
	let r = sh(sprintf('timeout %d sh -c %s', t, shq(script)));
	let out = r.out, ncwd = cwd;
	let i = rindex(out, mark);
	if (i >= 0) { ncwd = trim(substr(out, i + length(mark))); out = substr(out, 0, i); }
	out = replace(out, /\n+$/, '');
	if (length(out) > 60000) out = '…（前面的输出太长，已省略）\n' + substr(out, length(out) - 60000);
	return { out, code: r.code == 124 || r.code == 143 ? 'timeout' : r.code, cwd: ncwd };
};

const FS_PROTECT = ['/', '/bin', '/boot', '/dev', '/etc', '/lib', '/overlay', '/proc', '/rom', '/root', '/sbin', '/sys', '/tmp', '/usr', '/var', '/www', '/etc/config', '/etc/init.d', '/usr/bin', '/usr/lib', '/usr/sbin', '/www-claude-mcp', '/www-claude-mcp/cgi-bin', '/etc/claude-mcp', '/etc/openclash'];
function fs_path(p) {
	if (type(p) != 'string' || substr(p, 0, 1) != '/' || index(p, '\0') >= 0) die('路径必须是以 / 开头的绝对路径');
	let parts = [];
	for (let x in split(p, '/')) {
		if (x == '' || x == '.') continue;
		if (x == '..') { pop(parts); continue; }
		push(parts, x);
	}
	return '/' + join('/', parts);
}
function fs_guard_write(p) {
	shell_allowed();
	if (index(FS_PROTECT, p) >= 0) die('这是系统关键目录，不能删除或改名：' + p);
	if (match(p, /^\/(proc|sys|dev|rom)(\/|$)/)) die('这个位置不能修改：' + p);
	if (p == '/www-claude-mcp/cgi-bin/mcp' || p == '/usr/bin/claude-mcp') die('这是面板自身的程序，不能在这里删除或改名');
}

P.fs_list = function(a) {
	let p = fs_path(a.path || '/');
	let st = stat(p);
	if (!st) die('不存在：' + p);
	if (st.type != 'directory') die('不是文件夹：' + p);
	let out = [];
	for (let n in (require('fs').lsdir(p) ?? [])) {
		let f = (p == '/' ? '' : p) + '/' + n, s = stat(f), l = require('fs').lstat(f);
		if (!l) continue;
		push(out, { name: n, dir: s?.type == 'directory', link: l.type == 'link', size: s?.size ?? 0, mtime: (s ?? l).mtime, mode: sprintf('%03o', ((s ?? l).mode ?? 0) & 4095) });
	}
	out = sort(out, (x, y) => (y.dir - x.dir) || (lc(x.name) < lc(y.name) ? -1 : 1));
	// 分区名很长时 BusyBox df 会换行：把数据行拼起来、从后往前数（可用、总共）
	let df = sh(sprintf("df -h %s 2>/dev/null | awk 'NR > 1 { l = l \" \" $0 } END { n = split(l, f, \" \"); if (n >= 6) print f[n - 2] \" 可用 / 共 \" f[n - 4] }'", shq(p))).out;
	return { path: p, items: out, free: trim(df) };
};

P.fs_read = function(a) {
	let p = fs_path(a.path), st = stat(p);
	if (!st) die('文件不存在');
	if (st.type != 'file') die('不是普通文件');
	if (st.size > 2 * 1024 * 1024) return { path: p, size: st.size, mtime: st.mtime, toobig: true };
	let s = readfile(p) ?? '';
	for (let c = 0; c < 9; c++) if (index(s, chr(c)) >= 0) return { path: p, size: st.size, mtime: st.mtime, binary: true };
	return { path: p, size: st.size, mtime: st.mtime, content: s };
};

P.fs_write = function(a) {
	let p = fs_path(a.path);
	shell_allowed();
	if (match(p, /^\/(proc|sys|dev|rom)(\/|$)/)) die('这个位置不能写入');
	let st = stat(p);
	if (st && st.type == 'directory') die('这是文件夹');
	if (st && !a.overwrite && a.create) die('已经有同名文件');
	let dir = replace(p, /\/[^\/]*$/, '') || '/';
	if (!stat(dir)) die('文件夹不存在：' + dir);
	let bak = null;
	if (st && st.size < 2 * 1024 * 1024) {
		mkdir('/etc/claude-mcp/bak');
		bak = sprintf('/etc/claude-mcp/bak/file.%s.%s', replace(p, /\//g, '_'), now_str());
		sh(sprintf('cp -f %s %s; ' + BAK_PRUNE, shq(p), shq(bak)));
	}
	let tmp = p + '.cmcp_tmp';
	if (a.b64 != null) {
		writefile(tmp + '.b64', a.b64);
		let r = sh(sprintf('base64 -d %s > %s; rm -f %s', shq(tmp + '.b64'), shq(tmp), shq(tmp + '.b64')));
		if (r.code != 0) { sh('rm -f ' + shq(tmp)); die('文件解码失败'); }
	} else {
		if (type(a.content) != 'string') die('缺少内容');
		if (writefile(tmp, a.content) == null) die('写入失败（空间不足或没有权限？）');
	}
	if (st) sh(sprintf('chmod --reference=%s %s 2>/dev/null', shq(p), shq(tmp)));
	rename(tmp, p);
	return { ok: true, backup: bak, size: stat(p)?.size };
};

P.fs_mkdir = function(a) {
	let p = fs_path(a.path);
	shell_allowed();
	if (stat(p)) die('已经存在');
	let r = sh('mkdir -p ' + shq(p));
	if (r.code != 0) die(trim(r.out));
	return { ok: true };
};

P.fs_delete = function(a) {
	let p = fs_path(a.path);
	fs_guard_write(p);
	let st = require('fs').lstat(p);
	if (!st) die('不存在');
	if (st.type == 'directory' && !a.recursive) {
		let n = length(require('fs').lsdir(p) ?? []);
		if (n) die('文件夹不是空的（里面有 ' + n + ' 项）');
	}
	let r = sh('rm -rf ' + shq(p));
	if (r.code != 0) die(trim(r.out));
	return { ok: true };
};

P.fs_rename = function(a) {
	let p = fs_path(a.path), q = fs_path(a.to);
	fs_guard_write(p);
	if (stat(q)) die('目标已存在');
	let r = sh(sprintf('mv %s %s', shq(p), shq(q)));
	if (r.code != 0) die(trim(r.out));
	return { ok: true };
};

P.fs_copy = function(a) {
	let p = fs_path(a.path), q = fs_path(a.to);
	shell_allowed();
	if (stat(q)) die('目标已存在');
	let r = sh(sprintf('cp -a %s %s', shq(p), shq(q)));
	if (r.code != 0) die(trim(r.out));
	return { ok: true };
};

P.fs_chmod = function(a) {
	let p = fs_path(a.path);
	fs_guard_write(p);
	if (!match('' + a.mode, /^[0-7]{3,4}$/)) die('权限格式不对，例如 755');
	let r = sh(sprintf('chmod %s %s', a.mode, shq(p)));
	if (r.code != 0) die(trim(r.out));
	return { ok: true };
};

P.fs_download = function(a) {
	let p = fs_path(a.path), st = stat(p);
	if (!st) die('不存在');
	let name = replace(p, /.*\//, '') || 'root';
	let tmp = '/tmp/cmcp_fsdl';
	sh('rm -rf ' + tmp);
	if (st.type == 'directory') {
		let r = sh(sprintf('tar -czf %s -C %s %s', tmp, shq(replace(p, /\/[^\/]*$/, '') || '/'), shq(name)));
		if (r.code != 0 && !stat(tmp)) die('打包失败');
		name += '.tar.gz';
	} else {
		if (st.size > 200 * 1024 * 1024) die('文件太大');
		sh(sprintf('cp -f %s %s', shq(p), tmp));
	}
	return dl_put(tmp, name);
};

/* ---------- 拉黑名单：被拉黑的设备所有流量直连（只能用大陆网络） ---------- */
const BL_FILE = '/etc/claude-mcp/blacklist.json';
const BL_PROVIDER = 'cmcp_blacklist';
const BL_RULESET = '/etc/openclash/rule_provider/cmcp_blacklist.yaml';
const BL_CUSTOM = '/etc/openclash/custom/openclash_custom_rules.list';
const BL_MARK = '# [cmcp-blacklist]';

function bl_load() { let j = null; try { j = json(readfile(BL_FILE) ?? '[]'); } catch (e) {} return type(j) == 'array' ? j : []; }
function bl_save(l) { writefile(BL_FILE + '.tmp', sprintf('%J', l)); rename(BL_FILE + '.tmp', BL_FILE); }
// 规则集的内容在共用库里生成（cmcp-route 也要用）：被拉黑的设备、路由器自己的隧道、面板走直连时的面板域名
function bl_write_ruleset(l) { CL.bl_ruleset_write(); }
function bl_custom_ready() { return index(readfile(BL_CUSTOM) ?? '', BL_MARK) >= 0; }
function bl_live() { try { let r = api('GET', '/providers/rules', null, 4); return !!(r?.providers?.[BL_PROVIDER]); } catch (e) { return false; } }
function bl_mac(m) { m = lc(trim('' + (m ?? ''))); if (!match(m, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) die('MAC 地址不对：' + m); return m; }

/* 给设备固定 IP（已有固定分配就沿用），返回最终 IP */
function bl_pin(mac, ip, name) {
	let c = require('uci').cursor(), found = null;
	c.load('dhcp');
	c.foreach('dhcp', 'host', (s) => {
		let macs = type(s.mac) == 'array' ? s.mac : split(lc(s.mac ?? ''), ' ');
		for (let m in macs) if (lc(m) == mac) found = s;
	});
	if (found) return { ip: found.ip, created: false };
	if (!match(ip ?? '', /^\d+\.\d+\.\d+\.\d+$/)) die('这台设备现在没有 IP，先让它连上网再拉黑');
	let sid = c.add('dhcp', 'host');
	c.set('dhcp', sid, 'mac', mac);
	c.set('dhcp', sid, 'ip', ip);
	if (name && match(name, /^[A-Za-z0-9._-]+$/)) c.set('dhcp', sid, 'name', name);
	c.set('dhcp', sid, 'cmcp_black', '1');
	c.commit('dhcp');
	sh('/etc/init.d/dnsmasq reload >/dev/null 2>&1');
	return { ip, created: true };
}
function bl_unpin(mac) {
	let c = require('uci').cursor(), del = [];
	c.load('dhcp');
	c.foreach('dhcp', 'host', (s) => { if (s.cmcp_black == '1' && lc(s.mac ?? '') == mac) push(del, s['.name']); });
	for (let s in del) c.delete('dhcp', s);
	if (length(del)) { c.commit('dhcp'); sh('/etc/init.d/dnsmasq reload >/dev/null 2>&1'); }
}
function bl_apply(ip) {
	try { api('PUT', '/providers/rules/' + BL_PROVIDER, null, 10); } catch (e) { return false; }
	if (ip) try {
		for (let cn in (api('GET', '/connections', null, 5)?.connections ?? []))
			if (cn.metadata?.sourceIP == ip) try { api('DELETE', '/connections/' + cn.id, null, 3); } catch (e) {}
	} catch (e) {}
	return true;
}

/* ---------- 看门狗：断线记录 ---------- */
const WD_EV = '/etc/claude-mcp/events.log';

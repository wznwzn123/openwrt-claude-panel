P.oc_state = function() {
	let a = oc_all(), cfg = a.config, FS = require('fs');
	let ver = null, live = null;
	try { ver = api('GET', '/version', null, 3); live = api('GET', '/configs', null, 3); } catch (e) {}
	let files = [];
	for (let n in (FS.lsdir('/etc/openclash/config') ?? [])) {
		if (!match(n, /\.ya?ml$/)) continue;
		let p = '/etc/openclash/config/' + n, st = stat(p);
		let sub = null;
		for (let s in a.subs) if (s.name + '.yaml' == n || s.name + '.yml' == n) sub = s.name;
		push(files, { name: n, path: p, size: st?.size, mtime: st?.mtime, active: cfg.config_path == p, sub });
	}
	files = sort(files, (x, y) => (y.active ? 1 : 0) - (x.active ? 1 : 0) || (x.name < y.name ? -1 : 1));
	let core = ver?.version;
	if (!core) {
		let m = match(sh('/etc/openclash/clash -v 2>/dev/null | head -1').out, /(alpha-[0-9a-z]+|v[0-9.]+[0-9a-z.-]*)/);
		core = m ? m[1] : null;
	}
	let pm = match(sh('(opkg list-installed luci-app-openclash 2>/dev/null; apk list -I luci-app-openclash 2>/dev/null) | head -1').out, /([0-9]+\.[0-9]+\.[0-9]+(-r[0-9]+)?)/);
	return {
		running: !!ver, core, plugin: pm ? pm[1] : null,
		mode: live?.mode ?? cfg.proxy_mode, log_level: live?.['log-level'] ?? cfg.log_level,
		tun: live?.tun?.enable ?? null, mixed_port: live?.['mixed-port'],
		lan_ip: replace(uci_get('network.lan.ipaddr') ?? '', /\/.*/, ''),
		cfg, files, subs: a.subs, dns: a.dns, overwrite: a.overwrite, auth: a.auth,
		jobs: oc_jobs(),
	};
};

P.oc_set = function(a) {
	let c = ucur(), n = 0;
	for (let k, v in (a.set ?? {})) {
		opt_key(k);
		if (v == null || v === '') c.delete('openclash', 'config', k);
		else c.set('openclash', 'config', k, opt_val(v));
		n++;
	}
	if (!n) die('没有要修改的选项');
	c.commit('openclash');
	if (a.restart) restart_openclash_bg();
	return { ok: true, changed: n, restarting: !!a.restart };
};

P.oc_sec = function(a) {
	let c = ucur(), sid = a.sid;
	if (a.op == 'add') {
		if (!OC_SEC_TYPES[a.type]) die('不支持的类型：' + a.type);
		sid = c.add('openclash', a.type);
		if (!sid) die('添加失败');
	} else {
		let t = sid ? c.get('openclash', sid) : null;
		if (!t || !OC_SEC_TYPES[t]) die('找不到这个条目（可能已被删除）');
	}
	let old_name = a.op == 'delete' ? c.get('openclash', sid, 'name') : null;
	if (a.op == 'delete') c.delete('openclash', sid);
	else
		for (let k, v in (a.values ?? {})) {
			opt_key(k);
			if (v == null || v === '') c.delete('openclash', sid, k);
			else c.set('openclash', sid, k, opt_val(v));
		}
	c.commit('openclash');
	let removed = null;
	if (old_name && a.delete_file) {
		let p = '/etc/openclash/config/' + old_name + '.yaml';
		if (stat(p) && uci_get('openclash.config.config_path') != p) { oc_backup_file('config', p); sh('rm -f ' + shq(p)); removed = p; }
	}
	if (a.restart) restart_openclash_bg();
	return { ok: true, sid, removed };
};

P.sub_update = function(a) {
	if (oc_jobs().sub) die('已有订阅正在更新，请稍等');
	bg(sprintf('%s/openclash.sh %s', OC_SH, a.name ? shq(a.name) : ''));
	return { ok: true };
};

P.sub_info = function(a) {
	let s = a.sid ? ucur().get_all('openclash', a.sid) : null;
	if (!s?.address) die('这个订阅没有填写地址');
	let url = trim(split(s.address, '\n')[0]);
	let r = sh(sprintf('curl -sS -L -m 12 -o /dev/null -D - -A %s %s', shq(s.sub_ua || 'clash.meta'), shq(url)));
	let m = match(lc(r.out), /subscription-userinfo:[ \t]*([^\r\n]+)/);
	if (!m) return { ok: false, msg: r.code != 0 ? '订阅地址连接失败' : '这个机场没有提供流量信息' };
	let o = { ok: true };
	for (let kv in split(m[1], ';')) {
		let p = match(trim(kv), /^([a-z]+)=([0-9.e+]+)/);
		if (p) o[p[1]] = +p[2];
	}
	return o;
};

P.files = function(a) {
	let d = OC_FILE_DIRS[a.kind];
	if (!d) die('未知目录：' + a.kind);
	let out = [];
	for (let n in (require('fs').lsdir(d) ?? [])) {
		let st = stat(d + '/' + n);
		if (st?.type == 'file') push(out, { name: n, size: st.size, mtime: st.mtime });
	}
	return { dir: d, files: sort(out, (x, y) => x.name < y.name ? -1 : 1) };
};

P.file_read = function(a) {
	let p = oc_file_path(a.kind, a.name), st = stat(p);
	if (!st) die('文件不存在：' + a.name);
	if (st.size > 3 * 1024 * 1024) die('文件超过 3MB，手机上不方便查看');
	let s = readfile(p) ?? '';
	let bin = false;
	for (let c = 0; c < 9 && !bin; c++) if (index(s, chr(c)) >= 0) bin = true;
	if (bin) return { name: a.name, size: st.size, mtime: st.mtime, binary: true };
	return { name: a.name, size: st.size, mtime: st.mtime, content: s };
};

P.file_save = function(a) {
	if (type(a.content) != 'string') die('缺少文件内容');
	if (a.kind == 'custom' && (a.name == 'openclash_custom_rules.list' || a.name == 'openclash_custom_rules_2.list'))
		return { ok: true, msg: T.set_custom_rules({ content: a.content, file: a.name == 'openclash_custom_rules.list' ? 1 : 2, apply: !!a.restart, enable: true, force: !!a.force }) };
	let p = oc_file_path(a.kind, a.name);
	if (a.kind == 'config' && !match(a.name, /\.ya?ml$/)) die('配置文件名必须以 .yaml 结尾');
	if (a.kind == 'config' && !a.force) {
		let tmp = '/tmp/cmcp_cfgtest.yaml';
		writefile(tmp, a.content);
		let r = sh('/etc/openclash/clash -t -d /etc/openclash -f ' + tmp + ' 2>&1 | tail -n 6');
		sh('rm -f ' + tmp);
		if (index(r.out, 'test failed') >= 0 || index(lc(r.out), 'error') >= 0 && index(r.out, 'successful') < 0)
			die('配置文件校验没通过，没有保存：\n' + trim(r.out));
	}
	let b = oc_backup_file(a.kind, p);
	if (writefile(p + '.cmcp_tmp', a.content) == null) die('写入失败');
	rename(p + '.cmcp_tmp', p);
	if (a.kind == 'custom' && match(a.name, /\.sh$/)) sh('chmod 755 ' + shq(p));
	let restarting = false;
	if (a.restart) { restart_openclash_bg(); restarting = true; }
	return { ok: true, backup: b, restarting };
};

P.file_delete = function(a) {
	let p = oc_file_path(a.kind, a.name);
	if (!stat(p)) die('文件不存在');
	if (a.kind == 'custom') die('自定义文件不能删除，可以清空内容');
	if (a.kind == 'config' && uci_get('openclash.config.config_path') == p) die('这是正在使用的配置文件，先切换到其他配置再删除');
	let b = oc_backup_file(a.kind, p);
	sh('rm -f ' + shq(p));
	return { ok: true, backup: b };
};

P.file_rename = function(a) {
	let p = oc_file_path(a.kind, a.name), q = oc_file_path(a.kind, a.to);
	if (a.kind != 'config') die('只能重命名配置文件');
	if (!match(a.to, /\.ya?ml$/)) die('新名字必须以 .yaml 结尾');
	if (!stat(p)) die('文件不存在');
	if (stat(q)) die('已有同名文件');
	rename(p, q);
	let c = ucur(), changed = false;
	if (uci_get('openclash.config.config_path') == p) { c.set('openclash', 'config', 'config_path', q); changed = true; }
	if (changed) c.commit('openclash');
	return { ok: true, active_changed: changed };
};

P.cfg_switch = function(a) {
	let p = oc_file_path('config', a.name);
	if (!stat(p)) die('配置文件不存在');
	let c = ucur();
	c.set('openclash', 'config', 'config_path', p);
	c.set('openclash', 'config', 'enable', '1');
	c.commit('openclash');
	restart_openclash_bg();
	return { ok: true };
};

P.quick = function(a) {
	let act = a.action;
	switch (act) {
	case 'start':
	case 'stop':
	case 'restart': {
		let c = ucur();
		c.set('openclash', 'config', 'enable', act == 'stop' ? '0' : '1');
		c.commit('openclash');
		bg(sprintf('sleep 2; /etc/init.d/openclash %s', act));
		return { ok: true, msg: { start: 'OpenClash 正在启动', stop: 'OpenClash 正在停止', restart: 'OpenClash 正在重启' }[act] };
	}
	case 'flush_dns': {
		let r1 = api('POST', '/cache/fakeip/flush', null, 5), r2 = null;
		try { r2 = api('POST', '/cache/dns/flush', null, 5); } catch (e) {}
		return { ok: true, msg: 'DNS 缓存和 Fake-IP 缓存已清空' };
	}
	case 'update_geo':
		bg(sprintf('for t in ipdb geoip geosite geoasn; do %s/openclash_geo.sh $t; done', OC_SH));
		return { ok: true, msg: 'GEO 数据库开始在后台更新（ipdb、GeoIP、GeoSite、ASN）' };
	case 'update_chnroute':
		bg(OC_SH + '/openclash_chnroute.sh');
		return { ok: true, msg: '大陆白名单开始在后台更新' };
	case 'update_core':
		bg('bash ' + OC_SH + "/openclash_core.sh 'Meta'");
		return { ok: true, msg: '内核开始在后台更新，完成后 OpenClash 会自动重启' };
	case 'update_plugin':
		bg('bash ' + OC_SH + "/openclash_update.sh 'plugin_update'");
		return { ok: true, msg: '插件开始在后台更新，完成后会自动重启' };
	case 'reload_firewall':
		bg('/etc/init.d/openclash reload firewall');
		return { ok: true, msg: '正在重新加载 OpenClash 防火墙规则' };
	case 'clear_log':
		sh(': > /tmp/openclash.log');
		return { ok: true, msg: '插件日志已清空' };
	case 'log_level':
		if (index(['debug', 'info', 'warning', 'error', 'silent'], a.arg) < 0) die('日志级别不对');
		api('PATCH', '/configs', { 'log-level': a.arg });
		return { ok: true, msg: '内核日志级别已改为 ' + a.arg + '（重启后恢复插件设置）' };
	case 'debug': {
		sh(sprintf('timeout 90 %s/openclash_debug.sh >/dev/null 2>&1', OC_SH));
		let t = readfile('/tmp/openclash_debug.log') ?? '';
		return { ok: true, text: length(t) > 200000 ? substr(t, 0, 200000) + '\n…（已截断）' : t };
	}
	case 'restart_dashboard':
		return { ok: true };
	}
	die('未知操作：' + act);
};

P.jobs = function() {
	let t = sh('tail -n 12 /tmp/openclash.log').out;
	return { jobs: oc_jobs(), log: t };
};

P.versions = function(a) {
	let br = uci_get('openclash.config.release_branch') || 'master';
	let r = sh(sprintf("timeout 40 lua -e 'local ov=dofile(\"%s/openclash_version.lua\"); local c=ov.fetch_version_history(\"%s\", %s); print(require(\"luci.jsonc\").stringify(c and c.latest or {}))'",
		OC_SH, replace(br, /[^a-z]/g, ''), a.force ? 'true' : 'false'));
	let latest = {};
	try { latest = json(trim(r.out)); } catch (e) {}
	let st = P.oc_state();
	return { core: st.core, plugin: st.plugin, latest, branch: br };
};

P.myip = function() {
	let d = '/tmp/cmcp_ip';
	const Q = {
		ipip: 'http://myip.ipip.net',
		cn3322: 'http://ip.3322.net',
		ipsb: 'https://api.ip.sb/geoip',
		ipinfo: 'https://ipinfo.io/json',
		cf: 'https://www.cloudflare.com/cdn-cgi/trace',
		// 中文的归属地和运营商，还能看出是不是机房 IP
		ipapi: 'http://ip-api.com/json/?lang=zh-CN&fields=status,query,country,regionName,city,isp,as,hosting,proxy,mobile',
	};
	let cmd = ['rm -rf ' + d, 'mkdir -p ' + d];
	for (let k, u in Q) push(cmd, sprintf("curl -sS -m 8 -A 'Mozilla/5.0 (Linux; Android 14)' %s > %s/%s 2>/dev/null &", shq(u), d, k));
	// IPv6：只走 IPv6 去问，问得到就是有 IPv6
	push(cmd, sprintf("curl -6 -sS -m 6 %s > %s/v6 2>/dev/null &", shq('https://api6.ipify.org'), d));
	sh(join('\n', cmd) + '\nwait');
	let rd = (k) => trim(readfile(d + '/' + k) ?? '');
	let out = { domestic: null, overseas: [], v6: null };
	let t = rd('ipip'), m = match(t, /([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/), gp = index(t, '来自于');
	if (m) out.domestic = { src: 'IPIP.net', ip: m[1], geo: gp >= 0 ? trim(replace(substr(t, gp + length('来自于')), /^(：|:)/, '')) : '' };
	else if (match(rd('cn3322'), /^[0-9.]+$/)) out.domestic = { src: '3322.net', ip: rd('cn3322'), geo: '' };
	try { let j = json(rd('ipsb')); if (j?.ip) push(out.overseas, { src: 'IP.SB', ip: j.ip, geo: join(' ', filter([j.country, j.region != j.country ? j.region : null, j.city, j.organization ?? j.isp], (x) => x)) }); } catch (e) {}
	try { let j = json(rd('ipinfo')); if (j?.ip) push(out.overseas, { src: 'IPinfo', ip: j.ip, geo: join(' ', filter([j.country, j.region, j.city, j.org], (x) => x)) }); } catch (e) {}
	try {
		let j = json(rd('ipapi'));
		if (j?.status == 'success' && j.query) {
			let kind = j.hosting ? '机房 IP' : j.mobile ? '移动网络' : '家庭宽带';
			push(out.overseas, { src: 'ip-api', ip: j.query, geo: join(' ', filter([j.country, j.regionName != j.country ? j.regionName : null, j.city, j.isp], (x) => x)), kind, asn: j.as ?? null });
		}
	} catch (e) {}
	let v6 = rd('v6');
	if (match(v6, /^[0-9a-fA-F:]+$/) && index(v6, ':') >= 0) out.v6 = v6;
	let cf = rd('cf'), ci = match(cf, /ip=([^\n]+)/), cl = match(cf, /loc=([^\n]+)/), cc = match(cf, /colo=([^\n]+)/);
	if (ci) push(out.overseas, { src: 'Cloudflare', ip: ci[1], geo: (cl ? cl[1] : '') + (cc ? ' · 机房 ' + cc[1] : '') });
	sh('rm -rf ' + d);
	return out;
};

P.site_check = function(a) {
	let sites = a.sites ?? [
		{ key: 'baidu', url: 'https://www.baidu.com' }, { key: 'taobao', url: 'https://www.taobao.com' },
		{ key: 'google', url: 'https://www.google.com/generate_204' }, { key: 'github', url: 'https://github.com' },
		{ key: 'youtube', url: 'https://www.youtube.com' }, { key: 'claude', url: 'https://claude.ai' },
	];
	let d = '/tmp/cmcp_site', cmd = ['rm -rf ' + d, 'mkdir -p ' + d], i = 0;
	for (let s in sites) {
		if (!match(s.url ?? '', /^https?:\/\/[A-Za-z0-9.:\/_?=&%-]+$/)) die('地址不合法：' + s.url);
		push(cmd, sprintf("curl -sk -o /dev/null -m 8 -A 'Mozilla/5.0' -w '%%{http_code} %%{time_connect} %%{time_starttransfer}' %s > %s/%d 2>/dev/null &", shq(s.url), d, i++));
	}
	sh(join('\n', cmd) + '\nwait');
	let out = [];
	i = 0;
	for (let s in sites) {
		let p = split(trim(readfile(d + '/' + (i++)) ?? ''), ' ');
		let code = +p[0] || 0;
		push(out, { key: s.key, url: s.url, ok: code > 0 && code < 500, code, ms: code ? int((+p[2] || +p[1] || 0) * 1000 + 0.5) : null });
	}
	sh('rm -rf ' + d);
	return { sites: out };
};

P.unlock = function(a) {
	let list = a.services;
	if (type(list) != 'array' || !length(list)) list = split(uci_get('openclash.config.unlock_check_services') || 'netflix,ytb,openai,claude', ',');
	let d = '/tmp/cmcp_unlock', cmd = ["rm -rf " + d, "mkdir -p " + d], ks = [];
	for (let k in list) {
		k = trim(k);
		if (!UNLOCK_LABELS[k] || index(ks, k) >= 0) continue;
		push(ks, k);
		push(cmd, sprintf('timeout 60 lua %s/openclash_streaming_unlock.lua %s check > %s/%s 2>/dev/null &', OC_SH, shq(UNLOCK_LABELS[k]), d, k));
	}
	if (!length(ks)) die('没有可检测的服务');
	sh(join('\n', cmd) + '\nwait');
	// 同时检测时偶尔会有个别服务失败（互相抢资源），失败的再单独测一次
	let rd = (k) => { let r = null; for (let l in split(readfile(d + '/' + k) ?? '', '\n')) if (match(l, /^\{/)) try { r = json(l); } catch (e) {} return r; };
	for (let k in ks) if (!(+(rd(k)?.st) > 0)) sh(sprintf('timeout 30 lua %s/openclash_streaming_unlock.lua %s check > %s/%s 2>/dev/null', OC_SH, shq(UNLOCK_LABELS[k]), d, k));
	let out = [];
	for (let k in ks) {
		let r = rd(k);
		push(out, { key: k, label: UNLOCK_LABELS[k], st: r?.st ?? 0, region: r?.region, node: r?.node });
	}
	sh('rm -rf ' + d);
	return { results: out, all: keys(UNLOCK_LABELS) };
};

P.providers = function() {
	let px = {}, rs = {};
	try { px = api('GET', '/providers/proxies')?.providers ?? {}; } catch (e) {}
	try { rs = api('GET', '/providers/rules')?.providers ?? {}; } catch (e) {}
	let out = { proxies: [], rules: [] };
	for (let n, p in px) {
		if (p.vehicleType == 'Compatible' || n == 'default') continue;
		push(out.proxies, { name: n, vehicle: p.vehicleType, updated: p.updatedAt, count: length(p.proxies ?? []), info: p.subscriptionInfo });
	}
	for (let n, p in rs)
		push(out.rules, { name: n, behavior: p.behavior, format: p.format, vehicle: p.vehicleType, updated: p.updatedAt, count: p.ruleCount });
	return out;
};

P.provider_update = function(a) {
	if (a.kind != 'proxies' && a.kind != 'rules') die('kind 只能是 proxies / rules');
	if (!a.name) die('缺少名称');
	if (a.health) api('GET', '/providers/proxies/' + urlenc(a.name) + '/healthcheck', null, 60);
	else api('PUT', '/providers/' + a.kind + '/' + urlenc(a.name), null, 60);
	return { ok: true };
};

P.rules = function(a) {
	let list = api('GET', '/rules')?.rules ?? [], kw = a.filter ? lc(a.filter) : null, out = [], i = 0;
	for (let r in list) {
		i++;
		if (kw && index(lc((r.type ?? '') + ' ' + (r.payload ?? '') + ' ' + (r.proxy ?? '')), kw) < 0) continue;
		push(out, { i, type: r.type, payload: r.payload, proxy: r.proxy, size: r.size });
	}
	let off = +a.offset || 0, lim = +a.limit || 200;
	return { total: length(list), matched: length(out), rules: slice(out, off, off + lim) };
};

P.backup = function(a) {
	let f = '/tmp/cmcp_backup.tar.gz';
	sh(sprintf('cd / && tar -czf %s etc/config/openclash etc/openclash/config etc/openclash/custom etc/openclash/overwrite 2>/dev/null', f));
	let st = stat(f);
	if (!st) die('打包失败');
	let b64 = sh('base64 ' + f + ' | tr -d "\\n"').out;
	sh('rm -f ' + f);
	return { name: 'openclash-backup-' + now_str() + '.tar.gz', size: st.size, b64 };
};


/* ---------------- 面板：第二批（设置结构、按钮、诊断、日志、备份） ---------------- */

const OC_CBI = '/etc/claude-mcp/oc_cbi.lua';
const OC_PAGES = { 'settings': 1, 'config-overwrite': 1, 'config-subscribe': 1, 'config-subscribe-edit': 1, 'custom-dns-edit': 1 };
const DL_DIR = '/www-claude-mcp/panel/dl';

function cbi_call(args, timeout) {
	let r = sh(sprintf('timeout %d lua %s %s', timeout || 60, OC_CBI, join(' ', map(args, (x) => shq(x)))));
	let j = null;
	for (let l in split(r.out, '\n')) if (match(l, /^\{/)) try { j = json(l); } catch (e) {}
	if (!j) die('读取 OpenClash 页面定义失败：' + substr(trim(r.out), 0, 300));
	if (j.error) die(j.error);
	return j;
}


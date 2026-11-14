P.devices = function() {
	let leases = lease_map();
	let arp = {}, wdev = {};
	for (let w in ['wan', 'wan6']) try { let st = json(sh('ifstatus ' + w).out); if (st?.l3_device) wdev[st.l3_device] = 1; if (st?.device) wdev[st.device] = 1; } catch (e) {}
	for (let l in split(readfile('/proc/net/arp') ?? '', '\n')) {
		let m = match(l, /^(\d+\.\d+\.\d+\.\d+)\s+\S+\s+(0x\S+)\s+([0-9a-fA-F:]{17})\s+\S+\s+(\S+)/);
		if (m && m[2] != '0x0' && m[3] != '00:00:00:00:00:00' && !wdev[m[4]]) arp[m[1]] = { mac: lc(m[3]), dev: m[4] };
	}
	let stats = {};
	try {
		for (let c in (api('GET', '/connections', null, 5)?.connections ?? [])) {
			let ip = c.metadata?.sourceIP;
			if (!ip) continue;
			if (!stats[ip]) stats[ip] = { conns: 0, dl: 0, ul: 0, proxied: 0 };
			stats[ip].conns++;
			stats[ip].dl += +c.download || 0;
			stats[ip].ul += +c.upload || 0;
			if ((c.chains ?? [])[0] && c.chains[0] != 'DIRECT') stats[ip].proxied++;
		}
	} catch (e) {}

	let seen = {}, list = [];
	function add(ip) {
		if (seen[ip]) return;
		seen[ip] = 1;
		let l = leases[ip] ?? {}, a = arp[ip] ?? {};
		push(list, { ip, mac: l.mac ?? a.mac, name: l.name, online: !!arp[ip] || !!stats[ip], iface: a.dev, stats: stats[ip] });
	}
	for (let ip in keys(leases)) add(ip);
	for (let ip in keys(arp)) add(ip);
	for (let ip in keys(stats)) if (match(ip, /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./)) add(ip);
	list = sort(list, (x, y) => ((y.online ? 1 : 0) - (x.online ? 1 : 0)) || ((y.stats?.dl ?? 0) - (x.stats?.dl ?? 0)));
	return { devices: list };
};

P.connections = function(a) {
	let data = api('GET', '/connections');
	let leases = lease_map();
	let kw = a?.filter ? lc(a.filter) : null, list = [];
	for (let c in (data?.connections ?? [])) {
		let m = c.metadata ?? {};
		let e = {
			id: c.id,
			host: (m.host || m.sniffHost || m.destinationIP || '?'),
			port: m.destinationPort,
			net: m.network,
			src: m.sourceIP,
			src_name: leases[m.sourceIP]?.name,
			rule: (c.rule ?? '') + (length(c.rulePayload ?? '') ? ':' + c.rulePayload : ''),
			chain: c.chains ?? [],
			dl: +c.download || 0,
			ul: +c.upload || 0,
			start: c.start,
		};
		if (kw && index(lc(sprintf('%J', e)), kw) < 0) continue;
		push(list, e);
	}
	list = sort(list, (x, y) => (y.dl + y.ul) - (x.dl + x.ul));
	if (length(list) > 300) list = slice(list, 0, 300);
	return { total: length(data?.connections ?? []), download_total: data?.downloadTotal, upload_total: data?.uploadTotal, connections: list };
};

/* ---------------- 面板：OpenClash 全功能接口 ---------------- */

const OC_SH = '/usr/share/openclash';
const OC_FILE_DIRS = {
	config: '/etc/openclash/config',
	custom: '/etc/openclash/custom',
	overwrite: '/etc/openclash/overwrite',
	proxy_provider: '/etc/openclash/proxy_provider',
	rule_provider: '/etc/openclash/rule_provider',
};
const OC_SEC_TYPES = { config_subscribe: 1, dns_servers: 1, config_overwrite: 1, authentication: 1, lan_ac_traffic: 1 };
const UNLOCK_LABELS = {
	prime_video: 'Amazon Prime Video', bahamut: 'Bahamut Anime', bilibili: 'Bilibili', claude: 'Claude',
	dazn: 'DAZN', discovery: 'Discovery Plus', disney: 'Disney Plus', gemini: 'Gemini', google: 'Google',
	hbo_max: 'HBO Max', netflix: 'Netflix', openai: 'OpenAI', paramount: 'Paramount Plus', spotify: 'Spotify',
	steam: 'Steam', tvb: 'TVB Anywhere+', ytb: 'YouTube Premium',
};
const OC_JOBS = {
	sub: 'openclash\\.sh', geo: 'openclash_geo\\.sh', chnroute: 'openclash_chnroute\\.sh',
	core: 'openclash_core\\.sh', plugin: 'openclash_update\\.sh', debug: 'openclash_debug\\.sh',
	service: '/etc/init\\.d/openclash',
};

function ucur() { let c = require('uci').cursor(); c.load('openclash'); return c; }
function bg(cmd) { sh(sprintf('nohup sh -c %s >/dev/null 2>&1 </dev/null &', shq(cmd))); }
function opt_key(k) { if (type(k) != 'string' || !match(k, /^[a-z0-9_]+$/)) die('非法选项：' + k); return k; }
function opt_val(v) {
	if (type(v) == 'array') return map(v, (x) => '' + x);
	if (type(v) == 'bool') return v ? '1' : '0';
	return '' + v;
}

function oc_all() {
	let all = ucur().get_all('openclash') ?? {};
	let secs = sort(values(all), (a, b) => a['.index'] - b['.index']);
	let out = { config: {}, subs: [], dns: [], overwrite: [], auth: [] };
	let map_t = { config_subscribe: 'subs', dns_servers: 'dns', config_overwrite: 'overwrite', authentication: 'auth' };
	for (let s in secs) {
		let o = { sid: s['.name'] };
		for (let k, v in s)
			if (substr(k, 0, 1) != '.') o[k] = v;
		if (s['.type'] == 'openclash') { if (s['.name'] == 'config') out.config = o; continue; }
		let t = map_t[s['.type']] ?? s['.type'];
		if (!out[t]) out[t] = [];
		push(out[t], o);
	}
	return out;
}

function oc_file_path(kind, name) {
	let d = OC_FILE_DIRS[kind];
	if (!d) die('未知目录：' + kind);
	if (type(name) != 'string' || !length(name) || index(name, '/') >= 0 || substr(name, 0, 1) == '.' || length(name) > 120)
		die('文件名不合法');
	return d + '/' + name;
}

function oc_backup_file(kind, p) {
	if (!stat(p)) return null;
	mkdir('/etc/claude-mcp/bak');
	let b = sprintf('/etc/claude-mcp/bak/%s.%s.%s', kind, replace(p, /.*\//, ''), now_str());
	sh(sprintf('cp -f %s %s; ' + BAK_PRUNE, shq(p), shq(b)));
	return b;
}

function oc_jobs() {
	let ps = sh('ps w').out, o = {};
	for (let k, re in OC_JOBS) {
		o[k] = false;
		for (let l in split(ps, '\n'))
			if (match(l, regexp(re)) && index(l, 'grep') < 0 && index(l, 'ucode') < 0 && (k != 'sub' || index(l, 'openclash.sh') >= 0)) { o[k] = true; break; }
	}
	return o;
}


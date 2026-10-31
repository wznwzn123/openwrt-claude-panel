// 路由器小工具共用的函数（/usr/share/ucode/cmcp/lib.uc，用 import * as L from 'cmcp.lib' 引入）
'use strict';
import { readfile, writefile, popen, rename, stat, mkdir } from 'fs';

const D = '/etc/claude-mcp';

function shq(s) { return "'" + replace('' + s, "'", "'\\''") + "'"; }
function sh(cmd) {
	let p = popen('export PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH; ' + cmd + ' 2>/dev/null', 'r');
	if (!p) return '';
	let o = p.read('all') ?? '';
	p.close();
	return o;
}
function readj(f, def) { try { let s = readfile(f); return s ? json(s) : def; } catch (e) { return def; } }
// 先写临时文件再改名，断电也不会写坏
function writej(f, o) { writefile(f + '.tmp', sprintf('%J', o)); rename(f + '.tmp', f); }
function now() { return time(); }
function uci(k) { return trim(sh('uci -q get ' + shq(k))); }

// OpenClash（mihomo）控制接口
let _ctl = null;
function ctl() {
	if (!_ctl) _ctl = { secret: uci('openclash.config.dashboard_password'), port: uci('openclash.config.cn_port') || '9090' };
	return _ctl;
}
function enc(s) {
	return replace('' + s, /[^A-Za-z0-9._~-]/g, (c) => {
		let o = '';
		for (let i = 0; i < length(c); i++) o += sprintf('%%%02X', ord(c, i));
		return o;
	});
}
function api(method, path, body, tmo) {
	let c = ctl();
	let cmd = sprintf('curl -s -m %d -X %s -H %s', tmo ?? 8, method, shq('Authorization: Bearer ' + c.secret));
	if (body != null) cmd += " -H 'Content-Type: application/json' --data-binary " + shq(sprintf('%J', body));
	cmd += " -w '\\n%{http_code}' " + shq('http://127.0.0.1:' + c.port + path);
	let out = sh(cmd), i = rindex(out, '\n'), code = +substr(out, i + 1), txt = i >= 0 ? substr(out, 0, i) : '';
	let j = null;
	try { if (length(trim(txt))) j = json(txt); } catch (e) {}
	return { code, json: j };
}

// 发通知（记录 + 推送到手机）
function notify(lvl, kind, title, body, tag) {
	sh(sprintf('/usr/sbin/cmcp-notify %s %s %s %s %s', shq(lvl), shq(kind), shq(title), shq(body ?? ''), shq(tag ?? kind)));
}

// 局域网设备：IP → { mac, name }
function lan_devices() {
	let byip = {}, names = {};
	// 静态分配里起的名字
	for (let l in split(sh("uci -q show dhcp | grep -E '\\.(mac|name)='"), '\n')) {
		let m = match(l, /^dhcp\.([^.]+)\.(mac|name)='?([^']*)'?$/);
		if (m) { names[m[1]] ??= {}; names[m[1]][m[2]] = m[3]; }
	}
	let st = {};
	for (let k in names) if (names[k].mac && names[k].name) for (let mm in split(lc(names[k].mac), ' ')) st[mm] = names[k].name;
	for (let l in split(readfile('/tmp/dhcp.leases') ?? '', '\n')) {
		let f = split(l, ' ');
		if (length(f) >= 4) byip[f[2]] = { mac: lc(f[1]), name: st[lc(f[1])] ?? (f[3] != '*' ? f[3] : null), lease: +f[0] };
	}
	for (let l in split(sh('ip -4 neigh show dev br-lan'), '\n')) {
		let m = match(l, /^([0-9.]+) lladdr ([0-9a-f:]+) (\S+)/);
		if (m && !byip[m[1]]) byip[m[1]] = { mac: m[2], name: st[m[2]] ?? null, state: m[3] };
		else if (m) byip[m[1]].state = m[3];
	}
	return byip;
}

/* ---------- 「拉黑名单」规则集（OpenClash 的 file 规则集，改完刷新一下就生效，不用重启） ---------- */
const BL_RULESET = '/etc/openclash/rule_provider/cmcp_blacklist.yaml';
// 面板的主域名：子域名.主域名 → 主域名（托管版是官网域名，这样官网和面板一起）
function panel_domain() {
	let p = split(trim(readfile(D + '/hostname') ?? ''), '.');
	return length(p) > 2 ? join('.', slice(p, 1)) : join('.', p);
}
// 面板现在走直连还是走代理（cmcp-route 自动选）
function panel_direct() { return !!readj(D + '/panel_route.json', {})?.direct; }
function bl_ruleset_write() {
	let l = readj(D + '/blacklist.json', []), dom = panel_domain();
	if (type(l) != 'array') l = [];
	let lines = ['# 由路由器面板「拉黑名单」自动生成，不要手动修改', 'payload:'];
	// 路由器自己连 Cloudflare 的流量（隧道、云端报告）走直连：不受代理节点抽风影响
	push(lines, '  - PROCESS-NAME,cloudflared', '  - DST-PORT,7844', '  - AND,((DOMAIN,api.cloudflare.com),(PROCESS-NAME,curl))');
	if (dom) {
		push(lines, '  - AND,((DOMAIN-SUFFIX,' + dom + '),(PROCESS-NAME,curl))');
		// 手机打开面板：代理节点打不开、或者直连明显更快时，cmcp-route 会把面板改成直连
		if (panel_direct()) push(lines, '  - DOMAIN-SUFFIX,' + dom);
	}
	for (let e in l) if (e?.ip) push(lines, sprintf('  - SRC-IP-CIDR,%s/32', e.ip));
	mkdir('/etc/openclash'); mkdir('/etc/openclash/rule_provider');
	writefile(BL_RULESET + '.tmp', join('\n', lines) + '\n');
	rename(BL_RULESET + '.tmp', BL_RULESET);
}
// 路由器自己的小工具调用面板接口用的钥匙（只在路由器上，托管版不用输登录码）
function local_key() {
	let k = trim(readfile(D + '/local.key') ?? '');
	if (length(k) >= 32) return k;
	k = trim(sh("tr -dc 'a-z0-9' < /dev/urandom | head -c 40"));
	if (length(k) != 40) return '';
	writefile(D + '/local.key.tmp', k + '\n');
	sh('chmod 600 ' + shq(D + '/local.key.tmp'));
	rename(D + '/local.key.tmp', D + '/local.key');
	return k;
}

export { D, shq, sh, readj, writej, now, uci, enc, api, notify, lan_devices, panel_domain, panel_direct, bl_ruleset_write, local_key };

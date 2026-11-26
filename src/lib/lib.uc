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

// Clash 控制接口：OpenClash 或 Nikki（都是 mihomo 内核）。OpenClash 在跑或开着就用它，否则用 Nikki
function clash_ctl() {
	let oc = !!stat('/etc/init.d/openclash'), nk = !!stat('/etc/init.d/nikki');
	let ocOn = oc && (length(sh('pidof clash')) > 0 || uci('openclash.config.enable') == '1');
	let nkOn = nk && (length(sh('pidof mihomo')) > 0 || uci('nikki.config.enabled') == '1');
	if (nk && (nkOn && !ocOn || !oc)) {
		let l = uci('nikki.mixin.api_listen') || '[::]:9090', m = match(l, /:([0-9]+)$/);
		return { id: 'nikki', name: 'Nikki', port: m ? m[1] : '9090', secret: uci('nikki.mixin.api_secret') };
	}
	if (oc) return { id: 'openclash', name: 'OpenClash', port: uci('openclash.config.cn_port') || '9090', secret: uci('openclash.config.dashboard_password') };
	return null;
}
let _ctl = null;
function ctl() {
	if (!_ctl) _ctl = clash_ctl() ?? { id: '', port: '9090', secret: '' };
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

/* 公告（4.0）：托管版问自己的开通中心，自建版问官网；自己搭的开通中心还没有公告接口时退回官网。
   存到 /tmp/cmcp_ann.json 给面板看（定时任务每 30 分钟取一次）；取不到时保留上次的，5 分钟后再试 */
const ANN_HUB = 'https://yrlove520.com', ANN_CACHE = '/tmp/cmcp_ann.json';
function ann_hub() { let m = match(readfile(D + '/hub.conf') ?? '', /(^|\n)HUB=(https:\/\/[^\n]+)/); return m ? replace(trim(m[2]), /\/+$/, '') : ANN_HUB; }
// 匿名编号（5.0）：公告统计「多少台收到、多少台点开」用；随机生成存在路由器上，跟账号、密钥、IP 都没关系
function ann_rid() {
	let f = D + '/rid', r = trim(readfile(f) ?? '');
	if (match(r, /^[a-f0-9]{16}$/)) return r;
	let b = readfile('/dev/urandom', 8) ?? '';
	r = '';
	for (let i = 0; i < length(b); i++) r += sprintf('%02x', ord(b, i));
	if (length(r) != 16) r = substr(sprintf('%08x%08x', time(), int(time() * 7919) % 4294967291), 0, 16);
	writefile(f, r);
	return r;
}
function ann_get(url, tmo) {
	let j = null;
	try { j = json(sh(sprintf('curl -s -m %d %s', tmo ?? 12, shq(url + '/api/notices?r=' + ann_rid())))); } catch (e) {}
	return type(j) == 'object' && j.ok && type(j.list) == 'array' ? j.list : null;
}
function ann_fetch(tmo) {
	let h = ann_hub(), l = ann_get(h, tmo);
	if (l == null && h != ANN_HUB) l = ann_get(ANN_HUB, tmo);
	let old = readj(ANN_CACHE, null);
	if (l == null) {
		let c = { at: now() - 3300, list: type(old?.list) == 'array' ? old.list : [], fail: true };
		writej(ANN_CACHE, c);
		return c;
	}
	let out = [];
	for (let a in l) {
		if (type(a) != 'object' || !match('' + a.id, /^[a-z2-9]{10}$/) || type(a.title) != 'string' || !length(a.title)) continue;
		// 5.2：公告附件（图片、视频、文件），只认托管服务给的下载地址
		let fs = [];
		for (let f in (type(a.files) == 'array' ? slice(a.files, 0, 5) : [])) {
			if (type(f) != 'object' || !match('' + f.url, /^https:\/\/[a-z0-9.-]+\/api\/f\/[a-z2-9]{16}\/[^\s"'<>]*\?e=[0-9]+&s=[A-Za-z0-9_-]{32}$/)) continue;
			push(fs, { id: '' + f.id, name: substr('' + (f.name ?? '文件'), 0, 100), size: +f.size || 0, type: substr('' + (f.type ?? ''), 0, 60), k: index(['img', 'video', 'audio', 'file'], f.k) >= 0 ? f.k : 'file', url: f.url });
		}
		let it = { id: a.id, title: a.title, body: type(a.body) == 'string' ? a.body : '', level: a.level == 'important' || a.level == 'banner' ? a.level : 'normal', at: +a.at || 0, upd: +a.upd || +a.at || 0 };
		if (length(fs)) it.files = fs;
		push(out, it);
		if (length(out) >= 20) break;
	}
	let c = { at: now(), list: out };
	writej(ANN_CACHE, c);
	return c;
}
// 面板要看：缓存超过 1 小时（或没有，比如刚重启）就现取一次
function ann_list(tmo) {
	let c = readj(ANN_CACHE, null);
	if (type(c) != 'object' || type(c.list) != 'array' || now() - (+c.at || 0) > 3600) c = ann_fetch(tmo);
	return c;
}

/* ---------- 设备名字 ----------
 * 用户在面板里给设备改过名字的优先（按 MAC 记在 devnames.json）；
 * DHCP 报上来的名字有的被转成 %E5%B0%8F、\345\260\217、\xe5\xb0\x8f 这种，解回原来的字 */
const DN_PATH = replace(getenv('CLAUDE_MCP_CONF') || D + '/config.json', /\/[^\/]*$/, '') + '/devnames.json';
let DN = null;
function dev_aliases() { if (DN == null) { DN = readj(DN_PATH, {}); if (type(DN) != 'object') DN = {}; } return DN; }
function oct3(s) { let n = 0; for (let i = 0; i < length(s); i++) n = n * 8 + ord(s, i) - 48; return n; }
function name_clean(s) {
	if (type(s) != 'string' || !length(s) || s == '*') return null;
	if (match(s, /%[0-9A-Fa-f][0-9A-Fa-f]/)) s = replace(s, /%([0-9A-Fa-f][0-9A-Fa-f])/g, (m, h) => chr(hex(h)));
	if (match(s, /\\[0-7][0-7][0-7]/)) s = replace(s, /\\([0-7][0-7][0-7])/g, (m, o) => chr(oct3(o)));
	if (match(s, /\\x[0-9A-Fa-f][0-9A-Fa-f]/)) s = replace(s, /\\x([0-9A-Fa-f][0-9A-Fa-f])/g, (m, h) => chr(hex(h)));
	s = trim(replace(s, /[\x01-\x1f\x7f]/g, ''));
	return length(s) ? s : null;
}
// 显示用的名字：改过的 → 静态分配起的 → DHCP 报上来的（解码后）
function dev_label(mac, raw) {
	let a = dev_aliases()[lc(mac ?? '')];
	return (type(a) == 'object' && type(a.name) == 'string' && length(a.name)) ? a.name : name_clean(raw);
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
		if (length(f) >= 4) byip[f[2]] = { mac: lc(f[1]), name: dev_label(f[1], st[lc(f[1])] ?? f[3]), lease: +f[0] };
	}
	for (let l in split(sh('ip -4 neigh show dev br-lan'), '\n')) {
		let m = match(l, /^([0-9.]+) lladdr ([0-9a-f:]+) (\S+)/);
		if (m && !byip[m[1]]) byip[m[1]] = { mac: m[2], name: dev_label(m[2], st[m[2]]), state: m[3] };
		else if (m) byip[m[1]].state = m[3];
	}
	return byip;
}

/* ---------- 「不走代理」（以前叫「拉黑名单」）规则集（OpenClash 的 file 规则集，改完刷新一下就生效，不用重启） ---------- */
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
	let lines = ['# 由路由器面板「不走代理」（以前叫「拉黑名单」）自动生成，不要手动修改', 'payload:'];
	// 路由器自己连 Cloudflare 的流量（隧道、云端报告）走直连：不受代理节点抽风影响
	push(lines, '  - PROCESS-NAME,cloudflared', '  - DST-PORT,7844', '  - AND,((DOMAIN,api.cloudflare.com),(PROCESS-NAME,curl))');
	if (dom) {
		push(lines, '  - AND,((DOMAIN-SUFFIX,' + dom + '),(PROCESS-NAME,curl))');
		// 手机打开面板：代理节点打不开、或者直连明显更快时，cmcp-route 会把面板改成直连
		if (panel_direct()) push(lines, '  - DOMAIN-SUFFIX,' + dom);
	}
	// 按 MAC 找设备现在的固定 IP（改了局域网网段，固定 IP 跟着搬了，这里跟着变；风险 8、43）
	let fix = {};
	try { for (let l2 in split(sh('uci -q show dhcp') ?? '', '\n')) { let m = match(l2, /^dhcp\.([^.]+)\.(mac|ip)='?([^']*)'?$/); if (m) { fix[m[1]] ??= {}; fix[m[1]][m[2]] = lc(m[3]); } } } catch (x) {}
	let m2ip = {};
	for (let k in fix) if (fix[k].ip && fix[k].mac) for (let mm in split(fix[k].mac, ' ')) m2ip[mm] = fix[k].ip;
	for (let e in l) { let ip = (e?.mac && m2ip[lc(e.mac)]) || e?.ip; if (ip) push(lines, sprintf('  - SRC-IP-CIDR,%s/32', ip)); }
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

/* ---------- 节点自动切换：认出节点的地区、类型、倍率（6.0 第 92 项） ----------
 * 各家机场写法不一样：地区「香港 / 港 / HK / 🇭🇰 / Hong Kong」，类型「专线 / IPLC / IEPL / 中转 / 家宽」，倍率「3x / x3 / ×3 / 3倍 / 倍率:3」 */
const NREG = [['HK', /🇭🇰|香港|港|\bHK\b|HKG|Hong ?Kong/i], ['TW', /🇹🇼|台湾|台灣|\bTW\b|Taiwan|台北/i], ['MO', /🇲🇴|澳门|澳門|\bMO\b|Macao|Macau/i],
	['JP', /🇯🇵|日本|东京|東京|大阪|\bJP\b|Japan|Tokyo|Osaka/i], ['SG', /🇸🇬|新加坡|狮城|獅城|\bSG\b|Singapore/i], ['KR', /🇰🇷|韩国|韓國|首尔|\bKR\b|Korea|Seoul/i],
	['US', /🇺🇸|美国|美國|\bUS\b|\bUSA\b|United States|洛杉矶|圣何塞|硅谷|西雅图|纽约|芝加哥|达拉斯|Los ?Angeles|San ?Jose/i],
	['GB', /🇬🇧|英国|英國|伦敦|\bUK\b|\bGB\b|London/i], ['DE', /🇩🇪|德国|德國|法兰克福|\bDE\b|Germany|Frankfurt/i], ['FR', /🇫🇷|法国|法國|巴黎|\bFR\b|France|Paris/i],
	['NL', /🇳🇱|荷兰|荷蘭|阿姆斯特丹|\bNL\b|Netherlands/i], ['CA', /🇨🇦|加拿大|\bCA\b|Canada/i], ['AU', /🇦🇺|澳大利亚|澳洲|悉尼|\bAU\b|Australia/i],
	['RU', /🇷🇺|俄罗斯|俄羅斯|莫斯科|\bRU\b|Russia/i], ['IN', /🇮🇳|印度|孟买|\bIN\b|India/i], ['TR', /🇹🇷|土耳其|\bTR\b|Turkey|Türkiye/i],
	['MY', /🇲🇾|马来西亚|馬來西亞|吉隆坡|\bMY\b|Malaysia/i], ['TH', /🇹🇭|泰国|泰國|曼谷|\bTH\b|Thailand/i], ['VN', /🇻🇳|越南|\bVN\b|Vietnam/i],
	['PH', /🇵🇭|菲律宾|\bPH\b|Philippines/i], ['AE', /🇦🇪|迪拜|阿联酋|\bAE\b|Dubai/i], ['AR', /🇦🇷|阿根廷|\bAR\b|Argentina/i], ['BR', /🇧🇷|巴西|\bBR\b|Brazil/i]];
function node_meta(n) {
	n = '' + (n ?? '');
	let reg = '?';
	for (let r in NREG) if (match(n, r[1])) { reg = r[0]; break; }
	// 类型：专线（IPLC / IEPL / 专线）、中转、家宽；认不出算普通
	let kind = match(n, /IPLC|IEPL|专线|專線|内网专线|直连专线/i) ? 'line' : match(n, /中转|中轉|隧道|Relay|Transit|BGP/i) ? 'relay' : match(n, /家宽|家寬|家庭宽带|住宅|Residential|\bHome\b|原生/i) ? 'home' : 'std';
	// 倍率：3x、x3、×3、3倍、倍率3、[0.5X]；没写算 1（ucode 的正则不支持前瞻，多字节字符也不放进 [] 里）
	let m = match(n, /倍率[ ]*(:|：)?[ ]*([0-9]+(\.[0-9]+)?)/), v = m ? +m[2] : 0;
	if (!v) { m = match(n, /([0-9]+(\.[0-9]+)?)[ ]*(倍|x|X|×)([^A-Za-z0-9]|$)/); v = m ? +m[1] : 0; }
	if (!v) { m = match(n, /(^|[^A-Za-z0-9])(x|X|×)[ ]?([0-9]+(\.[0-9]+)?)([^0-9.]|$)/); v = m ? +m[3] : 0; }
	let mult = v > 0 && v < 100 ? v : 1;
	return { reg, kind, mult };
}
const NKIND = { line: '专线', relay: '中转', home: '家宽', std: '普通' };
// 挑节点：同地区同类型同倍率 → 同地区同类型 → 同地区 → 其他地区；每一层里挑延迟最低的。cands: [{ n, d }]（d > 0 才算通）
function node_pick(cur, cands) {
	let c = node_meta(cur), best = [null, null, null, null];
	for (let x in cands) {
		if (!x || x.n == cur || !(+x.d > 0)) continue;
		let m = node_meta(x.n), tier = 3;
		if (c.reg != '?' && m.reg == c.reg) tier = m.kind == c.kind ? (m.mult == c.mult ? 0 : 1) : 2;
		if (!best[tier] || x.d < best[tier].d) best[tier] = { n: x.n, d: +x.d };
	}
	for (let i = 0; i < 4; i++) if (best[i]) return { ...best[i], tier: i, meta: c, why: [
		'同地区、同类型（' + NKIND[c.kind] + (c.mult != 1 ? '、' + c.mult + ' 倍' : '') + '）',
		'同地区、同类型（' + NKIND[c.kind] + '，倍率不同）',
		'同地区（没有同类型的能用）',
		'其他地区（' + (c.reg == '?' ? '认不出原来的地区' : '同地区的都连不上') + '）'][i] };
	return null;
}

// ---------------- 6.0 第 16 项：上网计划（每台设备按星期设能上网的时段） ----------------
// 时段：[{ d: [1..7]（周一 = 1）, from: 'HH:MM', to: 'HH:MM' }]，to 不晚于 from 表示到第二天；最多 8 段。
// 一周里的第几分钟：周一 00:00 = 0，一周 10080 分钟。off：本地时间比 UTC 快多少分钟（date +%z）
const WEEK = 10080, WDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function hm_min(s) {
	let m = match('' + (s ?? ''), /^(\d{1,2}):(\d\d)$/);
	if (!m) return null;
	let h = +m[1], mi = +m[2];
	if (mi > 59 || h > 24 || (h == 24 && mi > 0)) return null;
	return h * 60 + mi;
}
function min_hm(x) { return sprintf('%02d:%02d', (x - x % 60) / 60, x % 60); }
function plan_norm(slots) {
	let out = [];
	for (let s in (type(slots) == 'array' ? slots : [])) {
		let a = hm_min(s?.from), b = hm_min(s?.to);
		if (a == null || b == null || a == b || a == 1440) continue;
		let d = [];
		for (let x in (type(s.d) == 'array' ? s.d : [])) { x = +x; if (x >= 1 && x <= 7 && index(d, x) < 0) push(d, x); }
		if (!length(d)) continue;
		push(out, { d: sort(d, (p, q) => p - q), from: min_hm(a), to: b == 1440 ? '24:00' : min_hm(b) });
		if (length(out) >= 8) break;
	}
	return out;
}
// 能上网的区间（合并过、按开始排好）：[[开始, 结束), …]
function plan_spans(slots) {
	let sp = [];
	for (let s in slots) {
		let a = hm_min(s.from), b = hm_min(s.to);
		if (a == null || b == null) continue;
		if (b <= a) b += 1440;
		for (let d in s.d) {
			let x = (d - 1) * 1440 + a, y = (d - 1) * 1440 + b;
			if (y <= WEEK) push(sp, [x, y]); else { push(sp, [x, WEEK]); push(sp, [0, y - WEEK]); }
		}
	}
	sp = sort(sp, (p, q) => p[0] - q[0]);
	let m = [];
	for (let x in sp) {
		let l = length(m) ? m[length(m) - 1] : null;
		if (l && x[0] <= l[1]) { if (x[1] > l[1]) l[1] = x[1]; }
		else push(m, [x[0], x[1]]);
	}
	return m;
}
// 不能上网的区间（一周里能上网区间以外的）
function plan_blocked(slots) {
	let out = [], at = 0;
	for (let x in plan_spans(slots)) { if (x[0] > at) push(out, [at, x[0]]); at = x[1]; }
	if (at < WEEK) push(out, [at, WEEK]);
	return out;
}
// 时间戳 → 本地一周里的第几分钟、这一分钟开始的时间戳
function plan_mow(t, off) {
	let l = t + off * 60, sec = l % 60, days = (l - l % 86400) / 86400;
	return { m: ((days + 3) % 7) * 1440 + (l % 86400 - sec) / 60, t0: t - sec };
}
function plan_ok_at(sp, m) { for (let x in sp) if (m >= x[0] && m < x[1]) return true; return false; }
// 现在能不能上网（只看计划）；能的话 at = 几点停，不能的话 at = 几点能上（都没有 = null）
function plan_now(slots, t, off) {
	let sp = plan_spans(slots), w = plan_mow(t, off);
	if (!length(sp)) return { ok: false, at: null };
	for (let x in sp) if (w.m >= x[0] && w.m < x[1]) {
		let end = x[1];
		// 跨过周日 24:00 接着能上
		if (end == WEEK && sp[0][0] == 0) end = WEEK + sp[0][1];
		if (end - w.m >= WEEK) return { ok: true, at: null };
		return { ok: true, at: w.t0 + (end - w.m) * 60 };
	}
	for (let x in sp) if (x[0] > w.m) return { ok: false, at: w.t0 + (x[0] - w.m) * 60 };
	return { ok: false, at: w.t0 + (sp[0][0] + WEEK - w.m) * 60 };
}
// 防火墙规则用的：不能上网的区间换成 UTC，按天拆开 → [{ day: 'Mon', start: 'HH:MM:SS', stop: 'HH:MM:SS' }]（stop 含这一秒）
function plan_rules(slots, off) {
	let sp = [], out = [];
	for (let b in plan_blocked(slots)) {
		let x = b[0] - off, y = b[1] - off;
		while (x < 0) { x += WEEK; y += WEEK; }
		while (x >= WEEK) { x -= WEEK; y -= WEEK; }
		if (y <= WEEK) push(sp, [x, y]); else { push(sp, [x, WEEK]); push(sp, [0, y - WEEK]); }
	}
	// 换成 UTC 以后首尾可能接上了：合并，规则少一点
	sp = sort(sp, (p, q) => p[0] - q[0]);
	let m = [];
	for (let x in sp) { let l = length(m) ? m[length(m) - 1] : null; if (l && x[0] <= l[1]) { if (x[1] > l[1]) l[1] = x[1]; } else push(m, [x[0], x[1]]); }
	for (let p in m) {
		let a = p[0];
		while (a < p[1]) {
			let day = (a - a % 1440) / 1440, e = (day + 1) * 1440;
			if (e > p[1]) e = p[1];
			push(out, { day: WDAY[day], start: min_hm(a % 1440) + ':00', stop: min_hm((e - 1) % 1440) + ':59' });
			a = e;
		}
	}
	return out;
}

export { plan_norm, plan_spans, plan_blocked, plan_now, plan_rules, plan_mow, plan_ok_at, hm_min, node_meta, node_pick, D, DN_PATH, dev_aliases, name_clean, dev_label, shq, sh, readj, writej, now, uci, enc, api, clash_ctl, notify, lan_devices, panel_domain, panel_direct, bl_ruleset_write, local_key, ann_hub, ann_fetch, ann_list, ann_rid, ANN_CACHE };

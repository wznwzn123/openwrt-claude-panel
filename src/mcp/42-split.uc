/* ---------------- 6.0 第 69 项：分流——按设备、按软件、按国家和地区，选直连 / 代理 / 某个策略组 ----------------
 * 用户 11/26 定：每个设备 / 软件 / 国家都能选直连、代理（主策略组）或某个策略组；只支持 OpenClash 和 Nikki，别的说清楚不支持；
 * 订阅更新后选的策略组没了：自动改走主策略组并推送（看门狗每分钟查一次，见 split_check）。
 * 顺序：「不走代理」最先，然后设备、软件、国家（同一个连接先按设备算）。
 * OpenClash：生成的规则集放 /etc/openclash/rule_provider/cmcp_sp_*.yaml，自定义规则里放一段（# [cmcp-split] 标记）；
 *   只改了规则集内容时让 OpenClash 重新读规则集，不用重启；多了 / 少了一个去向（要改自定义规则）才要重启，由用户点「现在重启」。
 * Nikki：写进 uci（nikki.mixin.rule=1 + config rule 'cmcp_sp_N'），要重启 Nikki 才生效（用户 11/26 定：先问，点了才重启）。
 * 设备按 IP 认：设了分流的设备自动给固定 IP（dhcp host，cmcp_split=1），去掉分流时删掉自己加的。
 * 用户 11/27 加：能选单个节点（不只是策略组）；自己加网站（site）和软件（capp：名字 + 几个网址）；学习模式（split_learn：记下一台设备几分钟里访问的网站，帮你认出软件用的网址）。
 * 测试用：CMCP_SP_KIND（openclash / nikki / none）、CMCP_SP_PROXIES（假的 /proxies 结果文件）、CMCP_SP_DIR、CMCP_SP_CUSTOM、CMCP_SP_CFG、CMCP_SP_RUN */
const SP_F = ETC + '/split.json', SP_DIR = getenv('CMCP_SP_DIR') || '/etc/openclash/rule_provider';
const SP_CUSTOM = getenv('CMCP_SP_CUSTOM') || '/etc/openclash/custom/openclash_custom_rules.list', SP_MARK = '# [cmcp-split]';
// 常用软件：网址后缀（跟着面板更新）；路由器只能按网址认，认不了 App 本身
const SP_APPS0 = [
	['chatgpt', 'ChatGPT', ['openai.com', 'chatgpt.com', 'oaistatic.com', 'oaiusercontent.com', 'sora.com']],
	['claude', 'Claude', ['anthropic.com', 'claude.ai', 'claudeusercontent.com']],
	['gemini', 'Gemini', ['gemini.google.com', 'bard.google.com', 'aistudio.google.com', 'generativelanguage.googleapis.com']],
	['youtube', 'YouTube', ['youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com', 'youtube-nocookie.com', 'youtubei.googleapis.com']],
	['netflix', 'Netflix', ['netflix.com', 'netflix.net', 'nflxvideo.net', 'nflximg.net', 'nflxext.com', 'nflxso.net']],
	['disney', 'Disney+', ['disneyplus.com', 'disney-plus.net', 'dssott.com', 'bamgrid.com']],
	['spotify', 'Spotify', ['spotify.com', 'scdn.co', 'spotifycdn.com', 'spoti.fi']],
	['telegram', 'Telegram', ['telegram.org', 't.me', 'telegra.ph', 'telesco.pe', 'tdesktop.com']],
	['x', 'X（Twitter）', ['x.com', 'twitter.com', 'twimg.com', 't.co']],
	['meta', 'Facebook / Instagram / WhatsApp', ['facebook.com', 'fbcdn.net', 'instagram.com', 'cdninstagram.com', 'whatsapp.com', 'whatsapp.net']],
	['tiktok', 'TikTok', ['tiktok.com', 'tiktokv.com', 'tiktokcdn.com', 'byteoversea.com', 'ibytedtos.com']],
	['github', 'GitHub', ['github.com', 'githubusercontent.com', 'githubassets.com', 'github.io']],
	['google', 'Google', ['google.com', 'googleapis.com', 'gstatic.com', 'ggpht.com', 'googleusercontent.com']],
	['steam', 'Steam', ['steampowered.com', 'steamcommunity.com', 'steamstatic.com', 'steamcontent.com', 'steamserver.net']],
	['apple', 'Apple', ['apple.com', 'icloud.com', 'mzstatic.com', 'apple-cloudkit.com', 'cdn-apple.com']],
	['microsoft', 'Microsoft', ['microsoft.com', 'live.com', 'office.com', 'msftconnecttest.com', 'windowsupdate.com', 'bing.com']],
	['bilibili', '哔哩哔哩', ['bilibili.com', 'bilivideo.com', 'hdslb.com', 'biliapi.net']],
	['douyin', '抖音', ['douyin.com', 'douyinvod.com', 'douyincdn.com', 'amemv.com', 'snssdk.com']],
	['wechat', '微信', ['weixin.qq.com', 'wechat.com', 'qpic.cn', 'qlogo.cn']],
	['taobao', '淘宝 / 支付宝', ['taobao.com', 'tmall.com', 'alicdn.com', 'alipay.com', 'alipayobjects.com']]];
// 远程数据（热补丁带来的 /etc/claude-mcp/remote.json 里的 split_apps）有就用它：网址变了、加新软件不用发版本。格式不对就用上面写死的
function sp_apps() {
	let r = cmcp_readj(ETC + '/remote.json', null)?.split_apps, out = [];
	if (type(r) != 'array') return SP_APPS0;
	for (let a in r) {
		if (type(a) != 'array' || !match('' + a[0], /^[a-z0-9_-]{1,30}$/) || !length('' + a[1]) || type(a[2]) != 'array') return SP_APPS0;
		for (let d in a[2]) if (!match('' + d, /^[a-z0-9.-]{1,80}$/)) return SP_APPS0;
		push(out, [a[0], substr('' + a[1], 0, 40), a[2]]);
	}
	return length(out) ? out : SP_APPS0;
}
const SP_GEO = [['CN', '中国大陆'], ['HK', '香港'], ['TW', '台湾'], ['JP', '日本'], ['KR', '韩国'], ['SG', '新加坡'], ['US', '美国'], ['GB', '英国'], ['DE', '德国'], ['FR', '法国'], ['CA', '加拿大'], ['AU', '澳大利亚'], ['RU', '俄罗斯'], ['IN', '印度'], ['TH', '泰国'], ['MY', '马来西亚'], ['VN', '越南']];
function sp_read() { let o = cmcp_readj(SP_F, {}); if (type(o) != 'object') o = {}; for (let k in ['dev', 'app', 'geo', 'fam', 'site', 'capp']) if (type(o[k]) != 'object') o[k] = {}; return o; }
// 每一条分流的去向：[种类, 编号, 去向]（设备、软件、国家、自己加的网站和软件）
function sp_each(o) { let l = []; for (let k in ['dev', 'app', 'geo', 'site', 'capp']) for (let id in o[k]) { let v = o[k][id]; push(l, [k, id, k == 'dev' || k == 'capp' ? v?.t : v]); } return l; }
function sp_kind() {
	let k = getenv('CMCP_SP_KIND');
	if (k != null) return k == 'none' ? null : k;
	let c = CL.clash_ctl();
	return c?.id == 'openclash' || c?.id == 'nikki' ? c.id : null;
}
function sp_run(cmd) { let f = getenv('CMCP_SP_RUN'); if (f) { let h = fs_open(f, 'a'); if (h) { h.write(cmd + '\n'); h.close(); } return; } bg(cmd); }
// 现在有哪些策略组（null = 读不到：插件没在跑）
function sp_proxies() {
	let f = getenv('CMCP_SP_PROXIES');
	if (f) return cmcp_readj(f, null)?.proxies;
	try { return api('GET', '/proxies', null, 5)?.proxies; } catch (e) { return null; }
}
function sp_groups() {
	let p = sp_proxies();
	if (type(p) != 'object') return null;
	let order = p.GLOBAL?.all ?? keys(p), out = [];
	for (let n in order) if (n != 'GLOBAL' && index(n, ',') < 0 && match(p[n]?.type ?? '', /^(Selector|URLTest|Fallback|LoadBalance|Relay)$/)) push(out, n);
	return out;
}
// 单个节点（用户 11/27：能选机场里的节点）：不是策略组、不是直连 / 拒绝这些内置的。名字里有逗号的写不进规则，不列。带延迟和地区（按地区分组显示）
function sp_nodes() {
	let p = sp_proxies();
	if (type(p) != 'object') return null;
	let order = p.GLOBAL?.all ?? keys(p), out = [], seen = {};
	for (let n in order) {
		let x = p[n];
		if (seen[n] || n == 'GLOBAL' || index(n, ',') >= 0 || type(x) != 'object') continue;
		if (match(x.type ?? '', /^(Selector|URLTest|Fallback|LoadBalance|Relay|Direct|Reject|RejectDrop|Pass|Compatible|Dns)$/i) || match(n, /^(DIRECT|REJECT|REJECT-DROP|PASS|COMPATIBLE)$/)) continue;
		seen[n] = 1;
		let h = type(x.history) == 'array' ? x.history : [], d = length(h) ? +(h[length(h) - 1]?.delay ?? 0) : 0;
		push(out, { n, d: d > 0 ? d : 0, reg: CL.node_meta(n).reg });
		if (length(out) >= 500) break;
	}
	return out;
}
// 能选的去向（策略组 + 节点）现在还在不在；读不到（插件没在跑）返回 null
function sp_names() {
	let g = sp_groups(); if (g == null) return null;
	let l = slice(g); for (let x in (sp_nodes() ?? [])) push(l, x.n);
	return l;
}
// 网址：去掉 http://、路径、端口、开头的 www. 和 *.；只收像样的域名
function sp_dom(d) {
	d = lc(trim('' + (d ?? '')));
	d = replace(d, /^[a-z]+:\/\//, ''); d = replace(d, /[\/?#:].*$/, ''); d = replace(d, /^(\*\.|\.)+/, ''); d = replace(d, /^www\./, '');
	return length(d) <= 253 && match(d, /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/) ? d : null;
}
// 插件没在跑时：从配置文件里读策略组的名字（订阅更新后起不来，就靠这个发现组没了）
function sp_cfg_groups(kind) {
	let f = getenv('CMCP_SP_CFG') ?? (kind == 'nikki' ? '/etc/nikki/run/config.yaml' : uci_get('openclash.config.config_path'));
	let s = f ? readfile(f) : null;
	if (!s) return null;
	let out = [], inside = false;
	for (let l in split(s, '\n')) {
		if (match(l, /^proxy-groups:/)) { inside = true; continue; }
		if (!inside) continue;
		if (match(l, /^[A-Za-z]/)) break;
		let x = match(l, /^[ \t]*-[ \t]*\{?[ \t]*name:[ \t]*("([^"]*)"|'([^']*)'|([^,}]+))/);
		if (x) push(out, trim(x[2] ?? x[3] ?? x[4] ?? ''));
	}
	return out;
}
// 主策略组：节点自动切换选的那个；没有就用第一个「手动选择」的组
function sp_main(groups) {
	let a = cmcp_readj(ETC + '/autosw.json', {})?.group, p = sp_proxies();
	if (a && index(groups ?? [], a) >= 0) return a;
	for (let n in (groups ?? [])) if (!p || p[n]?.type == 'Selector') return n;
	return null;
}
function sp_target(t, mg) { return t == 'DIRECT' ? 'DIRECT' : t == 'PROXY' ? mg : t; }
// MAC → IP：固定 IP 优先，然后是 DHCP 分配记录
function sp_ipmap() {
	let m = {};
	try { let lm = lease_map(); for (let ip in lm) if (lm[ip]?.mac) m[lm[ip].mac] = ip; } catch (e) {}
	for (let s in (uci_load('dhcp') ?? [])) if (s['.type'] == 'host' && s.ip) for (let x in as_list(s.mac)) m[lc(x)] = s.ip;
	return m;
}
// 按「设备 → 软件 → 国家」、每种按去向分好的规则
function sp_rules(o, mg) {
	let out = [];
	let add = (kind, t, line) => {
		let to = sp_target(t, mg);
		if (!to) return;
		let g = null;
		for (let x in out) if (x.kind == kind && x.to == to) g = x;
		if (!g) { g = { kind, to, lines: [] }; push(out, g); }
		if (line) push(g.lines, line);
	};
	// 设备现在的固定 IP 优先（改了局域网网段，固定 IP 跟着搬了），没有再用设的时候记下的
	let ipm = length(o.dev ?? {}) ? sp_ipmap() : {};
	for (let mac in o.dev) { let d = o.dev[mac], ip = ipm[mac] || d?.ip; if (ip) { if (d) d.ip = ip; add('d', d.t, 'SRC-IP-CIDR,' + ip + '/32'); } }
	// 按家人一键不走代理（用户 11/25）：他名下的设备（包括以后认领的）都直连；单独给某台设备设过的按设备的来
	if (length(o.fam)) {
		// 先占好「设备 → 直连」这一组（可以是空的）：以后家人多了设备只换规则集内容，不用重启 OpenClash
		add('d', 'DIRECT', null);
		let own = own_load(), ip = sp_ipmap();
		for (let mac in own) if (own[mac]?.ok && o.fam[own[mac].uid] && !o.dev[mac] && ip[mac]) add('d', 'DIRECT', 'SRC-IP-CIDR,' + ip[mac] + '/32');
	}
	for (let dm in o.site) if (o.site[dm]) add('a', o.site[dm], 'DOMAIN-SUFFIX,' + dm);
	for (let id in o.capp) { let c = o.capp[id]; if (c?.t) for (let dm in (c.doms ?? [])) add('a', c.t, 'DOMAIN-SUFFIX,' + dm); }
	for (let a in sp_apps()) if (o.app[a[0]]) for (let dm in a[2]) add('a', o.app[a[0]], 'DOMAIN-SUFFIX,' + dm);
	for (let g in SP_GEO) if (o.geo[g[0]]) add('g', o.geo[g[0]], 'GEOIP,' + g[0]);
	let n = 0;
	for (let g in out) g.name = sprintf('cmcp_sp_%s%d', g.kind, n++);
	return out;
}
// OpenClash：自定义规则里自己那一段 + 规则集文件。返回要不要重启；内容变了的规则集记在 SP_CHG（只让 OpenClash 重新读这几个）
let SP_CHG = [];
function sp_oc_write(rules) {
	mkdir(SP_DIR);
	let old = split(trim(sh('ls ' + shq(SP_DIR) + ' 2>/dev/null').out ?? ''), '\n'), want = {};
	SP_CHG = [];
	for (let g in rules) want[g.name + '.yaml'] = '# 由路由器面板「分流」自动生成，不要手动修改\n' + (length(g.lines) ? 'payload:\n' + join('', map(g.lines, (l) => '  - ' + l + '\n')) : 'payload: []\n');
	for (let f in old) if (match(f, /^cmcp_sp_[dag][0-9]+\.yaml$/) && !want[f]) unlink(SP_DIR + '/' + f);
	for (let f in want) if (readfile(SP_DIR + '/' + f) != want[f]) { writefile(SP_DIR + '/' + f, want[f]); push(SP_CHG, replace(f, /\.yaml$/, '')); }
	let s = readfile(SP_CUSTOM);
	if (s == null) s = 'rules:\n';
	// 规则集声明（rule-providers 里）有 4 行：名字那行带标记，下面 3 行缩进更深；一起去掉
	let skip = 0;
	s = join('\n', filter(split(s, '\n'), (l) => {
		if (skip > 0) { if (match(l, /^[ \t]{4,}(type|behavior|path):/)) { skip--; return false; } skip = 0; }
		if (index(l, SP_MARK) >= 0) { skip = match(l, /^[ \t]+cmcp_sp_/) ? 3 : 0; return false; }
		return true;
	}));
	let rl = join('', map(rules, (g) => sprintf('- RULE-SET,%s,%s %s\n', g.name, g.to, SP_MARK)));
	let pv = join('', map(rules, (g) => sprintf('  %s: %s\n    type: file\n    behavior: classical\n    path: ./rule_provider/%s.yaml\n', g.name, SP_MARK, g.name)));
	if (length(rules)) {
		if (!match(s, /(^|\n)rules:[ \t]*(\n|$)/)) die('自定义规则文件里找不到「rules:」行，没有修改');
		// 放在「不走代理」那一行后面（它要最先匹配）
		if (match(s, /\n- RULE-SET,cmcp_blacklist,[^\n]*\n/)) s = replace(s, /(\n- RULE-SET,cmcp_blacklist,[^\n]*\n)/, (m, a) => a + rl);
		else s = replace(s, /(^|\n)rules:[ \t]*\n/, (m, p1) => p1 + 'rules:\n' + rl);
		if (match(s, /(^|\n)rule-providers:[ \t]*\n/)) s = replace(s, /(^|\n)rule-providers:[ \t]*\n/, (m, p1) => p1 + 'rule-providers:\n' + pv);
		else s = 'rule-providers:\n' + pv + s;
	}
	let before = readfile(SP_CUSTOM);
	if (s == before) return false;
	if (before != null && !getenv('CMCP_SP_KIND')) oc_backup_file('custom', SP_CUSTOM);
	writefile(SP_CUSTOM + '.cmcp_tmp', s);
	rename(SP_CUSTOM + '.cmcp_tmp', SP_CUSTOM);
	if (!getenv('CMCP_SP_KIND')) { let c = ucur(); if (c.get('openclash', 'config', 'enable_custom_clash_rules') != '1') { c.set('openclash', 'config', 'enable_custom_clash_rules', '1'); c.commit('openclash'); } }
	return true;
}
// Nikki：uci 里的规则（会放到所有规则最前面）。返回要不要重启
function sp_nk_write(rules) {
	let U = conf().uci, cur = uci_load('nikki') ?? [], cmds = [], old = [], nw = [];
	for (let s in cur) if (s['.type'] == 'rule' && match(s['.name'], /^cmcp_sp_/)) push(old, sprintf('%s|%s|%s', s.type, s.matcher, s.node));
	for (let g in rules) for (let l in g.lines) { let p = split(l, ','); push(nw, sprintf('%s|%s|%s', p[0], join(',', slice(p, 1)), g.to)); }
	if (join('\n', old) == join('\n', nw)) return false;
	for (let s in cur) if (s['.type'] == 'rule' && match(s['.name'], /^cmcp_sp_/)) push(cmds, 'delete ' + shq('nikki.' + s['.name']));
	let i = 0;
	for (let x in nw) {
		let p = split(x, '|'), id = 'nikki.cmcp_sp_' + i++;
		push(cmds, 'set ' + shq(id + '=rule'), 'set ' + shq(id + '.enabled=1'), 'set ' + shq(id + '.type=' + p[0]), 'set ' + shq(id + '.matcher=' + p[1]), 'set ' + shq(id + '.node=' + p[2]));
		if (p[0] == 'GEOIP' || p[0] == 'SRC-IP-CIDR') push(cmds, 'set ' + shq(id + '.no_resolve=0'));
	}
	if (length(nw)) push(cmds, 'set ' + shq('nikki.mixin.rule=1'));
	let r = sh(join(' && ', map(cmds, (c) => U + ' ' + c)) + ' && ' + U + ' commit nikki');
	if (r.code != 0) die('保存失败：' + trim(r.err ?? r.out ?? ''));
	return true;
}
// 写规则；返回 { restart: 要不要重启插件 }
// 选了具体策略组的才让看门狗每分钟查（split.grp）
function sp_mark(o) {
	let any = false;
	for (let x in sp_each(o)) if (x[2] && x[2] != 'DIRECT' && x[2] != 'PROXY') any = true;
	if (length(o.fam)) any = true; // 家人新认领的设备、IP 变了，看门狗每分钟补上
	if (any) writefile(ETC + '/split.grp', '1'); else unlink(ETC + '/split.grp');
}
function sp_apply(o, kind) {
	sp_mark(o);
	let groups = sp_groups() ?? sp_cfg_groups(kind), mg = sp_main(groups);
	let rules = sp_rules(o, mg), need = kind == 'nikki' ? sp_nk_write(rules) : sp_oc_write(rules);
	if (kind == 'openclash' && !need) for (let n in SP_CHG) try { if (!getenv('CMCP_SP_PROXIES')) api('PUT', '/providers/rules/' + n, null, 10); } catch (e) {}
	if (need) { o.pending = true; cmcp_writej(SP_F, o); }
	return { restart: need };
}
function sp_pin(mac, ip) {
	for (let s in (uci_load('dhcp') ?? [])) if (s['.type'] == 'host' && index(lc(join(' ', as_list(s.mac))), mac) >= 0) return s.ip ?? ip;
	if (!match(ip ?? '', /^\d+\.\d+\.\d+\.\d+$/)) die('这台设备现在没有 IP，等它连上网再设');
	let U = conf().uci, id = 'dhcp.cmcp_sp_' + replace(mac, /:/g, '');
	let r = sh(sprintf('%s set %s && %s set %s && %s set %s && %s set %s && %s commit dhcp', U, shq(id + '=host'), U, shq(id + '.mac=' + mac), U, shq(id + '.ip=' + ip), U, shq(id + '.cmcp_split=1'), U));
	if (r.code != 0) die('固定 IP 失败');
	sp_run('/etc/init.d/dnsmasq reload');
	return ip;
}
function sp_unpin(mac) {
	for (let s in (uci_load('dhcp') ?? [])) if (s['.type'] == 'host' && s.cmcp_split == '1' && lc(s.mac ?? '') == mac) {
		sh(sprintf('%s delete %s && %s commit dhcp', conf().uci, shq('dhcp.' + s['.name']), conf().uci));
		sp_run('/etc/init.d/dnsmasq reload');
	}
}
P.split_get = function() {
	let kind = sp_kind(), o = sp_read();
	if (!kind) return { kind: null };
	let groups = sp_groups(), live = groups != null, nodes = live ? sp_nodes() ?? [] : [];
	groups ??= sp_cfg_groups(kind) ?? [];
	let devs = [];
	try { devs = P.devices().devices ?? []; } catch (e) {}
	return {
		kind, live, groups, main: sp_main(groups), pending: !!o.pending, moved: o.moved ?? [],
		dev: o.dev, app: o.app, geo: o.geo, fam: o.fam, site: o.site, capp: o.capp, nodes,
		apps: map(sp_apps(), (a) => ({ id: a[0], name: a[1], doms: a[2] })), geos: map(SP_GEO, (g) => ({ id: g[0], name: g[1] })),
		devices: map(filter(devs, (d) => d.mac), (d) => ({ mac: d.mac, name: d.name ?? d.hostname ?? '', ip: d.ip, online: !!d.online }))
	};
};
// a: { dev: { mac, ip, name, t } } / { app: { id, t } } / { geo: { id, t } }；t 为空 = 跟随全局（去掉）；DIRECT / PROXY / 策略组名
P.split_set = function(a) {
	let kind = sp_kind();
	if (!kind) die('分流只支持 OpenClash 和 Nikki');
	let o = sp_read(), x = a?.dev ?? a?.app ?? a?.geo ?? a?.site ?? a?.capp, t = x?.t ? '' + x.t : null;
	if (a?.fam) {
		let uid = '' + (a.fam.uid ?? '');
		if (!match(uid, /^[A-Za-z0-9_-]{1,64}$/)) die('选一个家人');
		if (a.fam.on) o.fam[uid] = 'DIRECT'; else delete o.fam[uid];
		cmcp_writej(SP_F, o);
		let r = sp_apply(o, kind), g = P.split_get();
		g.restart = r.restart || g.pending;
		return g;
	}
	if (!x) die('不支持的操作');
	if (t && t != 'DIRECT' && t != 'PROXY') {
		let g = sp_groups() ?? sp_cfg_groups(kind) ?? [], nd = sp_nodes();
		if (index(g, t) < 0 && !length(filter(nd ?? [], (y) => y.n == t))) die(nd == null ? '要选节点，先打开 ' + (kind == 'nikki' ? 'Nikki' : 'OpenClash') : '没有这个策略组或节点：' + t);
		if (index(g, t) < 0) { o.nk ??= []; if (index(o.nk, t) < 0) push(o.nk, t); o.nk = slice(o.nk, -100); }
	}
	if (t == 'PROXY' && !sp_main(sp_groups() ?? sp_cfg_groups(kind))) die('找不到主策略组，先打开 ' + (kind == 'nikki' ? 'Nikki' : 'OpenClash'));
	if (a.dev) {
		let mac = lc(trim('' + (x.mac ?? '')));
		if (!match(mac, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) die('选一台设备');
		if (t) { let ip = sp_pin(mac, x.ip); o.dev[mac] = { t, ip, name: substr('' + (x.name ?? ''), 0, 40) }; }
		else if (o.dev[mac]) { delete o.dev[mac]; sp_unpin(mac); }
	} else if (a.site) {
		let d = sp_dom(x.d), old = x.old ? sp_dom(x.old) : null;
		if (!d) die('网址写成 example.com 这样');
		if (old && old != d) delete o.site[old];
		if (t) { if (!o.site[d] && length(keys(o.site)) >= 200) die('最多 200 个网站'); o.site[d] = t; } else delete o.site[d];
	} else if (a.capp) {
		let id = '' + (x.id ?? '');
		if (x.del) { if (!o.capp[id]) die('没有这个软件了'); delete o.capp[id]; }
		else {
			if (length(id) && !o.capp[id]) die('没有这个软件了');
			if (!length(id)) { if (length(keys(o.capp)) >= 50) die('最多加 50 个软件'); id = 'c' + rand_str(8); }
			let name = substr(trim('' + (x.name ?? o.capp[id]?.name ?? '')), 0, 20);
			if (!length(name)) die('给软件起个名字');
			let doms = type(x.doms) == 'array' ? x.doms : (o.capp[id]?.doms ?? []), ok = [];
			for (let dm in doms) { let v = sp_dom(dm); if (!v) die('网址不对：' + substr('' + dm, 0, 60)); if (index(ok, v) < 0) push(ok, v); }
			if (!length(ok)) die('至少填一个网址');
			if (length(ok) > 50) die('一个软件最多 50 个网址');
			o.capp[id] = { name, doms: ok, t: ('t' in x) ? t : (o.capp[id]?.t ?? null) };
		}
	} else if (a.app) {
		let ok = false; for (let p in sp_apps()) if (p[0] == x.id) ok = true;
		if (!ok) die('没有这个软件');
		if (t) o.app[x.id] = t; else delete o.app[x.id];
	} else {
		let ok = false; for (let p in SP_GEO) if (p[0] == x.id) ok = true;
		if (!ok) die('没有这个国家或地区');
		if (t) o.geo[x.id] = t; else delete o.geo[x.id];
	}
	cmcp_writej(SP_F, o);
	let r = sp_apply(o, kind);
	let g = P.split_get();
	g.restart = r.restart || g.pending;
	return g;
};
/* 学习模式（用户 11/27）：选一台设备，3 分钟里它访问了哪些网站（从 OpenClash / Nikki 的连接里看），帮你认出软件用的网址。
   只有主账号能用（能看到别人访问了哪些网站，不放进任何家人权限）；记录只在内存里（/tmp），不上传 */
const SP_LEARN = getenv('CMCP_SPL_F') || '/tmp/cmcp_sp_learn.json', SP_LEARN_SECS = 180;
P.split_learn = function(a) {
	let act = '' + (a?.act ?? 'get');
	if (act == 'start') {
		if (!sp_kind()) die('分流只支持 OpenClash 和 Nikki');
		let ip = trim('' + (a?.ip ?? ''));
		if (!match(ip, /^\d+\.\d+\.\d+\.\d+$/)) die('这台设备现在没有 IP，等它连上网再识别');
		// 每次识别一个编号：上一次还在跑的发现编号变了就自己停（不会跟这次的混在一起）
		let rid = rand_str(10);
		cmcp_writej(SP_LEARN, { rid, ip, name: substr('' + (a?.name ?? ''), 0, 40), at: time(), until: time() + SP_LEARN_SECS, hosts: {}, nohost: 0, run: true });
		sp_run(sprintf('%s/cmcp-splearn %s %d %s', SBIN, shq(ip), SP_LEARN_SECS, shq(rid)));
		return P.split_learn({ act: 'get' });
	}
	if (act == 'stop') { let o = cmcp_readj(SP_LEARN, null); if (type(o) == 'object') { o.run = false; o.until = time(); cmcp_writej(SP_LEARN, o); } }
	let o = cmcp_readj(SP_LEARN, null);
	if (type(o) != 'object') return { run: false };
	let hl = [];
	for (let h in (type(o.hosts) == 'object' ? o.hosts : {})) push(hl, [h, +o.hosts[h] || 0]);
	hl = slice(sort(hl, (x, y) => y[1] - x[1]), 0, 300);
	return { ip: o.ip, name: o.name ?? '', at: o.at, until: o.until, run: !!o.run && act != 'stop' && time() < (+o.until || 0) + 15, hosts: hl, nohost: +o.nohost || 0, err: o.err ?? null };
};
// 用户点「现在重启」
// 局域网网段改了并保留（风险 8、43）：「不走代理」和按设备分流的规则按设备新的固定 IP 重写
push(NG_KEPT, function(what) {
	if (index(what, '局域网') < 0) return;
	let k = sp_kind();
	if (!k) return;
	try { if (k == 'openclash' && length(bl_load())) { bl_write_ruleset(bl_load()); bl_apply(null); } } catch (e) {}
	let o = sp_read();
	if (length(keys(o.dev ?? {}))) sp_apply(o, k);
});
P.split_restart = function() {
	let kind = sp_kind(), o = sp_read();
	if (!kind) die('分流只支持 OpenClash 和 Nikki');
	delete o.pending; cmcp_writej(SP_F, o);
	sp_run(kind == 'nikki' ? '/etc/init.d/nikki restart' : '/etc/init.d/openclash restart');
	return { ok: true };
};
// 看门狗每分钟调一次：选的策略组没了（订阅更新后），改走主策略组、推送、重启插件
P.split_check = function() {
	let kind = sp_kind(), o = sp_read();
	if (!kind) return { ok: true };
	let want = [];
	for (let x in sp_each(o)) { let t = x[2]; if (t && t != 'DIRECT' && t != 'PROXY' && index(want, t) < 0) push(want, t); }
	if (length(o.fam)) {
		// 家人的设备变了（新认领、IP 变了）：OpenClash 只换规则集内容；Nikki 要重启，留给用户点
		sp_apply(o, kind);
		o = sp_read();
	}
	if (!length(want)) return { ok: true };
	// 插件在跑时看策略组和节点；没在跑时只能从配置文件里看策略组（节点是订阅里的，读不到就先不动）
	let names = sp_names(), live = names != null;
	if (!live) names = sp_cfg_groups(kind);
	if (names == null) return { ok: true };
	// 没在跑时：选的节点先不算没了（订阅里的节点读不到），只看策略组
	let isNode = (t) => index(o.nk ?? [], t) >= 0;
	let gone = filter(want, (t) => index(names, t) < 0 && (live || !isNode(t)));
	if (!length(gone)) return { ok: true };
	o.moved ??= [];
	for (let x in sp_each(o)) {
		if (index(gone, x[2]) < 0) continue;
		if (x[0] == 'dev' || x[0] == 'capp') o[x[0]][x[1]].t = 'PROXY'; else o[x[0]][x[1]] = 'PROXY';
	}
	for (let t in gone) push(o.moved, { g: t, at: time(), node: index(o.nk ?? [], t) >= 0 });
	o.nk = filter(o.nk ?? [], (t) => index(gone, t) < 0);
	o.moved = slice(o.moved, -10);
	cmcp_writej(SP_F, o);
	sp_apply(o, kind);
	o = sp_read(); delete o.pending; cmcp_writej(SP_F, o);
	let gn = filter(gone, (t) => index(map(o.moved, (m) => m.node ? m.g : null), t) >= 0), what = length(gn) == length(gone) ? '节点' : length(gn) ? '策略组和节点' : '策略组';
	try { sh(sprintf('%s/cmcp-notify warn split %s %s split >/dev/null 2>&1', SBIN, shq('分流：' + what + '「' + join('」「', gone) + '」没了'), shq('订阅更新后找不到了，选它的设备、网站和软件已改走主策略组。'))); } catch (e) {}
	sp_run(kind == 'nikki' ? '/etc/init.d/nikki restart' : '/etc/init.d/openclash restart');
	return { ok: true, moved: gone };
};

// 远程开关（remote.json 的 off：页面名列表）：出了问题的功能先关掉，等热补丁修好再开。大家都能读（view 组）
P.remote_flags = function() {
	let off = cmcp_readj(ETC + '/remote.json', null)?.off;
	return { off: type(off) == 'array' ? filter(map(slice(off, 0, 50), (x) => '' + x), (x) => match(x, /^[a-z0-9_]{1,20}$/)) : [] };
};

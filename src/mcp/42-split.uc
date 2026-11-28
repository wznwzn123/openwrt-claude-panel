/* ---------------- 6.0 第 69 项：分流——按设备、按软件、按国家和地区，选直连 / 代理 / 某个策略组 ----------------
 * 用户 11/26 定：每个设备 / 软件 / 国家都能选直连、代理（主策略组）或某个策略组；只支持 OpenClash 和 Nikki，别的说清楚不支持；
 * 订阅更新后选的策略组没了：自动改走主策略组并推送（看门狗每分钟查一次，见 split_check）。
 * 顺序：「不走代理」最先，然后设备、软件、国家（同一个连接先按设备算）。
 * OpenClash：生成的规则集放 /etc/openclash/rule_provider/cmcp_sp_*.yaml，自定义规则里放一段（# [cmcp-split] 标记）；
 *   只改了规则集内容时让 OpenClash 重新读规则集，不用重启；多了 / 少了一个去向（要改自定义规则）才要重启，由用户点「现在重启」。
 * Nikki：写进 uci（nikki.mixin.rule=1 + config rule 'cmcp_sp_N'），要重启 Nikki 才生效（用户 11/26 定：先问，点了才重启）。
 * 设备按 IP 认：设了分流的设备自动给固定 IP（dhcp host，cmcp_split=1），去掉分流时删掉自己加的。
 * 用户 11/27 加：能选单个节点（不只是策略组）；自己加网站（site）和软件（capp：名字 + 几个网址）；学习模式（split_learn：记下一台设备几分钟里访问的网站，帮你认出软件用的网址）。
 * 用户 11/28 加（总表 #97）：PassWall 2、PassWall、HomeProxy、SSR Plus+ 也能分流，写法见下面「别的插件」那一段。
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
function sp_apps0() {
	let r = cmcp_readj(ETC + '/remote.json', null)?.split_apps, out = [];
	if (type(r) != 'array') return SP_APPS0;
	for (let a in r) {
		if (type(a) != 'array' || !match('' + a[0], /^[a-z0-9_-]{1,30}$/) || !length('' + a[1]) || type(a[2]) != 'array') return SP_APPS0;
		for (let d in a[2]) if (!match('' + d, /^[a-z0-9.-]{1,80}$/)) return SP_APPS0;
		push(out, [a[0], substr('' + a[1], 0, 40), a[2]]);
	}
	return length(out) ? out : SP_APPS0;
}
// 再加上从官网「网址 → App」表里选过的软件（选的时候把网址存进 split.json 的 appd：表在内存盘里，重启没了也不影响已经设好的分流）
function sp_apps(o) {
	let l = slice(sp_apps0()), have = {};
	for (let a in l) have[a[0]] = 1;
	let ad = type(o?.appd) == 'object' ? o.appd : {};
	for (let id in ad) if (!have[id] && type(ad[id]?.doms) == 'array' && length(ad[id].doms)) push(l, [id, '' + (ad[id].name ?? id), ad[id].doms, true]);
	return l;
}
/* 官网公开的「网址 → App」表（用户 11/28 选「官网放公开表 路由器下载对照」）：GET 官网 /api/apps，放内存盘 /tmp/cmcp_apps.json（约 230 KB，只有一份），
   面板一打开分流就来要，没有或者超过一天就当场下载；7 天没人用看门狗删掉；
   只下载、不上传任何东西（访问记录不出路由器）。识别软件对照、软件页搜索都用它。下载不下来 10 分钟后再试。测试用 CMCP_SP_TBL（文件）、CMCP_SP_HUB（官网地址） */
const SP_TBL = getenv('CMCP_SP_TBL') || '/tmp/cmcp_apps.json';
const SP_DOM = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
function sp_tbl_clean(j) {
	if (type(j) != 'object' || type(j.apps) != 'array' || !match('' + (j.v ?? ''), /^[a-f0-9]{6,40}$/)) return null;
	let cats = {}, apps = [];
	for (let k in (type(j.cats) == 'object' ? j.cats : {})) if (match(k, /^[a-z]{1,10}$/)) cats[k] = substr('' + j.cats[k], 0, 12);
	for (let a in j.apps) {
		if (length(apps) >= 1500) break;
		if (type(a) != 'array' || !match('' + a[0], /^[a-z0-9_]{1,30}$/) || type(a[1]) != 'string' || !length(a[1]) || type(a[5]) != 'array' || !cats[a[3]]) continue;
		let ds = filter(slice(a[5], 0, 800), (d) => type(d) == 'string' && length(d) <= 253 && match(d, SP_DOM));
		if (length(ds)) push(apps, [a[0], substr(a[1], 0, 40), substr('' + (a[2] ?? ''), 0, 80), a[3], substr('' + (a[4] ?? ''), 0, 120), ds]);
	}
	return length(apps) ? { v: j.v, cats, apps } : null;
}
// fetch：没有或者超过一天就下载；now：面板打开分流时要的，不管上次失败没有，马上下载（用户 11/28：打开分流就要马上读到，不能点几次才出来）
// 用过就记一下（.used），看门狗 7 天没人用就删掉（用户 11/28：不要一直占着内存）
function sp_tbl(fetch, now) {
	let st = stat(SP_TBL), o = st ? cmcp_readj(SP_TBL, null) : null, fl = SP_TBL + '.fail';
	if (fetch && (!o || time() - st.mtime > 86400) && (now || time() - (stat(fl)?.mtime ?? 0) > 600)) {
		let hub = getenv('CMCP_SP_HUB') || CL.ann_hub(), tmp = SP_TBL + '.dl';
		sh(sprintf('curl -sf -m 15 -o %s %s', shq(tmp), shq(hub + '/api/apps')));
		let n = sp_tbl_clean(cmcp_readj(tmp, null));
		unlink(tmp);
		if (n) { cmcp_writej(SP_TBL, n); writefile(SP_TBL + '.v', n.v); o = n; unlink(fl); }
		else writefile(fl, '1');
	}
	if (type(o) != 'object' || type(o.apps) != 'array') return null;
	if (fetch) writefile(SP_TBL + '.used', '');
	return o;
}
// 给面板：整张表（面板按版本存在手机里，版本一样就只回「没变」）
P.split_apps = function(a) {
	let t = sp_tbl(true, true);
	if (!t) return { err: '官网的软件表下载不下来，稍后再试' };
	if (a?.v && a.v == t.v) return { v: t.v, same: true };
	return t;
};
const SP_GEO = [['CN', '中国大陆'], ['HK', '香港'], ['TW', '台湾'], ['JP', '日本'], ['KR', '韩国'], ['SG', '新加坡'], ['US', '美国'], ['GB', '英国'], ['DE', '德国'], ['FR', '法国'], ['CA', '加拿大'], ['AU', '澳大利亚'], ['RU', '俄罗斯'], ['IN', '印度'], ['TH', '泰国'], ['MY', '马来西亚'], ['VN', '越南']];
function sp_read() { let o = cmcp_readj(SP_F, {}); if (type(o) != 'object') o = {}; for (let k in ['dev', 'app', 'geo', 'fam', 'site', 'capp', 'appd']) if (type(o[k]) != 'object') o[k] = {}; return o; }
// 每一条分流的去向：[种类, 编号, 去向]（设备、软件、国家、自己加的网站和软件）
function sp_each(o) { let l = []; for (let k in ['dev', 'app', 'geo', 'site', 'capp']) for (let id in o[k]) { let v = o[k][id]; push(l, [k, id, k == 'dev' || k == 'capp' ? v?.t : v]); } return l; }
// 用的哪个插件：OpenClash、Nikki 看 Clash 接口；PassWall 2、PassWall、HomeProxy、SSR Plus+ 看正在用的（cmcp-proxy active，在跑的优先）
const SP_PXN = { openclash: 'OpenClash', nikki: 'Nikki', passwall2: 'PassWall 2', passwall: 'PassWall', homeproxy: 'HomeProxy', shadowsocksr: 'SSR Plus+' };
const sp_clash = (k) => k == 'openclash' || k == 'nikki';
function sp_kind() {
	let k = getenv('CMCP_SP_KIND');
	if (k != null) return k == 'none' ? null : k;
	let a = px_detect()?.active;
	if (SP_PXN[a] && !sp_clash(a)) return a;
	let c = CL.clash_ctl();
	return c?.id == 'openclash' || c?.id == 'nikki' ? c.id : null;
}
function sp_run(cmd) { let f = getenv('CMCP_SP_RUN'); if (f) { let h = fs_open(f, 'a'); if (h) { h.write(cmd + '\n'); h.close(); } return; } bg(cmd); }
/* ---- 别的插件（用户 11/28 定，总表 #97）：PassWall 2、PassWall、HomeProxy、SSR Plus+ ----
 * 去向记的是节点的名字（跟 Clash 一样）：订阅更新后节点的编号会变，名字一般不变；写的时候再换成编号
 * PassWall / PassWall 2：主节点要是「分流」类型。规则写成 shunt_rules 'cmcp_sp_N'（设备用 source、网址用 domain:、国家用 geoip:），分流节点里 cmcp_sp_N = 去向；
 *   放在所有分流规则最前面（用户 11/28 选：插件自带的「Proxy」这种大规则会先接走）。主节点不是分流类型：先问一次，点了新建分流节点 cmcp_shunt（默认走原来的节点）换上去
 * HomeProxy：路由模式是「自定义路由」时写 routing_rule 'cmcp_sp_N'（也放最前面）；选单个节点用你建过的路由节点，没有就建 cmcp_rn_*。
 *   别的路由模式只能直连 / 代理（要改成自定义路由得连 DNS 一起改，改错了全家断网，不自动改）：设备写 control 的 MAC 列表，网址写 direct_list.txt / proxy_list.txt
 * SSR Plus+：只能直连 / 代理：设备写 access_control 的 lan_bp_ips / lan_fp_ips，网址写 white.list / black.list
 * 列表里面板加了哪些记在 split_px.json，只增删自己加的，你原来就有的不动；这些列表文件不能写注释（HomeProxy 会把每一行都当成网址）
 * 测试用：CMCP_SP_PXDIR（插件文件的根目录，代替 /）、CMCP_SP_INITD（插件启动脚本的目录） */
const SP_R = getenv('CMCP_SP_PXDIR') ?? '';
const sp_lab = (s, k) => '' + (s?.[k] || s?.['.name'] || '');
function sp_pw(kind) {
	let secs = uci_load(kind) ?? [], g = null, by = {}, nodes = [];
	for (let s in secs) {
		if (s['.type'] == 'global') { if (!g) g = s; }
		else if (s['.type'] == 'nodes') { by[s['.name']] = s; push(nodes, s); }
	}
	// 新版 PassWall 的主节点叫 node，老版叫 tcp_node
	let opt = g && g.node == null && g.tcp_node != null ? 'tcp_node' : 'node', mid = g?.[opt], mn = by[mid];
	return { secs, g, by, nodes, opt, mid, main: mn, shunt: mn?.protocol == '_shunt' };
}
// 老版本的 PassWall 分流规则没有「来源」：不能按设备分。看装着的生成配置的程序里有没有读 source（找不到这个文件当成能）
function sp_pw_src(kind, st) {
	let f = SP_R + '/usr/lib/lua/luci/' + kind + '/' + (lc('' + (st.main?.type ?? '')) == 'sing-box' ? 'util_sing-box.lua' : 'util_xray.lua'), s = readfile(f);
	return s == null || index(s, 'e.source') >= 0;
}
function sp_hp() {
	let secs = uci_load('homeproxy') ?? [], by = {}, nodes = [], rns = [], rules = [];
	for (let s in secs) {
		by[s['.name']] = s;
		let t = s['.type'];
		if (t == 'node') push(nodes, s); else if (t == 'routing_node') push(rns, s); else if (t == 'routing_rule') push(rules, s);
	}
	let mode = by.config?.routing_mode ?? 'bypass_mainland_china';
	return { secs, by, nodes, rns, rules, custom: mode == 'custom', ctl: by.control ?? {}, dout: by.routing?.default_outbound };
}
function sp_ssr() {
	let secs = uci_load('shadowsocksr') ?? [], by = {}, g = null, ac = null;
	for (let s in secs) { by[s['.name']] = s; if (s['.type'] == 'global' && !g) g = s; if (s['.type'] == 'access_control' && !ac) ac = s; }
	return { secs, by, g, ac };
}
// 这个插件能做到什么：node 能选单个节点、dev 能按设备、geo 能按国家、two 只有直连 / 代理（lim 是给你看的原因）、need 要先换成分流节点
function sp_cap(kind) {
	if (sp_clash(kind)) return { node: true, dev: true, geo: true };
	if (kind == 'passwall' || kind == 'passwall2') {
		let st = sp_pw(kind);
		return { node: true, dev: st.shunt ? sp_pw_src(kind, st) : true, geo: true, need: st.shunt ? null : 'shunt', cur: st.main ? sp_lab(st.main, 'remarks') : '' };
	}
	if (kind == 'homeproxy') {
		let h = sp_hp();
		return h.custom ? { node: true, dev: true, geo: false } : { node: false, dev: true, geo: false, two: true, lo: h.ctl.lan_proxy_mode == 'listed_only', lim: 'HomeProxy 现在的路由模式只能选直连或代理\n要选节点 在 HomeProxy 里把路由模式改成「自定义路由」' };
	}
	if (kind == 'shadowsocksr') return { node: false, dev: true, geo: false, two: true, lim: 'SSR Plus+ 只能选直连或代理' };
	return {};
}
// 能选的去向：groups（PassWall 的负载均衡、自动选择节点，HomeProxy 的路由节点）、nodes（单个节点）、main（「代理」走的那个，没有 = null）
function sp_px_list(kind) {
	let gs = [], ns = [], seen = {}, mg0 = null;
	let nd = (n) => { if (length(n) && !seen[n]) { seen[n] = 1; push(ns, { n, d: 0, reg: CL.node_meta(n).reg }); } };
	if (kind == 'passwall' || kind == 'passwall2') {
		let st = sp_pw(kind);
		for (let s in st.nodes) {
			let p = '' + (s.protocol ?? ''), n = sp_lab(s, 'remarks');
			if (seen[n] || p == '_shunt' || p == '_iface') continue;
			if (p == '_balancing' || p == '_urltest') { seen[n] = 1; push(gs, n); } else if (!match(p, /^_/)) nd(n);
		}
		let m = st.by[st.shunt ? st.main.default_node : st.mid];
		mg0 = m && m.protocol != '_shunt' ? sp_lab(m, 'remarks') : null;
	} else if (kind == 'homeproxy') {
		let h = sp_hp();
		if (h.custom) {
			for (let r in h.rns) { let n = sp_lab(r, 'label'); if (r.enabled == '1' && !match(r['.name'], /^cmcp_rn_/) && !seen[n]) { seen[n] = 1; push(gs, n); } }
			for (let s in h.nodes) nd(sp_lab(s, 'label'));
			let r = h.by[h.dout];
			mg0 = r?.['.type'] == 'routing_node' ? sp_lab(r, 'label') : null;
		} else {
			let mn = h.by.config?.main_node;
			mg0 = mn && mn != 'nil' ? (mn == 'urltest' ? '自动选择' : sp_lab(h.by[mn] ?? { '.name': mn }, 'label')) : null;
		}
	} else if (kind == 'shadowsocksr') {
		let x = sp_ssr(), gsv = x.g?.global_server;
		mg0 = gsv && gsv != 'nil' ? sp_lab(x.by[gsv] ?? { '.name': gsv }, 'alias') : null;
	}
	return { groups: gs, nodes: slice(ns, 0, 500), main: mg0 };
}
// 现在有哪些策略组（null = 读不到：插件没在跑）
function sp_proxies() {
	let f = getenv('CMCP_SP_PROXIES');
	if (f) return cmcp_readj(f, null)?.proxies;
	try { return api('GET', '/proxies', null, 5)?.proxies; } catch (e) { return null; }
}
function sp_groups() {
	let k = sp_kind();
	if (k && !sp_clash(k)) return sp_px_list(k).groups;
	let p = sp_proxies();
	if (type(p) != 'object') return null;
	let order = p.GLOBAL?.all ?? keys(p), out = [];
	for (let n in order) if (n != 'GLOBAL' && index(n, ',') < 0 && match(p[n]?.type ?? '', /^(Selector|URLTest|Fallback|LoadBalance|Relay)$/)) push(out, n);
	return out;
}
// 订阅合集（proxy-providers）里的节点：规则里不能直接写它们（OpenClash 会跳过这条自定义规则，Nikki 会起不来），不让单独选、也不当候选。
// 读不到（老内核没有这个接口）当成没有。测试用 CMCP_SP_PROVIDERS（假的 /providers/proxies 结果）
function sp_prov_nodes() {
	let f = getenv('CMCP_SP_PROVIDERS'), r = null, out = {};
	if (f) r = cmcp_readj(f, null);
	else try { r = api('GET', '/providers/proxies', null, 5); } catch (e) {}
	for (let k in (type(r?.providers) == 'object' ? r.providers : {})) {
		let pv = r.providers[k];
		if (k == 'default' || pv?.vehicleType == 'Compatible') continue;
		for (let x in (type(pv?.proxies) == 'array' ? pv.proxies : [])) if (x?.name) out[x.name] = 1;
	}
	return out;
}
// 单个节点（用户 11/27：能选机场里的节点）：不是策略组、不是直连 / 拒绝这些内置的。名字里有逗号的写不进规则，不列。带延迟和地区（按地区分组显示）
function sp_nodes() {
	let k = sp_kind();
	if (k && !sp_clash(k)) return sp_px_list(k).nodes;
	let p = sp_proxies();
	if (type(p) != 'object') return null;
	let order = p.GLOBAL?.all ?? keys(p), out = [], seen = {}, pvn = sp_prov_nodes();
	for (let n in order) {
		let x = p[n];
		if (seen[n] || n == 'GLOBAL' || index(n, ',') >= 0 || type(x) != 'object') continue;
		if (match(x.type ?? '', /^(Selector|URLTest|Fallback|LoadBalance|Relay|Direct|Reject|RejectDrop|Pass|Compatible|Dns)$/i) || match(n, /^(DIRECT|REJECT|REJECT-DROP|PASS|COMPATIBLE)$/)) continue;
		seen[n] = 1;
		let h = type(x.history) == 'array' ? x.history : [], d = length(h) ? +(h[length(h) - 1]?.delay ?? 0) : 0;
		push(out, { n, d: d > 0 ? d : 0, reg: CL.node_meta(n).reg, ...(pvn[n] ? { p: 1 } : {}) });
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
	if (kind && !sp_clash(kind)) return sp_px_list(kind).groups;
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
// 主策略组：节点自动切换选的那个；没选过或者组没了，跟节点自动换一样自动认（兜底规则一路跟到选着节点的「手动选择」组）；
// 插件没在跑（问不到接口）时用配置文件里第一个组
function sp_main(groups) {
	let k = sp_kind();
	if (k && !sp_clash(k)) return sp_px_list(k).main;
	let a = cmcp_readj(ETC + '/autosw.json', {})?.group, p = sp_proxies();
	if (a && index(groups ?? [], a) >= 0 && (!p || p[a]?.type == 'Selector')) return a;
	if (type(p) == 'object') { let m = CL.main_group(p, a); if (m && index(groups ?? [], m) >= 0) return m; }
	for (let n in (groups ?? [])) if (!p || p[n]?.type == 'Selector') return n;
	return null;
}
// 同地区同名：名字去掉编号后一样（用户 11/28：「台湾03 专线 3x」只换「台湾01 专线 3x」「台湾02 专线 3x」）。
// 倍率（3x、×2、2倍）不算编号，倍率不同不算同名；名字里只剩编号不一样的才算
function sp_fam(n) {
	// 倍率先换成字母（0→a … 9→j），后面把剩下的数字（编号）都换成 #
	// 11/28 机场命名测试查出来：「×」是多字节字符，放进 [] 里 musl / glibc 都按字节认，会把编号认成倍率（「香港 01 ×3」和「香港 02 ×3」不算同名）——先换成 x；
	// 「倍率:0.5」要先认（不然「01 倍率」的 01 会被当成倍率）；「Box 3」这种字母后面的 x 不是倍率
	let mk = (v) => '<R' + replace('' + (+v), /[0-9]/g, (c) => chr(97 + +c)) + '>';
	let r = replace('' + n, /×/g, 'x');
	r = replace(r, /倍率[ ]*(:|：)?[ ]*([0-9]+(\.[0-9]+)?)/g, (m, c, v) => mk(v));
	r = replace(r, /(^|[^A-Za-z])[xX][ ]*([0-9]+(\.[0-9]+)?)/g, (m, p, v) => p + mk(v));
	r = replace(r, /([0-9]+(\.[0-9]+)?)[ ]*([xX]([^A-Za-z]|$)|倍)/g, (m, v, d, s, t) => mk(v) + (t ?? ''));
	return replace(r, /[0-9]+/g, '#');
}
// 候选（用户 11/28：先同名、再同地区，同地区都挂了不换）：{ s: 同名的, r: 同地区别的节点 }，各最多 8 个；names 里的策略组不算（认不出地区）
function sp_sibs(n, names) {
	let f = sp_fam(n), reg = CL.node_meta(n).reg, out = { s: [], r: [] };
	for (let x in names) {
		if (x == n) continue;
		if (f != '' + n && sp_fam(x) == f) { if (length(out.s) < 8) push(out.s, x); }
		else if (reg && reg != '?' && CL.node_meta(x).reg == reg && length(out.r) < 8) push(out.r, x);
	}
	return out;
}
const sp_sib_all = (sb) => type(sb) == 'object' ? [...(sb.s ?? []), ...(sb.r ?? [])] : (type(sb) == 'array' ? sb : []);
function sp_target(t, mg) { return t == 'DIRECT' ? 'DIRECT' : t == 'PROXY' ? mg : t; }
// MAC → IP：固定 IP 优先，然后是 DHCP 分配记录
function sp_ipmap() {
	let m = {};
	try { let lm = lease_map(); for (let ip in lm) if (lm[ip]?.mac) m[lm[ip].mac] = ip; } catch (e) {}
	for (let s in (uci_load('dhcp') ?? [])) if (s['.type'] == 'host' && s.ip) for (let x in as_list(s.mac)) m[lc(x)] = s.ip;
	return m;
}
// MAC → 这台设备现在的公网 IPv6（11/28 适配：手机多半用 IPv6 上网，只写 IPv4 的设备规则管不到它）。只要全球地址（2 和 3 开头），每台最多 8 个；测试用 CMCP_SP_NEIGH6
function sp_ip6map() {
	let f = getenv('CMCP_SP_NEIGH6'), out = f ? (readfile(f) ?? '') : (sh('ip -6 neigh show 2>/dev/null').out ?? ''), m = {};
	for (let l in split(out, '\n')) {
		let x = match(l, /^([23][0-9a-fA-F:]+) .*lladdr ([0-9a-fA-F:]{17})/);
		if (!x || match(l, /FAILED|INCOMPLETE/)) continue;
		let mac = lc(x[2]);
		m[mac] ??= [];
		if (length(m[mac]) < 8 && index(m[mac], lc(x[1])) < 0) push(m[mac], lc(x[1]));
	}
	for (let k in m) m[k] = sort(m[k]);
	return m;
}
// 按「设备 → 软件 → 国家」、每种按去向分好的规则
function sp_rules(o, mg) {
	let out = [], all = [];
	// 先记下所有条目，再分组：节点连不上（o.nd）时它的条目改放进换到的同名节点那一组，分组和名字不变（只换规则集内容，不用重启 OpenClash）
	let add = (kind, t, line) => push(all, [kind, t, line]);
	// 设备现在的固定 IP 优先（改了局域网网段，固定 IP 跟着搬了），没有再用设的时候记下的
	let ipm = length(o.dev ?? {}) ? sp_ipmap() : {};
	// IPv6：只给 OpenClash 加（地址变了每分钟检查时只换规则集内容，不用重启）；Nikki 改规则要重启，地址又常变，不加
	let ip6 = sp_kind() == 'openclash' && (length(o.dev ?? {}) || length(o.fam ?? {})) ? sp_ip6map() : {};
	for (let mac in o.dev) {
		let d = o.dev[mac], ip = ipm[mac] || d?.ip;
		if (ip) { if (d) d.ip = ip; add('d', d.t, 'SRC-IP-CIDR,' + ip + '/32'); }
		for (let a in (ip6[mac] ?? [])) add('d', d.t, 'SRC-IP-CIDR,' + a + '/128');
	}
	// 按家人一键不走代理（用户 11/25）：他名下的设备（包括以后认领的）都直连；单独给某台设备设过的按设备的来
	if (length(o.fam)) {
		// 先占好「设备 → 直连」这一组（可以是空的）：以后家人多了设备只换规则集内容，不用重启 OpenClash
		add('d', 'DIRECT', null);
		let own = own_load(), ip = sp_ipmap();
		for (let mac in own) if (own[mac]?.ok && o.fam[own[mac].uid] && !o.dev[mac]) {
			if (ip[mac]) add('d', 'DIRECT', 'SRC-IP-CIDR,' + ip[mac] + '/32');
			for (let a in (ip6[mac] ?? [])) add('d', 'DIRECT', 'SRC-IP-CIDR,' + a + '/128');
		}
	}
	for (let dm in o.site) if (o.site[dm]) add('a', o.site[dm], 'DOMAIN-SUFFIX,' + dm);
	for (let id in o.capp) { let c = o.capp[id]; if (c?.t) for (let dm in (c.doms ?? [])) add('a', c.t, 'DOMAIN-SUFFIX,' + dm); }
	for (let a in sp_apps(o)) if (o.app[a[0]]) for (let dm in a[2]) add('a', o.app[a[0]], 'DOMAIN-SUFFIX,' + dm);
	for (let g in SP_GEO) if (o.geo[g[0]]) add('g', o.geo[g[0]], 'GEOIP,' + g[0]);
	let grp = (kind, to) => { if (!to) return null; for (let x in out) if (x.kind == kind && x.to == to) return x; let g = { kind, to, lines: [] }; push(out, g); return g; };
	for (let e in all) grp(e[0], sp_target(e[1], mg));
	// 选了单个节点的那一类，先占好同地区同名节点（去掉编号后一样）的组（可以是空的）：节点连不上时条目挪过去只换内容，不用重启 OpenClash（用户 11/28）
	// 只给 OpenClash 占：它会跳过写了不存在节点的自定义规则（订阅里同名节点没了也起得来）；Nikki 换节点本来就要重启，不占
	if (sp_kind() == 'openclash') for (let e in all) if (index(o.nk ?? [], e[1]) >= 0) for (let sb in sp_sib_all((o.sib ?? {})[e[1]])) grp(e[0], sb);
	for (let e in all) if (e[2]) { let nd = (o.nd ?? {})[e[1]], g = grp(e[0], type(nd) == 'object' && nd.to ? nd.to : sp_target(e[1], mg)); if (g) push(g.lines, e[2]); }
	let n = 0;
	for (let g in out) g.name = sprintf('cmcp_sp_%s%d', g.kind, n++);
	return out;
}
// OpenClash：自定义规则里自己那一段 + 规则集文件。返回要不要重启；内容变了的规则集记在 SP_CHG（只让 OpenClash 重新读这几个）
let SP_CHG = [];
// 自定义规则「rules:」那一段的结束位置（下一个顶格的键之前）；有 MATCH 就放在它前面
function sp_oc_insert(s, rl) {
	let ls = split(s, '\n'), i = 0, n = length(ls);
	while (i < n && !match(ls[i], /^rules:[ \t]*$/)) i++;
	if (i >= n) return s;
	let at = i + 1;
	for (let j = i + 1; j < n; j++) {
		let l = ls[j];
		if (match(l, /^[A-Za-z_-]+:/)) break;               // 下一个顶格的键
		if (match(l, /^[ \t]*-[ \t]*['"]?MATCH,/)) { at = j; break; }
		if (match(l, /^[ \t]*-/)) at = j + 1;
	}
	return join('\n', [...slice(ls, 0, at), ...split(replace(rl, /\n$/, ''), '\n'), ...slice(ls, at)]);
}
// 分流那段在不在你自己写的规则前面（自定义规则「优先匹配」框里，分流的行后面还有不是面板加的规则）
function sp_oc_order_bad() {
	let ls = split(readfile(SP_CUSTOM) ?? '', '\n'), inr = false, seen = false;
	for (let l in ls) {
		if (match(l, /^rules:[ \t]*$/)) { inr = true; continue; }
		if (match(l, /^[A-Za-z_-]+:/)) { inr = false; continue; }
		if (!inr || !match(l, /^[ \t]*-/)) continue;
		if (index(l, SP_MARK) >= 0) seen = true;
		else if (seen && index(l, '[cmcp-') < 0 && !match(l, /MATCH,/)) return true;
	}
	return false;
}
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
		// 放在你自己写的规则后面（用户 11/28：覆写里自己写的优先），MATCH 前面；「不走代理」那行照样最先
		s = sp_oc_insert(s, rl);
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
	// 用户 11/28：你自己的规则优先——我们的要排在你所有规则后面；你后来又加了规则（排到我们后面）就重写一次
	let seenMine = false, bad = false;
	for (let s in cur) if (s['.type'] == 'rule') { if (match(s['.name'], /^cmcp_sp_/)) seenMine = true; else if (seenMine) bad = true; }
	if (!bad && join('\n', old) == join('\n', nw)) return false;
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
/* 你在覆写里自己写的规则（用户 11/28：自动认出来、显示在分流里；跟分流撞了按你写的走；点「交给分流管」才搬过来）
   OpenClash：自定义规则两个框（上面「优先匹配」= f1，下面「候补匹配」= f2）里不是面板加的那些行；Nikki：uci 里不是面板加的 rule。
   每条 { k: 编号（f1:行号 / f2:行号 / nk:段名）, ty, v, t: 去向, tag: 行尾「# [名字]」, src, pri: 比分流优先（f1 和 Nikki 是，f2 排在订阅规则后面不是） } */
const SP_CUSTOM2 = getenv('CMCP_SP_CUSTOM2') || '/etc/openclash/custom/openclash_custom_rules_2.list';
function sp_own_parse(l) {
	let m = match(l, /^[ \t]*-[ \t]*['"]?([A-Z][A-Z0-9-]*),([^,'"#]+),([^,'"#]+)(,no-resolve)?['"]?[ \t]*(#.*)?$/);
	if (!m) return null;
	let tag = match(m[5] ?? '', /#[ \t]*\[([^\]]{1,30})\]/);
	return { ty: m[1], v: trim(m[2]), t: trim(m[3]), tag: tag ? trim(tag[1]) : '' };
}
function sp_own(kind) {
	let out = [];
	if (kind == 'openclash') {
		for (let fx in [['f1', SP_CUSTOM], ['f2', SP_CUSTOM2]]) {
			let ls = split(readfile(fx[1]) ?? '', '\n'), inr = false;
			for (let i = 0; i < length(ls) && length(out) < 300; i++) {
				let l = ls[i];
				if (match(l, /^rules:[ \t]*$/)) { inr = true; continue; }
				if (match(l, /^[A-Za-z_-]+:/)) { inr = false; continue; }
				if (!inr || index(l, '[cmcp-') >= 0 || match(l, /^[ \t]*#/)) continue;
				let r = sp_own_parse(l);
				// 编号用规则内容（不用行号：中间文件被改过、行号会变）
				if (r && r.ty != 'MATCH') push(out, { k: fx[0] + ':' + r.ty + ',' + r.v + ',' + r.t, ...r, src: fx[0], pri: fx[0] == 'f1' });
			}
		}
	} else if (kind == 'nikki') {
		for (let x in (uci_load('nikki') ?? [])) if (x['.type'] == 'rule' && !match(x['.name'], /^cmcp_sp_/) && x.enabled != '0' && x.type && x.matcher && x.node && length(out) < 300)
			push(out, { k: 'nk:' + x['.name'], ty: x.type, v: x.matcher, t: x.node, tag: '', src: 'nk', pri: true });
	}
	return out;
}
// 分流的一条设置跟你自己写的撞没撞：网址一样、或者你写的包住了它（全撞），或者它包住了你写的（部分撞）；设备看固定 IP
function sp_dcov(a, b) { return a == b || substr(a, -length(b) - 1) == '.' + b; } // a 在 b 里面
function sp_conflicts(o, own) {
	let ov = {}, doms = [], ips = {};
	for (let x in own) if (x.pri) {
		if (x.ty == 'DOMAIN-SUFFIX' || x.ty == 'DOMAIN') push(doms, x);
		else if (x.ty == 'SRC-IP-CIDR' && match(x.v, /\/32$/)) ips[replace(x.v, /\/32$/, '')] = x;
	}
	let chk = (key, ds) => {
		for (let d in ds) for (let x in doms) {
			let full = sp_dcov(d, x.v), part = !full && x.ty == 'DOMAIN-SUFFIX' && sp_dcov(x.v, d);
			if (full || part) { let e = ov[key]; if (!e || (full && e.part)) ov[key] = { t: x.t, v: x.v, part: !full }; }
		}
	};
	for (let d in o.site) if (o.site[d]) chk('site:' + d, [d]);
	for (let id in o.capp) if (o.capp[id]?.t) chk('capp:' + id, o.capp[id].doms ?? []);
	for (let a in sp_apps(o)) if (o.app[a[0]]) chk('app:' + a[0], a[2]);
	for (let mac in o.dev) { let ip = o.dev[mac]?.ip; if (ip && ips[ip]) ov['dev:' + mac] = { t: ips[ip].t, v: ip, part: false }; }
	return ov;
}
// 写规则；返回 { restart: 要不要重启插件 }
// 选了具体策略组的才让看门狗每分钟查（split.grp）
function sp_mark(o) {
	let any = false;
	// 设了任何分流都每分钟查一次：规则被整份覆盖了要补回（11/27 全面检查第 13 条），选的策略组 / 节点没了要改走主策略组
	for (let x in sp_each(o)) if (x[2]) any = true;
	if (length(o.fam)) any = true; // 家人新认领的设备、IP 变了，看门狗每分钟补上
	if (any) writefile(ETC + '/split.grp', '1'); else unlink(ETC + '/split.grp');
}
/* ---- 别的插件：写规则、备份、重启后检查（说明见上面「别的插件」那一段） ---- */
const SP_PXS = ETC + '/split_px.json', SP_BAK = ETC + '/split_bak';
let SP_SJ0 = null; // 这次改之前的 split.json（备份用：分流设置要跟插件设置一起退回）
function sp_pxs() { let o = cmcp_readj(SP_PXS, {}); return type(o) == 'object' ? o : {}; }
function sp_uci(cmds, cfg) {
	if (!length(cmds)) return;
	let U = conf().uci, r = sh(join(' && ', map(cmds, (c) => U + ' ' + c)) + ' && ' + U + ' commit ' + cfg);
	if (r.code != 0) die('保存失败：' + trim(r.err ?? r.out ?? ''));
}
// 要备份的文件：插件的 uci 配置，HomeProxy、SSR Plus+ 还有网址列表
function sp_bak_files(kind) {
	let l = [[ucdir() + '/' + kind, 'cfg']];
	if (kind == 'homeproxy') push(l, [SP_R + '/etc/homeproxy/resources/direct_list.txt', 'dl'], [SP_R + '/etc/homeproxy/resources/proxy_list.txt', 'pl']);
	if (kind == 'shadowsocksr') push(l, [SP_R + '/etc/ssrplus/white.list', 'wl'], [SP_R + '/etc/ssrplus/black.list', 'bl']);
	return l;
}
// 改插件设置前备份。还没重启的改动只备份一次：起不来时放回去的是最后一次能用的设置
// 同一次请求里只备份一次（split_prep 先改主节点再写规则：第二次备份会把改过的当成原来的）
let SP_BAKD = {};
function sp_bak(kind) {
	if (SP_BAKD[kind]) return;
	SP_BAKD[kind] = true;
	let b = SP_BAK + '/' + kind, sj = SP_SJ0 ?? readfile(SP_F), pend = false;
	try { pend = !!json(sj ?? '{}')?.pending; } catch (e) {}
	if (pend && stat(b + '/.ok')) return;
	mkdir(SP_BAK); mkdir(b);
	for (let f in [...sp_bak_files(kind), [SP_PXS, 'px']]) { let x = readfile(f[0]); if (x != null) writefile(b + '/' + f[1], x); else unlink(b + '/' + f[1]); }
	if (sj != null) writefile(b + '/split', sj); else unlink(b + '/split');
	writefile(b + '/.ok', '' + time());
}
// 重启插件。别的插件：重启前在跑、30 秒内没起来，就放回备份（插件设置和分流设置）再重启、推送
function sp_restart_cmd(kind) {
	if (kind == 'nikki') return '/etc/init.d/nikki restart';
	if (kind == 'openclash') return '/etc/init.d/openclash restart';
	let b = SP_BAK + '/' + kind, init = (getenv('CMCP_SP_INITD') ?? '/etc/init.d') + '/' + kind, px = SBIN + '/cmcp-proxy', nm = SP_PXN[kind] ?? kind, cp = [];
	for (let f in [...sp_bak_files(kind), [SP_PXS, 'px'], [SP_F, 'split']]) push(cp, sprintf('if [ -f %s ]; then cp %s %s; else rm -f %s; fi', shq(b + '/' + f[1]), shq(b + '/' + f[1]), shq(f[0]), shq(f[0])));
	return sprintf('was=0; %s running %s && was=1; %s restart >/dev/null 2>&1; ', px, kind, shq(init)) +
		sprintf('if [ $was = 1 ] && [ -f %s ]; then i=0; while [ $i -lt 30 ]; do sleep 1; i=$((i+1)); %s running %s && break; done; ', shq(b + '/.ok'), px, kind) +
		sprintf('if ! %s running %s; then %s; %s restart >/dev/null 2>&1; %s/cmcp-notify warn split %s %s split >/dev/null 2>&1; fi; fi; rm -rf %s',
			px, kind, join('; ', cp), shq(init), SBIN, shq(nm + ' 改完分流后没起来 已恢复原来的设置'), shq('重启后 30 秒内没有启动。插件设置和分流设置都退回到改之前，已经重新启动。'), shq(b));
}
// 列表里面板加的：只删自己加过、现在不要的；你原来就有的不动。返回 [新列表, 面板加的]
function sp_trk(mine, cur, want) {
	mine ??= [];
	let out = filter(cur, (x) => !(index(mine, x) >= 0 && index(want, x) < 0)), nm = [];
	for (let x in want) { if (index(out, x) < 0) { push(out, x); push(nm, x); } else if (index(mine, x) >= 0) push(nm, x); }
	return [out, nm];
}
// 网址列表文件：一行一个；保留原来的行（包括注释），删掉的去掉、新加的放最后
function sp_list_read(f) {
	let s = readfile(f), ls = s == null ? [] : split(replace(s, /\r/g, ''), '\n');
	if (length(ls) && ls[length(ls) - 1] == '') pop(ls);
	return ls;
}
const sp_list_cur = (ls) => filter(map(ls, (l) => trim(l)), (l) => length(l) && !match(l, /^#/));
// PassWall / PassWall 2：返回要不要重启
function sp_pw_id(st, t) { for (let s in st.nodes) if (s.protocol != '_shunt' && sp_lab(s, 'remarks') == t) return s['.name']; return null; }
function sp_pw_write(kind, rules) {
	let st = sp_pw(kind), sid = st.mid, grp = st.main?.shunt_group, want = [], i = 0;
	for (let g in rules) {
		let src = [], dom = [], ip = [];
		for (let l in g.lines) {
			let p = split(l, ','), v = join(',', slice(p, 1));
			if (p[0] == 'SRC-IP-CIDR') { if (match(v, /^\d+\.\d+\.\d+\.\d+\/32$/)) push(src, replace(v, /\/32$/, '')); }
			else if (p[0] == 'DOMAIN-SUFFIX') push(dom, 'domain:' + v);
			else if (p[0] == 'GEOIP') push(ip, 'geoip:' + lc(v));
		}
		if (!length(src) && !length(dom) && !length(ip)) continue;
		let to = g.to == 'DIRECT' ? '_direct' : g.to == 'PROXY' ? '_default' : sp_pw_id(st, g.to);
		if (to) push(want, { n: 'cmcp_sp_' + i++, src: join(' ', sort(src)), dom: join('\n', dom), ip: join('\n', ip), to });
	}
	let pxs = sp_pxs(), sig = sprintf('%J', [sid, grp, want]), mine = [], front = true, other = false;
	for (let s in st.secs) if (s['.type'] == 'shunt_rules') { if (match(s['.name'], /^cmcp_sp_/)) { push(mine, s['.name']); if (other) front = false; } else other = true; }
	let opts = filter(keys(st.main ?? {}), (k) => match(k, /^cmcp_sp_/));
	// 跟上次写的一样、段都在、排在最前面、分流节点里的去向对得上：不用改
	// 什么都没设过、也没有以前写的：不用动（也不用备份、不用重启）
	if (!length(want) && !length(mine) && !length(opts)) return false;
	let same = pxs[kind]?.sig == sig && front && join(',', mine) == join(',', map(want, (w) => w.n)) && length(opts) == length(want);
	for (let w in want) if (st.main?.[w.n] != w.to) same = false;
	if (same) return false;
	sp_bak(kind);
	let cmds = map(mine, (n) => 'delete ' + shq(kind + '.' + n));
	for (let k in opts) push(cmds, 'delete ' + shq(kind + '.' + sid + '.' + k));
	sp_uci(cmds, kind);
	cmds = [];
	for (let w in want) {
		let id = kind + '.' + w.n;
		push(cmds, 'set ' + shq(id + '=shunt_rules'), 'set ' + shq(id + '.remarks=' + w.n), 'set ' + shq(id + '.network=tcp,udp'));
		if (grp) push(cmds, 'set ' + shq(id + '.group=' + grp));
		if (length(w.src)) push(cmds, 'set ' + shq(id + '.source=' + w.src));
		if (length(w.dom)) push(cmds, 'set ' + shq(id + '.domain_list=' + w.dom));
		if (length(w.ip)) push(cmds, 'set ' + shq(id + '.ip_list=' + w.ip));
		push(cmds, 'set ' + shq(kind + '.' + sid + '.' + w.n + '=' + w.to));
	}
	// 分流规则变了 PassWall 要清一下它的 IP 集合（跟它自己的页面保存时一样）
	if (length(want) || length(mine)) push(cmds, 'set ' + shq(kind + '.@global[0].flush_set=1'));
	sp_uci(cmds, kind);
	// 挪到第一条分流规则的位置
	let secs = uci_load(kind) ?? [], at = -1;
	for (let j = 0; j < length(secs); j++) if (secs[j]['.type'] == 'shunt_rules' && !match(secs[j]['.name'], /^cmcp_sp_/)) { at = j; break; }
	if (at >= 0) sp_uci(map(want, (w, j) => 'reorder ' + shq(kind + '.' + w.n + '=' + (at + j))), kind);
	pxs[kind] = { sig }; cmcp_writej(SP_PXS, pxs);
	return true;
}
// HomeProxy「自定义路由」：返回要不要重启
function sp_hp_write(rules) {
	let h = sp_hp(), want = [], rn = {}, i = 0;
	let out_of = (t) => {
		if (t == 'DIRECT') return 'direct-out';
		if (t == 'PROXY') return h.by[h.dout]?.['.type'] == 'routing_node' ? h.dout : null;
		for (let r in h.rns) if (r.enabled == '1' && !match(r['.name'], /^cmcp_rn_/) && sp_lab(r, 'label') == t) return r['.name'];
		let nd = null;
		for (let s in h.nodes) if (sp_lab(s, 'label') == t) { nd = s['.name']; break; }
		if (!nd) return null;
		// 你建过指向这个节点的路由节点就用你的（HomeProxy 不让两个路由节点用同一个节点）
		for (let r in h.rns) if (r.enabled == '1' && r.node == nd && !match(r['.name'], /^cmcp_rn_/)) return r['.name'];
		let id = 'cmcp_rn_' + replace(nd, /[^A-Za-z0-9_]/g, '_');
		rn[id] = { node: nd, label: '分流 ' + t };
		return id;
	};
	for (let g in rules) {
		let src = [], dom = [];
		for (let l in g.lines) { let p = split(l, ','), v = join(',', slice(p, 1)); if (p[0] == 'SRC-IP-CIDR') push(src, v); else if (p[0] == 'DOMAIN-SUFFIX') push(dom, v); }
		if (!length(src) && !length(dom)) continue;
		let ob = out_of(g.to);
		if (ob) push(want, { n: 'cmcp_sp_' + i++, src: sort(src), dom, ob });
	}
	let pxs = sp_pxs(), sig = sprintf('%J', [want, rn]), mine = [], myrn = [], front = true, other = false;
	for (let s in h.rules) { if (match(s['.name'], /^cmcp_sp_/)) { push(mine, s['.name']); if (other) front = false; } else other = true; }
	for (let r in h.rns) if (match(r['.name'], /^cmcp_rn_/)) push(myrn, r['.name']);
	if (!length(want) && !length(mine) && !length(myrn)) return false;
	if (pxs.homeproxy?.sig == sig && front && join(',', mine) == join(',', map(want, (w) => w.n)) && join(',', sort(myrn)) == join(',', sort(keys(rn)))) return false;
	sp_bak('homeproxy');
	sp_uci(map([...mine, ...myrn], (n) => 'delete ' + shq('homeproxy.' + n)), 'homeproxy');
	let cmds = [];
	for (let id in rn) push(cmds, 'set ' + shq('homeproxy.' + id + '=routing_node'), 'set ' + shq('homeproxy.' + id + '.label=' + rn[id].label), 'set ' + shq('homeproxy.' + id + '.enabled=1'), 'set ' + shq('homeproxy.' + id + '.node=' + rn[id].node));
	for (let w in want) {
		let id = 'homeproxy.' + w.n;
		push(cmds, 'set ' + shq(id + '=routing_rule'), 'set ' + shq(id + '.label=' + w.n), 'set ' + shq(id + '.enabled=1'), 'set ' + shq(id + '.mode=default'), 'set ' + shq(id + '.action=route'), 'set ' + shq(id + '.outbound=' + w.ob));
		for (let d in w.dom) push(cmds, 'add_list ' + shq(id + '.domain_suffix=' + d));
		for (let x in w.src) push(cmds, 'add_list ' + shq(id + '.source_ip_cidr=' + x));
	}
	sp_uci(cmds, 'homeproxy');
	let secs = uci_load('homeproxy') ?? [], at = -1;
	for (let j = 0; j < length(secs); j++) if (secs[j]['.type'] == 'routing_rule' && !match(secs[j]['.name'], /^cmcp_sp_/)) { at = j; break; }
	if (at >= 0) sp_uci(map(want, (w, j) => 'reorder ' + shq('homeproxy.' + w.n + '=' + (at + j))), 'homeproxy');
	pxs.homeproxy = { sig }; cmcp_writej(SP_PXS, pxs);
	return true;
}
// 只有直连 / 代理（SSR Plus+、HomeProxy 别的路由模式）：设备、网址分成直连和代理两份，写进插件自己的列表。返回要不要重启
function sp_two_write(o, kind) {
	let dD = [], dP = [], wD = [], wP = [], ipm = sp_ipmap(), hp = kind == 'homeproxy';
	// 以前在别的插件里选的节点、策略组：算代理（看门狗会把它改成「代理」并推送）
	let dv = (mac, ip, t) => { let v = hp ? mac : (ipm[mac] || ip); if (!v) return; let l = t == 'DIRECT' ? dD : dP; if (index(dD, v) < 0 && index(dP, v) < 0) push(l, v); };
	for (let mac in o.dev) if (o.dev[mac]?.t) dv(mac, o.dev[mac].ip, o.dev[mac].t);
	if (length(o.fam)) { let own = own_load(); for (let mac in own) if (own[mac]?.ok && o.fam[own[mac].uid] && !o.dev[mac]) dv(mac, null, 'DIRECT'); }
	// 同一个网址在两边都设了：先设的那个算（网站、自己加的软件、软件，跟规则的顺序一样）
	let dm = (d, t) => { if (index(wD, d) < 0 && index(wP, d) < 0) push(t == 'DIRECT' ? wD : wP, d); };
	for (let d in o.site) if (o.site[d]) dm(d, o.site[d]);
	for (let id in o.capp) { let c = o.capp[id]; if (c?.t) for (let d in (c.doms ?? [])) dm(d, c.t); }
	for (let a in sp_apps(o)) if (o.app[a[0]]) for (let d in a[2]) dm(d, o.app[a[0]]);
	let pxs = sp_pxs(), pk = pxs[kind] ?? {}, cmds = [], files = [], cfg = kind, sec = null, lists = [];
	if (hp) {
		let h = sp_hp(), lp = h.ctl.lan_proxy_mode ?? 'disabled';
		sec = 'control';
		// 「只代理列出的设备」：没列出的本来就直连，代理的加进代理列表；别的模式：直连的加进直连列表（要改成「列出的不代理」，跟原来一样都走代理），代理的加进全局代理列表
		if (lp == 'listed_only') push(lists, ['lan_proxy_mac_addrs', dP]);
		else {
			push(lists, ['lan_direct_mac_addrs', dD], ['lan_global_proxy_mac_addrs', dP]);
			if (lp == 'disabled' && length(dD)) { pk.mode0 = 'disabled'; push(cmds, 'set ' + shq('homeproxy.control.lan_proxy_mode=except_listed')); }
			else if (!length(dD) && pk.mode0 && lp == 'except_listed') { push(cmds, 'set ' + shq('homeproxy.control.lan_proxy_mode=' + pk.mode0)); delete pk.mode0; }
		}
		push(files, ['dl', SP_R + '/etc/homeproxy/resources/direct_list.txt', wD], ['pl', SP_R + '/etc/homeproxy/resources/proxy_list.txt', wP]);
		for (let l in lists) l[2] = as_list(h.ctl[l[0]]);
	} else {
		let x = sp_ssr();
		if (!x.ac) die('读不到 SSR Plus+ 的访问控制设置');
		sec = x.ac['.name'];
		push(lists, ['lan_bp_ips', dD, as_list(x.ac.lan_bp_ips)], ['lan_fp_ips', dP, as_list(x.ac.lan_fp_ips)]);
		push(files, ['wl', SP_R + '/etc/ssrplus/white.list', wD], ['bl', SP_R + '/etc/ssrplus/black.list', wP]);
	}
	// 先算好要改什么，有改动再备份、写
	let fw = [];
	for (let l in lists) {
		let r = sp_trk(pk[l[0]], l[2], l[1]);
		pk[l[0]] = r[1];
		if (join(' ', r[0]) != join(' ', l[2])) { push(cmds, 'delete ' + shq(cfg + '.' + sec + '.' + l[0])); for (let v in r[0]) push(cmds, 'add_list ' + shq(cfg + '.' + sec + '.' + l[0] + '=' + v)); }
	}
	for (let f in files) {
		let ls = sp_list_read(f[1]), cur = sp_list_cur(ls), r = sp_trk(pk[f[0]], cur, f[2]);
		pk[f[0]] = r[1];
		let rm = filter(cur, (x) => index(r[0], x) < 0), add = filter(r[0], (x) => index(cur, x) < 0);
		if (length(rm) || length(add)) push(fw, [f[1], [...filter(ls, (l) => index(rm, trim(l)) < 0), ...add]]);
	}
	pxs[kind] = pk;
	if (!length(cmds) && !length(fw)) { cmcp_writej(SP_PXS, pxs); return false; }
	sp_bak(kind);
	if (length(cmds)) sp_uci(cmds, cfg);
	for (let f in fw) { writefile(f[0] + '.cmcp_tmp', join('\n', f[1]) + (length(f[1]) ? '\n' : '')); rename(f[0] + '.cmcp_tmp', f[0]); }
	cmcp_writej(SP_PXS, pxs);
	return true;
}
function sp_px_write(o, kind) {
	let cap = sp_cap(kind);
	if (cap.need) return false; // 主节点还不是分流类型：先不写，分流页上让你先换
	if (cap.two) return sp_two_write(o, kind);
	let rules = filter(sp_rules(o, 'PROXY'), (g) => (cap.geo || g.kind != 'g') && (cap.dev || g.kind != 'd'));
	return kind == 'homeproxy' ? sp_hp_write(rules) : sp_pw_write(kind, rules);
}
function sp_apply(o, kind) {
	sp_mark(o);
	if (!sp_clash(kind)) { let need = sp_px_write(o, kind); if (need) { o.pending = true; cmcp_writej(SP_F, o); } return { restart: need }; }
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
	let cap = sp_cap(kind);
	let groups = sp_groups(), live = groups != null, nodes = live ? sp_nodes() ?? [] : [];
	groups ??= sp_cfg_groups(kind) ?? [];
	let devs = [];
	try { devs = P.devices().devices ?? []; } catch (e) {}
	// 选的单个节点：现在通不通、挂了会换到哪个（跟特色功能「节点挂了自动换」一样给个预告；用 OpenClash / Nikki 记的最近一次延迟，不另外测）
	let pv = [], used = {};
	for (let x in sp_each(o)) if (index(o.nk ?? [], x[2]) >= 0) used[x[2]] = 1;
	if (live && sp_clash(kind)) {
		let dm = {}, nm = map(filter(nodes, (x) => !x.p), (x) => x.n);
		for (let x in nodes) dm[x.n] = x.d;
		for (let n in keys(used)) {
			let best = null;
			let sb = sp_sibs(n, nm);
			for (let tier in [sb.s, sb.r]) { for (let x in tier) if (dm[x] > 0 && (!best || dm[x] < dm[best])) best = x; if (best) break; }
			push(pv, { n, d: dm[n] ?? 0, sibs: length(sb.s) + length(sb.r), to: best, td: best ? dm[best] : 0, same: !!best && index(sb.s, best) >= 0 });
		}
	}
	let own = sp_own(kind);
	return {
		kind, pxn: SP_PXN[kind] ?? kind, cap, live, groups, main: sp_main(groups), pending: !!o.pending, moved: o.moved ?? [], nd: o.nd ?? {}, pv, swl: o.swl ?? [], own, ov: sp_conflicts(o, own),
		dev: o.dev, app: o.app, geo: o.geo, fam: o.fam, site: o.site, capp: o.capp, nodes,
		apps: map(sp_apps(o), (a) => ({ id: a[0], name: a[1], doms: a[2], ...(a[3] ? { tbl: true } : {}) })), av: trim(readfile(SP_TBL + '.v') ?? '') || null, geos: map(SP_GEO, (g) => ({ id: g[0], name: g[1] })),
		devices: map(filter(devs, (d) => d.mac), (d) => ({ mac: d.mac, name: d.name ?? d.hostname ?? '', ip: d.ip, online: !!d.online }))
	};
};
// 「交给分流管」（用户 11/28）：把覆写里你自己写的几条搬进分流——从原来的地方删掉（先备份），在分流里加上同样的去向。
// 带「# [名字]」的按名字合成一个软件；其他网址加成网站；SRC-IP-CIDR 认得出是哪台设备的加成设备。关键词、IP 段这些分流管不了，留着不动
P.split_own_move = function(a) {
	let kind = sp_kind();
	if (!sp_clash(kind)) die('只有 OpenClash 和 Nikki 能把覆写里的规则交给分流管');
	let want = type(a?.keys) == 'array' ? a.keys : [], own = sp_own(kind), o = sp_read(), moved = [], skip = [];
	let groups = sp_groups() ?? sp_cfg_groups(kind) ?? [], nodes = sp_nodes() ?? [], ipm = sp_ipmap(), mac_of = {};
	for (let m in ipm) mac_of[ipm[m]] = m;
	let tgt = (t) => {
		if (t == 'DIRECT') return 'DIRECT';
		if (index(groups, t) >= 0) return t;
		for (let n in nodes) if (n.n == t && !n.p) { o.nk ??= []; if (index(o.nk, t) < 0) push(o.nk, t); return t; }
		return null;
	};
	let apps = {};
	for (let x in own) {
		if (index(want, x.k) < 0) continue;
		let t = tgt(x.t), d = (x.ty == 'DOMAIN-SUFFIX' || x.ty == 'DOMAIN') ? sp_dom(x.v) : null;
		if (!t) { push(skip, x.v + '：去向「' + x.t + '」分流里选不了'); continue; }
		if (d && length(x.tag)) { let id = x.tag + '|' + t; apps[id] ??= { name: substr(x.tag, 0, 20), t, doms: [] }; if (index(apps[id].doms, d) < 0) push(apps[id].doms, d); push(moved, x); }
		else if (d) { o.site[d] = t; push(moved, x); }
		else if (x.ty == 'SRC-IP-CIDR' && match(x.v, /^\d+\.\d+\.\d+\.\d+\/32$/) && mac_of[replace(x.v, /\/32$/, '')]) {
			let ip = replace(x.v, /\/32$/, ''), mac = mac_of[ip];
			o.dev[mac] = { t, ip, name: '' }; push(moved, x);
		}
		else push(skip, x.v + '：' + x.ty + ' 这种写法分流管不了');
	}
	if (!length(moved)) die(length(skip) ? skip[0] : '没有能搬的规则');
	for (let id in apps) {
		let c = apps[id], hit = null;
		for (let k in o.capp) if (o.capp[k]?.name == c.name && o.capp[k]?.t == c.t) hit = k;
		if (hit) { for (let d in c.doms) if (index(o.capp[hit].doms, d) < 0) push(o.capp[hit].doms, d); }
		else { if (length(keys(o.capp)) >= 50) die('最多加 50 个软件'); o.capp['c' + rand_str(8)] = c; }
	}
	// 从原来的地方删掉：OpenClash 两个自定义规则文件按行号删（先备份），Nikki 删 uci 段
	for (let fx in [['f1', SP_CUSTOM], ['f2', SP_CUSTOM2]]) {
		let rm = {};
		for (let x in moved) if (x.src == fx[0]) rm[x.k] = 1;
		if (!length(keys(rm))) continue;
		let before = readfile(fx[1]);
		if (before == null) continue;
		if (!getenv('CMCP_SP_KIND')) oc_backup_file('custom', fx[1]);
		let ls = split(before, '\n'), out = [];
		for (let l in ls) { let r = index(l, '[cmcp-') < 0 ? sp_own_parse(l) : null; if (!(r && rm[fx[0] + ':' + r.ty + ',' + r.v + ',' + r.t])) push(out, l); }
		writefile(fx[1] + '.cmcp_tmp', join('\n', out)); rename(fx[1] + '.cmcp_tmp', fx[1]);
	}
	let del = map(filter(moved, (x) => x.src == 'nk'), (x) => 'delete ' + shq('nikki.' + substr(x.k, 3)));
	if (length(del)) { let U = conf().uci, r = sh(join(' && ', map(del, (c) => U + ' ' + c)) + ' && ' + U + ' commit nikki'); if (r.code != 0) die('保存失败：' + trim(r.err ?? r.out ?? '')); }
	cmcp_writej(SP_F, o);
	sp_apply(o, kind);
	o = sp_read(); o.pending = true; cmcp_writej(SP_F, o); // 覆写改了，要重启插件才生效
	let g = P.split_get();
	g.restart = true; g.movedN = length(moved); g.skip = skip;
	return g;
};
// a: { dev: { mac, ip, name, t } } / { app: { id, t } } / { geo: { id, t } }；t 为空 = 跟随全局（去掉）；DIRECT / PROXY / 策略组名
// 别的插件选「代理」但没有能走的节点时的说法
function sp_noproxy(kind) {
	if (kind == 'passwall' || kind == 'passwall2') return '分流节点的默认节点是直连：选一个具体节点，或者在 ' + SP_PXN[kind] + ' 里给分流节点选个默认节点';
	if (kind == 'homeproxy') return sp_hp().custom ? 'HomeProxy 的默认出站是直连：选一个具体节点' : 'HomeProxy 还没选主节点';
	if (kind == 'shadowsocksr') return 'SSR Plus+ 还没选服务器';
	return '找不到主策略组，先打开 ' + (kind == 'nikki' ? 'Nikki' : 'OpenClash');
}
P.split_set = function(a) {
	let kind = sp_kind();
	if (!kind) die('没有在用的代理插件');
	let cap = sp_cap(kind), nm = SP_PXN[kind] ?? kind;
	if (cap.need) die('先把 ' + nm + ' 的主节点换成分流节点');
	SP_SJ0 = readfile(SP_F);
	let o = sp_read(), x = a?.dev ?? a?.app ?? a?.geo ?? a?.site ?? a?.capp, t = x?.t ? '' + x.t : null;
	if ((a?.dev || a?.fam) && !cap.dev) die('这个版本的 ' + nm + ' 不能按设备分流：升级 ' + nm + ' 后再设');
	if (a?.geo && t && !cap.geo) die(nm + ' 不能按国家和地区分流');
	if (cap.two && t && t != 'DIRECT' && t != 'PROXY') die(split(cap.lim, '\n')[0]);
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
		if (index(g, t) < 0 && !length(filter(nd ?? [], (y) => y.n == t))) die(nd == null ? '要选节点，先打开 ' + (kind == 'nikki' ? 'Nikki' : 'OpenClash') : (sp_clash(kind) ? '没有这个策略组或节点：' : '没有这个节点：') + t);
		if (index(g, t) < 0 && length(filter(nd ?? [], (y) => y.n == t && y.p))) die('「' + t + '」在订阅合集里，规则不能直接写它：选它所在的策略组');
		if (index(g, t) < 0) { o.nk ??= []; if (index(o.nk, t) < 0) push(o.nk, t); o.nk = slice(o.nk, -100); }
	}
	if (t == 'PROXY' && !sp_main(sp_groups() ?? sp_cfg_groups(kind))) die(sp_noproxy(kind));
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
		let ok = false; for (let p in sp_apps0()) if (p[0] == x.id) ok = true;
		// 官网表里的软件（用户 11/28）：选的时候把名字和网址存下来；改回跟随全局就删掉
		if (!ok && t) {
			let tb = sp_tbl(true), hit = null;
			for (let p in (tb?.apps ?? [])) if (p[0] == x.id) hit = p;
			if (hit && hit[3] != 'sys') { o.appd[x.id] = { name: hit[1], doms: slice(hit[5], 0, 600) }; ok = true; }
			else if (o.appd[x.id]) ok = true;
		}
		if (!ok && !t && (o.app[x.id] || o.appd[x.id])) ok = true;
		if (!ok) die('没有这个软件');
		if (t) o.app[x.id] = t; else { delete o.app[x.id]; delete o.appd[x.id]; }
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
		if (!sp_kind()) die('没有在用的代理插件');
		let ip = trim('' + (a?.ip ?? '')), mac = lc(trim('' + (a?.mac ?? '')));
		if (length(ip) && !match(ip, /^\d+\.\d+\.\d+\.\d+$/)) ip = '';
		// 用户 11/28：按 MAC 认设备（IPv4、IPv6 都算）；老面板只带 IP，按 IP 找 MAC
		if (!match(mac, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) { mac = ''; if (ip) { let m = sp_ipmap(); for (let k in m) if (m[k] == ip) mac = k; } }
		if (!mac && !ip) die('这台设备现在没有 IP，等它连上网再识别');
		// 每次识别一个编号：上一次还在跑的发现编号变了就自己停（不会跟这次的混在一起）
		let rid = rand_str(10);
		// 用 OpenClash / Nikki 的读它们的日志；别的插件让 dnsmasq 记这几分钟的 DNS 查询（用户 11/28：开始和结束各重启一次 dnsmasq）
		cmcp_writej(SP_LEARN, { rid, ip, mac, name: substr('' + (a?.name ?? ''), 0, 40), at: time(), until: time() + SP_LEARN_SECS, hosts: {}, dips: {}, nohost: 0, run: true, mode: sp_clash(sp_kind()) ? 'clash' : 'dns' });
		sp_run(mac ? sprintf('%s/cmcp-splearn %s %d %s %s', SBIN, shq(mac), SP_LEARN_SECS, shq(rid), shq(ip)) : sprintf('%s/cmcp-splearn %s %d %s', SBIN, shq(ip), SP_LEARN_SECS, shq(rid)));
		return P.split_learn({ act: 'get' });
	}
	if (act == 'stop') { let o = cmcp_readj(SP_LEARN, null); if (type(o) == 'object') { o.run = false; o.until = time(); cmcp_writej(SP_LEARN, o); } }
	let o = cmcp_readj(SP_LEARN, null);
	if (type(o) != 'object') return { run: false };
	let hl = [], dl = [];
	for (let h in (type(o.hosts) == 'object' ? o.hosts : {})) push(hl, [h, +o.hosts[h] || 0]);
	hl = slice(sort(hl, (x, y) => y[1] - x[1]), 0, 400);
	for (let d in (type(o.dips) == 'object' ? o.dips : {})) push(dl, [d, +o.dips[d] || 0]);
	dl = slice(sort(dl, (x, y) => y[1] - x[1]), 0, 100);
	return { ip: o.ip, mac: o.mac ?? '', name: o.name ?? '', at: o.at, until: o.until, run: !!o.run && act != 'stop' && time() < (+o.until || 0) + 15, hosts: hl, dips: dl, nohost: +o.nohost || 0, err: o.err ?? null, mode: o.mode ?? 'clash' };
};
// 识别软件时为了记 DNS 查询改过的 dnsmasq 设置：识别程序意外停了没来得及放回（被杀掉、断电重启），看门狗每分钟在这里放回去，免得一直记
const SP_DNSON = getenv('CMCP_SPL_DNSON') || ETC + '/spl_dns.json';
function sp_learn_gc() {
	if (!stat(SP_DNSON)) return;
	let o = cmcp_readj(SP_LEARN, null);
	if (type(o) == 'object' && o.run && time() < (+o.until || 0) + 60) return;
	sp_run(SBIN + '/cmcp-splearn dnsoff');
}
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
	if (!kind) die('没有在用的代理插件');
	delete o.pending; cmcp_writej(SP_F, o);
	sp_run(sp_restart_cmd(kind));
	return { ok: true };
};
// PassWall / PassWall 2 主节点不是分流类型（用户 11/28：先问一次，点了才改，原来的设置备份）：新建分流节点 cmcp_shunt，默认走你现在的节点，换成主节点
P.split_prep = function() {
	let kind = sp_kind();
	if (kind != 'passwall' && kind != 'passwall2') die('不用换');
	let st = sp_pw(kind), nm = SP_PXN[kind];
	if (st.shunt) return P.split_get();
	if (!st.main) die(nm + ' 还没选节点：先在它的原版页面里选好节点');
	// 分流节点用 Xray 还是 sing-box：跟你现在的节点一样，不是这两种就看装了哪个
	let ty = st.main.type;
	if (ty != 'Xray' && ty != 'sing-box') ty = stat(SP_R + '/usr/bin/xray') ? 'Xray' : stat(SP_R + '/usr/bin/sing-box') ? 'sing-box' : null;
	if (!ty) die('分流节点要用 Xray 或 sing-box：先在 ' + nm + ' 里装一个');
	SP_SJ0 = readfile(SP_F);
	sp_bak(kind);
	let id = kind + '.cmcp_shunt';
	sp_uci(['set ' + shq(id + '=nodes'), 'set ' + shq(id + '.remarks=分流（路由器面板）'), 'set ' + shq(id + '.type=' + ty), 'set ' + shq(id + '.protocol=_shunt'),
		'set ' + shq(id + '.default_node=' + st.mid), 'set ' + shq(id + '.domainStrategy=IPOnDemand'), 'set ' + shq(kind + '.@global[0].' + st.opt + '=cmcp_shunt')], kind);
	let o = sp_read();
	o.pending = true; cmcp_writej(SP_F, o);
	sp_apply(o, kind);
	let g = P.split_get();
	g.restart = true;
	return g;
};
// 看门狗每分钟调一次：选的策略组没了（订阅更新后），改走主策略组、推送、重启插件
// OpenClash：自定义规则里分流那一段没了（AI 整份覆盖、还原备份、原版后台里改了）：按现在的设置补回去。
// 返回 'gone'（整段都没了，补回）、'old'（还在，只是组数跟新版本的写法对不上：补丁加了事先占好的组。11/28 用户路由器装 V8 后被误报成「被改掉了」，现在悄悄补齐）、false（没动）
function sp_keep() {
	if (sp_kind() != 'openclash') return false;
	let o = sp_read(), s = readfile(SP_CUSTOM);
	if (s == null || !length(sp_each(o)) && !length(o.fam)) return false;
	let rules = sp_rules(o, sp_main(sp_groups() ?? sp_cfg_groups('openclash')));
	let have = length(filter(split(s, '\n'), (l) => match(l, /^- RULE-SET,cmcp_sp_/) && index(l, SP_MARK) >= 0));
	if (!length(rules) || have == length(rules)) return false;
	return sp_oc_write(rules) ? (have ? 'old' : 'gone') : false;
}
// AI 整份覆盖 / 还原自定义规则时顺手补上（它本来就要重启 OpenClash，不用多重启一次）
push(RULES_KEEP, (p) => p == SP_CUSTOM && sp_keep() ? '分流' : null);
// 节点通不通（谷歌、Cloudflare 两个网址任何一个通就算通，跟节点自动换一样）。测试用 CMCP_SP_DELAY（{ 节点: 延迟 }）
function sp_delay(n) {
	let f = getenv('CMCP_SP_DELAY');
	if (f) return +(cmcp_readj(f, {})[n] ?? 0);
	for (let u in ['https://www.gstatic.com/generate_204', 'http://cp.cloudflare.com/generate_204']) {
		let d = 0; try { d = +(api('GET', '/proxies/' + urlenc(n) + '/delay?timeout=3000&url=' + urlenc(u), null, 8)?.delay ?? 0); } catch (e) {}
		if (d > 0) return d;
	}
	return 0;
}
// 挑一个通的：同名的里有通的就挑延迟最低的，没有再看同地区的；excl 是刚试过不通的
function sp_pick(sb, excl) {
	for (let tier in [sb?.s ?? [], sb?.r ?? []]) {
		let best = null, bd = 0;
		for (let x in tier) { if (x == excl) continue; let d = sp_delay(x); if (d > 0 && (!best || d < bd)) { best = x; bd = d; } }
		if (best) return best;
	}
	return null;
}
// 分流里选的单个节点（11/27 全面检查第 14 条；用户 11/28 改：先同名、再同地区，同地区都挂了不换）：连续 3 分钟不通，换到同名里通的那个，没有再换同地区的，并推送；
// 换过去的那个也不通了再换一个；同地区的都不通就先不换，有通的再换过去。原节点恢复后连续正常 10 分钟换回去。
// 记在 split.json 的 nd（节点 → { at: 什么时候挪走的, to: 换到哪个，null = 没有能换的 }）、sib（节点 → 同名节点）；每分钟的计数放内存盘 /tmp/cmcp_spnode.json
const SP_NS = '/tmp/cmcp_spnode.json';
function sp_node_watch(o, kind, want, names) {
	let nodes = filter(want, (t) => index(o.nk ?? [], t) >= 0 && index(names, t) >= 0);
	o.nd ??= {}; o.sib ??= {};
	let st = cmcp_readj(getenv('CMCP_SP_NS') ?? SP_NS, {}), now = time(), ev = [], keep = {}, chg = false;
	for (let n in keys(o.nd)) if (index(nodes, n) < 0) { delete o.nd[n]; chg = true; }   // 不再选这个节点了（改了设置、节点没了）
	for (let n in keys(o.nd)) if (type(o.nd[n]) != 'object') { o.nd[n] = { at: +o.nd[n] || now, to: null }; chg = true; } // 6.0 V8 以前记的是「改走主策略组」
	// 同名节点跟着订阅变：变了要重写规则（OpenClash 先占好它们的组）
	for (let n in keys(o.sib)) if (index(nodes, n) < 0) { delete o.sib[n]; chg = true; }
	// 候选只要节点，不要策略组
	let gs = sp_groups() ?? [], pvn = sp_prov_nodes(), nm = filter(names, (x) => index(gs, x) < 0 && !pvn[x]); // 订阅合集里的节点不能写进规则，不当候选
	for (let n in nodes) { let sb = sp_sibs(n, nm); if (sprintf('%J', sb) != sprintf('%J', o.sib[n] ?? [])) { o.sib[n] = sb; chg = true; } }
	if (!length(nodes) && !length(keys(st)) && !chg) return;
	for (let n in nodes) {
		let x = st[n] ?? { f: 0, ok: 0 }, d = sp_delay(n), cur = o.nd[n];
		if (cur) {
			if (d > 0) { if (!x.ok) x.ok = now; if (now - x.ok >= 600) { let was = cur.to; delete o.nd[n]; push(ev, ['back', n, was]); x = { f: 0, ok: 0 }; } }
			else {
				x.ok = 0;
				// 换过去的也不通了，或者之前没有能换的：再挑一个
				if (!cur.to || sp_delay(cur.to) <= 0) { let pk = sp_pick(o.sib[n], cur.to); if (pk != cur.to) { let old = cur.to; cur.to = pk; push(ev, [pk ? 'to' : 'none', n, pk, old]); } }
			}
		} else if (d > 0) x.f = 0;
		else if (++x.f >= 3) { let pk = sp_pick(o.sib[n], null); o.nd[n] = { at: now, to: pk }; push(ev, [pk ? 'to' : 'none', n, pk, null]); x = { f: 0, ok: 0 }; }
		keep[n] = x;
	}
	cmcp_writej(getenv('CMCP_SP_NS') ?? SP_NS, keep);
	cmcp_writej(SP_F, o);
	// 规则要变的：去向变了（换到同名节点、换回来、从「先不换」换到能用的），或者同名节点变了
	let moved = length(filter(ev, (e) => e[0] != 'none' || e[3]));
	if (!moved && !chg) return;
	// OpenClash 只换规则集内容（同名节点的组事先占好了）；第一次用（还没占好）或者 Nikki 要重启插件，节点已经不通了，重启比一直不通好
	let r = sp_apply(o, kind);
	// 之前写好了还没重启（pending：比如补丁换了写法、事先占好的组还没加载）也要重启，不然挪过去的条目在跑着的配置里没有对应的组
	if ((r.restart || sp_read().pending) && moved) { sp_run(kind == 'nikki' ? '/etc/init.d/nikki restart' : '/etc/init.d/openclash restart'); let z = sp_read(); delete z.pending; cmcp_writej(SP_F, z); }
	let msg = (l, a, b) => { try { sh(sprintf('%s/cmcp-notify %s split %s %s split >/dev/null 2>&1', SBIN, a, shq(b), shq(l))); } catch (e) {} };
	// 最近切换（最多 10 条，跟特色功能的「最近切换」一样）：换到同名节点、换回原节点
	let z = sp_read();
	z.swl ??= [];
	for (let e in ev) if (e[0] == 'to') unshift(z.swl, { at: now, a: e[3] || e[1], b: e[2] }); else if (e[0] == 'back') unshift(z.swl, { at: now, a: e[2] || '', b: e[1] });
	z.swl = slice(z.swl, 0, 10);
	cmcp_writej(SP_F, z);
	for (let e in ev) {
		if (e[0] == 'to') msg('选「' + e[1] + '」的设备、网站和软件先走「' + e[2] + '」，「' + e[1] + '」恢复 10 分钟后自动换回。', 'warn', '分流：节点「' + e[1] + '」连不上，已换到「' + e[2] + '」');
		else if (e[0] == 'none') msg(length(sp_sib_all(o.sib[e[1]])) ? '同地区的节点也都连不上，先不换。有能用的会自动换过去。' : '没有同地区的节点，先不换。', 'warn', '分流：节点「' + e[1] + '」连不上');
		else if (e[0] == 'back') msg('选它的设备、网站和软件已经换回这个节点。', 'ok', '分流：节点「' + e[1] + '」恢复了');
	}
}
// 手机的随机 MAC 换了（11/28 适配）：设了分流的设备不在线，又来了一台用同一个名字、随机 MAC（第二位是 2 6 A E）、没设分流的设备——多半是同一台换了地址，推送提醒去给它也设上。
// 不自动搬（家里好几台都叫 iPhone 的会搬错）。同一个新地址 7 天只推一次；测试用 CMCP_SP_MACW
function sp_mac_watch(o) {
	if (!length(o.dev ?? {})) return;
	let wf = getenv('CMCP_SP_MACW') || '/tmp/cmcp_spmac.json', w = cmcp_readj(wf, {}), now = time(), wch = false, och = false, lm = {};
	if (type(w) != 'object') w = {};
	try { lm = lease_map(); } catch (e) {}
	let byMac = {};
	for (let ip in lm) if (lm[ip]?.mac) byMac[lm[ip].mac] = lm[ip];
	for (let mac in o.dev) {
		let host = lc(trim('' + (byMac[mac]?.orig ?? o.dev[mac]?.host ?? '')));
		if (byMac[mac] && length(host)) { if (o.dev[mac].host != byMac[mac].orig) { o.dev[mac].host = byMac[mac].orig; och = true; } }
		if (!length(host) || host == '*' || byMac[mac]) continue;
		for (let nm in byMac) {
			let x = byMac[nm];
			if (nm == mac || o.dev[nm] || w[nm] || lc(x.orig ?? '') != host || !match(nm, /^.[26ae]/)) continue;
			w[nm] = now; wch = true;
			try { sh(sprintf('%s/cmcp-notify warn split %s %s %s >/dev/null 2>&1', SBIN, shq('「' + (o.dev[mac].name || x.orig) + '」可能换了 MAC 地址'), shq('有一台新设备（' + nm + '）用的名字也是「' + x.orig + '」，分流管不到它。在「分流 → 设备」里给它也设上。'), shq('spmac-' + nm))); } catch (e) {}
		}
	}
	for (let k in keys(w)) if (now - w[k] > 7 * 86400) { delete w[k]; wch = true; }
	if (wch) cmcp_writej(wf, w);
	if (och) { let z = sp_read(); for (let m in o.dev) if (z.dev[m] && o.dev[m].host) z.dev[m].host = o.dev[m].host; cmcp_writej(SP_F, z); }
}
P.split_check = function() {
	sp_learn_gc();
	let kind = sp_kind(), o = sp_read();
	if (!kind) return { ok: true };
	if (!sp_clash(kind) && sp_cap(kind).need) return { ok: true }; // PassWall 主节点还不是分流类型：分流没写进去，不用查
	// Nikki：「不走代理」名单跟它的访问控制对不上（还原了备份、原版页面里删了）就补上（48-nikki.uc 的 nk_black_sync，对得上什么也不做）
	if (kind == 'nikki') for (let f in BL_HOOK) try { f(false); } catch (e) {}
	// 每分钟看一次：自定义规则被原版后台或别的东西整份改掉了，「不走代理」「分流」那几段补回去；要重启 OpenClash 才生效，标「还没生效」并推送（不自动重启）
	if (kind == 'openclash') {
		let fixed = [];
		if (SP_CUSTOM == BL_CUSTOM && bl_keep()) push(fixed, '不走代理');
		let k = sp_keep();
		if (k == 'gone') push(fixed, '分流');
		// 只是写法换新了：标「还没生效」，不推送「被改掉了」
		if (k == 'old') { o = sp_read(); o.pending = true; cmcp_writej(SP_F, o); }
		if (length(fixed)) {
			o = sp_read(); o.pending = true; cmcp_writej(SP_F, o);
			try { sh(sprintf('%s/cmcp-notify warn split %s %s split >/dev/null 2>&1', SBIN, shq('「' + join('」「', fixed) + '」的规则被改掉了，已补回'), shq('OpenClash 的自定义规则被整份改过，面板加的那几行没了。重启 OpenClash 后生效：在「分流」里点「现在重启」。'))); } catch (e) {}
		}
		// 6.0 V9 以前分流那段放在你自己写的规则前面：跟你写的撞了才挪到后面（你写的优先，用户 11/28），标「还没生效」并推送，不自动重启
		o = sp_read();
		if (sp_oc_order_bad() && length(keys(sp_conflicts(o, sp_own(kind))))) {
			sp_apply(o, kind);
			try { sh(sprintf('%s/cmcp-notify info split %s %s split >/dev/null 2>&1', SBIN, shq('分流：改成覆写里你自己写的优先'), shq('分流跟你在覆写里写的规则撞了的，按你写的走。重启 OpenClash 后生效：在「分流」里点「现在重启」。'))); } catch (e) {}
		}
	}
	// Nikki：你后来加的规则排到了面板的后面、又跟分流撞了：面板的挪到最后（你写的优先），要重启 Nikki 才生效，标「还没生效」并推送
	if (kind == 'nikki') {
		let seenMine = false, bad = false;
		for (let x in (uci_load('nikki') ?? [])) if (x['.type'] == 'rule') { if (match(x['.name'], /^cmcp_sp_/)) seenMine = true; else if (seenMine) bad = true; }
		o = sp_read();
		if (bad && length(keys(sp_conflicts(o, sp_own(kind))))) {
			sp_apply(o, kind);
			try { sh(sprintf('%s/cmcp-notify info split %s %s split >/dev/null 2>&1', SBIN, shq('分流：改成你自己写的规则优先'), shq('分流跟你在 Nikki 里写的规则撞了的，按你写的走。重启 Nikki 后生效：在「分流」里点「现在重启」。'))); } catch (e) {}
		}
	}
	let want = [];
	for (let x in sp_each(o)) { let t = x[2]; if (t && t != 'DIRECT' && t != 'PROXY' && index(want, t) < 0) push(want, t); }
	if (length(o.fam) || (kind != 'nikki' && length(o.dev))) {
		// 家人的设备变了（新认领、IP 变了）、设了分流的设备 IPv6 地址变了：OpenClash 只换规则集内容；Nikki 要重启，留给用户点
		// 别的插件：设备的 IP 变了要重写、重启插件才生效，也留给用户点（标「还没生效」）
		sp_apply(o, kind);
		o = sp_read();
	}
	sp_mac_watch(o);
	if (!length(want)) { if (length(keys(o.nd ?? {}))) { o.nd = {}; cmcp_writej(SP_F, o); } return { ok: true }; }
	// 插件在跑时看策略组和节点；没在跑时只能从配置文件里看策略组（节点是订阅里的，读不到就先不动）
	let names = sp_names(), live = names != null;
	if (!live) names = sp_cfg_groups(kind);
	if (names == null) return { ok: true };
	if (live && sp_clash(kind)) sp_node_watch(o, kind, want, names);
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
	let why = sp_clash(kind) ? '订阅更新后找不到了，选它的设备、网站和软件已改走主策略组。' : sp_cap(kind).two ? SP_PXN[kind] + ' 现在只能选直连或代理，选它的设备、网站和软件已改走代理。' : '订阅更新后找不到了，选它的设备、网站和软件已改走代理。';
	try { sh(sprintf('%s/cmcp-notify warn split %s %s split >/dev/null 2>&1', SBIN, shq(sp_clash(kind) ? '分流：' + what + '「' + join('」「', gone) + '」没了' : sp_cap(kind).two ? '分流：「' + join('」「', gone) + '」现在选不了' : '分流：节点「' + join('」「', gone) + '」没了'), shq(why))); } catch (e) {}
	sp_run(sp_restart_cmd(kind));
	return { ok: true, moved: gone };
};

// 远程开关（remote.json 的 off：页面名列表）：出了问题的功能先关掉，等热补丁修好再开。大家都能读（view 组）
P.remote_flags = function() {
	let off = cmcp_readj(ETC + '/remote.json', null)?.off;
	return { off: type(off) == 'array' ? filter(map(slice(off, 0, 50), (x) => '' + x), (x) => match(x, /^[a-z0-9_]{1,20}$/)) : [] };
};

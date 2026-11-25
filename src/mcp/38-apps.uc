
/* ---------------- 6.0 第 83 项：应用管理 ----------------
 * 列出装了哪些插件和软件、什么时候装的（按安装时间排，最近装的在前面，方便找出「装了以后路由器不稳」的那个），一键卸载。
 * 安装时间：opkg 的 status 里有 Installed-Time；apk 用 /lib/apk/packages/<包>.list 的修改时间，没有的话面板第一次看到时记下（apps_seen.json）。
 * 不让卸：固件自带的（在只读分区里，删不掉也省不了空间）、系统要用的（卸了可能断网或进不了后台）、面板自己要用的（风险 13）。
 * 测试用环境变量：CMCP_APPS_ROOT（文件路径前缀）、CMCP_APPS_PM（opkg / apk）、CMCP_APPS_RUN（卸载命令只记下来不真跑） */
const APP_ROOT = getenv('CMCP_APPS_ROOT') || '', APP_SEEN = ETC + '/apps_seen.json';
const APP_CORE = /^(base-files|busybox|kernel|kmod-.*|libc|libgcc.*|libatomic.*|libstdcpp.*|musl|procd.*|ubus|ubusd|ubox|uci|netifd|firewall4?|nftables.*|iptables.*|ip6tables.*|dnsmasq.*|odhcpd.*|odhcp6c|dropbear|openssh-server|opkg|apk-.*|luci|luci-base|luci-compat|luci-lua-runtime|luci-light|luci-lib-.*|luci-mod-.*|luci-ssl.*|luci-proto-.*|luci-theme-bootstrap|rpcd.*|uhttpd.*|ucode.*|libucode.*|jsonfilter|jshn|ca-bundle|ca-certificates|curl|libcurl.*|openssl-util|libopenssl.*|libmbedtls.*|libwolfssl.*|libustream.*|wget.*|mtd|fstools|fwtool|logd|urandom-seed|urngd|libubox.*|libuci.*|libjson-c.*|libblobmsg-json.*|wpad.*|hostapd.*|iw|iw-full|iwinfo|libiwinfo.*|mac80211.*|wireless-regdb|swconfig|ip-full|ip-tiny|ppp|ppp-mod-.*|zlib|libpthread|librt|libnl.*|libnftnl.*|libmnl.*)$/;
// 卸了会影响上网的：确认框里说清楚
const APP_NET = /^(luci-app-)?(openclash|passwall2?|ssr-plus|vssr|bypass|homeproxy|nikki|mihomo|sing-box|xray.*|v2ray.*|shadowsocks.*|mwan3|adguardhome|smartdns|mosdns|wireguard.*|zerotier|tailscale|ddns.*|upnp|miniupnpd.*|sqm.*|turboacc|fullconenat.*)$/;
const APP_NAME = { openclash: 'OpenClash', passwall: 'PassWall', passwall2: 'PassWall 2', 'ssr-plus': 'SSR Plus+', homeproxy: 'HomeProxy', nikki: 'Nikki', adguardhome: 'AdGuard Home', ddns: '动态 DNS', upnp: 'UPnP', wol: '网络唤醒', ttyd: '网页终端', samba4: '网络共享（Samba）', dockerman: 'Docker', docker: 'Docker', oaf: '应用过滤', appfilter: '应用过滤', store: 'iStore 应用商店', nlbwmon: '流量统计（原版）', statistics: '统计图表', smartdns: 'SmartDNS', mosdns: 'MosDNS', zerotier: 'ZeroTier', frpc: 'frp 客户端', 'argon-config': 'Argon 主题设置', diskman: '磁盘管理', mwan3: '多线多拨（mwan3）', sqm: '智能队列（SQM）', turboacc: 'Turbo ACC 加速', firewall: '防火墙', 'package-manager': '软件包管理', wireguard: 'WireGuard', tailscale: 'Tailscale', cpufreq: 'CPU 频率', autoreboot: '定时重启', filetransfer: '文件传输', linkease: '易有云', fastnet: 'FastNet', vlmcsd: 'KMS 激活', unblockmusic: '解锁网易云音乐', accesscontrol: '上网时间控制' };
function app_pm() {
	let f = getenv('CMCP_APPS_PM');
	if (f == 'opkg' || f == 'apk') return f;
	if (length(trim(sh('command -v apk').out))) return 'apk';
	if (length(trim(sh('command -v opkg').out))) return 'opkg';
	return null;
}
function app_title(n) {
	let m = match(n, /^luci-(app|theme)-(.+)$/);
	if (!m) return n;
	if (m[1] == 'theme') return '主题：' + m[2];
	return APP_NAME[m[2]] ?? m[2];
}
// 读 opkg 的 status / apk 的 installed：每个包一段，空行分开
function app_blocks(f) { return filter(split(readfile(APP_ROOT + f) ?? '', /\n\n+/), (b) => length(trim(b))); }
function app_kv(b, sep) {
	let o = {}, last = null;
	for (let l in split(b, '\n')) {
		if (sep == ':' && match(l, /^ /) && last) { o[last] += '\n' + trim(l); continue; }
		let i = index(l, sep);
		if (i <= 0) continue;
		last = substr(l, 0, i); o[last] = trim(substr(l, i + 1));
	}
	return o;
}
function app_dep_names(s) { let o = []; for (let d in split(s ?? '', /[, ]+/)) { d = replace(d, /[<>=~].*$/, ''); if (match(d, /^[A-Za-z0-9_.+-]+$/) && !match(d, /^so:|^cmd:|^pc:/)) push(o, d); } return o; }
function app_scan() {
	let pm = app_pm();
	if (!pm) die('没有 opkg 或 apk');
	let L = [], now = time();
	if (pm == 'opkg') {
		for (let b in app_blocks('/usr/lib/opkg/status')) {
			let k = app_kv(b, ':'), n = k.Package;
			if (!n || !match(k.Status ?? '', /installed/)) continue;
			let c = app_kv(readfile(APP_ROOT + '/usr/lib/opkg/info/' + n + '.control') ?? '', ':');
			push(L, { name: n, ver: k.Version ?? c.Version ?? '', at: +k['Installed-Time'] || null, size: +(c['Installed-Size'] ?? k['Installed-Size'] ?? 0) || 0,
				desc: split(c.Description ?? k.Description ?? '', '\n')[0], deps: app_dep_names(k.Depends ?? c.Depends),
				auto: (k['Auto-Installed'] ?? '') == 'yes', rom: !!stat(APP_ROOT + '/rom/usr/lib/opkg/info/' + n + '.control') });
		}
	} else {
		let world = {}, rw = {};
		for (let w in split(readfile(APP_ROOT + '/etc/apk/world') ?? '', /\s+/)) if (length(w)) world[replace(w, /[<>=~].*$/, '')] = 1;
		for (let w in split(readfile(APP_ROOT + '/rom/etc/apk/world') ?? '', /\s+/)) if (length(w)) rw[replace(w, /[<>=~].*$/, '')] = 1;
		let seen = cmcp_readj(APP_SEEN, null), fresh = type(seen) != 'object', ch = false;
		if (fresh) seen = { _init: now };
		for (let b in app_blocks('/lib/apk/db/installed')) {
			let k = app_kv(b, ':'), n = k.P;
			if (!n) continue;
			let st = stat(APP_ROOT + '/lib/apk/packages/' + n + '.list'), at = st?.mtime ?? null;
			if (!at) { if (!seen[n]) { seen[n] = fresh ? -1 : now; ch = true; } at = seen[n] > 0 ? seen[n] : null; }
			push(L, { name: n, ver: k.V ?? '', at, size: +(k.I ?? 0) || 0, desc: k.T ?? '', deps: app_dep_names(k.D),
				auto: !world[n], rom: !!stat(APP_ROOT + '/rom/lib/apk/packages/' + n + '.list') || (!!rw[n] && !st) });
		}
		if (ch || fresh) cmcp_writej(APP_SEEN, seen);
	}
	// 谁要用它（装着的包里，Depends 写了它的）
	let need = {};
	for (let x in L) for (let d in x.deps) { need[d] ??= []; push(need[d], x.name); }
	for (let x in L) { x.users = need[x.name] ?? []; delete x.deps; }
	return { pm, list: L };
}
// 能不能卸：不能的话说原因
function app_protect(n, x) {
	if (match(n, APP_CORE)) return '系统组件';
	if (n == 'cloudflared' && !stat(ETC + '/local') && (stat(ETC + '/tunnel_token') || stat(ETC + '/hub.conf'))) return '面板远程访问要用';
	if (x?.rom) return '固件自带';
	return null;
}
P.app_list = function() {
	let r = app_scan(), wk = time() - 7 * 86400;
	for (let x in r.list) {
		x.title = app_title(x.name);
		x.plugin = !!match(x.name, /^luci-(app|theme)-/);
		x.no = app_protect(x.name, x);
		x.recent = !x.rom && !!x.at && x.at >= wk;
		x.net = !!match(x.name, APP_NET);
	}
	r.list = sort(r.list, (a, b) => (b.at ?? 0) - (a.at ?? 0) || (a.name < b.name ? -1 : 1));
	let m = match(sh('df -k /overlay 2>/dev/null | awk \'NR==2 { print $4 }\'').out, /(\d+)/);
	r.free = m ? +m[1] : null;
	return r;
};
// 卸载（只有主账号）：opkg 顺便卸掉只为它装的依赖；卸完清原版后台的菜单缓存
P.app_remove = function(a) {
	if (ROLE == 'sub') die('只有主账号能卸载');
	if (a?.confirm != 'REMOVE') die('需要确认');
	let n = '' + (a?.name ?? '');
	if (!match(n, /^[A-Za-z0-9_.+-]{1,80}$/)) die('包名不对');
	let r = app_scan(), x = null;
	for (let y in r.list) if (y.name == n) x = y;
	if (!x) die('没有装「' + n + '」');
	let no = app_protect(n, x);
	if (no) die('「' + app_title(n) + '」不能卸：' + no);
	let us = filter(x.users, (u) => u != n);
	if (length(us)) die('被' + join('、', map(slice(us, 0, 5), app_title)) + (length(us) > 5 ? ' 等 ' + length(us) + ' 个' : '') + '使用，先卸它们');
	let f0 = match(sh('df -k /overlay 2>/dev/null | awk \'NR==2 { print $4 }\'').out, /(\d+)/);
	let cmd = r.pm == 'apk' ? 'apk del ' + shq(n) : 'opkg remove --autoremove ' + shq(n);
	let o;
	if (getenv('CMCP_APPS_RUN')) { writefile(getenv('CMCP_APPS_RUN'), cmd + '\n'); o = { code: +(getenv('CMCP_APPS_RC') ?? 0), out: getenv('CMCP_APPS_OUT') ?? '' }; }
	else o = sh(cmd + ' 2>&1');
	if (o.code != 0) die('卸载没成功：' + substr(trim(o.out ?? ''), -300));
	sh('rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache 2>/dev/null; logger -t claude-mcp ' + shq('面板里卸载了 ' + n));
	let f1 = match(sh('df -k /overlay 2>/dev/null | awk \'NR==2 { print $4 }\'').out, /(\d+)/);
	return { ok: true, name: n, title: app_title(n), freed: f0 && f1 ? max(0, +f1[1] - +f0[1]) : null };
};
// AI 工具卸载软件也用同一套规则
const APP_PK0 = T.packages;
T.packages = function(a) {
	if ((a?.action ?? '') == 'remove' && length(a?.name ?? '')) {
		let r = app_scan(), x = null;
		for (let y in r.list) if (y.name == a.name) x = y;
		let no = app_protect(a.name, x);
		if (no) die('不能卸载 ' + a.name + '：' + no);
	}
	return APP_PK0(a);
};

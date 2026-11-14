// 换用另一个代理插件：先停掉、关掉正在用的（两个同时开会打架），再打开、启动选的那个。后台做，断网十几秒
const PX_EN = { openclash: 'openclash.config.enable', nikki: 'nikki.config.enabled', passwall: 'passwall.@global[0].enabled', passwall2: 'passwall2.@global[0].enabled' };
P.px_switch = function(a) {
	px_check(a?.id);
	let id = a.id, j = px_detect(true), cmds = [];
	if (id == 'passwall' || id == 'passwall2') { let v = uci_get(id + '.@global[0].' + (id == 'passwall' ? 'tcp_node' : 'node')); if (!v || v == 'nil') die(px_name(id) + ' 还没选节点：先在它的原版页面里添加并选好节点，再来切换'); }
	if (id == 'homeproxy') { let v = uci_get('homeproxy.config.main_node'); if (!v || v == 'nil') die('HomeProxy 还没选节点：先在它的原版页面里选一个主节点，再来切换'); }
	if (id == 'shadowsocksr') { let v = uci_get('shadowsocksr.@global[0].global_server'); if (!v || v == 'nil') die('SSR Plus+ 还没选节点：先在它的原版页面里选一个服务器，再来切换'); }
	for (let x in j.list ?? []) {
		if (x.id == id || !(x.running || x.enabled)) continue;
		if (PX_EN[x.id]) push(cmds, sprintf('uci set %s=0; uci commit %s', PX_EN[x.id], split(PX_EN[x.id], '.')[0]));
		push(cmds, sprintf('/etc/init.d/%s stop; /etc/init.d/%s disable', x.id, x.id));
	}
	if (PX_EN[id]) push(cmds, sprintf('uci set %s=1; uci commit %s', PX_EN[id], split(PX_EN[id], '.')[0]));
	push(cmds, sprintf('/etc/init.d/%s enable; /etc/init.d/%s restart', id, id));
	push(cmds, '/usr/sbin/cmcp-tunbypass apply');
	sh('( sleep 1; ' + join('; ', cmds) + '; rm -f /tmp/cmcp_px.json ) >/tmp/cmcp_pxswitch.log 2>&1 </dev/null &');
	sh('rm -f /tmp/cmcp_px.json');
	return { ok: true, name: px_name(id) };
};
// 测节点延迟：TCP 连到节点的地址和端口要多久（不经过代理，只看节点服务器通不通、远不远）
P.px_delay = function(a) {
	px_check(a?.id);
	let n = px_nodes(a.id);
	if (!n) die('这个插件不能在这里测速');
	let want = type(a.nodes) == 'array' ? a.nodes : null, cmd = '', k = 0;
	for (let x in n.list) {
		if (want && !(x.id in want)) continue;
		if (!match(x.addr, /^[A-Za-z0-9.:_\[\]-]+$/) || !match('' + x.port, /^[0-9]+$/) || k >= 40) continue;
		k++;
		cmd += sprintf('( t=$(curl -s -o /dev/null -m 3 --connect-timeout 2 -w "%%{time_connect}" %s </dev/null); echo %s "$t" ) & ', shq('telnet://' + x.addr + ':' + x.port), shq(x.id));
	}
	if (!k) return { list: {} };
	let out = sh(cmd + 'wait').out, r = {};
	for (let l in split(out, '\n')) {
		let m = match(trim(l), /^(\S+) ([0-9.]+)$/);
		if (m) r[m[1]] = +m[2] > 0 ? int(+m[2] * 1000 + 0.5) : 0;
	}
	return { list: r };
};

/* ---------- 自动处理的开关：内存不够时自动重启代理插件、隧道直连 Cloudflare ---------- */
const AUTO_KEYS = ['tunrestart', 'panelrestart', 'cacheclean', 'route', 'daily', 'newdev', 'cloudbackup'];
P.auto = function(a) {
	let D = '/etc/claude-mcp', px = px_detect(), oc = length(px.list ?? []) > 0, mg = D + '/memguard.off';
	if (a?.set) {
		if (a.memguard != null) {
			if (a.memguard) sh('rm -f ' + mg);
			else writefile(mg, sprintf('%d 面板关闭\n', time()));
		}
		if (a.tunbypass != null && oc) {
			let r = sh('/usr/sbin/cmcp-tunbypass ' + (a.tunbypass ? 'on' : 'off 面板关闭'));
			if (r.code != 0) die('设置失败：' + trim(r.out));
		}
		// 其他自动任务：关掉 = 放一个 off.名字 文件，打开 = 删掉它
		for (let k in AUTO_KEYS) if (a[k] != null) {
			if (a[k]) sh('rm -f ' + D + '/off.' + k);
			else writefile(D + '/off.' + k, sprintf('%d 面板关闭\n', time()));
		}
		if (a.autosw != null) { let f = D + '/autosw.json', c = cmcp_readj(f, { enabled: true, group: 'Zou' }); c.enabled = !!a.autosw; cmcp_writej(f, c); }
	}
	let st = oc ? trim(sh('/usr/sbin/cmcp-tunbypass status').out) : '', off = trim(readfile(D + '/tunbypass.off') ?? '');
	let act = null; for (let x in px.list ?? []) if (x.id == px.active) act = x;
	let on = {}; for (let k in AUTO_KEYS) on[k] = !stat(D + '/off.' + k);
	return {
		oc, px: act?.name ?? '', memguard: !stat(mg),
		tb: { on: st == '已开启', want: oc && !stat(D + '/tunbypass.off'), auto: !!match(off, /^自动/), at: +(split(off, ' ')[1] ?? 0) || 0, status: st },
		on, autosw: act?.kind == 'clash' ? !!cmcp_readj(D + '/autosw.json', { enabled: true }).enabled : null,
		// 哪些用得上：云端备份要完整版或托管版；面板线路自动选择要 OpenClash
		cloud: !!stat(D + '/cloud.conf'), route: !!stat('/etc/init.d/openclash'),
	};
};

/* ---------- 面板：内嵌 Kwrt 原版页面 / 系统日志 / 进程 ---------- */
P.luci_key = function() {
	return { key: trim(readfile('/etc/claude-mcp/luci_key') ?? '') };
};
P.slog = function(a) {
	let n = +a.lines || 300;
	if (n > 1000) n = 1000;
	let cmd = a.kind == 'kern' ? 'dmesg' : 'logread';
	if (length(a.filter ?? '')) cmd += ' | grep -i -- ' + shq(a.filter);
	cmd += ' | tail -n ' + n;
	return { text: sh(cmd).out };
};
P.procs = function() {
	let r = sh("top -bn1 | awk 'NR>4 && $1 ~ /^[0-9]+$/ {c=$7; sub(/%/,\"\",c); print $1\"\\t\"c}'; echo ===; " +
		"for d in /proc/[0-9]*; do p=${d#/proc/}; [ -r $d/status ] || continue; " +
		"awk -v p=$p '/^Name:/{n=$2} /^State:/{s=$2} /^VmRSS:/{m=$2} /^PPid:/{pp=$2} END{print p\"\\t\"pp\"\\t\"s\"\\t\"(m+0)\"\\t\"n}' $d/status 2>/dev/null; " +
		"printf '%s\\t' $p; tr '\\0' ' ' < $d/cmdline 2>/dev/null | cut -c1-300; echo; done").out;
	let parts = split(r, '===\n'), cpu = {}, info = {}, cmd = {};
	for (let l in split(parts[0] ?? '', '\n')) { let f = split(l, '\t'); if (length(f) == 2) cpu[f[0]] = +f[1]; }
	for (let l in split(parts[1] ?? '', '\n')) {
		let f = split(l, '\t');
		if (length(f) == 5) info[f[0]] = f;
		else if (length(f) == 2 && info[f[0]]) cmd[f[0]] = f[1];
	}
	let me = {}, keep = trim(sh("pidof uhttpd cloudflared procd rpcd ubusd netifd").out);
	for (let x in split(keep, ' ')) if (length(x)) me[x] = true;
	let list = [];
	for (let pid in info) {
		let f = info[pid], c = trim(cmd[pid] ?? '');
		c = replace(c, /(--token|--secret|-secret|password[= ])\s*\S+/g, '$1 ***');
		push(list, { pid: +pid, ppid: +f[1], st: f[2], mem: +f[3], name: f[4], cmd: length(c) ? c : '[' + f[4] + ']', cpu: cpu[pid] ?? 0, sys: !!me[pid] || +pid < 3 });
	}
	let mi = readfile('/proc/meminfo') ?? '', m = match(mi, /MemTotal:\s+(\d+)/), av = match(mi, /MemAvailable:\s+(\d+)/);
	return { list, total: m ? +m[1] : 0, avail: av ? +av[1] : 0 };
};
P.kill = function(a) {
	let pid = +a.pid;
	if (!(pid > 2)) die('不能结束这个进程');
	let name = trim(readfile('/proc/' + pid + '/comm') ?? '');
	if (!length(name)) die('进程已经不在了');
	if (name in ['procd', 'ubusd', 'rpcd', 'netifd', 'uhttpd', 'cloudflared', 'dropbear', 'init'])
		die('「' + name + '」是系统或面板自己要用的进程，结束它会断网或让面板失联，已拦下');
	let r = sh('kill ' + (a.force ? '-9 ' : '') + pid);
	if (r.code != 0) die(trim(r.out) || '结束失败');
	return { ok: true, name };
};

P.black_state = function() {
	let l = bl_load(), devs = P.devices().devices;
	return {
		entries: l, devices: devs,
		ready: bl_custom_ready(), live: bl_live(),
		custom_on: uci_get('openclash.config.enable_custom_clash_rules') == '1',
		lan_ac_mode: uci_get('openclash.config.lan_ac_mode') ?? '0',
	};
};

/* 第一次使用：把规则集写进「优先匹配」自定义规则，需要重启 OpenClash 一次 */
P.black_setup = function(a) {
	bl_write_ruleset(bl_load());
	let s = readfile(BL_CUSTOM) ?? 'rules:\n';
	if (index(s, BL_MARK) < 0) {
		if (!match(s, /(^|\n)rules:[ \t]*(\n|$)/)) die('自定义规则文件里找不到「rules:」行，没有修改');
		oc_backup_file('custom', BL_CUSTOM);
		let entry = sprintf('  %s: %s 由路由器面板「拉黑名单」管理，请勿修改\n    type: file\n    behavior: classical\n    path: ./rule_provider/cmcp_blacklist.yaml\n', BL_PROVIDER, BL_MARK);
		s = replace(s, /(^|\n)rules:[ \t]*\n/, (m, p1) => p1 + 'rules:\n' + sprintf('- RULE-SET,%s,DIRECT %s\n', BL_PROVIDER, BL_MARK));
		if (match(s, /(^|\n)rule-providers:[ \t]*\n/)) s = replace(s, /(^|\n)rule-providers:[ \t]*\n/, (m, p1) => p1 + 'rule-providers:\n' + entry);
		else s = 'rule-providers:\n' + entry + s;
		writefile(BL_CUSTOM + '.cmcp_tmp', s);
		rename(BL_CUSTOM + '.cmcp_tmp', BL_CUSTOM);
	}
	let c = ucur();
	if (c.get('openclash', 'config', 'enable_custom_clash_rules') != '1') { c.set('openclash', 'config', 'enable_custom_clash_rules', '1'); c.commit('openclash'); }
	if (a.restart) restart_openclash_bg();
	return { ok: true, restarting: !!a.restart };
};

P.black_set = function(a) {
	let mac = a.mac ? bl_mac(a.mac) : null, l = bl_load();
	if (!mac && !match(a.ip ?? '', /^\d+\.\d+\.\d+\.\d+$/)) die('缺少 MAC 或 IP');
	let key = mac ?? ('ip:' + a.ip), i = -1;
	const kof = (x) => x.mac ?? ('ip:' + x.ip);
	for (let k = 0; k < length(l); k++) if (kof(l[k]) == key) i = k;
	if (a.on) {
		if (i >= 0) return { ok: true, already: true };
		let p = mac ? bl_pin(mac, a.ip, a.name) : { ip: a.ip, created: false };
		push(l, { mac, ip: p.ip, name: a.name ?? null, pinned: p.created, at: time() });
		bl_save(l); bl_write_ruleset(l);
		let live = bl_apply(p.ip);
		return { ok: true, ip: p.ip, pinned: p.created, live, need_setup: !bl_custom_ready() || !live };
	}
	if (i < 0) return { ok: true };
	let e = l[i];
	l = filter(l, (x) => kof(x) != key);
	bl_save(l); bl_write_ruleset(l);
	if (e.pinned && mac && !a.keep_ip) bl_unpin(mac);
	let live = bl_apply(e.ip);
	return { ok: true, live };
};
/* ---------------- 工具定义 ---------------- */

function S(props, req) { return { type: 'object', properties: props ?? {}, required: req ?? [] }; }
const str = (d) => ({ type: 'string', description: d });
const int = (d) => ({ type: 'integer', description: d });
const bool = (d) => ({ type: 'boolean', description: d });
const RO = { readOnlyHint: true, openWorldHint: false };
const RW = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DX = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

const TOOLS = [
	{ name: 'router_status', title: '路由器状态', annotations: RO,
	  description: '查看 OpenClash/Clash 内核运行状态、版本、代理模式、连接数、当前配置文件、自定义规则开关、区域绕过和 OAF 是否运行。排查问题时先调用它。',
	  inputSchema: S() },
	{ name: 'list_proxy_groups', title: '查看策略组/节点', annotations: RO,
	  description: '不带参数：列出所有策略组及当前选择。带 group：列出该组全部节点、类型和最近一次延迟（▶ 为当前选中）。节点名含国旗 emoji 和空格，修改规则或切换时必须使用这里返回的准确名称。',
	  inputSchema: S({ group: str('策略组名，如 Zou'), filter: str('只显示名称包含该关键字的节点，如 日本') }) },
	{ name: 'test_delay', title: '测速', annotations: RO,
	  description: '测试单个节点或整个策略组的延迟。name 是策略组时会并发测试组内全部节点并按延迟排序。',
	  inputSchema: S({ name: str('节点名或策略组名'), url: str('测速地址，默认 https://www.gstatic.com/generate_204'), timeout: int('超时毫秒，默认 5000') }, ['name']) },
	{ name: 'switch_proxy', title: '切换节点', annotations: RW,
	  description: '把 Selector 类型策略组切换到指定节点（立即生效，不重启）。',
	  inputSchema: S({ group: str('策略组名'), node: str('节点名（准确名称）'), close_connections: bool('切换后断开现有连接，让 App 立刻走新节点') }, ['group', 'node']) },
	{ name: 'set_mode', title: '切换代理模式', annotations: RW,
	  description: '临时切换 Clash 代理模式：rule（规则）/ global（全局）/ direct（直连）。',
	  inputSchema: S({ mode: { type: 'string', enum: ['rule', 'global', 'direct'] } }, ['mode']) },
	{ name: 'list_connections', title: '查看连接', annotations: RO,
	  description: '查看当前活跃连接：域名、命中的规则、代理链、流量、来源设备 IP。filter 可按域名/规则/节点/IP 过滤，例如 douyin、DIRECT、台湾。',
	  inputSchema: S({ filter: str('过滤关键字'), limit: int('最多显示条数，默认 50') }) },
	{ name: 'close_connections', title: '断开连接', annotations: DX,
	  description: '断开指定 id 的连接；不传 id 则断开全部（等同「关闭链接」），App 会重新连接并应用新规则。',
	  inputSchema: S({ id: str('连接 id（来自 list_connections）') }) },
	{ name: 'list_rules', title: '查看生效规则', annotations: RO,
	  description: '查看 Clash 当前实际生效的规则（含自定义规则），可按关键字过滤。用于确认自定义规则是否被加载、指向哪个节点。',
	  inputSchema: S({ filter: str('过滤关键字'), limit: int('默认 60'), offset: int('分页起点') }) },
	{ name: 'get_logs', title: '实时日志', annotations: RO,
	  description: '采集 Clash 内核几秒钟的实时日志（连接走向、报错）。可让用户同时操作 App 再调用。',
	  inputSchema: S({ level: { type: 'string', enum: ['debug', 'info', 'warning', 'error'] }, seconds: int('采集秒数 1-15，默认 3'), filter: str('过滤关键字') }) },
	{ name: 'get_custom_rules', title: '读取自定义规则', annotations: RO,
	  description: '读取 OpenClash「覆写设置 → 规则设置」里的自定义规则文件。file=1 为上面的「优先匹配」框（默认），file=2 为下面的「候补匹配」框。修改前先读取。',
	  inputSchema: S({ file: { type: 'integer', enum: [1, 2] }, hide_comments: bool('隐藏 # 注释行') }) },
	{ name: 'set_custom_rules', title: '保存自定义规则', annotations: DX,
	  description: '用 content 覆盖整个自定义规则文件（先用 get_custom_rules 读取，在原内容基础上修改，保留 rules: 行和注释），自动备份、校验格式和节点名，然后后台重启 OpenClash 使其生效。重启期间网络会断 10–30 秒，包括这次对话。',
	  inputSchema: S({ content: str('完整文件内容'), file: { type: 'integer', enum: [1, 2] }, apply: bool('保存后重启生效，默认 true'), enable: bool('同时打开自定义规则开关，默认 true'), force: bool('跳过格式和节点名校验') }, ['content']) },
	{ name: 'restore_custom_rules', title: '还原自定义规则', annotations: DX,
	  description: '把自定义规则还原为上一次保存前的备份（.bak）并重启生效。',
	  inputSchema: S({ file: { type: 'integer', enum: [1, 2] }, apply: bool('默认 true') }) },
	{ name: 'restart_openclash', title: '重启 OpenClash', annotations: DX,
	  description: '后台重启 OpenClash（网络会中断 10–30 秒）。',
	  inputSchema: S() },
	{ name: 'openclash_log', title: 'OpenClash 日志', annotations: RO,
	  description: '查看 OpenClash 插件日志（启动过程、配置报错、规则被跳过的原因等）。',
	  inputSchema: S({ lines: int('末尾行数，默认 60'), filter: str('过滤关键字') }) },
	{ name: 'oaf_show', title: 'OAF 配置', annotations: RO,
	  description: '查看 OAF 应用过滤的全部 uci 配置（appfilter）以及在线设备信息。修改前先查看现有结构。',
	  inputSchema: S() },
	{ name: 'oaf_find_app', title: 'OAF 查找应用', annotations: RO,
	  description: '在 OAF 特征库中按名称查找应用 ID，例如 抖音、TikTok、王者。',
	  inputSchema: S({ keyword: str('应用名关键字') }, ['keyword']) },
	{ name: 'oaf_uci', title: '修改 OAF 配置', annotations: DX,
	  description: '修改 OAF（appfilter）的 uci 配置并重启 OAF。只允许 appfilter.* 的键。每个操作：{op: set|add_list|del_list|delete|add, key: "appfilter.节.选项", value}。先用 oaf_show 了解现有配置结构再改。',
	  inputSchema: S({
		operations: { type: 'array', items: S({ op: { type: 'string', enum: ['set', 'add_list', 'del_list', 'delete', 'add'] }, key: str('如 appfilter.global.enable'), value: str('值') }, ['op']) },
		commit: bool('默认 true'), restart: bool('提交后重启 OAF，默认 true')
	  }, ['operations']) },

	{ name: 'system_info', title: '系统信息', annotations: RO,
	  description: '路由器型号、固件版本、运行时间、CPU 负载、内存、温度、存储占用。',
	  inputSchema: S() },
	{ name: 'net_speed', title: '实时网速', annotations: RO,
	  description: '采样几秒，显示各网络接口的实时上下行速率和累计流量。',
	  inputSchema: S({ seconds: int('采样秒数 1-10，默认 2'), interface: str('只看某个接口，如 pppoe-wan、br-lan') }) },
	{ name: 'device_list', title: '设备列表', annotations: RO,
	  description: '连接到路由器的设备：IP、MAC、主机名、是否在线。结合 list_connections 的来源 IP 可以知道哪台设备在用什么。',
	  inputSchema: S() },
	{ name: 'network_info', title: '网络信息', annotations: RO,
	  description: 'WAN/WAN6 拨号状态、公网 IP、网关、DNS、各接口地址和默认路由。',
	  inputSchema: S() },
	{ name: 'list_services', title: '服务列表', annotations: RO,
	  description: '列出路由器上所有服务（/etc/init.d）、是否开机自启、是否在运行。',
	  inputSchema: S() },
	{ name: 'service_control', title: '控制服务', annotations: DX,
	  description: '对服务执行 restart / start / stop / reload / enable / disable，例如重启 AdGuardHome、dnsmasq、network。网络类服务在后台执行，会短暂断网。',
	  inputSchema: S({ name: str('服务名（来自 list_services）'), action: { type: 'string', enum: ['restart', 'start', 'stop', 'reload', 'enable', 'disable'] } }, ['name', 'action']) },
	{ name: 'reboot_router', title: '重启路由器', annotations: DX,
	  description: '重启整个路由器（全家断网约 1–3 分钟，之后自动恢复）。必须先征得用户同意，并传 confirm=true。',
	  inputSchema: S({ confirm: bool('用户已确认重启') }, ['confirm']) },
	{ name: 'firewall_overview', title: '防火墙与端口转发', annotations: RO,
	  description: '查看防火墙区域、端口转发、通信规则，每条后面附有 uci 路径，修改时配合 uci_set 使用。',
	  inputSchema: S() },
	{ name: 'uci_show', title: '读取配置', annotations: RO,
	  description: '读取任意 uci 配置。不带参数列出全部配置文件；config=network / wireless / dhcp / firewall / system 等查看完整内容；可加 key 只看某节或某项（如 key=lan 或 key=@wifi-iface[0]）。',
	  inputSchema: S({ config: str('配置名'), key: str('节或选项（可省略配置名前缀）') }) },
	{ name: 'uci_set', title: '修改配置', annotations: DX,
	  description: '修改任意 uci 配置：Wi-Fi 名称密码、DHCP 静态分配、端口转发、DNS 等。修改前自动备份，任一步失败自动撤销。reload 指定后才生效。警告：改错 network / firewall 可能导致整个路由器断网，届时我无法远程修复，只能由用户在本地处理——这类修改必须先向用户说明风险并确认。先用 uci_show 看清现有结构再改。',
	  inputSchema: S({
		operations: { type: 'array', items: S({
			op: { type: 'string', enum: ['set', 'add_list', 'del_list', 'delete', 'rename', 'add'] },
			key: str('如 wireless.@wifi-iface[0].ssid、dhcp.@host[-1].ip'),
			config: str('op=add 时的配置名，如 firewall'),
			value: str('值；op=add 时为节类型，如 redirect / host')
		}, ['op']) },
		commit: bool('默认 true；false 只暂存'),
		reload: { type: 'string', enum: ['network', 'firewall', 'dhcp', 'wireless', 'system'] }
	  }, ['operations']) },
	{ name: 'uci_revert', title: '放弃未提交修改', annotations: RW,
	  description: '放弃某个配置中暂存但未提交的修改。',
	  inputSchema: S({ config: str('配置名') }, ['config']) },
	{ name: 'uci_backups', title: '配置备份', annotations: DX,
	  description: '列出 uci_set 自动生成的配置备份；传 restore=<备份名> 还原（之后需 reload 对应服务）。',
	  inputSchema: S({ restore: str('要还原的备份名，如 network.20261027-235000') }) },
	{ name: 'system_log', title: '系统日志', annotations: RO,
	  description: '查看系统日志（logread），可按关键字过滤，例如 pppoe、dnsmasq、kernel、AdGuard。',
	  inputSchema: S({ lines: int('行数，默认 80'), filter: str('过滤关键字') }) },
	{ name: 'packages', title: '软件包', annotations: DX,
	  description: '管理软件包：list（已安装，可用 name 过滤）/ search / upgradable / install / remove。安装和卸载前要征得用户同意。',
	  inputSchema: S({ action: { type: 'string', enum: ['list', 'search', 'upgradable', 'install', 'remove'] }, name: str('包名或关键字') }) },
	{ name: 'run_command', title: '执行命令', annotations: DX,
	  description: '以 root 身份在路由器上执行 shell 命令（最长 110 秒）。其他工具做不到时再用。执行会修改系统的命令前，先告诉用户要做什么。不要执行会切断网络或停止 claude-mcp / cloudflared 的命令。',
	  inputSchema: S({ command: str('shell 命令'), timeout: int('超时秒数，默认 30') }, ['command']) },
];

/* ---------------- MCP / JSON-RPC ---------------- */


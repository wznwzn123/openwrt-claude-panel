/* 6.0 第 11 项：AI 能做什么（只给 AI 连接器用，手机面板不受影响）
   - 只读（ro）：只能查看；命令行只能跑「只看」的命令
   - 危险操作要确认（ask，默认，新装和升级都是这一档）：查看、换节点、换模式、断开连接照常；重启、改设置、装卸软件、改规则、
     其他命令要先推送到手机，主账号（或有「完全控制」的家人）在面板里点「允许」才执行。连接器地址泄露了，别人也做不了这些
   - 完全放开（full）：跟 6.0 以前一样
   设置在 config.json 的 ai_mode；在面板「我的主页 → 敏感信息 → AI 连接器地址」里改（要先确认本人）
   等确认的请求记在内存里（/tmp/cmcp_ai_ask.json，重启就没了）：5 分钟内有效、批准一次只能执行一次、参数要完全一样 */
const AI_ASK = '/tmp/cmcp_ai_ask.json';
const AI_TTL = 300, AI_LOCK = '/tmp/cmcp_ai_wait';
const AI_WAIT = +(getenv('CMCP_AI_WAIT') ?? '') || 30; // 测试用的环境变量（网页请求改不了 CGI 的环境变量）
let AI_STOP = false; // 这次不是出错，是在等确认 / 被挡下（回给 AI 的话前面不加「出错：」）
const AI_READ = { router_status: 1, list_proxy_groups: 1, test_delay: 1, list_connections: 1, list_rules: 1, get_logs: 1, get_custom_rules: 1, openclash_log: 1,
	oaf_show: 1, oaf_find_app: 1, system_info: 1, net_speed: 1, device_list: 1, network_info: 1, list_services: 1, firewall_overview: 1, uci_show: 1, system_log: 1 };
// 日常操作：随时能改回来、不断网
const AI_LIGHT = { switch_proxy: 1, set_mode: 1, close_connections: 1, uci_revert: 1 };
const AI_NAMES = { reboot_router: '重启路由器', service_control: '控制服务', uci_set: '修改路由器设置', uci_backups: '还原设置备份', set_custom_rules: '改 OpenClash 自定义规则',
	restore_custom_rules: '还原 OpenClash 自定义规则', restart_openclash: '重启 OpenClash', oaf_uci: '改应用过滤设置', packages: '安装或卸载软件', run_command: '执行命令' };
const AI_MODES = { ro: '只读', ask: '危险操作要确认', full: '完全放开' };

function ai_mode() { let m = conf().ai_mode; return m == 'ro' || m == 'full' ? m : 'ask'; }

/* 「只看」的命令：每一段（可以用 | 连起来）都是下面这些命令，而且不带写入、执行别的东西的参数；
   不能有 ; & ` $ > < 换行（没法接别的命令、没法写文件）。认不出来的一律当成要确认 */
const RO_CMD = { cat: 1, ls: 1, head: 1, tail: 1, grep: 1, egrep: 1, fgrep: 1, wc: 1, df: 1, du: 1, free: 1, uptime: 1, uname: 1, ps: 1, logread: 1,
	ifstatus: 1, ping: 1, ping6: 1, traceroute: 1, traceroute6: 1, nslookup: 1, which: 1, id: 1, whoami: 1, stat: 1, md5sum: 1, sha256sum: 1, cut: 1, tr: 1,
	echo: 1, printf: 1, pwd: 1, netstat: 1, ss: 1, lsmod: 1, iwinfo: 1, nproc: 1, readlink: 1, basename: 1, dirname: 1, file: 1, lsblk: 1, blkid: 1, mount: 1,
	sort: 1, uniq: 1, date: 1, hostname: 1, dmesg: 1, top: 1, ip: 1, uci: 1, iptables: 1, ip6tables: 1, nft: 1, opkg: 1, apk: 1, ubus: 1, wifi: 1 };
function ro_segment(seg) {
	let w = filter(map(split(trim(seg), /[ \t]+/), (x) => replace(x, /['"\\]/g, '')), (x) => length(x));
	if (!length(w)) return false;
	let c = replace(w[0], /^\/(usr\/)?s?bin\//, ''), a = slice(w, 1);
	if (!RO_CMD[c]) return false;
	let opt = filter(a, (x) => substr(x, 0, 1) == '-'), pos = filter(a, (x) => substr(x, 0, 1) != '-');
	let has = (re) => length(filter(a, (x) => match(x, re))) > 0;
	switch (c) {
	case 'sort': return !has(/^-o|^--output/);
	case 'uniq': return length(pos) <= 1;
	case 'date': return !length(filter(a, (x) => !match(x, /^(\+.*|-u|-R|-I.*|--utc|--rfc.*|--iso.*)$/)));
	case 'hostname': return !length(pos) && !has(/^-F|^--file/);
	case 'dmesg': return !has(/^-[a-zA-Z]*[cCnD]|^--clear|^--console/);
	case 'top': return has(/^-b/);
	case 'mount': return !length(a);
	case 'ip': return !has(/^-ba|^-b$|^-force/) && !length(filter(pos, (x) => match(x, /^(add|del|delete|set|flush|change|replace|append|prepend|save|restore|exec|up|down|attach|detach|monitor)$/)));
	case 'iptables': case 'ip6tables':
		return has(/^(-L|-S|--list|-nL|-nvL|-vnL|-vL|-xnvL|-nvxL|--list-rules)/) && !has(/^(-[ADIFXNPRZE]|--(append|delete|insert|flush|delete-chain|new-chain|policy|replace|zero|rename-chain))/);
	case 'nft': return length(pos) > 0 && pos[0] == 'list' && !has(/^(-f|--file|-i|--interactive)/);
	case 'uci': return length(pos) > 0 && index(['show', 'get', 'export', 'changes'], pos[0]) >= 0 && !has(/^-f/);
	case 'opkg': return length(pos) > 0 && index(['list', 'list-installed', 'list-upgradable', 'info', 'status', 'find', 'files', 'whatdepends', 'print-architecture'], pos[0]) >= 0;
	case 'apk': return length(pos) > 0 && index(['info', 'list', 'search', 'version', 'policy'], pos[0]) >= 0;
	case 'ubus': return length(pos) > 0 && (pos[0] == 'list' || (pos[0] == 'call' && length(pos) >= 3 && match(pos[2], /^(status|info|board|dump)$/)));
	case 'wifi': return length(pos) == 1 && pos[0] == 'status';
	}
	return true;
}
function ro_command(cmd) {
	cmd = '' + (cmd ?? '');
	if (!length(trim(cmd)) || length(cmd) > 2000 || match(cmd, /[;&`$<>\n\r(){}]/)) return false;
	for (let s in split(cmd, '|')) if (!ro_segment(s)) return false;
	return true;
}
// 这一步是哪一类：read（只看）/ light（日常）/ danger（要确认）
function ai_class(name, a) {
	if (AI_READ[name]) return 'read';
	if (AI_LIGHT[name]) return 'light';
	if (name == 'packages') return index(['install', 'remove'], a?.action ?? 'list') >= 0 ? 'danger' : 'read';
	if (name == 'uci_backups') return a?.restore ? 'danger' : 'read';
	if (name == 'run_command') return ro_command(a?.command) ? 'read' : 'danger';
	return 'danger';
}
// 手机上要看清楚 AI 想做什么（设置里的密码类值打码）
function ai_detail(name, a) {
	let cut = (s, n) => (length(s) > n ? substr(s, 0, n) + '…' : s);
	switch (name) {
	case 'run_command': return cut('' + (a?.command ?? ''), 400);
	case 'service_control': return (a?.name ?? '') + ' ' + (a?.action ?? '');
	case 'packages': return (a?.action == 'remove' ? '卸载 ' : '安装 ') + (a?.name ?? '');
	case 'uci_backups': return '还原成 ' + (a?.restore ?? '');
	case 'uci_set': case 'oaf_uci': {
		let l = map(type(a?.operations) == 'array' ? slice(a.operations, 0, 12) : [], (o) => {
			let k = o?.op == 'add' ? (o?.config ?? '') : (o?.key ?? ''), v = '' + (o?.value ?? '');
			return (o?.op ?? '') + ' ' + k + (length(v) ? '=' + (match(k, /(key|pass|secret|token|psk)/i) ? '******' : cut(v, 60)) : '');
		});
		if (type(a?.operations) == 'array' && length(a.operations) > 12) push(l, '…还有 ' + (length(a.operations) - 12) + ' 条');
		if (a?.reload) push(l, '然后重新加载 ' + a.reload);
		return join('\n', l);
	}
	case 'set_custom_rules': return '改 ' + (a?.which == 2 ? '第二份' : '') + '自定义规则（' + length(split('' + (a?.content ?? ''), '\n')) + ' 行）' + (a?.restart === false ? '' : '，然后重启 OpenClash');
	case 'reboot_router': return '整个网络会断 1–3 分钟';
	case 'restart_openclash': return '网络会断 10–30 秒';
	}
	return '';
}
/* 永久允许（用户 11/27）：确认卡上点「永久允许」，以后这一类操作不再问。存在 config.json 的 ai_allow（最多 50 条），
   「我的主页 → 敏感信息 → AI 连接器地址」里能看到、收回（要先确认本人，只有主账号）。「只读」照样全挡。
   「这一类」：执行命令 = 一模一样的这条命令；控制服务 = 这个服务的这个动作；装卸软件 = 装或卸这个包；改设置 = 改这几份配置；其他 = 这个动作 */
// 「这一类都允许」（用户 11/27：原来只放过一模一样的那条，换条命令又要问）：按工具算一类，执行命令就是所有命令
const AI_PT = { run_command: '执行任何命令', uci_set: '修改任何设置', oaf_uci: '改应用过滤设置', service_control: '启停任何服务', packages: '安装和卸载软件' };
function ai_pkey(name, a) { return { k: name, t: AI_PT[name] ?? AI_NAMES[name] ?? name }; }
// 以前点的「永久允许」是按具体那一条记的（某条命令、某个服务）：照样认
function ai_pkey_one(name, a) {
	let cut = (s, n) => (length(s) > n ? substr(s, 0, n) + '…' : s);
	switch (name) {
	case 'run_command': { let c = trim('' + (a?.command ?? '')); return length(c) ? { k: 'run_command:' + c, t: '执行命令 ' + cut(c, 60) } : null; }
	case 'service_control': return { k: 'service_control:' + (a?.name ?? '') + ' ' + (a?.action ?? ''), t: '对 ' + (a?.name ?? '') + ' ' + (a?.action ?? '') };
	case 'packages': return { k: 'packages:' + (a?.action ?? '') + ' ' + (a?.name ?? ''), t: (a?.action == 'remove' ? '卸载 ' : '安装 ') + (a?.name ?? '') };
	case 'uci_set': case 'oaf_uci': {
		let cf = {};
		for (let o in (type(a?.operations) == 'array' ? a.operations : [])) { let c = split(o?.op == 'add' ? '' + (o?.config ?? '') : '' + (o?.key ?? ''), '.')[0]; if (length(c)) cf[c] = 1; }
		let l = sort(keys(cf));
		return length(l) ? { k: name + ':' + join(',', l), t: (name == 'oaf_uci' ? '改应用过滤设置 ' : '修改设置 ') + join('、', l) } : null;
	}
	}
	return { k: name, t: AI_NAMES[name] ?? name };
}
function ai_allows() { let l = conf().ai_allow; return type(l) == 'array' ? filter(l, (x) => type(x) == 'object' && type(x.k) == 'string') : []; }
function ai_allows_save(l) {
	let c = json(readfile(CONF_PATH) ?? '{}') ?? {};
	c.ai_allow = slice(l, -50);
	writefile(CONF_PATH + '.tmp', sprintf('%J', c)); sh('chmod 600 ' + shq(CONF_PATH + '.tmp') + ' && mv ' + shq(CONF_PATH + '.tmp') + ' ' + shq(CONF_PATH));
	CONF = null;
}
function ai_read() {
	let o = cmcp_readj(AI_ASK, null), now = time();
	if (type(o) != 'object' || type(o.list) != 'array') o = { list: [] };
	// 过期的标成「过期」；只留最近 30 条
	for (let x in o.list) if (x.st == 'wait' && x.exp <= now) x.st = 'exp';
	if (length(o.list) > 30) o.list = slice(o.list, -30);
	return o;
}
function ai_write(o) { cmcp_writej(AI_ASK, o); sh('chmod 600 ' + AI_ASK + ' 2>/dev/null'); }
function ai_find(o, id) { for (let x in o.list) if (x.id == id) return x; return null; }
function ai_stop(msg) { AI_STOP = true; die(msg); }

/* 工具调用前问一下：能直接做就返回；要等确认就推送到手机，最多等 30 秒；等不到就让 AI 稍后原样再调一次 */
function ai_gate(name, a) {
	let mode = ai_mode(), cls = ai_class(name, a);
	if (mode == 'full' || cls == 'read') return;
	if (mode == 'ro') ai_stop('AI 现在是「只读」：只能查看，不能修改' + (name == 'run_command' ? '（命令行只能跑只看的命令，比如 cat、ls、logread、uci show）' : '') + '。要改的话，请用户在手机面板「我的主页 → 敏感信息 → AI 连接器地址」里把「AI 能做什么」改成「危险操作要确认」。');
	if (cls == 'light') return;
	let args = sprintf('%J', a ?? {}), now = time(), o = ai_read(), x = null, pk = ai_pkey(name, a);
	let p1 = ai_pkey_one(name, a);
	if (length(filter(ai_allows(), (y) => y.k == pk.k || (p1 && y.k == p1.k)))) {
		push(o.list, { id: rand_str(10), name, title: AI_NAMES[name] ?? name, detail: ai_detail(name, a), args, at: now, exp: now, st: 'auto', done: now }); ai_write(o);
		return;
	}
	// 同样的请求已经在等 / 已经批准：接着用这条（不会重复推送）
	for (let y in o.list) if (y.name == name && y.args == args && (y.st == 'wait' || y.st == 'ok') && y.exp > now) x = y;
	if (!x) {
		let w = length(filter(o.list, (y) => y.st == 'wait'));
		if (w >= 10) ai_stop('手机上已经有 10 个请求在等确认了，请用户先在手机面板里处理。');
		x = { id: rand_str(10), name, title: AI_NAMES[name] ?? name, detail: ai_detail(name, a), args, at: now, exp: now + AI_TTL, st: 'wait', ...(pk ? { pk: pk.k, pt: pk.t } : {}) };
		push(o.list, x); ai_write(o);
		try { sh(sprintf('CMCP_NOLOG=1 %s/cmcp-notify warn ai %s %s %s >/dev/null 2>&1 </dev/null &', SBIN, shq('AI 想要：' + x.title), shq('点开面板确认，点「允许」才会执行，5 分钟内有效。' + (length(x.detail) ? '\n' + substr(x.detail, 0, 120) : '')), shq('aiask-' + x.id))); } catch (e) {}
	}
	let id = x.id;
	// 面板服务同时只能处理 4 个请求：同一时间只让一个请求在这里等，别的直接让 AI 稍后再调（免得把手机面板堵住）
	let lk = stat(AI_LOCK);
	if (lk && time() - lk.mtime > AI_WAIT + 10) sh('rmdir ' + AI_LOCK + ' 2>/dev/null');
	if (x.st == 'wait' && mkdir(AI_LOCK)) {
		try { for (let i = 0; i < AI_WAIT && x.st == 'wait'; i++) { sh('sleep 1'); x = ai_find(ai_read(), id) ?? { st: 'exp' }; } }
		catch (e) {}
		sh('rmdir ' + AI_LOCK + ' 2>/dev/null');
	}
	if (x.st == 'ok') { o = ai_read(); let z = ai_find(o, id); if (z) { z.st = 'done'; z.done = time(); ai_write(o); } return; }
	if (x.st == 'no') ai_stop('用户在手机上点了「拒绝」，这一步没有执行。');
	if (x.st == 'wait') ai_stop('这一步要用户在手机上确认：已经推送到手机（没开推送的打开手机面板也会弹出来），点「允许」才执行，5 分钟内有效。请告诉用户去手机上确认，确认后再原样调用一次这个工具（参数完全一样）。');
	ai_stop('这个请求过期了（5 分钟内没确认），没有执行。需要的话再调用一次，会重新发到手机上。');
}

/* 面板：看在等确认的请求、允许 / 拒绝（主账号和有「完全控制」的家人才行，见 FAM_GROUPS 的 net） */
P.ai_asks = function(a) {
	let o = ai_read(), ai = conf().ai !== false;
	return { ai, mode: ai_mode(), list: map(slice(o.list, -10), (x) => ({ id: x.id, title: x.title, detail: x.detail, at: x.at, exp: x.exp, st: x.st, by: x.by ?? null, pt: x.pt ?? null })) };
};
P.ai_answer = function(a) {
	let o = ai_read(), x = ai_find(o, '' + (a?.id ?? ''));
	if (!x) die('找不到这个请求了');
	if (x.st != 'wait') die(x.st == 'exp' ? '这个请求已经过期了，让 AI 再发一次' : '这个请求已经处理过了');
	// 全部都允许 = 改成「完全放开」：跟在设置里改一样，要主账号、要先确认本人（11/27 全面检查第 11 条）。
	// 没确认的先不动这个请求（还在等），面板带用户去「我的主页 → 敏感信息」验证，回来再点
	if (a?.all === true && a?.ok === true) {
		if (ROLE != 'owner') die('只有主账号能点「全部都允许」');
		if (!sudo_ok(a?.sudo)) die('要先确认是你本人：在「我的主页 → 敏感信息」里验证');
	}
	x.st = a?.ok === true ? 'ok' : 'no'; x.by = substr('' + (DEV?.name ?? (DEV_ID ? '手机' : '面板')), 0, 40); x.ans = time();
	ai_write(o);
	// 永久允许：以后这一类不再问（推送告诉主账号，免得家人点了主账号不知道）
	let always = false;
	if (x.st == 'ok' && a?.always === true && x.pk) {
		let l = filter(ai_allows(), (y) => y.k != x.pk);
		push(l, { k: x.pk, t: x.pt ?? x.title, at: time(), by: x.by });
		ai_allows_save(l); always = true;
		try { sh(sprintf('%s/cmcp-notify info key %s %s key >/dev/null 2>&1', SBIN, shq('AI 以后' + (x.pt ?? x.title) + '不再问你'), shq(x.by + ' 点了「这一类都允许」。要收回：「我的主页 → 敏感信息 → AI 连接器地址」'))); } catch (e) {}
	}
	// 全部都允许（用户 11/27）：等于把「AI 能做什么」改成「完全放开」，只有主账号能点
	let all = false;
	if (x.st == 'ok' && a?.all === true) {
		let c = json(readfile(CONF_PATH) ?? '{}') ?? {};
		c.ai_mode = 'full';
		writefile(CONF_PATH + '.tmp', sprintf('%J', c)); sh('chmod 600 ' + shq(CONF_PATH + '.tmp') + ' && mv ' + shq(CONF_PATH + '.tmp') + ' ' + shq(CONF_PATH));
		CONF = null; all = true;
		try { sh(sprintf('%s/cmcp-notify info key %s %s key >/dev/null 2>&1', SBIN, shq('AI 以后什么都不问你'), shq(x.by + ' 点了「全部都允许」，AI 能做什么改成了「完全放开」。要改回：「我的主页 → 敏感信息 → AI 连接器地址」'))); } catch (e) {}
	}
	return { ok: true, st: x.st, always, all };
};
// 改「AI 能做什么」：要先确认本人，只有主账号
P.ai_mode = function(a) {
	need_sudo(a, true);
	let m = '' + (a?.mode ?? '');
	if (!AI_MODES[m]) die('只能是：只读 / 危险操作要确认 / 完全放开');
	let c = json(readfile(CONF_PATH) ?? '{}') ?? {};
	c.ai_mode = m;
	writefile(CONF_PATH + '.tmp', sprintf('%J', c)); sh('chmod 600 ' + shq(CONF_PATH + '.tmp') + ' && mv ' + shq(CONF_PATH + '.tmp') + ' ' + shq(CONF_PATH));
	CONF = null;
	// 改严了：在等的请求一律作废
	if (m != 'full') { let o = ai_read(); for (let x in o.list) if (x.st == 'wait' || x.st == 'ok') x.st = 'exp'; ai_write(o); }
	try { sh(sprintf('%s/cmcp-notify info key %s %s key', SBIN, shq('AI 能做什么：改成了「' + AI_MODES[m] + '」'), shq(m == 'full' ? 'AI 连接器现在什么都能直接做。不是你改的话，马上在「我的主页 → 敏感信息」里改回来，并换一下 AI 连接器地址。' : '在「我的主页 → 敏感信息 → AI 连接器地址」里随时能改。'))); } catch (e) {}
	return { ok: true, mode: m };
};
// 收回永久允许：要先确认本人，只有主账号
P.ai_allow_del = function(a) {
	need_sudo(a, true);
	let k = '' + (a?.k ?? ''), l = ai_allows(), n = filter(l, (y) => k == '*' ? false : y.k != k);
	if (length(n) == length(l)) die('没有这一条了');
	ai_allows_save(n);
	return { ok: true, allows: map(n, (y) => ({ k: y.k, t: y.t, at: y.at, by: y.by ?? null })) };
};
// 「AI 连接器地址」那一页顺便带上现在的档位和最近的请求
const CKEY_INFO0 = P.ckey_info;
P.ckey_info = function(a) {
	let r = CKEY_INFO0(a);
	if (r?.ai) { r.mode = ai_mode(); r.asks = P.ai_asks().list; r.allows = map(ai_allows(), (y) => ({ k: y.k, t: y.t, at: y.at, by: y.by ?? null })); }
	return r;
};

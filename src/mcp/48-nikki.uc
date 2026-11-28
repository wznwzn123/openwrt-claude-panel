/* ---------------- Nikki 的订阅、配置文件、规则、不走代理（11/27 全面检查第 16 条；第五阶段，用户 11/28 04:11 定睡觉时做） ----------------
 * Nikki（nikkinikki-org/OpenWrt-nikki）：
 * - 订阅：uci `config subscription`（name、url、user_agent、prefer），下载到 /etc/nikki/subscriptions/<段名>.yaml；
 *   更新用它自己的 `/etc/init.d/nikki update_subscription <段名>`（跟原版页面一样）。订阅地址不发给手机，只给主机名
 * - 配置文件：自己的放 /etc/nikki/profiles/；正在用哪个看 nikki.config.profile（subscription:<段名> / file:<文件名>）；换了要重启 Nikki
 * - 规则：uci `config rule`（type、matcher、node、no_resolve），nikki.mixin.rule=1 时排在配置文件的规则前面；
 *   分流加的 cmcp_sp_* 排在你写的后面（42-split：你写的优先），这里保存时照样放在最后
 * - 不走代理：跟 OpenClash 共用名单（blacklist.json）；Nikki 用它自己的访问控制：`lan_access_control` 段 cmcp_black（MAC / IP，dns=0 proxy=0，放最前面），
 *   马上生效靠 nft 在 inet nikki 的 lan_* 链最前面插一条 return（Nikki 重启后它自己按 uci 生成同样的规则）
 * 测试用：CMCP_NK_ROOT（假的根目录：etc/nikki/...）、CMCP_NK_RUN（命令记到文件，不执行）、CMCP_NK_ON（1 = 假装正在用 Nikki）、
 *   CMCP_NK_NFT（假的 nft：list 的输出读这个文件，执行的命令记到 <文件>.log）、CMCP_NK_CORE（假的 mihomo，检查配置用） */
const NK_ROOT = getenv('CMCP_NK_ROOT') || '';
const NK_PROF = NK_ROOT + '/etc/nikki/profiles', NK_SUBS = NK_ROOT + '/etc/nikki/subscriptions';
const NK_TYPES = ['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-WILDCARD', 'DOMAIN-REGEX', 'GEOSITE', 'GEOIP', 'IP-CIDR', 'IP-CIDR6', 'IP-SUFFIX', 'IP-ASN',
	'SRC-GEOIP', 'SRC-IP-ASN', 'SRC-IP-CIDR', 'SRC-IP-SUFFIX', 'DST-PORT', 'SRC-PORT', 'IN-PORT', 'IN-TYPE', 'IN-USER', 'IN-NAME', 'PROCESS-PATH', 'PROCESS-NAME',
	'PROCESS-NAME-REGEX', 'PROCESS-PATH-REGEX', 'UID', 'NETWORK', 'DSCP', 'RULE-SET', 'AND', 'OR', 'NOT', 'SUB-RULE'];
const NK_CHAINS = ['lan_dns_hijack', 'lan_redirect', 'lan_tproxy', 'lan_tun'];
function nk_has() { return uci_load('nikki') != null; }
function nk_need() { if (!nk_has()) die('这台路由器没装 Nikki'); }
function nk_on() { let e = getenv('CMCP_NK_ON'); return e != null ? e == '1' : px_detect()?.active == 'nikki'; }
function nk_run(cmd) { let f = getenv('CMCP_NK_RUN'); if (f) { let h = fs_open(f, 'a'); if (h) { h.write(cmd + '\n'); h.close(); } return; } bg(cmd); }
function nk_uci(cmds) {
	if (!length(cmds)) return;
	let U = conf().uci, r = sh(join(' && ', map(cmds, (c) => U + ' ' + c)) + ' && ' + U + ' commit nikki');
	if (r.code != 0) die('保存失败：' + trim(r.err ?? r.out ?? ''));
}
function nk_secs(typ) { return filter(uci_load('nikki') ?? [], (s) => s['.type'] == typ); }
function nk_sec(name) { for (let s in (uci_load('nikki') ?? [])) if (s['.name'] == name) return s; return null; }
function nk_prof() {
	let p = uci_get('nikki.config.profile') ?? '', m = match(p, /^(subscription|file):(.+)$/);
	return m ? { kind: m[1] == 'file' ? 'file' : 'sub', id: m[2] } : { kind: '', id: '' };
}
function nk_id(id) { id = '' + (id ?? ''); if (!match(id, /^[A-Za-z0-9_]{1,40}$/)) die('订阅编号不对'); return id; }
function nk_fname(n) {
	n = '' + (n ?? '');
	if (!length(n) || length(n) > 120 || index(n, '/') >= 0 || substr(n, 0, 1) == '.' || !match(n, /\.ya?ml$/)) die('文件名要以 .yaml 结尾，不能带 /');
	return n;
}
function nk_ls(d) {
	let out = [];
	for (let n in (require('fs').lsdir(d) ?? [])) { let st = stat(d + '/' + n); if (st?.type == 'file' && match(n, /\.ya?ml$/)) push(out, { name: n, size: st.size, mtime: st.mtime }); }
	return sort(out, (x, y) => x.name < y.name ? -1 : 1);
}
function nk_restart_cmd() { return '/etc/init.d/nikki restart'; }

/* ---- 总览：订阅、配置文件、你写的规则 ---- */
P.nk_get = function() {
	if (!nk_has()) return { on: false };
	let pr = nk_prof(), subs = [], rules = [], px = null;
	for (let x in (px_detect()?.list ?? [])) if (x.id == 'nikki') px = x;
	for (let s in nk_secs('subscription')) {
		let st = stat(NK_SUBS + '/' + s['.name'] + '.yaml');
		push(subs, { id: s['.name'], name: s.name || s['.name'], host: s.url ? sx_host(s.url) : '', ua: s.user_agent ?? '',
			file: st ? { size: st.size, mtime: st.mtime } : null, ok: s.success == null ? null : s.success == '1', active: pr.kind == 'sub' && pr.id == s['.name'] });
	}
	for (let s in nk_secs('rule')) if (!match(s['.name'], /^cmcp_sp_/))
		push(rules, { type: s.type ?? '', matcher: s.matcher ?? '', node: s.node ?? '', nr: s.no_resolve == '1', en: s.enabled != '0' });
	let files = map(nk_ls(NK_PROF), (f) => ({ ...f, active: pr.kind == 'file' && pr.id == f.name }));
	return { on: true, active: nk_on(), running: !!px?.running, enabled: uci_get('nikki.config.enabled') == '1', prof: pr, subs, files, rules,
		split: length(filter(nk_secs('rule'), (s) => match(s['.name'], /^cmcp_sp_/))), mixin_rule: uci_get('nikki.mixin.rule') == '1', busy: sx_busy() };
};

/* ---- 订阅：加、改、删、更新一个、换着用 ---- */
P.nk_sub_save = function(a) {
	nk_need();
	let id = a?.id ? nk_id(a.id) : null, name = trim('' + (a?.name ?? '')), url = trim('' + (a?.url ?? '')), ua = trim('' + (a?.ua ?? ''));
	if (!length(name) || length(name) > 40 || match(name, /[\r\n]/)) die('名字要 1 到 40 个字');
	if (id && (nk_sec(id)?.['.type'] != 'subscription')) die('没有这个订阅');
	if (!id && !length(url)) die('要填订阅地址');
	if (length(url) && (!match(url, /^https?:\/\/[^ \t\r\n]+$/) || length(url) > 2000)) die('订阅地址要以 http:// 或 https:// 开头');
	if (length(ua) > 60 || match(ua, /[\r\n]/)) die('User-Agent 太长');
	let cmds = [];
	if (!id) {
		let n = time(); id = sprintf('sub%x', n);
		while (nk_sec(id)) id = sprintf('sub%x', ++n);
		push(cmds, 'set ' + shq('nikki.' + id + '=subscription'), 'set ' + shq('nikki.' + id + '.prefer=remote'));
	}
	push(cmds, 'set ' + shq('nikki.' + id + '.name=' + name), 'set ' + shq('nikki.' + id + '.user_agent=' + (ua || 'clash.meta')));
	if (length(url)) push(cmds, 'set ' + shq('nikki.' + id + '.url=' + url));
	nk_uci(cmds);
	return { ok: true, id };
};
P.nk_sub_del = function(a) {
	nk_need();
	let id = nk_id(a?.id), pr = nk_prof();
	if (nk_sec(id)?.['.type'] != 'subscription') die('没有这个订阅');
	if (pr.kind == 'sub' && pr.id == id) die('这是正在用的订阅，先换成别的再删');
	let f = NK_SUBS + '/' + id + '.yaml', b = stat(f) ? oc_backup_file('nikki_sub', f) : null;
	nk_uci(['delete ' + shq('nikki.' + id)]);
	if (stat(f)) unlink(f);
	return { ok: true, backup: b };
};
P.nk_sub_update = function(a) {
	nk_need();
	let id = nk_id(a?.id), pr = nk_prof();
	if (nk_sec(id)?.['.type'] != 'subscription') die('没有这个订阅');
	if (sx_busy()) die('订阅正在更新，稍等');
	// 正在用的订阅：更新完重启才用上；Nikki 关着就不重启（不把它打开）
	let restart = pr.kind == 'sub' && pr.id == id;
	writefile(SX_BUSY, '' + time());
	nk_run(sprintf('/etc/init.d/nikki update_subscription %s; %s rm -f %s', shq(id), restart ? SBIN + '/cmcp-proxy running nikki && ' + nk_restart_cmd() + ';' : '', shq(SX_BUSY)));
	return { ok: true, restart };
};
// 换成这个订阅 / 这个配置文件：改 nikki.config.profile，要重启 Nikki 才用上（用户 11/26：先问，点了才重启）。订阅还没下载过就先下载
P.nk_use = function(a) {
	nk_need();
	let kind = a?.kind == 'file' ? 'file' : 'sub', id, dl = false;
	if (kind == 'file') { id = nk_fname(a?.id); if (!stat(NK_PROF + '/' + id)) die('没有这个配置文件'); }
	else { id = nk_id(a?.id); if (nk_sec(id)?.['.type'] != 'subscription') die('没有这个订阅'); dl = !stat(NK_SUBS + '/' + id + '.yaml'); }
	nk_uci(['set ' + shq('nikki.config.profile=' + (kind == 'file' ? 'file:' : 'subscription:') + id)]);
	let cmd = [];
	if (dl) push(cmd, '/etc/init.d/nikki update_subscription ' + shq(id));
	if (a?.restart && nk_on()) push(cmd, nk_restart_cmd());
	if (length(cmd)) nk_run(join('; ', cmd));
	return { ok: true, restarting: !!(a?.restart && nk_on()), dl };
};

/* ---- 配置文件：看、改、新建、删（跟 OpenClash 的配置文件页共用 file_read / file_save / file_delete，kind = nk_profile / nk_sub / nk_run） ---- */
const NK_KINDS = { nk_profile: NK_PROF, nk_sub: NK_SUBS, nk_run: NK_ROOT + '/etc/nikki/run' };
function nk_fpath(kind, name) {
	if (kind == 'nk_run') { if (name != 'config.yaml') die('只能看正在跑的 config.yaml'); return NK_KINDS.nk_run + '/config.yaml'; }
	if (kind == 'nk_sub') { if (!match('' + name, /^[A-Za-z0-9_]{1,40}\.yaml$/)) die('文件名不对'); return NK_SUBS + '/' + name; }
	return NK_PROF + '/' + nk_fname(name);
}
// 用 Nikki 的内核检查配置（mihomo -t）；没有内核就不查
function nk_test(content) {
	let core = getenv('CMCP_NK_CORE') || '/usr/bin/mihomo';
	if (!stat(core)) return null;
	let tmp = '/tmp/cmcp_nktest.yaml';
	writefile(tmp, content);
	let r = sh(sprintf('%s -t -d %s -f %s 2>&1 | tail -n 6', shq(core), shq(NK_ROOT + '/etc/nikki/run'), tmp));
	unlink(tmp);
	return (index(r.out, 'test failed') >= 0 || (index(lc(r.out), 'error') >= 0 && index(r.out, 'successful') < 0)) ? trim(r.out) : null;
}
const NK_FREAD = P.file_read, NK_FSAVE = P.file_save, NK_FDEL = P.file_delete;
P.file_read = function(a) {
	if (!NK_KINDS[a?.kind]) return NK_FREAD(a);
	let p = nk_fpath(a.kind, a.name), st = stat(p);
	if (!st) die('文件不存在：' + a.name);
	if (st.size > 3 * 1024 * 1024) die('文件超过 3MB，手机上不方便查看');
	let s = readfile(p) ?? '';
	return { name: a.name, size: st.size, mtime: st.mtime, content: s, sum: oc_file_sum(p), ro: a.kind != 'nk_profile' };
};
P.file_save = function(a) {
	if (!NK_KINDS[a?.kind]) return NK_FSAVE(a);
	if (a.kind != 'nk_profile') die('这个文件只能看：订阅的文件更新时会被盖掉，要改就另存成配置文件');
	if (type(a.content) != 'string') die('缺少文件内容');
	let p = nk_fpath(a.kind, a.name);
	if (a.base != null && !a.overwrite && oc_file_sum(p) != a.base)
		die('这个文件在你打开以后被别处改过（原版页面、AI 或别的手机），为了不把那边的改动盖掉，这次没有保存。');
	if (!a.force) { let bad = nk_test(a.content); if (bad) die('配置文件校验没通过，没有保存：\n' + bad); }
	mkdir(NK_PROF);
	let b = oc_backup_file('nikki', p);
	if (writefile(p + '.cmcp_tmp', a.content) == null) die('写入失败');
	rename(p + '.cmcp_tmp', p);
	let pr = nk_prof(), restarting = !!(a.restart && nk_on() && pr.kind == 'file' && pr.id == a.name);
	if (restarting) nk_run(nk_restart_cmd());
	return { ok: true, backup: b, restarting };
};
P.file_delete = function(a) {
	if (!NK_KINDS[a?.kind]) return NK_FDEL(a);
	if (a.kind != 'nk_profile') die('这个文件不能删');
	let p = nk_fpath(a.kind, a.name), pr = nk_prof();
	if (!stat(p)) die('文件不存在');
	if (pr.kind == 'file' && pr.id == a.name) die('这是正在用的配置文件，先换成别的再删');
	let b = oc_backup_file('nikki', p);
	unlink(p);
	return { ok: true, backup: b };
};

/* ---- 规则：你在 Nikki 里自己写的（uci rule），一行一条「类型,内容,去向[,no-resolve]」，行首 # 是停用的 ---- */
function nk_rule_parse(text) {
	let out = [], bad = [], i = 0;
	for (let ln in split('' + (text ?? ''), '\n')) {
		i++;
		let l = trim(ln), en = true;
		if (!length(l)) continue;
		if (substr(l, 0, 1) == '#') { l = trim(replace(l, /^#+/, '')); en = false; }
		l = trim(replace(l, /^-[ \t]*/, ''));
		let p = map(split(l, ','), (x) => trim(x)), ty = uc(p[0] ?? ''), nr = false;
		if (!en && index(NK_TYPES, ty) < 0) continue; // 普通注释
		if (length(p) >= 4 && lc(p[length(p) - 1]) == 'no-resolve') { nr = true; p = slice(p, 0, length(p) - 1); }
		if (ty == 'MATCH') { push(bad, sprintf('第 %d 行：MATCH 会让后面的规则全部失效，不能加在这里', i)); continue; }
		if (index(NK_TYPES, ty) < 0 || length(p) < 3) { push(bad, sprintf('第 %d 行：格式不对（类型,内容,去向）', i)); continue; }
		let node = p[length(p) - 1], m = join(',', slice(p, 1, length(p) - 1));
		if (!length(m) || !length(node) || length(m) > 300 || length(node) > 100) { push(bad, sprintf('第 %d 行：格式不对（类型,内容,去向）', i)); continue; }
		if (ty != 'AND' && ty != 'OR' && ty != 'NOT' && ty != 'SUB-RULE' && index(m, ',') >= 0) { push(bad, sprintf('第 %d 行：内容里不能有逗号', i)); continue; }
		push(out, { type: ty, matcher: m, node, nr, en, line: i });
	}
	if (length(out) > 300) push(bad, '最多 300 条');
	return { rules: out, bad };
}
P.nk_rules_set = function(a) {
	nk_need();
	let r = nk_rule_parse(a?.text);
	if (length(r.bad)) die(join('\n', slice(r.bad, 0, 5)));
	// 去向要是现在有的策略组或节点（Nikki 没在跑就不查）
	if (!a?.force) {
		let names = null;
		try { names = keys(api('GET', '/proxies', null, 5)?.proxies ?? {}); } catch (e) {}
		if (names && length(names)) {
			let miss = [];
			for (let x in r.rules) if (x.en && index(names, x.node) < 0 && index(miss, x.node) < 0) push(miss, x.node);
			if (length(miss)) die('没有这个策略组或节点：' + join('、', slice(miss, 0, 5)) + '\n名字要和「节点」页里的完全一样');
		}
	}
	let all = nk_secs('rule'), sp = filter(all, (s) => match(s['.name'], /^cmcp_sp_/)), cmds = [];
	// 从后往前删（匿名段的名字跟着位置，先删前面的后面的名字会变）
	for (let k = length(all) - 1; k >= 0; k--) push(cmds, 'delete ' + shq('nikki.' + all[k]['.name']));
	let i = 0;
	for (let x in r.rules) {
		let id = 'nikki.ur_' + i++;
		push(cmds, 'set ' + shq(id + '=rule'), 'set ' + shq(id + '.enabled=' + (x.en ? '1' : '0')), 'set ' + shq(id + '.type=' + x.type),
			'set ' + shq(id + '.matcher=' + x.matcher), 'set ' + shq(id + '.node=' + x.node), 'set ' + shq(id + '.no_resolve=' + (x.nr ? '1' : '0')));
	}
	// 分流加的放在最后（你写的优先）
	for (let s in sp) {
		let id = 'nikki.' + s['.name'];
		push(cmds, 'set ' + shq(id + '=rule'));
		for (let k in ['enabled', 'type', 'matcher', 'node', 'no_resolve']) if (s[k] != null) push(cmds, 'set ' + shq(id + '.' + k + '=' + s[k]));
	}
	if (length(r.rules) || length(sp)) push(cmds, 'set ' + shq('nikki.mixin.rule=1'));
	nk_uci(cmds);
	let restarting = !!(a?.restart && nk_on());
	if (restarting) nk_run(nk_restart_cmd());
	return { ok: true, n: length(r.rules), restarting };
};

/* ---- 不走代理：名单变了（加、删、搬家、改网段）就同步到 Nikki 的访问控制 ---- */
function nk_nft(cmd) {
	let f = getenv('CMCP_NK_NFT');
	if (f) { let h = fs_open(f + '.log', 'a'); if (h) { h.write(cmd + '\n'); h.close(); } return { code: 0, out: match(cmd, /^-a list /) ? (readfile(f) ?? '') : '' }; }
	return sh('nft ' + cmd + ' 2>&1');
}
function nk_black_want() {
	let macs = [], ips = [];
	for (let e in bl_load()) {
		if (e.mac && match(lc(e.mac), /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) { if (index(macs, lc(e.mac)) < 0) push(macs, lc(e.mac)); }
		else if (match(e.ip ?? '', /^[0-9]{1,3}(\.[0-9]{1,3}){3}$/) && index(ips, e.ip) < 0) push(ips, e.ip);
	}
	return { macs: sort(macs), ips: sort(ips) };
}
// 马上生效：inet nikki 的 lan_* 链里先删掉上一次插的，再插到最前面（Nikki 没在跑、没开局域网代理就没有这些链，什么也不做）
function nk_black_live(w) {
	if (!nk_on()) return false;
	let done = false;
	for (let ch in NK_CHAINS) {
		let r = nk_nft('-a list chain inet nikki ' + ch);
		if (r.code != 0) continue;
		for (let ln in split(r.out ?? '', '\n')) { let m = match(ln, /comment "cmcp_black".*# handle ([0-9]+)/); if (m) nk_nft(sprintf('delete rule inet nikki %s handle %s', ch, m[1])); }
		if (length(w.ips)) nk_nft(sprintf('insert rule inet nikki %s ip saddr { %s } counter return comment "cmcp_black"', ch, join(', ', w.ips)));
		if (length(w.macs)) nk_nft(sprintf('insert rule inet nikki %s ether saddr { %s } counter return comment "cmcp_black"', ch, join(', ', w.macs)));
		done = true;
	}
	return done;
}
// live：马上改 nft（用户在面板里改名单时）；看门狗每分钟调时只在 uci 对不上时才改
function nk_black_sync(live) {
	if (!nk_has()) return false;
	let w = nk_black_want(), cur = nk_sec('cmcp_black'), acl = nk_secs('lan_access_control');
	let same = cur && join(',', sort(as_list(cur.mac))) == join(',', w.macs) && join(',', sort(as_list(cur.ip))) == join(',', w.ips) && acl[0]?.['.name'] == 'cmcp_black';
	if (!(same || (!cur && !length(w.macs) && !length(w.ips)))) {
		let cmds = [];
		if (cur) push(cmds, 'delete ' + shq('nikki.cmcp_black'));
		if (length(w.macs) || length(w.ips)) {
			push(cmds, 'set ' + shq('nikki.cmcp_black=lan_access_control'), 'set ' + shq('nikki.cmcp_black.enabled=1'), 'set ' + shq('nikki.cmcp_black.dns=0'), 'set ' + shq('nikki.cmcp_black.proxy=0'));
			for (let m in w.macs) push(cmds, 'add_list ' + shq('nikki.cmcp_black.mac=' + m));
			for (let ip in w.ips) push(cmds, 'add_list ' + shq('nikki.cmcp_black.ip=' + ip));
			push(cmds, 'reorder ' + shq('nikki.cmcp_black=0'));
		}
		nk_uci(cmds);
		live = true;
	}
	return live ? nk_black_live(w) : false;
}
push(BL_HOOK, nk_black_sync);
// 页面：用 Nikki 时不需要 OpenClash 那一步「启用」，添加、恢复马上生效
const NK_BSTATE = P.black_state, NK_BSET = P.black_set;
P.black_state = function(a) {
	let r = NK_BSTATE(a);
	if (nk_on()) { r.ready = true; r.live = true; r.custom_on = true; r.px = 'nikki'; }
	return r;
};
P.black_set = function(a) {
	let r = NK_BSET(a);
	if (nk_on()) {
		r.live = true; r.need_setup = false;
		// 已经在走代理的连接断开重连，马上改走直连
		let ip = r.ip ?? a?.ip;
		if (a?.on && ip) try {
			for (let cn in (api('GET', '/connections', null, 5)?.connections ?? []))
				if (cn.metadata?.sourceIP == ip) try { api('DELETE', '/connections/' + cn.id, null, 3); } catch (e) {}
		} catch (e) {}
	}
	return r;
};

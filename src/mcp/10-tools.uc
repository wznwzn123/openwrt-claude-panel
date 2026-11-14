const T = {};

T.router_status = function() {
	let lines = [];
	let ver = null, cfg = null, conns = null;
	try { ver = api('GET', '/version'); } catch (e) { push(lines, 'Clash 内核：未运行或无法连接（' + e + '）'); }
	if (ver) {
		push(lines, sprintf('Clash 内核：运行中，版本 %s%s', ver.version ?? '?', ver.meta ? '（Meta）' : ''));
		try { cfg = api('GET', '/configs'); } catch (e) {}
		try { conns = api('GET', '/connections'); } catch (e) {}
	}
	if (cfg)
		push(lines, sprintf('代理模式：%s，混合端口：%s', cfg.mode ?? '?', cfg['mixed-port'] ?? '?'));
	if (conns)
		push(lines, sprintf('当前连接数：%d，累计下载 %s，上传 %s',
			length(conns.connections ?? []), fmt_bytes(conns.downloadTotal), fmt_bytes(conns.uploadTotal)));

	const keys = {
		'enable': 'OpenClash 开关',
		'config_path': '当前配置文件',
		'en_mode': '运行模式',
		'enable_custom_clash_rules': '自定义规则开关',
		'cn_port': '控制面板端口',
		'china_ip_route': '区域绕过(大陆)',
	};
	for (let k, label in keys) {
		let v = uci_get('openclash.config.' + k);
		if (v != null)
			push(lines, label + '：' + v);
	}

	let oaf = sh('pgrep -f oafd >/dev/null 2>&1 && echo yes || echo no');
	push(lines, 'OAF 应用过滤进程：' + (trim_nl(oaf.out) == 'yes' ? '运行中' : '未检测到'));
	return join('\n', lines);
};

T.list_proxy_groups = function(a) {
	let data = api('GET', '/proxies');
	let px = data?.proxies ?? {};

	if (a.group) {
		let g = px[a.group];
		if (!g) die('找不到策略组：' + a.group);
		let out = [sprintf('策略组 %s（%s），当前选择：%s', a.group, g.type, g.now ?? '-')];
		let kw = a.filter ? lc(a.filter) : null;
		for (let name in (g.all ?? [])) {
			if (kw && index(lc(name), kw) < 0) continue;
			let p = px[name] ?? {};
			let d = last_delay(p);
			push(out, sprintf('%s %s | %s | %s', name == g.now ? '▶' : '·', name, p.type ?? '?',
				d == null ? '未测' : (d == 0 ? '超时' : d + 'ms')));
		}
		return join('\n', out);
	}

	let out = ['策略组列表（名称 | 类型 | 当前选择 | 节点数）：'];
	for (let name, p in px) {
		if (!GROUP_TYPES[p.type] || name == 'GLOBAL') continue;
		push(out, sprintf('%s | %s | %s | %d', name, p.type, p.now ?? '-', length(p.all ?? [])));
	}
	return join('\n', out);
};

T.test_delay = function(a) {
	if (!a.name) die('缺少 name');
	let url = a.url || 'https://www.gstatic.com/generate_204';
	let tmo = +a.timeout || 5000;
	let q = sprintf('?url=%s&timeout=%d', urlenc(url), tmo);

	let px = api('GET', '/proxies')?.proxies ?? {};
	let p = px[a.name];
	if (!p) die('找不到节点或策略组：' + a.name);

	if (GROUP_TYPES[p.type]) {
		let res = api('GET', '/group/' + urlenc(a.name) + '/delay' + q, null, tmo / 1000 + 20);
		let rows = [];
		for (let n in (p.all ?? []))
			push(rows, { n, d: res?.[n] });
		rows = sort(rows, (x, y) => (x.d ?? 1e9) - (y.d ?? 1e9));
		let out = [sprintf('策略组 %s 测速结果（%s）：', a.name, url)];
		for (let r in rows)
			push(out, sprintf('%s：%s', r.n, r.d == null ? '超时/不可用' : r.d + 'ms'));
		return join('\n', out);
	}

	let res = null;
	try {
		res = api('GET', '/proxies/' + urlenc(a.name) + '/delay' + q, null, tmo / 1000 + 5);
	} catch (e) {
		return sprintf('%s：超时或不可用（%s）', a.name, e);
	}
	return sprintf('%s：%sms', a.name, res?.delay ?? '?');
};

/* 面板的域名（比如 router.example.com → example.com）：切节点时不断开访问面板的连接 */
function panel_domain() {
	let h = trim(readfile('/etc/claude-mcp/hostname') ?? '');
	let p = split(h, '.');
	return length(p) > 2 ? join('.', slice(p, 1)) : h;
}
T.switch_proxy = function(a) {
	if (!a.group || !a.node) die('需要 group 和 node');
	let px = api('GET', '/proxies')?.proxies ?? {};
	let g = px[a.group];
	if (!g) die('找不到策略组：' + a.group);
	if (g.type != 'Selector') die(sprintf('策略组 %s 是 %s 类型，只有 Selector 类型可以手动切换', a.group, g.type));
	if (index(g.all ?? [], a.node) < 0) die(sprintf('节点「%s」不在策略组 %s 中，请先用 list_proxy_groups 查看准确名称', a.node, a.group));

	let before = g.now;
	api('PUT', '/proxies/' + urlenc(a.group), { name: a.node });
	let after = api('GET', '/proxies/' + urlenc(a.group))?.now;
	let msg = sprintf('已切换策略组 %s：%s → %s', a.group, before, after);
	if (a.close_connections) {
		// 只断开走这个策略组的连接；面板自己的连接保留，并且等回复送出去以后再断，
		// 否则手机收不到「切换成功」，还会以为连不上路由器
		let d = panel_domain(), ids = [];
		for (let c in (api('GET', '/connections')?.connections ?? [])) {
			let m = c.metadata ?? {}, h = lc(m.host || m.sniffHost || '');
			if (length(d) && (h == d || substr(h, -length(d) - 1) == '.' + d)) continue;
			if (index(c.chains ?? [], a.group) < 0) continue;
			push(ids, c.id);
		}
		if (length(ids)) {
			let ctl = controller();
			writefile('/tmp/cmcp_close_ids', join('\n', ids) + '\n');
			sh(sprintf("nohup sh -c 'sleep 1; while read id; do curl -s --noproxy \"*\" -m 3 -X DELETE -H %s %s/connections/$id >/dev/null 2>&1; done < /tmp/cmcp_close_ids; rm -f /tmp/cmcp_close_ids' >/dev/null 2>&1 </dev/null &",
				replace(shq('Authorization: Bearer ' + ctl.secret), "'", "'\\''"), ctl.base));
		}
		msg += sprintf('，并断开了走这个策略组的 %d 条旧连接（面板自己的连接保留）', length(ids));
	}
	return msg;
};

T.set_mode = function(a) {
	if (index(['rule', 'global', 'direct'], a.mode) < 0) die('mode 只能是 rule / global / direct');
	api('PATCH', '/configs', { mode: a.mode });
	return '代理模式已改为：' + a.mode + '（临时生效，OpenClash 重启后恢复配置中的模式）';
};

T.list_connections = function(a) {
	let data = api('GET', '/connections');
	let list = data?.connections ?? [];
	let kw = a.filter ? lc(a.filter) : null;
	let limit = +a.limit || 50;
	let rows = [];

	for (let c in list) {
		let m = c.metadata ?? {};
		let host = (m.host || m.sniffHost || m.destinationIP || '?') + ':' + (m.destinationPort ?? '');
		let chain = join(' ← ', c.chains ?? []);
		let rule = (c.rule ?? '') + (length(c.rulePayload ?? '') ? ':' + c.rulePayload : '');
		let line = sprintf('%s | %s | %s | %s | ↓%s ↑%s | 来自 %s | id=%s',
			host, m.network ?? '', rule, chain, fmt_bytes(c.download), fmt_bytes(c.upload),
			m.sourceIP ?? '?', c.id);
		if (kw && index(lc(line), kw) < 0) continue;
		push(rows, { dl: +c.download || 0, line });
	}

	rows = sort(rows, (x, y) => y.dl - x.dl);
	let out = [sprintf('活跃连接 %d 条%s，显示 %d 条（主机 | 协议 | 命中规则 | 代理链 | 流量 | 来源 | id）：',
		length(list), kw ? '（过滤后 ' + length(rows) + ' 条）' : '', length(rows) < limit ? length(rows) : limit)];
	for (let i = 0; i < length(rows) && i < limit; i++)
		push(out, rows[i].line);
	return join('\n', out);
};

T.close_connections = function(a) {
	if (a.id) {
		api('DELETE', '/connections/' + urlenc(a.id));
		return '已断开连接 ' + a.id;
	}
	api('DELETE', '/connections');
	return '已断开全部连接（相当于 OpenClash 的「关闭链接」）';
};

T.list_rules = function(a) {
	let rules = api('GET', '/rules')?.rules ?? [];
	let kw = a.filter ? lc(a.filter) : null;
	let limit = +a.limit || 60, offset = +a.offset || 0;
	let rows = [];
	for (let i = 0; i < length(rules); i++) {
		let r = rules[i];
		let line = sprintf('%d. %s,%s → %s', i + 1, r.type, r.payload, r.proxy);
		if (kw && index(lc(line), kw) < 0) continue;
		push(rows, line);
	}
	let out = [sprintf('生效规则共 %d 条%s：', length(rules), kw ? '，匹配 ' + length(rows) + ' 条' : '')];
	for (let i = offset; i < length(rows) && i < offset + limit; i++)
		push(out, rows[i]);
	if (length(rows) > offset + limit)
		push(out, sprintf('……还有 %d 条，可用 offset=%d 继续查看', length(rows) - offset - limit, offset + limit));
	return join('\n', out);
};

T.get_logs = function(a) {
	let lvl = a.level || 'info';
	if (index(['debug', 'info', 'warning', 'error'], lvl) < 0) lvl = 'info';
	let secs = +a.seconds || 3;
	if (secs < 1) secs = 1;
	if (secs > 15) secs = 15;

	let ctl = controller();
	let cmd = sprintf("curl -sS -N --noproxy '*' -m %d", secs);
	if (length(ctl.secret))
		cmd += ' -H ' + shq('Authorization: Bearer ' + ctl.secret);
	cmd += ' ' + shq(ctl.base + '/logs?level=' + lvl);
	let r = sh(cmd);

	let kw = a.filter ? lc(a.filter) : null;
	let out = [];
	for (let l in split(r.out, '\n')) {
		l = trim(l);
		if (!length(l) || substr(l, 0, 1) != '{') continue;
		let o = null;
		try { o = json(l); } catch (e) { continue; }
		let s = sprintf('[%s] %s', o.type, o.payload);
		if (kw && index(lc(s), kw) < 0) continue;
		push(out, s);
	}
	if (!length(out))
		return sprintf('采集了 %d 秒的实时日志（级别 %s），期间没有新日志。可以让用户先去操作对应 App，再调用一次。', secs, lvl);
	return sprintf('最近 %d 秒实时日志（%d 条）：\n', secs, length(out)) + join('\n', out);
};

function rules_path(n) {
	return conf().custom_dir + (+n == 2 ? '/openclash_custom_rules_2.list' : '/openclash_custom_rules.list');
}

T.get_custom_rules = function(a) {
	let p = rules_path(a.file);
	let txt = readfile(p);
	if (txt == null) die('读取失败：' + p);
	let en = uci_get('openclash.config.enable_custom_clash_rules');
	let lines = split(txt, '\n');
	let out = [];
	for (let i = 0; i < length(lines); i++) {
		if (a.hide_comments && match(lines[i], /^\s*#/)) continue;
		push(out, sprintf('%3d| %s', i + 1, lines[i]));
	}
	return sprintf('文件：%s（%s）\n自定义规则开关：%s\n', p,
		+a.file == 2 ? '候补匹配，排在原有规则之后' : '优先匹配，排在原有规则之前',
		en == '1' ? '已开启' : '未开启') + join('\n', out);
};

function restart_openclash_bg() {
	sh(sprintf("nohup sh -c 'sleep 2; %s/openclash restart' >/dev/null 2>&1 </dev/null &", conf().init_dir));
}

T.set_custom_rules = function(a) {
	if (type(a.content) != 'string') die('content 必须是完整的文件内容（字符串）');
	let content = a.content;
	if (!match(content, /(^|\n)rules:[ \t]*(\n|$)/))
		die('内容里缺少顶格的「rules:」行。请保留文件原有的「rules:」行，规则写在它下面，每行以「- 」开头。');

	// 检查规则行：rules: 之后、非注释、非空行必须以 "- " 开头
	let lines = split(content, '\n'), in_rules = false, bad = [];
	for (let i = 0; i < length(lines); i++) {
		let l = lines[i];
		if (match(l, /^rules:[ \t]*$/)) { in_rules = true; continue; }
		if (match(l, /^[A-Za-z-]+:/)) { in_rules = false; continue; }
		if (!in_rules || match(l, /^\s*(#|$)/)) continue;
		if (!match(l, /^- [A-Z-]+,/))
			push(bad, sprintf('第 %d 行：%s', i + 1, l));
		else if (match(l, /，/))
			push(bad, sprintf('第 %d 行含全角逗号：%s', i + 1, l));
	}
	if (length(bad) && !a.force)
		die('以下规则行格式可疑（应顶格以「- 类型,」开头、使用半角逗号）。确认无误可传 force=true：\n' + join('\n', bad));

	// 检查节点/策略组名是否存在（Clash 在运行时才检查）
	let missing = [];
	try {
		let px = api('GET', '/proxies')?.proxies ?? {};
		const builtin = { DIRECT: 1, REJECT: 1, 'REJECT-DROP': 1, PASS: 1, COMPATIBLE: 1 };
		in_rules = false;
		for (let l in lines) {
			if (match(l, /^rules:[ \t]*$/)) { in_rules = true; continue; }
			if (match(l, /^[A-Za-z-]+:/)) { in_rules = false; continue; }
			if (!in_rules || !match(l, /^- /)) continue;
			let parts = split(replace(substr(l, 2), /\s+#.*$/, ''), ',');
			let target = null;
			for (let j = length(parts) - 1; j >= 1; j--) {
				let t = trim(parts[j]);
				if (t == 'no-resolve' || t == 'src') continue;
				target = t; break;
			}
			if (target && !builtin[target] && !px[target] && index(missing, target) < 0)
				push(missing, target);
		}
	} catch (e) {}
	if (length(missing) && !a.force)
		die('这些目标在当前配置里不存在（OpenClash 会跳过对应规则）：\n' + join('\n', missing) +
			'\n请用 list_proxy_groups 查看准确的节点名后修改；确认无误可传 force=true。');

	let p = rules_path(a.file);
	let old = readfile(p);
	if (old != null)
		writefile(p + '.bak', old);
	if (!writefile(p + '.tmp', content) || !rename(p + '.tmp', p))
		die('写入失败：' + p);

	let msg = '已保存 ' + p + (old != null ? '（旧版本备份为 .bak，可用 restore_custom_rules 还原）' : '');
	if (a.enable !== false && uci_get('openclash.config.enable_custom_clash_rules') != '1') {
		sh(conf().uci + ' set openclash.config.enable_custom_clash_rules=1 && ' + conf().uci + ' commit openclash');
		msg += '，并已打开「自定义规则」开关';
	}
	if (a.apply !== false) {
		restart_openclash_bg();
		msg += '。OpenClash 正在后台重启（约 10–30 秒，期间网络会短暂中断），之后用 list_rules 确认规则已生效';
	} else
		msg += '。尚未生效，需调用 restart_openclash';
	return msg;
};

T.restore_custom_rules = function(a) {
	let p = rules_path(a.file);
	let bak = readfile(p + '.bak');
	if (bak == null) die('没有找到备份：' + p + '.bak');
	let cur = readfile(p);
	writefile(p, bak);
	if (cur != null) writefile(p + '.bak', cur);
	if (a.apply !== false) restart_openclash_bg();
	return '已从备份还原 ' + p + (a.apply !== false ? '，OpenClash 正在后台重启' : '');
};

T.restart_openclash = function() {
	restart_openclash_bg();
	return 'OpenClash 正在后台重启（约 10–30 秒，期间网络会短暂中断）。稍后用 router_status 或 openclash_log 查看结果。';
};

T.openclash_log = function(a) {
	let n = +a.lines || 60;
	if (n > 400) n = 400;
	let r = sh(sprintf('tail -n %d %s', n, shq(conf().openclash_log)));
	let out = r.out;
	if (a.filter) {
		let kw = lc(a.filter), keep = [];
		for (let l in split(out, '\n'))
			if (index(lc(l), kw) >= 0) push(keep, l);
		out = join('\n', keep);
	}
	return length(trim(out)) ? out : '（日志为空）';
};

/* ---------------- OAF 应用过滤 ---------------- */

T.oaf_show = function(a) {
	let out = [];
	let r = sh(conf().uci + ' show appfilter');
	push(out, '== uci show appfilter ==');
	push(out, r.code == 0 ? trim_nl(r.out) : '（读取失败，OAF 可能未安装）');
	for (let f in ['/proc/net/af_client', '/tmp/af_client.list']) {
		let t = readfile(f);
		if (t != null) {
			push(out, '== ' + f + ' ==');
			push(out, trim_nl(t));
		}
	}
	return join('\n', out);
};

T.oaf_find_app = function(a) {
	if (!a.keyword) die('缺少 keyword');
	let kw = lc(a.keyword), out = [], cls = '';
	for (let f in (conf().feature_file ? [conf().feature_file] : ['/tmp/feature.cfg', '/etc/appfilter/feature.cfg', '/usr/share/appfilter/feature.cfg'])) {
		let t = readfile(f);
		if (t == null) continue;
		for (let l in split(t, '\n')) {
			let m = match(l, /^#class\s+(\S+)\s+(.*)$/);
			if (m) { cls = m[1] + ' ' + m[2]; continue; }
			let m2 = match(l, /^(\d+)\s+([^:]+):/);
			if (m2 && index(lc(m2[2]), kw) >= 0)
				push(out, sprintf('应用ID %s | %s | 分类 %s', m2[1], m2[2], cls));
		}
		return length(out) ? '特征库 ' + f + '：\n' + join('\n', out) : '特征库里没有找到包含「' + a.keyword + '」的应用';
	}
	die('没有找到 OAF 特征库文件');
};

T.oaf_uci = function(a) {
	let ops = a.operations;
	if (type(ops) != 'array' || !length(ops)) die('operations 必须是非空数组');
	let U = conf().uci, log = [];
	for (let op in ops) {
		let k = op.key ?? '';
		if (op.op != 'add' && !match(k, /^appfilter(\.(@[A-Za-z0-9_]+\[-?[0-9]+\]|[A-Za-z0-9_-]+)){1,2}$/))
			die('只允许修改 appfilter 配置，非法 key：' + k);
		let cmd;
		switch (op.op) {
		case 'set':      cmd = sprintf('%s set %s', U, shq(k + '=' + (op.value ?? ''))); break;
		case 'add_list': cmd = sprintf('%s add_list %s', U, shq(k + '=' + (op.value ?? ''))); break;
		case 'del_list': cmd = sprintf('%s del_list %s', U, shq(k + '=' + (op.value ?? ''))); break;
		case 'delete':   cmd = sprintf('%s delete %s', U, shq(k)); break;
		case 'add':
			if (!match(op.value ?? '', /^[A-Za-z0-9_]+$/)) die('add 需要 value=节类型');
			cmd = sprintf('%s add appfilter %s', U, op.value); break;
		default: die('不支持的操作：' + op.op);
		}
		let r = sh(cmd);
		push(log, sprintf('%s %s %s → %s', op.op, k, op.value ?? '', r.code == 0 ? ('成功' + (length(trim(r.out)) ? '：' + trim(r.out) : '')) : '失败：' + trim(r.out)));
		if (r.code != 0) {
			sh(U + ' revert appfilter');
			die('操作失败，已撤销本次所有未提交的修改：\n' + join('\n', log));
		}
	}
	if (a.commit !== false) {
		sh(U + ' commit appfilter');
		push(log, '已提交');
		if (a.restart !== false) {
			sh(sprintf("nohup sh -c '%s/appfilter restart' >/dev/null 2>&1 </dev/null &", conf().init_dir));
			push(log, 'OAF 正在后台重启');
		}
	}
	return join('\n', log);
};

/* ---------------- 系统 / 设备 / 网络 ---------------- */

T.system_info = function() {
	let out = [];
	let model = trim(readfile('/tmp/sysinfo/model') ?? readfile('/proc/device-tree/model') ?? '');
	if (length(model)) push(out, '型号：' + model);

	let osr = readfile('/etc/openwrt_release') ?? '';
	let m = match(osr, /DISTRIB_DESCRIPTION='([^']*)'/);
	if (m) push(out, '系统：' + m[1]);

	let up = readfile('/proc/uptime');
	if (up) {
		let s = +split(up, ' ')[0];
		push(out, sprintf('运行时间：%d天%d时%d分', s / 86400, (s % 86400) / 3600, (s % 3600) / 60));
	}

	let la = readfile('/proc/loadavg');
	if (la) {
		let p = split(trim(la), ' ');
		push(out, sprintf('CPU 负载：%s / %s / %s（1/5/15 分钟）', p[0], p[1], p[2]));
	}

	let mem = readfile('/proc/meminfo') ?? '';
	let tot = +(match(mem, /MemTotal:\s+(\d+)/)?.[1] ?? 0);
	let av = +(match(mem, /MemAvailable:\s+(\d+)/)?.[1] ?? 0);
	if (tot)
		push(out, sprintf('内存：已用 %s / 共 %s（%d%%）', fmt_bytes((tot - av) * 1024), fmt_bytes(tot * 1024), (tot - av) * 100 / tot));

	let temps = [];
	let tz = sh("for z in /sys/class/thermal/thermal_zone*/temp; do [ -f \"$z\" ] && cat \"$z\"; done");
	for (let l in split(trim(tz.out), '\n')) {
		let v = +l;
		if (v > 1000) v = v / 1000;
		if (v > 0) push(temps, sprintf('%.1f°C', v));
	}
	if (length(temps)) push(out, '温度：' + join(' / ', temps));

	let df = sh("df -h / /overlay /tmp 2>/dev/null | grep -v '^Filesystem'");
	if (length(trim(df.out))) {
		push(out, '存储（文件系统 大小 已用 可用 使用率 挂载点）：');
		for (let l in split(trim(df.out), '\n')) push(out, '  ' + l);
	}
	return join('\n', out);
};

T.net_speed = function(a) {
	let secs = +a.seconds || 2;
	if (secs < 1) secs = 1;
	if (secs > 10) secs = 10;
	let r = sh(sprintf('cat /proc/net/dev; echo @@@; sleep %d; cat /proc/net/dev', secs));
	let halves = split(r.out, '@@@');
	if (length(halves) < 2) die('采样失败');
	function parse(txt) {
		let o = {};
		for (let l in split(txt, '\n')) {
			let mm = match(l, /^\s*([A-Za-z0-9._@-]+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
			if (mm) o[mm[1]] = { rx: +mm[2], tx: +mm[3] };
		}
		return o;
	}
	let s1 = parse(halves[0]), s2 = parse(halves[1]);
	let rows = [];
	for (let k, d in s2) {
		if (k == 'lo' || (a.interface && k != a.interface)) continue;
		let o = s1[k] ?? d;
		push(rows, { k, rx: (d.rx - o.rx) / secs, tx: (d.tx - o.tx) / secs, total_rx: d.rx, total_tx: d.tx });
	}
	rows = sort(rows, (x, y) => (y.rx + y.tx) - (x.rx + x.tx));
	let out = [sprintf('各接口实时速率（%d 秒平均，↓接收 ↑发送 | 开机以来累计）：', secs)];
	for (let x in rows)
		push(out, sprintf('%s  ↓%s/s ↑%s/s | 累计 ↓%s ↑%s', x.k, fmt_bytes(x.rx), fmt_bytes(x.tx), fmt_bytes(x.total_rx), fmt_bytes(x.total_tx)));
	return join('\n', out);
};

T.device_list = function() {
	let arp = {};
	for (let l in split(readfile('/proc/net/arp') ?? '', '\n')) {
		let mm = match(l, /^(\d+\.\d+\.\d+\.\d+)\s+\S+\s+(0x\S+)\s+([0-9a-fA-F:]{17})\s+\S+\s+(\S+)/);
		if (mm && mm[3] != '00:00:00:00:00:00' && mm[2] != '0x0')
			arp[lc(mm[3])] = { ip: mm[1], dev: mm[4] };
	}
	let names = {};
	for (let l in split(readfile('/etc/ethers') ?? '', '\n')) {
		let mm = match(l, /^([0-9a-fA-F:]{17})\s+(\S+)/);
		if (mm) names[lc(mm[1])] = mm[2];
	}
	let out = ['设备列表（● 在线 ○ 离线 | IP | MAC | 名称 | 接口）：'], seen = {};
	for (let l in split(trim(readfile('/tmp/dhcp.leases') ?? ''), '\n')) {
		let p = split(l, ' ');
		if (length(p) < 4) continue;
		let mac = lc(p[1]);
		seen[mac] = 1;
		push(out, sprintf('%s %s | %s | %s | %s', arp[mac] ? '●' : '○', p[2], mac,
			p[3] != '*' ? p[3] : (names[mac] ?? '(未知)'), arp[mac]?.dev ?? '-'));
	}
	for (let mac, e in arp) {
		if (seen[mac]) continue;
		push(out, sprintf('● %s | %s | %s | %s', e.ip, mac, names[mac] ?? '(静态 IP / 无 DHCP 记录)', e.dev));
	}
	return join('\n', out);
};

T.network_info = function() {
	let out = [];
	for (let ifc in ['wan', 'wan6']) {
		let r = sh(sprintf('ubus call network.interface.%s status', ifc));
		let d = null;
		try { d = json(r.out); } catch (e) {}
		if (type(d) != 'object') continue;
		push(out, sprintf('%s：%s，协议 %s，设备 %s', ifc, d.up ? '已连接' : '未连接', d.proto ?? '?', d.l3_device ?? d.device ?? '?'));
		for (let x in (d['ipv4-address'] ?? [])) push(out, '  IPv4：' + x.address + '/' + x.mask);
		for (let x in (d['ipv6-address'] ?? [])) push(out, '  IPv6：' + x.address + '/' + x.mask);
		for (let x in (d.route ?? [])) if (x.target == '0.0.0.0' || x.target == '::') push(out, '  网关：' + x.nexthop);
		if (length(d['dns-server'] ?? [])) push(out, '  DNS：' + join(' ', d['dns-server']));
		if (d.uptime) push(out, sprintf('  已连接 %d 小时 %d 分', d.uptime / 3600, (d.uptime % 3600) / 60));
	}
	if (!length(out)) push(out, '（无法通过 ubus 读取 WAN 状态）');
	push(out, '== 接口地址 ==');
	push(out, trim_nl(sh("ip -o -4 addr show | awk '{print $2, $4}'; ip -o -6 addr show scope global | awk '{print $2, $4}'").out));
	push(out, '== 默认路由 ==');
	push(out, trim_nl(sh('ip route show default; ip -6 route show default').out));
	return join('\n', out);
};

/* ---------------- 服务 / 重启 ---------------- */

function valid_service(name) {
	if (!match(name ?? '', /^[A-Za-z0-9_.-]+$/)) die('非法服务名：' + name);
	if (!stat(conf().init_dir + '/' + name)) die('服务不存在：' + name + '（用 list_services 查看）');
}

T.list_services = function() {
	let dir = conf().init_dir;
	let r = sh(sprintf("cd %s && for s in *; do [ -x \"$s\" ] || continue; if ./\"$s\" enabled >/dev/null 2>&1; then e=是; else e=否; fi; if ./\"$s\" running >/dev/null 2>&1; then u=运行中; else u=-; fi; echo \"$s | $e | $u\"; done", shq(dir)));
	return '服务（名称 | 开机自启 | 运行状态，部分服务不支持状态查询显示 -）：\n' + trim_nl(r.out);
};

T.service_control = function(a) {
	valid_service(a.name);
	if (index(['restart', 'start', 'stop', 'reload', 'enable', 'disable'], a.action) < 0)
		die('action 只能是 restart / start / stop / reload / enable / disable');
	if (a.name == 'claude-mcp' && index(['stop', 'disable'], a.action) >= 0)
		die('停止或禁用 claude-mcp 会让我立刻失去连接，且无法远程恢复。如确实需要，请在路由器终端手动执行。');

	let cmd = sprintf('%s/%s %s', conf().init_dir, a.name, a.action);
	const slow = { network: 1, firewall: 1, openclash: 1, 'claude-mcp': 1, dnsmasq: 1, uhttpd: 1, odhcpd: 1 };
	if (slow[a.name] && index(['restart', 'stop', 'reload', 'start'], a.action) >= 0) {
		sh(sprintf("nohup sh -c 'sleep 1; %s' >/dev/null 2>&1 </dev/null &", cmd));
		return sprintf('已在后台执行：%s。这类服务会短暂影响网络或本次连接，等 10–30 秒后再查看状态。', cmd);
	}
	let r = sh(cmd);
	return sprintf('%s → %s%s', cmd, r.code == 0 ? '完成' : '失败（退出码 ' + r.code + '）', length(trim(r.out)) ? '\n' + trim(r.out) : '');
};

T.reboot_router = function(a) {
	if (a.confirm !== true)
		die('重启会让整个网络中断约 1–3 分钟。请先征得用户同意，再以 confirm=true 调用。');
	sh("nohup sh -c 'sleep 3; reboot' >/dev/null 2>&1 </dev/null &");
	return '路由器将在 3 秒后重启，约 1–3 分钟后恢复。重启后连接器会自动重连，地址不变。';
};

/* ---------------- 防火墙 / 端口转发 ---------------- */

T.firewall_overview = function() {
	let U = conf().uci;
	let r = sh(U + ' -q show firewall');
	let secs = {}, order = [];
	for (let l in split(r.out, '\n')) {
		let mm = match(l, /^firewall\.([^.=]+)=(\S+)$/);
		if (mm) { secs[mm[1]] = { _type: mm[2] }; push(order, mm[1]); continue; }
		mm = match(l, /^firewall\.([^.=]+)\.([^=]+)=(.*)$/);
		if (mm && secs[mm[1]]) secs[mm[1]][mm[2]] = replace(mm[3], /'/g, '');
	}
	let out = { zone: [], forwarding: [], redirect: [], rule: [] };
	for (let i = 0; i < length(order); i++) {
		let id = order[i], s = secs[id], ref = sprintf('firewall.%s', id);
		switch (s._type) {
		case 'zone':
			push(out.zone, sprintf('%s：入站 %s / 出站 %s / 转发 %s，网络 %s%s  [%s]', s.name ?? '?', s.input ?? '-', s.output ?? '-', s.forward ?? '-', s.network ?? '-', s.masq == '1' ? '，NAT' : '', ref));
			break;
		case 'forwarding':
			push(out.forwarding, sprintf('%s → %s  [%s]', s.src ?? '?', s.dest ?? '?', ref));
			break;
		case 'redirect':
			push(out.redirect, sprintf('%s%s：%s %s 端口 %s → %s:%s  [%s]', s.enabled == '0' ? '（已停用）' : '', s.name ?? '(未命名)', s.src ?? 'wan', s.proto ?? 'tcp udp', s.src_dport ?? '?', s.dest_ip ?? '?', s.dest_port ?? s.src_dport ?? '', ref));
			break;
		case 'rule':
			push(out.rule, sprintf('%s%s：%s→%s %s %s → %s  [%s]', s.enabled == '0' ? '（已停用）' : '', s.name ?? '(未命名)', s.src ?? '*', s.dest ?? '本机', s.proto ?? '', s.dest_port ? '端口 ' + s.dest_port : '', s.target ?? '?', ref));
			break;
		}
	}
	return join('\n', [
		'== 区域 ==', ...out.zone,
		'== 区域转发 ==', ...out.forwarding,
		'== 端口转发 ==', ...(length(out.redirect) ? out.redirect : ['（无）']),
		'== 通信规则 ==', ...out.rule,
		'',
		'添加端口转发可用 uci_set：op=add config=firewall value=redirect，再 set firewall.@redirect[-1].name/src/src_dport/dest/dest_ip/dest_port/proto，reload=firewall。'
	]);
};

/* ---------------- 通用 uci ---------------- */

const KEY_RE = /^[a-z0-9_-]+(\.(@[A-Za-z0-9_-]+\[-?[0-9]+\]|[A-Za-z0-9_-]+)){0,2}$/;
const SECRET_RE = /(key|pass|secret|token|psk)/i;
const BACKUP_DIR = '/etc/claude-mcp/uci-backup';

T.uci_show = function(a) {
	if (a.config == null)
		return '配置文件列表：\n' + trim_nl(sh('ls ' + (conf().uci_dir || '/etc/config')).out) +
			'\n\n用 config=<名称> 查看，常用：network（网络/接口）、wireless（Wi-Fi）、dhcp（DHCP/DNS）、firewall（防火墙）、system（系统）';
	let k = a.config + (a.key ? '.' + a.key : '');
	if (index(a.key ?? '', a.config + '.') == 0) k = a.key;
	if (!match(k, KEY_RE)) die('非法配置名或 key：' + k);
	let r = sh(sprintf('%s show %s', conf().uci, shq(k)));
	if (r.code != 0) die('读取失败：' + trim(r.out));
	return length(trim(r.out)) ? r.out : '（空）';
};

T.uci_set = function(a) {
	let ops = a.operations;
	if (type(ops) != 'array' || !length(ops)) die('operations 必须是非空数组');
	let U = conf().uci, cfgs = {}, log = [];

	for (let op in ops) {
		let k = op.op == 'add' ? (op.config ?? '') : (op.key ?? '');
		if (!match(k, KEY_RE)) die('非法 key：' + k);
		if (op.op != 'add' && !match(k, /\./)) die('key 需要包含配置名和节名，如 wireless.@wifi-iface[0].ssid：' + k);
		cfgs[split(k, '.')[0]] = 1;
	}
	if (cfgs['claude-mcp']) die('不允许通过本工具修改 claude-mcp 自身配置');

	mkdir('/etc/claude-mcp');
	mkdir(BACKUP_DIR);
	let stamp = now_str();
	for (let c in cfgs) {
		let e = sh(sprintf('%s export %s', U, shq(c)));
		if (e.code == 0) writefile(sprintf('%s/%s.%s', BACKUP_DIR, c, stamp), e.out);
	}

	for (let op in ops) {
		let k = op.key, v = op.value ?? '', cmd;
		switch (op.op) {
		case 'set':      cmd = sprintf('%s set %s', U, shq(k + '=' + v)); break;
		case 'add_list': cmd = sprintf('%s add_list %s', U, shq(k + '=' + v)); break;
		case 'del_list': cmd = sprintf('%s del_list %s', U, shq(k + '=' + v)); break;
		case 'delete':   cmd = sprintf('%s delete %s', U, shq(k)); break;
		case 'rename':   cmd = sprintf('%s rename %s', U, shq(k + '=' + v)); break;
		case 'add':
			if (!match(v, /^[A-Za-z0-9_-]+$/)) die('add 需要 value=节类型，如 redirect、rule、host');
			k = op.config;
			cmd = sprintf('%s add %s %s', U, shq(k), shq(v));
			break;
		default:
			die('不支持的操作：' + op.op);
		}
		let r = sh(cmd);
		let shown = (match(k, SECRET_RE) && op.op != 'add') ? '******' : v;
		push(log, sprintf('%s %s %s → %s', op.op, k, shown, r.code == 0 ? ('成功' + (length(trim(r.out)) ? '：' + trim(r.out) : '')) : '失败：' + trim(r.out)));
		if (r.code != 0) {
			for (let c in cfgs) sh(U + ' revert ' + shq(c));
			die('操作失败，已撤销本次全部修改：\n' + join('\n', log));
		}
	}

	if (a.commit === false) {
		push(log, '已暂存未提交（可用 uci_show 检查；再次调用 commit=true 提交，或 uci_revert 放弃）');
		return join('\n', log);
	}
	for (let c in cfgs) sh(U + ' commit ' + shq(c));
	push(log, sprintf('已提交 %s，修改前的备份在 %s/<配置>.%s', join('、', keys(cfgs)), BACKUP_DIR, stamp));

	const RELOAD = {
		network: '/etc/init.d/network reload',
		firewall: '/etc/init.d/firewall reload',
		dhcp: '/etc/init.d/dnsmasq restart; /etc/init.d/odhcpd restart',
		wireless: 'wifi reload',
		system: '/etc/init.d/system reload',
	};
	if (a.reload) {
		let cmd = RELOAD[a.reload];
		if (!cmd) die('reload 只能是：' + join(' / ', keys(RELOAD)));
		sh(sprintf("nohup sh -c 'sleep 1; %s' >/dev/null 2>&1 </dev/null &", cmd));
		push(log, '已在后台执行：' + cmd + (a.reload == 'network' || a.reload == 'wireless' ? '（网络 / Wi-Fi 会短暂中断）' : ''));
	} else
		push(log, '注意：修改已保存但尚未生效，需要 reload（network / firewall / dhcp / wireless / system）或 service_control 重启相关服务。');
	return join('\n', log);
};

T.uci_revert = function(a) {
	if (!match(a.config ?? '', /^[a-z0-9_-]+$/)) die('需要 config');
	sh(conf().uci + ' revert ' + shq(a.config));
	return '已放弃 ' + a.config + ' 未提交的修改';
};

T.uci_backups = function(a) {
	if (a.restore) {
		if (!match(a.restore, /^[a-z0-9_-]+\.[0-9]{8}-[0-9]{6}$/)) die('restore 格式应为 <配置>.<时间>，如 network.20261027-235000');
		let f = BACKUP_DIR + '/' + a.restore;
		if (!stat(f)) die('备份不存在：' + f);
		let c = split(a.restore, '.')[0];
		let r = sh(sprintf('%s import %s < %s && %s commit %s', conf().uci, shq(c), shq(f), conf().uci, shq(c)));
		if (r.code != 0) die('还原失败：' + trim(r.out));
		return sprintf('已把 %s 还原为 %s 的备份。还需 reload 对应服务才生效。', c, a.restore);
	}
	let r = sh(sprintf('ls -1t %s 2>/dev/null | head -n 40', shq(BACKUP_DIR)));
	return length(trim(r.out)) ? '配置备份（新→旧，用 restore=<名称> 还原）：\n' + trim_nl(r.out) : '还没有配置备份';
};

/* ---------------- 日志 / 软件包 ---------------- */

T.system_log = function(a) {
	let n = +a.lines || 80;
	if (n > 500) n = 500;
	let cmd = 'logread';
	if (a.filter) cmd += ' | grep -i -- ' + shq(a.filter);
	cmd += ' | tail -n ' + n;
	let r = sh(cmd);
	if (!length(trim(r.out))) r = sh('dmesg | tail -n ' + n);
	return length(trim(r.out)) ? r.out : '（没有日志）';
};

function pkgmgr() {
	if (length(trim(sh('command -v apk').out))) return 'apk';
	if (length(trim(sh('command -v opkg').out))) return 'opkg';
	die('没有找到 opkg 或 apk');
}

T.packages = function(a) {
	let pm = pkgmgr(), act = a.action ?? 'list', name = a.name ?? '';
	if (length(name) && !match(name, /^[A-Za-z0-9_.+-]+$/)) die('非法包名');
	let cmd;
	switch (act) {
	case 'list':
		cmd = pm == 'apk' ? 'apk info -v' : 'opkg list-installed';
		if (length(name)) cmd += ' | grep -i -- ' + shq(name);
		break;
	case 'search':
		if (!length(name)) die('search 需要 name');
		cmd = pm == 'apk' ? 'apk update >/dev/null 2>&1; apk search -d ' + shq(name) : 'opkg update >/dev/null 2>&1; opkg find ' + shq('*' + name + '*');
		break;
	case 'upgradable':
		cmd = pm == 'apk' ? 'apk update >/dev/null 2>&1; apk version -l "<"' : 'opkg update >/dev/null 2>&1; opkg list-upgradable';
		break;
	case 'install':
	case 'remove':
		if (!length(name)) die(act + ' 需要 name');
		if (act == 'remove' && match(name, /^(base-files|busybox|kernel|libc|procd|ubus|uci|ucode|uhttpd|curl|cloudflared|dropbear|firewall4?|netifd|opkg|apk-tools)$/))
			die('为避免系统损坏或失去连接，不允许通过本工具卸载 ' + name);
		cmd = pm == 'apk'
			? (act == 'install' ? 'apk update >/dev/null 2>&1; apk add ' : 'apk del ') + shq(name)
			: (act == 'install' ? 'opkg update >/dev/null 2>&1; opkg install ' : 'opkg remove ') + shq(name);
		break;
	default:
		die('action 只能是 list / search / upgradable / install / remove');
	}
	let r = sh(cmd);
	let out = r.out;
	if (length(out) > 30000) out = substr(out, 0, 30000) + '\n……（输出过长已截断）';
	return sprintf('[%s] %s（退出码 %d）\n%s', pm, act, r.code, out);
};

/* ---------------- 高级：命令行 ---------------- */

T.run_command = function(a) {
	if (conf().allow_shell === false) die('命令行功能已在路由器上关闭（claude-mcp shell on 可开启）');
	if (type(a.command) != 'string' || !length(trim(a.command))) die('缺少 command');
	let t = +a.timeout || 30;
	if (t < 1) t = 1;
	if (t > 110) t = 110;
	let has_to = length(trim(sh('command -v timeout').out)) > 0;
	let r = sh(has_to ? sprintf('timeout %d sh -c %s', t, shq(a.command)) : 'sh -c ' + shq(a.command));
	let out = r.out;
	if (length(out) > 40000) out = substr(out, 0, 40000) + '\n……（输出过长已截断）';
	return sprintf('退出码 %d%s\n%s', r.code, r.code == 124 || r.code == 143 ? '（超时被终止）' : '', out);
};

/* ---------------- 手机面板用的结构化接口 ---------------- */

function read_ifbytes(dev) {
	for (let l in split(readfile('/proc/net/dev') ?? '', '\n')) {
		let m = match(l, /^\s*([A-Za-z0-9._@-]+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
		if (m && m[1] == dev) return { rx: +m[2], tx: +m[3] };
	}
	return null;
}


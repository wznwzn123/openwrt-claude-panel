function rpc_result(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpc_error(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

function handle(msg) {
	if (type(msg) != 'object' || msg.jsonrpc != '2.0' || type(msg.method) != 'string')
		return rpc_error(msg?.id ?? null, -32600, 'Invalid Request');

	let id = msg.id, p = msg.params ?? {};
	let is_notification = !exists(msg, 'id');

	// 连接器地址：只给 AI 用，不能调面板接口
	if (MODE == 'ai' && substr(msg.method, 0, 6) == 'panel/')
		return is_notification ? null : rpc_error(id, -32001, '这是 AI 连接器地址，不能用来打开面板');
	// 官网「打开面板」的入口：只能拿票换手机钥匙
	if (MODE == 'open') {
		// 6.0：手机不再存登录密钥，输登录码（官网的或应急的）也从这里进；登录码 8 位、10 分钟最多错 10 次
		if (msg.method != 'panel/open_login' && msg.method != 'panel/device_approve') return is_notification ? null : rpc_error(id, -32601, 'not found');
		try { return rpc_result(id, msg.method == 'panel/open_login' ? P.open_login(p) : P.device_approve(p)); }
		catch (e) { return rpc_error(id, -32000, type(e) == 'object' ? e.message : '' + e); }
	}
	// 6.0 第 82 项：家里局域网（:906）登录：只能用原版后台给的票，或者输路由器后台密码换手机钥匙（只认局域网来的请求）
	if (MODE == 'lan') {
		if (msg.method != 'panel/lan_open' && msg.method != 'panel/lan_pw') return is_notification ? null : rpc_error(id, -32601, 'not found');
		try { return rpc_result(id, msg.method == 'panel/lan_open' ? P.lan_open(p) : P.lan_pw(p)); }
		catch (e) { return rpc_error(id, -32000, type(e) == 'object' ? e.message : '' + e); }
	}
	// 6.0 第 6 项：通行证地址。只有「拿手机钥匙换通行证」不用带通行证；别的请求都要带，并且只给手机面板用
	if (MODE == 'pass') {
		if (msg.method == 'panel/pass_new') return is_notification ? null : pass_new_rpc(id, p);
		if (!pass_ok(msg.pass)) return is_notification ? null : { jsonrpc: '2.0', id, error: { code: -32013, message: '通行证过期了' } };
		if (msg.client != 'panel') return is_notification ? null : rpc_error(id, -32001, '这个地址只给手机面板用');
	}
	// 自建版开了「登录要输路由器密码」（第 12 项）：登录地址只能用来换手机钥匙，不能直接操作路由器
	// （路由器自己的小工具带 local. 钥匙照常；AI 用单独的连接器地址，不受影响）
	if (MODE == 'token' && !NEED_DEV && login_pw_on() && msg.method != 'panel/pass_login' && !(type(msg.dev) == 'string' && dev_ok(msg.dev)))
		return is_notification ? null : { jsonrpc: '2.0', id, error: { code: -32015, message: msg.client == 'panel' ? '这台路由器开了「登录要输路由器后台密码」：输一下路由器后台（root）密码' : '这台路由器开了「登录要输路由器后台密码」，登录地址不能直接用。AI 请用「我的主页 → 敏感信息」里的 AI 连接器地址' } };
	// 托管版的登录密钥地址：每个请求都要带上这台手机的钥匙（从官网打开面板时拿到的）
	if (MODE == 'token' && NEED_DEV && msg.method != 'panel/device_approve' && !dev_ok(msg.dev)) {
		if (is_notification) return null;
		let h = hub_conf(true)?.HUB ?? null;
		return { jsonrpc: '2.0', id, error: { code: -32010,
			message: msg.client == 'panel'
				? '这台手机还没登录：从官网「我的路由器」点「打开面板」进来'
				: '托管版的 AI 连接器要用单独的「AI 连接器地址」：在手机面板「我的主页 → 敏感信息」（验证后）的「AI 连接器地址」里复制，然后在 AI 应用里把这个连接器删掉，用新地址重新添加',
			data: { need_code: true, hub: h } } };
	}
	// 主账号 / 子账号：按这台手机属于哪个账号检查权限
	if (NEED_DEV && DEV) { // 托管版：登录密钥地址（旧手机）和通行证地址都按账号查权限
		let why = fam_check();
		if (why) {
			if (is_notification) return null;
			return { jsonrpc: '2.0', id, error: { code: DEV ? -32011 : -32010, message: why, data: { need_code: !DEV, hub: hub_conf(true)?.HUB ?? null } } };
		}
		let m = msg.method == 'tools/call' ? 'tools:' + (p.name ?? '') : substr(msg.method, 0, 6) == 'panel/' ? substr(msg.method, 6) : null;
		if (m && !fam_allowed(m, p)) return is_notification ? null : rpc_error(id, -32012, fam_deny_msg(m, p));
	}
	// 6.0 第 94 项：托管服务到期 / 停用：只留看状态、输续期码
	{ let why = svc_gate(msg, p); if (why) return is_notification ? null : { jsonrpc: '2.0', id, error: { code: -32016, message: why, data: { svc_off: true } } }; }
	// 纯面板版（config.json 里 "ai": false）：只接受手机面板的请求，AI 客户端连不上
	if (conf().ai === false && msg.client != 'panel')
		return is_notification ? null : rpc_error(id, -32001, '这台路由器装的是纯面板版，没有开启 AI 连接器');

	if (substr(msg.method, 0, 6) == 'panel/') {
		let fn = P[substr(msg.method, 6)];
		if (type(fn) != 'function') return rpc_error(id, -32601, '面板接口不存在：' + msg.method);
		ERR_CODE = null;
		try { return rpc_result(id, fn(p)); }
		catch (e) { return rpc_error(id, ERR_CODE ?? -32000, type(e) == 'object' ? e.message : '' + e); }
	}

	switch (msg.method) {
	case 'initialize':
		return rpc_result(id, {
			protocolVersion: index(PROTOCOLS, p.protocolVersion) >= 0 ? p.protocolVersion : PROTOCOLS[1],
			capabilities: { tools: { listChanged: false } },
			serverInfo: { name: 'openwrt-router', title: '我的路由器', version: VERSION },
			instructions: '这是用户家里 OpenWrt 路由器（可能装有 OpenClash、OAF 应用过滤等插件，先用工具查看实际情况）的完整管理工具，可查看状态、设备、网速，控制服务，读写任意 uci 配置，执行命令。断网类操作（改 network/firewall、重启路由器或网络、停止服务）一旦出错，用户会失去网络、你也会失去连接，执行前必须说明影响并得到用户确认。修改规则前先 get_custom_rules 读取原文件并在其基础上修改；节点名必须用 list_proxy_groups 返回的准确名称（含国旗和空格）。set_custom_rules / restart_openclash 会让网络中断 10–30 秒，执行前告诉用户。' +
				(MODE == 'ai' || msg.client != 'panel' ? (ai_mode() == 'ro' ? '\n现在是「只读」：只能查看，不能修改；命令行只能跑只看的命令（cat、ls、logread、uci show 等，不能用 ; & $ > <）。' : ai_mode() == 'ask' ? '\n重启、改设置、装卸软件、改规则、执行会改东西的命令，要用户先在手机上点「允许」：工具会推送到手机并等 30 秒，等不到会告诉你，等用户确认后原样再调用一次。只看的命令（cat、ls、logread、uci show 等）直接执行。' : '') : '')
		});
	case 'ping':
		return rpc_result(id, {});
	case 'tools/list':
	{
		// 6.0 第 11 项：AI「只读」时只列出查看类的工具（命令行留着，只能跑只看的命令）
		let ro = MODE == 'ai' || msg.client != 'panel' ? ai_mode() == 'ro' : false;
		return rpc_result(id, { tools: filter(TOOLS, (t) => !(t.name == 'run_command' && conf().allow_shell === false) && (!ro || t.name == 'run_command' || AI_READ[t.name] || t.name == 'packages' || t.name == 'uci_backups')) });
	}
	case 'tools/call': {
		let fn = T[p.name];
		if (!fn)
			return rpc_error(id, -32602, '未知工具：' + p.name);
		AI_STOP = false;
		try {
			// 6.0 第 11 项：AI 连接器（和不是手机面板的客户端）做危险操作要先在手机上确认
			if (MODE == 'ai' || msg.client != 'panel') ai_gate(p.name, p.arguments ?? {});
			let text = fn(p.arguments ?? {});
			return rpc_result(id, { content: [{ type: 'text', text: '' + text }] });
		} catch (e) {
			let m = type(e) == 'object' ? e.message : '' + e;
			return rpc_result(id, { content: [{ type: 'text', text: (AI_STOP ? '' : '出错：') + m }], isError: true });
		}
	}
	default:
		if (is_notification || match(msg.method, /^notifications\//))
			return null;
		return rpc_error(id, -32601, 'Method not found: ' + msg.method);
	}
}

function reply(status, body, extra) {
	print('Status: ' + status + '\r\n');
	print('Cache-Control: no-store\r\n');
	if (extra) print(extra);
	if (body != null) {
		print('Content-Type: application/json\r\n\r\n');
		print(sprintf('%J', body));
	} else
		print('Content-Length: 0\r\n\r\n');
}

/* 记录每个请求在路由器上花了多久（排查「面板慢」用），只留最近的 */
function reqlog(msg, t0, r) {
	try {
		let t1 = clock(true), ms = ((t1[0] - t0[0]) * 1000000000 + (t1[1] - t0[1])) / 1000000;
		let m = msg?.method ?? '?';
		if (m == 'tools/call') m += ':' + (msg.params?.name ?? '');
		let lf = '/tmp/cmcp_req.log', st = stat(lf);
		if (st && st.size > 65536) rename(lf, lf + '.1');  // 请求记录在内存里：最多两份各 64 KB
		let h = fs_open(lf, 'a');
		if (h) { h.write(sprintf('%d %s %d %s\n', time(), m, ms, r?.error ? 'ERR' : 'ok')); h.close(); }
	} catch (e) {}
}


function main() {
	let c = conf();
	let token = c.token ?? '', ckey = c.ckey ?? '';
	let path = getenv('PATH_INFO') ?? '';

	if (c.ai !== false && length(ckey) >= 16 && path == '/' + ckey)
		MODE = 'ai';
	else if (path == '/open' && is_hosted())
		MODE = 'open';
	else if (path == '/pass')
		MODE = 'pass';
	else if (path == '/lan')
		MODE = 'lan';
	else if (length(token) < 16 || path != '/' + token) {
		reply('404 Not Found', { error: 'not found' });
		return;
	}
	NEED_DEV = (MODE == 'token' || MODE == 'pass') && is_hosted();

	let method = getenv('REQUEST_METHOD') ?? 'GET';
	if (method == 'GET' || method == 'HEAD') {
		reply('405 Method Not Allowed', null, 'Allow: POST, DELETE\r\n');
		return;
	}
	if (method == 'DELETE') {
		reply('200 OK', null);
		return;
	}
	if (method != 'POST') {
		reply('405 Method Not Allowed', null, 'Allow: POST\r\n');
		return;
	}

	let len = +(getenv('CONTENT_LENGTH') ?? 0);
	if (len <= 0 || len > 4 * 1024 * 1024) {
		reply('400 Bad Request', rpc_error(null, -32700, 'Empty or oversized body'));
		return;
	}
	let body = '';
	while (length(body) < len) {
		let chunk = stdin.read(len - length(body));
		if (chunk == null || !length(chunk)) break;
		body += chunk;
	}

	let msg = null;
	try { msg = json(body); } catch (e) {
		reply('400 Bad Request', rpc_error(null, -32700, 'Parse error'));
		return;
	}

	if (type(msg) == 'array') {
		let res = [];
		for (let m in msg) {
			let r = handle(m);
			if (r != null) push(res, r);
		}
		if (length(res)) reply('200 OK', res); else reply('202 Accepted', null);
		return;
	}

	let t0 = clock(true);
	let r = handle(msg);
	if (r == null)
		reply('202 Accepted', null);
	else
		reply('200 OK', r);
	reqlog(msg, t0, r);
}

main();

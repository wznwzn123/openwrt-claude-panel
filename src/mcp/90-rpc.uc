function rpc_result(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpc_error(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

function handle(msg) {
	if (type(msg) != 'object' || msg.jsonrpc != '2.0' || type(msg.method) != 'string')
		return rpc_error(msg?.id ?? null, -32600, 'Invalid Request');

	let id = msg.id, p = msg.params ?? {};
	let is_notification = !exists(msg, 'id');

	// 连接器地址：只给 AI 用，不能调面板接口
	if (MODE == 'ai' && substr(msg.method, 0, 6) == 'panel/')
		return is_notification ? null : rpc_error(id, -32001, '这是 Claude 连接器地址，不能用来打开面板');
	// 托管版的登录密钥地址：每个请求都要带上这台手机的钥匙（输对登录码以后拿到的）
	if (MODE == 'token' && NEED_DEV && msg.method != 'panel/device_approve' && !dev_ok(msg.dev)) {
		if (is_notification) return null;
		let h = hub_conf(true)?.HUB ?? null;
		return { jsonrpc: '2.0', id, error: { code: -32010,
			message: msg.client == 'panel'
				? '这台手机还没登录：托管版每台手机第一次打开面板要输一次登录码'
				: '托管版的 Claude 连接器要用单独的「Claude 连接器地址」：在手机面板「系统操作 → Claude 连接器地址」里复制，然后在 Claude 里把这个连接器删掉，用新地址重新添加',
			data: { need_code: true, hub: h } } };
	}
	// 纯面板版（config.json 里 "ai": false）：只接受手机面板的请求，Claude 等 AI 客户端连不上
	if (conf().ai === false && msg.client != 'panel')
		return is_notification ? null : rpc_error(id, -32001, '这台路由器装的是纯面板版，没有开启 AI 连接器');

	if (substr(msg.method, 0, 6) == 'panel/') {
		let fn = P[substr(msg.method, 6)];
		if (type(fn) != 'function') return rpc_error(id, -32601, '面板接口不存在：' + msg.method);
		try { return rpc_result(id, fn(p)); }
		catch (e) { return rpc_error(id, -32000, type(e) == 'object' ? e.message : '' + e); }
	}

	switch (msg.method) {
	case 'initialize':
		return rpc_result(id, {
			protocolVersion: index(PROTOCOLS, p.protocolVersion) >= 0 ? p.protocolVersion : PROTOCOLS[1],
			capabilities: { tools: { listChanged: false } },
			serverInfo: { name: 'openwrt-router', title: '我的路由器', version: VERSION },
			instructions: '这是用户家里 OpenWrt 路由器（可能装有 OpenClash、OAF 应用过滤等插件，先用工具查看实际情况）的完整管理工具，可查看状态、设备、网速，控制服务，读写任意 uci 配置，执行命令。断网类操作（改 network/firewall、重启路由器或网络、停止服务）一旦出错，用户会失去网络、你也会失去连接，执行前必须说明影响并得到用户确认。修改规则前先 get_custom_rules 读取原文件并在其基础上修改；节点名必须用 list_proxy_groups 返回的准确名称（含国旗和空格）。set_custom_rules / restart_openclash 会让网络中断 10–30 秒，执行前告诉用户。'
		});
	case 'ping':
		return rpc_result(id, {});
	case 'tools/list':
		return rpc_result(id, { tools: filter(TOOLS, (t) => !(t.name == 'run_command' && conf().allow_shell === false)) });
	case 'tools/call': {
		let fn = T[p.name];
		if (!fn)
			return rpc_error(id, -32602, '未知工具：' + p.name);
		try {
			let text = fn(p.arguments ?? {});
			return rpc_result(id, { content: [{ type: 'text', text: '' + text }] });
		} catch (e) {
			let m = type(e) == 'object' ? e.message : '' + e;
			return rpc_result(id, { content: [{ type: 'text', text: '出错：' + m }], isError: true });
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
	else if (length(token) < 16 || path != '/' + token) {
		reply('404 Not Found', { error: 'not found' });
		return;
	}
	NEED_DEV = MODE == 'token' && is_hosted();

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

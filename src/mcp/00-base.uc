#!/usr/bin/ucode
// Claude 路由器连接器 (MCP over HTTP, CGI)
// 运行在 OpenWrt 自带的 ucode + uhttpd 上，无需安装额外运行环境。
'use strict';

import { readfile, writefile, popen, stat, stdin, rename, mkdir, open as fs_open } from 'fs';
import * as CL from 'cmcp.lib';

const VERSION = '2.2.0';
const CONF_PATH = getenv('CLAUDE_MCP_CONF') || '/etc/claude-mcp/config.json';
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
// 改设置前留的备份（/etc/claude-mcp/bak）：最多 40 份；加起来超过 4 MB（闪存剩不到 16 MB 时 1 MB）就从最旧的删，最新 5 份一定留着
const BAK_PRUNE = 'cd /etc/claude-mcp/bak 2>/dev/null && { ls -1t | sed -n "41,\\$p" | while read f; do rm -f "$f"; done; fr=$(df -k . 2>/dev/null | tail -n 1 | awk \'{print $(NF-2)}\'); cap=4096; [ "${fr:-99999}" -lt 16384 ] 2>/dev/null && cap=1024; n=0; t=0; ls -1t | while read f; do [ -f "$f" ] || continue; n=$((n+1)); t=$((t+($(wc -c < "$f")+1023)/1024)); [ $n -gt 5 ] && [ $t -gt $cap ] && rm -f "$f"; done; }';

/* ---------------- 基础工具 ---------------- */

function shq(s) {
	return "'" + replace('' + s, "'", "'\\''") + "'";
}

function sh(cmd) {
	let p = popen('export PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH; ' + cmd + ' 2>&1', 'r');
	if (!p)
		return { code: -1, out: '' };
	let out = p.read('all') ?? '';
	let code = p.close();
	return { code, out };
}

function trim_nl(s) {
	return rtrim(s ?? '', '\r\n');
}

function urlenc(s) {
	let o = '';
	s = '' + s;
	for (let i = 0; i < length(s); i++) {
		let c = ord(s, i);
		if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ||
		    c == 45 || c == 46 || c == 95 || c == 126)
			o += chr(c);
		else
			o += sprintf('%%%02X', c);
	}
	return o;
}

function fmt_bytes(n) {
	n = +n || 0;
	if (n < 1024) return sprintf('%dB', n);
	if (n < 1048576) return sprintf('%.1fKB', n / 1024);
	if (n < 1073741824) return sprintf('%.1fMB', n / 1048576);
	return sprintf('%.2fGB', n / 1073741824);
}

function now_str() {
	let t = localtime();
	return sprintf('%04d%02d%02d-%02d%02d%02d', t.year, t.mon, t.mday, t.hour, t.min, t.sec);
}

let CONF = null;
let MODE = 'token', NEED_DEV = false; // MODE：token（登录密钥地址）或 ai（Claude 连接器地址）
function conf() {
	if (CONF)
		return CONF;
	let raw = readfile(CONF_PATH);
	CONF = (raw ? json(raw) : null) ?? {};
	CONF.uci = CONF.uci || 'uci';
	CONF.init_dir = CONF.init_dir || '/etc/init.d';
	CONF.custom_dir = CONF.custom_dir || '/etc/openclash/custom';
	CONF.openclash_log = CONF.openclash_log || '/tmp/openclash.log';
	return CONF;
}

function uci_get(key) {
	let r = sh(conf().uci + ' -q get ' + shq(key));
	return r.code == 0 ? trim_nl(r.out) : null;
}

/* ---------------- Clash / mihomo 控制接口 ---------------- */

let _ctlc = null;
function controller() {
	if (_ctlc) return _ctlc;
	let c = conf();
	let base = c.api_base, secret = c.api_secret;
	// OpenClash 或 Nikki（都是 mihomo 内核，接口一样）
	let k = (!base || secret == null) ? CL.clash_ctl() : null;
	if (!base) base = 'http://127.0.0.1:' + (k?.port ?? '9090');
	if (secret == null) secret = k?.secret ?? '';
	return (_ctlc = { base, secret });
}

function api(method, path, body, timeout) {
	let ctl = controller();
	let cmd = sprintf("curl -sS --noproxy '*' -m %d -X %s", timeout || 10, method);
	if (length(ctl.secret))
		cmd += ' -H ' + shq('Authorization: Bearer ' + ctl.secret);
	if (body != null)
		cmd += " -H 'Content-Type: application/json' --data-binary " + shq(sprintf('%J', body));
	cmd += " -w '\\n%{http_code}' " + shq(ctl.base + path);

	let r = sh(cmd);
	let out = r.out, pos = -1;
	for (let i = length(out) - 1; i >= 0; i--)
		if (ord(out, i) == 10) { pos = i; break; }

	let status = +(pos >= 0 ? substr(out, pos + 1) : out) || 0;
	let text = pos >= 0 ? substr(out, 0, pos) : '';

	if (r.code != 0 || status == 0)
		die(sprintf('无法连接 Clash 控制接口 %s（OpenClash 是否在运行？）%s', ctl.base, trim_nl(out)));

	let data = null;
	if (length(text))
		try { data = json(text); } catch (e) { data = text; }

	if (status >= 400)
		die(sprintf('Clash 接口返回 %d：%s', status,
			type(data) == 'object' ? (data.message ?? sprintf('%J', data)) : text));

	return data;
}

const GROUP_TYPES = { Selector: 1, URLTest: 1, Fallback: 1, LoadBalance: 1, Relay: 1, Smart: 1 };

function last_delay(p) {
	let h = p?.history;
	if (type(h) == 'array' && length(h))
		return h[length(h) - 1].delay;
	return null;
}

/* ---------------- 工具实现 ---------------- */


/* ---------------- 6.0 第 36 项：在外面打开路由器上其他端口的页面 ----------------
 * 用户 11/26 定：托管版多一个地址「子域名-x」（跟面板不同源），同一时间只指向一个页面，打开哪个就切过去；自建版写教程；本地版在家里直接打开。
 * 认识的页面自动列出（OpenClash / Nikki 控制面板、AdGuard Home、网页终端 ttyd），主账号也能手动加端口。
 * 打开：让官网把「子域名-x」指到这个端口（/api/dev/xtarget），路由器用 RKEY 签一张通行证（2 小时），手机拿着它进 /__cmcpx。
 * 只有主账号能用（终端就是 root；这几个方法不在任何权限组里）。
 * 测试用：CMCP_XP_ROOT（假的根目录：etc/AdGuardHome.yaml 等）、CMCP_XP_LISTEN（假装在监听的端口，空格分开）、CMCP_XP_NOW */
const XP_F = ETC + '/xpage.json', XP_ROOT = getenv('CMCP_XP_ROOT') || '';
// ---- HMAC-SHA256（固件里不一定有 openssl：用 busybox 的 sha256sum 拼出来） ----
function xp_sha(data) {
	let f = trim(sh('mktemp /tmp/cmcp_xp.XXXXXX').out);
	if (!match(f, /^\/tmp\/cmcp_xp\.[A-Za-z0-9]+$/)) die('路由器上建不了临时文件');
	writefile(f, data);
	let h = substr(trim(sh('sha256sum ' + shq(f) + '; rm -f ' + shq(f)).out ?? ''), 0, 64);
	if (!match(h, /^[0-9a-f]{64}$/)) die('算不了签名（固件没有 sha256sum）');
	return h;
}
function xp_bin(h) { let b = ''; for (let i = 0; i < 64; i += 2) b += chr(hex(substr(h, i, 2))); return b; }
function xp_hmac(key, msg) {
	if (length(key) > 64) key = xp_bin(xp_sha(key));
	let ip = '', op = '';
	for (let i = 0; i < 64; i++) { let k = i < length(key) ? ord(key, i) : 0; ip += chr(k ^ 0x36); op += chr(k ^ 0x5c); }
	return xp_sha(op + xp_bin(xp_sha(ip + msg)));
}
// ---- 认识的页面 ----
function xp_listen() {
	let e = getenv('CMCP_XP_LISTEN');
	if (e != null) { let m = {}; for (let p in split(e, ' ')) if (length(p)) m[+p] = true; return m; }
	let m = {}, t = sh('netstat -ltn 2>/dev/null || ss -ltn 2>/dev/null').out ?? '';
	for (let l in split(t, '\n')) { let x = match(l, /[:.]([0-9]+)[ \t]+[^ \t]*[ \t]*(LISTEN)?/); if (x && match(l, /LISTEN/)) m[+x[1]] = true; }
	return m;
}
function xp_found() {
	let out = [];
	// OpenClash / Nikki 控制面板：跟 Clash 控制接口同一个端口，页面在 /ui/
	if (stat(XP_ROOT + '/etc/init.d/openclash')) push(out, { id: 'oc', name: 'OpenClash 控制面板', port: +(uci_get('openclash.config.cn_port') || 9090), path: '/ui/', kind: 'clash', secret: uci_get('openclash.config.dashboard_password') ?? '' });
	if (stat(XP_ROOT + '/etc/init.d/nikki')) { let l = uci_get('nikki.mixin.api_listen') || '[::]:9090', m = match(l, /:([0-9]+)$/); push(out, { id: 'nk', name: 'Nikki 控制面板', port: m ? +m[1] : 9090, path: '/ui/', kind: 'clash', secret: uci_get('nikki.mixin.api_secret') ?? '' }); }
	// AdGuard Home：luci-app-adguardhome 的设置，或者它自己的 yaml
	if (stat(XP_ROOT + '/etc/init.d/AdGuardHome') || stat(XP_ROOT + '/etc/init.d/adguardhome')) {
		let p = +(uci_get('AdGuardHome.AdGuardHome.httpport') ?? 0);
		if (!p) for (let f in ['/etc/AdGuardHome.yaml', '/etc/adguardhome.yaml', '/etc/AdGuardHome/AdGuardHome.yaml', '/etc/adguardhome/adguardhome.yaml']) {
			let y = readfile(XP_ROOT + f);
			if (!y) continue;
			// 新版：http: 下面那段里的 address: 0.0.0.0:3000（前面可能还有 pprof 之类的）；老版：顶层 bind_port: 3000
			let inh = false;
			for (let l in split(y, '\n')) {
				if (match(l, /^http:/)) { inh = true; continue; }
				if (inh && match(l, /^[^ \t#]/)) inh = false;
				let m = inh ? match(l, /^  address:[ \t]*[^\n]*:([0-9]+)/) : match(l, /^bind_port:[ \t]*([0-9]+)/);
				if (m) { p = +m[1]; break; }
			}
			if (p) break;
		}
		push(out, { id: 'agh', name: 'AdGuard Home', port: p || 3000, path: '/' });
	}
	// 网页终端 ttyd
	if (stat(XP_ROOT + '/etc/init.d/ttyd')) {
		let t = null; for (let s in (uci_load('ttyd') ?? [])) if (s['.type'] == 'ttyd') { t = s; break; }
		push(out, { id: 'ttyd', name: '网页终端（ttyd）', port: +(t?.port ?? 7681) || 7681, path: '/', https: t?.ssl == '1' });
	}
	return out;
}
function xp_list() {
	let mine = cmcp_readj(XP_F, {})?.list ?? [], ls = xp_listen(), out = [];
	for (let x in xp_found()) push(out, { ...x, auto: true });
	for (let x in (type(mine) == 'array' ? mine : [])) push(out, { id: 'm' + x.port, name: x.name, port: +x.port, path: x.path || '/', https: !!x.https });
	for (let x in out) x.up = !!ls[x.port];
	return out;
}
function xp_mode() {
	if (!is_hosted()) return 'self';
	if (stat(ETC + '/local')) return 'local';
	return 'hosted';
}
P.xp_get = function() {
	if (ROLE != 'owner') die('只有主账号能用');
	let st = cmcp_readj(ETC + '/xpage_cur.json', {});
	return { mode: xp_mode(), list: map(xp_list(), (x) => ({ id: x.id, name: x.name, port: x.port, path: x.path, https: !!x.https, up: x.up, auto: !!x.auto })), cur: st.port ?? 0, lan: lan_addr()?.ip ?? null };
};
// a: { id }
P.xp_open = function(a) {
	if (ROLE != 'owner') die('只有主账号能用');
	let m = xp_mode();
	if (m == 'self') die('自建版要在你自己的 Cloudflare 里加一条，见教程');
	if (m == 'local') die('本地版没有隧道：在家里局域网直接打开');
	let x = null;
	if (a?.port != null) {
		// 完整原版后台里点到的「路由器:端口」页面（lfx.js 转过来）：按端口找，不认识的也能开
		let port = +a.port;
		if (!match('' + a.port, /^[0-9]+$/) || port < 1 || port > 65535 || index([18765, 22, 53, 67], port) >= 0) die('这个端口不能开');
		for (let y in xp_list()) if (y.port == port) x = y;
		x ??= { id: 'p' + port, name: '端口 ' + port, port, path: '/', https: !!a.https, up: !!xp_listen()[port] };
		let pa = '' + (a.path ?? '');
		if (x.kind != 'clash' && match(pa, /^\/[^\r\n]{0,500}$/)) x.path = pa;
	} else for (let y in xp_list()) if (y.id == '' + a?.id) x = y;
	if (!x) die('没有这个页面');
	if (!x.up) die(x.name + ' 没在运行（端口 ' + x.port + ' 没人在听）');
	let r = hub_call('/api/dev/xtarget', { port: x.port, https: !!x.https }, 30);
	if (!r.host) die('官网没回地址，稍后再试');
	cmcp_writej(ETC + '/xpage_cur.json', { port: x.port, at: time() });
	let c = hub_conf(), exp = +(getenv('CMCP_XP_NOW') || time()) + 7200, sig = xp_hmac(c.RKEY, c.SUB + '|' + x.port + '|' + exp);
	let to = x.path || '/';
	// 控制面板：告诉它接口就在这个地址（https 443），带上密钥，打开就能用
	if (x.kind == 'clash') to = sprintf('/ui/?hostname=%s&port=443&secret=%s', r.host, urlenc(x.secret ?? ''));
	return { url: sprintf('https://%s/__cmcpx?p=%d&e=%d&s=%s&to=%s', r.host, x.port, exp, sig, urlenc(to)), name: x.name, host: r.host, wait: 5 };
};
P.xp_close = function() {
	if (ROLE != 'owner') die('只有主账号能用');
	if (xp_mode() == 'hosted') hub_call('/api/dev/xtarget', { port: 0 }, 30);
	unlink(ETC + '/xpage_cur.json');
	return { ok: true };
};
// 主账号手动加的：{ op: add, name, port, path, https } / { op: del, port }
P.xp_set = function(a) {
	if (ROLE != 'owner') die('只有主账号能用');
	let o = cmcp_readj(XP_F, {}), l = type(o?.list) == 'array' ? o.list : [];
	if (a?.op == 'del') l = filter(l, (x) => +x.port != +a.port);
	else {
		let name = trim('' + (a?.name ?? '')), port = +a?.port, path = trim('' + (a?.path ?? '/')) || '/';
		if (!length(name) || length(name) > 40 || match(name, /[<>"\x01-\x1f]/)) die('名字不对');
		if (!match('' + a?.port, /^[0-9]+$/) || port < 1 || port > 65535) die('端口要在 1–65535 之间');
		if (index([18765, 22, 53, 67], port) >= 0) die('这个端口不能开');
		if (!match(path, /^\/[A-Za-z0-9._~\/?=&%-]*$/)) die('路径要以 / 开头');
		for (let x in xp_found()) if (x.port == port) die('这个端口已经在列表里了：' + x.name);
		l = filter(l, (x) => +x.port != port);
		push(l, { name, port, path, https: !!a?.https });
		if (length(l) > 20) die('最多加 20 个');
	}
	cmcp_writej(XP_F, { list: l });
	return P.xp_get();
};

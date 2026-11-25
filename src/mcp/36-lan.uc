
/* ---------------- 6.0 第 82 项：家里局域网直接打开面板（http://路由器地址:906） ----------------
 * 端口只绑在局域网地址上（/etc/init.d/claude-mcp 的 lan 实例），外网、访客网络连不进来。
 * 登录两种：从已登录的原版后台点「服务 → 路由器面板」（rpcd 的 cmcp ticket 发一张 2 分钟、用一次的票，免输）；
 *           直接打开就输一次路由器后台（root）密码（输错 5 次锁 15 分钟）。都按主账号算，这台电脑 / 手机记住。 */
const LAN_T = getenv('CMCP_LAN_T') || '/tmp/cmcp_lt';
// 请求是不是从家里局域网来的（隧道进来的是 127.0.0.1，不算）
// 另外挡三种「看着像局域网、其实不是」的：经过反向代理转发的（带 X-Forwarded-For 等）、别的网站在你浏览器里偷偷发的
// （不是 JSON 请求）、DNS 重绑定（网址不是路由器的地址 / 局域网名字）
function lan_client() {
	for (let h in ['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'HTTP_CF_CONNECTING_IP', 'HTTP_FORWARDED']) if (length(getenv(h) ?? '')) return null;
	if (!match(lc(getenv('CONTENT_TYPE') ?? ''), /^application\/json/)) return null;
	let host = lc(replace(getenv('HTTP_HOST') ?? '', /:\d+$/, ''));
	if (!match(host, /^(\d+\.\d+\.\d+\.\d+|\[[0-9a-f:.]+\]|[a-z0-9-]+|[a-z0-9.-]+\.(lan|local|home|internal|home\.arpa))$/)) return null;
	let ra = replace(getenv('REMOTE_ADDR') ?? '', /^::ffff:/, '');
	if (match(ra, /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.)/)) return ra;
	if (match(lc(ra), /^(fe80|fd[0-9a-f]{2}|fc[0-9a-f]{2}):/)) return ra;
	return null;
}
function lan_issue(a, via) {
	let id = rand_str(8), sec = rand_str(32);
	if (!id || !sec) die('生成钥匙失败，再试一次');
	let d = devs_read();
	let ids = sort(keys(d), (x, y) => (d[x].at ?? 0) - (d[y].at ?? 0));
	while (length(ids) >= 30) delete d[shift(ids)];
	let name = substr(replace('' + (a?.name ?? ''), /[[:cntrl:]<>"]/g, ''), 0, 40) || '电脑';
	d[id] = { s: sec, name, at: time(), rot: time(), via };
	devs_write(d);
	DEV_ID = id;
	try { sh(sprintf('%s/cmcp-notify info login %s %s login >/dev/null 2>&1 &', SBIN, shq('局域网里有设备打开了面板：' + name), shq('用' + via + '登录（来自 ' + lan_client() + '）。不是你自己的话，马上在面板「我的主页 → 敏感信息」让它退出，并改路由器后台密码'))); } catch (e) {}
	return { dev: id + '.' + sec, id, name };
}
P.lan_open = function(a) {
	if (!lan_client()) die('只能在家里局域网里用');
	let t = '' + (a?.ticket ?? '');
	if (!match(t, /^[a-z2-9]{24}$/)) die('链接不完整：回到原版后台再点一次「路由器面板」');
	let f = LAN_T + '/' + t, st = stat(f);
	if (!st || time() - st.mtime > 120) { unlink(f); die('这个链接过期了：回到原版后台再点一次「路由器面板」'); }
	unlink(f);
	return lan_issue(a, LAN_VIA_LUCI);
};
P.lan_pw = function(a) {
	if (!lan_client()) die('只能在家里局域网里用');
	rootpw_check(a?.pw, '局域网打开面板时的路由器后台密码');
	return lan_issue(a, LAN_VIA_PW);
};
// 家里局域网的面板地址（「我的主页」里显示）
function lan_addr() {
	let port = +trim(readfile(ETC + '/lan_port') ?? '') || 906;
	if (stat(ETC + '/lan_off')) return null;
	let ip = trim(split(split(uci_get('network.lan.ipaddr') ?? '', ' ')[0], '/')[0]);
	return match(ip, /^\d+\.\d+\.\d+\.\d+$/) ? { ip, port, url: 'http://' + ip + ':' + port + '/panel/' } : null;
}
const LAN_WHO0 = P.whoami;
P.whoami = function(a) {
	let r = LAN_WHO0(a);
	r.lan = lan_addr();
	// 在家里局域网用原版后台 / 路由器后台密码登录的：没有官网账号，跟应急登录一样只有这台路由器的敏感信息
	if (DEV && !DEV.uid && (DEV.via == LAN_VIA_LUCI || DEV.via == LAN_VIA_PW)) { r.emerg = true; r.lanin = true; }
	return r;
};

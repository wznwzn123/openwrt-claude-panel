/* ---------------- 6.0 第 20 项：每台设备限速 ----------------
 * 设置存 /etc/claude-mcp/ratelimit.json（按 MAC），规则由 cmcp-ratelimit 生成（fw4 / fw3 都行，见那个脚本）；看门狗每 30 秒跟着设备的 IP 更新。
 * 子账号只能限自己名下的设备（own_check）。 */
const RL_F = ETC + '/ratelimit.json';
function rl_caps() {
	let c = null;
	try { c = json(trim(sh(SBIN + '/cmcp-ratelimit caps').out)); } catch (e) {}
	return type(c) == 'object' ? c : { ok: false, why: '路由器上的限速程序没装好，先一键更新' };
}
function rl_read() { let o = cmcp_readj(RL_F, {}); return type(o) == 'object' ? o : {}; }
P.rl_get = function() {
	let o = rl_read();
	if (own_only()) { let mine = own_mine(); for (let k in keys(o)) if (!mine[k]) delete o[k]; }
	return { devs: o, caps: rl_caps() };
};
// a: { mac, down, up（kbit/s，0 = 不限）, name }
P.rl_set = function(a) {
	let mac = lc(trim('' + (a?.mac ?? '')));
	if (!match(mac, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) die('这台设备读不到 MAC 地址，没法限速');
	own_check(mac);
	let n = (v, what) => {
		v = +(v ?? 0);
		if (v != v || v < 0) die(what + '不对');
		if (v > 0 && v < 100) die(what + '最小 0.1 Mbps');
		if (v > 10000000) die(what + '最大 10000 Mbps');
		return +sprintf('%.0f', v);
	};
	let down = n(a?.down, '下载上限'), up = n(a?.up, '上传上限'), o = rl_read();
	if (down || up) {
		let c = rl_caps();
		if (!c.ok) compat_die('ratelimit', c.why);
		o[mac] = { down, up, name: substr(replace('' + (a?.name ?? ''), /[[:cntrl:]<>"]/g, ''), 0, 40) || null };
	} else delete o[mac];
	cmcp_writej(RL_F, o);
	sh(SBIN + '/cmcp-ratelimit apply >/dev/null 2>&1');
	return P.rl_get();
};

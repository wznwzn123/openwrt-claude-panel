/* ---------------- 6.0 第 29 项：换路由器一键搬家 ----------------
 * 旧路由器「打包」：面板的设置（设备名字和归属、不走代理、暂停和上网计划、限速、定时、分流、节点自动换、远程页面、特色功能开关）
 * 用一把随机钥匙加密（ChaCha20 + HMAC-SHA256，跟云端备份同一套），密文放官网 24 小时，钥匙只在「搬家码」里（官网解不开）。
 * 新路由器输搬家码：先列出要搬什么（网络设置只给看，不自动改：Wi-Fi、路由器地址、上网方式在对应页面里自己改），确认后写入；
 * 家人（子账号和权限）一起转到新路由器（官网那边做，旧路由器上的家人去掉）。只能搬到同一个主账号的路由器，只有主账号能做。
 * 规则都按 MAC 记，换了路由器设备照样认得；按 IP 生效的（不走代理、分流）搬过来后按新路由器分到的 IP 重新对上。
 * 测试用：CMCP_MV_CRYPT（加密工具，默认 /usr/sbin/cmcp-bkcrypt） */
const MV_FILES = ['devnames.json', 'devown.json', 'known_devices.json', 'blacklist.json', 'pause.json', 'ratelimit.json', 'sched.json', 'split.json', 'autosw.json', 'xpage.json'];
const MV_NAME = { 'devnames.json': '设备名字和图标', 'devown.json': '设备归谁（家人的设备）', 'known_devices.json': '见过的设备', 'blacklist.json': '不走代理的设备', 'pause.json': '暂停上网和上网计划', 'ratelimit.json': '限速', 'sched.json': '定时重启、定时关 Wi-Fi', 'split.json': '分流', 'autosw.json': '节点自动换', 'xpage.json': '远程页面里加的页面' };
const MV_BKC = getenv('CMCP_MV_CRYPT') || SBIN + '/cmcp-bkcrypt';
function mv_tmp() { let t = trim(sh('mktemp -d /tmp/cmcp_mv.XXXXXX').out); if (!match(t, /^\/tmp\/cmcp_mv\.[A-Za-z0-9]+$/)) die('路由器上建不了临时文件'); return t; }
// 搬家码里的钥匙（16 字节）→ 加密钥匙、校验钥匙（各 32 字节），写成 cmcp-bkcrypt 认的两行
function mv_keyfile(dir, k) { writefile(dir + '/k', xp_sha(k + '|enc') + '\n' + xp_sha(k + '|mac') + '\n'); sh('chmod 600 ' + shq(dir + '/k')); return dir + '/k'; }
function mv_bkc(args) { let r = sh(MV_BKC + ' ' + args + ' 2>&1'); if (r.code != 0) die('加密工具出错：' + trim(r.out ?? '')); return trim(r.out ?? ''); }
function mv_hex(f) { let s = readfile(f) ?? '', o = ''; for (let i = 0; i < length(s); i++) o += sprintf('%02x', ord(s, i)); return o; }
function mv_unhex(h) { let o = ''; for (let i = 0; i < length(h); i += 2) o += chr(hex(substr(h, i, 2))); return o; }
function mv_guard() {
	if (ROLE != 'owner') die('只有主账号能搬家');
	if (!hub_conf(true)) die('自建版不能用搬家码：在新路由器上用「云端备份」还原，或者重新设置');
	if (!stat(MV_BKC)) die('这个版本没有加密工具，不能搬家');
}
// 网络设置：只给看
function mv_net() {
	let n = { wifi: [], lan: trim(split(split(uci_get('network.lan.ipaddr') ?? '', ' ')[0], '/')[0]), wan: uci_get('network.wan.proto') ?? '' };
	for (let s in (uci_load('wireless') ?? [])) if (s['.type'] == 'wifi-iface' && s.mode == 'ap' && s.ssid && index(n.wifi, s.ssid) < 0) push(n.wifi, s.ssid);
	return n;
}
P.move_out = function() {
	mv_guard();
	let pkg = { v: 1, at: time(), from: trim(readfile('/proc/sys/kernel/hostname') ?? ''), files: {}, off: [], on: [], net: mv_net() };
	for (let f in MV_FILES) { let s = readfile(ETC + '/' + f); if (s != null && length(s) < 200000) pkg.files[f] = s; }
	for (let k in AUTO_KEYS) if (stat(ETC + '/off.' + k)) push(pkg.off, k);
	for (let k in AUTO_OPTIN) if (stat(ETC + '/on.' + k)) push(pkg.on, k);
	let t = mv_tmp(), k = mv_bkc('rand 16'), nonce = mv_bkc('rand 12');
	if (!match(k, /^[0-9a-f]{32}$/) || !match(nonce, /^[0-9a-f]{24}$/)) { sh('rm -rf ' + shq(t)); die('生成钥匙失败，再试一次'); }
	writefile(t + '/p', sprintf('%J', pkg));
	let kf = mv_keyfile(t, k);
	mv_bkc(sprintf('chacha %s %s %s %s', shq(kf), nonce, shq(t + '/p'), shq(t + '/c')));
	let mac = mv_bkc(sprintf('hmac %s %s', shq(kf), shq(t + '/c')));
	let blob = nonce + mac + mv_hex(t + '/c');
	sh('rm -rf ' + shq(t));
	if (length(blob) > 400000) die('设置太多了，搬家包超过大小上限');
	let r = hub_call('/api/dev/move_put', { blob }, 30);
	let items = []; for (let f in MV_FILES) if (pkg.files[f]) push(items, MV_NAME[f]);
	return { code: r.id + '-' + k, exp: r.exp, items };
};
// a: { code, apply, fam }
P.move_in = function(a) {
	mv_guard();
	let m = match(lc(trim('' + (a?.code ?? ''))), /^([a-z2-9]{8})-([0-9a-f]{32})$/);
	if (!m) die('搬家码不对：是旧路由器上「打包」后给的那一串');
	let r = hub_call('/api/dev/move_get', { id: m[1] }, 30), b = '' + (r.blob ?? '');
	if (!match(b, /^[0-9a-f]{90,}$/)) die('搬家包坏了：在旧路由器上重新打包');
	let t = mv_tmp(), kf = mv_keyfile(t, m[2]), nonce = substr(b, 0, 24), mac = substr(b, 24, 64);
	writefile(t + '/c', mv_unhex(substr(b, 88)));
	if (mv_bkc(sprintf('hmac %s %s', shq(kf), shq(t + '/c'))) != mac) { sh('rm -rf ' + shq(t)); die('搬家码不对（钥匙对不上）'); }
	mv_bkc(sprintf('chacha %s %s %s %s', shq(kf), nonce, shq(t + '/c'), shq(t + '/p')));
	let pkg = null; try { pkg = json(readfile(t + '/p')); } catch (e) {}
	sh('rm -rf ' + shq(t));
	if (type(pkg) != 'object' || pkg.v != 1 || type(pkg.files) != 'object') die('搬家包坏了：在旧路由器上重新打包');
	let items = []; for (let f in MV_FILES) if (type(pkg.files[f]) == 'string') push(items, MV_NAME[f]);
	if (!a?.apply) return { from: r.fromName ?? pkg.from, items, off: length(pkg.off ?? []), net: pkg.net ?? {}, here: mv_net() };
	// 写进来（文件名只认白名单里的）
	for (let f in MV_FILES) if (type(pkg.files[f]) == 'string') { writefile(ETC + '/' + f + '.mvtmp', pkg.files[f]); rename(ETC + '/' + f + '.mvtmp', ETC + '/' + f); }
	for (let k in AUTO_KEYS) { if (index(pkg.off ?? [], k) >= 0) writefile(ETC + '/off.' + k, ''); else unlink(ETC + '/off.' + k); }
	for (let k in AUTO_OPTIN) { if (index(pkg.on ?? [], k) >= 0) writefile(ETC + '/on.' + k, ''); else unlink(ETC + '/on.' + k); }
	// 按 IP 生效的：换成新路由器给这些设备分的 IP
	let ip = sp_ipmap(), kind = sp_kind();
	if (type(pkg.files['blacklist.json']) == 'string') {
		let bl = null; try { bl = json(pkg.files['blacklist.json']); } catch (e) {}
		if (type(bl) == 'array') { for (let e in bl) if (e?.mac && ip[lc(e.mac)]) e.ip = ip[lc(e.mac)]; writefile(ETC + '/blacklist.json', sprintf('%J', bl)); }
		if (kind == 'openclash') try { bl_write_ruleset(bl); } catch (e) {}
		else for (let f in BL_HOOK) try { f(true); } catch (e) {} // Nikki：同步到它的访问控制
	}
	let so = sp_read(); for (let mac in so.dev) if (ip[mac]) so.dev[mac].ip = ip[mac];
	if (type(pkg.files['split.json']) == 'string') cmcp_writej(SP_F, so);
	// 让设置生效：定时任务、限速、分流
	if (type(pkg.files['sched.json']) == 'string') try { sc_cron(sc_read()); } catch (e) {}
	if (type(pkg.files['ratelimit.json']) == 'string') bg(SBIN + '/cmcp-ratelimit apply');
	let restart = false;
	if (kind && type(pkg.files['split.json']) == 'string') try { restart = sp_apply(so, kind).restart; } catch (e) {}
	let d = hub_call('/api/dev/move_done', { id: m[1], fam: a.fam !== false }, 30);
	return { ok: true, items, fam: d.fam ?? 0, restart };
};

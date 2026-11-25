
/* ---------------- 6.0 第 14 项：Wi-Fi 设置（名字、密码、开关、隐藏、信道） ----------------
 * 只改「家里网络」（lan）上的 Wi-Fi；访客、中继、Mesh 不动。改完先生效，90 秒内在面板点「保留」才算数，
 * 不点就自动改回原来的（cmcp-netguard，见 src/bin/cmcp-netguard）。密码不跟着列表一起给，点「显示」才单独要（要「完全控制」）。 */
const NG = getenv('CMCP_NG') || '/tmp/cmcp_netguard';
const NG_WAIT = +(getenv('CMCP_NG_WAIT') || 90);
function ucdir() { return conf().uci_dir || '/etc/config'; }

// 解析 uci -X show 的一个值：'a' 'b' 是列表；'it'\''s' 是带单引号的
function uci_val(s) {
	let out = [], cur = '', i = 0, n = length(s), q = false, any = false;
	while (i < n) {
		let c = substr(s, i, 1);
		if (q) { if (c == "'") q = false; else cur += c; i++; continue; }
		if (c == "'") { q = true; any = true; }
		else if (c == '\\' && i + 1 < n) { cur += substr(s, i + 1, 1); any = true; i++; }
		else if (c == ' ') { if (any) push(out, cur); cur = ''; any = false; }
		else { cur += c; any = true; }
		i++;
	}
	if (any) push(out, cur);
	return out;
}
// 读一个配置：[{ '.name', '.type', 选项... }]，按文件里的顺序
function uci_load(cfg) {
	let r = sh(conf().uci + ' -X show ' + shq(cfg) + ' 2>/dev/null'), secs = [], by = {};
	if (r.code != 0) return null;
	for (let ln in split(r.out, '\n')) {
		let m = match(ln, /^[^.=]+\.([A-Za-z0-9_]+)=([A-Za-z0-9_-]+)$/);
		if (m) { by[m[1]] = { '.name': m[1], '.type': m[2] }; push(secs, by[m[1]]); continue; }
		m = match(ln, /^[^.=]+\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)=(.*)$/);
		if (m && by[m[1]]) { let v = uci_val(m[3]); by[m[1]][m[2]] = length(v) == 1 ? v[0] : v; }
	}
	return secs;
}
function as_list(v) { return type(v) == 'array' ? v : (v == null ? [] : split(trim('' + v), /[ \t]+/)); }

function wifi_band(r) {
	let b = lc('' + (r.band ?? '')), hw = lc('' + (r.hwmode ?? '')), ch = +r.channel;
	if (b == '2g' || b == '5g' || b == '6g' || b == '60g') return b;
	if (match(hw, /^11(a|na|ac|ax5)/)) return '5g';
	if (match(hw, /^11(b|g|ng|n)/)) return '2g';
	if (ch > 14) return '5g';
	return '2g';
}
const BAND_NAME = { '2g': '2.4G', '5g': '5G', '6g': '6G', '60g': '60G' };
function enc_kind(e) {
	e = lc('' + (e ?? 'none'));
	if (e == '' || e == 'none' || e == 'owe') return 'open';
	if (match(e, /^(psk|sae)/)) return 'psk';
	if (match(e, /^wep/)) return 'wep';
	return 'ent';
}
// 这个频段能用哪些信道：先问驱动（按国家码去掉不能用的），问不到用常见的。5G 的雷达信道（52–144）不给选：换过去要先等 1–10 分钟，90 秒内连不回来
let _wst = null;
function wifi_ifnames() {
	if (_wst != null) return _wst;
	let r = sh('ubus call network.wireless status 2>/dev/null'), o = null;
	try { o = json(r.out); } catch (e) {}
	return (_wst = type(o) == 'object' ? o : {});
}
function wifi_chans(id, band, country, cur) {
	let list = [];
	let ifs = wifi_ifnames()[id]?.interfaces ?? [], dev = null;
	for (let x in ifs) if (x?.ifname) { dev = x.ifname; break; }
	if (dev && match(dev, /^[A-Za-z0-9_.-]+$/)) {
		let o = null;
		try { o = json(sh(sprintf("ubus call iwinfo freqlist '{\"device\":\"%s\"}' 2>/dev/null", dev)).out); } catch (e) {}
		for (let f in (o?.results ?? [])) {
			let c = +f?.channel;
			if (c > 0 && !f.restricted && !(band == '5g' && c >= 52 && c <= 144) && !(band == '2g' && c > 13)) push(list, c);
		}
	}
	if (!length(list)) {
		let cc = uc('' + (country ?? ''));
		if (band == '2g') list = cc == 'CN' || cc == '' || cc == '00' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
		else if (band == '5g') list = index(['', '00', 'CN', 'US', 'CA', 'TW', 'HK', 'MO', 'AU', 'NZ', 'SG', 'MY', 'KR', 'IN', 'TH', 'VN', 'PH', 'ID', 'MX', 'BR'], cc) >= 0 ? [36, 40, 44, 48, 149, 153, 157, 161, 165] : [36, 40, 44, 48];
	}
	let c = +cur;
	if (c > 0 && index(list, c) < 0) push(list, c);
	let u = [];
	for (let x in list) if (index(u, x) < 0) push(u, x);
	return sort(u, (a, b) => a - b);
}
function wifi_bin() { return conf().wifi_bin || '/sbin/wifi'; }

// 现在的 Wi-Fi：每个频段一项；main = 这个频段上家里网络（lan）的 Wi-Fi（访客的有 cmcp_guest 标记，不算）
function wifi_state() {
	if (!stat(ucdir() + '/wireless')) return { none: 'nocfg' };
	let secs = uci_load('wireless');
	if (secs == null) return { none: 'nocfg' };
	let radios = [];
	for (let r in secs) {
		if (r['.type'] != 'wifi-device') continue;
		let id = r['.name'], band = wifi_band(r), mn = null, sta = null, other = 0;
		for (let s in secs) {
			if (s['.type'] != 'wifi-iface' || s.device != id) continue;
			let mode = s.mode ?? 'ap';
			if (mode == 'sta') { sta = sta ?? s; continue; }
			if (mode != 'ap') { other++; continue; }
			if (!mn && s.cmcp_guest != '1' && index(as_list(s.network), 'lan') >= 0) mn = s;
			else other++;
		}
		push(radios, { id, band, r, main: mn, sta, other });
	}
	if (!length(radios)) return { none: 'noradio' };
	return { radios };
}
function wifi_pub(x) {
	let r = x.r, m = x.main, off = r.disabled == '1';
	return {
		id: x.id, band: x.band, name: BAND_NAME[x.band] ?? uc(x.band),
		on: !off && !!m && m.disabled != '1',
		channel: length(r.channel ?? '') && r.channel != 'auto' ? +r.channel || 'auto' : 'auto',
		chans: x.band == '2g' || x.band == '5g' ? wifi_chans(x.id, x.band, r.country, r.channel) : [],
		wifi: m ? { ssid: m.ssid ?? '', hidden: m.hidden == '1', kind: enc_kind(m.encryption), key: length(m.key ?? '') > 0 } : null,
		sta: x.sta ? (x.sta.ssid ?? '') : null
	};
}
function ng_pending() {
	let t = trim(readfile(NG + '/token') ?? ''), st = stat(NG + '/token');
	if (!length(t) || !st || time() - st.mtime > 300) return null;
	let u = +trim(readfile(NG + '/until') ?? '0');
	return { token: fam_allowed('net_confirm') ? t : null, what: trim(readfile(NG + '/what') ?? '') || '网络设置', left: u > time() ? u - time() : 0 };
}
P.wifi_get = function() {
	let s = wifi_state();
	if (s.none) return { none: s.none, pending: ng_pending() };
	// 几个频段的名字、密码、隐藏都一样：面板合成一份显示
	let ms = filter(s.radios, (x) => x.main), same = length(ms) > 1;
	for (let x in ms) if (x.main.ssid != ms[0].main.ssid || (x.main.key ?? '') != (ms[0].main.key ?? '') || (x.main.hidden == '1') != (ms[0].main.hidden == '1')) same = false;
	return { radios: map(s.radios, wifi_pub), same, pending: ng_pending(), can: !!stat(wifi_bin()) };
};
P.wifi_key = function(a) {
	let s = wifi_state();
	for (let x in (s.radios ?? [])) if (x.id == a?.id && x.main) return { key: x.main.key ?? '' };
	die('没有这个 Wi-Fi');
};

// 太容易被猜到的密码：常见的、一个字重复、顺着数的
const WIFI_WEAK = ['12345678', '123456789', '1234567890', '87654321', '12341234', '11223344', '12344321', '123123123', '147258369', '1qaz2wsx', 'qwertyui', 'qwerty123', 'asdfghjk', 'password', 'password1', 'passw0rd', 'abcd1234', 'abc12345', 'a1234567', 'admin123', 'wifi1234', 'iloveyou', '5201314520', '520520520', '1314520520', 'woaini1314'];
function key_weak(k) {
	let l = lc(k), n = length(l), same = true, up = true, down = true;
	if (index(WIFI_WEAK, l) >= 0) return true;
	for (let i = 1; i < n; i++) {
		let d = ord(l, i) - ord(l, i - 1);
		if (d != 0) same = false;
		if (d != 1) up = false;
		if (d != -1) down = false;
	}
	return same || up || down;
}
function key_check(k) {
	if (match(k, /^[0-9A-Fa-f]{64}$/)) return;
	if (length(k) < 8) die('密码至少 8 位');
	if (length(k) > 63) die('密码最多 63 位');
	if (!match(k, /^[ -~]+$/)) die('密码只能用英文字母、数字和英文符号');
	if (key_weak(k)) die('这个密码太容易被猜到，换一个');
}
function ssid_check(s) {
	if (!length(s)) die('Wi-Fi 名字不能是空的');
	if (length(s) > 32) die('Wi-Fi 名字太长：最多 32 个字节（中文大约 10 个字）');
	if (match(s, /[\x01-\x1f\x7f]/)) die('Wi-Fi 名字里有不能用的字符');
}
function ng_busy() {
	let p = ng_pending();
	if (p) die('刚才改的' + p.what + '还在等你确认，先点「保留」或「改回去」');
}

// a.radios: [{ id, on, channel, ssid, key, hidden }]，只传要改的
P.wifi_set = function(a) {
	if (!stat(wifi_bin())) compat_die('wifi', '这台路由器没有 wifi 命令，改不了 Wi-Fi 设置');
	let s = wifi_state();
	if (s.none) die('这台路由器没有无线');
	ng_busy();
	let U = conf().uci, cmds = [], set = (k, v) => push(cmds, U + ' set ' + shq('wireless.' + k + '=' + v)), del = (k) => push(cmds, U + ' -q delete ' + shq('wireless.' + k));
	let ons = {};
	for (let x in s.radios) ons[x.id] = wifi_pub(x).on;
	for (let q in (type(a?.radios) == 'array' ? a.radios : [])) {
		let x = null;
		for (let y in s.radios) if (y.id == q?.id) x = y;
		if (!x) die('没有这个频段：' + q?.id);
		let r = x.r, m = x.main, id = x.id, nm = BAND_NAME[x.band] ?? x.band;
		if (exists(q, 'on')) {
			if (!m) die(nm + ' 上没有家里网络的 Wi-Fi，在原版后台里加');
			if (q.on) { if (r.disabled == '1') set(id + '.disabled', '0'); if (m.disabled == '1') set(m['.name'] + '.disabled', '0'); }
			else if (r.disabled != '1' && m.disabled != '1') set(m['.name'] + '.disabled', '1');
			ons[id] = !!q.on;
		}
		if (exists(q, 'channel')) {
			let c = q.channel == 'auto' ? 'auto' : +q.channel;
			if (c != 'auto' && index(wifi_chans(id, x.band, r.country, r.channel), c) < 0) die(nm + ' 不能用信道 ' + q.channel);
			let curc = length(r.channel ?? '') ? r.channel : 'auto';
			if ('' + c != curc) set(id + '.channel', '' + c);
		}
		if (exists(q, 'ssid') || exists(q, 'key') || exists(q, 'hidden')) {
			if (!m) die(nm + ' 上没有家里网络的 Wi-Fi，在原版后台里加');
			let sid = m['.name'];
			if (exists(q, 'ssid')) {
				let v = trim('' + (q.ssid ?? ''));
				ssid_check(v);
				if (v != (m.ssid ?? '')) set(sid + '.ssid', v);
			}
			if (exists(q, 'key')) {
				let k = '' + (q.key ?? ''), kind = enc_kind(m.encryption);
				if (kind == 'ent' || kind == 'wep') die(nm + ' 用的是' + (kind == 'wep' ? ' WEP 加密' : '企业认证') + '，密码要在原版后台里改');
				key_check(k);
				if (k != (m.key ?? '')) set(sid + '.key', k);
				if (kind == 'open') set(sid + '.encryption', 'psk2');
			}
			if (exists(q, 'hidden') && !!q.hidden != (m.hidden == '1')) { if (q.hidden) set(sid + '.hidden', '1'); else del(sid + '.hidden'); }
		}
	}
	if (!length(cmds)) return { changed: false };
	let tok = rand_str(16);
	if (!tok) die('路由器生成不了随机数，稍后再试');
	sh('rm -rf ' + shq(NG) + ' && mkdir -p ' + shq(NG + '/files') + ' && cp -f ' + shq(ucdir() + '/wireless') + ' ' + shq(NG + '/files/wireless'));
	if (!stat(NG + '/files/wireless')) die('备份原来的设置失败，没有改');
	writefile(NG + '/what', 'Wi-Fi 设置');
	writefile(NG + '/reload', 'wifi reload\n');
	writefile(NG + '/until', '' + (time() + NG_WAIT + 15));
	writefile(NG + '/token', tok);
	let r = sh(join(' && ', cmds) + ' && ' + U + ' commit wireless');
	if (r.code != 0) {
		sh(U + ' revert wireless; cp -f ' + shq(NG + '/files/wireless') + ' ' + shq(ucdir() + '/wireless') + '; rm -rf ' + shq(NG));
		die('保存失败，没有改：' + trim_nl(r.out));
	}
	bg(sprintf('CMCP_NG=%s CMCP_UCI_DIR=%s CMCP_SBIN=%s %s/cmcp-netguard run %s', shq(NG), shq(ucdir()), shq(SBIN), SBIN, tok));
	let n = 0;
	for (let k in ons) if (ons[k]) n++;
	return { changed: true, token: tok, wait: NG_WAIT, alloff: n == 0 };
};
// 90 秒里点「保留」/「改回去」
P.net_confirm = function(a) {
	let t = trim(readfile(NG + '/token') ?? '');
	if (!length(t) || t != '' + (a?.token ?? '')) return { ok: false, gone: true };
	sh('rm -rf ' + shq(NG));
	return { ok: true };
};
P.net_revert = function(a) {
	let t = trim(readfile(NG + '/token') ?? '');
	if (!length(t) || t != '' + (a?.token ?? '')) return { ok: false, gone: true };
	// 后台改回去：重新加载 Wi-Fi 时手机可能先断一下，先把回复发出去
	bg(sprintf('sleep 1; CMCP_NG=%s CMCP_UCI_DIR=%s CMCP_SBIN=%s %s/cmcp-netguard revert %s', shq(NG), shq(ucdir()), shq(SBIN), SBIN, t));
	return { ok: true };
};
P.net_pending = function() { return { pending: ng_pending() }; };

/* ---------------- 6.0 第 22 项：无线中继（连上级 Wi-Fi 上网，WISP） ----------------
 * 用户 11/26 定：只做「连上级 Wi-Fi 上网」。在一个频段上加一个客户端（sta），接到新的上网接口 wwan（DHCP），放进防火墙的外网区域；
 * 家里的 Wi-Fi 照常发（同一个频段的信道要跟上级一样，面板会改成上级的信道，断开时改回原来的）。
 * 改完走「90 秒确认」：连不上（密码错、信号太差）、把家里 Wi-Fi 弄断了，90 秒没点「保留」自动改回。
 * 面板加的都带 cmcp 标记（wireless.cmcp_wisp、network.wwan 上的 cmcp_wisp），断开时只删自己加的；原版后台里配的中继只显示、不改。
 * 兼容：要有 wpa_supplicant（wpad 系列都带）；只支持 WPA3 的上级要 wpad 不是 mini / 老的 basic；企业认证、WEP 不支持。 */
const WISP_IF = 'cmcp_wisp';
function wisp_supp() { let r = getenv('CMCP_WISP_ROOT') || ''; return !!(stat(r + '/usr/sbin/wpa_supplicant') || stat(r + '/usr/sbin/wpad')); }
function wisp_sae_ok() {
	let l = sh('(opkg list-installed 2>/dev/null; apk info 2>/dev/null) | grep -E "^(wpad|wpa-supplicant)"').out;
	return !match(l, /(^|\n)(wpad|wpa-supplicant)-mini/) && !match(l, /(^|\n)wpad-basic( |\n|$)/);
}
function wisp_mine() {
	for (let s in (uci_load('wireless') ?? [])) if (s['.type'] == 'wifi-iface' && s['.name'] == WISP_IF) return s;
	return null;
}
function wisp_other() {
	for (let s in (uci_load('wireless') ?? [])) if (s['.type'] == 'wifi-iface' && (s.mode ?? 'ap') == 'sta' && s['.name'] != WISP_IF && s.disabled != '1') return s;
	return null;
}
function wisp_ifstatus(n) {
	let w = null;
	try { w = json(sh('ubus call network.interface.' + n + ' status 2>/dev/null').out); } catch (e) {}
	return type(w) == 'object' ? { up: !!w.up, pending: !!w.pending, ip: w['ipv4-address']?.[0]?.address ?? null, pl: w['ipv4-address']?.[0]?.mask ?? null, uptime: w.up ? +w.uptime || 0 : 0 } : null;
}
// 扫描到的加密方式 → uci 的 encryption；不支持的返回 null
function wisp_enc(e) {
	if (type(e) != 'object' || !e.enabled) return 'none';
	let au = map(e.authentication ?? [], lc), wpa = e.wpa ?? [];
	if (index(au, 'owe') >= 0) return 'owe';
	if (index(au, '802.1x') >= 0 || index(au, 'eap') >= 0) return null;
	if (length(e.wep ?? []) || !length(wpa)) return null;
	if (index(au, 'sae') >= 0) return index(au, 'psk') >= 0 ? 'psk2' : 'sae'; // WPA2/WPA3 混合的按 WPA2 连，老固件也行
	if (index(wpa, 2) >= 0 || index(wpa, 3) >= 0) return index(wpa, 1) >= 0 ? 'psk-mixed' : 'psk2';
	return 'psk';
}
// iwinfo 命令的扫描结果（文字）→ 跟 ubus 一样的结构
function wisp_scan_cli(dev) {
	let out = sh('iwinfo ' + shq(dev) + ' scan 2>/dev/null').out, res = [], cur = null;
	if (!length(out)) return null;
	for (let l in split(out, '\n')) {
		let m;
		if ((m = match(l, /^Cell [0-9]+ - Address: ([0-9A-Fa-f:]+)/))) { cur = { bssid: m[1], encryption: { enabled: false } }; push(res, cur); continue; }
		if (!cur) continue;
		if ((m = match(l, /ESSID: "(.*)"$/))) cur.ssid = m[1];
		if ((m = match(l, /Channel: ([0-9]+)/))) cur.channel = +m[1];
		if ((m = match(l, /Signal: (-?[0-9]+) dBm/))) cur.signal = +m[1];
		if ((m = match(l, /Quality: ([0-9]+)\/([0-9]+)/))) { cur.quality = +m[1]; cur.quality_max = +m[2]; }
		if ((m = match(l, /Encryption: (.*)$/))) {
			let e = m[1], au = [], wpa = [];
			if (e != 'none' && e != 'unknown') {
				if (match(e, /WEP/)) cur.encryption = { enabled: true, wep: ['open'] };
				else {
					if (match(e, /802\.1X/)) push(au, '802.1x');
					if (match(e, /PSK/)) push(au, 'psk');
					if (match(e, /SAE/)) push(au, 'sae');
					if (match(e, /OWE/)) push(au, 'owe');
					if (match(e, /WPA3/)) push(wpa, 3);
					if (match(e, /WPA2/)) push(wpa, 2);
					if (match(e, /WPA(\/| |$)/) || match(e, /WPA1/)) push(wpa, 1);
					cur.encryption = { enabled: true, wpa, authentication: au };
				}
			}
		}
	}
	return { results: res };
}
function wisp_ifname(id) {
	for (let x in (wifi_ifnames()[id]?.interfaces ?? [])) if (x?.ifname && match(x.ifname, /^[A-Za-z0-9_.-]+$/)) return x.ifname;
	return null;
}
P.wisp_get = function() {
	let ws = wifi_state();
	if (ws.none) return { none: ws.none == 'nocfg' ? '这台路由器没有无线配置' : '这台路由器没有无线网卡', pending: ng_pending() };
	let m = wisp_mine(), o = m ? null : wisp_other(), s = m ?? o;
	let st = s ? wisp_ifstatus(as_list(s.network)[0] ?? 'wwan') : null, lan = pf_lan();
	return {
		radios: map(filter(ws.radios, (x) => x.band == '2g' || x.band == '5g'), (x) => ({ id: x.id, band: x.band, name: BAND_NAME[x.band], on: x.r.disabled != '1' && !!wisp_ifname(x.id), ch: length(x.r.channel ?? '') && x.r.channel != 'auto' ? +x.r.channel : 'auto' })),
		on: !!s, mine: !!m, ssid: s?.ssid ?? null, radio: s?.device ?? null, status: st,
		clash: !!(st?.ip && lan && cidr_has(lan.ip, lan.pl, st.ip)), lan: lan ? lan.ip : null,
		can: wisp_supp(), pending: ng_pending()
	};
};
P.wisp_scan = function(a) {
	let ws = wifi_state();
	if (ws.none) die('这台路由器没有无线网卡');
	let x = null;
	for (let r in ws.radios) if (r.id == a?.radio) x = r;
	if (!x) die('没有这个频段');
	let dev = wisp_ifname(x.id);
	if (!dev) die((BAND_NAME[x.band] ?? x.band) + ' 关着，先在 Wi-Fi 页打开');
	let o = null;
	try { o = json(sh(sprintf("ubus -t 20 call iwinfo scan '{\"device\":\"%s\"}' 2>/dev/null", dev)).out); } catch (e) {}
	if (type(o?.results) != 'array') o = wisp_scan_cli(dev); // 没装 rpcd-mod-iwinfo 的：用 iwinfo 命令
	if (type(o?.results) != 'array') die('扫描失败，稍后再试');
	let by = {}, mine = {};
	for (let s in (uci_load('wireless') ?? [])) if (s['.type'] == 'wifi-iface' && (s.mode ?? 'ap') == 'ap' && s.ssid) mine[s.ssid] = 1;
	for (let r in o.results) {
		let ssid = r.ssid ?? '';
		if (!length(ssid) || mine[ssid]) continue; // 隐藏的、自己发的不列
		let q = r.quality_max > 0 ? +sprintf('%.0f', r.quality * 100.0 / r.quality_max) : null, enc = wisp_enc(r.encryption);
		let it = { ssid, bssid: lc(r.bssid ?? ''), ch: +r.channel || null, signal: r.signal ?? null, q, enc, lock: enc != 'none' && enc != 'owe', ok: enc != null && (enc != 'sae' || wisp_sae_ok()) };
		if (!by[ssid] || (it.q ?? 0) > (by[ssid].q ?? 0)) by[ssid] = it;
	}
	return { band: x.band, list: sort(values(by), (p, q) => (q.q ?? 0) - (p.q ?? 0)) };
};
// a: { op: on, radio, ssid, key, enc, ch } / { op: off }
P.wisp_set = function(a) {
	let ws = wifi_state();
	if (ws.none) die('这台路由器没有无线网卡');
	ng_busy();
	let U = conf().uci, cmds = [], set = (k, v) => push(cmds, U + ' set ' + shq(k + '=' + v)), del = (k) => push(cmds, U + ' -q delete ' + shq(k));
	let m = wisp_mine(), fw = uci_load('firewall') ?? [], zone = null;
	for (let z in fw) if (z['.type'] == 'zone' && z.name == 'wan') zone = z;
	let net = null;
	for (let s in (uci_load('network') ?? [])) if (s['.type'] == 'interface' && s['.name'] == 'wwan') net = s;
	let zl = zone ? as_list(zone.network) : [], zset = (l) => { del('firewall.' + zone['.name'] + '.network'); for (let n in l) push(cmds, U + ' add_list ' + shq('firewall.' + zone['.name'] + '.network=' + n)); };
	let what = '', files = { wireless: 1 };
	if (a?.op == 'off') {
		if (!m) die(wisp_other() ? '这个中继是原版后台里设的，在原版后台里改' : '没有在中继');
		del('wireless.' + WISP_IF);
		if (length(m.cmcp_ch ?? '')) set('wireless.' + m.device + '.channel', m.cmcp_ch);
		if (net?.cmcp_wisp == '1') { del('network.wwan'); files.network = 1; if (zone && index(zl, 'wwan') >= 0) { zset(filter(zl, (n) => n != 'wwan')); files.firewall = 1; } }
		what = '断开中继';
	} else if (a?.op == 'on') {
		if (!wisp_supp()) compat_die('wisp', '固件没有 wpa_supplicant，连不了别的 Wi-Fi');
		if (!m && wisp_other()) die('原版后台里已经设了中继，在原版后台里改');
		if (!zone) die('防火墙里没有外网（wan）区域');
		if (net && net.cmcp_wisp != '1' && (net.proto ?? '') != 'dhcp') die('已经有一个叫 wwan 的接口，在原版后台里看一下');
		let x = null;
		for (let r in ws.radios) if (r.id == a?.radio) x = r;
		if (!x || (x.band != '2g' && x.band != '5g')) die('没有这个频段');
		let ssid = '' + (a?.ssid ?? '');
		if (!length(ssid) || length(ssid) > 32 || match(ssid, /[\x01-\x1f\x7f]/)) die('Wi-Fi 名字不对');
		let enc = a?.enc ?? 'psk2';
		if (index(['none', 'owe', 'psk', 'psk2', 'psk-mixed', 'sae'], enc) < 0) die('这种加密方式连不了（企业认证、WEP 不支持）');
		if (enc == 'sae' && !wisp_sae_ok()) compat_die('wisp_sae', '上级 Wi-Fi 只用 WPA3，这台路由器的无线组件不支持');
		let key = '' + (a?.key ?? '');
		if (enc != 'none' && enc != 'owe') {
			if (!length(key) && m && m.ssid == ssid && length(m.key ?? '')) key = m.key; // 同一个 Wi-Fi 重新连：密码不填就用原来的
			if (length(key) < 8 || (length(key) > 63 && !match(key, /^[0-9A-Fa-f]{64}$/))) die('密码是 8–63 位');
			if (match(key, /[\x01-\x1f\x7f]/)) die('密码里有不能用的字符');
		}
		// 中继放到另一个频段：先把原来那个去掉，信道改回去
		if (m && m.device != x.id) { del('wireless.' + WISP_IF); if (length(m.cmcp_ch ?? '')) set('wireless.' + m.device + '.channel', m.cmcp_ch); m = null; }
		set('wireless.' + WISP_IF, 'wifi-iface');
		set('wireless.' + WISP_IF + '.device', x.id); set('wireless.' + WISP_IF + '.mode', 'sta'); set('wireless.' + WISP_IF + '.network', 'wwan');
		set('wireless.' + WISP_IF + '.ssid', ssid); set('wireless.' + WISP_IF + '.encryption', enc);
		if (enc != 'none' && enc != 'owe') set('wireless.' + WISP_IF + '.key', key); else if (m?.key) del('wireless.' + WISP_IF + '.key');
		if (m?.disabled) del('wireless.' + WISP_IF + '.disabled');
		if (x.r.disabled == '1') set('wireless.' + x.id + '.disabled', '0');
		// 同一个频段上家里 Wi-Fi 的信道要跟上级一样（固定信道才改；自动的会自己跟过去）
		let ch = +a?.ch, cur = length(x.r.channel ?? '') ? x.r.channel : 'auto';
		if (ch > 0 && cur != 'auto' && +cur != ch) {
			set('wireless.' + x.id + '.channel', '' + ch);
			if (!length(m?.cmcp_ch ?? '')) set('wireless.' + WISP_IF + '.cmcp_ch', cur);
		}
		if (!net) { set('network.wwan', 'interface'); set('network.wwan.proto', 'dhcp'); set('network.wwan.cmcp_wisp', '1'); files.network = 1; }
		if (index(zl, 'wwan') < 0) { let nl = slice(zl); push(nl, 'wwan'); zset(nl); files.firewall = 1; }
		what = '连「' + ssid + '」';
	} else die('不支持的操作');
	let tok = rand_str(16);
	if (!tok) die('路由器生成不了随机数，稍后再试');
	sh('rm -rf ' + shq(NG) + ' && mkdir -p ' + shq(NG + '/files'));
	for (let f in keys(files)) {
		sh('cp -f ' + shq(ucdir() + '/' + f) + ' ' + shq(NG + '/files/' + f));
		if (!stat(NG + '/files/' + f)) { sh('rm -rf ' + shq(NG)); die('备份原来的设置失败，没有改'); }
	}
	let rl = [];
	if (files.network) push(rl, '/etc/init.d/network reload');
	push(rl, 'wifi reload');
	if (files.firewall) push(rl, '/etc/init.d/firewall reload');
	writefile(NG + '/what', '无线中继');
	writefile(NG + '/reload', join('\n', rl) + '\n');
	writefile(NG + '/until', '' + (time() + NG_WAIT + 15));
	writefile(NG + '/token', tok);
	let r = sh(join(' && ', cmds) + ' && ' + join(' && ', map(keys(files), (f) => U + ' commit ' + f)));
	if (r.code != 0) {
		for (let f in keys(files)) sh(U + ' revert ' + f + '; cp -f ' + shq(NG + '/files/' + f) + ' ' + shq(ucdir() + '/' + f));
		sh('rm -rf ' + shq(NG));
		die('保存失败，没有改：' + trim_nl(r.out));
	}
	try { sh(sprintf('%s/cmcp-notify info net %s %s net >/dev/null 2>&1', SBIN, shq('无线中继：' + what), shq('90 秒内没点「保留」会自动改回去。'))); } catch (e) {}
	bg(sprintf('CMCP_NG=%s CMCP_UCI_DIR=%s CMCP_SBIN=%s %s/cmcp-netguard run %s', shq(NG), shq(ucdir()), shq(SBIN), SBIN, tok));
	return { changed: true, token: tok, wait: NG_WAIT, what };
};

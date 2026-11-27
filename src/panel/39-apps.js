/* ---------- 6.0 第 83 项：应用管理 ----------
   分四类：插件（luci-app / 主题）、软件（自己装的其他包）、依赖（为别的包自动装的）、系统（固件自带）。都按安装时间排，最近的在前。
   不能卸的（系统组件、固件自带、面板要用、被别的包使用）点开说原因 */
let apData = null, apView = 'plugin';
const AP_CAT = { plugin: '插件', soft: '软件', dep: '依赖', rom: '系统' };
/* 应用图标（用户 11/27 选「按用途画」）：按包名认用途，认不出用通用图标；跟设备图标一个画法，全在面板里不联网 */
const AP_IC = {
	proxy: ['#0a84ff', '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>'],
	ad: ['#34c759', '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>'],
	dl: ['#ff9500', '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>'],
	disk: ['#a2845e', '<rect x="4" y="5" width="16" height="6" rx="1.8"/><rect x="4" y="13" width="16" height="6" rx="1.8"/><path d="M7.5 8h.01M7.5 16h.01"/>'],
	vpn: ['#00c7be', '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><path d="M12 14.5v2"/>'],
	net: ['#5856d6', '<path d="M4 9.5a11.5 11.5 0 0 1 16 0M7 12.8a7 7 0 0 1 10 0M10 16a2.8 2.8 0 0 1 4 0"/><path d="M12 19h.01"/>'],
	ctrl: ['#ff3b30', '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>'],
	mon: ['#af52de', '<path d="M4 19.5h16"/><path d="M7 16v-4M11 16V7M15 16v-6M19 16V9"/>'],
	media: ['#ff2d55', '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M10.5 9.5v5l4.2-2.5z"/>'],
	box: ['#30b0c7', '<path d="M12 3.5l8 4.2v8.6l-8 4.2-8-4.2V7.7z"/><path d="M4 7.7l8 4.3 8-4.3M12 12v8.5"/>'],
	term: ['#636366', '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M7.5 10l2.5 2-2.5 2M12.5 14.5h4"/>'],
	theme: ['#bf5af2', '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1 0 1.6-.7 1.6-1.5 0-.9-.8-1.3-.8-2.2 0-1 .8-1.6 1.8-1.6h1.8a4 4 0 0 0 4-4c0-4.3-3.8-7.7-8.4-7.7z"/><path d="M7.5 12h.01M9.5 8h.01M14.5 8h.01"/>'],
	sys: ['#64748b', '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6"/>'],
	lib: ['#8e8e93', '<path d="M5 6.5h14M5 12h14M5 17.5h14"/><path d="M8.5 4.5v4M15.5 10v4M10 15.5v4"/>'],
	other: ['#8e8e93', '<rect x="4.5" y="4.5" width="15" height="15" rx="3.5"/><path d="M9 12h6M12 9v6"/>']
};
// 顺序有关系：先认具体的（广告过滤、下载、组网），再认大类
const AP_IC_RE = [
	['theme', /^luci-theme-|argon-config|design-config|theme-config/],
	['ad', /adguard|adblock|dnsfilter|smartdns|mosdns|adbyby|koolproxy|unblock/],
	['ctrl', /oaf|appfilter|accesscontrol|timecontrol|parentcontrol|eqos|arpbind|macfilter|banip|fwx/],
	['dl', /aria2|transmission|qbittorrent|deluge|ariang|xunlei|thunder|pikpak|baidupcs|wget/],
	['media', /minidlna|dlna|jellyfin|emby|plex|navidrome|airplay|shairport|kodi|udpxy|iptv|msd_lite/],
	['vpn', /wireguard|wg-|zerotier|tailscale|frp|nps|openvpn|ipsec|softether|n2n|easytier|vnt|natmap|natter|cloudflared|ddnsto|lucky|strongswan|pptp|l2tp/],
	['proxy', /openclash|passwall|ssr-?plus|vssr|bypass|homeproxy|nikki|mihomo|clash|shadowsocks|v2ray|xray|sing-?box|trojan|helloworld|momo|daed|fchomo|naive|hysteria|tuic|ssr$|chinadns|dns2socks|ipt2socks|microsocks/],
	['disk', /samba|ksmbd|diskman|hd-?idle|alist|filebrowser|nfs|vsftpd|ftp|webdav|usb|syncthing|rclone|linkease|cifs|kodexplorer|nextcloud|quickstart|disk|mount|raid|unishare|istorepanel|block-mount|e2fsprogs|ntfs|exfat|f2fs/],
	['mon', /statistics|nlbw|netdata|bandix|wrtbwmon|vnstat|collectd|speedtest|iperf|netspeed|traffic/],
	['box', /docker|dockerman|lxc|podman|containerd/],
	['term', /ttyd|terminal|shellinabox|openssh|dropbear|webshell/],
	['net', /ddns|upnp|miniupnp|wol|etherwake|sqm|mwan|turboacc|qos|firewall|dnsmasq|odhcp|ppp|wireless|wifi|wpad|hostapd|relayd|wan|lan|vlan|ipv6|nat|route|dhcp/],
	['sys', /autoreboot|reboot|cpufreq|cpu-?perf|ramfree|store|package|opkg|apk-|commands|wizard|attendedsysupgrade|upgrade|watchcat|uptime|poweroff|cron|log|acme|nginx|uhttpd|advanced|filetransfer|backup|fan|temp|led|vlmcsd|kms|ota|base-files|busybox|procd|ubus|uci|rpcd|luci$|luci-base|luci-mod|ucode|fstools/],
	['lib', /^lib|^kmod-|^luci-lib-|^luci-i18n-|^perl|^python|^lua|^node|-libs?$/]
];
function apIc(n) {
	const k = String(n || '').toLowerCase().replace(/^luci-app-|^app-meta-/, ''), raw = String(n || '').toLowerCase();
	for (const [c, re] of AP_IC_RE) if (re.test(c === 'lib' || c === 'theme' ? raw : k)) return c;
	return 'other';
}
const apIcHtml = (n) => { const [c, p] = AP_IC[apIc(n)]; return `<span class="apic" style="--c:${c}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg></span>`; };
const apCat = (x) => (x.rom ? 'rom' : x.auto ? 'dep' : x.plugin ? 'plugin' : 'soft');
async function loadApps() {
	apData = await P('app_list', {}, 30000);
	setStatus(true, '在线');
	renderApps();
}
const apSize = (b) => (!b ? '' : b >= 1048576 ? (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
function apWhen(t) {
	if (!t) return '';
	const d = new Date(t * 1000), days = Math.floor((Date.now() / 1000 - t) / 86400);
	if (days <= 0) return '今天';
	if (days < 30) return days + ' 天前';
	return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
}
function renderApps() {
	if (!apData) return;
	const kw = $('apFilter').value.trim().toLowerCase();
	const n = {}; for (const x of apData.list) n[apCat(x)] = (n[apCat(x)] || 0) + 1;
	$$('#apView .chip').forEach((b) => (b.textContent = AP_CAT[b.dataset.v] + ' ' + (n[b.dataset.v] || 0)));
	// 搜索时四类一起搜
	const l = apData.list.filter((x) => (kw ? (x.title + ' ' + x.name + ' ' + (x.desc || '')).toLowerCase().includes(kw) : apCat(x) === apView));
	$('apTitle').textContent = kw ? '搜索结果' : AP_CAT[apView];
	$('apFree').textContent = apData.free != null ? '剩 ' + apSize(apData.free * 1024) : apData.pm;
	$('apCount').textContent = l.length;
	const owner = ME_ROLE.role !== 'sub';
	$('apList').innerHTML = l.length ? l.slice(0, 300).map((x) => `<div class="file aprow" data-n="${esc(x.name)}" role="button" tabindex="0">${apIcHtml(x.name)}<div style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(x.title)}${x.recent ? ' <span class="pill blue" style="font-size:11px">新装</span>' : ''}</b><span class="sub ell" style="display:block;font-size:12.5px">${esc([kw ? AP_CAT[apCat(x)] : '', apWhen(x.at), x.size ? apSize(x.size) : ''].filter(Boolean).join(' · '))}</span></div>
		${owner && !x.no && !x.users.length ? '<button class="btn sm" data-rm>卸载</button>' : ''}</div>`).join('') : `<div class="empty">${kw ? '没有符合的' : '没有'}</div>`;
}
$('apFilter').addEventListener('input', renderApps);
$$('#apView .chip').forEach((b) => (b.onclick = () => { apView = b.dataset.v; $$('#apView .chip').forEach((x) => x.classList.toggle('on', x === b)); renderApps(); }));
async function apRemove(x) {
	const what = [];
	if (/openclash/.test(x.name)) what.push('代理会停，节点、规则等页面不可用。');
	else if (x.net) what.push('可能影响上网。');
	if (apData.pm === 'opkg') what.push('只为它装的依赖一起卸掉。');
	if (!(await confirmBox('卸载 ' + x.title, what.join('\n'), '卸载', true))) return;
	toast('正在卸载…');
	try {
		const r = await P('app_remove', { name: x.name, confirm: 'REMOVE' }, 120000);
		toast('已卸载 ' + r.title + (r.freed ? '，空出 ' + apSize(r.freed * 1024) : ''));
	} catch (e) { toast(e.message, true); }
	loadApps().catch(() => {});
}
$('apList').addEventListener('click', async (e) => {
	const row = e.target.closest('[data-n]'); if (!row || !apData) return;
	const x = apData.list.find((y) => y.name === row.dataset.n); if (!x) return;
	if (e.target.closest('[data-rm]')) return apRemove(x);
	const owner = ME_ROLE.role !== 'sub';
	const rows = [['包名', x.name], ['分类', AP_CAT[apCat(x)]], ['版本', x.ver || '—'], ['大小', apSize(x.size) || '—'], ['安装时间', x.at ? new Date(x.at * 1000).toLocaleString('zh-CN', { hour12: false }) : '—']];
	if (x.users.length) rows.push(['被使用', x.users.slice(0, 6).join('、') + (x.users.length > 6 ? ' 等 ' + x.users.length + ' 个' : '')]);
	const why = x.no || (x.users.length ? '被其他包使用' : !owner ? '只有主账号能卸载' : '');
	const v = await modal(`<h3>${esc(x.title)}</h3>${x.desc ? `<p class="muted" style="margin:4px 0 8px">${esc(x.desc)}</p>` : ''}${rows.map(([k, y]) => `<div class="kv"><span>${esc(k)}</span><span style="overflow-wrap:anywhere;text-align:right">${esc(y)}</span></div>`).join('')}
		${why ? `<div class="notice" style="margin-top:10px">不能卸载：${esc(why)}</div>` : ''}
		<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-v="close">关闭</button>${why ? '' : '<button class="btn danger" data-v="rm">卸载</button>'}</div>`, null, { compact: true });
	if (v === 'rm') apRemove(x);
});

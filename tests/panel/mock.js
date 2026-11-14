// 模拟路由器接口（数据格式取自路由器的真实返回）
const tabs = { op_mode: '模式设置', traffic_control: '流量控制', dns: 'DNS 设置', stream_enhance: '流媒体增强', lan_ac: '黑白名单', dashboard: '外部控制', ipv6: 'IPv6 设置', rules_update: '第三方规则订阅', geo_update: 'GEO 数据库订阅', chnr_update: '大陆白名单订阅', auto_restart: '定时重启', debug: '内核测试', developer: '开发者选项', version_update: '版本更新', oixcloud: 'oixCloud' };
const H = ['0', '1', '2', '3'], HV = ['0:00', '1:00', '2:00', '3:00'], W = ['*', '1', '2'], WV = ['每天', '每周一', '每周二'];
const settings = {
	page: 'settings', sections: [{
		stype: 'openclash', named: false, title: '', tabs, taborder: Object.keys(tabs), opts: [
			{ tab: 'op_mode', o: 'en_mode', cls: 'lvalue', t: '*运行模式', def: 'fake-ip', k: ['fake-ip', 'fake-ip-tun', 'fake-ip-mix'], v: ['Fake-IP（增强）模式', 'Fake-IP（TUN）模式', 'Fake-IP（TUN-混合）模式【UDP-TUN，TCP-转发】'], d: '选择运行模式，如客户端的网络异常请尝试清除 DNS 缓存' },
			{ tab: 'op_mode', o: 'enable_udp_proxy', cls: 'fvalue', t: 'UDP 流量转发', def: '1', en: '1', dis: '0', dep: [{ en_mode: 'redir-host' }, { en_mode: 'fake-ip' }], d: '启用时服务器必须支持 UDP 转发, 在 Fake-IP 模式时，即使关闭此选项，域名类型的连接可能仍将通过核心以保证可用性' },
			{ tab: 'op_mode', o: 'stack_type', cls: 'lvalue', t: '网络栈类型', def: 'mips', k: ['system', 'gvisor', 'mixed', 'mips'], v: ['System', 'gVisor', 'Mixed', 'Mips'], dep: [{ en_mode: 'fake-ip-tun' }, { en_mode: 'fake-ip-mix' }] },
			{ tab: 'op_mode', o: 'proxy_mode', cls: 'lvalue', t: '代理模式', def: 'rule', k: ['rule', 'global', 'direct'], v: ['Rule【策略代理】', 'Global【全局代理（需前往控制面板手动指定节点）】', 'Direct【全局直连】'] },
			{ tab: 'op_mode', o: 'delay_start', cls: 'value', t: '延迟启动（秒）', def: '0', dt: 'uinteger' },
			{ tab: 'op_mode', o: 'small_flash_memory', cls: 'fvalue', t: '小闪存模式', def: '0', en: '1', dis: '0' },
			{ tab: 'op_mode', o: '', cls: 'openclash/switch_mode', t: '' },
			{ tab: 'dns', o: 'enable_redirect_dns', cls: 'lvalue', t: '*本地 DNS 劫持', def: '1', k: ['0', '1', '2'], v: ['禁用', '使用 Dnsmasq 转发', '使用防火墙转发'] },
			{ tab: 'dns', o: 'flush_dns_cache', cls: 'openclash/flush_dns_cache', t: '清理 DNS 缓存' },
			{ tab: 'dns', o: 'dnsmasq_fix', cls: 'button', t: 'Dnsmasq 修复', d: '如果关闭 OpenClash 后无法上网，可尝试此按钮' },
			{ tab: 'dns', o: 'enable_custom_domain_dns_server', cls: 'fvalue', t: '启用第二 DNS 服务器', def: '0', en: '1', dis: '0', dep: [{ enable_redirect_dns: '1' }, { enable_redirect_dns: '0' }] },
			{ tab: 'dns', o: 'custom_domain_dns_server', cls: 'value', t: '指定服务器', def: '114.114.114.114', ph: '114.114.114.114 or 127.0.0.1#5353', dep: [{ enable_custom_domain_dns_server: '1', enable_redirect_dns: '1' }] },
			{ tab: 'dns', o: 'custom_domain_dns', cls: 'tvalue', t: '', d: '每行请只填写一个域名', file: '/etc/openclash/custom/openclash_custom_domain_dns.list', dep: [{ enable_custom_domain_dns_server: '1', enable_redirect_dns: '1' }] },
			{ tab: 'lan_ac', o: 'lan_ac_mode', cls: 'lvalue', t: '局域网访问控制模式', def: '0', k: ['0', '1'], v: ['黑名单模式', '白名单模式'] },
			{ tab: 'lan_ac', o: 'lan_ac_black_macs', cls: 'dynlist', t: '不走代理的局域网设备 Mac', k: ['02:00:00:00:A1:01', '02:00:00:00:B2:02'], v: ['02:00:00:00:A1:01 (10.0.0.175)', '02:00:00:00:B2:02 (192.168.5.1)'], dep: [{ lan_ac_mode: '0' }] },
			{ tab: 'lan_ac', o: 'wan_ac_black_ports', cls: 'dynlist', t: '不走代理的 WAN 端口' },
			{ tab: 'traffic_control', o: 'router_self_proxy', cls: 'fvalue', t: '*路由本机代理', def: '1', en: '1', dis: '0' },
			{ tab: 'traffic_control', o: 'common_ports', cls: 'value', t: '*仅允许常用端口流量', def: '0', k: ['0', '21 22 23 53 80 123 143 194 443 465 587 853 993 995 998 2052 2053'], v: ['禁用', '默认常用端口'] },
			{ tab: 'traffic_control', o: 'intranet_allowed_wan_name', cls: 'dynlist', t: 'WAN 接口名称', k: ['br-lan', 'pppoe-wan', 'eth0'], v: ['br-lan', 'pppoe-wan', 'eth0'], dep: [{ intranet_allowed: '1' }] },
			{ tab: 'traffic_control', o: 'intranet_allowed', cls: 'fvalue', t: '仅允许内网', def: '1', en: '1', dis: '0' },
			{ tab: 'traffic_control', o: 'local_network_pass', cls: 'tvalue', t: '本地 IPv4 绕过地址', file: '/etc/openclash/custom/openclash_custom_localnetwork_ipv4.list' },
			{ tab: 'stream_enhance', o: 'stream_auto_select', cls: 'fvalue', t: '*自动选择解锁节点', def: '0', en: '1', dis: '0' },
			{ tab: 'stream_enhance', o: '清理解锁检测缓存', cls: 'button', t: '清理解锁检测缓存', dep: [{ stream_auto_select: '1' }] },
			{ tab: 'stream_enhance', o: 'stream_auto_select_netflix', cls: 'fvalue', t: '奈飞（Netflix）', def: '0', en: '1', dis: '0', dep: [{ stream_auto_select: '1' }] },
			{ tab: 'stream_enhance', o: 'Netflix', cls: 'openclash/other_stream_option', t: '手动测试', dep: [{ stream_auto_select_netflix: '1' }] },
			{ tab: 'stream_enhance', o: 'Claude', cls: 'openclash/other_stream_option', t: '手动测试' },
			{ tab: 'dashboard', o: 'cn_port', cls: 'value', t: '管理页面端口', def: '9090', dt: 'port' },
			{ tab: 'dashboard', o: 'dashboard_password', cls: 'value', t: '管理页面登录密钥' },
			{ tab: 'dashboard', o: 'Dashboard', cls: 'openclash/switch_dashboard', t: '切换（更新） Dashboard 版本' },
			{ tab: 'dashboard', o: 'Yacd', cls: 'openclash/switch_dashboard', t: '切换（更新） Yacd 版本' },
			{ tab: 'dashboard', o: 'Metacubexd', cls: 'openclash/switch_dashboard', t: '更新 Metacubexd 版本' },
			{ tab: 'dashboard', o: 'Zashboard', cls: 'openclash/switch_dashboard', t: '更新 Zashboard 版本' },
			{ tab: 'ipv6', o: 'ipv6_enable', cls: 'fvalue', t: 'IPv6 流量代理', def: '0', en: '1', dis: '0' },
			{ tab: 'ipv6', o: 'ipv6_mode', cls: 'lvalue', t: 'IPv6 代理模式', def: '0', k: ['0', '1', '2', '3'], v: ['TProxy 模式', 'Redirect 模式', 'TUN 模式', 'Mix 混合模式'], dep: [{ ipv6_enable: '1' }] },
			{ tab: 'geo_update', o: 'geo_auto_update', cls: 'fvalue', t: '自动更新 GeoIP MMDB 数据库', def: '0', en: '1', dis: '0' },
			{ tab: 'geo_update', o: 'geo_update_week_time', cls: 'lvalue', t: '更新时间(每周)', def: '1', k: W, v: WV, dep: [{ geo_auto_update: '1' }] },
			{ tab: 'geo_update', o: 'geo_update_day_time', cls: 'lvalue', t: '更新时间(每天)', def: '0', k: H, v: HV, dep: [{ geo_auto_update: '1' }] },
			{ tab: 'geo_update', o: 'geo_custom_url', cls: 'value', t: 'GeoIP MMDB 数据库更新 URL', def: 'https://testingcf.jsdelivr.net/gh/alecthw/mmdb_china_ip_list@release/lite/Country.mmdb', k: ['https://testingcf.jsdelivr.net/gh/alecthw/mmdb_china_ip_list@release/lite/Country.mmdb', 'https://github.com/alecthw/mmdb_china_ip_list/releases/latest/download/Country-lite.mmdb'], v: ['Alecthw-lite-testingcf-Version(默认)', 'Alecthw-lite-github-Version'], dep: [{ geo_auto_update: '1' }] },
			{ tab: 'geo_update', o: 'GEOIP Update', cls: 'button', t: '更新 GeoIP MMDB 数据库', d: '当前版本: 2026-10-26 00:00:00' },
			{ tab: 'chnr_update', o: 'chnr_auto_update', cls: 'fvalue', t: '自动更新', def: '0', en: '1', dis: '0' },
			{ tab: 'chnr_update', o: 'Chnroute Lists Update', cls: 'button', t: '更新大陆白名单' },
			{ tab: 'auto_restart', o: 'auto_restart', cls: 'fvalue', t: '定时重启', def: '0', en: '1', dis: '0' },
			{ tab: 'debug', o: '', cls: 'openclash/debug', t: '' },
			{ tab: 'developer', o: 'firewall_custom', cls: 'tvalue', t: '', d: '自定义防火墙规则', file: '/etc/openclash/custom/openclash_custom_firewall_rules.sh' },
			{ tab: 'version_update', o: '', cls: 'openclash/update', t: '' },
			{ tab: 'oixcloud', o: '', cls: 'openclash/oix_login', t: '' },
		] }, {
		stype: 'lan_ac_traffic', title: '来源流量访问控制', desc: '1. 来自本地指定 IP 的流量', addremove: true, tabs: [], opts: [
			{ o: 'comment', cls: 'value', t: '注释' },
			{ o: 'enabled', cls: 'fvalue', t: '启用', def: '1', en: '1', dis: '0' },
			{ o: 'src_ip', cls: 'value', t: '内部地址', ph: '0.0.0.0/0', k: ['localnetwork', '10.0.0.175'], v: ['内部网络地址', '10.0.0.175'] },
			{ o: 'proto', cls: 'lvalue', t: '通讯协议', def: 'both', k: ['both', 'udp', 'tcp'], v: ['Both', 'UDP', 'TCP'] },
			{ o: 'target', cls: 'lvalue', t: '对象', k: ['return', 'accept', 'drop'], v: ['RETURN', 'ACCEPT', 'DROP'] },
		] }],
};
const owTabs = { settings: '常规设置', dns: 'DNS 设置', meta: 'Meta 设置', smart: 'Smart 设置', rules: '规则设置' };
const overwrite = {
	page: 'config-overwrite', sections: [{
		stype: 'openclash', tabs: owTabs, taborder: Object.keys(owTabs), opts: [
			{ tab: 'settings', o: 'interface_name', cls: 'lvalue', t: '绑定网络接口', def: '0', k: ['0', 'br-lan', 'pppoe-wan'], v: ['禁用', 'br-lan', 'pppoe-wan'] },
			{ tab: 'settings', o: 'log_level', cls: 'lvalue', t: '日志等级', def: '0', k: ['0', 'info', 'warning', 'error', 'debug', 'silent'], v: ['禁用', 'Info【信息】', 'Warning【警告】', 'Error【错误】', 'Debug【调试】', 'Silent【静默】'] },
			{ tab: 'settings', o: 'mixed_port', cls: 'value', t: 'HTTP(S)&SOCKS5 混合代理端口', def: '7893', dt: 'port' },
			{ tab: 'dns', o: 'enable_custom_dns', cls: 'fvalue', t: '*自定义上游 DNS 服务器', def: '0', en: '1', dis: '0' },
			{ tab: 'dns', o: 'custom_host', cls: 'fvalue', t: 'Hosts', def: '0', en: '1', dis: '0' },
			{ tab: 'dns', o: 'custom_hosts', cls: 'tvalue', t: '', d: '设置自定义 Hosts', file: '/etc/openclash/custom/openclash_custom_hosts.list', dep: [{ custom_host: '1' }] },
			{ tab: 'meta', o: 'enable_tcp_concurrent', cls: 'fvalue', t: '*启用 TCP 并发', def: '0', en: '1', dis: '0' },
			{ tab: 'meta', o: 'find_process_mode', cls: 'lvalue', t: '启用进程规则', def: '0', k: ['0', 'off', 'always', 'strict'], v: ['禁用', 'OFF', 'Always', 'strict'] },
			{ tab: 'smart', o: 'smart_policy_priority', cls: 'value', t: 'Policy Priority(权重加成)', ph: 'Premium:0.9;SG:1.3' },
			{ tab: 'smart', o: 'Model Update', cls: 'button', t: '更新模型' },
			{ tab: 'smart', o: 'flush_smart_cache', cls: 'openclash/flush_smart_cache', t: '清理 Smart 缓存' },
			{ tab: 'rules', o: 'enable_custom_clash_rules', cls: 'fvalue', t: '*自定义规则', def: '0', en: '1', dis: '0' },
			{ tab: 'rules', o: 'custom_rules', cls: 'tvalue', t: '', d: '（优先匹配）', file: '/etc/openclash/custom/openclash_custom_rules.list', dep: [{ enable_custom_clash_rules: '1' }] },
		] }, {
		stype: 'dns_servers', title: '设置自定义上游 DNS 服务器', addremove: true, opts: [] }, {
		stype: 'authentication', title: '设置 SOCKS5/HTTP(S) 认证信息', addremove: true, opts: [
			{ o: 'enabled', cls: 'fvalue', t: '启用', def: '1', en: '1', dis: '0' }, { o: 'username', cls: 'value', t: '用户名', ph: '空值无效' }, { o: 'password', cls: 'value', t: '密码', ph: '空值无效' }] }],
};
const subscribe = { page: 'config-subscribe', sections: [{ stype: 'openclash', opts: [
	{ o: 'auto_update', cls: 'fvalue', t: '自动更新', def: '0', en: '1', dis: '0' },
	{ o: 'config_auto_update_mode', cls: 'lvalue', t: '更新模式', def: '0', k: ['0', '1'], v: ['预约', '循环'], dep: [{ auto_update: '1' }] },
	{ o: 'config_update_week_time', cls: 'lvalue', t: '更新时间(每周)', def: '1', k: W, v: WV, dep: [{ config_auto_update_mode: '0' }] },
	{ o: 'config_update_interval', cls: 'value', t: '更新间隔(分钟)', def: '60', dep: [{ config_auto_update_mode: '1' }] }] }] };
const subEdit = { page: 'config-subscribe-edit', sections: [{ stype: 'config_subscribe', named: true, opts: [
	{ o: 'name', cls: 'value', t: '配置文件名', ph: '配置', d: '用于区分，请勿重名' },
	{ o: 'address', cls: 'tvalue', t: '订阅地址', ph: '空值无效', d: '在线订阅转换支持多个地址' },
	{ o: 'sub_ua', cls: 'value', t: 'User-Agent', def: 'clash-verge/v2.4.5', k: ['clash-verge/v2.4.5', 'clash.meta/1.19.20', 'Clash'], v: ['clash-verge/v2.4.5', 'clash.meta/1.19.20', 'Clash'] },
	{ o: 'sub_convert', cls: 'fvalue', t: '在线订阅转换', def: '0', en: '1', dis: '0' },
	{ o: 'template', cls: 'lvalue', t: '订阅转换模板', k: ['带Urltest', 'ACL4SSR 规则标准版', '0'], v: ['带Urltest', 'ACL4SSR 规则标准版', '自定义模板'], dep: [{ sub_convert: '1' }] },
	{ o: 'custom_template_url', cls: 'value', t: '自定义模板地址', dep: [{ template: '0' }] },
	{ o: 'keyword_option', cls: 'fvalue', t: '节点筛选', def: '0', en: '1', dis: '0' },
	{ o: 'keyword', cls: 'dynlist', t: '筛选节点', dep: [{ keyword_option: '1' }] },
	{ o: 'de_ex_keyword', cls: 'mvalue', t: '排除无效节点', k: ['到期', '流量', '套餐', '官网'], v: ['到期', '流量', '套餐', '官网'], dep: [{ keyword_option: '1' }] },
	{ o: 'ad_option', cls: 'fvalue', t: '高级选项', def: '0', en: '1', dis: '0' },
	{ o: 'config_age_algo', cls: 'lvalue', t: 'Age 密钥类型', k: ['keygen', 'pq'], v: ['x25519', 'PQ (mlkem768-x25519)'], dep: [{ ad_option: '1' }] },
	{ o: 'config_age_secret', cls: 'value', t: '私钥', dep: [{ ad_option: '1' }] },
	{ o: 'config_age_public', cls: 'value', t: '公钥', dep: [{ ad_option: '1' }] },
	{ o: '_generate_age_btn', cls: 'openclash/generate_age', t: '', dep: [{ ad_option: '1' }] }] }] };
const dnsEdit = { page: 'custom-dns-edit', sections: [{ stype: 'dns_servers', named: true, opts: [
	{ o: 'group', cls: 'lvalue', t: '服务器分组', def: 'nameserver', k: ['nameserver', 'fallback', 'default'], v: ['NameServer', 'FallBack', 'Default-NameServer'] },
	{ o: 'ip', cls: 'value', t: '服务器地址' }, { o: 'port', cls: 'value', t: '服务器端口' },
	{ o: 'type', cls: 'lvalue', t: '服务器类型', def: 'udp', k: ['udp', 'tcp', 'tls', 'https', 'quic'], v: ['UDP', 'TCP', 'TLS', 'HTTPS', 'QUIC'] },
	{ o: 'http3', cls: 'fvalue', t: '强制 HTTP/3', en: '1', dis: '0', dep: [{ type: 'https' }] },
	{ o: 'specific_group', cls: 'value', t: '指定策略组（支持正则匹配）', def: 'Disable', k: ['Zou', 'Auto'], v: ['Zou', 'Auto'], dep: [{ group: 'nameserver' }, { group: 'fallback' }] }] }] };

const cfg = { en_mode: 'fake-ip-mix', proxy_mode: 'rule', enable_custom_clash_rules: '1', enable_redirect_dns: '1', cn_port: '9090', dashboard_password: 'secret123', lan_ac_mode: '0', lan_ac_black_macs: ['02:00:00:00:A1:01'], enable_custom_dns: '1', unlock_check_services: 'ytb,openai,claude,bilibili', config_path: '/etc/openclash/config/zou.yaml', intranet_allowed: '1', intranet_allowed_wan_name: ['pppoe-wan'] };
const state = {
	running: true, core: 'alpha-gbc76c13', plugin: '0.48.002-r9', mode: 'rule', log_level: 'warning', lan_ip: '192.168.5.1', cfg,
	files: [
		{ name: 'zou.yaml', path: '/etc/openclash/config/zou.yaml', size: 224450, mtime: 1793162940, active: true, sub: 'zou' },
		{ name: 'liangxinyun.yaml', path: '/etc/openclash/config/liangxinyun.yaml', size: 55713, mtime: 1793001360, active: false, sub: 'liangxinyun' },
	],
	subs: [
		{ sid: 'cfg29b6bc', name: 'zou', address: 'https://sub.example.com/api/v1/client/subscribe?token=abcdef', sub_ua: 'clash.meta', enabled: '1' },
		{ sid: 'cfg2ab6bc', name: 'liangxinyun', address: 'https://liang.example.net/s/xyz', enabled: '0', sub_convert: '1' },
	],
	dns: [], overwrite: [], auth: [], jobs: { sub: false, geo: false, chnroute: false, core: false, plugin: false, debug: false, service: false },
};
const groups = { groups: [
	{ name: 'Zou', type: 'Selector', now: '🇭🇰香港02 专线 3x', nodes: [{ name: 'Auto', type: 'URLTest', group: true }, { name: '🇭🇰香港02 专线 3x', type: 'Trojan', delay: 88 }, { name: '🇯🇵日本01 超长名字节点名字节点名字节点名字节点', type: 'Vmess', delay: 0 }, { name: '🇹🇼台湾01', type: 'Trojan', delay: 320 }] },
	{ name: 'Auto', type: 'URLTest', now: '🇭🇰香港02 专线 3x', nodes: [{ name: '🇭🇰香港02 专线 3x', type: 'Trojan', delay: 88 }] },
] };
const BL = []; const BLREADY = { v: false };
// 流量：今天、昨天和之前 20 天
const TFD = (() => {
	const today = '2026-10-29', days = {};
	const sh = (n) => { const x = new Date(today + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
	const G = 1073741824;
	for (let i = 0; i < 40; i++) days[sh(-i)] = { 'aa:bb:cc:dd:ee:ff': [0.1 * G, (2 + (i % 5)) * G, 0.02 * G, 0.5 * G], '11:22:33:44:55:66': [0.01 * G, (i % 3) * G, 0, 1.2 * G], router: [0.001 * G, 0.05 * G, 0, 0.01 * G] };
	days[today] = { 'aa:bb:cc:dd:ee:ff': [0.2 * G, 3 * G, 0.01 * G, 0.4 * G], '11:22:33:44:55:66': [0, 0.5 * G, 0, 0.8 * G], router: [0, 0.02 * G, 0, 0], other: [0, 0.01 * G, 0, 0], 'de:ad:be:ef:00:01': [0, 0.001 * G, 0, 0] };
	return { d: { days, names: { 'aa:bb:cc:dd:ee:ff': 'iPhone', '11:22:33:44:55:66': 'TV' }, today, at: 1793250000 } };
})();
// 用真路由器（Kwrt）读到的菜单，再加两个测试用的插件（Frp、ZeroTier）
const MENU = { items: [...JSON.parse(require('fs').readFileSync(__dirname + '/realmenu.json', 'utf8')),
	{ p: 'admin/services/frpc', t: 'Frp 内网穿透', g: '服务', kids: [] },
	{ p: 'admin/vpn/zerotier', t: 'ZeroTier', g: 'VPN', kids: [['admin/vpn/zerotier/base', '基本设置'], ['admin/vpn/zerotier/interface', '接口信息']] },
] };
const PZ = { devs: {}, calls: [], schedOn: false };
const ASW = { sub: { at: 1793249000, name: 'zou', up: 1224191028, down: 30586976742, total: 322122547200, expire: 1795706585 }, enabled: true, group: 'Zou', hist: [{ t: 1793240000, from: '🇭🇰香港04 专线 3x', to: '🇭🇰香港02 专线 3x', d: 38, same: true }, { t: 1793200000, from: '🇭🇰香港02 专线 3x', to: '🇹🇼台湾01', d: 120, same: false }],
	dryRes: { cur: '🇭🇰香港02 专线 3x', node: true, curDelay: 88, region: 'HK', pick: { n: '🇭🇰香港05 专线', d: 41 }, same: true, tested: 30, ok: 27 } };
const PXM = { px: null, cur: 'n1', nodes: [{ id: 'n1', name: '香港 01', kind: 'Xray', addr: 'hk.example.com', port: '443', group: '' }, { id: 'n2', name: '日本 02', kind: 'sing-box', addr: 'jp.example.com', port: '8443', group: '' }, { id: 'n3', name: '美国 03', kind: 'Xray', addr: 'us.example.com', port: '443', group: '' }], calls: [], selfbuilt: false };
const AUTO = { oc: true, memguard: true, tb: { on: true, auto: false, at: 0, status: '已开启' }, failSet: false, on: { tunrestart: true, panelrestart: true, cacheclean: true, route: true, daily: true, newdev: true, cloudbackup: true }, autosw: true, cloud: true };
function respond(method, p) {
	const m = method.replace(/^panel\//, '');
	switch (method) {
	case 'initialize': return { serverInfo: { version: '2.2.0' } };
	case 'tools/call': return { content: [{ type: 'text', text: p.name === 'list_services' ? '服务 | 自启 | 状态\nopenclash | 是 | 运行中\nclaude-mcp | 是 | 运行中\ndnsmasq | 是 | 运行中' : '好的：' + p.name }] };
	}
	switch (m) {
	case 'overview': return { ...(PXM.px ? { px: PXM.px } : {}), clash: { running: OC.running, busy: !!OC.busy, line: OC.line || { t: '2026-10-28 22:09:34', lv: '提示', msg: 'OpenClash 启动成功，请等待服务器上线！' }, version: 'alpha-gbc76c13', mode: OC.mode, connections: 120, download_total: 1.1e9, upload_total: 2.8e8, config: '/etc/openclash/config/zou.yaml', custom_rules: true }, system: { model: 'Xiaomi AX3000T', firmware: 'Kwrt 24.10', uptime: 345678, load: '0.42', cpus: 2, cpu: 23.4, mem_total: 268435456, mem_avail: 100000000, temp: 58 }, wan: { up: true, proto: 'pppoe', ip: '36.1.2.3', uptime: 99999 }, speed: { dev: 'pppoe-wan', rx: 1234567, tx: 54321, rx_total: 9e10, tx_total: 1e10 } };
	case 'oc_state': return state;
	case 'oc_schema': return { settings, 'config-overwrite': overwrite, 'config-subscribe': subscribe, 'config-subscribe-edit': subEdit, 'custom-dns-edit': dnsEdit }[p.page];
	case 'groups': return groups;
	case 'providers': return { proxies: [{ name: 'airport', vehicle: 'HTTP', updated: new Date(Date.now() - 7200e3).toISOString(), count: 42, info: { Total: 2e11, Upload: 1e9, Download: 5e10 } }], rules: [{ name: 'cn_domain', behavior: 'domain', format: 'mrs', vehicle: 'HTTP', updated: new Date().toISOString(), count: 8888 }] };
	case 'devices': return { devices: [{ ip: '192.168.5.8', mac: 'aa:bb:cc:dd:ee:ff', name: 'iPhone', online: true, stats: { conns: 12, dl: 123456789, ul: 1234567, proxied: 3 } }, { ip: '192.168.5.20', name: null, online: false }] };
	case 'connections': return { total: 2, connections: [{ id: 'a', host: 'www.douyin.com', port: '443', net: 'tcp', src: '192.168.5.8', src_name: 'iPhone', rule: 'DomainSuffix:douyin.com', chain: ['🇹🇼台湾01', 'Zou'], dl: 123456, ul: 2345, start: new Date().toISOString() }, { id: 'b', host: 'baidu.com', port: '443', net: 'tcp', src: '192.168.5.8', rule: 'GeoIP:cn', chain: ['DIRECT'], dl: 100, ul: 10 }] };
	case 'core_ps': return { running: true, pid: 10645, rss: 74260480 };
	case 'sub_info': return { ok: true, upload: 1e9, download: 6.2e10, total: 2e11, expire: 1830000000 };
	case 'jobs': return { jobs: state.jobs, log: '' };
	case 'myip': return { domestic: { src: 'IPIP.net', ip: '36.1.2.3', geo: '中国 台湾 台北 中华电信' }, overseas: [{ src: 'IP.SB', ip: '45.1.2.3', geo: 'Hong Kong HK 某机房' }, { src: 'ip-api', ip: '45.1.2.3', geo: '香港 香港 某云', kind: '机房 IP', asn: 'AS1 X' }, { src: 'Cloudflare', ip: '45.1.2.3', geo: 'HK · 机房 HKG' }], v6: null };
	case 'site_check': return { sites: [{ key: 'baidu', ok: true, code: 200, ms: 45 }, { key: 'taobao', ok: true, code: 200, ms: 117 }, { key: 'google', ok: true, code: 204, ms: 260 }, { key: 'github', ok: true, code: 200, ms: 640 }, { key: 'youtube', ok: true, code: 200, ms: 1500 }, { key: 'claude', ok: false, code: 0, ms: null }] };
	case 'unlock': { const ST = { ytb: [0, ''], claude: [1, ''] }; return { results: (p.services || ['claude']).map((k) => ({ key: k, label: k, st: (ST[k] || [2])[0], region: (ST[k] || [2, 'HK'])[1], node: '🇭🇰香港02 专线 3x' })) }; }
	case 'diag': return { text: 'OpenClash 连接诊断结果\n域名：' + p.addr };
	case 'files': return { files: p.kind === 'overwrite' ? [{ name: 'default', size: 3000, mtime: 1793001360 }, { name: 'Tailscale', size: 300, mtime: 1793001360 }] : [{ name: 'rules.yaml', size: 1200, mtime: 1793001360 }] };
	case 'file_read': return { name: p.name, size: 40, mtime: 1, content: p.name.endsWith('.list') ? 'rules:\n- DOMAIN-SUFFIX,douyin.com,🇹🇼台湾01\n' : 'mixed-port: 7893\nproxies: []\n' };
	case 'oc_sections': return { sections: p.type === 'dns_servers' ? [{ sid: 'cfg026193', enabled: '1', group: 'nameserver', ip: '114.114.114.114', type: 'udp' }, { sid: 'cfg036193', enabled: '0', group: 'fallback', ip: 'dns.google', type: 'https', port: '443', specific_group: 'Zou' }] : p.type === 'authentication' ? [{ sid: 'cfg28b425', enabled: '1', username: 'Clash', password: 'xx' }] : p.type === 'config_overwrite' ? [{ sid: 'cfg2741a1', name: 'default', enable: '0', url: 'https://raw.githubusercontent.com/x/default', type: 'http', order: '1', update_days: 'off', update_hour: 'off' }] : [] };
	case 'rules': return { total: 3000, matched: p.filter ? 2 : 3000, rules: [{ i: 1, type: 'DomainSuffix', payload: 'douyin.com', proxy: '🇹🇼台湾01' }, { i: 2, type: 'RuleSet', payload: 'cn_domain', proxy: 'DIRECT', size: 8888 }, { i: 3, type: 'Match', payload: '', proxy: 'REJECT' }] };
	case 'logs': return { plugin: '2026-10-28 12:31:17 [Info] 【1/10】Reload OpenClash Firewall Rules...\n2026-10-28 12:31:19 [Tip] DNS Hijacking Mode is Dnsmasq Redirect...', core: 'time="2026-10-28T04:37:02.593821622Z" level=warning msg="[TCP] dial DIRECT error"\ntime="2026-10-28T04:37:08.552444596Z" level=info msg="[TCP] 192.168.5.8 match GeoIP(cn) using DIRECT"', start: '2026-10-28 12:31:20 [Tip] Firewall Reload Successful!', level: 'warning', size: 12345 };
	case 'dashboard_state': return { dashboard_type: 'Official', yacd_type: 'Meta', default_dashboard: 'metacubexd', installed: { dashboard: false, yacd: false, metacubexd: true, zashboard: true }, port: '9090', lan_ip: '192.168.5.1', secret: 'se cret/1' };
	case 'versions': return { core: 'alpha-gbc76c13', plugin: '0.48.002-r9', latest: { plugin: 'v0.48.002', core_meta: 'alpha-gbc76c13' }, branch: 'master' };
	case 'backup_file': return { url: 'dl/abc/openclash-config.tar.gz', name: 'openclash-config.tar.gz', size: 20480 };
	case 'file_download': return { url: 'dl/abc/' + p.name, name: p.name, size: 100 };
	case 'set_mode': OC.mode = p.mode; return { ok: true };
	case 'traffic': return TFD.d;
	case 'speed_last': return { proxy: null, direct: null };
	case 'bk_list': return { list: [], max: 10, auto: true, running: false };
	case 'px': return PXM.px;
	case 'px_nodes': return { cur: PXM.cur, list: PXM.nodes };
	case 'px_set': PXM.calls.push(['set', p.id, p.node]); PXM.cur = p.node; return { ok: true };
	case 'px_ctl': PXM.calls.push(['ctl', p.id, p.op]); return { ok: true };
	case 'px_delay': PXM.calls.push(['delay', p.id]); return { list: { n1: 88, n2: 0, n3: 260 } };
	case 'feedback_diag': return { text: '面板版本：2.0.6\n代理插件：PassWall（正在用）', hosted: !PXM.selfbuilt };
	case 'px_switch': PXM.calls.push(['switch', p.id]); return { ok: true };
	case 'feedback': PXM.calls.push(['fb', p.text, p.contact, p.diag, (p.images || []).length, (p.images || []).every((x) => /^data:image\/jpeg;base64,/.test(x))]); return PXM.selfbuilt ? { ok: true, sent: 'github', url: 'https://github.com/x/y/issues/new?title=a' } : { ok: true, sent: 'hub', images: (p.images || []).length };
	case 'auto': {
		if (p && p.set) { if (p.memguard != null) AUTO.memguard = !!p.memguard; if (p.tunbypass != null) { if (AUTO.failSet) throw new Error('设置失败：测试'); AUTO.tb = { on: !!p.tunbypass, want: !!p.tunbypass, auto: false, at: 0, status: p.tunbypass ? '已开启' : '已关闭：面板关闭' }; }
			for (const k of ['tunrestart', 'panelrestart', 'cacheclean', 'route', 'daily', 'newdev', 'cloudbackup']) if (p[k] != null) AUTO.on[k] = !!p[k];
			if (p.autosw != null) AUTO.autosw = !!p.autosw; }
		return { oc: AUTO.oc, px: AUTO.oc ? 'OpenClash' : '', memguard: AUTO.memguard, tb: AUTO.tb, on: { ...AUTO.on }, autosw: AUTO.oc ? AUTO.autosw : null, cloud: AUTO.cloud, route: AUTO.oc };
	}
	case 'daily': if (p && p.run) { DYD.runs++; DYD.d = { t: Math.floor(Date.now() / 1000), ok: false, summary: '发现 2 个问题', items: [{ lvl: 'ok', title: '过去 24 小时没有断线', detail: '' }, { lvl: 'warn', title: '24 小时内有 1 台新设备连上', detail: 'iPhone（192.168.5.50）' }, { lvl: 'ok', title: '内存正常（可用 61 MB）', detail: '' }, { lvl: 'err', title: '温度过高：88°C', detail: '检查通风' }] }; } return DYD.d || { none: true };
	case 'luci_menu': return { items: MENU.items };
	case 'update_check': return { cur: '1.3.1', code: 'hosted-ai', latest: '1.3.1', notes: '', newer: false, force: false };
	case 'update_status': return { state: 'idle', cur: '1.3.1' };
	case 'svc_info': return { hosted: false };
	case 'live': { const t = Date.now() / 1000; return { dev: 'pppoe-wan', rx: Math.round(3.6e6 + 1.2e6 * Math.sin(t / 3) + 8e5 * Math.sin(t * 1.7)), tx: Math.round(7e5 + 2.5e5 * Math.sin(t / 2)) }; }
	case 'home_stats': return { today: { day: '2026-11-01', dl: 26.3e9, ul: 3.1e9, counting: true, top: [{ id: 'aa:bb:cc:00:00:01', name: 'Living-Room-TV', dl: 9.6e9, ul: 0.4e9 }, { id: 'aa:bb:cc:00:00:02', name: 'Desk-PC', dl: 4.9e9, ul: 0.3e9 }, { id: 'aa:bb:cc:00:00:03', name: null, dl: 4.1e9, ul: 0.4e9 }] }, devices: { online: 13, wifi: 9, wired: 4, total: 15 } };
	case 'pause_list': return { devs: PZ.devs, now: Math.floor(Date.now() / 1000) };
	case 'pause_set': {
		PZ.calls.push(p);
		const e = PZ.devs[p.mac] || {};
		if (p.name) e.name = p.name;
		if (p.resume) delete e.until;
		if (p.until) e.until = p.until;
		if (p.sched) e.sched = p.sched;
		if (!e.until && !(e.sched || []).length) delete PZ.devs[p.mac]; else { e.on = !!e.until || PZ.schedOn; PZ.devs[p.mac] = e; }
		return { devs: PZ.devs, now: Math.floor(Date.now() / 1000) };
	}
	case 'autosw': {
		if (p.set) { if (p.enabled != null) ASW.enabled = !!p.enabled; if (p.group) ASW.group = p.group; }
		const r = { enabled: ASW.enabled, group: ASW.group, now: ASW.group === 'Zou' ? groups.groups[0].now : 'Auto', groups: ['Zou', 'Media'], hist: ASW.hist, sub: ASW.sub };
		if (p.dry) r.dry = ASW.dryRes;
		return r;
	}
	case 'node_check': return OC.nodeOk ? { ok: true, delay: 150 } : { ok: false, delay: 0 };
	case 'quick': if (p.action === 'start') OC.running = true; if (p.action === 'stop') OC.running = false; return { ok: true, msg: '已执行 ' + p.action, text: p.action === 'debug' ? 'debug log...' : undefined };
	case 'age': return p.op === 'public' ? { public: 'age1pubpubpub' } : { secret: 'AGE-SECRET-KEY-1AAAAAA', public: 'age1abcdef' };
	case 'oc_sec': return { ok: true, sid: p.sid || 'cfgnew01' };
	case 'black_state': return { entries: BL, devices: [{ ip: '192.168.5.8', mac: 'aa:bb:cc:dd:ee:ff', name: 'iPhone', online: true, stats: { conns: 12, dl: 123456789, ul: 1234567, proxied: 3 } }, { ip: '192.168.5.20', mac: '11:22:33:44:55:66', name: 'TV', online: true }, { ip: '192.168.5.9', mac: null, name: null, online: false }], ready: BLREADY.v, live: BLREADY.v, custom_on: true, lan_ac_mode: '0' };
	case 'black_set': if (p.on) BL.push({ mac: p.mac || null, ip: p.ip, name: p.name || null, pinned: !!p.mac, at: 1793169000 }); else BL.splice(BL.findIndex((e) => (e.mac || e.ip) === (p.mac || p.ip)), 1); return { ok: true, ip: p.ip, pinned: !!p.mac, live: BLREADY.v, need_setup: !BLREADY.v };
	case 'black_setup': BLREADY.v = true; return { ok: true, restarting: true };
	case 'term': return { out: p.cmd.startsWith('cd ') ? '' : 'output of ' + p.cmd + '\nline2', code: p.cmd === 'false' ? 1 : 0, cwd: p.cmd.startsWith('cd ') ? p.cmd.slice(3) : p.cwd };
	case 'fs_list': return { path: p.path, free: '30.1M 可用 / 共 80M', items: p.path === '/' ? [{ name: 'etc', dir: true, size: 0, mtime: 1793169000, mode: '755' }, { name: 'tmp', dir: true, size: 0, mtime: 1793169000, mode: '777' }] : [{ name: 'config', dir: true, size: 0, mtime: 1793169000, mode: '755' }, { name: 'zou.yaml', dir: false, size: 224450, mtime: 1793169000, mode: '644' }, { name: 'clash', dir: false, link: true, size: 30000000, mtime: 1793169000, mode: '755' }] };
	case 'fs_read': return { path: p.path, size: 20, mtime: 1, content: 'mixed-port: 7893\n' };
	case 'fs_download': return { url: 'dl/x/' + p.path.split('/').pop(), name: p.path.split('/').pop(), size: 100 };
	case 'wd': case 'wd_check': { const n = WD.base; return { running: true, now: n, uptime: 3000, heartbeat: n - 100, state: { WAN: 'ok', NET: 'ok', DNS: 'ok', TUN: 'ok', PANEL: 'ok', CLASH: 'ok', READY: '4', CHECK_T: String(n - 12) }, events: WD.cleared ? [{ t: n, lvl: 'info', kind: 'watchdog', msg: '记录已清空', detail: '', from: 0, to: 0 }] : [
		{ t: n - 600, lvl: 'ok', kind: 'tunnel', msg: '隧道恢复，面板和 Claude 可以连上了（断了 3 分钟）', detail: '原因：隧道程序在运行，但连不上 Cloudflare', from: n - 780, to: n - 600 },
		{ t: n - 720, lvl: 'warn', kind: 'watchdog', msg: '已自动重启隧道（1 小时内第 1 次）', detail: '', from: 0, to: 0 },
		{ t: n - 750, lvl: 'err', kind: 'tunnel', msg: '隧道断开：隧道程序在运行，但连不上 Cloudflare（这段时间面板和 Claude 都连不上路由器）', detail: '隧道日志：\n{"level":"error","error":"connection terminated <script>x</script>","message":"Unregistered tunnel connection"}', from: 0, to: 0 },
		{ t: n - 3 * 86400, lvl: 'err', kind: 'boot', msg: '路由器意外重启：断电、拔了电源或系统死机（重启前没有正常关机）', detail: '开机时间 10-25 18:43:10\n最后一次正常运行记录 10-25 15:58:00\n期间大约断了 165 分钟', from: n - 3 * 86400 - 9900, to: n - 3 * 86400 },
		{ t: n - 4 * 86400, lvl: 'info', kind: 'clash', msg: 'OpenClash 重启了（期间会断网十几秒）', detail: '2026-10-24 06:00:01 [Info] 订阅更新', from: 0, to: 0 },
		{ t: n - 9 * 86400, lvl: 'info', kind: 'watchdog', msg: '看门狗已启动，开始记录断线原因', detail: '', from: 0, to: 0 }] }; }
	case 'wd_clear': WD.cleared = true; return { ok: true };
	case 'luci_key': return { key: LK.key };
	case 'slog': return { text: p.kind === 'kern' ? '[    1.000000] Booting Linux on physical CPU 0x0\n[    2.500000] mtk_soc_eth: eth0 link up' : 'Thu Oct 29 00:46:40 2026 daemon.info dnsmasq[1]: started, version 2.90\nThu Oct 29 00:46:41 2026 daemon.err uwsgi[2]: error: worker died\nThu Oct 29 00:46:42 2026 daemon.warn odhcpd[3]: warning: no prefix\nThu Oct 29 00:46:43 2026 kern.info kernel: br-lan: port 1 entered forwarding state' };
	case 'procs': return { total: 416000, avail: 46000, list: [
		{ pid: 1, ppid: 0, st: 'S', mem: 940, name: 'procd', cmd: '/sbin/procd', cpu: 0, sys: true },
		{ pid: 2, ppid: 0, st: 'S', mem: 0, name: 'kthreadd', cmd: '[kthreadd]', cpu: 0, sys: true },
		{ pid: 77, ppid: 2, st: 'I', mem: 0, name: 'kworker/0:1', cmd: '[kworker/0:1]', cpu: 0, sys: false },
		{ pid: 22919, ppid: 1, st: 'S', mem: 120000, name: 'clash', cmd: '/etc/openclash/clash -d /etc/openclash -f /etc/openclash/zou.yaml', cpu: 5, sys: false },
		{ pid: 8286, ppid: 1, st: 'S', mem: 30000, name: 'cloudflared', cmd: '/usr/bin/cloudflared tunnel run --token ***', cpu: 1, sys: true },
		{ pid: 8534, ppid: 1, st: 'S', mem: 52000, name: 'dockerd', cmd: '/usr/bin/dockerd --config-file=/tmp/dockerd/daemon.json', cpu: 25, sys: false }] };
	case 'kill': KILLED.push(p); return { ok: true, name: 'clash' };
	case 'cloud_info': return { enabled: true, url: 'https://router.example/cloud', tablet: 'https://router.example/cloud/beat/t/tabletkey123' };
	case 'notices': return { now: Math.round(Date.now() / 1000), app: null, ann: [], annAt: 0, annFail: false, events: [], fb: [], hosted: true, seen: { t: Date.now() + 864e5, pop: [] } };
	case 'notices_seen': return { ok: true };
	case 'chat': return { ok: true, msgs: [], uu: 0, seq: 0, hosted: true };
	default: return { ok: true };
	}
}
const OC = { mode: 'rule', running: true };
const LK = { key: 'lk123' }, KILLED = [];
const WD = { cleared: false, base: Math.floor(Date.now() / 1000) };
// 云端监测（Cloudflare Worker）的模拟返回
const LABEL = { ok: '一切正常', partial: '在线，但有问题', tunnel: '隧道断开', noreport: '路由器报告中断', power: '路由器断电或死机', net: '家里断网', down: '路由器离线', wait: '等待数据' };
function cloudStatus(mode, tablet = true) {
	const now = Date.now(), m = 60e3;
	const st = {
		ok: { state: 'ok', since: now - 3600e3, msg: '路由器在线，一切正常' },
		power: { state: 'power', since: now - 7 * m, outStart: now - 7 * m, msg: '平板还在报告，家里宽带是好的；可能是路由器断电、死机，或它和中兴路由器之间的网线断了' },
		net: { state: 'net', since: now - 4 * m, outStart: now - 9 * m, msg: '路由器和平板都没有报告；可能是宽带、光猫或中兴路由器出了问题，也可能是家里停电' },
		tunnel: { state: 'tunnel', since: now - 2 * m, outStart: now - 2 * m, msg: '路由器本身正常，但隧道断了（面板和 Claude 暂时连不上，看门狗会自动修）' },
	}[mode];
	return { now, s: st, label: LABEL,
		r: { last: mode === 'ok' || mode === 'tunnel' ? now - 20e3 : now - 7 * m, rep: { wan: 'ok', net: 'ok', dns: 'ok', tun: mode === 'tunnel' ? 'down' : 'ok', panel: 'ok', clash: 'ok', ready: 4 } },
		t: tablet ? { last: mode === 'net' ? now - 4 * m : now - 30e3, first: now - 86400e3 } : null,
		probe: { at: now - 15e3, code: mode === 'ok' ? 200 : 530, fail: mode === 'ok' ? 0 : 5 },
		events: mode === 'ok' ? [{ t: now - 2 * 3600e3, lvl: 'ok', kind: 'cloud', msg: '恢复正常（离线共 5 分钟，最后是「路由器断电或死机」5 分钟）', detail: '', from: Math.round((now - 2 * 3600e3 - 300e3) / 1000), to: Math.round((now - 2 * 3600e3) / 1000) }]
			: [{ t: st.outStart + 150e3, lvl: 'err', kind: 'cloud', msg: LABEL[mode] + '：' + st.msg, detail: '', from: Math.round(st.outStart / 1000), to: 0 }] };
}
const DYD = { d: null, runs: 0 };
module.exports = { PXM, AUTO, DYD, respond, WD, cloudStatus, OC, LK, KILLED, ASW, PZ, TFD, MENU };

// 总表 #97（用户 11/28）：PassWall 2 / PassWall / HomeProxy / SSR Plus+ 的分流（路由器部分，v6 dfa4caf）
// 规则放在插件自带规则最前面、没变不重写、改前备份、重启后起不来放回；PassWall 主节点要先换成分流节点；老版本不能按设备；
// HomeProxy 不是自定义路由、SSR Plus+ 只有直连 / 代理（只增删面板加的）；识别软件没有 Clash 时用 DNS 记录
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_splitpx.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpspx-')), CFG = E + '/config', RUN = E + '/run.log', SB = E + '/sbin', R = E + '/root';
for (const d of [CFG, SB, R + '/etc/homeproxy/resources', R + '/etc/ssrplus', R + '/usr/lib/lua/luci/passwall', R + '/usr/lib/lua/luci/passwall2']) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(SB + '/cmcp-notify', `#!/bin/sh\necho "$*" >> ${E}/notified\n`, { mode: 0o755 });
fs.writeFileSync(CFG + '/dhcp', "config dnsmasq\n\toption domainneeded '1'\n\nconfig host 'tv'\n\toption mac 'aa:aa:aa:aa:aa:02'\n\toption ip '192.168.1.20'\n");
const PW2 = `config global
	option enabled '1'
	option node 'shunt1'

config nodes 'shunt1'
	option remarks '分流总节点'
	option type 'Xray'
	option protocol '_shunt'
	option default_node 'n1'
	option Proxy '_default'

config nodes 'n1'
	option remarks '香港 01'
	option type 'Xray'
	option protocol 'vless'

config nodes 'n2'
	option remarks '日本 02'
	option type 'Xray'
	option protocol 'vless'

config nodes 'lb'
	option remarks '负载均衡'
	option type 'Xray'
	option protocol '_balancing'

config shunt_rules 'Proxy'
	option remarks 'Proxy'
	option domain_list 'geosite:google
geosite:youtube'

config shunt_rules 'Direct'
	option remarks 'Direct'
	option ip_list 'geoip:cn'
`;
fs.writeFileSync(CFG + '/passwall2', PW2);
fs.writeFileSync(R + '/usr/lib/lua/luci/passwall2/util_xray.lua', 'if e.source then ... end\n');
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
let KIND = 'passwall2';
const cgi = (method, params, xenv = {}) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)),
		CMCP_SBIN: SB, CMCP_SP_KIND: KIND, CMCP_SP_RUN: RUN, CMCP_SP_PXDIR: R, CMCP_SP_INITD: E + '/initd', CMCP_SP_DIR: E + '/rp', CMCP_SP_PROXIES: E + '/none.json', CMCP_SPL_DNSON: E + '/spl_dns.json', ...xenv } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const err = (r) => r.error?.message || '';
const rd = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const clr = (f) => fs.writeFileSync(f, '');
const order = (cfg, typ) => [...rd(CFG + '/' + cfg).matchAll(new RegExp(`config ${typ} '([^']+)'`, 'g'))].map((m) => m[1]);
try {
	// ---- PassWall 2：主节点是分流类型 ----
	let r = await cgi('split_get'), g = r.result;
	ok('PassWall 2：能选节点、按设备、按国家；策略组 = 负载均衡这类，节点不含分流节点；代理 = 分流节点的默认节点', g?.kind === 'passwall2' && g.pxn === 'PassWall 2' && g.cap?.node && g.cap.dev && g.cap.geo && !g.cap.need
		&& JSON.stringify(g.groups) === '["负载均衡"]' && g.nodes?.map((n) => n.n).join('|') === '香港 01|日本 02' && g.main === '香港 01', JSON.stringify(g)?.slice(0, 400));
	clr(RUN);
	r = await cgi('split_set', { app: { id: 'netflix', t: '日本 02' } });
	let pw = rd(CFG + '/passwall2');
	ok('软件选节点：建 shunt_rules cmcp_sp_0（domain: 前缀），分流节点里写节点编号，要重启', r.result?.restart === true && /config shunt_rules 'cmcp_sp_0'[\s\S]*?option domain_list 'domain:netflix\.com/.test(pw) && /option cmcp_sp_0 'n2'/.test(pw), pw.slice(-700));
	ok('面板的规则排在插件自带的分流规则最前面（用户 11/28）', order('passwall2', 'shunt_rules').join(',') === 'cmcp_sp_0,Proxy,Direct', order('passwall2', 'shunt_rules').join(','));
	ok('插件自带规则的多行网址列表原样留着', /option domain_list 'geosite:google\ngeosite:youtube'/.test(pw));
	ok('清一下 PassWall 的 IP 集合（跟它自己保存时一样）', /option flush_set '1'/.test(pw));
	ok('改之前备份（插件设置、改之前的分流设置）', fs.existsSync(E + '/split_bak/passwall2/cfg') && fs.existsSync(E + '/split_bak/passwall2/.ok') && !rd(E + '/split_bak/passwall2/cfg').includes('cmcp_sp_0'));
	r = await cgi('split_set', { dev: { mac: 'aa:aa:aa:aa:aa:02', ip: '192.168.1.20', name: 'TV', t: 'DIRECT' } });
	r = await cgi('split_set', { site: { d: 'example.com', t: 'PROXY' } });
	pw = rd(CFG + '/passwall2');
	ok('设备直连（source = IP）、网站走代理（_default），都在最前面', /option source '192\.168\.1\.20'/.test(pw) && /'_direct'/.test(pw) && /'_default'/.test(pw) && order('passwall2', 'shunt_rules').slice(-2).join(',') === 'Proxy,Direct' && order('passwall2', 'shunt_rules').filter((n) => /^cmcp_sp_/.test(n)).length === 3, order('passwall2', 'shunt_rules').join(','));
	ok('没改完重启前只备份一次（放回去的是最后一次能用的）', !rd(E + '/split_bak/passwall2/cfg').includes('cmcp_sp_'));
	ok('选不存在的节点：报错', /没有这个/.test(err(await cgi('split_set', { site: { d: 'a.com', t: '不存在' } }))));
	const before = pw; clr(RUN);
	await cgi('split_check');
	ok('每分钟检查：没变就不重写、不重启', rd(CFG + '/passwall2') === before && !/restart/.test(rd(RUN)), rd(RUN));
	clr(RUN);
	r = await cgi('split_restart');
	let rc = rd(RUN);
	ok('重启：先看在不在跑，30 秒内没起来放回备份（插件设置和分流设置）再重启并推送', /cmcp-proxy running passwall2/.test(rc) && /initd\/passwall2' restart/.test(rc) && /split_bak\/passwall2\/cfg/.test(rc) && /cmcp-notify warn split/.test(rc) && /没起来/.test(rc), rc.slice(0, 500));
	// 用户在 PassWall 里又加了一条自己的规则排到最前面：检查时挪回来
	fs.writeFileSync(CFG + '/passwall2', rd(CFG + '/passwall2').replace("config shunt_rules 'cmcp_sp_0'", "config shunt_rules 'Mine'\n\toption remarks 'Mine'\n\toption domain_list 'x.com'\n\nconfig shunt_rules 'cmcp_sp_0'"));
	await cgi('split_check');
	ok('你后来加的规则排到了面板规则前面：检查时把面板的挪回最前面', order('passwall2', 'shunt_rules')[0] === 'cmcp_sp_0' && order('passwall2', 'shunt_rules').includes('Mine'), order('passwall2', 'shunt_rules').join(','));
	// 节点没了 → 改走代理、推送
	fs.writeFileSync(CFG + '/passwall2', rd(CFG + '/passwall2').replace("option remarks '日本 02'", "option remarks '日本 03'"));
	clr(E + '/notified'); clr(RUN);
	await cgi('split_check');
	r = (await cgi('split_get')).result;
	ok('选的节点从订阅里没了：改走代理并推送、重启', r.app?.netflix === 'PROXY' && /日本 02/.test(rd(E + '/notified')) && /restart/.test(rd(RUN)), JSON.stringify(r.app) + rd(E + '/notified'));
	// 老版本：没有 e.source，不能按设备
	fs.writeFileSync(R + '/usr/lib/lua/luci/passwall2/util_xray.lua', '-- old\n');
	r = (await cgi('split_get')).result;
	ok('老版本 PassWall 2（生成配置的程序不读 source）：不能按设备，说清楚', r.cap?.dev === false && /不能按设备/.test(err(await cgi('split_set', { dev: { mac: 'aa:aa:aa:aa:aa:03', ip: '192.168.1.30', t: 'DIRECT' } }))));
	fs.writeFileSync(R + '/usr/lib/lua/luci/passwall2/util_xray.lua', 'if e.source then end\n');

	// ---- PassWall：主节点不是分流类型 ----
	KIND = 'passwall';
	fs.writeFileSync(CFG + '/passwall', "config global\n\toption enabled '1'\n\toption tcp_node 'a1'\n\nconfig nodes 'a1'\n\toption remarks '美国 01'\n\toption type 'Xray'\n\toption protocol 'vmess'\n\nconfig shunt_rules 'Proxy'\n\toption remarks 'Proxy'\n");
	fs.writeFileSync(E + '/split.json', '{}');
	r = (await cgi('split_get')).result;
	ok('PassWall 老写法 tcp_node 也认；主节点不是分流类型：要先换（cap.need = shunt，带现在的节点名）', r.kind === 'passwall' && r.cap?.need === 'shunt' && r.cap.cur === '美国 01', JSON.stringify(r.cap));
	ok('没换之前不让设', /先把 PassWall 的主节点换成分流节点/.test(err(await cgi('split_set', { site: { d: 'a.com', t: 'DIRECT' } }))));
	r = await cgi('split_prep');
	let p1 = rd(CFG + '/passwall');
	ok('点了「换成分流节点」：新建 cmcp_shunt（默认走原来的节点、类型跟原来一样），主节点换上去，原设置先备份，要重启', r.result?.restart && /config nodes 'cmcp_shunt'[\s\S]*option protocol '_shunt'[\s\S]*option default_node 'a1'/.test(p1) && /option tcp_node 'cmcp_shunt'/.test(p1) && /option type 'Xray'/.test(p1)
		&& !rd(E + '/split_bak/passwall/cfg').includes('cmcp_shunt'), JSON.stringify(r).slice(0, 200) + '|' + rd(E + '/split_bak/passwall/cfg'));
	r = await cgi('split_set', { site: { d: 'a.com', t: 'DIRECT' } });
	ok('换好以后能设', r.result?.restart !== undefined && /cmcp_sp_0/.test(rd(CFG + '/passwall')) && order('passwall', 'shunt_rules')[0] === 'cmcp_sp_0');

	// ---- HomeProxy 自定义路由 ----
	KIND = 'homeproxy';
	fs.writeFileSync(E + '/split.json', '{}');
	fs.writeFileSync(CFG + '/homeproxy', "config homeproxy 'config'\n\toption routing_mode 'custom'\n\nconfig homeproxy 'routing'\n\toption default_outbound 'rn_main'\n\nconfig node 'nd1'\n\toption label '香港 A'\n\nconfig node 'nd2'\n\toption label '日本 B'\n\nconfig routing_node 'rn_main'\n\toption label '主路由'\n\toption enabled '1'\n\toption node 'nd1'\n\nconfig routing_rule 'mine'\n\toption label 'mine'\n\toption enabled '1'\n\toption outbound 'direct-out'\n");
	r = (await cgi('split_get')).result;
	ok('HomeProxy 自定义路由：策略组 = 你的路由节点，节点 = 全部节点，代理 = 默认出站；不能按国家', r.cap?.node && r.cap.geo === false && JSON.stringify(r.groups) === '["主路由"]' && r.main === '主路由' && r.nodes?.length === 2, JSON.stringify(r).slice(0, 300));
	await cgi('split_set', { app: { id: 'netflix', t: '日本 B' } });
	await cgi('split_set', { site: { d: 'b.com', t: '香港 A' } });
	let hp = rd(CFG + '/homeproxy');
	ok('选节点：没有指向它的路由节点就建 cmcp_rn_*；有你建的就用你的（不能两个路由节点用同一个节点）', /config routing_node 'cmcp_rn_nd2'[\s\S]*option node 'nd2'/.test(hp) && !/cmcp_rn_nd1/.test(hp) && /option outbound 'rn_main'/.test(hp), hp.slice(-900));
	ok('规则排在你的路由规则前面', order('homeproxy', 'routing_rule').join(',') === 'cmcp_sp_0,cmcp_sp_1,mine', order('homeproxy', 'routing_rule').join(','));
	ok('不能按国家：报错', /不能按国家/.test(err(await cgi('split_set', { geo: { id: 'JP', t: 'DIRECT' } }))));
	await cgi('split_set', { app: { id: 'netflix', t: null } });
	ok('不用的 cmcp_rn_ 删掉', !/cmcp_rn_nd2/.test(rd(CFG + '/homeproxy')));

	// ---- HomeProxy 别的路由模式：只有直连 / 代理 ----
	fs.writeFileSync(E + '/split.json', '{}'); fs.rmSync(E + '/split_px.json', { force: true });
	fs.writeFileSync(CFG + '/homeproxy', "config homeproxy 'config'\n\toption routing_mode 'bypass_mainland_china'\n\toption main_node 'nd1'\n\nconfig node 'nd1'\n\toption label '香港 A'\n\nconfig homeproxy 'control'\n\toption lan_proxy_mode 'disabled'\n");
	fs.writeFileSync(R + '/etc/homeproxy/resources/direct_list.txt', 'mine.cn\n');
	r = (await cgi('split_get')).result;
	ok('HomeProxy 绕过大陆模式：只有直连 / 代理，写清怎么改', r.cap?.two && /只能选直连或代理/.test(r.cap.lim) && /自定义路由/.test(r.cap.lim) && r.main === '香港 A', JSON.stringify(r.cap));
	ok('选节点：报错（只能直连 / 代理）', /只能选直连或代理/.test(err(await cgi('split_set', { site: { d: 'c.com', t: '香港 A' } }))));
	await cgi('split_set', { dev: { mac: 'aa:aa:aa:aa:aa:02', ip: '192.168.1.20', t: 'DIRECT' } });
	await cgi('split_set', { site: { d: 'c.com', t: 'DIRECT' } });
	hp = rd(CFG + '/homeproxy');
	ok('设备直连：MAC 进直连列表，访问控制改成「列出的不代理」（原来是关着的）', /list lan_direct_mac_addrs 'aa:aa:aa:aa:aa:02'/.test(hp) && /option lan_proxy_mode 'except_listed'/.test(hp), hp);
	ok('网站直连写进 direct_list.txt，你原来的行留着，不加注释', rd(R + '/etc/homeproxy/resources/direct_list.txt') === 'mine.cn\nc.com\n', JSON.stringify(rd(R + '/etc/homeproxy/resources/direct_list.txt')));
	await cgi('split_set', { site: { d: 'c.com', t: null } });
	await cgi('split_set', { dev: { mac: 'aa:aa:aa:aa:aa:02', ip: '192.168.1.20', t: null } });
	hp = rd(CFG + '/homeproxy');
	ok('取消：只删面板加的，你原来的不动；访问控制改回原来的', rd(R + '/etc/homeproxy/resources/direct_list.txt') === 'mine.cn\n' && !/aa:aa:aa:aa:aa:02/.test(hp) && /option lan_proxy_mode 'disabled'/.test(hp), hp + rd(R + '/etc/homeproxy/resources/direct_list.txt'));

	// ---- SSR Plus+ ----
	KIND = 'shadowsocksr';
	fs.writeFileSync(E + '/split.json', '{}'); fs.rmSync(E + '/split_px.json', { force: true });
	fs.writeFileSync(CFG + '/shadowsocksr', "config global\n\toption global_server 's1'\n\nconfig servers 's1'\n\toption alias '新加坡'\n\nconfig access_control\n\tlist lan_bp_ips '192.168.1.99'\n");
	fs.writeFileSync(R + '/etc/ssrplus/black.list', '# 用户的注释\nold.com\n');
	r = (await cgi('split_get')).result;
	ok('SSR Plus+：只有直连 / 代理，代理 = 现在的服务器', r.cap?.two && /SSR Plus\+ 只能选直连或代理/.test(r.cap.lim) && r.main === '新加坡' && !r.nodes?.length, JSON.stringify(r).slice(0, 300));
	await cgi('split_set', { dev: { mac: 'aa:aa:aa:aa:aa:02', ip: '192.168.1.20', t: 'PROXY' } });
	await cgi('split_set', { app: { id: 'netflix', t: 'PROXY' } });
	let ss = rd(CFG + '/shadowsocksr');
	ok('设备代理：IP 进强制代理列表，原来的绕过列表不动', /list lan_fp_ips '192\.168\.1\.20'/.test(ss) && /list lan_bp_ips '192\.168\.1\.99'/.test(ss), ss);
	ok('软件代理：网址进 black.list，原来的行和注释留着', /^# 用户的注释\nold\.com\nnetflix\.com\n/.test(rd(R + '/etc/ssrplus/black.list')), rd(R + '/etc/ssrplus/black.list'));
	ok('SSR Plus+ 选节点、策略组：报错', /只能选直连或代理/.test(err(await cgi('split_set', { site: { d: 'd.com', t: '新加坡' } }))));

	// ---- 识别软件：没有 Clash 用 DNS 记录 ----
	clr(RUN);
	r = await cgi('split_learn', { act: 'start', mac: 'aa:aa:aa:aa:aa:02', ip: '192.168.1.20', name: 'TV' });
	r = await cgi('split_learn', {});
	ok('识别软件：别的插件用 DNS 记录（mode = dns）', r.result?.mode === 'dns' && /cmcp-splearn/.test(rd(RUN)), JSON.stringify(r).slice(0, 200) + rd(RUN));
	await cgi('split_learn', { act: 'stop' });
	fs.writeFileSync(E + '/spl_dns.json', '{"lf":""}');
	fs.writeFileSync(E + '/split_learn.json', '{"run":false}');
	clr(RUN);
	await cgi('split_check');
	ok('识别程序意外停了、dnsmasq 还在记：每分钟检查时放回去（dnsoff）', /cmcp-splearn dnsoff/.test(rd(RUN)), rd(RUN));
	// 识别程序本身（DNS 模式）：改 dnsmasq 的 logqueries / logfacility，读这台设备查的网址，结束放回去
	{
		const LF = E + '/learn.json', DL = E + '/dns.log', DON = E + '/dnson.json', CT = E + '/ct', U = 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG;
		fs.writeFileSync(CT, '');
		fs.writeFileSync(LF, JSON.stringify({ rid: 'r1', ip: '192.168.1.20', mac: '', at: Date.now() / 1000, until: Date.now() / 1000 + 4, hosts: {}, dips: {}, nohost: 0, run: true, mode: 'dns' }));
		const lines = ['query[A] www.youtube.com from 192.168.1.20', 'reply www.youtube.com is 1.2.3.4', 'query[AAAA] api.game.example from 192.168.1.20', 'query[A] other.device.com from 192.168.1.99', 'query[HTTPS] bad;host from 192.168.1.20'].map((l) => 'Sat Nov 28 12:00:00 2026 dnsmasq[1]: ' + l).join('\n');
		await new Promise((z) => { const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/bin/cmcp-splearn')) + ' 192.168.1.20 4 r1'], { env: { ...process.env, CMCP_SPL_F: LF, CMCP_SPL_DNSON: DON, CMCP_SPL_DLOG: DL, CMCP_SPL_UCI: U,
			CMCP_SPL_DNSRS: `( sleep 1; [ -f ${DON} ] && printf '${lines}\n' >> ${DL} ) >/dev/null 2>&1 &`, CMCP_SPL_DNSOK: 'echo 1', CMCP_SPL_NOCURL: '1', CMCP_SPL_CONNS: E + '/none.json', CMCP_SPL_CT: CT, CMCP_SPL_LOG: E + '/spl.log', CMCP_SPL_NEIGH: E + '/neigh', CMCP_SPL_LEASES: E + '/leases' } }); p.on('close', z); });
		const L2 = JSON.parse(rd(LF) || '{}'), hs = L2.hosts || {};
		ok('DNS 模式：只记这台设备查的网址（别的设备、乱的不记），结束后 dnsmasq 设置放回去', hs['www.youtube.com'] >= 1 && hs['api.game.example'] >= 1 && !hs['other.device.com'] && !Object.keys(hs).some((h) => /;/.test(h)) && L2.run === false
			&& !fs.existsSync(DON) && !/logqueries|logfacility/.test(rd(CFG + '/dhcp')), JSON.stringify(L2).slice(0, 300) + rd(CFG + '/dhcp'));
	}
} finally {
	fs.rmSync(E, { recursive: true, force: true });
}
for (const [n, c, note] of results) console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '\n    ' + String(note).slice(0, 700)));
const pass = results.filter((x) => x[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

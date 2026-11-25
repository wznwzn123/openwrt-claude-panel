// 6.0 第 18 项（路由器）：端口转发——列出、加、改、开关、删；不让转路由器自己的管理端口、不让转到路由器自己或局域网外；
// 撞端口不让加；改完走「90 秒确认」（不点自动改回去）并推送；面板认不全的规则只能开关、删
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_pfwd.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcppf-'));
const CFG = D + '/config', SB = D + '/sbin', NG = D + '/ng', RUN = D + '/reload.log', NOTE = D + '/notify.log', ETC = D + '/etc';
fs.mkdirSync(CFG); fs.mkdirSync(SB); fs.mkdirSync(ETC);
fs.copyFileSync(path.resolve('../src/bin/cmcp-netguard'), SB + '/cmcp-netguard'); fs.chmodSync(SB + '/cmcp-netguard', 0o755);
fs.writeFileSync(SB + '/cmcp-notify', `#!/bin/sh\necho "$@" >> ${NOTE}\n`); fs.chmodSync(SB + '/cmcp-notify', 0o755);
const FW = `config defaults
	option input 'ACCEPT'

config zone
	option name 'wan'

config redirect 'nas'
	option name 'NAS'
	option target 'DNAT'
	option src 'wan'
	option dest 'lan'
	option proto 'tcp'
	option src_dport '5000'
	option dest_ip '192.168.1.20'
	option dest_port '5000'

config redirect
	option name 'Game'
	option src 'wan'
	option proto 'udp'
	option src_dport '27015-27020'
	option dest_ip '192.168.1.30'
	option enabled '0'

config redirect 'odd'
	option name 'Only from office'
	option target 'DNAT'
	option src 'wan'
	option src_ip '1.2.3.4'
	option src_dport '3389'
	option dest_ip '192.168.1.40'

config redirect 'snat1'
	option target 'SNAT'
	option src 'lan'
`;
const NET = `config interface 'lan'
	option proto 'static'
	option ipaddr '192.168.1.1'
	option netmask '255.255.255.0'
`;
const UH = `config uhttpd 'main'
	list listen_http '0.0.0.0:80'
	list listen_http '[::]:80'
	list listen_https '0.0.0.0:8443'
`;
const DB = `config dropbear
	option Port '2222'
`;
const reset = () => { fs.writeFileSync(CFG + '/firewall', FW); fs.writeFileSync(CFG + '/network', NET); fs.writeFileSync(CFG + '/uhttpd', UH); fs.writeFileSync(CFG + '/dropbear', DB); fs.rmSync(NG, { recursive: true, force: true }); fs.rmSync(NOTE, { force: true }); fs.rmSync(RUN, { force: true }); };
const F = () => fs.readFileSync(CFG + '/firewall', 'utf8');
fs.writeFileSync(D + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
const cgi = (method, params) => new Promise((z) => {
	const msg = { jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' }, body = JSON.stringify(msg);
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: D + '/config.json', PATH_INFO: '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_SBIN: SB, CMCP_NG: NG, CMCP_NG_WAIT: '3', CMCP_NG_RUN: RUN, CMCP_ETC: ETC } });
	let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const runs = () => (fs.existsSync(RUN) ? fs.readFileSync(RUN, 'utf8').trim().split('\n').filter(Boolean) : []);
const waitFor = async (f, ms = 9000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(150); } return false; };
const keep = async (tok) => cgi('net_confirm', { token: tok });
try {
	reset();
	let r = await cgi('pf_list');
	const L = r.result?.list || [];
	ok('列出来：只算从外网转进来的（SNAT 那条不算），匿名的也认', L.length === 3 && L[0].id === 'nas' && L[1].name === 'Game' && L[2].id === 'odd', JSON.stringify(r).slice(0, 500));
	ok('协议、端口、设备、开关', L[0].proto === 'tcp' && L[0].ext === '5000' && L[0].ip === '192.168.1.20' && L[0].on && L[1].proto === 'udp' && L[1].on === false);
	ok('没写协议的当成 TCP + UDP；有面板不认识的设置（只许某个 IP 连）的不能改', L[2].proto === 'tcp udp' && L[2].edit === false && L[0].edit === true);
	ok('路由器自己的端口列出来：网页后台 80、8443，SSH 2222，面板 906', JSON.stringify(r.result.reserved.map((x) => x.port)) === '[80,906,2222,8443]', JSON.stringify(r.result.reserved));
	ok('局域网地址段', r.result.lan === '192.168.1.1/24');
	// ---- 不让加的 ----
	const bad = [
		[{ ext: '80', ip: '192.168.1.50' }, /不能转发 80 端口：路由器网页后台要用/, '路由器网页后台端口'],
		[{ ext: '2200-2300', ip: '192.168.1.50' }, /不能转发 2222 端口：SSH 要用/, '一段里包含 SSH 端口'],
		[{ ext: '906', ip: '192.168.1.50' }, /面板要用/, '面板端口'],
		[{ ext: '8080', ip: '192.168.1.1' }, /不能转到路由器自己/, '转到路由器自己'],
		[{ ext: '8080', ip: '10.0.0.5' }, /只能转到家里局域网的设备/, '转到局域网外'],
		[{ ext: '8080', ip: '192.168.1.255' }, /设备地址不对/, '广播地址'],
		[{ ext: '8080', ip: '192.168.1.50; reboot' }, /设备地址不对/, '地址里夹命令'],
		[{ ext: '70000', ip: '192.168.1.50' }, /外部端口填/, '端口超范围'],
		[{ ext: '8000-8010', ip: '192.168.1.50', port: '9000' }, /个数要一样/, '外部一段、内部一个'],
		[{ ext: '5000', ip: '192.168.1.50', proto: 'tcp' }, /外部端口 5000 已经转给「NAS」了/, '撞端口（同协议）'],
	];
	for (const [p, re, why] of bad) {
		r = await cgi('pf_set', { op: 'add', ...p });
		ok('不让加：' + why, re.test(r.error?.message || ''), JSON.stringify(r).slice(0, 200));
	}
	ok('出错时配置一点没动、也没开始等确认', F() === FW && !fs.existsSync(NG));
	r = await cgi('pf_set', { op: 'add', ext: '5000', ip: '192.168.1.50', proto: 'udp' });
	ok('同一个端口、不同协议可以', r.result?.changed === true, JSON.stringify(r).slice(0, 200));
	await keep(r.result?.token);
	// ---- 加一条，点「保留」 ----
	reset();
	r = await cgi('pf_set', { op: 'add', name: '摄像头', ext: '8080', ip: '192.168.1.50', port: '80', proto: 'tcp' });
	const tok = r.result?.token;
	ok('加好了：给面板一个确认编号', r.result?.changed === true && /^[a-z0-9]{16}$/.test(tok || ''), JSON.stringify(r).slice(0, 200));
	const f = F();
	ok('写进防火墙：名字、DNAT、wan → lan、协议、端口、设备', /config redirect 'cmcp_pf_[a-z0-9]{6}'/.test(f) && /option name '摄像头'/.test(f) && /option src_dport '8080'/.test(f) && /option dest_ip '192\.168\.1\.50'/.test(f) && /option dest_port '80'/.test(f) && /option proto 'tcp'/.test(f) && /option enabled '1'/.test(f), f.slice(-400));
	ok('重新加载防火墙', await waitFor(() => runs().includes('/etc/init.d/firewall reload')), runs().join(' / '));
	ok('推送：改了什么', /info net 端口转发改了：外部端口 8080 → 192\.168\.1\.50:80/.test(fs.existsSync(NOTE) ? fs.readFileSync(NOTE, 'utf8') : ''), fs.existsSync(NOTE) ? fs.readFileSync(NOTE, 'utf8') : '');
	r = await cgi('pf_set', { op: 'del', id: 'nas' });
	ok('还在等确认时不能再改', /还在等你确认/.test(r.error?.message || ''));
	r = await keep(tok);
	await sleep(4500);
	ok('点了「保留」：过了时间也不改回去', r.result?.ok === true && /摄像头/.test(F()));
	r = await cgi('pf_list');
	const mine = (r.result?.list || []).find((x) => x.name === '摄像头');
	ok('新加的标成面板加的', mine && mine.mine === true && mine.edit === true);
	// ---- 改、关、删 ----
	r = await cgi('pf_set', { op: 'edit', id: mine.id, name: '摄像头', ext: '8081', ip: '192.168.1.51', port: '81', proto: 'both' });
	await keep(r.result?.token);
	ok('改：端口、设备、协议（两个都要）', /option src_dport '8081'/.test(F()) && /option dest_ip '192\.168\.1\.51'/.test(F()) && /option proto 'tcp udp'/.test(F()), JSON.stringify(r).slice(0, 200));
	r = await cgi('pf_set', { op: 'edit', id: 'odd', ext: '3390', ip: '192.168.1.40' });
	ok('面板认不全的规则：不让改', /在原版后台里改/.test(r.error?.message || ''));
	r = await cgi('pf_set', { op: 'off', id: 'odd' }); await keep(r.result?.token);
	ok('但能关掉', /config redirect 'odd'[^]*?option enabled '0'/.test(F()));
	r = await cgi('pf_set', { op: 'on', id: 'game' });
	ok('没有的规则：报错', /没有这条/.test(r.error?.message || ''));
	r = await cgi('pf_list');
	const game = r.result.list.find((x) => x.name === 'Game');
	r = await cgi('pf_set', { op: 'on', id: game.id }); await keep(r.result?.token);
	ok('打开关着的规则', (await cgi('pf_list')).result.list.find((x) => x.name === 'Game').on === true);
	r = await cgi('pf_set', { op: 'del', id: 'nas' }); await keep(r.result?.token);
	ok('删掉', !/config redirect 'nas'/.test(F()) && /SNAT/.test(F()));
	// ---- 不点「保留」：自动改回去 ----
	const before = F();
	r = await cgi('pf_set', { op: 'add', ext: '9999', ip: '192.168.1.60' });
	ok('又加一条', /9999/.test(F()) && r.result?.changed);
	ok('不点「保留」：时间到改回原来的，推送', await waitFor(() => F() === before && !fs.existsSync(NG), 12000) && /warn net 端口转发已改回原来的/.test(fs.readFileSync(NOTE, 'utf8')), fs.readFileSync(NOTE, 'utf8').slice(-300));
} catch (e) { ok('没有异常', false, e.stack); }
fs.rmSync(D, { recursive: true, force: true });
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

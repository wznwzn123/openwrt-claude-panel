// 每台设备的流量统计改用防火墙计数（6.0 第五阶段，用户 11/28）：fw4 用 nft 命名计数器、fw3 用 iptables 规则的字节数、
// 开着流量卸载时读连接跟踪；总数以防火墙为准，走代理多少看 Clash 的连接列表；用 PassWall 等（没有 Clash 接口）的这一天只记总数；
// 设备换 IP 重建规则、卸载时删掉、我们打开的 nf_conntrack_acct 改回去；绕过内核的加速提示数不全
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_traffic.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcptr-'));
const LIBD = D + '/lib', TMP = D + '/tmp', ETC = D + '/etc', RUN = D + '/run.log', NEIGH = D + '/neigh', LEASES = D + '/leases', SYS = D + '/sys', NFT = D + '/nft', IPT = D + '/ipt', CT = D + '/ct', ACF = D + '/acct', CL = D + '/clash.json', PX = D + '/px.json';
for (const d of [LIBD + '/cmcp', TMP, ETC, SYS + '/module', IPT]) fs.mkdirSync(d, { recursive: true });
fs.copyFileSync(path.resolve('../src/lib/lib.uc'), LIBD + '/cmcp/lib.uc');
fs.writeFileSync(ETC + '/off.newdev', '1');
const M1 = 'aa:bb:cc:00:00:01', M2 = 'aa:bb:cc:00:00:02';
const BASE = { CMCP_TR_TMP: TMP, CMCP_TR_ETC: ETC, CMCP_TR_RUN: RUN, CMCP_TR_LEASES: LEASES, CMCP_TR_NEIGH: NEIGH, CMCP_TR_SYS: SYS, CMCP_TR_ACCT: ACF, CMCP_TR_OFFLOAD: '0' };
const tr = (env = {}, args = '') => new Promise((z) => {
	const p = spawn('sh', ['-c', UC + ` -L '${LIBD}/*.uc' ` + JSON.stringify(path.resolve('../src/bin/cmcp-traffic')) + ' ' + args], { env: { ...process.env, ...BASE, ...env } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.stderr.on('data', (x) => (out += x)); p.on('close', () => { if (/rror|xception|Syntax/.test(out)) console.log('脚本报错：' + out.slice(0, 800)); z(out); });
});
const st = () => { try { return JSON.parse(fs.readFileSync(TMP + '/cmcp_traf.json', 'utf8')); } catch (e) { return { today: {} }; } };
const today = (m) => st().today[m] || [0, 0, 0, 0];
const runs = () => (fs.existsSync(RUN) ? fs.readFileSync(RUN, 'utf8') : '');
const clr = () => fs.rmSync(RUN, { force: true });
const reset = () => { for (const f of ['cmcp_traf.json', 'cmcp_acct.json']) fs.rmSync(TMP + '/' + f, { force: true }); fs.rmSync(ETC + '/traffic', { recursive: true, force: true }); clr(); };
const nftc = (a) => fs.writeFileSync(NFT, 'table inet cmcp_acct {\n' + a.map(([n, b]) => `\tcounter ${n} {\n\t\tpackets 3 bytes ${b}\n\t}`).join('\n') + '\n}\n');
try {
	fs.writeFileSync(LEASES, `1900000000 ${M1} 192.168.1.20 iPad\n1900000000 ${M2} 192.168.1.30 TV\n`);
	fs.writeFileSync(NEIGH, `2408:8000::20 dev br-lan lladdr ${M1} STALE\nfe80::1 dev br-lan lladdr ${M1} STALE\n2408:8000::99 dev br-lan lladdr aa:bb:cc:00:00:09 FAILED\n`);
	// ---------- fw4：nft ----------
	const N = { CMCP_TR_MODE: 'nft', CMCP_TR_NFT: NFT, CMCP_TR_NOCLASH: '1' };
	fs.rmSync(NFT, { force: true });
	let o = await tr(N);
	const nf = fs.existsSync(TMP + '/cmcp_acct.nft') ? fs.readFileSync(TMP + '/cmcp_acct.nft', 'utf8') : '';
	ok('nft：第一次建表（先删旧的），每台设备两个计数器', /delete table inet cmcp_acct/.test(nf) && /counter u0 \{ \}/.test(nf) && /counter d1 \{ \}/.test(nf) && /nft -f/.test(runs()), o + nf);
	ok('nft：上传在 prerouting 按 MAC 数（走代理的也经过这里）', /hook prerouting priority -299[\s\S]*ether saddr aa:bb:cc:00:00:01 counter name "u0"[\s\S]*ether saddr aa:bb:cc:00:00:02 counter name "u1"/.test(nf), nf);
	ok('nft：下载在 postrouting 按 IPv4 和 IPv6 数，不算 fe80 和失效的邻居', /hook postrouting priority 300[\s\S]*ip daddr \{ 192\.168\.1\.20 \} counter name "d0"[\s\S]*ip6 daddr \{ 2408:8000::20 \} counter name "d0"/.test(nf) && !/fe80|::99/.test(nf), nf);
	nftc([['u0', 1000], ['d0', 5000], ['u1', 200], ['d1', 300]]); clr();
	await tr(N);
	ok('nft：读到计数，没有 Clash：都算直连', JSON.stringify(today(M1)) === '[0,0,1000,5000]' && JSON.stringify(today(M2)) === '[0,0,200,300]', JSON.stringify(st().today));
	ok('设备没变：不重建表', !/nft -f/.test(runs()), runs());
	nftc([['u0', 1500], ['d0', 9000], ['u1', 200], ['d1', 300]]);
	await tr(N);
	ok('nft：只加这一分钟多出来的', JSON.stringify(today(M1)) === '[0,0,1500,9000]' && JSON.stringify(today(M2)) === '[0,0,200,300]', JSON.stringify(st().today));
	ok('有防火墙计数时，没有 Clash 也算在统计（流量页「正在统计」）', st().at > 0 && st().acct === 'nft');
	// 有 Clash：走代理的看 Clash，其余算直连，总数以防火墙为准
	nftc([['u0', 2000], ['d0', 13000], ['u1', 200], ['d1', 300]]);
	fs.writeFileSync(CL, JSON.stringify({ uploadTotal: 100, downloadTotal: 3000, connections: [{ id: 'c1', upload: 100, download: 3000, chains: ['香港01'], metadata: { sourceIP: '192.168.1.20' } }] }));
	await tr({ ...N, CMCP_TR_NOCLASH: '', CMCP_TR_CLASH: CL });
	ok('有 Clash：走代理的取 Clash 算的（100 / 3000），其余算直连（400 / 1000）', JSON.stringify(today(M1)) === '[100,3000,1900,10000]', JSON.stringify(today(M1)));
	nftc([['u0', 2010], ['d0', 13020], ['u1', 200], ['d1', 300]]);
	fs.writeFileSync(CL, JSON.stringify({ uploadTotal: 600, downloadTotal: 9000, connections: [{ id: 'c1', upload: 600, download: 9000, chains: ['香港01'], metadata: { sourceIP: '192.168.1.20' } }] }));
	await tr({ ...N, CMCP_TR_NOCLASH: '', CMCP_TR_CLASH: CL });
	ok('Clash 算的比防火墙多（两边对不上）：以防火墙为准，走代理的不超过总数', JSON.stringify(today(M1)) === '[110,3020,1900,10000]', JSON.stringify(today(M1)));
	// 设备换了 IP：先读完这一分钟，再重建，计数从 0 算
	fs.writeFileSync(LEASES, `1900000000 ${M1} 192.168.1.21 iPad\n1900000000 ${M2} 192.168.1.30 TV\n`);
	nftc([['u0', 2110], ['d0', 13120], ['u1', 200], ['d1', 300]]); clr();
	await tr(N);
	const nf2 = fs.readFileSync(TMP + '/cmcp_acct.nft', 'utf8');
	ok('设备换了 IP：这一分钟照样算上，然后按新 IP 重建', JSON.stringify(today(M1)) === '[110,3020,2000,10100]' && /ip daddr \{ 192\.168\.1\.21 \}/.test(nf2) && /nft -f/.test(runs()), JSON.stringify(today(M1)));
	nftc([['u0', 50], ['d0', 60], ['u1', 0], ['d1', 0]]);
	await tr(N);
	ok('重建以后计数从 0 开始：照样接着加', JSON.stringify(today(M1)) === '[110,3020,2050,10160]', JSON.stringify(today(M1)));
	fs.rmSync(NFT, { force: true }); clr();
	await tr(N);
	ok('表被删了（读不到计数）：重建', /nft -f/.test(runs()));
	// 用 PassWall 等（没有 Clash 接口）：分不出走代理还是直连，这一天标上
	fs.writeFileSync(PX, JSON.stringify({ active: 'passwall', list: [{ id: 'passwall', running: true }] }));
	await tr({ ...N, CMCP_TR_PX: PX });
	ok('正在用 PassWall（没有 Clash 接口）：这一天标「分不出走代理还是直连」', st().nx === true, JSON.stringify(st()));
	// ---------- fw3：iptables ----------
	reset();
	fs.writeFileSync(LEASES, `1900000000 ${M1} 192.168.1.20 iPad\n1900000000 ${M2} 192.168.1.30 TV\n`);
	const I = { CMCP_TR_MODE: 'ipt', CMCP_TR_IPT: IPT, CMCP_TR_NOCLASH: '1' };
	await tr(I);
	const r1 = runs();
	ok('iptables：mangle 表建两条链，接在 PREROUTING / POSTROUTING 最后（暂停上网丢掉的包不算）', /iptables -w -t mangle -N cmcp_acct_u/.test(r1) && /iptables -w -t mangle -A PREROUTING -j cmcp_acct_u/.test(r1) && /iptables -w -t mangle -A POSTROUTING -j cmcp_acct_d/.test(r1), r1);
	ok('iptables：上传按 MAC，下载按 IP；IPv6 用 ip6tables', /-A cmcp_acct_u -m mac --mac-source aa:bb:cc:00:00:01 -j RETURN/.test(r1) && /iptables -w -t mangle -A cmcp_acct_d -d 192\.168\.1\.20 -j RETURN/.test(r1) && /ip6tables -w -t mangle -A cmcp_acct_d -d 2408:8000::20 -j RETURN/.test(r1) && !/fe80/.test(r1), r1);
	const L = (rows) => 'Chain x (1 references)\n    pkts      bytes target     prot opt in     out     source               destination\n' + rows.map((b) => `       5     ${b} RETURN     all  --  *      *       0.0.0.0/0            0.0.0.0/0`).join('\n') + '\n';
	fs.writeFileSync(IPT + '/u4', L([100, 50])); fs.writeFileSync(IPT + '/d4', L([700, 80])); fs.writeFileSync(IPT + '/u6', L([10, 0])); fs.writeFileSync(IPT + '/d6', L([90]));
	await tr(I);
	ok('iptables：按规则顺序对上设备，IPv4 和 IPv6 加在一起', JSON.stringify(today(M1)) === '[0,0,110,790]' && JSON.stringify(today(M2)) === '[0,0,50,80]', JSON.stringify(st().today));
	fs.writeFileSync(IPT + '/u4', L([150, 50]));
	await tr(I);
	ok('iptables：只加多出来的', JSON.stringify(today(M1)) === '[0,0,160,790]', JSON.stringify(today(M1)));
	// ---------- 开着流量卸载：连接跟踪 ----------
	reset();
	fs.writeFileSync(LEASES, `1900000000 ${M1} 192.168.1.21 iPad\n1900000000 ${M2} 192.168.1.30 TV\n`);
	fs.writeFileSync(ACF, '0');
	const C = { CMCP_TR_MODE: 'ct', CMCP_TR_CT: CT, CMCP_TR_NOCLASH: '1' };
	const ctl = (a) => fs.writeFileSync(CT, a.join('\n') + '\n');
	ctl([
		'ipv4     2 tcp      6 7440 ESTABLISHED src=192.168.1.21 dst=1.2.3.4 sport=5555 dport=443 packets=10 bytes=1000 src=1.2.3.4 dst=100.64.0.2 sport=443 dport=5555 packets=12 bytes=20000 [ASSURED] mark=0 zone=0 use=2',
		'ipv6     10 udp      17 30 src=2408:8000::20 dst=2001:db8::1 sport=5353 dport=443 packets=1 bytes=300 src=2001:db8::1 dst=2408:8000::20 sport=443 dport=5353 packets=1 bytes=700 mark=0 zone=0 use=2',
		'ipv4     2 tcp      6 7440 ESTABLISHED src=8.8.4.4 dst=100.64.0.2 sport=40000 dport=8080 packets=3 bytes=50 src=192.168.1.30 dst=8.8.4.4 sport=80 dport=40000 packets=3 bytes=9000 [ASSURED] mark=0 zone=0 use=2',
		'ipv4     2 tcp      6 7440 ESTABLISHED src=100.64.0.2 dst=1.1.1.1 sport=4444 dport=443 packets=3 bytes=777 src=1.1.1.1 dst=100.64.0.2 sport=443 dport=4444 packets=3 bytes=888 [ASSURED] mark=0 zone=0 use=2',
	]);
	o = await tr(C); if (o.trim()) console.log('ct 输出：' + o.slice(0, 600));
	ok('连接跟踪：nf_conntrack_acct 关着就打开（记下是我们开的）', fs.readFileSync(ACF, 'utf8').trim() === '1' && fs.existsSync(ETC + '/acct_ct_on'));
	ok('连接跟踪：IPv4、IPv6 按设备算；从外面连进来的（端口转发）反过来算；路由器自己的不算', JSON.stringify(today(M1)) === '[0,0,1300,20700]' && JSON.stringify(today(M2)) === '[0,0,9000,50]', JSON.stringify(st().today));
	ctl([
		'ipv4     2 tcp      6 7440 ESTABLISHED src=192.168.1.21 dst=1.2.3.4 sport=5555 dport=443 packets=10 bytes=1500 src=1.2.3.4 dst=100.64.0.2 sport=443 dport=5555 packets=12 bytes=30000 [ASSURED] mark=0 zone=0 use=2',
		'ipv4     2 tcp      6 7440 ESTABLISHED src=192.168.1.21 dst=5.6.7.8 sport=6000 dport=443 packets=1 bytes=40 src=5.6.7.8 dst=100.64.0.2 sport=443 dport=6000 packets=1 bytes=60 [ASSURED] mark=0 zone=0 use=2',
	]);
	await tr(C);
	ok('连接跟踪：老连接加多出来的，新连接全算', JSON.stringify(today(M1)) === '[0,0,1840,30760]', JSON.stringify(today(M1)));
	fs.writeFileSync(CT, 'ipv4     2 tcp      6 7440 ESTABLISHED src=192.168.1.21 dst=9.9.9.9 sport=1 dport=443 packets=1 src=9.9.9.9 dst=100.64.0.2 sport=443 dport=1 packets=1 [ASSURED] mark=0 zone=0 use=2\n');
	o = await tr(C);
	ok('连接跟踪没有字节数（刚打开计数）：这一分钟不算，不报错', JSON.stringify(today(M1)) === '[0,0,1840,30760]' && !/error|Error/.test(o), o);
	// ---------- 绕过内核的加速 ----------
	fs.mkdirSync(SYS + '/module/shortcut_fe', { recursive: true });
	await tr(N);
	ok('开着 Turbo ACC：提示数不全', /Turbo ACC/.test(st().warn || ''), JSON.stringify(st()));
	fs.rmSync(SYS + '/module/shortcut_fe', { recursive: true });
	// ---------- 什么都没有 ----------
	reset();
	await tr({ CMCP_TR_MODE: 'none', CMCP_TR_NOCLASH: '1' });
	ok('没有 nft、iptables、连接跟踪：不建规则，跟以前一样只靠 Clash', !runs() && st().acct === 'none' && !st().at, JSON.stringify(st()));
	// ---------- 跨天写进闪存，「分不出」的那天带着标记 ----------
	fs.writeFileSync(TMP + '/cmcp_traf.json', JSON.stringify({ day: '2026-11-01', today: { [M1]: [0, 0, 5, 6] }, names: {}, flushed: 0, nx: true }));
	await tr({ CMCP_TR_MODE: 'none', CMCP_TR_NOCLASH: '1' });
	const mon = JSON.parse(fs.readFileSync(ETC + '/traffic/2026-11.json', 'utf8'));
	ok('跨天：昨天写进闪存，「分不出走代理还是直连」的标记也带上', JSON.stringify(mon.days['2026-11-01'][M1]) === '[0,0,5,6]' && mon.nx && mon.nx['2026-11-01'] === 1, JSON.stringify(mon));
	// ---------- 卸载 ----------
	fs.writeFileSync(ACF, '1'); fs.writeFileSync(ETC + '/acct_ct_on', '1'); clr();
	await tr({}, 'off');
	const r2 = runs();
	ok('卸载：删 nft 表、iptables 的链和跳转', /nft delete table inet cmcp_acct/.test(r2) && /iptables -w -t mangle -D PREROUTING -j cmcp_acct_u/.test(r2) && /ip6tables -w -t mangle -X cmcp_acct_d/.test(r2), r2);
	ok('卸载：我们打开的 nf_conntrack_acct 改回去', fs.readFileSync(ACF, 'utf8').trim() === '0' && !fs.existsSync(ETC + '/acct_ct_on'));
} finally {
	fs.rmSync(D, { recursive: true, force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

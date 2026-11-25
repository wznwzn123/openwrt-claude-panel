// 6.0 第 26 项（路由器）：局域网深度扫描——只扫家里网段（太大的只扫 /24），每批最多 64 个 ping；看 ARP 表，
// DHCP 里没有的记下来（设备列表里一直有，不在线显示离线）；后来走了 DHCP 的从记录里去掉
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_scan.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpsc-'));
const CFG = D + '/config', BIN = D + '/bin', PING = D + '/ping.log', ARP = D + '/arp';
for (const d of [CFG, BIN]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(BIN + '/ping', `#!/bin/sh\necho "$5" >> ${PING}\n`); fs.chmodSync(BIN + '/ping', 0o755);
fs.writeFileSync(BIN + '/ubus', '#!/bin/sh\nexit 4\n'); fs.chmodSync(BIN + '/ubus', 0o755);
const NET = (mask) => `config interface 'lan'\n\toption proto 'static'\n\toption ipaddr '192.168.1.1'\n\toption netmask '${mask}'\n`;
const arp = (rows) => fs.writeFileSync(ARP, 'IP address       HW type     Flags       HW address            Mask     Device\n' + rows.map((r) => `${r[0]}     0x1         ${r[2] || '0x2'}         ${r[1]}     *        br-lan`).join('\n') + '\n');
fs.writeFileSync(D + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
const cgi = (method, params) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, PATH: BIN + ':' + process.env.PATH, CLAUDE_MCP_CONF: D + '/config.json', PATH_INFO: '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_ARP: ARP, CMCP_PING: BIN + '/ping' } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const pings = () => (fs.existsSync(PING) ? fs.readFileSync(PING, 'utf8').trim().split('\n').filter(Boolean) : []);
const leases = '/tmp/dhcp.leases';
let hadLeases = null;
try {
	try { hadLeases = fs.readFileSync(leases, 'utf8'); } catch (e) {}
	fs.writeFileSync(leases, '1900000000 aa:00:00:00:00:10 192.168.1.10 phone *\n');
	fs.writeFileSync(CFG + '/network', NET('255.255.255.0'));
	arp([['192.168.1.10', 'aa:00:00:00:00:10'], ['192.168.1.50', 'aa:00:00:00:00:50'], ['192.168.1.60', 'aa:00:00:00:00:60'], ['192.168.1.70', '00:00:00:00:00:00', '0x0'], ['10.0.0.1', 'bb:00:00:00:00:01'], ['192.168.1.1', 'cc:00:00:00:00:01']]);
	let r = await cgi('lan_scan');
	const P1 = pings();
	ok('只扫家里网段：.1 到 .254，不扫路由器自己', P1.length === 253 && P1.includes('192.168.1.2') && P1.includes('192.168.1.254') && !P1.includes('192.168.1.1') && !P1.includes('192.168.1.0') && !P1.includes('192.168.1.255'), P1.length + ' ' + P1.slice(0, 3));
	ok('ARP 表里在家里网段、有效的才算（不算外网、失效的、路由器自己）', r.result?.found === 3, JSON.stringify(r).slice(0, 300));
	ok('DHCP 里没有的是新设备：.50、.60', JSON.stringify((r.result?.fresh || []).map((x) => x.ip).sort()) === '["192.168.1.50","192.168.1.60"]' && r.result.range === '192.168.1.0/24' && !r.result.part);
	const sc = JSON.parse(fs.readFileSync(D + '/scan.json', 'utf8'));
	ok('记下来（按 MAC）', sc['aa:00:00:00:00:50']?.ip === '192.168.1.50' && sc['aa:00:00:00:00:60'] && !sc['aa:00:00:00:00:10']);
	// 设备列表：扫到的一直在，ARP 里没了就是离线
	arp([['192.168.1.10', 'aa:00:00:00:00:10']]);
	r = await cgi('devices');
	const dv = Object.fromEntries((r.result?.devices || []).map((d) => [d.ip, d]));
	ok('设备列表：扫到的设备一直在（不在线显示离线），带 MAC', dv['192.168.1.50']?.mac === 'aa:00:00:00:00:50' && dv['192.168.1.50'].online === false && dv['192.168.1.60'] && dv['192.168.1.10']?.online, JSON.stringify(r).slice(0, 400));
	// 再扫：已经记过的不算新
	fs.rmSync(PING);
	arp([['192.168.1.50', 'aa:00:00:00:00:50'], ['192.168.1.80', 'aa:00:00:00:00:80']]);
	r = await cgi('lan_scan');
	ok('再扫：记过的不算新，只报 .80', JSON.stringify((r.result?.fresh || []).map((x) => x.ip)) === '["192.168.1.80"]');
	// 后来走了 DHCP：从记录里去掉
	fs.writeFileSync(leases, '1900000000 aa:00:00:00:00:10 192.168.1.10 phone *\n1900000000 aa:00:00:00:00:50 192.168.1.150 cam *\n');
	r = await cgi('lan_scan');
	ok('后来走了 DHCP 的：从扫描记录里去掉', !JSON.parse(fs.readFileSync(D + '/scan.json', 'utf8'))['aa:00:00:00:00:50']);
	// 大网段：只扫 /24
	fs.rmSync(PING); fs.writeFileSync(CFG + '/network', NET('255.255.0.0'));
	r = await cgi('lan_scan');
	ok('网段太大（/16）：只扫路由器所在的 /24，说清楚', pings().length === 253 && r.result?.part === true && r.result.range === '192.168.1.0/24');
	// /22：整段扫，每批 64
	fs.rmSync(PING); fs.writeFileSync(CFG + '/network', NET('255.255.252.0'));
	r = await cgi('lan_scan');
	ok('/22：整段都扫（1021 个）', pings().length === 1021 && r.result.range === '192.168.0.0/22');
} finally {
	if (hadLeases != null) fs.writeFileSync(leases, hadLeases); else fs.rmSync(leases, { force: true });
	fs.rmSync(D, { recursive: true, force: true });
}
let pass = 0; for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '  ' + (note || '').slice(0, 500))); if (c) pass++; }
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

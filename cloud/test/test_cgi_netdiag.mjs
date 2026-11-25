// 6.0 第 21 项（路由器）：网络诊断——Ping、路由追踪、域名查询；只收域名或 IP，不会被当成命令执行；
// 固件没带工具时说原因；OpenClash Fake-IP 的虚拟地址标出来
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_netdiag.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpnd-')), BIN = E + '/bin', ARGS = E + '/args.log';
fs.mkdirSync(BIN);
const TOKEN = 'tok' + 'a'.repeat(30);
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: TOKEN, ckey: 'k'.repeat(40) }));
// 假命令：把收到的参数记下来，按 ND_MODE 输出事先写好的内容
const fake = (name, outs) => {
	for (const [k, v] of Object.entries(outs)) fs.writeFileSync(`${E}/${name}.${k}`, v);
	fs.writeFileSync(`${BIN}/${name}`, `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done > ${ARGS}.${name}\ncat ${E}/${name}.\${ND_MODE:-ok}\n`, { mode: 0o755 });
};
fake('ping', {
	ok: 'PING www.baidu.com (110.242.68.3): 56 data bytes\n64 bytes from 110.242.68.3: seq=0 ttl=52 time=12.345 ms\n64 bytes from 110.242.68.3: seq=1 ttl=52 time=11.002 ms\n64 bytes from 110.242.68.3: seq=3 ttl=52 time=14.100 ms\n\n--- www.baidu.com ping statistics ---\n4 packets transmitted, 3 packets received, 25% packet loss\nround-trip min/avg/max = 11.002/12.482/14.100 ms\n',
	fake: 'PING www.google.com (198.18.0.12): 56 data bytes\n64 bytes from 198.18.0.12: seq=0 ttl=64 time=0.210 ms\n\n--- www.google.com ping statistics ---\n1 packets transmitted, 1 packets received, 0% packet loss\nround-trip min/avg/max = 0.210/0.210/0.210 ms\n',
	iputils: 'PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.\n64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=8.12 ms\n\n--- 1.1.1.1 ping statistics ---\n4 packets transmitted, 4 received, 0% packet loss, time 3004ms\nrtt min/avg/max/mdev = 7.9/8.1/8.4/0.2 ms\n',
	bad: "ping: bad address 'nope.invalid'\n",
});
fake('traceroute', {
	ok: 'traceroute to 1.1.1.1 (1.1.1.1), 20 hops max, 46 byte packets\n 1  192.168.1.1  0.512 ms\n 2  *\n 3  10.0.0.1  5.123 ms\n 4  1.1.1.1  9.870 ms\n',
});
fake('nslookup', {
	ok: 'Server:\t\t127.0.0.1\nAddress:\t127.0.0.1:53\n\nNon-authoritative answer:\nwww.baidu.com\tcanonical name = www.a.shifen.com\nName:\twww.a.shifen.com\nAddress: 110.242.68.3\nName:\twww.a.shifen.com\nAddress: 110.242.68.4\n\nwww.a.shifen.com\tcanonical name = www.a.shifen.com.\n',
	nx: "Server:\t\t127.0.0.1\nAddress:\t127.0.0.1:53\n\n** server can't find nope.invalid: NXDOMAIN\n",
	fake: 'Server:\t\t127.0.0.1\nAddress:\t127.0.0.1:53\n\nName:\twww.google.com\nAddress: 198.18.0.12\n',
});
const cgi = (method, params, xenv = {}) => new Promise((z) => {
	const msg = { jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' }, body = JSON.stringify(msg);
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/' + TOKEN, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_ND_BIN: BIN, ...xenv } });
	let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const args = (n) => { try { return fs.readFileSync(ARGS + '.' + n, 'utf8').trim().split('\n'); } catch (e) { return []; } };

let r = await cgi('netdiag', { tool: 'ping', addr: 'www.baidu.com' });
ok('Ping：IP、每次的延迟、发了几个收到几个、丢包、平均', r.result && r.result.ip === '110.242.68.3' && r.result.times.length === 3 && r.result.sent === 4 && r.result.recv === 3 && r.result.loss === 25 && r.result.avg === 12.482 && !r.result.fake, JSON.stringify(r).slice(0, 300));
ok('Ping：发 4 个，每个最多等 2 秒', JSON.stringify(args('ping')) === JSON.stringify(['-c', '4', '-W', '2', 'www.baidu.com']), args('ping').join(' '));
r = await cgi('netdiag', { tool: 'ping', addr: 'https://www.google.com/search?q=1' }, { ND_MODE: 'fake' });
ok('Ping：粘贴网址也行（只取主机名）；Fake-IP 的虚拟地址标出来', args('ping').at(-1) === 'www.google.com' && r.result && r.result.fake === true, JSON.stringify(r).slice(0, 200));
r = await cgi('netdiag', { tool: 'ping', addr: '1.1.1.1' }, { ND_MODE: 'iputils' });
ok('Ping：另一种输出格式（iputils）也认', r.result && r.result.sent === 4 && r.result.recv === 4 && r.result.loss === 0 && r.result.avg === 8.1, JSON.stringify(r).slice(0, 200));
r = await cgi('netdiag', { tool: 'ping', addr: 'nope.invalid' }, { ND_MODE: 'bad' });
ok('Ping：域名不对，说清楚', r.error && /找不到「nope\.invalid」/.test(r.error.message), JSON.stringify(r).slice(0, 200));
// 防命令注入
for (const bad of ['a.com; reboot', '$(reboot)', '-c 100 a.com', 'a.com|id', '`id`', 'a b', '']) {
	fs.rmSync(ARGS + '.ping', { force: true });
	r = await cgi('netdiag', { tool: 'ping', addr: bad });
	ok('不收命令：「' + bad + '」', r.error && /请输入域名或 IP/.test(r.error.message) && !fs.existsSync(ARGS + '.ping'), JSON.stringify(r).slice(0, 160));
}
r = await cgi('netdiag', { tool: 'rm', addr: 'a.com' });
ok('不支持的工具：拒绝', r.error && /不支持/.test(r.error.message));
// 路由追踪
r = await cgi('netdiag', { tool: 'trace', addr: '1.1.1.1' });
ok('路由追踪：每一跳的 IP 和延迟，没回应的是空，到达终点', r.result && r.result.hops.length === 4 && r.result.hops[0].ip === '192.168.1.1' && r.result.hops[0].ms === 0.512 && r.result.hops[1].ip === null && r.result.done === true, JSON.stringify(r).slice(0, 300));
ok('路由追踪：不反查域名、每跳 1 次、最多 20 跳', JSON.stringify(args('traceroute')) === JSON.stringify(['-n', '-q', '1', '-w', '2', '-m', '20', '1.1.1.1']), args('traceroute').join(' '));
// 域名查询
r = await cgi('netdiag', { tool: 'dns', addr: 'www.baidu.com' });
ok('域名查询：用的哪个 DNS、查到的 IP（不含 DNS 自己的地址）、别名', r.result && r.result.server === '127.0.0.1' && JSON.stringify(r.result.ips) === '["110.242.68.3","110.242.68.4"]' && JSON.stringify(r.result.cname) === '["www.a.shifen.com"]', JSON.stringify(r).slice(0, 300));
r = await cgi('netdiag', { tool: 'dns', addr: 'nope.invalid' }, { ND_MODE: 'nx' });
ok('域名查询：不存在的域名', r.error && /这个域名不存在/.test(r.error.message), JSON.stringify(r).slice(0, 200));
r = await cgi('netdiag', { tool: 'dns', addr: 'www.google.com' }, { ND_MODE: 'fake' });
ok('域名查询：Fake-IP 标出来', r.result && r.result.fake === true);
r = await cgi('netdiag', { tool: 'dns', addr: '8.8.8.8' });
ok('域名查询：只能输域名', r.error && /只能输入域名/.test(r.error.message));
// 固件没带
fs.renameSync(BIN + '/traceroute', E + '/traceroute.bak');
r = await cgi('netdiag', { tool: 'trace', addr: '1.1.1.1' });
ok('没有 traceroute：说原因', r.error && /固件没带 traceroute/.test(r.error.message), JSON.stringify(r).slice(0, 200));
r = await cgi('netdiag_caps', {});
ok('能用哪几个：一次告诉面板', r.result && r.result.ping === true && r.result.trace === false && r.result.dns === true, JSON.stringify(r));
fs.renameSync(E + '/traceroute.bak', BIN + '/traceroute');

fs.rmSync(E, { recursive: true, force: true });
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

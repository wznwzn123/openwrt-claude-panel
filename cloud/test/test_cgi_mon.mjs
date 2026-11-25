// 6.0 第 27 项（路由器）：实时监控——负载 1/5/15、CPU 核数、CPU 使用率（跟上一次比）、内存、系统连接数和上限
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_mon.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpmon-')), R = E + '/root';
const TOKEN = 'tok' + 'a'.repeat(30);
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: TOKEN, ckey: 'k'.repeat(40) }));
const mk = (f, s) => { fs.mkdirSync(path.dirname(R + f), { recursive: true }); fs.writeFileSync(R + f, s); };
mk('/proc/loadavg', '0.42 0.38 0.31 2/180 12345\n');
mk('/proc/cpuinfo', 'processor\t: 0\nmodel name\t: ARMv8\n\nprocessor\t: 1\n\nprocessor\t: 2\n\nprocessor\t: 3\n');
mk('/proc/sys/net/netfilter/nf_conntrack_count', '1203\n');
mk('/proc/sys/net/netfilter/nf_conntrack_max', '16384\n');
mk('/proc/meminfo', 'MemTotal:         240000 kB\nMemFree:           20000 kB\nMemAvailable:      90000 kB\n');
mk('/proc/stat', 'cpu  1000 0 1000 8000 0 0 0 0\ncpu0 1 1 1 1\n');
const cgi = (method, params) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/' + TOKEN, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_MON_ROOT: R } });
	let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
fs.rmSync('/tmp/cmcp_moncpu.json', { force: true });
let r = await cgi('mon');
const x = r.result || {};
ok('负载 1/5/15 分钟、4 核', JSON.stringify(x.load) === '[0.42,0.38,0.31]' && x.cpus === 4, JSON.stringify(r).slice(0, 300));
ok('系统连接数和上限', x.conn === 1203 && x.conn_max === 16384);
ok('内存用了多少（按可用内存算）', x.mem >= 62 && x.mem <= 63, x.mem);
ok('第一次没有 CPU 使用率（还没得比）', x.cpu === null);
mk('/proc/stat', 'cpu  1300 0 1100 8600 0 0 0 0\n');
r = await cgi('mon');
ok('第二次：CPU 使用率 = 1 - 空闲增量 / 总增量（400 / 1000 = 40%）', r.result && r.result.cpu === 40, JSON.stringify(r.result));
fs.rmSync(R + '/proc/sys', { recursive: true, force: true });
r = await cgi('mon');
ok('没有连接跟踪：连接数是空，不报错', r.result && r.result.conn === null && r.result.conn_max === null);
fs.rmSync('/tmp/cmcp_moncpu.json', { force: true });
fs.rmSync(E, { recursive: true, force: true });
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

// 点「检查更新」（用户 11/27：路由器要立即检查补丁）：当场问官网这个版本最新的修复补丁是第几个（hotn），并在后台马上跑 cmcp-hot；
// 面板据 hotn 写「正在安装 Vn…」。nohot（面板等补丁时的轮询）不再触发
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_update_hot.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
// 版本文件写死在 /etc/claude-mcp/version：已经有（真路由器）就不测，免得改坏
const VF = '/etc/claude-mcp/version';
if (fs.existsSync(VF)) { console.log('跳过：本机已经有 ' + VF); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpuh-')), SB = E + '/sbin', CFG = E + '/config';
for (const d of [SB, CFG]) fs.mkdirSync(d, { recursive: true });
fs.mkdirSync('/etc/claude-mcp', { recursive: true });
fs.writeFileSync(VF, 'VER=6.0.0\nCODE=hosted-ai\nHOT=1\n');
let HOTN = 3, HUBUP = true; const ASK = [];
const srv = http.createServer((q, s) => {
	ASK.push(q.url);
	if (!HUBUP) { s.statusCode = 502; return s.end('{}'); }
	s.setHeader('content-type', 'application/json');
	if (q.url.startsWith('/api/router/version')) return s.end(JSON.stringify({ version: '6.0.0', notes: '' }));
	if (q.url.startsWith('/api/router/hot?v=6.0.0')) return s.end(JSON.stringify({ ok: true, n: HOTN, tag: 'hot-6.0.0-' + HOTN }));
	s.statusCode = 404; s.end('{}');
});
await new Promise((z) => srv.listen(8771, '127.0.0.1', z));
fs.writeFileSync(E + '/hub.conf', 'HUB=http://127.0.0.1:8771\n');
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: 'tok' + 'u'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
const MARK = E + '/hot-ran';
fs.writeFileSync(SB + '/cmcp-hot', `#!/bin/sh\necho "$1" >> ${MARK}\n`, { mode: 0o755 });
const LKF = '/etc/claude-mcp/local.key', LK0 = fs.existsSync(LKF);
if (!LK0) fs.writeFileSync(LKF, 'k'.repeat(40) + '\n');
const LK = fs.readFileSync(LKF, 'utf8').trim();
const cgi = (method, params) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel', dev: 'local.' + LK });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', CMCP_SBIN: SB, PATH_INFO: '/tok' + 'u'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)) } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const W = (ms) => new Promise((r) => setTimeout(r, ms));
try {
	let r = await cgi('update_check', { force: true });
	await W(600);
	ok('点「检查更新」：当场问官网这个版本最新的补丁（第 3 个），告诉面板', r.result?.hotq === true && r.result?.hotn === 3 && r.result?.hot === 1 && ASK.some((u) => u === '/api/router/hot?v=6.0.0'), JSON.stringify(r.result));
	ok('同时在后台马上跑一次补丁检查（cmcp-hot check）', fs.existsSync(MARK) && fs.readFileSync(MARK, 'utf8').trim() === 'check');
	fs.rmSync(MARK, { force: true }); ASK.length = 0;
	r = await cgi('update_check', { nohot: 1 });
	await W(600);
	ok('面板等补丁时的轮询（nohot）：不问补丁、不再跑 cmcp-hot', !r.result?.hotq && r.result?.hotn == null && !fs.existsSync(MARK) && !ASK.some((u) => u.includes('/hot')), JSON.stringify(r.result));
	HUBUP = false;
	r = await cgi('update_check', { force: true });
	await W(600);
	ok('官网连不上：不知道最新是第几个（hotn 为空），后台照样去查', r.result?.hotq === true && r.result?.hotn == null && fs.existsSync(MARK), JSON.stringify(r.result));
} finally {
	srv.close();
	try { fs.rmSync(VF); } catch (e) {}
	if (!LK0) { try { fs.rmSync(LKF); } catch (e) {} }
	fs.rmSync(E, { recursive: true, force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

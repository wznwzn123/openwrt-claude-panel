// 热补丁装完的自检（cmcp-hot 的 selfcheck）要真能通过：11/27 线上 6.0.0 的自检问的是假地址 /cgi-bin/mcp/x，接口回 404，补丁永远装不上
// 这里用真的接口（ucode 跑 cgi-bin/mcp）和一个假的 curl（把请求转给 cgi）跑 selfcheck：
//   新的 cmcp-hot：用 config.json 里的登录密钥 + 路由器自己的钥匙问 whoami，要拿到结果
//   6.0.0 的 cmcp-hot：问 /x，新接口要回 200 且带 "jsonrpc"（不然 6.0.0 的路由器装不上第一个修好的补丁）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_hot_selfcheck.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcphc-')), BIN = E + '/bin', CFG = E + '/config';
for (const d of [BIN, CFG]) fs.mkdirSync(d, { recursive: true });
const TOKEN = 'tok' + 'h'.repeat(30);
const conf = (t) => fs.writeFileSync(E + '/config.json', JSON.stringify({ token: t, uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
conf(TOKEN);
// 路由器本机小工具的钥匙（共用库里写死在 /etc/claude-mcp/local.key）：没有就临时建一个，测完删掉
const LKF = '/etc/claude-mcp/local.key', LK0 = fs.existsSync(LKF);
if (!LK0) { fs.mkdirSync('/etc/claude-mcp', { recursive: true }); fs.writeFileSync(LKF, 'k'.repeat(40) + '\n'); }
fs.copyFileSync(LKF, E + '/local.key');
const MCP = path.resolve('../src/www/cgi-bin/mcp');
let CGI = MCP;
// 假的 jsonfilter（-i 文件 -e '@.键'）
fs.writeFileSync(BIN + '/jsonfilter', `#!/usr/bin/env node
const a = process.argv.slice(2); let f = null, e = '';
for (let i = 0; i < a.length; i++) { if (a[i] === '-i') f = a[++i]; else if (a[i] === '-e') e = a[++i]; }
let o; try { o = JSON.parse(require('fs').readFileSync(f ?? 0, 'utf8')); } catch (x) { process.exit(1); }
const v = o[e.replace(/^@\\./, '')]; if (v == null) process.exit(1); console.log(v);
`, { mode: 0o755 });
// 假的 curl：面板网页 manifest.json 回 200；POST 到 /cgi-bin/mcp/路径 就交给真的接口跑，打印返回的内容
fs.writeFileSync(BIN + '/curl', `#!/usr/bin/env node
const a = process.argv.slice(2); let d = null, w = null, url = '';
for (let i = 0; i < a.length; i++) { if (a[i] === '-d') d = a[++i]; else if (a[i] === '-w') w = a[++i]; else if (a[i] === '-H' || a[i] === '-m' || a[i] === '-o') i++; else if (!a[i].startsWith('-')) url = a[i]; }
if (url.endsWith('/panel/manifest.json')) { process.stdout.write(w ? '200' : '{}'); process.exit(0); }
const m = /\\/cgi-bin\\/mcp(\\/.*)?$/.exec(url); if (!m) process.exit(7);
const r = require('child_process').spawnSync('sh', ['-c', process.env.UCODE + ' ' + JSON.stringify(process.env.HC_CGI)], { input: d ?? '', env: { ...process.env, CLAUDE_MCP_CONF: process.env.HC_CONF, PATH_INFO: m[1] ?? '', REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(d ?? '')) } });
const out = r.stdout.toString(), i = out.indexOf('\\r\\n\\r\\n'); process.stdout.write(i >= 0 ? out.slice(i + 4) : out);
`, { mode: 0o755 });
// 从 cmcp-hot 里取出 selfcheck 函数单独跑
const fnOf = (src) => { const i = src.indexOf('selfcheck() {'); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 3); };
const NEW = fnOf(fs.readFileSync(path.resolve('../src/bin/cmcp-hot'), 'utf8'));
let OLD = '';
try { OLD = fnOf(execFileSync('git', ['show', 'v6.0.0:src/bin/cmcp-hot'], { cwd: path.resolve('..') }).toString()); } catch (e) {}
const run = (fn) => spawnSync('sh', ['-c', fn + '\nselfcheck && echo PASS || echo FAIL'], { env: { ...process.env, PATH: BIN + ':' + process.env.PATH, D: E, UCODE: UC, HC_CGI: CGI, HC_CONF: E + '/config.json' } }).stdout.toString().trim();
ok('新的自检：用 config.json 里的登录密钥问 whoami，接口正常就通过', run(NEW) === 'PASS', run(NEW));
ok('新的自检不再用假地址 /x', !/cgi-bin\/mcp\/x\b/.test(NEW) && /config\.json/.test(NEW) && /"result"/.test(NEW));
if (OLD) {
	ok('6.0.0 的自检（问 /x）：新接口能通过（6.0.0 的路由器才装得上修好的补丁）', run(OLD) === 'PASS', run(OLD));
	ok('6.0.0 的自检确实问的是 /x（找对了原因）', /cgi-bin\/mcp\/x/.test(OLD));
} else ok('读得到 v6.0.0 的 cmcp-hot（git 标签）', false);
// 自检地址只回「能跑」，不带任何数据
const hc = spawnSync('sh', ['-c', UC + ' ' + JSON.stringify(MCP)], { input: '{}', env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/hc', REQUEST_METHOD: 'GET' } }).stdout.toString();
ok('自检地址 /hc：200，只有 ok，不用登录密钥', /^Status: 200/.test(hc) && hc.includes('"result": { "ok": true }') && !hc.includes(TOKEN), hc.slice(0, 200));
// 登录密钥不对：新的自检不通过（证明真的走了登录密钥那条路）
conf('tok' + 'z'.repeat(30));
ok('config.json 里的登录密钥跟接口不一致：新的自检不通过', run(NEW.replace('$(jsonfilter -i "$D/config.json" -e \'@.token\' 2>/dev/null)', 'wrong' + 'w'.repeat(20))) === 'FAIL');
conf(TOKEN);
// 接口坏了（语法错误）：新旧自检都不通过，会退回原来的
const BAD = E + '/mcp-bad'; fs.writeFileSync(BAD, fs.readFileSync(MCP, 'utf8').replace(/function main\(\) \{/, 'function main() { let = ;'));
CGI = BAD;
ok('接口坏了：新的自检不通过', run(NEW) === 'FAIL');
if (OLD) ok('接口坏了：6.0.0 的自检也不通过', run(OLD) === 'FAIL');
CGI = MCP;
// 看门狗、每日报告也改成从 config.json 读登录密钥（原来读的 token 文件新装的没有）
const WD = fs.readFileSync(path.resolve('../src/bin/cmcp-watchdog'), 'utf8'), DY = fs.readFileSync(path.resolve('../src/bin/cmcp-daily'), 'utf8');
ok('看门狗、每日报告不再读 token 文件', !/\$D\/token/.test(WD) && !/'\/token'/.test(DY) && /config\.json/.test(WD) && /config\.json/.test(DY));
if (!LK0) { try { fs.rmSync(LKF); } catch (e) {} }
fs.rmSync(E, { recursive: true, force: true });
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

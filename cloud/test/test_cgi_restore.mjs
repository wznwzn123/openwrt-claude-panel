// 6.0：还原云端备份时，钥匙类的文件保留现在的（登录密钥、登录着的手机、原版页面门禁钥匙、「登录要输路由器密码」开关、
// 托管和云端钥匙、备份加密密钥），其它设置照常还原。不然之后移除的手机、换掉的登录地址又能用了
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_restore.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, execSync } from 'child_process';
import http from 'http';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcprs-'));
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcprsbin-'));
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcprssbin-'));
const w = (f, t) => fs.writeFileSync(E + '/' + f, t);
const rd = (f) => (fs.existsSync(E + '/' + f) ? fs.readFileSync(E + '/' + f, 'utf8') : null);

// 1. 备份当时的样子：旧登录密钥、旧手机列表（有一台后来被移除的）、旧门禁钥匙、开着「登录要输路由器密码」、旧的面板其它设置
const OLD = { token: 'old' + 'a'.repeat(37) };
w('config.json', JSON.stringify(OLD));
w('devices.json', JSON.stringify({ gone0001: { s: 'x'.repeat(32), name: '被移除的手机', at: 1 } }));
w('luci_key', 'o'.repeat(32));
w('login_pw', '');
w('cloud.conf', 'URL=http://127.0.0.1:8197\nRKEY=oldrkey\n');
w('bk.key', 'oldkey\n');
w('daily.json', '{"old":true}');
const TGZ = os.tmpdir() + '/cmcprs-backup.tgz';
execSync(`tar czf ${TGZ} -C / ${E.slice(1)}/config.json ${E.slice(1)}/devices.json ${E.slice(1)}/luci_key ${E.slice(1)}/login_pw ${E.slice(1)}/cloud.conf ${E.slice(1)}/bk.key ${E.slice(1)}/daily.json`);

// 2. 现在的样子：换过登录密钥、只有自己这台手机、新门禁钥匙、关掉了「登录要输路由器密码」
const NOW = { token: 'new' + 'b'.repeat(37), ckey: 'c'.repeat(40) };
w('config.json', JSON.stringify(NOW));
w('devices.json', JSON.stringify({ mine0001: { s: 'y'.repeat(32), name: '我的手机', at: 2 } }));
w('luci_key', 'n'.repeat(32));
fs.rmSync(E + '/login_pw');
w('cloud.conf', 'URL=http://127.0.0.1:8197\nRKEY=nowrkey\n');
w('bk.key', 'nowkey\n');
w('daily.json', '{"now":true}');

// 假的下载、还原、重启
// 假的云端：只认这台路由器的云端钥匙（nowrkey）
const hits = [];
const srv = http.createServer((req, res) => { hits.push(req.url); if (req.url === '/bk/nowrkey/abcd1234') { res.writeHead(200); return res.end(fs.readFileSync(TGZ)); } res.writeHead(404); res.end(); });
await new Promise((z) => srv.listen(8197, '127.0.0.1', z));
fs.writeFileSync(BIN + '/sysupgrade', `#!/bin/sh\n[ "$1" = -r ] && tar xzf "$2" -C / && echo restored >> ${E}/.log\n`, { mode: 0o755 });
fs.writeFileSync(BIN + '/reboot', `#!/bin/sh\necho reboot >> ${E}/.log\n`, { mode: 0o755 });
fs.writeFileSync(SB + '/cmcp-backup', '#!/bin/sh\ncase "$1" in decrypt) exit 2 ;; esac; exit 0\n', { mode: 0o755 });
fs.writeFileSync(SB + '/cmcp-watchdog', '#!/bin/sh\nexit 0\n', { mode: 0o755 });

const cgi = (msg) => new Promise((z) => {
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, PATH: BIN + ':' + process.env.PATH, no_proxy: '127.0.0.1', NO_PROXY: '127.0.0.1', http_proxy: '', HTTP_PROXY: '', CMCP_SBIN: SB, CMCP_REBOOT: BIN + '/reboot', CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/' + NOW.token, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(JSON.stringify(msg))) } });
	let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(JSON.stringify(msg));
});
const r = await cgi({ jsonrpc: '2.0', id: 1, method: 'panel/bk_restore', params: { id: 'abcd1234', force: true }, client: 'panel' });
ok('开始还原', r.result?.ok === true, JSON.stringify(r).slice(0, 300));
for (let i = 0; i < 40 && !/reboot/.test(rd('.log') || ''); i++) await W(250);
ok('还原完重启', /restored[\s\S]*reboot/.test(rd('.log') || ''), rd('.log'));
ok('其它设置照常还原（回到备份当时）', /"old":true/.test(rd('daily.json') || ''));
ok('登录密钥保留现在的（换掉的旧登录地址不会复活）', JSON.parse(rd('config.json')).token === NOW.token && JSON.parse(rd('config.json')).ckey === NOW.ckey);
ok('登录着的手机保留现在的（之后移除的手机不会回来）', !!JSON.parse(rd('devices.json')).mine0001 && !JSON.parse(rd('devices.json')).gone0001);
ok('原版页面门禁钥匙保留现在的', rd('luci_key') === 'n'.repeat(32));
ok('现在没开的「登录要输路由器密码」还原后也没开', rd('login_pw') === null);
ok('云端钥匙、备份加密密钥保留现在的', /nowrkey/.test(rd('cloud.conf')) && rd('bk.key') === 'nowkey\n');
ok('临时保存的钥匙只有路由器自己能读', (() => { try { return (fs.statSync('/tmp/cmcp_keep').mode & 0o777) === 0o700; } catch (e) { return false; } })());
srv.close();
try { fs.rmSync('/tmp/cmcp_keep', { recursive: true }); fs.rmSync(TGZ); } catch (e) {}
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

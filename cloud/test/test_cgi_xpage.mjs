// 6.0 第 36 项（路由器）：在外面打开路由器上其他端口的页面——认识的页面自动列出、没在运行的说原因、主账号手动加端口；
// 打开时让官网切过去，再用 RKEY 签一张 2 小时的通行证（busybox sha256sum 拼的 HMAC，要跟标准算法一样）；自建版、本地版说清楚
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_xpage.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpxp-')), CFG = E + '/config', R = E + '/root';
for (const d of [CFG, R + '/etc/init.d']) fs.mkdirSync(d, { recursive: true });
for (const n of ['openclash', 'AdGuardHome', 'ttyd']) fs.writeFileSync(`${R}/etc/init.d/${n}`, '#!/bin/sh\n', { mode: 0o755 });
fs.writeFileSync(R + '/etc/AdGuardHome.yaml', 'http:\n  pprof:\n    port: 6060\n  address: 0.0.0.0:3001\n');
fs.writeFileSync(CFG + '/openclash', "config openclash 'config'\n\toption cn_port '9093'\n\toption dashboard_password 'p@ss word'\n");
fs.writeFileSync(CFG + '/ttyd', "config ttyd\n\toption port '7682'\n\toption ssl '1'\n");
const RKEY = 'r'.repeat(20) + 'K3y', SUB = 'abcd2345';
const HUBC = [];
const srv = http.createServer((q, s) => { let b = ''; q.on('data', (x) => (b += x)); q.on('end', () => { HUBC.push({ path: q.url, b: JSON.parse(b || '{}') }); s.setHeader('content-type', 'application/json'); s.end(JSON.stringify({ ok: true, host: SUB + '-x.panel.example', port: JSON.parse(b).port })); }); });
await new Promise((z) => srv.listen(8762, '127.0.0.1', z));
fs.writeFileSync(E + '/hub.conf', `HUB=http://127.0.0.1:8762\nSUB=${SUB}\n`);
fs.writeFileSync(E + '/cloud.conf', `URL=https://${SUB}.panel.example/cloud\nRKEY=${RKEY}\nPKEY=pk\n`);
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: 'tok' + 'y'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
const NOW = 1800000000;
// 路由器本机小工具的钥匙（共用库里写死在 /etc/claude-mcp/local.key）：没有就临时建一个，测完删掉
const LKF = '/etc/claude-mcp/local.key', LK0 = fs.existsSync(LKF);
if (!LK0) { fs.mkdirSync('/etc/claude-mcp', { recursive: true }); fs.writeFileSync(LKF, 'k'.repeat(40) + '\n'); }
const LK = fs.readFileSync(LKF, 'utf8').trim();
const cgi = (method, params, xenv = {}) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel', dev: 'local.' + LK });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/tok' + 'y'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_XP_ROOT: R, CMCP_XP_LISTEN: '9093 3001', CMCP_XP_NOW: String(NOW), NO_PROXY: '*', no_proxy: '*', ...xenv } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const err = (r) => r.error?.message || '';
try {
	let r = await cgi('xp_get');
	const L = r.result?.list || [];
	ok('认识的页面：OpenClash 控制面板（用它的端口）、AdGuard Home（从 yaml 读端口）、网页终端（https）', r.result?.mode === 'hosted' && L.find((x) => x.id === 'oc')?.port === 9093 && L.find((x) => x.id === 'agh')?.port === 3001 && L.find((x) => x.id === 'ttyd')?.port === 7682 && L.find((x) => x.id === 'ttyd')?.https === true, JSON.stringify(r).slice(0, 500));
	ok('标出哪些在运行', L.find((x) => x.id === 'oc').up === true && L.find((x) => x.id === 'ttyd').up === false);
	ok('不把控制面板的密钥发给手机', !JSON.stringify(r).includes('p@ss'));
	ok('没在运行的不能开：说原因', /网页终端（ttyd） 没在运行（端口 7682 没人在听）/.test(err(await cgi('xp_open', { id: 'ttyd' }))));
	r = await cgi('xp_open', { id: 'agh' });
	const u = new URL(r.result?.url || 'http://x');
	const want = crypto.createHmac('sha256', RKEY).update(`${SUB}|3001|${NOW + 7200}`).digest('hex');
	ok('打开：让官网把「-x」切到 3001', HUBC.length === 1 && HUBC[0].path === '/api/dev/xtarget' && HUBC[0].b.port === 3001 && HUBC[0].b.sub === SUB && HUBC[0].b.rkey === RKEY && HUBC[0].b.https === false, JSON.stringify(HUBC));
	ok('通行证：2 小时，签名跟标准 HMAC-SHA256 一样', u.host === SUB + '-x.panel.example' && u.pathname === '/__cmcpx' && u.searchParams.get('p') === '3001' && u.searchParams.get('e') === String(NOW + 7200) && u.searchParams.get('s') === want && u.searchParams.get('to') === '/', r.result?.url);
	r = await cgi('xp_open', { id: 'oc' });
	const u2 = new URL(r.result.url), to = u2.searchParams.get('to');
	ok('控制面板：打开就连好接口（这个地址的 443、带密钥）', to === `/ui/?hostname=${SUB}-x.panel.example&port=443&secret=p%40ss%20word` && u2.searchParams.get('s') === crypto.createHmac('sha256', RKEY).update(`${SUB}|9093|${NOW + 7200}`).digest('hex'), to);
	ok('记下现在开着哪个', (await cgi('xp_get')).result?.cur === 9093);
	// 完整原版后台里拦下来的「路由器:端口」：按端口开
	r = await cgi('xp_open', { port: 3001, path: '/#/settings' });
	ok('按端口开：认识的用它的名字，路径用原版后台里的', r.result?.name === 'AdGuard Home' && new URL(r.result.url).searchParams.get('to') === '/#/settings', JSON.stringify(r));
	r = await cgi('xp_open', { port: 9093, path: '/ui/?hostname=192.168.1.1&port=9093' });
	ok('按端口开控制面板：换成这个地址的接口（不用原版后台里的局域网地址）', /^\/ui\/\?hostname=abcd2345-x\.panel\.example&port=443/.test(new URL(r.result.url).searchParams.get('to')));
	ok('按端口开：没人在听的端口说原因', /端口 5555 没在运行/.test(err(await cgi('xp_open', { port: 5555 }))));
	ok('按端口开：面板自己的端口不行', /不能开/.test(err(await cgi('xp_open', { port: 18765 }))));
	// 长钥匙（超过 64 字节）也对
	fs.writeFileSync(E + '/cloud.conf', `RKEY=${'L'.repeat(80)}\nPKEY=pk\n`);
	r = await cgi('xp_open', { id: 'oc' });
	ok('钥匙超过 64 字节：先哈希（跟标准一样）', new URL(r.result.url).searchParams.get('s') === crypto.createHmac('sha256', 'L'.repeat(80)).update(`${SUB}|9093|${NOW + 7200}`).digest('hex'));
	// 手动加
	ok('手动加：端口不对', /1–65535/.test(err(await cgi('xp_set', { op: 'add', name: 'NAS', port: 70000 }))));
	ok('手动加：面板自己的端口不行', /不能开/.test(err(await cgi('xp_set', { op: 'add', name: 'x', port: 18765 }))));
	ok('手动加：已经认识的端口不重复', /已经在列表里了/.test(err(await cgi('xp_set', { op: 'add', name: 'x', port: 3001 }))));
	r = await cgi('xp_set', { op: 'add', name: 'Docker 管理', port: 9000, path: '/#/home' === '/#/home' ? '/home' : '/' });
	ok('手动加：出现在列表里', r.result?.list?.some((x) => x.id === 'm9000' && x.name === 'Docker 管理' && x.path === '/home'));
	r = await cgi('xp_set', { op: 'del', port: 9000 });
	ok('删掉手动加的', !r.result?.list?.some((x) => x.port === 9000));
	// 关掉
	HUBC.length = 0;
	r = await cgi('xp_close');
	ok('关掉：让官网指回 404', r.result?.ok && HUBC[0]?.b.port === 0 && (await cgi('xp_get')).result.cur === 0);
	// 本地版、自建版
	fs.writeFileSync(E + '/local', '');
	ok('本地版：说在家里直接打开', (await cgi('xp_get')).result.mode === 'local' && /本地版/.test(err(await cgi('xp_open', { id: 'oc' }))));
	fs.unlinkSync(E + '/local'); fs.unlinkSync(E + '/hub.conf');
	ok('自建版：说看教程', (await cgi('xp_get')).result.mode === 'self' && /教程/.test(err(await cgi('xp_open', { id: 'oc' }))));
	const fam = fs.readFileSync('../src/mcp/26-backup.uc', 'utf8');
	ok('只有主账号能用（不在任何权限组里）', !/'xp_(get|open|close|set)'/.test(fam));
} finally {
	srv.close(); fs.rmSync(E, { recursive: true, force: true }); if (!LK0) fs.rmSync(LKF, { force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

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
// 第 37 项：家里设备（租约文件是写死的 /tmp/dhcp.leases：没有就临时建一个，测完删掉）；推送记到文件里
const LEASE = '/tmp/dhcp.leases', LEASE0 = fs.existsSync(LEASE), SB = E + '/sbin', PUSH = E + '/push.log';
if (!LEASE0) fs.writeFileSync(LEASE, '1800000000 aa:bb:cc:00:00:20 192.168.1.20 MyNAS *\n1800000000 aa:bb:cc:00:00:30 192.168.1.30 camera *\n1800000000 aa:bb:cc:00:00:99 100.64.0.9 cgnat *\n');
fs.mkdirSync(SB);
fs.writeFileSync(SB + '/cmcp-notify', `#!/bin/sh\nprintf '%s|%s|%s|%s|%s\\n' "$1" "$2" "$3" "$4" "$5" >> ${PUSH}\n`, { mode: 0o755 });
// 路由器本机小工具的钥匙（共用库里写死在 /etc/claude-mcp/local.key）：没有就临时建一个，测完删掉
const LKF = '/etc/claude-mcp/local.key', LK0 = fs.existsSync(LKF);
if (!LK0) { fs.mkdirSync('/etc/claude-mcp', { recursive: true }); fs.writeFileSync(LKF, 'k'.repeat(40) + '\n'); }
const LK = fs.readFileSync(LKF, 'utf8').trim();
const cgi = (method, params, xenv = {}) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel', dev: 'local.' + LK });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/tok' + 'y'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_XP_ROOT: R, CMCP_XP_LISTEN: '9093 3001', CMCP_XP_NOW: String(NOW), CMCP_XP_ADDRS: '192.168.1.1/24 10.9.0.1/24', CMCP_SBIN: SB, NO_PROXY: '*', no_proxy: '*', ...xenv } });
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
	r = await cgi('xp_open', { port: 9093, ui: 'metacubexd' });
	ok('面板「打开控制面板」：metacubexd 打开就连好（#/setup）', new URL(r.result.url).searchParams.get('to') === `/ui/metacubexd/#/setup?hostname=${SUB}-x.panel.example&port=443&secret=p%40ss%20word`, r.result?.url);
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
	// ---------- 第 37 项：家里其他设备 ----------
	r = await cgi('xp_get', { cands: true });
	ok('默认一台设备都没有', Array.isArray(r.result?.devs) && r.result.devs.length === 0);
	ok('能选的设备：家里局域网里正在用的（不在局域网的不列）', !LEASE0 ? JSON.stringify(r.result.cands.map((x) => x.ip)) === '["192.168.1.20","192.168.1.30"]' && r.result.cands[0].mac === 'aa:bb:cc:00:00:20' : true, JSON.stringify(r.result?.cands));
	ok('不在局域网的地址不能加', /不在家里局域网里/.test(err(await cgi('xp_set', { op: 'dadd', name: 'x', ip: '192.168.2.5', port: 80 }))));
	ok('公网地址不能加', /只能开家里局域网/.test(err(await cgi('xp_set', { op: 'dadd', name: 'x', ip: '8.8.8.8', port: 80 }))));
	ok('路由器自己不能加（用上面的「路由器上的页面」）', /路由器自己/.test(err(await cgi('xp_set', { op: 'dadd', name: 'x', ip: '192.168.1.1', port: 80 }))));
	ok('网段的广播地址不能加', /不在家里局域网里/.test(err(await cgi('xp_set', { op: 'dadd', name: 'x', ip: '192.168.1.255', port: 80 }))));
	r = await cgi('xp_set', { op: 'dadd', name: 'NAS', ip: '192.168.1.20', mac: 'AA:BB:CC:00:00:20', port: 5000, path: '/webman' });
	ok('加 NAS：记 MAC、IP、端口、路径', r.result?.devs?.length === 1 && r.result.devs[0].id === 'd1' && r.result.devs[0].mac === 'aa:bb:cc:00:00:20' && r.result.devs[0].port === 5000 && r.result.devs[0].path === '/webman', JSON.stringify(r.result?.devs));
	ok('同一台同一端口不重复加', /已经加过了/.test(err(await cgi('xp_set', { op: 'dadd', name: 'y', ip: '192.168.1.20', port: 5000 }))));
	r = await cgi('xp_set', { op: 'dadd', name: '摄像头', ip: '10.9.0.7', port: 443, https: true });
	ok('另一个网段（路由器直连的）也能加', r.result?.devs?.length === 2 && r.result.devs[1].id === 'd2' && r.result.devs[1].https === true);
	HUBC.length = 0; try { fs.unlinkSync(PUSH); } catch (e) {}
	r = await cgi('xp_open', { dev: 'd1' });
	const ud = new URL(r.result?.url || 'http://x');
	ok('打开设备：让官网把「-x」切到这台设备的 IP 和端口', HUBC.length === 1 && HUBC[0].b.ip === '192.168.1.20' && HUBC[0].b.port === 5000 && HUBC[0].b.https === false, JSON.stringify(HUBC));
	ok('通行证签的是「IP:端口」，路径是加的时候填的', ud.searchParams.get('p') === '192.168.1.20:5000' && ud.searchParams.get('s') === crypto.createHmac('sha256', 'L'.repeat(80)).update(`${SUB}|192.168.1.20:5000|${NOW + 7200}`).digest('hex') && ud.searchParams.get('to') === '/webman', r.result?.url);
	const pl = fs.existsSync(PUSH) ? fs.readFileSync(PUSH, 'utf8') : '';
	ok('每次打开都推送并记一笔', /^info\|xpage\|在外面打开了「NAS」\|192\.168\.1\.20:5000，2 小时内有效/.test(pl), pl);
	r = await cgi('xp_get');
	ok('记下现在开着哪台', r.result.cur === 5000 && r.result.curip === '192.168.1.20');
	// IP 变了：按 MAC 跟着变（路由器给它固定了新地址）
	fs.writeFileSync(CFG + '/dhcp', "config host\n\toption mac 'aa:bb:cc:00:00:20'\n\toption ip '192.168.1.50'\n");
	HUBC.length = 0;
	r = await cgi('xp_open', { dev: 'd1' });
	ok('设备换了 IP：按 MAC 找到新地址', HUBC[0]?.b.ip === '192.168.1.50' && new URL(r.result.url).searchParams.get('p') === '192.168.1.50:5000', JSON.stringify(HUBC));
	fs.unlinkSync(CFG + '/dhcp');
	ok('没有这台：说原因', /没有这台设备/.test(err(await cgi('xp_open', { dev: 'd9' }))));
	r = await cgi('xp_set', { op: 'ddel', id: 'd2' });
	ok('删掉设备', r.result?.devs?.length === 1 && r.result.devs[0].id === 'd1');
	ok('路由器上的页面和设备分开存：加删设备不影响手动加的端口', (await cgi('xp_set', { op: 'add', name: 'P', port: 9001 })).result.devs.length === 1);
	await cgi('xp_set', { op: 'del', port: 9001 });
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
	srv.close(); fs.rmSync(E, { recursive: true, force: true }); if (!LEASE0) fs.rmSync(LEASE, { force: true }); if (!LK0) fs.rmSync(LKF, { force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

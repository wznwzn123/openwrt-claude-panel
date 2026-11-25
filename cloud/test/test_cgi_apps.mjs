// 6.0 第 83 项（路由器）：应用管理——列出装了哪些插件、什么时候装的（opkg / apk 两种），一键卸载；
// 固件自带的、系统要用的、面板要用的、还被别的插件用着的不让卸；AI 工具卸载也走同一套规则
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_apps.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpapp-')), R = E + '/root';
const TOKEN = 'tok' + 'a'.repeat(30);
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: TOKEN, ckey: 'k'.repeat(40) }));
const mk = (f, s) => { fs.mkdirSync(path.dirname(R + f), { recursive: true }); fs.writeFileSync(R + f, s); };
const now = Math.floor(Date.now() / 1000), DAY = 86400;
// ---- opkg ----
mk('/usr/lib/opkg/status', [
	`Package: base-files\nVersion: 1554\nStatus: install user installed\nArchitecture: aarch64\nInstalled-Time: ${now - 300 * DAY}`,
	`Package: luci-app-openclash\nVersion: 0.46.050\nDepends: luci-base, coreutils-nohup, ruby\nStatus: install user installed\nArchitecture: all\nInstalled-Time: ${now - 30 * DAY}`,
	`Package: ruby\nVersion: 3.3\nStatus: install ok installed\nAuto-Installed: yes\nInstalled-Time: ${now - 30 * DAY}`,
	`Package: coreutils-nohup\nVersion: 9.3\nStatus: install ok installed\nAuto-Installed: yes\nInstalled-Time: ${now - 30 * DAY}`,
	`Package: luci-app-wol\nVersion: 1\nStatus: install user installed\nInstalled-Time: ${now - 2 * DAY}`,
	`Package: luci-app-ddns\nVersion: 2\nDepends: ddns-scripts\nStatus: install user installed\nInstalled-Time: ${now - 1 * DAY}`,
	`Package: ddns-scripts\nVersion: 2\nStatus: install user installed\nInstalled-Time: ${now - 1 * DAY}`,
	`Package: cloudflared\nVersion: 2024.1\nStatus: install user installed\nInstalled-Time: ${now - 10 * DAY}`,
	`Package: luci-app-firewall\nVersion: 1\nStatus: install user installed\nInstalled-Time: ${now - 300 * DAY}`,
	`Package: luci-base\nVersion: 1\nStatus: install user installed\nInstalled-Time: ${now - 300 * DAY}`,
].join('\n\n') + '\n');
mk('/usr/lib/opkg/info/luci-app-openclash.control', 'Package: luci-app-openclash\nInstalled-Size: 3145728\nDescription: A Clash Client For OpenWrt\n');
mk('/usr/lib/opkg/info/luci-app-wol.control', 'Package: luci-app-wol\nInstalled-Size: 20480\nDescription: Wake on LAN\n');
for (const n of ['base-files', 'luci-app-firewall', 'luci-base']) mk('/rom/usr/lib/opkg/info/' + n + '.control', 'Package: ' + n + '\n');
const RUN = E + '/run.log';
const cgi = (method, params, xenv = {}) => new Promise((z) => {
	const msg = { jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' }, body = JSON.stringify(msg);
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/' + TOKEN, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_APPS_ROOT: R, CMCP_APPS_PM: 'opkg', CMCP_APPS_RUN: RUN, ...xenv } });
	let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const ai = (name, args, xenv = {}) => new Promise((z) => {
	const msg = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, body = JSON.stringify(msg);
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/' + 'k'.repeat(40), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_APPS_ROOT: R, CMCP_APPS_PM: 'opkg', ...xenv } });
	let out = ''; p.stdout.on('data', (d) => { out += d; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const err = (r) => (r && r.error ? r.error.message : '');
const rd = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };

let r = await cgi('app_list');
const L = r.result?.list || [], by = (n) => L.find((x) => x.name === n);
ok('opkg：列出全部装着的包', r.result?.pm === 'opkg' && L.length === 10, JSON.stringify(r).slice(0, 300));
ok('按安装时间排，最近装的在前面', L[0].at >= L[1].at && L[1].at >= L[2].at && ['luci-app-ddns', 'ddns-scripts'].includes(L[0].name));
ok('插件名字换成好认的（OpenClash、网络唤醒、动态 DNS）', by('luci-app-openclash').title === 'OpenClash' && by('luci-app-wol').title === '网络唤醒' && by('luci-app-ddns').title === '动态 DNS');
ok('大小、说明从 control 里读', by('luci-app-openclash').size === 3145728 && /Clash Client/.test(by('luci-app-openclash').desc));
ok('标出插件、依赖（自动装的）、固件自带', by('luci-app-openclash').plugin && by('ruby').auto && by('base-files').rom && !by('luci-app-wol').rom);
ok('最近 7 天装的标「新装」，30 天前的不标', by('luci-app-wol').recent && !by('luci-app-openclash').recent && !by('base-files').recent);
ok('谁要用它：ruby 被 OpenClash 用着', by('ruby').users.includes('luci-app-openclash'));
ok('系统要用的、固件自带的、面板隧道要用的标着不能卸和原因', /系统组件/.test(by('luci-base').no) && /固件自带/.test(by('luci-app-firewall').no) && by('luci-app-wol').no === null);
ok('会影响上网的标出来（OpenClash、动态 DNS）', by('luci-app-openclash').net && by('luci-app-ddns').net && !by('luci-app-wol').net);
ok('看得到闪存还剩多少', 'free' in r.result);
// 卸载
r = await cgi('app_remove', { name: 'luci-app-wol' });
ok('没确认：不卸', /需要确认/.test(err(r)));
r = await cgi('app_remove', { name: 'luci-app-wol', confirm: 'REMOVE' });
ok('卸载：opkg remove --autoremove，回来好认的名字', r.result?.ok && r.result.title === '网络唤醒' && rd(RUN).trim() === "opkg remove --autoremove 'luci-app-wol'", JSON.stringify(r) + rd(RUN));
fs.rmSync(RUN, { force: true });
r = await cgi('app_remove', { name: 'base-files', confirm: 'REMOVE' });
ok('系统组件：不让卸，说原因', /不能卸：系统组件/.test(err(r)) && !rd(RUN));
r = await cgi('app_remove', { name: 'luci-app-firewall', confirm: 'REMOVE' });
ok('固件自带的：不让卸', /固件自带/.test(err(r)));
fs.writeFileSync(E + '/tunnel_token', 'x');
r = await cgi('app_remove', { name: 'cloudflared', confirm: 'REMOVE' });
ok('面板隧道要用的 cloudflared：不让卸', /远程访问/.test(err(r)));
fs.writeFileSync(E + '/local', '');
r = await cgi('app_remove', { name: 'cloudflared', confirm: 'REMOVE' });
ok('本地版不用隧道：cloudflared 能卸', r.result?.ok === true, JSON.stringify(r));
fs.rmSync(E + '/local'); fs.rmSync(RUN, { force: true });
r = await cgi('app_remove', { name: 'ddns-scripts', confirm: 'REMOVE' });
ok('还被别的插件用着：说先卸谁', /被动态 DNS使用，先卸它们/.test(err(r)) && !rd(RUN), err(r));
r = await cgi('app_remove', { name: 'nope-pkg', confirm: 'REMOVE' });
ok('没装的：说清楚', /没有装/.test(err(r)));
r = await cgi('app_remove', { name: 'a; rm -rf /', confirm: 'REMOVE' });
ok('包名带奇怪字符：不认', /包名不对/.test(err(r)));
r = await cgi('app_remove', { name: 'luci-app-openclash', confirm: 'REMOVE' }, { CMCP_APPS_RC: '1', CMCP_APPS_OUT: 'Collected errors: * remove failed' });
ok('卸载失败：把出错信息带回来', /卸载没成功：.*remove failed/.test(err(r)));
// AI 工具
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: TOKEN, ckey: 'k'.repeat(40), ai_mode: 'full' })); // AI 完全放开：不用手机确认，直接走到卸载
r = await ai('packages', { action: 'remove', name: 'luci-app-firewall' });
ok('AI 卸载固件自带的：同样不让', /固件自带/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 200));
// ---- apk ----
mk('/lib/apk/db/installed', [
	'C:Q1x\nP:luci-app-adguardhome\nV:1.8-r1\nA:all\nS:1000\nI:204800\nT:AdGuard Home\nD:luci-base adguardhome\n',
	'C:Q1y\nP:adguardhome\nV:0.107\nI:31457280\nT:Network-wide ads blocker\nD:so:libc.so\n',
	'C:Q1z\nP:busybox\nV:1.36\nI:500000\nT:core\n',
	'C:Q1w\nP:luci-app-ttyd\nV:1\nI:10000\nT:ttyd\n',
].join('\n'));
mk('/etc/apk/world', 'luci-app-adguardhome\nbusybox\nluci-app-ttyd\n');
mk('/rom/etc/apk/world', 'busybox\n');
mk('/lib/apk/packages/luci-app-adguardhome.list', '/usr/x\n'); fs.utimesSync(R + '/lib/apk/packages/luci-app-adguardhome.list', new Date((now - 3 * DAY) * 1000), new Date((now - 3 * DAY) * 1000));
mk('/rom/lib/apk/packages/busybox.list', '/bin/busybox\n');
try { fs.rmSync(E + '/apps_seen.json'); } catch (e) {}
r = await cgi('app_list', {}, { CMCP_APPS_PM: 'apk' });
const A = r.result?.list || [], ba = (n) => A.find((x) => x.name === n);
ok('apk：列出全部，名字、版本、大小、说明', r.result?.pm === 'apk' && A.length === 4 && ba('luci-app-adguardhome').title === 'AdGuard Home' && ba('adguardhome').size === 31457280, JSON.stringify(r).slice(0, 300));
ok('apk：安装时间用 .list 文件的时间（3 天前，算新装）', Math.abs(ba('luci-app-adguardhome').at - (now - 3 * DAY)) < 5 && ba('luci-app-adguardhome').recent);
ok('apk：不在 world 里的算依赖；固件自带的认得出', ba('adguardhome').auto && ba('busybox').rom && !ba('luci-app-ttyd').auto);
ok('apk：没有 .list 的，第一次看到不知道什么时候装的（不乱标新装）', ba('luci-app-ttyd').at === null && !ba('luci-app-ttyd').recent && fs.existsSync(E + '/apps_seen.json'));
r = await cgi('app_remove', { name: 'luci-app-ttyd', confirm: 'REMOVE' }, { CMCP_APPS_PM: 'apk' });
ok('apk 卸载：apk del', r.result?.ok && rd(RUN).trim() === "apk del 'luci-app-ttyd'", rd(RUN));
fs.rmSync(E, { recursive: true, force: true });
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

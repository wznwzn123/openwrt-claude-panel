// 6.0 第 19 项（路由器）：软件中心——只列固件自带软件源（distfeeds）里的；默认列插件，能搜；标出已装、可更新；
// 装之前算空间（连没装的依赖）；后台跑，同时只跑一个；系统组件不在这里更新；子账号不能装（opkg / apk）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_store.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpst-')), R = E + '/root', SD = E + '/store', RUN = E + '/run.log';
const TOKEN = 'tok' + 'a'.repeat(30);
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: TOKEN, ckey: 'k'.repeat(40) }));
const mk = (f, s) => { fs.mkdirSync(path.dirname(R + f), { recursive: true }); fs.writeFileSync(R + f, s); };
mk('/usr/lib/opkg/status', [
	'Package: base-files\nVersion: 1554\nStatus: install user installed\nInstalled-Time: 1700000000',
	'Package: luci-app-ddns\nVersion: 2.8-r1\nStatus: install user installed\nInstalled-Time: 1700000000',
	'Package: dnsmasq-full\nVersion: 2.89-1\nStatus: install user installed\nInstalled-Time: 1700000000',
].join('\n\n') + '\n');
mk('/etc/opkg/distfeeds.conf', 'src/gz openwrt_core https://downloads.openwrt.org/releases/23.05.3/targets/x/packages\nsrc/gz openwrt_luci https://downloads.openwrt.org/releases/23.05.3/packages/x/luci\n# src/gz old https://x\n');
mk('/etc/opkg/customfeeds.conf', 'src/gz kenzo https://op.dllkids.xyz/packages\n');
mk('/var/opkg-lists/openwrt_luci', [
	'Package: luci-app-wol\nVersion: 1.0-r1\nDepends: libc, etherwake\nSize: 10240\nInstalled-Size: 30720\nDescription: Wake on LAN',
	'Package: luci-app-ddns\nVersion: 2.9-r1\nSize: 20480\nDescription: Dynamic DNS',
	'Package: luci-app-adblock\nVersion: 4.1-r1\nDepends: adblock\nSize: 30000\nInstalled-Size: 9000000\nDescription: AdBlock',
	'Package: luci-i18n-wol-zh-cn\nVersion: 1\nSize: 1000',
].join('\n\n') + '\n');
mk('/var/opkg-lists/openwrt_core', [
	'Package: etherwake\nVersion: 1.09-r1\nSize: 8000\nInstalled-Size: 20480\nDescription: Send WoL packets',
	'Package: adblock\nVersion: 4.1\nSize: 50000\nInstalled-Size: 9000000\nDescription: blocker',
	'Package: dnsmasq-full\nVersion: 2.90-1\nSize: 200000\nDescription: dns',
	'Package: base-files\nVersion: 1600\nSize: 1000\nDescription: base',
].join('\n\n') + '\n');
mk('/var/opkg-lists/kenzo', 'Package: luci-app-evil\nVersion: 1\nSize: 1\nDescription: from a custom feed\n');
const cgi = (method, params, xenv = {}) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/' + TOKEN, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_APPS_ROOT: R, CMCP_APPS_PM: 'opkg', CMCP_STORE_DIR: SD, CMCP_STORE_RUN: RUN, CMCP_STORE_FREE: '20480', ...xenv } });
	let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const ran = () => (fs.existsSync(RUN) ? fs.readFileSync(RUN, 'utf8').trim() : '');
const finish = (rc) => fs.writeFileSync(SD + '/rc', String(rc));

let r = await cgi('store_list');
let L = r.result?.list || [];
ok('默认只列插件：网络唤醒、DDNS、AdBlock（不列语言包、不列自己加的软件源里的）', L.length === 3 && L.map((x) => x.name).join() === 'luci-app-adblock,luci-app-ddns,luci-app-wol' && !JSON.stringify(r).includes('luci-app-evil'), JSON.stringify(L.map((x) => x.name)));
ok('中文名、版本、已装、可更新', L.find((x) => x.name === 'luci-app-wol').title === '网络唤醒' && L.find((x) => x.name === 'luci-app-ddns').installed === '2.8-r1' && L.find((x) => x.name === 'luci-app-ddns').upd === true && r.result.upd === 1, JSON.stringify(L).slice(0, 300));
ok('软件源：只有固件自带的两个；多久没更新；剩多少空间', JSON.stringify(r.result.feeds) === '["openwrt_core","openwrt_luci"]' && typeof r.result.age === 'number' && r.result.free === 20480);
r = await cgi('store_list', { q: 'dns' });
ok('搜索：插件以外的也搜（dnsmasq-full），系统组件不标可更新', r.result.list.some((x) => x.name === 'dnsmasq-full' && x.installed && x.upd === false) && r.result.list.some((x) => x.name === 'luci-app-ddns'), JSON.stringify(r.result.list.map((x) => [x.name, x.upd])));
r = await cgi('store_list', { q: 'Wake' });
ok('搜说明里的字', r.result.list.length >= 1 && r.result.list[0].name === 'luci-app-wol');
// 安装
r = await cgi('store_install', { name: 'luci-app-evil' });
ok('自己加的软件源里的：不装', /固件自带的软件源里没有/.test(r.error?.message || ''), JSON.stringify(r));
r = await cgi('store_install', { name: 'luci-app-ddns' });
ok('已经装了的：不重复装', /已经装了/.test(r.error?.message || ''));
r = await cgi('store_install', { name: 'luci-app-adblock' }, { CMCP_STORE_FREE: '15000' });
ok('空间不够（连依赖 adblock 一起算）：说要多少、剩多少', /空间不够：要 17\.2 MB，剩 14\.6 MB/.test(r.error?.message || '') && !fs.existsSync(RUN), JSON.stringify(r));
r = await cgi('store_install', { name: 'a; reboot' });
ok('包名里夹命令：拒绝', /包名不对/.test(r.error?.message || ''));
r = await cgi('store_install', { name: 'luci-app-wol' });
ok('装：后台跑 opkg install，算上没装的依赖（etherwake）', r.result?.started === true && ran() === "opkg install 'luci-app-wol'" && r.result.need.n === 2 && r.result.need.kb === 50, JSON.stringify(r) + ' / ' + ran());
r = await cgi('store_state');
ok('进度：正在安装', r.result?.state?.st === 'run' && /安装「网络唤醒」/.test(r.result.state.what));
r = await cgi('store_install', { name: 'luci-app-ddns' });
r = await cgi('store_refresh');
ok('正在装的时候：不能再开一个', /正在安装「网络唤醒」，等它做完/.test(r.error?.message || ''), JSON.stringify(r));
finish(0);
r = await cgi('store_state');
ok('做完：成功', r.result?.state?.st === 'ok');
// 更新
r = await cgi('store_upgrade', { name: 'dnsmasq-full' });
ok('系统组件：不在这里更新', /系统组件：升级固件来更新/.test(r.error?.message || ''));
r = await cgi('store_upgrade', { name: 'luci-app-ddns' });
ok('更新插件：opkg upgrade', r.result?.started && ran() === "opkg upgrade 'luci-app-ddns'", ran());
finish(1);
r = await cgi('store_state');
ok('失败：状态是失败', r.result?.state?.st === 'fail');
r = await cgi('store_refresh');
ok('更新软件源：opkg update', r.result?.started && ran() === 'opkg update');
finish(0);
// 子账号
fs.writeFileSync(E + '/sub.json', '');
// apk
fs.rmSync(R + '/usr/lib/opkg', { recursive: true, force: true });
mk('/lib/apk/db/installed', 'P:luci-app-ddns\nV:2.8-r1\n\nP:base-files\nV:1600-r1\n');
mk('/etc/apk/world', 'luci-app-ddns\n');
mk('/etc/apk/repositories.d/distfeeds.list', 'https://downloads.openwrt.org/snapshots/packages/x/luci/packages.adb\n');
fs.writeFileSync(E + '/apklist', 'luci-app-ddns-2.9-r1 noarch {luci-app-ddns} (GPL)\nluci-app-wol-1.0-r1 noarch {luci-app-wol} (GPL)\nbase-files-1700-r1 x86 {base-files} (GPL)\n');
r = await cgi('store_list', {}, { CMCP_APPS_PM: 'apk', CMCP_STORE_APKLIST: E + '/apklist' });
ok('apk：列出插件、已装、可更新', r.result && r.result.pm === 'apk' && r.result.list.length === 2 && r.result.list.find((x) => x.name === 'luci-app-ddns').upd === true, JSON.stringify(r).slice(0, 300));
r = await cgi('store_install', { name: 'luci-app-wol' }, { CMCP_APPS_PM: 'apk', CMCP_STORE_APKLIST: E + '/apklist' });
ok('apk：只从固件自带的软件源装', r.result?.started && /^apk --repositories-file '.*\/etc\/apk\/repositories\.d\/distfeeds\.list' add 'luci-app-wol'$/.test(ran()), ran());
finish(0);
fs.rmSync(E, { recursive: true, force: true });
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

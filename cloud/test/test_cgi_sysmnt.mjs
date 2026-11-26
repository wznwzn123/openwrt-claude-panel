// 6.0 第 30、34 项（路由器）：恢复出厂、固件升级——只能在家里做（局域网直接打开，或者手机外网地址就是这台路由器的）、
// 必须 30 分钟内备份过、要输路由器后台密码；固件分块传到内存，传完先检查型号；保留设置时面板跟着留下
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_sysmnt.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpsm-')), BIN = E + '/bin', RUN = E + '/run.log', ROOT = E + '/root', FW = E + '/fw.bin';
fs.mkdirSync(BIN); fs.mkdirSync(E + '/dl'); fs.mkdirSync(ROOT);
const TOKEN = 'tok' + 's'.repeat(30);
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: TOKEN, ckey: 'c'.repeat(40) }));
fs.writeFileSync(BIN + '/ubus', `#!/bin/sh
case "$1 $2" in
"list session") echo session ;;
"call session") case "$3" in
	login) case "$4" in *'"right-pw"'*) echo '{"ubus_rpc_session":"0123456789abcdef0123456789abcdef"}' ;; *) exit 6 ;; esac ;;
	destroy) exit 0 ;; esac ;;
esac
`, { mode: 0o755 });
fs.writeFileSync(BIN + '/cmcp-notify', `#!/bin/sh\necho "$*" >> ${E}/notified\n`, { mode: 0o755 });
// 假的 sysupgrade：-T 检查（文件里有 BADBOARD 就说型号不对）、-b 打包设置
fs.writeFileSync(BIN + '/sysupgrade', `#!/bin/sh
case "$1" in
-T) grep -q BADBOARD "$2" && { echo "Device xiaomi,ax3000t not supported by this image"; exit 1; }; exit 0 ;;
-b) echo backup > "$2"; exit 0 ;;
esac
exit 0
`, { mode: 0o755 });
fs.writeFileSync(BIN + '/firstboot', '#!/bin/sh\nexit 0\n', { mode: 0o755 });
fs.writeFileSync(E + '/shadow', 'root:$1$ab$cdefghijklmnopqrstuvw:19000:0:99999:7:::\n');
const BASE = { PATH: BIN + ':' + process.env.PATH, CMCP_SHADOW: E + '/shadow', CMCP_SBIN: BIN, CMCP_SM_RUN: RUN, CMCP_SM_BIN: BIN, CMCP_FW_F: FW, CMCP_SM_MEM: '200', CMCP_SM_ROOT: ROOT, CMCP_SM_WAN4: '36.1.2.3', CMCP_SM_PUB4: '', CMCP_SM_PFX6: '2408:8207:1234:5600::/56' };
// 经过隧道：REMOTE_ADDR 是本机，Cloudflare 带上手机的外网地址
const AWAY = { REMOTE_ADDR: '127.0.0.1', HTTP_CF_CONNECTING_IP: '8.8.4.4' };
const HOME4 = { REMOTE_ADDR: '127.0.0.1', HTTP_CF_CONNECTING_IP: '36.1.2.3' };
const HOME6 = { REMOTE_ADDR: '127.0.0.1', HTTP_CF_CONNECTING_IP: '2408:8207:1234:5678:abcd::9' };
let env = HOME4;
const cgi = (method, params, xenv = env) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, ...BASE, ...xenv, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/' + TOKEN, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)) } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const err = (r) => r.error?.message || '';
const runs = () => (fs.existsSync(RUN) ? fs.readFileSync(RUN, 'utf8') : '');
try {
	let r = await cgi('sysmnt_get', {}, AWAY);
	ok('在外面：home 为空', r.result && r.result.home === null && r.result.owner === true && r.result.reset === true && r.result.up === true, JSON.stringify(r).slice(0, 300));
	ok('在外面：恢复出厂被拒「要连家里 Wi-Fi」', /要连家里 Wi-Fi/.test(err(await cgi('factory_reset', { confirm: 'RESET', pw: 'right-pw' }, AWAY))));
	ok('在外面：上传固件被拒', /要连家里 Wi-Fi/.test(err(await cgi('fw_up', { op: 'begin', size: 5e6 }, AWAY))));
	ok('伪造的 Cloudflare 头（不是从本机隧道进来的）不算在家', (await cgi('sysmnt_get', {}, { REMOTE_ADDR: '203.0.113.9', HTTP_CF_CONNECTING_IP: '36.1.2.3' })).result?.home === null);
	ok('IPv4：手机外网地址就是路由器的 → 在家', (await cgi('sysmnt_get', {}, HOME4)).result?.home === 'wan');
	ok('IPv6：手机地址在路由器分到的前缀里 → 在家', (await cgi('sysmnt_get', {}, HOME6)).result?.home === 'wan');
	ok('IPv6：别的前缀不算', (await cgi('sysmnt_get', {}, { REMOTE_ADDR: '127.0.0.1', HTTP_CF_CONNECTING_IP: '2408:8207:1234:5700::9' })).result?.home === null);
	ok('宽带口是内网地址（光猫拨号）：用外网看到的地址比', (await cgi('sysmnt_get', {}, { ...HOME4, CMCP_SM_WAN4: '192.168.1.5', CMCP_SM_PUB4: '36.1.2.3' })).result?.home === 'wan');
	ok('局域网直接打开 → 在家', (await cgi('sysmnt_get', {}, { REMOTE_ADDR: '192.168.6.23', HTTP_HOST: '192.168.6.1:906', CONTENT_TYPE: 'application/json' })).result?.home === 'lan');
	// 恢复出厂
	ok('恢复出厂要确认', /需要确认/.test(err(await cgi('factory_reset', { pw: 'right-pw' }))));
	ok('没备份不让恢复', /先备份一次/.test(err(await cgi('factory_reset', { confirm: 'RESET', pw: 'right-pw' }))));
	fs.writeFileSync(E + '/backup_last', String(Math.floor(Date.now() / 1000) - 3600));
	ok('一小时前的备份不算', /先备份一次/.test(err(await cgi('factory_reset', { confirm: 'RESET', pw: 'right-pw' }))));
	r = await cgi('sys_lbk');
	ok('没有云端：打包一份设置给手机下载', r.result?.url && /backup-.*\.tar\.gz/.test(JSON.stringify(r.result)), JSON.stringify(r).slice(0, 300));
	ok('密码错不让恢复', /密码/.test(err(await cgi('factory_reset', { confirm: 'RESET', pw: 'wrong' }))));
	ok('还没执行', !/firstboot/.test(runs()));
	r = await cgi('factory_reset', { confirm: 'RESET', pw: 'right-pw' });
	ok('恢复出厂：推送，然后 firstboot -y && reboot', r.result?.ok && /firstboot -y && reboot/.test(runs()) && /恢复出厂/.test(fs.readFileSync(E + '/notified', 'utf8')), runs());
	// 固件上传
	fs.writeFileSync(RUN, '');
	ok('固件太小', /文件大小不对/.test(err(await cgi('fw_up', { op: 'begin', size: 1000 }))));
	ok('内存不够', /内存不够/.test(err(await cgi('fw_up', { op: 'begin', size: 180 * 1048576 }))));
	const img = Buffer.alloc(3 * 1048576 + 123, 7);
	r = await cgi('fw_up', { op: 'begin', size: img.length, name: 'openwrt-24.10 sysupgrade.bin' });
	ok('开始上传', r.result?.ok && r.result.got === 0);
	const CH = 1048576; let off = 0, last = null;
	r = await cgi('fw_up', { op: 'chunk', off: 5, data: img.subarray(0, 10).toString('base64') });
	ok('位置对不上：告诉手机从哪接着传', r.result?.ok === false && r.result.got === 0);
	while (off < img.length) { last = (await cgi('fw_up', { op: 'chunk', off, data: img.subarray(off, off + CH).toString('base64') })).result; off += CH; }
	ok('传完：文件一模一样，检查通过，给出 SHA-256', last?.done && last.good === true && fs.readFileSync(FW).equals(img) && /^[0-9a-f]{64}$/.test(last.sha), JSON.stringify(last));
	r = await cgi('sysmnt_get');
	ok('页面能看到传好的固件', r.result?.file?.ok === true && r.result.file.size === img.length && r.result.file.name === 'openwrt-24.10_sysupgrade.bin', JSON.stringify(r.result?.file));
	ok('刷机要密码', /密码/.test(err(await cgi('fw_flash', { pw: 'nope' }))));
	r = await cgi('fw_flash', { pw: 'right-pw' });
	ok('保留设置刷机：sysupgrade 不带 -n，面板文件加进 keep.d，开机补回自启', r.result?.keep === true && new RegExp(`sysupgrade ${FW.replace(/[.]/g, '\\.')}$`, 'm').test(runs()) && /\/etc\/claude-mcp\//.test(fs.readFileSync(ROOT + '/lib/upgrade/keep.d/claude-mcp', 'utf8')) && /claude-mcp enable/.test(fs.readFileSync(ROOT + '/etc/uci-defaults/99-cmcp-keep', 'utf8')), runs());
	fs.writeFileSync(RUN, '');
	r = await cgi('fw_flash', { pw: 'right-pw', keep: false });
	ok('不保留设置：sysupgrade -n', r.result?.keep === false && /sysupgrade -n /.test(runs()), runs());
	// 型号不对
	const bad = Buffer.concat([Buffer.from('BADBOARD'), Buffer.alloc(1048576)]);
	await cgi('fw_up', { op: 'begin', size: bad.length });
	last = (await cgi('fw_up', { op: 'chunk', off: 0, data: bad.toString('base64') })).result;
	ok('型号不对：检查不通过，说清楚', last?.done && last.good === false && /不是这台路由器的型号/.test(last.msg), JSON.stringify(last));
	ok('检查没通过不让刷', /不是这台路由器的型号/.test(err(await cgi('fw_flash', { pw: 'right-pw' }))));
	r = await cgi('fw_up', { op: 'cancel' });
	ok('取消：删掉文件', r.result?.ok && !fs.existsSync(FW));
	// 只有主账号
	const fam = fs.readFileSync('../src/mcp/26-backup.uc', 'utf8');
	ok('只有主账号能用（不在任何权限组里）', !/'(sysmnt_get|factory_reset|fw_up|fw_flash|sys_lbk)'/.test(fam));
	// 没有 sysupgrade / firstboot
	fs.renameSync(BIN + '/sysupgrade', E + '/su.bak'); fs.renameSync(BIN + '/firstboot', E + '/fb.bak');
	r = await cgi('sysmnt_get');
	ok('固件没有这些工具：说原因', r.result?.reset === false && /没有 sysupgrade/.test(r.result.up), JSON.stringify(r.result).slice(0, 200));
} finally {
	fs.rmSync(E, { recursive: true, force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

// 6.0 第 3、4 项：cmcp-guard（登录提醒、公网 IP 变化、温度负载、存储快满、自动拉黑）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_guard.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const mk = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const E = mk('cmcpg-'), T = mk('cmcpgt-'), BIN = mk('cmcpgb-'), R = mk('cmcpgr-');
const LOG = T + '/syslog', NOTES = T + '/notes', NFT = T + '/nft.log';
fs.writeFileSync(LOG, '');
fs.writeFileSync(BIN + '/logread', `#!/bin/sh\ncat ${LOG}\n`, { mode: 0o755 });
fs.writeFileSync(BIN + '/cmcp-notify', `#!/bin/sh\necho "$1|$2|$3|$4" >> ${NOTES}\n`, { mode: 0o755 });
// fw4：nftables（第一次没有我们的表）
fs.writeFileSync(BIN + '/nft', `#!/bin/sh\necho "$*" >> ${NFT}\ncase "$*" in "list tables") exit 0 ;; "list table inet cmcp_ban") [ -f ${T}/tbl ] && exit 0; exit 1 ;; -f*) touch ${T}/tbl ;; esac\nexit 0\n`, { mode: 0o755 });
fs.writeFileSync(BIN + '/ubus', `#!/bin/sh\ncase "$2" in network.interface.wan) cat ${T}/wan4 2>/dev/null ;; network.interface.wan6) cat ${T}/wan6 2>/dev/null ;; esac\n`, { mode: 0o755 });
fs.writeFileSync(BIN + '/df', `#!/bin/sh\ncat ${T}/df\n`, { mode: 0o755 });
fs.writeFileSync(T + '/df', 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/root 4096 4096 0 100% /rom\noverlayfs:/overlay 20000 10000 10000 50% /overlay\n/dev/sda1 1000000 500000 500000 50% /mnt/sda1\n');
fs.mkdirSync(R + '/proc'); fs.mkdirSync(R + '/tmp'); fs.mkdirSync(R + '/sys/class/thermal/thermal_zone0', { recursive: true });
fs.writeFileSync(R + '/proc/loadavg', '0.30 0.20 0.10 1/80 1234\n');
fs.writeFileSync(R + '/proc/cpuinfo', 'processor : 0\nprocessor : 1\n');
fs.writeFileSync(R + '/sys/class/thermal/thermal_zone0/temp', '55000\n');
fs.writeFileSync(R + '/tmp/dhcp.leases', '1999999999 aa:bb:cc:dd:ee:01 192.168.1.23 my-laptop *\n');
const run = (...a) => spawnSync('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/bin/cmcp-guard')) + ' ' + a.map((x) => "'" + x + "'").join(' ')], { env: { ...process.env, CMCP_GUARD_ETC: E, CMCP_GUARD_TMP: T, CMCP_TEST_PATH: BIN, CMCP_GUARD_ROOT: R }, encoding: 'utf8' });
const notes = () => (fs.existsSync(NOTES) ? fs.readFileSync(NOTES, 'utf8') : '');
const log = (...l) => fs.appendFileSync(LOG, l.map((x) => 'Sun Nov 22 09:00:00 2026 authpriv.info ' + x + '\n').join(''));
let seq = 0;
const ssh_fail = (ip) => log(`dropbear[${++seq}]: Bad password attempt for 'root' from ${ip}:5${seq}22`);

// 第一次运行：以前的日志不算（开机后不会把旧事推一遍）
log("dropbear[1]: Password auth succeeded for 'root' from 8.8.8.8:51234");
let r = run();
ok('第一次运行：以前的日志不推送', r.status === 0 && notes() === '', r.stderr + r.stdout);
// 登录提醒
log("dropbear[2]: Password auth succeeded for 'root' from 192.168.1.23:51000", 'luci: accepted login on /admin/status for root from 203.0.113.9', 'luci: accepted login on /admin/status for root from 127.0.0.1');
run();
const n1 = notes();
ok('SSH 登录：推送，写明是家里哪台设备', /\|login\|有人登录了SSH\|来自 my-laptop（192\.168\.1\.23）（家里的设备）/.test(n1), n1);
ok('外网登录后台：推送「外网」，公网地址只显示前半段', /warn\|login\|有人登录了路由器后台（LuCI）\|来自 203\.113\.\*\.\*|warn\|login\|有人登录了路由器后台（LuCI）\|来自 203\.0\.\*\.\*（外网）/.test(n1) && !/203\.0\.113\.9/.test(n1), n1);
ok('面板自己替手机登录（127.0.0.1）：不推送', (n1.match(/有人登录了/g) || []).length === 2);
run();
ok('同一条日志不会推第二次', (notes().match(/有人登录了/g) || []).length === 2);
fs.writeFileSync(E + '/off.loginalert', '');
log("dropbear[3]: Password auth succeeded for 'root' from 192.168.1.24:51001");
run();
ok('关掉「登录提醒」：不推送', (notes().match(/有人登录了/g) || []).length === 2);
fs.rmSync(E + '/off.loginalert');

// 自动拉黑
fs.writeFileSync(NOTES, '');
for (let i = 0; i < 4; i++) ssh_fail('198.51.100.7');
run();
ok('外网地址错 4 次：还不封', !fs.existsSync(NFT) || !/198\.51\.100\.7/.test(fs.readFileSync(NFT, 'utf8')));
ssh_fail('198.51.100.7');
log('luci: failed login on /admin for root from 198.51.100.8');
run();
const nft = fs.readFileSync(NFT, 'utf8');
ok('10 分钟内错到 5 次：建好自己的防火墙表，封 1 小时（3600 秒）', /^-f /m.test(nft) && /add element inet cmcp_ban v4 \{ 198\.51\.100\.7 timeout 3600s \}/.test(nft), nft);
ok('封了就推送，地址只显示前半段，说明到期自动解开、能手动解封', /warn\|ban\|已自动封禁 198\.51\.\*\.\*\|.*到期自动解开.*解封/.test(notes()) && !/198\.51\.100\.7/.test(notes()), notes());
ok('只错 1 次的不封', !/198\.51\.100\.8/.test(nft));
for (let i = 0; i < 6; i++) ssh_fail('192.168.1.50');
for (let i = 0; i < 6; i++) ssh_fail('100.101.102.103');
for (let i = 0; i < 6; i++) log(`luci: failed login on /admin for root from 127.0.0.1`);
run();
const nft2 = fs.readFileSync(NFT, 'utf8');
ok('家里局域网、Tailscale、路由器自己：错再多也不封', !/192\.168\.1\.50|100\.101\.102\.103|127\.0\.0\.1/.test(nft2));
let L = JSON.parse(run('list').stdout);
ok('「自动任务」里能看到封着的地址和到期时间', L.tool === 'nft' && L.ips['198.51.100.7'] && L.ips['198.51.100.7'].until - Date.now() / 1000 > 3500);
r = run('unban', '198.51.100.7');
ok('手动解封：从防火墙删掉，列表里也没了', r.stdout.trim() === 'ok' && /delete element inet cmcp_ban v4 \{ 198\.51\.100\.7 \}/.test(fs.readFileSync(NFT, 'utf8')) && !JSON.parse(run('list').stdout).ips['198.51.100.7']);
ok('解封时地址格式不对：拒绝（不会被拿去执行命令）', run('unban', '1.2.3.4; reboot').status !== 0);
// 再犯翻倍
for (let i = 0; i < 5; i++) ssh_fail('203.0.113.50');
run();
const b = JSON.parse(fs.readFileSync(T + '/cmcp_ban.json', 'utf8'));
b.ips['203.0.113.50'].until = Math.floor(Date.now() / 1000) - 1; fs.writeFileSync(T + '/cmcp_ban.json', JSON.stringify(b));
for (let i = 0; i < 5; i++) ssh_fail('203.0.113.50');
run();
ok('到期后再犯：封的时间翻倍（2 小时）', /203\.0\.113\.50 timeout 7200s/.test(fs.readFileSync(NFT, 'utf8')));
// IPv6
for (let i = 0; i < 5; i++) log(`dropbear[${++seq}]: Bad password attempt for 'root' from 2001:db8::99:4${seq}22`);
run();
ok('IPv6 地址也能封', /add element inet cmcp_ban v6 \{ 2001:db8::99 timeout 3600s \}/.test(fs.readFileSync(NFT, 'utf8')), fs.readFileSync(NFT, 'utf8').split('\n').slice(-4).join(' | '));
// 关掉自动拉黑
fs.writeFileSync(E + '/off.autoban', '');
for (let i = 0; i < 5; i++) ssh_fail('203.0.113.77');
run();
ok('关掉「自动拉黑」：不封', !/203\.0\.113\.77/.test(fs.readFileSync(NFT, 'utf8')));
fs.rmSync(E + '/off.autoban');
// 没有 nftables 也没有 ipset：只提醒、说明原因
fs.writeFileSync(BIN + '/nft', '#!/bin/sh\nexit 1\n', { mode: 0o755 }); fs.writeFileSync(BIN + '/ipset', '#!/bin/sh\nexit 1\n', { mode: 0o755 });
for (let i = 0; i < 5; i++) ssh_fail('203.0.113.88');
run();
ok('防火墙没法封（没有 nftables、ipset）：照样推送，说明原因和怎么办', /有人在试路由器密码：203\.0\.\*\.\*\|.*没法自动封禁.*强密码/.test(notes()), notes());

// 公网 IP 变化（默认关）
fs.writeFileSync(NOTES, '');
fs.writeFileSync(T + '/wan4', '{"ipv4-address":[{"address":"1.2.3.4","mask":24}]}');
run(); fs.writeFileSync(T + '/wan4', '{"ipv4-address":[{"address":"1.2.9.9","mask":24}]}'); run();
ok('公网 IP 变化默认关：不推送', !/ipchange/.test(notes()));
fs.writeFileSync(E + '/on.ipchange', '');
run(); fs.writeFileSync(T + '/wan4', '{"ipv4-address":[{"address":"5.6.7.8","mask":24}]}'); run();
ok('打开后：变了就推送，只显示前半段', /info\|ipchange\|宽带 IPv4 地址变了\|1\.2\.\*\.\* → 5\.6\.\*\.\*/.test(notes()) && !/5\.6\.7\.8/.test(notes()), notes());
run();
ok('没变不推', (notes().match(/ipchange/g) || []).length === 1);
fs.writeFileSync(T + '/wan6', '{"ipv6-prefix":[{"address":"2001:db8:1::","mask":56}]}'); run();
fs.writeFileSync(T + '/wan6', '{"ipv6-prefix":[{"address":"2001:db8:2::","mask":56}]}'); run();
ok('IPv6 前缀变了也推', /IPv6 前缀变了/.test(notes()));

// 温度、负载
fs.writeFileSync(NOTES, '');
fs.writeFileSync(R + '/sys/class/thermal/thermal_zone0/temp', '93000\n'); run();
ok('温度到 90°C 以上：推送，说清楚怎么办', /warn\|health\|路由器温度很高：93°C\|.*通风/.test(notes()), notes());
run();
ok('6 小时内同一类只推一次', (notes().match(/温度很高/g) || []).length === 1);
fs.writeFileSync(R + '/proc/loadavg', '9.50 9.00 8.00 1/80 1234\n');
for (let i = 0; i < 4; i++) run();
ok('负载高不到 5 分钟：不推', !/负载/.test(notes()));
run();
ok('负载连续 5 分钟很高：推送，说明去哪看', /路由器负载一直很高\|.*「进程」/.test(notes()));
fs.writeFileSync(E + '/off.health', ''); fs.writeFileSync(NOTES, '');
fs.writeFileSync(R + '/sys/class/thermal/thermal_zone0/temp', '99000\n');
const S0 = JSON.parse(fs.readFileSync(T + '/cmcp_guard.json', 'utf8')); S0.last.temp = 0; fs.writeFileSync(T + '/cmcp_guard.json', JSON.stringify(S0));
run();
ok('关掉「温度、负载提醒」：不推', notes() === '');

// 存储
fs.writeFileSync(T + '/df', 'Filesystem 1024-blocks Used Available Capacity Mounted on\noverlayfs:/overlay 20000 18800 1200 94% /overlay\n/dev/sda1 1000000 970000 30000 97% /mnt/sda1\n/dev/sdb1 50000 49900 100 99% /mnt/tiny\n');
const S1 = JSON.parse(fs.readFileSync(T + '/cmcp_guard.json', 'utf8')); S1.last.diskchk = 0; fs.writeFileSync(T + '/cmcp_guard.json', JSON.stringify(S1));
run();
ok('闪存剩不到 2 MB：推送，说怎么清理', /diskfull\|存储快满了：闪存只剩 1200 KB/.test(notes()), notes());
ok('挂载的硬盘用了 95% 以上：推送', /存储快满了：\/mnt\/sda1 用了 97%/.test(notes()));
ok('太小的分区（不到 100 MB）不提醒', !/\/mnt\/tiny/.test(notes()));
run();
ok('一天只推一次', (notes().match(/存储快满了/g) || []).length === 2);

// 热补丁换了看门狗（用户 11/27）：看门狗是一直在跑的程序，文件比进程新就重启一次（10 分钟最多一次）；重启不碰网络
{
	const WDF = T + '/cmcp-watchdog', INIT = T + '/wd-init', MARK = T + '/wd-restarted';
	fs.writeFileSync(WDF, '#!/bin/sh\n');
	fs.writeFileSync(INIT, `#!/bin/sh\necho "$1" >> ${MARK}\n`, { mode: 0o755 });
	fs.mkdirSync(R + '/proc/4242', { recursive: true });
	const old = new Date(Date.now() - 3600e3); fs.utimesSync(R + '/proc/4242', old, old);
	const runW = (pid) => spawnSync('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/bin/cmcp-guard'))], { env: { ...process.env, CMCP_GUARD_ETC: E, CMCP_GUARD_TMP: T, CMCP_TEST_PATH: BIN, CMCP_GUARD_ROOT: R, CMCP_GUARD_WD: WDF, CMCP_GUARD_WDINIT: INIT, CMCP_GUARD_WDPID: pid } });
	const marks = () => (fs.existsSync(MARK) ? fs.readFileSync(MARK, 'utf8').trim().split('\n').filter(Boolean) : []);
	runW('4242'); spawnSync('sleep', ['3']);
	ok('[看门狗] 文件比在跑的看门狗新（热补丁换过）：重启一次', marks().length === 1 && marks()[0] === 'restart', marks().join(','));
	runW('4242'); spawnSync('sleep', ['3']);
	ok('[看门狗] 10 分钟内不重复重启', marks().length === 1);
	fs.rmSync(T + '/cmcp_wd_fresh', { force: true }); fs.rmSync(MARK, { force: true });
	const nw = new Date(Date.now() + 60e3); fs.utimesSync(R + '/proc/4242', nw, nw);
	runW('4242'); spawnSync('sleep', ['3']);
	ok('[看门狗] 看门狗是装好以后才启动的（进程比文件新）：不动', marks().length === 0);
	runW('99999'); spawnSync('sleep', ['3']);
	ok('[看门狗] 找不到看门狗进程：不动', marks().length === 0);
}
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

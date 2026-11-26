// 6.0 第 32 项（路由器）：常用服务——文件共享（Samba / ksmbd）、FTP、SSH、指示灯的开关和设置
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_svcsw.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpss-'));
const CFG = D + '/config', R = D + '/root', LOG = D + '/init.log';
for (const d of [CFG, R + '/etc/init.d', R + '/etc/dropbear', R + '/proc', R + '/mnt/sda1/电影', R + '/sys/class/leds/green:lan', R + '/sys/class/leds/blue:wlan']) fs.mkdirSync(d, { recursive: true });
// 假的服务脚本：enable / disable 记在 R/enabled.<名字>，start / restart / stop 记在 R/run.<名字>
const svc = (n) => fs.writeFileSync(`${R}/etc/init.d/${n}`, `#!/bin/sh
echo "${n} $1" >> ${LOG}
case "$1" in
enabled) [ -f ${R}/enabled.${n} ];;
running) [ -f ${R}/run.${n} ];;
enable) touch ${R}/enabled.${n};;
disable) rm -f ${R}/enabled.${n};;
start|restart|reload) touch ${R}/run.${n};;
stop) rm -f ${R}/run.${n};;
esac
`, { mode: 0o755 });
for (const n of ['samba4', 'vsftpd', 'dropbear', 'led']) svc(n);
fs.writeFileSync(`${R}/enabled.dropbear`, ''); fs.writeFileSync(`${R}/run.dropbear`, '');
fs.writeFileSync(R + '/proc/mounts', '/dev/root /rom squashfs ro 0 0\ntmpfs /tmp tmpfs rw 0 0\n/dev/sda1 /mnt/sda1 ext4 rw 0 0\n/dev/sdb1 /mnt/My\\040Disk vfat rw 0 0\n');
for (const [n, t] of [['green:lan', 'none [netdev] timer'], ['blue:wlan', '[none] timer default-on']]) { fs.writeFileSync(`${R}/sys/class/leds/${n}/trigger`, t); fs.writeFileSync(`${R}/sys/class/leds/${n}/brightness`, n === 'blue:wlan' ? '255' : '0'); }
fs.writeFileSync(CFG + '/samba4', "config samba 'samba'\n\toption workgroup 'WORKGROUP'\n\toption interface 'lan'\n\nconfig sambashare 'old'\n\toption name 'share'\n\toption path '/mnt/sda1'\n\toption read_only 'no'\n\toption guest_ok 'yes'\n");
fs.writeFileSync(CFG + '/dropbear', "config dropbear 'main'\n\toption PasswordAuth 'on'\n\toption Port '22'\n");
fs.writeFileSync(CFG + '/firewall', "config zone 'wan'\n\toption name 'wan'\n\toption input 'REJECT'\n\nconfig rule 'ftp'\n\toption src 'wan'\n\toption dest_port '20-21'\n\toption proto 'tcp'\n\toption target 'ACCEPT'\n");
fs.writeFileSync(CFG + '/system', "config system\n\toption hostname 'OpenWrt'\n\nconfig led 'mine'\n\toption sysfs 'green:lan'\n\toption trigger 'netdev'\n");
fs.writeFileSync(D + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
const cgi = (method, params) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: D + '/config.json', PATH_INFO: '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_SS_ROOT: R } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const err = (r) => r.error?.message || '';
const rd = (f) => fs.readFileSync(f, 'utf8');
const log = () => (fs.existsSync(LOG) ? rd(LOG) : '');
try {
	let r = await cgi('svcsw_get'), g = r.result;
	ok('共享：Samba 4，没开，只在局域网，外网连不上，列出已有的共享和插着的硬盘', g?.smb?.kind === 'samba4' && g.smb.on === false && g.smb.lan === true && g.smb.wan === false && g.smb.shares.length === 1 && g.smb.shares[0].path === '/mnt/sda1' && g.smb.shares[0].guest === true && JSON.stringify(g.smb.disks) === '["/mnt/sda1","/mnt/My Disk"]', JSON.stringify(g?.smb));
	ok('FTP：vsftpd 没开；防火墙放行了 20-21，标「外网能连」', g?.ftp?.kind === 'vsftpd' && g.ftp.on === false && g.ftp.wan === true, JSON.stringify(g?.ftp));
	ok('SSH：dropbear 开着，端口 22，密码能登，没限制局域网，没密钥', g?.ssh?.kind === 'dropbear' && g.ssh.on === true && g.ssh.run === true && g.ssh.port === 22 && g.ssh.pw === true && g.ssh.lan === false && g.ssh.keys === 0 && g.ssh.wan === false, JSON.stringify(g?.ssh));
	ok('指示灯：2 个，开着', g?.led?.n === 2 && g.led.on === true, JSON.stringify(g?.led));
	// 共享
	r = await cgi('svcsw_set', { smb: { on: true } });
	ok('开共享：开机自启 + 启动', r.result?.smb?.on === true && r.result.smb.run === true && /samba4 enable/.test(log()) && /samba4 restart/.test(log()));
	ok('新共享：只能 /mnt、/media 下面', /只能共享/.test(err(await cgi('svcsw_set', { smb: { add: { name: 'etc', path: '/etc' } } }))));
	ok('新共享：不能用 .. 跳出去', /只能共享/.test(err(await cgi('svcsw_set', { smb: { add: { name: 'x', path: '/mnt/../etc' } } }))));
	ok('新共享：文件夹要存在', /没有这个文件夹/.test(err(await cgi('svcsw_set', { smb: { add: { name: 'x', path: '/mnt/sdz9' } } }))));
	ok('新共享：名字不能有符号', /名字不对/.test(err(await cgi('svcsw_set', { smb: { add: { name: 'a/b', path: '/mnt/sda1' } } }))));
	ok('新共享：名字不能重复', /已经有叫/.test(err(await cgi('svcsw_set', { smb: { add: { name: 'SHARE', path: '/mnt/sda1' } } }))));
	fs.writeFileSync(LOG, '');
	r = await cgi('svcsw_set', { smb: { add: { name: '电影', path: '/mnt/sda1/电影/', ro: true } } });
	const sh = r.result?.smb?.shares?.find((x) => x.name === '电影');
	ok('新共享：写进配置，只读、不用密码，重新加载', sh && sh.path === '/mnt/sda1/电影' && sh.ro === true && sh.guest === true && /samba4 reload/.test(log()) && /guest_ok 'yes'/.test(rd(CFG + '/samba4')), JSON.stringify(r).slice(0, 300));
	r = await cgi('svcsw_set', { smb: { del: sh?.id } });
	ok('删共享', r.result?.smb?.shares?.length === 1 && !/电影/.test(rd(CFG + '/samba4')));
	ok('删不存在的共享', /没有这个共享/.test(err(await cgi('svcsw_set', { smb: { del: 'nope' } }))));
	r = await cgi('svcsw_set', { smb: { on: false } });
	ok('关共享：停掉 + 不开机自启', r.result?.smb?.on === false && r.result.smb.run === false);
	// FTP
	r = await cgi('svcsw_set', { ftp: { on: true } });
	ok('开 FTP', r.result?.ftp?.on === true && r.result.ftp.run === true);
	r = await cgi('svcsw_set', { ftp: { on: false } });
	ok('关 FTP', r.result?.ftp?.on === false && r.result.ftp.run === false);
	// SSH
	ok('SSH 端口不对', /1–65535/.test(err(await cgi('svcsw_set', { ssh: { port: 70000 } }))));
	ok('SSH 端口不能和网页后台一样', /路由器自己在用/.test(err(await cgi('svcsw_set', { ssh: { port: 80 } }))));
	ok('没密钥不让关密码登录', /先在原版后台/.test(err(await cgi('svcsw_set', { ssh: { pw: false } }))));
	fs.writeFileSync(LOG, '');
	r = await cgi('svcsw_set', { ssh: { port: 2222, lan: true } });
	ok('SSH：改端口、只允许局域网，重启 dropbear', r.result?.ssh?.port === 2222 && r.result.ssh.lan === true && /Interface 'lan'/.test(rd(CFG + '/dropbear')) && /dropbear restart/.test(log()), rd(CFG + '/dropbear'));
	fs.writeFileSync(R + '/etc/dropbear/authorized_keys', 'ssh-ed25519 AAAA me@phone\n');
	r = await cgi('svcsw_set', { ssh: { pw: false } });
	ok('有密钥：能关密码登录', r.result?.ssh?.pw === false && r.result.ssh.keys === 1 && /RootPasswordAuth 'off'/.test(rd(CFG + '/dropbear')));
	r = await cgi('svcsw_set', { ssh: { on: false } });
	ok('关 SSH：写 enable 0，停掉', r.result?.ssh?.on === false && /enable '0'/.test(rd(CFG + '/dropbear')) && /dropbear stop/.test(log()));
	r = await cgi('svcsw_set', { ssh: { on: true } });
	ok('开 SSH', r.result?.ssh?.on === true && r.result.ssh.run === true);
	// 指示灯
	r = await cgi('svcsw_set', { led: { on: false } });
	ok('关指示灯：全部灭、写进配置（重启后也灭），原来的灯配置不动', r.result?.led?.on === false && rd(`${R}/sys/class/leds/blue:wlan/brightness`) === '0' && rd(`${R}/sys/class/leds/green:lan/trigger`) === 'none' && /cmcp_led_1/.test(rd(CFG + '/system')) && /config led 'mine'/.test(rd(CFG + '/system')), rd(CFG + '/system'));
	await cgi('svcsw_set', { led: { on: false } });
	fs.writeFileSync(LOG, '');
	r = await cgi('svcsw_set', { led: { on: true } });
	ok('开指示灯：删掉自己写的、还原原来的状态、重新应用灯配置', r.result?.led?.on === true && !/cmcp_led/.test(rd(CFG + '/system')) && /config led 'mine'/.test(rd(CFG + '/system')) && rd(`${R}/sys/class/leds/green:lan/trigger`) === 'netdev' && rd(`${R}/sys/class/leds/blue:wlan/brightness`) === '255' && /led restart/.test(log()), rd(`${R}/sys/class/leds/blue:wlan/brightness`));
	// 没装的
	for (const n of ['samba4', 'vsftpd']) fs.renameSync(`${R}/etc/init.d/${n}`, `${D}/${n}.bak`);
	fs.rmSync(`${R}/sys/class/leds`, { recursive: true });
	r = await cgi('svcsw_get');
	ok('没装共享、FTP：kind 为空；没有灯：0 个', r.result?.smb?.kind === null && r.result.ftp.kind === null && r.result.led.n === 0, JSON.stringify(r).slice(0, 300));
	ok('没装还要开：说原因', /没装文件共享/.test(err(await cgi('svcsw_set', { smb: { on: true } }))) && /没装 FTP/.test(err(await cgi('svcsw_set', { ftp: { on: true } }))) && /没有能控制的指示灯/.test(err(await cgi('svcsw_set', { led: { on: false } }))));
	// ksmbd
	svc('ksmbd'); fs.writeFileSync(CFG + '/ksmbd', "config globals\n\toption interface 'lan wan'\n\nconfig share\n\toption name 'k'\n\toption path '/mnt/sda1'\n\toption guest_ok 'no'\n");
	r = await cgi('svcsw_get');
	ok('ksmbd 也认；接口带了 wan 不算只在局域网', r.result?.smb?.kind === 'ksmbd' && r.result.smb.lan === false && r.result.smb.shares[0].guest === false, JSON.stringify(r.result?.smb));
	// 家人（只管自己设备 / 有其他权限）不能用：方法不在任何权限组里
	const fam = fs.readFileSync('../src/mcp/26-backup.uc', 'utf8');
	ok('只有主账号能用（不在任何权限组里）', !/'svcsw_(get|set)'/.test(fam));
} finally {
	fs.rmSync(D, { recursive: true, force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

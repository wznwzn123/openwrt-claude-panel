// 6.0 第 31、35 项（路由器）：定时重启、定时关 Wi-Fi（写进计划任务，只动自己的行）、手动关机；cmcp-sched 脚本（刚开机不重启、在中继上网不关 Wi-Fi）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_sched.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, execFileSync } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpsc-'));
const CFG = D + '/config', SB = D + '/sbin', RUN = D + '/run.log', CRON = D + '/root', NOTE = D + '/note.log';
for (const d of [CFG, SB]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(SB + '/cmcp-notify', `#!/bin/sh\necho "$@" >> ${NOTE}\n`); fs.chmodSync(SB + '/cmcp-notify', 0o755);
fs.writeFileSync(CFG + '/wireless', "config wifi-device 'radio0'\n\toption band '2g'\n\nconfig wifi-iface 'ap'\n\toption device 'radio0'\n\toption mode 'ap'\n");
const CR0 = '0 9 * * * /usr/sbin/cmcp-daily >/dev/null 2>&1\n5 1 * * * /root/my-own-job.sh\n';
fs.writeFileSync(CRON, CR0);
fs.writeFileSync(D + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30), uci_dir: CFG }));
const cgi = (method, params) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: D + '/config.json', PATH_INFO: '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_SBIN: SB, CMCP_CRONTAB: CRON, CMCP_NG_RUN: RUN } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const cron = () => fs.readFileSync(CRON, 'utf8');
const runs = () => (fs.existsSync(RUN) ? fs.readFileSync(RUN, 'utf8') : '');
const err = (r) => r.error?.message || '';
try {
	let r = await cgi('sched_get');
	ok('默认：都关着，每天 04:00 重启、23:30 关 07:00 开', r.result?.reboot?.on === false && r.result.reboot.at === '04:00' && r.result.wifi.off === '23:30' && r.result.wifi.on_at === '07:00' && r.result.sta === false && r.result.owner === true, JSON.stringify(r));
	ok('时间不对', /时间不对/.test(err(await cgi('sched_set', { reboot: { on: true, days: [1], at: '25:00' } }))));
	ok('没选天', /至少选一天/.test(err(await cgi('sched_set', { reboot: { on: true, days: [], at: '04:00' } }))));
	ok('关和开同一时间', /同一个时间/.test(err(await cgi('sched_set', { wifi: { on: true, days: [1], off: '07:00', on_at: '07:00' } }))));
	r = await cgi('sched_set', { reboot: { on: true, days: [1, 3, 5, 3], at: '04:30' } });
	ok('定时重启：写进计划任务（周一、三、五 4:30），别的任务原样', /^30 4 \* \* 1,3,5 .*\/cmcp-sched reboot # cmcp-sched$/m.test(cron()) && cron().includes('/root/my-own-job.sh') && cron().includes('cmcp-daily') && r.result.reboot.on, cron());
	ok('重启计划任务服务', /cron restart/.test(runs()));
	r = await cgi('sched_set', { wifi: { on: true, days: [0, 1, 2, 3, 4, 5, 6], off: '23:30', on_at: '07:00' } });
	ok('定时关 Wi-Fi：每天 23:30 关，每天 07:00 开；重启那条还在', /^30 23 \* \* \* .*cmcp-sched wifioff # cmcp-sched$/m.test(cron()) && /^0 7 \* \* \* .*cmcp-sched wifion # cmcp-sched$/m.test(cron()) && /cmcp-sched reboot/.test(cron()), cron());
	r = await cgi('sched_set', { reboot: { on: false } });
	ok('关掉定时重启：只删那一条', !/cmcp-sched reboot/.test(cron()) && /wifioff/.test(cron()) && cron().includes('my-own-job'));
	await cgi('sched_set', { wifi: { on: false } });
	ok('都关掉：只剩原来的', cron() === CR0, cron());
	ok('关机要确认', /需要确认/.test(err(await cgi('poweroff', {}))));
	r = await cgi('poweroff', { confirm: 'OFF' }); await sleep(800);
	ok('关机：推送「要拔插电源才能开」，然后关机', r.result?.ok && /poweroff/.test(runs()) && /拔插电源/.test(fs.readFileSync(NOTE, 'utf8')));
	// 脚本
	const sc = (arg, env = {}) => { try { execFileSync('sh', [path.resolve('../src/bin/cmcp-sched'), arg], { env: { ...process.env, CMCP_SBIN: SB, CMCP_SCHED_RUN: RUN, CMCP_UCI_DIR: CFG, ...env } }); } catch (e) {} };
	fs.rmSync(RUN, { force: true });
	sc('reboot', { CMCP_UPTIME: '300' });
	ok('脚本：刚开机 5 分钟不重启', !/reboot/.test(runs()));
	sc('reboot', { CMCP_UPTIME: '86400' });
	ok('脚本：开机一天了，推送后重启', /^reboot$/m.test(runs()) && /按计划重启/.test(fs.readFileSync(NOTE, 'utf8')));
	sc('wifioff'); sc('wifion');
	ok('脚本：关 Wi-Fi、开 Wi-Fi', /wifi down/.test(runs()) && /wifi up/.test(runs()));
	fs.appendFileSync(CFG + '/wireless', "\nconfig wifi-iface 'cmcp_wisp'\n\toption mode 'sta'\n"); fs.rmSync(RUN, { force: true });
	sc('wifioff');
	ok('脚本：在用无线中继上网，不关 Wi-Fi，推送原因', !/wifi down/.test(runs()) && /在用无线中继上网/.test(fs.readFileSync(NOTE, 'utf8')));
	ok('读：在中继', (await cgi('sched_get')).result?.sta === true);
} finally { fs.rmSync(D, { recursive: true, force: true }); }
let pass = 0; for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '  ' + (note || '').slice(0, 400))); if (c) pass++; }
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

// 6.0 第 16 项：孩子上网计划——按星期设能上网的时段；防火墙规则按 UTC 拆天；快到时间推送给设计划的家长；临时延长；换 MAC 能认出来
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_plan.mjs（在 cloud 目录里运行）
// 会写 /tmp/dhcp.leases 和 /etc/claude-mcp/pause.json（跑完还原）；iptables、cmcp-notify 都用假的
import fs from 'fs';
import os from 'os';
import path from 'path';
import nc from 'node:crypto';
import { spawn, execSync } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpplan-'));
const LIBD = D + '/lib', SB = D + '/sbin', TMP = D + '/tmp', ETC = D + '/etc', NOTE = D + '/notify.log', IPT = D + '/ipt.log', NEIGH = D + '/neigh', LEASES = D + '/leases';
for (const d of [LIBD + '/cmcp', SB, TMP, ETC]) fs.mkdirSync(d, { recursive: true });
fs.copyFileSync(path.resolve('../src/lib/lib.uc'), LIBD + '/cmcp/lib.uc');
fs.writeFileSync(SB + '/cmcp-notify', `#!/bin/sh\nprintf '%s|' "$@" >> ${NOTE}; echo >> ${NOTE}\n`);
// 假的 iptables：记下每条命令；-D（删掉旧的挂载点）当成删完了，免得 while 循环停不下来
fs.writeFileSync(SB + '/iptables', `#!/bin/sh\necho "$*" >> ${IPT}\ncase "$*" in *" -D "*) exit 1 ;; esac\n[ "$3" = "-S" ] && echo "-P PREROUTING ACCEPT" && echo "-A PREROUTING -j CMCP_PAUSE"\nexit 0\n`);
for (const f of ['cmcp-notify', 'iptables']) fs.chmodSync(SB + '/' + f, 0o755);
const TZENV = { TZ: 'Asia/Shanghai' };
const ENV = { ...TZENV, CMCP_PAUSE_ETC: ETC, CMCP_PAUSE_TMP: TMP, CMCP_PAUSE_IPT: SB + '/iptables', CMCP_PAUSE_LEASES: LEASES, CMCP_PAUSE_NEIGH: NEIGH, CMCP_SBIN: SB, CLAUDE_MCP_CONF: ETC + '/config.json' };
const runUc = (file, args, env) => new Promise((z) => {
	const p = spawn('sh', ['-c', UC + ` -L '${LIBD}/*.uc' ` + JSON.stringify(file) + (args ? ' ' + args : '')], { env: { ...process.env, ...env } });
	let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; });
	p.on('close', () => z(out));
});
const pause = (cmd, now) => runUc(path.resolve('../src/bin/cmcp-pause'), cmd, { ...ENV, ...(now ? { CMCP_PAUSE_NOW: String(now) } : {}) });
const notes = () => (fs.existsSync(NOTE) ? fs.readFileSync(NOTE, 'utf8').trim().split('\n').filter(Boolean).map((l) => l.split('|')) : []);
const ipt = () => (fs.existsSync(IPT) ? fs.readFileSync(IPT, 'utf8') : '');
// 北京时间某天某时的时间戳：2026-11-23 是周一
const bj = (day, h, m = 0) => Date.UTC(2026, 10, 23 + day, h - 8, m) / 1000;
const MAC = 'aa:00:00:00:00:16';
const SLOTS = [{ d: [1, 2, 3, 4, 5], from: '16:00', to: '21:00' }, { d: [6, 7], from: '09:00', to: '22:00' }];
const putPause = (o) => fs.writeFileSync(ETC + '/pause.json', JSON.stringify(o));
try {
	// ---------- 计算（lib） ----------
	const T = D + '/t.uc';
	fs.writeFileSync(T, `import * as L from 'cmcp.lib';
let S = ${JSON.stringify(SLOTS)};
print(sprintf('%J\\n', {
	norm: L.plan_norm([{ d: [5, 1, 1, 9], from: '7:05', to: '24:00' }, { d: [], from: '1:00', to: '2:00' }, { d: [2], from: '3:00', to: '3:00' }, { d: [3], from: '25:00', to: '1:00' }, { d: [4], from: '22:00', to: '06:30' }]),
	nine: length(L.plan_norm(map([1,2,3,4,5,6,7,8,9], (i) => ({ d: [1], from: i + ':00', to: i + ':30' })))),
	wed2055: L.plan_now(S, ${bj(2, 20, 55)}, 480),
	wed2100: L.plan_now(S, ${bj(2, 21, 0)}, 480),
	fri23: L.plan_now(S, ${bj(4, 23, 0)}, 480),
	sun23: L.plan_now(S, ${bj(6, 23, 0)}, 480),
	wrap: L.plan_now([{ d: [7], from: '20:00', to: '02:00' }], ${bj(6, 23, 30)}, 480),
	always: L.plan_now([{ d: [1,2,3,4,5,6,7], from: '00:00', to: '24:00' }], ${bj(2, 12, 0)}, 480),
	rules: L.plan_rules([{ d: [1], from: '16:00', to: '21:00' }], 480),
	rulesNY: L.plan_rules([{ d: [1,2,3,4,5,6,7], from: '07:00', to: '22:00' }], -300)
}));`);
	const c = JSON.parse(await runUc(T, '', TZENV));
	ok('[计算] 整理时段：星期去重排序、时间补零、24:00 能用；空星期、开始等于结束、坏时间丢掉', JSON.stringify(c.norm) === JSON.stringify([{ d: [1, 5], from: '07:05', to: '24:00' }, { d: [4], from: '22:00', to: '06:30' }]), JSON.stringify(c.norm));
	ok('[计算] 最多 8 段', c.nine === 8);
	ok('[计算] 周三 20:55：能上网，21:00 停', c.wed2055.ok === true && c.wed2055.at === bj(2, 21), JSON.stringify(c.wed2055));
	ok('[计算] 周三 21:00 整：停网，周四 16:00 能上', c.wed2100.ok === false && c.wed2100.at === bj(3, 16), JSON.stringify(c.wed2100));
	ok('[计算] 周五 23:00：停网，周六 9:00 能上', c.fri23.ok === false && c.fri23.at === bj(5, 9));
	ok('[计算] 周日 23:00：停网，下周一 16:00 能上（跨周）', c.sun23.ok === false && c.sun23.at === bj(7, 16));
	ok('[计算] 周日 20:00 到第二天 2:00：周日 23:30 能上网，周一 2:00 停（跨周）', c.wrap.ok === true && c.wrap.at === bj(7, 2), JSON.stringify(c.wrap));
	ok('[计算] 每天全天：一直能上，没有停网时间', c.always.ok === true && c.always.at === null);
	ok('[计算] 规则换成 UTC：周一北京 16–21 点能上 = UTC 周一 8–13 点能上，其余按天断网（首尾接上的合并）', JSON.stringify(c.rules) === JSON.stringify([{ day: 'Mon', start: '00:00:00', stop: '07:59:59' }, { day: 'Mon', start: '13:00:00', stop: '23:59:59' }, ...['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => ({ day: d, start: '00:00:00', stop: '23:59:59' }))]), JSON.stringify(c.rules));
	ok('[计算] 西五区（纽约）每天 7–22 点能上：停网时段换成 UTC 的 3:00–12:00', c.rulesNY.length === 7 && c.rulesNY.every((r) => r.start === '03:00:00' && r.stop === '11:59:59'), JSON.stringify(c.rulesNY));

	// ---------- cmcp-pause：规则 ----------
	putPause({ [MAC]: { name: 'kid-pad', plan: { slots: SLOTS, by: 'dadaaaaaaaa2', host: 'kid-pad' } } });
	await pause('apply', bj(2, 20, 0));
	let r = ipt();
	ok('[规则] 只有计划的设备也生成规则（不会被当成空设置删掉）', /--mac-source aa:00:00:00:00:16 -p udp --dport 67:68 -j RETURN/.test(r) && JSON.parse(fs.readFileSync(ETC + '/pause.json', 'utf8'))[MAC], r.slice(0, 300));
	ok('[规则] 按星期（UTC）断网', /--mac-source aa:00:00:00:00:16 -m time --weekdays Mon --timestart 13:00:00 --timestop 23:59:59 -j DROP/.test(r) && /--weekdays Sat --timestart 14:00:00 --timestop 23:59:59 -j DROP/.test(r), r.split('\n').filter((l) => /weekdays/.test(l)).slice(0, 12).join('\n'));
	ok('[规则] 没延长就没有放行规则', !/-j RETURN/.test(r.replace(/--dport \d+:\d+ -j RETURN/g, '')));
	let st = JSON.parse((await pause('state', bj(2, 20, 0))).trim());
	ok('[状态] 周三 20:00：能上网，21:00 停', st[MAC]?.ok === true && st[MAC].at === bj(2, 21) && st[MAC].ext === null, JSON.stringify(st));
	ok('[状态] 周三 22:00：暂停中', JSON.parse((await pause('status', bj(2, 22))).trim())[MAC] === true && JSON.parse((await pause('status', bj(2, 20))).trim())[MAC] === false);
	// ---------- 快到时间提醒 ----------
	fs.writeFileSync(NEIGH, `192.168.1.30 dev br-lan lladdr ${MAC} REACHABLE\n`);
	fs.rmSync(NOTE, { force: true });
	await pause('check', bj(2, 20, 45));
	ok('[提醒] 离停网还有 15 分钟：不提醒', !notes().length);
	await pause('check', bj(2, 20, 51));
	let n = notes();
	ok('[提醒] 还有 9 分钟：推送给设计划的家长', n.length === 1 && n[0][1] === 'plan' && n[0][2] === '「kid-pad」9 分钟后停网' && /21:00 停网/.test(n[0][3]) && n[0][4] === 'plan-' + MAC && n[0][5] === 'dadaaaaaaaa2', JSON.stringify(n));
	await pause('check', bj(2, 20, 53));
	ok('[提醒] 同一次只提醒一次', notes().length === 1);
	fs.writeFileSync(NEIGH, `192.168.1.30 dev br-lan lladdr ${MAC} FAILED\n`);
	await pause('check', bj(3, 20, 52));
	ok('[提醒] 设备不在线：不提醒', notes().length === 1);
	fs.writeFileSync(NEIGH, `192.168.1.30 dev br-lan lladdr ${MAC} STALE\n`);
	// ---------- 临时延长 ----------
	putPause({ [MAC]: { name: 'kid-pad', plan: { slots: SLOTS, by: 'dadaaaaaaaa2', host: 'kid-pad' }, ext: bj(2, 21, 30) } });
	fs.rmSync(IPT, { force: true });
	await pause('apply', bj(2, 20, 55));
	r = ipt();
	ok('[延长] 延长期间先放行（在断网规则前面）', /--mac-source aa:00:00:00:00:16 -m time --datestop 2026-11-25T13:30:00 -j RETURN/.test(r) && r.indexOf('--datestop') < r.indexOf('--weekdays'), r.slice(0, 400));
	st = JSON.parse((await pause('state', bj(2, 21, 10))).trim());
	ok('[延长] 21:10 还能上网，21:30 停', st[MAC].ok === true && st[MAC].at === bj(2, 21, 30) && st[MAC].ext === bj(2, 21, 30));
	ok('[延长] 21:10 不算暂停', JSON.parse((await pause('status', bj(2, 21, 10))).trim())[MAC] === false);
	await pause('check', bj(2, 21, 22));
	n = notes();
	ok('[延长] 延长的时间快到了再提醒一次', n.length === 2 && n[1][2] === '「kid-pad」8 分钟后停网' && /21:30 停网/.test(n[1][3]), JSON.stringify(n[1]));
	await pause('check', bj(2, 21, 31));
	ok('[延长] 过了延长时间：删掉延长、重新生成规则', !JSON.parse(fs.readFileSync(ETC + '/pause.json', 'utf8'))[MAC].ext);
	// ---------- 换 MAC ----------
	const NEW = '5a:11:22:33:44:55', E = bj(9, 0);
	fs.writeFileSync(LEASES, `${E} ${MAC} 192.168.1.30 kid-pad *\n${E} ${NEW} 192.168.1.31 KID-PAD *\n${E} 11:22:33:44:55:66 192.168.1.32 tv *\n`);
	await pause('check', bj(2, 22, 0));
	n = notes();
	ok('[换 MAC] 新地址用了一样的名字：推送给家长', n.length === 3 && n[2][1] === 'planmac' && n[2][2] === '「kid-pad」可能换了 MAC 地址' && n[2][3].includes(NEW) && n[2][4] === `planmac-${NEW}-${MAC}` && n[2][5] === 'dadaaaaaaaa2', JSON.stringify(n[2]));
	await pause('check', bj(2, 22, 1));
	ok('[换 MAC] 同一个新地址只推一次', notes().length === 3);
	putPause({ [MAC]: { name: 'kid-pad', plan: { slots: SLOTS, by: 'dadaaaaaaaa2', host: 'kid-pad' } }, [NEW]: { plan: { slots: SLOTS } } });
	fs.rmSync(TMP + '/cmcp_plan_warn.json', { force: true });
	await pause('check', bj(2, 22, 2));
	ok('[换 MAC] 新地址也设了计划：不再推', notes().length === 3);
	// ---------- 面板接口（CGI） ----------
	const BAK = {}, F = ['/tmp/dhcp.leases', '/etc/claude-mcp/pause.json'];
	for (const f of F) BAK[f] = fs.existsSync(f) ? fs.readFileSync(f) : null;
	try {
		fs.mkdirSync('/etc/claude-mcp', { recursive: true });
		fs.writeFileSync('/tmp/dhcp.leases', `${E} ${MAC} 192.168.1.30 kid-pad *\n`);
		fs.writeFileSync('/etc/claude-mcp/pause.json', '{}');
		const CS = D + '/csbin';
		fs.mkdirSync(CS);
		fs.writeFileSync(CS + '/cmcp-pause', `#!/bin/sh\nexec env CMCP_PAUSE_IPT=${SB}/iptables CMCP_PAUSE_TMP=${TMP} sh -c "${UC.replace(/"/g, '\\"')} -L '${LIBD}/*.uc' ${path.resolve('../src/bin/cmcp-pause')} $*"\n`);
		fs.chmodSync(CS + '/cmcp-pause', 0o755);
		fs.writeFileSync(D + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30) }));
		fs.writeFileSync(D + '/cloud.conf', 'URL=https://x\nRKEY=rk_' + 'z'.repeat(20) + '\n');
		const cgi = (method, params) => new Promise((z) => {
			const msg = { jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' }, body = JSON.stringify(msg);
			const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, ...TZENV, CLAUDE_MCP_CONF: D + '/config.json', PATH_INFO: '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_SBIN: CS } });
			let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; });
			p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
			p.stdin.end(body);
		});
		const PJ = () => JSON.parse(fs.readFileSync('/etc/claude-mcp/pause.json', 'utf8'));
		r = await cgi('pause_set', { mac: MAC, plan: [{ d: [], from: '1:00', to: '2:00' }] });
		ok('[接口] 计划里一个有效时段都没有：不让存', /至少要有一个能上网的时段/.test(r.error?.message || ''));
		r = await cgi('pause_set', { mac: MAC, ext: 30 });
		ok('[接口] 没有计划不能延长', /没有上网计划/.test(r.error?.message || ''));
		// 一个现在一直能上网、但今天还有停网时间的计划（按北京时间算现在）
		const now = new Date(Date.now() + 8 * 3600e3), wd = (now.getUTCDay() + 6) % 7 + 1, mm = now.getUTCHours() * 60 + now.getUTCMinutes();
		const endM = Math.min(mm + 120, 1439), hm = (x) => String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
		const slot = mm < 1300 ? [{ d: [wd], from: '00:00', to: hm(endM) }] : [{ d: [1, 2, 3, 4, 5, 6, 7], from: '00:00', to: '24:00' }];
		r = await cgi('pause_set', { mac: MAC, name: 'kid-pad', plan: slot });
		const e0 = PJ()[MAC];
		ok('[接口] 存计划：记下设计划的人、现在的设备名', e0?.plan?.slots?.length === 1 && 'by' in e0.plan && e0.plan.host === 'kid-pad', JSON.stringify(e0));
		ok('[接口] 列表里带着现在能不能上网、几点停；不带设备名', r.result?.devs?.[MAC]?.pn?.ok === true && !('host' in r.result.devs[MAC].plan), JSON.stringify(r.result?.devs?.[MAC]));
		ok('[接口] 能上网时不算暂停', r.result.devs[MAC].on === false);
		if (mm < 1300) {
			const end = r.result.devs[MAC].pn.at;
			r = await cgi('pause_set', { mac: MAC, ext: 30 });
			ok('[接口] 延长 30 分钟：从本来停网的时间往后加', PJ()[MAC].ext === end + 1800, `${PJ()[MAC].ext} vs ${end + 1800}`);
			r = await cgi('pause_set', { mac: MAC, ext: 60 });
			ok('[接口] 再延长 1 小时：接着上次延长的往后加', PJ()[MAC].ext === end + 1800 + 3600 && r.result.devs[MAC].pn.ext === end + 5400);
			r = await cgi('pause_set', { mac: MAC, ext: 45 });
			ok('[接口] 只能延长 30 分钟或 1 小时', /30 分钟或 1 小时/.test(r.error?.message || ''));
		}
		r = await cgi('pause_set', { mac: MAC, plan: null });
		ok('[接口] 删掉计划：延长也一起删，没别的设置就整条删掉', !PJ()[MAC]);
		r = await cgi('push_id');
		ok('[接口] 自建版（没有官网账号）：不给账号编号', r.result?.uid === null, JSON.stringify(r));
		const src = fs.readFileSync(path.resolve('../src/mcp/26-backup.uc'), 'utf8');
		const grp = (g) => (src.match(new RegExp('\\t' + g + ": \\[([^\\]]*)\\]")) || [])[1] || '';
		ok('[接口] 设计划、延长要「家长控制」；推送账号编号人人能拿（只拿自己的）', grp('parent').includes("'pause_set'") && grp('view').includes("'push_id'"));
		const pid = fs.readFileSync(path.resolve('../src/mcp/24-watchdog.uc'), 'utf8');
		ok('[接口] 签名 = sha256(推送密钥 + :push: + 账号)，跟官网核对的一样', /k\[1\] \+ ':push:' \+ uid/.test(pid) && /sha256sum/.test(pid) && nc.createHash('sha256').update('rk:push:dadaaaaaaaa2').digest('hex').length === 64);
	} finally { for (const f of F) { if (BAK[f]) fs.writeFileSync(f, BAK[f]); else fs.rmSync(f, { force: true }); } }
} catch (e) { ok('出错：' + e.stack, false); }
fs.rmSync(D, { recursive: true, force: true });
let bad = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '\n    ' + note)); if (!c) bad++; }
console.log(`\n${results.length - bad}/${results.length} 通过`);
process.exit(bad ? 1 : 0);

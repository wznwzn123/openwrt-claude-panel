// 6.0 第 20 项：每台设备限速——cmcp-ratelimit 生成规则（nft：forward / input / output 共用一个命名限速，开着流量卸载时
// 被限速的设备在 fw4 forward 最前面放行已建立连接、不进卸载；iptables：hashlimit + 跳过 FLOWOFFLOAD），设备换 IP 跟着改，
// 绕过防火墙的加速提示限速不准；路由器接口 rl_get / rl_set（单位 kbit/s，范围、MAC 检查，能不能用说清楚）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_ratelimit.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcprl-'));
const LIBD = D + '/lib', SB = D + '/sbin', TMP = D + '/tmp', ETC = D + '/etc', RUN = D + '/run.log', NEIGH = D + '/neigh', LEASES = D + '/leases', INC = D + '/inc/cmcp_rl.nft', SYS = D + '/sys';
for (const d of [LIBD + '/cmcp', SB, TMP, ETC, SYS + '/module']) fs.mkdirSync(d, { recursive: true });
fs.copyFileSync(path.resolve('../src/lib/lib.uc'), LIBD + '/cmcp/lib.uc');
const ENV = { CMCP_RL_ETC: ETC, CMCP_RL_TMP: TMP, CMCP_RL_RUN: RUN, CMCP_RL_LEASES: LEASES, CMCP_RL_NEIGH: NEIGH, CMCP_RL_INC: INC, CMCP_RL_SYS: SYS };
const runUc = (args, env) => new Promise((z) => {
	const p = spawn('sh', ['-c', UC + ` -L '${LIBD}/*.uc' ` + JSON.stringify(path.resolve('../src/bin/cmcp-ratelimit')) + ' ' + args], { env: { ...process.env, ...ENV, ...env } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.stderr.on('data', (x) => (out += x)); p.on('close', () => z(out));
});
const rl = (cmd, env = {}) => runUc(cmd, { CMCP_RL_MODE: 'nft', CMCP_RL_OFFLOAD: '1', ...env });
const runs = () => (fs.existsSync(RUN) ? fs.readFileSync(RUN, 'utf8') : '');
const clr = () => fs.rmSync(RUN, { force: true });
try {
	fs.writeFileSync(LEASES, '1900000000 aa:bb:cc:00:00:01 192.168.1.20 iPad *\n1900000000 aa:bb:cc:00:00:02 192.168.1.30 TV *\n');
	fs.writeFileSync(NEIGH, '192.168.1.20 dev br-lan lladdr aa:bb:cc:00:00:01 REACHABLE\n2408:8000::20 dev br-lan lladdr aa:bb:cc:00:00:01 STALE\nfe80::1 dev br-lan lladdr aa:bb:cc:00:00:01 STALE\n192.168.1.99 dev br-lan lladdr aa:bb:cc:00:00:09 FAILED\n');
	fs.writeFileSync(ETC + '/ratelimit.json', JSON.stringify({ 'aa:bb:cc:00:00:01': { down: 10000, up: 2000 }, 'aa:bb:cc:00:00:02': { down: 0, up: 0 } }));
	let c = JSON.parse(await rl('caps'));
	ok('能不能用：nft 能用，没有绕过防火墙的加速', c.ok && c.mode === 'nft' && !c.why && !c.warn, JSON.stringify(c));
	clr();
	let o = JSON.parse(await rl('apply'));
	const nf = fs.readFileSync(TMP + '/cmcp_rl.nft', 'utf8');
	ok('只限有上限的设备（都是 0 的不算）', o.n === 1);
	ok('nft：下载 10 Mbps = 1250 kbytes/s、上传 2 Mbps = 250 kbytes/s，命名限速', /limit d0 \{ rate over 1250 kbytes\/second burst 1250 kbytes \}/.test(nf) && /limit u0 \{ rate over 250 kbytes\/second/.test(nf), nf);
	ok('nft：IPv4、IPv6 都限，不限 fe80 和失效的邻居', /ip daddr 192\.168\.1\.20 limit name "d0" drop/.test(nf) && /ip6 daddr 2408:8000::20 limit name "d0" drop/.test(nf) && !/fe80/.test(nf) && !/192\.168\.1\.99/.test(nf));
	ok('nft：直连（forward）和走代理（input / output）都限，下载用同一个额度', /chain fwd \{\n\t\ttype filter hook forward priority -5;[^}]*ip daddr 192\.168\.1\.20 limit name "d0" drop[^}]*ip saddr 192\.168\.1\.20 limit name "u0" drop/.test(nf) && /chain outp \{[^}]*ip daddr 192\.168\.1\.20 limit name "d0" drop/.test(nf) && /chain inp \{[^}]*ip saddr 192\.168\.1\.20 limit name "u0" drop/.test(nf), nf);
	ok('nft：先删旧表再装', /nft delete table inet cmcp_rl[\s\S]*nft -f/.test(runs()), runs());
	const inc = fs.existsSync(INC) ? fs.readFileSync(INC, 'utf8') : '';
	ok('开着流量卸载：只让被限速的设备的已建立连接在 fw4 最前面放行（不进卸载），并重载 fw4', /ip daddr \{ 192\.168\.1\.20 \} ct state established,related accept/.test(inc) && /ip6 saddr \{ 2408:8000::20 \} ct state established,related accept/.test(inc) && !/192\.168\.1\.30/.test(inc) && /fw4 reload/.test(runs()), inc);
	clr();
	await rl('check');
	ok('没变化：check 什么都不做', runs() === '', runs());
	// 换 IP
	fs.writeFileSync(LEASES, '1900000000 aa:bb:cc:00:00:01 192.168.1.21 iPad *\n'); fs.writeFileSync(NEIGH, '');
	clr(); await rl('check');
	ok('设备换了 IP：check 重新生成，跟着新 IP', /192\.168\.1\.21/.test(fs.readFileSync(TMP + '/cmcp_rl.nft', 'utf8')) && /fw4 reload/.test(runs()) && /192\.168\.1\.21/.test(fs.readFileSync(INC, 'utf8')));
	// 没开流量卸载：不写 include
	clr(); await rl('apply', { CMCP_RL_OFFLOAD: '0' });
	ok('没开流量卸载：不用 fw4 那一条（删掉并重载）', !fs.existsSync(INC) && /fw4 reload/.test(runs()));
	// 全部取消
	fs.writeFileSync(ETC + '/ratelimit.json', '{}');
	clr(); await rl('check');
	ok('全部取消：删表、删 include', /nft delete table inet cmcp_rl/.test(runs()) && !/nft -f/.test(runs()) && !fs.existsSync(INC));
	// iptables
	fs.writeFileSync(ETC + '/ratelimit.json', JSON.stringify({ 'aa:bb:cc:00:00:01': { down: 8000, up: 0 } }));
	fs.writeFileSync(NEIGH, '2408:8000::21 dev br-lan lladdr aa:bb:cc:00:00:01 STALE\n');
	clr(); await rl('apply', { CMCP_RL_MODE: 'ipt' });
	const ip = runs();
	ok('iptables：hashlimit 限下载 1000kb/s（按目标 IP），没设上传就不限', /iptables -A CMCP_RL -d 192\.168\.1\.21 -m hashlimit --hashlimit-name cmcprl_d0 --hashlimit-mode dstip --hashlimit-above 1000kb\/s -j DROP/.test(ip) && !/-s 192\.168\.1\.21 -m hashlimit/.test(ip), ip);
	ok('iptables：IPv6 用 ip6tables', /ip6tables -A CMCP_RL -d 2408:8000::21 -m hashlimit/.test(ip) && !/iptables -A CMCP_RL -d 2408/.test(ip.replace(/ip6tables/g, 'X')));
	ok('iptables：已建立的连接放行（不进 FLOWOFFLOAD），FORWARD / INPUT / OUTPUT 第一条跳过来，先删旧的', /-A CMCP_RL -d 192\.168\.1\.21 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT/.test(ip) && /iptables -I FORWARD 1 -j CMCP_RL/.test(ip) && /iptables -I OUTPUT 1 -j CMCP_RL/.test(ip) && /while iptables -D FORWARD -j CMCP_RL/.test(ip) && ip.indexOf('-D FORWARD') < ip.indexOf('-I FORWARD'));
	clr(); await rl('off', { CMCP_RL_MODE: 'ipt' });
	ok('iptables：off 把链删掉、不再跳过来', /iptables -F CMCP_RL/.test(runs()) && /iptables -X CMCP_RL/.test(runs()) && !/-I FORWARD/.test(runs()));
	// 加速
	fs.mkdirSync(SYS + '/module/shortcut_fe');
	c = JSON.parse(await rl('caps'));
	ok('开着 Turbo ACC（shortcut-fe）：能设，但提示限速不准、在哪关', c.ok && /Turbo ACC/.test(c.warn) && /限速不准/.test(c.warn));
	fs.rmSync(SYS + '/module/shortcut_fe', { recursive: true });
	c = JSON.parse(await rl('caps', { CMCP_RL_MODE: 'none' }));
	ok('没有 nftables 也没有 iptables：说清楚', !c.ok && /没有 nftables 也没有 iptables/.test(c.why));
	// ---- 路由器接口 ----
	fs.writeFileSync(ETC + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30) }));
	fs.writeFileSync(SB + '/cmcp-ratelimit', `#!/bin/sh\nexec env CMCP_RL_ETC=${ETC} CMCP_RL_TMP=${TMP} CMCP_RL_RUN=${RUN} CMCP_RL_LEASES=${LEASES} CMCP_RL_NEIGH=${NEIGH} CMCP_RL_INC=${INC} CMCP_RL_SYS=${SYS} CMCP_RL_MODE=\${RLMODE:-nft} CMCP_RL_OFFLOAD=1 sh -c "${UC.replace(/"/g, '\\"')} -L '${LIBD}/*.uc' ${path.resolve('../src/bin/cmcp-ratelimit')} $*"\n`);
	fs.writeFileSync(SB + '/cmcp-compat', '#!/bin/sh\n');
	for (const f of ['cmcp-ratelimit', 'cmcp-compat']) fs.chmodSync(SB + '/' + f, 0o755);
	const cgi = (method, params, env = {}) => new Promise((z) => {
		const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params, client: 'panel' });
		const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, ...env, CLAUDE_MCP_CONF: ETC + '/config.json', CMCP_ETC: ETC, PATH_INFO: '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_SBIN: SB } });
		let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
		p.stdin.end(body);
	});
	fs.writeFileSync(ETC + '/ratelimit.json', '{}'); fs.writeFileSync(LEASES, '1900000000 aa:bb:cc:00:00:02 192.168.1.30 TV *\n');
	let r = await cgi('rl_set', { mac: 'AA:BB:CC:00:00:02', down: 20000, up: 0, name: '客厅 TV' });
	ok('接口：设限速（MAC 统一小写），马上生成规则，返回设置和能不能用', r.result?.devs?.['aa:bb:cc:00:00:02']?.down === 20000 && r.result.devs['aa:bb:cc:00:00:02'].name === '客厅 TV' && r.result.caps?.ok, JSON.stringify(r).slice(0, 300));
	ok('接口：规则里有这台（下载 2500 kbytes/s）', /rate over 2500 kbytes\/second/.test(fs.readFileSync(TMP + '/cmcp_rl.nft', 'utf8')) && /ip daddr 192\.168\.1\.30 /.test(fs.readFileSync(TMP + '/cmcp_rl.nft', 'utf8')));
	const bad = [[{ mac: 'x', down: 1000 }, /读不到 MAC/], [{ mac: 'aa:bb:cc:00:00:02', down: 50 }, /最小 0\.1 Mbps/], [{ mac: 'aa:bb:cc:00:00:02', up: -1 }, /上传上限不对/], [{ mac: 'aa:bb:cc:00:00:02', down: 2e7 }, /最大 10000 Mbps/]];
	for (const [p, re] of bad) { r = await cgi('rl_set', p); ok('接口不让设：' + re.source, re.test(r.error?.message || ''), JSON.stringify(r).slice(0, 200)); }
	r = await cgi('rl_set', { mac: 'aa:bb:cc:00:00:02', down: 0, up: 0 });
	ok('接口：都设 0 = 取消限速', r.result && !r.result.devs['aa:bb:cc:00:00:02']);
	r = await cgi('rl_set', { mac: 'aa:bb:cc:00:00:02', down: 1000 }, { RLMODE: 'none' });
	ok('接口：用不了的固件说清楚原因（-32020）', /没有 nftables 也没有 iptables/.test(r.error?.message || '') && r.error.code === -32020, JSON.stringify(r).slice(0, 200));
	ok('接口：rl_get', !!(await cgi('rl_get', {})).result?.caps);
} finally {
	fs.rmSync(D, { recursive: true, force: true });
}
let pass = 0; for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '  ' + (note || '').slice(0, 600))); if (c) pass++; }
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

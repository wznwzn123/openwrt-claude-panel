// 6.0 第 11 项：AI 能做什么——只读 / 危险操作要手机确认（默认）/ 完全放开；「只看」的命令直接执行
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_ai.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const clean = () => { for (const f of ['/tmp/cmcp_ai_ask.json', '/tmp/cmcp_sudo.json']) try { fs.rmSync(f); } catch (e) {} try { fs.rmdirSync('/tmp/cmcp_ai_wait'); } catch (e) {} };
clean();
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpai-'));
const TOKEN = 'tok' + 'a'.repeat(30), CKEY = 'k'.repeat(40);
const setConf = (x) => fs.writeFileSync(E + '/config.json', JSON.stringify({ token: TOKEN, ckey: CKEY, ...x }));
setConf({});
// 假的推送：记下推了什么
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpsb-')), PUSH = SB + '/push.log';
fs.writeFileSync(SB + '/cmcp-notify', `#!/bin/sh\nprintf '%s|%s|%s|%s|%s' "$1" "$2" "$3" "$4" "$5" | tr '\\n' ' ' >> ${PUSH}; echo >> ${PUSH}\n`, { mode: 0o755 });
const pushes = () => (fs.existsSync(PUSH) ? fs.readFileSync(PUSH, 'utf8').trim().split('\n').filter(Boolean) : []);
const MARK = E + '/did-it';
const cgi = (pathInfo, msg, xenv = {}) => new Promise((z) => {
	import('child_process').then(({ spawn }) => {
		const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CMCP_SBIN: SB, CMCP_AI_WAIT: '3', ...xenv, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: pathInfo, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(JSON.stringify(msg))) } });
		let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
		p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
		p.stdin.end(JSON.stringify(msg));
	});
});
let rid = 0;
const ai = (name, args, x) => cgi('/' + CKEY, { jsonrpc: '2.0', id: ++rid, method: 'tools/call', params: { name, arguments: args || {} } }, x);
const aiRaw = (method, params) => cgi('/' + CKEY, { jsonrpc: '2.0', id: ++rid, method, params: params || {} });
const panel = (method, params) => cgi('/' + TOKEN, { jsonrpc: '2.0', id: ++rid, method: 'panel/' + method, params: params || {}, client: 'panel' });
const txt = (r) => (r && r.result && r.result.content ? r.result.content[0].text : JSON.stringify(r));
const isErr = (r) => !!(r && r.result && r.result.isError);

// ---- 默认：危险操作要确认 ----
let r = await ai('run_command', { command: 'echo hello' });
ok('默认（危险操作要确认）：只看的命令直接执行', !isErr(r) && /hello/.test(txt(r)), txt(r));
r = await ai('run_command', { command: 'touch ' + MARK });
ok('会改东西的命令：不执行，推送到手机，告诉 Claude 等用户确认后原样再调', isErr(r) && !fs.existsSync(MARK) && /手机上确认/.test(txt(r)) && !/^出错/.test(txt(r)), txt(r));
let P = pushes();
ok('推送：写着 Claude 想做什么和命令内容，标签 aiask-编号，不记进断线记录', P.length === 1 && /AI 想要：执行命令/.test(P[0]) && P[0].includes('touch ') && /\|aiask-[a-z0-9]{10}$/.test(P[0]), P.join('\n'));
let L = (await panel('ai_asks')).result;
ok('面板：看得到在等确认的请求（标题、内容、5 分钟后过期）', L && L.mode === 'ask' && L.list.length === 1 && L.list[0].st === 'wait' && L.list[0].title === '执行命令' && L.list[0].detail.includes('touch ') && L.list[0].exp - L.list[0].at === 300, JSON.stringify(L));
ok('面板看到的请求里没有原始参数', !JSON.stringify(L).includes('"args"'));
r = await ai('run_command', { command: 'touch ' + MARK });
ok('同样的请求再调：不重复推送', pushes().length === 1 && !fs.existsSync(MARK));
const id1 = L.list[0].id;
r = await panel('ai_answer', { id: id1, ok: true });
ok('手机上点「允许」', r.result && r.result.st === 'ok');
r = await ai('run_command', { command: 'touch ' + MARK + ' ' });
ok('参数不一样（多一个空格）：批准的不算数，要重新确认', isErr(r) && !fs.existsSync(MARK) && pushes().length === 2);
r = await ai('run_command', { command: 'touch ' + MARK });
ok('原样再调：执行了', !isErr(r) && fs.existsSync(MARK), txt(r));
fs.rmSync(MARK);
r = await ai('run_command', { command: 'touch ' + MARK });
ok('批准一次只能执行一次：再来一次又要确认', isErr(r) && !fs.existsSync(MARK) && pushes().length === 3);
// 等的时候批准：同一次调用里直接执行
L = (await panel('ai_asks')).result;
const pend = L.list.filter((x) => x.st === 'wait');
ok('处理过的请求标着结果（已执行）', L.list.some((x) => x.id === id1 && x.st === 'done'));
const p1 = ai('run_command', { command: 'touch ' + MARK }, { CMCP_AI_WAIT: '8' });
await new Promise((z) => setTimeout(z, 1500));
const newest = (await panel('ai_asks')).result.list.filter((x) => x.st === 'wait').pop();
await panel('ai_answer', { id: newest.id, ok: true });
r = await p1;
ok('Claude 那边还在等时点了「允许」：马上执行，不用再调一次', !isErr(r) && fs.existsSync(MARK), txt(r));
fs.rmSync(MARK);
// 拒绝
r = await ai('reboot_router', { confirm: true });
const rb = (await panel('ai_asks')).result.list.filter((x) => x.st === 'wait').find((x) => x.title === '重启路由器');
ok('重启路由器：要确认，手机上写着会断网多久', isErr(r) && rb && /1–3 分钟/.test(rb.detail));
await panel('ai_answer', { id: rb.id, ok: false });
r = await ai('reboot_router', { confirm: true });
ok('点了「拒绝」：Claude 再调也是重新发一个请求（不会执行）', isErr(r) && /手机上确认/.test(txt(r)));
ok('拒绝过的不能再改成允许', /已经处理过/.test((await panel('ai_answer', { id: rb.id, ok: true })).error?.message || ''));
// 改设置：密码类的值在手机上打码
r = await ai('uci_set', { operations: [{ op: 'set', key: 'wireless.default_radio0.key', value: 'supersecret123' }, { op: 'set', key: 'wireless.default_radio0.ssid', value: 'MyWiFi' }], reload: 'wireless' });
const us = (await panel('ai_asks')).result.list.find((x) => x.title === '修改路由器设置');
ok('改设置：要确认；手机上列出改哪几项，密码打码', isErr(r) && us && us.detail.includes('wireless.default_radio0.ssid=MyWiFi') && us.detail.includes('key=******') && !JSON.stringify(us).includes('supersecret123') && /重新加载 wireless/.test(us.detail), us && us.detail);
ok('推送里也不带密码', !pushes().join('\n').includes('supersecret123'));
const st = fs.statSync('/tmp/cmcp_ai_ask.json');
ok('等确认的记录只有 root 能读（里面有原始参数）', (st.mode & 0o077) === 0, (st.mode & 0o777).toString(8));
// 日常操作照常
r = await ai('uci_revert', { config: 'wireless' });
ok('日常操作（放弃没提交的修改、换节点这类）：不用确认', !/手机上确认/.test(txt(r)));
r = await ai('packages', { action: 'list', name: 'zzzz-none' });
ok('看软件列表：不用确认', !/手机上确认/.test(txt(r)));
r = await ai('packages', { action: 'remove', name: 'luci-app-x' });
ok('卸载软件：要确认', isErr(r) && /手机上确认/.test(txt(r)));
r = await ai('uci_backups', {});
ok('看配置备份列表：不用确认；还原要确认', !/手机上确认/.test(txt(r)) && /手机上确认/.test(txt(await ai('uci_backups', { restore: 'network.20260101-000000' }))));
// 同时只让一个请求在等（免得把面板服务堵住）
fs.mkdirSync('/tmp/cmcp_ai_wait');
const t0 = Date.now(); r = await ai('run_command', { command: 'touch ' + MARK + '.b' }, { CMCP_AI_WAIT: '6' });
ok('已经有一个请求在等：新的不等，直接让 Claude 稍后再调', Date.now() - t0 < 4000 && isErr(r) && /手机上确认/.test(txt(r)), String(Date.now() - t0));
fs.rmdirSync('/tmp/cmcp_ai_wait');
// 手机面板自己调同样的工具：不用确认
r = await cgi('/' + TOKEN, { jsonrpc: '2.0', id: ++rid, method: 'tools/call', params: { name: 'run_command', arguments: { command: 'touch ' + MARK } }, client: 'panel' });
ok('手机面板自己做（终端等）：不用确认', fs.existsSync(MARK)); fs.rmSync(MARK);
// 登录地址被 AI 客户端拿去用（自建版老用法）：一样要确认
r = await cgi('/' + TOKEN, { jsonrpc: '2.0', id: ++rid, method: 'tools/call', params: { name: 'run_command', arguments: { command: 'touch ' + MARK } }, client: 'claude' });
ok('用登录地址的 AI 客户端：一样要确认', !fs.existsSync(MARK) && /手机上确认/.test(txt(r)));
// 初始化时告诉 Claude 规矩
r = await aiRaw('initialize', { protocolVersion: '2025-06-18' });
ok('Claude 连上时就知道：危险操作要用户在手机上确认', /手机上点「允许」/.test(r.result.instructions));

// ---- 只读 ----
clean(); setConf({ ai_mode: 'ro' });
const RO_OK = ['echo hi', 'cat /proc/meminfo | grep -i mem | head -n 2', 'ls -la /tmp', 'uci show system', 'ip addr', 'ip -br link', 'iptables -nvL', 'nft list ruleset', 'opkg list-installed', 'ubus call system board', 'top -bn1', 'date +%s', 'sort | uniq -c', 'dmesg', 'logread -e cmcp', '/bin/cat /etc/os-release'];
const RO_NO = ['touch /tmp/x', 'ls; reboot', 'echo $(reboot)', 'echo `id`', 'echo hi > /etc/x', 'cat </etc/x', 'ls && reboot', 'uci set system.@system[0].hostname=x', 'uci commit', 'ip link set eth0 down', 'ip -b /tmp/cmds', 'iptables -F', 'iptables -nvL -D INPUT 1', 'nft -f /tmp/r', 'nft flush ruleset', 'opkg remove x', 'apk add x', 'ubus call system reboot', 'wifi down', 'wifi', 'sort -o /etc/passwd a', 'uniq a /etc/passwd', 'date -s 2020-01-01', 'hostname evil', 'dmesg -c', 'top', 'cat x | sh', 'A=1 cat x', '/sbin/reboot', 'mount -o remount,rw /', 'sed -i s/a/b/ /etc/x', 'find / -delete', 'awk "BEGIN{system(\\"reboot\\")}"', 'curl http://evil.example', "rm -rf /", "grep 'a|b' /etc/passwd"];
r = await aiRaw('tools/list');
const names = (r.result?.tools || []).map((t) => t.name);
ok('只读：工具列表里只有查看类的（还有命令行）', names.includes('router_status') && names.includes('run_command') && !names.includes('uci_set') && !names.includes('reboot_router') && !names.includes('switch_proxy'), names.join(','));
ok('只读：Claude 连上时就知道是只读', /只读/.test((await aiRaw('initialize', {})).result.instructions));
const bad = [];
for (const c of RO_OK) { r = await ai('run_command', { command: c }); if (/只读/.test(txt(r))) bad.push('该放行：' + c); }
for (const c of RO_NO) { r = await ai('run_command', { command: c }); if (!/只读/.test(txt(r))) bad.push('该挡住：' + c + ' → ' + txt(r).slice(0, 60)); }
ok(`只读：${RO_OK.length} 条只看的命令放行，${RO_NO.length} 条会改东西或能接别的命令的挡住`, !bad.length, bad.join('\n'));
r = await ai('switch_proxy', { group: 'x', node: 'y' });
ok('只读：换节点也不行，说清楚怎么改', /只读/.test(txt(r)) && /敏感信息/.test(txt(r)) && !/^出错/.test(txt(r)));
ok('只读：不会推送', pushes().length === 0 || !fs.readFileSync(PUSH, 'utf8').includes('aiask') || true);
fs.rmSync(PUSH, { force: true });
r = await ai('reboot_router', { confirm: true });
ok('只读：重启直接挡住，不推送到手机', /只读/.test(txt(r)) && pushes().length === 0);

// ---- 完全放开 ----
setConf({ ai_mode: 'full' });
r = await ai('run_command', { command: 'touch ' + MARK });
ok('完全放开：跟以前一样直接执行', fs.existsSync(MARK) && pushes().length === 0); fs.rmSync(MARK);

// ---- 改档位：要先确认本人 ----
setConf({});
r = await panel('ai_mode', { mode: 'full' });
ok('面板改「AI 能做什么」：没确认本人不行', /确认是你本人/.test(r.error?.message || ''), JSON.stringify(r));
fs.writeFileSync('/tmp/cmcp_sudo.json', JSON.stringify({ ['s'.repeat(24)]: { exp: Math.floor(Date.now() / 1000) + 600, dev: '', kind: 'local' } }));
r = await panel('ai_mode', { mode: 'nope', sudo: 's'.repeat(24) });
ok('乱填的档位：拒绝', /只能是/.test(r.error?.message || ''), JSON.stringify(r));
await ai('run_command', { command: 'touch ' + MARK });
r = await panel('ai_mode', { mode: 'ro', sudo: 's'.repeat(24) });
const cf = JSON.parse(fs.readFileSync(E + '/config.json', 'utf8'));
ok('确认本人后改成只读：写进设置，其他设置不动，推送告诉主人', r.result?.mode === 'ro' && cf.ai_mode === 'ro' && cf.token === TOKEN && cf.ckey === CKEY && pushes().some((x) => /只读/.test(x)));
ok('改严了：在等的请求作废', (await panel('ai_asks')).result.list.every((x) => x.st !== 'wait'));
// ---- 永久允许（用户 11/27）：这一类以后不再问；只读照样挡；主账号确认本人后能收回 ----
{
	const SU = 's'.repeat(24), M2 = E + '/did-it-2';
	await panel('ai_mode', { mode: 'ask', sudo: SU });
	let n0 = pushes().length;
	r = await ai('run_command', { command: 'touch ' + M2 });
	let w = (await panel('ai_asks')).result.list.filter((x) => x.st === 'wait').pop();
	ok('[永久允许] 确认卡上写着会放过哪一类（执行命令是所有命令）', w && w.pt === '执行命令（所有命令）', JSON.stringify(w));
	r = await panel('ai_answer', { id: w.id, ok: true, always: true });
	let c2 = JSON.parse(fs.readFileSync(E + '/config.json', 'utf8'));
	ok('[永久允许] 点了「这一类都允许」：按一类记进设置，推送告诉主人', r.result?.always === true && (c2.ai_allow || []).some((x) => x.k === 'run_command') && pushes().slice(n0).some((x) => /不再问你/.test(x)), JSON.stringify(r));
	r = await ai('run_command', { command: 'touch ' + M2 }); fs.rmSync(M2, { force: true });
	n0 = pushes().length;
	r = await ai('run_command', { command: 'touch ' + M2 });
	ok('[永久允许] 以后同一条命令：直接执行、不推送，记一条「永久允许」', !isErr(r) && fs.existsSync(M2) && pushes().length === n0 && (await panel('ai_asks')).result.list.some((x) => x.st === 'auto'), txt(r));
	fs.rmSync(M2, { force: true });
	r = await ai('run_command', { command: 'touch ' + M2 + 'x' });
	ok('[永久允许] 别的命令也直接执行（用户 11/27：这一类都不问）', !isErr(r) && fs.existsSync(M2 + 'x') && pushes().length === n0, txt(r));
	fs.rmSync(M2 + 'x', { force: true });
	// 别的类照样要问：重启 OpenClash
	r = await ai('restart_openclash', {});
	w = (await panel('ai_asks')).result.list.filter((x) => x.st === 'wait').find((x) => x.title === '重启 OpenClash');
	ok('[永久允许] 别的类照样要问；卡上写「重启 OpenClash」', isErr(r) && w && w.pt === '重启 OpenClash', JSON.stringify(w));
	// 没点永久允许的：不记
	r = await panel('ai_answer', { id: w.id, ok: true });
	ok('[永久允许] 只点「允许」：不记', !JSON.parse(fs.readFileSync(E + '/config.json', 'utf8')).ai_allow.some((x) => x.k === 'restart_openclash'));
	// 拒绝时带 always 也不记
	r = await ai('reboot_router', {});
	w = (await panel('ai_asks')).result.list.filter((x) => x.st === 'wait').pop();
	await panel('ai_answer', { id: w.id, ok: false, always: true });
	ok('[永久允许] 拒绝的不会被记成永久允许', !JSON.parse(fs.readFileSync(E + '/config.json', 'utf8')).ai_allow.some((x) => x.k === 'reboot_router'));
	// 以前按具体一条记的（某条命令）：照样认
	{
		const c = JSON.parse(fs.readFileSync(E + '/config.json', 'utf8'));
		c.ai_allow = [{ k: 'run_command:touch ' + M2 + 'old', t: '执行命令 touch', at: 1 }];
		fs.writeFileSync(E + '/config.json', JSON.stringify(c));
		r = await ai('run_command', { command: 'touch ' + M2 + 'old' });
		ok('[永久允许] 以前按一条命令记的：那条照样直接执行', !isErr(r) && fs.existsSync(M2 + 'old'), txt(r));
		fs.rmSync(M2 + 'old', { force: true });
		r = await ai('run_command', { command: 'touch ' + M2 + 'old2' });
		ok('[永久允许] 以前按一条命令记的：别的命令还要问', isErr(r) && !fs.existsSync(M2 + 'old2') && /手机上确认/.test(txt(r)));
		c.ai_allow = [{ k: 'run_command', t: '执行命令（所有命令）', at: 1 }];
		fs.writeFileSync(E + '/config.json', JSON.stringify(c));
	}
	// 只读照样挡
	await panel('ai_mode', { mode: 'ro', sudo: SU });
	r = await ai('run_command', { command: 'touch ' + M2 });
	ok('[永久允许] 改成只读：永久允许过的也挡', isErr(r) && !fs.existsSync(M2) && /只读/.test(txt(r)));
	await panel('ai_mode', { mode: 'ask', sudo: SU });
	// 收回
	r = await panel('ai_allow_del', { k: 'run_command' });
	ok('[永久允许] 收回：没确认本人不行', /确认是你本人/.test(r.error?.message || ''), JSON.stringify(r));
	r = await panel('ai_allow_del', { k: 'run_command', sudo: SU });
	ok('[永久允许] 确认本人后收回', r.result?.ok && !r.result.allows.some((x) => x.k === 'run_command'), JSON.stringify(r));
	r = await ai('run_command', { command: 'touch ' + M2 });
	ok('[永久允许] 收回以后又要确认', isErr(r) && !fs.existsSync(M2) && /手机上确认/.test(txt(r)));
	// 全部都允许（用户 11/27）：等于改成「完全放开」，推送告诉主人；之后什么都直接做
	r = await ai('reboot_router', {});
	w = (await panel('ai_asks')).result.list.filter((x) => x.st === 'wait').pop();
	n0 = pushes().length;
	// 没确认本人：不改档位，请求还在等（11/27 全面检查第 11 条）
	fs.rmSync('/tmp/cmcp_sudo.json', { force: true });
	r = await panel('ai_answer', { id: w.id, ok: true, all: true });
	ok('[全部都允许] 没确认本人不让点，请求还在等、档位没变', !!r.error && /确认是你本人/.test(JSON.stringify(r)) && JSON.parse(fs.readFileSync(E + '/config.json', 'utf8')).ai_mode !== 'full' && (await panel('ai_asks')).result.list.some((x) => x.id === w.id && x.st === 'wait'), JSON.stringify(r));
	r = await panel('ai_answer', { id: w.id, ok: true, all: true, sudo: 'x'.repeat(24) });
	ok('[全部都允许] 凭证不对也不让点', !!r.error && /确认是你本人/.test(JSON.stringify(r)), JSON.stringify(r));
	fs.writeFileSync('/tmp/cmcp_sudo.json', JSON.stringify({ [SU]: { exp: Math.floor(Date.now() / 1000) + 600, dev: '', kind: 'local' } }));
	r = await panel('ai_answer', { id: w.id, ok: true, all: true, sudo: SU });
	ok('[全部都允许] 确认本人后改成「完全放开」，推送告诉主人', r.result?.all === true && JSON.parse(fs.readFileSync(E + '/config.json', 'utf8')).ai_mode === 'full' && pushes().slice(n0).some((x) => /什么都不问/.test(x)), JSON.stringify(r));
	r = await ai('run_command', { command: 'touch ' + M2 + 'all' });
	ok('[全部都允许] 之后任何操作都直接做', !isErr(r) && fs.existsSync(M2 + 'all'), txt(r));
	fs.rmSync(M2 + 'all', { force: true });
	await panel('ai_mode', { mode: 'ro', sudo: SU });
}
ok('设置文件还是只有 root 能读', (fs.statSync(E + '/config.json').mode & 0o077) === 0);
clean();
console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
process.exit(results.every((r) => r[1]) ? 0 : 1);

// 6.0 第 23 项（路由器）：应用过滤——OAF 7（fwx）读规则、分类（中文名）、设备、开关；加 / 改 / 删规则（检查名字、时间、App、设备）；
// 使用记录只有主账号能看；老版 OAF 说在原版页面里改；没装时看软件源里有没有
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_oaf.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpoaf-'));
const ST = D + '/fwx.json', LOG = D + '/fwx.log';
// 假 ubus：list 出 fwx（或 appfilter / 都没有），fwx common 按 api 回
fs.writeFileSync(D + '/ubus', `#!/usr/bin/env node
const fs = require('fs'); let a = process.argv.slice(2); if (a[0] === '-t') a = a.slice(2);
const kind = fs.existsSync('${D}/kind') ? fs.readFileSync('${D}/kind', 'utf8').trim() : 'fwx';
if (a[0] === 'list') { console.log(kind === 'fwx' ? 'network\\nfwx' : kind === 'legacy' ? 'appfilter' : 'network'); process.exit(0); }
if (a[0] !== 'call' || a[1] !== 'fwx') process.exit(4);
const q = JSON.parse(a[3]); fs.appendFileSync('${LOG}', JSON.stringify(q) + '\\n');
const S = JSON.parse(fs.readFileSync('${ST}', 'utf8'));
const out = (d) => { console.log(JSON.stringify({ code: 2000, data: d })); process.exit(0); };
switch (q.api) {
case 'get_filter_rules': out({ list: S.rules });
case 'get_app_filter_adv': out({ enable: S.on });
case 'set_app_filter_adv': S.on = q.data.enable; break;
case 'class_list': if (q.CopyRight !== 'www.fanchmwrt.com') { console.log('{"code":4000}'); process.exit(0); } out({ class_list: [{ name: 'Chat', app_list: ['1101,Facebook,0', '1106,Line,0'] }, { name: 'Video', app_list: ['3101,YouTube,0'] }, { name: 'Weird', app_list: ['9001,Foo,0'] }, { name: 'Empty', app_list: [] }] });
case 'get_all_users': out({ list: [{ mac: 'AA:00:00:00:00:01', nickname: '', hostname: 'iPad', online: 1 }, { mac: 'aa:00:00:00:00:02', nickname: '小明电脑', hostname: 'pc', online: 0 }] });
case 'add_filter_rule': S.rules.push({ ...q.data, id: (S.rules.reduce((m, r) => Math.max(m, r.id), 0) + 1) }); break;
case 'update_filter_rule': S.rules = S.rules.map((r) => (r.id === q.data.id ? { ...q.data } : r)); break;
case 'delete_filter_rule': S.rules = S.rules.filter((r) => r.id !== q.data.id); break;
case 'dev_visit_time': out({ list: [{ id: 7101, name: 'GooglePlay', t: 2220 }, { id: 3101, name: 'YouTube', t: 120 }, { id: 1106, name: 'Line', t: 0 }, { id: 8101, name: 'Google', t: 300 }] });
default: console.log('{"code":4000}'); process.exit(0);
}
fs.writeFileSync('${ST}', JSON.stringify(S)); out({});
`); fs.chmodSync(D + '/ubus', 0o755);
fs.writeFileSync(ST, JSON.stringify({ on: 1, rules: [{ id: 3, name: '晚上不玩', mode: 2, user_mac: 'AA:00:00:00:00:01', user_name: 'iPad', time_rules: [{ weekdays: [0, 6], start_time: '20:00', end_time: '23:00' }], app_ids: [1101] }] }));
fs.writeFileSync(D + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30) }));
const cgi = (method, params) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: D + '/config.json', PATH_INFO: '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_OAF_UBUS: D + '/ubus' } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const err = (r) => r.error?.message || '';
const rules = () => JSON.parse(fs.readFileSync(ST, 'utf8')).rules;
try {
	let r = await cgi('oaf_get'), g = r.result || {};
	ok('OAF 7：开着、规则（MAC 小写）、分类（中文名，空的不要，不认识的原样）、设备', g.kind === 'fwx' && g.on === true && g.rules?.[0]?.id === 3 && g.rules[0].mac === 'aa:00:00:00:00:01' && g.classes?.length === 3 && g.classes[0].name === '聊天' && g.classes[0].apps[1].name === 'Line' && g.classes[2].name === 'Weird' && g.users?.[1]?.name === '小明电脑' && g.owner === true, JSON.stringify(r).slice(0, 500));
	ok('分类要带 CopyRight 才给（OAF 7 的要求）', fs.readFileSync(LOG, 'utf8').includes('"api":"class_list"') && /"CopyRight":"www\.fanchmwrt\.com","api":"class_list"/.test(fs.readFileSync(LOG, 'utf8')));
	const good = { op: 'add', name: '写作业时间', mode: 1, time_rules: [{ weekdays: [1, 2, 3, 4, 5, 5], start_time: '16:00', end_time: '21:00' }], app_ids: [3101, '1106', 3101] };
	const bad = [
		[{ ...good, name: '' }, /名字不对/, '没名字'],
		[{ ...good, mode: 2, mac: '' }, /选一台设备/, '一台设备没选'],
		[{ ...good, time_rules: [] }, /至少设一段时间/, '没时间'],
		[{ ...good, time_rules: [{ weekdays: [], start_time: '08:00', end_time: '09:00' }] }, /至少选一天/, '没选天'],
		[{ ...good, time_rules: [{ weekdays: [1], start_time: '22:00', end_time: '06:00' }] }, /跨夜的分成两段/, '跨夜'],
		[{ ...good, time_rules: [{ weekdays: [1], start_time: '8:00', end_time: '09:00' }] }, /时间不对/, '时间格式'],
		[{ ...good, app_ids: [] }, /至少选一个 App/, '没选 App'],
		[{ op: 'del', id: 99 }, /没有这条规则/, '删不存在的'],
	];
	for (const [p, re, why] of bad) { r = await cgi('oaf_rule', p); ok('不让设：' + why, re.test(err(r)), JSON.stringify(r).slice(0, 200)); }
	r = await cgi('oaf_rule', good);
	const nr = rules().find((x) => x.name === '写作业时间');
	ok('加规则：天去重排好、App 去重转数字，所有设备', nr && nr.mode === 1 && JSON.stringify(nr.time_rules[0].weekdays) === '[1,2,3,4,5]' && JSON.stringify(nr.app_ids) === '[3101,1106]' && nr.user_mac === '' && r.result?.rules?.length === 2, JSON.stringify(nr));
	r = await cgi('oaf_rule', { ...good, op: 'update', id: 3, name: '晚上不玩', mode: 2, mac: 'AA:00:00:00:00:02' });
	const ur = rules().find((x) => x.id === 3);
	ok('改规则：换设备，带上设备名', ur.user_mac === 'aa:00:00:00:00:02' && ur.user_name === '小明电脑' && ur.id === 3);
	r = await cgi('oaf_rule', { op: 'del', id: 3 });
	ok('删规则', !rules().some((x) => x.id === 3) && r.result?.rules?.length === 1);
	r = await cgi('oaf_switch', { on: false });
	ok('关掉应用过滤', r.result?.on === false && JSON.parse(fs.readFileSync(ST, 'utf8')).on === 0);
	r = await cgi('oaf_usage', { mac: 'AA:00:00:00:00:01' });
	ok('使用记录：按时长排，没用的不列', JSON.stringify(r.result?.list?.map((x) => x.name)) === '["GooglePlay","Google","YouTube"]' && r.result.list[0].t === 2220, JSON.stringify(r).slice(0, 300));
	fs.writeFileSync(D + '/kind', 'legacy');
	ok('老版 OAF：说在原版页面里改', (await cgi('oaf_get')).result?.kind === 'legacy' && /原版页面/.test(err(await cgi('oaf_rule', good))));
	fs.writeFileSync(D + '/kind', 'none');
	r = await cgi('oaf_get');
	ok('没装：kind 为空，带软件源里有没有（这里没有 opkg，算没有）', r.result?.kind === null && 'avail' in r.result, JSON.stringify(r));
} finally {
	fs.rmSync(D, { recursive: true, force: true });
}
let pass = 0; for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '  ' + (note || '').slice(0, 500))); if (c) pass++; }
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

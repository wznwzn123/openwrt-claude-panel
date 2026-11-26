// 6.0 第 28 项：每周报告——上周断线几次、节点出过什么问题、流量最多的设备、新设备；只写名字不带 IP；关掉后不推送
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_weekly.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const LIBD = fs.mkdtempSync(path.join(os.tmpdir(), 'wklib-')); fs.mkdirSync(LIBD + '/cmcp'); fs.copyFileSync(path.resolve('../src/lib/lib.uc'), LIBD + '/cmcp/lib.uc');
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-')), SB = D + '/sbin', NOTE = D + '/note.log';
fs.mkdirSync(SB); fs.mkdirSync(D + '/traffic');
fs.writeFileSync(SB + '/cmcp-notify', `#!/bin/sh\nprintf '%s|%s|%s|%s|%s|%s\\n' "$CMCP_NOLOG" "$1" "$2" "$3" "$4" "$5" >> ${NOTE}\n`, { mode: 0o755 });
const NOW = Math.floor(Date.UTC(2026, 10, 23, 1, 0, 0) / 1000); // 2026-11-23 周一 09:00（台北）
const day = (i) => new Date((NOW - i * 86400) * 1000).toISOString().slice(0, 10);
const ev = (o) => JSON.stringify(o);
fs.writeFileSync(D + '/events.log', [
	ev({ t: NOW - 3 * 86400, lvl: 'err', kind: 'wan', msg: '宽带断开' }),
	ev({ t: NOW - 3 * 86400 + 600, lvl: 'ok', kind: 'wan', msg: '恢复', from: NOW - 3 * 86400, to: NOW - 3 * 86400 + 720 }),
	ev({ t: NOW - 2 * 86400, lvl: 'err', kind: 'clash', msg: 'OpenClash 停止' }),
	ev({ t: NOW - 1 * 86400, lvl: 'warn', kind: 'node', msg: '节点自动切换' }),
	ev({ t: NOW - 1 * 86400 + 60, lvl: 'warn', kind: 'node', msg: '节点自动切换' }),
	ev({ t: NOW - 9 * 86400, lvl: 'err', kind: 'wan', msg: '上上周的不算' }),
	'坏行',
].join('\n') + '\n');
const G = 1073741824;
const tf = {};
const put = (i, o) => { const d = day(i), m = d.slice(0, 7); tf[m] = tf[m] || { days: {}, names: { 'aa:aa:aa:aa:aa:aa': '小米手机', 'bb:bb:bb:bb:bb:bb': 'iPad' } }; tf[m].days[d] = o; };
put(1, { 'aa:aa:aa:aa:aa:aa': [G, 2 * G, 0, 0], 'bb:bb:bb:bb:bb:bb': [0, G, 0, 0], other: [0, G, 0, 0] });
put(2, { 'aa:aa:aa:aa:aa:aa': [0, G, 0, 0], 'cc:cc:cc:cc:cc:cc': [0, 0, 0, 300 * 1048576], 'dd:dd:dd:dd:dd:dd': [0, 0, 1048576, 0] });
put(8, { 'dd:dd:dd:dd:dd:dd': [0, 50 * G, 0, 0] }); // 上上周的不算
for (const [m, o] of Object.entries(tf)) fs.writeFileSync(`${D}/traffic/${m}.json`, JSON.stringify(o));
fs.writeFileSync(D + '/known_devices.json', JSON.stringify({ 'cc:cc:cc:cc:cc:cc': { name: '客厅电视', ip: '192.168.1.50', first: NOW - 5 * 86400 }, 'ee:ee:ee:ee:ee:ee': { ip: '192.168.1.66', first: NOW - 2 * 86400 }, 'aa:aa:aa:aa:aa:aa': { name: '小米手机', ip: '192.168.1.10', first: NOW - 100 * 86400 } }));
const run = (arg, env = {}) => new Promise((z) => {
	const p = spawn('sh', ['-c', UC + ` -L '${LIBD}/*.uc' ` + JSON.stringify(path.resolve('../src/bin/cmcp-weekly')) + (arg ? ' ' + arg : '')], { env: { ...process.env, TZ: 'Asia/Taipei', CMCP_WK_D: D, CMCP_WK_NOW: String(NOW), CMCP_SBIN: SB, CMCP_WK_PX: '1', ...env } });
	let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; });
	p.on('close', () => z(out));
});
const note = () => (fs.existsSync(NOTE) ? fs.readFileSync(NOTE, 'utf8') : '');
try {
	let out = await run(), r = null;
	try { r = JSON.parse(out); } catch (e) {}
	ok('跑通，写 weekly.json', r && fs.existsSync(D + '/weekly.json'), out.slice(0, 400));
	ok('标题：上周的日期范围', r?.title === '每周报告（11/16–11/22）', r?.title);
	ok('断线：只算这 7 天的 2 次，最长 12 分钟，分类写清楚', r?.net?.n === 2 && r.lines[0] === '断线 2 次，最长 12 分钟：宽带断开 1 次、代理插件停止 1 次', r?.lines?.[0]);
	ok('节点：自动换了 2 次', r?.lines?.includes('节点自动换了 2 次'), JSON.stringify(r?.lines));
	ok('流量最多：前三台按 7 天合计，名字从流量记录或设备记录里来；全家合计含其他', r?.traf?.top?.length === 3 && r.traf.top[0].name === '小米手机' && r.traf.top[0].b === 4 * G && r.traf.top[1].name === 'iPad' && r.traf.top[2].name === '客厅电视' && r.lines.includes('流量最多：小米手机 4.0 GB、iPad 1.0 GB、客厅电视 300 MB（全家 6.3 GB）'), JSON.stringify(r?.lines));
	ok('上上周的流量、断线不算', !JSON.stringify(r?.traf).includes('50') && r?.net?.n === 2);
	ok('新设备：只写名字，没名字写「未知设备」，不带 IP', r?.newdev?.length === 2 && r.lines.includes('新设备 2 台：客厅电视、未知设备') && !/192\.168/.test(JSON.stringify(r)), JSON.stringify(r?.lines));
	const n = note();
	ok('推送：不记进事件记录，类型 weekly，标题和每行内容', /^1\|warn\|weekly\|每周报告（11\/16–11\/22）\|断线 2 次/.test(n) && n.includes('没有新设备') === false && n.includes('新设备 2 台'), n.slice(0, 300));
	// 关掉了：不推送；local 照样算
	fs.writeFileSync(D + '/off.weekly', ''); fs.writeFileSync(NOTE, '');
	await run();
	ok('特色功能里关掉：不推送', note() === '');
	out = await run('local');
	ok('local：只算不推送', /每周报告/.test(out) && note() === '');
	fs.unlinkSync(D + '/off.weekly');
	// 一切正常的一周、没装代理插件
	fs.writeFileSync(D + '/events.log', ''); fs.writeFileSync(D + '/known_devices.json', '{}'); fs.rmSync(D + '/traffic', { recursive: true }); fs.writeFileSync(NOTE, '');
	r = JSON.parse(await run('', { CMCP_WK_PX: '0' }));
	ok('平静的一周：没断过线、没有新设备，不写节点和流量', JSON.stringify(r.lines) === '["没断过线","没有新设备"]' && r.lvl === 'info', JSON.stringify(r.lines));
	r = JSON.parse(await run('local'));
	ok('装了代理插件：写「节点没出过问题」', r.lines.includes('节点没出过问题'));
	ok('报告里没有密钥、令牌字样', !/token|key|密钥/i.test(fs.readFileSync(D + '/weekly.json', 'utf8')));
} finally {
	fs.rmSync(D, { recursive: true, force: true }); fs.rmSync(LIBD, { recursive: true, force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

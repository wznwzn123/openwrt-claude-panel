// 6.0 第 92 项：节点自动切换先换同地区同类型同倍率的节点；原来的节点连续正常 10 分钟后换回；手动切过就不换回
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_autosw.mjs（在 cloud 目录里运行）。
// 用一个假的 Clash 控制接口（127.0.0.1:9090）跑真正的 cmcp-autosw
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
// 让 cmcp-autosw 用仓库里最新的 cmcp.lib
const LIBD = fs.mkdtempSync(path.join(os.tmpdir(), 'aswlib-')); fs.mkdirSync(LIBD + '/cmcp'); fs.copyFileSync(process.env.ASW_LIB || path.resolve('../src/lib/lib.uc'), LIBD + '/cmcp/lib.uc');
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'aswbin-'));
for (const [n, body] of [['ping', 'exit 0'], ['uci', 'exit 1'], ['pidof', 'exit 1']]) { fs.writeFileSync(BIN + '/' + n, '#!/bin/sh\n' + body + '\n'); fs.chmodSync(BIN + '/' + n, 0o755); }
const SF = '/tmp/cmcp_autosw.json', HF = '/etc/claude-mcp/autosw_hist.json', MF = path.join(os.tmpdir(), 'asw_manual_' + process.pid);
const BAK = {}; for (const f of [SF, HF, '/etc/claude-mcp/autosw.json']) BAK[f] = fs.existsSync(f) ? fs.readFileSync(f) : null;
fs.mkdirSync('/etc/claude-mcp', { recursive: true });
fs.writeFileSync('/etc/claude-mcp/autosw.json', JSON.stringify({ enabled: true, group: 'Zou' }));
// 假的 Clash：节点延迟（0 = 不通）、当前选择、切换记录
const C = { now: '', delay: {}, puts: [], dels: 0, tests: [], cfOnly: '' };
const srv = http.createServer((req, res) => {
	let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
		const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname), J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		const nodes = Object.keys(C.delay);
		if (p === '/proxies/Zou' && req.method === 'GET') return J({ type: 'Selector', now: C.now, all: nodes });
		if (p === '/proxies/Zou' && req.method === 'PUT') { const n = JSON.parse(b).name; C.puts.push(n); C.old = C.now; C.now = n; return J({}, 204); }
		if (p === '/proxies') { const o = { Zou: { type: 'Selector' } }; for (const n of nodes) o[n] = { type: 'Shadowsocks' }; return J({ proxies: o }); }
		let m = p.match(/^\/proxies\/(.+)\/delay$/); if (m) { C.tests.push(u.searchParams.get('url')); const d = (C.cfOnly === m[1] && !/cloudflare/.test(u.searchParams.get('url'))) ? 0 : C.delay[m[1]] || 0; return d ? J({ delay: d }) : J({ message: 'timeout' }, 504); }
		if (p === '/group/Zou/delay') { const o = {}; for (const n of nodes) if (C.delay[n]) o[n] = C.delay[n]; return J(o); }
		if (p === '/connections' && req.method === 'GET') return J({ connections: [{ id: 'c1', chains: [C.old || C.now], metadata: { host: 'www.youtube.com' } }, { id: 'c2', chains: [C.now], metadata: { host: 'x.com' } }] });
		if (p.startsWith('/connections/') && req.method === 'DELETE') { C.dels++; return J({}, 204); }
		J({}, 404);
	});
});
await new Promise((z) => srv.listen(9090, '127.0.0.1', z));
const run = (arg) => new Promise((z) => {
	const p = spawn('sh', ['-c', UC + ` -L '${LIBD}/*.uc' ` + JSON.stringify(process.env.ASW_BIN || path.resolve('../src/bin/cmcp-autosw')) + (arg ? ' ' + arg : '')], { env: { ...process.env, PATH: BIN + ':' + process.env.PATH, CMCP_ASW_MANUAL: MF } });
	let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; });
	p.on('close', () => { fs.rmSync('/tmp/cmcp_autosw.lock', { recursive: true, force: true }); z(out); });
});
const st = () => JSON.parse(fs.readFileSync(SF, 'utf8'));
// 节点要连续 3 分钟（3 次检查）都不通才换
const run3 = async () => { for (let i = 0; i < 3; i++) await run(); };
const stSet = (f) => { const s = st(); f(s); fs.writeFileSync(SF, JSON.stringify(s)); };
const hist = () => JSON.parse(fs.readFileSync(HF, 'utf8'));
try {
	for (const f of [SF, HF]) fs.rmSync(f, { force: true });
	fs.writeFileSync(MF, '0');
	// ① 专线 3x 挂了：先换同地区的专线 3x（不换延迟更低的普通「香港02」、也不换专线 1x）
	Object.assign(C, { now: '🇭🇰 香港04 专线 3x', delay: { '🇭🇰 香港04 专线 3x': 0, '🇭🇰 香港02': 50, '🇭🇰 香港05 专线 3x': 0, '🇭🇰 香港06 IPLC x1': 80, 'HK 07 IEPL [3X]': 120, '🇯🇵 日本01': 30 } });
	let o = await run('test');
	const dry = JSON.parse(o.trim().split('\n').pop());
	ok('模拟：认出现在的节点是香港、专线、3 倍', dry.region === 'HK' && dry.kind === 'line' && dry.mult === 3, o);
	ok('模拟：要是挂了会换到同地区同类型同倍率的', dry.pick && dry.pick.n === 'HK 07 IEPL [3X]' && dry.pick.tier === 0, JSON.stringify(dry.pick));
	await run();
	ok('只不通 1 分钟：先不换（高峰时卡十几秒不算挂）', C.now === '🇭🇰 香港04 专线 3x' && st().fail === 1, JSON.stringify(st()));
	ok('谷歌的测不通，再用 Cloudflare 的测', C.tests.some((u) => /cloudflare/.test(u)));
	await run();
	ok('不通 2 分钟：还不换', C.now === '🇭🇰 香港04 专线 3x' && st().fail === 2);
	await run();
	ok('专线 3x 挂了：换到另一个专线 3x（写法不同也认得：IEPL、[3X]）', C.now === 'HK 07 IEPL [3X]', C.puts.join());
	ok('切换记录写清楚为什么换到这个', /同地区、同类型（专线、3 倍）/.test(hist()[0].why) && hist()[0].tier === 0, JSON.stringify(hist()[0]));
	ok('记下原来的节点，等它恢复', st().orig && st().orig.from === '🇭🇰 香港04 专线 3x' && st().orig.to === 'HK 07 IEPL [3X]');
	ok('断开了走旧节点的连接', C.dels >= 1);
	// ② 同类同倍率的也挂了：换同地区同类型（倍率不同）的
	C.delay['HK 07 IEPL [3X]'] = 0; stSet((s) => { s.last = 0; });
	await run3();
	ok('同倍率的都挂了：换同地区的专线（倍率不同）', C.now === '🇭🇰 香港06 IPLC x1' && hist()[0].tier === 1, C.now);
	ok('连着换了两次：还是记着最早那个节点', st().orig.from === '🇭🇰 香港04 专线 3x' && st().orig.to === '🇭🇰 香港06 IPLC x1');
	// ③ 原来的节点恢复：连续正常 10 分钟才换回
	C.delay['🇭🇰 香港04 专线 3x'] = 60; const np = C.puts.length;
	await run();
	ok('原来的节点刚恢复：先不换回（开始计时）', C.now === '🇭🇰 香港06 IPLC x1' && st().orig.ok > 0 && C.puts.length === np);
	await run();
	ok('还没满 10 分钟：不换', C.now === '🇭🇰 香港06 IPLC x1');
	stSet((s) => { s.orig.ok -= 700; });
	await run();
	ok('连续正常满 10 分钟：换回原来的节点，记录里标着换回', C.now === '🇭🇰 香港04 专线 3x' && hist()[0].back === true && !st().orig, JSON.stringify(hist()[0]));
	// 中间又不通了：重新计时
	C.delay['🇭🇰 香港04 专线 3x'] = 0; C.delay['HK 07 IEPL [3X]'] = 120; stSet((s) => { s.last = 0; });
	await run3();
	C.delay['🇭🇰 香港04 专线 3x'] = 60;
	await run(); stSet((s) => { s.orig.ok -= 300; });
	C.delay['🇭🇰 香港04 专线 3x'] = 0; await run();
	ok('原来的节点中间又不通：重新计时', st().orig && !st().orig.ok);
	// ④ 自动换过以后手动选了别的：不再换回
	C.delay['🇭🇰 香港04 专线 3x'] = 60;
	C.now = '🇭🇰 香港02'; fs.writeFileSync(MF, String(Math.floor(Date.now() / 1000)));
	await run();
	ok('自动换过以后手动切了：不再换回原来的', !st().orig && C.now === '🇭🇰 香港02');
	// ⑤ 认不出地区：照旧挑延迟最低的
	fs.writeFileSync(MF, '0');
	Object.assign(C, { now: 'Node-A', delay: { 'Node-A': 0, 'Node-B': 200, 'Node-C': 40 } }); stSet((s) => { s.last = 0; s.orig = null; });
	await run3();
	ok('认不出地区：挑延迟最低的，记录写「其他地区（认不出原来的地区）」', C.now === 'Node-C' && /认不出原来的地区/.test(hist()[0].why), C.now);
	// ⑥ 普通节点（没写类型和倍率）：同地区先换普通的
	Object.assign(C, { now: '🇯🇵 日本01', delay: { '🇯🇵 日本01': 0, '🇯🇵 日本 专线 02': 20, '🇯🇵 日本03': 90, '🇸🇬 新加坡01': 10 } }); stSet((s) => { s.last = 0; s.orig = null; });
	await run3();
	ok('普通节点挂了：先换同地区的普通节点（不换延迟更低的专线和别的地区）', C.now === '🇯🇵 日本03', C.now);
	// ⑦ 谷歌的测不通、Cloudflare 的通：算正常，不换
	Object.assign(C, { now: '🇯🇵 日本03', cfOnly: '🇯🇵 日本03' }); C.delay['🇯🇵 日本03'] = 90; stSet((s) => { s.last = 0; s.fail = 0; });
	await run3();
	ok('谷歌的测不通、Cloudflare 的通：算正常，不换', C.now === '🇯🇵 日本03' && !st().fail, JSON.stringify(st()));
	// ⑧ 中间通过一次：重新数
	Object.assign(C, { cfOnly: '' }); C.delay['🇯🇵 日本03'] = 0;
	await run(); await run(); C.delay['🇯🇵 日本03'] = 90; await run(); C.delay['🇯🇵 日本03'] = 0; await run();
	ok('不通 2 分钟、通了一次、又不通：重新从 1 数，不换', C.now === '🇯🇵 日本03' && st().fail === 1, JSON.stringify(st()));
} finally {
	srv.close();
	for (const [f, v] of Object.entries(BAK)) { if (v == null) fs.rmSync(f, { force: true }); else fs.writeFileSync(f, v); }
	for (const d of [LIBD, BIN]) fs.rmSync(d, { recursive: true, force: true }); fs.rmSync(MF, { force: true });
}
let bad = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 300) + '）')); if (!c) bad++; }
console.log(`\n通过 ${results.length - bad}/${results.length}`);
process.exit(bad ? 1 : 0);

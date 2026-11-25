// 6.0 第 84、87 项：设备换图标（跟名字分开存）、删离线设备（相关设置一起删、一键清除时有设置的跳过）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_dev.mjs（在 cloud 目录里运行）
// 会写 /tmp/dhcp.leases 和 /etc/claude-mcp/{pause,blacklist}.json（测试机上用，跑完还原）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpdev-'));
fs.writeFileSync(D + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30) }));
const BAK = {}, F = ['/tmp/dhcp.leases', '/etc/claude-mcp/pause.json', '/etc/claude-mcp/blacklist.json'];
for (const f of F) BAK[f] = fs.existsSync(f) ? fs.readFileSync(f) : null;
fs.mkdirSync('/etc/claude-mcp', { recursive: true });
const T = Math.floor(Date.now() / 1000) + 3600;
// 三台只在 DHCP 记录里、ARP 里没有的设备（都算离线）
fs.writeFileSync('/tmp/dhcp.leases', [`${T} aa:00:00:00:00:01 10.77.0.11 iPhone *`, `${T} aa:00:00:00:00:02 10.77.0.12 kid-pad *`, `${T} aa:00:00:00:00:03 10.77.0.13 old-pc *`, `${T} aa:00:00:00:00:04 10.77.0.14 tv *`].join('\n') + '\n');
fs.writeFileSync('/etc/claude-mcp/pause.json', JSON.stringify({ 'aa:00:00:00:00:02': { name: 'kid-pad', sched: [{ from: '22:00', to: '07:00' }] } }));
fs.writeFileSync('/etc/claude-mcp/blacklist.json', '[]');
const cgi = (method, params) => new Promise((z) => {
	const msg = { jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' }, body = JSON.stringify(msg);
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: D + '/config.json', PATH_INFO: '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_SBIN: '/nonexistent' } });
	let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const devs = async () => ((await cgi('devices')).result || {}).devices || [];
const by = (l, m) => l.find((d) => d.mac === m);
const DN = () => JSON.parse(fs.readFileSync(D + '/devnames.json', 'utf8'));
try {
	let l = await devs();
	ok('读到 4 台离线设备', ['01', '02', '03', '04'].every((x) => by(l, 'aa:00:00:00:00:' + x) && !by(l, 'aa:00:00:00:00:' + x).online), JSON.stringify(l).slice(0, 300));
	// ---- 第 84 项：图标 ----
	let r = await cgi('dev_rename', { mac: 'aa:00:00:00:00:01', icon: 'phone' });
	ok('只换图标', r.result && r.result.icon === 'phone' && r.result.name === null, JSON.stringify(r));
	l = await devs();
	ok('列表里带上自己选的图标；只换图标不算改了名字', by(l, 'aa:00:00:00:00:01').icon === 'phone' && by(l, 'aa:00:00:00:00:01').renamed === false && by(l, 'aa:00:00:00:00:01').name === 'iPhone');
	await cgi('dev_rename', { mac: 'aa:00:00:00:00:01', name: '妈妈的手机' });
	l = await devs();
	ok('只改名字时图标还在', by(l, 'aa:00:00:00:00:01').icon === 'phone' && by(l, 'aa:00:00:00:00:01').name === '妈妈的手机' && by(l, 'aa:00:00:00:00:01').renamed === true);
	r = await cgi('dev_rename', { mac: 'aa:00:00:00:00:01', icon: 'rocket' });
	ok('不认识的图标不让存', !!r.error && DN()['aa:00:00:00:00:01'].icon === 'phone', JSON.stringify(r));
	await cgi('dev_rename', { mac: 'aa:00:00:00:00:01', name: '' });
	ok('名字改回原名，图标照样留着', DN()['aa:00:00:00:00:01'].icon === 'phone' && !('name' in DN()['aa:00:00:00:00:01']));
	await cgi('dev_rename', { mac: 'aa:00:00:00:00:01', icon: '' });
	ok('图标也改回自动认，记录整条删掉', !('aa:00:00:00:00:01' in DN()));
	await cgi('dev_rename', { mac: 'aa:00:00:00:00:01' });
	ok('老面板只传 mac（没有 name）：当作改回原名，不出错', !('aa:00:00:00:00:01' in DN()));
	// 用照片当图标
	const IMG = 'data:image/webp;base64,' + 'A'.repeat(4000);
	r = await cgi('dev_rename', { mac: 'aa:00:00:00:00:03', img: IMG });
	ok('传照片：存成单独的文件，列表里只带版本号', r.result && r.result.img > 0 && fs.existsSync(D + '/devimg/aa0000000003.txt') && by(await devs(), 'aa:00:00:00:00:03').img === r.result.img, JSON.stringify(r).slice(0, 200));
	r = await cgi('dev_imgs', { macs: ['aa:00:00:00:00:03', 'aa:00:00:00:00:01', 'bad'] });
	ok('按 MAC 取照片，没照片的不返回', r.result && r.result.imgs['aa:00:00:00:00:03'] === IMG && Object.keys(r.result.imgs).length === 1);
	r = await cgi('dev_rename', { mac: 'aa:00:00:00:00:03', img: 'data:text/html;base64,PHNjcmlwdD4=' });
	ok('不是图片的不让存', !!r.error && fs.readFileSync(D + '/devimg/aa0000000003.txt', 'utf8') === IMG);
	r = await cgi('dev_rename', { mac: 'aa:00:00:00:00:03', img: 'data:image/jpeg;base64,' + 'A'.repeat(50000) });
	ok('太大的照片不让存', !!r.error);
	await cgi('dev_rename', { mac: 'aa:00:00:00:00:03', icon: 'pc' });
	ok('改选内置图标：照片删掉', !fs.existsSync(D + '/devimg/aa0000000003.txt') && DN()['aa:00:00:00:00:03'].icon === 'pc' && !DN()['aa:00:00:00:00:03'].img);
	await cgi('dev_rename', { mac: 'aa:00:00:00:00:03', icon: '' });
	await cgi('dev_rename', { mac: 'aa:00:00:00:00:03', img: IMG });
	// ---- 第 87 项：删离线设备 ----
	await cgi('dev_rename', { mac: 'aa:00:00:00:00:04', name: '客厅电视' });
	r = await cgi('dev_forget', { items: ['01', '02', '03', '04'].map((x) => ({ mac: 'aa:00:00:00:00:' + x })), only_plain: true });
	ok('一键清除：没设置的删掉，有暂停 / 定时断网、改过名字、设了照片的跳过', r.result && r.result.n === 1 && r.result.skip.set === 3, JSON.stringify(r));
	l = await devs();
	ok('删掉的设备不在列表里了', !by(l, 'aa:00:00:00:00:01') && by(l, 'aa:00:00:00:00:03') && by(l, 'aa:00:00:00:00:02') && by(l, 'aa:00:00:00:00:04'), l.map((d) => d.mac).join());
	ok('定时断网的设置没被动', !!JSON.parse(fs.readFileSync('/etc/claude-mcp/pause.json', 'utf8'))['aa:00:00:00:00:02']);
	r = await cgi('dev_forget', { items: [{ mac: 'aa:00:00:00:00:02' }, { mac: 'aa:00:00:00:00:03' }, { mac: 'aa:00:00:00:00:04' }] });
	ok('单独删：有设置的也删', r.result && r.result.n === 3, JSON.stringify(r));
	ok('它的照片一起删了', !fs.existsSync(D + '/devimg/aa0000000003.txt'));
	ok('它的定时断网一起删了', !JSON.parse(fs.readFileSync('/etc/claude-mcp/pause.json', 'utf8'))['aa:00:00:00:00:02']);
	ok('它改的名字一起删了', !('aa:00:00:00:00:04' in DN()));
	{ const x = await devs(); ok('列表里这 4 台都没了', !x.some((d) => /^aa:00:00:00:00:0/.test(d.mac || '')), JSON.stringify(x)); }
	r = await cgi('dev_forget', { items: [{ mac: 'aa:00:00:00:00:09' }] });
	ok('列表里没有的设备：不算删，不出错', r.result && r.result.n === 0, JSON.stringify(r));
	r = await cgi('dev_forget', { items: [] });
	ok('没传设备：报错', !!r.error);
	// 30 天前删的记录自动清掉
	const H = JSON.parse(fs.readFileSync(D + '/devhide.json', 'utf8'));
	H['aa:00:00:00:00:03'] = Math.floor(Date.now() / 1000) - 31 * 86400; fs.writeFileSync(D + '/devhide.json', JSON.stringify(H));
	l = await devs();
	ok('删过 30 天以上的记录清掉，设备（DHCP 里还有的话）重新出现', !!by(l, 'aa:00:00:00:00:03') && !('aa:00:00:00:00:03' in JSON.parse(fs.readFileSync(D + '/devhide.json', 'utf8'))));
} finally {
	for (const f of F) { if (BAK[f] == null) fs.rmSync(f, { force: true }); else fs.writeFileSync(f, BAK[f]); }
	fs.rmSync(D, { recursive: true, force: true });
}
let bad = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + note + '）')); if (!c) bad++; }
console.log(`\n通过 ${results.length - bad}/${results.length}`);
process.exit(bad ? 1 : 0);

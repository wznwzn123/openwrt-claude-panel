// 6.0 第 29 项（路由器）：搬家——旧路由器打包（加密，官网只拿到密文）→ 新路由器输搬家码，先看要搬什么，确认后写入并生效；
// 按 IP 生效的换成新路由器分的 IP；钥匙不对解不开；只有主账号、只有托管版
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_move.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpmv-')), HUBD = T + '/hub';
fs.mkdirSync(HUBD);
// 假的官网（另一个进程）：放 / 拿搬家包，记下收到的东西
const srv = spawn(process.execPath, ['-e', `const http=require('http'),fs=require('fs');const D=${JSON.stringify(HUBD)};http.createServer((q,s)=>{let b='';q.on('data',x=>b+=x);q.on('end',()=>{const j=JSON.parse(b||'{}');fs.appendFileSync(D+'/log',q.url+' '+JSON.stringify(j)+'\\n');s.setHeader('content-type','application/json');
if(q.url==='/api/dev/move_put'){fs.writeFileSync(D+'/blob',j.blob);return s.end(JSON.stringify({ok:true,id:'abcd2345',exp:Date.now()+864e5}));}
if(q.url==='/api/dev/move_get'){if(j.id!=='abcd2345')return s.end(JSON.stringify({error:'搬家码不对或者过期了'}));return s.end(JSON.stringify({ok:true,blob:fs.readFileSync(D+'/blob','utf8'),fromName:'旧路由器'}));}
if(q.url==='/api/dev/move_done')return s.end(JSON.stringify({ok:true,fam:2}));s.end('{}');});}).listen(8764,'127.0.0.1',()=>console.log('up'));`]);
await new Promise((z) => srv.stdout.once('data', z));
const LKF = '/etc/claude-mcp/local.key', LK0 = fs.existsSync(LKF);
if (!LK0) { fs.mkdirSync('/etc/claude-mcp', { recursive: true }); fs.writeFileSync(LKF, 'k'.repeat(40) + '\n'); }
const LK = fs.readFileSync(LKF, 'utf8').trim();
const BKC = T + '/bkc';
fs.writeFileSync(BKC, `#!/bin/sh\nexec sh -c "${UC.replace(/"/g, '\\"')} ${path.resolve('../src/bin/cmcp-bkcrypt')} \\"\\$@\\"" -- "$@"\n`, { mode: 0o755 });
function router(name, files) {
	const E = T + '/' + name, CFG = E + '/config';
	fs.mkdirSync(CFG, { recursive: true });
	fs.writeFileSync(E + '/hub.conf', 'HUB=http://127.0.0.1:8764\nSUB=' + name.padEnd(8, 'x') + '\n');
	fs.writeFileSync(E + '/cloud.conf', 'RKEY=' + 'r'.repeat(40) + '\nPKEY=p\n');
	fs.writeFileSync(E + '/config.json', JSON.stringify({ token: 'tok' + 'm'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
	for (const [f, c] of Object.entries(files)) fs.writeFileSync(f.startsWith('cfg/') ? CFG + '/' + f.slice(4) : E + '/' + f, c);
	return E;
}
const cgi = (E, method, params) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel', dev: 'local.' + LK });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/tok' + 'm'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_MV_CRYPT: BKC, CMCP_SBIN: T, CMCP_SP_KIND: 'none', NO_PROXY: '*', no_proxy: '*' } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const err = (r) => r.error?.message || '';
try {
	const OLD = router('oldrtr', {
		'devnames.json': JSON.stringify({ 'aa:aa:aa:aa:aa:01': { name: '孩子的平板' } }), 'pause.json': JSON.stringify({ 'aa:aa:aa:aa:aa:01': { plan: 1 } }),
		'blacklist.json': JSON.stringify([{ mac: 'aa:aa:aa:aa:aa:02', ip: '192.168.1.50', name: '电视' }]), 'off.daily': '', 'on.ipchange': '',
		'cfg/network': "config interface 'lan'\n\toption ipaddr '192.168.1.1'\n\nconfig interface 'wan'\n\toption proto 'pppoe'\n",
		'cfg/wireless': "config wifi-iface 'a'\n\toption mode 'ap'\n\toption ssid 'MyHome'\n\toption key 'secret-wifi-pass'\n",
	});
	const NEW = router('newrtr', { 'cfg/dhcp': "config host\n\toption mac 'aa:aa:aa:aa:aa:02'\n\toption ip '10.0.0.88'\n", 'cfg/network': "config interface 'lan'\n\toption ipaddr '10.0.0.1'\n", 'off.weekly': '' });
	let r = await cgi(OLD, 'move_out');
	const code = r.result?.code;
	ok('旧路由器打包：给搬家码（编号-钥匙），列出搬了什么', /^abcd2345-[0-9a-f]{32}$/.test(code || '') && r.result.items.includes('设备名字和图标') && r.result.items.includes('不走代理的设备'), JSON.stringify(r).slice(0, 300));
	const blob = fs.readFileSync(HUBD + '/blob', 'utf8');
	ok('官网拿到的是密文：看不到设备名、Wi-Fi 名、钥匙', /^[0-9a-f]+$/.test(blob) && !blob.includes(Buffer.from('孩子的平板').toString('hex')) && !blob.includes(Buffer.from('MyHome').toString('hex')) && !fs.readFileSync(HUBD + '/log', 'utf8').includes(code.split('-')[1]));
	ok('搬家码格式不对', /搬家码不对/.test(err(await cgi(NEW, 'move_in', { code: 'xyz' }))));
	ok('钥匙不对：解不开', /钥匙对不上/.test(err(await cgi(NEW, 'move_in', { code: 'abcd2345-' + '0'.repeat(32) }))));
	r = await cgi(NEW, 'move_in', { code });
	ok('先看：从哪台、搬什么、旧路由器的网络设置（只给看）', r.result?.from === '旧路由器' && r.result.items.length === 3 && JSON.stringify(r.result.net.wifi) === '["MyHome"]' && r.result.net.lan === '192.168.1.1' && r.result.net.wan === 'pppoe' && r.result.here.lan === '10.0.0.1' && !JSON.stringify(r).includes('secret-wifi-pass'), JSON.stringify(r.result).slice(0, 400));
	ok('只看不写', !fs.existsSync(NEW + '/devnames.json'));
	r = await cgi(NEW, 'move_in', { code: code.toUpperCase(), apply: true });
	ok('确认后写入：设备名字、暂停计划都搬过来', r.result?.ok && JSON.parse(fs.readFileSync(NEW + '/devnames.json', 'utf8'))['aa:aa:aa:aa:aa:01'].name === '孩子的平板' && fs.existsSync(NEW + '/pause.json'), JSON.stringify(r).slice(0, 300));
	ok('特色功能开关跟旧路由器一样（关的关、开的开）', fs.existsSync(NEW + '/off.daily') && !fs.existsSync(NEW + '/off.weekly') && fs.existsSync(NEW + '/on.ipchange'));
	ok('不走代理：换成新路由器给这台设备的 IP', JSON.parse(fs.readFileSync(NEW + '/blacklist.json', 'utf8'))[0].ip === '10.0.0.88');
	ok('家人一起转（官网那边做）', r.result.fam === 2 && /move_done.*"fam":true/.test(fs.readFileSync(HUBD + '/log', 'utf8')));
	ok('网络设置不自动改', fs.readFileSync(NEW + '/config/network', 'utf8').includes("10.0.0.1"));
	fs.unlinkSync(NEW + '/hub.conf');
	ok('自建版：说用云端备份还原', /自建版/.test(err(await cgi(NEW, 'move_out'))));
	const fam = fs.readFileSync('../src/mcp/26-backup.uc', 'utf8');
	ok('只有主账号能用（不在任何权限组里）', !/'move_(in|out)'/.test(fam));
} finally {
	srv.kill(); fs.rmSync(T, { recursive: true, force: true }); if (!LK0) fs.rmSync(LKF, { force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

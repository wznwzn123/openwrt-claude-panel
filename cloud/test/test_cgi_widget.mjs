// 6.0 第 38 项（路由器）：桌面小组件——面板里发一把小组件钥匙；/widget 地址只能拿网速、在线设备数、路由器名字；
// 别的方法、钥匙不对都不行；列在「登录着的设备」里，移除就失效；「让其他手机都退出」一起失效
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_widget.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpwd-')), CFG = E + '/config';
fs.mkdirSync(CFG, { recursive: true });
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: 'tok' + 'd'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
const LKF = '/etc/claude-mcp/local.key', LK0 = fs.existsSync(LKF);
if (!LK0) { fs.mkdirSync('/etc/claude-mcp', { recursive: true }); fs.writeFileSync(LKF, 'k'.repeat(40) + '\n'); }
const LK = fs.readFileSync(LKF, 'utf8').trim();
const SUDO = 's'.repeat(24), SUDOF = '/tmp/cmcp_sudo.json', SUDO0 = fs.existsSync(SUDOF) ? fs.readFileSync(SUDOF) : null;
fs.writeFileSync(SUDOF, JSON.stringify({ [SUDO]: { exp: Math.floor(Date.now() / 1000) + 600, dev: '', kind: 'local' } }));
const cgi = (method, params, pi) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel', dev: 'local.' + LK });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: pi || '/tok' + 'd'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)) } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const err = (r) => r.error?.message || '';
try {
	let r = await cgi('widget_new');
	const k = r.result?.k;
	ok('发一把小组件钥匙（编号.密钥），带路由器名字', /^[a-z0-9]{8}\.[a-z0-9]{32}$/.test(k || '') && typeof r.result.name === 'string', JSON.stringify(r));
	r = await cgi('widget', { k }, '/widget');
	ok('小组件地址：拿到网速、在线设备数、名字', r.result && 'rx' in r.result && 'tx' in r.result && 'n' in r.result && r.result.name && r.result.t > 0, JSON.stringify(r));
	ok('只回这几样', Object.keys(r.result || {}).sort().join() === 'n,name,rx,t,tx');
	ok('钥匙不对：失效了', /失效了/.test(err(await cgi('widget', { k: k.slice(0, 9) + 'x'.repeat(32) }, '/widget'))));
	ok('小组件地址不能调别的', /not found/.test(err(await cgi('overview', { k }, '/widget'))) && /not found/.test(err(await cgi('widget_new', {}, '/widget'))));
	// 登录着的设备
	r = await cgi('device_list', { sudo: SUDO });
	const it = (r.result?.list || []).find((x) => x.kind === 'widget');
	ok('列在「登录着的设备」里', it && /^w:[a-z0-9]{8}$/.test(it.id) && /桌面小组件/.test(it.name) && it.seen > 0, JSON.stringify(r.result));
	ok('移除要先确认本人', /确认是你本人/.test(err(await cgi('device_remove', { id: it.id }))));
	r = await cgi('device_remove', { id: it.id, sudo: SUDO });
	ok('移除：小组件就失效', r.result?.ok && /失效了/.test(err(await cgi('widget', { k }, '/widget'))));
	const k2 = (await cgi('widget_new')).result.k;
	await cgi('device_remove', { all_others: true, sudo: SUDO });
	ok('让其他手机都退出：小组件一起失效', /失效了/.test(err(await cgi('widget', { k: k2 }, '/widget'))));
	for (let i = 0; i < 5; i++) await cgi('widget_new');
	ok('最多 5 个', /最多加 5 个/.test(err(await cgi('widget_new'))));
	const fam = fs.readFileSync('../src/mcp/26-backup.uc', 'utf8');
	ok('家人也能加（在「看」的权限里）', /view: \[[^\]]*'widget_new'/.test(fam));
} finally {
	fs.rmSync(E, { recursive: true, force: true }); if (!LK0) fs.rmSync(LKF, { force: true });
	if (SUDO0) fs.writeFileSync(SUDOF, SUDO0); else fs.rmSync(SUDOF, { force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

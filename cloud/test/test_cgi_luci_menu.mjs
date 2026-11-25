// 原版页面菜单（panel/luci_menu）：直接运行 LuCI 的 CGI 读菜单，不依赖 curl、不管后台端口；
// 新版 LuCI（认 sysauth_https）和 21.02 及更早（只认 sysauth）都能读；临时会话读完就退出
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_luci_menu.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const mk = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const E = mk('cmcplm-'), BIN = mk('cmcplmbin-');
fs.mkdirSync(E + '/sess');
// 假 ubus 会话
fs.writeFileSync(BIN + '/ubus', `#!/usr/bin/env node
const fs = require('fs'), a = process.argv.slice(2), D = ${JSON.stringify(E)};
if (a[0] !== 'call' || a[1] !== 'session') process.exit(1);
const p = JSON.parse(a[3] || '{}'), f = (s) => D + '/sess/' + s;
fs.appendFileSync(D + '/ubus.log', a[2] + ' ' + (p.username || p.ubus_rpc_session || '') + '\\n');
if (a[2] === 'login') { if (!(p.username === 'cmcp' && p.password === 'luci-pass-x')) process.exit(6); const s = require('crypto').randomBytes(16).toString('hex'); fs.writeFileSync(f(s), JSON.stringify({ values: {} })); console.log(JSON.stringify({ ubus_rpc_session: s })); process.exit(0); }
if (a[2] === 'set') { const o = JSON.parse(fs.readFileSync(f(p.ubus_rpc_session))); Object.assign(o.values, p.values); fs.writeFileSync(f(p.ubus_rpc_session), JSON.stringify(o)); process.exit(0); }
if (a[2] === 'destroy') { try { fs.rmSync(f(p.ubus_rpc_session)); } catch (e) {} process.exit(0); }
`, { mode: 0o755 });
// 假 LuCI：mode=new 只认 sysauth_https，mode=old 只认 sysauth；会话要有 token、username=root
const MENU = { children: { admin: { children: { network: { title: 'Network', order: 50, children: { wireless: { title: 'Wireless', order: 10 } } }, services: { title: 'Services', order: 40, children: { foo: { title: 'Foo Plugin', order: 1 } } } } } } };
const luci = (mode, lf) => `#!/usr/bin/env node
const fs = require('fs'), D = ${JSON.stringify(E)};
const ck = Object.fromEntries((process.env.HTTP_COOKIE || '').split(';').map((x) => x.trim().split('=')));
const sid = ${mode === 'old' ? 'ck.sysauth' : "process.env.HTTPS === 'on' ? ck.sysauth_https : ck.sysauth_http"};
let s = null; try { s = JSON.parse(fs.readFileSync(D + '/sess/' + sid)); } catch (e) {}
fs.writeFileSync(D + '/luci.env', JSON.stringify({ path: process.env.PATH_INFO, method: process.env.REQUEST_METHOD }));
if (!s || !s.values.token || s.values.username !== 'root') { process.stdout.write('Status: 403 Forbidden${lf}Content-Type: text/html${lf}${lf}<html>login</html>'); process.exit(0); }
if (process.env.PATH_INFO !== '/admin/menu') { process.stdout.write('Status: 404${lf}${lf}'); process.exit(0); }
process.stdout.write('Status: 200 OK${lf}Content-Type: application/json${lf}${lf}' + ${JSON.stringify(JSON.stringify(MENU))});
`;
fs.writeFileSync(E + '/luci_pass', 'luci-pass-x');
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30) }));
const call = (cgiPath) => new Promise((z) => {
	try { fs.rmSync('/tmp/cmcp_menu_list.json'); } catch (e) {}
	const msg = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/luci_menu', params: { force: true }, client: 'panel' });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, PATH: BIN + ':' + process.env.PATH, CLAUDE_MCP_CONF: E + '/config.json', CMCP_LUCI_CGI: cgiPath, PATH_INFO: '/' + 'tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(msg)) } });
	let out = ''; p.stdout.on('data', (d) => (out += d)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(msg);
});
const sessLeft = () => fs.readdirSync(E + '/sess').length;
for (const [mode, lf, name] of [['new', '\\r\\n', '新版 LuCI（sysauth_https）'], ['old', '\\r\\n', '21.02 及更早（只认 sysauth）'], ['new', '\\n', '响应头只用 LF 换行']]) {
	fs.writeFileSync(E + '/luci-' + mode, luci(mode, lf), { mode: 0o755 });
	const r = await call(E + '/luci-' + mode);
	const its = r.result?.items || [];
	ok(name + '：读到菜单', its.some((x) => x.p === 'admin/network/wireless') && its.some((x) => x.p === 'admin/services/foo'), JSON.stringify(r).slice(0, 300));
	ok(name + '：临时会话读完就退出', sessLeft() === 0, String(sessLeft()));
}
ok('直接运行 CGI 读 /admin/menu（GET）', JSON.parse(fs.readFileSync(E + '/luci.env', 'utf8')).path === '/admin/menu');
// 菜单读不到（比如 19.07 没有 /admin/menu）：报错，不卡住，会话照样退出
fs.writeFileSync(E + '/luci-404', '#!/bin/sh\nprintf "Status: 404 Not Found\\r\\n\\r\\n<html>nope</html>"\n', { mode: 0o755 });
let r = await call(E + '/luci-404');
ok('读不到菜单：说清楚，会话退出', /读不到 LuCI 的菜单/.test(r.error?.message || '') && sessLeft() === 0, JSON.stringify(r).slice(0, 200));
// 没装 LuCI
r = await call(E + '/no-such-luci');
ok('没装 LuCI：说清楚', /读不到 LuCI 的菜单/.test(r.error?.message || '') && sessLeft() === 0, JSON.stringify(r).slice(0, 200));
ok('不再用 curl', !/curl[^\n]*admin\/menu/.test(fs.readFileSync('../src/mcp/25-traffic-speed.uc', 'utf8')));
try { fs.rmSync('/tmp/cmcp_menu_list.json'); } catch (e) {}
fs.rmSync(E, { recursive: true, force: true }); fs.rmSync(BIN, { recursive: true, force: true });
let pass = 0; for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '  ' + (note || ''))); if (c) pass++; }
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

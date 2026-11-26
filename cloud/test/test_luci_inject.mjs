// 6.0 第 36 项：luci-gate 给 GET 打开的 LuCI 网页插 lfx.js（在外面把「路由器:其他端口」交给远程页面）；下载的文件、POST 原样不动
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcplg-')), BIN = E + '/bin';
fs.mkdirSync(BIN);
fs.writeFileSync(E + '/luci_key', 'K'.repeat(32));
fs.writeFileSync(BIN + '/ubus', '#!/bin/sh\n[ "$1 $2 $3" = "call session get" ] && echo \'{"values":{"token":"t"}}\'\n', { mode: 0o755 });
// 假的 LuCI：按 LG 输出网页、二进制下载
fs.writeFileSync(E + '/real-luci', `#!/bin/sh
case "$LG" in
html) printf 'Status: 200 OK\\r\\nContent-Type: text/html; charset=UTF-8\\r\\n\\r\\n<!DOCTYPE html>\\n<html lang="zh">\\n<head data-x="1">\\n<title>LuCI</title></head>\\n<body><head>不是这里</head></body></html>\\n' ;;
bin) printf 'Status: 200 OK\\r\\nContent-Type: application/x-targz\\r\\n\\r\\n'; printf '\\037\\213\\010\\000<head>\\000\\377' ;;
post) printf 'Status: 200 OK\\r\\nContent-Type: text/html\\r\\n\\r\\n<head>posted %s</head>' "$(cat)" ;;
esac
`, { mode: 0o755 });
const gate = E + '/luci';
fs.writeFileSync(gate, fs.readFileSync(path.resolve('../src/etc/luci-gate'), 'utf8').replaceAll('/etc/claude-mcp/', E + '/').replaceAll('/www/cgi-bin/luci', E + '/real-luci'), { mode: 0o755 });
const run = (lg, method = 'GET', input = '') => spawnSync('sh', [gate], { input, env: { ...process.env, PATH: BIN + ':' + process.env.PATH, LG: lg, REQUEST_METHOD: method, HTTP_COOKIE: 'cmcp_l=' + 'K'.repeat(32) + '; sysauth_https=' + 'a'.repeat(32) } }).stdout;
try {
	let o = run('html').toString();
	ok('网页：在第一个 <head> 后面插 lfx.js（只插一次）', o.includes('<head data-x="1"><script src="/panel/lfx.js"></script>') && (o.match(/lfx\.js/g) || []).length === 1 && o.includes('<title>LuCI</title>'), o);
	ok('响应头原样', o.startsWith('Status: 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n'));
	const b = run('bin');
	const want = Buffer.concat([Buffer.from('Status: 200 OK\r\nContent-Type: application/x-targz\r\n\r\n'), Buffer.from([0x1f, 0x8b, 8, 0]), Buffer.from('<head>'), Buffer.from([0, 0xff])]);
	ok('下载的文件（不是网页）：一个字节都不改', b.equals(want), b.toString('hex'));
	o = run('post', 'POST', 'a=1').toString();
	ok('POST：原样交给 LuCI（不插）', o.includes('<head>posted a=1</head>') && !o.includes('lfx.js'), o);
	ok('不留临时文件', !fs.readdirSync('/tmp').some((f) => /^cmcp_lg\./.test(f)));
} finally {
	fs.rmSync(E, { recursive: true, force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + JSON.stringify(String(note).slice(0, 300)))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

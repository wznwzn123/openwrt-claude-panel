// 热补丁（cmcp-hot，用户 11/26：全程静默）：问官网 → 下载 → 验签 → 只认白名单文件 → 备份 → 替换 → 自检，不行全部退回
// 在 cloud 目录里运行：node test/test_hot.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { spawn, spawnSync, execFileSync } from 'child_process';
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcphot-')), R = E + '/root', BIN = E + '/bin', SRV = E + '/srv';
for (const d of [R + '/etc/claude-mcp', R + '/www-claude-mcp/panel', R + '/www-claude-mcp/cgi-bin', R + '/usr/sbin', BIN, SRV]) fs.mkdirSync(d, { recursive: true });
// 假的 jsonfilter（-e '@.键' [-i 文件]），假的验签（看 VERIFY_OK）
fs.writeFileSync(BIN + '/jsonfilter', `#!/usr/bin/env node
const a = process.argv.slice(2); let f = null, e = '';
for (let i = 0; i < a.length; i++) { if (a[i] === '-i') f = a[++i]; else if (a[i] === '-e') e = a[++i]; }
const s = f ? require('fs').readFileSync(f, 'utf8') : require('fs').readFileSync(0, 'utf8');
let o; try { o = JSON.parse(s); } catch (x) { process.exit(1); }
const v = o[e.replace(/^@\\./, '')]; if (v === undefined || v === null) process.exit(1); console.log(v);
`, { mode: 0o755 });
fs.writeFileSync(BIN + '/verify', '#!/bin/sh\n[ "$VERIFY_OK" = 1 ]\n', { mode: 0o755 });
const V = (s) => fs.writeFileSync(R + '/etc/claude-mcp/version', s);
V('VER=6.0.0\nCODE=hosted-ai\n');
fs.writeFileSync(R + '/www-claude-mcp/panel/index.html', 'OLD PANEL');
fs.writeFileSync(R + '/www-claude-mcp/cgi-bin/mcp', 'OLD CGI');
fs.writeFileSync(R + '/usr/sbin/cmcp-daily', 'OLD DAILY');
// 做一个补丁包：hot.json + root/文件
function mkhot(base, n, files) {
	const d = fs.mkdtempSync(path.join(E, 'p-'));
	fs.writeFileSync(d + '/hot.json', JSON.stringify({ base, n, notes: '修了订阅页的显示问题' }));
	for (const [p, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(d + '/root/' + p), { recursive: true }); fs.writeFileSync(d + '/root/' + p, c); }
	execFileSync('tar', ['czf', SRV + '/hot.tar.gz', '-C', d, '.']);
	const sum = crypto.createHash('sha256').update(fs.readFileSync(SRV + '/hot.tar.gz')).digest('hex');
	fs.writeFileSync(SRV + '/SHA256SUMS', sum + '  hot.tar.gz\n'); fs.writeFileSync(SRV + '/SHA256SUMS.sig2', 'sig\n');
}
let INFO = { n: 1, tag: 'hot-6.0.0-1', notes: '修了订阅页的显示问题' };
// 假的官网放在另一个进程里（下面用 spawnSync 跑脚本时，这个进程不会回应请求）；补丁信息写在 SRV/info.json
const setInfo = () => fs.writeFileSync(SRV + '/info.json', JSON.stringify(INFO));
setInfo();
const srv = spawn(process.execPath, ['-e', `const http=require('http'),fs=require('fs'),path=require('path');http.createServer((q,s)=>{const u=new URL(q.url,'http://x');const f=${JSON.stringify(SRV)}+'/'+(u.pathname==='/hot'?'info.json':path.basename(u.pathname));if(fs.existsSync(f))return s.end(fs.readFileSync(f));s.statusCode=404;s.end();}).listen(8763,'127.0.0.1',()=>console.log('up'));`]);
await new Promise((z) => srv.stdout.once('data', z));
const run = (env = {}) => spawnSync('sh', [path.resolve('../src/bin/cmcp-hot'), 'check'], { encoding: 'utf8', env: { ...process.env, PATH: BIN + ':' + process.env.PATH, CMCP_ROOT: R, CMCP_HOT_URL: 'http://127.0.0.1:8763/hot', CMCP_HOT_DL: 'http://127.0.0.1:8763/dl', CMCP_VERIFY: BIN + '/verify', CMCP_HOT_CHECK: 'grep -q NEW ' + R + '/www-claude-mcp/panel/index.html', VERIFY_OK: '1', NO_PROXY: '*', ...env } });
const rd = (p) => (fs.existsSync(R + '/' + p) ? fs.readFileSync(R + '/' + p, 'utf8') : null);
const ver = () => rd('etc/claude-mcp/version');
fs.rmSync('/tmp/cmcp_hot.lock', { recursive: true, force: true });
try {
	mkhot('6.0.0', 1, { 'www-claude-mcp/panel/index.html': 'NEW PANEL', 'www-claude-mcp/cgi-bin/mcp': 'NEW CGI', 'usr/sbin/cmcp-weekly2': 'NEW TOOL', 'etc/claude-mcp/remote.json': '{"apps":[]}' });
	run({ VERIFY_OK: '0' });
	ok('签名不对：不装', rd('www-claude-mcp/panel/index.html') === 'OLD PANEL' && !/HOT=/.test(ver()));
	fs.rmSync(R + '/etc/claude-mcp/hot_fail', { force: true });
	run();
	ok('装好：面板、接口、新的小工具、远程数据都换上', rd('www-claude-mcp/panel/index.html') === 'NEW PANEL' && rd('www-claude-mcp/cgi-bin/mcp') === 'NEW CGI' && rd('usr/sbin/cmcp-weekly2') === 'NEW TOOL' && rd('etc/claude-mcp/remote.json') === '{"apps":[]}');
	ok('接口和小工具可以执行', (fs.statSync(R + '/www-claude-mcp/cgi-bin/mcp').mode & 0o111) && (fs.statSync(R + '/usr/sbin/cmcp-weekly2').mode & 0o111));
	ok('记下补丁号（版本号不变）', /^VER=6\.0\.0$/m.test(ver()) && /^HOT=1$/m.test(ver()), ver());
	ok('通知里记一条（不推送）', /"kind":"hot".*面板已自动更新（v6\.0\.0 补丁 1）.*修了订阅页的显示问题/.test(rd('etc/claude-mcp/events.log') || ''));
	ok('不留临时文件', !fs.readdirSync('/tmp').some((f) => /^cmcp_hot\.\d+$/.test(f)) && !fs.existsSync(R + '/www-claude-mcp/panel/index.html.hotnew'));
	fs.writeFileSync(R + '/www-claude-mcp/panel/index.html', 'NEW PANEL keep');
	run();
	ok('同一个补丁不重复装', rd('www-claude-mcp/panel/index.html') === 'NEW PANEL keep');
	// 不允许的文件
	INFO = { n: 2, tag: 'hot-6.0.0-2', notes: 'x' }; setInfo();
	mkhot('6.0.0', 2, { 'www-claude-mcp/panel/index.html': 'NEW2', 'etc/init.d/claude-mcp': 'EVIL' });
	run();
	ok('补丁里有白名单外的文件（开机脚本）：整个不装', rd('www-claude-mcp/panel/index.html') === 'NEW PANEL keep' && !fs.existsSync(R + '/etc/init.d/claude-mcp') && /^HOT=1$/m.test(ver()));
	mkhot('6.0.0', 2, { 'www-claude-mcp/panel/../../etc/x': 'EVIL' });
	run();
	ok('路径里有 ..：不装', !fs.existsSync(R + '/etc/x'));
	// 别的版本的补丁
	mkhot('6.0.1', 2, { 'www-claude-mcp/panel/index.html': 'NEW2' });
	run();
	ok('给别的版本的补丁：不装', rd('www-claude-mcp/panel/index.html') === 'NEW PANEL keep');
	// 自检不过：全部退回（原来没有的文件删掉）
	fs.rmSync(R + '/etc/claude-mcp/hot_fail', { force: true });
	mkhot('6.0.0', 2, { 'www-claude-mcp/panel/index.html': 'BROKEN', 'usr/sbin/cmcp-daily': 'BROKEN DAILY', 'usr/sbin/cmcp-new3': 'X' });
	run();
	ok('装完面板打不开：全部退回原来的，新加的删掉', rd('www-claude-mcp/panel/index.html') === 'NEW PANEL keep' && rd('usr/sbin/cmcp-daily') === 'OLD DAILY' && !fs.existsSync(R + '/usr/sbin/cmcp-new3') && /^HOT=1$/m.test(ver()));
	run(); run();
	const tries = rd('etc/claude-mcp/hot_fail');
	run({ CMCP_HOT_CHECK: 'true' });
	ok('同一个补丁失败 3 次：不再试', /^2=3$/m.test(tries || '') && rd('www-claude-mcp/panel/index.html') === 'NEW PANEL keep', tries);
	// 新的补丁号能装
	INFO = { n: 3, tag: 'hot-6.0.0-3', notes: '加了横幅公告' }; setInfo();
	mkhot('6.0.0', 3, { 'www-claude-mcp/panel/index.html': 'NEW3' });
	run({ CMCP_HOT_CHECK: 'true' });
	ok('下一个补丁照常装', rd('www-claude-mcp/panel/index.html') === 'NEW3' && /^HOT=3$/m.test(ver()));
	INFO = { n: 4, tag: 'evil;rm -rf /', notes: '' }; setInfo();
	run({ CMCP_HOT_CHECK: 'true' });
	ok('官网给的标签格式不对：不下载', /^HOT=3$/m.test(ver()));
} finally {
	srv.kill(); fs.rmSync(E, { recursive: true, force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

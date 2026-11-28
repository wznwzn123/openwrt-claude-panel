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
const v = e.replace(/^@\\./, '').split('.').reduce((x, k) => (x == null ? x : x[k]), o); if (v === undefined || v === null) process.exit(1); console.log(v);
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
// 问补丁的网址记在 SRV/ask.log，报结果（POST /rep）记在 SRV/rep.log
const srv = spawn(process.execPath, ['-e', `const http=require('http'),fs=require('fs'),path=require('path');const D=${JSON.stringify(SRV)};http.createServer((q,s)=>{const u=new URL(q.url,'http://x');if(u.pathname==='/rep'){let b='';q.on('data',(x)=>b+=x);q.on('end',()=>{fs.appendFileSync(D+'/rep.log',b+'\\n');s.end('{"ok":true}');});return;}if(u.pathname==='/hot')fs.appendFileSync(D+'/ask.log',q.url+'\\n');const f=D+'/'+(u.pathname==='/hot'?'info.json':path.basename(u.pathname));if(fs.existsSync(f))return s.end(fs.readFileSync(f));s.statusCode=404;s.end();}).listen(8763,'127.0.0.1',()=>console.log('up'));`]);
await new Promise((z) => srv.stdout.once('data', z));
const run = (env = {}, args = ['check']) => spawnSync('sh', [path.resolve('../src/bin/cmcp-hot'), ...args], { encoding: 'utf8', env: { ...process.env, PATH: BIN + ':' + process.env.PATH, CMCP_ROOT: R, CMCP_HOT_URL: 'http://127.0.0.1:8763/hot', CMCP_HOT_DL: 'http://127.0.0.1:8763/dl', CMCP_HOT_REP: 'http://127.0.0.1:8763/rep', CMCP_POPEN: E + '/popen', CMCP_VERIFY: BIN + '/verify', CMCP_HOT_CHECK: 'grep -q NEW ' + R + '/www-claude-mcp/panel/index.html', VERIFY_OK: '1', NO_PROXY: '*', ...env } });
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
	ok('通知里不记（用户 11/28 18:55：补丁不用通知用户），补丁日志里记着说明', !/"kind":"hot"/.test(rd('etc/claude-mcp/events.log') || '') && /热补丁 1 装好了：修了订阅页的显示问题/.test(fs.readFileSync('/tmp/cmcp_hot.log', 'utf8')));
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
	// 跟一键更新不同时动文件（11/27 全面检查第 1 条）
	const UL = E + '/ulock', SW = E + '/swap';
	INFO = { n: 4, tag: 'hot-6.0.0-4', notes: 'x' }; setInfo();
	mkhot('6.0.0', 4, { 'www-claude-mcp/panel/index.html': 'NEW4' });
	fs.mkdirSync(UL);
	run({ CMCP_HOT_CHECK: 'true', CMCP_ULOCK: UL, CMCP_HOT_SWAP: SW });
	ok('一键更新正在进行（锁不到 15 分钟）：补丁先不装', rd('www-claude-mcp/panel/index.html') === 'NEW3' && /^HOT=3$/m.test(ver()) && !fs.existsSync(SW));
	const old = Date.now() / 1000 - 1000; fs.utimesSync(UL, old, old);
	// 下载验签的时候一键更新装好了新版本（版本号变了）：换文件之前再看一次，不装、也不算失败
	fs.writeFileSync(BIN + '/verify-bump', `#!/bin/sh\nsed -i 's/^VER=.*/VER=6.0.1/' ${R}/etc/claude-mcp/version\n`, { mode: 0o755 });
	run({ CMCP_HOT_CHECK: 'true', CMCP_ULOCK: UL, CMCP_HOT_SWAP: SW, CMCP_VERIFY: BIN + '/verify-bump' });
	ok('装补丁的中途版本变了（一键更新装好了新版本）：不换文件、补丁号不记到新版本上、不算失败', rd('www-claude-mcp/panel/index.html') === 'NEW3' && /^VER=6\.0\.1$/m.test(ver()) && /^HOT=3$/m.test(ver()) && !/^4=/m.test(rd('etc/claude-mcp/hot_fail') || '') && !fs.existsSync(SW), ver());
	V('VER=6.0.0\nCODE=hosted-ai\nHOT=3\n');
	run({ CMCP_HOT_CHECK: 'true', CMCP_ULOCK: UL, CMCP_HOT_SWAP: SW });
	ok('一键更新的锁超过 15 分钟（没清掉的旧锁）：照常装，装完把「正在换」的记号清掉', rd('www-claude-mcp/panel/index.html') === 'NEW4' && /^HOT=4$/m.test(ver()) && !fs.existsSync(SW));
	// 官网拿不到说明（限流时的备用查法）：用补丁包里 hot.json 的说明（11/27 全面检查第 4 条）
	INFO = { n: 5, tag: 'hot-6.0.0-5', notes: '' }; setInfo();
	mkhot('6.0.0', 5, { 'www-claude-mcp/panel/index.html': 'NEW5' });
	run({ CMCP_HOT_CHECK: 'true', CMCP_ULOCK: UL, CMCP_HOT_SWAP: SW });
	ok('官网没给说明：补丁日志里用补丁包里的说明', /^HOT=5$/m.test(ver()) && /热补丁 5 装好了：修了订阅页的显示问题/.test(fs.readFileSync('/tmp/cmcp_hot.log', 'utf8')) && !/"kind":"hot"/.test(rd('etc/claude-mcp/events.log') || ''));
	INFO = { n: 6, tag: 'evil;rm -rf /', notes: '' }; setInfo();
	run({ CMCP_HOT_CHECK: 'true' });
	ok('官网给的标签格式不对：不下载', /^HOT=5$/m.test(ver()));
	// 分批推送和退回（用户 11/28）
	const rl = (f) => (fs.existsSync(SRV + '/' + f) ? fs.readFileSync(SRV + '/' + f, 'utf8').trim().split('\n').filter(Boolean) : []);
	const reps = () => rl('rep.log').map((x) => JSON.parse(x));
	const last = (f) => rl(f).slice(-1)[0] || '';
	ok('问补丁时带上现在第几个（h）；没有兼容上报编号、不是托管版：不带 k / id（最后一批）', /\?v=6\.0\.0&h=5$/.test(last('ask.log')), last('ask.log'));
	ok('装好了报一次成功', reps().some((x) => x.n === 5 && x.ok === 1 && x.v === '6.0.0' && !x.s && !x.id), rl('rep.log').join(' | '));
	ok('装失败报原因（固定的话）', reps().some((x) => x.n === 2 && x.ok === 0 && /装完面板打不开/.test(x.err)), rl('rep.log').join(' | '));
	ok('签名不对也报', reps().some((x) => x.ok === 0 && x.err === '签名不对'));
	// 托管版：k = s:专属网址编号，报结果带路由器钥匙；兼容上报的编号 id 也带上（认尝鲜）
	fs.writeFileSync(R + '/etc/claude-mcp/hub.conf', 'HUB=http://127.0.0.1:8763\nSUB=abcd2345\n');
	fs.writeFileSync(R + '/etc/claude-mcp/cloud.conf', 'RKEY=' + 'R'.repeat(32) + '\n');
	fs.writeFileSync(R + '/etc/claude-mcp/compat_id', 'b2b2b2b2b2b2b2b2\n');
	fs.writeFileSync(R + '/etc/claude-mcp/compat_res.json', JSON.stringify({ beta: { ok: true } }));
	fs.writeFileSync(E + '/popen', '1795800000');
	run({ CMCP_HOT_CHECK: 'true' }, ['check', 'force']);
	ok('托管版：带 k=s:编号、兼容上报的 id；尝鲜通过的带打开面板时间 po；点了「检查更新」带 f=1', /\?v=6\.0\.0&h=5&k=s:abcd2345&id=b2b2b2b2b2b2b2b2&po=1795800000&f=1$/.test(last('ask.log')), last('ask.log'));
	fs.writeFileSync(R + '/etc/claude-mcp/compat_off', '');
	run({ CMCP_HOT_CHECK: 'true' });
	ok('关了兼容上报：不带 id（托管版照样按专属网址编号分批）', /\?v=6\.0\.0&h=5&k=s:abcd2345$/.test(last('ask.log')), last('ask.log'));
	fs.rmSync(R + '/etc/claude-mcp/compat_off');
	// 往回装：官网明说 back 时才装比现在旧的
	INFO = { n: 4, tag: 'hot-6.0.0-4', notes: '' }; setInfo();
	mkhot('6.0.0', 4, { 'www-claude-mcp/panel/index.html': 'NEW4 again' });
	run({ CMCP_HOT_CHECK: 'true' });
	ok('官网给的编号比现在小、没说 back：不装', /^HOT=5$/m.test(ver()) && rd('www-claude-mcp/panel/index.html') === 'NEW5');
	INFO = { n: 4, tag: 'hot-6.0.0-4', notes: '', back: true }; setInfo();
	run({ CMCP_HOT_CHECK: 'true' });
	ok('back：往回装 V4', /^HOT=4$/m.test(ver()) && rd('www-claude-mcp/panel/index.html') === 'NEW4 again', ver());
	ok('退回：通知里不记，补丁日志里记', !/"kind":"hot"/.test(rd('etc/claude-mcp/events.log') || '') && /退回到补丁 4 了/.test(fs.readFileSync('/tmp/cmcp_hot.log', 'utf8')));
	ok('退回装好也报一次（带 back，托管版带钥匙）', reps().some((x) => x.n === 4 && x.ok === 1 && x.back === true && x.s === 'abcd2345' && x.rk === 'R'.repeat(32) && x.id === 'b2b2b2b2b2b2b2b2'), rl('rep.log').slice(-1)[0]);
	// V0：正式版原样
	INFO = { n: 0, tag: 'hot-6.0.0-0', notes: '', back: true }; setInfo();
	mkhot('6.0.0', 0, { 'www-claude-mcp/panel/index.html': 'RELEASE' });
	run({ CMCP_HOT_CHECK: 'true' });
	ok('退回 V0（正式版原样）：补丁号记 0', /^HOT=0$/m.test(ver()) && rd('www-claude-mcp/panel/index.html') === 'RELEASE' && /退回到补丁 0 了/.test(fs.readFileSync('/tmp/cmcp_hot.log', 'utf8')), ver());
	// 只问不装（面板「检查更新」显示「正在安装 Vn…」用）
	INFO = { n: 6, tag: 'hot-6.0.0-6', notes: '' }; setInfo();
	const a = run({}, ['ask', 'force']);
	ok('cmcp-hot ask：打印官网的回复，不装', /"n":6/.test(a.stdout) && /^HOT=0$/m.test(ver()) && /&f=1$/.test(last('ask.log')), a.stdout + ' ' + last('ask.log'));
} finally {
	srv.kill(); fs.rmSync(E, { recursive: true, force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

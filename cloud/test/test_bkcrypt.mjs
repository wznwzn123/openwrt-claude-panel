// 6.0 第 9 项：云端备份一律加密（cmcp-backup + cmcp-bkcrypt）
// 有 openssl 用 AES（CMCPBK1，跟以前一样）；没有就用自带的 ChaCha20 + HMAC-SHA256（CMCPBK2），结果和 Node.js 标准实现逐字节一致；
// 加密不了就不上传；以前没加密的旧备份上传成功后原地换成加密的；面板的后台任务（立即备份、下载、还原）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_bkcrypt.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import nc from 'node:crypto';
import { execSync, spawnSync, spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const HAS_SSL = spawnSync('sh', ['-c', 'command -v openssl']).status === 0;
const SRC = path.resolve('../src/bin');
const mk = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const D = mk('cmcpbk-'), BIN = mk('cmcpbkbin-'), TMP = mk('cmcpbktmp-'), FILES = mk('cmcpbkfiles-');
// 自带加密工具：用测试的 ucode 跑
fs.writeFileSync(BIN + '/bkcrypt', `#!/bin/sh\nexec sh -c "${UC.replace(/"/g, '\\"')} ${SRC}/cmcp-bkcrypt \\"\\$@\\"" -- "$@"\n`, { mode: 0o755 });
// 假的系统命令：sysupgrade -l 列出要备份的文件；jsonfilter（OpenWrt 自带，这里用 Node 模拟）；uci；重启
fs.writeFileSync(FILES + '/wifi', Buffer.concat([Buffer.from('option key secret-wifi-pw\n'), nc.randomBytes(3000)]));
fs.writeFileSync(BIN + '/sysupgrade', `#!/bin/sh\ncase "$1" in -l) echo ${FILES}/wifi ;; -r) tar xzf "$2" -C / && echo restored >> ${TMP}/log ;; esac\n`, { mode: 0o755 });
fs.writeFileSync(BIN + '/uci', '#!/bin/sh\necho testrouter\n', { mode: 0o755 });
fs.writeFileSync(BIN + '/reboot', `#!/bin/sh\necho reboot >> ${TMP}/log\n`, { mode: 0o755 });
fs.writeFileSync(BIN + '/cmcp-watchdog', '#!/bin/sh\nexit 0\n', { mode: 0o755 });
fs.writeFileSync(BIN + '/jsonfilter', `#!/usr/bin/env node
const a = process.argv.slice(2); let s = '', e = '';
for (let i = 0; i < a.length; i++) { if (a[i] === '-s') s = a[++i]; else if (a[i] === '-e') e = a[++i]; }
const j = JSON.parse(s); let m;
if ((m = e.match(/^@\\.list\\[\\*\\]\\.(\\w+)$/))) for (const x of j.list) { if (x[m[1]] !== undefined) console.log(x[m[1]]); }
else if ((m = e.match(/^@\\.list\\[(\\d+)\\]\\.(\\w+)$/))) { const v = j.list[+m[1]]?.[m[2]]; if (v === undefined) process.exit(1); console.log(v); }
`, { mode: 0o755 });

// 假的云端：上传、列表、下载、原地换成加密的
const store = new Map(); let seq = 0; const puts = [];
const srv = http.createServer((req, res) => { const ch = []; req.on('data', (c) => ch.push(c)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), p = u.pathname.split('/').filter(Boolean), body = Buffer.concat(ch);
	const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (p[0] !== 'bk' || p[1] !== 'rk') return J({ error: 'bad key' }, 403);
	if (!p[2] && req.method === 'POST') { const id = 'b' + (++seq); store.set(id, { buf: body, enc: u.searchParams.get('enc') === '1', at: seq }); return J({ ok: true, id, size: body.length, enc: true }); }
	if (!p[2] && req.method === 'GET') return J({ ok: true, list: [...store].reverse().map(([id, v]) => ({ id, size: v.buf.length, ...(v.enc ? { enc: true } : {}) })), max: 10 });
	const b = store.get(p[2]);
	if (!b) return J({ error: 'no' }, 404);
	if (req.method === 'GET') { res.writeHead(200); return res.end(b.buf); }
	if (req.method === 'PUT') { puts.push(p[2]); if (b.enc) return J({ error: '这份已经加密了' }, 400); store.set(p[2], { buf: body, enc: true, at: b.at }); return J({ ok: true }); }
	J({ error: 'bad' }, 400);
}); });
await new Promise((z) => srv.listen(8198, '127.0.0.1', z));
fs.writeFileSync(D + '/cloud.conf', 'URL=http://127.0.0.1:8198\nRKEY=rk\n');
const ENV = (ssl) => ({ ...process.env, BK_DIR: D, BK_PATH: BIN, BK_TMP: TMP, BK_CRYPT: BIN + '/bkcrypt', BK_SSL: ssl ? 'openssl' : 'no-openssl-here', BK_NOTIFY: 'true', BK_REBOOT: BIN + '/reboot', no_proxy: '127.0.0.1', NO_PROXY: '127.0.0.1', http_proxy: '', HTTP_PROXY: '' });
// 要用异步的方式跑：假云端在这个进程里，同步等待会把它卡住
const run = (args, env) => new Promise((z) => { const p = spawn('sh', [SRC + '/cmcp-backup', ...args], { env }); let out = '', err = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d)); p.on('close', (status) => z({ status, stdout: out, stderr: err })); });
const bk = (args, ssl = false) => run(args, ENV(ssl));
const key = () => fs.readFileSync(D + '/bk.key', 'utf8').trim().split('\n');

// 1. 自带加密（没有 openssl）
const plain = nc.randomBytes(200000); fs.writeFileSync(TMP + '/p', plain);
let r = (await bk(['encrypt', TMP + '/p', TMP + '/c']));
ok('[自带] 没有 openssl 也能生成密钥（两行各 64 位十六进制，只有路由器自己能读）', r.status === 0 && key().length === 2 && key().every((k) => /^[0-9a-f]{64}$/.test(k)) && (fs.statSync(D + '/bk.key').mode & 0o777) === 0o600, r.stderr);
const c = fs.readFileSync(TMP + '/c'), nl = c.indexOf(10), [mg, nonce, macv] = c.slice(0, nl).toString().split(' ');
ok('[自带] 加密后是 CMCPBK2 格式（第一行：格式、随机数、校验值）', mg === 'CMCPBK2' && /^[0-9a-f]{24}$/.test(nonce) && /^[0-9a-f]{64}$/.test(macv));
const ct = c.slice(nl + 1), [k1, k2] = key();
const dc = nc.createDecipheriv('chacha20', Buffer.from(k1, 'hex'), Buffer.concat([Buffer.alloc(4), Buffer.from(nonce, 'hex')]));
ok('[自带] 密文和 Node.js 标准 ChaCha20 算的一模一样（能用标准工具解开）', Buffer.concat([dc.update(ct), dc.final()]).equals(plain));
ok('[自带] 校验值和标准 HMAC-SHA256 一模一样', nc.createHmac('sha256', Buffer.from(k2, 'hex')).update(Buffer.from('CMCPBK2 ' + nonce + '\n')).update(ct).digest('hex') === macv);
ok('[自带] 密文里看不到原文', !c.includes(plain.subarray(1000, 1032)));
r = (await bk(['decrypt', TMP + '/c', TMP + '/d']));
ok('[自带] 能解回原样', r.status === 0 && fs.readFileSync(TMP + '/d').equals(plain), r.stdout + r.stderr);
const bad = Buffer.from(c); bad[bad.length - 5] ^= 1; fs.writeFileSync(TMP + '/bad', bad);
ok('[自带] 改过一个字节就校验不过（返回 3），不输出内容', (await bk(['decrypt', TMP + '/bad', TMP + '/d2'])).status === 3 && !fs.existsSync(TMP + '/d2'));
const k0 = fs.readFileSync(D + '/bk.key'); fs.writeFileSync(D + '/bk.key', 'a'.repeat(64) + '\n' + 'b'.repeat(64) + '\n');
ok('[自带] 别的路由器的密钥解不开（返回 3）', (await bk(['decrypt', TMP + '/c', TMP + '/d3'])).status === 3);
fs.writeFileSync(D + '/bk.key', k0, { mode: 0o600 });
fs.writeFileSync(TMP + '/plain.tgz', 'not encrypted');
ok('[自带] 没加密的旧备份认得出来（返回 2）', (await bk(['decrypt', TMP + '/plain.tgz', TMP + '/d4'])).status === 2);
// 空文件、不是 64 整数倍的长度
for (const n of [0, 1, 63, 64, 65, 65537]) { const x = nc.randomBytes(n); fs.writeFileSync(TMP + '/x', x); (await bk(['encrypt', TMP + '/x', TMP + '/xc'])); (await bk(['decrypt', TMP + '/xc', TMP + '/xd'])); if (!fs.readFileSync(TMP + '/xd').equals(x)) ok('[自带] ' + n + ' 字节的文件来回一致', false); }
ok('[自带] 各种长度（0、1、63、64、65、65537 字节）来回都一致', true);

// 2. 有 openssl：照旧用 AES（CMCPBK1）；两种格式互相不影响
if (HAS_SSL) {
	r = (await bk(['encrypt', TMP + '/p', TMP + '/c1'], true));
	ok('[openssl] 有 openssl 时用 AES（CMCPBK1，跟以前一样）', r.status === 0 && fs.readFileSync(TMP + '/c1').subarray(0, 8).toString() === 'CMCPBK1 ');
	ok('[openssl] 能解回原样', (await bk(['decrypt', TMP + '/c1', TMP + '/d1'], true)).status === 0 && fs.readFileSync(TMP + '/d1').equals(plain));
	ok('[openssl] 有 openssl 时，以前自带加密的备份也能解开', (await bk(['decrypt', TMP + '/c', TMP + '/d5'], true)).status === 0 && fs.readFileSync(TMP + '/d5').equals(plain));
	ok('[openssl] openssl 后来没了：AES 加密的备份说明要装 openssl（返回 4）', (await bk(['decrypt', TMP + '/c1', TMP + '/d6'])).status === 4);
} else ok('[openssl] 本机没有 openssl，跳过 AES 部分', true);

// 3. 上传：一律加密；以前没加密的旧备份原地换成加密的
store.set('old1', { buf: fs.readFileSync(TMP + '/p'), enc: false, at: 0 }); // 以前没加密的
fs.writeFileSync(D + '/bk.noenc', '1'); // 以前「关掉加密上传」的标记
r = (await bk(['manual']));
const up = [...store].find(([id]) => id.startsWith('b'))?.[1];
ok('[上传] 「立即备份」成功', r.status === 0 && /"ok":true/.test(r.stdout), r.stdout + r.stderr);
ok('[上传] 上传的是密文（标了加密），看不到 Wi-Fi 密码', up && up.enc && up.buf.subarray(0, 8).toString() === 'CMCPBK2 ' && !up.buf.includes('secret-wifi-pw'));
ok('[上传] 以前「关掉加密上传」的设置不再起作用，标记删掉', !fs.existsSync(D + '/bk.noenc'));
for (let i = 0; i < 60 && !(store.get('old1').enc); i++) await W(500);
ok('[旧备份] 以前没加密的旧备份，原地换成加密的（编号不变）', store.get('old1').enc && store.get('old1').buf.subarray(0, 8).toString() === 'CMCPBK2 ' && puts.includes('old1'));
ok('[旧备份] 换完还能解回原来的内容', await (async () => { fs.writeFileSync(TMP + '/o', store.get('old1').buf); return (await bk(['decrypt', TMP + '/o', TMP + '/od'])).status === 0 && fs.readFileSync(TMP + '/od').equals(plain); })());
ok('[旧备份] 已经加密的不动', puts.filter((x) => x !== 'old1').length === 0);
// 加密不了就不上传
fs.writeFileSync(BIN + '/broken', '#!/bin/sh\nexit 1\n', { mode: 0o755 });
const n0 = store.size;
r = await run(['manual'], { ...ENV(false), BK_CRYPT: BIN + '/broken' });
ok('[上传] 加密失败：不上传，说清楚原因', r.status !== 0 && /没有上传/.test(r.stdout) && store.size === n0, r.stdout);

// 4. 面板的后台任务
const job = () => JSON.parse(fs.readFileSync(TMP + '/cmcp_bkjob.json', 'utf8'));
r = (await bk(['job', 'now']));
ok('[任务] 立即备份：做完记下结果和大小', job().op === 'now' && job().state === 'done' && job().size > 0, JSON.stringify(job()));
const lastId = [...store.keys()].pop();
r = (await bk(['job', 'dl', lastId]));
ok('[任务] 下载：先解密成普通备份放好', job().state === 'done' && fs.existsSync(TMP + '/cmcp_bkdl.' + lastId + '.tgz') && execSync('tar tzf ' + TMP + '/cmcp_bkdl.' + lastId + '.tgz').toString().includes('wifi'));
r = (await bk(['job', 'dl', 'nosuch']));
ok('[任务] 下载失败：说清楚原因', job().state === 'error' && /下载备份失败/.test(job().msg));
ok('[任务] 编号不对直接拒绝', (await bk(['job', 'dl', '../x'])).status !== 0);
// 还原：钥匙保持现在的，其它照常还原
fs.writeFileSync(FILES + '/wifi', Buffer.concat([Buffer.from('changed later\n'), nc.randomBytes(3000)]));
fs.writeFileSync(D + '/config.json', '{"token":"now"}');
fs.rmSync(TMP + '/log', { force: true });
r = (await bk(['job', 'restore', lastId]));
if (process.env.DBG) console.error(r.stdout, r.stderr, fs.readFileSync(TMP + '/cmcp_bkjob.json', 'utf8'));
ok('[任务] 还原：先备份现在的、再还原、再重启', /restored[\s\S]*reboot/.test(fs.existsSync(TMP + '/log') ? fs.readFileSync(TMP + '/log', 'utf8') : '') && job().state === 'restoring', r.stdout + r.stderr + JSON.stringify(job()));
ok('[任务] 还原后设置回到备份时', fs.readFileSync(FILES + '/wifi').includes('secret-wifi-pw'));
ok('[任务] 还原后钥匙保持现在的', fs.readFileSync(D + '/config.json', 'utf8') === '{"token":"now"}');
// 还原失败（系统解不开）：不重启，说明原因
fs.writeFileSync(BIN + '/sysupgrade', `#!/bin/sh\ncase "$1" in -l) echo ${FILES}/wifi ;; -r) exit 1 ;; esac\n`, { mode: 0o755 });
fs.rmSync(TMP + '/log', { force: true });
r = (await bk(['job', 'restore', lastId]));
ok('[任务] 还原失败：不重启，说明原因', !fs.existsSync(TMP + '/log') && job().state === 'error' && /没有重启/.test(job().msg), JSON.stringify(job()));

srv.close();
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

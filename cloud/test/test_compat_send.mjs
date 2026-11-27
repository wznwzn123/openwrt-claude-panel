// 5.3.0 尝鲜申请上报（src/bin/cmcp-compat）：在没有 od、hexdump 的固件上也能生成随机编号并报上去
// 用户 11/27 的路由器 busybox 没带 od，原来的写法编号生成不了，申请一直报不上去
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_compat_send.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const GOT = [];
const server = http.createServer(async (req, res) => {
	const ch = []; for await (const c of req) ch.push(c);
	let b = null; try { b = JSON.parse(Buffer.concat(ch).toString()); } catch (e) {}
	GOT.push({ url: req.url, b });
	res.writeHead(200, { 'content-type': 'application/json' });
	res.end(JSON.stringify(req.url === '/api/compat/who' ? { ok: true, mail: 'm***@x.com' } : { ok: true, beta: { st: 'wait' } }));
});
await new Promise((z) => server.listen(8144, z));
const HUB = 'http://localhost:8144', BIN = path.resolve('../src/bin/cmcp-compat');
const NOOD = (() => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nood-')); for (const dir of (process.env.PATH || '').split(':')) { try { for (const f of fs.readdirSync(dir)) if (!['od', 'hexdump', 'xxd'].includes(f) && !fs.existsSync(d + '/' + f)) fs.symlinkSync(dir + '/' + f, d + '/' + f); } catch (e) {} } return d; })();
const mk = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcp53-')); fs.writeFileSync(d + '/version', 'VER=v5.3.0\n'); return d; };
const cp = (d, extra, ...args) => new Promise((z) => {
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(BIN) + ' ' + args.map((a) => JSON.stringify(a)).join(' ')], { env: { ...process.env, CMCP_COMPAT_D: d, CMCP_COMPAT_HUB: HUB, no_proxy: 'localhost', ...extra } });
	let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; });
	p.on('close', () => { let j = null; try { j = JSON.parse(out.trim().split('\n').pop()); } catch (e) {} z(j ?? { raw: out }); });
});
// 没申请：什么都不报
let A = mk();
let r = await cp(A, { PATH: NOOD }, 'send', 'now');
ok('没申请：什么都不报', r && r.off === true && !GOT.length, JSON.stringify(r));
// 申请了：没有 od 也能生成编号、报上去
fs.writeFileSync(A + '/beta_want', JSON.stringify({ at: 1795748380, note: '想先用' }));
r = await cp(A, { PATH: NOOD }, 'send', 'now');
const id = fs.existsSync(A + '/compat_id') ? fs.readFileSync(A + '/compat_id', 'utf8').trim() : '';
ok('没有 od、hexdump 的固件：随机编号照样生成（16 位）', /^[a-z2-9]{16}$/.test(id), JSON.stringify(r).slice(0, 200));
const sent = GOT.find((g) => g.url === '/api/compat');
ok('申请报上去了：带编号、版本、尝鲜和留言', r && r.ok === true && sent && sent.b.id === id && sent.b.ver === 'v5.3.0' && sent.b.beta === true && sent.b.app.note === '想先用', JSON.stringify(sent && sent.b).slice(0, 200));
ok('报完存了结果（面板「尝鲜」看状态用）', fs.existsSync(A + '/compat_res.json'));
// 编号一直用同一个
await cp(A, { PATH: NOOD }, 'send', 'now');
ok('再报一次：编号不变', GOT.filter((g) => g.url === '/api/compat').every((g) => g.b.id === id));
// 自建版的关联码也不靠 od
const B = mk();
r = await cp(B, { PATH: NOOD }, 'who');
const lk = fs.existsSync(B + '/beta_lk') ? fs.readFileSync(B + '/beta_lk', 'utf8').trim() : '';
ok('自建版关联码：没有 od 也能生成（24 位）', /^[a-z2-9]{24}$/.test(lk), JSON.stringify(r).slice(0, 200));
ok('两台路由器的编号不一样', (() => { fs.writeFileSync(B + '/beta_want', '{"at":1,"note":""}'); return true; })() && (await cp(B, { PATH: NOOD }, 'send', 'now')).ok && fs.readFileSync(B + '/compat_id', 'utf8').trim() !== id);
server.close();
console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
process.exit(results.every((r) => r[1]) ? 0 : 1);

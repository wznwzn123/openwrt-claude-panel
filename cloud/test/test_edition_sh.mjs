// 6.0 第 94 项（路由器这边的换版本程序 cmcp-edition）：本地版 ↔ AI 版，失败自动退回原来的版本，
// 报结果给官网、推送、兼容性上报；官网发来的指令同一个编号只做一次
// 用假的官网（本机 HTTP）、假的软件包管理器；会断网、改系统的命令只记下来（CMCP_ED_RUN）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_edition_sh.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawnSync, spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SH = path.resolve('../src/bin/cmcp-edition');
// 假官网
const HUBLOG = []; let HUB = { edition: { local: { ok: true, local: true }, ai: { ok: true, local: false, token: 'tunnel-token-xyz' } } };
const server = http.createServer(async (req, res) => {
	let b = ''; for await (const c of req) b += c;
	const j = JSON.parse(b || '{}'); HUBLOG.push({ p: req.url, j });
	res.setHeader('content-type', 'application/json');
	if (j.rkey !== 'r'.repeat(32)) { res.statusCode = 403; return res.end('{"error":"钥匙不对"}'); }
	if (req.url === '/api/dev/edition') { const r = HUB.edition[j.to]; res.statusCode = r.ok ? 200 : 502; return res.end(JSON.stringify(r)); }
	if (req.url === '/api/dev/edres') return res.end('{"ok":true}');
	res.statusCode = 404; res.end('{}');
});
await new Promise((z) => server.listen(18799, z));

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpeds-'));
const BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpbin-'));
const CFG = D + '/uci'; fs.mkdirSync(CFG);
fs.writeFileSync(CFG + '/network', "config interface 'lan'\n\toption ipaddr '192.168.8.1'\n");
const W = (n, s) => fs.writeFileSync(BIN + '/' + n, s, { mode: 0o755 });
W('uci', `#!/bin/sh\nexec python3 ${path.resolve('test/fake/uci.py')} -c ${CFG} "$@"\n`);
W('jsonfilter', `#!/usr/bin/env node
const a = process.argv.slice(2); let src = null, ex = '';
for (let i = 0; i < a.length; i++) { if (a[i] === '-s') src = a[++i]; else if (a[i] === '-i') src = require('fs').readFileSync(a[++i], 'utf8'); else if (a[i] === '-e') ex = a[++i]; }
if (src === null) src = require('fs').readFileSync(0, 'utf8');
let v; try { v = JSON.parse(src); } catch (e) { process.exit(1); }
for (const k of ex.replace(/^@\\.?/, '').split('.').filter(Boolean)) { if (v == null) process.exit(1); v = v[k]; }
if (v === undefined || v === null) process.exit(1);
console.log(typeof v === 'object' ? JSON.stringify(v) : String(v));
`);
W('cmcp-notify', `#!/bin/sh\necho "$*" >> ${BIN}/notify.log\n`);
W('cmcp-compat', `#!/bin/sh\necho "$*" >> ${BIN}/compat.log\n`);
W('opkg', `#!/bin/sh\necho "opkg $*" >> ${BIN}/pkg.log\ncase "$1" in install) [ -f ${BIN}/pkg_fail ] && exit 1; : > ${D}/fake_cfd ;; remove) rm -f ${D}/fake_cfd ;; esac\nexit 0\n`);
W('cmcp-ucode', '#!/bin/sh\n' + UC + ' "$@"\n');
const RUN = D + '/run.log', ST = D + '/ed.json';
const reset = (local, extra = {}) => {
	for (const f of ['local', 'tunnel_token', 'fake_cfd', 'fake_cfd_fail', 'cfd.ram', 'ed_last']) try { fs.rmSync(D + '/' + f); } catch (e) {}
	for (const f of ['notify.log', 'compat.log', 'pkg.log', 'pkg_fail']) try { fs.rmSync(BIN + '/' + f); } catch (e) {}
	try { fs.rmSync(RUN); } catch (e) {} try { fs.rmSync(ST); } catch (e) {} try { fs.rmSync(ST.replace('.json', '.lock'), { recursive: true }); } catch (e) {}
	fs.writeFileSync(D + '/hub.conf', 'HUB=http://127.0.0.1:18799\nSUB=abcdefgh\n');
	fs.writeFileSync(D + '/cloud.conf', 'URL=http://127.0.0.1:18799/cloud\nRKEY=' + 'r'.repeat(32) + '\n');
	fs.writeFileSync(D + '/config.json', JSON.stringify({ token: 't'.repeat(40), ckey: 'k'.repeat(40), ...extra }, null, 1));
	if (local) fs.writeFileSync(D + '/local', ''); else fs.writeFileSync(D + '/tunnel_token', 'old-token');
	HUBLOG.length = 0;
};
const run = (args, env = {}) => new Promise((z) => {
	const p = spawn('sh', [SH, ...args], { env: { ...process.env, PATH: BIN + ':' + process.env.PATH, CMCP_ED_D: D, CMCP_SBIN: BIN, CMCP_ED_RUN: RUN, CMCP_ED_ST: ST, CMCP_ED_WAIT: '6', CMCP_ED_FREE: '100', CMCP_ED_MEM: '300', FAKE_READY: '1', CMCP_UCODE: BIN + '/cmcp-ucode', ...env } });
	let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
	p.on('close', (c) => z({ code: c, out }));
});
const rd = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };
const st = () => { try { return JSON.parse(rd(ST)); } catch (e) { return {}; } };
const ex = (f) => fs.existsSync(D + '/' + f);
const res = () => HUBLOG.filter((x) => x.p === '/api/dev/edres').map((x) => x.j);

// ---------- AI 版 → 本地版 ----------
reset(false); fs.writeFileSync(D + '/fake_cfd', '');
let r = await run(['to-local', 'abcdefghjk', 'panel']);
ok('换成本地版：成功', r.code === 0 && st().state === 'ok', r.out + JSON.stringify(st()));
ok('官网那边先关隧道', HUBLOG[0] && HUBLOG[0].p === '/api/dev/edition' && HUBLOG[0].j.to === 'local');
ok('路由器：记成本地版，隧道令牌删掉', ex('local') && !ex('tunnel_token'));
ok('重启面板服务（停掉隧道）、去掉隧道直连设置、更新面板域名规则', /claude-mcp restart/.test(rd(RUN)) && /cmcp-tunbypass remove/.test(rd(RUN)) && /cmcp-route --init/.test(rd(RUN)), rd(RUN));
ok('删掉隧道程序（省空间）', /opkg remove cloudflared/.test(rd(RUN)), rd(RUN));
ok('报结果给官网（成功、带编号）', res().some((x) => x.ok === true && x.id === 'abcdefghjk' && x.to === 'local'));
ok('推送：说在家里怎么打开', /已换成本地版/.test(rd(BIN + '/notify.log')) && /192\.168\.8\.1:906/.test(rd(BIN + '/notify.log')), rd(BIN + '/notify.log'));
r = await run(['to-local']);
ok('已经是本地版再换：直接说已经是了', r.code === 0 && /已经是本地版/.test(st().msg));

// 官网关不了隧道
reset(false);
HUB.edition.local = { ok: false, error: '官网这边改不了网址：Cloudflare 接口出错', step: 'hub' };
r = await run(['to-local', 'bbbbbbbbbb']);
ok('官网那边失败：路由器什么都不动', r.code !== 0 && !ex('local') && ex('tunnel_token') && !/restart/.test(rd(RUN)));
ok('失败在哪一步、原因都写清楚', st().state === 'fail' && st().step === 'hub' && /改不了网址/.test(st().msg));
ok('报给官网（失败）、推送、兼容性上报', res().some((x) => x.ok === false && x.step === 'hub') && /没成功/.test(rd(BIN + '/notify.log')) && /tunnel/.test(rd(BIN + '/compat.log')));
HUB.edition.local = { ok: true, local: true };

// ---------- 本地版 → AI 版 ----------
reset(true);
r = await run(['to-ai', 'cccccccccc', 'web']);
ok('换成 AI 版：成功', r.code === 0 && st().state === 'ok', r.out + JSON.stringify(st()));
ok('先装隧道程序，再问官网要隧道', /opkg install cloudflared/.test(rd(RUN)) && HUBLOG.find((x) => x.p === '/api/dev/edition').j.to === 'ai');
ok('隧道令牌写好、本地版记号去掉', rd(D + '/tunnel_token') === 'tunnel-token-xyz' && !ex('local'));
ok('令牌文件只有 root 能读', (fs.statSync(D + '/tunnel_token').mode & 0o077) === 0);
ok('启动隧道、打开隧道直连', /claude-mcp restart/.test(rd(RUN)) && /cmcp-tunbypass apply/.test(rd(RUN)));

// 隧道一直接不上：全部退回本地版
reset(true);
r = await run(['to-ai', 'dddddddddd'], { FAKE_READY: '0' });
ok('隧道接不上：退回本地版（记号回来、令牌删掉）', r.code !== 0 && ex('local') && !ex('tunnel_token'), r.out);
ok('隧道接不上：官网那边也关掉隧道', HUBLOG.filter((x) => x.p === '/api/dev/edition').map((x) => x.j.to).join() === 'ai,local');
ok('隧道接不上：刚装的隧道程序删掉', /opkg remove cloudflared/.test(rd(RUN)) && !ex('fake_cfd'));
ok('隧道接不上：失败在「连接隧道」，说清楚', st().step === 'tunnel' && /没接上/.test(st().msg) && res().some((x) => x.ok === false && x.step === 'tunnel'));

// 闪存不够、内存也不够
reset(true);
r = await run(['to-ai'], { CMCP_ED_FREE: '5', CMCP_ED_MEM: '60' });
ok('空间不够：不问官网，说清楚闪存和内存各剩多少', r.code !== 0 && st().step === 'space' && /闪存只剩 5 MB/.test(st().msg) && /60 MB/.test(st().msg) && !HUBLOG.some((x) => x.p === '/api/dev/edition'));
ok('空间不够：还是本地版', ex('local'));
// 闪存不够、内存够：下载到内存（小闪存模式）
reset(true);
r = await run(['to-ai'], { CMCP_ED_FREE: '5' });
ok('闪存不够、内存够：用小闪存模式（下载到内存）', r.code === 0 && /cmcp-cfd fetch/.test(rd(RUN)) && ex('cfd.ram'), r.out + rd(RUN));
reset(true); fs.writeFileSync(D + '/fake_cfd_fail', '');
r = await run(['to-ai'], { CMCP_ED_FREE: '5' });
ok('下载失败：失败在「下载」，还是本地版', r.code !== 0 && st().step === 'download' && ex('local') && !ex('cfd.ram'));
// 官网开不了隧道
reset(true);
HUB.edition.ai = { ok: false, error: '官网这边开不了隧道：quota', step: 'hub' };
r = await run(['to-ai']);
ok('官网开不了隧道：删掉刚装的隧道程序，还是本地版', r.code !== 0 && st().step === 'hub' && ex('local') && /opkg remove cloudflared/.test(rd(RUN)));
HUB.edition.ai = { ok: true, local: false, token: 'tunnel-token-xyz' };

// ---------- 旧的托管纯面板版：打开 AI 功能 ----------
reset(false, { ai: false });
fs.writeFileSync(D + '/config.json', JSON.stringify({ token: 't'.repeat(40), ai: false }));
r = await run(['to-ai']);
const cj = JSON.parse(rd(D + '/config.json'));
ok('纯面板版打开 AI：去掉 ai:false、生成连接器钥匙，不动隧道', r.code === 0 && cj.ai === undefined && /^[a-z0-9]{40}$/.test(cj.ckey || '') && !HUBLOG.some((x) => x.p === '/api/dev/edition'), r.out + rd(D + '/config.json'));

// ---------- 官网发来的指令：同一个编号只做一次 ----------
reset(true);
r = await run(['remote', 'eeeeeeeeee', 'ai']);
ok('官网指令：执行', r.code === 0 && !ex('local'));
const n = HUBLOG.length;
r = await run(['remote', 'eeeeeeeeee', 'ai']);
ok('同一个编号再来一次：不再做', r.code === 0 && HUBLOG.length === n);
r = await run(['remote', 'ffffffffff', 'rm']);
ok('乱写的版本：不执行', r.code !== 0);

// ---------- 同时只换一次 ----------
reset(true); fs.mkdirSync(ST.replace('.json', '.lock'));
r = await run(['to-ai']);
ok('正在换的时候再来：不做', r.code === 2 && !HUBLOG.length);
// 自建版
reset(true); fs.rmSync(D + '/hub.conf');
r = await run(['to-ai']);
ok('自建版：说只有托管版能换', r.code !== 0 && /只有托管版/.test(st().msg));

server.close();
fs.rmSync(D, { recursive: true, force: true }); fs.rmSync(BIN, { recursive: true, force: true });
let fail = 0;
for (const [nm, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + nm + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

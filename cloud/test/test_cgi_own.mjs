// 6.0 第 17 项：家人只管自己的设备——没有「看和管所有设备」的子账号只看得到、只管得了自己名下的设备；
// 自动认（打开面板的那台手机）、自己认领要主账号确认、主账号指定；设备归孩子、暂停和计划是家长设的，孩子改不了；官网旧版不限制
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_own.mjs（会写 /tmp/dhcp.leases、/tmp/cmcp_traf.json、/etc/claude-mcp/pause.json，跑完还原）
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawnSync } from 'child_process';
import { load, memStorage } from './load.mjs';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (u.hostname === 'localhost') return realFetch(input, init);
	if (u.hostname === 'api.cloudflare.com') { const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] })); if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 't' + Math.random(), token: 'tok' }); if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'd' + Math.random() }); return R({}); }
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const H = () => env.H.get('hub'), S = () => H().ctx.storage;
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const r = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
	const h = {}; r.headers.forEach((v, k) => { h[k] = v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8135, z));
const B = 'http://localhost:8135';
const api = async (p, body, hdr = {}) => (await realFetch(B + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const ADM = { authorization: 'Bearer admin-key-1234567890' };

// 路由器：一台托管版
const inv = (await api('/api/admin/invites', { direct: true,  max: 5 }, ADM)).invite.code;
const R = await api('/api/register', { invite: inv, name: 'Home', model: 'x86' });
const ETC = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpown-'));
const TOKEN = 'tok' + 'x'.repeat(30);
fs.writeFileSync(ETC + '/config.json', JSON.stringify({ token: TOKEN, ckey: 'c'.repeat(40) }));
fs.writeFileSync(ETC + '/hub.conf', `HUB=${B}\nSUB=${R.sub}\nRKEY=${R.rkey}\n`);
for (const f of ['/tmp/cmcp_fam.json', '/tmp/cmcp_lcfail', '/tmp/cmcp_devseen.json']) try { fs.rmSync(f); } catch (e) {}
try { fs.rmSync('/tmp/cmcp_fam.lock', { recursive: true }); } catch (e) {}
// 跑一次 CGI（异步，等官网回话）
const cgi = (pathInfo, msg, extra) => new Promise((z) => {
	const body = JSON.stringify(msg);
	import('child_process').then(({ spawn }) => {
		const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: ETC + '/config.json', PATH_INFO: pathInfo, REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_SBIN: SBD, ...(extra || {}) } });
		let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
		p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
		p.stdin.end(body);
	});
});
let rid = 0;
const call = (dev, method, params, extra) => cgi('/' + TOKEN, { jsonrpc: '2.0', id: ++rid, method: 'panel/' + method, params: params || {}, client: 'panel', dev }, extra);
const open = (ticket, name) => cgi('/open', { jsonrpc: '2.0', id: ++rid, method: 'panel/open_login', params: { ticket, name }, client: 'panel' });
const devs = () => JSON.parse(fs.readFileSync(ETC + '/devices.json', 'utf8'));
const ticketOf = async (uid) => { const r = await H().famOpen(uid, R.sub); return (/#open=([a-z2-9]{24})$/.exec(r.url || '') || [])[1]; };
const clearCache = () => { try { fs.rmSync('/tmp/cmcp_fam.json'); } catch (e) {} };


// 假的 cmcp-notify / cmcp-pause（记下推送；暂停规则这里不测）
const SBD = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpownsb-')), NOTE = SBD + '/notify.log';
fs.writeFileSync(SBD + '/cmcp-notify', `#!/bin/sh\nprintf '%s|' "$@" >> ${NOTE}; echo >> ${NOTE}\n`); fs.writeFileSync(SBD + '/cmcp-pause', '#!/bin/sh\n[ "$1" = status ] && echo "{}"\n[ "$1" = state ] && echo "{}"\nexit 0\n');
for (const f of ['cmcp-notify', 'cmcp-pause']) fs.chmodSync(SBD + '/' + f, 0o755);
const BAK = {}, F = ['/tmp/dhcp.leases', '/tmp/cmcp_traf.json', '/etc/claude-mcp/pause.json', '/tmp/cmcp_ownauto.json'];
for (const f of F) BAK[f] = fs.existsSync(f) ? fs.readFileSync(f) : null;
fs.mkdirSync('/etc/claude-mcp', { recursive: true });
const T = Math.floor(Date.now() / 1000) + 3600, BPH = 'b0:00:00:00:00:01', PAD = 'b0:00:00:00:00:02', PC = 'b0:00:00:00:00:03', TV = 'b0:00:00:00:00:04';
fs.writeFileSync('/tmp/dhcp.leases', [`${T} ${BPH} 10.66.0.21 bob-phone *`, `${T} ${PAD} 10.66.0.22 kid-pad *`, `${T} ${PC} 10.66.0.23 alice-pc *`, `${T} ${TV} 10.66.0.24 tv *`].join('\n') + '\n');
const day = new Date().toISOString().slice(0, 10);
fs.writeFileSync('/tmp/cmcp_traf.json', JSON.stringify({ day, at: Math.floor(Date.now() / 1000), today: { [PAD]: [1, 2, 3, 4], [PC]: [5, 6, 7, 8], other: [1, 1, 1, 1] }, names: { [PAD]: 'kid-pad', [PC]: 'alice-pc' } }));
fs.writeFileSync('/etc/claude-mcp/pause.json', JSON.stringify({ [PC]: { name: 'alice-pc', sched: [{ from: '23:00', to: '07:00' }], by: 'x' } }));
const OWN = () => (fs.existsSync(ETC + '/devown.json') ? JSON.parse(fs.readFileSync(ETC + '/devown.json', 'utf8')) : {});
const macs = (r) => (r.result?.devices || []).map((d) => d.mac).filter((m) => /^b0:/.test(m || '')).sort().join(); // 只看测试里的设备（测试机自己的网关不算）
try {
	const mkUser = async (email) => { await api('/api/account/register', { email, password: 'pass-' + email.slice(0, 3) + '-1234' }); return S().get('e:' + email); };
	const ua = await mkUser('alice@x.com'), ub = await mkUser('bob@x.com'), uc = await mkUser('carol@x.com');
	{ const d = await S().get('d:' + R.sub); d.users = [ua]; d.owner = ua; d.subs = {}; await S().put('d:' + R.sub, d); const u = await S().get('u:' + ua); u.devs = [{ sub: R.sub, at: Date.now() }]; await S().put('u:' + ua, u); }
	const devA = (await open(await ticketOf(ua), 'A')).result.dev;
	const su = (await call(devA, 'fam', { op: 'sudo', code: '' })).result.sudo;
	const wa = await call(devA, 'whoami');
	ok('主账号的权限里有「所有设备」', wa.result.perms.includes('alldev') && wa.result.perms.length === 8, JSON.stringify(wa.result.perms));
	// B：6.0 加入的家人（家长控制，没勾所有设备）
	const jc = await call(devA, 'fam', { op: 'join_create', sudo: su, name: 'Bob', perms: ['msg', 'parent'] });
	await H().famJoin(ub, jc.result.code);
	const devB = (await open(await ticketOf(ub), 'B')).result.dev;
	ok('新加入的家人：没有「所有设备」', !(await call(devB, 'whoami')).result.perms.includes('alldev'));
	// C：6.0 以前加入的家人（v = 2）
	{ const d = await S().get('d:' + R.sub); d.users.push(uc); d.subs[uc] = { tpl: 'family', perms: ['msg', 'node', 'speed'], v: 2, at: Date.now() }; await S().put('d:' + R.sub, d); const u = await S().get('u:' + uc); u.devs = [{ sub: R.sub, at: Date.now() }]; await S().put('u:' + uc, u); }
	clearCache();
	const devC = (await open(await ticketOf(uc), 'C')).result.dev;
	ok('6.0 以前加入的家人：照旧有「所有设备」', (await call(devC, 'whoami')).result.perms.includes('alldev'));
	const mem = (await call(devA, 'fam', { op: 'members' })).result;
	ok('家人列表里标出哪些是 6.0 以前加入的（主账号据此决定要不要改）', mem.subs.find((x) => x.uid === uc).old === true && mem.subs.find((x) => x.uid === ub).old === false);

	{ const x = await call(devA, 'devices'); ok('主账号看得到所有设备', macs(x) === [BPH, PAD, PC, TV].join(), JSON.stringify(x).slice(0, 600)); }
	ok('以前的家人看得到所有设备', macs(await call(devC, 'devices')) === [BPH, PAD, PC, TV].join());
	let r = await call(devB, 'devices');
	ok('只管自己的家人：还没有自己的设备 → 一台都看不到', r.result && r.result.devices.length === 0 && r.result.own === true, JSON.stringify(r).slice(0, 200));
	ok('别人的流量看不到', Object.keys((await call(devB, 'traffic')).result.days[day] || {}).length === 0);
	ok('别人的暂停设置看不到', Object.keys((await call(devB, 'pause_list')).result.devs).length === 0);
	ok('AI 工具里的设备列表不给', !!(await cgi('/' + TOKEN, { jsonrpc: '2.0', id: 77, method: 'tools/call', params: { name: 'device_list', arguments: {} }, client: 'panel', dev: devB })).error || /只能看自己的设备/.test(JSON.stringify(await cgi('/' + TOKEN, { jsonrpc: '2.0', id: 78, method: 'tools/call', params: { name: 'device_list', arguments: {} }, client: 'panel', dev: devB }))));
	// 自动认：B 在家里用手机打开面板（局域网直连，来源是 bob-phone）
	r = await call(devB, 'devices', {}, { REMOTE_ADDR: '10.66.0.21' });
	ok('自动认：打开面板的那台手机算他的，马上看得到', macs(r) === BPH && OWN()[BPH]?.uid === ub && OWN()[BPH].how === 'auto' && OWN()[BPH].ok === true, JSON.stringify(OWN()));
	await call(devC, 'devices', {}, { REMOTE_ADDR: '10.66.0.21' });
	ok('自动认：已经归别人的设备不抢', OWN()[BPH].uid === ub);
	// 认领
	r = await call(devB, 'dev_own');
	ok('认领：列出没主的设备（只有名字和图标）', r.result.cands.map((x) => x.mac).filter((m) => /^b0:/.test(m)).sort().join() === [PAD, PC, TV].join() && !('stats' in r.result.cands[0]) && r.result.limit === true, JSON.stringify(r.result));
	fs.rmSync(NOTE, { force: true });
	r = await call(devB, 'dev_claim', { mac: PAD });
	ok('认领：等主账号确认，还看不到', r.result?.own?.ok === false && macs(await call(devB, 'devices')) === BPH);
	await new Promise((z) => setTimeout(z, 300));
	const n = fs.existsSync(NOTE) ? fs.readFileSync(NOTE, 'utf8').split('|') : [];
	ok('认领：推送给主账号', n[1] === 'claim' && /有家人认领了设备「kid-pad」/.test(n[2]) && n[4] === 'claim-' + PAD && n[5] === ua, JSON.stringify(n));
	ok('认领：已经归别人的不能认', /已经有主人/.test((await call(devC, 'dev_claim', { mac: BPH })).error?.message || ''));
	ok('主账号不用认领', !!(await call(devA, 'dev_claim', { mac: TV })).error);
	ok('子账号不能改设备归谁', (await call(devB, 'dev_own_set', { mac: PAD, uid: ub })).error?.code === -32012);
	ok('主账号看得到等确认的认领', (await call(devA, 'dev_own')).result.own[PAD]?.ok === false);
	await call(devA, 'dev_own_set', { mac: PAD, uid: ub });
	r = await call(devB, 'devices');
	ok('主账号确认后：看得到自己的两台', macs(r) === [BPH, PAD].join());
	r = await call(devB, 'traffic');
	ok('流量只有自己的设备', Object.keys(r.result.days[day]).join() === PAD && !(PC in r.result.names), JSON.stringify(r.result.days[day]));
	// 管
	ok('别人的设备不能暂停', /不是你的/.test((await call(devB, 'pause_set', { mac: PC, minutes: 30 })).error?.message || ''));
	ok('别人的设备不能限速（6.0 第 20 项）', /不是你的/.test((await call(devB, 'rl_set', { mac: PC, down: 1000 })).error?.message || ''));
	ok('别人的设备不能改名', /不是你的/.test((await call(devB, 'dev_rename', { mac: TV, name: 'x' })).error?.message || ''));
	ok('别人的设备不能删', /不是你的/.test((await call(devB, 'dev_forget', { items: [{ mac: TV }] })).error?.message || ''));
	ok('自己的设备能改名', !(await call(devB, 'dev_rename', { mac: PAD, name: '我的平板' })).error);
	r = await call(devB, 'pause_set', { mac: PAD, minutes: 30 });
	ok('自己的设备能暂停，记下是谁设的', !r.error && JSON.parse(fs.readFileSync('/etc/claude-mcp/pause.json', 'utf8'))[PAD].by === ub && Object.keys(r.result.devs).join() === PAD, JSON.stringify(r).slice(0, 300));
	// 设备归孩子、计划是家长设的：孩子改不了
	await call(devA, 'pause_set', { mac: PAD, resume: true, plan: [{ d: [1, 2, 3, 4, 5], from: '16:00', to: '21:00' }] });
	ok('主账号给这台设计划', JSON.parse(fs.readFileSync('/etc/claude-mcp/pause.json', 'utf8'))[PAD].plan.by === ua);
	ok('孩子改不了家长设的计划', /家长设的，你改不了/.test((await call(devB, 'pause_set', { mac: PAD, plan: null })).error?.message || '') && JSON.parse(fs.readFileSync('/etc/claude-mcp/pause.json', 'utf8'))[PAD].plan);
	ok('孩子也不能自己延长', /家长设的/.test((await call(devB, 'pause_set', { mac: PAD, ext: 30 })).error?.message || ''));
	ok('能管所有设备的家人：管别人的设备照常可以（权限够的话）', (await call(devC, 'pause_set', { mac: TV, minutes: 30 })).error?.code === -32012 && Object.keys((await call(devC, 'pause_list')).result.devs).length >= 2);
	// 官网还是旧版（没有权限版本）：不限制
	{ const f = '/tmp/cmcp_fam.json', v = JSON.parse(fs.readFileSync(f, 'utf8')); delete v.pv; fs.writeFileSync(f, JSON.stringify(v)); }
	ok('官网还没更新（权限版本 < 3）：不按「只管自己」限制', macs(await call(devB, 'devices')) === [BPH, PAD, PC, TV].join());
	clearCache();
	ok('官网更新了：又按「只管自己」限制', macs(await call(devB, 'devices')) === [BPH, PAD].join());
	// 主账号取消归属
	await call(devA, 'dev_own_set', { mac: PAD, uid: null });
	ok('主账号取消归属：他就看不到了', macs(await call(devB, 'devices')) === BPH);
	// 主账号给他勾上「所有设备」
	await call(devA, 'fam', { op: 'sub_set', sudo: su, target: ub, perms: ['msg', 'parent', 'alldev'] });
	ok('勾上「所有设备」：马上看得到全部', macs(await call(devB, 'devices')) === [BPH, PAD, PC, TV].join());
} catch (e) { ok('出错：' + e.stack, false); }
finally { for (const f of F) { if (BAK[f]) fs.writeFileSync(f, BAK[f]); else fs.rmSync(f, { force: true }); } }
server.close(); fs.rmSync(ETC, { recursive: true }); fs.rmSync(SBD, { recursive: true });
console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 400) + '）')).join('\n'));
const pass = results.filter((x) => x[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

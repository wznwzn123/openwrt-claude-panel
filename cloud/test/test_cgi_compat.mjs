// 6.0 第 56–60 项：兼容情况匿名上报 → 官网按问题归类、按型号统计 → 标「修好了」→ 路由器推送；尝鲜报名、挑选、更新；公开兼容性表
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_compat.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { load, memStorage } from './load.mjs';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const realFetch = globalThis.fetch, MAIL = [];
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url);
	if (u.hostname === 'localhost') return realFetch(input, init);
	if (u.hostname === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); }
	if (u.hostname === 'api.cloudflare.com') return new Response(JSON.stringify({ success: true, result: { id: 'x' + Math.random(), token: 't' } }));
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const H = () => env.H.get('hub');
const server = http.createServer(async (req, res) => {
	const ch = []; for await (const c of req) ch.push(c);
	const r = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(ch) }), env);
	const h = {}; r.headers.forEach((v, k) => { h[k] = v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8143, z));
const HUB = 'http://localhost:8143';
const api = async (p, body, hdr = {}) => { const r = await realFetch(HUB + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined }); return r.json(); };
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const BIN = path.resolve('../src/bin/cmcp-compat');
// 一台假路由器：自己的设置目录
const mkRouter = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpcp-')); fs.writeFileSync(d + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30) })); return d; };
const cp = (d, ...args) => new Promise((z) => {
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(BIN) + ' ' + args.map((a) => JSON.stringify(a)).join(' ')], { env: { ...process.env, CMCP_COMPAT_D: d, CMCP_COMPAT_HUB: HUB, no_proxy: 'localhost' } });
	let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; });
	p.on('close', () => { let j = null; try { j = JSON.parse(out.trim().split('\n').pop()); } catch (e) {} z(j ?? { raw: out }); });
});
const cgi = (d, method, params) => new Promise((z) => {
	const msg = { jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' }, body = JSON.stringify(msg);
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: d + '/config.json', PATH_INFO: '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_SBIN: path.dirname(BIN), no_proxy: 'localhost' } });
	let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});

// ---- 上报 ----
const A = mkRouter();
const pr = await cp(A, 'probe');
ok('看这台路由器哪些功能能用：防火墙、软件包管理、暂停上网、验签、备份加密、远程访问……', pr && pr.caps && ['fw', 'pkg', 'pause', 'verify', 'crypt', 'rpcd', 'cfd'].every((k) => k in pr.caps), JSON.stringify(pr).slice(0, 200));
let r = await cp(A, 'send', 'now');
ok('上报成功', r && r.ok === true, JSON.stringify(r));
const id = fs.readFileSync(A + '/compat_id', 'utf8').trim();
ok('用路由器自己生成的随机编号（16 位）', /^[a-z2-9]{16}$/.test(id));
const rec = await H().ctx.storage.get('cp:' + id);
const body = JSON.parse(JSON.stringify(r.sent));
ok('报上去的只有版本、型号、平台、系统、内核、内存闪存大小和功能（不带钥匙、网址、账号）', rec && !('token' in body) && !JSON.stringify(body).includes('q'.repeat(30)) && Object.keys(body).every((k) => ['id', 'ver', 'code', 'model', 'plat', 'sys', 'kernel', 'mem', 'flash', 'caps', 'fails', 'beta'].includes(k)), Object.keys(body).join(','));
ok('官网不记 IP', !JSON.stringify(rec).includes('127.0.0.1') && !JSON.stringify(rec).includes('::1'));
// ---- 开不了的功能 ----
await cp(A, 'fail', 'update', '没有验签工具（usign / openssl），闪存剩 37 MB');
await cp(A, 'fail', 'update', '没有验签工具（usign / openssl），闪存剩 37 MB');
await cp(A, 'fail', 'tunnel', '下载 https://github.com/x/y?t=1 失败：连不上 192.168.1.1，设备 aa:bb:cc:dd:ee:ff 2001:db8::1，钥匙 abcdEFGH1234567890abcdEFGH12，a.b@qq.com');
{ const l = JSON.parse(fs.readFileSync(A + '/compat_fail.json', 'utf8')), w = (l.find((x) => x.f === 'tunnel') || {}).why || '';
  ok('原因里的网址、IP、MAC、钥匙、邮箱在路由器上就换掉了', /<网址>/.test(w) && /<IP>/.test(w) && /<MAC>/.test(w) && /<…>/.test(w) && /<邮箱>/.test(w) && !/github|192\.168|aa:bb|db8|abcdEFGH|qq\.com/.test(w), w);
  fs.writeFileSync(A + '/compat_fail.json', JSON.stringify(l.filter((x) => x.f !== 'tunnel'))); }
ok('同一个问题只记一条（记次数）', JSON.parse(fs.readFileSync(A + '/compat_fail.json', 'utf8')).length === 1 && JSON.parse(fs.readFileSync(A + '/compat_fail.json', 'utf8'))[0].n === 2);
r = await cp(A, 'send', 'now');
ok('报上去以后，路由器上的记录清掉', r.ok && JSON.parse(fs.readFileSync(A + '/compat_fail.json', 'utf8')).length === 0);
// 第二台：同样的问题，数字不一样
const B = mkRouter();
await cp(B, 'fail', 'update', '没有验签工具（usign / openssl），闪存剩 12 MB');
await cp(B, 'fail', 'pause', '没有 nft 也没有 ipset');
await cp(B, 'send', 'now');
let ad = await api('/api/admin/compat', null, ADM);
const g = ad.list.find((x) => x.f === 'update');
ok('后台：同一个问题（数字不同也算）合并成一条，影响 2 台，列出型号', g && g.n === 2 && g.models.reduce((s, m) => s + m.n, 0) === 2 && ad.list.filter((x) => x.f === 'update').length === 1, JSON.stringify(ad.list.map((x) => [x.f, x.n])));
ok('后台：一共 2 台路由器报过', ad.routers === 2);
ok('后台：只有型号、版本、功能和原因，没有编号', !JSON.stringify(ad.list).includes(id));
// 安装失败上报也一起归类
await api('/api/report', { kind: 'install', text: '安装失败（终端上报）\n面板版本：5.2.3（hosted-ai）\n错误：闪存只剩 37 MB，放不下远程访问要用的 cloudflared\n系统：ImmortalWrt 25.12（x）\n型号：Tenda BE12 Pro\n', email: 'x@y.com' });
await api('/api/report', { kind: 'install', text: '安装失败（终端上报）\n面板版本：5.2.3（hosted-ai）\n错误：闪存只剩 36 MB，放不下远程访问要用的 cloudflared\n系统：ImmortalWrt 25.12（x）\n型号：Tenda BE12 Pro\n', email: 'z@y.com' });
ad = await api('/api/admin/compat', null, ADM);
const gi = ad.list.find((x) => x.src === 'install');
ok('后台：终端里的安装失败上报一起归类（同一个错误合并，按型号算）', gi && gi.n === 2 && gi.models[0].model === 'Tenda BE12 Pro' && gi.models[0].n === 2, JSON.stringify(gi));
// ---- 修好了 ----
ok('标修好了：版本号要写对', (await api('/api/admin/compat/fix', { key: g.key, ver: 'abc' }, ADM)).error);
r = await api('/api/admin/compat/fix', { key: g.key, ver: '9.9.9', note: '没有验签工具时自动装' }, ADM);
ok('标「在 v9.9.9 修好了」', r.ok);
r = await cp(B, 'send', 'now');
ok('报过这个问题的路由器：下次上报时收到「修好了，在 v9.9.9」', r.fixed && r.fixed.some((x) => x.key === g.key && x.ver === '9.9.9' && x.title === '一键更新'), JSON.stringify(r.fixed));
const noted = JSON.parse(fs.readFileSync(B + '/compat_noted.json', 'utf8'));
ok('推送过一次就记下（不会每天推）', noted.includes(g.key));
ok('没报过「暂停上网」问题的不会收到这条之外的', !(r.fixed || []).some((x) => x.f === 'pause'));
ok('后台：标了修好的排到后面，写着版本', (await api('/api/admin/compat', null, ADM)).list.find((x) => x.key === g.key).fixed.ver === '9.9.9');
// ---- 关掉上报 ----
fs.writeFileSync(A + '/compat_off', '1');
const before = (await H().ctx.storage.get('cp:' + id)).last;
r = await cp(A, 'send', 'now');
ok('关掉以后：不上报', r.off === true && (await H().ctx.storage.get('cp:' + id)).last === before);
const cpBefore = new Set([...(await H().ctx.storage.list({ prefix: 'cp:' })).keys()]);
// ---- 尝鲜（第 95 项：申请 → 后台同意；撤销后要重新申请；后台只看匿名信息） ----
env.RESEND_API_KEY = 're_test';
// 邮箱一律用官网账号的（用户 11/26 定）：自建版先在官网登录、把路由器的关联码关联到账号
fs.writeFileSync(A + '/beta_want', '1');
r = await cp(A, 'send', 'now');
ok('自建版没关联官网账号：官网说先登录', r.beta && r.beta.st === 'err' && /先登录官网账号/.test(r.beta.why), JSON.stringify(r.beta));
let w = await cp(A, 'who');
const lkA = fs.readFileSync(A + '/beta_lk', 'utf8').trim();
ok('申请框问邮箱：自建版没关联 → 要登录 带回关联码和官网地址', w.login === true && !w.mail && w.lk === lkA && /^[a-z2-9]{24}$/.test(lkA) && w.hub === HUB, JSON.stringify(w));
await H().ctx.storage.put('u:uidself1234', { uid: 'uidself1234', email: 'me@x.com', devs: [] });
let lr = await H().compatLink('uidself1234', 'short');
ok('关联码不对：不关联', lr.st === 400);
lr = await H().compatLink('uidself1234', lkA);
ok('官网登录后关联：回打码的邮箱', lr.ok && lr.mail === 'm*@x.com', JSON.stringify(lr));
w = await cp(A, 'who');
ok('关联后再问：邮箱打码 不用再登录 不再给关联码', w.mail === 'm*@x.com' && w.login === false && !w.lk, JSON.stringify(w));
let c = await cgi(A, 'beta_set', { want: true, note: '想试试', email: 'evil@y.com' });
ok('面板申请：不收自己填的邮箱', !fs.readFileSync(A + '/beta_want', 'utf8').includes('evil'), fs.readFileSync(A + '/beta_want', 'utf8'));
fs.writeFileSync(A + '/beta_want', JSON.stringify({ at: Math.floor(Date.now() / 1000), note: '闪存小，见 http://x.example/a 192.168.1.1' }));
r = await cp(A, 'send', 'now');
const sent = r.sent || {};
ok('申请尝鲜（就算关了兼容上报）：报型号这些（申请时说清楚了），带申请', r.ok && sent.beta === true && 'model' in sent && sent.app && sent.app.note, JSON.stringify(sent).slice(0, 200));
ok('留给面板看的那份不存关联码 回复里只有打码的邮箱', !JSON.stringify(sent).includes(lkA) && r.beta.mail === 'm*@x.com' && !JSON.stringify(r).includes('me@x.com'), JSON.stringify(r).slice(0, 300));
ok('等审核：路由器知道', r.beta && r.beta.st === 'wait' && r.beta.ok === false, JSON.stringify(r.beta));
let rec2 = await H().ctx.storage.get('cp:' + id);
ok('官网记着申请人匿名编号和官网账号（不存邮箱），留言里的网址和 IP 洗掉了', rec2.ap && /^[A-Z2-9]{8}$/.test(rec2.ap.pid) && rec2.ap.uid === 'uidself1234' && !rec2.ap.email && /<网址>/.test(rec2.ap.note) && /<IP>/.test(rec2.ap.note), JSON.stringify(rec2.ap));
ad = await api('/api/admin/compat', null, ADM);
let v = ad.volunteers.find((x) => x.id === id);
ok('后台：看得到申请（型号、系统、版本、内存、闪存、留言、匿名编号）', v && v.st === 'wait' && v.pid && v.model !== undefined && 'mem' in v && 'flash' in v && v.note && v.hosted === false, JSON.stringify(v).slice(0, 300));
ok('后台：看不到邮箱、官网账号、专属网址编号', !JSON.stringify(ad.volunteers).includes('uidself1234') && !JSON.stringify(ad.volunteers).includes('me@x.com') && !JSON.stringify(ad.volunteers).includes('"sub"') && !JSON.stringify(ad.volunteers).includes('"email"'));
r = await api('/api/admin/compat/beta', { id, act: 'rev' }, ADM);
ok('后台：等审核的也能撤销', r.ok === true);
r = await api('/api/admin/compat/beta', { id, act: 'ok' }, ADM);
ok('后台：撤销以后能直接同意', r.ok === true);
ok('同意：发邮件到申请人官网账号的邮箱', MAIL.some((m) => (Array.isArray(m.to) ? m.to : [m.to]).includes('me@x.com') && /尝鲜申请通过了/.test(m.subject)), JSON.stringify(MAIL.slice(-2)).slice(0, 300));
await H().setMeta('prerel', { tag: 'v9.9.10', ver: '9.9.10' });
r = await cp(A, 'send', 'now');
ok('通过了：路由器拿到尝鲜版的版本号', r.beta && r.beta.ok === true && r.beta.st === 'ok' && r.beta.tag === 'v9.9.10', JSON.stringify(r.beta));
c = await cgi(A, 'compat_info');
ok('面板：看得到上报关着、已通过、尝鲜版 v9.9.10', c.result && c.result.on === false && c.result.beta.want && c.result.beta.st === 'ok' && c.result.beta.ver === '9.9.10', JSON.stringify(c));
fs.writeFileSync('/tmp/cmcp_latest.json', JSON.stringify({ at: Math.floor(Date.now() / 1000), latest: '9.9.9', notes: '' }));
c = await cgi(A, 'update_check');
ok('一键更新：告诉面板有尝鲜版可以装', c.result && c.result.beta && c.result.beta.tag === 'v9.9.10', JSON.stringify(c));
// 同一个人的第二台（关联到同一个官网账号）：按人撤销两台都撤
const B2 = mkRouter();
fs.writeFileSync(B2 + '/beta_want', JSON.stringify({ at: Math.floor(Date.now() / 1000), note: '' }));
await cp(B2, 'who'); await H().compatLink('uidself1234', fs.readFileSync(B2 + '/beta_lk', 'utf8').trim());
r = await cp(B2, 'send', 'now');
const id2 = fs.readFileSync(B2 + '/compat_id', 'utf8').trim();
ad = await api('/api/admin/compat', null, ADM);
ok('同一个官网账号的两台：匿名编号一样，后台写着共 2 台', ad.volunteers.find((x) => x.id === id2).pid === ad.volunteers.find((x) => x.id === id).pid && ad.volunteers.find((x) => x.id === id).pidN === 2);
const nm = MAIL.length;
r = await api('/api/admin/compat/beta', { id, act: 'revp' }, ADM);
ok('按人撤销：两台都撤（等审核的也算）', r.ok && r.n === 2 && (await H().ctx.storage.get('cp:' + id)).ap.st === 'rev' && (await H().ctx.storage.get('cp:' + id2)).ap.st === 'rev', JSON.stringify(r));
ok('按人撤销：同一个人只发一封邮件', MAIL.length === nm + 1 && /撤销/.test(MAIL[MAIL.length - 1].subject));
r = await cp(A, 'send', 'now');
ok('撤销后：路由器知道被撤销了，拿不到尝鲜版', r.beta && r.beta.st === 'rev' && r.beta.ok === false && !r.beta.tag, JSON.stringify(r.beta));
c = await cgi(A, 'compat_info');
ok('面板：显示被撤销（按钮变回「申请」）', c.result && c.result.beta.st === 'rev' && c.result.beta.ok === false);
c = await cgi(A, 'update_check');
ok('撤销后：检查更新里没有尝鲜版', c.result && !c.result.beta, JSON.stringify(c.result && c.result.beta));
r = await cp(A, 'send', 'now');
ok('不重新申请：一直是撤销', r.beta && r.beta.st === 'rev');
await new Promise((z) => setTimeout(z, 1100));
fs.writeFileSync(A + '/beta_want', JSON.stringify({ at: Math.floor(Date.now() / 1000) + 1, note: '再试一次' }));
c = await cgi(A, 'compat_info');
ok('重新申请、还没报上去：面板显示正在提交', c.result && c.result.beta.st === 'sending', JSON.stringify(c.result && c.result.beta));
r = await cp(A, 'send', 'now');
ok('重新申请：又变成等审核', r.beta && r.beta.st === 'wait', JSON.stringify(r.beta));
r = await api('/api/admin/compat/beta', { id, act: 'no' }, ADM);
ok('后台：拒绝', r.ok && (await H().ctx.storage.get('cp:' + id)).ap.st === 'no');
r = await api('/api/admin/compat/beta', { id, act: 'no' }, ADM);
ok('后台：已经拒绝的不能再拒绝', !r.ok);
// 托管版：用专属网址编号认出是哪个账号的（不用留邮箱），结果推送
const C3 = mkRouter();
await env.W.get('dev:hostabcd').setup({ sub: 'hostabcd', rkey: 'r'.repeat(32), tkey: 't'.repeat(32), probe: '' });
await H().ctx.storage.put('d:hostabcd', { sub: 'hostabcd', state: 'ok', owner: 'uidowner123' });
await H().ctx.storage.put('u:uidowner123', { uid: 'uidowner123', email: 'owner@x.com', devs: [] });
fs.writeFileSync(C3 + '/hub.conf', 'HUB=' + HUB + '\nSUB=hostabcd\n'); fs.writeFileSync(C3 + '/cloud.conf', 'URL=' + HUB + '/cloud\nRKEY=' + 'r'.repeat(32) + '\n');
fs.writeFileSync(C3 + '/beta_want', JSON.stringify({ at: Math.floor(Date.now() / 1000), note: '' }));
r = await cp(C3, 'send', 'now');

const id3 = fs.readFileSync(C3 + '/compat_id', 'utf8').trim(), rec3 = await H().ctx.storage.get('cp:' + id3);
ok('托管版申请：不用邮箱，官网凭专属网址编号认人', r.beta && r.beta.st === 'wait' && rec3.ap.hosted === true && rec3.ap.sub === 'hostabcd' && !rec3.ap.email && /^[A-Z2-9]{8}$/.test(rec3.ap.pid), JSON.stringify(rec3.ap));
w = await cp(C3, 'who');
ok('托管版申请框：邮箱是主账号的（打码） 不用登录', w.mail === 'ow***@x.com' && w.login === false && w.hosted === true && !w.lk, JSON.stringify(w));
ok('托管版：路由器钥匙不留在面板看的那份里', !JSON.stringify(r.sent).includes('r'.repeat(32)));
fs.writeFileSync(C3 + '/cloud.conf', 'URL=' + HUB + '/cloud\nRKEY=' + 'x'.repeat(32) + '\n'); fs.unlinkSync(C3 + '/compat_id');
r = await cp(C3, 'send', 'now');
ok('托管版钥匙不对：认不出，不算申请', r.beta && r.beta.st === 'err', JSON.stringify(r.beta));
await api('/api/admin/compat/beta', { id: id3, act: 'ok' }, ADM);
const nl = (await env.W.get('dev:hostabcd').ctx.storage.get('nlog')) || [];
ok('托管版通过：推送到手机（通知里记着）', nl.some((x) => /尝鲜申请通过了/.test(x.title)), JSON.stringify(nl).slice(0, 200));
ok('托管版通过：也发邮件到主账号的邮箱', MAIL.some((m) => (Array.isArray(m.to) ? m.to : [m.to]).includes('owner@x.com') && /尝鲜申请通过了/.test(m.subject)));
for (const d of [B2, C3]) fs.rmSync(d, { recursive: true, force: true });
for (const k of [id2, id3]) await H().ctx.storage.delete('cp:' + k);
{ const l = await H().ctx.storage.list({ prefix: 'cp:' }); for (const [k] of l) if (!cpBefore.has(k) && k !== 'cp:' + id) await H().ctx.storage.delete(k); }
// 这台路由器这一段报了很多次：清掉每天的上报次数（真的路由器一天只报一次）
for (const [k] of await H().ctx.storage.list({ prefix: 'r:cp' })) await H().ctx.storage.delete(k);
c = await cgi(A, 'compat_set', { on: true });
ok('面板：打开上报', c.result && c.result.on === true && !fs.existsSync(A + '/compat_off'));
c = await cgi(A, 'beta_set', { want: false });
ok('面板：退出尝鲜', c.result && c.result.beta.want === false && c.result.beta.st === 'none' && !fs.existsSync(A + '/beta_want'));
// 6.0 第 86 项：必须更新夜里自动装（默认开；关掉写 autoupd_off；重新打开时把失败次数也清掉，让它重新试）
c = await cgi(A, 'update_check');
ok('检查更新：告诉面板「必须更新自动装」默认开', c.result && c.result.auto === true, JSON.stringify(c.result));
c = await cgi(A, 'autoupd_set', { on: false });
ok('面板：关掉自动装（写 autoupd_off）', c.result && c.result.auto === false && fs.existsSync(A + '/autoupd_off'), JSON.stringify(c));
c = await cgi(A, 'update_check');
ok('检查更新：关掉以后 auto 是 false', c.result && c.result.auto === false, JSON.stringify(c.result));
fs.writeFileSync(A + '/autoupd_fail', '9.9.9 3\n');
c = await cgi(A, 'autoupd_set', { on: true });
// 6.0 第 85 项：新版本弹过记在路由器上（notices.seen 的 upd）；第一次建这个文件时记下 since（新装的只弹 7 天内的重要公告）
{
	const NS = A + '/notices.seen', had = fs.existsSync(NS) ? fs.readFileSync(NS, 'utf8') : null;
	if (fs.existsSync(NS)) fs.unlinkSync(NS);
	const t0 = Date.now();
	let u = await cgi(A, 'update_check');
	const s0 = fs.existsSync(NS) ? JSON.parse(fs.readFileSync(NS, 'utf8')) : null;
	ok('第一次：建 notices.seen 时带上 since（开始记的时间）', s0 && s0.since >= t0 - 5000 && s0.since <= Date.now() + 5000 && s0.t === s0.since && Array.isArray(s0.pop), JSON.stringify(s0));
	ok('检查更新：还没弹过任何版本（seen 是空的）', u.result && u.result.seen === '', JSON.stringify(u.result && u.result.seen));
	let w = await cgi(A, 'notices_seen', { upd: '9.9.9' });
	const s1 = JSON.parse(fs.readFileSync(NS, 'utf8'));
	ok('记下弹过的版本（upd），不改「看到哪儿了」', w.result && w.result.ok && s1.upd === '9.9.9' && s1.t === s0.t && s1.since === s0.since, JSON.stringify(s1));
	u = await cgi(A, 'update_check');
	ok('检查更新：告诉面板这个版本弹过了', u.result && u.result.seen === '9.9.9', JSON.stringify(u.result && u.result.seen));
	w = await cgi(A, 'notices_seen', { upd: '9.9.9; rm -rf /' });
	ok('版本号不对：拒绝，不写', !!w.error && JSON.parse(fs.readFileSync(NS, 'utf8')).upd === '9.9.9', JSON.stringify(w));
	// 6.0 第 93 项：老版本弹过的重要公告升级后算「知道了」（只在第一次补一次，之后新弹的不算）
	{ const o = JSON.parse(fs.readFileSync(NS, 'utf8')); delete o.ack; o.pop = ['bcdefghijk']; fs.writeFileSync(NS, JSON.stringify(o)); }
	await cgi(A, 'notices');
	await cgi(A, 'notices_seen', { pop: 'cdefghijkm' });
	{ const n0 = await cgi(A, 'notices'); ok('升级上来：以前弹过的算知道了；之后新弹的不算', n0.result && n0.result.seen.ack.join() === 'bcdefghijk' && n0.result.seen.pop.includes('cdefghijkm'), JSON.stringify(n0.result && n0.result.seen)); }
	// 6.0 第 93 项：重要公告点了「知道了」
	w = await cgi(A, 'notices_seen', { ack: 'abcdefghij' });
	let n = await cgi(A, 'notices');
	ok('重要公告点「知道了」：记下来（ack），通知里带回来', w.result && w.result.ok && n.result && n.result.seen.ack.includes('abcdefghij'), JSON.stringify(n.result && n.result.seen));
	w = await cgi(A, 'notices_seen', { ack: '../etc/x' });
	ok('公告编号不对：拒绝', !!w.error);
	if (had != null) fs.writeFileSync(NS, had); else fs.unlinkSync(NS);
}
ok('面板：重新打开（删掉 autoupd_off 和失败次数）', c.result && c.result.auto === true && !fs.existsSync(A + '/autoupd_off') && !fs.existsSync(A + '/autoupd_fail'), JSON.stringify(c));
await new Promise((z) => setTimeout(z, 1500));
r = await cp(A, 'send', 'now');
ok('退出后：官网那边也不再算尝鲜用户', !(await H().ctx.storage.get('cp:' + id)).beta && !(await H().ctx.storage.get('cp:' + id)).betaOk);
// ---- 公开的兼容性表 ----
const t = await api('/api/compat/table');
ok('官网公开兼容性表：按型号、按系统汇总，只有数量和能不能用', t.ok && t.routers === 2 && t.models.length >= 1 && t.systems.length >= 1 && !JSON.stringify(t).includes(id), JSON.stringify(t).slice(0, 200));
ok('兼容性表里有「开不了」算进去（暂停上网）', t.models.some((m) => m.feats.pause && m.feats.pause.n > m.feats.pause.ok));
// ---- 防乱报 ----
await api('/api/compat', { id: 'cbcdefghijkmnpqr', ver: '6.0.0', fails: [{ f: 'tunnel', why: '连不上 10.0.0.8，https://x.com/a，钥匙 qwertyuiopasdfghjklzxcvbnm12' }] });
{ const w = ((await H().ctx.storage.get('cp:cbcdefghijkmnpqr')).fails[0] || {}).why || '';
  ok('官网再洗一遍：老版本或改过的路由器报上来的 IP、网址、钥匙也不存', !/10\.0\.0\.8|x\.com|qwertyuiop/.test(w) && /<IP>/.test(w), w); }
{ const keys = [...(await H().ctx.storage.list({ prefix: '' })).keys()];
  ok('限次也不存 IP（只存摘要）', !keys.some((k) => /127\.0\.0\.1|::1|cpi:[0-9.:]+$/.test(k)), keys.filter((k) => /cpi/.test(k)).join(',')); }
ok('编号不对：不收', (await api('/api/compat', { id: 'x' })).error);
let lim = 0; for (let i = 0; i < 10; i++) { const x = await api('/api/compat', { id: 'abcdefghijkmnpqr', ver: '1.0.0' }); if (x.error) lim++; }
ok('同一个编号一天最多报 8 次', lim === 2, String(lim));
const big = await api('/api/compat', { id: 'bbcdefghijkmnpqr', model: 'x'.repeat(5000), fails: Array.from({ length: 50 }, (_, i) => ({ f: 'hack', why: '原因' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26)) })) });
const br = await H().ctx.storage.get('cp:bbcdefghijkmnpqr');
ok('乱填的：太长的截断，功能名不认识的算「其他」，一次最多 10 条', big.ok && br.model.length === 80 && br.fails.length === 10 && br.fails.every((x) => x.f === 'other'));
server.close();
console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
process.exit(results.every((r) => r[1]) ? 0 : 1);

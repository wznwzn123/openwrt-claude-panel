// 6.0 第 86 项：还停在旧版本的托管路由器，官网提醒主账号升级（推送 + 邮件），管理后台能手动提醒
import { load, memStorage } from './load.mjs';
const mod = await load();
const ov = await import(new URL('../oldver.js', import.meta.url).href);
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);

/* ---------- 纯函数 ---------- */
{
	const rvF = { version: '6.0.0', force: true, min: '' }, rvN = { version: '6.0.1', force: false, min: '' }, rvM = { version: '6.0.1', force: false, min: '6.0.0' };
	ok('必须更新：旧版本要提醒', ov.ovNeed(rvF, '5.2.3'));
	ok('必须更新：已经是最新不提醒', !ov.ovNeed(rvF, '6.0.0') && !ov.ovNeed(rvF, 'v6.0.0'));
	ok('必须更新：报不上版本的算很旧', ov.ovNeed(rvF, ''));
	ok('dev 这类不是数字的版本不管', !ov.ovNeed(rvF, 'dev'));
	ok('不是必须更新：自动不提醒', !ov.ovNeed(rvN, '5.2.3'));
	ok('不是必须更新：手动提醒照样提醒', ov.ovNeed(rvN, '5.2.3', true));
	ok('低于最低版本也算必须更新', ov.ovNeed(rvM, '5.2.3') && !ov.ovNeed(rvM, '6.0.0'));
	ok('最新版本信息不对就不提醒', !ov.ovNeed(null, '1.0.0') && !ov.ovNeed({ version: 'x' }, '1.0.0'));
	ok('v2.0.2 起一键更新能用', ov.ovSelf('2.0.2') && ov.ovSelf('5.2.3') && ov.ovSelf('v3.0.0'));
	ok('v2.0.1 及更早、报不上版本的一键更新用不了', !ov.ovSelf('2.0.1') && !ov.ovSelf('1.3.1') && !ov.ovSelf(''));
	ok('升级命令不带安装码', ov.ovCmd('x.example') === 'cd /tmp && wget -O p.tar.gz https://x.example/dl/openwrt-claude-panel-hosted.tar.gz && tar xzf p.tar.gz && cd openwrt-claude-panel && sh install.sh' && !/invite/.test(ov.ovCmd('x.example')));
}

/* ---------- 模拟环境 ---------- */
const env = { BASE_DOMAIN: 'panel.example', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: '', VAPID_PRIV: '', RESEND_API_KEY: 're_test' };
const ns = (Cls) => { const objs = new Map(); return { objs, idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
let REL = { tag_name: 'v6.0.0', body: '## 这个版本的更新\n- 安全更新\n\n【必须更新】', published_at: '2026-12-01T00:00:00Z' };
const MAILS = [];
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url;
	if (url === 'https://api.resend.com/emails') { MAILS.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); }
	if (url.endsWith('/releases/latest') && url.includes('api.github.com')) return new Response(JSON.stringify(REL), { headers: { 'content-type': 'application/json' } });
	return new Response('{}', { status: 404 });
};
const PUSH = [];
mod.Watch.prototype.push = async function (m) { PUSH.push({ sub: this.__sub, ...m }); return 1; };
let T = Date.parse('2026-12-01T10:00:00Z'); Date.now = () => T;
const DAY = 86400e3;
const hub = () => env.H.get('hub'), S = () => hub().ctx.storage;
const beat = async (sub, ver, last = T) => { const w = env.W.get('dev:' + sub); w.__sub = sub; await w.ctx.storage.put('r', { last, rep: ver ? { ver } : {} }); };
const addDev = async (sub, o = {}) => S().put('d:' + sub, { sub, state: 'ok', created: T - 30 * DAY, seen: T, name: '路由器' + sub.slice(0, 2), users: ['uidaaaaaaaaa'], ...o });
await S().put('u:uidaaaaaaaaa', { uid: 'uidaaaaaaaaa', email: 'main@example.com', verified: true });
await S().put('u:uidbbbbbbbbb', { uid: 'uidbbbbbbbbb', email: 'nover@example.com', verified: false });
await addDev('aaaaaaaa'); await beat('aaaaaaaa', '5.2.3');                     // 能一键更新
await addDev('bbbbbbbb'); await beat('bbbbbbbb', '2.0.1');                     // 一键更新有毛病：给命令
await addDev('cccccccc'); await beat('cccccccc', '');                          // 报不上版本（v1.3.0 及更早）：给命令
await addDev('dddddddd'); await beat('dddddddd', '6.0.0');                     // 已经是最新
await addDev('eeeeeeee'); await beat('eeeeeeee', '5.0.0', T - 40 * DAY);       // 40 天没上线
await addDev('ffffffff', { off: true, offWhy: 'exp' }); await beat('ffffffff', '5.0.0'); // 到期暂停
await addDev('gggggggg', { users: ['uidbbbbbbbbb'] }); await beat('gggggggg', '4.0.1'); // 主账号邮箱没验证：只推送
await addDev('hhhhhhhh', { state: 'pending' });                               // 还在开通
await addDev('jjjjjjjj'); /* 装好还没发过心跳 */
const adm = (method, path, body) => mod.default.fetch(new Request('https://panel.example/api/admin' + path, { method, body: body == null ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', authorization: 'Bearer admin-key-1234567890' } }), env);

/* ---------- 定时任务：第一次马上提醒 ---------- */
await mod.default.scheduled({}, env);
const subsOf = (L) => L.map((x) => x.sub).sort().join(',');
ok('定时任务：该提醒的都提醒了一次', subsOf(PUSH) === 'aaaaaaaa,bbbbbbbb,cccccccc,gggggggg', subsOf(PUSH));
ok('已是最新、40 天没上线、到期暂停、开通中、没发过心跳的都不提醒', !PUSH.some((p) => ['dddddddd', 'eeeeeeee', 'ffffffff', 'hhhhhhhh', 'jjjjjjjj'].includes(p.sub)));
const pa = PUSH.find((p) => p.sub === 'aaaaaaaa'), pb = PUSH.find((p) => p.sub === 'bbbbbbbb'), pc = PUSH.find((p) => p.sub === 'cccccccc');
ok('能一键更新的：推送说打开面板点一键更新', /一键更新/.test(pa.body) && /必须更新/.test(pa.title) && /v5\.2\.3/.test(pa.body) && pa.tag === 'upd', pa.body);
ok('v2.0.1：推送说要手动升级一次', /要手动升级一次/.test(pb.body) && /用不了/.test(pb.body), pb.body);
ok('报不上版本的：推送说「很旧的版本」', /很旧的版本/.test(pc.body), pc.body);
ok('推送点开回面板首页检查更新', pa.url === './?p=home&ask=update');
ok('推送和邮件里都没有钥匙、登录地址', !JSON.stringify([PUSH, MAILS]).match(/rkey|token|\/cgi-bin\/mcp\//i));
const toMain = MAILS.filter((m) => [].concat(m.to).includes('main@example.com'));
ok('主账号收到邮件（每台一封）', toMain.length === 3, String(toMain.length));
ok('邮箱没验证的不发邮件（推送照发）', !MAILS.some((m) => [].concat(m.to).includes('nover@example.com')) && PUSH.some((p) => p.sub === 'gggggggg'));
const mb = toMain.find((m) => /路由器bb/.test(m.html)), ma = toMain.find((m) => /路由器aa/.test(m.html));
ok('老版本的邮件里有升级命令（不带安装码）', mb && mb.html.includes('https://panel.example/dl/openwrt-claude-panel-hosted.tar.gz') && !/--invite/.test(mb.html));
ok('能一键更新的邮件里没有命令、教打开面板', ma && !ma.html.includes('wget') && /一键更新/.test(ma.html));
ok('邮件内容转义了路由器名字', (await (async () => { await S().put('d:kkkkkkkk', { sub: 'kkkkkkkk', state: 'ok', name: '<b>x</b>', users: ['uidaaaaaaaaa'] }); await beat('kkkkkkkk', '5.0.0'); const r = await hub().ovTick({ version: '6.0.0', force: true }); const m = MAILS.at(-1); return r.list.includes('kkkkkkkk') && m.html.includes('&lt;b&gt;x&lt;/b&gt;') && !m.html.includes('<b>x</b>'); })()));
const rec = await S().get('ov:aaaaaaaa');
ok('记下提醒：时间、目标版本、第几次、自动', rec && rec.at === T && rec.to === '6.0.0' && rec.n === 1 && rec.by === 'auto' && rec.mail === true && rec.push === 1, JSON.stringify(rec));

/* ---------- 节奏：6 小时内不再看；一周内不再提醒；满一周再提醒 ---------- */
let n0 = PUSH.length;
T += 3 * 3600e3; await mod.default.scheduled({}, env);
ok('6 小时内不再扫', PUSH.length === n0);
T += 4 * 3600e3; await mod.default.scheduled({}, env);
ok('过了 6 小时再扫，但一周内提醒过的不再提醒', PUSH.length === n0);
T += 7 * DAY; await mod.default.scheduled({}, env);
ok('满一周再提醒一次', PUSH.length > n0 && PUSH.slice(n0).some((p) => p.sub === 'aaaaaaaa'));
ok('第二次提醒记成第 2 次', (await S().get('ov:aaaaaaaa')).n === 2);
/* ---------- 用户 11/27：同一个版本最多自动提醒 3 次（发现时、1 周后、再 2 周后） ---------- */
const T_SAVE = T, REL_SAVE = REL; // 这一段把时间往后拨了很多：做完拨回来，后面的测试不受影响（试用会到期）
await beat('aaaaaaaa', '5.2.3');
T += 8 * DAY; n0 = PUSH.length; await mod.default.scheduled({}, env);
ok('第 2 次以后：过了 1 周还不提醒（要等 2 周）', !PUSH.slice(n0).some((p) => p.sub === 'aaaaaaaa'));
await beat('aaaaaaaa', '5.2.3');
T += 7 * DAY; n0 = PUSH.length; await mod.default.scheduled({}, env);
ok('第 2 次后满 2 周：第 3 次', PUSH.slice(n0).some((p) => p.sub === 'aaaaaaaa') && (await S().get('ov:aaaaaaaa')).n === 3);
for (let i = 0; i < 4; i++) { await beat('aaaaaaaa', '5.2.3'); T += 15 * DAY; n0 = PUSH.length; await mod.default.scheduled({}, env); if (PUSH.slice(n0).some((p) => p.sub === 'aaaaaaaa')) break; }
ok('提醒满 3 次：之后不再自动提醒', (await S().get('ov:aaaaaaaa')).n === 3 && !PUSH.slice(n0).some((p) => p.sub === 'aaaaaaaa'));
const mlast = MAILS.filter((m) => /aaaaaaaa|主路由/.test(m.html) || true).pop();
ok('邮件底下有「不再提醒这台路由器」的链接', mlast && /https:\/\/panel\.example\/app\?ovoff=[a-z]+/.test(mlast.html) && /不再提醒这台路由器/.test(mlast.html) && /最多提醒 3 次/.test(mlast.html));
/* ---------- 主人点了「不再提醒」：自动、手动都不再发；只有主账号能关 ---------- */
{
	const { ovAccount } = ov;
	const d = await S().get('d:aaaaaaaa'), own = hub().famOf(d).owner;
	let r = await ovAccount('ov_off', hub(), { uid: 'someoneelse1' }, { sub: 'aaaaaaaa' });
	ok('不是主账号：关不了', r.status === 403 && !(await S().get('ovoff:aaaaaaaa')));
	r = await ovAccount('ov_off', hub(), { uid: own }, { sub: 'aaaaaaaa', peek: true });
	const pj = await r.json();
	ok('确认框先拿名字、现在开没开', pj.ok && pj.off === false && pj.name, JSON.stringify(pj));
	r = await ovAccount('ov_off', hub(), { uid: own }, { sub: 'aaaaaaaa' });
	ok('主账号：关掉了', r.status === 200 && !!(await S().get('ovoff:aaaaaaaa')));
	ok('别的账号接口不管', (await ovAccount('xx', hub(), { uid: own }, {})) === null);
	REL = { tag_name: 'v6.0.0', body: '【必须更新】', published_at: '2026-12-01T00:00:00Z' };
	await S().delete('ov:aaaaaaaa'); await beat('aaaaaaaa', '5.2.3');
	T += DAY; n0 = PUSH.length; const nm = MAILS.length;
	const r2 = await hub().ovTick({ version: '6.0.0', force: true, min: '' });
	ok('关了提醒：自动不发', !PUSH.slice(n0).some((p) => p.sub === 'aaaaaaaa') && MAILS.length === nm);
	const r3 = await hub().ovTick({ version: '6.0.0', force: true, min: '' }, { subs: ['aaaaaaaa'] });
	ok('关了提醒：后台手动提醒也跳过', r3.sent === 0 && !PUSH.slice(n0).some((p) => p.sub === 'aaaaaaaa'));
	await S().delete('ovoff:aaaaaaaa'); await S().delete('ov:aaaaaaaa');
	T = T_SAVE; REL = REL_SAVE; await hub().setMeta('ovScan', { at: 0, ver: '' }); await beat('aaaaaaaa', '5.2.3');
}

/* ---------- 升级了：不再提醒，记录清掉 ---------- */
await beat('aaaaaaaa', '6.0.0');
T += 8 * DAY; n0 = PUSH.length; await mod.default.scheduled({}, env);
ok('升级了就不再提醒', !PUSH.slice(n0).some((p) => p.sub === 'aaaaaaaa'));
ok('升级后提醒记录清掉', !(await S().get('ov:aaaaaaaa')));

/* ---------- 发了新的必须更新：马上再扫、从第 1 次算 ---------- */
REL = { tag_name: 'v6.0.1', body: '## 这个版本的更新\n- 修复\n\n【必须更新】', published_at: '2026-12-20T00:00:00Z' };
await beat('aaaaaaaa', '6.0.0'); await beat('bbbbbbbb', '2.0.1');
// 版本缓存在测试里没有（caches 不存在），新版本马上能读到；6 小时内也因为版本变了而重新扫
T += 3600e3; n0 = PUSH.length; await mod.default.scheduled({}, env);
ok('发了新的必须更新：6 小时内也马上提醒', PUSH.slice(n0).some((p) => p.sub === 'aaaaaaaa' && /v6\.0\.1/.test(p.title)));
ok('换了目标版本：从第 1 次算', (await S().get('ov:aaaaaaaa')).n === 1 && (await S().get('ov:aaaaaaaa')).to === '6.0.1');

/* ---------- 不是必须更新：不自动提醒 ---------- */
REL = { tag_name: 'v6.0.2', body: '## 这个版本的更新\n- 小改进', published_at: '2026-12-25T00:00:00Z' };
await S().delete('ov:aaaaaaaa'); await beat('aaaaaaaa', '6.0.1');
T += 3600e3; n0 = PUSH.length; await mod.default.scheduled({}, env);
ok('不是必须更新：不自动提醒', !PUSH.slice(n0).some((p) => p.sub === 'aaaaaaaa'));

/* ---------- 管理后台：手动提醒 ---------- */
await beat('dddddddd', '6.0.2'); // 这台跟着升到了最新
let r =await adm('POST', '/oldver', { subs: ['aaaaaaaa', 'dddddddd', 'ffffffff', 'nope', 'eeeeeeee'] });
let j = await r.json();
ok('手动提醒：不是必须更新也提醒；最新、停用、很久没上线的跳过', r.status === 200 && j.sent === 1 && j.list.join() === 'aaaaaaaa' && j.skip === 3, JSON.stringify(j));
const pm = PUSH.at(-1);
ok('手动提醒的说法：可以更新（不说必须）', /可以更新到 v6\.0\.2/.test(pm.title) && !/必须/.test(pm.body), pm.title + ' / ' + pm.body);
ok('手动提醒记成 admin', (await S().get('ov:aaaaaaaa')).by === 'admin');
r = await adm('POST', '/oldver', { subs: ['aaaaaaaa'] }); j = await r.json();
ok('同一台 12 小时内只手动提醒一次', j.sent === 0 && j.skip === 1, JSON.stringify(j));
T += 13 * 3600e3; r = await adm('POST', '/oldver', { subs: ['aaaaaaaa'] }); j = await r.json();
ok('过了 12 小时能再手动提醒', j.sent === 1);
r = await adm('POST', '/oldver', { subs: [] });
ok('没选路由器：400', r.status === 400);
r = await mod.default.fetch(new Request('https://panel.example/api/admin/oldver', { method: 'POST', body: '{"subs":["aaaaaaaa"]}', headers: { 'content-type': 'application/json' } }), env);
ok('没登录管理后台不能调', r.status === 401 || r.status === 403, String(r.status));
const log = (await (await adm('GET', '/log')).json()).list || [];
ok('手动提醒记进操作记录', log.some((x) => x.op === 'oldver' && /提醒升级到 v6\.0\.2/.test(x.detail || '')), JSON.stringify(log.slice(0, 2)));
const dl = (await (await adm('GET', '/devices')).json()).list || [];
const da = dl.find((d) => d.sub === 'aaaaaaaa');
ok('后台路由器列表带着提醒记录', da && da.ov && da.ov.n >= 1 && da.ov.by === 'admin', JSON.stringify(da && da.ov));
ok('没提醒过的路由器 ov 是 null', dl.find((d) => d.sub === 'jjjjjjjj').ov === null);

/* ---------- 查不到最新版本：什么都不发 ---------- */
REL = null;
globalThis.fetch = async (input, init = {}) => { const url = typeof input === 'string' ? input : input.url; if (url === 'https://api.resend.com/emails') { MAILS.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); } return new Response('', { status: 500 }); };
await S().delete('m:rver');
T += 8 * DAY; n0 = PUSH.length; await mod.default.scheduled({}, env);
ok('查不到最新版本：不提醒', PUSH.length === n0);

/* ---------- 用户 11/27：后台单独开关某台的升级提醒 ---------- */
{
	let r = await adm('POST', '/devices/aaaaaaaa/ovoff', {});
	ok('后台关掉一台的升级提醒', r.status === 200 && (await S().get('ovoff:aaaaaaaa')).by === 'admin');
	let l = await (await adm('GET', '/devices')).json();
	ok('路由器列表里标出提醒关了', l.list.find((d) => d.sub === 'aaaaaaaa').ovOff === true && l.list.find((d) => d.sub === 'bbbbbbbb').ovOff === false);
	r = await adm('POST', '/devices/aaaaaaaa/ovon', {});
	ok('后台再打开', r.status === 200 && !(await S().get('ovoff:aaaaaaaa')));
	r = await adm('POST', '/devices/zzzzzzzz/ovoff', {});
	ok('没有这台：不记', r.status === 404 && !(await S().get('ovoff:zzzzzzzz')));
	r = await mod.default.fetch(new Request('https://panel.example/api/admin/devices/aaaaaaaa/ovoff', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }), env);
	ok('没有管理员密钥：不让改', r.status === 401 && !(await S().get('ovoff:aaaaaaaa')));
}

let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  → ' + note)); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

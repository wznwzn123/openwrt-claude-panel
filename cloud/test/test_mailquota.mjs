// 6.0 第 77 项：邮件发送到了每日上限
// - 要收邮件才能做完的（注册、找回密码、新设备登录、确认本人）：当天先不让做，说明原因、请明天再试；不会因此跳过验证
// - 影响小的（报告问题、面板反馈、续期申请）：照常提交，只提醒今天发不了确认邮件
// - 快用满（八成）、用满时提醒管理员（推送 + 操作记录 + 邮件记录页）；给用户的提示不说具体额度
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);

const MAIL = []; let mode = 'ok'; let calls = 0;
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] }));
	if (u.hostname === 'api.resend.com') {
		calls++;
		if (mode === 'quota') return new Response(JSON.stringify({ name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota.' }), { status: 429 });
		if (mode === 'rate1') { mode = 'ok'; return new Response(JSON.stringify({ name: 'rate_limit_exceeded', message: 'Too many requests' }), { status: 429 }); }
		MAIL.push(JSON.parse(init.body)); return new Response('{"id":"m"}');
	}
	if (u.hostname !== 'api.cloudflare.com') return new Response('{}');
	if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 'tun' + Math.random(), token: 'tok' });
	if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'dns' + Math.random() });
	return R({});
};
const env = { OLD_ADMIN: '1', BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: '', VAPID_PRIV: '', RESEND_API_KEY: 're_test', MAIL_FROM: 'noreply@panel.example', ADMIN_EMAIL: 'boss@x.com', MAIL_DAILY: '20' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const hub = () => env.H.get('hub');
const S = () => hub().ctx.storage;
async function call(c, path, body, extra = {}) {
	const h = { 'content-type': 'application/json', origin: 'https://panel.example', 'cf-connecting-ip': extra.ip || '1.1.1.1', 'user-agent': extra.ua || 'Mozilla/5.0 Chrome/120', ...(extra.headers || {}) };
	if (c && (c.sid || c.did)) h.cookie = [c.sid && '__Host-sid=' + c.sid, c.did && '__Host-did=' + c.did].filter(Boolean).join('; ');
	const res = await mod.default.fetch(new Request('https://panel.example' + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
	const sc = res.headers.get('set-cookie');
	if (c && sc) { const m = /sid=([a-z2-9]*);/.exec(sc); if (m || !/did=/.test(sc)) c.sid = m ? m[1] : ''; const d = /did=([a-z2-9]{32});/.exec(sc); if (d) c.did = d[1]; }
	let j = {}; try { j = await res.json(); } catch (e) {}
	return { st: res.status, j };
}
const ADMH = { authorization: 'Bearer admin-key-1234567890', 'content-type': 'application/json' };
const adm = async (path, body) => (await mod.default.fetch(new Request('https://panel.example' + path, { method: body ? 'POST' : 'GET', headers: ADMH, body: body ? JSON.stringify(body) : undefined }), env)).json();
const lastCode = () => (MAIL.slice(-1)[0].html.match(/>(\d{6})</) || [])[1];
const noNumber = (s) => !/\d/.test(String(s || '')); // 给用户的提示里不出现具体额度

// 准备：一个账号（注册时要收验证码），一台路由器
const A = { sid: '', did: '' };
await call(null, '/api/account/code', { email: 'amy@x.com', kind: 'reg' }, { ip: '2.2.2.1' });
let r = await call(A, '/api/account/register', { email: 'amy@x.com', password: 'amy-pass-123', code: lastCode() });
ok('准备：注册成功', r.st === 200 && !!A.sid, JSON.stringify(r.j));
const inv = (await adm('/api/admin/invites', { direct: true, max: 5 })).invite.code;
const R1 = await (await mod.default.fetch(new Request('https://panel.example/api/register', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '9.0.0.1' }, body: JSON.stringify({ invite: inv, name: 'Living', model: 'x' }) }), env)).json();
const uidA = await S().get('e:amy@x.com');
{ const d = await S().get('d:' + R1.sub); d.users = [uidA]; d.owner = uidA; await S().put('d:' + R1.sub, d); }

// ---- 平时：照常发，记数 ----
let q = await adm('/api/admin/mails');
ok('后台邮件记录带今天的额度情况', q.quota && q.quota.sent >= 1 && q.quota.cap === 20 && !q.quota.full && !q.quota.warn, JSON.stringify(q.quota));
// 被限速（每秒太多）：等一下自动再试一次，不算用满
mode = 'rate1'; const c0 = calls;
r = await call(null, '/api/account/code', { email: 'ben@x.com', kind: 'reg' }, { ip: '2.2.2.2' });
ok('被邮件服务限速：自动再试一次就发出去了', r.st === 200 && calls - c0 === 2, JSON.stringify(r.j) + ' calls=' + (calls - c0));

// ---- 快用满（八成）：提醒管理员一次 ----
{ const s = await hub().mailStat(); s.n = 15; await S().put('mq', s); }
await call(null, '/api/account/code', { email: 'cat@x.com', kind: 'reg' }, { ip: '2.2.2.3' });
let alog = await hub().adminLog();
ok('发到八成：记一笔「快用完了」提醒管理员', alog.some((x) => x.op === 'mail_quota' && /快用完/.test(x.detail)), JSON.stringify(alog.slice(0, 3)));
q = await adm('/api/admin/mails');
ok('后台：显示「快用完了」', q.quota.warn && !q.quota.full, JSON.stringify(q.quota));
await call(null, '/api/account/code', { email: 'dan@x.com', kind: 'reg' }, { ip: '2.2.2.4' });
ok('「快用完了」一天只提醒一次', (await hub().adminLog()).filter((x) => x.op === 'mail_quota').length === 1);

// 自己数到了上限、但邮件服务没说满（比如套餐额度更大）：照常发，不误拦
{ const s = await hub().mailStat(); s.n = 25; await S().put('mq', s); }
r = await call(null, '/api/account/code', { email: 'ida@x.com', kind: 'reg' }, { ip: '2.2.2.10' });
ok('自己数超过了、邮件服务还收：照常发（只听邮件服务的）', r.st === 200, JSON.stringify(r.j));
// ---- 邮件服务说额度用完了 ----
mode = 'quota';
r = await call(null, '/api/account/code', { email: 'eve@x.com', kind: 'reg' }, { ip: '2.2.2.5' });
ok('注册：额度用完时说明原因、请明天再试', r.st === 503 && r.j.mailFull && /明天再试/.test(r.j.error) && /每天有上限/.test(r.j.error), JSON.stringify(r.j));
ok('提示里不说具体额度（没有数字）', noNumber(r.j.error), r.j.error);
alog = await hub().adminLog();
ok('用满：再提醒管理员一次「用完了」', alog.filter((x) => x.op === 'mail_quota').length === 2 && /用完了/.test(alog[0].detail));
q = await adm('/api/admin/mails');
ok('后台：显示「今天的额度用完了」', q.quota.full, JSON.stringify(q.quota));
ok('邮件记录里写明没发的原因', /额度/.test((await hub().mailList())[0].err || ''), JSON.stringify((await hub().mailList())[0]));
mode = 'ok';
// 用满以后：要收验证码的都先停（不再去打扰邮件服务）
let c1 = calls;
r = await call(null, '/api/account/code', { email: 'fay@x.com', kind: 'reg' }, { ip: '2.2.2.6' });
ok('用满以后：注册验证码直接说明天再试，不去发', r.st === 503 && r.j.mailFull && calls === c1, JSON.stringify(r.j));
r = await call(null, '/api/account/code', { email: 'amy@x.com', kind: 'reset' }, { ip: '2.2.2.7' });
const r2 = await call(null, '/api/account/code', { email: 'nobody@x.com', kind: 'reset' }, { ip: '2.2.2.8' });
ok('找回密码：同样说明天再试；注册过和没注册过的邮箱回答一样（看不出邮箱有没有注册）', r.st === 503 && r2.st === 503 && r.j.error === r2.j.error, JSON.stringify([r.j, r2.j]));
ok('注册不能绕过验证码（邮件发不出也不放行）', (await call({}, '/api/account/register', { email: 'fay@x.com', password: 'fay-pass-123' })).st === 400);
// 新设备登录
const N = { sid: '', did: '' };
r = await call(N, '/api/account/login', { email: 'amy@x.com', password: 'amy-pass-123' }, { ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile', ip: '3.3.3.3' });
ok('新设备登录：说明天再试，也没有登进去（不跳过验证）', r.st === 503 && r.j.mailFull && !N.sid && /明天再试/.test(r.j.error), JSON.stringify(r.j));
// 已经验证过的设备：只要密码，不受影响
await call(A, '/api/account/logout', {});
r = await call(A, '/api/account/login', { email: 'amy@x.com', password: 'amy-pass-123' });
ok('验证过的设备照常登录（不用收邮件）', r.st === 200 && !!A.sid, JSON.stringify(r.j));
// 确认本人（面板、官网、选主账号）
r = await hub().famSudoCode(R1.sub, uidA);
ok('面板「确认是你本人」：说明天再试', r.st === 503 && r.mailFull, JSON.stringify(r));
r = await hub().webSudoCode(uidA);
ok('官网「确认是你本人」：说明天再试', r.st === 503 && r.mailFull, JSON.stringify(r));
ok('没有因为发不出验证码就给通行证', !r.sudo && !r.ok);
// 影响小的：照常收，只提醒
c1 = calls;
r = await call(A, '/api/report', { kind: 'other', text: '这是一个测试报告，内容超过十个字' }, { ip: '4.4.4.4' });
ok('报告问题：照常提交，带提醒「今天发不了确认邮件」', r.st === 200 && r.j.ok && /发不了确认邮件/.test(r.j.mailNote || ''), JSON.stringify(r.j));
ok('报告问题的提醒里不说具体额度', noNumber(r.j.mailNote));
r = await (await mod.default.fetch(new Request('https://panel.example/api/dev/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sub: R1.sub, rkey: R1.rkey, uid: uidA, text: '面板反馈测试内容' }) }), env)).json();
ok('面板反馈：照常收到，带提醒', r.ok && /发不了确认邮件/.test(r.mailNote || ''), JSON.stringify(r));
ok('影响小的提交没去打扰邮件服务', calls === c1);
const fbl = await S().get('fbl');
ok('报告和反馈都进了后台（开发者能看到）', fbl.some((x) => /测试报告/.test(x.text)) && fbl.some((x) => /面板反馈测试/.test(x.text)));
// ---- 第二天：自动恢复 ----
{ const s = await S().get('mq'); s.day = '2000-01-01'; await S().put('mq', s); }
r = await call(null, '/api/account/code', { email: 'gus@x.com', kind: 'reg' }, { ip: '2.2.2.9' });
ok('第二天：自动恢复，验证码照常发', r.st === 200 && MAIL.slice(-1)[0].to[0] === 'gus@x.com', JSON.stringify(r.j));
q = await adm('/api/admin/mails');
ok('第二天：计数从头算，不显示用满', !q.quota.full && q.quota.sent === 1, JSON.stringify(q.quota));
r = await call(A, '/api/report', { kind: 'other', text: '第二天的测试报告，内容超过十个字' }, { ip: '4.4.4.5' });
ok('第二天：报告不再带提醒', r.st === 200 && !r.j.mailNote, JSON.stringify(r.j));
// 后台路由要管理员密钥
ok('邮件额度情况只有管理员能看', (await call(null, '/api/admin/mails')).st === 401);

console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 400) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
process.exit(results.every((r) => r[1]) ? 0 : 1);

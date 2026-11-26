// 6.0 第 91 项：后台点进某个人，一页看到他的资料和全部记录（只算官网账号上的），按种类筛、能搜；不出现钥匙和密码；查看也记一笔
// 用法：node test/test_userfull.mjs [--shots 目录]
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
const realFetch = globalThis.fetch;
let CFn = 0;
const MAILS = [];
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (u.hostname === 'api.cloudflare.com') { const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] })); if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 'tun' + ++CFn, token: 'tok' }); if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'dns' + ++CFn }); return R({}); }
	if (url === 'https://api.resend.com/emails') { MAILS.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); }
	if (u.hostname === 'localhost') return realFetch(input, init);
	if (u.hostname === 'api.github.com') return new Response(JSON.stringify({ tag_name: 'v4.0.0', assets: [{ name: 'router-panel.apk' }], body: '## 4.0\n- 通知', published_at: '2026-11-14T00:00:00Z' }));
	return new Response('{}');
};
const env = { OLD_ADMIN: '1', BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '', RESEND_API_KEY: 're', ADMIN_EMAIL: 'boss@x.com' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const hd = { ...req.headers, 'cf-connecting-ip': req.headers['x-ip'] || '127.0.0.1' };
	const r0 = new Request('http://localhost' + req.url, { method: req.method, headers: hd, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
	const r1 = Object.assign(r0, { cf: { country: 'TW', city: 'Taipei' } });
	const r = await mod.default.fetch(r1, env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
	res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8147, z));
const B = 'http://localhost:8147';
const api = async (path, body, hdr = {}, method) => (await realFetch(B + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const H = env.H.get('hub');
/* ---------- 准备数据：一个账号（直接写进存储），他的路由器、登录、邮件、反馈、续期申请、对话、安装码 ---------- */
const st = H.ctx.storage, now = Date.now(), UID = 'abcdefgh2345', EM = 'ming@x.com';
const inv = (await api('/api/admin/invites', { direct: true, max: 5, svc: 30, note: '给阿明' }, ADM)).invite.code;
const R1 = await api('/api/register', { invite: inv, name: '客厅 Kwrt', model: 'JDCloud AX1800 Pro' });
const R2 = await api('/api/register', { invite: inv, name: '别人的路由器', model: 'x86' });
await st.put('u:' + UID, { uid: UID, email: EM, name: '阿明', created: now - 30 * 864e5, verified: true, totp: true, lastAt: now - 3600e3, devs: [{ sub: R1.sub, at: now - 20 * 864e5 }], sids: [], trialUsed: 1, inst: [] });
await st.put('e:' + EM, UID);
{ const d = await st.get('d:' + R1.sub); d.users = [UID]; d.owner = UID; await st.put('d:' + R1.sub, d); }
await H.rlog(R1.sub, '⏸', '阿明 暂停了「iPad」上网');
await H.rlog(R2.sub, '⏸', '别人的操作，不该出现');
await H.loginLog({ k: 'login', who: EM, ok: true, ip: '1.2.3.4', place: '台北', ua: 'iPhone · Safari' });
await H.loginLog({ k: 'login', who: EM, ok: false, why: '密码不对', ip: '5.6.7.8', place: '香港', ua: '电脑 · Chrome' });
await H.loginLog({ k: 'login', who: 'other@x.com', ok: true, ip: '9.9.9.9' });
await H.mailLog(EM, '新设备登录验证码', true, '');
await H.mailLog('other@x.com', '别人的邮件', true, '');
await H.alog('extend', R1.sub, '加了 30 天');
await H.alog('extend', R2.sub, '别人的路由器加天数');
await st.put('i:TRIALCODE9', { code: 'TRIALCODE9', uid: UID, trial: true, max: 1, used: 1, exp: now + 864e5, svc: 7, at: now - 25 * 864e5 });
await api('/api/dev/feedback', { sub: R1.sub, rkey: R1.rkey, text: '首页的流量图不动了', contact: '微信 ming' });
await api('/api/chat', { sub: R1.sub, rkey: R1.rkey, op: 'send', text: '节点页打不开了' });
await st.put('ap:' + R1.sub, { id: 'ap1', sub: R1.sub, uid: UID, email: EM, name: '客厅 Kwrt', source: '朋友介绍', note: '想再用一段时间', at: now - 2 * 864e5, status: 'pending' });
/* ---------- 接口 ---------- */
let r = await api('/api/admin/users/' + UID + '/full', null, ADM);
const ks = new Set(r.events.map((x) => x.k)), txt = JSON.stringify(r);
ok('接口：资料、路由器、安装码都在', r.ok && r.profile.email === EM && r.profile.totp && r.devs.length === 1 && r.devs[0].role === '主账号' && r.codes.some((x) => x.code === 'TRIALCODE9'), JSON.stringify(r).slice(0, 300));
ok('接口：登录、操作、路由器、邮件、反馈、续期、对话、安装码 8 种记录都有', ['login', 'op', 'router', 'mail', 'fb', 'app', 'chat', 'code'].every((k) => ks.has(k)), [...ks].join());
ok('接口：只有他的，别人的一条都没有', !txt.includes('other@x.com') && !txt.includes('别人的') && !txt.includes('9.9.9.9'));
ok('接口：登录失败带原因、IP、地点', r.events.some((x) => x.k === 'login' && x.ok === false && x.detail === '密码不对' && x.ip === '5.6.7.8' && x.place === '香港'));
ok('接口：按时间从新到旧', r.events.every((x, i, a) => !i || a[i - 1].t >= x.t));
ok('接口：不出现钥匙、隧道令牌', ![R1.rkey, R1.tkey, R1.pkey, R1.token].some((k) => txt.includes(k)));
ok('接口：要管理员密钥', (await realFetch(B + '/api/admin/users/' + UID + '/full')).status === 401);
ok('接口：没有这个人 → 404', (await realFetch(B + '/api/admin/users/zzzzzzzzzzzz/full', { headers: ADM })).status === 404);
let log = (await api('/api/admin/log', null, ADM)).list;
ok('查看本身也记一笔（操作记录里「查看账号记录」）', log.some((x) => x.op === 'user-view' && x.target === EM));
await api('/api/admin/users/' + UID + '/full', null, ADM);
log = (await api('/api/admin/log', null, ADM)).list;
ok('同一个人 1 小时内再看不重复记', log.filter((x) => x.op === 'user-view').length === 1);
/* ---------- 后台页面（手机、电脑） ---------- */
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const browser = await chromium.launch();
const DEV = {
	iphone: { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
	small: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
	mac: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
let n = 0;
for (const [dn, dv] of Object.entries(DEV)) for (const dark of [false, true]) {
	if (dark && dn === 'small') continue;
	const tag = ` [${dn}${dark ? ' 深色' : ''}]`;
	const ctx = await browser.newContext({ ...dv, colorScheme: dark ? 'dark' : 'light', extraHTTPHeaders: { 'x-ip': '10.8.' + (n++) + '.1' } });
	const page = await ctx.newPage(); const errs = [];
	page.on('pageerror', (e) => errs.push(e.message));
	await page.goto(B + '/admin'); await W(1200);
	await page.fill('input[type=password]', 'admin-key-1234567890'); await page.click('button[type=submit]'); await W(2200);
	await page.goto(B + '/admin#/users'); await W(1500);
	const row = page.locator('.hub-row', { hasText: EM });
	ok('账号列表里有「全部记录」' + tag, (await row.locator('button', { hasText: '全部记录' }).count()) === 1);
	await row.locator('button', { hasText: '全部记录' }).click(); await W(1600);
	ok('点进去：资料、路由器、全部记录' + tag, page.url().includes('#/users/' + UID) && /阿明/.test(await page.textContent('.page')) && /客厅 Kwrt/.test(await page.textContent('.page')) && /全部记录/.test(await page.textContent('.page')));
	const chips = await page.locator('.segmented button').allTextContents();
	ok('按种类筛的按钮带数量' + tag, chips.some((x) => /^全部 \d+/.test(x)) && chips.some((x) => /^登录 2/.test(x)), chips.join('|'));
	await page.locator('.segmented button', { hasText: '登录' }).click(); await W(300);
	ok('只看登录：2 条，带 IP 和地点' + tag, (await page.locator('.ud-ev').count()) === 2 && /5\.6\.7\.8/.test(await page.textContent('.page')) && /香港/.test(await page.textContent('.page')));
	await page.locator('.segmented button', { hasText: '全部' }).first().click(); await W(300);
	await page.fill('input[placeholder="搜内容、IP、地点"]', '流量图'); await W(400);
	ok('搜索：只剩那条反馈' + tag, (await page.locator('.ud-ev').count()) === 1 && /反馈/.test(await page.locator('.ud-ev').first().textContent()));
	await page.fill('input[placeholder="搜内容、IP、地点"]', ''); await W(300);
	const lay = await page.evaluate(() => ({ ow: document.documentElement.scrollWidth - innerWidth, cut: [...document.querySelectorAll('.hub-row-title, .hub-row-meta, .kv-value')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').length }));
	ok('排版：不横向滚动、文字不被截' + tag, lay.ow <= 0 && !lay.cut, JSON.stringify(lay));
	if (SHOTS) await page.screenshot({ path: `${SHOTS}/userfull-${dn}${dark ? '-dark' : ''}.png`, fullPage: true });
	await page.locator('.ud-ev', { hasText: '密码不对' }).click(); await W(1000);
	ok('点登录记录：跳到登录记录，按这个 IP 搜' + tag, page.url().includes('#/logins') && page.url().includes('5.6.7.8'));
	ok('没有脚本报错' + tag, !errs.length, errs.join(' | '));
	await ctx.close();
}
await browser.close(); server.close();
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

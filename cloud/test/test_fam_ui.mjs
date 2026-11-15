// 5.2 主账号 / 子账号：官网「我的路由器」页面（真浏览器）
// 需要 Playwright：node test/test_fam_ui.mjs [--shots 目录]
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
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
const S = () => env.H.get('hub').ctx.storage;
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const r = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
	const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) h['set-cookie'] = sc;
	res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8133, z));
const B = 'http://localhost:8133';
const api = async (path, body, hdr = {}) => (await realFetch(B + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const W = (ms) => new Promise((z) => setTimeout(z, ms));
// 准备：A 装了「客厅」（主账号），B 是子账号；老路由器「书房」平等绑了 A 和 C
const inv = (await api('/api/admin/invites', { direct: true,  max: 5 }, ADM)).invite.code;
const R1 = await api('/api/register', { invite: inv, name: 'Living', model: 'Xiaomi AX3000T' });
const R2 = await api('/api/register', { invite: inv, name: 'Study', model: 'x86' });
for (const R of [R1, R2]) await env.W.get('dev:' + R.sub).ctx.storage.put('r', { last: Date.now(), rep: { ver: '5.2.0' } });
const browser = await chromium.launch();
const regIn = async (page, email) => {
	await page.goto(B + '/app#reg'); await W(700);
	await page.fill('#fReg [name=email]', email); await page.fill('#fReg [name=password]', 'pass-' + email.slice(0, 3) + '-1234'); await page.click('#fReg button.primary'); await W(1500);
};
const uid = async (e) => S().get('e:' + e);
const fam = async (R, op, body) => api('/api/dev/fam/' + op, { sub: R.sub, rkey: R.rkey, ...body });
for (const [w, h] of [[390, 844], [1280, 860]]) {
	const T = '［' + w + '］';
	const mk = async () => { const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); const e = []; p.on('pageerror', (x) => e.push(x.message)); p.errs = e; return p; };
	const pa = await mk(), pb = await mk(), pc = await mk();
	const ea = 'a' + w + '@x.com', eb = 'b' + w + '@x.com', ec = 'c' + w + '@x.com';
	await regIn(pa, ea); await regIn(pb, eb); await regIn(pc, ec);
	const ua = await uid(ea), ub = await uid(eb), uc = await uid(ec);
	// A 绑定「客厅」成为主账号（配对码），C 和 A 都绑「书房」（老数据：平等绑定）
	const pairOf = async (R) => (await api('/api/pair/start', { sub: R.sub, rkey: R.rkey })).code;
	if (!(await pa.isVisible('#fBind [name=code]'))) await pa.click('.oldpair summary');
	await pa.fill('#fBind [name=code]', await pairOf(R1)); await pa.click('#fBind button'); await W(1200); if (await pa.isVisible('.mask')) { await pa.click('.mask [data-x]'); await W(300); }
	{ const d = await S().get('d:' + R2.sub); d.users = [ua, uc]; delete d.owner; d.subs = {}; await S().put('d:' + R2.sub, d); for (const u of [ua, uc]) { const x = await S().get('u:' + u); x.devs = [...(x.devs || []).filter((y) => y.sub !== R2.sub), { sub: R2.sub, at: Date.now() }]; await S().put('u:' + u, x); } }
	const su = (await fam(R1, 'sudo', { uid: ua, code: '' })).sudo;
	const jc = (await fam(R1, 'join_create', { uid: ua, sudo: su, name: 'B', perms: ['msg', 'node', 'speed'] })).code;
	// B 用链接加入
	await pb.goto(B + '/app?join=' + jc); await W(1800);
	ok('点加入链接：弹出邀请详情（谁邀请、哪台路由器、能做什么）' + T, await pb.isVisible('.mask') && /邀请你加入/.test(await pb.textContent('.mask')) && /Living/.test(await pb.textContent('.mask')) && /切换节点/.test(await pb.textContent('.mask')));
	if (SHOTS) await pb.screenshot({ path: `${SHOTS}/fam-join-${w}.png` });
	await pb.click('.mask [data-ok]'); await W(1500);
	const bt = await pb.textContent('#devs');
	ok('加入后：「家人的路由器」里出现这台，标着子账号和主账号名字' + T, /家人的路由器/.test(bt) && /子账号 · 主账号：a\d+/.test(bt), bt.slice(0, 200));
	ok('子账号的按钮：打开面板、改名、退出（没有解绑、续期、登录码）' + T, await pb.isVisible('#devs [data-open]') && await pb.isVisible('#devs [data-leave]') && !(await pb.$('#devs [data-unb]')) && !(await pb.$('#devs [data-lc]')));
	if (SHOTS) await pb.screenshot({ path: `${SHOTS}/fam-sub-${w}.png`, fullPage: false });
	// 主账号看到的
	await pa.reload(); await W(1500);
	const card = pa.locator('#devs .dev', { hasText: 'Living' });
	ok('主账号：标着「主账号 · 1 个子账号」' + T, /主账号 · 1 个子账号/.test(await card.textContent()), (await pa.innerHTML('#devs')).replace(/<svg[\s\S]*?<\/svg>/g, '').slice(0, 800));
	// 打开面板：跳到面板地址，带一次性票
	await pa.context().route(/^https?:\/\/[a-z0-9]+\.localhost\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>panel</title>面板' }));
	await card.locator('[data-open]').click(); await W(1500);
	ok('主账号点「打开面板」：跳到这台路由器的面板，地址里带一次性票' + T, new RegExp('^https?://' + R1.sub + '\\.localhost/panel/#open=[a-z2-9]{24}$').test(pa.url()), pa.url());
	await pa.goto(B + '/app'); await W(1500);
	// 老路由器：先选主账号
	await pa.locator('#devs .dev', { hasText: 'Study' }).locator('[data-open]').click(); await W(1200);
	ok('老路由器绑了 2 个账号：先弹出「选一个主账号」，列出这 2 个人' + T, await pa.isVisible('.mask .pick') && (await pa.locator('.mask .pku').count()) === 2);
	if (SHOTS) await pa.screenshot({ path: `${SHOTS}/fam-pick-${w}.png` });
	await pa.locator('.mask .pku', { hasText: 'c' + w }).click(); await pa.click('.mask [data-go]'); await W(1000);
	const pk = await S().get('c:pick:' + R2.sub);
	ok('选好人：发验证码给他，出现输验证码的框' + T, !!pk && pk.target === uc && await pa.isVisible('.mask .pk2 [data-c]'));
	await pa.fill('.mask [data-c]', pk.code); await pa.click('.mask [data-go]'); await W(1500);
	const st = await pa.locator('#devs .dev', { hasText: 'Study' }).textContent();
	ok('确认后：书房的主账号是 C，A 变成子账号' + T, /子账号 · 主账号：c\d+/.test(st), st.slice(0, 160));
	// C 加入的另一个方式：在「添加路由器 → 加入家人」里输加入码
	const jc2 = (await fam(R1, 'join_create', { uid: ua, sudo: su, name: 'C', perms: ['msg'] })).code;
	await pc.reload(); await W(1500);
	await pc.click('.seg [data-seg="join"]'); await W(300);
	await pc.fill('#fJoin [name=code]', jc2.toLowerCase()); await pc.click('#fJoin button'); await W(1000);
	ok('在「加入家人」里输加入码：也弹出邀请详情' + T, await pc.isVisible('.mask') && /Living/.test(await pc.textContent('.mask')));
	await pc.click('.mask [data-ok]'); await W(1500);
	ok('加入成功' + T, /Living/.test(await pc.textContent('#devs')));
	// 子账号退出
	await pb.reload(); await W(1500);
	await pb.locator('#devs .dev', { hasText: 'Living' }).locator('[data-leave]').click(); await W(1500);
	ok('子账号点「退出」（确认后）：这台从他的账号里没了' + T, !/Living/.test(await pb.textContent('#devs')));
	// 主账号解绑：要先确认是本人
	await pc.reload(); await W(1500);
	await pc.locator('#devs .dev', { hasText: 'Study' }).locator('[data-unb]').click(); await W(1000);
	ok('主账号解绑：先弹出「确认是你本人」' + T, await pc.isVisible('.mask') && /确认是你本人/.test(await pc.textContent('.mask')));
	if (SHOTS) await pc.screenshot({ path: `${SHOTS}/fam-sudo-${w}.png` });
	await pc.click('.mask [data-send]'); await W(600); await pc.click('.mask [data-ok]'); await W(1800);
	ok('确认后解绑成功：书房从主账号和子账号的账号里都没了' + T, !/Study/.test(await pc.textContent('#devs')) && !(await api('/api/admin/fam/' + R2.sub, null, ADM)).owner);
	for (const [n, p] of [['A', pa], ['B', pb], ['C', pc]]) ok('页面没有报错（' + n + '）' + T, !p.errs.length, p.errs.join(' | '));
	for (const p of [pa, pb, pc]) await p.context().close();
	// 下一轮换新的路由器数据
	await S().delete('r:pk1:' + R2.sub);
	for (const R of [R1, R2]) { const d = await S().get('d:' + R.sub); d.users = []; delete d.owner; d.subs = {}; d.joins = []; await S().put('d:' + R.sub, d); }
}
await browser.close(); server.close();
console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 300) + '）')).join('\n'));
const pass = results.filter((r) => r[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

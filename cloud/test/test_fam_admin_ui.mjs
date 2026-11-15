// 5.2 管理后台「账号和权限」：看主账号和子账号、改权限、停用、换主账号；账号页「所有设备退出」「改登录邮箱」（真浏览器）
// 用法：node test/test_fam_admin_ui.mjs [--shots 目录]
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
const realFetch = globalThis.fetch; let CFn = 0; const MAILS = [];
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (u.hostname === 'api.cloudflare.com') { const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] })); if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 'tun' + ++CFn, token: 'tok' }); if (m === 'POST') return R({ id: 'dns' + ++CFn }); return R({}); }
	if (url === 'https://api.resend.com/emails') { MAILS.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); }
	if (u.hostname === 'localhost') return realFetch(input, init);
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const H = () => env.H.get('hub'), S = () => H().ctx.storage;
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const r = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: { ...req.headers, 'cf-connecting-ip': '127.0.0.1' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8136, z));
const B = 'http://localhost:8136';
const api = async (path, body, hdr = {}) => (await realFetch(B + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const inv = (await api('/api/admin/invites', { direct: true,  max: 5 }, ADM)).invite.code;
const R1 = await api('/api/register', { invite: inv, name: '客厅 Kwrt', model: 'Xiaomi AX3000T' });
const R2 = await api('/api/register', { invite: inv, name: '书房', model: 'x86' });
const mkUser = async (email, name) => { await api('/api/account/register', { email, password: 'pass-' + email.slice(0, 3) + '-1234' }); const uid = await S().get('e:' + email); if (name) { const u = await S().get('u:' + uid); u.name = name; await S().put('u:' + uid, u); } return uid; };
const ua = await mkUser('alice@x.com', '妈妈'), ub = await mkUser('bob@x.com', '小明'), uc = await mkUser('carol@x.com', '姐姐'), ud = await mkUser('dave@x.com');
const put = async (sub, users, owner) => { const d = await S().get('d:' + sub); d.users = users; if (owner) d.owner = owner; else delete d.owner; d.subs = {}; await S().put('d:' + sub, d); for (const u of users) { const x = await S().get('u:' + u); x.devs = [...(x.devs || []), { sub, at: Date.now() }]; await S().put('u:' + u, x); } };
await put(R1.sub, [ua], ua);
for (const [u, p] of [[ub, ['msg', 'node', 'speed']], [uc, ['msg']]]) { const j = await H().devJoinCreate({ sub: R1.sub, uid: ua, name: 'x', perms: p }); await H().famJoin(u, j.code); }
await H().devJoinCreate({ sub: R1.sub, uid: ua, name: '爸爸', perms: ['msg'] });
await put(R2.sub, [ua, ud]); // 老路由器：两个账号平等绑定，还没选主账号
const browser = await chromium.launch();
for (const [w, h] of [[390, 844], [1440, 900]]) {
	const T = '［' + w + '］';
	const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 1024 }); const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
	await p.goto(B + '/admin'); await W(1200); await p.fill('input[type=password]', 'admin-key-1234567890'); await p.click('button[type=submit]'); await W(2200);
	await p.goto(B + '/admin#/devices'); await W(1600);
	const row = p.locator('.hub-row', { hasText: '客厅 Kwrt' });
	await row.locator('button', { hasText: '账号和权限' }).click(); await W(1400);
	const dr = () => p.locator('.fd');
	let t = await dr().textContent();
	ok('打开「账号和权限」：主账号（完整邮箱）、2 个子账号、没用掉的加入码' + T, /妈妈/.test(t) && /alice@x\.com/.test(t) && /子账号（2 \/ 10）/.test(t) && /小明/.test(t) && /姐姐/.test(t) && /爸爸/.test(t), t.slice(0, 300));
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/famadm-${w}.png` });
	// 改小明的权限：加上「代理设置」
	const sb = p.locator('.fd-sub', { hasText: '小明' }), had = ((await S().get('d:' + R1.sub)).subs[ub].perms || []).includes('proxy');
	await sb.locator('label', { hasText: '代理设置' }).click(); await W(200);
	await sb.locator('button', { hasText: '保存权限' }).click(); await W(600);
	ok('改权限要写原因' + T, /原因/.test(await p.locator('[role=dialog]:has(.ask-modal)').textContent()));
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/famadm-why-${w}.png` });
	await p.locator('[role=dialog]:has(.ask-modal)').locator('textarea').fill('家里人打电话来说要开代理设置'); await p.locator('[role=dialog]:has(.ask-modal)').locator('button', { hasText: '确定' }).click(); await W(1200);
	const d1 = await S().get('d:' + R1.sub);
	ok('保存后：小明的「代理设置」按勾选变了' + T, (d1.subs[ub].perms || []).includes('proxy') === !had, JSON.stringify(d1.subs[ub]));
	const log = await api('/api/admin/log', null, ADM).catch(() => ({}));
	ok('操作记录里写着原因' + T, JSON.stringify(log).includes('家里人打电话来说要开代理设置'));
	// 停用姐姐
	await p.locator('.fd-sub', { hasText: '姐姐' }).locator('button', { hasText: '停用' }).click(); await W(500);
	await p.locator('[role=dialog]:has(.ask-modal)').locator('textarea').fill('主账号要求'); await p.locator('[role=dialog]:has(.ask-modal)').locator('button', { hasText: '确定' }).click(); await W(1200);
	ok('停用姐姐：标成「已停用」，按钮变「恢复」' + T, (await S().get('d:' + R1.sub)).subs[uc].off === true && /已停用/.test(await p.locator('.fd-sub', { hasText: '姐姐' }).textContent()) && await p.locator('.fd-sub', { hasText: '姐姐' }).locator('button', { hasText: '恢复' }).isVisible());
	await p.locator('.fd-sub', { hasText: '姐姐' }).locator('button', { hasText: '恢复' }).click(); await W(500);
	await p.locator('[role=dialog]:has(.ask-modal)').locator('textarea').fill('恢复'); await p.locator('[role=dialog]:has(.ask-modal)').locator('button', { hasText: '确定' }).click(); await W(1200);
	// 换主账号：把小明设为主账号
	await p.locator('.fd-sub', { hasText: '小明' }).locator('button', { hasText: '设为主账号' }).click(); await W(500);
	await p.locator('[role=dialog]:has(.ask-modal)').locator('textarea').fill('妈妈的邮箱丢了，本人确认过'); await p.locator('[role=dialog]:has(.ask-modal)').locator('button', { hasText: '确定' }).click(); await W(1400);
	const d2 = await S().get('d:' + R1.sub);
	ok('设小明为主账号：小明变主账号，妈妈变子账号' + T, d2.owner === ub && !!d2.subs[ua] && !d2.subs[ub], JSON.stringify({ o: d2.owner, s: Object.keys(d2.subs) }));
	ok('抽屉里刷新成新的主账号' + T, /小明/.test(await p.locator('.fd-sec').first().textContent()));
	// 换回去（下一轮还用）
	await H().famAdminOwner(R1.sub, { target: ua }, '换回');
	await p.click('[aria-label="关闭"]').catch(() => p.keyboard.press('Escape')); await W(600);
	// 老路由器：还没选主账号
	await p.locator('.hub-row', { hasText: '书房' }).locator('button', { hasText: '账号和权限' }).click(); await W(1400);
	t = await dr().textContent();
	ok('老路由器（两个账号平等绑定）：说明还没选主账号，列出两个账号可以直接指定' + T, /还没选主账号/.test(t) && (await p.locator('.fd-list .fd-row').count()) === 2);
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/famadm-pick-${w}.png` });
	await p.keyboard.press('Escape'); await W(600);
	ok('路由器列表里标出「还没选主账号」' + T, /还没选主账号/.test(await p.locator('.hub-row', { hasText: '书房' }).textContent()));
	// 账号页
	await p.goto(B + '/admin#/users'); await W(1500);
	const ur = p.locator('.hub-row', { hasText: 'dave@x.com' });
	ok('账号页有「所有设备退出」「改登录邮箱」' + T, await ur.locator('button', { hasText: '所有设备退出' }).isVisible() && await ur.locator('button', { hasText: '改登录邮箱' }).isVisible());
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/famadm-users-${w}.png` });
	await ur.locator('button', { hasText: '所有设备退出' }).click(); await W(500);
	await p.locator('[role=dialog]:has(.ask-modal)').locator('textarea').fill('账号被盗'); await p.locator('[role=dialog]:has(.ask-modal)').locator('button', { hasText: '全部退出' }).click(); await W(1200);
	ok('所有设备退出：路由器上记下踢出时间' + T, !!((await S().get('d:' + R2.sub)).kick || {})[ud]);
	if (w === 1440) {
		await ur.locator('button', { hasText: '改登录邮箱' }).click(); await W(500);
		await p.locator('[role=dialog]:has(.ask-modal)').locator('input').fill('dave2@x.com'); await p.locator('[role=dialog]:has(.ask-modal)').locator('button', { hasText: '下一步' }).click(); await W(600);
		await p.locator('[role=dialog]:has(.ask-modal)').locator('textarea').fill('旧邮箱停用了，本人确认过'); await p.locator('[role=dialog]:has(.ask-modal)').locator('button', { hasText: '改邮箱' }).click(); await W(1500);
		ok('改登录邮箱：新邮箱能找到这个账号，旧的找不到了' + T, (await S().get('e:dave2@x.com')) === ud && !(await S().get('e:dave@x.com')));
		ok('列表里显示新邮箱' + T, await p.locator('.hub-row', { hasText: 'dave2@x.com' }).isVisible());
	}
	ok('后台没有报错' + T, !errs.length, errs.join(' | '));
	await c.close();
}
await browser.close(); server.close();
console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 300) + '）')).join('\n'));
const pass = results.filter((r) => r[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

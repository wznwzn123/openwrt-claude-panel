// 官网页面（真浏览器）：首页、注册登录、配对绑定（含 ?pair= 自动绑定）、改名、解绑、退出、管理员页面
// 需要 Playwright：node test/test_site.mjs [--shots 目录]
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
const realFetch = globalThis.fetch;
let CFn = 0;
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (u.hostname === 'api.cloudflare.com') { const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] })); if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 'tun' + ++CFn, token: 'tok' }); if (m === 'POST') return R({ id: 'dns' + ++CFn }); return R({}); }
	if (u.hostname === 'localhost') return realFetch(input, init);
	if (u.hostname === 'api.github.com') return new Response(JSON.stringify({ tag_name: 'v1.3.2', assets: [{ name: 'router-panel.apk' }], body: '## 这个版本的更新\n- 测试', published_at: '2026-11-01T00:00:00Z' }));
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const r = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
	const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) h['set-cookie'] = sc;
	res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8127, z));
const B = 'http://localhost:8127';
const api = async (path, body, hdr = {}) => (await realFetch(B + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const inv = (await api('/api/admin/invites', { max: 5 }, ADM)).invite.code;
const R1 = await api('/api/register', { invite: inv, name: 'Kwrt', model: 'JDCloud AX1800' });
const R2 = await api('/api/register', { invite: inv, name: 'OpenWrt', model: 'Xiaomi AX3000T' });
const pairOf = async (R) => (await api('/api/pair/start', { sub: R.sub, rkey: R.rkey })).code;
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const browser = await chromium.launch();
const errs = [];
for (const dark of [false, true]) {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: SHOTS ? 2 : 1 });
	const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
	page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? (d.message().includes('名字') ? '客厅路由器' : d.message().includes('续期码') ? 'rnwcode234' : d.message().includes('续几天') ? '90' : 'alice-pass-1') : undefined));
	const shot = async (n) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/site-' + n + (dark ? '-dark' : '') + '.png', fullPage: n === 'home' }); };
	const T = dark ? '（深色）' : '';
	await page.goto(B + '/'); await W(300);
	ok('首页能打开' + T, /用手机管好家里的/.test(await page.textContent('body')));
	await shot('home');
	if (dark) { await ctx.close(); continue; }
	// 注册
	await page.goto(B + '/app'); await W(500);
	ok('没登录：显示登录表单', await page.isVisible('#fLogin'));
	ok('没开邮件服务：注册不需要验证码', !(await page.isVisible('#fReg [data-mail]')));
	await page.click('[data-tab="reg"]');
	await page.fill('#fReg [name=email]', 'alice@x.com'); await page.fill('#fReg [name=password]', '123');
	await page.click('#fReg button.primary'); await W(300);
	ok('密码太短：浏览器先拦住（不提交）', await page.isVisible('#fReg'));
	await page.fill('#fReg [name=password]', 'alice-pass-1'); await page.click('#fReg button.primary'); await W(800);
	ok('注册后进入「我的路由器」，显示邮箱', await page.isVisible('#vDash') && (await page.textContent('#who')) === 'alice@x.com');
	ok('还没有路由器：提示怎么绑定', /还没有绑定路由器/.test(await page.textContent('#devs')));
	await shot('empty');
	// 绑定
	await page.fill('#fBind [name=code]', 'WRONG123'); await page.click('#fBind button'); await W(500);
	ok('配对码不对：提示', /配对码不对/.test(await page.textContent('#vDash')));
	await page.fill('#fBind [name=code]', await pairOf(R1)); await page.click('#fBind button'); await W(800);
	ok('输入配对码：绑定成功，出现在列表里', /Kwrt/.test(await page.textContent('#devs')) && /JDCloud AX1800/.test(await page.textContent('#devs')));
	ok('绑定好后自动弹出登录码（8 位），「打开面板」带着登录码', await page.isVisible('.mask') && /^[A-Z2-9]{4} [A-Z2-9]{4}$/.test((await page.textContent('.mask .lcode')).trim()) && new RegExp('^https://' + R1.host + '/panel/#code=[A-Z2-9]{8}$').test(await page.getAttribute('.mask a.btn', 'href')));
	await shot('logincode');
	await page.click('.mask [data-x]'); await W(300);
	ok('登录码弹窗能关掉', !(await page.isVisible('.mask')));
	ok('「打开面板」指向这台的专属网址', (await page.getAttribute('#devs a.btn', 'href')) === 'https://' + R1.host + '/panel/');
	await page.click('#devs [data-lc]'); await W(600);
	ok('每台托管版路由器下面有「获取登录码」，点了显示新的登录码', await page.isVisible('.mask') && /10 分钟内有效/.test(await page.textContent('.mask')));
	await page.click('.mask', { position: { x: 5, y: 5 } }); await W(300);
	ok('点弹窗外面也能关掉', !(await page.isVisible('.mask')));
	ok('还没上线：显示离线', /离线/.test(await page.textContent('#devs')));
	await realFetch(B.replace('localhost', R1.host).replace(':8127', ':8127') + '/', {}).catch(() => {});
	// 心跳后变在线（直接调云端）
	await mod.default.fetch(new Request('https://' + R1.host + '/cloud/beat/r/' + R1.rkey, { method: 'POST', body: '{"ver":"1.3.1"}' }), env);
	await page.reload(); await W(800);
	ok('路由器发心跳后：显示在线', /在线/.test(await page.textContent('#devs .meta')));
	ok('显示路由器的版本号（心跳里报的）', /v1\.3\.1/.test(await page.textContent('#devs .meta')));
	ok('比最新版旧：标「可更新」', /可更新到 v1\.3\.2/.test(await page.textContent('#devs .meta .pill.up')));
	// 试用期：显示到期时间、续期
	if (!dark) {
		const H = env.H.get('hub'), dk = 'd:' + R1.sub, dv = await H.ctx.storage.get(dk); dv.exp = Date.now() + 2 * 86400e3; await H.ctx.storage.put(dk, dv);
		await H.ctx.storage.put('k:RNWCODE234', { days: 90, created: Date.now(), note: '', used: 0 });
		await page.reload(); await W(800);
		ok('试用的路由器：显示到期时间和还剩几天，快到期标黄', /托管服务到期：\d{4}-\d\d-\d\d（还剩 2 天）/.test(await page.textContent('#devs .expline')) && (await page.getAttribute('#devs .expline', 'class')).includes('warn'));
		await shot('trial');
		await page.click('#devs [data-renew]'); await W(1000);
		ok('点「续期」输入续期码：续上 90 天', /还剩 92 天/.test(await page.textContent('#devs .expline')), await page.textContent('#devs .expline'));
		// 到期：打开账号页自动弹出申请表
		const dv3 = await H.ctx.storage.get(dk); dv3.exp = Date.now() - 1000; await H.ctx.storage.put(dk, dv3); await H.cleanup(); await page.reload(); await W(1000);
		ok('到期暂停：打开账号页自动弹出「托管服务已到期」申请表', await page.isVisible('#fApply') && /托管服务已到期/.test(await page.textContent('.mask')));
		ok('申请表：用户账号自动填好（只读）、申请日期是今天', (await page.inputValue('#fApply [name=acc]')) === 'alice@x.com' && (await page.inputValue('#fApply [name=day]')) === new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10));
		await shot('apply');
		await page.click('#fApply button.primary'); await W(300);
		ok('没选从哪里知道的：浏览器先拦住', await page.isVisible('#fApply'));
		await page.selectOption('#fApply [name=src]', '其他'); await W(100);
		ok('选「其他」：出现「具体是哪里」', await page.isVisible('#fApply [name=srcx]'));
		await page.fill('#fApply [name=srcx]', 'B 站'); await page.fill('#fApply [name=contact]', 'coolapk:alice'); await page.click('#fApply button.primary'); await W(1000);
		ok('提交后：显示「已提交，等待审核」，按钮变成「审核中」不能再点', !(await page.isVisible('.mask')) && /等待审核/.test(await page.textContent('#devs .expline')) && await page.isDisabled('#devs [data-apply]'));
		await page.reload(); await W(800);
		ok('审核中：刷新也不会再弹申请表', !(await page.isVisible('.mask')));
		const ap = await H.ctx.storage.get('ap:' + R1.sub);
		ok('申请内容存好了：从哪里知道（其他：B 站）、相关账号', ap && ap.source === '其他：B 站' && ap.contact === 'coolapk:alice' && ap.status === 'pending');
		await H.decide(R1.sub, true, { days: 90 }); await page.reload(); await W(800);
		ok('管理员通过后：恢复，显示「已通过，续了 90 天」', /已通过，续了 90 天/.test(await page.textContent('#devs .expline')) && /还剩 90 天/.test(await page.textContent('#devs .expline')));
		const dv2 = await H.ctx.storage.get(dk); delete dv2.exp; await H.ctx.storage.put(dk, dv2); await H.ctx.storage.delete('ap:' + R1.sub); await page.reload(); await W(800);
		ok('不限期的路由器：不显示到期，也没有续期按钮', !(await page.$('#devs .expline')) && !(await page.$('#devs [data-renew]')));
	}
	// 改名
	await page.click('#devs [data-ren]'); await W(800);
	ok('改名', /客厅路由器/.test(await page.textContent('#devs')));
	await shot('dash');
	// ?pair= 自动绑定
	await page.goto(B + '/app?pair=' + (await pairOf(R2))); await W(1200);
	ok('打开带 ?pair= 的链接：已登录时自动绑定', /OpenWrt/.test(await page.textContent('#devs')) && (await page.locator('#devs .dev').count()) === 2);
	ok('自动绑定后地址栏里的配对码去掉了', !(await page.evaluate(() => location.search)));
	if (await page.isVisible('.mask')) { await page.click('.mask [data-x]'); await W(300); }
	// 解绑
	await page.click('#devs .dev:last-child [data-unb]'); await W(800);
	ok('解绑（先确认）', (await page.locator('#devs .dev').count()) === 1);
	// 退出、未登录时 ?pair=
	await page.click('#outBtn'); await W(500);
	ok('退出：回到登录', await page.isVisible('#fLogin'));
	await page.goto(B + '/app?pair=' + (await pairOf(R2))); await W(600);
	ok('没登录打开配对链接：提示登录后会自动绑定', /登录或注册后，会自动把这台路由器绑定/.test(await page.textContent('#vAuth')));
	await page.fill('#fLogin [name=email]', 'alice@x.com'); await page.fill('#fLogin [name=password]', 'wrong-pass'); await page.click('#fLogin button.primary'); await W(500);
	ok('密码错：提示', /邮箱或密码不对/.test(await page.textContent('#fLogin')));
	await page.fill('#fLogin [name=password]', 'alice-pass-1'); await page.click('#fLogin button.primary'); await W(1500);
	ok('登录后自动绑定那台路由器', (await page.locator('#devs .dev').count()) === 2);
	if (await page.isVisible('.mask')) { await page.click('.mask [data-x]'); await W(300); }
	ok('不横向滚动', (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
	// 改密码
	await page.fill('#fPw [name=old]', 'alice-pass-1'); await page.fill('#fPw [name=password]', 'alice-pass-2'); await page.click('#fPw button'); await W(600);
	ok('修改密码成功', /密码已修改/.test(await page.textContent('#toast')));
	// 管理员页面
	await page.goto(B + '/admin'); await W(400);
	await page.fill('#fKey [name=k]', 'wrong-key-1234567890'); await page.click('#fKey button'); await W(500);
	ok('管理页：密钥不对进不去', /密钥不对/.test(await page.textContent('#vKey')));
	await page.fill('#fKey [name=k]', 'admin-key-1234567890'); await page.click('#fKey button'); await W(800);
	ok('管理页：显示已开通数量和名额', (await page.textContent('#sCount')) === '2' && (await page.textContent('#sMax')) === '50');
	ok('管理页：列出路由器和绑定的账号数', /Kwrt/.test(await page.textContent('#devs')) && /1 个账号/.test(await page.textContent('#devs')));
	await page.fill('#fInv [name=note]', '给朋友'); await page.click('#fInv button'); await W(800);
	ok('管理页：生成邀请码', /给朋友/.test(await page.textContent('#invs')));
	await page.click('#devs [data-sub="' + R2.sub + '"] [data-op="off"]'); await W(800);
	ok('管理页：封禁', /已封禁/.test(await page.textContent('#devs [data-sub="' + R2.sub + '"]')));
	await page.click('#devs [data-sub="' + R2.sub + '"] [data-op="on"]'); await W(800);
	ok('管理页：解封', !/已封禁/.test(await page.textContent('#devs [data-sub="' + R2.sub + '"]')));
	await page.reload(); await W(800);
	ok('管理页：刷新后还在（密钥存在这个标签页）', await page.isVisible('#vMain'));
	if (!dark) {
		const H = env.H.get('hub'), dk = 'd:' + R1.sub, dv = await H.ctx.storage.get(dk);
		dv.exp = Date.now() - 1000; await H.ctx.storage.put(dk, dv); await H.cleanup();
		await H.apply((await H.ctx.storage.get('e:alice@x.com')), 'alice@x.com', { sub: R1.sub, source: '酷安', contact: 'coolapk:alice', note: '想继续用' });
		await page.reload(); await W(1000);
		ok('管理页：续期申请列表（账号、从哪里知道、相关账号、申请日期、已到期），标出待审核几份', /alice@x\.com/.test(await page.textContent('#aps')) && /酷安/.test(await page.textContent('#aps')) && /coolapk:alice/.test(await page.textContent('#aps')) && /已到期暂停/.test(await page.textContent('#aps')) && /1 份待审核/.test(await page.textContent('#apN')));
		await shot('admin-apply');
		await page.click('#aps [data-ok]'); await W(1000);
		ok('管理页：点「通过」续 90 天，路由器恢复，申请进「最近审核过的」', !(await H.ctx.storage.get(dk)).off && /通过，续了 90 天/.test(await page.textContent('#aps')) && !(await page.$('#aps [data-ok]')));
	}
	await shot('admin');
	await ctx.close();
}
ok('页面没有报错', !errs.length, errs.join(' | '));
await browser.close(); server.close();
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

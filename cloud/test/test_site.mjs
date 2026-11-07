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
	page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? (d.message().includes('名字') ? '客厅路由器' : d.message().includes('续期码') ? 'rnwcode234' : d.message().includes('续几天') ? '90' : d.message().includes('备注（给谁的') ? '阿明家，微信 ming' : 'alice-pass-1') : undefined));
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
	ok('管理页：统计（已开通 / 名额、在线、试用中、续过期、不限期、快到期、已停用、本周新开通）', /^2 \/ 50/.test(await page.textContent('#stats .card:first-child b')) && (await page.$$('#stats .card')).length === 8 && /试用中/.test(await page.textContent('#stats')) && /本周新开通/.test(await page.textContent('#stats')), await page.textContent('#stats'));
	ok('管理页：列出路由器和绑定的账号数', /Kwrt/.test(await page.textContent('#devs')) && /1 个账号/.test(await page.textContent('#devs')));
	await page.fill('#fInv [name=note]', '给朋友'); await page.click('#fInv button'); await W(800);
	ok('管理页：生成邀请码', /给朋友/.test(await page.textContent('#invs')));
	await page.click('#devs [data-sub="' + R2.sub + '"] [data-op="off"]'); await W(800);
	ok('管理页：封禁', /已封禁/.test(await page.textContent('#devs [data-sub="' + R2.sub + '"]')));
	await page.click('#devs [data-sub="' + R2.sub + '"] [data-op="on"]'); await W(800);
	ok('管理页：解封', !/已封禁/.test(await page.textContent('#devs [data-sub="' + R2.sub + '"]')));
	if (!dark) {
		await page.click('#devs [data-sub="' + R2.sub + '"] [data-op="delete"]'); await W(400);
		ok('管理页：点「删除」弹出确认框，说明先进回收站、30 天内能恢复；不输编号不能点', await page.isVisible('.dlg') && /回收站/.test(await page.textContent('.dlg')) && /30 天内可以一键恢复/.test(await page.textContent('.dlg')) && await page.isDisabled('.dlg [data-go]'));
		await page.fill('.dlg [data-in]', 'wrongsub'); await W(100);
		ok('管理页：编号输错，还是不能点', await page.isDisabled('.dlg [data-go]'));
		await page.fill('.dlg [data-in]', R2.sub); await W(100);
		await shot('admin-delete');
		await page.click('.dlg [data-go]'); await W(1200);
		ok('管理页：删除后进「回收站」，显示彻底删除日期，有「恢复」「彻底删除」', /回收站（1 台）/.test(await page.textContent('#devs')) && /彻底删除/.test(await page.textContent('#devs [data-sub="' + R2.sub + '"]')) && !!(await page.$('#devs [data-sub="' + R2.sub + '"] [data-op="restore"]')));
		await shot('admin-trash');
		await page.click('#devs [data-sub="' + R2.sub + '"] [data-op="restore"]'); await W(1200);
		ok('管理页：点「恢复」，回到正常列表', !/回收站/.test(await page.textContent('#devs')) && !!(await page.$('#devs [data-sub="' + R2.sub + '"] [data-op="delete"]')));
		await page.click('#devs [data-sub="' + R2.sub + '"] [data-op="protect"]'); await W(1000);
		ok('管理页：点「保护」后显示「受保护」，删除按钮没了', /受保护/.test(await page.textContent('#devs [data-sub="' + R2.sub + '"]')) && !(await page.$('#devs [data-sub="' + R2.sub + '"] [data-op="delete"]')));
		await page.click('#devs [data-sub="' + R2.sub + '"] [data-op="unprotect"]'); await W(1000);
		// 筛选
		await page.click('#fchips [data-f="bin"]'); await W(300);
		ok('管理页：筛选「回收站」：没有就不显示正常列表的路由器', !/Kwrt/.test(await page.textContent('#devs')) || !(await page.$('#devs [data-op="delete"]')));
		await page.click('#fchips [data-f="all"]'); await W(300);
		ok('管理页：筛选按钮带数量', /全部 2/.test(await page.textContent('#fchips')), await page.textContent('#fchips'));
		// 备注
		await page.click('#devs [data-sub="' + R2.sub + '"] [data-op="note"]'); await W(1000);
		ok('管理页：写备注，显示在路由器下面，也能搜', /阿明家/.test(await page.textContent('#devs [data-sub="' + R2.sub + '"]')));
		await page.fill('#q', '阿明'); await W(200);
		ok('管理页：按备注搜索', (await page.$$('#devs [data-sub]')).length === 1); await page.fill('#q', ''); await W(200);
		// 加天数（不限期的没有这个按钮）
		const hasExt = !!(await page.$('#devs [data-sub="' + R2.sub + '"] [data-op="extend"]'));
		const dv2 = await env.H.get('hub').ctx.storage.get('d:' + R2.sub);
		ok('管理页：有到期时间的才有「加天数」按钮', hasExt === !!dv2.exp);
		if (hasExt) {
			await page.click('#devs [data-sub="' + R2.sub + '"] [data-op="extend"]'); await W(400);
			ok('管理页：「加天数」弹出选天数，默认 30 天，显示新的到期时间', await page.isVisible('.dlg') && (await page.inputValue('.dlg [data-in]')) === '30' && /加 30 天/.test(await page.textContent('.dlg [data-prev]')));
			await page.click('.dlg [data-d="90"]'); await W(100); await page.click('.dlg [data-go]'); await W(1200);
			ok('管理页：加了 90 天', Math.abs((await env.H.get('hub').ctx.storage.get('d:' + R2.sub)).exp - (dv2.exp + 90 * 86400e3)) < 5 && /已加 90 天/.test(await page.textContent('#toast')));
		}
		// 账号
		ok('管理页：账号列表（邮箱、注册时间、最近登录、绑定的路由器）', /alice@x\.com/.test(await page.textContent('#users')) && /最近登录/.test(await page.textContent('#users')) && /路由器：/.test(await page.textContent('#users')));
		// 操作记录
		ok('管理页：操作记录里有刚才的删除、恢复、备注', /删除路由器/.test(await page.textContent('#logs')) && /恢复路由器/.test(await page.textContent('#logs')) && /改备注/.test(await page.textContent('#logs')), await page.textContent('#logs'));
		await shot('admin-users');
	}
	await page.reload(); await W(800);
	ok('管理页：刷新后还在（密钥存在这个标签页）', await page.isVisible('#vMain'));
	if (!dark) {
		const H = env.H.get('hub'), dk = 'd:' + R1.sub, dv = await H.ctx.storage.get(dk);
		dv.exp = Date.now() - 1000; await H.ctx.storage.put(dk, dv); await H.cleanup();
		await H.apply((await H.ctx.storage.get('e:alice@x.com')), 'alice@x.com', { sub: R1.sub, source: '酷安', contact: 'coolapk:alice', note: '想继续用' });
		await page.reload(); await W(1000);
		ok('管理页：续期申请列表（账号、从哪里知道、相关账号、申请日期、已到期），标出待审核几份', /alice@x\.com/.test(await page.textContent('#aps')) && /酷安/.test(await page.textContent('#aps')) && /coolapk:alice/.test(await page.textContent('#aps')) && /已到期暂停/.test(await page.textContent('#aps')) && /1 份待审核/.test(await page.textContent('#apN')));
		await shot('admin-apply');
		ok('管理页：待审核的申请显示「现在到期」', /现在到期/.test(await page.textContent('#aps')));
		await page.click('#aps [data-ok]'); await W(500);
		ok('管理页：点「通过」弹出选天数（30 / 90 / 180 / 365 + 自己填），默认 90 天并显示新的到期时间', await page.isVisible('.dlg') && (await page.$$('.dlg [data-d]')).length === 4 && (await page.inputValue('.dlg [data-in]')) === '90' && /续 90 天/.test(await page.textContent('.dlg [data-prev]')) && /→/.test(await page.textContent('.dlg [data-prev]')));
		await page.fill('.dlg [data-in]', '半年'); await W(150);
		ok('管理页：填的不是数字，提示「天数不对」，不能点确定', /天数不对/.test(await page.textContent('.dlg [data-prev]')) && await page.isDisabled('.dlg [data-go]'));
		await page.fill('.dlg [data-in]', '１８０天'); await W(150);
		ok('管理页：填「１８０天」也认得，「180 天」按钮跟着选中', /续 180 天/.test(await page.textContent('.dlg [data-prev]')) && /on/.test(await page.getAttribute('.dlg [data-d="180"]', 'class')) && !(await page.isDisabled('.dlg [data-go]')));
		await shot('admin-approve');
		await page.click('.dlg [data-d="180"]'); await W(100); await page.click('.dlg [data-go]'); await W(1200);
		const dvA = await H.ctx.storage.get(dk);
		ok('管理页：确定后真的续了 180 天，路由器恢复', !dvA.off && Math.abs(dvA.exp - (Date.now() + 180 * 86400e3)) < 120e3, JSON.stringify({ exp: dvA.exp }));
		ok('管理页：审核记录显示「到期 旧 → 新」和「续了 180 天」', /通过，续了 180 天/.test(await page.textContent('#aps')) && /到期 \S+ → \S+/.test(await page.textContent('#aps')) && !(await page.$('#aps [data-ok]')));
		await page.click('#mailTest'); await W(800);
		ok('管理页：「发测试邮件」没设邮箱时提示去设置 ADMIN_EMAIL', /ADMIN_EMAIL/.test(await page.textContent('#toast')));
		env.ADMIN_EMAIL = 'boss@x.com'; env.RESEND_API_KEY = 're_test';
		await W(2700); await page.click('#mailTest'); await W(800);
		ok('管理页：「发测试邮件」发出去后告诉你发到哪个邮箱', /测试邮件已发到 boss@x\.com/.test(await page.textContent('#toast')), await page.textContent('#toast'));
		const mb = await page.locator('#mailTest').boundingBox(), hb = await page.locator('h2:has(#apN)').boundingBox();
		ok('管理页：「发测试邮件」按钮和「续期申请」标题在同一行', mb && hb && Math.abs((mb.y + mb.height / 2) - (hb.y + hb.height / 2)) < 14);
		delete env.ADMIN_EMAIL; delete env.RESEND_API_KEY;
	}
	await shot('admin');
	await ctx.close();
}
ok('页面没有报错', !errs.length, errs.join(' | '));
// 新账号免费试用卡片、首页常见问题（被删后怎么恢复）
{
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1 });
	const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
	await page.goto(B + '/app'); await W(500);
	await page.click('[data-tab="reg"]');
	await page.fill('#fReg [name=email]', 'newbie@x.com'); await page.fill('#fReg [name=password]', 'newbie-pass-1'); await page.click('#fReg button.primary'); await W(900);
	ok('[试用] 新注册的账号：最上面显示「免费试用 7 天」和领取按钮', await page.isVisible('#trialCard') && /免费试用 7 天/.test(await page.textContent('#trialCard')) && await page.isVisible('#trialGo'));
	await page.click('#trialGo'); await W(900);
	const tc = await page.textContent('#trialCard');
	const m = /试用码：([A-Z2-9]{10})/.exec(tc);
	ok('[试用] 点领取：显示试用码和带着这个码的安装命令，可以复制', !!m && (await page.textContent('#trialCmd')).includes('--invite ' + m[1]) && await page.isVisible('#trialCopy'), tc.slice(0, 120));
	if (SHOTS) await page.screenshot({ path: SHOTS + '/site-trial-card.png' });
	await page.goto(B + '/#faq-restore'); await W(500);
	{ const body = await page.textContent('body');
	ok('[安全说明] 不再写「进不了你的路由器」这种绝对的话，如实写明云端备份里有密钥、可以开启加密、没开启的仍原样存着，并说明一键更新和 Cloudflare 这两个环节的风险', !/进不了/.test(body) && !/不保存密钥|这个网站也没有|托管服务也没有/.test(body) && /云端备份/.test(body) && /在路由器上加密后才上传/.test(body) && /没开启加密的备份仍然原样存在云端/.test(body) && /要说明的风险/.test(body) && /Cloudflare 加密转发/.test(body)); }
	ok('[常见问题] 首页有「被停用、到期、删除了怎么恢复」，从链接进来自动展开', await page.evaluate(() => document.getElementById('faq-restore').open) && /sh install.sh --invite 新邀请码/.test(await page.textContent('#faq-restore')));
	if (SHOTS) { await page.locator('#faq').scrollIntoViewIfNeeded(); await page.screenshot({ path: SHOTS + '/site-faq.png' }); }
	await ctx.close();
}
// 账号页：登录过的设备（两台手机各登录一次，在其中一台上把另一台退出）
{
	const mk = async (ua) => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: ua, deviceScaleFactor: SHOTS ? 2 : 1 }); const p = await c.newPage(); const e = []; p.on('pageerror', (x) => e.push(x.message)); p.on('dialog', (d) => d.accept()); return { c, p, e }; };
	const login = async (p) => { await p.goto(B + '/app'); await W(500); await p.fill('#fLogin [name=email]', 'sess@x.com'); await p.fill('#fLogin [name=password]', 'sess-pass-1'); await p.click('#fLogin button.primary'); await W(900); };
	const X = await mk('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0');
	await X.p.goto(B + '/app'); await W(500);
	await X.p.click('[data-tab="reg"]').catch(() => {}); await W(200);
	await X.p.fill('#fReg [name=email]', 'sess@x.com'); await X.p.fill('#fReg [name=password]', 'sess-pass-1'); await X.p.click('#fReg button.primary'); await W(1200);
	const Y = await mk('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
	await login(Y.p);
	await X.p.reload(); await W(1200);
	let t = await X.p.textContent('#sessList');
	ok('[登录设备] 账号页列出两台：安卓手机 · Edge（这台设备）、Windows 电脑 · Chrome（有「退出」）', /安卓手机 · Edge/.test(t) && /这台设备/.test(t) && /Windows 电脑 · Chrome/.test(t) && await X.p.locator('#sessList [data-out]').count() === 1, t);
	ok('[登录设备] 有别的设备时显示「退出其他所有设备」', await X.p.isVisible('#sessAll'));
	if (SHOTS) { await X.p.locator('#sessList').scrollIntoViewIfNeeded(); await X.p.screenshot({ path: SHOTS + '/site-sessions.png' }); }
	await X.p.click('#sessList [data-out]'); await W(900);
	ok('[登录设备] 点「退出」（确认后）：列表只剩这台，按钮藏起来', (await X.p.locator('#sessList [data-sess]').count()) === 1 && !(await X.p.isVisible('#sessAll')));
	await Y.p.reload(); await W(900);
	ok('[登录设备] 被退出的那台：回到登录页', await Y.p.isVisible('#fLogin') && !(await Y.p.isVisible('#vDash')));
	await login(Y.p); const Z = await mk('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'); await login(Z.p);
	await X.p.reload(); await W(1200);
	await X.p.click('#sessAll'); await W(900);
	ok('[登录设备] 「退出其他所有设备」：只剩这台，提示退出了 2 台', (await X.p.locator('#sessList [data-sess]').count()) === 1 && /已退出 2 台设备/.test(await X.p.textContent('body')));
	await Z.p.reload(); await W(900);
	ok('[登录设备] 其他设备都回到登录页', await Z.p.isVisible('#fLogin'));
	ok('[登录设备] 页面没有报错', ![...X.e, ...Y.e, ...Z.e].length, [...X.e, ...Y.e, ...Z.e].join(' | '));
	await X.c.close(); await Y.c.close(); await Z.c.close();
}
// 管理页：安装失败报告带的日志能打开看
{
	await realFetch(B + '/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'install', text: '面板版本：3.0.0\n错误：依赖安装失败', log: '==> 安装依赖\n ✗ 依赖安装失败：cloudflared 不在软件源里' }) });
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1 });
	const page = await ctx.newPage(); const e3 = []; page.on('pageerror', (x) => e3.push(x.message));
	await page.goto(B + '/admin'); await W(400); await page.fill('#fKey [name=k]', 'admin-key-1234567890'); await page.click('#fKey button'); await W(1200);
	ok('[管理页] 安装失败报告：标着「安装失败（终端上报）」，有「查看安装日志」按钮', /安装失败（终端上报）/.test(await page.textContent('#fbs')) && await page.locator('#fbs [data-log]').count() >= 1);
	await page.locator('#fbs [data-log]').first().click(); await W(800);
	ok('[管理页] 点开：弹出完整的安装日志', await page.isVisible('.dlg pre') && /cloudflared 不在软件源里/.test(await page.textContent('.dlg pre')));
	if (SHOTS) await page.screenshot({ path: SHOTS + '/admin-installlog.png' });
	await page.click('.dlg [data-x]'); await W(300);
	ok('[管理页] 关闭日志窗口', !(await page.isVisible('.dlg')));
	ok('[管理页] 页面没有报错', !e3.length, e3.join(' | '));
	await ctx.close();
}
// 隐私政策、安全说明、报告表单
{
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1 });
	const page = await ctx.newPage(); const e2 = []; page.on('pageerror', (e) => e2.push(e.message));
	await page.goto(B + '/'); await W(300);
	ok('[隐私/安全] 首页底部有隐私政策、安全说明、报告问题的链接', await page.locator('footer a[href="/privacy"]').count() === 1 && await page.locator('footer a[href="/security"]').count() === 1 && await page.locator('footer a[href="/security#report"]').count() === 1);
	await page.goto(B + '/app'); await W(300);
	ok('[隐私/安全] 账号页底部也有', await page.locator('a[href="/privacy"]').count() >= 1 && await page.locator('a[href="/security"]').count() >= 1);
	let r = await page.goto(B + '/privacy'); await W(300);
	let t = await page.textContent('body');
	ok('[隐私] 打开 /privacy：写了存哪些数据、存多久、交给谁、怎么删', r.status() === 200 && /存了哪些数据、存多久/.test(t) && /交给了谁/.test(t) && /你能做什么/.test(t) && /Cloudflare/.test(t) && /PushPlus/.test(t) && /可能在中国大陆以外/.test(t) && /两天内自动删除/.test(t));
	ok('[隐私] 如实写云端备份：开启加密后只存密文、没开启的原样存着', /开启加密后/.test(t) && /没开启加密的原样存着/.test(t));
	ok('[隐私] 页面头：不能被嵌入、限制外部脚本', /frame-ancestors 'none'/.test(r.headers()['content-security-policy'] || '') && r.headers()['x-frame-options'] === 'DENY');
	const pw = await page.evaluate(() => document.documentElement.scrollWidth);
	ok('[隐私] 手机宽度不横向滚动（表格变成一条一条）', pw <= 390, pw);
	if (SHOTS) await page.screenshot({ path: SHOTS + '/site-privacy.png' });
	r = await page.goto(B + '/security'); await W(300); t = await page.textContent('body');
	ok('[安全] 打开 /security：做了哪些措施、没覆盖的风险、被入侵了怎么办', r.status() === 200 && /做了哪些措施/.test(t) && /没覆盖的风险/.test(t) && /没有签名/.test(t) && /Cloudflare 能看到流量/.test(t) && /换登录密钥/.test(t));
	ok('[安全] 不写「所有安全问题都已解决」「进不了」这类绝对的话', !/所有安全问题|进不了|绝对安全|100%/.test(t));
	// 报告表单
	await page.fill('#rpForm [name=text]', '太短'); await page.click('#rpGo'); await W(300);
	ok('[报告] 太短：页面上直接提示，不提交', await page.isVisible('#rpErr') && /至少 10 个字/.test(await page.textContent('#rpErr')));
	await page.selectOption('#rpForm [name=kind]', 'privacy');
	await page.fill('#rpForm [name=text]', '我想删除我账号的所有数据，谢谢处理');
	await page.fill('#rpForm [name=contact]', 'me@x.com');
	await page.click('#rpGo'); await W(800);
	ok('[报告] 提交成功：显示已经收到', await page.isVisible('#rpOk') && !(await page.isVisible('#rpForm')));
	const FL = await env.H.get('hub').feedbacks();
	ok('[报告] 管理后台收到：类型、内容、联系方式', FL.some((x) => x.kind === 'privacy' && /删除我账号/.test(x.text) && x.contact === 'me@x.com'));
	if (SHOTS) await page.screenshot({ path: SHOTS + '/site-security.png', fullPage: true });
	await page.goto(B + '/security#report'); await page.reload(); await W(300);
	await page.evaluate(() => { document.querySelector('#rpForm [name=website]').value = 'http://spam'; });
	await page.fill('#rpForm [name=text]', '机器人提交的垃圾内容垃圾内容'); const n1 = (await env.H.get('hub').feedbacks()).length;
	await page.click('#rpGo'); await W(600);
	ok('[报告] 陷阱字段被填（机器人）：页面显示成功，但不存', await page.isVisible('#rpOk') && (await env.H.get('hub').feedbacks()).length === n1);
	ok('[隐私/安全] 页面没有报错', !e2.length, e2.join(' | '));
	await ctx.close();
}
await browser.close(); server.close();
console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[2] && !x[1] ? '（' + String(x[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
process.exit(results.every((x) => x[1]) ? 0 : 1);

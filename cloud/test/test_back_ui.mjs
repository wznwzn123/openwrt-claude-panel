// 6.0 第 68 项：官网的返回（手机侧滑、返回键、电脑后退键）——先关弹窗 / 手机菜单，再回上一页；弹窗里填了没提交的先问
// 需要 Playwright：node test/test_back_ui.mjs
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => { const u = new URL(typeof input === 'string' ? input : input.url); if (u.hostname === 'localhost') return realFetch(input, init); return new Response('{}'); };
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
await new Promise((z) => server.listen(8191, z));
const B = 'http://localhost:8191';
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const browser = await chromium.launch();
const errs = [];
for (const [w, h] of [[390, 844], [1280, 860]]) {
	const T = '［' + w + '］', phone = w < 900;
	const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone });
	const p = await ctx.newPage(); p.on('pageerror', (x) => errs.push(T + x.message));
	const dlg = []; let answer = true; p.on('dialog', (d) => { dlg.push(d.message()); answer ? d.accept() : d.dismiss(); });
	const back = async () => { await p.goBack({ waitUntil: 'commit', timeout: 3000 }).catch(() => {}); await W(600); };
	const path = () => new URL(p.url()).pathname;
	// 注册登录
	await p.goto(B + '/status'); await W(500);
	await p.goto(B + '/app#reg'); await W(700);
	await p.fill('#fReg [name=email]', 'bk' + w + '@x.com'); await p.fill('#fReg [name=password]', 'pass-bk-1234'); await p.click('#fReg button.primary'); await W(1600);
	ok('登录进了账号页' + T, await p.isVisible('#setBtn'));
	await p.click('#setBtn'); await W(700);
	ok('打开账号设置（#settings）' + T, (await p.isVisible('#meEdit')) && p.url().endsWith('#settings'));
	// 弹窗：返回先关弹窗
	await p.click('#meEdit'); await W(400);
	ok('打开「编辑个人资料」弹窗' + T, await p.isVisible('.mask'));
	await back();
	ok('返回：先关弹窗，还在账号设置' + T, !(await p.isVisible('.mask')) && p.url().endsWith('/app#settings'), p.url());
	// 填了没提交：先问；选「取消」弹窗还在、填的字还在
	await p.click('#meEdit'); await W(400);
	await p.fill('#pfName', '新名字'); answer = false; dlg.length = 0;
	await back();
	ok('填了没提交按返回：先问「确定关掉吗」' + T, dlg.some((x) => /还没提交/.test(x)), dlg.join('|'));
	ok('选「取消」：弹窗还在、填的字还在' + T, (await p.isVisible('.mask')) && (await p.inputValue('#pfName')) === '新名字');
	answer = true;
	await back();
	ok('再按返回选「确定」：弹窗关掉，还在账号设置' + T, !(await p.isVisible('.mask')) && p.url().endsWith('/app#settings'));
	// 用按钮关的弹窗：返回一次就回上一页（不会按了没反应）
	await p.click('#meEdit'); await W(400);
	await p.click('.mask [data-x]'); await W(400);
	ok('点「取消」关了弹窗' + T, !(await p.isVisible('.mask')));
	await back();
	ok('按钮关掉弹窗后：返回一次回到上一页（账号首页）' + T, path() === '/app' && !p.url().includes('#settings') && (await p.isVisible('#setBtn')), p.url());
	// 手机菜单：返回先关菜单
	if (phone) {
		await p.goto(B + '/help'); await W(800);
		await p.click('.nav__toggle'); await W(400);
		const isOpen = () => p.evaluate(() => document.querySelector('.nav').classList.contains('is-open'));
		ok('手机：打开顶部菜单' + T, await isOpen());
		await back();
		ok('手机：返回先关菜单，还在这一页' + T, !(await isOpen()) && path() === '/help', p.url());
		await p.click('.nav__toggle'); await W(400);
		const link = p.locator('.nav a[href="/changelog"]').first();
		if (await link.count()) {
			await link.click(); await W(1200);
			ok('手机：菜单里点去别的页面' + T, path() === '/changelog', p.url());
			await back();
			ok('手机：返回回到刚才那页，菜单是关着的' + T, path() === '/help' && !(await isOpen()), p.url());
			await back();
			ok('手机：再返回就是更早那页（不会按了没反应）' + T, path() !== '/help', p.url());
		} else ok('手机：菜单里有「更新日志」链接' + T, false, await p.innerHTML('.nav').catch(() => ''));
	}
	await ctx.close();
}
// ===== 管理后台：开着命令面板 / 手机菜单时按返回先关它们，不跳页面 =====
for (const [w, h] of [[390, 844], [1280, 860]]) {
	const T = '［后台 ' + w + '］', phone = w < 900;
	const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone });
	const p = await ctx.newPage(); p.on('pageerror', (x) => errs.push(T + x.message));
	const back = async () => { await p.goBack({ waitUntil: 'commit', timeout: 3000 }).catch(() => {}); await W(700); };
	await p.goto(B + '/admin'); await W(1200);
	await p.fill('input[type=password]', 'admin-key-1234567890'); await p.click('button[type=submit]'); await W(2200);
	const h0 = new URL(p.url()).hash;
	const toDev = async () => { if (phone) { await p.click('.topbar [aria-label="切换导航"]'); await W(600); } await p.click('.nav-item:has-text("路由器")'); await W(1200); };
	await toDev();
	ok('进了「设备」页' + T, p.url().endsWith('#/devices'), p.url());
	await p.keyboard.press('Control+k'); await W(500);
	const cmd = () => p.isVisible('.cmd-overlay');
	ok('打开命令面板' + T, await cmd());
	await back();
	ok('返回：先关命令面板，还在「设备」页' + T, !(await cmd()) && p.url().endsWith('#/devices'), p.url());
	await back();
	ok('再返回：回到上一页' + T, !p.url().endsWith('#/devices') && new URL(p.url()).hash === h0, p.url() + ' / ' + h0);
	if (phone) {
		await toDev();
		const tg = p.locator('.topbar [aria-label="切换导航"]').first();
		if (await tg.count()) {
			await tg.click(); await W(500);
			const mo = () => p.evaluate(() => !!document.querySelector('.is-mobile-open'));
			ok('手机：打开后台菜单' + T, await mo());
			await back();
			ok('手机：返回先收起菜单，还在「设备」页' + T, !(await mo()) && p.url().endsWith('#/devices'), p.url());
		} else ok('手机：找到后台菜单按钮' + T, false);
	}
	await ctx.close();
}
await browser.close(); server.close();
if (errs.length) ok('页面没有报错', false, errs.join('；'));
console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
process.exit(results.every((r) => r[1]) ? 0 : 1);

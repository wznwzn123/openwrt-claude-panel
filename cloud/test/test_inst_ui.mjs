// 5.2 官网「添加路由器 → 装新路由器」：领试用 / 兑换邀请码 → 安装码和安装命令 → 路由器装好后自动出现（真浏览器）
// 用法：node test/test_inst_ui.mjs [--shots 目录]
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
	if (u.hostname === 'api.cloudflare.com') { const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] })); if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 't' + Math.random(), token: 'tok' }); if (m === 'POST') return R({ id: 'd' + Math.random() }); return R({}); }
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
await new Promise((z) => server.listen(8137, z));
const B = 'http://localhost:8137';
const api = async (path, body, hdr = {}) => (await realFetch(B + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const browser = await chromium.launch();
let ipn = 10;
for (const [w, h] of [[390, 844], [1280, 860]]) {
	const T = '［' + w + '］';
	const inv = (await api('/api/admin/invites', { max: 3, svc: 30, note: '阿明' }, ADM)).invite.code;
	const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 });
	await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B });
	const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
	await p.goto(B + '/app#reg'); await W(700);
	const email = 'new' + w + '@x.com';
	await p.fill('#fReg [name=email]', email); await p.fill('#fReg [name=password]', 'pass-new-1234'); await p.click('#fReg button.primary'); await W(1600);
	const add = p.locator('[data-blk="add"]');
	ok('新账号：添加路由器默认是「装新路由器」，有免费试用和「填邀请码」' + T, await add.locator('[data-seg="new"].on').isVisible() && await p.isVisible('#trialGo') && await p.isVisible('#fRedeem input'));
	ok('「我的路由器」空的时候说去「装新路由器」' + T, /装新路由器/.test(await p.textContent('#devs')));
	ok('老的配对码收在「已经装好了」里，默认不展开' + T, !(await p.isVisible('#fBind input')));
	if (SHOTS) { await add.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SHOTS}/inst-new-${w}.png` }); }
	await p.click('#trialGo'); await W(1500);
	let card = p.locator('.inst').first();
	ok('领试用：出现安装码卡片，带步骤和安装命令（命令里带着安装码）' + T, await card.isVisible() && /免费试用 7 天/.test(await card.textContent()) && /sh install\.sh --invite [A-Z2-9]{10}$/.test((await card.locator('pre.cmd').textContent()).trim()) && /openwrt-claude-panel-hosted\.tar\.gz/.test(await card.locator('pre.cmd').textContent()));
	ok('领完试用：试用按钮没了（每个账号一次）' + T, !(await p.isVisible('#trialGo')));
	ok('步骤里说清楚：终端里输 1 是 AI 版，输 2 是纯面板版' + T, /1AI版/.test((await card.locator('.pickv').textContent()).replace(/\s/g, '')) && /2纯面板版/.test((await card.locator('.pickv').textContent()).replace(/\s/g, '')));
	await card.locator('[data-cp]').click(); await W(400);
	const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
	ok('「复制命令」：复制的就是这条命令' + T, /hosted\.tar\.gz.*--invite [A-Z2-9]{10}$/.test(clip), clip);
	// 兑换邀请码
	await p.fill('#fRedeem input', 'WRONGCODE1'); await p.click('#fRedeem button'); await W(800);
	ok('邀请码填错：在框下面说不对' + T, /不对/.test(await p.locator('[data-segp="new"] [data-err]').first().textContent()));
	await p.fill('#fRedeem input', inv.toLowerCase()); await p.click('#fRedeem button'); await W(1500);
	ok('兑换邀请码：多一张安装码卡片（开通后用 30 天）' + T, (await p.locator('.inst').count()) === 2 && /开通后用 30 天/.test(await p.locator('.inst').first().textContent()));
	if (SHOTS) { await p.locator('.inst').first().scrollIntoViewIfNeeded(); await p.screenshot({ path: `${SHOTS}/inst-codes-${w}.png` }); }
	// 路由器那边用第一个安装码装好：页面自动刷新出现
	const code = (await p.locator('.inst').first().getAttribute('data-ic'));
	const R = await api('/api/register', { invite: code, name: 'Living', model: 'Xiaomi AX3000T' }, { 'cf-connecting-ip': '7.7.7.' + ipn++ });
	ok('路由器用安装码开通，自动加到账号' + T, R.bound === true, JSON.stringify(R).slice(0, 120));
	await W(8000);
	const devs = await p.textContent('#devs');
	ok('不用刷新：「我的路由器」里自动出现这台，标着主账号' + T, /Living/.test(devs) && /主账号/.test(devs), devs.slice(0, 200));
	ok('用掉的安装码卡片没了，还剩一张' + T, (await p.locator('.inst').count()) === 1);
	ok('弹出提示「装好了」' + T, /装好了/.test(await p.textContent('body')));
	if (SHOTS) { await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: `${SHOTS}/inst-done-${w}.png` }); }
	ok('页面没有报错' + T, !errs.length, errs.join(' | '));
	ok('不横向滚动' + T, (await p.evaluate(() => document.documentElement.scrollWidth)) <= w);
	await c.close();
}
// 管理后台「邀请码」：试用次数设置、兑换记录
{
	const c = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
	await p.goto(B + '/admin'); await W(1200); await p.fill('input[type=password]', 'admin-key-1234567890'); await p.click('button[type=submit]'); await W(2200);
	await p.goto(B + '/admin#/invites'); await W(1600);
	const t = await p.textContent('.page');
	ok('[后台] 邀请码页有「每个账号最多领几次试用」', /每个账号最多领几次试用/.test(t));
	ok('[后台] 邀请码下面列出谁兑换了、装好没有', /兑换的：new\d+@x\.com（[^）]*已装好）/.test(t), t.slice(0, 600));
	ok('[后台] 安装码、试用码不单独占一行（只显示管理员发的邀请码）', (await p.locator('.hub-row code').count()) === 2);
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/inst-admin.png` });
	await p.locator('.hub-row', { hasText: '每个账号最多领几次试用' }).locator('input').fill('3'); await p.locator('.hub-row', { hasText: '每个账号最多领几次试用' }).locator('button', { hasText: '保存' }).click(); await W(1000);
	ok('[后台] 改成 3 次：保存上了', (await env.H.get('hub').trialMax()) === 3);
	ok('[后台] 没有报错', !errs.length, errs.join(' | '));
	await c.close();
}
await browser.close(); server.close();
console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 300) + '）')).join('\n'));
const pass = results.filter((r) => r[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

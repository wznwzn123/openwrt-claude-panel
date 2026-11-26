// 6.0 第 95 项：管理后台「兼容性 → 尝鲜申请」（真浏览器）：等审核 / 已通过 / 拒绝和撤销三栏；
// 每条看得到匿名信息（申请人编号、型号、系统、版本、内存、闪存、兼容问题、留言），看不到邮箱和专属网址编号；
// 同意、拒绝、撤销这台、撤销此人（同一个人的几台一起撤）
// 用法：node test/test_beta_admin_ui.mjs [--shots 目录]
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
const realFetch = globalThis.fetch; const MAILS = [];
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url);
	if (url === 'https://api.resend.com/emails') { MAILS.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); }
	if (u.hostname === 'localhost') return realFetch(input, init);
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '', RESEND_API_KEY: 're_test' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const H = () => env.H.get('hub'), S = () => H().ctx.storage;
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const r = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: { ...req.headers, 'cf-connecting-ip': '127.0.0.1' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8139, z));
const B = 'http://localhost:8139';
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const now = Date.now();
const mk = async (id, ap, extra = {}) => S().put('cp:' + id, { at: now - 864e5, last: now - 3600e3, ver: '6.0.0', code: 'hosted-ai', model: 'Xiaomi AX3000T', plat: 'mediatek/filogic', sys: 'OpenWrt 23.05.3', kernel: '5.15.150', mem: 238, flash: 21504, caps: { fw: 'fw4', pkg: 'opkg', cfd: 'ram' }, fails: [{ key: 'tunnel-aaaaaaaaaa', f: 'tunnel', why: '闪存只剩 21 MB，放不下 cloudflared', at: now - 864e5, last: now - 3600e3, ver: '6.0.0' }], ap, beta: true, betaOk: ap.st === 'ok', betaAt: ap.at, ...extra });
const reset = async () => {
	for (const [k] of await S().list({ prefix: 'cp:' })) await S().delete(k);
	// 申请记的是官网账号（用户 11/27：邮箱一律用官网账号的），通知发到账号邮箱
	await S().put('u:uidsecret123', { uid: 'uidsecret123', email: 'secret@mail.example', devs: [] });
	await S().put('u:uidother1234', { uid: 'uidother1234', email: 'other@mail.example', devs: [] });
	await mk('aaaaaaaaaaaaaaaa', { st: 'wait', at: now - 7200e3, note: '闪存只有 16 MB，想试试新版装不装得上', pid: 'K7M3PQRS', uid: 'uidsecret123', hosted: false });
	await mk('bbbbbbbbbbbbbbbb', { st: 'ok', at: now - 5 * 864e5, dec: now - 4 * 864e5, note: '', pid: 'K7M3PQRS', uid: 'uidsecret123', hosted: false }, { model: 'GL.iNet MT3000', sys: 'OpenWrt 21.02.7', mem: 480 });
	await mk('cccccccccccccccc', { st: 'ok', at: now - 3 * 864e5, dec: now - 2 * 864e5, note: '', pid: 'Z2X8WNTV', sub: 'hostabcd', hosted: true }, { model: 'x86_64', fails: [] });
	await mk('dddddddddddddddd', { st: 'rev', at: now - 9 * 864e5, dec: now - 864e5, note: '', pid: 'Q9R4HJKL', uid: 'uidother1234', hosted: false }, { model: 'Redmi AX6000' });
};
await reset();
const browser = await chromium.launch();
for (const [w, h, dark] of [[390, 844, false], [390, 844, true], [1440, 900, false]]) {
	const T = '［' + w + (dark ? ' 深色' : '') + '］';
	await reset(); MAILS.length = 0;
	const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 1024, colorScheme: dark ? 'dark' : 'light' });
	const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
	await p.goto(B + '/admin'); await W(1200); await p.fill('input[type=password]', 'admin-key-1234567890'); await p.click('button[type=submit]'); await W(2200);
	await p.goto(B + '/admin#/compat'); await W(1600);
	await p.locator('.segmented button', { hasText: '尝鲜申请' }).click(); await W(500);
	ok('「尝鲜申请」上写着等审核几个' + T, /尝鲜申请\s*1/.test(await p.locator('.segmented button', { hasText: '尝鲜申请' }).textContent()));
	let t = await p.locator('.hub-list').last().textContent();
	ok('默认看等审核：一条，有留言、型号、系统、内核、版本、内存、闪存、开不了的功能' + T, /闪存只有 16 MB/.test(t) && /Xiaomi AX3000T/.test(t) && /OpenWrt 23\.05\.3/.test(t) && /5\.15\.150/.test(t) && /v6\.0\.0/.test(t) && /238 MB/.test(t) && /21 MB/.test(t) && /闪存只剩 21 MB，放不下 cloudflared/.test(t), t.slice(0, 400));
	ok('申请人只显示匿名编号，写着同一个人共 2 台' + T, /申请人 K7M3/.test(t) && /共 2 台/.test(t));
	ok('看不到邮箱、专属网址编号' + T, !/secret@mail\.example/.test(await p.content()) && !/hostabcd/.test(await p.content()));
	ok('等审核的有「同意」「拒绝」「撤销此人」' + T, ['同意', '拒绝', '撤销此人'].every((x) => t.includes(x)));
	ok('不横向滚动' + T, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/beta-wait-${w}${dark ? '-dark' : ''}.png`, fullPage: true });
	// 同意
	await p.locator('.hub-row', { hasText: '闪存只有 16 MB' }).locator('button', { hasText: '同意' }).click(); await W(500);
	const dlg = p.locator('[role=dialog]').last();
	ok('同意前确认：说清楚会怎样、会通知申请人' + T, /同意尝鲜申请/.test(await dlg.textContent()) && /通知申请人/.test(await dlg.textContent()));
	await dlg.locator('button', { hasText: '同意' }).click(); await W(1200);
	ok('同意后：记成已通过，给申请人官网账号的邮箱发了通知' + T, (await S().get('cp:aaaaaaaaaaaaaaaa')).ap.st === 'ok' && MAILS.some((m) => /尝鲜申请通过了/.test(m.subject)));
	// 已通过：撤销这台、撤销此人
	await p.locator('.segmented button', { hasText: '已通过' }).click(); await W(400);
	t = await p.locator('.hub-list').last().textContent();
	ok('已通过：三台，有「撤销这台」「撤销此人」' + T, (await p.locator('.hub-list').last().locator('.hub-row').count()) === 3 && /撤销这台/.test(t) && /撤销此人/.test(t));
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/beta-ok-${w}${dark ? '-dark' : ''}.png`, fullPage: true });
	await p.locator('.hub-row', { hasText: 'x86_64' }).locator('button', { hasText: '撤销这台' }).click(); await W(500);
	await p.locator('[role=dialog]').last().locator('button', { hasText: '撤销这台' }).click(); await W(1200);
	ok('撤销这台：只撤这一台，推送给托管版' + T, (await S().get('cp:cccccccccccccccc')).ap.st === 'rev' && (await S().get('cp:aaaaaaaaaaaaaaaa')).ap.st === 'ok' && ((await env.W.get('dev:hostabcd').ctx.storage.get('nlog')) || []).some((x) => /撤销/.test(x.title)));
	MAILS.length = 0;
	await p.locator('.hub-row', { hasText: 'GL.iNet MT3000' }).locator('button', { hasText: '撤销此人' }).click(); await W(500);
	ok('撤销此人：确认框写着几台' + T, /2 台/.test(await p.locator('[role=dialog]').last().textContent()));
	await p.locator('[role=dialog]').last().locator('button', { hasText: '全部撤销' }).click(); await W(1200);
	ok('撤销此人：这个人的两台都撤了，只发一封邮件' + T, (await S().get('cp:aaaaaaaaaaaaaaaa')).ap.st === 'rev' && (await S().get('cp:bbbbbbbbbbbbbbbb')).ap.st === 'rev' && MAILS.length === 1);
	await p.locator('.segmented button', { hasText: '拒绝和撤销' }).click(); await W(400);
	t = await p.locator('.hub-list').last().textContent();
	ok('拒绝和撤销：都在这里，能「直接同意」' + T, (await p.locator('.hub-list').last().locator('.hub-row').count()) === 4 && /已撤销/.test(t) && /直接同意/.test(t));
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/beta-end-${w}${dark ? '-dark' : ''}.png`, fullPage: true });
	const lg = JSON.stringify(await (await realFetch(B + '/api/admin/log', { headers: { authorization: 'Bearer admin-key-1234567890' } })).json());
	ok('操作记录：同意、撤销都记下' + T, /同意尝鲜申请/.test(lg) && /撤销尝鲜（申请人 K7M3 的 2 台）/.test(lg), lg.slice(0, 200));
	ok('没有页面错误' + T, !errs.length, errs.join(' | '));
	await c.close();
}
await browser.close(); server.close();
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 300))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

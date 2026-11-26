// 6.0 第 46 项（官网界面）：名额满了照样能注册（用户 11/27），注册页写一行托管名额已满；账号页试用那一行换成排队（用账号邮箱）；没满照常
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (u.hostname === 'api.cloudflare.com') { const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] })); if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 'tun' + Math.random(), token: 'tok' }); if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'dns' + Math.random() }); return R({}); }
	if (url === 'https://api.resend.com/emails') return new Response('{"id":"m"}');
	if (u.hostname === 'localhost') return realFetch(input, init);
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '1', VAPID_PUB: '', VAPID_PRIV: '', RESEND_API_KEY: 're' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const r0 = new Request('http://localhost' + req.url, { method: req.method, headers: { ...req.headers, 'cf-connecting-ip': '127.0.0.' + Math.floor(Math.random() * 200) }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
	const r = await mod.default.fetch(Object.assign(r0, { cf: { country: 'TW' } }), env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
	const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) h['set-cookie'] = sc;
	res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8195, z));
const H = env.H.get('hub');
const browser = await chromium.launch();
try {
	// 先占满（上限 1）
	const inv = (await (await mod.default.fetch(new Request('http://localhost/api/admin/invites', { method: 'POST', body: JSON.stringify({ direct: true, max: 5, svc: 0 }), headers: { authorization: 'Bearer admin-key-1234567890', 'content-type': 'application/json' } }), env)).json()).invite.code;
	await H.register({ invite: inv, name: 'R', model: 'M', ip: '1.1.1.1' });
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, colorScheme: dark ? 'dark' : 'light' });
		const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
		await p.goto('http://localhost:8195/app#reg'); await p.waitForTimeout(1200);
		ok('名额满了：照样能注册，表单上面写着托管名额已满' + T, await p.isVisible('#fReg') && !(await p.isVisible('#fWait')) && await p.isVisible('#fReg [data-fullnote]') && /托管名额已满/.test(await p.textContent('#fReg [data-fullnote]')));
		ok('不横向滚动' + T, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await p.screenshot({ path: `test/shots-quota-${w}.png` }).catch(() => {});
		const rk = env.RESEND_API_KEY; delete env.RESEND_API_KEY; // 注册不要验证码
		await p.fill('#fReg [name=email]', 'q' + w + '@x.com'); await p.fill('#fReg [name=password]', 'pass-q' + w + '-12345'); await p.click('#fReg button.primary'); await p.waitForTimeout(1500);
		env.RESEND_API_KEY = rk;
		ok('注册上了：试用那一行换成「托管名额已满」+ 排队' + T, await p.isVisible('#waitGo') && /托管名额已满/.test(await p.textContent('#trialRow')) && !(await p.isVisible('#trialGo')), await p.textContent('#trialRow'));
		ok('账号页不横向滚动' + T, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await p.locator('#trialRow').scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
		await p.screenshot({ path: `test/shots-quota-acct-${w}.png` }).catch(() => {});
		await p.click('#waitGo'); await p.waitForTimeout(800);
		ok('排上了：按钮变成「已排队」' + T, (await p.textContent('#waitGo')) === '已排队' && (await p.isDisabled('#waitGo')));
		ok('排队用的是账号邮箱' + T, (await H.waitList()).some((x) => x.email === 'q' + w + '@x.com'));
		ok('页面没报错' + T, !errs.length, errs.join('|'));
		await ctx.close();
	}
	// 调大上限：照常注册
	await H.setMax(10);
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
	await p.goto('http://localhost:8195/app#reg'); await p.waitForTimeout(1200);
	ok('没满：照常显示注册，没有名额已满那一行', await p.isVisible('#fReg') && !(await p.isVisible('#fWait')) && !(await p.isVisible('#fReg [data-fullnote]')));
	await ctx.close();
} finally { await browser.close(); server.close(); }
if (!process.env.KEEP) for (const f of ['test/shots-quota-320.png', 'test/shots-quota-390.png', 'test/shots-quota-acct-320.png', 'test/shots-quota-acct-390.png']) try { (await import('fs')).rmSync(f); } catch (e) {}
let pass = 0; for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '  ' + (note || '').slice(0, 300))); if (c) pass++; }
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

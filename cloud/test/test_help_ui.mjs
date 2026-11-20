// 官网「服务状态」「常见问题」和后台对应两页（真浏览器）
// 用法：node test/test_help_ui.mjs [--shots 目录]
import http from 'http';
import { createRequire } from 'module';
import { load, memStorage } from './load.mjs';
import { FAQ_DEFAULT } from '../faq-default.js';
const N = FAQ_DEFAULT.length;
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url);
	if (u.hostname === 'localhost') return realFetch(input, init);
	if (u.hostname === 'github.com') return new Response('sums');
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: 'p', VAPID_PRIV: 'q', RESEND_API_KEY: 're_x' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const H = () => env.H.get('hub');
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const r = await mod.default.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: { ...req.headers, 'cf-connecting-ip': '127.0.0.1' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8148, z));
const B = 'http://localhost:8148';
const ADM = { authorization: 'Bearer admin-key-1234567890', 'content-type': 'application/json' };
const api = async (path, body, method) => (await realFetch(B + path, { method: method || (body ? 'POST' : 'GET'), headers: ADM, body: body ? JSON.stringify(body) : undefined })).json();
const W = (ms) => new Promise((z) => setTimeout(z, ms));

// 准备数据：两天的检查记录，一个正在处理的故障，一个已恢复的故障
await H().statusTick(Date.now() - 86400e3); await H().statusTick();
const old = (await api('/api/admin/incidents', { title: '一键更新下载很慢', level: 'part', comps: ['dl'], text: '正在查' })).inc;
await api('/api/admin/incidents/' + old.id, { text: '已恢复，GitHub 下载恢复正常。', resolve: true });
const cur = (await api('/api/admin/incidents', { title: '部分专属网址打开很慢', level: 'part', comps: ['tunnel'], text: '收到反馈，正在查原因。' })).inc;
await api('/api/admin/incidents/' + cur.id, { text: '已经找到原因，正在修复。' });

const b = await chromium.launch();
const errs = [];
const page = async (w, h, mob) => { const c = await b.newContext(mob ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } }); const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message)); return p; };
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);

/* ---------- 服务状态 ---------- */
{
	const p = await page(390, 844, true);
	await p.goto(B + '/status'); await p.waitForSelector('.st-c[data-k="web"]');
	ok('[状态页] 顶上写着正在处理的故障', /部分专属网址打开很慢/.test(await p.textContent('#stNowT')), await p.textContent('#stNowT'));
	ok('[状态页] 「正在处理」：最新进展在最前面', (await p.locator('.st-inc .st-ups li').first().textContent()).includes('已经找到原因'));
	ok('[状态页] 各项服务都有 90 个格子', (await p.locator('.st-c[data-k="web"] .st-bars span').count()) === 90);
	ok('[状态页] 没配的服务不显示（发文件）', (await p.locator('.st-c[data-k="files"]').count()) === 0);
	const past = await p.textContent('#stPast');
	ok('[状态页] 「过去的故障」显示最后的恢复说明', past.includes('一键更新下载很慢') && past.includes('GitHub 下载恢复正常') && !past.includes('正在查'), past);
	const last = p.locator('.st-c[data-k="web"] .st-bars span').last();
	const bb = await last.boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await W(200);
	ok('[状态页] 点格子显示那天的情况', /正常/.test((await p.textContent('.st-tip').catch(() => '')) || ''), await p.textContent('.st-tip').catch(() => '无'));
	ok('[状态页] 手机上不横向滚动', (await overflow(p)) <= 0);
	if (SHOTS) await p.screenshot({ path: SHOTS + '/status-390.png', fullPage: true });
	const p3 = await page(320, 640, true); await p3.goto(B + '/status'); await p3.waitForSelector('.st-c');
	ok('[状态页] 320 宽也不横向滚动', (await overflow(p3)) <= 0);
	const pd = await page(1280, 860); await pd.goto(B + '/status'); await pd.waitForSelector('.st-c');
	const t = await pd.locator('.st-inc .st-ups time').first().boundingBox();
	ok('[状态页] 电脑上进展的时间不折行', t && t.height < 30, t && t.height);
}

/* ---------- 常见问题 ---------- */
{
	const p = await page(390, 844, true);
	await p.goto(B + '/help'); await p.waitForSelector('.hp-q');
	ok('[常见问题] 全部 ' + N + ' 条都在', (await p.locator('.hp-q').count()) === N);
	await p.locator('.hp-cats button', { hasText: '更新' }).click(); await W(150);
	ok('[常见问题] 按分类看', (await p.locator('.hp-q').count()) === 3 && (await p.locator('.hp-grp h2').textContent()) === '更新');
	await p.locator('.hp-cats button', { hasText: '全部' }).click();
	const search = async (q) => { await p.fill('#hpQ', q); await W(350); return { n: await p.locator('.hp-q').count(), first: (await p.locator('.hp-q').first().textContent().catch(() => '')).trim() }; };
	let r = await search('换手机');
	ok('[常见问题] 搜「换手机」：只有那一条，自动展开', r.n === 1 && r.first.startsWith('换了手机') && (await p.locator('.hp-q').first().getAttribute('aria-expanded')) === 'true', JSON.stringify(r));
	r = await search('续期码');
	ok('[常见问题] 搜到的词标出来', (await p.locator('.hp-q mark').count()) > 0 && r.n >= 1);
	r = await search('续费');
	ok('[常见问题] 说法不一样也能搜到（「续费」找到续期）', r.n >= 1 && /续期|到期/.test(r.first), JSON.stringify(r));
	r = await search('wifi');
	ok('[常见问题] 「wifi」能搜到写成 Wi-Fi 的', r.n >= 1 && /Wi-Fi/.test(r.first), JSON.stringify(r));
	r = await search('能不能投屏到电视');
	ok('[常见问题] 搜不到：显示没找到，给出去处', r.n === 0 && /没找到/.test(await p.textContent('#hpOut')));
	await W(1900);
	const ml = await api('/api/admin/faqmiss');
	ok('[常见问题] 搜不到的词记到后台', ml.list.some((x) => x.q === '能不能投屏到电视'), JSON.stringify(ml.list));
	await p.click('#hpClear'); await W(200);
	ok('[常见问题] 清空后回到全部', (await p.locator('.hp-q').count()) === N);
	await p.locator('#fam-perm .hp-q').click();
	ok('[常见问题] 点问题展开回答', (await p.locator('#a-fam-perm').getAttribute('hidden')) === null);
	await p.evaluate(() => { location.hash = 'login-code'; }); await W(300);
	ok('[常见问题] 同一页里换 # 也能跳过去展开', (await p.locator('#login-code .hp-q').getAttribute('aria-expanded')) === 'true');
	const p2 = await page(390, 844, true); await p2.goto(B + '/help#host-renew'); await p2.waitForSelector('#host-renew'); await W(300);
	const y = (await p2.locator('#host-renew').boundingBox()).y;
	ok('[常见问题] 打开带 # 的链接：展开那一条，不被顶栏挡住', (await p2.locator('#host-renew .hp-q').getAttribute('aria-expanded')) === 'true' && y >= 60, y);
	const p4 = await page(390, 844, true); await p4.goto(B + '/help?q=' + encodeURIComponent('忘记密码')); await p4.waitForSelector('.hp-q');
	ok('[常见问题] ?q= 带着搜索词打开', (await p4.inputValue('#hpQ')) === '忘记密码' && /忘记官网密码/.test(await p4.locator('.hp-q').first().textContent()));
	ok('[常见问题] 手机上不横向滚动', (await overflow(p)) <= 0);
	const p3 = await page(320, 640, true); await p3.goto(B + '/help'); await p3.waitForSelector('.hp-q');
	ok('[常见问题] 320 宽也不横向滚动', (await overflow(p3)) <= 0);
	if (SHOTS) await p2.screenshot({ path: SHOTS + '/help-deep-390.png' });
}

/* ---------- 后台 ---------- */
{
	const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
	await c.addInitScript(() => { try { sessionStorage.setItem('hub.adminKey', 'admin-key-1234567890'); } catch (e) {} });
	const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message));
	await p.goto(B + '/admin#/faq'); await p.waitForSelector('.faq-grp');
	ok('[后台常见问题] 打开能看到搜不到的词', (await p.locator('.hub-row', { hasText: '能不能投屏到电视' }).count()) === 1);
	await p.locator('.hub-row', { hasText: '能不能投屏到电视' }).getByRole('button', { name: '写一条' }).click();
	await p.getByPlaceholder('用大家会问的说法').fill('能投屏吗？');
	await p.locator('.faq-form textarea').fill('不能。**面板**只管路由器。');
	await W(200);
	ok('[后台常见问题] 回答预览按官网的样子显示', (await p.locator('.faq-pv-a b').textContent()) === '面板');
	await p.getByRole('button', { name: '加上' }).click(); await W(800);
	const pub = await (await realFetch(B + '/api/help')).json();
	ok('[后台常见问题] 加上以后官网能看到', pub.items.some((x) => x.q === '能投屏吗？'));
	ok('[后台常见问题] 写完的词从「搜不到」里划掉', !(await api('/api/admin/faqmiss')).list.some((x) => x.q === '能不能投屏到电视'));
	await p.goto(B + '/admin#/status'); await p.waitForSelector('.st-more textarea');
	await p.locator('.st-more textarea').first().fill('修好了，正在观察。');
	await p.getByRole('button', { name: '发出去' }).first().click(); await W(700);
	let s = await (await realFetch(B + '/api/status')).json();
	ok('[后台状态] 补充进展', s.inc.find((x) => x.id === cur.id).ups[0].text === '修好了，正在观察。');
	await p.getByRole('button', { name: '已恢复' }).first().click(); await W(300);
	await p.locator('[role=dialog]').getByRole('button', { name: '已恢复' }).click(); await W(700);
	s = await (await realFetch(B + '/api/status')).json();
	ok('[后台状态] 标为已恢复', s.inc.find((x) => x.id === cur.id).end > 0);
	const nav = await p.locator('nav, aside').first().textContent();
	ok('[后台] 菜单里有「常见问题」「服务状态」', nav.includes('常见问题') && nav.includes('服务状态'));
}

ok('[全部] 页面没有报错', !errs.length, errs.join(' | '));
await b.close(); server.close();
console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 300) + '）')).join('\n'));
const pass = results.filter((x) => x[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

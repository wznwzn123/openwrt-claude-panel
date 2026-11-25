// 6.0 第 94 项（面板这边）：托管版的「AI 版 / 本地版」
// 我的主页显示版本、主账号能换（说清楚后果、看进度、失败说在哪一步）；在外面换成本地版时连不上是正常的，直接告诉他在家里怎么打开；
// 旧的托管纯面板版提示一次；托管服务到期弹卡片能输续期码；在家里 http 地址打开时推送、指纹说清楚为什么用不了；云端状态改读专属网址
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const S = { ed: 'local', svc: null, job: null, seq: [], calls: [], down: false, renewed: false, cloud: [] };
const LAN = { ip: '192.168.6.1', port: 906, url: 'http://192.168.6.1:906/panel/' };
const handler = (req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) {
		const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, '');
		S.calls.push({ m, p: body.params });
		const R = (result) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })), E = (code, message) => res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code, message } }));
		if (m === 'pass_new') return R({ pass: 'p'.repeat(32), exp: Date.now() + 3600e3 });
		if (m === 'whoami') return R({ hosted: true, hub: 'https://hub.example', ai: true, role: 'owner', perms: [], uid: null, emerg: true, lanin: true, ed: S.ed, lan: LAN, ...(S.svc ? { svc_off: S.svc } : {}), lock: { on: false } });
		if (S.svc && !['whoami', 'svc_info', 'svc_renew', 'notices', 'notices_seen', 'client_error', 'compat_info', 'edition_state'].includes(m)) return E(-32016, S.svc === 'exp' ? '托管服务到期了，续期以后才能用：在官网「我的路由器」申请续期，或者在面板里输入续期码' : '这台路由器的托管服务停用了：请联系提供服务的人');
		if (m === 'svc_info') return R({ hosted: true, hub: 'https://hub.example', exp: Date.now() + 5 * 864e5, off: !!S.svc && !S.renewed, ed: S.ed });
		if (m === 'svc_renew') { if (body.params.code !== 'GOOD1234') return E(-32000, '续期码不对'); S.renewed = true; S.svc = null; return R({ exp: Date.now() + 30 * 864e5, days: 30 }); }
		if (m === 'cloud_info') return R({ enabled: true, url: 'https://abcdefgh.hub.example/cloud', pkey: 'k'.repeat(32), hosted: true, hub: 'https://hub.example' });
		if (m === 'edition_set') { S.job = { id: 'abcdefghjk', to: body.params.to, state: 'run', msg: '准备中', at: 1 }; return R({ ok: true, id: 'abcdefghjk', to: body.params.to, lan: LAN }); }
		if (m === 'edition_state') { if (S.down) { res.destroy(); return; } const n = S.seq.shift(); if (n) S.job = { ...S.job, ...n }; if (S.job && S.job.state === 'ok') S.ed = S.job.to; return R({ job: S.job, ed: S.ed }); }
		return res.end(JSON.stringify(require('./mock').reply(body.id, m, body.params || {})));
	}
	if (u.pathname.startsWith('/cloud/')) { S.cloud.push(u.pathname); res.writeHead(404); return res.end('{}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); };
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const noH = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const init = () => { localStorage.setItem('rp_dev', 'lan00001.' + 'v'.repeat(32)); localStorage.setItem('rp_host', '1'); localStorage.setItem('rp_hub', 'https://hub.example'); };
(async () => {
	const s1 = http.createServer(handler), s2 = http.createServer(handler);
	await new Promise((r) => s1.listen(9906, r)); await new Promise((r) => s2.listen(8198, r));
	// router.lan：不是本机地址，浏览器按不安全的 http 页面算（跟真的 http://192.168.x.x:906 一样）
	const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP router.lan 127.0.0.1'] });
	const L = 'http://router.lan:9906/panel/';
	const ctxOf = async (w, dark) => { const c = await browser.newContext({ viewport: { width: w, height: 760 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' }); await c.addInitScript(init); return c; };

	for (const dark of [false, true]) for (const w of [320, 390, 430]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S.ed = 'local'; S.svc = null; S.job = null; S.seq = []; S.down = false;
		const ctx = await ctxOf(w, dark), page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.goto(L + '?p=me'); await W(1800);
		const t = await page.textContent('#meBox');
		ok('我的主页：这台路由器显示「版本 本地版」和「换」' + T, /版本\s*本地版/.test(t) && await page.isVisible('#meBox [data-mp="edsw"]'), t.slice(0, 300));
		ok('不横向滚动' + T, await noH(page));
		if (w === 390) await page.screenshot({ path: path.join(__dirname, 'shots', `ed-me${dark ? '-dark' : ''}.png`) });
		await page.click('#meBox [data-mp="edsw"]'); await W(500);
		const sh = page.locator('.modal').last();
		ok('换版本：两个选项，现在的那个点不了' + T, /AI 版/.test(await sh.textContent()) && /本地版（现在）/.test(await sh.textContent()) && await sh.locator('[data-v="local"]').isDisabled() && !(await sh.locator('[data-v="ai"]').isDisabled()));
		const box = await sh.locator('.modalbox').boundingBox();
		ok('换版本的卡片在屏幕里' + T, box && box.x >= 0 && box.x + box.width <= w + 1);
		if (w === 390) await page.screenshot({ path: path.join(__dirname, 'shots', `ed-sheet${dark ? '-dark' : ''}.png`) });
		if (w !== 390) { await ctx.close(); continue; }
		await sh.locator('[data-v="ai"]').click(); await W(500);
		const cf = page.locator('.modal').last();
		ok('确认框说清楚后果：下载隧道程序、没装上自动退回' + T, /下载隧道程序/.test(await cf.textContent()) && /自动退回本地版/.test(await cf.textContent()));
		S.seq = [{ msg: '安装隧道程序' }, { msg: '连接隧道' }, { state: 'ok', msg: '在哪都能从官网「我的路由器」打开面板' }];
		await cf.locator('[data-v="true"]').click(); await W(900);
		ok('换的时候显示进度，按钮先不能点' + T, /正在换成 AI 版/.test(await page.locator('.modal').last().textContent()) && await page.locator('.modal [data-done]').isDisabled());
		await page.screenshot({ path: path.join(__dirname, 'shots', `ed-run${dark ? '-dark' : ''}.png`) });
		await W(6500);
		const done = await page.locator('.modal').last().textContent();
		ok('换好了：已换成 AI 版、说以后怎么打开' + T, /已换成 AI 版/.test(done) && /官网/.test(done) && !(await page.locator('.modal [data-done]').isDisabled()), done);
		ok('路由器那边收到 edition_set { to: ai }' + T, S.calls.some((c) => c.m === 'edition_set' && c.p.to === 'ai'));
		await page.locator('.modal [data-done]').click(); await W(1500);
		ok('换好后我的主页跟着变成 AI 版' + T, /版本\s*AI 版/.test(await page.textContent('#meBox')));
		// 失败：说在哪一步、已退回
		S.ed = 'local';
		await page.goto(L + '?p=me'); await W(1500);
		await page.click('#meBox [data-mp="edsw"]'); await W(400);
		await page.locator('.modal').last().locator('[data-v="ai"]').click(); await W(400);
		S.seq = [{ state: 'fail', step: 'tunnel', msg: '隧道 90 秒都没接上 Cloudflare，已退回本地版。' }];
		await page.locator('.modal').last().locator('[data-v="true"]').click(); await W(3500);
		const ft = await page.locator('.modal').last().textContent();
		ok('失败：标题「没换成 AI 版」、失败在「连接隧道」、已退回本地版' + T, /没换成 AI 版/.test(ft) && /连接隧道/.test(ft) && /已退回本地版/.test(ft), ft);
		await page.screenshot({ path: path.join(__dirname, 'shots', `ed-fail${dark ? '-dark' : ''}.png`) });
		// 在家里 http 地址打开：推送说清楚为什么用不了；云端状态读专属网址
		await page.goto(L + '?p=wd'); await W(2500);
		const pt = await page.textContent('#pushCard').catch(() => '');
		ok('http 地址打开：推送说清楚浏览器不让开、用微信推送' + T, /浏览器不让开推送通知/.test(pt) && /微信推送/.test(pt), pt.slice(0, 200));
		ok('http 地址打开：不去读面板自己网址下的 /cloud/（那里没有）' + T, !S.cloud.length, S.cloud.join());
		await ctx.close();
	}

	// 在外面（不是家里地址）换成本地版：隧道一停就连不上，直接说在家里怎么打开
	{
		S.ed = 'ai'; S.svc = null; S.job = null; S.seq = []; S.down = false;
		const ctx = await browser.newContext({ viewport: { width: 390, height: 760 } }); await ctx.addInitScript(init);
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误（外面）：' + e.message));
		await page.goto('http://localhost:8198/panel/?p=me'); await W(1800);
		await page.click('#meBox [data-mp="edsw"]'); await W(400);
		await page.locator('.modal').last().locator('[data-v="local"]').click(); await W(400);
		const cf = await page.locator('.modal').last().textContent();
		ok('换成本地版的确认框：说在外面打不开、家里怎么打开、会删隧道程序', /在外面打不开面板/.test(cf) && /192\.168\.6\.1:906/.test(cf) && /cloudflared/.test(cf), cf);
		S.down = true;
		await page.locator('.modal').last().locator('[data-v="true"]').click(); await W(6000);
		const dt = await page.locator('.modal').last().textContent();
		ok('在外面换成本地版：连不上了直接说「隧道已经停了」和家里的地址，能关掉', /隧道已经停了/.test(dt) && /192\.168\.6\.1:906/.test(dt) && !(await page.locator('.modal [data-done]').isDisabled()), dt);
		await page.screenshot({ path: path.join(__dirname, 'shots', 'ed-remote.png') });
		await ctx.close();
	}
	// 旧的托管纯面板版：提示一次
	{
		S.ed = 'noai'; S.down = false;
		const ctx = await browser.newContext({ viewport: { width: 390, height: 760 } }); await ctx.addInitScript(init);
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误（纯面板）：' + e.message));
		await page.goto('http://localhost:8198/panel/'); await W(3500);
		const ht = await page.locator('.modal.compact').last().textContent().catch(() => '');
		ok('纯面板版（旧）：更新后提示一次能换', /纯面板版可以换成 AI 版或本地版/.test(ht), ht);
		await page.screenshot({ path: path.join(__dirname, 'shots', 'ed-noai.png') });
		await page.locator('.modal.compact [data-v="go"]').click(); await W(500);
		ok('点「看看」：换版本里第一项是「打开 AI 功能」', /打开 AI 功能/.test(await page.locator('.modal').last().textContent()));
		await page.reload(); await W(3000);
		ok('提示只弹一次', !(await page.locator('.modal.compact').count()));
		await ctx.close();
	}
	// 托管服务到期
	for (const w of [320, 390]) {
		S.ed = 'local'; S.svc = 'exp'; S.renewed = false;
		const ctx = await ctxOf(w, false), page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误（到期）：' + e.message));
		await page.goto(L); await W(2500);
		const m = page.locator('.modal.compact').last(), mt = await m.textContent().catch(() => '');
		ok(`到期：弹卡片说托管服务到期了，能输续期码、去官网续期（${w}）`, /托管服务到期了/.test(mt) && await m.locator('[data-code]').isVisible() && await m.locator('a[href="https://hub.example/app"]').isVisible(), mt);
		const bb = await m.locator('.modalbox').boundingBox();
		ok(`到期卡片不超过屏幕 70% 高（${w}）`, bb && bb.height <= 760 * 0.7 + 1 && bb.x >= 0 && bb.x + bb.width <= w + 1);
		ok(`到期：只弹一张（${w}）`, (await page.locator('.modal.compact').count()) === 1);
		await page.screenshot({ path: path.join(__dirname, 'shots', `ed-svcoff-${w}.png`) });
		if (w === 390) {
			await m.locator('[data-code]').fill('BAD'); await m.locator('[data-renew]').click(); await W(800);
			ok('续期码不对：卡片里说清楚', /续期码不对/.test(await m.textContent()));
			await m.locator('[data-code]').fill('GOOD1234'); await m.locator('[data-renew]').click(); await W(2500);
			ok('续期码对了：恢复正常（不再弹）', !(await page.locator('.modal.compact').count()) && S.calls.some((c) => c.m === 'svc_renew' && c.p.code === 'GOOD1234'));
		}
		await ctx.close();
	}
	await browser.close(); s1.close(); s2.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

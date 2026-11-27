// 6.0 第 11 项：Claude 想做危险操作 → 面板弹出「允许 / 拒绝」；「AI 连接器地址」里选 AI 能做什么（只读 / 危险操作要确认 / 完全放开）
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const now = () => Math.floor(Date.now() / 1000);
const S = { mode: 'ask', list: [], calls: [], role: 'owner', perms: [], allows: [] };
const fresh = () => { const t = now(); S.list = [
	{ id: 'aaaaaaaaa1', title: '执行命令', detail: 'opkg update && opkg install luci-app-ttyd && /etc/init.d/ttyd restart && echo "装好了，这是一串很长的命令，用来看看窄屏上会不会撑破弹窗：/usr/lib/lua/luci/controller/very/long/path/name.lua"', at: t - 5, exp: t + 295, st: 'wait' },
	{ id: 'aaaaaaaaa2', title: '重启路由器', detail: '整个网络会断 1–3 分钟', at: t - 2, exp: t + 298, st: 'wait', pt: '重启路由器' }]; };
function handle(m, p) {
	S.calls.push({ m, p });
	if (m === 'whoami') return { ...mock.respond('whoami', p), ai: true, role: S.role, perms: S.perms };
	if (m === 'ai_asks') { if (S.role === 'sub' && !S.perms.includes('net')) throw Object.assign(new Error('主账号没有给你开「完全控制」权限'), { code: -32012 }); return { ai: true, mode: S.mode, list: S.list }; }
	if (m === 'sudo_local') return { sudo: 't'.repeat(24), exp: Date.now() + 600e3 };
	if (m === 'ai_answer') { if (p.ok && p.all && !p.sudo) throw new Error('要先确认是你本人：在「我的主页 → 敏感信息」里验证'); const x = S.list.find((y) => y.id === p.id); if (!x || x.st !== 'wait') throw new Error('这个请求已经处理过了'); x.st = p.ok ? 'ok' : 'no'; if (p.ok && p.always && x.pt) S.allows.push({ k: 'k' + x.id, t: x.pt, at: now(), by: '我的手机' }); return { ok: true, st: x.st, always: !!(p.ok && p.always && x.pt), all: !!(p.ok && p.all && S.role === 'owner') }; }
	if (m === 'ckey_info') { if (!p.sudo) throw new Error('要先确认是你本人'); return { ai: true, url: 'https://r.example/cgi-bin/mcp/' + 'c'.repeat(40), hosted: false, mode: S.mode, allows: S.allows, asks: [{ id: 'x1', title: '重启路由器', at: now() - 3600, st: 'no' }, { id: 'x2', title: '修改路由器设置', at: now() - 600, st: 'done' }, { id: 'x3', title: '执行命令', at: now() - 60, st: 'exp' }] }; }
	if (m === 'ai_allow_del') { if (!p.sudo) throw new Error('要先确认是你本人'); S.allows = S.allows.filter((y) => y.k !== p.k); return { ok: true, allows: S.allows }; }
	if (m === 'ai_mode') { if (!p.sudo) throw new Error('要先确认是你本人'); S.mode = p.mode; return { ok: true, mode: p.mode }; }
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); try { return J({ jsonrpc: '2.0', id: body.id, result: handle(body.method.replace(/^panel\//, ''), body.params || {}) }); } catch (e) { return J({ jsonrpc: '2.0', id: body.id, error: { code: e.code || -32000, message: e.message } }); } }
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = path.join(__dirname, 'shots');
(async () => {
	await new Promise((r) => server.listen(8097, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of (process.env.ONE ? [[390, 844, true]] : [[320, 568, false], [390, 844, true], [430, 932, false], [1280, 800, true]])) {
		const T = `［${w}${dark ? ' 深色' : ''}］`;
		S.mode = 'ask'; S.role = 'owner'; S.perms = []; fresh(); S.calls = [];
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_ai', '1'); if (!sessionStorage.getItem('rp_sudo')) sessionStorage.setItem('rp_sudo', JSON.stringify({ tok: 's'.repeat(24), exp: Date.now() + 600e3, kind: 'local' })); });
		// 推送里点进来：?ask=ai
		await page.goto('http://localhost:8097/panel/?p=home&ask=ai'); await W(2600);
		const box = async () => (await page.locator('.modal .aiask').count()) ? page.textContent('.modal:has(.aiask) .modalbox') : '';
		let t = await box();
		ok('推送点进来：马上弹出 AI 的请求，写着想做什么、具体内容、多久后过期' + T, /AI 想要：执行命令/.test(t) && /opkg install luci-app-ttyd/.test(t) && /后过期/.test(t) && /后面还有 1 个/.test(t), t.slice(0, 120));
		ok('说清楚不是自己让做的怎么办' + T, /点「拒绝」/.test(t) && /换一下 AI 连接器地址/.test(t));
		ok('点外面关不掉（必须选允许或拒绝）' + T, await (async () => { await page.mouse.click(5, 5); await W(400); return (await page.locator('.modal .aiask').count()) === 1; })());
		const ov = await page.evaluate(() => { const W = document.documentElement.clientWidth, b = document.querySelector('.modal .modalbox').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, W, l: b.left, r: b.right }; });
		ok('弹窗不超出屏幕、不横向滚动' + T, ov.sw <= ov.W && ov.l >= 0 && ov.r <= ov.W + 0.5, JSON.stringify(ov));
		await page.screenshot({ path: path.join(SHOT, `aiask-${w}${dark ? '-dark' : ''}.png`) });
		ok('没有分类的请求：不显示「这一类都允许」，主账号有「全部都允许」（第一个）' + T, (await page.locator('.modal [data-ans="always"]').count()) === 0 && (await page.locator('.modal [data-ans="all"]').count()) === 1);
		await page.click('.modal [data-ans="ok"]'); await W(1600);
		ok('点「允许」：告诉路由器允许了这一个' + T, S.list[0].st === 'ok' && S.calls.some((c) => c.m === 'ai_answer' && c.p.id === 'aaaaaaaaa1' && c.p.ok === true));
		t = await box();
		ok('有分类的才显示「这一类都允许」（第二个有）' + T, (await page.locator('.modal [data-ans="always"]').count()) === 1);
		ok('接着弹出下一个（重启路由器，写着会断网多久）' + T, /AI 想要：重启路由器/.test(t) && /1–3 分钟/.test(t) && !/后面还有/.test(t), t.slice(0, 80));
		await page.click('.modal [data-ans="no"]'); await W(1400);
		ok('点「拒绝」：告诉路由器拒绝了，弹窗关掉' + T, S.list[1].st === 'no' && (await page.locator('.modal .aiask').count()) === 0);
		// 开着面板时有新请求：每 8 秒查一次
		const t0 = now(); S.list.push({ id: 'aaaaaaaaa3', title: '修改路由器设置', detail: 'set wireless.default_radio0.ssid=MyWiFi\nset wireless.default_radio0.key=******', at: t0, exp: t0 + 300, st: 'wait', pt: '修改设置 wireless' });
		await W(9000);
		t = await box();
		ok('开着面板时来了新请求：8 秒左右自己弹出来，不用刷新；密码打码' + T, /修改路由器设置/.test(t) && /key=\*\*\*\*\*\*/.test(t), t.slice(0, 80));
		// 永久允许（用户 11/27）：收在「允许」右边的小箭头里；点箭头才展开「这一类都允许」「全部都允许」，展开的那行跟上面隔开、不叠
		const cl = await page.evaluate(() => { const o = document.querySelector('.modal .aiopts'), a = document.querySelector('.modal [data-aimore]'), ok = document.querySelector('.modal [data-ans="ok"]').getBoundingClientRect(), ar = a.getBoundingClientRect(); return { hid: o.hidden && o.getBoundingClientRect().height === 0, right: ar.left >= ok.right - 1 && Math.abs(ar.top - ok.top) < 2 && Math.abs(ar.height - ok.height) < 2, w: Math.round(ar.width) }; });
		ok('收起：只有「拒绝 / 允许」，允许右边一个小箭头，一样高' + T, cl.hid && cl.right && cl.w <= 48, JSON.stringify(cl));
		await page.screenshot({ path: path.join(SHOT, `aiask-fold-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-aimore]'); await W(400);
		const ab = await page.evaluate(() => { const b = document.querySelector('.modal [data-ans="always"]'), a = document.querySelector('.modal [data-ans="all"]'); if (!b || !a) return null; const r = b.getBoundingClientRect(), ra = a.getBoundingClientRect(), y = document.querySelector('.modal [data-ans="no"]').getBoundingClientRect(); return { t: b.textContent, a: a.textContent, ex: document.querySelector('.modal [data-aimore]').getAttribute('aria-expanded'), gap: Math.round(r.top - y.bottom), row: Math.abs(ra.top - r.top) < 2, inView: r.bottom <= innerHeight && r.left >= 0 && ra.right <= innerWidth, oneLine: r.height < 60 && ra.height < 60 }; });
		ok('点小箭头：在下面展开「这一类都允许」「全部都允许」，并排，跟上面隔开 8px 以上，不出屏幕不折行' + T, ab && ab.t === '这一类都允许' && ab.a === '全部都允许' && ab.ex === 'true' && ab.gap >= 8 && ab.row && ab.inView && ab.oneLine, JSON.stringify(ab));
		await page.screenshot({ path: path.join(SHOT, `aiask-open-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-ans="always"]'); await W(1400);
		ok('点「这一类都允许」：告诉路由器允许并且以后这一类不问，提示以后什么不问' + T, S.calls.some((c) => c.m === 'ai_answer' && c.p.id === 'aaaaaaaaa3' && c.p.ok === true && c.p.always === true) && /以后修改设置 wireless不再问/.test(await page.textContent('#toast')), await page.textContent('#toast'));
		// 用户 11/27：App 切回来要刷新才弹出——窗口拿回焦点时马上查（不等 8 秒）
		await W(3500);
		{
			const t1 = now(); S.list.push({ id: 'aaaaaaaaa4', title: '执行命令', detail: 'echo hi', at: t1, exp: t1 + 300, st: 'wait' });
			const c0 = S.calls.filter((c) => c.m === 'ai_asks').length;
			await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await W(1500);
			const tt = await box();
			ok('窗口拿回焦点（App 切回来）：一两秒内就弹出来' + T, /echo hi/.test(tt) && S.calls.filter((c) => c.m === 'ai_asks').length > c0, tt.slice(0, 60));
			// 全部都允许：先确认（说清楚后果），取消就不动；确定才发
			await page.click('.modal [data-aimore]'); await W(300);
			await page.click('.modal [data-ans="all"]'); await W(600);
			const cf = await page.locator('.modal').last().textContent();
			const lay = await page.evaluate(() => { const ms = [...document.querySelectorAll('.modal')], top = ms[ms.length - 1], box = top.querySelector('.modalbox').getBoundingClientRect(), H = innerHeight, W = innerWidth; const under = ms[0].querySelector('.modalbox').getBoundingClientRect(); return { n: ms.length, compact: top.classList.contains('compact'), mid: Math.abs((box.top + box.bottom) / 2 - H / 2) < 40, inView: box.top >= 0 && box.bottom <= H && box.left >= 0 && box.right <= W, spin: !!document.querySelector('.modal .aiask [data-ans="all"] .spin'), dim: getComputedStyle(top).backgroundColor }; });
			const hid = await page.evaluate(() => getComputedStyle(document.querySelector('.modal .aiask').closest('.modalbox')).visibility);
			ok('「全部都允许」的确认：居中小卡片，下面那张卡先藏起来（屏幕上只有一张），按钮不提前转圈' + T, lay.n === 2 && lay.compact && lay.mid && lay.inView && !lay.spin && hid === 'hidden', JSON.stringify(lay) + hid);
			ok('点「全部都允许」：先问，写清楚以后什么都不问、拿到地址的人也一样' + T, /全部允许 AI 的操作/.test(cf) && /重启路由器/.test(cf) && /拿到连接器地址的人也一样/.test(cf), cf.slice(0, 120));
			await page.screenshot({ path: path.join(SHOT, `aiask-all-${w}${dark ? '-dark' : ''}.png`) });
			await page.locator('.modal').last().locator('[data-v="false"]').click(); await W(500);
			ok('取消：没发出去，确认卡还在、重新显示出来' + T, !S.calls.some((c) => c.m === 'ai_answer' && c.p.all) && (await page.locator('.modal .aiask').count()) === 1 && (await page.isVisible('.modal .aiask')));
			if (!(await page.isVisible('.modal [data-ans="all"]'))) { await page.click('.modal [data-aimore]'); await W(300); }
			await page.click('.modal [data-ans="all"]'); await W(600);
			await page.locator('.modal').last().locator('[data-v="true"]').click(); await W(1400);
			ok('确定：告诉路由器允许并全部放开（带着确认本人的凭证），提示以后不再问' + T, S.calls.some((c) => c.m === 'ai_answer' && c.p.id === 'aaaaaaaaa4' && c.p.ok && c.p.all === true && c.p.sudo) && /已全部允许/.test(await page.textContent('#toast')), await page.textContent('#toast'));
		}
		// 全部都允许要先确认本人（11/27 全面检查第 11 条）：没验证的带去「我的主页」验证，请求还在，验证好了马上再弹出来、直接展开
		if (w === 390) {
			const c2 = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
			const p2 = await c2.newPage();
			p2.on('pageerror', (e) => problems.push('页面错误' + T + '（没验证）：' + e.message));
			await p2.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_ai', '1'); });
			const t2 = now(); S.list.push({ id: 'aaaaaaaaa5', title: '重启路由器', detail: '', at: t2, exp: t2 + 300, st: 'wait' });
			await p2.goto('http://localhost:8097/panel/?p=home&ask=ai'); await W(2600);
			await p2.click('.modal [data-aimore]'); await W(300);
			await p2.click('.modal [data-ans="all"]'); await W(1200);
			const st = await p2.evaluate(() => ({ modal: document.querySelectorAll('.modal').length, me: !document.getElementById('p-me').classList.contains('hidden') && getComputedStyle(document.getElementById('p-me')).display !== 'none', toast: document.getElementById('toast').textContent }));
			await p2.screenshot({ path: path.join(SHOT, `aiask-verify-me-${w}${dark ? '-dark' : ''}.png`) });
			ok('没验证本人点「全部都允许」：不弹确认、不发出去，卡片收起，带去「我的主页」验证' + T, st.modal === 0 && st.me && /验证是你本人/.test(st.toast) && !S.calls.some((c) => c.m === 'ai_answer' && c.p.id === 'aaaaaaaaa5'), JSON.stringify(st));
			await p2.evaluate(() => window.dispatchEvent(new Event('focus'))); await W(2500);
			ok('在「我的主页」还没验证：这个请求先不弹出来挡着' + T, (await p2.locator('.modal .aiask').count()) === 0 && S.list.find((x) => x.id === 'aaaaaaaaa5').st === 'wait');
			const pw = p2.locator('#meBox [data-pw]');
			if (await pw.count()) {
				await pw.fill('rootpw'); await p2.click('#meBox [data-pwok]'); await W(2600);
				const ex = await p2.evaluate(() => { const b = document.querySelector('.modal [data-aimore]'), o = document.querySelector('.modal .aiopts'); return { card: !!document.querySelector('.modal .aiask'), t: (document.querySelector('.modal .aiask h3') || {}).textContent, ex: b && b.getAttribute('aria-expanded'), vis: o && !o.hidden }; });
				await p2.screenshot({ path: path.join(SHOT, `aiask-verify-back-${w}${dark ? '-dark' : ''}.png`) });
				ok('验证好了：马上再弹出这个请求，「全部都允许」已经展开' + T, ex.card && /重启路由器/.test(ex.t) && ex.ex === 'true' && ex.vis, JSON.stringify(ex));
				await p2.click('.modal [data-ans="all"]'); await W(600);
				await p2.locator('.modal').last().locator('[data-v="true"]').click(); await W(1400);
				ok('再点「全部都允许」：带着凭证发出去，全部放开' + T, S.calls.some((c) => c.m === 'ai_answer' && c.p.id === 'aaaaaaaaa5' && c.p.all === true && c.p.sudo === 't'.repeat(24)) && /已全部允许/.test(await p2.textContent('#toast')));
			} else ok('「我的主页」里有输后台密码验证的地方' + T, false, await p2.textContent('#meBox'));
			await c2.close();
		}
		// AI 连接器地址：选档位
		await page.goto('http://localhost:8097/panel/?p=me'); await W(2200);
		await page.click('#meBox [data-mp="kckey"]'); await W(1200);
		t = await page.textContent('.modal');
		ok('「AI 连接器地址」里有「AI 能做什么」三档，现在是「危险操作要确认」（推荐）' + T, /AI 能做什么/.test(t) && /只读/.test(t) && /完全放开/.test(t) && (await page.getAttribute('.modal [data-aim="ask"]', 'aria-pressed')) === 'true' && /推荐/.test(t));
		ok('「这一类都允许」列表：写着允许了哪一类、谁点的' + T, /这一类都允许/.test(t) && /修改设置 wireless/.test(t) && /我的手机/.test(t), t.slice(0, 300));
		ok('最近的请求：已拒绝、已执行、过期了，时间写对' + T, /已拒绝/.test(t) && /已执行/.test(t) && /过期了/.test(t) && /1 小时前/.test(t) && !/天前/.test(t), t);
		const ov2 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, W: document.documentElement.clientWidth, bad: [...document.querySelectorAll('.modal .aimode, .modal .ailog .kv')].filter((e) => e.scrollWidth > e.clientWidth + 1).length }));
		ok('档位和请求列表不超出、不截断' + T, ov2.sw <= ov2.W && !ov2.bad, JSON.stringify(ov2));
		await page.screenshot({ path: path.join(SHOT, `aimode-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		await page.click('.modal [data-aidel]'); await W(1000);
		ok('点「收回」：带着确认本人的凭证去收回，列表里没了' + T, S.calls.some((c) => c.m === 'ai_allow_del' && c.p.sudo && c.p.k === 'kaaaaaaaaa3') && !/修改设置 wireless/.test(await page.textContent('.modal [data-aiallow]')));
		await page.click('.modal [data-aim="ro"]'); await W(1000);
		ok('点「只读」：改了（带着确认本人的凭证），按钮跟着变' + T, S.mode === 'ro' && S.calls.some((c) => c.m === 'ai_mode' && c.p.mode === 'ro' && c.p.sudo) && (await page.getAttribute('.modal [data-aim="ro"]', 'aria-pressed')) === 'true');
		await page.click('.modal [data-aim="full"]'); await W(600);
		ok('点「完全放开」：先确认（说清楚风险）' + T, /完全放开/.test(await page.locator('.modal').last().textContent()) && /拿到连接器地址的人也一样/.test(await page.locator('.modal').last().textContent()) && S.mode === 'ro');
		await page.locator('.modal').last().locator('[data-v="false"]').click(); await W(500);
		ok('取消：还是只读' + T, S.mode === 'ro');
		await ctx.close();
		// 家人没有「完全控制」：不查、不弹
		S.role = 'sub'; S.perms = ['msg', 'node']; fresh(); S.calls = [];
		const c2 = await browser.newContext({ viewport: { width: w, height: h } }); const p2 = await c2.newPage();
		p2.on('pageerror', (e) => problems.push('页面错误2' + T + '：' + e.message));
		await p2.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_ai', '1'); localStorage.setItem('rp_role', JSON.stringify({ role: 'sub', perms: ['msg', 'node'] })); });
		await p2.goto('http://localhost:8097/panel/?p=home&ask=ai'); await W(3000);
		ok('家人没有「完全控制」：不弹 Claude 的请求，也不去问' + T, (await p2.locator('.modal .aiask').count()) === 0 && !S.calls.some((c) => c.m === 'ai_asks'));
		await c2.close();
		// 家人有「完全控制」：能允许、能「这一类都允许」，没有「全部都允许」（那等于改成完全放开，只有主账号能点）
		S.role = 'sub'; S.perms = ['net']; S.mode = 'ask'; fresh(); S.calls = [];
		const c3 = await browser.newContext({ viewport: { width: w, height: h } }); const p3 = await c3.newPage();
		p3.on('pageerror', (e) => problems.push('页面错误3' + T + '：' + e.message));
		await p3.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_ai', '1'); localStorage.setItem('rp_role', JSON.stringify({ role: 'sub', perms: ['net'] })); });
		await p3.goto('http://localhost:8097/panel/?p=home&ask=ai'); await W(3000);
		await p3.click('.modal [data-ans="no"]'); await W(1400);
		ok('家人有「完全控制」：有「这一类都允许」，没有「全部都允许」' + T, (await p3.locator('.modal [data-ans="always"]').count()) === 1 && (await p3.locator('.modal [data-ans="all"]').count()) === 0);
		await c3.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

// 6.0 第 31、35 项（面板）：特色功能里「定时」——定时重启、定时关 Wi-Fi（打开时弹设置：星期、时间），关掉；子账号只读；系统操作里「关机」先确认、写清要拔插电源
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const D0 = () => ({ reboot: { on: false, days: [0, 1, 2, 3, 4, 5, 6], at: '04:00' }, wifi: { on: false, days: [0, 1, 2, 3, 4, 5, 6], off: '23:30', on_at: '07:00' }, sta: false, owner: true });
const S = { calls: [], d: D0() };
function handle(m, p) {
	S.calls.push({ m, p });
	if (m === 'sched_get') return S.d;
	if (m === 'sched_set') { for (const k of ['reboot', 'wifi']) if (p[k]) S.d[k] = { ...S.d[k], ...p[k] }; return S.d; }
	if (m === 'poweroff') return { ok: true };
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); try { return J({ jsonrpc: '2.0', id: body.id, result: handle(body.method.replace(/^panel\//, ''), body.params || {}) }); } catch (e) { return J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8180, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S.calls = []; S.d = D0();
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8180/panel/?p=auto'); await W(1800);
		ok('特色功能里有「定时」：定时重启、定时关 Wi-Fi，都关着' + T, (await page.locator('#scBox .schrow').count()) === 2 && !(await page.isChecked('[data-sch-on="reboot"]')) && /关着/.test(await page.textContent('#scBox')));
		ok('不横向滚动' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await page.locator('#scBox').screenshot({ path: path.join(SHOT, `sched-${w}${dark ? '-dark' : ''}.png`) });
		// 打开定时重启：弹设置
		await page.locator('[data-sch-on="reboot"]').evaluate((e) => e.click()); await W(500);
		let m = page.locator('.modal').last();
		ok('打开定时重启：弹设置（星期一行放下、时间）' + T, /定时重启/.test(await m.textContent()) && (await m.locator('[data-d].on').count()) === 7 && await m.evaluate((e) => { const b = e.querySelector('.ofdays'), r = b.getBoundingClientRect(); return [...b.children].every((c) => c.getBoundingClientRect().top - r.top < 6); }));
		await m.locator('[data-d="0"]').click(); await m.locator('[data-d="6"]').click();
		await m.locator('[data-t="at"]').fill('04:30');
		await page.screenshot({ path: path.join(SHOT, `sched-set-${w}${dark ? '-dark' : ''}.png`) });
		await m.locator('[data-v="save"]').click(); await W(700);
		const s1 = S.calls.filter((c) => c.m === 'sched_set').pop();
		ok('保存：周一到周五 04:30' + T, s1 && s1.p.reboot.on && JSON.stringify(s1.p.reboot.days.sort()) === '[1,2,3,4,5]' && s1.p.reboot.at === '04:30' && /周一到周五 04:30/.test(await page.textContent('#scBox')) && /已开启定时重启/.test(await page.textContent('#toast')));
		// 定时关 Wi-Fi：取消就不开
		await page.locator('[data-sch-on="wifi"]').evaluate((e) => e.click()); await W(500);
		m = page.locator('.modal').last();
		ok('定时关 Wi-Fi：关、开两个时间，写后果' + T, (await m.locator('[data-t="off"]').count()) === 1 && (await m.locator('[data-t="on_at"]').count()) === 1 && /都会断开/.test(await m.textContent()));
		await m.locator('[data-v="close"]').click(); await W(500);
		ok('取消：开关回到关着' + T, !(await page.isChecked('[data-sch-on="wifi"]')));
		// 关掉定时重启
		await page.locator('[data-sch-on="reboot"]').evaluate((e) => e.click()); await W(600);
		ok('关掉定时重启' + T, S.calls.filter((c) => c.m === 'sched_set').pop().p.reboot.on === false && /已关掉定时重启/.test(await page.textContent('#toast')));
		// 关机
		await page.goto('http://localhost:8180/panel/?p=more'); await W(1500);
		ok('系统操作：「重启路由器」旁边有「关机」' + T, await page.isVisible('#pwOff'));
		await page.click('#pwOff'); await W(400);
		m = page.locator('.modal').last();
		ok('关机先确认：写清要拔插电源才能开' + T, /关机/.test(await m.textContent()) && /拔插电源才能开/.test(await m.textContent()));
		await m.locator('[data-v="true"]').click(); await W(600);
		ok('确认后关机' + T, S.calls.some((c) => c.m === 'poweroff' && c.p.confirm === 'OFF') && /正在关机/.test(await page.textContent('#toast')));
		await ctx.close();
	}
	{
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		S.d = { ...D0(), owner: false, wifi: { ...D0().wifi, on: true }, sta: true };
		await page.goto('http://localhost:8180/panel/?p=auto'); await W(1600);
		ok('子账号：只能看，没有开关和设置', (await page.locator('[data-sch-on]').count()) === 0 && /只有主账号能设/.test(await page.textContent('#scBox')) && /开着/.test(await page.textContent('#scBox')));
		ok('在用无线中继：提示到点不会关', /在用无线中继上网，到点不会关/.test(await page.textContent('#scBox')));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

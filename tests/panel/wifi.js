// 6.0 第 14 项：Wi-Fi 设置页——改名字、密码（显示、强度、太弱的不让存）、开关、隐藏、信道；两个频段用同一个名字；
// 保存后倒数确认（保留 / 改回去 / 不点自动改回 / 手机断开重新打开面板接着问 / 连不上路由器时卡片留着）
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WIFI } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}');
			return J(require('./mock').reply(body.id, body.method.replace(/^panel\//, ''), body.params || {}));
		}
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		let p = u.pathname.replace(/^\/panel\//, '') || 'index.html';
		const f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
		res.end(fs.readFileSync(f));
	});
});
(async () => {
	await new Promise((r) => server.listen(8098, r));
	const browser = await chromium.launch();
	for (const [w, h, tag, dark] of [[390, 844, '手机', false], [320, 640, '小屏', true], [430, 932, '大屏', false]]) {
		WIFI.reset(); WIFI.wait = 0;
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push(`[${tag}] 页面错误：` + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8098/panel/?p=wifi'); await page.waitForTimeout(2200);
		const C = (id) => page.locator(`.wfc[data-r="${id}"]`), F = (id, k) => C(id).locator(`[data-wf="${k}"]`);
		const toastT = async () => (await page.textContent('#toast')) || '';
		ok(`[${tag}] 两个频段各一张卡片，显示名字`, (await page.locator('.wfc').count()) === 2 && (await F('radio0', 'ssid').inputValue()) === 'Home' && (await F('radio1', 'ssid').inputValue()) === 'Home-5G');
		ok(`[${tag}] 顶上显示开着几个、卡片上显示信道`, /开着 2 个/.test(await page.textContent('#wfPill')) && /信道 6/.test(await C('radio0').textContent()) && /信道自动/.test(await C('radio1').textContent()));
		ok(`[${tag}] 没改的时候不显示保存条`, await page.locator('#wfBar').isHidden());
		ok(`[${tag}] 打开页面不拿密码`, !(await page.content()).includes('Home-Pass-2024!') && !WIFI.calls.some((c) => c[0] === 'key'));
		ok(`[${tag}] 侧边栏「网络」里有 Wi-Fi`, (await page.locator('#nav [data-p="wifi"], .nav [data-p="wifi"], [data-page="wifi"]').count()) > 0 || /Wi-Fi/.test(await page.locator('nav, #nav, .side').first().textContent().catch(() => '')));
		const noScroll = async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
		ok(`[${tag}] 不横向滚动`, await noScroll());
		await page.screenshot({ path: path.join(SHOT, `wifi-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		// 显示密码
		await F('radio0', 'eye').click(); await page.waitForTimeout(500);
		ok(`[${tag}] 点「显示」：单独拿密码，显示出来`, (await F('radio0', 'key').inputValue()) === 'Home-Pass-2024!' && (await F('radio0', 'key').getAttribute('type')) === 'text' && (await F('radio0', 'eye').textContent()) === '隐藏' && WIFI.calls.some((c) => c[0] === 'key' && c[1] === 'radio0'));
		ok(`[${tag}] 只是显示出来不算改了`, await page.locator('#wfBar').isHidden());
		// 太弱的密码
		await F('radio0', 'key').fill('12345678'); await page.waitForTimeout(200);
		ok(`[${tag}] 太弱的密码当场标出来`, /太容易被猜到/.test(await C('radio0').locator('[data-st]').textContent()));
		await page.click('#wfSave'); await page.waitForTimeout(400);
		ok(`[${tag}] 太弱的不让存`, /密码太容易被猜到/.test(await toastT()) && !WIFI.sets.length && !(await page.locator('.modal').count()));
		await F('radio0', 'key').fill('Home-Pass-2024!'); await page.waitForTimeout(200);
		ok(`[${tag}] 改回原来的密码：不算改了`, await page.locator('#wfBar').isHidden());
		// 名字太长
		await F('radio1', 'ssid').fill('一二三四五六七八九十一'); await page.waitForTimeout(200);
		ok(`[${tag}] 名字太长当场标出来`, /太长了/.test(await C('radio1').textContent()));
		await F('radio1', 'ssid').fill('临时'); await page.waitForTimeout(200);
		await page.click('#wfUndo'); await page.waitForTimeout(300);
		ok(`[${tag}] 点「撤销」：改回现在的设置，保存条收起`, (await F('radio1', 'ssid').inputValue()) === 'Home-5G' && await page.locator('#wfBar').isHidden());
		// 改 5G 名字和密码、2.4G 信道
		await F('radio1', 'ssid').fill('客厅');
		await F('radio1', 'key').fill('Better-Pass-77'); await page.waitForTimeout(200);
		ok(`[${tag}] 新密码显示强度`, /强度：强/.test(await C('radio1').locator('[data-st]').textContent()), await C('radio1').locator('[data-st]').textContent());
		await F('radio0', 'channel').selectOption('11'); await page.waitForTimeout(200);
		ok(`[${tag}] 保存条显示改了几项，在底栏上面不被挡住`, /3 项修改/.test(await page.textContent('#wfN')) && await (async () => { const a = await page.locator('#wfBar').boundingBox(), d = await page.locator('.dock').boundingBox(); return a && (!d || a.y + a.height <= d.y + 1); })(), await page.textContent('#wfN'));
		await page.screenshot({ path: path.join(SHOT, `wifi-edit-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('#wfSave'); await page.waitForTimeout(500);
		const cf = page.locator('.modal').last();
		const cft = await cf.textContent();
		ok(`[${tag}] 保存前说清楚：会断开、要用新名字和新密码重连、90 秒内要点保留`, /会断开/.test(cft) && /新名字和新密码/.test(cft) && /90 秒/.test(cft), cft);
		await page.screenshot({ path: path.join(SHOT, `wifi-confirm-${w}${dark ? '-dark' : ''}.png`) });
		await cf.locator('[data-v="true"]').click(); await page.waitForTimeout(900);
		const s1 = WIFI.sets[0]?.radios || [];
		ok(`[${tag}] 只发改了的`, s1.length === 2 && s1.find((q) => q.id === 'radio0')?.channel === 11 && Object.keys(s1.find((q) => q.id === 'radio0')).length === 2 && s1.find((q) => q.id === 'radio1')?.ssid === '客厅' && s1.find((q) => q.id === 'radio1')?.key === 'Better-Pass-77', JSON.stringify(s1));
		const ng = page.locator('.modal[data-ng]');
		ok(`[${tag}] 弹出倒数卡片：还剩多少秒、先连上「客厅」`, (await ng.count()) === 1 && +(await ng.locator('[data-n]').textContent()) >= 88 && /先连上「客厅」/.test(await ng.textContent()));
		const bx = await ng.locator('.modalbox').boundingBox();
		ok(`[${tag}] 卡片不占满屏幕（不超过 70%）`, bx && bx.height <= h * 0.7 && bx.width < w, JSON.stringify(bx));
		await page.screenshot({ path: path.join(SHOT, `wifi-keep-${w}${dark ? '-dark' : ''}.png`) });
		await page.mouse.click(5, 5); await page.waitForTimeout(400);
		ok(`[${tag}] 点卡片外面不会关掉`, (await ng.count()) === 1);
		// 重新打开面板（手机断开又连上）：接着问
		await page.reload(); await page.waitForTimeout(2500);
		ok(`[${tag}] 重新打开面板：倒数卡片还在`, (await page.locator('.modal[data-ng]').count()) === 1 && +(await page.locator('.modal[data-ng] [data-n]').textContent()) > 80);
		// 连不上路由器
		await page.route('**/cgi-bin/mcp/**', (r) => r.abort());
		await page.locator('.modal[data-ng] [data-keep]').click(); await page.waitForTimeout(1500);
		ok(`[${tag}] 连不上路由器：提示先连上新 Wi-Fi，卡片留着`, /连不上路由器：先连上「客厅」再点/.test(await toastT()) && (await page.locator('.modal[data-ng]').count()) === 1, await toastT());
		await page.unroute('**/cgi-bin/mcp/**');
		await page.locator('.modal[data-ng] [data-keep]').click(); await page.waitForTimeout(1200);
		ok(`[${tag}] 点「保留」：新设置留下`, WIFI.calls.some((c) => c[0] === 'net_confirm') && !WIFI.pend && /已保留新的 Wi-Fi 设置/.test(await toastT()) && !(await page.locator('.modal[data-ng]').count()));
		ok(`[${tag}] 保留后不再记着`, !(await page.evaluate(() => localStorage.getItem('rp_ng'))));
		await page.waitForTimeout(800);
		ok(`[${tag}] 页面刷新成新的名字`, (await F('radio1', 'ssid').inputValue()) === '客厅');
		// 用同一个名字
		await page.locator('[data-wf="same"]').check({ force: true }); await page.waitForTimeout(600);
		ok(`[${tag}] 打开「用同一个名字」：5G 卡片只剩开关和信道`, /同 2\.4G/.test(await C('radio1').textContent()) && (await F('radio1', 'ssid').count()) === 0 && (await F('radio1', 'channel').count()) === 1);
		ok(`[${tag}] 打开后就算改了（5G 要换成 2.4G 的名字和密码）`, (await page.locator('#wfBar').isVisible()) && /2 项修改/.test(await page.textContent('#wfN')), await page.textContent('#wfN'));
		await page.screenshot({ path: path.join(SHOT, `wifi-same-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		await F('radio0', 'ssid').fill('我家');
		await page.click('#wfSave'); await page.waitForTimeout(400);
		await page.locator('.modal').last().locator('[data-v="true"]').click(); await page.waitForTimeout(900);
		const s2 = WIFI.sets[1]?.radios || [];
		ok(`[${tag}] 两个频段一起改成同一个名字，5G 用 2.4G 的密码`, s2.find((q) => q.id === 'radio0')?.ssid === '我家' && s2.find((q) => q.id === 'radio1')?.ssid === '我家' && s2.find((q) => q.id === 'radio1')?.key === 'Home-Pass-2024!' && !('key' in s2.find((q) => q.id === 'radio0')), JSON.stringify(s2));
		await page.locator('.modal[data-ng] [data-back]').click(); await page.waitForTimeout(1000);
		ok(`[${tag}] 点「改回去」`, WIFI.calls.some((c) => c[0] === 'net_revert') && /正在改回原来的设置/.test(await toastT()) && !(await page.locator('.modal[data-ng]').count()));
		// 关掉所有 Wi-Fi：确认框用红色按钮，说清楚后果
		WIFI.reset(); WIFI.wait = 3;
		await page.reload(); await page.waitForTimeout(2200);
		await F('radio0', 'on').uncheck({ force: true }); await F('radio1', 'on').uncheck({ force: true }); await page.waitForTimeout(200);
		ok(`[${tag}] 关掉的卡片变灰`, /\boff\b/.test(await C('radio0').getAttribute('class')));
		await page.click('#wfSave'); await page.waitForTimeout(400);
		const cf2 = page.locator('.modal').last();
		ok(`[${tag}] 全关：说清楚只能用网线或从官网打开，按钮是红色`, /所有 Wi-Fi 都关了/.test(await cf2.textContent()) && (await cf2.locator('[data-v="true"].danger').count()) === 1);
		await cf2.locator('[data-v="true"]').click(); await page.waitForTimeout(800);
		ok(`[${tag}] 只发开关`, JSON.stringify(WIFI.sets[0]?.radios) === JSON.stringify([{ id: 'radio0', on: false }, { id: 'radio1', on: false }]), JSON.stringify(WIFI.sets[0]));
		await page.waitForTimeout(5000);
		ok(`[${tag}] 不点：时间到卡片关掉，提示已改回`, !(await page.locator('.modal[data-ng]').count()) && /已改回原来的 Wi-Fi 设置/.test(await toastT()), await toastT());
		// 没有无线
		WIFI.reset(); WIFI.none = 'nocfg';
		await page.reload(); await page.waitForTimeout(2000);
		ok(`[${tag}] 没有无线：说清楚原因，不显示保存`, /没有无线配置/.test(await page.textContent('#wfBody')) && await page.locator('#wfBar').isHidden());
		await ctx.close();
	}
	// 子账号没有「完全控制」：看不到 Wi-Fi 页
	{
		WIFI.reset();
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const page = await ctx.newPage();
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_role', JSON.stringify({ role: 'sub', perms: ['parent'] })); });
		await page.goto('http://localhost:8098/panel/?p=wifi'); await page.waitForTimeout(2000);
		ok('子账号没开「完全控制」：打不开 Wi-Fi 页', !(await page.locator('#p-wifi.on, #p-wifi.active').count()) && !(await page.locator('#p-wifi').isVisible()));
		await ctx.close();
	}
	await browser.close(); server.close();
	let bad = 0;
	for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '\n    ' + note)); if (!c) bad++; }
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n${results.length - bad}/${results.length} 通过`);
	process.exit(bad || problems.length ? 1 : 0);
})();

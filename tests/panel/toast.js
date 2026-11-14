// toast 提示 + 启动加载 专项测试
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');

const ROOT = (process.env.PANEL_WWW || path.join(__dirname, '..', '..', 'src', 'www'));
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };

async function open(browser, opt = {}) {
	const ctx = await browser.newContext({ viewport: opt.vp || { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: !opt.vp, hasTouch: !opt.vp, colorScheme: opt.dark ? 'dark' : 'light', reducedMotion: opt.reduce ? 'reduce' : 'no-preference' });
	const page = await ctx.newPage();
	const calls = [];
	page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !/serviceWorker|sw\.js|Failed to load resource/.test(m.text())) problems.push('控制台：' + m.text()); });
	const ctl = { fail: null, delay: opt.delay || {} };
	await page.route('http://panel.test/**', async (route) => {
		const u = new URL(route.request().url());
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(route.request().postData() || '{}');
			const t0 = Date.now();
			calls.push({ m: body.method, t0 });
			const m = body.method.replace('panel/', '');
			await new Promise((r) => setTimeout(r, ctl.delay[m] ?? 30));
			calls.find((c) => c.t0 === t0 && c.m === body.method).t1 = Date.now();
			if (ctl.fail === m) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -1, message: '测试错误：路由器返回了一个很长很长的错误说明，用来检查长文字会不会换行以及会不会撑破屏幕' } }) });
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: respond(body.method, body.params || {}) }) });
		}
		let f = path.join(ROOT, u.pathname);
		if (f.endsWith('/')) f += 'index.html';
		if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
		const ct = f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
		return route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(f) });
	});
	await page.addInitScript((ov) => { localStorage.setItem('rp_token', 'testtoken1234567890'); if (ov) localStorage.setItem('rp_ov', ov); }, opt.ov || null);
	return { page, ctx, calls, ctl };
}
const T = (page) => page.evaluate(() => {
	const t = document.getElementById('toast'), r = t.getBoundingClientRect(), b = t.querySelector('.tbar');
	const m = getComputedStyle(b).transform; const sx = m === 'none' ? 1 : +m.split('(')[1].split(',')[0];
	return { cls: t.className, text: t.textContent, x: r.left, r: r.right, top: r.top, w: r.width, h: r.height, vw: innerWidth, bg: getComputedStyle(t).backgroundImage, fg: getComputedStyle(t).color, barBg: getComputedStyle(b).backgroundColor, sx, barH: b.getBoundingClientRect().height, z: +getComputedStyle(t).zIndex, sw: document.documentElement.scrollWidth };
});
// 去掉「已选中」和点击放在同一步：中间要是赶上概览每 4 秒刷新一次，按钮又会被标回「已选中」，点了就没反应
const tapRule = async (page) => { await page.evaluate(() => { const b = document.querySelector('#modeChips .chip[data-mode="rule"]'); b.classList.remove('on'); b.click(); }); };

(async () => {
	const browser = await chromium.launch();
	for (const dark of [false, true]) {
		const sfx = dark ? '（深色）' : '';
		const { page, ctx } = await open(browser, { dark });
		await page.goto('http://panel.test/panel/?p=home');
		await page.waitForTimeout(1200);
		let s = await T(page);
		ok('一开始不显示 toast' + sfx, s.cls.includes('hidden'));

		await tapRule(page);
		await page.waitForTimeout(60);
		s = await T(page);
		ok('出现：弹出动画' + sfx, s.cls.includes('in') && !s.cls.includes('hidden'), s.cls);
		await page.waitForTimeout(500);
		s = await T(page);
		const tb = await page.evaluate(() => document.getElementById('topbar').getBoundingClientRect().bottom);
		ok('位置在顶栏正下方居中（不挡顶栏按钮）' + sfx, Math.abs(s.x - (s.vw - s.r)) <= 2 && s.top >= tb + 4 && s.top <= tb + 16, `左 ${Math.round(s.x)} 右 ${Math.round(s.vw - s.r)}，上边距 ${s.top}，顶栏底 ${tb}`);
		ok('尺寸小巧（不超过两行、宽度不超过 360）' + sfx, s.h <= 60 && s.w <= 360, `${Math.round(s.w)}×${Math.round(s.h)}`);
		ok('文字正确，没有显示秒数' + sfx, s.text.startsWith('已切换为规则模式') && !/\d+\s*(s|秒)/.test(s.text), s.text);
		ok('底部有细进度条（白色）' + sfx, s.barH >= 1.4 && s.barH <= 1.6 && s.barBg === 'rgb(255, 255, 255)', s.barH + 'px ' + s.barBg);
		ok('背景是米白→天蓝渐变' + sfx, /gradient/.test(s.bg) && /247, 239, 225/.test(s.bg) && /50, 171, 253/.test(s.bg), s.bg.slice(0, 60));
		await page.screenshot({ path: path.join(OUT, 'toast' + (dark ? '-dark' : '') + '.png') });
		const sx1 = s.sx;
		await page.waitForTimeout(800);
		s = await T(page);
		ok('进度条在缩短' + sfx, s.sx < sx1 - 0.15 && s.sx > 0, `${sx1.toFixed(2)} → ${s.sx.toFixed(2)}`);

		// 显示中再来一条：原地轻弹 + 进度条重新开始
		await tapRule(page);
		await page.waitForTimeout(120);
		s = await T(page);
		ok('显示中再弹：原地刷新，不重新滑入' + sfx, s.cls.includes('re') && !s.cls.includes('in'), s.cls);
		ok('进度条重新开始' + sfx, s.sx > 0.9, s.sx.toFixed(2));

		// 自动消失（短文字 2.8 秒）
		await page.waitForTimeout(2800 - 120 + 40);
		s = await T(page);
		ok('到时间先播放收回动画' + sfx, s.cls.includes('out'), s.cls);
		await page.waitForTimeout(350);
		s = await T(page);
		ok('收回后隐藏' + sfx, s.cls === 'toast hidden', s.cls);

		// 点一下马上收起
		await tapRule(page);
		await page.waitForTimeout(500);
		await page.click('#toast');
		await page.waitForTimeout(50);
		s = await T(page);
		ok('点击 toast 立即收回' + sfx, s.cls.includes('out'), s.cls);
		await page.waitForTimeout(320);
		ok('点击后隐藏' + sfx, (await T(page)).cls === 'toast hidden');

		// 收回动画中又来一条：重新滑入
		await tapRule(page);
		await page.waitForTimeout(500);
		await page.click('#toast');
		await page.waitForTimeout(100);
		await tapRule(page);
		await page.waitForTimeout(400);
		s = await T(page);
		ok('收回途中来新提示也能正常显示' + sfx, s.cls.includes('in') && !s.cls.includes('hidden') && !s.cls.includes('out'), s.cls);
		await page.waitForTimeout(3300);
		ok('之后照常自动消失' + sfx, (await T(page)).cls === 'toast hidden');
		await ctx.close();
	}

	// 错误提示 + 长文字
	{
		const { page, ctx, ctl } = await open(browser);
		await page.goto('http://panel.test/panel/?p=home');
		await page.waitForTimeout(1200);
		ctl.fail = 'overview';
		await page.click('#refreshBtn');
		await page.waitForTimeout(600);
		const s = await T(page);
		ok('错误提示是米白→红色渐变', /gradient/.test(s.bg) && /255, 90, 74/.test(s.bg), s.bg.slice(0, 60));
		ok('长文字自动换行，宽度不超过 360，仍居中', s.w <= 360.5 && s.h > 40 && Math.abs(s.x - (s.vw - s.r)) <= 2, `${Math.round(s.w)}×${Math.round(s.h)}`);
		ok('页面没有被撑出横向滚动', s.sw <= s.vw, `${s.sw}/${s.vw}`);
		await page.screenshot({ path: path.join(OUT, 'toast-err.png') });
		await page.waitForTimeout(2900);
		ok('长文字显示时间更长（超过 2.8 秒还在）', !(await T(page)).cls.includes('hidden'));
		await page.waitForTimeout(1700);
		ok('长文字最终也会消失', (await T(page)).cls === 'toast hidden');
		// toast 盖在弹窗上面
		ctl.fail = null;
		await page.click('#modeChips .chip[data-mode="global"]');
		await page.waitForTimeout(400);
		const mz = await page.evaluate(() => { const m = document.querySelector('.modal'); return m ? +getComputedStyle(m).zIndex : -1; });
		ok('toast 层级高于弹窗', (await T(page)).z > mz, `toast ${(await T(page)).z} / 弹窗 ${mz}`);
		await ctx.close();
	}

	// 电脑宽屏
	{
		const { page, ctx } = await open(browser, { vp: { width: 1280, height: 800 } });
		await page.goto('http://panel.test/panel/?p=home');
		await page.waitForTimeout(1200);
		await tapRule(page);
		await page.waitForTimeout(600);
		const s = await T(page);
		ok('宽屏在右边内容区居中（不偏到侧边栏）', Math.abs((s.x - 272) - (s.vw - s.r)) <= 2 && s.top <= 90, `左 ${Math.round(s.x)} 右 ${Math.round(s.vw - s.r)}，上 ${s.top}`);
		await page.screenshot({ path: path.join(OUT, 'toast-wide.png') });
		await ctx.close();
	}

	// 系统开了「减少动态效果」：进度条照样走
	{
		const { page, ctx } = await open(browser, { reduce: true });
		await page.goto('http://panel.test/panel/?p=home');
		await page.waitForTimeout(1200);
		await tapRule(page);
		await page.waitForTimeout(300);
		const a = (await T(page)).sx;
		await page.waitForTimeout(900);
		const b = (await T(page));
		ok('减少动态效果时进度条仍然工作', b.sx < a - 0.15, `${a.toFixed(2)} → ${b.sx.toFixed(2)}`);
		await page.waitForTimeout(2200);
		ok('减少动态效果时也会消失', (await T(page)).cls === 'toast hidden');
		await ctx.close();
	}

	// 启动加载：概览与状态并行；有缓存时立即显示
	{
		const ov = JSON.stringify(respond('panel/overview', {}));
		const { page, ctx, calls } = await open(browser, { ov, delay: { overview: 1500, oc_state: 1500 } });
		const t0 = Date.now();
		await page.goto('http://panel.test/panel/?p=home');
		await page.waitForSelector('#hHead');
		await page.waitForTimeout(250);
		const early = await page.evaluate(() => ({ head: document.getElementById('hHead').textContent, st: document.getElementById('statusText').textContent, cfg: document.getElementById('oCfg').textContent }));
		ok('有缓存时首页立即显示上次的数据', early.head && early.head !== '—' && early.cfg !== '—', JSON.stringify(early));
		ok('缓存显示期间状态是「连接中…」', early.st === '连接中…', early.st);
		await page.waitForTimeout(2200);
		const ovc = calls.find((c) => c.m === 'panel/overview'), stc = calls.find((c) => c.m === 'panel/oc_state');
		ok('概览和状态同时请求', ovc && stc && stc.t0 < ovc.t1, ovc && stc ? `状态在概览返回前 ${ovc.t1 - stc.t0}ms 发出` : '缺少请求');
		const st = await page.evaluate(() => document.getElementById('statusText').textContent);
		ok('真实数据回来后状态更新', st === '在线', st);
		const ini = calls.find((c) => c.m === 'initialize');
		ok('版本信息请求延后，不抢首屏', !ini || ini.t0 - t0 > 2500, ini ? `${ini.t0 - t0}ms` : '还没发');
		await ctx.close();
	}
	{
		const { page, ctx } = await open(browser, { delay: { overview: 800 } });
		await page.goto('http://panel.test/panel/?p=home');
		await page.waitForTimeout(200);
		const st = await page.evaluate(() => document.getElementById('statusText').textContent);
		ok('没有缓存时不显示假数据', st !== '在线', st);
		await page.waitForTimeout(1200);
		const saved = await page.evaluate(() => !!localStorage.getItem('rp_ov'));
		ok('加载后保存缓存供下次秒开', saved);
		await ctx.close();
	}

	await browser.close();
	for (const [n, c, note] of results) console.log((c ? '✅ ' : '❌ ') + n + (note ? '  ' + note : ''));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) { console.log('\n问题：'); problems.forEach((p) => console.log(' - ' + p)); }
})();

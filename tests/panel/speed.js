// 网速测试页：没测过、测速中、结果（下载/上传/延迟/线路/倍率流量）、直连、失败提示、防重复点
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const now = () => Math.floor(Date.now() / 1000);
let calls = 0, fail = false;
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), a = body.params || {};
			if (m === 'speedtest') {
				calls++;
				return setTimeout(() => {
					if (fail) return J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: '正在测速，请稍等' } });
					J({ jsonrpc: '2.0', id: body.id, result: a.kind === 'proxy'
						? { kind: 'proxy', ping: 82, via: 'Final → Zou → 🇭🇰香港03 专线 3x', down: 232.2, up: 88.1, bytes: 155036978, t: now() }
						: { kind: 'direct', ping: 23, down: 544.3, bytes: 77726527, via: '宽带直连（阿里云、腾讯云镜像）', t: now() } });
				}, 1200);
			}
			return J({ jsonrpc: '2.0', id: body.id, result: respond(m, a) });
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
	await new Promise((r) => server.listen(8097, r));
	const browser = await chromium.launch();
	for (const dark of [false, true]) {
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8097/panel/?p=speed'); await page.waitForTimeout(1500);
		const T = dark ? '（深色）' : '';
		if (!dark) {
			ok('从侧边栏「状态」里能找到「网速测试」', await page.locator('#sidenav button[data-p="speed"]').count() === 1);
			ok('打开快捷链接 ?p=speed 直接到网速测试页', (await page.textContent('#pageTitle')) === '网速测试');
			const t0 = await page.textContent('#stBody');
			ok('没测过：两张卡都显示「还没测过」和「开始测速」', (t0.match(/还没测过/g) || []).length === 2 && (t0.match(/开始测速/g) || []).length === 2, t0);
			calls = 0;
			await page.click('[data-st="proxy"]'); await page.waitForTimeout(300);
			const t1 = await page.textContent('#stBody');
			ok('测速中：显示「正在测速」，两个按钮都不能再点', /正在测速/.test(t1) && await page.locator('[data-st]:disabled').count() === 2, t1);
			await page.locator('[data-st="direct"]').click({ force: true }).catch(() => {});
			await page.waitForTimeout(1500);
			ok('测速中再点另一个也不会同时发起第二次', calls === 1, calls);
			const t2 = await page.textContent('#stBody');
			ok('代理结果：下载、上传、延迟', /232\s*Mbps/.test(t2) && /88\.1\s*Mbps/.test(t2) && /82\s*ms/.test(t2), t2);
			ok('线路去掉规则名，只显示 Zou → 节点', /Zou → 🇭🇰香港03 专线 3x/.test(t2) && !/Final/.test(t2), t2);
			ok('按节点 3x 倍率算出订阅流量', /按 3x 倍率约算订阅 44\d MB/.test(t2), t2);
			ok('顶部小标签显示代理下载速度', /232 Mbps/.test(await page.textContent('#stPill')));
			ok('按钮变成「再测一次」', /再测一次/.test(await page.textContent('[data-st="proxy"]')));
			await page.click('[data-st="direct"]'); await page.waitForTimeout(1700);
			const t3 = await page.textContent('#stBody');
			ok('直连结果：下载和延迟，没有上传，也不算倍率', /544\s*Mbps/.test(t3) && /23\s*ms/.test(t3) && (t3.match(/↑ 上传/g) || []).length === 1 && (t3.match(/倍率/g) || []).length === 1, t3);
			fail = true;
			await page.click('[data-st="proxy"]'); await page.waitForTimeout(1700);
			ok('出错时提示原因，旧结果保留、按钮恢复', /正在测速，请稍等/.test(await page.textContent('body')) && /232\s*Mbps/.test(await page.textContent('#stBody')) && await page.locator('[data-st]:disabled').count() === 0);
			fail = false;
			const w = await page.evaluate(() => document.documentElement.scrollWidth);
			ok('手机宽度不横向滚动', w <= 390, w);
		} else {
			await page.click('[data-st="proxy"]'); await page.waitForTimeout(1700);
			await page.click('[data-st="direct"]'); await page.waitForTimeout(1700);
		}
		await page.waitForTimeout(2500);
		await page.screenshot({ path: path.join(__dirname, 'shots', 'speed' + (dark ? '-dark' : '') + '.png'), fullPage: true });
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

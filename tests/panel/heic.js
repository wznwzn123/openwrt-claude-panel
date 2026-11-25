// 6.0 第 48 项：iPhone 的 HEIC 照片。浏览器打不开时，下载转换工具（带完整性校验）转成 JPG 再用；
// 下不下来、被人改过的工具都不运行，说清楚怎么办。用设备照片和「联系开发者」发图两个入口测
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execSync } = require('child_process');
const M = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
// 转换工具：第一次跑时从 npm 拿一份放在 .cache（跟 CDN 上的是同一个文件）
const LIB = path.join(__dirname, '.cache', 'heic2any.min.js');
if (!fs.existsSync(LIB)) {
	const t = fs.mkdtempSync(path.join(os.tmpdir(), 'heic-'));
	execSync('npm pack heic2any@0.0.4 --silent', { cwd: t });
	execSync('tar xzf heic2any-0.0.4.tgz', { cwd: t });
	fs.mkdirSync(path.dirname(LIB), { recursive: true });
	fs.copyFileSync(path.join(t, 'package', 'dist', 'heic2any.min.js'), LIB);
}
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); try { return J(M.reply(body.id, body.method.replace(/^panel\//, ''), body.params || {})); } catch (e) { return J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }
		if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' }, 403);
		const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
		if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
	});
});
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const HEIC = path.join(__dirname, 'sample.heic');
(async () => {
	await new Promise((r) => server.listen(8099, r));
	const browser = await chromium.launch();
	// mode：ok = CDN 正常；down = 都连不上；bad = 文件被改过（完整性校验不过）；second = 第一个 CDN 不通、第二个正常
	const run = async (mode) => {
		for (const o of [M.DIMG, M.DI]) for (const k of Object.keys(o)) delete o[k];
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
		const page = await ctx.newPage(), hits = [];
		page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com/, (rt) => {
			const u = rt.request().url(); hits.push(u);
			if (mode === 'down' || (mode === 'second' && /cdnjs/.test(u))) return rt.abort();
			const body = mode === 'bad' ? fs.readFileSync(LIB, 'utf8') + '\n;window.__evil=1;' : fs.readFileSync(LIB);
			rt.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body });
		});
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8099/panel/?p=dev'); await W(2500);
		ok(`[${mode}] 打开面板时不下载转换工具（只在要用时下）`, !hits.length, hits.join());
		await page.locator('#dvList [data-i="0"] [data-icon]').click(); await W(600);
		const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.modal [data-photo]')]);
		await fc.setFiles(HEIC); await W(4000);
		return { page, ctx, hits };
	};
	{
		const { page, ctx, hits } = await run('ok');
		const im = M.DIMG['aa:bb:cc:dd:ee:ff'];
		ok('[ok] 选 HEIC 照片当设备图标：下载转换工具、转成 JPG 后裁小存好', hits.length === 1 && im && /^data:image\/(webp|jpeg);base64,/.test(im.u), JSON.stringify({ hits, im: im && im.u.slice(0, 30) }));
		ok('[ok] 卡片上显示这张照片', /url\("?data:image/.test(await page.locator('#dvList [data-i="0"] .dvic').evaluate((e) => e.style.backgroundImage)));
		// 「联系开发者」发 HEIC 截图：工具已经下过，不再下
		await page.goto('http://localhost:8099/panel/?p=chat'); await W(2000);
		const n0 = hits.length;
		await page.setInputFiles('#chFile', HEIC); await W(4000);
		ok('[ok] 联系开发者发 HEIC 截图：转成 JPG，能预览', await page.isVisible('#chPre') && /^data:image\/jpeg/.test(await page.getAttribute('#chPreImg', 'src')), await page.textContent('#toast'));
		ok('[ok] 换了页面再用：工具重新下一次（每次打开面板最多下一次）', hits.length - n0 <= 1);
		// 普通 JPG / PNG：不下载工具
		await page.goto('http://localhost:8099/panel/?p=chat'); await W(2000);
		const n1 = hits.length;
		await page.setInputFiles('#chFile', path.join(__dirname, 'devphoto.png')); await W(1500);
		ok('[ok] 普通 PNG：直接用，不下载转换工具', await page.isVisible('#chPre') && hits.length === n1);
		// 坏文件（不是图片）：说清楚
		await page.goto('http://localhost:8099/panel/?p=chat'); await W(2000);
		await page.setInputFiles('#chFile', { name: 'x.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image at all') }); await W(1200);
		ok('[ok] 打不开的文件：提示换成 JPG 或 PNG', /换成 JPG 或 PNG/.test(await page.textContent('#toast')) && !(await page.isVisible('#chPre')), await page.textContent('#toast'));
		await ctx.close();
	}
	{
		const { ctx } = await run('second');
		ok('[second] 第一个 CDN 不通：换下一个，照样转好', !!M.DIMG['aa:bb:cc:dd:ee:ff']);
		await ctx.close();
	}
	{
		const { page, ctx, hits } = await run('down');
		ok('[down] CDN 都连不上：不存照片，提示在 iPhone 上直接选或换成截图', !M.DIMG['aa:bb:cc:dd:ee:ff'] && /HEIC 照片要先下载转换工具/.test(await page.textContent('#toast')) && hits.length === 3, await page.textContent('#toast'));
		await ctx.close();
	}
	{
		const { page, ctx } = await run('bad');
		ok('[bad] 工具被改过：完整性校验不过，不运行（改动的代码没执行），不存照片', !M.DIMG['aa:bb:cc:dd:ee:ff'] && !(await page.evaluate(() => window.__evil)) && /HEIC 照片要先下载转换工具/.test(await page.textContent('#toast')));
		await ctx.close();
	}
	await browser.close(); server.close();
	for (const [n, c, note] of results) console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + note + '）'));
	console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

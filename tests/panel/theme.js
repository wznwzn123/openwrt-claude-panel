// 主题与背景：默认玻璃、换预设、相册选图、模糊/变暗、关掉玻璃、刷新后保持、深色、各页面截图
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: respond(body.method.replace(/^panel\//, ''), body.params || {}) })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(403); return res.end('{}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = process.argv.includes('--shots');
(async () => {
	await new Promise((r) => server.listen(8122, r));
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOT ? 2 : 1, isMobile: true, hasTouch: true, colorScheme: 'light' });
	const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	await page.addInitScript(() => { if (!sessionStorage.getItem('i')) { localStorage.setItem('rp_token', 'testtoken1234567890'); sessionStorage.setItem('i', '1'); } });
	const shot = async (n) => { if (SHOT) await page.screenshot({ path: path.join(__dirname, 'shots', 'theme-' + n + '.png') }); };
	await page.goto('http://localhost:8122/panel/?p=home'); await W(1800);
	const st = () => page.evaluate(() => { const R = document.documentElement, cs = getComputedStyle(document.querySelector('.card')); return { glass: R.classList.contains('glass'), wall: R.dataset.wall || '', wallShown: getComputedStyle(document.getElementById('wall')).display, card: cs.backgroundColor, body: getComputedStyle(document.body).backgroundColor, blur: R.style.getPropertyValue('--wblur'), dim: R.style.getPropertyValue('--wdim'), img: !!document.getElementById('wall').style.getPropertyValue('--wimg') }; });
	let s = await st();
	ok('默认就是玻璃效果，显示背景', s.glass && s.wallShown === 'block' && s.body === 'rgba(0, 0, 0, 0)', JSON.stringify(s));
	ok('卡片是半透明的', /rgba\(255, 255, 255, 0\.6\)/.test(s.card), s.card);
	await shot('home');
	// 进设置
	await page.goto('http://localhost:8122/panel/?p=more'); await W(1200);
	ok('系统操作里有「主题与背景」，显示当前主题', /玻璃 · 晨雾/.test(await page.textContent('#lookState')), await page.textContent('#lookState'));
	await page.click('[data-t="look"]'); await W(600);
	ok('打开主题设置：有开关、8 个预设、从相册选、两个滑块', (await page.locator('.modalbox [data-lg]').count()) === 1 && (await page.locator('.modalbox .wtile[data-w]').count()) === 8 && (await page.locator('.modalbox [data-pick]').count()) === 1 && (await page.locator('.modalbox input[type=range]').count()) === 2);
	ok('当前背景（晨雾）有选中标记', (await page.getAttribute('.wtile[data-w="mist"]', 'class')).includes('on'));
	ok('主题设置弹窗后面不压暗（能看到背景实时变化）', await page.evaluate(() => document.querySelector('.modal').classList.contains('clear')));
	await shot('settings');
	await page.click('.wtile[data-w="sunset"]'); await W(300);
	s = await st();
	ok('点「日落」立刻换背景并保存', s.wall === 'sunset' && (await page.evaluate(() => localStorage.getItem('rp_wall'))) === 'sunset' && (await page.getAttribute('.wtile[data-w="sunset"]', 'class')).includes('on'));
	await page.$eval('[data-dim]', (e) => { e.value = 30; e.dispatchEvent(new Event('input')); });
	await page.$eval('[data-blur]', (e) => { e.value = 8; e.dispatchEvent(new Event('input')); });
	s = await st();
	ok('拖动滑块：变暗 30%、模糊 8，马上生效', s.dim === '0.3' && s.blur === '8px' && /30%/.test(await page.textContent('[data-dv]')), JSON.stringify(s));
	// 相册选图（造一张 3000×2000 的图）
	const big = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 3000, 2000); gr.addColorStop(0, '#ff7a59'); gr.addColorStop(1, '#2f80ed'); g.fillStyle = gr; g.fillRect(0, 0, 3000, 2000); return c.toDataURL('image/png'); });
	fs.writeFileSync('/tmp/cmcp_wall_test.png', Buffer.from(big.split(',')[1], 'base64'));
	await page.setInputFiles('.modalbox [data-file]', '/tmp/cmcp_wall_test.png'); await W(1500);
	s = await st();
	const stored = await page.evaluate(() => { const d = localStorage.getItem('rp_wallimg') || ''; return { len: d.length, jpeg: d.startsWith('data:image/jpeg') }; });
	ok('从相册选图：缩小存成 JPEG，并设为背景', s.wall === 'photo' && s.img && stored.jpeg && stored.len < 1500000, JSON.stringify(stored));
	ok('选图后出现「我的图片」并选中，按钮变「换一张」', (await page.locator('.wtile[data-w="photo"].on').count()) === 1 && /换一张/.test(await page.textContent('[data-pick]')));
	const dims = await page.evaluate(() => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = localStorage.getItem('rp_wallimg'); }));
	ok('大图被缩小到 1600 以内', Math.max(...dims) <= 1600, dims.join('×'));
	await shot('photo');
	// 选非图片
	fs.writeFileSync('/tmp/cmcp_wall_bad.txt', 'hello');
	await page.setInputFiles('.modalbox [data-file]', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }); await W(500);
	ok('选了不是图片的文件：提示错误，背景不变', /请选一张图片|读不了/.test(await page.textContent('body')) && (await st()).wall === 'photo');
	// 刷新后保持
	await page.reload(); await W(1500);
	s = await st();
	ok('刷新后背景、模糊、变暗都还在', s.glass && s.wall === 'photo' && s.img && s.blur === '8px' && s.dim === '0.3', JSON.stringify(s));
	await page.goto('http://localhost:8122/panel/?p=more'); await W(1000);
	ok('设置入口显示「玻璃 · 我的图片」', /玻璃 · 我的图片/.test(await page.textContent('#lookState')));
	// 关掉玻璃
	await page.click('[data-t="look"]'); await W(500);
	await page.click('.modalbox label.aswon'); await W(300);
	s = await st();
	ok('关掉玻璃：恢复简洁样式（不透明卡片、不显示背景）', !s.glass && s.wallShown === 'none' && s.card === 'rgb(255, 255, 255)', JSON.stringify(s));
	ok('关掉后背景选项变灰不可点', await page.evaluate(() => document.querySelector('[data-lbody]').classList.contains('lookoff')));
	await page.click('.modalbox [data-v="close"]'); await W(500);
	ok('入口显示「简洁」', /简洁/.test(await page.textContent('#lookState')));
	await page.reload(); await W(1200);
	ok('刷新后仍是简洁样式，没有闪一下玻璃', !(await st()).glass);
	// 恢复默认
	await page.click('[data-t="look"]'); await W(500);
	await page.click('[data-reset]'); await W(400);
	s = await st();
	ok('恢复默认：玻璃开、晨雾、图片删掉', s.glass && s.wall === '' && !(await page.evaluate(() => localStorage.getItem('rp_wallimg'))) && (await page.locator('.wtile[data-w="photo"]').count()) === 0);
	await page.click('.modalbox [data-v="close"]'); await W(400);
	// 深色：默认星空
	await page.click('[data-t="theme"]'); await W(400);
	s = await st();
	ok('深色模式：卡片变成深色半透明，默认背景星空', /rgba\(28, 28, 32, 0\.56\)/.test(s.card) && /星空/.test(await page.textContent('#lookState')), s.card);
	const w = await page.evaluate(() => document.documentElement.scrollWidth);
	ok('不横向滚动', w <= 390, w);
	if (SHOT) {
		for (const [pg, n] of [['home', 'dark-home'], ['dev', 'dark-dev'], ['proxy', 'dark-proxy']]) { await page.goto('http://localhost:8122/panel/?p=' + pg); await W(1500); await shot(n); }
		await page.click('[data-t="theme"]').catch(() => {});
		await page.evaluate(() => { localStorage.setItem('rp_dark', '0'); document.documentElement.classList.remove('dark'); });
		for (const [pg, n] of [['dev', 'dev'], ['proxy', 'proxy'], ['wd', 'wd'], ['traf', 'traf']]) { await page.goto('http://localhost:8122/panel/?p=' + pg); await W(1500); await shot(n); }
		await page.goto('http://localhost:8122/panel/?p=dev'); await W(1500);
		await page.locator('[data-d], .dev, .devrow').first().click().catch(() => {}); await W(800); await shot('dev-sheet');
		await page.goto('http://localhost:8122/panel/?p=home'); await W(1200);
		await page.click('.menubtn').catch(() => {}); await W(600); await shot('side');
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

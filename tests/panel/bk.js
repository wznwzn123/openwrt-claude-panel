// 云端备份页：空列表、立即备份、列表、下载、删除（要确认）、还原（要确认、取消不动）、出错提示
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
let list = [], calls = [], failNow = false, n = 0, crypt = 'openssl', job = null, slow = 1;
const mk = (kind, ago) => ({ id: 'id' + (++n).toString(36) + 'zz', n: 11, size: 1239168 + n, at: Date.now() - ago, name: 'Kwrt-x' + n, kind, files: 187 });
const server = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x'); let b = '';
	req.on('data', (d) => (b += d));
	req.on('end', () => {
		const J = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
		if (u.pathname.startsWith('/panel/dl/')) { res.writeHead(200, { 'content-type': 'application/gzip' }); return res.end('x'); }
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''), a = body.params || {};
			const R = (result) => J({ jsonrpc: '2.0', id: body.id, result }), E = (message) => J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message } });
			if (m.startsWith('bk_')) calls.push(m + (a.id ? ':' + a.id : ''));
			if (m === 'bk_list') return R({ list, max: 10, auto: true, running: false, crypt, job });
			// 6.0：备份、下载、还原都在路由器后台做，面板隔几秒来看进度（slow 秒以后做完）
			const later = (fn) => setTimeout(fn, slow * 1000);
			if (m === 'bk_now') { if (job && job.state === 'running') return E('正在备份，等它做完'); job = { op: 'now', id: '', state: 'running', msg: '', at: 1 }; later(() => { if (failNow) { job = { ...job, state: 'error', msg: '上传失败：网络不通' }; return; } const x = { ...mk('manual', 0), enc: true }; list.unshift(x); job = { ...job, state: 'done', size: x.size }; }); return R({ ok: true, running: true }); }
			if (m === 'bk_del') { list = list.filter((x) => x.id !== a.id); return R({ ok: true }); }
			if (m === 'bk_dl') { if (job && job.op === 'dl' && job.id === a.id && job.state === 'done') { job = { ...job, state: 'taken' }; return R({ url: 'dl/abc/' + a.name + '.tar.gz', name: a.name + '.tar.gz', size: 1239168 }); } job = { op: 'dl', id: a.id, state: 'running', msg: '', at: 1 }; later(() => { job = { ...job, state: 'done' }; }); return R({ ok: true, running: true }); }
			if (m === 'bk_restore') { job = { op: 'restore', id: a.id, state: 'running', msg: '正在备份现在的设置', at: 1 }; later(() => { job = { ...job, state: 'restoring', msg: '' }; }); return R({ ok: true, running: true }); }
			return R(respond(m, a));
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
	for (const dark of [false, true]) {
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		if (!dark) {
			await page.goto('http://localhost:8098/panel/?p=cbk'); await page.waitForTimeout(1500);
			ok('侧边栏「工具」里有「云端备份」', await page.locator('#sidenav button[data-p="cbk"]').count() === 1);
			ok('打开 ?p=cbk 直接到云端备份页', (await page.textContent('#pageTitle')) === '云端备份');
			ok('没有备份时提示先备份一份', /还没有备份/.test(await page.textContent('#bkBody')) && /0 \/ 10 份/.test(await page.textContent('#bkPill')));
			await page.click('#bkNow'); await page.waitForTimeout(250);
			ok('备份时按钮显示「备份中」并不能再点', /备份中/.test(await page.textContent('#bkNow')) && await page.locator('#bkNow:disabled').count() === 1);
			await page.waitForTimeout(3200);
			ok('备份完成：提示大小，列表出现一条「手动」', /已备份到云端/.test(await page.textContent('body')) && await page.locator('.bkrow').count() === 1 && /手动/.test(await page.textContent('.bkrow')) && /1 \/ 10 份/.test(await page.textContent('#bkPill')));
			list.push(mk('auto', 86400e3), mk('auto', 2 * 86400e3));
			await page.reload(); await page.waitForTimeout(1500);
			const rows = await page.$$eval('.bkrow', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ')));
			ok('列表：最新在前，自动 / 手动标签，大小和文件数', rows.length === 3 && /手动/.test(rows[0]) && /自动/.test(rows[1]) && /1\.2 MB · 187 个文件/.test(rows[0]), rows.join(' | '));
			ok('[加密] 新备份标「已加密」，以前的标「没加密」', /已加密/.test(rows[0]) && /没加密/.test(rows[1]) && /没加密/.test(rows[2]) && !/没加密/.test(rows[0]), rows.join(' | '));
			const tb = await page.textContent('#bkBody');
			ok('[加密] 一律加密：写明「备份一律加密」「已开启」，没有关掉的开关', /备份一律加密/.test(tb) && /已开启/.test(tb) && await page.locator('#bkEnc').count() === 0);
			ok('[加密] 还有以前没加密的：说明下次备份后会自动加密换掉、照样能还原', /自动加密后换掉/.test(tb) && /照样能还原/.test(tb));
			ok('[加密] 页面说明：上传前一律先加密', /上传前一律先在路由器上加密/.test(await page.textContent('#p-cbk .hero')));
			await page.screenshot({ path: path.join(__dirname, 'shots', 'bk-enc.png'), fullPage: true });
			{ const keep = list; list = keep.filter((x) => x.enc); await page.reload(); await page.waitForTimeout(1500);
			ok('[加密] 全都加密了：不再显示旧备份提醒', !/自动加密后换掉/.test(await page.textContent('#bkBody')));
			crypt = 'builtin'; list = keep; await page.reload(); await page.waitForTimeout(1500);
			ok('[加密] 没有 openssl：用面板自带的方式加密，说清楚不用装东西、慢的话要一两分钟', /面板自带的方式加密/.test(await page.textContent('#bkBody')) && /不用另外装东西/.test(await page.textContent('#bkBody')) && /一两分钟/.test(await page.textContent('#bkBody')));
			await page.screenshot({ path: path.join(__dirname, 'shots', 'bk-ssl.png'), fullPage: true });
			// 离开再回来时后台还在做：显示正在做什么，做完自动刷新
			job = { op: 'now', id: '', state: 'running', msg: '', at: 1 }; setTimeout(() => { job = { ...job, state: 'done', size: 1 }; }, 3500);
			await page.reload(); await page.waitForTimeout(1500);
			ok('[任务] 后台还在备份：显示「正在备份…」', /正在备份…/.test(await page.textContent('#bkJob')));
			await page.waitForTimeout(6000);
			ok('[任务] 做完自动刷新，不再显示', await page.locator('#bkJob').count() === 0);
			crypt = 'openssl'; job = null; await page.reload(); await page.waitForTimeout(1500); }
			ok('显示每天 4:07 自动备份已开启', /自动备份已开启（每天 4:07）/.test(await page.textContent('#bkBody')));
			// 下载
			calls = [];
			const dlP = page.waitForEvent('download', { timeout: 9000 }).catch(() => null);
			await page.locator('.bkrow').nth(1).locator('[data-bkdl]').click();
			const dl = await dlP;
			ok('下载：路由器先在后台解密，好了自动下载，文件名是备份名', !!dl && /Kwrt-x\d+\.tar\.gz/.test(dl.suggestedFilename()) && calls.filter((c) => c.startsWith('bk_dl:')).length === 2, dl && dl.suggestedFilename());
			// 删除：取消 → 不删；确认 → 删
			const id2 = list[1].id;
			await page.locator('.bkrow').nth(1).locator('[data-bkrm]').click(); await page.waitForTimeout(400);
			ok('删除前要确认', /删除这份备份/.test(await page.textContent('.modal')));
			await page.click('.modal [data-v="false"]'); await page.waitForTimeout(400);
			ok('取消删除：什么都不做', list.length === 3 && !calls.some((c) => c.startsWith('bk_del')));
			await page.locator('.bkrow').nth(1).locator('[data-bkrm]').click(); await page.waitForTimeout(400);
			await page.click('.modal [data-v="true"]'); await page.waitForTimeout(900);
			ok('确认删除：列表少一条', list.length === 2 && !list.some((x) => x.id === id2) && await page.locator('.bkrow').count() === 2);
			// 还原：说明清楚，取消不动，确认后调用还原
			calls = [];
			await page.locator('.bkrow').nth(1).locator('[data-bkrs]').click(); await page.waitForTimeout(400);
			const mt = await page.textContent('.modal');
			ok('还原前说明：先备份现在的、会重启断网 1–2 分钟', /还原到这份备份/.test(mt) && /先把现在的设置备份/.test(mt) && /1–2 分钟/.test(mt) && /断网/.test(mt) && /钥匙保持现在的/.test(mt), mt);
			// 说明变长了：最窄的手机（320 宽）上也要完整显示、按钮看得见
			await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(300);
			await page.screenshot({ path: path.join(__dirname, 'shots', 'bk-restore-320' + (dark ? '-dark' : '') + '.png') });
			const rb = await page.evaluate(() => { const m = [...document.querySelectorAll('.modal')].pop(), b = m.querySelector('[data-v="true"]').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, right: b.right, bottom: b.bottom, h: innerHeight }; });
			ok('还原确认框在 320 宽的手机上不横向滚动、按钮在屏幕里', rb.sw <= 320 && rb.right <= 320 && rb.bottom <= rb.h, JSON.stringify(rb));
			await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
			await page.click('.modal [data-v="false"]'); await page.waitForTimeout(400);
			ok('取消还原：不调用还原', !calls.some((c) => c.startsWith('bk_restore')));
			await page.locator('.bkrow').nth(1).locator('[data-bkrs]').click(); await page.waitForTimeout(400);
			await page.click('.modal [data-v="true"]'); await page.waitForTimeout(400);
			ok('确认还原：先显示准备中（还原前要先备份现在的设置）', /准备中/.test(await page.textContent('#bkBody')) || /正在备份现在的设置/.test(await page.textContent('#bkBody')));
			await page.waitForTimeout(3500);
			ok('确认还原：调用还原并提示正在重启', calls.includes('bk_restore:' + list[1].id) && /正在还原/.test(await page.textContent('body')) && /正在重启/.test(await page.textContent('#statusText')), calls.join(','));
			// 出错
			failNow = true; job = null;
			await page.click('#bkNow'); await page.waitForTimeout(3500);
			ok('备份失败时提示原因，按钮恢复', /上传失败：网络不通/.test(await page.textContent('body')) && await page.locator('#bkNow:disabled').count() === 0);
			failNow = false;
			const w = await page.evaluate(() => document.documentElement.scrollWidth);
			ok('手机宽度不横向滚动', w <= 390, w);
		} else {
			await page.goto('http://localhost:8098/panel/?p=cbk'); await page.waitForTimeout(1500);
		}
		await page.waitForTimeout(2500);
		await page.screenshot({ path: path.join(__dirname, 'shots', 'bk' + (dark ? '-dark' : '') + '.png'), fullPage: true });
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + String(r[2]).slice(0, 300) + '）' : '')).join('\n'));
	if (problems.length) console.log('\n问题：\n' + problems.join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

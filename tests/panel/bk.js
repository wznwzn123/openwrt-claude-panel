// 云端备份页：空列表、立即备份、列表、下载、删除（要确认）、还原（要确认、取消不动）、出错提示
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const results = [], problems = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };
let list = [], calls = [], failNow = false, n = 0, ssl = true, sslRun = false, sslErr = null, noenc = false;
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
			if (m === 'bk_list') return R({ list, max: 10, auto: true, running: false, ssl, noenc, ssl_run: sslRun, ssl_err: sslErr });
			if (m === 'bk_enc') { calls.push('enc:' + !!a.on); if (!a.on) { noenc = true; return R({ ok: true, off: true }); } noenc = false; if (ssl) return R({ ok: true, already: true }); sslRun = true; setTimeout(() => { sslRun = false; ssl = true; }, 2500); return R({ ok: true, running: true }); }
			if (m === 'bk_ssl') { sslRun = true; setTimeout(() => { sslRun = false; ssl = true; }, 2500); return R({ ok: true, running: true }); }
			if (m === 'bk_now') return setTimeout(() => { if (failNow) return E('上传失败：网络不通'); const x = { ...mk('manual', 0), enc: true }; list.unshift(x); R({ ok: true, id: x.id, size: x.size, n: 11, total: list.length }); }, 600);
			if (m === 'bk_del') { list = list.filter((x) => x.id !== a.id); return R({ ok: true }); }
			if (m === 'bk_dl') return R({ url: 'dl/abc/' + a.name + '.tar.gz', name: a.name + '.tar.gz', size: 1239168 });
			if (m === 'bk_restore') return setTimeout(() => R({ ok: true }), 400);
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
			await page.waitForTimeout(1200);
			ok('备份完成：提示大小，列表出现一条「手动」', /已备份到云端/.test(await page.textContent('body')) && await page.locator('.bkrow').count() === 1 && /手动/.test(await page.textContent('.bkrow')) && /1 \/ 10 份/.test(await page.textContent('#bkPill')));
			list.push(mk('auto', 86400e3), mk('auto', 2 * 86400e3));
			await page.reload(); await page.waitForTimeout(1500);
			const rows = await page.$$eval('.bkrow', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ')));
			ok('列表：最新在前，自动 / 手动标签，大小和文件数', rows.length === 3 && /手动/.test(rows[0]) && /自动/.test(rows[1]) && /1\.2 MB · 187 个文件/.test(rows[0]), rows.join(' | '));
			ok('[加密] 新备份标「已加密」，以前的标「没加密」', /已加密/.test(rows[0]) && /没加密/.test(rows[1]) && /没加密/.test(rows[2]) && !/没加密/.test(rows[0]), rows.join(' | '));
			ok('[加密] 有 openssl、还有以前没加密的：只说会慢慢轮换掉，不会自动删', /没开加密时存的备份/.test(await page.textContent('#bkBody')) && /轮换/.test(await page.textContent('#bkBody')) && !/自动删/.test(await page.textContent('#bkBody')));
			ok('[加密] 页面说明：开启加密后上传前先加密', /开启加密后，上传前先在路由器上加密/.test(await page.textContent('#p-cbk .hero')));
			await page.screenshot({ path: path.join(__dirname, 'shots', 'bk-enc.png'), fullPage: true });
			{ const keep = list; list = keep.filter((x) => x.enc); await page.reload(); await page.waitForTimeout(1500);
			ok('[加密] 有开关「加密上传」，开着', await page.isChecked('#bkEnc') && /加密上传/.test(await page.textContent('#bkBody')));
			ok('[加密] 全都加密了：不再显示旧备份提醒', !/没开加密时存的/.test(await page.textContent('#bkBody')));
			ssl = false; list = keep; await page.reload(); await page.waitForTimeout(1500);
			ok('[加密] 没有 openssl：开关关着，说明没加密、打开会装 openssl-util；不会自己装', !(await page.isChecked('#bkEnc')) && /没有开启/.test(await page.textContent('#bkBody')) && /openssl-util/.test(await page.textContent('#bkBody')) && !calls.includes('enc:true'));
			ok('[加密] 没有 openssl：照常能备份（「立即备份」能点）', await page.locator('#bkNow:disabled').count() === 0);
			await page.screenshot({ path: path.join(__dirname, 'shots', 'bk-ssl.png'), fullPage: true });
			await page.click('#bkEnc'); await page.waitForTimeout(500);
			ok('[加密] 打开开关先确认，写清楚要装 openssl-util、占多少空间、上网不受影响', /openssl-util/.test(await page.textContent('.modal')) && /2 MB/.test(await page.textContent('.modal')) && /上网不受影响/.test(await page.textContent('.modal')));
			await page.click('.modal [data-v="false"]'); await page.waitForTimeout(500);
			ok('[加密] 取消：开关回到关，什么都不装', !(await page.isChecked('#bkEnc')) && !calls.includes('enc:true'));
			await page.click('#bkEnc'); await page.waitForTimeout(500);
			await page.click('.modal [data-v="true"]'); await page.waitForTimeout(900);
			ok('[加密] 确认后：开始装，显示正在安装，开关先锁住', calls.includes('enc:true') && /正在安装加密工具/.test(await page.textContent('#bkBody')) && await page.locator('#bkEnc:disabled').count() === 1);
			await page.waitForTimeout(6000);
			ok('[加密] 装好后自动刷新：开关打开、能再点', await page.isChecked('#bkEnc') && await page.locator('#bkEnc:disabled').count() === 0 && !/正在安装/.test(await page.textContent('#bkBody')));
			// 关掉加密：要确认，说明已加密的不受影响
			calls = [];
			await page.click('#bkEnc'); await page.waitForTimeout(500);
			const mt0 = await page.textContent('.modal');
			ok('[加密] 关闭前确认：说明以后不加密、已加密的照样能还原', /关闭备份加密/.test(mt0) && /不加密/.test(mt0) && /照样能下载、还原/.test(mt0), mt0);
			await page.click('.modal [data-v="false"]'); await page.waitForTimeout(500);
			ok('[加密] 取消关闭：开关还开着，没调用', await page.isChecked('#bkEnc') && !calls.some((c) => /^enc:|bk_enc/.test(c)));
			await page.click('#bkEnc'); await page.waitForTimeout(500); await page.click('.modal [data-v="true"]'); await page.waitForTimeout(900);
			ok('[加密] 确认关闭：调用一次，开关关着，说明「已关闭」，不会去装/删东西', calls.filter((c) => /^enc:|bk_ssl|bk_del/.test(c)).join() === 'enc:false' && !(await page.isChecked('#bkEnc')) && /已关闭/.test(await page.textContent('#bkBody')) && /以前加密的备份照样能下载、还原/.test(await page.textContent('#bkBody')), calls.join());
			ok('[加密] 关着的时候不提示「没开加密时存的」（那句只在开着时说）', !/没开加密时存的/.test(await page.textContent('#bkBody')));
			await page.reload(); await page.waitForTimeout(1500);
			ok('[加密] 刷新后还是关着（路由器记住了）', !(await page.isChecked('#bkEnc')));
			await page.click('#bkEnc'); await page.waitForTimeout(700);
			ok('[加密] 有 openssl 时重新打开：不用确认、直接开', !(await page.isVisible('.modal')) && calls.includes('enc:true'));
			await page.waitForTimeout(900);
			ok('[加密] 重新打开后开关开着', await page.isChecked('#bkEnc') && !noenc);
			ssl = false; sslErr = 'Unknown package openssl-util'; await page.reload(); await page.waitForTimeout(1500);
			ok('[加密] 上次没装成：显示原因，开关还能点', /上次没装成：Unknown package/.test(await page.textContent('#bkBody')) && await page.locator('#bkEnc:disabled').count() === 0);
			ssl = true; sslErr = null; await page.reload(); await page.waitForTimeout(1500); }
			ok('显示每天 4:07 自动备份已开启', /自动备份已开启（每天 4:07）/.test(await page.textContent('#bkBody')));
			// 下载
			calls = [];
			const dlP = page.waitForEvent('download', { timeout: 4000 }).catch(() => null);
			await page.locator('.bkrow').nth(1).locator('[data-bkdl]').click();
			const dl = await dlP;
			ok('下载：经路由器取回，文件名是备份名', !!dl && /Kwrt-x\d+\.tar\.gz/.test(dl.suggestedFilename()) && calls.some((c) => c.startsWith('bk_dl:')), dl && dl.suggestedFilename());
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
			ok('还原前说明：先备份现在的、会重启断网 1–2 分钟', /还原到这份备份/.test(mt) && /先把现在的设置备份/.test(mt) && /1–2 分钟/.test(mt) && /断网/.test(mt), mt);
			await page.click('.modal [data-v="false"]'); await page.waitForTimeout(400);
			ok('取消还原：不调用还原', !calls.some((c) => c.startsWith('bk_restore')));
			await page.locator('.bkrow').nth(1).locator('[data-bkrs]').click(); await page.waitForTimeout(400);
			await page.click('.modal [data-v="true"]'); await page.waitForTimeout(1000);
			ok('确认还原：调用还原并提示正在重启', calls.includes('bk_restore:' + list[1].id) && /正在还原/.test(await page.textContent('body')) && /正在重启/.test(await page.textContent('#statusText')), calls.join(','));
			// 出错
			failNow = true;
			await page.click('#bkNow'); await page.waitForTimeout(1300);
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

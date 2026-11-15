// 5.2 发文件（面板）：对话里发视频 / 文件（分块上传、进度、去掉、只发文件、失败）、显示收到的文件；托管版反馈带文件；公告里的附件
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const { respond } = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const R = []; const ok = (n, c, x) => R.push((c ? '✓ ' : '✗ ') + n + (c ? '' : '（' + x + '）'));
const PORT = 8184, BASE = 'http://localhost:' + PORT;
// 一张 480×300 的 PNG
const PNG = Buffer.from(fs.readFileSync(path.join(__dirname, 'files-test.b64'), 'utf8').trim(), 'base64');
let S;
const reset = () => { S = { msgs: [], seq: 0, ups: {}, done: {}, sends: [], fbs: [], puts: 0, failPut: false, n: 0 }; };
const kind = (t) => (/^image\//.test(t) ? 'img' : /^video\//.test(t) ? 'video' : /^audio\//.test(t) ? 'audio' : 'file');
const signed = (f) => ({ ...f, k: kind(f.type), url: BASE + '/api/f/' + f.id + '/' + encodeURIComponent(f.name) + '?e=1&s=' + 'x'.repeat(32) });
const ANN = { id: 'a1', title: '5.2 发布了', body: '看附件里的说明', level: 'normal', at: Math.round(Date.now() / 1000) - 60, upd: Math.round(Date.now() / 1000) - 60, files: [signed({ id: 'annpicannpic2345', name: '新界面.png', size: PNG.length, type: 'image/png' }), signed({ id: 'annpdfannpdf2345', name: '更新说明.pdf', size: 123456, type: 'application/pdf' })] };
const PART = 8 * 1024 * 1024;
const server = http.createServer((req, res) => { const chunks = []; req.on('data', (d) => chunks.push(d)); req.on('end', () => { const u = new URL(req.url, 'http://x'), raw = Buffer.concat(chunks);
	let m2;
	if ((m2 = /^\/api\/up\/(\w+)\/(\d+)$/.exec(u.pathname)) && req.method === 'PUT') {
		const t = S.ups[m2[1]]; S.puts++;
		if (!t || S.failPut) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end('{"error":"上传票过期了，重新选一下文件"}'); }
		t.got += raw.length; res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}');
	}
	if ((m2 = /^\/api\/up\/(\w+)\/done$/.exec(u.pathname)) && req.method === 'POST') {
		const t = S.ups[m2[1]];
		if (!t || t.got !== t.size) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":"还没传完"}'); }
		const f = { id: ('f' + (++S.n) + 'abcdefghjkmnpqrs').slice(0, 16), name: t.name, size: t.size, type: t.type }; S.done[f.id] = f; delete S.ups[m2[1]];
		res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(f));
	}
	if (u.pathname.startsWith('/api/f/')) { res.writeHead(200, { 'content-type': /\.png$/.test(decodeURIComponent(u.pathname)) ? 'image/png' : 'application/octet-stream' }); return res.end(/\.png$/.test(decodeURIComponent(u.pathname)) ? PNG : Buffer.from('data')); }
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(raw.toString() || '{}'), m = body.method.replace(/^panel\//, ''), a = body.params || {};
		let r, err;
		if (m === 'chat') {
			if (a.op === 'get') r = { ok: true, msgs: S.msgs.filter((x) => x.s > (a.after || 0)), uu: 0, seq: S.seq, hosted: true, none: false, blocked: false, adminSeen: 0, files: true };
			else if (a.op === 'peek') r = { ok: true, uu: 0, seq: S.seq };
			else if (a.op === 'up') {
				if (a.size > 200 * 1024 * 1024) err = '太大了：最大 200MB';
				else { const id = 'u' + Math.random().toString(36).slice(2, 12); S.ups[id] = { name: a.name, size: a.size, type: a.type, ctx: a.ctx, got: 0 }; r = { ok: true, url: BASE + '/api/up/' + id, part: PART, n: Math.ceil(a.size / PART), id: 'x' }; }
			} else if (a.op === 'send') {
				S.sends.push(a);
				const msg = { s: ++S.seq, f: 'u', t: Date.now(), x: a.text || '', img: null, ...(a.files ? { files: a.files.map((id) => signed(S.done[id])) } : {}) };
				S.msgs.push(msg); r = { ok: true, msg, hosted: true };
			}
		} else if (m === 'svc_info') r = { hosted: true, exp: Date.now() + 30 * 864e5, files: true };
		else if (m === 'feedback_diag') r = { text: '面板版本：5.2.0', hosted: true };
		else if (m === 'feedback') { S.fbs.push(a); r = { ok: true, sent: 'hub', images: 0 }; }
		else if (m === 'notices') r = { now: Math.round(Date.now() / 1000), ann: [ANN], annAt: 0, annFail: false, events: [], fb: [], hosted: true, seen: { t: Date.now() + 864e5, pop: [] }, chat: { at: Math.round(Date.now() / 1000), uu: 0, seq: S.seq } };
		else r = respond(m, a);
		res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(err ? { jsonrpc: '2.0', id: body.id, error: { code: -32000, message: err } } : { jsonrpc: '2.0', id: body.id, result: r })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const overlap = (p, sel) => p.evaluate((sel) => {
	const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent && e.getBoundingClientRect().width);
	const bad = []; for (const e of els) { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1) bad.push('超出：' + (e.id || e.className || e.tagName)); }
	for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { if (els[i].contains(els[j]) || els[j].contains(els[i])) continue; const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect(); if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) bad.push((els[i].id || els[i].className) + '×' + (els[j].id || els[j].className)); }
	return bad.join('；');
}, sel);
const OUT = path.join(__dirname, 'shots');
const DEV = {
	android: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
	small: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
	mac: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const FX = {
	vid: { name: '家里网络录屏.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(9 * 1024 * 1024, 5) }, // 9MB：分 2 块传
	pdf: { name: '路由器日志导出_2026-11-16_很长很长的文件名.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') },
	png: { name: 'pic.png', mimeType: 'image/png', buffer: PNG },
};
const LAY = '.chrow, .chbub, .chbox, .chin > *:not(.hidden), #chAtts .att';
(async () => {
	await new Promise((r) => server.listen(PORT, r)); const b = await chromium.launch();
	for (const [dn, dv] of Object.entries(DEV)) for (const dark of [false, true]) {
		reset(); const sfx = '-' + dn + (dark ? '-dark' : '');
		const c = await b.newContext({ ...dv, colorScheme: dark ? 'dark' : 'light' }); const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
		await p.addInitScript(() => localStorage.setItem('rp_token', 'testtokentesttokentest'));
		await p.goto(BASE + '/panel/?p=chat'); await p.waitForTimeout(1500);
		ok('对话：有「发文件」按钮（托管服务开了文件存储）' + sfx, await p.isVisible('#chAttBtn'));
		await p.setInputFiles('#chAny', [FX.vid, FX.pdf]); await p.waitForTimeout(2500);
		const at = await p.textContent('#chAtts');
		ok('选了两个文件：马上开始传，传好后显示大小和「传好了」' + sfx, (at.match(/传好了/g) || []).length === 2 && /9\.0 MB/.test(at) && S.puts === 3, at + ' puts=' + S.puts);
		ok('附件条排版不重叠、不超出' + sfx, !(await overlap(p, LAY)), await overlap(p, LAY));
		if (dn !== 'mac' || !dark) await p.screenshot({ path: path.join(OUT, 'files-att' + sfx + '.png') });
		// 去掉 PDF
		await p.locator('#chAtts .att', { hasText: '.pdf' }).locator('[data-rm]').click(); await p.waitForTimeout(200);
		ok('点 ×：去掉这个文件' + sfx, (await p.locator('#chAtts .att').count()) === 1);
		await p.fill('#chText', '看一下这个录屏'); await p.click('#chSend'); await p.waitForTimeout(1200);
		const s1 = S.sends[S.sends.length - 1];
		ok('发送：带上文件编号，附件条清空' + sfx, s1 && s1.files && s1.files.length === 1 && S.done[s1.files[0]].name === FX.vid.name && (await p.isHidden('#chAtts')), JSON.stringify(s1));
		await p.waitForTimeout(4500);
		ok('发出去的消息里：视频直接能放，下面有下载' + sfx, (await p.locator('.chrow.me video').count()) === 1 && /家里网络录屏\.mp4 · 9\.0 MB · 下载/.test(await p.textContent('.chrow.me')));
		// 视频正在播放时，每 4 秒拉一次新消息不能把它重置
		const vmark = await p.evaluate(() => { const v = document.querySelector('.chrow.me video'); v.dataset.mark = 'keep'; return !!v; });
		await p.waitForTimeout(4800);
		ok('每 4 秒拉新消息：视频元素保留（正在看的视频不会被打断）' + sfx, vmark && (await p.evaluate(() => !!document.querySelector('.chrow.me video[data-mark=keep]'))));
		// 只发文件
		await p.setInputFiles('#chAny', FX.png); await p.waitForTimeout(1200);
		await p.click('#chSend'); await p.waitForTimeout(1200);
		ok('只发文件不写字：也能发' + sfx, S.sends.length === 2 && S.sends[1].files.length === 1 && !S.sends[1].text);
		// 开发者发来的文件（图片 + PDF）
		S.msgs.push({ s: ++S.seq, f: 'a', t: Date.now(), x: '照这个图改', files: [ANN.files[0], ANN.files[1]] });
		await p.waitForTimeout(4800);
		const other = p.locator('.chrow:not(.me)').last();
		const nat = await other.locator('img').first().evaluate((i) => i.naturalWidth).catch(() => 0);
		ok('开发者发来的图片显示出来、PDF 是能点的下载卡片' + sfx, nat === 480 && /更新说明\.pdf/.test(await other.textContent()) && /&dl=1$/.test(await other.locator('a.ff').getAttribute('href')));
		ok('收到带图片的消息：图片加载完还是停在最下面（不会被输入框挡住）' + sfx, await p.evaluate(() => innerHeight + scrollY >= document.documentElement.scrollHeight - 4));
		ok('最后一条消息没被输入框挡住' + sfx, await p.evaluate(() => { const r = [...document.querySelectorAll('.chrow')].pop().getBoundingClientRect(), b = document.querySelector('.chbox').getBoundingClientRect(); return r.bottom <= b.top + 1; }));
		ok('输入框的提示字一行放得下（不折行、不被挡）' + sfx, await p.evaluate(() => { const t = document.getElementById('chText'); return !t.value && t.scrollHeight <= t.clientHeight + 2; }), await p.evaluate(() => { const t = document.getElementById('chText'); return t.scrollHeight + '/' + t.clientHeight; }));
		ok('输入栏的按钮不重叠' + sfx, !(await overlap(p, '.chin > *:not(.hidden)')), await overlap(p, '.chin > *:not(.hidden)'));
		ok('消息排版不重叠、不超出' + sfx, !(await overlap(p, '.chrow, .chbub > *')) && (await p.evaluate(() => document.documentElement.scrollWidth)) <= dv.viewport.width, await overlap(p, '.chrow, .chbub > *'));
		await p.screenshot({ path: path.join(OUT, 'files-chat' + sfx + '.png') });
		// 上传失败：显示原因，不让发
		S.failPut = true;
		await p.setInputFiles('#chAny', FX.pdf); await p.waitForTimeout(1500);
		ok('上传失败：附件上写清楚原因' + sfx, /没传上：上传票过期了/.test(await p.textContent('#chAtts')));
		const before = S.sends.length;
		await p.fill('#chText', '再试'); await p.click('#chSend'); await p.waitForTimeout(600);
		ok('有文件没传上：不发，提示去掉它' + sfx, S.sends.length === before);
		await p.locator('#chAtts [data-rm]').click(); S.failPut = false;
		// 太大的文件：选的时候就拦住（不会去领上传票）
		await p.evaluate(() => { const dt = new DataTransfer(); const f = new File(['x'], 'big.zip'); Object.defineProperty(f, 'size', { value: 201 * 1024 * 1024 }); dt.items.add(f); const i = document.getElementById('chAny'); i.files = dt.files; i.dispatchEvent(new Event('change')); });
		await p.waitForTimeout(400);
		ok('超过 200MB：直接提示，不传' + sfx, (await p.locator('#chAtts .att').count()) === 0);
		// —— 反馈 ——
		await p.evaluate(() => document.getElementById('mFb').click()); await p.waitForTimeout(1500);
		ok('反馈：托管版有「添加视频或文件」' + sfx, (await p.locator('.modal label', { hasText: '添加视频或文件' }).count()) === 1);
		await p.setInputFiles('.modal [data-any]', FX.png); await p.waitForTimeout(1200);
		await p.fill('.modal [data-tx]', '节点页打不开，附上截图');
		if (dn === 'android' && !dark) await p.screenshot({ path: path.join(OUT, 'files-fb' + sfx + '.png') });
		ok('反馈弹窗排版不超出' + sfx, (await p.evaluate(() => [...document.querySelectorAll('.modal .att, .modal .fbadd')].every((e) => e.getBoundingClientRect().right <= innerWidth + 1))));
		await p.click('.modal [data-go]'); await p.waitForTimeout(1200);
		ok('反馈发出去：带着文件编号' + sfx, S.fbs.length === 1 && S.fbs[0].files.length === 1 && S.done[S.fbs[0].files[0]].name === 'pic.png', JSON.stringify(S.fbs));
		// —— 公告附件 ——
		await p.goto(BASE + '/panel/?p=notice'); await p.waitForTimeout(2500);
		const card = p.locator('#ntList', { hasText: '5.2 发布了' });
		const nt = await p.textContent('#ntList');
		ok('通知：公告里显示附件（图片 + 文件卡片）' + sfx, /更新说明\.pdf/.test(nt) && (await p.locator('#ntList .files img').count()) >= 1, nt.slice(0, 200));
		const st = () => p.evaluate(() => document.querySelector('#ntList .files').closest('.ntit').classList.contains('open'));
		const o0 = await st();
		await p.locator('#ntList .files a.ff').first().evaluate((a) => { a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); });
		await p.waitForTimeout(300);
		const o1 = await st();
		ok('点公告里的文件：不会把公告收起来 / 展开' + sfx, o0 === o1, o0 + '→' + o1);
		ok('通知排版不超出' + sfx, (await p.evaluate(() => document.documentElement.scrollWidth)) <= dv.viewport.width);
		if (dn !== 'mac' || !dark) await p.screenshot({ path: path.join(OUT, 'files-notice' + sfx + '.png') });
		void card;
		ok('没有页面错误' + sfx, !errs.length, errs.join(' | '));
		await c.close();
	}
	await b.close(); server.close();
	const bad = R.filter((x) => x.startsWith('✗'));
	console.log(R.join('\n')); console.log(bad.length ? '失败 ' + bad.length + '/' + R.length : '通过 ' + R.length + '/' + R.length);
	process.exit(bad.length ? 1 : 0);
})();

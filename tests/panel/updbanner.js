// 首页更新提示：更新内容很长时能不能看全、按钮文字会不会折行
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = process.argv[2] || (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const NOTES = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'release-notes.md'), 'utf8').split('## 这个版本的更新')[1].split('## 下载哪个')[0].trim();
const LONG = '• 托管服务到期时间：「系统操作 → 托管服务」能看到到期时间；还剩 3 天以内首页会提醒，点「申请续期」去官网填个表，审核通过自动续上，不用重装、不用换码；有续期码的也能直接在面板里输入\n• 死机原因更好查：内核报错、内存快用完时，看门狗会把当时的情况存下来；路由器意外重启后，断线记录里会写出死机前发现了什么。内核报错也会推送到手机\n• IP 检查更详细：显示中文归属地和运营商、标出是不是机房 IP、能看到有没有 IPv6；右上角加了「完整检测」，一键打开 IPCheck.ing\n• 试用版装完时，终端里会显示试用到哪天\n• 小修：云端监测的说明更准确；新手机登录通知的文字';
const TOK = 'testtoken1234567890abc';
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); console.log((c ? '✓ ' : '✗ ') + n + (note ? '（' + note + '）' : '')); };
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, '');
		let result;
		if (m === 'update_check') result = { cur: '2.0.0', code: 'hosted-ai', latest: '2.0.1', notes: LONG, newer: true, force: false };
		else if (m === 'cloud_info') result = { enabled: false };
		else result = respond(m, body.params || {});
		return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
	await new Promise((r) => server.listen(8161, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[412, 915, false], [360, 780, false], [412, 915, true], [360, 520, false]]) {
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
		await page.addInitScript((t) => { localStorage.setItem('rp_token', t); }, TOK);
		await page.goto('http://localhost:8161/panel/'); await W(5000);
		const tag = `${w}px${dark ? ' 深色' : ''}`;
		const g = await page.evaluate(() => {
			const b = document.getElementById('rUpdGo'), n = document.getElementById('rUpdN'), l = document.getElementById('rUpdLater'), mo = document.getElementById('rUpdMore'), c = document.getElementById('rUpdCur');
			const br = b.getBoundingClientRect(), nr = n.getBoundingClientRect(), lr = l.getBoundingClientRect(), mr = mo.getBoundingClientRect();
			const bcs = getComputedStyle(b), lh = parseFloat(bcs.lineHeight) || 17;
			const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el); const ys = new Set([...r.getClientRects()].map((x) => Math.round(x.top))); return ys.size; };
			const nlh = parseFloat(getComputedStyle(n).lineHeight);
			return { btnLines: Math.round((br.height - parseFloat(bcs.paddingTop) - parseFloat(bcs.paddingBottom)) / lh), btnH: br.height,
				nLines: Math.round(nr.height / nlh), clampOk: n.scrollHeight > n.clientHeight && Math.abs(nr.height / nlh - Math.round(nr.height / nlh)) < 0.05,
				moreVis: mr.width > 0, laterVis: lr.width > 0, sameRow: Math.abs(mr.top - lr.top) < 2, gap: mr.top - nr.bottom,
				curLines: lines(c), curText: c.textContent, inCard: br.right <= document.getElementById('rUpd').getBoundingClientRect().right };
		});
		ok(`${tag}：「一键更新」四个字在一行`, g.btnLines <= 1 && g.inCard, `按钮高 ${Math.round(g.btnH)}px`);
		ok(`${tag}：更新内容只放整整 3 行，没有半截字`, g.nLines === 3 && g.clampOk, `${g.nLines} 行`);
		ok(`${tag}：有「查看完整更新内容」和「以后再说」，在同一行`, g.moreVis && g.laterVis && g.sameRow);
		ok(`${tag}：按钮和上面的文字有间距，不压字`, g.gap >= 2, `间距 ${Math.round(g.gap)}px`);
		ok(`${tag}：副标题两行（版本一行、说明一行），没有单字掉行`, g.curLines === 2 && /\n设置都保留，不会断网$/.test(g.curText), `${g.curLines} 行`);
		await page.locator('#rUpd').screenshot({ path: path.join(__dirname, 'shots', `updbanner-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('#rUpdMore'); await W(800);
		const md = await page.evaluate(() => { const m = document.querySelector('.modal[data-upd] .modalbox'); if (!m) return null; return { txt: m.textContent, sh: m.scrollHeight, ch: m.clientHeight }; });
		ok(`${tag}：点「查看完整更新内容」弹出完整说明（最后一条也在）`, !!md && /新手机登录通知的文字/.test(md.txt) && /一键更新/.test(md.txt));
		if (md && md.sh > md.ch) {
			await page.mouse.move(200, 500); await page.mouse.wheel(0, 400); await W(400);
			const st = await page.evaluate(() => document.querySelector('.modal[data-upd] .modalbox').scrollTop);
			ok(`${tag}：弹窗里能往下滑`, st > 0, 'scrollTop ' + st);
		}
		await page.screenshot({ path: path.join(__dirname, 'shots', `updbanner-modal-${w}${dark ? '-dark' : ''}.png`) });
		const cl = await page.$('.modal[data-upd] [data-v="close"]'); if (cl) { await cl.click(); await W(500); }
		ok(`${tag}：关掉弹窗，首页提示还在`, await page.isVisible('#rUpd'));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(`通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(problems.length ? 1 : 0);
})();

// 设计样图（不是测试）：「我的主页」整页的样子，用面板自己的样式画，截两张图：锁着 / 验证后
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock');
const ROOT = path.join(__dirname, '..', '..', 'src', 'www', 'panel');
const OUT = process.argv[2] || path.join(__dirname, 'shots');
const AV = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb36b"/><stop offset="1" stop-color="#ff6f91"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><circle cx="48" cy="40" r="17" fill="#fff" opacity=".92"/><path d="M16 92c4-20 18-30 32-30s28 10 32 30" fill="#fff" opacity=".92"/></svg>').toString('base64');
const server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { const u = new URL(req.url, 'http://x');
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'), m = body.method.replace(/^panel\//, ''); res.writeHead(200, { 'content-type': 'application/json' });
		const result = m === 'svc_info' ? { hosted: true, hub: 'https://panel.example', exp: Date.now() + 7 * 864e5 } : m === 'hub_accounts' ? [{ uid: 'abcdefghijk2', email: 'xi***@qq.com', name: '小明', avatar: '', at: 1 }] : respond(m, body.params || {});
		return res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })); }
	if (u.pathname.startsWith('/cloud/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"subs":[]}'); }
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f)); }); });
const AVX = AV;
const CSS = `
.mp-avw{position:relative}.mp-cam{position:absolute;right:-4px;bottom:-4px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#0a84ff;color:#fff;box-shadow:0 0 0 3px var(--card)}
.mp-name{display:flex;align-items:center;gap:6px}.mp-pen{width:30px;height:30px;border-radius:50%;border:0;display:grid;place-items:center;background:var(--fill);color:var(--muted)}
.mp-tip{margin:12px 0 0!important;color:var(--muted);font-size:12.5px}
.mp-av.sm{width:38px;height:38px;border-radius:13px;box-shadow:none;flex:none}.mp-letter{display:grid;place-items:center;background:linear-gradient(135deg,#5ac8fa,#34c759)!important;color:#fff;font-weight:700}
.mp-acc{display:flex;align-items:center;gap:10px;min-width:0}
.mp-sub{margin:14px 4px 7px;font-size:13px;font-weight:600;color:var(--muted)}
.mp-lockl{list-style:none;margin:6px 0 16px;padding:0;text-align:left}.mp-lockl li{padding:9px 0;border-top:1px solid var(--line, rgba(127,127,127,.15))}.mp-lockl li:first-child{border-top:0}.mp-lockl b{display:block;font-size:14.5px}.mp-lockl span{color:var(--muted);font-size:12.5px}

.mp-head{display:flex;flex-direction:column;align-items:center;text-align:center;padding:22px 18px 18px}
.mp-av{width:84px;height:84px;border-radius:28px;background:center/cover no-repeat;box-shadow:0 0 0 3px var(--card),0 0 0 5px rgba(52,199,89,.5),0 12px 26px -10px rgba(0,0,0,.35)}
.mp-head h1{margin:14px 0 2px;font-size:24px}
.mp-head .m{color:var(--muted);font-size:13.5px}
.mp-badges{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:12px}
.mp-kv{display:grid;grid-template-columns:auto 1fr;gap:0;margin:0}
.mp-kv dt,.mp-kv dd{padding:11px 2px;border-top:1px solid var(--line, rgba(127,127,127,.15));margin:0;font-size:14.5px}
.mp-kv dt{color:var(--muted);padding-right:14px;white-space:nowrap}
.mp-kv dd{text-align:right;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-kv dt:first-of-type,.mp-kv dt:first-of-type+dd{border-top:0}
.mp-ok{color:#34c759}.mp-warn{color:#ff9f0a}
.mp-lock{position:relative;overflow:hidden;text-align:center;padding:22px 18px}
.mp-lock .ic{width:52px;height:52px;margin:0 auto 10px;border-radius:18px;display:grid;place-items:center;background:rgba(255,159,10,.14);color:#ff9f0a}
.mp-lock h3{margin:0 0 6px;font-size:17px}
.mp-lock p{margin:0 auto 14px;max-width:30em;color:var(--muted);font-size:13.5px;line-height:1.6}
.mp-lock .ghost{display:flex;flex-direction:column;gap:8px;margin:2px 0 16px;filter:blur(5px);opacity:.55;pointer-events:none}
.mp-lock .ghost i{display:block;height:14px;border-radius:7px;background:var(--fill)}
.mp-sec-h{display:flex;align-items:center;gap:8px}
.mp-sec-h .pill{background:rgba(52,199,89,.14);color:#34c759}
.mp-tl{list-style:none;margin:0;padding:0}
.mp-tl li{display:grid;grid-template-columns:34px 1fr;gap:10px;padding:10px 0;border-top:1px solid var(--line, rgba(127,127,127,.15))}
.mp-tl li:first-child{border-top:0;padding-top:2px}
.mp-tl .d{width:34px;height:34px;border-radius:12px;display:grid;place-items:center;font-size:16px;background:var(--fill)}
.mp-tl b{display:block;font-size:14.5px}.mp-tl span{display:block;color:var(--muted);font-size:12.5px;margin-top:2px}
.mp-fb{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:11px 0;border-top:1px solid var(--line, rgba(127,127,127,.15))}
.mp-fb:first-child{border-top:0;padding-top:2px}.mp-fb b{display:block;font-size:14.5px}.mp-fb span{color:var(--muted);font-size:12.5px}
.mp-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.mp-note{color:var(--muted);font-size:12.5px;text-align:center;margin:12px 0 0!important}
`;
const ok = 'background:rgba(52,199,89,.14);color:#34c759';
const pen = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
const head = (av) => `<section class="hero mp-head"><div class="mp-avw"><div class="mp-av" style="background-image:url('${av}')"></div><span class="mp-cam"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span></div>
<h1 class="mp-name">小明<button class="mp-pen" aria-label="改名字">${pen}</button></h1><div class="m">xi***@qq.com · 2026 年 11 月 14 日注册</div>
<div class="mp-badges"><span class="pill">托管版</span><span class="pill" style="${ok}">● 路由器在线</span></div><p class="mp-tip">点头像换头像，点名字旁边的笔改名字；改完官网和对话里也跟着变</p></section>`;
const svc = `<div class="sectitle"><b>托管服务</b><span class="muted" style="font-size:13px">从「系统操作」搬过来了</span></div><section class="card"><dl class="mp-kv">
<dt>到期时间</dt><dd class="mp-warn">2026/11/22（还剩 7 天）</dd><dt>专属网址</dt><dd>ab3cd4ef.yrlove520.com</dd><dt>开通时间</dt><dd>2026/11/14 21:02 · 试用</dd></dl>
<div class="mp-acts"><button class="btn">输入续期码</button><button class="btn primary">申请续期</button></div></section>`;
const router = `<div class="sectitle"><b>这台路由器</b></div><section class="card"><dl class="mp-kv">
<dt>名字</dt><dd>客厅 Kwrt</dd><dt>型号</dt><dd>Xiaomi AX3000T</dd><dt>上次在线</dt><dd class="mp-ok">刚刚</dd></dl>
<p class="mp-note" style="text-align:left">系统、版本这些详细信息在「系统操作 → 系统信息」</p></section>`;
const accs = `<div class="sectitle"><b>绑定的账号</b><span class="muted" style="font-size:13px">从「系统操作」搬过来了</span></div><section class="card">
<div class="mp-fb"><div class="mp-acc"><span class="mp-av sm" style="background-image:url('${AVX}')"></span><div><b>小明</b><span>xi***@qq.com · 11/14 绑定</span></div></div><span class="pill" style="${ok}">主账号</span></div>
<div class="mp-fb"><div class="mp-acc"><span class="mp-av sm mp-letter">B</span><div><b>bo***</b><span>bo***@163.com · 11/15 绑定</span></div></div><button class="btn sm">解绑</button></div>
<button class="btn" style="width:100%;margin-top:8px">再绑定一个账号（配对码）</button></section>`;
const lockedTitle = `<div class="sectitle"><b>敏感信息</b><span class="muted" style="font-size:13px">🔒 要验证</span></div>`;
const locked = lockedTitle + `<section class="card mp-lock">
<div class="ic"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>
<h3>验证一下才能看</h3>
<ul class="mp-lockl"><li><b>联系方式</b><span>完整邮箱、续期时留的联系方式</span></li><li><b>登录着的设备</b><span>哪些手机电脑登录着官网账号，能退出</span></li><li><b>登录记录</b><span>什么时候、在哪个城市登录，成功还是失败</span></li></ul>
<button class="btn primary" style="width:100%">发验证码到 xi***@qq.com</button><p class="mp-note">验证一次，这台手机 10 分钟内不用再输</p></section>`;
const unlocked = `<div class="sectitle mp-sec-h"><b>敏感信息</b><span class="pill">已验证 · 9:52 后自动锁上</span></div>
<div class="mp-sub">联系方式</div><section class="card"><dl class="mp-kv"><dt>完整邮箱</dt><dd>xiaoming2026@qq.com <span class="mp-ok" style="font-size:12px">已验证</span></dd><dt>续期联系方式</dt><dd>微信 xm_2026</dd></dl></section>
<div class="mp-sub">登录着的设备 · 2 台</div>
<section class="card"><div class="mp-fb"><div><b>安卓手机 · Edge</b><span>台北 · 11/15 18:40 登录</span></div><span class="pill" style="${ok}">就是这台</span></div>
<div class="mp-fb"><div><b>Windows 电脑 · Chrome</b><span>台北 · 11/14 21:05 登录 · 3 小时前用过</span></div><button class="btn sm">退出</button></div>
<button class="btn sm" style="width:100%;margin-top:6px">退出其他所有设备</button></section>
<div class="mp-sub">登录记录 · 最近 30 天</div>
<section class="card"><ul class="mp-tl">
<li><div class="d">✓</div><div><b>登录成功</b><span>11/15 18:40 · 台北 · 安卓手机</span></div></li>
<li><div class="d" style="color:#ff3b30">✕</div><div><b>密码错了</b><span>11/15 18:39 · 台北 · 安卓手机</span></div></li>
<li><div class="d">✓</div><div><b>注册账号</b><span>11/14 21:05 · 台北 · Windows 电脑</span></div></li></ul></section>
<button class="btn" style="width:100%;margin-top:10px">现在锁上</button>`;
const rest = `<div class="sectitle"><b>操作记录</b><span class="muted" style="font-size:13px">这台路由器</span></div>
<section class="card"><ul class="mp-tl">
<li><div class="d">🔑</div><div><b>拿了一个登录码</b><span>11/15 14:31 · 新手机第一次打开面板</span></div></li>
<li><div class="d">🔗</div><div><b>绑定到账号 bo***</b><span>11/15 10:20 · 用配对码</span></div></li>
<li><div class="d">🔗</div><div><b>绑定到账号 小明</b><span>11/14 21:08 · 用配对码</span></div></li>
<li><div class="d">✨</div><div><b>开通托管服务</b><span>11/14 21:02 · 试用 7 天</span></div></li></ul>
<button class="btn sm" style="width:100%;margin-top:8px">看更多</button></section>
<section class="card list" style="margin-top:14px;padding:4px 12px"><button class="file" style="background:none;margin:4px 0"><div><b>我的反馈</b><span class="muted">2 条 · 1 条已解决</span></div><span class="muted">›</span></button></section>`;
(async () => {
	await new Promise((r) => server.listen(8182, r));
	const b = await chromium.launch();
	for (const [dark, w, h] of [[false, 390, 844], [true, 390, 844]]) {
		const c = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
		const p = await c.newPage();
		await p.addInitScript(() => localStorage.setItem('rp_token', 'testtoken1234567890abc'));
		await p.goto('http://localhost:8182/panel/?p=myfb'); await p.waitForTimeout(1500);
		for (const [n, sec] of [['locked', locked], ['open', unlocked]]) {
			await p.evaluate(({ css, html }) => {
				let st = document.getElementById('mpcss'); if (!st) { st = document.createElement('style'); st.id = 'mpcss'; document.head.appendChild(st); } st.textContent = css;
				document.getElementById('p-myfb').innerHTML = html;
				const t = document.querySelector('#title, .toptitle, .top h1, .title'); if (t) t.textContent = '我的主页';
				for (const e of document.querySelectorAll('body *')) { const cs = getComputedStyle(e); if (cs.position === 'fixed' && e.getBoundingClientRect().top > innerHeight * 0.6) e.style.display = 'none'; }
				scrollTo(0, 0);
			}, { css: CSS, html: head(AV) + svc + router + accs + (n === 'locked' ? locked : unlocked) + rest });
			await p.waitForTimeout(500);
			const H = await p.evaluate(() => document.documentElement.scrollHeight);
			for (let i = 0, y = 0; y < H - 40; i++, y += h - 60) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(250); await p.screenshot({ path: path.join(OUT, `mock-${n}-${dark ? 'dark' : 'light'}-${i}.png`) }); }
		}
		await c.close();
	}
	await b.close(); server.close();
})();

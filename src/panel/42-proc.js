/* =====================================================================
   进程
   ===================================================================== */
let prData = null, prSort = 'cpu', prKt = false;
async function loadProc() {
	prData = await P('procs');
	setStatus(true, '在线');
	renderProc();
}
const kb = (k) => k >= 1024 ? (k / 1024).toFixed(k >= 10240 ? 0 : 1) + ' MB' : k + ' KB';
function renderProc() {
	if (!prData) return;
	const kw = $('prFilter').value.trim().toLowerCase();
	let l = prData.list.filter((x) => (prKt || x.mem > 0 || !/^\[/.test(x.cmd)) && (!kw || (x.name + ' ' + x.cmd + ' ' + x.pid).toLowerCase().includes(kw)));
	l.sort(prSort === 'mem' ? (a, b) => b.mem - a.mem : prSort === 'pid' ? (a, b) => a.pid - b.pid : (a, b) => b.cpu - a.cpu || b.mem - a.mem);
	const used = prData.list.reduce((s, x) => s + x.mem, 0);
	$('prMem').textContent = prData.avail ? '内存已用 ' + kb(prData.total - prData.avail) + ' / ' + kb(prData.total) : '进程共占 ' + kb(used);
	$('prCount').textContent = l.length + ' 个';
	$('prList').innerHTML = l.length ? l.slice(0, 200).map((x) => `<button class="file prrow" data-pid="${x.pid}"><div style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(x.name)}${x.sys ? ' <span class="muted" style="font-weight:500;font-size:12px">系统</span>' : ''}</b><span class="sub ell" style="display:block;font-size:12px;font-family:var(--mono)">${esc(x.pid)} · ${esc(x.cmd)}</span></div>
		<div style="text-align:right;flex:none"><span class="pill ${x.cpu >= 20 ? 'red' : x.cpu >= 5 ? 'blue' : ''}">${x.cpu}%</span><div class="muted" style="margin-top:4px;font-variant-numeric:tabular-nums;font-size:12.5px">${kb(x.mem)}</div></div></button>`).join('') : '<div class="empty">没有符合的进程</div>';
}
$('prFilter').addEventListener('input', renderProc);
$$('#prSort .chip').forEach((b) => (b.onclick = () => {
	if (b.dataset.s === 'kt') { prKt = !prKt; b.classList.toggle('on', prKt); }
	else { prSort = b.dataset.s; $$('#prSort .chip:not([data-s=kt])').forEach((x) => x.classList.toggle('on', x === b)); }
	renderProc();
}));
$('prList').addEventListener('click', async (e) => {
	const b = e.target.closest('[data-pid]'); if (!b) return;
	const x = prData.list.find((y) => y.pid === +b.dataset.pid); if (!x) return;
	const st = { R: '运行中', S: '休眠', D: '等待磁盘', Z: '僵尸', T: '已暂停', I: '空闲' }[x.st] || x.st;
	const rows = [['进程编号', x.pid], ['父进程', x.ppid], ['状态', st], ['CPU', x.cpu + '%'], ['内存', kb(x.mem)]];
	const v = await modal(`<h3>${esc(x.name)}</h3>${rows.map(([k, y]) => `<div class="kv"><span>${esc(k)}</span><span>${esc(y)}</span></div>`).join('')}
		<pre class="out" style="margin-top:10px;max-height:30vh">${esc(x.cmd)}</pre>
		${x.sys ? '<div class="notice" style="margin-top:10px">这是系统或面板自己要用的进程，结束它会断网或让面板失联，所以不能在这里结束。</div>' : ''}
		<div class="btngrid three" style="margin:14px 0 0"><button class="btn" data-v="false">关闭</button><button class="btn danger" data-v="term" ${x.sys ? 'disabled' : ''}>结束</button><button class="btn danger" data-v="kill" ${x.sys ? 'disabled' : ''}>强制结束</button></div>`);
	if (v !== 'term' && v !== 'kill') return;
	if (!(await confirmBox('结束「' + x.name + '」？', (v === 'kill' ? '强制结束不给它收尾的机会。' : '') + '如果它是某个服务的一部分，服务可能会自动重新启动它。', v === 'kill' ? '强制结束' : '结束', true))) return;
	await busy(null, async () => { const r = await P('kill', { pid: x.pid, force: v === 'kill' }); toast('已结束「' + r.name + '」'); refresh(true); });
});

/* ---------- 首页：实时流量（每 2 秒）、今日流量、在线设备 ---------- */
const MH = { rx: [], tx: [], n: 60, statsAt: 0, timer: 0 };
function bps(v) {
	if (v == null) return '—';
	const b = v * 8;
	if (b >= 1e9) return (b / 1e9).toFixed(2) + '<small>Gbps</small>';
	if (b >= 1e6) return (b / 1e6).toFixed(b >= 1e8 ? 0 : 1) + '<small>Mbps</small>';
	return (b / 1e3).toFixed(b >= 1e5 ? 0 : 1) + '<small>Kbps</small>';
}
function mOff(t) { $('mOffBox').classList.toggle('hidden', !t); $('mOff').classList.toggle('hidden', !t); $('mOff').textContent = t || ''; }
function offText(t) { if (page === 'home') $('hDesc').textContent = t; else if (page === 'main') mOff(t); }
function mChart() {
	const W = 300, H = 110, all = MH.rx.concat(MH.tx).filter((x) => x != null);
	const max = Math.max(125000, ...all) * 1.15; // 至少 1 Mbps 的刻度，曲线不会贴顶
	// 点还没攒满时铺满整个宽度（刚打开就是一条完整的曲线）
	const pts = (arr) => arr.map((v, i) => [(W * i) / Math.max(arr.length - 1, 1), H - 4 - ((v || 0) / max) * (H - 10)]);
	const line = (p) => p.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('');
	const area = (p) => p.length ? line(p) + `L${p[p.length - 1][0].toFixed(1)} ${H}L${p[0][0].toFixed(1)} ${H}Z` : '';
	const r = pts(MH.rx), t = pts(MH.tx);
	$('mChart').innerHTML = `<defs><linearGradient id="mgR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--brand)" stop-opacity=".32"/><stop offset="1" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs>
		<line x1="0" y1="${(H / 2).toFixed(0)}" x2="${W}" y2="${(H / 2).toFixed(0)}" stroke="var(--line)" stroke-width=".6" vector-effect="non-scaling-stroke"/>
		${r.length > 1 ? `<path d="${area(r)}" fill="url(#mgR)"/><path d="${line(r)}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` : ''}
		${t.length > 1 ? `<path d="${line(t)}" fill="none" class="upl" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` : ''}`;
}
async function mLive() {
	const r = await P('live', {}, 6000);
	if (r.rx == null) { $('mRx').innerHTML = $('mRx').innerHTML === '—' ? '…' : $('mRx').innerHTML; return; }
	MH.rx.push(r.rx); MH.tx.push(r.tx);
	if (MH.rx.length > MH.n) { MH.rx.shift(); MH.tx.shift(); }
	$('mRx').innerHTML = bps(r.rx); $('mTx').innerHTML = bps(r.tx);
	mChart();
	try { sessionStorage.setItem('rp_mh', JSON.stringify({ rx: MH.rx, tx: MH.tx, at: Date.now() })); } catch (e) {}
}
const DEV_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="11" rx="1.5"/><path d="M8 19.5h8"/></svg>';
function mStatsRender(r) {
	const t = r.today || {}, d = r.devices || {};
	$('mDl').textContent = '↓ ' + B(t.dl || 0); $('mUl').textContent = '↑ ' + B(t.ul || 0);
	const top = t.top || [];
	$('mTopT').textContent = top.length ? '今天用得最多（下行 + 上行合计）' : (t.counting ? '今天还没有设备用流量' : '要 OpenClash 在运行才统计得到每台设备的流量');
	// 同一台手机连 2.4G 和 5G 时可能各用一个随机地址，名字一样：后面的标上「另一个地址」，免得看成两台
	const seen = {};
	$('mTop').innerHTML = top.map((x) => { const n = x.name || x.id, dup = seen[n]; seen[n] = 1;
		return `<div class="mrow" title="${esc(x.id)}">${DEV_SVG}<span>${esc(n)}${dup ? '<small class="muted">（另一个地址）</small>' : ''}</span><em>${esc(B(x.dl + x.ul))}</em></div>`; }).join('');
	$('mOn').textContent = d.online ?? '—'; $('mWifi').textContent = d.wifi ?? '—'; $('mWired').textContent = d.wired ?? '—'; $('mAll').textContent = d.total ?? '—';
}
async function mStats() {
	const r = await P('home_stats', {}, 15000);
	MH.statsAt = Date.now();
	store.set('rp_mstats', JSON.stringify(r));
	mStatsRender(r);
}
async function loadMain() {
	svcRender(); if (!SVC || Date.now() - (SVC._at || 0) > 3600e3) svcLoad(false).then(() => { if (SVC) SVC._at = Date.now(); });
	// 先把上次的数据画出来
	if (!MH.rx.length) { try { const h = JSON.parse(sessionStorage.getItem('rp_mh') || 'null'); if (h && Date.now() - h.at < 60e3) { MH.rx = h.rx; MH.tx = h.tx; mChart(); } } catch (e) {} }
	if (!MH.statsAt) { try { const o = JSON.parse(store.get('rp_mstats') || 'null'); if (o) mStatsRender(o); } catch (e) {} }
	const tasks = [mLive().then(() => { mOff(''); setStatus(true, '在线'); })];
	if (Date.now() - MH.statsAt > 30e3) tasks.push(mStats());
	await Promise.all(tasks);
}
// 首页在前台时每 2 秒刷新网速，每 30 秒刷新今日流量和设备
function mTick() {
	clearTimeout(MH.timer);
	MH.timer = setTimeout(async () => {
		if (page === 'main' && !document.hidden && !LK.on && !document.querySelector('.modal') && $('needcode').classList.contains('hidden')) {
			try { await mLive(); mOff(''); if (Date.now() - MH.statsAt > 30e3) await mStats(); } catch (e) { if (!(e instanceof NeedCodeError)) refresh(true); }
		}
		mTick();
	}, 2000);
}
$$('[data-mgo]').forEach((c) => { c.onclick = () => go(c.dataset.mgo); c.onkeydown = (e) => { if (e.key === 'Enter') go(c.dataset.mgo); }; });

const LOAD = { main: loadMain, traf: loadTraf, speed: loadSpeed, cbk: loadBk, home: loadHome, proxy: loadProxy, subs: loadSubs, cfg: loadCfg, ow: loadOw, rules: loadRules, set: loadSet, log: loadLog, dev: loadDev, black: loadBlack, conn: loadConn, wd: loadWd, auto: () => { renderAuto(); AU.at = 0; return loadAuto(); }, term: async () => initTerm(), files: loadFiles, more: async () => { hubBtn(); moreBtns(); svcRender(); svcLoad(false); try { cinfo = await P('cloud_info'); store.set('rp_cinfo', JSON.stringify(cinfo)); } catch (e) {} hubBtn(); try { store.set('rp_ai', (await P('ckey_info')).ai ? '1' : '0'); } catch (e) {} moreBtns(); }, slog: loadSlog, proc: loadProc, luci: loadLuci, myfb: loadMyFb, notice: loadNotice, chat: loadChat };

/* ---------- 登录 ---------- */
function parseToken(s) {
	s = (s || '').trim();
	const m = s.match(/\/cgi-bin\/mcp\/([A-Za-z0-9]+)/);
	if (m) return m[1];
	return /^[a-z0-9]{16,}$/i.test(s) ? s : null;
}
function lgErr(t) { $('lgErr').textContent = t || ''; $('lgErr').classList.toggle('hidden', !t); }
async function doLogin() {
	const t = parseToken($('lgInput').value);
	lgErr('');
	if (!t) return lgErr('没认出密钥，请粘贴完整的登录地址');
	const btn = $('lgBtn');
	btn.disabled = true; btn.textContent = '连接中…';
	token = t;
	try {
		const r = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'panel', version: '3' } }, 15000);
		store.set('rp_token', t);
		$('about').textContent = '路由器面板 ' + (r.serverInfo?.version || '');
		start();
	} catch (e) {
		// 托管版：密钥是对的，但这台手机还要输登录码
		if (e instanceof NeedCodeError) { store.set('rp_token', t); start(); return; }
		token = null;
		lgErr(e instanceof AuthError ? '密钥不对，请检查地址是否完整' : e.message);
	} finally { btn.disabled = false; btn.textContent = '连接'; }
}
$('lgBtn').onclick = doLogin;
$('lgInput').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
function logout(msg) {
	store.del('rp_token'); store.del('cmcp_token'); store.del('rp_lock');
	token = null;
	$('app').classList.add('hidden');
	$('needcode').classList.add('hidden');
	$('login').classList.remove('hidden');
	$('lgInput').value = '';
	lgErr(msg || '');
}
function lgBackground() {
	const c = $('lgbg'); if (!c || !c.getContext) return;
	const g = c.getContext('2d'); if (!g) return;
	const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
	let w = 0, h = 0; const t0 = performance.now();
	function size() { const dpr = Math.min(window.devicePixelRatio || 1, 2); w = c.clientWidth; h = c.clientHeight; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); }
	function draw(now) {
		const t = (now - t0) / 1000, dark = document.documentElement.classList.contains('dark');
		g.clearRect(0, 0, w, h);
		const cols = Math.max(28, Math.round(w / 16)), rows = 26, cx = w * .5, horizon = h * .30;
		for (let r = 0; r < rows; r++) {
			const z = r / (rows - 1), depth = .35 + z * 1.25, y0 = horizon + Math.pow(z, 1.35) * h * .82;
			for (let k = 0; k < cols; k++) {
				const u = k / (cols - 1) - .5, x = cx + u * w * 1.6 * depth;
				const y = y0 + Math.sin(u * 7 + t * .7 + z * 4) * Math.cos(z * 5 - t * .45) * 28 * depth + Math.sin(u * 3 - t * .3) * 14 * depth;
				if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue;
				const a = (.08 + .30 * z) * (.55 + .45 * Math.sin(u * 9 + z * 6 + t * .8));
				if (a <= .01) continue;
				g.fillStyle = dark ? `rgba(255,255,255,${a.toFixed(3)})` : `rgba(40,44,60,${a.toFixed(3)})`;
				g.beginPath(); g.arc(x, y, .6 + 1.9 * z * depth * .6, 0, 6.283); g.fill();
			}
		}
	}
	function loop(now) {
		const lg = $('login');
		if (!lg || lg.classList.contains('hidden') || document.hidden) { setTimeout(() => requestAnimationFrame(loop), 800); return; }
		if (c.clientWidth !== w || c.clientHeight !== h) size();
		draw(now);
		if (!still) requestAnimationFrame(loop); else setTimeout(() => requestAnimationFrame(loop), 1500);
	}
	size(); requestAnimationFrame(loop);
}

/* ---------- 托管版：输登录码 ---------- */
function loginDevName() {
	const u = navigator.userAgent || '';
	let os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? '安卓手机' : /Windows/.test(u) ? 'Windows 电脑' : /Mac OS/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux 电脑' : '设备';
	const m = /Android [\d.]+; ([^;)]+?)(?: Build|\))/.exec(u);
	if (m && !/^(K|wv)$/.test(m[1].trim())) os += ' ' + m[1].trim();
	const b = /RouterPanel/.test(u) ? 'App' : /EdgA?\//.test(u) ? 'Edge' : /SamsungBrowser/.test(u) ? '三星浏览器' : /MicroMessenger/.test(u) ? '微信' : /HuaweiBrowser/.test(u) ? '华为浏览器' : /MiuiBrowser|XiaoMi/.test(u) ? '小米浏览器' : /Firefox|FxiOS/.test(u) ? 'Firefox' : /CriOS|Chrome\//.test(u) ? 'Chrome' : /Safari/.test(u) ? 'Safari' : '浏览器';
	return (os + ' · ' + b).slice(0, 40);
}
function lcErr(t) { $('lcErr').textContent = t || ''; $('lcErr').classList.toggle('hidden', !t); }
function needCode(data) {
	const w = $('needcode');
	if (!token) return; // 已经退出了（退出前发出去的请求晚回来）
	const hub = (data && /^https:\/\/[a-z0-9.-]+$/i.test(data.hub || '')) ? data.hub : 'https://yrlove520.com';
	$('lcHub').href = hub + '/app';
	$('lcHubName').textContent = hub.replace(/^https:\/\//, '');
	// 刚装好（链接里带着配对码，10 分钟内）：先去官网绑定账号
	let pr = null; try { pr = JSON.parse(localStorage.getItem('rp_pair') || 'null'); } catch (e) {}
	const pairOk = pr && pr.code && pr.exp > Date.now();
	if (pr && !pairOk) store.del('rp_pair');
	$('lcPair').classList.toggle('hidden', !pairOk);
	$('lcSteps').classList.toggle('hidden', !!pairOk);
	if (pairOk) $('lcPairBtn').href = hub + '/app?pair=' + encodeURIComponent(pr.code);
	if (!w.classList.contains('hidden')) return;
	w.classList.remove('hidden');
	lcErr('');
	if (pendCode) { $('lcInput').value = pendCode; pendCode = ''; setTimeout(ncGo, 50); }
	else setTimeout(() => { try { $('lcInput').focus(); } catch (e) {} }, 300);
}
async function ncGo() {
	const code = $('lcInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
	lcErr('');
	if (code.length !== 8) return lcErr('登录码是 8 位字母和数字');
	const btn = $('lcBtn'); btn.disabled = true; btn.textContent = '核对中…';
	try {
		const r = await rpcOnce('panel/device_approve', { code, name: loginDevName() }, 30000);
		store.set('rp_dev', r.dev); store.del('rp_pair');
		btn.textContent = '✓ 登录成功';
		setTimeout(() => location.reload(), 400);
	} catch (e) {
		lcErr(e instanceof AuthError ? '登录地址里的密钥不对，点下面「换一个登录地址」重新粘贴' : e.message);
		btn.disabled = false; btn.textContent = '确定';
	}
}
$('lcBtn').onclick = ncGo;
window.addEventListener('hashchange', () => { const m = /^#code=([A-Za-z0-9]{8})$/.exec(location.hash); if (!m) return; history.replaceState(null, '', location.pathname + location.search); if (!$('needcode').classList.contains('hidden')) { $('lcInput').value = m[1].toUpperCase(); ncGo(); } else pendCode = m[1].toUpperCase(); });
$('lcInput').onkeydown = (e) => { if (e.key === 'Enter') ncGo(); };
$('lcOut').onclick = (e) => { e.preventDefault(); logout(''); };

let ticker, wdTick = 0;
function start() {
	$('login').classList.add('hidden');
	$('app').classList.remove('hidden');
	document.body.classList.add('app');
	// 开了面板锁：先锁上，解锁后才加载面板（锁着的时候背后什么都没有，也不请求路由器）
	if (lkCfg()?.on && !LK.started) {
		if (lkFresh()) LK.last = lkSess.get(); // 刚才还在用（比如下拉刷新）：不用再解锁
		else { LK.after = () => { LK.started = true; start(); }; lockNow(); if (LK.on) return; }
	}
	LK.started = true;
	topH();
	// 先用上次读到的菜单，把新装的插件放进侧边栏（这样上次停在插件页面也能直接打开）
	try { navExtra(JSON.parse(store.get('rp_menu') || '[]'), false); renderNav(); } catch (e) {}
	setTimeout(loadMenu, 2500);
	const qp = new URLSearchParams(location.search).get('p');
	// 新打开面板默认是首页；同一个标签页里刷新（下拉刷新）还停在原来那页
	let sp = null; try { sp = sessionStorage.getItem('rp_page'); } catch (e) {}
	const p = validPage(qp) ? qp : validPage(sp) ? sp : 'main';
	if (qp) try { history.replaceState(null, '', location.pathname); } catch (e) {}
	page = '';
	// 先用上次的数据把首页画出来，路由器回来后再刷新
	try {
		const o = JSON.parse(store.get('rp_ov') || 'null');
		if (o) { delete o.speed; if (!validPage(p) || p === 'home') renderOv(o, true); else renderSub(o); setStatus(false, '连接中…'); }
	} catch (e) {}
	go(p);
	if (validPage(p) && p !== 'home') setTimeout(() => P('overview').then((o) => { store.set('rp_ov', JSON.stringify(o)); renderSub(o); }).catch(() => {}), 1200);
	mTick();
	clearInterval(ticker);
	ticker = setInterval(() => {
		if (document.hidden || LK.on || document.querySelector('.modal')) return;
		if (((page === 'home' || page === 'conn') && !(lowRouter && ++lowTick % 2)) || (page === 'wd' && ++wdTick % 3 === 0)) refresh(true);
		if (page === 'log' && $('logAuto').checked) refresh(true);
		if (page === 'slog' && $('slAuto').checked) refresh(true);
		if (page === 'home') ncAgo();
		if (page === 'proc' && ++wdTick % 2 === 0) refresh(true);
		if (page === 'traf' && ++wdTick % 15 === 0) refresh(true);
		if (page === 'myfb' && ++wdTick % 15 === 0) refresh(true);
		updMaybe();
	}, 4000);
	if (!$('about').textContent) setTimeout(() =>
		rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'panel', version: '3' } }).then((r) => ($('about').textContent = '路由器面板 ' + (r.serverInfo?.version || ''))).catch(() => {}), 3000);
	watchJobs();
	updAt = Date.now(); setTimeout(() => updCheck(false), 4000);
	// 反馈的新进展：打开 3 秒后查一次，开着的时候每分钟查一次（路由器那边缓存 45 秒）
	setTimeout(fbCheck, 3000);
	clearInterval(fbTimer); fbTimer = setInterval(() => { if (Date.now() - fbAt > 55000) fbCheck(); if (Date.now() - NT.at > 60000) ntCheck(); }, 15000);
	// 通知：打开 6 秒后查一次（铃铛上的数字、重要公告弹一次），之后每分钟一次
	setTimeout(ntCheck, 6000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && token && !LK.on) { refresh(true); loadMenu(); updMaybe(); if (Date.now() - fbAt > 20000) setTimeout(fbCheck, 1500); if (Date.now() - NT.at > 20000) setTimeout(ntCheck, 2500); } });

// 安卓：返回键要连续按两次才退出（第一次先关弹窗 / 侧边栏，或提示「再按一次返回键退出」）
// 做法：在历史记录里多垫一层；按返回时先「吃掉」这一层。用户点过页面才垫（安卓 Chrome 不认没有点击过的历史记录）
(() => {
	if (!/Android/i.test(navigator.userAgent)) return;
	let armed = false;
	const arm = () => {
		if (armed || !token) return;
		try { history.pushState({ cmcpBack: 1 }, '', location.href); armed = true; } catch (e) {}
	};
	['pointerup', 'keydown', 'touchend'].forEach((t) => addEventListener(t, arm, true));
	addEventListener('popstate', () => {
		if (!armed) return;
		armed = false;
		if (document.body.classList.contains('locked')) { lkMsg('再按一次返回键退出'); return; }
		const m = document.querySelector('.modal:not(.closing)');
		// 下一次点页面时再垫回去
		if (m) { if (!m.dataset.lock) m.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
		if ($('side').classList.contains('open')) { sideOpen(false); return; }
		toast('再按一次返回键退出');
	});
})();
/* ---------- 面板锁（指纹 / 密码，5 分钟没操作自动锁） ----------
   锁的是这台手机上的面板界面：别人拿到你的手机也打不开。密码只存加盐哈希；指纹由手机系统验证，面板只拿到「验证通过」。 */
const LOCK_MIN = 5, LK_WIPE = 20;
const LK = { on: false, entry: '', last: Date.now(), el: null, fpBusy: false, forgot: 0 };
function lkCfg() { try { return JSON.parse(store.get('rp_lock') || 'null'); } catch (e) { return null; } }
const lkSave = (c) => (c ? store.set('rp_lock', JSON.stringify(c)) : store.del('rp_lock'));
// 同一次使用中（没关掉 App）下拉刷新不用重新解锁：解锁后把「最近一次操作时间」记在会话存储里，
// 关掉 App 就清空；一锁上马上删掉，所以锁着时刷新也绕不过去
const lkSess = {
	get() { try { return +sessionStorage.getItem('rp_lkact') || 0; } catch (e) { return 0; } },
	set(t) { try { sessionStorage.setItem('rp_lkact', String(t)); } catch (e) {} },
	del() { try { sessionStorage.removeItem('rp_lkact'); } catch (e) {} },
};
const lkFresh = () => { const t = lkSess.get(); return t > 0 && Date.now() - t < LOCK_MIN * 60e3 && Date.now() >= t; };
const lkB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const lkBin = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const lkRnd = (n) => crypto.getRandomValues(new Uint8Array(n));
// 密码用 PBKDF2（12 万次）加盐哈希，拿到存储内容也很难反推
async function lkHash(pin, salt) {
	const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
	return lkB64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 120000 }, k, 256));
}
async function fpAvail() { try { return !!(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())); } catch (e) { return false; } }
async function fpCreate() {
	const c = await navigator.credentials.create({ publicKey: {
		challenge: lkRnd(32), rp: { name: '路由器面板' }, user: { id: lkRnd(16), name: 'router-panel', displayName: '路由器面板' },
		pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
		authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000, attestation: 'none' } });
	return lkB64(c.rawId);
}
async function fpCheck(id) {
	const r = await navigator.credentials.get({ publicKey: { challenge: lkRnd(32), allowCredentials: [{ type: 'public-key', id: lkBin(id), transports: ['internal'] }], userVerification: 'required', timeout: 60000 } });
	// 认证数据第 33 个字节的 UV 位 = 系统确实验证过指纹 / 锁屏密码
	const ad = r && r.response && r.response.authenticatorData ? new Uint8Array(r.response.authenticatorData) : null;
	return !!(ad && ad.length > 32 && ad[32] & 4);
}
const LK_SVG = {
	lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',
	fp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.3 5.6A8.5 8.5 0 0 1 20.5 12v1"/><path d="M3.5 9.5a8.6 8.6 0 0 1 1.2-2.4M3.5 12v1.5"/><path d="M7 16.5V12a5 5 0 0 1 9.4-2.4M17 12v2.5a10 10 0 0 1-1 4.3"/><path d="M12 12v3a9 9 0 0 1-2.2 5.8M14.5 21c.6-.9 1-1.9 1.3-3"/><path d="M9.5 12a2.5 2.5 0 0 1 5 0v1.5"/></svg>',
	del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h10.5a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/></svg>',
};
function lkBuild() {
	if (LK.el) return LK.el;
	const d = document.createElement('div');
	d.id = 'lock'; d.className = 'lock hidden'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', '面板已锁定');
	const AB = ['', '', 'ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PQRS', 'TUV', 'WXYZ'];
	const logo = document.querySelector('.toplogo');
	d.innerHTML = `<div class="lkwall" aria-hidden="true"></div>
		<div class="lkhead"><div class="logo lklogo" aria-hidden="true">${logo ? logo.innerHTML : ''}</div><div class="lkt">输入面板密码</div><div class="lkmsg" id="lkMsg"></div><div class="lkdots" id="lkDots"></div></div>
		<div class="lkpad" id="lkPad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}" aria-label="${n}"><b>${n}</b><small>${AB[n]}</small></button>`).join('')}<button class="gh" data-k="fp" id="lkFp" aria-label="指纹解锁">${LK_SVG.fp}</button><button data-k="0" aria-label="0"><b>0</b><small></small></button><span></span></div>
		<div class="lkbar"><button id="lkForgot">忘记密码</button><button id="lkDel" data-k="del">删除</button></div>`;
	document.body.appendChild(d);
	d.querySelector('#lkPad').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) lkKey(b.dataset.k); });
	d.querySelector('#lkForgot').onclick = lkForgot;
	d.querySelector('#lkDel').onclick = () => lkKey('del');
	d.addEventListener('contextmenu', (e) => e.preventDefault());
	addEventListener('keydown', (e) => { if (!LK.on) return; if (/^\d$/.test(e.key)) lkKey(e.key); else if (e.key === 'Backspace') lkKey('del'); }, true);
	return (LK.el = d);
}
const lkHint = () => (lkCfg()?.cred ? '也可以用指纹解锁' : '');
function lkMsg(t, err) { const m = $('lkMsg'); if (m) { m.textContent = t; m.classList.toggle('err', !!err); } }
function lkDots() {
	const c = lkCfg();
	$('lkDots').innerHTML = Array.from({ length: c?.len || 4 }, (_, i) => `<i class="${i < LK.entry.length ? 'on' : ''}"></i>`).join('');
	$('lkDel').style.visibility = LK.entry.length ? '' : 'hidden';
}

function lkWait() {
	const c = lkCfg(), left = c && c.until ? Math.ceil((c.until - Date.now()) / 1000) : 0, pad = $('lkPad');
	clearTimeout(LK.wt);
	if (left > 0) { pad.classList.add('dis'); lkMsg(`错误次数太多，${left >= 120 ? Math.ceil(left / 60) + ' 分钟' : left + ' 秒'}后再试`, true); LK.wt = setTimeout(() => { if (LK.on && !lkWait()) lkMsg(lkHint()); }, 1000); return true; }
	pad.classList.remove('dis');
	return false;
}
function lockNow() {
	const c = lkCfg(); if (!c || !c.on) return;
	lkBuild();
	lkSess.del();
	LK.on = true; LK.entry = ''; LK.forgot = 0;
	document.body.classList.add('locked');
	LK.el.classList.remove('hidden');
	$('lkFp').style.visibility = c.cred ? '' : 'hidden';
	$('lkForgot').textContent = '忘记密码'; $('lkForgot').classList.remove('warn');
	try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch (e) {}
	lkDots();
	if (!lkWait()) lkMsg(lkHint());
	if (c.cred && !document.hidden) setTimeout(lkFp, 350);
	lockLabel();
}
function lkUnlock(quiet) {
	LK.on = false; LK.entry = ''; LK.last = Date.now();
	if (quiet) lkSess.del(); else lkSess.set(LK.last);
	const c = lkCfg(); if (c && (c.fails || c.until || c.total || c.n)) { c.fails = 0; c.total = 0; c.n = 0; delete c.until; lkSave(c); }
	if (LK.el) LK.el.classList.add('hidden');
	document.body.classList.remove('locked');
	if (quiet) { LK.after = null; return; }
	// 冷启动时面板是解锁后才加载的
	if (LK.after) { const f = LK.after; LK.after = null; return f(); }
	try { refresh(true); } catch (e) {}
}
async function lkKey(k) {
	if (!LK.on) return;
	const c = lkCfg(); if (!c || !c.on) return lkUnlock();
	if (k === 'fp') return lkFp();
	if (lkWait()) return;
	if (k === 'del') { LK.entry = LK.entry.slice(0, -1); return lkDots(); }
	if (LK.entry.length >= c.len || LK.checking) return;
	LK.entry += k; lkDots();
	if (LK.entry.length < c.len) return;
	LK.checking = true;
	const ok = (await lkHash(LK.entry, c.salt)) === c.hash;
	LK.checking = false;
	if (ok) return lkUnlock();
	c.fails = (c.fails || 0) + 1; c.total = (c.total || 0) + 1;
	// 累计输错 20 次：直接断开这台手机（清掉密钥），要重新粘贴登录地址
	if (c.total >= LK_WIPE) { lkSave(null); lkUnlock(true); return logout('密码输错太多次，已断开这台手机，请重新粘贴登录地址'); }
	// 每错 5 次要等，等的时间翻倍：30 秒、1 分钟、2 分钟……最长 15 分钟
	if (c.fails >= 5) { c.fails = 0; c.n = (c.n || 0) + 1; c.until = Date.now() + Math.min(30000 * 2 ** (c.n - 1), 900000); }
	lkSave(c);
	const d = $('lkDots'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
	try { navigator.vibrate && navigator.vibrate(60); } catch (e) {}
	setTimeout(() => { LK.entry = ''; lkDots(); }, 380);
	if (!lkWait()) lkMsg(LK_WIPE - c.total <= 5 ? `密码不对，再错 ${LK_WIPE - c.total} 次会断开这台手机` : `密码不对，还能试 ${5 - c.fails} 次`, true);
}
async function lkFp() {
	const c = lkCfg(); if (!LK.on || !c?.cred || LK.fpBusy) return;
	LK.fpBusy = true;
	try { if (await fpCheck(c.cred)) lkUnlock(); else if (!lkWait()) lkMsg('指纹没通过，请再试或输入密码', true); }
	catch (e) { if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError' && !lkWait()) lkMsg('指纹暂时用不了，请输入密码', true); }
	finally { LK.fpBusy = false; }
}
// 忘记密码：只能断开这台手机（之后要重新粘贴登录地址），所以拿到手机的人也绕不过去
function lkForgot() {
	const b = $('lkForgot');
	if (Date.now() - LK.forgot > 5000) {
		LK.forgot = Date.now(); b.textContent = '再点一次：断开这台手机并关闭面板锁'; b.classList.add('warn');
		lkMsg('断开后要重新粘贴登录地址才能用，路由器设置不受影响');
		setTimeout(() => { if (LK.on && Date.now() - LK.forgot >= 5000) { b.textContent = '忘记密码'; b.classList.remove('warn'); if (!lkWait()) lkMsg(lkHint()); } }, 5100);
		return;
	}
	lkSave(null); lkUnlock(); logout('面板锁已关闭，请重新粘贴登录地址');
}
// 5 分钟没操作自动锁（切到后台再回来也算）
['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach((t) => addEventListener(t, () => {
	if (LK.on) return;
	LK.last = Date.now();
	if (lkCfg()?.on && LK.last - lkSess.get() > 5000) lkSess.set(LK.last);
}, { capture: true, passive: true }));
const lkIdle = () => !LK.on && token && lkCfg()?.on && Date.now() - LK.last > LOCK_MIN * 60e3;
setInterval(() => { if (lkIdle()) lockNow(); }, 10000);
document.addEventListener('visibilitychange', () => {
	if (document.hidden) return;
	if (lkIdle()) lockNow();
	else if (LK.on && lkCfg()?.cred) setTimeout(lkFp, 350);
});
function lockLabel() { const c = lkCfg(), el = $('lockState'); if (el) el.textContent = c?.on ? (c.cred ? '已开启 · 指纹 + 密码' : '已开启 · 密码') : '已关闭'; }
lockLabel();
async function pinBox(title, sub) {
	const v = await modal(`<h3>${esc(title)}</h3><p class="muted" style="margin:4px 0 12px;line-height:1.6">${esc(sub)}</p>
		<input class="input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="4–6 位数字" style="font-size:22px;letter-spacing:6px;text-align:center">
		<div class="muted" data-e style="color:var(--danger);font-size:13px;min-height:18px;margin-top:6px"></div>
		<div class="btngrid" style="margin:8px 0 0"><button class="btn" data-v="false">取消</button><button class="btn primary" data-ok>确定</button></div>`, (m, close) => {
		const i = m.querySelector('input'), e = m.querySelector('[data-e]');
		setTimeout(() => i.focus(), 120);
		const go = () => { if (!/^\d{4,6}$/.test(i.value)) { e.textContent = '请输入 4–6 位数字'; return; } close(i.value); };
		i.oninput = () => { i.value = i.value.replace(/\D/g, '').slice(0, 6); e.textContent = ''; };
		i.onkeydown = (ev) => { if (ev.key === 'Enter') go(); };
		m.querySelector('[data-ok]').onclick = go;
	});
	return typeof v === 'string' ? v : null;
}
async function lkCheckOld() {
	const c = lkCfg(); if (!c?.on) return true;
	const v = await pinBox('输入当前密码', '确认是你本人在操作。'); if (v == null) return false;
	if ((await lkHash(v, c.salt)) === c.hash) return true;
	toast('密码不对'); return false;
}
async function lkSetPin(old) {
	const a = await pinBox(old ? '设置新密码' : '设置解锁密码', '4–6 位数字。忘了只能断开这台手机、重新粘贴登录地址。'); if (a == null) return false;
	const b = await pinBox('再输入一次', '确认刚才的密码。'); if (b == null) return false;
	if (a !== b) { toast('两次输入的不一样，没有保存'); return false; }
	const salt = lkB64(lkRnd(16));
	lkSave(Object.assign({}, old || {}, { on: 1, salt, hash: await lkHash(a, salt), len: a.length, fails: 0, until: 0 }));
	return true;
}
async function fpTurnOn() {
	try { const id = await fpCreate(); const c = lkCfg(); c.cred = id; lkSave(c); toast('已开启指纹解锁'); return true; }
	catch (e) { toast(e && e.name === 'NotAllowedError' ? '已取消，没有开启指纹' : '这台手机暂时开不了指纹解锁'); return false; }
}
async function lockSettings() {
	const c = lkCfg(), fpOk = await fpAvail();
	if (!c?.on) {
		const go = await confirmBox('开启面板锁', `打开面板时要先输入密码${fpOk ? '或验证指纹' : ''}，${LOCK_MIN} 分钟没操作也会自动锁上。\n只锁这台手机上的面板，不影响路由器和其他设备。`, '设置密码');
		if (!go || !(await lkSetPin())) return lockLabel();
		if (fpOk && (await confirmBox('也用指纹解锁？', '开启后解锁时会弹出手机的指纹验证，指纹不行时仍可以输入密码。', '开启指纹'))) await fpTurnOn();
		toast('面板锁已开启'); LK.last = Date.now(); return lockLabel();
	}
	const v = await modal(`<h3>面板锁</h3>
		<div class="kv"><span>状态</span><span>已开启</span></div>
		<div class="kv"><span>解锁密码</span><span>${c.len} 位数字</span></div>
		<div class="kv"><span>指纹解锁</span><span>${c.cred ? '已开启' : fpOk ? '未开启' : '这台手机不支持'}</span></div>
		<div class="kv"><span>自动锁定</span><span>${LOCK_MIN} 分钟没操作</span></div>
		<div class="btngrid" style="margin:14px 0 0"><button class="btn blue" data-v="now">立即锁定</button><button class="btn" data-v="pin">修改密码</button>
		${c.cred ? '<button class="btn" data-v="fpoff">关闭指纹</button>' : fpOk ? '<button class="btn" data-v="fpon">开启指纹</button>' : ''}<button class="btn danger" data-v="off">关闭面板锁</button></div>
		<button class="btn" data-v="close" style="width:100%;margin-top:10px">完成</button>`);
	if (v === 'now') return lockNow();
	if (v === 'pin') { if ((await lkCheckOld()) && (await lkSetPin(lkCfg()))) toast('密码已修改'); }
	if (v === 'fpon' && (await lkCheckOld())) await fpTurnOn();
	if (v === 'fpoff') { const n = lkCfg(); delete n.cred; lkSave(n); toast('已关闭指纹解锁'); }
	if (v === 'off' && (await lkCheckOld())) { lkSave(null); toast('面板锁已关闭'); }
	lockLabel();
}

try { lgBackground(); } catch (e) {}
try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {}); } catch (e) {}
token ? start() : logout();
})();

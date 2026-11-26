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

const LOAD = { xpage: loadXpage, split: loadSplit, fwup: loadFwup, svcsw: loadSvcsw, oaf: loadOaf, wisp: loadWisp, lanset: loadLanset, wan: loadWan, store: loadStore, pf: loadPf, mon: loadMon, ndiag: loadNdiag, main: loadMain, traf: loadTraf, speed: loadSpeed, cbk: loadBk, home: loadHome, proxy: loadProxy, subs: loadSubs, cfg: loadCfg, ow: loadOw, rules: loadRules, set: loadSet, log: loadLog, dev: loadDev, wifi: loadWifi, black: loadBlack, conn: loadConn, wd: loadWd, auto: () => { renderAuto(); AU.at = 0; loadSched(); return loadAuto(); }, term: async () => initTerm(), files: loadFiles, more: async () => { hubBtn(); moreBtns(); svcRender(); svcLoad(false); try { cinfo = await P('cloud_info'); store.set('rp_cinfo', JSON.stringify(cinfo)); } catch (e) {} hubBtn(); moreBtns(); }, slog: loadSlog, proc: loadProc, apps: loadApps, luci: loadLuci, lfull: loadLfull, myfb: loadMyFb, me: loadMe, notice: loadNotice, chat: loadChat };

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
	// 6.0：登录地址只用来换这台手机自己的钥匙（换完手机上就不留登录密钥了）；开了「登录要输路由器密码」的要再输一次
	const pwi = $('lgPw'), pw = pwi && !$('lgPwRow').classList.contains('hidden') ? pwi.value : null;
	store.del('rp_dev'); passClear(); store.set('rp_token', t); token = t;
	try { sessionStorage.setItem('rp_fresh', '1'); } catch (e) {}
	try {
		await devFromToken(pw);
		const r = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'panel', version: '3' } }, 15000);
		$('about').textContent = '路由器面板 ' + (r.serverInfo?.version || '');
		$('lgPwRow').classList.add('hidden'); if (pwi) pwi.value = '';
		start();
	} catch (e) {
		// 托管版：密钥是对的，但这台手机还要输登录码
		if (e instanceof NeedCodeError) { start(); return; }
		// 第一次出现密码框：框下面的说明已经讲清楚了，不再弹红色错误；输了密码还要求输，才是真的错
		if (e instanceof NeedPwError) { $('lgPwRow').classList.remove('hidden'); setTimeout(() => pwi && pwi.focus(), 60); lgErr(pw ? e.message : ''); if (!pw) return; }
		if (!(e instanceof NeedPwError)) { forgetToken(); token = null; }
		lgErr(e instanceof AuthError ? '密钥不对，请检查地址是否完整' : e.message);
	} finally { btn.disabled = false; btn.textContent = '连接'; }
}
$('lgBtn').onclick = doLogin;
$('lgInput').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
$('lgPw').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
function logout(msg) {
	store.del('rp_token'); store.del('cmcp_token'); store.del('rp_lock'); store.del('rp_dev'); store.del('rp_host'); passClear(); luciForget();
	token = null;
	$('app').classList.add('hidden');
	$('needcode').classList.add('hidden');
	// 家里局域网打开的：输路由器后台密码
	if (LAN_HOME) { $('login').classList.add('hidden'); $('lanlogin').classList.remove('hidden'); llErr(msg || ''); setTimeout(() => $('llPw').focus(), 300); return; }
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
function needCode(data, why, force) {
	const w = $('needcode');
	if (!token && !force) return; // 已经退出了（退出前发出去的请求晚回来）
	const hub = (data && /^https:\/\/[a-z0-9.-]+$/i.test(data.hub || '')) ? data.hub : (store.get('rp_hub') || 'https://yrlove520.com');
	if (data && data.hub) store.set('rp_hub', hub);
	$('lcHub').href = hub + '/app';
	$('lcOpening').classList.add('hidden'); $('lcBody').classList.remove('hidden'); $('lcTitle').textContent = '从官网打开面板';
	$('lcWhy').textContent = why && !/还没登录/.test(why) ? why : ''; $('lcWhy').classList.toggle('hidden', !why || /还没登录/.test(why));
	if (!w.classList.contains('hidden')) return;
	$('app').classList.add('hidden'); $('login').classList.add('hidden');
	w.classList.remove('hidden');
	lcErr('');
	if (pendCode) { $('lcEmerg').open = true; $('lcInput').value = pendCode; pendCode = ''; setTimeout(ncGo, 50); }
}
// 官网「打开面板」带来的票：换这台手机的钥匙
// 6.0 第 82 项：家里局域网登录（原版后台给的票，或者路由器后台密码）→ 换这台设备自己的钥匙
function llErr(m) { const e = $('llErr'); e.textContent = m; e.classList.toggle('hidden', !m); }
async function lanOpen(p) {
	const btn = $('llBtn'); btn.disabled = true; btn.textContent = p.ticket ? '正在打开…' : '核对中…';
	$('login').classList.add('hidden'); $('app').classList.add('hidden'); $('lanlogin').classList.remove('hidden');
	let msg = '';
	try {
		const r = await fetch('../cgi-bin/mcp/lan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, cache: 'no-store',
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: p.ticket ? 'panel/lan_open' : 'panel/lan_pw', params: { ...p, name: loginDevName() }, client: 'panel' }) });
		if (r.status === 404) msg = '路由器上的面板版本太旧，先升级';
		else {
			const j = await r.json();
			if (j.error) msg = j.error.message;
			else {
				store.set('rp_dev', j.result.dev); token = j.result.dev; forgetToken(); passClear(); store.del('rp_role');
				$('lanlogin').classList.add('hidden'); $('llPw').value = ''; start(); return;
			}
		}
	} catch (e) { msg = '连不上路由器：确认手机连着家里的 Wi-Fi'; }
	finally { btn.disabled = false; btn.textContent = '打开面板'; }
	llErr(msg); $('llPw').focus();
}
$('llBtn').onclick = () => { const pw = $('llPw').value; if (!pw) return llErr('输一下路由器后台密码'); lanOpen({ pw }); };
$('llPw').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('llBtn').click(); });
async function openTicket(t) {
	const w = $('needcode');
	$('login').classList.add('hidden'); $('app').classList.add('hidden');
	w.classList.remove('hidden'); $('lcTitle').textContent = '正在打开面板'; $('lcOpening').classList.remove('hidden'); $('lcBody').classList.add('hidden');
	let msg = '';
	try {
		const r = await fetch('../cgi-bin/mcp/open', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, cache: 'no-store',
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/open_login', params: { ticket: t, name: loginDevName(), old: store.get('rp_dev') || undefined }, client: 'panel' }) });
		if (r.status === 404) msg = '这台路由器的面板版本太旧，还不支持从官网直接打开：先在路由器上升级到 5.2';
		else if (r.status === 530 || r.status === 502 || r.status === 503) msg = '连不上路由器：可能断电或家里断网了，过一会儿再从官网打开';
		else {
			const j = await r.json();
			if (j.error) msg = j.error.message;
			else {
				store.set('rp_dev', j.result.dev); store.set('rp_host', '1'); token = j.result.dev; forgetToken(); passClear(); store.del('rp_role'); // 6.0 起路由器不再给登录密钥
				w.classList.add('hidden'); start(); return;
			}
		}
	} catch (e) { msg = '连不上路由器，检查一下手机网络，再从官网打开一次'; }
	needCode(null, msg, true);
}
// 我是主账号还是子账号、能用哪些功能（侧边栏按这个显示）
async function loadRole() {
	try {
		const r = await P('whoami');
		const n = { role: r.role === 'sub' ? 'sub' : 'owner', perms: r.perms || [], uid: r.uid || '', emerg: !!r.emerg, lanin: !!r.lanin, ed: r.ed || null };
		const ch = JSON.stringify(n) !== JSON.stringify(ME_ROLE);
		ME_ROLE = n; store.set('rp_role', JSON.stringify(n));
		if (r.hub) store.set('rp_hub', r.hub);
		if (r.hosted != null) store.set('rp_host', r.hosted ? '1' : '0');
		if (r.login_pw != null) store.set('rp_lpw', r.login_pw ? '1' : '0');
		// 路由器上这台手机有面板锁、手机上的设置却没了（被清掉）：按路由器的补回来（第 13 项）
		if (r.lock && r.lock.on && !(lkCfg() || {}).on) lkSave({ on: 1, salt: r.lock.salt, len: r.lock.len });
		if (r.ai != null) store.set('rp_ai', r.ai ? '1' : '0');
		if (r.svc_off) svcOffPop(r.svc_off === 'exp' ? '托管服务到期了，续期以后才能用：在官网「我的路由器」申请续期，或者在这里输入续期码' : '这台路由器的托管服务停用了：请联系提供服务的人');
		setTimeout(edNoaiHint, 1500); // 旧的托管纯面板版：提示一次能换
		if (r.lan !== undefined) { if (r.lan) store.set('rp_lan', JSON.stringify(r.lan)); else store.del('rp_lan'); } // 家里局域网的面板地址（第 82 项）
		if (ch && page === 'me') loadMe(true).catch(() => {}); // 版本、身份变了：我的主页跟着刷新
		if (ch) { renderNav(); if (!canPage(page)) go('main'); else if (page === 'dev' && devices.length) loadDev().catch(() => {}); renderQuick($('qGrid')); $('qHead').classList.toggle('hidden', !quickShown()); $('qCard').classList.toggle('hidden', !quickShown()); } // 设备卡片上能不能改名、换图标看权限；自定义快捷操作里没权限的页面去掉
	} catch (e) {}
}
async function ncGo() {
	const code = $('lcInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
	lcErr('');
	if (code.length !== 8) return lcErr('登录码是 8 位字母和数字');
	const btn = $('lcBtn'); btn.disabled = true; btn.textContent = '核对中…';
	try {
		// 6.0：手机上不再存登录密钥，登录码走「打开面板」的入口
		const j = await rpcPost('cgi-bin/mcp/open', { jsonrpc: '2.0', id: ++seq, method: 'panel/device_approve', params: { code, name: loginDevName() }, client: 'panel' }, 30000, false);
		if (j.error) throw new Error(j.error.message);
		store.set('rp_dev', j.result.dev); store.set('rp_host', '1'); forgetToken(); passClear(); store.del('rp_role');
		btn.textContent = '✓ 登录成功';
		setTimeout(() => location.reload(), 400);
	} catch (e) {
		lcErr(e instanceof AuthError ? '这台路由器的面板版本太旧，先在路由器上升级' : e.message);
		btn.disabled = false; btn.textContent = '确定';
	}
}
$('lcBtn').onclick = ncGo;
window.addEventListener('hashchange', () => { const m = /^#code=([A-Za-z0-9]{8})$/.exec(location.hash); if (!m) return; history.replaceState(history.state, '', location.pathname + location.search); if (!$('needcode').classList.contains('hidden')) { $('lcInput').value = m[1].toUpperCase(); ncGo(); } else pendCode = m[1].toUpperCase(); });
$('lcInput').onkeydown = (e) => { if (e.key === 'Enter') ncGo(); };
$('lcOut').onclick = (e) => { e.preventDefault(); logout(''); };

let ticker, wdTick = 0, aiTick = 0;
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
	// 我是谁（托管版：身份和权限；所有版本：装的是不是 AI 版，敏感信息里要不要放连接器地址）
	setTimeout(loadRole, 400);
	const usp = new URLSearchParams(location.search), qp = usp.get('p');
	// 6.0 第 2 项：推送里点了「暂停它上网」（?p=dev&ask=pause&mac=…）：打开设备页后弹出暂停设置，自己选多久才生效
	if (usp.get('ask') === 'pause' && /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(usp.get('mac') || '')) setTimeout(() => askPause(usp.get('mac')), 1600);
	// 6.0 第 11 项：推送里点了「AI 想要…」：打开面板马上弹出「允许 / 拒绝」；平时打开 2 秒后查一次
	setTimeout(() => aiCheck(true), usp.get('ask') === 'ai' ? 900 : 2500);
	// 6.0 第 16 项：推送「快到停网时间」点进来问延长多久；「换了 MAC」点进来把计划也用到新地址；开了通知的手机报一下是哪个账号的
	const askMac = usp.get('mac') || '', MRE = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/;
	if (usp.get('ask') === 'ext' && MRE.test(askMac)) setTimeout(() => askExt(askMac, +usp.get('min') || 0), 1600);
	if (usp.get('ask') === 'plancopy' && MRE.test(askMac)) setTimeout(() => askPlanCopy(askMac, usp.get('src') || ''), 1600);
	setTimeout(pushTag, 6000);
	// 6.0 第 17 项：推送「有家人认领了设备」点进来：设备页上方就是等确认的列表
	if (usp.get('ask') === 'claims') setTimeout(() => { if (page !== 'dev') go('dev'); }, 900);
	// 6.0 第 14 项：改完 Wi-Fi 手机断开、重新连上：接着问「保留」还是「改回去」
	setTimeout(wfResume, 700);
	// 6.0 第 60 项：推送「你遇到的问题修好了」点进来：打开检查更新
	if (usp.get('ask') === 'update') setTimeout(() => updSheet(false), 1400);
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
	go(p, 'boot');
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
		if (++aiTick % 3 === 0) aiCheck(false);
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
document.addEventListener('visibilitychange', () => { if (!document.hidden && token && !LK.on) { setTimeout(() => aiCheck(true), 800); refresh(true); loadMenu(); updMaybe(); if (Date.now() - fbAt > 20000) setTimeout(fbCheck, 1500); if (Date.now() - NT.at > 20000) setTimeout(ntCheck, 2500); } });

// 返回键、侧滑返回、电脑后退键（6.0 第 68 项，记步骤的办法见 30-core 的 HS）：
// 先收键盘（安卓）→ 关最上面的弹窗（关不掉的弹窗不动）→ 关侧边栏 → 回上一页（有没保存的修改先问）。
// 安卓在第一页：先提示「再按一次返回键退出」，再按才退出（App 里是回到 App 首页）
(() => {
	const isTyping = (ae) => ae && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|file|color)$/.test(ae.type)) || ae.isContentEditable);
	// 安卓在第一页时多垫一步，用来提示「再按一次退出」；用户点过页面才垫
	const arm = () => { if (!ANDROID || !HS.ready || !token || LK.on) return; const s = hsS(); if (s.root && hsAct()) hsSet({ p: page, guard: 1 }, true); };
	['pointerup', 'keydown', 'touchend'].forEach((t) => addEventListener(t, arm, true));
	new MutationObserver((ms) => ms.forEach((r) => {
		r.addedNodes.forEach((n) => { if (n.classList && n.classList.contains('modal') && !n.classList.contains('closing')) hsOpen(n); });
		r.removedNodes.forEach((n) => { if (n.classList && n.classList.contains('modal')) hsShut(n); });
	})).observe(document.body, { childList: true });
	addEventListener('popstate', (e) => {
		if (HS.skip > 0) { HS.skip--; HS.cur = hsS(); return; }
		const from = HS.cur, s = hsS(); HS.cur = s;
		if (!HS.ready) return;
		if (!s.cmcp) return; // 不是面板记的（比如原版页面里自己的跳转）
		const back = () => hsSet(from, true); // 这次返回不算数：把刚退掉的那一步补回去
		if (LK.on || document.body.classList.contains('locked')) { back(); if (ANDROID) lkMsg('再按一次返回键退出'); return; }
		if (ANDROID && isTyping(document.activeElement)) { document.activeElement.blur(); back(); return; }
		const ms = $$('.modal:not(.closing)'), m = ms[ms.length - 1];
		if (m) {
			if (m.dataset.lock) { back(); return; }
			m.dataset.hgone = 1; // 这一步已经退掉了，关的时候不用再退
			m.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			if (m.isConnected && !m.classList.contains('closing')) { m.dataset.hgone = ''; back(); } // 点背景关不掉的（比如正在保存）
			return;
		}
		if ($('side').classList.contains('open')) { sideOpen(false); return; }
		if (s.m || s.side) { if (s.p && s.p !== page) go(s.p, 'pop'); else history.back(); return; } // 退到一个已经关掉的弹窗那一步：再退一步
		if (s.p && s.p !== page) { go(s.p, 'pop'); return; }
		if (s.root && from.guard && ANDROID) toast(IN_APP ? '再按一次返回键回到 App 首页' : '再按一次返回键退出');
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
// 6.0 第 82 项：家里局域网 http 地址（:906）上浏览器不给用 crypto.subtle：用下面这个纯 JS 的 PBKDF2-SHA256，算出来的一样
const LK_K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const LK_H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
function lkBlock(H, W) {
	for (let i = 16; i < 64; i++) { const a = W[i - 15], b = W[i - 2]; W[i] = (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + W[i - 16] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)) + W[i - 7] | 0; }
	let [a, b, c, d, e, f, g, h] = H;
	for (let i = 0; i < 64; i++) {
		const t1 = h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + LK_K[i] + W[i] | 0;
		const t2 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c)) | 0;
		h = g; g = f; f = e; e = d + t1 | 0; d = c; c = b; b = a; a = t1 + t2 | 0;
	}
	return [H[0] + a | 0, H[1] + b | 0, H[2] + c | 0, H[3] + d | 0, H[4] + e | 0, H[5] + f | 0, H[6] + g | 0, H[7] + h | 0];
}
// 整段 SHA-256（起点 H，前面已经处理了 pre 字节）
function lkSha(bytes, H = LK_H0, pre = 0) {
	const n = bytes.length, len = (n + 9 + 63) & ~63, buf = new Uint8Array(len); buf.set(bytes); buf[n] = 0x80;
	const bits = (n + pre) * 8; buf[len - 4] = bits >>> 24; buf[len - 3] = bits >>> 16; buf[len - 2] = bits >>> 8; buf[len - 1] = bits; buf[len - 5] = Math.floor(bits / 2 ** 32);
	const W = new Int32Array(64);
	for (let o = 0; o < len; o += 64) { for (let i = 0; i < 16; i++) W[i] = buf[o + i * 4] << 24 | buf[o + i * 4 + 1] << 16 | buf[o + i * 4 + 2] << 8 | buf[o + i * 4 + 3]; H = lkBlock(H, W); }
	return H;
}
const lkWords = (H) => { const o = new Uint8Array(32); H.forEach((x, i) => { o[i * 4] = x >>> 24; o[i * 4 + 1] = x >>> 16; o[i * 4 + 2] = x >>> 8; o[i * 4 + 3] = x; }); return o; };
function lkPbkdf2(pw, salt, iter) {
	let key = pw.length > 64 ? lkWords(lkSha(pw)) : pw;
	const ip = new Uint8Array(64).fill(0x36), op = new Uint8Array(64).fill(0x5c);
	key.forEach((x, i) => { ip[i] ^= x; op[i] ^= x; });
	const W = new Int32Array(64), blk = (b) => { for (let i = 0; i < 16; i++) W[i] = b[i * 4] << 24 | b[i * 4 + 1] << 16 | b[i * 4 + 2] << 8 | b[i * 4 + 3]; return W; };
	const Hi = lkBlock(LK_H0, blk(ip)), Ho = lkBlock(LK_H0, blk(op));
	const mac = (m) => lkWords(lkSha(lkWords(lkSha(m, Hi, 64)), Ho, 64));
	const s1 = new Uint8Array(salt.length + 4); s1.set(salt); s1[salt.length + 3] = 1;
	let u = mac(s1); const t = u.slice();
	for (let i = 1; i < iter; i++) { u = mac(u); for (let j = 0; j < 32; j++) t[j] ^= u[j]; }
	return t;
}
async function lkHash(pin, salt) {
	if (!(window.crypto && crypto.subtle)) return lkB64(lkPbkdf2(new TextEncoder().encode(pin), new TextEncoder().encode(salt), 120000));
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
function lockNow(why) {
	const c = lkCfg(); if (!c || !c.on) return;
	lkBuild();
	lkSess.del();
	// 6.0 第 13 项：锁上时作废这台手机手上的通行证，之后要指纹或密码才能再向路由器领
	if (PS.pass) { const pd = P('pass_drop').catch(() => {}); pd.finally(passClear); } else passClear();
	LK.on = true; LK.entry = ''; LK.forgot = 0;
	document.body.classList.add('locked');
	LK.el.classList.remove('hidden');
	$('lkFp').style.visibility = c.cred && !LK.needPin && !c.hash ? '' : 'hidden';
	$('lkForgot').textContent = '忘记密码'; $('lkForgot').classList.remove('warn');
	try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch (e) {}
	lkDots();
	if (!lkWait()) lkMsg(why || lkHint());
	if (c.cred && !LK.needPin && !c.hash && !document.hidden) setTimeout(lkFp, 350);
	lockLabel();
}
// 路由器说要输面板锁密码（今天还没输过、或者密码不对）：锁屏只能输密码，不能用指纹
function lkNeedPin(err) {
	if (!token) return; // 已经退出了（退出前发出去的请求晚回来）
	const d = err.data || {};
	let c = lkCfg();
	// 手机上的面板锁设置被清掉了，但路由器上这台手机有锁：按路由器给的盐和位数重新建起来
	if ((!c || !c.on || c.hash) && d.salt && d.len) { c = Object.assign({}, c || {}, { on: 1, salt: d.salt, len: d.len }); delete c.hash; lkSave(c); }
	if (!c || !c.on) return;
	LK.needPin = true;
	if (LK.on) { if (!LK.checking) lkMsg(err.message, !!d.bad); $('lkFp').style.visibility = 'hidden'; return; }
	if (!LK.after) LK.after = () => { try { refresh(true); } catch (e) {} };
	lockNow(err.message);
}
function lkUnlock(quiet) {
	LK.on = false; LK.entry = ''; LK.last = Date.now(); LK.needPin = false;
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
	const proof = await lkHash(LK.entry, c.salt);
	if (!c.hash) {
		// 6.0 第 13 项：密码由路由器核对（错几次要等、错太多让这台手机退出，都由路由器管）
		let msg = '', ok = false;
		try { PS.lkp = proof; passClear(); await passGet(); ok = true; }
		catch (e) { msg = e instanceof LockError ? e.message : e instanceof NeedCodeError || e instanceof AuthError ? '' : (e.message || '连不上路由器，暂时解不了锁'); }
		LK.checking = false;
		if (ok) return lkUnlock();
		if (!LK.on) return; // 被路由器要求退出了
		const d2 = $('lkDots'); d2.classList.remove('shake'); void d2.offsetWidth; d2.classList.add('shake');
		try { navigator.vibrate && navigator.vibrate(60); } catch (e) {}
		setTimeout(() => { LK.entry = ''; lkDots(); }, 380);
		return lkMsg(msg || '密码不对', true);
	}
	// 6.0 以前设的面板锁（密码摘要存在手机上）：这次在手机上核对，对了就交给路由器保管，手机上不再留摘要
	const ok = proof === c.hash;
	LK.checking = false;
	if (ok) {
		try { await P('lock_set', { on: 1, salt: c.salt, len: c.len, lkp: proof, fp: !!c.cred }); const n = lkCfg(); delete n.hash; delete n.fails; delete n.total; delete n.n; delete n.until; lkSave(n); } catch (e) {}
		return lkUnlock();
	}
	c.fails = (c.fails || 0) + 1; c.total = (c.total || 0) + 1;
	// 累计输错 20 次：直接断开这台手机（清掉密钥），要重新粘贴登录地址
	if (c.total >= LK_WIPE) { lkSave(null); lkUnlock(true); return logout('密码输错太多次，这台手机已退出，请重新登录'); }
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
	try {
		if (!(await fpCheck(c.cred))) { if (!lkWait()) lkMsg('指纹没通过，请再试或输入密码', true); return; }
		// 指纹只在手机上验证；向路由器领通行证时，路由器要求每天至少输过一次密码（你 11/21 定）
		try { passClear(); await passGet(); lkUnlock(); }
		catch (e) { if (LK.on) { lkMsg(e instanceof LockError ? e.message : e.message || '连不上路由器，暂时解不了锁', true); if (e instanceof LockError) $('lkFp').style.visibility = 'hidden'; } }
	}
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
	lkSave(null); lkUnlock(); logout('面板锁已关闭，这台手机已退出，请重新登录');
}
// 5 分钟没操作自动锁（切到后台再回来也算）
['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach((t) => addEventListener(t, () => {
	if (LK.on) return;
	LK.last = Date.now();
	if (lkCfg()?.on && LK.last - lkSess.get() > 5000) lkSess.set(LK.last);
}, { capture: true, passive: true }));
const lkIdle = () => !LK.on && token && lkCfg()?.on && Date.now() - LK.last > LOCK_MIN * 60e3;
// 改面板锁、关面板锁之前确认本人：返回 { ok, proof }（proof 是给路由器核对用的）
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
	const c = lkCfg(); if (!c?.on) return { ok: true };
	const v = await pinBox('输入当前密码', '确认是你本人在操作。'); if (v == null) return { ok: false };
	const proof = await lkHash(v, c.salt);
	if (c.hash) { if (proof === c.hash) return { ok: true }; toast('密码不对'); return { ok: false }; }
	try { await P('lock_check', { lkp: proof }); return { ok: true, proof }; } catch (e) { toast(e.message, true); return { ok: false }; }
}
async function lkSetPin(old, oldProof) {
	const a = await pinBox(old ? '设置新密码' : '设置解锁密码', '4–6 位数字，由路由器核对。忘了只能让这台手机退出、重新登录。'); if (a == null) return false;
	const b = await pinBox('再输入一次', '确认刚才的密码。'); if (b == null) return false;
	if (a !== b) { toast('两次输入的不一样，没有保存'); return false; }
	const salt = lkB64(lkRnd(16)), proof = await lkHash(a, salt);
	// 6.0 第 13 项：交给路由器保管（路由器只存摘要），手机上只记盐和位数
	try { await P('lock_set', { on: 1, salt, len: a.length, lkp: proof, old: oldProof || undefined, fp: !!(old && old.cred) }); } catch (e) { toast(e.message, true); return false; }
	const n = Object.assign({}, old || {}, { on: 1, salt, len: a.length });
	['hash', 'fails', 'until', 'total', 'n'].forEach((k) => delete n[k]);
	lkSave(n);
	return true;
}
async function fpTurnOn() {
	try { const id = await fpCreate(); await P('lock_fp', { fp: true }); const c = lkCfg(); c.cred = id; lkSave(c); toast('已开启指纹解锁'); return true; }
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
		<div class="kv"><span>指纹解锁</span><span>${c.cred ? '已开启' : fpOk ? '未开启' : !window.isSecureContext ? '在家里地址打开时用不了' : '这台手机不支持'}</span></div>
		<div class="kv"><span>自动锁定</span><span>${LOCK_MIN} 分钟没操作</span></div>
		<div class="btngrid" style="margin:14px 0 0"><button class="btn blue" data-v="now">立即锁定</button><button class="btn" data-v="pin">修改密码</button>
		${c.cred ? '<button class="btn" data-v="fpoff">关闭指纹</button>' : fpOk ? '<button class="btn" data-v="fpon">开启指纹</button>' : ''}<button class="btn danger" data-v="off">关闭面板锁</button></div>
		<button class="btn" data-v="close" style="width:100%;margin-top:10px">完成</button>`);
	if (v === 'now') return lockNow();
	if (v === 'pin') { const ck = await lkCheckOld(); if (ck.ok && (await lkSetPin(lkCfg(), ck.proof))) toast('密码已修改'); }
	if (v === 'fpon' && (await lkCheckOld()).ok) await fpTurnOn();
	if (v === 'fpoff') { try { await P('lock_fp', { fp: false }); const n = lkCfg(); delete n.cred; lkSave(n); toast('已关闭指纹解锁'); } catch (e) { toast(e.message, true); } }
	if (v === 'off') { const ck = await lkCheckOld(); if (ck.ok) { try { await P('lock_set', { on: 0, old: ck.proof }); lkSave(null); toast('面板锁已关闭'); } catch (e) { toast(e.message, true); } } }
	lockLabel();
}

try { lgBackground(); } catch (e) {}
try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {}); } catch (e) {}
if (pendLan) lanOpen({ ticket: pendLan }); else if (pendOpen) openTicket(pendOpen); else token ? start() : logout();
})();

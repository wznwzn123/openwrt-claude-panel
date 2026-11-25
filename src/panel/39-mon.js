/* ---------- 6.0 第 27 项：实时监控（网速、负载、连接数） ----------
   打开这页时每 2 秒问一次路由器，曲线留近 3 分钟（90 个点），只在面板里，不存路由器 */
const MN = { rx: [], tx: [], ld: [], cn: [], n: 90, timer: 0, last: null };
function mnPath(arr, max, W, H) {
	const p = arr.map((v, i) => [(W * i) / Math.max(arr.length - 1, 1), H - 3 - ((v || 0) / max) * (H - 8)]);
	const l = p.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('');
	return { l, a: p.length ? l + `L${p[p.length - 1][0].toFixed(1)} ${H}L${p[0][0].toFixed(1)} ${H}Z` : '' };
}
// 一张曲线：主线带渐变填充；第二条线（上传）只画线；mark 是一条参考线（核数、连接上限的 80%）
function mnChart(el, a, b, max, color, mark) {
	const W = 300, H = 70, g = 'mg' + el.id;
	const A = mnPath(a, max, W, H), B = b ? mnPath(b, max, W, H) : null;
	const my = mark != null && mark <= max ? (H - 3 - (mark / max) * (H - 8)).toFixed(1) : null;
	el.innerHTML = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".3"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
		${my ? `<line x1="0" y1="${my}" x2="${W}" y2="${my}" stroke="var(--warn)" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>` : ''}
		${a.length > 1 ? `<path d="${A.a}" fill="url(#${g})"/><path d="${A.l}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` : ''}
		${B && b.length > 1 ? `<path d="${B.l}" fill="none" class="upl" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` : ''}`;
}
const mnNum = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
function mnDraw() {
	const r = MN.last;
	if (!r) return;
	$('mnRx').innerHTML = '↓ ' + bps(r.rx); $('mnTx').innerHTML = '↑ ' + bps(r.tx);
	mnChart($('mnNet'), MN.rx, MN.tx, Math.max(125000, ...MN.rx, ...MN.tx) * 1.15, 'var(--brand)');
	const L = r.load || [];
	$$('#mnLoad b').forEach((b, i) => { b.textContent = L[i] == null ? '—' : L[i].toFixed(2); b.className = L[i] != null && L[i] > r.cpus ? 'ndwarn' : ''; });
	$('mnCpu').textContent = (r.cpu != null ? 'CPU ' + r.cpu + '%' : '') + (r.cpus ? (r.cpu != null ? ' · ' : '') + r.cpus + ' 核' : '');
	mnChart($('mnLd'), MN.ld, null, Math.max(r.cpus, ...MN.ld) * 1.15, 'var(--warn)', r.cpus);
	const full = r.conn != null && r.conn_max ? r.conn / r.conn_max : 0;
	$('mnConn').textContent = r.conn == null ? '—' : mnNum(r.conn) + (r.conn_max ? ' / ' + mnNum(r.conn_max) : '');
	$('mnConn').className = full >= 0.8 ? 'ndbad' : '';
	mnChart($('mnCn'), MN.cn, null, Math.max(10, ...MN.cn) * 1.15, 'var(--ok)', r.conn_max ? r.conn_max * 0.8 : null);
}
async function mnOnce() {
	const r = await P('mon', {}, 6000);
	MN.last = r;
	const push = (k, v) => { MN[k].push(v); if (MN[k].length > MN.n) MN[k].shift(); };
	if (r.rx != null) { push('rx', r.rx); push('tx', r.tx); }
	if (r.load) push('ld', r.load[0]);
	if (r.conn != null) push('cn', r.conn);
	mnDraw();
	setStatus(true, '在线');
}
function mnTick() {
	clearTimeout(MN.timer);
	MN.timer = setTimeout(async () => {
		if (page !== 'mon') return;
		if (!document.hidden && !LK.on && !document.querySelector('.modal')) { try { await mnOnce(); } catch (e) {} }
		mnTick();
	}, 2000);
}
async function loadMon() {
	await mnOnce();
	mnTick();
}
// 概览的 CPU、内存格：点一下进实时监控
for (const id of ['sCpu', 'sMem']) { const c = $(id).closest('.card'); c.classList.add('tap'); c.setAttribute('role', 'button'); c.tabIndex = 0; c.onclick = () => go('mon'); c.onkeydown = (e) => { if (e.key === 'Enter') go('mon'); }; }

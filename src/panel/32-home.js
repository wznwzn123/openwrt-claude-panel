/* =====================================================================
   概览
   ===================================================================== */
const PROTO = { pppoe: 'PPPoE 拨号', dhcp: 'DHCP 自动获取', static: '静态 IP' };
let homeTick = 0;
/* ---------- 代理插件：OpenClash、Nikki（Clash 内核）和 PassWall、PassWall2、HomeProxy、SSR Plus+ ---------- */
function pxSet(px) {
	if (!px || typeof px !== 'object') return;
	const k = JSON.stringify(px), old = PXS;
	PXS = px; store.set('rp_px', k);
	if (!old || old.active !== px.active || JSON.stringify((old.list || []).map((x) => x.id)) !== JSON.stringify((px.list || []).map((x) => x.id))) { try { renderNav(); } catch (e) {} }
}
function renderSub(o) {
	if (o.px) pxSet(o.px);
	const s = o.system || {}, a = pxAct(), run = a && (a.kind === 'clash' ? (o.clash || {}).running : a.running);
	$('topSub').textContent = (s.model || 'OpenWrt') + (a ? ' · ' + a.name + (run ? ' 运行中' : a.enabled === false ? ' 已关闭' : ' 未运行') : ' · 没装代理插件');
}
// 不是 Clash 内核的插件：节点列表、测延迟、切换（切换要重启插件，断网十几秒）
async function pxNodeSheet() {
	const a = pxAct();
	if (!a || a.kind !== 'other') return;
	let r; try { r = await P('px_nodes', { id: a.id }, 20000); } catch (e) { return handleErr(e); }
	const D = {};
	const row = (n) => `<button class="file ${n.id === r.cur ? 'cur' : ''}" data-v="n:${esc(n.id)}"><div><b>${esc(n.name)}</b><span class="muted">${esc([n.group || n.kind, n.addr ? n.addr + (n.port ? ':' + n.port : '') : ''].filter(Boolean).join(' · '))}</span></div>${n.id === r.cur ? '<span class="pill blue">正在用</span>' : D[n.id] != null ? `<span class="pill ${D[n.id] ? (D[n.id] < 200 ? 'good' : 'warnc') : 'red'}">${D[n.id] ? D[n.id] + ' ms' : '不通'}</span>` : '<span class="muted">›</span>'}</button>`;
	const v = await modal(`<div class="sheethead"><h3>${esc(a.name)} 的节点</h3><div class="actions" style="flex-wrap:nowrap"><button class="btn sm blue" data-t>测延迟</button><button class="btn sm" data-v="close">关闭</button></div></div>
		<p class="muted" style="margin:0 0 8px;font-size:12.5px">延迟是路由器直接连到节点服务器要多久，只看通不通、远不远。点节点切换，会重启 ${esc(a.name)}，断网十几秒。</p>
		<div data-l>${r.list.map(row).join('') || '<div class="empty">还没有节点，到插件原版页面里添加或订阅</div>'}</div>`, (m) => {
		const t = m.querySelector('[data-t]');
		t.onclick = () => busy(t, async () => { const d = await P('px_delay', { id: a.id }, 60000); Object.assign(D, d.list || {}); for (const n of r.list) if (D[n.id] == null && n.addr) D[n.id] = 0; m.querySelector('[data-l]').innerHTML = r.list.map(row).join(''); }, '测速中');
	});
	const id = typeof v === 'string' && v.startsWith('n:') ? v.slice(2) : null, n = r.list.find((x) => x.id === id);
	if (!n || n.id === r.cur) return;
	if (!(await confirmBox('切换到「' + n.name + '」', '要重启 ' + a.name + '，全家网络中断十几秒，这个面板也可能暂时连不上。', '切换'))) return;
	busy(null, async () => { await P('px_set', { id: a.id, node: n.id }); toast('已切换，' + a.name + ' 正在重启'); setTimeout(() => loadHome(true).catch(() => {}), 15000); });
}
async function pxRestart() {
	const a = pxAct();
	if (!a) return toast('这台路由器没装代理插件');
	if (!(await confirmBox('重启 ' + a.name, '全家网络会中断十几秒，这个面板也可能暂时连不上。', '重启'))) return;
	if (a.id === 'openclash') { await P('quick', { action: 'restart' }); S.state = null; watchJobs(); }
	else await P('px_ctl', { id: a.id, op: 'restart' });
	toast(a.name + ' 正在重启'); setStatus(false, '重启中');
}
// 换用另一个代理插件（装了两个以上时）
async function pxSwitchSheet() {
	const pl = (PXS && PXS.list) || [], a = pxAct();
	const v = await modal(`<div class="sheethead"><h3>用哪个代理插件</h3><button class="btn sm" data-v="close">关闭</button></div>
		<p class="muted" style="margin:0 0 8px;font-size:12.5px;line-height:1.6">同一时间只开一个，两个一起开会抢流量。换的时候会先关掉正在用的，再打开选的那个，全家断网十几秒。</p>
		${pl.map((x) => `<button class="file ${a && x.id === a.id ? 'cur' : ''}" data-v="p:${esc(x.id)}"><div><b>${esc(x.name)}</b><span class="muted">${x.running ? '运行中' : x.enabled ? '开着，没在运行' : '关着'}${x.kind === 'clash' ? ' · 节点、测速、连接、代理模式都能在面板里管' : ' · 面板里能开关、换节点、测延迟'}</span></div>${a && x.id === a.id ? '<span class="pill blue">正在用</span>' : '<span class="muted">›</span>'}</button>`).join('')}`);
	const id = typeof v === 'string' && v.startsWith('p:') ? v.slice(2) : null, x = pl.find((y) => y.id === id);
	if (!x || (a && x.id === a.id && x.running)) return;
	if (!(await confirmBox('换成 ' + x.name, (a && a.id !== x.id ? '先关掉 ' + a.name + '，' : '') + '再打开 ' + x.name + '。全家断网十几秒，这个面板也可能暂时连不上。', '换'))) return;
	busy(null, async () => { await P('px_switch', { id: x.id }); toast('正在换成 ' + x.name + '，稍等十几秒'); setStatus(false, '切换中'); setTimeout(() => loadHome(true).catch(() => {}), 15000); });
}
$('pxPick').onclick = () => pxSwitchSheet();
$('pgNode').onclick = () => pxNodeSheet();
$('pgNodes').onclick = () => pxNodeSheet();
$('pgRestart').onclick = () => busy(null, pxRestart);
$('pgLuci').onclick = () => {
	const a = pxAct(); if (!a || !PX_LUCI[a.id]) return;
	// 侧边栏里有这个插件的原版页面就打开第一页，没有就打开插件的入口
	const k = Object.keys(NAVK).find((x) => x.startsWith('k:' + PX_LUCI[a.id] + '/'));
	go(k || 'k:' + PX_LUCI[a.id]);
};
/* 首页代理开关：开 = OpenClash 在运行且不是直连模式 */
const PX = { running: false, mode: null, live: false, busy: false, line: null, note: null };
// 刚做完的操作先显示几秒（比如「正在切换到直连…」），之后显示 OpenClash 日志最后一行
function pxNote(text, ms = 10000, wait) { PX.note = { text, at: Date.now(), until: Date.now() + ms, wait: !!wait }; pxLogRender(); clearTimeout(PX.nt); PX.nt = setTimeout(pxLogRender, ms + 50); }
function pxLogRender() {
	const el = $('pxLog');
	if (!PX.live && !PX.note) { el.innerHTML = ''; return; }
	const note = PX.note && Date.now() < PX.note.until ? PX.note : null;
	const tag = note && note.wait ? ['wait', '处理中'] : PX.busy ? ['wait', PX.running ? '处理中' : '启动中'] : PX.running ? ['ok', 'Meta 运行中'] : ['bad', '未运行'];
	let txt = '', tm = '';
	if (note) txt = note.text;
	else if (PX.line && PX.line.msg) {
		txt = (PX.line.lv ? '[' + PX.line.lv + '] ' : '') + PX.line.msg;
		const d = PX.line.t ? new Date(PX.line.t.replace(' ', 'T')) : null;
		if (d && !isNaN(d)) tm = d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
	}
	el.innerHTML = `<i class="tag ${tag[0]}">${tag[1]}</i><span class="txt">${esc(txt)}</span>${tm ? `<span class="tm">${tm}</span>` : ''}`;
	el.title = txt;
}
function pxRender(running, mode, live) {
	PX.running = !!running; PX.mode = mode; PX.live = !!live;
	if (running && (mode === 'rule' || mode === 'global')) store.set('rp_lastmode', mode);
	const on = !!running && !!mode && mode !== 'direct';
	$('pxSw').checked = on;
	$('pxSw').disabled = !live;
	$('pxRow').className = 'pxrow ' + (live ? (on ? 'on' : 'off') : '');
	$('pxTitle').textContent = !live ? '代理（状态未知）' : on ? '代理已开启' : '代理已关闭';
	pxLogRender();
	$('pxSub').textContent = !live ? '连不上路由器，暂时不能切换'
		: !running ? (pxAct()?.name || 'OpenClash') + ' 没有运行 · 所有流量直连'
		: mode === 'rule' ? '规则模式 · 国内直连，海外走代理'
		: mode === 'global' ? '全局模式 · 所有流量走代理'
		: '直连模式 · 所有流量都不走代理';
}
$('pxSw').onchange = async () => {
	const want = $('pxSw').checked, a = pxAct();
	if (a && a.kind === 'other') return pxToggleOther(a, want);
	pxRender(PX.running, PX.mode, PX.live); // 先恢复原样，成功后再更新
	const row = $('pxRow');
	row.classList.add('busy');
	try {
		if (!want) {
			pxNote('正在切换到直连模式…', 15000, true);
			await P('set_mode', { mode: 'direct' });
			applyMode('direct');
			toast('代理已关闭：所有流量直连');
		} else if (!PX.running) {
			const nm = a ? a.name : 'OpenClash';
			if (!(await confirmBox('开启代理', nm + ' 现在没有运行，开启需要启动它，全家网络会中断 10–30 秒。', '启动'))) return;
			const m = PX.mode === 'rule' || PX.mode === 'global' ? PX.mode : store.get('rp_lastmode') || 'rule';
			pxNote('正在启动 ' + nm + '…', 20000, true);
			await P('set_mode', { mode: m });
			if (!a || a.id === 'openclash') await P('quick', { action: 'start' }); else await P('px_ctl', { id: a.id, op: 'enable' });
			PX.busy = true; pxLogRender();
			toast(nm + ' 正在启动，稍等十几秒');
			setStatus(false, '启动中'); S.state = null; watchJobs();
		} else {
			const m = store.get('rp_lastmode') || 'rule';
			pxNote('正在恢复' + MODE[m] + '模式…', 15000, true);
			await P('set_mode', { mode: m });
			applyMode(m);
			toast('代理已开启：' + MODE[m] + '模式');
		}
	} catch (e) { PX.note = null; pxLogRender(); handleErr(e); }
	finally { row.classList.remove('busy'); }
};
// PassWall、PassWall2 有总开关；HomeProxy、SSR Plus+ 没有，只能停 / 启动（路由器重启后会自己打开）
async function pxToggleOther(a, want) {
	$('pxSw').checked = !want;
	const sw = a.id === 'passwall' || a.id === 'passwall2';
	if (!(await confirmBox(want ? '开启 ' + a.name : '关闭 ' + a.name, (want ? '启动 ' : '停止 ') + a.name + '，全家网络中断十几秒。' + (!want && !sw ? '\n' + a.name + ' 没有总开关，这里只是暂时停下，路由器重启后会自己打开；要一直关着，到它的原版页面里把节点改成「不使用」。' : !want ? '\n关掉以后所有流量直连，要走代理的网站会打不开。' : ''), want ? '开启' : '关闭', !want))) return;
	busy(null, async () => {
		await P('px_ctl', { id: a.id, op: sw ? (want ? 'enable' : 'disable') : (want ? 'start' : 'stop') });
		a.running = want; if (sw) a.enabled = want;
		pxRenderOther(a, PXS, true);
		toast(a.name + (want ? ' 正在启动' : ' 已关闭'));
		setTimeout(() => loadHome(true).catch(() => {}), 12000);
	});
}
function pxRenderOther(a, px, live) {
	const on = !!a.running;
	$('pxSw').checked = on; $('pxSw').disabled = !live;
	$('pxRow').className = 'pxrow ' + (live ? (on ? 'on' : 'off') : '');
	$('pxTitle').textContent = !live ? '代理（状态未知）' : on ? a.name + ' 已开启' : a.name + (a.enabled === false ? ' 已关闭' : ' 没在运行');
	$('pxSub').textContent = !live ? '连不上路由器，暂时不能切换' : on ? '当前节点：' + (px.curName || '没选') : a.enabled === false ? '所有流量直连' : '开着但没在运行，可以试试重启插件';
	$('pxLog').innerHTML = '';
	$('pgName').textContent = a.name;
	$('pgCur').textContent = px.curName || '没选';
	$('pgCnt').textContent = px.count != null ? px.count + ' 个' : '—';
	$('pgSt').innerHTML = on ? '<span class="okc">运行中</span>' : a.enabled === false ? '已关闭' : '<span class="badc">没在运行</span>';
}
function renderOv(o, cached) {
	const c = o.clash || {}, w = o.wan, s = o.system || {};
	PX.line = c.line || PX.line; PX.busy = !!c.busy;
	// 「正在启动…」：一旦 OpenClash 开始输出启动步骤，就改显示真实的步骤；启动完了也不再显示
	if (PX.note && PX.note.wait && (c.busy || Date.now() - PX.note.at > 3000)) PX.note = null;
	// 路由器连得上就是在线：代理插件没在跑不等于路由器连不上
	if (!cached) setStatus(true, '在线');
	renderSub(o);
	const a = pxAct(), kind = a ? a.kind : 'none', isOC = !!a && a.id === 'openclash';
	const wanOk = !w || w.up;
	$('pxRow').classList.toggle('hidden', kind === 'none');
	$('modeBox').classList.toggle('hidden', kind !== 'clash');
	$('runBox').classList.toggle('hidden', !isOC);
	$('pxNone').classList.toggle('hidden', kind !== 'none');
	$('ocHead').classList.toggle('hidden', kind !== 'clash'); $('ocCard').classList.toggle('hidden', kind !== 'clash');
	$('oDash').classList.toggle('hidden', !isOC);
	$$('#ocCard .oconly').forEach((x) => x.classList.toggle('hidden', !isOC));
	$('pgHead').classList.toggle('hidden', kind !== 'other'); $('pgCard').classList.toggle('hidden', kind !== 'other');
	$('qHead').classList.toggle('hidden', !isOC); $('qCard').classList.toggle('hidden', !isOC);
	if (a) $('ocName').textContent = a.name;
	const pl = (PXS && PXS.list) || [];
	$('pxPick').classList.toggle('hidden', pl.length < 2);
	if (pl.length >= 2) $('pxPick').innerHTML = `<span>代理插件：<b>${esc(a ? a.name : '没在用')}</b><span class="muted"> · 还装了 ${esc(pl.filter((x) => !a || x.id !== a.id).map((x) => x.name).join('、'))}</span></span><span class="pxpk">切换 ›</span>`;
	if (kind === 'other') {
		pxRenderOther(a, o.px || PXS || {}, !cached);
		$('hHead').textContent = !a.running ? a.name + (a.enabled === false ? ' 已关闭' : ' 没在运行') : !wanOk ? '宽带未连接' : '网络一切正常';
		$('hDesc').textContent = a.running ? '当前节点：' + ((o.px || PXS || {}).curName || '没选') : '';
	} else if (kind === 'none') {
		$('hHead').textContent = !wanOk ? '宽带未连接' : '网络一切正常';
		$('hDesc').textContent = '';
	} else {
		pxRender(c.running, c.mode, !cached);
		$('hHead').textContent = !c.running ? a.name + ' 没有运行' : !wanOk ? '宽带未连接' : '网络一切正常';
		$('hDesc').textContent = c.running
			? `${MODE[c.mode] || c.mode || ''}模式 · ${c.connections ?? 0} 个连接${c.custom_rules && isOC ? ' · 自定义规则已开启' : ''}`
			: (c.error ? '代理内核未响应，可以试试重启 ' + a.name : '');
	}
	$$('#modeChips .chip').forEach((b) => b.classList.toggle('on', b.dataset.mode === c.mode));
	S.mode = c.mode;
	$('dockMode').textContent = kind === 'other' ? '节点' : kind === 'clash' && MODE[c.mode] ? MODE[c.mode] + '模式' : '模式';
	const op = $('ocPill'), prun = kind === 'other' ? !!a.running : !!c.running;
	op.textContent = kind === 'none' ? '没装代理插件' : prun ? a.name + ' 运行中' : a.name + ' 未运行';
	op.className = 'pill ' + (kind === 'none' ? '' : prun ? 'good' : 'red');
	if (o.speed) {
		$('hRx').innerHTML = rate(o.speed.rx);
		$('hTx').textContent = B(o.speed.tx) + '/s';
		$('hTotal').textContent = `↓${B(o.speed.rx_total)} ↑${B(o.speed.tx_total)}`;
		$('hDev').textContent = o.speed.dev;
	}
	$('sConn').textContent = kind === 'clash' ? c.connections ?? '—' : '—';
	// 新接口给真实 CPU 使用率；旧接口只有负载，用负载 ÷ 核数估算
	lowRouter = (s.cpus || 1) <= 1 || (s.mem_total > 0 && s.mem_total <= 268435456);
	const cpu = s.cpu != null ? Math.min(100, Math.round(s.cpu)) : Math.min(100, Math.round((+s.load || 0) / (s.cpus || 1) * 100));
	$('sCpu').innerHTML = `${cpu}<small>%</small>`; bar('sCpuBar', cpu);
	const mem = s.mem_total ? Math.round((s.mem_total - s.mem_avail) / s.mem_total * 100) : 0;
	$('sMem').innerHTML = `${mem}<small>%</small>`; bar('sMemBar', mem);
	$('sTemp').innerHTML = s.temp != null ? `${Math.round(s.temp)}<small>°C</small>` : '—';
	const wp = $('wanPill');
	wp.textContent = w ? (w.up ? '已连接' : '未连接') : '未知';
	wp.className = 'pill ' + (w ? (w.up ? 'good' : 'red') : '');
	$('wIp').textContent = w?.ip || '—';
	$('wProto').textContent = PROTO[w?.proto] || w?.proto || '—';
	$('wUp').textContent = w?.uptime ? dur(w.uptime) : '—';
	$('oCfg').textContent = base(c.config) || '—';
	$('oTotal').textContent = c.running ? `↓ ${B(c.download_total)} · ↑ ${B(c.upload_total)}` : '—';
	$('oVer').textContent = c.version || '—';
	$('yModel').textContent = s.model || '—';
	$('yFw').textContent = s.firmware || '—';
	$('yUp').textContent = dur(s.uptime);
}
async function loadHome(quiet) {
	// 概览和 OpenClash 状态同时请求，不再一个等一个
	const doSt = (!quiet || homeTick++ % 6 === 0) && pxOC();
	const stP = doSt ? state(!quiet).catch((e) => e) : null;
	const o = await P('overview');
	store.set('rp_ov', JSON.stringify(o));
	renderOv(o);
	netCheck(false);
	if (doSt && pxOC()) {
		const st = await stP;
		if (st instanceof Error) throw st;
		$('oPlug').textContent = st.plugin || '—';
		$$('#runChips .chip').forEach((b) => b.classList.toggle('on', b.dataset.run === st.cfg.en_mode));
		if (!$$('#runChips .chip').some((b) => b.dataset.run === st.cfg.en_mode) && st.cfg.en_mode) {
			const b = document.createElement('button'); b.className = 'chip on'; b.dataset.run = st.cfg.en_mode; b.textContent = RUNM[st.cfg.en_mode] || st.cfg.en_mode; $('runChips').appendChild(b); bindRun(b);
		}
		P('core_ps').then((r) => ($('oRss').textContent = r.running ? B(r.rss) : '未运行')).catch(() => {});
		const act = (st.files || []).find((f) => f.active);
		const sub = act && act.sub ? (st.subs || []).find((x) => x.name === act.sub) : null;
		if (sub && !quiet) subInfo(sub.sid).then((i) => ($('oSub').innerHTML = i ? subInfoHtml(i, true) : '<span class="muted">机场没提供</span>')).catch(() => ($('oSub').textContent = '—'));
		else if (!sub) $('oSub').innerHTML = '<span class="muted">当前配置不是订阅</span>';
	}
}
function bar(id, pct) {
	const el = $(id);
	el.className = 'bar' + (pct >= 90 ? ' d' : pct >= 70 ? ' w' : '');
	el.firstElementChild.style.width = pct + '%';
}
async function setMode(m) {
	if (m !== 'rule' && !(await confirmBox('切换为' + MODE[m] + '模式',
		m === 'global' ? '全局模式下所有流量（包括国内网站和 App）都会走代理，国内服务可能变慢。' : '直连模式下不走任何代理，Claude、GPT 等海外服务会打不开。', '切换'))) return false;
	const r = await P('set_mode', { mode: m });
	toast('已切换为' + MODE[m] + '模式' + (r.live ? '' : '（内核未运行，下次启动生效）'));
	applyMode(m);
	return true;
}
const MODE_DO = { rule: '国内直连，海外走代理', global: '所有流量都走代理', direct: '所有流量都不走代理' };
function applyMode(m) {
	pxNote('已切换到' + MODE[m] + '模式：' + MODE_DO[m]);
	$('dockMode').textContent = MODE[m] + '模式';
	S.mode = m;
	$$('#modeChips .chip').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
	pxRender(PX.running, m, PX.live);
	NC.at = {};
	netCheckSoon();
}
$$('#modeChips .chip').forEach((b) => (b.onclick = () => busy(null, async () => { if (!b.classList.contains('on')) await setMode(b.dataset.mode); })));
async function setRun(m) {
	if (!(await confirmBox('切换运行模式为「' + (RUNM[m] || m) + '」', '需要重启 OpenClash，全家网络中断 10–30 秒。\nTUN 模式兼容性更好，增强模式更省资源。', '切换并重启'))) return;
	await P('run_mode', { mode: m });
	S.state = null;
	$$('#runChips .chip').forEach((b) => b.classList.toggle('on', b.dataset.run === m));
	toast('已切换，OpenClash 正在重启');
	setStatus(false, '重启中');
	watchJobs();
}
function bindRun(b) { b.onclick = () => busy(null, async () => { if (!b.classList.contains('on')) await setRun(b.dataset.run); }); }
$$('#runChips .chip').forEach(bindRun);
async function switchCfgSheet() {
	let st; try { st = await state(true); } catch (e) { return handleErr(e); }
	const files = st.files || [];
	const v = await modal(`<div class="sheethead"><h3>切换配置文件</h3><button class="btn sm" data-v="close">关闭</button></div>
		${files.map((f, i) => `<button class="file ${f.active ? 'cur' : ''}" data-v="f${i}"><div><b>${esc(f.name)}</b><span class="muted">${B(f.size)} · ${ts(f.mtime)}${f.sub ? ' · 订阅' : ''}</span></div>${f.active ? '<span class="pill blue">正在使用</span>' : '<span class="muted">›</span>'}</button>`).join('') || '<div class="empty">没有配置文件</div>'}`);
	const f = typeof v === 'string' && /^f\d+$/.test(v) ? files[+v.slice(1)] : null;
	if (!f || f.active) return;
	if (!(await confirmBox('切换配置', `使用「${f.name}」并重启 OpenClash，断网 10–30 秒。`, '切换'))) return;
	busy(null, async () => { await P('cfg_switch', { name: f.name }); toast('已切换，OpenClash 正在重启'); S.state = null; setStatus(false, '重启中'); watchJobs(); });
}
$('oCfgBtn').onclick = () => switchCfgSheet();
// 打开控制面板：把后端地址和密钥直接带在链接里，打开就登录好，不用自己填
function dashUrl(d) {
	const n = d.default_dashboard && d.installed[d.default_dashboard] !== false ? d.default_dashboard : ['metacubexd', 'zashboard', 'yacd', 'dashboard'].find((x) => d.installed[x]);
	if (!n) return null;
	const base = `http://${d.lan_ip}:${d.port}/ui/${n}/`;
	const q = `hostname=${encodeURIComponent(d.lan_ip)}&port=${encodeURIComponent(d.port)}&secret=${encodeURIComponent(d.secret || '')}`;
	return n === 'metacubexd' || n === 'zashboard' ? base + '#/setup?http=1&' + q : n === 'yacd' ? base + '?' + q : base;
}
$('oDash').onclick = () => {
	// 先同步开一个窗口（等路由器回复后再开，会被浏览器当成弹窗拦掉）
	let w = null;
	try { w = window.open('', '_blank'); } catch (e) {}
	busy($('oDash'), async () => {
		let url = null;
		try { url = dashUrl(await P('dashboard_state')); }
		catch (e) { if (w) w.close(); throw e; }
		if (!url) { if (w) w.close(); return toast('还没有安装控制面板，到「插件设置 → 外部控制」里下载', true); }
		if (w) { try { w.opener = null; } catch (e) {} w.location.href = url; } else location.href = url;
		toast('已自动登录控制面板（只在连着家里 Wi-Fi 时能打开）');
	}, false);
};

/* 快捷操作 */
// 按用途分三组；图标统一用线条图标 + iOS 系统色的圆角方块，文字一行放得下（确认框里用完整名称）
const QI = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const QUICK = [
	{ g: 'OpenClash' },
	{ k: 'restart', t: '重启', n: '重启 OpenClash', col: '#0a84ff', i: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>', confirm: '全家网络会中断 10–30 秒。' },
	{ k: 'start', t: '启动', n: '启动 OpenClash', col: '#34c759', i: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>' },
	{ k: 'stop', t: '停止', n: '停止 OpenClash', col: '#ff3b30', i: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/>', confirm: '停止后不再走代理，海外网站和 App 会打不开。', danger: true },
	{ k: 'mode', t: '切换模式', col: '#5e5ce6', i: '<path d="M4 7.5h10M18 7.5h2M4 16.5h4M12 16.5h8"/><circle cx="16" cy="7.5" r="2"/><circle cx="10" cy="16.5" r="2"/>' },
	{ g: '清理' },
	{ k: 'close_conns', t: '断开连接', col: '#ff9500', i: '<path d="M9 7.5 7.7 6.2a3.6 3.6 0 0 0-5 5L4 12.5M15 16.5l1.3 1.3a3.6 3.6 0 0 0 5-5L20 11.5"/><path d="M8.5 15.5 15.5 8.5" opacity=".45"/><path d="M4 4l16 16"/>' },
	{ k: 'flush_dns', t: '清 DNS', n: '清空 DNS 缓存', col: '#30b0c7', i: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z"/>' },
	{ k: 'flush_smart', t: '清 Smart', n: '清空 Smart 缓存', col: '#af52de', i: '<path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z"/><path d="M18.5 15.5l.8 1.9 1.7.8-1.7.8-.8 1.9-.8-1.9-1.7-.8 1.7-.8z"/>' },
	{ k: 'reload_firewall', t: '重载防火墙', col: '#ff2d55', i: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>' },
	{ g: '更新' },
	{ k: 'subs', t: '更新订阅', col: '#0a84ff', i: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.4 9.6 4.5 4.5 0 0 0 7 18.5z"/><path d="M12 10.5v5.5M9.8 13.8 12 16l2.2-2.2"/>' },
	{ k: 'update_geo', t: '更新 GEO', n: '更新 GEO 数据库', col: '#32ade6', i: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>', confirm: '在后台更新 GeoIP、GeoSite、ASN 数据库。只要有新版本，OpenClash 会自动重启加载，全家断网 10–30 秒。' },
	{ k: 'update_chnroute', t: '大陆 IP', n: '更新大陆 IP 白名单', col: '#ff9f0a', i: '<path d="M5 21V4M5 4.5h11l-2.5 3.5L16 11.5H5"/>', confirm: '在后台更新大陆 IP 段。如果有新版本，OpenClash 会自动重启加载，全家断网 10–30 秒。' },
	{ k: 'one_key_update', t: '一键更新', n: '一键更新插件和内核', col: '#34c759', i: '<circle cx="12" cy="12" r="8.5"/><path d="M12 16.5v-9M8.5 11 12 7.5l3.5 3.5"/>', confirm: '同时更新插件和内核，完成后自动重启，期间会断网。' },
];
function renderQuick(el, after) {
	el.innerHTML = QUICK.map((q) => (q.g ? `<div class="qgh">${esc(q.g)}</div>` : `<button class="qbtn" data-q="${q.k}" aria-label="${esc(q.n || q.t)}"><i style="--qc:${q.col}">${QI(q.i)}</i><span>${esc(q.t)}</span></button>`)).join('');
	el.onclick = (e) => { const b = e.target.closest('[data-q]'); if (b) { if (after) after(); runQuick(b.dataset.q, b); } };
}
async function runQuick(k, btn) {
	const q = QUICK.find((x) => x.k === k) || {};
	if (k === 'subs') return updateSubs(btn);
	if (k === 'mode') return modeSheet();
	if (k === 'close_conns') return closeAll(btn);
	if (q.confirm && !(await confirmBox(q.n || q.t, q.confirm, q.t, q.danger))) return;
	await busy(btn, async () => {
		const r = await P('quick', { action: k });
		toast(r.msg || '已完成');
		if (['restart', 'start', 'stop'].includes(k)) { setStatus(false, '处理中'); S.state = null; }
		if (['restart', 'start', 'stop', 'update_geo', 'update_chnroute', 'one_key_update', 'update_core', 'update_plugin'].includes(k)) watchJobs();
	}, false);
}
renderQuick($('qGrid'));
async function updateSubs(btn) {
	const st = await state();
	const subs = (st.subs || []).filter((s) => s.enabled !== '0');
	if (!subs.length) return toast('还没有订阅，先到「订阅」页添加', true);
	if (!(await confirmBox('更新全部订阅', `将更新 ${subs.length} 个订阅：${subs.map((s) => s.name).join('、')}\n更新当前在用的配置后 OpenClash 会自动重启，期间断网 10–30 秒。`, '开始更新'))) return;
	await busy(btn, async () => { await P('sub_update', {}); toast('订阅开始在后台更新'); watchJobs(); }, false);
}
async function closeAll(btn) {
	if (!(await confirmBox('断开全部连接', '所有 App 会重新建立连接，并按当前的规则和节点走。正在下载的内容可能会中断。', '断开'))) return;
	await busy(btn, async () => { await tool('close_connections', {}); toast('已断开全部连接'); if (page === 'conn') refresh(true); }, false);
}
$('cnCloseAll').onclick = (e) => closeAll(e.currentTarget);
async function modeSheet() {
	let st = null; try { st = await state(); } catch (e) {}
	let cur = S.mode;
	if (!cur) try { cur = (await P('overview')).clash?.mode; } catch (e) {}
	modal(`<div class="sheethead"><h3>切换模式</h3><button class="btn sm" data-v="close">完成</button></div>
		<div class="muted" style="font-weight:600">代理模式（立即生效）</div>
		<div class="chips wrapc" data-m>${Object.keys(MODE).map((m) => `<button class="chip ${m === cur ? 'on' : ''}" data-mode="${m}">${MODE[m]}</button>`).join('')}</div>
		<div class="muted" style="font-weight:600;margin-top:16px">运行模式（需要重启）</div>
		<div class="chips wrapc" data-r>${['fake-ip', 'fake-ip-tun', 'fake-ip-mix'].map((m) => `<button class="chip ${st && st.cfg.en_mode === m ? 'on' : ''}" data-run="${m}">${RUNM[m]}</button>`).join('')}</div>
		<div class="notice" style="margin-top:14px">规则：按规则分流（推荐）；全局：全部走代理；直连：全部不走代理。</div>`,
	(m) => {
		$$('[data-mode]', m).forEach((b) => (b.onclick = () => busy(null, async () => { if (b.classList.contains('on')) return; if (await setMode(b.dataset.mode)) $$('[data-mode]', m).forEach((x) => x.classList.toggle('on', x === b)); })));
		$$('[data-run]', m).forEach((b) => (b.onclick = () => busy(null, async () => { if (b.classList.contains('on')) return; await setRun(b.dataset.run); $$('[data-run]', m).forEach((x) => x.classList.toggle('on', x === b)); })));
	});
}

/* IP / 网站 / 解锁 / 诊断 */
/* ---------- 网络检测：出口 IP、网站访问、流媒体 / AI 解锁（打开概览自动检测，之后定时刷新） ---------- */
// 图标：统一的字母方块（不用各家商标），视频类暖色、AI 类冷色、网站按地区区分
const SITE = [
	{ key: 'baidu', t: '百度', ic: '百', bg: 'linear-gradient(135deg,#5b8def,#3a63d8)' },
	{ key: 'taobao', t: '淘宝', ic: '淘', bg: 'linear-gradient(135deg,#ff9a4d,#ff6a2b)' },
	{ key: 'google', t: 'Google', ic: 'G', bg: 'linear-gradient(135deg,#4fb3ff,#2d7cf6)' },
	{ key: 'github', t: 'GitHub', ic: 'GH', bg: 'linear-gradient(135deg,#5d6470,#2f343c)' },
	{ key: 'youtube', t: 'YouTube', ic: 'Y', bg: 'linear-gradient(135deg,#ff8a7a,#f0566a)' },
	{ key: 'claude', t: 'Claude', ic: 'C', bg: 'linear-gradient(135deg,#e7a37c,#c9774f)' },
];
const UNL = [
	{ key: 'netflix', t: 'Netflix', ic: 'N', bg: 'linear-gradient(135deg,#ff8a7a,#e8505b)' },
	{ key: 'disney', t: 'Disney+', ic: 'D+', bg: 'linear-gradient(135deg,#6f8cff,#4257d6)' },
	{ key: 'ytb', t: 'YouTube', ic: 'Y', bg: 'linear-gradient(135deg,#ffb36b,#ff7a45)' },
	{ key: 'openai', t: 'ChatGPT', ic: 'AI', bg: 'linear-gradient(135deg,#4fd1a5,#1fa37a)' },
	{ key: 'claude', t: 'Claude', ic: 'C', bg: 'linear-gradient(135deg,#e7a37c,#c9774f)' },
	{ key: 'gemini', t: 'Gemini', ic: 'G', bg: 'linear-gradient(135deg,#9a8cff,#6a5cf0)' },
];
const NC = { ip: null, site: null, unl: null, at: {}, run: {} };
try { Object.assign(NC, JSON.parse(store.get('rp_net') || '{}'), { run: {} }); } catch (e) {}
const tileHtml = (x, st, cls) => `<div class="tile"><span class="ic" style="background:${x.bg}">${esc(x.ic)}</span><span class="nm">${esc(x.t)}</span><span class="st ${cls || ''}">${st}</span></div>`;
function ipRender() {
	const r = NC.ip, el = $('ipList');
	if (!r) { el.innerHTML = '<div class="muted" style="grid-column:1/-1;font-size:13px"><span class="spin">↻</span> 正在查询…</div>'; return; }
	const rows = [];
	if (r.domestic) rows.push(['国内', 'cn', r.domestic]);
	// 同一个 IP 只显示一行；ip-api 的中文归属地和「机房 / 家庭宽带」合并到那一行
	const byIp = new Map();
	(r.overseas || []).forEach((x) => { const o = byIp.get(x.ip); if (!o) byIp.set(x.ip, { ...x }); else { if (x.kind) o.kind = x.kind; if (x.src === 'ip-api' && x.geo) o.geo = x.geo; } });
	byIp.forEach((x) => rows.push(['海外', '', x]));
	if ('v6' in r) rows.push(['IPv6', 'v6', r.v6 ? { ip: r.v6, geo: '有 IPv6' } : { ip: '没有 IPv6', geo: '这台路由器现在用不了 IPv6', none: true }]);
	el.innerHTML = rows.length ? rows.map(([k, c, x]) => `<span class="tg ${c}">${k}</span><span style="min-width:0"><b${x.none ? ' class="muted"' : ''}>${esc(x.ip)}</b><small>${x.kind ? `<i class="ipk${x.kind === '机房 IP' ? ' dc' : ''}">${esc(x.kind)}</i>` : ''}${esc((x.geo || '').replace(/\s+/g, ' ').trim() || x.src)}</small></span>`).join('')
		: '<div class="muted" style="grid-column:1/-1;font-size:13px">查不到，可能是网络不通</div>';
}
function siteRender() {
	const m = {};
	(NC.site?.sites || []).forEach((x) => (m[x.key] = x));
	$('siteTiles').innerHTML = SITE.map((x) => {
		const r = m[x.key];
		if (!r) return tileHtml(x, NC.site ? '—' : '检测中…');
		if (!r.ok) return tileHtml(x, '打不开', 't-bad');
		return tileHtml(x, r.ms + ' ms', r.ms < 400 ? 't-ok' : r.ms < 1200 ? 't-wa' : 't-bad');
	}).join('');
}
function unlRender() {
	const m = {};
	(NC.unl?.results || []).forEach((x) => (m[x.key] = x));
	$('unlTiles').innerHTML = UNL.map((x) => {
		const r = m[x.key];
		if (!r) return tileHtml(x, NC.unl ? '—' : '检测中…');
		if (+r.st === 2) return tileHtml(x, '解锁' + (r.region ? ' · ' + esc(r.region) : ''), 't-ok');
		if (+r.st === 1) return tileHtml(x, x.key === 'netflix' ? '仅自制剧' : '未解锁', 't-wa');
		return tileHtml(x, '检测失败', 't-bad');
	}).join('');
	const nodes = [...new Set((NC.unl?.results || []).map((x) => x.node).filter(Boolean))];
	$('unlNode').textContent = nodes.length === 1 ? nodes[0] : nodes.length ? nodes.length + ' 个节点' : '';
}
function ncAgo() {
	const t = Math.max(NC.at.ip || 0, NC.at.site || 0);
	const busyNow = Object.values(NC.run).some(Boolean);
	$('ncLive').classList.toggle('off', !t || document.hidden);
	$('ncAgo').textContent = busyNow ? '检测中' : !t ? '实时' : Date.now() - t < 15e3 ? '刚刚' : Date.now() - t < 3600e3 ? Math.round((Date.now() - t) / 60e3) ? Math.round((Date.now() - t) / 60e3) + ' 分钟前' : Math.round((Date.now() - t) / 1e3) + ' 秒前' : '很久前';
}
const NC_JOB = {
	ip: { box: 'ncIp', every: 60e3, run: () => P('myip', {}, 40000), render: ipRender },
	site: { box: 'ncSite', every: 60e3, run: () => P('site_check', {}, 40000), render: siteRender },
	unl: { box: 'ncUnl', every: 300e3, run: () => P('unlock', { services: UNL.map((x) => x.key) }, 100000), render: unlRender },
};
async function ncRun(k) {
	const j = NC_JOB[k];
	if (NC.run[k]) return;
	NC.run[k] = true;
	$(j.box).classList.add('busyc');
	ncAgo();
	try {
		NC[k] = await j.run();
		NC.at[k] = Date.now();
		store.set('rp_net', JSON.stringify({ ip: NC.ip, site: NC.site, unl: NC.unl, at: NC.at }));
	} catch (e) {
		if (!NC[k]) NC[k] = k === 'ip' ? {} : k === 'site' ? { sites: [] } : { results: [] };
	} finally {
		NC.run[k] = false;
		$(j.box).classList.remove('busyc');
		j.render();
		ncAgo();
	}
}
let ncSoon = 0;
// force：马上全部重测（切换节点、改模式、点刷新后）；否则只测过期的
function netCheck(force) {
	if (page !== 'home' || document.hidden) return;
	if (!force && ncSoon) return; // 已经约好马上全部重测（刚改了模式），定时刷新就别抢先测一遍
	for (const k in NC_JOB) if (force || Date.now() - (NC.at[k] || 0) > NC_JOB[k].every) ncRun(k);
}
const netCheckSoon = (ms) => { clearTimeout(ncSoon); ncSoon = setTimeout(() => { ncSoon = 0; netCheck(true); }, ms || 2500); };
ipRender(); siteRender(); unlRender(); ncAgo();
$('ncBtn').onclick = () => netCheck(true);
// 底部快捷栏「IP 检查」用的弹窗
async function checkIp(btn, box) {
	box.innerHTML = '<div class="empty"><span class="spin">↻</span> 正在查询…</div>';
	await busy(btn, async () => {
		NC.ip = await P('myip', {}, 40000); NC.at.ip = Date.now(); ipRender(); ncAgo();
		box.innerHTML = `<div class="ipl" style="padding:6px 2px">${$('ipList').innerHTML}</div><a class="btn" style="margin-top:12px;width:100%" href="https://ipcheck.ing/" target="_blank" rel="noopener">用 IPCheck.ing 完整检测 ↗</a><p class="muted" style="font-size:12px;margin:6px 0 0">完整检测测的是这台手机现在的网络：连着家里 Wi-Fi 时就是家里的网络。</p>`;
	}, false);
}
async function diagSheet(type) {
	const isDns = type === 'dns';
	const addr = await promptBox(isDns ? 'DNS 诊断' : '连接诊断', isDns ? '输入域名，如 www.google.com' : '输入域名或 IP，如 claude.ai');
	if (!addr) return;
	toast('诊断中…');
	try { const r = await P('diag', { type, addr }, 60000); toastHide(); textBox((isDns ? 'DNS 诊断：' : '连接诊断：') + addr, r.text); } catch (e) { handleErr(e); }
}

/* 底部快捷栏 */
$('dock').onclick = async (e) => {
	const b = e.target.closest('[data-d]'); if (!b) return;
	const d = b.dataset.d;
	const a = pxAct();
	if (d === 'restart') {
		if (!a) return toast('这台路由器没装代理插件');
		if (!pxOC()) return busy(null, pxRestart);
		if (!(await confirmBox('重启 OpenClash', '全家网络会中断 10–30 秒，这个面板也会暂时连不上。', '重启'))) return;
		b.classList.add('run');
		try { await P('quick', { action: 'restart' }); toast('OpenClash 正在重启'); setStatus(false, '重启中'); S.state = null; watchJobs(); } catch (x) { handleErr(x); }
		setTimeout(() => b.classList.remove('run'), 20000);
	}
	if (d === 'subs') { if (pxOC()) updateSubs(null); else toast(a ? a.name + ' 的订阅在它的原版页面里更新' : '这台路由器没装代理插件'); }
	if (d === 'mode') { if (a && a.kind === 'other') pxNodeSheet(); else if (a) modeSheet(); else toast('这台路由器没装代理插件'); }
	if (d === 'ip') modal(`<div class="sheethead"><h3>IP 检查</h3><div class="actions" style="flex-wrap:nowrap"><button class="btn sm blue" data-re>重新检查</button><button class="btn sm" data-v="close">关闭</button></div></div><div data-box></div>`,
		(m) => { const box = m.querySelector('[data-box]'), re = m.querySelector('[data-re]'); re.onclick = () => checkIp(re, box); checkIp(re, box); });
	if (d === 'quick') modal(`<div class="sheethead"><h3>快捷操作</h3><button class="btn sm" data-v="close">关闭</button></div>${pxOC() ? '<div class="qgrid" data-g></div>' : `<p class="muted" style="font-size:13px">${a ? esc(a.name) + ' 的设置在「概览」和它的原版页面里。' : '这台路由器没装代理插件。'}</p>`}
		<div class="btngrid" style="margin-bottom:0"><button class="btn blue" data-x="conn">连接诊断</button><button class="btn blue" data-x="dns">DNS 诊断</button></div>`,
		(m, close) => { if (m.querySelector('[data-g]')) renderQuick(m.querySelector('[data-g]'), () => close()); $$('[data-x]', m).forEach((x) => (x.onclick = () => { close(); diagSheet(x.dataset.x); })); });
};


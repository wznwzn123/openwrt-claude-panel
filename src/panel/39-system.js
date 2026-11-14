/* =====================================================================
   设备 / 连接 / 系统（沿用）
   ===================================================================== */
let devices = [], blk = { entries: [] };
const isBlack = (d) => blk.entries.some((e) => (d.mac && e.mac === d.mac) || (!e.mac && e.ip === d.ip) || (e.ip === d.ip && d.mac && e.mac === d.mac));
const devCard = (d, i, attr) => { const pz = attr === 'data-i' && d.mac ? PZ.devs[d.mac] : null; return `<article class="card" ${attr}="${i}">
	<div class="sechead"><div style="min-width:0"><b style="font-size:16px;display:block" class="ell">${esc(d.name || '未命名设备')}</b><div class="sub" style="font-size:12.5px">${esc(d.ip)}${d.mac ? ' · ' + esc(d.mac) : ''}</div></div>
		<span class="pill ${pz && pz.on ? 'warnc' : isBlack(d) ? 'red' : d.online ? 'good' : ''}">${pz && pz.on ? '已暂停' : isBlack(d) ? '已拉黑' : d.online ? '在线' : '离线'}</span></div>
	${pz ? `<div class="pzline">${pzDesc(pz)}</div>` : ''}
	${d.stats ? `<div class="actions" style="margin-top:10px"><span class="pill">${d.stats.conns} 个连接</span>${d.stats.proxied ? `<span class="pill blue">${d.stats.proxied} 个走代理</span>` : ''}<span class="pill">↓ ${B(d.stats.dl)}</span><span class="pill">↑ ${B(d.stats.ul)}</span></div>` : ''}
	<div class="rowbtns"><button class="btn sm" data-conns>看连接</button>${attr === 'data-i' ? `<button class="btn sm ${pz && pz.on ? 'good' : ''}" data-pause>${pz && pz.on ? '恢复 / 设置' : '暂停'}</button>` : ''}${isBlack(d) ? '<button class="btn sm good" data-unblack>解除拉黑</button>' : '<button class="btn sm danger" data-black>拉黑</button>'}</div>
</article>`; };
async function loadDev() {
	const [b, pz] = await Promise.all([P('black_state'), P('pause_list').catch(() => null)]);
	blk = b;
	if (pz) PZ = pz;
	devices = blk.devices || [];
	renderPz();
	setStatus(true, '在线');
	const online = devices.filter((d) => d.online).length;
	$('dvOnline').textContent = online + ' 台在线';
	$('dvCount').textContent = devices.length + ' 台';
	if (!devices.length) { $('dvList').innerHTML = '<div class="card empty">没有发现设备</div>'; return; }
	$('dvList').innerHTML = devices.map((d, i) => devCard(d, i, 'data-i')).join('');
}
$('dvList').addEventListener('click', (e) => {
	const a = e.target.closest('[data-i]'); if (!a) return;
	const d = devices[+a.dataset.i];
	if (e.target.closest('[data-pause]')) return pauseSheet(d);
	if (e.target.closest('[data-black]')) return blackToggle(d, true, e.target.closest('button'));
	if (e.target.closest('[data-unblack]')) return blackToggle(d, false, e.target.closest('button'));
	$('cnFilter').value = d.ip; go('conn');
});

/* ---------- 流量统计 ---------- */
const TF = { r: 'today', sel: null, d: null };
async function loadTraf() { TF.d = await P('traffic'); setStatus(true, '在线'); renderTraf(); }
const dshift = (day, n) => { const x = new Date(day + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const tfSum = (list) => list.reduce((s, a) => [s[0] + a[0], s[1] + a[1], s[2] + a[2], s[3] + a[3]], [0, 0, 0, 0]);
const tfTot = (a) => a[0] + a[1] + a[2] + a[3];
function tfName(k) {
	if (k === 'router') return '路由器自己';
	if (k === 'other') return '已断开的连接';
	const n = TF.d.names && TF.d.names[k];
	return n || (/^[0-9a-f:]{17}$/.test(k) ? '未知设备 ' + k.slice(-5) : k);
}
function tfDays(r, today) {
	if (r === 'today') return [today];
	if (r === 'yday') return [dshift(today, -1)];
	if (r === '7') return [0, 1, 2, 3, 4, 5, 6].map((i) => dshift(today, -i));
	const pre = r === 'month' ? today.slice(0, 7) : dshift(today.slice(0, 8) + '01', -1).slice(0, 7);
	return Object.keys(TF.d.days || {}).filter((d) => d.startsWith(pre));
}
function renderTraf() {
	const box = $('tfBody'), d = TF.d;
	if (!box || !d) return;
	const today = d.today || new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
	const all = d.days || {};
	const tday = tfSum(Object.values(all[today] || {}));
	$('tfPill').textContent = '今天 ' + B(tfTot(tday));
	if (!Object.keys(all).length) { box.innerHTML = '<section class="card empty">统计刚开始，过一两分钟再来看。</section>'; return; }
	const days = tfDays(TF.r, today);
	const per = {};
	for (const day of days) for (const [k, a] of Object.entries(all[day] || {})) per[k] = tfSum([per[k] || [0, 0, 0, 0], a]);
	const tot = tfSum(Object.values(per)), T = tfTot(tot), px = tot[0] + tot[1], dr = tot[2] + tot[3];
	const pct = (x) => (T ? Math.round((x * 100) / T) : 0);
	// 最近 14 天（选中设备时只看它）
	const sel = TF.sel && per[TF.sel] !== undefined ? TF.sel : TF.sel;
	const col = [...Array(14)].map((_, i) => { const day = dshift(today, i - 13), a = sel ? ((all[day] || {})[sel] || [0, 0, 0, 0]) : tfSum(Object.values(all[day] || {})); return { day, p: a[0] + a[1], d: a[2] + a[3] }; });
	const mx = Math.max(1, ...col.map((c) => c.p + c.d));
	const inR = new Set(days);
	const rows = Object.entries(per).filter(([, a]) => tfTot(a) > 0).sort((a, b) => tfTot(b[1]) - tfTot(a[1]));
	const top = rows.length ? tfTot(rows[0][1]) : 1;
	const label = { today: '今天', yday: '昨天', 7: '最近 7 天', month: '本月', last: '上个月' }[TF.r];
	box.innerHTML = `<div class="sectitle"><b>${label}</b>${d.at ? `<span class="pill">${hm(d.at * 1000)} 更新</span>` : ''}</div>
	<section class="card">
		<div class="muted" style="font-size:13px">${label}一共</div>
		<div class="tfbig">${B(T)}</div>
		<div class="muted" style="font-size:13px">↓ 下载 ${B(tot[1] + tot[3])} · ↑ 上传 ${B(tot[0] + tot[2])}</div>
		<div class="tfsplit"><i style="width:${pct(px)}%;background:var(--brand)"></i><i style="width:${T ? 100 - pct(px) : 0}%;background:var(--ok)"></i></div>
		<div class="tfleg"><span><i style="background:var(--brand)"></i>走代理 ${B(px)}（${pct(px)}%）</span><span><i style="background:var(--ok)"></i>直连 ${B(dr)}（${T ? 100 - pct(px) : 0}%）</span></div>
	</section>
	<div class="sectitle"><b>${sel ? '「' + esc(tfName(sel)) + '」' : ''}最近 14 天</b>${sel ? '<button class="btn sm" data-tfall>看全部</button>' : `<span class="pill">最高 ${B(mx)}</span>`}</div>
	<section class="card"><div class="tfchart">${col.map((c) => `<div class="tfcol ${inR.has(c.day) ? 'in' : ''}" title="${c.day} ${B(c.p + c.d)}"><i style="height:${((c.p * 100) / mx).toFixed(1)}%;background:var(--brand)"></i><i style="height:${((c.d * 100) / mx).toFixed(1)}%;background:var(--ok)"></i></div>`).join('')}</div>
		<div class="tfx">${col.map((c) => `<span class="${c.day === today ? 'now' : ''}">${+c.day.slice(8)}</span>`).join('')}</div></section>
	<div class="sectitle"><b>按设备</b><span class="pill">${rows.length} 台</span></div>
	<section class="card list">${rows.length ? rows.map(([k, a]) => `<button class="tfrow ${k === TF.sel ? 'on' : ''}" data-tfk="${esc(k)}">
		<span class="tfn"><b class="ell">${esc(tfName(k))}</b><b>${B(tfTot(a))}</b></span>
		<span class="tfbar"><i style="width:${((a[0] + a[1]) * 100 / top).toFixed(1)}%;background:var(--brand)"></i><i style="width:${((a[2] + a[3]) * 100 / top).toFixed(1)}%;background:var(--ok)"></i></span>
		<span class="muted tfsub">代理 ${B(a[0] + a[1])} · 直连 ${B(a[2] + a[3])} · ↓ ${B(a[1] + a[3])} ↑ ${B(a[0] + a[2])}</span></button>`).join('') : '<div class="empty">这段时间没有流量</div>'}</section>
	<p class="muted" style="font-size:12.5px;margin:8px 4px 0;line-height:1.6">点设备看它最近 14 天的用量。统计从 OpenClash 的连接算出来，OpenClash 没运行时的流量算不到。</p>`;
}
$('tfRange').addEventListener('click', (e) => {
	const b = e.target.closest('[data-r]'); if (!b) return;
	TF.r = b.dataset.r;
	$$('#tfRange .chip').forEach((x) => x.classList.toggle('on', x === b));
	renderTraf();
});
$('tfBody').addEventListener('click', (e) => {
	if (e.target.closest('[data-tfall]')) { TF.sel = null; return renderTraf(); }
	const r = e.target.closest('[data-tfk]'); if (!r) return;
	TF.sel = TF.sel === r.dataset.tfk ? null : r.dataset.tfk;
	renderTraf();
});

/* ---------- 网速测试 ---------- */
const ST = { d: null, run: '' };
async function loadSpeed() { ST.d = await P('speed_last'); setStatus(true, '在线'); renderSpeed(); }
const stMult = (via) => { const m = /(\d+(?:\.\d+)?)\s*x\s*$/i.exec(via || ''); return m ? +m[1] : 1; };
const stVia = (via) => { const a = String(via || '').split(' → '); return a.length > 2 ? a.slice(1).join(' → ') : a.join(' → '); };
const stNum = (v) => (v == null ? '—' : v >= 100 ? Math.round(v) : v);
function stCard(kind) {
	const r = ST.d && ST.d[kind], px = kind === 'proxy', running = ST.run === kind;
	const head = `<div class="sthead"><div><b>${px ? '走代理' : '宽带直连'}</b><span class="muted">${px ? '经过当前节点，测下载、上传和延迟' : '不经过节点，测家里宽带的下载和延迟'}</span></div>
		<button class="btn sm blue" data-st="${kind}" ${ST.run ? 'disabled' : ''}>${running ? '<span class="spin">↻</span> 测速中' : r ? '再测一次' : '开始测速'}</button></div>`;
	if (running) return `<section class="card">${head}<div class="empty" style="padding:18px 0 10px">正在测速，大约 15 秒…</div></section>`;
	if (!r) return `<section class="card">${head}<div class="empty" style="padding:14px 0 8px">还没测过</div></section>`;
	const mult = px ? stMult(r.via) : 1;
	return `<section class="card">${head}
		<div class="stnums ${px ? '' : 'two'}">
			<div><span>↓ 下载</span><b>${stNum(r.down)}<small> Mbps</small></b></div>
			${px ? `<div><span>↑ 上传</span><b>${stNum(r.up)}<small> Mbps</small></b></div>` : ''}
			<div><span>延迟</span><b>${r.ping == null ? '—' : r.ping}<small> ms</small></b></div>
		</div>
		<div class="kv"><span>线路</span><span>${esc(px ? (r.via ? stVia(r.via) : '没认出节点') : '宽带直连')}</span></div>
		<div class="kv"><span>测速时间</span><span>${r.t ? hm(r.t * 1000) + '（' + ago(new Date(r.t * 1000).toISOString()) + '）' : '—'}</span></div>
		${r.bytes ? `<div class="kv"><span>这次用掉</span><span>${B(r.bytes)}${px && mult !== 1 ? `，按 ${mult}x 倍率约算订阅 ${B(r.bytes * mult)}` : ''}</span></div>` : ''}
	</section>`;
}
function renderSpeed() {
	const box = $('stBody'); if (!box) return;
	const p = ST.d && ST.d.proxy;
	$('stPill').textContent = p ? '代理 ↓ ' + stNum(p.down) + ' Mbps' : '—';
	box.innerHTML = stCard('proxy') + stCard('direct') + '<p class="muted" style="font-size:12.5px;margin:8px 4px 0;line-height:1.6">走代理用 Cloudflare 测速服务器，宽带直连用阿里云、腾讯云镜像。结果是路由器自己测的，手机或电脑隔着 Wi‑Fi 会再慢一些。路由器重启后记录会清空。</p>';
}
$('stBody').addEventListener('click', async (e) => {
	const b = e.target.closest('[data-st]'); if (!b || ST.run) return;
	ST.run = b.dataset.st; renderSpeed();
	try {
		const r = await P('speedtest', { kind: ST.run }, 90000);
		ST.d = Object.assign({}, ST.d, { [r.kind]: r });
		toast(r.down > 0 ? `下载 ${stNum(r.down)} Mbps` : '没测出速度，可能节点不通');
	} catch (err) { handleErr(err); }
	finally { ST.run = ''; renderSpeed(); }
});

/* ---------- 云端备份 ---------- */
const CBK = { d: null };
async function loadBk() {
	try { CBK.d = await P('bk_list', {}, 30000); }
	catch (e) {
		// 精简版没有云端：说明一下，不当成出错
		if (!/设置云端/.test(e.message || '')) throw e;
		CBK.d = null; $('bkNow').disabled = true; $('bkPill').textContent = '未启用';
		$('bkBody').innerHTML = '<div class="notice w" style="margin-top:12px">云端备份是完整版功能，需要先部署 Cloudflare 云端，再在路由器上重新运行安装脚本选完整版。<br>现在也可以在「系统 → 备份 / 升级」里手动下载备份。</div>';
		return;
	}
	$('bkNow').disabled = false;
	setStatus(true, '在线'); renderBk();
	// 正在装加密工具：过几秒再看一次
	clearTimeout(CBK.t); if (CBK.d && CBK.d.ssl_run) CBK.t = setTimeout(() => { if (page === 'cbk') loadBk().catch(() => {}); }, 4000);
}
const bkWhen = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${hm(ms)}`; };
function renderBk() {
	const box = $('bkBody'), d = CBK.d; if (!box || !d) return;
	const list = d.list || [];
	$('bkPill').textContent = `${list.length} / ${d.max || 10} 份`;
	const last = list[0];
	const old = list.some((b) => !b.enc);
	// 「加密上传」开关：开着 = 有 openssl 且没关；没装 openssl 时打开会先装
	const encOn = !!d.ssl && !d.noenc, encDesc = d.ssl_run ? '正在安装加密工具（openssl-util），一般要半分钟到一两分钟，装好后这里会自动更新。'
		: encOn ? '新备份先在路由器上加密再上传，密钥只在这台路由器上，云端看不到内容。'
		: d.ssl ? '已关闭：新备份不加密，直接上传（里面有 Wi‑Fi 密码这些设置）。以前加密的备份照样能下载、还原。'
		: '没有开启：备份里的 Wi‑Fi 密码、登录密钥这些设置原样存在云端。打开会在路由器上装 openssl-util（需要几百 KB 到 2 MB 空间）。';
	const sslBox = `<section class="card" style="margin-bottom:12px;padding-top:8px;padding-bottom:8px"><label class="kv aswon"><span><b>加密上传</b><span class="muted">${encDesc}${!d.ssl && d.ssl_err ? '<br><span style="color:var(--danger,#d33)">上次没装成：' + esc(d.ssl_err) + '</span>' : ''}</span></span><span class="sw"><input type="checkbox" id="bkEnc"${encOn || d.ssl_run ? ' checked' : ''}${d.ssl_run ? ' disabled' : ''}><i></i></span></label></section>`;
	box.innerHTML = `${sslBox}${encOn && old ? '<div class="notice" style="margin-bottom:12px">标着「没加密」的是没开加密时存的备份，会随着新备份慢慢轮换掉（最多留 10 份），也可以自己删。</div>' : ''}<div class="sectitle"><b>备份列表</b>${last ? `<span class="pill">最近 ${esc(ago(new Date(last.at).toISOString()))}</span>` : ''}</div>
	<section class="card">${list.length ? list.map((b) => `<div class="bkrow" data-bk="${esc(b.id)}">
		<div><b>${bkWhen(b.at)}<span class="bktag ${b.kind === 'auto' ? '' : 'm'}">${b.kind === 'auto' ? '自动' : '手动'}</span>${b.enc ? '<span class="bktag e">已加密</span>' : '<span class="bktag o">没加密</span>'}</b><span class="muted">${B(b.size)} · ${b.files || '—'} 个文件</span></div>
		<div class="actions"><button class="btn sm" data-bkdl>下载</button><button class="btn sm blue" data-bkrs>还原</button><button class="btn sm danger" data-bkrm>删除</button></div></div>`).join('') : '<div class="empty">云端还没有备份，点上面的「立即备份」存第一份。</div>'}</section>
	<p class="muted" style="font-size:12.5px;margin:8px 4px 0;line-height:1.6">${d.auto ? '自动备份已开启（每天 4:07）。' : '自动备份没有开启。'}点「下载」时路由器先解密，下载到手机的是普通备份，格式和 LuCI「系统 → 备份 / 升级」导出的一样，也可以在那里恢复。还原前会先自动备份一份现在的设置。</p>`;
}
$('bkNow').addEventListener('click', (e) => busy(e.currentTarget, async () => {
	const r = await P('bk_now', {}, 150000);
	toast(`已备份到云端（${B(r.size)}）`);
	await loadBk();
}, '备份中'));
$('bkBody').addEventListener('change', async (e) => {
	const sw = e.target.closest('#bkEnc'); if (!sw) return;
	const on = sw.checked, d = CBK.d || {};
	const ok = on ? (d.ssl ? true : await confirmBox('开启备份加密', '在路由器上安装 openssl-util（需要几百 KB 到 2 MB 闪存空间，要连软件源，一般半分钟到一两分钟）。\n\n装好以后，新的备份先在路由器上加密再上传，密钥只在这台路由器上。下载、还原跟现在一样用；家里上网不受影响。', '开启加密'))
		: await confirmBox('关闭备份加密', '以后的备份不加密，直接上传到云端（里面有 Wi‑Fi 密码、登录密钥这些设置）。\n\n已经加密的备份不受影响，照样能下载、还原。随时可以再打开。', '关闭加密', true);
	if (!ok) { sw.checked = !on; return; }
	sw.disabled = true;
	try {
		const r = await P('bk_enc', { on }, 30000);
		toast(!on ? '已关闭加密，下次备份起不加密' : r.running ? '开始安装加密工具，装好后自动更新' : '已开启加密，下次备份起先加密再上传');
	} catch (x) { sw.checked = !on; handleErr(x); }
	await loadBk().catch(() => {});
});
$('bkBody').addEventListener('click', async (e) => {
	const row = e.target.closest('[data-bk]'); if (!row) return;
	const id = row.dataset.bk, b = (CBK.d.list || []).find((x) => x.id === id); if (!b) return;
	const when = bkWhen(b.at);
	const dl = e.target.closest('[data-bkdl]'), rs = e.target.closest('[data-bkrs]'), rm = e.target.closest('[data-bkrm]');
	if (dl) return busy(dl, async () => { const r = await P('bk_dl', { id, name: b.name }, 150000); download(r.url, r.name); toast(`开始下载（${B(r.size)}）`); }, false);
	if (rm) {
		if (!(await confirmBox('删除这份备份', `删除「${when}」的云端备份，删了就找不回来了。`, '删除', true))) return;
		return busy(rm, async () => { await P('bk_del', { id }, 30000); toast('已删除'); await loadBk(); }, false);
	}
	if (rs) {
		if (!(await confirmBox('还原到这份备份', `把路由器的全部设置换回「${when}」那时的样子，然后自动重启。\n\n· 还原前会先把现在的设置备份一份到云端\n· 重启大约 1–2 分钟，期间全家断网，面板也连不上\n· 这份备份之后改过的设置会被换掉`, '还原并重启', true))) return;
		return busy(rs, async () => {
			await P('bk_restore', { id }, 180000);
			toast('正在还原，路由器马上重启，1–2 分钟后再打开面板');
			setStatus(false, '正在重启');
		}, '准备中');
	}
});

/* ---------- 暂停上网 ---------- */
let PZ = { devs: {}, now: 0 };
const pzFar = (u) => u - Date.now() / 1000 > 300 * 86400;
function pzWhen(u) {
	if (pzFar(u)) return '直到手动恢复';
	const x = new Date(u * 1000), t = new Date(), tm = new Date(t.getTime() + 86400e3);
	const day = x.toDateString() === t.toDateString() ? '' : x.toDateString() === tm.toDateString() ? '明天 ' : (x.getMonth() + 1) + '/' + x.getDate() + ' ';
	return '到 ' + day + hm(u * 1000) + ' 自动恢复';
}
function pzDesc(e) {
	const parts = [];
	if (e.until) parts.push('<strong>暂停中</strong> · ' + pzWhen(e.until));
	if ((e.sched || []).length) parts.push('每天 ' + e.sched.map((s) => s.from + '–' + s.to).join('、') + ' 断网' + (e.on && !e.until ? '（现在就在这个时间里）' : ''));
	return parts.join('<br>');
}
function renderPz() {
	const box = $('pzBox'); if (!box) return;
	const list = Object.entries(PZ.devs || {});
	if (!list.length) { box.innerHTML = ''; return; }
	box.innerHTML = `<div class="sectitle"><b>暂停 / 定时断网</b><span class="pill ${list.some(([, e]) => e.on) ? 'warnc' : ''}">${list.filter(([, e]) => e.on).length} 台暂停中</span></div>
		<section class="card list">${list.map(([mac, e]) => `<div class="file" data-pzm="${esc(mac)}"><div><b>${esc(e.name || (devices.find((d) => d.mac === mac) || {}).name || mac)}</b><span class="muted pzl">${pzDesc(e)}</span></div><button class="btn sm ${e.on ? 'good' : ''}" data-pzset>${e.on && e.until ? '恢复' : '设置'}</button></div>`).join('')}</section>`;
}
$('pzBox').addEventListener('click', (e) => {
	const row = e.target.closest('[data-pzm]'); if (!row) return;
	const mac = row.dataset.pzm, ent = PZ.devs[mac] || {};
	const d = devices.find((x) => x.mac === mac) || { mac, name: ent.name, ip: '' };
	if (e.target.closest('[data-pzset]') && ent.on && ent.until && !(ent.sched || []).length) return busy(e.target.closest('button'), async () => { PZ = await P('pause_set', { mac, resume: true }); toast('已恢复上网'); await loadDev(); }, false);
	pauseSheet(d);
});
// 明天早上 7 点（现在 7 点前就是今天 7 点）
function next7() { const x = new Date(); x.setHours(7, 0, 0, 0); if (x <= new Date()) x.setDate(x.getDate() + 1); return Math.floor(x / 1000); }
function pauseSheet(d) {
	if (!d.mac) return toast('这台设备读不到 MAC 地址，没法暂停', true);
	const name = d.name || d.ip || d.mac;
	const html = () => {
		const e = PZ.devs[d.mac] || {}, sched = e.sched || [];
		return `<div class="sheethead"><h3>暂停「${esc(name)}」上网</h3><button class="btn sm" data-v="close">关闭</button></div>
		${e.until ? `<div class="notice" style="margin:0 0 10px;display:flex;justify-content:space-between;align-items:center;gap:10px"><span><b>暂停中</b> · ${pzWhen(e.until)}</span><button class="btn sm good" data-pz="resume">马上恢复</button></div>` : ''}
		${!e.until && e.on ? `<div class="notice w" style="margin:0 0 10px">现在正在每天定时断网的时间里。要现在恢复，删掉下面对应的定时。</div>` : ''}
		<p class="muted" style="margin:0 0 8px;font-size:13px">${e.until ? '改成' : ''}暂停多久（到时间自动恢复）：</p>
		<div class="pzgrid"><button class="btn" data-pz="30">30 分钟</button><button class="btn" data-pz="60">1 小时</button><button class="btn" data-pz="120">2 小时</button><button class="btn" data-pz="am">到早上 7 点</button><button class="btn danger" data-pz="ever" style="grid-column:1/-1">一直暂停，直到我手动恢复</button></div>
		<div class="subhd">每天定时断网</div>
		${sched.length ? sched.map((s, i) => `<div class="kv" style="align-items:center"><span style="color:var(--text);font-weight:600">${esc(s.from)} – ${esc(s.to)}${mins(s.to) <= mins(s.from) ? '<span class="muted" style="font-weight:400">（第二天）</span>' : ''}</span><button class="btn sm" data-pzdel="${i}">删除</button></div>`).join('') : '<p class="muted" style="margin:4px 0 0;font-size:13px">比如每天 23:00 到第二天 07:00 自动断网，适合孩子的平板、游戏机。</p>'}
		<div class="pzadd"><input class="input" type="time" data-from value="23:00"><span class="muted">到</span><input class="input" type="time" data-to value="07:00"><button class="btn blue" data-pz="add">添加</button></div>
		<p class="muted" style="margin:12px 0 0;font-size:12.5px;line-height:1.6">暂停期间这台设备国内外网站都上不了，但 Wi-Fi 还连着；开始暂停时它正在用的连接会马上断开。如果暂停的是你正在用的手机，面板也会打不开（用手机流量还能打开）。</p>`;
	};
	const mins = (t) => { const m = /^(\d+):(\d+)$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : 0; };
	modal(html(), (m) => {
		const set = async (b, args, msg) => {
			PZ = await P('pause_set', { mac: d.mac, name: d.name || undefined, ...args });
			m.querySelector('.modalbox').innerHTML = html();
			toast(msg); renderPz(); loadDev().catch(() => {});
		};
		m.querySelector('.modalbox').addEventListener('click', (ev) => {
			const b = ev.target.closest('[data-pz],[data-pzdel]'); if (!b) return;
			const e = PZ.devs[d.mac] || {}, sched = (e.sched || []).slice();
			const k = b.dataset.pz;
			if (b.dataset.pzdel != null) { sched.splice(+b.dataset.pzdel, 1); return busy(b, () => set(b, { sched }, '已删除这条定时'), false); }
			if (k === 'resume') return busy(b, () => set(b, { resume: true }, '已恢复上网'), false);
			if (k === 'add') {
				const from = m.querySelector('[data-from]').value, to = m.querySelector('[data-to]').value;
				if (!from || !to || from === to) return toast('开始和结束时间不能一样', true);
				if (sched.some((s) => s.from === from && s.to === to)) return toast('已经有这条定时了', true);
				sched.push({ from, to });
				return busy(b, () => set(b, { sched }, `已添加：每天 ${from}–${to} 断网`), false);
			}
			const until = k === 'ever' ? Math.floor(Date.now() / 1000) + 10 * 365 * 86400 : k === 'am' ? next7() : Math.floor(Date.now() / 1000) + +k * 60;
			return busy(b, () => set(b, { until }, '已暂停「' + name + '」上网，' + pzWhen(until)), false);
		});
	});
}

/* ---------- 拉黑名单 ---------- */
async function blackToggle(d, on, btn) {
	if (on && !(await confirmBox('拉黑「' + (d.name || d.ip) + '」', `拉黑后这台设备的所有流量都不走代理，只能用大陆网络：国内网站和 App 正常，海外网站和 App（谷歌、YouTube、Claude 等）会打不开。\n${d.mac ? '会给它固定 IP（' + d.ip + '），防止 IP 变了以后失效。' : '这台设备读不到 MAC 地址，只能按 IP 拉黑；如果它的 IP 变了需要重新拉黑。'}\n不需要重启，马上生效。`, '拉黑', true))) return;
	await busy(btn, async () => {
		const r = await P('black_set', { mac: d.mac || undefined, ip: d.ip, name: d.name || undefined, on });
		if (on && r.need_setup) {
			toast('已加入名单，但拉黑功能还没启用', true);
			await blackSetup();
		} else toast(on ? `已拉黑${r.pinned ? '（已固定 IP ' + r.ip + '）' : ''}` : '已解除拉黑');
		refresh(true);
	}, false);
}
async function blackSetup() {
	if (!(await confirmBox('启用拉黑功能', '第一次使用需要把拉黑规则加到「优先匹配」自定义规则里，并重启 OpenClash 一次（断网 10–30 秒）。之后拉黑、解除都不用再重启。', '启用并重启'))) return;
	await P('black_setup', { restart: true });
	toast('正在重启 OpenClash，完成后拉黑立即生效');
	setStatus(false, '重启中'); watchJobs();
}
async function loadBlack() {
	blk = await P('black_state');
	setStatus(true, '在线');
	const box = $('blBody'), devs = blk.devices || [];
	const ok = blk.ready && blk.live && blk.custom_on;
	const others = devs.map((d, i) => [d, i]).filter(([d]) => !isBlack(d));
	box.innerHTML = `<div class="hero"><div class="herohead"><h1>拉黑名单</h1><span class="pill ${ok ? 'good' : 'warnc'}">${ok ? '已启用' : '未启用'}</span></div>
		<p class="muted" style="margin-bottom:${ok ? 0 : 12}px">被拉黑的设备不走代理，只能用大陆网络（国内网站正常，海外网站打不开）。拉黑、解除都马上生效，不用重启。</p>
		${ok ? '' : `<div class="notice w" style="margin-bottom:10px">${!blk.custom_on ? '「自定义规则」总开关是关着的，拉黑不会生效。' : '拉黑功能还没启用（需要重启 OpenClash 一次）。'}</div><button class="btn primary" data-setup style="width:100%;padding:12px">启用拉黑功能</button>`}</div>
		<div class="sectitle"><b>已拉黑</b><span class="pill">${blk.entries.length} 台</span></div>
		<section class="card list">${blk.entries.length ? blk.entries.map((e, i) => `<div class="file" data-e="${i}"><div><b>${esc(e.name || (devs.find((d) => d.mac && d.mac === e.mac) || {}).name || e.ip)}</b><span class="muted">${esc(e.ip)}${e.mac ? ' · ' + esc(e.mac) : ' · 按 IP'}${e.at ? ' · ' + ts(e.at) + ' 拉黑' : ''}</span></div><button class="btn sm good" data-un>解除</button></div>`).join('') : '<div class="empty">还没有拉黑任何设备</div>'}</section>
		<div class="sectitle"><b>其他设备</b><button class="btn sm" data-manual>按 IP 添加</button></div>
		<section class="grid tasks" data-devs>${others.length ? others.map(([d, i]) => devCard(d, i, 'data-d')).join('') : '<div class="card empty">没有其他设备</div>'}</section>`;
	box.onclick = async (e) => {
		if (e.target.closest('[data-setup]')) return busy(e.target.closest('[data-setup]'), blackSetup, false);
		const un = e.target.closest('[data-un]');
		if (un) { const en = blk.entries[+un.closest('[data-e]').dataset.e]; return blackToggle({ mac: en.mac, ip: en.ip, name: en.name }, false, un); }
		const card = e.target.closest('[data-d]');
		if (card) {
			const d = devs[+card.dataset.d];
			if (e.target.closest('[data-black]')) return blackToggle(d, true, e.target.closest('button'));
			if (e.target.closest('[data-conns]')) { $('cnFilter').value = d.ip; go('conn'); }
			return;
		}
		if (e.target.closest('[data-manual]')) {
			const ip = await promptBox('按 IP 拉黑', '例如 192.168.1.20');
			if (!ip) return;
			if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return toast('IP 格式不对', true);
			const d = devs.find((x) => x.ip === ip) || { ip };
			blackToggle(d, true, null);
		}
	};
}

/* ---------- 断线记录 ---------- */
const WDK = { sub: '订阅', node: '节点', tunnel: '隧道', wan: '宽带', net: '外网', dns: 'DNS', panel: '面板服务', clash: '代理插件', boot: '开机', reboot: '关机', watchdog: '看门狗', mem: '内存', cloud: '云端', tablet: '平板' };
let wdData = null;
/* 云端监测（Cloudflare）：路由器断线时也能读到，因为 /cloud/ 在隧道之前就被 Cloudflare 接住了 */
let cloud = null, cloudAt = 0, cloudErr = null, cinfo = null;
// 托管版才有「绑定到账号」
const hubBtn = () => { const b = $('hubBindBtn'); if (b) b.classList.toggle('hidden', !(cinfo && cinfo.hub)); };
try { cloud = JSON.parse(store.get('rp_cloud') || 'null'); cinfo = JSON.parse(store.get('rp_cinfo') || 'null'); } catch (e) {}
// 精简版没有 Cloudflare 云端：路由器说没配置云端，就不去请求 /cloud/，也不显示云端相关卡片
const noCloud = () => !!cinfo && cinfo.enabled === false;
// 读云端用的钥匙：托管版有单独的面板钥匙，自建版用登录密钥
const cloudKey = () => (cinfo && cinfo.pkey) || token;
async function cloudFetch(force) {
	if (noCloud()) { cloud = null; cloudErr = null; return null; }
	if (!force && cloud && Date.now() - cloudAt < 15000) return cloud;
	cloudAt = Date.now();
	const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 12000);
	try {
		const r = await fetch('../cloud/s', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: cloudKey() }), signal: ctl.signal, cache: 'no-store' });
		if (!r.ok) throw new Error(r.status === 403 ? '云端密钥不对' : '云端返回 ' + r.status);
		const j = await r.json();
		j.synced = Date.now(); cloud = j; cloudErr = null;
		store.set('rp_cloud', JSON.stringify(j));
		return j;
	} catch (e) { cloudErr = e.name === 'AbortError' ? '连不上 Cloudflare（超时）' : navigator.onLine === false ? '手机没网' : e.message.startsWith('云端') ? e.message : '连不上 Cloudflare'; throw e; }
	finally { clearTimeout(tm); }
}
// 云端时间换算成「现在」：用同步时手机和云端的时间差，避免手机时钟不准
const cNow = (c) => c.now + (Date.now() - c.synced);
const cAgo = (c, ms) => { const s = Math.max(0, Math.round((cNow(c) - ms) / 1000)); return s < 60 ? s + ' 秒' : s < 3600 ? Math.round(s / 60) + ' 分钟' : (s / 3600).toFixed(1).replace(/\.0$/, '') + ' 小时'; };
const hm = (ms) => new Date(ms).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
function cloudLine(c) {
	if (!c || !c.s || c.s.state === 'ok' || c.s.state === 'wait') return '';
	const st = c.s.outStart || c.s.since;
	return `${c.label[c.s.state] || c.s.state}：${c.s.msg}（从 ${hm(st)} 起，已经 ${cAgo(c, st)}）`;
}
try { wdData = JSON.parse(store.get('rp_wd') || 'null'); } catch (e) {}
async function loadWd(quiet, check) {
	let err = null;
	const ci = P('cloud_info').then((x) => { cinfo = x; store.set('rp_cinfo', JSON.stringify(x)); hubBtn(); }).catch(() => {});
	if (!cinfo) await ci;
	const cp = cloudFetch(true).catch(() => null);
	try {
		const r = await P(check ? 'wd_check' : 'wd', {}, 30000);
		r.synced = Date.now();
		wdData = r;
		store.set('rp_wd', JSON.stringify(r));
		setStatus(true, '在线');
	} catch (e) { err = e; }
	await cp;
	renderWd(err);
	if (err) throw err;
}
/* ---------- 每日体检（每天 9:00 自动，结果推送到手机；这里看最近一次，也能手动体检） ---------- */
const DY = { d: null, at: 0 };
try { DY.d = JSON.parse(store.get('rp_daily') || 'null'); } catch (e) {}
function loadDaily() {
	if (DY.at && Date.now() - DY.at < 60000) return;
	DY.at = Date.now();
	P('daily', {}, 30000).then((d) => { DY.d = d; store.set('rp_daily', JSON.stringify(d)); renderDaily(); }).catch(() => {});
}
function renderDaily() {
	const el = $('dyCard'), pl = $('dyPill'); if (!el) return;
	const d = DY.d && !DY.d.none ? DY.d : null;
	const btn = '<div class="btngrid" style="margin:10px 0 0;grid-template-columns:1fr"><button class="btn" data-dyrun>现在体检</button></div>';
	if (!d) { pl.textContent = '还没体检过'; pl.className = 'pill'; el.innerHTML = `<div class="muted" style="font-size:13.5px;line-height:1.6">每天 9:00 自动体检一次，结果推送到手机（微信 / 浏览器）。也可以现在先体检一次。</div>${btn}`; return; }
	const items = d.items || [], bad = items.filter((i) => i.lvl !== 'ok'), worst = items.some((i) => i.lvl === 'err') ? 'err' : bad.length ? 'warn' : 'ok';
	const when = new Date(d.t * 1000), today = when.toDateString() === new Date().toDateString();
	pl.textContent = d.ok ? '一切正常' : d.summary; pl.className = 'pill ' + (worst === 'ok' ? 'good' : worst === 'warn' ? 'warnc' : 'red');
	const order = { err: 0, warn: 1, ok: 2 };
	el.innerHTML = `<div class="dyhead"><i class="${worst}">${worst === 'ok' ? '✓' : '!'}</i><div><b>${esc(d.ok ? '一切正常' : d.summary)}</b><span>${today ? '今天' : `${when.getMonth() + 1} 月 ${when.getDate()} 日`} ${hm(d.t * 1000)} 体检 · 共 ${items.length} 项</span></div></div>
		${[...items].sort((a, b) => order[a.lvl] - order[b.lvl]).map((i) => `<div class="dyrow"><i class="wdot ${esc(i.lvl)}"></i><div>${esc(i.title)}${i.detail ? `<small>${esc(i.detail)}</small>` : ''}</div></div>`).join('')}
		<p class="muted" style="font-size:12.5px;margin:8px 0 0">每天 9:00 自动体检，结果推送到手机。</p>${btn}`;
}
/* ---------- 自动处理的开关（看门狗自动做的事，可以关掉） ---------- */
const AU = { d: null, at: 0 };
try { AU.d = JSON.parse(store.get('rp_auto') || 'null'); } catch (e) {}
function loadAuto(b) {
	if (!b && AU.at && Date.now() - AU.at < 60000) return Promise.resolve();
	AU.at = Date.now();
	return P('auto', b || {}, 20000).then((d) => { AU.d = d; store.set('rp_auto', JSON.stringify(d)); renderAuto(); });
}
// 每一项自动任务：key、标题、说明（关掉以后会怎样也写清楚）
function autoItems(d) {
	const pn = d.px || '代理插件', on = d.on || {}, L = [];
	const add = (g, k, v, t, desc) => L.push({ g, k, v, t, desc });
	add('出问题时自动修', 'tunrestart', on.tunrestart !== false, '隧道断了自动重启', '连不上 Cloudflare 时自动重启隧道（间隔逐渐拉长，不会一直重启）。关掉后只记录，要自己重启');
	add('出问题时自动修', 'panelrestart', on.panelrestart !== false, '面板服务卡住自动重启', '面板没响应时自动重启面板服务。关掉后面板卡住只能自己重启路由器或服务');
	add('出问题时自动修', 'cacheclean', on.cacheclean !== false, '内存快满时清理缓存', '内存快用完时先清理系统缓存，不影响上网');
	if (d.oc) add('出问题时自动修', 'memguard', !!d.memguard, '内存不够时自动重启 ' + pn, '清理缓存后还不够，就重启一次 ' + pn + ' 释放内存（断网十几秒，会推送告诉你），避免整台路由器死机重启。至少隔 30 分钟、一天最多 6 次');
	if (d.autosw != null) add('出问题时自动修', 'autosw', !!d.autosw, '节点挂了自动换', '每分钟测一次正在用的节点，连不上就换到同地区延迟最低的节点，并推送通知（在「节点」页可以选看哪个策略组）');
	// 开关看「有没有打开」（want）；打开了但有的插件还没生效，下面另外提示
	if (d.oc) add('网络', 'tunbypass', !!(d.tb && (d.tb.want ?? d.tb.on)), '隧道直连 Cloudflare', '面板和 Claude 用的隧道不经过代理插件，' + pn + ' 重启、节点卡住时不会跟着断。直连连不上时会自动改回走代理' + (d.px === 'Nikki' ? '（Nikki 要等它下次重启才生效）' : ''));
	if (d.route) add('网络', 'route', on.route !== false, '面板线路自动选择', '连着家里 Wi-Fi 时，自动选能打开面板的那条路（直连或走代理）。关掉后保持现在的走法');
	add('提醒和备份', 'daily', on.daily !== false, '每日体检', '每天 9:00 自动检查一遍，结果推送到手机。关掉后不再自动体检，「现在体检」照样能用');
	add('提醒和备份', 'newdev', on.newdev !== false, '新设备连上提醒', '有没见过的设备连上 Wi-Fi 时推送通知。关掉后照样记下来，在「设备」页能看到');
	if (d.cloud) add('提醒和备份', 'cloudbackup', on.cloudbackup !== false, '云端自动备份', '每天 4:07 把路由器设置备份到云端，保留最近 10 份。关掉后「立即备份」照样能用');
	return L;
}
function renderAuto() {
	const el = $('auCard'), pl = $('auPill'); if (!el) return;
	const d = AU.d;
	if (!d) { pl.textContent = '—'; pl.className = 'pill'; return; }
	const row = (x) => `<label class="kv aswon" data-au="${x.k}"><span><b>${esc(x.t)}</b><span class="muted">${esc(x.desc)}</span></span><span class="sw"><input type="checkbox" ${x.v ? 'checked' : ''}><i></i></span></label>`;
	const day = (t) => { const x = new Date(t * 1000); return (x.getMonth() + 1) + ' 月 ' + x.getDate() + ' 日 ' + hm(t * 1000); };
	const items = autoItems(d);
	// 每一组一张卡片，标题在卡片外面（跟其他页面一样）
	const groups = [];
	for (const x of items) { let g = groups.find((y) => y.g === x.g); if (!g) groups.push(g = { g: x.g, list: [] }); g.list.push(x); }
	const note = (x) => x.k !== 'tunbypass' ? '' : x.v ? (d.tb.status === '还没生效' ? '<div class="notice" style="margin:2px 0 8px">已打开，还有代理插件没生效：Nikki 要等它下次重启；其他的过几分钟会自动补上。</div>' : '') : d.tb.auto ? `<div class="notice w" style="margin:2px 0 8px">直连 Cloudflare 一直连不上，${d.tb.at ? day(d.tb.at) + ' ' : ''}已自动改回走代理，一天后会再试一次直连。</div>` : '';
	let html = groups.map((g) => `<div class="sectitle"><b>${esc(g.g)}</b></div><section class="card aucard">${g.list.map((x) => row(x) + note(x)).join('')}</section>`).join('');
	if (!d.oc) html += '<p class="muted" style="font-size:12.5px;margin:10px 4px 0">这台路由器没装代理插件，跟代理插件有关的几项不显示。</p>';
	el.innerHTML = html;
	const n = items.filter((x) => x.v).length;
	pl.textContent = n === items.length ? '全部开启' : n ? `开了 ${n} / ${items.length} 项` : '全部关闭';
	pl.className = 'pill ' + (n === items.length ? 'good' : '');
}
$('auCard').addEventListener('click', (ev) => { const au = ev.target.closest('[data-au]'); if (au && ev.target.matches('input')) setAuto(au); });
function setAuto(lb) {
	const k = lb.dataset.au, inp = lb.querySelector('input'), on = inp.checked;
	const it = AU.d ? autoItems(AU.d).find((x) => x.k === k) : null;
	busy(null, async () => {
		try { await loadAuto({ set: true, [k]: on }); toast((on ? '已开启：' : '已关闭：') + (it ? it.t : '')); }
		catch (e) { inp.checked = !on; throw e; }
	});
}
function renderWd(err) {
	const box = $('wdBody'), d = wdData, st = (d && d.state) || {};
	const off = err instanceof OfflineError;
	const hms = (t) => new Date(t * 1000).toLocaleTimeString('zh-CN', { hour12: false });
	const dayOf = (t) => {
		const x = new Date(t * 1000), n = new Date();
		if (x.toDateString() === n.toDateString()) return '今天';
		if (x.toDateString() === new Date(n - 864e5).toDateString()) return '昨天';
		return `${x.getMonth() + 1} 月 ${x.getDate()} 日`;
	};
	const ago = (ms) => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? '刚刚' : s < 3600 ? Math.round(s / 60) + ' 分钟前' : s < 86400 ? Math.round(s / 3600) + ' 小时前' : Math.round(s / 86400) + ' 天前'; };
	// 连不上时各项状态都不知道了；只有「隧道断开」(1033) 能确定是隧道的问题
	const item = (label, v, isTun) => {
		if (off) return isTun && err.short === '隧道断开' ? `<div><i class="wdot err"></i><b>${label}</b><span class="bad">断开</span></div>` : `<div><i class="wdot"></i><b>${label}</b><span>未知</span></div>`;
		return `<div><i class="wdot ${!d ? '' : v === 'ok' ? 'ok' : 'err'}"></i><b>${label}</b><span class="${!d ? '' : v === 'ok' ? 'good' : 'bad'}">${!d ? '—' : v === 'ok' ? '正常' : '异常'}</span></div>`;
	};
	const pill = off ? ['warnc', '离线'] : !d ? ['', '读取中'] : d.running ? ['good', '看门狗运行中'] : ['red', '看门狗没运行'];
	const c = cloud;
	const evs = [...((d && d.events) || []), ...((c && c.events) || []).map((e) => ({ ...e, t: Math.round(e.t / 1000) }))].sort((a, b) => b.t - a.t);
	const wk = (d ? d.now : Date.now() / 1000) - 7 * 86400;
	const cnt = (f) => evs.filter((e) => e.t >= wk && f(e)).length;
	const sum = [['隧道断开', cnt((e) => e.kind === 'tunnel' && e.lvl === 'err')], ['宽带/外网断开', cnt((e) => (e.kind === 'wan' || e.kind === 'net') && e.lvl === 'err')], ['意外重启', cnt((e) => e.kind === 'boot' && e.lvl === 'err')], ['自动修复', cnt((e) => e.kind === 'watchdog' && e.lvl === 'warn' || e.kind === 'panel' && e.lvl === 'err')]];
	const opened = new Set($$('details[open]', box).map((x) => x.dataset.k));
	let html = `<div class="hero"><div class="herohead"><h1>断线记录</h1><span class="pill ${pill[0]}">${pill[1]}</span></div>
		<p class="muted" style="margin-bottom:0">看门狗每 30 秒检查一次宽带、外网、DNS、隧道、面板和 OpenClash，断了会自动修复并记下原因。记录存在路由器闪存里，断电重启也不会丢。</p>
		${off ? `<div class="notice w" style="margin-top:12px">现在连不上路由器：${esc(err.message)}。${c && cloudLine(c) ? `<br><b>Cloudflare 实时判断：</b>${esc(cloudLine(c))}` : cloudErr && ['离线', '超时', '手机没网'].includes(err.short) ? '<br><b>Cloudflare 也连不上</b>：多半是你的手机现在没网或网络不稳；如果手机连着家里这台路由器的 Wi-Fi，也可能是 ' + (pxAct()?.name || '代理插件') + ' 正在重启。' : c && ['离线', '超时', '手机没网'].includes(err.short) && c.s.state === 'ok' && c.r && cNow(c) - c.r.last < 150e3 ? `<br><b>Cloudflare 显示路由器一切正常</b>（${cAgo(c, c.r.last)}前刚报告过），是你的手机到 Cloudflare 这一段不通（手机网络不稳，或者手机连着家里这台路由器而 ${esc(pxAct()?.name || '代理插件')} 正在重启），稍后下拉刷新就好。` : ''}<br>${d ? `下面路由器自己的记录是${ago(d.synced)}同步的，路由器连上后会自动更新。` : '这台手机还没有同步过路由器的记录。'}</div>` : ''}
		${d && !d.running && !off ? '<div class="notice w" style="margin-top:12px">看门狗没在运行，断线不会被自动修复和记录。</div>' : ''}
		<div class="wdst">${item('宽带', st.WAN)}${item('外网', st.NET)}${item('DNS', st.DNS)}${item('隧道', st.TUN, true)}${item('面板', st.PANEL)}${item('代理', st.CLASH)}</div>
		${d && st.CHECK_T ? `<div class="muted" style="font-size:12px;margin-top:8px">上次检查 ${hms(+st.CHECK_T)}${st.READY ? ` · 隧道 ${esc(st.READY)} 条连接` : ''} · 路由器已运行 ${dur(d.uptime)}</div>` : ''}
		<div class="btngrid" style="margin:12px 0 0"><button class="btn primary" data-wdcheck ${off ? 'disabled' : ''}>立即检查</button><button class="btn" data-wdclear ${off || !d ? 'disabled' : ''}>清空记录</button></div></div>`;
	// 云端监测卡片
	if (c || cloudErr) {
		const cs = c && c.s ? c.s.state : 'wait';
		const cls = { ok: 'good', partial: 'warnc', noreport: 'warnc', wait: '' }[cs] ?? 'red';
		const rAgo = c && c.r ? cAgo(c, c.r.last) + '前' : '还没收到';
		const pr = c && c.probe ? (c.probe.code === 200 ? '正常' : `失败（${c.probe.code === 530 ? '隧道断开 1033' : c.probe.code ? '错误 ' + c.probe.code : '超时'}）`) + ' · ' + cAgo(c, c.probe.at) + '前' : '—';
		const tFresh = c && c.t && cNow(c) - c.t.last < 150e3;
		const tb = !c || !c.t ? '还没设置' : tFresh ? '正常 · ' + cAgo(c, c.t.last) + '前' : '没在报告 · 最后一次 ' + cAgo(c, c.t.last) + '前';
		html += `<div class="sectitle"><b>云端监测</b><span class="pill ${c ? cls : ''}">${c ? esc(c.label[cs] || cs) : '读不到'}</span></div>
		<section class="card" data-cloud>
			${cloudErr ? `<div class="notice w" style="margin-bottom:8px">${esc(cloudErr)}${c ? `，下面是${ago(c.synced)}的云端数据` : ''}</div>` : ''}
			${c && cs !== 'ok' && cs !== 'wait' ? `<div class="notice ${cls === 'red' ? 'd' : 'w'}" style="margin-bottom:8px">${esc(cloudLine(c))}</div>` : ''}
			<div class="kv"><span>路由器报告</span><span>${rAgo}</span></div>
			<div class="kv"><span>隧道探测</span><span>${pr}</span></div>
			<div class="kv"><span>平板（证人）</span><span class="${c && c.t ? (tFresh ? 'okc' : 'badc') : ''}">${tb}</span></div>
			<p class="muted" style="font-size:12.5px;margin:8px 0 0">Cloudflare 一直在收路由器的心跳（一切正常时每 3 分钟记一次），路由器断电、断网时也照常判断和记录。${!c || !c.t ? '加一台平板作证，断线时就能分清是断电还是断网。' : ''}</p>
			<div class="btngrid" style="margin:10px 0 0"><button class="btn" data-tablet>平板设置方法</button></div>
		</section>`;
	}
	html += `<div class="sectitle"><b>每日体检</b><span class="pill" id="dyPill">—</span></div><section class="card" id="dyCard"><div class="muted" style="font-size:13px">读取中…</div></section>`;
	html += `<section class="card list" style="margin-top:12px"><button class="file" data-goauto><div><b>自动任务</b><span class="muted">出了问题自动修、定时提醒和备份，每一项都能开关</span></div><span class="muted">›</span></button></section>`;
	html += noCloud() ? `<div class="sectitle"><b>手机通知</b><span class="pill">未启用</span></div><section class="card"><div class="muted" style="font-size:13px">手机推送、微信推送、云端备份和断电/断网判断需要 Cloudflare 云端（完整版）。装好云端后在路由器上重新运行安装脚本选完整版即可。</div></section>`
		: `<div class="sectitle"><b>手机通知</b><span class="pill" id="pushPill">—</span></div><section class="card" id="pushCard"><div class="muted" style="font-size:13px">读取中…</div></section>`;
	html += `<div class="sectitle"><b>最近 7 天</b></div><div class="wdsum">${sum.map(([k, n]) => `<span class="pill ${n ? (k === '自动修复' ? 'blue' : 'red') : ''}">${k} ${n} 次</span>`).join('')}</div>`;
	if (!evs.length) html += `<div class="card empty" style="margin-top:12px">${d ? '还没有记录，一切正常' : '还没有记录'}</div>`;
	let cur = '';
	evs.forEach((e) => {
		const dy = dayOf(e.t);
		if (dy !== cur) { cur = dy; html += `<div class="sectitle"><b>${dy}</b></div>`; }
		const k = e.t + e.kind;
		html += `<div class="wdev"><i class="wdot ${esc(e.lvl)}"></i><div style="min-width:0"><div class="tm">${hms(e.t)} · ${esc(WDK[e.kind] || e.kind)}</div><div class="ms">${esc(e.msg)}</div>${e.from && e.to > e.from ? `<div class="tm">${ts(e.from)} → ${ts(e.to)}</div>` : ''}</div>${e.detail ? `<details data-k="${esc(k)}" ${opened.has(k) ? 'open' : ''}><summary>详细信息</summary><pre>${esc(e.detail)}</pre></details>` : ''}</div>`;
	});
	box.innerHTML = html;
	renderDaily(); if (!off) loadDaily();
	box.onclick = async (ev) => {
		if (ev.target.closest('[data-goauto]')) return go('auto');
		const dr = ev.target.closest('[data-dyrun]');
		if (dr) return busy(dr, async () => { DY.d = await P('daily', { run: 1 }, 90000); DY.at = Date.now(); store.set('rp_daily', JSON.stringify(DY.d)); renderDaily(); toast('体检完成：' + (DY.d.summary || '')); }, '体检中');
		const c = ev.target.closest('[data-wdcheck]');
		if (c) return busy(c, async () => { await loadWd(false, true); toast('检查完成'); }, '检查中');
		const x = ev.target.closest('[data-wdclear]');
		if (x && await confirmBox('清空断线记录', '路由器和云端的记录都会清空，之前的断线原因就看不到了。', '清空', true)) busy(x, async () => {
			await P('wd_clear', {});
			await fetch('../cloud/s', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: cloudKey(), clear: true }) }).catch(() => {});
			toast('已清空'); refresh(true);
		});
		if (ev.target.closest('[data-tablet]')) tabletHelp();
	};
	pushRender();
}

/* ---------- 手机通知（Web Push） ---------- */
const PUSH = { st: null, at: 0 };
const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function cloudPush(b) {
	const r = await fetch('../cloud/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: cloudKey(), ...b }), cache: 'no-store' });
	if (!r.ok) {
		let m = null;
		try { m = (await r.json()).error; } catch (e) {}
		throw new Error(r.status === 403 ? '云端不认这个密钥' : m || '连不上云端（' + r.status + '）');
	}
	return r.json();
}
async function swReg() {
	return Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('后台服务还没准备好，刷新一下再试')), 6000))]);
}
function devName() {
	const m = navigator.userAgent.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/);
	return m && m[1] !== 'K' ? m[1].trim() : /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? '安卓手机' : '电脑';
}
async function pushState(force) {
	if (!force && PUSH.st && Date.now() - PUSH.at < 60e3) return PUSH.st;
	const ok = pushOk();
	let sub = null, subs = null, err = null, wx = null;
	if (ok) try { sub = await (await swReg()).pushManager.getSubscription(); } catch (e) { err = e.message; }
	try { const r = await cloudPush({ op: 'list', endpoint: sub ? sub.endpoint : '' }); subs = r.subs; wx = r.wx || null; } catch (e) { err = err || e.message; }
	PUSH.at = Date.now();
	return (PUSH.st = { ok, perm: ok ? Notification.permission : 'default', sub, subs, err, wx });
}
function pushRender() {
	const el = $('pushCard');
	if (!el) return;
	const s = PUSH.st;
	const pill = $('pushPill');
	if (!s) { pushState().then(pushRender).catch(() => {}); return; }
	const on = s.ok && s.sub && s.perm === 'granted' && (s.subs || []).some((x) => x.me);
	const wx = s.wx || {}, wOn = !!wx.on;
	pill.className = 'pill ' + (on || wOn ? 'good' : '');
	pill.textContent = on || wOn ? '已开启' : '未开启';
	const list = `<p class="muted" style="margin:0;font-size:13.5px">路由器出问题时直接通知你，不用打开面板也能知道：</p><ul class="pushl" style="margin-bottom:4px"><li>路由器断电、断网、隧道断开，以及恢复正常</li><li>OpenClash 停了、DNS 坏了、内存耗尽</li><li>平板（证人）停止报告</li></ul>`;
	// 微信（PushPlus）：云端直接发，不依赖浏览器
	const wxh = wOn ? `<div class="subhd">微信推送</div>
		<div class="kv"><span>微信</span><span class="okc">已开启 · token …${esc(wx.tail || '')}</span></div>
		${wx.ok ? `<div class="kv"><span>上一条</span><span class="okc">${hm(wx.ok)} 已发到微信</span></div>` : ''}
		${wx.err && (wx.errAt || 0) > (wx.ok || 0) ? `<div class="notice w" style="margin-top:8px">${hm(wx.errAt)} 发送失败：${esc(wx.err)}</div>` : ''}
		<div class="btngrid" style="margin:12px 0 0"><button class="btn blue" data-wxtest>发一条测试</button><button class="btn" data-wxoff>关闭微信推送</button></div>`
		: `<div class="subhd">微信推送 <span class="tagrec">推荐</span></div>
		<ol class="steps wxsteps"><li>在微信里打开 <b>www.pushplus.plus</b>（把网址发给「文件传输助手」再点开），用微信登录，按提示关注公众号。</li><li>在「一对一推送」页面复制你的 <b>token</b>（一串字母和数字）。</li><li>粘贴到下面点「开启」，微信会马上收到一条消息。</li></ol>
		<div class="addrow"><input class="input" data-wxin placeholder="粘贴 PushPlus 的 token" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary" type="button" data-wxon>开启</button></div>`;
	// 浏览器通知（部分浏览器收不到，比如安卓 Edge）
	let bh;
	const others = (s.subs || []).filter((x) => !x.me);
	if (!s.ok) bh = `<p class="muted" style="margin:4px 0 0;font-size:13px">这个浏览器不支持推送通知。</p>`;
	else if (s.perm === 'denied') bh = `<div class="notice w">通知权限被关掉了：到手机「设置 → 应用 → 浏览器 → 通知」里打开，再回来点开启。</div>`;
	else if (!on) bh = `<p class="muted" style="margin:4px 0 0;font-size:13px">弹在手机通知栏。安卓 Edge 收不到，要用 Chrome。</p>
		${s.err ? `<div class="notice w" style="margin-top:8px">${esc(s.err)}</div>` : ''}
		<div class="btngrid" style="margin:10px 0 0"><button class="btn" data-pushon>开启浏览器通知</button></div>`;
	else {
		const me = (s.subs || []).find((x) => x.me) || {};
		bh = `<div class="kv"><span>这台手机</span><span class="okc">已开启</span></div>
		${me.sent ? `<div class="kv"><span>上一条</span><span>${pushRecv(me)}</span></div>` : ''}
		${PUSH.diag ? `<div class="notice ${PUSH.diag.ok ? '' : 'w'}" style="margin-top:8px">${PUSH.diag.html}</div>` : ''}
		<div class="btngrid three" style="margin:12px 0 0"><button class="btn" data-pushtest>发一条测试</button><button class="btn" data-pushlocal>本机弹一条</button><button class="btn" data-pushoff>关闭</button></div>`;
	}
	el.innerHTML = list + wxh + `<div class="subhd">浏览器通知</div>` + bh + (others.length ? `<div class="kv"><span>其他设备的浏览器</span><span>${others.map((x) => esc(x.name)).join('、')}</span></div>` : '');
	el.onclick = async (e) => {
		const on1 = e.target.closest('[data-pushon]'), t = e.target.closest('[data-pushtest]'), off1 = e.target.closest('[data-pushoff]'), loc = e.target.closest('[data-pushlocal]');
		const wxon = e.target.closest('[data-wxon]'), wxt = e.target.closest('[data-wxtest]'), wxoff = e.target.closest('[data-wxoff]');
		if (wxon) busy(wxon, async () => {
			const v = (el.querySelector('[data-wxin]').value || '').replace(/\s+/g, '');
			if (!v) return toast('先粘贴 PushPlus 的 token', true);
			const r = await cloudPush({ op: 'wx', wx: v });
			PUSH.st.wx = r.wx; pushRender();
			toast('微信推送已开启，看看微信收到没有');
		}, '验证中');
		if (wxt) busy(wxt, async () => {
			const r = await cloudPush({ op: 'test' });
			PUSH.st.wx = r.wx; pushRender();
			if (r.wx && r.wx.err && (r.wx.errAt || 0) > (r.wx.ok || 0)) toast('微信没发出去：' + r.wx.err, true);
			else toast('已发到微信');
		}, '发送中');
		if (wxoff) busy(wxoff, async () => {
			const r = await cloudPush({ op: 'wx', wx: '' });
			PUSH.st.wx = r.wx; pushRender();
			toast('已关闭微信推送');
		});
		if (loc) busy(loc, async () => {
			// 不经过推送服务，直接在本机弹一条：能看到 → 手机允许浏览器弹通知；看不到 → 系统设置把通知关了
			const reg = await swReg();
			await reg.showNotification('本机通知测试', { body: '能看到这条，说明手机允许浏览器弹通知', tag: 'local', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: './?p=wd' } });
			toast('已经在本机弹了一条，看看通知栏');
		});
		if (on1) busy(on1, async () => {
			const perm = await Notification.requestPermission();
			if (perm !== 'granted') { await pushState(true); pushRender(); return toast(perm === 'denied' ? '通知权限被拒绝了' : '没有允许通知', true); }
			const key = (await (await fetch('../cloud/push/key', { cache: 'no-store' })).json()).key;
			if (!key) throw new Error('云端还没配置推送');
			const reg = await swReg();
			const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((key.length + 3) % 4)), (c) => c.charCodeAt(0));
			const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw }));
			await cloudPush({ op: 'sub', sub: sub.toJSON(), name: devName() });
			await pushState(true); pushRender();
			toast('通知已开启，正在发一条测试');
			pushTest().catch((e) => toast(e.message, true));
		}, '开启中');
		if (t) busy(t, () => pushTest(), '发送中');
		if (off1) busy(off1, async () => {
			const sub = PUSH.st.sub;
			if (sub) { await cloudPush({ op: 'unsub', endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
			await pushState(true); pushRender();
			toast('已关闭，这台手机不会再收到通知');
		});
	};
}
function pushRecv(m) {
	const t = (x) => new Date(x).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
	if (m.recv && m.recv.shown) return `<span class="okc">${t(m.sent)} 已送到这台手机</span>`;
	if (m.recv) return `<span style="color:var(--warn)">${t(m.sent)} 收到了但弹不出来</span>`;
	return `<span class="muted">${t(m.sent)} 已发出，手机没回应</span>`;
}
// 发一条测试，然后等手机回报，自动判断问题出在哪
async function pushTest() {
	const ep = PUSH.st && PUSH.st.sub && PUSH.st.sub.endpoint;
	if (!ep) throw new Error('这台手机还没开启通知');
	PUSH.diag = { ok: true, html: '测试已发出，正在等手机回应…' }; pushRender();
	const r = await cloudPush({ op: 'test', endpoint: ep });
	if (!r.sent) { PUSH.diag = { ok: false, html: '云端没发出去：推送服务拒绝了。点「关闭通知」再重新开启试试。' }; pushRender(); return; }
	let me = null;
	for (let i = 0; i < 10; i++) {
		await new Promise((res) => setTimeout(res, 2000));
		await pushState(true);
		me = (PUSH.st.subs || []).find((x) => x.me);
		if (me && me.recv) break;
	}
	if (me && me.recv && me.recv.shown) PUSH.diag = { ok: true, html: '<b>手机已经收到了。</b>如果通知栏没看到，是系统把浏览器的通知藏起来了：到「设置 → 应用 → Edge → 通知」把通知和「网站」类别都打开，并允许横幅/悬浮通知。' };
	else if (me && me.recv) PUSH.diag = { ok: false, html: '<b>手机收到了，但弹不出来</b>（' + esc(me.recv.err || me.recv.perm || '没有权限') + '）。到「设置 → 应用 → Edge → 通知」打开通知，再到 Edge 的「网站设置 → 通知」里允许这个网站。' };
	else PUSH.diag = { ok: false, html: '<b>云端已经发出，但 20 秒内手机没收到。</b>多半是 Edge 在后台被系统限制了：到「设置 → 应用 → Edge → 省电策略」改成「无限制」，并允许自启动/后台运行。还不行就用 Chrome 打开面板再开启一次（Chrome 的推送最稳）。' };
	pushRender();
}
// 点通知打开面板时，后台服务会告诉面板该去哪一页
try { navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (e) => { const p = e.data && e.data.go; if (p && validPage(p) && token) go(p); if (e.data && e.data.pushed && $('pushCard')) pushState(true).then(pushRender).catch(() => {}); }); } catch (e) {}

function tabletHelp() {
	const u = cinfo && cinfo.tablet;
	modal(`<div class="sheethead"><h3>平板设置方法</h3><button class="btn sm" data-v="close">关闭</button></div>
		<p class="muted" style="margin-top:0">让平板每分钟向 Cloudflare 报告一次。路由器没声音而平板还在报告，就是路由器断电；两个都没声音，就是家里断网。</p>
		<ol class="steps">
			<li><b>连另一个网络</b>（光猫或另一台路由器的 Wi-Fi），不要连这台路由器的 Wi-Fi。在「设置 → WLAN → 高级设置」里把「休眠时保持 WLAN 连接」设为始终（如果有这个选项）。</li>
			<li><b>安装 MacroDroid</b>：在应用商店搜，搜不到就用浏览器打开 macrodroid.com 下载安装包。免费版就够用。</li>
			<li><b>新建一个宏</b>：<br>触发器选「日期/时间 → 定时触发（Regular Interval）」，间隔 1 分钟；<br>动作选「连接 → HTTP 请求（HTTP Request）」，方法 GET，网址填下面这个；<br>名字随便起，比如「路由器证人」，保存。</li>
			<li><b>不让系统关掉它</b>：设置 → 应用 → 应用管理 → MacroDroid：打开「自启动」，电池/耗电管理设为「不限制」或「允许后台运行」。再在最近任务里把 MacroDroid 的卡片往下拉锁住。</li>
			<li><b>插着电放着</b>，屏幕可以关。</li>
			<li>回到这一页，「云端监测」里的「平板（证人）」变成「正常」就设置好了（最多等 1 分钟）。</li>
		</ol>
		<div class="kv" style="display:block"><span style="display:block;margin-bottom:6px">平板要访问的网址（只给这台平板用，别发给别人）</span>
		${u ? `<div class="mono" style="font-size:12px;word-break:break-all;background:var(--fill);padding:8px 10px;border-radius:10px" data-u>${esc(u)}</div>` : '<div class="muted">路由器连上后才能显示</div>'}</div>
		<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-v="close">关闭</button><button class="btn primary" data-c ${u ? '' : 'disabled'}>复制网址</button></div>`,
	(m) => { const b = m.querySelector('[data-c]'); if (b && u) b.onclick = () => copyText(u); });
}

/* ---------- 终端 ---------- */
let termCwd = store.get('rp_cwd') || '/root', termHist = [], termIdx = -1;
try { termHist = JSON.parse(store.get('rp_hist') || '[]'); } catch (e) {}
const TERM_QUICK = [['系统状态', 'uptime; free -m; df -h /overlay /tmp'], ['网络接口', 'ifstatus wan | head -30; ip -4 addr'], ['进程', 'top -bn1 | head -25'], ['系统日志', 'logread | tail -n 40'], ['OpenClash 进程', 'ps w | grep -E "[c]lash|[o]penclash"'], ['可更新的包', 'opkg list-upgradable 2>/dev/null || apk version -l "<" 2>/dev/null']];
function termPrint(html) { const t = $('termOut'); t.insertAdjacentHTML('beforeend', html); t.scrollTop = t.scrollHeight; }
function termPs() { $('termPs').textContent = termCwd.replace(/^\/root(?=\/|$)/, '~') + ' #'; }
async function termRun(cmd) {
	cmd = cmd.trim(); if (!cmd) return;
	if (cmd === 'clear') { $('termOut').innerHTML = ''; return; }
	termHist = termHist.filter((x) => x !== cmd); termHist.push(cmd); termHist = termHist.slice(-50); termIdx = -1;
	store.set('rp_hist', JSON.stringify(termHist));
	termPrint(`<span class="cmd">${esc($('termPs').textContent)} ${esc(cmd)}</span>\n`);
	if (/^(vi|vim|nano|top|less|more|htop)(\s|$)/.test(cmd) && !/-b/.test(cmd)) { termPrint('<span class="err">这里是一次性执行，不支持需要交互的命令。查看文件用 cat，编辑文件请用「文件管理」。</span>\n'); return; }
	const btn = $('termGo'); btn.disabled = true; btn.innerHTML = '<span class="spin">↻</span>';
	try {
		const r = await P('term', { cmd, cwd: termCwd, timeout: 100 }, 115000);
		if (r.out) termPrint(esc(r.out) + '\n');
		if (r.code === 'timeout') termPrint('<span class="err">（运行超过 100 秒，已停止）</span>\n');
		else if (r.code) termPrint(`<span class="dim">（退出码 ${esc(r.code)}）</span>\n`);
		termCwd = r.cwd || termCwd; store.set('rp_cwd', termCwd); termPs();
	} catch (e) { termPrint(`<span class="err">${esc(e.message)}</span>\n`); }
	finally { btn.disabled = false; btn.textContent = '执行'; }
}
function initTerm() {
	if ($('termOut').dataset.init) return;
	$('termOut').dataset.init = '1';
	termPs();
	termPrint('<span class="dim">路由器终端（root）。每条命令单独执行，最长 100 秒；cd 会记住目录。输入 clear 清屏。</span>\n');
	$('termQuick').innerHTML = TERM_QUICK.map(([t], i) => `<button class="chip" data-q="${i}">${esc(t)}</button>`).join('');
	$('termQuick').onclick = (e) => { const b = e.target.closest('[data-q]'); if (b) termRun(TERM_QUICK[+b.dataset.q][1]); };
	const inp = $('termIn');
	const go2 = () => { const v = inp.value; inp.value = ''; termRun(v); };
	$('termGo').onclick = go2;
	inp.onkeydown = (e) => {
		if (e.key === 'Enter') { e.preventDefault(); go2(); }
		if (e.key === 'ArrowUp' && termHist.length) { e.preventDefault(); termIdx = termIdx < 0 ? termHist.length - 1 : Math.max(0, termIdx - 1); inp.value = termHist[termIdx]; }
		if (e.key === 'ArrowDown' && termIdx >= 0) { e.preventDefault(); termIdx++; if (termIdx >= termHist.length) { termIdx = -1; inp.value = ''; } else inp.value = termHist[termIdx]; }
	};
	$('termHist').onclick = () => modal(`<div class="sheethead"><h3>历史命令</h3><button class="btn sm" data-v="close">关闭</button></div>${termHist.length ? termHist.slice().reverse().map((h, i) => `<button class="file" data-v="h${termHist.length - 1 - i}"><span class="mono ell" style="flex:1;min-width:0">${esc(h)}</span><span class="muted">填入 ›</span></button>`).join('') : '<div class="empty">还没有历史命令</div>'}`).then((v) => { if (typeof v === 'string' && v[0] === 'h') { inp.value = termHist[+v.slice(1)]; inp.focus(); } });
	$('termClear').onclick = () => { $('termOut').innerHTML = ''; };
}

/* ---------- 文件管理 ---------- */
let fmPath = store.get('rp_fm') || '/etc/openclash', fmItems = [];
const fmJoin = (d, n) => (d === '/' ? '' : d) + '/' + n;
async function loadFiles() {
	const r = await P('fs_list', { path: fmPath }).catch(async (e) => { if (fmPath !== '/') { fmPath = '/'; return P('fs_list', { path: '/' }); } throw e; });
	setStatus(true, '在线');
	fmPath = r.path; fmItems = r.items; store.set('rp_fm', fmPath);
	const parts = fmPath.split('/').filter(Boolean);
	$('fmCrumb').innerHTML = `<button data-p="/">/</button>` + parts.map((p, i) => `<span class="muted">›</span><button data-p="/${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</button>`).join('');
	$('fmInfo').textContent = `${fmItems.length} 项${r.free ? ' · ' + r.free : ''}`;
	$('fmList').innerHTML = (fmPath !== '/' ? '<button class="file" data-up><div style="display:flex;gap:10px;align-items:center"><span class="fico">↰</span><b>上一级</b></div></button>' : '') +
		(fmItems.length ? fmItems.map((f, i) => `<button class="file" data-f="${i}"><div style="display:flex;gap:10px;align-items:center;min-width:0"><span class="fico ${f.dir ? 'd' : ''}">${f.dir ? '▸' : f.link ? '↗' : '≡'}</span><div style="min-width:0"><b>${esc(f.name)}</b><span class="muted">${f.dir ? '文件夹' : B(f.size)} · ${ts(f.mtime)} · ${esc(f.mode)}${f.link ? ' · 链接' : ''}</span></div></div><span class="muted">›</span></button>`).join('') : '<div class="empty">空文件夹</div>');
}
function fmGo(p) { fmPath = p; refresh(); }
$('fmCrumb').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) fmGo(b.dataset.p); };
$('fmList').onclick = (e) => {
	if (e.target.closest('[data-up]')) return fmGo(fmPath.replace(/\/[^/]+$/, '') || '/');
	const b = e.target.closest('[data-f]'); if (!b) return;
	const f = fmItems[+b.dataset.f];
	if (f.dir) return fmGo(fmJoin(fmPath, f.name));
	fmSheet(f);
};
async function fmSheet(f) {
	const p = fmJoin(fmPath, f.name);
	const v = await modal(`<div class="sheethead"><h3 class="ell">${esc(f.name)}</h3><button class="btn sm" data-v="close">关闭</button></div>
		<div class="kv"><span>位置</span><span class="mono">${esc(p)}</span></div><div class="kv"><span>大小</span><span>${B(f.size)}</span></div><div class="kv"><span>修改时间</span><span>${ts(f.mtime)}</span></div><div class="kv"><span>权限</span><span class="mono">${esc(f.mode)}</span></div>
		<div class="btngrid"><button class="btn blue" data-v="edit">查看 / 编辑</button><button class="btn" data-v="dl">下载到手机</button><button class="btn" data-v="ren">改名 / 移动</button><button class="btn" data-v="cp">复制</button><button class="btn" data-v="mod">改权限</button><button class="btn danger" data-v="del">删除</button></div>`);
	if (v === 'edit') return fmEdit(p);
	if (v === 'dl') return busy(null, async () => { const r = await P('fs_download', { path: p }, 90000); download(r.url, r.name); toast('开始下载'); });
	if (v === 'ren') { const to = await promptBox('改名 / 移动到', '新的完整路径', p); if (to && to !== p) busy(null, async () => { await P('fs_rename', { path: p, to }); toast('已完成'); refresh(true); }); }
	if (v === 'cp') { const to = await promptBox('复制到', '新的完整路径', p + '.bak'); if (to) busy(null, async () => { await P('fs_copy', { path: p, to }); toast('已复制'); refresh(true); }); }
	if (v === 'mod') { const m = await promptBox('改权限', '例如 644 或 755', f.mode); if (m) busy(null, async () => { await P('fs_chmod', { path: p, mode: m }); toast('已修改'); refresh(true); }); }
	if (v === 'del') { if (await confirmBox('删除 ' + f.name, p + '\n删除后不能恢复。', '删除', true)) busy(null, async () => { await P('fs_delete', { path: p }); toast('已删除'); refresh(true); }); }
}
async function fmEdit(p) {
	let r;
	try { toast('读取中…'); r = await P('fs_read', { path: p }); toastHide(); } catch (e) { return handleErr(e); }
	if (r.binary) return toast('这是二进制文件，不能直接编辑，可以下载到手机', true);
	if (r.toobig) return toast('文件超过 2MB，手机上不方便编辑，可以下载', true);
	await modal(`<div class="sheethead"><h3 class="ell">${esc(p.split('/').pop())}</h3><button class="btn sm" data-v="false">取消</button></div>
		<div class="muted mono ell" style="margin-bottom:6px">${esc(p)}</div>
		<textarea class="input" data-t spellcheck="false" autocapitalize="off" style="min-height:55vh">${esc(r.content)}</textarea>
		<div class="muted" style="margin-top:6px">${B(r.size)} · 保存前会自动备份旧版本到 /etc/claude-mcp/bak</div>
		<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-v="false">取消</button><button class="btn primary" data-s>保存</button></div>`,
	(m, close) => {
		m.dataset.lock = '1';
		const s = m.querySelector('[data-s]');
		s.onclick = () => busy(s, async () => { await P('fs_write', { path: p, content: m.querySelector('[data-t]').value, overwrite: true }); close(true); toast('已保存'); refresh(true); });
	});
}
$('fmNewFile').onclick = async () => { const n = await promptBox('新建文件', '文件名'); if (n) busy(null, async () => { const p = fmJoin(fmPath, n); await P('fs_write', { path: p, content: '', create: true }); refresh(true); fmEdit(p); }); };
$('fmNewDir').onclick = async () => { const n = await promptBox('新建文件夹', '文件夹名'); if (n) busy(null, async () => { await P('fs_mkdir', { path: fmJoin(fmPath, n) }); toast('已新建'); refresh(true); }); };
$('fmUpload').onclick = async () => {
	const f = await pickFile(''); if (!f) return;
	if (f.size > 2.9 * 1024 * 1024) return toast('手机上传限 3MB 以内', true);
	const p = fmJoin(fmPath, f.name), exists = fmItems.some((x) => x.name === f.name);
	if (exists && !(await confirmBox('覆盖 ' + f.name, '这个文件夹里已经有同名文件，覆盖前会自动备份旧文件。', '覆盖', true))) return;
	busy($('fmUpload'), async () => { await P('fs_write', { path: p, b64: await readB64(f), overwrite: true }, 90000); toast('已上传 ' + f.name); refresh(true); }, '上传中');
};
$('fmGoto').onclick = async () => { const p = await promptBox('跳到路径', '例如 /etc/config', fmPath); if (p) fmGo(p); };
let conns = [], cnQuick = '';
async function loadConn() {
	const f = $('cnFilter').value.trim();
	const r = await P('connections', { filter: f });
	setStatus(true, '在线');
	conns = (r.connections || []).filter((c) => !cnQuick || (cnQuick === 'direct') === (c.chain[0] === 'DIRECT'));
	$('cnCount').textContent = (f || cnQuick ? `${conns.length} / ` : '') + r.total + ' 个';
	if (!conns.length) { $('cnList').innerHTML = '<div class="empty">没有连接</div>'; return; }
	$('cnList').innerHTML = conns.map((c, i) => {
		const last = c.chain[0] || '', direct = last === 'DIRECT';
		return `<button class="file" data-i="${i}"><div style="flex:1"><b>${esc(c.host)}<span class="muted" style="font-weight:500">:${esc(c.port)}</span></b><span class="sub" style="display:block;font-size:12.5px">${esc(c.src_name || c.src)} · ${esc(c.rule)}</span></div>
			<div style="text-align:right;flex:none;max-width:44%"><span class="pill ${direct ? '' : 'blue'}">${esc(direct ? '直连' : last)}</span><div class="muted" style="margin-top:4px;font-variant-numeric:tabular-nums">↓${B(c.dl)} ↑${B(c.ul)}</div></div></button>`;
	}).join('');
}
let ft;
$('cnFilter').addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(() => refresh(true), 400); });
$$('#cnChips .chip').forEach((b) => (b.onclick = () => { cnQuick = b.dataset.q; $$('#cnChips .chip').forEach((x) => x.classList.toggle('on', x === b)); refresh(true); }));
$('cnList').addEventListener('click', async (e) => {
	const b = e.target.closest('[data-i]'); if (!b) return;
	const c = conns[+b.dataset.i];
	const rows = [['来源设备', c.src_name ? `${c.src_name}（${c.src}）` : c.src], ['协议', c.net], ['命中规则', c.rule], ['代理链', c.chain.slice().reverse().join(' → ')], ['流量', `下载 ${B(c.dl)} · 上传 ${B(c.ul)}`], c.start ? ['开始时间', new Date(c.start).toLocaleString('zh-CN', { hour12: false })] : null].filter(Boolean);
	const v = await modal(`<h3>${esc(c.host)}:${esc(c.port)}</h3>${rows.map(([k, x]) => `<div class="kv"><span>${esc(k)}</span><span>${esc(x)}</span></div>`).join('')}
		<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-v="false">关闭</button><button class="btn danger" data-v="true">断开这个连接</button></div>`);
	if (v === true) await busy(null, async () => { await tool('close_connections', { id: c.id }); toast('已断开'); refresh(true); });
});

async function show(title, fn) {
	toast('读取中…');
	try { const t = await fn(); toastHide(); await textBox(title, t); } catch (e) { handleErr(e); }
}
const T = {
	system_info: () => show('系统信息', () => tool('system_info')),
	network_info: () => show('网络信息', () => tool('network_info')),
	firewall_overview: () => show('防火墙', () => tool('firewall_overview')),
	async system_log() { const kw = await promptBox('系统日志', '关键字，留空看最新 120 行，如 pppoe'); if (kw !== null) show('系统日志', () => tool('system_log', { filter: kw || undefined, lines: 120 })); },
	async services() {
		let text;
		try { toast('读取中…'); text = await tool('list_services'); toastHide(); } catch (e) { return handleErr(e); }
		const rows = text.split('\n').slice(1).map((l) => l.split(' | ')).filter((p) => p.length >= 3);
		modal(`<div class="sheethead"><h3>服务管理</h3><button class="btn sm" data-v="close">关闭</button></div>
			<input class="input" placeholder="搜索服务" autocapitalize="off" spellcheck="false">
			<div style="margin-top:6px">${rows.map((p) => { const on = p[2] === '运行中', self = p[0] === 'claude-mcp'; return `<div class="file" data-s="${esc(p[0])}"><div style="display:flex;align-items:center;gap:10px;min-width:0"><i class="dot ${on ? 'on' : ''}"></i><div style="min-width:0"><b>${esc(p[0])}</b><span class="muted">${p[1] === '是' ? '开机自启' : '不自启'}${on ? ' · 运行中' : ''}</span></div></div>
				<div class="actions" style="flex-wrap:nowrap"><button class="btn sm" data-a="restart">重启</button>${self ? '' : `<button class="btn sm ${on ? 'danger' : 'good'}" data-a="${on ? 'stop' : 'start'}">${on ? '停止' : '启动'}</button>`}</div></div>`; }).join('')}</div>`,
		(m) => {
			m.querySelector('input').oninput = (e) => { const k = e.target.value.toLowerCase(); $$('[data-s]', m).forEach((r) => r.classList.toggle('hidden', !r.dataset.s.toLowerCase().includes(k))); };
			$$('[data-a]', m).forEach((b) => (b.onclick = async () => {
				const name = b.closest('[data-s]').dataset.s, a = b.dataset.a;
				const label = { restart: '重启', stop: '停止', start: '启动' }[a];
				const risky = ['network', 'firewall', 'openclash', 'dnsmasq', 'odhcpd', 'uhttpd'].includes(name);
				if (!(await confirmBox(`${label} ${name}`, risky ? '这个服务和上网有关，操作期间网络会短暂中断。' : `确定要${label}这个服务吗？`, label, a === 'stop'))) return;
				await busy(b, async () => toast((await tool('service_control', { name, action: a })).split('\n')[0]));
			}));
		});
	},
	theme() { document.documentElement.classList.toggle('dark'); store.set('rp_dark', document.documentElement.classList.contains('dark') ? '1' : '0'); themeLabel(); rpBar(); },
	async reboot() {
		if (!(await confirmBox('重启路由器', '全家断网约 1–3 分钟，期间这个面板也无法使用。', '重启', true))) return;
		if (!(await confirmBox('再确认一次', '确定现在重启路由器吗？', '确定重启', true))) return;
		try { await tool('reboot_router', { confirm: true }); setStatus(false, '重启中'); toast('路由器正在重启，约 2 分钟后自动重连'); setTimeout(() => refresh(true), 120000); } catch (e) { handleErr(e); }
	},
	async lock() { lockSettings(); },
	look() { lookSettings(); },
	addphone() { addPhone(); },
	rotatekey() { rotateKey(); },
	devices() { devList(); },
	svc() { svcSheet(); },
	ckey() { ckeySheet(); },
	update() { updSheet(); },
	hubbind() { hubBind(); },
	logout() { signOut(); },
	feedback() { feedbackSheet(); },
};
$$('[data-t]').forEach((b) => (b.onclick = () => T[b.dataset.t]()));
// 问题反馈 / 建议：托管版直接发给开发者（管理页能看到、有邮件提醒）；自建版打开 GitHub 提问题
// 截图压缩成 JPEG（最长边 1600，太大再降画质），手机、电脑的浏览器和安卓 App 都能用
function shrinkImg(file, lim) {
	lim = lim || 1.3e6;
	return new Promise((ok, no) => {
		if (!file || !/^image\//.test(file.type || 'image/')) return no(new Error('只能选图片'));
		const url = URL.createObjectURL(file), img = new Image();
		img.onload = () => {
			try {
				const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
				const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
				const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
				URL.revokeObjectURL(url);
				let q = 0.82, d = c.toDataURL('image/jpeg', q);
				while (d.length > lim && q > 0.3) { q -= 0.12; d = c.toDataURL('image/jpeg', q); }
				if (d.length > Math.max(lim * 1.4, 1.2e6)) return no(new Error('图片太大了，换一张试试'));
				ok(d);
			} catch (e) { URL.revokeObjectURL(url); no(new Error('这张图片处理不了，换一张试试')); }
		};
		img.onerror = () => { URL.revokeObjectURL(url); no(new Error('这种图片格式打不开，换成 JPG 或 PNG 截图试试')); };
		img.src = url;
	});
}
// 问题反馈 / 建议：托管版直接发给开发者（管理页能看到、有邮件提醒）；自建版打开 GitHub 提问题
async function feedbackSheet() {
	let dg = '', hosted = true;
	try { const r = await P('feedback_diag', {}, 15000); dg = r.text || ''; hosted = r.hosted !== false; } catch (e) {}
	const IM = [];
	modal(`<div class="sheethead"><h3>问题反馈 / 建议</h3><button class="btn sm" data-v="close">关闭</button></div>
		<p class="muted" style="margin:0 0 8px;font-size:13px;line-height:1.6">遇到什么问题、想要什么功能，写下来就行。</p>
		<textarea class="input" data-tx rows="6" maxlength="2000" placeholder="比如：点「一键更新」以后一直停在「准备更新」……" style="resize:vertical;min-height:120px"></textarea>
		<div class="fbims" data-ims></div>
		${hosted ? `<label class="btn fbadd" data-addw><input type="file" accept="image/*" multiple data-file style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"><span data-addt>＋ 添加截图（最多 3 张）</span></label>` : '<p class="muted" style="font-size:12.5px;margin:8px 0 0">自建版会打开 GitHub 提问题页，截图在那个页面里直接粘贴或拖进去。</p>'}
		<input class="input" data-ct maxlength="80" placeholder="联系方式（可以不填）：微信、QQ、邮箱" style="margin-top:8px" autocapitalize="off" spellcheck="false">
		<label class="kv aswon" style="margin-top:6px"><span><b>附上路由器信息</b><span class="muted">方便查问题，只有下面这些，不含密钥和网址</span></span><span class="sw"><input type="checkbox" data-dg checked><i></i></span></label>
		${dg ? `<pre class="out" style="font-size:11.5px;max-height:120px;overflow:auto;margin:6px 0 0">${esc(dg)}</pre>` : ''}
		<div class="btngrid" style="margin:12px 0 0;grid-template-columns:1fr"><button class="btn primary" data-go>发送</button></div>`, (m, close) => {
		const go = m.querySelector('[data-go]'), tx = m.querySelector('[data-tx]'), box = m.querySelector('[data-ims]'), fi = m.querySelector('[data-file]'), aw = m.querySelector('[data-addw]');
		const draw = () => {
			box.innerHTML = IM.map((d, i) => `<div class="fbim"><img src="${d}" alt="截图 ${i + 1}"><button type="button" data-rm="${i}" aria-label="删掉这张">×</button></div>`).join('');
			if (aw) { aw.classList.toggle('hidden', IM.length >= 3); aw.querySelector('[data-addt]').textContent = IM.length ? `＋ 再加一张（已添加 ${IM.length} / 3 张）` : '＋ 添加截图（最多 3 张）'; }
		};
		box.onclick = (e) => { const r = e.target.closest('[data-rm]'); if (r) { IM.splice(+r.dataset.rm, 1); draw(); } };
		if (fi) fi.onchange = async () => {
			const all = [...(fi.files || [])], files = all.slice(0, 3 - IM.length); fi.value = '';
			if (!all.length) return toast('没有选到图片，换一个相册再试试', true);
			const at = aw && aw.querySelector('[data-addt]'); if (at) at.textContent = '正在处理图片…';
			let n = 0;
			for (const f of files) { try { IM.push(await shrinkImg(f)); n++; draw(); } catch (e) { toast(e.message, true); } }
			draw();
			if (n) toast(`已添加 ${n} 张截图` + (all.length > files.length ? '（最多 3 张，多的没加）' : ''));
		};
		setTimeout(() => tx.focus(), 80);
		go.onclick = () => busy(go, async () => {
			const r = await P('feedback', { text: tx.value, contact: m.querySelector('[data-ct]').value, diag: m.querySelector('[data-dg]').checked, images: hosted ? IM : [] }, 90000);
			close(true);
			if (r.sent === 'github') { window.open(r.url, '_blank', 'noopener'); toast('已打开 GitHub，登录后点「Submit」就发出去了'); }
			else if (r.code) fbSent(r);
			else toast('已发送' + (r.images ? '（带 ' + r.images + ' 张截图）' : '') + '，谢谢！开发者会尽快看');
		}, '发送中');
	});
}
// 退出登录：清掉这台手机上的密钥；托管版顺便让路由器忘掉这台手机（下次要重新输登录码）
async function signOut() {
	const dev = !!store.get('rp_dev');
	if (!(await confirmBox('退出登录', '这台手机退出面板，下次打开要重新粘贴登录地址' + (dev ? '，还要重新输登录码' : '') + '。路由器上的设置不受影响。', '退出登录', true))) return;
	if (dev) { try { await rpcOnce('panel/device_remove', { self: true }, 8000); } catch (e) {} }
	store.del('rp_dev');
	sideOpen(false);
	logout('');
	toast('已退出登录');
}
$('sideOut').onclick = () => signOut();
$('sideFb').onclick = () => { sideOpen(false); feedbackSheet(); };
$('mFb').onclick = () => feedbackSheet();
function themeLabel() { $('themeState').textContent = document.documentElement.classList.contains('dark') ? '已开启' : '已关闭'; lookLabel(); }

/* ---------- 主题与背景：玻璃效果、背景（预设或相册里的图），只保存在这台手机上 ---------- */
const WALLS = [['mist', '晨雾'], ['night', '星空'], ['aurora', '极光'], ['ocean', '海洋'], ['sunset', '日落'], ['mint', '薄荷'], ['sakura', '樱花'], ['graphite', '石墨']];
const LOOK = {
	glass() { const g = store.get('rp_glass'); return g === '1' || (g === null && !matchMedia('(prefers-reduced-transparency: reduce)').matches); },
	wall() { return store.get('rp_wall') || ''; },
	num(k, d) { const v = store.get(k); return v === null || !isFinite(+v) ? d : +v; },
};
function lookApply() {
	const R = document.documentElement, W = $('wall'), w = LOOK.wall();
	R.classList.toggle('glass', LOOK.glass());
	if (w) R.dataset.wall = w; else delete R.dataset.wall;
	R.style.setProperty('--wblur', LOOK.num('rp_wblur', 20) + 'px');
	R.style.setProperty('--wdim', LOOK.num('rp_wdim', 0) / 100);
	rpBar();
	const img = w === 'photo' ? store.get('rp_wallimg') : null;
	if (img) W.style.setProperty('--wimg', `url("${img}")`); else W.style.removeProperty('--wimg');
	// 以前选的相册图片还没算过顶部颜色：现在补算一次
	if (img && !store.get('rp_walltop')) { const im = new Image(); im.onload = () => { try { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); store.set('rp_walltop', imgTop(c)); rpBar(); } catch (e) {} }; im.src = img; }
	lookLabel();
}
function lookLabel() {
	const el = $('lookState'); if (!el) return;
	const w = LOOK.wall(), n = w === 'photo' ? '我的图片' : (WALLS.find((x) => x[0] === w) || [0, document.documentElement.classList.contains('dark') ? '星空' : '晨雾'])[1];
	el.textContent = LOOK.glass() ? '玻璃 · ' + n : '简洁';
}
// 图片铺满手机屏幕时（居中裁切），最上面那一条的平均颜色：给状态栏用
function imgTop(c) {
	const sw = Math.min(c.width, c.height * innerWidth / innerHeight), x0 = (c.width - sw) / 2, hh = Math.max(1, Math.round(sw * innerHeight / innerWidth * .04));
	const y0 = Math.max(0, Math.round((c.height - sw * innerHeight / innerWidth) / 2));
	const t = document.createElement('canvas'); t.width = 16; t.height = 1;
	t.getContext('2d').drawImage(c, x0, y0, sw, hh, 0, 0, 16, 1);
	const p = t.getContext('2d').getImageData(0, 0, 16, 1).data; let r = 0, g = 0, b = 0;
	for (let i = 0; i < 64; i += 4) { r += p[i]; g += p[i + 1]; b += p[i + 2]; }
	return '#' + [r, g, b].map((v) => Math.round(v / 16).toString(16).padStart(2, '0')).join('');
}
// 相册里的图：缩小后存成 JPEG（太大存不下就再缩）
async function wallFromFile(f) {
	if (!f || !/^image\//.test(f.type || 'image/')) throw new Error('请选一张图片');
	const url = URL.createObjectURL(f);
	try {
		const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('读不了这张图片，换一张试试')); i.src = url; });
		for (const [max, q] of [[1600, 0.85], [1200, 0.8], [900, 0.75]]) {
			const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
			const c = document.createElement('canvas');
			c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
			c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
			const d = c.toDataURL('image/jpeg', q);
			try { localStorage.setItem('rp_wallimg', d); localStorage.setItem('rp_walltop', imgTop(c)); return; } catch (e) {}
		}
		throw new Error('图片太大，这台手机存不下，换一张试试');
	} finally { URL.revokeObjectURL(url); }
}
function lookSettings() {
	const ICON_ADD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
	const body = () => {
		const w = LOOK.wall() || (document.documentElement.classList.contains('dark') ? 'night' : 'mist'), img = store.get('rp_wallimg');
		return `<div class="sheethead"><h3>主题与背景</h3><button class="btn sm" data-v="close">完成</button></div>
		<div class="${LOOK.glass() ? '' : 'lookoff'}" data-lbody>
		<label class="kv aswon"><span><b>玻璃效果</b><span class="muted">卡片、顶栏、菜单变成半透明磨砂玻璃，透出下面的背景。手机比较卡的话可以关掉，换回简洁样式</span></span><span class="sw"><input type="checkbox" data-lg ${LOOK.glass() ? 'checked' : ''}><i></i></span></label>
		<div class="subhd" style="border-top:0;padding-top:0;margin-top:10px">背景</div>
		<div class="wgrid">${WALLS.map(([k, n]) => `<button class="wtile ${w === k ? 'on' : ''}" data-w="${k}"><i class="wp-${k}"></i><span>${n}</span></button>`).join('')}
		${img ? `<button class="wtile ${w === 'photo' ? 'on' : ''}" data-w="photo"><i style="background-image:url('${img}')"></i><span>我的图片</span></button>` : ''}
		<button class="wtile add" data-pick><i>${ICON_ADD}</i><span>${img ? '换一张' : '从相册选'}</span></button></div>
		<input type="file" accept="image/*" hidden data-file>
		<div class="wsl"><span>背景模糊</span><input type="range" min="0" max="40" step="1" value="${LOOK.num('rp_wblur', 20)}" data-blur><b data-bv>${LOOK.num('rp_wblur', 20)}</b></div>
		<div class="wsl"><span>背景变暗</span><input type="range" min="0" max="60" step="1" value="${LOOK.num('rp_wdim', 0)}" data-dim><b data-dv>${LOOK.num('rp_wdim', 0)}%</b></div>
		</div>
		<p class="muted" style="font-size:12.5px;margin:12px 0 0">背景只保存在这台手机上，不会上传到路由器；每台手机可以设不一样的。</p>
		<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-reset>恢复默认</button><button class="btn primary" data-v="close">完成</button></div>`;
	};
	modal(body(), (m) => {
		m.classList.add('clear'); // 背景实时变化，弹窗后面不压暗
		const box = m.querySelector('.modalbox');
		const redraw = () => { const st = box.scrollTop; box.innerHTML = body(); box.scrollTop = st; bind(); };
		const bind = () => {
			box.querySelector('[data-lg]').onchange = (e) => { store.set('rp_glass', e.target.checked ? '1' : '0'); lookApply(); box.querySelector('[data-lbody]').classList.toggle('lookoff', !e.target.checked); };
			box.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { store.set('rp_wall', b.dataset.w); lookApply(); box.querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('on', x === b)); }));
			const file = box.querySelector('[data-file]');
			box.querySelector('[data-pick]').onclick = () => file.click();
			file.onchange = async () => {
				const f = file.files && file.files[0]; if (!f) return;
				try { await wallFromFile(f); store.set('rp_wall', 'photo'); lookApply(); redraw(); toast('背景已换成这张图片'); }
				catch (e) { toast(e.message, true); }
			};
			const sl = (sel, key, out, unit) => { const i = box.querySelector(sel); i.oninput = () => { store.set(key, i.value); box.querySelector(out).textContent = i.value + unit; lookApply(); }; };
			sl('[data-blur]', 'rp_wblur', '[data-bv]', ''); sl('[data-dim]', 'rp_wdim', '[data-dv]', '%');
			box.querySelector('[data-reset]').onclick = () => { ['rp_glass', 'rp_wall', 'rp_wblur', 'rp_wdim', 'rp_wallimg', 'rp_walltop'].forEach((k) => store.del(k)); lookApply(); redraw(); toast('已恢复默认主题'); };
		};
		bind();
	}).then(lookLabel);
}
lookApply();

/* ---------- 二维码（qr.js 用到时才加载）：添加新手机、绑定到账号 ---------- */
function loadQr() {
	if (window.qrcode) return Promise.resolve();
	return new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'qr.js'; s.onload = ok; s.onerror = () => no(new Error('二维码组件加载失败，检查网络后再试')); document.head.appendChild(s); });
}
function qrSvg(text) { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
// 二维码先打码，点一下才显示，免得旁边的人或截图看到
function qrReveal(m) { m.querySelectorAll('.qrbox.blur').forEach((b) => (b.onclick = () => b.classList.remove('blur'))); }
async function addPhone() {
	const url = location.origin + location.pathname.replace(/[^/]*$/, '') + '#login=' + token;
	try { await loadQr(); } catch (e) { return toast(e.message, true); }
	modal(`<div class="sheethead"><h3>添加新手机</h3><button class="btn sm" data-v="close">关闭</button></div>
	<p class="muted" style="margin:0 0 12px">用新手机的相机扫这个二维码，打开后就直接登录这个面板，不用再粘贴登录地址。${store.get('rp_dev') ? '<br><b>托管版</b>：新手机打开后还要输一次登录码（在官网账号里，这台路由器下面点「获取登录码」）。' : ''}</p>
	<div class="qrbox blur">${qrSvg(url)}<span>点一下显示二维码</span></div>
	<div class="notice w" style="margin-top:12px">⚠️ 扫到这个码就等于拿到路由器的全部权限。只给自己或家人的手机扫，扫完就关掉，不要截图、不要发给别人。</div>
	<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-copy>复制链接</button><button class="btn primary" data-v="close">完成</button></div>`,
	(m) => { qrReveal(m); m.querySelector('[data-copy]').onclick = () => copyText(url); });
}
/* ---------- 一键更新：路由器上的面板和程序（App 自己的更新是另外一回事） ---------- */
let UPD = null;
/* 路由器升级后，手机里缓存的还是旧面板（面板先从缓存打开，新版下次打开才生效）：
   发现路由器上的版本跟这份面板不一样，就把缓存换成新版、自动刷新一次 */
const PANEL_VER = document.querySelector('meta[name="panel-ver"]')?.content || '';
async function refreshPanel() {
	try {
		const sw = navigator.serviceWorker, reg = sw && await sw.getRegistration();
		if (reg) {
			// sw.js 变了：装好新的（安装时会重新下载面板），等它接管
			const changed = new Promise((res) => { sw.addEventListener('controllerchange', res, { once: true }); setTimeout(res, 8000); });
			await reg.update().catch(() => {});
			if (reg.installing || reg.waiting) await changed;
			// sw.js 没变：让它重新下载一遍面板再刷新
			else if (sw.controller) await new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = res; sw.controller.postMessage({ t: 'refresh' }, [ch.port2]); setTimeout(res, 8000); });
		}
	} catch (e) {}
	location.reload();
}
function panelVerCheck(cur) {
	if (!cur || !/^\d/.test(PANEL_VER) || cur === PANEL_VER) return false;
	// 每个版本只自动刷新一次，万一没换成功也不会一直刷
	let tried = ''; try { tried = sessionStorage.getItem('rp_verfix') || ''; } catch (e) {}
	if (tried === cur) return false;
	try { sessionStorage.setItem('rp_verfix', cur); } catch (e) {}
	toast('路由器面板已更新到 v' + cur + '，正在换成新版…');
	refreshPanel();
	return true;
}
const updLaterKey = () => (UPD ? UPD.latest : '') + '@' + new Date().toDateString();
let updAt = 0;
// 面板一直开着（App 放后台再切回来、或者一直亮着）时，隔一会儿再查一次，这样发布了必须更新的版本也能弹出来
const updMaybe = () => { if (token && !LK.on && Date.now() - updAt > 600e3) updCheck(false); };
async function updCheck(force) {
	updAt = Date.now();
	let r;
	try { r = await P('update_check', { force: !!force }, 25000); } catch (e) { if (force) toast(e.message, true); return null; }
	if (r && typeof r === 'object' && panelVerCheck(r.cur)) return null;
	if (!r || typeof r !== 'object' || !r.latest) return null;
	UPD = r;
	$('updState').textContent = UPD.newer ? '有新版本 v' + UPD.latest + '（现在 ' + (UPD.cur ? 'v' + UPD.cur : '旧版') + '）' : 'v' + (UPD.cur || '?') + ' · 已经是最新版';
	const later = store.get('rp_upd_later') === updLaterKey();
	$('rUpd').classList.toggle('hidden', !UPD.newer || (later && !UPD.force));
	if (UPD.newer) {
		$('rUpdV').textContent = 'v' + UPD.latest;
		$('rUpdCur').textContent = '现在是 ' + (UPD.cur ? 'v' + UPD.cur : '旧版') + '\n设置都保留，不会断网';
		$('rUpdN').textContent = UPD.notes || '';
		// 首页只放前 3 行；「查看完整更新内容」在弹窗里能上下滑着看全
		$('rUpdLater').classList.toggle('hidden', !!UPD.force);
		// 必须更新：弹窗关不掉
		if (UPD.force && !document.querySelector('.modal[data-upd]')) updSheet(true);
	}
	return UPD;
}
$('rUpdGo').onclick = () => updStart();
$('rUpdMore').onclick = () => updSheet(true);
$('rUpdLater').onclick = () => { store.set('rp_upd_later', updLaterKey()); $('rUpd').classList.add('hidden'); };
async function updSheet(forced) {
	if (!forced) { const r = await updCheck(true); if (!r) return; }
	const u = UPD;
	modal(`<div class="sheethead"><h3>${u.newer ? '路由器有新版本' : '检查更新'}</h3>${u.force ? '' : '<button class="btn sm" data-v="close">关闭</button>'}</div>
	<div class="kv"><span>现在的版本</span><b>${esc(u.cur ? 'v' + u.cur : '旧版（没有记录版本号）')}</b></div>
	<div class="kv"><span>最新版本</span><b>${esc('v' + u.latest)}</b></div>
	${u.newer ? `<div class="notice" style="white-space:pre-line;margin-top:10px;line-height:1.6">${esc(u.notes || '修复了一些问题')}</div>
	${u.force ? '<div class="notice w" style="margin-top:10px">这个版本必须更新，更新后才能继续使用。</div>' : ''}
	<p class="muted" style="font-size:13px;margin:10px 0 0">路由器自己下载同一种安装包，在后台装好。网址、密钥、设置都保留；面板会断开 10–30 秒，不会断网。装完起不来会自动退回现在的版本。</p>
	<div class="btngrid" style="margin:12px 0 0">${u.force ? '' : '<button class="btn" data-v="close">以后再说</button>'}<button class="btn primary" data-go>一键更新</button></div>`
	: '<p class="muted" style="margin:12px 0 0">已经是最新版了。</p><div class="btngrid" style="margin:12px 0 0"><button class="btn primary" data-v="close">好的</button></div>'}`,
	(m, close) => { m.dataset.upd = 1; if (u.force) m.dataset.lock = 1; const g = m.querySelector('[data-go]'); if (g) g.onclick = () => { close(null); updStart(true); }; });
}
// 反馈编号：一行显示编号 + 复制按钮（发送成功、收到回复时都用）
const fbCodeRow = (code) => `<div data-fbcode style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--fill);padding:10px 12px;border-radius:12px;margin-top:12px">
	<div style="min-width:0"><span class="muted" style="display:block;font-size:12.5px">反馈编号</span><b class="mono" style="font-size:17px;letter-spacing:.06em">${esc(code)}</b></div>
	<button class="btn sm" data-cc style="flex:none">复制</button></div>`;
const fbCodeBind = (m, code, close) => {
	const c = m.querySelector('[data-cc]'); if (c) c.onclick = () => copyText(code);
	const t = m.querySelector('[data-track]'); if (t) t.onclick = () => { close(null); FB_FOCUS = code; if (page === 'myfb') refresh(); else go('myfb'); };
};
// 进度条：只有三段（反馈成功 → 开发人员已收到 → 已修复；没法修的第三段是「无法修复」），补充说明写在下面
const fbSteps = (stage, nofix) => `<div class="fsteps" data-stage="${stage}" style="margin:12px 0 0;padding:12px 2px 10px;border-radius:14px;background:var(--fill)">${['反馈成功', '开发人员已收到', '已修复'].map((x, i) => { const on = i < stage, bad = on && i === 2 && nofix;
	return `<div class="${on ? (bad ? 'on bad' : 'on') : 'off'}${i === stage - 1 ? ' cur' : ''}"><i>${bad ? '✕' : on ? '✓' : i + 1}</i><b>${bad ? '无法修复' : x}</b></div>`; }).join('')}</div>`;
// 发送成功：编号能复制，能直接打开处理进度页（不用登录）
function fbSent(r) {
	modal(`<div class="sheethead"><h3>反馈已发送</h3></div>
	${fbSteps(1, false)}
	<p class="muted" style="margin:12px 0 0;line-height:1.6">谢谢！${r.images ? r.images + ' 张截图也一起发过去了。' : ''}开发者回复以后，你打开面板时会自动弹出来，不用自己去查。</p>
	${fbCodeRow(r.code)}
	<p class="muted" style="font-size:13px;margin:10px 0 0;line-height:1.6">随时可以在侧边栏「消息与帮助 → 我的反馈」里看处理到哪一步。</p>
	<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-track>查看处理进度</button><button class="btn primary" data-v="close">好的</button></div>`,
	(m, close) => { m.dataset.fbsent = 1; fbCodeBind(m, r.code, close); if (page === 'myfb') refresh(true); });
}
// 我的反馈页面
let fbAt = 0, fbTimer = 0, FB_FOCUS = '';
const FB_EV = { fixed: '已修复', nofix: '无法修复', open: '重新打开，继续处理', note: '补充说明' };
const fbWhen = (t) => new Date(t).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
async function loadMyFb(quiet) {
	const r = await P('fb_replies', { force: !quiet }, 30000);
	fbAt = Date.now();
	myfbRender(r);
}
function myfbRender(r) {
	const box = $('myfbList'); if (!box) return;
	if (r && r.hosted === false) {
		box.innerHTML = '<section class="card"><b>自建版的反馈发到 GitHub</b><p class="muted" style="margin:6px 0 0;line-height:1.6">点「发新反馈」会打开 GitHub，开发者的回复也在 GitHub 那条 issue 里看。托管版的反馈才有编号和处理进度。</p></section>';
		return;
	}
	const list = r?.list || [];
	// 自动刷新时，展开着的记录保持展开
	const opened = new Set([...box.querySelectorAll('[data-fbi]')].filter((it) => !it.querySelector('[data-histbox]')?.classList.contains('hidden')).map((it) => it.dataset.fbi));
	if (!list.length) { box.innerHTML = '<section class="card empty">还没有发过反馈。遇到问题、想要什么功能，点上面的「发新反馈」</section>'; return; }
	box.innerHTML = (r.stale ? '<div class="notice w" style="margin-bottom:12px">暂时连不上托管服务，下面是上次查到的</div>' : '') + list.map((x) => {
		const stage = Math.max(x.stage || 1, x.reply ? 2 : 1), st = x.state || (x.done ? 'fixed' : 'open');
		const pill = st === 'fixed' ? '<i class="ok">已修复</i>' : st === 'nofix' ? '<i class="bad">无法修复</i>' : stage >= 2 ? '<i>开发人员已收到</i>' : '<i class="wait">等开发人员查看</i>';
		const isNew = x.updated && x.updated > (x.seen || 0);
		const evs = (x.history || []).map((h) => ({ ...h, n: FB_EV[h.st] || '更新' }));
		if (x.ackAt) evs.push({ at: x.ackAt, st: 'ack', n: '开发人员已收到' });
		evs.sort((a, b) => b.at - a.at); evs.push({ at: x.at, st: 'sent', n: '反馈成功' });
		return `<section class="card fbitem" data-fbi="${esc(x.code)}">
			<div class="fbhd"><span class="fbpill">${pill}${isNew ? '<em>新</em>' : ''}</span><span>${esc(fbWhen(x.at))}</span></div>
			${x.text ? `<p class="fbtext">${esc(x.text)}</p>` : ''}
			${fbSteps(stage, st === 'nofix')}
			${fbCodeRow(x.code)}
			<div class="btngrid" style="margin:10px 0 0"><button class="btn" data-hist>${opened.has(x.code) ? '收起记录' : '完整记录（' + evs.length + '）'}</button>${x.track ? '<button class="btn" data-web>在网页上看</button>' : ''}</div>
			<div class="${opened.has(x.code) ? '' : 'hidden'}" data-histbox style="margin-top:6px">${evs.map((e) => `<div class="fbev ${esc(e.st)}"><b>${esc(e.n)}</b><time>${esc(fbWhen(e.at))}</time>${e.note ? `<p>${esc(e.note)}</p>` : ''}</div>`).join('')}</div>
		</section>`;
	}).join('');
	box._list = list;
	// 在这一页看到了：有新进展的记成看过（不会再弹窗）
	for (const x of list) if (x.updated && x.updated > (x.seen || 0)) { x.seen = x.updated; P('fb_seen', { code: x.code, updated: x.updated, done: x.done || x.nofix ? 1 : 0 }).catch(() => {}); }
	// 从弹窗点「查看完整记录」过来的：展开那一条、滚过去
	if (FB_FOCUS) {
		const it = box.querySelector(`[data-fbi="${CSS.escape(FB_FOCUS)}"]`); FB_FOCUS = '';
		if (it) { it.classList.add('hl'); it.querySelector('[data-histbox]').classList.remove('hidden'); it.querySelector('[data-hist]').textContent = '收起记录'; setTimeout(() => it.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); setTimeout(() => it.classList.remove('hl'), 2600); }
	}
}
$('myfbNew').onclick = () => feedbackSheet();
$('myfbList').onclick = (e) => {
	const it = e.target.closest('[data-fbi]'); if (!it) return;
	const code = it.dataset.fbi, x = ($('myfbList')._list || []).find((y) => y.code === code) || {};
	if (e.target.closest('[data-cc]')) return copyText(code);
	if (e.target.closest('[data-web]') && x.track) return window.open(x.track, '_blank', 'noopener');
	const h = e.target.closest('[data-hist]');
	if (h) { const b = it.querySelector('[data-histbox]'); const open = b.classList.toggle('hidden') === false; h.textContent = open ? '收起记录' : '完整记录（' + b.children.length + '）'; }
};
/* ---------- 通知（4.0）：路由器的故障/自动修复、云端监测、托管服务、公告、版本更新、反馈进度、开发者的回复，一个入口 ----------
   路由器那边一次给：断线记录、公告、反馈进度、开发者有没有新回复、看到哪儿了（notices.seen，换手机也一样）；云端的面板自己去拿 */
const NT = { d: null, at: 0, f: 'all', view: null, n: 0, more: 0 };
try { NT.d = JSON.parse(store.get('rp_nt') || 'null'); } catch (e) {}
const NT_CAT = [['all', '全部'], ['sys', '系统'], ['ann', '公告'], ['upd', '更新'], ['fb', '反馈']];
const APP_VER = (navigator.userAgent.match(/RouterPanelApp\/([\d.]+)/) || [])[1] || '';
const ntMs = (v) => typeof v === 'number' ? (v < 1e11 ? v * 1000 : v) : Date.parse(v || '') || 0;
const verNewer = (a, b) => { const x = String(a || '').replace(/^v/, '').split('.').map((n) => +n || 0), y = String(b || '').replace(/^v/, '').split('.').map((n) => +n || 0); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
const NT_IC = {
	sys: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>', ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.4 9.6 4.5 4.5 0 0 0 7 18.5z"/>',
	svc: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>', ann: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16.5 9a4 4 0 0 1 0 6"/>',
	upd: '<path d="M12 16V5M7.5 9.5 12 5l4.5 4.5"/><path d="M5 19h14"/>', fb: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M10 12l1.8 1.8L15 10.5"/>',
	chat: '<path d="M5 18.5V7a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 7v6.5a2.5 2.5 0 0 1-2.5 2.5H8.5z"/><path d="M9 9.5h6M9 12.5h3.5"/>',
	bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2.2H4.4z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/>',
};
const ntSvg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NT_IC[k] || NT_IC.bell}</svg>`;
function ntItems() {
	const d = NT.d || {}, L = [];
	for (const e of d.events || []) L.push({ c: 'sys', ic: e.lvl === 'ok' ? 'ok' : 'sys', t: ntMs(e.t), lvl: e.lvl || 'info', title: e.msg || '', body: e.detail || '', src: '路由器', go: 'wd', k: 'e' + e.t + e.kind });
	if (cloud) {
		for (const e of cloud.events || []) L.push({ c: 'sys', ic: 'cloud', t: e.t, lvl: e.lvl || 'info', title: e.msg || '', body: e.detail || '', src: '云端监测', go: 'wd', k: 'c' + e.t });
		for (const x of cloud.notes || []) L.push({ c: 'sys', ic: 'svc', t: x.t, lvl: x.lvl || 'info', title: x.title || '', body: x.body || '', src: x.tag === 'svc' ? '托管服务' : '云端', k: 'n' + x.t });
	}
	for (const a of d.ann || []) L.push({ c: 'ann', ic: 'ann', t: a.upd || a.at, lvl: a.level === 'important' ? 'warn' : 'info', title: a.title, body: a.body || '', src: a.level === 'important' ? '重要公告' : '公告', imp: a.level === 'important', ann: a, k: 'a' + a.id });
	if (UPD && UPD.newer) L.push({ c: 'upd', ic: 'upd', t: ntMs(UPD.rel), lvl: UPD.force ? 'warn' : 'info', title: '路由器面板有新版本 v' + UPD.latest + (UPD.force ? '（必须更新）' : ''), body: UPD.notes || '', src: '版本更新', upd: 'router', k: 'u' + UPD.latest });
	if (APP_VER && d.app && d.app.version && verNewer(d.app.version, APP_VER)) L.push({ c: 'upd', ic: 'upd', t: ntMs(d.app.rel), lvl: 'info', title: '安卓 App 有新版本 ' + d.app.version + '（现在 ' + APP_VER + '）', body: d.app.notes || '', src: '版本更新', upd: 'app', k: 'p' + d.app.version });
	for (const x of d.fb || []) {
		const evs = (x.history || []).map((h) => ({ at: h.at, st: h.st, note: h.note || '' }));
		if (x.ackAt) evs.push({ at: x.ackAt, st: 'ack', note: '' });
		for (const e of evs) L.push({ c: 'fb', ic: 'fb', t: e.at, lvl: e.st === 'fixed' ? 'ok' : e.st === 'nofix' ? 'err' : 'info', title: '反馈 ' + x.code + '：' + (e.st === 'ack' ? '开发人员已收到' : FB_EV[e.st] || '有新进展'), body: e.note || x.text || '', src: '反馈进度', fb: x.code, k: 'f' + x.code + e.at });
	}
	const ch = d.chat;
	if (ch && ch.uu > 0) L.push({ c: 'fb', ic: 'chat', t: ntMs(ch.at), lvl: 'info', title: '开发者回复了你（' + ch.uu + ' 条没看）', body: '点开「实时联系开发者」看看', src: '实时对话', go: 'chat', k: 'ch' + ch.seq });
	return L.filter((x) => x.title).sort((a, b) => b.t - a.t);
}
const ntSeenT = () => +(NT.d && NT.d.seen && NT.d.seen.t) || 0;
const chUnread = () => (page === 'chat' ? 0 : +(NT.d && NT.d.chat && NT.d.chat.uu) || 0);
function ntBadge() {
	const t = ntSeenT(), n = page === 'notice' ? 0 : ntItems().filter((x) => x.t > t && x.go !== 'chat').length + chUnread();
	NT.n = n;
	const b = $('bellN'); if (b) { b.textContent = n > 99 ? '99+' : String(n); b.classList.toggle('hidden', !n); $('bellBtn').setAttribute('aria-label', n ? '通知，' + n + ' 条新的' : '通知'); }
	// 侧边栏「实时联系开发者」上的小红点
	const cu = chUnread(), nb = document.querySelector('#sidenav button[data-p="chat"]');
	if (nb) { let dot = nb.querySelector('.chdot'); if (cu && !dot) { dot = document.createElement('em'); dot.className = 'chdot'; dot.style.cssText = 'margin-left:auto;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:9px;background:var(--danger);color:#fff;font:700 10.5px/18px system-ui,sans-serif;font-style:normal;text-align:center;flex:none'; nb.appendChild(dot); } if (dot) { if (cu) dot.textContent = cu > 99 ? '99+' : cu; else dot.remove(); } }
}
async function ntFetch() {
	const cp = cloudFetch(false).catch(() => null);
	const d = await P('notices', APP_VER ? { app: 1 } : {}, 30000);
	await cp;
	NT.d = d; NT.at = Date.now(); store.set('rp_nt', JSON.stringify(d));
	return d;
}
// 定时查：铃铛上的数字；重要公告没弹过的弹一次（有别的弹窗、正在更新时先不弹）
async function ntCheck() {
	if (!token || LK.on || document.hidden) return;
	NT.at = Date.now();
	try { await ntFetch(); } catch (e) { return; }
	if (page === 'notice') return void ntRender();
	ntBadge();
	if (document.querySelector('.modal')) return;
	const pop = (NT.d.seen && NT.d.seen.pop) || [];
	const a = (NT.d.ann || []).find((x) => x.level === 'important' && !pop.includes(x.id));
	if (a) ntAnnPop(a);
}
function ntAnnPop(a) {
	modal(`<div class="sheethead"><h3>${esc(a.title)}</h3></div>
	<p class="muted" style="font-size:13px;margin:0">开发者发布的重要公告 · ${esc(fbWhen(a.at))}</p>
	${a.body ? `<div class="notice" style="white-space:pre-wrap;line-height:1.65;margin-top:12px;max-height:50vh;overflow:auto">${esc(a.body)}</div>` : ''}
	<p class="muted" style="font-size:12.5px;margin:10px 0 0">以后在「通知」里还能看到这条。</p>
	<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-nt>打开通知</button><button class="btn primary" data-v="close">知道了</button></div>`,
	(m, close) => { m.dataset.ann = 1; m.querySelector('[data-nt]').onclick = () => { close(null); go('notice'); }; });
	NT.d.seen.pop = [...((NT.d.seen && NT.d.seen.pop) || []), a.id];
	P('notices_seen', { pop: a.id }).catch(() => {});
}
async function loadNotice(quiet) {
	if (NT.d) ntRender();
	await ntFetch();
	// 进来时记下「看到哪儿了」：这次进来之前没看过的标「新」（在这一页上一直标着），铃铛清零
	if (NT.view == null) NT.view = ntSeenT();
	const top = Math.max(0, ...ntItems().filter((x) => x.go !== 'chat').map((x) => x.t));
	if (top > ntSeenT()) { NT.d.seen.t = top; P('notices_seen', { t: top }).catch(() => {}); }
	ntRender();
	ntBadge();
}
const ntDay = (t) => { if (!t) return '更早'; const x = new Date(t), n = new Date(); return x.toDateString() === n.toDateString() ? '今天' : x.toDateString() === new Date(n - 864e5).toDateString() ? '昨天' : `${x.getMonth() + 1} 月 ${x.getDate()} 日`; };
function ntRender() {
	const box = $('ntList'); if (!box) return;
	const all = ntItems(), seen = NT.view ?? ntSeenT(), d = NT.d || {};
	const cnt = (c) => all.filter((x) => c === 'all' || x.c === c).length;
	const fresh = all.filter((x) => x.t > seen).length;
	$('ntPill').textContent = fresh ? fresh + ' 条新的' : '都看过了'; $('ntPill').className = 'pill' + (fresh ? ' warnc' : ' good');
	// 两个入口卡片：对话（没看的回复数）、我的反馈（还在处理的条数）
	const cu = +(d.chat && d.chat.uu) || 0;
	$('ntChatN').textContent = cu > 99 ? '99+' : cu; $('ntChatN').classList.toggle('hidden', !cu);
	$('ntChatSub').textContent = cu ? '开发者回复了你' : d.chat ? '接着聊' : '遇到问题直接问';
	const fo = (d.fb || []).filter((x) => !x.done && !x.nofix).length;
	$('ntFbSub').textContent = (d.fb || []).length ? (fo ? fo + ' 条还在处理' : '都处理好了') : '处理到哪一步';
	$('ntChips').innerHTML = NT_CAT.map(([c, n]) => `<button class="chip${NT.f === c ? ' on' : ''}" data-ntf="${c}">${n}${cnt(c) ? '<small>' + (cnt(c) > 99 ? '99+' : cnt(c)) + '</small>' : ''}</button>`).join('');
	// 置顶：还在显示期内的重要公告（最新一条）
	const pin = (NT.f === 'all' || NT.f === 'ann') ? all.find((x) => x.c === 'ann' && x.imp) : null;
	const popened = $('ntPin').querySelector('.ntpin.open');
	$('ntPin').innerHTML = pin ? `<div class="ntpin${popened ? ' open' : ''}" data-k="${esc(pin.k)}" role="button" tabindex="0"><div class="pt">${ntSvg('ann').replace('<svg', '<svg style="width:15px;height:15px"')}置顶 · 重要公告</div><b>${esc(pin.title)}</b>${pin.body ? `<p>${esc(pin.body)}</p>` : ''}<div class="pm"><span>${esc(fbWhen(pin.t))}</span><span>${pin.body ? (popened ? '收起' : '点开看全文') : ''}</span></div></div>` : '';
	const list = all.filter((x) => (NT.f === 'all' || x.c === NT.f) && x !== pin), lim = 60 + NT.more;
	const opened = new Set([...box.querySelectorAll('.ntit.open')].map((x) => x.dataset.k));
	const warn = [];
	if (d.annFail) warn.push('暂时连不上官网，公告是上次取到的');
	if (!noCloud() && cloudErr) warn.push('云端的记录读不到（' + cloudErr + '）');
	const EMPTY = { all: ['都很安静', '路由器一切正常，也没有新公告'], sys: ['没有系统通知', '路由器、云端监测、托管服务的消息会出现在这里'], ann: ['没有公告', '开发者发布公告后会出现在这里'], upd: ['已经是最新版', '有新版本时会出现在这里'], fb: ['没有反馈进度', '你发的反馈有进展、开发者回复你时会出现在这里'] };
	let html = warn.length ? `<div class="notice w" style="margin-top:14px">${esc(warn.join('；'))}</div>` : '';
	if (!list.length) { box.innerHTML = html + (pin ? '' : `<section class="card ntempty" style="margin-top:14px">${ntSvg(NT.f === 'all' ? 'bell' : NT.f === 'sys' ? 'sys' : NT.f)}<b>${EMPTY[NT.f][0]}</b><p>${EMPTY[NT.f][1]}</p></section>`); box._items = []; return; }
	let cur = null, rows = [], nd = 0;
	const flush = () => { if (rows.length) html += `<div class="ntday"><span>${esc(cur)}</span>${nd ? `<span style="color:var(--brand)">${nd} 条新的</span>` : ''}</div><section class="card ntlist">${rows.join('')}</section>`; rows = []; nd = 0; };
	for (const x of list.slice(0, lim)) {
		const dd = ntDay(x.t); if (dd !== cur) { flush(); cur = dd; }
		const isNew = x.t > seen; if (isNew) nd++;
		const tm = x.t ? new Date(x.t).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '';
		const nav = x.go || x.fb || x.upd;
		rows.push(`<div class="ntit${opened.has(x.k) ? ' open' : ''}${isNew ? ' new' : ''}" data-k="${esc(x.k)}" role="button" tabindex="0"><span class="ntic ${esc(x.lvl)}">${ntSvg(x.ic)}</span><div class="ntb"><b>${esc(x.title)}</b>${x.body ? `<p>${esc(x.body)}</p>` : ''}<span class="ntm"><i>${esc(x.src)}</i>${tm ? '<span>' + tm + '</span>' : ''}${isNew ? '<span style="color:var(--brand);font-weight:700">新</span>' : ''}</span></div>${nav ? '<span class="ntgo" aria-hidden="true">›</span>' : ''}</div>`);
	}
	flush();
	if (list.length > lim) html += `<button class="btn" data-ntmore style="width:100%;margin-top:12px">再看 ${Math.min(60, list.length - lim)} 条（共 ${list.length} 条）</button>`;
	box.innerHTML = html;
	box._items = list;
}
$('ntChips').onclick = (e) => { const c = e.target.closest('[data-ntf]'); if (!c) return; NT.f = c.dataset.ntf; NT.more = 0; ntRender(); };
$('p-notice').querySelector('.ntent').onclick = (e) => { const b = e.target.closest('[data-goto]'); if (b) go(b.dataset.goto); };
$('ntPin').onclick = (e) => { const p = e.target.closest('.ntpin'); if (!p) return; p.classList.toggle('open'); const s = p.querySelector('.pm span:last-child'); if (s && s.textContent) s.textContent = p.classList.contains('open') ? '收起' : '点开看全文'; };
$('ntList').onclick = (e) => {
	if (e.target.closest('[data-ntmore]')) { NT.more += 60; return ntRender(); }
	const it = e.target.closest('.ntit'); if (!it) return;
	const x = ($('ntList')._items || []).find((y) => y.k === it.dataset.k); if (!x) return;
	if (x.fb) { FB_FOCUS = x.fb; return go('myfb'); }
	if (x.upd === 'router') return updSheet(false);
	if (x.upd === 'app') return toast('回到 App 首页（路由器列表），会提示一键更新');
	if (x.go) return go(x.go);
	it.classList.toggle('open');
};
for (const id of ['ntList', 'ntPin']) $(id).onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && (e.target.classList.contains('ntit') || e.target.classList.contains('ntpin'))) { e.preventDefault(); e.target.click(); } };
$('bellBtn').onclick = () => go('notice');

/* ---------- 实时联系开发者（4.0）：开着这一页时每 4 秒拿一次新消息；回复会推送到手机 ---------- */
const CH = { msgs: [], seq: 0, timer: 0, busy: false, img: '', hosted: true, none: false, blocked: false, pend: [], imgs: {}, at: 0 };
try { if (store.get('rp_chtips') === '0') $('chTips').classList.add('hide'); } catch (e) {}
$('chTipBtn').onclick = () => { const h = $('chTips').classList.toggle('hide'); store.set('rp_chtips', h ? '0' : '1'); };
function chStop() { clearInterval(CH.timer); CH.timer = 0; }
async function loadChat(quiet) {
	if (!quiet) chRender();
	await chPull(!quiet);
	chStop(); CH.timer = setInterval(() => { if (page === 'chat' && !document.hidden) chPull(false).catch(() => {}); }, 4000);
}
async function chPull(full) {
	if (CH.busy) return; CH.busy = true;
	try {
		const r = await P('chat', { op: 'get', after: full ? 0 : CH.seq, read: true }, 20000);
		CH.hosted = r.hosted !== false; CH.none = !!r.none; CH.blocked = !!r.blocked; CH.adminSeen = r.adminSeen || 0;
		if (full) CH.msgs = r.msgs || [];
		else for (const m of r.msgs || []) if (!CH.msgs.some((x) => x.s === m.s)) CH.msgs.push(m);
		CH.msgs.sort((a, b) => a.s - b.s);
		const before = CH.seq;
		CH.seq = Math.max(CH.seq, r.seq || 0, ...CH.msgs.map((m) => m.s));
		if (NT.d) { NT.d.chat = { ...(NT.d.chat || {}), uu: 0, seq: CH.seq }; ntBadge(); }
		CH.err = '';
		chRender(full || CH.seq !== before);
	} catch (e) { CH.err = e.message; chRender(false); if (full) throw e; }
	finally { CH.busy = false; }
}
const chTime = (t) => new Date(t).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
function chRender(scroll) {
	const box = $('chList'); if (!box) return;
	const nearBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 140;
	$('chSub').textContent = CH.blocked ? '暂时不能发消息' : CH.hosted ? '直接跟开发这个面板的人对话' : '自建版也能用：第一次发消息时自动建立对话';
	$('chNote').textContent = CH.err ? '连不上：' + CH.err : CH.blocked ? '暂时不能发消息了，有问题可以在官网报告问题' : CH.hosted ? '开发者回复后会推送到手机' : '开发者回复后，路由器会在半小时内推送到手机';
	$('chSend').disabled = CH.blocked; $('chText').disabled = CH.blocked; $('chImgBtn').disabled = CH.blocked;
	const all = [...CH.msgs, ...CH.pend];
	if (!all.length) {
		box.innerHTML = `<div class="chempty">${CH.none || !CH.msgs.length ? '还没有消息。有什么想问的，直接写下来发送就行。' : ''}<div class="chips" style="margin-top:12px">${['面板打不开了', '安装失败了', '想要一个新功能', '某个提示看不懂'].map((x) => `<button class="chip" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>`;
		return;
	}
	let html = '', day = '';
	for (const m of all) {
		const dd = ntDay(m.t); if (dd !== day) { day = dd; html += `<div class="chday">${esc(dd)}</div>`; }
		const me = m.f === 'u';
		const img = m.img ? (m.local || CH.imgs[m.s] ? `<img src="${esc(m.local || CH.imgs[m.s])}" alt="图片" data-big="${m.s || ''}">` : `<span class="imgph" data-load="${m.s}">点开看图片</span>`) : '';
		const st = m.pending ? '<div class="chmeta">发送中…</div>' : m.fail ? `<div class="chmeta bad" data-retry="${m.id}">没发出去：${esc(m.fail)} · 点这里重发</div>` : `<div class="chmeta">${chTime(m.t)}${me && CH.adminSeen >= m.s ? ' · 开发者已读' : ''}</div>`;
		html += `<div class="chrow${me ? ' me' : ''}">${me ? '' : `<div class="chwho">${m.auto ? '自动回复' : '开发者'}</div>`}<div class="chbub">${img}${m.x ? esc(m.x) : ''}</div>${st}</div>`;
	}
	box.innerHTML = html;
	for (const ph of box.querySelectorAll('[data-load]')) chImg(+ph.dataset.load);
	if (scroll && (nearBottom || CH.first !== false)) { CH.first = false; requestAnimationFrame(() => scrollTo({ top: document.documentElement.scrollHeight })); }
}
async function chImg(seq) {
	if (CH.imgs[seq] || CH['ld' + seq]) return; CH['ld' + seq] = 1;
	try { const r = await P('chat', { op: 'img', seq }, 30000); if (r.data) { CH.imgs[seq] = r.data; chRender(false); } } catch (e) {}
}
$('chList').onclick = (e) => {
	const q = e.target.closest('[data-q]'); if (q) { $('chText').value = q.dataset.q + '：'; $('chText').focus(); return chGrow(); }
	const im = e.target.closest('img[data-big]'); if (im) { const w = document.createElement('div'); w.className = 'modal'; w.style.cssText = 'display:grid;place-items:center;background:rgba(0,0,0,.85);z-index:90;position:fixed;inset:0;padding:16px'; w.innerHTML = `<img src="${im.src}" style="max-width:100%;max-height:92vh;border-radius:12px">`; w.onclick = () => w.remove(); document.body.appendChild(w); return; }
	const rt = e.target.closest('[data-retry]'); if (rt) { const p = CH.pend.find((x) => String(x.id) === rt.dataset.retry); if (p) { CH.pend = CH.pend.filter((x) => x !== p); chSend(p.x, p.local); } }
};
const chGrow = () => { const t = $('chText'); t.style.height = 'auto'; t.style.height = Math.min(132, t.scrollHeight) + 'px'; };
$('chText').oninput = chGrow;
$('chText').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover:hover) and (pointer:fine)').matches) { e.preventDefault(); $('chSend').click(); } };
$('chImgBtn').onclick = () => $('chFile').click();
$('chFile').onchange = async () => {
	const f = $('chFile').files[0]; $('chFile').value = ''; if (!f) return;
	try { CH.img = await shrinkImg(f, 9e5); $('chPreImg').src = CH.img; $('chPre').classList.remove('hidden'); } catch (e) { toast(e.message, true); }
};
$('chPreX').onclick = () => { CH.img = ''; $('chPre').classList.add('hidden'); };
$('chSend').onclick = () => {
	const x = $('chText').value.trim(), img = CH.img;
	if (!x && !img) return toast('写点什么再发吧');
	if (/(密码|password|passwd)\s*[:：=]\s*\S{4,}|ss:\/\/|vmess:\/\/|trojan:\/\/|vless:\/\//i.test(x) && !confirm('看起来里面有密码或节点链接，开发者不需要这些。确定要发吗？')) return;
	$('chText').value = ''; chGrow(); CH.img = ''; $('chPre').classList.add('hidden');
	chSend(x, img);
};
let chPid = 0;
async function chSend(x, img) {
	const p = { id: ++chPid, f: 'u', t: Date.now(), x, img: img ? { type: 'image/jpeg' } : null, local: img || '', pending: true };
	CH.pend.push(p); chRender(true); requestAnimationFrame(() => scrollTo({ top: document.documentElement.scrollHeight }));
	try {
		const r = await P('chat', { op: 'send', text: x, img: img || undefined, ua: navigator.userAgent }, 60000);
		CH.pend = CH.pend.filter((y) => y !== p);
		if (r.msg) { if (img) CH.imgs[r.msg.s] = img; if (!CH.msgs.some((m) => m.s === r.msg.s)) CH.msgs.push(r.msg); CH.seq = Math.max(CH.seq, r.msg.s); }
		CH.none = false; CH.hosted = r.hosted !== false;
		chRender(true);
	} catch (e) { p.pending = false; p.fail = e.message; chRender(true); }
}
// 问题反馈有回复了：开发者在管理页标了已修复、或者写了回复，打开面板时提示一次（托管版；看过的不再提示）
async function fbCheck() {
	if (!token || LK.on || document.hidden || document.querySelector('.modal')) return;
	fbAt = Date.now();
	let r; try { r = await P('fb_replies', {}, 30000); } catch (e) { return; }
	// 正在看「我的反馈」：不弹窗，直接刷新列表（列表里会标「新」）
	if (page === 'myfb') return void myfbRender(r);
	const x = (r?.list || []).filter((y) => (y.reply || y.done || y.nofix || y.ackAt) && y.updated > (y.seen || 0)).sort((a, b) => b.updated - a.updated)[0];
	if (!x || document.querySelector('.modal')) return;
	const when = (t) => new Date(t).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	const stage = Math.max(x.stage || (x.done || x.nofix ? 3 : 1), x.reply ? 2 : 1);
	modal(`<div class="sheethead"><h3>${x.done ? '你反馈的问题修好了' : x.nofix ? '你反馈的问题暂时没法修复' : x.reply ? '你的反馈有新的说明' : '开发人员已收到你的反馈'}</h3></div>
	<p class="muted" style="font-size:13px;margin:0">${esc(when(x.at))} 发的反馈</p>
	${fbSteps(stage, !!x.nofix)}
	${x.reply ? `<p class="muted" style="font-size:13px;margin:12px 0 6px">${x.nofix ? '开发者说明的原因' : '开发者的说明'}</p><div class="notice"><div data-txt style="white-space:pre-wrap;line-height:1.65;max-height:9.9em;overflow:hidden">${esc(x.reply)}</div></div><button class="btn sm hidden" data-more style="margin-top:8px">查看全部</button>` : ''}
	${fbCodeRow(x.code)}
	${x.done ? '<p class="muted" style="font-size:13px;margin:10px 0 0">如果还有问题，在「系统操作 → 问题反馈」里再发一次就行。</p>' : x.nofix ? '<p class="muted" style="font-size:13px;margin:10px 0 0">以后情况有变化，可以在「系统操作 → 问题反馈」里再发一次。</p>' : ''}
	<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-track>查看完整记录</button><button class="btn primary" data-v="close">知道了</button></div>`,
	(m, close) => {
		m.dataset.fbr = 1; fbCodeBind(m, x.code, close);
		// 回复太长（超过 6 行）：先折叠，点「查看全部」展开，再点收起
		const t = m.querySelector('[data-txt]'), b = m.querySelector('[data-more]');
		if (!t || !b) return;
		const fold = (on) => { t.style.maxHeight = on ? '9.9em' : 'none'; t.style.webkitMaskImage = t.style.maskImage = on ? 'linear-gradient(180deg,#000 70%,transparent)' : 'none'; b.textContent = on ? '查看全部' : '收起'; };
		if (t.scrollHeight > t.clientHeight + 4) { b.classList.remove('hidden'); fold(true); b.onclick = () => fold(t.style.maxHeight === 'none'); }
		else t.style.maxHeight = 'none';
	});
	P('fb_seen', { code: x.code, updated: x.updated, done: x.done || x.nofix ? 1 : 0 }).catch(() => {});
}
const UPD_STEPS = [['downloading', '下载新版安装包'], ['installing', '安装（保留所有设置）'], ['check', '重新启动面板服务'], ['done', '完成']];
async function updStart(noConfirm) {
	if (!UPD) await updCheck(true);
	if (!noConfirm && !(await confirmBox('一键更新', '更新到 v' + (UPD?.latest || '最新版') + '？\n网址、密钥、设置都保留；面板会断开 10–30 秒，不会断网。', '开始更新'))) return;
	try { await P('update_start', { confirm: 'UPDATE' }, 20000); } catch (e) { return toast(e.message, true); }
	let lost = 0, t0 = Date.now(), fin = false;
	modal(`<h3>正在更新路由器面板</h3><ul class="updsteps" data-steps></ul><p class="muted" data-msg style="font-size:13px;margin:6px 0 0">开始…</p><div class="btngrid hidden" data-end style="margin:12px 0 0"><button class="btn primary" data-done>完成</button></div>`,
	(m, close) => {
		m.dataset.lock = 1; m.dataset.upd = 1;
		const draw = (st, msg, reloading) => {
			const idx = { queued: 0, downloading: 0, installing: 1, rollback: 2, done: 3, rolledback: 3, failed: 3 }[st] ?? 0;
			const cur = reloading ? 2 : idx;
			m.querySelector('[data-steps]').innerHTML = UPD_STEPS.map((x, i) => `<li class="${i < cur || (st === 'done' && i === 3) ? 'ok' : i === cur && st !== 'failed' && st !== 'rolledback' ? 'on' : ''}">${esc(x[1])}</li>`).join('');
			m.querySelector('[data-msg]').textContent = msg;
		};
		const end = (ok, msg) => {
			fin = true;
			draw(ok ? 'done' : 'failed', msg);
			m.querySelector('[data-end]').classList.remove('hidden');
			m.querySelector('[data-done]').onclick = () => { close(null); if (ok) refreshPanel(); };
		};
		const poll = async () => {
			if (fin) return;
			if (Date.now() - t0 > 6 * 60e3) return end(false, '还没更新完：过几分钟刷新面板看看版本号；如果一直这样，用安装命令手动升级。');
			try {
				const s = await P('update_status', {}, 8000);
				lost = 0;
				if (s.state === 'done') return end(true, s.msg + '。点「完成」刷新面板，就是新版了。');
				if (s.state === 'rolledback' || s.state === 'failed') return end(false, s.msg);
				draw(s.state, s.msg || '');
			} catch (e) {
				lost++;
				draw('installing', '面板服务正在重启，马上回来…', true);
			}
			setTimeout(poll, 2000);
		};
		draw('downloading', '正在下载新版安装包');
		setTimeout(poll, 1500);
	});
}

// 换一把新的登录密钥：这台手机自动换成新的；其他手机、Claude 连接器要重新填
async function rotateKey() {
	if (!(await confirmBox('换一把新的登录密钥', '换了之后：\n· 旧的登录地址马上作废，谁拿到旧地址都进不来\n· 这台手机自动换成新密钥，不用重新登录\n· 其他已经登录的手机要重新添加（在这台手机「添加新手机」扫码）\n· 用「Claude 连接器地址」加的 Claude 连接器不受影响', '换新密钥', true))) return;
	let r;
	try { r = await P('rotate_key', { confirm: 'ROTATE' }, 30000); } catch (e) { return toast(e.message, true); }
	token = r.token; store.set('rp_token', r.token);
	const login = location.origin + '/cgi-bin/mcp/' + r.token;
	modal(`<div class="sheethead"><h3>已换成新密钥</h3><button class="btn sm" data-v="close">关闭</button></div>
	<p class="muted" style="margin:0 0 10px">旧的登录地址已经作废。这是新的登录地址，点一下显示：</p>
	<div class="qrbox blur keybox" style="word-break:break-all;font:13px/1.5 ui-monospace,monospace;padding:14px;text-align:left">${esc(login)}<span>点一下显示</span></div>
	${r.selfcloud ? '<div class="notice w" style="margin-top:12px">你用的是自建完整版：还要把 Cloudflare Worker 的密钥 <b>PANEL_TOKEN</b> 换成新的登录密钥（地址最后那一串），不然推送和云端备份会连不上。</div>' : ''}
	<div class="notice" style="margin-top:12px">接下来：其他手机在这台手机「系统操作 → 添加新手机」扫码重新添加。Claude 里如果用的是旧的登录地址，换成「系统操作 → Claude 连接器地址」里的地址。</div>
	<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-copy>复制新地址</button><button class="btn primary" data-v="close">完成</button></div>`,
	(m) => { qrReveal(m); m.querySelector('[data-copy]').onclick = () => copyText(login); });
}
// 「系统操作」里按版本显示的项：已登录的手机（托管版）、Claude 连接器地址（AI 版）
// 托管服务的到期时间：系统操作里显示；还剩 3 天以内首页提示去申请续期
const ymd = (ms) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
let SVC = null;
// 按上次记下的到期时间判断：托管服务是不是已经到期（到期后专属网址暂停，面板连不上路由器）
const svcExpired = () => !!(SVC && SVC.hosted && SVC.exp && SVC.exp <= Date.now());
const SVC_EXP_MSG = () => '托管服务 ' + ymd(SVC.exp) + ' 到期，专属网址暂停了，所以连不上路由器；家里上网和路由器上的设置都不受影响。去官网账号页点「申请续期」填个表，审核通过后马上恢复，不用重装（刚续过的话，等一两分钟再刷新）。';
function svcRender() {
	const s = SVC;
	$('svcBtn').classList.toggle('hidden', !s || !s.hosted);
	if (!s || !s.hosted) { $('mSvc').classList.add('hidden'); return; }
	const left = s.exp ? Math.ceil((s.exp - Date.now()) / 86400e3) : null;
	$('svcState').textContent = s.exp == null ? '查不到到期时间' : !s.exp ? '不限期' : left <= 0 ? '已到期' : '到期 ' + ymd(s.exp) + '（还剩 ' + left + ' 天）';
	const warn = s.exp && left <= 3;
	$('mSvc').classList.toggle('hidden', !warn);
	if (warn) { $('mSvcT').textContent = left <= 0 ? '托管服务已到期' : '托管服务还剩 ' + left + ' 天到期'; $('mSvcD').textContent = left <= 0 ? SVC_EXP_MSG() : '到期时间 ' + ymd(s.exp) + '。去官网账号页点「申请续期」填个表，审核通过自动续上，不用重装'; }
}
async function svcLoad(force) {
	try { SVC = await P('svc_info', { force: !!force }); store.set('rp_svc', JSON.stringify(SVC)); } catch (e) {}
	svcRender();
	return SVC;
}
try { SVC = JSON.parse(store.get('rp_svc') || 'null'); } catch (e) {}
$('mSvcGo').onclick = () => { if (SVC && SVC.hub) window.open(SVC.hub + '/app', '_blank', 'noopener'); };
async function svcSheet() {
	const s = await svcLoad(true);
	if (!s || !s.hosted) return toast('这台路由器不是托管版', true);
	const left = s.exp ? Math.ceil((s.exp - Date.now()) / 86400e3) : null;
	modal(`<div class="sheethead"><h3>托管服务</h3><button class="btn sm" data-v="close">关闭</button></div>
	<div class="kv"><span>到期时间</span><b>${s.exp == null ? '查不到' : !s.exp ? '不限期' : esc(ymd(s.exp)) + (left > 0 ? '（还剩 ' + left + ' 天）' : '（已到期）')}</b></div>
	${s.exp ? `<p class="muted" style="font-size:13px;margin:10px 0 0;line-height:1.7">快到期时去官网账号页，在这台路由器下面点「申请续期」填个表，审核通过就自动续上，不用重装、不用换码。有续期码的也可以直接在这里输入。</p>
	<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-code>输入续期码</button><a class="btn primary" href="${esc(s.hub + '/app')}" target="_blank" rel="noopener">去官网申请续期</a></div>` : '<p class="muted" style="font-size:13px;margin:10px 0 0">这台路由器不限期，不用续期。</p>'}`,
	(m, close) => {
		const b = m.querySelector('[data-code]');
		if (b) b.onclick = async () => {
			const code = await promptBox('输入续期码', '找提供服务的人要的续期码');
			if (!code) return;
			try { const r = await P('svc_renew', { code }, 30000); toast('已续期 ' + r.days + ' 天，到期时间 ' + ymd(r.exp)); close(null); svcLoad(true); } catch (e) { toast(e.message, true); }
		};
	});
}
function moreBtns() { $('devsBtn').classList.toggle('hidden', !store.get('rp_dev')); $('ckeyBtn').classList.toggle('hidden', store.get('rp_ai') !== '1'); }
const agoS = (t) => { if (!t) return '—'; const s = Date.now() / 1000 - t; return s < 120 ? '刚刚' : s < 3600 ? Math.round(s / 60) + ' 分钟前' : s < 86400 ? Math.round(s / 3600) + ' 小时前' : Math.round(s / 86400) + ' 天前'; };
function devList() {
	modal(`<div class="sheethead"><h3>已登录的手机</h3><button class="btn sm" data-v="close">关闭</button></div><div data-dl><div class="muted" style="padding:20px 0;text-align:center">读取中…</div></div>`, (m, close) => {
		const box = m.querySelector('[data-dl]');
		const draw = async () => {
			try {
				const r = await P('device_list');
				box.innerHTML = `<p class="muted" style="margin:0 0 8px;font-size:13.5px">这些手机输过登录码，能打开面板。不认识的马上移除：移除后它要重新输登录码才能进来。</p>
				${r.list.map((d) => `<div class="devrow"><div class="devtx"><b>${esc(d.name)}</b>${d.me ? ' <span class="pill blue">这台</span>' : ''}<div class="muted">${esc(new Date(d.at * 1000).toLocaleDateString('zh-CN'))} 登录 · ${esc(d.via || '')}${d.me ? '' : ' · 最近使用：' + esc(d.seen ? agoS(d.seen) : '路由器重启后还没用过')}</div></div>${d.me ? '' : `<button class="btn sm danger" data-rm="${esc(d.id)}">移除</button>`}</div>`).join('') || '<div class="muted">没有记录</div>'}
				${r.list.length > 1 ? '<div class="btngrid" style="margin:12px 0 0"><button class="btn danger" data-all>除了这台，全部移除</button></div>' : ''}`;
				box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => {
					if (!(await confirmBox('移除这台手机', '「' + b.closest('.devrow').querySelector('b').textContent + '」要重新输登录码才能打开面板。', '移除', true))) return;
					busy(b, async () => { await P('device_remove', { id: b.dataset.rm }); toast('已移除'); await draw(); });
				}));
				const all = box.querySelector('[data-all]');
				if (all) all.onclick = async () => {
					if (!(await confirmBox('移除其他所有手机', '除了这台，其他手机都要重新输登录码才能打开面板。', '全部移除', true))) return;
					busy(all, async () => { await P('device_remove', { all_others: true }); toast('已移除'); await draw(); });
				};
			} catch (e) { box.innerHTML = `<div class="notice w">${esc(e.message)}</div>`; }
		};
		draw();
	});
}
async function ckeySheet() {
	let r;
	try { r = await P('ckey_info'); } catch (e) { return toast(e.message, true); }
	if (!r.ai) return toast('这台路由器装的是纯面板版，没有 Claude 连接器', true);
	modal(`<div class="sheethead"><h3>Claude 连接器地址</h3><button class="btn sm" data-v="close">关闭</button></div>
	<p class="muted" style="margin:0 0 10px">在 Claude「设置 → 连接器 → 添加自定义连接器」里填这个地址，就能在对话里管理路由器。它只给 Claude 用，打不开面板。点一下显示：</p>
	<div class="qrbox blur keybox" style="word-break:break-all;font:13px/1.5 ui-monospace,monospace;padding:14px;text-align:left">${esc(r.url || '（还没有网址）')}<span>点一下显示</span></div>
	<div class="notice w" style="margin-top:12px">⚠️ 拿到这个地址就能让 AI 控制你的路由器：不要发给别人。泄露了就点「换一个地址」，旧的马上作废。</div>
	${r.hosted ? '<div class="notice" style="margin-top:10px">以前在 Claude 里用「登录地址」加过连接器的：托管版现在不能用了，把它删掉，用这个地址重新添加。</div>' : ''}
	<div class="btngrid three" style="margin:12px 0 0"><button class="btn danger" data-rot>换一个地址</button><button class="btn" data-copy>复制</button><button class="btn primary" data-v="close">完成</button></div>`,
	(m, close) => {
		qrReveal(m);
		m.querySelector('[data-copy]').onclick = () => copyText(r.url);
		m.querySelector('[data-rot]').onclick = async () => {
			if (!(await confirmBox('换一个连接器地址', '旧地址马上作废，Claude 里要删掉旧连接器、用新地址重新添加。面板和登录不受影响。', '换新地址', true))) return;
			try { await P('ckey_rotate', { confirm: 'CKEY' }); toast('已换新地址'); close(null); ckeySheet(); } catch (e) { toast(e.message, true); }
		};
	});
}
function hubBind() {
	modal(`<div class="sheethead"><h3>绑定到账号</h3><button class="btn sm" data-v="close">关闭</button></div><div data-hb><div class="muted" style="padding:20px 0;text-align:center">正在获取配对码…</div></div>`, (m) => {
		const box = m.querySelector('[data-hb]');
		const draw = async () => {
			try {
				const [p, accs] = await Promise.all([P('hub_pair', {}, 30000), P('hub_accounts', {}, 30000).catch(() => [])]);
				await loadQr();
				box.innerHTML = `<p class="muted" style="margin:0 0 6px">在官网登录账号，填入下面的配对码；或者用已登录官网的手机扫码。10 分钟内有效。</p>
				<div class="paircode">${esc(p.code.slice(0, 4) + ' ' + p.code.slice(4))}</div>
				<div class="qrbox">${qrSvg(p.url)}</div>
				<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-copy>复制链接</button><a class="btn primary" href="${esc(p.url)}" target="_blank" rel="noopener">打开官网</a></div>
				<div class="subhd">已绑定这台路由器的账号</div>
				${accs.length ? accs.map((a) => `<div class="kv"><span>${esc(a.email)}</span><button class="btn sm danger" data-unb="${esc(a.uid)}">移除</button></div>`).join('') : '<div class="muted" style="font-size:13px;margin-top:6px">还没有账号绑定</div>'}
				<p class="muted" style="font-size:12.5px;margin:12px 0 0">绑定了的账号可以在官网拿「登录码」：每台新手机第一次打开面板要输一次（还要有登录地址，或者用「添加新手机」扫码）。不认识的账号马上移除。</p>`;
				box.querySelector('[data-copy]').onclick = () => copyText(p.url);
				box.querySelectorAll('[data-unb]').forEach((b) => (b.onclick = async () => {
					if (!(await confirmBox('移除账号', '把 ' + b.closest('.kv').firstElementChild.textContent + ' 从这台路由器移除？对方的官网账号里就看不到这台路由器了。', '移除', true))) return;
					busy(b, async () => { await P('hub_unbind', { uid: b.dataset.unb }, 30000); toast('已移除'); await draw(); });
				}));
			} catch (e) { box.innerHTML = `<div class="notice w">${esc(e.message)}</div>`; }
		};
		draw();
	});
}
themeLabel();


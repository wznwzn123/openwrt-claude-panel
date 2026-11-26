/* ---------- 6.0 第 69 项：分流——按设备、按软件、按国家和地区选直连 / 代理 / 某个策略组 ----------
 * 只支持 OpenClash 和 Nikki；要重启插件才生效的改动，顶上一直提示「现在重启」，用户点了才重启（用户 11/26 定）。
 * 订阅更新后选的策略组没了：路由器自动改走主策略组并推送，这里列出来。 */
const SPL = { d: null, tab: 'dev' };
async function loadSplit() {
	SPL.d = await P('split_get', {}, 20000);
	setStatus(true, '在线');
	splRender();
}
const SPL_PX = (d) => (d.kind === 'nikki' ? 'Nikki' : 'OpenClash');
function splName(t) {
	const d = SPL.d;
	if (!t) return '跟随全局';
	if (t === 'DIRECT') return '直连';
	if (t === 'PROXY') return '代理';
	return t;
}
function splRows() {
	const d = SPL.d, row = (k, id, name, sub, t) => `<button class="file splrow" type="button" data-sk="${k}" data-sid="${esc(id)}"><div style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(name)}</b>${sub ? `<span class="muted ell" style="display:block;font-size:12.5px">${esc(sub)}</span>` : ''}</div><span class="pill${t ? ' on' : ''}">${esc(splName(t))}</span></button>`;
	if (SPL.tab === 'app') return d.apps.map((a) => row('app', a.id, a.name, '', d.app[a.id])).join('');
	if (SPL.tab === 'geo') return d.geos.map((g) => row('geo', g.id, g.name, '', d.geo[g.id])).join('');
	// 设备：设了分流的在前，再按在线、名字
	const seen = {}, list = [];
	for (const x of d.devices) { seen[x.mac] = 1; list.push(x); }
	for (const [mac, v] of Object.entries(d.dev)) if (!seen[mac]) list.push({ mac, name: v.name, ip: v.ip, online: false });
	list.sort((a, b) => (!!d.dev[b.mac] - !!d.dev[a.mac]) || (b.online - a.online) || String(a.name || '').localeCompare(String(b.name || '')));
	return list.length ? list.map((x) => row('dev', x.mac, x.name || x.mac, (d.dev[x.mac]?.ip || x.ip || '') + (x.online ? '' : (x.ip || d.dev[x.mac]?.ip ? ' · ' : '') + '离线'), d.dev[x.mac]?.t)).join('') : '<div class="empty">还没有设备</div>';
}
function splRender() {
	const d = SPL.d;
	if (!d) return;
	if (!d.kind) { $('splBody').innerHTML = '<section class="card empty" style="margin-top:12px">分流只支持 OpenClash 和 Nikki</section>'; return; }
	const mv = (d.moved || []).filter((x) => Date.now() / 1000 - x.at < 7 * 86400).map((x) => `<div class="notice w" style="margin-top:12px">策略组「${esc(x.g)}」没了，已改走代理（${esc(d.main || '主策略组')}）</div>`).join('');
	$('splBody').innerHTML = `${d.pending ? `<div class="notice w splpend" style="margin-top:12px"><span>重启 ${SPL_PX(d)} 后生效</span><button class="btn sm" id="splRs" type="button">现在重启</button></div>` : ''}
		${d.live ? '' : `<div class="notice" style="margin-top:12px">${SPL_PX(d)} 没在运行，策略组是从配置文件里读的</div>`}${mv}
		<div class="chips" id="splTab" style="margin-top:12px">${[['dev', '设备'], ['app', '软件'], ['geo', '国家和地区']].map(([k, t]) => `<button class="chip${SPL.tab === k ? ' on' : ''}" type="button" data-st="${k}">${t}</button>`).join('')}</div>
		<section class="card list" style="margin-top:12px">${splRows()}</section>`;
}
async function splPick(k, id) {
	const d = SPL.d, name = k === 'app' ? d.apps.find((a) => a.id === id)?.name : k === 'geo' ? d.geos.find((g) => g.id === id)?.name : (d.devices.find((x) => x.mac === id)?.name || d.dev[id]?.name || id);
	const cur = k === 'dev' ? d.dev[id]?.t || '' : d[k][id] || '';
	const opts = [['', '跟随全局'], ['DIRECT', '直连'], ...(d.main ? [['PROXY', '代理（' + d.main + '）']] : []), ...d.groups.filter((g) => g !== d.main).map((g) => [g, g])];
	const v = await modal(`<h3 class="ell">${esc(name)}</h3><div class="mlist splopts">${opts.map(([t, n]) => `<button class="mact" type="button" data-v="o:${esc(t)}"><span><b class="ell" style="display:block">${esc(n)}</b></span>${t === cur ? '<span class="splck">✓</span>' : ''}</button>`).join('')}</div>`);
	if (typeof v !== 'string' || !v.startsWith('o:')) return;
	const t = v.slice(2);
	if (t === cur) return;
	const body = k === 'dev' ? { dev: { mac: id, ip: d.devices.find((x) => x.mac === id)?.ip, name, t } } : { [k]: { id, t } };
	try {
		SPL.d = await P('split_set', body, 30000);
		splRender();
		toast(`已设置：${name} → ${splName(t)}`);
	} catch (e) { toast(e.message, true); }
}
$('splBody').addEventListener('click', async (e) => {
	const tb = e.target.closest('[data-st]');
	if (tb) { SPL.tab = tb.dataset.st; return splRender(); }
	if (e.target.id === 'splRs') {
		if (!(await confirmBox('重启 ' + SPL_PX(SPL.d), '断网十几秒。', '重启'))) return;
		return busy(e.target, async () => { try { await P('split_restart'); SPL.d.pending = false; splRender(); toast('正在重启 ' + SPL_PX(SPL.d)); } catch (er) { toast(er.message, true); } });
	}
	const r = e.target.closest('[data-sk]');
	if (r) splPick(r.dataset.sk, r.dataset.sid);
});

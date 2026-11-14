/* =====================================================================
   节点
   ===================================================================== */
let groups = [];
const openG = new Set(JSON.parse(store.get('rp_open') || '[]'));
async function loadProxy() {
	groups = (await P('groups')).groups || [];
	setStatus(true, '在线');
	renderProxy();
	loadProviders();
	loadAsw();
}
// 节点自动切换：看门狗每分钟测一次当前节点，连不上就换到同地区延迟最低的节点
const ASW = { st: null, dry: null };
async function loadAsw(b) {
	try { ASW.st = await P('autosw', b || {}, b && b.dry ? 60000 : 15000); if (b && b.dry) ASW.dry = ASW.st.dry; }
	catch (e) { if (b) throw e; ASW.st = { err: e.message }; }
	renderAsw();
}
function renderAsw() {
	const el = $('aswCard'), s = ASW.st;
	if (!el || !s) return;
	const pill = $('aswPill');
	if (s.err) { pill.className = 'pill'; pill.textContent = '—'; el.innerHTML = `<div class="notice w">${esc(s.err)}</div>`; return; }
	pill.className = 'pill ' + (s.enabled ? 'good' : ''); pill.textContent = s.enabled ? '已开启' : '已关闭';
	const isGroup = s.now && groups.some((g) => g.name === s.now);
	const d = ASW.dry;
	let dry = '';
	if (d && d.err) dry = `<div class="notice w" style="margin-top:10px">${esc(d.err)}</div>`;
	else if (d) {
		const cur = `当前「${esc(d.cur)}」${d.curDelay > 0 ? `${d.curDelay} ms，正常` : '<b style="color:var(--danger)">测不通</b>'}。`;
		const nxt = d.subbad ? '订阅' + (d.subbad === 'traffic' ? '流量用光了' : '已经到期') + '，就算当前节点挂了也<b>不会自动切换</b>。'
			: !d.node ? '当前选的是策略组，不是具体节点，自动切换不会动它。'
			: d.pick ? `要是它挂了，会换到${d.same ? '同地区' : '<b>其他地区</b>'}的「${esc(d.pick.n)}」（${d.pick.d} ms）。`
			: '<b>其他节点也都测不通</b>，到时候会推送提醒你检查机场。';
		dry = `<div class="notice ${d.node && !d.pick ? 'w' : ''}" style="margin-top:10px">${cur}${nxt}<br><span class="muted" style="font-size:12.5px">一共测了 ${d.tested} 个节点，${d.ok} 个能用。</span></div>`;
	}
	const sel = s.groups.length > 1 ? `<div class="kv" style="align-items:center"><span>看哪个策略组</span><select class="input" data-aswg style="width:auto;max-width:60%;padding:6px 10px">${s.groups.map((g) => `<option ${g === s.group ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>` : '';
	const fmt = (t) => { const x = new Date(t * 1000); return (x.getMonth() + 1) + '/' + x.getDate() + ' ' + hm(t * 1000); };
	const hist = (s.hist || []).slice(0, 5);
	// 机场订阅：流量用光或到期时不自动切换
	const sb = (d && d.sub) || s.sub, now = Date.now() / 1000;
	const sbad = sb && (sb.total > 0 && sb.up + sb.down >= sb.total ? 'traffic' : sb.expire > 0 && sb.expire <= now ? 'expire' : null);
	const sday = (x) => { const y = new Date(x * 1000); return y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0'); };
	const subRow = sb && (sb.total || sb.expire) ? `<div class="kv"><span>机场订阅</span><span class="${sbad ? 'badc' : ''}">${sb.total ? `剩 ${B(Math.max(0, sb.total - sb.up - sb.down))} / 共 ${B(sb.total)}` : ''}${sb.total && sb.expire ? ' · ' : ''}${sb.expire ? sday(sb.expire) + ' 到期' : ''}</span></div>
		${sbad ? `<div class="notice w" style="margin-top:8px">${sbad === 'traffic' ? '订阅流量用光了' : '订阅已经到期'}：这时节点连不上是因为这个，换节点也没用，所以<b>不会自动切换</b>，只推送提醒你。续费或重置流量后自动恢复。</div>` : ''}` : '';
	el.innerHTML = `<label class="kv aswon"><span><b>节点挂了自动换</b><span class="muted">每分钟测一次「${esc(s.group)}」正在用的节点，连不上就换到同地区延迟最低的节点（同地区都不通才换其他地区），并推送到微信</span></span><span class="sw"><input type="checkbox" data-aswon ${s.enabled ? 'checked' : ''}><i></i></span></label>
		${sel}
		${subRow}
		${s.enabled && isGroup ? `<div class="notice w" style="margin-top:8px">「${esc(s.group)}」现在选的是「${esc(s.now)}」（策略组），自动切换只在选了具体节点时才起作用。</div>` : ''}
		${hist.length ? `<div class="subhd" style="margin-top:10px">最近切换</div>${hist.map((h) => `<div class="kv aswh"><span>${fmt(h.t)}</span><span>${esc(h.from)} → <b>${esc(h.to)}</b>${h.same === false ? '<i>换了地区</i>' : ''}</span></div>`).join('')}` : ''}
		${dry}
		<div class="btngrid" style="margin:12px 0 0;grid-template-columns:1fr"><button class="btn" data-aswdry>模拟一次：要是当前节点挂了，会换到哪</button></div>`;
}
$('aswCard').addEventListener('change', (e) => {
	const on = e.target.closest('[data-aswon]'), g = e.target.closest('[data-aswg]');
	if (on) busy(null, async () => { await loadAsw({ set: true, enabled: on.checked }); toast(on.checked ? '已开启节点自动切换' : '已关闭节点自动切换'); });
	if (g) busy(null, async () => { ASW.dry = null; await loadAsw({ set: true, group: g.value }); toast('改为看「' + g.value + '」'); });
});
$('aswCard').addEventListener('click', (e) => {
	const b = e.target.closest('[data-aswdry]');
	if (b) busy(b, () => loadAsw({ dry: true }), '正在测所有节点');
});
function renderProxy() {
	$('pxCount').textContent = groups.length + ' 个';
	if (!groups.length) { $('pxList').innerHTML = '<div class="card empty">没有策略组（OpenClash 没有运行？）</div>'; return; }
	if (!openG.size) openG.add(groups[0].name);
	$('pxList').innerHTML = groups.map((g, gi) => {
		const sel = g.type === 'Selector';
		const cur = g.nodes.find((n) => n.name === g.now);
		const open = openG.has(g.name);
		return `<section class="card grp ${open ? 'open' : ''}" data-g="${gi}">
			<div class="sechead" data-toggle>
				<div style="min-width:0">
					<b style="font-size:16px">${esc(g.name)}</b> <span class="muted" style="white-space:nowrap">${g.nodes.length} 个${sel ? '' : ' · 自动'}</span>
					<div class="sub" style="font-size:13px;margin-top:2px">${sel ? '当前' : '自动选中'}：${esc(g.now || '—')}</div>
				</div>
				<div class="actions" style="flex-wrap:nowrap">${cur && !cur.group ? delayPill(cur.delay) : ''}<button class="btn sm blue" data-test>测速</button>
				<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></div>
			</div>
			<div class="nodes">${open ? nodesHtml(g) : ''}</div>
		</section>`;
	}).join('');
}
const nodesHtml = (g) => g.nodes.map((n, ni) => `<button class="file ${n.name === g.now ? 'cur' : ''}" data-n="${ni}" ${g.type === 'Selector' ? '' : 'style="cursor:default"'}>
	<div><b>${esc(n.name)}</b><span class="muted">${esc(n.group ? '策略组' : n.type)}${n.name === g.now ? ' · 正在使用' : ''}</span></div>
	${n.group ? '' : delayPill(n.delay)}</button>`).join('');
$('pxList').addEventListener('click', async (e) => {
	const card = e.target.closest('.grp'); if (!card) return;
	const g = groups[+card.dataset.g];
	const t = e.target.closest('[data-test]');
	if (t) { e.stopPropagation(); return busy(t, async () => { await tool('test_delay', { name: g.name, timeout: 4000 }, 90000); await loadProxy(); }); }
	const nb = e.target.closest('[data-n]');
	if (nb) {
		const n = g.nodes[+nb.dataset.n];
		if (g.type !== 'Selector') return toast(`「${g.name}」是自动选择的策略组，不能手动切换`);
		if (n.name === g.now) return;
		return busy(null, async () => {
			// 没测过或上次测不通的节点，先测一下；测不通就提醒（面板在家里 Wi-Fi 下也走代理节点）
			if (!(n.delay > 0)) {
				toast('先测一下这个节点…');
				const c = await P('node_check', { node: n.name }, 20000).catch(() => ({ ok: false }));
				if (c.ok) { n.delay = c.delay; toastHide(); }
				else if (!(await confirmBox('这个节点测不通', `「${n.name}」现在连不上。\n切过去以后海外网站会打不开；你在家里 Wi-Fi 下打开的这个面板也走代理节点，可能也会打不开（换回能用的节点就恢复）。`, '仍然切换', true))) return;
			}
			await tool('switch_proxy', { group: g.name, node: n.name, close_connections: $('pxClose').checked });
			NC.at = {};
			g.now = n.name; renderProxy(); toast(`已切换到 ${n.name}`);
		});
	}
	if (e.target.closest('[data-toggle]')) {
		const open = !card.classList.contains('open');
		card.classList.toggle('open', open);
		card.querySelector('.nodes').innerHTML = open ? nodesHtml(g) : '';
		open ? openG.add(g.name) : openG.delete(g.name);
		store.set('rp_open', JSON.stringify([...openG]));
	}
});
$('pxTestAll').onclick = (e) => busy(e.currentTarget, async () => {
	if (!groups.length) groups = (await P('groups')).groups || [];
	const sel = groups.filter((g) => g.type === 'Selector');
	if (!sel.length) return toast('没有可测速的策略组');
	for (const g of sel) await tool('test_delay', { name: g.name, timeout: 4000 }, 90000);
	await loadProxy(); toast('测速完成');
}, '测速中');
async function loadProviders() {
	let r; try { r = await P('providers'); } catch (e) { $('ppList').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
	$('ppCount').textContent = r.proxies.length + ' 个';
	$('ppList').innerHTML = r.proxies.length ? r.proxies.map((p) => `<div class="file" data-pp="${esc(p.name)}"><div><b>${esc(p.name)}</b><span class="muted">${p.count} 个节点 · ${esc(p.vehicle)} · ${ago(p.updated)}${p.info && p.info.Total ? ' · 剩 ' + B(p.info.Total - p.info.Upload - p.info.Download) : ''}</span></div>
		<div class="actions" style="flex-wrap:nowrap"><button class="btn sm" data-h>测速</button>${p.vehicle === 'HTTP' ? '<button class="btn sm blue" data-u>更新</button>' : ''}</div></div>`).join('') : '<div class="empty">当前配置没有使用代理集（proxy-providers）</div>';
}
$('ppList').onclick = (e) => {
	const row = e.target.closest('[data-pp]'); if (!row) return;
	const name = row.dataset.pp, h = e.target.closest('[data-h]'), u = e.target.closest('[data-u]');
	if (h) busy(h, async () => { await P('provider_update', { kind: 'proxies', name, health: true }, 90000); toast('测速完成'); loadProxy(); });
	if (u) busy(u, async () => { await P('provider_update', { kind: 'proxies', name }, 90000); toast('已更新'); loadProviders(); });
};


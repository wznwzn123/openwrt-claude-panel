/* ---------- 6.0 第 23 项：应用过滤（OAF） ----------
 * OAF 7：总开关、规则（名字、对谁、时间、拦哪些 App）、每台设备今天用了哪些 App（只有主账号能看）。
 * 老版 OAF：去原版页面。没装：去软件中心装；软件源里没有就说这个固件不支持。 */
const OF = { d: null };
const OF_DAY = ['日', '一', '二', '三', '四', '五', '六'];
async function loadOaf() {
	OF.d = await P('oaf_get', {}, 20000);
	setStatus(true, '在线');
	ofRender();
}
const ofDur = (s) => (s < 60 ? s + ' 秒' : s < 3600 ? Math.round(s / 60) + ' 分钟' : (Math.round(s / 360) / 10) + ' 小时');
const ofDev = (mac) => { const u = (OF.d.users || []).find((x) => x.mac === mac); return u && u.name ? u.name : mac; };
function ofDays(w) {
	const s = [...w].sort((a, b) => a - b).join(',');
	return s === '0,1,2,3,4,5,6' ? '每天' : s === '1,2,3,4,5' ? '周一到周五' : s === '0,6' ? '周末' : '周' + w.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((x) => OF_DAY[x]).join('、');
}
function ofRender() {
	const d = OF.d, box = $('ofBody');
	if (!d.kind) {
		box.innerHTML = d.avail === false ? '<section class="card empty">软件源里没有应用过滤（OAF），这个固件不支持</section>'
			: '<section class="card"><div class="wanhd"><b>没装应用过滤</b></div><button class="btn primary" id="ofGet" type="button" style="width:100%;margin-top:12px">去软件中心装</button></section>';
		return;
	}
	if (d.kind === 'legacy') { box.innerHTML = '<section class="card"><div class="wanhd"><b>老版应用过滤（OAF 6 及更早）</b><span class="muted">规则在原版页面里设</span></div><button class="btn" id="ofOld" type="button" style="width:100%;margin-top:12px">打开原版页面</button></section>'; return; }
	const app = {};
	for (const c of d.classes || []) for (const a of c.apps) app[a.id] = a.name;
	const rows = (d.rules || []).map((r) => {
		const t = r.time_rules[0], more = r.time_rules.length > 1 ? ` 等 ${r.time_rules.length} 段` : '';
		const apps = r.app_ids.slice(0, 3).map((i) => app[i] || i).join('、') + (r.app_ids.length > 3 ? ` 等 ${r.app_ids.length} 个` : '');
		return `<div class="file ofrow" data-id="${r.id}" role="button" tabindex="0"><div style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(r.name)}</b><span class="muted ell" style="display:block;font-size:12.5px">${esc((r.mode === 1 ? '所有设备' : ofDev(r.mac)) + ' · ' + (t ? ofDays(t.weekdays) + ' ' + t.start_time + '–' + t.end_time : '') + more)}</span><span class="muted ell" style="display:block;font-size:12.5px">${esc(apps)}</span></div><span class="muted">›</span></div>`;
	}).join('');
	box.innerHTML = `<section class="card">${d.limit ? '<div class="wanhd"><b>应用过滤</b><span class="muted">' + (d.on ? '开着' : '关着') + '</span></div>' : `<label class="fld row" style="margin:0"><div class="lb"><b>应用过滤</b></div><label class="sw"><input type="checkbox" id="ofOn"${d.on ? ' checked' : ''} aria-label="应用过滤"><i></i></label></label>`}</section>
		<div class="sectitle"><b>规则 <span class="pill">${(d.rules || []).length}</span></b><button class="btn sm" id="ofAdd" type="button">添加</button></div>
		<section class="card list"><div id="ofRules">${rows || '<div class="empty">没有规则</div>'}</div></section>
		${d.owner ? `<div class="sectitle"><b>今天用了什么</b></div><section class="card list">${(d.users || []).map((u) => `<button class="file ofuse" data-mac="${esc(u.mac)}" type="button" style="background:none"><div style="flex:1;min-width:0;text-align:left"><b class="ell" style="display:block">${esc(u.name || u.mac)}</b></div>${u.online ? '<span class="pill good">在线</span>' : ''}<span class="muted">›</span></button>`).join('') || '<div class="empty">还没有设备</div>'}</section>` : ''}`;
}
async function ofUsage(mac) {
	let r;
	try { r = await P('oaf_usage', { mac }, 20000); } catch (e) { return toast(e.message, true); }
	const max = Math.max(1, ...r.list.map((x) => x.t));
	modal(`<div class="sheethead"><h3>${esc(ofDev(mac))}</h3><button class="btn sm" data-v="close">关闭</button></div>
		${r.list.length ? `<div class="ofuse-l">${r.list.map((x) => `<div class="ofu"><div class="ofu-t"><b class="ell">${esc(x.name)}</b><span class="muted">${ofDur(x.t)}</span></div><i style="width:${Math.max(3, Math.round((x.t / max) * 100))}%"></i></div>`).join('')}</div>` : '<div class="empty">今天还没用</div>'}`);
}
async function ofEdit(r) {
	const d = OF.d, isNew = !r, me = r || { name: '', mode: d.limit ? 2 : 1, mac: (d.users[0] || {}).mac || '', time_rules: [{ weekdays: [0, 1, 2, 3, 4, 5, 6], start_time: '00:00', end_time: '23:59' }], app_ids: [] };
	let tr = me.time_rules.map((t) => ({ ...t, weekdays: [...t.weekdays] }));
	const sel = new Set(me.app_ids.map(Number));
	const trHtml = () => tr.map((t, i) => `<div class="oftr" data-t="${i}"><div class="ofdays">${[1, 2, 3, 4, 5, 6, 0].map((w) => `<button type="button" class="chip${t.weekdays.includes(w) ? ' on' : ''}" data-w="${w}">${OF_DAY[w]}</button>`).join('')}</div>
		<div class="oftime"><input class="input" type="time" data-s value="${esc(t.start_time)}" aria-label="开始"><span class="muted">到</span><input class="input" type="time" data-e value="${esc(t.end_time)}" aria-label="结束">${tr.length > 1 ? '<button type="button" class="btn sm" data-rm>去掉</button>' : ''}</div></div>`).join('');
	const v = await modal(`<div class="sheethead"><h3>${isNew ? '添加规则' : esc(me.name)}</h3><button class="btn sm" data-v="close">关闭</button></div>
		<div class="fld"><div class="lb"><b>名字</b></div><div class="ctl"><input class="input" data-k="name" maxlength="16" value="${esc(me.name)}" placeholder="写作业时间"></div></div>
		<div class="fld"><div class="lb"><b>对谁</b></div></div>
		${d.limit ? '' : `<div class="chips" id="ofMode" style="display:grid;grid-template-columns:1fr 1fr"><button type="button" class="chip${me.mode === 1 ? ' on' : ''}" data-m="1">所有设备</button><button type="button" class="chip${me.mode === 2 ? ' on' : ''}" data-m="2">一台设备</button></div>`}
		<div class="ctl${me.mode === 2 ? '' : ' hidden'}" data-dev style="margin-top:8px"><select class="input" data-k="mac">${d.users.map((u) => `<option value="${esc(u.mac)}"${u.mac === me.mac ? ' selected' : ''}>${esc(u.name || u.mac)}</option>`).join('')}</select></div>
		<div class="fld"><div class="lb"><b>什么时候拦</b></div></div><div data-trs>${trHtml()}</div>
		<button type="button" class="btn sm" data-addt style="margin-top:6px">加一段时间</button>
		<div class="fld"><div class="lb"><b>拦哪些 App <span class="pill" data-n>${sel.size}</span></b></div></div>
		<div class="ofapps">${d.classes.map((c) => `<div class="ofcls"><div class="ofcls-h">${esc(c.name)}</div><div class="chips">${c.apps.map((a) => `<button type="button" class="chip${sel.has(a.id) ? ' on' : ''}" data-a="${a.id}">${esc(a.name)}</button>`).join('')}</div></div>`).join('')}</div>
		<div class="btngrid" style="margin:14px 0 0">${isNew ? '<button class="btn" data-v="close">取消</button>' : '<button class="btn danger" data-v="del">删除</button>'}<button class="btn primary" data-v="save">保存</button></div>`,
	(m, close) => {
		const box = m.querySelector('[data-trs]');
		const sync = () => box.querySelectorAll('.oftr').forEach((el, i) => { tr[i].start_time = el.querySelector('[data-s]').value; tr[i].end_time = el.querySelector('[data-e]').value; });
		m.addEventListener('click', (e) => {
			const md = e.target.closest('#ofMode .chip');
			if (md) { m.querySelectorAll('#ofMode .chip').forEach((b) => b.classList.toggle('on', b === md)); m.querySelector('[data-dev]').classList.toggle('hidden', md.dataset.m !== '2'); return; }
			const w = e.target.closest('[data-w]');
			if (w) { sync(); const t = tr[+w.closest('.oftr').dataset.t], n = +w.dataset.w; t.weekdays = t.weekdays.includes(n) ? t.weekdays.filter((x) => x !== n) : [...t.weekdays, n]; w.classList.toggle('on'); return; }
			if (e.target.closest('[data-rm]')) { sync(); tr.splice(+e.target.closest('.oftr').dataset.t, 1); box.innerHTML = trHtml(); return; }
			if (e.target.closest('[data-addt]')) { sync(); tr.push({ weekdays: [1, 2, 3, 4, 5], start_time: '20:00', end_time: '22:00' }); box.innerHTML = trHtml(); return; }
			const a = e.target.closest('[data-a]');
			if (a) { const id = +a.dataset.a; if (sel.has(id)) sel.delete(id); else sel.add(id); a.classList.toggle('on'); m.querySelector('[data-n]').textContent = sel.size; }
		});
		const save = m.querySelector('[data-v="save"]');
		save.addEventListener('click', (e) => {
			e.stopPropagation(); sync();
			const name = m.querySelector('[data-k="name"]').value.trim();
			if (!name) return m.querySelector('[data-k="name"]').focus();
			if (!sel.size) return toast('至少选一个 App', true);
			const mode = d.limit ? 2 : +(m.querySelector('#ofMode .chip.on')?.dataset.m || 1);
			busy(save, async () => {
				OF.d = await P('oaf_rule', { op: isNew ? 'add' : 'update', id: r?.id, name, mode, mac: mode === 2 ? m.querySelector('[data-k="mac"]').value : '', time_rules: tr, app_ids: [...sel] }, 20000);
				close('ok'); ofRender(); toast(isNew ? '已添加「' + name + '」' : '已保存');
			});
		});
	});
	if (v === 'del' && (await confirmBox('删除规则「' + me.name + '」', '这些 App 不再按这条规则拦。', '删除', true))) {
		try { OF.d = await P('oaf_rule', { op: 'del', id: r.id }); ofRender(); toast('已删除'); } catch (e) { toast(e.message, true); }
	}
}
$('ofBody').addEventListener('click', (e) => {
	if (e.target.id === 'ofGet') return stFind('luci-app-oaf');
	if (e.target.id === 'ofOld') return go(validPage('k:admin/services/appfilter') ? 'k:admin/services/appfilter' : 'lfull');
	if (e.target.id === 'ofAdd') return ofEdit(null);
	const r = e.target.closest('.ofrow');
	if (r) return ofEdit(OF.d.rules.find((x) => x.id === +r.dataset.id));
	const u = e.target.closest('.ofuse');
	if (u) return ofUsage(u.dataset.mac);
});
$('ofBody').addEventListener('change', async (e) => {
	if (e.target.id !== 'ofOn') return;
	const on = e.target.checked;
	if (!on && !(await confirmBox('关掉应用过滤', '所有规则都不拦了。', '关掉', true))) { e.target.checked = true; return; }
	try { OF.d = await P('oaf_switch', { on }); ofRender(); toast(on ? '已打开应用过滤' : '已关掉应用过滤'); } catch (er) { e.target.checked = !on; toast(er.message, true); }
});

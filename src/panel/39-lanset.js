/* ---------- 6.0 第 25 项：局域网设置 ----------
 * 路由器地址、子网掩码（只有主账号能改）；DHCP 开关、地址范围、租期。改了底部出现「保存」，保存走 90 秒确认。
 * 改了路由器地址：在家里局域网用旧地址打开面板的，要去新地址点「保留」（新地址上不用登录，凭编号确认，见 lsKeepHash）；
 * 从外面（隧道）打开的照常在这里点「保留」。 */
const LS = { d: null, rangeTouched: false, devs: [] };
const LS_LEASE_T = { '1h': '1 小时', '12h': '12 小时', '1d': '1 天', '7d': '7 天' };
const lsInt = (ip) => { const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip || ''); return m && m.slice(1).every((x) => +x <= 255) ? ((+m[1] << 24) >>> 0) + (+m[2] << 16) + (+m[3] << 8) + +m[4] : null; };
const lsIp = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
const lsPl = (mask) => { const n = lsInt(mask); if (n == null) return null; let pl = 0; while (pl < 32 && n & (2 ** (31 - pl))) pl++; return (n >>> 0) === ((2 ** 32 - 2 ** (32 - pl)) >>> 0) ? pl : null; };
async function loadLanset() {
	const [d, dv] = await Promise.all([P('lanset_get'), P('devices').catch(() => null)]);
	LS.d = d; LS.rangeTouched = false; LS.devs = (dv?.devices || []).filter((x) => x.mac);
	setStatus(true, '在线');
	lsRender();
	if (d.pending && d.pending.token && d.pending.what === '局域网设置' && !document.querySelector('.modal[data-ng]')) wfConfirm(d.pending.token, d.pending.left, null, d.pending.what);
}
function lsRender() {
	const d = LS.d, box = $('lsBody');
	$('lsPend').innerHTML = d?.pending && !d.pending.token ? `<div class="notice w" style="margin-top:12px">刚改了${esc(d.pending.what)}，${d.pending.left} 秒后不确认就改回原来的。</div>` : '';
	if (d.none) { box.innerHTML = `<section class="card empty">${esc(d.none)}</section>`; $('lsBar').classList.add('hidden'); return; }
	const ro = d.owner ? '' : ' readonly', fld = (k, t, v, attr = '') => `<div class="fld"><div class="lb"><b>${t}</b></div><div class="ctl"><input class="input" data-ls="${k}" value="${esc(v ?? '')}" inputmode="decimal" autocomplete="off" spellcheck="false"${attr}></div></div>`;
	const h = d.dhcp;
	box.innerHTML = `<div class="sectitle"><b>路由器地址</b>${d.owner ? '' : '<span class="muted" style="font-size:13px">只有主账号能改</span>'}</div><section class="card">
		${fld('ip', 'IP 地址', d.ip, ro)}${fld('mask', '子网掩码', d.mask, ro)}</section>
		${h ? `<div class="sectitle"><b>DHCP</b></div><section class="card">
		<label class="fld row"><div class="lb"><b>给设备分配地址</b></div><label class="sw"><input type="checkbox" data-ls="on"${h.on ? ' checked' : ''} aria-label="给设备分配地址"><i></i></label></label>
		<div id="lsDh"${h.on ? '' : ' class="hidden"'}>
			<div class="lsrange">${fld('from', '开始', h.from)}${fld('to', '结束', h.to)}</div>
			<div class="fld"><div class="lb"><b>租期</b></div></div>
			<div class="chips" id="lsLease">${Object.entries(LS_LEASE_T).map(([k, t]) => `<button class="chip${k === h.lease ? ' on' : ''}" type="button" data-l="${k}">${t}</button>`).join('')}</div>
		</div></section>` : ''}
		<div class="sectitle"><b>固定地址 <span class="pill" id="lsHN">${(d.hosts || []).length}</span></b><button class="btn sm" id="lsHAdd" type="button">添加</button></div>
		<section class="card list"><div id="lsHosts">${lsHostsHtml()}</div></section>`;
	lsDirty();
}
const lsDevName = (mac) => LS.devs.find((x) => x.mac.toLowerCase() === mac)?.name || '';
function lsHostsHtml() {
	const H = LS.d.hosts || [];
	return H.length ? H.map((x) => `<div class="file lshrow" data-hid="${esc(x.id)}" role="button" tabindex="0"><div style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(x.name || lsDevName(x.mac) || x.mac)}</b><span class="muted ell mono" style="display:block;font-size:12.5px">${esc(x.ip)} · ${esc(x.mac)}</span></div><span class="muted">›</span></div>`).join('') : '<div class="empty">没有固定地址</div>';
}
async function lsHostSave(p) {
	const r = await P('lan_host_set', p, 20000);
	if (r.hosts) { LS.d.hosts = r.hosts; $('lsHosts').innerHTML = lsHostsHtml(); $('lsHN').textContent = r.hosts.length; }
	return r;
}
async function lsHostEdit(x) {
	const isNew = !x, used = new Set((LS.d.hosts || []).map((h) => h.mac));
	const devs = LS.devs.filter((d) => !used.has(d.mac.toLowerCase())).sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0)).slice(0, 80);
	const nm = x ? x.name || lsDevName(x.mac) || x.mac : '';
	const v = await modal(`<h3>${isNew ? '添加固定地址' : esc(nm)}</h3>
		${isNew ? `<div class="fld"><div class="lb"><b>设备</b></div><div class="ctl"><select class="input" data-h="dev">${devs.map((d) => `<option value="${esc(d.mac.toLowerCase())}" data-ip="${esc(d.ip || '')}">${esc((d.name || d.mac) + (d.ip ? ' · ' + d.ip : ''))}</option>`).join('')}<option value="">手动填 MAC 地址</option></select></div></div>
		<div class="fld${devs.length ? ' hidden' : ''}" data-hm><div class="lb"><b>MAC 地址</b></div><div class="ctl"><input class="input mono" data-h="mac" placeholder="aa:bb:cc:dd:ee:ff" autocapitalize="off" autocomplete="off" spellcheck="false"></div></div>`
		: `<div class="fld row"><div class="lb"><b>MAC 地址</b></div><span class="val mono">${esc(x.mac)}</span></div>`}
		${x && !x.edit ? '<div class="notice">不能在面板里改：有面板不认识的设置</div>' : `<div class="fld"><div class="lb"><b>IP 地址</b></div><div class="ctl"><input class="input" data-h="ip" inputmode="decimal" autocomplete="off" value="${esc(x ? x.ip : devs[0]?.ip || '')}"></div></div>`}
		<div class="btngrid" style="margin:14px 0 0">${isNew ? '<button class="btn" data-v="close">取消</button>' : `<button class="btn danger" data-v="del"${x.black ? ' disabled title="不走代理要用"' : ''}>${x.black ? '不能删：不走代理要用' : '删除'}</button>`}${x && !x.edit ? '<button class="btn" data-v="close">关闭</button>' : '<button class="btn primary" data-v="save">保存</button>'}</div>`,
	(m, close) => {
		const sel = m.querySelector('[data-h="dev"]');
		if (sel) sel.onchange = () => { m.querySelector('[data-hm]').classList.toggle('hidden', !!sel.value); const ip = sel.selectedOptions[0]?.dataset.ip; if (ip) m.querySelector('[data-h="ip"]').value = ip; };
		const save = m.querySelector('[data-v="save"]');
		if (save) save.addEventListener('click', (e) => {
			e.stopPropagation();
			const ip = m.querySelector('[data-h="ip"]').value.trim();
			const mac = isNew ? (sel?.value || m.querySelector('[data-h="mac"]').value.trim()) : x.mac;
			if (isNew && !mac) return m.querySelector('[data-h="mac"]').focus();
			if (!ip) return m.querySelector('[data-h="ip"]').focus();
			const name = isNew && sel?.value ? lsDevName(mac) : '';
			busy(save, async () => { const r = await lsHostSave(isNew ? { op: 'add', mac, ip, name } : { op: 'edit', id: x.id, ip }); if (r.changed) toast(r.what); close('saved'); });
		});
	});
	if (v === 'del' && (await confirmBox('去掉「' + nm + '」的固定地址', '下次连上可能换地址。', '去掉', true))) {
		try { const r = await lsHostSave({ op: 'del', id: x.id }); toast(r.what); } catch (e) { toast(e.message, true); }
	}
}
function lsForm() {
	const v = (k) => ($('lsBody').querySelector(`[data-ls="${k}"]`)?.value || '').trim();
	const p = { ip: v('ip'), mask: v('mask') };
	if (LS.d.dhcp) {
		p.dhcp_on = !!$('lsBody').querySelector('[data-ls="on"]')?.checked;
		if (p.dhcp_on) { p.from = v('from'); p.to = v('to'); p.lease = $('lsBody').querySelector('#lsLease .chip.on')?.dataset.l; }
	}
	return p;
}
function lsChanged() {
	const d = LS.d, p = lsForm(), h = d.dhcp;
	if (d.none) return false;
	if (p.ip !== d.ip || p.mask !== d.mask) return true;
	if (!h) return false;
	if (p.dhcp_on !== h.on) return true;
	return p.dhcp_on && (p.from !== h.from || p.to !== h.to || (p.lease && p.lease !== h.lease));
}
function lsDirty() { const c = lsChanged(); $('lsBar').classList.toggle('hidden', !c); $('lsN').textContent = c ? '局域网设置改了' : ''; }
// 改了路由器地址或掩码：地址范围跟着搬到新网段（在网段里的位置不变），除非已经手动改过范围
function lsShift() {
	const d = LS.d, h = d.dhcp; if (!h || LS.rangeTouched) return;
	const p = lsForm(), pl = lsPl(p.mask), ip = lsInt(p.ip), opl = d.pl, oip = lsInt(d.ip);
	if (pl == null || ip == null || pl < 16 || pl > 30) return;
	const sz = 2 ** (32 - pl), base = ip - (ip % sz), osz = 2 ** (32 - opl), obase = oip - (oip % osz);
	const fo = lsInt(h.from) - obase, to = Math.min(lsInt(h.to) - obase, sz - 2);
	if (fo < 1 || fo > to) return;
	$('lsBody').querySelector('[data-ls="from"]').value = lsIp(base + fo);
	$('lsBody').querySelector('[data-ls="to"]').value = lsIp(base + to);
}
$('lsBody').addEventListener('input', (e) => {
	const k = e.target.dataset.ls;
	if (k === 'from' || k === 'to') LS.rangeTouched = true;
	if (k === 'ip' || k === 'mask') lsShift();
	lsDirty();
});
$('lsBody').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('lshrow')) e.target.click(); });
$('lsBody').addEventListener('change', (e) => { if (e.target.dataset.ls === 'on') $('lsDh').classList.toggle('hidden', !e.target.checked); lsDirty(); });
$('lsBody').addEventListener('click', (e) => {
	if (e.target.id === 'lsHAdd') return lsHostEdit(null);
	const hr = e.target.closest('.lshrow');
	if (hr) return lsHostEdit((LS.d.hosts || []).find((x) => x.id === hr.dataset.hid));
	const c = e.target.closest('#lsLease .chip');
	if (c) { $$('#lsLease .chip').forEach((b) => b.classList.toggle('on', b === c)); lsDirty(); }
});
$('lsUndo').onclick = () => { LS.rangeTouched = false; lsRender(); };
$('lsSave').onclick = async () => {
	const d = LS.d, p = lsForm(), ipchg = p.ip !== d.ip || p.mask !== d.mask;
	for (const k of ['ip', 'mask', ...(p.dhcp_on ? ['from', 'to'] : [])]) if (!p[k]) return $('lsBody').querySelector(`[data-ls="${k}"]`).focus();
	const off = d.dhcp && d.dhcp.on && !p.dhcp_on;
	const ok = await confirmBox(ipchg ? '改路由器地址' : off ? '关掉 DHCP' : '修改局域网设置',
		ipchg ? `家里的设备会断网，要重连 Wi-Fi；面板换到 http://${p.ip}:${d.port}。` : off ? '新连上的设备拿不到地址，要手动设置。' : '家里的设备可能断网几秒。', '保存', ipchg || off);
	if (!ok) return;
	busy($('lsSave'), async () => {
		const r = await P('lanset_set', ipchg ? p : { ...p, ip: undefined, mask: undefined }, 20000);
		if (!r.changed) { toast('没有改动'); return lsRender(); }
		if (r.ip && location.hostname === d.ip) lsMoveCard(r);
		else wfConfirm(r.token, r.wait + 2, null, '局域网设置');
	});
};
// 用旧地址在家里打开的：旧地址马上就不通了，去新地址点「保留」
function lsMoveCard(r) {
	const until = Date.now() + (r.wait + 2) * 1000, url = `http://${r.ip}:${r.port}/panel/#ngkeep=${r.token}`;
	modal(`<h3>去新地址点「保留」</h3>
		<div class="wfcd"><b data-n>${r.wait + 2}</b><span>秒后改回原来的</span></div>
		<div class="notice">手机先重连 Wi-Fi，再打开新地址。</div>
		<div class="btngrid" style="margin:14px 0 0;grid-template-columns:1fr"><a class="btn primary" href="${esc(url)}" data-go>打开 ${esc(r.ip)}</a></div>`,
	(m, close) => {
		m.dataset.ng = 1; m.dataset.lock = 1;
		const n = m.querySelector('[data-n]');
		const t = setInterval(() => { const s = Math.max(0, Math.ceil((until - Date.now()) / 1000)); n.textContent = s; if (!s) { clearInterval(t); close(null); toast('没有确认，已改回原来的局域网设置'); } }, 500);
	}, { compact: true });
}
// 新地址上打开（网址带 #ngkeep=编号）：不用登录，直接问保不保留
async function lsKeepCall(p) {
	const r = await fetch('../cgi-bin/mcp/lan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, cache: 'no-store',
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/lan_keep', params: p, client: 'panel' }) });
	const j = await r.json();
	if (j.error) throw new Error(j.error.message);
	return j.result;
}
(async function lsKeepHash() {
	const m = /[#&]ngkeep=([a-z0-9]{16})/.exec(location.hash);
	if (!m) return;
	const tok = m[1];
	try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
	let pk;
	try { pk = await lsKeepCall({ token: tok, peek: true }); } catch (e) { return toast(e.message, true); }
	if (pk.gone) return toast('已经改回原来的设置了');
	const until = Date.now() + pk.left * 1000;
	modal(`<h3>新地址能打开了，保留吗？</h3>
		<div class="wfcd"><b data-n>${pk.left}</b><span>秒后改回原来的</span></div>
		<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-back>改回去</button><button class="btn primary" data-keep>保留</button></div>`,
	(md, close) => {
		md.dataset.ng = 1; md.dataset.lock = 1;
		const n = md.querySelector('[data-n]'), keep = md.querySelector('[data-keep]'), back = md.querySelector('[data-back]');
		const t = setInterval(() => { const s = Math.max(0, Math.ceil((until - Date.now()) / 1000)); n.textContent = s; if (!s) { clearInterval(t); close(null); toast('没有确认，已改回原来的局域网设置'); } }, 500);
		const act = async (p, msg) => {
			keep.disabled = back.disabled = true;
			try { const r = await lsKeepCall({ token: tok, ...p }); clearInterval(t); close(null); toast(r.gone ? '已经改回原来的设置了' : msg); }
			catch (e) { keep.disabled = back.disabled = false; toast(e.message, true); }
		};
		keep.onclick = () => act({}, '已保留，路由器地址是 ' + location.hostname);
		back.onclick = () => act({ revert: true }, '正在改回原来的地址…');
	}, { compact: true });
})();
// 有没保存的修改：离开这一页先问；面板装了新补丁也先不换新（11/27 全面检查第 3 条）
DIRTY.lanset = () => !$('lsBar').classList.contains('hidden');

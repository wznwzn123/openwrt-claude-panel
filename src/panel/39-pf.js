/* ---------- 6.0 第 18 项：端口转发 ----------
   列表：名字、协议 外部端口 → 设备:端口、开关；点开改；改完走「90 秒确认」（wfConfirm）。
   路由器自己的端口（网页后台、SSH、面板）不让转，路由器那边会挡，这里也提前说 */
let PF = null, pfDev = [];
const PF_PROTO = { tcp: 'TCP', udp: 'UDP', 'tcp udp': 'TCP + UDP' };
async function loadPf() {
	const [r, d] = await Promise.all([P('pf_list'), P('devices').catch(() => null)]);
	PF = r; pfDev = (d?.devices || []).filter((x) => x.ip && /^\d+\.\d+\.\d+\.\d+$/.test(x.ip));
	setStatus(true, '在线');
	pfDraw();
	if (r.pending && r.pending.token && r.pending.what === '端口转发') wfConfirm(r.pending.token, r.pending.left, null, r.pending.what);
}
const pfName = (ip) => pfDev.find((x) => x.ip === ip)?.name || '';
function pfDraw() {
	const w = PF.wan || {};
	$('pfWan').innerHTML = w.ip ? (w.inner ? `<b class="ndwarn">外网地址是内网地址</b><span class="muted">${esc(w.ip)}：从外面连不进来，要找运营商要公网 IP</span>` : `<b>外网地址</b><span class="muted">${esc(w.ip)}</span>`) : '<b>外网地址</b><span class="muted">没有</span>';
	$('pfCount').textContent = PF.list.length;
	$('pfList').innerHTML = PF.list.length ? PF.list.map((x) => {
		const dn = pfName(x.ip);
		return `<div class="file pfrow" data-id="${esc(x.id)}" role="button" tabindex="0" title="${esc(x.ip)}"><div style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(x.name || x.ext)}</b><span class="muted ell" style="display:block;font-size:12.5px">${esc(PF_PROTO[x.proto] || x.proto)} ${esc(x.ext)} → ${esc(dn || x.ip)}${x.port && x.port !== x.ext ? ':' + esc(x.port) : ''}</span></div>
			<label class="sw" data-sw><input type="checkbox" ${x.on ? 'checked' : ''} aria-label="${esc(x.name || x.ext)}"><i></i></label></div>`;
	}).join('') : '<div class="empty">没有端口转发</div>';
}
async function pfSave(p) {
	const r = await P('pf_set', p, 20000);
	if (r.changed) wfConfirm(r.token, r.wait + 2, null, '端口转发');
	return r;
}
async function pfEdit(x) {
	const isNew = !x, ro = x && !x.edit;
	const devs = pfDev.slice().sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0)).slice(0, 60);
	const pr = x ? x.proto : 'tcp udp';
	const v = await modal(`<h3>${isNew ? '添加端口转发' : esc(x.name || x.ext)}</h3>
		${ro ? `<div class="notice">不能在面板里改：有面板不认识的设置</div>` : `
		<div class="fld"><div class="lb"><b>名字（选填）</b></div><div class="ctl"><input class="input" data-k="name" maxlength="60" value="${esc(x?.name || '')}"></div></div>
		<div class="fld"><div class="lb"><b>设备</b></div><div class="ctl"><input class="input" data-k="ip" list="pfDevs" inputmode="decimal" placeholder="192.168.1.100" value="${esc(x?.ip || '')}" autocomplete="off"><datalist id="pfDevs">${devs.map((d) => `<option value="${esc(d.ip)}">${esc(d.name || d.ip)}</option>`).join('')}</datalist></div></div>
		<div class="chips" data-k="proto" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr))">${Object.entries(PF_PROTO).map(([k, t]) => `<button class="chip${k === pr ? ' on' : ''}" type="button" data-p="${k}">${t}</button>`).join('')}</div>
		<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
			<div class="fld"><div class="lb"><b>外部端口</b></div><div class="ctl"><input class="input" data-k="ext" inputmode="numeric" placeholder="8080" value="${esc(x?.ext || '')}"></div></div>
			<div class="fld"><div class="lb"><b>内部端口（选填）</b></div><div class="ctl"><input class="input" data-k="port" inputmode="numeric" placeholder="同外部" value="${esc(x && x.port !== x.ext ? x.port : '')}"></div></div>
		</div>
		<p class="muted" style="font-size:12.5px;margin:8px 0 0">不能用：${PF.reserved.map((q) => q.port).join('、')}</p>`}
		<div class="btngrid" style="margin:14px 0 0">${isNew ? '<button class="btn" data-v="close">取消</button>' : '<button class="btn danger" data-v="del">删除</button>'}${ro ? '<button class="btn" data-v="close">关闭</button>' : '<button class="btn primary" data-v="save">保存</button>'}</div>`,
	(m, close) => {
		m.querySelectorAll('[data-k="proto"] .chip').forEach((b) => (b.onclick = () => m.querySelectorAll('[data-k="proto"] .chip').forEach((c) => c.classList.toggle('on', c === b))));
		const save = m.querySelector('[data-v="save"]');
		if (save) save.addEventListener('click', (e) => {
			e.stopPropagation();
			const g = (k) => m.querySelector(`[data-k="${k}"]`).value.trim();
			const proto = m.querySelector('[data-k="proto"] .chip.on')?.dataset.p || 'tcp udp';
			const p = { op: isNew ? 'add' : 'edit', id: x?.id, name: g('name'), ip: g('ip'), ext: g('ext'), port: g('port'), proto: proto === 'tcp udp' ? 'both' : proto };
			if (!p.ip) return m.querySelector('[data-k="ip"]').focus();
			if (!p.ext) return m.querySelector('[data-k="ext"]').focus();
			busy(save, async () => { await pfSave(p); close('saved'); });
		});
	});
	if (v === 'del' && (await confirmBox('删除「' + (x.name || x.ext) + '」', '外面再连这个端口就连不上了。', '删除', true))) {
		try { await pfSave({ op: 'del', id: x.id }); } catch (e) { toast(e.message, true); }
	}
}
$('pfAdd').onclick = () => pfEdit(null);
$('pfList').addEventListener('click', (e) => {
	const row = e.target.closest('.pfrow');
	if (!row) return;
	const x = PF.list.find((y) => y.id === row.dataset.id);
	const sw = e.target.closest('[data-sw]');
	if (sw) {
		if (e.target.tagName !== 'INPUT') return;
		e.preventDefault();
		const on = !x.on;
		(async () => {
			if (!on && !(await confirmBox('关掉「' + (x.name || x.ext) + '」', '外面再连这个端口就连不上了。', '关掉'))) return;
			try { await pfSave({ op: on ? 'on' : 'off', id: x.id }); } catch (er) { toast(er.message, true); }
		})();
		return;
	}
	pfEdit(x);
});
$('pfList').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('pfrow')) e.target.click(); });

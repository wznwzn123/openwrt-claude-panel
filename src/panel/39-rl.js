/* ---------- 6.0 第 20 项：每台设备限速 ----------
 * 设备「更多 → 上网控制 → 限速」：下载、上传上限（Mbps，选填，不填不限）。路由器那边按设备现在的 IP 生效，换 IP 跟着走。
 * 开着绕过防火墙的加速时路由器会说限速不准，这里照写。 */
let DRL = { devs: {}, caps: null };
const rlMb = (k) => { const v = k / 1000; return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + ''; };
function rlSub(mac) {
	const e = mac && (DRL.devs || {})[mac];
	if (!e) return '';
	return [e.down ? '下载 ' + rlMb(e.down) : '', e.up ? '上传 ' + rlMb(e.up) : ''].filter(Boolean).join(' · ') + ' Mbps';
}
async function rlSheet(d) {
	const c = DRL.caps;
	if (c && !c.ok) return toast(c.why, true);
	const e = (DRL.devs || {})[d.mac] || {}, nm = d.name || d.ip;
	const fld = (k, t, v) => `<div class="fld"><div class="lb"><b>${t}</b></div><div class="ctl rlin"><input class="input" data-r="${k}" inputmode="decimal" autocomplete="off" placeholder="不限" value="${v ? rlMb(v) : ''}"><span class="muted">Mbps</span></div></div>`;
	const v = await modal(`<h3>限速「${esc(nm)}」</h3>
		${c && c.warn ? `<div class="notice w">${esc(c.warn)}</div>` : ''}
		<div class="lsrange">${fld('down', '下载（选填）', e.down)}${fld('up', '上传（选填）', e.up)}</div>
		<div class="btngrid" style="margin:14px 0 0">${e.down || e.up ? '<button class="btn" data-v="clear">取消限速</button>' : '<button class="btn" data-v="close">取消</button>'}<button class="btn primary" data-v="save">保存</button></div>`,
	(m, close) => {
		const save = m.querySelector('[data-v="save"]');
		save.addEventListener('click', (ev) => {
			ev.stopPropagation();
			const g = (k) => { const s = m.querySelector(`[data-r="${k}"]`).value.trim(); if (!s) return 0; const n = parseFloat(s); return isFinite(n) && n >= 0 ? Math.round(n * 1000) : NaN; };
			const down = g('down'), up = g('up');
			if (isNaN(down)) return m.querySelector('[data-r="down"]').focus();
			if (isNaN(up)) return m.querySelector('[data-r="up"]').focus();
			busy(save, async () => {
				const r = await P('rl_set', { mac: d.mac, down, up, name: d.name || undefined });
				DRL = r; close('ok');
				toast(down || up ? '已限速「' + nm + '」：' + rlSub(d.mac) : '已取消「' + nm + '」的限速');
			});
		});
		m.querySelector('[data-r="down"]').focus({ preventScroll: true });
	});
	if (v === 'clear') {
		try { DRL = await P('rl_set', { mac: d.mac, down: 0, up: 0 }); toast('已取消「' + nm + '」的限速'); } catch (er) { toast(er.message, true); }
	}
}

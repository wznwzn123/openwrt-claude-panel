/* ---------- 6.0 第 22 项：无线中继（连上级 Wi-Fi 上网） ----------
 * 上面是现在的状态（连着谁、拿到的地址、跟家里网段冲突时提示去改）；下面扫附近的 Wi-Fi，点一个输密码连上。
 * 连上、断开都走 90 秒确认（wfConfirm）：连不上或者把家里 Wi-Fi 弄断了，自动改回。 */
const WS = { d: null, band: null, list: null, scanning: false, err: '' };
async function loadWisp() {
	const d = await P('wisp_get');
	WS.d = d;
	setStatus(true, '在线');
	if (!WS.band || !(d.radios || []).some((r) => r.id === WS.band)) WS.band = ((d.radios || []).find((r) => r.on) || (d.radios || [])[0] || {}).id || null;
	wsRender();
	if (d.pending && d.pending.token && d.pending.what === '无线中继' && !document.querySelector('.modal[data-ng]')) wfConfirm(d.pending.token, d.pending.left, null, d.pending.what);
	if (WS.list == null && !d.none && d.can && !WS.scanning) wsScan();
}
const wsBars = (q) => { const n = q == null ? 0 : q >= 75 ? 4 : q >= 50 ? 3 : q >= 30 ? 2 : 1; return `<span class="wsbars" aria-label="信号 ${n} 格">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`; };
function wsRender() {
	const d = WS.d;
	$('wsPend').innerHTML = d?.pending && !d.pending.token ? `<div class="notice w" style="margin-top:12px">刚改了${esc(d.pending.what)}，${d.pending.left} 秒后不确认就改回原来的。</div>` : '';
	if (d.none) { $('wsSt').innerHTML = `<div class="empty">${esc(d.none)}</div>`; $('wsBody').innerHTML = ''; return; }
	const st = d.status, band = (d.radios || []).find((r) => r.id === d.radio)?.name || '';
	let h;
	if (!d.on) h = `<div class="wanhd"><b>没在中继</b></div>`;
	else {
		const t = st?.up ? `已连上「${esc(d.ssid)}」` : st?.pending ? `正在连接「${esc(d.ssid)}」…` : `连不上「${esc(d.ssid)}」`;
		const sub = [band, st?.up && st.ip ? st.ip : '', st?.up ? '连了 ' + wanDur(st.uptime) : '', d.mine ? '' : '原版后台里设的'].filter(Boolean).join(' · ');
		h = `<div class="wshd"><div class="wanhd"><b class="${st?.up || st?.pending ? '' : 'ndbad'}">${t}</b>${sub ? `<span class="muted">${esc(sub)}</span>` : ''}</div>${d.mine ? '<button class="btn sm" id="wsOff" type="button">断开</button>' : ''}</div>`;
		if (d.clash) h += `<div class="notice w" style="margin-top:10px">上级 Wi-Fi 也是 ${esc(d.lan.replace(/\.\d+$/, '.x'))} 网段，跟家里冲突，上不了网</div><button class="btn sm" id="wsLan" type="button" style="margin-top:8px">改家里网段</button>`;
	}
	if (!d.can) h += `<div class="notice w" style="margin-top:10px">固件没有 wpa_supplicant，连不了别的 Wi-Fi</div>`;
	$('wsSt').innerHTML = h;
	if (!d.can) { $('wsBody').innerHTML = ''; return; }
	const R = d.radios || [];
	const rows = WS.scanning && !WS.list ? '<div class="empty">正在扫描…</div>' : WS.err ? `<div class="empty">${esc(WS.err)}</div>` : (WS.list || []).map((x, i) => {
		const why = x.ok ? '' : x.enc === 'sae' ? '只支持 WPA3' : '企业认证';
		return `<div class="file wsrow${x.ok ? '' : ' off'}" data-i="${i}" role="button" tabindex="0"${x.ok ? '' : ' aria-disabled="true"'}><div style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(x.ssid)}${d.on && d.ssid === x.ssid ? ' <span class="pill blue">在用</span>' : ''}</b><span class="muted" style="font-size:12.5px">${why ? '连不了：' + why : '信道 ' + (x.ch || '—')}</span></div>${x.lock ? '<span class="wslock" aria-label="要密码">🔒</span>' : ''}${wsBars(x.q)}</div>`;
	}).join('') + (WS.list ? `<button class="file wsrow" data-manual type="button" style="background:none"><div style="flex:1;text-align:left"><b>手动输入</b></div><span class="muted">›</span></button>` : '');
	$('wsBody').innerHTML = `<div class="sectitle"><b>附近的 Wi-Fi</b><button class="btn sm" id="wsScan" type="button"${WS.scanning ? ' disabled' : ''}>${WS.scanning ? '扫描中…' : '扫描'}</button></div>
		${R.length > 1 ? `<div class="chips" id="wsBand">${R.map((r) => `<button class="chip${r.id === WS.band ? ' on' : ''}" type="button" data-b="${esc(r.id)}">${esc(r.name)}</button>`).join('')}</div>` : ''}
		<section class="card list"><div id="wsList">${rows || '<div class="empty">附近没有 Wi-Fi</div>'}</div></section>`;
}
async function wsScan() {
	if (!WS.band) return;
	const rd = (WS.d.radios || []).find((r) => r.id === WS.band);
	if (rd && !rd.on) { WS.list = []; WS.err = rd.name + ' 关着，先在 Wi-Fi 页打开'; return wsRender(); }
	WS.scanning = true; WS.err = ''; wsRender();
	try { const r = await P('wisp_scan', { radio: WS.band }, 30000); WS.list = r.list || []; }
	catch (e) { WS.list = []; WS.err = e.message; }
	finally { WS.scanning = false; if (page === 'wisp') wsRender(); }
}
async function wsSet(p) {
	const r = await P('wisp_set', p, 20000);
	if (r.changed) wfConfirm(r.token, r.wait + 2, null, '无线中继');
	return r;
}
async function wsConnect(x) {
	const rd = (WS.d.radios || []).find((r) => r.id === WS.band) || {};
	const manual = !x, lock = manual || x.lock, same = WS.d.on && WS.d.mine && x && WS.d.ssid === x.ssid;
	const chg = x && x.ch && rd.ch !== 'auto' && +rd.ch !== +x.ch;
	await modal(`<h3>${manual ? '手动输入' : '连「' + esc(x.ssid) + '」'}</h3>
		${manual ? '<div class="fld"><div class="lb"><b>Wi-Fi 名字</b></div><div class="ctl"><input class="input" data-w="ssid" maxlength="32" autocapitalize="off" autocomplete="off" spellcheck="false"></div></div>' : ''}
		${lock ? `<div class="fld"><div class="lb"><b>密码${manual ? '（选填）' : ''}</b></div><div class="ctl wfpw"><input class="input" data-w="key" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false"${same ? ' placeholder="不改就不填"' : ''}><button class="btn sm" data-w="eye" type="button">显示</button></div></div>` : ''}
		<p class="muted" style="font-size:13px;margin:10px 0 0">${chg ? `家里 ${esc(rd.name)} Wi-Fi 会断开几秒，信道改成 ${x.ch}。` : `家里 ${esc(rd.name || '')} Wi-Fi 会断开几秒。`}</p>
		<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-v="close">取消</button><button class="btn primary" data-v="go">连接</button></div>`,
	(m, close) => {
		const k = m.querySelector('[data-w="key"]'), eye = m.querySelector('[data-w="eye"]');
		if (eye) eye.onclick = () => { const s = k.type === 'password'; k.type = s ? 'text' : 'password'; eye.textContent = s ? '隐藏' : '显示'; };
		const go = m.querySelector('[data-v="go"]');
		go.addEventListener('click', (e) => {
			e.stopPropagation();
			const ssid = manual ? m.querySelector('[data-w="ssid"]').value : x.ssid, key = k ? k.value : '';
			if (!ssid) return m.querySelector('[data-w="ssid"]').focus();
			if (lock && !manual && !key && !same) return k.focus();
			const enc = manual ? (key ? 'psk2' : 'none') : x.enc;
			busy(go, async () => { await wsSet({ op: 'on', radio: WS.band, ssid, key, enc, ch: x ? x.ch : undefined }); close('ok'); });
		});
		(manual ? m.querySelector('[data-w="ssid"]') : k)?.focus();
	});
}
$('wsSt').addEventListener('click', async (e) => {
	if (e.target.id === 'wsLan') return go('lanset');
	if (e.target.id === 'wsOff') {
		if (!(await confirmBox('断开「' + WS.d.ssid + '」', '不再用它上网；家里 Wi-Fi 会断开几秒。', '断开', true))) return;
		busy(e.target, () => wsSet({ op: 'off' }));
	}
});
$('wsBody').addEventListener('click', (e) => {
	if (e.target.id === 'wsScan') return wsScan();
	const b = e.target.closest('#wsBand .chip');
	if (b) { if (b.dataset.b !== WS.band) { WS.band = b.dataset.b; WS.list = null; wsScan(); } return; }
	if (e.target.closest('[data-manual]')) return wsConnect(null);
	const r = e.target.closest('.wsrow');
	if (r && !r.classList.contains('off')) wsConnect(WS.list[+r.dataset.i]);
});
$('wsBody').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('wsrow')) e.target.click(); });

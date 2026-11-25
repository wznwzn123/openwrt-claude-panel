
/* ---------- 6.0 第 14 项：Wi-Fi 设置 ----------
 * 每个频段一张卡片：开关、名字、密码、隐藏、信道。两个频段名字和密码一样时合成一份（「用同一个名字」）。
 * 保存后新设置马上生效，弹出小卡片倒数 90 秒：点「保留」才算数，不点路由器自己改回原来的（cmcp-netguard）。
 * 手机连着这个 Wi-Fi 时会断开，重新连上后打开面板，卡片还在（记在 rp_ng）。 */
const WF = { d: null, same: false, keys: {}, show: {} };
const WF_WEAK = ['12345678', '123456789', '1234567890', '87654321', '12341234', '11223344', '12344321', '123123123', '147258369', '1qaz2wsx', 'qwertyui', 'qwerty123', 'asdfghjk', 'password', 'password1', 'passw0rd', 'abcd1234', 'abc12345', 'a1234567', 'admin123', 'wifi1234', 'iloveyou', '5201314520', '520520520', '1314520520', 'woaini1314'];
function wfKeyMsg(k) {
	if (/^[0-9a-fA-F]{64}$/.test(k)) return '';
	if (k.length < 8) return '至少 8 位';
	if (k.length > 63) return '最多 63 位';
	if (!/^[ -~]+$/.test(k)) return '只能用英文字母、数字和英文符号';
	const l = k.toLowerCase(), d = [...l].slice(1).map((c, i) => c.charCodeAt(0) - l.charCodeAt(i));
	if (WF_WEAK.includes(l) || d.every((x) => x === 0) || d.every((x) => x === 1) || d.every((x) => x === -1)) return '太容易被猜到';
	return '';
}
function wfStrength(k) {
	if (!k) return null;
	const bad = wfKeyMsg(k); if (bad) return { t: bad, c: 'bad' };
	const n = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(k)).length;
	return k.length >= 12 && n >= 3 ? { t: '强', c: 'good' } : k.length >= 10 && n >= 2 ? { t: '中', c: '' } : { t: '弱', c: 'warn' };
}
const wfBytes = (s) => new TextEncoder().encode(s).length;
const wfMain = () => (WF.d?.radios || []).filter((r) => r.wifi);
async function loadWifi() {
	const [d, g] = await Promise.all([P('wifi_get'), P('guest_get').catch(() => null)]);
	GU.d = g;
	WF.d = d; WF.keys = {}; WF.show = {};
	const ms = wfMain();
	WF.same = ms.length > 1 && !!d.same;
	setStatus(true, '在线');
	wfRender(); guRender();
	if (d.pending && d.pending.token && !document.querySelector('.modal[data-ng]')) { const o = wfSaved(); wfConfirm(d.pending.token, d.pending.left, o && o.tok === d.pending.token ? o.ssid : null, d.pending.what); }
}
function wfRender() {
	const d = WF.d, box = $('wfBody');
	$('wfPend').innerHTML = d?.pending && !d.pending.token ? `<div class="notice w" style="margin-top:12px">刚改了${esc(d.pending.what)}，正在等确认：${d.pending.left} 秒后不确认就改回原来的。</div>` : '';
	if (d?.none) {
		$('wfPill').textContent = '没有无线';
		box.innerHTML = `<section class="card empty">${d.none === 'nocfg' ? '这台路由器没有无线配置：可能没有无线网卡，或者没装无线驱动。' : '这台路由器上没找到无线网卡。'}</section>`;
		$('wfBar').classList.add('hidden');
		return;
	}
	const R = d.radios || [], on = R.filter((r) => r.on).length;
	$('wfPill').textContent = on ? (R.length > 1 ? `开着 ${on} 个` : '开着') : '都关着';
	$('wfPill').className = 'pill' + (on ? ' good' : '');
	const ms = wfMain();
	const sw = (k, v, label, dis) => `<label class="sw"><input type="checkbox" data-wf="${k}"${v ? ' checked' : ''}${dis ? ' disabled' : ''} aria-label="${esc(label)}"><i></i></label>`;
	const first = ms[0]?.id;
	const card = (r) => {
		const w = r.wifi, shared = WF.same && r.id !== first;
		const head = `<div class="wfhd"><div><b>${esc(r.name)}</b><span class="muted">${!w ? (r.sta != null ? '在做中继，连着「' + esc(r.sta) + '」' : '没有家里网络的 Wi-Fi') : r.on ? (r.channel === 'auto' ? '信道自动' : '信道 ' + r.channel) : '关着'}</span></div>${w ? sw('on', r.on, r.name + ' 开关') : ''}</div>`;
		if (!w) return `<section class="card wfc" data-r="${esc(r.id)}">${head}</section>`;
		const k = w.kind, pw = k === 'ent' ? '<span class="val">企业认证</span>' : k === 'wep' ? '<span class="val">WEP</span>'
			: `<div class="wfpw"><input class="input" data-wf="key" type="${WF.show[r.id] ? 'text' : 'password'}" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="${w.key ? '••••••••' : '没有密码'}" value="${esc(WF.keys[r.id] ?? '')}" aria-label="${esc(r.name)} 密码">${w.key || WF.keys[r.id] != null ? `<button class="btn sm" data-wf="eye">${WF.show[r.id] ? '隐藏' : '显示'}</button>` : ''}</div><div class="wfst" data-st></div>`;
		const ch = r.chans.length ? `<select class="input wfch" data-wf="channel" aria-label="${esc(r.name)} 信道"><option value="auto"${r.channel === 'auto' ? ' selected' : ''}>自动</option>${r.chans.map((c) => `<option value="${c}"${r.channel === c ? ' selected' : ''}>${c}</option>`).join('')}</select>` : '';
		return `<section class="card wfc${r.on ? '' : ' off'}" data-r="${esc(r.id)}">${head}
			${shared ? `<div class="fld row"><div class="lb"><b>名字和密码</b></div><span class="val muted">同 ${esc(ms[0].name)}</span></div>` : `
			<div class="fld"><div class="lb"><b>名字</b></div><div class="ctl"><input class="input" data-wf="ssid" maxlength="32" autocapitalize="off" spellcheck="false" value="${esc(w.ssid)}" aria-label="${esc(r.name)} 名字"></div><div class="wfst" data-sn></div></div>
			<div class="fld"><div class="lb"><b>密码</b></div><div class="ctl">${pw}</div></div>
			<label class="fld row"><div class="lb"><b>隐藏名字</b></div>${sw('hidden', w.hidden, '隐藏名字')}</label>`}
			${ch ? `<div class="fld row"><div class="lb"><b>信道</b></div>${ch}</div>` : ''}
		</section>`;
	};
	box.innerHTML = (ms.length > 1 ? `<section class="card wfsame"><label class="kv aswon"><span><b>${ms.map((r) => r.name).join(' 和 ')} 用同一个名字</b></span>${sw('same', WF.same, '用同一个名字和密码')}</label></section>` : '')
		+ R.map(card).join('');
	wfDirty();
}
// 跟现在的比，改了哪些（合成一份时，第一个频段的名字、密码、隐藏也用到其他频段）
function wfDiff() {
	const out = [], ms = wfMain(), first = ms[0];
	let err = '';
	const val = (id, k) => $('wfBody').querySelector(`.wfc[data-r="${CSS.escape(id)}"] [data-wf="${k}"]`);
	// 新输入的密码（跟原来的一样、没填，都算没改）
	const kNew = (id) => { const k = val(id, 'key'); return k && k.value !== '' && k.value !== WF.keys[id] ? k.value : null; };
	for (const r of WF.d?.radios || []) {
		if (!r.wifi) continue;
		const q = { id: r.id }, src = WF.same ? first : r;
		const on = val(r.id, 'on'); if (on && on.checked !== r.on) q.on = on.checked;
		const ch = val(r.id, 'channel'); if (ch && String(ch.value) !== String(r.channel)) q.channel = ch.value === 'auto' ? 'auto' : +ch.value;
		const s = val(src.id, 'ssid'), h = val(src.id, 'hidden');
		if (s) { const v = s.value.trim(); if (v !== r.wifi.ssid) { q.ssid = v; if (!v) err = 'Wi-Fi 名字不能是空的'; else if (wfBytes(v) > 32) err = 'Wi-Fi 名字太长：最多 32 个字节（中文大约 10 个字）'; } }
		let key = kNew(src.id);
		// 刚打开「用同一个名字」：其他频段换成第一个频段的密码
		if (key == null && WF.same && r.id !== first.id && !WF.d.same && WF.keys[first.id]) key = WF.keys[first.id];
		if (key != null) { q.key = key; const m = wfKeyMsg(key); if (m) err = '密码' + m; }
		if (h && h.checked !== r.wifi.hidden) q.hidden = h.checked;
		if (Object.keys(q).length > 1) out.push(q);
	}
	return { list: out, err };
}
function wfDirty() {
	const box = $('wfBody');
	box.querySelectorAll('.wfc').forEach((c) => {
		const k = c.querySelector('[data-wf="key"]'), st = c.querySelector('[data-st]');
		if (k && st) { const s = k.value && k.value !== WF.keys[c.dataset.r] ? wfStrength(k.value) : null; st.innerHTML = s ? `<span class="pill ${s.c}">${s.c === 'bad' ? esc(s.t) : '强度：' + s.t}</span>` : ''; }
		const n = c.querySelector('[data-wf="ssid"]'), sn = c.querySelector('[data-sn]');
		if (n && sn) { const b = wfBytes(n.value.trim()); sn.innerHTML = b > 32 ? '<span class="pill bad">太长了</span>' : ''; }
	});
	const { list } = wfDiff(), n = list.reduce((a, q) => a + Object.keys(q).length - 1, 0);
	$('wfBar').classList.toggle('hidden', !n);
	$('wfN').textContent = n + ' 项修改';
}
$('wfBody').addEventListener('input', wfDirty);
$('wfBody').addEventListener('change', async (e) => {
	const t = e.target;
	if (t.dataset.wf === 'same') {
		const ms = wfMain();
		if (t.checked) {
			// 合成一份：先拿第一个频段的密码，保存时一起用到其他频段
			try { const k = (await P('wifi_key', { id: ms[0].id })).key; WF.keys[ms[0].id] = k; } catch (x) { t.checked = false; return toast(x.message, true); }
		}
		WF.same = t.checked;
		wfRender();
		return;
	}
	if (t.dataset.wf === 'on') t.closest('.wfc').classList.toggle('off', !t.checked);
	wfDirty();
});
$('wfBody').addEventListener('click', async (e) => {
	const b = e.target.closest('[data-wf="eye"]'); if (!b) return;
	e.preventDefault();
	const id = b.closest('.wfc').dataset.r, i = b.closest('.wfc').querySelector('[data-wf="key"]');
	if (WF.show[id]) { WF.show[id] = false; i.type = 'password'; b.textContent = '显示'; return; }
	if (WF.keys[id] == null) {
		b.disabled = true;
		try { WF.keys[id] = (await P('wifi_key', { id })).key; } catch (x) { b.disabled = false; return toast(x.message, true); }
		b.disabled = false;
		if (!i.value) i.value = WF.keys[id];
	}
	WF.show[id] = true; i.type = 'text'; b.textContent = '隐藏';
	wfDirty();
});
$('wfUndo').addEventListener('click', () => { WF.same = wfMain().length > 1 && !!WF.d?.same; WF.keys = {}; WF.show = {}; wfRender(); });
$('wfSave').addEventListener('click', async () => {
	const { list, err } = wfDiff();
	if (err) return toast(err, true);
	if (!list.length) return;
	const R = WF.d.radios, nm = (id) => R.find((r) => r.id === id)?.name || id;
	const offs = list.filter((q) => q.on === false).map((q) => nm(q.id));
	const left = R.filter((r) => r.wifi && (list.find((q) => q.id === r.id && 'on' in q)?.on ?? r.on));
	const lines = [];
	if (list.some((q) => 'ssid' in q || 'key' in q)) lines.push('连着这个 Wi-Fi 的手机和电脑会断开，要用新' + (list.some((q) => 'ssid' in q) && list.some((q) => 'key' in q) ? '名字和新密码' : list.some((q) => 'key' in q) ? '密码' : '名字') + '重新连。');
	if (offs.length) lines.push(left.length ? `关掉 ${offs.join('、')} 后，连着它的设备会断开。` : '所有 Wi-Fi 都关了：只能用网线连路由器，或者在外面从官网打开面板。');
	if (list.some((q) => 'channel' in q) && !lines.length) lines.push('换信道时 Wi-Fi 会断开几秒。');
	lines.push('保存后 90 秒内回来点「保留」，不点就自动改回原来的。');
	if (!(await confirmBox('保存 Wi-Fi 设置？', lines.join('\n'), '保存', !left.length))) return;
	const btn = $('wfSave'); btn.disabled = true;
	try {
		const r = await P('wifi_set', { radios: list }, 20000);
		if (!r.changed) { toast('没有要改的'); return loadWifi(); }
		const ms = wfMain(), q0 = list.find((q) => 'ssid' in q || 'key' in q);
		const ssid = q0 ? (q0.ssid ?? R.find((x) => x.id === q0.id).wifi.ssid) : null;
		wfConfirm(r.token, r.wait + 2, ssid && ms.length ? ssid : null);
	} catch (x) { toast(x.message, true); }
	finally { btn.disabled = false; }
});
// 倒数卡片：点「保留」/「改回去」；连不上路由器时留着卡片，连上新 Wi-Fi 再点
// what：路由器记的「改的是什么」（Wi-Fi 设置 / 访客 Wi-Fi）；after：点了「保留」以后接着做的（比如出访客二维码）
function wfConfirm(tok, secs, ssid, what, after) {
	if (document.querySelector('.modal[data-ng]')) return;
	const until = Date.now() + Math.max(0, +secs || 0) * 1000, gu = what === '访客 Wi-Fi';
	// 各处的文案：标题、倒数后面的字、点「保留」后、没确认自动改回后
	const T = gu ? { h: '访客网络加好了，家里还能上网吗？', s: '秒后自动撤销', kept: '访客 Wi-Fi 已打开', auto: '没有确认，访客 Wi-Fi 已撤销', back: '撤销', going: '正在撤销访客 Wi-Fi' }
		: what === '端口转发' ? { h: '保留新的端口转发？', kept: '已保留', auto: '没有确认，端口转发已改回原来的' }
		: what === '上网设置' ? { h: '能上网了吗？', kept: '已保留新的上网设置', auto: '没有确认，已改回原来的上网设置' }
		: what === '无线中继' ? { h: '保留新的中继设置？', kept: '已保留', auto: '没有确认，中继设置已改回原来的', note: '手机断开的话，重连 Wi-Fi 再点「保留」。' }
		: what === '局域网设置' ? { h: '新的局域网设置要保留吗？', kept: '已保留新的局域网设置', auto: '没有确认，已改回原来的局域网设置', note: '手机断开的话，重连 Wi-Fi 再点「保留」。' }
		: { h: '新的 Wi-Fi 设置要保留吗？', kept: '已保留新的 Wi-Fi 设置', auto: '没有确认，已改回原来的 Wi-Fi 设置' };
	store.set('rp_ng', JSON.stringify({ tok, until, ssid, what }));
	const done = (msg) => { store.del('rp_ng'); if (msg) toast(msg); if (['wifi', 'pf', 'wan', 'lanset', 'wisp'].includes(page)) setTimeout(() => refresh(), 600); };
	modal(`<h3>${T.h}</h3>
		<div class="wfcd"><b data-n>${Math.ceil((until - Date.now()) / 1000)}</b><span>${T.s || '秒后改回原来的'}</span></div>
		${ssid ? `<div class="notice">手机断开的话，先连上「${esc(ssid)}」再点「保留」。</div>` : T.note ? `<div class="notice">${T.note}</div>` : ''}
		<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-back>${T.back || '改回去'}</button><button class="btn primary" data-keep>保留</button></div>`,
	(m, close) => {
		m.dataset.ng = 1; m.dataset.lock = 1;
		const n = m.querySelector('[data-n]'), keep = m.querySelector('[data-keep]'), back = m.querySelector('[data-back]');
		const tick = setInterval(() => {
			const s = Math.max(0, Math.ceil((until - Date.now()) / 1000));
			n.textContent = s;
			if (!s) { clearInterval(tick); close(null); done(T.auto); }
		}, 500);
		const act = async (b, m2) => {
			keep.disabled = back.disabled = true;
			try {
				const r = await P(m2, { token: tok }, 8000);
				clearInterval(tick); close(null);
				done(r.gone ? '已经改回原来的设置了' : m2 === 'net_confirm' ? T.kept : T.going || '正在改回原来的设置…');
				if (m2 === 'net_confirm' && !r.gone && after) after();
			} catch (x) {
				keep.disabled = back.disabled = false;
				toast(x instanceof OfflineError ? (ssid ? `连不上路由器：先连上「${ssid}」再点` : what === '上网设置' || what === '局域网设置' || what === '无线中继' ? '连不上路由器，等网络恢复后再点' : '连不上路由器，等 Wi-Fi 恢复后再点') : x.message, true);
			}
		};
		keep.onclick = () => act(keep, 'net_confirm');
		back.onclick = () => act(back, 'net_revert');
	}, { compact: true });
}
// 改完 Wi-Fi 手机断开、重新连上打开面板：卡片接着倒数
function wfSaved() { try { return JSON.parse(store.get('rp_ng') || 'null'); } catch (e) { return null; } }
function wfResume() {
	const o = wfSaved();
	if (!o || !o.tok || document.querySelector('.modal[data-ng]')) return;
	if (o.until < Date.now()) { store.del('rp_ng'); return; }
	P('net_pending').then((r) => {
		const p = r.pending;
		if (p && p.token === o.tok) wfConfirm(p.token, p.left, o.ssid, p.what); else store.del('rp_ng');
	}).catch(() => wfConfirm(o.tok, (o.until - Date.now()) / 1000, o.ssid, o.what));
}

/* ---------- 6.0 第 15 项：访客 Wi-Fi ----------
 * Wi-Fi 页下面一张卡片：关着时直接点「开 2 小时 / 1 天 / 7 天」；开着时显示名字、密码、还剩多久、几台设备，能出二维码、延长、关掉。
 * 第一次打开要加访客网络：先弹「家里还能上网吗？」倒数确认，点「保留」后出二维码。 */
const GU = { d: null };
const guLeft = (s) => { const M = Math.max(1, Math.ceil((s | 0) / 60)), d = Math.floor(M / 1440), h = Math.floor(M % 1440 / 60), m = M % 60; return d ? `${d} 天${h ? ' ' + h + ' 小时' : ''}` : h ? `${h} 小时${m ? ' ' + m + ' 分' : ''}` : `${m} 分钟`; };
function guAt(t) {
	const d = new Date(t * 1000), n = new Date(), hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	const day = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5);
	return (day === 0 ? '今天 ' : day === 1 ? '明天 ' : day === 2 ? '后天 ' : `${d.getMonth() + 1}月${d.getDate()}日 `) + hm;
}
const guQrText = (g) => { const e = (x) => String(x).replace(/([\;,:"])/g, '\\$1'); return `WIFI:T:WPA;S:${e(g.ssid)};P:${e(g.key)};;`; };
function guRender() {
	const box = $('wfGuest'), g = GU.d;
	if (!box) return;
	if (!g || WF.d?.none) { box.innerHTML = ''; return; }
	const st = g.on ? `还剩 ${guLeft(g.left)} · ${g.devs ? g.devs + ' 台设备连着' : '没有设备连着'}` : g.can ? '关着' : g.why;
	const down = g.on ? (g.bands || []).filter((b) => b.up === false) : [];
	box.innerHTML = `<section class="card wfc wfg${g.on ? '' : ' off'}">
		<div class="wfhd"><div><b>访客 Wi-Fi</b><span class="muted">${esc(st)}</span></div>${g.on ? '<span class="pill good">开着</span>' : ''}</div>
		${g.on ? `<div class="fld row"><div class="lb"><b>名字</b></div><span class="val">${esc(g.ssid)}</span></div>
		<div class="fld row"><div class="lb"><b>密码</b></div><span class="val mono">${esc(g.key)}</span></div>
		${down.length ? `<div class="notice w" style="margin-top:4px">${esc(down.map((b) => b.name).join('、'))} 上的访客 Wi-Fi 没开起来：这个无线芯片可能不支持同时开两个 Wi-Fi。</div>` : ''}
		<div class="wfgo three"><button class="btn primary" data-gu="qr">二维码</button><button class="btn" data-gu="ext">延长</button><button class="btn" data-gu="off">关掉</button></div>`
		: g.can ? `<div class="wfgo three"><button class="btn" data-gu="2">开 2 小时</button><button class="btn" data-gu="24">开 1 天</button><button class="btn" data-gu="168">开 7 天</button></div>` : ''}
	</section>`;
}
async function guQr() {
	const g = GU.d; if (!g || !g.on) return;
	try { await loadQr(); } catch (x) { return toast(x.message, true); }
	modal(`<h3>访客 Wi-Fi</h3>
		<div class="cscroll"><div class="qrbox wfqr">${qrSvg(guQrText(g))}</div>
		<div class="kv"><span>名字</span><span>${esc(g.ssid)}</span></div>
		<div class="kv"><span>密码</span><span class="mono">${esc(g.key)}</span></div>
		<div class="kv"><span>自动关</span><span>${esc(guAt(g.until))}</span></div></div>
		<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-copy>复制名字和密码</button><button class="btn primary" data-v="close">好了</button></div>`,
	(m) => { m.dataset.guqr = 1; m.querySelector('[data-copy]').onclick = () => copyText(`Wi-Fi：${g.ssid}\n密码：${g.key}`); }, { compact: true });
}
$('wfGuest').addEventListener('click', async (e) => {
	const b = e.target.closest('[data-gu]'); if (!b) return;
	const v = b.dataset.gu, g = GU.d;
	if (v === 'qr') return guQr();
	if (v === 'off') {
		if (!(await confirmBox('关掉访客 Wi-Fi？', g.devs ? `连着访客 Wi-Fi 的 ${g.devs} 台设备会断开。` : '下次打开会换一个新密码。', '关掉', true))) return;
		return busy(b, async () => { GU.d = await P('guest_set', { on: false }, 20000); guRender(); toast('访客 Wi-Fi 已关'); });
	}
	if (v === 'ext') {
		const CLK = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
		const h = await moreSheet({ t: '延长访客 Wi-Fi', sub: '现在 ' + guAt(g.until) + ' 自动关' }, [{ items: [{ v: '2', ic: CLK, t: '2 小时' }, { v: '24', ic: CLK, t: '1 天' }, { v: '168', ic: CLK, t: '7 天' }] }]);
		if (!h || h === 'close') return;
		try { GU.d = await P('guest_set', { extend: +h }, 15000); guRender(); toast('延长到 ' + guAt(GU.d.until)); } catch (x) { toast(x.message, true); }
		return;
	}
	const hours = +v, first = !g.net, len = hours === 2 ? '2 小时' : hours === 24 ? '1 天' : '7 天';
	const txt = first ? '第一次打开要给访客加一个单独的网络：路由器的网络会重新加载，家里的设备断开几秒。\n加好后 90 秒内点「保留」，不点就自动撤销。'
		: 'Wi-Fi 会断开几秒再连上。访客只能上外网，进不了家里的设备和路由器后台。';
	if (!(await confirmBox(`打开访客 Wi-Fi ${len}？`, txt, '打开'))) return;
	await busy(b, async () => {
		try {
			const r = await P('guest_set', { on: true, hours }, 20000);
			GU.d = r; guRender();
			if (r.token) wfConfirm(r.token, r.wait + 2, null, '访客 Wi-Fi', guQr);
			else guQr();
		} catch (x) { toast(x.message, true); }
	});
});

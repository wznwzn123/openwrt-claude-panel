/* ---------- 6.0 第 24 项：上网设置 ----------
 * 上面一张卡片是 WAN 口现在的状态；下面选上网方式（自动获取 / 宽带拨号 / 固定 IP）和 DNS，改了底部出现「保存」。
 * 宽带密码只能改、不显示（要看去「我的主页 → 敏感信息」）。保存后走「90 秒确认」（wfConfirm）：拨号失败、填错连不上，自动改回。 */
const WAN = { d: null, m: null };
const WAN_MODE = { dhcp: '自动获取', pppoe: '宽带拨号', static: '固定 IP' };
async function loadWan() {
	const d = await P('wan_get');
	WAN.d = d; WAN.m = d.proto in WAN_MODE ? d.proto : null;
	if (!d.none) store.set('rp_ppp', d.proto === 'pppoe' ? '1' : '0'); // 「敏感信息」里要不要列「宽带账号和密码」
	setStatus(true, '在线');
	wanRender();
	if (d.pending && d.pending.token && d.pending.what === '上网设置' && !document.querySelector('.modal[data-ng]')) wfConfirm(d.pending.token, d.pending.left, null, d.pending.what);
}
const wanDur = (s) => (s < 60 ? '不到 1 分钟' : s < 3600 ? Math.floor(s / 60) + ' 分钟' : s < 86400 ? Math.floor(s / 3600) + ' 小时' : Math.floor(s / 86400) + ' 天');
function wanStatus() {
	const d = WAN.d, s = d.status, mode = d.proto in WAN_MODE ? WAN_MODE[d.proto] : (d.proto_name || '').toUpperCase();
	if (!s) return `<div class="wanhd"><b>读不到状态</b><span class="muted">${esc(mode)}</span></div>`;
	const auth = (s.err || []).some((e) => /AUTH/.test(e));
	const t = s.up ? '已连上' : s.pending ? '正在连接…' : auth ? '账号或密码不对' : '没连上';
	const kv = s.up ? `<dl class="mp-kv wankv"><dt>外网地址</dt><dd class="mono">${esc(s.ip || '—')}</dd><dt>网关</dt><dd class="mono">${esc(s.gw || '—')}</dd><dt>DNS</dt><dd class="mono">${(s.dns || []).map(esc).join('<br>') || '—'}</dd></dl>` : '';
	return `<div class="wanhd"><b class="${s.up || s.pending ? '' : 'ndbad'}">${t}</b><span class="muted">${esc(mode)}${s.up ? ' · 连了 ' + wanDur(s.uptime) : ''}</span></div>${kv}`;
}
function wanRender() {
	const d = WAN.d;
	$('wanPend').innerHTML = d?.pending && !d.pending.token ? `<div class="notice w" style="margin-top:12px">刚改了${esc(d.pending.what)}，${d.pending.left} 秒后不确认就改回原来的。</div>` : '';
	if (d.none) { $('wanSt').innerHTML = `<div class="empty">${esc(d.none)}</div>`; $('wanBody').innerHTML = ''; $('wanBar').classList.add('hidden'); return; }
	$('wanSt').innerHTML = wanStatus();
	const m = WAN.m, fld = (k, t, v, attr = '') => `<div class="fld"><div class="lb"><b>${t}</b></div><div class="ctl"><input class="input" data-wan="${k}" value="${esc(v ?? '')}" autocapitalize="off" autocomplete="off" spellcheck="false"${attr}></div></div>`;
	let f = '';
	if (!m) f = `<div class="notice" style="margin-top:12px">现在是 ${esc((d.proto_name || '').toUpperCase())}，选一种上网方式就会换掉</div>`;
	else if (m === 'pppoe') f = !d.pppoe
		? `<div class="notice w" style="margin-top:12px">固件没装宽带拨号组件</div><button class="btn sm" id="wanPpp" style="margin-top:8px">去软件中心装</button>`
		: fld('user', '宽带账号', d.proto === 'pppoe' ? d.user : '') + `<div class="fld"><div class="lb"><b>宽带密码</b></div><div class="ctl wfpw"><input class="input" data-wan="pw" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="${d.proto === 'pppoe' && d.has_pw ? '不改就不填' : ''}"><button class="btn sm" data-wan="eye" type="button">显示</button></div></div>`;
	else if (m === 'static') f = fld('ip', 'IP 地址', d.ip, ' inputmode="decimal" placeholder="192.168.0.10"') + fld('mask', '子网掩码', d.mask || '255.255.255.0', ' inputmode="decimal"') + fld('gw', '网关', d.gw, ' inputmode="decimal" placeholder="192.168.0.1"');
	const dn = d.dns || [], auto = m !== 'static' && d.dns_auto, rows = Math.max(2, dn.length);
	const dnsIn = [...Array(rows)].map((_, i) => fld('dns' + i, 'DNS ' + (i + 1) + (i ? '（选填）' : ''), dn[i] || '', ' inputmode="decimal" placeholder="' + ['223.5.5.5', '119.29.29.29', '1.1.1.1'][i] + '"')).join('');
	$('wanBody').innerHTML = `<div class="sectitle"><b>上网方式</b></div><section class="card">
		<div class="chips" id="wanMode">${Object.entries(WAN_MODE).map(([k, t]) => `<button class="chip${k === m ? ' on' : ''}" type="button" data-m="${k}">${t}</button>`).join('')}</div>${f}</section>
		<div class="sectitle"><b>DNS</b></div><section class="card">
		${m === 'static' ? '' : `<label class="fld row"><div class="lb"><b>用运营商的 DNS</b></div><label class="sw"><input type="checkbox" data-wan="auto"${auto ? ' checked' : ''} aria-label="用运营商的 DNS"><i></i></label></label>`}
		<div id="wanDns"${auto ? ' class="hidden"' : ''}>${dnsIn}</div></section>`;
	wanDirty();
}
// 现在填的跟路由器上的比：改了哪些（密码不填 = 不改）
function wanForm() {
	const g = (k) => $('wanBody').querySelector(`[data-wan="${k}"]`), v = (k) => (g(k)?.value || '').trim();
	const p = { proto: WAN.m };
	if (WAN.m === 'pppoe') { p.user = v('user'); p.pw = g('pw')?.value || ''; }
	if (WAN.m === 'static') { p.ip = v('ip'); p.mask = v('mask'); p.gw = v('gw'); }
	const a = g('auto');
	p.dns_auto = WAN.m !== 'static' && !!a?.checked;
	p.dns = p.dns_auto ? [] : $$('#wanDns [data-wan^="dns"]').map((i) => i.value.trim()).filter(Boolean);
	return p;
}
function wanChanged() {
	const d = WAN.d, p = wanForm();
	if (!p.proto || d.none) return false;
	if (p.proto !== d.proto) return true;
	if (p.proto === 'pppoe' && (p.user !== (d.user || '') || p.pw)) return true;
	if (p.proto === 'static' && (p.ip !== (d.ip || '') || p.mask !== (d.mask || '') || p.gw !== (d.gw || ''))) return true;
	if (p.dns_auto !== !!d.dns_auto) return true;
	return !p.dns_auto && p.dns.join(' ') !== (d.dns || []).join(' ');
}
function wanDirty() {
	const c = wanChanged();
	$('wanBar').classList.toggle('hidden', !c);
	$('wanN').textContent = c ? '上网设置改了' : '';
}
$('wanBody').addEventListener('input', wanDirty);
$('wanBody').addEventListener('change', (e) => {
	if (e.target.dataset.wan === 'auto') $('wanDns').classList.toggle('hidden', e.target.checked);
	wanDirty();
});
$('wanBody').addEventListener('click', (e) => {
	const c = e.target.closest('#wanMode .chip');
	if (c) {
		// 换方式时把已经填的 DNS 带过去
		const keep = wanForm();
		WAN.m = c.dataset.m;
		const d0 = WAN.d;
		WAN.d = { ...d0, dns: keep.dns.length ? keep.dns : d0.dns, dns_auto: WAN.m === 'static' ? false : keep.dns_auto || (!keep.dns.length && d0.dns_auto) };
		wanRender();
		WAN.d = d0;
		wanDirty();
		return;
	}
	if (e.target.id === 'wanPpp') return stFind('ppp-mod-pppoe');
	if (e.target.dataset.wan === 'eye') { const i = $('wanBody').querySelector('[data-wan="pw"]'); const sh = i.type === 'password'; i.type = sh ? 'text' : 'password'; e.target.textContent = sh ? '隐藏' : '显示'; }
});
$('wanUndo').onclick = () => { WAN.m = WAN.d.proto in WAN_MODE ? WAN.d.proto : null; wanRender(); };
$('wanSave').onclick = async () => {
	const p = wanForm();
	if (p.proto === 'pppoe' && !p.user) return $('wanBody').querySelector('[data-wan="user"]')?.focus();
	if (p.proto === 'static') for (const k of ['ip', 'gw']) if (!p[k]) return $('wanBody').querySelector(`[data-wan="${k}"]`).focus();
	if (!p.dns_auto && !p.dns.length && p.proto === 'static') return $('wanBody').querySelector('[data-wan="dns0"]').focus();
	if (!(await confirmBox('修改上网设置', '家里会断网一会儿，面板也会掉线；连不上外网的话 90 秒后自动改回。', '保存'))) return;
	busy($('wanSave'), async () => {
		const r = await P('wan_set', p, 20000);
		if (!r.changed) { toast('没有改动'); return wanRender(); }
		wfConfirm(r.token, r.wait + 2, null, '上网设置');
	});
};

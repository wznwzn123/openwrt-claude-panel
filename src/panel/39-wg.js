/* ---------- 6.0 第 55 项：家庭加密通道（WireGuard） ----------
 * 用户 11/26 定：WireGuard；没公网 IP 写原因；默认整个家里网络，可以只通指定设备；手机只有去家里的流量走通道。
 * 加手机要先确认本人；配置（含手机的私钥）只显示这一次：二维码 + 下载文件。只有主账号能用。 */
const WGP = { d: null };
async function loadWg() {
	WGP.d = await P('wg_get', { cands: true });
	setStatus(true, '在线');
	wgRender();
}
const wgAgo = (t) => (t ? ago(new Date(t * 1000).toISOString()) + '连过' : '没连过');
const wgMB = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');
function wgRender() {
	const d = WGP.d;
	if (!d) return;
	if (!d.caps) {
		$('wgBody').innerHTML = `<section class="card aucard"><div class="kv aswon"><span><b>WireGuard</b><span class="muted">没装</span></span><button class="btn sm" data-wgget type="button">去软件中心装</button></div></section>`;
		return;
	}
	const r = d.reach || {};
	const warn = !r.ok ? `<div class="notice w" style="margin-top:12px">${esc(r.msg)}</div>` : r.nat ? `<div class="notice w" style="margin-top:12px">上一级路由器（光猫）要把 UDP ${d.port} 转发到 ${esc(r.wan4)}</div>` : '';
	const sw = `<span class="sw"><input type="checkbox" id="wgOn"${d.on ? ' checked' : ''}${!r.ok && !d.on ? ' disabled' : ''} aria-label="加密通道"><i></i></span>`;
	let main = `<div class="kv aswon"><span><b>加密通道</b></span>${sw}</div>`;
	if (d.on) main += `<div class="kv wgkv"><span>地址</span><span class="mono">${esc(d.host || '—')}</span><button class="btn sm" id="wgHost" type="button">修改</button></div>
		<div class="kv wgkv"><span>端口</span><span class="mono">UDP ${d.port}</span><button class="btn sm" id="wgPort" type="button">修改</button></div>`;
	let html = warn + `<section class="card aucard" style="margin-top:12px">${main}</section>`;
	if (d.on) {
		const ps = d.peers || [];
		html += `<div class="sectitle"><b>手机</b></div><section class="card list">${ps.length ? ps.map((p) => `<div class="file wgrow"><div style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(p.name)}</b><span class="muted ell" style="display:block;font-size:12.5px">${esc(p.ip)} · ${esc(wgAgo(p.hs))}${p.hs ? ' · ↓' + wgMB(p.tx) + ' ↑' + wgMB(p.rx) : ''}</span></div><button class="btn sm" data-wgdel="${esc(p.id)}" type="button">删除</button></div>`).join('') : '<div class="empty">还没加手机</div>'}</section>
			<button class="btn" id="wgAdd" type="button" style="width:100%;margin-top:12px">添加手机</button>`;
		const only = d.only;
		html += `<div class="sectitle"><b>能连的设备</b></div><section class="card">
			<div class="chips" id="wgSeg"><button type="button" data-wgmode="all" class="chip${only ? '' : ' on'}">整个家里网络</button><button type="button" data-wgmode="only" class="chip${only ? ' on' : ''}">只通指定设备</button></div>
			${only ? `<div class="wgonly">${only.length ? only.map((x) => `<div class="kv"><span class="ell">${esc(x.name)}</span><span class="mono">${esc(x.ip)}</span></div>`).join('') : '<div class="empty">一台都不通</div>'}<button class="btn" id="wgPick" type="button" style="width:100%;margin-top:10px">选设备</button></div>` : ''}
		</section>`;
	}
	$('wgBody').innerHTML = html;
}
async function wgSet(body, tmo) {
	const r = await P('wg_set', body, tmo || 30000);
	WGP.d = r; wgRender();
	if (r.msg) toast(r.msg);
	return r;
}
// 加手机：先确认本人（配置里有私钥），配置只显示这一次
async function wgAdd() {
	const name = await modal(`<h3>添加手机</h3>
		<div class="fld"><div class="lb"><b>名字</b></div><div class="ctl"><input class="input" data-a="name" maxlength="30" placeholder="我的手机" autocomplete="off"></div></div>
		<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-v="close">取消</button><button class="btn primary" data-ok>下一步</button></div>`,
	(m, close) => { const i = m.querySelector('[data-a="name"]'); setTimeout(() => i.focus(), 60); m.querySelector('[data-ok]').onclick = () => (i.value.trim() ? close(i.value.trim()) : i.focus()); });
	if (!name || typeof name !== 'string') return;
	let tok;
	if (isHosted()) { tok = await needSudo('添加手机要先确认是你本人'); if (!tok) return; }
	else if (!sudoOn()) { toast('先在「我的主页 → 敏感信息」里验证是你本人', true); return go('me'); }
	else tok = SUDO.tok;
	try { await loadQr(); } catch (e) {}
	let r;
	try { r = await wgSet({ add: name, sudo: tok }, 40000); }
	catch (e) { if (/确认是你本人/.test(e.message)) sudoSet(null); return toast(e.message, true); }
	wgShow(r);
}
function wgShow(r) {
	const url = URL.createObjectURL(new Blob([r.conf], { type: 'text/plain' }));
	modal(`<div class="sheethead"><h3>${esc(r.name)}</h3><button class="btn sm" data-v="close">完成</button></div>
		<div class="notice w" style="margin:0 0 10px">只显示这一次。手机装 WireGuard，扫码导入。</div>
		${window.qrcode ? `<div class="qrbox wgqr">${qrSvg(r.conf)}</div>` : ''}
		<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-wgcopy type="button">复制配置</button><a class="btn primary" href="${url}" download="${esc(r.file)}">下载配置文件</a></div>`,
	(m) => { m.querySelector('[data-wgcopy]').onclick = () => copyText(r.conf); }).then(() => setTimeout(() => URL.revokeObjectURL(url), 1000));
}
async function wgPick() {
	const c = WGP.d.cands || [], cur = new Set((WGP.d.only || []).map((x) => x.ip));
	const v = await modal(`<div class="sheethead"><h3>选设备</h3><button class="btn sm" data-v="close">取消</button></div>
		<div class="wgpick">${c.length ? c.map((x, i) => `<label class="kv aswon"><span class="ell"><b>${esc(x.name || x.ip)}</b><span class="muted">${esc(x.ip)}</span></span><span class="sw"><input type="checkbox" data-i="${i}"${cur.has(x.ip) ? ' checked' : ''} aria-label="${esc(x.name || x.ip)}"><i></i></span></label>`).join('') : '<div class="empty">家里没有在线的设备</div>'}</div>
		<div class="btngrid" style="margin:14px 0 0;grid-template-columns:1fr"><button class="btn primary" data-ok>保存</button></div>`,
	(m, close) => { m.querySelector('[data-ok]').onclick = () => close([...m.querySelectorAll('[data-i]:checked')].map((x) => c[+x.dataset.i])); });
	if (!Array.isArray(v)) return;
	try { await wgSet({ only: v.map((x) => ({ ip: x.ip, mac: x.mac, name: x.name || x.ip })) }); } catch (e) { toast(e.message, true); }
}
async function wgAsk(title, label, val, ph, mode) {
	return modal(`<h3>${title}</h3><div class="fld"><div class="lb"><b>${label}</b></div><div class="ctl"><input class="input mono" data-a="v" value="${esc(val)}" placeholder="${esc(ph)}" inputmode="${mode}" autocapitalize="off" spellcheck="false"></div></div>
		<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-v="close">取消</button><button class="btn primary" data-ok>保存</button></div>`,
	(m, close) => { const i = m.querySelector('[data-a="v"]'); m.querySelector('[data-ok]').onclick = () => close(i.value.trim()); });
}
$('wgBody').addEventListener('change', async (e) => {
	if (e.target.id !== 'wgOn') return;
	const on = e.target.checked;
	const ask = on ? ['开启加密通道', `防火墙放行 UDP ${WGP.d.port}，网络会重新加载几秒。`, '开启', false] : ['关闭加密通道', '手机都连不上家里了。再打开不用重新扫码。', '关闭', true];
	if (!(await confirmBox(...ask))) { e.target.checked = !on; return; }
	e.target.disabled = true;
	try { await wgSet({ on }, 60000); } catch (er) { e.target.checked = !on; e.target.disabled = false; toast(er.message, true); }
});
$('wgBody').addEventListener('click', async (e) => {
	const t = e.target;
	if (t.closest('[data-wgget]')) return stFind(WGP.d.pkg);
	if (t.id === 'wgAdd') return wgAdd();
	if (t.id === 'wgPick') return wgPick();
	if (t.id === 'wgHost') {
		const v = await wgAsk('地址', '域名（选填）', WGP.d.own || '', '自动', 'url');
		if (v == null || typeof v !== 'string') return;
		return busy(t, async () => { try { await wgSet({ host: v }); } catch (er) { toast(er.message, true); } });
	}
	if (t.id === 'wgPort') {
		const v = await wgAsk('端口', 'UDP 端口', String(WGP.d.port), '51820', 'numeric');
		if (!v || typeof v !== 'string' || v === String(WGP.d.port)) return;
		if (WGP.d.peers.length && !(await confirmBox('改端口', '已经加的手机要重新扫码。', '改'))) return;
		return busy(t, async () => { try { await wgSet({ port: v }, 60000); } catch (er) { toast(er.message, true); } });
	}
	const del = t.closest('[data-wgdel]');
	if (del) {
		const p = WGP.d.peers.find((x) => x.id === del.dataset.wgdel);
		if (!p || !(await confirmBox('删除「' + p.name + '」', '这台手机连不上家里了，要连得重新添加。', '删除', true))) return;
		return busy(del, async () => { try { await wgSet({ del: p.id }); } catch (er) { toast(er.message, true); } });
	}
	const m = t.closest('[data-wgmode]');
	if (m) {
		const want = m.dataset.wgmode;
		if ((want === 'only') === !!WGP.d.only) return;
		if (want === 'only') return wgPick();
		return busy(m, async () => { try { await wgSet({ only: null }); } catch (er) { toast(er.message, true); } });
	}
	const row = t.closest('.kv.aswon');
	if (row && !t.closest('.sw,button')) { const i = row.querySelector('#wgOn'); if (i && !i.disabled) i.click(); }
});

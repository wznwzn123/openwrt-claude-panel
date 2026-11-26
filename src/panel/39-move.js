/* ---------- 6.0 第 29 项：换路由器——旧路由器打包，新路由器输搬家码 ----------
 * 搬家码 = 官网上的编号 + 钥匙（钥匙不经过官网）。新路由器先看要搬什么，确认后写入；网络设置只给看。只有主账号、只有托管版。 */
const MV = { out: null, pre: null, code: '' };
async function loadMove() {
	setStatus(true, '在线');
	mvRender();
}
const mvPills = (a) => `<div class="mvitems">${a.map((x) => `<span class="pill">${esc(x)}</span>`).join('')}</div>`;
function mvRender() {
	if (!isHosted()) {
		$('mvBody').innerHTML = `<section class="card"><div class="empty">自建版不能用搬家码，在新路由器上用云端备份还原。</div><div class="btngrid" style="grid-template-columns:1fr;margin:0 0 4px"><button class="btn" data-go="cbk" type="button">打开云端备份</button></div></section>`;
		return;
	}
	const o = MV.out, p = MV.pre;
	const out = o
		? `<div class="mvcode mono" id="mvCode">${esc(o.code)}</div><div class="kv"><span>有效期</span><span>${esc(ts(o.exp / 1000))} 前，只能用一次</span></div>${mvPills(o.items)}<div class="btngrid"><button class="btn" id="mvOut" type="button">重新打包</button><button class="btn primary" id="mvCopy" type="button">复制搬家码</button></div>`
		: `<div class="btngrid" style="grid-template-columns:1fr"><button class="btn primary" id="mvOut" type="button">打包这台路由器的设置</button></div>`;
	let inn = `<div class="mvin"><input class="input mono" id="mvIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="粘贴搬家码" value="${esc(MV.code)}" aria-label="搬家码"><button class="btn sm" id="mvLook" type="button">查看</button></div>`;
	if (p) {
		inn += `<div class="kv"><span>来自</span><span><b>${esc(p.from)}</b></span></div>${mvPills(p.items)}${p.off ? `<div class="kv"><span>特色功能</span><span>关了 ${p.off} 项，跟旧路由器一样</span></div>` : ''}`
			+ `<div class="kv aswon"><span><b>家人一起转过来</b></span><span class="sw"><input type="checkbox" id="mvFam" checked aria-label="家人一起转过来"><i></i></span></div>`
			+ `<div class="btngrid" style="grid-template-columns:1fr"><button class="btn primary" id="mvApply" type="button">搬过来</button></div>`;
	}
	const net = p ? `<div class="sectitle"><b>旧路由器的网络设置（不搬）</b></div><section class="card">${mvNet(p)}</section>` : '';
	$('mvBody').innerHTML = `<div class="sectitle"><b>搬到新路由器</b></div><section class="card">${out}</section><div class="sectitle"><b>从旧路由器搬过来</b></div><section class="card">${inn}</section>${net}`;
}
function mvNet(p) {
	const n = p.net || {}, h = p.here || {};
	const row = (k, a, b) => `<div class="kv mvnet"><span>${k}</span><span>${esc(a || '—')}${b != null && b !== a ? `<i>这台：${esc(b || '—')}</i>` : ''}</span></div>`;
	return row('Wi-Fi', (n.wifi || []).join('、')) + row('路由器地址', n.lan, h.lan) + row('上网方式', MV_WAN[n.wan] || n.wan, MV_WAN[h.wan] || h.wan);
}
const MV_WAN = { pppoe: '拨号', dhcp: '自动获取', static: '静态 IP' };
const mvErr = (e) => toast(e.message, true);
$('mvBody').addEventListener('input', (e) => { if (e.target.id === 'mvIn') { MV.code = e.target.value; if (MV.pre) { MV.pre = null; const c = MV.code; mvRender(); const i = $('mvIn'); i.focus(); i.setSelectionRange(c.length, c.length); } } });
$('mvBody').addEventListener('keydown', (e) => { if (e.target.id === 'mvIn' && e.key === 'Enter') $('mvLook').click(); });
$('mvBody').addEventListener('click', async (e) => {
	const t = e.target, g = t.closest('[data-go]');
	if (g) return go(g.dataset.go);
	if (t.id === 'mvCopy') return copyText(MV.out.code);
	if (t.id === 'mvOut') {
		if (MV.out && !(await confirmBox('重新打包', '之前的搬家码不能再用。', '重新打包'))) return;
		return busy(t, async () => { try { MV.out = await P('move_out', {}, 60000); mvRender(); toast('已打包'); } catch (er) { mvErr(er); } }, '正在打包…');
	}
	if (t.id === 'mvLook') {
		const code = $('mvIn').value.trim();
		if (!code) return toast('先输入搬家码', true);
		return busy(t, async () => { try { MV.code = code; MV.pre = await P('move_in', { code }, 60000); mvRender(); } catch (er) { mvErr(er); } });
	}
	if (t.id === 'mvApply') {
		const fam = $('mvFam').checked;
		if (!(await confirmBox('从「' + MV.pre.from + '」搬过来', '这台路由器上的同类设置会被替换。' + (fam ? '旧路由器上的家人转到这台。' : ''), '搬过来'))) return;
		return busy(t, async () => {
			try {
				const r = await P('move_in', { code: MV.code, apply: true, fam }, 90000);
				MV.pre = null; MV.code = ''; mvRender();
				toast('已搬过来' + (r.fam ? '，家人 ' + r.fam + ' 个' : '') + (r.restart ? '；分流要重启代理才生效' : ''));
			} catch (er) { mvErr(er); }
		}, '正在搬…');
	}
	const row = t.closest('.kv.aswon');
	if (row && !t.closest('.sw')) { const i = row.querySelector('input'); if (i) i.click(); }
});

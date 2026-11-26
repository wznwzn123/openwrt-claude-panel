/* ---------- 6.0 第 30、34 项：固件升级、恢复出厂 ----------
 * 用户 11/26 定：只能连着家里 Wi-Fi 时做（在外面灰掉，写「要连家里 Wi-Fi」）；做之前必须备份、输路由器后台密码。只有主账号能用。
 * 固件分块传到路由器内存（每块 512 KB），传完路由器先检查型号，通过了才能刷。 */
const FW = { d: null, up: null };
const FW_CH = 512 * 1024;
async function loadFwup() {
	FW.d = await P('sysmnt_get');
	setStatus(true, '在线');
	fwRender();
}
const fwMB = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');
function fwRender() {
	const d = FW.d;
	if (!d) return;
	const away = !d.home, dis = away ? ' disabled' : '', f = d.file, u = FW.up;
	const kv = [['固件', d.fw.desc || '—'], ['型号', d.fw.model || d.fw.board || '—'], ['平台', d.fw.target || '—']].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
	let up;
	if (d.up !== true) up = `<div class="empty">${esc(d.up)}</div>`;
	else if (u) up = `<div class="fwfile"><b class="ell">${esc(u.name)}</b><span class="muted">上传中 ${Math.floor((u.got / u.size) * 100)}%</span></div><div class="fwbar"><i style="width:${(u.got / u.size) * 100}%"></i></div><div style="margin-top:10px"><button class="btn sm" id="fwCancel" type="button">取消</button></div>`;
	else if (f) up = `<div class="fwfile"><b class="ell">${esc(f.name)}</b><span class="muted">${fwMB(f.size)}</span></div>
		${f.ok ? '<div class="notice" style="margin-top:10px">检查通过</div>' : `<div class="notice w" style="margin-top:10px">${esc(f.msg || '固件检查没通过')}</div>`}
		${f.ok ? `<label class="fld row"><div class="lb"><b>保留设置</b></div><label class="sw"><input type="checkbox" id="fwKeep" checked${dis} aria-label="保留设置"><i></i></label></label>` : ''}
		<div class="btngrid" style="margin-top:12px"><button class="btn" id="fwCancel" type="button"${dis}>换一个</button><button class="btn primary" id="fwGo" type="button"${f.ok ? dis : ' disabled'}>升级</button></div>`;
	else up = `<label class="btn${away ? ' disabled' : ''}" style="display:flex;justify-content:center;position:relative"><input type="file" id="fwFile" accept=".bin,.img,.itb,.gz,.ubi,.trx,.chk" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"${dis}>选择固件文件</label>`;
	$('fwBody').innerHTML = `${away ? '<div class="notice w" style="margin-top:12px">要连家里 Wi-Fi</div>' : ''}
		<section class="card"><dl class="mp-kv">${kv}</dl></section>
		<div class="sectitle"><b>固件升级</b></div><section class="card">${up}</section>
		<div class="sectitle"><b>恢复出厂</b></div><section class="card">${d.reset ? `<button class="btn danger" id="fwReset" type="button" style="width:100%"${dis}>恢复出厂</button>` : '<div class="empty">固件不支持恢复出厂（没有 firstboot）</div>'}</section>`;
}
async function fwUpload(file) {
	const r0 = await P('fw_up', { op: 'begin', size: file.size, name: file.name });
	FW.up = { name: file.name, size: file.size, got: r0.got || 0, stop: false };
	fwRender();
	let off = FW.up.got, last = null;
	while (off < file.size && !FW.up.stop) {
		const buf = new Uint8Array(await file.slice(off, off + FW_CH).arrayBuffer());
		let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
		last = await P('fw_up', { op: 'chunk', off, data: btoa(s) }, 60000);
		off = last.ok === false ? last.got : last.got;
		FW.up.got = off;
		fwRender();
	}
	const stopped = FW.up.stop;
	FW.up = null;
	if (stopped) return;
	FW.d = await P('sysmnt_get');
	fwRender();
	if (last && last.good === false) toast(last.msg || '固件检查没通过', true);
}
// 30 分钟内没备份过：先备份（云端，或者下载到手机）
async function fwBackup() {
	if (FW.d.bk_fresh) return true;
	const cloud = FW.d.cloud;
	const v = await modal(`<h3>先备份</h3><div class="notice" style="color:var(--text)">${cloud ? '把现在的设置备份到云端。' : '把现在的设置下载到手机。'}</div>
		<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-v="false">取消</button><button class="btn primary" data-v="true">${cloud ? '备份到云端' : '下载备份'}</button></div>`);
	if (v !== true) return false;
	try {
		if (cloud) {
			await P('bk_now');
			toast('正在备份…');
			for (let i = 0; i < 60; i++) {
				await new Promise((z) => setTimeout(z, 3000));
				FW.d = await P('sysmnt_get');
				if (FW.d.bk_fresh) break;
				if (FW.d.job && /fail|error/.test(FW.d.job.state || '')) throw new Error(FW.d.job.msg || '备份失败');
			}
			if (!FW.d.bk_fresh) throw new Error('备份没完成，稍后再试');
			toast('已备份到云端');
		} else {
			const r = await P('sys_lbk', {}, 60000);
			download(r.url, r.name);
			FW.d.bk_fresh = true;
			toast('开始下载备份');
		}
		return true;
	} catch (e) { toast(e.message, true); return false; }
}
// 最后一步：说后果、输密码
function fwPw(title, body, ok) {
	return modal(`<h3>${esc(title)}</h3><div class="notice" style="color:var(--text);line-height:1.6">${esc(body)}</div>
		<input class="input" type="password" id="fwPw" placeholder="路由器后台密码" autocomplete="current-password" style="margin-top:12px">
		<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-v="false">取消</button><button class="btn danger" data-ok>${esc(ok)}</button></div>`,
	(m, close) => {
		const b = m.querySelector('[data-ok]'), i = m.querySelector('#fwPw');
		const go = () => { if (!i.value) return i.focus(); close(i.value); };
		b.onclick = go; i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
		setTimeout(() => i.focus(), 50);
	});
}
async function fwDo(kind) {
	if (!(await fwBackup())) return;
	const keep = kind === 'flash' && $('fwKeep') ? $('fwKeep').checked : true;
	const [t, b, ok] = kind === 'reset' ? ['恢复出厂', '所有设置清空，面板会被删掉，要重新安装。', '恢复出厂'] : ['升级固件', keep ? '断网 3–5 分钟，设置和面板保留。' : '断网 3–5 分钟，设置清空，面板要重新安装。', '升级'];
	const pw = await fwPw(t, b, ok);
	if (typeof pw !== 'string' || !pw) return;
	try {
		if (kind === 'reset') await P('factory_reset', { confirm: 'RESET', pw });
		else await P('fw_flash', { pw, keep });
		setStatus(false, kind === 'reset' ? '正在恢复出厂' : '正在升级');
		$('fwBody').innerHTML = `<section class="card empty" style="margin-top:12px">${kind === 'reset' ? '路由器正在恢复出厂，重启后是全新的系统。' : '路由器正在升级，3–5 分钟后重新打开面板。'}</section>`;
	} catch (e) { toast(e.message, true); }
}
$('fwBody').addEventListener('change', (e) => {
	if (e.target.id !== 'fwFile' || !e.target.files[0]) return;
	const f = e.target.files[0];
	fwUpload(f).catch((er) => { FW.up = null; toast(er.message, true); P('sysmnt_get').then((d) => { FW.d = d; fwRender(); }).catch(() => fwRender()); });
});
$('fwBody').addEventListener('click', async (e) => {
	if (e.target.id === 'fwCancel') {
		if (FW.up) FW.up.stop = true;
		try { await P('fw_up', { op: 'cancel' }); FW.d = await P('sysmnt_get'); } catch (er) { toast(er.message, true); }
		FW.up = null; return fwRender();
	}
	if (e.target.id === 'fwGo') return fwDo('flash');
	if (e.target.id === 'fwReset') return fwDo('reset');
});

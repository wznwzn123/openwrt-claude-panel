/* ---------- 6.0 第 32 项：常用服务——文件共享、FTP、SSH、指示灯 ----------
 * 开关直接生效；开 FTP、放开 SSH、关 SSH 和密码登录前确认（只写后果）。外网能连的标出来。只有主账号能用。
 * 用户 11/26 定：新建共享默认不用密码，只限家里局域网。 */
const SSW = { d: null };
async function loadSvcsw() {
	SSW.d = await P('svcsw_get');
	setStatus(true, '在线');
	sswRender();
}
const sswSw = (k, on, t) => `<span class="sw"><input type="checkbox" data-ss="${k}"${on ? ' checked' : ''} aria-label="${t}"><i></i></span>`;
const sswRow = (t, sub, right) => `<div class="kv aswon"><span><b>${t}</b>${sub ? `<span class="muted">${esc(sub)}</span>` : ''}</span>${right || '<i></i>'}</div>`;
const sswSt = (x) => (!x.on ? '关着' : x.run ? '运行中' : '开着，没在运行');
const sswNo = (pkg, q) => (pkg === false ? '<span class="muted" style="font-size:13px">软件源里没有</span>' : `<button class="btn sm" data-ssget="${esc(pkg || q)}" type="button">去软件中心装</button>`);
function sswRender() {
	const d = SSW.d;
	if (!d) return;
	const s = d.smb, f = d.ftp, h = d.ssh, l = d.led, warn = (t) => `<div class="notice w" style="margin:2px 0 10px">${t}</div>`;
	let smb;
	if (!s.kind) smb = sswRow('文件共享', '没装', sswNo(s.pkg, 'samba4'));
	else smb = sswRow('文件共享', `${s.name} · ${sswSt(s)}${s.lan ? '' : ' · 不只局域网'}`, sswSw('smb', s.on, '文件共享'))
		+ (s.wan ? warn('外网能连：防火墙放行了 445 端口') : '')
		+ s.shares.map((x) => `<div class="file ssshare"><div style="flex:1;min-width:0"><div class="sshd"><b class="ell">${esc(x.name)}</b>${x.ro ? '<span class="pill">只读</span>' : ''}${x.guest ? '' : '<span class="pill">要密码</span>'}</div><span class="muted ell mono" style="display:block;font-size:12.5px">${esc(x.path)}</span></div><button class="btn sm" data-ssdel="${esc(x.id)}" type="button">删除</button></div>`).join('')
		+ `<div style="padding:10px 0 8px"><button class="btn sm" id="ssAdd" type="button">添加共享</button></div>`;
	const ftp = !f.kind ? sswRow('FTP', '没装', sswNo(f.pkg, 'vsftpd')) : sswRow('FTP', `${f.kind} · ${sswSt(f)}`, sswSw('ftp', f.on, 'FTP')) + (f.wan ? warn('外网能连：防火墙放行了 21 端口') : '');
	let ssh;
	if (!h.kind) ssh = sswRow('SSH', '没装', '');
	else if (h.kind === 'openssh') ssh = sswRow('SSH', `OpenSSH · 端口 ${h.port} · ${sswSt(h)}`, sswSw('ssh', h.on, 'SSH')) + (h.wan ? warn(`外网能连：防火墙放行了 ${h.port} 端口`) : '');
	else ssh = sswRow('SSH', sswSt(h), sswSw('ssh', h.on, 'SSH')) + (h.wan ? warn(`外网能连：防火墙放行了 ${h.port} 端口`) : '')
		+ (h.on ? `<div class="kv aswon"><span><b>端口</b></span><input class="input sport" id="ssPort" inputmode="numeric" value="${h.port}" aria-label="SSH 端口"><button class="btn sm hidden" id="ssPortSave" type="button">保存</button></div>`
		+ sswRow('只允许局域网', '', sswSw('lan', h.lan, '只允许局域网'))
		+ sswRow('密码登录', h.keys ? `密钥 ${h.keys} 个` : '没有密钥', sswSw('pw', h.pw, '密码登录')) : '');
	const led = l.n ? sswRow('指示灯', `${l.n} 个`, sswSw('led', l.on, '指示灯')) : sswRow('指示灯', '没有能控制的指示灯', '');
	$('ssBody').innerHTML = [smb, ftp, ssh, led].map((x) => `<section class="card aucard">${x}</section>`).join('');
}
async function sswSet(body, okMsg) {
	SSW.d = await P('svcsw_set', body, 30000);
	sswRender();
	if (okMsg) toast(okMsg);
}
// 开关：要确认的先问；失败了拨回去
const SSW_ASK = {
	ftp: (on) => on && ['开启 FTP', 'FTP 不加密，账号和密码明文传输。', '开启'],
	ssh: (on) => !on && ['关闭 SSH', '不能再用 SSH 登录路由器，面板不受影响。', '关闭'],
	lan: (on) => !on && ['允许所有网络连 SSH', '访客 Wi-Fi、VPN 等也能连到 SSH。', '允许'],
	pw: (on) => !on && ['关闭密码登录', '只能用密钥登录 SSH。', '关闭'],
	led: (on) => !on && ['关闭指示灯', '所有灯都灭，重启后也是灭的。', '关闭'],
};
const SSW_DONE = { smb: ['已开启文件共享', '已关闭文件共享'], ftp: ['已开启 FTP', '已关闭 FTP'], ssh: ['已开启 SSH', '已关闭 SSH'], lan: ['SSH 只允许局域网', 'SSH 允许所有网络'], pw: ['已开启密码登录', '已关闭密码登录'], led: ['已打开指示灯', '已关闭指示灯'] };
$('ssBody').addEventListener('change', async (e) => {
	const k = e.target.dataset.ss; if (!k) return;
	const on = e.target.checked, ask = SSW_ASK[k]?.(on);
	if (ask && !(await confirmBox(ask[0], ask[1], ask[2], !on))) { e.target.checked = !on; return; }
	e.target.disabled = true;
	const body = k === 'smb' ? { smb: { on } } : k === 'ftp' ? { ftp: { on } } : k === 'led' ? { led: { on } } : { ssh: { [k === 'ssh' ? 'on' : k]: on } };
	try { await sswSet(body, SSW_DONE[k][on ? 0 : 1]); } catch (er) { e.target.checked = !on; e.target.disabled = false; toast(er.message, true); }
});
$('ssBody').addEventListener('input', (e) => { if (e.target.id === 'ssPort') $('ssPortSave').classList.toggle('hidden', e.target.value.trim() === String(SSW.d.ssh.port)); });
$('ssBody').addEventListener('click', async (e) => {
	const g = e.target.closest('[data-ssget]');
	if (g) return stFind(g.dataset.ssget);
	if (e.target.id === 'ssPortSave') {
		const p = $('ssPort').value.trim();
		return busy(e.target, async () => { try { await sswSet({ ssh: { port: p } }, 'SSH 端口改成 ' + p); } catch (er) { toast(er.message, true); } });
	}
	const del = e.target.closest('[data-ssdel]');
	if (del) {
		const x = SSW.d.smb.shares.find((s) => s.id === del.dataset.ssdel);
		if (!x || !(await confirmBox('删除共享「' + x.name + '」', '文件夹里的文件不会删。', '删除', true))) return;
		return busy(del, async () => { try { await sswSet({ smb: { del: x.id } }, '已删除共享「' + x.name + '」'); } catch (er) { toast(er.message, true); } });
	}
	if (e.target.id === 'ssAdd') sswAdd();
	// 点整行也能开关（跟特色功能一样）
	const row = e.target.closest('.kv.aswon');
	if (row && !e.target.closest('.sw,button,input')) { const i = row.querySelector('input[data-ss]'); if (i && !i.disabled) i.click(); }
});
async function sswAdd() {
	const disks = SSW.d.smb.disks || [];
	await modal(`<h3>添加共享</h3>
		<div class="fld"><div class="lb"><b>名字</b></div><div class="ctl"><input class="input" data-a="name" autocomplete="off" placeholder="电影"></div></div>
		<div class="fld"><div class="lb"><b>文件夹</b></div><div class="ctl"><input class="input mono" data-a="path" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(disks[0] || '')}" placeholder="/mnt/sda1"></div></div>
		${disks.length > 1 ? `<div class="chips ssdisks" style="flex-wrap:wrap;margin-top:8px">${disks.map((x) => `<button class="chip${x === disks[0] ? ' on' : ''}" type="button" data-dk="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
		${disks.length ? '' : '<div class="notice w" style="margin-top:10px">没插硬盘或 U 盘</div>'}
		<label class="fld row"><div class="lb"><b>只读</b></div><label class="sw"><input type="checkbox" data-a="ro" aria-label="只读"><i></i></label></label>
		<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-v="close">取消</button><button class="btn primary" data-v="add">添加</button></div>`,
	(m, close) => {
		const pi = m.querySelector('[data-a="path"]');
		m.querySelectorAll('[data-dk]').forEach((b) => (b.onclick = () => { pi.value = b.dataset.dk; m.querySelectorAll('[data-dk]').forEach((x) => x.classList.toggle('on', x === b)); }));
		const add = m.querySelector('[data-v="add"]');
		add.addEventListener('click', (e) => {
			e.stopPropagation();
			const name = m.querySelector('[data-a="name"]').value.trim(), path = pi.value.trim();
			if (!name) return m.querySelector('[data-a="name"]').focus();
			if (!path) return pi.focus();
			busy(add, async () => { try { await sswSet({ smb: { add: { name, path, ro: m.querySelector('[data-a="ro"]').checked } } }, '已添加共享「' + name + '」'); close('ok'); } catch (er) { toast(er.message, true); } });
		});
	});
}

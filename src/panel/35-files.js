/* =====================================================================
   配置文件 / 代理集 / 规则集 / 备份
   ===================================================================== */
let cfgKind = 'config';
$('cfgSeg').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; cfgKind = b.dataset.k; $$('#cfgSeg .chip').forEach((x) => x.classList.toggle('on', x === b)); refresh(); };
async function loadCfg(quiet) {
	const box = $('cfgBody');
	if (cfgKind === 'backup') return renderBackup(box);
	const st = cfgKind === 'config' ? await state(!quiet) : null;
	const r = cfgKind === 'config' ? { files: st.files } : await P('files', { kind: cfgKind });
	setStatus(true, '在线');
	const files = r.files || [];
	const label = { config: '配置文件', proxy_provider: '代理集文件', rule_provider: '规则集文件' }[cfgKind];
	box.innerHTML = `<div class="hero"><div class="herohead"><h1>${label}</h1><button class="btn primary" data-new>＋ 新建 / 上传</button></div>
		<p class="muted" style="margin-bottom:0">${cfgKind === 'config' ? '点文件可以切换使用、编辑、改名、下载或删除。订阅下载的配置也在这里。' : cfgKind === 'proxy_provider' ? '/etc/openclash/proxy_provider 里的节点集文件。' : '/etc/openclash/rule_provider 里的规则集文件。'}</p></div>
		<div class="sectitle"><b>全部文件</b><span class="pill">${files.length} 个</span></div>
		<section class="card list">${files.length ? files.map((f, i) => `<button class="file ${f.active ? 'cur' : ''}" data-f="${i}"><div><b>${esc(f.name)}</b><span class="muted">${B(f.size)} · ${ts(f.mtime)}${f.active ? ' · 正在使用' : ''}${f.sub ? ' · 订阅' : ''}</span></div><span class="muted">›</span></button>`).join('') : '<div class="empty">没有文件</div>'}</section>
		${cfgKind === 'rule_provider' ? '<div class="sectitle"><b>运行中的规则集</b></div><section class="card list" data-rp><div class="empty">读取中…</div></section>' : ''}`;
	box.querySelector('[data-new]').onclick = () => newFile(cfgKind);
	box.querySelector('.list').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) fileSheet(cfgKind, files[+b.dataset.f]); };
	if (cfgKind === 'rule_provider') renderRuleProviders(box.querySelector('[data-rp]'));
}
async function fileSheet(kind, f) {
	const isCfg = kind === 'config';
	const v = await modal(`<div class="sheethead"><h3>${esc(f.name)}</h3><button class="btn sm" data-v="close">关闭</button></div>
		<div class="kv"><span>大小</span><span>${B(f.size)}</span></div><div class="kv"><span>修改时间</span><span>${ts(f.mtime)}</span></div>
		${f.sub ? `<div class="kv"><span>来自订阅</span><span>${esc(f.sub)}</span></div>` : ''}
		<div class="btngrid">${isCfg && !f.active ? '<button class="btn primary" data-v="use">使用并重启</button>' : ''}<button class="btn blue" data-v="edit">查看 / 编辑</button>
		${isCfg ? '<button class="btn" data-v="rename">改名</button>' : ''}<button class="btn" data-v="dl">下载到手机</button>${!f.active ? '<button class="btn danger" data-v="del">删除</button>' : ''}</div>`);
	if (v === 'use') {
		if (!(await confirmBox('切换配置', `使用「${f.name}」并重启 OpenClash，断网 10–30 秒。`, '切换'))) return;
		return busy(null, async () => { await P('cfg_switch', { name: f.name }); toast('已切换，OpenClash 正在重启'); S.state = null; setStatus(false, '重启中'); watchJobs(); refresh(true); });
	}
	if (v === 'edit') return editFile(kind, f.name, f.active);
	if (v === 'rename') {
		const to = await promptBox('改名', '新文件名，以 .yaml 结尾', f.name); if (!to || to === f.name) return;
		return busy(null, async () => { const r = await P('file_rename', { kind, name: f.name, to }); toast(r.active_changed ? '已改名（当前配置路径已同步）' : '已改名'); S.state = null; refresh(true); });
	}
	if (v === 'dl') return busy(null, async () => { const r = await P('file_download', { kind, name: f.name }); download(r.url, r.name); toast('开始下载'); });
	if (v === 'del') {
		if (!(await confirmBox('删除 ' + f.name, '删除前会自动备份一份到路由器上。', '删除', true))) return;
		return busy(null, async () => { await P('file_delete', { kind, name: f.name }); toast('已删除'); S.state = null; refresh(true); });
	}
}
async function editFile(kind, name, active, opts = {}) {
	let r;
	try { toast('读取中…'); r = await P('file_read', { kind, name }); toastHide(); } catch (e) { return handleErr(e); }
	if (r.binary) return toast('这是二进制文件，不能在手机上编辑', true);
	const isCfg = kind === 'config';
	await modal(`<div class="sheethead"><h3 class="ell">${esc(opts.title || name)}</h3><button class="btn sm" data-v="false">取消</button></div>
		${opts.note ? `<div class="notice" style="margin-bottom:8px">${esc(opts.note)}</div>` : ''}
		<textarea class="input" data-t spellcheck="false" autocapitalize="off" style="min-height:52vh">${esc(r.content)}</textarea>
		<div class="muted" style="margin-top:6px">${B(r.size)} · ${(r.content.match(/\n/g) || []).length + 1} 行${isCfg ? ' · 保存前会用内核检查格式' : ''}</div>
		<div class="btngrid" style="margin:12px 0 0"><button class="btn blue" data-s>保存</button><button class="btn primary" data-sr>保存并重启</button></div>`,
	(m, close) => {
		m.dataset.lock = '1';
		const ta = m.querySelector('[data-t]');
		const save = (restart) => async () => {
			if (restart && !(await confirmBox('保存并重启', '保存后重启 OpenClash，断网 10–30 秒。', '保存并重启'))) return;
			let res;
			try { res = await P('file_save', { kind, name, content: ta.value, restart }); }
			catch (e) {
				if (/校验没通过/.test(e.message) && await confirmBox('格式检查没通过', e.message + '\n\n仍然要保存吗？', '强制保存', true)) res = await P('file_save', { kind, name, content: ta.value, restart, force: true });
				else throw e;
			}
			close(true); toast(restart ? '已保存，OpenClash 正在重启' : '已保存' + (res && res.backup ? '（旧版本已备份）' : ''));
			if (restart) watchJobs();
			if (opts.after) opts.after();
		};
		m.querySelector('[data-s]').onclick = (e) => busy(e.currentTarget, save(false));
		m.querySelector('[data-sr]').onclick = (e) => busy(e.currentTarget, save(true));
	});
}
async function newFile(kind) {
	const isCfg = kind === 'config';
	await modal(`<div class="sheethead"><h3>新建 / 上传文件</h3><button class="btn sm" data-v="false">取消</button></div>
		<label class="lglabel" style="margin-top:0">文件名</label><input class="input" data-n placeholder="${isCfg ? '例如 my.yaml' : '例如 rules.yaml'}" autocapitalize="off" spellcheck="false">
		<label class="lglabel">内容</label><textarea class="input" data-t spellcheck="false" autocapitalize="off" placeholder="粘贴内容，或点下面「从手机选文件」"></textarea>
		<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-pick>从手机选文件</button><button class="btn primary" data-ok>保存</button></div>`,
	(m, close) => {
		m.dataset.lock = '1';
		const n = m.querySelector('[data-n]'), t = m.querySelector('[data-t]');
		m.querySelector('[data-pick]').onclick = async () => {
			const f = await pickFile(isCfg ? '.yaml,.yml,text/*' : ''); if (!f) return;
			if (f.size > 3 * 1024 * 1024) return toast('文件超过 3MB', true);
			t.value = await readText(f); if (!n.value) n.value = f.name;
		};
		const ok = m.querySelector('[data-ok]');
		ok.onclick = () => busy(ok, async () => {
			let name = n.value.trim();
			if (!name) throw new Error('请填写文件名');
			if (isCfg && !/\.ya?ml$/.test(name)) name += '.yaml';
			try { await P('file_save', { kind, name, content: t.value }); }
			catch (e) { if (/校验没通过/.test(e.message) && await confirmBox('格式检查没通过', e.message + '\n\n仍然要保存吗？', '强制保存', true)) await P('file_save', { kind, name, content: t.value, force: true }); else throw e; }
			close(true); toast('已保存'); S.state = null; refresh(true);
		});
	});
}
const BK = [
	['config', '仅配置', '插件设置、配置文件、自定义规则、覆写（推荐，体积小）'],
	['ex_core', '不含内核', '除内核外的全部文件，含 GEO 数据库'],
	['all', '全部', '包含内核，体积较大'],
	['core', '仅内核', ''], ['rule', '仅规则集', ''], ['proxy', '仅代理集', ''],
];
function renderBackup(box) {
	box.innerHTML = `<div class="hero"><h1>备份与恢复</h1><p class="muted" style="margin-bottom:0">备份会打包成 .tar.gz 下载到手机，链接 10 分钟后失效。</p></div>
		<div class="sectitle"><b>备份</b></div>
		<section class="card list">${BK.map(([k, t, d]) => `<button class="file" data-bk="${k}"><div><b>${t}</b>${d ? `<span class="muted">${d}</span>` : ''}</div><span class="pill blue">下载</span></button>`).join('')}</section>
		<div class="sectitle"><b>恢复</b></div>
		<section class="card"><p class="muted" style="margin-top:0">选择之前下载的 OpenClash 备份（.tar.gz，3MB 以内）。恢复前会自动保存一份当前设置。</p><button class="btn primary" data-rs style="width:100%;padding:12px">从手机选择备份文件</button></section>
		<div class="sectitle"><b>重置</b></div>
		<section class="card"><p class="muted" style="margin-top:0">把 OpenClash 的设置还原为安装时的默认值（配置文件不会删除）。</p><button class="btn danger" data-reset style="width:100%;padding:12px">恢复默认设置</button></section>`;
	box.onclick = async (e) => {
		const b = e.target.closest('[data-bk]');
		if (b) return busy(b.querySelector('.pill'), async () => { const r = await P('backup_file', { scope: b.dataset.bk }, 90000); download(r.url, r.name); toast(`备份已生成（${B(r.size)}），开始下载`); }, false);
		if (e.target.closest('[data-rs]')) {
			const f = await pickFile('.gz,.tgz,application/gzip,application/x-gzip'); if (!f) return;
			if (f.size > 2.9 * 1024 * 1024) return toast('文件超过 3MB，手机上传不了，请在电脑版 LuCI 恢复', true);
			if (!(await confirmBox('恢复备份', `用「${f.name}」覆盖当前的 OpenClash 设置和文件，然后重启 OpenClash。`, '恢复并重启', true))) return;
			return busy(e.target.closest('[data-rs]'), async () => { const b64 = await readB64(f); await P('restore', { b64, restart: true }, 90000); toast('已恢复，OpenClash 正在重启'); S.state = null; watchJobs(); }, '恢复中');
		}
		if (e.target.closest('[data-reset]')) {
			if (!(await confirmBox('恢复默认设置', 'OpenClash 会被停止，所有插件设置还原为默认值。之后需要重新选择配置文件并启动。\n当前设置会先备份到路由器。', '继续', true))) return;
			if (!(await confirmBox('再确认一次', '确定要把 OpenClash 恢复为默认设置吗？', '确定恢复', true))) return;
			return busy(e.target.closest('[data-reset]'), async () => { await P('oc_reset', { confirm: 'RESET' }); toast('已恢复默认设置，OpenClash 已停止'); S.state = null; });
		}
	};
}
async function renderRuleProviders(el) {
	let r; try { r = await P('providers'); } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
	el.innerHTML = r.rules.length ? r.rules.map((p) => `<div class="file" data-rp="${esc(p.name)}"><div><b>${esc(p.name)}</b><span class="muted">${p.count} 条 · ${esc(p.behavior)} · ${esc(p.vehicle)} · ${ago(p.updated)}</span></div>${p.vehicle === 'HTTP' ? '<button class="btn sm blue" data-u>更新</button>' : ''}</div>`).join('') : '<div class="empty">当前配置没有使用规则集（rule-providers）</div>';
	el.onclick = (e) => { const u = e.target.closest('[data-u]'); if (!u) return; const name = u.closest('[data-rp]').dataset.rp; busy(u, async () => { await P('provider_update', { kind: 'rules', name }, 90000); toast('已更新 ' + name); renderRuleProviders(el); }); };
}


/* =====================================================================
   插件设置 / 覆写设置（通用分页表单）
   ===================================================================== */
function sectionList({ el, title, desc, items, rowHtml, onAdd, onEdit, onMove, addLabel }) {
	el.innerHTML = `<div class="sectitle"><b>${esc(title)}</b><button class="btn sm primary" data-add>＋ ${esc(addLabel || '添加')}</button></div>
		${desc ? `<p class="muted" style="margin:0 2px 8px">${esc(desc)}</p>` : ''}
		<section class="card list">${items.length ? items.map((it, i) => `<div class="file" data-r="${i}" style="cursor:pointer">${rowHtml(it, i)}${onMove ? `<div class="actions" style="flex-wrap:nowrap"><button class="btn sm" data-up ${i ? '' : 'disabled'}>↑</button><button class="btn sm" data-dn ${i < items.length - 1 ? '' : 'disabled'}>↓</button></div>` : '<span class="muted">›</span>'}</div>`).join('') : '<div class="empty">还没有条目</div>'}</section>`;
	el.querySelector('[data-add]').onclick = onAdd;
	el.querySelector('.list').onclick = (e) => {
		const row = e.target.closest('[data-r]'); if (!row) return;
		const it = items[+row.dataset.r];
		const up = e.target.closest('[data-up]'), dn = e.target.closest('[data-dn]');
		if (up || dn) { e.stopPropagation(); return busy(up || dn, () => onMove(it, up ? 'up' : 'down')); }
		if (e.target.closest('.sw')) return;
		onEdit(it);
	};
}

function specialSettings(page) {
	return (o, i, form) => {
		switch (o.cls) {
		case 'openclash/switch_mode':
		case 'openclash/oix_login':
			return o.cls === 'openclash/oix_login' ? '<div class="notice">oixCloud 是第三方云端账号服务，需要网页登录授权，手机面板里不提供。如需使用请在电脑版 LuCI 的「插件设置 → oixCloud」里登录。</div>' : '';
		case 'openclash/flush_dns_cache':
			return `<div class="fld row" style="border:0;padding:0"><div class="lb"><b>${esc(o.t || '清理 DNS 缓存')}</b><div class="ds">清空内核的 DNS 缓存和 Fake-IP 缓存</div></div><button class="btn blue" type="button" data-qa="flush_dns">清理</button></div>`;
		case 'openclash/flush_smart_cache':
			return `<div class="fld row" style="border:0;padding:0"><div class="lb"><b>${esc(o.t || '清理 Smart 缓存')}</b></div><button class="btn blue" type="button" data-qa="flush_smart">清理</button></div>`;
		case 'openclash/other_stream_option': {
			const k = UNLOCK_BY_LABEL[o.o];
			return `<div class="fld row" style="border:0;padding:0"><div class="lb"><b>${esc(o.o)} 手动测试</b><div class="ds" data-ures="${esc(k || '')}">用当前节点检测解锁情况</div></div><button class="btn blue" type="button" data-unl="${esc(k || '')}">检测</button></div>`;
		}
		case 'openclash/switch_dashboard':
			return `<div data-dash="${esc(o.o)}"><div class="lb"><b>${esc(o.t)}</b><div class="ds">读取中…</div></div></div>`;
		case 'openclash/update':
			return `<div data-ver><div class="lb"><b>版本更新</b><div class="ds">点「检查更新」查看最新版本</div></div><div class="rowbtns"><button class="btn sm blue" type="button" data-vchk>检查更新</button><button class="btn sm" type="button" data-qa="update_core" data-cf="更新内核后 OpenClash 会自动重启。">更新内核</button><button class="btn sm" type="button" data-qa="update_plugin" data-cf="更新插件后 OpenClash 会自动重启。">更新插件</button><button class="btn sm primary" type="button" data-qa="one_key_update" data-cf="同时更新插件和内核，完成后自动重启。">一键更新</button></div></div>`;
		case 'openclash/debug':
			return `<div class="lb"><b>内核测试与诊断</b><div class="ds">生成的调试日志可以发给开发者排查问题（已自动隐藏订阅地址等敏感信息）</div></div><div class="rowbtns"><button class="btn sm blue" type="button" data-diag="conn">连接诊断</button><button class="btn sm blue" type="button" data-diag="dns">DNS 诊断</button><button class="btn sm" type="button" data-qa="debug">生成调试日志</button></div>`;
		}
		return null;
	};
}
async function onSpecialClick(e, page, box) {
	const qa = e.target.closest('[data-qa]');
	if (qa) {
		if (qa.dataset.cf && !(await confirmBox(qa.textContent, qa.dataset.cf, qa.textContent))) return;
		return busy(qa, async () => {
			const r = await P('quick', { action: qa.dataset.qa }, 120000);
			if (r.text != null) textBox('调试日志', r.text || '（空）'); else toast(r.msg || '已完成');
			if (/update|one_key/.test(qa.dataset.qa)) watchJobs();
		}, false);
	}
	const un = e.target.closest('[data-unl]');
	if (un) { const k = un.dataset.unl; if (!k) return toast('未知服务', true); const ds = box.querySelector(`[data-ures="${k}"]`); return busy(un, async () => { const r = await P('unlock', { services: [k] }, 100000); const x = r.results[0] || {}; const s = ust(x.st, k); ds.innerHTML = `<span class="pill ${s[1]}">${s[0]}${x.region ? ' · ' + esc(x.region) : ''}</span> ${esc(x.node || '')}`; }); }
	const dg = e.target.closest('[data-diag]');
	if (dg) return diagSheet(dg.dataset.diag);
	const vc = e.target.closest('[data-vchk]');
	if (vc) return busy(vc, async () => {
		const r = await P('versions', { force: true }, 60000);
		const L = r.latest || {};
		const pick = (o) => typeof o === 'string' ? o : o && (o.version || o.tag || o.latest) || '';
		const core = pick(L.core_meta || L.meta || L.core), plug = pick(L.plugin || L.luci || L.openclash);
		vc.closest('[data-ver]').querySelector('.ds').innerHTML = `内核：${esc(r.core || '—')}${core ? ' → 最新 ' + esc(core) : ''}<br>插件：${esc(r.plugin || '—')}${plug ? ' → 最新 ' + esc(plug) : ''}<br>更新分支：${esc(r.branch)}`;
	});
	const db = e.target.closest('[data-dop]');
	if (db) {
		const name = db.closest('[data-dash]').dataset.dash, op = db.dataset.dop;
		if (op === 'delete' && !(await confirmBox('删除 ' + name, '删除这个控制面板的文件。', '删除', true))) return;
		return busy(db, async () => { await P('dashboard', { name, op, type: db.dataset.t }, 120000); toast(op === 'default' ? '已设为默认' : op === 'delete' ? '已删除' : '已下载'); S.dash = null; renderDash(box); });
	}
}
async function renderDash(box) {
	const els = $$('[data-dash]', box); if (!els.length) return;
	try { S.dash = S.dash || await P('dashboard_state'); } catch (e) { return; }
	const d = S.dash;
	els.forEach((el) => {
		const n = el.dataset.dash, k = n.toLowerCase(), inst = d.installed[k];
		const t = n === 'Dashboard' ? d.dashboard_type : n === 'Yacd' ? d.yacd_type : 'Official';
		const sw = n === 'Dashboard' || n === 'Yacd';
		el.innerHTML = `<div class="lb"><b>${esc(n)}</b><div class="ds">${inst ? '已安装' + (sw ? '（' + (t === 'Meta' ? 'Meta 版' : '官方版') + '）' : '') : '未安装'}${d.default_dashboard === k ? ' · 默认' : ''}${inst ? ` · <a href="http://${esc(d.lan_ip)}:${esc(d.port)}/ui/${k}/" target="_blank" rel="noopener">打开</a>` : ''}</div></div>
			<div class="rowbtns">${sw ? `<button class="btn sm blue" type="button" data-dop="switch" data-t="${t === 'Meta' ? 'Official' : 'Meta'}">${inst ? '切换为' + (t === 'Meta' ? '官方版' : 'Meta 版') : '下载 Meta 版'}</button>` : `<button class="btn sm blue" type="button" data-dop="switch" data-t="Official">${inst ? '更新' : '下载'}</button>`}
			${inst && d.default_dashboard !== k ? '<button class="btn sm" type="button" data-dop="default">设为默认</button>' : ''}${inst ? '<button class="btn sm danger" type="button" data-dop="delete">删除</button>' : ''}</div>`;
	});
}

let setTab = store.get('rp_settab') || 'op_mode';
let setForm = null;
async function loadSet(quiet) {
	if (quiet && setForm && setForm.count()) return;
	const [sc, st] = await Promise.all([schema('settings'), state(!quiet)]);
	setStatus(true, '在线');
	const main = sc.sections.find((s) => s.stype === 'openclash');
	const lan = sc.sections.find((s) => s.stype === 'lan_ac_traffic');
	const tabs = (main.taborder || Object.keys(main.tabs)).filter((t) => main.opts.some((o) => o.tab === t));
	if (!tabs.includes(setTab)) setTab = tabs[0];
	$('setSeg').innerHTML = tabs.map((t) => `<button class="chip ${t === setTab ? 'on' : ''}" data-t="${t}">${esc(main.tabs[t])}</button>`).join('');
	$('setSeg').onclick = async (e) => {
		const b = e.target.closest('[data-t]'); if (!b || b.dataset.t === setTab) return;
		setTab = b.dataset.t; store.set('rp_settab', setTab);
		$$('#setSeg .chip').forEach((x) => x.classList.toggle('on', x === b));
		b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
		renderSetTab(main, lan);
	};
	setForm = new Form(main.opts, st.cfg, {
		special: specialSettings('settings'),
		onButton: async (o, btn) => {
			if (/Update$/.test(o.o) && !(await confirmBox(o.t || o.o, '在后台下载更新。只要有新版本，OpenClash 会自动重启加载，全家断网 10–30 秒。', '开始更新'))) return;
			busy(btn, async () => { await P('oc_button', { page: 'settings', option: o.o }, 110000); toast('已执行：' + (o.t || o.o)); if (/Update/.test(o.o)) watchJobs(); }, false);
		},
	});
	DIRTY.set = () => setForm && setForm.count() > 0;
	renderSetTab(main, lan);
}
function renderSetTab(main, lan) {
	const box = $('setBody');
	const form = setForm;
	box.innerHTML = `<section class="card list" data-form>${form.html((o) => o.tab === setTab)}</section><div data-extra></div>`;
	form.root = null;
	const f = box.querySelector('[data-form]');
	form.mount(f);
	f.addEventListener('click', (e) => onSpecialClick(e, 'settings', box));
	renderDash(box);
	if (setTab === 'lan_ac' && lan) renderLanAc(box.querySelector('[data-extra]'), lan);
	box.appendChild(saveBar(form, (restart) => saveMain(form, restart), { onUndo: () => { const n = new Form(main.opts, form.orig, form.cfg); n.files = Object.assign({}, form.fileOrig); n.fileOrig = Object.assign({}, form.fileOrig); setForm = n; renderSetTab(main, lan); } }));
}
async function renderLanAc(el, lan) {
	const r = await P('oc_sections', { type: 'lan_ac_traffic' });
	const items = r.sections;
	sectionList({
		el, title: lan.title || '来源流量访问控制', desc: lan.desc, items, addLabel: '添加规则',
		rowHtml: (s) => `<div><b>${esc(s.comment || s.src_ip || '（未命名）')}</b><span class="muted">${esc([s.src_ip, s.src_port && '端口 ' + s.src_port, s.proto, s.target && s.target.toUpperCase()].filter(Boolean).join(' · '))}${s.enabled === '0' ? ' · 已停用' : ''}</span></div>`,
		onAdd: () => sectionSheet({ title: '添加访问控制规则', opts: lan.opts, type: 'lan_ac_traffic', after: () => renderLanAc(el, lan) }),
		onEdit: (s) => sectionSheet({ title: '编辑访问控制规则', opts: lan.opts, values: s, type: 'lan_ac_traffic', sid: s.sid, after: () => renderLanAc(el, lan) }),
		onMove: async (s, dir) => { await P('oc_move', { sid: s.sid, dir }); renderLanAc(el, lan); },
	});
}

/* 覆写设置 */
let owTab = store.get('rp_owtab') || 'settings';
let owForm = null;
const OW_EXTRA = [['dns_servers', '自定义 DNS 服务器'], ['authentication', '认证信息'], ['modules', '覆写模块']];
async function loadOw(quiet) {
	if (quiet && owForm && owForm.count()) return;
	const [sc, st] = await Promise.all([schema('config-overwrite'), state(!quiet)]);
	setStatus(true, '在线');
	const main = sc.sections.find((s) => s.stype === 'openclash');
	const tabs = (main.taborder || Object.keys(main.tabs)).filter((t) => main.opts.some((o) => o.tab === t));
	const all = tabs.map((t) => [t, main.tabs[t]]).concat(OW_EXTRA);
	if (!all.some(([t]) => t === owTab)) owTab = tabs[0];
	$('owSeg').innerHTML = all.map(([t, n]) => `<button class="chip ${t === owTab ? 'on' : ''}" data-t="${t}">${esc(n)}</button>`).join('');
	$('owSeg').onclick = async (e) => {
		const b = e.target.closest('[data-t]'); if (!b || b.dataset.t === owTab) return;
		owTab = b.dataset.t; store.set('rp_owtab', owTab);
		$$('#owSeg .chip').forEach((x) => x.classList.toggle('on', x === b));
		b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
		renderOwTab(sc, main);
	};
	owForm = new Form(main.opts, st.cfg, {
		special: specialSettings('config-overwrite'),
		onButton: async (o, btn) => {
			if (/Update$/.test(o.o) && !(await confirmBox(o.t || o.o, '在后台下载更新。只要有新版本，OpenClash 会自动重启加载，全家断网 10–30 秒。', '开始更新'))) return;
			busy(btn, async () => { await P('oc_button', { page: 'config-overwrite', option: o.o }, 110000); toast('已执行：' + (o.t || o.o)); if (/Update/.test(o.o)) watchJobs(); }, false);
		},
	});
	DIRTY.ow = () => owForm && owForm.count() > 0;
	renderOwTab(sc, main);
}
function renderOwTab(sc, main) {
	const box = $('owBody');
	box.onclick = null;
	if (owTab === 'dns_servers') return renderDnsServers(box, sc);
	if (owTab === 'authentication') return renderAuth(box, sc);
	if (owTab === 'modules') return renderModules(box);
	const form = owForm;
	box.innerHTML = `<section class="card list" data-form>${form.html((o) => o.tab === owTab)}</section>`;
	form.root = null;
	const f = box.querySelector('[data-form]');
	form.mount(f);
	f.addEventListener('click', (e) => onSpecialClick(e, 'config-overwrite', box));
	box.appendChild(saveBar(form, (restart) => saveMain(form, restart), { onUndo: () => { const n = new Form(main.opts, form.orig, form.cfg); n.files = Object.assign({}, form.fileOrig); n.fileOrig = Object.assign({}, form.fileOrig); owForm = n; renderOwTab(sc, main); } }));
}
async function renderDnsServers(box, sc) {
	const r = await P('oc_sections', { type: 'dns_servers' });
	const ed = await schema('custom-dns-edit');
	const opts = [{ o: 'enabled', cls: 'fvalue', t: '启用', en: '1', dis: '0', def: '1' }].concat(ed.sections[0].opts);
	const st = await state();
	const G = { nameserver: 'NameServer', fallback: 'FallBack', default: 'Default' };
	box.innerHTML = `<div class="notice ${st.cfg.enable_custom_dns === '1' ? '' : 'w'}" style="margin-bottom:4px">${st.cfg.enable_custom_dns === '1' ? '「自定义上游 DNS 服务器」已开启，下面的列表正在生效。' : '「自定义上游 DNS 服务器」没有开启（在「DNS 设置」里），下面的列表暂不生效。'}</div><div data-l></div>`;
	sectionList({
		el: box.querySelector('[data-l]'), title: 'DNS 服务器', items: r.sections, addLabel: '添加',
		rowHtml: (s) => `<div style="display:flex;gap:10px;align-items:center;min-width:0"><i class="dot ${s.enabled !== '0' ? 'on' : ''}"></i><div style="min-width:0"><b class="mono">${esc((s.type || 'udp') + '://' + (s.ip || '?') + (s.port ? ':' + s.port : ''))}</b><span class="muted">${esc(G[s.group] || s.group || '')}${s.enabled === '0' ? ' · 已停用' : ''}${s.specific_group && s.specific_group !== 'Disable' ? ' · 走 ' + esc(s.specific_group) : ''}</span></div></div>`,
		onAdd: () => sectionSheet({ title: '添加 DNS 服务器', opts, type: 'dns_servers', after: () => renderDnsServers(box, sc) }),
		onEdit: (s) => sectionSheet({ title: '编辑 DNS 服务器', opts, values: s, type: 'dns_servers', sid: s.sid, after: () => renderDnsServers(box, sc) }),
		onMove: async (s, dir) => { await P('oc_move', { sid: s.sid, dir }); renderDnsServers(box, sc); },
	});
}
async function renderAuth(box, sc) {
	const sec = sc.sections.find((s) => s.stype === 'authentication');
	const r = await P('oc_sections', { type: 'authentication' });
	sectionList({
		el: box, title: sec.title || '认证信息', desc: 'HTTP / SOCKS5 代理端口的登录用户名和密码。', items: r.sections, addLabel: '添加',
		rowHtml: (s) => `<div style="display:flex;gap:10px;align-items:center"><i class="dot ${s.enabled !== '0' ? 'on' : ''}"></i><div><b>${esc(s.username || '（空）')}</b><span class="muted">密码 ${s.password ? '••••••' : '未设置'}</span></div></div>`,
		onAdd: () => sectionSheet({ title: '添加认证信息', opts: sec.opts, type: 'authentication', after: () => renderAuth(box, sc) }),
		onEdit: (s) => sectionSheet({ title: '编辑认证信息', opts: sec.opts, values: s, type: 'authentication', sid: s.sid, after: () => renderAuth(box, sc) }),
	});
}
const MOD_OPTS = [
	{ o: 'enable', cls: 'fvalue', t: '启用', en: '1', dis: '0', def: '0' },
	{ o: 'name', cls: 'value', t: '模块名', d: '同时也是 /etc/openclash/overwrite/ 下的文件名，只能用字母、数字、点、下划线和横线' },
	{ o: 'type', cls: 'lvalue', t: '来源', k: ['http', 'file'], v: ['订阅地址（自动下载）', '本地文件（手动编辑）'], def: 'http' },
	{ o: 'url', cls: 'value', t: '订阅地址', dep: [{ type: 'http' }], ph: 'https://…' },
	{ o: 'update_days', cls: 'lvalue', t: '自动更新（星期）', dep: [{ type: 'http' }], k: ['off', '*', '1', '2', '3', '4', '5', '6', '0'], v: ['不自动更新', '每天', '每周一', '每周二', '每周三', '每周四', '每周五', '每周六', '每周日'], def: 'off' },
	{ o: 'update_hour', cls: 'lvalue', t: '自动更新（时间）', dep: [{ type: 'http' }], k: ['off'].concat([...Array(24).keys()].map(String)), v: ['不指定'].concat([...Array(24).keys()].map((h) => h + ':00')), def: 'off' },
	{ o: 'config', cls: 'dynlist', t: '生效的配置文件', d: '填配置文件名（支持通配，如 * 表示全部配置）。留空时这个模块不会生效。' },
	{ o: 'param', cls: 'value', t: '参数', d: '传给模块的参数（可选）' },
	{ o: 'order', cls: 'value', t: '执行顺序', d: '数字越小越先执行', dt: 'uinteger' },
];
async function renderModules(box) {
	const r = await P('oc_sections', { type: 'config_overwrite' });
	const files = (await P('files', { kind: 'overwrite' })).files || [];
	const items = r.sections.slice().sort((a, b) => (+a.order || 0) - (+b.order || 0));
	box.innerHTML = '<div data-l></div><div class="sectitle"><b>模块文件</b><span class="pill">' + files.length + ' 个</span></div><section class="card list" data-f>' +
		(files.length ? files.map((f) => `<button class="file" data-fn="${esc(f.name)}"><div><b>${esc(f.name)}</b><span class="muted">${B(f.size)} · ${ts(f.mtime)}${items.some((s) => s.name === f.name) ? '' : ' · 未登记'}</span></div><span class="muted">编辑 ›</span></button>`).join('') : '<div class="empty">没有模块文件</div>') + '</section>';
	sectionList({
		el: box.querySelector('[data-l]'), title: '覆写模块', desc: '覆写模块会在启动时按顺序修改配置文件（例如添加规则、改 DNS）。', items, addLabel: '新建模块',
		rowHtml: (s) => `<div style="min-width:0;flex:1"><b>${esc(s.name)}</b><span class="muted">${s.type === 'file' ? '本地文件' : maskUrl(s.url)} · 顺序 ${esc(s.order ?? '—')}${Array.isArray(s.config) ? ' · ' + esc(s.config.join('、')) : s.config ? ' · ' + esc(s.config) : ''}</span></div><label class="sw" data-mod="${esc(s.sid)}"><input type="checkbox" ${s.enable === '1' ? 'checked' : ''}><i></i></label>`,
		onAdd: () => modSheet(null, box),
		onEdit: (s) => modSheet(s, box),
	});
	box.querySelector('[data-l] .list').addEventListener('change', async (e) => {
		const sw = e.target.closest('[data-mod]'); if (!sw) return;
		const en = sw.querySelector('input');
		try { await P('oc_sec', { op: 'edit', type: 'config_overwrite', sid: sw.dataset.mod, values: { enable: en.checked ? '1' : '0' } }); toast((en.checked ? '已启用' : '已停用') + '（重启 OpenClash 后生效）'); }
		catch (x) { en.checked = !en.checked; handleErr(x); }
	});
	box.querySelector('[data-f]').onclick = (e) => { const b = e.target.closest('[data-fn]'); if (b) editFile('overwrite', b.dataset.fn, false, { after: () => renderModules(box) }); };
}
async function modSheet(s, box) {
	const extra = s ? `<div class="btngrid"><button class="btn blue" type="button" data-mf>编辑模块内容</button>${s.type !== 'file' && s.url ? '<button class="btn" type="button" data-mr>从订阅地址重新下载</button>' : ''}</div>` : '';
	const opts = s ? MOD_OPTS.map((o) => o.o === 'name' ? Object.assign({}, o, { cls: 'dvalue' }) : o) : MOD_OPTS;
	const p = sectionSheet({ title: s ? '编辑覆写模块' : '新建覆写模块', opts, values: s || { type: 'file', config: ['*'] }, type: 'config_overwrite', sid: s && s.sid, extra,
		after: async (sid, form) => {
			if (!s && sid && form) {
				const name = form.str('name');
				if (form.str('type') === 'http' && form.str('url')) { try { await P('overwrite_fetch', { sid }); toast('模块已下载'); } catch (e) { handleErr(e); } }
				else if (name) { try { await P('file_save', { kind: 'overwrite', name, content: '# 在这里写覆写内容\n' }); } catch (e) {} }
			}
			renderModules(box);
		} });
	setTimeout(() => {
		const mb = $$('.modalbox').pop(); if (!mb) return;
		const mf = mb.querySelector('[data-mf]'), mr = mb.querySelector('[data-mr]');
		if (mf) mf.onclick = () => editFile('overwrite', s.name, false, { after: () => renderModules(box) });
		if (mr) mr.onclick = () => busy(mr, async () => { const r = await P('overwrite_fetch', { sid: s.sid }, 60000); toast('已下载（' + B(r.size) + '）'); });
	}, 50);
	return p;
}


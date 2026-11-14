/* =====================================================================
   通用表单：直接用 OpenClash 自己的选项定义（路由器上实时读取）渲染
   ===================================================================== */
const FILE_TITLES = {
	'openclash_custom_domain_dns.list': '第二 DNS 服务器的域名列表',
	'openclash_custom_firewall_rules.sh': '自定义防火墙规则（脚本）',
	'openclash_custom_fallback_filter.yaml': 'Fallback-Filter 内容',
	'openclash_custom_fake_filter.list': 'Fake-IP-Filter 列表',
	'openclash_custom_domain_dns_policy.list': 'Nameserver-Policy 列表',
	'openclash_custom_proxy_server_dns_policy.list': 'Proxy-Server-Nameserver-Policy 列表',
	'openclash_custom_hosts.list': 'Hosts 列表',
	'openclash_custom_sniffer.yaml': '自定义嗅探设置',
	'openclash_custom_rules.list': '自定义规则（优先匹配）',
	'openclash_custom_rules_2.list': '自定义规则（候补匹配）',
};
const UNLOCK = { netflix: 'Netflix', disney: 'Disney Plus', ytb: 'YouTube Premium', prime_video: 'Amazon Prime Video', hbo_max: 'HBO Max', tvb: 'TVB Anywhere+', dazn: 'DAZN', paramount: 'Paramount Plus', discovery: 'Discovery Plus', bilibili: 'Bilibili', google: 'Google', openai: 'OpenAI', claude: 'Claude', gemini: 'Gemini', bahamut: 'Bahamut Anime', spotify: 'Spotify', steam: 'Steam' };
const UNLOCK_BY_LABEL = Object.fromEntries(Object.entries(UNLOCK).map(([k, v]) => [v, k]));

let fid = 0;
class Form {
	constructor(opts, values, cfg = {}) {
		this.opts = opts;
		this.vals = Object.assign({}, values || {});
		this.orig = Object.assign({}, values || {});
		this.dirty = {};
		this.files = {};
		this.fileOrig = {};
		this.cfg = cfg;
		this.id = 'f' + (++fid);
	}
	raw(name) {
		if (name in this.vals && this.vals[name] != null) return this.vals[name];
		const o = this.opts.find((x) => x.o === name && x.cls !== 'button' && !/^openclash\//.test(x.cls));
		return o && o.def != null ? o.def : '';
	}
	str(name) { const v = this.raw(name); return Array.isArray(v) ? v.join(' ') : String(v); }
	list(name) { const v = this.raw(name); return Array.isArray(v) ? v.slice() : v === '' || v == null ? [] : [String(v)]; }
	visible(o) {
		if (!o.dep || !o.dep.length) return true;
		return o.dep.some((d) => Object.keys(d).every((k) => this.str(k) === String(d[k])));
	}
	before(name) {
		if (this.orig[name] != null) return this.orig[name];
		const o = this.opts.find((x) => x.o === name && x.cls !== 'button' && !/^openclash\//.test(x.cls));
		return o && o.def != null ? o.def : '';
	}
	set(name, v) {
		this.vals[name] = v;
		const was = this.before(name);
		const norm = (x) => Array.isArray(x) ? JSON.stringify(x) : JSON.stringify(x == null ? '' : String(x));
		const empty = (x) => x === '' || x == null || (Array.isArray(x) && !x.length);
		if (norm(was) === norm(v) || (empty(was) && empty(v))) delete this.dirty[name];
		else this.dirty[name] = v;
		this.changed();
	}
	changed() {
		if (this.root) {
			$$('[data-i]', this.root).forEach((row) => {
				const o = this.opts[+row.dataset.i];
				row.classList.toggle('hidden', !this.visible(o));
				row.classList.toggle('dirty', !!((o.o && o.o in this.dirty) || (o.file && this.fileDirty(o.file))));
			});
		}
		if (this.cfg.onChange) this.cfg.onChange(this);
	}
	fileDirty(f) { return f in this.files && this.files[f] !== this.fileOrig[f]; }
	count() { return Object.keys(this.dirty).length + Object.keys(this.files).filter((f) => this.fileDirty(f)).length; }
	title(o) {
		let t = o.t || '';
		if (!t && o.file) t = FILE_TITLES[base(o.file)] || base(o.file);
		const star = t.startsWith('*');
		if (star) t = t.slice(1);
		return (star ? '<span class="star">*</span>' : '') + esc(t);
	}
	desc(o) { return o.d ? `<div class="ds">${esc(o.d)}</div>` : ''; }
	row(o, i) {
		const name = o.o, id = this.id + '_' + i;
		const lab = `<div class="lb"><b>${this.title(o)}</b>${this.desc(o)}</div>`;
		const wrap = (cls, inner) => `<div class="fld ${cls}" data-i="${i}" data-o="${esc(name || '')}">${inner}</div>`;
		const sp = this.cfg.special && this.cfg.special(o, i, this);
		if (sp !== undefined && sp !== null) return sp === '' ? '' : wrap('', sp);
		switch (o.cls) {
		case 'fvalue': {
			const on = this.str(name) === String(o.en ?? '1');
			return wrap('row', lab + `<label class="sw"><input type="checkbox" data-f="flag" ${on ? 'checked' : ''}><i></i></label>`);
		}
		case 'lvalue': {
			const cur = this.str(name);
			const ks = o.k || [], vs = o.v || [];
			let opts = ks.map((k, j) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(vs[j] || k || '（不指定）')}</option>`).join('');
			if (cur !== '' && !ks.includes(cur)) opts = `<option value="${esc(cur)}" selected>${esc(cur)}</option>` + opts;
			if (cur === '' && !ks.includes('')) opts = `<option value="" selected>（未设置）</option>` + opts;
			return wrap('', lab + `<div class="ctl"><select class="input" data-f="sel">${opts}</select></div>`);
		}
		case 'value': {
			const dl = o.k && o.k.length ? `<datalist id="${id}">${o.k.map((k, j) => `<option value="${esc(k)}">${esc(o.v[j])}</option>`).join('')}</datalist>` : '';
			const sens = /password|secret|token/i.test(name);
			const quick = o.k && o.k.length && o.k.length <= 8 ? `<div class="chips" style="margin-top:6px">${o.k.map((k, j) => `<button class="chip" type="button" data-pick="${esc(k)}">${esc(o.v[j] || k)}</button>`).join('')}</div>` : '';
			return wrap('', lab + `<div class="ctl"><input class="input" data-f="txt" ${dl ? `list="${id}"` : ''} value="${esc(this.str(name))}" placeholder="${esc(o.ph || o.def || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" ${sens ? 'type="text" style="-webkit-text-security:disc"' : ''}>${dl}${quick}</div>`);
		}
		case 'dynlist': {
			const items = this.list(name);
			const dl = o.k && o.k.length ? `<datalist id="${id}">${o.k.map((k, j) => `<option value="${esc(k)}">${esc(o.v[j])}</option>`).join('')}</datalist>` : '';
			return wrap('', lab + `<div class="ctl"><div class="tags">${items.map((x, j) => `<span class="tag"><span>${esc(x)}</span><button type="button" data-rm="${j}" aria-label="删除">×</button></span>`).join('') || '<span class="muted">（空）</span>'}</div>
				<div class="addrow"><input class="input" data-f="add" ${dl ? `list="${id}"` : ''} placeholder="${esc(o.ph || '输入后点添加')}" autocomplete="off" autocapitalize="off" spellcheck="false">${dl}<button class="btn blue" type="button" data-add>添加</button></div></div>`);
		}
		case 'mvalue': {
			const cur = this.str(name).split(/\s+/).filter(Boolean);
			return wrap('', lab + `<div class="ctl mchk">${(o.k || []).map((k, j) => `<label><input type="checkbox" data-f="multi" value="${esc(k)}" ${cur.includes(k) ? 'checked' : ''}>${esc(o.v[j])}</label>`).join('')}</div>`);
		}
		case 'tvalue': {
			const isFile = !!o.file;
			const v = isFile ? (this.files[o.file] ?? '') : this.str(name);
			return wrap('', lab + `<div class="ctl"><textarea class="input ${isFile ? '' : 'wrapit'}" data-f="${isFile ? 'file' : 'area'}" spellcheck="false" autocapitalize="off" placeholder="${isFile ? '读取中…' : esc(o.ph || '')}">${esc(v)}</textarea></div>`);
		}
		case 'dvalue':
			return wrap('row', lab + `<span class="val">${esc(this.str(name) || '—')}</span>`);
		case 'button':
			return wrap('row', lab + `<button class="btn blue" type="button" data-btn>执行</button>`);
		default:
			if (o.cls === '' || o.cls === 'cbi/value') return '';
			return '';
		}
	}
	html(filter) {
		return this.opts.map((o, i) => (!filter || filter(o)) ? this.row(o, i) : '').join('');
	}
	mount(root) {
		this.root = root;
		this.changed();
		root.addEventListener('click', (e) => {
			const ds = e.target.closest('.ds'); if (ds) { ds.classList.toggle('full'); return; }
			const row = e.target.closest('[data-i]'); if (!row) return;
			const o = this.opts[+row.dataset.i];
			const pick = e.target.closest('[data-pick]');
			if (pick) { const inp = row.querySelector('[data-f="txt"]'); inp.value = pick.dataset.pick; this.set(o.o, inp.value); return; }
			const rm = e.target.closest('[data-rm]');
			if (rm) { const l = this.list(o.o); l.splice(+rm.dataset.rm, 1); this.set(o.o, l); this.rerow(row); return; }
			if (e.target.closest('[data-add]')) { this.addItem(row, o); return; }
			const btn = e.target.closest('[data-btn]');
			if (btn && this.cfg.onButton) this.cfg.onButton(o, btn, this);
		});
		root.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && e.target.dataset.f === 'add') { e.preventDefault(); const row = e.target.closest('[data-i]'); this.addItem(row, this.opts[+row.dataset.i]); }
		});
		const onInput = (e) => {
			const el = e.target, f = el.dataset.f; if (!f) return;
			const row = el.closest('[data-i]'); if (!row) return;
			const o = this.opts[+row.dataset.i];
			if (f === 'flag') this.set(o.o, el.checked ? String(o.en ?? '1') : String(o.dis ?? '0'));
			else if (f === 'sel' || f === 'txt' || f === 'area') this.set(o.o, el.value);
			else if (f === 'multi') this.set(o.o, $$('[data-f="multi"]', row).filter((x) => x.checked).map((x) => x.value).join(' '));
			else if (f === 'file') { this.files[o.file] = el.value; this.changed(); }
		};
		root.addEventListener('input', onInput);
		root.addEventListener('change', onInput);
		this.loadFiles();
	}
	addItem(row, o) {
		const inp = row.querySelector('[data-f="add"]');
		const v = inp.value.trim(); if (!v) return;
		const l = this.list(o.o); if (!l.includes(v)) l.push(v);
		this.set(o.o, l); this.rerow(row);
	}
	rerow(row) {
		const i = +row.dataset.i;
		const t = document.createElement('div'); t.innerHTML = this.row(this.opts[i], i);
		const n = t.firstElementChild; row.replaceWith(n); this.changed();
		const a = n.querySelector('[data-f="add"]'); if (a) a.focus();
	}
	async loadFiles() {
		const need = this.opts.filter((o) => o.file && !(o.file in this.files) && /^\/etc\/openclash\/custom\//.test(o.file));
		for (const o of need) {
			try {
				const r = await P('file_read', { kind: 'custom', name: base(o.file) });
				this.files[o.file] = this.fileOrig[o.file] = r.content ?? '';
			} catch (e) { this.files[o.file] = this.fileOrig[o.file] = ''; }
			if (this.root) {
				$$('[data-i]', this.root).forEach((row) => {
					if (this.opts[+row.dataset.i] === o) { const ta = row.querySelector('textarea'); if (ta && document.activeElement !== ta) { ta.value = this.files[o.file]; ta.placeholder = '（空）'; } }
				});
			}
		}
	}
	async saveFiles(restartAfter) {
		const fs = Object.keys(this.files).filter((f) => this.fileDirty(f));
		for (const f of fs) {
			await P('file_save', { kind: 'custom', name: base(f), content: this.files[f], restart: false });
			this.fileOrig[f] = this.files[f];
		}
		return fs.length;
	}
	commit() { Object.assign(this.orig, this.dirty); this.dirty = {}; this.changed(); }
}

/* 保存条 */
function saveBar(form, onSave, opts = {}) {
	const bar = document.createElement('div');
	bar.className = 'savebar hidden';
	bar.innerHTML = `<span class="muted" data-n></span><div class="actions"><button class="btn sm" data-undo>撤销</button><button class="btn sm blue" data-save>保存</button>${opts.noRestart ? '' : '<button class="btn sm primary" data-apply>保存并应用</button>'}</div>`;
	const upd = () => { const n = form.count(); bar.classList.toggle('hidden', !n); bar.querySelector('[data-n]').textContent = `${n} 项修改`; };
	form.cfg.onChange = upd;
	bar.querySelector('[data-undo]').onclick = () => opts.onUndo && opts.onUndo();
	bar.querySelector('[data-save]').onclick = (e) => busy(e.currentTarget, () => onSave(false));
	const ap = bar.querySelector('[data-apply]');
	if (ap) ap.onclick = async (e) => {
		if (!(await confirmBox('保存并应用', '保存后会重启 OpenClash，全家网络中断 10–30 秒。', '保存并重启'))) return;
		busy(e.currentTarget, () => onSave(true));
	};
	upd();
	return bar;
}

/* 保存 openclash 主设置（uci + 对应的自定义文件） */
async function saveMain(form, restart) {
	const set = {};
	for (const [k, v] of Object.entries(form.dirty)) set[k] = Array.isArray(v) ? (v.length ? v : null) : v;
	const n = Object.keys(set).length;
	if (n) await P('oc_set', { set, restart: false });
	const nf = await form.saveFiles();
	form.commit();
	S.state = null;
	if (restart) { await P('quick', { action: 'restart' }); toast('已保存，OpenClash 正在重启'); setStatus(false, '重启中'); watchJobs(); }
	else toast(n + nf ? `已保存 ${n + nf} 项（重启 OpenClash 后生效）` : '没有修改');
}

/* 列表型条目（订阅、DNS 服务器、认证、黑白名单、覆写模块）的编辑弹窗 */
async function sectionSheet({ title, opts, values, type, sid, filter, special, onButton, after, extra }) {
	const form = new Form(opts, values || {}, { special, onButton });
	return modal(`<div class="sheethead"><h3>${esc(title)}</h3><button class="btn sm" data-v="false">取消</button></div>
		<div class="formgrid" data-form>${form.html(filter)}</div>${extra || ''}
		<div class="btngrid" style="margin:14px 0 0">${sid ? '<button class="btn danger" data-del>删除</button>' : '<button class="btn" data-v="false">取消</button>'}<button class="btn primary" data-ok>保存</button></div>`,
	(m, close) => {
		m.dataset.lock = '1';
		form.mount(m.querySelector('[data-form]'));
		const ok = m.querySelector('[data-ok]');
		ok.onclick = () => busy(ok, async () => {
			let values = {};
			if (sid) Object.assign(values, form.dirty);
			else form.opts.forEach((o) => { if (o.o && form.visible(o) && !/^(button|dvalue|openclash\/)/.test(o.cls) && !o.file) { const v = form.raw(o.o); if (v !== '' && !(Array.isArray(v) && !v.length)) values[o.o] = v; } });
			for (const k of Object.keys(values)) if (Array.isArray(values[k]) && !values[k].length) values[k] = null;
			if (!sid && !Object.keys(values).length) throw new Error('请至少填写一项');
			if (sid && !Object.keys(values).length && !form.count()) { close(true); return; }
			const r = await P('oc_sec', { op: sid ? 'edit' : 'add', type, sid, values });
			await form.saveFiles();
			close(true);
			toast(sid ? '已保存' : '已添加');
			S.state = null;
			if (after) after(r.sid || sid, form);
		});
		const del = m.querySelector('[data-del]');
		if (del) del.onclick = async () => {
			if (!(await confirmBox('删除' + title.replace(/^编辑/, ''), '删除后不能恢复。', '删除', true))) return;
			busy(del, async () => { await P('oc_sec', { op: 'delete', type, sid }); close(true); toast('已删除'); S.state = null; if (after) after(null); });
		};
	});
}


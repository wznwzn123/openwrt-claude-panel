/* =====================================================================
   订阅
   ===================================================================== */
const subCache = {};
async function subInfo(sid) {
	if (subCache[sid] && Date.now() - subCache[sid].t < 300000) return subCache[sid].v;
	const r = await P('sub_info', { sid }, 30000);
	const v = r.ok ? r : null;
	subCache[sid] = { t: Date.now(), v };
	return v;
}
function subInfoHtml(i, short) {
	const used = (i.upload || 0) + (i.download || 0), total = i.total || 0;
	const pct = total ? Math.min(100, Math.round(used / total * 100)) : 0;
	const exp = i.expire ? new Date(i.expire * 1000).toLocaleDateString('zh-CN') : '长期';
	if (short) return `${B(used)} / ${total ? B(total) : '∞'} · 到期 ${exp}`;
	return `<div class="bar flat ${pct >= 90 ? 'd' : pct >= 70 ? 'w' : ''}"><i style="width:${pct}%"></i></div><div class="muted">已用 ${B(used)} / ${total ? B(total) : '不限'}（${pct}%）· 到期 ${exp}</div>`;
}
function maskUrl(u) {
	u = String(u || '').split('\n')[0];
	try { const x = new URL(u); return x.host + (x.pathname.length > 1 ? x.pathname.slice(0, 12) + '…' : ''); } catch (e) { return u.slice(0, 28) + (u.length > 28 ? '…' : ''); }
}
async function loadSubs(quiet) {
	const st = await state(!quiet);
	setStatus(true, '在线');
	const subs = st.subs || [];
	$('subCount').textContent = subs.length + ' 个';
	const files = st.files || [];
	if (!subs.length) { $('subList').innerHTML = '<div class="card empty">还没有订阅，点右上角「＋ 添加」</div>'; return; }
	$('subList').innerHTML = subs.map((s, i) => {
		const f = files.find((x) => x.sub === s.name), on = s.enabled !== '0';
		return `<section class="card subcard" data-s="${i}">
			<div class="sechead"><div style="min-width:0"><b style="font-size:16px">${esc(s.name || '（未命名）')}</b>${f && f.active ? ' <span class="pill blue">正在使用</span>' : ''}
				<div class="sub" style="font-size:12.5px">${esc(maskUrl(s.address))}${s.sub_convert === '1' ? ' · 在线转换' : ''}</div></div>
				<label class="sw"><input type="checkbox" data-en ${on ? 'checked' : ''}><i></i></label></div>
			<div data-info class="muted" style="margin-top:8px">${f ? `配置文件 ${esc(f.name)} · ${B(f.size)} · ${ts(f.mtime)} 更新` : '还没有下载过'}</div>
			<div data-flow></div>
			<div class="rowbtns"><button class="btn sm blue" data-up>更新</button><button class="btn sm" data-flowbtn>查流量</button><button class="btn sm" data-ed>编辑</button>${f && !f.active ? '<button class="btn sm" data-use>使用这个配置</button>' : ''}</div>
		</section>`;
	}).join('');
}
$('subList').addEventListener('click', async (e) => {
	const card = e.target.closest('[data-s]'); if (!card) return;
	const st = await state(); const s = st.subs[+card.dataset.s]; if (!s) return;
	const t = e.target;
	if (t.closest('[data-up]')) {
		const f = (st.files || []).find((x) => x.sub === s.name);
		if (f && f.active && !(await confirmBox('更新订阅「' + s.name + '」', '这是正在使用的配置，更新完成后 OpenClash 会自动重启，断网 10–30 秒。', '更新'))) return;
		return busy(t.closest('[data-up]'), async () => { await P('sub_update', { name: s.name }); toast('「' + s.name + '」开始在后台更新'); watchJobs(); }, false);
	}
	if (t.closest('[data-flowbtn]')) return busy(t.closest('[data-flowbtn]'), async () => {
		delete subCache[s.sid];
		const i = await subInfo(s.sid);
		card.querySelector('[data-flow]').innerHTML = i ? subInfoHtml(i) : '<div class="muted">这个机场没有提供流量信息</div>';
	});
	if (t.closest('[data-ed]')) return editSub(s);
	if (t.closest('[data-use]')) {
		const f = (st.files || []).find((x) => x.sub === s.name);
		if (!(await confirmBox('切换配置', `切换到「${f.name}」并重启 OpenClash，断网 10–30 秒。`, '切换'))) return;
		return busy(t.closest('[data-use]'), async () => { await P('cfg_switch', { name: f.name }); toast('已切换，OpenClash 正在重启'); S.state = null; watchJobs(); });
	}
});
$('subList').addEventListener('change', async (e) => {
	const en = e.target.closest('[data-en]'); if (!en) return;
	const card = e.target.closest('[data-s]'); const st = await state(); const s = st.subs[+card.dataset.s];
	try { await P('oc_sec', { op: 'edit', type: 'config_subscribe', sid: s.sid, values: { enabled: en.checked ? '1' : '0' } }); s.enabled = en.checked ? '1' : '0'; toast(en.checked ? '已启用（更新全部订阅时会包含它）' : '已停用'); }
	catch (x) { en.checked = !en.checked; handleErr(x); }
});
async function editSub(s) {
	const sc = await schema('config-subscribe-edit');
	const sec = sc.sections.find((x) => x.stype === 'config_subscribe');
	const vals = s ? Object.assign({}, s) : {};
	await sectionSheet({
		title: s ? '编辑订阅' : '添加订阅', opts: sec.opts, values: vals, type: 'config_subscribe', sid: s && s.sid,
		special: (o) => {
			if (o.cls === 'openclash/generate_age') return `<div class="lb"><b>生成 Age 密钥</b><div class="ds">为加密订阅生成私钥和公钥</div></div><div class="rowbtns"><button class="btn sm blue" type="button" data-age="keygen">生成 x25519</button><button class="btn sm" type="button" data-age="pq">生成 PQ</button><button class="btn sm" type="button" data-agepub>由私钥算公钥</button></div>`;
			if (o.o === 'address') return null;
			return null;
		},
		after: async (sid, form) => {
			S.state = null;
			await loadSubs();
			if (!s && sid && form && await confirmBox('现在下载这个订阅吗？', '下载完成后会生成配置文件，可以在「配置文件」页切换使用。', '下载')) { await P('sub_update', { name: form.str('name') }); toast('开始下载'); watchJobs(); }
		},
	});
}
document.addEventListener('click', async (e) => {
	const a = e.target.closest('[data-age]'), p = e.target.closest('[data-agepub]');
	if (!a && !p) return;
	const box = e.target.closest('.modalbox');
	const fill = (name, v) => {
		$$('.fld', box).forEach((row) => {
			if (row.dataset.o !== name) return;
			const inp = row.querySelector('[data-f="txt"],[data-f="sel"],[data-f="area"]');
			if (!inp) return;
			if (inp.tagName === 'SELECT' && ![...inp.options].some((x) => x.value === v)) inp.add(new Option(v, v));
			inp.value = v; inp.dispatchEvent(new Event('change', { bubbles: true }));
		});
	};
	if (a) busy(a, async () => { const r = await P('age', { algo: a.dataset.age }); fill('config_age_secret', r.secret); if (r.public) fill('config_age_public', r.public); fill('config_age_algo', a.dataset.age); toast('已生成并填入'); });
	if (p) {
		const sec = $$('.fld', box).find((r) => r.dataset.o === 'config_age_secret');
		const v = sec && sec.querySelector('input').value.trim();
		if (!v) return toast('先填写私钥', true);
		busy(p, async () => { const r = await P('age', { op: 'public', secret: v }); fill('config_age_public', r.public); toast('已算出公钥'); });
	}
});
$('subAdd').onclick = () => editSub(null).catch(handleErr);
$('subUpdAll').onclick = (e) => updateSubs(e.currentTarget);
$('subAuto').onclick = async (e) => {
	await busy(e.currentTarget, async () => {
		const sc = await schema('config-subscribe'); const st = await state(true);
		const sec = sc.sections.find((x) => x.stype === 'openclash');
		const form = new Form(sec.opts, st.cfg);
		modal(`<div class="sheethead"><h3>订阅自动更新</h3><button class="btn sm" data-v="false">取消</button></div><div data-form>${form.html()}</div>
			<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-v="false">取消</button><button class="btn primary" data-ok>保存</button></div>`,
		(m, close) => { form.mount(m.querySelector('[data-form]')); const ok = m.querySelector('[data-ok]'); ok.onclick = () => busy(ok, async () => { await saveMain(form, false); close(true); }); });
	}, false);
};


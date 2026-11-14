/* =====================================================================
   规则
   ===================================================================== */
let ruTab = 'custom';
$('ruSeg').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; ruTab = b.dataset.k; $$('#ruSeg .chip').forEach((x) => x.classList.toggle('on', x === b)); refresh(); };
let ruOff = 0, ruKw = '';
async function loadRules(quiet) {
	const box = $('ruBody');
	if (quiet && ruTab === 'custom') return;
	if (ruTab === 'providers') { box.innerHTML = '<div class="sectitle"><b>规则集</b></div><section class="card list"><div class="empty">读取中…</div></section>'; return renderRuleProviders(box.querySelector('.list')); }
	if (ruTab === 'live') {
		if (!box.querySelector('[data-live]')) {
			box.innerHTML = `<section class="card" data-live><input class="input" data-kw placeholder="搜索规则，如 douyin、GEOIP、节点名" value="${esc(ruKw)}" autocomplete="off" autocapitalize="off" spellcheck="false"></section><div class="sectitle"><b>内核正在使用的规则</b><span class="pill" data-n>—</span></div><section class="card list" data-l></section><div class="btngrid" data-pg></div>`;
			let t; box.querySelector('[data-kw]').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { ruKw = e.target.value.trim(); ruOff = 0; loadRules(); }, 400); };
		}
		const r = await P('rules', { filter: ruKw || undefined, offset: ruOff, limit: 100 });
		setStatus(true, '在线');
		box.querySelector('[data-n]').textContent = (ruKw ? r.matched + ' / ' : '') + r.total + ' 条';
		box.querySelector('[data-l]').innerHTML = r.rules.length ? r.rules.map((x) => `<div class="kv"><span class="mono" style="color:var(--muted)">${x.i}</span><span style="text-align:left;flex:1"><b class="mono" style="font-weight:600">${esc(x.type)}</b> ${esc(x.payload)}${x.size > 0 ? ` <span class="muted">(${x.size})</span>` : ''}</span><span class="pill ${x.proxy === 'DIRECT' ? '' : x.proxy === 'REJECT' ? 'red' : 'blue'}" style="max-width:40%">${esc(x.proxy)}</span></div>`).join('') : '<div class="empty">没有匹配的规则</div>';
		const pg = box.querySelector('[data-pg]');
		pg.innerHTML = `<button class="btn" data-pv ${ruOff ? '' : 'disabled'}>上一页</button><button class="btn" data-nx ${ruOff + 100 < r.matched ? '' : 'disabled'}>下一页</button>`;
		pg.querySelector('[data-pv]').onclick = () => { ruOff = Math.max(0, ruOff - 100); loadRules(); scrollTo({ top: 0 }); };
		pg.querySelector('[data-nx]').onclick = () => { ruOff += 100; loadRules(); scrollTo({ top: 0 }); };
		return;
	}
	const st = await state(true);
	setStatus(true, '在线');
	const on = st.cfg.enable_custom_clash_rules === '1';
	box.innerHTML = `<section class="card"><div class="fld row" style="padding:0;border:0"><div class="lb"><b>启用自定义规则</b><div class="ds full">开启后，下面两个列表的规则会加到配置文件里：「优先」排在原有规则之前，「候补」排在之后。</div></div><label class="sw"><input type="checkbox" data-en ${on ? 'checked' : ''}><i></i></label></div></section>
		<div class="sectitle"><b>自定义规则</b></div>
		<section class="card list">
			<button class="file" data-e="openclash_custom_rules.list"><div><b>优先匹配规则</b><span class="muted">排在配置文件原有规则之前</span></div><span class="muted">编辑 ›</span></button>
			<button class="file" data-e="openclash_custom_rules_2.list"><div><b>候补匹配规则</b><span class="muted">排在原有规则之后、MATCH 之前</span></div><span class="muted">编辑 ›</span></button>
		</section>
		<div class="notice" style="margin-top:10px">格式：每行一条，以「- 」开头，例如<br><span class="mono">- DOMAIN-SUFFIX,douyin.com,🇹🇼 台湾</span><br>节点和策略组的名字要和「节点」页里的完全一样。保存时会自动检查格式和节点名。</div>`;
	box.querySelector('[data-en]').onchange = async (e) => {
		const c = e.target.checked;
		if (!(await confirmBox(c ? '开启自定义规则' : '关闭自定义规则', '需要重启 OpenClash 才生效，断网 10–30 秒。', '保存并重启'))) { e.target.checked = !c; return; }
		try { await P('oc_set', { set: { enable_custom_clash_rules: c ? '1' : '0' }, restart: true }); toast('已保存，OpenClash 正在重启'); S.state = null; watchJobs(); } catch (x) { e.target.checked = !c; handleErr(x); }
	};
	box.querySelector('.list').onclick = (e) => { const b = e.target.closest('[data-e]'); if (b) editFile('custom', b.dataset.e, false, { title: b.querySelector('b').textContent, note: '保存时会检查格式和节点名，有问题会提示，不会写坏。' }); };
}


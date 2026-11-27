/* ---------- 第五阶段：Nikki 的订阅、配置文件（11/27 全面检查第 16 条） ----------
 * 规则页、不走代理页跟 OpenClash 共用（37-rules.js 的「自定义规则」用 nkRulesBox，不走代理靠路由器那边同步到 Nikki 的访问控制）。
 * 换订阅 / 换配置文件要重启 Nikki 才用上：先问（用户 11/26 定），Nikki 没在跑就只换不重启。 */
const NK = { d: null };
const NK_UA = ['clash.meta', 'mihomo', 'clash'];
async function nkGet() { NK.d = await P('nk_get'); setStatus(true, '在线'); return NK.d; }
const nkNone = (box) => { box.innerHTML = '<div class="card empty">这台路由器没装 Nikki</div>'; };
const nkStat = (s) => s.file ? `${B(s.file.size)} · ${ts(s.file.mtime)} 更新${s.ok === false ? ' · 上次更新失败' : ''}` : s.ok === false ? '下载失败' : '还没下载过';
async function loadNkSub() {
	const box = $('nsBody'), d = await nkGet();
	if (!d.on) return nkNone(box);
	const prof = d.prof || {}, onFile = prof.kind === 'file' ? d.files.find((f) => f.name === prof.id) : null;
	box.innerHTML = `<div class="hero"><div class="herohead"><h1>Nikki 订阅</h1><button class="btn primary" data-add>＋ 添加</button></div>
		${onFile ? `<p class="muted" style="margin-bottom:0">正在用配置文件「${esc(onFile.name)}」</p>` : ''}
		<div class="btngrid" style="margin-bottom:0;grid-template-columns:1fr"><button class="btn blue" data-all ${d.subs.length ? '' : 'disabled'}>更新全部订阅</button></div></div>
		<div class="sectitle"><b>订阅列表</b><span class="pill">${d.subs.length} 个</span></div>
		<div class="grid">${d.subs.length ? d.subs.map((s, i) => `<section class="card subcard" data-s="${i}">
			<div class="sechead"><div style="min-width:0"><b style="font-size:16px">${esc(s.name)}</b>${s.active ? ' <span class="pill blue">正在使用</span>' : ''}
				<div class="sub ell" style="font-size:12.5px">${esc(s.host || '没有地址')}</div></div></div>
			<div class="muted" style="margin-top:8px">${nkStat(s)}</div>
			<div data-flow></div>
			<div class="rowbtns"><button class="btn sm blue" data-up>更新</button><button class="btn sm" data-more>更多</button></div>
		</section>`).join('') : '<div class="card empty">还没有订阅，点右上角「＋ 添加」</div>'}</div>`;
	box.onclick = async (e) => {
		const t = e.target;
		if (t.closest('[data-add]')) return nkSubEdit(null);
		if (t.closest('[data-all]')) return subxUpdate(t.closest('[data-all]'));
		const card = t.closest('[data-s]'); if (!card) return;
		const s = NK.d.subs[+card.dataset.s]; if (!s) return;
		if (t.closest('[data-up]')) return nkSubUpdate(s, t.closest('[data-up]'));
		if (!t.closest('[data-more]')) return;
		const act = await moreSheet({ t: s.name, sub: s.active ? '正在使用' : nkStat(s) }, [
			{ items: [{ v: 'flow', ic: '<path d="M5 20v-6M10 20V9M15 20v-9M20 20V5"/>', t: '查流量' },
				s.file && { v: 'view', ic: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>', t: '看配置内容' },
				{ v: 'ed', ic: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', t: '编辑' }] },
			{ items: [!s.active && { v: 'use', ic: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', t: '使用这个订阅' }] },
			{ items: [!s.active && { v: 'del', ic: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>', t: '删除', danger: true }] }
		]);
		if (act === 'flow') return busy(null, async () => {
			const r = await P('subx_info', { id: s.id }, 30000);
			card.querySelector('[data-flow]').innerHTML = r.ok ? subInfoHtml(r) : `<div class="muted">${esc(r.msg || '这个机场没有提供流量信息')}</div>`;
		});
		if (act === 'view') return editFile('nk_sub', s.id + '.yaml', false, { title: s.name, after: () => refresh(true) });
		if (act === 'ed') return nkSubEdit(s);
		if (act === 'use') return nkUse('sub', s.id, s.name, !s.file);
		if (act === 'del') {
			if (!(await confirmBox('删除订阅「' + s.name + '」', '下载的配置文件一起删，旧文件先备份。', '删除', true))) return;
			return busy(null, async () => { await P('nk_sub_del', { id: s.id }); toast('已删除'); refresh(true); });
		}
	};
}
async function nkSubEdit(s) {
	const ua = s && s.ua && !NK_UA.includes(s.ua) ? [s.ua, ...NK_UA] : NK_UA;
	const v = await modal(`<div class="sheethead"><h3>${s ? '编辑订阅' : '添加订阅'}</h3><button class="btn sm" data-v="false">取消</button></div>
		<label class="lglabel" style="margin-top:0">名字</label><input class="input" data-n maxlength="40" value="${esc(s ? s.name : '')}" placeholder="例如 我的机场">
		<label class="lglabel">订阅地址</label><input class="input" data-u inputmode="url" autocapitalize="off" spellcheck="false" placeholder="${s ? '不改就不填' : 'https://'}">
		<label class="lglabel">User-Agent</label><select class="input" data-a>${ua.map((x) => `<option${(s ? s.ua || 'clash.meta' : 'clash.meta') === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
		<div class="btngrid" style="margin:14px 0 0;grid-template-columns:1fr"><button class="btn primary" data-ok>${s ? '保存' : '添加并下载'}</button></div>`,
	(m, close) => {
		m.dataset.lock = '1';
		const ok = m.querySelector('[data-ok]');
		ok.onclick = () => busy(ok, async () => {
			const name = m.querySelector('[data-n]').value.trim(), url = m.querySelector('[data-u]').value.trim();
			if (!name) throw new Error('要填名字');
			if (!s && !url) throw new Error('要填订阅地址');
			const r = await P('nk_sub_save', { id: s ? s.id : undefined, name, url: url || undefined, ua: m.querySelector('[data-a]').value });
			close(r.id);
		});
	});
	if (!v) return;
	if (s) { toast('已保存'); return refresh(true); }
	try { await P('nk_sub_update', { id: v }); toast('已添加，正在下载'); nkWait('已下载'); } catch (e) { toast('已添加'); handleErr(e); }
	refresh(true);
}
// 等 Nikki 的更新脚本跑完（跟「更新全部订阅」用同一个标记）
function nkWait(done, flow) {
	let n = 0;
	const tick = async () => {
		let st = null; try { st = await P('subx_state'); } catch (e) {}
		if (st && !st.busy) { if (flow) subFlowDone(flow, done); else toast(done); return refresh(true); }
		if (++n < 100) setTimeout(tick, 3000);
	};
	setTimeout(tick, 3000);
}
async function nkSubUpdate(s, btn) {
	if (s.active && NK.d.running && !(await confirmBox('更新订阅「' + s.name + '」', '这是正在用的订阅，更新完 Nikki 会重启，断网 10–30 秒。', '更新'))) return;
	const flow = subFlowStart([s], (x) => P('subx_info', { id: x.id }, 30000));
	return busy(btn, async () => { await P('nk_sub_update', { id: s.id }); toast('「' + s.name + '」开始在后台更新'); nkWait('「' + s.name + '」已更新', flow); }, false);
}
async function nkUse(kind, id, name, dl) {
	const run = NK.d.running;
	if (!(await confirmBox('换成「' + name + '」', run ? `${dl ? '先下载 再' : ''}重启 Nikki 才用上，断网 10–30 秒。` : 'Nikki 没在运行，下次启动时用它。', run ? '换并重启' : '换'))) return;
	return busy(null, async () => {
		const r = await P('nk_use', { kind, id, restart: run });
		toast(r.restarting ? '已换成「' + name + '」，Nikki 正在重启' : '已换成「' + name + '」');
		refresh(true);
	});
}
async function loadNkCfg() {
	const box = $('ncBody'), d = await nkGet();
	if (!d.on) return nkNone(box);
	const prof = d.prof || {}, onSub = prof.kind === 'sub' ? d.subs.find((s) => s.id === prof.id) : null;
	box.innerHTML = `<div class="hero"><div class="herohead"><h1>Nikki 配置文件</h1><button class="btn primary" data-new>＋ 新建</button></div>
		${onSub ? `<p class="muted" style="margin-bottom:0">正在用订阅「${esc(onSub.name)}」</p>` : ''}</div>
		<div class="sectitle"><b>配置文件</b><span class="pill">${d.files.length} 个</span></div>
		<section class="card list">${d.files.length ? d.files.map((f, i) => `<div class="file" data-f="${i}"><div style="min-width:0"><b class="ell">${esc(f.name)}${f.active ? ' <span class="pill blue">正在使用</span>' : ''}</b><span class="muted">${B(f.size)} · ${ts(f.mtime)}</span></div><button class="btn sm" data-more>更多</button></div>`).join('') : '<div class="empty">还没有自己的配置文件</div>'}</section>
		<div class="sectitle"><b>正在运行</b></div>
		<section class="card list"><button class="file" data-run><div><b>config.yaml</b></div><span class="muted">看 ›</span></button></section>`;
	box.onclick = async (e) => {
		const t = e.target;
		if (t.closest('[data-new]')) return newFile('nk_profile', () => refresh(true));
		if (t.closest('[data-run]')) return editFile('nk_run', 'config.yaml', false, { title: '正在运行的配置' });
		const row = t.closest('[data-f]'); if (!row) return;
		const f = NK.d.files[+row.dataset.f]; if (!f) return;
		const act = await moreSheet({ t: f.name, sub: f.active ? '正在使用' : B(f.size) }, [
			{ items: [{ v: 'ed', ic: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', t: '编辑' }] },
			{ items: [!f.active && { v: 'use', ic: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', t: '使用这个配置' }] },
			{ items: [!f.active && { v: 'del', ic: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>', t: '删除', danger: true }] }
		]);
		if (act === 'ed') return editFile('nk_profile', f.name, f.active && NK.d.running, { after: () => refresh(true) });
		if (act === 'use') return nkUse('file', f.name, f.name, false);
		if (act === 'del') {
			if (!(await confirmBox('删除「' + f.name + '」', '旧文件先备份到路由器。', '删除', true))) return;
			return busy(null, async () => { await P('file_delete', { kind: 'nk_profile', name: f.name }); toast('已删除'); refresh(true); });
		}
	};
}
// 规则页「自定义规则」：Nikki 里你自己写的（uci rule），排在订阅规则前面；分流加的在「分流」页管
async function nkRulesBox(box) {
	const d = await nkGet();
	if (!d.on) return nkNone(box);
	const off = d.rules.filter((r) => !r.en).length;
	box.innerHTML = `<div class="sectitle"><b>自定义规则</b></div>
		<section class="card list"><button class="file" data-nke><div><b>我的规则</b><span class="muted">${d.rules.length} 条${off ? ' · 停用 ' + off + ' 条' : ''}${d.split ? ' · 分流另有 ' + d.split + ' 条' : ''}</span></div><span class="muted">编辑 ›</span></button></section>
		<div class="notice" style="margin-top:10px">每行一条 排在订阅规则前面 例如<br><span class="mono">DOMAIN-SUFFIX,douyin.com,DIRECT</span><br>行首加 # 是停用。去向要跟「节点」页里的名字一样</div>`;
	box.querySelector('[data-nke]').onclick = () => nkRulesEdit();
}
const nkRuleLine = (r) => (r.en ? '' : '# ') + [r.type, r.matcher, r.node].join(',') + (r.nr ? ',no-resolve' : '');
async function nkRulesEdit() {
	const d = NK.d, run = d.running;
	await modal(`<div class="sheethead"><h3>我的规则</h3><button class="btn sm" data-v="false">取消</button></div>
		<textarea class="input mono" data-t spellcheck="false" autocapitalize="off" style="min-height:52vh" placeholder="DOMAIN-SUFFIX,douyin.com,DIRECT">${esc(d.rules.map(nkRuleLine).join('\n'))}</textarea>
		<div class="btngrid" style="margin:12px 0 0${run ? '' : ';grid-template-columns:1fr'}"><button class="btn ${run ? 'blue' : 'primary'}" data-s>保存</button>${run ? '<button class="btn primary" data-sr>保存并重启</button>' : ''}</div>`,
	(m, close) => {
		m.dataset.lock = '1';
		const ta = m.querySelector('[data-t]');
		const save = (restart) => async () => {
			if (restart && !(await confirmBox('保存并重启', '保存后重启 Nikki，断网 10–30 秒。', '保存并重启'))) return;
			let r;
			try { r = await P('nk_rules_set', { text: ta.value, restart }); }
			catch (e) {
				if (!/没有这个策略组或节点/.test(e.message) || !(await confirmBox('去向找不到', e.message + '\n\n仍然要保存吗？', '照样保存', true))) throw e;
				r = await P('nk_rules_set', { text: ta.value, restart, force: true });
			}
			close(true);
			toast(r.restarting ? `已保存 ${r.n} 条，Nikki 正在重启` : `已保存 ${r.n} 条${run ? '，重启 Nikki 后生效' : ''}`);
			refresh(true);
		};
		m.querySelector('[data-s]').onclick = (e) => busy(e.currentTarget, save(false));
		const sr = m.querySelector('[data-sr]'); if (sr) sr.onclick = (e) => busy(e.currentTarget, save(true));
	});
}

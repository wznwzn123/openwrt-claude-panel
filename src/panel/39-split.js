/* ---------- 6.0 第 69 项：分流——按设备、按软件、按网站、按国家和地区选直连 / 代理 / 某个策略组 / 某个节点 ----------
 * 只支持 OpenClash 和 Nikki；要重启插件才生效的改动，顶上一直提示「现在重启」，用户点了才重启（用户 11/26 定）。
 * 订阅更新后选的策略组或节点没了：路由器自动改走主策略组并推送，这里列出来。
 * 用户 11/27 加：能选单个节点（按地区分组、带延迟）；自己加网站和软件；学习模式（识别一台设备几分钟里访问的网站，帮你认出软件用的网址）。 */
const SPL = { d: null, tab: 'dev', learn: null, lt: 0 };
async function loadSplit() {
	SPL.d = await P('split_get', {}, 20000);
	setStatus(true, '在线');
	splRender();
}
const SPL_PX = (d) => (d.kind === 'nikki' ? 'Nikki' : 'OpenClash');
const SPL_REG = { HK: '香港', TW: '台湾', MO: '澳门', JP: '日本', SG: '新加坡', KR: '韩国', US: '美国', GB: '英国', DE: '德国', FR: '法国', NL: '荷兰', CA: '加拿大', AU: '澳大利亚', RU: '俄罗斯', IN: '印度', TR: '土耳其', MY: '马来西亚', TH: '泰国', VN: '越南', PH: '菲律宾', AE: '阿联酋', AR: '阿根廷', BR: '巴西' };
function splName(t) {
	if (!t) return '跟随全局';
	if (t === 'DIRECT') return '直连';
	if (t === 'PROXY') return '代理';
	if (t === 'REJECT' || t === 'REJECT-DROP') return '拒绝';
	return t;
}
const splPill = (t) => `<span class="pill${t ? ' on' : ''}">${esc(splName(t))}</span>`;
/* 覆写里你自己写的规则（用户 11/28：认出来显示在分流里，标「覆写里的」；跟分流撞了按你写的走；点「交给分流管」才搬过来）
 * 路由器 split_get 给 own：[{ k, ty, v, t, tag, src: f1|f2|nk, pri }]、ov：{ '种类:编号': { t, v, part } }（分流的这一条跟你写的撞了）
 * 带「# [名字]」的网址合成一个软件放软件栏；设备的固定 IP 对上了放设备栏；其他放网站栏 */
const SPL_SRC = { f1: 'OpenClash 自定义规则 · 优先匹配', f2: 'OpenClash 自定义规则 · 候补匹配', nk: 'Nikki 规则' };
const SPL_TY = { DOMAIN: '完整网址', 'DOMAIN-KEYWORD': '关键词', 'DOMAIN-REGEX': '正则', 'IP-CIDR': 'IP 段', 'IP-CIDR6': 'IP 段', 'SRC-IP-CIDR': '来源 IP', GEOIP: 'IP 归属地', GEOSITE: '网站分类', 'RULE-SET': '规则集', 'DST-PORT': '端口', 'PROCESS-NAME': '程序名' };
const splIsDom = (x) => x.ty === 'DOMAIN-SUFFIX' || x.ty === 'DOMAIN';
function splOwn() {
	const d = SPL.d, g = { app: [], site: [], dev: {} }, by = {}, ipMac = {};
	for (const x of d.devices || []) if (x.ip) ipMac[x.ip] = x.mac;
	for (const [mac, v] of Object.entries(d.dev || {})) if (v && v.ip && !ipMac[v.ip]) ipMac[v.ip] = mac;
	for (const x of d.own || []) {
		const ip = x.ty === 'SRC-IP-CIDR' && /^\d+\.\d+\.\d+\.\d+\/32$/.test(x.v) ? x.v.replace(/\/32$/, '') : '', mac = ip && ipMac[ip];
		if (mac) { const k = 'dev:' + mac; (by[k] = by[k] || { key: k, mac, name: x.v, t: x.t, items: [] }).items.push(x); g.dev[mac] = by[k]; continue; }
		if (splIsDom(x) && x.tag) { const k = 'app:' + x.tag + '|' + x.t; if (!by[k]) g.app.push((by[k] = { key: k, name: x.tag, t: x.t, items: [] })); by[k].items.push(x); continue; }
		const k = 'site:' + x.k;
		g.site.push((by[k] = { key: k, name: x.v, sub: SPL_TY[x.ty] ?? (x.ty === 'DOMAIN-SUFFIX' ? '' : x.ty), t: x.t, items: [x] }));
	}
	SPL.own = by;
	return g;
}
// 这条能不能交给分流管（跟路由器 split_own_move 一样的判断）：只有网址、能认出设备的来源 IP；去向要是直连、策略组或者不在订阅合集里的节点
function splOwnWhy(x, d) {
	if (!(x.t === 'DIRECT' || (d.groups || []).includes(x.t) || (d.nodes || []).some((n) => n.n === x.t && !n.p))) return `去向「${splName(x.t)}」分流里选不了`;
	if (splIsDom(x) || x.ty === 'SRC-IP-CIDR') return '';
	return (SPL_TY[x.ty] || x.ty) + ' 这种写法分流管不了';
}
// 撞车提示（分流自己的这一行下面）
function splOvLine(o) { return o ? `<span class="splov">${o.part ? `部分网址按覆写的走「${esc(splName(o.t))}」` : `覆写里写了走「${esc(splName(o.t))}」 按覆写的走`}</span>` : ''; }
function splRows() {
	const d = SPL.d, own = splOwn(), OWN = '覆写里的';
	const row = (k, id, name, sub, t, tag, ov) => `<button class="file splrow" type="button" data-sk="${k}" data-sid="${esc(id)}"><div style="flex:1;min-width:0"><b class="splnm"><span class="ell">${esc(name)}</span>${tag ? `<span class="spltag${tag === OWN ? ' own' : ''}">${tag}</span>` : ''}</b>${sub ? `<span class="muted ell" style="display:block;font-size:12.5px">${esc(sub)}</span>` : ''}${splOvLine(ov)}</div>${splPill(t)}</button>`;
	const ovOf = (k, id) => (d.ov || {})[k + ':' + id];
	if (SPL.tab === 'app') {
		const mine = Object.entries(d.capp || {}).map(([id, c]) => row('capp', id, c.name, (c.doms || []).join('、'), c.t, '自己加的', ovOf('capp', id))).join('');
		const ow = own.app.map((g) => row('own', g.key, g.name, g.items.map((x) => x.v).join('、'), g.t, OWN)).join('');
		// 识别软件能看到设备访问了哪些网站：只有主账号能用
		const owner = ME_ROLE.role !== 'sub';
		return `<div class="btngrid spltop${owner ? '' : ' one'}">${owner ? '<button class="btn sm" type="button" data-sa="learn">识别软件</button>' : ''}<button class="btn sm" type="button" data-sa="capp">添加软件</button></div>
			<section class="card list" style="margin-top:12px">${mine}${ow}${d.apps.map((a) => row('app', a.id, a.name, '', d.app[a.id], '', ovOf('app', a.id))).join('')}</section>`;
	}
	if (SPL.tab === 'site') {
		const l = Object.entries(d.site || {});
		const ow = own.site.map((g) => row('own', g.key, g.name, g.sub, g.t, OWN)).join('');
		return `<div class="btngrid spltop one"><button class="btn sm" type="button" data-sa="site">添加网站</button></div>
			<section class="card list" style="margin-top:12px">${l.length || ow ? l.map(([dm, t]) => row('site', dm, dm, '包括它的子域名', t, '', ovOf('site', dm))).join('') + ow : '<div class="empty">还没有加网站</div>'}</section>`;
	}
	if (SPL.tab === 'geo') return `<section class="card list" style="margin-top:12px">${d.geos.map((g) => row('geo', g.id, g.name, '', d.geo[g.id])).join('')}</section>`;
	// 设备：设了分流的在前，再按在线、名字
	const seen = {}, list = [];
	for (const x of d.devices) { seen[x.mac] = 1; list.push(x); }
	for (const [mac, v] of Object.entries(d.dev)) if (!seen[mac]) list.push({ mac, name: v.name, ip: v.ip, online: false });
	// 覆写里写了这台设备（来源 IP 对上了）也排在前面；分流没设过的，这一行就是覆写里的那条
	const set = (m) => !!(d.dev[m] || own.dev[m]);
	list.sort((a, b) => (set(b.mac) - set(a.mac)) || (b.online - a.online) || String(a.name || '').localeCompare(String(b.name || '')));
	const sub = (x) => (d.dev[x.mac]?.ip || x.ip || '') + (x.online ? '' : (x.ip || d.dev[x.mac]?.ip ? ' · ' : '') + '离线');
	return `<section class="card list" style="margin-top:12px">${list.length ? list.map((x) => (!d.dev[x.mac] && own.dev[x.mac] ? row('own', own.dev[x.mac].key, x.name || x.mac, sub(x), own.dev[x.mac].t, OWN) : row('dev', x.mac, x.name || x.mac, sub(x), d.dev[x.mac]?.t, '', ovOf('dev', x.mac)))).join('') : '<div class="empty">还没有设备</div>'}</section>`;
}
function splRender() {
	const d = SPL.d;
	if (!d) return;
	if (!d.kind) { $('splBody').innerHTML = '<section class="card empty" style="margin-top:12px">分流只支持 OpenClash 和 Nikki</section>'; return; }
	const mv = (d.moved || []).filter((x) => Date.now() / 1000 - x.at < 7 * 86400).map((x) => `<div class="notice w" style="margin-top:12px">${x.node ? '节点' : '策略组'}「${esc(x.g)}」没了，已改走代理（${esc(d.main || '主策略组')}）</div>`).join('');
	// 选的节点连不上，暂时改走主策略组（11/27 全面检查第 14 条）
	// 用户 11/28：只换同地区同名的（去掉编号后一样），都挂了不换
	const nd = Object.entries(d.nd || {}).map(([n, x]) => `<div class="notice w" style="margin-top:12px">节点「${esc(n)}」连不上，${x && x.to ? `暂时换到「${esc(x.to)}」` : '同地区的节点也连不上，先不换'}</div>`).join('');
	$('splBody').innerHTML = `${d.pending ? `<div class="notice w splpend" style="margin-top:12px"><span>重启 ${SPL_PX(d)} 后生效</span><button class="btn sm" id="splRs" type="button">现在重启</button></div>` : ''}
		${d.live ? '' : `<div class="notice" style="margin-top:12px">${SPL_PX(d)} 没在运行，策略组是从配置文件里读的，现在选不了节点</div>`}${nd}${mv}${splPvHtml(d)}
		<div class="spltabs" id="splTab" role="tablist">${[['dev', '设备'], ['app', '软件'], ['site', '网站'], ['geo', '国家地区']].map(([k, t]) => `<button type="button" role="tab" aria-selected="${SPL.tab === k}" class="${SPL.tab === k ? 'on' : ''}" data-st="${k}">${t}</button>`).join('')}</div>
		${splRows()}`;
}
// 选的单个节点：现在多少毫秒、挂了换哪个（先同名、再同地区，都挂了不换）+ 最近切换（跟特色功能「节点挂了自动换」一样，用户 11/28）
const splMD = (t) => { const x = new Date(t * 1000); return `${x.getMonth() + 1}/${x.getDate()} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
function splPvHtml(d) {
	const pv = d.pv || [], sw = (d.swl || []).slice(0, 5);
	if (!pv.length && !sw.length) return '';
	const row = (x) => `<div class="splpv"><b class="ell">${esc(x.n)}</b><span class="muted">${x.d ? x.d + ' ms' : '没测过'}</span></div><div class="splpvn muted">${x.to ? `挂了换「${esc(x.to)}」${x.td ? ' ' + x.td + ' ms' : ''}` : x.sibs ? '同地区的节点现在都没测通，挂了先不换' : '没有同地区的节点，挂了不换'}</div>`;
	const log = sw.length ? `<div class="mgt" style="margin:12px 0 4px">最近切换</div>${sw.map((x) => `<div class="splsw"><span class="muted">${splMD(x.at)}</span><span class="ell">${esc(x.a)} → ${esc(x.b)}</span></div>`).join('')}` : '';
	return `<section class="card splpvc" style="margin-top:12px">${pv.map(row).join('')}${log}</section>`;
}
// 选去向：跟随全局 / 直连 / 代理 / 策略组 / 节点（按地区分组，带延迟）。extra：底下多几个按钮（改网址、删除）
async function splChoose(title, cur, extra) {
	// 订阅合集（proxy-providers）里的节点规则里不能直接写：灰掉（路由器 sp_nodes 标 p:1）
	const d = SPL.d, opt = (t, n, sub, off) => `<button class="mact" type="button"${off ? ' disabled' : ` data-v="o:${esc(t)}"`}><span><b class="ell" style="display:block">${esc(n)}</b>${sub ? `<span class="muted" style="font-size:12.5px">${esc(sub)}</span>` : ''}</span>${t === cur ? '<span class="splck">✓</span>' : ''}</button>`;
	const base = [opt('', '跟随全局'), opt('DIRECT', '直连'), ...(d.main ? [opt('PROXY', '代理', d.main)] : [])].join('');
	const grp = d.groups.filter((g) => g !== d.main).map((g) => opt(g, g)).join('');
	// 节点按地区分组：认不出地区的放最后
	const by = {};
	for (const n of d.nodes || []) (by[n.reg] = by[n.reg] || []).push(n);
	const regs = Object.keys(by).sort((a, b) => (a === '?') - (b === '?') || by[b].length - by[a].length);
	const nodes = regs.map((r) => `<div class="mgrp"><div class="mgt">节点 · ${esc(SPL_REG[r] || (r === '?' ? '其他' : r))}</div><div class="mlist">${by[r].map((n) => opt(n.n, n.n, n.p ? '订阅合集里的 选不了' : n.d ? n.d + ' ms' : '', n.p)).join('')}</div></div>`).join('');
	const v = await modal(`<div class="sheethead"><h3 class="ell" style="margin:0">${esc(title)}</h3><button class="btn sm" data-v="close">关闭</button></div>
		<div class="cscroll splopts"><div class="mgrp"><div class="mlist">${base}</div></div>${grp ? `<div class="mgrp"><div class="mgt">策略组</div><div class="mlist">${grp}</div></div>` : ''}${nodes}</div>
		${extra ? `<div class="cfoot"><div class="btngrid">${extra.map(([k, t, danger]) => `<button class="btn${danger ? ' danger' : ''}" type="button" data-v="x:${k}">${t}</button>`).join('')}</div></div>` : ''}`);
	if (typeof v !== 'string') return null;
	if (v.startsWith('x:')) return { x: v.slice(2) };
	if (!v.startsWith('o:')) return null;
	return { t: v.slice(2) };
}
async function splSave(body, ok) {
	try { SPL.d = await P('split_set', body, 30000); splRender(); if (ok) toast(ok); return true; }
	catch (e) { toast(e.message, true); return false; }
}
// 分流的这一条跟覆写里你写的撞了的那几条（跟路由器 sp_conflicts 一样：网址一样、你写的包住它、它包住你写的；设备看固定 IP）
const splCov = (a, b) => a === b || a.endsWith('.' + b);
function splOvKeys(k, id) {
	const d = SPL.d, ip = k === 'dev' ? d.dev[id]?.ip : '';
	const doms = k === 'site' ? [id] : k === 'capp' ? d.capp[id]?.doms || [] : k === 'app' ? d.apps.find((a) => a.id === id)?.doms || [] : [];
	return (d.own || []).filter((x) => x.pri && (k === 'dev' ? ip && x.ty === 'SRC-IP-CIDR' && x.v === ip + '/32' : splIsDom(x) && doms.some((dm) => splCov(dm, x.v) || (x.ty === 'DOMAIN-SUFFIX' && splCov(x.v, dm))))).map((x) => x.k);
}
// 点「覆写里的」那一行：写在哪、走哪、原文；能搬的给「交给分流管」
async function splOwnCard(key) {
	const d = SPL.d, g = SPL.own && SPL.own[key];
	if (!g) return;
	const why = g.items.map((x) => splOwnWhy(x, d)), canN = why.filter((x) => !x).length;
	const src = [...new Set(g.items.map((x) => SPL_SRC[x.src] || x.src))].join('\n');
	const v = await modal(`<h3 class="ell" style="margin:0 0 10px">${esc(g.name)}</h3>
		<div class="splown"><div><span class="muted">写在</span><span style="white-space:pre-line">${esc(src)}</span></div><div><span class="muted">走</span><span class="ell">${esc(splName(g.t))}</span></div></div>
		<pre class="splraw">${esc(g.items.map((x) => x.ty + ',' + x.v + ',' + x.t).join('\n'))}</pre>
		${canN ? '' : `<div class="notice" style="margin-top:10px">${esc(why[0])}</div>`}
		<div class="btngrid${canN ? '' : ' one'}" style="margin:14px 0 0"><button class="btn" data-v="close">关闭</button>${canN ? '<button class="btn primary" data-v="move">交给分流管</button>' : ''}</div>`, null, { compact: true });
	if (v === 'move') splOwnMove(g.items.filter((x, i) => !why[i]).map((x) => x.k));
}
async function splOwnMove(keys) {
	if (!keys.length) return;
	if (!(await confirmBox('交给分流管', '从覆写里删掉这几行，改在分流里管。原文件先备份。重启后生效。', '交给分流管', false, { compact: true }))) return;
	try {
		const r = await P('split_own_move', { keys }, 30000);
		SPL.d = r; splRender();
		const sk = r.skip || [];
		toast(`已交给分流管 ${r.movedN || 0} 条` + (sk.length ? ` ${sk.length} 条搬不了：${sk[0]}` : ''));
	} catch (e) { toast(e.message, true); }
}
async function splPick(k, id) {
	const d = SPL.d;
	if (k === 'own') return splOwnCard(id);
	// 跟覆写里你写的撞了：先问要不要交给分流管（用户 11/28）。全撞了在分流里改不生效，只给「取消」；部分撞了能「改没撞的网址」（用户 11/28 02:3x 选）
	const ov = (d.ov || {})[k + ':' + id];
	if (ov) {
		const keys = splOvKeys(k, id), nm = k === 'app' ? d.apps.find((a) => a.id === id)?.name : k === 'capp' ? d.capp[id]?.name : k === 'site' ? id : (d.devices.find((x) => x.mac === id)?.name || d.dev[id]?.name || id);
		const v = await modal(`<h3 class="ell" style="margin:0 0 10px">${esc(nm || id)}</h3><div class="notice w">${ov.part ? `部分网址按覆写的走「${esc(splName(ov.t))}」` : `覆写里写了走「${esc(splName(ov.t))}」 按覆写的走`}</div>
			<div class="btngrid" style="margin:14px 0 0">${ov.part ? '<button class="btn" data-v="edit">改没撞的网址</button>' : '<button class="btn" data-v="close">取消</button>'}<button class="btn primary" data-v="move"${keys.length ? '' : ' disabled'}>交给分流管</button></div>`, null, { compact: true });
		if (v === 'move') return splOwnMove(keys);
		if (v !== 'edit') return;
	}
	if (k === 'capp') return splCappEdit(id);
	const name = k === 'app' ? d.apps.find((a) => a.id === id)?.name : k === 'geo' ? d.geos.find((g) => g.id === id)?.name : k === 'site' ? id : (d.devices.find((x) => x.mac === id)?.name || d.dev[id]?.name || id);
	const cur = k === 'dev' ? d.dev[id]?.t || '' : d[k][id] || '';
	const r = await splChoose(name, cur, k === 'site' ? [['edit', '改网址'], ['del', '删除', true]] : null);
	if (!r) return;
	if (r.x === 'del') { if (await confirmBox('删除 ' + id, '这个网站以后跟随全局。', '删除', true)) splSave({ site: { d: id, t: '' } }, '已删除'); return; }
	if (r.x === 'edit') { const nd = await promptBox('改网址', '比如 example.com', id); if (nd && nd !== id) splSave({ site: { d: nd, old: id, t: cur } }, '已改网址'); return; }
	if (r.t === cur) return;
	const body = k === 'dev' ? { dev: { mac: id, ip: d.devices.find((x) => x.mac === id)?.ip, name, t: r.t } } : { [k]: k === 'site' ? { d: id, t: r.t } : { id, t: r.t } };
	splSave(body, `已设置：${name} → ${splName(r.t)}`);
}
// 网址：一行一个，也可以用空格、逗号隔开
const splDoms = (s) => String(s || '').split(/[\s,，、;；]+/).map((x) => x.trim()).filter(Boolean);
async function splSiteAdd() {
	const v = await promptBox('添加网站', '网址，比如 example.com');
	if (!v) return;
	const l = splDoms(v);
	if (!l.length) return;
	const r = await splChoose(l.length > 1 ? l.length + ' 个网站走哪里' : l[0] + ' 走哪里', '');
	if (!r || r.x || !r.t) return;
	for (const dm of l) if (!(await splSave({ site: { d: dm, t: r.t } }))) return;
	toast(`已添加 ${l.length > 1 ? l.length + ' 个网站' : l[0]}`);
}
// 添加或修改自己的软件：名字 + 网址（学习模式认出来的网址会填进来）
function splCappForm(c) {
	return modal(`<div class="sheethead"><h3 style="margin:0">${c && c.id ? '修改软件' : '添加软件'}</h3><button class="btn sm" data-v="close">关闭</button></div>
		<div class="cscroll"><div class="mgt" style="margin:0 2px 6px">名字</div><input class="input" data-cn maxlength="20" placeholder="比如 我的游戏" value="${esc(c?.name || '')}">
		<div class="mgt" style="margin:12px 2px 6px">网址</div><textarea class="input" data-cd rows="5" placeholder="一行一个，比如&#10;game.example.com&#10;cdn.example.com" autocapitalize="off" spellcheck="false">${esc((c?.doms || []).join('\n'))}</textarea></div>
		<div class="cfoot"><div class="btngrid"><button class="btn" data-v="close">取消</button><button class="btn primary" data-ok>${c && c.id ? '保存' : '下一步'}</button></div></div>`,
	(m, close) => { m.querySelector('[data-ok]').onclick = () => close({ name: m.querySelector('[data-cn]').value.trim(), doms: splDoms(m.querySelector('[data-cd]').value) }); });
}
async function splCappAdd(pre) {
	const f = await splCappForm(pre || null);
	if (!f || typeof f !== 'object') return;
	if (!f.name) return toast('给软件起个名字', true);
	if (!f.doms.length) return toast('至少填一个网址', true);
	const r = await splChoose(f.name + ' 走哪里', '');
	if (!r || r.x) return;
	splSave({ capp: { name: f.name, doms: f.doms, t: r.t } }, '已添加：' + f.name);
}
async function splCappEdit(id) {
	const c = SPL.d.capp?.[id]; if (!c) return;
	const r = await splChoose(c.name, c.t || '', [['edit', '改名字和网址'], ['del', '删除', true]]);
	if (!r) return;
	if (r.x === 'del') { if (await confirmBox('删除 ' + c.name, '这个软件的网址以后跟随全局。', '删除', true)) splSave({ capp: { id, del: true } }, '已删除'); return; }
	if (r.x === 'edit') { const f = await splCappForm({ id, ...c }); if (f && typeof f === 'object') splSave({ capp: { id, name: f.name, doms: f.doms } }, '已保存'); return; }
	if (r.t === (c.t || '')) return;
	splSave({ capp: { id, t: r.t } }, `已设置：${c.name} → ${splName(r.t)}`);
}
/* 学习模式：选设备 → 路由器记 3 分钟它访问的网站 → 认得的写软件名，其他的按主域名合在一起，勾选后加成自己的软件 */
const SPL_2LD = /\.(com|net|org|gov|edu|co|ac|or|ne|go)\.(cn|hk|tw|jp|kr|uk|au|sg|my|th|in|nz|br)$/;
function splBase(h) { const p = h.split('.'); return p.slice(SPL_2LD.test(h) ? -3 : -2).join('.'); }
function splKnown(h) { for (const a of SPL.d.apps || []) for (const dm of a.doms || []) if (h === dm || h.endsWith('.' + dm)) return a; return null; }
async function splLearn() {
	const d = SPL.d, devs = (d.devices || []).filter((x) => x.online && x.ip);
	if (!devs.length) return toast('没有在线的设备', true);
	const v = await modal(`<div class="sheethead"><h3 style="margin:0">识别哪台设备</h3><button class="btn sm" data-v="close">关闭</button></div>
		<div class="cscroll"><div class="mgrp"><div class="mlist">${devs.map((x) => `<button class="mact" type="button" data-v="d:${esc(x.mac)}"><span><b class="ell" style="display:block">${esc(x.name || x.mac)}</b><span class="muted" style="font-size:12.5px">${esc(x.ip)}</span></span></button>`).join('')}</div></div></div>`);
	if (typeof v !== 'string' || !v.startsWith('d:')) return;
	const dv = devs.find((x) => x.mac === v.slice(2)); if (!dv) return;
	try { SPL.learn = await P('split_learn', { act: 'start', ip: dv.ip, name: dv.name || dv.mac }, 20000); } catch (e) { return toast(e.message, true); }
	splLearnSheet();
}
function splLearnSheet() {
	let timer = 0, pick = new Set();
	modal(`<div class="sheethead"><h3 class="ell" style="margin:0" data-lh>正在识别</h3><button class="btn sm" data-v="close">关闭</button></div>
		<p class="muted" style="margin:0 0 10px;font-size:13px" data-ls></p>
		<div class="cscroll" data-lb></div>
		<div class="cfoot"><div class="btngrid"><button class="btn" type="button" data-stop>停止</button><button class="btn primary" type="button" data-add disabled>加成软件</button></div></div>`,
	(m, close) => {
		const draw = () => {
			const L = SPL.learn || {}, left = Math.max(0, Math.round((L.until || 0) - Date.now() / 1000));
			m.querySelector('[data-lh]').textContent = (L.run ? '正在识别 ' : '识别完了 ') + (L.name || L.ip || '');
			m.querySelector('[data-ls]').textContent = L.err ? L.err : L.run ? `在这台设备上打开要分流的 App 用一会儿 · 还剩 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : (L.hosts || []).length ? '勾选要加的网址' : '没看到这台设备访问网站：它的流量可能没经过 ' + SPL_PX(SPL.d);
			// 认得的按软件合在一起；其他的按主域名合在一起
			const known = {}, other = {};
			for (const [h, n] of L.hosts || []) { const a = splKnown(h); if (a) known[a.id] = { a, n: (known[a.id]?.n || 0) + n }; else { const b = splBase(h); (other[b] = other[b] || { n: 0, hs: new Set() }).n += n; other[b].hs.add(h); } }
			const ks = Object.values(known).sort((x, y) => y.n - x.n), os = Object.entries(other).sort((x, y) => y[1].n - x[1].n).slice(0, 80);
			m.querySelector('[data-lb]').innerHTML = (ks.length ? `<div class="mgrp"><div class="mgt">认出来的软件</div><div class="mlist">${ks.map((x) => `<button class="mact" type="button" data-la="${esc(x.a.id)}"><span><b>${esc(x.a.name)}</b><span class="muted" style="font-size:12.5px"> · ${x.n} 次</span></span>${splPill(SPL.d.app[x.a.id])}</button>`).join('')}</div></div>` : '')
				+ (os.length ? `<div class="mgrp"><div class="mgt">其他网址</div><div class="mlist">${os.map(([b, x]) => `<label class="mact splchk"><input type="checkbox" data-lo="${esc(b)}"${pick.has(b) ? ' checked' : ''}><span><b class="ell" style="display:block">${esc(b)}</b><span class="muted ell" style="display:block;font-size:12.5px">${x.n} 次${x.hs.size > 1 || !x.hs.has(b) ? ' · ' + esc([...x.hs].slice(0, 3).join('、')) : ''}</span></span></label>`).join('')}</div></div>` : '')
				+ (L.nohost ? `<p class="muted" style="font-size:12.5px;margin:8px 2px 0">还有 ${L.nohost} 个连接只有 IP、没有网址，认不出来</p>` : '');
			m.querySelector('[data-stop]').textContent = L.run ? '停止' : '重新识别';
			m.querySelector('[data-add]').disabled = !pick.size;
		};
		const poll = async () => {
			if (!m.isConnected) return;
			try { SPL.learn = await P('split_learn', {}, 15000); } catch (e) {}
			draw();
			if (SPL.learn && SPL.learn.run) timer = setTimeout(poll, 3000);
		};
		draw(); timer = setTimeout(poll, 2000);
		m.addEventListener('change', (e) => { const c = e.target.closest('[data-lo]'); if (!c) return; if (c.checked) pick.add(c.dataset.lo); else pick.delete(c.dataset.lo); m.querySelector('[data-add]').disabled = !pick.size; });
		m.addEventListener('click', async (e) => {
			const a = e.target.closest('[data-la]');
			if (a) { clearTimeout(timer); close(null); return splPick('app', a.dataset.la); }
			if (e.target.closest('[data-stop]')) {
				clearTimeout(timer);
				if (SPL.learn && SPL.learn.run) { try { SPL.learn = await P('split_learn', { act: 'stop' }, 15000); } catch (er) {} return draw(); }
				close(null); return splLearn();
			}
			if (e.target.closest('[data-add]')) { clearTimeout(timer); close(null); return splCappAdd({ name: '', doms: [...pick] }); }
		});
	}, { compact: true });
}
$('splBody').addEventListener('click', async (e) => {
	const tb = e.target.closest('[data-st]');
	if (tb) { SPL.tab = tb.dataset.st; return splRender(); }
	const sa = e.target.closest('[data-sa]');
	if (sa) {
		if (sa.dataset.sa === 'learn') return splLearn();
		if (sa.dataset.sa === 'capp') return splCappAdd();
		if (sa.dataset.sa === 'site') return splSiteAdd();
	}
	if (e.target.id === 'splRs') {
		if (!(await confirmBox('重启 ' + SPL_PX(SPL.d), '断网十几秒。', '重启'))) return;
		return busy(e.target, async () => { try { await P('split_restart'); SPL.d.pending = false; splRender(); toast('正在重启 ' + SPL_PX(SPL.d)); } catch (er) { toast(er.message, true); } });
	}
	const r = e.target.closest('[data-sk]');
	if (r) splPick(r.dataset.sk, r.dataset.sid);
});

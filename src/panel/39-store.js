/* ---------- 6.0 第 19 项：软件中心（搜索、安装、更新） ----------
   路由器上配置的软件源都认（固件自带、第三方、iStore）。
   分类（用户 11/26：太杂乱，按来源分）：上面按来源（全部 / 官方 / 第三方 / iStore，没有的来源不出现），
   列表里按用途分组（可更新放最前，然后代理、网络、存储、系统、主题、其他），组名只是小标题。搜索时什么包都搜。
   安装、更新、更新软件源都在路由器后台跑，这里每 2 秒问一次进度；卸载在「应用管理」 */
const ST_CATN = { proxy: '代理', net: '网络', disk: '存储', sys: '系统', theme: '主题', other: '其他' };
const ST_SRC = { all: '全部', dist: '官方', custom: '第三方', istore: 'iStore' };
let stOpen = { upd: 1 }, stJust = null;
let SC = null, stView = 'all', stQ = '', stPollT = 0, stSeq = 0, stAuto = false;
const stAge = (s) => (s == null ? '' : s < 3600 ? '刚更新' : s < 86400 ? Math.floor(s / 3600) + ' 小时前更新' : Math.floor(s / 86400) + ' 天前更新');
const stKind = (x) => (x.src == null ? 'dist' : x.src === 'iStore' ? 'istore' : 'custom');
async function loadStore() {
	const seq = ++stSeq;
	const r = await P('store_list', stQ ? { q: stQ } : {}, 30000);
	if (seq !== stSeq) return;
	SC = r;
	setStatus(true, '在线');
	stDraw();
	if (r.state && r.state.st === 'run') stPoll();
	// 软件源列表放在内存里，路由器重启就没了：打开这页时没有就自动更新一次
	else if (r.age == null && !stQ && !stAuto) { stAuto = true; stRefresh(); }
}
function stRow(x, owner, run, showSrc) {
	return `<div class="file strow" data-n="${esc(x.name)}"><div style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(x.title)}${x.installed && !x.upd ? ' <span class="pill" style="font-size:11px">已装</span>' : ''}${showSrc && x.src ? ` <span class="pill stsrc" style="font-size:11px">${esc(x.src)}</span>` : ''}</b><span class="muted ell" style="display:block;font-size:12.5px">${esc(x.name)} · ${esc(x.upd ? x.installed + ' → ' + x.ver : x.ver)}${x.size ? ' · ' + apSize(x.size) : ''}</span></div>
		${owner && !run ? (!x.installed ? '<button class="btn sm" data-act="install">安装</button>' : x.upd ? '<button class="btn sm" data-act="upgrade">更新</button>' : '') : ''}</div>`;
}
function stDraw() {
	const r = SC;
	$('stAge').textContent = (r.age == null ? '软件源没更新过' : stAge(r.age)) + (r.feeds && r.feeds.length ? ' · ' + r.feeds.length + ' 个软件源' : '');
	$('stFree').textContent = r.free != null ? '剩 ' + apSize(r.free * 1024) : r.pm;
	const P0 = r.list.filter((x) => x.plugin), n = { all: P0.length, dist: 0, custom: 0, istore: 0 };
	for (const x of P0) n[stKind(x)]++;
	// 没有的来源不出现；只有一个来源时整排不出现
	const vs = ['all', 'dist', 'custom', 'istore'].filter((v) => v === 'all' || n[v]);
	if (!vs.includes(stView)) stView = 'all';
	$$('#stView .chip').forEach((b) => { const v = b.dataset.v; b.classList.toggle('hidden', !vs.includes(v)); b.textContent = ST_SRC[v] + ' ' + n[v]; b.classList.toggle('on', !stQ && v === stView); });
	$('stView').classList.toggle('hidden', vs.length <= 2);
	$('stView').style.gridTemplateColumns = `repeat(${vs.length},minmax(0,1fr))`;
	const run = r.state && r.state.st === 'run', owner = ME_ROLE.role !== 'sub';
	$('stRefresh').disabled = run;
	const l = stQ ? r.list : P0.filter((x) => stView === 'all' || stKind(x) === stView);
	$('stTitle').textContent = stQ ? '搜索结果' : stView === 'all' ? '插件' : ST_SRC[stView];
	$('stCount').textContent = stQ && r.total > r.list.length ? r.list.length + '+' : l.length;
	if (r.age == null && !r.list.length) { $('stList').innerHTML = `<div class="empty">软件源没更新过<br><button class="btn sm blue" style="margin-top:10px" data-ref>更新软件源</button></div>`; return; }
	if (!l.length) { $('stList').innerHTML = `<div class="empty">${stQ ? '没有符合的' : '没有'}</div>`; return; }
	// 分组：可更新在最前，然后按用途
	const G = [['upd', '可更新', l.filter((x) => x.upd)]];
	for (const [k, t] of Object.entries(ST_CATN)) G.push([k, t, l.filter((x) => !x.upd && (x.cat || 'other') === k)]);
	const src = stView === 'all' || !!stQ;
	// 搜索：直接列结果；平时：每个用途一行，点开才展开（软件太多，全展开太长）；可更新的默认展开
	if (stQ) { $('stList').innerHTML = l.slice(0, 150).map((x) => stRow(x, owner, run, src)).join(''); return; }
	$('stList').innerHTML = G.filter((g) => g[2].length).map((g) => { const op = !!stOpen[g[0]];
		const rows = op ? g[2].slice(0, 200).map((x) => stRow(x, owner, run, src)) : [];
		// 刚点开的那一组：行依次出来
		if (op && stJust === g[0]) rows.forEach((r, k) => { rows[k] = r.replace('class="file strow"', `class="file strow rowin" style="--i:${Math.min(k, 10)}"`); });
		return `<button class="file stgrp${op ? ' open' : ''}" data-g="${g[0]}" aria-expanded="${op}"><b style="flex:1;text-align:left">${g[1]}</b><span class="muted">${g[2].length}</span><i class="stchev" aria-hidden="true"></i></button>` + rows.join(''); }).join('');
	stJust = null;
}
// 等后台做完：成功 / 失败都说一声，然后刷新列表
function stPoll() {
	clearTimeout(stPollT);
	stPollT = setTimeout(async () => {
		let s = null;
		try { s = (await P('store_state', {}, 8000)).state; } catch (e) { return stPoll(); }
		if (s && s.st === 'run') return stPoll();
		if (s && s.st === 'ok') toast('已' + (s.what || '完成'));
		else if (s && s.st === 'fail') toast((s.what || '') + '没成功：' + (s.msg || (s.log || '').split('\n').filter(Boolean).pop() || '原因不明'), true);
		if (page === 'store') loadStore().catch(() => {});
	}, 2000);
}
async function stAct(act, x) {
	if (act === 'install') {
		const from = x.src === 'iStore' ? '来自 iStore。' : x.src ? '来自第三方软件源「' + x.src + '」。' : '';
		const need = x.size ? '下载 ' + apSize(x.size) + (SC.free != null ? '，闪存剩 ' + apSize(SC.free * 1024) : '') + '。' : '';
		if (!(await confirmBox('安装「' + x.title + '」', from + need || '装好后在菜单「服务」里。', '安装'))) return;
	} else if (!(await confirmBox('更新「' + x.title + '」', x.installed + ' → ' + x.ver + '。更新时这个插件会停一下。', '更新'))) return;
	await busy(null, async () => {
		await P(act === 'install' ? 'store_install' : 'store_upgrade', { name: x.name }, 30000);
		toast((act === 'install' ? '正在安装' : '正在更新') + '「' + x.title + '」…');
		SC.state = { st: 'run' }; stDraw(); stPoll();
	});
}
async function stRefresh() {
	await busy($('stRefresh'), async () => {
		await P('store_refresh', {}, 15000);
		toast('正在更新软件源…');
		SC.state = { st: 'run' }; stDraw(); stPoll();
	}, false);
}
$('stRefresh').onclick = stRefresh;
let stQT = 0;
$('stFilter').addEventListener('input', () => { clearTimeout(stQT); stQT = setTimeout(() => { stQ = $('stFilter').value.trim(); loadStore().catch(handleErr); }, 350); });
$$('#stView .chip').forEach((b) => (b.onclick = () => { stView = b.dataset.v; if (stQ) { stQ = ''; $('stFilter').value = ''; loadStore().catch(handleErr); } else stDraw(); }));
$('stList').addEventListener('click', (e) => {
	if (e.target.closest('[data-ref]')) return stRefresh();
	const g = e.target.closest('.stgrp');
	if (g) { stOpen[g.dataset.g] = !stOpen[g.dataset.g]; stJust = stOpen[g.dataset.g] ? g.dataset.g : null; stDraw(); return; }
	const b = e.target.closest('[data-act]');
	if (!b) return;
	const x = SC.list.find((y) => y.name === b.closest('.strow').dataset.n);
	if (x) stAct(b.dataset.act, x);
});

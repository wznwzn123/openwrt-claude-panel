/* ---------- 6.0 第 19 项：软件中心（搜索、安装、更新） ----------
   只列固件自带软件源里的；默认看插件，「可更新」单独一类；搜索时什么包都搜。
   安装、更新、更新软件源都在路由器后台跑，这里每 2 秒问一次进度；卸载在「应用管理」 */
let SC = null, stView = 'plugin', stQ = '', stPollT = 0, stSeq = 0;
const stAge = (s) => (s == null ? '' : s < 3600 ? '刚更新' : s < 86400 ? Math.floor(s / 3600) + ' 小时前更新' : Math.floor(s / 86400) + ' 天前更新');
async function loadStore() {
	const seq = ++stSeq;
	const r = await P('store_list', stQ ? { q: stQ } : {}, 30000);
	if (seq !== stSeq) return;
	SC = r;
	setStatus(true, '在线');
	stDraw();
	if (r.state && r.state.st === 'run') stPoll();
}
function stDraw() {
	const r = SC;
	$('stAge').textContent = r.age == null ? '软件源没更新过' : stAge(r.age);
	$('stFree').textContent = r.free != null ? '剩 ' + apSize(r.free * 1024) : r.pm;
	$('stUpd').textContent = '可更新 ' + r.upd;
	$$('#stView .chip').forEach((b) => b.classList.toggle('on', !stQ && b.dataset.v === stView));
	const run = r.state && r.state.st === 'run';
	$('stRefresh').disabled = run;
	const l = stQ ? r.list : r.list.filter((x) => (stView === 'upd' ? x.upd : x.plugin));
	$('stTitle').textContent = stQ ? '搜索结果' : stView === 'upd' ? '可更新' : '插件';
	$('stCount').textContent = stQ && r.total > r.list.length ? r.list.length + '+' : l.length;
	const owner = ME_ROLE.role !== 'sub';
	$('stList').innerHTML = r.age == null && !r.list.length ? `<div class="empty">软件源没更新过<br><button class="btn sm blue" style="margin-top:10px" data-ref>更新软件源</button></div>`
		: l.length ? l.slice(0, 200).map((x) => `<div class="file strow" data-n="${esc(x.name)}"><div style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(x.title)}${x.installed ? ` <span class="pill" style="font-size:11px">${x.upd ? '可更新' : '已装'}</span>` : ''}</b><span class="muted ell" style="display:block;font-size:12.5px">${esc(x.name)} · ${esc(x.upd ? x.installed + ' → ' + x.ver : x.ver)}${x.size ? ' · ' + apSize(x.size) : ''}</span></div>
			${owner && !run ? (!x.installed ? '<button class="btn sm" data-act="install">安装</button>' : x.upd ? '<button class="btn sm" data-act="upgrade">更新</button>' : '') : ''}</div>`).join('')
		: `<div class="empty">${stQ ? '没有符合的' : stView === 'upd' ? '都是最新的' : '没有'}</div>`;
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
		const need = x.size ? '下载 ' + apSize(x.size) + (SC.free != null ? '，闪存剩 ' + apSize(SC.free * 1024) : '') + '。' : '';
		if (!(await confirmBox('安装「' + x.title + '」', need || '装好后在菜单「服务」里。', '安装'))) return;
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
	const b = e.target.closest('[data-act]');
	if (!b) return;
	const x = SC.list.find((y) => y.name === b.closest('.strow').dataset.n);
	if (x) stAct(b.dataset.act, x);
});

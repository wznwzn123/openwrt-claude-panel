/* ---------- 6.0 第 83 项：应用管理 ----------
   分四类：插件（luci-app / 主题）、软件（自己装的其他包）、依赖（为别的包自动装的）、系统（固件自带）。都按安装时间排，最近的在前。
   不能卸的（系统组件、固件自带、面板要用、被别的包使用）点开说原因 */
let apData = null, apView = 'plugin';
const AP_CAT = { plugin: '插件', soft: '软件', dep: '依赖', rom: '系统' };
const apCat = (x) => (x.rom ? 'rom' : x.auto ? 'dep' : x.plugin ? 'plugin' : 'soft');
async function loadApps() {
	apData = await P('app_list', {}, 30000);
	setStatus(true, '在线');
	renderApps();
}
const apSize = (b) => (!b ? '' : b >= 1048576 ? (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
function apWhen(t) {
	if (!t) return '';
	const d = new Date(t * 1000), days = Math.floor((Date.now() / 1000 - t) / 86400);
	if (days <= 0) return '今天';
	if (days < 30) return days + ' 天前';
	return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
}
function renderApps() {
	if (!apData) return;
	const kw = $('apFilter').value.trim().toLowerCase();
	const n = {}; for (const x of apData.list) n[apCat(x)] = (n[apCat(x)] || 0) + 1;
	$$('#apView .chip').forEach((b) => (b.textContent = AP_CAT[b.dataset.v] + ' ' + (n[b.dataset.v] || 0)));
	// 搜索时四类一起搜
	const l = apData.list.filter((x) => (kw ? (x.title + ' ' + x.name + ' ' + (x.desc || '')).toLowerCase().includes(kw) : apCat(x) === apView));
	$('apTitle').textContent = kw ? '搜索结果' : AP_CAT[apView];
	$('apFree').textContent = apData.free != null ? '剩 ' + apSize(apData.free * 1024) : apData.pm;
	$('apCount').textContent = l.length;
	const owner = ME_ROLE.role !== 'sub';
	$('apList').innerHTML = l.length ? l.slice(0, 300).map((x) => `<div class="file aprow" data-n="${esc(x.name)}" role="button" tabindex="0"><div style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(x.title)}${x.recent ? ' <span class="pill blue" style="font-size:11px">新装</span>' : ''}</b><span class="sub ell" style="display:block;font-size:12.5px">${esc([kw ? AP_CAT[apCat(x)] : '', apWhen(x.at), x.size ? apSize(x.size) : ''].filter(Boolean).join(' · '))}</span></div>
		${owner && !x.no && !x.users.length ? '<button class="btn sm" data-rm>卸载</button>' : ''}</div>`).join('') : `<div class="empty">${kw ? '没有符合的' : '没有'}</div>`;
}
$('apFilter').addEventListener('input', renderApps);
$$('#apView .chip').forEach((b) => (b.onclick = () => { apView = b.dataset.v; $$('#apView .chip').forEach((x) => x.classList.toggle('on', x === b)); renderApps(); }));
async function apRemove(x) {
	const what = [];
	if (/openclash/.test(x.name)) what.push('代理会停，节点、规则等页面不可用。');
	else if (x.net) what.push('可能影响上网。');
	if (apData.pm === 'opkg') what.push('只为它装的依赖一起卸掉。');
	if (!(await confirmBox('卸载 ' + x.title, what.join('\n'), '卸载', true))) return;
	toast('正在卸载…');
	try {
		const r = await P('app_remove', { name: x.name, confirm: 'REMOVE' }, 120000);
		toast('已卸载 ' + r.title + (r.freed ? '，空出 ' + apSize(r.freed * 1024) : ''));
	} catch (e) { toast(e.message, true); }
	loadApps().catch(() => {});
}
$('apList').addEventListener('click', async (e) => {
	const row = e.target.closest('[data-n]'); if (!row || !apData) return;
	const x = apData.list.find((y) => y.name === row.dataset.n); if (!x) return;
	if (e.target.closest('[data-rm]')) return apRemove(x);
	const owner = ME_ROLE.role !== 'sub';
	const rows = [['包名', x.name], ['分类', AP_CAT[apCat(x)]], ['版本', x.ver || '—'], ['大小', apSize(x.size) || '—'], ['安装时间', x.at ? new Date(x.at * 1000).toLocaleString('zh-CN', { hour12: false }) : '—']];
	if (x.users.length) rows.push(['被使用', x.users.slice(0, 6).join('、') + (x.users.length > 6 ? ' 等 ' + x.users.length + ' 个' : '')]);
	const why = x.no || (x.users.length ? '被其他包使用' : !owner ? '只有主账号能卸载' : '');
	const v = await modal(`<h3>${esc(x.title)}</h3>${x.desc ? `<p class="muted" style="margin:4px 0 8px">${esc(x.desc)}</p>` : ''}${rows.map(([k, y]) => `<div class="kv"><span>${esc(k)}</span><span style="overflow-wrap:anywhere;text-align:right">${esc(y)}</span></div>`).join('')}
		${why ? `<div class="notice" style="margin-top:10px">不能卸载：${esc(why)}</div>` : ''}
		<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-v="close">关闭</button>${why ? '' : '<button class="btn danger" data-v="rm">卸载</button>'}</div>`, null, { compact: true });
	if (v === 'rm') apRemove(x);
});

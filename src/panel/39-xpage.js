/* ---------- 6.0 第 36 项：远程页面——在外面打开路由器上其他端口的页面 ----------
 * 托管版：点「打开」，官网把「子域名-x」切到这个页面（同一时间只开一个），几秒后在新标签页打开；
 * 自建版：给教程；本地版：在家里直接打开（局域网地址）。只有主账号能用。 */
const XP = { d: null };
const XP_DOC = 'https://github.com/wznwzn123/openwrt-claude-panel/blob/main/docs/remote-pages.md';
async function loadXpage() {
	XP.d = await P('xp_get');
	setStatus(true, '在线');
	xpRender();
}
function xpRender() {
	const d = XP.d;
	if (!d) return;
	const cur = d.list.find((x) => x.port === d.cur);
	const head = d.mode === 'self' ? `<div class="notice" style="margin-top:12px">自建版要在你自己的 Cloudflare 里加一个地址</div><a class="btn" href="${XP_DOC}" target="_blank" rel="noopener" style="display:flex;justify-content:center;margin-top:10px">看教程</a>`
		: d.mode === 'local' ? '<div class="notice" style="margin-top:12px">本地版：连着家里 Wi-Fi 时直接打开</div>'
		: cur ? `<div class="notice xpcur" style="margin-top:12px"><span>正在开着：${esc(cur.name)}</span><button class="btn sm" id="xpClose" type="button">关掉</button></div>` : '';
	const row = (x) => {
		const sub = [x.https ? 'https' : '', '端口 ' + x.port, x.port === d.cur && d.mode === 'hosted' ? '正在用' : '', x.up ? '' : '没在运行'].filter(Boolean).join(' · ');
		const act = d.mode === 'hosted' ? `<button class="btn sm${x.up ? ' blue' : ''}" type="button" data-xo="${esc(x.id)}"${x.up ? '' : ' disabled'}>打开</button>`
			: d.mode === 'local' && d.lan && x.up ? `<a class="btn sm blue" href="${x.https ? 'https' : 'http'}://${esc(d.lan)}:${x.port}${esc(x.path || '/')}" target="_blank" rel="noopener">打开</a>` : '';
		return `<div class="file xprow"><div style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(x.name)}</b><span class="muted ell" style="display:block;font-size:12.5px">${esc(sub)}</span></div>${x.auto ? '' : `<button class="btn sm" type="button" data-xd="${x.port}">删除</button>`}${act}</div>`;
	};
	$('xpBody').innerHTML = `${head}<section class="card list" style="margin-top:12px">${d.list.length ? d.list.map(row).join('') : '<div class="empty">没找到能打开的页面</div>'}</section>
		<button class="btn" id="xpAdd" type="button" style="width:100%;margin-top:12px">添加页面</button>`;
}
async function xpAdd() {
	const v = await modal(`<h3>添加页面</h3>
		<div class="fld"><div class="lb"><b>名字</b></div><div class="ctl"><input class="input" data-a="name" placeholder="Docker 管理" maxlength="40"></div></div>
		<div class="fld"><div class="lb"><b>端口</b></div><div class="ctl"><input class="input" data-a="port" inputmode="numeric" placeholder="9000"></div></div>
		<div class="fld"><div class="lb"><b>路径（选填）</b></div><div class="ctl"><input class="input mono" data-a="path" placeholder="/" autocapitalize="off" spellcheck="false"></div></div>
		<label class="fld row"><div class="lb"><b>https</b></div><label class="sw"><input type="checkbox" data-a="https" aria-label="https"><i></i></label></label>
		<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-v="close">取消</button><button class="btn primary" data-ok>添加</button></div>`,
	(m, close) => {
		m.querySelector('[data-ok]').onclick = () => {
			const g = (k) => m.querySelector(`[data-a="${k}"]`);
			if (!g('name').value.trim()) return g('name').focus();
			if (!g('port').value.trim()) return g('port').focus();
			close({ name: g('name').value.trim(), port: g('port').value.trim(), path: g('path').value.trim() || '/', https: g('https').checked });
		};
	});
	if (!v || typeof v !== 'object') return;
	try { XP.d = await P('xp_set', { op: 'add', ...v }); xpRender(); toast('已添加：' + v.name); } catch (e) { toast(e.message, true); }
}
$('xpBody').addEventListener('click', async (e) => {
	if (e.target.id === 'xpAdd') return xpAdd();
	if (e.target.id === 'xpClose') return busy(e.target, async () => { try { await P('xp_close', {}, 30000); XP.d.cur = 0; xpRender(); toast('已关掉'); } catch (er) { toast(er.message, true); } });
	const del = e.target.closest('[data-xd]');
	if (del) {
		const x = XP.d.list.find((y) => String(y.port) === del.dataset.xd);
		if (!x || !(await confirmBox('删除「' + x.name + '」', '只从列表里删掉，不影响这个页面本身。', '删除', true))) return;
		try { XP.d = await P('xp_set', { op: 'del', port: x.port }); xpRender(); toast('已删除：' + x.name); } catch (er) { toast(er.message, true); }
		return;
	}
	const b = e.target.closest('[data-xo]');
	if (!b) return;
	// 先开好新标签页（不然浏览器会当成弹窗挡掉），等官网切好再跳过去
	const w = window.open('', '_blank');
	busy(b, async () => {
		try {
			const r = await P('xp_open', { id: b.dataset.xo }, 40000);
			XP.d.cur = XP.d.list.find((x) => x.id === b.dataset.xo)?.port || 0; xpRender();
			await xpGo(w, r);
		} catch (er) { if (w) w.close(); toast(er.message, true); }
	});
});
// 等官网切好再跳；新标签页被浏览器挡掉了就给一个「打开」按钮
async function xpGo(w, r) {
	toast('正在打开 ' + r.name + '…');
	await new Promise((z) => setTimeout(z, (r.wait || 5) * 1000));
	if (w && !w.closed) w.location.href = r.url;
	else modal(`<h3>${esc(r.name)}</h3><div class="btngrid" style="margin:14px 0 0;grid-template-columns:1fr"><a class="btn primary" href="${esc(r.url)}" target="_blank" rel="noopener" data-v="close">打开</a></div>`, null, { compact: true });
}
// 完整原版后台里点到的「路由器:端口」页面（lfx.js 拦下来转给这里）：用远程页面的地址打开
window.addEventListener('message', (e) => {
	if (e.origin !== location.origin || !e.data || e.data.cmcpx !== 1) return;
	const d = e.data, q = { port: +d.port, https: !!d.https, path: String(d.path || '/').slice(0, 500) };
	// 嵌着的页面：等官网切好，把地址交回去，在原处打开
	if (d.inline) {
		const back = (o) => { try { e.source.postMessage({ cmcpxr: 1, id: d.inline, ...o }, location.origin); } catch (x) {} };
		P('xp_open', q, 40000).then(async (r) => { await new Promise((z) => setTimeout(z, (r.wait || 5) * 1000)); back({ url: r.url }); }).catch((er) => back({ err: er.message }));
		return;
	}
	const w = window.open('', '_blank');
	P('xp_open', q, 40000).then((r) => xpGo(w, r)).catch((er) => { if (w) w.close(); toast(er.message, true); });
});

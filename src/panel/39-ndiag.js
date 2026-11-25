/* ---------- 6.0 第 21 项：网络诊断（Ping、路由追踪、域名查询） ----------
   路由器那边只收域名或 IP；固件没带的工具，按钮点了说原因。最近查过的 5 个记在本机，点一下再查 */
let ndTool = 'ping', ndCaps = null;
const ND_NAME = { ping: 'Ping', trace: '路由追踪', dns: '域名查询' };
const ND_ING = { ping: '正在 Ping…', trace: '正在追踪…', dns: '正在查询…' };
const ND_NO = { ping: '不能 Ping：固件没带 ping', trace: '不能追踪路由：固件没带 traceroute', dns: '不能查询域名：固件没带 nslookup' };
const ndRecentGet = () => { try { const a = JSON.parse(localStorage.getItem('rp_ndrecent') || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, 5) : []; } catch (e) { return []; } };
function ndRecentDraw() {
	const a = ndRecentGet();
	$('ndRecent').innerHTML = a.map((x) => `<button class="chip" type="button" data-a="${esc(x)}">${esc(x)}</button>`).join('');
	$('ndRecent').classList.toggle('hidden', !a.length);
}
async function loadNdiag() {
	ndRecentDraw();
	if (!ndCaps) { try { ndCaps = await P('netdiag_caps', {}); } catch (e) { ndCaps = null; } }
	$$('#ndTool .chip').forEach((b) => b.classList.toggle('off', !!ndCaps && ndCaps[b.dataset.nt] === false));
	setStatus(true, '在线');
}
const ndMs = (v) => (v == null ? '—' : (v >= 100 ? Math.round(v) : +v.toFixed(1)) + ' ms');
const ndFake = (f) => (f ? '<span class="pill">Fake-IP</span>' : '');
function ndDraw(r) {
	let h = '';
	if (r.tool === 'ping') {
		const lv = r.recv === 0 ? 'bad' : r.loss > 0 ? 'warn' : 'good';
		h = `<div class="sectitle"><b class="ell">${esc(r.addr)}</b><span class="ndtags">${r.ip && r.ip !== r.addr ? `<span class="pill">${esc(r.ip)}</span>` : ''}${ndFake(r.fake)}</span></div>
		<section class="card"><div class="ndst">
			<div><b class="${lv === 'bad' ? 'ndbad' : ''}">${r.recv === 0 ? '不通' : ndMs(r.avg)}</b><span>平均</span></div>
			<div><b class="${lv === 'good' ? '' : lv === 'warn' ? 'ndwarn' : 'ndbad'}">${r.loss == null ? '—' : r.loss + '%'}</b><span>丢包</span></div>
			<div><b>${ndMs(r.min)}</b><span>最快</span></div>
			<div><b>${ndMs(r.max)}</b><span>最慢</span></div>
		</div></section>
		<section class="card list">${r.times.length ? r.times.map((t, i) => `<div class="file"><span style="flex:1">第 ${i + 1} 个</span><b>${ndMs(t)}</b></div>`).join('') : '<div class="empty">都没有回应</div>'}</section>`;
	} else if (r.tool === 'trace') {
		h = `<div class="sectitle"><b class="ell">${esc(r.addr)}</b><span class="ndtags"><span class="pill">${r.done ? '已到达' : '没到终点'}</span>${ndFake(r.fake)}</span></div>
		<section class="card list">${r.hops.map((x) => `<div class="file"><span class="ndhop">${x.n}</span><span class="ell" style="flex:1;min-width:0">${x.ip ? esc(x.ip) : '<span class="muted">没回应</span>'}</span><b>${x.ms == null ? '' : ndMs(x.ms)}</b></div>`).join('')}</section>`;
	} else {
		h = `<div class="sectitle"><b class="ell">${esc(r.addr)}</b><span class="ndtags">${r.server ? `<span class="pill">DNS ${esc(r.server)}</span>` : ''}${ndFake(r.fake)}</span></div>
		<section class="card list">${r.ips.map((ip) => `<div class="file"><span class="ell" style="flex:1;min-width:0">${esc(ip)}</span><span class="muted">${ip.includes(':') ? 'IPv6' : 'IPv4'}</span></div>`).join('')}</section>
		${r.cname.length ? `<div class="sectitle"><b>别名</b></div><section class="card list">${r.cname.map((c) => `<div class="file"><span class="ell" style="flex:1;min-width:0">${esc(c)}</span></div>`).join('')}</section>` : ''}`;
	}
	$('ndOut').innerHTML = h;
}
async function ndRun() {
	const addr = $('ndAddr').value.trim();
	if (!addr) return $('ndAddr').focus();
	if (ndCaps && ndCaps[ndTool] === false) return toast(ND_NO[ndTool], true);
	$('ndAddr').blur();
	$('ndOut').innerHTML = `<div class="sectitle"><b>${esc(addr)}</b></div><section class="card"><div class="empty"><span class="spin">↻</span> ${ND_ING[ndTool]}</div></section>`;
	const r = await busy($('ndGo'), () => P('netdiag', { tool: ndTool, addr }, 70000), false);
	if (!r) { $('ndOut').innerHTML = ''; return; }
	try { const a = ndRecentGet().filter((x) => x !== addr); a.unshift(addr); localStorage.setItem('rp_ndrecent', JSON.stringify(a.slice(0, 5))); } catch (e) {}
	ndRecentDraw();
	ndDraw(r);
}
$('ndForm').addEventListener('submit', (e) => { e.preventDefault(); ndRun(); });
$$('#ndTool .chip').forEach((b) => (b.onclick = () => {
	if (b.classList.contains('off')) return toast(ND_NO[b.dataset.nt], true);
	ndTool = b.dataset.nt; $$('#ndTool .chip').forEach((x) => x.classList.toggle('on', x === b));
	$('ndAddr').placeholder = ndTool === 'dns' ? '域名' : '域名或 IP';
	$('ndOut').innerHTML = '';
}));
$('ndRecent').addEventListener('click', (e) => { const c = e.target.closest('[data-a]'); if (!c) return; $('ndAddr').value = c.dataset.a; ndRun(); });

(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 低端路由器（单核，或者内存 256 MB 及以下）：概览、连接页自动刷新放慢一倍（8 秒一次），少占路由器 CPU
let lowRouter = false, lowTick = 0;
const store = {
	get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
	set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
	del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};

/* 代理插件（OpenClash、Nikki、PassWall、PassWall2、HomeProxy、SSR Plus+）：正在用哪个，侧边栏和概览按它显示 */
let PXS = null; try { PXS = JSON.parse(store.get('rp_px') || 'null'); } catch (e) {}
const PX_LUCI = { openclash: 'admin/services/openclash', nikki: 'admin/services/nikki', passwall: 'admin/services/passwall', passwall2: 'admin/services/passwall2', homeproxy: 'admin/services/homeproxy', shadowsocksr: 'admin/services/shadowsocksr' };
// 正在用的插件；还没读到（老版本路由器）当成 OpenClash
const pxAct = () => !PXS ? { id: 'openclash', name: 'OpenClash', kind: 'clash', enabled: true, running: true } : (PXS.list || []).find((x) => x.id === PXS.active) || null;
const pxOC = () => pxAct()?.id === 'openclash';
// 侧边栏：只显示用得上的页面（oc = 只有 OpenClash 有；clash = OpenClash / Nikki 都有）
function pxShow(it) {
	if (!it || !it.px || !PXS) return true;
	const a = pxAct();
	if (it.px === 'oc') return (PXS.list || []).some((x) => x.id === 'openclash');
	if (it.px === 'clash') return !!a && a.kind === 'clash';
	return true;
}
// 「添加新手机」扫码打开：网址带 #login=密钥（# 后面的内容浏览器不会发给服务器），存好后马上从地址栏去掉
// 托管版安装完终端里给的链接还带着配对码（#login=密钥&pair=配对码）：输登录码那一页会带着去官网绑定账号
try { const m = /^#login=([A-Za-z0-9]{16,64})(?:&pair=([A-Za-z0-9]{8}))?$/.exec(location.hash); if (m) { localStorage.setItem('rp_token', m[1]); if (m[2]) localStorage.setItem('rp_pair', JSON.stringify({ code: m[2].toUpperCase(), exp: Date.now() + 10 * 60e3 })); history.replaceState(null, '', location.pathname + location.search); } } catch (e) {}
// 官网「获取登录码 → 打开面板」：网址带 #code=登录码，自动填好
let pendCode = '';
try { const m = /^#code=([A-Za-z0-9]{8})$/.exec(location.hash); if (m) { pendCode = m[1].toUpperCase(); history.replaceState(null, '', location.pathname + location.search); } } catch (e) {}
let token = store.get('rp_token') || store.get('cmcp_token');
let seq = 0;
class AuthError extends Error {}
// 托管版：这台手机还没输过登录码
class NeedCodeError extends Error {}
// 连不上路由器时带上原因（short 显示在顶部状态里）
class OfflineError extends Error { constructor(msg, short) { super(msg); this.short = short; } }

/* ---------- 和路由器通信 ---------- */
// 只读的请求：卡住 10 秒就自动再试一次（网络偶尔丢一个请求很常见，没必要让页面干等 60 秒）
// 会改动东西的请求不自动重试，免得执行两次；本身就要联网测很久的（IP 检查、解锁检测、诊断）给足时间
const READS = new Set(['live', 'home_stats', 'overview', 'oc_state', 'jobs', 'wd', 'black_state', 'cloud_info', 'groups', 'providers', 'connections', 'oc_sections', 'files', 'file_read', 'dashboard_state', 'oc_schema', 'logs', 'rules', 'core_ps', 'fs_list', 'fs_read', 'node_check', 'slog', 'procs', 'luci_key',
	'tools/call:system_info', 'tools/call:network_info', 'tools/call:firewall_overview', 'tools/call:list_services', 'tools/call:system_log']);
async function rpc(method, params, timeoutMs) {
	const key = method === 'tools/call' ? 'tools/call:' + (params && params.name) : method.replace(/^panel\//, '');
	const read = READS.has(key);
	const tmo = timeoutMs || (read ? 10000 : 30000);
	for (let attempt = 0; ; attempt++) {
		try { return await rpcOnce(method, params, tmo); }
		catch (e) {
			if (read && attempt === 0 && e instanceof OfflineError && ['超时', '离线'].includes(e.short)) continue;
			throw e;
		}
	}
}
async function rpcOnce(method, params, timeoutMs) {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), timeoutMs);
	let r;
	try {
		r = await fetch('../cgi-bin/mcp/' + encodeURIComponent(token), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, params: params || {}, client: 'panel', dev: store.get('rp_dev') || undefined }),
			signal: ctl.signal, cache: 'no-store',
		});
	} catch (e) {
		if (e.name === 'AbortError') throw new OfflineError('请求超时：路由器太久没回应', '超时');
		if (navigator.onLine === false) throw new OfflineError('你的手机现在没联网', '手机没网');
		throw new OfflineError('连不上路由器（网络断开或路由器在重启）', '离线');
	} finally { clearTimeout(timer); }
	if (r.status === 404) throw new AuthError('密钥无效');
	if (r.status === 530) throw new OfflineError('隧道断开（Cloudflare 1033）：路由器没连上 Cloudflare，可能是断电、家里断网或隧道掉线，看门狗会在 1 分钟内自动重连', '隧道断开');
	// 502 有两种情况：路由器刚断电/断网（Cloudflare 还没发现隧道没了），或面板服务卡住；从手机这边分不清
	if (r.status === 502 || r.status === 503) throw new OfflineError('路由器没有回应：可能刚断电或断网（Cloudflare 要过一两分钟才会发现，之后会显示「隧道断开」），也可能是面板服务卡住了（看门狗会自动重启它）', '无响应');
	if (r.status === 504 || r.status === 524) throw new OfflineError('路由器处理超时，可能正忙或卡住了', '超时');
	if (!r.ok) throw new Error('路由器返回 ' + r.status);
	const j = await r.json();
	if (j.error && j.error.code === -32010) { needCode(j.error.data); throw new NeedCodeError(j.error.message); }
	if (j.error) throw new Error(j.error.message);
	return j.result;
}
const P = (m, a, t) => rpc('panel/' + m, a, t);
// 面板脚本出错（5.0）：经路由器转给开发者（只带错误本身、手机型号和屏幕大小）；同一条只报一次，一次打开最多报 3 条
const errSent = new Set();
function reportErr(msg, stack, where) {
	try {
		msg = String(msg || '').slice(0, 300);
		if (!msg || errSent.has(msg) || errSent.size >= 3 || /ResizeObserver loop|Script error\.?$|NetworkError|Failed to fetch|Load failed|OfflineError|请求超时/.test(msg)) return;
		errSent.add(msg);
		const ua = navigator.userAgent, dev = /iPhone|iPad/.test(ua) ? '苹果' : /Android/.test(ua) ? '安卓' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : '其它';
		const br = /EdgA?\//.test(ua) ? 'Edge' : /MicroMessenger/.test(ua) ? '微信' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '浏览器';
		P('client_error', { msg, stack: String(stack || '').slice(0, 800), where: String(where || '').replace(/[?#].*$/, '').slice(-120), page: typeof page === 'string' ? page : '', ua: dev + ' · ' + br, w: innerWidth, h: innerHeight }).catch(() => {});
	} catch (e) {}
}
addEventListener('error', (e) => { if (e && e.message) reportErr(e.message, e.error && e.error.stack, e.filename); });
// 没接住的 Promise：只报程序本身的错（TypeError 这类）；路由器回的业务错误、断网不报
addEventListener('unhandledrejection', (e) => { const r = e && e.reason; if (r instanceof TypeError || r instanceof ReferenceError || r instanceof RangeError || r instanceof SyntaxError) reportErr(r.message, r.stack, location.pathname); });
async function tool(name, args, timeoutMs) {
	const res = await rpc('tools/call', { name, arguments: args || {} }, timeoutMs);
	const text = (res.content && res.content[0] && res.content[0].text) || '';
	if (res.isError) throw new Error(text.replace(/^出错：/, ''));
	return text;
}

/* ---------- 格式化 ---------- */
function bytes(n) {
	n = +n || 0;
	if (n < 1024) return [n.toFixed(0), 'B'];
	const u = ['KB', 'MB', 'GB', 'TB', 'PB']; let i = -1;
	do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
	return [n >= 100 ? n.toFixed(0) : n.toFixed(1), u[i]];
}
const B = (n) => bytes(n).join(' ');
const rate = (n) => { const [v, u] = bytes(n); return `${v}<span class="unit">${u}/s</span>`; };
function dur(s) {
	s = Math.floor(+s || 0);
	const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
	return d ? `${d} 天 ${h} 小时` : h ? `${h} 小时 ${m} 分` : `${m} 分钟`;
}
const ts = (t) => t ? new Date(t * 1000).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const ago = (iso) => { if (!iso) return '—'; const s = (Date.now() - new Date(iso).getTime()) / 1000; return s < 60 ? '刚刚' : s < 3600 ? Math.round(s / 60) + ' 分钟前' : s < 86400 ? Math.round(s / 3600) + ' 小时前' : Math.round(s / 86400) + ' 天前'; };
function delayPill(d) {
	if (d == null) return '<span class="pill">未测</span>';
	if (d === 0) return '<span class="pill red">超时</span>';
	return `<span class="pill ${d < 200 ? 'good' : d < 500 ? 'warnc' : 'red'}">${d} ms</span>`;
}
const base = (p) => String(p || '').split('/').pop();

/* ---------- 提示与弹窗 ---------- */
let toastT = 0, toastX = 0;
function toast(s, err) {
	s = String(s ?? '');
	const t = $('toast'), dur = Math.min(7000, 2800 + Math.max(0, s.length - 24) * 60);
	const shown = !t.classList.contains('hidden') && !t.classList.contains('out');
	clearTimeout(toastT); clearTimeout(toastX);
	t.firstElementChild.textContent = s;
	t.className = 'toast' + (err ? ' err' : '');
	t.style.setProperty('--d', dur + 'ms');
	const bar = t.lastElementChild; bar.replaceWith(bar.cloneNode());
	void t.offsetWidth;
	t.classList.add(shown ? 're' : 'in');
	toastT = setTimeout(toastHide, dur);
}
function toastHide() {
	const t = $('toast');
	clearTimeout(toastT);
	if (t.classList.contains('hidden') || t.classList.contains('out')) return;
	t.classList.add('out');
	toastX = setTimeout(() => { t.className = 'toast hidden'; }, 260);
}
$('toast').onclick = toastHide;
function modal(html, onMount) {
	return new Promise((resolve) => {
		const m = document.createElement('div');
		m.className = 'modal';
		m.innerHTML = `<div class="modalbox" role="dialog">${html}</div>`;
		const close = (v) => {
			if (m.classList.contains('closing')) return;
			m.classList.add('closing');
			setTimeout(() => m.remove(), 300);
			resolve(v);
		};
		m.addEventListener('click', (e) => {
			if (e.target === m) return m.dataset.lock ? null : close(null);
			const b = e.target.closest('[data-v]');
			if (b) close(b.dataset.v === 'true' ? true : b.dataset.v === 'false' ? false : b.dataset.v);
		});
		document.body.appendChild(m);
		if (onMount) onMount(m, close);
	});
}
const confirmBox = (title, text, ok = '确定', danger = false) => modal(
	`<h3>${esc(title)}</h3><div class="notice" style="color:var(--text);line-height:1.6;white-space:pre-line">${esc(text)}</div>
	<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-v="false">取消</button><button class="btn ${danger ? 'danger' : 'primary'}" data-v="true">${esc(ok)}</button></div>`);
const textBox = (title, text) => modal(
	`<div class="sheethead"><h3>${esc(title)}</h3><div class="actions" style="flex-wrap:nowrap"><button class="btn sm" data-copy>复制</button><button class="btn sm" data-v="close">关闭</button></div></div><pre class="out">${esc(text)}</pre>`,
	(m) => { m.querySelector('[data-copy]').onclick = () => copyText(text); });
const promptBox = (title, ph, val = '') => modal(
	`<h3>${esc(title)}</h3><input class="input" placeholder="${esc(ph)}" value="${esc(val)}" autocapitalize="off" spellcheck="false">
	<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-v="false">取消</button><button class="btn primary" data-ok>确定</button></div>`,
	(m, close) => {
		const i = m.querySelector('input');
		const ok = () => close(i.value.trim());
		m.querySelector('[data-ok]').onclick = ok;
		i.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
		setTimeout(() => i.focus(), 60);
	}).then((v) => (v === false || v === null ? null : v));
async function copyText(t) {
	try { await navigator.clipboard.writeText(t); toast('已复制'); }
	catch (e) {
		const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select();
		try { document.execCommand('copy'); toast('已复制'); } catch (x) { toast('复制失败，请长按选择', true); }
		a.remove();
	}
}
function download(url, name) {
	const a = document.createElement('a'); a.href = url; a.download = name || ''; a.rel = 'noopener';
	document.body.appendChild(a); a.click(); a.remove();
}
function pickFile(accept) {
	return new Promise((resolve) => {
		const i = document.createElement('input'); i.type = 'file'; if (accept) i.accept = accept;
		i.onchange = () => resolve(i.files && i.files[0] || null);
		i.click();
	});
}
const readText = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('读取文件失败')); r.readAsText(f); });
const readB64 = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => no(new Error('读取文件失败')); r.readAsDataURL(f); });

function handleErr(e) {
	if (e instanceof NeedCodeError) return;
	if (e instanceof AuthError) return logout('密钥已失效，请重新粘贴连接地址');
	toast(e.message || String(e), true);
}
let loadN = 0, loadT = 0;
function loadOn() { if (loadN++ === 0) loadT = setTimeout(() => $('tload').classList.add('on'), 120); }
function loadOff() { if (--loadN <= 0) { loadN = 0; clearTimeout(loadT); $('tload').classList.remove('on'); } }
async function busy(btn, fn, label) {
	const old = btn ? btn.innerHTML : '';
	if (btn) { btn.disabled = true; if (label !== false) btn.innerHTML = '<span class="spin">↻</span>' + (label ? ' ' + esc(label) : ''); }
	else loadOn();
	try { return await fn(); } catch (e) { handleErr(e); } finally { if (btn) { btn.disabled = false; btn.innerHTML = old; } else loadOff(); }
}
function setStatus(ok, text) {
	$('statusDot').className = 'dot ' + (ok ? 'on' : 'off');
	$('statusText').textContent = text;
}

/* ---------- 共享数据 ---------- */
const S = { schema: {}, state: null, stateAt: 0, dash: null };
async function state(force) {
	if (force || !S.state || Date.now() - S.stateAt > 30000) { S.state = await P('oc_state'); S.stateAt = Date.now(); }
	return S.state;
}
async function schema(page) {
	if (!S.schema[page]) S.schema[page] = await P('oc_schema', { page });
	return S.schema[page];
}
const MODE = { rule: '规则', global: '全局', direct: '直连' };
const RUNM = { 'fake-ip': 'Fake-IP 增强', 'fake-ip-tun': 'TUN', 'fake-ip-mix': 'TUN 混合', 'redir-host': 'Redir-Host', 'redir-host-tun': 'Redir-Host TUN', 'redir-host-mix': 'Redir-Host 混合' };

/* ---------- 后台任务（订阅、GEO、内核更新）---------- */
const JOBN = { sub: '订阅更新', geo: 'GEO 更新', chnroute: '大陆白名单', core: '内核更新', plugin: '插件更新', debug: '调试日志', service: 'OpenClash 启停' };
let jobTimer = null, jobSeen = false;
function watchJobs() {
	clearTimeout(jobTimer);
	jobSeen = false;
	let n = 0;
	const tick = async () => {
		n++;
		try {
			const r = await P('jobs', {}, 15000);
			const run = Object.keys(r.jobs || {}).filter((k) => r.jobs[k]);
			$('jobPill').classList.toggle('hidden', !run.length);
			$('jobText').textContent = run.map((k) => JOBN[k] || k).join('、') + '中';
			$('jobPill').setAttribute('aria-label', $('jobText').textContent);
			if (run.length) jobSeen = true;
			if (!run.length && (jobSeen || n > 4)) {
				if (jobSeen) { toast('后台任务已完成'); S.state = null; if (LOAD[page]) refresh(true); }
				return;
			}
		} catch (e) {}
		if (n < 200) jobTimer = setTimeout(tick, 3000);
	};
	jobTimer = setTimeout(tick, 1500);
}

/* ---------- 页面切换 ---------- */
const TITLES = { main: '首页', home: '我的路由器', proxy: '节点', subs: '配置订阅', cfg: '配置文件', ow: '覆写设置', rules: '规则', set: '插件设置', log: 'OpenClash 日志', dev: '设备', black: '拉黑名单', conn: '连接', traf: '流量统计', speed: '网速测试', cbk: '云端备份', wd: '断线记录', auto: '自动任务', term: '终端', files: '文件管理', more: '系统操作', slog: '系统日志', proc: '进程', myfb: '我的反馈', notice: '通知', chat: '实时联系开发者' };
/* 侧边栏目录：{p} 是面板自己的页面；[路径, 名称] 是在面板里打开的 Kwrt 原版页面；kids 是可展开的下一级 */
// 首页：不归任何分类，放在最上面
const NAV_TOP = { p: 'main', i: '⌂', t: '首页' };
const NAV = [
	{ g: '状态', items: [
		{ p: 'home', i: '◉', t: '概览' },
		{ p: 'conn', i: '⇄', t: '连接', px: 'clash' },
		{ p: 'traf', i: '▥', t: '流量统计' },
		{ p: 'speed', i: '⏱', t: '网速测试' },
		{ p: 'wd', i: '♥', t: '断线记录' },
		{ p: 'auto', i: '⟳', t: '自动任务' },
		{ p: 'slog', i: '≣', t: '系统日志' },
		{ p: 'proc', i: '▦', t: '进程' },
		{ t: '实时监控', i: '∿', kids: [['admin/status/realtime/bandwidth', '实时流量'], ['admin/status/realtime/load', '系统负载'], ['admin/status/realtime/connections', '连接统计'], ['admin/status/realtime/wireless', '无线信号']] },
		{ t: '更多状态', i: '…', kids: [['admin/status/overview', '状态总览'], ['admin/status/routesj', '路由表'], ['admin/status/iptables', '防火墙状态'], ['admin/status/wifihistory', '无线连接历史'], ['admin/status/channel_analysis', '信道分析']] },
	] },
	{ g: '代理', items: [
		{ p: 'proxy', i: '⇢', t: '节点', px: 'clash' },
		{ p: 'subs', i: '⇣', t: '订阅', px: 'oc' },
		{ p: 'cfg', i: '▤', t: '配置文件', px: 'oc' },
		{ p: 'ow', i: '✎', t: '覆写设置', px: 'oc' },
		{ p: 'rules', i: '☰', t: '规则', px: 'oc' },
		{ p: 'black', i: '⊘', t: '拉黑名单', px: 'oc' },
		{ p: 'set', i: '⚙', t: '插件设置', px: 'oc' },
		{ p: 'log', i: '≡', t: 'OpenClash 日志', px: 'oc' },
		{ t: 'OpenClash 原版', i: 'C', kids: [['admin/services/openclash/client', '运行状态'], ['admin/services/openclash/settings', '插件设置'], ['admin/services/openclash/config-overwrite', '覆写设置'], ['admin/services/openclash/config-subscribe', '配置订阅'], ['admin/services/openclash/config', '配置管理'], ['admin/services/openclash/log', '运行日志']] },
		{ t: 'PassWall', i: 'P', kids: [['admin/services/passwall/settings', '基本设置'], ['admin/services/passwall/node_list', '节点列表'], ['admin/services/passwall/node_subscribe', '节点订阅'], ['admin/services/passwall/rule', '规则管理'], ['admin/services/passwall/acl', '访问控制'], ['admin/services/passwall/haproxy', '负载均衡'], ['admin/services/passwall/other', '其他设置'], ['admin/services/passwall/app_update', '组件更新'], ['admin/services/passwall/server', '服务端'], ['admin/services/passwall/log', '运行日志']] },
	] },
	{ g: '网络', items: [
		{ p: 'dev', i: '▢', t: '设备' },
		['admin/network/network', '接口', '⇋'],
		['admin/network/interfaceconfig', '网口', '⌂'],
		['admin/network/wireless', '无线', '◠'],
		['admin/network/dhcp', 'DHCP', '⊕'],
		['admin/network/dns', 'DNS', '◇'],
		['admin/network/routes', '静态路由', '↱'],
		['admin/network/diagnostics', '网络诊断', '✓'],
		{ t: '防火墙', i: '▥', kids: [['admin/network/firewall/zones', '常规设置'], ['admin/network/firewall/forwards', '端口转发'], ['admin/network/firewall/rules', '通信规则'], ['admin/network/firewall/snats', 'NAT 规则'], ['admin/network/firewall/ipsets', 'IP 集'], ['admin/network/firewall/custom', '自定义规则']] },
	] },
	{ g: '服务', noic: 1, items: [
		{ t: 'AdGuard Home', i: 'A', kids: [['admin/services/adguardhome/status', '运行状态'], ['admin/services/adguardhome/config', '设置'], ['admin/services/adguardhome/logs', '日志']] },
		{ t: '应用过滤', i: '◎', kids: [['admin/services/oaf/dashboard', '仪表盘'], ['admin/services/oaf/users', '用户列表'], ['admin/services/oaf/app_filter', '应用过滤'], ['admin/services/oaf/mac_filter', '访问控制'], ['admin/services/oaf/whitelist', '白名单'], ['admin/services/oaf/app_record', '应用记录'], ['admin/services/oaf/feature', '特征库'], ['admin/services/oaf/advanced', '设置']] },
		{ t: 'Docker', i: 'D', kids: [['admin/dockerman/overview', '概览'], ['admin/dockerman/containers', '容器'], ['admin/dockerman/images', '镜像'], ['admin/dockerman/networks', '网络'], ['admin/dockerman/volumes', '存储卷'], ['admin/dockerman/events', '事件'], ['admin/dockerman/configuration', '设置']] },
		['admin/services/upnp', 'UPnP', '⇅'],
		['admin/store', 'iStore 应用商店', '⊞'],
		['admin/services/linkease', '易有云', '☁'],
		['admin/services/fastnet', 'FastNet', '»'],
	] },
	{ g: '系统', items: [
		{ p: 'more', i: '⌘', t: '系统操作' },
		['admin/system/system', '系统设置', '⚙'],
		{ t: '管理权', i: '⚿', kids: [['admin/system/admin/password', '路由器密码'], ['admin/system/admin/dropbear', 'SSH 访问'], ['admin/system/admin/sshkeys', 'SSH 密钥'], ['admin/system/admin/uhttpd', 'HTTP(S) 访问'], ['admin/system/admin/repokeys', '软件源公钥']] },
		['admin/package-manager', '软件包', '⬚'],
		['admin/system/startup', '启动项', '▶'],
		['admin/system/crontab', '计划任务', '◷'],
		{ t: '存储', i: '◫', kids: [['admin/system/mounts', '挂载点'], ['admin/system/diskman', '磁盘管理'], ['admin/system/partexp', '分区扩容'], ['admin/nas/raid', 'RAID'], ['admin/nas/smart', '硬盘健康 S.M.A.R.T.']] },
		{ t: '硬件', i: '▣', kids: [['admin/system/cpufreq', 'CPU 频率'], ['admin/system/leds', 'LED 灯']] },
		{ t: '高级', i: '✱', kids: [['admin/system/sysctl', '内核参数'], ['admin/system/advancedplus', '高级设置'], ['admin/system/syscontrol', '内存释放'], ['admin/system/argon-config', '主题设置'], ['admin/system/wizard', '设置向导']] },
		['admin/system/flash', '备份 / 升级', '⇪'],
	] },
	{ g: '工具', items: [
		{ p: 'term', i: '›_', t: '终端' },
		{ p: 'files', i: '▣', t: '文件管理' },
		{ p: 'cbk', i: '☁', t: '云端备份' },
		['admin/quickstart', 'LuCI 首页', '⌂'],
	] },
	{ g: '消息与帮助', items: [
		{ p: 'notice', i: '🔔', t: '通知' },
		{ p: 'chat', i: '💬', t: '实时联系开发者' },
		{ p: 'myfb', i: '✉', t: '我的反馈' },
	] },
];
const NAVK = {}; // 'k:路径' → { t, path: [分组, 上级] }
(() => {
	const leaf = (x, path) => { if (Array.isArray(x)) NAVK['k:' + x[0]] = { t: x[1], path }; };
	for (const g of NAV) for (const it of g.items) {
		leaf(it, [g.g]);
		if (it.kids) it.kids.forEach((k) => leaf(k, [g.g, it.t]));
	}
})();
// 新装的插件：读 Kwrt 后台菜单，侧边栏里没有的自动放进「服务」（这一组不带图标）
// （下面这些面板里已经有自己的版本：系统操作里的重启/关机/释放内存、文件管理、终端、系统日志、进程、iStore）
const NAV_SKIP = ['admin/system/shutdown', 'admin/system/release_ram', 'admin/system/filemanager', 'admin/system/reboot', 'admin/services/ttyd', 'admin/services/store', 'admin/status/logs', 'admin/status/processes'];
// 写死在侧边栏里的原版页面：没出现在菜单里但能打开的（只要带来它的插件在），或者别的固件上换了地址的
const NAV_ALIAS = { 'admin/store': ['admin/services/store'], 'admin/quickstart': ['admin/index'] };
const NAV_FALLBACK = { 'admin/quickstart': 'admin/status/overview', 'admin/package-manager': 'admin/system/opkg' };
// 「服务」里也列出放在别处的几个（跟 LuCI 一样好找）：点了展开「代理」里对应的那一项，终端直接打开面板自己的
const SVC_LINKS = [
	{ need: 'admin/services/openclash', it: { link: 1, t: 'OpenClash', jump: '代理/OpenClash 原版', hint: '在「代理」里' } },
	{ need: 'admin/services/passwall', it: { link: 1, t: 'PassWall', jump: '代理/PassWall', hint: '在「代理」里' } },
	{ need: 'admin/services/ttyd', it: { link: 1, p: 'term', i: '›_', t: '终端', hint: '面板自己的终端' } },
];
const NAV_GROUP = { status: '状态', network: '网络', system: '系统' }; // 其他分类的新插件都放「服务」
let NAV0 = null, PKG_PAGE = 'admin/package-manager';
function navKnown(p) {
	for (const g of NAV0 || NAV) {
		for (const it of g.items) {
			if (Array.isArray(it) ? it[3] === 'extra' : it.extra) continue;
			const ps = Array.isArray(it) ? [it[0], ...(NAV_ALIAS[it[0]] || []), ...(NAV_FALLBACK[it[0]] ? [NAV_FALLBACK[it[0]]] : [])] : it.kids ? it.kids.map((k) => k[0]) : [];
			for (const x of ps) if (x === p || x.startsWith(p + '/') || p.startsWith(x + '/')) return true;
		}
	}
	return false;
}
// 读到路由器的真实菜单后：每一组都只显示路由器上实际有的页面，再把新装的插件放进对应的组
function navExtra(items, draw) {
	NAV0 ??= NAV.map((g) => ({ ...g, items: g.items.slice() }));
	if (!items || !items.length) return 0;   // 还没读到菜单：先按原来的显示
	const have = new Set(), live = {};
	for (const it of items) { have.add(it.p); live[it.p] = it; (it.kids || []).forEach((k) => have.add(k[0])); }
	const hv = [...have];
	// 保护：每台路由器都有的「状态」「网络」「系统」，要是读到的菜单里一项都没有，多半是没读全，这一类就照原样显示，不藏
	// （「服务」这类插件分类是真的可能一个都没装，不在保护范围里）
	const cats = new Set(hv.map((h) => h.split('/')[1]));
	const unread = (p) => { const c = p.split('/'); return c.length >= 3 && ['status', 'network', 'system'].includes(c[1]) && !cats.has(c[1]); };
	const present = (p) => have.has(p) || hv.some((h) => h.startsWith(p + '/')) || (NAV_ALIAS[p] || []).some((x) => have.has(x)) || unread(p);
	const dir = (p) => p.slice(0, p.lastIndexOf('/'));
	PKG_PAGE = present('admin/package-manager') ? 'admin/package-manager' : present('admin/system/opkg') ? 'admin/system/opkg' : 'admin/package-manager';
	for (const g of NAV) {
		const g0 = NAV0.find((x) => x.g === g.g);
		g.items = g0.items.flatMap((it) => {
			if (Array.isArray(it)) {
				if (present(it[0])) return [it];
				const fb = NAV_FALLBACK[it[0]];
				if (fb && present(fb)) { NAVK['k:' + fb] = { t: it[1], path: [g.g] }; return [[fb, it[1], it[2]]]; }
				return [];
			}
			if (!it.kids) return [it];   // 面板自己的页面，一直都在
			const kids = it.kids.filter((k) => present(k[0]));
			// 原版插件新增的子页面（比如 PassWall 的「规则列表」）也补上
			const par = live[dir(it.kids[0][0])];
			if (par && it.kids.every((k) => dir(k[0]) === par.p))
				for (const k of par.kids || []) if (!kids.some((x) => x[0] === k[0])) { kids.push(k); NAVK['k:' + k[0]] = { t: k[1], path: [g.g, it.t] }; }
			return kids.length ? [{ ...it, kids }] : [];
		});
	}
	const svc = NAV.find((g) => g.g === '服务');
	svc.empty = 1;
	svc.items.push(...SVC_LINKS.filter((x) => present(x.need)).map((x) => x.it));
	// 新装的插件：所有分类里侧边栏还没有的真页面（空的菜单分类、单独一页的首页/向导不算）
	const ex = items.filter((it) => it && it.p && /^admin\/[^/]+\/[^/]+$/.test(it.p) && !NAV_SKIP.includes(it.p) && !navKnown(it.p));
	for (const it of ex) {
		const gname = NAV_GROUP[it.p.split('/')[1]] || '服务';
		const x = it.kids && it.kids.length ? { t: it.t, extra: 1, kids: it.kids } : [it.p, it.t, null, 'extra'];
		NAV.find((g) => g.g === gname).items.push(x);
		if (Array.isArray(x)) NAVK['k:' + x[0]] = { t: x[1], path: [gname] };
		else x.kids.forEach((k) => (NAVK['k:' + k[0]] = { t: k[1], path: [gname, x.t] }));
	}
	if (draw !== false && !$('sideQ').value.trim()) renderNav();
	return ex.length;
}
let menuAt = 0, menuDone = 0;
async function loadMenu() {
	if (Date.now() - menuAt < 5000) return;
	menuAt = Date.now();
	try {
		const r = await P('luci_menu', {}, 30000), j = JSON.stringify(r.items || []);
		if (menuDone && j === store.get('rp_menu')) return;
		menuDone = 1;
		store.set('rp_menu', j);
		navExtra(r.items);
	} catch (e) {}
}
const validPage = (p) => !!(TITLES[p] || NAVK[p]);
const pageTitle = (p) => TITLES[p] || NAVK[p]?.t || '';
let navOpen;
try { navOpen = JSON.parse(store.get('rp_nav') || 'null'); } catch (e) {}
if (!navOpen || typeof navOpen !== 'object') navOpen = { '状态': 1, '代理': 1, '网络': 1, '工具': 1 };
const NAV_IC = {"chat": ["<path d=\"M5 18.5V7a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 7v6.5a2.5 2.5 0 0 1-2.5 2.5H8.5z\"/><path d=\"M9 9.5h6M9 12.5h3.5\"/>", "#34c759"], "notice": ["<path d=\"M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2.2H4.4z\"/><path d=\"M10 21a2.2 2.2 0 0 0 4 0\"/>", "#ff9500"], "myfb": ["<path d=\"M5 18.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8.5z\"/><path d=\"M9 9h6M9 12h4\"/>", "#34c759"], "main": ["<path d=\"M4 11l8-7 8 7v9H4z\"/><path d=\"M10 20v-5h4v5\"/>", "#0a84ff"], "cbk": ["<path d=\"M7 18.5h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.4 9.6 4.5 4.5 0 0 0 7 18.5z\"/><path d=\"M12 16v-5M9.8 13.2 12 11l2.2 2.2\"/>", "#30b0c7"], "speed": ["<path d=\"M4.5 17a8.5 8.5 0 1 1 15 0\"/><path d=\"M12 13l4-4\"/><circle cx=\"12\" cy=\"13.5\" r=\"1\"/>", "#ff9500"], "home": ["<path d=\"M12 14l3.5-3.5\"/><path d=\"M4.9 18a8.5 8.5 0 1 1 14.2 0\"/>", "#0a84ff"], "conn": ["<path d=\"M7 7h12l-3-3M17 17H5l3 3\"/>", "#30b0c7"], "traf": ["<path d=\"M5 20v-6M10 20V9M15 20v-9M20 20V5\"/>", "#af52de"], "wd": ["<path d=\"M3 12h4l2.5-6 5 12 2.5-6h4\"/>", "#ff2d55"], "auto": ["<path d=\"M19.5 12a7.5 7.5 0 0 1-12.8 5.3\"/><path d=\"M4.5 12a7.5 7.5 0 0 1 12.8-5.3\"/><path d=\"M17.3 3v3.7h-3.7M6.7 21v-3.7h3.7\"/>", "#5e5ce6"], "slog": ["<path d=\"M7 3h7l4 4v14H7z\"/><path d=\"M10 12h5M10 16h5\"/>", "#8e8e93"], "proc": ["<rect x=\"7\" y=\"7\" width=\"10\" height=\"10\" rx=\"2\"/><path d=\"M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4\"/>", "#5e5ce6"], "状态/实时监控": ["<path d=\"M3 20h18\"/><path d=\"M6.5 16v-5M11.5 16V6M16.5 16v-8\"/>", "#34c759"], "状态/更多状态": ["<path d=\"M5 12h.01M12 12h.01M19 12h.01\"/>", "#8e8e93"], "proxy": ["<path d=\"M4 11l16-7-7 16-2-7z\"/>", "#0a84ff"], "subs": ["<path d=\"M7 18.5h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.4 9.6 4.5 4.5 0 0 0 7 18.5z\"/><path d=\"M12 10.5v5M10 13.5l2 2 2-2\"/>", "#30b0c7"], "cfg": ["<path d=\"M7 3h7l4 4v14H7z\"/><path d=\"M14 3v4h4\"/>", "#ff9500"], "ow": ["<path d=\"M4 20h4L19 9l-4-4L4 16z\"/>", "#af52de"], "rules": ["<path d=\"M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01\"/>", "#5e5ce6"], "black": ["<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M6 6l12 12\"/>", "#ff3b30"], "set": ["<path d=\"M4 7h10M18 7h2M4 17h4M12 17h8\"/><circle cx=\"16\" cy=\"7\" r=\"2\"/><circle cx=\"10\" cy=\"17\" r=\"2\"/>", "#8e8e93"], "log": ["<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"15\" rx=\"3\"/><path d=\"M7.5 9.5h9M7.5 13h9M7.5 16.5h5\"/>", "#48484a"], "代理/OpenClash 原版": ["<path d=\"M12 3l9 5-9 5-9-5z\"/><path d=\"M3 13l9 5 9-5\"/>", "#5e5ce6"], "代理/PassWall": ["<path d=\"M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z\"/>", "#34c759"], "dev": ["<rect x=\"7\" y=\"3\" width=\"10\" height=\"18\" rx=\"2.5\"/><path d=\"M11 18h2\"/>", "#0a84ff"], "admin/network/network": ["<rect x=\"9\" y=\"3\" width=\"6\" height=\"5\" rx=\"1\"/><rect x=\"3\" y=\"16\" width=\"6\" height=\"5\" rx=\"1\"/><rect x=\"15\" y=\"16\" width=\"6\" height=\"5\" rx=\"1\"/><path d=\"M12 8v4M6 16v-2.5h12V16\"/>", "#30b0c7"], "admin/network/interfaceconfig": ["<path d=\"M4 7h16v10h-4v2.5H8V17H4z\"/><path d=\"M8.5 11v2M12 11v2M15.5 11v2\"/>", "#5e5ce6"], "admin/network/wireless": ["<path d=\"M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01\"/>", "#0a84ff"], "admin/network/dhcp": ["<rect x=\"3.5\" y=\"4\" width=\"17\" height=\"7\" rx=\"2\"/><rect x=\"3.5\" y=\"13\" width=\"17\" height=\"7\" rx=\"2\"/><path d=\"M7.5 7.5h.01M7.5 16.5h.01\"/>", "#ff9500"], "admin/network/dns": ["<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5z\"/>", "#00c7be"], "admin/network/routes": ["<circle cx=\"6\" cy=\"18\" r=\"2\"/><circle cx=\"18\" cy=\"6\" r=\"2\"/><path d=\"M8 18h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5\"/>", "#af52de"], "admin/network/diagnostics": ["<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"M16 16l4.5 4.5\"/>", "#34c759"], "网络/防火墙": ["<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"14\" rx=\"2\"/><path d=\"M3.5 9.7h17M3.5 14.3h17M9 5v4.7M15 9.7v4.6M9 14.3V19\"/>", "#ff3b30"], "服务/AdGuard Home": ["<path d=\"M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z\"/><path d=\"M9 12l2 2 4-4\"/>", "#34c759"], "服务/应用过滤": ["<path d=\"M4 5h16l-6 7.5V19l-4-2v-4.5z\"/>", "#ff9500"], "服务/Docker": ["<path d=\"M12 3l8 4.5v9L12 21l-8-4.5v-9z\"/><path d=\"M4 7.5l8 4.5 8-4.5M12 12v9\"/>", "#0a84ff"], "admin/services/upnp": ["<path d=\"M17 3l3 3-3 3M20 6H8a4 4 0 0 0-4 4v1M7 21l-3-3 3-3M4 18h12a4 4 0 0 0 4-4v-1\"/>", "#30b0c7"], "admin/store": ["<path d=\"M5 8h14l-1 12H6z\"/><path d=\"M9 8a3 3 0 0 1 6 0\"/>", "#ff2d55"], "admin/services/linkease": ["<path d=\"M7 18.5h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.4 9.6 4.5 4.5 0 0 0 7 18.5z\"/>", "#5e5ce6"], "admin/services/fastnet": ["<path d=\"M13 3 5 13.5h6L10.5 21 19 10.5h-6z\"/>", "#f5a623"], "more": ["<rect x=\"4\" y=\"4\" width=\"6.5\" height=\"6.5\" rx=\"1.6\"/><rect x=\"13.5\" y=\"4\" width=\"6.5\" height=\"6.5\" rx=\"1.6\"/><rect x=\"4\" y=\"13.5\" width=\"6.5\" height=\"6.5\" rx=\"1.6\"/><rect x=\"13.5\" y=\"13.5\" width=\"6.5\" height=\"6.5\" rx=\"1.6\"/>", "#8e8e93"], "admin/system/system": ["<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1\"/>", "#8e8e93"], "系统/管理权": ["<circle cx=\"8\" cy=\"15\" r=\"4\"/><path d=\"M11 12l9-9M16 7l3 3\"/>", "#ff9500"], "admin/package-manager": ["<rect x=\"3.5\" y=\"4\" width=\"17\" height=\"5\" rx=\"1.5\"/><path d=\"M5 9v10h14V9M10 13h4\"/>", "#a2845e"], "admin/system/startup": ["<path d=\"M12 3v8\"/><path d=\"M6.4 7a8 8 0 1 0 11.2 0\"/>", "#34c759"], "admin/system/crontab": ["<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5V12l3 2\"/>", "#5e5ce6"], "系统/存储": ["<rect x=\"3.5\" y=\"13\" width=\"17\" height=\"7\" rx=\"2\"/><path d=\"M5 13l2.5-8h9L19 13M7.5 16.5h.01\"/>", "#30b0c7"], "系统/硬件": ["<rect x=\"5\" y=\"5\" width=\"14\" height=\"14\" rx=\"3\"/><circle cx=\"12\" cy=\"12\" r=\"2.6\"/>", "#af52de"], "系统/高级": ["<path d=\"M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z\"/>", "#8e8e93"], "admin/system/flash": ["<path d=\"M12 15V4M7.5 8.5 12 4l4.5 4.5\"/><path d=\"M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3\"/>", "#0a84ff"], "term": ["<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"15\" rx=\"3\"/><path d=\"M7.5 9.5l3 2.5-3 2.5M12.5 15h4\"/>", "#48484a"], "files": ["<path d=\"M3.5 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z\"/>", "#0a84ff"], "admin/quickstart": ["<path d=\"M4 11l8-7 8 7v9H4z\"/><path d=\"M10 20v-5h4v5\"/>", "#ff9500"]};
const navIc = (key, ch) => { const x = NAV_IC[key]; return x ? `<i class="nic" style="background:${x[1]}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${x[0]}</svg></i>` : `<i>${esc(ch || '·')}</i>`; };
function navBtn(x, kid, noic) {
	if (Array.isArray(x)) return `<button data-p="k:${esc(x[0])}"${noic ? ' class="noic"' : ''}>${kid || noic ? '' : navIc(x[0], x[2])}<span>${esc(x[1])}</span></button>`;
	const lab = `<span>${esc(x.t)}${x.hint ? `<span class="path">${esc(x.hint)}</span>` : ''}</span>`;
	if (x.jump) return `<button data-jump="${esc(x.jump)}"${noic ? ' class="noic"' : ''}>${noic ? '' : navIc(x.jump, x.i)}${lab}</button>`;
	return `<button data-p="${x.p}"${noic ? ' class="noic"' : ''}>${noic ? '' : navIc(x.p, x.i)}${lab}</button>`;
}
function renderNav() {
	const q = $('sideQ').value.trim().toLowerCase();
	const nav = $('sidenav');
	if (q) {
		const hits = [];
		for (const g of NAV) for (const it of g.items) {
			const one = (x, path) => {
				const t = Array.isArray(x) ? x[1] : x.t, p = Array.isArray(x) ? 'k:' + x[0] : x.p;
				if ((t + ' ' + path.join(' ') + ' ' + (Array.isArray(x) ? x[0] : '')).toLowerCase().includes(q))
					hits.push(`<button data-p="${esc(p)}">${g.noic ? '' : navIc(Array.isArray(x) ? (NAV_IC[x[0]] ? x[0] : path.join('/')) : x.p, Array.isArray(x) ? x[2] : x.i)}<span>${esc(t)}<span class="path">${esc(path.join(' › '))}</span></span></button>`);
			};
			if (it.link || !pxShow(it)) continue;   // 「服务」里的快捷入口，原本那一项已经会被搜到；用不上的代理页面不显示
			if (it.kids) it.kids.forEach((k) => one(k, [g.g, it.t])); else one(it, [g.g]);
		}
		if ('首页 主页 home'.includes(q)) hits.unshift(navBtn(NAV_TOP, false, false));
		nav.innerHTML = hits.length ? hits.join('') : '<div class="empty">没有找到这个功能</div>';
	} else {
		nav.innerHTML = navBtn(NAV_TOP, false, false).replace('<button', '<button class="navtop"') + NAV.map((g) => `<div class="ng${navOpen[g.g] ? ' open' : ''}" data-g="${esc(g.g)}"><button class="nghead" data-ng="${esc(g.g)}" aria-expanded="${!!navOpen[g.g]}"><span>${esc(g.g)}</span><s class="chev">›</s></button><div class="ngb"><div>${
			!g.items.length && g.empty ? `<div class="navhint">路由器上还没有安装插件，请去安装新的插件<button data-p="k:${PKG_PAGE}">去安装 ›</button></div>` :
			g.items.filter(pxShow).map((it) => {
				if (!it.kids) return navBtn(it, false, g.noic);
				const id = g.g + '/' + it.t;
				return `<div class="ng${navOpen[id] ? ' open' : ''}" data-g="${esc(id)}"><button class="nsub${g.noic ? ' noic' : ''}" data-ng="${esc(id)}" aria-expanded="${!!navOpen[id]}">${g.noic ? '' : navIc(id, it.i)}<span>${esc(it.t)}</span><s class="chev">›</s></button><div class="ngb kids"><div>${it.kids.map((k) => navBtn(k, true)).join('')}</div></div></div>`;
			}).join('')}</div></div></div>`).join('');
	}
	navMark();
}
function navMark() {
	$$('#sidenav button[data-p]').forEach((b) => b.classList.toggle('on', b.dataset.p === page));
}
// 打开某一页时，把它所在的分组展开
function navReveal(p) {
	const pth = NAVK[p]?.path || (() => { for (const g of NAV) for (const it of g.items) { if (it.link) continue; if (it.p === p) return [g.g]; if (it.kids && it.kids.some((k) => k.p === p)) return [g.g, it.t]; } return []; })();
	let ch = false;
	if (pth[0] && !navOpen[pth[0]]) { navOpen[pth[0]] = 1; ch = true; }
	if (pth[1] && !navOpen[pth[0] + '/' + pth[1]]) { navOpen[pth[0] + '/' + pth[1]] = 1; ch = true; }
	if (ch) { store.set('rp_nav', JSON.stringify(navOpen)); if (!$('sideQ').value.trim()) renderNav(); }
}
let page = 'home';
const DIRTY = {};
async function go(p) {
	if (p !== page && DIRTY[page] && DIRTY[page]() && !(await confirmBox('还有没保存的修改', '离开这一页会丢掉这些修改。', '不保存，离开', true))) return;
	const prev = page;
	page = p;
	if (p === 'notice' && prev !== 'notice') NT.view = null;
	const sec = p.startsWith('k:') ? 'luci' : p;
	navMark();
	$('pageTitle').textContent = pageTitle(p);
	store.set('rp_page', p);
	try { sessionStorage.setItem('rp_page', p); } catch (e) {}
	const sliding = $('side').classList.contains('open') && innerWidth < 900;
	sideOpen(false);
	const swap = () => {
		if (page !== p) return; // 又点了别的页面
		$$('section.page').forEach((s) => s.classList.toggle('on', s.id === 'p-' + sec));
		document.body.classList.toggle('luci', sec === 'luci');
		document.body.classList.toggle('chatp', sec === 'chat');
		if (sec !== 'chat') chStop();
		if (sec !== 'luci' && prev && prev.startsWith('k:')) lfClose();
		scrollTo({ top: 0 });
		refresh();
		navReveal(p);
	};
	if (sliding) requestAnimationFrame(() => setTimeout(swap, 16)); else swap();
}
function sideOpen(on) { $('side').classList.toggle('open', on); $('scrim').classList.toggle('open', on); if (on && token) loadMenu(); }
$('sidenav').addEventListener('click', (e) => {
	const t = e.target.closest('button[data-ng]');
	if (t) {
		const id = t.dataset.ng, box = t.parentElement;
		navOpen[id] = box.classList.toggle('open') ? 1 : 0;
		box.classList.toggle('anim', !!navOpen[id]);
		t.setAttribute('aria-expanded', !!navOpen[id]);
		store.set('rp_nav', JSON.stringify(navOpen));
		return;
	}
	// 「服务」里的 OpenClash / PassWall：展开「代理」里对应的那一项，滚到那里
	const j = e.target.closest('button[data-jump]');
	if (j) {
		const id = j.dataset.jump, top = id.split('/')[0];
		navOpen[top] = 1; navOpen[id] = 1;
		store.set('rp_nav', JSON.stringify(navOpen));
		renderNav();
		const box = $('sidenav').querySelector(`[data-g="${CSS.escape(id)}"]`);
		if (box) { box.scrollIntoView({ block: 'start', behavior: 'smooth' }); box.classList.add('flash'); setTimeout(() => box.classList.remove('flash'), 1200); }
		return;
	}
	const b = e.target.closest('button[data-p]');
	if (b) { if (b.dataset.p === page && page.startsWith('k:')) { sideOpen(false); return; } go(b.dataset.p); }
});
$('sideQ').addEventListener('input', renderNav);
$('sideQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = $('sidenav').querySelector('button[data-p]'); if (b && $('sideQ').value.trim()) { $('sideQ').value = ''; go(b.dataset.p); renderNav(); } } });
renderNav();
$('menuBtn').onclick = () => sideOpen(true);
$('scrim').onclick = () => sideOpen(false);
(() => { let x0 = null; addEventListener('touchstart', (e) => { const t = e.touches[0]; x0 = t.clientX < 24 || $('side').classList.contains('open') ? t.clientX : null; }, { passive: true });
	addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (dx > 60) sideOpen(true); if (dx < -60) sideOpen(false); x0 = null; }, { passive: true }); })();
const topLine = () => $('topbar').classList.toggle('scrolled', scrollY > 2);
addEventListener('scroll', topLine, { passive: true });
function topH() { const t = $('topbar'); document.documentElement.style.setProperty('--toph', Math.round(t.offsetHeight + (parseFloat(getComputedStyle(t).marginTop) || 0)) - 2 + 'px'); }
addEventListener('resize', topH);

let loading = false, loadSeq = 0, loadAt = 0;
async function refresh(quiet) {
	const load = LOAD[page.startsWith('k:') ? 'luci' : page];
	if (!load) return;
	// 自动刷新：上一次还没完就跳过；手动刷新、切换页面：不等上一次（它可能卡住了），直接重新加载
	if (loading && quiet && Date.now() - loadAt < 25000) return;
	const my = ++loadSeq;
	loading = true; loadAt = Date.now();
	if (!quiet) { $('refreshBtn').innerHTML = '<span class="spin">↻</span>'; loadOn(); }
	try { await load(quiet); }
	catch (e) {
		if (my !== loadSeq) return; // 已经有更新的一次加载了，这次的错误不用管
		if (e instanceof NeedCodeError) return;
		if (e instanceof AuthError) return logout('密钥已失效，请重新粘贴连接地址');
		if (e instanceof OfflineError && svcExpired()) {
			// 托管服务到期暂停了：专属网址停了，所以连不上。直接说清楚，不要说成手机网络的问题
			setStatus(false, '已到期暂停');
			if ($('topSub').textContent === '正在连接…') $('topSub').textContent = '托管服务已到期';
			pxRender(PX.running, PX.mode, false);
			if (page === 'home') { $('hHead').textContent = '托管服务已到期'; $('hDesc').textContent = SVC_EXP_MSG() + '下面是上次的数据。'; }
			if (page === 'main') mOff('');   // 首页上面的「托管服务已到期」卡片已经写清楚了
			svcRender();
			if (!quiet) toast('托管服务已到期，专属网址暂停了', true);
		} else if (e instanceof OfflineError) {
			setStatus(false, e.short);
			if ($('topSub').textContent === '正在连接…') $('topSub').textContent = '连不上路由器';
			pxRender(PX.running, PX.mode, false);
			if (page === 'home') { $('hHead').textContent = '连不上路由器'; $('hDesc').textContent = e.message + '。下面是上次的数据。'; }
			if (page === 'main') mOff(e.message + '。下面是上次的数据。');
			const homeOff = () => (page === 'home' && $('hHead').textContent === '连不上路由器') || (page === 'main' && !$('mOff').classList.contains('hidden'));
			// 只有「根本连不上 / 超时」才可能是手机网络的问题；收到 Cloudflare 的 530/502 说明手机网络是通的
			const netErr = ['离线', '超时', '手机没网'].includes(e.short);
			cloudFetch(Date.now() - cloudAt > 10000).then((c) => {
				if (!c) return;
				const l = cloudLine(c);
				if (l) {
					setStatus(false, c.label[c.s.state]);
					if (homeOff()) offText('Cloudflare 实时判断 · ' + l + '。下面是上次的数据。');
				} else if (netErr && c.s.state === 'ok' && c.r && cNow(c) - c.r.last < 300e3 && !c.probe?.fail) {
					// 云端说路由器好好的，那就是手机到路由器这段网络的问题
					setStatus(false, '手机网络问题');
					if (homeOff()) offText(`Cloudflare 显示路由器一切正常（${cAgo(c, c.r.last)}前刚报告过），是你的手机到 Cloudflare 这一段不通：手机网络不稳，或者手机连着家里这台路由器的 Wi-Fi 而 ${pxAct()?.name || '代理插件'} 正在重启。稍后下拉刷新就好。下面是上次的数据。`);
				}
			}).catch(() => {
				if (!netErr) return;
				setStatus(false, '手机网络问题');
				if (homeOff()) offText(`路由器和 Cloudflare 都连不上：多半是你的手机现在没网或网络不稳。${pxAct() ? '如果手机连着家里这台路由器的 Wi-Fi，也可能是 ' + pxAct().name + ' 正在重启，或者代理节点出了问题（面板会在几分钟内自动改走直连）；' : ''}急的话先换成手机流量打开。下面是上次的数据。`);
			});
		} else if (/连不上|超时/.test(e.message)) setStatus(false, '离线');
		if (!quiet) toast(e.message, true);
	} finally {
		if (!quiet) loadOff();
		if (my === loadSeq) { loading = false; $('refreshBtn').textContent = '↻'; }
	}
}
$('refreshBtn').onclick = () => { S.state = null; S.schema = {}; refresh(); };
// 手机上后台任务只显示一个点，点一下看在做什么
$('jobPill').onclick = () => toast($('jobText').textContent);
$('jobPill').style.cursor = 'pointer';


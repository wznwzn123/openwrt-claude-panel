/* =====================================================================
   Kwrt 原版页面（在面板里打开，自动登录）
   ===================================================================== */
// 隐藏 Argon 主题自带的顶栏、侧边栏、页脚，只留页面内容
const LF_CSS = `header,.main-left,footer,.darkMask,.showSide,#modemenu{display:none!important}
.main-right{width:100%!important}
#maincontent>.container{margin:0 .75rem 1rem!important;padding-top:.6rem}
body::before{display:none!important}`;
let lfCur = '', lfTry = 0, lfTimer;
// 6.0 第 53 项：门禁钥匙只在这次打开面板期间记着（不长期留在手机上），路由器换了钥匙（换登录密钥、移除手机）就重新取
const LK_SS = { get() { try { return sessionStorage.getItem('rp_lk'); } catch (e) { return null; } }, set(k) { try { sessionStorage.setItem('rp_lk', k); } catch (e) {} } };
try { localStorage.removeItem('rp_lk'); } catch (e) {} // 6.0 以前长期存在手机上的旧钥匙
const ckSec = () => (location.protocol === 'https:' ? '; secure' : '');
const lffTicketOff = () => { document.cookie = 'cmcp_f=; path=/cgi-bin/; max-age=0; samesite=strict' + ckSec(); };
function luciForget() {
	try { sessionStorage.removeItem('rp_lk'); } catch (e) {}
	document.cookie = 'cmcp_l=; path=/cgi-bin/; max-age=0; samesite=strict' + ckSec();
	lffTicketOff();
}
async function luciKey(force) {
	let k = force ? null : LK_SS.get();
	if (!k) { k = (await P('luci_key')).key; if (!k) throw new Error('路由器还没开启原版页面'); LK_SS.set(k); }
	document.cookie = `cmcp_l=${k}; path=/cgi-bin/; samesite=strict` + (location.protocol === 'https:' ? '; secure' : '');
}
function lfMask(msg, retry) {
	$('lfMask').classList.toggle('hidden', !msg);
	if (msg) { $('lfMsg').textContent = msg; $('lfMask').querySelector('.spin').classList.toggle('hidden', !!retry); $('lfRetry').classList.toggle('hidden', !retry); }
}
function lfOpen(path) {
	lffTicketOff(); // 面板里的「原版页面」照旧自动登录：不带完整后台的入口票
	lfCur = path;
	lfMask('正在打开「' + pageTitle('k:' + path) + '」…');
	loadOn();
	clearTimeout(lfTimer);
	lfTimer = setTimeout(() => { loadOff(); lfMask('打开得太慢了，路由器可能忙或者网络不稳', true); }, 30000);
	$('lfr').src = '../cgi-bin/luci/' + path;
}
function lfClose() {
	clearTimeout(lfTimer);
	if (lfCur) { lfCur = ''; loadOff(); }
	$('lfr').src = 'about:blank';
}
async function loadLuci(quiet) {
	if (quiet) return;
	await luciKey(false);
	lfTry = 0;
	lfOpen(page.slice(2));
}
$('lfRetry').onclick = () => refresh();
$('lfr').addEventListener('load', async () => {
	if (!lfCur) return;
	clearTimeout(lfTimer);
	loadOff();
	let d = null;
	try { d = $('lfr').contentDocument; } catch (e) {}
	if (!d || !d.body || d.location.href === 'about:blank') return lfMask('页面打不开', true);
	const txt = (d.body.innerText || '').slice(0, 400);
	if (/请从路由器面板里打开/.test(txt)) {
		// 门禁钥匙变了（换了登录密钥、移除了手机、路由器重装过）：重新取一次，回到刚才那一页
		if (lfTry++ < 1) { try { await luciKey(true); const m = (d.location.pathname || '').match(/\/cgi-bin\/luci\/(.+)$/); lfOpen(m ? m[1] + (d.location.search || '') : lfCur); return; } catch (e) {} }
		return lfMask('没有权限打开这个页面', true);
	}
	if (/cloudflare/i.test(d.title + ' ' + txt) || /Error 10\d\d|Bad gateway|502|530/.test(d.title)) {
		setStatus(false, '离线');
		return lfMask('连不上路由器，稍后再试', true);
	}
	lfTry = 0;
	const st = d.createElement('style');
	st.textContent = LF_CSS;
	(d.head || d.body).appendChild(st);
	lfMask('');
	// 在原版页面里点到了别的页面：顶上的标题跟着变
	const m = d.location.pathname.match(/\/cgi-bin\/luci\/(.+)$/);
	if (m) {
		const k = 'k:' + m[1].replace(/\/$/, '');
		const h = d.querySelector('#maincontent h2, h2[name=content]');
		$('pageTitle').textContent = NAVK[k]?.t || (h && h.textContent.trim()) || pageTitle(page);
	}
});


/* ---------- 6.0 第 1 项：完整原版后台 ----------
 * 原样打开路由器的 LuCI（顶栏、菜单、主题都是它自己的），要输路由器密码登录，跟在家里一样。
 * 面板先向路由器要一张入口票（只有登录着、有「完全控制」的手机拿得到），放在 Cookie 里；路由器的门禁核对密码、
 * 输错 5 次锁 15 分钟并推送、每次登录推送、30 分钟没操作退出、太弱的密码不让用（见 src/bin/cmcp-lfull） */
let lffOn = false, lffTry = 0, lffTimer;
function lffMask(msg, retry) {
	$('lffMask').classList.toggle('hidden', !msg);
	if (msg) { $('lffMsg').textContent = msg; $('lffMask').querySelector('.spin').classList.toggle('hidden', !!retry); $('lffRetry').classList.toggle('hidden', !retry); }
}
async function lffTicket() {
	const r = await P('luci_full', {}, 20000);
	document.cookie = `cmcp_f=${r.ticket}; path=/cgi-bin/; samesite=strict` + ckSec();
	return r;
}
async function loadLfull(quiet) {
	if (quiet && lffOn) return;
	lffMask('正在打开完整原版后台…');
	try { await luciKey(false); await lffTicket(); }
	catch (e) { lffMask(e.message || '打不开，稍后再试', true); return; }
	lffOn = true; lffTry = 0;
	clearTimeout(lffTimer);
	lffTimer = setTimeout(() => lffMask('打开得太慢了，路由器可能忙或者网络不稳', true), 30000);
	$('lff').src = '../cgi-bin/luci/';
}
function lffClose() {
	lffOn = false; clearTimeout(lffTimer);
	$('lff').src = 'about:blank';
	lffTicketOff();
}
$('lffRetry').onclick = () => { lffOn = false; loadLfull(); };
$('lffOut').onclick = async () => {
	if (!(await confirmBox('退出完整原版后台', '退出后要再用，得重新输路由器密码。', '退出'))) return;
	// 先让原版后台自己退出（会话作废），再回到概览
	try { const w = $('lff').contentWindow; if (w && /\/cgi-bin\/luci/.test(w.location.pathname)) { $('lff').src = '../cgi-bin/luci/admin/logout'; await new Promise((r) => setTimeout(r, 900)); } } catch (e) {}
	go('home');
};
$('lff').addEventListener('load', async () => {
	if (!lffOn) return;
	clearTimeout(lffTimer);
	let d = null;
	try { d = $('lff').contentDocument; } catch (e) {}
	if (!d || !d.body || d.location.href === 'about:blank') return lffMask('页面打不开', true);
	const txt = (d.body.innerText || '').slice(0, 400);
	// 门禁钥匙或入口票过期了（换了登录密钥、移除了手机、过了 12 小时）：重新取一次
	if (/请从路由器面板里打开|入口过期了/.test(txt)) {
		if (lffTry++ < 1) { try { await luciKey(true); await lffTicket(); $('lff').src = d.location.pathname + (d.location.search || ''); return; } catch (e) {} }
		return lffMask('没有权限打开完整原版后台', true);
	}
	if (/cloudflare/i.test(d.title + ' ' + txt) || /Error 10\d\d|Bad gateway|502|530/.test(d.title)) {
		setStatus(false, '离线');
		return lffMask('连不上路由器，稍后再试', true);
	}
	lffTry = 0;
	lffMask('');
});

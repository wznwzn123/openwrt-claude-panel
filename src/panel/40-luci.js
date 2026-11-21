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
function luciForget() {
	try { sessionStorage.removeItem('rp_lk'); } catch (e) {}
	document.cookie = 'cmcp_l=; path=/cgi-bin/; max-age=0; samesite=strict' + (location.protocol === 'https:' ? '; secure' : '');
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


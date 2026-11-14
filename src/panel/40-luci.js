/* =====================================================================
   Kwrt 原版页面（在面板里打开，自动登录）
   ===================================================================== */
// 隐藏 Argon 主题自带的顶栏、侧边栏、页脚，只留页面内容
const LF_CSS = `header,.main-left,footer,.darkMask,.showSide,#modemenu{display:none!important}
.main-right{width:100%!important}
#maincontent>.container{margin:0 .75rem 1rem!important;padding-top:.6rem}
body::before{display:none!important}`;
let lfCur = '', lfTry = 0, lfTimer;
async function luciKey(force) {
	let k = force ? null : store.get('rp_lk');
	if (!k) { k = (await P('luci_key')).key; if (!k) throw new Error('路由器还没开启原版页面'); store.set('rp_lk', k); }
	document.cookie = `cmcp_l=${k}; path=/cgi-bin/; max-age=31536000; samesite=strict` + (location.protocol === 'https:' ? '; secure' : '');
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
		// 门禁钥匙变了（比如路由器重装过）：重新取一次
		if (lfTry++ < 1) { try { await luciKey(true); lfOpen(lfCur); return; } catch (e) {} }
		return lfMask('没有权限打开这个页面', true);
	}
	if (/cloudflare/i.test(d.title + ' ' + txt) || /Error 10\d\d|Bad gateway|502|530/.test(d.title)) {
		setStatus(false, '离线');
		return lfMask('连不上路由器，稍后再试', true);
	}
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


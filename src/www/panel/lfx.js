/* 6.0 第 36 项：完整原版后台（LuCI）里嵌着的「路由器:其他端口」页面——网页终端、OpenClash 控制面板这类。
 * 在外面打开时，这些地址（隧道的网址 + 端口）打不开：拦下来交给面板，用「远程页面」的地址在新标签页打开。
 * 在家里（网址是路由器的 IP 或 .lan 这类名字）直接能打开，不拦。由 luci-gate 插进 LuCI 页面的 <head>。 */
(function () {
	var h = location.hostname;
	// 在面板的「完整原版后台」里点了「服务 → 路由器面板」：本来就在面板里，回到面板首页（不在框里再开一个面板；用户 11/27）
	if (window.top !== window && /\/admin\/services\/cmcp\/?$/.test(location.pathname)) { try { window.top.postMessage({ cmcpx: 1, home: 1 }, location.origin); } catch (e) {} return; }
	if (window.top === window || /^(\d+\.\d+\.\d+\.\d+|\[[0-9a-f:.]+\]|localhost|[a-z0-9-]+|.+\.(lan|local|home|internal|home\.arpa))$/i.test(h)) return;
	function tgt(u) {
		try { var x = new URL(u, location.href); if (x.hostname === h && x.port && x.port !== location.port) return { port: +x.port, https: x.protocol === 'https:', path: x.pathname + x.search + x.hash }; } catch (e) {}
		return null;
	}
	function ask(t, inline) { window.top.postMessage({ cmcpx: 1, port: t.port, https: t.https, path: t.path, inline: inline || 0 }, location.origin); }
	// 嵌着的页面：直接在原处打开（换成远程页面的地址），不用另开标签页
	var wait = {}, seq = 0;
	window.addEventListener('message', function (e) {
		var d = e.data;
		if (e.origin !== location.origin || !d || d.cmcpxr !== 1 || !wait[d.id]) return;
		var f = wait[d.id]; delete wait[d.id];
		if (d.url) { f.ph.parentNode && f.ph.parentNode.replaceChild(f.el, f.ph); f.el.src = d.url; }
		else f.msg.textContent = d.err || '打不开';
	});
	var wo = window.open;
	window.open = function (u) { var t = tgt(u); if (t) { ask(t); return null; } return wo.apply(window, arguments); };
	document.addEventListener('click', function (e) { var a = e.target && e.target.closest && e.target.closest('a[href]'); var t = a && tgt(a.href); if (t) { e.preventDefault(); ask(t); } }, true);
	function fix(f) {
		var t = tgt(f.getAttribute('src') || '');
		if (!t || f.getAttribute('data-cmcpx')) return;
		f.setAttribute('data-cmcpx', '1');
		var id = ++seq, ph = document.createElement('div');
		ph.style.cssText = 'padding:28px 16px;text-align:center;font:15px/1.6 -apple-system,system-ui,sans-serif;color:#888';
		var msg = document.createElement('p'); msg.style.textWrap = 'pretty'; msg.textContent = '正在打开…'; ph.appendChild(msg);
		f.removeAttribute('src');
		f.parentNode && f.parentNode.replaceChild(ph, f);
		wait[id] = { el: f, ph: ph, msg: msg };
		ask(t, id);
	}
	function scan() { var l = document.querySelectorAll('iframe[src]'); for (var i = 0; i < l.length; i++) fix(l[i]); }
	new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
	document.addEventListener('DOMContentLoaded', scan);
})();

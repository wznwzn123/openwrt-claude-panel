/* 6.0 第 36 项：完整原版后台（LuCI）里嵌着的「路由器:其他端口」页面——网页终端、OpenClash 控制面板这类。
 * 在外面打开时，这些地址（隧道的网址 + 端口）打不开：拦下来交给面板，用「远程页面」的地址在新标签页打开。
 * 在家里（网址是路由器的 IP 或 .lan 这类名字）直接能打开，不拦。由 luci-gate 插进 LuCI 页面的 <head>。 */
(function () {
	var h = location.hostname;
	if (window.top === window || /^(\d+\.\d+\.\d+\.\d+|\[[0-9a-f:.]+\]|localhost|[a-z0-9-]+|.+\.(lan|local|home|internal|home\.arpa))$/i.test(h)) return;
	function tgt(u) {
		try { var x = new URL(u, location.href); if (x.hostname === h && x.port && x.port !== location.port) return { port: +x.port, https: x.protocol === 'https:', path: x.pathname + x.search + x.hash }; } catch (e) {}
		return null;
	}
	function ask(t) { window.top.postMessage({ cmcpx: 1, port: t.port, https: t.https, path: t.path }, location.origin); }
	var wo = window.open;
	window.open = function (u) { var t = tgt(u); if (t) { ask(t); return null; } return wo.apply(window, arguments); };
	document.addEventListener('click', function (e) { var a = e.target && e.target.closest && e.target.closest('a[href]'); var t = a && tgt(a.href); if (t) { e.preventDefault(); ask(t); } }, true);
	function fix(f) {
		var t = tgt(f.getAttribute('src') || '');
		if (!t || f.getAttribute('data-cmcpx')) return;
		f.setAttribute('data-cmcpx', '1');
		var d = document.createElement('div');
		d.style.cssText = 'padding:28px 16px;text-align:center;font:15px/1.6 -apple-system,system-ui,sans-serif';
		var p = document.createElement('p'); p.style.textWrap = 'pretty'; p.textContent = '这个页面在路由器的 ' + t.port + ' 端口，在外面要在新标签页打开'; d.appendChild(p);
		var b = document.createElement('button'); b.type = 'button'; b.className = 'btn cbi-button cbi-button-action'; b.textContent = '在新标签页打开'; b.onclick = function () { ask(t); }; d.appendChild(b);
		f.parentNode && f.parentNode.replaceChild(d, f);
	}
	function scan() { var l = document.querySelectorAll('iframe[src]'); for (var i = 0; i < l.length; i++) fix(l[i]); }
	new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
	document.addEventListener('DOMContentLoaded', scan);
})();

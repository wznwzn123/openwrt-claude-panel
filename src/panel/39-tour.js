/* ---------- 6.0 新手引导（用户 11/26：第一次用的、升级到 6.0 的老用户都要有，怕不知道左上角图标是切换） ----------
   4 步：左上角图标（菜单）、往下拉刷新（电脑上是点「● 在线」）、铃铛（通知）、底部快捷栏。每步把那一处挖空高亮，旁边一张小卡片。
   每台手机只出一次（rp_tour6）；能跳过。等连上路由器、没有别的弹窗、没锁屏、在概览页时才出来，不跟「必须更新」公告这些叠在一起。 */
const TOUR_KEY = 'rp_tour6';
function tourSteps() {
	const wide = matchMedia('(min-width:900px)').matches && document.body.classList.contains('app');
	const st = [
		wide ? null : { el: '#menuBtn', t: '点这里打开菜单', d: '所有页面都在菜单里，从这里切换。' },
		wide ? { el: '#statusPill', t: '点这里刷新', d: '' } : { el: '#topbar', t: '往下拉刷新', d: '在页面最上面往下拉，松手就刷新。', pull: true },
		{ el: '#bellBtn', t: '通知在这里', d: '' },
		{ el: '#dock', t: '常用操作', d: '' },
	];
	return st.filter((x) => x && (() => { const e = document.querySelector(x.el); return e && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden'; })());
}
function tourReady() {
	return token && !LK.on && page === 'home' && $('statusDot').classList.contains('on') && !document.querySelector('.modal') && !$('side').classList.contains('open') && $('needcode').classList.contains('hidden') && !document.hidden;
}
function tourRun() {
	const steps = tourSteps();
	if (!steps.length) return;
	let i = 0;
	const ov = document.createElement('div');
	ov.className = 'tour'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', '新手引导');
	ov.innerHTML = '<div class="tourhole"></div><div class="tourcard"><b></b><p></p><div class="tourbar"><span class="tourn"></span><button class="btn sm tourskip" type="button">跳过</button><button class="btn sm primary tournext" type="button"></button></div></div>';
	document.body.appendChild(ov);
	const hole = ov.querySelector('.tourhole'), card = ov.querySelector('.tourcard');
	const end = () => { try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) {} removeEventListener('resize', draw); removeEventListener('keydown', key); ov.remove(); };
	function draw() {
		const s = steps[i], e = document.querySelector(s.el);
		if (!e) return end();
		const r = e.getBoundingClientRect(), pad = s.el === '#topbar' ? 0 : 6;
		const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad), w = Math.min(innerWidth - 8, r.width + pad * 2), h = r.height + pad * 2;
		Object.assign(hole.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', borderRadius: s.el === '#topbar' ? '0 0 18px 18px' : getComputedStyle(e).borderRadius || '14px' });
		hole.classList.toggle('pull', !!s.pull);
		card.querySelector('b').textContent = s.t;
		const p = card.querySelector('p'); p.textContent = s.d; p.classList.toggle('hidden', !s.d);
		card.querySelector('.tourn').textContent = i + 1 + ' / ' + steps.length;
		card.querySelector('.tournext').textContent = i === steps.length - 1 ? '知道了' : '下一步';
		card.querySelector('.tourskip').classList.toggle('hidden', i === steps.length - 1);
		// 卡片放在高亮处下面，放不下就放上面；左右不出屏幕
		const cw = Math.min(300, innerWidth - 24);
		card.style.width = cw + 'px';
		const ch = card.offsetHeight, below = y + h + 12;
		card.style.top = (below + ch < innerHeight - 8 ? below : Math.max(8, y - ch - 12)) + 'px';
		card.style.left = Math.min(innerWidth - cw - 12, Math.max(12, x + w / 2 - cw / 2)) + 'px';
		card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
	}
	const key = (e) => { if (e.key === 'Escape') end(); };
	card.querySelector('.tournext').onclick = () => { if (++i >= steps.length) end(); else draw(); };
	card.querySelector('.tourskip').onclick = end;
	addEventListener('resize', draw); addEventListener('keydown', key);
	draw();
	card.querySelector('.tournext').focus({ preventScroll: true });
}
// 打开面板后等时机：每 2 秒看一次，最多等 2 分钟
(function tourWait() {
	// 自动化测试（navigator.webdriver）里不出，免得挡住别的测试；测引导本身时设 rp_tourtest=1
	try { if (localStorage.getItem(TOUR_KEY) || (navigator.webdriver && !localStorage.getItem('rp_tourtest'))) return; } catch (e) { return; }
	let n = 0;
	const t = setInterval(() => {
		if (++n > 60) return clearInterval(t);
		if (!tourReady()) return;
		clearInterval(t);
		setTimeout(() => { if (tourReady() && !document.querySelector('.tour')) tourRun(); }, 1500);
	}, 2000);
})();

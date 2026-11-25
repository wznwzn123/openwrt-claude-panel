/* ---------- 6.0 动效（用户 11/26：所有动效都做好，尤其细节和弹窗） ----------
   样式在 10-style.css 最后「动效」那段；这里只做 CSS 自己做不到的：
   1. 换页时给新页面加 .pgin（前几块依次浮上来）
   2. 分段开关的白块滑到选中的那一项（.segthumb）
   3. 底部弹出的弹窗能往下拖关掉（拖过 1/4 高度或甩一下）
   4. 来新通知时铃铛摇一下
   系统开了「减少动态效果」时，这些都不做（白块直接放到位） */
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const SEG_SEL = '#modeChips,#runChips,#stView,#apView,#logSeg,#logLevel,#ruSeg,#cfgSeg,#ndTool,#tfRange,#slSeg,#prSort,#cnChips,#wanMode,#lsLease,#wsBand,[data-k="proto"]';
function segPlace(box, now) {
	if (!box.isConnected) return;
	box.classList.add('segon');
	let t = box.querySelector(':scope>.segthumb');
	if (!t) { t = document.createElement('i'); t.className = 'segthumb'; t.setAttribute('aria-hidden', 'true'); box.prepend(t); now = true; }
	const on = box.querySelector(':scope>.chip.on:not(.hidden)');
	if (!on || !box.offsetWidth) { t.style.opacity = '0'; return; }
	const bl = box.getBoundingClientRect().left, r = on.getBoundingClientRect();
	t.classList.toggle('now', !!now || RM() || t.style.opacity === '0');
	t.style.opacity = '1';
	t.style.width = r.width + 'px';
	t.style.transform = `translateX(${r.left - bl - box.clientLeft}px)`;
	if (t.classList.contains('now')) requestAnimationFrame(() => t.classList.remove('now'));
}
const segAll = (now) => document.querySelectorAll(SEG_SEL).forEach((b) => segPlace(b, now));
{
	let segQ = 0;
	const segSoon = (now) => { if (!segQ) segQ = requestAnimationFrame(() => { segQ = 0; segAll(now); }); };
	let bellN0 = 0;
	new MutationObserver((ms) => {
		let seg = false, segNew = false;
		for (const m of ms) {
			const t = m.target;
			if (m.type === 'attributes') {
				if (t.classList?.contains('page') && t.classList.contains('on') && !(m.oldValue || '').split(' ').includes('on') && !RM()) {
					t.classList.remove('pgin'); void t.offsetWidth; t.classList.add('pgin');
					clearTimeout(t._pg); t._pg = setTimeout(() => t.classList.remove('pgin'), 700);
					segNew = true;
				}
				if (t.classList?.contains('chip') && t.parentElement?.matches?.(SEG_SEL)) seg = true;
			} else if (m.type === 'childList') {
				if (t.matches?.(SEG_SEL) || t.querySelector?.(SEG_SEL)) { seg = true; segNew = true; }
				if (t.id === 'bellN') {
					const n = +(t.textContent || 0) || 0;
					if (n > bellN0 && !RM()) { const b = $('bellBtn'); b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); }
					bellN0 = n;
				}
			}
		}
		if (seg) segSoon(segNew);
	}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
	addEventListener('resize', () => segSoon(true));
	setTimeout(() => segAll(true), 300);
}
/* 底部弹窗往下拖关掉：只在弹窗内容已经在最上面、手指往下拖时才算；锁住的弹窗（必须处理的）不能拖 */
{
	let box = null, y0 = 0, dy = 0, t0 = 0;
	addEventListener('touchstart', (e) => {
		const b = e.target.closest?.('.modal:not(.compact) > .modalbox');
		box = null;
		if (!b || e.touches.length !== 1 || matchMedia('(min-width:761px)').matches) return;
		const m = b.parentElement;
		if (m.dataset.lock || m.classList.contains('closing') || RM()) return;
		// 里面能滚的内容没滚到顶：不拖
		let s = e.target;
		while (s && s !== b) { if (s.scrollHeight > s.clientHeight + 2 && s.scrollTop > 0 && /(auto|scroll)/.test(getComputedStyle(s).overflowY)) return; s = s.parentElement; }
		if (b.scrollTop > 0 || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
		box = b; y0 = e.touches[0].clientY; dy = 0; t0 = Date.now();
	}, { passive: true });
	addEventListener('touchmove', (e) => {
		if (!box) return;
		dy = e.touches[0].clientY - y0;
		if (dy <= 0) { box.classList.remove('drag'); box.style.transform = ''; return; }
		box.classList.add('drag'); box.classList.remove('back');
		box.style.transform = `translateY(${dy}px)`;
	}, { passive: true });
	addEventListener('touchend', () => {
		if (!box) return;
		const b = box, m = b.parentElement, v = dy / Math.max(1, Date.now() - t0);
		box = null;
		if (!b.classList.contains('drag')) return;
		b.classList.remove('drag');
		if (dy > b.offsetHeight / 4 || (dy > 40 && v > 0.6)) {
			b.style.transition = 'transform .22s cubic-bezier(.4,0,1,1)'; b.style.transform = 'translateY(100%)';
			if (m._close) m._close(null); else m.remove();
		} else {
			b.classList.add('back'); b.style.transform = '';
			setTimeout(() => b.classList.remove('back'), 340);
		}
	}, { passive: true });
}

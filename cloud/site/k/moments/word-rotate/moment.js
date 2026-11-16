/*
  word-rotate - one word of the hero headline changes on a clock: the word in place slides up out of its
  mask while the next rises in from below; the underline under it stays. It runs through the list
  `cycles` times (3) and rests on the first word, so it never runs for long on its own.

    <h1>Grok for everything you <span data-moment="word-rotate"
        data-moment-opts='{"words": ["build", "imagine", "search"], "every": 2200}'>build</span></h1>

  opts: words (2 to 5, the written word first or it is added first); every ms a word stays (2200);
        cycles (3; 0 = for as long as the page is open: then it needs a pause control nearby).
  Reduced motion, no script: the written word stands.
*/
export default function (root, opts, lib) {
  const first = root.textContent.trim();
  const words = Array.isArray(opts.words) ? opts.words.map(w => String(w).trim()).filter(Boolean) : [];
  if (!words.includes(first)) words.unshift(first);
  root.setAttribute('aria-label', first);
  root.textContent = '';
  root.classList.add('mo-wr');
  const cells = words.map((w, i) => {
    const s = document.createElement('span');
    s.className = 'mo-wr__w' + (i === 0 ? ' is-on' : '');
    s.setAttribute('aria-hidden', 'true');
    s.textContent = w;
    root.append(s);
    return s;
  });
  // 改（路由器面板官网）：opts.fit 为 true（或者一个媒体查询，比如 "(min-width: 1024px)"，满足时才这样）时，
  // 外框宽度跟着当前这个词走（短词后面的字跟着靠过来，不留一段空白）；不满足时照旧按最长的词占位，换词时不会换行跳动
  let i = 0;
  const fitOn = () => opts.fit === true || (typeof opts.fit === 'string' && matchMedia(opts.fit).matches);
  const fitTo = (anim) => {
    if (!opts.fit) return;
    if (!fitOn()) { root.style.transition = 'none'; root.style.width = ''; return; }
    root.style.transition = anim ? 'width 640ms cubic-bezier(.16, 1, .3, 1)' : 'none';
    root.style.width = cells[i].offsetWidth + 'px';
  };
  fitTo(false);
  if (opts.fit) {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitTo(false));
    addEventListener('resize', () => fitTo(false));
  }
  if (lib.reduced() || cells.length < 2) return {};
  const every = Math.max(1200, opts.every || 2200), cycles = opts.cycles ?? 3;
  let timer = 0, visible = false, shown = 0;
  const rests = () => cycles && shown >= cycles * cells.length;
  const step = () => {
    if (!visible || rests()) return;
    const out = cells[i];
    i = (i + 1) % cells.length;
    const inn = cells[i];
    out.classList.remove('is-on'); out.classList.add('is-out');
    inn.classList.remove('is-out'); inn.classList.add('is-on');
    fitTo(true);
    setTimeout(() => out.classList.remove('is-out'), 700);
    shown++;
    if (!rests()) timer = setTimeout(step, every);
  };
  const io = new IntersectionObserver(es => {
    visible = es[es.length - 1].isIntersecting;
    clearTimeout(timer);
    if (visible && !rests()) timer = setTimeout(step, every);
  });
  io.observe(root);
  return { destroy() { clearTimeout(timer); io.disconnect(); } };
}

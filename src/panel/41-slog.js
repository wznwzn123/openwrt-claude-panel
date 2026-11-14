/* =====================================================================
   系统日志
   ===================================================================== */
let slKind = 'sys', slData = null, slErrOnly = false;
async function loadSlog() {
	slData = await P('slog', { kind: slKind, lines: 1000 });
	setStatus(true, '在线');
	renderSlog();
}
function renderSlog() {
	if (!slData) return;
	$('slTitle').textContent = slKind === 'kern' ? '内核日志' : '系统日志';
	const kw = $('slFilter').value.trim().toLowerCase();
	const isErr = (l) => /\.(err|crit|alert|emerg)\b|error|fail|denied|refused/i.test(l);
	let lines = (slData.text || '').split('\n').filter((l) => l && (!kw || l.toLowerCase().includes(kw)) && (!slErrOnly || isErr(l)));
	$('slCount').textContent = lines.length + ' 行';
	lines = lines.reverse();
	$('slBox').innerHTML = lines.length ? lines.map((l) => {
		const c = isErr(l) ? 'e' : /\.warn\b|warning/i.test(l) ? 'w' : '';
		return `<span class="${c}">${esc(l)}</span>`;
	}).join('\n') : '（没有日志）';
}
$$('#slSeg .chip').forEach((b) => (b.onclick = () => { slKind = b.dataset.k; $$('#slSeg .chip').forEach((x) => x.classList.toggle('on', x === b)); slData = null; $('slBox').textContent = '读取中…'; refresh(); }));
$('slFilter').addEventListener('input', renderSlog);
$('slErr').onclick = () => { slErrOnly = !slErrOnly; $('slErr').classList.toggle('blue', slErrOnly); $('slErr').textContent = slErrOnly ? '显示全部' : '只看错误'; renderSlog(); };
$('slCopy').onclick = () => { const t = $('slBox').innerText; navigator.clipboard?.writeText(t).then(() => toast('已复制'), () => toast('复制失败', true)); };


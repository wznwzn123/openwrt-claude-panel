/* =====================================================================
   日志
   ===================================================================== */
let logKind = 'plugin', logData = null;
$('logSeg').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; logKind = b.dataset.k; $$('#logSeg .chip').forEach((x) => x.classList.toggle('on', x === b)); renderLog(); };
$('logFilter').oninput = () => renderLog();
$('logLevel').onclick = (e) => { const b = e.target.closest('[data-l]'); if (!b) return; busy(null, async () => { await P('quick', { action: 'log_level', arg: b.dataset.l }); toast('内核日志级别：' + b.textContent); $$('#logLevel .chip').forEach((x) => x.classList.toggle('on', x === b)); }); };
$('logCopy').onclick = () => copyText($('logBox').textContent);
$('logClear').onclick = async (e) => {
	const start = logKind === 'start';
	if (!(await confirmBox('清空' + (start ? '启动日志' : '日志'), start ? '清空 OpenClash 启动日志。' : '插件日志和内核日志在同一个文件里，会一起清空。', '清空', true))) return;
	busy(e.currentTarget, async () => { await P('quick', { action: start ? 'clear_start_log' : 'clear_log' }); toast('已清空'); loadLog(); });
};
$('logDebug').onclick = (e) => busy(e.currentTarget, async () => { const r = await P('quick', { action: 'debug' }, 120000); textBox('调试日志', r.text || '（空）'); }, '生成中');
async function loadLog() {
	logData = await P('logs', { lines: 400 });
	setStatus(true, '在线');
	$$('#logLevel .chip').forEach((x) => x.classList.toggle('on', x.dataset.l === logData.level));
	renderLog();
}
function renderLog() {
	if (!logData) return;
	const t = { plugin: logData.plugin, core: logData.core, start: logData.start }[logKind] || '';
	$('logTitle').textContent = { plugin: '插件日志', core: '内核日志', start: '启动日志' }[logKind];
	const kw = $('logFilter').value.trim().toLowerCase();
	let lines = t.split('\n').filter((l) => l && (!kw || l.toLowerCase().includes(kw)));
	$('logCount').textContent = lines.length + ' 行';
	lines = lines.reverse();
	const box = $('logBox');
	box.innerHTML = lines.length ? lines.map((l) => {
		let c = /level=(error|fatal)|\[Error\]|错误|失败|failed/i.test(l) ? 'e' : /level=warn|\[Warn|\[Tip\]|警告/i.test(l) ? 'w' : /\[Info\]|level=info/.test(l) ? '' : '';
		if (logKind === 'core') l = l.replace(/^time="([^"]+)"\s*/, (m, d) => { const x = new Date(d); return isNaN(x) ? m : x.toLocaleTimeString('zh-CN', { hour12: false }) + ' '; }).replace(/msg="(.*)"$/, '$1');
		return `<span class="${c}">${esc(l)}</span>`;
	}).join('\n') : '（没有日志）';
}


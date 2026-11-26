/* ---------- 6.0 第 31、35 项：定时重启、定时关 Wi-Fi（特色功能里）、关机（系统操作里） ----------
 * 用户 11/26 定：定时开关机改成「定时重启 + 定时关 Wi-Fi」；关机只做手动按钮，写清「关了要拔插电源才能开」。只有主账号能设。 */
const SCH = { d: null };
const SCH_DAY = ['日', '一', '二', '三', '四', '五', '六'];
async function loadSched() {
	try { SCH.d = await P('sched_get'); } catch (e) { SCH.d = null; }
	schRender();
}
const schDays = (d) => (d.length === 7 ? '每天' : d.join() === '1,2,3,4,5' ? '周一到周五' : d.join() === '0,6' ? '周末' : '周' + d.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((x) => SCH_DAY[x]).join('、'));
function schRender() {
	const d = SCH.d, box = $('scBox');
	if (!box) return;
	if (!d || !d.reboot || !d.wifi) { box.innerHTML = ''; return; }
	const r = d.reboot, w = d.wifi, ro = !d.owner;
	const row = (k, t, on, sub) => `<div class="kv aswon schrow" data-sch="${k}"><span><b>${t}</b><span class="muted">${esc(sub)}</span></span>${ro ? `<span class="pill">${on ? '开着' : '关着'}</span>` : `<button class="btn sm" data-sch-set="${k}" type="button">设置</button><span class="sw"><input type="checkbox" data-sch-on="${k}"${on ? ' checked' : ''} aria-label="${t}"><i></i></span>`}</div>`;
	box.innerHTML = `<div class="sectitle"><b>定时</b>${ro ? '<span class="muted" style="font-size:13px">只有主账号能设</span>' : ''}</div><section class="card aucard">
		${row('reboot', '定时重启', r.on, r.on ? schDays(r.days) + ' ' + r.at : '关着')}
		${row('wifi', '定时关 Wi-Fi', w.on, w.on ? schDays(w.days) + ' ' + w.off + ' 关，' + w.on_at + ' 开' : '关着')}
		${w.on && d.sta ? '<div class="notice w" style="margin:2px 0 8px">在用无线中继上网，到点不会关</div>' : ''}</section>`;
}
async function schSheet(k) {
	const d = SCH.d, cur = d[k], isR = k === 'reboot', days = new Set(cur.days);
	const v = await modal(`<h3>${isR ? '定时重启' : '定时关 Wi-Fi'}</h3>
		<div class="ofdays" style="margin-top:6px">${[1, 2, 3, 4, 5, 6, 0].map((x) => `<button type="button" class="chip${days.has(x) ? ' on' : ''}" data-d="${x}">${SCH_DAY[x]}</button>`).join('')}</div>
		${isR ? `<div class="fld"><div class="lb"><b>几点</b></div><div class="ctl"><input class="input" type="time" data-t="at" value="${esc(cur.at)}"></div></div>`
		: `<div class="lsrange"><div class="fld"><div class="lb"><b>关</b></div><div class="ctl"><input class="input" type="time" data-t="off" value="${esc(cur.off)}"></div></div><div class="fld"><div class="lb"><b>开</b></div><div class="ctl"><input class="input" type="time" data-t="on_at" value="${esc(cur.on_at)}"></div></div></div>`}
		${isR ? '' : '<p class="muted" style="font-size:13px;margin:8px 0 0">关的时候连着 Wi-Fi 的设备都会断开。</p>'}
		<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-v="close">取消</button><button class="btn primary" data-v="save">保存</button></div>`,
	(m, close) => {
		m.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { const x = +b.dataset.d; if (days.has(x)) days.delete(x); else days.add(x); b.classList.toggle('on'); }));
		const save = m.querySelector('[data-v="save"]');
		save.addEventListener('click', (e) => {
			e.stopPropagation();
			if (!days.size) return toast('至少选一天', true);
			const g = (n) => m.querySelector(`[data-t="${n}"]`).value;
			const body = isR ? { on: true, days: [...days], at: g('at') } : { on: true, days: [...days], off: g('off'), on_at: g('on_at') };
			busy(save, async () => { SCH.d = await P('sched_set', { [k]: body }); close('ok'); schRender(); toast(isR ? '已开启定时重启' : '已开启定时关 Wi-Fi'); });
		});
	});
	if (v !== 'ok') schRender();
}
$('scBox').addEventListener('click', (e) => { const b = e.target.closest('[data-sch-set]'); if (b) schSheet(b.dataset.schSet); });
$('scBox').addEventListener('change', async (e) => {
	const k = e.target.dataset.schOn; if (!k) return;
	if (e.target.checked) return schSheet(k);
	try { SCH.d = await P('sched_set', { [k]: { ...SCH.d[k], on: false } }); schRender(); toast(k === 'reboot' ? '已关掉定时重启' : '已关掉定时关 Wi-Fi'); } catch (er) { e.target.checked = true; toast(er.message, true); }
});
$('pwOff').addEventListener('click', async () => {
	if (!(await confirmBox('关机', '关了要拔插电源才能开。', '关机', true))) return;
	try { await P('poweroff', { confirm: 'OFF' }); setStatus(false, '已关机'); toast('路由器正在关机'); } catch (e) { toast(e.message, true); }
});

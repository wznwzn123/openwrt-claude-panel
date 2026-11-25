
/* ---------- 6.0 第 16 项：孩子上网计划 ----------
 * 每台设备按星期设能上网的时段，其余时间断网（路由器的时间为准）。快到停网时间推送给设计划的家长，
 * 点开能临时延长 30 分钟 / 1 小时（推送上的按钮只是打开面板，在这里再点一次才生效）。
 * 有新 MAC 用了计划里设备的名字（换地址绕过），推送里点「计划也管它」。 */
const PL_WD = ['一', '二', '三', '四', '五', '六', '日'];
function plDays(d) {
	const k = d.join();
	if (k === '1,2,3,4,5,6,7') return '每天';
	if (k === '1,2,3,4,5') return '周一到周五';
	if (k === '6,7') return '周末';
	if (d.length > 2 && d.every((x, i) => !i || x === d[i - 1] + 1)) return '周' + PL_WD[d[0] - 1] + '到周' + PL_WD[d[d.length - 1] - 1];
	return '周' + d.map((x) => PL_WD[x - 1]).join('、');
}
const plMin = (t) => { const m = /^(\d+):(\d+)$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : 0; };
const plSlot = (s) => `${plDays(s.d)} ${s.from}–${s.to}${plMin(s.to) <= plMin(s.from) ? '（到第二天）' : ''}`;
// 几点：今天只写时间，明天写「明天」，再往后写星期几
function plWhen(t) {
	const x = new Date(t * 1000), n = new Date(), day = Math.round((new Date(x.getFullYear(), x.getMonth(), x.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5);
	return (day === 0 ? '' : day === 1 ? '明天 ' : '周' + PL_WD[(x.getDay() + 6) % 7] + ' ') + hm(t * 1000);
}
// 计划现在怎样（路由器算好的 pn：ok 能不能上网、at 几点停 / 几点能上、ext 延长到）
function plState(e) {
	const pn = e && e.pn;
	if (!pn) return '';
	if (pn.ok) return pn.at ? `能上网，${plWhen(pn.at)} 停网${pn.ext ? '（延长过）' : ''}` : '一直能上网';
	return pn.at ? `停网中，${plWhen(pn.at)} 能上网` : '停网中';
}
// 按手机上的时间粗算：这些时段现在能不能上网（只用来提醒「保存后马上断网」）
function plOkNow(slots) {
	const n = new Date(), wd = (n.getDay() + 6) % 7 + 1, m = n.getHours() * 60 + n.getMinutes(), y = (wd + 5) % 7 + 1;
	return slots.some((s) => {
		const a = plMin(s.from), b = plMin(s.to);
		if (b > a) return s.d.includes(wd) && m >= a && m < b;
		return (s.d.includes(wd) && m >= a) || (s.d.includes(y) && m < b);
	});
}
// 随机 MAC（第一个字节第二位是 1）：手机的「私有地址」，换一个就不受计划限制
const plRandMac = (mac) => /^[0-9a-f]([2367abef]):/.test(mac || '');
function planSheet(d) {
	if (!d.mac) return toast('这台设备读不到 MAC 地址，没法设上网计划', true);
	if (!canPerm('parent')) return toast('主账号没有给你开「家长控制」，不能设上网计划', true);
	const name = d.name || d.ip || d.mac;
	let pick = [1, 2, 3, 4, 5];
	const html = () => {
		const e = PZ.devs[d.mac] || {}, slots = (e.plan && e.plan.slots) || [], st = plState(e);
		return `<div class="sheethead"><h3>「${esc(name)}」上网计划</h3><button class="btn sm" data-v="close">关闭</button></div>
		${st ? `<div class="notice${e.pn && !e.pn.ok ? ' w' : ''}" style="margin:0 0 10px"><b>${esc(st)}</b></div>` : ''}
		${plRandMac(d.mac) ? '<div class="notice w" style="margin:0 0 10px">这台设备用的是随机 MAC：在它的 Wi-Fi 设置里关掉「私有地址」，不然换个地址就不受计划限制。</div>' : ''}
		<div class="subhd" style="margin-top:4px;border-top:0;padding-top:0">能上网的时段</div>
		${slots.map((s, i) => `<div class="plrow"><span>${esc(plSlot(s))}</span><button class="btn sm" data-pldel="${i}">删除</button></div>`).join('')}
		<div class="plwk" role="group" aria-label="星期">${PL_WD.map((w, i) => `<button class="chip${pick.includes(i + 1) ? ' on' : ''}" data-wk="${i + 1}" aria-pressed="${pick.includes(i + 1)}">${w}</button>`).join('')}</div>
		<div class="pzadd pladd"><input class="input" type="time" data-from value="16:00" aria-label="开始"><span class="muted">到</span><input class="input" type="time" data-to value="21:00" aria-label="结束"><button class="btn blue" data-pl="add">添加</button></div>
		${slots.length ? `<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-pl="30">延长 30 分钟</button><button class="btn" data-pl="60">延长 1 小时</button></div>
		<button class="btn danger" data-pl="del" style="width:100%;margin-top:8px">删除上网计划</button>` : ''}`;
	};
	modal(html(), (m) => {
		const box = m.querySelector('.modalbox');
		const redo = () => { const f = box.querySelector('[data-from]').value, t = box.querySelector('[data-to]').value; box.innerHTML = html(); box.querySelector('[data-from]').value = f; box.querySelector('[data-to]').value = t; };
		const save = async (args, msg) => {
			PZ = await P('pause_set', { mac: d.mac, name: d.name || undefined, ...args });
			redo(); if (msg) toast(msg); renderPz(); loadDev().catch(() => {});
		};
		box.addEventListener('click', async (ev) => {
			const wk = ev.target.closest('[data-wk]');
			if (wk) { const x = +wk.dataset.wk; pick = pick.includes(x) ? pick.filter((y) => y !== x) : [...pick, x].sort((a, b) => a - b); return redo(); }
			const b = ev.target.closest('[data-pl],[data-pldel]'); if (!b) return;
			const e = PZ.devs[d.mac] || {}, slots = ((e.plan && e.plan.slots) || []).slice(), k = b.dataset.pl;
			// 改完以后现在不在能上网的时段里：先说清楚会马上断网
			const warn = async (next) => !(next.length && !plOkNow(next) && (!e.pn || e.pn.ok) && !(e.pn && e.pn.ext)) || confirmBox('保存上网计划？', `现在不在能上网的时段里，保存后「${name}」马上断网。`, '保存', true);
			if (b.dataset.pldel != null) {
				slots.splice(+b.dataset.pldel, 1);
				if (!slots.length) {
					if (!(await confirmBox('删除上网计划？', `删除后「${name}」任何时间都能上网。`, '删除', true))) return;
					return busy(b, () => save({ plan: null }, '已删除上网计划'), false);
				}
				if (!(await warn(slots))) return;
				return busy(b, () => save({ plan: slots }, '已删除这个时段'), false);
			}
			if (k === 'add') {
				const from = box.querySelector('[data-from]').value, to = box.querySelector('[data-to]').value;
				if (!pick.length) return toast('至少选一天', true);
				if (!from || !to || from === to) return toast('开始和结束时间不能一样', true);
				const s = { d: pick.slice(), from, to };
				if (slots.some((x) => x.d.join() === s.d.join() && x.from === from && x.to === to)) return toast('已经有这个时段了', true);
				if (slots.length >= 8) return toast('最多 8 个时段', true);
				slots.push(s);
				if (!(await warn(slots))) return;
				return busy(b, () => save({ plan: slots }, '已添加：' + plSlot(s)), false);
			}
			if (k === 'del') {
				if (!(await confirmBox('删除上网计划？', `删除后「${name}」任何时间都能上网。`, '删除', true))) return;
				return busy(b, () => save({ plan: null }, '已删除上网计划'), false);
			}
			if (k === '30' || k === '60') return busy(b, async () => { await save({ ext: +k }, ''); const pn = (PZ.devs[d.mac] || {}).pn; toast(pn && pn.at ? '已延长到 ' + plWhen(pn.at) : '已延长'); }, false);
		});
	});
}
// 推送「快到停网时间」点进来：问延长多久（推送上点的是哪个按钮，那个就是蓝色的）
async function askExt(mac, min) {
	if (!/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(mac || '')) return;
	if (!canPerm('parent')) return toast('主账号没有给你开「家长控制」，不能延长上网时间', true);
	if (page !== 'dev') await go('dev');
	try { await loadDev(); } catch (e) {}
	const e = PZ.devs[mac], d = devices.find((x) => x.mac === mac) || { mac, name: e && e.name };
	if (!e || !e.plan) return toast('这台设备已经没有上网计划了');
	const name = d.name || mac;
	modal(`<h3>「${esc(name)}」${esc(plState(e))}</h3>
		<div class="btngrid" style="margin:14px 0 0"><button class="btn${min === 60 ? '' : ' primary'}" data-e="30">延长 30 分钟</button><button class="btn${min === 60 ? ' primary' : ''}" data-e="60">延长 1 小时</button></div>
		<button class="btn" data-v="close" style="width:100%;margin-top:8px">不用</button>`, (m, close) => {
		m.dataset.ext = 1;
		m.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => busy(b, async () => {
			PZ = await P('pause_set', { mac, ext: +b.dataset.e });
			close(null); renderPz(); loadDev().catch(() => {});
			const pn = (PZ.devs[mac] || {}).pn;
			toast(`「${name}」已延长到 ` + (pn && pn.at ? plWhen(pn.at) : ''));
		}, false)));
	}, { compact: true });
}
// 推送「可能换了 MAC 地址」点进来：把原来那台的计划也用到新地址
async function askPlanCopy(mac, src) {
	const re = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/;
	if (!re.test(mac || '') || !re.test(src || '')) return;
	if (!canPerm('parent')) return toast('主账号没有给你开「家长控制」，不能设上网计划', true);
	if (page !== 'dev') await go('dev');
	try { await loadDev(); } catch (e) {}
	const e = PZ.devs[src], d = devices.find((x) => x.mac === mac) || { mac }, sd = devices.find((x) => x.mac === src) || {};
	if (!e || !e.plan) return toast('原来那台设备已经没有上网计划了');
	const sn = sd.name || e.name || src;
	if (!(await confirmBox('上网计划也管这台设备？', `把「${sn}」的上网计划（${e.plan.slots.map(plSlot).join('、')}）也用到${d.name ? '「' + d.name + '」（' + mac + '）' : ' ' + mac}。`, '用到它'))) return;
	try {
		PZ = await P('pause_set', { mac, name: d.name || sn, plan: e.plan.slots });
		renderPz(); loadDev().catch(() => {}); toast('上网计划已经也管它了');
	} catch (x) { toast(x.message, true); }
}
// 这台手机开了通知：告诉官网是哪个账号的手机（计划提醒只推给设计划的家长）。每台手机每个账号只报一次
async function pushTag() {
	try {
		if (!('serviceWorker' in navigator) || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
		const reg = await navigator.serviceWorker.getRegistration(), sub = reg && (await reg.pushManager.getSubscription());
		if (!sub) return;
		const id = await P('push_id');
		if (!id || !id.uid) return;
		const k = id.uid + '|' + sub.endpoint.slice(-24);
		if (store.get('rp_push_uid') === k) return;
		if (!cinfo) { try { cinfo = await P('cloud_info'); } catch (e) {} }
		await cloudPush({ op: 'sub', sub: sub.toJSON(), name: devName(), uid: id.uid, sig: id.sig });
		store.set('rp_push_uid', k);
	} catch (e) {}
}


/* ---------- 6.0 第 17 项：家人只管自己的设备 ----------
 * 只管自己的家人（没有「看和管所有设备」）：设备页只有自己名下的设备，「认领设备」选哪台是自己的，主账号确认后才算。
 * 主账号：设备页上方列出等确认的认领；设备「更多 → 归谁」指定给某个家人。 */
const OWN = { d: null };
const ownCan = () => ME_ROLE.role !== 'sub' && !!ME_ROLE.uid; // 托管版的主账号（有官网账号才有家人）
// 家人的名字（主账号的「我的主页 → 家人」里读过的）
function ownName(uid) { const x = ((MP.mem && MP.mem.subs) || []).find((y) => y.uid === uid); return x ? meName(x) : uid === (ME && ME.me && ME.me.uid) ? '我' : '一位家人'; }
function ownWho(mac) { const e = OWN.d && OWN.d.own && OWN.d.own[mac]; return !e ? '没指定' : ownName(e.uid) + (e.ok ? '' : '（等确认）'); }
async function ownMembers() {
	if (MP.mem) return MP.mem;
	try { MP.mem = (await P('fam', { op: 'members' }, 20000)) || null; } catch (e) {}
	return MP.mem;
}
function ownRender() {
	const box = $('ownBox'); if (!box) return;
	const d = OWN.d, own = (d && d.own) || {}, limit = !!(blk && blk.own);
	$('dvHead').textContent = limit ? '我的设备' : '设备';
	$('dvAllT').textContent = limit ? '我名下的设备' : '全部设备';
	$('dvClaim').classList.toggle('hidden', !(ME_ROLE.role === 'sub' && d && d.limit));
	const pend = Object.entries(own).filter(([, e]) => !e.ok);
	if (!pend.length) { box.innerHTML = ''; return; }
	const nm = (mac) => (devices.find((x) => x.mac === mac) || {}).name || ((d.cands || []).find((x) => x.mac === mac) || {}).name || mac;
	if (ME_ROLE.role === 'sub') {
		box.innerHTML = `<section class="card" style="margin-top:12px"><div class="ownrow"><span><b>等主账号确认</b><span class="muted">${pend.map(([m]) => esc(nm(m))).join('、')}</span></span></div></section>`;
		return;
	}
	box.innerHTML = `<div class="sectitle"><b>家人认领的设备</b><span class="pill warnc">${pend.length} 台等确认</span></div><section class="card list">${pend.map(([mac, e]) => `<div class="ownrow" data-om="${esc(mac)}"><span><b>${esc(nm(mac))}</b><span class="muted">${esc(ownName(e.uid))}说是他的</span></span><span class="ownbtn"><button class="btn sm" data-oa="no">不是</button><button class="btn sm primary" data-oa="ok">确认</button></span></div>`).join('')}</section>`;
	if (!MP.mem) ownMembers().then((m) => { if (m) ownRender(); });
}
$('ownBox').addEventListener('click', (e) => {
	const b = e.target.closest('[data-oa]'), row = e.target.closest('[data-om]'); if (!b || !row) return;
	const mac = row.dataset.om, en = OWN.d.own[mac];
	busy(b, async () => {
		const r = await P('dev_own_set', { mac, uid: b.dataset.oa === 'ok' ? en.uid : null });
		OWN.d.own = r.own; ownRender();
		toast(b.dataset.oa === 'ok' ? '已确认：这台设备归' + ownName(en.uid) : '已拒绝');
	}, false);
});
// 子账号：认领
$('dvClaim').addEventListener('click', async () => {
	let d = OWN.d;
	try { d = OWN.d = await P('dev_own'); } catch (e) {}
	const c = (d && d.cands) || [];
	const html = () => `<div class="sheethead"><h3>哪台是你的？</h3><button class="btn sm" data-v="close">关闭</button></div>
		${c.length ? `<section class="card list" style="box-shadow:none;padding:2px 14px">${c.map((x) => `<div class="ownrow"><span><b>${esc(x.name || x.mac)}</b><span class="muted">${x.online ? '在线' : '离线'} · ${esc(x.mac)}</span></span>${(OWN.d.own || {})[x.mac] ? '<span class="pill">等确认</span>' : `<button class="btn sm blue" data-cl="${esc(x.mac)}">这是我的</button>`}</div>`).join('')}</section>` : '<p class="muted" style="margin:0">没有能认领的设备</p>'}`;
	modal(html(), (m) => {
		m.querySelector('.modalbox').addEventListener('click', (ev) => {
			const b = ev.target.closest('[data-cl]'); if (!b) return;
			busy(b, async () => {
				const r = await P('dev_claim', { mac: b.dataset.cl });
				OWN.d.own = { ...(OWN.d.own || {}), [b.dataset.cl]: r.own };
				m.querySelector('.modalbox').innerHTML = html(); ownRender();
				toast('已发给主账号确认');
			}, false);
		});
	});
});
// 主账号：指定归谁
async function ownPick(d) {
	const mm = await ownMembers();
	const subs = ((mm && mm.subs) || []).filter((x) => !x.off);
	const cur = OWN.d && OWN.d.own && OWN.d.own[d.mac];
	const v = await moreSheet({ t: '「' + (d.name || d.mac) + '」归谁', sub: '现在：' + ownWho(d.mac) }, [
		{ items: subs.map((x) => ({ v: 'u:' + x.uid, ic: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>', t: meName(x) + (cur && cur.uid === x.uid && cur.ok ? '（现在）' : ''), sub: (x.perms || []).includes('alldev') ? '能看和管所有设备' : '' })) },
		{ items: [cur && { v: 'none', ic: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>', t: '谁的都不是' }] },
	]);
	if (!v || v === 'close') return;
	try {
		const r = await P('dev_own_set', { mac: d.mac, uid: v === 'none' ? null : v.slice(2) });
		OWN.d = { ...(OWN.d || {}), own: r.own }; ownRender();
		toast(v === 'none' ? '这台设备谁的都不是了' : '这台设备归' + ownName(v.slice(2)) + '了');
	} catch (e) { toast(e.message, true); }
}

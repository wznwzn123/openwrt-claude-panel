/* ---------- 6.0 第 94 项：托管版的「AI 版 / 本地版」 ----------
   「我的主页 → 这台路由器」里显示现在是哪个版本，主账号能换；换的时候路由器在后台做，这里看进度。
   旧的托管纯面板版：更新后提示一次，能「打开 AI 功能」或「换成本地版」。托管服务到期 / 停用：弹卡片，能输续期码。 */
const ED_NAME = { ai: 'AI 版', local: '本地版', noai: '纯面板版（旧）' };
const ED_STEP = { hub: '官网开通隧道', space: '路由器空间不够', download: '下载隧道程序', tunnel: '连接隧道', write: '写入设置', busy: '正在更新', other: '' };
const edN = (to) => (to === 'ai' ? ' AI 版' : ED_NAME[to]); // 「换成」后面接英文要空一格
const edNow = () => (ME_ROLE && ME_ROLE.ed) || null;
// 「这台路由器」里的一行：版本 + 换（只有主账号能换）
function edRow() {
	const ed = edNow();
	if (!ed) return '';
	return `<dt>版本</dt><dd class="mp-edd"><span>${esc(ED_NAME[ed])}</span>${ME_ROLE.role !== 'sub' ? '<button type="button" class="btn sm" data-mp="edsw">换版本</button>' : ''}</dd>`;
}
async function edSheet() {
	const cur = edNow();
	if (!cur) return;
	const opt = (to, t, x) => `<button class="mact${cur === to ? ' on' : ''}" data-v="${to}"${cur === to ? ' disabled' : ''}><i>${mIc(to === 'local' ? '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>' : '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>')}</i><span><b>${esc(t)}${cur === to ? '（现在）' : ''}</b><small>${esc(x)}</small></span></button>`;
	const to = await modal(`<div class="sheethead"><h3>换版本</h3><button class="btn sm" data-v="close">关闭</button></div>
		<p class="muted" style="margin:0 0 10px;text-wrap:pretty">账号、家人、设置和到期时间都不变。</p>
		<div class="mlist">${opt('ai', cur === 'noai' ? '打开 AI 功能' : 'AI 版', '在哪都能打开面板，能接 Claude、ChatGPT 等 AI')}${opt('local', '本地版', '只能连着家里 Wi-Fi 打开，比 AI 版省约 30 MB')}</div>`);
	if (to !== 'ai' && to !== 'local') return;
	const lan = lanAddr();
	const what = to === 'local'
		? `换好以后在外面打不开面板，只能连着家里 Wi-Fi 打开 ${lan ? lan.url : 'http://路由器地址:906/panel/'}。\nAI 连接器地址会换成家里的地址；推送、云端备份照常。\n路由器会删掉隧道程序（cloudflared），面板会断开几秒。`
		: cur === 'noai' ? '打开以后能用 AI 连接器地址（在「我的主页 → 敏感信息」里）。' : '路由器要下载隧道程序（约 30 MB，闪存不够就放在内存里），2 分钟左右。\n没装上会自动退回本地版。';
	if (!(await confirmBox(to === 'local' ? '换成本地版' : cur === 'noai' ? '打开 AI 功能' : '换成 AI 版', what, to === 'local' ? '换成本地版' : cur === 'noai' ? '打开' : '换成 AI 版', to === 'local'))) return;
	let r;
	try { r = await P('edition_set', { to }); } catch (e) { return toast(e.message, true); }
	edProgress(to, r.id, r.lan || lan);
}
// 进度：路由器在后台换，这里每 2 秒问一次；换成本地版时隧道一停，在外面的手机就连不上了——直接告诉他去家里打开
function edProgress(to, id, lan) {
	const remote = !LAN_HOME;
	modal(`<h3 data-t>正在换成${esc(edN(to))}</h3><div class="notice" data-m style="line-height:1.6;text-wrap:pretty"><span class="spin">↻</span> 准备中</div>
		<div class="btngrid" style="margin:14px 0 0"><button class="btn primary" data-v="close" data-done disabled>完成</button></div>`, (m, close) => {
		m.dataset.lock = '1';
		const T = m.querySelector('[data-t]'), M = m.querySelector('[data-m]'), B = m.querySelector('[data-done]');
		const end = (ok, html) => { clearInterval(tm); T.textContent = (ok ? '已换成' : '没换成') + edN(to); M.className = 'notice' + (ok ? '' : ' w'); M.innerHTML = html; B.disabled = false; delete m.dataset.lock; if (ok) loadRole(); };
		let miss = 0;
		const tick = async () => {
			let s;
			try { s = await P('edition_state', {}, 6000); miss = 0; } catch (e) {
				// 换成本地版、手机不在家：隧道停了，连不上是正常的
				if (to === 'local' && remote && ++miss >= 2) return end(true, `隧道已经停了，这台手机在外面连不上路由器了。换好会推送通知你。<br>以后连着家里 Wi-Fi 打开 <b>${esc(lan ? lan.url : 'http://路由器地址:906/panel/')}</b>，或者从官网「我的路由器」点「打开面板」。`);
				return;
			}
			const j = s && s.job;
			if (!j || j.id !== id) return;
			if (j.state === 'run') { M.innerHTML = `<span class="spin">↻</span> ${esc(j.msg || '正在换')}`; return; }
			if (j.state === 'ok') return end(true, esc(j.msg || ''));
			end(false, `${ED_STEP[j.step] ? '<b>' + esc(ED_STEP[j.step]) + '</b>：' : ''}${esc(j.msg || '')}${/已退回/.test(j.msg || '') ? '' : '<br>已退回' + esc(edN(edNow()) || '原来的版本') + '，'}路由器照常能用。`);
		};
		const tm = setInterval(tick, 2000);
		setTimeout(tick, 800);
		B.onclick = () => close(null);
	}, { compact: true });
}
// 旧的托管纯面板版：更新到 6.0 后提示一次（只有主账号）
function edNoaiHint() {
	if (edNow() !== 'noai' || ME_ROLE.role === 'sub' || store.get('rp_noaihint')) return;
	store.set('rp_noaihint', '1');
	modal(`<h3>纯面板版可以换成 AI 版或本地版了</h3><p class="muted" style="margin:6px 0 0;line-height:1.6;text-wrap:pretty">AI 版能接 Claude、ChatGPT 等 AI；本地版只能连着家里 Wi-Fi 打开，比现在省约 30 MB。不换也能照常用。</p>
		<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-v="close">不换</button><button class="btn primary" data-v="go">看看</button></div>`, null, { compact: true }).then((v) => { if (v === 'go') edSheet(); });
}
// 托管服务到期 / 停用（路由器上也挡住了，只能看状态、输续期码）
var SVC_POP = false;
function svcOffPop(msg) {
	if (SVC_POP) return;
	SVC_POP = true;
	const exp = /到期/.test(msg || ''), hub = store.get('rp_hub') || '';
	const body = String(msg || '').replace(/^托管服务(到期|停用)了[，：]?/, '').replace(/^这台路由器的托管服务停用了[，：]?/, '');
	modal(`<h3>${exp ? '托管服务到期了' : '托管服务停用了'}</h3><p class="muted" style="margin:6px 0 0;line-height:1.6;text-wrap:pretty">${esc(body)}</p>
		${exp ? `<input class="input" data-code placeholder="续期码" autocapitalize="characters" spellcheck="false" style="margin-top:12px"><div class="formerr hidden" data-err></div>
		<div class="btngrid" style="margin:12px 0 0">${hub ? `<a class="btn" href="${esc(hub + '/app')}" target="_blank" rel="noopener">去官网续期</a>` : '<button class="btn" data-again>我已经续期了</button>'}<button class="btn primary" data-renew>输入续期码</button></div>
		${hub ? '<button class="btn" data-again style="width:100%;margin-top:8px">我已经续期了</button>' : ''}` : '<div class="btngrid" style="margin:12px 0 0"><button class="btn primary" data-again>再试一次</button></div>'}`, (m, close) => {
		m.dataset.lock = '1';
		const err = (t) => { const e = m.querySelector('[data-err]'); if (e) { e.textContent = t; e.classList.toggle('hidden', !t); } else if (t) toast(t, true); };
		const again = async () => { try { const s = await P('svc_info', { force: true }); if (!s.off) { close(null); SVC_POP = false; location.reload(); } else err('官网那边还没续上：续期申请通过后再点'); } catch (e) { err(e.message); } };
		m.querySelectorAll('[data-again]').forEach((b) => (b.onclick = () => busy(b, again, '核对中')));
		const rb = m.querySelector('[data-renew]');
		if (rb) rb.onclick = () => busy(rb, async () => {
			const code = m.querySelector('[data-code]').value.trim();
			if (!code) return err('输一下续期码');
			try { const r = await P('svc_renew', { code }); toast('已续期 ' + r.days + ' 天'); close(null); SVC_POP = false; location.reload(); } catch (e) { err(e.message); }
		}, '核对中');
	}, { compact: true });
}

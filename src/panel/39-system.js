/* =====================================================================
   设备 / 连接 / 系统（沿用）
   ===================================================================== */
let devices = [], blk = { entries: [] };
const isBlack = (d) => blk.entries.some((e) => (d.mac && e.mac === d.mac) || (!e.mac && e.ip === d.ip) || (e.ip === d.ip && d.mac && e.mac === d.mac));
/* 6.0 第 84 项：设备图标。用户自己选的优先；没选的按名字认，再按厂商（MAC 前 3 段），手机默认的随机 MAC 当手机，都认不出用通用图标 */
const DV_KIND = {
	phone: ['手机', '#0a84ff', '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>'],
	tablet: ['平板', '#5e5ce6', '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M11 18h2"/>'],
	laptop: ['笔记本', '#30b0c7', '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18"/>'],
	pc: ['电脑', '#5856d6', '<rect x="3.5" y="4" width="17" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>'],
	tv: ['电视 / 盒子', '#af52de', '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M9 2.5l3 2.5 3-2.5"/>'],
	console: ['游戏机', '#ff2d55', '<path d="M7 8h10a4 4 0 0 1 4 4.5l-.6 3.5a2.4 2.4 0 0 1-4.1 1.2L14.5 15h-5l-1.8 2.2a2.4 2.4 0 0 1-4.1-1.2L3 12.5A4 4 0 0 1 7 8z"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01"/>'],
	watch: ['手表 / 手环', '#ff9500', '<rect x="6.5" y="7" width="11" height="10" rx="3"/><path d="M9 7l.5-4h5l.5 4M9 17l.5 4h5l.5-4"/>'],
	speaker: ['音箱', '#34c759', '<rect x="6" y="3" width="12" height="18" rx="3"/><circle cx="12" cy="14" r="3"/><path d="M12 7.5h.01"/>'],
	camera: ['摄像头', '#ff3b30', '<circle cx="12" cy="10" r="6"/><circle cx="12" cy="10" r="2"/><path d="M8 20h8M12 16v4"/>'],
	printer: ['打印机', '#a2845e', '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>'],
	router: ['路由器 / 中继', '#00c7be', '<rect x="3.5" y="13" width="17" height="7" rx="2"/><path d="M7.5 16.5h.01M11 16.5h.01M8 13l-2-6M16 13l2-6"/>'],
	iot: ['智能家居', '#ff9f0a', '<path d="M4 11l8-7 8 7v9H4z"/><path d="M12 11.5v3M10 13a2.8 2.8 0 1 0 4 0"/>'],
	other: ['其他', '#8e8e93', '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>']
};
const DV_RE = [
	['tablet', /ipad|matepad|mipad|xiaomi-?pad|redmi-?pad|galaxy-?tab|\btab\b|平板|kindle|honorpad|lenovo-?tab/],
	['watch', /watch|手表|手环|\bband\b/],
	['phone', /iphone|android|galaxy|redmi|huawei|honor|oppo|vivo|oneplus|realme|pixel|iqoo|meizu|nokia|手机|phone|^mi-?\d|xiaomi-?\d|mate-?\d|nova|^p\d0/],
	['laptop', /macbook|laptop|notebook|thinkpad|笔记本|surface|matebook|xiaoxin|legion|zenbook|vivobook|ideapad|^laptop-/],
	['pc', /desktop|^pc$|-pc$|^pc-|imac|mac-?mini|mac-?studio|台式|电脑|workstation|\bnas\b|synology|diskstation|raspberry|truenas|unraid|pve|esxi/],
	['tv', /\btv\b|电视|mitv|tv-?box|盒子|appletv|apple-?tv|chromecast|fire-?tv|shield|投影|projector|bravia|roku/],
	['console', /ps[345]\b|playstation|xbox|nintendo|switch-?\w*nintendo|steam-?deck/],
	['speaker', /speaker|音箱|homepod|echo|xiaoai|小爱|天猫精灵|tmall-?genie|sonos|nest-?(mini|hub|audio)/],
	['camera', /camera|\bcam\b|摄像|\bipc\b|ezviz|萤石|imou|乐橙|doorbell|门铃|hikvision|dahua/],
	['printer', /print|打印|epson|canon|brother|laserjet|deskjet|officejet/],
	['router', /router|openwrt|immortalwrt|\bmesh\b|tp-?link|asus-?rt|netgear|中继|repeater|^ap-|-ap$/],
	['iot', /^esp|tuya|涂鸦|yeelight|插座|plug|\blamp\b|\bbulb\b|灯|sensor|空调|aircon|vacuum|扫地|roborock|dreame|purifier|净化|midea|美的|haier|海尔|gree|格力|chuangmi|lumi|aqara|zhimi|xiaomi-?(plug|light|fan)|\biot\b|ewelink|sonoff|shelly/]
];
const DV_OUI = { iot: '18fe34 5ccf7f 240ac4 30aea4 a4cf12 84f3eb ecfabc 3c71bf bcddc2 c44f33 2462ab 7c9ebd 083af2 94b97e cc50e3 483fda 349454 e8db84 98cdac 2cf432 600194 dc4f22 68c63a a020a6 d8bfc0 8caab5', pc: 'b827eb dca632 e45f01 d83add 2ccf67', console: '98b6e9 7cbb8a 0403d6 e84ece 582f40 00d9d1 f8461c 709e29 bc60a7 280dfc', camera: '4419b6 c056e3 bcad28 4cbd8f' };
function devKind(d) {
	if (d.icon && DV_KIND[d.icon]) return d.icon;
	const n = String((d.renamed ? d.name + ' ' : '') + (d.orig || d.name || '')).toLowerCase();
	if (n.trim()) for (const [k, re] of DV_RE) if (re.test(n)) return k;
	const mac = String(d.mac || '').toLowerCase(), oui = mac.replace(/:/g, '').slice(0, 6);
	if (oui) for (const k in DV_OUI) if (DV_OUI[k].includes(oui)) return k;
	// 手机、平板连 Wi-Fi 默认用随机 MAC（第一段第二位是 2、6、a、e）
	if (/^.[26ae]/.test(mac)) return 'phone';
	return 'other';
}
const dvSvg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DV_KIND[k][2]}</svg>`;
// 设备照片：列表里只有版本号（img），图按需取一次，存在内存里
const DVIMG = {};
const dvTile = (d, k, btn) => { const im = d.mac && d.img && DVIMG[d.mac] && DVIMG[d.mac].v === d.img ? DVIMG[d.mac].u : '';
	const st = `--c:${DV_KIND[k][1]}${im ? `;background-image:url('${im}')` : ''}`;
	return btn ? `<button class="dvic${im ? ' img' : ''}" data-icon style="${st}" aria-label="换图标（现在是${im ? '照片' : DV_KIND[k][0]}）">${im ? '' : dvSvg(k)}</button>` : `<span class="dvic${im ? ' img' : ''}" style="${st}">${im ? '' : dvSvg(k)}</span>`; };
async function dvImgLoad() {
	const need = devices.filter((d) => d.mac && d.img && !(DVIMG[d.mac] && DVIMG[d.mac].v === d.img));
	if (!need.length) return false;
	const r = await P('dev_imgs', { macs: need.map((d) => d.mac) });
	for (const d of need) { const u = r.imgs && r.imgs[d.mac]; if (u && AV_RE.test(u)) DVIMG[d.mac] = { v: d.img, u }; }
	return true;
}
const DV_PEN = '<svg class="dvpen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
const devEdit = (d) => !!d.mac && canPerm('parent');
// 设备卡片（6.0 第 84、88 项）：图标点一下换、名字点一下改；卡片上只留常用的按钮，其余在「更多」里
const devCard = (d, i, attr) => { const pz = attr === 'data-i' && d.mac ? PZ.devs[d.mac] : null, k = devKind(d), ed = attr === 'data-i' && devEdit(d), bl = isBlack(d);
	const nm = esc(d.name || '未命名设备');
	return `<article class="card dvcard${d.online ? '' : ' off'}" ${attr}="${i}">
	<div class="dvtop">${dvTile(d, k, ed)}
		<div class="dvmain">${ed ? `<button class="dvname" data-ren aria-label="改名字：${nm}"><span class="ell">${nm}</span>${DV_PEN}</button>` : `<b class="dvname ell">${nm}</b>`}
			<div class="sub dvaddr"><span>${esc(d.ip)}</span>${d.mac ? `<span>${esc(d.mac)}</span>` : ''}</div>${d.renamed && d.orig && d.orig !== d.name ? `<div class="sub ell" style="font-size:12px">原名：${esc(d.orig)}</div>` : ''}${d.online && d.since ? `<div class="sub" style="font-size:12px">已在线 ${esc(dur(Date.now() / 1000 - d.since))}</div>` : ''}</div>
		<span class="pill ${pz && pz.on ? 'warnc' : bl ? 'red' : d.online ? 'good' : ''}">${pz && pz.on ? '已暂停' : bl ? '不走代理' : d.online ? '在线' : '离线'}</span></div>
	${pz ? `<div class="pzline">${pzDesc(pz)}</div>` : ''}
	${d.stats ? `<div class="actions" style="margin-top:10px"><span class="pill">${d.stats.conns} 个连接</span>${d.stats.proxied ? `<span class="pill blue">${d.stats.proxied} 个走代理</span>` : ''}<span class="pill">↓ ${B(d.stats.dl)}</span><span class="pill">↑ ${B(d.stats.ul)}</span></div>` : ''}
	<div class="rowbtns">${attr === 'data-i'
		? `${d.mac ? `<button class="btn sm ${pz && pz.on ? 'good' : ''}" data-pause>${pz && pz.on ? '恢复 / 设置' : '暂停上网'}</button>` : ''}<button class="btn sm" data-more>更多</button>`
		: `${bl ? '<button class="btn sm good" data-unblack>恢复走代理</button>' : '<button class="btn sm" data-black>不走代理</button>'}<button class="btn sm" data-conns>看连接</button>`}</div>
</article>`; };
async function loadDev() {
	const [b, pz, ow, rl] = await Promise.all([P('black_state'), P('pause_list').catch(() => null), P('dev_own').catch(() => null), P('rl_get').catch(() => null)]);
	blk = b;
	if (rl && rl.devs) DRL = rl;
	if (pz) PZ = pz;
	OWN.d = ow;
	devices = blk.devices || [];
	renderPz(); ownRender();
	setStatus(true, '在线');
	const online = devices.filter((d) => d.online).length, off = devices.length - online;
	$('dvOnline').textContent = online + ' 台在线';
	$('dvCount').textContent = devices.length + ' 台';
	const cl = $('dvClear'); if (cl) cl.classList.toggle('hidden', !off || !canPerm('parent'));
	$('dvScan').classList.toggle('hidden', !canPerm('parent') || !!blk.own); // 6.0 第 26 项：只管自己设备的家人不扫
	if (!devices.length) { $('dvList').innerHTML = `<div class="card empty">${blk.own ? '还没有你名下的设备：点「认领设备」' : '没有发现设备'}</div>`; return; }
	$('dvList').innerHTML = devices.map((d, i) => devCard(d, i, 'data-i')).join('');
	const ds = devices;
	dvImgLoad().then((ch) => { if (ch && ds === devices) $('dvList').innerHTML = devices.map((d, i) => devCard(d, i, 'data-i')).join(''); }).catch(() => {});
}
$('dvList').addEventListener('click', (e) => {
	const a = e.target.closest('[data-i]'); if (!a) return;
	if (e.target.closest('.dvin')) return;
	const d = devices[+a.dataset.i];
	if (e.target.closest('[data-pause]')) return pauseSheet(d);
	if (e.target.closest('[data-ren]')) return devRenameInline(a, d);
	if (e.target.closest('[data-icon]')) return devIconSheet(d);
	if (e.target.closest('[data-more]')) return devMore(d);
	$('cnFilter').value = d.ip; go('conn');
});
$('dvClear') && $('dvClear').addEventListener('click', (e) => devClearOff(e.currentTarget));
// 6.0 第 26 项：深度扫描，找出手动设了 IP、不走 DHCP 的设备（点了才扫）
$('dvScan').addEventListener('click', (e) => busy(e.currentTarget, async () => {
	const r = await P('lan_scan', {}, 90000), n = (r.fresh || []).length;
	toast((n ? `扫到 ${n} 台新设备` : '没有新设备') + (r.part ? `（只扫了 ${r.range}）` : ''));
	await loadDev();
}, '扫描中'));

// 名字点一下就在卡片上改（按 MAC 记，换 IP、路由器重启都还在）；回车或点别处保存，Esc 不改；留空就是改回原来的名字
function devRenameInline(card, d) {
	const nb = card.querySelector('[data-ren]'); if (!nb || card.querySelector('.dvin')) return;
	const inp = document.createElement('input');
	inp.className = 'input dvin'; inp.value = d.renamed ? d.name || '' : ''; inp.maxLength = 40;
	inp.placeholder = d.orig ? '原名：' + d.orig : '比如：客厅电视'; inp.setAttribute('aria-label', '设备名字');
	inp.autocapitalize = 'off'; inp.spellcheck = false; inp.enterKeyHint = 'done';
	nb.replaceWith(inp); inp.focus(); inp.select();
	let done = false;
	const back = () => { if (inp.isConnected) inp.replaceWith(nb); };
	const save = async () => {
		if (done) return; done = true;
		const v = inp.value.trim(), old = d.renamed ? d.name || '' : '';
		if (v === old) return back();
		if (v.length > 20) { toast('名字太长了，20 个字以内', true); done = false; inp.focus(); return; }
		inp.disabled = true;
		try {
			await P('dev_rename', { mac: d.mac, name: v });
			toast(v ? '已改名：' + v : '已改回原来的名字');
			loadDev().catch(() => {});
		} catch (e) { toast(e.message, true); back(); }
	};
	inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Escape') { done = true; back(); } });
	inp.addEventListener('blur', () => setTimeout(save, 0));
}
// 「更多」里的改名字（键盘不好点到卡片时也能用）
async function devRename(d) {
	const v = await promptBox('改名字', d.orig ? '原名：' + d.orig + '（留空就是改回原名）' : '比如：客厅电视（留空就是改回原名）', d.renamed ? d.name || '' : '');
	if (v === false || v == null) return;
	if (v.length > 20) return toast('名字太长了，20 个字以内', true);
	try {
		await P('dev_rename', { mac: d.mac, name: v });
		toast(v ? '已改名：' + v : '已改回原来的名字');
		loadDev().catch(() => {});
	} catch (e) { toast(e.message, true); }
}
/* 6.0 第 48 项：iPhone 的 HEIC / HEIF 照片。iPhone 上的 Safari 选照片时会自动转成 JPG；在安卓、电脑上选从 iPhone 传过来的 .heic，
   浏览器打不开，这时才去下载转换工具（heic2any，约 1.3 MB，只在要用时下一次），转成 JPG 再照常压缩。
   工具从公共 CDN 拿，带完整性校验（SRI）：文件被改过一个字节浏览器都不会运行 */
const HEIC_LIB = ['https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js', 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js', 'https://unpkg.com/heic2any@0.0.4/dist/heic2any.min.js'];
const HEIC_SRI = 'sha384-OTofQ0MEeiSgh62havBcemCIK0gqj809wX6UA0uPISNMRnR6NZyCdGzX3SbLrgwL';
let heicLib = null;
const heicLoad = () => heicLib || (heicLib = (async () => {
	for (const src of HEIC_LIB) {
		if (window.heic2any) break;
		await new Promise((ok) => { const s = document.createElement('script'); s.src = src; s.integrity = HEIC_SRI; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = () => { s.remove(); ok(); }; document.head.appendChild(s); });
	}
	if (!window.heic2any) { heicLib = null; throw new Error('HEIC 照片要先下载转换工具，现在下不下来。在 iPhone 上直接选这张照片，或者换成截图、JPG 再试'); }
	return window.heic2any;
})());
// 是不是 HEIC / HEIF：看类型、扩展名，再看文件头（有的浏览器给的类型是空的）
async function isHeic(f) {
	if (/image\/hei[cf]/i.test(f.type || '') || /\.hei[cf]$/i.test(f.name || '')) return true;
	try { const b = new Uint8Array(await f.slice(4, 12).arrayBuffer()); return String.fromCharCode(...b).startsWith('ftyp') && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(String.fromCharCode(...b.slice(4, 8))); } catch (e) { return false; }
}
// 打开一张图片：浏览器能直接打开就直接用；HEIC 打不开就先转成 JPG。返回 { img, done }，用完调 done()
async function imgOpen(f, bad) {
	const load = (blob) => new Promise((ok, no) => { const url = URL.createObjectURL(blob), i = new Image(); i.onload = () => ok({ img: i, done: () => URL.revokeObjectURL(url) }); i.onerror = () => { URL.revokeObjectURL(url); no(new Error(bad || '这张图片打不开，换一张试试')); }; i.src = url; });
	try { return await load(f); } catch (e) {
		if (!(await isHeic(f))) throw e;
		const h = await heicLoad();
		let out;
		try { out = await h({ blob: f, toType: 'image/jpeg', quality: 0.9 }); } catch (x) { throw new Error('这张 HEIC 照片转换不了，换一张试试'); }
		return load(Array.isArray(out) ? out[0] : out);
	}
}
const imgFile = (f) => f && (/^image\//.test(f.type || 'image/') || /\.hei[cf]$/i.test(f.name || ''));
// 选图标：内置的十几种，或者从相册选一张照片（裁成方形小图再传，不到 40 KB）
async function devPhoto(f) {
	const { img, done } = await imgOpen(f);
	try {
		const c = document.createElement('canvas'), n = 128, sz = Math.min(img.naturalWidth, img.naturalHeight);
		c.width = c.height = n;
		c.getContext('2d').drawImage(img, (img.naturalWidth - sz) / 2, (img.naturalHeight - sz) / 2, sz, sz, 0, 0, n, n);
		for (const [t, q] of [['image/webp', 0.82], ['image/jpeg', 0.82], ['image/jpeg', 0.6]]) { const u = c.toDataURL(t, q); if (u.startsWith('data:' + t) && u.length < 40000) return u; }
		throw new Error('图片太大了，换一张试试');
	} finally { done(); }
}
function devIconSheet(d) {
	const cur = d.img ? '' : d.icon || '', auto = devKind({ ...d, icon: null }), hasImg = !!d.img;
	modal(`<div class="sheethead"><h3>换图标</h3><button class="btn sm" data-v="close">关闭</button></div>
		<p class="muted" style="margin:0 0 12px;font-size:13px">${esc(d.name || d.ip)}</p>
		<div class="mgrp"><div class="mlist"><button class="mact" data-photo><i>${mIc('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5L6 19"/>')}</i><span><b>${hasImg ? '换一张照片' : '用相册里的照片'}</b></span></button>${hasImg ? `<button class="mact danger" data-k="${esc(d.icon || '')}"><i>${mIc('<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>')}</i><span><b>不用照片</b></span></button>` : ''}</div></div>
		<div class="mgrp"><div class="mgt">内置图标</div><div class="dvgrid">${Object.keys(DV_KIND).map((k) => `<button class="dvpick${cur === k ? ' on' : ''}" data-k="${k}" aria-pressed="${cur === k}"><span class="dvic" style="--c:${DV_KIND[k][1]}">${dvSvg(k)}</span><span>${DV_KIND[k][0]}</span></button>`).join('')}</div>
		<button class="btn${cur || hasImg ? '' : ' on'}" data-k="" style="width:100%;margin-top:12px">自动识别（现在认成「${DV_KIND[auto][0]}」）</button></div>`,
	(m, close) => m.querySelector('.modalbox').addEventListener('click', async (e) => {
		if (e.target.closest('[data-photo]')) {
			const f = await pickFile('image/*,.heic,.heif'); if (!f) return;
			return busy(null, async () => { const u = await devPhoto(f); const r = await P('dev_rename', { mac: d.mac, img: u }, 30000); DVIMG[d.mac] = { v: r.img, u }; close(); toast('照片换好了'); await loadDev(); });
		}
		const b = e.target.closest('[data-k]'); if (!b) return;
		const k = b.dataset.k; if (k === cur && !hasImg) return close();
		try { await P('dev_rename', { mac: d.mac, icon: k }); close(); toast(hasImg && k === (d.icon || '') ? '不用照片了' : k ? '图标换成了「' + DV_KIND[k][0] + '」' : '图标改回自动识别'); loadDev().catch(() => {}); }
		catch (er) { toast(er.message, true); }
	}));
}
// 「更多」：这台设备能做的事都在这里
function devMore(d) {
	const pz = d.mac ? PZ.devs[d.mac] : null, bl = isBlack(d), ed = devEdit(d), par = canPerm('parent'), k = devKind(d);
	moreSheet({ t: d.name || '未命名设备', sub: d.ip + ' · ' + (d.online ? '在线' : '离线'), ic: dvTile(d, k) }, [
		{ items: [{ v: 'conns', ic: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>', t: '看连接' }] },
		{ t: '名字和图标', items: [ed && { v: 'ren', ic: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', t: '改名字', sub: d.renamed && d.orig ? '原名：' + d.orig : '' },
			ed && { v: 'icon', ic: dvSvg(k), t: '换图标' }] },
		{ t: '上网控制', items: [d.mac && par && { v: 'pause', ic: '<circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/>', t: pz && pz.on ? '恢复上网 / 改暂停设置' : '暂停上网' },
			d.mac && par && { v: 'plan', ic: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2.5h6"/>', t: '上网计划', sub: pz && pz.plan ? plState(pz) || pz.plan.slots.map(plSlot).join('、') : '' },
			d.mac && par && { v: 'rl', ic: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M12 13l3.5-3.5"/>', t: '限速', sub: rlSub(d.mac) },
			par && (bl ? { v: 'unblack', ic: '<path d="M4 11l16-7-7 16-2-7z"/>', t: '恢复走代理' } : { v: 'black', ic: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>', t: '不走代理' })] },
		{ items: [d.mac && ownCan() && { v: 'owner', ic: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>', t: '归谁', sub: ownWho(d.mac) }] },
		{ items: [!d.online && par && { v: 'forget', ic: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>', t: '从列表删除', danger: true }] }
	]).then((v) => {
		if (v === 'conns') { $('cnFilter').value = d.ip; go('conn'); }
		else if (v === 'ren') devRename(d);
		else if (v === 'icon') devIconSheet(d);
		else if (v === 'pause') pauseSheet(d);
		else if (v === 'plan') planSheet(d);
		else if (v === 'rl') rlSheet(d);
		else if (v === 'owner') ownPick(d);
		else if (v === 'black') blackToggle(d, true, null);
		else if (v === 'unblack') blackToggle(d, false, null);
		else if (v === 'forget') devForget(d);
	});
}
// 删前说清楚会一起删掉的设置
function devSets(d) {
	const out = [], pz = d.mac ? PZ.devs[d.mac] : null;
	if (pz && pz.until) out.push('暂停上网');
	if (pz && (pz.sched || []).length) out.push('每天定时断网（' + pz.sched.map((s) => s.from + '–' + s.to).join('、') + '）');
	if (pz && pz.plan) out.push('上网计划（' + pz.plan.slots.map(plSlot).join('、') + '）');
	if (isBlack(d)) out.push('「不走代理」');
	if (d.mac && (DRL.devs || {})[d.mac]) out.push('限速（' + rlSub(d.mac) + '）');
	if (d.renamed) out.push('改过的名字「' + d.name + '」');
	if (d.img) out.push('设的照片');
	else if (d.icon) out.push('选的图标');
	return out;
}
async function devForget(d) {
	if (d.online) return toast('在线的设备不能删', true);
	const sets = devSets(d), nm = d.name || d.ip;
	const txt = (sets.length ? '它的这些设置会一起删掉：\n• ' + sets.join('\n• ') + '\n\n' : '') + '以后这台设备再连上，会作为新设备重新出现' + (sets.length ? '，上面的设置要重新设。' : '。');
	if (!(await confirmBox('从列表删除「' + nm + '」？', txt, '删除', true))) return;
	await busy(null, async () => {
		const r = await P('dev_forget', { items: [{ mac: d.mac || undefined, ip: d.ip }] });
		toast(r.n ? '已删除「' + nm + '」' : r.skip && r.skip.online ? '它刚刚又连上了，没有删' : '列表里已经没有它了');
		await loadDev();
	});
}
// 一键清除离线设备：有设置（暂停、定时断网、不走代理、改过名字或图标）的不删，要删请单独删
async function devClearOff(btn) {
	const off = devices.filter((d) => !d.online), plain = off.filter((d) => !devSets(d).length), keep = off.length - plain.length;
	if (!off.length) return toast('没有离线设备');
	if (!plain.length) return toast(`${keep} 台离线设备都有设置（暂停、限速、不走代理或改过名字），要删请点它的「更多」单独删`);
	const txt = `会从列表删掉 ${plain.length} 台离线设备。` + (keep ? `\n有设置的 ${keep} 台不删（暂停、定时断网、限速、不走代理或改过名字），要删请单独删。` : '') + '\n\n这些设备以后再连上，会重新出现。';
	if (!(await confirmBox('清除离线设备', txt, `删除 ${plain.length} 台`, true))) return;
	await busy(btn, async () => {
		const r = await P('dev_forget', { items: plain.map((d) => ({ mac: d.mac || undefined, ip: d.ip })), only_plain: true });
		toast(`已删除 ${r.n} 台` + (r.skip && r.skip.online ? `，${r.skip.online} 台刚刚又连上了没删` : ''));
		await loadDev();
	}, false);
}

/* ---------- 流量统计 ---------- */
const TF = { r: 'today', sel: null, d: null };
async function loadTraf() { TF.d = await P('traffic'); setStatus(true, '在线'); renderTraf(); }
const dshift = (day, n) => { const x = new Date(day + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const tfSum = (list) => list.reduce((s, a) => [s[0] + a[0], s[1] + a[1], s[2] + a[2], s[3] + a[3]], [0, 0, 0, 0]);
const tfTot = (a) => a[0] + a[1] + a[2] + a[3];
function tfName(k) {
	if (k === 'router') return '路由器自己';
	if (k === 'other') return '已断开的连接';
	const n = TF.d.names && TF.d.names[k];
	return n || (/^[0-9a-f:]{17}$/.test(k) ? '未知设备 ' + k.slice(-5) : k);
}
function tfDays(r, today) {
	if (r === 'today') return [today];
	if (r === 'yday') return [dshift(today, -1)];
	if (r === '7') return [0, 1, 2, 3, 4, 5, 6].map((i) => dshift(today, -i));
	const pre = r === 'month' ? today.slice(0, 7) : dshift(today.slice(0, 8) + '01', -1).slice(0, 7);
	return Object.keys(TF.d.days || {}).filter((d) => d.startsWith(pre));
}
function renderTraf() {
	const box = $('tfBody'), d = TF.d;
	if (!box || !d) return;
	const today = d.today || new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
	const all = d.days || {};
	const tday = tfSum(Object.values(all[today] || {}));
	$('tfPill').textContent = '今天 ' + B(tfTot(tday));
	if (!Object.keys(all).length) { box.innerHTML = '<section class="card empty">统计刚开始，过一两分钟再来看。</section>'; return; }
	const days = tfDays(TF.r, today);
	const per = {};
	for (const day of days) for (const [k, a] of Object.entries(all[day] || {})) per[k] = tfSum([per[k] || [0, 0, 0, 0], a]);
	const tot = tfSum(Object.values(per)), T = tfTot(tot), px = tot[0] + tot[1], dr = tot[2] + tot[3];
	const pct = (x) => (T ? Math.round((x * 100) / T) : 0);
	// 最近 14 天（选中设备时只看它）
	const sel = TF.sel && per[TF.sel] !== undefined ? TF.sel : TF.sel;
	const col = [...Array(14)].map((_, i) => { const day = dshift(today, i - 13), a = sel ? ((all[day] || {})[sel] || [0, 0, 0, 0]) : tfSum(Object.values(all[day] || {})); return { day, p: a[0] + a[1], d: a[2] + a[3] }; });
	const mx = Math.max(1, ...col.map((c) => c.p + c.d));
	const inR = new Set(days);
	const rows = Object.entries(per).filter(([, a]) => tfTot(a) > 0).sort((a, b) => tfTot(b[1]) - tfTot(a[1]));
	const top = rows.length ? tfTot(rows[0][1]) : 1;
	const label = { today: '今天', yday: '昨天', 7: '最近 7 天', month: '本月', last: '上个月' }[TF.r];
	box.innerHTML = `<div class="sectitle"><b>${label}</b>${d.at ? `<span class="pill">${hm(d.at * 1000)} 更新</span>` : ''}</div>
	<section class="card">
		<div class="muted" style="font-size:13px">${label}一共</div>
		<div class="tfbig">${B(T)}</div>
		<div class="muted" style="font-size:13px">↓ 下载 ${B(tot[1] + tot[3])} · ↑ 上传 ${B(tot[0] + tot[2])}</div>
		<div class="tfsplit"><i style="width:${pct(px)}%;background:var(--brand)"></i><i style="width:${T ? 100 - pct(px) : 0}%;background:var(--ok)"></i></div>
		<div class="tfleg"><span><i style="background:var(--brand)"></i>走代理 ${B(px)}（${pct(px)}%）</span><span><i style="background:var(--ok)"></i>直连 ${B(dr)}（${T ? 100 - pct(px) : 0}%）</span></div>
	</section>
	<div class="sectitle"><b>${sel ? '「' + esc(tfName(sel)) + '」' : ''}最近 14 天</b>${sel ? '<button class="btn sm" data-tfall>看全部</button>' : `<span class="pill">最高 ${B(mx)}</span>`}</div>
	<section class="card"><div class="tfchart">${col.map((c) => `<div class="tfcol ${inR.has(c.day) ? 'in' : ''}" title="${c.day} ${B(c.p + c.d)}"><i style="height:${((c.p * 100) / mx).toFixed(1)}%;background:var(--brand)"></i><i style="height:${((c.d * 100) / mx).toFixed(1)}%;background:var(--ok)"></i></div>`).join('')}</div>
		<div class="tfx">${col.map((c) => `<span class="${c.day === today ? 'now' : ''}">${+c.day.slice(8)}</span>`).join('')}</div></section>
	<div class="sectitle"><b>按设备</b><span class="pill">${rows.length} 台</span></div>
	<section class="card list">${rows.length ? rows.map(([k, a]) => `<button class="tfrow ${k === TF.sel ? 'on' : ''}" data-tfk="${esc(k)}">
		<span class="tfn"><b class="ell">${esc(tfName(k))}</b><b>${B(tfTot(a))}</b></span>
		<span class="tfbar"><i style="width:${((a[0] + a[1]) * 100 / top).toFixed(1)}%;background:var(--brand)"></i><i style="width:${((a[2] + a[3]) * 100 / top).toFixed(1)}%;background:var(--ok)"></i></span>
		<span class="muted tfsub">代理 ${B(a[0] + a[1])} · 直连 ${B(a[2] + a[3])} · ↓ ${B(a[1] + a[3])} ↑ ${B(a[0] + a[2])}</span></button>`).join('') : '<div class="empty">这段时间没有流量</div>'}</section>
	<p class="muted" style="font-size:12.5px;margin:8px 4px 0;line-height:1.6">点设备看它最近 14 天的用量。统计从 OpenClash 的连接算出来，OpenClash 没运行时的流量算不到。</p>`;
}
$('tfRange').addEventListener('click', (e) => {
	const b = e.target.closest('[data-r]'); if (!b) return;
	TF.r = b.dataset.r;
	$$('#tfRange .chip').forEach((x) => x.classList.toggle('on', x === b));
	renderTraf();
});
$('tfBody').addEventListener('click', (e) => {
	if (e.target.closest('[data-tfall]')) { TF.sel = null; return renderTraf(); }
	const r = e.target.closest('[data-tfk]'); if (!r) return;
	TF.sel = TF.sel === r.dataset.tfk ? null : r.dataset.tfk;
	renderTraf();
});

/* ---------- 网速测试 ---------- */
const ST = { d: null, run: '' };
async function loadSpeed() { ST.d = await P('speed_last'); setStatus(true, '在线'); renderSpeed(); }
const stMult = (via) => { const m = /(\d+(?:\.\d+)?)\s*x\s*$/i.exec(via || ''); return m ? +m[1] : 1; };
const stVia = (via) => { const a = String(via || '').split(' → '); return a.length > 2 ? a.slice(1).join(' → ') : a.join(' → '); };
const stNum = (v) => (v == null ? '—' : v >= 100 ? Math.round(v) : v);
function stCard(kind) {
	const r = ST.d && ST.d[kind], px = kind === 'proxy', running = ST.run === kind;
	const head = `<div class="sthead"><div><b>${px ? '走代理' : '宽带直连'}</b><span class="muted">${px ? '经过当前节点，测下载、上传和延迟' : '不经过节点，测家里宽带的下载和延迟'}</span></div>
		<button class="btn sm blue" data-st="${kind}" ${ST.run ? 'disabled' : ''}>${running ? '<span class="spin">↻</span> 测速中' : r ? '再测一次' : '开始测速'}</button></div>`;
	if (running) return `<section class="card">${head}<div class="empty" style="padding:18px 0 10px">正在测速，大约 15 秒…</div></section>`;
	if (!r) return `<section class="card">${head}<div class="empty" style="padding:14px 0 8px">还没测过</div></section>`;
	const mult = px ? stMult(r.via) : 1;
	return `<section class="card">${head}
		<div class="stnums ${px ? '' : 'two'}">
			<div><span>↓ 下载</span><b>${stNum(r.down)}<small> Mbps</small></b></div>
			${px ? `<div><span>↑ 上传</span><b>${stNum(r.up)}<small> Mbps</small></b></div>` : ''}
			<div><span>延迟</span><b>${r.ping == null ? '—' : r.ping}<small> ms</small></b></div>
		</div>
		<div class="kv"><span>线路</span><span>${esc(px ? (r.via ? stVia(r.via) : '没认出节点') : '宽带直连')}</span></div>
		<div class="kv"><span>测速时间</span><span>${r.t ? hm(r.t * 1000) + '（' + ago(new Date(r.t * 1000).toISOString()) + '）' : '—'}</span></div>
		${r.bytes ? `<div class="kv"><span>这次用掉</span><span>${B(r.bytes)}${px && mult !== 1 ? `，按 ${mult}x 倍率约算订阅 ${B(r.bytes * mult)}` : ''}</span></div>` : ''}
	</section>`;
}
function renderSpeed() {
	const box = $('stBody'); if (!box) return;
	const p = ST.d && ST.d.proxy;
	$('stPill').textContent = p ? '代理 ↓ ' + stNum(p.down) + ' Mbps' : '—';
	box.innerHTML = stCard('proxy') + stCard('direct') + '<p class="muted" style="font-size:12.5px;margin:8px 4px 0;line-height:1.6">走代理用 Cloudflare 测速服务器，宽带直连用阿里云、腾讯云镜像。结果是路由器自己测的，手机或电脑隔着 Wi‑Fi 会再慢一些。路由器重启后记录会清空。</p>';
}
$('stBody').addEventListener('click', async (e) => {
	const b = e.target.closest('[data-st]'); if (!b || ST.run) return;
	ST.run = b.dataset.st; renderSpeed();
	try {
		const r = await P('speedtest', { kind: ST.run }, 90000);
		ST.d = Object.assign({}, ST.d, { [r.kind]: r });
		toast(r.down > 0 ? `下载 ${stNum(r.down)} Mbps` : '没测出速度，可能节点不通');
	} catch (err) { handleErr(err); }
	finally { ST.run = ''; renderSpeed(); }
});

/* ---------- 云端备份 ---------- */
const CBK = { d: null };
async function loadBk() {
	try { CBK.d = await P('bk_list', {}, 30000); }
	catch (e) {
		// 精简版没有云端：说明一下，不当成出错
		if (!/设置云端/.test(e.message || '')) throw e;
		CBK.d = null; $('bkNow').disabled = true; $('bkPill').textContent = '未启用';
		$('bkBody').innerHTML = '<div class="notice w" style="margin-top:12px">云端备份是完整版功能，需要先部署 Cloudflare 云端，再在路由器上重新运行安装脚本选完整版。<br>现在也可以在「系统 → 备份 / 升级」里手动下载备份。</div>';
		return;
	}
	$('bkNow').disabled = false;
	setStatus(true, '在线'); renderBk();
	// 后台有任务在做（可能是刚才离开这一页时还没做完的）：过几秒再看一次
	clearTimeout(CBK.t); if (bkBusy(CBK.d.job) && !CBK.wait) CBK.t = setTimeout(() => { if (page === 'cbk') loadBk().catch(() => {}); }, 3000);
}
// 6.0 第 9 项：备份、下载、还原都在路由器后台做（自带加密在慢的路由器上要一两分钟），面板隔几秒看一次进度
const bkBusy = (j) => !!j && (j.state === 'running' || j.state === 'restoring');
const BK_OP = { now: '正在备份', dl: '正在准备下载', restore: '正在准备还原' };
async function bkWait(op, id) {
	CBK.wait = true;
	try {
		for (let i = 0; i < 400; i++) {
			await new Promise((r) => setTimeout(r, 2500));
			let d; try { d = await P('bk_list', {}, 30000); } catch (e) { if (op === 'restore' && i > 2) return { state: 'restoring' }; continue; }
			CBK.d = d; if (page === 'cbk') renderBk();
			const j = d.job;
			if (j && j.op === op && (op === 'now' || j.id === id)) {
				if (j.state === 'done' || j.state === 'restoring') return j;
				if (j.state === 'error') throw new Error(j.msg || '没做成，稍后再试');
				if (j.state === 'stale') throw new Error('路由器上的任务没有做完，再试一次');
			}
		}
		throw new Error('路由器太久没做完，稍后再看');
	} finally { CBK.wait = false; }
}
const bkWhen = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${hm(ms)}`; };
function renderBk() {
	const box = $('bkBody'), d = CBK.d; if (!box || !d) return;
	const list = d.list || [];
	$('bkPill').textContent = `${list.length} / ${d.max || 10} 份`;
	const last = list[0];
	const old = list.some((b) => !b.enc);
	// 6.0 起一律加密：说明用哪种方式加密；后台有任务时说正在做什么
	const j = d.job, jt = bkBusy(j) ? (j.state === 'restoring' ? '正在还原，路由器马上重启' : (j.msg || BK_OP[j.op] || '正在处理') + '…') : '';
	const encBox = `<section class="card" style="margin-bottom:12px;padding-top:8px;padding-bottom:8px"><div class="kv aswon" style="cursor:default;border-bottom:0"><span><b>备份一律加密</b><span class="muted">${d.crypt === 'builtin' ? '在路由器上用面板自带的方式加密再上传（这台路由器没有 openssl，不用另外装东西；路由器慢的话备份、下载要一两分钟）。' : '在路由器上加密再上传。'}密钥只在这台路由器上，云端看不到内容。</span></span><span class="bktag e" style="flex:none;white-space:nowrap">已开启</span></div>${jt ? `<div class="muted" id="bkJob" style="margin-top:8px"><span class="spin">↻</span> ${esc(jt)}</div>` : ''}</section>`;
	box.innerHTML = `${encBox}${old ? '<div class="notice" style="margin-bottom:12px">标着「没加密」的是以前存的备份：下次备份成功后，路由器会把它们自动加密后换掉，日期不变、照样能还原。</div>' : ''}<div class="sectitle"><b>备份列表</b>${last ? `<span class="pill">最近 ${esc(ago(new Date(last.at).toISOString()))}</span>` : ''}</div>
	<section class="card">${list.length ? list.map((b) => `<div class="bkrow" data-bk="${esc(b.id)}">
		<div><b>${bkWhen(b.at)}<span class="bktag ${b.kind === 'auto' ? '' : 'm'}">${b.kind === 'auto' ? '自动' : '手动'}</span>${b.enc ? '<span class="bktag e">已加密</span>' : '<span class="bktag o">没加密</span>'}</b><span class="muted">${B(b.size)} · ${b.files || '—'} 个文件</span></div>
		<div class="actions"><button class="btn sm" data-bkdl>下载</button><button class="btn sm blue" data-bkrs>还原</button><button class="btn sm danger" data-bkrm>删除</button></div></div>`).join('') : '<div class="empty">云端还没有备份，点上面的「立即备份」存第一份。</div>'}</section>
	<p class="muted" style="font-size:12.5px;margin:8px 4px 0;line-height:1.6">${d.auto ? '自动备份已开启（每天 4:07）。' : '自动备份没有开启。'}点「下载」时路由器先解密，下载到手机的是普通备份，格式和 LuCI「系统 → 备份 / 升级」导出的一样，也可以在那里恢复。还原前会先自动备份一份现在的设置。</p>`;
}
$('bkNow').addEventListener('click', (e) => busy(e.currentTarget, async () => {
	await P('bk_now', {}, 30000);
	const j = await bkWait('now');
	toast(j.size ? `已备份到云端（${B(j.size)}）` : '已备份到云端');
	await loadBk();
}, '备份中'));
$('bkBody').addEventListener('click', async (e) => {
	const row = e.target.closest('[data-bk]'); if (!row) return;
	const id = row.dataset.bk, b = (CBK.d.list || []).find((x) => x.id === id); if (!b) return;
	const when = bkWhen(b.at);
	const dl = e.target.closest('[data-bkdl]'), rs = e.target.closest('[data-bkrs]'), rm = e.target.closest('[data-bkrm]');
	if (dl) return busy(dl, async () => {
		let r = await P('bk_dl', { id, name: b.name }, 30000);
		if (r.running) { await bkWait('dl', id); r = await P('bk_dl', { id, name: b.name }, 30000); }
		if (!r.url) throw new Error('没准备好，再点一次下载');
		download(r.url, r.name); toast(`开始下载（${B(r.size)}）`);
	}, false);
	if (rm) {
		if (!(await confirmBox('删除这份备份', `删除「${when}」的云端备份，删了就找不回来了。`, '删除', true))) return;
		return busy(rm, async () => { await P('bk_del', { id }, 30000); toast('已删除'); await loadBk(); }, false);
	}
	if (rs) {
		if (!(await confirmBox('还原到这份备份', `把路由器的全部设置换回「${when}」那时的样子，然后自动重启。\n\n· 还原前会先把现在的设置备份一份到云端\n· 重启大约 1–2 分钟，期间全家断网，面板也连不上\n· 这份备份之后改过的设置会被换掉\n· 面板保持现在的版本，登录密钥、登录着的手机这些钥匙也保持现在的（移除过的手机不会再能登录）`, '还原并重启', true))) return;
		return busy(rs, async () => {
			await P('bk_restore', { id }, 30000);
			await bkWait('restore', id);
			toast('正在还原，路由器马上重启，1–2 分钟后再打开面板');
			setStatus(false, '正在重启');
		}, '准备中');
	}
});

/* ---------- 暂停上网 ---------- */
let PZ = { devs: {}, now: 0 };
const pzFar = (u) => u - Date.now() / 1000 > 300 * 86400;
function pzWhen(u) {
	if (pzFar(u)) return '直到手动恢复';
	const x = new Date(u * 1000), t = new Date(), tm = new Date(t.getTime() + 86400e3);
	const day = x.toDateString() === t.toDateString() ? '' : x.toDateString() === tm.toDateString() ? '明天 ' : (x.getMonth() + 1) + '/' + x.getDate() + ' ';
	return '到 ' + day + hm(u * 1000) + ' 自动恢复';
}
function pzDesc(e) {
	const parts = [];
	if (e.until) parts.push('<strong>暂停中</strong> · ' + pzWhen(e.until));
	if ((e.sched || []).length) parts.push('每天 ' + e.sched.map((s) => s.from + '–' + s.to).join('、') + ' 断网' + (e.on && !e.until ? '（现在就在这个时间里）' : ''));
	if (e.plan && (e.plan.slots || []).length) parts.push('上网计划：' + esc(plState(e) || e.plan.slots.map(plSlot).join('、')));
	return parts.join('<br>');
}
function renderPz() {
	const box = $('pzBox'); if (!box) return;
	const list = Object.entries(PZ.devs || {});
	if (!list.length) { box.innerHTML = ''; return; }
	box.innerHTML = `<div class="sectitle"><b>暂停 / 定时断网</b><span class="pill ${list.some(([, e]) => e.on) ? 'warnc' : ''}">${list.filter(([, e]) => e.on).length} 台暂停中</span></div>
		<section class="card list">${list.map(([mac, e]) => `<div class="file" data-pzm="${esc(mac)}"><div><b>${esc((devices.find((d) => d.mac === mac) || {}).name || e.name || mac)}</b><span class="muted pzl">${pzDesc(e)}</span></div><button class="btn sm ${e.on ? 'good' : ''}" data-pzset>${e.on && e.until ? '恢复' : '设置'}</button></div>`).join('')}</section>`;
}
$('pzBox').addEventListener('click', (e) => {
	const row = e.target.closest('[data-pzm]'); if (!row) return;
	const mac = row.dataset.pzm, ent = PZ.devs[mac] || {};
	const d = devices.find((x) => x.mac === mac) || { mac, name: ent.name, ip: '' };
	if (e.target.closest('[data-pzset]') && ent.on && ent.until && !(ent.sched || []).length) return busy(e.target.closest('button'), async () => { PZ = await P('pause_set', { mac, resume: true }); toast('已恢复上网'); await loadDev(); }, false);
	// 只有上网计划的：打开计划
	if (ent.plan && !ent.until && !(ent.sched || []).length) return planSheet(d);
	pauseSheet(d);
});
// 明天早上 7 点（现在 7 点前就是今天 7 点）
function next7() { const x = new Date(); x.setHours(7, 0, 0, 0); if (x <= new Date()) x.setDate(x.getDate() + 1); return Math.floor(x / 1000); }
// 推送「新设备连上了」里点「暂停它上网」：到设备页弹出暂停设置（没有「家长控制」权限就说明）
async function askPause(mac) {
	if (!/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(mac || '')) return;
	if (!canPerm('parent')) return toast('主账号没有给你开「家长控制」，不能暂停设备上网', true);
	if (page !== 'dev') await go('dev');
	try { await loadDev(); } catch (e) {}
	const d = devices.find((x) => x.mac === mac) || { mac, name: '' };
	pauseSheet({ mac, name: d.name || '' });
}
function pauseSheet(d) {
	if (!d.mac) return toast('这台设备读不到 MAC 地址，没法暂停', true);
	const name = d.name || d.ip || d.mac;
	const html = () => {
		const e = PZ.devs[d.mac] || {}, sched = e.sched || [];
		return `<div class="sheethead"><h3>暂停「${esc(name)}」上网</h3><button class="btn sm" data-v="close">关闭</button></div>
		${e.until ? `<div class="notice" style="margin:0 0 10px;display:flex;justify-content:space-between;align-items:center;gap:10px"><span><b>暂停中</b> · ${pzWhen(e.until)}</span><button class="btn sm good" data-pz="resume">马上恢复</button></div>` : ''}
		${!e.until && e.on ? `<div class="notice w" style="margin:0 0 10px">现在正在每天定时断网的时间里。要现在恢复，删掉下面对应的定时。</div>` : ''}
		<p class="muted" style="margin:0 0 8px;font-size:13px">${e.until ? '改成' : ''}暂停多久（到时间自动恢复）：</p>
		<div class="pzgrid"><button class="btn" data-pz="30">30 分钟</button><button class="btn" data-pz="60">1 小时</button><button class="btn" data-pz="120">2 小时</button><button class="btn" data-pz="am">到早上 7 点</button><button class="btn danger" data-pz="ever" style="grid-column:1/-1">一直暂停，直到我手动恢复</button></div>
		<div class="subhd">每天定时断网</div>
		${sched.length ? sched.map((s, i) => `<div class="kv" style="align-items:center"><span style="color:var(--text);font-weight:600">${esc(s.from)} – ${esc(s.to)}${mins(s.to) <= mins(s.from) ? '<span class="muted" style="font-weight:400">（第二天）</span>' : ''}</span><button class="btn sm" data-pzdel="${i}">删除</button></div>`).join('') : '<p class="muted" style="margin:4px 0 0;font-size:13px">比如每天 23:00 到第二天 07:00 自动断网，适合孩子的平板、游戏机。</p>'}
		<div class="pzadd"><input class="input" type="time" data-from value="23:00"><span class="muted">到</span><input class="input" type="time" data-to value="07:00"><button class="btn blue" data-pz="add">添加</button></div>
		<p class="muted" style="margin:12px 0 0;font-size:12.5px;line-height:1.6">暂停期间这台设备国内外网站都上不了，但 Wi-Fi 还连着；开始暂停时它正在用的连接会马上断开。如果暂停的是你正在用的手机，面板也会打不开（用手机流量还能打开）。</p>`;
	};
	const mins = (t) => { const m = /^(\d+):(\d+)$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : 0; };
	modal(html(), (m) => {
		const set = async (b, args, msg) => {
			PZ = await P('pause_set', { mac: d.mac, name: d.name || undefined, ...args });
			m.querySelector('.modalbox').innerHTML = html();
			toast(msg); renderPz(); loadDev().catch(() => {});
		};
		m.querySelector('.modalbox').addEventListener('click', (ev) => {
			const b = ev.target.closest('[data-pz],[data-pzdel]'); if (!b) return;
			const e = PZ.devs[d.mac] || {}, sched = (e.sched || []).slice();
			const k = b.dataset.pz;
			if (b.dataset.pzdel != null) { sched.splice(+b.dataset.pzdel, 1); return busy(b, () => set(b, { sched }, '已删除这条定时'), false); }
			if (k === 'resume') return busy(b, () => set(b, { resume: true }, '已恢复上网'), false);
			if (k === 'add') {
				const from = m.querySelector('[data-from]').value, to = m.querySelector('[data-to]').value;
				if (!from || !to || from === to) return toast('开始和结束时间不能一样', true);
				if (sched.some((s) => s.from === from && s.to === to)) return toast('已经有这条定时了', true);
				sched.push({ from, to });
				return busy(b, () => set(b, { sched }, `已添加：每天 ${from}–${to} 断网`), false);
			}
			const until = k === 'ever' ? Math.floor(Date.now() / 1000) + 10 * 365 * 86400 : k === 'am' ? next7() : Math.floor(Date.now() / 1000) + +k * 60;
			return busy(b, () => set(b, { until }, '已暂停「' + name + '」上网，' + pzWhen(until)), false);
		});
	});
}

/* ---------- 不走代理的设备（以前叫「拉黑名单」；内部名字 black 不变，已有设置照用） ---------- */
async function blackToggle(d, on, btn) {
	if (on && !(await confirmBox('让「' + (d.name || d.ip) + '」不走代理', `这台设备的所有流量都不走代理，只能用大陆网络：国内网站和 App 正常，海外网站和 App（谷歌、YouTube、Claude 等）会打不开。\n${d.mac ? '会给它固定 IP（' + d.ip + '），防止 IP 变了以后失效。' : '这台设备读不到 MAC 地址，只能按 IP 设置；如果它的 IP 变了需要重新设置。'}\n不需要重启，马上生效。`, '不走代理', true))) return;
	await busy(btn, async () => {
		const r = await P('black_set', { mac: d.mac || undefined, ip: d.ip, name: d.name || undefined, on });
		if (on && r.need_setup) {
			toast('已加入名单，但「不走代理」功能还没启用', true);
			await blackSetup();
		} else toast(on ? `已设为不走代理${r.pinned ? '（已固定 IP ' + r.ip + '）' : ''}` : '已恢复走代理');
		refresh(true);
	}, false);
}
async function blackSetup() {
	if (!(await confirmBox('启用「不走代理」', '第一次使用需要把这条规则加到「优先匹配」自定义规则里，并重启 OpenClash 一次（断网 10–30 秒）。之后添加、恢复都不用再重启。', '启用并重启'))) return;
	await P('black_setup', { restart: true });
	toast('正在重启 OpenClash，完成后立即生效');
	setStatus(false, '重启中'); watchJobs();
}
async function loadBlack() {
	blk = await P('black_state');
	setStatus(true, '在线');
	const box = $('blBody'), devs = blk.devices || [];
	const ok = blk.ready && blk.live && blk.custom_on;
	const others = devs.map((d, i) => [d, i]).filter(([d]) => !isBlack(d));
	box.innerHTML = `<div class="hero"><div class="herohead"><h1>不走代理</h1><span class="pill ${ok ? 'good' : 'warnc'}">${ok ? '已启用' : '未启用'}</span></div>
		<p class="muted" style="margin-bottom:${ok ? 0 : 12}px">这些设备的所有流量都不走代理，只能用大陆网络（国内网站正常，海外网站打不开）。添加、恢复都马上生效，不用重启。想让设备完全上不了网，用「设备」里的「暂停」。</p>
		${ok ? '' : `<div class="notice w" style="margin-bottom:10px">${!blk.custom_on ? '「自定义规则」总开关是关着的，「不走代理」不会生效。' : '「不走代理」还没启用（需要重启 OpenClash 一次）。'}</div><button class="btn primary" data-setup style="width:100%;padding:12px">启用「不走代理」</button>`}</div>
		<div class="sectitle"><b>不走代理的设备</b><span class="pill">${blk.entries.length} 台</span></div>
		<section class="card list">${blk.entries.length ? blk.entries.map((e, i) => `<div class="file" data-e="${i}"><div><b>${esc((devs.find((d) => d.mac && d.mac === e.mac) || {}).name || e.name || e.ip)}</b><span class="muted">${esc(e.ip)}${e.mac ? ' · ' + esc(e.mac) : ' · 按 IP'}${e.at ? ' · ' + ts(e.at) + ' 加入' : ''}</span></div><button class="btn sm good" data-un>解除</button></div>`).join('') : '<div class="empty">还没有设置不走代理的设备</div>'}</section>
		<div class="sectitle"><b>其他设备</b><button class="btn sm" data-manual>按 IP 添加</button></div>
		<section class="grid tasks" data-devs>${others.length ? others.map(([d, i]) => devCard(d, i, 'data-d')).join('') : '<div class="card empty">没有其他设备</div>'}</section>`;
	box.onclick = async (e) => {
		if (e.target.closest('[data-setup]')) return busy(e.target.closest('[data-setup]'), blackSetup, false);
		const un = e.target.closest('[data-un]');
		if (un) { const en = blk.entries[+un.closest('[data-e]').dataset.e]; return blackToggle({ mac: en.mac, ip: en.ip, name: en.name }, false, un); }
		const card = e.target.closest('[data-d]');
		if (card) {
			const d = devs[+card.dataset.d];
			if (e.target.closest('[data-black]')) return blackToggle(d, true, e.target.closest('button'));
			if (e.target.closest('[data-conns]')) { $('cnFilter').value = d.ip; go('conn'); }
			return;
		}
		if (e.target.closest('[data-manual]')) {
			const ip = await promptBox('按 IP 添加', '例如 192.168.1.20');
			if (!ip) return;
			if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return toast('IP 格式不对', true);
			const d = devs.find((x) => x.ip === ip) || { ip };
			blackToggle(d, true, null);
		}
	};
}

/* ---------- 断线记录 ---------- */
const WDK = { sub: '订阅', node: '节点', tunnel: '隧道', wan: '宽带', net: '外网', dns: 'DNS', panel: '面板服务', clash: '代理插件', boot: '开机', reboot: '关机', watchdog: '看门狗', mem: '内存', cloud: '云端', tablet: '平板' };
let wdData = null;
/* 云端监测（Cloudflare）：路由器断线时也能读到，因为 /cloud/ 在隧道之前就被 Cloudflare 接住了 */
let cloud = null, cloudAt = 0, cloudErr = null, cinfo = null;
// 托管版才有「绑定到账号」
const hubBtn = () => {}; // 5.2：「绑定到账号」「托管服务」搬到「我的主页」了
try { cloud = JSON.parse(store.get('rp_cloud') || 'null'); cinfo = JSON.parse(store.get('rp_cinfo') || 'null'); } catch (e) {}
// 精简版没有 Cloudflare 云端：路由器说没配置云端，就不去请求 /cloud/，也不显示云端相关卡片
const noCloud = () => !!cinfo && cinfo.enabled === false;
// 读云端用的钥匙：托管版有单独的面板钥匙，自建版用登录密钥
// 6.0：手机不再存登录密钥，自建完整版 Worker 要的密钥由路由器在云端信息里给；
// 还没换成手机钥匙的旧手机（比如升级后第一次打开时路由器正好离线）先用手上那把旧的，好看到断线原因
const cloudKey = () => (cinfo && cinfo.pkey) || oldToken() || '';
// 云端接口的地址：平时跟面板同一个网址（../cloud/）；在家里局域网打开的（本地版、http://路由器地址:906）没有 /cloud/，
// 直接找托管的专属网址（云端允许家里局域网地址跨域来读，6.0 第 94 项）
// 在家里局域网打开的：先要知道专属网址（cloud_info）才能去读云端
async function cinfoReady() { if (LAN_HOME && !cinfo) { try { cinfo = await P('cloud_info'); store.set('rp_cinfo', JSON.stringify(cinfo)); } catch (e) {} } }
const cloudURL = (p) => (LAN_HOME && cinfo && /^https:\/\/[^/]+\/cloud\/?$/.test(cinfo.url || '') ? cinfo.url.replace(/\/$/, '') + '/' : '../cloud/') + p;
// 连不上时查一下是哪一段不通：官网（也在 Cloudflare 上）通不通、国内网站通不通（只看能不能连上，不读内容）
async function netProbe(url, ms) {
	const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 6000);
	try { await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: c.signal }); return true; } catch (e) { return false; } finally { clearTimeout(t); }
}
async function netDiag() {
	let hub = '';
	try { hub = new URL(store.get('rp_hub') || '').origin; } catch (e) {}
	const [official, cn] = await Promise.all([hub ? netProbe(hub + '/api/ping') : Promise.resolve(null), netProbe('https://www.baidu.com/robots.txt')]);
	return { official, cn };
}
async function cloudFetch(force) {
	await cinfoReady();
	if (noCloud()) { cloud = null; cloudErr = null; return null; }
	if (!force && cloud && Date.now() - cloudAt < 15000) return cloud;
	cloudAt = Date.now();
	const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 12000);
	try {
		const cb = JSON.stringify({ token: cloudKey() }), rel = relayFor('cloud/s');
		const go = (url) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cb, signal: ctl.signal, cache: 'no-store' });
		let r;
		if (rel && relayOn()) r = await go(rel);
		else {
			// 专属网址连不上：托管版试一下官网中转（见 30-core 的 relayFor）
			try { r = await go(cloudURL('s')); }
			catch (e) { if (!rel || e.name === 'AbortError') throw e; r = await go(rel); if (r.headers.get('x-cmcp-relay') !== '1') throw e; }
		}
		if (!r.ok) throw new Error(r.status === 403 ? '云端密钥不对' : '云端返回 ' + r.status);
		const j = await r.json();
		j.synced = Date.now(); cloud = j; cloudErr = null;
		store.set('rp_cloud', JSON.stringify(j));
		return j;
	} catch (e) { cloudErr = e.name === 'AbortError' ? '连不上 Cloudflare（超时）' : navigator.onLine === false ? '手机没网' : e.message.startsWith('云端') ? e.message : '连不上 Cloudflare'; throw e; }
	finally { clearTimeout(tm); }
}
// 云端时间换算成「现在」：用同步时手机和云端的时间差，避免手机时钟不准
const cNow = (c) => c.now + (Date.now() - c.synced);
const cAgo = (c, ms) => { const s = Math.max(0, Math.round((cNow(c) - ms) / 1000)); return s < 60 ? s + ' 秒' : s < 3600 ? Math.round(s / 60) + ' 分钟' : (s / 3600).toFixed(1).replace(/\.0$/, '') + ' 小时'; };
const hm = (ms) => new Date(ms).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
function cloudLine(c) {
	if (!c || !c.s || c.s.state === 'ok' || c.s.state === 'wait') return '';
	const st = c.s.outStart || c.s.since;
	return `${c.label[c.s.state] || c.s.state}：${c.s.msg}（从 ${hm(st)} 起，已经 ${cAgo(c, st)}）`;
}
try { wdData = JSON.parse(store.get('rp_wd') || 'null'); } catch (e) {}
async function loadWd(quiet, check) {
	let err = null;
	const ci = P('cloud_info').then((x) => { cinfo = x; store.set('rp_cinfo', JSON.stringify(x)); hubBtn(); }).catch(() => {});
	if (!cinfo) await ci;
	const cp = cloudFetch(true).catch(() => null);
	try {
		const r = await P(check ? 'wd_check' : 'wd', {}, 30000);
		r.synced = Date.now();
		wdData = r;
		store.set('rp_wd', JSON.stringify(r));
		setStatus(true, '在线');
	} catch (e) { err = e; }
	await cp;
	renderWd(err);
	if (err) throw err;
}
/* ---------- 每日体检（每天 9:00 自动，结果推送到手机；这里看最近一次，也能手动体检） ---------- */
const DY = { d: null, at: 0 };
try { DY.d = JSON.parse(store.get('rp_daily') || 'null'); } catch (e) {}
function loadDaily() {
	if (DY.at && Date.now() - DY.at < 60000) return;
	DY.at = Date.now();
	P('daily', {}, 30000).then((d) => { DY.d = d; store.set('rp_daily', JSON.stringify(d)); renderDaily(); }).catch(() => {});
}
function renderDaily() {
	const el = $('dyCard'), pl = $('dyPill'); if (!el) return;
	const d = DY.d && !DY.d.none ? DY.d : null;
	const btn = '<div class="btngrid" style="margin:10px 0 0;grid-template-columns:1fr"><button class="btn" data-dyrun>现在体检</button></div>';
	if (!d) { pl.textContent = '还没体检过'; pl.className = 'pill'; el.innerHTML = `<div class="muted" style="font-size:13.5px;line-height:1.6">每天 9:00 自动体检一次，结果推送到手机（微信 / 浏览器）。也可以现在先体检一次。</div>${btn}`; return; }
	const items = d.items || [], bad = items.filter((i) => i.lvl !== 'ok'), worst = items.some((i) => i.lvl === 'err') ? 'err' : bad.length ? 'warn' : 'ok';
	const when = new Date(d.t * 1000), today = when.toDateString() === new Date().toDateString();
	pl.textContent = d.ok ? '一切正常' : d.summary; pl.className = 'pill ' + (worst === 'ok' ? 'good' : worst === 'warn' ? 'warnc' : 'red');
	const order = { err: 0, warn: 1, ok: 2 };
	el.innerHTML = `<div class="dyhead"><i class="${worst}">${worst === 'ok' ? '✓' : '!'}</i><div><b>${esc(d.ok ? '一切正常' : d.summary)}</b><span>${today ? '今天' : `${when.getMonth() + 1} 月 ${when.getDate()} 日`} ${hm(d.t * 1000)} 体检 · 共 ${items.length} 项</span></div></div>
		${[...items].sort((a, b) => order[a.lvl] - order[b.lvl]).map((i) => `<div class="dyrow"><i class="wdot ${esc(i.lvl)}"></i><div>${esc(i.title)}${i.detail ? `<small>${esc(i.detail)}</small>` : ''}</div></div>`).join('')}
		<p class="muted" style="font-size:12.5px;margin:8px 0 0">每天 9:00 自动体检，结果推送到手机。</p>${btn}`;
}
/* ---------- 自动处理的开关（看门狗自动做的事，可以关掉） ---------- */
const AU = { d: null, at: 0 };
try { AU.d = JSON.parse(store.get('rp_auto') || 'null'); } catch (e) {}
function loadAuto(b) {
	if (!b && AU.at && Date.now() - AU.at < 60000) return Promise.resolve();
	AU.at = Date.now();
	return P('auto', b || {}, 20000).then((d) => { AU.d = d; store.set('rp_auto', JSON.stringify(d)); renderAuto(); });
}
// 每一项自动任务：key、标题、说明（关掉以后会怎样也写清楚）
function autoItems(d) {
	const pn = d.px || '代理插件', on = d.on || {}, L = [];
	const add = (g, k, v, t, desc) => L.push({ g, k, v, t, desc });
	add('出问题时自动修', 'tunrestart', on.tunrestart !== false, '隧道断了自动重启', '连不上 Cloudflare 时自动重启隧道（间隔逐渐拉长，不会一直重启）。关掉后只记录，要自己重启');
	add('出问题时自动修', 'panelrestart', on.panelrestart !== false, '面板服务卡住自动重启', '面板没响应时自动重启面板服务。关掉后面板卡住只能自己重启路由器或服务');
	add('出问题时自动修', 'cacheclean', on.cacheclean !== false, '内存快满时清理缓存', '内存快用完时先清理系统缓存，不影响上网');
	if (d.oc) add('出问题时自动修', 'memguard', !!d.memguard, '内存不够时自动重启 ' + pn, '清理缓存后还不够，就重启一次 ' + pn + ' 释放内存（断网十几秒，会推送告诉你），避免整台路由器死机重启。至少隔 30 分钟、一天最多 6 次');
	if (d.autosw == null && d.autosw_why) L.push({ g: '出问题时自动修', k: 'autosw', t: '节点挂了自动换', desc: d.autosw_why, na: true });
	if (d.autosw != null) add('出问题时自动修', 'autosw', !!d.autosw, '节点挂了自动换', '每分钟测一次正在用的节点，连续 3 分钟都不通才换：先换同地区同类型同倍率的（专线换专线、3x 换 3x），没有再往下退；原来的恢复 10 分钟后换回。你手动换节点后 10 分钟内不会把它换走');
	// 开关看「有没有打开」（want）；打开了但有的插件还没生效，下面另外提示
	if (d.oc) add('网络', 'tunbypass', !!(d.tb && (d.tb.want ?? d.tb.on)), '隧道直连 Cloudflare', '面板和 AI 用的隧道不经过代理插件，' + pn + ' 重启、节点卡住时不会跟着断。直连连不上时会自动改回走代理' + (d.px === 'Nikki' ? '（Nikki 要等它下次重启才生效）' : ''));
	// 面板线路自动选择靠「不走代理」那个规则集换路线：规则集没启用时开着也不起作用，要说清楚
	if (!d.route && d.route_why) L.push({ g: '网络', k: 'route', t: '面板线路自动选择', desc: d.route_why, na: true });
	if (d.route) add('网络', 'route', on.route !== false, '面板线路自动选择', '连着家里 Wi-Fi 时，自动选能打开面板的那条路（直连或走代理）。关掉后保持现在的走法' + (d.route_ready === false ? '。现在还没起作用：要先在「不走代理」页启用' : ''));
	add('提醒和备份', 'daily', on.daily !== false, '每日体检', '每天 9:00 自动检查一遍，结果推送到手机。关掉后不再自动体检，「现在体检」照样能用');
	add('提醒和备份', 'weekly', on.weekly !== false, '每周报告', '每周一 9:10 推送上周断线几次、节点、流量最多的设备和新设备');
	add('提醒和备份', 'newdev', on.newdev !== false, '新设备连上提醒', '有没见过的设备连上 Wi-Fi 时推送通知。关掉后照样记下来，在「设备」页能看到');
	if (d.cloud) add('提醒和备份', 'cloudbackup', on.cloudbackup !== false, '云端自动备份', '每天 4:07 把路由器设置备份到云端，保留最近 10 份。关掉后「立即备份」照样能用');
	// 6.0 第 3、4 项：安全和状态提醒、自动拉黑
	add('安全', 'loginalert', on.loginalert !== false, '有人登录后台或 SSH 时提醒', '有人登录了路由器原版后台（LuCI）或 SSH 就推送，写明从哪台设备、哪个地址登录。面板自己替手机登录的不算');
	add('安全', 'autoban', on.autoban !== false, '自动拉黑试密码的外网地址', '同一个外网地址 10 分钟内后台或 SSH 密码错 5 次，就封 1 小时（再犯翻倍，最长 1 天）并推送。家里的设备、用面板的手机不会被封' + (d.ban && d.ban.tool === null ? '。这台路由器的防火墙没法自动封禁（没有 nftables、ipset），只推送提醒' : ''));
	add('安全', 'ipchange', on.ipchange === true, '公网 IP 变了提醒', '宽带的 IPv4 地址或 IPv6 前缀变了就推送（只显示前半段）。宽带每天重新拨号的，会每天推一次');
	add('状态提醒', 'health', on.health !== false, '温度、负载过高提醒', '温度到 90°C 以上，或者负载连续 5 分钟很高，就推送并说怎么办。同一类 6 小时最多推一次');
	add('状态提醒', 'diskfull', on.diskfull !== false, '存储快满提醒', '闪存剩不到 2 MB，或者挂载的硬盘用了 95% 以上，就推送。一天最多推一次');
	return L;
}
// 6.0 第 70 项：「自动任务」改名「特色功能」，Wi-Fi、访客 Wi-Fi、上网计划这些特色功能的入口也放在这一页（按用途分组），没权限的不显示
const AU_GO = [
	{ g: '上网管理', items: [
		{ v: 'wifi', t: 'Wi-Fi 设置', ic: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>', ok: () => canPage('wifi') },
		{ v: 'guest', t: '访客 Wi-Fi', ic: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.5 3.6-5.5 7-5.5s6 2 7 5.5"/>', ok: () => canPage('wifi') },
		{ v: 'dev', t: '上网计划、暂停上网', ic: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2.5h6"/>', ok: () => canPerm('parent') },
		{ v: 'split', t: '分流', ic: '<path d="M6 3v6a6 6 0 0 0 6 6 6 6 0 0 1 6 6M18 3v4M6 21v-2"/><circle cx="18" cy="9" r="2"/>', ok: () => canPerm('proxy') && pxShow({ p: 'split', px: 'clash' }) },
		{ v: 'black', t: '不走代理', ic: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>', ok: () => canPerm('parent') && pxShow({ p: 'black', px: 'oc' }) }] },
	{ g: '家里网络', items: [
		{ v: 'traf', t: '流量统计', ic: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', ok: () => true },
		{ v: 'speed', t: '网速测试', ic: '<path d="M12 14l4-4M3.5 17a9 9 0 1 1 17 0"/>', ok: () => canPerm('speed') },
		{ v: 'wd', t: '断线记录', ic: '<path d="M3 12h4l3-8 4 16 3-8h4"/>', ok: () => true }] },
	{ g: '备份', items: [{ v: 'cbk', t: '云端备份', ic: '<path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/><path d="M12 11v6M9.5 13.5 12 11l2.5 2.5"/>', ok: () => canPage('cbk') }] },
];
function renderAuGo() {
	const box = $('auGo'); if (!box) return;
	box.innerHTML = AU_GO.map((g) => ({ ...g, items: g.items.filter((x) => x.ok()) })).filter((g) => g.items.length).map((g) => `<div class="sectitle"><b>${esc(g.g)}</b></div><div class="mlist augo">${g.items.map((x) => `<button class="mact" data-augo="${x.v}"><i>${mIc(x.ic)}</i><span><b>${esc(x.t)}</b></span><span class="muted">›</span></button>`).join('')}</div>`).join('');
	// 老用户第一次进来：说一声改名了（只说一次）
	const nb = $('auNew');
	if (nb) { let seen = true; try { seen = !!localStorage.getItem('rp_f70') || !localStorage.getItem('rp_ov'); localStorage.setItem('rp_f70', '1'); } catch (e) {} if (!seen) nb.innerHTML = '<div class="notice" style="margin-top:10px">「自动任务」改名叫「特色功能」了，Wi-Fi、访客 Wi-Fi、上网计划也放在这一页。</div>'; }
}
$('auGo').addEventListener('click', (e) => {
	const b = e.target.closest('[data-augo]'); if (!b) return;
	const v = b.dataset.augo;
	if (v === 'guest') return go('wifi').then(() => setTimeout(() => { const g = $('wfGuest'); if (g) g.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 500));
	go(v);
});
function renderAuto() {
	renderAuGo();
	const el = $('auCard'), pl = $('auPill'); if (!el) return;
	const d = AU.d;
	if (!d) { pl.textContent = '—'; pl.className = 'pill'; return; }
	const row = (x) => x.na ? `<div class="kv aswon auna"><span><b>${esc(x.t)}</b><span class="muted">${esc(x.desc)}</span></span><span class="pill">用不了</span></div>` : `<label class="kv aswon" data-au="${x.k}"><span><b>${esc(x.t)}</b><span class="muted">${esc(x.desc)}</span></span><span class="sw"><input type="checkbox" ${x.v ? 'checked' : ''}><i></i></span></label>`;
	const day = (t) => { const x = new Date(t * 1000); return (x.getMonth() + 1) + ' 月 ' + x.getDate() + ' 日 ' + hm(t * 1000); };
	const items = autoItems(d);
	// 每一组一张卡片，标题在卡片外面（跟其他页面一样）
	const groups = [];
	for (const x of items) { let g = groups.find((y) => y.g === x.g); if (!g) groups.push(g = { g: x.g, list: [] }); g.list.push(x); }
	// 6.0 第 44 项（用户 11/26 定）：Nikki 要重启才生效：先问，点「现在重启」才重启，不点就等它下次重启
	const note = (x) => x.k !== 'tunbypass' ? '' : x.v ? (d.tb.status === '还没生效' ? (d.px === 'Nikki' ? '<div class="notice" style="margin:2px 0 8px">已打开，Nikki 重启后生效</div><button class="btn sm" data-nkrs type="button" style="margin:0 0 8px">现在重启 Nikki</button>' : '<div class="notice" style="margin:2px 0 8px">已打开，还有代理插件没生效：过几分钟会自动补上</div>') : '') : d.tb.auto ? `<div class="notice w" style="margin:2px 0 8px">直连 Cloudflare 一直连不上，${d.tb.at ? day(d.tb.at) + ' ' : ''}已自动改回走代理，一天后会再试一次直连。</div>` : '';
	// 「节点挂了自动换」的详细设置（看哪个策略组、最近切换、模拟一次）放在它下面：同一个设置只在这一页改（节点页只显示状态）
	const bans = d.ban && d.ban.ips ? Object.entries(d.ban.ips).sort((a, b) => b[1].at - a[1].at) : [];
	const more = (x) => (x.na ? '' : x.k === 'autosw' ? '<div id="aswCard" class="aswin"></div>' : x.k === 'autoban' && bans.length ? `<div class="banlist">${bans.map(([ip, b]) => `<div class="kv" style="align-items:center"><span><b style="color:var(--text)">${esc(ip)}</b><span class="muted" style="display:block;font-size:12px">${b.noblock ? '没能封（防火墙不支持），只提醒了' : '封到 ' + day(b.until)}</span></span><button class="btn sm" data-unban="${esc(ip)}">解封</button></div>`).join('')}</div>` : '');
	let html = groups.map((g) => `<div class="sectitle"><b>${esc(g.g)}</b></div><section class="card aucard">${g.list.map((x) => row(x) + note(x) + more(x)).join('')}</section>`).join('');
	if (!d.oc) html += '<p class="muted" style="font-size:12.5px;margin:10px 4px 0">这台路由器没装代理插件，跟代理插件有关的几项不显示。</p>';
	el.innerHTML = html;
	if (d.autosw != null) { if (ASW.st) renderAsw(); loadAsw(); }
	const can = items.filter((x) => !x.na), n = can.filter((x) => x.v).length; // 用不了的不算
	pl.textContent = n === can.length ? '全部开启' : n ? `开了 ${n} / ${can.length} 项` : '全部关闭';
	pl.className = 'pill ' + (n === can.length ? 'good' : '');
}
$('auCard').addEventListener('click', (ev) => {
	const ub = ev.target.closest('[data-unban]');
	if (ub) return busy(ub, async () => {
		if (!(await confirmBox('解封 ' + ub.dataset.unban, '这个地址马上就能再连路由器的后台和 SSH。确认是你自己（或者认识的人）再解封。', '解封'))) return;
		await P('ban_del', { ip: ub.dataset.unban }, 20000); toast('已解封'); await loadAuto({});
	}, false);
	if (ev.target.closest('[data-nkrs]')) return nikkiRestart();
	const au = ev.target.closest('[data-au]'); if (au && ev.target.matches('input')) setAuto(au);
});
async function nikkiRestart() {
	if (!(await confirmBox('重启 Nikki', '断网 10–30 秒。', '重启'))) return;
	try { await P('px_ctl', { id: 'nikki', op: 'restart' }); toast('正在重启 Nikki…'); setTimeout(() => loadAuto({}).catch(() => {}), 40000); } catch (e) { toast(e.message, true); }
}
function setAuto(lb) {
	const k = lb.dataset.au, inp = lb.querySelector('input'), on = inp.checked;
	const it = AU.d ? autoItems(AU.d).find((x) => x.k === k) : null;
	busy(null, async () => {
		try {
			await loadAuto({ set: true, [k]: on }); toast((on ? '已开启：' : '已关闭：') + (it ? it.t : ''));
			// 用的是 Nikki：打开隧道直连后问要不要现在重启（不重启就等它下次重启）
			if (k === 'tunbypass' && on && AU.d && AU.d.px === 'Nikki' && AU.d.tb && AU.d.tb.status === '还没生效') {
				if (await confirmBox('现在重启 Nikki？', '重启后马上生效，断网 10–30 秒；不重启就等它下次重启。', '现在重启')) { await P('px_ctl', { id: 'nikki', op: 'restart' }); toast('正在重启 Nikki…'); setTimeout(() => loadAuto({}).catch(() => {}), 40000); }
			}
		}
		catch (e) { inp.checked = !on; throw e; }
	});
}
function renderWd(err) {
	const box = $('wdBody'), d = wdData, st = (d && d.state) || {};
	const off = err instanceof OfflineError;
	const hms = (t) => new Date(t * 1000).toLocaleTimeString('zh-CN', { hour12: false });
	const dayOf = (t) => {
		const x = new Date(t * 1000), n = new Date();
		if (x.toDateString() === n.toDateString()) return '今天';
		if (x.toDateString() === new Date(n - 864e5).toDateString()) return '昨天';
		return `${x.getMonth() + 1} 月 ${x.getDate()} 日`;
	};
	const ago = (ms) => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? '刚刚' : s < 3600 ? Math.round(s / 60) + ' 分钟前' : s < 86400 ? Math.round(s / 3600) + ' 小时前' : Math.round(s / 86400) + ' 天前'; };
	// 连不上时各项状态都不知道了；只有「隧道断开」(1033) 能确定是隧道的问题
	const item = (label, v, isTun) => {
		if (off) return isTun && err.short === '隧道断开' ? `<div><i class="wdot err"></i><b>${label}</b><span class="bad">断开</span></div>` : `<div><i class="wdot"></i><b>${label}</b><span>未知</span></div>`;
		return `<div><i class="wdot ${!d ? '' : v === 'ok' ? 'ok' : 'err'}"></i><b>${label}</b><span class="${!d ? '' : v === 'ok' ? 'good' : 'bad'}">${!d ? '—' : v === 'ok' ? '正常' : '异常'}</span></div>`;
	};
	const pill = off ? ['warnc', '离线'] : !d ? ['', '读取中'] : d.running ? ['good', '看门狗运行中'] : ['red', '看门狗没运行'];
	const c = cloud;
	const evs = [...((d && d.events) || []), ...((c && c.events) || []).map((e) => ({ ...e, t: Math.round(e.t / 1000) }))].sort((a, b) => b.t - a.t);
	const wk = (d ? d.now : Date.now() / 1000) - 7 * 86400;
	const cnt = (f) => evs.filter((e) => e.t >= wk && f(e)).length;
	const sum = [['隧道断开', cnt((e) => e.kind === 'tunnel' && e.lvl === 'err')], ['宽带/外网断开', cnt((e) => (e.kind === 'wan' || e.kind === 'net') && e.lvl === 'err')], ['意外重启', cnt((e) => e.kind === 'boot' && e.lvl === 'err')], ['自动修复', cnt((e) => e.kind === 'watchdog' && e.lvl === 'warn' || e.kind === 'panel' && e.lvl === 'err')]];
	const opened = new Set($$('details[open]', box).map((x) => x.dataset.k));
	let html = `<div class="hero"><div class="herohead"><h1>断线记录</h1><span class="pill ${pill[0]}">${pill[1]}</span></div>
		<p class="muted" style="margin-bottom:0">看门狗每 30 秒检查一次宽带、外网、DNS、隧道、面板和 OpenClash，断了会自动修复并记下原因。记录存在路由器闪存里，断电重启也不会丢。</p>
		${off ? `<div class="notice w" style="margin-top:12px">现在连不上路由器：${esc(err.message)}。${c && cloudLine(c) ? `<br><b>Cloudflare 实时判断：</b>${esc(cloudLine(c))}` : cloudErr && ['离线', '超时', '手机没网'].includes(err.short) ? '<br><b>Cloudflare 也连不上</b>：多半是你的手机现在没网或网络不稳；如果手机连着家里这台路由器的 Wi-Fi，也可能是 ' + (pxAct()?.name || '代理插件') + ' 正在重启。' : c && ['离线', '超时', '手机没网'].includes(err.short) && c.s.state === 'ok' && c.r && cNow(c) - c.r.last < 150e3 ? `<br><b>Cloudflare 显示路由器一切正常</b>（${cAgo(c, c.r.last)}前刚报告过），是你的手机到 Cloudflare 这一段不通（手机网络不稳，或者手机连着家里这台路由器而 ${esc(pxAct()?.name || '代理插件')} 正在重启），稍后下拉刷新就好。` : ''}<br>${d ? `下面路由器自己的记录是${ago(d.synced)}同步的，路由器连上后会自动更新。` : '这台手机还没有同步过路由器的记录。'}</div>` : ''}
		${d && !d.running && !off ? '<div class="notice w" style="margin-top:12px">看门狗没在运行，断线不会被自动修复和记录。</div>' : ''}
		<div class="wdst">${item('宽带', st.WAN)}${item('外网', st.NET)}${item('DNS', st.DNS)}${item('隧道', st.TUN, true)}${item('面板', st.PANEL)}${item('代理', st.CLASH)}</div>
		${d && st.CHECK_T ? `<div class="muted" style="font-size:12px;margin-top:8px">上次检查 ${hms(+st.CHECK_T)}${st.READY ? ` · 隧道 ${esc(st.READY)} 条连接` : ''} · 路由器已运行 ${dur(d.uptime)}</div>` : ''}
		<div class="btngrid" style="margin:12px 0 0"><button class="btn primary" data-wdcheck ${off ? 'disabled' : ''}>立即检查</button><button class="btn" data-wdclear ${off || !d ? 'disabled' : ''}>清空记录</button></div></div>`;
	// 云端监测卡片
	if (c || cloudErr) {
		const cs = c && c.s ? c.s.state : 'wait';
		const cls = { ok: 'good', partial: 'warnc', noreport: 'warnc', wait: '' }[cs] ?? 'red';
		const rAgo = c && c.r ? cAgo(c, c.r.last) + '前' : '还没收到';
		const pr = c && c.probe ? (c.probe.code === 200 ? '正常' : `失败（${c.probe.code === 530 ? '隧道断开 1033' : c.probe.code ? '错误 ' + c.probe.code : '超时'}）`) + ' · ' + cAgo(c, c.probe.at) + '前' : '—';
		const tFresh = c && c.t && cNow(c) - c.t.last < 150e3;
		const tb = !c || !c.t ? '还没设置' : tFresh ? '正常 · ' + cAgo(c, c.t.last) + '前' : '没在报告 · 最后一次 ' + cAgo(c, c.t.last) + '前';
		html += `<div class="sectitle"><b>云端监测</b><span class="pill ${c ? cls : ''}">${c ? esc(c.label[cs] || cs) : '读不到'}</span></div>
		<section class="card" data-cloud>
			${cloudErr ? `<div class="notice w" style="margin-bottom:8px">${esc(cloudErr)}${c ? `，下面是${ago(c.synced)}的云端数据` : ''}</div>` : ''}
			${c && cs !== 'ok' && cs !== 'wait' ? `<div class="notice ${cls === 'red' ? 'd' : 'w'}" style="margin-bottom:8px">${esc(cloudLine(c))}</div>` : ''}
			<div class="kv"><span>路由器报告</span><span>${rAgo}</span></div>
			<div class="kv"><span>隧道探测</span><span>${pr}</span></div>
			<div class="kv"><span>平板（证人）</span><span class="${c && c.t ? (tFresh ? 'okc' : 'badc') : ''}">${tb}</span></div>
			<p class="muted" style="font-size:12.5px;margin:8px 0 0">Cloudflare 一直在收路由器的心跳（一切正常时每 3 分钟记一次），路由器断电、断网时也照常判断和记录。${!c || !c.t ? '加一台平板作证，断线时就能分清是断电还是断网。' : ''}</p>
			<div class="btngrid" style="margin:10px 0 0"><button class="btn" data-tablet>平板设置方法</button></div>
		</section>`;
	}
	html += `<div class="sectitle"><b>每日体检</b><span class="pill" id="dyPill">—</span></div><section class="card" id="dyCard"><div class="muted" style="font-size:13px">读取中…</div></section>`;
	html += `<section class="card list" style="margin-top:12px"><button class="file" data-goauto><div><b>特色功能</b></div><span class="muted">›</span></button></section>`;
	html += noCloud() ? `<div class="sectitle"><b>手机通知</b><span class="pill">未启用</span></div><section class="card"><div class="muted" style="font-size:13px">手机推送、微信推送、云端备份和断电/断网判断需要 Cloudflare 云端（完整版）。装好云端后在路由器上重新运行安装脚本选完整版即可。</div></section>`
		: `<div class="sectitle"><b>手机通知</b><span class="pill" id="pushPill">—</span></div><section class="card" id="pushCard"><div class="muted" style="font-size:13px">读取中…</div></section>`;
	html += `<div class="sectitle"><b>最近 7 天</b></div><div class="wdsum">${sum.map(([k, n]) => `<span class="pill ${n ? (k === '自动修复' ? 'blue' : 'red') : ''}">${k} ${n} 次</span>`).join('')}</div>`;
	if (!evs.length) html += `<div class="card empty" style="margin-top:12px">${d ? '还没有记录，一切正常' : '还没有记录'}</div>`;
	let cur = '';
	evs.forEach((e) => {
		const dy = dayOf(e.t);
		if (dy !== cur) { cur = dy; html += `<div class="sectitle"><b>${dy}</b></div>`; }
		const k = e.t + e.kind;
		html += `<div class="wdev"><i class="wdot ${esc(e.lvl)}"></i><div style="min-width:0"><div class="tm">${hms(e.t)} · ${esc(WDK[e.kind] || e.kind)}</div><div class="ms">${esc(e.msg)}</div>${e.from && e.to > e.from ? `<div class="tm">${ts(e.from)} → ${ts(e.to)}</div>` : ''}</div>${e.detail ? `<details data-k="${esc(k)}" ${opened.has(k) ? 'open' : ''}><summary>详细信息</summary><pre>${esc(e.detail)}</pre></details>` : ''}</div>`;
	});
	box.innerHTML = html;
	renderDaily(); if (!off) loadDaily();
	box.onclick = async (ev) => {
		if (ev.target.closest('[data-goauto]')) return go('auto');
		const dr = ev.target.closest('[data-dyrun]');
		if (dr) return busy(dr, async () => { DY.d = await P('daily', { run: 1 }, 90000); DY.at = Date.now(); store.set('rp_daily', JSON.stringify(DY.d)); renderDaily(); toast('体检完成：' + (DY.d.summary || ''), /发现|问题|异常/.test(DY.d.summary || '') ? 'warn' : false); }, '体检中');
		const c = ev.target.closest('[data-wdcheck]');
		if (c) return busy(c, async () => { await loadWd(false, true); toast('检查完成'); }, '检查中');
		const x = ev.target.closest('[data-wdclear]');
		if (x && await confirmBox('清空断线记录', '路由器和云端的记录都会清空，之前的断线原因就看不到了。', '清空', true)) busy(x, async () => {
			await P('wd_clear', {});
			await fetch(cloudURL('s'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: cloudKey(), clear: true }) }).catch(() => {});
			toast('已清空'); refresh(true);
		});
		if (ev.target.closest('[data-tablet]')) tabletHelp();
	};
	pushRender();
}

/* ---------- 手机通知（Web Push） ---------- */
const PUSH = { st: null, at: 0 };
const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function cloudPush(b) {
	await cinfoReady();
	const r = await fetch(cloudURL('push'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: cloudKey(), ...b }), cache: 'no-store' });
	if (!r.ok) {
		let m = null;
		try { m = (await r.json()).error; } catch (e) {}
		throw new Error(r.status === 403 ? '云端不认这个密钥' : m || '连不上云端（' + r.status + '）');
	}
	return r.json();
}
async function swReg() {
	return Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('后台服务还没准备好，刷新一下再试')), 6000))]);
}
function devName() {
	const m = navigator.userAgent.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/);
	return m && m[1] !== 'K' ? m[1].trim() : /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? '安卓手机' : '电脑';
}
async function pushState(force) {
	if (!force && PUSH.st && Date.now() - PUSH.at < 60e3) return PUSH.st;
	const ok = pushOk();
	let sub = null, subs = null, err = null, wx = null;
	if (ok) try { sub = await (await swReg()).pushManager.getSubscription(); } catch (e) { err = e.message; }
	try { const r = await cloudPush({ op: 'list', endpoint: sub ? sub.endpoint : '' }); subs = r.subs; wx = r.wx || null; } catch (e) { err = err || e.message; }
	PUSH.at = Date.now();
	return (PUSH.st = { ok, perm: ok ? Notification.permission : 'default', sub, subs, err, wx });
}
function pushRender() {
	const el = $('pushCard');
	if (!el) return;
	const s = PUSH.st;
	const pill = $('pushPill');
	if (!s) { pushState().then(pushRender).catch(() => {}); return; }
	const on = s.ok && s.sub && s.perm === 'granted' && (s.subs || []).some((x) => x.me);
	const wx = s.wx || {}, wOn = !!wx.on;
	pill.className = 'pill ' + (on || wOn ? 'good' : '');
	pill.textContent = on || wOn ? '已开启' : '未开启';
	const list = `<p class="muted" style="margin:0;font-size:13.5px">路由器出问题时直接通知你，不用打开面板也能知道：</p><ul class="pushl" style="margin-bottom:4px"><li>路由器断电、断网、隧道断开，以及恢复正常</li><li>OpenClash 停了、DNS 坏了、内存耗尽</li><li>平板（证人）停止报告</li></ul>`;
	// 微信（PushPlus）：云端直接发，不依赖浏览器
	const wxh = wOn ? `<div class="subhd">微信推送</div>
		<div class="kv"><span>微信</span><span class="okc">已开启 · token …${esc(wx.tail || '')}</span></div>
		${wx.ok ? `<div class="kv"><span>上一条</span><span class="okc">${hm(wx.ok)} 已发到微信</span></div>` : ''}
		${wx.err && (wx.errAt || 0) > (wx.ok || 0) ? `<div class="notice w" style="margin-top:8px">${hm(wx.errAt)} 发送失败：${esc(wx.err)}</div>` : ''}
		<div class="btngrid" style="margin:12px 0 0"><button class="btn blue" data-wxtest>发一条测试</button><button class="btn" data-wxoff>关闭微信推送</button></div>`
		: `<div class="subhd">微信推送 <span class="tagrec">推荐</span></div>
		<ol class="steps wxsteps"><li>在微信里打开 <b>www.pushplus.plus</b>（把网址发给「文件传输助手」再点开），用微信登录，按提示关注公众号。</li><li>在「一对一推送」页面复制你的 <b>token</b>（一串字母和数字）。</li><li>粘贴到下面点「开启」，微信会马上收到一条消息。</li></ol>
		<div class="addrow"><input class="input" data-wxin placeholder="粘贴 PushPlus 的 token" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary" type="button" data-wxon>开启</button></div>`;
	// 浏览器通知（部分浏览器收不到，比如安卓 Edge）
	let bh;
	const others = (s.subs || []).filter((x) => !x.me);
	if (!s.ok) bh = `<p class="muted" style="margin:4px 0 0;font-size:13px">${!window.isSecureContext ? '在家里地址（http）打开面板时，浏览器不让开推送通知：用下面的微信推送，或者从官网打开面板再开。' : '这个浏览器不支持推送通知。'}</p>`;
	else if (s.perm === 'denied') bh = `<div class="notice w">通知权限被关掉了：到手机「设置 → 应用 → 浏览器 → 通知」里打开，再回来点开启。</div>`;
	else if (!on) bh = `<p class="muted" style="margin:4px 0 0;font-size:13px">弹在手机通知栏。安卓 Edge 收不到，要用 Chrome。</p>
		${s.err ? `<div class="notice w" style="margin-top:8px">${esc(s.err)}</div>` : ''}
		<div class="btngrid" style="margin:10px 0 0"><button class="btn" data-pushon>开启浏览器通知</button></div>`;
	else {
		const me = (s.subs || []).find((x) => x.me) || {};
		bh = `<div class="kv"><span>这台手机</span><span class="okc">已开启</span></div>
		${me.sent ? `<div class="kv"><span>上一条</span><span>${pushRecv(me)}</span></div>` : ''}
		${PUSH.diag ? `<div class="notice ${PUSH.diag.ok ? '' : 'w'}" style="margin-top:8px">${PUSH.diag.html}</div>` : ''}
		<div class="btngrid three" style="margin:12px 0 0"><button class="btn" data-pushtest>发一条测试</button><button class="btn" data-pushlocal>本机弹一条</button><button class="btn" data-pushoff>关闭</button></div>`;
	}
	el.innerHTML = list + wxh + `<div class="subhd">浏览器通知</div>` + bh + (others.length ? `<div class="kv"><span>其他设备的浏览器</span><span>${others.map((x) => esc(x.name)).join('、')}</span></div>` : '');
	el.onclick = async (e) => {
		const on1 = e.target.closest('[data-pushon]'), t = e.target.closest('[data-pushtest]'), off1 = e.target.closest('[data-pushoff]'), loc = e.target.closest('[data-pushlocal]');
		const wxon = e.target.closest('[data-wxon]'), wxt = e.target.closest('[data-wxtest]'), wxoff = e.target.closest('[data-wxoff]');
		if (wxon) busy(wxon, async () => {
			const v = (el.querySelector('[data-wxin]').value || '').replace(/\s+/g, '');
			if (!v) return toast('先粘贴 PushPlus 的 token', true);
			const r = await cloudPush({ op: 'wx', wx: v });
			PUSH.st.wx = r.wx; pushRender();
			toast('微信推送已开启，看看微信收到没有');
		}, '验证中');
		if (wxt) busy(wxt, async () => {
			const r = await cloudPush({ op: 'test' });
			PUSH.st.wx = r.wx; pushRender();
			if (r.wx && r.wx.err && (r.wx.errAt || 0) > (r.wx.ok || 0)) toast('微信没发出去：' + r.wx.err, true);
			else toast('已发到微信');
		}, '发送中');
		if (wxoff) busy(wxoff, async () => {
			const r = await cloudPush({ op: 'wx', wx: '' });
			PUSH.st.wx = r.wx; pushRender();
			toast('已关闭微信推送');
		});
		if (loc) busy(loc, async () => {
			// 不经过推送服务，直接在本机弹一条：能看到 → 手机允许浏览器弹通知；看不到 → 系统设置把通知关了
			const reg = await swReg();
			await reg.showNotification('本机通知测试', { body: '能看到这条，说明手机允许浏览器弹通知', tag: 'local', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: './?p=wd' } });
			toast('已经在本机弹了一条，看看通知栏');
		});
		if (on1) busy(on1, async () => {
			const perm = await Notification.requestPermission();
			if (perm !== 'granted') { await pushState(true); pushRender(); return toast(perm === 'denied' ? '通知权限被拒绝了' : '没有允许通知', true); }
			const key = (await (await fetch(cloudURL('push/key'), { cache: 'no-store' })).json()).key;
			if (!key) throw new Error('云端还没配置推送');
			const reg = await swReg();
			const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((key.length + 3) % 4)), (c) => c.charCodeAt(0));
			const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw }));
			// 6.0 第 16 项：带上是哪个账号的手机（路由器签过名），上网计划的提醒只推给设计划的家长
			const id = await P('push_id').catch(() => null);
			await cloudPush({ op: 'sub', sub: sub.toJSON(), name: devName(), ...(id && id.uid ? { uid: id.uid, sig: id.sig } : {}) });
			if (id && id.uid) store.set('rp_push_uid', id.uid + '|' + sub.endpoint.slice(-24));
			await pushState(true); pushRender();
			toast('通知已开启，正在发一条测试');
			pushTest().catch((e) => toast(e.message, true));
		}, '开启中');
		if (t) busy(t, () => pushTest(), '发送中');
		if (off1) busy(off1, async () => {
			const sub = PUSH.st.sub;
			if (sub) { await cloudPush({ op: 'unsub', endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
			await pushState(true); pushRender();
			toast('已关闭，这台手机不会再收到通知');
		});
	};
}
function pushRecv(m) {
	const t = (x) => new Date(x).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
	if (m.recv && m.recv.shown) return `<span class="okc">${t(m.sent)} 已送到这台手机</span>`;
	if (m.recv) return `<span style="color:var(--warn)">${t(m.sent)} 收到了但弹不出来</span>`;
	return `<span class="muted">${t(m.sent)} 已发出，手机没回应</span>`;
}
// 发一条测试，然后等手机回报，自动判断问题出在哪
async function pushTest() {
	const ep = PUSH.st && PUSH.st.sub && PUSH.st.sub.endpoint;
	if (!ep) throw new Error('这台手机还没开启通知');
	PUSH.diag = { ok: true, html: '测试已发出，正在等手机回应…' }; pushRender();
	const r = await cloudPush({ op: 'test', endpoint: ep });
	if (!r.sent) { PUSH.diag = { ok: false, html: '云端没发出去：推送服务拒绝了。点「关闭通知」再重新开启试试。' }; pushRender(); return; }
	let me = null;
	for (let i = 0; i < 10; i++) {
		await new Promise((res) => setTimeout(res, 2000));
		await pushState(true);
		me = (PUSH.st.subs || []).find((x) => x.me);
		if (me && me.recv) break;
	}
	if (me && me.recv && me.recv.shown) PUSH.diag = { ok: true, html: '<b>手机已经收到了。</b>如果通知栏没看到，是系统把浏览器的通知藏起来了：到「设置 → 应用 → Edge → 通知」把通知和「网站」类别都打开，并允许横幅/悬浮通知。' };
	else if (me && me.recv) PUSH.diag = { ok: false, html: '<b>手机收到了，但弹不出来</b>（' + esc(me.recv.err || me.recv.perm || '没有权限') + '）。到「设置 → 应用 → Edge → 通知」打开通知，再到 Edge 的「网站设置 → 通知」里允许这个网站。' };
	else PUSH.diag = { ok: false, html: '<b>云端已经发出，但 20 秒内手机没收到。</b>多半是 Edge 在后台被系统限制了：到「设置 → 应用 → Edge → 省电策略」改成「无限制」，并允许自启动/后台运行。还不行就用 Chrome 打开面板再开启一次（Chrome 的推送最稳）。' };
	pushRender();
}
// 点通知打开面板时，后台服务会告诉面板该去哪一页
try { navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (e) => { const p = e.data && e.data.go; if (p && validPage(p) && token) go(p); if (e.data && e.data.ask === 'pause' && token) askPause(e.data.mac); if (e.data && e.data.ask === 'ai' && token) aiCheck(true); if (e.data && e.data.ask === 'update' && token) updSheet(false); if (e.data && e.data.pushed && $('pushCard')) pushState(true).then(pushRender).catch(() => {}); }); } catch (e) {}

function tabletHelp() {
	const u = cinfo && cinfo.tablet;
	modal(`<div class="sheethead"><h3>平板设置方法</h3><button class="btn sm" data-v="close">关闭</button></div>
		<p class="muted" style="margin-top:0">让平板每分钟向 Cloudflare 报告一次。路由器没声音而平板还在报告，就是路由器断电；两个都没声音，就是家里断网。</p>
		<ol class="steps">
			<li><b>连另一个网络</b>（光猫或另一台路由器的 Wi-Fi），不要连这台路由器的 Wi-Fi。在「设置 → WLAN → 高级设置」里把「休眠时保持 WLAN 连接」设为始终（如果有这个选项）。</li>
			<li><b>安装 MacroDroid</b>：在应用商店搜，搜不到就用浏览器打开 macrodroid.com 下载安装包。免费版就够用。</li>
			<li><b>新建一个宏</b>：<br>触发器选「日期/时间 → 定时触发（Regular Interval）」，间隔 1 分钟；<br>动作选「连接 → HTTP 请求（HTTP Request）」，方法 GET，网址填下面这个；<br>名字随便起，比如「路由器证人」，保存。</li>
			<li><b>不让系统关掉它</b>：设置 → 应用 → 应用管理 → MacroDroid：打开「自启动」，电池/耗电管理设为「不限制」或「允许后台运行」。再在最近任务里把 MacroDroid 的卡片往下拉锁住。</li>
			<li><b>插着电放着</b>，屏幕可以关。</li>
			<li>回到这一页，「云端监测」里的「平板（证人）」变成「正常」就设置好了（最多等 1 分钟）。</li>
		</ol>
		<div class="notice" style="margin-top:4px">平板要访问的网址带着平板的钥匙，放在「我的主页 → 敏感信息」里，验证是你本人后才能看和复制。</div>
		<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-v="close">关闭</button><button class="btn primary" data-me ${u ? '' : 'disabled'}>去看网址</button></div>`,
	(m, close) => { const b = m.querySelector('[data-me]'); if (b && u) b.onclick = () => { close(null); go('me'); }; });
}

/* ---------- 终端 ---------- */
let termCwd = store.get('rp_cwd') || '/root', termHist = [], termIdx = -1;
try { termHist = JSON.parse(store.get('rp_hist') || '[]'); } catch (e) {}
const TERM_QUICK = [['系统状态', 'uptime; free -m; df -h /overlay /tmp'], ['网络接口', 'ifstatus wan | head -30; ip -4 addr'], ['进程', 'top -bn1 | head -25'], ['系统日志', 'logread | tail -n 40'], ['OpenClash 进程', 'ps w | grep -E "[c]lash|[o]penclash"'], ['可更新的包', 'opkg list-upgradable 2>/dev/null || apk version -l "<" 2>/dev/null']];
function termPrint(html) { const t = $('termOut'); t.insertAdjacentHTML('beforeend', html); t.scrollTop = t.scrollHeight; }
function termPs() { $('termPs').textContent = termCwd.replace(/^\/root(?=\/|$)/, '~') + ' #'; }
async function termRun(cmd) {
	cmd = cmd.trim(); if (!cmd) return;
	if (cmd === 'clear') { $('termOut').innerHTML = ''; return; }
	termHist = termHist.filter((x) => x !== cmd); termHist.push(cmd); termHist = termHist.slice(-50); termIdx = -1;
	store.set('rp_hist', JSON.stringify(termHist));
	termPrint(`<span class="cmd">${esc($('termPs').textContent)} ${esc(cmd)}</span>\n`);
	if (/^(vi|vim|nano|top|less|more|htop)(\s|$)/.test(cmd) && !/-b/.test(cmd)) { termPrint('<span class="err">这里是一次性执行，不支持需要交互的命令。查看文件用 cat，编辑文件请用「文件管理」。</span>\n'); return; }
	const btn = $('termGo'); btn.disabled = true; btn.innerHTML = '<span class="spin">↻</span>';
	try {
		const r = await P('term', { cmd, cwd: termCwd, timeout: 100 }, 115000);
		if (r.out) termPrint(esc(r.out) + '\n');
		if (r.code === 'timeout') termPrint('<span class="err">（运行超过 100 秒，已停止）</span>\n');
		else if (r.code) termPrint(`<span class="dim">（退出码 ${esc(r.code)}）</span>\n`);
		termCwd = r.cwd || termCwd; store.set('rp_cwd', termCwd); termPs();
	} catch (e) { termPrint(`<span class="err">${esc(e.message)}</span>\n`); }
	finally { btn.disabled = false; btn.textContent = '执行'; }
}
function initTerm() {
	if ($('termOut').dataset.init) return;
	$('termOut').dataset.init = '1';
	termPs();
	termPrint('<span class="dim">路由器终端（root）。每条命令单独执行，最长 100 秒；cd 会记住目录。输入 clear 清屏。</span>\n');
	$('termQuick').innerHTML = TERM_QUICK.map(([t], i) => `<button class="chip" data-q="${i}">${esc(t)}</button>`).join('');
	$('termQuick').onclick = (e) => { const b = e.target.closest('[data-q]'); if (b) termRun(TERM_QUICK[+b.dataset.q][1]); };
	const inp = $('termIn');
	const go2 = () => { const v = inp.value; inp.value = ''; termRun(v); };
	$('termGo').onclick = go2;
	inp.onkeydown = (e) => {
		if (e.key === 'Enter') { e.preventDefault(); go2(); }
		if (e.key === 'ArrowUp' && termHist.length) { e.preventDefault(); termIdx = termIdx < 0 ? termHist.length - 1 : Math.max(0, termIdx - 1); inp.value = termHist[termIdx]; }
		if (e.key === 'ArrowDown' && termIdx >= 0) { e.preventDefault(); termIdx++; if (termIdx >= termHist.length) { termIdx = -1; inp.value = ''; } else inp.value = termHist[termIdx]; }
	};
	$('termHist').onclick = () => modal(`<div class="sheethead"><h3>历史命令</h3><button class="btn sm" data-v="close">关闭</button></div>${termHist.length ? termHist.slice().reverse().map((h, i) => `<button class="file" data-v="h${termHist.length - 1 - i}"><span class="mono ell" style="flex:1;min-width:0">${esc(h)}</span><span class="muted">填入 ›</span></button>`).join('') : '<div class="empty">还没有历史命令</div>'}`).then((v) => { if (typeof v === 'string' && v[0] === 'h') { inp.value = termHist[+v.slice(1)]; inp.focus(); } });
	$('termClear').onclick = () => { $('termOut').innerHTML = ''; };
}

/* ---------- 文件管理 ---------- */
let fmPath = store.get('rp_fm') || '/etc/openclash', fmItems = [];
const fmJoin = (d, n) => (d === '/' ? '' : d) + '/' + n;
async function loadFiles() {
	const r = await P('fs_list', { path: fmPath }).catch(async (e) => { if (fmPath !== '/') { fmPath = '/'; return P('fs_list', { path: '/' }); } throw e; });
	setStatus(true, '在线');
	fmPath = r.path; fmItems = r.items; store.set('rp_fm', fmPath);
	const parts = fmPath.split('/').filter(Boolean);
	$('fmCrumb').innerHTML = `<button data-p="/">/</button>` + parts.map((p, i) => `<span class="muted">›</span><button data-p="/${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</button>`).join('');
	$('fmInfo').textContent = `${fmItems.length} 项${r.free ? ' · ' + r.free : ''}`;
	$('fmList').innerHTML = (fmPath !== '/' ? '<button class="file" data-up><div style="display:flex;gap:10px;align-items:center"><span class="fico">↰</span><b>上一级</b></div></button>' : '') +
		(fmItems.length ? fmItems.map((f, i) => `<button class="file" data-f="${i}"><div style="display:flex;gap:10px;align-items:center;min-width:0"><span class="fico ${f.dir ? 'd' : ''}">${f.dir ? '▸' : f.link ? '↗' : '≡'}</span><div style="min-width:0"><b>${esc(f.name)}</b><span class="muted">${f.dir ? '文件夹' : B(f.size)} · ${ts(f.mtime)} · ${esc(f.mode)}${f.link ? ' · 链接' : ''}</span></div></div><span class="muted">›</span></button>`).join('') : '<div class="empty">空文件夹</div>');
}
function fmGo(p) { fmPath = p; refresh(); }
$('fmCrumb').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) fmGo(b.dataset.p); };
$('fmList').onclick = (e) => {
	if (e.target.closest('[data-up]')) return fmGo(fmPath.replace(/\/[^/]+$/, '') || '/');
	const b = e.target.closest('[data-f]'); if (!b) return;
	const f = fmItems[+b.dataset.f];
	if (f.dir) return fmGo(fmJoin(fmPath, f.name));
	fmSheet(f);
};
async function fmSheet(f) {
	const p = fmJoin(fmPath, f.name);
	const v = await modal(`<div class="sheethead"><h3 class="ell">${esc(f.name)}</h3><button class="btn sm" data-v="close">关闭</button></div>
		<div class="kv"><span>位置</span><span class="mono">${esc(p)}</span></div><div class="kv"><span>大小</span><span>${B(f.size)}</span></div><div class="kv"><span>修改时间</span><span>${ts(f.mtime)}</span></div><div class="kv"><span>权限</span><span class="mono">${esc(f.mode)}</span></div>
		<div class="btngrid"><button class="btn blue" data-v="edit">查看 / 编辑</button><button class="btn" data-v="dl">下载到手机</button><button class="btn" data-v="ren">改名 / 移动</button><button class="btn" data-v="cp">复制</button><button class="btn" data-v="mod">改权限</button><button class="btn danger" data-v="del">删除</button></div>`);
	if (v === 'edit') return fmEdit(p);
	if (v === 'dl') return busy(null, async () => { const r = await P('fs_download', { path: p }, 90000); download(r.url, r.name); toast('开始下载'); });
	if (v === 'ren') { const to = await promptBox('改名 / 移动到', '新的完整路径', p); if (to && to !== p) busy(null, async () => { await P('fs_rename', { path: p, to }); toast('已完成'); refresh(true); }); }
	if (v === 'cp') { const to = await promptBox('复制到', '新的完整路径', p + '.bak'); if (to) busy(null, async () => { await P('fs_copy', { path: p, to }); toast('已复制'); refresh(true); }); }
	if (v === 'mod') { const m = await promptBox('改权限', '例如 644 或 755', f.mode); if (m) busy(null, async () => { await P('fs_chmod', { path: p, mode: m }); toast('已修改'); refresh(true); }); }
	if (v === 'del') { if (await confirmBox('删除 ' + f.name, p + '\n删除后不能恢复。', '删除', true)) busy(null, async () => { await P('fs_delete', { path: p }); toast('已删除'); refresh(true); }); }
}
async function fmEdit(p) {
	let r;
	try { toast('读取中…'); r = await P('fs_read', { path: p }); toastHide(); } catch (e) { return handleErr(e); }
	if (r.binary) return toast('这是二进制文件，不能直接编辑，可以下载到手机', true);
	if (r.toobig) return toast('文件超过 2MB，手机上不方便编辑，可以下载', true);
	await modal(`<div class="sheethead"><h3 class="ell">${esc(p.split('/').pop())}</h3><button class="btn sm" data-v="false">取消</button></div>
		<div class="muted mono ell" style="margin-bottom:6px">${esc(p)}</div>
		<textarea class="input" data-t spellcheck="false" autocapitalize="off" style="min-height:55vh">${esc(r.content)}</textarea>
		<div class="muted" style="margin-top:6px">${B(r.size)} · 保存前会自动备份旧版本到 /etc/claude-mcp/bak</div>
		<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-v="false">取消</button><button class="btn primary" data-s>保存</button></div>`,
	(m, close) => {
		m.dataset.lock = '1';
		const s = m.querySelector('[data-s]');
		s.onclick = () => busy(s, async () => { await P('fs_write', { path: p, content: m.querySelector('[data-t]').value, overwrite: true }); close(true); toast('已保存'); refresh(true); });
	});
}
$('fmNewFile').onclick = async () => { const n = await promptBox('新建文件', '文件名'); if (n) busy(null, async () => { const p = fmJoin(fmPath, n); await P('fs_write', { path: p, content: '', create: true }); refresh(true); fmEdit(p); }); };
$('fmNewDir').onclick = async () => { const n = await promptBox('新建文件夹', '文件夹名'); if (n) busy(null, async () => { await P('fs_mkdir', { path: fmJoin(fmPath, n) }); toast('已新建'); refresh(true); }); };
$('fmUpload').onclick = async () => {
	const f = await pickFile(''); if (!f) return;
	if (f.size > 2.9 * 1024 * 1024) return toast('手机上传限 3MB 以内', true);
	const p = fmJoin(fmPath, f.name), exists = fmItems.some((x) => x.name === f.name);
	if (exists && !(await confirmBox('覆盖 ' + f.name, '这个文件夹里已经有同名文件，覆盖前会自动备份旧文件。', '覆盖', true))) return;
	busy($('fmUpload'), async () => { await P('fs_write', { path: p, b64: await readB64(f), overwrite: true }, 90000); toast('已上传 ' + f.name); refresh(true); }, '上传中');
};
$('fmGoto').onclick = async () => { const p = await promptBox('跳到路径', '例如 /etc/config', fmPath); if (p) fmGo(p); };
let conns = [], cnQuick = '';
async function loadConn() {
	const f = $('cnFilter').value.trim();
	const r = await P('connections', { filter: f });
	setStatus(true, '在线');
	conns = (r.connections || []).filter((c) => !cnQuick || (cnQuick === 'direct') === (c.chain[0] === 'DIRECT'));
	$('cnCount').textContent = (f || cnQuick ? `${conns.length} / ` : '') + r.total + ' 个';
	if (!conns.length) { $('cnList').innerHTML = '<div class="empty">没有连接</div>'; return; }
	$('cnList').innerHTML = conns.map((c, i) => {
		const last = c.chain[0] || '', direct = last === 'DIRECT';
		return `<button class="file" data-i="${i}"><div style="flex:1"><b>${esc(c.host)}<span class="muted" style="font-weight:500">:${esc(c.port)}</span></b><span class="sub" style="display:block;font-size:12.5px">${esc(c.src_name || c.src)} · ${esc(c.rule)}</span></div>
			<div style="text-align:right;flex:none;max-width:44%"><span class="pill ${direct ? '' : 'blue'}">${esc(direct ? '直连' : last)}</span><div class="muted" style="margin-top:4px;font-variant-numeric:tabular-nums">↓${B(c.dl)} ↑${B(c.ul)}</div></div></button>`;
	}).join('');
}
let ft;
$('cnFilter').addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(() => refresh(true), 400); });
$$('#cnChips .chip').forEach((b) => (b.onclick = () => { cnQuick = b.dataset.q; $$('#cnChips .chip').forEach((x) => x.classList.toggle('on', x === b)); refresh(true); }));
$('cnList').addEventListener('click', async (e) => {
	const b = e.target.closest('[data-i]'); if (!b) return;
	const c = conns[+b.dataset.i];
	const rows = [['来源设备', c.src_name ? `${c.src_name}（${c.src}）` : c.src], ['协议', c.net], ['命中规则', c.rule], ['代理链', c.chain.slice().reverse().join(' → ')], ['流量', `下载 ${B(c.dl)} · 上传 ${B(c.ul)}`], c.start ? ['开始时间', new Date(c.start).toLocaleString('zh-CN', { hour12: false })] : null].filter(Boolean);
	const v = await modal(`<h3>${esc(c.host)}:${esc(c.port)}</h3>${rows.map(([k, x]) => `<div class="kv"><span>${esc(k)}</span><span>${esc(x)}</span></div>`).join('')}
		<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-v="false">关闭</button><button class="btn danger" data-v="true">断开这个连接</button></div>`);
	if (v === true) await busy(null, async () => { await tool('close_connections', { id: c.id }); toast('已断开'); refresh(true); });
});

async function show(title, fn) {
	toast('读取中…');
	try { const t = await fn(); toastHide(); await textBox(title, t); } catch (e) { handleErr(e); }
}
const T = {
	system_info: () => show('系统信息', () => tool('system_info')),
	network_info: () => show('网络信息', () => tool('network_info')),
	firewall_overview: () => show('防火墙', () => tool('firewall_overview')),
	async system_log() { const kw = await promptBox('系统日志', '关键字，留空看最新 120 行，如 pppoe'); if (kw !== null) show('系统日志', () => tool('system_log', { filter: kw || undefined, lines: 120 })); },
	async services() {
		let text;
		try { toast('读取中…'); text = await tool('list_services'); toastHide(); } catch (e) { return handleErr(e); }
		const rows = text.split('\n').slice(1).map((l) => l.split(' | ')).filter((p) => p.length >= 3);
		modal(`<div class="sheethead"><h3>服务管理</h3><button class="btn sm" data-v="close">关闭</button></div>
			<input class="input" placeholder="搜索服务" autocapitalize="off" spellcheck="false">
			<div style="margin-top:6px">${rows.map((p) => { const on = p[2] === '运行中', self = p[0] === 'claude-mcp'; return `<div class="file" data-s="${esc(p[0])}"><div style="display:flex;align-items:center;gap:10px;min-width:0"><i class="dot ${on ? 'on' : ''}"></i><div style="min-width:0"><b>${esc(p[0])}</b><span class="muted">${p[1] === '是' ? '开机自启' : '不自启'}${on ? ' · 运行中' : ''}</span></div></div>
				<div class="actions" style="flex-wrap:nowrap"><button class="btn sm" data-a="restart">重启</button>${self ? '' : `<button class="btn sm ${on ? 'danger' : 'good'}" data-a="${on ? 'stop' : 'start'}">${on ? '停止' : '启动'}</button>`}</div></div>`; }).join('')}</div>`,
		(m) => {
			m.querySelector('input').oninput = (e) => { const k = e.target.value.toLowerCase(); $$('[data-s]', m).forEach((r) => r.classList.toggle('hidden', !r.dataset.s.toLowerCase().includes(k))); };
			$$('[data-a]', m).forEach((b) => (b.onclick = async () => {
				const name = b.closest('[data-s]').dataset.s, a = b.dataset.a;
				const label = { restart: '重启', stop: '停止', start: '启动' }[a];
				const risky = ['network', 'firewall', 'openclash', 'dnsmasq', 'odhcpd', 'uhttpd'].includes(name);
				if (!(await confirmBox(`${label} ${name}`, risky ? '这个服务和上网有关，操作期间网络会短暂中断。' : `确定要${label}这个服务吗？`, label, a === 'stop'))) return;
				await busy(b, async () => toast((await tool('service_control', { name, action: a })).split('\n')[0]));
			}));
		});
	},
	theme() { document.documentElement.classList.toggle('dark'); store.set('rp_dark', document.documentElement.classList.contains('dark') ? '1' : '0'); themeLabel(); rpBar(); },
	async reboot() {
		if (!(await confirmBox('重启路由器', '全家断网约 1–3 分钟，期间这个面板也无法使用。', '重启', true))) return;
		if (!(await confirmBox('再确认一次', '确定现在重启路由器吗？', '确定重启', true))) return;
		try { await tool('reboot_router', { confirm: true }); setStatus(false, '重启中'); toast('路由器正在重启，约 2 分钟后自动重连'); setTimeout(() => refresh(true), 120000); } catch (e) { handleErr(e); }
	},
	async lock() { lockSettings(); },
	look() { lookSettings(); },
	addphone() { addPhone(); },
	widget() { widgetAdd(); },
	rotatekey() { rotateKey(); },
	svc() { svcSheet(); },
	ckey() { ckeySheet(); },
	compat() { compatSheet(); },
	update() { updSheet(); },
	hubbind() { hubBind(); },
	logout() { signOut(); },
	feedback() { feedbackSheet(); },
};
$$('[data-t]').forEach((b) => (b.onclick = () => T[b.dataset.t]()));
// 问题反馈 / 建议：托管版直接发给开发者（管理页能看到、有邮件提醒）；自建版打开 GitHub 提问题
// 截图压缩成 JPEG（最长边 1600，太大再降画质），手机、电脑的浏览器和安卓 App 都能用
async function shrinkImg(file, lim) {
	lim = lim || 1.3e6;
	if (!imgFile(file)) throw new Error('只能选图片');
	const { img, done } = await imgOpen(file, '这种图片格式打不开，换成 JPG 或 PNG 截图试试');
	try {
		const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
		const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
		const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
		let q = 0.82, d = c.toDataURL('image/jpeg', q);
		while (d.length > lim && q > 0.3) { q -= 0.12; d = c.toDataURL('image/jpeg', q); }
		if (d.length > Math.max(lim * 1.4, 1.2e6)) throw new Error('图片太大了，换一张试试');
		return d;
	} catch (e) { throw /^图片太大/.test(e.message) ? e : new Error('这张图片处理不了，换一张试试'); } finally { done(); }
}
// 问题反馈 / 建议：托管版直接发给开发者（管理页能看到、有邮件提醒）；自建版打开 GitHub 提问题
async function feedbackSheet(prefill) {
	let dg = '', hosted = true;
	try { const r = await P('feedback_diag', {}, 15000); dg = r.text || ''; hosted = r.hosted !== false; } catch (e) {}
	// 6.0 第 67 项：托管版要登录着官网账号才能反馈（用应急登录码进来的，先从官网打开面板）
	if (hosted && store.get('rp_dev') && ME_ROLE.emerg) return toast('先从官网「我的路由器」打开面板再反馈：' + (ME_ROLE.lanin ? '在家里局域网直接登录的' : '用应急登录码进来的') + '设备不能发反馈', true);
	// 5.2：托管服务开了文件存储才显示「添加视频或文件」（老的缓存里没有这一项，就问一次）
	if (hosted && !(SVC && 'files' in SVC)) await svcLoad(false);
	const IM = [];
	modal(`<div class="sheethead"><h3>问题反馈 / 建议</h3><button class="btn sm" data-v="close">关闭</button></div>
		<p class="muted" style="margin:0 0 8px;font-size:13px;line-height:1.6">遇到什么问题、想要什么功能，写下来就行。</p>
		<textarea class="input" data-tx rows="6" maxlength="2000" placeholder="比如：点「一键更新」以后一直停在「准备更新」……" style="resize:vertical;min-height:120px">${esc(typeof prefill === 'string' ? prefill : '')}</textarea>
		<div class="fbims" data-ims></div>
		${hosted ? `<label class="btn fbadd" data-addw><input type="file" accept="image/*,.heic,.heif" multiple data-file style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"><span data-addt>＋ 添加截图（最多 3 张）</span></label>` : '<p class="muted" style="font-size:12.5px;margin:8px 0 0">自建版会打开 GitHub 提问题页，截图在那个页面里直接粘贴或拖进去。</p>'}
		${hosted && SVC && SVC.files ? `<div class="atts hidden" data-atts style="margin-top:8px"></div><label class="btn fbadd"><input type="file" multiple data-any style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"><span>＋ 添加视频或文件（200MB 以内）</span></label>` : ''}
		${hosted && ME && ME.me && ME.me.email ? `<div class="kv fbmail"><span>处理进度发到</span><span>${esc(ME.me.email)}<i>账号邮箱，不能改</i></span></div>` : ''}
		<input class="input" data-ct maxlength="80" placeholder="其他联系方式（选填）：微信、QQ" style="margin-top:8px" autocapitalize="off" spellcheck="false">
		<label class="kv aswon" style="margin-top:6px"><span><b>附上路由器信息</b><span class="muted">方便查问题，只有下面这些，不含密钥和网址</span></span><span class="sw"><input type="checkbox" data-dg checked><i></i></span></label>
		${dg ? `<pre class="out" style="font-size:11.5px;max-height:120px;overflow:auto;margin:6px 0 0">${esc(dg)}</pre>` : ''}
		<div class="btngrid" style="margin:12px 0 0;grid-template-columns:1fr"><button class="btn primary" data-go>发送</button></div>`, (m, close) => {
		const go = m.querySelector('[data-go]'), tx = m.querySelector('[data-tx]'), box = m.querySelector('[data-ims]'), fi = m.querySelector('[data-file]'), aw = m.querySelector('[data-addw]');
		const FA = m.querySelector('[data-atts]') ? attList(m.querySelector('[data-atts]'), 'fb', 5) : null, fa = m.querySelector('[data-any]');
		if (fa) fa.onchange = () => { if (fa.files && fa.files.length) FA.add(fa.files); fa.value = ''; };
		const draw = () => {
			box.innerHTML = IM.map((d, i) => `<div class="fbim"><img src="${d}" alt="截图 ${i + 1}"><button type="button" data-rm="${i}" aria-label="删掉这张">×</button></div>`).join('');
			if (aw) { aw.classList.toggle('hidden', IM.length >= 3); aw.querySelector('[data-addt]').textContent = IM.length ? `＋ 再加一张（已添加 ${IM.length} / 3 张）` : '＋ 添加截图（最多 3 张）'; }
		};
		box.onclick = (e) => { const r = e.target.closest('[data-rm]'); if (r) { IM.splice(+r.dataset.rm, 1); draw(); } };
		if (fi) fi.onchange = async () => {
			const all = [...(fi.files || [])], files = all.slice(0, 3 - IM.length); fi.value = '';
			if (!all.length) return toast('没有选到图片，换一个相册再试试', true);
			const at = aw && aw.querySelector('[data-addt]'); if (at) at.textContent = '正在处理图片…';
			let n = 0;
			for (const f of files) { try { IM.push(await shrinkImg(f)); n++; draw(); } catch (e) { toast(e.message, true); } }
			draw();
			if (n) toast(`已添加 ${n} 张截图` + (all.length > files.length ? '（最多 3 张，多的没加）' : ''));
		};
		setTimeout(() => tx.focus(), 80);
		go.onclick = () => busy(go, async () => {
			if (FA && FA.busy()) await FA.wait();
			if (FA && FA.bad()) throw new Error('有文件没传上：点 × 去掉它再发');
			const r = await P('feedback', { text: tx.value, contact: m.querySelector('[data-ct]').value, diag: m.querySelector('[data-dg]').checked, images: hosted ? IM : [], files: FA ? FA.ids() : [] }, 90000);
			close(true);
			if (r.sent === 'github') { window.open(r.url, '_blank', 'noopener'); toast('已打开 GitHub，登录后点「Submit」就发出去了'); }
			else if (r.code) fbSent(r);
			else toast('已发送' + (r.images ? '（带 ' + r.images + ' 张截图）' : '') + '，谢谢！开发者会尽快看');
		}, '发送中');
	});
}
// 退出登录：清掉这台手机上的密钥；托管版顺便让路由器忘掉这台手机（下次要重新输登录码）
async function signOut() {
	const dev = !!store.get('rp_dev');
	if (!(await confirmBox('退出登录', (isHosted() ? '这台手机退出面板，下次要从官网「我的路由器」重新打开' : '这台手机退出面板，下次打开要重新粘贴登录地址') + '。路由器上的设置不受影响。', '退出登录', true))) return;
	if (dev) { try { await rpcOnce('panel/device_remove', { self: true }, 8000); } catch (e) {} }
	store.del('rp_dev');
	sideOpen(false);
	logout('');
	toast('已退出登录');
}
$('sideOut').onclick = () => signOut();
$('sideFb').onclick = () => { sideOpen(false); feedbackSheet(); };
$('mFb').onclick = () => feedbackSheet();
function themeLabel() { $('themeState').textContent = document.documentElement.classList.contains('dark') ? '已开启' : '已关闭'; lookLabel(); }

/* ---------- 主题与背景：玻璃效果、背景（预设或相册里的图），只保存在这台手机上 ---------- */
const WALLS = [['mist', '晨雾'], ['night', '星空'], ['aurora', '极光'], ['ocean', '海洋'], ['sunset', '日落'], ['mint', '薄荷'], ['sakura', '樱花'], ['graphite', '石墨']];
const LOOK = {
	// 6.0 起默认不开玻璃效果（用户 11/26 选了「石墨」纯色风格，彩色壁纸默认不用，设置里还能打开）
	glass() { return store.get('rp_glass') === '1'; },
	wall() { return store.get('rp_wall') || ''; },
	num(k, d) { const v = store.get(k); return v === null || !isFinite(+v) ? d : +v; },
};
function lookApply() {
	const R = document.documentElement, W = $('wall'), w = LOOK.wall();
	R.classList.toggle('glass', LOOK.glass());
	if (w) R.dataset.wall = w; else delete R.dataset.wall;
	R.style.setProperty('--wblur', LOOK.num('rp_wblur', 20) + 'px');
	R.style.setProperty('--wdim', LOOK.num('rp_wdim', 0) / 100);
	rpBar();
	const img = w === 'photo' ? store.get('rp_wallimg') : null;
	if (img) W.style.setProperty('--wimg', `url("${img}")`); else W.style.removeProperty('--wimg');
	// 以前选的相册图片还没算过顶部颜色：现在补算一次
	if (img && !store.get('rp_walltop')) { const im = new Image(); im.onload = () => { try { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); store.set('rp_walltop', imgTop(c)); rpBar(); } catch (e) {} }; im.src = img; }
	lookLabel();
}
function lookLabel() {
	const el = $('lookState'); if (!el) return;
	const w = LOOK.wall(), n = w === 'photo' ? '我的图片' : (WALLS.find((x) => x[0] === w) || [0, document.documentElement.classList.contains('dark') ? '星空' : '晨雾'])[1];
	el.textContent = LOOK.glass() ? '玻璃 · ' + n : '简洁';
}
// 图片铺满手机屏幕时（居中裁切），最上面那一条的平均颜色：给状态栏用
function imgTop(c) {
	const sw = Math.min(c.width, c.height * innerWidth / innerHeight), x0 = (c.width - sw) / 2, hh = Math.max(1, Math.round(sw * innerHeight / innerWidth * .04));
	const y0 = Math.max(0, Math.round((c.height - sw * innerHeight / innerWidth) / 2));
	const t = document.createElement('canvas'); t.width = 16; t.height = 1;
	t.getContext('2d').drawImage(c, x0, y0, sw, hh, 0, 0, 16, 1);
	const p = t.getContext('2d').getImageData(0, 0, 16, 1).data; let r = 0, g = 0, b = 0;
	for (let i = 0; i < 64; i += 4) { r += p[i]; g += p[i + 1]; b += p[i + 2]; }
	return '#' + [r, g, b].map((v) => Math.round(v / 16).toString(16).padStart(2, '0')).join('');
}
// 相册里的图：缩小后存成 JPEG（太大存不下就再缩）
async function wallFromFile(f) {
	if (!imgFile(f)) throw new Error('请选一张图片');
	const { img, done } = await imgOpen(f, '读不了这张图片，换一张试试');
	try {
		for (const [max, q] of [[1600, 0.85], [1200, 0.8], [900, 0.75]]) {
			const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
			const c = document.createElement('canvas');
			c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
			c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
			const d = c.toDataURL('image/jpeg', q);
			try { localStorage.setItem('rp_wallimg', d); localStorage.setItem('rp_walltop', imgTop(c)); return; } catch (e) {}
		}
		throw new Error('图片太大，这台手机存不下，换一张试试');
	} finally { done(); }
}
function lookSettings() {
	const ICON_ADD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
	const body = () => {
		const w = LOOK.wall() || (document.documentElement.classList.contains('dark') ? 'night' : 'mist'), img = store.get('rp_wallimg');
		return `<div class="sheethead"><h3>主题与背景</h3><button class="btn sm" data-v="close">完成</button></div>
		<div class="${LOOK.glass() ? '' : 'lookoff'}" data-lbody>
		<label class="kv aswon"><span><b>玻璃效果</b><span class="muted">卡片、顶栏、菜单变成半透明磨砂玻璃，透出下面的背景。手机比较卡的话可以关掉，换回简洁样式</span></span><span class="sw"><input type="checkbox" data-lg ${LOOK.glass() ? 'checked' : ''}><i></i></span></label>
		<div class="subhd" style="border-top:0;padding-top:0;margin-top:10px">背景</div>
		<div class="wgrid">${WALLS.map(([k, n]) => `<button class="wtile ${w === k ? 'on' : ''}" data-w="${k}"><i class="wp-${k}"></i><span>${n}</span></button>`).join('')}
		${img ? `<button class="wtile ${w === 'photo' ? 'on' : ''}" data-w="photo"><i style="background-image:url('${img}')"></i><span>我的图片</span></button>` : ''}
		<button class="wtile add" data-pick><i>${ICON_ADD}</i><span>${img ? '换一张' : '从相册选'}</span></button></div>
		<input type="file" accept="image/*,.heic,.heif" hidden data-file>
		<div class="wsl"><span>背景模糊</span><input type="range" min="0" max="40" step="1" value="${LOOK.num('rp_wblur', 20)}" data-blur><b data-bv>${LOOK.num('rp_wblur', 20)}</b></div>
		<div class="wsl"><span>背景变暗</span><input type="range" min="0" max="60" step="1" value="${LOOK.num('rp_wdim', 0)}" data-dim><b data-dv>${LOOK.num('rp_wdim', 0)}%</b></div>
		</div>
		<p class="muted" style="font-size:12.5px;margin:12px 0 0">背景只保存在这台手机上，不会上传到路由器；每台手机可以设不一样的。</p>
		<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-reset>恢复默认</button><button class="btn primary" data-v="close">完成</button></div>`;
	};
	modal(body(), (m) => {
		m.classList.add('clear'); // 背景实时变化，弹窗后面不压暗
		const box = m.querySelector('.modalbox');
		const redraw = () => { const st = box.scrollTop; box.innerHTML = body(); box.scrollTop = st; bind(); };
		const bind = () => {
			box.querySelector('[data-lg]').onchange = (e) => { store.set('rp_glass', e.target.checked ? '1' : '0'); lookApply(); box.querySelector('[data-lbody]').classList.toggle('lookoff', !e.target.checked); };
			box.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { store.set('rp_wall', b.dataset.w); lookApply(); box.querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('on', x === b)); }));
			const file = box.querySelector('[data-file]');
			box.querySelector('[data-pick]').onclick = () => file.click();
			file.onchange = async () => {
				const f = file.files && file.files[0]; if (!f) return;
				try { await wallFromFile(f); store.set('rp_wall', 'photo'); lookApply(); redraw(); toast('背景已换成这张图片'); }
				catch (e) { toast(e.message, true); }
			};
			const sl = (sel, key, out, unit) => { const i = box.querySelector(sel); i.oninput = () => { store.set(key, i.value); box.querySelector(out).textContent = i.value + unit; lookApply(); }; };
			sl('[data-blur]', 'rp_wblur', '[data-bv]', ''); sl('[data-dim]', 'rp_wdim', '[data-dv]', '%');
			box.querySelector('[data-reset]').onclick = () => { ['rp_glass', 'rp_wall', 'rp_wblur', 'rp_wdim', 'rp_wallimg', 'rp_walltop'].forEach((k) => store.del(k)); lookApply(); redraw(); toast('已恢复默认主题'); };
		};
		bind();
	}).then(lookLabel);
}
lookApply();

/* ---------- 二维码（qr.js 用到时才加载）：添加新手机、绑定到账号 ---------- */
function loadQr() {
	if (window.qrcode) return Promise.resolve();
	return new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'qr.js'; s.onload = ok; s.onerror = () => no(new Error('二维码组件加载失败，检查网络后再试')); document.head.appendChild(s); });
}
function qrSvg(text) { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
// 二维码先打码，点一下才显示，免得旁边的人或截图看到
function qrReveal(m) { m.querySelectorAll('.qrbox.blur').forEach((b) => (b.onclick = () => b.classList.remove('blur'))); }
async function addPhone() {
	// 托管版 5.2：新手机都从官网账号打开（扫码只是打开官网）；家里人用加入码
	if (isHosted()) {
		const hub = store.get('rp_hub') || 'https://yrlove520.com', url = hub + '/app';
		try { await loadQr(); } catch (e) { return toast(e.message, true); }
		return modal(`<div class="sheethead"><h3>在新手机上打开</h3><button class="btn sm" data-v="close">关闭</button></div>
		<p class="muted" style="margin:0 0 12px">新手机扫这个码打开官网，登录<b>你自己的</b>官网账号，在「我的路由器」里点这台路由器的「打开面板」就行，不用输任何码。</p>
		<div class="qrbox">${qrSvg(url)}</div>
		<div class="notice" style="margin-top:12px">家里人要用：让他注册自己的官网账号，${ME_ROLE.role === 'sub' ? '找主账号要一个加入码。' : '你在「我的主页 → 家人」里生成加入码发给他，他加入后能做什么由你决定。'}</div>
		<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-copy>复制官网地址</button><button class="btn primary" data-v="close">完成</button></div>`,
		(m) => { m.querySelector('[data-copy]').onclick = () => copyText(url); });
	}
	// 自建版：二维码里就是登录密钥，只在「我的主页 → 敏感信息」验证后给
	if (!sudoOn()) { toast('先在「我的主页 → 敏感信息」里验证是你本人', true); return go('me'); }
	// 6.0：手机上不再存登录密钥，扫码链接现向路由器要（确认过本人才给）
	let lk; try { lk = await secP('login_link'); } catch (e) { return toast(e.message, true); }
	const url = location.origin + location.pathname.replace(/[^/]*$/, '') + '#login=' + lk.token;
	try { await loadQr(); } catch (e) { return toast(e.message, true); }
	modal(`<div class="sheethead"><h3>添加新手机</h3><button class="btn sm" data-v="close">关闭</button></div>
	<p class="muted" style="margin:0 0 12px">用新手机的相机扫这个二维码，打开后就直接登录这个面板，不用再粘贴登录地址。${lk.pw ? '<br>这台路由器开了「登录要输路由器后台密码」：新手机打开后还要输一次路由器后台密码。' : ''}</p>
	<div class="qrbox blur">${qrSvg(url)}<span>点一下显示二维码</span></div>
	<div class="notice w" style="margin-top:12px">⚠️ 扫到这个码就等于拿到路由器的全部权限。只给自己或家人的手机扫，扫完就关掉，不要截图、不要发给别人。</div>
	<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-copy>复制链接</button><button class="btn primary" data-v="close">完成</button></div>`,
	(m) => { qrReveal(m); m.querySelector('[data-copy]').onclick = () => copyText(url); });
}
/* ---------- 一键更新：路由器上的面板和程序（App 自己的更新是另外一回事） ---------- */
let UPD = null;
/* 路由器升级后，手机里缓存的还是旧面板（面板先从缓存打开，新版下次打开才生效）：
   发现路由器上的版本跟这份面板不一样，就把缓存换成新版、自动刷新一次 */
const PANEL_VER = document.querySelector('meta[name="panel-ver"]')?.content || '';
async function refreshPanel() {
	try {
		const sw = navigator.serviceWorker, reg = sw && await sw.getRegistration();
		if (reg) {
			// sw.js 变了：装好新的（安装时会重新下载面板），等它接管
			const changed = new Promise((res) => { sw.addEventListener('controllerchange', res, { once: true }); setTimeout(res, 8000); });
			await reg.update().catch(() => {});
			if (reg.installing || reg.waiting) await changed;
			// sw.js 没变：让它重新下载一遍面板再刷新
			else if (sw.controller) await new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = res; sw.controller.postMessage({ t: 'refresh' }, [ch.port2]); setTimeout(res, 8000); });
		}
	} catch (e) {}
	location.reload();
}
function panelVerCheck(cur) {
	if (!cur || !/^\d/.test(PANEL_VER) || cur === PANEL_VER) return false;
	// 每个版本只自动刷新一次，万一没换成功也不会一直刷
	let tried = ''; try { tried = sessionStorage.getItem('rp_verfix') || ''; } catch (e) {}
	if (tried === cur) return false;
	try { sessionStorage.setItem('rp_verfix', cur); } catch (e) {}
	toast('路由器面板已更新到 v' + cur.replace(/-h(\d+)$/, ' V$1') + '，正在换成新版…');
	refreshPanel();
	return true;
}
// 6.0 第 85 项：普通新版本每个版本只弹一次小卡片。弹过（或点了「以后再说」）记在路由器上，换手机、清缓存也不再弹；
// 首页横幅跟着收起，直到发了更新的版本。必须更新不受影响：没更新前照样每次拦着
const updSeen = () => !!UPD && (UPD.seen === UPD.latest || store.get('rp_upd_seen') === UPD.latest);
// hide：点了「以后再说」才马上收起首页横幅；只是看过卡片的，这次横幅先留着（下次打开就不再出现）
function updMarkSeen(hide = true) {
	if (!UPD || !UPD.latest) return;
	if (UPD.seen !== UPD.latest) { UPD.seen = UPD.latest; store.set('rp_upd_seen', UPD.latest); P('notices_seen', { upd: UPD.latest }).catch(() => {}); }
	if (hide) $('rUpd').classList.add('hidden');
}
let updAt = 0;
// 面板一直开着（App 放后台再切回来、或者一直亮着）时，隔一会儿再查一次，这样发布了必须更新的版本也能弹出来
const updMaybe = () => { if (token && !LK.on && Date.now() - updAt > 600e3) updCheck(false); };
async function updCheck(force) {
	updAt = Date.now();
	let r;
	try { r = await P('update_check', { force: !!force }, 25000); } catch (e) { if (force) toast(e.message, true); return null; }
	if (r && typeof r === 'object' && panelVerCheck(r.pv || r.cur)) return null;
	if (!r || typeof r !== 'object' || !r.latest) return null;
	UPD = r;
	// 热补丁装过的在版本后面写「V编号」（用户 11/27：v6.0.0 V1，能看出补丁到了没有）
	const hv = UPD.hot ? ' V' + UPD.hot : '';
	$('updState').textContent = UPD.newer ? '有新版本 v' + UPD.latest + '（现在 ' + (UPD.cur ? 'v' + UPD.cur : '旧版') + '）' : 'v' + (UPD.cur || '?') + hv + ' · 已经是最新版';
	// 点了「检查更新」：路由器在后台马上查修复补丁，过 20 秒再看一次，装上了面板会自己换新
	if (force && UPD.hotq && !UPD.newer) setTimeout(() => P('update_check', { nohot: 1 }, 25000).then((x) => { if (x && typeof x === 'object') panelVerCheck(x.pv || x.cur); }).catch(() => {}), 20000);
	const later = updSeen();
	$('rUpd').classList.toggle('hidden', !UPD.newer || (later && !UPD.force));
	if (UPD.newer) {
		$('rUpdV').textContent = 'v' + UPD.latest;
		$('rUpdCur').textContent = '现在是 ' + (UPD.cur ? 'v' + UPD.cur : '旧版') + '\n设置都保留，不会断网';
		$('rUpdN').textContent = UPD.notes || '';
		// 首页只放前 3 行；「查看完整更新内容」在弹窗里能上下滑着看全
		$('rUpdLater').classList.toggle('hidden', !!UPD.force);
		// 必须更新：弹窗关不掉
		if (UPD.force && !document.querySelector('.modal[data-upd]')) { if (popBusy() && !force) UPD_WAIT = true; else updSheet(true); }
		// 普通新版本：自动检查时（不是用户自己点开的）没弹过就弹一次；有别的弹窗时等它关掉马上弹；面板锁着时先不弹
		else if (!force && !UPD.force && !later && !LK.on) { if (popBusy()) UPD_WAIT = true; else updSheet(true); }
	}
	return UPD;
}
$('rUpdGo').onclick = () => updStart();
$('rUpdMore').onclick = () => updSheet(true);
$('rUpdLater').onclick = () => updMarkSeen();
async function updSheet(forced) {
	if (!forced) { const r = await updCheck(true); if (!r) return; }
	const u = UPD;
	// 有新版本（尤其是必须更新、打开面板就弹出来的）：居中的小卡片，更新内容在卡片里上下滑，按钮一直看得到
	if (u.newer) {
		// 普通新版本：不管是自动弹的、还是点推送 / 横幅 / 检查更新打开的，看过一次就记下（每个版本只弹一次）
		if (!u.force) updMarkSeen(false);
		modal(`<div class="sheethead"><h3>${u.force ? '这个版本必须更新' : '路由器有新版本'}</h3>${u.force ? '' : '<button class="btn sm" data-v="close">关闭</button>'}</div>
		<p class="cver"><span>${esc(u.cur ? 'v' + u.cur : '旧版')}</span><span aria-hidden="true">→</span><b>${esc('v' + u.latest)}</b></p>
		<div class="cscroll"><div class="notice" style="white-space:pre-line;line-height:1.6;margin:0">${esc(u.notes || '修复了一些问题')}</div></div>
		<div class="cfoot"><p class="muted" style="font-size:12.5px;margin:0 0 10px;line-height:1.55">${u.force ? '更新后才能继续使用。' : ''}设置都保留，面板断开 10–30 秒，不会断网。</p>
		<div class="btngrid${u.force ? ' one' : ''}">${u.force ? '' : '<button class="btn" data-v="close">以后再说</button>'}<button class="btn primary" data-go>一键更新</button></div></div>`,
		(m, close) => { m.dataset.upd = 1; if (u.force) m.dataset.lock = 1; m.querySelector('[data-go]').onclick = () => { close(null); updStart(true); };
			// 卡片底部的「以后再说」：首页横幅也一起收起，直到发了更新的版本（顶部的「关闭」只关卡片）
			const lt = m.querySelector('.cfoot [data-v="close"]'); if (lt) lt.addEventListener('click', () => updMarkSeen(true)); }, { compact: true });
		return;
	}
	modal(`<div class="sheethead"><h3>检查更新</h3><button class="btn sm" data-v="close">关闭</button></div>
	<div class="kv"><span>现在的版本</span><b>${esc(u.cur ? 'v' + u.cur : '旧版（没有记录版本号）')}${u.ahead ? ' <span class="pill">尝鲜版</span>' : ''}</b></div>
	<div class="kv"><span>最新正式版</span><b>${esc('v' + u.latest)}</b></div>
	${'auto' in u ? `<div class="kv cpk" style="margin-top:12px"><div><b>必须更新自动装</b><span class="muted">安全修复不用等你打开面板：每天夜里检查一次，只自动装「必须更新」，装不好自动退回原来的版本，装好后推送告诉你。普通更新还是你自己点。</span></div><label class="sw"><input type="checkbox" data-au${u.auto ? ' checked' : ''}${ME_ROLE.role === 'sub' ? ' disabled' : ''} aria-label="必须更新自动装"><i></i></label></div>${ME_ROLE.role === 'sub' ? '<p class="muted" style="font-size:12.5px;margin:6px 0 0">只有主账号能改。</p>' : ''}` : ''}
	${u.beta ? `<div class="notice" style="margin-top:12px;line-height:1.6">你是尝鲜用户：可以先装 <b>v${esc(u.beta.ver)}</b>（还没正式发布）。有问题随时能退回正式版。</div>` : ''}
	${u.ahead ? '<p class="muted" style="font-size:13px;margin:12px 0 0;line-height:1.6">你用的是尝鲜版，比正式版新。不好用的话可以退回正式版，设置都保留。</p>' : '<p class="muted" style="margin:12px 0 0">已经是最新的正式版了。</p>'}
	<div class="btngrid" style="margin:12px 0 0">${u.beta ? '<button class="btn primary" data-ch="beta">装尝鲜版 v' + esc(u.beta.ver) + '</button>' : u.ahead ? '<button class="btn" data-ch="stable">退回正式版 v' + esc(u.latest) + '</button>' : ''}<button class="btn${u.beta || u.ahead ? '' : ' primary'}" data-v="close">好的</button></div>`,
	(m, close) => {
		m.dataset.upd = 1;
		// 6.0 第 86 项：必须更新夜里自动装（默认开）。关掉时多问一句：安全修复会等到你自己点了才装
		const au = m.querySelector('[data-au]');
		if (au) au.onchange = async () => {
			const on = au.checked;
			if (!on && !(await confirmBox('关掉自动安装', '关掉以后，必须更新（安全修复）要等你打开面板、自己点「一键更新」才会装。确定关掉？', '关掉'))) { au.checked = true; return; }
			au.disabled = true;
			try { const r = await P('autoupd_set', { on }, 15000); UPD.auto = r.auto; au.checked = r.auto; toast(r.auto ? '已打开：必须更新会在夜里自动装好' : '已关掉：必须更新要你自己点「一键更新」'); }
			catch (e) { au.checked = !on; toast(e.message, true); }
			au.disabled = false;
		};
		m.querySelectorAll('[data-ch]').forEach((b) => (b.onclick = async () => {
			const beta = b.dataset.ch === 'beta';
			if (!(await confirmBox(beta ? '装尝鲜版' : '退回正式版', beta ? '更新到 v' + u.beta.ver + '（尝鲜版）？\n设置都保留，面板断开 10–30 秒，不会断网；装完起不来会自动退回。用着有问题，在「系统操作 → 问题反馈」里告诉我们。' : '退回正式版 v' + u.latest + '？\n' + (/^[0-5]\./.test(u.latest || '') ? '限速、上网计划和自动拉黑会停用，被暂停的设备恢复上网。\n' : '') + '设置都保留，面板断开 10–30 秒，不会断网。', beta ? '装尝鲜版' : '退回正式版'))) return;
			close(null);
			updStart(true, beta ? 'beta' : 'stable');
		}));
	});
}
// 反馈编号：一行显示编号 + 复制按钮（发送成功、收到回复时都用）
const fbCodeRow = (code) => `<div data-fbcode style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--fill);padding:10px 12px;border-radius:12px;margin-top:12px">
	<div style="min-width:0"><span class="muted" style="display:block;font-size:12.5px">反馈编号</span><b class="mono" style="font-size:17px;letter-spacing:.06em">${esc(code)}</b></div>
	<button class="btn sm" data-cc style="flex:none">复制</button></div>`;
const fbCodeBind = (m, code, close) => {
	const c = m.querySelector('[data-cc]'); if (c) c.onclick = () => copyText(code);
	const t = m.querySelector('[data-track]'); if (t) t.onclick = () => { close(null); FB_FOCUS = code; if (page === 'myfb') refresh(); else go('myfb'); };
};
// 进度条：只有三段（反馈成功 → 开发人员已收到 → 已修复；没法修的第三段是「无法修复」），补充说明写在下面
const fbSteps = (stage, nofix) => `<div class="fsteps" data-stage="${stage}" style="margin:12px 0 0;padding:12px 2px 10px;border-radius:14px;background:var(--fill)">${['反馈成功', '开发人员已收到', '已修复'].map((x, i) => { const on = i < stage, bad = on && i === 2 && nofix;
	return `<div class="${on ? (bad ? 'on bad' : 'on') : 'off'}${i === stage - 1 ? ' cur' : ''}"><i>${bad ? '✕' : on ? '✓' : i + 1}</i><b>${bad ? '无法修复' : x}</b></div>`; }).join('')}</div>`;
// 发送成功：编号能复制，能直接打开处理进度页（不用登录）
function fbSent(r) {
	modal(`<div class="sheethead"><h3>反馈已发送</h3></div>
	${fbSteps(1, false)}
	<p class="muted" style="margin:12px 0 0;line-height:1.6">谢谢！${r.images ? r.images + ' 张截图也一起发过去了。' : ''}开发者回复以后，你打开面板时会自动弹出来，不用自己去查。</p>
	${fbCodeRow(r.code)}
	<p class="muted" style="font-size:13px;margin:10px 0 0;line-height:1.6">随时可以在侧边栏「消息与帮助 → 我的反馈」里看处理到哪一步。</p>
	${r.note ? `<p class="notice" data-mailnote style="margin:10px 0 0;line-height:1.6">${esc(r.note)}。处理进度照常在「我的反馈」里看。</p>` : ''}
	<div class="btngrid" style="margin:14px 0 0"><button class="btn" data-track>查看处理进度</button><button class="btn primary" data-v="close">好的</button></div>`,
	(m, close) => { m.dataset.fbsent = 1; fbCodeBind(m, r.code, close); if (page === 'myfb') refresh(true); });
}
// 我的反馈页面
let fbAt = 0, fbTimer = 0, FB_FOCUS = '';
const FB_EV = { fixed: '已修复', nofix: '无法修复', open: '重新打开，继续处理', note: '补充说明' };
const fbWhen = (t) => new Date(t).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
// 这次进「我的反馈」时标了「新」的：在这一页上一直标着（列表每分钟刷新一次，路由器那边已经记成看过了）
const MYFB_NEW = new Set();
async function loadMyFb(quiet) {
	if (!quiet) MYFB_NEW.clear();
	const r = await P('fb_replies', { force: !quiet }, 30000);
	fbAt = Date.now();
	myfbRender(r);
}
function myfbRender(r) {
	const box = $('myfbList'); if (!box) return;
	if (r && r.hosted === false) {
		box.innerHTML = '<section class="card"><b>自建版的反馈发到 GitHub</b><p class="muted" style="margin:6px 0 0;line-height:1.6">点「发新反馈」会打开 GitHub，开发者的回复也在 GitHub 那条 issue 里看。托管版的反馈才有编号和处理进度。</p></section>';
		return;
	}
	const list = r?.list || [];
	// 自动刷新时，展开着的记录保持展开
	const opened = new Set([...box.querySelectorAll('[data-fbi]')].filter((it) => !it.querySelector('[data-histbox]')?.classList.contains('hidden')).map((it) => it.dataset.fbi));
	if (!list.length) { box.innerHTML = '<section class="card empty">还没有发过反馈。遇到问题、想要什么功能，点上面的「发新反馈」</section>'; return; }
	box.innerHTML = (r.stale ? '<div class="notice w" style="margin-bottom:12px">暂时连不上托管服务，下面是上次查到的</div>' : '') + list.map((x) => {
		const stage = Math.max(x.stage || 1, x.reply ? 2 : 1), st = x.state || (x.done ? 'fixed' : 'open');
		const pill = st === 'fixed' ? '<i class="ok">已修复</i>' : st === 'nofix' ? '<i class="bad">无法修复</i>' : stage >= 2 ? '<i>开发人员已收到</i>' : '<i class="wait">等开发人员查看</i>';
		const isNew = (x.updated && x.updated > (x.seen || 0)) || MYFB_NEW.has(x.code);
		if (isNew) MYFB_NEW.add(x.code);
		const evs = (x.history || []).map((h) => ({ ...h, n: FB_EV[h.st] || '更新' }));
		if (x.ackAt) evs.push({ at: x.ackAt, st: 'ack', n: '开发人员已收到' });
		evs.sort((a, b) => b.at - a.at); evs.push({ at: x.at, st: 'sent', n: '反馈成功' });
		return `<section class="card fbitem" data-fbi="${esc(x.code)}">
			<div class="fbhd"><span class="fbpill">${pill}${isNew ? '<em>新</em>' : ''}</span><span>${esc(fbWhen(x.at))}</span></div>
			${x.text ? `<p class="fbtext">${esc(x.text)}</p>` : ''}
			${fbSteps(stage, st === 'nofix')}
			${fbCodeRow(x.code)}
			<div class="btngrid" style="margin:10px 0 0"><button class="btn" data-hist>${opened.has(x.code) ? '收起记录' : '完整记录（' + evs.length + '）'}</button>${x.track ? '<button class="btn" data-web>在网页上看</button>' : ''}</div>
			<div class="${opened.has(x.code) ? '' : 'hidden'}" data-histbox style="margin-top:6px">${evs.map((e) => `<div class="fbev ${esc(e.st)}"><b>${esc(e.n)}</b><time>${esc(fbWhen(e.at))}</time>${e.note ? `<p>${esc(e.note)}</p>` : ''}</div>`).join('')}</div>
		</section>`;
	}).join('');
	box._list = list;
	// 在这一页看到了：有新进展的记成看过（不会再弹窗）
	for (const x of list) if (x.updated && x.updated > (x.seen || 0)) { x.seen = x.updated; P('fb_seen', { code: x.code, updated: x.updated, done: x.done || x.nofix ? 1 : 0 }).catch(() => {}); }
	// 从弹窗点「查看完整记录」过来的：展开那一条、滚过去
	if (FB_FOCUS) {
		const it = box.querySelector(`[data-fbi="${CSS.escape(FB_FOCUS)}"]`); FB_FOCUS = '';
		if (it) { it.classList.add('hl'); it.querySelector('[data-histbox]').classList.remove('hidden'); it.querySelector('[data-hist]').textContent = '收起记录'; setTimeout(() => it.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); setTimeout(() => it.classList.remove('hl'), 2600); }
	}
}
$('myfbNew').onclick = () => feedbackSheet();
$('myfbList').onclick = (e) => {
	const it = e.target.closest('[data-fbi]'); if (!it) return;
	const code = it.dataset.fbi, x = ($('myfbList')._list || []).find((y) => y.code === code) || {};
	if (e.target.closest('[data-cc]')) return copyText(code);
	if (e.target.closest('[data-web]') && x.track) return window.open(x.track, '_blank', 'noopener');
	const h = e.target.closest('[data-hist]');
	if (h) { const b = it.querySelector('[data-histbox]'); const open = b.classList.toggle('hidden') === false; h.textContent = open ? '收起记录' : '完整记录（' + b.children.length + '）'; }
};
/* ---------- 通知（4.0）：路由器的故障/自动修复、云端监测、托管服务、公告、版本更新、反馈进度、开发者的回复，一个入口 ----------
   路由器那边一次给：断线记录、公告、反馈进度、开发者有没有新回复、看到哪儿了（notices.seen，换手机也一样）；云端的面板自己去拿 */
const NT = { d: null, at: 0, f: 'all', view: null, n: 0, more: 0 };
try { NT.d = JSON.parse(store.get('rp_nt') || 'null'); } catch (e) {}
const APP_VER = (navigator.userAgent.match(/RouterPanelApp\/([\d.]+)/) || [])[1] || '';
const ntMs = (v) => typeof v === 'number' ? (v < 1e11 ? v * 1000 : v) : Date.parse(v || '') || 0;
const verNewer = (a, b) => { const x = String(a || '').replace(/^v/, '').split('.').map((n) => +n || 0), y = String(b || '').replace(/^v/, '').split('.').map((n) => +n || 0); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
const NT_IC = {
	sys: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>', ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.4 9.6 4.5 4.5 0 0 0 7 18.5z"/>',
	svc: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>', ann: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16.5 9a4 4 0 0 1 0 6"/>',
	upd: '<path d="M12 16V5M7.5 9.5 12 5l4.5 4.5"/><path d="M5 19h14"/>', fb: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M10 12l1.8 1.8L15 10.5"/>',
	chat: '<path d="M5 18.5V7a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 7v6.5a2.5 2.5 0 0 1-2.5 2.5H8.5z"/><path d="M9 9.5h6M9 12.5h3.5"/>',
	bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2.2H4.4z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/>',
};
const ntSvg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NT_IC[k] || NT_IC.bell}</svg>`;
function ntItems() {
	const d = NT.d || {}, L = [];
	for (const e of d.events || []) L.push({ c: 'sys', ic: e.lvl === 'ok' ? 'ok' : 'sys', t: ntMs(e.t), lvl: e.lvl || 'info', title: e.msg || '', body: e.detail || '', src: '路由器', kind: e.kind || '', go: 'wd', k: 'e' + e.t + e.kind });
	if (cloud) {
		for (const e of cloud.events || []) L.push({ c: 'sys', ic: 'cloud', t: e.t, lvl: e.lvl || 'info', title: e.msg || '', body: e.detail || '', src: '云端监测', kind: 'cloud', go: 'wd', k: 'c' + e.t });
		for (const x of cloud.notes || []) L.push({ c: 'sys', ic: 'svc', t: x.t, lvl: x.lvl || 'info', title: String(x.title || '').replace(/^[\u2600-\u27bf\u{1f300}-\u{1faff}\ufe0f\s]+/u, ''), body: x.body || '', src: x.tag === 'svc' ? '托管服务' : '云端', tag: x.tag === 'svc' ? '托管' : '', k: 'n' + x.t });
	}
	// 横幅只有内容（官网用内容第一行当标题）：正文去掉跟标题一样的第一行，不重复
	const banBody = (a) => { const b = a.body || '', ls = b.split('\n'); return a.level === 'banner' && ls[0].trim() === a.title ? ls.slice(1).join('\n').trim() : b; };
	for (const a of d.ann || []) L.push({ c: 'ann', ic: 'ann', t: a.upd || a.at, lvl: a.level === 'important' ? 'warn' : 'info', title: a.title, body: banBody(a), src: a.level === 'important' ? '重要公告' : '公告', tag: a.level === 'important' ? '重要' : '公告', imp: a.level === 'important', ann: a, k: 'a' + a.id });
	if (UPD && UPD.newer) L.push({ c: 'upd', ic: 'upd', t: ntMs(UPD.rel), lvl: UPD.force ? 'warn' : 'info', title: '新版本 v' + UPD.latest, body: UPD.notes || '', src: '版本更新', upd: 'router', force: !!UPD.force, k: 'u' + UPD.latest });
	if (APP_VER && d.app && d.app.version && verNewer(d.app.version, APP_VER)) L.push({ c: 'upd', ic: 'upd', t: ntMs(d.app.rel), lvl: 'info', title: 'App 新版本 ' + d.app.version, body: (d.app.notes || '') + '（现在是 ' + APP_VER + '）', src: '版本更新', upd: 'app', k: 'p' + d.app.version });
	for (const x of d.fb || []) {
		const evs = (x.history || []).map((h) => ({ at: h.at, st: h.st, note: h.note || '' }));
		if (x.ackAt) evs.push({ at: x.ackAt, st: 'ack', note: '' });
		for (const e of evs) L.push({ c: 'fb', ic: 'fb', t: e.at, lvl: e.st === 'fixed' ? 'ok' : e.st === 'nofix' ? 'err' : 'info', title: '反馈 ' + x.code + ' ' + (e.st === 'ack' ? '开发者已收到' : FB_EV[e.st] || '有新进展'), body: e.note ? '开发者：' + e.note : x.text || '', src: '反馈进度', tag: '反馈', fb: x.code, k: 'f' + x.code + e.at });
	}
	const ch = d.chat;
	if (ch && ch.uu > 0) L.push({ c: 'fb', ic: 'chat', t: ntMs(ch.at), lvl: 'info', title: '开发者回复了你', body: ch.uu + ' 条没看', src: '实时对话', go: 'chat', k: 'ch' + ch.seq });
	return L.filter((x) => x.title).sort((a, b) => b.t - a.t);
}
const ntSeenT = () => +(NT.d && NT.d.seen && NT.d.seen.t) || 0;
const chUnread = () => (page === 'chat' ? 0 : +(NT.d && NT.d.chat && NT.d.chat.uu) || 0);
function ntBadge() {
	const t = ntSeenT(), n = page === 'notice' ? 0 : ntItems().filter((x) => x.t > t && x.go !== 'chat').length + chUnread();
	NT.n = n;
	const b = $('bellN'); if (b) { b.textContent = n > 99 ? '99+' : String(n); b.classList.toggle('hidden', !n); $('bellBtn').setAttribute('aria-label', n ? '通知，' + n + ' 条新的' : '通知'); }
	// 侧边栏「实时联系开发者」上的小红点
	const cu = chUnread(), nb = document.querySelector('#sidenav button[data-p="chat"]');
	if (nb) { let dot = nb.querySelector('.chdot'); if (cu && !dot) { dot = document.createElement('em'); dot.className = 'chdot'; dot.style.cssText = 'margin-left:auto;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:9px;background:var(--danger);color:#fff;font:700 10.5px/18px system-ui,sans-serif;font-style:normal;text-align:center;flex:none'; nb.appendChild(dot); } if (dot) { if (cu) dot.textContent = cu > 99 ? '99+' : cu; else dot.remove(); } }
}
async function ntFetch() {
	const cp = cloudFetch(false).catch(() => null);
	const d = await P('notices', APP_VER ? { app: 1 } : {}, 30000);
	await cp;
	NT.d = d; NT.at = Date.now(); store.set('rp_nt', JSON.stringify(d));
	return d;
}
// 定时查：铃铛上的数字；重要公告没弹过的弹一次（有别的弹窗、正在更新时先不弹）
async function ntCheck() {
	if (!token || LK.on || document.hidden) return;
	NT.at = Date.now();
	try { await ntFetch(); } catch (e) { return; }
	if (page === 'notice') return void ntRender();
	ntBadge();
	annBarDraw();
	// 有别的弹窗（新手引导、必须更新…）：等它关掉马上弹
	if (popBusy()) { NT.popWait = true; return; }
	const pop = (NT.d.seen && NT.d.seen.pop) || [];
	// 6.0 第 85 项：新装的路由器只弹开始记之前 7 天以内发的重要公告（更早的在「通知」里能翻到，不一打开就刷屏）。
	// 从老版本升上来的没有 since，照旧（弹过的都记着，不会重弹）
	const since = +(NT.d.seen && NT.d.seen.since) || 0;
	const a = (NT.d.ann || []).find((x) => x.level === 'important' && !pop.includes(x.id) && ntMs(x.at || x.upd) >= since - 7 * 864e5);
	if (a) ntAnnPop(a);
}
addEventListener('cmcp-popfree', () => { if (NT.popWait) { NT.popWait = false; setTimeout(ntCheck, 200); } if (FB_WAIT) { FB_WAIT = false; setTimeout(fbCheck, 400); } if (UPD_WAIT) { UPD_WAIT = false; setTimeout(() => updCheck(false), 300); } });
let FB_WAIT = false, UPD_WAIT = false;
// 6.0 横幅公告（官网后台发的「横幅」级别）：面板顶上一条，不弹窗；点 × 关掉，同一条不再出（记在路由器上，换手机也算）
function annBarDraw() {
	const bar = $('annBar'); if (!bar || !NT.d) return;
	const pop = (NT.d.seen && NT.d.seen.pop) || [];
	const a = (NT.d.ann || []).find((x) => x.level === 'banner' && !pop.includes(x.id));
	bar.classList.toggle('hidden', !a);
	if (!a) return;
	// 用户 11/27：手持喇叭 + 一行滚动字幕，没有按钮；横幅只有内容没有标题，滚的就是内容（换行连成一行），一直滚，点一下去通知页看全文
	// 系统设了「减少动态效果」就不滚、换行显示。老的横幅（有标题、没内容）照样显示标题
	const txt = (a.body || a.title || '').replace(/\s*\n\s*/g, '　').trim();
	bar.innerHTML = `<svg class="abi" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 10.2v3.6c0 .7.5 1.2 1.2 1.2H6l1.1 4.4c.2.9 1 1.6 2 1.6h.3c1 0 1.7-.9 1.5-1.9L10.3 15l8.5 3.9c.8.4 1.7-.2 1.7-1.1V6.2c0-.9-.9-1.5-1.7-1.1L10 9H4.2C3.5 9 3 9.5 3 10.2z"/><rect x="21.2" y="10" width="1.8" height="4" rx=".9" fill="currentColor"/></svg><div class="abv"><div class="abt"><span>${esc(txt)}</span><span aria-hidden="true">${esc(txt)}</span></div></div>`;
	bar.classList.remove('roll');
	bar.classList.toggle('go', !!a.body);
	bar.setAttribute('aria-label', '公告：' + txt.slice(0, 200));
	requestAnimationFrame(() => {
		const v = bar.querySelector('.abv'), t = bar.querySelector('.abt>span'); if (!v || !t) return;
		// 一直滚（用户 11/27「没点开就一直滚动」，看过也照样滚）：每秒约 40 像素，最短 6 秒一圈
		const w = t.getBoundingClientRect().width, d = w + 48;
		bar.classList.add('roll');
		bar.style.setProperty('--abx', -d + 'px'); bar.style.setProperty('--abd', Math.max(6, d / 40).toFixed(1) + 's');
	});
	// 点横幅：去通知页展开这一条、滚到它（已经在通知页就不重新进这一页：原来会像刷新了一下）
	// 点横幅：直接弹出这条公告看全文（用户 11/27），不跳页面
	bar.onclick = () => { if (a.body) ntAnnView(a); };
}
let NT_FOCUS = '';
function ntFocus() {
	const k = NT_FOCUS; if (!k) return;
	const el = [...document.querySelectorAll('#ntList .ntev, #ntPin .ntact')].find((x) => x.dataset.k === k);
	if (!el) return;
	NT_FOCUS = '';
	el.classList.add('open');
	const f = el.querySelector('.ntfull, [data-pa="annfull"]'); if (f) f.textContent = '收起';
	el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
	el.classList.remove('ntfocus'); void el.offsetWidth; el.classList.add('ntfocus');
}
// 点公告（通知页里的、顶上横幅）：直接弹出这条公告（用户 11/27），居中小卡片，长的在卡片里上下滑
function ntAnnView(a) {
	if (!a) return;
	const ls = String(a.body || '').split('\n'), body = a.level === 'banner' && (ls[0] || '').trim() === a.title ? ls.slice(1).join('\n').trim() : String(a.body || '');
	const imp = a.level === 'important', acked = ((NT.d && NT.d.seen && NT.d.seen.ack) || []).includes(a.id);
	modal(`<div class="sheethead"><h3>${esc(a.title)}</h3></div>
	<p class="muted" style="font-size:13px;margin:0 0 10px">${imp ? '重要公告' : '公告'} · ${esc(fbWhen(a.at))}</p>
	<div class="cscroll">${body ? `<div class="notice" style="white-space:pre-wrap;line-height:1.65;margin:0">${esc(body)}</div>` : ''}
	${a.files && a.files.length ? `<div style="margin-top:12px">${filesHtml(a.files)}</div>` : ''}
	</div>
	<div class="cfoot"><button class="btn primary" data-v="close" style="width:100%">知道了</button></div>`,
	(m) => { m.dataset.annv = 1; if (imp && !acked) m.querySelector('[data-v="close"]').addEventListener('click', () => { ntAck(a.id); if (page === 'notice') setTimeout(ntRender, 200); }); }, { compact: true });
}
function ntAnnPop(a) {
	// 打开面板时弹出来的重要公告：居中的小卡片（不占满屏幕），长的在卡片里上下滑
	modal(`<div class="sheethead"><h3>${esc(a.title)}</h3></div>
	<p class="muted" style="font-size:13px;margin:0 0 10px">重要公告 · ${esc(fbWhen(a.at))}</p>
	<div class="cscroll">${a.body ? `<div class="notice" style="white-space:pre-wrap;line-height:1.65;margin:0">${esc(a.body)}</div>` : ''}
	${a.files && a.files.length ? `<div style="margin-top:12px">${filesHtml(a.files)}</div>` : ''}
	</div>
	<div class="cfoot"><div class="btngrid"><button class="btn" data-nt>打开通知</button><button class="btn primary" data-v="close">知道了</button></div></div>`,
	(m, close) => { m.dataset.ann = 1; m.querySelector('[data-nt]').onclick = () => { close(null); go('notice'); }; m.querySelector('[data-v="close"]').addEventListener('click', () => ntAck(a.id)); }, { compact: true });
	NT.d.seen.pop = [...((NT.d.seen && NT.d.seen.pop) || []), a.id];
	P('notices_seen', { pop: a.id }).catch(() => {});
}
async function loadNotice(quiet) {
	if (NT.d) ntRender();
	await ntFetch();
	// 进来时记下「看到哪儿了」：这次进来之前没看过的标「新」（在这一页上一直标着），铃铛清零
	if (NT.view == null) NT.view = ntSeenT();
	const top = Math.max(0, ...ntItems().filter((x) => x.go !== 'chat').map((x) => x.t));
	if (top > ntSeenT()) { NT.d.seen.t = top; P('notices_seen', { t: top }).catch(() => {}); }
	ntRender();
	ntBadge();
}
// 重要公告点了「知道了」：记在路由器上（换手机也算），从「待处理」移到时间线
function ntAck(id) {
	if (!NT.d || !NT.d.seen) return;
	const ack = NT.d.seen.ack || (NT.d.seen.ack = []);
	if (!ack.includes(id)) ack.push(id);
	P('notices_seen', { ack: id }).catch(() => {});
}
/* 6.0 第 93 项：通知页改版（用户 11/25 选的方案 A）。
   顶部：现在的状态 + 近 7 天具体出了什么事 + 7 天健康条；「待处理」放要你动手的；下面按天的时间线，同一件事「停了 → 恢复」合成一条 */
const ntDay = (t) => { if (!t) return '更早'; const x = new Date(t), n = new Date(); return x.toDateString() === n.toDateString() ? '今天' : x.toDateString() === new Date(n - 864e5).toDateString() ? '昨天' : `${x.getMonth() + 1} 月 ${x.getDate()} 日`; };
const ntHm = (t) => new Date(t).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
const ntRel = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return '刚刚'; if (s < 3600) return Math.floor(s / 60) + ' 分钟前'; if (s < 6 * 3600 && ntDay(t) === '今天') return Math.floor(s / 3600) + ' 小时前'; return ntHm(t); };
const NT_OUT = ['cloud', 'wan', 'net'];
const NT_AUTO = ['clash', 'panel', 'watchdog'];
const NT_STOPW = { cloud: '断开', wan: '断网', net: '断网', clash: '停止', panel: '没响应', tunnel: '断开', dns: '出问题' };
function ntLabel(x) {
	const K = { wan: '宽带断开', net: '外网断开', tunnel: '隧道断开', dns: 'DNS 出问题', panel: '面板服务没响应', mem: '内存不够', kernel: '内核报错', watchdog: '隧道重启' };
	if (x.kind === 'clash') return ((pxAct() || {}).name || '代理插件') + ' 停止';
	if (x.kind === 'cloud') { const h = String(x.title).split(/[：:（(]/)[0]; return h.length <= 10 ? h : '断开'; }
	return K[x.kind] || String(x.title).split(/[：:（(，,]/)[0].slice(0, 12);
}
const ntProb = (x) => x.c === 'sys' && x.kind && (x.lvl === 'err' || x.lvl === 'warn');
// 同一件事：出问题（err / warn）之后同一类的「恢复」（ok）合成一条；3 天内的才合
function ntMerge(all) {
	const asc = all.slice().sort((a, b) => a.t - b.t), open = {}, gone = new Set(), out = [];
	for (const x of asc) {
		if (x.c !== 'sys' || !x.kind) { out.push(x); continue; }
		const key = x.src + '/' + x.kind;
		if (ntProb(x)) { open[key] = x; out.push(x); continue; }
		const p = open[key];
		if (x.lvl === 'ok' && p && x.t - p.t < 3 * 864e5) {
			// 合成一条：标题写「什么事 + 多久 + 已恢复」，下面写当时的原因
			gone.add(p); delete open[key];
			const why = p.body || (String(p.title).split(/[：:]/)[1] || '').trim();
			out.push({ ...x, title: ntLabel(p) + ' ' + dur(Math.max(60, (x.t - p.t) / 1000)) + (NT_AUTO.includes(x.kind) ? '，已自动重启' : '，已恢复'), body: why, lvl: NT_OUT.includes(x.kind) && p.lvl === 'err' ? 'err' : 'ok', from: p.t, to: x.t, merged: true, kind: x.kind });
			continue;
		}
		out.push(x);
	}
	return { list: out.filter((x) => !gone.has(x)).sort((a, b) => b.t - a.t), open };
}
// 近 7 天：每天一格（红：断电断网；橙：别的问题，一般已自动修好；绿：没事）；按种类数次数
function ntWeek(all) {
	const days = [], now = new Date(); now.setHours(0, 0, 0, 0);
	for (let i = 6; i >= 0; i--) { const d = new Date(now - i * 864e5); days.push({ s: +d, e: +d + 864e5, lv: 'n', name: i === 0 ? '今天' : i === 1 ? '昨天' : '周' + '日一二三四五六'[d.getDay()], day: ntDay(+d) }); }
	const probs = all.filter((x) => ntProb(x) && x.t >= days[0].s);
	for (const x of probs) { const d = days.find((y) => x.t >= y.s && x.t < y.e); if (!d) continue; const lv = NT_OUT.includes(x.kind) && x.lvl === 'err' ? 'e' : 'w'; if (lv === 'e' || d.lv === 'n') d.lv = lv; }
	return { days, probs };
}
function ntSummary(probs, merged) {
	if (!probs.length) return '近 7 天没出问题';
	const g = new Map();
	for (const x of probs) { const l = ntLabel(x); const o = g.get(l) || { n: 0, fixed: 0, auto: NT_AUTO.includes(x.kind) }; o.n++; if (merged.some((m) => m.merged && m.from === x.t && m.kind === x.kind)) o.fixed++; g.set(l, o); }
	const lines = [...g.entries()].sort((a, b) => b[1].n - a[1].n).map(([l, o]) => `${l} ${o.n} 次` + (o.fixed === o.n ? (o.n > 1 ? '，都已' : '，已') + (o.auto ? '自动重启' : '恢复') : o.fixed ? `，${o.n - o.fixed} 次还没恢复` : ''));
	const more = lines.length > 3 ? lines.length - 2 : 0;
	const show = more ? lines.slice(0, 2).concat('还有 ' + more + ' 类问题') : lines;
	show[0] = '近 7 天' + (/^[A-Za-z0-9]/.test(show[0]) ? ' ' : '') + show[0];
	return show.map(esc).join('<br>');
}
// 「待处理」：要你动手的事
const NT_CATS = [['all', '全部'], ['ann', '公告'], ['sys', '路由器'], ['fb', '反馈']];
const ntCatOf = (x) => (x.c === 'ann' || x.ic === 'ann' ? 'ann' : x.fb || x.c === 'fb' || x.ic === 'fb' || x.ic === 'chat' ? 'fb' : x.upd || x.ic === 'upd' || x.c === 'upd' ? 'upd' : 'sys');
function ntPending(all, mg, seen) {
	const d = NT.d || {}, ack = (d.seen && d.seen.ack) || [], out = [];
	// 还没恢复的问题（一天以内、最新一条是出问题）
	for (const x of Object.values(mg.open)) if (x.lvl === 'err' && Date.now() - x.t < 864e5) out.push({ k: x.k, ic: 'sys', col: 'red', title: ntLabel(x) + '，还没恢复', body: x.title, btns: [['wd', '看断线记录', 1]] });
	const u = all.find((x) => x.upd === 'router');
	if (u && u.force) out.push({ k: u.k, ic: 'upd', col: 'red', tag: '必须更新', title: u.title, body: ntFirst(u.body), btns: [['upd', '一键更新', 1], ['updinfo', '更新内容']] });
	for (const x of all.filter((y) => y.imp && !ack.includes(y.ann.id) && Date.now() - y.t < 30 * 864e5)) out.push({ k: x.k, ic: 'ann', col: 'orange', tag: '重要', title: x.title, body: x.body, ann: x.ann, btns: [['annfull', '看全文'], ['ack', '知道了']] });
	if (u && !u.force) out.push({ k: u.k, ic: 'upd', col: 'blue', title: u.title, body: ntFirst(u.body), btns: [['upd', '一键更新', 1], ['updinfo', '更新内容']] });
	const fbs = new Map();
	for (const x of all) if (x.fb && x.t > seen && !fbs.has(x.fb)) fbs.set(x.fb, x);
	for (const x of fbs.values()) out.push({ k: x.k, ic: 'fb', col: x.lvl === 'err' ? 'red' : 'green', title: x.title, body: x.body, fb: x.fb, btns: [['fb', '查看回复']] });
	const c = all.find((x) => x.go === 'chat');
	if (c) out.push({ k: c.k, ic: 'chat', col: 'green', title: c.title, body: c.body, btns: [['chat', '去看看']] });
	const a = all.find((x) => x.upd === 'app');
	if (a) out.push({ k: a.k, ic: 'upd', col: 'blue', title: a.title, body: a.body, btns: [['app', '怎么更新']] });
	return out;
}
const ntFirst = (t) => String(t || '').split('\n').map((l) => l.replace(/^[\s•\-*·]+/, '').trim()).filter(Boolean)[0] || '';
function ntRender() {
	const box = $('ntList'); if (!box) return;
	const all = ntItems(), seen = NT.view ?? ntSeenT(), d = NT.d || {};
	const mg = ntMerge(all), wk = ntWeek(all), pk0 = ntPending(all, mg, seen), pk = new Set(pk0.map((x) => x.k));
	let pend = pk0;
	const first = !box.dataset.drawn, prev = new Set((box._items || []).map((x) => x.k));
	// 顶部
	const bad = pend.find((x) => x.ic === 'sys');
	$('ntHead').textContent = bad ? bad.title : '运行正常';
	$('ntSum').innerHTML = ntSummary(wk.probs, mg.list);
	$('ntStrip').innerHTML = `<div class="ntbars">${wk.days.map((x) => `<button class="${x.lv}" data-day="${esc(x.day)}" aria-label="${esc(x.name)}：${x.lv === 'e' ? '断电或断网' : x.lv === 'w' ? '出过问题' : '正常'}"></button>`).join('')}</div><div class="ntdays">${wk.days.map((x, i) => `<span${i === 6 ? ' class="now"' : ''}>${esc(x.name)}</span>`).join('')}</div>`;
	const cu = +(d.chat && d.chat.uu) || 0, fu = pend.filter((x) => x.fb).length;
	$('ntChatN').textContent = cu > 99 ? '99+' : cu; $('ntChatN').classList.toggle('hidden', !cu);
	$('ntFbN').textContent = fu; $('ntFbN').classList.toggle('hidden', !fu);
	// 待处理
	const pcol = { red: 'red', orange: 'orange', blue: 'blue', green: 'green' };
	// 分类（用户 11/27：通知页要有分类、公告单独看）：全部 / 公告 / 路由器 / 反馈；版本更新只在「全部」
	const F = NT_CATS.some((c) => c[0] === NT.f) ? NT.f : 'all';
	const fOk = (x) => F === 'all' || ntCatOf(x) === F;
	const cnt = {}, seenK = new Set();
	for (const x of pend.concat(mg.list)) { if (seenK.has(x.k) || x.go === 'chat') continue; seenK.add(x.k); const c = ntCatOf(x); cnt[c] = (cnt[c] || 0) + 1; }
	$('ntCats').innerHTML = NT_CATS.map(([c, t]) => { const n = c === 'all' ? 0 : cnt[c] || 0; return `<button type="button" role="tab" aria-selected="${c === F}" class="${c === F ? 'on' : ''}" data-ntc="${c}">${t}${n ? `<small>${n > 99 ? '99+' : n}</small>` : ''}</button>`; }).join('');
	const pendAll = pend; pend = pend.filter(fOk);
	$('ntPin').innerHTML = pend.length ? `<div class="ntsec"><b>待处理</b><span>${pend.length}</span></div>` + pend.map((x) => `<div class="card ntact${prev.size && !prev.has(x.k) && !first ? ' fresh' : ''}" data-k="${esc(x.k)}"><span class="ntic ${pcol[x.col]}">${ntSvg(x.ic)}</span><div class="ntab"><b>${x.tag ? `<span class="nttag ${x.col === 'red' ? 'red' : 'orange'}">${esc(x.tag)}</span>` : ''}${esc(x.title)}</b>${x.body ? `<p>${esc(x.body)}</p>` : ''}${x.ann && x.ann.files ? filesHtml(x.ann.files) : ''}<div class="ntbtns">${x.btns.map(([v, t, pri]) => `<button class="btn sm${pri ? ' primary' : ''}" data-pa="${v}">${t}</button>`).join('')}</div></div></div>`).join('') : '';
	// 时间线（待处理里的不重复放）
	const list = mg.list.filter((x) => !pk.has(x.k) && !x.upd && x.go !== 'chat' && fOk(x)), lim = 60 + NT.more;
	const opened = new Set([...box.querySelectorAll('.ntev.open')].map((x) => x.dataset.k));
	const warn = [];
	if (d.annFail) warn.push('暂时连不上官网，公告是上次取到的');
	if (!noCloud() && cloudErr) warn.push('云端的记录读不到（' + cloudErr + '）');
	let html = warn.length ? `<div class="notice w" style="margin-top:14px">${esc(warn.join('；'))}</div>` : '';
	if (!list.length) html += pend.length ? '' : `<section class="card ntempty" style="margin-top:14px">${ntSvg(F === 'ann' ? 'ann' : 'bell')}<b>${{ all: '还没有通知', ann: '还没有公告', sys: '路由器没有消息', fb: '还没有反馈' }[F]}</b></section>`;
	let cur = null, rows = [];
	const tag = (x) => x.tag ? `<span class="nttag ${x.imp || x.c === 'ann' ? 'orange' : x.fb ? 'green' : 'gray'}">${esc(x.tag)}</span>` : '';
	const flush = () => { if (rows.length) html += `<div class="ntday" data-day="${esc(cur)}">${esc(cur)}</div><section class="card ntl">${rows.join('')}</section>`; rows = []; };
	for (const x of list.slice(0, lim)) {
		const dd = ntDay(x.t); if (dd !== cur) { flush(); cur = dd; }
		const isNew = x.t > seen, dot = x.lvl === 'info' && x.c !== 'sys' ? (x.c === 'ann' ? 'warn' : x.fb ? 'ok' : 'gray') : x.lvl;
		const long = x.body && (x.body.length > 90 || x.body.split('\n').length > 3);
		rows.push(`<div class="ntev${opened.has(x.k) ? ' open' : ''}${isNew ? ' new' : ''}${prev.size && !prev.has(x.k) && !first ? ' fresh' : ''}" data-k="${esc(x.k)}" role="button" tabindex="0"><span class="ntdot ${esc(dot)}"></span><div class="ntb"><b>${tag(x)}${esc(x.title)}</b>${x.body ? `<p>${esc(x.body)}</p>` : ''}${x.merged ? `<div class="ntmg"><span class="red">${ntHm(x.from)} ${NT_STOPW[x.kind] || '出问题'}</span><span class="green">${ntHm(x.to)} 恢复</span></div>` : ''}${x.ann && x.ann.files ? filesHtml(x.ann.files) : ''}${x.c === 'ann' && long ? `<span class="ntfull">${opened.has(x.k) ? '收起' : '看全文'}</span>` : ''}</div><span class="nttm">${esc(ntRel(x.t))}</span></div>`);
	}
	flush();
	if (list.length > lim) html += `<button class="btn" data-ntmore style="width:100%;margin-top:12px">再看 ${Math.min(60, list.length - lim)} 条（共 ${list.length} 条）</button>`;
	box.innerHTML = html;
	box._items = list.concat(pend);
	box._pend = pendAll;
	// 打开这一页时：内容依次浮现一次（系统开了「减少动态效果」就不播）
	if (first) { box.dataset.drawn = 1; const pg = $('p-notice'); pg.classList.remove('ntin'); void pg.offsetWidth; pg.classList.add('ntin'); }
	ntFocus();
}
$('p-notice').querySelector('.ntqb').onclick = (e) => { const b = e.target.closest('[data-goto]'); if (b) go(b.dataset.goto); };
$('ntCats').onclick = (e) => { const b = e.target.closest('[data-ntc]'); if (!b || b.classList.contains('on')) return; NT.f = b.dataset.ntc; NT.more = 0; ntRender(); };
$('ntStrip').onclick = (e) => {
	const b = e.target.closest('[data-day]'); if (!b) return;
	const g = [...document.querySelectorAll('#ntList .ntday')].find((x) => x.dataset.day === b.dataset.day);
	if (!g) return toast(b.dataset.day === '今天' ? '今天还没有记录' : b.dataset.day + '没有记录');
	g.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
};
$('ntPin').onclick = async (e) => {
	if (e.target.closest('.files')) return;
	const b = e.target.closest('[data-pa]'), c = e.target.closest('.ntact'); if (!b || !c) return;
	const x = ($('ntList')._pend || []).find((y) => y.k === c.dataset.k); if (!x) return;
	const a = b.dataset.pa;
	if (a === 'wd') return go('wd');
	if (a === 'upd') return updStart();
	if (a === 'updinfo') return updSheet(false);
	if (a === 'app') return toast('回到 App 首页（路由器列表），会提示一键更新');
	if (a === 'fb') { FB_FOCUS = x.fb; return go('myfb'); }
	if (a === 'chat') return go('chat');
	if (a === 'annfull') return ntAnnView(x.ann);
	if (a === 'ack') {
		ntAck(x.ann.id);
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return ntRender();
		c.classList.add('gone'); setTimeout(ntRender, 260);
	}
};
$('ntList').onclick = (e) => {
	if (e.target.closest('.files')) return; // 点公告里的文件：直接打开 / 下载，不折叠
	if (e.target.closest('[data-ntmore]')) { NT.more += 60; return ntRender(); }
	const it = e.target.closest('.ntev'); if (!it) return;
	const x = ($('ntList')._items || []).find((y) => y.k === it.dataset.k); if (!x) return;
	if (x.fb) { FB_FOCUS = x.fb; return go('myfb'); }
	if (x.go) return go(x.go);
	if (x.c === 'ann' && x.ann) return ntAnnView(x.ann);
	it.classList.toggle('open');
	const f = it.querySelector('.ntfull'); if (f) f.textContent = it.classList.contains('open') ? '收起' : '看全文';
};
for (const id of ['ntList']) $(id).onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('ntev')) { e.preventDefault(); e.target.click(); } };
$('bellBtn').onclick = () => go('notice');

/* ---------- 5.2 发文件：先经路由器领上传票，再从手机直接分块传给托管服务（不经过路由器）；最大 200MB ---------- */
const FILE_MAX = 200 * 1024 * 1024;
const fmtSize = (n) => n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
const IC_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/></svg>';
function upPart(url, blob, onp) {
	return new Promise((ok, no) => {
		const x = new XMLHttpRequest(); x.open('PUT', url);
		x.upload.onprogress = (e) => onp(e.loaded);
		x.onload = () => { if (x.status === 200) return ok(); let m = ''; try { m = JSON.parse(x.responseText).error; } catch (e) {} no(Object.assign(new Error(m || '上传失败（' + x.status + '）'), { fatal: x.status === 400 || x.status === 403 })); };
		x.onerror = () => no(new Error('网络断了，没传上'));
		x.send(blob);
	});
}
async function upFile(f, ctx, onp) {
	if (!f.size) throw new Error('这是个空文件');
	if (f.size > FILE_MAX) throw new Error('太大了：最大 200MB');
	const t = await P('chat', { op: 'up', name: f.name, size: f.size, type: f.type || '', ctx }, 30000);
	let off = 0;
	for (let k = 1; k <= t.n; k++) {
		const blob = f.slice(off, off + t.part);
		for (let tries = 1; ; tries++) {
			try { await upPart(t.url + '/' + k, blob, (l) => onp((off + l) / f.size)); break; }
			catch (e) { if (e.fatal || tries >= 3) throw e; await new Promise((z) => setTimeout(z, 1500 * tries)); }
		}
		off += blob.size; onp(off / f.size);
	}
	const r = await fetch(t.url + '/done', { method: 'POST' }), j = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(j.error || '上传失败');
	return j;
}
// 一组要发的文件：选了就开始传，显示进度；发送时拿文件编号
function attList(box, ctx, max) {
	const L = [];
	const draw = () => {
		box.classList.toggle('hidden', !L.length);
		box.innerHTML = L.map((a, i) => `<div class="att"><span class="ai">${IC_FILE}</span><div class="at"><b>${esc(a.f.name)}</b><small class="${a.err ? 'bad' : ''}">${a.err ? '没传上：' + esc(a.err) : a.id ? fmtSize(a.f.size) + ' · 传好了' : fmtSize(a.f.size) + ' · 正在上传 ' + Math.floor(a.p * 100) + '%'}</small>${a.id || a.err ? '' : `<div class="bar"><i style="width:${Math.floor(a.p * 100)}%"></i></div>`}</div><button type="button" data-rm="${i}" aria-label="不发这个文件">×</button></div>`).join('');
	};
	box.onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { const a = L[+b.dataset.rm]; if (a) a.gone = true; L.splice(+b.dataset.rm, 1); draw(); } };
	return {
		add(files) {
			for (const f of [...files]) {
				if (L.length >= max) { toast('一次最多 ' + max + ' 个文件', true); break; }
				if (f.size > FILE_MAX) { toast('「' + f.name + '」太大了：最大 200MB', true); continue; }
				const a = { f, p: 0, id: '', err: '' }; L.push(a);
				a.job = upFile(f, ctx, (p) => { a.p = p; draw(); }).then((r) => { a.id = r.id; draw(); }, (e) => { a.err = e.message; draw(); });
			}
			draw();
		},
		busy: () => L.some((a) => !a.id && !a.err),
		bad: () => L.some((a) => a.err),
		ids: () => L.filter((a) => a.id).map((a) => a.id),
		names: () => L.filter((a) => a.id).map((a) => ({ name: a.f.name, size: a.f.size })),
		wait: () => Promise.all(L.map((a) => a.job)),
		clear() { L.length = 0; draw(); },
		get n() { return L.length; },
	};
}
// 消息、公告里的文件：图片、视频、音频直接显示；其他的是一张可以点的文件卡片（都带下载）
function filesHtml(fs) {
	if (!fs || !fs.length) return '';
	return '<div class="files">' + fs.map((f) => {
		const u = esc(f.url || ''), dl = esc((f.url || '') + '&dl=1');
		if (!f.url) return `<span class="ff">${IC_FILE}<span><b>${esc(f.name)}</b><small>${fmtSize(f.size || 0)}</small></span></span>`;
		if (f.k === 'img') return `<a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="${esc(f.name)}" loading="lazy"></a><a class="fcap" href="${dl}" target="_blank" rel="noopener">${esc(f.name)} · 下载</a>`;
		if (f.k === 'video') return `<video src="${u}" controls preload="metadata" playsinline></video><a class="fcap" href="${dl}" target="_blank" rel="noopener">${esc(f.name)} · ${fmtSize(f.size)} · 下载</a>`;
		if (f.k === 'audio') return `<audio src="${u}" controls preload="none"></audio><a class="fcap" href="${dl}" target="_blank" rel="noopener">${esc(f.name)} · 下载</a>`;
		return `<a class="ff" href="${dl}" target="_blank" rel="noopener">${IC_FILE}<span><b>${esc(f.name)}</b><small>${fmtSize(f.size)} · 点一下下载</small></span></a>`;
	}).join('') + '</div>';
}

/* ---------- 实时联系开发者（4.0）：开着这一页时每 4 秒拿一次新消息；回复会推送到手机 ---------- */
const CH = { msgs: [], seq: 0, timer: 0, busy: false, img: '', hosted: true, none: false, blocked: false, pend: [], imgs: {}, at: 0 };
try { if (store.get('rp_chtips') === '0') $('chTips').classList.add('hide'); } catch (e) {}
$('chTipBtn').onclick = () => { const h = $('chTips').classList.toggle('hide'); store.set('rp_chtips', h ? '0' : '1'); };
function chStop() { clearInterval(CH.timer); CH.timer = 0; }
async function loadChat(quiet) {
	if (!quiet) chRender();
	await chPull(!quiet);
	chStop(); CH.timer = setInterval(() => { if (page === 'chat' && !document.hidden) chPull(false).catch(() => {}); }, 4000);
}
async function chPull(full) {
	if (CH.busy) return; CH.busy = true;
	try {
		const r = await P('chat', { op: 'get', after: full ? 0 : CH.seq, read: true }, 20000);
		CH.hosted = r.hosted !== false; CH.none = !!r.none; CH.blocked = !!r.blocked; CH.adminSeen = r.adminSeen || 0;
		if ('files' in r) CH.files = !!r.files;
		if (r.dev) CH.dev = r.dev; if ('me' in r) CH.me = r.me;
		if (full) CH.msgs = r.msgs || [];
		else for (const m of r.msgs || []) if (!CH.msgs.some((x) => x.s === m.s)) CH.msgs.push(m);
		CH.msgs.sort((a, b) => a.s - b.s);
		const before = CH.seq;
		CH.seq = Math.max(CH.seq, r.seq || 0, ...CH.msgs.map((m) => m.s));
		if (NT.d) { NT.d.chat = { ...(NT.d.chat || {}), uu: 0, seq: CH.seq }; ntBadge(); }
		CH.err = '';
		chRender(full || CH.seq !== before);
	} catch (e) { CH.err = e.message; chRender(false); if (full) throw e; }
	finally { CH.busy = false; }
}
const chTime = (t) => new Date(t).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
function chRender(scroll) {
	const box = $('chList'); if (!box) return;
	const nearBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 140;
	$('chSub').textContent = CH.blocked ? '暂时不能发消息' : CH.hosted ? '直接跟开发这个面板的人对话' : '自建版也能用：第一次发消息时自动建立对话';
	$('chNote').textContent = CH.err ? '连不上：' + CH.err : CH.blocked ? '暂时不能发消息了，有问题可以在官网报告问题' : CH.hosted ? '开发者回复后会推送到手机' : '开发者回复后，路由器会在半小时内推送到手机';
	$('chSend').disabled = CH.blocked; $('chText').disabled = CH.blocked; $('chImgBtn').disabled = CH.blocked;
	$('chAttBtn').classList.toggle('hidden', !(CH.files || (SVC && SVC.files))); $('chAttBtn').disabled = CH.blocked;
	const all = [...CH.msgs, ...CH.pend];
	if (!all.length) {
		CH.html = '';
		box.innerHTML = `<div class="chempty">${CH.none || !CH.msgs.length ? '还没有消息。有什么想问的，直接写下来发送就行。' : ''}<div class="chips" style="margin-top:12px">${['面板打不开了', '安装失败了', '想要一个新功能', '某个提示看不懂'].map((x) => `<button class="chip" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>`;
		return;
	}
	let html = '', day = '', prev = null;
	const devN = (CH.dev && CH.dev.name) || '开发者';
	for (const m of all) {
		const dd = ntDay(m.t); if (dd !== day) { day = dd; html += `<div class="chday">${esc(dd)}</div>`; prev = null; }
		const first = !prev || prev.f !== m.f || !!prev.auto !== !!m.auto; prev = m;
		const me = m.f === 'u';
		const img = m.img ? (m.local || CH.imgs[m.s] ? `<img src="${esc(m.local || CH.imgs[m.s])}" alt="图片" data-big="${m.s || ''}">` : `<span class="imgph" data-load="${m.s}">点开看图片</span>`) : '';
		const st = m.pending ? '<div class="chmeta">发送中…</div>' : m.fail ? `<div class="chmeta bad" data-retry="${m.id}">没发出去：${esc(m.fail)} · 点这里重发</div>` : `<div class="chmeta">${chTime(m.t)}${me && CH.adminSeen >= m.s ? ' · 开发者已读' : ''}</div>`;
		const who = !first ? '' : me ? (CH.me ? `<div class="chwho">${avHtml(CH.me)}<span>${esc(meName(CH.me))}</span></div>` : '') : `<div class="chwho">${m.auto ? '' : avHtml(CH.dev || { name: devN })}<span>${m.auto ? '自动回复' : esc(devN)}</span></div>`;
		html += `<div class="chrow${me ? ' me' : ''}">${who}<div class="chbub">${img}${filesHtml(m.files)}${m.x ? esc(m.x) : ''}</div>${st}</div>`;
	}
	// 每 4 秒拉一次新消息都会走到这里：内容没变就不动页面；变了也把已经加载的图片、视频、音频原样留下（正在看的视频不会被打断）
	if (html !== CH.html) {
		const keep = new Map(); for (const v of box.querySelectorAll('.files img, .files video, .files audio')) keep.set(v.tagName + v.getAttribute('src'), v);
		box.innerHTML = html; CH.html = html;
		for (const v of box.querySelectorAll('.files img, .files video, .files audio')) {
			const o = keep.get(v.tagName + v.getAttribute('src'));
			if (o) { v.replaceWith(o); continue; }
			// 新的图片、视频加载出来以后页面变高了：本来在最下面的，继续停在最下面（不被输入框挡住）
			v.addEventListener(v.tagName === 'IMG' ? 'load' : 'loadedmetadata', () => { if (innerHeight + scrollY >= document.documentElement.scrollHeight - v.getBoundingClientRect().height - 160) scrollTo({ top: document.documentElement.scrollHeight }); }, { once: true });
		}
	}
	for (const ph of box.querySelectorAll('[data-load]')) chImg(+ph.dataset.load);
	if (scroll && (nearBottom || CH.first !== false)) { CH.first = false; requestAnimationFrame(() => scrollTo({ top: document.documentElement.scrollHeight })); }
}
async function chImg(seq) {
	if (CH.imgs[seq] || CH['ld' + seq]) return; CH['ld' + seq] = 1;
	try { const r = await P('chat', { op: 'img', seq }, 30000); if (r.data) { CH.imgs[seq] = r.data; chRender(false); } } catch (e) {}
}
$('chList').onclick = (e) => {
	const q = e.target.closest('[data-q]'); if (q) { $('chText').value = q.dataset.q + '：'; $('chText').focus(); return chGrow(); }
	const im = e.target.closest('img[data-big]'); if (im) { const w = document.createElement('div'); w.className = 'modal'; w.style.cssText = 'display:grid;place-items:center;background:rgba(0,0,0,.85);z-index:90;position:fixed;inset:0;padding:16px'; w.innerHTML = `<img src="${im.src}" style="max-width:100%;max-height:92vh;border-radius:12px">`; w.onclick = () => w.remove(); document.body.appendChild(w); return; }
	const rt = e.target.closest('[data-retry]'); if (rt) { const p = CH.pend.find((x) => String(x.id) === rt.dataset.retry); if (p) { CH.pend = CH.pend.filter((x) => x !== p); chSend(p.x, p.local, p.fids, p.files); } }
};
const chGrow = () => { const t = $('chText'); t.style.height = 'auto'; t.style.height = Math.min(132, t.scrollHeight) + 'px'; };
$('chText').oninput = chGrow;
$('chText').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover:hover) and (pointer:fine)').matches) { e.preventDefault(); $('chSend').click(); } };
$('chImgBtn').onclick = () => $('chFile').click();
$('chFile').onchange = async () => {
	const f = $('chFile').files[0]; $('chFile').value = ''; if (!f) return;
	try { CH.img = await shrinkImg(f, 9e5); $('chPreImg').src = CH.img; $('chPre').classList.remove('hidden'); } catch (e) { toast(e.message, true); }
};
$('chPreX').onclick = () => { CH.img = ''; $('chPre').classList.add('hidden'); };
const CHA = attList($('chAtts'), 'chat', 5);
$('chAttBtn').onclick = () => $('chAny').click();
$('chAny').onchange = () => { const fs = $('chAny').files; if (fs && fs.length) CHA.add(fs); $('chAny').value = ''; };
$('chSend').onclick = async () => {
	const x = $('chText').value.trim(), img = CH.img;
	if (CHA.busy()) return toast('文件还在上传，传完再发');
	if (CHA.bad()) return toast('有文件没传上：点 × 去掉它再发', true);
	const files = CHA.ids(), names = CHA.names();
	if (!x && !img && !files.length) return toast('写点什么再发吧');
	if (/(密码|password|passwd)\s*[:：=]\s*\S{4,}|ss:\/\/|vmess:\/\/|trojan:\/\/|vless:\/\//i.test(x) && !confirm('看起来里面有密码或节点链接，开发者不需要这些。确定要发吗？')) return;
	$('chText').value = ''; chGrow(); CH.img = ''; $('chPre').classList.add('hidden'); CHA.clear();
	chSend(x, img, files, names);
};
let chPid = 0;
async function chSend(x, img, files, names) {
	const p = { id: ++chPid, f: 'u', t: Date.now(), x, img: img ? { type: 'image/jpeg' } : null, local: img || '', pending: true, files: names && names.length ? names : undefined, fids: files };
	CH.pend.push(p); chRender(true); requestAnimationFrame(() => scrollTo({ top: document.documentElement.scrollHeight }));
	try {
		const r = await P('chat', { op: 'send', text: x, img: img || undefined, files: files && files.length ? files : undefined, ua: navigator.userAgent }, 60000);
		CH.pend = CH.pend.filter((y) => y !== p);
		if (r.msg) { if (img) CH.imgs[r.msg.s] = img; if (!CH.msgs.some((m) => m.s === r.msg.s)) CH.msgs.push(r.msg); CH.seq = Math.max(CH.seq, r.msg.s); }
		CH.none = false; CH.hosted = r.hosted !== false;
		chRender(true);
	} catch (e) { p.pending = false; p.fail = e.message; chRender(true); }
}
// 问题反馈有回复了：开发者在管理页标了已修复、或者写了回复，打开面板时提示一次（托管版；看过的不再提示）
async function fbCheck() {
	if (!token || LK.on || document.hidden) return;
	if (popBusy()) { FB_WAIT = true; return; }
	fbAt = Date.now();
	let r; try { r = await P('fb_replies', {}, 30000); } catch (e) { return; }
	// 正在看「我的反馈」：不弹窗，直接刷新列表（列表里会标「新」）
	if (page === 'myfb') return void myfbRender(r);
	const x = (r?.list || []).filter((y) => (y.reply || y.done || y.nofix || y.ackAt) && y.updated > (y.seen || 0)).sort((a, b) => b.updated - a.updated)[0];
	if (!x) return;
	if (popBusy()) { FB_WAIT = true; return; }
	const when = (t) => new Date(t).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	const stage = Math.max(x.stage || (x.done || x.nofix ? 3 : 1), x.reply ? 2 : 1);
	modal(`<div class="sheethead"><h3>${x.done ? '你反馈的问题修好了' : x.nofix ? '你反馈的问题暂时没法修复' : x.reply ? '你的反馈有新的说明' : '开发人员已收到你的反馈'}</h3></div>
	<div class="cscroll">
	<p class="muted" style="font-size:13px;margin:0">${esc(when(x.at))} 发的反馈</p>
	${fbSteps(stage, !!x.nofix)}
	${x.reply ? `<p class="muted" style="font-size:13px;margin:12px 0 6px">${x.nofix ? '开发者说明的原因' : '开发者的说明'}</p><div class="notice"><div data-txt style="white-space:pre-wrap;line-height:1.65;max-height:9.9em;overflow:hidden">${esc(x.reply)}</div></div><button class="btn sm hidden" data-more style="margin-top:8px">查看全部</button>` : ''}
	${fbCodeRow(x.code)}
	${x.done ? '<p class="muted" style="font-size:13px;margin:10px 0 0">如果还有问题，在「系统操作 → 问题反馈」里再发一次就行。</p>' : x.nofix ? '<p class="muted" style="font-size:13px;margin:10px 0 0">以后情况有变化，可以在「系统操作 → 问题反馈」里再发一次。</p>' : ''}</div>
	<div class="cfoot">	<div class="btngrid"><button class="btn" data-track>查看完整记录</button><button class="btn primary" data-v="close">知道了</button></div></div>`,
	(m, close) => {
		m.dataset.fbr = 1; fbCodeBind(m, x.code, close);
		// 回复太长（超过 6 行）：先折叠，点「查看全部」展开，再点收起
		const t = m.querySelector('[data-txt]'), b = m.querySelector('[data-more]');
		if (!t || !b) return;
		const fold = (on) => { t.style.maxHeight = on ? '9.9em' : 'none'; t.style.webkitMaskImage = t.style.maskImage = on ? 'linear-gradient(180deg,#000 70%,transparent)' : 'none'; b.textContent = on ? '查看全部' : '收起'; };
		if (t.scrollHeight > t.clientHeight + 4) { b.classList.remove('hidden'); fold(true); b.onclick = () => fold(t.style.maxHeight === 'none'); }
		else t.style.maxHeight = 'none';
	}, { compact: true });
	P('fb_seen', { code: x.code, updated: x.updated, done: x.done || x.nofix ? 1 : 0 }).catch(() => {});
}
const UPD_STEPS = [['downloading', '下载新版安装包'], ['installing', '安装（保留所有设置）'], ['check', '重新启动面板服务'], ['done', '完成']];
async function updStart(noConfirm, channel) {
	if (!UPD) await updCheck(true);
	if (!noConfirm && !(await confirmBox('一键更新', '更新到 v' + (UPD?.latest || '最新版') + '？\n网址、密钥、设置都保留；面板会断开 10–30 秒，不会断网。', '开始更新'))) return;
	try { await P('update_start', channel ? { confirm: 'UPDATE', channel } : { confirm: 'UPDATE' }, 20000); } catch (e) { return toast(e.message, true); }
	let lost = 0, t0 = Date.now(), fin = false;
	modal(`<h3>正在更新路由器面板</h3><ul class="updsteps" data-steps></ul><p class="muted" data-msg style="font-size:13px;margin:6px 0 0">开始…</p><div class="btngrid hidden" data-end style="margin:12px 0 0"><button class="btn primary" data-done>完成</button></div>`,
	(m, close) => {
		m.dataset.lock = 1; m.dataset.upd = 1;
		const draw = (st, msg, reloading) => {
			const idx = { queued: 0, downloading: 0, installing: 1, rollback: 2, done: 3, rolledback: 3, failed: 3 }[st] ?? 0;
			const cur = reloading ? 2 : idx;
			m.querySelector('[data-steps]').innerHTML = UPD_STEPS.map((x, i) => `<li class="${i < cur || (st === 'done' && i === 3) ? 'ok' : i === cur && st !== 'failed' && st !== 'rolledback' ? 'on' : ''}">${esc(x[1])}</li>`).join('');
			m.querySelector('[data-msg]').textContent = msg;
		};
		const end = (ok, msg) => {
			fin = true;
			draw(ok ? 'done' : 'failed', msg);
			m.querySelector('[data-end]').classList.remove('hidden');
			// 升级好了：刷新后回到首页（老用户第一次用 6.0，新手引导在首页出来）
			m.querySelector('[data-done]').onclick = () => { close(null); if (ok) { try { sessionStorage.setItem('rp_page', 'main'); } catch (e) {} refreshPanel(); } };
		};
		const poll = async () => {
			if (fin) return;
			if (Date.now() - t0 > 6 * 60e3) return end(false, '还没更新完：过几分钟刷新面板看看版本号；如果一直这样，用安装命令手动升级。');
			try {
				const s = await P('update_status', {}, 8000);
				lost = 0;
				if (s.state === 'done') return end(true, s.msg + '。点「完成」刷新面板，就是新版了。');
				if (s.state === 'rolledback' || s.state === 'failed') return end(false, s.msg);
				draw(s.state, s.msg || '');
			} catch (e) {
				lost++;
				draw('installing', '面板服务正在重启，马上回来…', true);
			}
			setTimeout(poll, 2000);
		};
		draw('downloading', '正在下载新版安装包');
		setTimeout(poll, 1500);
	});
}

// 换一把新的登录密钥：这台手机自动换成新的；其他手机、AI 连接器要重新填
async function rotateKey() {
	if (!(await confirmBox('换一把新的登录密钥', '换了之后：\n· 旧的登录地址马上作废，谁拿到旧地址都进不来\n· 已经登录的手机（包括这台）用的是各自的钥匙，不受影响；不认识的手机在下面「登录着的设备」里移除\n· 用「AI 连接器地址」加的 AI 连接器不受影响；用旧登录地址加的要换', '换新密钥', true))) return;
	let r;
	try { r = await secP('rotate_key', { confirm: 'ROTATE' }, 30000); } catch (e) { return toast(e.message, true); }
	// 6.0：手机用的是自己的钥匙，换登录密钥不影响这台手机，新密钥也不存在手机上
	const login = location.origin + '/cgi-bin/mcp/' + r.token;
	modal(`<div class="sheethead"><h3>已换成新密钥</h3><button class="btn sm" data-v="close">关闭</button></div>
	<p class="muted" style="margin:0 0 10px">旧的登录地址已经作废。这是新的登录地址，点一下显示：</p>
	<div class="qrbox blur keybox" style="word-break:break-all;font:13px/1.5 ui-monospace,monospace;padding:14px;text-align:left">${esc(login)}<span>点一下显示</span></div>
	${r.selfcloud ? '<div class="notice w" style="margin-top:12px">你用的是自建完整版：还要把 Cloudflare Worker 的密钥 <b>PANEL_TOKEN</b> 换成新的登录密钥（地址最后那一串），不然推送和云端备份会连不上。</div>' : ''}
	<div class="notice" style="margin-top:12px">已经登录的手机照常能用。以后添加新手机用「我的主页 → 敏感信息 → 添加新手机」扫码。AI 应用里如果用的是旧的登录地址，换成「AI 连接器地址」。</div>
	<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-copy>复制新地址</button><button class="btn primary" data-v="close">完成</button></div>`,
	(m) => { qrReveal(m); m.querySelector('[data-copy]').onclick = () => copyText(login); });
}
// 「系统操作」里按版本显示的项：已登录的手机（应急登录码进来的）、AI 连接器地址（AI 版）
// 托管服务的到期时间：系统操作里显示；还剩 3 天以内首页提示去申请续期
const ymd = (ms) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
let SVC = null;
// 按上次记下的到期时间判断：托管服务是不是已经到期（到期后专属网址暂停，面板连不上路由器）
const svcExpired = () => !!(SVC && SVC.hosted && SVC.exp && SVC.exp <= Date.now());
const SVC_EXP_MSG = () => '托管服务 ' + ymd(SVC.exp) + ' 到期，专属网址暂停了，所以连不上路由器；家里上网和路由器上的设置都不受影响。去官网账号页点「申请续期」填个表，审核通过后马上恢复，不用重装（刚续过的话，等一两分钟再刷新）。';
function svcRender() {
	const s = SVC;
	if (!s || !s.hosted) { $('mSvc').classList.add('hidden'); return; }
	const left = s.exp ? Math.ceil((s.exp - Date.now()) / 86400e3) : null;
	const warn = s.exp && left <= 3;
	$('mSvc').classList.toggle('hidden', !warn);
	if (warn) { $('mSvcT').textContent = left <= 0 ? '托管服务已到期' : '托管服务还剩 ' + left + ' 天到期'; $('mSvcD').textContent = left <= 0 ? SVC_EXP_MSG() : '到期时间 ' + ymd(s.exp) + '。去官网账号页点「申请续期」填个表，审核通过自动续上，不用重装'; }
}
/* ---------- 我的主页（5.2）：我是谁、托管服务、这台路由器、家人（主账号 / 子账号）、敏感信息（要邮箱验证码）、操作记录、我的反馈 ---------- */
let ME = null;
try { ME = JSON.parse(store.get('rp_me') || 'null'); if (ME && !ME.me) ME = null; } catch (e) {}
const AV_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;
function avHtml(p, cls) { const a = p && p.avatar && AV_RE.test(p.avatar) ? p.avatar : ''; const n = (p && (p.name || (p.email || '').split('@')[0])) || '?'; return `<span class="av${a ? ' img' : ''}${cls ? ' ' + cls : ''}"${a ? ` style="background-image:url('${a}')"` : ''}>${a ? '' : esc(n.trim().slice(0, 1))}</span>`; }
function avPaint(el, p) { if (!el) return; const a = p && p.avatar && AV_RE.test(p.avatar) ? p.avatar : ''; el.classList.toggle('img', !!a); el.style.backgroundImage = a ? `url('${a}')` : ''; el.textContent = a ? '' : ((p && (p.name || (p.email || '').split('@')[0])) || '?').trim().slice(0, 1); }
const meName = (p) => (p && (p.name || (p.email || '').split('@')[0])) || '';
const PERM_N = { msg: '反馈和联系开发者', node: '切换节点', speed: '测速', parent: '家长控制', alldev: '看和管所有设备', proxy: '代理设置', net: '完全控制', sys: '系统操作' };
const TPLS = { look: ['只看', ['msg']], family: ['家人', ['msg', 'node', 'speed']], most: ['几乎全部', ['msg', 'node', 'speed', 'parent', 'alldev', 'proxy', 'sys']] };
// 6.0 第 17 项：模板名不看「看和管所有设备」（家人列表里另外写「所有设备 / 只管自己的设备」）
const tplKey = (p) => (p || []).filter((k) => k !== 'alldev').slice().sort().join();
// 安全加固（第二轮）：「完全控制」能在路由器上以 root 运行任何东西（原版后台、OpenClash 自定义脚本和覆写、恢复备份），有了就跟主账号一样；「几乎全部」不含它
const PERM_RISK = ['net'];
// 新给了高风险权限的：先确认一次（原来就有的不再问）
async function mpRiskOk(perms, old, who) {
	const add = PERM_RISK.filter((k) => perms.includes(k) && !(old || []).includes(k));
	if (!add.length) return true;
	return confirmBox('给' + (who ? '「' + who + '」' : '他') + '完全控制？', '有「完全控制」的人能进路由器原版后台、改 OpenClash 运行的脚本、恢复备份，能做主账号能做的一切，而且收回权限以后也可能留下自己的改动。只给完全信任的家人。', '确定给', true);
}
const tplName = (perms) => { const k = Object.keys(TPLS).find((t) => tplKey(TPLS[t][1]) === tplKey(perms)); return k ? TPLS[k][0] : '自定义'; };
function meRender() {
	const p = ME && ME.me, on = !!(SVC && SVC.hosted && p);
	// 侧边栏的「我的主页」谁都有：没有官网账号的（自建版、应急登录）里面只有这台路由器的敏感信息
	$('sideMe').classList.toggle('hidden', !token);
	if (!on) { avPaint($('sideMeAv'), { name: '我' }); $('sideMeName').textContent = '我的主页'; $('sideMeSub').textContent = '敏感信息（要验证）'; return; }
	avPaint($('sideMeAv'), p); $('sideMeName').textContent = meName(p); $('sideMeSub').textContent = '我的主页 · 官网账号';
}
async function meLoad(force) {
	if (!SVC || !SVC.hosted || !store.get('rp_dev') || ME_ROLE.emerg) { if (!store.get('rp_dev')) ME = null; meRender(); return ME; }
	if (!force && ME && Date.now() - (ME.at || 0) < 3600e3) { meRender(); return ME; }
	try { const r = await P('fam', { op: 'me' }, 30000); ME = { at: Date.now(), ...r }; store.set('rp_me', JSON.stringify(ME)); } catch (e) {}
	meRender();
	return ME;
}
$('sideMe').onclick = () => go('me');
// 确认是本人：发邮箱验证码，10 分钟内有效（只记在这个浏览器标签页里）
let SUDO = (() => { try { const x = JSON.parse(sessionStorage.getItem('rp_sudo') || 'null'); return x && x.exp > Date.now() ? x : null; } catch (e) { return null; } })();
const sudoOn = () => !!(SUDO && SUDO.exp > Date.now() + 3000);
function sudoSet(x) { SUDO = x; try { if (x) sessionStorage.setItem('rp_sudo', JSON.stringify(x)); else sessionStorage.removeItem('rp_sudo'); } catch (e) {} }
// 发过验证码：10 分钟内一直显示输入框（去邮箱复制验证码再回来、页面刷新、侧滑返回都不会丢）；1 分钟内不能重发（官网也这么限制）
const SENT_MS = 600e3, RESEND_S = 60;
const devTag = () => (store.get('rp_dev') || '').slice(0, 8);
const CODE = { val: '', tried: '', tf: false }; // 输到一半的验证码（只在内存里）；tf：改成输验证器上的码（6.0 第 5 项，官网账号开了两步验证的）
function sentGet() { try { const x = JSON.parse(store.get('rp_sudo_sent') || 'null'); return x && x.dev === devTag() && Date.now() >= x.at && Date.now() - x.at < SENT_MS ? x : null; } catch (e) { return null; } }
function sentSet(x) { if (x) store.set('rp_sudo_sent', JSON.stringify({ ...x, dev: devTag() })); else store.del('rp_sudo_sent'); CODE.val = ''; CODE.tried = ''; }
const resendLeft = () => { const s = sentGet(); return s ? Math.max(0, RESEND_S - Math.floor((Date.now() - s.at) / 1000)) : 0; };
let rsTimer = 0;
function resendTick() {
	clearInterval(rsTimer);
	const upd = () => {
		const l = resendLeft(), bs = document.querySelectorAll('[data-resend]');
		bs.forEach((b) => { if (b.querySelector('.spin')) return; b.disabled = l > 0; b.textContent = l > 0 ? '重新发一个（' + l + ' 秒后）' : '没收到？重新发一个'; });
		if (!l || !bs.length) clearInterval(rsTimer);
	};
	rsTimer = setInterval(upd, 1000); upd();
}
// 验证码这一块（敏感信息里、「先确认是你本人」弹窗里共用）：没发过显示「发验证码」，发过了显示输入框
const tfOn = () => !!(ME && ME.me && ME.me.totp);
function codeHtml(email) {
	const s = sentGet();
	// 开了两步验证的：直接输验证器上的 6 位数字，不用等邮件
	if (!s && CODE.tf) return `<div class="mpcode"><p class="mphint muted">打开手机上的验证器 App，输「路由器面板」下面现在显示的 6 位数字</p>
	<input class="input nccode" data-code inputmode="numeric" autocomplete="one-time-code" placeholder="6 位数字" aria-label="验证器上的 6 位数字">
	<button class="btn primary" data-ok style="width:100%;margin-top:10px">确认</button>
	<button class="btn" data-send style="width:100%;margin-top:8px">改成发验证码到邮箱</button></div>`;
	if (!s) return `<button class="btn primary" data-send style="width:100%">发验证码到 ${esc(email || '我的邮箱')}</button>${tfOn() ? '<button class="btn" data-tf style="width:100%;margin-top:8px">用验证器 App 上的码</button>' : ''}`;
	return `<div class="mpcode"><p class="mphint muted">验证码发到了 ${esc(s.mail || email || '你的邮箱')}，10 分钟内有效</p>
	<input class="input nccode" data-code inputmode="numeric" autocomplete="one-time-code" placeholder="6 位验证码" aria-label="验证码">
	<button class="btn primary" data-ok style="width:100%;margin-top:10px">确认</button>
	<button class="btn" data-send data-resend style="width:100%;margin-top:8px">没收到？重新发一个</button></div>`;
}
// 发验证码：官网没开邮件服务时直接确认（返回 ok）；发出去了返回 sent；出错已经提示过，返回 undefined
async function sudoSend(btn, want) {
	return busy(btn, async () => {
		CODE.tf = false;
		const r = await P('fam', { op: 'sudo_code' }, 30000);
		if (r.nomail && r.totp) { CODE.tf = true; CODE.val = ''; CODE.tried = ''; return { sent: true }; } // 没开邮件服务、开了两步验证：要输验证器上的码
		if (r.nomail) { const x = await P('fam', { op: 'sudo', code: '', want: want ? 'secret' : undefined }, 30000); sudoSet({ tok: x.sudo, exp: x.exp }); sentSet(null); return { ok: true, secret: x.secret }; }
		sentSet({ at: Date.now(), mail: r.mail || '' });
		return { sent: true };
	}, '发送中');
}
// 核对验证码：对了返回 ok（want 时顺带敏感信息）；过期了返回 expired（要重新发）；其他错误已经提示过
async function sudoVerify(btn, code, want) {
	return busy(btn, async () => {
		try {
			const x = await P('fam', { op: 'sudo', code, want: want ? 'secret' : undefined }, 30000);
			sudoSet({ tok: x.sudo, exp: x.exp }); sentSet(null); CODE.tf = false;
			return { ok: true, secret: x.secret };
		} catch (e) { if (/过期/.test(e.message)) { sentSet(null); return { expired: true, msg: e.message }; } throw e; }
	}, '核对中');
}
// 绑定验证码这一块：输满 6 位自动确认（同一串不重复提交）；opts.done(结果) 确认成功后；opts.redraw(要不要聚焦) 发出 / 过期后重画
function codeBind(root, opts) {
	const inp = root.querySelector('[data-code]');
	if (inp && CODE.val) inp.value = CODE.val; // 输到一半的（不写进 HTML，内容不变时整块就不用重画）
	const check = async () => {
		const b = root.querySelector('[data-ok]'); if (!b || b.disabled) return;
		const v = ((inp && inp.value) || '').replace(/\D/g, '');
		if (v.length !== 6) { toast('验证码是 6 位数字', true); return; }
		CODE.tried = v;
		if (opts.before) opts.before();
		const r = await sudoVerify(b, v, opts.want);
		if (r && r.ok) opts.done(r);
		else if (r && r.expired) { toast(r.msg, true); opts.redraw(false); }
		else if (inp && inp.isConnected && document.activeElement === inp) inp.select();
	};
	if (inp) {
		inp.oninput = () => {
			const v = inp.value.replace(/\D/g, '').slice(0, 6);
			if (inp.value !== v) inp.value = v;
			CODE.val = v;
			if (v.length === 6 && v !== CODE.tried) check();
		};
		inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } };
	}
	const okb = root.querySelector('[data-ok]'); if (okb) okb.onclick = check;
	const sb = root.querySelector('[data-send]');
	if (sb) sb.onclick = async () => {
		const r = await sudoSend(sb, opts.want);
		if (r && r.ok) opts.done(r);
		else if (r && r.sent) opts.redraw(true);
	};
	const tb = root.querySelector('[data-tf]');
	if (tb) tb.onclick = () => { CODE.tf = true; CODE.val = ''; CODE.tried = ''; opts.redraw(true); };
	resendTick();
}
const codeFocus = (root) => setTimeout(() => { const i = root.querySelector('[data-code]'); if (i && i.isConnected) i.focus(); }, 60);
// 弹一个框确认本人，成功返回凭证
function needSudo(why) {
	if (sudoOn()) return Promise.resolve(SUDO.tok);
	const email = (ME && ME.me && ME.me.email) || '';
	return modal(`<div class="sheethead"><h3>先确认是你本人</h3><button class="btn sm" data-v="close">关闭</button></div>
	<p class="muted" style="margin:0 0 12px;line-height:1.7">${esc(why || '这个操作要先确认是你本人')}：${tfOn() ? '输验证器 App 上的 6 位数字，或者发一个验证码到你的官网账号邮箱' : '发一个验证码到你的官网账号邮箱，输进来就行'}。10 分钟内不用再输。</p>
	<div data-cwrap>${codeHtml(email)}</div>`,
	(m, close) => {
		const w = m.querySelector('[data-cwrap]');
		const opts = { done: () => close(SUDO.tok), redraw: (f) => { w.innerHTML = codeHtml(email); codeBind(w, opts); if (f) codeFocus(w); } };
		codeBind(w, opts);
	});
}
// 调要确认本人的接口：凭证过期了自动再确认一次
async function famSudo(op, args, why) {
	let tok = await needSudo(why); if (!tok) return null;
	try { return await P('fam', { op, sudo: tok, ...args }, 30000); }
	catch (e) { if (/确认是你本人/.test(e.message)) { sudoSet(null); tok = await needSudo(why); if (!tok) return null; return P('fam', { op, sudo: tok, ...args }, 30000); } throw e; }
}
/* 6.0 第 63 项：路由器上的钥匙（登录密钥、AI 连接器地址、平板网址、登录着的手机）只在「我的主页 → 敏感信息」里；
   路由器那边没确认本人就不给（凭证只认发给的这台手机）。有官网账号的用邮箱验证码；自建版、应急登录的用路由器后台密码 */
async function secP(method, args, tmo) {
	if (!sudoOn()) { toast('先在「我的主页 → 敏感信息」里验证是你本人', true); go('me'); throw new Error('要先确认是你本人'); }
	try { return await P(method, { ...(args || {}), sudo: SUDO.tok }, tmo); }
	catch (e) { if (/确认是你本人/.test(e.message)) { sudoSet(null); MP.sec = null; MP.devs = null; toast('验证过期了，再验证一次', true); go('me'); } throw e; }
}
// 锁上：这台手机忘掉凭证，也让路由器作废它
function sudoLock() { const t = SUDO && SUDO.tok; sudoSet(null); MP.sec = null; MP.devs = null; if (t) P('sudo_drop', { sudo: t }).catch(() => {}); }
const LOCK_IC = '<div class="ic"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>';
// 「这台路由器的钥匙」：只有主账号（自建版就是拿着登录密钥的人）
function mpKeysHtml() {
	if (ME_ROLE.role === 'sub') return '';
	const self = !isHosted(), ai = store.get('rp_ai') === '1', tab = !!(cinfo && cinfo.tablet);
	const row = (k, t, d) => `<button class="file" data-mp="${k}" style="background:none;margin:4px 0"><div><b>${t}</b>${d ? `<span class="muted">${d}</span>` : ''}</div><span class="muted">›</span></button>`;
	const lpw = store.get('rp_lpw') === '1';
	return `<div class="mp-sub">这台路由器的钥匙</div><section class="card list mp-keys" style="padding:4px 12px">${self ? row('kphone', '添加新手机', '另一台手机扫码直接打开这个面板') : ''}${self ? row('kpw', '登录要输路由器后台密码', lpw ? '已开启：新手机光有登录地址进不来' : '没开：拿到登录地址就能登录新手机') : ''}${ai ? row('kckey', 'AI 连接器地址', '在 Claude、ChatGPT 等 AI 里添加连接器，设置 AI 能做什么') : ''}${tab ? row('ktab', '平板（证人）网址', '平板每分钟访问这个网址报平安') : ''}${store.get('rp_ppp') !== '0' ? row('kppp', '宽带账号和密码', '') : ''}${row('krot', '换登录密钥', '旧的登录地址马上作废（截图泄露、手机丢了时用）')}</section>`;
}
// 登录着的手机（托管版）：移除不认识的
function mpDevsHtml(dl, note) {
	return `<div class="mp-sub">登录着的设备${dl ? ' · ' + dl.length + ' 台' : ''}</div><section class="card">${!dl ? '<p class="muted" style="margin:0">读不到，稍后刷新再试</p>' : dl.map((d) => `<div class="mp-fb"><div><b>${esc(d.name)}${d.me ? ' <span class="pill blue">这台</span>' : ''}</b><span>${esc([new Date(d.at * 1000).toLocaleDateString('zh-CN') + (d.kind === 'widget' ? ' 添加' : ' 登录'), d.via || '', d.me ? '' : '最近使用：' + (d.seen ? agoSec(d.seen) : '路由器重启后还没用过')].filter(Boolean).join(' · '))}</span></div>${d.me ? '' : `<button class="btn sm danger" data-mp="drm" data-i="${esc(d.id)}">移除</button>`}</div>`).join('') || '<p class="muted" style="margin:0">没有记录</p>'}
		${dl && dl.length > 1 ? '<button class="btn sm danger" data-mp="drmall" style="width:100%;margin-top:6px">除了这台，全部移除</button>' : ''}</section>
		<p class="mp-note" style="text-align:left;margin:7px 4px 0!important">${note}</p>`;
}
// 6.0 第 82 项：家里局域网直接打开的地址（连着家里 Wi-Fi 时用，不走外网）。点一下复制
function lanAddr() { try { const l = JSON.parse(store.get('rp_lan') || 'null'); return l && l.url ? l : null; } catch (e) { return null; } }
function lanRow() { const l = lanAddr(); return l ? `<dt>在家里打开</dt><dd><button type="button" class="mp-lanbtn" data-mp="lancp" title="复制">${esc(l.ip + ':' + l.port)}</button></dd>` : ''; }
// 自建版、应急登录：没有官网账号，「我的主页」只有这台路由器的敏感信息，用路由器后台密码验证
function mpLocalDraw() {
	const box = $('meBox'), hosted = isHosted(), ver = sudoOn() && SUDO.kind === 'local';
	let h = `<section class="hero"><div class="herohead"><h1>我的主页</h1><span class="pill">${hosted ? (ME_ROLE.lanin ? '局域网登录' : '应急登录') : '自建版'}</span></div><p class="muted" style="margin-bottom:0">${hosted ? (ME_ROLE.lanin ? '你是在家里局域网直接登录的' : '你是用路由器终端的应急登录码进来的') + '，看不到官网账号的信息；从官网「我的路由器」点「打开面板」进来，这里会显示完整的主页。' : '这台路由器没有用官网账号。'}这里放着这台路由器的敏感信息，验证是你本人后才能看。</p></section>`;
	if (lanAddr() || edNow()) h += `<div class="sectitle"><b>这台路由器</b></div><section class="card"><dl class="mp-kv">${edRow()}${lanRow()}</dl></section>`;
	if (!ver) {
		const L = [['登录密钥', hosted ? '换登录密钥' : '添加新手机的二维码、换登录密钥']];
		if (store.get('rp_ai') === '1') L.push(['AI 连接器地址', '能让 AI 控制路由器的地址']);
		if (cinfo && cinfo.tablet) L.push(['平板（证人）网址', '平板报平安用的网址']);
		L.push(['登录着的设备', '哪些手机能打开这个面板，不认识的马上移除']);
		if (!hosted) L.push(['登录要输路由器后台密码', '开了以后光有登录地址进不来']);
		h += `<div class="sectitle"><b>敏感信息</b><span class="muted" style="font-size:13px">🔒 要验证</span></div><section class="card mp-lock">${LOCK_IC}
		<h3>输路由器后台密码验证</h3>
		<ul class="mp-lockl">${L.map((x) => `<li><b>${x[0]}</b><span>${x[1]}</span></li>`).join('')}</ul>
		<form data-pwf class="mp-pwf"><input class="input" type="password" data-pw autocomplete="current-password" placeholder="路由器后台密码" aria-label="路由器后台密码"><button class="btn primary" type="submit" data-pwok style="width:100%;margin-top:10px">确认</button></form>
		<p class="mp-note">就是登录路由器原版后台（比如 192.168.1.1）用的密码，由路由器自己核对，面板不保存。验证一次，10 分钟内不用再输；输错 5 次锁 15 分钟。</p></section>`;
	} else {
		const mins = Math.max(0, Math.ceil((SUDO.exp - Date.now()) / 1000));
		h += `<div class="sectitle mp-sec-h"><b>敏感信息</b><span class="pill mpok" id="mpLeft">已验证 · ${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')} 后自动锁上</span></div>`;
		h += mpDevsHtml(MP.devs && MP.devs.list, hosted ? '这些手机能打开这个面板。不认识的马上移除：移除后它要从官网重新打开才能进来。' : '这些手机能打开这个面板，每台有自己的钥匙。不认识的马上移除：移除后它要重新打开登录地址才能进来；担心登录地址也泄露了，再换一下登录密钥。');
		h += mpKeysHtml() + '<button class="btn" data-mp="lock" style="width:100%;margin-top:10px">现在锁上</button>';
	}
	if (h !== MP.h || !box.firstElementChild) { box.innerHTML = h; MP.h = h; }
	const f = box.querySelector('[data-pwf]');
	if (f) f.onsubmit = (e) => {
		e.preventDefault();
		const inp = f.querySelector('[data-pw]'), pw = inp.value;
		if (!pw) return toast('请输入路由器后台密码', true);
		busy(f.querySelector('[data-pwok]'), async () => {
			const x = await P('sudo_local', { pw }, 20000);
			inp.value = '';
			sudoSet({ tok: x.sudo, exp: x.exp, kind: 'local' });
			MP.devs = await P('device_list', { sudo: x.sudo }).catch(() => null);
			mpLocalDraw();
		}, '核对中');
	};
	clearInterval(mpTimer);
	if (ver) mpTimer = setInterval(() => {
		const el = $('mpLeft'); if (!el || page !== 'me') { clearInterval(mpTimer); return; }
		const t = Math.ceil((SUDO.exp - Date.now()) / 1000);
		if (t <= 0) { clearInterval(mpTimer); sudoLock(); mpLocalDraw(); return; }
		el.textContent = '已验证 · ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + ' 后自动锁上';
	}, 1000);
}
const MP = { sec: null, log: null, logAll: false, mem: null, devs: null, h: '' };
let mpTimer = 0, mpSeq = 0;
// 上次读到的家人、操作记录（只存在这台手机上）：再打开「我的主页」先显示这些，后台再拿最新的
try { const c = JSON.parse(store.get('rp_mp') || 'null'); if (c && c.dev && c.dev === devTag()) { MP.mem = c.mem || null; MP.log = c.log || null; } } catch (e) {}
function mpSave() {
	let t = JSON.stringify({ dev: devTag(), mem: MP.mem, log: (MP.log || []).slice(0, 30) });
	if (t.length > 300e3 && MP.mem) t = JSON.stringify({ dev: devTag(), mem: { ...MP.mem, subs: (MP.mem.subs || []).map((x) => ({ ...x, avatar: '' })), owner: MP.mem.owner && { ...MP.mem.owner, avatar: '' } }, log: (MP.log || []).slice(0, 30) });
	store.set('rp_mp', t);
}
function mpEmpty(html) { MP.h = ''; $('meBox').innerHTML = html; }
// 一次拿全（我是谁、家人、操作记录，确认过本人的再加敏感信息）；官网还没更新的话照旧分开拿（同时发出去）
async function mpFetch() {
	const tok = sudoOn() ? SUDO.tok : undefined, mine = () => tok && sudoOn() && SUDO.tok === tok;
	let r = null;
	try { r = await P('fam', { op: 'page', sudo: tok }, 30000); }
	catch (e) { if (!/not found|不支持/.test(e.message)) return false; r = null; }
	// 老的官网 / 老的路由器不认 page（报错，或者回来的东西里没有「我是谁」）：分开拿
	if (!r || !r.me) {
		const q = (op, a) => P('fam', { op, ...a }, 30000).catch(() => null);
		const [me, mem, log, sec] = await Promise.all([q('me'), q('members'), q('log'), tok ? q('secret', { sudo: tok }) : null]);
		if (!me) return false;
		r = { me, members: mem, log: log ? log.list || [] : null, secret: sec };
	}
	ME = { at: Date.now(), ...r.me }; store.set('rp_me', JSON.stringify(ME)); meRender();
	MP.mem = r.members || null; MP.log = r.log || null;
	if (mine()) { if (r.secret) MP.sec = r.secret; else { sudoSet(null); MP.sec = null; MP.devs = null; } }
	mpSave();
	return true;
}
async function loadMe(quiet) {
	const my = ++mpSeq;
	const why = () => (!SVC || !SVC.hosted ? 'nohost' : !store.get('rp_dev') || ME_ROLE.emerg ? 'emerg' : '');
	const showWhy0 = () => mpEmpty(why() === 'nohost' ? '<section class="card empty">这台路由器没有用托管服务，没有官网账号信息。</section>' : '<section class="card empty" style="line-height:1.7">你是用路由器终端的应急登录码进来的，看不到官网账号的信息。<br>从官网「我的路由器」点「打开面板」进来以后，这里会显示你的主页。</section>');
	// 自建版、应急登录：只有路由器的敏感信息（路由器后台密码验证）
	const showWhy = () => { MP.h = ''; mpLocalDraw(); };
	if (!sudoOn()) { MP.sec = null; MP.devs = null; }
	// 先把上次的显示出来（打开就有内容），后台再拿最新的
	if (SVC && !why() && ME && ME.me) mpDraw();
	else if (!(SVC && why())) mpEmpty('<section class="card empty">读取中…</section>');
	const sv = svcLoad(false, true);
	sv.then(() => { if (Date.now() - SVC_AT < 10000 && page === 'me') setStatus(true, '在线'); });
	if (!SVC || why()) { await sv; if (my !== mpSeq) return; if (why()) return showWhy(); }
	const [ok, devs] = await Promise.all([mpFetch(), sudoOn() ? P('device_list', { sudo: SUDO.tok }).catch(() => null) : null, sv]);
	if (my !== mpSeq) return;
	if (why()) return showWhy();
	if (devs && sudoOn()) MP.devs = devs;
	if (!ME || !ME.me) return mpEmpty('<section class="card empty">读不到账号信息，检查一下路由器能不能连上官网，稍后再试。</section>');
	if (!ok && !quiet) toast('读不到最新的，下面是上次的', true);
	mpDraw();
}
// 敏感信息里验证码对了：凭证和敏感信息一起回来，能打开面板的手机在核对的同时读
const mpCodeOpts = {
	want: true,
	done: async (r) => {
		const dp = P('device_list', { sudo: SUDO.tok }).catch(() => null);
		let sec = r.secret || null;
		if (!sec) sec = await P('fam', { op: 'secret', sudo: SUDO.tok }, 30000).catch((e) => { toast(e.message, true); return null; });
		MP.sec = sec; MP.devs = await dp;
		mpDraw();
	},
	redraw: (f) => { mpDraw(); if (f) codeFocus($('meBox')); },
};
const agoSec = (t) => { if (!t) return '—'; const s = Date.now() / 1000 - t; return s < 120 ? '刚刚' : s < 3600 ? Math.round(s / 60) + ' 分钟前' : s < 86400 ? Math.round(s / 3600) + ' 小时前' : Math.round(s / 86400) + ' 天前'; };
const ymdhm = (t) => { const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const ymdz = (t) => { const d = new Date(t); return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日'; };
function mpDraw() {
	const box = $('meBox'), me = ME.me, main = ME.role === 'main', s = SVC || {}, left = s.exp ? Math.ceil((s.exp - Date.now()) / 86400e3) : null;
	const cam = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
	const pen = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
	const roleP = main ? '<span class="pill mpok">主账号</span>' : ME.role === 'sub' ? '<span class="pill blue">子账号 · ' + esc(tplName(ME.perms)) + '</span>' : '<span class="pill">' + esc({ off: '已被停用', expired: '使用期限到了', pick: '还没选主账号' }[ME.role] || '成员') + '</span>';
	let h = `<section class="hero mp-head"><button class="mp-avw" type="button" data-mp="av" aria-label="换头像">${avHtml(me, 'mp-av')}<span class="mp-cam">${cam}</span></button>
	<h1 class="mp-name"><span>${esc(meName(me))}</span><button class="mp-pen" type="button" data-mp="name" aria-label="改名字">${pen}</button></h1>
	<div class="m">${esc(me.email || '')}${me.created ? ' · ' + esc(ymdz(me.created)) + '注册' : ''}</div>
	<div class="mp-badges"><span class="pill">托管版</span>${roleP}</div>
	<p class="mp-tip">点头像换头像，点名字旁边的笔改名字；官网和跟开发者对话时也跟着变</p></section>`;
	// 托管服务
	h += `<div class="sectitle"><b>托管服务</b></div><section class="card"><dl class="mp-kv">
	<dt>到期时间</dt><dd class="${left != null && left <= 7 ? 'mp-warn' : ''}">${s.exp == null ? '查不到' : !s.exp ? '不限期' : esc(ymd(s.exp)) + (left > 0 ? '（还剩 ' + left + ' 天）' : '（已到期）')}</dd>
	<dt>专属网址</dt><dd>${esc(location.host)}</dd>${ME.router && ME.router.created ? `<dt>开通时间</dt><dd>${esc(ymd(ME.router.created))}</dd>` : ''}</dl>
	${s.exp ? (main ? `<div class="mp-acts"><button class="btn" data-mp="renew">输入续期码</button><a class="btn primary" href="${esc((s.hub || '') + '/app')}" target="_blank" rel="noopener">去官网申请续期</a></div>` : '<p class="mp-note">续期由主账号在官网申请</p>') : ''}</section>`;
	// 这台路由器
	h += `<div class="sectitle"><b>这台路由器</b></div><section class="card"><dl class="mp-kv">
	<dt>名字</dt><dd>${esc((ME.router && ME.router.name) || '—')}</dd><dt>型号</dt><dd>${esc((ME.router && ME.router.model) || '—')}</dd><dt>面板版本</dt><dd>${esc(PANEL_VER || '—')}</dd>${edRow()}${lanRow()}
	${ME.role === 'sub' && ME.subExp ? `<dt>你能用到</dt><dd>${esc(ymd(ME.subExp))}</dd>` : ''}</dl>
	${ME.role === 'sub' ? `<div class="mp-perm">${Object.keys(PERM_N).map((k) => `<span class="${(ME.perms || []).includes(k) ? 'on' : ''}">${(ME.perms || []).includes(k) ? '✓' : '✕'} ${esc(PERM_N[k])}</span>`).join('')}</div><p class="mp-note" style="text-align:left">你是子账号：上面打勾的你能用，其他的由主账号决定。</p>` : ''}</section>`;
	// 家人
	const mm = MP.mem;
	h += `<div class="sectitle"><b>${main ? '家人（子账号）' : '这台路由器的主账号'}</b>${main && mm ? `<span class="muted" style="font-size:13px">${(mm.subs || []).length} / 10</span>` : ''}</div><section class="card">`;
	if (!mm) h += '<p class="muted" style="margin:0">读不到，稍后再试</p>';
	else if (main) {
		h += (mm.subs || []).map((x) => `<div class="mp-fb"><div class="mp-acc">${avHtml(x, 'mp-av sm')}<div><b>${esc(meName(x))}</b><span>${esc(x.email || '')} · ${x.off ? '已停用' : x.expired ? '期限到了' : esc(tplName(x.perms)) + ' · ' + ((x.perms || []).includes('alldev') ? '所有设备' : '只管自己的设备')}${x.exp && !x.expired ? ' · 到 ' + esc(ymd(x.exp)) : ''}</span>${!x.off && !x.expired && (x.perms || []).includes('net') ? '<span class="pill red mp-root">有完全控制</span>' : ''}</div></div><button class="btn sm" data-mp="sub" data-u="${esc(x.uid)}">管理</button></div>`).join('') || '<p class="muted" style="margin:0 0 4px;font-size:13.5px;line-height:1.7">还没有子账号。家里人也想用：给他生成一个加入码，他注册官网账号后加入，能做什么由你决定。</p>';
		// 6.0 第 17 项（风险 16）：6.0 以前加入的家人照旧能看和管所有设备，提示主账号自己决定
		const olds = (mm.subs || []).filter((x) => x.old && (x.perms || []).includes('alldev') && !x.off);
		if (olds.length) h += `<div class="notice" style="margin:8px 0 0">${olds.map((x) => '「' + esc(meName(x)) + '」').join('')}是 6.0 以前加入的，还能看和管所有设备。要改成只管自己的设备，点「管理」取消「看和管所有设备」。</div>`;
		h += (mm.joins || []).map((j) => `<div class="mp-fb"><div><b>加入码 <span class="mono">${esc(j.code)}</span></b><span>给「${esc(j.name || '家人')}」 · ${esc(tplName(j.perms))} · ${esc(ymdhm(j.exp))} 过期 · 还没人用</span></div><button class="btn sm" data-mp="jcancel" data-c="${esc(j.code)}">撤回</button></div>`).join('');
		h += `<div class="mp-acts"><button class="btn primary" data-mp="join"${(mm.subs || []).length + (mm.joins || []).length >= 10 ? ' disabled' : ''}>添加家人</button><button class="btn" data-mp="transfer"${(mm.subs || []).length ? '' : ' disabled'}>转让主账号</button></div>`;
	} else {
		const o = mm.owner;
		h += o ? `<div class="mp-fb"><div class="mp-acc">${avHtml(o, 'mp-av sm')}<div><b>${esc(meName(o))}</b><span>${esc(o.email || '')}</span></div></div><span class="pill mpok">主账号</span></div>` : '<p class="muted" style="margin:0">还没有主账号</p>';
		h += `<p class="mp-note" style="text-align:left">想多开一些功能，找主账号在「我的主页 → 家人」里改。</p><button class="btn danger" data-mp="leave" style="width:100%;margin-top:10px">退出这台路由器</button>`;
	}
	h += '</section>';
	// 敏感信息：联系方式、能打开这个面板的手机、登录记录（官网的密码、官网上登录的设备在官网「账号设置」里管）
	if (!sudoOn() || !MP.sec) {
		h += `<div class="sectitle"><b>敏感信息</b><span class="muted" style="font-size:13px">🔒 要验证</span></div><section class="card mp-lock">${LOCK_IC}
		<h3>验证一下才能看</h3>
		<ul class="mp-lockl"><li><b>联系方式</b><span>完整的登录邮箱</span></li><li><b>登录着的设备</b><span>哪些手机能打开这个面板，不认识的马上移除</span></li><li><b>登录记录</b><span>最近 30 天什么时候、在哪登录官网，成功还是失败</span></li>${ME_ROLE.role === 'sub' ? '' : '<li><b>这台路由器的钥匙</b><span>' + (store.get('rp_ai') === '1' ? 'AI 连接器地址、' : '') + (cinfo && cinfo.tablet ? '平板网址、' : '') + '换登录密钥</span></li>'}</ul>
		<div data-cwrap>${codeHtml(me.email)}</div>
		<p class="mp-note">验证一次，这个页面 10 分钟内不用再输</p></section>`;
	} else {
		const x = MP.sec, D = MP.devs, mins = Math.max(0, Math.ceil((SUDO.exp - Date.now()) / 1000)), hub = s.hub || '';
		const dl = D && D.list ? D.list : null;
		h += `<div class="sectitle mp-sec-h"><b>敏感信息</b><span class="pill mpok" id="mpLeft">已验证 · ${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')} 后自动锁上</span></div>
		<div class="mp-sub">联系方式</div><section class="card"><dl class="mp-kv"><dt>登录邮箱</dt><dd>${esc(x.email)} <span class="${x.verified ? 'mp-ok' : 'mp-warn'}" style="font-size:12px">${x.verified ? '已验证' : '没验证'}</span></dd></dl></section>
		${mpDevsHtml(dl, (ME_ROLE.role === 'sub' ? '你的账号登录着的手机。' : '这些手机能打开这个面板。') + '不认识的马上移除：移除后它要从官网重新打开才能进来。')}
		<div class="mp-sub">登录记录 · 最近 30 天</div><section class="card"><ul class="mp-tl">${(x.logins || []).slice(0, 20).map((l) => `<li><div class="d"${l.ok ? '' : ' style="color:#ff3b30"'}>${l.ok ? '✓' : '✕'}</div><div><b>${esc(l.ok ? ({ reg: '注册账号', reset: '重设密码' }[l.k] || '登录成功') : (l.why || '登录失败'))}</b><span>${esc([ymdhm(l.t), l.place, l.ua].filter(Boolean).join(' · '))}</span></div></li>`).join('') || '<li style="display:block"><span>最近 30 天没有登录记录</span></li>'}</ul></section>
		${hub ? `<div class="mp-sub">官网账号</div><section class="card list" style="padding:4px 12px"><a class="file" href="${esc(hub + '/app#settings')}" target="_blank" rel="noopener" style="background:none;margin:4px 0"><div><b>官网账号设置</b><span class="muted">修改密码、官网上登录着的 ${(x.sessions || []).length} 台设备、注销账号</span></div><span class="muted">›</span></a></section>` : ''}
		${mpKeysHtml()}
		<button class="btn" data-mp="lock" style="width:100%;margin-top:10px">现在锁上</button>`;
	}
	// 操作记录
	const L = MP.log || [];
	h += `<div class="sectitle"><b>操作记录</b><span class="muted" style="font-size:13px">这台路由器</span></div><section class="card"><ul class="mp-tl">${(MP.logAll ? L : L.slice(0, 6)).map((l) => `<li><div class="d">${esc(l.ic || '•')}</div><div><b>${esc(l.x)}</b><span>${esc(ymdhm(l.t))}</span></div></li>`).join('') || '<li style="display:block"><span>还没有记录</span></li>'}</ul>
	${!MP.logAll && L.length > 6 ? '<button class="btn sm" data-mp="logall" style="width:100%;margin-top:8px">看更多</button>' : ''}</section>`;
	// 我的反馈
	if (canPage('myfb')) h += `<section class="card list" style="margin-top:14px;padding:4px 12px"><button class="file" data-mp="fb" style="background:none;margin:4px 0"><div><b>我的反馈</b><span class="muted">处理到哪一步、开发者的回复</span></div><span class="muted">›</span></button></section>`;
	// 内容没变就不重画（比如从邮箱切回来时的自动刷新）：输到一半的验证码、键盘都保持原样
	if (h !== MP.h || !box.firstElementChild) {
		const ae = document.activeElement, foc = !!(ae && ae.matches && ae.matches('#meBox [data-code]')), sel = foc ? [ae.selectionStart, ae.selectionEnd] : null;
		box.innerHTML = h; MP.h = h;
		const cw = box.querySelector('[data-cwrap]');
		if (cw) codeBind(cw, mpCodeOpts);
		if (foc) { const i = box.querySelector('[data-code]'); if (i) { i.focus(); try { i.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
	}
	clearInterval(mpTimer);
	if (sudoOn() && MP.sec) mpTimer = setInterval(() => {
		const el = $('mpLeft'); if (!el || page !== 'me') { clearInterval(mpTimer); return; }
		const t = Math.ceil((SUDO.exp - Date.now()) / 1000);
		if (t <= 0) { clearInterval(mpTimer); sudoLock(); mpDraw(); return; }
		el.textContent = '已验证 · ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + ' 后自动锁上';
	}, 1000);
}
// 头像：裁成正方形、缩小、压缩（小于 60 KB）
async function mpAvatar(f) {
	const { img, done } = await imgOpen(f);
	try {
		const c = document.createElement('canvas'), n = 160, sz = Math.min(img.naturalWidth, img.naturalHeight);
		c.width = c.height = n;
		c.getContext('2d').drawImage(img, (img.naturalWidth - sz) / 2, (img.naturalHeight - sz) / 2, sz, sz, 0, 0, n, n);
		for (const [t, q] of [['image/webp', 0.85], ['image/jpeg', 0.85], ['image/jpeg', 0.6]]) { const d = c.toDataURL(t, q); if (d.startsWith('data:' + t) && d.length < 60000) return d; }
		throw new Error('图片太大了，换一张小一点的');
	} finally { done(); }
}
// 添加家人：选能做什么、用多久，生成加入码
function mpPermForm(perms, exp) {
	return `<div class="mp-tpls">${Object.keys(TPLS).map((k) => `<button type="button" class="chip" data-tpl="${k}">${esc(TPLS[k][0])}</button>`).join('')}</div>
	<div class="mp-perms">${Object.keys(PERM_N).map((k) => `<label class="mp-chk"><input type="checkbox" value="${k}"${perms.includes(k) ? ' checked' : ''}> ${esc(PERM_N[k])}</label>`).join('')}</div>
	<p class="mp-risk" data-risk hidden>「完全控制」能进原版后台、改 OpenClash 运行的脚本、恢复备份，有了就跟主账号一样，只给完全信任的人。</p>
	<p class="muted" style="font-size:12.5px;margin:6px 0 12px">看首页、网速、设备这些人人都能看；终端、文件管理、换密钥、托管服务设置只有主账号能用。</p>
	<label class="lglabel" style="margin-top:0">能用多久</label><select class="input" data-exp><option value="0">一直能用</option><option value="7">7 天</option><option value="30">30 天</option><option value="90">90 天</option><option value="365">一年</option>${exp ? `<option value="keep" selected>到 ${esc(ymd(exp))}（不变）</option>` : ''}</select>`;
}
function mpPermBind(m) {
	const sync = () => { const p = [...m.querySelectorAll('.mp-perms input:checked')].map((x) => x.value); m.querySelectorAll('[data-tpl]').forEach((b) => b.classList.toggle('on', tplKey(TPLS[b.dataset.tpl][1]) === tplKey(p))); const w = m.querySelector('[data-risk]'); if (w) w.hidden = !PERM_RISK.some((k) => p.includes(k)); };
	m.querySelectorAll('[data-tpl]').forEach((b) => (b.onclick = () => { const want = TPLS[b.dataset.tpl][1]; m.querySelectorAll('.mp-perms input').forEach((x) => (x.checked = want.includes(x.value))); sync(); }));
	m.querySelectorAll('.mp-perms input').forEach((x) => (x.onchange = sync)); sync();
	return () => { const p = [...m.querySelectorAll('.mp-perms input:checked')].map((x) => x.value), e = m.querySelector('[data-exp]').value; return { perms: p, subExp: e === 'keep' ? undefined : +e ? Date.now() + +e * 86400e3 : 0 }; };
}
async function mpJoin() {
	const v = await modal(`<div class="sheethead"><h3>添加家人</h3><button class="btn sm" data-v="close">关闭</button></div>
	<p class="muted" style="margin:0 0 10px;line-height:1.7">生成一个加入码（24 小时内有效，只能用一次）发给他。他注册官网账号以后用这个码加入，就能从官网打开这个面板。</p>
	<label class="lglabel" style="margin-top:0">怎么称呼他</label><input class="input" data-n maxlength="20" placeholder="比如：爸爸、小明">
	<label class="lglabel">他能做什么</label>${mpPermForm(TPLS.family[1], 0)}
	<button class="btn primary" data-ok style="width:100%;margin-top:14px">生成加入码</button>`, (m, close) => {
		const get = mpPermBind(m);
		m.querySelector('[data-ok]').onclick = () => close({ name: m.querySelector('[data-n]').value.trim(), ...get() });
	});
	if (!v || typeof v !== 'object') return;
	if (!(await mpRiskOk(v.perms, [], v.name))) return;
	let r; try { r = await famSudo('join_create', v, '添加家人'); } catch (e) { return toast(e.message, true); }
	if (!r) return;
	try { await loadQr(); } catch (e) {}
	await modal(`<div class="sheethead"><h3>加入码</h3><button class="btn sm" data-v="close">关闭</button></div>
	<div class="paircode">${esc(r.code.slice(0, 4) + ' ' + r.code.slice(4))}</div>
	${window.qrcode ? `<div class="qrbox">${qrSvg(r.link)}</div>` : ''}
	<p class="muted" style="margin:10px 0 0;line-height:1.7;font-size:13.5px">发给他：用手机扫码或打开链接，注册（或登录）官网账号，就会看到加入的确认。也可以在官网「我的路由器 → 添加路由器 → 加入家人」里输这个码。24 小时内有效，只能用一次。</p>
	<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-copy>复制链接</button><button class="btn primary" data-v="close">完成</button></div>`, (m) => { m.querySelector('[data-copy]').onclick = () => copyText(r.link); });
	loadMe();
}
async function mpSub(uid) {
	const x = ((MP.mem && MP.mem.subs) || []).find((y) => y.uid === uid); if (!x) return;
	// 6.0 第 69 项（用户 11/25）：一键让他名下所有设备不走代理（以后认领的也跟着）；只有 OpenClash / Nikki 能做
	let sp = null;
	if (pxAct()?.kind === 'clash') { try { sp = await P('split_get'); } catch (e) {} }
	const v = await modal(`<div class="sheethead"><h3>${esc(meName(x))}</h3><button class="btn sm" data-v="close">关闭</button></div>
	<p class="muted" style="margin:0 0 10px">${esc(x.email || '')} · ${esc(ymd(x.at))} 加入${x.off ? ' · <b>已停用</b>' : ''}</p>
	${sp && sp.kind ? `<label class="fld row" style="margin-bottom:8px"><div class="lb"><b>他的设备都不走代理</b></div><label class="sw"><input type="checkbox" data-fmbl${sp.fam && sp.fam[uid] ? ' checked' : ''} aria-label="他的设备都不走代理"><i></i></label></label>` : ''}
	${mpPermForm(x.perms || [], x.exp)}
	<button class="btn primary" data-ok style="width:100%;margin-top:14px">保存</button>
	<div class="btngrid three" style="margin:10px 0 0"><button class="btn" data-v="${x.off ? 'on' : 'off'}">${x.off ? '恢复' : '停用'}</button><button class="btn" data-v="owner">设为主账号</button><button class="btn danger" data-v="rm">移除</button></div>`, (m, close) => {
		const get = mpPermBind(m);
		m.querySelector('[data-ok]').onclick = () => close({ save: get() });
		const bl = m.querySelector('[data-fmbl]');
		if (bl) bl.onchange = async () => {
			const on = bl.checked; bl.disabled = true;
			try {
				const r = await P('split_set', { fam: { uid, on } }, 30000);
				toast(on ? '已设置：' + meName(x) + '的设备都不走代理' : '已恢复：' + meName(x) + '的设备跟随全局');
				const px = r.kind === 'nikki' ? 'Nikki' : 'OpenClash';
				if (r.restart && (await confirmBox('重启 ' + px, '重启后生效，断网十几秒。', '现在重启'))) { await P('split_restart'); toast('正在重启 ' + px); }
			} catch (e) { bl.checked = !on; toast(e.message, true); }
			bl.disabled = false;
		};
	});
	if (!v) return;
	try {
		if (v.save) { if (!(await mpRiskOk(v.save.perms, x.perms, meName(x)))) return; if (await famSudo('sub_set', { target: uid, ...v.save }, '改家人的权限')) toast('已保存'); }
		else if (v === 'off' || v === 'on') { if (v === 'off' && !(await confirmBox('停用 ' + meName(x), '停用后他的手机马上打不开面板；恢复以后他要从官网重新打开。', '停用', true))) return; if (await famSudo('sub_set', { target: uid, off: v === 'off' }, v === 'off' ? '停用家人' : '恢复家人')) toast(v === 'off' ? '已停用' : '已恢复'); }
		else if (v === 'rm') { if (!(await confirmBox('移除 ' + meName(x), '这台路由器会从他的官网账号里拿掉，他的手机马上打不开面板。', '移除', true))) return; if (await famSudo('sub_remove', { target: uid }, '移除家人')) toast('已移除'); }
		else if (v === 'owner') return mpTransfer(uid);
	} catch (e) { toast(e.message, true); }
	loadMe();
}
async function mpTransfer(uid) {
	const L = (MP.mem && MP.mem.subs) || [];
	if (!uid) {
		uid = await modal(`<div class="sheethead"><h3>转让主账号</h3><button class="btn sm" data-v="close">关闭</button></div>
		<p class="muted" style="margin:0 0 10px;line-height:1.7">选一个家人当主账号。转让以后他权限最大，你变成子账号（权限「几乎全部」），你的手机要从官网重新打开面板。</p>
		${L.map((x) => `<button class="mp-fb mp-pick" data-v="${esc(x.uid)}"><div class="mp-acc">${avHtml(x, 'mp-av sm')}<div><b>${esc(meName(x))}</b><span>${esc(x.email || '')}</span></div></div><span class="muted">›</span></button>`).join('')}`);
		if (!uid || uid === 'close') return;
	}
	const x = L.find((y) => y.uid === uid); if (!x) return;
	if (!(await confirmBox('把主账号转给 ' + meName(x) + '？', '转让后你变成子账号，不能自己改回来（要他再转给你）。', '转让', true))) return;
	try { if (await famSudo('transfer', { target: uid }, '转让主账号')) { toast('已转让，从官网重新打开面板'); setTimeout(() => location.reload(), 1200); } } catch (e) { toast(e.message, true); }
}
$('meBox').addEventListener('click', async (e) => {
	const b = e.target.closest('[data-mp]'); if (!b) return;
	const k = b.dataset.mp;
	if (k === 'av') { const f = await pickFile('image/*,.heic,.heif'); if (!f) return; busy(null, async () => { const a = await mpAvatar(f); await P('fam', { op: 'profile', avatar: a }, 30000); ME.me.avatar = a; store.set('rp_me', JSON.stringify(ME)); meRender(); mpDraw(); toast('头像换好了'); }); }
	else if (k === 'name') { const n = await promptBox('改名字', '最多 20 个字', meName(ME.me)); if (n == null) return; busy(null, async () => { await P('fam', { op: 'profile', name: n }, 30000); ME.me.name = n; store.set('rp_me', JSON.stringify(ME)); meRender(); mpDraw(); toast('名字改好了'); }); }
	else if (k === 'renew') svcSheet();
	else if (k === 'edsw') edSheet();
	else if (k === 'lancp') { const l = lanAddr(); if (l) copyText(l.url); }
	else if (k === 'lock') { sudoLock(); MP.h = ''; if (ME && ME.me && SVC && SVC.hosted && store.get('rp_dev') && !ME_ROLE.emerg) mpDraw(); else mpLocalDraw(); toast('已锁上'); }
	else if (k === 'kphone') addPhone();
	// 6.0 第 12 项：自建版「登录要输路由器后台密码」
	else if (k === 'kpw') {
		const on = store.get('rp_lpw') !== '1';
		if (!(await confirmBox(on ? '登录要输路由器后台密码' : '关掉登录时的路由器密码', on ? '开启后：新手机打开登录地址时，还要输一次路由器后台（root）密码才能登录；光有登录地址的人进不来，也不能直接用它操作路由器。\n已经登录的手机不受影响。AI 请用「AI 连接器地址」。' : '关掉后：拿到登录地址就能登录新手机。', on ? '开启' : '关掉', !on))) return;
		try { const r = await secP('login_pw_set', { on }); store.set('rp_lpw', r.on ? '1' : '0'); toast(r.on ? '已开启：登录要输路由器后台密码' : '已关掉'); mpLocalDraw(); } catch (e) { toast(e.message, true); }
	}
	else if (k === 'kckey') ckeySheet();
	else if (k === 'ktab') tabletUrlSheet();
	else if (k === 'kppp') pppSheet();
	else if (k === 'krot') rotateKey();
	// 能打开这个面板的手机：移除一台 / 除了这台全部移除（原来在「我的主页 → 敏感信息 → 登录着的设备」）
	else if (k === 'drm' || k === 'drmall') {
		const one = k === 'drm', nm = one ? (b.closest('.mp-fb').querySelector('b').firstChild || {}).textContent || '这台手机' : '';
		if (!(await confirmBox(one ? '移除这台手机' : '移除其他所有手机', one ? '「' + nm.trim() + '」要从官网重新打开才能进来。' : '除了这台，其他手机都要从官网重新打开才能进来。', one ? '移除' : '全部移除', true))) return;
		busy(b, async () => { await secP('device_remove', one ? { id: b.dataset.i } : { all_others: true }); MP.devs = await secP('device_list').catch(() => MP.devs); if (MP.sec) mpDraw(); else mpLocalDraw(); toast('已移除'); });
	}
	else if (k === 'logall') { MP.logAll = true; mpDraw(); }
	else if (k === 'fb') go('myfb');
	else if (k === 'join') mpJoin();
	else if (k === 'sub') mpSub(b.dataset.u);
	else if (k === 'transfer') mpTransfer();
	else if (k === 'jcancel') { busy(b, async () => { await famSudo('join_cancel', { code: b.dataset.c }, '撤回加入码'); toast('已撤回'); loadMe(); }); }
	else if (k === 'leave') {
		if (!(await confirmBox('退出这台路由器', '退出以后这台路由器从你的官网账号里拿掉，你的手机都打不开它的面板了。想再用要找主账号要新的加入码。', '退出', true))) return;
		busy(b, async () => { await P('fam', { op: 'leave' }, 30000); store.del('rp_dev'); store.del('rp_me'); store.del('rp_role'); toast('已退出'); setTimeout(() => location.reload(), 900); });
	}
});
let SVC_AT = 0; // 上次从路由器读到托管服务信息的时间（读到了说明路由器连得上）
async function svcLoad(force, noMe) {
	try { SVC = await P('svc_info', { force: !!force }); SVC_AT = Date.now(); store.set('rp_svc', JSON.stringify(SVC)); } catch (e) {}
	svcRender(); moreBtns(); if (!noMe) meLoad(false);
	return SVC;
}
try { SVC = JSON.parse(store.get('rp_svc') || 'null'); } catch (e) {}
meRender();
$('mSvcGo').onclick = () => { if (SVC && SVC.hub) window.open(SVC.hub + '/app', '_blank', 'noopener'); };
async function svcSheet() {
	const s = await svcLoad(true);
	if (!s || !s.hosted) return toast('这台路由器不是托管版', true);
	const left = s.exp ? Math.ceil((s.exp - Date.now()) / 86400e3) : null;
	modal(`<div class="sheethead"><h3>托管服务</h3><button class="btn sm" data-v="close">关闭</button></div>
	<div class="kv"><span>到期时间</span><b>${s.exp == null ? '查不到' : !s.exp ? '不限期' : esc(ymd(s.exp)) + (left > 0 ? '（还剩 ' + left + ' 天）' : '（已到期）')}</b></div>
	${s.exp ? `<p class="muted" style="font-size:13px;margin:10px 0 0;line-height:1.7">快到期时去官网账号页，在这台路由器下面点「申请续期」填个表，审核通过就自动续上，不用重装、不用换码。有续期码的也可以直接在这里输入。</p>
	<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-code>输入续期码</button><a class="btn primary" href="${esc(s.hub + '/app')}" target="_blank" rel="noopener">去官网申请续期</a></div>` : '<p class="muted" style="font-size:13px;margin:10px 0 0">这台路由器不限期，不用续期。</p>'}`,
	(m, close) => {
		const b = m.querySelector('[data-code]');
		if (b) b.onclick = async () => {
			const code = await promptBox('输入续期码', '找提供服务的人要的续期码');
			if (!code) return;
			try { const r = await P('svc_renew', { code }, 30000); toast('已续期 ' + r.days + ' 天，到期时间 ' + ymd(r.exp)); close(null); svcLoad(true); } catch (e) { toast(e.message, true); }
		};
	});
}
// 6.0：已登录的手机、AI 连接器地址、换登录密钥、自建版的「添加新手机」都只在「我的主页 → 敏感信息」里；系统操作里只留托管版的「添加新手机」（扫码只是打开官网）
function moreBtns() { const a = document.querySelector('#p-more [data-t="addphone"]'); if (a) a.classList.toggle('hidden', !isHosted()); const w = document.querySelector('#p-more [data-t="widget"]'); if (w) w.classList.toggle('hidden', !IN_APP6); }
/* 6.0 第 38 项：安卓桌面小组件（只在 App 6.0 里有）：路由器发一把只能看网速和在线设备数的钥匙，交给 App 存起来
   （面板网页碰不到手机功能，只能跳一个 routerpanel://widget 地址，App 只认面板自己的网址跳过来的） */
const IN_APP6 = /RouterPanelApp\/([6-9]|\d\d)\./.test(navigator.userAgent);
async function widgetAdd() {
	if (!(await confirmBox('添加桌面小组件', '桌面上显示网速和在线设备数。', '添加'))) return;
	try {
		const r = await P('widget_new');
		location.href = 'routerpanel://widget?k=' + encodeURIComponent(r.k) + '&n=' + encodeURIComponent(r.name);
	} catch (e) { toast(e.message, true); }
}
const agoS = (t) => { if (!t) return '—'; const s = Date.now() / 1000 - t; return s < 120 ? '刚刚' : s < 3600 ? Math.round(s / 60) + ' 分钟前' : s < 86400 ? Math.round(s / 3600) + ' 小时前' : Math.round(s / 86400) + ' 天前'; };
// 平板（证人）网址：带着平板的钥匙，只在「我的主页 → 敏感信息」验证后给
async function tabletUrlSheet() {
	let r;
	try { r = await secP('tablet_url'); } catch (e) { return toast(e.message, true); }
	if (!r.url) return toast('这台路由器没开云端监测，没有平板网址', true);
	modal(`<div class="sheethead"><h3>平板（证人）网址</h3><button class="btn sm" data-v="close">关闭</button></div>
	<p class="muted" style="margin:0 0 10px">在平板的 MacroDroid 里每分钟访问这个网址（设置方法在「断线记录 → 云端监测 → 平板设置方法」）。点一下显示：</p>
	<div class="qrbox blur keybox" style="word-break:break-all;font:13px/1.5 ui-monospace,monospace;padding:14px;text-align:left">${esc(r.url)}<span>点一下显示</span></div>
	<div class="notice w" style="margin-top:12px">⚠️ 只给家里那台平板用，别发给别人：别人拿到能冒充平板报平安，断电断网就判断不准了。</div>
	<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-copy>复制</button><button class="btn primary" data-v="close">完成</button></div>`,
	(m) => { qrReveal(m); m.querySelector('[data-copy]').onclick = () => copyText(r.url); });
}
/* 6.0 第 11 项：AI 能做什么（只读 / 危险操作要确认 / 完全放开），危险操作的请求推送到手机，点「允许」才执行 */
const AI_MODES = [['ro', '只读', '只能查看状态、设置和日志，什么都改不了'], ['ask', '危险操作要确认', '查看、换节点照常；重启、改设置、装卸软件、改规则要你在手机上点「允许」'], ['full', '完全放开', '什么都能直接做（6.0 以前就是这样）。连接器地址泄露了，别人也能直接改']];
function aiModesHtml(cur) {
	return AI_MODES.map(([k, t, d]) => `<button class="aimode${k === cur ? ' on' : ''}" data-aim="${k}" aria-pressed="${k === cur}"><b>${t}${k === 'ask' ? ' <span class="pill blue">推荐</span>' : ''}</b><span class="muted">${d}</span></button>`).join('');
}
function aiModesBind(box) {
	if (!box) return;
	box.onclick = async (e) => {
		const b = e.target.closest('[data-aim]'); if (!b || b.classList.contains('on')) return;
		const k = b.dataset.aim;
		if (k === 'full' && !(await confirmBox('改成「完全放开」？', 'AI 做任何事都不用你确认了，包括重启路由器、改设置、执行命令。拿到连接器地址的人也一样。', '改成完全放开', true))) return;
		busy(b, async () => { const r = await secP('ai_mode', { mode: k }); box.innerHTML = aiModesHtml(r.mode); toast('已改成「' + AI_MODES.find((x) => x[0] === r.mode)[1] + '」'); });
	};
}
// 永久允许过的操作（用户 11/27）：AI 做这些不再问，点「收回」以后又要确认
function aiAllowHtml(l) {
	if (!l || !l.length) return '';
	return `<div class="subhd">永久允许</div><div class="ailog">${l.slice().reverse().map((y) => `<div class="kv"><span>${esc(y.t)}<em class="muted"> · ${esc(ago(y.at * 1000))}${y.by ? ' · ' + esc(y.by) : ''}</em></span><button class="btn sm" data-aidel="${esc(y.k)}">收回</button></div>`).join('')}</div>`;
}
function aiAllowBind(box) {
	if (!box) return;
	box.onclick = (e) => {
		const b = e.target.closest('[data-aidel]'); if (!b) return;
		busy(b, async () => { const r = await secP('ai_allow_del', { k: b.dataset.aidel }); box.innerHTML = aiAllowHtml(r.allows); toast('已收回，以后要你确认'); });
	};
}
const AIQ = { on: true, at: 0, busy: false };
// 查一下有没有 AI 在等确认的请求：打开面板、回到面板、点了推送时查；开着的时候「危险操作要确认」才每 12 秒查一次
async function aiCheck(force) {
	if (!token || LK.on || AIQ.busy || store.get('rp_ai') !== '1' || !canPerm('net')) return;
	if (!force && (!AIQ.on || document.hidden || document.querySelector('.modal'))) return;
	AIQ.at = Date.now(); AIQ.busy = true;
	let r; try { r = await P('ai_asks', {}, 20000); } catch (e) { AIQ.busy = false; return; } finally { AIQ.busy = false; }
	AIQ.on = !!(r && r.ai && r.mode === 'ask');
	const w = ((r && r.list) || []).filter((x) => x.st === 'wait' && x.exp * 1000 > Date.now() + 3000);
	if (w.length && !document.querySelector('.modal')) aiAskBox(w[0], w.length);
}
function aiAskBox(x, n) {
	const left = () => Math.max(0, Math.round(x.exp - Date.now() / 1000));
	const mmss = () => Math.floor(left() / 60) + ':' + String(left() % 60).padStart(2, '0');
	modal(`<div class="aiask"><div class="aiask-ic" aria-hidden="true">✦</div><h3>AI 想要：${esc(x.title)}</h3>
	<p class="muted" style="margin:6px 0 0;line-height:1.65">AI 连接器发来的请求，你点「允许」才会执行。</p></div>
	<div class="cscroll">${x.detail ? `<pre class="out aiask-d">${esc(x.detail)}</pre>` : ''}
	<p class="muted aiask-t" style="text-align:center"><span data-left>${mmss()}</span> 后过期${n > 1 ? ' · 后面还有 ' + (n - 1) + ' 个' : ''}</p>
	<div class="notice" style="margin-top:10px;text-align:left">不是你让 AI 做的：点「拒绝」，再到「我的主页 → 敏感信息」换一下 AI 连接器地址。</div></div>
	<div class="cfoot"><div class="btngrid"><button class="btn danger" data-ans="no">拒绝</button><button class="btn primary" data-ans="ok">允许</button></div>${x.pt ? `<button class="btn aiask-always" data-ans="always">永久允许</button>` : ''}</div>`,
	(m, close) => {
		m.dataset.lock = '1';
		const t = setInterval(() => { const el = m.querySelector('[data-left]'); if (!el || !el.isConnected) return clearInterval(t); el.textContent = mmss(); if (!left()) { clearInterval(t); toast('这个请求过期了', true); close(null); } }, 1000);
		m.querySelectorAll('[data-ans]').forEach((b) => (b.onclick = () => busy(b, async () => {
			const ok = b.dataset.ans !== 'no', always = b.dataset.ans === 'always';
			try { const r = await P('ai_answer', { id: x.id, ok, always }, 20000); toast(r && r.always ? '已永久允许：以后' + x.pt + '不再问' : ok ? '已允许，AI 会接着做' : '已拒绝'); }
			catch (e) { toast(e.message, true); }
			clearInterval(t); close(null);
			setTimeout(() => aiCheck(true), 600);
		})));
	}, { compact: true });
}
async function ckeySheet() {
	let r;
	try { r = await secP('ckey_info'); } catch (e) { return toast(e.message, true); }
	if (!r.ai) return toast('这台路由器装的是纯面板版，没有 AI 连接器', true);
	modal(`<div class="sheethead"><h3>AI 连接器地址</h3><button class="btn sm" data-v="close">关闭</button></div>
	<p class="muted" style="margin:0 0 10px">在 AI 应用里添加连接器时填这个地址，就能在对话里管理路由器：Claude 在「设置 → 连接器 → 添加自定义连接器」；ChatGPT、Cherry Studio（接 DeepSeek、通义千问等）怎么加，看官网常见问题「能接哪些 AI」。它只给 AI 用，打不开面板。点一下显示：</p>
	<div class="qrbox blur keybox" style="word-break:break-all;font:13px/1.5 ui-monospace,monospace;padding:14px;text-align:left">${esc(r.url || '（还没有网址）')}<span>点一下显示</span></div>
	<div class="notice w" style="margin-top:12px">⚠️ 拿到这个地址就能让 AI 控制你的路由器：不要发给别人。泄露了就点「换一个地址」，旧的马上作废。</div>
	<div class="subhd">AI 能做什么</div>
	<div class="aimodes" data-aimodes>${aiModesHtml(r.mode || 'ask')}</div>
	<div data-aiallow>${aiAllowHtml(r.allows)}</div>
	${r.asks && r.asks.length ? `<div class="subhd">最近的请求</div><div class="ailog">${r.asks.slice().reverse().slice(0, 6).map((x) => `<div class="kv"><span>${esc(x.title)}<em class="muted"> · ${esc(ago(x.at * 1000))}</em></span><b class="${x.st === 'done' || x.st === 'ok' || x.st === 'auto' ? 'ok' : x.st === 'no' ? 'bad' : ''}">${{ wait: '等你确认', ok: '已允许', done: '已执行', no: '已拒绝', exp: '过期了', auto: '永久允许' }[x.st] || ''}</b></div>`).join('')}</div>` : ''}
	${r.url && /^http:/.test(r.url) ? '<div class="notice" style="margin-top:10px">本地版：只有连着家里 Wi-Fi 的电脑、手机能用这个地址。</div>' : ''}
	${r.hosted ? '<div class="notice" style="margin-top:10px">以前在 AI 应用里用「登录地址」加过连接器的：托管版现在不能用了，把它删掉，用这个地址重新添加。</div>' : ''}
	<div class="btngrid three" style="margin:12px 0 0"><button class="btn danger" data-rot>换一个地址</button><button class="btn" data-copy>复制</button><button class="btn primary" data-v="close">完成</button></div>`,
	(m, close) => {
		qrReveal(m);
		m.querySelector('[data-copy]').onclick = () => copyText(r.url);
		aiModesBind(m.querySelector('[data-aimodes]'));
		aiAllowBind(m.querySelector('[data-aiallow]'));
		m.querySelector('[data-rot]').onclick = async () => {
			if (!(await confirmBox('换一个连接器地址', '旧地址马上作废，AI 应用里要删掉旧连接器、用新地址重新添加。面板和登录不受影响。', '换新地址', true))) return;
			try { await secP('ckey_rotate', { confirm: 'CKEY' }); toast('已换新地址'); close(null); ckeySheet(); } catch (e) { toast(e.message, true); }
		};
	});
}
// 6.0 第 24 项：宽带拨号的账号和密码只在这里看（上网设置页只能改、不显示）
async function pppSheet() {
	let r;
	try { r = await secP('wan_secret'); } catch (e) { return toast(e.message, true); }
	if (!r.pppoe) { store.set('rp_ppp', '0'); if (MP.sec) mpDraw(); else mpLocalDraw(); return toast('这台路由器不是宽带拨号上网'); }
	store.set('rp_ppp', '1');
	modal(`<div class="sheethead"><h3>宽带账号和密码</h3><button class="btn sm" data-v="close">关闭</button></div>
	<dl class="mp-kv"><dt>账号</dt><dd class="mono" style="word-break:break-all">${esc(r.user || '—')}</dd></dl>
	<div class="qrbox blur keybox" style="word-break:break-all;font:14px/1.5 ui-monospace,monospace;padding:14px;text-align:left;margin-top:10px">${esc(r.pw || '（没设密码）')}<span>点一下显示密码</span></div>
	<div class="btngrid three" style="margin:12px 0 0"><button class="btn" data-cu>复制账号</button><button class="btn" data-cp>复制密码</button><button class="btn primary" data-v="close">完成</button></div>`,
	(m) => {
		qrReveal(m);
		m.querySelector('[data-cu]').onclick = () => copyText(r.user || '');
		m.querySelector('[data-cp]').onclick = () => copyText(r.pw || '');
	});
}
function hubBind() {
	modal(`<div class="sheethead"><h3>绑定到账号</h3><button class="btn sm" data-v="close">关闭</button></div><div data-hb><div class="muted" style="padding:20px 0;text-align:center">正在获取配对码…</div></div>`, (m) => {
		const box = m.querySelector('[data-hb]');
		const draw = async () => {
			try {
				const [p, accs] = await Promise.all([P('hub_pair', {}, 30000), P('hub_accounts', {}, 30000).catch(() => [])]);
				await loadQr();
				box.innerHTML = `<p class="muted" style="margin:0 0 6px">在官网登录账号，填入下面的配对码；或者用已登录官网的手机扫码。10 分钟内有效。</p>
				<div class="paircode">${esc(p.code.slice(0, 4) + ' ' + p.code.slice(4))}</div>
				<div class="qrbox">${qrSvg(p.url)}</div>
				<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-copy>复制链接</button><a class="btn primary" href="${esc(p.url)}" target="_blank" rel="noopener">打开官网</a></div>
				<div class="subhd">已绑定这台路由器的账号</div>
				${accs.length ? accs.map((a) => `<div class="kv"><span>${esc(a.email)}</span><button class="btn sm danger" data-unb="${esc(a.uid)}">移除</button></div>`).join('') : '<div class="muted" style="font-size:13px;margin-top:6px">还没有账号绑定</div>'}
				<p class="muted" style="font-size:12.5px;margin:12px 0 0">绑定了的账号可以在官网拿「登录码」：每台新手机第一次打开面板要输一次（还要有登录地址，或者用「添加新手机」扫码）。不认识的账号马上移除。</p>`;
				box.querySelector('[data-copy]').onclick = () => copyText(p.url);
				box.querySelectorAll('[data-unb]').forEach((b) => (b.onclick = async () => {
					if (!(await confirmBox('移除账号', '把 ' + b.closest('.kv').firstElementChild.textContent + ' 从这台路由器移除？对方的官网账号里就看不到这台路由器了。', '移除', true))) return;
					busy(b, async () => { await P('hub_unbind', { uid: b.dataset.unb }, 30000); toast('已移除'); await draw(); });
				}));
			} catch (e) { box.innerHTML = `<div class="notice w">${esc(e.message)}</div>`; }
		};
		draw();
	});
}
themeLabel();


/* 6.0 第 57、58 项：帮助改进（兼容情况匿名上报，默认开）、尝鲜（第 95 项：申请 → 开发者同意；能撤回、退出；被撤销要重新申请） */
const BETA_TXT = {
	none: '正式发布前先试新版本，随时能退回',
	sending: '正在提交申请',
	wait: '等审核',
	no: '没通过，可以重新申请',
	rev: '已撤销，可以重新申请',
	err: '没提交上',
};
function betaLine(b) {
	if (b.st === 'ok') return '已通过' + (b.ver ? '：v' + esc(b.ver) + ' 在「检查更新」里装' : '');
	return esc(BETA_TXT[b.st] || BETA_TXT.none) + (b.st === 'err' && b.why ? '：' + esc(b.why) : '');
}
// 申请尝鲜：说清楚会交什么。邮箱一律用官网账号的、打码显示、不能改（用户 11/26 定）：托管版是这台路由器主账号的；自建版先在官网登录关联
async function betaApply() {
	let who = null, tm = 0;
	const v = await modal(`<h3>申请尝鲜</h3><div class="cscroll">
		<p class="muted" style="margin:6px 0 0;line-height:1.6;text-wrap:pretty">仅上报型号、系统、版本、闪存、内存和当前留言内容。审核通过后将以邮件的形式通知您。</p>
		<label class="lglabel" for="btMail" style="margin-top:12px">邮箱</label><div style="display:flex;gap:8px;align-items:center"><input id="btMail" class="input" disabled placeholder="正在读取…" style="flex:1;min-width:0"><button class="btn sm hidden" data-login style="flex:none">登录官网账号</button></div>
		<label class="lglabel" for="btNote" style="margin-top:12px">留言（选填）</label><textarea id="btNote" class="input" rows="2" maxlength="200" placeholder="比如：闪存只有 16 MB" style="min-height:0;resize:none;font-family:inherit"></textarea>
		<div class="formerr hidden" data-err></div></div>
		<div class="btngrid" style="margin:12px 0 0"><button class="btn" data-v="close">取消</button><button class="btn primary" data-go disabled>申请</button></div>`, (m, close) => {
		const go = m.querySelector('[data-go]'), er = m.querySelector('[data-err]'), mail = m.querySelector('#btMail'), lg = m.querySelector('[data-login]');
		const err = (t) => { er.textContent = t; er.classList.toggle('hidden', !t); };
		// 问路由器（路由器问官网）：邮箱打码显示；自建版没关联账号时显示「登录官网账号」，登录回来自动再问
		const ask = async () => {
			clearTimeout(tm);
			try { who = await P('beta_who', {}, 30000); } catch (e) { mail.placeholder = '读不到'; err(e.message); return; }
			if (!document.body.contains(m)) return;
			mail.value = who.mail || ''; mail.placeholder = who.login ? '登录后自动填入' : '读不到';
			lg.classList.toggle('hidden', !who.login);
			go.disabled = !who.mail;
			err(who.mail || who.login ? '' : who.why || '读不到官网账号的邮箱，稍后再试');
			if (who.login) tm = setTimeout(ask, 4000);
		};
		lg.onclick = () => { if (who && who.lk) window.open(String(who.hub || 'https://yrlove520.com').replace(/\/$/, '') + '/app?bl=' + encodeURIComponent(who.lk), '_blank', 'noopener'); };
		const vis = () => { if (document.visibilityState === 'visible' && who && who.login) ask(); };
		document.addEventListener('visibilitychange', vis);
		new MutationObserver((_, o) => { if (!document.body.contains(m)) { clearTimeout(tm); document.removeEventListener('visibilitychange', vis); o.disconnect(); } }).observe(document.body, { childList: true });
		ask();
		go.onclick = () => busy(go, async () => {
			try { close(await P('beta_set', { want: true, note: m.querySelector('#btNote').value.trim() }, 40000)); } catch (e) { err(e.message); }
		}, '交给官网');
	}, { compact: true });
	return v && v.beta ? v : null;
}
async function compatSheet() {
	let r;
	try { r = await P('compat_info', { refresh: true }, 40000); } catch (e) { return toast(e.message, true); }
	const owner = ME_ROLE.role !== 'sub';
	const sw = (k, on, dis) => `<label class="sw"><input type="checkbox" data-sw="${k}"${on ? ' checked' : ''}${dis ? ' disabled' : ''} aria-label="${k === 'on' ? '帮助改进兼容性' : '参加尝鲜'}"><i></i></label>`;
	const draw = (m) => {
		const b = r.beta || {};
		m.querySelector('[data-body]').innerHTML = `<div class="kv cpk"><div><b>帮助改进兼容性</b><span class="muted">匿名报型号、系统和哪些功能能用，不含账号、IP 和网址</span></div>${sw('on', r.on, !owner)}</div>
		${r.last ? `<p class="muted" style="font-size:12.5px;margin:6px 0 0">最近一次：${esc(new Date(r.last * 1000).toLocaleString('zh-CN', { hour12: false }))}</p>` : ''}
		<div class="kv cpk" style="margin-top:12px"><div><b>尝鲜</b><span class="muted">${betaLine(b)}</span></div>${owner ? (['none', 'no', 'rev', 'err'].includes(b.st || 'none') ? '<button class="btn sm primary" data-bt="apply">申请</button>' : b.st === 'ok' ? '<button class="btn sm" data-bt="quit">退出</button>' : '<button class="btn sm" data-bt="quit">撤回</button>') : ''}</div>

		${owner ? '' : '<p class="muted" style="font-size:12.5px;margin:10px 0 0">只有主账号能改。</p>'}`;
		const bt = m.querySelector('[data-bt]');
		if (bt) bt.onclick = async () => {
			if (bt.dataset.bt === 'apply') { const x = await betaApply(); if (x) { r = x; toast(r.beta.st === 'err' ? '没提交上：' + (r.beta.why || '稍后再试') : '已申请', r.beta.st === 'err'); } draw(m); compatLabel(r); return; }
			const ok = b.st === 'ok';
			if (!(await confirmBox(ok ? '退出尝鲜' : '撤回申请', ok ? '以后收不到尝鲜版，已装的照常能用。再试要重新申请。' : '撤回后要重新申请。', ok ? '退出' : '撤回'))) return;
			busy(bt, async () => { try { r = await P('beta_set', { want: false }, 40000); toast(ok ? '已退出尝鲜' : '已撤回申请'); } catch (e) { toast(e.message, true); } draw(m); compatLabel(r); });
		};
		m.querySelectorAll('[data-sw]').forEach((x) => (x.onchange = async () => {
			const on = x.checked; x.disabled = true;
			try {
				r = await P('compat_set', { on }, 15000);
				toast(on ? '已打开，谢谢帮忙' : '已关掉，不再上报');
			} catch (e) { toast(e.message, true); }
			draw(m); compatLabel(r);
		}));
	};
	modal(`<div class="sheethead"><h3>帮助改进、尝鲜</h3><button class="btn sm" data-v="close">关闭</button></div><div data-body></div>
	<p class="muted" style="font-size:12.5px;margin:12px 0 0"><a href="${esc((store.get('rp_hub') || 'https://yrlove520.com') + '/privacy')}" target="_blank" rel="noopener">隐私政策</a></p>`, (m) => draw(m));
}
function compatLabel(r) { const el = $('compatState'); if (el && r) el.textContent = (r.on ? '帮助改进：开' : '帮助改进：关') + (r.beta && r.beta.want ? ' · ' + ({ ok: '尝鲜中', wait: '尝鲜等审核', sending: '尝鲜等审核', no: '尝鲜没通过', rev: '尝鲜已撤销' }[r.beta.st] || '尝鲜等审核') : ''); }
// 开不了这个功能：路由器已经记下来了；这里给个「报告这个问题」，内容自动填好
function compatFailPop(msg, method) {
	TOAST_MUTE = msg; setTimeout(() => { if (TOAST_MUTE === msg) TOAST_MUTE = ''; }, 3000);
	if (document.querySelector('.modal[data-cpf]')) return;
	modal(`<div class="sheethead"><h3>这台路由器开不了这个功能</h3></div>
	<div class="cscroll"><div class="notice" style="line-height:1.6;margin:0">${esc(msg)}</div>
	<p class="muted" style="font-size:12.5px;margin:10px 0 0;line-height:1.6">已记录 开着帮助改进会匿名报给开发者<br>修好后推送给你</p></div>
	<div class="cfoot"><div class="btngrid"><button class="btn" data-v="close">知道了</button><button class="btn primary" data-rep>报告这个问题</button></div></div>`,
	(m, close) => { m.dataset.cpf = 1; m.querySelector('[data-rep]').onclick = () => { close(null); feedbackSheet('功能开不了：' + msg + (method ? '（' + method + '）' : '')); }; }, { compact: true });
}

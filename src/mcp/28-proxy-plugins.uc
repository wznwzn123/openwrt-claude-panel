/* ---------- 代理插件：OpenClash、Nikki、PassWall、PassWall2、HomeProxy、SSR Plus+ ---------- */
// 每个插件的节点放在哪：uci 配置名、节点的类型、显示名字段、地址字段、端口字段、「当前节点」存在哪
const PXN = {
	passwall: { cfg: 'passwall', type: 'nodes', name: 'remarks', addr: 'address', port: 'port', cur: ['@global[0]', 'tcp_node'], en: ['@global[0]', 'enabled'] },
	passwall2: { cfg: 'passwall2', type: 'nodes', name: 'remarks', addr: 'address', port: 'port', cur: ['@global[0]', 'node'], en: ['@global[0]', 'enabled'] },
	homeproxy: { cfg: 'homeproxy', type: 'node', name: 'label', addr: 'address', port: 'port', cur: ['config', 'main_node'] },
	shadowsocksr: { cfg: 'shadowsocksr', type: 'servers', name: 'alias', addr: 'server', port: 'server_port', cur: ['@global[0]', 'global_server'] },
	openclash: { en: ['config', 'enable'], cfg: 'openclash' },
	nikki: { en: ['config', 'enabled'], cfg: 'nikki' },
};
// 概览每几秒刷新一次：8 秒内的结果直接用，不每次都去查
function px_detect(fresh) {
	let cf = '/tmp/cmcp_px.json', j = null;
	if (!fresh) { try { let c = json(readfile(cf) ?? 'null'); if (c && time() - c.at < 8) return c.px; } catch (e) {} }
	try { j = json(sh('/usr/sbin/cmcp-proxy json').out); } catch (e) {}
	if (type(j) != 'object') return { active: '', list: [] };
	writefile(cf, sprintf('%J', { at: time(), px: j }));
	return j;
}
// （问题反馈要用到上面的 px_detect：ucode 里函数要先声明后用，所以放在它后面）
/* ---------- 问题反馈 / 建议：托管版发到开通中心（管理员在管理页看、有邮件提醒）；自建版去 GitHub 提 ---------- */
function fb_diag() {
	let v = {}, px = px_detect(), mem = readfile('/proc/meminfo') ?? '';
	for (let l in split(readfile('/etc/claude-mcp/version') ?? '', '\n')) { let m = match(l, /^([A-Z]+)=(.*)$/); if (m) v[m[1]] = m[2]; }
	let pl = []; for (let x in px.list ?? []) push(pl, x.name + (x.id == px.active ? '（正在用）' : '') + (x.running ? '' : x.enabled ? '·没在跑' : '·关着'));
	return join('\n', [
		'面板版本：' + (v.VER ?? '未知') + ' · ' + (v.CODE ?? ''),
		'型号：' + trim(readfile('/tmp/sysinfo/model') ?? readfile('/proc/device-tree/model') ?? '未知'),
		'固件：' + (match(readfile('/etc/openwrt_release') ?? '', /DISTRIB_DESCRIPTION='([^']*)'/)?.[1] ?? '未知'),
		'代理插件：' + (length(pl) ? join('、', pl) : '没装'),
		'可用内存：' + int(+(match(mem, /MemAvailable:\s+(\d+)/)?.[1] ?? 0) / 1024) + ' MB',
		'已运行：' + int(+split(readfile('/proc/uptime') ?? '0', ' ')[0] / 3600) + ' 小时',
	]);
}
/* 反馈的编号（托管服务给的）：存在路由器上，用来查开发者的回复 */
const FB_CODES = '/etc/claude-mcp/fb.codes', FB_CACHE = '/tmp/cmcp_fbr.json';
// 查处理进度的网页（官网 /r/编号），不用登录，跟终端安装失败时给的是同一个页面
function fb_track(code) { let h = hub_conf(true)?.HUB ?? ''; return match(h, /^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?\/?$/) ? replace(h, /\/+$/, '') + '/r/' + uc(code) : null; }
function fb_codes() { let l = null; try { l = json(readfile(FB_CODES) ?? '[]'); } catch (e) {} return type(l) == 'array' ? filter(l, (x) => type(x) == 'object' && match(x.code ?? '', /^[a-z2-9]{8}$/)) : []; }
P.feedback = function(a) {
	let text = trim('' + (a?.text ?? '')), contact = trim('' + (a?.contact ?? ''));
	if (length(text) < 4) die('写几句遇到的问题或者建议吧');
	if (length(text) > 2000) die('写得太长了，2000 字以内');
	let diag = a?.diag ? fb_diag() : '';
	// 截图：手机上已经压缩成 JPEG，最多 3 张、每张 1.5MB 以内
	let imgs = [];
	for (let im in (type(a?.images) == 'array' ? slice(a.images, 0, 3) : [])) {
		if (type(im) == 'string' && length(im) < 2100000 && match(im, /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/)) push(imgs, im);
	}
	if (hub_conf(true)?.HUB) {
		let o = hub_call('/api/dev/feedback', { text, contact: substr(contact, 0, 80), diag, images: imgs }, 60);
		// 托管服务给的编号存在路由器上：开发者回复以后，打开面板时能看到（不用邮箱）
		if (match(o.code ?? '', /^[a-z2-9]{8}$/)) {
			let l = fb_codes(); push(l, { code: o.code, at: time() });
			writefile(FB_CODES, sprintf('%J', slice(l, -30)));
			sh('rm -f ' + FB_CACHE);   // 「我的反馈」马上能看到这条
		}
		let ok = match(o.code ?? '', /^[a-z2-9]{8}$/);
		return { ok: true, sent: 'hub', images: length(imgs), code: ok ? uc(o.code) : null, track: ok ? fb_track(o.code) : null };
	}
	// 自建版：没有开通中心，带着内容去 GitHub 提
	let body = text + (contact ? '\n\n联系方式：' + contact : '') + (diag ? '\n\n---\n' + diag : '');
	return { ok: true, sent: 'github', url: 'https://github.com/wznwzn123/openwrt-claude-panel/issues/new?title=' + CL.enc('[反馈] ' + substr(replace(text, /\s+/g, ' '), 0, 40)) + '&body=' + CL.enc(body) };
};
/* 我的反馈：一次问托管服务这台路由器发过的反馈（最近 90 天、最多 10 条），带进度、说明、完整记录。
   结果缓存 45 秒（面板开着时每分钟问一次、切回来时问一次）；看到哪一次记在 fb.codes 里，看过的不再弹窗 */
P.fb_replies = function(a) {
	let c = hub_conf(true);
	if (!c?.HUB) return { list: [], hosted: false };
	let cc = null; try { cc = json(readfile(FB_CACHE) ?? 'null'); } catch (e) {}
	let list = null;
	if (!a?.force && type(cc) == 'object' && time() - (cc.at ?? 0) < 45 && type(cc.list) == 'array') list = cc.list;
	if (list == null) {
		let o = null;
		try { o = hub_call('/api/dev/fb', {}, 10); } catch (e) {}
		if (type(o?.list) != 'array') return { list: type(cc?.list) == 'array' ? cc.list : [], hosted: true, stale: true };
		list = [];
		for (let x in o.list) if (type(x) == 'object' && match(x.code ?? '', /^[A-Z2-9]{8}$/)) push(list, { code: x.code, track: fb_track(x.code), kind: x.kind ?? '', text: x.text ?? '', at: x.at ?? 0,
			state: x.state ?? 'open', stage: x.stage ?? 1, ackAt: x.ackAt ?? 0, done: x.done ?? 0, nofix: x.nofix ?? 0, doneAt: x.doneAt ?? 0,
			reply: x.reply ?? '', replyAt: x.replyAt ?? 0, updated: x.updated ?? 0, history: type(x.history) == 'array' ? x.history : [] });
		writefile(FB_CACHE, sprintf('%J', { at: time(), list }));
	}
	let seen = {};
	for (let x in fb_codes()) seen[uc(x.code)] = x.seen ?? 0;
	return { list: map(list, (x) => { let y = {}; for (let k in x) y[k] = x[k]; y.seen = seen[x.code] ?? 0; return y; }), hosted: true };
};
// 看过了：记下看到哪一次更新（看过的不再弹窗；列表里还在）
P.fb_seen = function(a) {
	let code = lc('' + (a?.code ?? '')), upd = +(a?.updated ?? 0), l = fb_codes(), hit = false;
	if (!match(code, /^[a-z2-9]{8}$/)) die('编号不对');
	for (let x in l) if (x.code == code) { x.seen = upd; hit = true; }
	if (!hit) push(l, { code, at: time(), seen: upd });
	writefile(FB_CODES, sprintf('%J', slice(l, -30)));
	return { ok: true };
};
/* 实时联系开发者（4.0）：托管版凭这台路由器的托管钥匙；自建版第一次发消息时，向官网要一个匿名身份（存在 chat.conf，只有这台路由器知道钥匙）。
   面板开着这一页时每几秒来拿一次新消息；开发者回复了，托管版由官网推送，自建版由定时任务（cmcp-ann）每 30 分钟看一次再推送 */

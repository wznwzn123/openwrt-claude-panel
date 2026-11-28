/* ---------------- 订阅更新：除 OpenClash 外的代理插件（用户 11/26：所有的都要适配） ----------------
 * Nikki（config subscription）、PassWall / PassWall 2（subscribe_list）、SSR Plus+（server_subscribe_item，老版本 server_subscribe.subscribe_url）、
 * HomeProxy（subscription.subscription_url）。更新用插件自己的脚本（跟它原版页面的「更新」按钮一样），在后台跑；
 * 流量：直接问订阅地址，看机场回的 subscription-userinfo（跟 OpenClash 的 sub_info 一样）。订阅地址不发给手机。
 * 测试用：CMCP_SX_PX（假装正在用的插件）、CMCP_SX_RUN（把命令记到文件，不执行）、CMCP_SX_BUSY（「正在更新」标记文件） */
const SX_BUSY = getenv('CMCP_SX_BUSY') || '/tmp/cmcp_subx.busy';
const SX_NAME = { nikki: 'Nikki', passwall: 'PassWall', passwall2: 'PassWall 2', shadowsocksr: 'SSR Plus+', homeproxy: 'HomeProxy' };
function sx_px() { let e = getenv('CMCP_SX_PX'); return e != null ? e : (px_detect()?.active ?? ''); }
function sx_first(cfg, typ) { for (let s in (uci_load(cfg) ?? [])) if (s['.type'] == typ) return s; return null; }
function sx_host(u) { let m = match(u, /^[a-z]+:\/\/([^\/?#:]+)/i); return m ? m[1] : '订阅'; }
// [{ id, name, url, ua }]
function sx_list(px) {
	let out = [];
	if (px == 'nikki') {
		for (let s in (uci_load('nikki') ?? [])) if (s['.type'] == 'subscription' && s.url) push(out, { id: s['.name'], name: s.name || s['.name'], url: s.info_url || s.url, ua: s.user_agent || 'clash.meta' });
	} else if (px == 'passwall' || px == 'passwall2') {
		for (let s in (uci_load(px) ?? [])) if (s['.type'] == 'subscribe_list' && s.url) push(out, { id: s['.name'], name: s.remark || s['.name'], url: s.url, ua: s.user_agent || 'v2rayN/9.99' });
	} else if (px == 'shadowsocksr') {
		let g = sx_first('shadowsocksr', 'server_subscribe'), ua = g?.user_agent || 'v2rayN/9.99';
		for (let s in (uci_load('shadowsocksr') ?? [])) if (s['.type'] == 'server_subscribe_item' && s.url && s.enabled != '0') push(out, { id: s['.name'], name: s.alias || sx_host(s.url), url: trim(s.url), ua });
		if (!length(out)) { let i = 0; for (let u in as_list(g?.subscribe_url)) if (length(trim(u))) push(out, { id: 'legacy_' + ++i, name: sx_host(u), url: trim(u), ua }); }
	} else if (px == 'homeproxy') {
		let g = null; for (let s in (uci_load('homeproxy') ?? [])) if (s['.name'] == 'subscription') g = s;
		let i = 0; for (let u in as_list(g?.subscription_url)) if (length(trim(u))) push(out, { id: 'u' + ++i, name: sx_host(u), url: trim(u), ua: g?.user_agent || 'sing-box' });
	}
	return out;
}
function sx_run(cmd) { let f = getenv('CMCP_SX_RUN'); if (f) { let h = fs_open(f, 'a'); if (h) { h.write(cmd + '\n'); h.close(); } return; } bg(cmd); }
function sx_busy() { let st = stat(SX_BUSY); return !!st && time() - st.mtime < 900; }
function sx_need(px) { if (!SX_NAME[px]) die(px ? '这个插件的订阅在它的原版页面里更新' : '这台路由器没装代理插件'); }
P.subx_list = function() {
	let px = sx_px();
	if (!SX_NAME[px]) return { px: px || null, subs: [] };
	return { px, name: SX_NAME[px], subs: map(sx_list(px), (s) => ({ id: s.id, name: s.name })), busy: sx_busy() };
};
P.subx_info = function(a) {
	let px = sx_px(); sx_need(px);
	let s = null; for (let x in sx_list(px)) if (x.id == '' + a?.id) s = x;
	if (!s) die('没有这个订阅');
	let r = sh(sprintf('curl -sS -L -m 12 -o /dev/null -D - -A %s %s', shq(s.ua), shq(s.url)));
	let m = match(lc(r.out ?? ''), /subscription-userinfo:[ \t]*([^\r\n]+)/);
	if (!m) return { ok: false, msg: r.code != 0 ? '订阅地址连接失败' : '这个机场没有提供流量信息' };
	let o = { ok: true };
	for (let kv in split(m[1], ';')) { let p = match(trim(kv), /^([a-z]+)=([0-9.e+]+)/); if (p) o[p[1]] = +p[2]; }
	return o;
};
P.subx_state = function() { return { busy: sx_busy() }; };
// 更新全部订阅：插件自己的脚本，在后台跑，跑完删掉「正在更新」标记
P.subx_update = function() {
	let px = sx_px(); sx_need(px);
	if (sx_busy()) die('订阅正在更新，稍等');
	let subs = sx_list(px);
	if (!length(subs)) die(SX_NAME[px] + ' 还没有订阅：先在它的原版页面里添加');
	let cmd;
	if (px == 'nikki') {
		let prof = uci_get('nikki.config.profile') ?? '', cmds = map(subs, (s) => '/etc/init.d/nikki update_subscription ' + shq(s.id));
		// 正在用的配置就是其中一个订阅：更新完重启 Nikki 才会用上新的。Nikki 关着就不重启（以前会把关着的 Nikki 打开，用户 11/28 定修）
		if (match(prof, /^subscription:/)) push(cmds, SBIN + '/cmcp-proxy running nikki && /etc/init.d/nikki restart');
		cmd = join('; ', cmds);
	}
	else if (px == 'passwall' || px == 'passwall2') cmd = sprintf('lua /usr/share/%s/subscribe.lua start all manual', px);
	else if (px == 'shadowsocksr') cmd = '/usr/bin/lua /usr/share/shadowsocksr/subscribe.lua >>/var/log/ssrplus.log 2>&1';
	else cmd = '/etc/homeproxy/scripts/update_subscriptions.uc';
	writefile(SX_BUSY, '' + time());
	sx_run(sprintf('%s; rm -f %s', cmd, shq(SX_BUSY)));
	return { ok: true, n: length(subs) };
};
/* 订阅快用完、快到期提前提醒（11/27 全面检查第 15 条，用户定：剩不到 10% 或 3 天内到期就提前推送一次；第五阶段）：
   每天 9:00 体检（cmcp-daily）时调一次。所有代理插件都看：OpenClash 看正在用的配置对应的订阅，Nikki / PassWall / PassWall 2 / SSR Plus+ / HomeProxy 看全部订阅。
   同一个订阅同一次（同样的总流量、同样的到期时间）只推一次，续费、重置以后恢复正常就清掉，下次快用完再推。不在任何权限组（只有主账号 / 路由器自己能调）。
   测试用：CMCP_SR_SUBS（假的订阅列表 [{key, name}]）、CMCP_SR_INFO（{ key: 流量信息 }）、CMCP_SR_F（记推过的） */
const SR_F = getenv('CMCP_SR_F') || ETC + '/subwarn.json';
function sr_list() {
	let f = getenv('CMCP_SR_SUBS');
	if (f) return cmcp_readj(f, []);
	let out = [], px = sx_px();
	if (SX_NAME[px]) { for (let s in sx_list(px)) push(out, { key: px + ':' + s.id, name: s.name, id: s.id }); return out; }
	if (stat('/etc/init.d/openclash')) {
		let a = oc_all(), base = replace(replace('' + (a.config?.config_path ?? ''), /^.*\//, ''), /\.ya?ml$/, '');
		for (let s in (a.subs ?? [])) if (s.name == base && s.address) push(out, { key: 'oc:' + s.sid, name: s.name, sid: s.sid });
	}
	return out;
}
function sr_info(x) {
	let f = getenv('CMCP_SR_INFO');
	if (f) return cmcp_readj(f, {})[x.key];
	try { return x.sid ? P.sub_info({ sid: x.sid }) : P.subx_info({ id: x.id }); } catch (e) { return null; }
}
const sr_gb = (b) => b >= 1073741824 ? sprintf('%.1f GB', b / 1073741824.0) : sprintf('%d MB', (b - b % 1048576) / 1048576);
P.sub_remind = function() {
	let w = cmcp_readj(SR_F, {}), seen = {}, ch = false, sent = [], now = time();
	if (type(w) != 'object') w = {};
	for (let x in sr_list()) {
		let si = sr_info(x);
		seen[x.key] = 1;
		if (type(si) != 'object' || si.ok === false) continue;   // 取不到（机场没给流量信息、连不上）就不管，不清掉上次推过的
		let used = (+si.upload || 0) + (+si.download || 0), total = +si.total || 0, exp = +si.expire || 0, k = [], msg = [], low = false;
		if (total > 0 && (total - used) * 10 < total) { low = true; push(k, 'low:' + total); push(msg, total - used <= 0 ? '流量用光了' : '只剩 ' + sr_gb(total - used)); }
		if (exp > 0 && exp - now < 3 * 86400) { let sec = exp - now, d = (sec - sec % 86400) / 86400; /* 30-plugin-switch.uc 里的 int 不是取整，不用它 */ push(k, 'exp:' + exp); push(msg, exp <= now ? '已经到期' : d <= 0 ? '今天到期' : d + ' 天后到期'); }
		let key = join('|', k);
		if (!length(key)) { if (w[x.key]) { delete w[x.key]; ch = true; } continue; }
		if (w[x.key] == key) continue;
		w[x.key] = key; ch = true;
		let title = '机场订阅「' + x.name + '」' + (low ? (total - used <= 0 ? '流量用光了' : '快用完了') : exp <= now ? '已经到期' : '快到期了');
		try { sh(sprintf('%s/cmcp-notify warn sub %s %s %s >/dev/null 2>&1', SBIN, shq(title), shq(join('，', msg) + '。用完或到期以后节点都连不上，记得续费。'), shq('subwarn-' + x.key))); } catch (e) {}
		push(sent, x.key);
	}
	for (let k in keys(w)) if (!seen[k]) { delete w[k]; ch = true; }   // 订阅删掉了
	if (ch) cmcp_writej(SR_F, w);
	return { ok: true, sent };
};

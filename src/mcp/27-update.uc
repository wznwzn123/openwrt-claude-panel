P.update_check = function(a) {
	let v = ver_info(), cf = '/tmp/cmcp_latest.json', c = null, hubdown = false;
	try { c = json(readfile(cf) ?? 'null'); } catch (e) {}
	if (!c || a?.force || time() - (c.at ?? 0) > 3600) {
		let hub = match(readfile(ETC + '/hub.conf') ?? '', /(^|\n)HUB=(https?:\/\/[^\n]+)/)?.[2] ?? 'https://yrlove520.com';
		let j = null, o = sh(sprintf('curl -s -m 12 %s', shq(hub + '/api/router/version'))).out;
		try { j = json(o); } catch (e) {}
		// 自己搭的开通中心如果还是旧版，没有这个地址：退回老地址（curl 去问时回答的是路由器版本）。
		// 连都连不上（什么都没回）就不再试，免得面板等太久（11/27 全面检查第 6 条：原来最长 12+12+10 秒，超过面板的 25 秒）
		if (length(trim(o ?? '')) && (type(j) != 'object' || !j.version)) { try { j = json(sh(sprintf('curl -s -m 12 %s', shq(hub + '/api/app/version'))).out); } catch (e) {} }
		if (type(j) == 'object' && j.version) { c = { at: time(), latest: j.version, notes: j.notes ?? '', force: !!j.force, min: j.min ?? '', rel: j.at ?? '' }; writefile(cf, sprintf('%J', c)); }
		else if (!c) die('查不到最新版本：连不上官网，稍后再试');
		else hubdown = !!a?.force;
	}
	let newer = !length(v.cur) || v.cur == 'dev' ? true : ver_newer(c.latest, v.cur);
	// 用户自己点「检查更新」：顺便马上查一次热补丁（用户 11/27：紧急情况或者想快点更新，不用等 6 小时）。后台跑，装好了面板自己换新
	// 用户 11/27：点了要马上知道有没有新补丁——当场问一次官网最新是第几个（hotn），比现在装的大就后台马上装，面板等着换新
	let hotq = false, hotn = null;
	if (a?.force && !a?.nohot && stat(SBIN + '/cmcp-hot')) {
		if (!hubdown && match(v.cur ?? '', /^[0-9]+\.[0-9]+\.[0-9]+$/)) {
			let hub = match(readfile(ETC + '/hub.conf') ?? '', /(^|\n)HUB=(https?:\/\/[^\n]+)/)?.[2] ?? 'https://yrlove520.com';
			try { let j = json(sh(sprintf('curl -s -m 10 %s', shq(hub + '/api/router/hot?v=' + v.cur))).out); if (type(j?.n) == 'int' && j.n >= 0) hotn = j.n; } catch (e) {}
		}
		sh('nohup ' + SBIN + '/cmcp-hot check >/dev/null 2>&1 </dev/null &'); hotq = true;
	}
	// pv：面板网页该是哪一版（热补丁装过第 N 个就是「6.0.0-hN」），面板发现自己不一样就换成新的
	return { cur: v.cur || null, pv: v.cur ? v.cur + (v.hot ? '-h' + v.hot : '') : null, hot: v.hot, hotn, code: v.code || null, latest: c.latest, notes: c.notes, rel: c.rel ?? '', newer, force: newer && (c.force || (length(c.min) > 0 && length(v.cur) > 0 && ver_newer(c.min, v.cur))), hotq, stale: hubdown };
};
P.update_start = function(a) {
	if (a?.confirm != 'UPDATE') die('需要确认');
	let r = null;
	if (!stat('/usr/sbin/cmcp-update')) die('没能开始更新：路由器上没有 cmcp-update（版本太旧，先用安装命令手动升级一次）');
	// 只看最后一行：前面就算混进别的输出（工具的提示、警告），也不影响判断
	let out = trim(sh('/usr/sbin/cmcp-update start 2>/dev/null').out ?? '');
	let last = out ? split(out, '\n')[-1] : '';
	try { r = json(last); } catch (e) {}
	if (type(r) != 'object') die('没能开始更新：后台更新程序没有正常回应，稍后再试；一直这样就用安装命令手动升级一次');
	if (r.busy) die('已经在更新了，等一会儿');
	return { started: true };
};
P.update_status = function() {
	let s = null;
	try { s = json(readfile('/tmp/cmcp_update.json') ?? 'null'); } catch (e) {}
	if (type(s) != 'object') s = { state: 'idle' };
	// 「准备更新」超过 45 秒还没动，而且后台没在跑：说明没能转到后台，别让面板一直等
	if (s.state == 'queued' && time() - (+s.t || 0) > 45 && !stat('/tmp/cmcp_update.lock'))
		s = { ...s, state: 'failed', msg: '后台没能开始更新，再点一次「一键更新」试试；一直这样就用安装命令手动升级一次' };
	s.cur = ver_info().cur;
	return s;
};

/* ---------- 换一把新的登录密钥：旧的登录地址马上作废（截图泄露、手机丢了时用） ---------- */
P.rotate_key = function(a) {
	if (a?.confirm != 'ROTATE') die('需要确认');
	need_sudo(a, true);
	let nt = trim(sh("tr -dc 'a-z0-9' < /dev/urandom | head -c 40").out);
	if (length(nt) != 40) die('生成新密钥失败，稍后再试');
	let c = json(readfile(CONF_PATH) ?? '{}') ?? {};
	if (length(c.token ?? '') < 16) die('读不到现在的密钥，没有修改');
	c.token = nt;
	writefile(CONF_PATH + '.tmp', sprintf('%.J\n', c));
	rename(CONF_PATH + '.tmp', CONF_PATH);
	CONF = null;
	// 6.0 第 53 项：原版页面的门禁钥匙一起换（旧的马上作废，已登录的手机下次打开原版页面自动拿新的）
	luci_key_new();
	let cc = readfile('/etc/claude-mcp/cloud.conf') ?? '';
	// 自建完整版：云端（Worker）用登录密钥来认面板，要提醒用户把 Worker 的 PANEL_TOKEN 也换掉
	let selfcloud = match(cc, /(^|\n)URL=./) && !match(cc, /(^|\n)PKEY=./);
	try { sh(sprintf('/usr/sbin/cmcp-notify info key %s %s key', shq('登录密钥已更换'), shq('旧的登录地址已经作废，原版页面的门禁钥匙也一起换了。已经登录的手机照常能用；用旧登录地址加的 AI 连接器要换成「AI 连接器地址」。'))); } catch (e) {}
	return { token: nt, host: trim(readfile('/etc/claude-mcp/hostname') ?? ''), selfcloud: !!selfcloud };
};
P.cloud_info = function() {
	let c = {};
	for (let l in split(readfile('/etc/claude-mcp/cloud.conf') ?? '', '\n')) {
		let m = match(l, /^([A-Z]+)=(.*)$/);
		if (m) c[m[1]] = m[2];
	}
	if (!c.URL) return { enabled: false };
	// 托管版：面板读云端用单独的 PKEY（登录密钥不交给托管服务）；自建完整版自己部署的 Worker 认的是登录密钥（PANEL_TOKEN），
	// 6.0 起手机不再存登录密钥，只有自建完整版在这里拿一份给自己的 Worker 用（确认登录过的手机才拿得到）
	// 平板网址带着平板的钥匙：不在这里给，在「我的主页 → 敏感信息」里验证后才给（P.tablet_url）；这里只说有没有
	return { enabled: true, url: c.URL, tablet: !!c.TKEY, pkey: c.PKEY || (c.URL && !hub_conf(true) ? conf().token : null), hosted: !!c.PKEY, hub: hub_conf(true)?.HUB ?? null };
};

P.wd_check = function() {
	sh('/usr/sbin/cmcp-watchdog once');
	return P.wd();
};
P.wd_clear = function() {
	writefile(WD_EV, sprintf('%J\n', { t: time(), lvl: 'info', kind: 'watchdog', msg: '记录已清空', detail: '', from: 0, to: 0 }));
	return { ok: true };
};


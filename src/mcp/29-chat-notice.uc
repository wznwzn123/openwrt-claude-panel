const CHAT_CONF = '/etc/claude-mcp/chat.conf', CHAT_PEEK = '/tmp/cmcp_chatpeek.json';
function chat_id() {
	let c = hub_conf(true);
	if (c?.HUB) return { url: replace(c.HUB, /\/+$/, ''), auth: { sub: c.SUB, rkey: c.RKEY }, hosted: true };
	let j = null; try { j = json(readfile(CHAT_CONF) ?? 'null'); } catch (e) {}
	if (type(j) == 'object' && match(j.cid ?? '', /^[a-z2-9]{12}$/) && match(j.ckey ?? '', /^[a-z2-9]{32}$/) && match(j.hub ?? '', /^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?$/)) return { url: j.hub, auth: { cid: j.cid, ckey: j.ckey }, hosted: false };
	return null;
}
function chat_post(url, b, tmo) {
	let tf = trim(sh('mktemp /tmp/cmcp_chat.XXXXXX').out);
	if (!match(tf, /^\/tmp\/cmcp_chat\.[A-Za-z0-9]+$/)) die('路由器上建不了临时文件');
	writefile(tf, sprintf('%J', b));
	let r = sh(sprintf("curl -s -m %d -X POST -H 'Content-Type: application/json' --data-binary @%s %s; rm -f %s", tmo ?? 15, tf, shq(url + '/api/chat'), tf));
	let o = null; try { o = json(r.out); } catch (e) {}
	if (type(o) != 'object') die('连不上开发者那边（官网），检查一下路由器能不能上网，稍后再试');
	return o;
}
P.chat = function(a) {
	let op = '' + (a?.op ?? 'get');
	if (index(['get', 'send', 'img', 'peek'], op) < 0) die('不认识的操作');
	let id = chat_id();
	if (!id) {
		// 自建版还没说过话：看的时候不建身份，发第一条时才建
		if (op != 'send') return { ok: true, msgs: [], uu: 0, seq: 0, hosted: false, none: true };
		let hub = CL.ann_hub();
		let host = trim(readfile('/proc/sys/kernel/hostname') ?? '') || 'OpenWrt', model = trim(readfile('/tmp/sysinfo/model') ?? '');
		let r = chat_post(hub, { op: 'anon', name: substr(host, 0, 40), model: substr(model, 0, 60) }, 15);
		if (!match(r.cid ?? '', /^[a-z2-9]{12}$/)) die(r.error ?? '开不了对话，稍后再试');
		writefile(CHAT_CONF + '.tmp', sprintf('%J', { cid: r.cid, ckey: r.ckey, hub, at: time() }));
		sh('chmod 600 ' + shq(CHAT_CONF + '.tmp'));
		rename(CHAT_CONF + '.tmp', CHAT_CONF);
		id = chat_id();
		if (!id) die('开不了对话，稍后再试');
	}
	let b = { op: op == 'peek' ? 'get' : op };
	for (let k in id.auth) b[k] = id.auth[k];
	if (op == 'get') { b.after = +(a?.after ?? 0) || 0; b.read = !!a?.read; }
	if (op == 'peek') b.after = 99999999;
	if (op == 'img') b.seq = +(a?.seq ?? 0) || 0;
	if (op == 'send') {
		b.text = substr('' + (a?.text ?? ''), 0, 8000);
		if (a?.img) b.img = '' + a.img;
		b.ver = ver_info().cur; b.ua = substr('' + (a?.ua ?? ''), 0, 300);
	}
	let r = chat_post(id.url, b, op == 'send' ? 45 : 15);
	// 自建版的匿名身份在官网那边没了（比如被删）：作废，下次发消息重新建
	if (r.relogin && !id.hosted) sh('rm -f ' + shq(CHAT_CONF));
	if (r.error) die(r.error);
	r.hosted = id.hosted;
	if (op != 'img') writefile(CHAT_PEEK, sprintf('%J', { at: time(), uu: r.uu ?? 0, seq: r.seq ?? 0, blocked: !!r.blocked }));
	return r;
};
// 通知页 / 铃铛用：有没有开发者的新回复（缓存 50 秒；还没说过话的不去问）
function chat_peek() {
	let id = chat_id();
	if (!id) return null;
	let c = null; try { c = json(readfile(CHAT_PEEK) ?? 'null'); } catch (e) {}
	if (type(c) == 'object' && time() - (c.at ?? 0) < 50) return c;
	try { P.chat({ op: 'peek' }); c = json(readfile(CHAT_PEEK) ?? 'null'); } catch (e) {}
	return type(c) == 'object' ? c : null;
}
/* 通知（4.0）：路由器上的断线/故障记录、公告、反馈进度一次给面板；云端的（断电、托管服务）面板自己去云端拿。
   看到哪儿了记在 notices.seen（t：这个时间以前的都看过了；pop：弹过的重要公告），换手机打开也一样 */
const NT_SEEN = '/etc/claude-mcp/notices.seen';
function nt_seen() {
	let s = null; try { s = json(readfile(NT_SEEN) ?? 'null'); } catch (e) {}
	// 第一次（刚装好 / 刚升级）：以前的记录都算看过，不然一打开就是一大堆「新」
	if (type(s) != 'object' || type(s.t) != 'int' && type(s.t) != 'double') { s = { t: time() * 1000, pop: [] }; writefile(NT_SEEN, sprintf('%J', s)); }
	if (type(s.pop) != 'array') s.pop = [];
	return s;
}
P.notices = function(a) {
	let an = null; try { an = CL.ann_list(8); } catch (e) {}
	let lines = split(trim(readfile(WD_EV) ?? ''), '\n'), ev = [];
	for (let i = length(lines) - 1; i >= 0 && length(ev) < 100; i--) { if (!length(lines[i])) continue; try { let e = json(lines[i]); if (type(e) == 'object' && e.t) push(ev, e); } catch (e) {} }
	let fb = null; try { fb = P.fb_replies({}); } catch (e) {}
	let s = nt_seen(), app = null;
	// 在安卓 App 里打开的：顺便看 App 有没有新版本（6 小时问一次；App 自己首页会弹更新）
	if (a?.app) {
		let cf = '/tmp/cmcp_appver.json';
		try { app = json(readfile(cf) ?? 'null'); } catch (e) {}
		if (type(app) != 'object' || time() - (app.at ?? 0) > 21600) {
			let j = null;
			try { j = json(sh(sprintf("curl -s -m 8 -A 'router-panel' %s", shq(CL.ann_hub() + '/api/app/version'))).out); } catch (e) {}
			app = type(j) == 'object' && j.version ? { at: time(), version: j.version, notes: j.notes ?? '', rel: j.at ?? '', force: !!j.force, min: j.min ?? '' } : { at: time() - 20000, version: app?.version ?? '' , notes: app?.notes ?? '', rel: app?.rel ?? '', force: !!app?.force, min: app?.min ?? '' };
			writefile(cf, sprintf('%J', app));
		}
	}
	let cp = null; try { cp = chat_peek(); } catch (e) {}
	return { now: time(), app, chat: cp, ann: an?.list ?? [], annAt: an?.at ?? 0, annFail: !!an?.fail, events: ev, fb: fb?.list ?? [], hosted: !!fb?.hosted, seen: { t: s.t, pop: s.pop } };
};
P.notices_seen = function(a) {
	let s = nt_seen(), ch = false, t = +(a?.t ?? 0), lim = time() * 1000 + 60000;
	if (t > s.t) { s.t = t > lim ? lim : t; ch = true; }
	let id = '' + (a?.pop ?? '');
	if (length(id)) { if (!match(id, /^[a-z2-9]{10}$/)) die('公告编号不对'); if (index(s.pop, id) < 0) { push(s.pop, id); s.pop = slice(s.pop, -50); ch = true; } }
	if (ch) writefile(NT_SEEN, sprintf('%J', s));
	// 公告统计（5.0）：告诉开发者「这台点开看了哪几条」（匿名编号；后台发，不等它）
	if (ch) {
		let ids = [], c = null;
		try { c = json(readfile('/tmp/cmcp_ann.json') ?? 'null'); } catch (e) {}
		for (let x in (type(c?.list) == 'array' ? c.list : [])) if (type(x) == 'object' && match('' + x.id, /^[a-z2-9]{10}$/) && (x.id == id || (t > 0 && +(x.upd ?? x.at ?? 0) <= t))) push(ids, x.id);
		if (length(ids)) try { sh(sprintf("(curl -s -m 15 -X POST -H 'Content-Type: application/json' -d %s %s >/dev/null 2>&1 &)", shq(sprintf('%J', { r: CL.ann_rid(), ids: slice(ids, 0, 20) })), shq(CL.ann_hub() + '/api/notices/seen'))); } catch (e) {}
	}
	return { ok: true, seen: s };
};
// 面板脚本出错（5.0）：转给开发者的「出错记录」，帮着发现手机上才出现的问题；只带错误本身和手机型号、屏幕大小，不带任何设置和密钥。
// 每台路由器一小时最多转 10 条
P.client_error = function(a) {
	let f = '/tmp/cmcp_cerr.json', st = null, now = time();
	try { st = json(readfile(f) ?? 'null'); } catch (e) {}
	if (type(st) != 'object' || now - (+st.h || 0) >= 3600) st = { h: now, n: 0 };
	if (st.n >= 10) return { ok: true, sent: false };
	st.n++;
	writefile(f, sprintf('%J', st));
	let s = (v, n) => substr(replace('' + (v ?? ''), /[\r\n\t]+/g, ' '), 0, n);
	let ver = trim(readfile('/etc/claude-mcp/version') ?? '');
	let m = match(ver, /VER=([^\n]+)/);
	let b = { msg: s(a?.msg, 300), where: s(a?.where, 120), stack: substr('' + (a?.stack ?? ''), 0, 800), page: s(a?.page, 30), ua: s(a?.ua, 60), w: +(a?.w ?? 0), h: +(a?.h ?? 0), ver: m ? m[1] : '' };
	if (!length(b.msg)) return { ok: true, sent: false };
	try { sh(sprintf("(curl -s -m 15 -X POST -H 'Content-Type: application/json' -d %s %s >/dev/null 2>&1 &)", shq(sprintf('%J', b)), shq(CL.ann_hub() + '/api/cerr'))); } catch (e) {}
	return { ok: true, sent: true };
};
P.feedback_diag = function() { return { text: fb_diag(), hosted: !!hub_conf(true)?.HUB }; };
// 「@global[0]」这种匿名节：换成真正的节名
function px_sec(c, cfg, s) {
	let m = match(s, /^@([a-z_]+)\[([0-9]+)\]$/);
	if (!m) return s;
	let i = 0, out = null;
	c.foreach(cfg, m[1], (x) => { if (i++ == +m[2]) { out = x['.name']; return false; } });
	return out;
}
function px_nodes(id) {
	let d = PXN[id];
	if (!d?.type) return null;
	let c = require('uci').cursor(); c.load(d.cfg);
	let cs = px_sec(c, d.cfg, d.cur[0]), cur = cs ? c.get(d.cfg, cs, d.cur[1]) : null, list = [];
	c.foreach(d.cfg, d.type, (x) => {
		let p = x.protocol ?? '';
		push(list, { id: x['.name'], name: x[d.name] || x['.name'], kind: x.type ?? '', proto: p, addr: x[d.addr] ?? '', port: x[d.port] ?? '',
			group: p == '_shunt' ? '分流' : p == '_balancing' ? '负载均衡' : p == '_urltest' ? '自动选择' : p == '_iface' ? '接口' : '' });
	});
	return { cur: cur && cur != 'nil' ? cur : '', list };
}
function px_name(id) { return { openclash: 'OpenClash', nikki: 'Nikki', passwall: 'PassWall', passwall2: 'PassWall2', homeproxy: 'HomeProxy', shadowsocksr: 'SSR Plus+' }[id] ?? id; }
function px_check(id) { if (!PXN[id] || !stat('/etc/init.d/' + id)) die('路由器上没有装 ' + px_name(id)); }
// 状态：装了哪些、正在用哪个；不是 Clash 内核的插件顺便带上当前节点
P.px = function() {
	let j = px_detect(), a = j.active;
	if (a && PXN[a]?.type) {
		let n = px_nodes(a);
		j.cur = n?.cur ?? '';
		for (let x in n?.list ?? []) if (x.id == j.cur) j.curName = x.name;
		j.count = length(n?.list ?? []);
	}
	return j;
};
P.px_nodes = function(a) { px_check(a?.id); let n = px_nodes(a.id); if (!n) die(px_name(a.id) + ' 的节点在它自己的控制面板里管理'); return n; };
// 切换节点：改设置、重启插件（后台重启，马上返回；断网十几秒）
P.px_set = function(a) {
	px_check(a?.id);
	let d = PXN[a.id], n = px_nodes(a.id);
	if (!n) die('这个插件不能在这里切换节点');
	let ok = false; for (let x in n.list) if (x.id == a.node) ok = true;
	if (!ok) die('没有这个节点');
	let c = require('uci').cursor(); c.load(d.cfg);
	let cs = px_sec(c, d.cfg, d.cur[0]);
	if (!cs) die('读不到 ' + px_name(a.id) + ' 的设置');
	c.set(d.cfg, cs, d.cur[1], a.node); c.commit(d.cfg);
	sh('( sleep 1; /etc/init.d/' + a.id + ' restart ) >/dev/null 2>&1 </dev/null &');
	return { ok: true };
};
// 开 / 关 / 重启插件
P.px_ctl = function(a) {
	px_check(a?.id);
	let d = PXN[a.id], op = a.op;
	if (op == 'enable' || op == 'disable') {
		if (!d.en) die(px_name(a.id) + ' 没有总开关：选好节点就开着，在它自己的页面里停用');
		let c = require('uci').cursor(); c.load(d.cfg);
		let cs = px_sec(c, d.cfg, d.en[0]);
		if (!cs) die('读不到 ' + px_name(a.id) + ' 的设置');
		c.set(d.cfg, cs, d.en[1], op == 'enable' ? '1' : '0'); c.commit(d.cfg);
		op = op == 'enable' ? 'restart' : 'stop';
	}
	if (!(op in ['start', 'stop', 'restart'])) die('不支持的操作：' + op);
	sh('( sleep 1; /etc/init.d/' + a.id + ' ' + op + ' ) >/dev/null 2>&1 </dev/null &');
	sh('rm -f /tmp/cmcp_px.json');
	return { ok: true };
};

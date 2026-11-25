
/* ---------------- 6.0 第 94 项：托管版的「AI 版 / 本地版」 ----------------
 * 本地版：不装隧道，只能在家里局域网打开面板（http://路由器地址:906）；记号是 /etc/claude-mcp/local。
 * 换版本由 /usr/sbin/cmcp-edition 在后台做（装 / 删隧道程序、问官网开通 / 关掉隧道、失败自动退回），面板看 /tmp/cmcp_ed.json 的进度。
 * 只有主账号能换；自建版没有这个。 */
const ED_ST = getenv('CMCP_ED_ST') || '/tmp/cmcp_ed.json';
// 现在是哪个版本：ai / local / noai（旧的托管纯面板版）；自建版 null
function ed_now() {
	if (!is_hosted()) return null;
	if (stat(ETC + '/local')) return 'local';
	return conf().ai === false ? 'noai' : 'ai';
}
function ed_job() { let j = cmcp_readj(ED_ST, null); return type(j) == 'object' && j.id ? j : null; }
function ed_free() { let m = match(sh('df -k /overlay 2>/dev/null | awk \'NR==2 { print int($4 / 1024) }\'').out, /(\d+)/); return m ? +m[1] : null; }
P.edition_get = function() {
	let ed = ed_now();
	if (!ed) return { ed: null };
	return { ed, lan: lan_addr(), job: ed_job(), free: ed_free(), owner: ROLE != 'sub' };
};
P.edition_set = function(a) {
	let ed = ed_now();
	if (!ed) die('只有托管版能换版本');
	if (ROLE == 'sub') die('只有主账号能换版本');
	let to = '' + (a?.to ?? '');
	if (to != 'ai' && to != 'local') die('要换成哪个版本？');
	if ((to == 'local' && ed == 'local') || (to == 'ai' && ed == 'ai')) die('已经是' + (to == 'local' ? '本地版' : ' AI 版') + '了');
	let j = ed_job();
	if (j && j.state == 'run' && time() - (j.at ?? 0) < 600) die('正在换版本，等这次做完');
	if (stat('/tmp/cmcp_upd.lock')) die('正在更新面板，更新完再换');
	let id = trim(sh("tr -dc 'a-km-np-z2-9' < /dev/urandom | head -c 10").out);
	if (!match(id, /^[a-z2-9]{10}$/)) die('生成编号失败，再试一次');
	writefile(ED_ST, sprintf('%J\n', { id, to, state: 'run', step: '', msg: '准备中', at: time() }));
	// 在后台做：换成本地版时隧道会停，这个请求要先回去
	sh(sprintf('(sleep 1; %s/cmcp-edition to-%s %s >/dev/null 2>&1) </dev/null >/dev/null 2>&1 &', SBIN, to, id));
	return { ok: true, id, to, lan: lan_addr() };
};
P.edition_state = function() { return { job: ed_job(), ed: ed_now() }; };

/* ---- 托管服务到期或被停用：家里局域网、应急登录、AI 连接器也都不能用了（只留看状态、输续期码） ----
 * 以前到期只是隧道网址打不开；6.0 有了局域网入口和本地版，要在路由器上也挡住。
 * 按官网上次说的（/tmp/cmcp_svc.json，面板打开时会刷新，最多 1 小时）；连不上官网、没问过的不挡。 */
const SVC_OPEN = ['whoami', 'svc_info', 'svc_renew', 'notices', 'notices_seen', 'client_error', 'compat_info', 'edition_state'];
function svc_gate(msg, p) {
	if (!is_hosted() || (!DEV && MODE != 'ai')) return null; // 路由器自己的小工具不挡
	let s = cmcp_readj('/tmp/cmcp_svc.json', null);
	if (type(s) != 'object' || !s.off) return null;
	let m = substr(msg.method ?? '', 0, 6) == 'panel/' ? substr(msg.method, 6) : null;
	if (m && index(SVC_OPEN, m) >= 0) return null;
	if (MODE == 'ai' && msg.method != 'tools/call') return null; // AI 连接器握手照常，调工具时说清楚
	return s.why == 'exp'
		? '托管服务到期了，续期以后才能用：在官网「我的路由器」申请续期，或者在面板里输入续期码'
		: '这台路由器的托管服务停用了：请联系提供服务的人';
}
const ED_WHO0 = P.whoami;
P.whoami = function(a) {
	let r = ED_WHO0(a);
	r.ed = ed_now();
	let s = cmcp_readj('/tmp/cmcp_svc.json', null);
	if (is_hosted() && type(s) == 'object' && s.off) r.svc_off = s.why == 'exp' ? 'exp' : 'admin';
	return r;
};

// 托管服务（开通中心）：给别人的路由器自动开通专属网址 + 隧道，管邀请码、人数上限、封禁、回收
// 只在托管模式下用（wrangler 配置里设了 BASE_DOMAIN）；自建模式完全用不到这个文件
//
// 安全设计（重要）：
// - 路由器的登录密钥只在路由器和用户自己的手机上生成、保存，这里从来拿不到
// - 这里只发「云端钥匙」：RKEY（路由器心跳/通知/备份）、TKEY（平板证人）、PKEY（面板读云端状态、管推送）
//   这三把钥匙只能操作这台路由器自己的云端数据，进不了路由器
// - 网址（子域名）由这里随机分配，用户不能指定；删除、封禁只能由路由器自己（凭 RKEY）或管理员来做
// - Cloudflare API 令牌只存在 Worker 的密钥里，不发给任何路由器
import { DurableObject } from 'cloudflare:workers';
import { HOME, APP, ADMIN, PRIVACY, SECURITY, REPLY, NOTICE, TERMS, CHANGELOG, STATUS, HELP, COMPAT, ADMIN_APP, ADMIN_FILES, FONT_GEIST, KIT_FILES, IMG_FILES, CSP_SCRIPTS } from './site.js';
import { installOps, chatApi, opsAdmin, isBot } from './ops.js';
import { installV5, v5Public, v5Admin, v5Scheduled } from './v5.js';
import { installFam, famAccount, famDev, famAdmin, famAdminUser, permsOf } from './fam.js';
import { installInst, instAccount, instAdmin } from './inst.js';
import { installFiles, filesRoute, filesScheduled, fileStartFor, signFiles } from './files.js';
import { changelogOf } from './changelog.js';
import { installHelp, helpPublic, helpAdmin, statusScheduled } from './help.js';
import { installTotp } from './totp.js';
import { installEdition, edDev, edAccount, ED_NAME } from './edition.js';
import { installXpage, xDev } from './xpage.js';
import { installMove, moveDev } from './move.js';
import { installAppAuth, appStrict } from './appauth.js';
import { installCompat, compatPublic, compatAdminApi, compatAccount, prereleaseRefresh } from './compat.js';
import { installOldVer, ovScheduled, ovAccount } from './oldver.js';
import { APPS, APPS_V, APPS_CATS } from './apps-data.js';

let APPS_JSON = null; // /api/apps 的回复（第一次用到才拼）
export const SUB_RE = /^[a-z2-9]{8}$/;
const ABC = 'abcdefghijkmnpqrstuvwxyz23456789'; // 32 个字符，去掉了容易看错的 l、o、0、1
// 反馈现在的状态：已修复 / 无法修复 / 还没处理完
const fbState = (x) => (x.done ? 'fixed' : x.nofix ? 'nofix' : 'open');
// 给反馈的人看的样子：进度三段（反馈成功 → 开发人员已收到 → 已修复 / 无法修复）、最新说明、完整记录；
// withText：带上自己当时写的内容（只给凭路由器钥匙或登录账号来查的；公开的编号查询不带）
function fbView(x, withText) {
	const acts = x.acts || [], last = acts[acts.length - 1], said = [...acts].reverse().find((a) => a.note), state = fbState(x);
	const v = { code: String(x.code || '').toUpperCase(), kind: x.kind === 'install' ? '安装失败' : x.web ? '官网报告' : '问题反馈', at: x.at, state, stage: state !== 'open' ? 3 : x.ack ? 2 : 1, ackAt: x.ack || 0,
		done: state === 'fixed' ? 1 : 0, doneAt: x.done || x.nofix || 0, nofix: state === 'nofix' ? 1 : 0, reply: said ? said.note : '', replyAt: said ? said.at : 0,
		// 有新进展的时间（标已收到也算）：面板用它判断要不要提示
		updated: Math.max(last ? last.at : 0, x.ack || 0),
		// 完整记录（新的在前）：每次改状态、发补充说明都在这里；不含发邮件给谁这些
		history: acts.map((a) => ({ at: a.at, st: a.st || (a.done ? 'fixed' : 'open'), note: a.note || '' })).reverse().slice(0, 20) };
	if (withText) v.text = String(x.text || '').slice(0, 300);
	return v;
}
export const rnd = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => ABC[x & 31]).join('');
export const safeEq = (a, b) => {
	if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
	let d = 0;
	for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return d === 0;
};
const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const clean = (s, n) => String(s || '').replace(/[^\p{L}\p{N} ._()\-]/gu, '').slice(0, n);
const DAY = 86400e3;
// 比较版本号（6.0 > 5.2.3 > 5.2）：返回 -1 / 0 / 1
function verCmp(a, b, n = 3) { const x = String(a).split('.').map((n) => +n || 0), y = String(b).split('.').map((n) => +n || 0); for (let i = 0; i < n; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1; } return 0; }
// 公告的版本范围可以细到修复补丁（用户 11/28：后台从列表里选，含尝鲜版和补丁）：「6.0.0.7」= 6.0.0 V7。
// 范围写到第几段就比到第几段：写「6.0.0」时 6.0.0 的所有补丁都算 6.0.0
const verIn = (q, lo, hi) => (!lo || verCmp(q, lo, Math.min(4, String(lo).split('.').length < 4 ? 3 : 4)) >= 0) && (!hi || verCmp(q, hi, String(hi).split('.').length < 4 ? 3 : 4) <= 0);
const ymd = (t) => new Date(t + 8 * 3600e3).toISOString().slice(0, 10); // 按北京 / 台北时间显示日期
export const LIMITS = { perIpHour: 5, allHour: 60, idleDays: 90, pendingMs: 3600e3 };
export const TRASH_DAYS = 30;
const FB_CHUNK = 120 * 1024;   // 反馈截图切块存（每个值 128KB 上限）
const noteText = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);  // 管理员删除的路由器在回收站里留多久

/* ---------- Cloudflare API ---------- */
async function cf(env, method, path, body) {
	const r = await fetch('https://api.cloudflare.com/client/v4' + path, {
		method,
		headers: { authorization: 'Bearer ' + env.CF_API_TOKEN, 'content-type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	});
	let j = null;
	try { j = await r.json(); } catch (e) {}
	if (!j || !j.success) {
		const e = new Error('Cloudflare 接口出错：' + ((j && j.errors || []).map((x) => x.message).join('；') || 'HTTP ' + r.status));
		e.status = r.status; e.codes = ((j && j.errors) || []).map((x) => x.code);
		throw e;
	}
	return j.result;
}
const host = (env, sub) => sub + '.' + env.BASE_DOMAIN;
async function dnsAdd(env, sub, tunnel) {
	const d = await cf(env, 'POST', `/zones/${env.CF_ZONE_ID}/dns_records`, { type: 'CNAME', name: host(env, sub), content: tunnel + '.cfargotunnel.com', proxied: true, comment: 'cmcp ' + sub });
	return d.id;
}
async function dnsDel(env, id) {
	if (!id) return;
	try { await cf(env, 'DELETE', `/zones/${env.CF_ZONE_ID}/dns_records/${id}`); } catch (e) { if (e.status !== 404) throw e; }
}
// 建隧道 → 设置只转发到路由器上的面板（其他一律 404）→ 加子域名 → 拿隧道令牌；中间失败就把已建的删掉
export async function provision(env, sub) {
	const acc = env.CF_ACCOUNT_ID, made = {};
	try {
		const t = await cf(env, 'POST', `/accounts/${acc}/cfd_tunnel`, { name: 'cmcp-' + sub, config_src: 'cloudflare' });
		made.tunnel = t.id;
		await cf(env, 'PUT', `/accounts/${acc}/cfd_tunnel/${t.id}/configurations`, {
			config: { ingress: [{ hostname: host(env, sub), service: 'http://127.0.0.1:18765' }, { service: 'http_status:404' }] },
		});
		try { made.dns = await dnsAdd(env, sub, t.id); } catch (e) { e.dnsStep = true; throw e; }
		made.token = t.token || (await cf(env, 'GET', `/accounts/${acc}/cfd_tunnel/${t.id}/token`));
		return made;
	} catch (e) {
		await deprovision(env, made).catch(() => {});
		throw e;
	}
}
// 6.0 第 94 项：本地版不建隧道。子域名还是要有一条（路由器的心跳、推送、云端备份都走 https://子域名/cloud/），
// 指向 100::（Cloudflare 的「没有源站」写法），只给 Worker 用；面板只在家里局域网打开
async function dnsAddLocal(env, sub) {
	const d = await cf(env, 'POST', `/zones/${env.CF_ZONE_ID}/dns_records`, { type: 'AAAA', name: host(env, sub), content: '100::', proxied: true, comment: 'cmcp local ' + sub });
	return d.id;
}
export async function provisionLocal(env, sub) {
	try { return { dns: await dnsAddLocal(env, sub) }; } catch (e) { e.dnsStep = true; throw e; }
}
// 本地版 → AI 版：建隧道、子域名改指向隧道。中间失败就退回本地版的样子（子域名指回 100::、删掉建了一半的隧道）
export async function edToTunnel(env, sub, d) {
	const acc = env.CF_ACCOUNT_ID, made = {};
	try {
		const t = await cf(env, 'POST', `/accounts/${acc}/cfd_tunnel`, { name: 'cmcp-' + sub, config_src: 'cloudflare' });
		made.tunnel = t.id;
		await cf(env, 'PUT', `/accounts/${acc}/cfd_tunnel/${t.id}/configurations`, {
			config: { ingress: [{ hostname: host(env, sub), service: 'http://127.0.0.1:18765' }, { service: 'http_status:404' }] },
		});
		made.token = t.token || (await cf(env, 'GET', `/accounts/${acc}/cfd_tunnel/${t.id}/token`));
		await dnsDel(env, d.dns);
		try { made.dns = await dnsAdd(env, sub, t.id); } catch (e) { e.dnsStep = true; try { d.dns = await dnsAddLocal(env, sub); } catch (x) { d.dns = null; } throw e; }
		return made;
	} catch (e) {
		await deprovision(env, { tunnel: made.tunnel }).catch(() => {});
		throw e;
	}
}
// AI 版（或旧的纯面板版）→ 本地版：子域名改指向 100::，删掉隧道
export async function edToLocal(env, sub, d) {
	await dnsDel(env, d.dns);
	let dns;
	try { dns = await dnsAddLocal(env, sub); } catch (e) { try { d.dns = await dnsAdd(env, sub, d.tunnel); } catch (x) { d.dns = null; } throw e; }
	await deprovision(env, { tunnel: d.tunnel }).catch(() => {});
	// 本地版没有隧道：第 36 项的「子域名-x」也删掉
	if (d.xdns) { await dnsDel(env, d.xdns).catch(() => {}); delete d.xdns; }
	return { dns };
}
// 子域名名额满了（Cloudflare 免费版每个域名的 DNS 记录有上限：2024-09 以后加的域名 200 条，以前的 1000 条）
export const dnsFull = (e) => !!(e && e.dnsStep && ((e.codes || []).includes(81045) || /quota|limit|exceed/i.test(e.message || '')));
export async function deprovision(env, { tunnel, dns, xdns, wdns }) {
	await dnsDel(env, dns);
	await dnsDel(env, xdns); // 第 36 项「子域名-x」
	for (const id of Object.values(wdns || {})) await dnsDel(env, id); // 第 55 项「子域名-w」（加密通道）
	if (tunnel) {
		const acc = env.CF_ACCOUNT_ID;
		try { await cf(env, 'DELETE', `/accounts/${acc}/cfd_tunnel/${tunnel}/connections`); } catch (e) {}
		try { await cf(env, 'DELETE', `/accounts/${acc}/cfd_tunnel/${tunnel}`); } catch (e) { if (e.status !== 404) throw e; }
	}
}

/* ---------- 账号用的小工具 ---------- */
const SESSION_DAYS = 30;
const TRUST_DAYS = 30; // 新设备验证过一次，这个浏览器记住多少天
const sha256hex = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
// 登录过的设备：只从浏览器信息里认出「什么设备 · 什么浏览器」，不存原始字符串，也不存 IP
export function uaLabel(ua) {
	ua = String(ua || '');
	if (!ua) return '';
	const os = /HarmonyOS|OpenHarmony/i.test(ua) ? '鸿蒙' : /iPad/.test(ua) ? 'iPad' : /iPhone|iPod/.test(ua) ? 'iPhone' : /Android/.test(ua) ? '安卓手机' : /Windows/.test(ua) ? 'Windows 电脑' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux 电脑' : '其他设备';
	const br = /RouterPanelApp/.test(ua) ? '路由器面板 App' : /MicroMessenger/.test(ua) ? '微信' : /QQBrowser|MQQBrowser/.test(ua) ? 'QQ 浏览器' : /UCBrowser/.test(ua) ? 'UC 浏览器' : /HuaweiBrowser/.test(ua) ? '华为浏览器' : /MiuiBrowser|XiaoMi/.test(ua) ? '小米浏览器' : /SamsungBrowser/.test(ua) ? '三星浏览器' : /EdgA?\/|EdgiOS|Edg\//.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /OPR\/|Opera/.test(ua) ? 'Opera' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|wget|python|node/i.test(ua) ? '程序' : '浏览器';
	return os + ' · ' + br;
}
// 大概在哪：Cloudflare 自带的城市 / 国家（不存 IP）
export function placeOf(cf) {
	if (!cf) return '';
	const c = String(cf.city || '').slice(0, 40), n = String(cf.country || '').slice(0, 2);
	const CN = { CN: '中国大陆', TW: '台湾', HK: '香港', MO: '澳门', US: '美国', JP: '日本', SG: '新加坡', KR: '韩国', GB: '英国', DE: '德国', CA: '加拿大', AU: '澳大利亚', MY: '马来西亚', TH: '泰国', VN: '越南', FR: '法国', NL: '荷兰', RU: '俄罗斯', IN: '印度' };
	const nn = CN[n] || n;
	return c && nn ? nn + ' · ' + c : c || nn;
}
const te = new TextEncoder();
export function normEmail(e) { e = String(e || '').trim().toLowerCase(); return e.length <= 120 && /^[^\s@]+@[^\s@]+\.[a-z0-9-]{2,}$/.test(e) ? e : ''; }
export function pwError(p) { if (typeof p !== 'string' || p.length < 8) return '密码至少 8 位'; if (p.length > 128) return '密码太长了'; if (/^\d+$/.test(p) || /^(.)\1+$/.test(p)) return '密码太简单了，加点字母或符号'; return ''; }
export const maskEmail = (e) => { const [a, b] = String(e).split('@'); return (a.length <= 2 ? a[0] + '*' : a.slice(0, 2) + '***') + '@' + b; };
async function pwHash(pw, salt) {
	const k = await crypto.subtle.importKey('raw', te.encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
	const b = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: te.encode(salt), iterations: 100000 }, k, 256);
	return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
// 续期天数：「180」「180天」「１８０」都认；认不出或不在 1–3650 天返回 0（不再悄悄按 90 天处理）
export function parseDays(v) {
	const s = String(v ?? '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
	const m = /\d+/.exec(s); if (!m) return 0;
	const n = +m[0]; return n >= 1 && n <= 3650 ? n : 0;
}
/* 6.0 第 77 项：邮件服务每天能发的封数有上限。用满了：要收邮件才能做完的事（注册、找回密码、新设备登录、确认本人）当天先不让做、说明原因；
   影响小的（报告、反馈、续期申请）照常提交，只提醒「今天发不了确认邮件」；快用满和用满时推送给管理员。给用户的提示里不说具体额度。
   不会因为邮件发不出就跳过验证。 */
export const MAIL_FULL_MSG = '今天发邮件的次数满了（邮件服务每天有上限），这一步要收邮件验证码，请明天再试。你的账号没有问题';
export const MAIL_NOTE = '今天发不了确认邮件（邮件服务每天有上限），你提交的内容开发者已经收到';
export const mailDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10); // 邮件服务按世界时 0 点算一天
// 发一封：{ ok, quota（额度用完了）}；被限速（每秒太多）时等一下再试一次
async function sendMail(env, to, subject, html) {
	for (let i = 0; i < 2; i++) {
		try {
					const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.MAIL_FROM || 'noreply@' + env.BASE_DOMAIN, to: [to], subject, html }) });
			if (r.ok) return { ok: true };
			let j = {}; try { j = await r.json(); } catch (e) {}
			const name = String(j.name || ''), msg = String(j.message || '');
			if (r.status === 429 && (/quota/i.test(name) || /quota/i.test(msg))) return { ok: false, quota: /month/i.test(name + msg) ? 'month' : 'day', err: '邮件服务今天的额度用完了' };
			if (r.status === 429 && i === 0) { await new Promise((z) => setTimeout(z, 700)); continue; }
			return { ok: false, err: '发信服务没收下（' + r.status + '）' };
		} catch (e) { return { ok: false, err: '连不上发信服务' }; }
	}
	return { ok: false, err: '发信服务太忙' };
}

/* ---------- 开通中心（全局只有一个，所有登记都在这里排队处理） ---------- */
export class Hub extends DurableObject {
	// 开通、删除、封禁一件一件排队做（建隧道要等网络，不排队的话两个人可能同时抢到最后一个名额）
	lock(fn) { const run = (this.q || Promise.resolve()).then(fn, fn); this.q = run.catch(() => {}); return run; }
	watch(sub) { return this.env.W.get(this.env.W.idFromName('dev:' + sub)); }
	max() { return Math.max(1, Math.min(1000, +this.env.MAX_DEVICES || 1000)); }
	/* ---------- 6.0 第 46 项：托管名额（用户 11/26 定：满了停止新注册 + 排队，有空位发邮件；后台能调上限） ---------- */
	// 上限：后台改过就用后台的（1–1000），没改过用部署时的 MAX_DEVICES
	async maxN() { const m = +(await this.ctx.storage.get('maxset')); return m >= 1 && m <= 1000 ? m : this.max(); }
	// 满没满：路由器数到了上限，或者 Cloudflare 子域名名额用完了（一天内、数量没减少）
	async isFull() {
		const n = await this.count();
		if (n >= (await this.maxN())) return true;
		const f = await this.ctx.storage.get('dnsfull');
		return !!(f && Date.now() - f.at < DAY && n >= f.count);
	}
	// 排队的邮箱：发过有空位通知 30 天、排了 180 天还没排到的自动删掉（隐私政策里写了）
	async waitList() { const l = await this.ctx.storage.get('wl'), now = Date.now(); return Array.isArray(l) ? l.filter((x) => (x.sent ? now - x.sent < 30 * DAY : now - x.at < 180 * DAY)) : []; }
	// 留邮箱排队（同一个 IP 一小时最多 5 次；最多排 2000 人）
	// 名额满了：已登录的用账号邮箱排队
	async waitMe(uid, ip) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return { st: 401, error: '请先登录' };
		return this.waitJoin({ email: u.email, ip, acct: true });
	}
	// 升级提醒开关（主人点邮件里的「不再提醒」、后台每行的开关都走这里）。uid 给了就只许这台的主账号改；peek 只看不改
	async ovSet(sub, { uid = '', by = '', off = true, peek = false } = {}) {
		sub = String(sub || '').slice(0, 40);
		const d = sub && (await this.ctx.storage.get('d:' + sub));
		if (!d) return { st: 404, error: '没有这台路由器' };
		if (uid && this.famOf(d).owner !== uid) return { st: 403, error: '只有这台路由器的主账号能关掉提醒' };
		const name = String(d.name || sub).slice(0, 40);
		if (peek) return { st: 200, ok: true, name, off: !!(await this.ctx.storage.get('ovoff:' + sub)) };
		if (off) await this.ctx.storage.put('ovoff:' + sub, { at: Date.now(), by: by || uid }); else await this.ctx.storage.delete('ovoff:' + sub);
		return { st: 200, ok: true, name };
	}
	async waitJoin({ email, ip, acct = false }) {
		email = normEmail(email);
		if (!email) return { st: 400, error: '邮箱格式不对' };
		if (!(await this.isFull())) return { st: 400, error: acct ? '现在有名额，直接领试用或开通' : '现在有名额，直接注册就行' };
		if (!this.env.RESEND_API_KEY) return { st: 501, error: '官网还没开通发邮件，排不了队，过几天再来看' };
		if (!acct && (await this.ctx.storage.get('e:' + email))) return { st: 409, error: '这个邮箱已经注册过，登录后在账号页排队' };
		if (!(await this.hit('wl:' + ip, 5, 3600e3))) return { st: 429, error: '太频繁了，一小时后再试' };
		const l = await this.waitList();
		let i = l.findIndex((x) => x.email === email);
		if (i < 0) { if (l.length >= 2000) return { st: 503, error: '排队的人太多了，过几天再来' }; l.push({ email, at: Date.now() }); i = l.length - 1; await this.ctx.storage.put('wl', l); }
		return { st: 200, ok: true, pos: l.filter((x, j) => j <= i && !x.sent).length };
	}
	// 有空位了：按排队先后发邮件，空几个发几个（发过的不再发；一次最多 20 封）
	async waitNotify() {
		if (!this.env.RESEND_API_KEY || (await this.isFull())) return 0;
		const free = (await this.maxN()) - (await this.count()), l = await this.waitList();
		let n = 0;
		for (const x of l) {
			if (n >= Math.min(free, 20)) break;
			if (x.sent) continue;
			if (!(await this.mail(x.email, '路由器面板有空位了', `<p>你排队的路由器面板托管服务有空位了。登录官网就能领试用或开通：</p><p><a href="https://${this.env.BASE_DOMAIN}/app">https://${this.env.BASE_DOMAIN}/app</a></p><p>名额先到先得，晚了可能又满了。</p>`))) break; // 发不出去（额度用完）：下次再发
			x.sent = Date.now(); n++;
		}
		if (n) { await this.ctx.storage.put('wl', l); await this.alog('wait-mail', '', `有空位了，给排队的 ${n} 个人发了邮件`, 'system'); }
		return n;
	}
	async setMax(n) {
		n = Math.round(+n);
		if (!(n >= 1 && n <= 1000)) return { st: 400, error: '上限填 1–1000' };
		await this.ctx.storage.put('maxset', n);
		await this.alog('max', '', '托管名额上限改成 ' + n, 'admin');
		await this.waitNotify();
		return { st: 200, ok: true, ...(await this.stats()) };
	}
	async count() { return (await this.ctx.storage.get('count')) || 0; }
	async addCount(n) { await this.ctx.storage.put('count', Math.max(0, (await this.count()) + n)); }
	// 限流：同一个 IP 每小时最多开通 5 台，全站每小时最多 60 台
	async rate(ip, now) {
		const rl = (await this.ctx.storage.get('rl')) || { all: [], ip: {} };
		const hr = now - 3600e3;
		rl.all = rl.all.filter((t) => t > hr);
		for (const k in rl.ip) { rl.ip[k] = rl.ip[k].filter((t) => t > hr); if (!rl.ip[k].length) delete rl.ip[k]; }
		const mine = rl.ip[ip] || [];
		if (mine.length >= LIMITS.perIpHour || rl.all.length >= LIMITS.allHour) return false;
		mine.push(now); rl.ip[ip] = mine; rl.all.push(now);
		await this.ctx.storage.put('rl', rl);
		return true;
	}
	register(a) { return this.lock(() => this._register(a)); }
	/* 6.0 第 90 项：开通中途断了，安装码不再白白用掉（用户 11/25 定：三样都做）
	 * ① 路由器每次安装带一个自己生成的随机编号（rid，只存在路由器上）。官网开通成功后把回复留 1 天（rr:<rid 的哈希>），
	 *    同一台路由器拿同一个安装码、同一个 rid 再来，直接把上次的结果给它，不再扣码；路由器第一次连上官网就删掉
	 * ② 开通出错（建隧道之后的步骤也算）：删掉建了一半的、退回安装码
	 * ③ 开通好了但路由器 1 天都没连上过官网（没拿到回复、装到一半放弃了）：收回网址、退回安装码（每天清理时做） */
	// keep：卸载退回时记住原来的到期时间，重装接着用（试用不会因为重装变长）
	async _refund(code, sub, keep) {
		const inv = await this.ctx.storage.get('i:' + code);
		if (!inv) return;
		inv.used = Math.max(0, (inv.used || 0) - 1);
		if (keep) inv.keep = keep;
		await this.ctx.storage.put('i:' + code, inv);
		if (!inv.uid) return;
		const u = await this.ctx.storage.get('u:' + inv.uid);
		if (!u) return;
		if (keep || (inv.exp ? Date.now() < inv.exp : true)) u.inst = [...new Set([...(u.inst || []), code])];
		if (!keep && inv.trial && u.trial && u.trial.sub === sub) { u.trialUsed = Math.max(0, (u.trialUsed || 1) - 1); u.trial = { ...u.trial, used: 0, sub: '' }; }
		await this.ctx.storage.put('u:' + inv.uid, u);
	}
	async _register({ invite, ip, name, model, rid, local }) {
		local = local === true;
		const now = Date.now();
		const code = String(invite || '').trim().toUpperCase();
		const inv = code && (await this.ctx.storage.get('i:' + code));
		if (!inv || inv.off) return { st: 403, error: '邀请码（安装码）不对' };
		// 5.2：托管版要先在官网注册账号。管理后台发的邀请码要在官网兑换成安装码，才能在路由器上装（装好自动加到账号里）
		if (!inv.uid && !inv.direct) return { st: 403, error: '邀请码要先在官网兑换成安装码：手机打开 https://' + this.env.BASE_DOMAIN + '/app 注册账号，在「添加路由器 → 装新路由器」里输入邀请码，复制那里给的安装命令到路由器上运行' };
		// 同一台路由器重试：拿回上一次的开通结果（只认同一个安装码 + 同一个 rid，别人拿不到）
		const rh = /^[A-Za-z0-9]{16,64}$/.test(String(rid || '')) ? await sha256hex('rid:' + rid) : '';
		if (rh) {
			const rr = await this.ctx.storage.get('rr:' + rh);
			if (rr && rr.code === code && now - rr.at < DAY) {
				const d = await this.ctx.storage.get('d:' + rr.sub);
				if (d && d.state === 'ok') { await this.alog('reg-again', rr.sub, '路由器重新拿回了开通结果（上次没收到回复），没有再扣安装码', 'router'); return { st: 200, ...rr.res, again: true }; }
			}
		}
		// 卸载后用同一个码重装（6.0 第 90 项，用户 11/25 定）：到期时间接着原来的；服务到期了就不能再装
		const keep = inv.keep && (!inv.keep.exp || now < inv.keep.exp) ? inv.keep : null;
		if (inv.keep && !keep) return { st: 403, error: '这台路由器的托管服务已经到期了，这个码不能再用来重装' + (inv.uid ? '。在官网账号里申请续期，或者重新拿一个安装码' : '') };
		if (!keep && inv.exp && now > inv.exp) return { st: 403, error: inv.uid ? '安装码已经过期了：回官网「添加路由器 → 装新路由器」重新拿一个' : '邀请码已经过期' };
		if (inv.used >= inv.max) return { st: 403, error: inv.uid ? '这个安装码已经用过了：每个安装码只能装一台。回官网「添加路由器 → 装新路由器」重新拿一个' : '邀请码已经用完了' };
		if ((await this.count()) >= (await this.maxN())) return { st: 403, error: '名额已满，暂时不能开通' };
		// 上次开通时 Cloudflare 的子域名名额满了：一天内、路由器数量没减少之前直接说名额已满，不再去建隧道（过一天再试一次，升级了套餐也能自己恢复）
		const full = await this.ctx.storage.get('dnsfull');
		if (full && now - full.at < DAY && (await this.count()) >= full.count) return { st: 403, error: '名额已满，暂时不能开通' };
		if (!(await this.rate(ip || '?', now))) return { st: 429, error: '开通太频繁了，请一小时后再试' };
		let sub;
		do { sub = rnd(8); } while (await this.ctx.storage.get('d:' + sub));
		// 先占名额、记下邀请码用了一次，再去建隧道（建隧道要等网络，期间别的请求可能插进来）
		inv.used++;
		if (keep) delete inv.keep;
		await this.ctx.storage.put({ ['i:' + code]: inv, ['d:' + sub]: { sub, state: 'pending', created: now, invite: code, ...(keep ? { keep } : {}) } });
		await this.addCount(1);
		let made;
		try {
			made = local ? await provisionLocal(this.env, sub) : await provision(this.env, sub);
		} catch (e) {
			await this._refund(code, sub, keep);
			await this.ctx.storage.delete('d:' + sub);
			await this.addCount(-1);
			if (dnsFull(e)) {
				const n = await this.count();
				await this.ctx.storage.put('dnsfull', { count: n, at: now });
				await this.alog('dnsfull', '', `Cloudflare 子域名名额满了（现在 ${n} 台路由器），新的开通会提示名额已满`, 'system');
				await this.notifyAdmin('托管名额满了', `开通新路由器时 Cloudflare 提示子域名（DNS 记录）名额用完了，现在有 ${n} 台路由器。\n\n新用户会看到「名额已满，暂时不能开通」。删掉不用的路由器、或者升级 Cloudflare 套餐后就能继续开通。\n\nCloudflare 原话：${e.message}\n\n管理页：https://${this.env.BASE_DOMAIN}/admin`);
				return { st: 403, error: '名额已满，暂时不能开通' };
			}
			return { st: 502, error: '开通失败：' + e.message + '（安装码没扣，可以再装一次）' };
		}
		// 隧道建好了先记下来：后面哪一步出错（或者官网这边中途断了），清理时能把隧道和子域名删掉
		await this.ctx.storage.put('d:' + sub, { sub, state: 'pending', created: now, invite: code, tunnel: made.tunnel, dns: made.dns, ...(keep ? { keep } : {}) });
		try {
			if (full) await this.ctx.storage.delete('dnsfull');
			const keys = { rkey: rnd(32), tkey: rnd(32), pkey: rnd(32) };
			const h = host(this.env, sub);
			// 本地版没有隧道：云端不探测面板网址（断线只看心跳）
			await this.watch(sub).setup({ sub, ...keys, probe: local ? '' : 'https://' + h + '/panel/manifest.json' });
			// 试用码：开通后只能用 svc 天，到期前找提供服务的人要续期码；普通邀请码不限期
			const exp = keep ? keep.exp || 0 : +inv.svc > 0 ? now + inv.svc * DAY : 0;
			// fresh：路由器还没连上过官网；连上过一次就去掉（1 天都没连上的会被收回，见 _cleanup）
			const dv = { sub, state: 'ok', created: now, seen: now, fresh: true, ...(keep ? { keep } : {}), invite: code, name: clean(name, 40), model: clean(model, 60), tunnel: made.tunnel, dns: made.dns, exp, ...(local ? { local: true } : {}) };
			// 官网账号领的试用码：开通后直接加到这个账号里，不用再配对
			let bound = false;
			if (inv.uid) {
				const u = await this.ctx.storage.get('u:' + inv.uid);
				if (u && !(u.devs || []).some((x) => x.sub === sub)) { u.devs = [...(u.devs || []), { sub, at: now }]; dv.users = [inv.uid]; dv.owner = inv.uid; await this.ctx.storage.put('u:' + inv.uid, u); bound = true; }
				if (u) {
					if (inv.trial && !keep) { u.trialUsed = Math.max(u.trialUsed || 0, u.trial && u.trial.used ? 1 : 0) + 1; u.trial = { ...(u.trial || {}), used: now, sub }; }
					else if (inv.trial && keep) u.trial = { ...(u.trial || {}), sub };
					u.inst = (u.inst || []).filter((x) => x !== code);
					await this.ctx.storage.put('u:' + inv.uid, u);
				}
			}
			const res = { sub, host: h, token: made.token || '', url: 'https://' + h + '/cloud', exp, bound, ...(local ? { local: true } : {}), ...keys };
			if (rh) { dv.rr = rh; await this.ctx.storage.put('rr:' + rh, { code, sub, at: now, res }); }
			await this.ctx.storage.put('d:' + sub, dv);
			await this.rlog(sub, '✨', (keep ? '卸载后用同一个码重装，到期时间不变' : '开通托管服务') + (local ? '（本地版）' : '') + (dv.exp ? '（' + Math.round((dv.exp - now) / DAY) + ' 天）' : '') + (bound ? '，自动加到 ' + (await this.rname(inv.uid)) + ' 的账号里，他是主账号' : ''));
			if (inv.uid) await this.alog(inv.trial ? 'trial-used' : 'inst-used', sub, (inv.trial ? '用官网领的试用码开通' : '用安装码开通（邀请码 ' + (inv.from || '?') + '）') + (bound ? '，已自动加到账号里' : ''), 'router');
			await this.track('dev_reg');
			return { st: 200, ...res };
		} catch (e) {
			// 建好隧道以后出错：删掉建了一半的，退回安装码
			try { await this._remove(sub); } catch (x) { try { await deprovision(this.env, made); } catch (y) {} await this.ctx.storage.delete('d:' + sub); await this.addCount(-1); }
			await this._refund(code, sub, keep);
			if (rh) await this.ctx.storage.delete('rr:' + rh);
			await this.alog('reg-fail', sub, '开通到一半出错，已删掉建了一半的、退回安装码：' + e.message, 'system');
			return { st: 502, error: '开通失败：' + e.message + '（安装码没扣，可以再装一次）' };
		}
	}
	// 删除一台：删子域名和隧道、清空它的云端数据、腾出名额
	remove(sub) { return this.lock(() => this._remove(sub)); }
	async _remove(sub) {
		const d = await this.ctx.storage.get('d:' + sub);
		if (!d) return false;
		await deprovision(this.env, d);
		await this.watch(sub).wipe();
		for (const uid of d.users || []) {
			const u = await this.ctx.storage.get('u:' + uid);
			if (u) { u.devs = (u.devs || []).filter((x) => x.sub !== sub); await this.ctx.storage.put('u:' + uid, u); }
		}
		await this.ctx.storage.delete('d:' + sub);
		await this.addCount(-1);
		try { await this.waitNotify(); } catch (e) {} // 第 46 项：腾出名额了，告诉排队的人
		return true;
	}
	unregister(a) { return this.lock(() => this._unregister(a)); }
	async _unregister({ sub, rkey }) {
		if (!SUB_RE.test(sub || '')) return { st: 404, error: '没有这台路由器' };
		const c = await this.watch(sub).getCfg();
		if (!c || !safeEq(rkey, c.rkey)) return { st: 403, error: '钥匙不对' };
		const d0 = await this.ctx.storage.get('d:' + sub);
		await this._remove(sub);
		// 6.0 第 90 项（用户 11/25 定）：卸载后安装码退回，记住原来的到期时间；到期前用同一个码重装，接着用（不会变长）
		const now = Date.now(), can = d0 && d0.invite && !(d0.exp && now >= d0.exp) && d0.offWhy !== 'exp';
		if (can) await this._refund(d0.invite, sub, { exp: d0.exp || 0, at: now });
		await this.alog('unregister', sub, '路由器上运行了卸载，网址自动交还' + (d0 && d0.name ? '（' + d0.name + '）' : '') + (can ? '；安装码退回，' + (d0.exp ? ymd(d0.exp) + ' 前' : '') + '可以用同一个码重装' : ''), 'router');
		return { st: 200, ok: true, again: can ? { exp: d0.exp || 0 } : null };
	}
	async seen(sub, t) {
		const d = await this.ctx.storage.get('d:' + sub);
		if (!d) return;
		d.seen = t;
		// 第一次连上官网：开通结果不用再留了（6.0 第 90 项）
		if (d.fresh) { delete d.fresh; if (d.rr) { await this.ctx.storage.delete('rr:' + d.rr); delete d.rr; } }
		await this.ctx.storage.put('d:' + sub, d);
	}
	/* ---------- 删除先进回收站：30 天内只是停用（网址打不开），隧道和云端数据都留着，随时一键恢复；30 天后才彻底删除 ---------- */
	// 受保护：手动标了「保护」，或者绑定在管理员邮箱（ADMIN_EMAIL）的账号上（管理员自己的路由器）
	async isProtected(d) {
		if (!d) return false;
		if (d.protect) return true;
		const ae = String(this.env.ADMIN_EMAIL || '').trim().toLowerCase();
		if (!ae) return false;
		const uid = await this.ctx.storage.get('e:' + ae);
		return !!uid && (d.users || []).includes(uid);
	}
	trash(sub, confirm) { return this.lock(() => this._trash(sub, confirm)); }
	async _trash(sub, confirm) {
		const d = await this.ctx.storage.get('d:' + sub);
		if (!d) return { st: 404, error: '没有这台路由器' };
		if (String(confirm || '').trim().toLowerCase() !== sub) return { st: 400, error: '要输入这台路由器的编号 ' + sub + ' 才能删除' };
		if (await this.isProtected(d)) return { st: 403, error: '这是受保护的路由器（你自己的，或者标了「保护」），不能删除。真要删，先取消保护' };
		if (d.offWhy === 'deleted') return { st: 400, error: '已经在回收站里了' };
		if (d.state !== 'ok') { await this._remove(sub); return { st: 200, ok: true, purged: true }; }  // 开通到一半的，直接删
		await this._setOff(sub, true, 'deleted');
		const d2 = await this.ctx.storage.get('d:' + sub); d2.delAt = Date.now(); await this.ctx.storage.put('d:' + sub, d2);
		try { await this.watch(sub).push({ title: '托管服务已被停用', body: '专属网址暂时打不开了，家里上网和路由器上的设置都不受影响。' + ymd(d2.delAt + TRASH_DAYS * DAY) + ' 前联系提供服务的人可以恢复，恢复后什么都不用做。', tag: 'svc', lvl: 'err' }); } catch (e) {}
		const mailed = await this.mailOwners(d2, 'trash');
		return { st: 200, ok: true, purgeAt: d2.delAt + TRASH_DAYS * DAY, mailed };
	}
	restore(sub) { return this.lock(() => this._restore(sub)); }
	async _restore(sub) {
		const d = await this.ctx.storage.get('d:' + sub);
		if (!d || d.offWhy !== 'deleted') return { st: 404, error: '回收站里没有这台路由器' };
		delete d.delAt; await this.ctx.storage.put('d:' + sub, d);
		// 还在有效期内：马上恢复；已经过期了：恢复成「到期暂停」，续期后自动恢复
		if (d.exp && d.exp <= Date.now()) { d.offWhy = 'exp'; await this.ctx.storage.put('d:' + sub, d); }
		else await this._setOff(sub, false);
		try { await this.watch(sub).push({ title: '✅ 托管服务恢复了', body: '专属网址可以正常打开了，什么都不用做。', tag: 'svc', lvl: 'ok' }); } catch (e) {}
		const mailed = await this.mailOwners(await this.ctx.storage.get('d:' + sub), 'restore');
		return { st: 200, ok: true, mailed };
	}
	purge(sub, confirm) { return this.lock(() => this._purge(sub, confirm)); }
	async _purge(sub, confirm) {
		const d = await this.ctx.storage.get('d:' + sub);
		if (!d || d.offWhy !== 'deleted') return { st: 400, error: '只能彻底删除回收站里的路由器（先删除，进回收站）' };
		if (String(confirm || '').trim().toLowerCase() !== sub) return { st: 400, error: '要输入这台路由器的编号 ' + sub + ' 才能彻底删除' };
		const mailed = await this.mailOwners(d, 'purge');
		await this._remove(sub);
		return { st: 200, ok: true, mailed };
	}
	async setProtect(sub, on) {
		const d = await this.ctx.storage.get('d:' + sub);
		if (!d) return false;
		if (on) d.protect = true; else delete d.protect;
		await this.ctx.storage.put('d:' + sub, d);
		return true;
	}
	/* ---------- 操作记录：管理员做了什么、系统自动删了什么、路由器自己注销了，都记一笔（最近 500 条） ---------- */
	// 发邮件，并记到「邮件记录」里（没配置发信服务时不发、不记）
	async mail(to, subject, html) {
		if (!this.env.RESEND_API_KEY || !to) return false;
		if (await this.mailFull()) { try { await this.mailLog(to, subject, false, '今天的邮件额度用完了，没发'); } catch (e) {} return false; }
		let r = { ok: false };
		try { r = await sendMail(this.env, to, subject, html); } catch (e) {}
		try { await this.mailCount(r); } catch (e) {}
		try { await this.mailLog(to, subject, r.ok, r.ok ? '' : r.err || '发信服务没收下'); } catch (e) {}
		return r.ok;
	}
	/* ---------- 邮件额度（第 77 项） ---------- */
	mailCap() { const n = +this.env.MAIL_DAILY; return n >= 10 && n <= 100000 ? n : 100; } // 每天能发多少封（Resend 免费版 100），可以用 MAIL_DAILY 改
	async mailStat() { const s = (await this.ctx.storage.get('mq')) || {}; return s.day === mailDay() ? s : { day: mailDay(), n: 0 }; }
	// 满没满只听邮件服务的（它说额度用完了才算）；自己数的封数只用来提前提醒，套餐额度更大时也不会误拦
	async mailFull() { if (!this.env.RESEND_API_KEY) return false; return !!(await this.mailStat()).full; }
	// 发完记一笔：发出去的算一封；快用满（八成）、用满时各推送管理员一次
	async mailCount(r) {
		const s = await this.mailStat(), cap = this.mailCap();
		if (r.ok) s.n = (s.n || 0) + 1;
		if (r.quota) s.full = r.quota;
		let say = null;
		if (s.full && !s.toldFull) { s.toldFull = 1; say = { title: '📭 今天的邮件额度用完了', body: '注册、找回密码、新设备登录、确认本人这些要收验证码的操作今天先停了（用户会看到「明天再试」），报告和反馈照常收。明天自动恢复；要马上恢复得升级邮件服务套餐。' }; }
		else if (!s.full && s.n >= Math.ceil(cap * 0.8) && !s.toldWarn) { s.toldWarn = 1; say = { title: '📬 今天的邮件快用完了', body: `今天已经发了 ${s.n} 封（每天 ${cap} 封）。用满以后，要收验证码的操作当天会先停。` }; }
		await this.ctx.storage.put('mq', s);
		if (say) { try { await this.admPush({ ...say, tag: 'mail-quota', url: '/admin/#/mails' }); } catch (e) {} try { await this.alog('mail_quota', '', say.title, 'system'); } catch (e) {} }
	}
	async mailQuota() { const s = await this.mailStat(), cap = this.mailCap(); return { day: s.day, sent: s.n || 0, cap, full: !!s.full, warn: !s.full && (s.n || 0) >= Math.ceil(cap * 0.8) }; }
	// 给影响小的提交（报告、反馈、续期申请）附一句提醒
	// 要收验证码才能做完的事：额度满了就返回这个错误（null 表示可以发）
	async mailBlock() { return (await this.mailFull()) ? { st: 503, error: MAIL_FULL_MSG, mailFull: true } : null; }
	async mailNote() { return (await this.mailFull()) ? { mailNote: MAIL_NOTE } : {}; }
	async alog(op, target, detail, by) {
		const l = (await this.ctx.storage.get('alog')) || [];
		l.unshift({ t: Date.now(), op, target: String(target || ''), detail: noteText(detail, 300), by: by || 'admin' });
		await this.ctx.storage.put('alog', l.slice(0, 500));
	}
	async adminLog() { return (await this.ctx.storage.get('alog')) || []; }
	// 管理员给路由器加天数（不用续期码）
	extend(sub, days) { return this.lock(() => this._extend(sub, days)); }
	async _extend(sub, days) {
		const d = await this.ctx.storage.get('d:' + sub), n = parseDays(days);
		if (!d || d.state !== 'ok') return { st: 404, error: '没有这台路由器' };
		if (!n) return { st: 400, error: '天数不对：填 1 到 3650 之间的数字' };
		if (!d.exp) return { st: 400, error: '这台路由器不限期，不用加天数' };
		if (d.offWhy === 'deleted') return { st: 400, error: '在回收站里，先恢复再加天数' };
		const old = d.exp, exp = await this._grant(d, n, '提供服务的人给你加了天数');
		await this.alog('extend', sub, `加 ${n} 天：${ymd(old)} → ${ymd(exp)}`);
		return { st: 200, ok: true, exp };
	}
	async setNote(sub, note) {
		const d = await this.ctx.storage.get('d:' + sub);
		if (!d) return false;
		d.anote = noteText(note, 100); if (!d.anote) delete d.anote;
		await this.ctx.storage.put('d:' + sub, d);
		return true;
	}
	/* ---------- 账号管理：列表、删除先进回收站（30 天内能恢复）、彻底删除 ---------- */
	async adminUsers() {
		const devs = new Map((await this.devices()).map((d) => [d.sub, d])), out = [];
		const ae = String(this.env.ADMIN_EMAIL || '').trim().toLowerCase();
		for (const [k, u] of await this.ctx.storage.list({ prefix: 'u:' })) {
			out.push({ uid: u.uid, email: u.email, created: u.created, verified: !!u.verified, totp: !!u.totp, lastAt: u.lastAt || 0, admin: !!ae && u.email === ae,
				devs: (u.devs || []).map((x) => ({ sub: x.sub, name: x.alias || devs.get(x.sub)?.name || x.sub, gone: !devs.has(x.sub) })), links: (u.links || []).length });
		}
		for (const [k, u] of await this.ctx.storage.list({ prefix: 'xu:' }))
			out.push({ uid: u.uid, email: u.email, created: u.created, lastAt: u.lastAt || 0, delAt: u.delAt, delWhy: u.delWhy || 'admin', purgeAt: u.delAt + TRASH_DAYS * DAY, deleted: true,
				devs: (u.devs || []).map((x) => ({ sub: x.sub, name: x.alias || devs.get(x.sub)?.name || x.sub, gone: !devs.has(x.sub) })) });
		return out;
	}
	/* 6.0 第 91 项（用户 11/25 定：只算官网账号上的）：后台点进某个人，一页看到他的资料和全部记录，按时间排。
	 * 来源：登录记录、后台操作记录（跟他邮箱或他的路由器有关的）、他路由器的操作记录、发给他的邮件、反馈和报告、续期申请、
	 * 联系开发者的对话、他的安装码和试用码。钥匙、登录地址、密码、会话编号一律不出现。管理员查看本身也记一笔（同一个人 1 小时记一次） */
	async adminUserFull(uid) {
		let u = await this.ctx.storage.get('u:' + uid), deleted = false;
		if (!u) { u = await this.ctx.storage.get('xu:' + uid); deleted = !!u; }
		if (!u) return { st: 404, error: '没有这个账号' };
		const email = String(u.email || '').toLowerCase(), now = Date.now(), ev = [];
		const subs = new Set((u.devs || []).map((x) => x.sub));
		// 他是家人（子账号）的路由器也算
		for (const d of await this.devices()) if ((d.users || []).includes(uid) || d.owner === uid) subs.add(d.sub);
		const rn = {};
		const devs = [];
		for (const sub of subs) {
			const d = await this.ctx.storage.get('d:' + sub);
			rn[sub] = (d && d.name) || sub;
			let b = null;
			if (d && d.state === 'ok') { try { b = await this.watch(sub).brief(); } catch (e) {} }
			devs.push(d ? { sub, name: d.name || sub, model: d.model || '', role: d.owner === uid ? '主账号' : '家人', exp: d.exp || 0, off: !!d.off, offWhy: d.offWhy || '', po: (b && b.po) || 0, last: (b && b.last) || 0, live: (b && b.state) || '', seen: d.seen || 0, created: d.created || 0, ver: d.ver || '' } : { sub, name: sub, gone: true });
		}
		const KL = { app: 'App 授权', login: '登录官网', reg: '注册', reset: '找回密码', code: '收邮箱验证码', totp: '两步验证', admin: '管理后台' };
		for (const x of (await this.ctx.storage.get('ll')) || []) if (String(x.who || '').toLowerCase() === email)
			ev.push({ t: x.t, k: 'login', text: (KL[x.k] || x.k) + (x.ok ? '' : '失败'), detail: x.why || '', ok: !!x.ok, ip: x.ip || '', place: x.place || '', ua: x.ua || '' });
		for (const x of (await this.ctx.storage.get('alog')) || []) {
			const tg = String(x.target || ''), hit = tg.toLowerCase() === email || subs.has(tg) || (email && String(x.detail || '').toLowerCase().includes(email));
			if (hit) ev.push({ t: x.t, k: 'op', text: x.detail || x.op, detail: (x.by === 'admin' ? '管理员' : x.by === 'router' ? '路由器' : x.by === 'system' ? '系统' : x.by || '') + (subs.has(tg) ? ' · ' + (rn[tg] || tg) : ''), op: x.op });
		}
		for (const sub of subs) for (const x of (await this.ctx.storage.get('rl:' + sub)) || []) ev.push({ t: x.t, k: 'router', text: x.x, detail: rn[sub] || sub, sub });
		for (const x of (await this.ctx.storage.get('ml')) || []) if (String(x.to || '').toLowerCase() === email) ev.push({ t: x.t, k: 'mail', text: '发邮件：' + x.subject, detail: x.ok ? '' : '没发出去：' + (x.err || ''), ok: !!x.ok });
		for (const x of (await this.ctx.storage.get('fbl')) || []) {
			const mine = x.uid === uid || x.by === uid || (x.emails || []).some((y) => String(y).toLowerCase() === email);
			if (mine) ev.push({ t: x.at, k: 'fb', text: (x.web ? x.name : '问题反馈 · ' + (x.name || '')) + '（' + String(x.code || '').toUpperCase() + '）', detail: String(x.text || '').slice(0, 300), state: x.nofix ? '无法修复' : x.done ? '已处理' : '处理中', code: x.code });
		}
		const aps = [...(await this.ctx.storage.list({ prefix: 'ap:' })).values()].concat((await this.ctx.storage.get('aplog')) || []);
		for (const x of aps) if (x.uid === uid) ev.push({ t: x.at, k: 'app', text: '续期申请 · ' + (x.name || x.sub), detail: [x.source, x.note].filter(Boolean).join(' · ').slice(0, 300), state: x.status === 'pending' ? '待审核' : x.status === 'ok' ? '通过' + (x.days ? '，续 ' + x.days + ' 天' : '') : '没通过' + (x.reason ? '：' + x.reason : '') });
		for (const x of (await this.ctx.storage.get('cth')) || []) if (x.uid === uid || (!x.uid && x.sub && devs.some((d) => d.sub === x.sub && d.role === '主账号')))
			ev.push({ t: x.last || x.at || 0, k: 'chat', text: '联系开发者 · ' + (x.name || x.tid), detail: (x.n ? x.n + ' 条消息' : '') + (x.ua ? '，' + x.ua + ' 条没回' : ''), tid: x.tid });
		const codes = [];
		for (const [k, x] of await this.ctx.storage.list({ prefix: 'i:' })) if (x.uid === uid) {
			const code = k.slice(2);
			codes.push({ code, trial: !!x.trial, used: x.used || 0, max: x.max || 1, exp: x.exp || 0, svc: x.svc || 0, from: x.from || '', keep: !!x.keep });
			ev.push({ t: x.at || x.created || 0, k: 'code', text: (x.trial ? '领了试用码 ' : '拿到安装码 ') + code + (x.from ? '（用邀请码 ' + x.from + ' 兑换）' : ''), detail: (x.used >= (x.max || 1) ? '已用' : x.exp && x.exp < now ? '已过期' : '没用') + (x.svc ? ' · 开通后能用 ' + x.svc + ' 天' : '') });
		}
		ev.sort((a, b) => b.t - a.t);
		// 查看也记一笔（同一个人 1 小时最多记一次，免得刷满操作记录）
		if (await this.hit('auv:' + uid, 1, 3600e3)) await this.alog('user-view', u.email, '在后台查看了这个人的全部记录', 'admin');
		const profile = { uid, email: u.email, name: u.name || '', created: u.created || 0, verified: !!u.verified, totp: !!u.totp, lastAt: u.lastAt || 0, deleted, delAt: u.delAt || 0, delWhy: u.delWhy || '',
			trialUsed: u.trialUsed || 0, trial: u.trial ? { used: u.trial.used || 0, sub: u.trial.sub || '' } : null, inst: u.inst || [], sessions: deleted ? [] : await this.sessionList(u, null), links: (u.links || []).length };
		return { st: 200, ok: true, profile, devs, codes, events: ev.slice(0, 3000), total: ev.length };
	}
	// 把账号放进回收站：登录不了、解除跟路由器的绑定（路由器本身不动），30 天内能恢复
	async _trashUserRec(u, why) {
		for (const x of u.devs || []) { const d = await this.ctx.storage.get('d:' + x.sub); if (d) { d.users = (d.users || []).filter((y) => y !== u.uid); await this.ctx.storage.put('d:' + x.sub, d); } }
		await this.dropSessions(u, null);
		u.delAt = Date.now(); u.delWhy = why;
		await this.ctx.storage.put({ ['xu:' + u.uid]: u, ['xe:' + u.email]: u.uid });
		await this.ctx.storage.delete(['u:' + u.uid, 'e:' + u.email]);
	}
	trashUser(uid, confirm) { return this.lock(() => this._trashUser(uid, confirm)); }
	async _trashUser(uid, confirm) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return { st: 404, error: '没有这个账号' };
		if (String(confirm || '').trim().toLowerCase() !== u.email) return { st: 400, error: '要输入这个账号的邮箱 ' + u.email + ' 才能删除' };
		const ae = String(this.env.ADMIN_EMAIL || '').trim().toLowerCase();
		if (ae && u.email === ae) return { st: 403, error: '这是管理员自己的账号，不能删除' };
		await this._trashUserRec(u, 'admin');
		await this.alog('user-delete', u.email, '放进回收站，绑定的 ' + (u.devs || []).length + ' 台路由器已解除绑定（路由器本身不动）');
		return { st: 200, ok: true, purgeAt: u.delAt + TRASH_DAYS * DAY };
	}
	restoreUser(uid) { return this.lock(() => this._restoreUser(uid)); }
	async _restoreUser(uid) {
		const u = await this.ctx.storage.get('xu:' + uid);
		if (!u) return { st: 404, error: '回收站里没有这个账号' };
		if (await this.ctx.storage.get('e:' + u.email)) return { st: 409, error: '这个邮箱已经重新注册了新账号，恢复不了（可以让他把路由器重新绑定到新账号）' };
		const back = [];
		for (const x of u.devs || []) { const d = await this.ctx.storage.get('d:' + x.sub); if (d) { d.users = [...new Set([...(d.users || []), uid])]; await this.ctx.storage.put('d:' + x.sub, d); back.push(x); } }
		u.devs = back; delete u.delAt; delete u.delWhy; u.sids = [];
		await this.ctx.storage.put({ ['u:' + uid]: u, ['e:' + u.email]: uid });
		await this.ctx.storage.delete(['xu:' + uid, 'xe:' + u.email]);
		await this.alog('user-restore', u.email, '恢复了，重新绑定 ' + back.length + ' 台路由器');
		return { st: 200, ok: true, devs: back.length };
	}
	purgeUser(uid, confirm) { return this.lock(() => this._purgeUser(uid, confirm)); }
	async _purgeUser(uid, confirm) {
		const u = await this.ctx.storage.get('xu:' + uid);
		if (!u) return { st: 400, error: '只能彻底删除回收站里的账号（先删除，进回收站）' };
		if (String(confirm || '').trim().toLowerCase() !== u.email) return { st: 400, error: '要输入这个账号的邮箱 ' + u.email + ' 才能彻底删除' };
		await this.ctx.storage.delete(['xu:' + uid, 'xe:' + u.email, 'av:' + uid]);
		await this.alog('user-purge', u.email, '彻底删除');
		return { st: 200, ok: true };
	}
	// 管理页的路由器列表：带上「受保护」「回收站到期时间」
	async adminDevices() {
		const list = await this.devices(), out = [];
		// 续过期的：用过续期码、续期申请通过过、管理员加过天数
		const rs = new Set();
		for (const k of await this.renewals()) if (k.used && k.sub) rs.add(k.sub);
		for (const a of (await this.ctx.storage.get('aplog')) || []) if (a.status === 'ok') rs.add(a.sub);
		// 路由器上的面板版本（路由器心跳报上来的）：管理页看谁还是旧版
		const brs = await Promise.all(list.map(async (d) => { if (d.state !== 'ok') return null; try { return await this.watch(d.sub).brief(); } catch (e) { return null; } }));
		const vers = brs.map((x) => String((x && x.ver) || '').replace(/^v/, ''));
		// 6.0 第 86 项：上次提醒升级是什么时候、提醒了几次
		const ovm = new Map();
		for (let i = 0; i < list.length; i += 100) for (const [k, v] of await this.ctx.storage.get(list.slice(i, i + 100).map((d) => 'ov:' + d.sub))) ovm.set(k.slice(3), v);
		// 主人点过「不再提醒」的
		const ovo = new Set();
		for (let i = 0; i < list.length; i += 100) for (const [k] of await this.ctx.storage.get(list.slice(i, i + 100).map((d) => 'ovoff:' + d.sub))) ovo.add(k.slice(6));
		// 用户 11/28：列表写「打开面板 x 前」（路由器跟着心跳报）+ 现在在不在线（看最后一次心跳，不再用 6 小时才记一次的 seen）
		for (const [i, d] of list.entries()) out.push({ ...d, ver: vers[i], hot: (brs[i] && brs[i].hot) || 0, po: (brs[i] && brs[i].po) || 0, last: (brs[i] && brs[i].last) || 0, live: (brs[i] && brs[i].state) || '', ed: d.state === 'ok' ? this.edOf(d, brs[i]) : '', ov: ovm.get(d.sub) || null, ovOff: ovo.has(d.sub), prot: await this.isProtected(d), renewed: !!d.grants || rs.has(d.sub), purgeAt: d.offWhy === 'deleted' && d.delAt ? d.delAt + TRASH_DAYS * DAY : 0 });
		return out;
	}
	// 发邮件给绑定了这台路由器的账号：停用（可恢复）/ 恢复了 / 彻底删除（附重新开通的方法）
	async mailOwners(d, kind) {
		if (!d || !this.env.RESEND_API_KEY) return false;
		const e = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
		const name = e(d.name || d.sub), site = 'https://' + this.env.BASE_DOMAIN;
		const T = {
			trash: ['路由器「' + (d.name || d.sub) + '」的托管服务已被停用', `<p>你好，</p><p>你的路由器「${name}」的托管服务已被提供服务的人停用：专属网址暂时打不开，推送和云端备份也暂停了。<b>家里上网和路由器上的设置都不受影响。</b></p><p><b>${ymd((d.delAt || Date.now()) + TRASH_DAYS * DAY)} 前</b>联系提供服务的人可以恢复，恢复以后什么都不用做，原来的网址、登录过的手机都照常能用。</p><p>超过这个日期没恢复的话会被彻底删除，到时候可以在官网拿一个新的安装码重新开通（设置会保留）。</p>`],
			restore: ['路由器「' + (d.name || d.sub) + '」的托管服务恢复了', `<p>你好，</p><p>你的路由器「${name}」的托管服务已经恢复${d.off ? '（不过它已经到期了，要续期以后才能用：在官网账号页这台路由器下面「申请续期」）' : '，专属网址可以正常打开了，什么都不用做'}。</p><p>官网：<a href="${site}/app">${site}/app</a></p>`],
			purge: ['路由器「' + (d.name || d.sub) + '」的托管服务已被删除', `<p>你好，</p><p>你的路由器「${name}」的托管服务已被删除，原来的专属网址不能再用了。<b>家里上网和路由器上的设置都不受影响。</b></p><p><b>想继续用，这样重新开通（设置都会保留）：</b></p><ol><li>打开官网 <a href="${site}/app">${site}/app</a>，在「添加路由器 → 装新路由器」里领试用，或者用提供服务的人给的邀请码兑换一个安装码</li><li>点「复制命令」</li><li>手机连上家里 Wi-Fi，打开路由器后台「服务 → 终端」，用 root 登录，粘贴命令回车</li><li>装好后路由器自动加到你的账号里，回官网「我的路由器」点「打开面板」</li></ol><p>详细步骤：<a href="https://github.com/wznwzn123/openwrt-claude-panel/blob/main/docs/install-hosted.md">安装教程 · 托管网址被删除了怎么办</a></p>`],
		}[kind];
		let sent = false;
		for (const uid of d.users || []) {
			const u = await this.ctx.storage.get('u:' + uid);
			if (u && u.email) { try { if (await this.mail(u.email, T[0], T[1])) sent = true; } catch (x) {} }
		}
		return sent;
	}
	// 封禁：删掉子域名（网址立刻打不开）、云端功能拒绝；解封：重新加回子域名
	setOff(sub, off) { return this.lock(() => this._setOff(sub, off)); }
	// why：'exp' = 到期自动暂停（续期后自动恢复）；不写 = 管理员封禁（续期也不会解封）
	async _setOff(sub, off, why) {
		const d = await this.ctx.storage.get('d:' + sub);
		if (!d || d.state !== 'ok') return false;
		if (off && !d.off) { await dnsDel(this.env, d.dns); d.dns = null; d.off = Date.now(); d.offWhy = why || 'admin'; }
		else if (off && d.off && !why) d.offWhy = 'admin'; // 到期暂停的，管理员又封禁了：续期也不解封
		else if (off && d.off && why === 'deleted') d.offWhy = 'deleted';
		if (!off && d.off) { d.dns = d.local ? await dnsAddLocal(this.env, sub) : await dnsAdd(this.env, sub, d.tunnel); delete d.off; delete d.offWhy; }
		await this.watch(sub).setOff(!!off);
		await this.ctx.storage.put('d:' + sub, d);
		return true;
	}

	/* ---------- 账号（官网登录用）：只管「我的路由器」列表，不保存、也拿不到任何路由器的登录密钥 ---------- */
	async who(sid) {
		if (!sid || !/^[a-z2-9]{32}$/.test(sid)) return null;
		const ss = await this.ctx.storage.get('s:' + sid);
		if (!ss || ss.exp < Date.now()) { if (ss) await this.ctx.storage.delete('s:' + sid); return null; }
		const u = await this.ctx.storage.get('u:' + ss.uid);
		// 安全加固（第二轮）：只认账号「登录着的设备」列表里还有的登录。被挤出列表的（一个账号最多同时 20 个）、改密码或「退出其他设备」时漏掉的，一律作废
		if (u && !(u.sids || []).includes(sid)) { await this.ctx.storage.delete('s:' + sid); return null; }
		if (u && Date.now() - (ss.last || 0) > 600e3) { ss.last = Date.now(); await this.ctx.storage.put('s:' + sid, ss); }
		return u ? { uid: u.uid, email: u.email } : null;
	}
	// 旧名字的登录 Cookie（sid）还认不认：只认改用 __Host-sid 之前登录的（h 是之后发的）。子域名塞进来一个新登录的 sid 不管用；
	// 以前的登录最多 30 天就过期，之后旧名字自然全部失效
	async sidLegacyOk(sid) {
		if (!sid || !/^[a-z2-9]{32}$/.test(sid)) return false;
		const ss = await this.ctx.storage.get('s:' + sid);
		return !!ss && !ss.h;
	}
	async newSession(u, dev) {
		const sid = rnd(32), now = Date.now();
		await this.ctx.storage.put('s:' + sid, { uid: u.uid, h: 1, exp: now + SESSION_DAYS * DAY, kid: rnd(10), at: now, last: now, ua: String((dev && dev.ua) || '').slice(0, 60), place: String((dev && dev.place) || '').slice(0, 60) });
		// 最多同时 20 个登录：超出的最早那几个直接作废（以前只是从列表里拿掉，人还登录着，改密码也清不掉）
		const all = [...(u.sids || []), sid], gone = all.slice(0, -20);
		if (gone.length) await this.ctx.storage.delete(gone.map((x) => 's:' + x));
		u.sids = all.slice(-20); u.lastAt = now;
		await this.ctx.storage.put('u:' + u.uid, u);
		return sid;
	}
	// 登录过的设备：还有效的才列出来；过期的顺手清掉；以前登录的没有设备信息，补一个编号
	async sessionList(u, mine) {
		const out = [], keep = [];
		for (const sid of u.sids || []) {
			const ss = await this.ctx.storage.get('s:' + sid);
			if (!ss || ss.exp < Date.now()) { if (ss) await this.ctx.storage.delete('s:' + sid); continue; }
			if (!ss.kid) { ss.kid = rnd(10); await this.ctx.storage.put('s:' + sid, ss); }
			keep.push(sid);
			out.push({ id: ss.kid, ua: ss.ua || '', place: ss.place || '', at: ss.at || 0, last: ss.last || ss.at || 0, cur: sid === mine });
		}
		if (keep.length !== (u.sids || []).length) { u.sids = keep; await this.ctx.storage.put('u:' + u.uid, u); }
		return out.sort((a, b) => (b.cur - a.cur) || (b.last - a.last));
	}
	async sessions(uid, mine) { const u = await this.ctx.storage.get('u:' + uid); return u ? { st: 200, ok: true, list: await this.sessionList(u, mine) } : { st: 401, error: '请先登录' }; }
	async sessionOut(uid, mine, id) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return { st: 401, error: '请先登录' };
		for (const sid of u.sids || []) {
			const ss = await this.ctx.storage.get('s:' + sid);
			if (!ss || ss.kid !== id) continue;
			if (sid === mine) return { st: 400, error: '这是你正在用的这台，要退出请点「退出登录」' };
			await this.ctx.storage.delete('s:' + sid);
			u.sids = u.sids.filter((x) => x !== sid); await this.ctx.storage.put('u:' + uid, u);
			return { st: 200, ok: true };
		}
		return { st: 404, error: '这台设备已经退出了' };
	}
	async sessionsOutOthers(uid, mine, did) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return { st: 401, error: '请先登录' };
		const n = (u.sids || []).filter((x) => x !== mine).length;
		await this.dropSessions(u, mine); await this.trustOnly(u, did); await this.ctx.storage.put('u:' + uid, u);
		return { st: 200, ok: true, n };
	}
	/* ---------- 新设备登录要邮箱验证码：验证过的浏览器记住 30 天（did 记在浏览器的 cookie 里，账号里只存它的摘要） ---------- */
	newDeviceCode() { return !!this.env.RESEND_API_KEY && this.env.NEW_DEVICE_CODE !== '0'; }
	async trusted(u, did) {
		if (!did) return false;
		const h = await sha256hex(did + ':' + u.uid), now = Date.now();
		return (u.trust || []).some((t) => t.h === h && t.exp > now);
	}
	// 记住这个浏览器（调用的地方负责把 u 存回去）；没有 did 就新发一个，返回给前面写进 cookie
	async trust(u, did) {
		did = did || rnd(32);
		const h = await sha256hex(did + ':' + u.uid), now = Date.now();
		u.trust = [...(u.trust || []).filter((t) => t.exp > now && t.h !== h), { h, exp: now + TRUST_DAYS * DAY, at: now }].slice(-20);
		return did;
	}
	// 只留这个浏览器（改密码、退出其他所有设备以后，别的设备再登录都要重新验证）
	async trustOnly(u, did) { const keep = did ? await sha256hex(did + ':' + u.uid) : ''; u.trust = (u.trust || []).filter((t) => t.h === keep && t.exp > Date.now()); }
	async sendLoginCode(u, pl) {
		if (await this.mailFull()) return { st: 503, error: MAIL_FULL_MSG, mailFull: true };
		if (!(await this.hit('ml1:' + u.uid, 1, 60e3))) return { st: 429, error: '发得太快了，1 分钟后再试' };
		if (!(await this.hit('mld:' + u.uid, 10, DAY))) return { st: 429, error: '今天发的验证码太多了，明天再试' };
		pl.code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)); pl.tries = 0;
		const e = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
		const sent = await this.mail(u.email, `验证码 ${pl.code}（新设备登录）`, `<p>你的账号正在一台新设备上登录：</p><p><b>${e((pl.dev && pl.dev.ua) || '没认出是什么设备')}</b>${pl.dev && pl.dev.place ? '<br>大概位置：' + e(pl.dev.place) : ''}</p><p>验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${pl.code}</p><p>10 分钟内有效。<b>如果不是你本人在登录，说明密码可能泄露了，请马上登录官网改密码。</b></p>`);
		if (!sent) return (await this.mailFull()) ? { st: 503, error: MAIL_FULL_MSG, mailFull: true } : { st: 502, error: '验证码邮件没发出去，稍后再试' };
		return null;
	}
	userLogin2(a) { return this.lock(() => this._userLogin2(a)); }
	async _userLogin2({ token, code, op, did, dev, ip }) {
		const k = 'pl:' + String(token || ''), pl = /^[a-z2-9]{24}$/.test(String(token || '')) && (await this.ctx.storage.get(k));
		if (!pl || pl.exp < Date.now()) { if (pl) await this.ctx.storage.delete(k); return { st: 400, error: '验证码过期了，请重新输入密码登录', again: true }; }
		const u = await this.ctx.storage.get('u:' + pl.uid);
		if (!u) { await this.ctx.storage.delete(k); return { st: 400, error: '这个账号已经不在了', again: true }; }
		const L = (ok, why) => this.loginLog({ k: 'user', who: u.email, ok, why, ip, place: dev && dev.place, ua: dev && dev.ua });
		if (pl.k === 'totp') return this.login2Totp(u, pl, k, code, op, L, did, dev);
		if (op === 'resend') { const er = await this.sendLoginCode(u, pl); if (er) return er; await this.ctx.storage.put(k, pl); return { st: 200, ok: true }; }
		if (!safeEq(String(code || '').trim(), pl.code)) {
			pl.tries = (pl.tries || 0) + 1;
			if (pl.tries >= 5) { await this.ctx.storage.delete(k); await L(false, '新设备验证码错了 5 次'); return { st: 400, error: '验证码错太多次了，请重新输入密码登录', again: true }; }
			await this.ctx.storage.put(k, pl); await L(false, '新设备验证码不对');
			return { st: 400, error: '验证码不对' };
		}
		await this.ctx.storage.delete(k);
		await L(true, '新设备验证通过，登录成功');
		const seen = (await this.sessionList(u, '')).map((x) => x.ua);
		const nd = await this.trust(u, did);
		const sid = await this.newSession(u, dev); // newSession 会把 u（连同 trust）存回去
		if (dev && dev.ua && seen.length && !seen.includes(dev.ua)) await this.loginAlert(u, dev);
		return { st: 200, sid, did: nd };
	}
	// 6.0 第 5 项：新设备登录第二步是两步验证（验证器上的码或恢复码）
	async login2Totp(u, pl, k, code, op, L, did, dev) {
		if (op === 'resend') return { st: 400, error: '开了两步验证，要输验证器 App 上的码，不发邮件' };
		if (!u.totp) { await this.ctx.storage.delete(k); return { st: 400, error: '两步验证已经关了，请重新输入密码登录', again: true }; }
		const r = await this.totpTry(u, code);
		if (!r.ok) {
			if (r.locked) { await this.ctx.storage.delete(k); await L(false, '两步验证的码错太多次，被限制'); return { st: 429, error: '验证码错太多次了，15 分钟后再登录', again: true }; }
			pl.tries = (pl.tries || 0) + 1;
			if (pl.tries >= 5) { await this.ctx.storage.delete(k); await L(false, '两步验证的码错了 5 次'); return { st: 400, error: '验证码错太多次了，请重新输入密码登录', again: true }; }
			await this.ctx.storage.put(k, pl); await L(false, '两步验证的码不对');
			return { st: 400, error: '验证码不对' };
		}
		await this.ctx.storage.delete(k);
		await L(true, r.how === 'rc' ? '用备用恢复码登录成功' : '两步验证通过，登录成功');
		const seen = (await this.sessionList(u, '')).map((x) => x.ua);
		const nd = await this.trust(u, did);
		const sid = await this.newSession(u, dev); // 连同 totp（用过的码、用掉的恢复码）一起存回去
		if (r.how === 'rc') { const n = u.totp.rc.length; try { await this.mail(u.email, '你用备用恢复码登录了账号', `<p>你好，</p><p>你的官网账号刚刚用一个备用恢复码登录了，还剩 <b>${n}</b> 个。</p><p>${n <= 3 ? '<b>剩得不多了</b>，' : ''}登录以后可以在「账号设置 → 两步验证」里重新生成一组。<b>不是你本人</b>的话，请马上改密码。</p>`); } catch (x) {} }
		else if (dev && dev.ua && seen.length && !seen.includes(dev.ua)) await this.loginAlert(u, dev);
		return r.how === 'rc' ? { st: 200, sid, did: nd, rcLeft: u.totp.rc.length } : { st: 200, sid, did: nd };
	}
	async loginAlert(u, dev) {
		if (!this.env.RESEND_API_KEY || this.env.LOGIN_ALERT === '0') return;
		const t = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
		const e = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
		try { await this.mail(u.email, '新设备登录了你的路由器面板账号', `<p>你好，</p><p>你的账号刚刚在一台新设备上登录了：</p><p><b>${e(dev.ua)}</b>${dev.place ? '<br>大概位置：' + e(dev.place) : ''}<br>时间：${t}（北京时间）</p><p>是你自己就不用管。<b>不是你的话</b>：打开 <a href="https://${this.env.BASE_DOMAIN}/app">账号页</a>，在「登录过的设备」里把它退出，再改一下密码。</p>`); } catch (x) {}
	}
	async dropSessions(u, keep) {
		const del = (u.sids || []).filter((x) => x !== keep);
		if (del.length) await this.ctx.storage.delete(del.map((x) => 's:' + x));
		u.sids = keep ? [keep] : [];
	}
	// 限流计数：key 在 win 毫秒内最多 max 次
	async hit(key, max, win) {
		const now = Date.now(), k = 'r:' + key;
		const a = ((await this.ctx.storage.get(k)) || []).filter((t) => t > now - win);
		if (a.length >= max) return false;
		a.push(now);
		await this.ctx.storage.put(k, a);
		return true;
	}
	// 邮箱验证码（注册、找回密码）：10 分钟有效，最多试 5 次；同一个邮箱 1 分钟发一次、一天 10 次
	async mailCode({ email, kind, ip }) {
		email = normEmail(email);
		if (!email) return { st: 400, error: '邮箱格式不对' };
		if (!['reg', 'reset'].includes(kind)) return { st: 400, error: 'bad kind' };
		if (!this.env.RESEND_API_KEY) return { st: 501, error: '还没有开通邮件服务' };
		if (await this.mailFull()) return { st: 503, error: MAIL_FULL_MSG, mailFull: true }; // 放在查邮箱前面：不让人借这个看出邮箱有没有注册
		const has = await this.ctx.storage.get('e:' + email);
		if (kind === 'reg' && has) return { st: 409, error: '这个邮箱已经注册过，直接登录就行' };
		if (kind === 'reset' && !has) return { st: 200, ok: true }; // 不告诉别人这个邮箱有没有注册
		if (!(await this.hit('m1:' + email, 1, 60e3))) return { st: 429, error: '发得太快了，1 分钟后再试' };
		if (!(await this.hit('md:' + email, 10, DAY)) || !(await this.hit('mi:' + ip, 20, 3600e3))) return { st: 429, error: '今天发的验证码太多了，明天再试' };
		const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
		await this.ctx.storage.put('c:' + kind + ':' + email, { code, exp: Date.now() + 600e3, tries: 0 });
		const what = kind === 'reg' ? '注册账号' : '重置密码';
		const sent = await this.mail(email, `验证码 ${code}（${what}）`, `<p>你正在${what}，验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>10 分钟内有效。如果不是你本人操作，忽略这封邮件就行。</p>`);
		if (!sent) return (await this.mailFull()) ? { st: 503, error: MAIL_FULL_MSG, mailFull: true } : { st: 502, error: '邮件没发出去，稍后再试' };
		return { st: 200, ok: true };
	}
	async useCode(email, kind, code) {
		const k = 'c:' + kind + ':' + email, c = await this.ctx.storage.get(k);
		if (!c || c.exp < Date.now()) return false;
		if (!safeEq(String(code || '').trim(), c.code)) { c.tries++; if (c.tries >= 5) await this.ctx.storage.delete(k); else await this.ctx.storage.put(k, c); return false; }
		await this.ctx.storage.delete(k);
		return true;
	}
	userRegister(a) { return this.lock(() => this._registerUser(a)); }
	async _registerUser({ email, password, code, ip, dev, did }) {
		email = normEmail(email);
		if (!email) return { st: 400, error: '邮箱格式不对' };
		const pe = pwError(password); if (pe) return { st: 400, error: pe };
		if (await this.ctx.storage.get('e:' + email)) return { st: 409, error: '这个邮箱已经注册过，直接登录就行' };
		// 用户 11/27：名额只管开通托管，满了也能注册账号（自建版申请尝鲜、反馈都要账号）；领试用、开通托管时才排队
		if (!(await this.hit('ri:' + ip, 10, 3600e3))) return { st: 429, error: '注册太频繁了，一小时后再试' };
		if (this.env.RESEND_API_KEY && !(await this.useCode(email, 'reg', code))) return { st: 400, error: '验证码不对或已过期' };
		const uid = rnd(12), salt = rnd(16);
		const u = { uid, email, salt, pw: await pwHash(password, salt), created: Date.now(), devs: [], sids: [], verified: !!this.env.RESEND_API_KEY };
		await this.ctx.storage.put({ ['u:' + uid]: u, ['e:' + email]: uid });
		await this.loginLog({ k: 'reg', who: email, ok: true, why: '注册', ip, place: dev && dev.place, ua: dev && dev.ua });
		const nd = this.newDeviceCode() ? await this.trust(u, did) : ''; // 注册时邮箱验证过了，这台设备就算验证过
		return { st: 200, sid: await this.newSession(u, dev), did: nd };
	}
	async userLogin({ email, password, ip, dev, did }) {
		email = normEmail(email);
		if (!email || typeof password !== 'string') return { st: 400, error: '邮箱或密码不对' };
		const L = (ok, why) => this.loginLog({ k: 'user', who: email, ok, why, ip, place: dev && dev.place, ua: dev && dev.ua });
		if (!(await this.hit('li:' + ip, 30, 900e3))) { await L(false, '这个 IP 试太多次，被限制'); return { st: 429, error: '尝试太多次了，15 分钟后再试' }; }
		const fk = 'lf:' + email, f = ((await this.ctx.storage.get('r:' + fk)) || []).filter((t) => t > Date.now() - 900e3);
		const uid = await this.ctx.storage.get('e:' + email), u = uid && (await this.ctx.storage.get('u:' + uid));
		// 安全加固（第二轮）：别人拿你的邮箱连输错密码，只锁「没验证过的设备」；你自己常用、验证过的设备照样能登录
		if (f.length >= 10 && !(u && (await this.trusted(u, did)))) { await L(false, '这个账号密码错太多次，被限制'); return { st: 429, error: '这个账号密码错了太多次，15 分钟后再试' }; }
		if (!u) { const xu = await this.ctx.storage.get('xe:' + email).then((x) => x && this.ctx.storage.get('xu:' + x)); if (xu) { const h0 = await pwHash(password, xu.salt); if (safeEq(h0, xu.pw)) return { st: 403, error: '这个账号已经' + (xu.delWhy === 'self' ? '注销' : '被停用') + '，' + ymd(xu.delAt + TRASH_DAYS * DAY) + ' 前联系提供服务的人可以恢复' }; } }
		const h = await pwHash(password, u ? u.salt : 'x'.repeat(16)); // 账号不存在也算一遍，别让人从响应时间看出来
		if (!u || !safeEq(h, u.pw)) { await this.hit(fk, 10, 900e3); await L(false, u ? '密码不对' : '没有这个账号'); return { st: 401, error: '邮箱或密码不对' }; }
		// 6.0 第 5 项：开了两步验证，没验证过的设备要输验证器上的码（或恢复码），不发邮箱验证码
		if (u.totp && !(await this.trusted(u, did))) {
			const token = rnd(24);
			await this.ctx.storage.put('pl:' + token, { uid: u.uid, exp: Date.now() + 600e3, dev, ip, k: 'totp' });
			await L(false, '密码对了，新设备要输两步验证的码');
			return { st: 200, ok: true, need: 'totp', token };
		}
		if (this.newDeviceCode() && !(await this.trusted(u, did))) {
			// 密码对了，但这是没验证过的设备：先发邮箱验证码，输对了才登录
			const token = rnd(24), pl = { uid: u.uid, exp: Date.now() + 600e3, dev, ip };
			const er = await this.sendLoginCode(u, pl); if (er) return er;
			await this.ctx.storage.put('pl:' + token, pl);
			await L(false, '密码对了，新设备要输邮箱验证码');
			return { st: 200, ok: true, need: 'code', token, mail: maskEmail(u.email) };
		}
		await L(true, '登录成功');
		// 新设备登录提醒：账号里别的还在登录的设备都不是这种设备，就发邮件告诉本人
		const seen = (await this.sessionList(u, '')).map((x) => x.ua);
		const sid = await this.newSession(u, dev);
		if (dev && dev.ua && seen.length && !seen.includes(dev.ua)) await this.loginAlert(u, dev);
		return { st: 200, sid };
	}
	async userLogout(sid) { const ss = sid && (await this.ctx.storage.get('s:' + sid)); if (!ss) return; await this.ctx.storage.delete('s:' + sid); const u = await this.ctx.storage.get('u:' + ss.uid); if (u) { u.sids = (u.sids || []).filter((x) => x !== sid); await this.ctx.storage.put('u:' + u.uid, u); } }
	async me(uid) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return null;
		const devs = [];
		for (const x of u.devs || []) {
			const d = await this.ctx.storage.get('d:' + x.sub);
			if (!d || d.state !== 'ok') continue;
			let b = { last: 0, state: 'wait', ver: '' };
			try { b = await this.watch(x.sub).brief(); } catch (e) {}
			const role = this.famRole(d, uid), fo = this.famOf(d), sx = fo.subs[uid];
			const fam = { role, owner: role === 'main' || !fo.owner ? null : await this.famPerson(fo.owner), perms: sx ? permsOf(sx) : null, subExp: sx ? sx.exp || 0 : 0, nsub: Object.keys(fo.subs).length };
			devs.push({ ...fam, sub: x.sub, host: host(this.env, x.sub), name: x.alias || d.name || x.sub, model: d.model || '', off: !!d.off, last: b.last, state: b.state, ver: b.ver || '', ed: this.edOf(d, b), edJob: role === 'main' ? this.edJobOut(d) : null, bound: x.at, exp: d.exp || 0, expired: !!(d.off && d.offWhy === 'exp'), trashed: d.offWhy === 'deleted' ? (d.delAt || 0) + TRASH_DAYS * DAY : 0, apply: await this.applyBrief(x.sub, uid) });
		}
		const links = (u.links || []).map((x) => ({ id: x.id, url: x.url, name: x.name, at: x.at }));
		const td = this.trialDays(), ts = td ? await this.trialState(u) : null, inst = await this.instList(u);
		return { email: maskEmail(u.email), name: u.name || '', avatar: (await this.ctx.storage.get('av:' + uid)) || '', layout: u.layout || [], created: u.created, lastAt: u.lastAt || 0, verified: !!u.verified, devs, links, mail: !!this.env.RESEND_API_KEY, trial: ts && ts.max ? { days: td, max: ts.max, used: ts.used, left: ts.left, open: ts.open } : null, inst, totp: this.totpBrief(u) };
	}
	// 个人主页：名字和头像。头像是浏览器里裁成正方形、压缩好的小图（data:image/...;base64），单独存一份，不放进账号记录里
	async brief(uid) { const u = await this.ctx.storage.get('u:' + uid); if (!u) return null; return { email: maskEmail(u.email), name: u.name || '', avatar: (await this.ctx.storage.get('av:' + uid)) || '' }; }
	setProfile(uid, p) { return this.lock(() => this._setProfile(uid, p)); }
	async _setProfile(uid, { name, avatar, layout }) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return { st: 401, error: '请先登录' };
		if (!(await this.hit('pf:' + uid, 30, 3600e3))) return { st: 429, error: '改得太频繁了，过一会儿再试' };
		if (name !== undefined) {
			const n = String(name || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
			if ([...n].length > 20) return { st: 400, error: '名字最多 20 个字' };
			if (n) u.name = n; else delete u.name;
			await this.ctx.storage.put('u:' + uid, u);
		}
		// 「我的路由器」页面的布局：板块顺序、宽窄、隐藏（只存这几样，最多 12 块）
		if (layout !== undefined) {
			if (!Array.isArray(layout) || layout.length > 12) return { st: 400, error: '布局不对' };
			const L = [];
			for (const x of layout) { const id = String((x && x.id) || ''); if (!/^[a-z]{2,10}$/.test(id) || L.some((y) => y.id === id)) return { st: 400, error: '布局不对' }; L.push({ id, w: x.w === 'full' ? 'full' : 'half', hide: !!x.hide }); }
			if (L.length) u.layout = L; else delete u.layout;
			await this.ctx.storage.put('u:' + uid, u);
		}
		if (avatar !== undefined) {
			const a = String(avatar || '');
			if (!a) await this.ctx.storage.delete('av:' + uid);
			else {
				const m = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(a);
				if (!m) return { st: 400, error: '头像格式不对，请换一张图片' };
				if (a.length > 60000) return { st: 400, error: '头像太大了，请换一张小一点的图片' };
				let head = '';
				try { head = atob(m[2].slice(0, 24)); } catch (e) { return { st: 400, error: '头像格式不对，请换一张图片' }; }
				const ok = { webp: head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP', jpeg: head.charCodeAt(0) === 0xff && head.charCodeAt(1) === 0xd8, png: head.slice(1, 4) === 'PNG' }[m[1]];
				if (!ok) return { st: 400, error: '头像格式不对，请换一张图片' };
				await this.ctx.storage.put('av:' + uid, a);
			}
		}
		return { st: 200, ok: true, name: u.name || '', avatar: (await this.ctx.storage.get('av:' + uid)) || '', layout: u.layout || [] };
	}
	// 路由器那边（凭 RKEY）要一个配对码，用户在官网输入配对码，就把这台路由器加到自己账号里
	async pairStart({ sub, rkey }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		if (await this.devOff(sub)) return { st: 403, error: '这台路由器的托管服务已停用' };
		if (!(await this.hit('ps:' + sub, 20, 3600e3))) return { st: 429, error: '太频繁了，稍后再试' };
		const code = rnd(8).toUpperCase();
		await this.ctx.storage.put('p:' + code, { sub, exp: Date.now() + 600e3 });
		return { st: 200, code, exp: Date.now() + 600e3 };
	}
	// 管理员封禁的、在回收站里的路由器：钥匙还对，但不再给它加新的人、新的登录、发消息和文件（到期暂停的不算，还要能联系开发者续期）
	async devData(sub) { return SUB_RE.test(String(sub || '')) ? (await this.ctx.storage.get('d:' + sub)) || null : null; }
	async devOff(sub) { const d = await this.ctx.storage.get('d:' + sub); return !!(d && d.off && d.offWhy !== 'exp'); }
	async devOk(sub, rkey) { if (!SUB_RE.test(sub || '')) return false; const c = await this.watch(sub).getCfg(); return !!c && safeEq(rkey, c.rkey); }
	bind(uid, code, ip) { return this.lock(() => this._bind(uid, code, ip)); }
	async _bind(uid, code, ip) {
		if (!(await this.hit('bi:' + uid, 20, 3600e3))) return { st: 429, error: '试太多次了，一小时后再试' };
		code = String(code || '').trim().toUpperCase().replace(/[^A-Z2-9]/g, '');
		const p = code && (await this.ctx.storage.get('p:' + code));
		if (!p || p.exp < Date.now()) return { st: 400, error: '配对码不对或已过期（10 分钟有效）。重新拿一个：面板「系统操作 → 绑定到账号」，或者路由器终端运行 cmcp-pair' };
		await this.ctx.storage.delete('p:' + code);
		const d = await this.ctx.storage.get('d:' + p.sub), u = await this.ctx.storage.get('u:' + uid);
		if (!d || d.state !== 'ok' || !u) return { st: 400, error: '这台路由器已经不在了' };
		if (!(u.devs || []).some((x) => x.sub === p.sub)) {
			// 5.2：一台路由器只有一个主账号。已经有人绑定了，别人只能用主账号发的加入码当子账号
			const f = this.famOf(d);
			if (f.owner || f.pick) return { st: 400, error: '这台路由器已经有主账号了。想一起用的话，请主账号在面板「我的主页 → 子账号」里给你发一个加入码' };
			if ((u.devs || []).length >= 40) return { st: 400, error: '你的账号里路由器太多了' };
			u.devs = [...(u.devs || []), { sub: p.sub, at: Date.now() }];
			d.users = [uid]; d.owner = uid; d.subs = {};
			await this.ctx.storage.put({ ['u:' + uid]: u, ['d:' + p.sub]: d });
			await this.rlog(p.sub, '🔗', '绑定到 ' + (await this.rname(uid)) + ' 的账号，他是主账号');
		}
		return { st: 200, ok: true, sub: p.sub, name: d.name || p.sub };
	}
	unbind(uid, sub, opt) { return this.lock(() => this._unbind(uid, sub, opt)); }
	async _unbind(uid, sub, opt = {}) {
		const u = await this.ctx.storage.get('u:' + uid), d = await this.ctx.storage.get('d:' + sub);
		// 主账号解绑：整台路由器从所有人的账号里拿掉（子账号也一起），官网上要先确认是本人
		if (d && this.famRole(d, uid) === 'main') {
			if (opt.web && !opt.sudo) return { st: 403, error: '你是主账号：解绑要先确认是你本人（邮箱验证码）', sudo: true };
			for (const x of [...(d.users || [])]) { const xu = await this.ctx.storage.get('u:' + x); if (xu) { xu.devs = (xu.devs || []).filter((y) => y.sub !== sub); await this.ctx.storage.put('u:' + x, xu); } this.famKick(d, x); }
			d.users = []; delete d.owner; d.subs = {};
			await this.ctx.storage.put('d:' + sub, d);
			await this.rlog(sub, '✂️', '主账号 ' + (await this.rname(uid)) + ' 解绑了这台路由器，所有账号都移除了');
			return { st: 200, ok: true, all: true };
		}
		// 官网上解绑：自己账号里没有、也不是成员的路由器，直接说没有（以前什么都不做也回「成功」）
		if (opt.web && !(u && (u.devs || []).some((x) => x.sub === sub)) && !(d && (d.users || []).includes(uid))) return { st: 404, error: '你的账号里没有这台路由器' };
		if (u) { u.devs = (u.devs || []).filter((x) => x.sub !== sub); await this.ctx.storage.put('u:' + uid, u); }
		if (d) { await this.famDrop(d, uid); await this.ctx.storage.put('d:' + sub, d); }
		return { st: 200, ok: true };
	}
	// 自建版路由器：账号里只记名字和面板网址，方便换手机时找到（不记密钥；粘贴了登录地址也只留网址部分）
	addLink(uid, name, url) { return this.lock(() => this._addLink(uid, name, url)); }
	async _addLink(uid, name, url) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return { st: 401, error: '请先登录' };
		const n = panelUrl(url);
		if (!n) return { st: 400, error: '网址不对：填路由器面板的网址，比如 https://router.example.com/panel/' };
		const base = String(this.env.BASE_DOMAIN || '').toLowerCase();
		if (base && (n.host === base || n.host.endsWith('.' + base))) return { st: 400, error: '这是托管版的网址，请用配对码绑定（面板「系统操作 → 绑定到账号」）' };
		u.links = u.links || [];
		if (u.links.some((x) => x.url === n.url)) return { st: 400, error: '这台已经添加过了' };
		if (u.links.length >= 20) return { st: 400, error: '最多添加 20 台自建版路由器' };
		const id = rnd(10);
		u.links.push({ id, url: n.url, name: clean(name, 40) || n.host, at: Date.now() });
		await this.ctx.storage.put('u:' + uid, u);
		return { st: 200, ok: true, id, name: clean(name, 40) || n.host, stripped: n.stripped };
	}
	delLink(uid, id) { return this.lock(async () => {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return { st: 401, error: '请先登录' };
		const before = (u.links || []).length;
		u.links = (u.links || []).filter((x) => x.id !== id);
		if (u.links.length === before) return { st: 404, error: '没有这台路由器' };
		await this.ctx.storage.put('u:' + uid, u);
		return { st: 200, ok: true };
	}); }
	async rename(uid, sub, alias) {
		const u = await this.ctx.storage.get('u:' + uid);
		const x = u && (u.devs || []).find((y) => y.sub === sub);
		if (!x) return { st: 404, error: '你的账号里没有这台路由器' };
		x.alias = clean(alias, 30);
		await this.ctx.storage.put('u:' + uid, u);
		return { st: 200, ok: true };
	}
	async userPassword(uid, sid, old, pw, did) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return { st: 401, error: '请先登录' };
		if (!safeEq(await pwHash(String(old || ''), u.salt), u.pw)) return { st: 403, error: '原密码不对' };
		const pe = pwError(pw); if (pe) return { st: 400, error: pe };
		u.salt = rnd(16); u.pw = await pwHash(pw, u.salt);
		await this.dropSessions(u, sid); // 其他设备上的登录全部退出
		await this.trustOnly(u, did); // 别的设备再登录要重新收验证码
		await this.ctx.storage.put('u:' + uid, u);
		return { st: 200, ok: true };
	}
	async userReset({ email, code, password, dev, ip, did }) {
		email = normEmail(email);
		const uid = email && (await this.ctx.storage.get('e:' + email)), u = uid && (await this.ctx.storage.get('u:' + uid));
		const L = (ok, why) => this.loginLog({ k: 'reset', who: email, ok, why, ip, place: dev && dev.place, ua: dev && dev.ua });
		if (!u || !(await this.useCode(email, 'reset', code))) { if (email) await L(false, '验证码不对'); return { st: 400, error: '验证码不对或已过期' }; }
		const pe = pwError(password); if (pe) return { st: 400, error: pe };
		u.salt = rnd(16); u.pw = await pwHash(password, u.salt); u.verified = true;
		await this.dropSessions(u, null);
		await this.trustOnly(u, ''); // 找回密码：以前记住的设备都作废，只记住这一台（刚收过邮箱验证码）
		// 6.0 第 5 项：开了两步验证的，光有邮箱还不够：密码改好了，登录还要输验证器上的码（或恢复码）
		if (u.totp) {
			await this.ctx.storage.put('u:' + uid, u);
			await L(true, '找回密码成功，还要输两步验证的码');
			const token = rnd(24);
			await this.ctx.storage.put('pl:' + token, { uid: u.uid, exp: Date.now() + 600e3, dev, ip, k: 'totp' });
			return { st: 200, ok: true, need: 'totp', token };
		}
		const nd = this.newDeviceCode() ? await this.trust(u, did) : '';
		await this.ctx.storage.put('u:' + uid, u);
		await L(true, '找回密码成功');
		return { st: 200, sid: await this.newSession(u, dev), did: nd };
	}
	delAccount(uid, password, code) { return this.lock(() => this._delAccount(uid, password, code)); }
	async _delAccount(uid, password, code) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return { st: 401, error: '请先登录' };
		if (!safeEq(await pwHash(String(password || ''), u.salt), u.pw)) return { st: 403, error: '密码不对' };
		// 开了两步验证：注销还要输验证器上的码（光有密码和这次登录不够）
		if (u.totp) { if (!code) return { st: 403, error: '开了两步验证，要输验证器上的码', totp: true }; const r = await this.totpTry(u, code); if (!r.ok) return { st: r.locked ? 429 : 403, error: r.locked ? '错太多次了，15 分钟后再试' : '验证码不对', totp: true }; await this.ctx.storage.put('u:' + uid, u); }
		// 也先放进回收站：30 天内提供服务的人能帮忙恢复，之后自动彻底删除
		await this._trashUserRec(u, 'self');
		await this.alog('user-delete', u.email, '用户自己注销了账号（30 天内能恢复）', 'user');
		return { st: 200, ok: true };
	}
	// 路由器面板里看「哪些账号绑定了我」、移除某个账号（凭 RKEY）
	// 官网中转（5.2.3）：这台路由器的专属网址现在能不能用（存在、没停用、没删除）
	async relayOk(sub) {
		if (!SUB_RE.test(String(sub || ''))) return false;
		const d = await this.ctx.storage.get('d:' + sub);
		return !!(d && !d.off && !d.delAt && d.dns !== null);
	}
	async devAccounts({ sub, rkey }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		const d = await this.ctx.storage.get('d:' + sub), list = [];
		for (const uid of (d && d.users) || []) { const u = await this.ctx.storage.get('u:' + uid); if (u) list.push({ uid, email: maskEmail(u.email), name: u.name || '', avatar: (await this.ctx.storage.get('av:' + uid)) || '', at: ((u.devs || []).find((x) => x.sub === sub) || {}).at || 0 }); }
		return { st: 200, list };
	}
	async devUnbind({ sub, rkey, uid }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		return this.unbind(String(uid || ''), sub);
	}
	// 托管版登录码：每台新手机第一次打开面板要输。只有账号里绑定了这台路由器的人才能拿；8 位，10 分钟有效，用一次就作废
	async loginCode(uid, sub) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u || !(u.devs || []).some((x) => x.sub === sub)) return { st: 404, error: '你的账号里没有这台路由器' };
		const d = await this.ctx.storage.get('d:' + sub);
		if (!d || d.state !== 'ok') return { st: 404, error: '这台路由器已经不在了' };
		if (!(await this.hit('lc:' + uid, 30, 3600e3))) return { st: 429, error: '拿得太频繁了，一小时后再试' };
		const code = rnd(8).toUpperCase(), exp = Date.now() + 600e3;
		await this.ctx.storage.put('l:' + sub + ':' + code, { uid, exp });
		return { st: 200, code, exp };
	}
	// 路由器那边（凭 RKEY）核对手机上输入的登录码
	async devLoginCode({ sub, rkey, code }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		if (await this.devOff(sub)) return { st: 403, error: '这台路由器的托管服务已停用' };
		if (!(await this.hit('lv:' + sub, 30, 3600e3))) return { st: 429, error: '输错太多次了，一小时后再试' };
		code = String(code || '').trim().toUpperCase().replace(/[^A-Z2-9]/g, '');
		const k = 'l:' + sub + ':' + code, x = code.length === 8 ? await this.ctx.storage.get(k) : null;
		if (!x || x.exp < Date.now()) return { st: 400, error: '登录码不对或已过期（10 分钟有效）。在官网账号页这台路由器下面点「获取登录码」重新拿一个' };
		await this.ctx.storage.delete(k);
		const u = await this.ctx.storage.get('u:' + x.uid);
		if (!u || !(u.devs || []).some((y) => y.sub === sub)) return { st: 400, error: '拿这个登录码的账号已经解绑了这台路由器' };
		return { st: 200, ok: true, email: maskEmail(u.email), uid: x.uid, now: Date.now() };
	}
	// 杂项小数据（比如最后一次查到的最新版本）
	async meta(k) { return (await this.ctx.storage.get('m:' + k)) || null; }
	async setMeta(k, v) { const old = await this.ctx.storage.get('m:' + k); if (JSON.stringify(old) !== JSON.stringify(v)) await this.ctx.storage.put('m:' + k, v); }
	async devices() { return [...(await this.ctx.storage.list({ prefix: 'd:' })).values()]; }
	async invites() { return [...(await this.ctx.storage.list({ prefix: 'i:' })).entries()].map(([k, v]) => ({ code: k.slice(2), ...v })); }
	// direct：可以不经官网兑换、直接在路由器上用（只有接口能设，给自动化测试和特殊情况用；管理后台生成的默认都要先兑换）
	async addInvite({ max, days, note, svc, direct }) {
		let code;
		do { code = rnd(10).toUpperCase(); } while (await this.ctx.storage.get('i:' + code));
		const inv = { max: Math.max(1, Math.min(1000, +max || 1)), used: 0, created: Date.now(), exp: +days > 0 ? Date.now() + days * DAY : 0, note: clean(note, 60), svc: Math.max(0, Math.min(3650, Math.round(+svc || 0))), ...(direct === true ? { direct: true } : {}) };
		await this.ctx.storage.put('i:' + code, inv);
		return { code, ...inv };
	}
	async delInvite(code) { return this.ctx.storage.delete('i:' + String(code || '').toUpperCase()); }
	/* ---------- 续期码：试用到期前找提供服务的人要，在官网账号页（或路由器上）输入，给这台路由器加天数 ---------- */
	async renewals() { return [...(await this.ctx.storage.list({ prefix: 'k:' })).entries()].map(([k, v]) => ({ code: k.slice(2), ...v })); }
	async addRenewals({ days, count, note }) {
		const n = Math.max(1, Math.min(50, Math.round(+count || 1))), d = Math.max(1, Math.min(3650, Math.round(+days || 90))), out = [];
		for (let i = 0; i < n; i++) {
			let code;
			do { code = rnd(10).toUpperCase(); } while ((await this.ctx.storage.get('k:' + code)) || (await this.ctx.storage.get('i:' + code)));
			const k = { days: d, created: Date.now(), note: clean(note, 60), used: 0 };
			await this.ctx.storage.put('k:' + code, k);
			out.push({ code, ...k });
		}
		return out;
	}
	async delRenewal(code) { return this.ctx.storage.delete('k:' + String(code || '').toUpperCase()); }
	renew(sub, code, by) { return this.lock(() => this._renew(sub, code, by)); }
	async _renew(sub, code, by) {
		if (!(await this.hit('rn:' + sub, 20, 3600e3))) return { st: 429, error: '试太多次了，一小时后再试' };
		code = String(code || '').trim().toUpperCase().replace(/[^A-Z2-9]/g, '');
		const k = code && (await this.ctx.storage.get('k:' + code)), d = await this.ctx.storage.get('d:' + sub);
		if (!d || d.state !== 'ok') return { st: 404, error: '没有这台路由器' };
		if (!k) return { st: 400, error: '续期码不对' };
		if (k.used) return { st: 400, error: '这个续期码已经用过了' };
		if (!d.exp) return { st: 400, error: '这台路由器不限期，不用续期' };
		k.used = Date.now(); k.sub = sub; k.by = clean(by, 40);
		await this.ctx.storage.put('k:' + code, k);
		const exp = await this._grant(d, k.days);
		return { st: 200, ok: true, exp, days: k.days };
	}
	// 给一台路由器加天数：没到期在原到期时间上加，到期了从今天算；到期暂停的马上恢复（管理员封禁的不动）
	async _grant(d, days, why) {
		const now = Date.now();
		d.exp = Math.max(now, d.exp || now) + days * DAY;
		d.grants = (d.grants || 0) + 1;
		delete d.warn3;
		await this.ctx.storage.put('d:' + d.sub, d);
		if (d.off && d.offWhy === 'exp') await this._setOff(d.sub, false);
		try { await this.watch(d.sub).push({ title: '✅ 托管服务已续期', body: (why ? why + '，' : '') + '续了 ' + days + ' 天，到期时间 ' + ymd(d.exp) + '。', tag: 'svc', lvl: 'ok' }); } catch (e) {}
		return d.exp;
	}
	/* ---------- 续期申请：到期（或快到期）时，用户在官网账号页填申请表；管理员在管理页通过或拒绝 ---------- */
	apply(uid, email, a) { return this.lock(() => this._apply(uid, email, a)); }
	async _apply(uid, email, { sub, source, contact, note }) {
		const u = await this.ctx.storage.get('u:' + uid), d = await this.ctx.storage.get('d:' + sub);
		if (!u || !(u.devs || []).some((x) => x.sub === sub) || !d || d.state !== 'ok') return { st: 404, error: '你的账号里没有这台路由器' };
		if (!d.exp) return { st: 400, error: '这台路由器不限期，不用申请续期' };
		source = String(source || '').trim().slice(0, 60); contact = String(contact || '').trim().slice(0, 80); note = String(note || '').trim().slice(0, 300);
		if (!source) return { st: 400, error: '请填写从哪里知道的' };
		if (!contact) return { st: 400, error: '请填写相关账号' };
		// 每个账号同一时间只能有一份待审核的申请：审核完（通过或拒绝）才能再提交
		const mine = [...(await this.ctx.storage.list({ prefix: 'ap:' })).values()].find((x) => x.uid === uid && x.status === 'pending');
		if (mine) return { st: 400, error: '你已经提交过申请（' + ymd(mine.at) + '），等审核完成才能再次提交' };
		if (!(await this.hit('ap:' + uid, 5, DAY))) return { st: 429, error: '今天提交太多次了，明天再试' };
		const ap = { id: rnd(10), sub, uid, email, name: d.name || sub, source, contact, note, at: Date.now(), status: 'pending', exp: d.exp, expired: !!(d.off && d.offWhy === 'exp') };
		await this.ctx.storage.put('ap:' + sub, ap);
		await this.notifyAdmin('新的续期申请：' + ap.name, `账号：${email}\n从哪里知道的：${source}\n相关账号：${contact}${note ? '\n备注：' + note : ''}\n到期时间：${ymd(d.exp)}${ap.expired ? '（已到期暂停）' : ''}\n\n到管理页审核：https://${this.env.BASE_DOMAIN}/admin`);
		return { st: 200, ok: true, at: ap.at, ...(await this.mailNote()) };
	}
	async applications() {
		const pend = [...(await this.ctx.storage.list({ prefix: 'ap:' })).values()];
		// 待审核的带上路由器「现在」的到期时间（申请记录里的是提交时的）
		for (const a of pend) { const d = await this.ctx.storage.get('d:' + a.sub); if (d) { a.curExp = d.exp || 0; a.curOff = !!d.off; } }
		return pend.concat((await this.ctx.storage.get('aplog')) || []);
	}
	decide(sub, ok, a) { return this.lock(() => this._decide(sub, ok, a)); }
	async _decide(sub, ok, { days, reason }) {
		const ap = await this.ctx.storage.get('ap:' + sub), d = await this.ctx.storage.get('d:' + sub);
		if (!ap || ap.status !== 'pending') return { st: 404, error: '没有待审核的申请' };
		const n = ok ? parseDays(days) : 0;
		if (ok && !n) return { st: 400, error: '续的天数不对：填 1 到 3650 之间的数字' };
		if (ok && (!d || d.state !== 'ok')) return { st: 404, error: '这台路由器已经不在了' };
		ap.status = ok ? 'ok' : 'no'; ap.decided = Date.now(); ap.reason = String(reason || '').trim().slice(0, 200);
		if (ok) {
			ap.days = n;
			ap.oldExp = d.exp || 0;  // 通过那一刻的到期时间（申请记录里的 exp 是提交申请时的）
			ap.newExp = await this._grant(d, ap.days, '续期申请通过了');
		} else if (d) {
			try { await this.watch(sub).push({ title: '续期申请没有通过', body: ap.reason || '可以联系提供服务的人问问原因。', tag: 'svc', lvl: 'warn' }); } catch (e) {}
		}
		// 发邮件告诉申请人结果（不管他开没开手机推送都能收到）
		ap.mailed = await this.mailResult(ap);
		await this.ctx.storage.put('ap:' + sub, ap);
		// 审核过的另外留一份记录（最近 200 条），以后再申请时 ap:sub 会被新申请覆盖
		const log = (await this.ctx.storage.get('aplog')) || [];
		log.unshift({ ...ap, logged: true });
		await this.ctx.storage.put('aplog', log.slice(0, 200));
		return { st: 200, ok: true, exp: ap.newExp || null, mailed: !!ap.mailed };
	}
	async applyBrief(sub, uid) {
		const ap = await this.ctx.storage.get('ap:' + sub);
		return ap && ap.uid === uid ? { status: ap.status, at: ap.at, decided: ap.decided || 0, reason: ap.reason || '', days: ap.days || 0 } : null;
	}
	async mailResult(ap) {
		if (!this.env.RESEND_API_KEY || !ap.email) return false;
		const e = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
		const url = 'https://' + this.env.BASE_DOMAIN + '/app';
		const html = ap.status === 'ok'
			? `<p>你好，</p><p>你给路由器「${e(ap.name)}」提交的续期申请<b>已通过</b>，续了 <b>${ap.days} 天</b>，到期时间 <b>${ymd(ap.newExp)}</b>。</p><p>路由器已经恢复，不用重新安装，也不用输入任何码，手机打开面板就能直接用。</p><p>到期时间可以在官网账号页查看：<a href="${url}">${url}</a></p>`
			: `<p>你好，</p><p>你给路由器「${e(ap.name)}」提交的续期申请<b>没有通过</b>。${ap.reason ? '</p><p>原因：' + e(ap.reason) : ''}</p><p>可以在官网账号页重新申请：<a href="${url}">${url}</a></p><p>（家里上网和路由器上的设置一直不受影响。）</p>`;
		return this.mail(ap.email, ap.status === 'ok' ? '续期申请已通过：' + ap.name + ' 到期时间 ' + ymd(ap.newExp) : '续期申请没有通过：' + ap.name, html);
	}
	// 管理页「发测试邮件」：确认 ADMIN_EMAIL 和邮件服务都能用，发不出去时把邮件服务的原话带回来
	async testMail() {
		const to = this.env.ADMIN_EMAIL;
		if (!to) return { ok: false, error: '还没设置 ADMIN_EMAIL（GitHub 仓库 → Settings → Variables → ADMIN_EMAIL），设置好后重新部署官网' };
		if (!this.env.RESEND_API_KEY) return { ok: false, to, error: '还没设置邮件服务 RESEND_API_KEY' };
		const at = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
		try {
			const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + this.env.RESEND_API_KEY, 'content-type': 'application/json' },
				body: JSON.stringify({ from: this.env.MAIL_FROM || 'noreply@' + this.env.BASE_DOMAIN, to: [to], subject: '测试邮件：续期申请通知已经打开', html: `<p>这是一封测试邮件（${at}）。</p><p>以后有人在官网提交续期申请，会发邮件到这个邮箱提醒你，去管理页审核：<a href="https://${this.env.BASE_DOMAIN}/admin">https://${this.env.BASE_DOMAIN}/admin</a></p>` }) });
			if (r.ok) { await this.mailLog(to, '测试邮件', true, ''); return { ok: true, to }; }
			let msg = ''; try { const j = await r.json(); msg = j.message || j.error || ''; } catch (e) {}
			const err = '邮件服务没接受（' + r.status + '）' + (msg ? '：' + String(msg).slice(0, 200) : '');
			await this.mailLog(to, '测试邮件', false, err);
			return { ok: false, to, error: err };
		} catch (e) { const err = '连不上邮件服务：' + String(e?.message || e).slice(0, 120); await this.mailLog(to, '测试邮件', false, err); return { ok: false, to, error: err }; }
	}
	// 有新申请时发邮件给管理员（设置了 ADMIN_EMAIL 和邮件服务才发）
	async notifyAdmin(subject, text) {
		if (!this.env.ADMIN_EMAIL || !this.env.RESEND_API_KEY) return;
		const html = String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]).replace(/\n/g, '<br>');
		try { await this.mail(this.env.ADMIN_EMAIL, subject, html); } catch (e) {}
	}
	async accountRenew(uid, email, sub, code) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u || !(u.devs || []).some((x) => x.sub === sub)) return { st: 404, error: '你的账号里没有这台路由器' };
		return this.renew(sub, code, maskEmail(email));
	}
	// 路由器那边（凭 RKEY）看自己的到期时间
	/* ---------- 问题反馈：路由器面板里发来（凭 RKEY），管理页看，发邮件提醒管理员 ---------- */
	async feedback({ sub, rkey, uid, text, contact, diag, images, files }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		if (await this.devOff(sub)) return { st: 403, error: '这台路由器的托管服务已停用' };
		text = String(text || '').trim().slice(0, 2000); contact = String(contact || '').trim().slice(0, 80); diag = String(diag || '').trim().slice(0, 1500);
		if (text.length < 4) return { st: 400, error: '写几句遇到的问题或者建议吧' };
		if (!(await this.hit('fb:' + sub, 5, DAY))) return { st: 429, error: '今天发了很多条了，明天再发' };
		const d = await this.ctx.storage.get('d:' + sub), users = (d && d.users) || [];
		// 6.0 第 67 项：要是这台路由器上登录着官网账号的人发的（用应急登录码进来的不行）；回复邮件只发到发反馈的人自己的账号邮箱
		// （以前发到这台路由器所有账号的邮箱：家人的反馈会被主账号、别的家人在邮件里看到）
		// 用应急登录码进来的手机，路由器那边就不让发；没带账号的（老面板）归主账号
		const own = d ? this.famOf(d).owner : '', who = /^[a-z2-9]{12}$/.test(String(uid || '')) && users.includes(String(uid)) ? String(uid) : own;
		const wu = who ? await this.ctx.storage.get('u:' + who) : null, emails = wu && wu.email ? [wu.email] : [];
		// 安全加固（第二轮）：家人各自的反馈只有自己看得到；主账号的归主账号
		const fu = who && who !== own ? who : '';
		const fb = { id: rnd(10), code: rnd(8), at: Date.now(), sub, ...(fu ? { by: fu } : {}), name: (d && d.name) || sub, emails, text, contact, diag, done: 0, imgs: [] };
		// 5.2：附带的文件（视频、日志等，先传好的）
		if (Array.isArray(files) && files.length) { const c = await this.fileClaim(files, 'd' + sub + (fu ? '.' + fu : ''), 'fb'); if (c.error) return { st: 400, error: c.error }; fb.files = c.files; }
		// 截图：最多 3 张，每张 1.5MB 以内的 JPEG / PNG / WebP（手机上已经压缩过）
		for (const im of (Array.isArray(images) ? images : []).slice(0, 3)) {
			const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(im || ''));
			if (!m) continue;
			let u8; try { u8 = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)); } catch (e) { continue; }
			if (!u8.length || u8.length > 1536 * 1024) continue;
			const i = fb.imgs.length, n = Math.ceil(u8.length / FB_CHUNK), put = {};
			for (let k = 0; k < n; k++) put['fbi:' + fb.id + ':' + i + ':' + k] = u8.slice(k * FB_CHUNK, (k + 1) * FB_CHUNK);
			await this.ctx.storage.put(put);
			fb.imgs.push({ type: m[1], size: u8.length, n });
		}
		const drop = await this.lock(async () => { const l = (await this.ctx.storage.get('fbl')) || []; l.unshift(fb); await this.ctx.storage.put('fbl', l.slice(0, 300)); return l.slice(300); });
		for (const x of drop) await this.fbImgRm(x);
		await this.track('fb');
		await this.notifyAdmin('问题反馈：' + fb.name, `受理编号：${fb.code.toUpperCase()}\n\n${text}\n\n${contact ? '联系方式：' + contact + '\n' : ''}账号：${emails.join('、') || '没有绑定'}\n路由器：${fb.name}（${sub}）${diag ? '\n\n' + diag : ''}${fb.imgs.length ? '\n\n附了 ' + fb.imgs.length + ' 张截图，在管理页看' : ''}\n\n管理页：https://${this.env.BASE_DOMAIN}/admin`);
		return { st: 200, ok: true, code: fb.code, ...(await this.mailNote()) };
	}
	/* ---------- 官网公开的报告表单：安全问题、隐私和数据、滥用举报（不用登录；不记 IP，只按 IP 限次，限次记录一两天后自动清掉） ---------- */
	// 安装失败上报：认出是谁的账号。全新安装凭这次用的安装码（官网领的，记着是哪个账号领的）；托管版升级凭路由器自己的钥匙（找主账号）
	async reportAcct({ inv, sub, rkey }) {
		let uid = '';
		const code = String(inv || '').trim().toUpperCase();
		if (code && /^[A-Z0-9]{4,32}$/.test(code)) { const i = await this.ctx.storage.get('i:' + code); if (i && i.uid && Date.now() - (i.at || i.created || 0) < 90 * DAY) uid = i.uid; }
		if (!uid && sub && (await this.devOk(String(sub), String(rkey || '')))) { const d = await this.ctx.storage.get('d:' + sub); if (d) uid = this.famOf(d).owner || ''; }
		const u = uid && (await this.ctx.storage.get('u:' + uid));
		return u && u.email ? { uid, email: u.email } : null;
	}
	async reportWho(a, ip) {
		if (!(await this.hit('rw:' + (ip || '?'), 20, 3600e3))) return { st: 429, error: '试太多次了' };
		const r = await this.reportAcct(a);
		return { st: 200, ok: true, acct: r ? maskEmail(r.email) : '' };
	}
	async report({ kind, text, contact, ip, log, email, uid, inv, sub, rkey }) {
		// install：安装脚本失败时，用户在终端里输入 y 同意后发来的（版本、失败步骤、错误、系统情况）
		const KIND = { security: '安全问题', privacy: '隐私和数据', abuse: '滥用举报', install: '安装失败', other: '其他' };
		if (!KIND[kind]) kind = 'other';
		text = String(text || '').trim().slice(0, 4000); contact = String(contact || '').trim().slice(0, 120);
		if (text.length < 10) return { st: 400, error: '多写几句，说清楚是什么问题（至少 10 个字）' };
		if (!(await this.hit('rp:' + (ip || '?'), 5, DAY))) return { st: 429, error: '今天提交太多次了，明天再试' };
		if (!(await this.hit('rp:all', 100, DAY))) return { st: 429, error: '今天提交的人太多了，明天再试' };
		// 邮箱：表单里填的；登录了官网账号又没填的，用账号邮箱（处理好了能发邮件告诉他，账号页也能看到这条）
		email = String(email || '').trim().slice(0, 120);
		if (email && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) return { st: 400, error: '邮箱格式不对' };
		// 安全加固（第二轮）：安装失败上报认得出账号的（安装码 / 路由器钥匙），就发到账号自己的邮箱，不用再填；认不出的，填的邮箱只记下，不马上发信
		const acct = kind === 'install' ? await this.reportAcct({ inv, sub, rkey }) : null;
		if (acct) email = acct.email;
		const fb = { id: rnd(10), code: rnd(8), at: Date.now(), sub: '', name: kind === 'install' ? '安装失败（终端上报）' : '官网 · ' + KIND[kind], kind, web: 1, emails: email ? [email] : [], text, contact, diag: '', done: 0, imgs: [] };
		if (uid && kind !== 'install') fb.uid = uid;
		if (acct) fb.uid = acct.uid;
		// 安装失败带的安装日志（用户同意后发来，已经在路由器上遮住了邀请码、令牌、域名）：单独存，列表里只记有多长
		log = kind === 'install' ? String(log || '').slice(-64000) : '';
		if (log) { await this.ctx.storage.put('fblog:' + fb.id, log); fb.log = log.length; }
		const drop = await this.lock(async () => { const l = (await this.ctx.storage.get('fbl')) || []; l.unshift(fb); await this.ctx.storage.put('fbl', l.slice(0, 300)); return l.slice(300); });
		for (const x of drop) await this.fbImgRm(x);
		await this.notifyAdmin(kind === 'install' ? '有人安装失败了' : '官网报告（' + KIND[kind] + '）', `受理编号：${fb.code.toUpperCase()}\n\n${text}\n\n${email ? '邮箱：' + email + '\n' : ''}${contact ? '联系方式：' + contact : email ? '' : '没留联系方式'}\n\n管理页：https://${this.env.BASE_DOMAIN}/admin`);
		// 留了邮箱的：发一封「收到了」，带受理编号和查进度的网址
		// 安全加固：不登录也能提交，填的邮箱可能是别人的；「收到了」只发给登录账号自己的邮箱（填的邮箱照样记下，处理好了管理员回复时再发）
		const own = uid && kind !== 'install' && email && String((await this.ctx.storage.get('u:' + uid))?.email || '').toLowerCase() === email.toLowerCase();
		// 终端里安装失败上报：只发给认出来的账号自己的邮箱（同一个账号一天最多 3 封）
		const inst = !own && kind === 'install' && !!acct && (await this.hit('rpm:' + acct.uid, 3, DAY));
		if (own || inst) await this.fbMail(fb, email, kind === 'install' ? '我们收到了你上报的安装问题' : '我们收到了你的报告', kind === 'install'
			? '<p>你好，</p><p>我们收到了你在路由器上安装失败时上报的问题，会尽快查原因。处理好以后，重新运行一次安装命令就行，终端最上面也会显示处理结果。</p>'
			: '<p>你好，</p><p>我们收到了你在官网提交的报告，会尽快处理。</p>');
		await this.track(kind === 'install' ? 'install_fail' : 'report');
		return { st: 200, ok: true, code: fb.code, mailed: own || inst ? 1 : 0, ...(acct ? { acct: maskEmail(acct.email) } : {}), ...(await this.mailNote()) };
	}
	// 限次记录（r:…，里面的键带着 IP 或邮箱）：最长的限次窗口是 1 天，超过 2 天没动过的整条删掉；开通限流（rl）里过期的 IP 也清掉
	async gcRate(now) {
		let n = 0;
		const all = await this.ctx.storage.list({ prefix: 'r:', limit: 5000 }), del = [];
		for (const [k, a] of all) if (!Array.isArray(a) || !a.some((t) => t > now - 2 * DAY)) del.push(k);
		for (let i = 0; i < del.length; i += 128) { await this.ctx.storage.delete(del.slice(i, i + 128)); }
		n += del.length;
		const rl = await this.ctx.storage.get('rl');
		if (rl) { const hr = now - 3600e3; for (const k in rl.ip) { rl.ip[k] = rl.ip[k].filter((t) => t > hr); if (!rl.ip[k].length) { delete rl.ip[k]; n++; } } rl.all = rl.all.filter((t) => t > hr); await this.ctx.storage.put('rl', rl); }
		return n;
	}
	async feedbacks() { return (await this.ctx.storage.get('fbl')) || []; }
	async fbStatus(code, ip) {
		code = String(code || '').toLowerCase();
		if (!/^[a-z2-9]{8}$/.test(code)) return { st: 404, error: '没有这个编号' };
		if (!(await this.hit('fq:' + (ip || '?'), 120, DAY))) return { st: 429, error: '查得太频繁了，过一会儿再查' };
		const x = ((await this.ctx.storage.get('fbl')) || []).find((y) => y.code === code);
		if (!x) return { st: 404, error: '没有这个编号（编号不对，或者这条已经被删除了）' };
		return { st: 200, ok: true, ...fbView(x) };
	}
	// 路由器面板「我的反馈」：这台路由器发过的反馈（凭 RKEY；最近 90 天、最多 10 条，带自己写的内容）
	async devFb({ sub, rkey, uid }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		const d = await this.ctx.storage.get('d:' + sub), fu = /^[a-z2-9]{12}$/.test(String(uid || '')) && d && uid !== this.famOf(d).owner ? String(uid) : '';
		const l = ((await this.ctx.storage.get('fbl')) || []).filter((x) => x.sub === sub && (x.by || '') === fu && Date.now() - x.at < 90 * DAY).slice(0, 10);
		return { st: 200, ok: true, list: l.map((x) => fbView(x, true)) };
	}
	// 官网账号页「我的反馈」：自己账号里路由器发的、用这个账号或邮箱在官网报告的
	async accountFb(uid, email) {
		const u = await this.ctx.storage.get('u:' + uid); if (!u) return { st: 404, error: '没有这个账号' };
		const subs = new Set((u.devs || []).map((x) => x.sub)), em = String(email || '').toLowerCase();
		// 路由器发来的反馈：家人发的只给他自己看；主账号发的（和以前的）只给主账号看
		const own = {}; for (const sb of subs) { const d = await this.ctx.storage.get('d:' + sb); own[sb] = d ? this.famOf(d).owner : ''; }
		const fromMyRouter = (x) => x.sub && subs.has(x.sub) && (x.by ? x.by === uid : own[x.sub] === uid);
		const l = ((await this.ctx.storage.get('fbl')) || []).filter((x) => Date.now() - x.at < 180 * DAY && (fromMyRouter(x) || x.uid === uid || (!x.sub && (x.emails || []).some((y) => String(y).toLowerCase() === em)))).slice(0, 20);
		return { st: 200, ok: true, list: l.map((x) => ({ ...fbView(x, true), name: x.sub ? ((u.devs || []).find((d) => d.sub === x.sub) || {}).alias || x.name : '' })) };
	}
	async fbImg(id, i) {
		const x = ((await this.ctx.storage.get('fbl')) || []).find((y) => y.id === id), m = x && (x.imgs || [])[i];
		if (!m) return null;
		const got = await this.ctx.storage.get([...Array(m.n)].map((_, k) => 'fbi:' + id + ':' + i + ':' + k)), out = new Uint8Array(m.size);
		let off = 0;
		for (let k = 0; k < m.n; k++) { const c = got.get('fbi:' + id + ':' + i + ':' + k); if (!c) return null; out.set(c, off); off += c.length; }
		return { type: m.type, buf: out };
	}
	async fbLog(id) { return (await this.ctx.storage.get('fblog:' + id)) || null; }
	async fbImgRm(x) { if (x.log) await this.ctx.storage.delete('fblog:' + x.id); const keys = []; (x.imgs || []).forEach((m, i) => { for (let k = 0; k < m.n; k++) keys.push('fbi:' + x.id + ':' + i + ':' + k); }); for (let i = 0; i < keys.length; i += 128) await this.ctx.storage.delete(keys.slice(i, i + 128)); }
	// 反馈能发邮件给谁：路由器绑定的账号邮箱 + 联系方式里写的邮箱（官网报告只有后者），最多 3 个
	// 发给反馈的人的邮件：都带受理编号和查进度的网址
	async fbMail(x, to, subject, body) {
		if (!this.env.RESEND_API_KEY || !to) return false;
		const c = String(x.code || '').toUpperCase(), url = 'https://' + this.env.BASE_DOMAIN + '/r/' + c;
		const html = body + `<p style="margin-top:16px;padding:10px 12px;background:#f4f5f7;border-radius:8px">受理编号：<b style="letter-spacing:.06em">${c}</b><br>查处理进度：<a href="${url}">${url}</a></p>`
			+ `<p style="color:#999;font-size:13px">路由器面板 · <a href="https://${this.env.BASE_DOMAIN}">${this.env.BASE_DOMAIN}</a></p>`;
		try { return await this.mail(to, subject + '（受理编号 ' + c + '）', html); } catch (e) { return false; }
	}
	// 面板里发的反馈有新进展：推送到绑了这台路由器推送的手机（点开直接到面板「我的反馈」）
	async fbPush(x, title, body) {
		if (!x.sub) return;
		// 反馈的进度在面板「通知」里另有一类（反馈进度），这里不重复记
		try { await this.watch(x.sub).push({ title, body: body + '（编号 ' + String(x.code || '').toUpperCase() + '）', tag: 'fb', lvl: 'ok', url: './?p=myfb', force: true, nolog: true }); } catch (e) {}
	}
	fbMailTo(x) {
		const to = [...(x.emails || [])], m = String(x.contact || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
		if (m && !to.some((y) => y.toLowerCase() === m[0].toLowerCase())) to.push(m[0]);
		return to.slice(0, 3);
	}
	async feedbacksAdmin() { return (await this.feedbacks()).map((x) => ({ ...x, mailTo: this.fbMailTo(x) })); }
	/* ---------- 公告：管理页发；托管版、自建版的面板都来拿（只读）；重要的由各自的路由器推送到手机 ---------- */
	async anns(all) { const l = (await this.ctx.storage.get('ann')) || [], now = Date.now(); return all ? l : l.filter((a) => (!a.exp || a.exp > now) && (!a.start || a.start <= now)); }
	// 新建（id 空）或修改；days：多少天后不再显示（0 = 一直显示）
	// 公告即时送达（用户 11/27：后台发出、修改都要所有路由器马上收到）：每次写公告列表，版本号加 1；
	// 路由器每分钟的心跳回复里带着「版本号.已经到点的定时数」，变了就马上去取（定时发布、到期也会让它变）
	async annPut(l) {
		await this.ctx.storage.put('ann', l);
		await this.ctx.storage.put('annrev', ((await this.ctx.storage.get('annrev')) || 0) + 1);
	}
	async annMeta() {
		const l = (await this.ctx.storage.get('ann')) || [], t = [];
		for (const a of l) { if (a.start) t.push(+a.start); if (a.exp) t.push(+a.exp); }
		return { rev: (await this.ctx.storage.get('annrev')) || 0, t: t.sort((x, y) => x - y) };
	}
	async annSave(id, b) {
		// 6.0：banner = 面板顶上一条横幅（轻提醒，比如今晚维护），不弹窗、不推送
		const level = b.level === 'important' ? 'important' : b.level === 'banner' ? 'banner' : 'normal';
		const body = String(b.body || '').trim().slice(0, 2000);
		// 横幅只有内容、没有标题（用户 11/27）：面板顶上滚动的就是内容；通知页、后台列表用内容的第一行当标题
		const title = level === 'banner' ? body.split('\n').map((x) => x.trim()).find(Boolean)?.slice(0, 40) || '' : String(b.title || '').trim().slice(0, 80);
		if (!title) return { st: 400, error: level === 'banner' ? '横幅内容不能是空的' : '标题不能是空的' };
		const days = Math.max(0, Math.min(365, Math.round(+b.days || 0)));
		// 6.0：只发给某些路由器：ed = h 托管版 / s 自建版 / 空 = 都发；vmin、vmax = 面板版本范围（含两头，可以只填一个）
		const ed = b.ed === 'h' || b.ed === 's' ? b.ed : '', vok = (v) => v === '' || /^\d{1,3}(\.\d{1,3}){0,2}(\.\d{1,4})?$/.test(v);
		const vmin = String(b.vmin || '').trim(), vmax = String(b.vmax || '').trim();
		if (!vok(vmin) || !vok(vmax)) return { st: 400, error: '版本写成 6.0 或 5.2.3 这样' };
		if (vmin && vmax && verCmp(vmin, vmax, vmax.split('.').length > 3 ? 4 : 3) > 0) return { st: 400, error: '版本范围前面的要比后面的小' };
		// 定时发布（5.0）：到时间才出现在面板里；路由器按发布时间判断要不要推送到手机
		let start = Math.round(+b.start || 0);
		if (start && start <= Date.now() + 60e3) start = 0;
		if (start && start > Date.now() + 90 * DAY) return { st: 400, error: '定时发布最多提前 90 天' };
		// 5.2：附件（图片、视频、文件），公告的文件一直留着，删公告时一起删
		let files;
		if (Array.isArray(b.files)) { const c = await this.fileClaim(b.files, 'admin', 'ann'); if (c.error) return { st: 400, error: c.error }; files = c.files; }
		return this.lock(async () => {
			const l = (await this.ctx.storage.get('ann')) || [], now = Date.now();
			let a = id ? l.find((x) => x.id === id) : null;
			if (id && !a) return { st: 404, error: '没有这条公告（可能已经删了）' };
			if (!a) { a = { id: rnd(10), at: now }; l.unshift(a); }
			const from = start || (a.start && a.start > now ? now : 0) || now;
			Object.assign(a, { title, body, level, exp: days ? Math.max(now, start || 0) + days * DAY : 0, upd: start || now });
			for (const [k, v] of [['ed', ed], ['vmin', vmin], ['vmax', vmax]]) { if (v) a[k] = v; else delete a[k]; }
			if (files) { const drop = (a.files || []).filter((x) => !files.some((y) => y.id === x.id)).map((x) => x.id); if (drop.length) await this.fileGone(drop); if (files.length) a.files = files; else delete a.files; }
			if (start) { a.start = start; a.at = start; } else if (a.start && a.start > now) { delete a.start; a.at = now; }
			void from;
			// 用户 11/27：同时只能有一条横幅。发新的横幅，别的横幅改成普通公告（还在通知里）；新的是定时发的，旧的显示到新的开始那一刻
			const replaced = [];
			if (level === 'banner') for (const x of l) {
				if (x === a || x.level !== 'banner' || (x.exp && x.exp <= now)) continue;
				if (a.start && a.start > now && !(x.start && x.start >= a.start)) { x.exp = x.exp ? Math.min(x.exp, a.start) : a.start; }
				else x.level = 'normal';
				replaced.push(x.title);
			}
			await this.annPut(l.slice(0, 50));
			return { st: 200, ok: true, ann: a, ...(replaced.length ? { replaced } : {}) };
		});
	}
	annDel(id) { return this.lock(async () => { const l = (await this.ctx.storage.get('ann')) || [], a = l.find((x) => x.id === id); if (!a) return false; await this.annPut(l.filter((x) => x.id !== id)); if (a.files && a.files.length) await this.fileGone(a.files.map((x) => x.id)); return true; }); }
	// 标为已收到 / 撤回（对方查进度时，第二段「开发人员已收到」亮起来）
	async fbAck(id, on) {
		const x = await this.lock(async () => { const l = (await this.ctx.storage.get('fbl')) || [], x = l.find((y) => y.id === id); if (!x) return null; const was = x.ack; x.ack = on ? x.ack || Date.now() : 0; await this.ctx.storage.put('fbl', l); return { ...x, was }; });
		if (!x) return false;
		if (on && !x.was) await this.fbPush(x, '开发人员已收到你的反馈', '正在处理，有进展会再告诉你');
		return true;
	}
	// 标已修复 / 无法修复 / 撤回成没处理；可以写补充说明、发邮件告诉对方（每次都记一条处理记录）
	// 无法修复必须写原因：如实告诉对方为什么修不了
	async fbSet(id, state, note = '', mail = false) {
		note = String(note || '').trim().slice(0, 2000);
		if (!['fixed', 'nofix', 'open', 'note'].includes(state)) return { ok: false, error: '状态不对' };
		if (state === 'nofix' && !note) return { ok: false, error: '写一下为什么没法修复，对方会看到' };
		if (state === 'note' && !note) return { ok: false, error: '补充说明不能是空的' };
		const x = await this.lock(async () => { const l = (await this.ctx.storage.get('fbl')) || [], x = l.find((y) => y.id === id); if (!x) return null;
			if (state === 'note') { if (!x.ack) { x.ack = Date.now(); await this.ctx.storage.put('fbl', l); } return x; }   // 只发补充说明：状态不变（写了说明当然也算收到了）
			const now = Date.now(); x.done = state === 'fixed' ? now : 0; x.nofix = state === 'nofix' ? now : 0; if (state !== 'open' && !x.ack) x.ack = now;   // 处理完了当然也算收到了
			await this.ctx.storage.put('fbl', l); return x; });
		if (!x) return { ok: false };
		if (state === 'note') state = 'note:' + fbState(x);
		const st0 = state.replace('note:', ''), isNote = state !== st0, done = st0 === 'fixed';
		let mailed = [], mailErr = '';
		if (mail) {
			const to = this.fbMailTo(x);
			if (!to.length) mailErr = '对方没留邮箱';
			else if (!this.env.RESEND_API_KEY) mailErr = '还没设置邮件服务 RESEND_API_KEY';
			else {
				const e = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
				const when = new Date(x.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
				const quote = x.text.length > 500 ? x.text.slice(0, 500) + '……' : x.text;
				const head = isNote ? '有新的说明：' : { fixed: '<b>已经修复了</b>。', nofix: '<b>暂时没法修复</b>，原因写在下面，抱歉。', open: '<b>我们重新打开了，还在继续处理</b>，有进展会再告诉你。' }[st0];
				const html = `<p>你好，</p><p>你在 ${e(when)} 反馈的问题${head}</p>`
					+ (note ? `<p><b>${st0 === 'nofix' && !isNote ? '原因' : '补充说明'}：</b><br>${e(note).replace(/\n/g, '<br>')}</p>` : '')
					+ `<p style="color:#666;margin-top:18px">你当时写的：</p><blockquote style="margin:0;padding:8px 12px;border-left:3px solid #ddd;color:#555">${e(quote).replace(/\n/g, '<br>')}</blockquote>`
					+ (st0 !== 'open' && !isNote ? '<p>如果还有问题，在面板里再反馈一次就行。</p>' : '');
				for (const t of to) if (await this.fbMail(x, t, isNote ? '你反馈的问题有新的说明' : { fixed: '你反馈的问题已修复', nofix: '你反馈的问题暂时没法修复', open: '你反馈的问题还在处理中' }[st0], html)) mailed.push(t);
				if (!mailed.length) mailErr = '邮件服务没发出去，稍后再试';
			}
		}
		await this.lock(async () => { const l = (await this.ctx.storage.get('fbl')) || [], y = l.find((z) => z.id === id); if (!y) return; (y.acts = y.acts || []).push({ at: Date.now(), done: done ? 1 : 0, st: isNote ? 'note' : st0, note, mailed }); y.acts = y.acts.slice(-20); await this.ctx.storage.put('fbl', l); });
		await this.fbPush(x, isNote ? '你的反馈有新的说明' : { fixed: '✅ 你反馈的问题修好了', nofix: '你反馈的问题暂时没法修复', open: '你的反馈重新打开了，还在继续处理' }[st0], '打开面板「我的反馈」看开发者怎么说');
		return { ok: true, mailed, mailErr };
	}
	fbDel(id) { return this.lock(async () => { const l = (await this.ctx.storage.get('fbl')) || [], x = l.find((y) => y.id === id); if (!x) return false; await this.ctx.storage.put('fbl', l.filter((y) => y.id !== id)); await this.fbImgRm(x); return true; }); }
	/* ---------- 新账号免费试用：每个账号能领一次（TRIAL_DAYS 天，默认 7；设成 0 就不发） ---------- */
	trialDays() { const n = this.env.TRIAL_DAYS == null || this.env.TRIAL_DAYS === '' ? 7 : Math.round(+this.env.TRIAL_DAYS); return n > 0 && n <= 365 ? n : 0; }
	trial(uid, ip) { return this.lock(() => this._trial(uid, ip)); }
	async _trial(uid, ip) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return { st: 401, error: '请先登录' };
		const days = this.trialDays();
		if (!days) return { st: 403, error: '现在没有开放免费试用，找提供服务的人要邀请码' };
		if (this.env.RESEND_API_KEY && !u.verified) return { st: 403, error: '先验证邮箱才能领试用' };
		const open = (await this.instList(u)).find((x) => x.kind === 'trial');
		if (open) return { st: 200, ok: true, days, code: open.code, exp: open.exp };
		if (await this.isFull()) return { st: 403, error: '托管名额已满，排队后有空位发邮件给你', full: true };
		const ts = await this.trialState(u);
		if (!ts.max) return { st: 403, error: '现在没有开放免费试用，找提供服务的人要邀请码' };
		if (ts.left <= 0) return { st: 403, error: ts.max > 1 ? `每个账号最多领 ${ts.max} 次试用，你已经领完了。想继续用，找提供服务的人要邀请码` : '这个账号已经领过试用了。想继续用，找提供服务的人要邀请码' };
		if (!(await this.hit('tr:' + (ip || '?'), 5, DAY))) return { st: 429, error: '领得太频繁了，明天再试' };
		let code;
		do { code = rnd(10).toUpperCase(); } while ((await this.ctx.storage.get('i:' + code)) || (await this.ctx.storage.get('k:' + code)));
		const now = Date.now(), inv = { max: 1, used: 0, created: now, exp: now + 7 * DAY, note: ('试用：' + u.email).slice(0, 60), svc: days, uid, trial: 1, kind: 'trial' };
		u.trial = { ...(u.trial || {}), code, at: now, got: 1 }; delete u.trial.used;
		if (u.trialUsed == null && ts.used) u.trialUsed = ts.used;
		u.inst = [...(u.inst || []), code].slice(-20);
		await this.ctx.storage.put({ ['i:' + code]: inv, ['u:' + uid]: u });
		{ const wl = await this.waitList(); if (wl.some((x) => x.email === u.email)) await this.ctx.storage.put('wl', wl.filter((x) => x.email !== u.email)); } // 排过队的领到了：从队里去掉
		await this.alog('trial', u.email, `领了 ${days} 天免费试用（第 ${ts.used + 1} 次，安装码 7 天内有效）`, 'user');
		return { st: 200, ok: true, days, code, exp: inv.exp };
	}
	async devInfo({ sub, rkey }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		const d = await this.ctx.storage.get('d:' + sub);
		return { st: 200, exp: (d && d.exp) || 0, off: !!(d && d.off), offWhy: (d && d.offWhy) || null, files: !!this.env.F };
	}
	async devRenew({ sub, rkey, code }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		return this.renew(sub, code, '路由器');
	}
	async stats() { const f = await this.ctx.storage.get('dnsfull'), wl = await this.waitList(); return { count: await this.count(), max: await this.maxN(), maxEnv: this.max(), full: await this.isFull(), wait: wl.filter((x) => !x.sent).length, waitSent: wl.filter((x) => x.sent).length, ...(f ? { dnsFull: f } : {}) }; }
	// 每天清理：90 天没上线的回收；开通到一半卡住超过 1 小时的也清掉
	cleanup(now) { return this.lock(() => this._cleanup(now || Date.now())); }
	async _cleanup(now) {
		const out = [];
		for (const d of await this.devices()) {
			const stale = d.state === 'ok' ? now - (d.seen || d.created) > LIMITS.idleDays * DAY : now - d.created > LIMITS.pendingMs;
			if (!stale) continue;
			try {
				if (d.state === 'ok') {
					// 90 天没上线：先放进回收站（受保护的不动），30 天内上线了或者管理员恢复都还来得及
					if (d.offWhy === 'deleted' || (await this.isProtected(d))) continue;
					await this._setOff(d.sub, true, 'deleted');
					const d2 = await this.ctx.storage.get('d:' + d.sub); d2.delAt = now; d2.delWhy = 'idle'; await this.ctx.storage.put('d:' + d.sub, d2);
					await this.mailOwners(d2, 'trash');
					await this.alog('idle', d.sub, (d.name || '') + ' ' + LIMITS.idleDays + ' 天没上线，放进回收站', 'system');
				} else {
					// 开通到一半卡住的：删掉建了一半的隧道和子域名，退回安装码（6.0 第 90 项；以前只删记录，安装码白白用掉）
					if (d.tunnel || d.dns) await deprovision(this.env, d).catch(() => {});
					await this.ctx.storage.delete('d:' + d.sub); await this.addCount(-1);
					if (d.invite) await this._refund(d.invite, d.sub, d.keep);
					await this.alog('reg-stuck', d.sub, '开通到一半卡住超过 1 小时，已清掉、退回安装码', 'system');
				}
				out.push(d.sub);
			} catch (e) {}
		}
		// 开通好了、路由器 1 天都没连上过官网（没收到开通回复、装到一半放弃）：收回网址、退回安装码（6.0 第 90 项）
		for (const d of await this.devices()) {
			if (d.state !== 'ok' || !d.fresh || now - d.created < DAY || d.off || (await this.isProtected(d))) continue;
			try {
				await this._remove(d.sub);
				if (d.rr) await this.ctx.storage.delete('rr:' + d.rr);
				if (d.invite) await this._refund(d.invite, d.sub, d.keep);
				await this.alog('reg-unused', d.sub, '开通后 1 天都没连上官网（多半没装完），已收回网址、退回安装码' + (d.name ? '（' + d.name + '）' : ''), 'system');
				out.push(d.sub);
			} catch (e) {}
		}
		// 开通结果只留 1 天
		for (const [k, v] of await this.ctx.storage.list({ prefix: 'rr:' })) if (!v || now - (v.at || 0) > DAY) await this.ctx.storage.delete(k);
		// 回收站里满 30 天的：彻底删除（先发邮件告诉绑定的账号怎么重新开通）
		for (const d of await this.devices()) {
			if (d.offWhy !== 'deleted' || !d.delAt || now - d.delAt < TRASH_DAYS * DAY) continue;
			try { await this.mailOwners(d, 'purge'); await this._remove(d.sub); out.push(d.sub); await this.alog('purge', d.sub, (d.name || '') + ' 在回收站满 ' + TRASH_DAYS + ' 天，自动彻底删除', 'system'); } catch (e) {}
		}
		// 试用 / 续期到期：提前 3 天提醒一次；到期暂停（网址打不开、云端功能停）；暂停超过 30 天删掉，腾出名额
		for (const d of await this.devices()) {
			if (d.state !== 'ok' || !d.exp) continue;
			const w = this.watch(d.sub);
			try {
				if (!d.off && now < d.exp && d.exp - now < 3 * DAY && !d.warn3) {
					d.warn3 = now; await this.ctx.storage.put('d:' + d.sub, d);
					await w.push({ title: '托管服务 ' + ymd(d.exp) + ' 到期', body: '还剩不到 3 天。到期后专属网址会暂停（家里上网不受影响）。找提供服务的人要续期码，在官网账号页这台路由器下面点「续期」输入。', tag: 'svc', lvl: 'warn', force: true });
				} else if (!d.off && now >= d.exp) {
					await this._setOff(d.sub, true, 'exp');
					await w.push({ title: '⚠️ 托管服务已到期，已暂停', body: '专属网址打不开了，推送和云端备份也停了；家里上网不受影响，路由器上的设置都还在。找提供服务的人要续期码，在官网账号页这台路由器下面点「续期」，输入后马上恢复。', tag: 'svc', lvl: 'err', force: true });
				} else if (d.off && d.offWhy === 'exp' && now - d.exp > 30 * DAY) {
					await this.mailOwners(d, 'purge');
					await this._remove(d.sub); out.push(d.sub);
					await this.alog('purge', d.sub, (d.name || '') + ' 到期暂停超过 30 天，自动彻底删除', 'system');
				}
			} catch (e) {}
		}
		// 回收站里满 30 天的账号：彻底删除
		for (const [k, u] of await this.ctx.storage.list({ prefix: 'xu:' })) {
			if (now - (u.delAt || 0) < TRASH_DAYS * DAY) continue;
			await this.ctx.storage.delete([k, 'xe:' + u.email, 'av:' + u.uid]);
			await this.alog('user-purge', u.email, '在回收站满 ' + TRASH_DAYS + ' 天，自动彻底删除', 'system');
		}
		// 过期没用的登录码、配对码
		for (const pre of ['l:', 'p:']) {
			const dead = [...(await this.ctx.storage.list({ prefix: pre })).entries()].filter(([, v]) => !v || v.exp < now).map(([k]) => k);
			for (let i = 0; i < dead.length; i += 128) await this.ctx.storage.delete(dead.slice(i, i + 128));
		}
		return out;
	}
}

/* ---------- 开通中心的网址：主域名下的 /api/… ---------- */
let FONT_BIN = null;
const IMG_BIN = new Map();
const hubObj = (env) => env.H.get(env.H.idFromName('hub'));
/* 6.0 第 66 项：人机验证（Cloudflare Turnstile）。平时不要；同一来源短时间试太多次、或者后台开了「受攻击模式」时，
   注册、登录、发验证码、找回密码、报告问题要先过验证（凭证在这里向 Cloudflare 核对，一次一用）。
   路由器用的接口（心跳、安装、更新、面板反馈）不走这里，不会被挡。没配置 Turnstile 时，受攻击模式只收紧限速 */
const capOn = (env) => !!(env.TURNSTILE_SITE && env.TURNSTILE_SECRET);
async function captchaGate(env, H, kind, ip, tok) {
	const need = await H.capNeed(kind, ip, capOn(env));
	if (need === 'slow') return J({ error: '现在访问的人太多，10 分钟后再试' }, 429);
	if (!need) return null;
	const ask = (error) => J({ error, captcha: true, site: env.TURNSTILE_SITE }, 403);
	if (!tok) return ask('先完成人机验证');
	let ok = false;
	try {
		const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(tok).slice(0, 2048), remoteip: ip }), signal: AbortSignal.timeout(8000) });
		ok = !!(await r.json()).success;
	} catch (e) {}
	return ok ? null : ask('人机验证没通过，再试一次');
}
const PGK = new Map([[HOME, 'HOME'], [APP, 'APP'], [ADMIN, 'ADMIN'], [PRIVACY, 'PRIVACY'], [SECURITY, 'SECURITY'], [REPLY, 'REPLY'], [NOTICE, 'NOTICE'], [TERMS, 'TERMS'], [CHANGELOG, 'CHANGELOG'], [STATUS, 'STATUS'], [HELP, 'HELP'], [COMPAT, 'COMPAT']]);
export async function hubFetch(req, env) {
	const u = new URL(req.url), p = u.pathname;
	// www 开头的地址：跳到不带 www 的主域名（登录状态、收藏的网址都统一在主域名上）
	if (u.hostname === 'www.' + env.BASE_DOMAIN) return new Response(null, { status: 301, headers: { location: 'https://' + env.BASE_DOMAIN + p + u.search, 'cache-control': 'max-age=3600' } });
	const body = async () => { try { return await req.json(); } catch (e) { return {}; } };
	const H = hubObj(env);
	// 5.2 发文件：上传（分块）、下载（带签名）
	{ const fx = await filesRoute(req, env, H, p); if (fx) return fx; }
	// 6.0 第 7 项：公开的状态接口只回答「在线」和「开没开邮件验证码」（注册页要用）；名额、文件存储这些只在管理员的 /api/admin/health 里
	// 第 46 项：再加一个「满没满」（注册页满了改成留邮箱排队），不给具体数量
	if (p === '/api/ping') return J({ ok: true, mail: !!env.RESEND_API_KEY, full: await H.isFull() });
	if (p === '/api/register' && req.method === 'POST') {
		const b = await body();
		const r = await H.register({ invite: b.invite, name: b.name, model: b.model, rid: b.rid, local: b.local === true, ip: req.headers.get('cf-connecting-ip') || '' });
		const { st, ...rest } = r;
		return J(rest, st);
	}
	// 官网「报告问题」表单（安全、隐私、滥用）：不用登录；website 是给机器人填的陷阱字段，填了就假装成功
	// 公告（公开、只读；面板经路由器每 30 分钟来拿一次，缓存 5 分钟）
	// 公告版本号（自建版每 5 分钟问一次；托管版跟着每分钟的心跳拿）：变了才去取整个公告列表
	// 6.0「网址 → App」公开表（用户 11/28 选「官网放公开表 路由器下载对照」）：路由器一天来拿一次，放在内存里对照识别软件、给软件页搜索；
	// 只是下载，路由器什么都不传上来（访问记录不出路由器）。网址来自社区列表 v2fly/domain-list-community（MIT），中文名是我们加的
	if (p === '/api/apps' && (req.method === 'GET' || req.method === 'HEAD')) {
		if (req.headers.get('if-none-match') === '"' + APPS_V + '"') return new Response(null, { status: 304, headers: { etag: '"' + APPS_V + '"' } });
		APPS_JSON ??= JSON.stringify({ ok: true, v: APPS_V, src: 'https://github.com/v2fly/domain-list-community (MIT)', cats: APPS_CATS, apps: APPS });
		return new Response(req.method === 'HEAD' ? null : APPS_JSON, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600', etag: '"' + APPS_V + '"', 'access-control-allow-origin': '*' } });
	}
	if (p === '/api/notices/v' && req.method === 'GET') {
		let v = null; try { v = await annVer(env); } catch (e) {}
		return v == null ? J({ ok: false }, 503) : new Response(JSON.stringify({ ok: true, v }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
	}
	if (p === '/api/notices' && req.method === 'GET') {
		// 路由器带着自己的版本（v）和托管 / 自建（k = h / s）来拿：只给发给它的；老版本不带，当成最老的版本、托管自建都算
		// h = 装到第几个修复补丁（6.0.1 起带；没带就算 0）
		// 不带版本的是 5.3.0 以前的老路由器（1.0 到 5.2.x 都有可能）：版本范围跟这一段有重叠就给（用户 11/28：选「1.0 到 5.3.1」时老路由器一台都没收到）
		const qv0 = u.searchParams.get('v') || '', qh = Math.floor(+u.searchParams.get('h') || 0), qk = u.searchParams.get('k') || '';
		const qv3 = qv0.split('.').slice(0, 3).join('.'), qv = qv3 + '.' + (qh > 0 && qh < 10000 ? qh : 0);
		const oldOk = (a) => !a.vmin || verCmp(a.vmin, '5.3.0', 3) < 0;
		const anns = (await H.anns(false)).filter((a) => (!a.ed || !qk || a.ed === qk) && (qv0 ? verIn(qv, a.vmin, a.vmax) : oldOk(a)));
		// 路由器带着匿名编号来拿：记下「这台收到了」（公告统计用；编号是路由器随机生成的，跟账号、IP 都没关系）
		const rid = u.searchParams.get('r') || '';
		if (rid && anns.length) { try { await H.annGot(rid, anns.slice(0, 20).map((a) => a.id)); } catch (e) {} }
		const list = await Promise.all(anns.slice(0, 20).map(async (a) => ({ id: a.id, title: a.title, body: a.body, level: a.level, at: a.at, upd: a.upd || a.at, exp: a.exp || 0, ...(a.files && a.files.length ? { files: await signFiles(env, H, a.files, 30 * DAY) } : {}) })));
		// 6.0：顺便说这个版本最新的热补丁是第几个（路由器每 30 分钟问一次公告，紧急补丁不用等 6 小时的定时检查）
		let hot;
		if (/^\d+\.\d+\.\d+$/.test(qv3)) try { hot = (await hotBest(env, qv3)).n; } catch (e) {}
		return new Response(JSON.stringify({ ok: true, list, ...(hot != null ? { hot } : {}) }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
	}
	if (p.startsWith('/api/fb/') && req.method === 'GET') {
		const { st, ...rest } = await H.fbStatus(p.slice(8), req.headers.get('cf-connecting-ip') || '');
		return J(rest, st);
	}
	// 安装失败上报前：问一下这次的安装码（或者路由器钥匙）认不认得出账号，认得出就不用填邮箱
	{ const cx = await compatPublic(req, p, H, body); if (cx) return cx; }
	if (p === '/api/report/who' && req.method === 'POST') { const b = await body(); const { st, ...rest } = await H.reportWho({ inv: String(b.inv || ''), sub: String(b.sub || ''), rkey: String(b.rkey || '') }, req.headers.get('cf-connecting-ip') || ''); return J(rest, st); }
	if (p === '/api/report' && req.method === 'POST') {
		const b = await body();
		if (b.website) return J({ ok: true });
		// 6.0 第 67 项：官网报告问题要先登录官网账号；邮箱一律用账号邮箱（网页上改了也没用），这条也会出现在账号页「我的反馈」里
		// 终端里的安装失败上报（kind=install）不在这个范围：照旧按安装码 / 路由器钥匙认账号
		const me = b.kind === 'install' ? null : await H.who(await sidFor(req, H));
		if (b.kind !== 'install' && !me) return J({ error: '先登录官网账号再报告问题', login: true }, 401);
		if (b.kind !== 'install') { const g = await captchaGate(env, H, 'report', req.headers.get('cf-connecting-ip') || '', String(b.cft || '')); if (g) return g; }
		const { st, ...rest } = await H.report({ kind: String(b.kind || ''), text: String(b.text || ''), contact: String(b.contact || ''), log: String(b.log || ''), email: me ? me.email : String(b.email || '').trim(), uid: me ? me.uid : '', inv: String(b.inv || ''), sub: String(b.sub || ''), rkey: String(b.rkey || ''), ip: req.headers.get('cf-connecting-ip') || '' });
		return J(rest, st);
	}
	if (p === '/api/unregister' && req.method === 'POST') {
		const b = await body();
		const { st, ...rest } = await H.unregister({ sub: String(b.sub || ''), rkey: String(b.rkey || '') });
		return J(rest, st);
	}
	// 实时对话（面板经路由器转发；托管版凭路由器钥匙，自建版凭匿名身份）
	if (p === '/api/chat' && req.method === 'POST') return chatApi(req, env, H, body);
	// 5.0：面板报错上报、公告点开统计
	{ const vp = await v5Public(req, env, H, body, u, p); if (vp) return vp; }
	// 服务状态、常见问题
	{ const hp = await helpPublic(req, H, body, p); if (hp) return hp; }
	if (p.startsWith('/api/admin/')) {
		const k = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), aip = req.headers.get('cf-connecting-ip') || '';
		const aua = uaLabel(req.headers.get('user-agent')), apl = placeOf(req.cf);
		// 同一个 IP 15 分钟内密钥错 10 次：先锁住（防猜密钥），错的每一次都记进登录记录
		if (aip && (await H.admBlocked(aip))) return J({ error: '密钥错太多次了，15 分钟后再试' }, 429);
		if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 16 || !safeEq(k, env.ADMIN_KEY)) { if (k) await H.admFail(aip, aua, apl, p); return J({ error: '需要管理员密钥' }, 401); }
		const a = p.slice('/api/admin/'.length).split('/');
		// 管理后台登录：只在输入密钥进来时记一次（之后每个请求不记）；开了两步验证的还要验证码，换一个 12 小时的通行证
		if (a[0] === 'login' && req.method === 'POST') {
			const b = await body(), t = await H.tfaLogin(b.code);
			if (t.st !== 200) { if (b.code) await H.admFail(aip, aua, apl, '登录', '两步验证码不对'); return J({ error: b.code ? t.error : '要输入两步验证码', need2fa: true }, 401); }
			await H.loginLog({ k: 'admin', who: '管理后台', ok: true, why: '登录成功', ip: aip, ua: aua, place: apl });
			try { await H.admLoginSeen(aip, aua, apl); } catch (e) {}
			await H.admTouch();
			return J({ ok: true, sess: t.sess || '', ...(await H.stats()) });
		}
		// 请求头里带的验证码不对 / 被别处用过：跟密钥错一样计数（同一个 IP 15 分钟 10 次就锁），防止有密钥的人一直猜验证码
		const tc = await H.tfaCheck(req.headers.get('x-adm-sess') || '', req.headers.get('x-adm-otp') || '', aip);
		if (tc !== true) { if (tc === 'bad') await H.admFail(aip, aua, apl, p, '两步验证码不对'); return J({ error: '要重新登录（两步验证）', need2fa: true }, 401); }
		await H.admTouch();
		{ const hx = await helpAdmin(req, a, H, body); if (hx) return hx; }
		const vx = await v5Admin(req, a, H, body, u, env);
		if (vx) return vx;
		const fx = (await famAdmin(a, H, body, req.method)) || (await famAdminUser(a, H, body, req.method)) || (await instAdmin(a, H, body, req.method));
		if (fx) return fx;
		// 管理后台传文件（公告附件、回复里的文件）：先领上传票
		if (a[0] === 'up' && req.method === 'POST') { const b = await body(), r = await fileStartFor(env, H, 'admin', b.ctx === 'ann' ? 'ann' : 'chat', b); const { st, ...rest } = r; return J(rest, st); }
		{ const cx = await compatAdminApi(req, a, H, body); if (cx) return cx; }
		// 公告「面板版本」的下拉：GitHub 上全部版本（正式版、尝鲜版、修复补丁），新的在前（用户 11/28）
		if (a[0] === 'versions' && req.method === 'GET') return J({ ok: true, list: await versionList(env, H) });
		const ox = await opsAdmin(req, a, H, body, u, env);
		if (ox) return ox;
		if (a[0] === 'devices' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.adminDevices(), trashDays: TRASH_DAYS, ...(await H.stats()) });
		if (a[0] === 'devices' && SUB_RE.test(a[1] || '') && req.method === 'POST') {
			const op = a[2], sub = a[1], b = await body();
			const done = async (r, what) => { if (r.st === 200 || r.ok === true) await H.alog(op, sub, what || ''); return r.st ? J(r.st === 200 ? r : { error: r.error }, r.st) : J(r); };
			if (op === 'off' || op === 'on') return done({ ok: await H.setOff(sub, op === 'off') }, op === 'off' ? '封禁' : '解封');
			// 删除：先进回收站（要输入编号确认、受保护的不能删）；恢复；彻底删除（只能删回收站里的，也要输入编号）
			if (op === 'delete') return done(await H.trash(sub, b.confirm), '放进回收站');
			if (op === 'restore') return done(await H.restore(sub), '从回收站恢复');
			if (op === 'purge') return done(await H.purge(sub, b.confirm), '彻底删除');
			if (op === 'protect' || op === 'unprotect') return done({ ok: await H.setProtect(sub, op === 'protect') }, op === 'protect' ? '标为受保护' : '取消保护');
			// 用户 11/27：后台自己定哪台发升级提醒（跟主人点邮件里「不再提醒」是同一个开关）
			if (op === 'ovoff' || op === 'ovon') {
				const r = await H.ovSet(sub, { by: 'admin', off: op === 'ovoff' });
				if (r.st !== 200) return J({ error: r.error }, r.st);
				return done({ ok: true }, op === 'ovoff' ? '关掉升级提醒' : '打开升级提醒');
			}
			if (op === 'extend') { const r = await H.extend(sub, b.days); return J(r.st === 200 ? r : { error: r.error }, r.st); }
			if (op === 'note') return done({ ok: await H.setNote(sub, b.note) }, '备注：' + noteText(b.note, 100));
		}
		// 6.0 第 86 项：提醒旧版本路由器升级（推送 + 给主账号发邮件；同一台 12 小时内只提醒一次）
		if (a[0] === 'oldver' && !a[1] && req.method === 'POST') {
			const b = await body(), subs = [...new Set((Array.isArray(b.subs) ? b.subs : []).map(String).filter((s) => SUB_RE.test(s)))].slice(0, 200);
			if (!subs.length) return J({ error: '没有选路由器' }, 400);
			const rv = await routerVerInfo(env).catch(() => null);
			if (!rv) return J({ error: '查不到最新版本，稍后再试' }, 502);
			const r = await H.ovTick(rv, { subs });
			await H.alog('oldver', subs.length + ' 台', `提醒升级到 v${rv.version}：提醒了 ${r.sent} 台，跳过 ${r.skip} 台（已是最新、12 小时内提醒过、停用或很久没上线）`);
			return J({ ok: true, version: rv.version, ...r });
		}
		if (a[0] === 'users' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.adminUsers(), trashDays: TRASH_DAYS });
		if (a[0] === 'users' && /^[a-z2-9]{12}$/.test(a[1] || '') && a[2] === 'full' && req.method === 'GET') { const { st, ...r } = await H.adminUserFull(a[1]); return J(r, st); }
		if (a[0] === 'users' && /^[a-z2-9]{12}$/.test(a[1] || '') && req.method === 'POST') {
			const b = await body();
			const r = a[2] === 'delete' ? await H.trashUser(a[1], b.confirm) : a[2] === 'restore' ? await H.restoreUser(a[1]) : a[2] === 'purge' ? await H.purgeUser(a[1], b.confirm) : { st: 404, error: 'not found' };
			return J(r.st === 200 ? r : { error: r.error }, r.st);
		}
		if (a[0] === 'log' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.adminLog() });
		if (a[0] === 'invites' && !a[1] && req.method === 'GET') { await H.instSweep(); return J({ ok: true, list: await H.invites() }); }
		if (a[0] === 'invites' && !a[1] && req.method === 'POST') { const inv = await H.addInvite(await body()); await H.alog('invite', inv.code, `能开通 ${inv.max} 台 · ${inv.svc ? '试用 ' + inv.svc + ' 天' : '不限期'}${inv.note ? ' · ' + inv.note : ''}`); return J({ ok: true, invite: inv }); }
		if (a[0] === 'invites' && a[1] && req.method === 'DELETE') { const ok = await H.delInvite(a[1]); if (ok) await H.alog('invite-del', String(a[1]).toUpperCase(), '作废'); return J({ ok }); }
		if (a[0] === 'renewals' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.renewals() });
		if (a[0] === 'renewals' && !a[1] && req.method === 'POST') { const list = await H.addRenewals(await body()); await H.alog('renewal', list.map((x) => x.code).join('、'), `续 ${list[0]?.days} 天 × ${list.length} 个${list[0]?.note ? ' · ' + list[0].note : ''}`); return J({ ok: true, list }); }
		if (a[0] === 'renewals' && a[1] && req.method === 'DELETE') { const ok = await H.delRenewal(a[1]); if (ok) await H.alog('renewal-del', String(a[1]).toUpperCase(), '作废'); return J({ ok }); }
		if (a[0] === 'applications' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.applications() });
		if (a[0] === 'applications' && SUB_RE.test(a[1] || '') && (a[2] === 'approve' || a[2] === 'reject') && req.method === 'POST') {
			const b = await body(), r = await H.decide(a[1], a[2] === 'approve', b);
			if (r.st === 200) await H.alog(a[2] === 'approve' ? 'approve' : 'reject', a[1], a[2] === 'approve' ? '续期申请通过，续 ' + parseDays(b.days) + ' 天，到期 ' + ymd(r.exp) : '续期申请拒绝' + (b.reason ? '：' + b.reason : ''));
			return J(r.st === 200 ? r : { error: r.error }, r.st);
		}
		if (a[0] === 'cleanup' && req.method === 'POST') return J({ ok: true, removed: await H.cleanup() });
		if (a[0] === 'feedback' && !a[1] && req.method === 'GET') return J({ ok: true, files: !!env.F, list: await Promise.all((await H.feedbacksAdmin()).map(async (x) => (x.files ? { ...x, files: await signFiles(env, H, x.files) } : x))) });
		// 公告：列表、新建、修改、删除
		if (a[0] === 'ann' && !a[1] && req.method === 'GET') return J({ ok: true, files: !!env.F, list: await Promise.all((await H.anns(true)).map(async (x) => (x.files ? { ...x, files: await signFiles(env, H, x.files, DAY) } : x))) });
		if (a[0] === 'ann' && (!a[1] || /^[a-z2-9]{10}$/.test(a[1])) && req.method === 'POST') { const b = await body(), r = await H.annSave(a[1] || '', b); if (r.st === 200) { await H.alog(a[1] ? 'ann_edit' : 'ann_new', '', r.ann.title); await annVerDrop(); } const { st, ...rest } = r; return J(rest, st); }
		if (a[0] === 'ann' && /^[a-z2-9]{10}$/.test(a[1] || '') && req.method === 'DELETE') { const r = await H.annDel(a[1]); if (r) { await H.alog('ann_del', '', a[1]); await annVerDrop(); } return J({ ok: r }, r ? 200 : 404); }
		if (a[0] === 'feedback' && /^[a-z2-9]{10}$/.test(a[1] || '') && a[2] === 'done' && req.method === 'POST') { const b = await body(); const r = await H.fbSet(a[1], b.state || (b.done ? 'fixed' : 'open'), b.note, !!b.mail); return J(r, r.error ? 400 : 200); }
		if (a[0] === 'feedback' && /^[a-z2-9]{10}$/.test(a[1] || '') && a[2] === 'ack' && req.method === 'POST') { const b = await body(); return J({ ok: await H.fbAck(a[1], b.on !== false) }); }
		if (a[0] === 'feedback' && /^[a-z2-9]{10}$/.test(a[1] || '') && req.method === 'DELETE') return J({ ok: await H.fbDel(a[1]) });
		if (a[0] === 'feedback' && /^[a-z2-9]{10}$/.test(a[1] || '') && a[2] === 'img' && /^[0-2]$/.test(a[3] || '') && req.method === 'GET') { const im = await H.fbImg(a[1], +a[3]); return im ? new Response(im.buf, { headers: { 'content-type': im.type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } }) : J({ error: '没有这张图' }, 404); }
		if (a[0] === 'feedback' && /^[a-z2-9]{10}$/.test(a[1] || '') && a[2] === 'log' && req.method === 'GET') { const t = await H.fbLog(a[1]); return t ? new Response(t, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } }) : J({ error: '没有日志' }, 404); }
		if (a[0] === 'testmail' && req.method === 'POST') { const r = await H.testMail(); return J(r, r.ok ? 200 : 502); }
		return J({ error: 'not found' }, 404);
	}
	if (p.startsWith('/api/account/') || p === '/api/pair/start' || p.startsWith('/api/dev/')) return accountApi(req, env, H, p, body);
	// 路由器面板查新版本用 /api/router/version。v2.0.2–v2.0.4 的路由器问的还是 /api/app/version（用 curl），
	// 那时它返回的是路由器的版本；后来 App 有了自己的版本号，这些路由器就再也看不到更新了。所以 curl 来问的照旧回答路由器的版本
	if (p === '/api/router/version') return routerVersion(env);
	if (p === '/api/router/hot') return hotInfo(env, new URL(req.url).searchParams.get('v'));
	if (p.startsWith('/dl/h/') && (req.method === 'GET' || req.method === 'HEAD')) { const m = /^\/dl\/h\/([^/]+)\/([^/]+)$/.exec(p); return m ? hotDl(env, m[1], m[2]) : J({ error: '没有这个文件' }, 404); }
	if (p === '/api/changelog' && req.method === 'GET') return changelogApi(env);
	if (p === '/api/app/version') return /^curl\//i.test(req.headers.get('user-agent') || '') ? routerVersion(env) : appVersion(env);
	if (p === '/app/router-panel.apk' && req.method === 'GET') return appApk(env);
	if (p.startsWith('/dl/cfd/') && (req.method === 'GET' || req.method === 'HEAD')) return dlCfd(p.slice(8));
	// 6.0 第 58 项：尝鲜版（指定版本）的安装包：/dl/t/v6.0.2/文件名，只转发 GitHub 上这个版本的发布文件（路由器照样验签）
	if (p.startsWith('/dl/t/') && (req.method === 'GET' || req.method === 'HEAD')) { const m = /^\/dl\/t\/(v\d+\.\d+\.\d+)\/([^/]+)$/.exec(p); return m ? dlFile(env, m[2], m[1]) : J({ error: '没有这个文件' }, 404); }
	if (p.startsWith('/dl/') && (req.method === 'GET' || req.method === 'HEAD')) return dlFile(env, p.slice(4));
	// 管理后台（4.0 新版）：打包好的页面和静态文件都在 site.js 里，不从任何外部网站加载东西
	// /admin 跳到 /admin/：手机推送的后台程序只管 /admin/ 下面的页面，不带 / 打开时推送开不了
	if (p === '/admin' && (req.method === 'GET' || req.method === 'HEAD')) return new Response(null, { status: 301, headers: { location: '/admin/' + u.search } });
	if (p === '/admin/' && (req.method === 'GET' || req.method === 'HEAD')) return adminPage(req.method === 'HEAD' ? null : ADMIN_APP);
	// 管理后台的推送（5.0）：手机上收到「有人发来消息」，点开回到对话
	if (p === '/admin/sw.js' && req.method === 'GET') return new Response(ADMIN_SW, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', 'service-worker-allowed': '/admin/', 'x-content-type-options': 'nosniff' } });
	if (p.startsWith('/admin/assets/') && (req.method === 'GET' || req.method === 'HEAD')) {
		const fn = p.slice('/admin/assets/'.length), f = Object.prototype.hasOwnProperty.call(ADMIN_FILES, fn) ? ADMIN_FILES[fn] : null;
		if (!f || typeof f.body !== 'string') return J({ error: 'not found' }, 404);
		return new Response(req.method === 'HEAD' ? null : f.body, { headers: { 'content-type': f.type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
	}
	// 官网字体（只有拉丁字母和数字，中文用手机自带字体）
	if (p === '/fonts/geist.woff2' && (req.method === 'GET' || req.method === 'HEAD')) { if (!FONT_BIN) FONT_BIN = Uint8Array.from(atob(FONT_GEIST), (c) => c.charCodeAt(0)); return new Response(req.method === 'HEAD' ? null : FONT_BIN, { headers: { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } }); }
	// 官网首页的截图（/img/名字-内容摘要.webp）：内容变了网址跟着变，浏览器可以一直缓存
	if (p.startsWith('/img/') && (req.method === 'GET' || req.method === 'HEAD')) {
		const fn = p.slice(5);
		if (!Object.prototype.hasOwnProperty.call(IMG_FILES, fn) || typeof IMG_FILES[fn] !== 'string') return J({ error: 'not found' }, 404);
		if (!IMG_BIN.has(fn)) IMG_BIN.set(fn, Uint8Array.from(atob(IMG_FILES[fn]), (c) => c.charCodeAt(0)));
		return new Response(req.method === 'HEAD' ? null : IMG_BIN.get(fn), { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
	}
	// 官网首页的版式和动效组件（/k/...）：只有 site.js 里打包好的这些文件，没有就 404
	if (p.startsWith('/k/') && (req.method === 'GET' || req.method === 'HEAD')) {
		const f = Object.prototype.hasOwnProperty.call(KIT_FILES, p.slice(3)) ? KIT_FILES[p.slice(3)] : null;
		if (!f) return J({ error: 'not found' }, 404);
		return new Response(req.method === 'HEAD' ? null : f.body, { headers: { 'content-type': f.type, 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' } });
	}
	// 6.0 第 8 项：脚本只放行本站文件和打包时算好摘要的页面内联脚本（不再 'unsafe-inline'）；违反的上报到 /api/csp，记进后台「出错记录」
	if (p === '/api/csp' && req.method === 'POST') {
		if (+(req.headers.get('content-length') || 0) <= 8192) { const b = await body(), r = (b && (b['csp-report'] || (Array.isArray(b) && b[0] && b[0].body))) || {}; try { await H.cspLog(String(r['document-uri'] || r.documentURL || ''), String(r['violated-directive'] || r.effectiveDirective || ''), String(r['blocked-uri'] || r.blockedURL || '')); } catch (e) {} }
		return new Response(null, { status: 204 });
	}
	const PGN = { '/': 'home', '/index.html': 'home', '/app': 'app', '/privacy': 'privacy', '/security': 'security', '/notice': 'notice', '/terms': 'terms', '/changelog': 'changelog', '/status': 'status', '/help': 'help', '/compat': 'compat' };
	// 安全加固：旧版管理页默认下线（新版在 /admin/），只在设了 OLD_ADMIN=1 时打开（测试用）；下线后打开它跳到新版
	if (p === '/admin/old' && env.OLD_ADMIN !== '1') return new Response(null, { status: 301, headers: { location: '/admin/' } });
	const pg = { '/': HOME, '/index.html': HOME, '/app': APP, '/admin/old': ADMIN, '/privacy': PRIVACY, '/security': SECURITY, '/notice': NOTICE, '/terms': TERMS, '/changelog': CHANGELOG, '/status': STATUS, '/help': HELP, '/compat': COMPAT }[p] || (/^\/r(\/|\/[A-Za-z2-9]{8})?$/.test(p) ? REPLY : null);
	// 网页：HEAD（只探一下，比如聊天软件生成链接预览）跟 GET 一样回应，只是不带内容。
	// 官网各页放行 Cloudflare 网页统计（不用 Cookie、不记 IP，只统计访问量）；管理页不放行
	if (pg && (req.method === 'GET' || req.method === 'HEAD')) {
		// 访问统计：只算官网各页的打开次数、访客 IP（留 30 天）和国家/地区；管理页不算
		if (req.method === 'GET' && pg !== ADMIN) { const ua = req.headers.get('user-agent') || ''; try { await H.track('pv', { page: PGN[p] || 'reply', ip: req.headers.get('cf-connecting-ip') || '', cc: (req.cf && req.cf.country) || '', bot: isBot(ua) }); } catch (e) {} }
		const ins = pg === ADMIN ? '' : ' https://static.cloudflareinsights.com', insc = pg === ADMIN ? '' : ' https://cloudflareinsights.com';
		// 第 66 项：账号页和安全说明页（报告问题）要用人机验证时，放行 Cloudflare Turnstile 的脚本和验证框
		const cap = capOn(env) && (pg === APP || pg === SECURITY), capS = cap ? ' https://challenges.cloudflare.com' : '', capF = cap ? "; frame-src https://challenges.cloudflare.com" : '';
		return new Response(req.method === 'HEAD' ? null : pg, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; script-src 'self' " + (CSP_SCRIPTS[PGK.get(pg)] || '') + ins + capS + "; style-src 'self' 'unsafe-inline'; img-src 'self' data:" + (pg === ADMIN ? ' blob:' : '') + "; connect-src 'self'" + insc + capF + "; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; report-uri /api/csp" } });
	}
	return J({ error: 'not found' }, 404);
}

const ADMIN_SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
	let d = {};
	try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
	e.waitUntil(self.registration.showNotification(d.title || '管理后台', { body: d.body || '', tag: d.tag || 'adm', renotify: true, data: { url: d.url || '/admin/' }, icon: '/favicon.ico' }));
});
self.addEventListener('notificationclick', (e) => {
	e.notification.close();
	const url = new URL((e.notification.data && e.notification.data.url) || '/admin/', self.location.origin).href;
	e.waitUntil((async () => {
		for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) if (c.url.includes('/admin')) { await c.focus(); try { await c.navigate(url); } catch (x) {} return; }
		await self.clients.openWindow(url);
	})());
});
`;
function adminPage(html) {
	return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'permissions-policy': 'camera=(), microphone=(), geolocation=()',
		'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
}
/* ---------- 安卓 App：最新版本号和安装包（从 GitHub Release 转过来，走自己的域名，大陆也能下） ---------- */
const repoOf = (env) => env.GITHUB_REPO || 'wznwzn123/openwrt-claude-panel';
// 全部版本：正式版、尝鲜版（预发布）、修复补丁（hot-版本-编号）。GitHub 接口被限流时用上次存下的
async function versionList(env, H) {
	const v = await cached('vlist-1', 300, async () => {
		const hd = { 'user-agent': 'router-panel-hub', accept: 'application/vnd.github+json' };
		let raw = [];
		for (let pg = 1; pg <= 3; pg++) {
			try { const r = await fetch('https://api.github.com/repos/' + repoOf(env) + '/releases?per_page=100&page=' + pg, { headers: hd }); if (!r.ok) break; const b = await r.json(); if (!Array.isArray(b)) break; raw = raw.concat(b); if (b.length < 100) break; } catch (e) { break; }
		}
		const out = [];
		for (const r of raw) {
			if (!r || r.draft) continue;
			const t = String(r.tag_name || ''), at = Date.parse(r.published_at || r.created_at || '') || 0;
			let m = /^v(\d+\.\d+\.\d+)$/.exec(t);
			if (m) { out.push({ v: m[1], pre: !!r.prerelease, at }); continue; }
			m = /^hot-(\d+\.\d+\.\d+)-(\d{1,4})$/.exec(t);
			if (m) out.push({ v: m[1] + '.' + m[2], base: m[1], hot: +m[2], at });
		}
		if (out.length) { try { await H.setMeta('vlist', out); } catch (e) {} return out; }
		try { const o = await H.meta('vlist'); if (o && o.length) return o; } catch (e) {}
		// GitHub 接口被限流（Cloudflare 的出口 IP 大家共用，用户 11/28 截图：下拉里只有「不限」）：拼别处存下的——
		// 更新日志存的正式版、尝鲜版（每小时记一次）、最新正式版（走不限流的跳转），补丁按编号顺着试下载地址
		const fb = [], add = (x) => { if (!fb.some((y) => y.v === x.v)) fb.push(x); };
		try { for (const x of ((await H.meta('clog')) || {}).list || []) add({ v: String(x.v).replace(/^v/, ''), pre: false, at: x.at || 0 }); } catch (e) {}
		try { const p = await H.meta('prerel'); if (p && p.ver) add({ v: String(p.ver).replace(/^v/, ''), pre: true, at: Date.parse(p.at || '') || 0 }); } catch (e) {}
		try { const x = await latestRelease(env); if (x && x.tag) add({ v: String(x.tag).replace(/^v/, ''), pre: false, at: x.at ? Date.parse(x.at) || 0 : 0 }); } catch (e) {}
		for (const b of fb.slice().sort((a, c) => verCmp(c.v, a.v)).slice(0, 3)) {
			try { const h = await hotBest(env, b.v); for (let n = 1; n <= (h.n || 0) && n <= 99; n++) add({ v: b.v + '.' + n, base: b.v, hot: n, at: 0 }); } catch (e) {}
		}
		return fb.length ? fb : null;
	});
	return (v || []).slice().sort((a, b) => verCmp(b.v, a.v, 4));
}
async function cached(key, ttl, make) {
	const cache = typeof caches !== 'undefined' ? caches.default : null;
	const k = new Request('https://cache.local/' + key);
	if (cache) { const hit = await cache.match(k); if (hit) return hit.json(); }
	const v = await make();
	if (cache && v) await cache.put(k, new Response(JSON.stringify(v), { headers: { 'cache-control': 'max-age=' + ttl } }));
	return v;
}
// 更新说明：取发布说明里「这个版本的更新」那一节
// App 弹窗里是纯文字：去掉 Markdown 的加粗、链接、代码标记，「- 」换成「• 」
const plain = (t) => t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/^- /gm, '• ');
const notesOf = (b) => { b = String(b || '').replace(/\r/g, ''); const m = /## 这个版本的更新\n([\s\S]*?)(?:\n## |$)/.exec(b); return plain((m ? m[1] : b).trim()).slice(0, 800); };
// 最新发布：先问 GitHub 接口；Cloudflare 的出口 IP 是很多网站共用的，GitHub 接口每小时 60 次的限制常常被别人用光（返回 403），
// 这时改从发布页的跳转（拿版本号）和原始文件（拿更新说明）读，这两个没有这种限制
async function latestRelease(env) {
	const repo = repoOf(env), H = { 'user-agent': 'router-panel-hub' };
	try {
		const r = await fetch('https://api.github.com/repos/' + repo + '/releases/latest', { headers: { ...H, accept: 'application/vnd.github+json' } });
		if (r.ok) { const j = await r.json(); return { tag: String(j.tag_name || ''), body: String(j.body || ''), apk: (j.assets || []).some((a) => a.name === 'router-panel.apk'), at: j.published_at || '' }; }
		if (r.status === 404) return { none: true };
	} catch (e) {}
	try {
		const r = await fetch('https://github.com/' + repo + '/releases/latest', { redirect: 'manual', headers: H });
		const m = /\/releases\/tag\/([^/?#]+)$/.exec(r.headers.get('location') || '');
		if (!m) return r.status === 404 ? { none: true } : null;
		const tag = decodeURIComponent(m[1]);
		let body = '';
		try { const n = await fetch('https://raw.githubusercontent.com/' + repo + '/' + encodeURIComponent(tag) + '/tools/release-notes.md', { headers: H }); if (n.ok) body = await n.text(); } catch (e) {}
		let apk = false;
		try { const a = await fetch('https://github.com/' + repo + '/releases/download/' + encodeURIComponent(tag) + '/router-panel.apk', { method: 'HEAD', redirect: 'manual', headers: H }); apk = a.status >= 200 && a.status < 400; } catch (e) {}
		return { tag, body, apk, at: '' };
	} catch (e) { return null; }
}
// App 自己的版本：发布时如果 App 的代码没改，就沿用上一次改动时的版本号（写在 Release 的 app-version.json 里）
// 这样只是路由器那边更新时，App 不会跟着弹窗；App 真改了才提示，而且必须更新
async function appMeta(env) {
	try {
		const r = await fetch('https://github.com/' + repoOf(env) + '/releases/latest/download/app-version.json', { redirect: 'follow', headers: { 'user-agent': 'router-panel-hub' } });
		if (!r.ok) return null;
		const j = await r.json();
		return j && typeof j.version === 'string' && /^v?\d+(\.\d+){0,2}$/.test(j.version) ? j : null;
	} catch (e) { return null; }
}
async function appVersion(env) {
	const cors = { 'access-control-allow-origin': '*' };
	const out = (o, st) => { const res = J(o, st); for (const [k, x] of Object.entries(cors)) res.headers.set(k, x); return res; };
	try {
		const v = await cached('app-version', 1800, async () => {
			const x = await latestRelease(env);
			// GitHub 暂时连不上：用上一次查到的（存在开通中心里），不至于没有更新提示
			if (!x) { try { return (await hubObj(env).meta('appver')) || null; } catch (e) { return null; } }
			if (x.none || !x.apk) return null;
			// 强制更新：发布说明里写「【必须更新】」，或者写「最低版本：1.2.1」（比这个旧的必须更新）
			const m = await appMeta(env);
			const mv = /最低版本[:：]\s*v?(\d+(?:\.\d+){0,2})/.exec(x.body);
			const o = m
				? { version: m.version.replace(/^v/, ''), notes: notesOf(m.body || ''), apk: '/app/router-panel.apk', at: m.at || x.at, force: m.force !== false, min: '' }
				// 老的发布没有 app-version.json：照旧用发布的版本号
				: { version: x.tag.replace(/^v/, ''), notes: notesOf(x.body), apk: '/app/router-panel.apk', at: x.at, force: mustUpdate(x.body, x.tag), min: mv ? mv[1] : '' };
			try { await hubObj(env).setMeta('appver', o); } catch (e) {}
			return o;
		});
		return v ? out({ ok: true, ...v }, 200) : out({ ok: false, error: '还没有发布安卓 App' }, 404);
	} catch (e) { return out({ ok: false, error: '检查更新失败' }, 502); }
}
// 路由器的最新版本：就是最新发布的版本号和更新说明
// 官网「更新日志」：GitHub 上每次发布的说明（每个版本自己的「这个版本的更新」），新的在前。缓存 5 分钟，所以新版本几分钟内出现；
// GitHub 接口被限流（Cloudflare 出口 IP 大家共用）时，用上一次存下的，再把最新一版补上（最新一版走不限流的那条路）
async function changelogApi(env) {
	try {
		const v = await cached('changelog-1', 300, async () => {
			try {
				const r = await fetch('https://api.github.com/repos/' + repoOf(env) + '/releases?per_page=100', { headers: { 'user-agent': 'router-panel-hub', accept: 'application/vnd.github+json' } });
				// 热补丁也是发布记录，多了以后 100 条装不下：满 100 条再取第 2 页
				let raw = r.ok ? await r.json() : null;
				if (Array.isArray(raw) && raw.length >= 100) { try { const r2 = await fetch('https://api.github.com/repos/' + repoOf(env) + '/releases?per_page=100&page=2', { headers: { 'user-agent': 'router-panel-hub', accept: 'application/vnd.github+json' } }); if (r2.ok) { const b = await r2.json(); if (Array.isArray(b)) raw = raw.concat(b); } } catch (e) {} }
				if (Array.isArray(raw)) { const list = changelogOf(raw); if (list.length) { const o = { list, at: Date.now() }; try { await hubObj(env).setMeta('clog', o); } catch (e) {} return o; } }
			} catch (e) {}
			let o = null;
			try { o = await hubObj(env).meta('clog'); } catch (e) {}
			const x = await latestRelease(env).catch(() => null);
			if (x && x.tag && !(o && o.list || []).some((y) => y.v === x.tag)) {
				const n = changelogOf([{ tag_name: x.tag, body: x.body, published_at: x.at || '' }]);
				if (n.length) o = { list: [...n, ...((o && o.list) || [])], at: Date.now() };
			}
			return o && o.list && o.list.length ? o : null;
		});
		return v ? J({ ok: true, list: v.list, at: v.at }) : J({ ok: false, error: '暂时读不到更新日志' }, 502);
	} catch (e) { return J({ ok: false, error: '暂时读不到更新日志' }, 502); }
}
// 这一版本身是不是「必须更新」：
// 「最低版本：x.y.z【必须更新】」这一行说的是「比 x.y.z 旧的必须更新」——x.y.z 就是这一版时这一版强制，是更早的版本时这一版不强制
// （5.2.3 就是因为沿用了上一版的「最低版本：v5.2.2【必须更新】」，结果已经是 5.2.2 的也被强制更新）；
// 说明里别处另外写了【必须更新】（比如某条修复后面）照旧算强制
export function mustUpdate(body, ver) {
	body = String(body || ''); ver = String(ver || '').replace(/^v/, '');
	const re = /最低版本[:：]\s*v?(\d+(?:\.\d+){0,2})\s*【必须更新】/, m = re.exec(body);
	return !!((m && m[1] === ver) || body.replace(re, '').includes('【必须更新】'));
}
// 路由器的最新版本（版本号、更新说明、是不是必须更新、最低版本）：路由器检查更新和提醒旧版本（6.0 第 86 项）共用
export function routerVerInfo(env) {
	return cached('router-version', 600, async () => {
		const x = await latestRelease(env);
		if (!x) { try { return (await hubObj(env).meta('rver')) || null; } catch (e) { return null; } }
		if (x.none || !x.tag) return null;
		const mv = /最低版本[:：]\s*v?(\d+(?:\.\d+){0,2})/.exec(x.body);
		const o = { version: x.tag.replace(/^v/, ''), notes: notesOf(x.body), at: x.at, force: mustUpdate(x.body, x.tag), min: mv ? mv[1] : '' };
		try { await hubObj(env).setMeta('rver', o); } catch (e) {}
		return o;
	});
}
// 6.0 热补丁：GitHub 上的预发布「hot-版本-编号」（比如 hot-6.0.0-3），路由器问「我这个版本最新的补丁是第几个」。缓存 10 分钟
export const HOT_TAG = /^hot-(\d+\.\d+\.\d+)-(\d+)$/;
// 这个版本最新的热补丁（{ n, tag, notes }，没有 n = 0）；读不到 GitHub 抛错
// GitHub 接口在 Cloudflare 上常被限流（出口 IP 大家共用，返回 403）：接口能用时把补丁列表存一份；
// 不能用时拿存的那份，再顺着编号往后试下载地址（下载地址不限流）找新补丁
// 公告版本号：「改了几次.已经到点的定时数」。心跳、自建版的 /api/notices/v 都用它；缓存 30 秒（别的机房最多晚 30 秒）
export async function annVer(env) {
	if (!env.H) return null;
	const m = await cached('ann-meta', 30, () => hubObj(env).annMeta());
	if (!m) return null;
	const now = Date.now();
	return m.rev + '.' + (m.t || []).filter((x) => x <= now).length;
}
async function annVerDrop() { try { if (typeof caches !== 'undefined') await caches.default.delete(new Request('https://cache.local/ann-meta')); } catch (e) {} }
async function hotBest(env, v) {
	const repo = repoOf(env), H = { 'user-agent': 'router-panel-hub' };
	let l = null;
	try {
		l = await cached('hot-list', 600, async () => {
			const r = await fetch('https://api.github.com/repos/' + repo + '/releases?per_page=100', { headers: { ...H, accept: 'application/vnd.github+json' } });
			if (!r.ok) throw new Error('GitHub ' + r.status);
			const x = (await r.json()).map((x) => ({ tag: String(x.tag_name || ''), body: String(x.body || '').slice(0, 300), draft: !!x.draft })).filter((x) => !x.draft && HOT_TAG.test(x.tag));
			try { await hubObj(env).setMeta('hotl', x); } catch (e) {}
			return x;
		});
	} catch (e) {}
	if (!l) l = await cached('hot-fb-' + v, 300, async () => {
		let o = [];
		try { o = (await hubObj(env).meta('hotl')) || []; } catch (e) {}
		let n = 0;
		for (const x of o) { const m = HOT_TAG.exec(x.tag); if (m && m[1] === v) n = Math.max(n, +m[2]); }
		for (let i = 0; i < 20; i++) {
			const tag = 'hot-' + v + '-' + (n + 1);
			const r = await fetch('https://github.com/' + repo + '/releases/download/' + tag + '/SHA256SUMS.sig2', { method: 'HEAD', redirect: 'manual', headers: H });
			if (r.status < 200 || r.status >= 400) { if (r.status === 404) break; throw new Error('GitHub ' + r.status); }
			o = [...o, { tag, body: '' }]; n++;
		}
		return o;
	});
	let best = null;
	for (const x of l) { const m = HOT_TAG.exec(x.tag); if (m && m[1] === v && (!best || +m[2] > best.n)) best = { n: +m[2], tag: x.tag, notes: x.body.split('\n')[0].trim() }; }
	best = best || { n: 0 };
	// 列表缓存 10 分钟：刚发的补丁要等缓存过期才看得到（用户 11/27：点「检查更新」刷不出来）。
	// 顺着编号再试一下下一个的下载地址（不限流，结果缓存 1 分钟），新补丁一发出来马上能查到
	try {
		const nx = await cached('hot-nx-' + v + '-' + best.n, 60, async () => {
			let n = best.n;
			for (let i = 0; i < 10; i++) {
				const r = await fetch('https://github.com/' + repoOf(env) + '/releases/download/hot-' + v + '-' + (n + 1) + '/SHA256SUMS.sig2', { method: 'HEAD', redirect: 'manual', headers: { 'user-agent': 'router-panel-hub' } });
				if (r.status < 200 || r.status >= 400) break;
				n++;
			}
			return { n };
		});
		if (nx && nx.n > best.n) best = { n: nx.n, tag: 'hot-' + v + '-' + nx.n, notes: '' };
	} catch (e) {}
	return best;
}
async function hotInfo(env, v) {
	if (!/^\d+\.\d+\.\d+$/.test(v || '')) return J({ ok: false, error: '版本号不对' }, 400);
	try { return J({ ok: true, ...(await hotBest(env, v)) }); }
	catch (e) { return J({ ok: false, error: '查不到热补丁' }, 502); }
}
const HOT_FILES = ['hot.tar.gz', 'SHA256SUMS', 'SHA256SUMS.sig2'];
async function hotDl(env, tag, name) {
	if (!HOT_TAG.test(tag) || !HOT_FILES.includes(name)) return J({ error: '没有这个文件' }, 404);
	const get = () => fetch('https://github.com/' + repoOf(env) + '/releases/download/' + tag + '/' + name, { redirect: 'follow', headers: { 'user-agent': 'router-panel-hub' } });
	let r = await get(); if (!r.ok) r = await get();
	if (!r.ok) return J({ error: '还没有发布这个补丁' }, 404);
	return new Response(r.body, { headers: { 'content-type': name.endsWith('.gz') ? 'application/gzip' : 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
async function routerVersion(env) {
	try {
		const v = await routerVerInfo(env);
		return v ? J({ ok: true, ...v }) : J({ ok: false, error: '还没有发布' }, 404);
	} catch (e) { return J({ ok: false, error: '检查更新失败' }, 502); }
}
async function appApk(env) {
	const r = await fetch('https://github.com/' + repoOf(env) + '/releases/latest/download/router-panel.apk', { redirect: 'follow', headers: { 'user-agent': 'router-panel-hub' } });
	if (!r.ok) return J({ error: '还没有发布安卓 App' }, 404);
	return new Response(r.body, { headers: { 'content-type': 'application/vnd.android.package-archive', 'content-disposition': 'attachment; filename="router-panel.apk"', 'cache-control': 'public, max-age=600' } });
}

// 安装包也从官网下载（从 GitHub 最新发布转过来）：大陆的路由器直连 GitHub 常常很慢或者下不动
export const DL_RE = /^(openwrt-claude-panel(?:-(?:(?:ai|noai)-(?:lite|full)|hosted(?:-(?:ai|noai))?))?\.tar\.gz|SHA256SUMS(?:\.sig2?)?)$/;
// 通用安装包（5.2 起，安装时在终端里选版本）：还没发布的旧版本里没有，就用能问版本的那个具体包顶上
const DL_FALLBACK = { 'openwrt-claude-panel.tar.gz': 'openwrt-claude-panel-ai-full.tar.gz', 'openwrt-claude-panel-hosted.tar.gz': 'openwrt-claude-panel-hosted-ai.tar.gz' };
async function dlFile(env, name, tag) {
	if (!DL_RE.test(name)) return J({ error: '没有这个文件' }, 404);
	const get0 = (n) => fetch('https://github.com/' + repoOf(env) + (tag ? '/releases/download/' + tag + '/' : '/releases/latest/download/') + n, { redirect: 'follow', headers: { 'user-agent': 'router-panel-hub' } }).catch(() => ({ ok: false, status: 0 }));
	// GitHub 偶尔会失败一次（十几次里有一次）：不行就马上再试一次，免得路由器一键更新时官网这条路白走
	const get = async (n) => { const r = await get0(n); return r.ok ? r : get0(n); };
	let r = await get(name);
	if (!r.ok && DL_FALLBACK[name]) r = await get(DL_FALLBACK[name]);
	if (!r.ok) return J({ error: '还没有发布这个安装包' }, 404);
	const gz = name.endsWith('.gz');
	return new Response(r.body, { headers: { 'content-type': gz ? 'application/gzip' : 'text/plain; charset=utf-8', 'content-disposition': 'attachment; filename="' + name + '"', 'cache-control': 'public, max-age=600' } });
}

// 小闪存模式：路由器开机时从这里下载官方 cloudflared 到内存里运行（国内直连 GitHub 常常很慢）。
// 只转发 Cloudflare 官方 GitHub 发布里的 Linux 程序；路由器下载后会用安装包里写好的 SHA256 校验，这里转发错了也跑不起来
export const CFD_RE = /^(20\d\d\.\d{1,2}\.\d{1,3})\/cloudflared-linux-(arm64|arm|amd64|386)$/;
async function dlCfd(rest) {
	const m = CFD_RE.exec(rest);
	if (!m) return J({ error: '没有这个文件' }, 404);
	const url = 'https://github.com/cloudflare/cloudflared/releases/download/' + m[1] + '/cloudflared-linux-' + m[2];
	const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'router-panel-hub' }, cf: { cacheEverything: true, cacheTtl: 30 * 86400 } });
	if (!r.ok) return J({ error: '下载 cloudflared 失败' }, 502);
	const h = { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="cloudflared-linux-' + m[2] + '"', 'cache-control': 'public, max-age=2592000, immutable' };
	const len = r.headers.get('content-length'); if (len) h['content-length'] = len;
	return new Response(r.body, { headers: h });
}

/* ---------- 账号接口（官网）和路由器配对接口 ---------- */
// 安全加固：登录 Cookie 用 __Host- 开头的名字。托管路由器的专属网址都在主域名下面（网页内容由路由器主人决定），
// 普通名字的 Cookie 能被子域名用 Domain= 覆盖（把别人换成自己的账号登录）；__Host- 开头的浏览器只认主域名自己设的。
// 以前发的 sid / did 还认（没有新 Cookie 时，sid 只认改名之前登录的），下次访问自动换成新的
const ck = (req, name) => (new RegExp('(?:^|;\\s*)' + name + '=([a-z2-9]{32})(?:;|$)').exec(req.headers.get('cookie') || '') || [])[1] || '';
// 没有 __Host-sid 时才看旧的 sid，而且只认改名之前登录的（见 Hub.sidLegacyOk）
const legacySid = async (req, H) => { if (ck(req, '__Host-sid')) return ''; const o = ck(req, 'sid'); return o && (await H.sidLegacyOk(o)) ? o : ''; };
const sidFor = async (req, H) => ck(req, '__Host-sid') || (await legacySid(req, H));
const sidCookie = (sid, age) => `__Host-sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const sidOld = 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
// 新设备验证用：这个浏览器的编号（验证过一次以后，30 天内登录只要密码）
const getDid = (req) => ck(req, '__Host-did') || ck(req, 'did');
const didCookie = (did) => `__Host-did=${did}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TRUST_DAYS * 86400}`;
const didOld = 'did=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
// 自建版路由器的面板网址：只认 https；登录地址（/cgi-bin/mcp/密钥）和 #login=密钥 都只取网址部分，密钥丢掉
export function panelUrl(raw) {
	let u;
	try { u = new URL(String(raw || '').trim()); } catch (e) { return null; }
	if (u.protocol !== 'https:' || u.username || u.password) return null;
	const host = u.hostname.toLowerCase();
	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return null;
	const stripped = /^\/cgi-bin\/mcp\/./.test(u.pathname) || /login=/.test(u.hash) || u.search.length > 1;
	if (!/^\/(panel\/?(index\.html)?|cgi-bin\/mcp\/[A-Za-z0-9]+\/?)?$/.test(u.pathname)) return null;
	return { host, url: 'https://' + host + (u.port ? ':' + u.port : '') + '/panel/', stripped };
}
async function accountApi(req, env, H, p, body) {
	const res = await accountApi0(req, env, H, p, body);
	// 还带着以前的 sid / did（没有新的）：换成 __Host- 开头的新 Cookie，旧的删掉
	if (p.startsWith('/api/account/') && !/^\/api\/account\/(logout|delete)$/.test(p) && !/(^|, )__Host-sid=/.test(res.headers.get('set-cookie') || '')) {
		const os = await legacySid(req, H), od = !ck(req, '__Host-did') && ck(req, 'did');
		if (os) { res.headers.append('set-cookie', sidCookie(os, 30 * 86400)); res.headers.append('set-cookie', sidOld); }
		if (od) { res.headers.append('set-cookie', didCookie(od)); res.headers.append('set-cookie', didOld); }
	}
	return res;
}
async function accountApi0(req, env, H, p, body) {
	const ip = req.headers.get('cf-connecting-ip') || '';
	const post = req.method === 'POST';
	if (post) {
		// 防跨站：浏览器发来的必须是本站页面；内容必须是 JSON（普通表单发不了）
		const o = req.headers.get('origin');
		if (o) { let h = ''; try { h = new URL(o).hostname; } catch (e) {} if (h !== env.BASE_DOMAIN && h !== 'www.' + env.BASE_DOMAIN) return J({ error: 'bad origin' }, 403); }
		if (!/^application\/json/i.test(req.headers.get('content-type') || '')) return J({ error: 'bad content type' }, 415);
	}
	const b = post ? await body() : {};
	const s = (v) => String(v == null ? '' : v);
	const out = (r) => { const { st, sid, did: nd, ...rest } = r; const res = J(sid ? { ok: true, ...rest } : rest, st); if (sid) { res.headers.append('set-cookie', sidCookie(sid, 30 * 86400)); res.headers.append('set-cookie', sidOld); } if (nd) { res.headers.append('set-cookie', didCookie(nd)); res.headers.append('set-cookie', didOld); } return res; };
	const did = getDid(req);
	if (!post && p !== '/api/account/me' && p !== '/api/account/brief') return J({ error: 'method not allowed' }, 405);
	// 路由器那边（凭 RKEY）
	if (p === '/api/pair/start') return out(await H.pairStart({ sub: s(b.sub), rkey: s(b.rkey) }));
	if (p === '/api/dev/accounts') return out(await H.devAccounts({ sub: s(b.sub), rkey: s(b.rkey) }));
	if (p === '/api/dev/unbind') return out(await H.devUnbind({ sub: s(b.sub), rkey: s(b.rkey), uid: s(b.uid) }));
	if (p === '/api/dev/logincode') return out(await H.devLoginCode({ sub: s(b.sub), rkey: s(b.rkey), code: s(b.code) }));
	if (p === '/api/dev/info') return out(await H.devInfo({ sub: s(b.sub), rkey: s(b.rkey) }));
	if (p === '/api/dev/fb') return out(await H.devFb({ sub: s(b.sub), rkey: s(b.rkey), uid: s(b.uid) }));
	if (p === '/api/dev/feedback') return out(await H.feedback({ sub: s(b.sub), rkey: s(b.rkey), uid: s(b.uid), text: s(b.text), contact: s(b.contact), diag: s(b.diag), images: Array.isArray(b.images) ? b.images.slice(0, 3).map(s) : [], files: Array.isArray(b.files) ? b.files.slice(0, 5).map(s) : [] }));
	if (p === '/api/dev/renew') return out(await H.devRenew({ sub: s(b.sub), rkey: s(b.rkey), code: s(b.code) }));
	// 5.2 主账号 / 子账号：路由器问成员和权限、拿「打开面板」的票、主账号在面板里管子账号
	{ const fx = (await famDev(p, H, b)) || (await edDev(p, H, b)) || (await xDev(p, H, b)) || (await moveDev(p, H, b)); if (fx) return fx; }
	const a = p.slice('/api/account/'.length);
	{ const k = { code: 'code', register: 'reg', login: 'login', reset: 'reset', wait: 'reg' }[a]; if (k) { const g = await captchaGate(env, H, k, ip, s(b.cft)); if (g) return g; } }
	if (a === 'wait') return out(await H.waitJoin({ email: s(b.email), ip })); // 第 46 项：名额满了，留邮箱排队
	if (a === 'code') return out(await H.mailCode({ email: s(b.email), kind: s(b.kind), ip }));
	const dev = { ua: uaLabel(req.headers.get('user-agent')), place: placeOf(req.cf) };
	// 6.0 第 71 项：App 里不输密码，只能授权（在浏览器里确认，或者用登录着的手机扫码）
	if (appStrict(req.headers.get('user-agent')) && ['register', 'login', 'login2', 'reset'].includes(a)) return J({ error: 'App 里不能输密码：点「用官网登录」，在浏览器里确认', app: true }, 403);
	if (a === 'app_start') return out(await H.appStart({ ip, dev }));
	if (a === 'app_poll') return out(await H.appPoll({ code: s(b.code), key: s(b.key), dev }));
	if (a === 'register') return out(await H.userRegister({ email: s(b.email), password: s(b.password), code: s(b.code), ip, dev, did }));
	if (a === 'login') return out(await H.userLogin({ email: s(b.email), password: s(b.password), ip, dev, did }));
	if (a === 'login2') return out(await H.userLogin2({ token: s(b.token), code: s(b.code), op: s(b.op), ip, dev, did }));
	if (a === 'reset') return out(await H.userReset({ email: s(b.email), code: s(b.code), password: s(b.password), dev, ip, did }));
	const sid = await sidFor(req, H);
	if (a === 'logout') { await H.userLogout(sid); const res = J({ ok: true }); res.headers.append('set-cookie', sidCookie('', 0)); res.headers.append('set-cookie', sidOld); return res; }
	// 官网各页右上角问「登录了没有」：没登录也回 200，免得每个访客的浏览器控制台里都有一条红色报错
	if (a === 'brief' && !sid) return J({ ok: false });
	const me = await H.who(sid);
	if (!me) return a === 'brief' ? J({ ok: false }) : J({ error: '请先登录', login: true }, 401);
	if (a === 'me') return J({ ok: true, ...(await H.me(me.uid)) });
	if (a === 'app_info') return out(await H.appInfo(me.uid, s(b.code)));
	if (a === 'app_ok') return out(await H.appOk(me.uid, s(b.code), b.ok === true, me.email));
	{ const fx = (await famAccount(a, H, me, b, sid)) || (await instAccount(a, H, me, b)) || (await edAccount(a, H, me, b, sid)) || (await compatAccount(a, H, me, b)) || (await ovAccount(a, H, me, b)); if (fx) return fx; }
	// 官网各页右上角：登录了就显示头像和名字（很轻，只要名字和头像）
	if (a === 'brief') return J({ ok: true, ...(await H.brief(me.uid)) });
	if (a === 'profile') return out(await H.setProfile(me.uid, { name: b.name === undefined ? undefined : s(b.name), avatar: b.avatar === undefined ? undefined : s(b.avatar), layout: b.layout === undefined ? undefined : b.layout }));
	if (a === 'fb') return out(await H.accountFb(me.uid, me.email));
	// 6.0 第 63 项：登录着的设备和完整邮箱只在「账号设置」里确认本人（邮箱验证码）后给
	if (a === 'sessions') { if (!(await H.webSudoOk(sid))) return J({ error: '要先确认是你本人（邮箱验证码）', sudo: true }, 403); const r = await H.sessions(me.uid, sid); if (r.st === 200) r.email = me.email; return out(r); }
	if (a === 'session_out') return out(await H.sessionOut(me.uid, sid, s(b.id)));
	if (a === 'sessions_out_others') return out(await H.sessionsOutOthers(me.uid, sid, did));
	if (a === 'bind') return out(await H.bind(me.uid, s(b.code), ip));
	if (a === 'unbind') return out(await H.unbind(me.uid, s(b.sub), { web: true, sudo: await H.webSudoOk(sid) }));
	if (a === 'rename') return out(await H.rename(me.uid, s(b.sub), s(b.alias)));
	if (a === 'logincode') return out(await H.loginCode(me.uid, s(b.sub)));
	if (a === 'renew') return out(await H.accountRenew(me.uid, me.email, s(b.sub), s(b.code)));
	if (a === 'trial') return out(await H.trial(me.uid, ip));
	// 名额满了：已登录的直接用账号邮箱排队
	if (a === 'wait_me') return out(await H.waitMe(me.uid, ip));
	if (a === 'apply') return out(await H.apply(me.uid, me.email, { sub: s(b.sub), source: s(b.source), contact: s(b.contact), note: s(b.note) }));
	if (a === 'link') return out(await H.addLink(me.uid, s(b.name), s(b.url)));
	if (a === 'unlink') return out(await H.delLink(me.uid, s(b.id)));
	if (a === 'password') return out(await H.userPassword(me.uid, sid, s(b.old), s(b.password), did));
	// 6.0 第 5 项：两步验证
	if (a === 'totp_setup') return out(await H.totpSetup(me.uid, sid));
	if (a === 'totp_on') return out(await H.totpOn(me.uid, sid, s(b.code), did));
	if (a === 'totp_off') return out(await H.totpOff(me.uid, s(b.code)));
	if (a === 'totp_rc') return out(await H.totpRc(me.uid, s(b.code)));
	if (a === 'delete') { const r = await H.delAccount(me.uid, s(b.password), s(b.code)); const res = out(r); if (r.st === 200) { res.headers.append('set-cookie', sidCookie('', 0)); res.headers.append('set-cookie', sidOld); } return res; }
	return J({ error: 'not found' }, 404);
}
export { dayKey } from './ops.js';
export async function hubScheduled(env) { const H = hubObj(env); await H.cleanup(); try { const t = await H.meta('prerelAt'); if (!t || Date.now() - t > 3600e3) { await H.setMeta('prerelAt', Date.now()); await prereleaseRefresh(env, H, repoOf(env)); } } catch (e) {} try { await H.instSweep(); } catch (e) {} try { await filesScheduled(env, H); } catch (e) {} await H.gcRate(Date.now()); try { await H.opsGc(); } catch (e) {} await v5Scheduled(H); await statusScheduled(H); try { await ovScheduled(H, await routerVerInfo(env)); } catch (e) {} }
installOps(Hub);
installTotp(Hub);
installCompat(Hub);
installOldVer(Hub);
installV5(Hub);
installFam(Hub);
installInst(Hub);
installEdition(Hub, { edToTunnel, edToLocal });
installXpage(Hub, { cf, host });
installMove(Hub);
installAppAuth(Hub, { rnd, safeEq });
installFiles(Hub);
installHelp(Hub);
export { hubObj };

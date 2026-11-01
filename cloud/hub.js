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
import { HOME, APP, ADMIN } from './site.js';

export const SUB_RE = /^[a-z2-9]{8}$/;
const ABC = 'abcdefghijkmnpqrstuvwxyz23456789'; // 32 个字符，去掉了容易看错的 l、o、0、1
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
const ymd = (t) => new Date(t + 8 * 3600e3).toISOString().slice(0, 10); // 按北京 / 台北时间显示日期
export const LIMITS = { perIpHour: 5, allHour: 60, idleDays: 90, pendingMs: 3600e3 };

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
		e.status = r.status;
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
		made.dns = await dnsAdd(env, sub, t.id);
		made.token = t.token || (await cf(env, 'GET', `/accounts/${acc}/cfd_tunnel/${t.id}/token`));
		return made;
	} catch (e) {
		await deprovision(env, made).catch(() => {});
		throw e;
	}
}
export async function deprovision(env, { tunnel, dns }) {
	await dnsDel(env, dns);
	if (tunnel) {
		const acc = env.CF_ACCOUNT_ID;
		try { await cf(env, 'DELETE', `/accounts/${acc}/cfd_tunnel/${tunnel}/connections`); } catch (e) {}
		try { await cf(env, 'DELETE', `/accounts/${acc}/cfd_tunnel/${tunnel}`); } catch (e) { if (e.status !== 404) throw e; }
	}
}

/* ---------- 账号用的小工具 ---------- */
const SESSION_DAYS = 30;
const te = new TextEncoder();
export function normEmail(e) { e = String(e || '').trim().toLowerCase(); return e.length <= 120 && /^[^\s@]+@[^\s@]+\.[a-z0-9-]{2,}$/.test(e) ? e : ''; }
export function pwError(p) { if (typeof p !== 'string' || p.length < 8) return '密码至少 8 位'; if (p.length > 128) return '密码太长了'; if (/^\d+$/.test(p) || /^(.)\1+$/.test(p)) return '密码太简单了，加点字母或符号'; return ''; }
export const maskEmail = (e) => { const [a, b] = String(e).split('@'); return (a.length <= 2 ? a[0] + '*' : a.slice(0, 2) + '***') + '@' + b; };
async function pwHash(pw, salt) {
	const k = await crypto.subtle.importKey('raw', te.encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
	const b = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: te.encode(salt), iterations: 100000 }, k, 256);
	return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function sendMail(env, to, subject, html) {
	try {
		const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.MAIL_FROM || 'noreply@' + env.BASE_DOMAIN, to: [to], subject, html }) });
		return r.ok;
	} catch (e) { return false; }
}

/* ---------- 开通中心（全局只有一个，所有登记都在这里排队处理） ---------- */
export class Hub extends DurableObject {
	// 开通、删除、封禁一件一件排队做（建隧道要等网络，不排队的话两个人可能同时抢到最后一个名额）
	lock(fn) { const run = (this.q || Promise.resolve()).then(fn, fn); this.q = run.catch(() => {}); return run; }
	watch(sub) { return this.env.W.get(this.env.W.idFromName('dev:' + sub)); }
	max() { return Math.max(1, Math.min(1000, +this.env.MAX_DEVICES || 1000)); }
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
	async _register({ invite, ip, name, model }) {
		const now = Date.now();
		const code = String(invite || '').trim().toUpperCase();
		const inv = code && (await this.ctx.storage.get('i:' + code));
		if (!inv || inv.off) return { st: 403, error: '邀请码不对' };
		if (inv.exp && now > inv.exp) return { st: 403, error: '邀请码已经过期' };
		if (inv.used >= inv.max) return { st: 403, error: '邀请码已经用完了' };
		if ((await this.count()) >= this.max()) return { st: 403, error: '名额已满，暂时不能开通' };
		if (!(await this.rate(ip || '?', now))) return { st: 429, error: '开通太频繁了，请一小时后再试' };
		let sub;
		do { sub = rnd(8); } while (await this.ctx.storage.get('d:' + sub));
		// 先占名额、记下邀请码用了一次，再去建隧道（建隧道要等网络，期间别的请求可能插进来）
		inv.used++;
		await this.ctx.storage.put({ ['i:' + code]: inv, ['d:' + sub]: { sub, state: 'pending', created: now, invite: code } });
		await this.addCount(1);
		let made;
		try {
			made = await provision(this.env, sub);
		} catch (e) {
			const cur = await this.ctx.storage.get('i:' + code);
			if (cur) { cur.used = Math.max(0, cur.used - 1); await this.ctx.storage.put('i:' + code, cur); }
			await this.ctx.storage.delete('d:' + sub);
			await this.addCount(-1);
			return { st: 502, error: '开通失败：' + e.message };
		}
		const keys = { rkey: rnd(32), tkey: rnd(32), pkey: rnd(32) };
		const h = host(this.env, sub);
		await this.watch(sub).setup({ sub, ...keys, probe: 'https://' + h + '/panel/manifest.json' });
		// 试用码：开通后只能用 svc 天，到期前找提供服务的人要续期码；普通邀请码不限期
		const exp = +inv.svc > 0 ? now + inv.svc * DAY : 0;
		await this.ctx.storage.put('d:' + sub, { sub, state: 'ok', created: now, seen: now, invite: code, name: clean(name, 40), model: clean(model, 60), tunnel: made.tunnel, dns: made.dns, exp });
		return { st: 200, sub, host: h, token: made.token, url: 'https://' + h + '/cloud', exp, ...keys };
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
		return true;
	}
	unregister(a) { return this.lock(() => this._unregister(a)); }
	async _unregister({ sub, rkey }) {
		if (!SUB_RE.test(sub || '')) return { st: 404, error: '没有这台路由器' };
		const c = await this.watch(sub).getCfg();
		if (!c || !safeEq(rkey, c.rkey)) return { st: 403, error: '钥匙不对' };
		await this._remove(sub);
		return { st: 200, ok: true };
	}
	async seen(sub, t) {
		const d = await this.ctx.storage.get('d:' + sub);
		if (d) { d.seen = t; await this.ctx.storage.put('d:' + sub, d); }
	}
	// 封禁：删掉子域名（网址立刻打不开）、云端功能拒绝；解封：重新加回子域名
	setOff(sub, off) { return this.lock(() => this._setOff(sub, off)); }
	// why：'exp' = 到期自动暂停（续期后自动恢复）；不写 = 管理员封禁（续期也不会解封）
	async _setOff(sub, off, why) {
		const d = await this.ctx.storage.get('d:' + sub);
		if (!d || d.state !== 'ok') return false;
		if (off && !d.off) { await dnsDel(this.env, d.dns); d.dns = null; d.off = Date.now(); d.offWhy = why || 'admin'; }
		else if (off && d.off && !why) d.offWhy = 'admin'; // 到期暂停的，管理员又封禁了：续期也不解封
		if (!off && d.off) { d.dns = await dnsAdd(this.env, sub, d.tunnel); delete d.off; delete d.offWhy; }
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
		return u ? { uid: u.uid, email: u.email } : null;
	}
	async newSession(u) {
		const sid = rnd(32), now = Date.now();
		await this.ctx.storage.put('s:' + sid, { uid: u.uid, exp: now + SESSION_DAYS * DAY });
		u.sids = [...(u.sids || []), sid].slice(-20);
		await this.ctx.storage.put('u:' + u.uid, u);
		return sid;
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
		const has = await this.ctx.storage.get('e:' + email);
		if (kind === 'reg' && has) return { st: 409, error: '这个邮箱已经注册过，直接登录就行' };
		if (kind === 'reset' && !has) return { st: 200, ok: true }; // 不告诉别人这个邮箱有没有注册
		if (!(await this.hit('m1:' + email, 1, 60e3))) return { st: 429, error: '发得太快了，1 分钟后再试' };
		if (!(await this.hit('md:' + email, 10, DAY)) || !(await this.hit('mi:' + ip, 20, 3600e3))) return { st: 429, error: '今天发的验证码太多了，明天再试' };
		const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
		await this.ctx.storage.put('c:' + kind + ':' + email, { code, exp: Date.now() + 600e3, tries: 0 });
		const what = kind === 'reg' ? '注册账号' : '重置密码';
		const sent = await sendMail(this.env, email, `验证码 ${code}（${what}）`, `<p>你正在${what}，验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>10 分钟内有效。如果不是你本人操作，忽略这封邮件就行。</p>`);
		if (!sent) return { st: 502, error: '邮件没发出去，稍后再试' };
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
	async _registerUser({ email, password, code, ip }) {
		email = normEmail(email);
		if (!email) return { st: 400, error: '邮箱格式不对' };
		const pe = pwError(password); if (pe) return { st: 400, error: pe };
		if (await this.ctx.storage.get('e:' + email)) return { st: 409, error: '这个邮箱已经注册过，直接登录就行' };
		if (!(await this.hit('ri:' + ip, 10, 3600e3))) return { st: 429, error: '注册太频繁了，一小时后再试' };
		if (this.env.RESEND_API_KEY && !(await this.useCode(email, 'reg', code))) return { st: 400, error: '验证码不对或已过期' };
		const uid = rnd(12), salt = rnd(16);
		const u = { uid, email, salt, pw: await pwHash(password, salt), created: Date.now(), devs: [], sids: [], verified: !!this.env.RESEND_API_KEY };
		await this.ctx.storage.put({ ['u:' + uid]: u, ['e:' + email]: uid });
		return { st: 200, sid: await this.newSession(u) };
	}
	async userLogin({ email, password, ip }) {
		email = normEmail(email);
		if (!email || typeof password !== 'string') return { st: 400, error: '邮箱或密码不对' };
		if (!(await this.hit('li:' + ip, 30, 900e3))) return { st: 429, error: '尝试太多次了，15 分钟后再试' };
		const fk = 'lf:' + email, f = ((await this.ctx.storage.get('r:' + fk)) || []).filter((t) => t > Date.now() - 900e3);
		if (f.length >= 10) return { st: 429, error: '这个账号密码错了太多次，15 分钟后再试' };
		const uid = await this.ctx.storage.get('e:' + email), u = uid && (await this.ctx.storage.get('u:' + uid));
		const h = await pwHash(password, u ? u.salt : 'x'.repeat(16)); // 账号不存在也算一遍，别让人从响应时间看出来
		if (!u || !safeEq(h, u.pw)) { await this.hit(fk, 10, 900e3); return { st: 401, error: '邮箱或密码不对' }; }
		return { st: 200, sid: await this.newSession(u) };
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
			devs.push({ sub: x.sub, host: host(this.env, x.sub), name: x.alias || d.name || x.sub, model: d.model || '', off: !!d.off, last: b.last, state: b.state, ver: b.ver || '', bound: x.at, exp: d.exp || 0, expired: !!(d.off && d.offWhy === 'exp'), apply: await this.applyBrief(x.sub, uid) });
		}
		const links = (u.links || []).map((x) => ({ id: x.id, url: x.url, name: x.name, at: x.at }));
		return { email: u.email, created: u.created, verified: !!u.verified, devs, links, mail: !!this.env.RESEND_API_KEY };
	}
	// 路由器那边（凭 RKEY）要一个配对码，用户在官网输入配对码，就把这台路由器加到自己账号里
	async pairStart({ sub, rkey }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		if (!(await this.hit('ps:' + sub, 20, 3600e3))) return { st: 429, error: '太频繁了，稍后再试' };
		const code = rnd(8).toUpperCase();
		await this.ctx.storage.put('p:' + code, { sub, exp: Date.now() + 600e3 });
		return { st: 200, code, exp: Date.now() + 600e3 };
	}
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
			if ((u.devs || []).length >= 20) return { st: 400, error: '一个账号最多绑定 20 台路由器' };
			if ((d.users || []).length >= 20) return { st: 400, error: '这台路由器绑定的账号太多了（最多 20 个）' };
			u.devs = [...(u.devs || []), { sub: p.sub, at: Date.now() }];
			d.users = [...(d.users || []), uid];
			await this.ctx.storage.put({ ['u:' + uid]: u, ['d:' + p.sub]: d });
		}
		return { st: 200, ok: true, sub: p.sub, name: d.name || p.sub };
	}
	unbind(uid, sub) { return this.lock(() => this._unbind(uid, sub)); }
	async _unbind(uid, sub) {
		const u = await this.ctx.storage.get('u:' + uid), d = await this.ctx.storage.get('d:' + sub);
		if (u) { u.devs = (u.devs || []).filter((x) => x.sub !== sub); await this.ctx.storage.put('u:' + uid, u); }
		if (d) { d.users = (d.users || []).filter((x) => x !== uid); await this.ctx.storage.put('d:' + sub, d); }
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
	async userPassword(uid, sid, old, pw) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return { st: 401, error: '请先登录' };
		if (!safeEq(await pwHash(String(old || ''), u.salt), u.pw)) return { st: 403, error: '原密码不对' };
		const pe = pwError(pw); if (pe) return { st: 400, error: pe };
		u.salt = rnd(16); u.pw = await pwHash(pw, u.salt);
		await this.dropSessions(u, sid); // 其他设备上的登录全部退出
		await this.ctx.storage.put('u:' + uid, u);
		return { st: 200, ok: true };
	}
	async userReset({ email, code, password }) {
		email = normEmail(email);
		const uid = email && (await this.ctx.storage.get('e:' + email)), u = uid && (await this.ctx.storage.get('u:' + uid));
		if (!u || !(await this.useCode(email, 'reset', code))) return { st: 400, error: '验证码不对或已过期' };
		const pe = pwError(password); if (pe) return { st: 400, error: pe };
		u.salt = rnd(16); u.pw = await pwHash(password, u.salt); u.verified = true;
		await this.dropSessions(u, null);
		await this.ctx.storage.put('u:' + uid, u);
		return { st: 200, sid: await this.newSession(u) };
	}
	delAccount(uid, password) { return this.lock(() => this._delAccount(uid, password)); }
	async _delAccount(uid, password) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return { st: 401, error: '请先登录' };
		if (!safeEq(await pwHash(String(password || ''), u.salt), u.pw)) return { st: 403, error: '密码不对' };
		for (const x of u.devs || []) { const d = await this.ctx.storage.get('d:' + x.sub); if (d) { d.users = (d.users || []).filter((y) => y !== uid); await this.ctx.storage.put('d:' + x.sub, d); } }
		await this.dropSessions(u, null);
		await this.ctx.storage.delete(['u:' + uid, 'e:' + u.email]);
		return { st: 200, ok: true };
	}
	// 路由器面板里看「哪些账号绑定了我」、移除某个账号（凭 RKEY）
	async devAccounts({ sub, rkey }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		const d = await this.ctx.storage.get('d:' + sub), list = [];
		for (const uid of (d && d.users) || []) { const u = await this.ctx.storage.get('u:' + uid); if (u) list.push({ uid, email: maskEmail(u.email), at: ((u.devs || []).find((x) => x.sub === sub) || {}).at || 0 }); }
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
		if (!(await this.hit('lv:' + sub, 30, 3600e3))) return { st: 429, error: '输错太多次了，一小时后再试' };
		code = String(code || '').trim().toUpperCase().replace(/[^A-Z2-9]/g, '');
		const k = 'l:' + sub + ':' + code, x = code.length === 8 ? await this.ctx.storage.get(k) : null;
		if (!x || x.exp < Date.now()) return { st: 400, error: '登录码不对或已过期（10 分钟有效）。在官网账号页这台路由器下面点「获取登录码」重新拿一个' };
		await this.ctx.storage.delete(k);
		const u = await this.ctx.storage.get('u:' + x.uid);
		if (!u || !(u.devs || []).some((y) => y.sub === sub)) return { st: 400, error: '拿这个登录码的账号已经解绑了这台路由器' };
		return { st: 200, ok: true, email: maskEmail(u.email) };
	}
	// 杂项小数据（比如最后一次查到的最新版本）
	async meta(k) { return (await this.ctx.storage.get('m:' + k)) || null; }
	async setMeta(k, v) { const old = await this.ctx.storage.get('m:' + k); if (JSON.stringify(old) !== JSON.stringify(v)) await this.ctx.storage.put('m:' + k, v); }
	async devices() { return [...(await this.ctx.storage.list({ prefix: 'd:' })).values()]; }
	async invites() { return [...(await this.ctx.storage.list({ prefix: 'i:' })).entries()].map(([k, v]) => ({ code: k.slice(2), ...v })); }
	async addInvite({ max, days, note, svc }) {
		let code;
		do { code = rnd(10).toUpperCase(); } while (await this.ctx.storage.get('i:' + code));
		const inv = { max: Math.max(1, Math.min(1000, +max || 1)), used: 0, created: Date.now(), exp: +days > 0 ? Date.now() + days * DAY : 0, note: clean(note, 60), svc: Math.max(0, Math.min(3650, Math.round(+svc || 0))) };
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
		return { st: 200, ok: true, at: ap.at };
	}
	async applications() { return [...(await this.ctx.storage.list({ prefix: 'ap:' })).values()].concat((await this.ctx.storage.get('aplog')) || []); }
	decide(sub, ok, a) { return this.lock(() => this._decide(sub, ok, a)); }
	async _decide(sub, ok, { days, reason }) {
		const ap = await this.ctx.storage.get('ap:' + sub), d = await this.ctx.storage.get('d:' + sub);
		if (!ap || ap.status !== 'pending') return { st: 404, error: '没有待审核的申请' };
		ap.status = ok ? 'ok' : 'no'; ap.decided = Date.now(); ap.reason = String(reason || '').trim().slice(0, 200);
		if (ok) {
			if (!d || d.state !== 'ok') return { st: 404, error: '这台路由器已经不在了' };
			ap.days = Math.max(1, Math.min(3650, Math.round(+days || 90)));
			ap.newExp = await this._grant(d, ap.days, '续期申请通过了');
		} else if (d) {
			try { await this.watch(sub).push({ title: '续期申请没有通过', body: ap.reason || '可以联系提供服务的人问问原因。', tag: 'svc', lvl: 'warn' }); } catch (e) {}
		}
		await this.ctx.storage.put('ap:' + sub, ap);
		// 审核过的另外留一份记录（最近 200 条），以后再申请时 ap:sub 会被新申请覆盖
		const log = (await this.ctx.storage.get('aplog')) || [];
		log.unshift({ ...ap, logged: true });
		await this.ctx.storage.put('aplog', log.slice(0, 200));
		return { st: 200, ok: true, exp: ap.newExp || null };
	}
	async applyBrief(sub, uid) {
		const ap = await this.ctx.storage.get('ap:' + sub);
		return ap && ap.uid === uid ? { status: ap.status, at: ap.at, decided: ap.decided || 0, reason: ap.reason || '', days: ap.days || 0 } : null;
	}
	// 有新申请时发邮件给管理员（设置了 ADMIN_EMAIL 和邮件服务才发）
	async notifyAdmin(subject, text) {
		if (!this.env.ADMIN_EMAIL || !this.env.RESEND_API_KEY) return;
		const html = String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]).replace(/\n/g, '<br>');
		try { await sendMail(this.env, this.env.ADMIN_EMAIL, subject, html); } catch (e) {}
	}
	async accountRenew(uid, email, sub, code) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u || !(u.devs || []).some((x) => x.sub === sub)) return { st: 404, error: '你的账号里没有这台路由器' };
		return this.renew(sub, code, maskEmail(email));
	}
	// 路由器那边（凭 RKEY）看自己的到期时间
	async devInfo({ sub, rkey }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		const d = await this.ctx.storage.get('d:' + sub);
		return { st: 200, exp: (d && d.exp) || 0, off: !!(d && d.off), offWhy: (d && d.offWhy) || null };
	}
	async devRenew({ sub, rkey, code }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		return this.renew(sub, code, '路由器');
	}
	async stats() { return { count: await this.count(), max: this.max() }; }
	// 每天清理：90 天没上线的回收；开通到一半卡住超过 1 小时的也清掉
	cleanup(now) { return this.lock(() => this._cleanup(now || Date.now())); }
	async _cleanup(now) {
		const out = [];
		for (const d of await this.devices()) {
			const stale = d.state === 'ok' ? now - (d.seen || d.created) > LIMITS.idleDays * DAY : now - d.created > LIMITS.pendingMs;
			if (!stale) continue;
			try {
				if (d.state === 'ok') await this._remove(d.sub);
				else { await this.ctx.storage.delete('d:' + d.sub); await this.addCount(-1); }
				out.push(d.sub);
			} catch (e) {}
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
					await this._remove(d.sub); out.push(d.sub);
				}
			} catch (e) {}
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
const hubObj = (env) => env.H.get(env.H.idFromName('hub'));
export async function hubFetch(req, env) {
	const u = new URL(req.url), p = u.pathname;
	const body = async () => { try { return await req.json(); } catch (e) { return {}; } };
	const H = hubObj(env);
	if (p === '/api/ping') return J({ ok: true, ...(await H.stats()), mail: !!env.RESEND_API_KEY });
	if (p === '/api/register' && req.method === 'POST') {
		const b = await body();
		const r = await H.register({ invite: b.invite, name: b.name, model: b.model, ip: req.headers.get('cf-connecting-ip') || '' });
		const { st, ...rest } = r;
		return J(rest, st);
	}
	if (p === '/api/unregister' && req.method === 'POST') {
		const b = await body();
		const { st, ...rest } = await H.unregister({ sub: String(b.sub || ''), rkey: String(b.rkey || '') });
		return J(rest, st);
	}
	if (p.startsWith('/api/admin/')) {
		const k = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
		if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 16 || !safeEq(k, env.ADMIN_KEY)) return J({ error: '需要管理员密钥' }, 401);
		const a = p.slice('/api/admin/'.length).split('/');
		if (a[0] === 'devices' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.devices(), ...(await H.stats()) });
		if (a[0] === 'devices' && SUB_RE.test(a[1] || '') && req.method === 'POST') {
			const op = a[2];
			if (op === 'off' || op === 'on') return J({ ok: await H.setOff(a[1], op === 'off') });
			if (op === 'delete') return J({ ok: await H.remove(a[1]) });
		}
		if (a[0] === 'invites' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.invites() });
		if (a[0] === 'invites' && !a[1] && req.method === 'POST') return J({ ok: true, invite: await H.addInvite(await body()) });
		if (a[0] === 'invites' && a[1] && req.method === 'DELETE') return J({ ok: await H.delInvite(a[1]) });
		if (a[0] === 'renewals' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.renewals() });
		if (a[0] === 'renewals' && !a[1] && req.method === 'POST') return J({ ok: true, list: await H.addRenewals(await body()) });
		if (a[0] === 'renewals' && a[1] && req.method === 'DELETE') return J({ ok: await H.delRenewal(a[1]) });
		if (a[0] === 'applications' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.applications() });
		if (a[0] === 'applications' && SUB_RE.test(a[1] || '') && (a[2] === 'approve' || a[2] === 'reject') && req.method === 'POST') { const r = await H.decide(a[1], a[2] === 'approve', await body()); return J(r.st === 200 ? r : { error: r.error }, r.st); }
		if (a[0] === 'cleanup' && req.method === 'POST') return J({ ok: true, removed: await H.cleanup() });
		return J({ error: 'not found' }, 404);
	}
	if (p.startsWith('/api/account/') || p === '/api/pair/start' || p.startsWith('/api/dev/')) return accountApi(req, env, H, p, body);
	if (p === '/api/app/version') return appVersion(env);
	if (p === '/app/router-panel.apk' && req.method === 'GET') return appApk(env);
	if (p.startsWith('/dl/') && (req.method === 'GET' || req.method === 'HEAD')) return dlFile(env, p.slice(4));
	const pg = { '/': HOME, '/index.html': HOME, '/app': APP, '/admin': ADMIN }[p];
	if (pg && req.method === 'GET') return new Response(pg, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" } });
	return J({ error: 'not found' }, 404);
}

/* ---------- 安卓 App：最新版本号和安装包（从 GitHub Release 转过来，走自己的域名，大陆也能下） ---------- */
const repoOf = (env) => env.GITHUB_REPO || 'wznwzn123/openwrt-claude-panel';
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
			const mv = /最低版本[:：]\s*v?(\d+(?:\.\d+){0,2})/.exec(x.body);
			const o = { version: x.tag.replace(/^v/, ''), notes: notesOf(x.body), apk: '/app/router-panel.apk', at: x.at, force: x.body.includes('【必须更新】'), min: mv ? mv[1] : '' };
			try { await hubObj(env).setMeta('appver', o); } catch (e) {}
			return o;
		});
		return v ? out({ ok: true, ...v }, 200) : out({ ok: false, error: '还没有发布安卓 App' }, 404);
	} catch (e) { return out({ ok: false, error: '检查更新失败' }, 502); }
}
async function appApk(env) {
	const r = await fetch('https://github.com/' + repoOf(env) + '/releases/latest/download/router-panel.apk', { redirect: 'follow', headers: { 'user-agent': 'router-panel-hub' } });
	if (!r.ok) return J({ error: '还没有发布安卓 App' }, 404);
	return new Response(r.body, { headers: { 'content-type': 'application/vnd.android.package-archive', 'content-disposition': 'attachment; filename="router-panel.apk"', 'cache-control': 'public, max-age=600' } });
}

// 安装包也从官网下载（从 GitHub 最新发布转过来）：大陆的路由器直连 GitHub 常常很慢或者下不动
export const DL_RE = /^(openwrt-claude-panel-(?:(?:ai|noai)-(?:lite|full)|hosted-(?:ai|noai))\.tar\.gz|SHA256SUMS)$/;
async function dlFile(env, name) {
	if (!DL_RE.test(name)) return J({ error: '没有这个文件' }, 404);
	const r = await fetch('https://github.com/' + repoOf(env) + '/releases/latest/download/' + name, { redirect: 'follow', headers: { 'user-agent': 'router-panel-hub' } });
	if (!r.ok) return J({ error: '还没有发布这个安装包' }, 404);
	const gz = name.endsWith('.gz');
	return new Response(r.body, { headers: { 'content-type': gz ? 'application/gzip' : 'text/plain; charset=utf-8', 'content-disposition': 'attachment; filename="' + name + '"', 'cache-control': 'public, max-age=600' } });
}

/* ---------- 账号接口（官网）和路由器配对接口 ---------- */
const getSid = (req) => (/(?:^|;\s*)sid=([a-z2-9]{32})(?:;|$)/.exec(req.headers.get('cookie') || '') || [])[1] || '';
const sidCookie = (sid, age) => `sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
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
	const out = (r) => { const { st, sid, ...rest } = r; const res = J(sid ? { ok: true, ...rest } : rest, st); if (sid) res.headers.append('set-cookie', sidCookie(sid, 30 * 86400)); return res; };
	if (!post && p !== '/api/account/me') return J({ error: 'method not allowed' }, 405);
	// 路由器那边（凭 RKEY）
	if (p === '/api/pair/start') return out(await H.pairStart({ sub: s(b.sub), rkey: s(b.rkey) }));
	if (p === '/api/dev/accounts') return out(await H.devAccounts({ sub: s(b.sub), rkey: s(b.rkey) }));
	if (p === '/api/dev/unbind') return out(await H.devUnbind({ sub: s(b.sub), rkey: s(b.rkey), uid: s(b.uid) }));
	if (p === '/api/dev/logincode') return out(await H.devLoginCode({ sub: s(b.sub), rkey: s(b.rkey), code: s(b.code) }));
	if (p === '/api/dev/info') return out(await H.devInfo({ sub: s(b.sub), rkey: s(b.rkey) }));
	if (p === '/api/dev/renew') return out(await H.devRenew({ sub: s(b.sub), rkey: s(b.rkey), code: s(b.code) }));
	const a = p.slice('/api/account/'.length);
	if (a === 'code') return out(await H.mailCode({ email: s(b.email), kind: s(b.kind), ip }));
	if (a === 'register') return out(await H.userRegister({ email: s(b.email), password: s(b.password), code: s(b.code), ip }));
	if (a === 'login') return out(await H.userLogin({ email: s(b.email), password: s(b.password), ip }));
	if (a === 'reset') return out(await H.userReset({ email: s(b.email), code: s(b.code), password: s(b.password) }));
	const sid = getSid(req);
	if (a === 'logout') { await H.userLogout(sid); const res = J({ ok: true }); res.headers.append('set-cookie', sidCookie('', 0)); return res; }
	const me = await H.who(sid);
	if (!me) return J({ error: '请先登录', login: true }, 401);
	if (a === 'me') return J({ ok: true, ...(await H.me(me.uid)) });
	if (a === 'bind') return out(await H.bind(me.uid, s(b.code), ip));
	if (a === 'unbind') return out(await H.unbind(me.uid, s(b.sub)));
	if (a === 'rename') return out(await H.rename(me.uid, s(b.sub), s(b.alias)));
	if (a === 'logincode') return out(await H.loginCode(me.uid, s(b.sub)));
	if (a === 'renew') return out(await H.accountRenew(me.uid, me.email, s(b.sub), s(b.code)));
	if (a === 'apply') return out(await H.apply(me.uid, me.email, { sub: s(b.sub), source: s(b.source), contact: s(b.contact), note: s(b.note) }));
	if (a === 'link') return out(await H.addLink(me.uid, s(b.name), s(b.url)));
	if (a === 'unlink') return out(await H.delLink(me.uid, s(b.id)));
	if (a === 'password') return out(await H.userPassword(me.uid, sid, s(b.old), s(b.password)));
	if (a === 'delete') { const r = await H.delAccount(me.uid, s(b.password)); const res = out(r); if (r.st === 200) res.headers.append('set-cookie', sidCookie('', 0)); return res; }
	return J({ error: 'not found' }, 404);
}
export async function hubScheduled(env) { await hubObj(env).cleanup(); }

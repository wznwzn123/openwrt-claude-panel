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
import { HOME, APP, ADMIN, PRIVACY, SECURITY } from './site.js';

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
// 子域名名额满了（Cloudflare 免费版每个域名的 DNS 记录有上限：2024-09 以后加的域名 200 条，以前的 1000 条）
export const dnsFull = (e) => !!(e && e.dnsStep && ((e.codes || []).includes(81045) || /quota|limit|exceed/i.test(e.message || '')));
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
		// 上次开通时 Cloudflare 的子域名名额满了：一天内、路由器数量没减少之前直接说名额已满，不再去建隧道（过一天再试一次，升级了套餐也能自己恢复）
		const full = await this.ctx.storage.get('dnsfull');
		if (full && now - full.at < DAY && (await this.count()) >= full.count) return { st: 403, error: '名额已满，暂时不能开通' };
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
			if (dnsFull(e)) {
				const n = await this.count();
				await this.ctx.storage.put('dnsfull', { count: n, at: now });
				await this.alog('dnsfull', '', `Cloudflare 子域名名额满了（现在 ${n} 台路由器），新的开通会提示名额已满`, 'system');
				await this.notifyAdmin('托管名额满了', `开通新路由器时 Cloudflare 提示子域名（DNS 记录）名额用完了，现在有 ${n} 台路由器。\n\n新用户会看到「名额已满，暂时不能开通」。删掉不用的路由器、或者升级 Cloudflare 套餐后就能继续开通。\n\nCloudflare 原话：${e.message}\n\n管理页：https://${this.env.BASE_DOMAIN}/admin`);
				return { st: 403, error: '名额已满，暂时不能开通' };
			}
			return { st: 502, error: '开通失败：' + e.message };
		}
		if (full) await this.ctx.storage.delete('dnsfull');
		const keys = { rkey: rnd(32), tkey: rnd(32), pkey: rnd(32) };
		const h = host(this.env, sub);
		await this.watch(sub).setup({ sub, ...keys, probe: 'https://' + h + '/panel/manifest.json' });
		// 试用码：开通后只能用 svc 天，到期前找提供服务的人要续期码；普通邀请码不限期
		const exp = +inv.svc > 0 ? now + inv.svc * DAY : 0;
		const dv = { sub, state: 'ok', created: now, seen: now, invite: code, name: clean(name, 40), model: clean(model, 60), tunnel: made.tunnel, dns: made.dns, exp };
		// 官网账号领的试用码：开通后直接加到这个账号里，不用再配对
		let bound = false;
		if (inv.uid) {
			const u = await this.ctx.storage.get('u:' + inv.uid);
			if (u && !(u.devs || []).some((x) => x.sub === sub)) { u.devs = [...(u.devs || []), { sub, at: now }]; dv.users = [inv.uid]; await this.ctx.storage.put('u:' + inv.uid, u); bound = true; }
			if (u) { u.trial = { ...(u.trial || {}), used: now, sub }; await this.ctx.storage.put('u:' + inv.uid, u); }
		}
		await this.ctx.storage.put('d:' + sub, dv);
		if (inv.uid) await this.alog('trial-used', sub, '用官网领的试用码开通' + (bound ? '，已自动加到账号里' : ''), 'router');
		return { st: 200, sub, host: h, token: made.token, url: 'https://' + h + '/cloud', exp, bound, ...keys };
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
		const d0 = await this.ctx.storage.get('d:' + sub);
		await this._remove(sub);
		await this.alog('unregister', sub, '路由器上运行了卸载，网址自动交还' + (d0 && d0.name ? '（' + d0.name + '）' : ''), 'router');
		return { st: 200, ok: true };
	}
	async seen(sub, t) {
		const d = await this.ctx.storage.get('d:' + sub);
		if (d) { d.seen = t; await this.ctx.storage.put('d:' + sub, d); }
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
			out.push({ uid: u.uid, email: u.email, created: u.created, verified: !!u.verified, lastAt: u.lastAt || 0, admin: !!ae && u.email === ae,
				devs: (u.devs || []).map((x) => ({ sub: x.sub, name: x.alias || devs.get(x.sub)?.name || x.sub, gone: !devs.has(x.sub) })), links: (u.links || []).length });
		}
		for (const [k, u] of await this.ctx.storage.list({ prefix: 'xu:' }))
			out.push({ uid: u.uid, email: u.email, created: u.created, lastAt: u.lastAt || 0, delAt: u.delAt, delWhy: u.delWhy || 'admin', purgeAt: u.delAt + TRASH_DAYS * DAY, deleted: true,
				devs: (u.devs || []).map((x) => ({ sub: x.sub, name: x.alias || devs.get(x.sub)?.name || x.sub, gone: !devs.has(x.sub) })) });
		return out;
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
		await this.ctx.storage.delete(['xu:' + uid, 'xe:' + u.email]);
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
		const vers = await Promise.all(list.map(async (d) => { if (d.state !== 'ok') return ''; try { return String((await this.watch(d.sub).brief()).ver || '').replace(/^v/, ''); } catch (e) { return ''; } }));
		for (const [i, d] of list.entries()) out.push({ ...d, ver: vers[i], prot: await this.isProtected(d), renewed: !!d.grants || rs.has(d.sub), purgeAt: d.offWhy === 'deleted' && d.delAt ? d.delAt + TRASH_DAYS * DAY : 0 });
		return out;
	}
	// 发邮件给绑定了这台路由器的账号：停用（可恢复）/ 恢复了 / 彻底删除（附重新开通的方法）
	async mailOwners(d, kind) {
		if (!d || !this.env.RESEND_API_KEY) return false;
		const e = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
		const name = e(d.name || d.sub), site = 'https://' + this.env.BASE_DOMAIN;
		const cmd = 'cd /tmp && wget -O p.tar.gz ' + site + '/dl/openwrt-claude-panel-hosted-ai.tar.gz && tar xzf p.tar.gz && cd openwrt-claude-panel && sh install.sh --invite 新邀请码';
		const T = {
			trash: ['路由器「' + (d.name || d.sub) + '」的托管服务已被停用', `<p>你好，</p><p>你的路由器「${name}」的托管服务已被提供服务的人停用：专属网址暂时打不开，推送和云端备份也暂停了。<b>家里上网和路由器上的设置都不受影响。</b></p><p><b>${ymd((d.delAt || Date.now()) + TRASH_DAYS * DAY)} 前</b>联系提供服务的人可以恢复，恢复以后什么都不用做，原来的网址、登录过的手机都照常能用。</p><p>超过这个日期没恢复的话会被彻底删除，到时候可以用新的邀请码重新开通（设置会保留）。</p>`],
			restore: ['路由器「' + (d.name || d.sub) + '」的托管服务恢复了', `<p>你好，</p><p>你的路由器「${name}」的托管服务已经恢复${d.off ? '（不过它已经到期了，要续期以后才能用：在官网账号页这台路由器下面「申请续期」）' : '，专属网址可以正常打开了，什么都不用做'}。</p><p>官网：<a href="${site}/app">${site}/app</a></p>`],
			purge: ['路由器「' + (d.name || d.sub) + '」的托管服务已被删除', `<p>你好，</p><p>你的路由器「${name}」的托管服务已被删除，原来的专属网址不能再用了。<b>家里上网和路由器上的设置都不受影响。</b></p><p><b>想继续用，这样重新开通（设置都会保留）：</b></p><ol><li>找提供服务的人要一个新的邀请码</li><li>手机连上家里 Wi-Fi，打开路由器后台「服务 → 终端」，用 root 登录</li><li>粘贴下面的命令，把最后的「新邀请码」换成你拿到的邀请码，回车：<br><code style="word-break:break-all">${e(cmd)}</code><br>（纯面板版把命令里的 hosted-ai 改成 hosted-noai）</li><li>装好会显示新的网址和配对码：在官网账号页「添加路由器」输入配对码，再用新网址打开面板</li></ol><p>详细步骤：<a href="https://github.com/wznwzn123/openwrt-claude-panel/blob/main/docs/install-hosted.md">安装教程 · 托管网址被删除了怎么办</a></p>`],
		}[kind];
		let sent = false;
		for (const uid of d.users || []) {
			const u = await this.ctx.storage.get('u:' + uid);
			if (u && u.email) { try { if (await sendMail(this.env, u.email, T[0], T[1])) sent = true; } catch (x) {} }
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
		if (u && Date.now() - (ss.last || 0) > 600e3) { ss.last = Date.now(); await this.ctx.storage.put('s:' + sid, ss); }
		return u ? { uid: u.uid, email: u.email } : null;
	}
	async newSession(u, dev) {
		const sid = rnd(32), now = Date.now();
		await this.ctx.storage.put('s:' + sid, { uid: u.uid, exp: now + SESSION_DAYS * DAY, kid: rnd(10), at: now, last: now, ua: String((dev && dev.ua) || '').slice(0, 60), place: String((dev && dev.place) || '').slice(0, 60) });
		u.sids = [...(u.sids || []), sid].slice(-20); u.lastAt = now;
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
	async sessionsOutOthers(uid, mine) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return { st: 401, error: '请先登录' };
		const n = (u.sids || []).filter((x) => x !== mine).length;
		await this.dropSessions(u, mine); await this.ctx.storage.put('u:' + uid, u);
		return { st: 200, ok: true, n };
	}
	async loginAlert(u, dev) {
		if (!this.env.RESEND_API_KEY || this.env.LOGIN_ALERT === '0') return;
		const t = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
		const e = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
		try { await sendMail(this.env, u.email, '新设备登录了你的路由器面板账号', `<p>你好，</p><p>你的账号刚刚在一台新设备上登录了：</p><p><b>${e(dev.ua)}</b>${dev.place ? '<br>大概位置：' + e(dev.place) : ''}<br>时间：${t}（北京时间）</p><p>是你自己就不用管。<b>不是你的话</b>：打开 <a href="https://${this.env.BASE_DOMAIN}/app">账号页</a>，在「登录过的设备」里把它退出，再改一下密码。</p>`); } catch (x) {}
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
	async _registerUser({ email, password, code, ip, dev }) {
		email = normEmail(email);
		if (!email) return { st: 400, error: '邮箱格式不对' };
		const pe = pwError(password); if (pe) return { st: 400, error: pe };
		if (await this.ctx.storage.get('e:' + email)) return { st: 409, error: '这个邮箱已经注册过，直接登录就行' };
		if (!(await this.hit('ri:' + ip, 10, 3600e3))) return { st: 429, error: '注册太频繁了，一小时后再试' };
		if (this.env.RESEND_API_KEY && !(await this.useCode(email, 'reg', code))) return { st: 400, error: '验证码不对或已过期' };
		const uid = rnd(12), salt = rnd(16);
		const u = { uid, email, salt, pw: await pwHash(password, salt), created: Date.now(), devs: [], sids: [], verified: !!this.env.RESEND_API_KEY };
		await this.ctx.storage.put({ ['u:' + uid]: u, ['e:' + email]: uid });
		return { st: 200, sid: await this.newSession(u, dev) };
	}
	async userLogin({ email, password, ip, dev }) {
		email = normEmail(email);
		if (!email || typeof password !== 'string') return { st: 400, error: '邮箱或密码不对' };
		if (!(await this.hit('li:' + ip, 30, 900e3))) return { st: 429, error: '尝试太多次了，15 分钟后再试' };
		const fk = 'lf:' + email, f = ((await this.ctx.storage.get('r:' + fk)) || []).filter((t) => t > Date.now() - 900e3);
		if (f.length >= 10) return { st: 429, error: '这个账号密码错了太多次，15 分钟后再试' };
		const uid = await this.ctx.storage.get('e:' + email), u = uid && (await this.ctx.storage.get('u:' + uid));
		if (!u) { const xu = await this.ctx.storage.get('xe:' + email).then((x) => x && this.ctx.storage.get('xu:' + x)); if (xu) { const h0 = await pwHash(password, xu.salt); if (safeEq(h0, xu.pw)) return { st: 403, error: '这个账号已经' + (xu.delWhy === 'self' ? '注销' : '被停用') + '，' + ymd(xu.delAt + TRASH_DAYS * DAY) + ' 前联系提供服务的人可以恢复' }; } }
		const h = await pwHash(password, u ? u.salt : 'x'.repeat(16)); // 账号不存在也算一遍，别让人从响应时间看出来
		if (!u || !safeEq(h, u.pw)) { await this.hit(fk, 10, 900e3); return { st: 401, error: '邮箱或密码不对' }; }
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
			devs.push({ sub: x.sub, host: host(this.env, x.sub), name: x.alias || d.name || x.sub, model: d.model || '', off: !!d.off, last: b.last, state: b.state, ver: b.ver || '', bound: x.at, exp: d.exp || 0, expired: !!(d.off && d.offWhy === 'exp'), trashed: d.offWhy === 'deleted' ? (d.delAt || 0) + TRASH_DAYS * DAY : 0, apply: await this.applyBrief(x.sub, uid) });
		}
		const links = (u.links || []).map((x) => ({ id: x.id, url: x.url, name: x.name, at: x.at }));
		const td = this.trialDays();
		return { email: u.email, created: u.created, verified: !!u.verified, devs, links, mail: !!this.env.RESEND_API_KEY, trial: td ? { days: td, code: (u.trial && !u.trial.used && u.trial.code) || '', used: (u.trial && u.trial.used) || 0, got: !!(u.trial && u.trial.code) } : null };
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
	async userReset({ email, code, password, dev }) {
		email = normEmail(email);
		const uid = email && (await this.ctx.storage.get('e:' + email)), u = uid && (await this.ctx.storage.get('u:' + uid));
		if (!u || !(await this.useCode(email, 'reset', code))) return { st: 400, error: '验证码不对或已过期' };
		const pe = pwError(password); if (pe) return { st: 400, error: pe };
		u.salt = rnd(16); u.pw = await pwHash(password, u.salt); u.verified = true;
		await this.dropSessions(u, null);
		await this.ctx.storage.put('u:' + uid, u);
		return { st: 200, sid: await this.newSession(u, dev) };
	}
	delAccount(uid, password) { return this.lock(() => this._delAccount(uid, password)); }
	async _delAccount(uid, password) {
		const u = await this.ctx.storage.get('u:' + uid);
		if (!u) return { st: 401, error: '请先登录' };
		if (!safeEq(await pwHash(String(password || ''), u.salt), u.pw)) return { st: 403, error: '密码不对' };
		// 也先放进回收站：30 天内提供服务的人能帮忙恢复，之后自动彻底删除
		await this._trashUserRec(u, 'self');
		await this.alog('user-delete', u.email, '用户自己注销了账号（30 天内能恢复）', 'user');
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
		return { st: 200, ok: true, at: ap.at };
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
		return sendMail(this.env, ap.email, ap.status === 'ok' ? '续期申请已通过：' + ap.name + ' 到期时间 ' + ymd(ap.newExp) : '续期申请没有通过：' + ap.name, html);
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
			if (r.ok) return { ok: true, to };
			let msg = ''; try { const j = await r.json(); msg = j.message || j.error || ''; } catch (e) {}
			return { ok: false, to, error: '邮件服务没接受（' + r.status + '）' + (msg ? '：' + String(msg).slice(0, 200) : '') };
		} catch (e) { return { ok: false, to, error: '连不上邮件服务：' + String(e?.message || e).slice(0, 120) }; }
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
	/* ---------- 问题反馈：路由器面板里发来（凭 RKEY），管理页看，发邮件提醒管理员 ---------- */
	async feedback({ sub, rkey, text, contact, diag, images }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		text = String(text || '').trim().slice(0, 2000); contact = String(contact || '').trim().slice(0, 80); diag = String(diag || '').trim().slice(0, 1500);
		if (text.length < 4) return { st: 400, error: '写几句遇到的问题或者建议吧' };
		if (!(await this.hit('fb:' + sub, 5, DAY))) return { st: 429, error: '今天发了很多条了，明天再发' };
		const d = await this.ctx.storage.get('d:' + sub), emails = [];
		for (const uid of (d && d.users) || []) { const u = await this.ctx.storage.get('u:' + uid); if (u && u.email) emails.push(u.email); }
		const fb = { id: rnd(10), at: Date.now(), sub, name: (d && d.name) || sub, emails, text, contact, diag, done: 0, imgs: [] };
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
		await this.notifyAdmin('问题反馈：' + fb.name, `${text}\n\n${contact ? '联系方式：' + contact + '\n' : ''}账号：${emails.join('、') || '没有绑定'}\n路由器：${fb.name}（${sub}）${diag ? '\n\n' + diag : ''}${fb.imgs.length ? '\n\n附了 ' + fb.imgs.length + ' 张截图，在管理页看' : ''}\n\n管理页：https://${this.env.BASE_DOMAIN}/admin`);
		return { st: 200, ok: true };
	}
	/* ---------- 官网公开的报告表单：安全问题、隐私和数据、滥用举报（不用登录；不记 IP，只按 IP 限次，限次记录一两天后自动清掉） ---------- */
	async report({ kind, text, contact, ip, log }) {
		// install：安装脚本失败时，用户在终端里输入 y 同意后发来的（版本、失败步骤、错误、系统情况）
		const KIND = { security: '安全问题', privacy: '隐私和数据', abuse: '滥用举报', install: '安装失败', other: '其他' };
		if (!KIND[kind]) kind = 'other';
		text = String(text || '').trim().slice(0, 4000); contact = String(contact || '').trim().slice(0, 120);
		if (text.length < 10) return { st: 400, error: '多写几句，说清楚是什么问题（至少 10 个字）' };
		if (!(await this.hit('rp:' + (ip || '?'), 5, DAY))) return { st: 429, error: '今天提交太多次了，明天再试' };
		if (!(await this.hit('rp:all', 100, DAY))) return { st: 429, error: '今天提交的人太多了，明天再试' };
		const fb = { id: rnd(10), at: Date.now(), sub: '', name: kind === 'install' ? '安装失败（终端上报）' : '官网 · ' + KIND[kind], kind, web: 1, emails: [], text, contact, diag: '', done: 0, imgs: [] };
		// 安装失败带的安装日志（用户同意后发来，已经在路由器上遮住了邀请码、令牌、域名）：单独存，列表里只记有多长
		log = kind === 'install' ? String(log || '').slice(-64000) : '';
		if (log) { await this.ctx.storage.put('fblog:' + fb.id, log); fb.log = log.length; }
		const drop = await this.lock(async () => { const l = (await this.ctx.storage.get('fbl')) || []; l.unshift(fb); await this.ctx.storage.put('fbl', l.slice(0, 300)); return l.slice(300); });
		for (const x of drop) await this.fbImgRm(x);
		await this.notifyAdmin(kind === 'install' ? '有人安装失败了' : '官网报告（' + KIND[kind] + '）', `${text}\n\n${contact ? '联系方式：' + contact : '没留联系方式'}\n\n管理页：https://${this.env.BASE_DOMAIN}/admin`);
		return { st: 200, ok: true };
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
	fbMailTo(x) {
		const to = [...(x.emails || [])], m = String(x.contact || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
		if (m && !to.some((y) => y.toLowerCase() === m[0].toLowerCase())) to.push(m[0]);
		return to.slice(0, 3);
	}
	async feedbacksAdmin() { return (await this.feedbacks()).map((x) => ({ ...x, mailTo: this.fbMailTo(x) })); }
	// 标已修复 / 撤回成未修复；可以写补充说明、发邮件告诉对方（每次都记一条处理记录）
	async fbSet(id, done, note = '', mail = false) {
		note = String(note || '').trim().slice(0, 2000);
		const x = await this.lock(async () => { const l = (await this.ctx.storage.get('fbl')) || [], x = l.find((y) => y.id === id); if (!x) return null; x.done = done ? Date.now() : 0; await this.ctx.storage.put('fbl', l); return x; });
		if (!x) return { ok: false };
		let mailed = [], mailErr = '';
		if (mail) {
			const to = this.fbMailTo(x);
			if (!to.length) mailErr = '对方没留邮箱';
			else if (!this.env.RESEND_API_KEY) mailErr = '还没设置邮件服务 RESEND_API_KEY';
			else {
				const e = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
				const when = new Date(x.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
				const quote = x.text.length > 500 ? x.text.slice(0, 500) + '……' : x.text;
				const html = `<p>你好，</p><p>你在 ${e(when)} 反馈的问题${done ? '<b>已经修复了</b>。' : '<b>我们重新打开了，还在继续处理</b>，有进展会再告诉你。'}</p>`
					+ (note ? `<p><b>补充说明：</b><br>${e(note).replace(/\n/g, '<br>')}</p>` : '')
					+ `<p style="color:#666;margin-top:18px">你当时写的：</p><blockquote style="margin:0;padding:8px 12px;border-left:3px solid #ddd;color:#555">${e(quote).replace(/\n/g, '<br>')}</blockquote>`
					+ (done ? '<p>如果还有问题，在面板里再反馈一次就行。</p>' : '') + `<p style="color:#999;font-size:13px">路由器面板 · <a href="https://${this.env.BASE_DOMAIN}">${this.env.BASE_DOMAIN}</a></p>`;
				for (const t of to) if (await sendMail(this.env, t, done ? '你反馈的问题已修复' : '你反馈的问题还在处理中', html)) mailed.push(t);
				if (!mailed.length) mailErr = '邮件服务没发出去，稍后再试';
			}
		}
		await this.lock(async () => { const l = (await this.ctx.storage.get('fbl')) || [], y = l.find((z) => z.id === id); if (!y) return; (y.acts = y.acts || []).push({ at: Date.now(), done: done ? 1 : 0, note, mailed }); y.acts = y.acts.slice(-20); await this.ctx.storage.put('fbl', l); });
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
		if (u.trial && u.trial.code) {
			const inv = await this.ctx.storage.get('i:' + u.trial.code);
			return { st: 200, ok: true, days, code: u.trial.code, exp: inv ? inv.exp : 0, used: u.trial.used || 0 };
		}
		if (!(await this.hit('tr:' + (ip || '?'), 5, DAY))) return { st: 429, error: '领得太频繁了，明天再试' };
		let code;
		do { code = rnd(10).toUpperCase(); } while ((await this.ctx.storage.get('i:' + code)) || (await this.ctx.storage.get('k:' + code)));
		const now = Date.now(), inv = { max: 1, used: 0, created: now, exp: now + 7 * DAY, note: ('试用：' + u.email).slice(0, 60), svc: days, uid, trial: 1 };
		u.trial = { code, at: now };
		await this.ctx.storage.put({ ['i:' + code]: inv, ['u:' + uid]: u });
		await this.alog('trial', u.email, `领了 ${days} 天免费试用（试用码 7 天内有效）`, 'user');
		return { st: 200, ok: true, days, code, exp: inv.exp, used: 0 };
	}
	async devInfo({ sub, rkey }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		const d = await this.ctx.storage.get('d:' + sub);
		return { st: 200, exp: (d && d.exp) || 0, off: !!(d && d.off), offWhy: (d && d.offWhy) || null };
	}
	async devRenew({ sub, rkey, code }) {
		if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
		return this.renew(sub, code, '路由器');
	}
	async stats() { const f = await this.ctx.storage.get('dnsfull'); return { count: await this.count(), max: this.max(), ...(f ? { dnsFull: f } : {}) }; }
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
				} else { await this.ctx.storage.delete('d:' + d.sub); await this.addCount(-1); }
				out.push(d.sub);
			} catch (e) {}
		}
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
			await this.ctx.storage.delete([k, 'xe:' + u.email]);
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
	// 官网「报告问题」表单（安全、隐私、滥用）：不用登录；website 是给机器人填的陷阱字段，填了就假装成功
	if (p === '/api/report' && req.method === 'POST') {
		const b = await body();
		if (b.website) return J({ ok: true });
		const { st, ...rest } = await H.report({ kind: String(b.kind || ''), text: String(b.text || ''), contact: String(b.contact || ''), log: String(b.log || ''), ip: req.headers.get('cf-connecting-ip') || '' });
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
			if (op === 'extend') { const r = await H.extend(sub, b.days); return J(r.st === 200 ? r : { error: r.error }, r.st); }
			if (op === 'note') return done({ ok: await H.setNote(sub, b.note) }, '备注：' + noteText(b.note, 100));
		}
		if (a[0] === 'users' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.adminUsers(), trashDays: TRASH_DAYS });
		if (a[0] === 'users' && /^[a-z2-9]{12}$/.test(a[1] || '') && req.method === 'POST') {
			const b = await body();
			const r = a[2] === 'delete' ? await H.trashUser(a[1], b.confirm) : a[2] === 'restore' ? await H.restoreUser(a[1]) : a[2] === 'purge' ? await H.purgeUser(a[1], b.confirm) : { st: 404, error: 'not found' };
			return J(r.st === 200 ? r : { error: r.error }, r.st);
		}
		if (a[0] === 'log' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.adminLog() });
		if (a[0] === 'invites' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.invites() });
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
		if (a[0] === 'feedback' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.feedbacksAdmin() });
		if (a[0] === 'feedback' && /^[a-z2-9]{10}$/.test(a[1] || '') && a[2] === 'done' && req.method === 'POST') { const b = await body(); return J(await H.fbSet(a[1], !!b.done, b.note, !!b.mail)); }
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
	if (p === '/api/app/version') return /^curl\//i.test(req.headers.get('user-agent') || '') ? routerVersion(env) : appVersion(env);
	if (p === '/app/router-panel.apk' && req.method === 'GET') return appApk(env);
	if (p.startsWith('/dl/') && (req.method === 'GET' || req.method === 'HEAD')) return dlFile(env, p.slice(4));
	const pg = { '/': HOME, '/index.html': HOME, '/app': APP, '/admin': ADMIN, '/privacy': PRIVACY, '/security': SECURITY }[p];
	if (pg && req.method === 'GET') return new Response(pg, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:" + (pg === ADMIN ? ' blob:' : '') + "; connect-src 'self'; frame-ancestors 'none'" } });
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
				: { version: x.tag.replace(/^v/, ''), notes: notesOf(x.body), apk: '/app/router-panel.apk', at: x.at, force: x.body.includes('【必须更新】'), min: mv ? mv[1] : '' };
			try { await hubObj(env).setMeta('appver', o); } catch (e) {}
			return o;
		});
		return v ? out({ ok: true, ...v }, 200) : out({ ok: false, error: '还没有发布安卓 App' }, 404);
	} catch (e) { return out({ ok: false, error: '检查更新失败' }, 502); }
}
// 路由器的最新版本：就是最新发布的版本号和更新说明
async function routerVersion(env) {
	try {
		const v = await cached('router-version', 600, async () => {
			const x = await latestRelease(env);
			if (!x) { try { return (await hubObj(env).meta('rver')) || null; } catch (e) { return null; } }
			if (x.none || !x.tag) return null;
			const mv = /最低版本[:：]\s*v?(\d+(?:\.\d+){0,2})/.exec(x.body);
			const o = { version: x.tag.replace(/^v/, ''), notes: notesOf(x.body), at: x.at, force: x.body.includes('【必须更新】'), min: mv ? mv[1] : '' };
			try { await hubObj(env).setMeta('rver', o); } catch (e) {}
			return o;
		});
		return v ? J({ ok: true, ...v }) : J({ ok: false, error: '还没有发布' }, 404);
	} catch (e) { return J({ ok: false, error: '检查更新失败' }, 502); }
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
	if (p === '/api/dev/feedback') return out(await H.feedback({ sub: s(b.sub), rkey: s(b.rkey), text: s(b.text), contact: s(b.contact), diag: s(b.diag), images: Array.isArray(b.images) ? b.images.slice(0, 3).map(s) : [] }));
	if (p === '/api/dev/renew') return out(await H.devRenew({ sub: s(b.sub), rkey: s(b.rkey), code: s(b.code) }));
	const a = p.slice('/api/account/'.length);
	if (a === 'code') return out(await H.mailCode({ email: s(b.email), kind: s(b.kind), ip }));
	const dev = { ua: uaLabel(req.headers.get('user-agent')), place: placeOf(req.cf) };
	if (a === 'register') return out(await H.userRegister({ email: s(b.email), password: s(b.password), code: s(b.code), ip, dev }));
	if (a === 'login') return out(await H.userLogin({ email: s(b.email), password: s(b.password), ip, dev }));
	if (a === 'reset') return out(await H.userReset({ email: s(b.email), code: s(b.code), password: s(b.password), dev }));
	const sid = getSid(req);
	if (a === 'logout') { await H.userLogout(sid); const res = J({ ok: true }); res.headers.append('set-cookie', sidCookie('', 0)); return res; }
	const me = await H.who(sid);
	if (!me) return J({ error: '请先登录', login: true }, 401);
	if (a === 'me') return J({ ok: true, ...(await H.me(me.uid)) });
	if (a === 'sessions') return out(await H.sessions(me.uid, sid));
	if (a === 'session_out') return out(await H.sessionOut(me.uid, sid, s(b.id)));
	if (a === 'sessions_out_others') return out(await H.sessionsOutOthers(me.uid, sid));
	if (a === 'bind') return out(await H.bind(me.uid, s(b.code), ip));
	if (a === 'unbind') return out(await H.unbind(me.uid, s(b.sub)));
	if (a === 'rename') return out(await H.rename(me.uid, s(b.sub), s(b.alias)));
	if (a === 'logincode') return out(await H.loginCode(me.uid, s(b.sub)));
	if (a === 'renew') return out(await H.accountRenew(me.uid, me.email, s(b.sub), s(b.code)));
	if (a === 'trial') return out(await H.trial(me.uid, ip));
	if (a === 'apply') return out(await H.apply(me.uid, me.email, { sub: s(b.sub), source: s(b.source), contact: s(b.contact), note: s(b.note) }));
	if (a === 'link') return out(await H.addLink(me.uid, s(b.name), s(b.url)));
	if (a === 'unlink') return out(await H.delLink(me.uid, s(b.id)));
	if (a === 'password') return out(await H.userPassword(me.uid, sid, s(b.old), s(b.password)));
	if (a === 'delete') { const r = await H.delAccount(me.uid, s(b.password)); const res = out(r); if (r.st === 200) res.headers.append('set-cookie', sidCookie('', 0)); return res; }
	return J({ error: 'not found' }, 404);
}
export async function hubScheduled(env) { const H = hubObj(env); await H.cleanup(); await H.gcRate(Date.now()); }

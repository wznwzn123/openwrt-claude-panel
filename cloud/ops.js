// 4.0：统计（访问次数、访客 IP、国家/地区）、登录记录、出错记录、邮件记录、实时对话（用户 ↔ 开发者）
// 这些方法挂到托管服务的 Hub（Durable Object）上；数据都在自己的 Cloudflare 存储里，不交给任何第三方
import { rnd, safeEq, SUB_RE, placeOf, uaLabel } from './hub.js';

const DAY = 86400e3;
// 按北京时间算「哪一天」（管理页按天看统计）
export const dayKey = (t) => new Date(t + 8 * 3600e3).toISOString().slice(0, 10);
const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);
const IP_MAX = 3000; // 一天最多记多少个不同的访客 IP（超过的只计数）
export const TID_RE = /^(d[a-z2-9]{8}|a[a-z2-9]{12})$/;
const CHAT_KEEP = 500, CHAT_THREADS = 1000, CHAT_IMG = 1024 * 1024, CHUNK = 96 * 1024;
const BOT_RE = /bot|spider|crawl|slurp|curl|wget|python|go-http|headless|monitor|preview|facebookexternalhit|bytespider/i;
export const isBot = (ua) => !ua || BOT_RE.test(ua);
const pad = (n) => String(n).padStart(8, '0');

const M = {
	/* ---------- 统计：按天计数 ---------- */
	// n：计数名（pv 访问、login_ok、login_fail、reg、reset、adm_ok、adm_fail、fb、report、install_fail、chat_in、chat_out、err、mail_ok、mail_fail、dev_reg）
	async track(n, x = {}) {
		const k = 'st:' + dayKey(Date.now());
		const s = (await this.ctx.storage.get(k)) || { n: {}, pv: {}, ip: {}, ipn: 0, cc: {} };
		s.n[n] = (s.n[n] || 0) + 1;
		if (n === 'pv') {
			const pg = clip(x.page, 20) || '?';
			s.pv[pg] = (s.pv[pg] || 0) + 1;
			if (x.bot) s.n.bot = (s.n.bot || 0) + 1;
			const ip = clip(x.ip, 45);
			if (ip && !x.bot) {
				if (s.ip[ip]) s.ip[ip]++;
				else if (s.ipn < IP_MAX) { s.ip[ip] = 1; s.ipn++; }
				else s.n.uv_over = (s.n.uv_over || 0) + 1;
			}
			const cc = clip(x.cc, 2).toUpperCase();
			if (cc && !x.bot) s.cc[cc] = (s.cc[cc] || 0) + 1;
		}
		await this.ctx.storage.put(k, s);
	},
	async statDays(days) {
		days = Math.max(1, Math.min(120, Math.round(+days || 30)));
		const now = Date.now(), keys = [];
		for (let i = days - 1; i >= 0; i--) keys.push('st:' + dayKey(now - i * DAY));
		const got = await this.ctx.storage.get(keys);
		return keys.map((k) => { const s = got.get(k) || { n: {}, pv: {}, ip: {}, ipn: 0, cc: {} }; return { d: k.slice(3), n: s.n, pv: s.pv, uv: s.ipn || 0, cc: s.cc }; });
	},
	async statVisitors(day) {
		if (!/^\d{4}-\d\d-\d\d$/.test(day || '')) day = dayKey(Date.now());
		const s = (await this.ctx.storage.get('st:' + day)) || { ip: {} };
		return Object.entries(s.ip || {}).sort((a, b) => b[1] - a[1]).slice(0, 500).map(([ip, n]) => ({ ip, n }));
	},
	// 汇总给管理后台的概览页
	async overview() {
		const now = Date.now(), devs = await this.devices(), users = await this.ctx.storage.list({ prefix: 'u:' });
		const live = devs.filter((d) => !d.off && d.state === 'ok');
		const fb = (await this.feedbacks()) || [];
		const th = (await this.ctx.storage.get('cth')) || [];
		const ll = (await this.ctx.storage.get('ll')) || [];
		const days = await this.statDays(30);
		return {
			now,
			devices: { total: live.length, online1h: live.filter((d) => d.seen && now - d.seen < 3600e3).length, online24h: live.filter((d) => d.seen && now - d.seen < DAY).length, off: devs.filter((d) => d.off).length, new7: live.filter((d) => d.created && now - d.created < 7 * DAY).length, expiring: live.filter((d) => d.exp && d.exp > now && d.exp - now < 7 * DAY).length },
			users: { total: users.size, new7: [...users.values()].filter((u) => u && u.created && now - u.created < 7 * DAY).length },
			fb: { open: fb.filter((x) => !x.done && !x.nofix).length, total: fb.length, week: fb.filter((x) => now - x.at < 7 * DAY).length },
			chat: { threads: th.length, unread: th.reduce((a, t) => a + (t.ua || 0), 0), waiting: th.filter((t) => t.ua > 0).length },
			logins: { ok24: ll.filter((x) => x.ok && now - x.t < DAY).length, fail24: ll.filter((x) => !x.ok && now - x.t < DAY).length, ips24: new Set(ll.filter((x) => now - x.t < DAY).map((x) => x.ip)).size },
			days,
		};
	},
	async opsGc(now) {
		now = now || Date.now();
		const all = await this.ctx.storage.list({ prefix: 'st:' }), del = [];
		for (const [k, s] of all) {
			const age = now - Date.parse(k.slice(3) + 'T00:00:00+08:00');
			if (age > 180 * DAY) del.push(k);
			else if (age > 31 * DAY && s && s.ip && Object.keys(s.ip).length) { s.ip = {}; s.ipStripped = 1; await this.ctx.storage.put(k, s); } // 访客 IP 只留 30 天，计数留着
		}
		for (let i = 0; i < del.length; i += 128) await this.ctx.storage.delete(del.slice(i, i + 128));
		const ll = (await this.ctx.storage.get('ll')) || [];
		const keep = ll.filter((x) => now - x.t < 90 * DAY); // 登录记录留 90 天
		if (keep.length !== ll.length) await this.ctx.storage.put('ll', keep);
		return del.length;
	},
	/* ---------- 登录记录（账号登录、注册、找回密码、管理后台） ---------- */
	async loginLog(e) {
		const l = (await this.ctx.storage.get('ll')) || [];
		l.unshift({ t: Date.now(), k: e.k, who: clip(e.who, 120), ok: !!e.ok, why: clip(e.why, 80), ip: clip(e.ip, 45), place: clip(e.place, 60), ua: clip(e.ua, 60) });
		await this.ctx.storage.put('ll', l.slice(0, 3000));
		const n = e.k === 'admin' ? (e.ok ? 'adm_ok' : 'adm_fail') : e.k === 'reg' ? 'reg' : e.k === 'reset' ? 'reset' : e.ok ? 'login_ok' : 'login_fail';
		await this.track(n);
	},
	async loginList() { return (await this.ctx.storage.get('ll')) || []; },
	// 管理后台：同一个 IP 15 分钟内密钥错 10 次就先锁住（防猜密钥）
	async admBlocked(ip) { const a = ((await this.ctx.storage.get('r:af:' + ip)) || []).filter((t) => t > Date.now() - 900e3); return a.length >= 10; },
	async admFail(ip, ua, place, path) { await this.hit('af:' + ip, 1000, 900e3); await this.loginLog({ k: 'admin', who: '管理后台', ok: false, why: '密钥不对 · ' + clip(path, 40), ip, ua, place }); },
	/* ---------- 出错记录、邮件记录 ---------- */
	async errLog(path, msg) {
		const l = (await this.ctx.storage.get('el')) || [];
		l.unshift({ t: Date.now(), path: clip(path, 120), msg: clip(msg, 500) });
		await this.ctx.storage.put('el', l.slice(0, 300));
		await this.track('err');
	},
	async mailLog(to, subject, ok, err) {
		const l = (await this.ctx.storage.get('ml')) || [];
		l.unshift({ t: Date.now(), to: clip(to, 120), subject: clip(subject, 120), ok: !!ok, err: clip(err, 200) });
		await this.ctx.storage.put('ml', l.slice(0, 300));
		await this.track(ok ? 'mail_ok' : 'mail_fail');
	},
	/* ---------- 实时对话：用户在面板里「实时联系开发者」，开发者在管理后台回复 ---------- */
	// 自建版没有托管身份：第一次用时给这台路由器一个匿名身份（只存钥匙的哈希）
	async chatAnon({ ip, name, model }) {
		if (!(await this.hit('can:' + ip, 5, DAY))) return { st: 429, error: '今天建的对话太多了，明天再试' };
		const cid = rnd(12), ckey = rnd(32);
		await this.ctx.storage.put('ca:' + cid, { kh: await sha(ckey), at: Date.now(), name: clip(name, 40), model: clip(model, 60) });
		return { st: 200, ok: true, cid, ckey };
	},
	// 认出是谁：托管版凭 sub + rkey；自建版凭 cid + ckey
	async chatWho(b) {
		if (b.sub) { if (!SUB_RE.test(b.sub) || !(await this.devOk(b.sub, b.rkey))) return null; const d = await this.ctx.storage.get('d:' + b.sub); return { tid: 'd' + b.sub, kind: 'hosted', sub: b.sub, name: (d && d.name) || b.sub, model: (d && d.model) || '' }; }
		if (b.cid) { if (!/^[a-z2-9]{12}$/.test(b.cid)) return null; const a = await this.ctx.storage.get('ca:' + b.cid); if (!a || !safeEq(await sha(String(b.ckey || '')), a.kh)) return null; return { tid: 'a' + b.cid, kind: 'self', name: a.name || '自建版路由器', model: a.model || '' }; }
		return null;
	},
	async chatThreads() { return (await this.ctx.storage.get('cth')) || []; },
	async chatThread(tid) { return (await this.chatThreads()).find((t) => t.tid === tid) || null; },
	async chatMsgs(tid, after, limit) {
		after = Math.max(0, Math.floor(+after || 0)); limit = Math.max(1, Math.min(200, +limit || 100));
		const m = await this.ctx.storage.list({ prefix: 'cm:' + tid + ':', start: 'cm:' + tid + ':' + pad(after + 1), reverse: !after, limit });
		const l = [...m.values()];
		return after ? l : l.reverse();
	},
	// 发一条：from 'u' 用户 / 'a' 开发者
	chatSend(who, from, text, img, extra) { return this.lock(() => this._chatSend(who, from, text, img, extra)); },
	async _chatSend(who, from, text, img, extra = {}) {
		// from：u = 用户，a = 开发者，b = 自动回复（显示成开发者那边，但不算开发者已经回复：后台的「没看」「等回复」不变）
		const bot = from === 'b';
		if (bot) from = 'a';
		text = clip(text, 2000);
		let im = null;
		if (img) {
			const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(img));
			if (!m) return { st: 400, error: '图片格式不对（只支持 JPG、PNG、WebP）' };
			let u8; try { u8 = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)); } catch (e) { return { st: 400, error: '图片读不出来' }; }
			if (!u8.length || u8.length > CHAT_IMG) return { st: 400, error: '图片太大了（最大 1MB）' };
			im = { type: m[1], size: u8.length, u8 };
		}
		if (!text && !im) return { st: 400, error: '写点什么再发吧' };
		const l = await this.chatThreads(), now = Date.now();
		let t = l.find((x) => x.tid === who.tid);
		if (t && t.blocked && from === 'u') return { st: 403, error: '暂时不能发消息了。有问题可以在官网报告问题' };
		if (!t) { if (from === 'a') return { st: 404, error: '没有这个对话' }; t = { tid: who.tid, kind: who.kind, sub: who.sub || '', at: now, seq: 0, ua: 0, uu: 0, n: 0 }; l.unshift(t); }
		if (from === 'u') { t.name = who.name; t.model = who.model; for (const [k, v] of Object.entries(extra)) if (v) t[k] = v; }
		const seq = ++t.seq, msg = { s: seq, f: from, t: now, x: text };
		if (bot) msg.auto = 1;
		if (im) {
			const n = Math.ceil(im.u8.length / CHUNK), put = {};
			for (let k = 0; k < n; k++) put['cmi:' + who.tid + ':' + pad(seq) + ':' + k] = im.u8.slice(k * CHUNK, (k + 1) * CHUNK);
			await this.ctx.storage.put(put);
			msg.img = { type: im.type, size: im.size, n };
		}
		await this.ctx.storage.put('cm:' + who.tid + ':' + pad(seq), msg);
		t.n = (t.n || 0) + 1;
		if (!bot) { t.last = now; t.lastFrom = from; t.preview = text ? text.slice(0, 80) : '[图片]'; }
		if (from === 'a' && !bot) t.lastAdmin = now;
		if (from === 'u') t.ua = (t.ua || 0) + 1; else { t.uu = (t.uu || 0) + 1; if (!bot) t.ua = 0; }
		l.sort((a, b) => (b.last || 0) - (a.last || 0));
		const drop = l.splice(CHAT_THREADS);
		await this.ctx.storage.put('cth', l);
		for (const x of drop) await this._chatPurge(x.tid);
		// 只留最近 500 条
		if (seq > CHAT_KEEP) await this._chatTrim(who.tid, seq - CHAT_KEEP);
		return { st: 200, ok: true, msg };
	},
	async _chatTrim(tid, upto) {
		const old = await this.ctx.storage.list({ prefix: 'cm:' + tid + ':', end: 'cm:' + tid + ':' + pad(upto + 1), limit: 50 });
		const del = [];
		for (const [k, m] of old) { del.push(k); if (m && m.img) for (let i = 0; i < m.img.n; i++) del.push('cmi:' + tid + ':' + pad(m.s) + ':' + i); }
		for (let i = 0; i < del.length; i += 128) await this.ctx.storage.delete(del.slice(i, i + 128));
	},
	async _chatPurge(tid) {
		for (const pre of ['cm:' + tid + ':', 'cmi:' + tid + ':']) {
			for (;;) { const ks = [...(await this.ctx.storage.list({ prefix: pre, limit: 128 })).keys()]; if (!ks.length) break; await this.ctx.storage.delete(ks); }
		}
	},
	chatDel(tid) { return this.lock(async () => { const l = await this.chatThreads(); if (!l.some((x) => x.tid === tid)) return false; await this.ctx.storage.put('cth', l.filter((x) => x.tid !== tid)); await this._chatPurge(tid); return true; }); },
	chatSet(tid, k, v) { return this.lock(async () => { const l = await this.chatThreads(), t = l.find((x) => x.tid === tid); if (!t) return false; t[k] = v; await this.ctx.storage.put('cth', l); return true; }); },
	async chatImg(tid, seq) {
		const m = await this.ctx.storage.get('cm:' + tid + ':' + pad(seq));
		if (!m || !m.img) return null;
		const ks = []; for (let i = 0; i < m.img.n; i++) ks.push('cmi:' + tid + ':' + pad(seq) + ':' + i);
		const got = await this.ctx.storage.get(ks), parts = ks.map((k) => got.get(k)).filter(Boolean);
		if (parts.length !== m.img.n) return null;
		const buf = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
		return { type: m.img.type, buf };
	},
	// 用户那边拿新消息；read：标为看过（开发者的消息不再算未读）
	async chatGet(who, after, read) {
		const t = await this.chatThread(who.tid);
		if (!t) return { st: 200, ok: true, msgs: [], uu: 0, seq: 0 };
		if (read && t.uu) await this.chatSet(who.tid, 'uu', 0);
		return { st: 200, ok: true, msgs: await this.chatMsgs(who.tid, after, 100), uu: read ? 0 : t.uu || 0, seq: t.seq || 0, blocked: !!t.blocked, adminSeen: t.adminSeen || 0 };
	},
};

async function sha(s) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))); return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join(''); }

export function installOps(Cls) { for (const [k, f] of Object.entries(M)) Cls.prototype[k] = f; }

// 用户发来的消息里图片换成「有图」标记（图片另外按编号拿）
const pubMsg = (m) => ({ s: m.s, f: m.f, t: m.t, x: m.x || '', img: m.img ? { type: m.img.type, size: m.img.size } : null, ...(m.auto ? { auto: 1 } : {}) });

/* ---------- 路由（面板经路由器转发来的对话请求） ---------- */
export async function chatApi(req, env, H, body) {
	const b = await body(), ip = req.headers.get('cf-connecting-ip') || '', s = (v) => String(v == null ? '' : v);
	const op = s(b.op);
	if (op === 'anon') { const { st, ...r } = await H.chatAnon({ ip, name: s(b.name), model: s(b.model) }); return J(r, st); }
	const who = await H.chatWho({ sub: s(b.sub), rkey: s(b.rkey), cid: s(b.cid), ckey: s(b.ckey) });
	if (!who) return J({ error: '身份不对（路由器的钥匙对不上）', relogin: !!b.cid }, 403);
	if (op === 'get') { const { st, ...r } = await H.chatGet(who, b.after, !!b.read); return J({ ...r, msgs: (r.msgs || []).map(pubMsg) }, st); }
	if (op === 'img') { const im = await H.chatImg(who.tid, Math.floor(+b.seq || 0)); if (!im) return J({ error: '图片没有了' }, 404); let bin = ''; for (let i = 0; i < im.buf.length; i += 0x8000) bin += String.fromCharCode(...im.buf.subarray(i, i + 0x8000)); return J({ ok: true, data: 'data:' + im.type + ';base64,' + btoa(bin) }); }
	if (op === 'send') {
		if (!(await H.hit('cs:' + who.tid, 20, 600e3)) || !(await H.hit('csd:' + who.tid, 200, DAY))) return J({ error: '发得太快了，歇一会儿再发' }, 429);
		const { st, ...r } = await H.chatSend(who, 'u', s(b.text), b.img ? s(b.img) : '', { ver: s(b.ver).slice(0, 20), place: placeOf(req.cf), dev: uaLabel(s(b.ua)) });
		if (st === 200) { await H.track('chat_in'); try { if (H.v5AfterUserMsg) await H.v5AfterUserMsg(who.tid); } catch (e) {} }
		return J(st === 200 ? { ok: true, msg: pubMsg(r.msg) } : r, st);
	}
	return J({ error: 'not found' }, 404);
}

/* ---------- 管理后台用的接口（已经验过管理员密钥） ---------- */
export async function opsAdmin(req, a, H, body, u) {
	const m = req.method;
	if (a[0] === 'overview' && m === 'GET') return J({ ok: true, ...(await H.overview()) });
	if (a[0] === 'stats' && m === 'GET') return J({ ok: true, days: await H.statDays(u.searchParams.get('days')) });
	if (a[0] === 'visitors' && m === 'GET') return J({ ok: true, list: await H.statVisitors(u.searchParams.get('day')) });
	if (a[0] === 'logins' && m === 'GET') return J({ ok: true, list: await H.loginList() });
	if (a[0] === 'errors' && m === 'GET') return J({ ok: true, list: (await H.ctx.storage.get('el')) || [] });
	if (a[0] === 'mails' && m === 'GET') return J({ ok: true, list: (await H.ctx.storage.get('ml')) || [] });
	if (a[0] === 'badge' && m === 'GET') { const th = await H.chatThreads(), fb = await H.feedbacks(); return J({ ok: true, chat: th.reduce((x, t) => x + (t.ua || 0), 0), chatWaiting: th.filter((t) => t.ua > 0).length, fb: fb.filter((x) => !x.done && !x.nofix).length, last: th[0] ? th[0].last : 0 }); }
	if (a[0] === 'chat') {
		if (!a[1] && m === 'GET') return J({ ok: true, list: await H.chatThreads() });
		const tid = a[1] || '';
		if (!TID_RE.test(tid)) return J({ error: 'not found' }, 404);
		if (!a[2] && m === 'GET') {
			const t = await H.chatThread(tid); if (!t) return J({ error: '没有这个对话' }, 404);
			if (u.searchParams.get('read') === '1' && t.ua) { await H.chatSet(tid, 'ua', 0); await H.chatSet(tid, 'adminSeen', t.seq); }
			return J({ ok: true, thread: t, msgs: (await H.chatMsgs(tid, u.searchParams.get('after'), 200)).map(pubMsg) });
		}
		if (!a[2] && m === 'POST') {
			const b = await body(), t = await H.chatThread(tid);
			if (!t) return J({ error: '没有这个对话' }, 404);
			const { st, ...r } = await H.chatSend({ tid, kind: t.kind, sub: t.sub, name: t.name, model: t.model }, 'a', String(b.text || ''), b.img ? String(b.img) : '');
			if (st !== 200) return J(r, st);
			await H.chatSet(tid, 'adminSeen', r.msg.s);
			await H.track('chat_out');
			// 托管版：推送到这台路由器绑定的手机（自建版由路由器自己每 30 分钟来看一次，有新回复再推送）
			if (t.kind === 'hosted' && t.sub) { try { await H.watch(t.sub).push({ title: '💬 开发者回复了你', body: r.msg.x ? r.msg.x.slice(0, 120) : '[图片]', tag: 'chat', lvl: 'info', url: './?p=chat', force: true, nolog: true }); } catch (e) {} }
			return J({ ok: true, msg: pubMsg(r.msg) });
		}
		if (a[2] === 'img' && /^\d{1,8}$/.test(a[3] || '') && m === 'GET') { const im = await H.chatImg(tid, +a[3]); return im ? new Response(im.buf, { headers: { 'content-type': im.type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' } }) : J({ error: '图片没有了' }, 404); }
		if ((a[2] === 'block' || a[2] === 'unblock') && m === 'POST') { const ok = await H.chatSet(tid, 'blocked', a[2] === 'block'); if (ok) await H.alog(a[2] === 'block' ? 'chat_block' : 'chat_unblock', tid, ''); return J({ ok }, ok ? 200 : 404); }
		if (!a[2] && m === 'DELETE') { const ok = await H.chatDel(tid); if (ok) await H.alog('chat_del', tid, ''); return J({ ok }, ok ? 200 : 404); }
	}
	return null;
}

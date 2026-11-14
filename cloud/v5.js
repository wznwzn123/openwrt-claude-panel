// 5.0 新加的托管服务功能（装在 Hub 上，跟 ops.js 一样）：
//   · 数据备份：每天自动快照到另一个独立存储（留 7 天），可以在后台导出全部数据、恢复到某一天
//   · 前端报错上报：面板（经路由器转发）和管理后台的脚本出错，记进「出错记录」
//   · 实时对话：开发者不在线时自动回复一句；对话可以标为已解决；不在线时新消息发邮件、推送到开发者手机
//   · 公告：定时发布；多少台路由器收到了、多少人点开看了
//   · 管理后台：新 IP 登录发邮件提醒；可选两步验证（手机验证码 App，TOTP）
import { sendPush } from './worker.js';

const DAY = 86400e3;
const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const RID_RE = /^[a-f0-9]{16}$/;
const ANN_RE = /^[a-z2-9]{10}$/;
export const ADMIN_ONLINE_MS = 3 * 60e3; // 后台开着时每 15 秒问一次，3 分钟没动静就当不在线
const BAK_KEEP = 7;
const CHUNK = 100 * 1024;

/* ---------- 小工具：base64、gzip、TOTP ---------- */
export const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function gzip(text) { const cs = new CompressionStream('gzip'); const w = cs.writable.getWriter(); w.write(new TextEncoder().encode(text)); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
async function gunzip(u8) { const ds = new DecompressionStream('gzip'); const w = ds.writable.getWriter(); w.write(u8); w.close(); return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer()); }
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32enc(u8) { let bits = 0, v = 0, out = ''; for (const x of u8) { v = (v << 8) | x; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(v << (5 - bits)) & 31]; return out; }
export function b32dec(s) { s = String(s).toUpperCase().replace(/[^A-Z2-7]/g, ''); let bits = 0, v = 0; const out = []; for (const c of s) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }
export async function totp(secret, t = Date.now(), step = 0) {
	const key = await crypto.subtle.importKey('raw', b32dec(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
	const c = Math.floor(t / 30e3) + step, buf = new ArrayBuffer(8), dv = new DataView(buf);
	dv.setUint32(0, Math.floor(c / 2 ** 32)); dv.setUint32(4, c >>> 0);
	const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf)), o = h[19] & 15;
	const n = (((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6;
	return String(n).padStart(6, '0');
}
async function totpOk(secret, code) { code = String(code || '').replace(/\D/g, ''); if (code.length !== 6) return false; for (const s of [-1, 0, 1]) if ((await totp(secret, Date.now(), s)) === code) return true; return false; }
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('');
const rnd = (n) => b64(crypto.getRandomValues(new Uint8Array(n))).replace(/[^A-Za-z0-9]/g, '').slice(0, n);

/* ---------- 存储里的值转成能放进 JSON 的样子（图片是二进制） ---------- */
const enc = (v) => (v instanceof Uint8Array ? { $u8: b64(v) } : v instanceof ArrayBuffer ? { $u8: b64(new Uint8Array(v)) } : v);
const dec = (v) => (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v.$u8 === 'string' ? unb64(v.$u8) : v);

/* ---------- 装到 Hub 上的方法 ---------- */
export function installV5(Hub) {
	Object.assign(Hub.prototype, {
		async v5cfg() { return { autoOn: true, autoText: '收到啦！开发者现在不在线，看到后会尽快回复你（一般几个小时内）。回复会推送到你手机，不用一直开着这一页。', mailOn: true, pushOn: true, ...((await this.ctx.storage.get('v5cfg')) || {}) }; },
		async v5cfgSet(b) {
			const c = await this.v5cfg();
			if ('autoOn' in b) c.autoOn = !!b.autoOn;
			if ('autoText' in b) { const t = clip(b.autoText, 300).trim(); if (t) c.autoText = t; }
			if ('mailOn' in b) c.mailOn = !!b.mailOn;
			if ('pushOn' in b) c.pushOn = !!b.pushOn;
			await this.ctx.storage.put('v5cfg', c);
			return c;
		},
		// 管理员在不在线：后台开着时每个请求都会碰一下（30 秒内只写一次）
		async admTouch() { const now = Date.now(); if (this._admSeen && now - this._admSeen < 30e3) return; this._admSeen = now; await this.ctx.storage.put('adm:seen', now); },
		async admOnline() { const t = this._admSeen || (await this.ctx.storage.get('adm:seen')) || 0; return Date.now() - t < ADMIN_ONLINE_MS; },

		/* 实时对话：用户发来消息以后 */
		async v5AfterUserMsg(tid) {
			const t = await this.chatThread(tid);
			if (!t) return;
			if (t.done) await this.chatSet(tid, 'done', 0); // 已解决的对话又来消息：重新打开
			if (await this.admOnline()) return;
			const c = await this.v5cfg(), now = Date.now();
			// 自动回复：上次开发者回复（或上次自动回复）以后只回一次
			if (c.autoOn && (!t.autoAt || t.autoAt <= (t.lastAdmin || 0))) {
				const r = await this.chatSend({ tid, kind: t.kind, sub: t.sub, name: t.name, model: t.model }, 'b', c.autoText, '');
				if (r.st === 200) await this.chatSet(tid, 'autoAt', now);
			}
			// 提醒开发者：同一个对话 30 分钟内只提醒一次
			if (t.alertAt && now - t.alertAt < 30 * 60e3) return;
			await this.chatSet(tid, 'alertAt', now);
			const who = (t.name || '路由器') + (t.kind === 'hosted' ? '（托管版）' : '（自建版）');
			const text = t.preview || '';
			if (c.pushOn) await this.admPush({ title: '💬 ' + who + ' 发来消息', body: text.slice(0, 120), tag: 'chat-' + tid, url: '/admin/#/chat?t=' + tid });
			if (c.mailOn && this.env.ADMIN_EMAIL) await this.mail(String(this.env.ADMIN_EMAIL), '实时对话：' + who + ' 发来消息',
				`<p>${esc(who)} 在面板里给你发了消息：</p><blockquote style="border-left:3px solid #ccc;margin:0;padding:6px 12px;color:#333">${esc(text.slice(0, 500)) || '[图片]'}</blockquote><p>打开管理后台的「实时对话」回复。这个对话 30 分钟内再来消息不会重复发邮件。</p>`);
		},

		/* 推送到管理员手机（后台设置里打开） */
		async admSubs() { return (await this.ctx.storage.get('adm:subs')) || []; },
		async admSubAdd(sub, label) {
			if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return { st: 400, error: '推送订阅不对' };
			const l = (await this.admSubs()).filter((x) => x.endpoint !== sub.endpoint);
			l.unshift({ endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) }, label: clip(label, 60), at: Date.now() });
			await this.ctx.storage.put('adm:subs', l.slice(0, 10));
			return { st: 200, ok: true, n: Math.min(10, l.length) };
		},
		async admSubDel(endpoint) { const l = await this.admSubs(); await this.ctx.storage.put('adm:subs', l.filter((x) => x.endpoint !== endpoint)); return true; },
		async admPush(msg) {
			if (!this.env.VAPID_PRIV) return 0;
			const l = await this.admSubs(), keep = [];
			let n = 0;
			for (const s of l) {
				let st = 0;
				try { st = await sendPush(s, { ...msg, t: Date.now(), lvl: 'info', force: true }, this.env); } catch (e) { st = -1; }
				if (st === 404 || st === 410) continue;
				if (st >= 200 && st < 300) { n++; s.ok = Date.now(); } else s.err = st;
				keep.push(s);
			}
			if (keep.length !== l.length || n) await this.ctx.storage.put('adm:subs', keep);
			return n;
		},

		/* 公告：收到、点开的路由器（匿名编号，每条最多记 5000 台） */
		async annGot(rid, ids) {
			if (!RID_RE.test(rid)) return;
			const now = Date.now();
			for (const id of ids.slice(0, 20)) {
				const k = 'as:' + id, s = (await this.ctx.storage.get(k)) || { got: {}, seen: {} };
				if (s.got[rid]) continue;
				if (Object.keys(s.got).length >= 5000) continue;
				s.got[rid] = now;
				await this.ctx.storage.put(k, s);
			}
		},
		async annSeen(rid, ids) {
			if (!RID_RE.test(rid)) return false;
			const live = new Set((await this.anns(false)).map((a) => a.id)), now = Date.now();
			for (const id of ids.slice(0, 20)) {
				if (!ANN_RE.test(id) || !live.has(id)) continue;
				const k = 'as:' + id, s = (await this.ctx.storage.get(k)) || { got: {}, seen: {} };
				if (s.seen[rid] || Object.keys(s.seen).length >= 5000) continue;
				s.seen[rid] = now; if (!s.got[rid]) s.got[rid] = now;
				await this.ctx.storage.put(k, s);
			}
			return true;
		},
		async annStats(ids) { const m = await this.ctx.storage.get(ids.map((id) => 'as:' + id)), o = {}; for (const id of ids) { const s = m.get('as:' + id); o[id] = { got: s ? Object.keys(s.got).length : 0, seen: s ? Object.keys(s.seen).length : 0 }; } return o; },

		/* 前端报错（面板经路由器转发、管理后台直接报）：同一条一小时只记一次 */
		async clientErr(src, e, ip) {
			const msg = clip(e.msg, 300).replace(/[?#&](token|key|k|rkey|ckey|code|sess)=[^\s&'"]+/gi, '$1=…');
			const where = clip(e.where, 120).replace(/[?#].*$/, '');
			if (!msg) return false;
			const h = await sha(src + '|' + msg + '|' + where);
			if (!(await this.hit('ce:' + h.slice(0, 16), 1, 3600e3))) return false;
			if (ip && !(await this.hit('cei:' + ip, 30, 3600e3))) return false;
			const info = [e.ver ? 'v' + clip(e.ver, 20) : '', clip(e.ua, 60), e.w ? `${+e.w || 0}×${+e.h || 0}` : '', e.page ? '页面 ' + clip(e.page, 30) : ''].filter(Boolean).join(' · ');
			await this.errLog(src + '前端 ' + where, msg + (e.stack ? '\n' + clip(e.stack, 600).replace(/https?:\/\/[^\s)]+\//g, '') : '') + (info ? '\n' + info : ''));
			return true;
		},

		/* 管理后台：新 IP 登录提醒、两步验证 */
		async admLoginSeen(ip, ua, place) {
			if (!ip) return false;
			const l = (await this.ctx.storage.get('adm:ips')) || [], hit = l.find((x) => x.ip === ip), now = Date.now();
			if (hit) { hit.t = now; await this.ctx.storage.put('adm:ips', l); return false; }
			l.unshift({ ip, t: now, place: clip(place, 60), ua: clip(ua, 60) });
			await this.ctx.storage.put('adm:ips', l.slice(0, 50));
			// 第一次用（还没有记录过任何 IP）不提醒
			if (l.length === 1 || !this.env.ADMIN_EMAIL) return false;
			await this.mail(String(this.env.ADMIN_EMAIL), '管理后台在新的地方登录了',
				`<p>刚才有人用管理员密钥登录了托管服务的管理后台，这个 IP 以前没登录过：</p><ul><li>IP：${esc(ip)}</li><li>大概在：${esc(place || '未知')}</li><li>设备：${esc(ua || '未知')}</li><li>时间：${esc(new Date(now + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' '))}（北京时间）</li></ul><p>是你自己就不用管。<b>不是你的话</b>：马上在 GitHub 里换一把新的管理员密钥（Secrets 里的 HUB_ADMIN_KEY），再部署一次托管服务，旧密钥就没用了；也建议在后台「设置」里打开两步验证。</p>`);
			return true;
		},
		async tfa() { return (await this.ctx.storage.get('adm:2fa')) || null; },
		async tfaBegin() { const sec = b32enc(crypto.getRandomValues(new Uint8Array(20))); await this.ctx.storage.put('adm:2fa:new', { sec, at: Date.now() }); return sec; },
		async tfaEnable(code) {
			const n = await this.ctx.storage.get('adm:2fa:new');
			if (!n || Date.now() - n.at > 30 * 60e3) return { st: 400, error: '设置超时了，重新点一次「开启两步验证」' };
			if (!(await totpOk(n.sec, code))) return { st: 400, error: '验证码不对：看看手机上的时间准不准，或者等下一个验证码' };
			await this.ctx.storage.put('adm:2fa', { sec: n.sec, at: Date.now() });
			await this.ctx.storage.delete('adm:2fa:new');
			return { st: 200, ok: true };
		},
		async tfaDisable(code) { const t = await this.tfa(); if (!t) return { st: 200, ok: true }; if (!(await totpOk(t.sec, code))) return { st: 400, error: '验证码不对' }; await this.ctx.storage.delete('adm:2fa'); await this.ctx.storage.delete('adm:sess'); return { st: 200, ok: true }; },
		// 开了两步验证：登录时输入验证码换一个 12 小时有效的通行证，之后每个请求带着它；GitHub 里的自动任务用 HUB_TOTP_SECRET 现算验证码
		async tfaCheck(req) {
			const t = await this.tfa();
			if (!t) return true;
			const s = req.headers.get('x-adm-sess') || '', otp = req.headers.get('x-adm-otp') || '';
			if (s) { const l = (await this.ctx.storage.get('adm:sess')) || {}, h = await sha(s); if (l[h] && l[h] > Date.now()) return true; }
			if (otp && (await totpOk(t.sec, otp))) return true;
			return false;
		},
		async tfaLogin(code) {
			const t = await this.tfa();
			if (!t) return { st: 200, ok: true, sess: '' };
			if (!(await totpOk(t.sec, code))) return { st: 401, error: '验证码不对', need2fa: true };
			const s = rnd(32), l = (await this.ctx.storage.get('adm:sess')) || {}, now = Date.now();
			for (const k in l) if (l[k] < now) delete l[k];
			l[await sha(s)] = now + 12 * 3600e3;
			await this.ctx.storage.put('adm:sess', l);
			return { st: 200, ok: true, sess: s };
		},

		/* 数据备份：把全部数据导出成一份（图片转成文字），压缩后存到另一个独立存储 */
		async exportAll() {
			const out = {};
			let start;
			for (;;) {
				const m = await this.ctx.storage.list({ start, limit: 512 });
				let last = null;
				for (const [k, v] of m) { last = k; if (k === start) continue; if (k.startsWith('adm:sess') || k.startsWith('adm:2fa:new')) continue; out[k] = enc(v); }
				if (m.size < 512 || last == null) break;
				start = last;
			}
			return { v: 1, at: Date.now(), n: Object.keys(out).length, data: out };
		},
		async exportGz() { const e = await this.exportAll(); return { gz: await gzip(JSON.stringify(e)), n: e.n }; },
		async importAll(e) {
			if (!e || e.v !== 1 || typeof e.data !== 'object') return { st: 400, error: '备份文件不对' };
			return this.lock(async () => {
				// 先把现在的数据也存一份（万一恢复错了还能回来）
				await this.backupNow('恢复前');
				const keep = { 'adm:2fa': await this.ctx.storage.get('adm:2fa'), 'adm:seen': Date.now() };
				for (;;) { const ks = [...(await this.ctx.storage.list({ limit: 256 })).keys()]; if (!ks.length) break; await this.ctx.storage.delete(ks); if (ks.length < 256) break; }
				const ents = Object.entries(e.data);
				for (let i = 0; i < ents.length; i += 100) { const put = {}; for (const [k, v] of ents.slice(i, i + 100)) put[k] = dec(v); await this.ctx.storage.put(put); }
				for (const [k, v] of Object.entries(keep)) if (v != null) await this.ctx.storage.put(k, v);
				return { st: 200, ok: true, n: ents.length };
			});
		},
		bak() { return this.env.H.get(this.env.H.idFromName('hub-backup')); },
		async backupNow(why) {
			const { gz, n } = await this.exportGz(), at = Date.now(), id = new Date(at + 8 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, '');
			await this.bak().bakPut(id, b64(gz), { at, n, size: gz.length, why: clip(why || '每天自动', 20) });
			return { id, n, size: gz.length };
		},
		async backupDaily() {
			const d = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
			if ((await this.ctx.storage.get('bak:day')) === d) return null;
			const r = await this.backupNow('每天自动');
			await this.ctx.storage.put('bak:day', d);
			return r;
		},
		// 下面三个在「hub-backup」那个独立存储上运行
		async bakPut(id, data, meta) {
			const parts = Math.ceil(data.length / CHUNK), put = {};
			for (let i = 0; i < parts; i++) put['b:' + id + ':' + String(i).padStart(4, '0')] = data.slice(i * CHUNK, (i + 1) * CHUNK);
			for (const [k, v] of Object.entries(put)) await this.ctx.storage.put(k, v);
			const l = ((await this.ctx.storage.get('bl')) || []).filter((x) => x.id !== id);
			l.unshift({ id, parts, ...meta });
			// 每天自动的留最近 7 份；恢复前存的留最近 3 份
			const auto = l.filter((x) => x.why === '每天自动'), other = l.filter((x) => x.why !== '每天自动');
			const keep = [...auto.slice(0, BAK_KEEP), ...other.slice(0, 3)].sort((a, b) => b.at - a.at), drop = l.filter((x) => !keep.includes(x));
			for (const x of drop) for (let i = 0; i < x.parts; i++) await this.ctx.storage.delete('b:' + x.id + ':' + String(i).padStart(4, '0'));
			await this.ctx.storage.put('bl', keep);
			return keep.length;
		},
		async bakList() { return (await this.ctx.storage.get('bl')) || []; },
		async bakGet(id) {
			const x = (await this.bakList()).find((y) => y.id === id);
			if (!x) return null;
			let s = '';
			for (let i = 0; i < x.parts; i++) s += (await this.ctx.storage.get('b:' + id + ':' + String(i).padStart(4, '0'))) || '';
			return s;
		},
		async restoreFrom(id) {
			const s = await this.bak().bakGet(id);
			if (!s) return { st: 404, error: '没有这份备份' };
			let e; try { e = JSON.parse(await gunzip(unb64(s))); } catch (x) { return { st: 500, error: '备份读不出来' }; }
			return this.importAll(e);
		},
	});
}

/* ---------- 公开接口（路由器、面板用） ---------- */
export async function v5Public(req, env, H, body, u, p) {
	const ip = req.headers.get('cf-connecting-ip') || '';
	// 面板脚本出错（经路由器转发）
	if (p === '/api/cerr' && req.method === 'POST') {
		const b = await body();
		if (!b || typeof b !== 'object') return J({ error: 'bad' }, 400);
		await H.clientErr('面板', b, ip);
		return J({ ok: true });
	}
	// 公告点开看了（面板经路由器转发；匿名编号）
	if (p === '/api/notices/seen' && req.method === 'POST') {
		const b = await body();
		if (!(await H.hit('ans:' + ip, 60, 3600e3))) return J({ ok: true });
		await H.annSeen(String(b.r || ''), Array.isArray(b.ids) ? b.ids.map(String) : []);
		return J({ ok: true });
	}
	return null;
}

/* ---------- 管理后台接口 ---------- */
export async function v5Admin(req, a, H, body, u, env) {
	const m = req.method;
	if (a[0] === 'cerr' && m === 'POST') { const b = await body(); await H.clientErr('管理后台', b || {}, ''); return J({ ok: true }); }
	if (a[0] === 'v5cfg' && m === 'GET') return J({ ok: true, cfg: await H.v5cfg(), vapid: env.VAPID_PUB || '', subs: (await H.admSubs()).map((s) => ({ label: s.label, at: s.at, ok: s.ok || 0, err: s.err || 0, end: s.endpoint.slice(-12) })), tfa: !!(await H.tfa()), mail: !!env.ADMIN_EMAIL });
	if (a[0] === 'v5cfg' && m === 'POST') { const c = await H.v5cfgSet((await body()) || {}); await H.alog('settings', '', '对话提醒设置'); return J({ ok: true, cfg: c }); }
	// 推送到这台设备
	if (a[0] === 'push' && a[1] === 'sub' && m === 'POST') { const b = (await body()) || {}; const { st, ...r } = await H.admSubAdd(b.sub, b.label); return J(r, st); }
	if (a[0] === 'push' && a[1] === 'sub' && m === 'DELETE') { const b = (await body()) || {}; await H.admSubDel(String(b.endpoint || '')); return J({ ok: true }); }
	if (a[0] === 'push' && a[1] === 'test' && m === 'POST') { const n = await H.admPush({ title: '✅ 推送打开了', body: '有用户发来新消息、你又没开着后台时，会这样提醒你。', tag: 'adm-test', url: '/admin/#/settings' }); return J({ ok: n > 0, n }, n > 0 ? 200 : 400); }
	// 对话：标为已解决 / 重新打开
	if (a[0] === 'chat' && a[2] && (a[2] === 'done' || a[2] === 'undone') && m === 'POST') { const ok = await H.chatSet(a[1], 'done', a[2] === 'done' ? Date.now() : 0); return J({ ok }, ok ? 200 : 404); }
	// 公告收到、点开统计
	if (a[0] === 'ann-stats' && m === 'GET') { const ids = (await H.anns(true)).map((x) => x.id); return J({ ok: true, stats: await H.annStats(ids) }); }
	// 两步验证
	if (a[0] === '2fa' && a[1] === 'begin' && m === 'POST') { if (await H.tfa()) return J({ error: '已经开着了' }, 400); const sec = await H.tfaBegin(); return J({ ok: true, secret: sec, uri: `otpauth://totp/${encodeURIComponent('路由器托管服务:管理员')}?secret=${sec}&issuer=${encodeURIComponent('路由器托管服务')}&period=30&digits=6` }); }
	if (a[0] === '2fa' && a[1] === 'enable' && m === 'POST') { const { st, ...r } = await H.tfaEnable(((await body()) || {}).code); if (st === 200) await H.alog('2fa_on', '', '开启两步验证'); return J(r, st); }
	if (a[0] === '2fa' && a[1] === 'disable' && m === 'POST') { const { st, ...r } = await H.tfaDisable(((await body()) || {}).code); if (st === 200) await H.alog('2fa_off', '', '关闭两步验证'); return J(r, st); }
	// 数据备份
	if (a[0] === 'backups' && !a[1] && m === 'GET') return J({ ok: true, list: (await H.bak().bakList()).map(({ parts, ...x }) => x) });
	if (a[0] === 'backups' && a[1] === 'now' && m === 'POST') { const r = await H.backupNow('手动'); await H.alog('backup', '', '手动备份'); return J({ ok: true, ...r }); }
	if (a[0] === 'backups' && /^\d{12}$/.test(a[1] || '') && a[2] === 'restore' && m === 'POST') {
		const b = (await body()) || {};
		if (String(b.confirm || '') !== a[1]) return J({ error: '要输入备份编号确认' }, 400);
		const { st, ...r } = await H.restoreFrom(a[1]);
		if (st === 200) await H.alog('restore', '', '恢复到备份 ' + a[1]);
		return J(r, st);
	}
	if (a[0] === 'backups' && /^\d{12}$/.test(a[1] || '') && a[2] === 'download' && m === 'GET') {
		const s = await H.bak().bakGet(a[1]);
		if (!s) return J({ error: '没有这份备份' }, 404);
		return new Response(unb64(s), { headers: { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="hub-backup-${a[1]}.json.gz"`, 'cache-control': 'no-store' } });
	}
	if (a[0] === 'export' && m === 'GET') {
		const { gz } = await H.exportGz();
		await H.alog('export', '', '导出全部数据');
		const d = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, '');
		return new Response(gz, { headers: { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="hub-export-${d}.json.gz"`, 'cache-control': 'no-store' } });
	}
	return null;
}

/* ---------- 定时（每小时一次）：每天备份一次 ---------- */
export async function v5Scheduled(H) { try { await H.backupDaily(); } catch (e) { try { await H.errLog('定时备份', String(e && e.message || e)); } catch (x) {} } }

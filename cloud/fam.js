// 5.2 主账号 + 子账号（「家人」）：一台路由器只有一个主账号，家里其他人用主账号发的加入码成为子账号（最多 10 个）。
// 每个人都是独立的官网账号；主账号还是子账号按每台路由器分别算（d.owner / d.subs）。d.users 仍然是绑定这台路由器的
// 全部账号（主账号 + 子账号），老代码（反馈发邮件、对话里的对方信息、受保护判断）照常用。
// 子账号能做什么由主账号开关控制，路由器上检查（路由器每半分钟向这里问一次成员和权限）。
// 主账号管子账号、转让、解绑、看敏感信息，要先收一次邮箱验证码（10 分钟内有效）。
const DAY = 86400e3;
const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const ABC = 'abcdefghijkmnpqrstuvwxyz23456789';
const rnd = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => ABC[x & 31]).join('');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mask = (e) => { const [a, b] = String(e || '').split('@'); if (!b) return ''; return (a.length <= 2 ? a[0] + '*' : a.slice(0, 2) + '***') + '@' + b; };
const safeEq = (a, b) => { a = String(a || ''); b = String(b || ''); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const SUB_RE = /^[a-z0-9]{6,20}$/;
const UID_RE = /^[a-z2-9]{12}$/;

// 权限：「看」一直有；下面这些主账号可以单独开关
export const PERM_KEYS = ['msg', 'node', 'speed', 'parent', 'proxy', 'net', 'sys'];
// 安全加固（第二轮）：net 改成「完全控制」——原版路由器后台、OpenClash 自定义脚本和覆写、恢复备份都归它（这些都能在路由器上以 root 运行任何东西）；
// 「几乎全部」不再包含它。改之前给过「代理设置」或「网络设置」的子账号（v < 2），照旧能做原来能做的事，算作有「完全控制」，主页上标出来让主账号自己决定
export const PERM_NAMES = { msg: '联系开发者、问题反馈', node: '切换节点', speed: '网速测试', parent: '定时断网、设备不走代理', proxy: '改代理规则、订阅、配置', net: '完全控制（原版后台、脚本、恢复备份）', sys: '重启、服务管理、更新面板' };
export const TPL = { look: ['msg'], family: ['msg', 'node', 'speed'], most: ['msg', 'node', 'speed', 'parent', 'proxy', 'sys'] };
export const PV = 2;
// 子账号实际有的权限（老数据：给过「代理设置」的，以前就能写脚本，算作有「完全控制」）
export const permsOf = (s) => { const p = s && Array.isArray(s.perms) ? s.perms : []; return !s || s.v >= PV || !p.includes('proxy') || p.includes('net') ? p : PERM_KEYS.filter((k) => k === 'net' || p.includes(k)); };
export const TPL_NAMES = { look: '只看', family: '家人', most: '几乎全部', custom: '自定义' };
export const MAX_SUBS = 10, MAX_OWN = 20, MAX_JOINED = 20;
const cleanPerms = (p) => PERM_KEYS.filter((k) => Array.isArray(p) && p.includes(k));
const tplOf = (perms) => { for (const [k, v] of Object.entries(TPL)) if (v.length === perms.length && v.every((x) => perms.includes(x))) return k; return 'custom'; };
const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);

export function installFam(Hub) {
	Object.assign(Hub.prototype, {
		// 读成员：老数据只有 d.users。只绑了一个账号的，它就是主账号；绑了好几个的，等第一次打开面板时选（pick）
		famOf(d) {
			const users = d.users || [];
			if (!d.owner && users.length === 1) d.owner = users[0];
			if (d.owner && !users.includes(d.owner)) delete d.owner;
			const subs = d.subs || {};
			for (const k of Object.keys(subs)) if (!users.includes(k) || k === d.owner) delete subs[k];
			d.subs = subs;
			return { owner: d.owner || '', subs, pick: !d.owner && users.length > 1 };
		},
		famRole(d, uid) {
			const f = this.famOf(d);
			if (!uid) return '';
			if (f.owner === uid) return 'main';
			const s = f.subs[uid];
			if (s) return s.off ? 'off' : s.exp && s.exp < Date.now() ? 'expired' : 'sub';
			if (f.pick && (d.users || []).includes(uid)) return 'pick';
			return '';
		},
		async famPerson(uid, full) {
			const u = await this.ctx.storage.get('u:' + uid);
			if (!u) return null;
			return { uid, name: u.name || mask(u.email).split('@')[0], email: full ? u.email : mask(u.email), avatar: (await this.ctx.storage.get('av:' + uid)) || '' };
		},
		// 这台路由器的成员（主账号、子账号、还没被接受的加入码）
		async famMembers(sub, full) {
			const d = await this.ctx.storage.get('d:' + sub);
			if (!d) return null;
			const f = this.famOf(d), now = Date.now();
			const subs = [];
			for (const [uid, s] of Object.entries(f.subs)) { const p = await this.famPerson(uid, full); if (p) subs.push({ ...p, tpl: tplOf(permsOf(s)), perms: permsOf(s), exp: s.exp || 0, off: !!s.off, expired: !!(s.exp && s.exp < now), at: s.at || 0 }); }
			const joins = [];
			for (const c of d.joins || []) { const j = await this.ctx.storage.get('jc:' + c); if (j && j.exp > now) joins.push({ code: c, name: j.name, tpl: j.tpl, perms: j.perms, exp: j.exp, subExp: j.subExp || 0 }); }
			const users = [];
			if (f.pick) for (const uid of d.users || []) { const p = await this.famPerson(uid, full); if (p) users.push(p); }
			return { owner: f.owner ? await this.famPerson(f.owner, full) : null, subs: subs.sort((a, b) => a.at - b.at), joins, pick: f.pick, users, kick: d.kick || {} };
		},
		async famSave(d) { await this.ctx.storage.put('d:' + d.sub, d); },
		// 给路由器检查权限用：主账号、每个子账号的权限，账号被踢出的时间（之前拿到的手机钥匙作废）
		async famRouterView(sub) {
			const d = await this.ctx.storage.get('d:' + sub);
			if (!d) return null;
			const f = this.famOf(d), now = Date.now(), subs = {};
			for (const [uid, s] of Object.entries(f.subs)) subs[uid] = { perms: permsOf(s), ok: !s.off && !(s.exp && s.exp < now) };
			return { owner: f.owner, subs, pick: f.pick, kick: d.kick || {} };
		},
		// 这台路由器的操作记录（面板「我的主页 → 操作记录」）：只记谁、做了什么，不记邮箱；留最近 100 条
		async rlog(sub, ic, x) { const k = 'rl:' + sub, l = (await this.ctx.storage.get(k)) || []; l.unshift({ t: Date.now(), ic, x: String(x).slice(0, 120) }); await this.ctx.storage.put(k, l.slice(0, 100)); },
		async rname(uid) { const p = await this.famPerson(uid); return p ? p.name : '一个账号'; },
		async famRlog(sub) { return (await this.ctx.storage.get('rl:' + sub)) || []; },
		// 面板「我的主页」：我是谁（名字、头像、打了码的邮箱、注册时间）、在这台路由器上是什么身份
		async famDevMe(sub, uid) {
			const d = await this.ctx.storage.get('d:' + sub), u = await this.ctx.storage.get('u:' + uid);
			if (!d || !u) return { st: 404, error: '你的账号里没有这台路由器' };
			const role = this.famRole(d, uid);
			if (!['main', 'sub', 'off', 'expired', 'pick'].includes(role)) return { st: 403, error: '你已经不是这台路由器的成员了' };
			const f = this.famOf(d), sx = f.subs[uid], x = (u.devs || []).find((y) => y.sub === sub) || {};
			return { st: 200, ok: true, me: { uid, name: u.name || mask(u.email).split('@')[0], email: mask(u.email), avatar: (await this.ctx.storage.get('av:' + uid)) || '', created: u.created || 0, verified: !!u.verified, joined: x.at || 0 },
				role, perms: role === 'main' ? PERM_KEYS : sx ? permsOf(sx) : [], subExp: sx ? sx.exp || 0 : 0, owner: f.owner && f.owner !== uid ? await this.famPerson(f.owner) : null, nsub: Object.keys(f.subs).length,
				router: { name: d.name || sub, model: d.model || '', created: d.created || 0, exp: d.exp || 0 } };
		},
		// 敏感信息（确认本人以后）：完整邮箱、官网上登录着的设备、最近 30 天的登录记录
		async famDevSecret(sub, uid) {
			const u = await this.ctx.storage.get('u:' + uid);
			if (!u) return { st: 404, error: '没有这个账号' };
			const since = Date.now() - 30 * DAY, logins = [];
			for (const x of await this.loginList()) { if (x.t < since) break; if (x.who === u.email && x.k !== 'admin') logins.push({ t: x.t, k: x.k, ok: x.ok, why: x.why, place: x.place, ua: x.ua }); if (logins.length >= 50) break; }
			return { st: 200, ok: true, email: u.email, verified: !!u.verified, sessions: await this.sessionList(u, null), logins };
		},
		async famDevSessOut(sub, uid, id) {
			if (id) return this.sessionOut(uid, null, id);
			const u = await this.ctx.storage.get('u:' + uid);
			if (!u) return { st: 404, error: '没有这个账号' };
			const n = (u.sids || []).length;
			await this.dropSessions(u, null); u.trust = []; await this.ctx.storage.put('u:' + uid, u);
			return { st: 200, ok: true, n };
		},
		famKick(d, uid) { d.kick = { ...(d.kick || {}), [uid]: Date.now() }; const ks = Object.keys(d.kick); if (ks.length > 50) delete d.kick[ks[0]]; },
		async famMail(uid, subject, html) { const u = await this.ctx.storage.get('u:' + uid); if (u) await this.mail(u.email, subject, html); },

		/* ---------- 确认是本人（邮箱验证码）：主账号管子账号、转让、解绑，看敏感信息之前要做一次，10 分钟内有效 ---------- */
		async famSudoCode(sub, uid) {
			const d = await this.ctx.storage.get('d:' + sub), u = await this.ctx.storage.get('u:' + uid);
			if (!d || !u || !(d.users || []).includes(uid)) return { st: 404, error: '这个账号不在这台路由器里' };
			if (!this.env.RESEND_API_KEY) return { st: 200, ok: true, nomail: true };
			{ const b = await this.mailBlock(); if (b) return b; } // 今天邮件额度满了：明天再试（不会跳过验证）
			if (!(await this.hit('su1:' + uid, 1, 60e3))) return { st: 429, error: '发得太快了，1 分钟后再试' };
			if (!(await this.hit('sud:' + uid, 20, DAY))) return { st: 429, error: '今天发的验证码太多了，明天再试' };
			const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
			await this.ctx.storage.put('c:su:' + sub + ':' + uid, { code, exp: Date.now() + 600e3, tries: 0 });
			const ok = await this.mail(u.email, `验证码 ${code}（确认是你本人）`, `<p>你正在路由器「${esc(d.name || d.sub)}」的面板里做需要确认身份的操作（管理家人、看敏感信息等），验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>10 分钟内有效。<b>不是你本人在操作的话，不要告诉任何人这个验证码。</b></p>`);
			if (!ok) return (await this.mailBlock()) || { st: 502, error: '验证码邮件没发出去，稍后再试' };
			return { st: 200, ok: true, mail: mask(u.email) };
		},
		async famSudo(sub, uid, code) {
			const k = 'c:su:' + sub + ':' + uid;
			if (this.env.RESEND_API_KEY) {
				const c = await this.ctx.storage.get(k);
				if (!c || c.exp < Date.now()) return { st: 400, error: '验证码过期了，重新发一个' };
				if (!safeEq(String(code || '').trim(), c.code)) { c.tries++; if (c.tries >= 5) await this.ctx.storage.delete(k); else await this.ctx.storage.put(k, c); return { st: 400, error: '验证码不对' }; }
				await this.ctx.storage.delete(k);
			}
			const token = rnd(24), exp = Date.now() + 600e3;
			await this.ctx.storage.put('su:' + token, { sub, uid, exp });
			return { st: 200, ok: true, sudo: token, exp };
		},
		// 凭证什么时候过期（路由器那边按这个记，不会比官网记得久）
		async famSudoExp(sub, uid, token) { if (!(await this.famSudoOk(sub, uid, token))) return 0; return (await this.ctx.storage.get('su:' + token)).exp; },
		async famSudoOk(sub, uid, token) {
			if (!/^[a-z2-9]{24}$/.test(String(token || ''))) return false;
			const s = await this.ctx.storage.get('su:' + token);
			return !!s && s.sub === sub && s.uid === uid && s.exp > Date.now();
		},

		/* ---------- 官网上确认是本人（主账号解绑等）：收一次邮箱验证码，这次登录 10 分钟内有效 ---------- */
		async webSudoCode(uid) {
			const u = await this.ctx.storage.get('u:' + uid);
			if (!u) return { st: 401, error: '请先登录' };
			if (!this.env.RESEND_API_KEY) return { st: 200, ok: true, nomail: true };
			{ const b = await this.mailBlock(); if (b) return b; }
			if (!(await this.hit('ws1:' + uid, 1, 60e3))) return { st: 429, error: '发得太快了，1 分钟后再试' };
			if (!(await this.hit('wsd:' + uid, 20, DAY))) return { st: 429, error: '今天发的验证码太多了，明天再试' };
			const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
			await this.ctx.storage.put('c:ws:' + uid, { code, exp: Date.now() + 600e3, tries: 0 });
			const ok = await this.mail(u.email, `验证码 ${code}（确认是你本人）`, `<p>你正在官网账号里做需要确认身份的操作，验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>10 分钟内有效。不是你本人在操作的话，请马上改密码。</p>`);
			if (!ok) return (await this.mailBlock()) || { st: 502, error: '验证码邮件没发出去，稍后再试' };
			return { st: 200, ok: true, mail: mask(u.email) };
		},
		async webSudo(uid, sid, code) {
			if (this.env.RESEND_API_KEY) {
				const k = 'c:ws:' + uid, c = await this.ctx.storage.get(k);
				if (!c || c.exp < Date.now()) return { st: 400, error: '验证码过期了，重新发一个' };
				if (!safeEq(String(code || '').trim(), c.code)) { c.tries++; if (c.tries >= 5) await this.ctx.storage.delete(k); else await this.ctx.storage.put(k, c); return { st: 400, error: '验证码不对' }; }
				await this.ctx.storage.delete(k);
			}
			const ss = await this.ctx.storage.get('s:' + sid);
			if (!ss || ss.uid !== uid) return { st: 401, error: '请先登录' };
			ss.sudo = Date.now() + 600e3; await this.ctx.storage.put('s:' + sid, ss);
			return { st: 200, ok: true, exp: ss.sudo };
		},
		async webSudoOk(sid) { const ss = sid && (await this.ctx.storage.get('s:' + sid)); return !!ss && (ss.sudo || 0) > Date.now(); },

		/* ---------- 官网「打开面板」：发一张两分钟有效、只能用一次的票，路由器拿它来问这里是谁、什么身份 ---------- */
		famOpen(uid, sub) { return this.lock(() => this._famOpen(uid, sub)); },
		async _famOpen(uid, sub) {
			const d = await this.ctx.storage.get('d:' + sub), u = await this.ctx.storage.get('u:' + uid);
			if (!d || d.state !== 'ok' || !u || !(u.devs || []).some((x) => x.sub === sub)) return { st: 404, error: '你的账号里没有这台路由器' };
			const role = this.famRole(d, uid);
			if (role === 'pick') return { st: 200, ok: true, pick: true, ...(await this.famMembers(sub)) };
			if (role === 'off') return { st: 403, error: '主账号暂时停用了你在这台路由器上的权限' };
			if (role === 'expired') return { st: 403, error: '你在这台路由器上的使用期限到了，请找主账号延长' };
			if (role !== 'main' && role !== 'sub') return { st: 404, error: '你的账号里没有这台路由器' };
			if (d.off) return { st: 403, error: d.offWhy === 'exp' ? '托管服务到期了，专属网址暂停了，续期后才能打开' : '这台路由器的托管服务停用了' };
			if (!(await this.hit('op:' + uid, 60, 3600e3))) return { st: 429, error: '打开得太频繁了，过一会儿再试' };
			const t = rnd(24);
			await this.ctx.storage.put('ot:' + t, { sub, uid, exp: Date.now() + 120e3 });
			await this.famSave(d);
			return { st: 200, ok: true, url: 'https://' + sub + '.' + this.env.BASE_DOMAIN + '/panel/#open=' + t };
		},
		// 路由器（凭 RKEY）拿票换身份；票只能用一次
		devTicket(a) { return this.lock(() => this._devTicket(a)); },
		async _devTicket({ sub, rkey, ticket }) {
			if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
			if (await this.devOff(sub)) return { st: 403, error: '这台路由器的托管服务已停用' };
			const k = 'ot:' + String(ticket || ''), t = /^[a-z2-9]{24}$/.test(String(ticket || '')) && (await this.ctx.storage.get(k));
			if (!t || t.exp < Date.now() || t.sub !== sub) return { st: 400, error: '这个链接过期了：回到官网「我的路由器」重新点「打开面板」' };
			await this.ctx.storage.delete(k);
			const d = await this.ctx.storage.get('d:' + sub), role = d && this.famRole(d, t.uid);
			if (role !== 'main' && role !== 'sub') return { st: 403, error: '你已经不是这台路由器的成员了' };
			const p = await this.famPerson(t.uid), s = role === 'sub' ? d.subs[t.uid] : null;
			return { st: 200, ok: true, uid: t.uid, role, name: p.name, email: p.email, perms: s ? permsOf(s) : PERM_KEYS, now: Date.now() };
		},

		/* ---------- 已经绑了多个账号的老路由器：选一个当主账号（只有这一次）。被选的人收验证码确认，其他人变成子账号（家人） ---------- */
		async famPickCode(uid, sub, target) {
			const d = await this.ctx.storage.get('d:' + sub);
			if (!d || !(d.users || []).includes(uid)) return { st: 404, error: '你的账号里没有这台路由器' };
			if (!this.famOf(d).pick) return { st: 400, error: '这台路由器已经有主账号了' };
			if (!(d.users || []).includes(target)) return { st: 400, error: '只能从已经绑定这台路由器的账号里选' };
			const t = await this.ctx.storage.get('u:' + target);
			if (!t) return { st: 400, error: '这个账号不在了' };
			if (this.env.RESEND_API_KEY) { const b = await this.mailBlock(); if (b) return b; }
			if (!(await this.hit('pk1:' + sub, 1, 60e3))) return { st: 429, error: '发得太快了，1 分钟后再试' };
			if (!(await this.hit('pkd:' + sub, 20, DAY))) return { st: 429, error: '今天发的验证码太多了，明天再试' };
			const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
			await this.ctx.storage.put('c:pick:' + sub, { code, target, by: uid, exp: Date.now() + 600e3, tries: 0 });
			if (this.env.RESEND_API_KEY) {
				const ok = await this.mail(t.email, `验证码 ${code}（确认当路由器「${d.name || d.sub}」的主账号）`, `<p>路由器「${esc(d.name || d.sub)}」现在要选一个主账号，你被选中了。主账号权限最大，家里其他人会变成你的子账号，能做什么由你决定。</p><p>验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>10 分钟内有效。不想当主账号就不用管这封邮件。</p>`);
				if (!ok) return (await this.mailBlock()) || { st: 502, error: '验证码邮件没发出去，稍后再试' };
			}
			return { st: 200, ok: true, mail: mask(t.email), nomail: !this.env.RESEND_API_KEY ? code : undefined };
		},
		famPick(uid, sub, code) { return this.lock(() => this._famPick(uid, sub, code)); },
		async _famPick(uid, sub, code) {
			const d = await this.ctx.storage.get('d:' + sub), k = 'c:pick:' + sub, c = await this.ctx.storage.get(k);
			if (!d || !(d.users || []).includes(uid)) return { st: 404, error: '你的账号里没有这台路由器' };
			if (!this.famOf(d).pick) return { st: 400, error: '这台路由器已经有主账号了' };
			if (!c || c.exp < Date.now()) return { st: 400, error: '验证码过期了，重新发一个' };
			if (!safeEq(String(code || '').trim(), c.code)) { c.tries++; if (c.tries >= 5) await this.ctx.storage.delete(k); else await this.ctx.storage.put(k, c); return { st: 400, error: '验证码不对' }; }
			await this.ctx.storage.delete(k);
			if (!(d.users || []).includes(c.target)) return { st: 400, error: '这个账号已经解绑了，重新选一个' };
			d.owner = c.target; d.subs = {};
			const now = Date.now();
			for (const x of d.users) if (x !== c.target) d.subs[x] = { tpl: 'family', perms: [...TPL.family], v: PV, at: now, by: 'pick' };
			await this.famSave(d);
			const o = await this.famPerson(c.target);
			for (const x of d.users) await this.famMail(x, `路由器「${d.name || d.sub}」选好了主账号`, `<p>路由器「${esc(d.name || d.sub)}」的主账号定为 <b>${esc(o.name)}</b>（${esc(o.email)}）。</p><p>${x === c.target ? '你是主账号，权限最大。家里其他人现在是你的子账号（「家人」权限：看状态、切换节点、测网速、联系开发者），在面板「我的主页 → 子账号」里可以改。' : '你现在是这台路由器的子账号，权限是「家人」（看状态、切换节点、测网速、联系开发者），主账号可以调整。'}</p><p>如果有误，请联系开发者处理。</p>`);
			await this.alog('fam-pick', sub, '选了主账号 ' + o.email, 'user');
			return { st: 200, ok: true };
		},

		/* ---------- 加入码：主账号发给家人，家人用自己的官网账号加入，成为子账号 ---------- */
		devJoinCreate(a) { return this.lock(() => this._devJoinCreate(a)); },
		async _devJoinCreate({ sub, uid, name, perms, subExp }) {
			const d = await this.ctx.storage.get('d:' + sub);
			if (!d || this.famRole(d, uid) !== 'main') return { st: 403, error: '只有主账号能加子账号' };
			const now = Date.now();
			d.joins = [];
			for (const c of (await this.ctx.storage.get('d:' + sub)).joins || []) { const j = await this.ctx.storage.get('jc:' + c); if (j && j.exp > now) d.joins.push(c); }
			if (Object.keys(d.subs || {}).length + d.joins.length >= MAX_SUBS) return { st: 400, error: `一台路由器最多 ${MAX_SUBS} 个子账号（还没被接受的加入码也算）` };
			if (!(await this.hit('jcr:' + sub, 30, DAY))) return { st: 429, error: '今天发的加入码太多了，明天再试' };
			const p = cleanPerms(perms), n = cleanName(name) || '家人';
			let code; do { code = rnd(8).toUpperCase(); } while (await this.ctx.storage.get('jc:' + code));
			const exp = now + DAY, se = +subExp > now ? Math.min(+subExp, now + 3650 * DAY) : 0;
			await this.ctx.storage.put('jc:' + code, { sub, by: uid, name: n, perms: p, tpl: tplOf(p), v: PV, subExp: se, exp, at: now });
			d.joins.push(code);
			await this.famSave(d);
			return { st: 200, ok: true, code, exp, link: 'https://' + this.env.BASE_DOMAIN + '/app?join=' + code };
		},
		async devJoinCancel({ sub, uid, code }) {
			const d = await this.ctx.storage.get('d:' + sub);
			if (!d || this.famRole(d, uid) !== 'main') return { st: 403, error: '只有主账号能撤回加入码' };
			code = String(code || '').toUpperCase();
			if (!(d.joins || []).includes(code)) return { st: 404, error: '没有这个加入码' };
			await this.ctx.storage.delete('jc:' + code);
			d.joins = d.joins.filter((x) => x !== code); await this.famSave(d);
			return { st: 200, ok: true };
		},
		// 家人这边：先看一眼（谁邀请的、哪台路由器、什么权限），再点「加入」
		async famJoinInfo(uid, code) {
			if (!(await this.hit('jf:' + uid, 30, 3600e3))) return { st: 429, error: '试太多次了，一小时后再试' };
			code = String(code || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
			const j = code.length === 8 && (await this.ctx.storage.get('jc:' + code));
			if (!j || j.exp < Date.now()) return { st: 400, error: '加入码不对或已过期（24 小时内有效、只能用一次）。请主账号重新发一个' };
			const d = await this.ctx.storage.get('d:' + j.sub), o = d && (await this.famPerson(d.owner || j.by));
			if (!d || !o) return { st: 400, error: '这台路由器已经不在了' };
			return { st: 200, ok: true, code, router: d.name || d.sub, owner: o.name, ownerMail: o.email, ownerAvatar: o.avatar, perms: j.perms, tpl: j.tpl, subExp: j.subExp || 0, mine: this.famRole(d, uid) };
		},
		famJoin(uid, code) { return this.lock(() => this._famJoin(uid, code)); },
		async _famJoin(uid, code) {
			const info = await this.famJoinInfo(uid, code);
			if (info.st !== 200) return info;
			const j = await this.ctx.storage.get('jc:' + info.code), d = await this.ctx.storage.get('d:' + j.sub), u = await this.ctx.storage.get('u:' + uid);
			if (!u) return { st: 401, error: '请先登录' };
			const role = this.famRole(d, uid);
			if (role === 'main') return { st: 400, error: '你就是这台路由器的主账号' };
			if (role === 'sub' || role === 'off' || role === 'expired') return { st: 400, error: '你已经是这台路由器的子账号了' };
			if (Object.keys(d.subs || {}).length >= MAX_SUBS) return { st: 400, error: `这台路由器的子账号满了（最多 ${MAX_SUBS} 个）` };
			const joined = (u.devs || []).length;
			if (joined >= MAX_OWN + MAX_JOINED) return { st: 400, error: '你的账号里路由器太多了' };
			await this.ctx.storage.delete('jc:' + info.code);
			d.joins = (d.joins || []).filter((x) => x !== info.code);
			d.users = [...new Set([...(d.users || []), uid])];
			d.subs = { ...(d.subs || {}), [uid]: { tpl: j.tpl, perms: j.perms, ...(j.v ? { v: j.v } : {}), exp: j.subExp || 0, at: Date.now(), by: j.by, label: j.name } };
			u.devs = [...(u.devs || []).filter((x) => x.sub !== j.sub), { sub: j.sub, at: Date.now() }];
			await this.ctx.storage.put({ ['d:' + d.sub]: d, ['u:' + uid]: u });
			const me = await this.famPerson(uid);
			await this.rlog(j.sub, '👋', me.name + ' 用加入码成为子账号（' + (TPL_NAMES[j.tpl] || '自定义') + '）');
			await this.famMail(d.owner, `${me.name} 加入了你的路由器「${d.name || d.sub}」`, `<p><b>${esc(me.name)}</b>（${esc(me.email)}）用你发的加入码成为了路由器「${esc(d.name || d.sub)}」的子账号，权限：${esc(TPL_NAMES[j.tpl] || '自定义')}。</p><p>不认识的话，在面板「我的主页 → 子账号」里把他移除。</p>`);
			return { st: 200, ok: true, sub: j.sub, name: d.name || d.sub };
		},
		// 子账号自己退出
		famLeave(uid, sub) { return this.lock(() => this._famLeave(uid, sub)); },
		async _famLeave(uid, sub) {
			const d = await this.ctx.storage.get('d:' + sub), u = await this.ctx.storage.get('u:' + uid);
			if (!d || !u) return { st: 404, error: '你的账号里没有这台路由器' };
			const role = this.famRole(d, uid);
			if (role === 'main') return { st: 400, error: '你是主账号：要先在面板「我的主页」里把主账号转给别人，或者解绑这台路由器' };
			if (!['sub', 'off', 'expired', 'pick'].includes(role)) return { st: 404, error: '你的账号里没有这台路由器' };
			await this.famDrop(d, uid);
			await this.famSave(d);
			u.devs = (u.devs || []).filter((x) => x.sub !== sub); await this.ctx.storage.put('u:' + uid, u);
			await this.rlog(sub, '🚪', (await this.rname(uid)) + ' 自己退出了');
			if (d.owner) { const me = await this.famPerson(uid); await this.famMail(d.owner, `${me ? me.name : '一个子账号'} 退出了你的路由器「${d.name || d.sub}」`, `<p>${esc(me ? me.name + '（' + me.email + '）' : '一个子账号')} 自己退出了路由器「${esc(d.name || d.sub)}」，他的手机已经打不开这台路由器的面板了。</p>`); }
			return { st: 200, ok: true };
		},
		async famDrop(d, uid) { d.users = (d.users || []).filter((x) => x !== uid); if (d.subs) delete d.subs[uid]; this.famKick(d, uid); },

		/* ---------- 主账号在面板里管子账号（经路由器转来，带着「确认是本人」的凭证） ---------- */
		devSubSet(a) { return this.lock(() => this._devSubSet(a)); },
		async _devSubSet({ sub, uid, target, perms, subExp, off }) {
			const d = await this.ctx.storage.get('d:' + sub);
			if (!d || this.famRole(d, uid) !== 'main') return { st: 403, error: '只有主账号能改子账号' };
			const s = (d.subs || {})[target];
			if (!s) return { st: 404, error: '没有这个子账号' };
			if (perms !== undefined) { s.perms = cleanPerms(perms); s.tpl = tplOf(s.perms); s.v = PV; }
			if (subExp !== undefined) s.exp = +subExp > Date.now() ? Math.min(+subExp, Date.now() + 3650 * DAY) : 0;
			if (off !== undefined) { s.off = !!off; if (s.off) this.famKick(d, target); }
			await this.famSave(d);
			const tn = await this.rname(target);
			await this.rlog(sub, off === true ? '⏸' : off === false ? '▶️' : '🔧', off === true ? '主账号停用了 ' + tn : off === false ? '主账号恢复了 ' + tn : perms !== undefined ? '主账号把 ' + tn + ' 的权限改成「' + (TPL_NAMES[s.tpl] || '自定义') + '」' : '主账号改了 ' + tn + ' 的使用期限');
			return { st: 200, ok: true };
		},
		devSubRemove(a) { return this.lock(() => this._devSubRemove(a)); },
		async _devSubRemove({ sub, uid, target }) {
			const d = await this.ctx.storage.get('d:' + sub);
			if (!d || this.famRole(d, uid) !== 'main') return { st: 403, error: '只有主账号能移除子账号' };
			if (!(d.subs || {})[target]) return { st: 404, error: '没有这个子账号' };
			await this.rlog(sub, '➖', '主账号移除了子账号 ' + (await this.rname(target)));
			await this.famDrop(d, target); await this.famSave(d);
			const u = await this.ctx.storage.get('u:' + target);
			if (u) { u.devs = (u.devs || []).filter((x) => x.sub !== sub); await this.ctx.storage.put('u:' + target, u); await this.mail(u.email, `你已经不是路由器「${d.name || d.sub}」的子账号了`, `<p>主账号把你从路由器「${esc(d.name || d.sub)}」的子账号里移除了，你的手机已经打不开这台路由器的面板了。</p>`); }
			return { st: 200, ok: true };
		},
		// 把主账号转给一个子账号（自己变成子账号，权限「几乎全部」）
		devTransfer(a) { return this.lock(() => this._devTransfer(a)); },
		async _devTransfer({ sub, uid, target }) {
			const d = await this.ctx.storage.get('d:' + sub);
			if (!d || this.famRole(d, uid) !== 'main') return { st: 403, error: '只有主账号能转让' };
			if (!(d.subs || {})[target]) return { st: 404, error: '只能转给这台路由器的子账号' };
			await this.famSetOwner(d, target, uid, '主账号转让');
			return { st: 200, ok: true };
		},
		famAdminOwner(sub, o, why) { return this.lock(() => this._famAdminOwner(sub, o, why)); },
		async _famAdminOwner(sub, { target, email, dropOld }, why) {
			const d = await this.ctx.storage.get('d:' + sub);
			if (!d) return { st: 404, error: '没有这台路由器' };
			const f = this.famOf(d);
			if (!UID_RE.test(target) && email) target = (await this.ctx.storage.get('e:' + email.trim().toLowerCase())) || '';
			const u = target && (await this.ctx.storage.get('u:' + target));
			if (!u) return { st: 404, error: '找不到这个账号' };
			if (!(u.devs || []).some((x) => x.sub === sub)) { u.devs = [...(u.devs || []), { sub, at: Date.now() }]; await this.ctx.storage.put('u:' + target, u); }
			const old = f.owner;
			await this.famSetOwner(d, target, old, '开发者处理：' + why);
			if (dropOld && old && old !== target) { await this.famDrop(d, old); await this.famSave(d); const ou = await this.ctx.storage.get('u:' + old); if (ou) { ou.devs = (ou.devs || []).filter((x) => x.sub !== sub); await this.ctx.storage.put('u:' + old, ou); } }
			await this.alog('fam-owner', sub, '管理员把主账号换成 ' + u.email + (dropOld ? '，原主账号解绑' : '') + '：' + why);
			return { st: 200, ok: true };
		},
		famAdminSub(sub, o, why) { return this.lock(() => this._famAdminSub(sub, o, why)); },
		async _famAdminSub(sub, { target, remove, perms, off, subExp }, why) {
			const d = await this.ctx.storage.get('d:' + sub);
			if (!d) return { st: 404, error: '没有这台路由器' };
			this.famOf(d);
			const s = (d.subs || {})[target];
			if (!s) return { st: 404, error: '没有这个子账号' };
			const u = await this.ctx.storage.get('u:' + target);
			if (remove) { await this.famDrop(d, target); if (u) { u.devs = (u.devs || []).filter((x) => x.sub !== sub); await this.ctx.storage.put('u:' + target, u); } }
			else { if (perms) { s.perms = cleanPerms(perms); s.tpl = tplOf(s.perms); s.v = PV; } if (off !== undefined) { s.off = !!off; if (s.off) this.famKick(d, target); } if (subExp !== undefined) s.exp = +subExp > Date.now() ? +subExp : 0; }
			await this.famSave(d);
			await this.rlog(sub, '🛠', '开发者' + (remove ? '移除了子账号 ' : '改了子账号 ') + (u ? u.name || mask(u.email).split('@')[0] : '') + '（' + why + '）');
			await this.alog('fam-sub', sub, (remove ? '移除子账号 ' : '改子账号 ') + (u ? u.email : target) + '：' + why);
			return { st: 200, ok: true };
		},
		// 管理员：让一个账号所有设备都退出（官网登录、记住的设备、各台路由器上的手机钥匙）
		famAdminKick(uid, why) { return this.lock(() => this._famAdminKick(uid, why)); },
		async _famAdminKick(uid, why) {
			const u = await this.ctx.storage.get('u:' + uid);
			if (!u) return { st: 404, error: '没有这个账号' };
			await this.dropSessions(u, null); u.trust = [];
			await this.ctx.storage.put('u:' + uid, u);
			for (const x of u.devs || []) { const d = await this.ctx.storage.get('d:' + x.sub); if (d) { this.famKick(d, uid); await this.famSave(d); } }
			await this.mail(u.email, '你的账号已在所有设备上退出', `<p>开发者应你的要求（或者为了账号安全），让你的账号在所有设备上退出了：官网要重新登录（新设备要收邮箱验证码），路由器面板要从官网重新打开。原因：${esc(why)}</p>`);
			await this.alog('fam-kick', u.email, '所有设备退出：' + why);
			return { st: 200, ok: true };
		},
		// 管理员：改账号的登录邮箱（本人邮箱不能用了，开发者确认是本人以后）
		famAdminEmail(uid, email, why) { return this.lock(() => this._famAdminEmail(uid, email, why)); },
		async _famAdminEmail(uid, email, why) {
			const u = await this.ctx.storage.get('u:' + uid);
			if (!u) return { st: 404, error: '没有这个账号' };
			email = String(email || '').trim().toLowerCase();
			if (!/^[^@\s<>"']+@[^@\s<>"']+\.[a-z]{2,}$/i.test(email) || email.length > 100) return { st: 400, error: '邮箱格式不对' };
			if (await this.ctx.storage.get('e:' + email)) return { st: 409, error: '这个邮箱已经注册过别的账号了' };
			const old = u.email;
			await this.ctx.storage.delete('e:' + old);
			u.email = email; u.verified = false; u.trust = [];
			await this.dropSessions(u, null);
			await this.ctx.storage.put({ ['u:' + uid]: u, ['e:' + email]: uid });
			const html = `<p>开发者把你的官网账号登录邮箱从 ${esc(old)} 改成了 ${esc(email)}。原因：${esc(why)}</p><p>请用新邮箱在官网「忘记密码」里重设密码后登录。不是你本人要求的话，请马上联系开发者。</p>`;
			await this.mail(old, '你的账号登录邮箱被改了', html); await this.mail(email, '你的账号登录邮箱改成了这个邮箱', html);
			await this.alog('fam-email', email, '登录邮箱 ' + old + ' → ' + email + '：' + why);
			return { st: 200, ok: true };
		},
		async famSetOwner(d, target, old, why) {
			await this.rlog(d.sub, '👑', '主账号换成了 ' + (await this.rname(target)) + (why ? '（' + why + '）' : ''));
			const now = Date.now();
			this.famOf(d);
			if (!(d.users || []).includes(target)) d.users = [...(d.users || []), target];
			if (d.subs) delete d.subs[target];
			if (old && old !== target && (d.users || []).includes(old)) d.subs = { ...(d.subs || {}), [old]: { tpl: 'most', perms: [...TPL.most], v: PV, at: now, by: 'transfer' } };
			d.owner = target;
			if (old && old !== target) this.famKick(d, old);
			await this.famSave(d);
			const n = await this.famPerson(target);
			for (const x of [target, old].filter(Boolean)) await this.famMail(x, `路由器「${d.name || d.sub}」换了主账号`, `<p>路由器「${esc(d.name || d.sub)}」的主账号现在是 <b>${esc(n.name)}</b>（${esc(n.email)}）。原因：${esc(why)}。</p><p>${x === target ? '你现在是主账号。' : '你现在是子账号（权限「几乎全部」），原来的手机要从官网重新打开面板。'}如果不是你们自己的操作，请马上联系开发者。</p>`);
			await this.alog('fam-owner', d.sub, '主账号换成 ' + n.email + '（' + why + '）', old ? 'user' : 'admin');
		},
	});
}

/* ---------- 官网账号接口（/api/account/fam/...） ---------- */
export async function famAccount(a, H, me, b, sid) {
	const s = (v) => String(v == null ? '' : v);
	const out = (r) => { const { st, ...rest } = r; return J(rest, st || 200); };
	if (a === 'fam/open') return out(await H.famOpen(me.uid, s(b.sub)));
	if (a === 'sudo_code') return out(await H.webSudoCode(me.uid));
	if (a === 'sudo') return out(await H.webSudo(me.uid, sid, s(b.code)));
	if (a === 'fam/pick_code') return out(await H.famPickCode(me.uid, s(b.sub), s(b.target)));
	if (a === 'fam/pick') return out(await H.famPick(me.uid, s(b.sub), s(b.code)));
	if (a === 'fam/join_info') return out(await H.famJoinInfo(me.uid, s(b.code)));
	if (a === 'fam/join') return out(await H.famJoin(me.uid, s(b.code)));
	if (a === 'fam/leave') return out(await H.famLeave(me.uid, s(b.sub)));
	return null;
}

/* ---------- 路由器接口（凭 RKEY；面板「我的主页」经路由器转来，带着手机钥匙对应的账号 uid） ---------- */
export async function famDev(p, H, b) {
	if (!p.startsWith('/api/dev/fam/') && p !== '/api/dev/ticket') return null;
	const s = (v) => String(v == null ? '' : v);
	const out = (r) => { const { st, ...rest } = r; return J(rest, st || 200); };
	const sub = s(b.sub);
	if (!(await H.devOk(sub, s(b.rkey)))) return J({ error: '钥匙不对' }, 403);
	if (p === '/api/dev/ticket') return out(await H.devTicket({ sub, rkey: s(b.rkey), ticket: s(b.ticket) }));
	const op = p.slice('/api/dev/fam/'.length), uid = s(b.uid);
	if (op === 'view') { const v = await H.famRouterView(sub); return v ? J({ ok: true, ...v }) : J({ error: '没有这台路由器' }, 404); }
	if (!UID_RE.test(uid)) return J({ error: '账号不对' }, 400);
	if (op === 'members') { const m = await H.famMembers(sub); return m ? J({ ok: true, ...m, me: uid }) : J({ error: '没有这台路由器' }, 404); }
	if (op === 'me') return out(await H.famDevMe(sub, uid));
	if (op === 'profile') { const r = await H.famDevMe(sub, uid); if (r.st !== 200) return out(r); return out(await H.setProfile(uid, { name: b.name === undefined ? undefined : s(b.name), avatar: b.avatar === undefined ? undefined : s(b.avatar) })); }
	if (op === 'log') { const r = await H.famDevMe(sub, uid); if (r.st !== 200) return out(r); return J({ ok: true, list: await H.famRlog(sub) }); }
	if (op === 'leave') return out(await H.famLeave(uid, sub));
	if (op === 'sudo_code') return out(await H.famSudoCode(sub, uid));
	if (op === 'sudo') {
		// 面板「敏感信息」验证码对了，顺便把敏感信息带回去（省一次路由器转发）
		const r = await H.famSudo(sub, uid, s(b.code));
		if (r.st === 200 && b.want === 'secret') { const x = await H.famDevSecret(sub, uid); if (x.st === 200) { const { st, ...y } = x; r.secret = y; } }
		return out(r);
	}
	// 面板「我的主页」一次拿全：我是谁、家人、操作记录；带着有效的确认凭证时再加上敏感信息（原来要分 4 次经路由器转发，慢）
	if (op === 'page') {
		const r = await H.famDevMe(sub, uid);
		if (r.st !== 200) return out(r);
		const { st, ...me } = r;
		const [m, log] = await Promise.all([H.famMembers(sub), H.famRlog(sub)]);
		let secret = null;
		if (b.sudo && (await H.famSudoOk(sub, uid, s(b.sudo)))) { const x = await H.famDevSecret(sub, uid); if (x.st === 200) { const { st: _st, ...y } = x; secret = y; } }
		return J({ ok: true, me, members: m ? { ok: true, ...m, me: uid } : null, log, secret });
	}
	// 下面这些都要先确认是本人
	if (!(await H.famSudoOk(sub, uid, s(b.sudo)))) return J({ error: '要先确认是你本人（邮箱验证码）', sudo: true }, 403);
	// 路由器问：这个凭证还有效吗（面板「敏感信息」里看登录密钥、连接器地址这些路由器上的东西时，路由器先问一下）
	if (op === 'sudo_ok') return J({ ok: true, exp: await H.famSudoExp(sub, uid, s(b.sudo)) });
	if (op === 'secret') return out(await H.famDevSecret(sub, uid));
	if (op === 'sess_out') return out(b.all ? await H.famDevSessOut(sub, uid, '') : await H.famDevSessOut(sub, uid, s(b.id)));
	if (op === 'join_create') return out(await H.devJoinCreate({ sub, uid, name: s(b.name), perms: b.perms, subExp: b.subExp }));
	if (op === 'join_cancel') return out(await H.devJoinCancel({ sub, uid, code: s(b.code) }));
	if (op === 'sub_set') return out(await H.devSubSet({ sub, uid, target: s(b.target), perms: b.perms, subExp: b.subExp, off: b.off }));
	if (op === 'sub_remove') return out(await H.devSubRemove({ sub, uid, target: s(b.target) }));
	if (op === 'transfer') return out(await H.devTransfer({ sub, uid, target: s(b.target) }));
	return J({ error: 'not found' }, 404);
}

/* ---------- 管理后台：主账号丢了、家里有争议时，开发者帮忙改（每次都要写原因，记日志，发邮件） ---------- */
export async function famAdmin(a, H, body, m) {
	if (a[0] !== 'fam') return null;
	const sub = a[1] || '';
	if (!SUB_RE.test(sub)) return J({ error: '路由器编号不对' }, 400);
	if (m === 'GET' && !a[2]) { const r = await H.famMembers(sub, true); return r ? J({ ok: true, ...r }) : J({ error: '没有这台路由器' }, 404); }
	if (m !== 'POST') return null;
	const b = (await body()) || {}, why = String(b.why || '').trim().slice(0, 200);
	if (why.length < 2) return J({ error: '要写一句原因' }, 400);
	const out = (r) => { const { st, ...rest } = r; return J(rest, st || 200); };
	if (a[2] === 'owner') return out(await H.famAdminOwner(sub, { target: String(b.target || ''), email: String(b.email || ''), dropOld: !!b.dropOld }, why));
	if (a[2] === 'sub') return out(await H.famAdminSub(sub, { target: String(b.target || ''), remove: !!b.remove, perms: b.perms, off: b.off, subExp: b.subExp }, why));
	return J({ error: 'not found' }, 404);
}
// 账号相关（让所有设备退出、改登录邮箱）：/api/admin/famuser/<uid>/kick|email
export async function famAdminUser(a, H, body, m) {
	if (a[0] !== 'famuser' || m !== 'POST' || !UID_RE.test(a[1] || '')) return null;
	const b = (await body()) || {}, why = String(b.why || '').trim().slice(0, 200);
	if (why.length < 2) return J({ error: '要写一句原因' }, 400);
	const out = (r) => { const { st, ...rest } = r; return J(rest, st || 200); };
	if (a[2] === 'kick') return out(await H.famAdminKick(a[1], why));
	if (a[2] === 'email') return out(await H.famAdminEmail(a[1], String(b.email || ''), why));
	return J({ error: 'not found' }, 404);
}

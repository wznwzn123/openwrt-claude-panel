// 5.2 安装码：托管版要先在官网注册账号。邀请码在官网兑换成「安装码」（7 天有效、只能装一台），安装命令里带着它，
// 装好后路由器自动加到这个账号里，他就是主账号。没用掉的安装码过期后删掉，名额还给原来的邀请码。
// 免费试用也是一个安装码：每个账号最多领几次由管理后台设置（默认 1 次）。
const DAY = 86400e3;
export const INST_DAYS = 7, INST_MAX_OPEN = 5;
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const rnd = (n) => { const a = 'abcdefghijkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(n)); let s = ''; for (const x of b) s += a[x % a.length]; return s; };

export function installInst(Hub) {
	Object.assign(Hub.prototype, {
		async trialMax() { const v = await this.ctx.storage.get('m:trialMax'); return v == null ? 1 : v; },
		async setTrialMax(n) { n = Math.max(0, Math.min(20, Math.round(+n || 0))); await this.ctx.storage.put('m:trialMax', n); return n; },
		// 手上还没用的安装码（试用的、邀请码兑换的）
		async instList(u) {
			const now = Date.now(), list = [];
			const codes = [...new Set([...(u.inst || []), ...(u.trial && u.trial.code && !u.trial.used ? [u.trial.code] : [])])];
			for (const c of codes) {
				const i = await this.ctx.storage.get('i:' + c);
				if (!i || i.uid !== u.uid || i.off || i.used >= i.max || (i.exp && i.exp < now)) continue;
				list.push({ code: c, kind: i.trial ? 'trial' : 'inst', exp: i.exp || 0, svc: i.svc || 0, at: i.created || 0 });
			}
			return list.sort((a, b) => b.at - a.at);
		},
		// 试用：用掉了几次、还能领几次
		async trialState(u) {
			const max = await this.trialMax(), days = this.trialDays();
			const used = Math.max(u.trialUsed || 0, u.trial && u.trial.used ? 1 : 0);
			const open = (await this.instList(u)).filter((x) => x.kind === 'trial').length;
			return { days, max, used, open, left: Math.max(0, max - used - open) };
		},
		redeem(uid, code) { return this.lock(() => this._redeem(uid, code)); },
		async _redeem(uid, code) {
			const u = await this.ctx.storage.get('u:' + uid);
			if (!u) return { st: 401, error: '请先登录' };
			if (this.env.RESEND_API_KEY && !u.verified) return { st: 403, error: '先验证邮箱才能兑换邀请码' };
			if (!(await this.hit('rd:' + uid, 20, DAY))) return { st: 429, error: '今天试太多次了，明天再试' };
			code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
			const now = Date.now(), inv = code && (await this.ctx.storage.get('i:' + code));
			if (!inv || inv.off) return { st: 400, error: '邀请码不对，再检查一下' };
			if (inv.uid) return { st: 400, error: inv.uid === uid ? '这已经是你的安装码了：在下面「我的安装码」里复制安装命令就行' : '这是别人的安装码，不能兑换。找提供服务的人要邀请码' };
			if (inv.exp && inv.exp < now) return { st: 400, error: '邀请码已经过期了' };
			if (inv.used >= inv.max) return { st: 400, error: '邀请码已经用完了' };
			if ((await this.instList(u)).length >= INST_MAX_OPEN) return { st: 400, error: `你手上已经有 ${INST_MAX_OPEN} 个没用的安装码了：先把它们装掉，或者等过期` };
			let nc; do { nc = rnd(10).toUpperCase(); } while ((await this.ctx.storage.get('i:' + nc)) || (await this.ctx.storage.get('k:' + nc)));
			const exp = now + INST_DAYS * DAY;
			const ic = { max: 1, used: 0, created: now, exp, note: ('安装码：' + u.email).slice(0, 60), svc: inv.svc || 0, uid, from: code, kind: 'inst' };
			inv.used++;
			inv.reds = [...(inv.reds || []), { uid, email: u.email, code: nc, at: now }].slice(-200);
			u.inst = [...(u.inst || []), nc].slice(-20);
			await this.ctx.storage.put({ ['i:' + nc]: ic, ['i:' + code]: inv, ['u:' + uid]: u });
			await this.alog('redeem', u.email, `用邀请码 ${code} 兑换了安装码 ${nc}`, 'user');
			return { st: 200, ok: true, code: nc, exp, svc: ic.svc };
		},
		// 过期没用的安装码（含试用的）：删掉；邀请码兑换的把名额还回去
		async instSweep() {
			const now = Date.now(); let n = 0;
			for (const [k, i] of await this.ctx.storage.list({ prefix: 'i:' })) {
				if (!i || !i.uid || i.used > 0 || !i.exp || i.exp > now) continue;
				await this.ctx.storage.delete(k); n++;
				if (i.from) {
					const s = await this.ctx.storage.get('i:' + i.from);
					if (s) { s.used = Math.max(0, (s.used || 0) - 1); const r = (s.reds || []).find((x) => x.code === k.slice(2)); if (r) r.back = now; await this.ctx.storage.put('i:' + i.from, s); }
				}
			}
			return n;
		},
	});
}

// 账号接口：/api/account/redeem（邀请码换安装码）
export async function instAccount(a, H, me, b) {
	if (a !== 'redeem') return null;
	const r = await H.redeem(me.uid, String(b.code || ''));
	const { st, ...rest } = r; return J(rest, st || 200);
}
// 管理后台：试用每个账号能领几次
export async function instAdmin(a, H, body, m) {
	if (a[0] !== 'trialmax') return null;
	if (m === 'GET') return J({ ok: true, max: await H.trialMax(), days: H.trialDays() });
	if (m === 'POST') { const b = (await body()) || {}; const n = await H.setTrialMax(b.max); await H.alog('trialmax', '', '每个账号最多领 ' + n + ' 次试用'); return J({ ok: true, max: n }); }
	return null;
}

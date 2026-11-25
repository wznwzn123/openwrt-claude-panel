// 6.0 第 94 项：托管版的「AI 版 / 本地版」
// 本地版跟 AI 版唯一的区别是不装隧道，只能在家里局域网打开面板（http://路由器地址:906）；账号、家人、推送、云端备份、更新都一样。
// 换版本只有主账号能做，两个入口：
//   面板「我的主页」：路由器自己运行 cmcp-edition，中途问这里要隧道（/api/dev/edition），做完报结果（/api/dev/edres）
//   官网「我的路由器」：这里记下指令，路由器下次心跳时带回去执行（3 分钟内），执行完同样报结果
// 失败（下载不了、空间不够、隧道接不上、这里开不了隧道）路由器自动退回原来的版本，报上来的原因记在这台路由器上，管理后台能看到
const DAY = 86400e3;
const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const ABC = 'abcdefghijkmnpqrstuvwxyz23456789';
const rnd = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => ABC[x & 31]).join('');
const txt = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
export const ED_NAME = { ai: 'AI 版', local: '本地版', noai: '纯面板版（旧）' };
// 「换成」后面接英文开头的要空一格：换成 AI 版、换成本地版
const EN = (to) => (/^[A-Za-z]/.test(ED_NAME[to]) ? ' ' : '') + ED_NAME[to];
// 失败在哪一步（路由器报的）→ 给人看的话
export const ED_STEP = { hub: '官网开通隧道', space: '路由器空间', download: '下载隧道程序', tunnel: '连接隧道', write: '写入设置', busy: '正在换', other: '其他' };
const ID_RE = /^[a-z2-9]{10}$/;

export function installEdition(Hub, { edToTunnel, edToLocal }) {
	Object.assign(Hub.prototype, {
		// 这台路由器现在是哪个版本：官网记的本地版为准；不是本地版的看路由器心跳报的（旧的纯面板版报 noai）
		edOf(d, b) { return d && d.local ? 'local' : b && b.ed === 'noai' ? 'noai' : 'ai'; },
		edJobOut(d) { const j = d && d.edJob; return j ? { id: j.id, to: j.to, at: j.at, state: j.state, step: j.step || '', why: j.why || '', by: j.by || '' } : null; },

		/* ---- 路由器（凭 RKEY）：换版本要用的隧道 ---- */
		devEdition(a) { return this.lock(() => this._devEdition(a)); },
		async _devEdition({ sub, rkey, to }) {
			if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
			if (to !== 'ai' && to !== 'local') return { st: 400, error: '要换成哪个版本？' };
			const d = await this.ctx.storage.get('d:' + sub);
			if (!d || d.state !== 'ok') return { st: 404, error: '没有这台路由器' };
			if (d.off) return { st: 403, error: d.offWhy === 'exp' ? '托管服务到期了：续期以后再换' : '这台路由器的托管服务停用了' };
			if (!(await this.hit('edh:' + sub, 10, 3600e3))) return { st: 429, error: '换得太频繁了：一小时后再试' };
			const h = sub + '.' + this.env.BASE_DOMAIN;
			if (to === 'local') {
				if (d.local) return { st: 200, ok: true, local: true };
				try { const r = await edToLocal(this.env, sub, d); d.dns = r.dns; }
				catch (e) { await this.ctx.storage.put('d:' + sub, d); return { st: 502, error: '官网这边改不了网址：' + e.message, step: 'hub' }; }
				delete d.tunnel; d.local = true;
				await this.ctx.storage.put('d:' + sub, d);
				await this.watch(sub).setProbe('');
				return { st: 200, ok: true, local: true };
			}
			// 换成 AI 版：已经有隧道（AI 版、旧的纯面板版打开 AI）就不用再建
			if (!d.local) return { st: 200, ok: true, local: false, keep: true };
			let made;
			try { made = await edToTunnel(this.env, sub, d); }
			catch (e) { await this.ctx.storage.put('d:' + sub, d); return { st: 502, error: '官网这边开不了隧道：' + e.message, step: 'hub' }; }
			d.tunnel = made.tunnel; d.dns = made.dns; delete d.local;
			await this.ctx.storage.put('d:' + sub, d);
			await this.watch(sub).setProbe('https://' + h + '/panel/manifest.json');
			return { st: 200, ok: true, local: false, token: made.token, host: h };
		},
		// 路由器报换版本的结果（成功、失败在哪一步、为什么）
		devEdRes(a) { return this.lock(() => this._devEdRes(a)); },
		async _devEdRes({ sub, rkey, id, to, ok, step, why }) {
			if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
			const d = await this.ctx.storage.get('d:' + sub);
			if (!d) return { st: 404, error: '没有这台路由器' };
			to = to === 'local' ? 'local' : 'ai';
			id = ID_RE.test(String(id || '')) ? id : rnd(10);
			step = ED_STEP[step] ? step : 'other';
			why = txt(why, 200);
			const now = Date.now(), by = d.edJob && d.edJob.id === id ? d.edJob.by : 'panel';
			d.edJob = { id, to, at: now, state: ok ? 'ok' : 'fail', ...(ok ? {} : { step, why }), by };
			if (ok) delete d.edFail;
			else d.edFail = { at: now, to, step, why };
			await this.ctx.storage.put('d:' + sub, d);
			const c = await this.watch(sub).getCfg();
			if (c && c.cmd && c.cmd.id === id) await this.watch(sub).setCmd(null);
			if (ok) await this.rlog(sub, to === 'local' ? '🏠' : '🌐', '换成了' + EN(to) + (to === 'local' ? '：只能在家里打开面板' : '：在哪都能打开面板'));
			else {
				await this.rlog(sub, '⚠️', '换成' + EN(to) + '没成功（' + ED_STEP[step] + '）' + (why ? '：' + why : '') + '，已退回原来的版本');
				await this.alog('edfail', sub, '换成' + EN(to) + '失败：' + ED_STEP[step] + (why ? '，' + why : ''), 'router');
			}
			return { st: 200, ok: true };
		},

		/* ---- 官网「我的路由器」：主账号让路由器换版本 ---- */
		accEdition(uid, sub, to) { return this.lock(() => this._accEdition(uid, sub, to)); },
		async _accEdition(uid, sub, to) {
			if (to !== 'ai' && to !== 'local') return { st: 400, error: '要换成哪个版本？' };
			const d = await this.ctx.storage.get('d:' + sub);
			if (!d || d.state !== 'ok' || this.famRole(d, uid) !== 'main') return { st: 403, error: '只有主账号能换版本' };
			if (d.off) return { st: 403, error: d.offWhy === 'exp' ? '托管服务到期了：续期以后再换' : '这台路由器的托管服务停用了' };
			let b = null; try { b = await this.watch(sub).brief(); } catch (e) {}
			const cur = this.edOf(d, b);
			if (cur === to) return { st: 400, error: '已经是' + EN(to) + '了' };
			if (!b || !b.last || Date.now() - b.last > 10 * 60e3) return { st: 409, error: '路由器现在不在线：等它连上官网再换' };
			if (b.ver && !/^(6|[7-9]|\d{2,})\./.test(b.ver)) return { st: 409, error: '路由器上的面板版本太旧：先升级到 6.0 再换' };
			const j = d.edJob;
			if (j && j.state === 'wait' && Date.now() - j.at < 10 * 60e3) return { st: 409, error: '上一次换版本还没做完，等几分钟' };
			if (!(await this.hit('eda:' + sub, 6, 3600e3))) return { st: 429, error: '换得太频繁了：一小时后再试' };
			const id = rnd(10), now = Date.now();
			d.edJob = { id, to, at: now, state: 'wait', by: 'web' };
			await this.ctx.storage.put('d:' + sub, d);
			await this.watch(sub).setCmd({ id, to, at: now });
			await this.rlog(sub, '🔁', (await this.rname(uid)) + ' 在官网让路由器换成' + EN(to));
			return { st: 200, ok: true, job: this.edJobOut(d) };
		},
	});
}

// 路由器那边的接口（凭 RKEY）
export async function edDev(p, H, b) {
	const s = (v) => String(v == null ? '' : v);
	if (p === '/api/dev/edition') { const r = await H.devEdition({ sub: s(b.sub), rkey: s(b.rkey), to: s(b.to) }); const { st, ...rest } = r; return J(rest, st); }
	if (p === '/api/dev/edres') { const r = await H.devEdRes({ sub: s(b.sub), rkey: s(b.rkey), id: s(b.id), to: s(b.to), ok: b.ok === true, step: s(b.step), why: s(b.why) }); const { st, ...rest } = r; return J(rest, st); }
	return null;
}
// 官网账号的接口
export async function edAccount(a, H, me, b, sid) {
	if (a !== 'edition') return null;
	// 换版本会让面板在外面打不开（换成本地版）、或者开到公网上（换成 AI 版）：先确认是本人
	if (!(await H.webSudoOk(sid))) return J({ error: '要先确认是你本人（邮箱验证码）', sudo: true }, 403);
	const r = await H.accEdition(me.uid, String(b.sub || ''), String(b.to || ''));
	const { st, ...rest } = r;
	return J(rest, st);
}

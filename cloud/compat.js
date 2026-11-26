// 6.0 第 56–60 项：兼容情况
// - 57 路由器每天匿名报一次：型号、系统、面板版本、哪些功能能用、开不了的功能和原因（不带账号、IP、设备、网址、钥匙；用户能关）
//   只认路由器自己生成的随机编号（cp:编号），不记 IP（只按 IP 限次）；90 天没再报的自动删掉
// - 56 官网公开兼容性表：从这些上报里汇总（只写实测到的），不显示编号
// - 59 管理后台：同一个问题（功能 + 原因）合并成一条，按型号列出影响多少台；终端里的安装失败上报也一起归类
// - 60 修好了：管理后台标「在 vX 修好了」→ 报过这个问题的路由器下次上报时收到，推送到手机「更新到 vX 就好」；安装失败的发邮件
// - 58 尝鲜：面板里报名，管理后台挑人；挑中的路由器能更新到 GitHub 上标成「预发布」的新版本，随时能退回正式版
// - 95 尝鲜改成申请制（用户 11/25 定）：申请 → 后台同意 / 拒绝；随时能撤销这台设备或这个申请人的全部设备，撤销后要重新申请。
//   后台只看匿名信息（型号、系统、版本、闪存、内存、兼容问题、留言），申请人只显示匿名编号：托管版按官网账号算，自建版按邮箱算。
//   托管版的专属网址编号、自建版的邮箱只存在这里用来认人和通知结果（托管版推送，自建版发邮件），管理后台的接口不返回
const DAY = 86400e3, KEEP = 90 * DAY;
const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const ID_RE = /^[a-z2-9]{16}$/;
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
// 原因里不能带个人信息（路由器上已经洗过一遍，这里再洗一遍）：网址、邮箱、MAC、IP、像钥匙的长串
export const scrub = (t) => String(t == null ? '' : t)
	.replace(/[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"'<>]*/g, '<网址>')
	.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<邮箱>')
	.replace(/[0-9a-fA-F]{2}([:-][0-9a-fA-F]{2}){5}/g, '<MAC>')
	.replace(/([0-9a-fA-F]{1,4}:){3,7}[0-9a-fA-F]{1,4}/g, '<IP>')
	.replace(/([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{0,4}::[0-9a-fA-F:]*/g, '<IP>')
	.replace(/\d{1,3}(\.\d{1,3}){3}/g, '<IP>')
	.replace(/[A-Za-z0-9_+/=-]{24,}/g, '<…>');
const ipKey = async (ip) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cpi|' + (ip || '?'))))].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
// 功能名（路由器报上来的只认这些）
export const FEATS = { install: '安装', tunnel: '远程访问（隧道）', update: '一键更新', pause: '暂停上网', ban: '自动拉黑', backup: '云端备份', lfull: '完整原版后台', sudo: '确认本人（路由器密码）', proxy: '代理插件', wifi: 'Wi‑Fi 设置', other: '其他' };
// 同一个问题：功能 + 原因（去掉数字，免得「剩 37 MB」「剩 36 MB」算成两条）
export async function issueKey(f, why) {
	const n = String(why || '').replace(/[0-9]+(\.[0-9]+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 200);
	const h = [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(f + '|' + n)))].slice(0, 5).map((b) => b.toString(16).padStart(2, '0')).join('');
	return f + '-' + h;
}
// 尝鲜申请人的匿名编号：同一个人（托管版的官网账号 / 自建版的邮箱）几台路由器一样，看不出是谁
const pidOf = async (k) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bp|' + k)))].slice(0, 8).map((b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');
const MAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[A-Za-z]{2,24}$/;
export const BETA_ST = { wait: '等审核', ok: '已通过', no: '没通过', rev: '已撤销' };
const verLt = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
const okVer = (v) => /^\d+\.\d+\.\d+$/.test(String(v || ''));
// 路由器报上来的「能不能用」：只认这些键，值只认短字符串
const CAPS = ['fw', 'pkg', 'nft', 'ipset', 'pause', 'verify', 'crypt', 'rpcd', 'cfd', 'wifi', 'ucode', 'proxy'];

export function installCompat(Hub) {
	Object.assign(Hub.prototype, {
		compatPut(b, ip) { return this.lock(() => this._compatPut(b, ip)); },
		async _compatPut(b, ip) {
			const id = String(b.id || '');
			if (!ID_RE.test(id)) return { st: 400, error: 'bad id' };
			if (!(await this.hit('cpi:' + (await ipKey(ip)), 40, DAY)) || !(await this.hit('cpd:' + id, 8, DAY))) return { st: 429, error: '报得太频繁了' };
			const now = Date.now(), old = (await this.ctx.storage.get('cp:' + id)) || {};
			const caps = {}; for (const k of CAPS) if (b.caps && b.caps[k] != null) caps[k] = str(b.caps[k], 24);
			// 开不了的功能：跟以前报过的合并（同一个问题只留一条，记第一次和最近一次），最多 20 条
			const fails = Array.isArray(old.fails) ? old.fails.filter((x) => now - (x.last || x.at || 0) < KEEP) : [];
			for (const x of Array.isArray(b.fails) ? b.fails.slice(0, 10) : []) {
				const f = FEATS[x && x.f] ? x.f : 'other', why = str(scrub(x && x.why), 300);
				if (!why) continue;
				const key = await issueKey(f, why), y = fails.find((z) => z.key === key);
				if (y) { y.last = now; y.why = why; y.ver = str(b.ver, 16); } else fails.push({ key, f, why, at: now, last: now, ver: str(b.ver, 16) });
			}
			// 尝鲜申请（第 95 项）：路由器带着申请时间；拒绝 / 撤销以后，只有比那次决定更晚的申请才算重新申请
			let ap = old.ap || (old.beta ? { st: old.betaOk ? 'ok' : 'wait', at: old.betaAt || now, pid: '', note: '' } : null), apErr = '';
			if (b.beta !== true) ap = null;
			else {
				const app = b.app && typeof b.app === 'object' ? b.app : {}, appAt = Math.max(0, +app.at || 0) * 1000;
				const fresh = !ap || ((ap.st === 'no' || ap.st === 'rev') && appAt > (ap.dec || 0));
				if (fresh || (ap && !ap.pid)) {
					let who = null;
					if (app.sub) { if (await this.devOk(String(app.sub), String(app.rkey || ''))) { const d = await this.ctx.storage.get('d:' + app.sub); const u = d && (d.owner || (d.users || [])[0]); who = u ? { pid: await pidOf('u|' + u), sub: String(app.sub), hosted: true } : null; } }
					else if (MAIL_RE.test(String(app.email || ''))) { const em = String(app.email).trim().toLowerCase(); who = { pid: await pidOf('m|' + em), email: em, hosted: false }; }
					if (!who) apErr = app.sub ? '官网认不出这台路由器：确认托管服务没到期再申请' : '申请尝鲜要留一个邮箱（只用来通知结果）';
					else if (fresh) ap = { st: 'wait', at: now, note: str(scrub(app.note), 200), ...who };
					else ap = { ...ap, ...who };
				}
				if (ap && ap.st === 'wait' && app.note != null && appAt > (ap.at || 0) - 1000) ap.note = str(scrub(app.note), 200);
			}
			const rec = { at: old.at || now, last: now, ver: str(b.ver, 16), code: str(b.code, 24), model: str(b.model, 80), plat: str(b.plat, 80), sys: str(b.sys, 80), kernel: str(b.kernel, 40),
				mem: Math.max(0, Math.min(65536, +b.mem || 0)), flash: Math.max(0, Math.min(1048576, +b.flash || 0)), caps, fails: fails.slice(-20), ap, beta: !!ap, betaOk: !!ap && ap.st === 'ok', betaAt: ap ? ap.at : 0 };
			await this.ctx.storage.put('cp:' + id, rec);
			// 告诉路由器：报过的问题里哪些修好了（在哪个版本）、尝鲜挑中了没有、有没有比正式版新的尝鲜版
			const fix = (await this.ctx.storage.get('cpfix')) || {}, fixed = [];
			for (const x of rec.fails) { const z = fix[x.key]; if (z && okVer(z.ver)) fixed.push({ key: x.key, f: x.f, title: FEATS[x.f] || '其他', ver: z.ver, note: z.note || '' }); }
			let beta = null;
			if (rec.betaOk) { const p = await this.meta('prerel'); beta = { ok: true, st: 'ok', ...(p && p.tag ? { tag: p.tag, ver: p.ver } : {}) }; }
			else if (rec.ap) beta = { ok: false, st: rec.ap.st, at: rec.ap.at, dec: rec.ap.dec || 0 };
			else if (apErr) beta = { ok: false, st: 'err', why: apErr };
			return { st: 200, ok: true, fixed, beta };
		},
		// 管理后台：同一个问题合并，按型号列出影响多少台；安装失败上报（终端里同意后发来的）也一起归类
		async compatAdmin() {
			const now = Date.now(), groups = {}, del = [], vol = [];
			let n = 0;
			for (const [k, r] of await this.ctx.storage.list({ prefix: 'cp:' })) {
				if (now - (r.last || 0) > KEEP) { del.push(k); continue; }
				n++;
				for (const x of r.fails || []) {
					const g = groups[x.key] || (groups[x.key] = { key: x.key, f: x.f, title: FEATS[x.f] || '其他', why: x.why, n: 0, models: {}, vers: {}, sys: {}, first: x.at, last: x.last, src: 'auto' });
					g.n++; g.models[r.model || '没认出型号'] = (g.models[r.model || '没认出型号'] || 0) + 1; g.vers[x.ver || r.ver || '?'] = 1; g.sys[r.sys || '?'] = (g.sys[r.sys || '?'] || 0) + 1;
					g.first = Math.min(g.first, x.at); g.last = Math.max(g.last, x.last);
				}
				// 尝鲜申请：只给匿名信息（不给专属网址编号、邮箱）
				if (r.ap) vol.push({ id: k.slice(3), pid: r.ap.pid || '', hosted: !!r.ap.hosted, st: r.ap.st, ok: r.ap.st === 'ok', at: r.ap.at, dec: r.ap.dec || 0, note: r.ap.note || '', model: r.model, plat: r.plat, sys: r.sys, kernel: r.kernel, ver: r.ver, code: r.code, mem: r.mem, flash: r.flash, caps: r.caps || {}, fails: (r.fails || []).map((x) => ({ f: x.f, title: FEATS[x.f] || '其他', why: x.why, last: x.last })), last: r.last });
			}
			if (del.length) for (let i = 0; i < del.length; i += 128) await this.ctx.storage.delete(del.slice(i, i + 128));
			// 安装失败上报：从内容里认出型号、系统、错误（终端里的上报格式见 install.sh）
			for (const x of ((await this.ctx.storage.get('fbl')) || []).filter((y) => y.kind === 'install' && now - y.at < KEEP)) {
				const t = String(x.text || ''), line = (k) => ((new RegExp('^' + k + '：(.*)$', 'm').exec(t) || [])[1] || '').trim();
				const why = line('错误') || t.split('\n')[0];
				const key = 'i' + (await issueKey('install', why));
				const g = groups[key] || (groups[key] = { key, f: 'install', title: '安装', why, n: 0, models: {}, vers: {}, sys: {}, first: x.at, last: x.at, src: 'install', codes: [] });
				const m = line('型号') || '没认出型号';
				g.n++; g.models[m] = (g.models[m] || 0) + 1; g.vers[(line('面板版本') || '?').replace(/（.*$/, '')] = 1; g.sys[line('系统').replace(/（.*$/, '') || '?'] = (g.sys[line('系统').replace(/（.*$/, '') || '?'] || 0) + 1;
				g.first = Math.min(g.first, x.at); g.last = Math.max(g.last, x.at); g.codes.push(x.code);
			}
			const fix = (await this.ctx.storage.get('cpfix')) || {};
			const list = Object.values(groups).map((g) => ({ ...g, models: Object.entries(g.models).sort((a, b) => b[1] - a[1]).map(([model, c]) => ({ model, n: c })), vers: Object.keys(g.vers).sort(), sys: Object.entries(g.sys).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, c]) => ({ sys: s, n: c })), fixed: fix[g.key] || null })).sort((a, b) => (!!a.fixed - !!b.fixed) || b.n - a.n || b.last - a.last);
			// 同一个申请人有几台
			const per = {}; for (const v of vol) if (v.pid) per[v.pid] = (per[v.pid] || 0) + 1;
			for (const v of vol) v.pidN = v.pid ? per[v.pid] : 1;
			const ord = { wait: 0, ok: 1, no: 2, rev: 3 };
			return { routers: n, list, volunteers: vol.sort((a, b) => ord[a.st] - ord[b.st] || b.at - a.at) };
		},
		// 标「在 vX 修好了」：自动上报的，路由器下次上报时收到推送；安装失败的，给认得出账号的人发邮件（重新运行安装命令就好）
		compatFix(key, ver, note) { return this.lock(() => this._compatFix(key, ver, note)); },
		async _compatFix(key, ver, note) {
			key = String(key || '');
			if (!/^i?[a-z]+-[0-9a-f]{10}$/.test(key)) return { st: 400, error: '问题编号不对' };
			const fix = (await this.ctx.storage.get('cpfix')) || {};
			if (ver === null) { delete fix[key]; await this.ctx.storage.put('cpfix', fix); return { st: 200, ok: true }; }
			if (!okVer(String(ver || '').replace(/^v/, ''))) return { st: 400, error: '版本号写成 6.0.1 这样' };
			fix[key] = { ver: String(ver).replace(/^v/, ''), note: str(note, 200), at: Date.now() };
			await this.ctx.storage.put('cpfix', fix);
			let mailed = 0;
			if (key.startsWith('i')) {
				const g = (await this.compatAdmin()).list.find((x) => x.key === key);
				for (const c of (g && g.codes) || []) {
					const x = ((await this.ctx.storage.get('fbl')) || []).find((y) => y.code === c);
					if (!x || !(x.emails || [])[0] || x.fixMailed) continue;
					if (await this.fbMail(x, x.emails[0], '你上报的安装问题修好了', `<p>你好，</p><p>你之前在路由器上安装失败时上报的问题，在 v${fix[key].ver} 修好了${fix[key].note ? '：' + fix[key].note.replace(/[&<>"']/g, '') : ''}。</p><p>在路由器后台终端里重新运行一次安装命令就行（官网「添加路由器」里能复制）。还是不行的话，再上报一次，我们接着查。</p>`)) {
						mailed++;
						await this.lock(async () => { const l = (await this.ctx.storage.get('fbl')) || []; const y = l.find((z) => z.code === c); if (y) { y.fixMailed = Date.now(); await this.ctx.storage.put('fbl', l); } });
					}
				}
			}
			await this.alog('compat-fix', key, '标为在 v' + fix[key].ver + ' 修好' + (mailed ? '，发了 ' + mailed + ' 封邮件' : ''));
			return { st: 200, ok: true, mailed };
		},
		// 管理后台处理尝鲜申请：ok 同意、no 拒绝、rev 撤销这台、revp 撤销这个申请人的全部设备（撤销 / 拒绝后要重新申请）
		async compatBeta(id, act) {
			if (act === true) act = 'ok'; else if (act === false) act = 'rev'; // 老的后台页面
			if (!ID_RE.test(String(id || ''))) return { st: 400, error: '编号不对' };
			if (!['ok', 'no', 'rev', 'revp'].includes(act)) return { st: 400, error: '操作不对' };
			const done = [];
			const res = await this.lock(async () => {
				const r = await this.ctx.storage.get('cp:' + id);
				if (!r || !r.ap) return { st: 404, error: '这台路由器没有申请尝鲜（或者已经退出了）' };
				const now = Date.now(), set = async (k, x, st) => { x.ap = { ...x.ap, st, dec: now }; x.beta = true; x.betaOk = st === 'ok'; await this.ctx.storage.put(k, x); done.push({ ap: x.ap, model: x.model }); };
				if (act === 'revp') {
					if (!r.ap.pid) return { st: 400, error: '这个申请没有申请人编号（老的报名），只能撤销这台' };
					for (const [k, x] of await this.ctx.storage.list({ prefix: 'cp:' })) if (x.ap && x.ap.pid === r.ap.pid && (x.ap.st === 'ok' || x.ap.st === 'wait')) await set(k, x, 'rev');
					if (!done.length) return { st: 400, error: '这个申请人没有在用或等审核的设备' };
				} else {
					if (act === 'ok' && r.ap.st === 'ok') return { st: 400, error: '已经通过了' };
					if (act === 'no' && r.ap.st !== 'wait') return { st: 400, error: '只有等审核的能拒绝' };
					if (act === 'rev' && r.ap.st !== 'ok' && r.ap.st !== 'wait') return { st: 400, error: '这台没有在用尝鲜' };
					await set('cp:' + id, r, act);
				}
				const what = { ok: '同意尝鲜申请', no: '拒绝尝鲜申请', rev: '撤销尝鲜（这台设备）', revp: '撤销尝鲜（申请人 ' + r.ap.pid.slice(0, 4) + ' 的 ' + done.length + ' 台）' }[act];
				await this.alog('beta', id.slice(0, 6), what + '（' + (r.model || '?') + '）');
				return { st: 200, ok: true, n: done.length };
			});
			// 通知申请人：托管版推送到手机，自建版发邮件（同一个人只发一次）
			const sent = new Set();
			for (const x of done) {
				const st = x.ap.st, key = x.ap.sub || x.ap.email || '';
				if (!key || sent.has(key)) continue;
				sent.add(key);
				const title = st === 'ok' ? '✅ 尝鲜申请通过了' : st === 'no' ? '尝鲜申请没通过' : '尝鲜资格已撤销';
				const body = st === 'ok' ? '有尝鲜版时在「检查更新」里装，随时能退回正式版。' : st === 'no' ? '想再试可以在面板里重新申请。' : '以后收不到尝鲜版，已装的照常能用。想再试可以重新申请。';
				try {
					// 都发邮件（托管版发到这台路由器主账号的邮箱）；托管版另外推送到手机
					let to = x.ap.email || '';
					if (x.ap.sub) {
						await this.watch(x.ap.sub).push({ title, body, tag: 'beta', lvl: st === 'ok' ? 'ok' : 'info' });
						const d = await this.ctx.storage.get('d:' + x.ap.sub), u = d && (d.owner || (d.users || [])[0]), ux = u && (await this.ctx.storage.get('u:' + u));
						to = (ux && ux.email) || '';
					}
					if (to) await this.mail(to, '路由器面板：' + title.replace(/^✅ /, ''), `<p>${title.replace(/^✅ /, '')}（${String(x.model || '路由器').replace(/[&<>"']/g, '')}）。${body}</p><p>你在路由器面板里申请了尝鲜，所以收到这封邮件。</p>`);
				} catch (e) {}
			}
			return res;
		},
		// 官网公开的兼容性表：按型号汇总（至少 1 台报过），只给数量和「能不能用」的比例，不给编号
		async compatTable() {
			const c = await this.meta('cptable');
			if (c && Date.now() - c.at < 3600e3) return c;
			const now = Date.now(), byModel = {}, bySys = {};
			let n = 0;
			const yes = (v) => v === 'ok' || v === 'flash' || v === 'ram' || v === 'openssl' || v === 'builtin' || v === 'nft' || v === 'ipset' || v === 'usign';
			for (const [, r] of await this.ctx.storage.list({ prefix: 'cp:' })) {
				if (now - (r.last || 0) > KEEP) continue;
				n++;
				const m = r.model || '没认出型号', s = String(r.sys || '?').replace(/\s*\(.*$/, '').replace(/(\d+\.\d+)[^ ]*/, '$1').slice(0, 40);
				const row = byModel[m] || (byModel[m] = { model: m, n: 0, sys: {}, plat: r.plat || '', feats: {} });
				row.n++; row.sys[s] = (row.sys[s] || 0) + 1;
				const sr = bySys[s] || (bySys[s] = { sys: s, n: 0, feats: {} }); sr.n++;
				const ff = { tunnel: r.caps.cfd, update: r.caps.verify, pause: r.caps.pause, backup: r.caps.crypt, lfull: r.caps.rpcd };
				for (const [f, v] of Object.entries(ff)) {
					if (v == null) continue;
					for (const t of [row.feats, sr.feats]) { const z = t[f] || (t[f] = { ok: 0, n: 0 }); z.n++; if (yes(v)) z.ok++; }
				}
				// 报过「开不了」的功能也算进去
				for (const x of r.fails || []) if (x.f in ff) { const z = row.feats[x.f] || (row.feats[x.f] = { ok: 0, n: 0 }); z.n++; }
			}
			const fin = (o) => Object.values(o).map((x) => ({ ...x, ...(x.sys && typeof x.sys === 'object' ? { sys: Object.entries(x.sys).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k) } : {}) })).sort((a, b) => b.n - a.n);
			const out = { at: now, routers: n, models: fin(byModel).slice(0, 300), systems: fin(bySys).slice(0, 40), feats: { tunnel: FEATS.tunnel, update: FEATS.update, pause: FEATS.pause, backup: FEATS.backup, lfull: FEATS.lfull } };
			await this.setMeta('cptable', out);
			return out;
		},
	});
}
// 最新的尝鲜版（GitHub 上标成「预发布」、比正式版新的）：一小时查一次，记在 meta 里给上报的回复用
export async function prereleaseRefresh(env, H, repo) {
	try {
		const r = await fetch('https://api.github.com/repos/' + repo + '/releases?per_page=30', { headers: { 'user-agent': 'router-panel-hub', accept: 'application/vnd.github+json' } });
		if (!r.ok) return;
		const l = await r.json(), st = l.find((x) => !x.prerelease && !x.draft), pr = l.find((x) => x.prerelease && !x.draft && !/^hot-/.test(String(x.tag_name)));
		const sv = st ? String(st.tag_name).replace(/^v/, '') : '0.0.0', pv = pr ? String(pr.tag_name).replace(/^v/, '') : '';
		await H.setMeta('prerel', pv && okVer(pv) && verLt(sv, pv) ? { tag: pr.tag_name, ver: pv, at: pr.published_at || '' } : null);
	} catch (e) {}
}
export async function compatPublic(req, p, H, body) {
	if (p === '/api/compat' && req.method === 'POST') { let b = {}; try { b = await body(); } catch (e) {} const { st, ...rest } = await H.compatPut(b || {}, req.headers.get('cf-connecting-ip') || ''); return J(rest, st); }
	if (p === '/api/compat/table' && req.method === 'GET') { const t = await H.compatTable(); return new Response(JSON.stringify({ ok: true, ...t }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=600' } }); }
	return null;
}
export async function compatAdminApi(req, a, H, body) {
	if (a[0] !== 'compat') return null;
	if (!a[1] && req.method === 'GET') return J({ ok: true, ...(await H.compatAdmin()), feats: FEATS });
	if (a[1] === 'fix' && req.method === 'POST') { const b = await body(); const { st, ...rest } = await H.compatFix(b.key, b.ver === null ? null : b.ver, b.note); return J(rest, st); }
	if (a[1] === 'beta' && req.method === 'POST') { const b = await body(); const { st, ...rest } = await H.compatBeta(b.id, b.act || b.ok); return J(rest, st); }
	return J({ error: 'not found' }, 404);
}

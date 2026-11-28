// 官网「服务状态」（/status）和「常见问题」（/help）
// · 服务状态：官网每小时自动检查一次各项服务，按天记 90 天；管理员可以发故障说明（正在处理 / 已恢复）
//   专属网址这一项按「路由器本身在线、但隧道断了」的比例算（路由器断电、断网是用户家里的事，不算），只给百分比，不给路由器数量
// · 常见问题：默认内容在 faq-default.js；管理后台改过以后存在这里；用户搜不到答案时，把搜的词记下来（不记 IP、不记账号）
import { FAQ_CATS, FAQ_DEFAULT } from './faq-default.js';
import { FAQ_CATS_EN, FAQ_EN } from './faq-en.js';

const DAY = 86400e3, KEEP_DAYS = 92;
const J = (o, st = 200, h = {}) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h } });
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);
const rid = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => 'abcdefghijkmnpqrstuvwxyz23456789'[x & 31]).join('');
// 按北京时间 / 台北时间算日期和小时（用户都在 UTC+8）
const ymd = (t) => new Date(t + 8 * 3600e3).toISOString().slice(0, 10);
const hourOf = (t) => new Date(t + 8 * 3600e3).getUTCHours();

// 各项服务（顺序就是页面上的顺序）
export const COMPS = [
	{ k: 'web', t: '官网和账号', d: '官网、注册登录、打开面板' },
	{ k: 'tunnel', t: '专属网址', d: '在外面打开路由器面板' },
	{ k: 'push', t: '手机推送', d: '断线、更新、家人登录这些提醒' },
	{ k: 'mail', t: '邮件', d: '验证码、处理进度通知' },
	{ k: 'files', t: '发文件', d: '联系开发者、问题反馈里的图片和文件' },
	{ k: 'dl', t: '安装和更新', d: '安装包下载、一键更新' },
];
const COMP_KEYS = COMPS.map((c) => c.k);
// 英文页（#102）：服务名和说明
const COMPS_EN = {
	web: { t: 'Website and accounts', d: 'Website, sign up and sign in, opening the panel' },
	tunnel: { t: 'Router address', d: 'Opening your router panel when you are away from home' },
	push: { t: 'Push notifications', d: 'Alerts for outages, updates and family sign-ins' },
	mail: { t: 'Email', d: 'Verification codes and request status updates' },
	files: { t: 'File sending', d: 'Images and files in developer chat and feedback' },
	dl: { t: 'Install and update', d: 'Package downloads and one-tap updates' },
};
// 常见问题的英文：只给跟默认内容一样的条目（后台改过、新加的照样给中文，免得英文跟中文对不上）
const FAQ_D = new Map(FAQ_DEFAULT.map((x) => [x.id, x]));
const faqEn = (x) => { const d = FAQ_D.get(x.id), e = FAQ_EN[x.id]; return d && e && d.q === x.q && d.a === x.a ? { ...x, q: e.q, a: e.a, kw: e.kw || '', lang: 'en' } : { ...x, lang: 'zh' }; };
const RANK = { ok: 0, part: 1, down: 2 };
// 一天的情况：有 2 个小时以上出故障算「故障」，有问题但没到这个程度算「部分有问题」
function dayLevel(hours, k) {
	let n = 0, part = 0, down = 0;
	for (const h of Object.values(hours)) { const v = h && h[k]; if (!v) continue; n++; if (v === 'part') part++; if (v === 'down') down++; }
	if (!n) return null;
	return down >= 2 ? 'down' : down || part ? 'part' : 'ok';
}
// 专属网址：在线比例 → 等级
const tunLevel = (pct) => (pct == null ? null : pct >= 90 ? 'ok' : pct >= 60 ? 'part' : 'down');

export function installHelp(Hub) {
	Object.assign(Hub.prototype, {
		/* ---------- 服务状态 ---------- */
		// 每小时检查一次（官网的定时任务里调；管理后台「马上检查一次」也调这个）
		async statusTick(now = Date.now()) {
			const env = this.env, s = {};
			// 官网和账号：这段代码能跑、存储能读写，就算正常
			try { await this.ctx.storage.put('svc:ping', now); s.web = 'ok'; } catch (e) { s.web = 'down'; }
			// 专属网址：路由器本身在线（有心跳）的里面，隧道连得上的占多少
			try {
				let up = 0, bad = 0;
				for (const d of await this.devices()) {
					if (d.state !== 'ok' || d.off) continue;
					let b = null; try { b = await this.watch(d.sub).brief(); } catch (e) { continue; }
					if (!b) continue;
					if (['ok', 'partial', 'noreport'].includes(b.state)) up++;
					else if (b.state === 'tunnel') bad++;
				}
				const pct = up + bad ? Math.round((up / (up + bad)) * 1000) / 10 : null;
				s.tunnel = tunLevel(pct); s.tunPct = pct;
			} catch (e) { s.tunnel = null; }
			// 手机推送：推送密钥配好了才有这一项
			s.push = env.VAPID_PUB && env.VAPID_PRIV ? 'ok' : null;
			// 邮件：看最近一小时发的信成功了多少（没发信就算正常）
			if (env.RESEND_API_KEY) {
				const l = ((await this.ctx.storage.get('ml')) || []).filter((m) => m.t > now - 3600e3);
				const bad = l.filter((m) => !m.ok).length;
				// 偶尔一封发不出去（多半是邮箱写错了）不算；两封以上、而且占三成以上才算有问题
				s.mail = bad < 2 ? 'ok' : bad === l.length ? 'down' : bad / l.length >= 0.3 ? 'part' : 'ok';
			} else s.mail = null;
			// 发文件：存储能用、没快满
			if (env.F) {
				try { await env.F.head('st-probe'); const st = await this.fileStats(); s.files = st.bytes > st.cap - 512 * 1024 * 1024 ? 'part' : 'ok'; } catch (e) { s.files = 'down'; }
			} else s.files = null;
			// 安装和更新：GitHub 上最新版本的校验文件拿得到（官网 /dl 和一键更新都从这里拿）
			try {
				const repo = String(env.GH_REPO || 'wznwzn123/openwrt-claude-panel');
				const get = () => fetch('https://github.com/' + repo + '/releases/latest/download/SHA256SUMS', { redirect: 'follow', headers: { 'user-agent': 'router-panel-hub' } }).then((r) => r.ok).catch(() => false);
				s.dl = (await get()) || (await get()) ? 'ok' : 'down';
			} catch (e) { s.dl = 'down'; }
			const k = 'svc:' + ymd(now), day = (await this.ctx.storage.get(k)) || {};
			day[hourOf(now)] = { t: now, ...s };
			await this.ctx.storage.put(k, day);
			if (!(await this.ctx.storage.get('svc:since'))) await this.ctx.storage.put('svc:since', now);
			// 只留 92 天
			const old = ymd(now - KEEP_DAYS * DAY);
			const ks = [...(await this.ctx.storage.list({ prefix: 'svc:2', end: 'svc:' + old })).keys()];
			if (ks.length) await this.ctx.storage.delete(ks);
			return s;
		},
		// 状态页要的：现在的情况、90 天每天的情况、每一项的正常比例、故障说明
		async statusView(now = Date.now()) {
			const days = [], hoursAll = [];
			const got = await this.ctx.storage.list({ prefix: 'svc:2', start: 'svc:' + ymd(now - 89 * DAY) });
			for (let i = 89; i >= 0; i--) {
				const d = ymd(now - i * DAY), hrs = got.get('svc:' + d) || {};
				const o = { d };
				for (const k of COMP_KEYS) o[k] = dayLevel(hrs, k);
				days.push(o);
				for (const h of Object.values(hrs)) hoursAll.push(h);
			}
			hoursAll.sort((a, b) => a.t - b.t);
			const last = hoursAll[hoursAll.length - 1] || null;
			const comps = COMPS.filter((c) => hoursAll.some((h) => h[c.k])).map((c) => {
				const hs = hoursAll.filter((h) => h[c.k]);
				const upPct = hs.length ? Math.round((hs.filter((h) => h[c.k] !== 'down').length / hs.length) * 10000) / 100 : null;
				return { ...c, now: last && last.t > now - 3 * 3600e3 ? last[c.k] || null : null, up: upPct, ...(c.k === 'tunnel' && last && last.tunPct != null ? { pct: last.tunPct } : {}) };
			});
			const inc = ((await this.ctx.storage.get('inc')) || []).filter((x) => !x.end || x.end > now - 90 * DAY);
			return { ok: true, at: last ? last.t : 0, since: (await this.ctx.storage.get('svc:since')) || 0, comps, days, inc: inc.slice(0, 20) };
		},
		// 故障说明：新建 / 补充进展 / 标为已恢复 / 删除
		async incSave({ id, title, level, comps, text, resolve }) {
			return this.lock(async () => {
				const l = (await this.ctx.storage.get('inc')) || [], now = Date.now();
				let x = id ? l.find((i) => i.id === id) : null;
				if (id && !x) return { st: 404, error: '没有这条故障说明' };
				const cs = Array.isArray(comps) ? COMP_KEYS.filter((k) => comps.includes(k)) : null;
				if (!x) {
					title = clip(title, 80);
					if (!title) return { st: 400, error: '写一个标题，比如：部分专属网址打不开' };
					x = { id: rid(8), title, level: level === 'down' ? 'down' : 'part', comps: cs || [], start: now, end: 0, ups: [] };
					l.unshift(x);
				} else {
					if (title !== undefined && clip(title, 80)) x.title = clip(title, 80);
					if (level) x.level = level === 'down' ? 'down' : 'part';
					if (cs) x.comps = cs;
				}
				const t = clip(text, 1000);
				if (t || resolve) x.ups.unshift({ t: now, text: t || '已恢复', done: !!resolve });
				if (resolve) x.end = now;
				await this.ctx.storage.put('inc', l.slice(0, 50));
				return { st: 200, ok: true, inc: x };
			});
		},
		async incDel(id) { return this.lock(async () => { const l = (await this.ctx.storage.get('inc')) || []; const n = l.filter((x) => x.id !== id); if (n.length === l.length) return false; await this.ctx.storage.put('inc', n); return true; }); },

		/* ---------- 常见问题 ---------- */
		async faqAll() { const f = await this.ctx.storage.get('faq'); return f && Array.isArray(f.items) ? f : { items: FAQ_DEFAULT, at: 0, dflt: true }; },
		async faqSave(it) {
			return this.lock(async () => {
				const f = await this.faqAll(), items = f.items.map((x) => ({ ...x }));
				const q = clip(it.q, 120), a = String(it.a == null ? '' : it.a).replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 4000);
				const cat = FAQ_CATS.some((c) => c.k === it.cat) ? it.cat : FAQ_CATS[0].k, kw = clip(it.kw, 300);
				if (!q || !a) return { st: 400, error: '问题和回答都要写' };
				let x = it.id ? items.find((i) => i.id === it.id) : null;
				if (it.id && !x) return { st: 404, error: '没有这条问题（可能被删了）' };
				if (x) Object.assign(x, { q, a, cat, kw });
				else { x = { id: rid(8), q, a, cat, kw }; items.push(x); }
				await this.ctx.storage.put('faq', { items, at: Date.now() });
				return { st: 200, ok: true, item: x };
			});
		},
		async faqDel(id) { return this.lock(async () => { const f = await this.faqAll(), items = f.items.filter((x) => x.id !== id); if (items.length === f.items.length) return false; await this.ctx.storage.put('faq', { items, at: Date.now() }); return true; }); },
		// 同一类里往前 / 往后挪一位
		async faqMove(id, dir) {
			return this.lock(async () => {
				const f = await this.faqAll(), items = f.items.map((x) => ({ ...x })), i = items.findIndex((x) => x.id === id);
				if (i < 0) return false;
				const cat = items[i].cat, step = dir === 'up' ? -1 : 1;
				let j = i + step; while (j >= 0 && j < items.length && items[j].cat !== cat) j += step;
				if (j < 0 || j >= items.length) return true;
				[items[i], items[j]] = [items[j], items[i]];
				await this.ctx.storage.put('faq', { items, at: Date.now() });
				return true;
			});
		},
		async faqReset() { await this.ctx.storage.delete('faq'); return true; },
		// 搜不到答案的词：只记词、次数、最近一次的时间
		async faqMiss(q, ip) {
			q = clip(q, 40).toLowerCase().replace(/\s+/g, ' ');
			// 看着像邮箱、电话、编号、网址的不记
			if (q.length < 2 || /@|https?:|www\.|\d{6,}|[a-z0-9]{20,}/i.test(q)) return false;
			if (!(await this.hit('hm:' + (ip || '?'), 30, DAY))) return false;
			return this.lock(async () => {
				const m = (await this.ctx.storage.get('faqmiss')) || {}, now = Date.now();
				const x = m[q] || { n: 0, first: now };
				x.n++; x.last = now; m[q] = x;
				const keys = Object.keys(m);
				if (keys.length > 300) for (const k of keys.sort((a, b) => m[a].last - m[b].last).slice(0, keys.length - 300)) delete m[k];
				await this.ctx.storage.put('faqmiss', m);
				return true;
			});
		},
		async faqMisses() { const m = (await this.ctx.storage.get('faqmiss')) || {}; return Object.entries(m).map(([q, x]) => ({ q, ...x })).sort((a, b) => b.n - a.n || b.last - a.last); },
		async faqMissDel(q) { return this.lock(async () => { const m = (await this.ctx.storage.get('faqmiss')) || {}; if (q === '*') { await this.ctx.storage.delete('faqmiss'); return true; } if (!m[q]) return false; delete m[q]; await this.ctx.storage.put('faqmiss', m); return true; }); },
	});
}

/* ---------- 公开接口 ---------- */
export async function helpPublic(req, H, body, p) {
	const en = new URL(req.url).searchParams.get('lang') === 'en';
	if (p === '/api/status' && req.method === 'GET') {
		let v = await H.statusView();
		if (en && v && Array.isArray(v.comps)) v = { ...v, comps: v.comps.map((c) => (COMPS_EN[c.k] ? { ...c, ...COMPS_EN[c.k] } : c)) };
		return J(v, 200, { 'cache-control': 'public, max-age=60' });
	}
	if (p === '/api/help' && req.method === 'GET') {
		const f = await H.faqAll(), items = f.items.map(({ id, cat, q, a, kw }) => ({ id, cat, q, a, kw }));
		return J({ ok: true, cats: en ? FAQ_CATS.map((c) => ({ ...c, t: FAQ_CATS_EN[c.k] || c.t })) : FAQ_CATS, items: en ? items.map(faqEn) : items, at: f.at || 0 }, 200, { 'cache-control': 'public, max-age=60' });
	}
	if (p === '/api/help/miss' && req.method === 'POST') { const b = await body(); await H.faqMiss(String(b.q || ''), req.headers.get('cf-connecting-ip') || ''); return J({ ok: true }); }
	return null;
}

/* ---------- 管理后台 ---------- */
export async function helpAdmin(req, a, H, body) {
	const m = req.method;
	if (a[0] === 'status' && !a[1] && m === 'GET') return J(await H.statusView());
	if (a[0] === 'status' && a[1] === 'check' && m === 'POST') { await H.statusTick(); return J(await H.statusView()); }
	if (a[0] === 'incidents' && m === 'POST') { const b = await body(); const { st, ...r } = await H.incSave({ id: a[1] || '', title: b.title, level: b.level, comps: b.comps, text: b.text, resolve: !!b.resolve }); if (st === 200) await H.alog(a[1] ? (b.resolve ? 'inc_resolve' : 'inc_update') : 'inc_new', r.inc.id, r.inc.title); return J(r, st); }
	if (a[0] === 'incidents' && a[1] && m === 'DELETE') { const ok = await H.incDel(a[1]); if (ok) await H.alog('inc_del', a[1], ''); return J({ ok }, ok ? 200 : 404); }
	if (a[0] === 'faq' && !a[1] && m === 'GET') { const f = await H.faqAll(); return J({ ok: true, cats: FAQ_CATS, items: f.items, at: f.at || 0, dflt: !!f.dflt }); }
	if (a[0] === 'faq' && a[1] === 'reset' && m === 'POST') { await H.faqReset(); await H.alog('faq_reset', '', ''); return J({ ok: true }); }
	if (a[0] === 'faq' && a[1] && a[2] === 'move' && m === 'POST') { const b = await body(); return J({ ok: await H.faqMove(a[1], b.dir === 'up' ? 'up' : 'down') }); }
	if (a[0] === 'faq' && m === 'POST') { const b = await body(); const { st, ...r } = await H.faqSave({ id: a[1] || '', q: b.q, a: b.a, cat: b.cat, kw: b.kw }); if (st === 200) await H.alog(a[1] ? 'faq_edit' : 'faq_new', r.item.id, r.item.q); return J(r, st); }
	if (a[0] === 'faq' && a[1] && m === 'DELETE') { const ok = await H.faqDel(a[1]); if (ok) await H.alog('faq_del', a[1], ''); return J({ ok }, ok ? 200 : 404); }
	if (a[0] === 'faqmiss' && m === 'GET') return J({ ok: true, list: await H.faqMisses() });
	if (a[0] === 'faqmiss' && a[1] === 'del' && m === 'POST') { const b = await body(); return J({ ok: await H.faqMissDel(String(b.q || '')) }); }
	return null;
}

// 官网定时任务（每小时）里调
export async function statusScheduled(H) { try { await H.statusTick(); } catch (e) {} }

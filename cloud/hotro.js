// 6.0 第五阶段（用户 11/28 定）：热补丁分批推送和退回
// - 新补丁先推给尝鲜的路由器（4 天内打开过面板的才算，一台都没有就跳过这一步）→ 10% → 50% → 全部，每批 6 小时
// - 有一台装失败就自动暂停（下载不下来多半是网络，不算），给管理员发邮件、推送，后台「补丁」页标红点；看完原因点「继续」
// - 手动点「检查更新」的直接装最新的（暂停、退回的除外）
// - 后台能「推下一批」「暂停 / 继续」「全部退回」（退到上一个补丁，补丁包是累计的）；按台退回 = 把这台固定在某个补丁
// - 6.0.1 起每个版本发布时带一个 V0（正式版原样），能一直退回原样
// - 分到哪一批：sha256(编号 | 补丁号) 的前两个字节 % 100。托管版的编号是专属网址编号，自建版是兼容上报的随机编号；
//   关了兼容上报的自建版、V9 及以前的老 cmcp-hot（不带参数）只在「全部」那一批
// 存：hr:<版本>-<编号> 每个补丁的推送记录；hp:<s:专属网址编号 | i:随机编号> 按台固定；m:hbp 尝鲜路由器最近打开面板的时间
import { scrub } from './compat.js';

const DAY = 86400e3, HOUR = 3600e3, GAP = 6 * HOUR, IDLE = 4 * DAY;
export const HR_STAGE = { beta: '尝鲜', p10: '10%', p50: '50%', all: '全部', paused: '已暂停', back: '已退回' };
const NEXT = { beta: 'p10', p10: 'p50', p50: 'all' };
const LIVE = ['beta', 'p10', 'p50', 'all'];
const SUB_RE = /^[a-z2-9]{8}$/, ID_RE = /^[a-z2-9]{16}$/;
export const HR_KEY = /^(s:[a-z2-9]{8}|i:[a-z2-9]{16})$/;
const VER_RE = /^\d+\.\d+\.\d+$/;
// 下载不下来（网络不好、连不上 GitHub）不是补丁的问题：记下来，但不暂停
const SOFT = /^下载失败/;
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
export async function hrBucket(key, n) { const d = new Uint8Array(await sha(key + '|' + n)); return (d[0] * 256 + d[1]) % 100; }
const kh8 = async (key) => hex(await sha('hr|' + key)).slice(0, 8);
const ipk = async (ip) => hex(await sha('hri|' + (ip || '?'))).slice(0, 16);
const trim = (r) => ({ ...r, fails: (r.fails || []).slice(-50), okk: (r.okk || []).slice(-2000), log: (r.log || []).slice(-30) });
const say = (r, t, now) => { (r.log = r.log || []).push({ at: now, t }); };

export function installHotRo(Hub) {
	Object.assign(Hub.prototype, {
		// 尝鲜通过的路由器（兼容上报的随机编号）：10 分钟算一次，后台同意 / 撤销时清掉（compat.js）
		async _hrBeta() {
			const now = Date.now();
			if (this._hrb && now - this._hrb.at < 600e3) return this._hrb.set;
			const set = new Set();
			for (const [k, r] of await this.ctx.storage.list({ prefix: 'cp:' })) if (r && r.ap && r.ap.st === 'ok') set.add(k.slice(3));
			this._hrb = { at: now, set };
			return set;
		},
		// 尝鲜里 4 天内打开过面板的有几台（用路由器问补丁时带的「打开面板」时间，不是心跳：用户 11/28）
		async _hrActive(now) {
			const set = await this._hrBeta(), m = (await this.meta('hbp')) || {};
			let n = 0;
			for (const id of set) if (m[id] && now - m[id] < IDLE) n++;
			return n;
		},
		// 推送记录读写（放一份在内存里：公告接口每次都要看，省得每次都读存储；只有这个文件里改它）
		async _hrGet(k) { this._hrc = this._hrc || new Map(); if (!this._hrc.has(k)) this._hrc.set(k, (await this.ctx.storage.get(k)) || null); const r = this._hrc.get(k); return r ? structuredClone(r) : null; },
		async _hrPut(k, r) { r = trim(r); this._hrc = this._hrc || new Map(); this._hrc.set(k, structuredClone(r)); await this.ctx.storage.put(k, r); },
		// 给每个补丁建推送记录、按时间推到下一批。list = [{ n, notes, at }]（这个版本在 GitHub 上发了的补丁）
		async _hrSync(base, list, now) {
			const init = await this.meta('hrInit'), first = !init, recs = {};
			for (const x of list) {
				if (!(x.n > 0)) continue;
				const k = 'hr:' + base + '-' + x.n;
				let r = await this._hrGet(k), ch = false;
				if (!r) {
					r = { base, n: x.n, made: now, at: now, notes: str(x.notes, 300), okn: 0, okk: [], fails: [], log: [] };
					if (first || (x.at && x.at < init)) { r.stage = 'all'; say(r, '分批推送上线以前发的 直接给全部', now); }
					else if (!(await this._hrActive(now))) { r.stage = 'p10'; say(r, '尝鲜里没有 4 天内打开过面板的 跳过尝鲜', now); }
					else { r.stage = 'beta'; say(r, '开始推给尝鲜的路由器', now); }
					ch = true;
				}
				if (!r.notes && x.notes) { r.notes = str(x.notes, 300); ch = true; }
				if (NEXT[r.stage] && now - r.at >= GAP) { r.stage = NEXT[r.stage]; r.at = now; say(r, '6 小时没出问题 推到' + (r.stage === 'all' ? '' : ' ') + HR_STAGE[r.stage], now); ch = true; }
				if (ch) await this._hrPut(k, r);
				recs[x.n] = r;
			}
			if (first) await this.setMeta('hrInit', now);
			return recs;
		},
		// 路由器问「我该装第几个」。q = { h: 现在第几个（老 cmcp-hot 不带 = null），key, id, po（秒）, f: 点了「检查更新」 }
		// 回 { n, tag, notes, back }：n 比 h 大就装；back = 要往回装（全部退回、按台固定）
		hotAsk(base, list, q) { return this.lock(async () => {
			const now = Date.now(), recs = await this._hrSync(base, list, now);
			const legacy = q.h == null || q.h === '';
			const key = HR_KEY.test(String(q.key || '')) ? String(q.key) : '', id = ID_RE.test(String(q.id || '')) ? String(q.id) : '';
			let beta = false;
			if (!legacy && id && (await this._hrBeta()).has(id)) {
				const po = Math.min(now, Math.max(0, +q.po || 0) * 1000);
				if (po && now - po < IDLE) beta = true;
				if (po) {
					const m = (await this.meta('hbp')) || {};
					if (Math.abs((m[id] || 0) - po) > HOUR) { m[id] = po; for (const [i, t] of Object.entries(m)) if (now - t > 30 * DAY) delete m[i]; await this.setMeta('hbp', m); }
				}
			}
			const ns = [...new Set(list.map((x) => x.n).filter((n) => n >= 0))].sort((a, b) => a - b), has0 = ns.includes(0);
			const live = (n) => n === 0 || (recs[n] && recs[n].stage !== 'back');
			const okFor = async (n) => {
				if (n === 0) return true;
				const r = recs[n];
				if (!r || r.stage === 'back' || r.stage === 'paused') return false;
				if (r.stage === 'all') return true;
				if (legacy || !key) return false;
				if (q.f || beta) return true;
				if (r.stage === 'beta') return false;
				return (await hrBucket(key, n)) < (r.stage === 'p10' ? 10 : 50);
			};
			let top = -1;
			for (const n of ns) if (await okFor(n)) top = n;
			const h = legacy ? -1 : Math.max(0, Math.floor(+q.h || 0));
			let n = Math.max(top, h), why = '';
			if (!legacy && key) {
				const pin = await this.ctx.storage.get('hp:' + key);
				if (pin && pin.base === base && ns.includes(pin.n) && live(pin.n)) { n = pin.n; why = 'pin'; }
			}
			if (!why && h > 0 && recs[h] && recs[h].stage === 'back') {
				const below = ns.filter((x) => x < h && live(x)).pop();
				if (below != null) { n = Math.max(top, below); why = 'back'; }
			}
			if (n < 0) n = 0;
			const e = list.find((x) => x.n === n);
			if (legacy) return n > 0 ? { n, tag: 'hot-' + base + '-' + n, notes: e ? e.notes || '' : '' } : { n: 0 };
			const back = n < h;
			return { n, ...(n > 0 || (back && has0) ? { tag: 'hot-' + base + '-' + n } : {}), notes: e ? e.notes || '' : '', ...(back ? { back: true } : {}) };
		}); },
		// 公告接口带的：这个版本推送中的最新补丁（hot）、退回过的最小编号（hotw，装着它或更新的要马上问一次）
		hotTop(base, list) { return this.lock(async () => {
			const recs = await this._hrSync(base, list, Date.now());
			let hot = 0, hotw = 0;
			for (const x of list) { const r = recs[x.n]; if (!r) continue; if (LIVE.includes(r.stage)) hot = Math.max(hot, x.n); if (r.stage === 'back' && (!hotw || x.n < hotw)) hotw = x.n; }
			return { hot, ...(hotw ? { hotw } : {}) };
		}); },
		// 路由器装完报一次：{ v, n, ok, err, back, s + rk（托管版）| id（自建版）}
		hotRep(b, ip) { return this.lock(async () => {
			b = b && typeof b === 'object' ? b : {};
			const base = str(b.v, 16), n = Math.floor(+b.n);
			if (!VER_RE.test(base) || !(n >= 0 && n < 10000)) return { st: 400, error: '版本或补丁号不对' };
			if (!(await this.hit('hri:' + (await ipk(ip)), 30, DAY))) return { st: 429, error: '报得太频繁了' };
			let key = '', kind = '';
			if (SUB_RE.test(String(b.s || ''))) {
				if (!(await this.devOk(String(b.s), String(b.rk || '')))) return { st: 403, error: '认不出这台路由器' };
				key = 's:' + b.s; kind = 'h';
			} else if (ID_RE.test(String(b.id || '')) && (await this.ctx.storage.get('cp:' + b.id))) { key = 'i:' + b.id; kind = 's'; }
			// 认不出的（没开兼容上报的自建版）不记：免得谁都能报一条失败让推送停下来
			else return { st: 200, ok: true, skip: true };
			if (!(await this.hit('hrk:' + key, 12, DAY))) return { st: 429, error: '报得太频繁了' };
			const k = 'hr:' + base + '-' + n, r = await this._hrGet(k);
			if (!r) return { st: 200, ok: true, skip: true };
			const now = Date.now(), kh = await kh8(key), back = !!b.back;
			if (b.ok) {
				if (!back && !r.okk.includes(kh)) { r.okk.push(kh); r.okn = (r.okn || 0) + 1; }
				r.fails = r.fails.filter((x) => x.kh !== kh || !x.soft);
				await this._hrPut(k, r);
				return { st: 200, ok: true };
			}
			const err = str(scrub(b.err), 200) || '没说原因', soft = SOFT.test(err);
			const f = r.fails.find((x) => x.kh === kh && x.err === err && !!x.back === back);
			if (f) { f.c = (f.c || 1) + 1; f.at = now; } else r.fails.push({ kh, key, kind, err, at: now, c: 1, soft, back });
			let paused = false;
			if (!soft && !back && LIVE.includes(r.stage)) {
				r.prev = r.stage; r.stage = 'paused'; r.at = now; paused = true;
				say(r, (kind === 'h' ? '托管版' : '自建版') + '路由器装失败 自动暂停：' + err, now);
			}
			await this._hrPut(k, r);
			if (paused) {
				const t = '热补丁 v' + base + ' V' + n + ' 已自动暂停';
				try { await this.admPush({ title: '⏸ ' + t, body: '有路由器装失败：' + err, tag: 'hot-' + base + '-' + n, url: '/admin/#/hot' }); } catch (e) {}
				try { await this.notifyAdmin(t, `有一台${kind === 'h' ? '托管版' : '自建版'}路由器装失败了：${err}\n\n装失败的已经自动退回原来的，上网不受影响。还没装的先不推了。\n到管理后台「补丁」看原因，没问题点「继续」，有问题点「全部退回」。\n\n管理页：https://${this.env.BASE_DOMAIN}/admin/#/hot`); } catch (e) {}
				try { await this.alog('hot_pause', base + '-' + n, '装失败自动暂停：' + err, 'system'); } catch (e) {}
			}
			return { st: 200, ok: true, paused };
		}); },
		// 每小时（Hub 的定时任务）：按时间推到下一批；补丁记录 180 天后删（隐私政策写了）
		async hotTick(groups) {
			for (const g of groups) await this.lock(() => this._hrSync(g.base, g.list, Date.now()));
			const now = Date.now(), del = [];
			for (const [k, r] of await this.ctx.storage.list({ prefix: 'hr:' })) if (r && now - (r.made || 0) > 180 * DAY) del.push(k);
			if (del.length) { await this.ctx.storage.delete(del.slice(0, 128)); this._hrc = null; }
		},
		// 后台「补丁」页
		hotAdmin(groups) { return this.lock(async () => {
			const now = Date.now(), out = [];
			for (const g of groups) {
				const recs = await this._hrSync(g.base, g.list, now);
				for (const x of g.list) {
					if (x.n === 0) { out.push({ base: g.base, n: 0, stage: 'v0', notes: '正式版原样', at: x.at || 0 }); continue; }
					const r = recs[x.n]; if (!r) continue;
					out.push({ base: g.base, n: x.n, notes: r.notes || x.notes || '', stage: r.stage, prev: r.prev || '', at: r.at, made: r.made, pub: x.at || 0,
						next: NEXT[r.stage] ? r.at + GAP : 0, okn: r.okn || 0, fails: r.fails.slice().reverse(), log: r.log.slice().reverse() });
				}
			}
			const pins = [];
			for (const [k, p] of await this.ctx.storage.list({ prefix: 'hp:' })) pins.push({ key: k.slice(3), ...p });
			out.sort((a, b) => (a.base === b.base ? b.n - a.n : verNewer(b.base, a.base) ? 1 : -1));
			return { list: out, pins, active: await this._hrActive(now), beta: (await this._hrBeta()).size };
		}); },
		// 有几个补丁暂停着（后台菜单上的红点）
		async hotPausedN() {
			let n = 0;
			for (const [, r] of await this.ctx.storage.list({ prefix: 'hr:' })) if (r && r.stage === 'paused') n++;
			return n;
		},
		// 后台操作：next 推下一批 / pause 暂停 / resume 继续 / back 全部退回（退到上一个） / redo 重新推送（退回过的）
		hotAct(base, n, act, list) { return this.lock(async () => {
			const now = Date.now(), recs = await this._hrSync(base, list, now), r = recs[n];
			if (!r) return { st: 404, error: '没有这个补丁' };
			const k = 'hr:' + base + '-' + n;
			if (act === 'next') {
				if (r.stage === 'paused') return { st: 400, error: '暂停着：先点「继续」' };
				if (!NEXT[r.stage]) return { st: 400, error: '已经推给全部了' };
				r.stage = NEXT[r.stage]; r.at = now; say(r, '手动推到' + (r.stage === 'all' ? '' : ' ') + HR_STAGE[r.stage], now);
			} else if (act === 'pause') {
				if (!LIVE.includes(r.stage)) return { st: 400, error: '现在不在推送' };
				r.prev = r.stage; r.stage = 'paused'; r.at = now; say(r, '手动暂停', now);
			} else if (act === 'resume') {
				if (r.stage !== 'paused') return { st: 400, error: '没有暂停' };
				r.stage = LIVE.includes(r.prev) ? r.prev : 'p10'; r.at = now; say(r, '继续推送 ' + HR_STAGE[r.stage], now);
			} else if (act === 'back') {
				if (r.stage === 'back') return { st: 400, error: '已经退回了' };
				const ns = list.map((x) => x.n).filter((x) => x >= 0 && x < n && (x === 0 || (recs[x] && recs[x].stage !== 'back'))).sort((a, b) => a - b);
				if (!ns.length) return { st: 400, error: '没有更早的补丁能退回：这个版本没有 V0' };
				const to = ns[ns.length - 1];
				for (const x of list) {
					const y = recs[x.n];
					if (!y || x.n < n || y.stage === 'back') continue;
					y.prev = y.stage; y.stage = 'back'; y.at = now; say(y, '全部退回到 V' + to, now);
					await this._hrPut('hr:' + base + '-' + x.n, y);
				}
				return { st: 200, ok: true, to };
			} else if (act === 'redo') {
				if (r.stage !== 'back') return { st: 400, error: '没有退回' };
				r.stage = (await this._hrActive(now)) ? 'beta' : 'p10'; r.at = now; r.fails = [];
				say(r, '重新推送 从' + (r.stage === 'beta' ? '' : ' ') + HR_STAGE[r.stage] + ' 开始', now);
			} else return { st: 400, error: '不认识这个操作' };
			await this._hrPut(k, r);
			return { st: 200, ok: true, stage: r.stage };
		}); },
		// 按台退回：把这台固定在某个补丁（n = null 取消固定）；托管版跟着心跳马上问一次
		hotPin(key, base, n, list) { return this.lock(async () => {
			key = String(key || '');
			if (!HR_KEY.test(key)) return { st: 400, error: '认不出这台路由器' };
			if (n == null) { await this.ctx.storage.delete('hp:' + key); }
			else {
				if (!VER_RE.test(String(base || ''))) return { st: 400, error: '版本号不对' };
				n = Math.floor(+n);
				const recs = await this._hrSync(base, list, Date.now());
				if (!list.some((x) => x.n === n) || (n > 0 && (!recs[n] || recs[n].stage === 'back'))) return { st: 400, error: '没有这个补丁' + (n === 0 ? '：这个版本没有 V0' : '') };
				await this.ctx.storage.put('hp:' + key, { base, n, at: Date.now() });
			}
			if (key.startsWith('s:')) { try { await this.watch(key.slice(2)).setHotc(); } catch (e) {} }
			return { st: 200, ok: true };
		}); },
		async hotPins() { const m = {}; for (const [k, p] of await this.ctx.storage.list({ prefix: 'hp:s:' })) m[k.slice(5)] = p; return m; },
		// 退回过的补丁（更新日志里不再显示）
		async hotBackSet() { const s = new Set(); for (const [k, r] of await this.ctx.storage.list({ prefix: 'hr:' })) if (r && r.stage === 'back') s.add(k.slice(3)); return s; },
	});
}
const verNewer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

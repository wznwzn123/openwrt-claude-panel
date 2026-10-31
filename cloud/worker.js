// 路由器云端监测（Cloudflare Worker + Durable Object）
// - 路由器每分钟发心跳（带看门狗状态），平板（证人）每分钟发心跳
// - 每分钟从 Cloudflare 探测一次隧道
// - 根据「谁还在报告」判断离线原因，变化时记一条事件
// - 面板在路由器断线时也能从这里读到实时情况（路由 <你的面板域名>/cloud/*，在隧道之前就被 Cloudflare 接住）
import { DurableObject } from 'cloudflare:workers';
import { Hub, hubFetch, hubScheduled, safeEq, SUB_RE } from './hub.js';
export { Hub };

const STALE = 150e3; // 超过 150 秒没心跳算失联（心跳每 60 秒一次）
const PROBE_FAILS = 2; // 隧道连续 2 次探测失败才算断
const MAX_EV = 300;

const LABEL = {
	ok: '一切正常',
	partial: '在线，但有问题',
	tunnel: '隧道断开',
	noreport: '路由器报告中断',
	power: '路由器断电或死机',
	net: '家里断网',
	down: '路由器离线',
	wait: '等待数据',
};
const LVL = { ok: 'ok', partial: 'warn', tunnel: 'err', noreport: 'warn', power: 'err', net: 'err', down: 'err', wait: 'info' };
const NAMES = { wan: '宽带', net: '外网', dns: 'DNS', tun: '隧道', panel: '面板服务', clash: 'OpenClash' };

export const mins = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? s + ' 秒' : s < 3600 ? Math.round(s / 60) + ' 分钟' : (s / 3600).toFixed(1).replace(/\.0$/, '') + ' 小时'; };

// 判断当前状态（纯函数，方便测试）
export function judge({ r, t, probe }, now) {
	const rFresh = !!(r && now - r.last < STALE);
	const tKnown = !!(t && t.first);
	const tFresh = !!(t && now - t.last < STALE);
	const tunDown = !!(probe && probe.fail >= PROBE_FAILS);
	const probeOk = !!(probe && probe.fail === 0 && probe.at);
	if (!r && !probe) return { state: 'wait', msg: '还没收到路由器的报告' };
	if (rFresh && !tunDown) {
		const bad = Object.keys(NAMES).filter((k) => r.rep && r.rep[k] && r.rep[k] !== 'ok');
		if (bad.length) return { state: 'partial', msg: bad.map((k) => NAMES[k]).join('、') + ' 有问题' + (r.rep.tcause ? '（' + r.rep.tcause + '）' : ''), key: bad.join(',') };
		return { state: 'ok', msg: '路由器在线，一切正常' };
	}
	// 隧道断了：只有在隧道开始失败「之后」路由器还发过心跳，才说明路由器本身是好的；否则可能是刚断电，先等心跳过期再判断
	if (rFresh && tunDown && r.last < (probe.firstFail || 0) - 5000) return null;
	if (rFresh && tunDown) return { state: 'tunnel', msg: '路由器本身正常，但隧道断了（面板和 Claude 暂时连不上，看门狗会自动修）' + (r.rep && r.rep.tcause ? '。路由器报告：' + r.rep.tcause : '') };
	// 路由器没心跳了
	if (!tunDown && probeOk) return { state: 'noreport', msg: '路由器能连上，但它的报告发不出来（可能是代理节点或 DNS 出了问题）' };
	if (!tunDown) return null; // 隧道只失败了 1 次，还没确定，保持原状态等下一次探测
	if (tKnown && tFresh) return { state: 'power', msg: '平板还在报告，家里宽带是好的；可能是路由器断电、死机，或它和上级路由器（光猫）之间的网线断了' };
	if (tKnown) return { state: 'net', msg: '路由器和平板都没有报告；可能是宽带、光猫或上级路由器出了问题，也可能是家里停电' };
	return { state: 'down', msg: '可能断电，也可能家里断网（没有平板作证，暂时分不清是哪一种）' };
}

// 根据新旧状态生成事件
export function step(db, now) {
	const prev = db.s || { state: 'wait', since: now };
	const j = judge(db, now) || { state: prev.state, key: prev.key, msg: prev.msg };
	const ev = [];
	const same = prev.state === j.state && (prev.key || '') === (j.key || '');
	let s = prev;
	if (!same) {
		// 断线类状态的起点：最后一次听到路由器的时间 / 隧道第一次探测失败的时间
		let since = now;
		if (['power', 'net', 'down', 'noreport'].includes(j.state) && db.r) since = db.r.last;
		if (j.state === 'tunnel' && db.probe && db.probe.firstFail) since = db.probe.firstFail;
		// 先判断断电、后来平板也断了：断网是从平板停的时候开始的
		if (j.state === 'net' && prev.state === 'power' && db.t) since = db.t.last;
		// 连续几种离线状态算同一次离线，记下整次离线的起点
		const OUT = ['tunnel', 'power', 'net', 'down'];
		const outStart = OUT.includes(j.state) ? (OUT.includes(prev.state) ? prev.outStart || prev.since : since) : null;
		s = { state: j.state, key: j.key || '', since, msg: j.msg, outStart };
		if (j.state === 'ok' && prev.state !== 'wait') {
			const os = prev.outStart && prev.outStart < prev.since ? prev.outStart : null;
			const txt = os ? `离线共 ${mins(now - os)}，最后是「${LABEL[prev.state]}」${mins(now - prev.since)}` : `${LABEL[prev.state]}持续了 ${mins(now - prev.since)}`;
			ev.push({ t: now, lvl: 'ok', kind: 'cloud', msg: `恢复正常（${txt}）`, detail: prev.msg || '', from: Math.round((os || prev.since) / 1000), to: Math.round(now / 1000) });
		} else if (j.state !== 'ok' && j.state !== 'wait') {
			ev.push({ t: now, lvl: LVL[j.state], kind: 'cloud', msg: LABEL[j.state] + '：' + j.msg, detail: '', from: Math.round(since / 1000), to: 0 });
		}
	} else if (s.msg !== j.msg) s = { ...s, msg: j.msg };
	// 平板（证人）自己的状态：只在路由器还在报告时记，避免全家断网时重复报
	const tFresh = !!(db.t && now - db.t.last < STALE);
	const tw = db.tw || 'none';
	let ntw = tw;
	if (db.t && db.t.first) {
		if (!tFresh && tw === 'ok' && (j.state === 'ok' || j.state === 'partial')) {
			ntw = 'down';
			ev.push({ t: now, lvl: 'warn', kind: 'tablet', msg: '平板停止报告了：断电断线时就分不清原因了。检查平板是否开着、连着另一个网络（不是这台路由器）、MacroDroid 是否在运行', detail: '', from: Math.round(db.t.last / 1000), to: 0 });
		} else if (tFresh && tw !== 'ok') {
			ntw = 'ok';
			ev.push({ t: now, lvl: 'ok', kind: 'tablet', msg: tw === 'none' ? '平板开始报告，以后断线能分清是断电还是断网了' : '平板恢复报告', detail: '', from: 0, to: 0 });
		}
	}
	return { s, tw: ntw, ev };
}

/* ---------- 手机推送（Web Push：VAPID 签名 + aes128gcm 加密，全用 WebCrypto） ---------- */
const te = new TextEncoder();
export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const ub64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
async function hkdf(salt, ikm, info, len) {
	const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
// RFC 8291：用订阅里的公钥和 auth 加密推送内容
export async function encryptPush(sub, payload) {
	const uaPub = ub64u(sub.keys.p256dh), auth = ub64u(sub.keys.auth);
	const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
	const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
	const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
	const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
	const ikm = await hkdf(auth, ecdh, cat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
	const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
	const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(te.encode(payload), new Uint8Array([2]))));
	const rs = new Uint8Array([0, 0, 16, 0]); // 4096
	return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
// VAPID：证明推送是我们发的（ES256 签名的 JWT）
export async function vapidAuth(endpoint, env) {
	const aud = new URL(endpoint).origin;
	const jwk = JSON.parse(env.VAPID_PRIV);
	const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
	const h = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const c = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUB || 'mailto:admin@example.com' })));
	const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(h + '.' + c));
	return `vapid t=${h}.${c}.${b64u(sig)}, k=${env.VAPID_PUB}`;
}
export async function sendPush(sub, msg, env) {
	const body = await encryptPush(sub, JSON.stringify(msg));
	const res = await fetch(sub.endpoint, {
		method: 'POST',
		headers: { Authorization: await vapidAuth(sub.endpoint, env), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high', ...(msg.tag ? { Topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'r' } : {}) },
		body,
	});
	return res.status;
}
// 微信推送（PushPlus）：不依赖浏览器，国内手机最稳
const fmtT = (t) => new Date(t + 8 * 3600e3).toISOString().slice(5, 19).replace('T', ' ').replace('-', '月').replace(' ', '日 ');
export async function sendWx(token, msg) {
	const esc = (x) => String(x || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
	const content = (msg.body ? esc(msg.body).replace(/\n/g, '<br>') + '<br><br>' : '') + '<span style="color:#888">' + fmtT(msg.t || Date.now()) + ' · 我的路由器</span>';
	const r = await fetch('https://www.pushplus.plus/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, title: String(msg.title || '我的路由器').slice(0, 100), content, template: 'html' }) });
	let j = null;
	try { j = await r.json(); } catch (e) {}
	if (j && j.code === 200) return { ok: true };
	return { ok: false, err: (j && j.msg) || 'PushPlus 返回 ' + r.status, code: j ? j.code : r.status };
}
// 云端事件 → 要不要推送、推什么
export function pushFor(e) {
	if (e.kind === 'cloud') {
		if (e.lvl === 'ok') return { title: '路由器恢复正常', body: e.msg.replace(/^恢复正常/, '').replace(/^（|）$/g, ''), tag: 'cloud', lvl: 'ok' };
		if (e.msg.startsWith('在线，但有问题')) return null; // 具体问题由路由器自己推
		const i = e.msg.indexOf('：');
		return { title: '⚠️ ' + (i > 0 ? e.msg.slice(0, i) : '路由器出问题了'), body: i > 0 ? e.msg.slice(i + 1) : e.msg, tag: 'cloud', lvl: e.lvl };
	}
	if (e.kind === 'tablet' && e.lvl === 'warn') return { title: '平板（证人）停止报告了', body: e.msg.replace(/^平板停止报告了：/, ''), tag: 'tablet', lvl: 'warn' };
	return null;
}

const BK_CHUNK = 120 * 1024, BK_MAX = 10, BK_LIMIT = 20 * 1024 * 1024;
export class Watch extends DurableObject {
	// 托管模式：每台路由器一个 Watch，配置（钥匙、探测地址、是否封禁）由开通中心写进来
	async setup(c) { await this.ctx.storage.put('cfg', c); await this.ensureAlarm(); }
	async getCfg() { return (await this.ctx.storage.get('cfg')) || null; }
	// 给官网「我的路由器」看的在线状态（只读，不启动定时器）
	async brief() { const m = await this.ctx.storage.get(['r', 's']); const r = m.get('r'), s = m.get('s'); return { last: (r && r.last) || 0, state: (s && s.state) || 'wait' }; }
	async setOff(off) { const c = await this.getCfg(); if (!c) return; c.off = !!off; await this.ctx.storage.put('cfg', c); }
	async wipe() { await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll(); }
	async load() {
		const m = await this.ctx.storage.get(['r', 't', 's', 'probe', 'tw']);
		return { r: m.get('r'), t: m.get('t'), s: m.get('s'), probe: m.get('probe'), tw: m.get('tw') };
	}
	async ensureAlarm() {
		if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 5000);
	}
	// 推送到所有订阅了的手机；同一类通知 30 秒内只推一次；手机取消订阅了就删掉
	async push(msg) {
		const subs = this.env.VAPID_PRIV ? (await this.ctx.storage.get('subs')) || [] : [];
		const wx = await this.ctx.storage.get('wx');
		if (!subs.length && !(wx && wx.token)) return 0;
		const last = (await this.ctx.storage.get('pushLast')) || {};
		const now = Date.now(), k = (msg.tag || '') + '|' + msg.title;
		if (!msg.force && last[k] && now - last[k] < 30e3) return 0;
		last[k] = now;
		for (const x in last) if (now - last[x] > 3600e3) delete last[x];
		await this.ctx.storage.put('pushLast', last);
		const keep = [];
		let sent = 0;
		for (const s of subs) {
			let st = 0;
			// 每条推送带一个编号，手机收到后回报（这样能知道推送有没有真的到手机）
			const id = b64u(crypto.getRandomValues(new Uint8Array(6)));
			try { st = await sendPush(s, { ...msg, id, t: now, url: msg.url || './?p=wd' }, this.env); } catch (e) { st = -1; }
			if (st === 404 || st === 410) continue;
			if (st >= 200 && st < 300) { sent++; s.ok = now; s.err = null; s.last = { id, t: now, title: String(msg.title || '').slice(0, 60) }; } else s.err = st;
			keep.push(s);
		}
		if (subs.length) await this.ctx.storage.put('subs', keep);
		if (wx && wx.token) {
			let r;
			try { r = await sendWx(wx.token, { ...msg, t: now }); } catch (e) { r = { ok: false, err: '连不上 PushPlus：' + e.message }; }
			// 再读一次，别覆盖掉同时发生的修改
			const cur = await this.ctx.storage.get('wx');
			if (cur && cur.token === wx.token) {
				if (r.ok) { sent++; cur.ok = now; cur.err = null; } else { cur.err = r.err; cur.errAt = now; }
				await this.ctx.storage.put('wx', cur);
			}
		}
		return sent;
	}
	async wxInfo() {
		const w = await this.ctx.storage.get('wx');
		return w && w.token ? { on: true, tail: w.token.slice(-4), ok: w.ok || 0, err: w.err || null, errAt: w.errAt || 0, at: w.at } : { on: false };
	}
	async wxSet(token) {
		if (!token) { await this.ctx.storage.delete('wx'); return this.wxInfo(); }
		await this.ctx.storage.put('wx', { token, at: Date.now() });
		return this.wxInfo();
	}
	async addEvents(ev) {
		if (!ev.length) return;
		for (const e of ev) { const m = pushFor(e); if (m) await this.push(m); }
		const old = (await this.ctx.storage.get('ev')) || [];
		await this.ctx.storage.put('ev', [...ev.reverse(), ...old].slice(0, MAX_EV));
	}
	async evaluate(db, now) {
		const { s, tw, ev } = step(db, now);
		const put = {};
		if (JSON.stringify(s) !== JSON.stringify(db.s)) put.s = s;
		if (tw !== db.tw) put.tw = tw;
		if (Object.keys(put).length) await this.ctx.storage.put(put);
		await this.addEvents(ev);
		return s;
	}
	async beat(who, rep) {
		const now = Date.now();
		const db = await this.load();
		if (who === 'r') {
			db.r = { last: now, rep: rep || (db.r && db.r.rep) || null };
			await this.ctx.storage.put('r', db.r);
		} else {
			db.t = { last: now, first: (db.t && db.t.first) || now };
			await this.ctx.storage.put('t', db.t);
		}
		// 心跳一回来就马上更新判断（不用等下一分钟）
		await this.evaluate(db, now);
		await this.ensureAlarm();
		// 托管模式：每 6 小时告诉开通中心「这台还在用」（90 天没上线的会被回收）
		if (who === 'r' && this.env.BASE_DOMAIN && this.env.H) {
			const c = await this.getCfg();
			if (c && (!c.seenAt || now - c.seenAt > 6 * 3600e3)) {
				c.seenAt = now;
				await this.ctx.storage.put('cfg', c);
				try { await this.env.H.get(this.env.H.idFromName('hub')).seen(c.sub, now); } catch (e) {}
			}
		}
	}
	async alarm() {
		const now = Date.now();
		let probeUrl = this.env.PROBE_URL;
		if (this.env.BASE_DOMAIN) { const c = await this.getCfg(); if (!c || c.off) return; probeUrl = c.probe; }
		const db = await this.load();
		let code = 0;
		try {
			const res = await fetch(probeUrl + '?cf=' + now, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(10000) });
			code = res.status;
		} catch (e) { code = 0; }
		const p = db.probe || { fail: 0 };
		db.probe = code === 200 ? { at: now, code, fail: 0 } : { at: now, code, fail: (p.fail || 0) + 1, firstFail: p.fail ? p.firstFail : now };
		await this.ctx.storage.put('probe', db.probe);
		await this.evaluate(db, now);
		await this.ctx.storage.setAlarm(now + 60e3);
	}
	async status() {
		await this.ensureAlarm();
		const db = await this.load();
		return { now: Date.now(), s: db.s || { state: 'wait', since: Date.now(), msg: '还没收到路由器的报告' }, label: LABEL, r: db.r || null, t: db.t || null, probe: db.probe || null, events: (await this.ctx.storage.get('ev')) || [] };
	}
	async clear() {
		await this.ctx.storage.put('ev', []);
	}
	// 云端备份：每份切成 120KB 一块存（兼容旧式存储每个值 128KB 的上限），最多留 BK_MAX 份
	async bkList() { return (await this.ctx.storage.get('bkl')) || []; }
	async bkPut(meta, buf) {
		const id = Date.now().toString(36), u8 = new Uint8Array(buf), n = Math.ceil(u8.length / BK_CHUNK), put = {};
		for (let i = 0; i < n; i++) put['bk:' + id + ':' + i] = u8.slice(i * BK_CHUNK, (i + 1) * BK_CHUNK);
		const keys = Object.keys(put);
		for (let i = 0; i < keys.length; i += 16) await this.ctx.storage.put(Object.fromEntries(keys.slice(i, i + 16).map((k) => [k, put[k]])));
		let list = await this.bkList();
		list.unshift({ id, n, size: u8.length, at: Date.now(), name: meta.name, kind: meta.kind, files: meta.files });
		const drop = list.slice(BK_MAX);
		list = list.slice(0, BK_MAX);
		await this.ctx.storage.put('bkl', list);
		for (const d of drop) await this.bkRm(d);
		return { id, size: u8.length, n, total: list.length };
	}
	async bkGet(id) {
		const m = (await this.bkList()).find((x) => x.id === id);
		if (!m) return null;
		const got = await this.ctx.storage.get([...Array(m.n)].map((_, i) => 'bk:' + id + ':' + i));
		const out = new Uint8Array(m.size);
		let off = 0;
		for (let i = 0; i < m.n; i++) { const c = got.get('bk:' + id + ':' + i); if (!c) return null; out.set(c, off); off += c.length; }
		return off === m.size ? { meta: m, buf: out.buffer } : null;
	}
	async bkRm(m) { const keys = [...Array(m.n)].map((_, i) => 'bk:' + m.id + ':' + i); for (let i = 0; i < keys.length; i += 128) await this.ctx.storage.delete(keys.slice(i, i + 128)); }
	async bkDel(id) {
		const list = await this.bkList(), m = list.find((x) => x.id === id);
		if (!m) return false;
		await this.ctx.storage.put('bkl', list.filter((x) => x.id !== id));
		await this.bkRm(m);
		return true;
	}
	async subs(op, b) {
		let subs = (await this.ctx.storage.get('subs')) || [];
		if (op === 'sub' && b.sub && b.sub.endpoint && b.sub.keys) {
			subs = subs.filter((s) => s.endpoint !== b.sub.endpoint);
			subs.push({ endpoint: b.sub.endpoint, keys: { p256dh: b.sub.keys.p256dh, auth: b.sub.keys.auth }, name: String(b.name || '手机').slice(0, 40), at: Date.now() });
			subs = subs.slice(-10);
		}
		if (op === 'unsub') subs = subs.filter((s) => s.endpoint !== b.endpoint);
		if (op === 'ack') {
			const s = subs.find((x) => x.last && x.last.id === b.id);
			if (!s) return null;
			s.recv = { id: b.id, t: Date.now(), shown: !!b.shown, err: b.err ? String(b.err).slice(0, 200) : null, perm: String(b.perm || '').slice(0, 20) };
		}
		await this.ctx.storage.put('subs', subs);
		return subs.map((s) => ({ name: s.name, at: s.at, ok: s.ok || 0, err: s.err || null, host: (() => { try { return new URL(s.endpoint).host; } catch (e) { return ''; } })(), sent: s.last ? s.last.t : 0, recv: s.recv && s.last && s.recv.id === s.last.id ? s.recv : null, me: s.endpoint === (b.endpoint || b.sub?.endpoint) }));
	}
}

// 这个请求是哪台路由器的：自建模式只有一台；托管模式看子域名（钥匙存在那台路由器自己的 Watch 里）
async function tenant(u, env) {
	if (!env.BASE_DOMAIN) return { w: env.W.get(env.W.idFromName('home')), rkey: env.RKEY, tkey: env.TKEY, pkey: env.PANEL_TOKEN };
	const h = u.hostname, base = '.' + env.BASE_DOMAIN;
	if (!h.endsWith(base)) return null;
	const sub = h.slice(0, -base.length);
	if (!SUB_RE.test(sub)) return null;
	const w = env.W.get(env.W.idFromName('dev:' + sub));
	const c = await w.getCfg();
	if (!c || c.off) return null;
	return { w, rkey: c.rkey, tkey: c.tkey, pkey: c.pkey, sub };
}
const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export default {
	async fetch(req, env) {
		try {
			if (env.BASE_DOMAIN) {
				const h = new URL(req.url).hostname;
				if (h === env.BASE_DOMAIN || h === 'www.' + env.BASE_DOMAIN) return await hubFetch(req, env);
			}
			return await handle(req, env);
		} catch (e) { return J({ error: '云端出错：' + (e && e.message || e) }, 500); }
	},
	async scheduled(ev, env) { if (env.BASE_DOMAIN) await hubScheduled(env); },
};
async function handle(req, env) {
	{
		const u = new URL(req.url);
		const p = u.pathname.split('/').filter(Boolean); // cloud, beat, r|t, key
		if (p[0] !== 'cloud') return J({ error: 'not found' }, 404);
		const T = await tenant(u, env);
		if (!T) return J({ error: 'not found' }, 404);
		const w = T.w;
		if (p[1] === 'beat' && p.length === 4) {
			if (p[2] === 'r' && safeEq(p[3], T.rkey)) {
				let rep = null;
				if (req.method === 'POST') { try { rep = await req.json(); } catch (e) {} }
				await w.beat('r', rep);
				return J({ ok: true });
			}
			if (p[2] === 't' && safeEq(p[3], T.tkey)) { await w.beat('t'); return J({ ok: true }); }
			return J({ error: 'bad key' }, 403);
		}
		// 路由器发来的通知（新设备、节点切换、DNS/OpenClash 故障…）
		if (p[1] === 'n' && p.length === 3 && req.method === 'POST') {
			if (!safeEq(p[2], T.rkey)) return J({ error: 'bad key' }, 403);
			let b = {};
			try { b = await req.json(); } catch (e) {}
			if (!b.title) return J({ error: 'no title' }, 400);
			const icon = { err: '⚠️ ', warn: '', ok: '✅ ', info: '' }[b.lvl] ?? '';
			const sent = await w.push({ title: icon + String(b.title).slice(0, 120), body: String(b.body || '').slice(0, 500), tag: String(b.tag || b.kind || 'router').slice(0, 60), lvl: b.lvl || 'info' });
			return J({ ok: true, sent });
		}
		// 云端备份（只有路由器拿着 RKEY 能用；面板经路由器转发）
		if (p[1] === 'bk' && p.length >= 3) {
			if (!safeEq(p[2], T.rkey)) return J({ error: 'bad key' }, 403);
			const id = p[3];
			if (!id && req.method === 'POST') {
				const buf = await req.arrayBuffer();
				if (buf.byteLength < 100 || buf.byteLength > BK_LIMIT) return J({ error: '备份大小不对（' + buf.byteLength + ' 字节）' }, 400);
				const q = u.searchParams;
				const r = await w.bkPut({ name: String(q.get('name') || 'router').slice(0, 60), kind: q.get('kind') === 'auto' ? 'auto' : 'manual', files: +q.get('files') || 0 }, buf);
				return J({ ok: true, ...r });
			}
			if (!id && req.method === 'GET') return J({ ok: true, list: await w.bkList(), max: BK_MAX });
			if (id && req.method === 'GET') {
				const r = await w.bkGet(id);
				if (!r) return J({ error: '没有这份备份' }, 404);
				return new Response(r.buf, { headers: { 'content-type': 'application/gzip', 'content-disposition': 'attachment; filename="' + encodeURIComponent(r.meta.name) + '.tar.gz"', 'cache-control': 'no-store' } });
			}
			if (id && req.method === 'DELETE') return J({ ok: await w.bkDel(id) });
			return J({ error: 'bad request' }, 400);
		}
		if (p[1] === 'push' && p[2] === 'key' && req.method === 'GET') return J({ key: env.VAPID_PUB || null });
		// 手机收到推送后回报（不需要密钥：只认云端刚发出去的随机编号）
		if (p[1] === 'push' && p[2] === 'ack' && req.method === 'POST') {
			let b = {};
			try { b = await req.json(); } catch (e) {}
			if (!b.id || typeof b.id !== 'string' || b.id.length > 16) return J({ error: 'bad id' }, 400);
			const r = await w.subs('ack', b);
			return J({ ok: !!r });
		}
		if (p[1] === 'push' && req.method === 'POST') {
			let b = {};
			try { b = await req.json(); } catch (e) {}
			if (!safeEq(b.token, T.pkey)) return J({ error: 'bad token' }, 403);
			if (b.op === 'test') {
				const sent = await w.push({ title: '测试通知 🔔', body: '能看到这条，说明路由器有情况时会推送到这台手机', tag: 'test', lvl: 'info', force: true });
				return J({ ok: true, sent, subs: await w.subs('list', b), wx: await w.wxInfo() });
			}
			// 微信推送：设置 / 删除 PushPlus 的 token，设置后马上发一条测试
			if (b.op === 'wx') {
				const t = String(b.wx || '').trim();
				if (t && !/^[A-Za-z0-9]{16,64}$/.test(t)) return J({ error: 'token 格式不对：应该是一串 32 位左右的字母数字' }, 400);
				if (!t) return J({ ok: true, wx: await w.wxSet(''), subs: await w.subs('list', b) });
				const r = await sendWx(t, { title: '微信推送已开启 🔔', body: '以后路由器断电、断网、出问题和恢复正常，都会推送到这里。', t: Date.now() }).catch((e) => ({ ok: false, err: '连不上 PushPlus：' + e.message }));
				if (!r.ok) return J({ error: '微信没发出去：' + r.err }, 400);
				await w.wxSet(t);
				return J({ ok: true, wx: await w.wxInfo(), subs: await w.subs('list', b) });
			}
			return J({ ok: true, subs: await w.subs(b.op || 'list', b), wx: await w.wxInfo() });
		}
		if (p[1] === 's' && req.method === 'POST') {
			let b = {};
			try { b = await req.json(); } catch (e) {}
			if (!safeEq(b.token, T.pkey)) return J({ error: 'bad token' }, 403);
			if (b.clear) await w.clear();
			return J(await w.status());
		}
		return J({ error: 'not found' }, 404);
	}
}

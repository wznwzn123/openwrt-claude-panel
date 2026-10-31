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
export const LIMITS = { perIpHour: 5, allHour: 60, idleDays: 90, pendingMs: 3600e3 };

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
		e.status = r.status;
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
		made.dns = await dnsAdd(env, sub, t.id);
		made.token = t.token || (await cf(env, 'GET', `/accounts/${acc}/cfd_tunnel/${t.id}/token`));
		return made;
	} catch (e) {
		await deprovision(env, made).catch(() => {});
		throw e;
	}
}
export async function deprovision(env, { tunnel, dns }) {
	await dnsDel(env, dns);
	if (tunnel) {
		const acc = env.CF_ACCOUNT_ID;
		try { await cf(env, 'DELETE', `/accounts/${acc}/cfd_tunnel/${tunnel}/connections`); } catch (e) {}
		try { await cf(env, 'DELETE', `/accounts/${acc}/cfd_tunnel/${tunnel}`); } catch (e) { if (e.status !== 404) throw e; }
	}
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
			return { st: 502, error: '开通失败：' + e.message };
		}
		const keys = { rkey: rnd(32), tkey: rnd(32), pkey: rnd(32) };
		const h = host(this.env, sub);
		await this.watch(sub).setup({ sub, ...keys, probe: 'https://' + h + '/panel/manifest.json' });
		await this.ctx.storage.put('d:' + sub, { sub, state: 'ok', created: now, seen: now, invite: code, name: clean(name, 40), model: clean(model, 60), tunnel: made.tunnel, dns: made.dns });
		return { st: 200, sub, host: h, token: made.token, url: 'https://' + h + '/cloud', ...keys };
	}
	// 删除一台：删子域名和隧道、清空它的云端数据、腾出名额
	remove(sub) { return this.lock(() => this._remove(sub)); }
	async _remove(sub) {
		const d = await this.ctx.storage.get('d:' + sub);
		if (!d) return false;
		await deprovision(this.env, d);
		await this.watch(sub).wipe();
		await this.ctx.storage.delete('d:' + sub);
		await this.addCount(-1);
		return true;
	}
	unregister(a) { return this.lock(() => this._unregister(a)); }
	async _unregister({ sub, rkey }) {
		if (!SUB_RE.test(sub || '')) return { st: 404, error: '没有这台路由器' };
		const c = await this.watch(sub).getCfg();
		if (!c || !safeEq(rkey, c.rkey)) return { st: 403, error: '钥匙不对' };
		await this._remove(sub);
		return { st: 200, ok: true };
	}
	async seen(sub, t) {
		const d = await this.ctx.storage.get('d:' + sub);
		if (d) { d.seen = t; await this.ctx.storage.put('d:' + sub, d); }
	}
	// 封禁：删掉子域名（网址立刻打不开）、云端功能拒绝；解封：重新加回子域名
	setOff(sub, off) { return this.lock(() => this._setOff(sub, off)); }
	async _setOff(sub, off) {
		const d = await this.ctx.storage.get('d:' + sub);
		if (!d || d.state !== 'ok') return false;
		if (off && !d.off) { await dnsDel(this.env, d.dns); d.dns = null; d.off = Date.now(); }
		if (!off && d.off) { d.dns = await dnsAdd(this.env, sub, d.tunnel); delete d.off; }
		await this.watch(sub).setOff(!!off);
		await this.ctx.storage.put('d:' + sub, d);
		return true;
	}
	async devices() { return [...(await this.ctx.storage.list({ prefix: 'd:' })).values()]; }
	async invites() { return [...(await this.ctx.storage.list({ prefix: 'i:' })).entries()].map(([k, v]) => ({ code: k.slice(2), ...v })); }
	async addInvite({ max, days, note }) {
		let code;
		do { code = rnd(10).toUpperCase(); } while (await this.ctx.storage.get('i:' + code));
		const inv = { max: Math.max(1, Math.min(1000, +max || 1)), used: 0, created: Date.now(), exp: +days > 0 ? Date.now() + days * DAY : 0, note: clean(note, 60) };
		await this.ctx.storage.put('i:' + code, inv);
		return { code, ...inv };
	}
	async delInvite(code) { return this.ctx.storage.delete('i:' + String(code || '').toUpperCase()); }
	async stats() { return { count: await this.count(), max: this.max() }; }
	// 每天清理：90 天没上线的回收；开通到一半卡住超过 1 小时的也清掉
	cleanup(now) { return this.lock(() => this._cleanup(now || Date.now())); }
	async _cleanup(now) {
		const out = [];
		for (const d of await this.devices()) {
			const stale = d.state === 'ok' ? now - (d.seen || d.created) > LIMITS.idleDays * DAY : now - d.created > LIMITS.pendingMs;
			if (!stale) continue;
			try {
				if (d.state === 'ok') await this._remove(d.sub);
				else { await this.ctx.storage.delete('d:' + d.sub); await this.addCount(-1); }
				out.push(d.sub);
			} catch (e) {}
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
	if (p === '/api/ping') return J({ ok: true, ...(await H.stats()) });
	if (p === '/api/register' && req.method === 'POST') {
		const b = await body();
		const r = await H.register({ invite: b.invite, name: b.name, model: b.model, ip: req.headers.get('cf-connecting-ip') || '' });
		const { st, ...rest } = r;
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
		if (a[0] === 'devices' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.devices(), ...(await H.stats()) });
		if (a[0] === 'devices' && SUB_RE.test(a[1] || '') && req.method === 'POST') {
			const op = a[2];
			if (op === 'off' || op === 'on') return J({ ok: await H.setOff(a[1], op === 'off') });
			if (op === 'delete') return J({ ok: await H.remove(a[1]) });
		}
		if (a[0] === 'invites' && !a[1] && req.method === 'GET') return J({ ok: true, list: await H.invites() });
		if (a[0] === 'invites' && !a[1] && req.method === 'POST') return J({ ok: true, invite: await H.addInvite(await body()) });
		if (a[0] === 'invites' && a[1] && req.method === 'DELETE') return J({ ok: await H.delInvite(a[1]) });
		if (a[0] === 'cleanup' && req.method === 'POST') return J({ ok: true, removed: await H.cleanup() });
		return J({ error: 'not found' }, 404);
	}
	if (p === '/' || p === '/index.html') return new Response(HOME, { headers: { 'content-type': 'text/html; charset=utf-8' } });
	return J({ error: 'not found' }, 404);
}
export async function hubScheduled(env) { await hubObj(env).cleanup(); }

// 官网首页（第二期会换成完整的官网和账号页面）
const HOME = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>路由器面板</title>
<style>body{margin:0;font:16px/1.6 -apple-system,"PingFang SC","Noto Sans SC",sans-serif;background:#f2f2f7;color:#111;display:grid;place-items:center;min-height:100vh}main{max-width:480px;padding:32px 20px;text-align:center}h1{font-size:28px;margin:0 0 8px}p{color:#6e6e73}</style></head>
<body><main><h1>路由器面板</h1><p>OpenWrt 路由器的手机控制面板。官网正在建设中。</p></main></body></html>`;

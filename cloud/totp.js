// 6.0 第 5 项：官网账号两步验证（可选开启）——验证器 App 上的 6 位动态码（TOTP，RFC 6238：HMAC-SHA1、30 秒一换、6 位）
// - 开启：先确认本人（邮箱验证码），扫码或手动输入密钥，输对一次验证器上的码才算开启；同时给 10 个备用恢复码（只显示这一次，账号里只存摘要）
// - 开启以后：没验证过的设备登录（输对密码以后）要输验证器上的码或恢复码，不再发邮箱验证码；找回密码以后也要输
// - 关闭、重新生成恢复码：要输验证器上的码（或恢复码）
// - 验证器和恢复码都丢了：联系开发者，在管理后台确认是本人后关掉（写原因、记日志、发邮件）
// - 同一个码只能用一次（记下用过的时间段）；一个账号 15 分钟内错 10 次就先停 15 分钟
import { rnd, safeEq } from './hub.js';

const STEP = 30;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RC_N = 10;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');

export function b32enc(bytes) {
	let bits = 0, v = 0, out = '';
	for (const b of bytes) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } }
	if (bits > 0) out += B32[(v << (5 - bits)) & 31];
	return out;
}
export function b32dec(s) {
	s = String(s || '').toUpperCase().replace(/[\s=-]/g, '');
	const out = []; let bits = 0, v = 0;
	for (const c of s) { const i = B32.indexOf(c); if (i < 0) return null; v = (v << 5) | i; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
	return new Uint8Array(out);
}
// 某个时间段（第几个 30 秒）的 6 位码
export async function totpAt(secret, step) {
	const key = await crypto.subtle.importKey('raw', b32dec(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
	const msg = new Uint8Array(8); let x = step;
	for (let i = 7; i >= 0; i--) { msg[i] = x & 255; x = Math.floor(x / 256); }
	const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
	const o = h[19] & 15, n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
	return String(n % 1e6).padStart(6, '0');
}
// 对不对：前后各差一个时间段也算（手机时间差一点、输得慢）；返回对上的时间段，比 last 早或相同（用过了）都不算
export async function totpMatch(secret, code, now, last = -1) {
	code = String(code || '').replace(/\s/g, '');
	if (!/^\d{6}$/.test(code)) return -1;
	const t = Math.floor(now / 1000 / STEP);
	for (const s of [t, t - 1, t + 1]) if (s > last && safeEq(await totpAt(secret, s), code)) return s;
	return -1;
}
// 恢复码：8 位（去掉容易看错的字符），显示成 xxxx-xxxx；输的时候大小写、空格、横线都不管
const rcNorm = (c) => String(c || '').toLowerCase().replace(/[\s-]/g, '');
const rcShow = (c) => c.slice(0, 4) + '-' + c.slice(4);
const RC_RE = /^[a-z2-9]{8}$/;

export function installTotp(Hub) {
	Object.assign(Hub.prototype, {
		totpBrief(u) { return u && u.totp ? { on: true, at: u.totp.at || 0, rc: (u.totp.rc || []).length } : { on: false }; },
		async totpNewRc(u) {
			const codes = Array.from({ length: RC_N }, () => rnd(8));
			u.totp.rc = await Promise.all(codes.map((c) => sha('rc:' + u.uid + ':' + c)));
			return codes.map(rcShow);
		},
		// 核对验证器上的码或恢复码（调用的地方负责把 u 存回去）：{ ok, how: 'totp' | 'rc', locked }
		async totpTry(u, code) {
			if (!u || !u.totp) return { ok: false };
			const fk = 'r:tf:' + u.uid, now = Date.now();
			const f = ((await this.ctx.storage.get(fk)) || []).filter((t) => t > now - 900e3);
			if (f.length >= 10) return { ok: false, locked: true };
			const s = await totpMatch(u.totp.s, code, now, u.totp.last ?? -1);
			if (s >= 0) { u.totp.last = s; return { ok: true, how: 'totp' }; }
			const c = rcNorm(code);
			if (RC_RE.test(c)) {
				const h = await sha('rc:' + u.uid + ':' + c), i = (u.totp.rc || []).indexOf(h);
				if (i >= 0) { u.totp.rc.splice(i, 1); return { ok: true, how: 'rc' }; }
			}
			f.push(now); await this.ctx.storage.put(fk, f);
			return { ok: false, locked: f.length >= 10 };
		},
		// 开启第一步：确认过本人以后，发一个新密钥（10 分钟内输对验证器上的码才算开启）
		async totpSetup(uid, sid) {
			const u = await this.ctx.storage.get('u:' + uid);
			if (!u) return { st: 401, error: '请先登录' };
			if (u.totp) return { st: 409, error: '两步验证已经开着了' };
			if (!(await this.webSudoOk(sid))) return { st: 403, error: '要先确认是你本人（邮箱验证码）', sudo: true };
			const secret = b32enc(crypto.getRandomValues(new Uint8Array(20)));
			await this.ctx.storage.put('tq:' + uid, { s: secret, sid, exp: Date.now() + 600e3, tries: 0 });
			const iss = '路由器面板';
			const uri = 'otpauth://totp/' + encodeURIComponent(iss + ':' + u.email) + '?secret=' + secret + '&issuer=' + encodeURIComponent(iss) + '&algorithm=SHA1&digits=6&period=30';
			return { st: 200, ok: true, secret, uri };
		},
		// 开启第二步：输对验证器上的码 → 开启，给恢复码；别的设备下次登录要输验证器上的码（登录着的不动）
		totpOn(uid, sid, code, did) { return this.lock(() => this._totpOn(uid, sid, code, did)); },
		async _totpOn(uid, sid, code, did) {
			const u = await this.ctx.storage.get('u:' + uid);
			if (!u) return { st: 401, error: '请先登录' };
			if (u.totp) return { st: 409, error: '两步验证已经开着了' };
			const k = 'tq:' + uid, q = await this.ctx.storage.get(k);
			if (!q || q.exp < Date.now() || q.sid !== sid) { if (q) await this.ctx.storage.delete(k); return { st: 400, error: '时间太久了，请重新点「开启两步验证」', again: true }; }
			const s = await totpMatch(q.s, code, Date.now());
			if (s < 0) {
				q.tries = (q.tries || 0) + 1;
				if (q.tries >= 5) { await this.ctx.storage.delete(k); return { st: 400, error: '输错太多次了，请重新点「开启两步验证」', again: true }; }
				await this.ctx.storage.put(k, q);
				return { st: 400, error: '验证码不对。看看手机时间是不是准的，输验证器上「路由器面板」下面现在显示的 6 位数字' };
			}
			await this.ctx.storage.delete(k);
			u.totp = { s: q.s, at: Date.now(), last: s, rc: [] };
			const codes = await this.totpNewRc(u);
			await this.trustOnly(u, did);
			const nd = await this.trust(u, did);
			await this.ctx.storage.put('u:' + uid, u);
			await this.loginLog({ k: 'user', who: u.email, ok: true, why: '开启了两步验证' });
			try { await this.mail(u.email, '你的账号开启了两步验证', '<p>你好，</p><p>你的官网账号刚刚开启了两步验证：以后在没验证过的手机或电脑上登录，输对密码后还要输验证器 App 上的 6 位数字。</p><p>请把备用恢复码存好：手机丢了、验证器删了，用它登录（一个只能用一次）。</p><p><b>不是你本人开启的话</b>，说明有人登录了你的账号：请马上改密码，并联系开发者。</p>'); } catch (x) {}
			return { st: 200, ok: true, codes, did: nd };
		},
		// 关闭：要输验证器上的码或恢复码
		totpOff(uid, code) { return this.lock(() => this._totpOff(uid, code)); },
		async _totpOff(uid, code) {
			const u = await this.ctx.storage.get('u:' + uid);
			if (!u) return { st: 401, error: '请先登录' };
			if (!u.totp) return { st: 200, ok: true };
			const r = await this.totpTry(u, code);
			if (!r.ok) return { st: r.locked ? 429 : 400, error: r.locked ? '错太多次了，15 分钟后再试' : '验证码不对' };
			delete u.totp;
			await this.ctx.storage.put('u:' + uid, u);
			await this.loginLog({ k: 'user', who: u.email, ok: true, why: '关闭了两步验证' });
			try { await this.mail(u.email, '你的账号关闭了两步验证', '<p>你好，</p><p>你的官网账号刚刚关闭了两步验证：以后在新设备上登录，输对密码后只要邮箱验证码（没开邮件服务的只要密码）。</p><p><b>不是你本人关闭的话</b>，请马上改密码，并重新开启两步验证。</p>'); } catch (x) {}
			return { st: 200, ok: true };
		},
		// 重新生成恢复码：旧的全部作废
		totpRc(uid, code) { return this.lock(() => this._totpRc(uid, code)); },
		async _totpRc(uid, code) {
			const u = await this.ctx.storage.get('u:' + uid);
			if (!u) return { st: 401, error: '请先登录' };
			if (!u.totp) return { st: 400, error: '还没开启两步验证' };
			const r = await this.totpTry(u, code);
			if (!r.ok) return { st: r.locked ? 429 : 400, error: r.locked ? '错太多次了，15 分钟后再试' : '验证码不对' };
			const codes = await this.totpNewRc(u);
			await this.ctx.storage.put('u:' + uid, u);
			await this.loginLog({ k: 'user', who: u.email, ok: true, why: '重新生成了两步验证的备用恢复码' });
			return { st: 200, ok: true, codes };
		},
		// 确认本人（看敏感信息、解绑等）：开了两步验证的，输验证器上的码也算（不用等邮件）
		async totpSudoOk(uid, code) {
			if (!/^\s*\d{6}\s*$/.test(String(code || ''))) return false;
			return this.lock(async () => {
				const u = await this.ctx.storage.get('u:' + uid);
				if (!u || !u.totp) return false;
				const s = await totpMatch(u.totp.s, code, Date.now(), u.totp.last ?? -1);
				if (s < 0) return false;
				u.totp.last = s; await this.ctx.storage.put('u:' + uid, u);
				return true;
			});
		},
		// 管理员：本人验证器和恢复码都丢了，确认是本人以后帮他关掉（写原因、记日志、发邮件）
		totpAdminOff(uid, why) { return this.lock(() => this._totpAdminOff(uid, why)); },
		async _totpAdminOff(uid, why) {
			const u = await this.ctx.storage.get('u:' + uid);
			if (!u) return { st: 404, error: '没有这个账号' };
			if (!u.totp) return { st: 400, error: '这个账号没开两步验证' };
			delete u.totp;
			await this.ctx.storage.put('u:' + uid, u);
			await this.alog('totp-off', u.email, '关闭两步验证：' + why);
			try { await this.mail(u.email, '你的账号的两步验证被开发者关掉了', `<p>你好，</p><p>开发者应你的要求关掉了你官网账号的两步验证。原因：${esc(why)}</p><p>登录以后建议在「账号设置 → 两步验证」里重新开启。<b>不是你本人要求的话</b>，请马上改密码并联系开发者。</p>`); } catch (x) {}
			return { st: 200, ok: true };
		},
	});
}

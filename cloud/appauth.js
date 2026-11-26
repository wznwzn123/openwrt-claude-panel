// 6.0 第 71 项：安卓 App 登录官网账号只能授权，不能在 App 里输密码（用户 11/26 定）
// App（6.0 起）打开账号页 → 向官网要一个 10 分钟的授权码（编号 + 只有 App 知道的钥匙）
// → 在手机浏览器里打开 /app?ok=编号（已经登录的浏览器，或者用另一台登录着的手机扫 App 上的二维码）→ 看清是哪台设备、在哪，点「允许」
// → App 拿编号 + 钥匙来取，官网发一个新的登录（跟在浏览器里登录一样，出现在「登录着的设备」里，随时能退出）。授权码用一次就删。
const CODE_RE = /^[a-z2-9]{8}$/, KEY_RE = /^[a-z2-9]{24}$/, TTL = 600e3;
// App 6.0 起（UA 里带 RouterPanelApp/版本）不让输密码
export const appStrict = (ua) => { const m = /RouterPanelApp\/(\d+)\./.exec(ua || ''); return !!m && +m[1] >= 6; };

export function installAppAuth(Hub, { rnd, safeEq }) {
	Object.assign(Hub.prototype, {
		// App：要一个授权码
		async appStart({ ip, dev }) {
			if (!(await this.hit('aas:' + ip, 30, 3600e3))) return { st: 429, error: '试得太频繁了：一小时后再试' };
			const code = rnd(8), key = rnd(24), now = Date.now();
			await this.ctx.storage.put('aa:' + code, { key, at: now, exp: now + TTL, st: 'wait', ua: String((dev && dev.ua) || '').slice(0, 60), place: String((dev && dev.place) || '').slice(0, 60), ip: String(ip || '').slice(0, 64) });
			return { st: 200, code, key, exp: now + TTL };
		},
		async appGet(code) {
			if (!CODE_RE.test(code || '')) return null;
			const m = await this.ctx.storage.get('aa:' + code);
			if (!m) return null;
			if (m.exp < Date.now()) { await this.ctx.storage.delete('aa:' + code); return null; }
			return m;
		},
		// 浏览器（已登录）：看要授权的是哪台设备
		async appInfo(uid, code) {
			const m = await this.appGet(code);
			if (!m) return { st: 404, error: '授权码过期了：在 App 里重新点一次「用官网登录」' };
			if (m.st !== 'wait') return { st: 409, error: '这个授权码已经用过了' };
			return { st: 200, ua: m.ua, place: m.place, at: m.at };
		},
		// 浏览器（已登录）：允许 / 拒绝
		appOk(uid, code, ok, email) { return this.lock(() => this._appOk(uid, code, ok, email)); },
		async _appOk(uid, code, ok, email) {
			const m = await this.appGet(code);
			if (!m) return { st: 404, error: '授权码过期了：在 App 里重新点一次「用官网登录」' };
			if (m.st !== 'wait') return { st: 409, error: '这个授权码已经用过了' };
			m.st = ok ? 'ok' : 'no'; m.uid = uid;
			await this.ctx.storage.put('aa:' + code, m);
			await this.loginLog({ k: 'app', who: email, ok: !!ok, why: ok ? '允许 App 登录' : '拒绝 App 登录', ip: m.ip, place: m.place, ua: m.ua });
			return { st: 200, ok: true };
		},
		// App：来取（编号 + 钥匙）。还没处理：wait；拒绝了：denied；允许了：发一个登录（Cookie）
		appPoll(a) { return this.lock(() => this._appPoll(a)); },
		async _appPoll({ code, key, dev }) {
			const m = await this.appGet(code);
			if (!m) return { st: 404, error: '授权码过期了：重新点一次「用官网登录」', expired: true };
			if (!KEY_RE.test(key || '') || !safeEq(key, m.key)) return { st: 403, error: '授权码不对' };
			if (m.st === 'wait') return { st: 200, wait: true };
			await this.ctx.storage.delete('aa:' + code);
			if (m.st !== 'ok') return { st: 200, denied: true };
			const u = await this.ctx.storage.get('u:' + m.uid);
			if (!u) return { st: 404, error: '账号不在了' };
			return { st: 200, sid: await this.newSession(u, dev) };
		},
	});
}

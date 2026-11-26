// 6.0 第 36 项：在外面打开路由器上其他端口的页面（OpenClash 控制面板、AdGuard Home、网页终端……）
// 用户 11/26 定：每台路由器多一个地址「子域名-x」（跟面板不同源，那些页面里的脚本读不到面板的登录信息），同一时间只指向一个页面，打开哪个就切过去；
// 只有用的时候才建这条域名记录（不用的路由器不占名额）。托管版自动；自建版写教程。
// 进这个地址先过 Worker：没有路由器签的通行证（HMAC，绑定子域名、端口、到期时间）一律挡掉；通行证只放在这个地址自己的 Cookie 里。
const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
export const X_SUFFIX = '-x';
const PORT_OK = (p) => Number.isInteger(p) && p >= 1 && p <= 65535 && ![18765, 22, 53, 67].includes(p);

export function installXpage(Hub, { cf, host }) {
	Object.assign(Hub.prototype, {
		// 路由器（凭 RKEY）：把「子域名-x」指到本机某个端口（port=0 关掉）
		devXTarget(a) { return this.lock(() => this._devXTarget(a)); },
		async _devXTarget({ sub, rkey, port, https }) {
			if (!(await this.devOk(sub, rkey))) return { st: 403, error: '钥匙不对' };
			port = +port || 0;
			if (port && !PORT_OK(port)) return { st: 400, error: '这个端口不能开' };
			const d = await this.ctx.storage.get('d:' + sub);
			if (!d || d.state !== 'ok') return { st: 404, error: '没有这台路由器' };
			if (d.off) return { st: 403, error: '这台路由器的托管服务停用了' };
			if (d.local || !d.tunnel) return { st: 409, error: '本地版没有隧道：在家里局域网直接打开' };
			if (port && !(await this.hit('xh:' + sub, 60, 3600e3))) return { st: 429, error: '切换得太频繁了：一小时后再试' };
			const env = this.env, acc = env.CF_ACCOUNT_ID, xh = host(env, sub + X_SUFFIX);
			if (port && !d.xdns) {
				try { d.xdns = (await cf(env, 'POST', `/zones/${env.CF_ZONE_ID}/dns_records`, { type: 'CNAME', name: xh, content: d.tunnel + '.cfargotunnel.com', proxied: true, comment: 'cmcp x ' + sub })).id; }
				catch (e) { return { st: 502, error: (e.codes || []).includes(81045) || /quota|limit|exceed/i.test(e.message || '') ? '官网的网址名额满了，暂时开不了' : '官网这边开不了：' + e.message }; }
				await this.ctx.storage.put('d:' + sub, d);
			}
			const svc = port ? (https ? 'https://127.0.0.1:' : 'http://127.0.0.1:') + port : 'http_status:404';
			const ing = [{ hostname: host(env, sub), service: 'http://127.0.0.1:18765' }];
			if (d.xdns) ing.push({ hostname: xh, service: svc, ...(https ? { originRequest: { noTLSVerify: true } } : {}) });
			ing.push({ service: 'http_status:404' });
			try { await cf(env, 'PUT', `/accounts/${acc}/cfd_tunnel/${d.tunnel}/configurations`, { config: { ingress: ing } }); }
			catch (e) { return { st: 502, error: '官网这边切换不了：' + e.message }; }
			d.xport = port; d.xat = Date.now();
			await this.ctx.storage.put('d:' + sub, d);
			await this.watch(sub).setX(port);
			return { st: 200, ok: true, host: xh, port };
		},
	});
}
// 路由器那边的接口
export async function xDev(p, H, b) {
	if (p !== '/api/dev/xtarget') return null;
	const s = (v) => String(v == null ? '' : v);
	const r = await H.devXTarget({ sub: s(b.sub), rkey: s(b.rkey), port: +b.port || 0, https: b.https === true });
	const { st, ...rest } = r;
	return J(rest, st);
}

/* ---------- 「子域名-x」上的看门：Worker 先检查通行证再放行到隧道 ----------
 * 通行证 = 端口.到期时间（秒）.签名；签名 = HMAC-SHA256(路由器钥匙 RKEY, 子域名|端口|到期时间)，由路由器签。
 * 用 RKEY 不用 PKEY：PKEY 会发给登录面板的手机（包括家人），家人就能自己签通行证打开终端；RKEY 只在路由器和这里。
 * 第一次打开：/__cmcpx?p=端口&e=到期&s=签名 → 验过就写进这个地址的 Cookie（HttpOnly、Secure），跳到 /；
 * 以后每个请求（包括 WebSocket）都验 Cookie，并且端口要跟现在指向的一样（切到别的页面后，旧通行证就失效）。 */
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export async function xSign(key, sub, port, exp) {
	const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return hex(await crypto.subtle.sign('HMAC', k, enc.encode(sub + '|' + port + '|' + exp)));
}
const safeEq = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const CK = 'cmcpx';
const page = (t, st) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>打不开</title><body style="font:16px/1.7 system-ui,sans-serif;max-width:420px;margin:18vh auto;padding:0 20px;color:#1c1c1e"><b style="font-size:20px">${t}</b><p style="color:#6e6e73">回到面板，在「远程页面」里重新点一次。</p></body>`, { status: st, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
// cfg：这台路由器在 Watch 里的设置（rkey、x 现在指向的端口）
export async function xGate(req, sub, cfg) {
	const u = new URL(req.url), now = Math.floor(Date.now() / 1000);
	const check = async (port, exp, sig) => /^\d{1,5}$/.test(port) && /^\d{10}$/.test(exp) && +exp > now && +exp - now <= 12 * 3600 && /^[0-9a-f]{64}$/.test(sig || '') && +port === +(cfg.x || 0) && safeEq(sig, await xSign(cfg.rkey || '', sub, +port, +exp));
	if (!cfg || !cfg.rkey || cfg.off) return page('这个地址没开', 404);
	if (u.pathname === '/__cmcpx') {
		const p = u.searchParams.get('p') || '', e = u.searchParams.get('e') || '', s = u.searchParams.get('s') || '';
		if (!(await check(p, e, s))) return page('链接过期了', 403);
		return new Response(null, { status: 302, headers: { location: u.searchParams.get('to') && /^\/[^/\\]/.test(u.searchParams.get('to')) ? u.searchParams.get('to') : '/', 'set-cookie': `${CK}=${p}.${e}.${s}; Path=/; Max-Age=${+e - now}; HttpOnly; Secure; SameSite=Lax`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
	}
	const ck = (req.headers.get('cookie') || '').split(/;\s*/).find((x) => x.startsWith(CK + '='));
	const [p, e, s] = ck ? ck.slice(CK.length + 1).split('.') : [];
	if (!(await check(p || '', e || '', s))) return page(ck ? '链接过期了，或者已经切到别的页面' : '要从面板打开', 403);
	// 放行到隧道（路由器上的那个页面）；把自己的 Cookie 拿掉，不给后面的页面看到
	const h = new Headers(req.headers);
	const rest = (req.headers.get('cookie') || '').split(/;\s*/).filter((x) => x && !x.startsWith(CK + '=')).join('; ');
	if (rest) h.set('cookie', rest); else h.delete('cookie');
	return fetch(new Request(req, { headers: h }));
}

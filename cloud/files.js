// 5.2 发文件：公告、问题反馈、实时对话里可以发图片、视频和文件（每个最大 200MB）。
// 文件存在 Cloudflare R2（Worker 绑定名 F）；没开 R2 时这些功能自动隐藏，其他照常。
// · 用户发的（对话、反馈）30 天后自动删；公告里的一直留着（删公告时一起删）
// · 上传：浏览器直接分块传给托管服务（每块 8MB），不经过路由器；传之前先凭路由器钥匙或管理员身份领一张上传票（1 小时有效）
// · 下载：链接带签名和到期时间；不是图片、视频、音频、PDF 的一律当附件下载，防止被当成网页打开
// · 防滥用：每台路由器每天最多 30 个、1GB（自建版的匿名对话身份 10 个、300MB）；同一个 IP 每天最多 60 个、2GB；
//   全部文件加起来超过 8GB 就先不收新的（R2 免费额度 10GB）
// · 安全加固（第二轮）：领了票却不传的，1 小时后就作废、额度退回（以前要等 1 天）；IPv6 按 /64 网段算同一个网络；
//   匿名身份（自建版）合起来：正在传的最多 1GB、每天最多 3GB，而且最后 2GB 只留给托管用户和管理员——匿名的再多也占不满
const DAY = 86400e3;
export const FILE_MAX = 200 * 1024 * 1024, FILE_PART = 8 * 1024 * 1024, FILE_KEEP_DAYS = 30;
const DAY_N = 30, DAY_BYTES = 1024 * 1024 * 1024, TOTAL_BYTES = 8 * 1024 * 1024 * 1024, PER_MSG = 5;
const ANON_N = 10, ANON_BYTES = 300 * 1024 * 1024, IP_N = 60, IP_BYTES = 2 * 1024 * 1024 * 1024;
const PEND_MS = 3600e3 + 300e3, ANON_PEND = 1024 * 1024 * 1024, ANON_DAY = 3 * 1024 * 1024 * 1024, KEEP_FREE = 2 * 1024 * 1024 * 1024;
const ID_RE = /^[a-z2-9]{16}$/, TOK_RE = /^[a-z2-9]{32}$/;
// 同一个网络：IPv4 按地址；IPv6 按前 64 位（一户人家一般拿到一整个 /64，里面的地址随便换）
export function ipGroup(ip) {
	ip = String(ip || '').trim().toLowerCase();
	if (!ip.includes(':')) return ip;
	const [a, b = ''] = ip.split('::'), h = a ? a.split(':') : [], t = b ? b.split(':') : [];
	const full = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
	return full.slice(0, 4).map((x) => (parseInt(x, 16) || 0).toString(16)).join(':') + '::/64';
}
const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h } });
const rnd = (n) => { const a = 'abcdefghijkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(n)); let s = ''; for (const x of b) s += a[x % a.length]; return s; };
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// 能在浏览器里直接打开的类型；其他一律当附件下载（application/octet-stream）
const INLINE = /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|ogg|wav|webm|aac))$/;
// PDF 记下类型（下载时文件名、图标对），但一律当附件下载：不在主域名下直接打开别人传的 PDF（防止被拿来做假页面）
const KEEP = /^application\/pdf$/;
export const safeType = (t) => { t = String(t || '').toLowerCase().split(';')[0].trim(); return INLINE.test(t) || KEEP.test(t) ? t : 'application/octet-stream'; };
// 文件名：去掉路径、控制字符和会出问题的字符，最长 100 个字
export const cleanFileName = (n) => { let s = String(n || '').replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim(); if (!s || s === '.' || s === '..') s = '文件'; return [...s].slice(-100).join(''); };
const kind = (t) => (/^image\//.test(t) ? 'img' : /^video\//.test(t) ? 'video' : /^audio\//.test(t) ? 'audio' : 'file');

export function installFiles(Hub) {
	Object.assign(Hub.prototype, {
		async fileKey() { let k = await this.ctx.storage.get('m:fkey'); if (!k) { k = rnd(48); await this.ctx.storage.put('m:fkey', k); } return k; },
		// 领上传票：检查大小、类型、每天的量、总量
		fileStart(o) { return this.lock(() => this._fileStart(o)); },
		async _fileStart({ owner, ctx, name, size, type, ip }) {
			size = Math.floor(+size || 0);
			if (!(size > 0)) return { st: 400, error: '文件是空的' };
			if (size > FILE_MAX) return { st: 400, error: '文件太大了：最大 200MB' };
			if (!['chat', 'fb', 'ann'].includes(ctx)) return { st: 400, error: '不支持' };
			const now = Date.now(), day = new Date(now + 8 * 3600e3).toISOString().slice(0, 10);
			const pend = await this._filePend(now), anon = owner[0] === 'a';
			const tot = (await this.ctx.storage.get('m:fbytes')) || 0;
			if (tot + size > TOTAL_BYTES - (anon ? KEEP_FREE : 0)) return { st: 507, error: '文件存储快满了，暂时发不了文件，先发文字吧' };
			let ak = '', aq = null;
			if (anon) {
				const ap = pend.filter((x) => x.anon).reduce((n, x) => n + x.size, 0);
				ak = 'fq:anon:' + day; aq = (await this.ctx.storage.get(ak)) || { n: 0, b: 0 };
				if (ap + size > ANON_PEND || aq.b + size > ANON_DAY) return { st: 429, error: '现在发文件的人太多了，过一会儿再发' };
			}
			if (owner !== 'admin') {
				const mn = anon ? ANON_N : DAY_N, mb = anon ? ANON_BYTES : DAY_BYTES;
				// 每台路由器的额度：家人各自的对话（d路由器.账号）也算在这台路由器头上
				const qk = 'fq:' + (owner[0] === 'd' ? owner.split('.')[0] : owner) + ':' + day, q = (await this.ctx.storage.get(qk)) || { n: 0, b: 0 };
				if (q.n + 1 > mn || q.b + size > mb) return { st: 429, error: `今天发的文件太多了（每天最多 ${mn} 个、${anon ? '300MB' : '1GB'}），明天再发` };
				const ig = ipGroup(ip), ik = ig ? 'fq:ip:' + ig + ':' + day : '', iq = (ik && (await this.ctx.storage.get(ik))) || { n: 0, b: 0 };
				if (ik && (iq.n + 1 > IP_N || iq.b + size > IP_BYTES)) return { st: 429, error: '今天这个网络发的文件太多了，明天再发' };
				q.n++; q.b += size; await this.ctx.storage.put(qk, q);
				if (ik) { iq.n++; iq.b += size; await this.ctx.storage.put(ik, iq); }
				if (anon) { aq.n++; aq.b += size; await this.ctx.storage.put(ak, aq); }
			}
			let id; do { id = rnd(16); } while (await this.ctx.storage.get('fl:' + id));
			const nm = cleanFileName(name), t = safeType(type), tok = rnd(32);
			const f = { id, key: (ctx === 'ann' ? 'a/' : 'u/') + id, name: nm, size, type: t, owner, ctx, at: now, exp: ctx === 'ann' ? 0 : now + FILE_KEEP_DAYS * DAY, state: 'up', up: '', parts: [] };
			await this.ctx.storage.put({ ['fl:' + id]: f, ['ut:' + tok]: { id, exp: now + 3600e3 }, 'm:fbytes': tot + size, 'm:fup': [...pend, { id, size, at: now, anon }].slice(-5000) });
			return { st: 200, ok: true, id, key: f.key, tok, type: t };
		},
		// 正在传的（领了票、还没传完）：票 1 小时有效，过了还没传完的作废、额度退回
		async _filePend(now) {
			let p = (await this.ctx.storage.get('m:fup')) || [];
			const stale = p.filter((x) => x.at < now - PEND_MS).map((x) => x.id);
			if (stale.length) {
				p = p.filter((x) => !stale.includes(x.id)); await this.ctx.storage.put('m:fup', p);
				const dead = [];
				for (const id of stale) { const f = await this.ctx.storage.get('fl:' + id); if (f && f.state === 'up') dead.push(id); }
				if (dead.length) await this.fileGone(dead);
				p = (await this.ctx.storage.get('m:fup')) || [];
			}
			return p;
		},
		async _fileUnpend(ids) { const p = (await this.ctx.storage.get('m:fup')) || [], q = p.filter((x) => !ids.includes(x.id)); if (q.length !== p.length) await this.ctx.storage.put('m:fup', q); },
		async fileSetUpload(id, up) { const f = await this.ctx.storage.get('fl:' + id); if (f) { f.up = up; await this.ctx.storage.put('fl:' + id, f); } },
		async fileByTok(tok) { if (!TOK_RE.test(String(tok || ''))) return null; const t = await this.ctx.storage.get('ut:' + tok); if (!t || t.exp < Date.now()) return null; const f = await this.ctx.storage.get('fl:' + t.id); return f && f.state === 'up' ? f : null; },
		filePart(id, n, etag) { return this.lock(async () => { const f = await this.ctx.storage.get('fl:' + id); if (!f || f.state !== 'up') return false; f.parts = [...f.parts.filter((p) => p.partNumber !== n), { partNumber: n, etag }]; await this.ctx.storage.put('fl:' + id, f); return true; }); },
		async fileDone(id, tok, ok) {
			const f = await this.ctx.storage.get('fl:' + id); if (!f) return null;
			if (ok) { f.state = 'ok'; delete f.up; delete f.parts; await this.ctx.storage.put('fl:' + id, f); await this._fileUnpend([id]); }
			else await this.fileGone([id]);
			if (tok) await this.ctx.storage.delete('ut:' + tok);
			return f;
		},
		async fileMeta(id) { return ID_RE.test(String(id || '')) ? (await this.ctx.storage.get('fl:' + id)) || null : null; },
		// 发消息时带上的文件：要是自己传好的、同一类（对话 / 反馈 / 公告），最多 5 个
		async fileClaim(ids, owner, ctx) {
			const out = [];
			for (const id of (Array.isArray(ids) ? ids : []).slice(0, PER_MSG)) {
				const f = await this.fileMeta(String(id));
				if (!f || f.state !== 'ok' || f.ctx !== ctx || (f.owner !== owner && owner !== 'admin')) return { error: '有文件没传完或者用不了，重新选一下' };
				if (!out.some((x) => x.id === f.id)) out.push({ id: f.id, name: f.name, size: f.size, type: f.type });
			}
			return { files: out };
		},
		// 删掉的文件：记下来，R2 那边由 Worker 删
		async fileGone(ids) {
			let tot = (await this.ctx.storage.get('m:fbytes')) || 0;
			const keys = [];
			for (const id of ids) { const f = await this.ctx.storage.get('fl:' + id); if (!f) continue; keys.push({ key: f.key, up: f.state === 'up' ? f.up : '' }); tot -= f.size; await this.ctx.storage.delete('fl:' + id); }
			await this.ctx.storage.put('m:fbytes', Math.max(0, tot));
			await this._fileUnpend(ids);
			if (keys.length) { const q = (await this.ctx.storage.get('fdel')) || []; await this.ctx.storage.put('fdel', [...q, ...keys].slice(-2000)); }
			return keys.length;
		},
		// 每天清理：到期的用户文件、传了一半放弃的（1 天前领的票还没传完）；返回要在 R2 里删的
		async fileSweep() {
			const now = Date.now(), gone = [];
			for (const [k, f] of await this.ctx.storage.list({ prefix: 'fl:' })) if ((f.exp && f.exp < now) || (f.state === 'up' && f.at < now - DAY)) gone.push(k.slice(3));
			for (const [k, t] of await this.ctx.storage.list({ prefix: 'ut:' })) if (t.exp < now) await this.ctx.storage.delete(k);
			for (const [k] of await this.ctx.storage.list({ prefix: 'fq:' })) { const d = k.split(':').pop(); if (Date.parse(d) < now - 3 * DAY) await this.ctx.storage.delete(k); }
			if (gone.length) await this.fileGone(gone);
			const q = (await this.ctx.storage.get('fdel')) || [];
			await this.ctx.storage.delete('fdel');
			return q;
		},
		async fileStats() { let n = 0, b = 0; for (const [, f] of await this.ctx.storage.list({ prefix: 'fl:' })) if (f.state === 'ok') { n++; b += f.size; } return { n, bytes: b, cap: TOTAL_BYTES }; },
	});
}

/* ---------- 签名下载链接（Worker 里算，钥匙存在托管服务里） ---------- */
async function hmac(key, s) { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return b64u(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(s))).slice(0, 32); }
// 给一批文件（{id,name,size,type}）加上带签名的下载地址；ttl 毫秒，按天取整（同一天里地址不变，浏览器能缓存）
export async function signFiles(env, H, files, ttl = 7 * DAY) {
	if (!files || !files.length) return files || [];
	const key = await H.fileKey(), exp = Math.ceil((Date.now() + ttl) / DAY) * DAY;
	return Promise.all(files.map(async (f) => ({ ...f, k: kind(f.type), url: 'https://' + env.BASE_DOMAIN + '/api/f/' + f.id + '/' + encodeURIComponent(f.name) + '?e=' + exp + '&s=' + (await hmac(key, f.id + '.' + exp)) })));
}

// 上传可以从任何面板网址发起（托管版的子域名、自建版自己的域名）：凭的是 1 小时有效、只能传一个文件的上传票，不带 Cookie，所以放开来源
function cors() { return { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'PUT, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' }; }

// 领上传票（对话、反馈：凭路由器钥匙，在 /api/chat 里调；公告和管理员回复：管理后台）
export async function fileStartFor(env, H, owner, ctx, b, ip = '') {
	if (!env.F) return { st: 503, error: '托管服务还没开文件存储，现在只能发文字和截图' };
	const r = await H.fileStart({ owner, ctx, name: String(b.name || ''), size: b.size, type: String(b.type || ''), ip: String(ip || '').slice(0, 45) });
	if (r.st !== 200) return r;
	try {
		const mp = await env.F.createMultipartUpload(r.key, { httpMetadata: { contentType: r.type } });
		await H.fileSetUpload(r.id, mp.uploadId);
	} catch (e) { await H.fileGone([r.id]); return { st: 502, error: '文件存储暂时用不了，稍后再试' }; }
	const n = Math.ceil(Math.floor(+b.size) / FILE_PART);
	return { st: 200, ok: true, id: r.id, url: 'https://' + env.BASE_DOMAIN + '/api/up/' + r.tok, part: FILE_PART, n };
}

// /api/up/<票>/<第几块>（PUT）、/api/up/<票>/done（POST）、/api/f/<文件>/<名字>?e=&s=（GET）
export async function filesRoute(req, env, H, p) {
	if (!p.startsWith('/api/up/') && !p.startsWith('/api/f/')) return null;
	const h = cors();
	if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
	if (!env.F) return J({ error: '托管服务还没开文件存储' }, 503, h);
	const a = p.split('/').slice(3);
	if (p.startsWith('/api/up/')) {
		const tok = a[0], f = await H.fileByTok(tok);
		if (!f) return J({ error: '上传票过期了，重新选一下文件' }, 403, h);
		const n = Math.ceil(f.size / FILE_PART);
		if (a[1] === 'done' && req.method === 'POST') {
			const parts = [...(f.parts || [])].sort((x, y) => x.partNumber - y.partNumber);
			if (parts.length !== n) return J({ error: '还有没传完的部分，重新传一下' }, 400, h);
			try {
				await env.F.resumeMultipartUpload(f.key, f.up).complete(parts);
				const o = await env.F.head(f.key);
				if (!o || o.size !== f.size) { await env.F.delete(f.key); await H.fileDone(f.id, tok, false); return J({ error: '文件大小对不上，重新传一下' }, 400, h); }
			} catch (e) { return J({ error: '文件没存好，重新传一下' }, 502, h); }
			await H.fileDone(f.id, tok, true);
			return J({ ok: true, id: f.id, name: f.name, size: f.size, type: f.type }, 200, h);
		}
		const k = Math.floor(+a[1] || 0);
		if (req.method !== 'PUT' || !(k >= 1 && k <= n) || !req.body) return J({ error: 'not found' }, 404, h);
		const want = k < n ? FILE_PART : f.size - FILE_PART * (n - 1), len = +(req.headers.get('content-length') || -1);
		if (len !== want) return J({ error: '这一块的大小不对' }, 400, h);
		try {
			const up = await env.F.resumeMultipartUpload(f.key, f.up).uploadPart(k, req.body);
			if (!(await H.filePart(f.id, k, up.etag))) return J({ error: '上传票过期了，重新选一下文件' }, 403, h);
		} catch (e) { return J({ error: '这一块没传上，再试一次' }, 502, h); }
		return J({ ok: true }, 200, h);
	}
	// 下载
	if (req.method !== 'GET' && req.method !== 'HEAD') return J({ error: 'not found' }, 404);
	const u = new URL(req.url), id = a[0], e = +(u.searchParams.get('e') || 0), s = u.searchParams.get('s') || '';
	if (!ID_RE.test(id || '') || !(e > Date.now()) || s.length !== 32) return J({ error: '链接过期了：回到对话或公告里重新点一下' }, 403);
	const key = await H.fileKey(), want = await hmac(key, id + '.' + e);
	let diff = 0; for (let i = 0; i < 32; i++) diff |= want.charCodeAt(i) ^ s.charCodeAt(i);
	if (diff) return J({ error: '链接不对' }, 403);
	const f = await H.fileMeta(id);
	if (!f || f.state !== 'ok') return J({ error: '文件已经过期删除了（用户发的文件只留 30 天）' }, 404);
	const o = await env.F.get(f.key, { range: req.headers });
	if (!o) return J({ error: '文件已经删除了' }, 404);
	const inline = INLINE.test(f.type) && u.searchParams.get('dl') !== '1';
	const hd = new Headers({
		'content-type': f.type,
		'content-disposition': (inline ? 'inline' : 'attachment') + "; filename*=UTF-8''" + encodeURIComponent(f.name),
		'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
		'cache-control': 'private, max-age=86400', 'accept-ranges': 'bytes', etag: o.httpEtag,
		'cross-origin-resource-policy': 'cross-origin',
	});
	let st = 200;
	if (o.range && o.range.offset != null) { const off = o.range.offset, len = o.range.length ?? f.size - off; hd.set('content-range', 'bytes ' + off + '-' + (off + len - 1) + '/' + f.size); hd.set('content-length', String(len)); st = 206; }
	else hd.set('content-length', String(f.size));
	return new Response(req.method === 'HEAD' ? null : o.body, { status: st, headers: hd });
}

// 每天：清掉到期的文件（R2 那边也删）
export async function filesScheduled(env, H) {
	const del = await H.fileSweep();
	if (!env.F || !del.length) return;
	for (const x of del) { try { if (x.up) await env.F.resumeMultipartUpload(x.key, x.up).abort(); else await env.F.delete(x.key); } catch (e) {} }
}

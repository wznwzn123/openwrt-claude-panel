// 测试用：把 worker.js / hub.js 复制到临时目录，换掉 Cloudflare 专用的 import，再加载
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
const SHIM = 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }';
export async function load() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcp-w-'));
	for (const f of ['worker.js', 'hub.js', 'ops.js', 'v5.js', 'fam.js', 'inst.js', 'totp.js', 'compat.js', 'oldver.js', 'files.js', 'changelog.js', 'help.js', 'faq-default.js', 'edition.js', 'xpage.js', 'move.js', 'appauth.js', 'apps-data.js', 'site.js']) {
		let src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
		// site.js 只有页面和文件内容（里面官网组件的 import 是给浏览器的，不能改）
		if (f !== 'site.js') src = src.replace("import { DurableObject } from 'cloudflare:workers';", SHIM).replace(/from '\.\/([\w-]+)\.js'/g, "from './$1.mjs'");
		// 真的 Cloudflare 上，调用 Durable Object 的方法是远程调用：传 Request / Response / 流过去，请求内容会被搬走（调用方再读就是空的）。
		// 测试里也拦住这种写法，免得本地测试通过、上线后出问题（5.0.0 的两步验证、发公告就是这样坏的）
		if (f === 'hub.js') {
			const guard = 'const rpcGuard = (o) => new Proxy(o, { get(t, k) { const v = t[k]; if (typeof v !== "function") return v; return (...a) => { for (const x of a) if (x instanceof Request || x instanceof Response || (typeof ReadableStream !== "undefined" && x instanceof ReadableStream)) throw new Error("不能把 Request/Response/流 传给 Durable Object 的方法：" + String(k)); return v.apply(t, a); }; } });\n';
			const before = src;
			src = src.replace("const hubObj = (env) => env.H.get(env.H.idFromName('hub'));", guard + "const hubObj = (env) => rpcGuard(env.H.get(env.H.idFromName('hub')));");
			if (src === before) throw new Error('load.mjs：hub.js 里找不到 hubObj，测试的远程调用检查没装上');
		}
		fs.writeFileSync(path.join(dir, f.replace('.js', '.mjs')), src);
	}
	return import(pathToFileURL(path.join(dir, 'worker.mjs')).href);
}
// 内存版 Durable Object 存储
export function memStorage() {
	const mem = new Map(); let alarm = null;
	const cl = (v) => (v === undefined ? undefined : structuredClone(v));
	return {
		mem, get alarmAt() { return alarm; },
		async get(k) { if (Array.isArray(k)) return new Map(k.filter((x) => mem.has(x)).map((x) => [x, cl(mem.get(x))])); return cl(mem.get(k)); },
		async put(k, v) { if (typeof k === 'object') { for (const [a, b] of Object.entries(k)) mem.set(a, cl(b)); } else mem.set(k, cl(v)); },
		async delete(k) { if (Array.isArray(k)) { let n = 0; for (const x of k) n += mem.delete(x) ? 1 : 0; return n; } return mem.delete(k); },
		async list({ prefix = '', start, end, reverse, limit } = {}) { let l = [...mem.entries()].filter(([k]) => k.startsWith(prefix) && (start == null || k >= start) && (end == null || k < end)).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)); if (reverse) l.reverse(); if (limit) l = l.slice(0, limit); return new Map(l.map(([k, v]) => [k, cl(v)])); },
		async deleteAll() { mem.clear(); },
		async getAlarm() { return alarm; }, async setAlarm(t) { alarm = t; }, async deleteAlarm() { alarm = null; },
	};
}
// 内存版 R2（5.2 发文件用）：分块上传、按范围读、删除
export function memR2() {
	const objs = new Map(), ups = new Map(); let n = 0;
	const toU8 = async (b) => (b instanceof Uint8Array ? b : typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(await new Response(b).arrayBuffer()));
	const obj = (key, o, range) => ({ key, size: o.data.length, httpEtag: '"' + o.etag + '"', httpMetadata: o.meta, range, body: new Response(range ? o.data.slice(range.offset, range.offset + range.length) : o.data).body });
	return {
		objs, ups,
		async put(key, b, opt = {}) { const data = await toU8(b); objs.set(key, { data, etag: 'e' + ++n, meta: opt.httpMetadata || {} }); return { key }; },
		async head(key) { const o = objs.get(key); return o ? { key, size: o.data.length, httpEtag: '"' + o.etag + '"' } : null; },
		async get(key, opt = {}) {
			const o = objs.get(key); if (!o) return null;
			const h = opt.range && typeof opt.range.get === 'function' ? opt.range.get('range') : null;
			const m = h && /^bytes=(\d*)-(\d*)$/.exec(h);
			if (m) { const size = o.data.length, s = m[1] === '' ? size - +m[2] : +m[1], e = m[1] === '' || m[2] === '' ? size - 1 : Math.min(+m[2], size - 1); return obj(key, o, { offset: s, length: e - s + 1 }); }
			return obj(key, o);
		},
		async delete(key) { for (const k of [].concat(key)) objs.delete(k); },
		async createMultipartUpload(key, opt = {}) { const id = 'up' + ++n; ups.set(id, { key, parts: new Map(), meta: opt.httpMetadata || {} }); return { key, uploadId: id }; },
		resumeMultipartUpload(key, id) {
			return {
				async uploadPart(k, b) { const u = ups.get(id); if (!u || u.key !== key) throw new Error('no upload'); const data = await toU8(b); const etag = 'p' + ++n; u.parts.set(k, { data, etag }); return { partNumber: k, etag }; },
				async complete(parts) { const u = ups.get(id); if (!u) throw new Error('no upload'); const bufs = parts.map((p) => { const x = u.parts.get(p.partNumber); if (!x || x.etag !== p.etag) throw new Error('bad part'); return x.data; }); const all = new Uint8Array(bufs.reduce((a, b) => a + b.length, 0)); let o = 0; for (const b of bufs) { all.set(b, o); o += b.length; } objs.set(key, { data: all, etag: 'e' + ++n, meta: u.meta }); ups.delete(id); return { key }; },
				async abort() { ups.delete(id); },
			};
		},
	};
}

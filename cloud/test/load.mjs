// 测试用：把 worker.js / hub.js 复制到临时目录，换掉 Cloudflare 专用的 import，再加载
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
const SHIM = 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }';
export async function load() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcp-w-'));
	for (const f of ['worker.js', 'hub.js', 'ops.js', 'v5.js', 'site.js']) {
		let src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')
			.replace("import { DurableObject } from 'cloudflare:workers';", SHIM)
			.replace(/from '\.\/(\w+)\.js'/g, "from './$1.mjs'");
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

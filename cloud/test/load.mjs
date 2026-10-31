// 测试用：把 worker.js / hub.js 复制到临时目录，换掉 Cloudflare 专用的 import，再加载
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
const SHIM = 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }';
export async function load() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcp-w-'));
	for (const f of ['worker.js', 'hub.js', 'site.js']) {
		const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')
			.replace("import { DurableObject } from 'cloudflare:workers';", SHIM)
			.replace(/from '\.\/(\w+)\.js'/g, "from './$1.mjs'");
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
		async list({ prefix = '' } = {}) { return new Map([...mem.entries()].filter(([k]) => k.startsWith(prefix)).sort().map(([k, v]) => [k, cl(v)])); },
		async deleteAll() { mem.clear(); },
		async getAlarm() { return alarm; }, async setAlarm(t) { alarm = t; }, async deleteAlarm() { alarm = null; },
	};
}

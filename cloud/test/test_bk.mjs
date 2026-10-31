// 云端备份：上传、分块、列表、下载还原一致、删除、只留 10 份、密钥校验、大小限制
import fs from 'fs';
import nc from 'node:crypto';
import { load } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const mem = new Map(); let alarm = null, bigVal = 0;
const storage = {
	async get(k) { if (Array.isArray(k)) return new Map(k.filter((x) => mem.has(x)).map((x) => [x, structuredClone(mem.get(x))])); return structuredClone(mem.get(k)); },
	async put(k, v) { const set = (a, b) => { const c = structuredClone(b); if (c && c.byteLength > 128 * 1024) bigVal++; mem.set(a, c); }; if (typeof k === 'object') { if (Object.keys(k).length > 128) throw new Error('too many keys'); for (const [a, b] of Object.entries(k)) set(a, b); } else set(k, v); },
	async getAlarm() { return alarm; }, async setAlarm(t) { alarm = t; },
	async delete(k) { if (Array.isArray(k)) { if (k.length > 128) throw new Error('too many keys'); let n = 0; for (const x of k) n += mem.delete(x) ? 1 : 0; return n; } return mem.delete(k); },
};
globalThis.fetch = async () => new Response('{}', { status: 200 });
const env = { RKEY: 'rk', TKEY: 'tk', PANEL_TOKEN: 'pt', PROBE_URL: 'https://x/p', VAPID_PUB: '', VAPID_PRIV: '' };
const obj = new mod.Watch({ storage }, env);
env.W = { idFromName: () => 'id', get: () => obj };
const call = (method, path, body) => mod.default.fetch(new Request('https://router.example' + path, { method, body, headers: { 'content-type': 'application/gzip' } }), env);
const bkKeys = () => [...mem.keys()].filter((k) => k.startsWith('bk:'));

const data = nc.randomBytes(1300000);
ok('密钥不对不能上传', (await call('POST', '/cloud/bk/bad?name=x', data)).status === 403);
ok('密钥不对不能看列表', (await call('GET', '/cloud/bk/bad')).status === 403);
ok('太小的不收', (await call('POST', '/cloud/bk/rk?name=x', Buffer.alloc(10))).status === 400);
let r = await (await call('POST', '/cloud/bk/rk?name=Kwrt-20261031-0400&kind=auto&files=187', data)).json();
ok('上传成功，切成 120KB 的块', r.ok && r.size === 1300000 && r.n === 11 && bkKeys().length === 11, JSON.stringify(r));
ok('每块都不超过 128KB', bigVal === 0, bigVal);
const id1 = r.id;
let l = await (await call('GET', '/cloud/bk/rk')).json();
ok('列表有名字、类型、文件数、大小', l.list.length === 1 && l.list[0].name === 'Kwrt-20261031-0400' && l.list[0].kind === 'auto' && l.list[0].files === 187 && l.list[0].size === 1300000 && l.max === 10, JSON.stringify(l));
let g = await call('GET', '/cloud/bk/rk/' + id1);
const got = Buffer.from(await g.arrayBuffer());
ok('下载回来和上传的一模一样', g.status === 200 && got.equals(data) && /gzip/.test(g.headers.get('content-type')));
ok('不存在的备份返回 404', (await call('GET', '/cloud/bk/rk/nope')).status === 404);
// 再传 11 份 → 只留最新 10 份，最早那份连同它的块一起删掉
for (let i = 0; i < 11; i++) { await new Promise((z) => setTimeout(z, 3)); await call('POST', '/cloud/bk/rk?name=b' + i + '&kind=manual', nc.randomBytes(200000 + i)); }
l = await (await call('GET', '/cloud/bk/rk')).json();
ok('最多留 10 份，最新的排最前', l.list.length === 10 && l.list[0].name === 'b10' && !l.list.some((x) => x.id === id1), l.list.map((x) => x.name).join(','));
ok('删掉的那份不留下数据块', bkKeys().length === l.list.reduce((a, x) => a + x.n, 0) && !bkKeys().some((k) => k.startsWith('bk:' + id1 + ':')), bkKeys().length);
const del = l.list[3].id;
ok('删除一份', (await (await call('DELETE', '/cloud/bk/rk/' + del)).json()).ok === true);
l = await (await call('GET', '/cloud/bk/rk')).json();
ok('删除后列表和数据块都没了', l.list.length === 9 && !bkKeys().some((k) => k.startsWith('bk:' + del + ':')));
ok('删除不存在的返回 false', (await (await call('DELETE', '/cloud/bk/rk/nope')).json()).ok === false);
ok('其他接口照常（心跳）', (await (await call('POST', '/cloud/beat/t/tk')).json()).ok === true);

console.log(results.map((x) => (x[1] ? '✓ ' : '✗ ') + x[0] + (x[1] ? '' : '（' + x[2] + '）')).join('\n'));
console.log(`\n通过 ${results.filter((x) => x[1]).length}/${results.length}`);

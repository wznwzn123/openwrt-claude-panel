// 5.2 发文件：对话、反馈、公告里的图片 / 视频 / 文件（R2，最大 200MB；用户文件 30 天后删）
import { load, memStorage, memR2 } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] }));
	if (u.hostname !== 'api.cloudflare.com') return new Response('{}');
	if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 'tun' + Math.random(), token: 'tok' });
	if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'dns' + Math.random() });
	return R({});
};
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const hub = () => env.H.get('hub'), S = () => hub().ctx.storage;
const F = memR2();
const go = (path, init = {}) => mod.default.fetch(new Request(path.startsWith('http') ? path : 'https://panel.example' + path, init), env);
const post = async (path, body, hdr = {}) => { const r = await go(path, { method: 'POST', headers: { 'content-type': 'application/json', ...hdr }, body: JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch (e) {} return { st: r.status, j }; };
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const reg = async (ip) => (await post('/api/register', { invite: INV, name: 'Kwrt', model: 'x86' }, { 'cf-connecting-ip': ip })).j;
const INV = (await post('/api/admin/invites', { direct: true, max: 10 }, ADM)).j.invite.code;
const R1 = await reg('1.1.1.1'), R2 = await reg('1.1.1.2');
const chat = (R, b) => post('/api/chat', { sub: R.sub, rkey: R.rkey, ...b });
const bytes = (n, seed = 7) => { const u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = (i * 31 + seed) & 255; return u; };
// 按领到的上传票分块传：返回最后 done 的结果
async function upload(start, data) {
	let off = 0;
	for (let k = 1; k <= start.n; k++) {
		const chunk = data.slice(off, off + start.part); off += chunk.length;
		const r = await go(start.url.replace('https://panel.example', '') + '/' + k, { method: 'PUT', headers: { 'content-length': String(chunk.length), origin: 'https://abcdefgh.panel.example' }, body: chunk });
		if (r.status !== 200) return { st: r.status, j: await r.json() };
	}
	const r = await go(start.url.replace('https://panel.example', '') + '/done', { method: 'POST' });
	return { st: r.status, j: await r.json(), h: r.headers };
}

// 1. 没开 R2：领不到上传票，提示清楚；ping 里 files=false
let r = await chat(R1, { op: 'up', name: 'a.mp4', size: 100, type: 'video/mp4' });
ok('没开文件存储：领上传票说清楚（现在只能发文字和截图）', r.st === 503 && /还没开文件存储/.test(r.j.error), JSON.stringify(r));
const health = async () => (await go('/api/admin/health', { headers: { authorization: 'Bearer ' + env.ADMIN_KEY } })).json();
ok('没开文件存储：管理员健康检查里 files=false', (await health()).files === false);
ok('公开的 /api/ping 不说开没开文件存储（第 7 项）', !('files' in (await (await go('/api/ping')).json())));
env.F = F;
ok('开了：管理员健康检查里 files=true', (await health()).files === true);

// 2. 对话：传一个 17MB 的视频（3 块），发出去，下载
const vid = bytes(17 * 1024 * 1024);
r = await chat(R1, { op: 'up', name: '../../家里/录屏.mp4', size: vid.length, type: 'video/mp4' });
ok('领上传票：分 3 块，每块 8MB，地址在托管服务上', r.st === 200 && r.j.n === 3 && r.j.part === 8 * 1024 * 1024 && /^https:\/\/panel\.example\/api\/up\/[a-z2-9]{32}$/.test(r.j.url), JSON.stringify(r.j));
const st1 = r.j;
const pre = await go(st1.url.replace('https://panel.example', '') + '/1', { method: 'OPTIONS', headers: { origin: 'https://myrouter.example.org' } });
ok('跨域预检：任何面板网址都能传（凭上传票）', pre.status === 204 && pre.headers.get('access-control-allow-origin') === '*');
const bad = await go(st1.url.replace('https://panel.example', '') + '/1', { method: 'PUT', headers: { 'content-length': '10' }, body: new Uint8Array(10) });
ok('块的大小不对：拒绝', bad.status === 400);
const notAll = await go(st1.url.replace('https://panel.example', '') + '/done', { method: 'POST' });
ok('还没传完就点完成：拒绝', notAll.status === 400);
let up = await upload(st1, vid);
ok('3 块传完：完成，文件名去掉了路径', up.st === 200 && up.j.name === '录屏.mp4' && up.j.size === vid.length && up.j.type === 'video/mp4', JSON.stringify(up.j));
ok('R2 里存好了，大小一样', F.objs.get('u/' + st1.id) && F.objs.get('u/' + st1.id).data.length === vid.length);
ok('上传票用过就作废', (await go(st1.url.replace('https://panel.example', '') + '/done', { method: 'POST' })).status === 403);
r = await chat(R1, { op: 'send', text: '看这个视频', files: [st1.id] });
ok('发消息带上文件：消息里有文件和带签名的下载地址', r.st === 200 && r.j.msg.files.length === 1 && /^https:\/\/panel\.example\/api\/f\/[a-z2-9]{16}\/.+\?e=\d+&s=.{32}$/.test(r.j.msg.files[0].url) && r.j.msg.files[0].k === 'video', JSON.stringify(r.j).slice(0, 300));
const url = r.j.msg.files[0].url;
let d = await go(url);
let got = new Uint8Array(await d.arrayBuffer());
ok('下载：内容一样，视频直接在浏览器里放（inline），不让当网页', d.status === 200 && got.length === vid.length && got[12345] === vid[12345] && /^inline/.test(d.headers.get('content-disposition')) && d.headers.get('x-content-type-options') === 'nosniff' && /sandbox/.test(d.headers.get('content-security-policy')));
d = await go(url, { headers: { range: 'bytes=100-199' } });
got = new Uint8Array(await d.arrayBuffer());
ok('拖进度条（按范围读）：206，只给这一段', d.status === 206 && got.length === 100 && got[0] === vid[100] && d.headers.get('content-range') === 'bytes 100-199/' + vid.length);
ok('签名改了：拒绝', (await go(url.replace(/s=.{4}/, 's=AAAA'))).status === 403);
ok('过期的链接：拒绝', (await go(url.replace(/e=\d+/, 'e=' + (Date.now() - 1000)))).status === 403);
const g = await chat(R1, { op: 'get' });
ok('拉对话：消息里的文件也带下载地址；告诉面板能发文件', g.j.files === true && g.j.msgs.some((m) => m.files && m.files[0].url), JSON.stringify(g.j).slice(0, 200));
const ad = await go('/api/admin/chat/d' + R1.sub, { headers: ADM });
ok('管理后台看对话：也有下载地址', (await ad.json()).msgs.some((m) => m.files && m.files[0].url));

// 3. 防乱用：大小、别人的文件、危险类型、每天的量
r = await chat(R1, { op: 'up', name: 'big.zip', size: 200 * 1024 * 1024 + 1, type: 'application/zip' });
ok('超过 200MB：拒绝', r.st === 400 && /200MB/.test(r.j.error));
r = await chat(R2, { op: 'send', text: '偷用', files: [st1.id] });
ok('别的路由器拿这个文件编号来发：拒绝', r.st === 400);
r = await chat(R1, { op: 'up', name: 'x.html', size: 20, type: 'text/html' });
up = await upload(r.j, new TextEncoder().encode('<script>alert(1)</script>'.slice(0, 20)));
const hid = r.j.id;
await chat(R1, { op: 'send', text: '', files: [hid] });
const g2 = await chat(R1, { op: 'get' });
const hu = g2.j.msgs.flatMap((m) => m.files || []).find((f) => f.id === hid).url;
d = await go(hu);
ok('网页文件（html）：一律当附件下载，不在浏览器里打开', d.headers.get('content-type') === 'application/octet-stream' && /^attachment/.test(d.headers.get('content-disposition')));
ok('只发文件不写字也行', g2.j.msgs.some((m) => !m.x && m.files));
for (let i = 0; i < 30; i++) await chat(R2, { op: 'up', name: 'n' + i + '.txt', size: 10, type: 'text/plain' });
r = await chat(R2, { op: 'up', name: 'n31.txt', size: 10, type: 'text/plain' });
ok('一台路由器一天最多 30 个文件', r.st === 429 && /每天最多 30 个/.test(r.j.error));
ok('没有钥匙领不到上传票', (await post('/api/chat', { op: 'up', sub: R1.sub, rkey: 'x'.repeat(32), name: 'a', size: 1 })).st === 403);

// 4. 反馈带文件
r = await chat(R1, { op: 'up', ctx: 'fb', name: 'log.txt', size: 1000, type: 'text/plain' });
up = await upload(r.j, bytes(1000));
const fbf = r.j.id;
r = await post('/api/dev/feedback', { sub: R1.sub, rkey: R1.rkey, text: '附上日志看看', files: [fbf] });
ok('反馈带上文件', r.st === 200, JSON.stringify(r));
const fl = (await (await go('/api/admin/feedback', { headers: ADM })).json());
ok('管理后台看反馈：有文件和下载地址；告诉后台能发文件', fl.files === true && fl.list[0].files && /api\/f\//.test(fl.list[0].files[0].url));
r = await post('/api/dev/feedback', { sub: R1.sub, rkey: R1.rkey, text: '再用一次同一个对话文件', files: [st1.id] });
ok('对话里传的文件不能拿来当反馈附件', r.st === 400);

// 5. 公告附件（管理后台传，一直留着）
r = await post('/api/admin/up', { ctx: 'ann', name: '新功能.png', size: 5000, type: 'image/png' }, ADM);
ok('管理后台领上传票（公告）', r.st === 200 && r.j.n === 1, JSON.stringify(r));
const ap = r.j; up = await upload(ap, bytes(5000));
r = await post('/api/admin/ann', { title: '5.2 发布了', body: '看图', level: 'normal', files: [ap.id] }, ADM);
ok('发公告带图片', r.st === 200 && r.j.ann.files.length === 1);
const annId = r.j.ann.id;
const nt = await (await go('/api/notices')).json();
ok('路由器拿公告：附件带下载地址，是图片', nt.list[0].files && nt.list[0].files[0].k === 'img' && /api\/f\//.test(nt.list[0].files[0].url));
ok('公告附件存在 a/ 下面，不会 30 天自动删', F.objs.has('a/' + ap.id) && !(await S().get('fl:' + ap.id)).exp);
r = await post('/api/admin/ann/' + annId, { title: '5.2 发布了', body: '改了，不要图片了', level: 'normal', files: [] }, ADM);
await mod.default.scheduled({}, env);
ok('改公告去掉附件：文件也删掉了', r.st === 200 && !r.j.ann.files && !(await S().get('fl:' + ap.id)) && !F.objs.has('a/' + ap.id));

// 6. 30 天后自动删；传了一半放弃的 1 天后清掉
{ const f = await S().get('fl:' + st1.id); f.exp = Date.now() - 1000; await S().put('fl:' + st1.id, f); }
r = await chat(R1, { op: 'up', name: 'half.bin', size: 9 * 1024 * 1024, type: 'application/octet-stream' });
const half = r.j; await go(half.url.replace('https://panel.example', '') + '/1', { method: 'PUT', headers: { 'content-length': String(8 * 1024 * 1024) }, body: new Uint8Array(8 * 1024 * 1024) });
{ const f = await S().get('fl:' + half.id); f.at = Date.now() - 2 * 86400e3; await S().put('fl:' + half.id, f); }
const before = (await S().get('m:fbytes'));
await mod.default.scheduled({}, env);
ok('30 天到了：R2 里的文件和记录都删了，下载说已经删了', !F.objs.has('u/' + st1.id) && !(await S().get('fl:' + st1.id)) && (await go(url)).status === 404);
ok('传了一半放弃的：清掉，分块上传也取消了', !(await S().get('fl:' + half.id)) && ![...F.ups.values()].some((u) => u.key === 'u/' + half.id));
ok('总用量跟着减少', (await S().get('m:fbytes')) < before);

// 安全加固（第二轮）：匿名身份只领票不传，占不满存储；托管用户照样能发；领了不传的 1 小时后退回额度
{
	const anonUp = async (ip, size) => {
		const a = await post('/api/chat', { op: 'anon', name: 'x' }, { 'cf-connecting-ip': ip });
		if (!a.j.cid) return { st: a.st, n: 0, b: 0 };
		let n = 0, b = 0, last = 0;
		for (let f = 0; f < 2; f++) { const t = await post('/api/chat', { op: 'up', cid: a.j.cid, ckey: a.j.ckey, name: 'a.bin', size, type: 'application/octet-stream' }, { 'cf-connecting-ip': ip }); last = t.st; if (t.st === 200) { n++; b += size; } }
		return { st: last, n, b };
	};
	let held = 0, ids = 0, n429 = 0;
	for (let i = 0; i < 9; i++) for (let k = 0; k < 5; k++) { const x = await anonUp('2001:db8:' + i.toString(16) + '::' + k.toString(16), 150 * 1024 * 1024); if (x.n) ids++; held += x.b; if (x.st === 429) n429++; }
	ok('[R4] 9 个 IPv6 网段、每个开 5 个匿名身份只领票不传：最多占 1GB（实际 ' + Math.round(held / 1048576) + 'MB）', held <= 1024 * 1024 * 1024 && n429 > 0, held);
	const v = await chat(R1, { op: 'up', name: 'v.jpg', size: 5 * 1024 * 1024, type: 'image/jpeg' });
	ok('[R4] 这时托管用户发 5MB 图片：照样能发', v.st === 200, JSON.stringify(v.j));
	const same = [];
	for (let k = 0; k < 7; k++) same.push((await post('/api/chat', { op: 'anon', name: 'x' }, { 'cf-connecting-ip': '2001:db8:aaaa:1::' + (k + 1).toString(16) })).st);
	ok('[R4] 同一个 /64 网段换地址开匿名身份：每天也只算 5 个', same.filter((x) => x === 200).length === 5 && same.slice(5).every((x) => x === 429), same.join(','));
	const real = Date.now, t0 = real();
	Date.now = () => t0 + 66 * 60e3;
	const after = await anonUp('2001:db8:bbbb:2::1', 100 * 1024 * 1024);
	Date.now = real;
	ok('[R4] 1 小时后：领了不传的票作废、额度退回，匿名又能领了', after.n > 0, JSON.stringify(after));
}

console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 300) + '）')).join('\n'));
const pass = results.filter((x) => x[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

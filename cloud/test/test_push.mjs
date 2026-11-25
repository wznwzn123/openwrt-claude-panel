// 推送加密 / 签名 / 订阅管理的测试：用 Node 自带 crypto 独立实现解密和验签（和 Worker 里的 WebCrypto 代码不是同一套）
import fs from 'fs';
import nc from 'node:crypto';
import { load } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const b64u = (b) => Buffer.from(b).toString('base64url');

// VAPID 密钥（服务端）
const vk = nc.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const vjwk = vk.privateKey.export({ format: 'jwk' });
const vpub = b64u(Buffer.concat([Buffer.from([4]), Buffer.from(vjwk.x, 'base64url'), Buffer.from(vjwk.y, 'base64url')]));
// 手机端订阅的密钥
const ua = nc.createECDH('prime256v1'); ua.generateKeys();
const auth = nc.randomBytes(16);
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } };

// 独立解密（RFC 8291 + RFC 8188）
function decrypt(body) {
	const salt = body.subarray(0, 16), rs = body.readUInt32BE(16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
	const ecdh = ua.computeSecret(asPub);
	const info = Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]);
	const ikm = Buffer.from(nc.hkdfSync('sha256', ecdh, auth, info, 32));
	const cek = Buffer.from(nc.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
	const nonce = Buffer.from(nc.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
	const d = nc.createDecipheriv('aes-128-gcm', cek, nonce);
	d.setAuthTag(ct.subarray(ct.length - 16));
	const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
	let end = pt.length - 1; while (end > 0 && pt[end] === 0) end--;
	return { rs, delim: pt[end], text: pt.subarray(0, end).toString('utf8') };
}

const payload = JSON.stringify({ title: '⚠️ 路由器断电或死机', body: '中文内容 + emoji 🔔', tag: 'cloud' });
const enc = Buffer.from(await mod.encryptPush(sub, payload));
const dec = decrypt(enc);
ok('加密后的推送能用手机密钥解开，内容一字不差', dec.text === payload, dec.text);
ok('记录大小 4096、结束标记 0x02', dec.rs === 4096 && dec.delim === 2);
ok('每次加密结果都不同（随机盐和临时密钥）', !enc.equals(Buffer.from(await mod.encryptPush(sub, payload))));

const env = { VAPID_PRIV: JSON.stringify(vjwk), VAPID_PUB: vpub, RKEY: 'rk', TKEY: 'tk', PANEL_TOKEN: 'pt', PROBE_URL: 'https://x/p' };
const hdr = await mod.vapidAuth(sub.endpoint, env);
const m = hdr.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
ok('Authorization 头格式：vapid t=…, k=…', !!m && m[4] === vpub);
const claims = JSON.parse(Buffer.from(m[2], 'base64url'));
ok('JWT 的 aud 是推送服务的源', claims.aud === 'https://fcm.googleapis.com' && claims.exp > Date.now() / 1000 && /^(https|mailto):/.test(claims.sub));
const verified = nc.verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key: vk.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url'));
ok('JWT 签名能用 VAPID 公钥验证通过', verified);

// pushFor：哪些云端事件要推
const pf = mod.pushFor;
ok('断电推送', pf({ kind: 'cloud', lvl: 'err', msg: '路由器断电或死机：平板还在报告…' })?.title === '⚠️ 路由器断电或死机');
ok('恢复推送', pf({ kind: 'cloud', lvl: 'ok', msg: '恢复正常（离线共 5 分钟）' })?.title === '路由器恢复正常');
ok('「在线但有问题」不重复推（路由器自己会推具体问题）', pf({ kind: 'cloud', lvl: 'warn', msg: '在线，但有问题：DNS 有问题' }) === null);
ok('平板停止报告推送', pf({ kind: 'tablet', lvl: 'warn', msg: '平板停止报告了：检查…' })?.tag === 'tablet');
ok('平板恢复不推', pf({ kind: 'tablet', lvl: 'ok', msg: '平板恢复报告' }) === null);

// HTTP 接口 + 订阅管理 + 实际发送（假的推送服务）
const mem = new Map(); let alarm = null;
const storage = {
	async get(k) { if (Array.isArray(k)) return new Map(k.filter((x) => mem.has(x)).map((x) => [x, structuredClone(mem.get(x))])); return structuredClone(mem.get(k)); },
	async put(k, v) { if (typeof k === 'object') { for (const [a, b] of Object.entries(k)) mem.set(a, structuredClone(b)); } else mem.set(k, structuredClone(v)); },
	async getAlarm() { return alarm; }, async setAlarm(t) { alarm = t; }, async delete(k) { return mem.delete(k); },
};
const sent = []; let pushStatus = 201;
globalThis.fetch = async (u, init) => {
	if (String(u).startsWith('https://fcm.')) { sent.push({ u: String(u), h: init.headers, body: Buffer.from(init.body) }); return new Response('', { status: pushStatus }); }
	return new Response('{}', { status: 200 });
};
const obj = new mod.Watch({ storage }, env);
env.W = { idFromName: () => 'id', get: () => obj };
const call = (method, path, body) => mod.default.fetch(new Request('https://router.example' + path, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json' } }), env);

let r = await (await call('GET', '/cloud/push/key')).json();
ok('面板能取到公钥（不需要密钥）', r.key === vpub);
ok('订阅要面板密钥', (await call('POST', '/cloud/push', { token: 'bad', op: 'sub', sub })).status === 403);
r = await (await call('POST', '/cloud/push', { token: 'pt', op: 'sub', sub, name: 'Xiaomi 14' })).json();
ok('订阅成功', r.subs.length === 1 && r.subs[0].name === 'Xiaomi 14' && r.subs[0].me);
await call('POST', '/cloud/push', { token: 'pt', op: 'sub', sub, name: 'Xiaomi 14' });
ok('同一台手机重复订阅不会变成两条', (await storage.get('subs')).length === 1);
r = await (await call('POST', '/cloud/push', { token: 'pt', op: 'test', endpoint: sub.endpoint })).json();
ok('测试通知发出去了', r.sent === 1 && sent.length === 1);
const s0 = sent[0];
ok('推送请求头正确', s0.h['Content-Encoding'] === 'aes128gcm' && s0.h.TTL === '86400' && s0.h.Authorization.startsWith('vapid t='));
const m0 = JSON.parse(decrypt(s0.body).text);
ok('手机收到的内容能解开：测试通知', m0.title.startsWith('测试通知') && m0.url === './?p=wd');
ok('每条推送带随机编号', typeof m0.id === 'string' && m0.id.length >= 6);
r = await (await call('POST', '/cloud/push', { token: 'pt', op: 'list', endpoint: sub.endpoint })).json();
ok('列表显示：已发出、手机还没回报、推送服务是 FCM', r.subs[0].sent > 0 && r.subs[0].recv === null && r.subs[0].host === 'fcm.googleapis.com');
ok('乱编的编号回报无效', (await (await call('POST', '/cloud/push/ack', { id: 'nope' })).json()).ok === false);
ok('编号格式不对直接拒绝', (await call('POST', '/cloud/push/ack', { id: 'x'.repeat(40) })).status === 400);
ok('手机回报收到', (await (await call('POST', '/cloud/push/ack', { id: m0.id, shown: true, perm: 'granted' })).json()).ok === true);
r = await (await call('POST', '/cloud/push', { token: 'pt', op: 'list', endpoint: sub.endpoint })).json();
ok('列表显示手机已收到并弹出', r.subs[0].recv && r.subs[0].recv.shown === true && r.subs[0].recv.perm === 'granted');

// 路由器发来的通知
ok('路由器通知要路由器密钥', (await call('POST', '/cloud/n/bad', { title: 'x' })).status === 403);
r = await (await call('POST', '/cloud/n/rk', { lvl: 'err', kind: 'dns', title: 'DNS 解析失败', body: '外网是通的…' })).json();
ok('路由器通知推送出去了', r.sent === 1 && JSON.parse(decrypt(sent[1].body).text).title === '⚠️ DNS 解析失败');
r = await (await call('POST', '/cloud/n/rk', { lvl: 'err', kind: 'dns', title: 'DNS 解析失败', body: '又来一次' })).json();
ok('同一条 30 秒内不重复推', r.sent === 0 && sent.length === 2);
// 6.0 第 2 项：新设备连上了 → 通知上有「暂停它上网」按钮，点了到面板设备页弹出暂停设置（在面板里确认才生效）
{
	const n0 = sent.length;
	await call('POST', '/cloud/n/rk', { lvl: 'warn', kind: 'newdev', title: '新设备连上了：Redmi', body: 'IP 192.168.1.50', tag: 'newdev-aa:bb:cc:dd:ee:01' });
	const m = JSON.parse(decrypt(sent[n0].body).text);
	ok('[新设备] 点通知去设备页，有「暂停它上网」按钮，带着这台设备的 MAC', m.url === './?p=dev' && m.actions?.[0]?.action === 'pause' && m.actions[0].title === '暂停它上网' && m.actions[0].url === './?p=dev&ask=pause&mac=aa:bb:cc:dd:ee:01', JSON.stringify(m));
	await call('POST', '/cloud/n/rk', { lvl: 'warn', kind: 'newdev', title: '新设备连上了：坏的', body: '', tag: 'newdev-x;y' });
	const m2 = JSON.parse(decrypt(sent[sent.length - 1].body).text);
	ok('[新设备] 标签不是正常的 MAC：不加按钮', !m2.actions);
	await call('POST', '/cloud/n/rk', { lvl: 'warn', kind: 'ban', title: '已自动封禁 198.51.*.*', body: '', tag: 'ban-198.51.100.7' });
	ok('[拉黑] 点通知去「自动任务」（能解封）', JSON.parse(decrypt(sent[sent.length - 1].body).text).url === './?p=auto');
	// 6.0 第 11 项：Claude 想做危险操作 → 点开面板弹出「允许 / 拒绝」（推送上只有「去确认」，不能直接允许）
	await call('POST', '/cloud/n/rk', { lvl: 'warn', kind: 'ai', title: 'AI 想要：重启路由器', body: '点开面板确认', tag: 'aiask-abcdefgh23' });
	const m3 = JSON.parse(decrypt(sent[sent.length - 1].body).text);
	ok('[Claude 请求] 点通知打开面板弹出确认，按钮只有「去确认」', m3.url === './?p=home&ask=ai' && m3.actions?.length === 1 && m3.actions[0].title === '去确认' && m3.actions[0].url === './?p=home&ask=ai', JSON.stringify(m3));
	await call('POST', '/cloud/n/rk', { lvl: 'warn', kind: 'ai', title: 'x', body: '', tag: 'aiask-../../x' });
	ok('[Claude 请求] 标签不对：不加按钮', !JSON.parse(decrypt(sent[sent.length - 1].body).text).actions);
	// 6.0 第 60 项：你遇到的问题修好了 → 点开面板打开「检查更新」
	await call('POST', '/cloud/n/rk', { lvl: 'ok', kind: 'fix', title: '你遇到的问题修好了：一键更新', body: '更新到 v6.0.1 就好', tag: 'fix-update-0123456789' });
	const m4 = JSON.parse(decrypt(sent[sent.length - 1].body).text);
	ok('[修好了] 点通知打开面板的「检查更新」，按钮「去更新」', m4.url === './?p=home&ask=update' && m4.actions?.[0]?.title === '去更新', JSON.stringify(m4));
}
// 6.0 第 16 项：上网计划快到停网时间 → 只推给设计划的家长；按钮「延长 30 分钟 / 1 小时」；换了 MAC → 「计划也管它」
{
	const sig = (uid) => nc.createHash('sha256').update('rk:push:' + uid).digest('hex');
	const subB = { ...sub, endpoint: 'https://fcm.googleapis.com/fcm/send/dad' }, subC = { ...sub, endpoint: 'https://fcm.googleapis.com/fcm/send/mom' };
	r = await (await call('POST', '/cloud/push', { token: 'pt', op: 'sub', sub: subB, name: '爸爸', uid: 'dadaaaaaaaa2', sig: sig('dadaaaaaaaa2') })).json();
	await call('POST', '/cloud/push', { token: 'pt', op: 'sub', sub: subC, name: '妈妈', uid: 'momaaaaaaaa2', sig: 'f'.repeat(64) });
	const ss = await storage.get('subs');
	ok('[计划] 开通知时带账号：路由器签名对得上才记', ss.find((x) => x.name === '爸爸').uid === 'dadaaaaaaaa2' && ss.find((x) => x.name === '妈妈').uid === null, JSON.stringify(ss.map((x) => [x.name, x.uid])));
	await call('POST', '/cloud/push', { token: 'pt', op: 'sub', sub: subB, name: '爸爸' });
	ok('[计划] 同一台手机再订阅（没带账号）：账号沿用', (await storage.get('subs')).find((x) => x.name === '爸爸').uid === 'dadaaaaaaaa2');
	const n0 = sent.length;
	r = await (await call('POST', '/cloud/n/rk', { lvl: 'info', kind: 'plan', title: '「小明的平板」10 分钟后停网', body: '按上网计划 21:00 停网。', tag: 'plan-aa:bb:cc:dd:ee:02', to: 'dadaaaaaaaa2' })).json();
	ok('[计划] 只推给设计划的家长的手机', r.sent === 1 && sent.length === n0 + 1 && sent[n0].u.endsWith('/dad'), sent.slice(n0).map((x) => x.u).join());
	const m = JSON.parse(decrypt(sent[n0].body).text);
	ok('[计划] 点开去设备页问延长多久，两个按钮', m.url === './?p=dev&ask=ext&mac=aa:bb:cc:dd:ee:02' && m.actions?.map((x) => x.title).join() === '延长 30 分钟,延长 1 小时' && m.actions[0].url === './?p=dev&ask=ext&min=30&mac=aa:bb:cc:dd:ee:02' && m.actions[1].url.includes('min=60'), JSON.stringify(m));
	ok('[计划] 推送内容里不带账号编号', !('to' in m));
	const n1 = sent.length;
	r = await (await call('POST', '/cloud/n/rk', { lvl: 'info', kind: 'plan', title: '「电视」10 分钟后停网', body: '', tag: 'plan-aa:bb:cc:dd:ee:03', to: 'nobodyaaaaa2' })).json();
	ok('[计划] 这个家长没开通知：推给所有手机', r.sent === 3 && sent.length === n1 + 3);
	const n2 = sent.length;
	await call('POST', '/cloud/n/rk', { lvl: 'warn', kind: 'planmac', title: '「小明的平板」可能换了 MAC 地址', body: '', tag: 'planmac-12:34:56:78:9a:bc-aa:bb:cc:dd:ee:02', to: 'dadaaaaaaaa2' });
	const m2 = JSON.parse(decrypt(sent[n2].body).text);
	ok('[计划] 换了 MAC：点开把计划也用到新地址', sent.length === n2 + 1 && m2.url === './?p=dev&ask=plancopy&mac=12:34:56:78:9a:bc&src=aa:bb:cc:dd:ee:02' && m2.actions?.[0]?.title === '计划也管它', JSON.stringify(m2));
	await call('POST', '/cloud/n/rk', { lvl: 'info', kind: 'plan', title: 'x', body: '', tag: 'plan-;rm', to: 'dadaaaaaaaa2' });
	ok('[计划] 标签不对：不加按钮', !JSON.parse(decrypt(sent[sent.length - 1].body).text).actions);
	for (const e of [subB, subC]) await call('POST', '/cloud/push', { token: 'pt', op: 'unsub', endpoint: e.endpoint });
}
r = await (await call('POST', '/cloud/n/rk', { lvl: 'ok', kind: 'dns', title: 'DNS 恢复正常', body: '' })).json();
ok('不同的通知照常推', r.sent === 1 && JSON.parse(decrypt(sent[sent.length - 1].body).text).title === '✅ DNS 恢复正常');

// 断线 → 推送（走状态判断）
await call('POST', '/cloud/beat/r/rk', { wan: 'ok', net: 'ok', dns: 'ok', tun: 'ok', panel: 'ok', clash: 'ok', ready: 4 });
await obj.alarm();
const n0 = sent.length;
const st = await storage.get('r'); st.last = Date.now() - 320e3; await storage.put('r', st); // 超过 5 分钟没心跳
globalThis.fetch = async (u, init) => { if (String(u).startsWith('https://fcm.')) { sent.push({ body: Buffer.from(init.body), h: init.headers }); return new Response('', { status: 201 }); } return new Response('', { status: 530 }); };
await obj.alarm(); await obj.alarm();
const offline = sent.slice(n0).map((x) => JSON.parse(decrypt(x.body).text).title);
ok('路由器离线时推送到手机', offline.some((t) => t.startsWith('⚠️ 路由器离线') || t.startsWith('⚠️ 家里断网') || t.startsWith('⚠️ 路由器断电')), offline.join(' | '));
ok('推送都标记为高优先级（省电管控严的手机也能及时收到）', sent[sent.length - 1].h.Urgency === 'high');
globalThis.fetch = async (u, init) => { if (String(u).startsWith('https://fcm.')) { sent.push({ body: Buffer.from(init.body), h: init.headers }); return new Response('', { status: 201 }); } return new Response('{}', { status: 200 }); };
await call('POST', '/cloud/beat/r/rk', { wan: 'ok', net: 'ok', dns: 'ok', tun: 'ok', panel: 'ok', clash: 'ok', ready: 4 });
await obj.alarm();
ok('恢复后推送「恢复正常」', JSON.parse(decrypt(sent[sent.length - 1].body).text).title === '路由器恢复正常');

// 手机取消了订阅：推送服务回 410 → 删掉
pushStatus = 410;
globalThis.fetch = async (u, init) => { if (String(u).startsWith('https://fcm.')) return new Response('', { status: 410 }); return new Response('{}', { status: 200 }); };
await call('POST', '/cloud/n/rk', { lvl: 'warn', kind: 'x', title: '另一条', body: '' });
ok('失效的订阅自动删除', (await storage.get('subs')).length === 0);
r = await (await call('POST', '/cloud/push', { token: 'pt', op: 'sub', sub, name: 'A' })).json();
r = await (await call('POST', '/cloud/push', { token: 'pt', op: 'unsub', endpoint: sub.endpoint })).json();
ok('关闭通知会删掉订阅', r.subs.length === 0);
// 微信推送（PushPlus）
const wxs = []; let wxCode = 200;
globalThis.fetch = async (u, init) => {
	if (String(u) === 'https://www.pushplus.plus/send') { wxs.push(JSON.parse(init.body)); return new Response(JSON.stringify(wxCode === 200 ? { code: 200, msg: '请求成功', data: 'x' } : { code: wxCode, msg: '用户token不存在' }), { status: 200 }); }
	if (String(u).startsWith('https://fcm.')) return new Response('', { status: 201 });
	return new Response('{}', { status: 200 });
};
ok('设置微信要面板密钥', (await call('POST', '/cloud/push', { token: 'bad', op: 'wx', wx: 'a'.repeat(32) })).status === 403);
ok('token 格式不对直接提示', (await call('POST', '/cloud/push', { token: 'pt', op: 'wx', wx: 'abc 123' })).status === 400);
wxCode = 903;
r = await call('POST', '/cloud/push', { token: 'pt', op: 'wx', wx: 'b'.repeat(32) });
ok('token 不对（PushPlus 拒绝）就不保存，并说明原因', r.status === 400 && /用户token不存在/.test((await r.json()).error) && !(await storage.get('wx')));
wxCode = 200;
r = await (await call('POST', '/cloud/push', { token: 'pt', op: 'wx', wx: 'c'.repeat(32) })).json();
ok('设置成功：马上发一条「微信推送已开启」', r.wx.on && r.wx.tail === 'cccc' && wxs[wxs.length - 1].title.startsWith('微信推送已开启') && wxs[wxs.length - 1].template === 'html');
ok('列表里不返回完整 token', !JSON.stringify(r).includes('c'.repeat(32)));
r = await (await call('POST', '/cloud/n/rk', { lvl: 'err', kind: 'clash', title: 'OpenClash 停了', body: '正在自动重启\n<b>x</b>' })).json();
const w1 = wxs[wxs.length - 1];
ok('路由器的通知也发到微信', r.sent >= 1 && w1.title === '⚠️ OpenClash 停了' && w1.token === 'c'.repeat(32));
ok('微信内容：换行变成 <br>、特殊字符转义、带北京时间', /正在自动重启<br>&lt;b&gt;x&lt;\/b&gt;/.test(w1.content) && /\d+月\d+日 \d\d:\d\d:\d\d/.test(w1.content), w1.content);
// 没有浏览器订阅、只开了微信，断线也照样推
await storage.put('subs', []);
const nw = wxs.length;
r = await (await call('POST', '/cloud/push', { token: 'pt', op: 'test' })).json();
ok('只开微信时测试照样发', r.sent === 1 && wxs.length === nw + 1 && r.wx.ok > 0);
wxCode = 999;
await call('POST', '/cloud/n/rk', { lvl: 'warn', kind: 'mem', title: '内存快用完了', body: '' });
r = await (await call('POST', '/cloud/push', { token: 'pt', op: 'list' })).json();
ok('微信发送失败时记下原因', r.wx.err === '用户token不存在');
wxCode = 200;
r = await (await call('POST', '/cloud/push', { token: 'pt', op: 'wx', wx: '' })).json();
ok('关闭微信推送', r.wx.on === false && !(await storage.get('wx')));
// 没配置 VAPID 时不报错
const obj2 = new mod.Watch({ storage }, { ...env, VAPID_PRIV: '' });
ok('没配置推送密钥时安静跳过', (await obj2.push({ title: 'x' })) === 0);

console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (!c && note ? '（' + note + '）' : '')).join('\n'));
const pass = results.filter((r) => r[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

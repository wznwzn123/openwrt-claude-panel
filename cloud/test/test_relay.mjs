// 官网中转（5.2.3）：手机连不上自己的专属网址时，经官网转给路由器
import { load, memStorage } from './load.mjs';
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SEEN = [];
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] }));
	if (u.hostname === 'api.cloudflare.com') { if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 'tun' + Math.random(), token: 'tok' }); if (m === 'POST' && u.pathname.endsWith('/dns_records')) return R({ id: 'dns' + Math.random() }); return R({}); }
	// 路由器（经隧道）：记下收到了什么
	if (u.hostname.endsWith('.panel.example')) {
		const body = init.body ? new TextDecoder().decode(init.body) : '';
		SEEN.push({ url, method: m, headers: Object.fromEntries(new Headers(init.headers || {}).entries()), body });
		if (u.pathname.includes('/badkey')) return new Response('{"error":"nf"}', { status: 404, headers: { 'content-type': 'application/json' } });
		return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { pong: true } }), { headers: { 'content-type': 'application/json', 'set-cookie': 'x=1' } });
	}
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'panel.example', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub);
const hub = () => env.H.get('hub');
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const call = async (path, { method = 'POST', body, origin, headers = {} } = {}) => {
	const h = { 'content-type': 'application/json', ...headers };
	if (origin) h.origin = origin;
	const r = await mod.default.fetch(new Request('https://panel.example' + path, { method, headers: h, body: body === undefined || method === 'GET' || method === 'OPTIONS' ? undefined : JSON.stringify(body) }), env);
	let j = null; try { j = await r.clone().json(); } catch (e) {}
	return { st: r.status, j, h: r.headers };
};
const reg = async () => { const inv = (await call('/api/admin/invites', { body: { direct: true, max: 1 }, headers: ADM })).j.invite.code; return (await call('/api/register', { body: { invite: inv, name: 'Home', model: 'x' } })).j; };
const R = await reg();
const O = 'https://' + R.sub + '.panel.example';
const P = '/api/relay/' + R.sub + '/cgi-bin/mcp/tok0123456789abcdef';

const pre = await call(P, { method: 'OPTIONS', origin: O });
ok('[中转] 浏览器预检：本路由器的专属网址允许', pre.st === 204 && pre.h.get('access-control-allow-origin') === O && /x-cmcp-relay/.test(pre.h.get('access-control-expose-headers') || ''), pre.st);
const r1 = await call(P, { body: { jsonrpc: '2.0', id: 1, method: 'panel/live' }, origin: O });
ok('[中转] 转给路由器并把回答带回来', r1.st === 200 && r1.j?.result?.pong === true && r1.h.get('x-cmcp-relay') === '1', JSON.stringify(r1.j));
const s1 = SEEN.at(-1);
ok('[中转] 转到的就是这台路由器的专属网址、同一个路径', s1 && s1.url === O + '/cgi-bin/mcp/tok0123456789abcdef' && s1.method === 'POST', s1 && s1.url);
ok('[中转] 内容原样转过去', s1 && JSON.parse(s1.body).method === 'panel/live');
ok('[中转] 不转发 Cookie 之类的，只带内容类型', s1 && !('cookie' in s1.headers) && s1.headers['content-type'] === 'application/json');
ok('[中转] 带回来的回答允许面板读、不缓存、不带路由器的 Cookie', r1.h.get('access-control-allow-origin') === O && r1.h.get('cache-control') === 'no-store' && !r1.h.get('set-cookie'));

const n0 = SEEN.length;
ok('[安全] 别的网站发来的（Origin 不对）：拒绝，不转', (await call(P, { body: {}, origin: 'https://evil.example' })).st === 404 && SEEN.length === n0);
ok('[安全] 别的路由器的专属网址发来的：拒绝', (await call(P, { body: {}, origin: 'https://zzzzzzzz.panel.example' })).st === 404 && SEEN.length === n0);
ok('[安全] 没有 Origin：拒绝', (await call(P, { body: {} })).st === 404 && SEEN.length === n0);
ok('[安全] 只转面板接口：别的路径（原版后台、静态文件）一律不转', (await call('/api/relay/' + R.sub + '/cgi-bin/luci/admin', { body: {}, origin: O })).st === 404 && (await call('/api/relay/' + R.sub + '/panel/index.html', { body: {}, origin: O })).st === 404 && SEEN.length === n0);
ok('[安全] 路径里想跳到别处（../）：拒绝', (await call('/api/relay/' + R.sub + '/cgi-bin/mcp/../../x', { body: {}, origin: O })).st === 404 && SEEN.length === n0);
ok('[安全] 不存在的路由器：拒绝', (await call('/api/relay/abcdefgh/cgi-bin/mcp/tok0123456789abcdef', { body: {}, origin: 'https://abcdefgh.panel.example' })).st === 404 && SEEN.length === n0);
ok('[安全] 只收 POST', (await call(P, { method: 'GET', origin: O })).st === 405);
ok('[安全] 太大的请求：拒绝', (await call(P, { body: {}, origin: O, headers: { 'content-length': String(5 * 1024 * 1024) } })).st === 413);
const bad = await call('/api/relay/' + R.sub + '/cgi-bin/mcp/badkey0123456789', { body: {}, origin: O });
ok('[中转] 路由器说钥匙不对（404）：照实带回，并标明是中转回来的', bad.st === 404 && bad.h.get('x-cmcp-relay') === '1');
// 6.0 第 6 项：通行证地址和输登录码的入口也能中转（钥匙、通行证都在请求内容里，由路由器检查）
for (const sp of ['pass', 'open']) { const n2 = SEEN.length; const rr = await call('/api/relay/' + R.sub + '/cgi-bin/mcp/' + sp, { body: { jsonrpc: '2.0', id: 1, method: 'panel/live' }, origin: O }); ok('[中转] cgi-bin/mcp/' + sp + ' 也能中转', rr.h.get('x-cmcp-relay') === '1' && SEEN.length === n2 + 1 && SEEN.at(-1).url === O + '/cgi-bin/mcp/' + sp, rr.st); }
ok('[安全] 别的短路径不转', (await call('/api/relay/' + R.sub + '/cgi-bin/mcp/abc', { body: {}, origin: O })).st === 404);
// 云端状态（/cloud/s）也能中转：走云端自己，不去路由器
const n1 = SEEN.length;
const cs = await call('/api/relay/' + R.sub + '/cloud/s', { body: { token: 'nope' }, origin: O });
ok('[中转] 云端状态也能中转（不经过路由器）', cs.h.get('x-cmcp-relay') === '1' && SEEN.length === n1 && cs.st !== 404, cs.st);
// 停用的路由器：不中转
await hub().setOff(R.sub, true);
const R2 = await reg(); // 换一台（上面那台的「能中转」缓存了 5 分钟）
const O2 = 'https://' + R2.sub + '.panel.example';
await hub().setOff(R2.sub, true);
ok('[安全] 托管服务停用的路由器：不中转', (await call('/api/relay/' + R2.sub + '/cgi-bin/mcp/tok0123456789abcdef', { body: {}, origin: O2 })).st === 404);

console.log(results.map(([n, c, note]) => (c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '（' + String(note).slice(0, 300) + '）')).join('\n'));
const pass = results.filter((x) => x[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

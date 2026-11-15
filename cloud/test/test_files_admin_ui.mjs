// 5.2 管理后台发文件（真浏览器）：对话里看用户发来的图片/视频/文件、回复时附文件；公告加附件、修改时去掉；反馈里看文件
// 用法：node test/test_files_admin_ui.mjs [--shots 目录]
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { load, memStorage, memR2 } from './load.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const mod = await load();
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : '';
const realFetch = globalThis.fetch; let CFn = 0;
globalThis.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input.url, u = new URL(url), m = (init.method || 'GET').toUpperCase();
	if (u.hostname === 'api.cloudflare.com') { const R = (result) => new Response(JSON.stringify({ success: true, result, errors: [] })); if (m === 'POST' && u.pathname.endsWith('/cfd_tunnel')) return R({ id: 'tun' + ++CFn, token: 'tok' }); if (m === 'POST') return R({ id: 'dns' + ++CFn }); return R({}); }
	if (u.hostname === 'localhost') return realFetch(input, init);
	return new Response('{}');
};
const env = { BASE_DOMAIN: 'localhost', CF_API_TOKEN: 't', CF_ACCOUNT_ID: 'a', CF_ZONE_ID: 'z', ADMIN_KEY: 'admin-key-1234567890', MAX_DEVICES: '50', VAPID_PUB: '', VAPID_PRIV: '' };
const ns = (Cls) => { const objs = new Map(); return { idFromName: (n) => n, get(id) { if (!objs.has(id)) objs.set(id, new Cls({ storage: memStorage() }, env)); return objs.get(id); } }; };
env.W = ns(mod.Watch); env.H = ns(mod.Hub); env.F = memR2();
const H = () => env.H.get('hub');
const server = http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const body = chunks.length ? Buffer.concat(chunks) : undefined;
	const r = await mod.default.fetch(new Request('https://localhost' + req.url, { method: req.method, headers: { ...req.headers, 'cf-connecting-ip': '127.0.0.1' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
	const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((z) => server.listen(8146, z));
const B = 'http://localhost:8146';
const api = async (p, body, hdr = {}) => (await realFetch(B + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...hdr }, body: body ? JSON.stringify(body) : undefined })).json();
const ADM = { authorization: 'Bearer admin-key-1234567890' };
const W = (ms) => new Promise((z) => setTimeout(z, ms));
const inv = (await api('/api/admin/invites', { direct: true, max: 5 }, ADM)).invite.code;
const R1 = await api('/api/register', { invite: inv, name: '客厅 Kwrt', model: 'Xiaomi AX3000T' });
const chat = (b) => api('/api/chat', { sub: R1.sub, rkey: R1.rkey, ...b });
// 用户那边（路由器面板）传文件：领票、PUT 一块、完成
async function userUp(name, type, data, ctx) {
	const t = await chat({ op: 'up', name, size: data.length, type, ctx });
	await realFetch(t.url.replace('https://localhost', B) + '/1', { method: 'PUT', body: data });
	return (await (await realFetch(t.url.replace('https://localhost', B) + '/done', { method: 'POST' })).json()).id;
}
// 一张真的 PNG（480×300），浏览器能显示
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAeAAAAEsCAIAAACUnPcNAAADf0lEQVR42u3YsQ2DMBRFURy5z040ESyUGVgIRMMonsANrSsGQIpoHIF8zgAuXnH15ZBy6QC4n5cJAAQaAIEGEGgABBpAoAEQaAAEGkCgARBoAIEGQKABEGgAgQZAoAEEGgCBBhBoAAQaAIEGEGgABBpAoAEQaAAEGkCgARBoAIEGQKAB2hXrPf357vYFWrBObxc0QOeLAwCBBkCgAQQaAIEGEGgABBoAgQYQaAAEGkCgARBoAIEGQKABEGgAgQZAoAEEGgCBBkCgAQQaAIEGEGgABBpAoAEQaAAEGkCgARBoAIEGQKABEGgAgQZAoAEEGgCBBhBoAAQaAIEGEGgABBpAoAEQaAAEGkCgARBoAIEGQKABEGgAgQZAoAEEGgCBBhBoAAQaAIEGEGgABBpAoAH4u5BysQKACxoAgQYQaAAEGkCgARBoAAQaQKABEGgAgQZAoAEQaACBBkCgAQQaAIEGEGgABBoAgQYQaAAEGkCgARBoAAQaQKABEGgAgQZAoAEaFes9PS+bfeGKceiNgAsaQKABEGgAgQZAoAEE2gQAAg2AQAMINAACDSDQAAg0AAININAACDSAQAMg0AAINIBAAyDQAAINgEADCDQAAg2AQAMINAACDSDQAAg0AAINcH8h5WIFABc0AAININAACDSAQAMg0AAINIBAAyDQAAINgEADINAAAg2AQAMINAACDSDQAAg0AD/Eek/Py2Zf4GwceiO4oAEEGgCBBhBoAAQaAIEGEGgABBpAoAEQaACBBkCgARBoAIEGQKABBBoAgQZAoAEEGgCBBhBoAAQaAIEGEGgABBpAoAEQaACBBkCgARBogCcKKRcrALigARBoAIEGQKABBBoAgQZAoAEEGgCBBhBoAAQaAIEGEGgABBpAoAEQaACBBkCgARBoAIEGQKABBBoAgQZAoAEEGgCBBhBoAAQaQKABEGgABBpAoAEQaACBBkCgARBoAIEGQKABBBoAgQYQaAAEGgCBBhBoAAQaQKABEGgABBpAoAEQaACBBkCgARBoAIEGQKABBBoAgQYQaAAEGgCBBhBoAAQaQKABEGgABBpAoAEQaACBBkCgAQQaAIEGQKABBBoAgQYQaAAEGgCBBhBoAAQaQKABEGgAgQZAoAEQaACBBkCgAQQaAIEGQKABBBoAgQYQaAAEGgCBBhBoAAQaQKABEGiAxhxUrRZrbOOdbgAAAABJRU5ErkJggg==', 'base64');
const ids = [await userUp('路由器截图.png', 'image/png', PNG), await userUp('说明书.pdf', 'application/pdf', Buffer.from('%PDF-1.4 test')), await userUp('日志.zip', 'application/zip', Buffer.alloc(3000, 7)), await userUp('录屏.mp4', 'video/mp4', Buffer.alloc(4000, 1))];
let r = await chat({ op: 'send', text: '这是我那边的情况', files: ids });
ok('（准备）用户发了一条带 3 个文件的消息', r.ok && r.msg.files.length === 4, JSON.stringify(r).slice(0, 200));
const fid = await userUp('反馈录屏.zip', 'application/zip', Buffer.alloc(5000, 3), 'fb');
r = await api('/api/dev/feedback', { sub: R1.sub, rkey: R1.rkey, text: '打不开节点页', files: [fid] });
ok('（准备）用户发了带文件的反馈', r.ok, JSON.stringify(r));
// 用内存里的文件（这里的 Playwright 不认中文路径）
const FX = { txt: { name: '回复附件.txt', mimeType: 'text/plain', buffer: Buffer.from('hello 你好') }, pdf: { name: '新版说明.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 ann') }, png: { name: 'pic.png', mimeType: 'image/png', buffer: PNG } };

const browser = await chromium.launch();
for (const [w, h] of [[390, 844], [1440, 900]]) {
	const T = '［' + w + '］';
	const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 640, hasTouch: w < 1024 });
	const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => /Content Security Policy/.test(m.text()) && errs.push(m.text().slice(0, 160)));
	// 正式环境里管理后台、上传、下载都在托管服务的同一个网址（https://BASE）；这里整个页面都用 https://localhost，转到本地测试服务
	await p.route('https://localhost/**', async (route) => { const u = route.request().url().replace('https://localhost', B); try { const resp = await route.fetch({ url: u }); if (process.env.DBG) console.log('route', route.request().method(), u.slice(0, 90), resp.status()); await route.fulfill({ response: resp }); } catch (e) { console.log('route err', e.message); await route.abort(); } });
	if (process.env.DBG) { p.on('requestfailed', (q) => console.log('failed', q.method(), q.url().slice(0, 90), q.failure()?.errorText)); p.on('console', (m) => console.log('console', m.text().slice(0, 200))); }
	try {
	await p.goto('https://localhost/admin'); await W(1200); await p.fill('input[type=password]', 'admin-key-1234567890'); await p.click('button[type=submit]'); await W(2200);
	// —— 对话 ——
	await p.goto('https://localhost/admin#/chat?t=d' + R1.sub); await W(2200);
	const fl = p.locator('.chat-bub .fl').first();
	ok('对话：用户发来的文件显示出来（图片、视频直接显示，PDF 和压缩包是文件卡片）' + T, (await fl.count()) === 1 && (await fl.locator('img').count()) === 1 && (await fl.locator('video').count()) === 1 && (await fl.locator('.fl-ff').count()) === 2 && /说明书\.pdf/.test(await fl.textContent()) && /日志\.zip/.test(await fl.textContent()), (await p.locator('.chat-bub').first().innerHTML()).slice(0, 300));
	const nat = await fl.locator('img').evaluate((i) => i.naturalWidth);
	ok('对话：图片真的加载出来了（带签名的地址能打开）' + T, nat === 480, String(nat));
	const href = await fl.locator('.fl-ff').first().getAttribute('href');
	ok('对话：文件卡片是下载链接（dl=1）' + T, /\/api\/f\/[a-z2-9]{16}\/.+&dl=1$/.test(href || ''), href);
	ok('对话：有「发文件」按钮' + T, (await p.locator('.chat-in button[aria-label^="发文件"]').count()) === 1);
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/fadm-chat-${w}.png` });
	await p.locator('.fa input[type=file]').setInputFiles(FX.txt); await W(1500);
	let t = await p.locator('.chat-att').textContent();
	ok('对话：选了文件马上开始传，传完显示「传好了」' + T, /回复附件\.txt/.test(t) && /传好了/.test(t), t);
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/fadm-chat-att-${w}.png` });
	await p.fill('.chat-in textarea', '收到，看看这个'); await p.locator('.chat-in button', { hasText: '发送' }).click(); await W(1500);
	const last = (await H().chatMsgs('d' + R1.sub, 0, 200)).pop();
	ok('对话：回复带着文件发出去了，输入框和附件清空' + T, last.f === 'a' && last.files && last.files[0].name === '回复附件.txt' && (await p.locator('.chat-att .fa-it').count()) === 0, JSON.stringify(last));
	const g = await chat({ op: 'get' });
	ok('对话：用户那边拉到的回复里有文件下载地址' + T, g.msgs.some((m) => m.f === 'a' && m.files && m.files[0].url));
	// 只发文件不写字也可以
	await p.locator('.fa input[type=file]').setInputFiles(FX.png); await W(1500);
	ok('对话：只选了文件，「发送」能点' + T, await p.locator('.chat-in button', { hasText: '发送' }).isEnabled());
	await p.locator('.chat-in button', { hasText: '发送' }).click(); await W(1500);
	const last2 = (await H().chatMsgs('d' + R1.sub, 0, 200)).pop();
	ok('对话：只发文件也发出去了' + T, last2.f === 'a' && last2.files && last2.files[0].name === 'pic.png' && !last2.x);
	const pv = (await H().ctx.storage.get('cth')).find((x) => x.tid === 'd' + R1.sub).preview;
	ok('对话列表：只发文件的消息显示「[文件] 文件名」' + T, pv === '[文件] pic.png', pv);
	const ov = await p.evaluate(() => [...document.querySelectorAll('.chat-bub .fl img, .chat-bub .fl-ff')].some((e) => e.getBoundingClientRect().right > window.innerWidth + 1));
	ok('对话：文件没有超出屏幕' + T, !ov);
	// —— 公告 ——
	await p.goto('https://localhost/admin#/ann'); await W(1600);
	ok('公告：有「加文件」' + T, (await p.locator('.ann-files button', { hasText: '加文件' }).count()) === 1);
	await p.fill('.ann-form input', '5.2 来了 ' + w);
	await p.locator('.ann-files input[type=file]').setInputFiles([FX.pdf, FX.png]); await W(1800);
	t = await p.locator('.ann-files').textContent();
	ok('公告：两个附件都传好了，预览里写着「2 个附件」' + T, (t.match(/传好了/g) || []).length === 2 && /2 个附件/.test(await p.locator('.ann-pv').textContent()), t);
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/fadm-ann-${w}.png`, fullPage: true });
	await p.locator('.ann-form button', { hasText: '发布公告' }).click(); await W(1600);
	let anns = await H().anns(true), a = anns.find((x) => x.title === '5.2 来了 ' + w);
	ok('公告：发出去了，带 2 个附件' + T, a && a.files && a.files.length === 2, JSON.stringify(a));
	const n = await api('/api/notices?sub=' + R1.sub);
	const nn = n.list.find((x) => x.title === '5.2 来了 ' + w);
	ok('公告：路由器拉公告能拿到附件下载地址' + T, nn && (nn.files && nn.files.every((f) => /\/api\/f\//.test(f.url))), JSON.stringify(n).slice(0, 300));
	const row = p.locator('.hub-row', { hasText: '5.2 来了 ' + w });
	ok('公告：已发的公告里显示附件（图片直接显示）' + T, (await row.locator('.fl img').count()) === 1 && /新版说明\.pdf/.test(await row.textContent()));
	// 修改：去掉 PDF
	await row.locator('button', { hasText: '修改' }).click(); await W(800);
	ok('公告：点修改，原来的 2 个附件列出来' + T, (await p.locator('.ann-files .fa-it').count()) === 2);
	const pdfKey = a.files.find((f) => f.name === '新版说明.pdf').id;
	await p.locator('.ann-files .fa-it', { hasText: '新版说明.pdf' }).locator('.fa-x').click(); await W(200);
	await p.locator('.ann-form button', { hasText: '保存修改' }).click(); await W(1500);
	anns = await H().anns(true); a = anns.find((x) => x.title === '5.2 来了 ' + w);
	ok('公告：修改时去掉的附件真的删了（R2 里排队删）' + T, a.files.length === 1 && a.files[0].name === 'pic.png' && !(await H().fileMeta(pdfKey)), JSON.stringify(a.files));
	if (SHOTS) await p.screenshot({ path: `${SHOTS}/fadm-ann-list-${w}.png`, fullPage: true });
	// —— 反馈 ——
	await p.goto('https://localhost/admin#/feedback'); await W(1800);
	const fb = p.locator('.hub-row', { hasText: '打不开节点页' });
	ok('反馈：用户附的文件显示出来' + T, (await fb.count()) === 1 && /反馈录屏\.zip/.test(await fb.first().textContent()), r ? JSON.stringify(r).slice(0, 120) : 'no fb');
	if (SHOTS && (await fb.count())) await fb.first().screenshot({ path: `${SHOTS}/fadm-fb-${w}.png` });
	} catch (e) { ok('跑完没出错' + T, false, e.message.split('\n')[0]); if (SHOTS) await p.screenshot({ path: `${SHOTS}/fadm-err-${w}.png`, fullPage: true }); }
	ok('没有页面错误（也没被内容安全策略拦住）' + T, !errs.length, errs.join(' | '));
	await c.close();
}
await browser.close(); server.close();
const bad = results.filter((x) => !x[1]);
for (const [n, c, note] of results) console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400)));
console.log(bad.length ? `失败 ${bad.length}/${results.length}` : `通过 ${results.length}/${results.length}`);
process.exit(bad.length ? 1 : 0);

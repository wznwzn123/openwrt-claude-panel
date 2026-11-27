// 第五阶段（面板）：Nikki 的订阅、配置文件、规则、不走代理（11/27 全面检查第 16 条）
// 侧边栏按正在用的插件显示；订阅加、改、更新、换着用、删；配置文件看、改、换、删、正在跑的只能看；规则一行一条；不走代理不用「启用」那一步
// 320 / 390 深色 / 430 截图
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
const NKP = { id: 'nikki', name: 'Nikki', kind: 'clash', enabled: true, running: true }, OCX = { id: 'openclash', name: 'OpenClash', kind: 'clash', enabled: true, running: true };
let S;
const fresh = () => ({ calls: [], busy: 0, d: { on: true, active: true, running: true, enabled: true, prof: { kind: 'sub', id: 'sub1' }, split: 2, mixin_rule: true, busy: false,
	subs: [{ id: 'sub1', name: '机场一', host: 'a.example.com', ua: 'clash.meta', file: { size: 52000, mtime: Date.now() / 1000 - 3600 }, ok: true, active: true },
		{ id: 'sub2', name: '一个名字很长很长的备用机场订阅', host: 'very-long-subscription-host-name.example.com', ua: 'mihomo', file: null, ok: null, active: false }],
	files: [{ name: 'my.yaml', size: 3000, mtime: Date.now() / 1000 - 86400, active: false }, { name: '一个很长很长的配置文件名字-backup-2026.yaml', size: 120000, mtime: Date.now() / 1000 - 600, active: false }],
	rules: [{ type: 'DOMAIN-SUFFIX', matcher: 'mine.com', node: 'DIRECT', nr: false, en: true }, { type: 'DOMAIN', matcher: 'off.com', node: 'REJECT', nr: false, en: false }] } });
function handle(m, p) {
	S.calls.push({ m, p });
	const d = S.d;
	if (m === 'px' || m === 'overview') mock.PXM.px = { active: S.active ?? 'nikki', list: S.list || [NKP] };
	if (m === 'nk_get') return d;
	if (m === 'nk_sub_save') { if (p.id) Object.assign(d.subs.find((s) => s.id === p.id), { name: p.name, ua: p.ua }); else d.subs.push({ id: 'sub9', name: p.name, host: new URL(p.url).host, ua: p.ua, file: null, active: false }); return { ok: true, id: p.id || 'sub9' }; }
	if (m === 'nk_sub_update') { S.busy = 2; return { ok: true, restart: p.id === 'sub1' }; }
	if (m === 'subx_state') return { busy: S.busy-- > 0 };
	if (m === 'subx_info') return p.id === 'sub1' ? { ok: true, upload: 1e9, download: 2e10, total: 1e11, expire: Date.now() / 1000 + 20 * 86400 } : { ok: false, msg: '这个机场没有提供流量信息' };
	if (m === 'subx_list') return { px: 'nikki', name: 'Nikki', subs: d.subs.map((s) => ({ id: s.id, name: s.name })), busy: false };
	if (m === 'subx_update') { S.busy = 1; return { ok: true, n: d.subs.length }; }
	if (m === 'nk_use') { d.prof = { kind: p.kind, id: p.id }; d.subs.forEach((s) => (s.active = p.kind === 'sub' && s.id === p.id)); d.files.forEach((f) => (f.active = p.kind === 'file' && f.name === p.id)); return { ok: true, restarting: !!p.restart }; }
	if (m === 'nk_sub_del') { d.subs = d.subs.filter((s) => s.id !== p.id); return { ok: true }; }
	if (m === 'nk_rules_set') { const l = p.text.split('\n').filter((x) => x.trim()); d.rules = l.map((x) => { const en = !/^#/.test(x), q = x.replace(/^#\s*/, '').split(','); return { type: q[0], matcher: q[1], node: q[2], nr: q[3] === 'no-resolve', en }; }); return { ok: true, n: l.length, restarting: !!p.restart }; }
	if (m === 'file_read' && /^nk_/.test(p.kind)) return { name: p.name, size: 30, mtime: 1, content: p.kind === 'nk_run' ? 'mixed-port: 7890\nsecret: x\n' : 'mode: rule\nproxies: []\n', sum: 's1', ro: p.kind !== 'nk_profile' };
	if (m === 'file_save' && /^nk_/.test(p.kind)) { if (!d.files.some((f) => f.name === p.name)) d.files.push({ name: p.name, size: p.content.length, mtime: Date.now() / 1000, active: false }); return { ok: true, backup: '/x', restarting: !!p.restart }; }
	if (m === 'file_delete' && /^nk_/.test(p.kind)) { d.files = d.files.filter((f) => f.name !== p.name); return { ok: true }; }
	if (m === 'black_state') return { ...mock.respond(m, p), ready: true, live: true, custom_on: true, px: 'nikki' };
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (x) => (b += x)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); const m = body.method.replace(/^panel\//, ''); return setTimeout(() => { try { J({ jsonrpc: '2.0', id: body.id, result: handle(m, body.params || {}) }); } catch (e) { J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }, 20); }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const lay = (page, sel) => page.evaluate((sel) => {
	const bad = [];
	if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('横向滚动');
	document.querySelectorAll(sel + ' .card, ' + sel + ' .file, ' + sel + ' .btn, .modal .btn, .modal .input, .modal .mact').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && (r.right > innerWidth - 2 || r.left < 2)) bad.push('出界：' + el.textContent.trim().slice(0, 14)); });
	document.querySelectorAll(sel + ' .sechead, ' + sel + ' .file').forEach((r) => { if (r.scrollWidth > r.clientWidth + 1) bad.push('撑宽：' + r.textContent.trim().slice(0, 14)); });
	return bad;
}, sel);
const nav = (page) => page.evaluate(() => [...document.querySelectorAll('#sidenav button[data-p]')].map((b) => b.dataset.p).filter((p) => !p.startsWith('k:')));
const calls = (m) => S.calls.filter((c) => c.m === m);
const modalBtn = async (page, re) => { const b = page.locator('.modal button', { hasText: re }).last(); await b.click(); await W(500); };
(async () => {
	await new Promise((r) => server.listen(8202, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`, tag = `${w}${dark ? 'd' : ''}`;
		S = fresh();
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_tour', '9'); });
		await page.goto('http://localhost:8202/panel/?p=nksub'); await W(1800);
		let nv = await nav(page);
		ok('侧边栏：用 Nikki 时有 Nikki 的订阅、配置文件，规则、不走代理也在；没有 OpenClash 的订阅、配置文件、覆写、插件设置' + T,
			['nksub', 'nkcfg', 'rules', 'black'].every((x) => nv.includes(x)) && !['subs', 'cfg', 'ow', 'set', 'log'].some((x) => nv.includes(x)), nv.join('|'));
		// 订阅页
		ok('订阅页：两张卡片，正在用的标出来，没下载过的写清楚，订阅地址只显示主机名' + T, (await page.locator('#nsBody .subcard').count()) === 2 && /正在使用/.test(await page.locator('#nsBody .subcard').first().textContent())
			&& /还没下载过/.test(await page.locator('#nsBody .subcard').nth(1).textContent()) && /a\.example\.com/.test(await page.textContent('#nsBody')));
		ok('订阅页排版' + T, !(await lay(page, '#nsBody')).length, (await lay(page, '#nsBody')).join('；'));
		await page.screenshot({ path: path.join(SHOT, `nk-sub-${tag}.png`), fullPage: true });
		// 加订阅
		await page.click('#nsBody [data-add]'); await W(500);
		await page.screenshot({ path: path.join(SHOT, `nk-sub-add-${tag}.png`) });
		ok('加订阅的表单排版' + T, !(await lay(page, '#nsBody')).length, (await lay(page, '#nsBody')).join('；'));
		await page.fill('.modal [data-n]', '新机场'); await page.fill('.modal [data-u]', 'https://new.example.com/s?token=1'); await page.selectOption('.modal [data-a]', 'mihomo');
		await modalBtn(page, '添加并下载'); await W(1500);
		ok('加订阅：存好马上下载' + T, calls('nk_sub_save').some((c) => c.p.name === '新机场' && c.p.url === 'https://new.example.com/s?token=1' && c.p.ua === 'mihomo') && calls('nk_sub_update').some((c) => c.p.id === 'sub9'));
		await W(6500);
		ok('下载完列表里有新订阅' + T, (await page.locator('#nsBody .subcard').count()) === 3);
		// 更新正在用的：先问
		await page.locator('#nsBody .subcard').first().locator('[data-up]').click(); await W(500);
		ok('更新正在用的订阅：先说会重启 Nikki' + T, /会重启/.test(await page.textContent('.modal')));
		await modalBtn(page, /^更新$/); await W(800);
		ok('点了才更新' + T, calls('nk_sub_update').some((c) => c.p.id === 'sub1'));
		await W(6500);
		// 更多 → 使用这个订阅
		await page.locator('#nsBody .subcard').nth(1).locator('[data-more]').click(); await W(500);
		await page.screenshot({ path: path.join(SHOT, `nk-sub-more-${tag}.png`) });
		ok('「更多」：查流量、编辑、使用这个订阅、删除' + T, (await page.locator('.modal .mact').allTextContents()).join('|') === '查流量|编辑|使用这个订阅|删除', (await page.locator('.modal .mact').allTextContents()).join('|'));
		await page.locator('.modal .mact', { hasText: '使用这个订阅' }).click(); await W(500);
		ok('换订阅：先问，写清要重启、没下载过的先下载' + T, /先下载 再重启 Nikki/.test(await page.textContent('.modal')));
		await modalBtn(page, '换并重启'); await W(1200);
		ok('换订阅：点了换并重启' + T, calls('nk_use').some((c) => c.p.kind === 'sub' && c.p.id === 'sub2' && c.p.restart === true) && /正在使用/.test(await page.locator('#nsBody .subcard').nth(1).textContent()));
		// 编辑
		await page.locator('#nsBody .subcard').first().locator('[data-more]').click(); await W(500);
		await page.locator('.modal .mact', { hasText: '编辑' }).click(); await W(500);
		ok('编辑：名字带出来，地址不填就不改' + T, (await page.inputValue('.modal [data-n]')) === '机场一' && /不改就不填/.test(await page.getAttribute('.modal [data-u]', 'placeholder')));
		await page.fill('.modal [data-n]', '机场一号'); await modalBtn(page, '保存'); await W(800);
		ok('编辑：没填地址就不带地址' + T, calls('nk_sub_save').some((c) => c.p.id === 'sub1' && c.p.name === '机场一号' && c.p.url === undefined));
		// 删除
		await page.locator('#nsBody .subcard').first().locator('[data-more]').click(); await W(500);
		await page.locator('.modal .mact', { hasText: '删除' }).click(); await W(500);
		await modalBtn(page, '删除'); await W(1000);
		ok('删除不在用的订阅' + T, calls('nk_sub_del').some((c) => c.p.id === 'sub1'));
		// 配置文件页
		await page.goto('http://localhost:8202/panel/?p=nkcfg'); await W(1500);
		ok('配置文件页：自己的配置文件、正在运行的那份' + T, (await page.locator('#ncBody [data-f]').count()) === 2 && await page.isVisible('#ncBody [data-run]'));
		ok('配置文件页排版' + T, !(await lay(page, '#ncBody')).length, (await lay(page, '#ncBody')).join('；'));
		await page.screenshot({ path: path.join(SHOT, `nk-cfg-${tag}.png`), fullPage: true });
		await page.click('#ncBody [data-run]'); await W(900);
		ok('正在运行的配置：只能看（没有保存按钮）' + T, await page.locator('.modal textarea[readonly]').count() === 1 && !(await page.locator('.modal [data-s]').count()) && /只能看/.test(await page.textContent('.modal')));
		await page.screenshot({ path: path.join(SHOT, `nk-cfg-run-${tag}.png`) });
		await modalBtn(page, '关闭');
		await page.locator('#ncBody [data-f]').first().locator('[data-more]').click(); await W(500);
		await page.locator('.modal .mact', { hasText: '编辑' }).click(); await W(1000);
		ok('编辑不在用的配置文件：只有「保存」（不在用，重启没用）' + T, (await page.locator('.modal [data-s]').count()) === 1 && !(await page.locator('.modal [data-sr]').count()));
		await page.fill('.modal textarea', 'mode: global\n'); await page.locator('.modal [data-s]').click(); await W(900);
		ok('保存配置文件：带上打开时的指纹' + T, calls('file_save').some((c) => c.p.kind === 'nk_profile' && c.p.name === 'my.yaml' && c.p.content === 'mode: global\n' && c.p.base === 's1'));
		await page.locator('#ncBody [data-f]').first().locator('[data-more]').click(); await W(500);
		await page.locator('.modal .mact', { hasText: '使用这个配置' }).click(); await W(500);
		await modalBtn(page, '换并重启'); await W(1000);
		ok('换成配置文件' + T, calls('nk_use').some((c) => c.p.kind === 'file' && c.p.id === 'my.yaml'));
		// 新建
		await page.click('#ncBody [data-new]'); await W(500);
		await page.fill('.modal [data-n]', 'new'); await page.fill('.modal [data-t]', 'mode: rule\n'); await modalBtn(page, '保存'); await W(1000);
		ok('新建配置文件：自动补 .yaml' + T, calls('file_save').some((c) => c.p.kind === 'nk_profile' && c.p.name === 'new.yaml'));
		// 订阅的配置：只能看，能另存
		S.d.subs[0].file = { size: 52000, mtime: Date.now() / 1000 };
		await page.goto('http://localhost:8202/panel/?p=nksub'); await W(1500);
		const c0 = page.locator('#nsBody .subcard').first();
		await c0.locator('[data-more]').click(); await W(500);
		await page.locator('.modal .mact', { hasText: '看配置内容' }).click(); await W(1000);
		ok('订阅下载的配置：只能看，能另存成配置文件' + T, await page.locator('.modal textarea[readonly]').count() === 1 && await page.locator('.modal [data-as]').count() === 1);
		await modalBtn(page, '关闭');
		// 规则页
		await page.goto('http://localhost:8202/panel/?p=rules'); await W(1500);
		ok('规则页「自定义规则」：Nikki 里自己写的条数、停用的、分流另有几条' + T, /我的规则/.test(await page.textContent('#ruBody')) && /2 条 · 停用 1 条 · 分流另有 2 条/.test(await page.textContent('#ruBody')), await page.textContent('#ruBody'));
		ok('规则页排版' + T, !(await lay(page, '#ruBody')).length, (await lay(page, '#ruBody')).join('；'));
		await page.screenshot({ path: path.join(SHOT, `nk-rules-${tag}.png`), fullPage: true });
		await page.click('#ruBody [data-nke]'); await W(600);
		ok('编辑规则：一行一条，停用的行首 #' + T, (await page.inputValue('.modal textarea')) === 'DOMAIN-SUFFIX,mine.com,DIRECT\n# DOMAIN,off.com,REJECT');
		await page.screenshot({ path: path.join(SHOT, `nk-rules-ed-${tag}.png`) });
		await page.fill('.modal textarea', 'DOMAIN-SUFFIX,a.com,DIRECT\nIP-CIDR,1.2.3.0/24,香港,no-resolve');
		await page.locator('.modal [data-sr]').click(); await W(500);
		ok('保存并重启：先问' + T, /重启 Nikki/.test(await page.textContent('.modal:last-of-type')));
		await modalBtn(page, '保存并重启'); await W(1000);
		ok('保存规则：把整段发给路由器，要重启' + T, calls('nk_rules_set').some((c) => c.p.restart === true && /IP-CIDR,1\.2\.3\.0\/24,香港,no-resolve/.test(c.p.text)));
		// 生效规则、规则集：照用 Clash 接口
		await page.locator('#ruSeg .chip[data-k="live"]').click(); await W(1000);
		ok('生效规则照样能看' + T, calls('rules').length > 0 && /条/.test(await page.textContent('#ruBody')));
		// 不走代理
		await page.goto('http://localhost:8202/panel/?p=black'); await W(1500);
		ok('不走代理：用 Nikki 时直接是「已启用」，没有「启用」那一步' + T, /已启用/.test(await page.textContent('#blBody')) && !(await page.locator('#blBody [data-setup]').count()));
		await page.screenshot({ path: path.join(SHOT, `nk-black-${tag}.png`), fullPage: true });
		await ctx.close();
	}
	// 两个都装了：按正在用的那个
	S = fresh(); S.list = [OCX, { ...NKP, enabled: false, running: false }]; S.active = 'openclash';
	let ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	let page = await ctx.newPage();
	await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_tour', '9'); });
	await page.goto('http://localhost:8202/panel/?p=home'); await W(1800);
	let nv = await nav(page);
	ok('OpenClash 和 Nikki 都装了、正在用 OpenClash：显示 OpenClash 的订阅、配置文件', nv.includes('subs') && nv.includes('cfg') && !nv.includes('nksub') && !nv.includes('nkcfg'), nv.join('|'));
	await ctx.close();
	S = fresh(); S.list = [{ ...OCX, enabled: false, running: false }, NKP]; S.active = 'nikki';
	ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	page = await ctx.newPage();
	await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_tour', '9'); });
	await page.goto('http://localhost:8202/panel/?p=home'); await W(1800);
	nv = await nav(page);
	ok('都装了、正在用 Nikki：显示 Nikki 的，不重复出两个「订阅」', nv.includes('nksub') && !nv.includes('subs') && !nv.includes('cfg'), nv.join('|'));
	// Nikki 没在跑：换配置不重启
	S.d.running = false;
	await page.goto('http://localhost:8202/panel/?p=nkcfg'); await W(1500);
	await page.locator('#ncBody [data-f]').first().locator('[data-more]').click(); await W(500);
	await page.locator('.modal .mact', { hasText: '使用这个配置' }).click(); await W(500);
	ok('Nikki 没在跑：换配置写「下次启动时用」，不重启', /下次启动时用/.test(await page.textContent('.modal')));
	await modalBtn(page, /^换$/); await W(900);
	ok('Nikki 没在跑：不带重启', calls('nk_use').some((c) => c.p.restart === false));
	await ctx.close();
	// 没装 Nikki
	S = fresh(); S.d = { on: false };
	ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	page = await ctx.newPage();
	await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); localStorage.setItem('rp_tour', '9'); });
	await page.goto('http://localhost:8202/panel/?p=nksub'); await W(1500);
	ok('没装 Nikki：说清楚', /没装 Nikki/.test(await page.textContent('#nsBody')));
	await ctx.close();
	await browser.close(); server.close();
	for (const [n, c, note] of results) console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : '（' + String(note).slice(0, 300) + '）'));
	if (problems.length) console.log('问题：\n' + [...new Set(problems)].slice(0, 20).join('\n'));
	console.log(`通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(0);
})();

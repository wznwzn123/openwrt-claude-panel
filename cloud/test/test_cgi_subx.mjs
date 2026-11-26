// 用户 11/26「所有的都要适配」：Nikki、PassWall、PassWall 2、SSR Plus+、HomeProxy 的订阅列表、更新（用插件自己的脚本）、查流量；订阅地址不发给手机
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_subx.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpsx-')), CFG = E + '/config', RUN = E + '/run.log', BUSY = E + '/busy';
fs.mkdirSync(CFG);
// 假的机场：/a 回流量信息，/b 不回；记下 User-Agent
const UA = [];
const srv = http.createServer((q, s) => { UA.push(q.headers['user-agent']); if (q.url.startsWith('/a')) s.setHeader('subscription-userinfo', 'upload=1073741824; download=10737418240; total=107374182400; expire=1830000000'); s.end('ok'); });
await new Promise((z) => srv.listen(8761, '127.0.0.1', z));
const A = 'http://127.0.0.1:8761/a?token=SECRET', B = 'http://127.0.0.1:8761/b';
fs.writeFileSync(CFG + '/nikki', `config config 'config'\n\toption profile 'subscription:sub1'\n\nconfig subscription 'sub1'\n\toption name '机场一'\n\toption url '${A}'\n\toption user_agent 'clash.meta'\n\nconfig subscription 'sub2'\n\toption name '备用'\n\toption url '${B}'\n`);
fs.writeFileSync(CFG + '/passwall', `config subscribe_list 'pw1'\n\toption remark '机场二'\n\toption url '${A}'\n`);
fs.writeFileSync(CFG + '/passwall2', `config subscribe_list 'p2'\n\toption remark '二号'\n\toption url '${A}'\n\toption user_agent 'myua'\n`);
fs.writeFileSync(CFG + '/shadowsocksr', `config server_subscribe\n\toption user_agent 'v2rayN/9.99'\n\tlist subscribe_url '${A}'\n\tlist subscribe_url '${B}'\n`);
fs.writeFileSync(CFG + '/homeproxy', `config homeproxy 'subscription'\n\tlist subscription_url '${A}'\n`);
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: 'tok' + 'x'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
let PX = 'nikki';
const cgi = (method, params) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/tok' + 'x'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_SX_PX: PX, CMCP_SX_RUN: RUN, CMCP_SX_BUSY: BUSY, NO_PROXY: '*', no_proxy: '*', http_proxy: '', HTTP_PROXY: '' } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const err = (r) => r.error?.message || '';
const rd = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
try {
	// Nikki
	let r = await cgi('subx_list');
	ok('Nikki：列出订阅（名字），不带订阅地址', r.result?.px === 'nikki' && r.result.name === 'Nikki' && JSON.stringify(r.result.subs) === '[{"id":"sub1","name":"机场一"},{"id":"sub2","name":"备用"}]' && !JSON.stringify(r).includes('SECRET'), JSON.stringify(r));
	r = await cgi('subx_info', { id: 'sub1' });
	ok('Nikki：查流量（问订阅地址，用它设的 User-Agent）', r.result?.ok && r.result.total === 107374182400 && r.result.download === 10737418240 && r.result.expire === 1830000000 && UA.includes('clash.meta'), JSON.stringify(r));
	r = await cgi('subx_info', { id: 'sub2' });
	ok('机场没给流量信息：说清楚', r.result?.ok === false && /没有提供流量信息/.test(r.result.msg));
	ok('没有的订阅', /没有这个订阅/.test(err(await cgi('subx_info', { id: 'nope' }))));
	r = await cgi('subx_update');
	ok('Nikki 更新：每个订阅都更新，正在用的是订阅就重启 Nikki，跑完删掉标记', r.result?.ok && r.result.n === 2 && /nikki update_subscription 'sub1'; \/etc\/init\.d\/nikki update_subscription 'sub2'; \/etc\/init\.d\/nikki restart; rm -f/.test(rd(RUN)), rd(RUN));
	ok('正在更新：不能再点', (await cgi('subx_state')).result?.busy === true && /正在更新/.test(err(await cgi('subx_update'))));
	fs.unlinkSync(BUSY); fs.writeFileSync(RUN, '');
	// PassWall / PassWall 2
	PX = 'passwall'; r = await cgi('subx_list');
	ok('PassWall：订阅名用备注', r.result?.subs?.[0]?.name === '机场二');
	await cgi('subx_update');
	ok('PassWall 更新：用它自己的订阅脚本（跟原版页面一样）', /lua \/usr\/share\/passwall\/subscribe\.lua start all manual/.test(rd(RUN)), rd(RUN));
	fs.unlinkSync(BUSY); fs.writeFileSync(RUN, '');
	PX = 'passwall2'; UA.length = 0; r = await cgi('subx_info', { id: 'p2' });
	ok('PassWall 2：查流量用它设的 User-Agent', r.result?.ok && UA.includes('myua'));
	await cgi('subx_update');
	ok('PassWall 2 更新', /\/usr\/share\/passwall2\/subscribe\.lua start all manual/.test(rd(RUN)));
	fs.unlinkSync(BUSY); fs.writeFileSync(RUN, '');
	// SSR Plus+（老版本：地址写在 server_subscribe 里）
	PX = 'shadowsocksr'; r = await cgi('subx_list');
	ok('SSR Plus+ 老版本：每个地址一个订阅，名字用网址的主机名', r.result?.subs?.length === 2 && r.result.subs[0].id === 'legacy_1' && r.result.subs[0].name === '127.0.0.1', JSON.stringify(r.result));
	ok('SSR Plus+：查流量', (await cgi('subx_info', { id: 'legacy_1' })).result?.ok === true);
	await cgi('subx_update');
	ok('SSR Plus+ 更新', /\/usr\/share\/shadowsocksr\/subscribe\.lua/.test(rd(RUN)));
	fs.unlinkSync(BUSY); fs.writeFileSync(RUN, '');
	// SSR Plus+ 新版本：server_subscribe_item
	fs.appendFileSync(CFG + '/shadowsocksr', `\nconfig server_subscribe_item 'it1'\n\toption alias '新机场'\n\toption url '${A}'\n\toption enabled '1'\n\nconfig server_subscribe_item 'it2'\n\toption alias '停用的'\n\toption url '${B}'\n\toption enabled '0'\n`);
	r = await cgi('subx_list');
	ok('SSR Plus+ 新版本：用订阅条目，停用的不算', JSON.stringify(r.result?.subs) === '[{"id":"it1","name":"新机场"}]', JSON.stringify(r.result));
	// HomeProxy
	PX = 'homeproxy'; r = await cgi('subx_list');
	ok('HomeProxy：每个地址一个订阅', r.result?.subs?.length === 1 && r.result.subs[0].id === 'u1');
	await cgi('subx_update');
	ok('HomeProxy 更新', /\/etc\/homeproxy\/scripts\/update_subscriptions\.uc/.test(rd(RUN)));
	fs.unlinkSync(BUSY);
	// 没有订阅、OpenClash、没装
	fs.writeFileSync(CFG + '/homeproxy', "config homeproxy 'subscription'\n\toption auto_update '0'\n");
	ok('还没有订阅：说去原版页面添加', /HomeProxy 还没有订阅/.test(err(await cgi('subx_update'))));
	PX = 'openclash';
	ok('OpenClash 不走这里（用自己的订阅页）', (await cgi('subx_list')).result?.subs?.length === 0);
	PX = '';
	ok('没装代理插件：说原因', /没装代理插件/.test(err(await cgi('subx_update'))));
} finally {
	srv.close(); fs.rmSync(E, { recursive: true, force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 400))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

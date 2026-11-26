// 6.0 第 69 项（路由器）：分流——按设备 / 软件 / 国家选直连、代理（主策略组）、某个策略组；OpenClash 写规则集 + 自定义规则一段，Nikki 写 uci；
// 策略组没了自动改走主策略组并推送；设了分流的设备自动固定 IP
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_split.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpsp-')), CFG = E + '/config', RS = E + '/rp', CUS = E + '/custom.list', PX = E + '/proxies.json', RUN = E + '/run.log', SB = E + '/sbin', YML = E + '/config.yaml';
for (const d of [CFG, RS, SB]) fs.mkdirSync(d);
fs.writeFileSync(SB + '/cmcp-notify', `#!/bin/sh\necho "$*" >> ${E}/notified\n`, { mode: 0o755 });
fs.writeFileSync(CFG + '/dhcp', "config dnsmasq\n\toption domainneeded '1'\n\nconfig host 'tv'\n\toption mac 'aa:aa:aa:aa:aa:02'\n\toption ip '192.168.1.20'\n");
fs.writeFileSync(CFG + '/nikki', "config mixin 'mixin'\n\toption rule '0'\n\nconfig rule 'mine'\n\toption type 'DOMAIN'\n\toption matcher 'x.com'\n\toption node 'DIRECT'\n");
const CUS0 = 'rule-providers:\n  mine:\n    type: http\n    behavior: domain\n    url: https://x\n    path: ./x.yaml\nrules:\n- RULE-SET,cmcp_blacklist,DIRECT # [cmcp-blacklist]\n- DOMAIN,keep.me,DIRECT\n';
fs.writeFileSync(CUS, CUS0);
const PROX = (groups) => JSON.stringify({ proxies: Object.fromEntries([['GLOBAL', { type: 'Selector', all: groups.map((g) => g[0]) }], ...groups.map(([n, t]) => [n, { type: t }]), ['HK01', { type: 'Shadowsocks' }]]) });
fs.writeFileSync(PX, PROX([['节点选择', 'Selector'], ['🎬 流媒体', 'Selector'], ['♻️ 自动选择', 'URLTest']]));
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: 'tok' + 'p'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
let KIND = 'openclash';
const cgi = (method, params, xenv = {}) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/tok' + 'p'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_SBIN: SB, CMCP_SP_KIND: KIND, CMCP_SP_PROXIES: PX, CMCP_SP_DIR: RS, CMCP_SP_CUSTOM: CUS, CMCP_SP_RUN: RUN, CMCP_SP_CFG: YML, ...xenv } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const err = (r) => r.error?.message || '';
const rd = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
try {
	let r = await cgi('split_get');
	ok('读：OpenClash、策略组按顺序、主策略组是第一个「手动选择」的', r.result?.kind === 'openclash' && JSON.stringify(r.result.groups) === '["节点选择","🎬 流媒体","♻️ 自动选择"]' && r.result.main === '节点选择' && r.result.apps.length >= 15 && r.result.geos.some((g) => g.id === 'JP'), JSON.stringify(r).slice(0, 300));
	ok('没有的策略组不让选', /没有这个策略组/.test(err(await cgi('split_set', { app: { id: 'netflix', t: '不存在' } }))));
	ok('没有的软件不让选', /没有这个软件/.test(err(await cgi('split_set', { app: { id: 'nope', t: 'DIRECT' } }))));
	r = await cgi('split_set', { app: { id: 'netflix', t: '🎬 流媒体' } });
	ok('软件 → 策略组：规则集写网址后缀，自定义规则加一行（在「不走代理」后面），要重启', r.result?.restart === true && /DOMAIN-SUFFIX,netflix\.com/.test(rd(RS + '/cmcp_sp_a0.yaml')) && /cmcp_blacklist,DIRECT # \[cmcp-blacklist\]\n- RULE-SET,cmcp_sp_a0,🎬 流媒体 # \[cmcp-split\]\n- DOMAIN,keep\.me/.test(rd(CUS)) && /cmcp_sp_a0: # \[cmcp-split\]\n    type: file\n    behavior: classical\n    path: \.\/rule_provider\/cmcp_sp_a0\.yaml/.test(rd(CUS)), rd(CUS));
	ok('原来的规则集声明、规则都在', rd(CUS).includes('  mine:\n    type: http') && rd(CUS).includes('- DOMAIN,keep.me,DIRECT'));
	r = await cgi('split_set', { app: { id: 'youtube', t: '🎬 流媒体' } });
	ok('同一个去向再加软件：只改规则集，不用重启（但上次的重启还没做，提醒还在）', /youtube\.com/.test(rd(RS + '/cmcp_sp_a0.yaml')) && /netflix\.com/.test(rd(RS + '/cmcp_sp_a0.yaml')) && (rd(CUS).match(/cmcp_sp_a0,/g) || []).length === 1 && r.result.pending === true);
	r = await cgi('split_restart');
	ok('现在重启：重启 OpenClash，提醒消失', r.result?.ok && /openclash restart/.test(rd(RUN)) && (await cgi('split_get')).result.pending === false);
	r = await cgi('split_set', { app: { id: 'bilibili', t: 'DIRECT' } });
	ok('软件 → 直连：多一个去向，要重启', r.result?.restart === true && /- RULE-SET,cmcp_sp_a[0-9],DIRECT # \[cmcp-split\]/.test(rd(CUS)));
	r = await cgi('split_set', { geo: { id: 'JP', t: 'PROXY' } });
	ok('国家 → 代理：GEOIP 规则走主策略组', /GEOIP,JP/.test(Object.values(fs.readdirSync(RS)).map((f) => rd(RS + '/' + f)).join('')) && /,节点选择 # \[cmcp-split\]/.test(rd(CUS)), rd(CUS));
	// 设备
	ok('设备没 IP 不让设', /没有 IP/.test(err(await cgi('split_set', { dev: { mac: 'aa:aa:aa:aa:aa:01', t: 'DIRECT' } }))));
	r = await cgi('split_set', { dev: { mac: 'aa:aa:aa:aa:aa:01', ip: '192.168.1.50', name: '孩子的平板', t: 'DIRECT' } });
	ok('设备 → 直连：自动固定 IP，规则在最前面（设备优先于软件、国家）', /cmcp_sp_aaaaaaaaaa01/.test(rd(CFG + '/dhcp')) && /option ip '192\.168\.1\.50'/.test(rd(CFG + '/dhcp')) && rd(CUS).indexOf('cmcp_sp_d') < rd(CUS).indexOf('cmcp_sp_a') && /SRC-IP-CIDR,192\.168\.1\.50\/32/.test(fs.readdirSync(RS).filter((f) => /_d/.test(f)).map((f) => rd(RS + '/' + f)).join('')), rd(CUS));
	r = await cgi('split_set', { dev: { mac: 'aa:aa:aa:aa:aa:02', ip: '192.168.1.99', t: '♻️ 自动选择' } });
	ok('已经有固定 IP 的设备：沿用原来的', r.result?.dev?.['aa:aa:aa:aa:aa:02']?.ip === '192.168.1.20' && !/cmcp_sp_aaaaaaaaaa02/.test(rd(CFG + '/dhcp')));
	r = await cgi('split_set', { dev: { mac: 'aa:aa:aa:aa:aa:01', t: '' } });
	ok('去掉设备分流：删掉自己加的固定 IP', !r.result?.dev?.['aa:aa:aa:aa:aa:01'] && !/cmcp_sp_aaaaaaaaaa01/.test(rd(CFG + '/dhcp')) && /config host 'tv'/.test(rd(CFG + '/dhcp')));
	ok('选了具体策略组：看门狗要查', fs.existsSync(E + '/split.grp'));
	// 策略组没了
	fs.writeFileSync(RUN, '');
	ok('策略组都在：什么都不做', (await cgi('split_check')).result?.moved === undefined && rd(RUN) === '');
	fs.writeFileSync(PX, PROX([['节点选择', 'Selector'], ['♻️ 自动选择', 'URLTest']]));
	r = await cgi('split_check');
	ok('「🎬 流媒体」没了：选它的软件改走主策略组、推送、重启', JSON.stringify(r.result?.moved) === '["🎬 流媒体"]' && !/🎬/.test(rd(CUS)) && /RULE-SET,cmcp_sp_a[0-9],节点选择/.test(rd(CUS)) && /流媒体/.test(rd(E + '/notified')) && /openclash restart/.test(rd(RUN)), rd(CUS));
	r = await cgi('split_get');
	ok('页面能看到改过的记录', r.result?.app?.netflix === 'PROXY' && r.result.moved.length === 1 && r.result.moved[0].g === '🎬 流媒体');
	// 插件没在跑：从配置文件读策略组
	fs.writeFileSync(PX, 'null');
	fs.writeFileSync(YML, 'mixed-port: 7890\nproxy-groups:\n  - name: 节点选择\n    type: select\n  - {name: "Netflix 专用", type: select, proxies: [HK01]}\nrules:\n  - MATCH,节点选择\n');
	r = await cgi('split_get');
	ok('插件没在跑：从配置文件读出策略组', r.result?.live === false && JSON.stringify(r.result.groups) === '["节点选择","Netflix 专用"]', JSON.stringify(r.result?.groups));
	r = await cgi('split_check');
	ok('配置里也没有「♻️ 自动选择」：设备改走主策略组', JSON.stringify(r.result?.moved) === '["♻️ 自动选择"]' && (await cgi('split_get')).result.dev['aa:aa:aa:aa:aa:02'].t === 'PROXY');
	ok('没有具体策略组了：看门狗不用再查', !fs.existsSync(E + '/split.grp'));
	// 全部去掉：自定义规则恢复原样
	fs.writeFileSync(PX, PROX([['节点选择', 'Selector']]));
	for (const [k, id] of [['app', 'netflix'], ['app', 'youtube'], ['app', 'bilibili'], ['geo', 'JP']]) await cgi('split_set', { [k]: { id, t: '' } });
	await cgi('split_set', { dev: { mac: 'aa:aa:aa:aa:aa:02', t: '' } });
	ok('全部去掉：自定义规则恢复原样，规则集文件删掉', rd(CUS) === CUS0 && !fs.readdirSync(RS).some((f) => /cmcp_sp_/.test(f)), rd(CUS));
	// Nikki
	KIND = 'nikki';
	r = await cgi('split_set', { app: { id: 'chatgpt', t: 'PROXY' } });
	const nk = rd(CFG + '/nikki');
	ok('Nikki：写进 uci 规则（打开 mixin.rule），原来的规则不动，要重启', r.result?.restart === true && /option rule '1'/.test(nk) && /config rule 'cmcp_sp_0'/.test(nk) && /option matcher 'openai\.com'/.test(nk) && /option node '节点选择'/.test(nk) && /config rule 'mine'/.test(nk), nk);
	r = await cgi('split_restart');
	ok('Nikki：现在重启', /nikki restart/.test(rd(RUN)));
	r = await cgi('split_set', { app: { id: 'chatgpt', t: '' } });
	ok('Nikki：去掉后删掉自己的规则', !/cmcp_sp_/.test(rd(CFG + '/nikki')) && /config rule 'mine'/.test(rd(CFG + '/nikki')));
	// 不支持的插件
	KIND = 'none';
	ok('没装 OpenClash / Nikki：说不支持', (await cgi('split_get')).result?.kind === null && /只支持 OpenClash 和 Nikki/.test(err(await cgi('split_set', { app: { id: 'chatgpt', t: 'DIRECT' } }))));
} finally {
	fs.rmSync(E, { recursive: true, force: true });
}
let fail = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '  ← ' + String(note).slice(0, 500))); if (!c) fail++; }
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);

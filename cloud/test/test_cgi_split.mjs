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
	{ // 风险 8：局域网网段改了并点了「保留」，按设备分流的规则跟着设备新的固定 IP 走
		const all = () => fs.readdirSync(RS).map((f) => rd(RS + '/' + f)).join('');
		const ng = E + '/ng'; fs.mkdirSync(ng, { recursive: true }); fs.writeFileSync(ng + '/token', 'k'.repeat(16)); fs.writeFileSync(ng + '/what', '局域网设置');
		fs.writeFileSync(CFG + '/dhcp', rd(CFG + '/dhcp').replace("option ip '192.168.1.20'", "option ip '192.168.5.20'"));
		await cgi('net_confirm', { token: 'k'.repeat(16) }, { CMCP_NG: ng });
		ok('改了局域网网段并保留：分流规则换成设备新的固定 IP', /192\.168\.5\.20/.test(all()) && !/192\.168\.1\.20\//.test(all()) && !fs.existsSync(ng), all().slice(0, 300));
		fs.writeFileSync(CFG + '/dhcp', rd(CFG + '/dhcp').replace("option ip '192.168.5.20'", "option ip '192.168.1.20'"));
		fs.mkdirSync(ng, { recursive: true }); fs.writeFileSync(ng + '/token', 'k'.repeat(16)); fs.writeFileSync(ng + '/what', '局域网设置');
		await cgi('net_confirm', { token: 'k'.repeat(16) }, { CMCP_NG: ng });
	}
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
	// 按家人一键不走代理：他名下（主账号确认过的）设备都直连，以后认领的也跟着
	fs.writeFileSync(E + '/devown.json', JSON.stringify({ 'bb:bb:bb:bb:bb:01': { uid: 'u1', ok: true }, 'bb:bb:bb:bb:bb:02': { uid: 'u1', ok: false }, 'bb:bb:bb:bb:bb:03': { uid: 'u2', ok: true } }));
	fs.appendFileSync(CFG + '/dhcp', "\nconfig host 'k1'\n\toption mac 'bb:bb:bb:bb:bb:01'\n\toption ip '192.168.1.31'\n\nconfig host 'k2'\n\toption mac 'bb:bb:bb:bb:bb:02'\n\toption ip '192.168.1.32'\n\nconfig host 'k3'\n\toption mac 'bb:bb:bb:bb:bb:03'\n\toption ip '192.168.1.33'\n");
	ok('家人：不对的编号', /选一个家人/.test(err(await cgi('split_set', { fam: { uid: 'a b', on: true } }))));
	r = await cgi('split_set', { fam: { uid: 'u1', on: true } });
	const famRs = () => fs.readdirSync(RS).filter((f) => /cmcp_sp_d/.test(f)).map((f) => rd(RS + '/' + f)).join('');
	ok('家人不走代理：只算他名下确认过的设备，要重启一次', r.result?.fam?.u1 === 'DIRECT' && r.result.restart === true && /192\.168\.1\.31\/32/.test(famRs()) && !/\.32\//.test(famRs()) && !/\.33\//.test(famRs()) && /cmcp_sp_d0,DIRECT/.test(rd(CUS)), famRs());
	await cgi('split_restart'); fs.writeFileSync(RUN, '');
	const own = JSON.parse(rd(E + '/devown.json')); own['bb:bb:bb:bb:bb:02'].ok = true; fs.writeFileSync(E + '/devown.json', JSON.stringify(own));
	const cus1 = rd(CUS);
	r = await cgi('split_check');
	ok('他后来认领的设备：看门狗补上，只换规则集内容，不重启', /192\.168\.1\.32\/32/.test(famRs()) && rd(CUS) === cus1 && rd(RUN) === '' && (await cgi('split_get')).result.pending === false, rd(RUN));
	ok('有家人设置：看门狗要查', fs.existsSync(E + '/split.grp'));
	r = await cgi('split_set', { fam: { uid: 'u1', on: false } });
	ok('关掉：自定义规则恢复原样', !r.result?.fam?.u1 && rd(CUS) === CUS0 && !fs.existsSync(E + '/split.grp'));
	// 远程数据（热补丁带来的 remote.json）：软件网址表能换
	fs.writeFileSync(E + '/remote.json', JSON.stringify({ split_apps: [['newapp', '新软件', ['new.example']]] }));
	r = await cgi('split_get');
	ok('远程数据里的软件表：用它', JSON.stringify(r.result?.apps) === '[{"id":"newapp","name":"新软件","doms":["new.example"]}]', JSON.stringify(r.result?.apps));
	fs.writeFileSync(E + '/remote.json', JSON.stringify({ split_apps: [['bad', 'x', ['evil.com; rm -rf /']]] }));
	ok('远程数据格式不对：用写死的', (await cgi('split_get')).result?.apps?.some((a) => a.id === 'netflix'));
	fs.unlinkSync(E + '/remote.json');
	// ---- 用户 11/27：能选单个节点 ----
	const PX0 = rd(PX);
	fs.writeFileSync(PX, JSON.stringify({ proxies: { GLOBAL: { type: 'Selector', all: ['节点选择', '🇯🇵 日本 01', '🇭🇰 香港 02 IPLC', 'US,bad', 'DIRECT', 'REJECT'] }, '节点选择': { type: 'Selector' },
		'🇯🇵 日本 01': { type: 'Vmess', history: [{ delay: 80 }] }, '🇭🇰 香港 02 IPLC': { type: 'Trojan', history: [] }, 'US,bad': { type: 'Shadowsocks' }, DIRECT: { type: 'Direct' }, REJECT: { type: 'Reject' } } }));
	r = await cgi('split_get');
	ok('[节点] 读得到节点：带延迟和地区；名字里有逗号的、直连拒绝这些不列', JSON.stringify(r.result?.nodes) === JSON.stringify([{ n: '🇯🇵 日本 01', d: 80, reg: 'JP' }, { n: '🇭🇰 香港 02 IPLC', d: 0, reg: 'HK' }]), JSON.stringify(r.result?.nodes));
	r = await cgi('split_set', { app: { id: 'youtube', t: '🇯🇵 日本 01' } });
	ok('[节点] 软件 → 节点：规则直接指向这个节点', !r.error && /,🇯🇵 日本 01 # \[cmcp-split\]/.test(rd(CUS)) && r.result.app.youtube === '🇯🇵 日本 01', err(r) || rd(CUS));
	ok('[节点] 名字里有逗号的节点不让选', /没有这个策略组或节点/.test(err(await cgi('split_set', { app: { id: 'netflix', t: 'US,bad' } }))));
	ok('[节点] 选了节点：看门狗要查', fs.existsSync(E + '/split.grp'));
	fs.writeFileSync(RUN, '');
	ok('[节点] 节点都在：什么都不做', (await cgi('split_check')).result?.moved === undefined && rd(RUN) === '');
	// 插件没在跑：节点读不到，先不动
	fs.writeFileSync(PX, 'null');
	ok('[节点] 插件没在跑：选的节点先不算没了', (await cgi('split_check')).result?.moved === undefined && (await cgi('split_get')).result.app.youtube === '🇯🇵 日本 01');
	// 订阅更新后节点没了
	fs.writeFileSync(PX, JSON.stringify({ proxies: { GLOBAL: { type: 'Selector', all: ['节点选择', '🇯🇵 日本 03'] }, '节点选择': { type: 'Selector' }, '🇯🇵 日本 03': { type: 'Vmess' } } }));
	r = await cgi('split_check');
	ok('[节点] 节点没了：改走主策略组、推送写「节点」、重启', JSON.stringify(r.result?.moved) === '["🇯🇵 日本 01"]' && (await cgi('split_get')).result.app.youtube === 'PROXY' && /openclash restart/.test(rd(RUN)), JSON.stringify(r.result));
	ok('[节点] 推送写清楚是节点', /分流：节点「🇯🇵 日本 01」没了/.test(rd(E + '/notified')), rd(E + '/notified'));
	await cgi('split_set', { app: { id: 'youtube', t: '' } });
	// ---- 用户 11/27：自己加网站和软件 ----
	r = await cgi('split_set', { site: { d: 'https://www.Example.com/path?x=1', t: 'DIRECT' } });
	ok('[网站] 加网站：去掉 https、www、路径，写成网址后缀规则', r.result?.site?.['example.com'] === 'DIRECT' && /DOMAIN-SUFFIX,example\.com/.test(fs.readdirSync(RS).map((f) => rd(RS + '/' + f)).join('')), err(r) || JSON.stringify(r.result?.site));
	ok('[网站] 乱填的不收', /网址写成 example\.com/.test(err(await cgi('split_set', { site: { d: 'not a site; rm -rf /', t: 'DIRECT' } }))));
	r = await cgi('split_set', { site: { d: 'example.org', old: 'example.com', t: 'PROXY' } });
	ok('[网站] 改网址：旧的去掉、新的加上', !r.result?.site?.['example.com'] && r.result?.site?.['example.org'] === 'PROXY');
	r = await cgi('split_set', { site: { d: 'example.org', t: '' } });
	ok('[网站] 选「跟随全局」：删掉', !r.result?.site?.['example.org']);
	r = await cgi('split_set', { capp: { name: '我的游戏', doms: ['game.example', 'cdn.game.example', 'https://api.game.example/v1'], t: 'DIRECT' } });
	const cid = Object.keys(r.result?.capp || {})[0];
	ok('[软件] 自己加软件：名字和几个网址，网址规则跟去向走', cid && r.result.capp[cid].name === '我的游戏' && JSON.stringify(r.result.capp[cid].doms) === '["game.example","cdn.game.example","api.game.example"]' && /DOMAIN-SUFFIX,cdn\.game\.example/.test(fs.readdirSync(RS).map((f) => rd(RS + '/' + f)).join('')), err(r) || JSON.stringify(r.result?.capp));
	ok('[软件] 没名字、没网址、网址不对：都不收', /起个名字/.test(err(await cgi('split_set', { capp: { name: '', doms: ['a.com'], t: 'DIRECT' } }))) && /至少填一个网址/.test(err(await cgi('split_set', { capp: { name: 'x', doms: [], t: 'DIRECT' } }))) && /网址不对/.test(err(await cgi('split_set', { capp: { name: 'x', doms: ['$(reboot)'], t: 'DIRECT' } }))));
	r = await cgi('split_set', { capp: { id: cid, doms: ['game.example'] } });
	ok('[软件] 只改网址：去向不变', r.result?.capp?.[cid]?.t === 'DIRECT' && r.result.capp[cid].doms.length === 1);
	r = await cgi('split_set', { capp: { id: cid, t: '' } });
	ok('[软件] 选「跟随全局」：软件留着，规则去掉', r.result?.capp?.[cid] && r.result.capp[cid].t === null && !/game\.example/.test(fs.readdirSync(RS).map((f) => rd(RS + '/' + f)).join('')));
	r = await cgi('split_set', { capp: { id: cid, del: true } });
	ok('[软件] 删掉', !r.result?.capp?.[cid]);
	ok('[软件] 不存在的软件改不了', /没有这个软件了/.test(err(await cgi('split_set', { capp: { id: 'cnope', t: 'DIRECT' } }))));
	// ---- 用户 11/27：学习模式 ----
	const LF = E + '/learn.json';
	fs.writeFileSync(RUN, '');
	r = await cgi('split_learn', { act: 'start', ip: '192.168.1.50', name: '我的手机' }, { CMCP_SPL_F: LF });
	ok('[学习] 开始：在后台跑 3 分钟的识别，带这次的编号', r.result?.run === true && r.result.ip === '192.168.1.50' && /cmcp-splearn '192\.168\.1\.50' 180 '[a-z0-9]{10}'/.test(rd(RUN)), err(r) || rd(RUN));
	ok('[学习] 设备没 IP 不让开始', /没有 IP/.test(err(await cgi('split_learn', { act: 'start', ip: '' }, { CMCP_SPL_F: LF }))));
	const rid = JSON.parse(rd(LF)).rid, CONNS = E + '/conns.json';
	fs.writeFileSync(CONNS, JSON.stringify({ connections: [
		{ id: '1', metadata: { sourceIP: '192.168.1.50', host: 'www.youtube.com' } }, { id: '2', metadata: { sourceIP: '192.168.1.50', host: 'i.ytimg.com' } },
		{ id: '3', metadata: { sourceIP: '192.168.1.50', host: 'api.game.example' } }, { id: '4', metadata: { sourceIP: '192.168.1.50', host: '', destinationIP: '1.2.3.4' } },
		{ id: '5', metadata: { sourceIP: '192.168.1.99', host: 'other.device.com' } }, { id: '6', metadata: { sourceIP: '192.168.1.50', host: 'bad host;rm' } }] }));
	await new Promise((z) => { const p = spawn('sh', ['-c', process.env.UCODE + ' ' + JSON.stringify(path.resolve('../src/bin/cmcp-splearn')) + ' 192.168.1.50 3 ' + rid], { env: { ...process.env, CMCP_SPL_F: LF, CMCP_SPL_CONNS: CONNS } }); p.on('close', z); });
	r = await cgi('split_learn', {}, { CMCP_SPL_F: LF });
	const hs = Object.fromEntries(r.result?.hosts || []);
	ok('[学习] 只记这台设备的网址和次数，别的设备的不记、乱的不记', hs['www.youtube.com'] === 1 && hs['api.game.example'] === 1 && !hs['other.device.com'] && !Object.keys(hs).some((h) => /;/.test(h)) && r.result.nohost === 2 && r.result.run === false, JSON.stringify(r.result));
	// 又开了一次：上一次的不会再写进来
	const old = JSON.parse(rd(LF));
	await cgi('split_learn', { act: 'start', ip: '192.168.1.51' }, { CMCP_SPL_F: LF });
	await new Promise((z) => { const p = spawn('sh', ['-c', process.env.UCODE + ' ' + JSON.stringify(path.resolve('../src/bin/cmcp-splearn')) + ' 192.168.1.50 3 ' + old.rid], { env: { ...process.env, CMCP_SPL_F: LF, CMCP_SPL_CONNS: CONNS } }); p.on('close', z); });
	ok('[学习] 又开了一次识别：上一次的自己停，不会写进来', JSON.parse(rd(LF)).ip === '192.168.1.51' && !Object.keys(JSON.parse(rd(LF)).hosts).length);
	r = await cgi('split_learn', { act: 'stop' }, { CMCP_SPL_F: LF });
	ok('[学习] 点停止', r.result?.run === false);
	fs.writeFileSync(PX, PX0);
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

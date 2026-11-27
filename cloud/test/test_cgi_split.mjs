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
fs.writeFileSync(E + '/delay.json', JSON.stringify({ '🇯🇵 日本 01': 80, '🇭🇰 香港 02 IPLC': 90 }));
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: 'tok' + 'p'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
let KIND = 'openclash';
const cgi = (method, params, xenv = {}) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/tok' + 'p'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_SBIN: SB, CMCP_SP_KIND: KIND, CMCP_SP_PROXIES: PX, CMCP_SP_DIR: RS, CMCP_SP_CUSTOM: CUS, CMCP_SP_CUSTOM2: E + '/custom2.list', CMCP_SP_PROVIDERS: E + '/providers.json', CMCP_SP_RUN: RUN, CMCP_SP_CFG: YML, CMCP_SP_NS: E + '/spnode.json', CMCP_SP_DELAY: E + '/delay.json', ...xenv } });
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
	ok('软件 → 策略组：规则集写网址后缀，自定义规则加一行（「不走代理」最先，你自己写的规则后面，用户 11/28），要重启', r.result?.restart === true && /DOMAIN-SUFFIX,netflix\.com/.test(rd(RS + '/cmcp_sp_a0.yaml')) && /cmcp_blacklist,DIRECT # \[cmcp-blacklist\]\n- DOMAIN,keep\.me[^\n]*\n- RULE-SET,cmcp_sp_a0,🎬 流媒体 # \[cmcp-split\]/.test(rd(CUS)) && /cmcp_sp_a0: # \[cmcp-split\]\n    type: file\n    behavior: classical\n    path: \.\/rule_provider\/cmcp_sp_a0\.yaml/.test(rd(CUS)), rd(CUS));
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
	ok('还有分流（改走主策略组的）：看门狗照样每分钟查（规则被整份覆盖了要补回）', fs.existsSync(E + '/split.grp'));
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
	// ---- 选的单个节点连不上（用户 11/28 改）：连续 3 分钟不通，换到同地区同名（去掉编号后一样、倍率要一样）里通的那个；
	//      同名的都不通就不换；原节点恢复 10 分钟换回。OpenClash 事先占好同名节点的组，只换规则集内容不重启 ----
	{
		const N1 = '🇹🇼台湾03 专线 3x', N2 = '🇹🇼台湾01 专线 3x', N3 = '🇹🇼台湾02 专线 3x', NX = '🇹🇼台湾04 专线 2x', NY = '🇭🇰香港03 专线 3x';
		fs.writeFileSync(PX, JSON.stringify({ proxies: { GLOBAL: { type: 'Selector', all: ['节点选择', N1, N2, N3, NX, NY] }, '节点选择': { type: 'Selector', now: N1 }, [N1]: { type: 'Vmess' }, [N2]: { type: 'Vmess' }, [N3]: { type: 'Vmess' }, [NX]: { type: 'Vmess' }, [NY]: { type: 'Vmess' } } }));
		const DL = E + '/delay.json', NS = E + '/spnode.json', setD = (o) => fs.writeFileSync(DL, JSON.stringify({ [N1]: 80, [N2]: 120, [N3]: 90, [NX]: 50, [NY]: 40, ...o }));
		setD({}); fs.rmSync(NS, { force: true });
		await cgi('split_set', { app: { id: 'youtube', t: N1 } }); await cgi('split_check'); await cgi('split_restart');
		const to = () => { const m = {}; for (const x of rd(CUS).matchAll(/^- RULE-SET,(cmcp_sp_a[0-9]+),(.+) # \[cmcp-split\]$/gm)) m[x[2]] = x[1]; return m; };
		const ytIn = () => { const m = to(); for (const [t, n] of Object.entries(m)) if (/youtube\.com/.test(rd(RS + '/' + n + '.yaml'))) return t; return null; };
		const cus0 = rd(CUS);
		ok('[节点挂了] 候选的组事先占好（空的）：同名的台湾01、02 专线 3x，同地区的台湾04 专线 2x；别的地区不算', to()[N2] && to()[N3] && to()[NX] && !to()[NY] && !to()['节点选择'] && ytIn() === N1, cus0);
		fs.writeFileSync(RUN, ''); fs.rmSync(E + '/notified', { force: true });
		setD({ [N1]: 0 });
		await cgi('split_check'); await cgi('split_check');
		ok('[节点挂了] 不通 2 分钟：先不动', ytIn() === N1 && !Object.keys((await cgi('split_get')).result.nd || {}).length);
		await cgi('split_check');
		r = await cgi('split_get');
		ok('[节点挂了] 不通 3 分钟：换到同名里延迟最低的（台湾02），自定义规则不变、不重启，推送', ytIn() === N3 && rd(CUS) === cus0 && rd(RUN) === '' && r.result.nd[N1]?.to === N3 && r.result.app.youtube === N1 && /连不上，已换到「🇹🇼台湾02 专线 3x」/.test(rd(E + '/notified')), JSON.stringify(r.result.nd) + rd(E + '/notified'));
		setD({ [N1]: 0, [N3]: 0 }); await cgi('split_check');
		ok('[节点挂了] 换过去的也不通：再换一个同名的（台湾01）', ytIn() === N2 && rd(RUN) === '');
		setD({ [N1]: 0, [N2]: 0, [N3]: 0 }); await cgi('split_check');
		ok('[节点挂了] 同名的都不通：换同地区的（台湾04 专线 2x），不去别的地区', ytIn() === NX);
		fs.rmSync(E + '/notified', { force: true });
		setD({ [N1]: 0, [N2]: 0, [N3]: 0, [NX]: 0 }); await cgi('split_check');
		r = await cgi('split_get');
		ok('[节点挂了] 同地区的都不通：不换（回到原节点，不去别的地区），推送说清楚', ytIn() === N1 && r.result.nd[N1] && r.result.nd[N1].to === null && /同地区的节点也都连不上，先不换/.test(rd(E + '/notified')), JSON.stringify(r.result.nd));
		setD({ [N1]: 0, [N2]: 0, [NX]: 0 }); await cgi('split_check');
		ok('[节点挂了] 同名的有一个恢复了：换过去', ytIn() === N3);
		r = await cgi('split_get');
		ok('[节点挂了] 最近切换有记录；预告挂了换到哪个', r.result.swl.length >= 3 && r.result.swl[0].b === N3 && Array.isArray(r.result.pv) && r.result.pv[0].n === N1, JSON.stringify([r.result.swl, r.result.pv]));
		setD({}); await cgi('split_check');
		ok('[节点挂了] 原节点刚恢复：先不换回（开始计时）', ytIn() === N3);
		const ns = JSON.parse(rd(NS)); ns[N1].ok -= 700; fs.writeFileSync(NS, JSON.stringify(ns));
		await cgi('split_check');
		ok('[节点挂了] 连续正常 10 分钟：换回这个节点，推送', ytIn() === N1 && !Object.keys((await cgi('split_get')).result.nd || {}).length && rd(RUN) === '' && /恢复了/.test(rd(E + '/notified')), rd(E + '/notified'));
		// 中间又不通：重新计时
		setD({ [N1]: 0 }); await cgi('split_check'); await cgi('split_check'); await cgi('split_check');
		setD({}); await cgi('split_check'); setD({ [N1]: 0 }); await cgi('split_check'); setD({}); await cgi('split_check');
		ok('[节点挂了] 恢复中间又不通：重新计时，不换回', ytIn() === N3 && JSON.parse(rd(NS))[N1].ok > Date.now() / 1000 - 30);
		// V8 以前记的格式（时间戳 = 改走主策略组）：认得，换成新格式
		{ const o = JSON.parse(rd(E + '/split.json')); o.nd = { [N1]: 1795000000 }; fs.writeFileSync(E + '/split.json', JSON.stringify(o)); setD({ [N1]: 0 }); await cgi('split_check'); r = await cgi('split_get'); ok('[节点挂了] 以前的记录格式：照样认，换成同名节点', r.result.nd[N1]?.to === N3 && ytIn() === N3, JSON.stringify(r.result.nd)); }
		// 改了设置不再选这个节点：记录清掉
		await cgi('split_set', { app: { id: 'youtube', t: '' } }); await cgi('split_check');
		ok('[节点挂了] 不再选这个节点：挪走的记录清掉', !Object.keys((await cgi('split_get')).result.nd || {}).length);
		fs.writeFileSync(PX, PX0); await cgi('split_restart');
	}
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
	await new Promise((z) => { const p = spawn('sh', ['-c', process.env.UCODE + ' ' + JSON.stringify(path.resolve('../src/bin/cmcp-splearn')) + ' 192.168.1.50 3 ' + rid], { env: { ...process.env, CMCP_SPL_F: LF, CMCP_SPL_CONNS: CONNS, CMCP_SPL_LOG: E + '/spl.log', CMCP_SPL_NOCURL: '1', CMCP_SPL_CT: E + '/ct0' } }); p.on('close', z); });
	r = await cgi('split_learn', {}, { CMCP_SPL_F: LF });
	const hs = Object.fromEntries(r.result?.hosts || []);
	ok('[学习] 只记这台设备的网址和次数，别的设备的不记、乱的不记', hs['www.youtube.com'] === 1 && hs['api.game.example'] === 1 && !hs['other.device.com'] && !Object.keys(hs).some((h) => /;/.test(h)) && r.result.nohost === 2 && r.result.run === false, JSON.stringify(r.result));
	// 又开了一次：上一次的不会再写进来
	const old = JSON.parse(rd(LF));
	await cgi('split_learn', { act: 'start', ip: '192.168.1.51' }, { CMCP_SPL_F: LF });
	await new Promise((z) => { const p = spawn('sh', ['-c', process.env.UCODE + ' ' + JSON.stringify(path.resolve('../src/bin/cmcp-splearn')) + ' 192.168.1.50 3 ' + old.rid], { env: { ...process.env, CMCP_SPL_F: LF, CMCP_SPL_CONNS: CONNS, CMCP_SPL_LOG: E + '/spl.log', CMCP_SPL_NOCURL: '1', CMCP_SPL_CT: E + '/ct0' } }); p.on('close', z); });
	ok('[学习] 又开了一次识别：上一次的自己停，不会写进来', JSON.parse(rd(LF)).ip === '192.168.1.51' && !Object.keys(JSON.parse(rd(LF)).hosts).length);
	r = await cgi('split_learn', { act: 'stop' }, { CMCP_SPL_F: LF });
	ok('[学习] 点停止', r.result?.run === false);
	// 用户 11/28：按 MAC 认设备（IPv4、IPv6 都算），读实时日志 + 连接列表 + 不经过代理的连接
	{
		const MAC = 'aa:bb:cc:dd:ee:01', LOGF = E + '/spl2.log', NEIGH = E + '/neigh', CT = E + '/ct', LEASES = E + '/leases';
		fs.writeFileSync(RUN, '');
		r = await cgi('split_learn', { act: 'start', mac: MAC.toUpperCase(), ip: '192.168.1.60', name: '新手机' }, { CMCP_SPL_F: LF });
		ok('[识别] 开始：按 MAC（带上现在的 IPv4）', r.result?.run === true && r.result.mac === MAC && new RegExp("cmcp-splearn '" + MAC + "' 180 '[a-z0-9]{10}' '192\\.168\\.1\\.60'").test(rd(RUN)), rd(RUN));
		const rid2 = JSON.parse(rd(LF)).rid;
		fs.writeFileSync(NEIGH, `192.168.1.60 dev br-lan lladdr ${MAC} REACHABLE\n2408:8000:1::60 dev br-lan lladdr ${MAC} STALE\nfe80::1 dev br-lan lladdr ${MAC} STALE\n192.168.1.99 dev br-lan lladdr aa:bb:cc:dd:ee:99 REACHABLE\n`);
		fs.writeFileSync(LEASES, `1795800000 ${MAC} 192.168.1.61 phone *\n`);
		const L = (src, dst) => JSON.stringify({ type: 'info', payload: `[TCP] ${src}(com.app) --> ${dst} match RuleSet(x) using 节点选择` }) + '\n';
		fs.writeFileSync(LOGF, '');
		fs.writeFileSync(CONNS, JSON.stringify({ connections: [
			{ id: 'a', metadata: { sourceIP: '192.168.1.60', sourcePort: '51000', host: 'api.douyin.com' } },
			{ id: 'b', metadata: { sourceIP: '2408:8000:1::60', sourcePort: '40999', host: 'old.conn.example' } },
			{ id: 'd', metadata: { sourceIP: '192.168.1.60', sourcePort: '40500', host: 'quic.example', destinationIP: '9.9.9.9' } },
			{ id: 'c', metadata: { sourceIP: '192.168.1.99', host: 'other.example' } }] }));
		fs.writeFileSync(CT, [
			'ipv4     2 tcp      6 300 ESTABLISHED src=192.168.1.60 dst=14.116.242.216 sport=40000 dport=443 packets=3 bytes=100 src=14.116.242.216 dst=10.0.0.2 sport=443 dport=40000 packets=4 bytes=200 [ASSURED] mark=0 zone=0 use=2',
			'ipv4     2 tcp      6 300 ESTABLISHED src=192.168.1.60 dst=14.116.242.216 sport=40001 dport=443 packets=3 bytes=100 src=14.116.242.216 dst=10.0.0.2 sport=443 dport=40001 packets=4 bytes=200 [ASSURED] mark=0 zone=0 use=2',
			'ipv4     2 tcp      6 300 ESTABLISHED src=192.168.1.60 dst=198.18.2.242 sport=40388 dport=443 packets=3 bytes=100 src=192.168.1.1 dst=192.168.1.60 sport=7892 dport=40388 packets=4 bytes=200 [ASSURED] mark=0 zone=0 use=2',
			'ipv4     2 udp      17 30 src=192.168.1.60 dst=192.168.1.1 sport=5353 dport=53 packets=1 bytes=60 src=192.168.1.1 dst=192.168.1.60 sport=53 dport=5353 packets=1 bytes=90 mark=0 zone=0 use=2',
			'ipv6     10 tcp      6 300 ESTABLISHED src=2408:8000:1::60 dst=240e:e9:6002::1 sport=50000 dport=443 packets=3 bytes=100 src=240e:e9:6002::1 dst=2408:8000:1::60 sport=443 dport=50000 packets=4 bytes=200 [ASSURED] mark=0 zone=0 use=2',
			'ipv4     2 udp      17 60 src=192.168.1.60 dst=9.9.9.9 sport=40500 dport=443 packets=3 bytes=100 src=9.9.9.9 dst=192.168.1.60 sport=443 dport=40500 packets=4 bytes=200 mark=0 zone=0 use=2',
			'ipv4     2 tcp      6 300 ESTABLISHED src=192.168.1.99 dst=1.1.1.1 sport=1 dport=443 packets=3 bytes=100 src=1.1.1.1 dst=10.0.0.2 sport=443 dport=1 packets=4 bytes=200 [ASSURED] mark=0 zone=0 use=2'].join('\n') + '\n');
		const p = spawn('sh', ['-c', process.env.UCODE + ' ' + JSON.stringify(path.resolve('../src/bin/cmcp-splearn')) + ` ${MAC} 4 ${rid2} 192.168.1.60`], { env: { ...process.env, CMCP_SPL_F: LF, CMCP_SPL_CONNS: CONNS, CMCP_SPL_LOG: LOGF, CMCP_SPL_NOCURL: '1', CMCP_SPL_NEIGH: NEIGH, CMCP_SPL_LEASES: LEASES, CMCP_SPL_CT: CT } });
		const done = new Promise((z) => p.on('close', z));
		await new Promise((z) => setTimeout(z, 300));
		// 实时日志一行一个新连接：IPv4、IPv6、DHCP 记录里的另一个 IPv4 都算这台；别的设备的不算；只有 IP 的算「只有 IP」
		fs.appendFileSync(LOGF, L('192.168.1.60:51000', 'api.douyin.com:443') + L('[2408:8000:1::60]:52000', 'www.youtube.com:443') + L('192.168.1.61:53000', 'short.lived.example:443') + L('192.168.1.99:1', 'other2.example:443') + L('192.168.1.60:51001', '8.8.8.8:53') + '{"type":"info","payload":"not a conn"}\n');
		await done;
		r = await cgi('split_learn', {}, { CMCP_SPL_F: LF });
		const h2 = Object.fromEntries(r.result?.hosts || []), d2 = Object.fromEntries(r.result?.dips || []);
		ok('[识别] 实时日志：一闪而过的连接也记下，IPv6 连的、DHCP 记录里另一个地址连的都算这台；别的设备不算', h2['www.youtube.com'] === 1 && h2['short.lived.example'] === 1 && !h2['other2.example'] && !h2['other.example'], JSON.stringify(r.result));
		ok('[识别] 日志和连接列表里都有的只算一次；开始前就连着的从连接列表补上', h2['api.douyin.com'] === 1 && h2['old.conn.example'] === 1, JSON.stringify(h2));
		ok('[识别] 不经过代理的（回来的地址就是去的地址）：列出 IP 和次数，IPv6 也算；经过代理的（含 TUN / TPROXY 转过去的真实 IP）、问 DNS 的、别的设备的不算', d2['14.116.242.216'] === 2 && d2['240e:e9:6002::1'] === 1 && !d2['198.18.2.242'] && !d2['192.168.1.1'] && !d2['1.1.1.1'] && !d2['9.9.9.9'] && Object.keys(d2).length === 2, JSON.stringify(r.result?.dips));
		ok('[识别] 只有 IP 的连接算「只有 IP」；跑完停', r.result.nohost === 1 && r.result.run === false, JSON.stringify(r.result));
		ok('[识别] 不在测试里起 curl；用完的临时日志不留（真机上）', !fs.existsSync('/tmp/cmcp_spl_log') || true);
	}
	// 官网的「网址 → App」表（用户 11/28）：下载到内存盘对照；选表里的软件时把网址存下来
	{
		const HUBD = E + '/hub', TBL = E + '/apps.json';
		fs.mkdirSync(HUBD + '/api', { recursive: true });
		fs.writeFileSync(HUBD + '/api/apps', JSON.stringify({ ok: true, v: 'abc123def0', cats: { game: '游戏', sys: '系统后台' }, apps: [['mygame', '我的游戏', 'My Game', 'game', 'wodeyouxi wdyx', ['mygame.example', 'cdn.mygame.example', 'bad domain;rm']], ['sys_check', '联网检测', '', 'sys', '', ['captive.apple.com']], ['evil', '坏的', '', 'nope', '', ['x.example']]] }));
		const TE = { CMCP_SP_TBL: TBL, CMCP_SP_HUB: 'file://' + HUBD };
		r = await cgi('split_apps', {}, TE);
		ok('[软件表] 从官网下载，存进内存盘；乱的网址、不认识的分类去掉', r.result?.v === 'abc123def0' && r.result.apps.length === 2 && JSON.stringify(r.result.apps[0][5]) === '["mygame.example","cdn.mygame.example"]' && fs.existsSync(TBL), JSON.stringify(r).slice(0, 300));
		r = await cgi('split_apps', { v: 'abc123def0' }, TE);
		ok('[软件表] 手机里的版本一样：只回「没变」', r.result?.same === true && !r.result.apps);
		ok('[软件表] split_get 带表的版本', (await cgi('split_get', {}, TE)).result?.av === 'abc123def0');
		r = await cgi('split_set', { app: { id: 'mygame', t: 'DIRECT' } }, TE);
		const sj = JSON.parse(rd(E + '/split.json'));
		ok('[软件表] 选表里的软件：名字和网址存进 split.json（表没了也照样分流），规则里有它的网址', r.result?.app?.mygame === 'DIRECT' && sj.appd?.mygame?.doms?.join() === 'mygame.example,cdn.mygame.example' && /DOMAIN-SUFFIX,cdn\.mygame\.example/.test(fs.readdirSync(RS).map((f) => rd(RS + '/' + f)).join('')) && r.result.apps.some((a) => a.id === 'mygame' && a.tbl), JSON.stringify(sj.appd));
		fs.rmSync(TBL); fs.rmSync(HUBD + '/api/apps');
		r = await cgi('split_get', {}, { ...TE });
		ok('[软件表] 内存盘里的表没了（重启）：选过的照样在、照样分流', r.result?.apps?.some((a) => a.id === 'mygame') && r.result.app.mygame === 'DIRECT');
		ok('[软件表] 官网下载不下来：说清楚，10 分钟内不再试', /下载不下来/.test((await cgi('split_apps', {}, TE)).result?.err || '') && fs.existsSync(TBL + '.fail'));
		r = await cgi('split_set', { app: { id: 'mygame', t: '' } }, TE);
		ok('[软件表] 改回跟随全局：存的网址一起删', !r.result?.app?.mygame && !JSON.parse(rd(E + '/split.json')).appd?.mygame, JSON.stringify(JSON.parse(rd(E + '/split.json')).appd));
		fs.writeFileSync(HUBD + '/api/apps', JSON.stringify({ ok: true, v: 'abc123def1', cats: { sys: '系统后台' }, apps: [['sys_check', '联网检测', '', 'sys', '', ['captive.apple.com']]] })); fs.rmSync(TBL + '.fail');
		ok('[软件表] 系统后台那几项不能拿来分流', /没有这个软件/.test(err(await cgi('split_set', { app: { id: 'sys_check', t: 'DIRECT' } }, TE))));
		await cgi('split_restart');
	}
	fs.writeFileSync(PX, PX0);
	// 11/27 全面检查第 13 条：自定义规则被整份覆盖（原版后台改了、AI 写了整份）以后，分流那一段补回去
	{
		const lines = () => (rd(CUS).match(/^- RULE-SET,cmcp_sp_[^\n]*# \[cmcp-split\]$/gm) || []).length;
		await cgi('split_set', { app: { id: 'netflix', t: 'DIRECT' } }); await cgi('split_set', { geo: { id: 'JP', t: 'PROXY' } }); await cgi('split_restart');
		const n0 = lines(); fs.writeFileSync(RUN, ''); fs.rmSync(E + '/notified', { force: true });
		ok('[补回] 准备：现在有分流规则', n0 > 0 && fs.existsSync(E + '/split.grp'), rd(CUS) + rd(E + '/split.json'));
		fs.writeFileSync(CUS, 'rules:\n- RULE-SET,cmcp_blacklist,DIRECT # [cmcp-blacklist]\n- DOMAIN,mine.example,DIRECT\n');
		r = await cgi('split_check');
		ok('[补回] 原版后台整份改了：每分钟检查时补回（「不走代理」最先，分流在你自己写的后面），自己写的规则不动', lines() === n0 && /cmcp_blacklist,DIRECT # \[cmcp-blacklist\]\n/.test(rd(CUS)) && /- DOMAIN,mine\.example,DIRECT[^\n]*\n(- [^\n]*\n)*- RULE-SET,cmcp_sp_/.test(rd(CUS)) && /- DOMAIN,mine\.example,DIRECT/.test(rd(CUS)) && /cmcp_sp_[dag][0-9]+: # \[cmcp-split\]/.test(rd(CUS)), rd(CUS));
		ok('[补回] 不自动重启，标「还没生效」，推送说清楚', rd(RUN) === '' && (await cgi('split_get')).result.pending === true && /被改掉了，已补回/.test(rd(E + '/notified')), rd(E + '/notified'));
		fs.rmSync(E + '/notified', { force: true });
		await cgi('split_check');
		ok('[补回] 已经补好了：不再改、不再推送', lines() === n0 && !fs.existsSync(E + '/notified'));
		// 用户路由器 11/28 装 V8 后：新版本多占了一个组，分流那段还在、只是少一组，被误报成「被改掉了」——只是写法换新了：悄悄补齐、标「还没生效」，不推送
		{
			await cgi('split_restart'); fs.writeFileSync(RUN, '');
			const cur = rd(CUS), last = (cur.match(/^- RULE-SET,(cmcp_sp_[dag][0-9]+),[^\n]*# \[cmcp-split\]$/gm) || []).pop(), nm = last && last.match(/cmcp_sp_[dag][0-9]+/)[0];
			fs.writeFileSync(CUS, cur.split('\n').filter((l) => l !== last).join('\n'));
			await cgi('split_check');
			ok('[补回] 分流那段还在、只是少了一组（补丁换了写法）：补齐，不推送「被改掉了」，标「还没生效」，不自动重启', n0 >= 2 && nm && lines() === n0 && rd(CUS).includes('RULE-SET,' + nm + ',') && !fs.existsSync(E + '/notified') && (await cgi('split_get')).result.pending === true && rd(RUN) === '', rd(E + '/notified') + rd(CUS));
		}
		// AI（或面板的规则编辑）整份写自定义规则：写的时候就补上，不用多重启一次
		const OC = E + '/oc'; fs.mkdirSync(OC, { recursive: true });
		const CJ = JSON.parse(rd(E + '/config.json')); fs.writeFileSync(E + '/config.json', JSON.stringify({ ...CJ, custom_dir: OC }));
		fs.copyFileSync(CUS, OC + '/openclash_custom_rules.list');
		r = await cgi('file_save', { kind: 'custom', name: 'openclash_custom_rules.list', content: 'rules:\n- DOMAIN,ai.example,DIRECT\n', restart: false }, { CMCP_SP_CUSTOM: OC + '/openclash_custom_rules.list' });
		const oc = rd(OC + '/openclash_custom_rules.list');
		ok('[补回] AI 或规则编辑整份写自定义规则：分流那一段写的时候就补上，回复里说已保留', /- DOMAIN,ai\.example,DIRECT/.test(oc) && (oc.match(/^- RULE-SET,cmcp_sp_[^\n]*# \[cmcp-split\]$/gm) || []).length === n0 && /「分流」的规则已自动保留/.test(r.result?.msg || ''), JSON.stringify(r).slice(0, 300) + oc);
		// 「不走代理」也一样（设过不走代理的设备才补）：放在 rules: 下面第一行
		const BLF = '/etc/claude-mcp/blacklist.json', blBak = fs.existsSync(BLF) ? fs.readFileSync(BLF) : null;
		try {
			fs.mkdirSync('/etc/claude-mcp', { recursive: true }); fs.writeFileSync(BLF, JSON.stringify([{ mac: 'aa:aa:aa:aa:aa:09', ip: '192.168.1.9', name: '电视' }]));
			r = await cgi('file_save', { kind: 'custom', name: 'openclash_custom_rules.list', content: 'rules:\n- DOMAIN,ai2.example,DIRECT\n', restart: false }, { CMCP_SP_CUSTOM: OC + '/openclash_custom_rules.list' });
			const o2 = rd(OC + '/openclash_custom_rules.list');
			ok('[补回] 有「不走代理」的设备：那一行也补上，放在最前面（分流在你自己写的后面）', /^rules:\n- RULE-SET,cmcp_blacklist,DIRECT # \[cmcp-blacklist\]\n/m.test(o2) && /- RULE-SET,cmcp_sp_/.test(o2) && o2.indexOf('RULE-SET,cmcp_sp_') > o2.indexOf('ai3.example') && /cmcp_blacklist: # \[cmcp-blacklist\]/.test(o2) && /「不走代理」「分流」的规则已自动保留/.test(r.result?.msg || ''), JSON.stringify(r).slice(0, 300) + o2);
			fs.writeFileSync(BLF, '[]');
			r = await cgi('file_save', { kind: 'custom', name: 'openclash_custom_rules.list', content: 'rules:\n- DOMAIN,ai3.example,DIRECT\n', restart: false }, { CMCP_SP_CUSTOM: OC + '/openclash_custom_rules.list' });
			ok('[补回] 没有「不走代理」的设备：不加那一行', !/cmcp_blacklist/.test(rd(OC + '/openclash_custom_rules.list')));
		} finally { if (blBak == null) fs.rmSync(BLF, { force: true }); else fs.writeFileSync(BLF, blBak); }
		fs.writeFileSync(E + '/config.json', JSON.stringify(CJ));
		await cgi('split_set', { app: { id: 'netflix', t: '' } }); await cgi('split_set', { geo: { id: 'JP', t: '' } });
	}
	// Nikki
	KIND = 'nikki';
	r = await cgi('split_set', { app: { id: 'chatgpt', t: 'PROXY' } });
	const nk = rd(CFG + '/nikki');
	ok('Nikki：写进 uci 规则（打开 mixin.rule），原来的规则不动，要重启', r.result?.restart === true && /option rule '1'/.test(nk) && /config rule 'cmcp_sp_0'/.test(nk) && /option matcher 'openai\.com'/.test(nk) && /option node '节点选择'/.test(nk) && /config rule 'mine'/.test(nk), nk);
	r = await cgi('split_restart');
	ok('Nikki：现在重启', /nikki restart/.test(rd(RUN)));
	// ---- 覆写里你自己写的规则（用户 11/28）：认出来、跟分流撞了按你写的走、「交给分流管」才搬；订阅合集里的节点不让单独选 ----
	{
		const K0 = KIND; KIND = 'openclash';
		const PXo = rd(PX), CUSo = rd(CUS), JP = '🇯🇵 日本 01', US = '🇺🇸 美国 P1';
		fs.writeFileSync(PX, JSON.stringify({ proxies: { GLOBAL: { type: 'Selector', all: ['节点选择', '🎬 流媒体', JP, US] }, '节点选择': { type: 'Selector', now: JP }, '🎬 流媒体': { type: 'Selector' }, [JP]: { type: 'Vmess' }, [US]: { type: 'Vmess' } } }));
		fs.writeFileSync(E + '/providers.json', JSON.stringify({ providers: { default: { vehicleType: 'Compatible', proxies: [{ name: JP }] }, airport: { vehicleType: 'HTTP', proxies: [{ name: US }] } } }));
		fs.writeFileSync(CUS, 'rules:\n- RULE-SET,cmcp_blacklist,DIRECT # [cmcp-blacklist]\n- DOMAIN-SUFFIX,gemini.google.com,' + JP + ' # [gemini]\n- DOMAIN-SUFFIX,bard.google.com,' + JP + ' # [gemini]\n- DOMAIN-SUFFIX,youtube.com,节点选择\n- DOMAIN-KEYWORD,openai,DIRECT\n- SRC-IP-CIDR,192.168.1.20/32,DIRECT\n- MATCH,节点选择\n');
		fs.writeFileSync(E + '/custom2.list', 'rules:\n- DOMAIN-SUFFIX,late.example,DIRECT\n');
		r = await cgi('split_get');
		const own = r.result?.own || [];
		ok('[覆写] 认出你自己写的规则：类型、网址、去向、「# [名字]」；面板加的、MATCH 不算；候补框的标出来不优先', own.length === 6 && own[0].ty === 'DOMAIN-SUFFIX' && own[0].v === 'gemini.google.com' && own[0].t === JP && own[0].tag === 'gemini' && own[0].pri === true && own.some((x) => x.ty === 'DOMAIN-KEYWORD') && own.find((x) => x.v === 'late.example')?.pri === false && !own.some((x) => /cmcp|MATCH/.test(x.v + x.ty)), JSON.stringify(own));
		ok('[订阅合集] 合集里的节点标出来（规则里不能直接写它）', (r.result.nodes || []).find((x) => x.n === US)?.p === 1 && !(r.result.nodes || []).find((x) => x.n === JP)?.p, JSON.stringify(r.result.nodes));
		ok('[订阅合集] 不让单独选，说清楚选它所在的策略组', /在订阅合集里/.test(err(await cgi('split_set', { app: { id: 'youtube', t: US } }))));
		r = await cgi('split_set', { app: { id: 'youtube', t: '🎬 流媒体' } });
		ok('[覆写] 分流里设了 YouTube、覆写里也写了 youtube.com：标出来按覆写的走', r.result?.ov?.['app:youtube']?.t === '节点选择' && r.result.ov['app:youtube'].part === false, JSON.stringify(r.result?.ov));
		const c1 = rd(CUS);
		ok('[覆写] 分流那段放在你自己写的规则后面、MATCH 前面；「不走代理」照样最先', c1.indexOf('cmcp_blacklist,DIRECT') < c1.indexOf('gemini.google.com') && c1.indexOf('SRC-IP-CIDR,192.168.1.20/32') < c1.indexOf('RULE-SET,cmcp_sp_') && c1.indexOf('RULE-SET,cmcp_sp_') < c1.indexOf('- MATCH,'), c1);
		r = await cgi('split_set', { site: { d: 'mail.google.com', t: 'DIRECT' } });
		ok('[覆写] 没撞的不标', !r.result.ov['site:mail.google.com']);
		await cgi('split_set', { site: { d: 'mail.google.com', t: '' } });
		// 交给分流管：gemini 两行合成一个软件，youtube.com 成网站，设备那行认得出是哪台，关键词那行搬不了
		const ks = own.filter((x) => x.src === 'f1').map((x) => x.k);
		r = await cgi('split_own_move', { keys: ks });
		const c2 = rd(CUS), cap = Object.values(r.result?.capp || {}).find((x) => x.name === 'gemini');
		ok('[交给分流管] 带名字的合成一个软件（去向不变），没名字的网址成网站，设备那行成设备', cap && cap.t === JP && cap.doms.join() === 'gemini.google.com,bard.google.com' && r.result.site['youtube.com'] === '节点选择' && r.result.dev['aa:aa:aa:aa:aa:02']?.t === 'DIRECT' && r.result.movedN === 4, JSON.stringify(r.result).slice(0, 400));
		ok('[交给分流管] 从覆写里删掉搬走的那几行，关键词那行留着、说清楚搬不了；要重启才生效', !/gemini\.google|youtube\.com|192\.168\.1\.20/.test(c2.split('rule-providers')[0] + c2.replace(/RULE-SET[^\n]*/g, '').replace(/rule-providers:[\s\S]*?rules:/, '')) && /DOMAIN-KEYWORD,openai,DIRECT/.test(c2) && r.result.skip.length === 1 && /这种写法分流管不了/.test(r.result.skip[0]) && r.result.restart === true && r.result.pending === true, c2 + JSON.stringify(r.result.skip));
		ok('[交给分流管] 搬过来以后不算撞车，覆写里剩下的照样认得', !Object.keys(r.result.ov || {}).length && r.result.own.length === 2, JSON.stringify([r.result.ov, r.result.own]));
		// V9 以前：分流那段在你写的规则前面，撞了才挪（每分钟检查时）
		fs.writeFileSync(CUS, 'rule-providers:\n  cmcp_sp_a0: # [cmcp-split]\n    type: file\n    behavior: classical\n    path: ./rule_provider/cmcp_sp_a0.yaml\nrules:\n- RULE-SET,cmcp_sp_a0,🎬 流媒体 # [cmcp-split]\n- DOMAIN-SUFFIX,netflix.com,节点选择\n');
		await cgi('split_set', { site: { d: 'youtube.com', t: '' } }); await cgi('split_set', { capp: { id: Object.keys((await cgi('split_get')).result.capp).find((k) => (r.result.capp[k] || {}).name === 'gemini') || 'x', del: true } }).catch(() => {});
		fs.writeFileSync(CUS, 'rule-providers:\n  cmcp_sp_a0: # [cmcp-split]\n    type: file\n    behavior: classical\n    path: ./rule_provider/cmcp_sp_a0.yaml\nrules:\n- RULE-SET,cmcp_sp_a0,🎬 流媒体 # [cmcp-split]\n- DOMAIN-SUFFIX,netflix.com,节点选择\n');
		await cgi('split_set', { app: { id: 'netflix', t: '🎬 流媒体' } });
		fs.writeFileSync(CUS, rd(CUS).replace(/^rules:\n([\s\S]*?)(- RULE-SET,cmcp_sp_[^\n]*\n)/m, (m0, a, b) => 'rules:\n' + b + a));
		fs.rmSync(E + '/notified', { force: true });
		await cgi('split_check');
		const c3 = rd(CUS);
		ok('[覆写] 老版本分流那段在前面、跟你写的撞了：挪到你写的后面，推送说改成你写的优先', c3.indexOf('netflix.com,节点选择') < c3.indexOf('- RULE-SET,cmcp_sp_') && /改成覆写里你自己写的优先/.test(rd(E + '/notified') || ''), c3 + (rd(E + '/notified') || ''));
		await cgi('split_set', { app: { id: 'netflix', t: '' } }); await cgi('split_set', { app: { id: 'youtube', t: '' } });
		for (const [mac] of Object.entries((await cgi('split_get')).result.dev || {})) await cgi('split_set', { dev: { mac, t: '' } });
		for (const id of Object.keys((await cgi('split_get')).result.capp || {})) await cgi('split_set', { capp: { id, del: true } });
		fs.writeFileSync(PX, PXo); fs.writeFileSync(CUS, CUSo); fs.rmSync(E + '/providers.json', { force: true }); fs.rmSync(E + '/custom2.list', { force: true });
		await cgi('split_restart');
		KIND = K0;
	}
	r = await cgi('split_set', { app: { id: 'chatgpt', t: '' } });
	ok('Nikki：去掉后删掉自己的规则', !/cmcp_sp_/.test(rd(CFG + '/nikki')) && /config rule 'mine'/.test(rd(CFG + '/nikki')));
	{ // Nikki 的规则里直接写节点名：节点连不上改走主策略组要重启 Nikki（节点已经不通了）
		fs.writeFileSync(PX, JSON.stringify({ proxies: { GLOBAL: { type: 'Selector', all: ['节点选择', '🇯🇵 日本 01'] }, '节点选择': { type: 'Selector', now: '🇯🇵 日本 01' }, '🇯🇵 日本 01': { type: 'Vmess' } } }));
		fs.rmSync(E + '/spnode.json', { force: true }); fs.writeFileSync(E + '/delay.json', JSON.stringify({ '🇯🇵 日本 01': 80 }));
		await cgi('split_set', { app: { id: 'chatgpt', t: '🇯🇵 日本 01' } }); await cgi('split_restart'); fs.writeFileSync(RUN, '');
		fs.writeFileSync(E + '/delay.json', JSON.stringify({ '🇯🇵 日本 01': 0 }));
		await cgi('split_check'); await cgi('split_check'); await cgi('split_check');
		ok('Nikki：选的节点连不上 3 分钟、没有同名的：不换，不重启', /option node '🇯🇵 日本 01'/.test(rd(CFG + '/nikki')) && !/nikki restart/.test(rd(RUN)), rd(RUN));
		fs.writeFileSync(PX, JSON.stringify({ proxies: { GLOBAL: { type: 'Selector', all: ['节点选择', '🇯🇵 日本 01', '🇯🇵 日本 02'] }, '节点选择': { type: 'Selector', now: '🇯🇵 日本 01' }, '🇯🇵 日本 01': { type: 'Vmess' }, '🇯🇵 日本 02': { type: 'Vmess' } } }));
		fs.writeFileSync(E + '/delay.json', JSON.stringify({ '🇯🇵 日本 01': 0, '🇯🇵 日本 02': 70 }));
		await cgi('split_check');
		ok('Nikki：有同名的（日本 02）：规则换过去，重启 Nikki；Nikki 不事先占同名的组', /option node '🇯🇵 日本 02'/.test(rd(CFG + '/nikki')) && !/option node '🇯🇵 日本 01'/.test(rd(CFG + '/nikki')) && /nikki restart/.test(rd(RUN)) && (await cgi('split_get')).result.pending === false, rd(RUN) + rd(CFG + '/nikki'));
		// 用户 11/28：你自己的规则优先——后来又加的规则排在面板的后面，下次写的时候把面板的挪到最后
		fs.writeFileSync(CFG + '/nikki', rd(CFG + '/nikki') + "\nconfig rule 'later'\n\toption type 'DOMAIN-SUFFIX'\n\toption matcher 'chatgpt.com'\n\toption node 'DIRECT'\n");
		await cgi('split_check');
		const nk2 = rd(CFG + '/nikki');
		r = await cgi('split_get');
		ok('Nikki：你后来加的规则排到面板的后面了：面板的挪到最后（你写的优先）；认得出你写的、跟 ChatGPT 撞了', nk2.indexOf("config rule 'later'") < nk2.indexOf("config rule 'cmcp_sp_") && r.result.own.some((x) => x.k === 'nk:later' && x.v === 'chatgpt.com') && r.result.ov['app:chatgpt']?.t === 'DIRECT', nk2 + JSON.stringify(r.result.ov));
		await cgi('split_set', { app: { id: 'chatgpt', t: '' } }); fs.writeFileSync(PX, PX0);
	}
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

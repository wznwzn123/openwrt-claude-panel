// 第五阶段：Nikki 的订阅、配置文件、规则、不走代理（11/27 全面检查第 16 条）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_nikki.mjs（在 cloud 目录里运行）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const E = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpnk-')), CFG = E + '/config', ROOT = E + '/root', RUN = E + '/run.log', NFT = E + '/nft', BUSY = E + '/busy';
fs.mkdirSync(CFG); fs.mkdirSync(ROOT + '/etc/nikki/profiles', { recursive: true }); fs.mkdirSync(ROOT + '/etc/nikki/subscriptions'); fs.mkdirSync(ROOT + '/etc/nikki/run');
const NK0 = `config config 'config'
	option enabled '1'
	option profile 'subscription:sub1'

config subscription 'sub1'
	option name '机场一'
	option url 'https://a.example.com/api?token=SECRET'
	option user_agent 'clash.meta'
	option success '1'

config subscription 'sub2'
	option name '备用'
	option url 'https://b.example.com/x'

config mixin 'mixin'
	option rule '0'

config rule
	option enabled '1'
	option type 'DOMAIN-SUFFIX'
	option matcher 'mine.com'
	option node 'DIRECT'

config rule 'cmcp_sp_0'
	option enabled '1'
	option type 'DOMAIN-SUFFIX'
	option matcher 'youtube.com'
	option node '香港'

config lan_access_control
	option enabled '1'
	option dns '1'
	option proxy '1'
`;
fs.writeFileSync(CFG + '/nikki', NK0);
fs.writeFileSync(ROOT + '/etc/nikki/subscriptions/sub1.yaml', 'proxies: []\n');
fs.writeFileSync(ROOT + '/etc/nikki/profiles/my.yaml', 'mode: rule\n');
fs.writeFileSync(ROOT + '/etc/nikki/run/config.yaml', 'mode: rule\nsecret: x\n');
fs.writeFileSync(NFT, 'table inet nikki {\n\tchain lan_redirect {\n\t\tether saddr { 11:22:33:44:55:66 } counter return comment "cmcp_black" # handle 41\n\t\tmeta l4proto tcp counter redirect to :7891 # handle 42\n\t}\n}\n');
fs.writeFileSync(E + '/config.json', JSON.stringify({ token: 'tok' + 'x'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG }));
const BLF = '/etc/claude-mcp/blacklist.json', blBak = fs.existsSync(BLF) ? fs.readFileSync(BLF) : null;
fs.mkdirSync('/etc/claude-mcp', { recursive: true });
let XENV = {};
const cgi = (method, params) => new Promise((z) => {
	const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' });
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: E + '/config.json', PATH_INFO: '/tok' + 'x'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)),
		CMCP_NK_ROOT: ROOT, CMCP_NK_RUN: RUN, CMCP_NK_ON: '1', CMCP_NK_NFT: NFT, CMCP_SX_BUSY: BUSY, CMCP_SX_PX: 'nikki', CMCP_SP_KIND: 'nikki', ...XENV } });
	let out = ''; p.stdout.on('data', (x) => (out += x)); p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const err = (r) => r.error?.message || '';
const rd = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const clr = (f) => fs.writeFileSync(f, '');
try {
	// 总览
	let r = await cgi('nk_get'), g = r.result;
	ok('总览：订阅、正在用哪个、配置文件、你写的规则（不含分流加的）', g?.on && g.prof?.kind === 'sub' && g.prof.id === 'sub1' && g.subs?.length === 2 && g.subs[0].active && g.subs[0].file && !g.subs[1].file
		&& g.files?.length === 1 && g.files[0].name === 'my.yaml' && g.rules?.length === 1 && g.rules[0].matcher === 'mine.com' && g.split === 1, JSON.stringify(g));
	ok('订阅地址不发给手机，只给主机名', g.subs[0].host === 'a.example.com' && !JSON.stringify(r).includes('SECRET'));
	// 订阅
	r = await cgi('nk_sub_save', { name: '新机场', url: 'https://c.example.com/s', ua: 'mihomo' });
	const nid = r.result?.id;
	ok('加订阅：uci 新段（prefer remote）', /^sub[0-9a-f]+$/.test(nid || '') && /config subscription '.+'[\s\S]*option name '新机场'[\s\S]*option url 'https:\/\/c\.example\.com\/s'/.test(rd(CFG + '/nikki')) && /option user_agent 'mihomo'/.test(rd(CFG + '/nikki')), JSON.stringify(r));
	r = await cgi('nk_sub_save', { id: 'sub1', name: '机场一改', ua: 'clash' });
	ok('改订阅：地址不填就不改', r.result?.ok && /option name '机场一改'/.test(rd(CFG + '/nikki')) && /SECRET/.test(rd(CFG + '/nikki')));
	ok('地址不是 http 开头：不收', /http/.test(err(await cgi('nk_sub_save', { name: 'x', url: 'ftp://x' }))));
	ok('新订阅没填地址：不收', /订阅地址/.test(err(await cgi('nk_sub_save', { name: 'x' }))));
	ok('正在用的订阅不能删', /正在用/.test(err(await cgi('nk_sub_del', { id: 'sub1' }))));
	r = await cgi('nk_sub_del', { id: nid });
	ok('删别的订阅', r.result?.ok && !rd(CFG + '/nikki').includes('新机场'));
	clr(RUN);
	r = await cgi('nk_sub_update', { id: 'sub1' });
	ok('更新正在用的订阅：用 Nikki 自己的脚本，更新完 Nikki 在跑才重启（关着的不打开），跑完删掉标记', r.result?.restart && /nikki update_subscription 'sub1'; \/[^ ]*\/cmcp-proxy running nikki && \/etc\/init\.d\/nikki restart; rm -f /.test(rd(RUN)) && fs.existsSync(BUSY), rd(RUN));
	ok('正在更新：不能再点', /正在更新/.test(err(await cgi('nk_sub_update', { id: 'sub2' }))));
	fs.unlinkSync(BUSY); clr(RUN);
	r = await cgi('nk_use', { kind: 'sub', id: 'sub2', restart: true });
	ok('换成没下载过的订阅：先下载再重启', r.result?.dl && r.result.restarting && /option profile 'subscription:sub2'/.test(rd(CFG + '/nikki')) && /update_subscription 'sub2'; \/etc\/init\.d\/nikki restart/.test(rd(RUN)), rd(RUN));
	clr(RUN);
	r = await cgi('nk_use', { kind: 'file', id: 'my.yaml' });
	ok('换成配置文件：不点重启就不重启', r.result?.ok && !r.result.restarting && /option profile 'file:my\.yaml'/.test(rd(CFG + '/nikki')) && !rd(RUN));
	ok('没有的配置文件', /没有这个配置文件/.test(err(await cgi('nk_use', { kind: 'file', id: 'no.yaml' }))));
	ok('文件名带路径：不收', /文件名/.test(err(await cgi('nk_use', { kind: 'file', id: '../x.yaml' }))));
	// 配置文件
	r = await cgi('file_read', { kind: 'nk_profile', name: 'my.yaml' });
	ok('看配置文件（带指纹）', r.result?.content === 'mode: rule\n' && r.result.sum && r.result.ro === false);
	const sum = r.result.sum;
	r = await cgi('file_read', { kind: 'nk_run', name: 'config.yaml' });
	ok('看正在跑的配置：只能看', r.result?.content?.includes('mode: rule') && r.result.ro === true);
	ok('正在跑的配置不能改', /只能看/.test(err(await cgi('file_save', { kind: 'nk_run', name: 'config.yaml', content: 'x' }))));
	ok('只能看 run 里的 config.yaml', /config\.yaml/.test(err(await cgi('file_read', { kind: 'nk_run', name: '../../passwd' }))));
	fs.writeFileSync(E + '/core', '#!/bin/sh\ncase "$(cat "$5")" in *bad*) echo "test failed: yaml error";; *) echo "configuration file test is successful";; esac\n'); fs.chmodSync(E + '/core', 0o755);
	XENV = { CMCP_NK_CORE: E + '/core' };
	ok('保存前用内核检查：没过不保存', /校验没通过/.test(err(await cgi('file_save', { kind: 'nk_profile', name: 'my.yaml', content: 'bad: [', base: sum }))) && rd(ROOT + '/etc/nikki/profiles/my.yaml') === 'mode: rule\n');
	clr(RUN);
	r = await cgi('file_save', { kind: 'nk_profile', name: 'my.yaml', content: 'mode: global\n', base: sum, restart: true });
	ok('保存正在用的配置文件并重启（旧版本先备份）', r.result?.ok && r.result.restarting && r.result.backup && rd(ROOT + '/etc/nikki/profiles/my.yaml') === 'mode: global\n' && /nikki restart/.test(rd(RUN)), JSON.stringify(r));
	ok('打开以后被别处改过：先不保存', /被别处改过/.test(err(await cgi('file_save', { kind: 'nk_profile', name: 'my.yaml', content: 'x: 1\n', base: sum }))));
	r = await cgi('file_save', { kind: 'nk_profile', name: 'new.yaml', content: 'mode: rule\n' });
	ok('新建配置文件', r.result?.ok && rd(ROOT + '/etc/nikki/profiles/new.yaml') === 'mode: rule\n');
	ok('文件名要 .yaml', /yaml/.test(err(await cgi('file_save', { kind: 'nk_profile', name: 'a.txt', content: 'x' }))));
	ok('正在用的配置文件不能删', /正在用/.test(err(await cgi('file_delete', { kind: 'nk_profile', name: 'my.yaml' }))));
	r = await cgi('file_delete', { kind: 'nk_profile', name: 'new.yaml' });
	ok('删别的配置文件（先备份）', r.result?.ok && r.result.backup && !fs.existsSync(ROOT + '/etc/nikki/profiles/new.yaml'));
	XENV = {};
	// 规则
	clr(RUN);
	r = await cgi('nk_rules_set', { text: '- DOMAIN-SUFFIX,a.com,DIRECT\n# 这是注释\n# DOMAIN,off.com,REJECT\nIP-CIDR,1.2.3.0/24,香港,no-resolve\n' });
	let nk = rd(CFG + '/nikki');
	ok('保存规则：每行一条，# 开头的停用、普通注释跳过、no-resolve 认得', r.result?.n === 3 && /config rule 'ur_0'[\s\S]*matcher 'a\.com'/.test(nk) && /config rule 'ur_1'[\s\S]*option enabled '0'[\s\S]*matcher 'off\.com'/.test(nk)
		&& /config rule 'ur_2'[\s\S]*matcher '1\.2\.3\.0\/24'[\s\S]*no_resolve '1'/.test(nk) && !nk.includes('mine.com'), nk);
	ok('分流加的规则还在，排在你写的后面；打开 mixin 规则', nk.indexOf("'cmcp_sp_0'") > nk.indexOf("'ur_2'") && /matcher 'youtube\.com'/.test(nk) && /option rule '1'/.test(nk));
	ok('不点重启就不重启', !r.result.restarting && !rd(RUN));
	g = (await cgi('nk_get')).result;
	ok('总览里的规则跟着变（不含分流加的）', g.rules.length === 3 && g.rules[1].en === false && g.rules[2].nr === true && g.split === 1, JSON.stringify(g.rules));
	ok('MATCH 不让加', /MATCH/.test(err(await cgi('nk_rules_set', { text: 'MATCH,DIRECT' }))));
	ok('格式不对说哪一行', /第 2 行/.test(err(await cgi('nk_rules_set', { text: 'DOMAIN,a.com,DIRECT\nDOMAIN,b.com' }))));
	ok('不认识的类型', /第 1 行/.test(err(await cgi('nk_rules_set', { text: 'FOO,a,DIRECT' }))));
	r = await cgi('nk_rules_set', { text: '', restart: true });
	nk = rd(CFG + '/nikki');
	ok('清空你写的规则：分流加的照样留着，重启', r.result?.n === 0 && r.result.restarting && !/'ur_/.test(nk) && /cmcp_sp_0/.test(nk) && /nikki restart/.test(rd(RUN)));
	// 不走代理
	fs.writeFileSync(BLF, JSON.stringify([{ mac: 'AA:BB:CC:DD:EE:01', ip: '192.168.1.20', name: '电视' }, { mac: null, ip: '192.168.1.30' }]));
	clr(NFT + '.log');
	r = await cgi('split_check');
	nk = rd(CFG + '/nikki');
	ok('不走代理名单同步到 Nikki 访问控制：放在最前面，MAC 和只有 IP 的都在，不劫持 DNS、不走代理', /^config lan_access_control 'cmcp_black'/.test(nk) && /list mac 'aa:bb:cc:dd:ee:01'/.test(nk) && /list ip '192\.168\.1\.30'/.test(nk) && /option dns '0'/.test(nk) && /option proxy '0'/.test(nk), nk.slice(0, 300));
	let log = rd(NFT + '.log');
	ok('马上生效：删掉上次插的，插到链的最前面', /delete rule inet nikki lan_redirect handle 41/.test(log) && /insert rule inet nikki lan_redirect ether saddr \{ aa:bb:cc:dd:ee:01 \} counter return comment "cmcp_black"/.test(log) && /insert rule inet nikki lan_tun ip saddr \{ 192\.168\.1\.30 \}/.test(log), log);
	clr(NFT + '.log');
	await cgi('split_check');
	ok('每分钟检查：对得上什么也不做', !rd(NFT + '.log') && (rd(CFG + '/nikki').match(/cmcp_black/g) || []).length === 1);
	r = await cgi('black_state');
	ok('不走代理页：用 Nikki 时不用「启用」那一步', r.result?.ready && r.result.live && r.result.custom_on && r.result.px === 'nikki', JSON.stringify(r).slice(0, 200));
	clr(NFT + '.log');
	r = await cgi('black_set', { ip: '192.168.1.30', on: false });
	nk = rd(CFG + '/nikki');
	ok('恢复走代理：访问控制里去掉、马上生效、不提示要启用', r.result?.ok && !r.result.need_setup && !nk.includes("'192.168.1.30'") && /list mac 'aa:bb:cc:dd:ee:01'/.test(nk) && /delete rule inet nikki lan_redirect handle 41/.test(rd(NFT + '.log')), JSON.stringify(r));
	r = await cgi('black_set', { ip: '192.168.1.40', on: true });
	ok('按 IP 加：马上生效', r.result?.ok && r.result.live && !r.result.need_setup && /list ip '192\.168\.1\.40'/.test(rd(CFG + '/nikki')));
	fs.writeFileSync(BLF, '[]');
	await cgi('split_check');
	ok('名单空了：访问控制那一段删掉', !rd(CFG + '/nikki').includes('cmcp_black'));
	XENV = { CMCP_NK_ON: '0' };
	clr(NFT + '.log');
	fs.writeFileSync(BLF, JSON.stringify([{ mac: 'aa:bb:cc:dd:ee:02', ip: '192.168.1.21' }]));
	await cgi('split_check');
	ok('装了 Nikki 但没在用：只写 uci，不动 nft', /list mac 'aa:bb:cc:dd:ee:02'/.test(rd(CFG + '/nikki')) && !rd(NFT + '.log'));
	r = await cgi('black_state');
	ok('没在用 Nikki：不走代理页照 OpenClash 的', r.result?.px !== 'nikki');
	XENV = {};
	// 没装 Nikki
	fs.renameSync(CFG + '/nikki', CFG + '/nikki.x');
	ok('没装 Nikki：总览说没装', (await cgi('nk_get')).result?.on === false);
	ok('没装 Nikki：改订阅说清楚', /没装 Nikki/.test(err(await cgi('nk_sub_save', { name: 'a', url: 'https://x' }))));
} finally {
	if (blBak) fs.writeFileSync(BLF, blBak); else try { fs.unlinkSync(BLF); } catch (e) {}
	fs.rmSync(E, { recursive: true, force: true });
}
for (const [n, c, note] of results) console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '\n    ' + String(note).slice(0, 600)));
const pass = results.filter((x) => x[1]).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);

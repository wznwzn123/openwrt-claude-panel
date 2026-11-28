// 6.0 第 14 项：Wi-Fi 设置（名字、密码、开关、隐藏、信道）+ 改网络设置的「90 秒确认」（cmcp-netguard）
// 需要本机能跑 ucode：UCODE="ucode 命令（含 -L 参数）" node test/test_cgi_wifi.mjs（在 cloud 目录里运行）
// uci 用 test/fake/uci.py 代替；等待时间改成 3 秒；「wifi reload」只记下来不真跑
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, execSync } from 'child_process';
const UC = process.env.UCODE;
if (!UC) { console.log('跳过：没有设置 UCODE'); process.exit(0); }
const results = []; const ok = (n, c, note) => results.push([n, !!c, note]);
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcpwifi-'));
const CFG = D + '/config', SB = D + '/sbin', NG = D + '/ng', RUN = D + '/reload.log', NOTE = D + '/notify.log';
fs.mkdirSync(CFG); fs.mkdirSync(SB);
fs.copyFileSync(path.resolve('../src/bin/cmcp-netguard'), SB + '/cmcp-netguard'); fs.chmodSync(SB + '/cmcp-netguard', 0o755);
fs.writeFileSync(SB + '/cmcp-notify', `#!/bin/sh\necho "$@" >> ${NOTE}\n`); fs.chmodSync(SB + '/cmcp-notify', 0o755);
fs.writeFileSync(SB + '/cmcp-compat', '#!/bin/sh\nexit 0\n'); fs.chmodSync(SB + '/cmcp-compat', 0o755);
fs.writeFileSync(D + '/wifi', '#!/bin/sh\n'); fs.chmodSync(D + '/wifi', 0o755);
const KEY = 'Home-Pass-2024!';
const WL = `config wifi-device 'radio0'
	option type 'mac80211'
	option hwmode '11g'
	option channel '6'
	option country 'CN'

config wifi-device 'radio1'
	option type 'mac80211'
	option band '5g'
	option channel '36'
	option htmode 'VHT80'

config wifi-iface 'default_radio0'
	option device 'radio0'
	option network 'lan'
	option mode 'ap'
	option ssid 'Home'
	option encryption 'psk2'
	option key '${KEY}'

config wifi-iface
	option device 'radio1'
	option network 'lan'
	option mode 'ap'
	option ssid 'Home-5G'
	option encryption 'sae-mixed'
	option key '${KEY}'

config wifi-iface 'guest0'
	option device 'radio0'
	option network 'guest'
	option mode 'ap'
	option ssid 'Guest'
	option encryption 'none'
	option cmcp_guest '1'

config wifi-iface 'mesh1'
	option device 'radio1'
	option network 'lan'
	option mode 'mesh'
	option mesh_id 'm'
`;
const reset = (t) => { fs.writeFileSync(CFG + '/wireless', t ?? WL); fs.rmSync(NG, { recursive: true, force: true }); };
const W = () => fs.readFileSync(CFG + '/wireless', 'utf8');
fs.writeFileSync(D + '/config.json', JSON.stringify({ token: 'tok' + 'q'.repeat(30), uci: 'python3 ' + path.resolve('test/fake/uci.py') + ' -c ' + CFG, uci_dir: CFG, wifi_bin: D + '/wifi' }));
const cgi = (method, params) => new Promise((z) => {
	const msg = { jsonrpc: '2.0', id: 1, method: 'panel/' + method, params: params || {}, client: 'panel' }, body = JSON.stringify(msg);
	const p = spawn('sh', ['-c', UC + ' ' + JSON.stringify(path.resolve('../src/www/cgi-bin/mcp'))], { env: { ...process.env, CLAUDE_MCP_CONF: D + '/config.json', PATH_INFO: '/tok' + 'q'.repeat(30), REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)), CMCP_SBIN: SB, CMCP_NG: NG, CMCP_NG_WAIT: '3', CMCP_NG_RUN: RUN } });
	let out = ''; p.stdout.on('data', (x) => { out += x; }); p.stderr.on('data', (x) => { out += x; });
	p.on('close', () => { const i = out.indexOf('\r\n\r\n'); let j = null; try { j = JSON.parse(out.slice(i + 4)); } catch (e) {} z(j || { raw: out }); });
	p.stdin.end(body);
});
const runs = () => (fs.existsSync(RUN) ? fs.readFileSync(RUN, 'utf8').trim().split('\n').filter(Boolean).length : 0);
const waitFor = async (f, ms = 9000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(150); } return false; };
try {
	reset();
	let r = await cgi('wifi_get');
	const g = r.result || {}, R = g.radios || [];
	ok('认出两个频段：2.4G（老写法 hwmode）和 5G（新写法 band）', R.length === 2 && R[0].name === '2.4G' && R[1].name === '5G', JSON.stringify(r).slice(0, 400));
	ok('只算家里网络的 Wi-Fi：访客、Mesh 不当成主 Wi-Fi', R[0].wifi?.ssid === 'Home' && R[1].wifi?.ssid === 'Home-5G');
	ok('匿名的 Wi-Fi 段也认得', R[1].wifi && R[1].on === true);
	ok('列表里不带密码', !JSON.stringify(r).includes(KEY) && R[0].wifi.key === true);
	ok('信道：2.4G 国家码 CN 给 1–13；5G 不给雷达信道', R[0].chans.join() === '1,2,3,4,5,6,7,8,9,10,11,12,13' && R[1].chans.join() === '36,40,44,48,149,153,157,161,165' && R[0].channel === 6 && R[1].channel === 36, JSON.stringify(R.map((x) => x.chans)));
	ok('能改（有 wifi 命令），现在没有等确认的', g.can === true && g.pending === null);
	ok('两个频段名字不一样：不合成一份', g.same === false);
	r = await cgi('wifi_key', { id: 'radio1' });
	ok('点「显示」单独拿密码', r.result?.key === KEY);
	// ---- 检查 ----
	for (const [k, why] of [['12345678', '常见'], ['aaaaaaaa', '一个字重复'], ['abcdefgh', '顺着的字母'], ['98765432', '倒着数']]) {
		r = await cgi('wifi_set', { radios: [{ id: 'radio0', key: k }] });
		ok('太容易猜的密码不让用：' + why, /太容易被猜到/.test(r.error?.message || ''), JSON.stringify(r));
	}
	r = await cgi('wifi_set', { radios: [{ id: 'radio0', key: 'short' }] });
	ok('密码少于 8 位不让用', /至少 8 位/.test(r.error?.message || ''));
	r = await cgi('wifi_set', { radios: [{ id: 'radio0', key: '中文密码中文密码' }] });
	ok('密码里有中文不让用', /英文字母/.test(r.error?.message || ''));
	r = await cgi('wifi_set', { radios: [{ id: 'radio0', ssid: '一二三四五六七八九十一' }] });
	ok('名字超过 32 个字节不让用', /太长/.test(r.error?.message || ''));
	r = await cgi('wifi_set', { radios: [{ id: 'radio0', ssid: '  ' }] });
	ok('名字不能是空的', /不能是空的/.test(r.error?.message || ''));
	r = await cgi('wifi_set', { radios: [{ id: 'radio1', channel: 52 }] });
	ok('雷达信道不让选', /不能用信道/.test(r.error?.message || ''));
	r = await cgi('wifi_set', { radios: [{ id: 'radio9', on: false }] });
	ok('没有的频段报错', !!r.error);
	ok('出错时配置一点没动、也没开始等确认', W() === WL && !fs.existsSync(NG));
	r = await cgi('wifi_set', { radios: [{ id: 'radio0', ssid: 'Home', key: KEY, hidden: false, channel: 6 }] });
	ok('什么都没变：不改、不用确认', r.result?.changed === false && !fs.existsSync(NG), JSON.stringify(r));
	// ---- 改了，点「保留」 ----
	r = await cgi('wifi_set', { radios: [{ id: 'radio0', ssid: "妈妈's 家", key: 'Better-Pass-77', hidden: true, channel: 11 }, { id: 'radio1', channel: 'auto' }] });
	const tok = r.result?.token;
	ok('改好了，给面板一个确认编号', r.result?.changed === true && /^[a-z0-9]{16}$/.test(tok || '') && r.result.wait === 3 && r.result.alloff === false, JSON.stringify(r));
	let w = W();
	ok('新设置写进去了（带单引号的名字也对）', /option ssid '妈妈'\\''s 家'/.test(w) && /option key 'Better-Pass-77'/.test(w) && /option hidden '1'/.test(w) && /option channel '11'/.test(w) && /option channel 'auto'/.test(w), w.slice(0, 900));
	ok('访客 Wi-Fi 没被动', /option ssid 'Guest'/.test(w) && /option encryption 'none'/.test(w));
	ok('原来的设置备份了', fs.readFileSync(NG + '/files/wireless', 'utf8') === WL);
	ok('2 秒后重新加载 Wi-Fi（让新设置生效）', await waitFor(() => runs() === 1, 5000) && fs.readFileSync(RUN, 'utf8').trim() === 'wifi reload');
	r = await cgi('wifi_get');
	ok('列表里显示在等确认，还剩几秒', r.result?.pending?.token === tok && r.result.pending.left > 0 && r.result.pending.left <= 3 && r.result.pending.what === 'Wi-Fi 设置' && r.result.radios[0].wifi.ssid === "妈妈's 家" && r.result.radios[0].wifi.hidden === true, JSON.stringify(r.result?.pending));
	r = await cgi('wifi_set', { radios: [{ id: 'radio1', on: false }] });
	ok('等确认的时候不能再改', /还在等你确认/.test(r.error?.message || ''), JSON.stringify(r));
	const wd = (env) => execSync(`sh -c "$(grep '^netchg' ${path.resolve('../src/bin/cmcp-watchdog')}); netchg && echo skip || echo run"`, { env: { ...process.env, ...env } }).toString().trim();
	ok('看门狗这段时间不去修网络', wd({ CMCP_NG: NG }) === 'skip' && wd({ CMCP_NG: D + '/none' }) === 'run');
	r = await cgi('net_confirm', { token: 'x'.repeat(16) });
	ok('编号不对：不算确认', r.result?.ok === false && fs.existsSync(NG + '/token'));
	r = await cgi('net_confirm', { token: tok });
	ok('点「保留」：不再等了', r.result?.ok === true && !fs.existsSync(NG));
	await sleep(3500);
	ok('过了时间也不会改回去', W() === w && runs() === 1 && !fs.existsSync(NOTE));
	// ---- 改了，不点：自动改回去 ----
	reset(); fs.rmSync(RUN, { force: true });
	r = await cgi('wifi_set', { radios: [{ id: 'radio1', on: false }, { id: 'radio0', on: false }] });
	w = W();
	ok('关掉两个频段：只关家里网络的 Wi-Fi，不关整个无线（访客还能用）', r.result?.alloff === true && /config wifi-iface 'default_radio0'[^]*?option disabled '1'/.test(w) && !/config wifi-device 'radio0'\n(\t[^\n]*\n)*\toption disabled '1'/.test(w) && !/config wifi-iface 'guest0'\n(\t[^\n]*\n)*\toption disabled/.test(w), w);
	ok('没点「保留」：时间到自动改回原来的', await waitFor(() => W() === WL && !fs.existsSync(NG), 9000));
	ok('改回去也重新加载了 Wi-Fi，并推送告诉你', runs() === 2 && /warn net Wi-Fi 设置已改回原来的/.test(fs.readFileSync(NOTE, 'utf8')), fs.existsSync(NOTE) ? fs.readFileSync(NOTE, 'utf8') : '');
	r = await cgi('net_confirm', { token: 'whatever' });
	ok('改回去以后再点「保留」：告诉面板已经没了', r.result?.gone === true);
	// ---- 点「改回去」 ----
	reset(); fs.rmSync(RUN, { force: true }); fs.rmSync(NOTE, { force: true });
	r = await cgi('wifi_set', { radios: [{ id: 'radio1', ssid: 'Home' }] });
	ok('名字、密码、隐藏都一样：面板合成一份显示', (await cgi('wifi_get')).result?.same === true);
	await cgi('net_revert', { token: r.result.token }); await waitFor(() => W() === WL && !fs.existsSync(NG), 4000);
	r = await cgi('wifi_set', { radios: [{ id: 'radio1', ssid: 'New-5G' }] });
	ok('改名字', /New-5G/.test(W()));
	r = await cgi('net_revert', { token: r.result.token });
	ok('点「改回去」：马上改回原来的，不推送', r.result?.ok === true && await waitFor(() => W() === WL && !fs.existsSync(NG), 4000) && !fs.existsSync(NOTE));
	await sleep(3500);
	ok('原来那个等待到点了什么也不做', W() === WL && !fs.existsSync(NOTE));
	// ---- 开放网络设密码；关着的频段打开 ----
	reset(WL.replace("option encryption 'psk2'\n\toption key '" + KEY + "'", "option encryption 'none'").replace("option band '5g'", "option band '5g'\n\toption disabled '1'"));
	r = await cgi('wifi_get');
	ok('没密码的、整个关掉的都认得', r.result.radios[0].wifi.key === false && r.result.radios[0].wifi.kind === 'open' && r.result.radios[1].on === false);
	r = await cgi('wifi_set', { radios: [{ id: 'radio0', key: 'Fresh-Key-31' }, { id: 'radio1', on: true }] });
	w = W();
	ok('原来没密码：设了密码顺便打开加密', /option key 'Fresh-Key-31'\n\toption encryption 'psk2'|option encryption 'psk2'[^]*Fresh-Key-31/.test(w));
	ok('关着的 5G 打开：无线和 Wi-Fi 都打开', /config wifi-device 'radio1'\n(\t[^\n]*\n)*\toption disabled '0'/.test(w), w);
	await cgi('net_confirm', { token: r.result.token });
	// ---- 企业认证不让改密码 ----
	reset(WL.replace("option encryption 'psk2'", "option encryption 'wpa2'"));
	r = await cgi('wifi_set', { radios: [{ id: 'radio0', key: 'Another-Key-55' }] });
	ok('企业认证的密码让去原版后台改', /企业认证/.test(r.error?.message || ''));
	// ---- QSDK 固件（QWRT 等，11/28 用户转来的反馈「5G 和 5G」）：hwmode 11axg / 11axa、信道自动 ----
	const qs = (a, b, c3) => `config wifi-device 'wifi0'\n\toption type 'qcawificfg80211'\n\toption hwmode '${a}'\n\toption channel 'auto'\n\toption htmode 'HE20'\n\nconfig wifi-device 'wifi1'\n\toption type 'qcawificfg80211'\n\toption hwmode '${b}'\n\toption channel 'auto'\n\toption htmode 'HE80'\n` + (c3 ? `\nconfig wifi-device 'wifi2'\n\toption type 'qcawificfg80211'\n\toption hwmode '${c3}'\n\toption channel 'auto'\n\toption htmode 'HE80'\n` : '') + `\nconfig wifi-iface 'a0'\n\toption device 'wifi0'\n\toption network 'lan'\n\toption mode 'ap'\n\toption ssid 'Q'\n\toption encryption 'psk2'\n\toption key '${KEY}'\n\nconfig wifi-iface 'a1'\n\toption device 'wifi1'\n\toption network 'lan'\n\toption mode 'ap'\n\toption ssid 'Q'\n\toption encryption 'psk2'\n\toption key '${KEY}'\n`;
	reset(qs('11axg', '11axa'));
	r = await cgi('wifi_get');
	let QR = r.result?.radios || [];
	ok('QSDK 固件：11axg 认成 2.4G、11axa 认成 5G', QR.length === 2 && QR[0].name === '2.4G' && QR[1].name === '5G', JSON.stringify(QR.map((x) => x.name)));
	ok('QSDK 固件：2.4G 只给 1–13 的信道', (QR[0]?.chans || []).length > 0 && QR[0].chans.every((c) => c <= 13), JSON.stringify(QR[0]?.chans));
	reset(qs('11axg', '11axa', '11axa'));
	r = await cgi('wifi_get');
	QR = r.result?.radios || [];
	ok('三频（两个 5G）：名字写 5G-1、5G-2，不写「5G 和 5G」', QR.map((x) => x.name).join(',') === '2.4G,5G-1,5G-2', JSON.stringify(QR.map((x) => x.name)));
	reset(qs('11ax', '11ax'));
	r = await cgi('wifi_get');
	QR = r.result?.radios || [];
	ok('只写 11ax、信道自动：HE80 认成 5G、HE20 认不出按 2.4G', QR.length === 2 && QR[0].name === '2.4G' && QR[1].name === '5G', JSON.stringify(QR.map((x) => x.name)));
	reset();
	// ---- 没有无线 ----
	fs.rmSync(CFG + '/wireless');
	r = await cgi('wifi_get');
	ok('没有无线：告诉面板', r.result?.none === 'nocfg');
	// ---- 权限 ----
	const src = fs.readFileSync(path.resolve('../src/mcp/26-backup.uc'), 'utf8');
	const grp = (g) => (src.match(new RegExp('\\t' + g + ": \\[([^\\]]*)\\]")) || [])[1] || '';
	ok('子账号：能看 Wi-Fi；改、看密码、确认要「完全控制」', /'wifi_get'/.test(grp('view')) && /'net_pending'/.test(grp('view')) && ['wifi_key', 'wifi_set', 'net_confirm', 'net_revert'].every((m) => grp('net').includes(`'${m}'`)) && !/'wifi_key'/.test(grp('view')));
} catch (e) { ok('出错：' + e.message, false); }
fs.rmSync(D, { recursive: true, force: true });
let bad = 0;
for (const [n, c, note] of results) { console.log((c ? '✓ ' : '✗ ') + n + (c || !note ? '' : '\n    ' + note)); if (!c) bad++; }
console.log(`\n${results.length - bad}/${results.length} 通过`);
process.exit(bad ? 1 : 0);

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { respond } = require('./mock');

const ROOT = (process.env.PANEL_WWW || path.join(__dirname, '..', '..', 'src', 'www'));
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const calls = [];
const problems = [];
const results = [];
const ok = (name, cond, note) => { results.push([name, !!cond, note || '']); if (!cond) problems.push(name + (note ? '：' + note : '')); };

(async () => {
	const browser = await chromium.launch();
	const dark = process.argv.includes('--dark');
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => problems.push('页面错误：' + e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !/serviceWorker|sw\.js|Failed to load resource/.test(m.text())) problems.push('控制台：' + m.text()); });
	await page.route('http://panel.test/**', async (route) => {
		const u = new URL(route.request().url());
		if (u.pathname.startsWith('/cgi-bin/mcp/')) {
			const body = JSON.parse(route.request().postData() || '{}');
			calls.push({ m: body.method, p: body.params });
			const result = respond(body.method, body.params || {});
			await new Promise((r) => setTimeout(r, 30));
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) });
		}
		let f = path.join(ROOT, u.pathname);
		if (f.endsWith('/')) f += 'index.html';
		if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
		const ct = f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream';
		return route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(f) });
	});
	await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); window.confirmQueue = []; });
	await page.goto('http://panel.test/panel/?p=home'); // 概览（默认首页以后要带 ?p=home）
	await page.waitForTimeout(1500);
	const sfx = dark ? '-dark' : '';
	const shot = (n) => page.screenshot({ path: path.join(OUT, n + sfx + '.png'), fullPage: false });
	const full = (n) => page.screenshot({ path: path.join(OUT, n + sfx + '.png'), fullPage: true });
	const overflow = async (n) => { const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(n + ' 无横向溢出', w[0] <= w[1], w.join('>')); };
	const last = (m) => [...calls].reverse().find((c) => c.m === m);
	const since = (i) => calls.slice(i);
	const okBtn = async () => { await page.locator('.modal [data-v="true"]').last().click(); await page.waitForTimeout(250); };
	const closeModal = async () => {
		const m = page.locator('.modal:not(.closing)').last();
		if (!(await m.count())) return;
		const b = m.locator('[data-v="false"],[data-v="close"]').first();
		if (await b.count()) await b.click(); else await page.mouse.click(5, 5);
		await page.waitForTimeout(400);
	};
	const tab = async (p) => {
		await page.click('#menuBtn'); await page.waitForTimeout(450);
		// 目标在收起的分组里：先展开
		await page.evaluate((p) => { const b = document.querySelector(`#sidenav button[data-p="${p}"]`); for (let g = b.closest('.ng'); g; g = g.parentElement.closest('.ng')) if (!g.classList.contains('open')) g.querySelector(':scope>button[data-ng]').click(); }, p);
		await page.waitForTimeout(380);
		await page.click(`#sidenav button[data-p="${p}"]`); await page.waitForTimeout(700); };

	// 概览
	await full('01-home');
	await overflow('概览');
	ok('概览读取 overview', calls.some((c) => c.m === 'panel/overview'));
	ok('概览显示插件版本', (await page.textContent('#oPlug')).includes('0.48'));
	ok('运行模式标记当前 TUN 混合', await page.locator('#runChips .chip.on').textContent() === 'TUN 混合');
	ok('快捷操作 12 个按钮', await page.locator('#qGrid .qbtn').count() === 12);
	let i = calls.length;
	await page.click('#modeChips [data-mode="global"]'); await okBtn(); await page.waitForTimeout(300);
	ok('切换全局模式 → set_mode', since(i).some((c) => c.m === 'panel/set_mode' && c.p.mode === 'global'));
	await page.click('#modeChips [data-mode="rule"]'); await page.waitForTimeout(300);
	i = calls.length;
	await page.click('#runChips [data-run="fake-ip-tun"]'); await okBtn(); await page.waitForTimeout(300);
	ok('切换运行模式 → run_mode', since(i).some((c) => c.m === 'panel/run_mode' && c.p.mode === 'fake-ip-tun'));
	ok('IP 自动检测显示国内和海外', (await page.textContent('#ipList')).includes('国内') && (await page.textContent('#ipList')).includes('海外'));
	ok('网站检查自动显示结果', (await page.textContent('#siteTiles')).includes('打不开'));
	ok('解锁自动检测 → unlock', last('panel/unlock') && last('panel/unlock').p.services.includes('claude'));
	i = calls.length;
	await page.click('#qGrid [data-q="flush_dns"]'); await page.waitForTimeout(300);
	ok('快捷：清 DNS 缓存', since(i).some((c) => c.m === 'panel/quick' && c.p.action === 'flush_dns'));
	i = calls.length;
	await page.click('#qGrid [data-q="restart"]'); await okBtn(); await page.waitForTimeout(300);
	ok('快捷：重启', since(i).some((c) => c.m === 'panel/quick' && c.p.action === 'restart'));
	i = calls.length;
	await page.click('#qGrid [data-q="subs"]'); await okBtn(); await page.waitForTimeout(300);
	ok('快捷：更新订阅 → sub_update', since(i).some((c) => c.m === 'panel/sub_update'));
	await full('02-home-after');
	await page.click('#oCfgBtn'); await page.waitForTimeout(500);
	ok('概览：配置文件切换弹窗', await page.locator('.modal .file').count() === 2);
	i = calls.length;
	await page.click('.modal [data-v="f1"]'); await page.waitForTimeout(400); await okBtn(); await page.waitForTimeout(300);
	ok('概览：切换配置 → cfg_switch', since(i).some((c) => c.m === 'panel/cfg_switch' && c.p.name === 'liangxinyun.yaml'));

	// 底部快捷栏
	await page.click('#dock [data-d="ip"]'); await page.waitForTimeout(600);
	await shot('03-dock-ip');
	ok('底栏 IP 检查弹窗', (await page.locator('.modal').last().textContent()).includes('海外'));
	await closeModal();
	await page.click('#dock [data-d="mode"]'); await page.waitForTimeout(500);
	await shot('04-dock-mode');
	ok('底栏模式弹窗', await page.locator('.modal [data-mode]').count() === 3);
	await closeModal();
	await page.click('#dock [data-d="quick"]'); await page.waitForTimeout(500);
	await shot('05-dock-quick');
	ok('底栏快捷弹窗 12 项', await page.locator('.modal .qbtn').count() === 12);
	await page.click('.modal [data-x="conn"]'); await page.waitForTimeout(400);
	await page.fill('.modal input', 'claude.ai'); await page.click('.modal [data-ok]'); await page.waitForTimeout(500);
	ok('连接诊断 → diag', last('panel/diag') && last('panel/diag').p.addr === 'claude.ai');
	await closeModal();

	// 节点
	await tab('proxy');
	await full('06-proxy');
	await overflow('节点');
	ok('节点页显示代理集', (await page.textContent('#ppList')).includes('airport'));
	i = calls.length;
	await page.click('#pxList .grp.open [data-n="3"]'); await page.waitForTimeout(300);
	ok('切换节点 → switch_proxy', since(i).some((c) => c.m === 'tools/call' && c.p.name === 'switch_proxy'));

	// 订阅
	await tab('subs');
	await full('07-subs');
	await overflow('订阅');
	ok('订阅列表 2 个', await page.locator('#subList .subcard').count() === 2);
	await page.click('#subList [data-s="0"] [data-flowbtn]'); await page.waitForTimeout(400);
	ok('查流量显示', (await page.textContent('#subList [data-s="0"]')).includes('已用'));
	i = calls.length;
	await page.click('#subList [data-s="1"] .sw input', { force: true }); await page.waitForTimeout(300);
	ok('启用开关 → oc_sec edit enabled', since(i).some((c) => c.m === 'panel/oc_sec' && c.p.values.enabled === '1'));
	await page.click('#subAdd'); await page.waitForTimeout(600);
	await shot('08-sub-add');
	await page.fill('.modal [data-o="name"] input', 'newsub');
	await page.fill('.modal [data-o="address"] textarea', 'https://a.example/sub?x=1');
	await page.click('.modal [data-o="keyword_option"] .sw input', { force: true });
	await page.fill('.modal [data-o="keyword"] [data-f="add"]', '香港'); await page.click('.modal [data-o="keyword"] [data-add]');
	await page.click('.modal [data-o="de_ex_keyword"] label:first-child');
	await page.click('.modal [data-o="ad_option"] .sw input', { force: true });
	await page.click('.modal [data-age="keygen"]'); await page.waitForTimeout(400);
	ok('Age 密钥回填', (await page.inputValue('.modal [data-o="config_age_secret"] input')).startsWith('AGE-SECRET'));
	await shot('09-sub-add-filled');
	i = calls.length;
	await page.click('.modal [data-ok]'); await page.waitForTimeout(500);
	const add = since(i).find((c) => c.m === 'panel/oc_sec');
	ok('添加订阅 → oc_sec add', add && add.p.op === 'add' && add.p.values.name === 'newsub' && add.p.values.keyword[0] === '香港' && add.p.values.de_ex_keyword === '到期' && add.p.values.sub_ua === 'clash-verge/v2.4.5', JSON.stringify(add && add.p.values));
	await okBtn(); await page.waitForTimeout(300);
	ok('添加后下载 → sub_update newsub', last('panel/sub_update').p.name === 'newsub');
	await page.click('#subList [data-s="0"] [data-ed]'); await page.waitForTimeout(600);
	await page.fill('.modal [data-o="sub_ua"] input', 'Clash');
	i = calls.length;
	await page.click('.modal [data-ok]'); await page.waitForTimeout(400);
	const ed = since(i).find((c) => c.m === 'panel/oc_sec');
	ok('编辑订阅只提交改动项', ed && ed.p.op === 'edit' && JSON.stringify(ed.p.values) === '{"sub_ua":"Clash"}', JSON.stringify(ed && ed.p));
	await page.click('#subAuto'); await page.waitForTimeout(600);
	await page.click('.modal [data-o="auto_update"] .sw input', { force: true });
	ok('自动更新联动显示「更新模式」', await page.locator('.modal [data-o="config_auto_update_mode"]').isVisible());
	i = calls.length;
	await page.click('.modal [data-ok]'); await page.waitForTimeout(400);
	ok('自动更新保存 → oc_set', since(i).some((c) => c.m === 'panel/oc_set' && c.p.set.auto_update === '1'));

	// 配置文件
	await tab('cfg');
	await full('10-cfg');
	await overflow('配置文件');
	await page.click('#cfgBody [data-f="1"]'); await page.waitForTimeout(400);
	await shot('11-cfg-sheet');
	await page.click('.modal [data-v="edit"]'); await page.waitForTimeout(600);
	await shot('12-cfg-edit');
	i = calls.length;
	await page.click('.modal [data-s]'); await page.waitForTimeout(400);
	ok('编辑配置保存 → file_save config', since(i).some((c) => c.m === 'panel/file_save' && c.p.kind === 'config' && c.p.name === 'liangxinyun.yaml'));
	await page.click('#cfgBody [data-f="1"]'); await page.waitForTimeout(400);
	i = calls.length;
	await page.click('.modal [data-v="dl"]'); await page.waitForTimeout(400);
	ok('下载配置 → file_download', since(i).some((c) => c.m === 'panel/file_download'));
	await page.click('#cfgSeg [data-k="rule_provider"]'); await page.waitForTimeout(600);
	ok('规则集文件页', (await page.textContent('#cfgBody')).includes('cn_domain'));
	await page.click('#cfgSeg [data-k="backup"]'); await page.waitForTimeout(500);
	await full('13-backup');
	i = calls.length;
	await page.click('#cfgBody [data-bk="config"]'); await page.waitForTimeout(400);
	ok('备份 → backup_file', since(i).some((c) => c.m === 'panel/backup_file' && c.p.scope === 'config'));

	// 覆写设置
	await tab('ow');
	await full('14-ow');
	await overflow('覆写设置');
	ok('覆写分组 8 个', await page.locator('#owSeg .chip').count() === 8);
	await page.selectOption('#owBody [data-o="log_level"] select', 'info');
	ok('修改后出现保存条', await page.locator('#owBody .savebar:not(.hidden)').count() === 1);
	await shot('15-ow-dirty');
	i = calls.length;
	await page.click('#owBody .savebar [data-save]'); await page.waitForTimeout(400);
	ok('覆写保存 → oc_set log_level', since(i).some((c) => c.m === 'panel/oc_set' && c.p.set.log_level === 'info'));
	await page.click('#owSeg [data-t="dns"]'); await page.waitForTimeout(500);
	await page.click('#owBody [data-o="custom_host"] .sw input', { force: true }); await page.waitForTimeout(500);
	ok('Hosts 开关联动出文本框并读文件', (await page.inputValue('#owBody [data-o="custom_hosts"] textarea')).includes('rules:'));
	await page.fill('#owBody [data-o="custom_hosts"] textarea', '1.1.1.1 a.com');
	i = calls.length;
	await page.click('#owBody .savebar [data-save]'); await page.waitForTimeout(400);
	ok('Hosts 保存 → oc_set + file_save', since(i).some((c) => c.m === 'panel/oc_set' && c.p.set.custom_host === '1') && since(i).some((c) => c.m === 'panel/file_save' && c.p.name === 'openclash_custom_hosts.list'));
	await page.click('#owSeg [data-t="smart"]'); await page.waitForTimeout(400);
	i = calls.length;
	await page.click('#owBody [data-o="Model Update"] [data-btn]'); await page.waitForTimeout(300); await okBtn(); await page.waitForTimeout(300);
	ok('更新模型按钮 → oc_button', since(i).some((c) => c.m === 'panel/oc_button' && c.p.option === 'Model Update'));
	i = calls.length;
	await page.click('#owBody [data-qa="flush_smart"]'); await page.waitForTimeout(300);
	ok('清理 Smart 缓存 → quick', since(i).some((c) => c.m === 'panel/quick' && c.p.action === 'flush_smart'));
	await page.click('#owSeg [data-t="dns_servers"]'); await page.waitForTimeout(600);
	await full('16-ow-dns');
	await page.click('#owBody [data-r="1"]'); await page.waitForTimeout(500);
	ok('DNS 编辑：HTTPS 时显示 HTTP/3', await page.locator('.modal [data-o="http3"]').isVisible());
	await shot('17-ow-dns-edit');
	await page.selectOption('.modal [data-o="type"] select', 'udp');
	ok('改成 UDP 后隐藏 HTTP/3', !(await page.locator('.modal [data-o="http3"]').isVisible()));
	i = calls.length;
	await page.click('.modal [data-ok]'); await page.waitForTimeout(400);
	ok('DNS 编辑保存', since(i).some((c) => c.m === 'panel/oc_sec' && c.p.type === 'dns_servers' && c.p.values.type === 'udp'));
	i = calls.length;
	await page.click('#owBody [data-r="1"] [data-up]'); await page.waitForTimeout(400);
	ok('DNS 上移 → oc_move', since(i).some((c) => c.m === 'panel/oc_move' && c.p.dir === 'up'));
	await page.click('#owSeg [data-t="authentication"]'); await page.waitForTimeout(500);
	ok('认证列表', (await page.textContent('#owBody')).includes('Clash'));
	await page.click('#owSeg [data-t="modules"]'); await page.waitForTimeout(600);
	await full('18-ow-modules');
	i = calls.length;
	await page.click('#owBody [data-mod] input', { force: true }); await page.waitForTimeout(300);
	ok('模块启用开关', since(i).some((c) => c.m === 'panel/oc_sec' && c.p.type === 'config_overwrite' && c.p.values.enable === '1'));
	await page.click('#owBody [data-l] [data-r="0"] b'); await page.waitForTimeout(600);
	ok('模块编辑弹窗：模块名只读', await page.locator('.modal [data-o="name"] .val').count() === 1);
	await shot('19-ow-module-edit');
	await closeModal();

	// 规则
	await tab('rules');
	await full('20-rules');
	await page.click('#ruBody [data-e="openclash_custom_rules.list"]'); await page.waitForTimeout(600);
	i = calls.length;
	await page.click('.modal [data-s]'); await page.waitForTimeout(400);
	ok('自定义规则保存 → file_save custom', since(i).some((c) => c.m === 'panel/file_save' && c.p.kind === 'custom'));
	await page.click('#ruSeg [data-k="live"]'); await page.waitForTimeout(600);
	await full('21-rules-live');
	await page.fill('#ruBody [data-kw]', 'douyin'); await page.waitForTimeout(800);
	ok('生效规则搜索', last('panel/rules').p.filter === 'douyin');

	// 插件设置
	await tab('set');
	await full('22-set');
	await overflow('插件设置');
	const tabsN = await page.locator('#setSeg .chip').count();
	ok('插件设置分组（隐藏空分组）', tabsN === 14, String(tabsN));
	for (const t of ['traffic_control', 'dns', 'stream_enhance', 'lan_ac', 'dashboard', 'ipv6', 'geo_update', 'chnr_update', 'auto_restart', 'debug', 'developer', 'version_update', 'oixcloud', 'op_mode']) {
		await page.click(`#setSeg [data-t="${t}"]`); await page.waitForTimeout(350);
		await overflow('插件设置/' + t);
		if (['dns', 'lan_ac', 'dashboard', 'geo_update', 'version_update', 'debug'].includes(t)) await full('23-set-' + t);
	}
	await page.selectOption('#setBody [data-o="en_mode"] select', 'fake-ip');
	ok('运行模式改 Fake-IP 后显示 UDP 转发', await page.locator('#setBody [data-o="enable_udp_proxy"]').isVisible());
	ok('运行模式改 Fake-IP 后隐藏网络栈', !(await page.locator('#setBody [data-o="stack_type"]').isVisible()));
	await page.fill('#setBody [data-o="delay_start"] input', '10');
	i = calls.length;
	await page.click('#setBody .savebar [data-apply]'); await okBtn(); await page.waitForTimeout(500);
	ok('保存并应用 → oc_set + restart', since(i).some((c) => c.m === 'panel/oc_set' && c.p.set.en_mode === 'fake-ip' && c.p.set.delay_start === '10') && since(i).some((c) => c.m === 'panel/quick' && c.p.action === 'restart'));
	await page.click('#setSeg [data-t="lan_ac"]'); await page.waitForTimeout(500);
	await page.click('#setBody [data-o="lan_ac_black_macs"] [data-rm="0"]');
	await page.fill('#setBody [data-o="lan_ac_black_macs"] [data-f="add"]', '02:00:00:00:B2:02'); await page.click('#setBody [data-o="lan_ac_black_macs"] [data-add]');
	i = calls.length;
	await page.click('#setBody .savebar [data-save]'); await page.waitForTimeout(400);
	ok('列表项保存为数组', since(i).some((c) => c.m === 'panel/oc_set' && JSON.stringify(c.p.set.lan_ac_black_macs) === '["02:00:00:00:B2:02"]'));
	await page.click('#setBody [data-extra] [data-add]'); await page.waitForTimeout(500);
	await page.fill('.modal [data-o="comment"] input', '电视不走代理');
	i = calls.length;
	await page.click('.modal [data-ok]'); await page.waitForTimeout(400);
	ok('黑白名单表添加 → oc_sec lan_ac_traffic', since(i).some((c) => c.m === 'panel/oc_sec' && c.p.type === 'lan_ac_traffic' && c.p.values.comment === '电视不走代理' && c.p.values.proto === 'both'));
	await page.click('#setSeg [data-t="dns"]'); await page.waitForTimeout(400);
	i = calls.length;
	await page.click('#setBody [data-o="dnsmasq_fix"] [data-btn]'); await page.waitForTimeout(300);
	ok('Dnsmasq 修复 → oc_button', since(i).some((c) => c.m === 'panel/oc_button' && c.p.option === 'dnsmasq_fix'));
	await page.click('#setSeg [data-t="stream_enhance"]'); await page.waitForTimeout(400);
	i = calls.length;
	await page.click('#setBody [data-unl="claude"]'); await page.waitForTimeout(400);
	ok('流媒体手动测试 → unlock claude', since(i).some((c) => c.m === 'panel/unlock' && c.p.services[0] === 'claude'));
	await page.click('#setSeg [data-t="dashboard"]'); await page.waitForTimeout(500);
	ok('外部控制面板状态', (await page.textContent('#setBody')).includes('已安装'));
	i = calls.length;
	await page.click('#setBody [data-dash="Zashboard"] [data-dop="switch"]'); await page.waitForTimeout(400);
	ok('更新 Zashboard → dashboard', since(i).some((c) => c.m === 'panel/dashboard' && c.p.name === 'Zashboard'));
	await page.click('#setSeg [data-t="version_update"]'); await page.waitForTimeout(400);
	await page.click('#setBody [data-vchk]'); await page.waitForTimeout(400);
	ok('检查更新显示最新版本', (await page.textContent('#setBody')).includes('最新 v0.48.002'));
	await page.click('#setSeg [data-t="geo_update"]'); await page.waitForTimeout(400);
	i = calls.length;
	await page.click('#setBody [data-o="GEOIP Update"] [data-btn]'); await page.waitForTimeout(300); ok('GEO 更新前先提醒会断网', (await page.locator('.modal').last().textContent()).includes('断网')); await okBtn(); await page.waitForTimeout(300);
	ok('GEO 更新按钮 → oc_button', since(i).some((c) => c.m === 'panel/oc_button' && c.p.option === 'GEOIP Update'));
	await page.click('#setSeg [data-t="developer"]'); await page.waitForTimeout(600);
	ok('开发者选项读防火墙脚本', (await page.inputValue('#setBody textarea')).length > 0);

	// 日志
	await tab('log');
	await full('24-log');
	await page.click('#logSeg [data-k="core"]'); await page.waitForTimeout(300);
	ok('内核日志时间格式化', (await page.textContent('#logBox')).includes('[TCP]'));
	i = calls.length;
	await page.click('#logLevel [data-l="info"]'); await page.waitForTimeout(300);
	ok('日志级别 → quick log_level', since(i).some((c) => c.m === 'panel/quick' && c.p.action === 'log_level' && c.p.arg === 'info'));
	await full('25-log-core');

	// 设备 / 连接 / 系统
	await tab('dev'); await full('26-dev'); await overflow('设备');
	await tab('conn'); await full('27-conn'); await overflow('连接');
	await tab('more'); await full('28-more'); await overflow('系统');
	await page.click('[data-t="services"]'); await page.waitForTimeout(500);
	ok('服务管理列表', await page.locator('.modal [data-s]').count() === 3);
	await closeModal();


	// 侧边栏
	await page.click('#menuBtn'); await page.waitForTimeout(500);
	await shot('30-sidebar');
	ok('侧边栏打开', await page.locator('#side.open').count() === 1);
	ok('侧边栏 7 个分组（「消息」）、面板自己的 19 页都在（新加「通知」）', await page.locator('#sidenav .nghead').count() === 7 && await page.evaluate(() => ['home','proxy','subs','cfg','ow','rules','set','log','dev','black','conn','wd','term','files','more','slog','proc','myfb','notice'].every((p) => document.querySelector(`#sidenav button[data-p="${p}"]`))));
	await page.click('#scrim', { position: { x: 370, y: 400 } }); await page.waitForTimeout(500);
	ok('点遮罩关闭侧边栏', await page.locator('#side.open').count() === 0);

	// 拉黑
	await tab('black');
	await full('31-black');
	await overflow('拉黑名单');
	ok('拉黑页显示未启用', (await page.textContent('#blBody')).includes('未启用'));
	i = calls.length;
	await page.click('#blBody [data-d="1"] [data-black]'); await page.waitForTimeout(300);
	ok('拉黑前先提醒', (await page.locator('.modal').last().textContent()).includes('只能用大陆网络'));
	await okBtn(); await page.waitForTimeout(400);
	ok('拉黑 → black_set', since(i).some((c) => c.m === 'panel/black_set' && c.p.on === true && c.p.mac === '11:22:33:44:55:66'));
	ok('未启用时提示启用', (await page.locator('.modal').last().textContent()).includes('启用拉黑功能'));
	await okBtn(); await page.waitForTimeout(500);
	ok('启用 → black_setup', since(i).some((c) => c.m === 'panel/black_setup' && c.p.restart === true));
	await tab('black'); await page.waitForTimeout(300);
	await full('32-black-after');
	ok('已拉黑列表 1 台', await page.locator('#blBody [data-e]').count() === 1);
	i = calls.length;
	await page.click('#blBody [data-un]'); await page.waitForTimeout(400);
	ok('解除 → black_set off', since(i).some((c) => c.m === 'panel/black_set' && c.p.on === false));
	await page.click('#blBody [data-manual]'); await page.waitForTimeout(300);
	await page.fill('.modal input', '192.168.5.9'); await page.click('.modal [data-ok]'); await page.waitForTimeout(300); await okBtn(); await page.waitForTimeout(400);
	ok('按 IP 拉黑（无 MAC）', last('panel/black_set').p.ip === '192.168.5.9' && !last('panel/black_set').p.mac);
	await tab('dev');
	await full('33-dev-black');
	ok('设备页显示已拉黑', (await page.textContent('#dvList')).includes('已拉黑'));

	// 终端
	await tab('term');
	await page.fill('#termIn', 'cd /etc'); await page.press('#termIn', 'Enter'); await page.waitForTimeout(300);
	ok('终端 cd 记住目录', (await page.textContent('#termPs')).startsWith('/etc'));
	await page.fill('#termIn', 'ls -la'); await page.press('#termIn', 'Enter'); await page.waitForTimeout(300);
	ok('终端执行 → term', last('panel/term').p.cmd === 'ls -la' && last('panel/term').p.cwd === '/etc');
	ok('终端显示输出', (await page.textContent('#termOut')).includes('output of ls -la'));
	await page.click('#termQuick [data-q="0"]'); await page.waitForTimeout(300);
	ok('快捷命令', last('panel/term').p.cmd.startsWith('uptime'));
	await page.fill('#termIn', 'vi /etc/config/network'); await page.press('#termIn', 'Enter'); await page.waitForTimeout(200);
	ok('交互命令被拦下提示', (await page.textContent('#termOut')).includes('不支持需要交互'));
	await page.press('#termIn', 'ArrowUp'); 
	ok('上键调出历史', (await page.inputValue('#termIn')).length > 0);
	await shot('34-term');
	await overflow('终端');

	// 文件管理
	await tab('files');
	await full('35-files');
	await overflow('文件管理');
	ok('文件列表', await page.locator('#fmList [data-f]').count() === 3);
	await page.click('#fmList [data-f="0"]'); await page.waitForTimeout(400);
	ok('进入子文件夹', last('panel/fs_list').p.path === '/etc/openclash/config');
	await page.click('#fmList [data-up]'); await page.waitForTimeout(400);
	await page.click('#fmList [data-f="1"]'); await page.waitForTimeout(400);
	await shot('36-files-sheet');
	await page.click('.modal [data-v="edit"]'); await page.waitForTimeout(500);
	await page.fill('.modal [data-t]', 'new content');
	i = calls.length;
	await page.click('.modal [data-s]'); await page.waitForTimeout(400);
	ok('编辑保存 → fs_write', since(i).some((c) => c.m === 'panel/fs_write' && c.p.content === 'new content' && c.p.overwrite));
	await page.click('#fmList [data-f="1"]'); await page.waitForTimeout(400);
	await page.click('.modal [data-v="del"]'); await page.waitForTimeout(300); await okBtn(); await page.waitForTimeout(300);
	ok('删除 → fs_delete', last('panel/fs_delete').p.path === '/etc/openclash/zou.yaml');
	await page.click('#fmNewDir'); await page.waitForTimeout(300); await page.fill('.modal input', 'newdir'); await page.click('.modal [data-ok]'); await page.waitForTimeout(300);
	ok('新建文件夹', last('panel/fs_mkdir').p.path === '/etc/openclash/newdir');
	await page.click('#fmCrumb [data-p="/"]'); await page.waitForTimeout(400);
	ok('面包屑跳到根目录', last('panel/fs_list').p.path === '/');

	// 未保存提醒
	await tab('set');
	await page.click('#setSeg [data-t="op_mode"]'); await page.waitForTimeout(400);
	await page.fill('#setBody [data-o="delay_start"] input', '99');
	await page.click('#menuBtn'); await page.waitForTimeout(450); await page.click('#sidenav button[data-p="home"]'); await page.waitForTimeout(400);
	ok('有未保存修改时离开会提醒', (await page.locator('.modal').count()) === 1);
	await page.click('.modal [data-v="false"]'); await page.waitForTimeout(400);
	ok('取消后留在插件设置', await page.locator('#p-set.on').count() === 1);

	await browser.close();
	const pass = results.filter((r) => r[1]).length;
	console.log(`\n通过 ${pass}/${results.length}`);
	results.filter((r) => !r[1]).forEach((r) => console.log('✗', r[0], r[2]));
	if (problems.length) { console.log('\n问题：'); [...new Set(problems)].forEach((p) => console.log(' -', p)); }
	fs.writeFileSync(path.join(__dirname, 'results' + sfx + '.json'), JSON.stringify({ results, problems }, null, 1));
})().catch((e) => { console.error('脚本异常', e); process.exit(1); });

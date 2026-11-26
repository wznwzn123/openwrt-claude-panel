// 6.0 第 32 项（面板）：常用服务——文件共享（列出、添加、删除）、FTP（开前确认、外网能连标出来）、SSH（端口、只允许局域网、密码登录）、指示灯；
// 没装的给软件中心入口；只有主账号能进；320 / 390 / 430、深色不错位不横向滚动
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const mock = require('./mock');
const ROOT = (process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel'));
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const results = [], problems = [];
const ok = (n, c, note) => { results.push([n, !!c, note || '']); if (!c) problems.push(n + (note ? '：' + note : '')); };
let S;
const fresh = () => ({
	calls: [],
	d: {
		smb: { kind: 'samba4', name: 'Samba', on: false, run: false, lan: true, wan: false, shares: [{ id: 'old', name: 'share', path: '/mnt/sda1', ro: false, guest: true }, { id: 'b', name: '一个名字很长很长的共享文件夹用来测试截断', path: '/mnt/My Disk/很长的路径/再长一点/还要更长一点点', ro: true, guest: false }], disks: ['/mnt/sda1', '/mnt/My Disk'] },
		ftp: { kind: 'vsftpd', on: false, run: false, wan: true },
		ssh: { kind: 'dropbear', on: true, run: true, port: 22, lan: false, pw: true, keys: 0, wan: false },
		led: { n: 3, on: true },
	},
});
function handle(m, p) {
	S.calls.push({ m, p });
	const d = S.d;
	if (m === 'svcsw_get') return d;
	if (m === 'svcsw_set') {
		if (p.smb) {
			if (p.smb.add) { if (!/^\/mnt\//.test(p.smb.add.path)) throw new Error('只能共享 /mnt、/media 下面的文件夹（插的硬盘、U 盘）'); d.smb.shares.push({ id: 'n' + d.smb.shares.length, name: p.smb.add.name, path: p.smb.add.path, ro: !!p.smb.add.ro, guest: true }); }
			else if (p.smb.del) d.smb.shares = d.smb.shares.filter((x) => x.id !== p.smb.del);
			else { d.smb.on = d.smb.run = !!p.smb.on; }
		}
		if (p.ftp) d.ftp.on = d.ftp.run = !!p.ftp.on;
		if (p.ssh) {
			if (p.ssh.pw === false && !d.ssh.keys) throw new Error('先在原版后台「SSH 密钥」里加一个密钥，不然关了密码就登不进去');
			if (p.ssh.port != null) { if (+p.ssh.port === 80) throw new Error('端口 80 路由器自己在用'); d.ssh.port = +p.ssh.port; }
			for (const k of ['on', 'lan', 'pw']) if (p.ssh[k] != null) d.ssh[k] = p.ssh[k];
			d.ssh.run = d.ssh.on;
		}
		if (p.led) d.led.on = !!p.led.on;
		return d;
	}
	return mock.respond(m, p);
}
const server = http.createServer((req, res) => { let b = ''; req.on('data', (x) => (b += x)); req.on('end', () => {
	const u = new URL(req.url, 'http://x'), J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
	if (u.pathname.startsWith('/cgi-bin/mcp/')) { const body = JSON.parse(b || '{}'); const m = body.method.replace(/^panel\//, ''); return setTimeout(() => { try { J({ jsonrpc: '2.0', id: body.id, result: handle(m, body.params || {}) }); } catch (e) { J({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } }); } }, 80); }
	if (u.pathname.startsWith('/cloud/')) return J({ error: 'x' });
	const p = u.pathname.replace(/^\/panel\//, '') || 'index.html', f = path.join(ROOT, p);
	if (!fs.existsSync(f)) { res.writeHead(404); return res.end(''); }
	res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
}); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const set = (k) => S.calls.filter((c) => c.m === 'svcsw_set').map((c) => c.p).filter((p) => k(p));
(async () => {
	await new Promise((r) => server.listen(8193, r));
	const browser = await chromium.launch();
	for (const [w, h, dark] of [[320, 640, false], [390, 844, true], [430, 932, false]]) {
		const T = `（${w}${dark ? ' 深色' : ''}）`;
		S = fresh();
		const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
		const page = await ctx.newPage(); page.on('pageerror', (e) => problems.push('页面错误' + T + '：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8193/panel/?p=svcsw'); await W(1600);
		let t = await page.textContent('#ssBody');
		ok('四块：文件共享、FTP、SSH、指示灯' + T, ['文件共享', 'FTP', 'SSH', '指示灯'].every((x) => t.includes(x)) && /Samba · 关着/.test(t) && /3 个/.test(t), t.slice(0, 200));
		ok('FTP 外网能连标出来' + T, /外网能连：防火墙放行了 21 端口/.test(t));
		ok('共享列表：名字、路径、只读、要密码' + T, /share/.test(t) && /\/mnt\/sda1/.test(t) && /只读/.test(t) && /要密码/.test(t));
		ok('SSH：端口、只允许局域网、密码登录、没有密钥' + T, (await page.inputValue('#ssPort')) === '22' && /只允许局域网/.test(t) && /密码登录/.test(t) && /没有密钥/.test(t));
		const lay = await page.evaluate(() => {
			const bad = [];
			if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('横向滚动');
			document.querySelectorAll('#ssBody .kv, #ssBody .file, #ssBody .btn, #ssBody .sw').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && (r.right > innerWidth - 8 || r.left < 8)) bad.push('出界：' + el.className + ' ' + el.textContent.slice(0, 12)); });
			document.querySelectorAll('#ssBody .kv.aswon').forEach((k) => { const s = k.querySelector('.sw'), b = k.querySelector('b'); if (s && b && b.getBoundingClientRect().right > s.getBoundingClientRect().left) bad.push('压到开关：' + b.textContent); });
			document.querySelectorAll('#ssBody .btn').forEach((b) => { if (b.offsetParent && b.scrollWidth > b.clientWidth + 1) bad.push('按钮字截断：' + b.textContent); });
			return bad;
		});
		ok('不错位、不出界、不横向滚动' + T, !lay.length, lay.join('；'));
		await page.screenshot({ path: path.join(SHOT, `svcsw-${w}${dark ? '-dark' : ''}.png`), fullPage: true });
		// 开共享：不用确认
		await page.click('[data-ss="smb"]'); await W(400);
		ok('开共享：直接开，写「运行中」' + T, set((p) => p.smb && p.smb.on === true).length === 1 && /Samba · 运行中/.test(await page.textContent('#ssBody')) && /已开启文件共享/.test(await page.textContent('#toast')));
		// 开 FTP：先确认
		await page.click('[data-ss="ftp"]'); await W(300);
		ok('开 FTP 前确认：明文传输' + T, /开启 FTP/.test(await page.textContent('.modal')) && /明文/.test(await page.textContent('.modal')));
		await page.screenshot({ path: path.join(SHOT, `svcsw-ftp-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-v="false"]'); await W(300);
		ok('取消：开关拨回去，没发请求' + T, !(await page.isChecked('[data-ss="ftp"]')) && !set((p) => p.ftp).length);
		await page.click('[data-ss="ftp"]'); await W(300); await page.click('.modal [data-v="true"]'); await W(400);
		ok('确认后开 FTP' + T, set((p) => p.ftp && p.ftp.on).length === 1 && /已开启 FTP/.test(await page.textContent('#toast')));
		// SSH 密码登录：没密钥，路由器拒绝 → 开关拨回去
		await page.click('[data-ss="pw"]'); await W(300); await page.click('.modal [data-v="true"]'); await W(400);
		ok('没密钥关密码登录：说原因，开关拨回' + T, /先在原版后台/.test(await page.textContent('#toast')) && (await page.isChecked('[data-ss="pw"]')));
		// 端口
		ok('端口没改不显示保存' + T, !(await page.isVisible('#ssPortSave')));
		await page.fill('#ssPort', '2222'); await W(100);
		ok('改了端口出现保存' + T, await page.isVisible('#ssPortSave'));
		await page.click('#ssPortSave'); await W(400);
		ok('保存端口' + T, S.d.ssh.port === 2222 && /SSH 端口改成 2222/.test(await page.textContent('#toast')) && (await page.inputValue('#ssPort')) === '2222');
		// 只允许局域网：打开不用确认
		await page.click('[data-ss="lan"]'); await W(400);
		ok('只允许局域网：直接打开' + T, S.d.ssh.lan === true && !(await page.$('.modal')));
		// 关 SSH：确认
		await page.click('[data-ss="ssh"]'); await W(300);
		ok('关 SSH 前确认：面板不受影响' + T, /关闭 SSH/.test(await page.textContent('.modal')) && /面板不受影响/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="true"]'); await W(400);
		ok('关了 SSH：端口这些行收起来' + T, S.d.ssh.on === false && !(await page.$('#ssPort')));
		// 添加共享
		await page.click('#ssAdd'); await W(300);
		ok('添加共享：文件夹默认第一个硬盘，多个硬盘可点选' + T, (await page.inputValue('.modal [data-a="path"]')) === '/mnt/sda1' && (await page.locator('.modal [data-dk]').count()) === 2);
		await page.screenshot({ path: path.join(SHOT, `svcsw-add-${w}${dark ? '-dark' : ''}.png`) });
		await page.click('.modal [data-dk="/mnt/My Disk"]');
		await page.fill('.modal [data-a="name"]', '电影'); await page.click('.modal [data-a="ro"]');
		await page.click('.modal [data-v="add"]'); await W(500);
		ok('添加共享：带名字、文件夹、只读' + T, set((p) => p.smb && p.smb.add && p.smb.add.name === '电影' && p.smb.add.path === '/mnt/My Disk' && p.smb.add.ro === true).length === 1 && /已添加共享「电影」/.test(await page.textContent('#toast')) && !(await page.$('.modal')));
		// 删除共享：确认
		await page.click('[data-ssdel="old"]'); await W(300);
		ok('删除共享前确认：文件不会删' + T, /删除共享「share」/.test(await page.textContent('.modal')) && /文件不会删/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="true"]'); await W(400);
		ok('删掉了' + T, !S.d.smb.shares.some((x) => x.id === 'old') && /已删除共享「share」/.test(await page.textContent('#toast')));
		// 指示灯：关之前确认
		await page.click('[data-ss="led"]'); await W(300);
		ok('关指示灯前确认：重启后也灭' + T, /重启后也是灭的/.test(await page.textContent('.modal')));
		await page.click('.modal [data-v="true"]'); await W(400);
		ok('关了指示灯' + T, S.d.led.on === false && /已关闭指示灯/.test(await page.textContent('#toast')));
		ok('操作后还是不横向滚动' + T, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
		await ctx.close();
	}
	// 没装、没有灯、OpenSSH
	{
		S = fresh();
		S.d.smb = { kind: null, pkg: 'luci-app-samba4' }; S.d.ftp = { kind: null, pkg: false }; S.d.led = { n: 0, on: true };
		S.d.ssh = { kind: 'openssh', on: true, run: true, port: 22, wan: true };
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push('页面错误（没装）：' + e.message));
		await page.addInitScript(() => { localStorage.setItem('rp_token', 'testtoken1234567890'); });
		await page.goto('http://localhost:8193/panel/?p=svcsw'); await W(1600);
		const t = await page.textContent('#ssBody');
		ok('没装共享：给软件中心入口；FTP 软件源里没有', /没装/.test(t) && (await page.locator('[data-ssget="luci-app-samba4"]').count()) === 1 && /软件源里没有/.test(t), t.slice(0, 200));
		ok('没有灯：说原因', /没有能控制的指示灯/.test(t) && !(await page.$('[data-ss="led"]')));
		ok('OpenSSH：只有开关，端口写在状态里，外网能连标出来', /OpenSSH · 端口 22/.test(t) && !(await page.$('#ssPort')) && /外网能连：防火墙放行了 22 端口/.test(t));
		await page.screenshot({ path: path.join(SHOT, 'svcsw-none.png') });
		await page.click('[data-ssget="luci-app-samba4"]'); await W(500);
		ok('点「去软件中心装」：打开软件中心并搜好', (await page.inputValue('#stFilter')) === 'luci-app-samba4' && await page.isVisible('#p-store'));
		// 菜单里有
		await page.goto('http://localhost:8193/panel/?p=home'); await W(1200);
		ok('菜单「系统」里有「常用服务」', await page.evaluate(() => [...document.querySelectorAll('[data-p="svcsw"]')].some((b) => /常用服务/.test(b.textContent))));
		await ctx.close();
	}
	await browser.close(); server.close();
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	if (problems.length) console.log('\n问题：\n - ' + problems.join('\n - '));
	process.exit(problems.length ? 1 : 0);
})();

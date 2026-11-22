// 6.0 第 2 项：手机推送（sw.js）——通知上的按钮（新设备「暂停它上网」）：只认面板自己的地址；点按钮打开面板对应的地方
// 用 Node 模拟 Service Worker 的环境跑 sw.js，不需要浏览器
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = process.env.PANEL_WWW ? path.join(process.env.PANEL_WWW, 'panel') : path.join(__dirname, '..', '..', 'src', 'www', 'panel');
const results = [];
const ok = (n, c, note) => results.push([n, !!c, note || '']);
const H = {}, shown = [], opened = [], posted = [];
let clients = [];
const self = {
	addEventListener: (t, f) => { H[t] = f; },
	registration: { scope: 'https://r.example.com/panel/', showNotification: async (title, o) => { shown.push({ title, o }); } },
	clients: { matchAll: async () => clients, openWindow: async (u) => { opened.push(u); } },
	location: 'https://r.example.com/panel/sw.js',
	skipWaiting: () => {}, Notification: { permission: 'granted' },
};
const ctx = { self, caches: { open: async () => ({ match: async () => null, put: async () => {} }), keys: async () => [], delete: async () => {} }, fetch: async () => new Response('{}'), URL, Response, Request, console, setTimeout };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), ctx);
const fire = async (type, ev) => { let p = null; ev.waitUntil = (x) => { p = x; }; H[type](ev); await p; };
(async () => {
	await fire('push', { data: { json: () => ({ title: '新设备连上了：Redmi', body: 'IP 192.168.1.50', tag: 'newdev-aa:bb:cc:dd:ee:01', url: './?p=dev', actions: [{ action: 'pause', title: '暂停它上网', url: './?p=dev&ask=pause&mac=aa:bb:cc:dd:ee:01' }, { action: 'evil', title: 'x', url: 'https://evil.example/' }] }) } });
	const n = shown[0];
	ok('通知上显示「暂停它上网」按钮', n && n.o.actions.length === 1 && n.o.actions[0].action === 'pause' && n.o.actions[0].title === '暂停它上网', JSON.stringify(n && n.o.actions));
	ok('按钮只认面板自己的地址（外面的网址丢掉）', n && !JSON.stringify(n.o.data).includes('evil'));
	// 面板没开：点按钮打开面板（带着要暂停哪台）
	clients = [];
	await fire('notificationclick', { action: 'pause', notification: { close() {}, data: n.o.data } });
	ok('面板没开：点「暂停它上网」打开面板设备页，弹出这台的暂停设置', opened[0] === 'https://r.example.com/panel/?p=dev&ask=pause&mac=aa:bb:cc:dd:ee:01', opened[0]);
	// 面板开着：切过去并告诉面板
	clients = [{ url: 'https://r.example.com/panel/?p=home', postMessage: (m) => posted.push(m), focus: async () => {} }];
	await fire('notificationclick', { action: 'pause', notification: { close() {}, data: n.o.data } });
	ok('面板开着：切到设备页并弹出暂停设置', posted[0] && posted[0].go === 'dev' && posted[0].ask === 'pause' && posted[0].mac === 'aa:bb:cc:dd:ee:01', JSON.stringify(posted[0]));
	// 点通知本身（不是按钮）：只打开设备页
	await fire('notificationclick', { action: '', notification: { close() {}, data: n.o.data } });
	ok('点通知本身：只打开设备页，不弹暂停', posted[1] && posted[1].go === 'dev' && !posted[1].ask, JSON.stringify(posted[1]));
	// 以前的推送（没有按钮）照常
	await fire('push', { data: { json: () => ({ title: 'DNS 解析失败', body: 'x' }) } });
	ok('没有按钮的推送照常显示，点了去断线记录', shown[1] && shown[1].o.actions.length === 0 && shown[1].o.data.url === './?p=wd');
	console.log(results.map((r) => (r[1] ? '✓ ' : '✗ ') + r[0] + (r[2] && !r[1] ? '（' + r[2] + '）' : '')).join('\n'));
	console.log(`\n通过 ${results.filter((r) => r[1]).length}/${results.length}`);
	process.exit(results.every((r) => r[1]) ? 0 : 1);
})();

// 真实面板采集：直接加载仓库里的 src/www/panel/index.html，后端接口换成演示数据（不连真实路由器）。
// 演示数据里没有真实 IP / MAC / 域名 / 密钥。输出：public/ui/*.png（3x）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../src/www');
const OUT = path.resolve(__dirname, '../public/ui');
fs.mkdirSync(OUT, { recursive: true });
const LAYOUT = {};
const NOW = Date.parse('2026-11-09T21:30:00+08:00');
const GB = 1024 ** 3, MB = 1024 ** 2;
// 首页曲线：用一组平滑的演示数值（字节/秒）
const wave = (n, base, amp, ph) => Array.from({ length: n }, (_, i) => Math.round(base + amp * (0.55 * Math.sin(i * 0.42 + ph) + 0.3 * Math.sin(i * 0.17 + ph * 2) + 0.15 * Math.sin(i * 1.1))));
const RX = wave(30, 3.1 * MB, 1.6 * MB, 0.3), TX = wave(30, 0.42 * MB, 0.22 * MB, 1.7);
const MOCK = {
  initialize: { serverInfo: { name: 'panel', version: '3.1.1' } },
  'panel/overview': { system: { model: 'OpenWrt 演示路由器', uptime: 8 * 86400 }, px: { list: [], active: null } },
  'panel/live': { rx: RX[RX.length - 1], tx: TX[TX.length - 1] },
  'panel/home_stats': { today: { dl: 18.6 * GB, ul: 2.1 * GB, counting: true, top: [
    { id: 'd1', name: '客厅电视', dl: 7.9 * GB, ul: 0.3 * GB }, { id: 'd2', name: '书房电脑', dl: 4.6 * GB, ul: 0.9 * GB }, { id: 'd3', name: '我的手机', dl: 2.8 * GB, ul: 0.4 * GB }] },
    devices: { online: 9, wifi: 7, wired: 2, total: 14 } },
  'panel/update_check': { cur: '3.1.0', latest: '3.1.1', newer: true, force: false,
    notes: '面板里有了「我的反馈」，能看到每条反馈处理到哪一步\n开发者有新进展，一分钟内就会提醒你\n更新后用法和以前一样，不用重新登录' },
  'panel/auto': { on: {}, oc: false, cloud: true, route: false },
  'panel/black_state': { devices: [
    { name: '客厅电视', ip: '192.168.1.20', online: true, stats: { conns: 12, dl: 7.9 * GB, ul: 0.3 * GB } },
    { name: '书房电脑', ip: '192.168.1.31', online: true, stats: { conns: 38, dl: 4.6 * GB, ul: 0.9 * GB } },
    { name: '孩子的平板', ip: '192.168.1.45', online: true, stats: { conns: 6, dl: 1.2 * GB, ul: 0.1 * GB } }] },
  'panel/pause_list': { devs: {} },
  'panel/fb_replies': { hosted: true, list: [
    { code: 'K7Q2M9XA', at: NOW - 3 * 86400e3, text: '闪存只剩 20 MB 左右，装不下 cloudflared，能不能想想办法？', stage: 3, state: 'fixed', done: true,
      ackAt: NOW - 3 * 86400e3 + 40 * 60e3, updated: NOW - 86400e3, seen: NOW,
      history: [{ at: NOW - 86400e3, st: 'fixed', note: 'v3.1.0 加了「小闪存模式」：cloudflared 开机后下载到内存里运行，核对校验值后才用。' }] }] },
  'panel/svc_info': {}, 'panel/jobs': { jobs: {} }, // 一台没装任何代理类插件的普通 OpenWrt 的菜单（侧边栏按真实菜单显示，没装的不出现）
  'panel/luci_menu': { items: [{ p: 'admin/status/overview', t: '' },{ p: 'admin/status/realtime/bandwidth', t: '' },{ p: 'admin/status/realtime/load', t: '' },{ p: 'admin/status/realtime/connections', t: '' },{ p: 'admin/network/network', t: '' },{ p: 'admin/network/wireless', t: '' },{ p: 'admin/network/dhcp', t: '' },{ p: 'admin/network/dns', t: '' },{ p: 'admin/network/diagnostics', t: '' },{ p: 'admin/network/firewall/zones', t: '' },{ p: 'admin/network/firewall/forwards', t: '' },{ p: 'admin/network/firewall/rules', t: '' },{ p: 'admin/services/upnp', t: '' },{ p: 'admin/system/system', t: '' },{ p: 'admin/system/admin', t: '' },{ p: 'admin/system/package-manager', t: '' },{ p: 'admin/system/startup', t: '' },{ p: 'admin/system/crontab', t: '' },{ p: 'admin/system/flash', t: '' },{ p: 'admin/system/reboot', t: '' }] }, 'panel/cloud_info': {}, 'panel/ckey_info': { ai: true },
};
async function boot(b, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: opts.w || 390, height: opts.h || 844 }, deviceScaleFactor: opts.dpr || 3, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', colorScheme: opts.dark ? 'dark' : 'light' });
  await ctx.addInitScript(({ rx, tx, wall, dark }) => {
    localStorage.setItem('rp_token', 'demo0000demo0000demo0000');
    localStorage.setItem('rp_glass', '1'); localStorage.setItem('rp_wall', wall);
    if (dark) localStorage.setItem('rp_dark', '1');
    sessionStorage.setItem('rp_mh', JSON.stringify({ rx, tx, at: Date.now() }));
  }, { rx: RX.slice(0, -1), tx: TX.slice(0, -1), wall: opts.wall || 'aurora', dark: !!opts.dark });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/cgi-bin/mcp/')) {
      const body = JSON.parse(route.request().postData() || '{}');
      const k = body.method === 'tools/call' ? 'tool:' + body.params.name : body.method;
      if (!(k in MOCK)) console.log('  (no mock)', k);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: MOCK[k] || {} }) });
    }
    if (u.pathname.startsWith('/cloud/')) return route.fulfill({ status: 404, body: '' });
    if (u.pathname.startsWith('/__fonts/')) {
      const ff = path.resolve(__dirname, '../node_modules/@fontsource-variable', u.pathname.slice(9));
      return fs.existsSync(ff) ? route.fulfill({ status: 200, body: fs.readFileSync(ff), contentType: ff.endsWith('.css') ? 'text/css' : 'font/woff2' }) : route.fulfill({ status: 404, body: '' });
    }
    let f = path.join(ROOT, decodeURIComponent(u.pathname)); if (f.endsWith('/')) f += 'index.html';
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ status: 200, body: fs.readFileSync(f), contentType: f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.png') ? 'image/png' : undefined });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://router.demo/panel/' + (opts.p ? '?p=' + opts.p : ''));
  await page.waitForTimeout(3500);
  // 底部快捷栏里是代理插件相关的按钮，这支片子不展示，截图时隐藏；动画、光标一律停住
  // 手机上用的是系统字体（苹方 / 鸿蒙黑体等）；采集机没有这些字体，换成同类的开源字体 Noto Sans SC + Inter
  await page.addStyleTag({ content: "@import url('/__fonts/noto-sans-sc/index.css');@import url('/__fonts/inter/index.css');@import url('/__fonts/jetbrains-mono/index.css');" +
    ":root{--mono:'JetBrains Mono Variable',monospace!important} html,body,button,input,textarea,select{font-family:'Inter Variable','Noto Sans SC Variable',sans-serif!important} .mono,code,pre{font-family:'JetBrains Mono Variable','Noto Sans SC Variable',monospace!important}" +
    '.dock{display:none!important} .toast{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  return { ctx, page };
}
async function el(page, sel, name, pad = 0) {
  const h = await page.$(sel);
  if (!h) { console.log('missing', sel); return; }
  const bb = await h.boundingBox(); if (!bb || bb.height < 2) { console.log('empty', sel); return; }
  await page.screenshot({ path: path.join(OUT, name + '.png'), clip: { x: bb.x - pad, y: bb.y - pad, width: bb.width + pad * 2, height: bb.height + pad * 2 }, omitBackground: false });
  console.log('saved', name, Math.round(bb.width), 'x', Math.round(bb.height));
}
(async () => {
  const b = await chromium.launch();
  // 1) 首页：整屏 + 各张卡片
  let { ctx, page } = await boot(b, { p: 'main' });
  await page.screenshot({ path: path.join(OUT, 'home-full.png') });
  await page.evaluate(() => { document.querySelectorAll('section.card').forEach((s, i) => s.dataset.cap = i); });
  const cards = await page.$$eval('section.page.on section.card, section.page.on .card', (els) => els.filter((e) => e.offsetParent).map((e) => ({ id: e.id, txt: e.innerText.slice(0, 30).replace(/\n/g, ' ') })));
  console.log(cards);
  await el(page, '#mChart', 'home-chart-svg');
  for (const [id, n] of [['#mChart', 'card-live'], ['#mDl', 'card-today'], ['#mOn', 'card-devices'], ['#rUpd', 'card-update']]) {
    const sel = await page.evaluate((id) => { const e = document.querySelector(id); const c = e && (e.closest('section.card') || e.closest('.card') || e); if (!c) return null; c.dataset.capx = '1'; return true; }, id);
    if (sel) { await el(page, '[data-capx="1"]', n); await page.evaluate(() => document.querySelectorAll('[data-capx]').forEach((e) => delete e.dataset.capx)); }
  }
  // 更新弹窗
  await page.click('#rUpdMore').catch(() => console.log('no rUpdMore'));
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, 'update-sheet-full.png') });
  await page.waitForTimeout(800); await el(page, '.modal .modalbox', 'update-sheet');
  await ctx.close();
  // 2) 自动任务
  ({ ctx, page } = await boot(b, { p: 'auto', h: 1400 }));
  await page.screenshot({ path: path.join(OUT, 'auto-full.png') });
  await el(page, '#auCard', 'auto-cards');
  await ctx.close();
  // 3) 我的反馈
  ({ ctx, page } = await boot(b, { p: 'myfb' }));
  await page.click('[data-hist]').catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'myfb-full.png') });
  await el(page, '.fbitem', 'myfb-card');
  await ctx.close();
  // 4) 设备
  ({ ctx, page } = await boot(b, { p: 'dev' }));
  await page.screenshot({ path: path.join(OUT, 'dev-full.png') });
  await el(page, '#dvList', 'dev-list');
  await ctx.close();
  // 5) 深色首页
  ({ ctx, page } = await boot(b, { p: 'main', dark: true, wall: 'night' }));
  await page.screenshot({ path: path.join(OUT, 'home-dark-full.png') });
  await ctx.close();
  if (process.env.DESK) {
    for (const [p, name] of [['main', 'desk-home'], ['auto', 'desk-auto'], ['myfb', 'desk-myfb']]) {
      ({ ctx, page } = await boot(b, { p, w: 1920, h: 1200, dpr: 2 }));
      await page.screenshot({ path: path.join(OUT, name + '.png') });
      // layout.json：每个关键元素在页面坐标系（CSS px）里的位置，镜头推拉和高亮框直接用
      LAYOUT[name] = await page.evaluate(() => {
        const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.height > 1 ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null; };
        const card = (sel) => { const e = document.querySelector(sel); return r(e && (e.closest('section.card') || e)); };
        const out = { pageW: innerWidth, pageH: innerHeight, side: r(document.querySelector('#side')), top: r(document.querySelector('#topbar')),
          update: r(document.querySelector('#rUpd')), live: card('#mChart'), today: card('#mDl'), devices: card('#mOn'),
          updLater: r(document.querySelector('#rUpdLater')), updGo: r(document.querySelector('#rUpdGo')),
          fb: r(document.querySelector('.fbitem')), fsteps: r(document.querySelector('.fsteps')), fbcode: r(document.querySelector('[data-fbcode]')),
          auto: [...document.querySelectorAll('.aucard')].map(r), autoRows: [...document.querySelectorAll('.aucard [data-au]')].map(r),
          proxyGroup: r(document.querySelector('[data-g="代理"]')) };
        return out;
      });
      await ctx.close();
    }
  }
  if (process.env.DESK) fs.writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify(LAYOUT, null, 1));
  await b.close();
})();

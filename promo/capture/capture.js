// 用仓库里真实的面板代码（src/www/panel）截图：本地假 API 喂演示数据，3× 分辨率。
// 需要先在 src/www 起静态服务：python3 -m http.server 8765 --bind 127.0.0.1
// 用法：node capture/capture.js [scale]   → public/shots/real/*.png + rects.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '../public/shots/real');
fs.mkdirSync(OUT, { recursive: true });
const SCALE = +(process.argv[2] || 3);
const VW = 393, VH = 852, SAT = 54; // 54px = iPhone 状态栏安全区（片中 Phone 组件在这块画时间/信号/电量）

const BASE = Date.parse('2026-11-12T21:46:08+08:00'); // 片中统一的演示时刻：晚上 9:46
const NOW = Math.floor(BASE / 1000);
const MAC = (n) => `3c:22:fb:4a:1e:${String(n).padStart(2, '0')}`;
const DEVS = [
  { name: '客厅电视', ip: '192.168.1.23', mac: MAC(11), online: true, stats: { conns: 38, proxied: 0, dl: 33.5e9, ul: 0.43e9 } },
  { name: '书房台式机', ip: '192.168.1.10', mac: MAC(12), online: true, stats: { conns: 126, proxied: 0, dl: 8.4e9, ul: 2.1e9 } },
  { name: '儿童平板', ip: '192.168.1.36', mac: MAC(13), online: true, stats: { conns: 14, proxied: 0, dl: 1.9e9, ul: 0.12e9 } },
  { name: '我的手机', ip: '192.168.1.52', mac: MAC(14), online: true, stats: { conns: 41, proxied: 0, dl: 3.2e9, ul: 0.6e9 } },
  { name: '家人的手机', ip: '192.168.1.57', mac: MAC(15), online: true, stats: { conns: 22, proxied: 0, dl: 1.4e9, ul: 0.3e9 } },
  { name: '智能音箱', ip: '192.168.1.71', mac: MAC(16), online: true, stats: { conns: 3, proxied: 0, dl: 0.08e9, ul: 0.01e9 } },
  { name: '扫地机器人', ip: '192.168.1.88', mac: MAC(17), online: false },
];
const day = (n) => new Date(BASE + 8 * 3600e3 - n * 864e5).toISOString().slice(0, 10);
const TODAY = day(0);
const trafDays = {};
for (let i = 0; i < 40; i++) {
  const k = 0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + 0.4)) + (i % 7 === 5 || i % 7 === 6 ? 0.35 : 0);
  const g = (x) => Math.round(x * k * 1e9);
  // 四元组 = [加速上行, 加速下行, 直连上行, 直连下行]；今天（i=0）的各设备合计与设备页 DEVS 的 dl+ul 完全一致，
  // 全部相加 = 首页「今日」= 48.5 GB（审片 B4：首页、流量页、片中柱状图三处统一）
  trafDays[day(i)] = i === 0 ? {
    [MAC(11)]: [0.03e9, 31.0e9, 0.40e9, 2.50e9],
    [MAC(12)]: [0.9e9, 5.0e9, 1.2e9, 3.4e9],
    [MAC(13)]: [0.02e9, 1.2e9, 0.10e9, 0.70e9],
    [MAC(14)]: [0.3e9, 2.0e9, 0.3e9, 1.2e9],
    [MAC(15)]: [0.1e9, 0.9e9, 0.2e9, 0.5e9],
    [MAC(16)]: [0, 0.06e9, 0.01e9, 0.02e9],
  } : {
    [MAC(11)]: [g(0.05), g(14), g(0.02), g(2.2)],
    [MAC(12)]: [g(0.8), g(4.6), g(0.6), g(2.4)],
    [MAC(13)]: [g(0.03), g(1.1), g(0.02), g(0.6)],
    [MAC(14)]: [g(0.2), g(1.8), g(0.1), g(1.1)],
    [MAC(15)]: [g(0.1), g(0.8), g(0.05), g(0.5)],
  };
}
const wave = (i, s) => 1e6 * s * Math.max(0.08, 1 + 0.42 * Math.sin(i * 0.23 + 0.6) + 0.22 * Math.sin(i * 0.71 + 1.3) + 0.12 * Math.sin(i * 1.9 + 0.2) + (i > 44 && i < 52 ? 0.5 : 0));
const ST = { pz: 'sched', grp: 'switched' };
const PZ_NONE = { now: NOW, devs: {} };
const PZ_SCHED = { now: NOW, devs: { [MAC(13)]: { name: '儿童平板', on: false, sched: [{ from: '23:00', to: '07:00' }] } } };
const NODES = [['低延迟线路 01', 38], ['低延迟线路 02', 46], ['企业多线内网线路', 61], ['跨区域办公线路', 84], ['备用线路 05', 0]];
const grpFix = () => {
  const tested = ST.grp !== 'pending';
  const now = ST.grp === 'switched' ? '低延迟线路 01' : '备用线路 05';
  const nodes = NODES.map(([name, d]) => ({ name, type: '高速线路', delay: tested ? d : null }));
  return { groups: [
    { name: '超清影音通道', type: 'Selector', now, nodes: [...nodes, { name: '智能调度', type: '', group: true }] },
    { name: '办公加速通道', type: 'URLTest', now: '企业多线内网线路', nodes: [{ name: '企业多线内网线路', type: '高速线路', delay: tested ? 61 : null }, { name: '跨区域办公线路', type: '高速线路', delay: tested ? 84 : null }] },
    { name: '智能调度', type: 'Fallback', now: '低延迟线路 02', nodes: [{ name: '低延迟线路 02', type: '高速线路', delay: tested ? 46 : null }] }] };
};
const FIX = {
  live: () => ({ rx: 9.86e6, tx: 0.71e6 }),
  home_stats: { today: { dl: 48.48e9, ul: 3.56e9, counting: true, top: DEVS.slice(0, 3).map((d) => ({ name: d.name, id: d.mac, dl: d.stats.dl, ul: d.stats.ul })) }, devices: { online: 6, wifi: 5, wired: 1, total: 7 } },
  svc_info: { hosted: false },
  jobs: { list: [] },
  luci_menu: { items: [] },
  update_check: {},
  fb_replies: { list: [] },
  black_state: { devices: DEVS, entries: [] },
  pause_list: () => (ST.pz === 'none' ? PZ_NONE : PZ_SCHED),
  pause_set: () => { ST.pz = 'sched'; return PZ_SCHED; },
  traffic: { days: trafDays, names: Object.fromEntries(DEVS.map((d) => [d.mac, d.name])), today: TODAY, at: NOW - 40 },
  wd: {
    running: true, now: NOW, uptime: 1728000,
    state: { WAN: 'ok', NET: 'ok', DNS: 'ok', TUN: 'ok', PANEL: 'ok', CLASH: 'ok', CHECK_T: String(NOW - 12), READY: '4' },
    events: [
      { t: NOW - 1800, kind: 'fix', lvl: 'ok', msg: '扩展套件进程意外退出，已自动重启恢复' },
      { t: NOW - 1830, kind: 'net', lvl: 'err', msg: '外网不通（3 个检测站都连不上），正在自动修复', from: NOW - 1860, to: NOW - 1800 },
      { t: NOW - 86400 - 7200, kind: 'tunnel', lvl: 'ok', msg: '隧道重新连上（4 条连接）' },
    ],
  },
  cloud_info: { enabled: true },
  daily: { ok: true, t: NOW - 45968, items: [{ lvl: 'ok', title: '宽带与外网连通正常' }, { lvl: 'ok', title: '扩展套件运行正常' }, { lvl: 'ok', title: '隧道 4 条连接全部在线' }, { lvl: 'ok', title: '闪存剩余 61%，内存充足' }] },
  overview: { clash: { running: true, mode: 'rule', connections: 243 }, wan: { up: true, ip: '100.64.12.8', proto: 'pppoe', uptime: 864000 },
    system: { model: 'OpenWrt', cpu: 7, cpus: 4, load: [0.21, 0.18, 0.15], mem_total: 1024e6, mem_avail: 712e6, temp: 46, firmware: 'OpenWrt 24.10', uptime: 1728000 },
    speed: { rx: 9.86e6, tx: 0.71e6, rx_total: 812e9, tx_total: 96e9 },
    px: { active: 'openclash', list: [{ id: 'openclash', name: 'OpenClash', kind: 'clash', enabled: true, running: true }, { id: 'nikki', name: 'Nikki', kind: 'clash', enabled: false, running: false }, { id: 'passwall', name: 'PassWall', kind: 'other', enabled: false, running: false }, { id: 'passwall2', name: 'PassWall2', kind: 'other', enabled: false, running: false }, { id: 'homeproxy', name: 'HomeProxy', kind: 'other', enabled: false, running: false }, { id: 'shadowsocksr', name: 'SSR Plus+', kind: 'other', enabled: false, running: false }] } }, // 六款全装（审片 C8：「六款」要真的列出六个）
  groups: grpFix,
  autosw: () => ({ enabled: true, groups: ['超清影音通道'], group: '超清影音通道', now: ST.grp === 'switched' ? '低延迟线路 01' : '备用线路 05', hist: [] }),
  providers: { proxies: [] },
};
// 合规改写：真实界面里的这些词在片中统一替换（与旁白术语一致）
const REPL = [
  [/国内直连，海外走代理/g, '智能分配直连与加速通道'], [/Meta 运行中/g, '内核运行中'],
  [/OpenClash/g, '智能调度套件'], [/PassWall ?2/g, '网络加速套件 2'], [/PassWall/g, '网络加速套件'], [/HomeProxy/g, '轻量路由套件'], [/SSR Plus\+/g, '加密转发套件'], [/Nikki/g, '多线路由套件'], [/机场/g, '线路服务商'], [/走代理/g, '走加速通道'], [/代理插件/g, '扩展套件'], [/代理/g, '加速'],
  [/策略组/g, '加速通道'], [/节点/g, '线路'], [/分流/g, '智能调度'], [/订阅/g, '线路源'], [/Cloudflare/g, '云端'],
];

async function main() {
  const b = await chromium.launch({ args: ['--lang=zh-CN'] });
  const shots = {};
  const rects = {};
  for (const theme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, colorScheme: theme, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
    const p = await ctx.newPage();
    await p.clock.setFixedTime(BASE);
    p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 160)));
    await p.route('**/cgi-bin/mcp/**', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      const m = String(body.method || '').replace(/^panel\//, '');
      let r = FIX[m];
      if (typeof r === 'function') r = r(body.params);
      if (r === undefined) { r = {}; if (!/^(initialize|tools)/.test(m)) console.log('  (no fixture)', m); }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: r }) });
    });
    await p.route('**/cloud/**', (r) => { const n = BASE; r.fulfill({ contentType: 'application/json', body: JSON.stringify({ now: n, s: { state: 'ok' }, label: { ok: '正常' }, r: { last: n - 18e3 }, probe: { code: 200, at: n - 41e3 }, t: { last: n - 33e3 }, events: [] }) }); });
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await p.addInitScript(([rx, tx]) => {
      localStorage.setItem('rp_token', 'demo-token');
      sessionStorage.setItem('rp_mh', JSON.stringify({ rx, tx, at: Date.now() }));
    }, [Array.from({ length: 60 }, (_, i) => wave(i, 7.5)), Array.from({ length: 60 }, (_, i) => wave(i + 9, 0.6))]);
    const open = async (pg) => {
      await p.goto('http://127.0.0.1:8765/panel/index.html' + (pg ? '?p=' + pg : ''));
      await p.evaluate((sat) => document.documentElement.style.setProperty('--sat', sat + 'px'), SAT);
      await p.waitForTimeout(2500);
    };
    await open('');
    const fix = async () => p.evaluate((rules) => {
      const re = rules.map(([s, f, r]) => [new RegExp(s, f), r]);
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) { if (n.nodeValue === '代理') { n.nodeValue = '套件'; continue; } let v = n.nodeValue; for (const [a, r] of re) v = v.replace(a, r); if (v !== n.nodeValue) n.nodeValue = v; }
      document.querySelectorAll('.toast,#toast').forEach((x) => x.remove());
      document.querySelectorAll('input[type=time]').forEach((x) => { const v = x.value; x.type = 'text'; x.value = v; });
    }, REPL.map(([a, r]) => [a.source, a.flags, r]));
    const shot = async (name, prep) => {
      if (prep) await prep();
      await p.waitForTimeout(900);
      await fix();
      await p.waitForTimeout(150);
      await p.screenshot({ path: path.join(OUT, `${name}${theme === 'dark' ? '-dark' : ''}.png`) });
      shots[name] = 1;
    };
    const go = open;
    await shot('main');
    rects[theme] = await p.evaluate(() => {
      const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; };
      const cs = getComputedStyle(document.getElementById('mLive'));
      return { mChart: r('mChart'), mRx: r('mRx'), mTx: r('mTx'), cardBg: cs.backgroundColor, brand: getComputedStyle(document.body).getPropertyValue('--brand') };
    });
    // 曲线留空版（片中用 SVG 叠一条实时流动的同款曲线）
    await shot('main-nochart', async () => p.evaluate(() => { document.getElementById('mChart').style.visibility = 'hidden'; }));
    await p.evaluate(() => { document.getElementById('mChart').style.visibility = ''; });
    if (theme === 'light') {
      const rect = (sel) => p.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }, sel);
      const R = (rects.steps = {});
      // 设备页 → 点「儿童平板」的暂停 → 底部弹层 → 点「添加」每天 23:00–07:00（真实 pause_set 流程）
      ST.pz = 'none';
      await go('dev'); await shot('dev0');
      R.devPause = await rect('#dvList [data-i="2"] [data-pause]');
      await shot('dev-sheet0', async () => { await p.evaluate(() => document.querySelector('#dvList [data-i="2"] [data-pause]').click()); });
      R.sheetAdd = await rect('.modal [data-pz="add"]');
      await shot('dev-sheet1', async () => { await p.evaluate(() => document.querySelector('.modal [data-pz="add"]').click()); await p.waitForTimeout(600); });
      ST.pz = 'sched';
      await go('dev'); await shot('dev');
      await go('traf'); await shot('traf');
      await go('wd'); await shot('wd');
      // 线路页：滚到「超清影音通道」→ 未测 / 测完（当前线路超时）/ 自动切换后
      const toGrp = async () => { await p.evaluate(() => { const g = document.querySelector('#pxList .grp'); scrollTo({ top: g.getBoundingClientRect().top + scrollY - 128, behavior: 'instant' });
        // 滚动后状态栏区域：与 iOS 一样的磨砂顶栏，避免内容从时间/电量后面透出来
        const m = document.createElement('div'); m.style.cssText = 'position:fixed;left:0;right:0;top:0;height:54px;z-index:99999;background:rgba(238,240,252,.72);-webkit-backdrop-filter:blur(18px) saturate(1.6);backdrop-filter:blur(18px) saturate(1.6)'; document.body.appendChild(m); }); await p.waitForTimeout(300); };
      for (const st of ['pending', 'tested', 'switched']) {
        ST.grp = st;
        await go('proxy');
        await shot('proxy-' + st, toGrp);
        if (st === 'pending') {
          R.grpTest = await rect('#pxList .grp [data-test]');
          R.nodePills = await p.evaluate(() => [...document.querySelectorAll('#pxList .grp [data-n]')].map((e) => { const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }));
        }
      }
      ST.grp = 'switched';
      await go('proxy'); await shot('proxy');
      // 概览页 + 扩展套件选择弹层（自动识别到的套件列表）
      await go('home'); await shot('home');
      R.pxPick = await rect('#pxPick');
      await shot('home-pick', async () => { await p.evaluate(() => document.getElementById('pxPick').click()); });
      // 面板锁（指纹 / 数字密码）：真实锁屏界面
      await p.evaluate(() => localStorage.setItem('rp_lock', JSON.stringify({ on: true, cred: 'AAAA', hash: 'x', salt: 'y' })));
      await p.addInitScript(() => { try { Object.defineProperty(navigator, 'credentials', { value: { get: () => new Promise(() => {}), create: () => new Promise(() => {}) } }); } catch (e) {} });
      await go(''); await shot('lock');
      R.lkFp = await rect('#lkFp');
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'rects.json'), JSON.stringify({ scale: SCALE, vw: VW, vh: VH, ...rects }, null, 1));
  console.log('ok', Object.keys(shots).join(' '), JSON.stringify(rects));
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

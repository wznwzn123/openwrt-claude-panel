// 录制脚本：每段都是真实面板上的真实操作（演示数据），帧号 30fps。
const { MOCK, NOW, MB, GB } = require('./capture.cjs');
const { mac, S } = require('./capture-v4.cjs.mocks.cjs');

// 实时网速：每 2 秒取一次（面板本身的节奏），数值按虚拟时间平滑起伏
// 起伏要比 2 秒一次的采样慢得多，曲线才是平滑的波浪（不然采样出来是锯齿）
const liveAt = (vt) => { const t = vt / 1000; return { rx: Math.round((3.4 + 1.4 * Math.sin(t * 0.11) + 0.6 * Math.sin(t * 0.29 + 1)) * MB), tx: Math.round((0.45 + 0.16 * Math.sin(t * 0.17 + 2)) * MB) }; };
const live = (k, p, st) => (k === 'panel/live' ? { res: liveAt(st.vt + 120000) } : null);
// 前一分钟的历史：和之后的实时数值是同一条曲线
const seed = () => { const a = Array.from({ length: 30 }, (_, i) => liveAt(120000 - (30 - i) * 2000)); return { rx: a.map((x) => x.rx), tx: a.map((x) => x.tx) }; };
const SPEED0 = { direct: { down: 486, ping: 7, t: S - 540, bytes: 612 * MB } };

module.exports = {
  // 首页（电脑端）：实时曲线每 2 秒刷新；开场笔记本屏幕 + 功能段第一站
  home: { p: 'main', frames: 360, dyn: live, seed }, // 开场笔记本屏幕（第 4 小节起）一直接到功能段第一站结束
  // 手机首页（深色）：开场手机屏幕
  phone: { p: 'main', frames: 270, mobile: true, dark: true, wall: 'night', dyn: live, seed },
  // 设备 → 点「暂停」→ 弹出定时断网 → 点「到早上 7 点」：功能段第二、三站
  dev: {
    p: 'dev', frames: 250,
    cursor: [{ f: 0, xy: [1500, 1080] }, { f: 30, xy: [1300, 700] }, { f: 76, sel: '[data-i="3"] [data-pause]' }, { f: 150, sel: '[data-i="3"] [data-pause]' }, { f: 186, sel: '[data-pz="am"]' }],
    events: [{ f: 84, click: true }, { f: 196, click: true }],
    dyn: (k, p) => (k === 'panel/pause_set' ? { res: { devs: { [mac(45)]: { name: '孩子的平板', on: true, until: Math.floor(Date.parse('2026-11-10T07:00:00+08:00') / 1000), sched: [{ from: '23:00', to: '07:00' }] } } } } : null),
  },
  // 每日体检：还没体检过 → 点「现在体检」→ 体检中 → 结果
  daily: {
    p: 'wd', frames: 150,
    prep: async (page) => page.evaluate(() => { const box = document.getElementById('wdBody'); [...box.children].forEach((c) => { const keep = c.id === 'dyCard' || (c.nextElementSibling && c.nextElementSibling.id === 'dyCard'); if (!keep) c.style.display = 'none'; }); }),
    cursor: [{ f: 0, xy: [1500, 900] }, { f: 30, sel: '[data-dyrun]' }],
    events: [{ f: 38, click: true }],
    dyn: (k, p) => {
      if (k !== 'panel/daily') return null;
      const items = [{ lvl: 'ok', title: '过去 24 小时没有断线' }, { lvl: 'ok', title: '内存正常（可用 186 MB）' }, { lvl: 'ok', title: '没有陌生设备连上' }, { lvl: 'ok', title: '存储空间充足（还剩 92 MB）' }, { lvl: 'ok', title: '温度正常（52°C）' }, { lvl: 'ok', title: '云端备份正常（5 小时前）' }];
      if (p.run) return { at: 92, res: { t: S + 3, ok: true, summary: '一切正常', items } };
      return { res: { none: true } }; // 一开始「还没体检过」，点了以后整张结果出来
    },
  },
  // 网速测试：点「再测一次」→ 测速中 → 新结果
  speed: {
    p: 'speed', frames: 150,
    cursor: [{ f: 0, xy: [1300, 700] }, { f: 26, sel: '[data-st="direct"]' }],
    events: [{ f: 34, click: true }],
    dyn: (k) => (k === 'panel/speed_last' ? { res: SPEED0 } : k === 'panel/speedtest' ? { at: 100, res: { kind: 'direct', down: 512, ping: 6, t: S + 4, bytes: 640 * MB } } : null),
  },
  // 终端：在面板里敲命令
  term: {
    p: 'term', frames: 150,
    cursor: [{ f: 0, xy: [1400, 900] }, { f: 14, sel: '#termIn' }],
    events: [{ f: 18, click: true }, ...'uptime'.split('').map((ch, i) => ({ f: 24 + i * 3, type: ch })), { f: 46, key: 'Enter' },
      ...'df -h /overlay'.split('').map((ch, i) => ({ f: 66 + i * 2, type: ch })), { f: 98, key: 'Enter' }],
    dyn: (k, p) => {
      if (k !== 'panel/term') return null;
      const OUT = { uptime: ' 21:30:12 up 8 days,  3:41,  load average: 0.08, 0.12, 0.10', 'df -h /overlay': 'Filesystem                Size      Used Available Use% Mounted on\n/dev/ubi0_data          108.6M     16.6M     92.0M  15% /overlay' };
      return { at: p.cmd === 'uptime' ? 52 : 104, res: { out: OUT[p.cmd] || '', cwd: '/root' } };
    },
  },
  // 文件：点开 network 配置
  files: {
    p: 'files', frames: 120,
    cursor: [{ f: 0, xy: [1500, 1000] }, { f: 34, sel: '[data-f="4"]' }],
    events: [{ f: 44, click: true }],
  },
};

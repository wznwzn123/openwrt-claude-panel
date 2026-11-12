// 功能页的演示数据（capture-v4.cjs 和 livecap.cjs 共用）：内网地址 192.168.1.x、MAC 用本地管理地址段 02:00:00:…，没有域名、账号、密钥。
const { MOCK, NOW, GB, MB } = require('./capture.cjs');
const S = Math.floor(NOW / 1000);
const mac = (n) => '02:00:00:00:00:' + n.toString(16).padStart(2, '0');
const DEVS = [
  ['客厅电视', 20, true, 12, 7.9 * GB, 0.3 * GB], ['书房电脑', 31, true, 38, 4.6 * GB, 0.9 * GB], ['我的手机', 52, true, 21, 2.8 * GB, 0.4 * GB],
  ['孩子的平板', 45, true, 6, 1.2 * GB, 0.1 * GB], ['爸妈的手机', 58, true, 9, 0.9 * GB, 0.1 * GB], ['游戏机', 66, false, 0, 0, 0],
  ['扫地机器人', 73, true, 2, 0.02 * GB, 0.01 * GB], ['卧室音箱', 81, true, 3, 0.15 * GB, 0.01 * GB],
];
Object.assign(MOCK, {
  'panel/black_state': { entries: [], devices: DEVS.map(([name, ip, online, conns, dl, ul]) => ({ name, ip: '192.168.1.' + ip, mac: mac(ip), online, stats: online ? { conns, dl, ul } : null })) },
  'panel/pause_list': { devs: { [mac(45)]: { name: '孩子的平板', on: false, sched: [{ from: '23:00', to: '07:00' }] } } },
  'panel/speed_last': { direct: { down: 486, ping: 7, t: Math.floor(Date.now() / 1000) - 540, bytes: 612 * MB } }, // 「9 分钟前」按采集时的真实时间算
  'panel/daily': { t: S - 12.5 * 3600, ok: true, summary: '一切正常', items: [
    { lvl: 'ok', title: '过去 24 小时没有断线' }, { lvl: 'ok', title: '内存正常（可用 186 MB）' }, { lvl: 'ok', title: '没有陌生设备连上' },
    { lvl: 'ok', title: '存储空间充足（还剩 92 MB）' }, { lvl: 'ok', title: '温度正常（52°C）' }, { lvl: 'ok', title: '云端备份正常（5 小时前）' }] },
  'panel/wd': { running: true, now: S, events: [], state: {} },
  'panel/fs_list': { path: '/etc/config', free: '可用 92 MB', items: [
    ['dhcp', 1820], ['dropbear', 158], ['firewall', 3412], ['luci', 1204], ['network', 1066], ['system', 602], ['uhttpd', 1534], ['wireless', 918]]
    .map(([name, size], i) => ({ name, size, mtime: S - (i * 7 + 3) * 3600, mode: '644' })) },
});
const TERM = {
  uptime: ' 21:30:12 up 8 days,  3:41,  load average: 0.08, 0.12, 0.10',
  'free -m': '              total        used        free      shared  buff/cache   available\nMem:            481         186         212           2          83         286\nSwap:             0           0           0',
  'df -h /overlay': 'Filesystem                Size      Used Available Use% Mounted on\n/dev/ubi0_data          108.6M     16.6M     92.0M  15% /overlay',
};
module.exports = { TERM, DEVS, mac, S };

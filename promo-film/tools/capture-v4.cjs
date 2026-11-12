// v4 功能演示采集：设备、定时断网、每日体检、测速、终端、文件。电脑端 1920×1200 @2x。
// 和 capture.cjs 共用演示后端（MOCK）；这里补上这几页要用的演示数据。
// 演示数据：内网地址 192.168.1.x、MAC 用本地管理地址段 02:00:00:…（不是任何真实设备），没有域名、账号、密钥。
// 大陆发布口径：各页顶部说明文字里提到代理 / 隧道 / Cloudflare，截图时统一隐藏（界面本身不改）；终端快捷按钮里有 OpenClash，隐藏。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { boot, MOCK, OUT, NOW, GB, MB } = require('./capture.cjs');
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
MOCK['panel/term'] = null; // 按命令返回
async function shot(b, p, name, fn) {
  const { ctx, page } = await boot(b, { p, w: 1920, h: 1200, dpr: 2 });
  await page.route('**/cgi-bin/mcp/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.method === 'panel/term') { const c = body.params.cmd; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { out: TERM[c] || '', cwd: '/root' } }) }); }
    return route.fallback();
  });
  await page.addStyleTag({ content: '.page .hero > p.muted{display:none!important} #termQuick{display:none!important} #stBody > p.muted, #stBody section.card:first-child{display:none!important}' });
  if (fn) await fn(page);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  const lay = await page.evaluate(() => {
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.height > 1 ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null; };
    return { main: r(document.querySelector('section.page.on')), cards: [...document.querySelectorAll('section.page.on article.card, section.page.on section.card')].map(r).filter(Boolean),
      modal: r(document.querySelector('.modal .modalbox')), dy: r(document.querySelector('#dyCard')), term: r(document.querySelector('#termOut')), side: r(document.querySelector('#side')),
      kv: r(document.querySelector('.modal .kv')), stnums: r(document.querySelector('.stnums')), fm: r(document.querySelector('#fmList')), pz: r(document.querySelector('#pzBox section.card')),
      dyhead: r(document.querySelector('#dyCard .dyhead')), pzgrid: r(document.querySelector('.modal .pzgrid')) };
  });
  console.log(name, JSON.stringify(lay).slice(0, 400));
  await ctx.close();
  return lay;
}
(async () => {
  const b = await chromium.launch();
  const L = {};
  L['desk-dev'] = await shot(b, 'dev', 'desk-dev');
  L['desk-pause'] = await shot(b, 'dev', 'desk-pause', async (page) => {
    await page.click('[data-i="3"] [data-pause]'); await page.waitForTimeout(900);
    // 采集机的时间输入框按英文显示（11:00 PM），这一行不上画面；上面已经有一条「23:00 – 07:00」
    await page.addStyleTag({ content: '.modal .pzadd{display:none!important}' });
  });
  L['desk-wd'] = await shot(b, 'wd', 'desk-wd', async (page) => {
    // 断线记录页上半部分有「隧道 / 代理」状态格和云端监测，不上画面：只留「每日体检」这张卡和它的标题
    await page.evaluate(() => { const box = document.getElementById('wdBody'); [...box.children].forEach((c) => { const keep = c.id === 'dyCard' || (c.nextElementSibling && c.nextElementSibling.id === 'dyCard'); if (!keep) c.style.display = 'none'; }); });
  });
  L['desk-speed'] = await shot(b, 'speed', 'desk-speed');
  L['desk-term'] = await shot(b, 'term', 'desk-term', async (page) => {
    for (const c of ['uptime', 'free -m', 'df -h /overlay']) { await page.fill('#termIn', c); await page.press('#termIn', 'Enter'); await page.waitForTimeout(500); }
  });
  L['desk-files'] = await shot(b, 'files', 'desk-files');
  const lf = path.join(OUT, 'layout-v4.json');
  fs.writeFileSync(lf, JSON.stringify(L, null, 1));
  await b.close();
})();

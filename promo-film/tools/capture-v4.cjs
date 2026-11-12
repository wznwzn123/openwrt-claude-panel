// v4 功能演示采集：设备、定时断网、每日体检、测速、终端、文件。电脑端 1920×1200 @2x。
// 和 capture.cjs 共用演示后端（MOCK）；这里补上这几页要用的演示数据。
// 演示数据：内网地址 192.168.1.x、MAC 用本地管理地址段 02:00:00:…（不是任何真实设备），没有域名、账号、密钥。
// 大陆发布口径：各页顶部说明文字里提到代理 / 隧道 / Cloudflare，截图时统一隐藏（界面本身不改）；终端快捷按钮里有 OpenClash，隐藏。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { boot, MOCK, OUT, NOW, GB, MB } = require('./capture.cjs');
const { TERM } = require('./capture-v4.cjs.mocks.cjs');
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

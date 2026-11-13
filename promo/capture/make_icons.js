// 新图标「守夜」（月亮 + 月亮里一盏亮着的灯 + 一道信号）：生成面板与安卓客户端的全部 PNG 图标。
// 形状来自设计稿方案一；月牙用两圆交点算成纯路径（不用 mask，安卓矢量图标和内联多份 SVG 都能用）。
// 用法：node promo/capture/make_icons.js   （在仓库根目录或任意目录均可）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');

const NAVY = '#101C40', MOON = '#F4F1EA', LAMP = '#FFB547';
// 方形（圆角）主图标：月牙 = 圆(47,53,r29) 减 圆(61,39,r24)
const SQUARE = (rx = 22.5) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="${rx}" fill="${NAVY}"/>` +
  `<path d="M41.914 24.45A29 29 0 1 0 75.55 58.086A24 24 0 0 1 41.914 24.45Z" fill="${MOON}"/>` +
  `<path d="M62.6 21.4A17 17 0 0 1 78.6 37.4" stroke="${LAMP}" stroke-width="4" stroke-linecap="round" fill="none"/>` +
  `<circle cx="63" cy="37" r="7" fill="${LAMP}"/></svg>`;
// 圆形变体（设计稿「圆形图标」）：月亮略小、去掉信号弧，月牙 = 圆(47,53,r27) 减 圆(61,39,r24)
const ROUND =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${NAVY}"/>` +
  `<path d="M40.307 26.843A27 27 0 1 0 73.157 59.693A24 24 0 0 1 40.307 26.843Z" fill="${MOON}"/>` +
  `<circle cx="62" cy="38" r="6.5" fill="${LAMP}"/></svg>`;

const jobs = [
  // 面板（浏览器标签、添加到主屏幕、PWA 清单）
  { out: 'src/www/panel/icon-192.png', svg: SQUARE(), size: 192, pad: 0 },
  { out: 'src/www/panel/icon-512.png', svg: SQUARE(), size: 512, pad: 0 },
];
// 安卓旧版启动图标（API 26 以下用；26+ 走 mipmap-anydpi-v26 自适应图标）：四周留 1/24 透明边，与原图一致
for (const [d, s] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  jobs.push({ out: `android/app/src/main/res/mipmap-${d}/ic_launcher.png`, svg: SQUARE(), size: s, pad: s / 24 });
  jobs.push({ out: `android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, svg: ROUND, size: s, pad: s / 24 });
}

(async () => {
  fs.writeFileSync(path.join(ROOT, 'src/www/panel/icon.svg'), SQUARE() + '\n');
  const b = await chromium.launch();
  for (const j of jobs) {
    const p = await b.newPage({ viewport: { width: j.size, height: j.size } });
    const inner = j.size - 2 * j.pad;
    await p.setContent(`<html><body style="margin:0;background:transparent"><div style="position:absolute;left:${j.pad}px;top:${j.pad}px;width:${inner}px;height:${inner}px">${j.svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
    await p.screenshot({ path: path.join(ROOT, j.out), omitBackground: true });
    await p.close();
    console.log('ok', j.out);
  }
  await b.close();
})();

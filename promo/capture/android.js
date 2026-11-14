// 安卓客户端首页实机截图：直接加载仓库 android/app/src/main/assets/home.html（App 里 WebView 显示的同一页面），
// 用桩对象模拟 App 的 JS 接口（版本号、深色、路由器列表），3× 分辨率。
// 用法：node capture/android.js [scale]   → public/shots/real/and-*.png + and-rects.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '../public/shots/real');
const HOME = 'file://' + path.resolve(__dirname, '../../android/app/src/main/assets/home.html');
const SCALE = +(process.argv[2] || 3);
const VW = 393, VH = 852, SAT = 54;
const BASE = Date.parse('2026-11-12T21:46:08+08:00');
const R = (name, host, ago) => ({ name, url: `https://${host}/panel/`, at: BASE - ago * 1000 });
const OLD = [R('公司 · R4S', 'office.example.net', 5 * 3600), R('父母家 · AX6S', 'parents.example.net', 2 * 86400)];
const NEW = R('家里 · AX3000T', 'home.example.net', 40);
// 登录地址带 root 密钥，画面里一律打码
const PASTED = 'https://home.example.net/cgi-bin/mcp/9f2c••••';
const STATES = [
  ['and-home2', OLD, ''],
  ['and-home2-paste', OLD, PASTED],
  ['and-home3', [NEW, ...OLD], ''],
];
(async () => {
  const b = await chromium.launch({ args: ['--lang=zh-CN'] });
  const rects = {};
  for (const [name, list, addr] of STATES) {
    const ctx = await b.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, colorScheme: 'dark', locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
    const p = await ctx.newPage();
    await p.clock.setFixedTime(BASE);
    await p.addInitScript((routers) => {
      window.App = { version: () => '3.1.3', dark: () => true, hub: () => '', routers: () => JSON.stringify(routers), saveRouters() {}, open() {}, external() {}, scan() {}, pickQr() {}, clipboard: () => '', update() {} };
    }, list);
    await p.goto(HOME);
    await p.waitForTimeout(300);
    await p.evaluate(({ sat, addr }) => {
      const w = document.querySelector('.wrap');
      w.style.paddingTop = parseFloat(getComputedStyle(w).paddingTop) + sat + 'px';
      const i = document.getElementById('addr');
      if (addr) { i.value = addr; i.focus(); i.setSelectionRange(addr.length, addr.length); }
    }, { sat: SAT, addr });
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(OUT, `${name}.png`) });
    rects[name] = await p.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return [+b.x.toFixed(1), +b.y.toFixed(1), +b.width.toFixed(1), +b.height.toFixed(1)]; };
      return {
        paste: r(document.getElementById('pasteBtn')),
        add: r(document.getElementById('addBtn')),
        addr: r(document.getElementById('addr')),
        cards: [...document.querySelectorAll('#list [data-i]')].map(r),
        open: [...document.querySelectorAll('#list [data-open]')].map(r),
      };
    });
    await ctx.close();
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, 'and-rects.json'), JSON.stringify(rects, null, 1));
  console.log(JSON.stringify(rects));
})();

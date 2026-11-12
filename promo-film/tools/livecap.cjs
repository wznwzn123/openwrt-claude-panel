// 真实面板「活」的录制：加载仓库里的面板（后端换成演示数据），用假时钟一帧一帧往前走（30fps），每帧截图。
// · JS 时间：Playwright page.clock（Date / setTimeout / setInterval / requestAnimationFrame 全部由这里推进）
// · CSS 动画和过渡：每帧把 document.getAnimations() 全部暂停，按虚拟时间设定 currentTime——逐帧确定、可复现
// · 光标：画在页面最上层的一个箭头，鼠标真的移动、按下、抬起（hover 和点击都是面板自己的反应）
// · 后端：需要「转圈」的接口（体检、测速、终端）按帧号延迟应答
// 输出：out/live/<片段>/0000.jpg…，再由 tools/livecap-encode.sh 编码成 public/live/<片段>.mp4
// 演示数据：内网地址、本地管理段 MAC，没有真实 IP / 域名 / 密钥。代理相关的说明文字不上画面（同 capture-v4.cjs）。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { MOCK } = require('./capture.cjs');
require('./capture-v4.cjs.mocks.cjs');

const ROOT = path.resolve(__dirname, '../../src/www');
const OUTROOT = path.resolve(__dirname, '../out/live');
const NOW = Date.parse('2026-11-09T21:30:00+08:00');
const FPS = 30, DT = 1000 / FPS;
const MB = 1024 ** 2;

const CURSOR_SVG = '<svg width="34" height="40" viewBox="0 0 34 40"><path d="M3 2 L3 31 L10.5 24.5 L15.5 36 L21 33.6 L16 22.4 L26 22 Z" fill="#fff" stroke="#111827" stroke-width="2.2" stroke-linejoin="round"/></svg>';

async function boot(b, clip) {
  const mobile = !!clip.mobile;
  const ctx = await b.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1200 }, deviceScaleFactor: mobile ? 3 : 2, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', colorScheme: clip.dark ? 'dark' : 'light', hasTouch: mobile });
  const page = await ctx.newPage();
  await page.clock.install({ time: NOW - 60000 });
  await page.clock.pauseAt(NOW);
  const state = { vt: 0, queue: [] };
  await ctx.addInitScript(({ wall, dark, seed }) => {
    // 实时曲线的前一分钟历史（面板自己会从 sessionStorage 接上），曲线一开始就是完整的
    if (seed) sessionStorage.setItem('rp_mh', JSON.stringify({ rx: seed.rx, tx: seed.tx, at: Date.now() }));
    localStorage.setItem('rp_token', 'demo0000demo0000demo0000');
    localStorage.setItem('rp_glass', '1'); localStorage.setItem('rp_wall', wall);
    if (dark) localStorage.setItem('rp_dark', '1');
    window.__sync = (vt) => {
      for (const a of document.getAnimations()) {
        if (a.__s == null) a.__s = vt - (a.currentTime || 0);
        try { a.pause(); a.currentTime = Math.max(0, vt - a.__s); } catch (e) {}
      }
    };
  }, { wall: clip.wall || 'aurora', dark: !!clip.dark, seed: clip.seed ? clip.seed() : null });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/cgi-bin/mcp/')) {
      const body = JSON.parse(route.request().postData() || '{}');
      const k = body.method === 'tools/call' ? 'tool:' + body.params.name : body.method;
      const reply = (res) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: res }) });
      const dyn = clip.dyn && clip.dyn(k, body.params || {}, state);
      if (dyn && dyn.at != null) { state.queue.push({ at: dyn.at, go: () => reply(dyn.res) }); return; }
      if (dyn) return reply(dyn.res);
      const m = MOCK[k];
      return reply(typeof m === 'function' ? m(state) : m || {});
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
  await page.goto('http://router.demo/panel/' + (clip.p ? '?p=' + clip.p : ''));
  // 页面加载期间让假时钟跟着走（每次 100 ms 虚拟时间，给网络一点真实时间）
  for (let i = 0; i < 40; i++) { await page.clock.runFor(100); await page.waitForTimeout(20); }
  await page.addStyleTag({ content: "@import url('/__fonts/noto-sans-sc/index.css');@import url('/__fonts/inter/index.css');@import url('/__fonts/jetbrains-mono/index.css');" +
    ":root{--mono:'JetBrains Mono Variable',monospace!important} html,body,button,input,textarea,select{font-family:'Inter Variable','Noto Sans SC Variable',sans-serif!important} .mono,code,pre{font-family:'JetBrains Mono Variable','Noto Sans SC Variable',monospace!important}" +
    '.dock{display:none!important} #topSub{visibility:hidden!important} #auCard > p.muted{display:none!important}' +
    '.page .hero > p.muted{display:none!important} #termQuick{display:none!important} #stBody > p.muted, #stBody section.card:first-child{display:none!important} .modal .pzadd{display:none!important}' +
    '#__cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35))} #__rip{position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;border:3px solid rgba(255,255,255,.95);box-shadow:0 0 18px rgba(127,178,255,.9)}' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { const e = document.getElementById('rUpdCur'); if (e) e.textContent = e.textContent.split('\n')[0]; });
  await page.evaluate((svg) => { const c = document.createElement('div'); c.id = '__cur'; c.innerHTML = svg; c.style.display = 'none'; document.body.appendChild(c); const r = document.createElement('div'); r.id = '__rip'; r.style.display = 'none'; document.body.appendChild(r); }, CURSOR_SVG);
  if (clip.prep) await clip.prep(page);
  for (let i = 0; i < 6; i++) { await page.clock.runFor(100); await page.waitForTimeout(20); }
  return { ctx, page, state };
}

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
async function centerOf(page, sel) { const h = await page.$(sel); if (!h) throw new Error('missing ' + sel); const bb = await h.boundingBox(); return [bb.x + bb.width / 2, bb.y + bb.height / 2]; }

async function record(b, name, clip) {
  const dir = path.join(OUTROOT, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const { ctx, page, state } = await boot(b, clip);
  const path_ = clip.cursor || [];
  const pts = [];
  let cur = null;
  const t0 = Date.now();
  for (let fr = 0; fr < clip.frames; fr++) {
    state.vt = fr * DT;
    // 光标：路径关键帧之间缓动；目标是选择器时在出发那一刻量位置
    if (path_.length) {
      let k = 0; while (k < path_.length - 1 && fr >= path_[k + 1].f) k++;
      for (let j = 0; j <= Math.min(k + 1, path_.length - 1); j++) if (!pts[j]) pts[j] = path_[j].sel ? await centerOf(page, path_[j].sel).then(([x, y]) => [x + (path_[j].dx || 0), y + (path_[j].dy || 0)]) : path_[j].xy;
      const a = path_[k], bnext = path_[Math.min(k + 1, path_.length - 1)];
      const t = bnext === a ? 1 : ease((fr - a.f) / Math.max(1, bnext.f - a.f));
      const pa = pts[k], pb = pts[Math.min(k + 1, path_.length - 1)];
      const x = pa[0] + (pb[0] - pa[0]) * Math.min(1, Math.max(0, t)), y = pa[1] + (pb[1] - pa[1]) * Math.min(1, Math.max(0, t));
      cur = [x, y];
      await page.mouse.move(x, y);
    }
    for (const ev of clip.events || []) {
      if (ev.f !== fr) continue;
      if (ev.click) { await page.mouse.down(); await page.mouse.up(); ev.clickAt = fr; }
      if (ev.key) await page.keyboard.press(ev.key);
      if (ev.type) await page.keyboard.type(ev.type);
      if (ev.fn) await ev.fn(page);
      await page.waitForTimeout(30);
    }
    // 到点的延迟应答
    for (const q of state.queue.filter((q) => q.at <= fr)) { await q.go(); q.done = true; }
    state.queue = state.queue.filter((q) => !q.done);
    await page.clock.runFor(DT);
    await page.waitForTimeout(12);
    // 光标和点击涟漪（按帧算，不依赖 CSS 动画）
    const lastClick = Math.max(-99, ...(clip.events || []).filter((e) => e.click && e.f <= fr).map((e) => e.f));
    const rk = (fr - lastClick) / 14;
    await page.evaluate(({ vt, cur, rk, press, mobile }) => {
      window.__sync(vt);
      const c = document.getElementById('__cur'), r = document.getElementById('__rip');
      if (cur && !mobile) { c.style.display = 'block'; c.style.transform = `translate(${cur[0] - 3}px, ${cur[1] - 2}px) scale(${press ? 0.86 : 1})`; } else c.style.display = 'none';
      if (cur && rk >= 0 && rk <= 1) { const s = 12 + 46 * rk; r.style.display = 'block'; r.style.left = cur[0] - s / 2 + 'px'; r.style.top = cur[1] - s / 2 + 'px'; r.style.width = r.style.height = s + 'px'; r.style.opacity = String(1 - rk); } else r.style.display = 'none';
    }, { vt: state.vt, cur, rk, press: rk >= 0 && rk < 0.25, mobile: !!clip.mobile });
    await page.screenshot({ path: path.join(dir, String(fr).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    if (fr % 30 === 0) process.stdout.write(`${name} ${fr}/${clip.frames} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  }
  await ctx.close();
}

const CLIPS = require('./livecap.clips.cjs');
(async () => {
  const only = process.argv.slice(2);
  const b = await chromium.launch();
  const lim = +(process.env.LIMIT || 0);
  for (const [name, clip] of Object.entries(CLIPS)) if (!only.length || only.includes(name)) await record(b, name, lim ? { ...clip, frames: Math.min(lim, clip.frames) } : clip);
  await b.close();
})();

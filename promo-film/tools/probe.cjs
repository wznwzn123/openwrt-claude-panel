// 探测面板首屏会调哪些接口（只用于开发采集脚本）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../src/www');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  const page = await ctx.newPage();
  const seen = [];
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/cgi-bin/mcp/')) {
      const body = JSON.parse(route.request().postData() || '{}');
      seen.push(body.method + (body.params && body.params.name ? ':' + body.params.name : ''));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {} }) });
    }
    if (u.pathname.startsWith('/cloud/')) return route.fulfill({ status: 404, body: '' });
    let f = path.join(ROOT, decodeURIComponent(u.pathname)); if (f.endsWith('/')) f += 'index.html';
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ status: 200, body: fs.readFileSync(f), contentType: f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.svg') ? 'image/svg+xml' : undefined });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://router.demo/panel/#login=demo0000demo0000demo0000');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: process.argv[2] || 'probe.png' });
  console.log([...new Set(seen)].join(' '));
  await b.close();
})();

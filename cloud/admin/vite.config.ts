import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

/* 老一点的苹果系统（Safari 14–16，macOS Big Sur / Monterey、iOS 14–16）兜底：
   dvh → 先写一遍 vh；overflow: clip → 先写一遍 hidden；color-mix() → 先写一遍取第一种颜色。
   新浏览器用后面那行，老浏览器不认识后面那行就用前面的。 */
function mixFallback(v: string): string {
  let out = '', i = 0
  while (i < v.length) {
    const k = v.indexOf('color-mix(', i)
    if (k < 0) { out += v.slice(i); break }
    out += v.slice(i, k)
    let d = 0, j = k + 9, parts: string[] = [], start = j + 1
    for (; j < v.length; j++) {
      const c = v[j]
      if (c === '(') d++
      else if (c === ')') { d--; if (d === 0) { parts.push(v.slice(start, j)); break } }
      else if (c === ',' && d === 1) { parts.push(v.slice(start, j)); start = j + 1 }
    }
    const first = (parts[1] || 'transparent').trim().replace(/\s+\d+(\.\d+)?%$/, '')
    out += mixFallback(first)
    i = j + 1
  }
  return out
}
const safariFallbacks = () => ({
  postcssPlugin: 'safari-fallbacks',
  Declaration(decl: any, { AtRule, Rule }: any) {
    if (decl.prop.startsWith('--') || decl.__fb) return
    let fb = decl.value as string
    if (/\ddvh\b/.test(fb)) fb = fb.replace(/(\d)dvh\b/g, '$1vh')
    // overflow: clip 的兜底要单独放进 @supports（压缩时会把同一条规则里重复的 overflow 合并掉）
    if (/^overflow(-x|-y)?$/.test(decl.prop) && /\bclip\b/.test(fb) && decl.parent?.type === 'rule' && !decl.parent.__fbClip) {
      const at = new AtRule({ name: 'supports', params: 'not (overflow: clip)' })
      const r = new Rule({ selector: decl.parent.selector })
      r.__fbClip = true
      r.append({ prop: decl.prop, value: fb.replace(/\bclip\b/g, 'hidden') })
      at.append(r)
      decl.parent.parent.insertAfter(decl.parent, at)
    }
    if (fb.includes('color-mix(')) fb = mixFallback(fb)
    decl.__fb = true
    if (fb !== decl.value) { const c = decl.clone({ value: fb }); c.__fb = true; decl.before(c) }
  },
})
safariFallbacks.postcss = true

// 打包到 dist/，由 tools/build-site.mjs 放进 cloud/site.js，官网在 /admin 提供（只有 js/css，不内联脚本，配合严格的安全策略）
export default defineConfig({
  base: '/admin/',
  plugins: [vue()],
  css: { postcss: { plugins: [safariFallbacks()] } },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 600,
    target: ['es2020', 'safari14', 'chrome87', 'edge88', 'firefox78'],
  },
  server: { port: 5173, proxy: { '/api': { target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8787', changeOrigin: true } } },
})

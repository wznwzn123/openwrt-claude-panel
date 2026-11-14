import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { installHoverLift, installPressFeedback, installRipple } from './composables/motion'

// 设计令牌 → 基础 → 材质 → 控件 → 外壳 → 页面
import './styles/tokens.css'
import './styles/base.css'
import './styles/materials.css'
import './styles/components.css'
import './styles/instruments.css'
import './styles/layout.css'
import './styles/pages.css'
import './styles/hub.css'

// 外观设置在挂载前写入 data-theme / data-density，避免首屏闪色
import './composables/appearance'

const app = createApp(App)
app.use(router).mount('#app')

installPressFeedback()
installHoverLift()
installRipple()

// 5.0：后台脚本出错、排版被撑宽（像安卓 Edge 那次），自动记进「出错记录」；同一条只报一次，一次打开最多报 5 条
import { adminKey, post } from './api'
const sent = new Set<string>()
function report(msg: string, stack = '', where = location.hash) {
  try {
    msg = String(msg || '').slice(0, 300)
    if (!msg || sent.has(msg) || sent.size >= 5 || !adminKey.get() || /ResizeObserver loop|Script error|Failed to fetch|NetworkError|Load failed|连不上服务器/.test(msg)) return
    sent.add(msg)
    post('cerr', { msg, stack: String(stack || '').slice(0, 800), where: String(where).replace(/[?].*$/, ''), ua: navigator.userAgent.slice(0, 60), w: innerWidth, h: innerHeight }).catch(() => {})
  } catch { /* 不影响使用 */ }
}
addEventListener('error', (e) => { if (e?.message) report(e.message, e.error?.stack, location.hash) })
addEventListener('unhandledrejection', (e) => { const r = e?.reason; if (r instanceof TypeError || r instanceof ReferenceError || r instanceof RangeError || r instanceof SyntaxError) report(r.message, r.stack) })
router.afterEach((to) => {
  setTimeout(() => {
    const ws = document.querySelector('.workspace'), top = document.querySelector('.topbar')
    if (!ws || !top) return
    const w = Math.round(top.getBoundingClientRect().width), vw = innerWidth
    if (w > vw + 2) report(`排版被撑宽：工作区 ${w} 像素，屏幕 ${vw} 像素（页面 ${to.path}）`, '', to.path)
  }, 2500)
})

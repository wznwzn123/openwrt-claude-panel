<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/* 左右滑动区：内容比卡片宽时（表格、图表、数据格子）可以左右滑；
   下面有一条滑动条（手指、鼠标、触控板都能拖），两边渐隐提示还有内容。
   各系统一样：不依赖系统滚动条（苹果电脑和 iPhone 默认把滚动条藏起来）。
   end：一开始就滑到最右边（最新的日期在右边）；bleed：滑动区伸到卡片边，内容仍和卡片里其它东西对齐。 */
const props = withDefaults(defineProps<{ end?: boolean; bleed?: boolean; label?: string }>(), { end: false, bleed: false, label: '左右滑动看更多' })

const sc = ref<HTMLElement | null>(null)
const track = ref<HTMLElement | null>(null)
const on = ref(false)
const canL = ref(false)
const canR = ref(false)
const thumbW = ref(100)
const thumbX = ref(0)
const touched = ref(false)
const dragging = ref(false)

function update() {
  const e = sc.value
  if (!e) return
  const max = e.scrollWidth - e.clientWidth
  const was = on.value
  on.value = max > 2
  if (!on.value) { canL.value = canR.value = false; thumbW.value = 100; thumbX.value = 0; return }
  // 第一次变成能滑：需要的话先滑到最右边（用户还没动过）
  if (!was && props.end && !touched.value) e.scrollLeft = max
  canL.value = e.scrollLeft > 2
  canR.value = e.scrollLeft < max - 2
  thumbW.value = Math.max(14, (e.clientWidth / e.scrollWidth) * 100)
  thumbX.value = (Math.min(max, Math.max(0, e.scrollLeft)) / max) * (100 - thumbW.value)
}

let raf = 0
const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update) }
const mark = () => { touched.value = true }

/* 拖滑动条：按在滑块上就按住的位置拖；按在空白处就跳过去 */
let grab = -1
function barDown(ev: PointerEvent) {
  const t = track.value, e = sc.value
  if (!t || !e) return
  ev.preventDefault()
  mark()
  const r = t.getBoundingClientRect()
  const tw = (thumbW.value / 100) * r.width
  const tx = r.left + (thumbX.value / 100) * r.width
  grab = ev.clientX >= tx && ev.clientX <= tx + tw ? ev.clientX - tx : tw / 2
  dragging.value = true
  try { t.setPointerCapture(ev.pointerId) } catch { /* 有的浏览器不支持也没关系 */ }
  barMove(ev)
}
function barMove(ev: PointerEvent) {
  if (!dragging.value) return
  const t = track.value, e = sc.value
  if (!t || !e) return
  const r = t.getBoundingClientRect()
  const tw = (thumbW.value / 100) * r.width
  const ratio = Math.min(1, Math.max(0, (ev.clientX - r.left - grab) / Math.max(1, r.width - tw)))
  e.scrollLeft = ratio * (e.scrollWidth - e.clientWidth)
}
function barUp() { dragging.value = false; grab = -1 }

let ro: ResizeObserver | null = null
let mo: MutationObserver | null = null
function watchKids() {
  const e = sc.value
  if (!e || !ro) return
  for (const c of Array.from(e.children)) ro.observe(c)
}
onMounted(() => {
  const e = sc.value
  if (!e) return
  ro = new ResizeObserver(schedule)
  ro.observe(e)
  watchKids()
  mo = new MutationObserver(() => { watchKids(); schedule() })
  mo.observe(e, { childList: true, subtree: true })
  update()
})
onBeforeUnmount(() => { ro?.disconnect(); mo?.disconnect(); cancelAnimationFrame(raf) })
defineExpose({ el: sc, update })
</script>

<template>
  <div :class="['hs', bleed && 'bleed', on && 'is-on', canL && 'can-l', canR && 'can-r']">
    <div
      ref="sc"
      class="hs-sc"
      :tabindex="on ? 0 : undefined"
      :role="on ? 'region' : undefined"
      :aria-label="on ? label : undefined"
      @scroll.passive="update"
      @pointerdown.passive="mark"
      @wheel.passive="mark"
      @keydown="mark"
    >
      <slot />
    </div>
    <div v-if="on" class="hs-bar" aria-hidden="true">
      <div
        ref="track"
        :class="['hs-track', dragging && 'is-drag']"
        @pointerdown="barDown"
        @pointermove="barMove"
        @pointerup="barUp"
        @pointercancel="barUp"
        @lostpointercapture="barUp"
      >
        <i class="hs-thumb" :style="{ width: `${thumbW}%`, left: `${thumbX}%` }" />
      </div>
      <span v-if="!touched" class="hs-hint">{{ label }}</span>
    </div>
  </div>
</template>

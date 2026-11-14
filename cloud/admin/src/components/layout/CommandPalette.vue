<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import { navGroups } from '@/composables/auth'
import { overlayEnter, overlayLeave, slideThumb } from '@/composables/motion'
import { createFocusTrap } from '@/composables/focus'

/* 命令面板（Ctrl/⌘ K）：最近访问 / 页面 / 动作，一块玻璃滑块表示键盘焦点 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'action', name: 'appearance' | 'logout'): void }>()

const router = useRouter()
const route = useRoute()
const panel = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
const thumb = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const keyword = ref('')
const active = ref(0)
const trap = createFocusTrap()

interface Entry { key: string; group: string; label: string; sub?: string; icon?: string; run: () => void }

const RECENT_KEY = 'hub.recent'
const recent = ref<string[]>(readRecent())
function readRecent(): string[] { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[] } catch { return [] } }
watch(() => route.path, (path) => {
  if (!route.meta.title || route.name === 'not-found') return
  recent.value = [path, ...recent.value.filter(p => p !== path)].slice(0, 5)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value)) } catch { /* 忽略 */ }
}, { immediate: true })

const pages = computed(() => navGroups.value.flatMap(g => g.items.map(i => ({ ...i, group: g.single ? '' : g.label }))))
const entries = computed<Entry[]>(() => {
  const key = keyword.value.trim().toLowerCase()
  const out: Entry[] = []
  if (!key) recent.value.map(path => pages.value.find(p => p.path === path)).filter((p): p is NonNullable<typeof p> => Boolean(p) && p!.path !== route.path).slice(0, 4)
    .forEach(p => out.push({ key: `r-${p.key}`, group: '最近访问', label: p.label, sub: p.group, icon: p.icon, run: () => go(p.path) }))
  pages.value.filter(p => !key || (p.label + p.group).toLowerCase().includes(key))
    .forEach(p => out.push({ key: `p-${p.key}`, group: '页面', label: p.label, sub: p.group, icon: p.icon, run: () => go(p.path) }))
  const acts: Entry[] = [
    { key: 'a-appearance', group: '动作', label: '外观设置（深色 / 浅色）', icon: 'contrast', run: () => act('appearance') },
    { key: 'a-logout', group: '动作', label: '退出登录', icon: 'logout', run: () => act('logout') },
  ]
  acts.filter(a => !key || a.label.toLowerCase().includes(key)).forEach(a => out.push(a))
  return out
})
const grouped = computed(() => {
  const g: Array<{ name: string; items: Array<Entry & { index: number }> }> = []
  entries.value.forEach((e, index) => { let x = g.find(y => y.name === e.group); if (!x) g.push(x = { name: e.group, items: [] }); x.items.push({ ...e, index }) })
  return g
})
watch(keyword, () => { active.value = 0 })
function go(path: string) { emit('close'); router.push(path) }
function act(name: 'appearance' | 'logout') { emit('close'); emit('action', name) }
function syncThumb(instant = false) {
  nextTick(() => {
    const el = list.value?.querySelector<HTMLElement>(`[data-index="${active.value}"]`)
    if (!el || !thumb.value) return
    slideThumb(thumb.value, el, 'y', instant)
    el.scrollIntoView({ block: 'nearest' })
  })
}
watch(active, () => syncThumb())
watch(entries, () => syncThumb(true))
watch(() => props.open, async (open) => {
  if (open) { keyword.value = ''; active.value = 0; await nextTick(); trap.activate(panel.value); input.value?.focus(); syncThumb(true) }
  else trap.deactivate()
})
function onKey(event: KeyboardEvent) {
  const n = entries.value.length
  if (event.key === 'Escape') { event.preventDefault(); emit('close') }
  else if (event.key === 'ArrowDown' && n) { event.preventDefault(); active.value = (active.value + 1) % n }
  else if (event.key === 'ArrowUp' && n) { event.preventDefault(); active.value = (active.value - 1 + n) % n }
  else if (event.key === 'Enter' && n) { event.preventDefault(); entries.value[active.value]?.run() }
}
</script>

<template>
  <Teleport to="body">
    <Transition :css="false" @enter="(el, done) => overlayEnter(el, done, 'modal')" @leave="(el, done) => overlayLeave(el, done, 'modal')">
      <div v-if="open" class="overlay cmd-overlay" @mousedown.self="emit('close')">
        <div ref="panel" class="modal cmd-panel m-float" role="dialog" aria-modal="true" aria-label="命令面板" @keydown="onKey">
          <div class="cmd-input">
            <Icon name="search" :size="18" />
            <input ref="input" v-model="keyword" placeholder="搜索页面或动作" role="combobox" aria-expanded="true" aria-controls="cmd-results" :aria-activedescendant="entries.length ? `cmd-${active}` : undefined" />
            <span class="kbd">Esc</span>
          </div>
          <div id="cmd-results" ref="list" class="cmd-results" role="listbox">
            <span v-show="entries.length" ref="thumb" class="cmd-thumb m-pill" aria-hidden="true" />
            <template v-for="g in grouped" :key="g.name">
              <div class="cmd-group eyebrow" role="presentation">{{ g.name }}</div>
              <button v-for="item in g.items" :id="`cmd-${item.index}`" :key="item.key" :data-index="item.index" type="button" role="option" :aria-selected="item.index === active" :class="['cmd-item', item.index === active && 'is-active']" tabindex="-1" @pointerenter="active = item.index" @click="item.run()">
                <span class="cmd-ico m-groove"><Icon :name="item.icon ?? 'file'" :size="16" /></span>
                <span class="cmd-label">{{ item.label }}</span>
                <span v-if="item.sub" class="cmd-sub">{{ item.sub }}</span>
                <Icon name="arrowRight" :size="14" class="cmd-go" />
              </button>
            </template>
            <div v-if="!entries.length" class="select-empty" style="padding: 28px">没有找到匹配的结果</div>
          </div>
          <div class="cmd-foot">
            <span><span class="kbd">↑</span><span class="kbd">↓</span> 选择</span>
            <span><span class="kbd">↵</span> 打开</span>
            <span class="spacer" />
            <span class="eyebrow">命令</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

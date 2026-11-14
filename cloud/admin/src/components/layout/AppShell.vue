<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'
import CommandPalette from './CommandPalette.vue'
import AppearanceDialog from './AppearanceDialog.vue'
import { logout, startBadges, setNewChatHandler } from '@/composables/auth'
import { pushToast } from '@/composables/toast'
import { appearance } from '@/composables/appearance'
import { pageEnter, pageLeave, playShellEntrance } from '@/composables/motion'
import { confirm } from '@/composables/confirm'

const route = useRoute()
const router = useRouter()
const frame = ref<HTMLElement | null>(null)
const content = ref<HTMLElement | null>(null)
const mobile = ref(false)
const mobileOpen = ref(false)
const commandOpen = ref(false)
const appearanceOpen = ref(false)
const scrolled = ref(false)

// 内容滚动后顶栏凝结：只切换一层静态玻璃的 opacity，不补间 backdrop-filter
function onContentScroll() {
  const next = (content.value?.scrollTop ?? 0) > 8
  if (next !== scrolled.value) scrolled.value = next
}

const mq = window.matchMedia('(max-width: 820px)')
const syncMobile = () => { mobile.value = mq.matches; if (!mq.matches) mobileOpen.value = false }

const frameClass = computed(() => ({
  'is-collapsed': appearance.railCollapsed && !mobile.value,
  'is-mobile-open': mobile.value && mobileOpen.value,
}))

function toggleRail() {
  if (mobile.value) mobileOpen.value = !mobileOpen.value
  else appearance.railCollapsed = !appearance.railCollapsed
}

async function onLogout() {
  const ok = await confirm({ title: '退出登录', message: '确认退出当前账号吗？', confirmText: '退出' })
  if (!ok) return
  const task = logout()
  await router.replace({ name: 'login' })
  await task
}

function onCommandAction(name: 'appearance' | 'logout') {
  if (name === 'appearance') appearanceOpen.value = true
  else onLogout()
}
// 有新的对话消息：不在对话页时弹个提示（可以在设置里打开提示音）
setNewChatHandler((n) => {
  if (route.name !== 'chat') pushToast(`实时对话：收到 ${n} 条新消息`, 'info')
  try { if (localStorage.getItem('hub.sound') === '1') beep() } catch { /* 忽略 */ }
})
function beep() {
  try {
    const C = (window as any).AudioContext || (window as any).webkitAudioContext
    const ctx = new C(), o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4)
  } catch { /* 浏览器不让放声音时安静跳过 */ }
}

function onGlobalKey(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    commandOpen.value = !commandOpen.value
  }
}

watch(() => route.fullPath, () => { mobileOpen.value = false })

onMounted(() => {
  syncMobile()
  mq.addEventListener('change', syncMobile)
  document.addEventListener('keydown', onGlobalKey)
  if (frame.value) playShellEntrance(frame.value)
  startBadges()
})
onBeforeUnmount(() => {
  mq.removeEventListener('change', syncMobile)
  document.removeEventListener('keydown', onGlobalKey)
})
</script>

<template>
  <div class="stage">
    <div ref="frame" :class="['app-frame', frameClass]">
      <Sidebar @navigate="mobileOpen = false" />
      <div v-if="mobile && mobileOpen" class="rail-scrim" aria-hidden="true" @click="mobileOpen = false" />
      <div :class="['workspace', { 'is-scrolled': scrolled }]">
        <Topbar
          @toggle-rail="toggleRail"
          @command="commandOpen = true"
          @appearance="appearanceOpen = true"
          @logout="onLogout"
        />
        <main ref="content" class="content" tabindex="-1" @scroll.passive="onContentScroll">
          <router-view v-slot="{ Component }">
            <Transition mode="out-in" :css="false" appear @leave="pageLeave" @after-leave="content?.scrollTo({ top: 0 }); scrolled = false" @enter="pageEnter">
              <component :is="Component" :key="route.path" />
            </Transition>
          </router-view>
        </main>
      </div>
    </div>
    <CommandPalette :open="commandOpen" @close="commandOpen = false" @action="onCommandAction" />
    <AppearanceDialog :open="appearanceOpen" @close="appearanceOpen = false" />
  </div>
</template>

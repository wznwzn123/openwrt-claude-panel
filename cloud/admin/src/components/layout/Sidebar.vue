<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import { navGroups, badges } from '@/composables/auth'
import { appearance } from '@/composables/appearance'
import { slideThumb } from '@/composables/motion'
import { APP } from '@/data'

const emit = defineEmits<{ (e: 'navigate'): void }>()

const route = useRoute()
const router = useRouter()
const nav = ref<HTMLElement | null>(null)
const thumb = ref<HTMLElement | null>(null)

// 提醒数字：对话没看的、反馈没处理的、续期申请没处理的
const badgeOf = (k: string) => { const b = badges.value; const n = k === 'chat' ? b.chat : k === 'feedback' ? b.fb : k === 'applications' ? b.aps : 0; return n > 99 ? '99+' : n ? String(n) : '' }
const activeKey = computed(() => String(route.name ?? ''))
const hasActive = computed(() => navGroups.value.some(g => g.items.some(i => i.key === activeKey.value)))

function go(path: string) {
  emit('navigate')
  if (route.path !== path) router.push(path)
}

function sync(instant = false) {
  const target = nav.value?.querySelector<HTMLElement>('.nav-item.is-active') ?? null
  slideThumb(thumb.value, target, 'y', instant)
}

let observer: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => sync(true))
  observer = new ResizeObserver(() => sync(true))
  if (nav.value) observer.observe(nav.value)
})
onBeforeUnmount(() => observer?.disconnect())
watch(activeKey, () => nextTick(() => sync()))
watch(() => [navGroups.value, appearance.railCollapsed], () => nextTick(() => sync(true)), { deep: true })
</script>

<template>
  <aside class="rail m-rail" aria-label="主导航">
    <div class="rail-brand">
      <span class="brand-mark hub-logo" aria-hidden="true"><svg viewBox="0 0 100 100" width="34" height="34"><rect width="100" height="100" rx="22.5" fill="#101C40"/><path d="M41.91 24.45A29 29 0 1 0 75.55 58.09A24 24 0 0 1 41.91 24.45Z" fill="#F4F1EA"/><path d="M62.6 21.4A17 17 0 0 1 78.6 37.4" stroke="#FFB547" stroke-width="4" stroke-linecap="round" fill="none"/><circle cx="63" cy="37" r="7" fill="#FFB547"/></svg></span>
      <div class="brand-text">
        <div class="brand-name">{{ APP.shortName }}</div>
        <div class="brand-sub">{{ APP.subtitle }}</div>
      </div>
    </div>

    <nav ref="nav" class="rail-nav">
      <span v-show="hasActive" ref="thumb" class="nav-thumb m-pill" aria-hidden="true" />
      <div v-for="group in navGroups" :key="group.key" class="nav-group">
        <div v-if="!group.single" class="nav-group-title">{{ group.label }}</div>
        <div class="nav-list">
          <button
            v-for="item in group.items"
            :key="item.key"
            type="button"
            :class="['nav-item', item.key === activeKey && 'is-active']"
            :aria-current="item.key === activeKey ? 'page' : undefined"
            :title="appearance.railCollapsed ? item.label : undefined"
            @click="go(item.path)"
          >
            <Icon class="nav-ico" :name="item.icon" :size="18" />
            <span class="nav-label">{{ item.label }}</span>
            <span v-if="badgeOf(item.key)" class="nav-badge" :aria-label="badgeOf(item.key) + ' 条新的'">{{ badgeOf(item.key) }}</span>
          </button>
        </div>
      </div>
    </nav>

    <div class="rail-foot">
      <span class="nav-label faint" style="font-size: 11px; padding: 0 10px">{{ APP.version }}</span>
    </div>
  </aside>
</template>

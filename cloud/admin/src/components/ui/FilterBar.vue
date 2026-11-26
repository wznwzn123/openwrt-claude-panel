<script setup lang="ts">
/* 管理后台列表上面的筛选（用户 11/27：一大片圆角按钮太乱）：
 * 第一排是常用的几项，等分的分段按钮，带数量；其余的收进一个下拉（默认叫「要处理的」），数量是 0 的灰掉；
 * 下拉里标了 alert 的有数量时，按钮上一个红色数字。右边可以放搜索框（默认插槽）。 */
import { computed } from 'vue'
import Segmented from './Segmented.vue'
import Select from './Select.vue'

export interface FilterItem { k: string; n: string; c?: number; alert?: boolean }
const props = withDefaults(defineProps<{
  modelValue: string
  items: FilterItem[]
  more?: FilterItem[]
  moreLabel?: string
  label?: string
}>(), { more: () => [], moreLabel: '要处理的', label: '筛选' })
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const seg = computed(() => props.items.map(i => ({ label: i.c != null ? `${i.n} ${i.c}` : i.n, value: i.k })))
const inMore = computed(() => props.more.some(i => i.k === props.modelValue))
const opts = computed(() => props.more.map(i => ({ label: i.n, value: i.k, hint: i.c != null ? String(i.c) : '', disabled: i.c === 0 && i.k !== props.modelValue })))
const alerts = computed(() => props.more.filter(i => i.alert).reduce((a, i) => a + (i.c || 0), 0))
function pick(v: string | number | null | undefined) {
  emit('update:modelValue', v ? String(v) : (props.items[0]?.k ?? ''))
}
</script>

<template>
  <div class="filterbar">
    <Segmented v-if="items.length" class="fb-seg" :model-value="modelValue" :options="seg" :label="label" @update:model-value="(v) => emit('update:modelValue', String(v))" />
    <div v-if="more.length || $slots.default" class="fb-row">
      <div v-if="more.length" :class="['fb-more', inMore && 'is-on']">
        <Select :model-value="inMore ? modelValue : null" :options="opts" :placeholder="moreLabel" clearable @update:model-value="pick" />
        <span v-if="alerts && !inMore" class="fb-badge" aria-hidden="true">{{ alerts > 99 ? '99+' : alerts }}</span>
      </div>
      <div v-if="$slots.default" class="fb-slot"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.filterbar { display: grid; gap: 8px; min-width: 0; }
.fb-seg { display: flex; width: 100%; }
.fb-seg :deep(button) { flex: 1 1 0; min-width: 0; padding: 0 4px; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 380px) { .fb-seg :deep(button) { font-size: 12px; } }
.fb-row { display: flex; gap: 8px; align-items: center; min-width: 0; }
.fb-more { position: relative; flex: 0 0 auto; width: 148px; max-width: 46%; }
.fb-more.is-on :deep(.select-trigger) { border-color: var(--accent, var(--focus)); color: var(--ink); }
.fb-badge { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--danger, #e5484d); color: #fff; font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; pointer-events: none; }
.fb-slot { flex: 1 1 auto; min-width: 0; }
.fb-slot :deep(.input-shell) { width: 100%; }
</style>

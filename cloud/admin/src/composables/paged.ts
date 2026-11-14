import { computed, ref, watch, type Ref } from 'vue'
// 在浏览器里分页（数据一次拿回来，几百上千条）
export function usePaged<T>(rows: Ref<T[]>, size = 20) {
  const page = ref(1)
  const pageSize = ref(size)
  const total = computed(() => rows.value.length)
  const view = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
  watch([total, pageSize], () => { const max = Math.max(1, Math.ceil(total.value / pageSize.value)); if (page.value > max) page.value = max })
  return { page, pageSize, total, view }
}

<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import { FILE_MAX, fmtSize, uploadFile, type UpFile } from '@/composables/upload'
import { pushToast } from '@/composables/toast'

/* 要发的文件：选了就开始传，显示进度，可以去掉。父组件用 ids() 拿已经传好的文件编号；
   已经发出去的（比如编辑公告时原来的附件）用 keep 传进来，也能去掉 */
const props = withDefaults(defineProps<{ ctx: 'chat' | 'ann'; max?: number }>(), { max: 5 })
interface Item { key: number; f?: File; done?: UpFile; p: number; err: string }
const items = ref<Item[]>([])
const input = ref<HTMLInputElement | null>(null)
let n = 0
function add(list: FileList | null) {
  for (const f of Array.from(list || [])) {
    if (items.value.length >= props.max) { pushToast('一次最多 ' + props.max + ' 个文件', 'danger'); break }
    if (f.size > FILE_MAX) { pushToast('「' + f.name + '」太大了：最大 200MB', 'danger'); continue }
    const it = ref<Item>({ key: ++n, f, p: 0, err: '' }).value
    items.value.push(it)
    uploadFile(f, props.ctx, (p) => { it.p = p }).then((r) => { it.done = r }, (e) => { it.err = e.message })
  }
  if (input.value) input.value.value = ''
}
function keep(files: UpFile[]) { items.value = (files || []).map((f) => ({ key: ++n, done: f, p: 1, err: '' })) }
const busy = computed(() => items.value.some((x) => !x.done && !x.err))
const bad = computed(() => items.value.some((x) => x.err))
defineExpose({
  ids: () => items.value.filter((x) => x.done).map((x) => x.done!.id),
  busy, bad, keep,
  clear() { items.value = [] },
  pick() { input.value?.click() },
  get count() { return items.value.length },
})
</script>

<template>
  <div class="fa">
    <input ref="input" type="file" multiple hidden @change="add(($event.target as HTMLInputElement).files)">
    <div v-for="(x, i) in items" :key="x.key" class="fa-it">
      <span class="fa-ic"><Icon name="file" :size="16" /></span>
      <div class="fa-tx">
        <b>{{ x.done ? x.done.name : x.f?.name }}</b>
        <small :class="x.err && 'bad'">{{ x.err ? '没传上：' + x.err : x.done ? fmtSize(x.done.size) + ' · 传好了' : fmtSize(x.f?.size || 0) + ' · 正在上传 ' + Math.floor(x.p * 100) + '%' }}</small>
        <div v-if="!x.done && !x.err" class="fa-bar"><i :style="{ width: Math.floor(x.p * 100) + '%' }" /></div>
      </div>
      <button type="button" class="fa-x" aria-label="不要这个文件" @click="items.splice(i, 1)">×</button>
    </div>
  </div>
</template>

<style scoped>
.fa { display: grid; gap: 6px; }
.fa:empty { display: none; }
.fa-it { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line, rgba(127, 127, 127, .2)); min-width: 0; }
.fa-ic { flex: none; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; background: rgba(127, 127, 127, .12); }
.fa-tx { flex: 1; min-width: 0; }
.fa-tx b { display: block; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fa-tx small { display: block; font-size: 12px; opacity: .7; }
.fa-tx small.bad { color: var(--red-text, #e5484d); opacity: 1; }
.fa-bar { height: 4px; border-radius: 2px; background: rgba(127, 127, 127, .2); margin-top: 4px; overflow: hidden; }
.fa-bar i { display: block; height: 100%; background: var(--accent, #2563eb); transition: width .2s; }
.fa-x { flex: none; width: 28px; height: 28px; border: 0; border-radius: 50%; background: transparent; font-size: 18px; cursor: pointer; color: inherit; opacity: .6; }
</style>

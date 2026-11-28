<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import Tag from '@/components/ui/Tag.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { get, post } from '@/api'
import { badges } from '@/composables/auth'
import { ask } from '@/composables/ask'
import { confirm } from '@/composables/confirm'
import { pushToast, toastError } from '@/composables/toast'
import { ago, dt } from '@/utils/fmt'

/* 热补丁分批推送和退回（用户 11/28）：尝鲜 → 10% → 50% → 全部，每批 6 小时；一台装失败就自动暂停。
   推下一批、暂停 / 继续、全部退回（退到上一个）、重新推送；按台退回 = 把这台固定在某个补丁 */
const list = ref<any[]>([])
const pins = ref<any[]>([])
const info = ref({ beta: 0, active: 0 })
const loading = ref(true)
const open = ref<Record<string, boolean>>({})
const more = ref<Record<string, boolean>>({})
// 每个版本先列最新的 4 个和还在推、暂停、退回的；更早的推给全部了的收起来
const shown = (g: any) => (more.value[g.base] ? g.items : g.items.filter((x: any, i: number) => i < 4 || x.stage !== 'all'))
const ST: Record<string, { n: string; tone: string }> = {
  beta: { n: '尝鲜', tone: 'info' }, p10: { n: '10%', tone: 'info' }, p50: { n: '50%', tone: 'info' }, all: { n: '全部', tone: 'ok' },
  paused: { n: '已暂停', tone: 'danger' }, back: { n: '已退回', tone: 'neutral' }, v0: { n: '正式版原样', tone: 'neutral' },
}
const NEXT: Record<string, string> = { beta: ' 10%', p10: ' 50%', p50: '全部' }
const groups = computed(() => {
  const m = new Map<string, any[]>()
  for (const x of list.value) { if (!m.has(x.base)) m.set(x.base, []); m.get(x.base)!.push(x) }
  return [...m.entries()].map(([base, items]) => ({ base, items }))
})
const id = (x: any) => x.base + '-' + x.n
// 「全部退回」只放在每个版本最新的那个没退回的补丁上（补丁是累计的，退回它就是退到上一个；要再往前退就再点一次）
const top = computed(() => { const m: Record<string, number> = {}; for (const x of list.value) if (x.n && x.stage !== 'back' && !(m[x.base] >= x.n)) m[x.base] = x.n; return m })
// 装失败几台 / 下载失败几台（同一台算一次；下载失败多半是网络，不暂停）
const nf = (x: any, soft: boolean) => new Set(x.fails.filter((f: any) => !!f.soft === soft && !f.back).map((f: any) => f.kh)).size
const who = (k: string) => (k.startsWith('s:') ? '托管版 ' + k.slice(2) : '自建版 ' + k.slice(2, 6))
const left = (t: number) => { const s = Math.max(0, t - Date.now()) / 1000; return s < 3600 ? Math.max(1, Math.round(s / 60)) + ' 分钟' : Math.round(s / 3600) + ' 小时' }
function when(x: any) {
  if (x.stage === 'paused') return '暂停前在 ' + (ST[x.prev]?.n || '10%') + ' · ' + ago(x.at) + '暂停'
  if (x.stage === 'back') return ago(x.at) + '退回'
  if (x.stage === 'all') return '已推给全部'
  return ago(x.at) + '开始 · ' + left(x.next) + '后推到' + NEXT[x.stage]
}
async function load() {
  try { const r = await get('hot'); list.value = r.list || []; pins.value = r.pins || []; info.value = { beta: r.beta || 0, active: r.active || 0 }; badges.value = { ...badges.value, hot: list.value.filter(x => x.stage === 'paused').length } }
  catch (e) { toastError(e, '补丁读不出来') } finally { loading.value = false }
}
async function act(x: any, a: string) {
  const v = 'v' + x.base + ' V' + x.n
  const C: Record<string, any> = {
    next: { title: '推下一批：' + v, message: '现在推到' + NEXT[x.stage] + ' 不等 6 小时。', confirmText: '推下一批' },
    pause: { title: '暂停：' + v, message: '还没装的先不装，已经装了的照常用。', confirmText: '暂停' },
    resume: { title: '继续推送：' + v, message: '回到 ' + (ST[x.prev]?.n || '10%') + ' 重新算 6 小时。', confirmText: '继续' },
    back: { title: '全部退回：' + v, message: '装了它的路由器 30 分钟内退回上一个补丁。之后发的补丁一起退回。', confirmText: '全部退回', danger: true },
    redo: { title: '重新推送：' + v, message: '从头分批推。', confirmText: '重新推送' },
  }
  if (!(await confirm(C[a]))) return
  try { const r = await post('hot/' + id(x) + '/' + a, {}); pushToast(a === 'back' ? '已全部退回到 V' + r.to : { next: '已推到' + NEXT[x.stage], pause: '已暂停', resume: '已继续', redo: '已重新推送' }[a] || '好了'); load() }
  catch (e) { toastError(e, '没成功') }
}
// 按台退回：固定在某个补丁（失败列表里点，或者路由器列表里点）
async function pin(key: string, base: string, cur: number) {
  // 能固定的：这个版本比现在早、没退回的补丁（最近 5 个），有 V0 的再加上「V0 正式版原样」
  const can = list.value.filter(x => x.base === base && x.n < cur && x.stage !== 'back').map(x => x.n).sort((a, b) => b - a)
  const chips = can.filter(n => n > 0).slice(0, 5).map(n => ({ label: 'V' + n, value: String(n) }))
  if (can.includes(0)) chips.push({ label: 'V0 正式版原样', value: '0' })
  const v = await ask({ title: '退回这台：' + who(key), message: '固定在这个补丁 后面的补丁这台都不装 直到取消固定。', input: { label: '补丁编号', value: chips[0]?.value ?? '', numeric: true, required: '要填编号' }, chips, confirmText: '退回这台', danger: true })
  if (!v) return
  try { await post('hotpin', { key, base, n: +v.value }); pushToast('已固定在 V' + v.value); load() } catch (e) { toastError(e, '没成功') }
}
async function unpin(p: any) {
  if (!(await confirm({ title: '取消固定：' + who(p.key), message: '照常接着装新补丁。', confirmText: '取消固定' }))) return
  try { await post('hotpin', { key: p.key, base: p.base, n: null }); pushToast('已取消固定'); load() } catch (e) { toastError(e, '没成功') }
}
onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader title="补丁" desc="修复补丁分批推送：尝鲜 → 10% → 50% → 全部，每批 6 小时。有一台装失败自动暂停。点了「检查更新」的直接装。">
      <Tag tone="info">尝鲜 {{ info.beta }} 台 · 4 天内打开过面板 {{ info.active }} 台</Tag>
    </PageHeader>
    <div class="hub-stack">
      <Panel v-for="g in groups" :key="g.base" :title="'v' + g.base" :meta="g.items.filter((x: any) => x.n).length + ' 个补丁'" class="reveal">
        <div class="hub-list">
          <div v-for="x in shown(g)" :key="id(x)" class="hub-row hot-row">
            <div class="hub-row-main">
              <div class="hub-row-title">{{ x.n ? 'V' + x.n : 'V0' }}<Tag :tone="ST[x.stage]?.tone" dot>{{ ST[x.stage]?.n || x.stage }}</Tag><span class="hot-notes">{{ x.notes }}</span></div>
              <div v-if="x.n" class="hub-row-meta">{{ when(x) }}<template v-if="x.okn || x.stage !== 'all'"> · 装好 {{ x.okn }} 台</template><template v-if="nf(x, false)"> · <b class="bad nw">装失败 {{ nf(x, false) }} 台</b></template><template v-if="nf(x, true)"> · <span class="nw">下载失败 {{ nf(x, true) }} 台</span></template> · {{ dt(x.made) }} 发布</div>
              <div v-if="x.n && x.fails.length" class="hot-fails">
                <div v-for="f in x.fails.slice(0, open[id(x)] ? 50 : 3)" :key="f.kh + f.err" class="hub-note hot-fail">
                  <span><b>{{ who(f.key) }}</b> {{ f.err }}<template v-if="f.c > 1"> × {{ f.c }}</template> · {{ ago(f.at) }}<Tag v-if="f.soft" tone="neutral">网络</Tag><Tag v-if="f.back" tone="neutral">退回时</Tag></span>
                  <Button size="sm" @click="pin(f.key, x.base, x.n)">退回这台</Button>
                </div>
              </div>
              <div v-if="x.n && open[id(x)]" class="hot-log">
                <p v-for="(l, i) in x.log" :key="i" class="hub-row-meta">{{ dt(l.at) }} {{ l.t }}</p>
              </div>
            </div>
            <div v-if="x.n" class="hub-row-acts">
              <Button v-if="NEXT[x.stage]" size="sm" variant="primary" @click="act(x, 'next')">推下一批</Button>
              <Button v-if="x.stage === 'paused'" size="sm" variant="primary" @click="act(x, 'resume')">继续</Button>
              <Button v-if="NEXT[x.stage]" size="sm" @click="act(x, 'pause')">暂停</Button>
              <Button v-if="x.stage !== 'back' && top[x.base] === x.n" size="sm" variant="danger" @click="act(x, 'back')">全部退回</Button>
              <Button v-if="x.stage === 'back'" size="sm" @click="act(x, 'redo')">重新推送</Button>
              <Button size="sm" variant="ghost" @click="open[id(x)] = !open[id(x)]">{{ open[id(x)] ? '收起' : '记录' }}</Button>
            </div>
          </div>
          <div v-if="g.items.length > shown(g).length || more[g.base]" class="hot-more"><Button size="sm" variant="ghost" @click="more[g.base] = !more[g.base]">{{ more[g.base] ? '收起' : '更早的 ' + (g.items.length - shown(g).length) + ' 个' }}</Button></div>
        </div>
      </Panel>
      <Panel v-if="pins.length" title="按台退回的" :meta="pins.length + ' 台'" class="reveal">
        <div class="hub-list">
          <div v-for="p in pins" :key="p.key" class="hub-row">
            <div class="hub-row-main"><div class="hub-row-title">{{ who(p.key) }}</div><div class="hub-row-meta">固定在 v{{ p.base }} {{ p.n ? 'V' + p.n : 'V0' }} · {{ ago(p.at) }}</div></div>
            <div class="hub-row-acts"><Button size="sm" @click="unpin(p)">取消固定</Button></div>
          </div>
        </div>
      </Panel>
      <EmptyState v-if="!loading && !list.length" title="还没发过补丁" icon="layers" />
    </div>
  </div>
</template>

<style scoped>
.nw { white-space: nowrap; }
.hub-row-meta { text-wrap: pretty; }
.hot-notes { font-weight: 400; color: var(--ink-soft); font-size: 13px; min-width: 0; overflow-wrap: anywhere; }
.hot-fails { display: grid; gap: 6px; margin-top: 6px; }
.hot-fail { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; }
.hot-fail > span { flex: 1 1 200px; min-width: 0; overflow-wrap: anywhere; }
.hot-log { margin-top: 6px; }
.hot-more { padding-top: 8px; }
.hot-log p { margin: 0; }
</style>

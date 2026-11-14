<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Segmented from '@/components/ui/Segmented.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Metric from '@/components/ui/Metric.vue'
import DataTable, { type Column } from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import TrendChart from '@/components/charts/TrendChart.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import HScroll from '@/components/ui/HScroll.vue'
import { get, type DayStat } from '@/api'
import { usePaged } from '@/composables/paged'
import { toastError } from '@/composables/toast'
import { CC } from '@/utils/fmt'

/* 访问统计：官网每一页每天打开多少次、多少个不同的访客（按 IP 算，不算机器人）、来自哪里；每天的访客 IP（留 30 天） */
const PG: Record<string, string> = { home: '首页', app: '账号页', reply: '查进度', privacy: '隐私说明', security: '安全说明', notice: '用户须知', terms: '用户使用协议' }
const N: Record<string, string> = { pv: '页面打开（含机器人）', bot: '机器人', login_ok: '登录成功', login_fail: '登录失败', reg: '注册', reset: '找回密码', adm_ok: '管理后台登录', adm_fail: '管理后台密钥错', dev_reg: '开通路由器', fb: '面板反馈', report: '官网报告', install_fail: '安装失败上报', chat_in: '收到对话消息', chat_out: '回复对话', mail_ok: '发出邮件', mail_fail: '邮件失败', err: '出错', uv_over: '访客太多没记 IP' }
const range = ref<7 | 30 | 90>(30)
const days = ref<DayStat[]>([])
const loading = ref(true)
const day = ref('')
const visitors = ref<Array<{ ip: string; n: number }>>([])
const vq = ref('')
const vLoading = ref(false)
const pv = computed(() => days.value.map(d => (d.n.pv || 0) - (d.n.bot || 0)))
const uv = computed(() => days.value.map(d => d.uv || 0))
const labels = computed(() => days.value.map(d => d.d.slice(5).replace('-', '/')))
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
const pages = computed(() => { const m: Record<string, number> = {}; for (const d of days.value) for (const [k, v] of Object.entries(d.pv || {})) m[k] = (m[k] || 0) + v; return Object.entries(m).sort((a, b) => b[1] - a[1]) })
const countries = computed(() => { const m: Record<string, number> = {}; for (const d of days.value) for (const [k, v] of Object.entries(d.cc || {})) m[k] = (m[k] || 0) + v; return Object.entries(m).sort((a, b) => b[1] - a[1]) })
const counters = computed(() => { const m: Record<string, number> = {}; for (const d of days.value) for (const [k, v] of Object.entries(d.n || {})) m[k] = (m[k] || 0) + v; return Object.entries(N).map(([k, n]) => ({ k, n, v: m[k] || 0 })) })
const table = computed(() => [...days.value].reverse().map(d => ({ ...d, pvh: (d.n.pv || 0) - (d.n.bot || 0) })))
const dayCols: Column[] = [{ key: 'd', title: '日期', width: 120 }, { key: 'pvh', title: '访问', width: 90, align: 'right' }, { key: 'uv', title: '访客', width: 90, align: 'right' }, { key: 'bot', title: '机器人', width: 90, align: 'right' }, { key: 'more', title: '这一天还有', minWidth: 260 }]
const vrows = computed(() => { const s = vq.value.trim(); return visitors.value.filter(x => !s || x.ip.includes(s)) })
const { page, pageSize, total, view } = usePaged(vrows, 20)
const vCols: Column[] = [{ key: 'ip', title: 'IP', minWidth: 200 }, { key: 'n', title: '打开次数', width: 110, align: 'right' }]
async function load() { loading.value = true; try { days.value = (await get(`stats?days=${range.value}`)).days; if (!day.value) day.value = days.value[days.value.length - 1]?.d || '' } catch (e) { toastError(e, '统计读不出来') } finally { loading.value = false } }
async function loadVisitors() { if (!day.value) return; vLoading.value = true; try { visitors.value = (await get(`visitors?day=${day.value}`)).list } catch (e) { toastError(e, '访客读不出来') } finally { vLoading.value = false } }
const more = (d: DayStat) => Object.entries(d.n || {}).filter(([k, v]) => v && !['pv', 'bot'].includes(k) && N[k]).map(([k, v]) => N[k] + ' ' + v).join(' · ') || '—'
watch(range, load)
watch(day, loadVisitors)
onMounted(async () => { await load(); loadVisitors() })
</script>

<template>
  <div class="page">
    <PageHeader title="访问统计" desc="官网各页每天打开多少次、多少个不同的访客（按 IP 算，不算机器人和管理后台）、来自哪里。访客 IP 只留 30 天，次数留 180 天。">
      <Segmented v-model="range" label="时间范围" :options="[{ label: '7 天', value: 7 }, { label: '30 天', value: 30 }, { label: '90 天', value: 90 }]" />
    </PageHeader>
    <div class="hub-stack">
      <div class="bento-grid reveal">
        <section class="bento bento-third"><span class="side-label">访问次数</span><Metric :value="loading ? null : sum(pv)" unit="次" size="l" /></section>
        <section class="bento bento-third"><span class="side-label">每天访客加起来</span><Metric :value="loading ? null : sum(uv)" unit="人次" size="l" /></section>
        <section class="bento bento-third"><span class="side-label">机器人</span><Metric :value="loading ? null : sum(days.map(d => d.n.bot || 0))" unit="次" size="l" /></section>
      </div>
      <Panel title="每天的访问和访客" class="reveal">
        <TrendChart v-if="days.length" :step="24" :values="pv" :labels="labels" :secondary="uv" secondary-label="访客" primary-label="访问" :height="240" unit=" 次" />
      </Panel>
      <div class="bento-grid reveal">
        <section class="bento bento-half">
          <div class="bento-head"><span class="section-label">各页面</span></div>
          <ul v-if="pages.length" class="share-list"><li v-for="([k, v], i) in pages" :key="k" :class="`cat-${(i % 5) + 1}`"><span class="share-label">{{ PG[k] || k }}</span><span class="share-track"><i :style="{ width: `${(v / pages[0][1]) * 100}%` }" /></span><span class="share-value tnum">{{ v }}</span></li></ul>
          <EmptyState v-else title="还没有数据" icon="globe" />
        </section>
        <section class="bento bento-half">
          <div class="bento-head"><span class="section-label">国家 / 地区</span></div>
          <ul v-if="countries.length" class="share-list"><li v-for="([k, v], i) in countries.slice(0, 8)" :key="k" :class="`cat-${(i % 5) + 1}`"><span class="share-label">{{ CC[k] || k }}</span><span class="share-track"><i :style="{ width: `${(v / countries[0][1]) * 100}%` }" /></span><span class="share-value tnum">{{ v }}</span></li></ul>
          <EmptyState v-else title="还没有数据" icon="globe" />
        </section>
      </div>
      <Panel title="这段时间的各项次数" class="reveal">
        <HScroll bleed label="左右滑看全部"><dl class="today-grid strip"><div v-for="c in counters" :key="c.k"><dt>{{ c.n }}</dt><dd :class="['tnum', (c.k.includes('fail') || c.k === 'err') && c.v && 'bad']">{{ c.v }}</dd></div></dl></HScroll>
      </Panel>
      <Panel title="按天" class="reveal">
        <DataTable :columns="dayCols" :data="table" row-key="d" :loading="loading" :min-width="680">
          <template #cell-d="{ row }"><button type="button" class="hub-chip" :class="day === row.d && 'is-on'" @click="day = row.d">{{ row.d }}</button></template>
          <template #cell-bot="{ row }">{{ row.n.bot || 0 }}</template>
          <template #cell-more="{ row }"><span style="white-space: normal" class="hub-row-meta">{{ more(row) }}</span></template>
        </DataTable>
      </Panel>
      <Panel :title="`访客 IP · ${day}`" :meta="visitors.length + ' 个'" class="reveal">
        <div class="hub-tools"><TextInput v-model="vq" icon="search" placeholder="搜 IP" clearable /><span class="hub-row-meta">点上面表格里的日期换一天</span></div>
        <DataTable :columns="vCols" :data="view" row-key="ip" :min-width="300" :loading="vLoading" empty-text="这一天没有访客（或者超过 30 天，IP 已经删了）">
          <template #cell-ip="{ row }"><span class="mono">{{ row.ip }}</span></template>
        </DataTable>
        <Pagination v-if="total > pageSize" v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </Panel>
    </div>
  </div>
</template>

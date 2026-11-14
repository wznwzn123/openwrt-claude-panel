<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Tag from '@/components/ui/Tag.vue'
import TextInput from '@/components/ui/TextInput.vue'
import DataTable, { type Column } from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Metric from '@/components/ui/Metric.vue'
import { get, type LoginRow } from '@/api'
import { usePaged } from '@/composables/paged'
import { toastError } from '@/composables/toast'
import { full } from '@/utils/fmt'

/* 登录记录：官网账号的登录 / 注册 / 找回密码，管理后台的登录和密钥输错，都带 IP、地点、设备。留 90 天 */
const route = useRoute()
const all = ref<LoginRow[]>([])
const loading = ref(true)
const q = ref(String(route.query.q || ''))
const k = ref('')
const r = ref('')
const KN: Record<string, string> = { user: '账号登录', admin: '管理后台', reg: '注册', reset: '找回密码' }
const rows = computed(() => { const s = q.value.trim().toLowerCase(); return all.value.map((x, i) => ({ ...x, i })).filter(x => (!k.value || x.k === k.value) && (!r.value || (r.value === 'ok' ? x.ok : !x.ok)) && (!s || [x.who, x.ip, x.place, x.ua, x.why].join(' ').toLowerCase().includes(s))) })
const { page, pageSize, total, view } = usePaged(rows, 20)
const day1 = computed(() => all.value.filter(x => Date.now() - x.t < 864e5))
const ips = computed(() => { const m: Record<string, { ip: string; n: number; fail: number; place: string }> = {}; for (const x of day1.value) { const v = (m[x.ip] ||= { ip: x.ip, n: 0, fail: 0, place: x.place }); v.n++; if (!x.ok) v.fail++ } return Object.values(m).sort((a, b) => b.fail - a.fail || b.n - a.n).slice(0, 8) })
const columns: Column[] = [
  { key: 't', title: '时间', width: 168 },
  { key: 'k', title: '类型', width: 104 },
  { key: 'who', title: '账号', minWidth: 160 },
  { key: 'ok', title: '结果', width: 92 },
  { key: 'why', title: '说明', minWidth: 150 },
  { key: 'ip', title: 'IP', minWidth: 130 },
  { key: 'place', title: '地点', minWidth: 110 },
  { key: 'ua', title: '设备', minWidth: 130 },
]
async function load() { try { all.value = (await get<{ list: LoginRow[] }>('logins')).list } catch (e) { toastError(e, '登录记录读不出来') } finally { loading.value = false } }
watch(() => route.query.q, v => { if (typeof v === 'string') q.value = v })
onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader title="登录记录" desc="官网账号的登录、注册、找回密码，管理后台的登录和输错密钥，都记下 IP、大概地点和设备（留 90 天）。同一个 IP 管理后台密钥错 10 次会被锁 15 分钟。" />
    <div class="hub-stack">
      <div class="bento-grid reveal">
        <section class="bento bento-third"><span class="side-label">24 小时内登录成功</span><Metric :value="day1.filter(x => x.ok).length" unit="次" size="l" /></section>
        <section class="bento bento-third"><span class="side-label">24 小时内失败</span><Metric :value="day1.filter(x => !x.ok).length" unit="次" size="l" /></section>
        <section class="bento bento-third"><span class="side-label">24 小时内不同 IP</span><Metric :value="ips.length ? new Set(day1.map(x => x.ip)).size : 0" unit="个" size="l" /></section>
      </div>
      <Panel v-if="ips.length" title="24 小时内的 IP" meta="失败多的在前，点一下只看这个 IP" class="reveal">
        <div class="hub-chips">
          <button v-for="x in ips" :key="x.ip" type="button" :class="['hub-chip', q === x.ip && 'is-on']" @click="q = q === x.ip ? '' : x.ip">{{ x.ip || '未知' }} · {{ x.place || '—' }}<b>{{ x.n }} 次{{ x.fail ? ' · 失败 ' + x.fail : '' }}</b></button>
        </div>
      </Panel>
      <Panel title="全部记录" :meta="rows.length + ' 条'" class="reveal">
        <div class="hub-tools">
          <div class="hub-chips">
            <button v-for="[v, n] in [['', '全部'], ['user', '账号登录'], ['admin', '管理后台'], ['reg', '注册'], ['reset', '找回密码']]" :key="v" type="button" :class="['hub-chip', k === v && 'is-on']" @click="k = v">{{ n }}</button>
            <button v-for="[v, n] in [['ok', '只看成功'], ['bad', '只看失败']]" :key="v" type="button" :class="['hub-chip', r === v && 'is-on']" @click="r = r === v ? '' : v">{{ n }}</button>
          </div>
          <TextInput v-model="q" icon="search" placeholder="搜邮箱、IP、地点、设备" clearable />
        </div>
        <DataTable :columns="columns" :data="view" row-key="i" :loading="loading" :min-width="1000" empty-text="没有记录">
          <template #cell-t="{ row }"><span class="mono">{{ full(row.t) }}</span></template>
          <template #cell-k="{ row }">{{ KN[row.k] || row.k }}</template>
          <template #cell-ok="{ row }"><Tag :tone="row.ok ? 'ok' : 'danger'" dot>{{ row.ok ? '成功' : '失败' }}</Tag></template>
          <template #cell-ip="{ row }"><span class="mono" style="cursor: pointer" @click="q = row.ip">{{ row.ip || '—' }}</span></template>
        </DataTable>
        <Pagination v-if="total > pageSize" v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </Panel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import Tag from '@/components/ui/Tag.vue'
import TextInput from '@/components/ui/TextInput.vue'
import FilterBar from '@/components/ui/FilterBar.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Pagination from '@/components/ui/Pagination.vue'
import { get } from '@/api'
import { usePaged } from '@/composables/paged'
import { toastError } from '@/composables/toast'
import { ago, day, full, onText, poText, pxText } from '@/utils/fmt'

/* 6.0 第 91 项：一个人的全部记录（只算官网账号上的）：资料、路由器、安装码，下面是按时间排的全部记录，能按种类筛、能搜 */
const route = useRoute()
const router = useRouter()
const uid = String(route.params.uid || '')
const d = ref<any>(null)
const loading = ref(true)
const k = ref('all')
const q = ref('')
const KN: Record<string, string> = { login: '登录', op: '操作', router: '路由器', mail: '邮件', fb: '反馈', app: '续期', chat: '对话', code: '安装码' }
// 用户 11/27：筛选不再一大片按钮——全部和最多的两类放分段，其余收进「其他类型」下拉（只列有记录的）
const evTypes = computed(() => Object.entries(KN).map(([key, n]) => ({ k: key, n, c: (counts.value as any)[key] || 0 })).filter(x => x.c).sort((a, b) => b.c - a.c))
const evTop = computed(() => [{ k: 'all', n: '全部', c: d.value ? d.value.events.length : 0 }, ...evTypes.value.slice(0, 2)])
const evMore = computed(() => evTypes.value.slice(2))
const tone = (x: any) => (x.ok === false ? 'danger' : x.k === 'login' ? 'neutral' : x.k === 'op' ? 'info' : x.k === 'fb' || x.k === 'chat' ? 'ok' : 'neutral')
const counts = computed(() => { const c: Record<string, number> = {}; for (const x of d.value?.events || []) c[x.k] = (c[x.k] || 0) + 1; return c })
const rows = computed<any[]>(() => {
  const s = q.value.trim().toLowerCase()
  return (d.value?.events || []).map((x: any, i: number) => ({ ...x, i })).filter((x: any) => (k.value === 'all' || x.k === k.value) && (!s || [x.text, x.detail, x.ip, x.place, x.ua, x.state].join(' ').toLowerCase().includes(s)))
})
const { page, pageSize, total, view } = usePaged(rows, 50)
const p = computed(() => d.value?.profile || {})
onMounted(async () => {
  try { d.value = await get(`users/${uid}/full`) } catch (e) { toastError(e, '读不出来') } finally { loading.value = false }
})
const go = (x: any) => {
  if (x.k === 'login' && x.ip) router.push({ path: '/logins', query: { q: x.ip } })
  else if (x.k === 'fb' && x.code) router.push({ path: '/feedback', query: { q: String(x.code).toUpperCase() } })
  else if (x.k === 'chat') router.push({ path: '/chat' })
  else if (x.k === 'app') router.push({ path: '/applications' })
}
</script>

<template>
  <div class="page">
    <PageHeader :title="p.email || '账号'" :desc="d ? `共 ${d.total} 条记录` : ''" />
    <div class="ud-back"><Button size="sm" variant="ghost" @click="router.push('/users')">← 返回账号列表</Button></div>
    <EmptyState v-if="!loading && !d" title="没有这个账号" icon="users" />
    <template v-if="d">
      <Panel class="reveal" title="资料">
        <div class="kv-grid">
          <div class="kv"><div class="kv-label">注册</div><div class="kv-value">{{ day(p.created) }}</div></div>
          <div class="kv"><div class="kv-label">最近登录</div><div class="kv-value">{{ p.lastAt ? ago(p.lastAt) : '—' }}</div></div>
          <div class="kv"><div class="kv-label">名字</div><div class="kv-value">{{ p.name || '没改过' }}</div></div>
          <div class="kv"><div class="kv-label">状态</div><div class="kv-value"><Tag v-if="p.deleted" tone="danger">回收站（{{ p.delWhy === 'self' ? '自己注销' : '被删除' }}）</Tag><Tag v-else-if="p.verified" tone="ok">邮箱已验证</Tag><Tag v-else tone="neutral">邮箱没验证</Tag> <Tag v-if="p.totp" tone="ok">两步验证</Tag></div></div>
          <div class="kv"><div class="kv-label">试用</div><div class="kv-value">{{ p.trialUsed ? `用过 ${p.trialUsed} 次` : '没用过' }}</div></div>
          <div class="kv"><div class="kv-label">登录着的设备</div><div class="kv-value">{{ p.sessions.length ? p.sessions.length + ' 台' : '没有' }}</div></div>
          <div v-for="(s, i) in p.sessions" :key="'s' + i" class="kv span-2"><div class="kv-label">设备 {{ i + 1 }}</div><div class="kv-value">{{ s.ua || '未知设备' }} · {{ s.place || '未知地点' }} · 最近 {{ ago(s.last) }}</div></div>
        </div>
      </Panel>
      <Panel class="reveal" :title="`路由器（${d.devs.length}）`">
        <div class="hub-list">
          <div v-for="x in d.devs" :key="x.sub" class="hub-row">
            <div class="hub-row-main">
              <div class="hub-row-title">{{ x.name }}<Tag v-if="x.gone" tone="neutral">已删除</Tag><template v-else><Tag :tone="x.role === '主账号' ? 'ok' : 'neutral'">{{ x.role }}</Tag><Tag v-if="x.off" tone="danger">{{ x.offWhy === 'exp' ? '已到期' : x.offWhy === 'deleted' ? '回收站' : '停用' }}</Tag></template></div>
              <div v-if="!x.gone" class="hub-row-meta"><span class="mono">{{ x.sub }}</span> · {{ x.model || '型号未知' }} · 开通 {{ day(x.created) }} · 打开面板 {{ poText(x.po, x.ver) }} · 代理 {{ pxText(x.px) }} · {{ onText(x.live, x.last) }}{{ x.exp ? ' · 到期 ' + day(x.exp) : ' · 不限期' }}</div>
            </div>
          </div>
          <EmptyState v-if="!d.devs.length" title="没有路由器" icon="router" />
        </div>
      </Panel>
      <Panel v-if="d.codes.length" class="reveal" :title="`安装码（${d.codes.length}）`">
        <div class="hub-list">
          <div v-for="x in d.codes" :key="x.code" class="hub-row">
            <div class="hub-row-main">
              <div class="hub-row-title"><span class="mono">{{ x.code }}</span><Tag v-if="x.trial" tone="neutral">试用</Tag><Tag :tone="x.used >= x.max ? 'neutral' : 'ok'">{{ x.used >= x.max ? '已用' : x.keep ? '卸载后可重装' : '没用' }}</Tag></div>
              <div class="hub-row-meta">{{ x.from ? '用邀请码 ' + x.from + ' 兑换 · ' : '' }}{{ x.exp ? '安装码 ' + day(x.exp) + ' 前有效' : '' }}{{ x.svc ? ' · 开通后能用 ' + x.svc + ' 天' : '' }}</div>
            </div>
          </div>
        </div>
      </Panel>
      <Panel class="reveal" title="全部记录">
        <FilterBar v-model="k" :items="evTop" :more="evMore" more-label="其他类型" label="记录类型" style="margin-bottom: 12px">
          <TextInput v-model="q" icon="search" placeholder="搜内容、IP、地点" clearable />
        </FilterBar>
        <div class="hub-list">
          <div v-for="x in view" :key="x.i" :class="['hub-row', 'ud-ev', (x.k === 'login' && x.ip) || x.k === 'fb' || x.k === 'chat' || x.k === 'app' ? 'ud-link' : '']" @click="go(x)">
            <div class="hub-row-main">
              <div class="hub-row-title"><Tag :tone="tone(x)">{{ KN[x.k] }}</Tag><span class="ud-text">{{ x.text }}</span><Tag v-if="x.state" tone="neutral">{{ x.state }}</Tag></div>
              <div class="hub-row-meta"><span class="mono">{{ full(x.t) }}</span><template v-if="x.ip"> · IP <span class="mono">{{ x.ip }}</span></template><template v-if="x.place"> · {{ x.place }}</template><template v-if="x.ua"> · {{ x.ua }}</template><template v-if="x.detail"> · {{ x.detail }}</template></div>
            </div>
          </div>
          <EmptyState v-if="!rows.length" title="没有记录" icon="list" />
        </div>
        <Pagination v-if="total > pageSize" v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </Panel>
    </template>
  </div>
</template>

<style scoped>
.ud-back { margin: -6px 0 12px; }
.page > .panel + .panel { margin-top: 14px; }
.ud-text { min-width: 0; overflow-wrap: anywhere; }
.ud-link { cursor: pointer; }
.ud-link:hover { background: var(--surface-hover, rgba(0, 0, 0, 0.03)); }
.hub-row-meta { overflow-wrap: anywhere; }
</style>

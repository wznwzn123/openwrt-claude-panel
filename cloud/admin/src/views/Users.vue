<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import Tag from '@/components/ui/Tag.vue'
import TextInput from '@/components/ui/TextInput.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { get, post, type LoginRow } from '@/api'
import { ask } from '@/composables/ask'
import { confirm } from '@/composables/confirm'
import { pushToast, toastError } from '@/composables/toast'
import { ago, day } from '@/utils/fmt'

/* 账号：官网注册的账号。最近一次登录的 IP 和地点从登录记录里来。删除先进回收站 */
const router = useRouter()
const users = ref<any[]>([])
const lastIp = ref<Record<string, LoginRow>>({})
const trashDays = ref(30)
const loading = ref(true)
const q = ref('')
const f = ref<'live' | 'bin'>('live')
const hit = (u: any) => { const k = q.value.trim().toLowerCase(); return !k || [u.email, ...u.devs.map((x: any) => x.name + ' ' + x.sub)].join(' ').toLowerCase().includes(k) }
const shown = computed(() => users.value.filter(u => (f.value === 'bin' ? u.deleted : !u.deleted) && hit(u)).sort((a, b) => f.value === 'bin' ? a.purgeAt - b.purgeAt : (b.lastAt || b.created || 0) - (a.lastAt || a.created || 0)))
async function load() {
  try {
    const [r, l] = await Promise.all([get('users'), get<{ list: LoginRow[] }>('logins').catch(() => ({ list: [] as LoginRow[] }))])
    users.value = r.list; trashDays.value = r.trashDays || 30
    const m: Record<string, LoginRow> = {}
    for (const x of l.list) if (x.ok && x.k !== 'admin' && !m[x.who]) m[x.who] = x
    lastIp.value = m
  } catch (e) { toastError(e, '账号读不出来') } finally { loading.value = false }
}
async function op(u: any, o: 'delete' | 'restore' | 'purge') {
  let body: any
  if (o === 'restore') { if (!(await confirm({ title: '恢复账号', message: `恢复账号 ${u.email}？原来绑定的路由器会重新绑定回来。`, confirmText: '恢复' }))) return }
  else {
    const v = await ask({ title: (o === 'delete' ? '删除账号 ' : '彻底删除账号 ') + u.email, message: o === 'delete' ? `先放进回收站：马上登录不了，绑定的 ${u.devs.length} 台路由器解除绑定（路由器本身不动，照常能用）。${trashDays.value} 天内可以恢复，之后自动彻底删除。` : '账号记录全部删掉，不能恢复。他想再用要重新注册、重新绑定路由器。', match: u.email, matchLabel: '输入邮箱', confirmText: o === 'delete' ? '放进回收站' : '彻底删除', danger: true })
    if (!v) return
    body = { confirm: v.value.toLowerCase() }
  }
  try { const r = await post(`users/${u.uid}/${o}`, body); pushToast(o === 'delete' ? '已放进回收站，' + day(r.purgeAt) + ' 前可以恢复' : o === 'restore' ? '已恢复，重新绑定了 ' + r.devs + ' 台路由器' : '已彻底删除'); load() } catch (e) { toastError(e, '没成功') }
}
const devs = (u: any) => (u.devs.length ? u.devs.map((x: any) => x.name + (x.gone ? '（已删除）' : '')).join('、') : '没有绑定路由器')
onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader title="账号" :desc="`官网注册的账号，共 ${users.filter(u => !u.deleted).length} 个。最近登录的 IP 来自登录记录（留 90 天）。`" />
    <Panel class="reveal">
      <div class="hub-tools">
        <div class="hub-chips">
          <button type="button" :class="['hub-chip', f === 'live' && 'is-on']" @click="f = 'live'">正常<b>{{ users.filter(u => !u.deleted).length }}</b></button>
          <button type="button" :class="['hub-chip', f === 'bin' && 'is-on']" @click="f = 'bin'">回收站<b>{{ users.filter(u => u.deleted).length }}</b></button>
        </div>
        <TextInput v-model="q" icon="search" placeholder="搜邮箱、路由器" clearable />
      </div>
      <div class="hub-list">
        <div v-for="u in shown" :key="u.uid" class="hub-row">
          <div class="hub-row-main">
            <div class="hub-row-title">{{ u.deleted ? '🗑 ' : '' }}{{ u.email }}<Tag v-if="u.admin" tone="ok">管理员</Tag><Tag v-if="!u.verified && !u.deleted" tone="neutral">邮箱没验证</Tag></div>
            <div v-if="u.deleted" class="hub-row-meta">{{ day(u.delAt) }} {{ u.delWhy === 'self' ? '自己注销' : '被删除' }} · <b class="bad">{{ day(u.purgeAt) }} 彻底删除</b></div>
            <div v-else class="hub-row-meta">{{ day(u.created) }} 注册 · 最近登录 {{ u.lastAt ? ago(u.lastAt) : '—' }}<template v-if="lastIp[u.email]"> · IP <b class="mono" style="cursor: pointer" @click="router.push({ path: '/logins', query: { q: lastIp[u.email].ip } })">{{ lastIp[u.email].ip }}</b>（{{ lastIp[u.email].place || '未知地点' }} · {{ lastIp[u.email].ua || '未知设备' }}）</template></div>
            <div class="hub-row-meta">{{ u.deleted ? '原来的路由器' : '路由器' }}：{{ devs(u) }}</div>
          </div>
          <div class="hub-row-acts">
            <template v-if="u.deleted"><Button size="sm" variant="primary" @click="op(u, 'restore')">恢复</Button><Button size="sm" variant="danger" @click="op(u, 'purge')">彻底删除</Button></template>
            <template v-else><Button size="sm" @click="router.push({ path: '/logins', query: { q: u.email } })">登录记录</Button><Button v-if="!u.admin" size="sm" variant="ghost" @click="op(u, 'delete')">删除</Button></template>
          </div>
        </div>
        <EmptyState v-if="!loading && !shown.length" title="没有账号" icon="users" />
      </div>
    </Panel>
  </div>
</template>

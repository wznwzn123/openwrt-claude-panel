<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import TextInput from '@/components/ui/TextInput.vue'
import DataTable, { type Column } from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import { get } from '@/api'
import { usePaged } from '@/composables/paged'
import { toastError } from '@/composables/toast'
import { full } from '@/utils/fmt'

/* 操作记录：谁在什么时候删了、停了、恢复了哪台路由器或账号，发了什么公告……（最近 500 条） */
const OPN: Record<string, string> = { off: '封禁', on: '解封', delete: '删除路由器', restore: '恢复路由器', purge: '彻底删除路由器', protect: '保护', unprotect: '取消保护', extend: '加天数', note: '改备注', invite: '生成邀请码', 'invite-del': '作废邀请码', renewal: '生成续期码', 'renewal-del': '作废续期码', approve: '通过续期', reject: '拒绝续期', unregister: '路由器卸载', idle: '长期没上线', 'user-delete': '删除账号', 'user-restore': '恢复账号', 'user-purge': '彻底删除账号', ann_new: '发布公告', ann_edit: '修改公告', ann_del: '删除公告', chat_block: '拉黑对话', chat_unblock: '解除拉黑', chat_del: '删除对话', 'trial-used': '官网试用开通' }
const BYN: Record<string, string> = { admin: '管理员', user: '用户', router: '路由器', auto: '自动', system: '系统' }
const all = ref<any[]>([])
const loading = ref(true)
const q = ref('')
const rows = computed(() => { const s = q.value.trim().toLowerCase(); return all.value.map((x, i) => ({ ...x, i })).filter(x => !s || [OPN[x.op] || x.op, x.target, x.detail, BYN[x.by] || x.by].join(' ').toLowerCase().includes(s)) })
const { page, pageSize, total, view } = usePaged(rows, 20)
const columns: Column[] = [
  { key: 't', title: '时间', width: 168 },
  { key: 'by', title: '谁', width: 86 },
  { key: 'op', title: '做了什么', width: 130 },
  { key: 'target', title: '对象', minWidth: 140 },
  { key: 'detail', title: '详情', minWidth: 240 },
]
onMounted(async () => { try { all.value = (await get('log')).list } catch (e) { toastError(e, '操作记录读不出来') } finally { loading.value = false } })
</script>

<template>
  <div class="page">
    <PageHeader title="操作记录" desc="谁在什么时候删了、停了、恢复了哪台路由器或账号，发了什么公告，都记在这里（最近 500 条）。" />
    <Panel class="reveal">
      <div class="hub-tools"><TextInput v-model="q" icon="search" placeholder="搜操作、对象、详情" clearable /></div>
      <DataTable :columns="columns" :data="view" row-key="i" :loading="loading" :min-width="860" empty-text="还没有记录">
        <template #cell-t="{ row }"><span class="mono">{{ full(row.t) }}</span></template>
        <template #cell-by="{ row }">{{ BYN[row.by] || row.by }}</template>
        <template #cell-op="{ row }"><b>{{ OPN[row.op] || row.op }}</b></template>
        <template #cell-target="{ row }"><span class="mono">{{ row.target || '—' }}</span></template>
        <template #cell-detail="{ row }"><span style="white-space: normal">{{ row.detail || '—' }}</span></template>
      </DataTable>
      <Pagination v-if="total > pageSize" v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </Panel>
  </div>
</template>

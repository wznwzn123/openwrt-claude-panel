<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Tag from '@/components/ui/Tag.vue'
import TextInput from '@/components/ui/TextInput.vue'
import DataTable, { type Column } from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import { get } from '@/api'
import { usePaged } from '@/composables/paged'
import { toastError } from '@/composables/toast'
import { full } from '@/utils/fmt'

/* 邮件记录：验证码、续期结果、反馈处理结果、新设备登录提醒……发给了谁、成没成功（最近 300 封） */
const all = ref<any[]>([])
const loading = ref(true)
const q = ref('')
const bad = ref(false)
const rows = computed(() => { const s = q.value.trim().toLowerCase(); return all.value.map((x, i) => ({ ...x, i })).filter(x => (!bad.value || !x.ok) && (!s || [x.to, x.subject, x.err].join(' ').toLowerCase().includes(s))) })
const { page, pageSize, total, view } = usePaged(rows, 20)
const columns: Column[] = [{ key: 't', title: '时间', width: 168 }, { key: 'to', title: '收件人', minWidth: 180 }, { key: 'subject', title: '标题', minWidth: 240 }, { key: 'ok', title: '结果', minWidth: 120 }]
onMounted(async () => { try { all.value = (await get('mails')).list } catch (e) { toastError(e, '邮件记录读不出来') } finally { loading.value = false } })
</script>

<template>
  <div class="page">
    <PageHeader :title="'邮件记录'" :desc="`验证码、续期结果、反馈处理结果、新设备登录提醒……发给了谁、成没成功（最近 300 封）。这里有 ${all.length} 封，失败 ${all.filter(x => !x.ok).length} 封。`" />
    <Panel class="reveal">
      <div class="hub-tools">
        <div class="hub-chips"><button type="button" :class="['hub-chip', !bad && 'is-on']" @click="bad = false">全部</button><button type="button" :class="['hub-chip', bad && 'is-on']" @click="bad = true">只看失败</button></div>
        <TextInput v-model="q" icon="search" placeholder="搜收件人、标题" clearable />
      </div>
      <DataTable :columns="columns" :data="view" row-key="i" :loading="loading" :min-width="760" empty-text="还没有发过邮件">
        <template #cell-t="{ row }"><span class="mono">{{ full(row.t) }}</span></template>
        <template #cell-ok="{ row }"><Tag :tone="row.ok ? 'ok' : 'danger'" dot>{{ row.ok ? '发出去了' : '失败' }}</Tag><div v-if="row.err" class="hub-row-meta bad" style="white-space: normal">{{ row.err }}</div></template>
      </DataTable>
      <Pagination v-if="total > pageSize" v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </Panel>
  </div>
</template>

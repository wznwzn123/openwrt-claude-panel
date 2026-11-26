<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Tag from '@/components/ui/Tag.vue'
import TextInput from '@/components/ui/TextInput.vue'
import FilterBar from '@/components/ui/FilterBar.vue'
import DataTable, { type Column } from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import { get } from '@/api'
import { usePaged } from '@/composables/paged'
import { toastError } from '@/composables/toast'
import { full } from '@/utils/fmt'

/* 邮件记录：验证码、续期结果、反馈处理结果、新设备登录提醒……发给了谁、成没成功（最近 300 封） */
const all = ref<any[]>([])
// 第 77 项：今天发了多少封、额度满没满（世界时 0 点重置）
const quota = ref<{ day: string; sent: number; cap: number; full: boolean; warn: boolean } | null>(null)
const loading = ref(true)
const q = ref('')
const bad = ref(false)
const rows = computed(() => { const s = q.value.trim().toLowerCase(); return all.value.map((x, i) => ({ ...x, i })).filter(x => (!bad.value || !x.ok) && (!s || [x.to, x.subject, x.err].join(' ').toLowerCase().includes(s))) })
const { page, pageSize, total, view } = usePaged(rows, 20)
const columns: Column[] = [{ key: 't', title: '时间', width: 168 }, { key: 'to', title: '收件人', minWidth: 180 }, { key: 'subject', title: '标题', minWidth: 240 }, { key: 'ok', title: '结果', minWidth: 120 }]
onMounted(async () => { try { const r = await get('mails'); all.value = r.list; quota.value = r.quota || null } catch (e) { toastError(e, '邮件记录读不出来') } finally { loading.value = false } })
</script>

<template>
  <div class="page">
    <PageHeader :title="'邮件记录'" :desc="`验证码、续期结果、反馈处理结果、新设备登录提醒……发给了谁、成没成功（最近 300 封）。这里有 ${all.length} 封，失败 ${all.filter(x => !x.ok).length} 封。`" />
    <Panel v-if="quota" class="reveal mail-quota">
      <div class="mq-row">
        <Tag :tone="quota.full ? 'danger' : quota.warn ? 'info' : 'ok'" dot>{{ quota.full ? '今天的额度用完了' : quota.warn ? '今天快用完了' : '今天额度够用' }}</Tag>
        <b class="mono">{{ quota.sent }} / {{ quota.cap }}</b><span class="hub-row-meta">封 · 今天（世界时 0 点重置，北京时间早上 8 点）</span>
      </div>
      <p v-if="quota.full" class="hub-note">注册、找回密码、新设备登录、确认本人这些要收验证码的操作今天先停了，用户会看到「明天再试」；报告、反馈、续期申请照常收，只是不发确认邮件。明天自动恢复。</p>
      <p v-else-if="quota.warn" class="hub-note">用满以后，要收验证码的操作当天会先停。快满和用满时都会推送提醒你。</p>
    </Panel>
    <Panel class="reveal">
      <FilterBar :model-value="bad ? 'bad' : 'all'" :items="[{ k: 'all', n: '全部' }, { k: 'bad', n: '只看失败' }]" label="邮件筛选" style="margin-bottom: 12px" @update:model-value="(v) => (bad = v === 'bad')">
        <TextInput v-model="q" icon="search" placeholder="搜收件人、标题" clearable />
      </FilterBar>
      <DataTable :columns="columns" :data="view" row-key="i" :loading="loading" :min-width="760" empty-text="还没有发过邮件">
        <template #cell-t="{ row }"><span class="mono">{{ full(row.t) }}</span></template>
        <template #cell-ok="{ row }"><Tag :tone="row.ok ? 'ok' : 'danger'" dot>{{ row.ok ? '发出去了' : '失败' }}</Tag><div v-if="row.err" class="hub-row-meta bad" style="white-space: normal">{{ row.err }}</div></template>
      </DataTable>
      <Pagination v-if="total > pageSize" v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </Panel>
  </div>
</template>

<style scoped>
.mail-quota { margin-bottom: 14px; }
.mq-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mq-row b { font-size: 18px; }
.mail-quota .hub-note { margin: 10px 0 0; line-height: 1.6; }
</style>

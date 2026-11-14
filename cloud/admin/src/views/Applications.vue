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
import { askDays } from '@/composables/days'
import { pushToast, toastError } from '@/composables/toast'
import { day, parseDays } from '@/utils/fmt'

/* 续期申请：用户在官网账号页申请续期，通过时选天数，拒绝可以写原因（都会通知他） */
const aps = ref<any[]>([])
const loading = ref(true)
const pend = computed(() => aps.value.filter(a => a.status === 'pending' && !a.logged).sort((a, b) => a.at - b.at))
const done = computed(() => aps.value.filter(a => a.logged).slice(0, 30))
async function load() {
  try { aps.value = (await get('applications')).list; badges.value = { ...badges.value, aps: pend.value.length } } catch (e) { toastError(e, '续期申请读不出来') } finally { loading.value = false }
}
// 备注里写了「180天」「6个月」「半年」「1年」就照着预填，否则默认 90 天
function want(a: any) {
  const t = String(a?.note || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  let m
  if ((m = /(\d+)\s*天/.exec(t))) return parseDays(m[1])
  if ((m = /(\d+)\s*个?月/.exec(t))) return parseDays(+m[1] * 30)
  if (/半年/.test(t)) return 180
  if ((m = /(\d+)\s*年/.exec(t))) return parseDays(+m[1] * 365)
  return 0
}
async function decide(a: any, ok: boolean) {
  let body: any
  if (ok) { const n = await askDays({ title: '通过续期申请', who: a.email + ' · ' + a.name, note: a.note, cur: a.curExp ?? a.exp, want: want(a) || 90, go: '续' }); if (!n) return; body = { days: n } }
  else { const v = await ask({ title: '拒绝续期申请', message: a.email + ' · ' + a.name, input: { label: '拒绝的原因（会通知他，可以不写）', multiline: true, maxlength: 300 }, confirmText: '拒绝', danger: true }); if (!v) return; body = { reason: v.value } }
  try { const r = await post(`applications/${a.sub}/${ok ? 'approve' : 'reject'}`, body); pushToast((ok ? '已通过，到期时间 ' + day(r.exp) : '已拒绝') + (r.mailed ? '，已发邮件通知他' : '，邮件没发出去（他开了推送的话会收到推送）')); load() } catch (e) { toastError(e, '没成功') }
}
onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader title="续期申请" desc="用户在官网账号页申请续期。通过时选续几天，拒绝可以写原因，都会发邮件通知他。" />
    <div class="hub-stack">
      <Panel title="待审核" :meta="pend.length + ' 份'" class="reveal">
        <div class="hub-list">
          <div v-for="a in pend" :key="a.sub + a.at" class="hub-row">
            <div class="hub-row-main">
              <div class="hub-row-title">{{ a.email }} <code>{{ a.name }}（{{ a.sub }}）</code><Tag v-if="a.curOff ?? a.expired" tone="danger">已到期暂停</Tag></div>
              <div class="hub-row-meta">从哪里知道的：{{ a.source }} · 相关账号：{{ a.contact }}<template v-if="a.note"> · 备注（想申请多少天）：{{ a.note }}</template></div>
              <div class="hub-row-meta">申请日期 {{ day(a.at) }} · 现在到期 {{ day(a.curExp ?? a.exp) }}</div>
            </div>
            <div class="hub-row-acts"><Button size="sm" variant="primary" @click="decide(a, true)">通过</Button><Button size="sm" variant="ghost" @click="decide(a, false)">拒绝</Button></div>
          </div>
          <EmptyState v-if="!loading && !pend.length" title="没有待审核的申请" icon="mail" />
        </div>
      </Panel>
      <Panel v-if="done.length" title="最近审核过的" class="reveal">
        <div class="hub-list">
          <div v-for="a in done" :key="a.sub + a.at" class="hub-row">
            <div class="hub-row-main">
              <div class="hub-row-title">{{ a.email }} <code>{{ a.name }}（{{ a.sub }}）</code><Tag :tone="a.status === 'ok' ? 'ok' : 'danger'" dot>{{ a.status === 'ok' ? '通过' : '拒绝' }}</Tag></div>
              <div class="hub-row-meta">申请 {{ day(a.at) }} · {{ a.status === 'ok' ? day(a.decided) + ' 通过，续了 ' + a.days + ' 天' + (a.newExp ? '：到期 ' + day(a.oldExp ?? a.exp) + ' → ' + day(a.newExp) : '') : day(a.decided) + ' 拒绝' + (a.reason ? '：' + a.reason : '') }}</div>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  </div>
</template>

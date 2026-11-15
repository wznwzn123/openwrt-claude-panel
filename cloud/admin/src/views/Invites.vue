<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import Tag from '@/components/ui/Tag.vue'
import Field from '@/components/ui/Field.vue'
import TextInput from '@/components/ui/TextInput.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { del, get, post } from '@/api'
import { confirm } from '@/composables/confirm'
import { pushToast, toastError } from '@/composables/toast'
import { copy, day } from '@/utils/fmt'

/* 邀请码（5.2）：用户先在官网注册账号，用邀请码兑换成安装码（7 天有效、只能装一台）再装；没用掉的安装码过期后名额自动退回。
   可以限制能开通几台、几天内能用、开通后试用几天；官网自助试用每个账号能领几次也在这里设 */
const list = ref<any[]>([])
const devs = ref<any[]>([])
const loading = ref(true)
const form = reactive({ max: '1', days: '7', svc: '7', note: '' })
const busy = ref(false)
const err = ref('')
const trial = reactive({ max: 1, days: 7, val: '1', busy: false })
// 账号兑换出来的安装码、官网领的试用码不单独列（在各自的邀请码下面显示兑换记录）
const own = (i: any) => !i.uid
async function load() {
  try {
    const [i, d, t] = await Promise.all([get('invites'), get('devices'), get('trialmax').catch(() => null)])
    list.value = i.list.filter(own).sort((a: any, b: any) => b.created - a.created); all.value = i.list; devs.value = d.list
    if (t) { trial.max = t.max; trial.days = t.days; trial.val = String(t.max) }
  } catch (e) { toastError(e, '邀请码读不出来') } finally { loading.value = false }
}
const all = ref<any[]>([])
const trials = computed(() => all.value.filter((i: any) => i.trial).length)
async function saveTrial() {
  trial.busy = true
  try { const r = await post('trialmax', { max: +trial.val }); trial.max = r.max; trial.val = String(r.max); pushToast(r.max ? '每个账号最多领 ' + r.max + ' 次试用' : '已关闭官网自助试用') } catch (e) { toastError(e, '没保存上') } finally { trial.busy = false }
}
// 兑换记录：谁、什么时候、装好了没有（装好的看对应安装码有没有用掉）
const redState = (r: any) => { if (r.back) return '没装，过期退回'; const x = all.value.find((y: any) => y.code === r.code); return !x ? '已装好' : x.used >= x.max ? '已装好' : '还没装（' + day(x.exp) + ' 过期）' }
async function make() {
  err.value = ''; busy.value = true
  try { const r = await post('invites', { max: +form.max, days: +form.days, svc: +form.svc, note: form.note }); form.note = ''; pushToast('邀请码：' + r.invite.code); load() } catch (e: any) { err.value = e.message } finally { busy.value = false }
}
async function remove(code: string) {
  if (!(await confirm({ title: '作废邀请码', message: `作废邀请码 ${code}？已经开通的路由器不受影响。`, confirmText: '作废', danger: true }))) return
  try { await del('invites/' + code); pushToast('已作废'); load() } catch (e) { toastError(e, '没成功') }
}
const dead = (i: any) => (i.exp && i.exp < Date.now()) || i.used >= i.max
const by = (i: any) => devs.value.filter(d => d.invite === i.code || (i.reds || []).some((r: any) => r.code === d.invite))
onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader title="邀请码" desc="用户先在官网注册账号，用邀请码兑换成安装码（7 天有效，只能装一台），复制官网给的安装命令到路由器上运行，装好自动加到他的账号里。没用掉的安装码过期后名额自动退回。" />
    <div class="hub-stack">
      <Panel title="官网自助试用" class="reveal">
        <div class="hub-row"><div class="hub-row-main"><div class="hub-row-title">每个账号最多领几次试用</div><div class="hub-row-meta">试用 {{ trial.days }} 天（部署时的 TRIAL_DAYS）。领到的试用安装码 7 天内没用就作废，这次不算。设成 0 就不发试用。现在有 {{ trials }} 个试用码记录。</div></div>
          <div class="hub-row-acts" style="align-items: center"><TextInput v-model="trial.val" type="number" style="width: 90px" /><Button variant="primary" :loading="trial.busy" @click="saveTrial">保存</Button></div></div>
      </Panel>
      <Panel title="生成邀请码" class="reveal">
        <div class="hub-form">
          <Field label="能开通几台"><TextInput v-model="form.max" type="number" /></Field>
          <Field label="几天内能用（0 = 一直能用）"><TextInput v-model="form.days" type="number" /></Field>
          <Field label="开通后试用几天（0 = 不限期）"><TextInput v-model="form.svc" type="number" /></Field>
          <Field label="备注（给谁的）" class="span-all" :error="err"><TextInput v-model="form.note" :maxlength="60" /></Field>
          <div><Button variant="primary" icon="plus" :loading="busy" @click="make">生成邀请码</Button></div>
        </div>
      </Panel>
      <Panel title="邀请码" :meta="list.length + ' 个'" class="reveal">
        <div class="hub-list">
          <div v-for="i in list" :key="i.code" class="hub-row" :style="dead(i) ? 'opacity: .62' : ''">
            <div class="hub-row-main">
              <div class="hub-row-title"><code style="font-size: 14px">{{ i.code }}</code><Tag v-if="i.direct" tone="info">能直接在路由器上用</Tag><Tag v-if="dead(i)" tone="neutral">已失效</Tag></div>
              <div class="hub-row-meta">已用 {{ i.used }} / {{ i.max }} · {{ i.exp ? day(i.exp) + ' 过期' : '不过期' }} · {{ i.svc ? '开通后试用 ' + i.svc + ' 天' : '开通后不限期' }}{{ i.note ? ' · ' + i.note : '' }}</div>
              <div v-if="(i.reds || []).length" class="hub-row-meta">兑换的：<template v-for="(r, k) in i.reds" :key="r.code">{{ r.email }}（{{ day(r.at) }}，{{ redState(r) }}）<template v-if="k < i.reds.length - 1">、</template></template></div>
              <div v-if="by(i).length" class="hub-row-meta">开通的：{{ by(i).map(d => (d.name || d.sub) + '（' + d.sub + (d.offWhy === 'deleted' ? '，回收站' : '') + '）').join('、') }}</div>
            </div>
            <div class="hub-row-acts"><Button size="sm" icon="copy" @click="copy(i.code).then(ok => pushToast(ok ? '已复制' : '复制不了，手动选一下', ok ? 'ok' : 'danger'))">复制</Button><Button size="sm" variant="ghost" @click="remove(i.code)">作废</Button></div>
          </div>
          <EmptyState v-if="!loading && !list.length" title="还没有邀请码" icon="ticket" />
        </div>
      </Panel>
    </div>
  </div>
</template>

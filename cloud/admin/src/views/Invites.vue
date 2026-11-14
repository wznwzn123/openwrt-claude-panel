<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
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

/* 邀请码：用户安装托管版时输入；可以限制能开通几台、几天内能用、开通后试用几天 */
const list = ref<any[]>([])
const devs = ref<any[]>([])
const loading = ref(true)
const form = reactive({ max: '1', days: '7', svc: '7', note: '' })
const busy = ref(false)
const err = ref('')
async function load() {
  try { const [i, d] = await Promise.all([get('invites'), get('devices')]); list.value = i.list.sort((a: any, b: any) => b.created - a.created); devs.value = d.list } catch (e) { toastError(e, '邀请码读不出来') } finally { loading.value = false }
}
async function make() {
  err.value = ''; busy.value = true
  try { const r = await post('invites', { max: +form.max, days: +form.days, svc: +form.svc, note: form.note }); form.note = ''; pushToast('邀请码：' + r.invite.code); load() } catch (e: any) { err.value = e.message } finally { busy.value = false }
}
async function remove(code: string) {
  if (!(await confirm({ title: '作废邀请码', message: `作废邀请码 ${code}？已经开通的路由器不受影响。`, confirmText: '作废', danger: true }))) return
  try { await del('invites/' + code); pushToast('已作废'); load() } catch (e) { toastError(e, '没成功') }
}
const dead = (i: any) => (i.exp && i.exp < Date.now()) || i.used >= i.max
const by = (i: any) => devs.value.filter(d => d.invite === i.code)
onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader title="邀请码" desc="用户安装托管版时输入邀请码。可以限制能开通几台、几天内能用、开通后试用几天（到期前找你要续期码）。" />
    <div class="hub-stack">
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
              <div class="hub-row-title"><code style="font-size: 14px">{{ i.code }}</code><Tag v-if="i.trial" tone="info">官网自助试用</Tag><Tag v-if="dead(i)" tone="neutral">已失效</Tag></div>
              <div class="hub-row-meta">已用 {{ i.used }} / {{ i.max }} · {{ i.exp ? day(i.exp) + ' 过期' : '不过期' }} · {{ i.svc ? '开通后试用 ' + i.svc + ' 天' : '开通后不限期' }}{{ i.note ? ' · ' + i.note : '' }}</div>
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

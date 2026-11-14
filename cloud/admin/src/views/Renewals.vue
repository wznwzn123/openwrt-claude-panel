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

/* 续期码：试用快到期时用户找你要，在官网账号页这台路由器下面点「续期」输入。一个码只能用一次 */
const list = ref<any[]>([])
const loading = ref(true)
const form = reactive({ days: '90', count: '1', note: '' })
const busy = ref(false)
const err = ref('')
async function load() { try { list.value = (await get('renewals')).list.sort((a: any, b: any) => b.created - a.created) } catch (e) { toastError(e, '续期码读不出来') } finally { loading.value = false } }
async function make() {
  err.value = ''; busy.value = true
  try { const r = await post('renewals', { days: +form.days, count: +form.count, note: form.note }); form.note = ''; pushToast('续期码：' + r.list.map((x: any) => x.code).join('、')); load() } catch (e: any) { err.value = e.message } finally { busy.value = false }
}
async function remove(code: string) {
  if (!(await confirm({ title: '作废续期码', message: `作废续期码 ${code}？`, confirmText: '作废', danger: true }))) return
  try { await del('renewals/' + code); pushToast('已作废'); load() } catch (e) { toastError(e, '没成功') }
}
onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader title="续期码" desc="试用到期前，用户找你要续期码，在官网账号页这台路由器下面点「续期」输入。一个码只能用一次。" />
    <div class="hub-stack">
      <Panel title="生成续期码" class="reveal">
        <div class="hub-form">
          <Field label="续几天"><TextInput v-model="form.days" type="number" /></Field>
          <Field label="生成几个"><TextInput v-model="form.count" type="number" /></Field>
          <Field label="备注（给谁的）" :error="err"><TextInput v-model="form.note" :maxlength="60" /></Field>
          <div><Button variant="primary" icon="plus" :loading="busy" @click="make">生成续期码</Button></div>
        </div>
      </Panel>
      <Panel title="续期码" :meta="list.length + ' 个'" class="reveal">
        <div class="hub-list">
          <div v-for="k in list" :key="k.code" class="hub-row" :style="k.used ? 'opacity: .62' : ''">
            <div class="hub-row-main">
              <div class="hub-row-title"><code style="font-size: 14px">{{ k.code }}</code><Tag v-if="k.used" tone="neutral">已用</Tag></div>
              <div class="hub-row-meta">续 {{ k.days }} 天<template v-if="k.used"> · {{ day(k.used) }} 给 {{ k.sub }} 用了（{{ k.by || '' }}）</template>{{ k.note ? ' · ' + k.note : '' }}</div>
            </div>
            <div v-if="!k.used" class="hub-row-acts"><Button size="sm" icon="copy" @click="copy(k.code).then(ok => pushToast(ok ? '已复制' : '复制不了，手动选一下', ok ? 'ok' : 'danger'))">复制</Button><Button size="sm" variant="ghost" @click="remove(k.code)">作废</Button></div>
          </div>
          <EmptyState v-if="!loading && !list.length" title="还没有续期码" icon="key" />
        </div>
      </Panel>
    </div>
  </div>
</template>

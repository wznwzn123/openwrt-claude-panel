<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import Tag from '@/components/ui/Tag.vue'
import Field from '@/components/ui/Field.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Segmented from '@/components/ui/Segmented.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { del, get, post } from '@/api'
import { confirm } from '@/composables/confirm'
import { pushToast, toastError } from '@/composables/toast'
import { ago, day, full } from '@/utils/fmt'

/* 公告：发出去以后，托管版和自建版的面板「通知」里都能看到；「重要」的路由器会推送到手机，打开面板时也弹一次 */
const list = ref<any[]>([])
const loading = ref(true)
const ed = ref('')
const form = reactive({ title: '', body: '', level: 'normal' as 'normal' | 'important', days: '0' })
const busy = ref(false)
const err = ref('')
const live = computed(() => list.value.filter(a => !a.exp || a.exp > Date.now()).length)
async function load() { try { list.value = (await get('ann')).list } catch (e) { toastError(e, '公告读不出来') } finally { loading.value = false } }
function edit(a: any | null) {
  ed.value = a ? a.id : ''
  form.title = a ? a.title : ''; form.body = a ? a.body : ''; form.level = a ? a.level : 'normal'
  form.days = a && a.exp ? String(Math.max(1, Math.ceil((a.exp - Date.now()) / 864e5))) : '0'
  err.value = ''
  if (a) document.querySelector('.ann-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
async function save() {
  err.value = ''
  if (!form.title.trim()) { err.value = '标题不能是空的'; return }
  if (form.level === 'important' && !ed.value && !(await confirm({ title: '发布重要公告', message: '「重要」公告会推送到所有人的手机，打开面板时也会弹出来一次。确定发布？', confirmText: '发布' }))) return
  busy.value = true
  try {
    await post('ann' + (ed.value ? '/' + ed.value : ''), { title: form.title, body: form.body, level: form.level, days: +form.days || 0 })
    pushToast(ed.value ? '公告已修改' : '公告已发布'); edit(null); await load()
  } catch (e: any) { err.value = e.message || '没成功' } finally { busy.value = false }
}
async function remove(a: any) {
  if (!(await confirm({ title: '删除公告', message: `删除「${a.title}」？大家的面板里也会消失。`, confirmText: '删除', danger: true }))) return
  try { await del('ann/' + a.id); pushToast('已删除'); if (ed.value === a.id) edit(null); load() } catch (e) { toastError(e, '没删掉') }
}
onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader title="公告" desc="发出去以后，所有人（托管版和自建版）打开面板的「通知」都能看到；选「重要」的，路由器还会推送到手机，打开面板时弹一次。">
      <Tag tone="info" dot>{{ live }} 条在显示</Tag>
    </PageHeader>
    <div class="hub-stack">
      <Panel :title="ed ? '修改公告' : '发布公告'" class="reveal ann-form">
        <div class="hub-form">
          <Field label="标题" class="span-all" :error="err"><TextInput v-model="form.title" :maxlength="80" placeholder="比如：4.0 发布了" /></Field>
          <Field label="内容（可以不写）" class="span-all"><TextInput v-model="form.body" multiline :rows="4" :maxlength="2000" placeholder="写清楚要大家做什么" /></Field>
          <Field label="级别"><Segmented v-model="form.level" label="级别" :options="[{ label: '普通', value: 'normal' }, { label: '重要（推送到手机）', value: 'important' }]" /></Field>
          <Field label="显示几天（0 = 一直显示）"><TextInput v-model="form.days" type="number" placeholder="0" /></Field>
          <div style="display: flex; gap: 8px"><Button variant="primary" :loading="busy" @click="save">{{ ed ? '保存修改' : '发布公告' }}</Button><Button v-if="ed" variant="ghost" @click="edit(null)">不改了</Button></div>
        </div>
      </Panel>
      <Panel title="已发的公告" :meta="list.length + ' 条'" class="reveal">
        <div class="hub-list">
          <div v-for="a in list" :key="a.id" class="hub-row" :style="a.exp && a.exp <= Date.now() ? 'opacity: .6' : ''">
            <div class="hub-row-main">
              <div class="hub-row-title"><Tag v-if="a.level === 'important'" tone="danger">重要</Tag>{{ a.title }}</div>
              <div v-if="a.body" class="hub-row-text">{{ a.body }}</div>
              <div class="hub-row-meta">{{ full(a.at) }} 发布<template v-if="a.upd && a.upd !== a.at"> · {{ ago(a.upd) }}改过</template> · {{ a.exp && a.exp <= Date.now() ? '已过期，大家看不到了' : a.exp ? day(a.exp) + ' 以后不再显示' : '一直显示' }}</div>
            </div>
            <div class="hub-row-acts"><Button size="sm" @click="edit(a)">修改</Button><Button size="sm" variant="ghost" @click="remove(a)">删除</Button></div>
          </div>
          <EmptyState v-if="!loading && !list.length" title="还没发过公告" icon="megaphone" />
        </div>
      </Panel>
    </div>
  </div>
</template>

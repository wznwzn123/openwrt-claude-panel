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
import FileAttach from '@/components/hub/FileAttach.vue'
import FileList from '@/components/hub/FileList.vue'
import { del, get, post } from '@/api'
import { confirm } from '@/composables/confirm'
import { pushToast, toastError } from '@/composables/toast'
import { ago, day, dt, full } from '@/utils/fmt'

/* 公告：发出去以后，托管版和自建版的面板「通知」里都能看到；「重要」的路由器会推送到手机，打开面板时也弹一次 */
const list = ref<any[]>([])
const loading = ref(true)
const ed = ref('')
const form = reactive({ title: '', body: '', level: 'normal' as 'normal' | 'important' | 'banner', days: '0', when: 'now' as 'now' | 'later', at: '', to: '' as '' | 'h' | 's', vmin: '', vmax: '' })
// 发给谁（6.0）：to = 托管版 h / 自建版 s / 空 = 都发；vmin、vmax = 面板版本范围（含两头，可以只填一个）
const who = (a: any) => { const v = a.vmin && a.vmax ? a.vmin + ' 到 ' + a.vmax : a.vmin ? a.vmin + ' 及以上' : a.vmax ? a.vmax + ' 及以下' : ''; return [a.ed === 'h' ? '只发托管版' : a.ed === 's' ? '只发自建版' : '', v].filter(Boolean).join(' · ') }
// 收到、点开的路由器数（5.0）
const stats = ref<Record<string, { got: number; seen: number }>>({})
// 定时发布：datetime-local 用的本地时间字符串
const localStr = (t: number) => { const d = new Date(t - new Date().getTimezoneOffset() * 60e3); return d.toISOString().slice(0, 16) }
const minAt = computed(() => localStr(Date.now() + 5 * 60e3))
const startMs = computed(() => (form.when === 'later' && form.at ? new Date(form.at).getTime() : 0))
const busy = ref(false)
// 5.2：公告可以带图片、视频、文件（最多 5 个，每个最大 200MB），一直留着，删公告时一起删
const att = ref<InstanceType<typeof FileAttach> | null>(null)
const canFile = ref(false)
const err = ref('')
const live = computed(() => list.value.filter(a => (!a.exp || a.exp > Date.now()) && (!a.start || a.start <= Date.now())).length)
async function load() { try { const r = await get('ann'); list.value = r.list; canFile.value = !!r.files; get('ann-stats').then(r => { stats.value = r.stats }).catch(() => {}) } catch (e) { toastError(e, '公告读不出来') } finally { loading.value = false } }
function edit(a: any | null) {
  ed.value = a ? a.id : ''
  form.title = a ? a.title : ''; form.body = a ? a.body : ''; form.level = a ? a.level : 'normal'
  form.days = a && a.exp ? String(Math.max(1, Math.ceil((a.exp - Math.max(Date.now(), a.start || 0)) / 864e5))) : '0'
  form.to = a && a.ed ? a.ed : ''; form.vmin = a && a.vmin ? a.vmin : ''; form.vmax = a && a.vmax ? a.vmax : ''
  form.when = a && a.start && a.start > Date.now() ? 'later' : 'now'; form.at = a && a.start && a.start > Date.now() ? localStr(a.start) : ''
  att.value?.keep(a && a.files ? a.files : [])
  err.value = ''
  if (a) document.querySelector('.ann-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
async function save() {
  err.value = ''
  // 横幅只有内容、没有标题（用户 11/27）：面板顶上滚动的就是内容
  if (form.level === 'banner' ? !form.body.trim() : !form.title.trim()) { err.value = form.level === 'banner' ? '横幅内容不能是空的' : '标题不能是空的'; return }
  if (form.when === 'later' && (!startMs.value || startMs.value < Date.now() + 60e3)) { err.value = '定时发布要选一个以后的时间'; return }
  if (form.level === 'important' && !ed.value && !(await confirm({ title: '发布重要公告', message: (startMs.value ? `到 ${dt(startMs.value)} 时，` : '') + '「重要」公告会推送到' + (who({ ed: form.to, vmin: form.vmin.trim(), vmax: form.vmax.trim() }) ? '选中的路由器' : '所有人') + '的手机，打开面板时也会弹出来一次。确定发布？', confirmText: startMs.value ? '定时发布' : '发布' }))) return
  // 用户 11/27：同时只能有一条横幅，发新的会把现在的换掉（旧的改成普通公告）
  const oldBan = form.level === 'banner' ? list.value.filter(a => a.id !== ed.value && a.level === 'banner' && (!a.exp || a.exp > Date.now())) : []
  if (oldBan.length && !(await confirm({ title: '换掉现在的横幅', message: startMs.value ? `「${oldBan[0].title}」显示到 ${dt(startMs.value)} 结束` : `「${oldBan[0].title}」会改成普通公告`, confirmText: '换掉' }))) return
  if (att.value?.busy) { err.value = '文件还在上传，传完再发'; return }
  if (att.value?.bad) { err.value = '有文件没传上：去掉它（点 ×）或者重新选'; return }
  busy.value = true
  try {
    const r = await post('ann' + (ed.value ? '/' + ed.value : ''), { title: form.title, body: form.body, level: form.level, days: +form.days || 0, start: startMs.value || 0, ed: form.to, vmin: form.vmin.trim(), vmax: form.vmax.trim(), files: att.value ? att.value.ids() : undefined })
    pushToast((ed.value ? '公告已修改' : startMs.value ? `定好了：${dt(startMs.value)} 发布` : '公告已发布') + (r && r.replaced ? '，旧横幅已换掉' : '')); edit(null); await load()
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
    <PageHeader title="公告" desc="发出去以后，选中的路由器打开面板的「通知」都能看到；「重要」的还会推送到手机，打开面板时弹一次；「横幅」只在面板顶上显示一行。">
      <Tag tone="info" dot>{{ live }} 条在显示</Tag>
    </PageHeader>
    <div class="hub-stack">
      <Panel :title="ed ? '修改公告' : '发布公告'" class="reveal ann-form">
        <div class="hub-form">
          <Field v-if="form.level !== 'banner'" label="标题" class="span-all" :error="err"><TextInput v-model="form.title" :maxlength="80" placeholder="比如：4.0 发布了" /></Field>
          <Field :label="form.level === 'banner' ? '横幅内容' : '内容（选填）'" class="span-all" :error="form.level === 'banner' ? err : ''"><TextInput v-model="form.body" multiline :rows="4" :maxlength="2000" :placeholder="form.level === 'banner' ? '在面板顶上一直滚动 点一下看全文' : '写清楚要大家做什么'" /></Field>
          <div v-if="canFile" class="span-all ann-files">
            <div class="ann-files-top"><span>附件（选填）：图片、视频、文件，最多 5 个，每个最大 200MB</span><Button size="sm" icon="clip" @click="att?.pick()">加文件</Button></div>
            <FileAttach ref="att" ctx="ann" />
          </div>
          <Field label="级别" class="span-2"><Segmented v-model="form.level" label="级别" :options="[{ label: '普通', value: 'normal' }, { label: '重要（推送）', value: 'important' }, { label: '横幅', value: 'banner' }]" /></Field>
          <Field label="显示几天（0 = 一直显示）"><TextInput v-model="form.days" type="number" placeholder="0" /></Field>
          <Field label="发给" class="span-2"><Segmented v-model="form.to" label="发给" :options="[{ label: '都发', value: '' }, { label: '托管版', value: 'h' }, { label: '自建版', value: 's' }]" /></Field>
          <Field label="什么时候发"><Segmented v-model="form.when" label="什么时候发" :options="[{ label: '马上', value: 'now' }, { label: '定时', value: 'later' }]" /></Field>
          <Field label="面板版本（选填）" class="span-2"><div class="ann-ver"><TextInput v-model="form.vmin" :maxlength="12" placeholder="从 比如 6.0.0" aria-label="从哪个版本" /><span class="ann-to">到</span><TextInput v-model="form.vmax" :maxlength="12" placeholder="到 比如 5.9.9" aria-label="到哪个版本" /></div></Field>
          <Field v-if="form.when === 'later'" label="发布时间（你这台设备的时间）" hint="到时间才出现在大家的面板里；「重要」的到时间才推送"><input v-model="form.at" class="ann-dt input-shell" type="datetime-local" :min="minAt"></Field>
          <div class="span-all ann-pv" aria-label="在面板里的样子">
            <template v-if="form.level === 'banner'">
              <div class="ann-pv-cap">在面板顶上的样子（一直滚动 点一下看全文）</div>
              <div class="ann-pv-ban"><i aria-hidden="true">📢</i><span>{{ (form.body || '横幅内容').replace(/\s*\n\s*/g, '　') }}</span></div>
            </template>
            <div v-else class="ann-pv-cap">在面板「通知」里的样子</div>
            <div v-if="form.level !== 'banner'" class="ann-pv-card"><i :class="['ann-pv-ic', form.level === 'important' && 'imp']">📢</i><div class="ann-pv-main"><div class="ann-pv-top"><b>{{ form.title || '标题' }}</b><span>{{ form.level === 'important' ? '重要公告' : '公告' }} · {{ startMs ? dt(startMs) : '刚刚' }}</span></div><p v-if="form.body">{{ form.body }}</p><p v-if="att?.count" class="ann-pv-f">📎 {{ att.count }} 个附件（图片和视频直接显示，其他的点一下下载）</p></div></div>
            <div v-if="form.level === 'important'" class="ann-pv-cap">打开面板时还会弹一次（同样的标题和内容），推送到手机的通知标题是「📢 {{ form.title || '标题' }}」</div>
          </div>
          <div style="display: flex; gap: 8px"><Button variant="primary" :loading="busy" @click="save">{{ ed ? '保存修改' : '发布公告' }}</Button><Button v-if="ed" variant="ghost" @click="edit(null)">不改了</Button></div>
        </div>
      </Panel>
      <Panel title="已发的公告" :meta="list.length + ' 条'" class="reveal">
        <div class="hub-list">
          <div v-for="a in list" :key="a.id" class="hub-row" :style="a.exp && a.exp <= Date.now() ? 'opacity: .6' : ''">
            <div class="hub-row-main">
              <div class="hub-row-title"><Tag v-if="a.start && a.start > Date.now()" tone="info">定时 · {{ dt(a.start) }} 发布</Tag><Tag v-if="a.level === 'important'" tone="danger">重要</Tag><Tag v-if="a.level === 'banner'" tone="info">横幅</Tag>{{ a.title }}</div>
              <div v-if="a.body" class="hub-row-text">{{ a.body }}</div>
              <FileList v-if="a.files?.length" :files="a.files" class="ann-fl" />
              <div class="hub-row-meta"><template v-if="who(a)">{{ who(a) }} · </template>{{ full(a.at) }} {{ a.start && a.start > Date.now() ? '发布（还没到时间，大家现在看不到）' : '发布' }}<template v-if="a.upd && a.upd !== a.at && !(a.start && a.upd === a.start)"> · {{ ago(a.upd) }}改过</template> · {{ a.exp && a.exp <= Date.now() ? '已过期，大家看不到了' : a.exp ? day(a.exp) + ' 以后不再显示' : '一直显示' }}<template v-if="stats[a.id] && !(a.start && a.start > Date.now())"> · <b>{{ stats[a.id].got }}</b> 台路由器收到，<b>{{ stats[a.id].seen }}</b> 台点开看了</template></div>
            </div>
            <div class="hub-row-acts"><Button size="sm" @click="edit(a)">修改</Button><Button size="sm" variant="ghost" @click="remove(a)">删除</Button></div>
          </div>
          <EmptyState v-if="!loading && !list.length" title="还没发过公告" icon="megaphone" />
        </div>
      </Panel>
    </div>
  </div>
</template>

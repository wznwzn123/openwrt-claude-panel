<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import Tag from '@/components/ui/Tag.vue'
import TextInput from '@/components/ui/TextInput.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Modal from '@/components/ui/Modal.vue'
import { blobUrl, del, get, post, textOf } from '@/api'
import { refreshBadges } from '@/composables/auth'
import { ask } from '@/composables/ask'
import { confirm } from '@/composables/confirm'
import { pushToast, toastError } from '@/composables/toast'
import { copy, full } from '@/utils/fmt'
import { viewImage } from '@/utils/img'

/* 问题反馈：面板里发的、官网报告的、终端安装失败上报的都在这里。进度只有三段：反馈成功 → 开发人员已收到 → 已修复 / 无法修复 */
const list = ref<any[]>([])
const loading = ref(true)
const f = ref<'todo' | 'all' | 'done' | 'nofix'>('todo')
const q = ref('')
const imgs = ref<Record<string, string>>({})
const logOpen = ref(false)
const logText = ref('')
const FB_ST: Record<string, string> = { fixed: '标为已修复', nofix: '标为无法修复', open: '撤回为未处理', note: '发了补充说明' }
const DLG: Record<string, { t: string; l: string; ph: string; need?: string }> = {
  fixed: { t: '标为已修复', l: '补充说明（可以不写）', ph: '比如：已在 4.0 修好，到面板「一键更新」更新一下就行' },
  nofix: { t: '标为无法修复', l: '没法修复的原因（必须写，如实告诉对方）', ph: '比如：这是路由器固件自带的问题，面板这边改不了', need: '写一下为什么没法修复' },
  open: { t: '撤回为未处理', l: '补充说明（可以不写）', ph: '比如：还有一种情况没修好，正在继续查' },
  note: { t: '发补充说明', l: '补充说明（进度不变，对方会看到）', ph: '比如：已经找到原因了，下个版本修', need: '补充说明不能是空的' },
}
const stage = (x: any) => (x.done || x.nofix ? 3 : x.ack ? 2 : 1)
const steps = (x: any) => ['反馈成功', '开发人员已收到', '已修复'].map((n, i) => { const on = i < stage(x), bad = on && i === 2 && !!x.nofix; return { n: bad ? '无法修复' : n, cls: on ? (bad ? 'on bad' : 'on') : 'off', i: bad ? '✕' : on ? '✓' : String(i + 1) } })
function reach(x: any) {
  const r: string[] = [], c = x.code ? String(x.code).toUpperCase() : ''
  if ((x.mailTo || []).length) r.push('邮件')
  if (c && x.sub) r.push('对方打开面板时看到')
  else if (c && x.kind === 'install') r.push('对方重新运行安装命令、或打开查询网址时看到')
  else if (c) r.push('对方打开查询网址时看到')
  return { c, txt: r.length ? r.join('，') : '这条是旧版本发来的，没有编号也没有邮箱，对方收不到回复' }
}
const counts = computed(() => ({ todo: list.value.filter(x => !x.done && !x.nofix).length, all: list.value.length, done: list.value.filter(x => x.done).length, nofix: list.value.filter(x => x.nofix).length }))
const shown = computed(() => {
  const k = q.value.trim().toLowerCase()
  return list.value.filter(x => (f.value === 'all' || (f.value === 'todo' ? !x.done && !x.nofix : f.value === 'done' ? x.done : x.nofix)) && (!k || [x.text, x.name, x.sub, x.code, x.contact, ...(x.emails || [])].join(' ').toLowerCase().includes(k))).slice(0, 100)
})
async function load() {
  try { list.value = (await get('feedback')).list; loadImgs() } catch (e) { toastError(e, '反馈读不出来') } finally { loading.value = false }
}
function loadImgs() {
  for (const x of shown.value) (x.imgs || []).forEach((_: any, i: number) => {
    const k = x.id + ':' + i
    if (!imgs.value[k]) { imgs.value = { ...imgs.value, [k]: 'loading' }; blobUrl(`feedback/${x.id}/img/${i}`).then(u => { imgs.value = { ...imgs.value, [k]: u } }).catch(() => { imgs.value = { ...imgs.value, [k]: 'bad' } }) }
  })
}
watch(shown, loadImgs)
async function setState(x: any, kind: string) {
  const d = DLG[kind], to = x.mailTo || []
  const v = await ask({ title: d.t, message: (x.text || '').slice(0, 300) + '\n\n对方怎么看到：' + reach(x).txt, input: { label: d.l, placeholder: d.ph, multiline: true, required: d.need }, check: { label: to.length ? '发邮件告诉对方：' + to.join('、') : '对方没留邮箱，发不了邮件', value: to.length > 0, disabled: !to.length }, confirmText: d.t, danger: kind === 'nofix' })
  if (!v) return
  try {
    const r = await post(`feedback/${x.id}/done`, { state: kind, note: v.value, mail: v.check })
    pushToast({ fixed: '已标为已修复', nofix: '已标为无法修复', open: '已撤回为未处理', note: '补充说明已发布' }[kind] + ((r.mailed || []).length ? '，邮件已发给 ' + r.mailed.join('、') : v.check ? '，邮件没发出去：' + (r.mailErr || '不知道原因') : ''))
    await load(); refreshBadges()
  } catch (e) { toastError(e, '没成功') }
}
async function ack(x: any) {
  try { await post(`feedback/${x.id}/ack`, { on: !x.ack }); pushToast(x.ack ? '已撤回「已收到」' : '已标为已收到，对方查进度时能看到'); load() } catch (e) { toastError(e, '没成功') }
}
async function remove(x: any) {
  if (!(await confirm({ title: '删除反馈', message: '删除这条反馈？截图和安装日志一起删掉，不能恢复。', confirmText: '删除', danger: true }))) return
  try { await del(`feedback/${x.id}`); pushToast('已删除'); load(); refreshBadges() } catch (e) { toastError(e, '没删掉') }
}
async function showLog(x: any) {
  try { logText.value = await textOf(`feedback/${x.id}/log`); logOpen.value = true } catch (e) { toastError(e, '日志读不出来') }
}
let timer = 0
onMounted(() => { load(); timer = window.setInterval(() => { if (!document.hidden) load() }, 30000) })
onBeforeUnmount(() => { clearInterval(timer); Object.values(imgs.value).forEach(u => u.startsWith('blob:') && URL.revokeObjectURL(u)) })
</script>

<template>
  <div class="page">
    <PageHeader title="问题反馈" desc="面板里发的反馈、官网「报告问题」、终端安装失败按 y 上报的，都在这里。标了「已收到 / 已修复 / 无法修复」，对方查进度时马上能看到。" />
    <Panel class="reveal">
      <div class="hub-tools">
        <div class="hub-chips">
          <button v-for="[k, n] in [['todo', '没处理的'], ['all', '全部'], ['done', '已修复'], ['nofix', '无法修复']]" :key="k" type="button" :class="['hub-chip', f === k && 'is-on']" @click="f = k as any">{{ n }}<b>{{ counts[k as keyof typeof counts] }}</b></button>
        </div>
        <TextInput v-model="q" icon="search" placeholder="搜内容、编号、邮箱、路由器" clearable />
      </div>
      <div class="hub-list">
        <div v-for="x in shown" :key="x.id" class="hub-row">
          <div class="hub-row-main">
            <div class="hub-row-title">
              <span>{{ x.name }}</span><code v-if="x.sub">{{ x.sub }}</code>
              <Tag v-if="x.done" tone="ok" dot>已修复</Tag><Tag v-else-if="x.nofix" tone="danger" dot>无法修复</Tag><Tag v-else-if="x.ack" tone="info" dot>已收到</Tag><Tag v-else tone="danger">没处理</Tag>
            </div>
            <div class="hub-row-text">{{ x.text }}</div>
            <div class="hub-row-meta">{{ full(x.at) }}<template v-if="reach(x).c"> · 编号 <b class="mono" style="cursor: pointer" title="点一下复制" @click="copy(reach(x).c).then(ok => ok && pushToast('已复制编号'))">{{ reach(x).c }}</b></template><template v-if="x.contact"> · 联系方式：{{ x.contact }}</template><template v-if="(x.emails || []).length"> · 账号：{{ x.emails.join('、') }}</template></div>
            <div class="hub-row-meta">回复怎么送到对方：{{ reach(x).txt }}</div>
            <div class="fsteps"><div v-for="s in steps(x)" :key="s.n" :class="s.cls"><i>{{ s.i }}</i><b>{{ s.n }}</b></div></div>
            <div v-if="(x.imgs || []).length" class="hub-imgs">
              <button v-for="(_, i) in x.imgs" :key="i" type="button" :title="'截图 ' + (i + 1)" @click="imgs[x.id + ':' + i]?.startsWith('blob:') && viewImage(imgs[x.id + ':' + i])">
                <img v-if="imgs[x.id + ':' + i]?.startsWith('blob:')" :src="imgs[x.id + ':' + i]" :alt="'截图 ' + (i + 1)">
                <span v-else>{{ imgs[x.id + ':' + i] === 'bad' ? '读不出来' : '截图 ' + (i + 1) }}</span>
              </button>
            </div>
            <details v-if="x.diag"><summary class="hub-row-meta" style="cursor: pointer">路由器信息</summary><pre class="log-pre" style="margin-top: 6px">{{ x.diag }}</pre></details>
            <details v-if="(x.acts || []).length"><summary class="hub-row-meta" style="cursor: pointer">处理记录（{{ x.acts.length }}）</summary>
              <div v-for="(a, i) in x.acts" :key="i" class="hub-row-meta" style="margin-top: 6px"><b>{{ full(a.at) }}</b> {{ FB_ST[a.st || (a.done ? 'fixed' : 'open')] }}{{ (a.mailed || []).length ? ' · 已发邮件给 ' + a.mailed.join('、') : ' · 没发邮件' }}<div v-if="a.note" class="hub-row-text" style="font-size: 13px">{{ a.note }}</div></div>
            </details>
          </div>
          <div class="hub-row-acts">
            <template v-if="x.done || x.nofix"><Button size="sm" @click="setState(x, 'open')">撤回为未处理</Button></template>
            <template v-else>
              <Button size="sm" @click="ack(x)">{{ x.ack ? '撤回已收到' : '标为已收到' }}</Button>
              <Button size="sm" variant="primary" @click="setState(x, 'fixed')">已修复</Button>
              <Button size="sm" @click="setState(x, 'nofix')">无法修复</Button>
            </template>
            <Button size="sm" @click="setState(x, 'note')">发补充说明</Button>
            <Button v-if="x.log" size="sm" icon="file" @click="showLog(x)">安装日志 {{ Math.ceil(x.log / 1024) }}KB</Button>
            <Button size="sm" variant="ghost" @click="remove(x)">删除</Button>
          </div>
        </div>
        <EmptyState v-if="!loading && !shown.length" :title="f === 'todo' ? '没有要处理的反馈' : '没有'" icon="inbox" />
      </div>
    </Panel>
    <Modal :open="logOpen" title="安装日志" :width="820" close-on-overlay @close="logOpen = false">
      <pre class="log-pre">{{ logText }}</pre>
      <template #footer><Button @click="copy(logText).then(ok => pushToast(ok ? '已复制' : '复制不了，手动选一下', ok ? 'ok' : 'danger'))">复制</Button><Button variant="primary" @click="logOpen = false">关闭</Button></template>
    </Modal>
  </div>
</template>

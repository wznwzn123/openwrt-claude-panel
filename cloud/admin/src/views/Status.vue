<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import Tag from '@/components/ui/Tag.vue'
import Field from '@/components/ui/Field.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Segmented from '@/components/ui/Segmented.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { del, get, post } from '@/api'
import { confirm } from '@/composables/confirm'
import { pushToast, toastError } from '@/composables/toast'
import { ago, dt } from '@/utils/fmt'

/* 服务状态：官网 /status 页面。每小时自动检查一次各项服务；出了问题在这里写「故障说明」，官网上马上能看到 */
const S = ref<any>(null)
const loading = ref(true)
const checking = ref(false)
const LV: Record<string, { t: string; tone: string }> = { ok: { t: '正常', tone: 'ok' }, part: { t: '部分有问题', tone: 'danger' }, down: { t: '故障', tone: 'danger' } }
const COMPS = [
  { k: 'web', t: '官网和账号' }, { k: 'tunnel', t: '专属网址' }, { k: 'push', t: '手机推送' },
  { k: 'mail', t: '邮件' }, { k: 'files', t: '发文件' }, { k: 'dl', t: '安装和更新' },
]
const compName = (k: string) => COMPS.find(c => c.k === k)?.t || k
const act = computed(() => (S.value?.inc || []).filter((x: any) => !x.end))
const past = computed(() => (S.value?.inc || []).filter((x: any) => x.end))
const form = reactive({ title: '', level: 'part' as 'part' | 'down', text: '', comps: Object.fromEntries(COMPS.map(c => [c.k, false])) as Record<string, boolean> })
const err = ref('')
const busy = ref(false)
const more = reactive<Record<string, string>>({})
const rowBusy = ref('')

async function load() { try { S.value = await get('status') } catch (e) { toastError(e, '服务状态读不出来') } finally { loading.value = false } }
async function check() {
  checking.value = true
  try { S.value = await post('status/check', {}); pushToast('检查完了') } catch (e) { toastError(e, '没检查成') } finally { checking.value = false }
}
async function create() {
  err.value = ''
  if (!form.title.trim()) { err.value = '写一个标题，比如：部分专属网址打不开'; return }
  const comps = COMPS.filter(c => form.comps[c.k]).map(c => c.k)
  if (!(await confirm({ title: '发布故障说明', message: `「${form.title.trim()}」一分钟内会出现在官网的服务状态页面上。确定发布？`, confirmText: '发布' }))) return
  busy.value = true
  try {
    await post('incidents', { title: form.title, level: form.level, comps, text: form.text })
    pushToast('发布了'); form.title = ''; form.text = ''; form.level = 'part'; for (const c of COMPS) form.comps[c.k] = false; await load()
  } catch (e: any) { err.value = e.message || '没成功' } finally { busy.value = false }
}
async function update(x: any, resolve: boolean) {
  const text = (more[x.id] || '').trim()
  if (!resolve && !text) { pushToast('先写一下最新进展', 'danger'); return }
  if (resolve && !(await confirm({ title: '标为已恢复', message: `「${x.title}」会挪到「过去的故障」里。` + (text ? '' : '没写说明的话，会显示「已恢复」。'), confirmText: '已恢复' }))) return
  rowBusy.value = x.id
  try { await post('incidents/' + x.id, { text, resolve }); more[x.id] = ''; pushToast(resolve ? '已标为恢复' : '进展发出去了'); await load() } catch (e) { toastError(e, '没成功') } finally { rowBusy.value = '' }
}
async function remove(x: any) {
  if (!(await confirm({ title: '删除故障说明', message: `删除「${x.title}」？官网上也看不到了。`, confirmText: '删除', danger: true }))) return
  try { await del('incidents/' + x.id); pushToast('已删除'); load() } catch (e) { toastError(e, '没删掉') }
}
const dur = (a: number, b: number) => { const m = Math.max(1, Math.round((b - a) / 60e3)); return m < 60 ? m + ' 分钟' : m < 1440 ? Math.round(m / 60) + ' 小时' : Math.round(m / 1440) + ' 天' }
onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader title="服务状态" desc="官网「服务状态」页面（/status）。每小时自动检查一次各项服务；出了问题在这里写故障说明，一分钟内官网上就能看到。">
      <Tag v-if="act.length" tone="danger" dot>{{ act.length }} 个正在处理</Tag>
      <Tag v-else-if="S" tone="ok" dot>没有正在处理的故障</Tag>
    </PageHeader>
    <div class="hub-stack">
      <Panel title="各项服务" :meta="S && S.at ? '最近一次检查：' + ago(S.at) : '还没检查过'" class="reveal">
        <template #tools>
          <a class="btn btn-ghost btn-sm" href="/status" target="_blank" rel="noopener">打开官网看看</a>
          <Button size="sm" icon="refresh" :loading="checking" @click="check">马上检查一次</Button>
        </template>
        <div class="hub-list">
          <div v-for="c in S?.comps || []" :key="c.k" class="hub-row">
            <div class="hub-row-main">
              <div class="hub-row-title">{{ c.t }}<Tag v-if="c.now" :tone="LV[c.now]?.tone || 'neutral'" dot>{{ LV[c.now]?.t || c.now }}<template v-if="c.pct != null"> · {{ c.pct }}% 在线</template></Tag><Tag v-else tone="neutral">最近 3 小时没记录</Tag></div>
              <div class="hub-row-meta">{{ c.d }}<template v-if="c.up != null"> · 过去 90 天可用 <b>{{ c.up }}%</b></template></div>
            </div>
          </div>
          <EmptyState v-if="!loading && !(S?.comps || []).length" title="还没有检查记录" icon="activity" />
        </div>
        <p class="st-tip">专属网址看的是「路由器在线、但在外面打不开」的比例，路由器断电、家里断网不算。90% 以上算正常，60% 以上算部分有问题。</p>
      </Panel>

      <Panel title="正在处理" :meta="act.length ? act.length + ' 个' : ''" class="reveal">
        <div class="hub-list">
          <div v-for="x in act" :key="x.id" class="hub-row st-row">
            <div class="hub-row-main">
              <div class="hub-row-title"><Tag tone="danger" dot>{{ x.level === 'down' ? '故障' : '部分有问题' }}</Tag>{{ x.title }}</div>
              <div class="hub-row-meta">{{ dt(x.start) }} 开始 · 已经 {{ dur(x.start, Date.now()) }}<template v-if="x.comps?.length"> · 影响：{{ x.comps.map(compName).join('、') }}</template></div>
              <ul v-if="x.ups?.length" class="st-ups"><li v-for="(u, i) in x.ups" :key="i"><time>{{ dt(u.t) }}</time><span>{{ u.text }}</span></li></ul>
              <div class="st-more">
                <TextInput v-model="more[x.id]" multiline :rows="2" :maxlength="1000" placeholder="最新进展，比如：已经找到原因，正在修复" />
                <div class="st-more-acts">
                  <Button size="sm" variant="primary" :loading="rowBusy === x.id" @click="update(x, false)">发出去</Button>
                  <Button size="sm" icon="check" @click="update(x, true)">已恢复</Button>
                  <Button size="sm" variant="ghost" @click="remove(x)">删除</Button>
                </div>
              </div>
            </div>
          </div>
          <EmptyState v-if="!loading && !act.length" title="没有正在处理的故障" icon="check" />
        </div>
      </Panel>

      <Panel title="发布故障说明" class="reveal">
        <div class="hub-form">
          <Field label="标题" class="span-all" :error="err"><TextInput v-model="form.title" :maxlength="80" placeholder="比如：部分专属网址打不开" /></Field>
          <Field label="严重程度"><Segmented v-model="form.level" label="严重程度" :options="[{ label: '部分有问题', value: 'part' }, { label: '故障', value: 'down' }]" /></Field>
          <Field label="影响哪些服务" group class="span-all"><div class="st-comps"><Checkbox v-for="c in COMPS" :key="c.k" v-model="form.comps[c.k]" :label="c.t" /></div></Field>
          <Field label="说明（可以不写）" class="span-all"><TextInput v-model="form.text" multiline :rows="3" :maxlength="1000" placeholder="比如：收到反馈，正在查原因。家里上网不受影响。" /></Field>
          <div><Button variant="primary" :loading="busy" @click="create">发布</Button></div>
        </div>
      </Panel>

      <Panel title="过去的故障" :meta="past.length ? '最近 90 天 ' + past.length + ' 个' : ''" class="reveal">
        <div class="hub-list">
          <div v-for="x in past" :key="x.id" class="hub-row">
            <div class="hub-row-main">
              <div class="hub-row-title">{{ x.title }}</div>
              <div class="hub-row-meta">{{ dt(x.start) }} · 持续 {{ dur(x.start, x.end) }}<template v-if="x.comps?.length"> · {{ x.comps.map(compName).join('、') }}</template></div>
              <div v-if="x.ups?.length" class="hub-row-text">{{ x.ups[0].text }}</div>
            </div>
            <div class="hub-row-acts"><Button size="sm" variant="ghost" @click="remove(x)">删除</Button></div>
          </div>
          <EmptyState v-if="!loading && !past.length" title="过去 90 天没有故障" icon="check" />
        </div>
      </Panel>
    </div>
  </div>
</template>

<style scoped>
.st-tip { margin: 12px 0 0; font-size: 12.5px; color: var(--ink-soft); line-height: 1.6; }
.st-ups { margin: 6px 0 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.st-ups li { display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 8px; font-size: 13.5px; line-height: 1.6; }
.st-ups time { color: var(--ink-soft); white-space: nowrap; font-variant-numeric: tabular-nums; }
.st-ups span { overflow-wrap: anywhere; }
.st-more { margin-top: 10px; display: grid; gap: 8px; }
.st-more-acts { display: flex; flex-wrap: wrap; gap: 6px; }
.st-comps { display: flex; flex-wrap: wrap; gap: 8px 18px; }
@media (max-width: 640px) { .st-ups li { grid-template-columns: minmax(0, 1fr); gap: 0; } }
</style>

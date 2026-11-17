<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Tag from '@/components/ui/Tag.vue'
import Field from '@/components/ui/Field.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Select from '@/components/ui/Select.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { del as apiDel, get, post } from '@/api'
import { confirm } from '@/composables/confirm'
import { pushToast, toastError } from '@/composables/toast'
import { ago, full } from '@/utils/fmt'
import { faqRich } from '@/utils/faq'

/* 常见问题：官网 /help 页面显示的内容，改完马上生效。没改过时用的是内置的一份，「恢复默认」回到那一份 */
type Item = { id: string; cat: string; q: string; a: string; kw: string }
const cats = ref<{ k: string; t: string }[]>([])
const items = ref<Item[]>([])
const at = ref(0)
const dflt = ref(false)
const loading = ref(true)
const misses = ref<{ q: string; n: number; first: number; last: number }[]>([])
const ed = ref('')
const form = reactive({ q: '', cat: 'install', a: '', kw: '' })
const err = ref('')
const busy = ref(false)
const groups = computed(() => cats.value.map(c => ({ ...c, list: items.value.filter(x => x.cat === c.k) })).filter(g => g.list.length))
const preview = computed(() => faqRich(form.a))

async function load() {
  try {
    const r = await get('faq'); cats.value = r.cats; items.value = r.items; at.value = r.at; dflt.value = r.dflt
    if (!form.cat && r.cats[0]) form.cat = r.cats[0].k
    misses.value = (await get('faqmiss')).list
  } catch (e) { toastError(e, '常见问题读不出来') } finally { loading.value = false }
}
function edit(x: Item | null, fromMiss = '') {
  ed.value = x ? x.id : ''
  form.q = x ? x.q : ''; form.a = x ? x.a : ''; form.kw = x ? x.kw : fromMiss; form.cat = x ? x.cat : form.cat || cats.value[0]?.k || 'install'
  err.value = ''
  if (x || fromMiss) document.querySelector('.faq-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
async function save() {
  err.value = ''
  if (!form.q.trim() || !form.a.trim()) { err.value = '问题和回答都要写'; return }
  busy.value = true
  try {
    await post('faq' + (ed.value ? '/' + ed.value : ''), { q: form.q, a: form.a, cat: form.cat, kw: form.kw })
    // 从「搜不到的词」写的：写完把这个词划掉
    const kws = form.kw.split(/\s+/).filter(Boolean)
    for (const m of misses.value) if (kws.includes(m.q)) await post('faqmiss/del', { q: m.q }).catch(() => {})
    pushToast(ed.value ? '改好了，一分钟内官网上就能看到' : '加好了，一分钟内官网上就能看到'); edit(null); await load()
  } catch (e: any) { err.value = e.message || '没成功' } finally { busy.value = false }
}
async function del(x: Item) {
  if (!(await confirm({ title: '删除这条问题', message: `删除「${x.q}」？一分钟内官网上就看不到了。`, confirmText: '删除', danger: true }))) return
  try { await apiDel('faq/' + x.id); pushToast('已删除'); if (ed.value === x.id) edit(null); load() } catch (e) { toastError(e, '没删掉') }
}
async function move(x: Item, dir: 'up' | 'down') {
  try { await post('faq/' + x.id + '/move', { dir }); await load() } catch (e) { toastError(e, '没挪动') }
}
async function reset() {
  if (!(await confirm({ title: '恢复默认', message: '你在这里改过、加过的问题都会去掉，换回内置的那一份。确定？', confirmText: '恢复默认', danger: true }))) return
  try { await post('faq/reset', {}); pushToast('已恢复默认'); edit(null); load() } catch (e) { toastError(e, '没成功') }
}
async function dropMiss(q: string) {
  try { await post('faqmiss/del', { q }); misses.value = misses.value.filter(m => q !== '*' && m.q !== q) } catch (e) { toastError(e, '没成功') }
}
async function clearMiss() {
  if (!(await confirm({ title: '全部清掉', message: '清掉所有搜不到的词？', confirmText: '清掉' }))) return
  dropMiss('*')
}
onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader title="常见问题" desc="官网「常见问题」页面（/help）显示的内容，改完一分钟内官网上就能看到。大家搜了没找到的词也记在这里，可以照着补。">
      <Tag tone="info" dot>{{ items.length }} 条</Tag>
      <Tag v-if="dflt" tone="neutral">用的是默认内容</Tag>
      <Tag v-else-if="at" tone="neutral">{{ ago(at) }}改过</Tag>
    </PageHeader>
    <div class="hub-stack">
      <Panel v-if="misses.length" title="搜不到的词" :meta="misses.length + ' 个，按次数排'" class="reveal">
        <template #tools><Button size="sm" variant="ghost" @click="clearMiss">全部清掉</Button></template>
        <p class="faq-tip">只记搜的词和次数，不记是谁搜的。补一条问题、把这个词写进「搜索词」，以后就能搜到了。</p>
        <div class="hub-list">
          <div v-for="m in misses" :key="m.q" class="hub-row">
            <div class="hub-row-main">
              <div class="hub-row-title">「{{ m.q }}」</div>
              <div class="hub-row-meta">搜了 <b>{{ m.n }}</b> 次 · 最近一次 {{ ago(m.last) }}</div>
            </div>
            <div class="hub-row-acts"><Button size="sm" icon="plus" @click="edit(null, m.q)">写一条</Button><Button size="sm" variant="ghost" @click="dropMiss(m.q)">忽略</Button></div>
          </div>
        </div>
      </Panel>

      <Panel :title="ed ? '修改问题' : '加一条问题'" class="reveal faq-form">
        <div class="hub-form">
          <Field label="问题" class="span-all" :error="err"><TextInput v-model="form.q" :maxlength="120" placeholder="用大家会问的说法，比如：换了手机怎么登录？" /></Field>
          <Field label="分类"><Select v-model="form.cat" :options="cats.map(c => ({ label: c.t, value: c.k }))" /></Field>
          <Field label="搜索词（可以不写，用空格隔开）"><TextInput v-model="form.kw" :maxlength="300" placeholder="搜这些词也能找到这条，比如：换手机 新手机" /></Field>
          <Field label="回答" class="span-all" hint="**加粗**　`代码`　[文字](/app)　「- 」开头是列表，「1. 」开头是步骤，空一行分段"><TextInput v-model="form.a" multiline :rows="7" :maxlength="4000" placeholder="写清楚怎么做" /></Field>
          <div class="span-all faq-pv" aria-label="在官网上的样子">
            <div class="faq-pv-cap">在官网上的样子</div>
            <div class="faq-pv-card"><b>{{ form.q || '问题' }}</b><div class="faq-pv-a" v-html="preview || '<p>回答</p>'" /></div>
          </div>
          <div style="display: flex; gap: 8px"><Button variant="primary" :loading="busy" @click="save">{{ ed ? '保存修改' : '加上' }}</Button><Button v-if="ed || form.q || form.a" variant="ghost" @click="edit(null)">不改了</Button></div>
        </div>
      </Panel>

      <Panel title="所有问题" :meta="'按官网上的顺序'" class="reveal">
        <template #tools>
          <a class="btn btn-ghost btn-sm" href="/help" target="_blank" rel="noopener">打开官网看看</a>
          <Button v-if="!dflt" size="sm" variant="ghost" @click="reset">恢复默认</Button>
        </template>
        <div v-for="g in groups" :key="g.k" class="faq-grp">
          <h3 class="faq-grp-t">{{ g.t }} <span>{{ g.list.length }}</span></h3>
          <div class="hub-list">
            <div v-for="(x, i) in g.list" :key="x.id" :class="['hub-row', ed === x.id && 'faq-on']">
              <div class="hub-row-main">
                <div class="hub-row-title">{{ x.q }}</div>
                <div class="hub-row-meta"><span class="mono">#{{ x.id }}</span><template v-if="x.kw"> · 搜索词：{{ x.kw }}</template></div>
              </div>
              <div class="hub-row-acts">
                <IconButton name="arrowUp" label="往前挪" small :disabled="i === 0" @click="move(x, 'up')" />
                <IconButton name="arrowDown" label="往后挪" small :disabled="i === g.list.length - 1" @click="move(x, 'down')" />
                <Button size="sm" @click="edit(x)">修改</Button>
                <Button size="sm" variant="ghost" @click="del(x)">删除</Button>
              </div>
            </div>
          </div>
        </div>
        <EmptyState v-if="!loading && !items.length" title="一条问题都没有" icon="info" />
        <p v-if="at" class="faq-tip" style="margin-top: 12px">最近一次修改：{{ full(at) }}</p>
      </Panel>
    </div>
  </div>
</template>

<style scoped>
.faq-tip { margin: 0 0 6px; font-size: 13px; color: var(--ink-soft); line-height: 1.6; }
.faq-grp + .faq-grp { margin-top: 18px; }
.faq-grp-t { margin: 0 0 2px; font-size: 13px; font-weight: 650; color: var(--ink-muted); }
.faq-grp-t span { font-weight: 500; color: var(--ink-soft); margin-left: 4px; }
.faq-on { background: color-mix(in oklab, var(--blue) 7%, transparent); border-radius: 10px; }
.faq-pv { display: flex; flex-direction: column; gap: 6px; }
.faq-pv-cap { font-size: 12.5px; color: var(--ink-soft); }
.faq-pv-card { padding: 14px 16px; border-radius: 14px; border: 1px solid var(--line); background: var(--input-bg); }
.faq-pv-card > b { display: block; font-size: 15px; margin-bottom: 6px; }
.faq-pv-a { font-size: 14px; line-height: 1.75; color: var(--ink); overflow-wrap: anywhere; }
.faq-pv-a :deep(p) { margin: 0 0 8px; }
.faq-pv-a :deep(ul), .faq-pv-a :deep(ol) { margin: 0 0 8px; padding-left: 20px; }
.faq-pv-a :deep(code) { font-family: var(--font-mono); font-size: 12.5px; padding: 1px 5px; border-radius: 5px; background: color-mix(in oklab, var(--ink) 8%, transparent); }
.faq-pv-a :deep(a) { color: var(--blue); text-decoration: underline; }
</style>

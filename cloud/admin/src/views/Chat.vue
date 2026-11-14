<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Tag from '@/components/ui/Tag.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { blobUrl, del, get, post, type ChatMsg, type ChatThread } from '@/api'
import { badges, refreshBadges } from '@/composables/auth'
import { confirm } from '@/composables/confirm'
import { pushToast, toastError } from '@/composables/toast'
import { ago, full } from '@/utils/fmt'
import { shrinkImage, viewImage } from '@/utils/img'

/* 实时对话：左边是对话列表（有新消息的在前、带未读数），右边是聊天。开着时每几秒自动拿新消息 */
const route = useRoute()
const router = useRouter()
const threads = ref<ChatThread[]>([])
const q = ref('')
const cur = ref<string>(String(route.query.t || ''))
const msgs = ref<ChatMsg[]>([])
const seq = ref(0)
const text = ref('')
const img = ref('')
const sending = ref(false)
const imgs = ref<Record<number, string>>({})
const box = ref<HTMLElement | null>(null)
const file = ref<HTMLInputElement | null>(null)
const loaded = ref(false)

const thread = computed(() => threads.value.find(t => t.tid === cur.value) || null)
const shown = computed(() => {
  const k = q.value.trim().toLowerCase()
  return threads.value.filter(t => !k || [t.name, t.model, t.sub, t.tid, t.preview].join(' ').toLowerCase().includes(k))
})
const COLORS = ['#2457F5', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#30b0c7', '#5e5ce6']
const colorOf = (t: ChatThread) => COLORS[[...t.tid].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
const QUICK = ['收到，我看看', '能发一张截图吗？', '在面板「一键更新」更新到最新版试试', '已经修好了，更新一下就行', '这个是路由器固件的问题，面板这边改不了']

async function loadThreads() {
  try { threads.value = (await get<{ list: ChatThread[] }>('chat')).list; loaded.value = true } catch (e) { if (!loaded.value) toastError(e, '对话列表读不出来') }
}
async function loadMsgs(fullLoad = false) {
  if (!cur.value) return
  const tid = cur.value
  try {
    const r = await get<{ thread: ChatThread; msgs: ChatMsg[] }>(`chat/${tid}?read=1&after=${fullLoad ? 0 : seq.value}`)
    if (tid !== cur.value) return
    const before = seq.value
    if (fullLoad) msgs.value = r.msgs
    else for (const m of r.msgs) if (!msgs.value.some(x => x.s === m.s)) msgs.value.push(m)
    seq.value = Math.max(seq.value, ...msgs.value.map(m => m.s), 0)
    const t = threads.value.find(x => x.tid === tid); if (t) { t.ua = 0; Object.assign(t, r.thread, { ua: 0 }) }
    for (const m of msgs.value) if (m.img && !imgs.value[m.s]) blobUrl(`chat/${tid}/img/${m.s}`).then(u => { imgs.value = { ...imgs.value, [m.s]: u } }).catch(() => {})
    if (fullLoad || seq.value !== before) scrollDown(fullLoad)
    if (r.msgs.length) refreshBadges()
  } catch (e) { if (fullLoad) toastError(e, '消息读不出来') }
}
function scrollDown(force: boolean) {
  nextTick(() => {
    const el = box.value; if (!el) return
    if (force || el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight
  })
}
function open(tid: string) {
  if (cur.value === tid) return
  cur.value = tid; msgs.value = []; seq.value = 0; text.value = ''; img.value = ''
  router.replace({ query: { t: tid } })
  loadMsgs(true)
}
watch(() => route.query.t, (t) => { if (!t) cur.value = '' })

async function pick() {
  const f = file.value?.files?.[0]; if (file.value) file.value.value = ''
  if (!f) return
  try { img.value = await shrinkImage(f) } catch (e: any) { pushToast(e.message, 'danger') }
}
async function send() {
  const x = text.value.trim()
  if ((!x && !img.value) || !cur.value || sending.value) return
  sending.value = true
  try {
    const r = await post<{ msg: ChatMsg }>(`chat/${cur.value}`, { text: x, img: img.value || undefined })
    if (img.value) imgs.value = { ...imgs.value, [r.msg.s]: img.value }
    msgs.value.push(r.msg); seq.value = Math.max(seq.value, r.msg.s)
    text.value = ''; img.value = ''
    scrollDown(true); loadThreads()
  } catch (e) { toastError(e, '没发出去') }
  finally { sending.value = false }
}
// 电脑上回车发送（Shift+回车换行）；手机上回车是换行，点「发送」才发
const desk = window.matchMedia('(hover: hover) and (pointer: fine)').matches
function onKey(e: KeyboardEvent) { if (desk && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() } }
async function block(on: boolean) {
  const t = thread.value; if (!t) return
  if (on && !(await confirm({ title: '拉黑这个对话', message: `拉黑以后「${t.name}」不能再发消息（之前的记录还在），随时可以解除。`, confirmText: '拉黑', danger: true }))) return
  try { await post(`chat/${t.tid}/${on ? 'block' : 'unblock'}`); pushToast(on ? '已拉黑' : '已解除拉黑'); loadThreads() } catch (e) { toastError(e, '没成功') }
}
async function remove() {
  const t = thread.value; if (!t) return
  if (!(await confirm({ title: '删除对话', message: `「${t.name}」的全部消息和图片都会删掉，不能恢复。对方再发消息会开一个新对话。`, confirmText: '删除', danger: true }))) return
  try { await del(`chat/${t.tid}`); pushToast('已删除'); cur.value = ''; router.replace({ query: {} }); loadThreads() } catch (e) { toastError(e, '没删掉') }
}
const dayOf = (t: number) => { const x = new Date(t), n = new Date(); return x.toDateString() === n.toDateString() ? '今天' : x.toDateString() === new Date(+n - 864e5).toDateString() ? '昨天' : x.toLocaleDateString('zh-CN') }
const rows = computed(() => { const out: Array<{ day?: string; m?: ChatMsg }> = []; let d = ''; for (const m of msgs.value) { const dd = dayOf(m.t); if (dd !== d) { d = dd; out.push({ day: dd }) } out.push({ m }) } return out })
const tm = (t: number) => new Date(t).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
const short = (t?: number) => { if (!t) return ''; const x = new Date(t); return x.toDateString() === new Date().toDateString() ? tm(t) : `${x.getMonth() + 1}/${x.getDate()}` }

let t1 = 0, t2 = 0
onMounted(async () => {
  await loadThreads()
  if (cur.value) loadMsgs(true)
  t1 = window.setInterval(() => { if (!document.hidden) loadThreads() }, 5000)
  t2 = window.setInterval(() => { if (!document.hidden && cur.value) loadMsgs(false) }, 3000)
})
onBeforeUnmount(() => { clearInterval(t1); clearInterval(t2); Object.values(imgs.value).forEach(u => u.startsWith('blob:') && URL.revokeObjectURL(u)) })
</script>

<template>
  <div class="page chat-page">
    <PageHeader title="实时对话" desc="用户在面板里点「实时联系开发者」发来的消息。回复后托管版会马上推送到对方手机，自建版半小时内推送；对方开着对话页几秒内就能看到。">
      <Tag v-if="badges.chat" tone="danger" dot>{{ badges.chat }} 条没看</Tag>
    </PageHeader>
    <div :class="['chat-wrap reveal', cur && 'has-open']">
      <section class="panel m-surface chat-side">
        <div class="hub-tools"><TextInput v-model="q" icon="search" placeholder="搜路由器名、型号、内容" clearable /></div>
        <div class="chat-threads">
          <button v-for="t in shown" :key="t.tid" type="button" :class="['chat-th', t.tid === cur && 'is-on']" @click="open(t.tid)">
            <span class="chat-av" :style="{ background: colorOf(t) }">{{ (t.name || '?').slice(0, 1).toUpperCase() }}</span>
            <span class="chat-th-main">
              <span class="chat-th-top"><span>{{ t.name || t.tid }}</span><time>{{ short(t.last) }}</time></span>
              <span class="chat-th-sub"><span>{{ t.lastFrom === 'a' ? '我：' : '' }}{{ t.preview }}</span><em v-if="t.ua" class="nav-badge" style="margin: 0">{{ t.ua }}</em><Tag v-else-if="t.blocked" tone="danger">已拉黑</Tag></span>
            </span>
          </button>
          <div v-if="loaded && !shown.length" class="chat-empty">{{ q ? '没找到' : '还没有人发消息。用户在面板侧边栏「消息与帮助 → 实时联系开发者」里发的消息会出现在这里。' }}</div>
        </div>
      </section>
      <section class="panel m-surface chat-main">
        <template v-if="thread">
          <header class="chat-head">
            <IconButton class="chat-back" name="chevronLeft" label="返回对话列表" @click="cur = ''; router.replace({ query: {} })" />
            <span class="chat-av" :style="{ background: colorOf(thread) }">{{ (thread.name || '?').slice(0, 1).toUpperCase() }}</span>
            <div class="t">
              <b><span>{{ thread.name }}</span><Tag :tone="thread.kind === 'hosted' ? 'info' : 'neutral'">{{ thread.kind === 'hosted' ? '托管版' : '自建版' }}</Tag></b>
              <span>{{ [thread.model, thread.ver ? 'v' + thread.ver : '', thread.sub, thread.place, thread.dev].filter(Boolean).join(' · ') }}</span>
            </div>
            <Button size="sm" :variant="thread.blocked ? 'secondary' : 'ghost'" @click="block(!thread.blocked)">{{ thread.blocked ? '解除拉黑' : '拉黑' }}</Button>
            <Button size="sm" variant="ghost" @click="remove">删除</Button>
          </header>
          <div ref="box" class="chat-msgs">
            <template v-for="(r, i) in rows" :key="i">
              <div v-if="r.day" class="chat-day">{{ r.day }}</div>
              <div v-else-if="r.m" :class="['chat-row', r.m.f === 'a' && 'me']">
                <div class="chat-bub">
                  <img v-if="r.m.img && imgs[r.m.s]" :src="imgs[r.m.s]" alt="图片" @click="viewImage(imgs[r.m.s])">
                  <span v-else-if="r.m.img" class="soft2">图片加载中…</span>
                  <span v-if="r.m.x" class="chat-tx">{{ r.m.x }}</span>
                </div>
                <span class="chat-meta" :title="full(r.m.t)">{{ tm(r.m.t) }}</span>
              </div>
            </template>
            <div v-if="!msgs.length" class="chat-empty">读取中…</div>
          </div>
          <div class="chat-box">
            <div class="chat-quick"><button v-for="x in QUICK" :key="x" type="button" class="hub-chip" @click="text = text ? text + ' ' + x : x">{{ x }}</button></div>
            <div v-if="img" class="chat-pre"><img :src="img" alt="要发的图片"><span>图片会跟这条一起发</span><Button size="sm" variant="ghost" @click="img = ''">不发了</Button></div>
            <div class="chat-in">
              <IconButton name="image" label="发图片" @click="file?.click()" />
              <input ref="file" type="file" accept="image/*" hidden @change="pick">
              <textarea v-model="text" rows="2" maxlength="2000" :placeholder="desk ? '回复…（回车发送，Shift+回车换行）' : '回复…'" @keydown="onKey" />
              <Button variant="primary" icon="send" :loading="sending" :disabled="!text.trim() && !img" @click="send">发送</Button>
            </div>
          </div>
        </template>
        <div v-else class="chat-empty">选左边的一个对话开始回复<br><span class="faint">{{ threads.length }} 个对话 · 最近一条 {{ threads[0] ? ago(threads[0].last) : '—' }}</span></div>
      </section>
    </div>
  </div>
</template>

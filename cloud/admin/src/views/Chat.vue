<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Segmented from '@/components/ui/Segmented.vue'
import Tag from '@/components/ui/Tag.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Drawer from '@/components/ui/Drawer.vue'
import FileAttach from '@/components/hub/FileAttach.vue'
import FileList from '@/components/hub/FileList.vue'
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
// 筛选（5.0）：全部 / 等我回复 / 已解决
const view = ref<'all' | 'wait' | 'done'>('all')
const cur = ref<string>(String(route.query.t || ''))
const msgs = ref<ChatMsg[]>([])
const seq = ref(0)
const text = ref('')
const img = ref('')
const att = ref<InstanceType<typeof FileAttach> | null>(null)
const canFile = ref(false)
const sending = ref(false)
const imgs = ref<Record<number, string>>({})
const box = ref<HTMLElement | null>(null)
const file = ref<HTMLInputElement | null>(null)
const loaded = ref(false)

const thread = computed(() => threads.value.find(t => t.tid === cur.value) || null)
const shown = computed(() => {
  const k = q.value.trim().toLowerCase()
  return threads.value.filter(t => (view.value === 'all' || (view.value === 'done' ? !!t.done : !t.done && t.lastFrom === 'u')) && (!k || [t.name, t.model, t.sub, t.tid, t.preview].join(' ').toLowerCase().includes(k)))
})
const COLORS = ['#2457F5', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#30b0c7', '#5e5ce6']
const colorOf = (t: ChatThread) => COLORS[[...t.tid].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
// 5.0.1：对方的官网账号（名字、头像）、自己的名字头像、「查看对方所有信息」
type Peer = { uid?: string; name: string; email: string; av?: boolean; avatar?: string; more?: number }
const peers = ref<Record<string, Peer>>({})
const peer = ref<Peer | null>(null)
const me = ref<{ name: string; avatar: string }>({ name: '开发者', avatar: '' })
const infoOpen = ref(false)
const info = ref<any>(null)
const peerName = (t: ChatThread | null) => { if (!t) return ''; const p = peers.value[t.tid]; return p ? (p.name || p.email.split('@')[0]) : '' }
async function loadPeers() { try { peers.value = (await get<{ map: Record<string, Peer> }>('chatpeers')).map } catch { /* 忽略 */ } }
async function loadPeer(tid: string) { peer.value = null; try { const r = await get<{ peer: Peer | null }>(`chat/${tid}/peer`); if (tid === cur.value) peer.value = r.peer } catch { /* 忽略 */ } }
async function openInfo() {
  if (!cur.value) return
  info.value = null; infoOpen.value = true
  try { info.value = await get(`chat/${cur.value}/info`) } catch (e) { toastError(e, '读不出来'); infoOpen.value = false }
}
const ymdhm = (t?: number) => t ? new Date(t).toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const fbState = (f: any) => f.done ? '已修复' : f.nofix ? '无法修复' : f.ack ? '开发人员已收到' : '等开发人员查看'
// 同一个人连续发的几条，只在第一条上面显示头像和名字
const firstOfGroup = (i: number) => { const r = rows.value; const m = r[i]?.m; if (!m) return false; const p = r[i - 1]?.m; return !p || p.f !== m.f || !!p.auto !== !!m.auto }
const QUICK = ['收到，我看看', '能发一张截图吗？', '在面板「一键更新」更新到最新版试试', '已经修好了，更新一下就行', '这个是路由器固件的问题，面板这边改不了']

async function loadThreads() {
  try { threads.value = (await get<{ list: ChatThread[] }>('chat')).list; loaded.value = true } catch (e) { if (!loaded.value) toastError(e, '对话列表读不出来') }
}
async function loadMsgs(fullLoad = false) {
  if (!cur.value) return
  const tid = cur.value
  try {
    const r = await get<{ thread: ChatThread; msgs: ChatMsg[]; files?: boolean }>(`chat/${tid}?read=1&after=${fullLoad ? 0 : seq.value}`)
    canFile.value = !!r.files
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
  cur.value = tid; msgs.value = []; seq.value = 0; text.value = ''; img.value = ''; att.value?.clear(); infoOpen.value = false; loadPeer(tid)
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
  const ids = att.value?.ids() || []
  if ((!x && !img.value && !ids.length) || !cur.value || sending.value) return
  if (att.value?.busy) return pushToast('文件还在上传，传完再发', 'danger')
  sending.value = true
  try {
    const r = await post<{ msg: ChatMsg }>(`chat/${cur.value}`, { text: x, img: img.value || undefined, files: ids.length ? ids : undefined })
    att.value?.clear()
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
// 已解决（5.0）：问题处理完了标一下，列表里分开；对方再发消息会自动重新打开
async function setDone(on: boolean) {
  const t = thread.value; if (!t) return
  try { await post(`chat/${t.tid}/${on ? 'done' : 'undone'}`); t.done = on ? Date.now() : 0; pushToast(on ? '标为已解决：对方再发消息会自动重新打开' : '重新打开了'); loadThreads() } catch (e) { toastError(e, '没成功') }
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
let t3 = 0
onMounted(async () => {
  await loadThreads()
  loadPeers(); get<{ name: string; avatar: string }>('devprofile').then(r => { me.value = r }).catch(() => {})
  t3 = window.setInterval(() => { if (!document.hidden) loadPeers() }, 30000)
  if (cur.value) { loadMsgs(true); loadPeer(cur.value) }
  t1 = window.setInterval(() => { if (!document.hidden) loadThreads() }, 5000)
  t2 = window.setInterval(() => { if (!document.hidden && cur.value) loadMsgs(false) }, 3000)
})
onBeforeUnmount(() => { clearInterval(t1); clearInterval(t2); clearInterval(t3); Object.values(imgs.value).forEach(u => u.startsWith('blob:') && URL.revokeObjectURL(u)) })
</script>

<template>
  <div class="page chat-page">
    <PageHeader title="实时对话" desc="用户在面板里点「实时联系开发者」发来的消息。回复后托管版会马上推送到对方手机，自建版半小时内推送；对方开着对话页几秒内就能看到。">
      <Tag v-if="badges.chat" tone="danger" dot>{{ badges.chat }} 条没看</Tag>
    </PageHeader>
    <div class="chat-cq">
    <div :class="['chat-wrap reveal', cur && 'has-open']">
      <section class="panel m-surface chat-side">
        <div class="hub-tools"><TextInput v-model="q" icon="search" placeholder="搜路由器名、型号、内容" clearable /></div>
        <div class="chat-filter"><Segmented v-model="view" label="筛选对话" :options="[{ label: '全部', value: 'all' }, { label: '等我回复', value: 'wait' }, { label: '已解决', value: 'done' }]" /></div>
        <div class="chat-threads">
          <button v-for="t in shown" :key="t.tid" type="button" :class="['chat-th', t.tid === cur && 'is-on']" @click="open(t.tid)">
            <span class="chat-av" :style="{ background: colorOf(t) }">{{ (peerName(t) || t.name || '?').slice(0, 1).toUpperCase() }}</span>
            <span class="chat-th-main">
              <span class="chat-th-top"><span>{{ t.name || t.tid }}<em v-if="peerName(t)" class="chat-th-acc"> · {{ peerName(t) }}</em></span><time>{{ short(t.last) }}</time></span>
              <span class="chat-th-sub"><span>{{ t.lastFrom === 'a' ? '我：' : '' }}{{ t.preview }}</span><em v-if="t.ua" class="nav-badge" style="margin: 0">{{ t.ua }}</em><Tag v-else-if="t.blocked" tone="danger">已拉黑</Tag><Tag v-else-if="t.done" tone="ok">已解决</Tag></span>
            </span>
          </button>
          <div v-if="loaded && !shown.length" class="chat-empty">{{ q ? '没找到' : view === 'done' ? '还没有标为已解决的对话' : view === 'wait' ? '没有在等你回复的对话' : '还没有人发消息。用户在面板侧边栏「消息与帮助 → 实时联系开发者」里发的消息会出现在这里。' }}</div>
        </div>
      </section>
      <section class="panel m-surface chat-main">
        <template v-if="thread">
          <header class="chat-head">
            <IconButton class="chat-back" name="chevronLeft" label="返回对话列表" @click="cur = ''; router.replace({ query: {} })" />
            <span :class="['chat-av', peer?.avatar && 'has-img']" :style="peer?.avatar ? { backgroundImage: `url(${peer.avatar})` } : { background: colorOf(thread) }">{{ peer?.avatar ? '' : (peerName(thread) || thread.name || '?').slice(0, 1).toUpperCase() }}</span>
            <div class="t">
              <b><span>{{ thread.name }}<em v-if="peerName(thread)" class="chat-th-acc"> · {{ peerName(thread) }}</em></span><Tag :tone="thread.kind === 'hosted' ? 'info' : 'neutral'">{{ thread.kind === 'hosted' ? '托管版' : '自建版' }}</Tag></b>
              <span><em class="kind-sm">{{ thread.kind === 'hosted' ? '托管版' : '自建版' }} · </em>{{ [thread.model, thread.ver ? 'v' + thread.ver : '', thread.sub, thread.place, thread.dev].filter(Boolean).join(' · ') }}</span>
            </div>
            <Button class="act-txt" size="sm" variant="secondary" icon="user" @click="openInfo">对方信息</Button>
            <IconButton class="act-ico" name="user" label="查看对方所有信息" @click="openInfo" />
            <Button class="act-txt" size="sm" :variant="thread.done ? 'secondary' : 'ghost'" @click="setDone(!thread.done)">{{ thread.done ? '重新打开' : '已解决' }}</Button>
            <IconButton class="act-ico" name="check" :label="thread.done ? '重新打开' : '标为已解决'" @click="setDone(!thread.done)" />
            <Button class="act-txt" size="sm" :variant="thread.blocked ? 'secondary' : 'ghost'" @click="block(!thread.blocked)">{{ thread.blocked ? '解除拉黑' : '拉黑' }}</Button>
            <Button class="act-txt" size="sm" variant="ghost" @click="remove">删除</Button>
            <IconButton class="act-ico" name="ban" :label="thread.blocked ? '解除拉黑' : '拉黑'" :danger="thread.blocked" @click="block(!thread.blocked)" />
            <IconButton class="act-ico" name="trash" label="删除这个对话" @click="remove" />
          </header>
          <div ref="box" class="chat-msgs">
            <template v-for="(r, i) in rows" :key="i">
              <div v-if="r.day" class="chat-day">{{ r.day }}</div>
              <div v-else-if="r.m" :class="['chat-row', r.m.f === 'a' && 'me', r.m.auto && 'is-auto']">
                <div v-if="r.m.auto" class="chat-auto">自动回复（你不在线时发的）</div>
                <div v-else-if="firstOfGroup(i)" class="chat-who">
                  <span :class="['chat-mav', (r.m.f === 'a' ? me.avatar : peer?.avatar) && 'has-img']" :style="(r.m.f === 'a' ? me.avatar : peer?.avatar) ? { backgroundImage: `url(${r.m.f === 'a' ? me.avatar : peer?.avatar})` } : { background: r.m.f === 'a' ? '#22c55e' : colorOf(thread) }">{{ (r.m.f === 'a' ? me.avatar : peer?.avatar) ? '' : (r.m.f === 'a' ? me.name : (peerName(thread) || thread.name || '?')).slice(0, 1) }}</span>
                  <span>{{ r.m.f === 'a' ? me.name + '（我）' : (peerName(thread) || thread.name) }}</span>
                </div>
                <div class="chat-bub">
                  <img v-if="r.m.img && imgs[r.m.s]" :src="imgs[r.m.s]" alt="图片" @click="viewImage(imgs[r.m.s])">
                  <span v-else-if="r.m.img" class="soft2">图片加载中…</span>
                  <FileList v-if="r.m.files?.length" :files="r.m.files" />
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
            <FileAttach ref="att" ctx="chat" class="chat-att" />
            <div class="chat-in">
              <div class="chat-tools"><IconButton name="image" label="发图片" @click="file?.click()" /><IconButton v-if="canFile" name="clip" label="发文件（视频、文档等，最大 200MB）" @click="att?.pick()" /></div>
              <input ref="file" type="file" accept="image/*" hidden @change="pick">
              <textarea v-model="text" rows="2" maxlength="2000" :placeholder="desk ? '回复…（回车发送，Shift+回车换行）' : '回复…'" @keydown="onKey" />
              <Button variant="primary" icon="send" :loading="sending" :disabled="!text.trim() && !img && !att?.count" @click="send">发送</Button>
            </div>
          </div>
        </template>
        <div v-else class="chat-empty">选左边的一个对话开始回复<br><span class="faint">{{ threads.length }} 个对话 · 最近一条 {{ threads[0] ? ago(threads[0].last) : '—' }}</span></div>
      </section>
    </div>
    </div>
    <Drawer :open="infoOpen" title="对方的所有信息" :sub="thread ? thread.name + (peerName(thread) ? ' · ' + peerName(thread) : '') : ''" :width="560" @close="infoOpen = false">
      <div v-if="!info" class="chat-empty">读取中…</div>
      <div v-else class="ci">
        <section v-for="a in info.accounts" :key="a.uid" class="ci-sec ci-acc">
          <div class="ci-me">
            <span :class="['chat-av ci-av', a.avatar && 'has-img']" :style="a.avatar ? { backgroundImage: `url(${a.avatar})` } : { background: '#22c55e' }">{{ a.avatar ? '' : (a.name || a.email).slice(0, 1).toUpperCase() }}</span>
            <div><b>{{ a.name || a.email.split('@')[0] }}</b><span>{{ a.email }}</span></div>
          </div>
          <dl class="ci-kv">
            <dt>注册时间</dt><dd>{{ ymdhm(a.created) }}</dd>
            <dt>最近登录</dt><dd>{{ ymdhm(a.lastAt) }}</dd>
            <dt>邮箱验证</dt><dd>{{ a.verified ? '已验证' : '没验证' }}</dd>
            <dt>绑定的路由器</dt><dd>{{ a.devs }} 台托管版<span v-if="a.links">，{{ a.links }} 台自建版</span></dd>
            <dt>试用</dt><dd>{{ !a.trial ? '没领' : a.trial.used ? '已用' : a.trial.got ? '领了还没用' : '没领' }}</dd>
          </dl>
          <h4>登录着的设备（{{ a.sessions.length }}）</h4>
          <ul class="ci-list"><li v-for="(x, k) in a.sessions" :key="k"><b>{{ x.ua || '没记录设备' }}</b><span>{{ [x.place, ymdhm(x.at) + ' 登录', x.last ? '最近 ' + ago(x.last) : ''].filter(Boolean).join(' · ') }}</span></li><li v-if="!a.sessions.length" class="faint">没有</li></ul>
        </section>
        <section v-if="!info.accounts.length" class="ci-sec"><p class="faint">{{ info.thread.kind === 'self' ? '自建版路由器，没有官网账号。' : '这台路由器还没绑定官网账号。' }}</p></section>
        <section class="ci-sec">
          <h4>对话</h4>
          <dl class="ci-kv">
            <dt>类型</dt><dd>{{ info.thread.kind === 'hosted' ? '托管版' : '自建版' }}</dd>
            <dt>开始时间</dt><dd>{{ ymdhm(info.thread.at) }}</dd>
            <dt>消息</dt><dd>{{ info.thread.n || 0 }} 条，最近 {{ ymdhm(info.thread.last) }}</dd>
            <dt>发消息的设备</dt><dd>{{ info.thread.dev || '—' }}</dd>
            <dt>大概位置</dt><dd>{{ info.thread.place || '—' }}</dd>
            <dt>面板版本</dt><dd>{{ info.thread.ver ? 'v' + String(info.thread.ver).replace(/^v/, '') : '—' }}</dd>
          </dl>
        </section>
        <section v-if="info.router" class="ci-sec">
          <h4>路由器</h4>
          <dl class="ci-kv">
            <dt>名字 / 型号</dt><dd>{{ info.router.name }}<span v-if="info.router.model"> · {{ info.router.model }}</span></dd>
            <dt>编号</dt><dd>{{ info.router.sub }}</dd>
            <dt>状态</dt><dd>{{ info.router.off ? (info.router.offWhy === 'exp' ? '已到期暂停' : '已停用') : '正常' }} · 最后上线 {{ info.router.last ? ago(info.router.last) : '—' }}</dd>
            <dt>到期</dt><dd>{{ info.router.exp ? ymdhm(info.router.exp) : '不限期' }}</dd>
            <dt>面板版本</dt><dd>{{ info.router.ver || '—' }}</dd>
            <dt>开通时间</dt><dd>{{ ymdhm(info.router.created) }}</dd>
          </dl>
        </section>
        <section class="ci-sec">
          <h4>反馈（{{ info.feedbacks.length }}）</h4>
          <ul class="ci-list"><li v-for="f in info.feedbacks" :key="f.code"><b>{{ fbState(f) }} · {{ f.code }}</b><span>{{ ymdhm(f.at) }} · {{ f.text }}</span></li><li v-if="!info.feedbacks.length" class="faint">没有</li></ul>
        </section>
        <section class="ci-sec">
          <h4>续期申请（{{ info.applications.length }}）</h4>
          <ul class="ci-list"><li v-for="(x, k) in info.applications" :key="k"><b>{{ x.status === 'ok' ? '通过' : x.status === 'no' ? '没通过' : '待审核' }}<span v-if="x.days"> · {{ x.days }} 天</span></b><span>{{ ymdhm(x.at) }} · {{ x.source }} · {{ x.contact }}<span v-if="x.note"> · {{ x.note }}</span></span></li><li v-if="!info.applications.length" class="faint">没有</li></ul>
        </section>
        <section class="ci-sec">
          <h4>登录记录（{{ info.logins.length }}）</h4>
          <ul class="ci-list"><li v-for="(x, k) in info.logins" :key="k"><b>{{ x.ok ? '成功' : '失败' }} · {{ ({ user: '登录', reg: '注册', reset: '找回密码', admin: '后台' } as any)[x.k] || x.k }}</b><span>{{ ymdhm(x.t) }} · {{ [x.ip, x.place, x.ua, x.why].filter(Boolean).join(' · ') }}</span></li><li v-if="!info.logins.length" class="faint">没有</li></ul>
        </section>
        <section class="ci-sec">
          <h4>操作记录（{{ info.ops.length }}）</h4>
          <ul class="ci-list"><li v-for="(x, k) in info.ops" :key="k"><b>{{ x.op }}</b><span>{{ ymdhm(x.t) }} · {{ x.detail }}</span></li><li v-if="!info.ops.length" class="faint">没有</li></ul>
        </section>
      </div>
    </Drawer>
  </div>
</template>

<style scoped>
.chat-th-acc { font-style: normal; color: var(--ink-faint); font-weight: 500; }
.chat-av.has-img, .chat-mav.has-img { background-size: cover !important; background-position: center !important; }
.chat-who { display: flex; align-items: center; gap: 6px; margin: 2px 4px 4px; font-size: 12px; color: var(--ink-soft); }
.chat-row.me .chat-who { flex-direction: row-reverse; }
.chat-mav { width: 22px; height: 22px; border-radius: 50%; flex: none; display: grid; place-items: center; color: #fff; font-size: 11px; font-weight: 700; }
.ci { display: grid; gap: 14px; }
.ci-sec { padding: 14px 16px; border-radius: 14px; background: var(--surface-solid); border: 1px solid var(--line); }
.ci-sec h4 { margin: 0 0 8px; font-size: 14px; }
.ci-me { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.ci-av { width: 52px; height: 52px; border-radius: 16px; font-size: 20px; }
.ci-me > div > b { display: block; font-size: 17px; }
.ci-me > div > span { display: block; color: var(--ink-soft); font-size: 13px; word-break: break-all; }
.ci-kv { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 6px 12px; margin: 0 0 6px; font-size: 13px; }
.ci-kv dt { color: var(--ink-faint); }
.ci-kv dd { margin: 0; word-break: break-word; }
.ci-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: 13px; }
.ci-list b { display: block; font-weight: 600; }
.ci-list span { color: var(--ink-soft); word-break: break-word; }
</style>

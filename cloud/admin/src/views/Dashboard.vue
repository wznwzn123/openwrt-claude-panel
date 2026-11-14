<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import Metric from '@/components/ui/Metric.vue'
import SectionLabel from '@/components/ui/SectionLabel.vue'
import Segmented from '@/components/ui/Segmented.vue'
import DeltaPill from '@/components/ui/DeltaPill.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Tag from '@/components/ui/Tag.vue'
import TrendChart from '@/components/charts/TrendChart.vue'
import BarChart from '@/components/charts/BarChart.vue'
import TickRing from '@/components/charts/TickRing.vue'
import { get, type Overview, type LoginRow } from '@/api'
import { badges } from '@/composables/auth'
import { revealCascade, trackGlow } from '@/composables/motion'
import { toastError } from '@/composables/toast'
import { CC, ago } from '@/utils/fmt'

/* 工作台：一眼看到要处理的事（对话、反馈、续期申请）和这段时间的访问、登录、路由器情况 */
const router = useRouter()
const ov = ref<Overview | null>(null)
const logins = ref<LoginRow[]>([])
const loading = ref(false)
const range = ref<7 | 30>(7)
const grid = ref<HTMLElement | null>(null)

const days = computed(() => (ov.value?.days ?? []).slice(-range.value))
const pv = computed(() => days.value.map(d => d.n.pv ? d.n.pv - (d.n.bot || 0) : 0))
const uv = computed(() => days.value.map(d => d.uv || 0))
const labels = computed(() => days.value.map(d => d.d.slice(5).replace('-', '/')))
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
const pvTotal = computed(() => sum(pv.value))
// 跟上一段同样长的时间比
const prevTotal = computed(() => { const all = ov.value?.days ?? []; const p = all.slice(-range.value * 2, -range.value); return p.length === range.value ? sum(p.map(d => (d.n.pv || 0) - (d.n.bot || 0))) : null })
const delta = computed(() => (prevTotal.value ? Math.round(((pvTotal.value - prevTotal.value) / prevTotal.value) * 1000) / 10 : null))
const today = computed(() => ov.value?.days?.[ov.value.days.length - 1])
const loginOk = computed(() => days.value.map(d => (d.n.login_ok || 0) + (d.n.adm_ok || 0)))
const loginFail = computed(() => days.value.map(d => (d.n.login_fail || 0) + (d.n.adm_fail || 0)))
const okRate = computed(() => { const o = sum(loginOk.value), f = sum(loginFail.value); return o + f ? Math.round((o / (o + f)) * 1000) / 10 : null })
const countries = computed(() => {
  const m: Record<string, number> = {}
  for (const d of days.value) for (const [k, v] of Object.entries(d.cc || {})) m[k] = (m[k] || 0) + v
  const all = Object.entries(m).sort((a, b) => b[1] - a[1]), tot = sum(all.map(x => x[1])) || 1
  const top = all.slice(0, 5)
  return top.map(([k, v], i) => ({ label: CC[k] || k, value: v, pct: Math.round((v / tot) * 100), w: Math.max(3, (v / (top[0]?.[1] || 1)) * 100), cat: (i % 5) + 1 }))
})
const greeting = computed(() => { const h = new Date().getHours(); return h < 6 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好' })
const dateStamp = computed(() => new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }))
// 要处理的事
const todo = computed(() => {
  const o = ov.value
  return [
    { key: 'chat', icon: 'chat', label: '实时对话', value: badges.value.chat || o?.chat.unread || 0, sub: (badges.value.chatWaiting || o?.chat.waiting || 0) + ' 个对话在等你回复', path: '/chat' },
    { key: 'fb', icon: 'inbox', label: '问题反馈', value: o?.fb.open ?? 0, sub: '没处理的；本周新来 ' + (o?.fb.week ?? 0) + ' 条', path: '/feedback' },
    { key: 'ap', icon: 'mail', label: '续期申请', value: badges.value.aps || 0, sub: '等你审核', path: '/applications' },
    { key: 'exp', icon: 'clock', label: '7 天内到期', value: o?.devices.expiring ?? 0, sub: '台路由器快到期了', path: '/devices' },
  ]
})

async function load() {
  loading.value = true
  try {
    const [o, l, ap] = await Promise.all([get<Overview>('overview'), get<{ list: LoginRow[] }>('logins'), get<{ list: any[] }>('applications').catch(() => ({ list: [] }))])
    ov.value = o; logins.value = l.list.slice(0, 6)
    badges.value = { ...badges.value, aps: ap.list.filter(a => a.status === 'pending' && !a.logged).length }
    await nextTick()
  } catch (e) { toastError(e, '读不出来，稍后再试') }
  finally { loading.value = false }
}
let timer = 0
onMounted(async () => { await load(); revealCascade(grid.value, '.bento', 0.05); timer = window.setInterval(() => { if (!document.hidden) load() }, 60000) })
onBeforeUnmount(() => clearInterval(timer))
const KN: Record<string, string> = { user: '账号登录', admin: '管理后台', reg: '注册', reset: '找回密码' }
</script>

<template>
  <div class="page dashboard">
    <header class="page-head reveal">
      <div class="page-head-main">
        <span class="page-date">{{ dateStamp }}</span>
        <h1 class="page-title">{{ greeting }}，管理员</h1>
        <p class="page-desc">先看要处理的事，再看访问、登录和路由器的情况。每分钟自动刷新。</p>
      </div>
    </header>

    <div class="todo-row reveal">
      <button v-for="t in todo" :key="t.key" type="button" :class="['todo-card m-surface lift', t.value && 'is-hot']" @click="router.push(t.path)">
        <span class="todo-ico m-groove"><Icon :name="t.icon" :size="17" /></span>
        <span class="todo-main"><span class="todo-label">{{ t.label }}</span><span class="todo-sub">{{ t.sub }}</span></span>
        <b class="todo-num tnum">{{ t.value }}</b>
      </button>
    </div>

    <div ref="grid" class="bento-grid">
      <section class="bento bento-hero m-glow" @pointermove="trackGlow">
        <span class="glow-layer" aria-hidden="true" />
        <div class="hero-head">
          <SectionLabel title="官网访问" />
          <Segmented v-model="range" label="时间范围" :options="[{ label: '7 天', value: 7 }, { label: '30 天', value: 30 }]" />
        </div>
        <div class="hero-body">
          <div class="hero-figure">
            <Metric :value="ov ? pvTotal : null" unit="次" size="xl" />
            <div class="hero-delta">
              <DeltaPill :value="delta" :fresh="!prevTotal" label="较上一段同样长的时间" />
              <span class="faint">较上一段</span>
            </div>
            <dl class="hero-readouts">
              <div><dt>今天访问</dt><dd class="tnum">{{ today ? (today.n.pv || 0) - (today.n.bot || 0) : '—' }}</dd></div>
              <div><dt>今天访客</dt><dd class="tnum">{{ today?.uv ?? '—' }}</dd></div>
              <div><dt>机器人</dt><dd class="tnum">{{ today?.n.bot ?? 0 }}</dd></div>
            </dl>
          </div>
          <div class="hero-chart">
            <TrendChart :step="24" :values="pv" :labels="labels" :secondary="uv" secondary-label="访客" primary-label="访问" :height="212" unit=" 次" tone="ink" />
          </div>
        </div>
        <div class="hero-actions">
          <button type="button" class="pill-btn is-dark" @click="router.push('/visits')">访问统计和访客 IP <Icon name="arrowRight" :size="14" /></button>
          <button type="button" class="pill-btn" :disabled="loading" @click="load"><Icon name="refresh" :size="14" /> 刷新</button>
        </div>
      </section>

      <section class="bento bento-side">
        <div class="side-top"><span class="side-label">路由器 · 1 小时内在线</span><span class="side-ico m-groove"><Icon name="router" :size="16" /></span></div>
        <Metric :value="ov?.devices.online1h" unit="台" size="l" />
        <div class="side-foot"><span class="muted">共 {{ ov?.devices.total ?? '—' }} 台 · 24 小时内 {{ ov?.devices.online24h ?? '—' }} 台 · 本周新开通 {{ ov?.devices.new7 ?? 0 }}</span></div>
      </section>
      <section class="bento bento-side">
        <div class="side-top"><span class="side-label">账号</span><span class="side-ico m-groove"><Icon name="users" :size="16" /></span></div>
        <Metric :value="ov?.users.total" unit="个" size="l" />
        <div class="side-foot"><span class="muted">本周新注册 {{ ov?.users.new7 ?? 0 }} 个</span></div>
      </section>

      <section class="bento bento-third">
        <div class="bento-head"><SectionLabel title="登录次数" /><span class="bento-meta tnum">失败 {{ sum(loginFail) }} 次</span></div>
        <BarChart :step="18" :values="loginOk.map((v, i) => v + loginFail[i])" :failed="loginFail" :labels="labels.map((l, i) => (range === 30 && i % 5 ? '' : l))" :highlight="labels.length - 1" unit=" 次" />
      </section>
      <section class="bento bento-third bento-ring">
        <div class="bento-head"><SectionLabel title="登录成功率" /><span class="bento-meta">近 {{ range }} 天</span></div>
        <div class="ring-wrap">
          <TickRing :value="okRate" label="成功" :size="150" />
          <dl class="ring-readouts">
            <div><dt>24 小时内成功</dt><dd class="tnum">{{ ov?.logins.ok24 ?? '—' }}</dd></div>
            <div><dt>24 小时内失败</dt><dd class="tnum">{{ ov?.logins.fail24 ?? '—' }}</dd></div>
            <div><dt>不同 IP</dt><dd class="tnum">{{ ov?.logins.ips24 ?? '—' }}</dd></div>
          </dl>
        </div>
      </section>
      <section class="bento bento-third">
        <div class="bento-head"><SectionLabel title="访客来自" /><span class="bento-meta">近 {{ range }} 天</span></div>
        <ul v-if="countries.length" class="share-list">
          <li v-for="c in countries" :key="c.label" :class="`cat-${c.cat}`">
            <span class="share-label">{{ c.label }}</span>
            <span class="share-track"><i :style="{ width: `${c.w}%` }" /></span>
            <span class="share-value tnum">{{ c.value }}<small> · {{ c.pct }}%</small></span>
          </li>
        </ul>
        <EmptyState v-else-if="!loading" title="还没有访问数据" icon="globe" />
      </section>

      <section class="bento bento-half">
        <div class="bento-head"><SectionLabel title="最近登录" /><button type="button" class="pill-btn" @click="router.push('/logins')">登录记录 <Icon name="arrowRight" :size="14" /></button></div>
        <div class="activity-list">
          <div v-for="(a, i) in logins" :key="i" class="activity">
            <span class="activity-ico m-groove"><Icon :name="a.k === 'admin' ? 'shield' : 'user'" :size="15" /></span>
            <div class="activity-main">
              <div class="ellipsis"><b>{{ a.who }}</b> <span class="muted">{{ KN[a.k] }} · {{ a.why }}</span></div>
              <div class="faint mono-time">{{ a.ip || '—' }} · {{ a.place || '未知地点' }} · {{ ago(a.t) }}</div>
            </div>
            <Tag :tone="a.ok ? 'ok' : 'danger'" dot>{{ a.ok ? '成功' : '失败' }}</Tag>
          </div>
          <EmptyState v-if="!loading && !logins.length" title="还没有登录记录" icon="clock" />
        </div>
      </section>
      <section class="bento bento-half">
        <div class="bento-head"><SectionLabel title="今天" /><span class="bento-meta">{{ today?.d }}</span></div>
        <dl class="today-grid">
          <div><dt>新开通路由器</dt><dd class="tnum">{{ today?.n.dev_reg ?? 0 }}</dd></div>
          <div><dt>新注册账号</dt><dd class="tnum">{{ today?.n.reg ?? 0 }}</dd></div>
          <div><dt>收到反馈</dt><dd class="tnum">{{ (today?.n.fb ?? 0) + (today?.n.report ?? 0) }}</dd></div>
          <div><dt>安装失败上报</dt><dd class="tnum">{{ today?.n.install_fail ?? 0 }}</dd></div>
          <div><dt>收到对话消息</dt><dd class="tnum">{{ today?.n.chat_in ?? 0 }}</dd></div>
          <div><dt>你回复了</dt><dd class="tnum">{{ today?.n.chat_out ?? 0 }}</dd></div>
          <div><dt>发出邮件</dt><dd class="tnum">{{ today?.n.mail_ok ?? 0 }}<small v-if="today?.n.mail_fail" class="bad"> · 失败 {{ today.n.mail_fail }}</small></dd></div>
          <div><dt>出错</dt><dd :class="['tnum', today?.n.err && 'bad']">{{ today?.n.err ?? 0 }}</dd></div>
        </dl>
      </section>
    </div>
  </div>
</template>

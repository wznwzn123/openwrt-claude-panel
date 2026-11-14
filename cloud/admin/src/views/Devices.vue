<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import Tag from '@/components/ui/Tag.vue'
import TextInput from '@/components/ui/TextInput.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { get, post } from '@/api'
import { ask } from '@/composables/ask'
import { askDays } from '@/composables/days'
import { confirm } from '@/composables/confirm'
import { pushToast, toastError } from '@/composables/toast'
import { ago, day, vNewer } from '@/utils/fmt'

/* 路由器：开通了托管服务的每一台。封禁、加天数、备注、保护、删除先进回收站（30 天内能恢复） */
const devs = ref<any[]>([])
const st = ref<any>({ count: 0, max: 0 })
const trashDays = ref(30)
const latest = ref('')
const loading = ref(true)
const q = ref('')
const f = ref('all')
const live = (d: any) => d.state === 'ok' && d.offWhy !== 'deleted'
const FS: Record<string, { n: string; f: (d: any) => boolean }> = {
  all: { n: '全部', f: d => d.offWhy !== 'deleted' },
  trial: { n: '试用中', f: d => live(d) && d.exp && !d.renewed && !d.off },
  paid: { n: '续过期', f: d => live(d) && d.renewed },
  forever: { n: '不限期', f: d => live(d) && !d.exp },
  soon: { n: '7 天内到期', f: d => live(d) && d.exp && !d.off && d.exp - Date.now() < 7 * 864e5 },
  off: { n: '已停用', f: d => live(d) && d.off },
  idle: { n: '7 天没上线', f: d => live(d) && !d.off && Date.now() - (d.seen || d.created) > 7 * 864e5 },
  old: { n: '旧版本', f: d => live(d) && !!d.ver && !!latest.value && vNewer(latest.value, d.ver) },
  bin: { n: '回收站', f: d => d.offWhy === 'deleted' },
}
const hit = (d: any) => { const k = q.value.trim().toLowerCase(); return !k || [d.sub, d.name, d.model, d.anote].join(' ').toLowerCase().includes(k) }
const shown = computed(() => devs.value.filter(d => FS[f.value].f(d) && hit(d)).sort((a, b) => f.value === 'bin' ? (a.purgeAt || 0) - (b.purgeAt || 0) : (b.seen || 0) - (a.seen || 0)))
const online = computed(() => devs.value.filter(d => live(d) && d.seen && Date.now() - d.seen < 6 * 3600e3 + 600e3).length)
const vdist = computed(() => {
  const c: Record<string, number> = {}
  for (const d of devs.value.filter(live)) { const k = d.ver || '?'; c[k] = (c[k] || 0) + 1 }
  return Object.keys(c).sort((a, b) => (a === '?' ? 1 : b === '?' ? -1 : vNewer(a, b) ? -1 : 1)).map(k => ({ v: k, n: c[k], old: k !== '?' && !!latest.value && vNewer(latest.value, k) }))
})
const status = (d: any) => d.state !== 'ok' ? '开通中' : d.off ? (d.offWhy === 'exp' ? '已到期暂停' : '已封禁') : '最后上线 ' + ago(d.seen)
async function load() {
  try {
    const [r, v] = await Promise.all([get('devices'), fetch('/api/router/version', { cache: 'no-store' }).then(x => x.json()).catch(() => ({}))])
    devs.value = r.list; st.value = r; trashDays.value = r.trashDays || 30; latest.value = String(v.version || '')
  } catch (e) { toastError(e, '路由器列表读不出来') } finally { loading.value = false }
}
async function op(d: any, o: string) {
  const sub = d.sub, name = d.name || sub
  let body: any
  if (o === 'extend') {
    const n = await askDays({ title: `给「${name}」加天数`, who: sub + (d.anote ? ' · ' + d.anote : ''), cur: d.exp, want: 30, go: '加' }); if (!n) return
    try { const r = await post(`devices/${sub}/extend`, { days: n }); pushToast('已加 ' + n + ' 天，到期 ' + day(r.exp)); load() } catch (e) { toastError(e, '没加上') }
    return
  }
  if (o === 'note') {
    const v = await ask({ title: '备注', message: '给谁的、怎么联系、收了多少钱……只有你能看到。留空就是删掉。', input: { label: '备注', value: d.anote || '', multiline: true, maxlength: 300 }, confirmText: '保存' }); if (!v) return
    try { await post(`devices/${sub}/note`, { note: v.value }); pushToast(v.value ? '备注已保存' : '备注已删除'); load() } catch (e) { toastError(e, '没保存上') }
    return
  }
  if (o === 'delete' || o === 'purge') {
    const v = await ask({ title: (o === 'delete' ? '删除「' : '彻底删除「') + name + '」', message: o === 'delete' ? `先放进回收站：网址马上停用（家里上网不受影响），隧道和云端数据都留着，${trashDays.value} 天内可以一键恢复，之后自动彻底删除。会发邮件通知绑定的 ${(d.users || []).length} 个账号。` : '隧道、网址、云端数据（含备份）全部删掉，不能恢复。用户要用新邀请码重新开通（会收到邮件，写着怎么做）。', match: sub, matchLabel: '输入编号', confirmText: o === 'delete' ? '放进回收站' : '彻底删除', danger: true })
    if (!v) return
    body = { confirm: v.value.toLowerCase() }
  } else {
    const M: Record<string, string> = { off: `封禁后它的网址立刻打不开，推送和备份也停止。确定封禁 ${sub}？`, on: `解封 ${sub}？`, restore: `恢复 ${sub}？网址马上能用，用户什么都不用做。`, protect: `保护 ${sub}？受保护的路由器不能删除。`, unprotect: `取消保护 ${sub}？` }
    if (!(await confirm({ title: { off: '封禁', on: '解封', restore: '恢复', protect: '保护', unprotect: '取消保护' }[o] || o, message: M[o], confirmText: '确定', danger: o === 'off' }))) return
  }
  try {
    const r = await post(`devices/${sub}/${o}`, body)
    pushToast(o === 'delete' ? '已放进回收站，' + day(r.purgeAt) + ' 前可以恢复' + (r.mailed ? '，已发邮件通知' : '') : o === 'restore' ? '已恢复' + (r.mailed ? '，已发邮件通知' : '') : o === 'purge' ? '已彻底删除' + (r.mailed ? '，已发邮件通知' : '') : '好了')
    load()
  } catch (e) { toastError(e, '没成功') }
}
async function cleanup() {
  if (!(await confirm({ title: '清理不用的路由器', message: '把 90 天没上线的路由器放进回收站？（受保护的不动；30 天内能恢复，之后自动彻底删除）', confirmText: '清理' }))) return
  try { const r = await post('cleanup'); pushToast('处理了 ' + (r.removed?.length ?? 0) + ' 台'); load() } catch (e) { toastError(e, '没成功') }
}
onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader title="路由器" :desc="`开通了托管服务的路由器。已开通 ${st.count} / 名额 ${st.max} 台，6 小时内在线 ${online} 台。`">
      <Button icon="trash" @click="cleanup">清理 90 天没上线的</Button>
    </PageHeader>
    <div class="hub-stack">
      <div v-if="st.dnsFull" class="hub-note reveal" style="border: 1px solid var(--red); color: var(--red-text)"><b>Cloudflare 子域名名额满了</b>（{{ new Date(st.dnsFull.at).toLocaleString('zh-CN', { hour12: false }) }}，当时 {{ st.dnsFull.count }} 台）。新用户开通会提示「名额已满」：彻底删除不用的路由器，或者升级 Cloudflare 套餐。</div>
      <Panel class="reveal">
        <div class="hub-tools">
          <div class="hub-chips"><button v-for="(v, k) in FS" :key="k" type="button" :class="['hub-chip', f === k && 'is-on']" @click="f = k as string">{{ v.n }}<b>{{ devs.filter(v.f).length }}</b></button></div>
          <TextInput v-model="q" icon="search" placeholder="搜编号、名称、型号、备注" clearable />
        </div>
        <p v-if="vdist.length" class="hub-row-meta" style="margin: 0 0 6px">各版本：<template v-for="(x, i) in vdist" :key="x.v"><b :class="x.old && 'bad'">{{ x.v === '?' ? '版本未知' : 'v' + x.v }}</b> {{ x.n }} 台<template v-if="i < vdist.length - 1"> · </template></template><template v-if="latest"> · 最新 v{{ latest }}</template></p>
        <p v-if="f === 'bin'" class="hub-row-meta">回收站：网址已停用，隧道和数据都还在，随时可以恢复；到期自动彻底删除。</p>
        <div class="hub-list">
          <div v-for="d in shown" :key="d.sub" class="hub-row">
            <div class="hub-row-main">
              <div class="hub-row-title">{{ d.offWhy === 'deleted' ? '🗑 ' : '' }}{{ d.name || d.sub }} <code>{{ d.sub }}</code>
                <Tag v-if="d.prot" tone="ok">受保护</Tag>
                <Tag v-if="d.ver" :tone="latest && vNewer(latest, d.ver) ? 'danger' : 'neutral'">v{{ d.ver }}{{ latest && vNewer(latest, d.ver) ? ' · 旧版' : '' }}</Tag>
                <Tag v-if="d.off && d.offWhy !== 'deleted'" tone="danger" dot>{{ d.offWhy === 'exp' ? '到期暂停' : '已封禁' }}</Tag>
              </div>
              <div v-if="d.offWhy === 'deleted'" class="hub-row-meta">{{ day(d.delAt) }} {{ d.delWhy === 'idle' ? '因为 90 天没上线被放进回收站' : '删除' }} · <b class="bad">{{ day(d.purgeAt) }} 彻底删除</b> · {{ (d.users || []).length }} 个账号</div>
              <div v-else class="hub-row-meta">{{ status(d) }} · {{ d.exp ? '到期 ' + day(d.exp) : '不限期' }}{{ d.renewed ? ' · 续过期' : d.exp ? ' · 试用' : '' }} · {{ d.model || '未知型号' }} · {{ day(d.created) }} 开通 · {{ (d.users || []).length }} 个账号 · 邀请码 {{ d.invite || '—' }}</div>
              <div v-if="d.anote" class="hub-note">📝 {{ d.anote }}</div>
            </div>
            <div class="hub-row-acts">
              <template v-if="d.offWhy === 'deleted'"><Button size="sm" variant="primary" @click="op(d, 'restore')">恢复</Button><Button size="sm" variant="danger" @click="op(d, 'purge')">彻底删除</Button></template>
              <template v-else>
                <Button v-if="d.exp && d.state === 'ok'" size="sm" variant="primary" @click="op(d, 'extend')">加天数</Button>
                <Button size="sm" @click="op(d, 'note')">备注</Button>
                <Button size="sm" @click="op(d, d.off ? 'on' : 'off')">{{ d.off ? '解封' : '封禁' }}</Button>
                <Button size="sm" @click="op(d, d.protect ? 'unprotect' : 'protect')">{{ d.protect ? '取消保护' : '保护' }}</Button>
                <Button v-if="!d.prot" size="sm" variant="ghost" @click="op(d, 'delete')">删除</Button>
              </template>
            </div>
          </div>
          <EmptyState v-if="!loading && !shown.length" title="没有" icon="router" />
        </div>
      </Panel>
    </div>
  </div>
</template>

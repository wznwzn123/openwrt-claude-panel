<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import Switch from '@/components/ui/Switch.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { call, get, post } from '@/api'
import { pushToast, toastError } from '@/composables/toast'

/* 实时对话的提醒（5.0）：你不在线时自动回复一句；新消息发邮件、推送到手机（后台开着时不提醒） */
const cfg = ref<{ autoOn: boolean; autoText: string; mailOn: boolean; pushOn: boolean } | null>(null)
const subs = ref<Array<{ label: string; at: number; ok: number; err: number; end: string }>>([])
const vapid = ref('')
const hasMail = ref(true)
const text = ref('')
const busy = ref('')
const here = ref(false)
const canPush = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const isIOS = /iPhone|iPad/.test(navigator.userAgent)
const standalone = (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches

async function load() {
  try {
    const r = await get('v5cfg')
    cfg.value = r.cfg; subs.value = r.subs; vapid.value = r.vapid; hasMail.value = r.mail; text.value = r.cfg.autoText
    if (canPush) { const reg = await navigator.serviceWorker.getRegistration('/admin/'); const s = await reg?.pushManager.getSubscription(); here.value = !!s && r.subs.some((x: any) => s.endpoint.endsWith(x.end)) }
  } catch (e) { toastError(e, '读不出来') }
}
async function save(patch: Record<string, unknown>) {
  try { cfg.value = (await post('v5cfg', patch)).cfg; pushToast('已保存') } catch (e) { toastError(e, '没保存上') }
}
const b64u = (s: string) => { const p = '='.repeat((4 - (s.length % 4)) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)) }
const withTimeout = <T,>(p: Promise<T>, ms: number, msg: string) => Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error(msg)), ms))])
async function activeOf(reg: ServiceWorkerRegistration) {
  if (reg.active) return
  const w = reg.installing || reg.waiting
  if (!w) return
  await withTimeout(new Promise<void>((ok) => { const f = () => { if (w.state === 'activated') ok() }; w.addEventListener('statechange', f); f() }), 15000, '推送用的后台程序没装好，刷新一下再试')
}
async function enablePush() {
  if (!vapid.value) { pushToast('托管服务还没设置推送密钥（VAPID），推送用不了', 'danger'); return }
  busy.value = 'push'
  try {
    if ((await Notification.requestPermission()) !== 'granted') { pushToast('浏览器没允许通知：在浏览器的网站设置里允许通知再试', 'danger'); return }
    // 不等 navigator.serviceWorker.ready：后台网址是 /admin（不带 /）时它永远等不到，按钮就一直转圈。直接等这次注册的后台程序装好
    const reg = await navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' })
    await activeOf(reg)
    const old = await reg.pushManager.getSubscription()
    const sub = old || (await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(vapid.value) }), 20000, '连不上浏览器的推送服务，换个网络或者稍后再试'))
    const label = (/iPhone|iPad/.test(navigator.userAgent) ? '苹果' : /Android/.test(navigator.userAgent) ? '安卓' : /Mac/.test(navigator.userAgent) ? 'Mac' : /Windows/.test(navigator.userAgent) ? 'Windows' : '设备') + ' · ' + new Date().toLocaleDateString('zh-CN')
    await post('push/sub', { sub: sub.toJSON(), label })
    await post('push/test').catch(() => {})
    pushToast('这台设备会收到提醒了，刚发了一条测试推送')
    await load()
  } catch (e) { toastError(e, '没打开') } finally { busy.value = '' }
}
async function disablePush() {
  busy.value = 'push'
  try {
    const reg = await navigator.serviceWorker.getRegistration('/admin/'), s = await reg?.pushManager.getSubscription()
    if (s) { await call('DELETE', 'push/sub', { endpoint: s.endpoint }).catch(() => {}); await s.unsubscribe() }
    await load()
  } finally { busy.value = '' }
}
async function testPush() { busy.value = 'test'; try { await post('push/test'); pushToast('发了，几秒内手机上会弹出来') } catch (e) { toastError(e, '没有能收到的设备') } finally { busy.value = '' } }
onMounted(load)
</script>

<template>
  <Panel title="对话提醒" class="reveal">
    <template v-if="cfg">
      <div class="hub-row"><div class="hub-row-main"><div class="hub-row-title">你不在线时自动回复</div><div class="hub-row-meta">后台 3 分钟没开着就算不在线。用户发来消息时自动回一句，让对方知道有人会看；你回复之前只自动回一次。</div></div><div class="hub-row-acts"><Switch :model-value="cfg.autoOn" label="自动回复" @update:model-value="(v: boolean) => save({ autoOn: v })" /></div></div>
      <div v-if="cfg.autoOn" class="hub-form" style="grid-template-columns: minmax(0, 1fr) auto">
        <TextInput v-model="text" multiline :rows="2" :maxlength="300" placeholder="自动回复的话" />
        <Button :disabled="!text.trim() || text === cfg.autoText" @click="save({ autoText: text })">保存</Button>
      </div>
      <div class="hub-row"><div class="hub-row-main"><div class="hub-row-title">新消息发邮件给我</div><div class="hub-row-meta">你不在线时有人发消息，发到管理员邮箱{{ hasMail ? '' : '（还没设置 ADMIN_EMAIL，发不了）' }}；同一个对话 30 分钟内只发一封。</div></div><div class="hub-row-acts"><Switch :model-value="cfg.mailOn" label="邮件提醒" @update:model-value="(v: boolean) => save({ mailOn: v })" /></div></div>
      <div class="hub-row"><div class="hub-row-main"><div class="hub-row-title">新消息推送到手机</div><div class="hub-row-meta">在要收提醒的手机或电脑上打开这一页，点「在这台设备上接收」。{{ !canPush ? '这个浏览器不支持推送。' : isIOS && !standalone ? 'iPhone 要先在 Safari 里点「分享 → 添加到主屏幕」，再从主屏幕打开后台才能开。' : '' }}</div></div><div class="hub-row-acts"><Switch :model-value="cfg.pushOn" label="推送提醒" @update:model-value="(v: boolean) => save({ pushOn: v })" /></div></div>
      <div v-if="cfg.pushOn" class="hub-tools">
        <Button v-if="canPush && !here" icon="bell" :loading="busy === 'push'" @click="enablePush">在这台设备上接收</Button>
        <Button v-if="canPush && here" variant="ghost" :loading="busy === 'push'" @click="disablePush">这台设备不再接收</Button>
        <Button v-if="subs.length" variant="ghost" :loading="busy === 'test'" @click="testPush">发一条测试推送</Button>
        <span class="hub-row-meta">{{ subs.length ? `${subs.length} 台设备在接收：` + subs.map((s) => s.label + (s.err ? '（上次没送到）' : '')).join('、') : '还没有设备接收推送' }}</span>
      </div>
    </template>
    <p v-else class="hub-row-meta">读取中…</p>
  </Panel>
</template>

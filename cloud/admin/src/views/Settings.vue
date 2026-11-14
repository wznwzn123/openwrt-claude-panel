<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import Switch from '@/components/ui/Switch.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { get, post } from '@/api'
import { appearance } from '@/composables/appearance'
import { logout } from '@/composables/auth'
import { confirm } from '@/composables/confirm'
import { pushToast, toastError } from '@/composables/toast'

/* 设置与工具：提醒、外观、测试邮件、旧版管理页、退出 */
const router = useRouter()
const sound = ref(false)
const ping = ref<any>(null)
const mailBusy = ref(false)
try { sound.value = localStorage.getItem('hub.sound') === '1' } catch { /* 忽略 */ }
function setSound(v: boolean) { sound.value = v; try { localStorage.setItem('hub.sound', v ? '1' : '0') } catch { /* 忽略 */ } }
async function testMail() {
  mailBusy.value = true
  try { const r = await post('testmail'); pushToast('测试邮件已发到 ' + r.to + '，没收到的话看看垃圾箱') } catch (e) { toastError(e, '没发出去') } finally { mailBusy.value = false }
}
function openOld() { window.location.href = '/admin/old' }
async function out() {
  if (!(await confirm({ title: '退出登录', message: '退出以后要重新输入管理员密钥。', confirmText: '退出' }))) return
  await logout(); router.replace({ name: 'login' })
}
onMounted(async () => { try { ping.value = await (await fetch('/api/ping', { cache: 'no-store' })).json() } catch { /* 忽略 */ } })
</script>

<template>
  <div class="page">
    <PageHeader title="设置与工具" desc="这些设置只在这个浏览器里生效。" />
    <div class="hub-stack">
      <Panel title="提醒" class="reveal">
        <div class="hub-row"><div class="hub-row-main"><div class="hub-row-title">有新的对话消息时响一声</div><div class="hub-row-meta">后台开着时每 15 秒看一次有没有新消息；侧边栏和顶栏上会显示红色数字，不在对话页时还会弹个提示。</div></div><div class="hub-row-acts"><Switch :model-value="sound" label="提示音" @update:model-value="setSound" /></div></div>
      </Panel>
      <Panel title="外观" class="reveal">
        <div class="hub-row"><div class="hub-row-main"><div class="hub-row-title">深色 / 浅色</div><div class="hub-row-meta">跟随系统时，手机或电脑切到深色模式，这里也跟着变。</div></div><div class="hub-row-acts"><Segmented v-model="appearance.theme" label="外观" :options="[{ label: '跟随系统', value: 'auto' }, { label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }]" /></div></div>
      </Panel>
      <Panel title="邮件" class="reveal">
        <div class="hub-row"><div class="hub-row-main"><div class="hub-row-title">发一封测试邮件</div><div class="hub-row-meta">发到部署时设置的管理员邮箱（ADMIN_EMAIL），看看邮件服务通不通。{{ ping ? (ping.mail ? '邮件服务已设置。' : '还没设置邮件服务（RESEND_API_KEY）。') : '' }}结果会记到「邮件记录」里。</div></div><div class="hub-row-acts"><Button :loading="mailBusy" icon="mail" @click="testMail">发测试邮件</Button></div></div>
      </Panel>
      <Panel title="其他" class="reveal">
        <div class="hub-row"><div class="hub-row-main"><div class="hub-row-title">旧版管理页</div><div class="hub-row-meta">4.0 以前的单页管理页还保留着，功能一样，万一新版有问题可以先用它。</div></div><div class="hub-row-acts"><Button icon="arrowRight" @click="openOld">打开旧版</Button></div></div>
        <div class="hub-row"><div class="hub-row-main"><div class="hub-row-title">安全</div><div class="hub-row-meta">管理后台只加载本站自己的文件，不连任何第三方；密钥默认只存到关掉页面为止。同一个 IP 密钥错 10 次会被锁 15 分钟，每次输错都记在「登录记录」里。</div></div></div>
        <div class="hub-row"><div class="hub-row-main"><div class="hub-row-title">退出登录</div></div><div class="hub-row-acts"><Button variant="danger" icon="logout" @click="out">退出</Button></div></div>
      </Panel>
      <p class="hub-row-meta" style="text-align: center">界面基于开源项目 scaffold-master（MIT 许可）的前端设计改写</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import qrcode from 'qrcode-generator'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { adminKey, adminSess, get, post } from '@/api'
import { ask } from '@/composables/ask'
import { pushToast, toastError } from '@/composables/toast'

/* 两步验证（5.0，默认不开）：登录除了管理员密钥，还要手机验证码 App 里的 6 位数字。
   密钥万一泄露，别人没有你的手机也进不来 */
const on = ref(false)
const setup = ref<{ secret: string; uri: string; qr: string } | null>(null)
const code = ref('')
const busy = ref(false)
async function load() { try { on.value = (await get('v5cfg')).tfa } catch { /* 忽略 */ } }
async function begin() {
  busy.value = true
  try {
    const r = await post('2fa/begin')
    const q = qrcode(0, 'M'); q.addData(r.uri); q.make()
    setup.value = { secret: r.secret, uri: r.uri, qr: q.createDataURL(5, 2) }
  } catch (e) { toastError(e, '开不了') } finally { busy.value = false }
}
async function enable() {
  if (!/^\d{6}$/.test(code.value.trim())) { pushToast('输入验证码 App 里的 6 位数字', 'danger'); return }
  busy.value = true
  try {
    await post('2fa/enable', { code: code.value.trim() })
    // 这台浏览器直接换一张通行证，不用马上重新登录
    const r = await post<{ sess: string }>('login', { code: code.value.trim() })
    let remember = false; try { remember = !!localStorage.getItem('hub.adminKey') } catch { /* 忽略 */ }
    adminSess.set(r.sess || '', remember)
    on.value = true; setup.value = null; code.value = ''
    pushToast('两步验证打开了。以后登录要输验证码')
  } catch (e) { toastError(e, '没打开') } finally { busy.value = false }
}
async function disable() {
  const v = await ask({ title: '关闭两步验证', message: '关掉以后，只要有管理员密钥就能登录。', input: { label: '手机验证码 App 里的 6 位数字', numeric: true, required: '要输入验证码', maxlength: 6 }, confirmText: '关闭', danger: true })
  if (!v) return
  try { await post('2fa/disable', { code: v.value.trim() }); on.value = false; pushToast('两步验证关掉了') } catch (e) { toastError(e, '没关掉') }
}
async function copy(t: string) { try { await navigator.clipboard.writeText(t); pushToast('复制好了') } catch { pushToast('复制不了，手动选中复制', 'danger') } }
void adminKey
onMounted(load)
</script>

<template>
  <Panel title="两步验证" class="reveal">
    <div class="hub-row">
      <div class="hub-row-main">
        <div class="hub-row-title">{{ on ? '已开启' : '没开（默认）' }}</div>
        <div class="hub-row-meta">开了以后，登录后台除了管理员密钥，还要输入手机验证码 App（Google Authenticator、Microsoft Authenticator 都行）里的 6 位数字。密钥万一泄露，别人没有你的手机也进不来。登录一次管 12 小时。</div>
      </div>
      <div class="hub-row-acts">
        <Button v-if="!on && !setup" icon="shield" :loading="busy" @click="begin">开启两步验证</Button>
        <Button v-if="on" variant="ghost" @click="disable">关闭</Button>
      </div>
    </div>
    <div v-if="setup" class="tfa-setup">
      <img :src="setup.qr" alt="用验证码 App 扫这个二维码" class="tfa-qr">
      <div class="tfa-steps">
        <p><b>1.</b> 打开手机上的验证码 App，点「添加」，扫左边的二维码。扫不了的话选「输入密钥」，填这串：</p>
        <p class="tfa-secret"><code>{{ setup.secret.replace(/(.{4})/g, '$1 ').trim() }}</code> <Button size="sm" variant="ghost" icon="copy" @click="copy(setup.secret)">复制</Button></p>
        <p><b>2.</b> App 里会出现「路由器托管服务」，输入它现在显示的 6 位数字：</p>
        <div class="hub-tools"><TextInput v-model="code" inputmode="numeric" :maxlength="6" placeholder="6 位数字" @enter="enable" /><Button variant="primary" :loading="busy" @click="enable">确认开启</Button><Button variant="ghost" @click="setup = null">取消</Button></div>
        <p class="hub-row-meta">GitHub 里的「生成邀请码」「生成续期码」这些按钮也要用这串密钥：在仓库的 Settings → Secrets 里加一个，名字填 <code>HUB_TOTP_SECRET</code>，内容填上面这串，不然开启后它们会失败。</p>
      </div>
    </div>
  </Panel>
</template>

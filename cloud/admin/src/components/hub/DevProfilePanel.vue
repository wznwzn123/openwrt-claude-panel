<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { get, post } from '@/api'
import { pushToast, toastError } from '@/composables/toast'

/* 开发者的名字和头像（5.0.1）：用户在面板里「实时联系开发者」时，看到的是这个名字和头像 */
const name = ref('')
const avatar = ref('')
const busy = ref(false)
const file = ref<HTMLInputElement | null>(null)
const loaded = ref(false)

onMounted(async () => {
  try { const r = await get<{ name: string; avatar: string }>('devprofile'); name.value = r.name === '开发者' ? '' : r.name; avatar.value = r.avatar; loaded.value = true } catch (e) { toastError(e, '读不出来') }
})
// 裁成正方形、缩到 192×192、压缩（能用 webp 就用 webp）
function square(f: File): Promise<string> {
  return new Promise((ok, no) => {
    if (!/^image\//.test(f.type || '')) return no(new Error('只能选图片'))
    const r = new FileReader(), im = new Image()
    im.onload = () => {
      const S = 192, c = document.createElement('canvas'); c.width = c.height = S
      const g = c.getContext('2d')!, m = Math.min(im.naturalWidth, im.naturalHeight)
      g.fillStyle = '#131a17'; g.fillRect(0, 0, S, S)
      g.drawImage(im, (im.naturalWidth - m) / 2, (im.naturalHeight - m) / 2, m, m, 0, 0, S, S)
      let q = 0.86, d = c.toDataURL('image/webp', q)
      if (!d.startsWith('data:image/webp')) d = c.toDataURL('image/jpeg', q)
      while (d.length > 58000 && q > 0.4) { q -= 0.12; d = d.startsWith('data:image/webp') ? c.toDataURL('image/webp', q) : c.toDataURL('image/jpeg', q) }
      d.length > 58000 ? no(new Error('图片太复杂了，换一张试试')) : ok(d)
    }
    im.onerror = () => no(new Error('这张图片打不开'))
    r.onload = () => { im.src = String(r.result) }
    r.readAsDataURL(f)
  })
}
async function pick() {
  const f = file.value?.files?.[0]; if (file.value) file.value.value = ''
  if (!f) return
  try { avatar.value = await square(f) } catch (e: any) { pushToast(e.message, 'danger') }
}
async function save() {
  busy.value = true
  try { const r = await post<{ name: string; avatar: string }>('devprofile', { name: name.value, avatar: avatar.value }); avatar.value = r.avatar; pushToast('已保存：用户在面板的对话里会看到这个名字和头像') } catch (e) { toastError(e, '没保存上') } finally { busy.value = false }
}
</script>

<template>
  <Panel title="对话里的我（名字和头像）" class="reveal">
    <div class="hub-row dp-row">
      <button type="button" class="dp-av" :style="avatar ? { backgroundImage: `url(${avatar})` } : {}" aria-label="换头像" @click="file?.click()">{{ avatar ? '' : (name || '开发者').slice(0, 1) }}</button>
      <input ref="file" type="file" accept="image/*" hidden @change="pick">
      <div class="hub-row-main">
        <div class="hub-row-title">用户在面板「实时联系开发者」里看到的</div>
        <div class="hub-row-meta">不填名字就显示「开发者」。头像点左边的圆圈换，会裁成正方形并压缩。</div>
        <div class="dp-in"><TextInput v-model="name" placeholder="开发者" :maxlength="20" /></div>
      </div>
      <div class="hub-row-acts dp-acts">
        <Button v-if="avatar" variant="ghost" size="sm" @click="avatar = ''">不用头像</Button>
        <Button variant="primary" :loading="busy" :disabled="!loaded" @click="save">保存</Button>
      </div>
    </div>
  </Panel>
</template>

<style scoped>
.dp-row { align-items: center; }
.dp-av { width: 64px; height: 64px; flex: none; border-radius: 20px; border: 0; cursor: pointer; background: linear-gradient(135deg, #4ade80, #0ea5e9) center / cover no-repeat; color: #04140a; font-size: 26px; font-weight: 700; display: grid; place-items: center; box-shadow: 0 0 0 1px var(--line); }
.dp-in { margin-top: 10px; max-width: 280px; }
.dp-acts { display: flex; gap: 8px; }
@media (max-width: 640px) { .dp-row { flex-wrap: wrap; } .dp-acts { width: 100%; justify-content: flex-end; } }
</style>

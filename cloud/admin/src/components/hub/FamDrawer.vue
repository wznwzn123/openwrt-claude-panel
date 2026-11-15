<script setup lang="ts">
import { ref, watch } from 'vue'
import Drawer from '@/components/ui/Drawer.vue'
import Button from '@/components/ui/Button.vue'
import Tag from '@/components/ui/Tag.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import { get, post } from '@/api'
import { ask } from '@/composables/ask'
import { pushToast, toastError } from '@/composables/toast'
import { day } from '@/utils/fmt'

/* 一台路由器的「账号和权限」：主账号、子账号（家人）、没用掉的加入码。
   主账号丢了、家里有争议时由开发者处理；每次都要写原因，记进操作记录，双方都会收到邮件 */
const props = defineProps<{ sub: string; name?: string }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>()
const PERMS: Array<[string, string]> = [['msg', '反馈和联系开发者'], ['node', '切换节点'], ['speed', '测速'], ['parent', '家长控制'], ['proxy', '代理设置'], ['net', '网络设置'], ['sys', '系统操作']]
const TPL: Record<string, string> = { look: '只看', family: '家人', most: '几乎全部', custom: '自定义' }
const info = ref<any>(null)
const err = ref('')
const edit = ref<Record<string, Record<string, boolean>>>({})
async function load() {
  info.value = null; err.value = ''
  try {
    const r = await get(`fam/${props.sub}`)
    info.value = r
    const e: Record<string, Record<string, boolean>> = {}
    for (const s of r.subs || []) e[s.uid] = Object.fromEntries(PERMS.map(([k]) => [k, (s.perms || []).includes(k)]))
    edit.value = e
  } catch (x: any) { err.value = x?.message || '读不出来' }
}
watch(() => props.sub, (v) => { if (v) load() }, { immediate: true })
const why = async (title: string, message: string, danger = false, extra?: { label: string; value: boolean }) => {
  const v = await ask({ title, message, input: { label: '原因（会写进操作记录，也会写在发给用户的邮件里）', required: '要写一句原因', multiline: true, maxlength: 200 }, check: extra, confirmText: '确定', danger })
  return v && v.value.trim().length >= 2 ? v : null
}
async function setOwner(target?: any) {
  let body: any
  if (target) {
    const v = await why('把主账号换成 ' + target.email, '换了以后他权限最大，原来的主账号变成子账号（家人权限），原来主账号登录着的手机要从官网重新打开面板。', false, { label: '原来的主账号直接解绑（不留成子账号）', value: false })
    if (!v) return
    body = { target: target.uid, why: v.value, dropOld: v.check }
  } else {
    const e = await ask({ title: '把主账号换成别的账号', message: '填对方官网账号的登录邮箱（对方要先注册）。他会变成这台路由器的主账号。', input: { label: '新主账号的邮箱', placeholder: 'name@example.com', required: '要填邮箱' }, confirmText: '下一步' })
    if (!e) return
    const v = await why('把主账号换成 ' + e.value.trim(), '原来的主账号变成子账号（家人权限），原来主账号登录着的手机要从官网重新打开面板。', false, { label: '原来的主账号直接解绑（不留成子账号）', value: false })
    if (!v) return
    body = { email: e.value.trim(), why: v.value, dropOld: v.check }
  }
  try { await post(`fam/${props.sub}/owner`, body); pushToast('主账号换好了，已发邮件告诉双方'); emit('changed'); load() } catch (x) { toastError(x, '没换成') }
}
async function subOp(s: any, o: 'perms' | 'off' | 'on' | 'remove') {
  const T = { perms: '改 ' + s.email + ' 的权限', off: '停用 ' + s.email, on: '恢复 ' + s.email, remove: '移除 ' + s.email }[o]
  const M = { perms: '按上面勾选的保存。', off: '停用后他的手机马上打不开这台路由器的面板，恢复以后要从官网重新打开。', on: '恢复后他可以从官网重新打开面板。', remove: '移除后这台路由器从他的账号里去掉，他的手机马上打不开面板。' }[o]
  const v = await why(T, M, o === 'remove' || o === 'off')
  if (!v) return
  const body: any = { target: s.uid, why: v.value }
  if (o === 'perms') body.perms = PERMS.map(([k]) => k).filter((k) => edit.value[s.uid]?.[k])
  if (o === 'off' || o === 'on') body.off = o === 'off'
  if (o === 'remove') body.remove = true
  try { await post(`fam/${props.sub}/sub`, body); pushToast('好了'); emit('changed'); load() } catch (x) { toastError(x, '没成功') }
}
</script>

<template>
  <Drawer :open="!!sub" title="账号和权限" :sub="(name || sub) + ' · ' + sub" :width="560" @close="emit('close')">
    <div v-if="err" class="fd-empty bad">{{ err }}</div>
    <div v-else-if="!info" class="fd-empty">读取中…</div>
    <div v-else class="fd">
      <p class="fd-tip">一台路由器只有一个主账号（权限最大），最多 10 个子账号。改动都要写原因：记进操作记录，也会发邮件告诉相关的人。</p>
      <section class="fd-sec">
        <h4>主账号</h4>
        <div v-if="info.pick" class="fd-note">这台是老路由器，绑了 {{ info.users.length }} 个账号，还没选主账号。用户下次从官网打开面板时会让他们选；也可以直接在这里指定。</div>
        <div v-if="info.owner" class="fd-row">
          <span class="fd-av" :style="info.owner.avatar ? { backgroundImage: `url(${info.owner.avatar})` } : {}">{{ info.owner.avatar ? '' : (info.owner.name || '?').slice(0, 1).toUpperCase() }}</span>
          <div class="fd-who"><b>{{ info.owner.name }}</b><span>{{ info.owner.email }}</span></div>
          <Tag tone="ok">主账号</Tag>
        </div>
        <div v-else-if="!info.pick" class="fd-note">还没有账号绑定这台路由器。</div>
        <div v-if="info.pick" class="fd-list">
          <div v-for="u in info.users" :key="u.uid" class="fd-row">
            <span class="fd-av" :style="u.avatar ? { backgroundImage: `url(${u.avatar})` } : {}">{{ u.avatar ? '' : (u.name || '?').slice(0, 1).toUpperCase() }}</span>
            <div class="fd-who"><b>{{ u.name }}</b><span>{{ u.email }}</span></div>
            <Button size="sm" @click="setOwner(u)">设为主账号</Button>
          </div>
        </div>
        <div class="fd-acts"><Button size="sm" @click="setOwner()">{{ info.owner ? '换成别的账号' : '指定主账号' }}</Button></div>
      </section>
      <section class="fd-sec">
        <h4>子账号（{{ info.subs.length }} / 10）</h4>
        <p v-if="!info.subs.length" class="fd-empty sm">没有子账号</p>
        <div v-for="s in info.subs" :key="s.uid" class="fd-sub">
          <div class="fd-row">
            <span class="fd-av" :style="s.avatar ? { backgroundImage: `url(${s.avatar})` } : {}">{{ s.avatar ? '' : (s.name || '?').slice(0, 1).toUpperCase() }}</span>
            <div class="fd-who"><b>{{ s.name }}</b><span>{{ s.email }} · {{ day(s.at) }} 加入{{ s.exp ? ' · 到 ' + day(s.exp) : '' }}</span></div>
            <Tag :tone="s.off || s.expired ? 'danger' : 'neutral'">{{ s.off ? '已停用' : s.expired ? '已到期' : TPL[s.tpl] || '自定义' }}</Tag>
          </div>
          <div class="fd-perms">
            <Checkbox v-for="[k, n] in PERMS" :key="k" v-model="edit[s.uid][k]" :label="n" />
          </div>
          <div class="fd-acts">
            <Button size="sm" variant="primary" @click="subOp(s, 'perms')">保存权限</Button>
            <Button size="sm" @click="subOp(s, s.off ? 'on' : 'off')">{{ s.off ? '恢复' : '停用' }}</Button>
            <Button size="sm" @click="setOwner(s)">设为主账号</Button>
            <Button size="sm" variant="ghost" @click="subOp(s, 'remove')">移除</Button>
          </div>
        </div>
      </section>
      <section v-if="info.joins.length" class="fd-sec">
        <h4>还没用掉的加入码</h4>
        <ul class="fd-ul"><li v-for="j in info.joins" :key="j.code"><b class="mono">{{ j.code }}</b> 给「{{ j.name || '家人' }}」 · {{ TPL[j.tpl] || '自定义' }} · {{ day(j.exp) }} 过期</li></ul>
      </section>
    </div>
  </Drawer>
</template>

<style scoped>
.fd { display: grid; gap: 18px; }
.fd-tip { margin: 0; color: var(--text-2, var(--muted)); font-size: 13px; line-height: 1.6; }
.fd-sec h4 { margin: 0 0 10px; font-size: 14px; }
.fd-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.fd-who { flex: 1; min-width: 0; display: grid; }
.fd-who b { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fd-who span { font-size: 12.5px; color: var(--text-2, var(--muted)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fd-av { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; color: #fff; background: #22c55e center / cover no-repeat; }
.fd-list { display: grid; gap: 10px; margin-top: 10px; }
.fd-sub { padding: 12px; border-radius: 12px; border: 1px solid var(--line, rgba(127, 127, 127, .2)); display: grid; gap: 10px; }
.fd-sub + .fd-sub { margin-top: 10px; }
.fd-perms { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; }
.fd-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.fd-sub .fd-acts { margin-top: 0; }
.fd-note { padding: 10px 12px; border-radius: 10px; background: rgba(255, 159, 10, .12); font-size: 13px; line-height: 1.6; margin-bottom: 10px; }
.fd-empty { padding: 24px 0; text-align: center; color: var(--text-2, var(--muted)); }
.fd-empty.sm { padding: 4px 0; text-align: left; font-size: 13px; }
.fd-ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.8; }
@media (max-width: 480px) { .fd-perms { grid-template-columns: 1fr; } }
</style>

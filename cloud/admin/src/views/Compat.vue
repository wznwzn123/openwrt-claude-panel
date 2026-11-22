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
import { confirm } from '@/composables/confirm'
import { pushToast, toastError } from '@/composables/toast'
import { ago, day } from '@/utils/fmt'

/* 6.0 第 57–60 项：兼容情况。同一个问题（功能 + 原因）合并成一条，按型号列出影响多少台；终端里的安装失败上报一起归类。
   标「在 vX 修好了」：报过的路由器下次上报时推送到手机；安装失败的给认得出账号的人发邮件。尝鲜：报名的路由器在这里挑 */
const list = ref<any[]>([])
const vol = ref<any[]>([])
const routers = ref(0)
const loading = ref(true)
const q = ref('')
const f = ref<'open' | 'fixed' | 'beta'>('open')
const hit = (g: any) => { const k = q.value.trim().toLowerCase(); return !k || [g.title, g.why, ...g.models.map((m: any) => m.model), ...g.sys.map((s: any) => s.sys)].join(' ').toLowerCase().includes(k) }
const shown = computed(() => list.value.filter((g) => (f.value === 'fixed' ? !!g.fixed : !g.fixed) && hit(g)))
async function load() {
  try { const r = await get<any>('compat'); list.value = r.list; vol.value = r.volunteers; routers.value = r.routers } catch (e) { toastError(e, '读不出来') } finally { loading.value = false }
}
async function fix(g: any) {
  const v = await ask({ title: '标为修好了：' + g.title, message: `「${g.why}」——影响 ${g.n} 台。写上在哪个版本修好的：${g.src === 'install' ? '会给认得出账号的人发邮件，让他重新运行安装命令。' : '报过这个问题、版本比它旧的路由器，下次上报时会推送「更新到这个版本就好」。'}`, input: { label: '修好的版本（比如 6.0.1）', placeholder: '6.0.1', required: '要写版本号' }, confirmText: '下一步' })
  if (!v) return
  const n = await ask({ title: '一句话说明（会写进推送 / 邮件，可以不填）', input: { label: '说明', placeholder: '比如：压缩闪存剩 22 MB 就能装', maxlength: 200 }, confirmText: '标为修好了' })
  if (n === null || n === undefined) return
  try { const r = await post<any>('compat/fix', { key: g.key, ver: v.value.trim(), note: n ? n.value : '' }); pushToast(r.mailed ? `已标为修好，发了 ${r.mailed} 封邮件` : '已标为修好'); load() } catch (e) { toastError(e, '没成功') }
}
async function unfix(g: any) {
  if (!(await confirm({ title: '取消「修好了」', message: '改回没修好。已经推送过的不会撤回。', confirmText: '取消标记' }))) return
  try { await post('compat/fix', { key: g.key, ver: null }); load() } catch (e) { toastError(e, '没成功') }
}
async function beta(x: any, ok: boolean) {
  if (ok && !(await confirm({ title: '挑为尝鲜用户', message: `${x.model || '这台路由器'}（${x.sys || '?'}，现在 v${x.ver || '?'}）。GitHub 上有标成「预发布」的新版本时，这台路由器的「检查更新」里能装；随时能退回正式版。`, confirmText: '挑中' }))) return
  try { await post('compat/beta', { id: x.id, ok }); pushToast(ok ? '已挑中' : '已取消'); load() } catch (e) { toastError(e, '没成功') }
}
const models = (g: any) => g.models.slice(0, 6).map((m: any) => m.model + (m.n > 1 ? ' × ' + m.n : '')).join('、') + (g.models.length > 6 ? ` 等 ${g.models.length} 种` : '')
onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader title="兼容性" :desc="`路由器每天匿名报上来的「开不了的功能」和终端里的安装失败，同一个问题合并成一条。最近 90 天有 ${routers} 台路由器报过。公开的兼容性表在官网 /compat。`" />
    <Panel class="reveal">
      <div class="hub-tools">
        <div class="hub-chips">
          <button type="button" :class="['hub-chip', f === 'open' && 'is-on']" @click="f = 'open'">没修好<b>{{ list.filter((g) => !g.fixed).length }}</b></button>
          <button type="button" :class="['hub-chip', f === 'fixed' && 'is-on']" @click="f = 'fixed'">已修好<b>{{ list.filter((g) => g.fixed).length }}</b></button>
          <button type="button" :class="['hub-chip', f === 'beta' && 'is-on']" @click="f = 'beta'">尝鲜报名<b>{{ vol.length }}</b></button>
        </div>
        <TextInput v-if="f !== 'beta'" v-model="q" icon="search" placeholder="搜型号、功能、原因、系统" clearable />
      </div>
      <div v-if="f !== 'beta'" class="hub-list">
        <div v-for="g in shown" :key="g.key" class="hub-row">
          <div class="hub-row-main">
            <div class="hub-row-title">{{ g.title }}<Tag :tone="g.n >= 3 ? 'danger' : 'neutral'">{{ g.n }} 台</Tag><Tag v-if="g.src === 'install'" tone="info">安装失败上报</Tag><Tag v-if="g.fixed" tone="ok">v{{ g.fixed.ver }} 修好</Tag></div>
            <div class="hub-row-meta cp-why">{{ g.why }}</div>
            <div class="hub-row-meta">型号：{{ models(g) }}</div>
            <div class="hub-row-meta">系统：{{ g.sys.map((s: any) => s.sys + (s.n > 1 ? ' × ' + s.n : '')).join('、') }} · 面板版本 {{ g.vers.join('、') }} · 最近 {{ ago(g.last) }}（{{ day(g.first) }} 第一次）</div>
            <div v-if="g.fixed && g.fixed.note" class="hub-row-meta">说明：{{ g.fixed.note }}</div>
          </div>
          <div class="hub-row-acts">
            <Button v-if="!g.fixed" size="sm" variant="primary" @click="fix(g)">标为修好了</Button>
            <Button v-else size="sm" variant="ghost" @click="unfix(g)">取消标记</Button>
          </div>
        </div>
        <EmptyState v-if="!loading && !shown.length" :title="f === 'fixed' ? '还没有标过修好的' : '没有开不了的功能'" icon="check" />
      </div>
      <div v-else class="hub-list">
        <div v-for="x in vol" :key="x.id" class="hub-row">
          <div class="hub-row-main">
            <div class="hub-row-title">{{ x.model || '没认出型号' }}<Tag v-if="x.ok" tone="ok">已挑中</Tag></div>
            <div class="hub-row-meta">{{ x.sys || '?' }} · 现在 v{{ x.ver || '?' }} · {{ ago(x.at) }} 报名</div>
          </div>
          <div class="hub-row-acts">
            <Button v-if="!x.ok" size="sm" variant="primary" @click="beta(x, true)">挑中</Button>
            <Button v-else size="sm" variant="ghost" @click="beta(x, false)">取消</Button>
          </div>
        </div>
        <EmptyState v-if="!loading && !vol.length" title="还没有人报名尝鲜" icon="users" />
        <p class="hub-row-meta" style="margin:14px 2px 0">发尝鲜版：GitHub Actions「发布」时勾上「先发给尝鲜用户」（标成预发布）。觉得没问题了，在 GitHub 上把「预发布」去掉，就变成正式版推给所有人。</p>
      </div>
    </Panel>
  </div>
</template>

<style scoped>
.cp-why { color: var(--text, inherit); white-space: pre-wrap; overflow-wrap: anywhere; }
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import Tag from '@/components/ui/Tag.vue'
import TextInput from '@/components/ui/TextInput.vue'
import FilterBar from '@/components/ui/FilterBar.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { get, post } from '@/api'
import { ask } from '@/composables/ask'
import { confirm } from '@/composables/confirm'
import { pushToast, toastError } from '@/composables/toast'
import { ago, day } from '@/utils/fmt'

/* 6.0 第 57–60 项：兼容情况。同一个问题（功能 + 原因）合并成一条，按型号列出影响多少台；终端里的安装失败上报一起归类。
   标「在 vX 修好了」：报过的路由器下次上报时推送到手机；安装失败的给认得出账号的人发邮件。
   第 95 项尝鲜申请：同意 / 拒绝；撤销这台或这个申请人的全部设备（撤销后要重新申请）。只看匿名信息，申请人只显示匿名编号 */
const list = ref<any[]>([])
const vol = ref<any[]>([])
const routers = ref(0)
const loading = ref(true)
const q = ref('')
const f = ref<'open' | 'fixed' | 'beta'>('open')
const bf = ref<'wait' | 'ok' | 'end'>('wait')
const BST: Record<string, string> = { wait: '等审核', ok: '已通过', no: '没通过', rev: '已撤销' }
const bShown = computed(() => vol.value.filter((x) => (bf.value === 'end' ? x.st === 'no' || x.st === 'rev' : x.st === bf.value)))
const capTxt = (c: any) => Object.entries(c || {}).map(([k, v]) => k + '=' + v).join(' ')
const mb = (k: number) => (k >= 1024 ? Math.round(k / 1024) + ' MB' : k + ' KB')
const hit = (g: any) => { const k = q.value.trim().toLowerCase(); return !k || [g.title, g.why, ...g.models.map((m: any) => m.model), ...g.sys.map((s: any) => s.sys)].join(' ').toLowerCase().includes(k) }
const shown = computed(() => list.value.filter((g) => (f.value === 'fixed' ? !!g.fixed : !g.fixed) && hit(g)))
async function load() {
  try { const r = await get<any>('compat'); list.value = r.list; vol.value = r.volunteers; routers.value = r.routers } catch (e) { toastError(e, '读不出来') } finally { loading.value = false }
}
async function fix(g: any) {
  const v = await ask({ title: '标为修好了：' + g.title, message: `「${g.why}」——影响 ${g.n} 台。写上在哪个版本修好的：${g.src === 'install' ? '会给认得出账号的人发邮件，让他重新运行安装命令。' : '报过这个问题、版本比它旧的路由器，下次上报时会推送「更新到这个版本就好」。'}`, input: { label: '修好的版本（比如 6.0.1）', placeholder: '6.0.1', required: '要写版本号' }, confirmText: '下一步' })
  if (!v) return
  const n = await ask({ title: '一句话说明（会写进推送 / 邮件，选填）', input: { label: '说明', placeholder: '比如：压缩闪存剩 22 MB 就能装', maxlength: 200 }, confirmText: '标为修好了' })
  if (n === null || n === undefined) return
  try { const r = await post<any>('compat/fix', { key: g.key, ver: v.value.trim(), note: n ? n.value : '' }); pushToast(r.mailed ? `已标为修好，发了 ${r.mailed} 封邮件` : '已标为修好'); load() } catch (e) { toastError(e, '没成功') }
}
async function unfix(g: any) {
  if (!(await confirm({ title: '取消「修好了」', message: '改回没修好。已经推送过的不会撤回。', confirmText: '取消标记' }))) return
  try { await post('compat/fix', { key: g.key, ver: null }); load() } catch (e) { toastError(e, '没成功') }
}
async function beta(x: any, act: 'ok' | 'no' | 'rev' | 'revp') {
  const who = x.pid ? '申请人 ' + x.pid.slice(0, 4) : '这个申请人'
  const C = {
    ok: { title: '同意尝鲜申请', message: `${x.model || '这台路由器'}：有预发布版本时，它的「检查更新」里能装。会通知申请人。`, confirmText: '同意' },
    no: { title: '拒绝尝鲜申请', message: '会通知申请人，他可以重新申请。', confirmText: '拒绝', danger: true },
    rev: { title: '撤销这台设备', message: `${x.model || '这台路由器'}以后收不到尝鲜版，已装的照常能用。会通知申请人，要重新申请。`, confirmText: '撤销这台', danger: true },
    revp: { title: '撤销' + who + '的全部设备', message: `${who}名下 ${x.pidN} 台在用或等审核的都撤销。会通知申请人，每台都要重新申请。`, confirmText: '全部撤销', danger: true },
  }[act]
  if (!(await confirm(C))) return
  try { const r = await post<any>('compat/beta', { id: x.id, act }); pushToast({ ok: '已同意', no: '已拒绝', rev: '已撤销', revp: `已撤销 ${r.n} 台` }[act]); load() } catch (e) { toastError(e, '没成功') }
}
const models = (g: any) => g.models.slice(0, 6).map((m: any) => m.model + (m.n > 1 ? ' × ' + m.n : '')).join('、') + (g.models.length > 6 ? ` 等 ${g.models.length} 种` : '')
onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader title="兼容性" :desc="`路由器每天匿名报上来的「开不了的功能」和终端里的安装失败，同一个问题合并成一条。最近 90 天有 ${routers} 台路由器报过。公开的兼容性表在官网 /compat。`" />
    <Panel class="reveal">
      <FilterBar v-model="f" :items="[{ k: 'open', n: '没修好', c: list.filter((g) => !g.fixed).length }, { k: 'fixed', n: '已修好', c: list.filter((g) => g.fixed).length }, { k: 'beta', n: '尝鲜申请', c: vol.filter((x) => x.st === 'wait').length }]" label="兼容性筛选" style="margin-bottom: 12px">
        <TextInput v-if="f !== 'beta'" v-model="q" icon="search" placeholder="搜型号、功能、原因、系统" clearable />
      </FilterBar>
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
        <FilterBar v-model="bf" :items="[{ k: 'wait', n: '等审核', c: vol.filter((x) => x.st === 'wait').length }, { k: 'ok', n: '已通过', c: vol.filter((x) => x.st === 'ok').length }, { k: 'end', n: '拒绝和撤销', c: vol.filter((x) => x.st === 'no' || x.st === 'rev').length }]" label="尝鲜申请筛选" style="margin: 0 0 10px" />
        <div v-for="x in bShown" :key="x.id" class="hub-row">
          <div class="hub-row-main">
            <div class="hub-row-title">{{ x.model || '没认出型号' }}<Tag :tone="x.st === 'ok' ? 'ok' : x.st === 'wait' ? 'info' : 'neutral'">{{ BST[x.st] }}</Tag><Tag tone="neutral">{{ x.hosted ? '托管版' : '自建版' }}</Tag></div>
            <div class="hub-row-meta">申请人 {{ x.pid ? x.pid.slice(0, 4) : '（老的报名）' }}<template v-if="x.pidN > 1"> · 共 {{ x.pidN }} 台</template> · {{ ago(x.at) }}申请<template v-if="x.dec"> · {{ ago(x.dec) }}{{ BST[x.st] }}</template></div>
            <div v-if="x.note" class="hub-row-meta cp-why">留言：{{ x.note }}</div>
            <div class="hub-row-meta">{{ x.sys || '?' }}{{ x.kernel ? ' · 内核 ' + x.kernel : '' }}{{ x.plat ? ' · ' + x.plat : '' }}</div>
            <div class="hub-row-meta">面板 v{{ x.ver || '?' }}{{ x.code ? '（' + x.code + '）' : '' }} · 内存 {{ x.mem ? x.mem + ' MB' : '?' }} · 闪存剩 {{ x.flash ? mb(x.flash) : '?' }} · 最近上报 {{ ago(x.last) }}</div>
            <div v-if="capTxt(x.caps)" class="hub-row-meta cp-cap">{{ capTxt(x.caps) }}</div>
            <div v-for="y in x.fails" :key="y.f + y.why" class="hub-row-meta cp-why">开不了：{{ y.title }}，{{ y.why }}</div>
          </div>
          <div class="hub-row-acts">
            <template v-if="x.st === 'wait'"><Button size="sm" variant="primary" @click="beta(x, 'ok')">同意</Button><Button size="sm" variant="ghost" @click="beta(x, 'no')">拒绝</Button></template>
            <Button v-if="x.st === 'ok'" size="sm" variant="ghost" @click="beta(x, 'rev')">撤销这台</Button>
            <Button v-if="(x.st === 'ok' || x.st === 'wait') && x.pid" size="sm" variant="ghost" @click="beta(x, 'revp')">撤销此人</Button>
            <Button v-if="x.st === 'no' || x.st === 'rev'" size="sm" variant="ghost" @click="beta(x, 'ok')">直接同意</Button>
          </div>
        </div>
        <EmptyState v-if="!loading && !bShown.length" :title="bf === 'wait' ? '没有等审核的申请' : bf === 'ok' ? '还没有通过的' : '没有拒绝或撤销的'" icon="users" />
        <p class="hub-row-meta" style="margin:14px 2px 0">发尝鲜版：GitHub Actions「发布」时勾上「先发给尝鲜用户」（标成预发布）。没问题了，在 GitHub 上去掉「预发布」，就推给所有人。</p>
      </div>
    </Panel>
  </div>
</template>

<style scoped>
.cp-why { color: var(--text, inherit); white-space: pre-wrap; overflow-wrap: anywhere; }
.cp-cap { font-family: var(--mono, ui-monospace, monospace); font-size: 12px; overflow-wrap: anywhere; }
</style>

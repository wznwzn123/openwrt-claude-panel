<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import { download, get, post } from '@/api'
import { ask } from '@/composables/ask'
import { pushToast, toastError } from '@/composables/toast'
import { full } from '@/utils/fmt'

/* 数据备份（5.0）：每天自动把全部数据（账号、路由器、反馈、对话、公告、统计、日志）存一份到另一个独立的存储，留 7 天；
   可以手动备份、下载、恢复到某一份；也可以把现在的全部数据导出到自己电脑上 */
const list = ref<Array<{ id: string; at: number; n: number; size: number; why: string }>>([])
const busy = ref('')
const kb = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')
async function load() { try { list.value = (await get('backups')).list } catch (e) { toastError(e, '读不出来') } }
async function now() { busy.value = 'now'; try { await post('backups/now'); pushToast('备份好了'); await load() } catch (e) { toastError(e, '没备份上') } finally { busy.value = '' } }
async function exportAll() { busy.value = 'export'; try { await download('export', 'hub-export.json.gz') } catch (e) { toastError(e, '没导出来') } finally { busy.value = '' } }
async function dl(id: string) { busy.value = 'dl' + id; try { await download('backups/' + id + '/download', 'hub-backup-' + id + '.json.gz') } catch (e) { toastError(e, '没下载下来') } finally { busy.value = '' } }
async function restore(b: { id: string; at: number }) {
  const v = await ask({ title: '恢复到这份备份', message: `所有数据（账号、路由器、反馈、对话、公告、统计）会变回 ${full(b.at)} 的样子，这之后的改动都会没了。恢复前会自动先把现在的数据也存一份，万一恢复错了还能回来。`, match: b.id, matchLabel: `输入备份编号 ${b.id} 确认`, confirmText: '恢复', danger: true })
  if (!v) return
  busy.value = 'r' + b.id
  try { const r = await post('backups/' + b.id + '/restore', { confirm: b.id }); pushToast(`恢复好了（${r.n} 项数据）`); await load() } catch (e) { toastError(e, '没恢复') } finally { busy.value = '' }
}
onMounted(load)
</script>

<template>
  <Panel title="数据备份" :meta="list.length ? list.length + ' 份' : ''" class="reveal">
    <div class="hub-row">
      <div class="hub-row-main">
        <div class="hub-row-title">每天自动备份</div>
        <div class="hub-row-meta">每天把全部数据（账号、路由器、反馈、对话和图片、公告、统计、各种记录）存一份到另一个独立的存储里，留最近 7 天。误删了东西、数据出了问题，可以恢复到某一天。也可以随时导出一份存到自己电脑上。</div>
      </div>
      <div class="hub-row-acts">
        <Button :loading="busy === 'now'" icon="restore" @click="now">现在备份一份</Button>
        <Button :loading="busy === 'export'" icon="download" @click="exportAll">导出全部数据</Button>
      </div>
    </div>
    <div v-if="list.length" class="hub-list">
      <div v-for="b in list" :key="b.id" class="hub-row">
        <div class="hub-row-main">
          <div class="hub-row-title">{{ full(b.at) }} <span class="hub-row-meta">· {{ b.why }}</span></div>
          <div class="hub-row-meta">编号 <span class="mono">{{ b.id }}</span> · {{ b.n }} 项数据 · 压缩后 {{ kb(b.size) }}</div>
        </div>
        <div class="hub-row-acts">
          <Button size="sm" variant="ghost" icon="download" :loading="busy === 'dl' + b.id" @click="dl(b.id)">下载</Button>
          <Button size="sm" variant="ghost" :loading="busy === 'r' + b.id" @click="restore(b)">恢复到这一份</Button>
        </div>
      </div>
    </div>
    <p v-else class="hub-row-meta">还没有备份：每天第一次整点检查时会自动备份，也可以点上面「现在备份一份」。</p>
  </Panel>
</template>

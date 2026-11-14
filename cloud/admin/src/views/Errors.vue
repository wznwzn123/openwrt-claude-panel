<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { get } from '@/api'
import { toastError } from '@/composables/toast'
import { full } from '@/utils/fmt'

/* 出错记录：官网和托管服务的接口出错时记下地址和原因（最近 300 条），方便查问题 */
const all = ref<any[]>([])
const loading = ref(true)
onMounted(async () => { try { all.value = (await get('errors')).list } catch (e) { toastError(e, '出错记录读不出来') } finally { loading.value = false } })
</script>

<template>
  <div class="page">
    <PageHeader title="出错记录" desc="官网和托管服务的接口出错时，记下是哪个地址、出了什么错（最近 300 条）。用户那边只会看到「出错了，稍后再试」，不会看到细节。" />
    <Panel class="reveal">
      <div class="hub-list">
        <div v-for="(e, i) in all" :key="i" class="hub-row">
          <div class="hub-row-main">
            <div class="hub-row-title"><code>{{ e.path }}</code></div>
            <div class="hub-row-meta">{{ full(e.t) }}</div>
            <pre class="log-pre" style="max-height: 180px">{{ e.msg }}</pre>
          </div>
        </div>
        <EmptyState v-if="!loading && !all.length" title="没有出错记录" desc="一切正常" icon="check" />
      </div>
    </Panel>
  </div>
</template>

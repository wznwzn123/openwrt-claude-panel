<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { fmtSize, type UpFile } from '@/composables/upload'

/* 消息、反馈、公告里的文件：图片、视频、音频直接显示；其他的是可以点的文件卡片（都能下载） */
defineProps<{ files?: UpFile[] }>()
const dl = (u?: string) => (u ? u + '&dl=1' : undefined)
</script>

<template>
  <div v-if="files && files.length" class="fl">
    <template v-for="f in files" :key="f.id">
      <template v-if="f.url && f.k === 'img'"><a :href="f.url" target="_blank" rel="noopener"><img :src="f.url" :alt="f.name" loading="lazy"></a><a class="fl-cap" :href="dl(f.url)" target="_blank" rel="noopener">{{ f.name }} · 下载</a></template>
      <template v-else-if="f.url && f.k === 'video'"><video :src="f.url" controls preload="metadata" playsinline /><a class="fl-cap" :href="dl(f.url)" target="_blank" rel="noopener">{{ f.name }} · {{ fmtSize(f.size) }} · 下载</a></template>
      <template v-else-if="f.url && f.k === 'audio'"><audio :src="f.url" controls preload="none" /><a class="fl-cap" :href="dl(f.url)" target="_blank" rel="noopener">{{ f.name }} · 下载</a></template>
      <a v-else class="fl-ff" :href="dl(f.url)" target="_blank" rel="noopener"><Icon name="file" :size="20" /><span><b>{{ f.name }}</b><small>{{ fmtSize(f.size) }}{{ f.url ? ' · 点一下下载' : '' }}</small></span></a>
    </template>
  </div>
</template>

<style scoped>
.fl { display: flex; flex-direction: column; gap: 6px; margin: 2px 0; }
.fl img, .fl video { display: block; max-width: min(300px, 70vw); max-height: 320px; border-radius: 10px; background: rgba(127, 127, 127, .12); }
.fl audio { max-width: min(300px, 70vw); }
.fl-cap { font-size: 12px; opacity: .75; color: inherit; }
.fl-ff { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: rgba(127, 127, 127, .12); color: inherit; text-decoration: none; max-width: min(300px, 70vw); min-width: 0; }
.fl-ff span { min-width: 0; }
.fl-ff b { display: block; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fl-ff small { display: block; font-size: 12px; opacity: .7; }
</style>

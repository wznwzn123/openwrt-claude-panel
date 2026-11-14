<script setup lang="ts">
import ToastHost from '@/components/ui/ToastHost.vue'
import ConfirmHost from '@/components/ui/ConfirmHost.vue'
import AskHost from '@/components/ui/AskHost.vue'
</script>

<template>
  <router-view />
  <ToastHost />
  <ConfirmHost />
  <AskHost />
  <div class="grain-layer" aria-hidden="true" />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import Modal from './Modal.vue'
import Button from './Button.vue'
import TextInput from './TextInput.vue'
import Checkbox from './Checkbox.vue'
import { pendingAsk, settleAsk } from '@/composables/ask'

const state = shallowRef(pendingAsk.value)
const val = ref('')
const chk = ref(false)
const err = ref('')
watch(pendingAsk, (p) => {
  if (!p) return
  state.value = p
  val.value = p.input?.value ?? ''
  chk.value = !!p.check?.value
  err.value = ''
  nextTick(() => (document.querySelector('.ask-modal input, .ask-modal textarea') as HTMLElement | null)?.focus())
})
const prev = computed(() => state.value?.preview?.(val.value) ?? null)
const blocked = computed(() => {
  const s = state.value
  if (!s) return true
  if (s.match && val.value.trim().toLowerCase() !== s.match.toLowerCase()) return true
  if (prev.value && !prev.value.ok) return true
  return false
})
function go() {
  const s = state.value
  if (!s || blocked.value) return
  if (s.input?.required && !val.value.trim()) { err.value = s.input.required; return }
  settleAsk({ value: val.value.trim(), check: chk.value })
}
</script>

<template>
  <Modal :open="Boolean(pendingAsk)" :title="state?.title" :width="480" close-on-overlay @close="settleAsk(null)">
    <div class="ask-modal" style="display: grid; gap: 12px">
      <p v-if="state?.message" class="confirm-text" style="margin: 0; white-space: pre-line">{{ state.message }}</p>
      <div v-if="state?.chips?.length" style="display: flex; flex-wrap: wrap; gap: 8px">
        <Button v-for="c in state.chips" :key="c.value" size="sm" :variant="val === c.value ? 'primary' : 'secondary'" @click="val = c.value">{{ c.label }}</Button>
      </div>
      <label v-if="state?.input || state?.match" class="field" style="margin: 0">
        <span class="field-label">{{ state?.match ? (state.matchLabel || '输入') + ' ' + state.match + ' 确认' : state?.input?.label }}</span>
        <TextInput
          v-model="val"
          :placeholder="state?.match || state?.input?.placeholder"
          :multiline="state?.input?.multiline"
          :rows="4"
          :maxlength="state?.input?.maxlength ?? 2000"
          autocomplete="off"
          @enter="go()"
          @update:model-value="err = ''"
        />
        <span v-if="err" class="field-error" role="alert">{{ err }}</span>
      </label>
      <p v-if="prev" :class="['field-hint', !prev.ok && 'is-bad']" style="margin: 0" :style="!prev.ok ? 'color: var(--red-text)' : ''">{{ prev.text }}</p>
      <Checkbox v-if="state?.check" v-model="chk" :label="state.check.label" :disabled="state.check.disabled" />
    </div>
    <template #footer>
      <Button variant="ghost" @click="settleAsk(null)">取消</Button>
      <Button :variant="state?.danger ? 'danger' : 'primary'" :disabled="blocked" @click="go">{{ state?.confirmText ?? '确定' }}</Button>
    </template>
  </Modal>
</template>

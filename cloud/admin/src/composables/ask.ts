import { shallowRef } from 'vue'

/* 带输入的确认框：填备注、写原因、选天数、输入编号确认删除……由 AskHost 统一渲染。
   const v = await ask({ title, ... })；取消返回 null */
export interface AskOptions {
  title: string
  message?: string
  /** 输入框；不给就只是确认 */
  input?: { label?: string; placeholder?: string; value?: string; multiline?: boolean; required?: string; maxlength?: number; numeric?: boolean }
  /** 要求把这个字打一遍才能点（防误删） */
  match?: string
  matchLabel?: string
  /** 快捷选项（比如天数），点了填进输入框 */
  chips?: Array<{ label: string; value: string }>
  /** 输入框下面的实时说明（比如新的到期时间）；返回 '' 表示还不能确定 */
  preview?: (v: string) => { text: string; ok: boolean }
  /** 勾选项（比如「发邮件告诉对方」） */
  check?: { label: string; value: boolean; disabled?: boolean }
  confirmText?: string
  danger?: boolean
}
export interface AskResult { value: string; check: boolean }
interface Pending extends AskOptions { resolve: (v: AskResult | null) => void }
export const pendingAsk = shallowRef<Pending | null>(null)
export function ask(o: AskOptions): Promise<AskResult | null> {
  pendingAsk.value?.resolve(null)
  return new Promise(resolve => { pendingAsk.value = { ...o, resolve } })
}
export function settleAsk(v: AskResult | null) {
  const p = pendingAsk.value
  pendingAsk.value = null
  p?.resolve(v)
}

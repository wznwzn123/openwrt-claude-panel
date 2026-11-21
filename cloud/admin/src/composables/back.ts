import { onBeforeUnmount, watch, type WatchSource } from 'vue'

/* 6.0 第 68 项：手机侧滑、返回键、电脑后退键——开着弹窗 / 抽屉 / 手机菜单时先关最上面那个，不离开这一页；
   表单弹窗（点遮罩不关的那种）里可能有没保存的内容，不直接关，提示先保存或点「取消」。
   做法：记下最近一次「按返回」的时间；路由守卫看到这次跳转是按返回引起的、而且开着弹窗，就关弹窗并取消跳转（路由会把地址退回去） */
type Layer = { close: () => void; form: () => boolean }
const layers: Layer[] = []
let popAt = -1e9
// 要在路由之前登记（router/index.ts 最先引入本文件），这样路由处理返回之前时间已经记上
if (typeof window !== 'undefined') window.addEventListener('popstate', () => { popAt = performance.now() })

export function useBackLayer(open: WatchSource<boolean>, close: () => void, form: () => boolean = () => false) {
  const me: Layer = { close, form }
  const drop = () => { const i = layers.indexOf(me); if (i >= 0) layers.splice(i, 1) }
  watch(open, (v) => { drop(); if (v) layers.push(me) }, { immediate: true })
  onBeforeUnmount(drop)
}

/** 路由守卫里调：'closed' 关掉了最上面的弹窗；'form' 是表单弹窗，没关；null 不是按返回，或者没开弹窗 */
export function backLayer(): 'closed' | 'form' | null {
  if (!layers.length || performance.now() - popAt > 800) return null
  popAt = -1e9
  const top = layers[layers.length - 1]
  if (top.form()) return 'form'
  top.close()
  return 'closed'
}

export const backLayerCount = () => layers.length

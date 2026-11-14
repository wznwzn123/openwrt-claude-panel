import { ref } from 'vue'
import { adminKey, adminSess, call, get } from '@/api'
import type { NavGroup } from '@/data'

/* ============================================================
   登录态：只有一个管理员密钥。菜单是固定的，按区分类。
   ============================================================ */
export const authed = ref<boolean>(!!adminKey.get())
export const currentUser = ref({ nickname: '管理员', username: 'admin' })

export const navGroups = ref<NavGroup[]>([
  { key: 'g-home', label: '概览', icon: 'dashboard', single: true, items: [{ key: 'dashboard', label: '工作台', icon: 'dashboard', path: '/dashboard' }] },
  { key: 'g-msg', label: '消息与反馈', icon: 'chat', items: [
    { key: 'chat', label: '实时对话', icon: 'chat', path: '/chat' },
    { key: 'feedback', label: '问题反馈', icon: 'inbox', path: '/feedback' },
    { key: 'ann', label: '公告', icon: 'megaphone', path: '/ann' },
  ] },
  { key: 'g-dev', label: '用户与路由器', icon: 'router', items: [
    { key: 'devices', label: '路由器', icon: 'router', path: '/devices' },
    { key: 'users', label: '账号', icon: 'users', path: '/users' },
  ] },
  { key: 'g-svc', label: '开通与续期', icon: 'ticket', items: [
    { key: 'applications', label: '续期申请', icon: 'mail', path: '/applications' },
    { key: 'invites', label: '邀请码', icon: 'ticket', path: '/invites' },
    { key: 'renewals', label: '续期码', icon: 'key', path: '/renewals' },
  ] },
  { key: 'g-stat', label: '统计与日志', icon: 'chart', items: [
    { key: 'visits', label: '访问统计', icon: 'globe', path: '/visits' },
    { key: 'logins', label: '登录记录', icon: 'lock', path: '/logins' },
    { key: 'oplog', label: '操作记录', icon: 'log', path: '/oplog' },
    { key: 'mails', label: '邮件记录', icon: 'mail', path: '/mails' },
    { key: 'errors', label: '出错记录', icon: 'alertTri', path: '/errors' },
  ] },
  { key: 'g-set', label: '设置', icon: 'gear', items: [{ key: 'settings', label: '设置与工具', icon: 'gear', path: '/settings' }] },
])

/* 侧边栏和顶栏上的提醒数字：对话没看的、反馈没处理的、续期申请没处理的。后台开着时每 15 秒问一次 */
export const badges = ref({ chat: 0, chatWaiting: 0, fb: 0, aps: 0, last: 0 })
let timer = 0
let lastChat = -1
export async function refreshBadges() {
  if (!authed.value || document.hidden) return
  try {
    const b = await get('badge')
    if (lastChat >= 0 && b.chat > lastChat) onNewChat(b.chat - lastChat)
    lastChat = b.chat
    badges.value = { ...badges.value, ...b }
  } catch { /* 网络不好时下次再问 */ }
}
let newChatHandler: ((n: number) => void) | null = null
export function setNewChatHandler(fn: (n: number) => void) { newChatHandler = fn }
function onNewChat(n: number) { newChatHandler?.(n) }
export function startBadges() {
  clearInterval(timer)
  refreshBadges()
  timer = window.setInterval(refreshBadges, 15000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBadges() })
}

export async function login(key: string, remember: boolean, code = '') {
  const r = await call<{ sess?: string }>('POST', 'login', code ? { code } : {}, key)
  adminKey.set(key, remember)
  adminSess.set(r.sess || '', remember)
  authed.value = true
}
export function clearSession() {
  adminKey.clear()
  authed.value = false
  clearInterval(timer)
  lastChat = -1
}
export async function logout() { clearSession() }

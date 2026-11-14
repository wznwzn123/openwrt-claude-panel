import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { setUnauthorizedHandler } from '@/api'
import { authed, clearSession, navGroups } from '@/composables/auth'
import { pushToast } from '@/composables/toast'
import { APP } from '@/data'
import AppShell from '@/components/layout/AppShell.vue'

/* 页面：按区分类（菜单在 composables/auth.ts 的 navGroups 里） */
const PAGES: Record<string, () => Promise<any>> = {
  dashboard: () => import('@/views/Dashboard.vue'),
  chat: () => import('@/views/Chat.vue'),
  feedback: () => import('@/views/Feedback.vue'),
  ann: () => import('@/views/Ann.vue'),
  devices: () => import('@/views/Devices.vue'),
  users: () => import('@/views/Users.vue'),
  applications: () => import('@/views/Applications.vue'),
  invites: () => import('@/views/Invites.vue'),
  renewals: () => import('@/views/Renewals.vue'),
  visits: () => import('@/views/Visits.vue'),
  logins: () => import('@/views/Logins.vue'),
  oplog: () => import('@/views/OpLog.vue'),
  mails: () => import('@/views/Mails.vue'),
  errors: () => import('@/views/Errors.vue'),
  settings: () => import('@/views/Settings.vue'),
}
const children: RouteRecordRaw[] = []
for (const g of navGroups.value) for (const it of g.items) children.push({ path: it.path.slice(1), name: it.key, component: PAGES[it.key], meta: { title: it.label, group: g.single ? undefined : g.label } })
children.push({ path: '', redirect: '/dashboard' })
children.push({ path: ':pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFound.vue'), meta: { title: '页面不存在' } })

const router = createRouter({
  // 用 # 地址：整个后台就是 /admin 一个页面，刷新不会 404
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/Login.vue'), meta: { public: true, title: '登录' } },
    { path: '/', name: 'root', component: AppShell, children },
  ],
})

router.beforeEach((to) => {
  if (to.meta.public) return authed.value && to.name === 'login' ? { path: '/' } : true
  if (!authed.value) return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined }
  return true
})
router.afterEach((to) => { document.title = to.meta.title ? `${to.meta.title} · ${APP.shortName}` : APP.shortName })

setUnauthorizedHandler(() => {
  if (!authed.value) return
  clearSession()
  pushToast('管理员密钥失效了，请重新登录', 'danger')
  router.replace({ name: 'login' })
})

export default router

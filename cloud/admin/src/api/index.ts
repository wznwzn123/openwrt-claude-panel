/* ============================================================
   管理后台接口：全部走同一个站点的 /api/admin/*，用管理员密钥（Authorization: Bearer）。
   密钥只存在这个浏览器里（默认关掉页面就忘；勾了「记住」才存到本机）。
   ============================================================ */
export class ApiError extends Error {
  status: number
  need2fa: boolean
  constructor(message: string, status: number, need2fa = false) { super(message); this.status = status; this.need2fa = need2fa }
}

const KEY = 'hub.adminKey'
export const adminKey = {
  get(): string { try { return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || '' } catch { return '' } },
  set(k: string, remember: boolean) { try { this.clear(); (remember ? localStorage : sessionStorage).setItem(KEY, k) } catch { /* 隐私模式 */ } },
  clear() { try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); sessionStorage.removeItem(SESS); localStorage.removeItem(SESS) } catch { /* 忽略 */ } },
}
// 两步验证通过后拿到的通行证（12 小时），跟密钥存在同一个地方
const SESS = 'hub.adminSess'
export const adminSess = {
  get(): string { try { return sessionStorage.getItem(SESS) || localStorage.getItem(SESS) || '' } catch { return '' } },
  set(s: string, remember: boolean) { try { sessionStorage.removeItem(SESS); localStorage.removeItem(SESS); if (s) (remember ? localStorage : sessionStorage).setItem(SESS, s) } catch { /* 隐私模式 */ } },
}
export const authHeaders = (key?: string): Record<string, string> => { const h: Record<string, string> = { authorization: 'Bearer ' + (key ?? adminKey.get()) }; const s = adminSess.get(); if (s && key === undefined) h['x-adm-sess'] = s; return h }

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn }

export async function call<T = any>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, key?: string): Promise<T> {
  let r: Response
  try {
    r = await fetch('/api/admin/' + path, {
      method,
      headers: { ...authHeaders(key), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw new ApiError('连不上服务器，检查一下网络', 0)
  }
  let j: any = {}
  try { j = await r.json() } catch { /* 不是 JSON */ }
  if (r.status === 401 && !key) { onUnauthorized?.(); throw new ApiError(j.need2fa ? '两步验证过期了，请重新登录' : '管理员密钥不对或已失效，请重新登录', 401, !!j.need2fa) }
  if (!r.ok) throw new ApiError(j.error || `出错了（${r.status}）`, r.status, !!j.need2fa)
  return j as T
}
// 带密钥取图片（截图、对话里的图片），变成本页能显示的地址
export async function blobUrl(path: string): Promise<string> {
  const r = await fetch('/api/admin/' + path, { headers: authHeaders() })
  if (!r.ok) throw new ApiError('图片读不出来', r.status)
  return URL.createObjectURL(await r.blob())
}
export async function textOf(path: string): Promise<string> {
  const r = await fetch('/api/admin/' + path, { headers: authHeaders() })
  if (!r.ok) throw new ApiError('读不出来', r.status)
  return r.text()
}
// 下载文件（导出数据、备份）：带着密钥取回来，再让浏览器存下来
export async function download(path: string, fallbackName: string): Promise<void> {
  const r = await fetch('/api/admin/' + path, { headers: authHeaders(), cache: 'no-store' })
  if (!r.ok) { let j: any = {}; try { j = await r.json() } catch { /* 不是 JSON */ } throw new ApiError(j.error || '下载失败', r.status) }
  const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || fallbackName
  const url = URL.createObjectURL(await r.blob())
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60e3)
}
export const get = <T = any>(p: string) => call<T>('GET', p)
export const post = <T = any>(p: string, b: unknown = {}) => call<T>('POST', p, b)
export const del = <T = any>(p: string) => call<T>('DELETE', p)

/* ── 数据类型（跟托管服务返回的字段对应） ── */
export interface DayStat { d: string; n: Record<string, number>; pv: Record<string, number>; uv: number; cc: Record<string, number> }
export interface Overview {
  now: number
  devices: { total: number; online1h: number; online24h: number; off: number; new7: number; expiring: number }
  users: { total: number; new7: number }
  fb: { open: number; total: number; week: number }
  chat: { threads: number; unread: number; waiting: number }
  logins: { ok24: number; fail24: number; ips24: number }
  days: DayStat[]
}
export interface ChatThread { done?: number; autoAt?: number; tid: string; kind: 'hosted' | 'self'; sub?: string; name?: string; model?: string; ver?: string; place?: string; dev?: string; at: number; last?: number; lastFrom?: 'u' | 'a'; preview?: string; ua?: number; uu?: number; n?: number; seq?: number; blocked?: boolean; adminSeen?: number }
export interface ChatMsg { s: number; f: 'u' | 'a'; t: number; x: string; img: { type: string; size: number } | null; auto?: number }
export interface LoginRow { t: number; k: 'user' | 'admin' | 'reg' | 'reset'; who: string; ok: boolean; why: string; ip: string; place: string; ua: string }

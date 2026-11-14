/* ============================================================
   管理后台接口：全部走同一个站点的 /api/admin/*，用管理员密钥（Authorization: Bearer）。
   密钥只存在这个浏览器里（默认关掉页面就忘；勾了「记住」才存到本机）。
   ============================================================ */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

const KEY = 'hub.adminKey'
export const adminKey = {
  get(): string { try { return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || '' } catch { return '' } },
  set(k: string, remember: boolean) { try { this.clear(); (remember ? localStorage : sessionStorage).setItem(KEY, k) } catch { /* 隐私模式 */ } },
  clear() { try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY) } catch { /* 忽略 */ } },
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn }

export async function call<T = any>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, key?: string): Promise<T> {
  let r: Response
  try {
    r = await fetch('/api/admin/' + path, {
      method,
      headers: { authorization: 'Bearer ' + (key ?? adminKey.get()), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw new ApiError('连不上服务器，检查一下网络', 0)
  }
  let j: any = {}
  try { j = await r.json() } catch { /* 不是 JSON */ }
  if (r.status === 401 && !key) { onUnauthorized?.(); throw new ApiError('管理员密钥不对或已失效，请重新登录', 401) }
  if (!r.ok) throw new ApiError(j.error || `出错了（${r.status}）`, r.status)
  return j as T
}
// 带密钥取图片（截图、对话里的图片），变成本页能显示的地址
export async function blobUrl(path: string): Promise<string> {
  const r = await fetch('/api/admin/' + path, { headers: { authorization: 'Bearer ' + adminKey.get() } })
  if (!r.ok) throw new ApiError('图片读不出来', r.status)
  return URL.createObjectURL(await r.blob())
}
export async function textOf(path: string): Promise<string> {
  const r = await fetch('/api/admin/' + path, { headers: { authorization: 'Bearer ' + adminKey.get() } })
  if (!r.ok) throw new ApiError('读不出来', r.status)
  return r.text()
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
export interface ChatThread { tid: string; kind: 'hosted' | 'self'; sub?: string; name?: string; model?: string; ver?: string; place?: string; dev?: string; at: number; last?: number; lastFrom?: 'u' | 'a'; preview?: string; ua?: number; uu?: number; n?: number; seq?: number; blocked?: boolean; adminSeen?: number }
export interface ChatMsg { s: number; f: 'u' | 'a'; t: number; x: string; img: { type: string; size: number } | null }
export interface LoginRow { t: number; k: 'user' | 'admin' | 'reg' | 'reset'; who: string; ok: boolean; why: string; ip: string; place: string; ua: string }

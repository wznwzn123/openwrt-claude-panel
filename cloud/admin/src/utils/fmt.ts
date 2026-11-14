/* 时间、数字的显示 */
export const day = (t?: number | null) => (t ? new Date(t).toLocaleDateString('zh-CN') : '—')
export const dt = (t?: number | null) => (t ? new Date(t).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
export const full = (t?: number | null) => (t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '—')
export function ago(t?: number | null) {
  if (!t) return '—'
  const s = (Date.now() - t) / 1000
  return s < 60 ? '刚刚' : s < 3600 ? Math.round(s / 60) + ' 分钟前' : s < 86400 ? Math.round(s / 3600) + ' 小时前' : Math.round(s / 86400) + ' 天前'
}
export const vNewer = (a: string, b: string) => {
  const p = (x: string) => String(x).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const x = p(a), y = p(b)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}
// 「180」「180天」「１８０」都认；认不出返回 0
export function parseDays(v: unknown) {
  const s = String(v ?? '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  const m = /\d+/.exec(s)
  if (!m) return 0
  const n = +m[0]
  return n >= 1 && n <= 3650 ? n : 0
}
export const CC: Record<string, string> = { CN: '中国大陆', TW: '台湾', HK: '香港', MO: '澳门', US: '美国', JP: '日本', SG: '新加坡', KR: '韩国', GB: '英国', DE: '德国', CA: '加拿大', AU: '澳大利亚', MY: '马来西亚', FR: '法国', NL: '荷兰', RU: '俄罗斯', IN: '印度', TH: '泰国', VN: '越南', PH: '菲律宾', ID: '印度尼西亚', NZ: '新西兰', IT: '意大利', ES: '西班牙', BR: '巴西', T1: 'Tor', XX: '未知' }
export async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

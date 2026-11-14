import { ask } from './ask'
import { day, parseDays } from '@/utils/fmt'

// 选天数（续期审核、管理员加天数共用）：按钮或自己填，看清新的到期时间再确认
export async function askDays(o: { title: string; who?: string; note?: string; cur?: number; want?: number; go: string }) {
  const base = Math.max(Date.now(), o.cur || 0)
  const v = await ask({
    title: o.title,
    message: (o.who || '') + (o.note ? '\n备注：' + o.note : ''),
    chips: [30, 90, 180, 365].map(d => ({ label: d + ' 天', value: String(d) })),
    input: { label: '天数（1–3650）', value: String(o.want || 90), placeholder: '或者自己填天数' },
    preview: (s) => { if (!s.trim()) return { text: '选一个天数，或者自己填', ok: false }; const n = parseDays(s); return n ? { text: `${o.go} ${n} 天：到期 ${day(o.cur)} → ${day(base + n * 864e5)}`, ok: true } : { text: '天数不对：填 1 到 3650 之间的数字', ok: false } },
    confirmText: o.go,
  })
  return v ? parseDays(v.value) : 0
}

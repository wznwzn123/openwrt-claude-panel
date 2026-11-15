import { post } from '@/api'

/* 5.2 发文件（公告附件、回复里的文件）：先领上传票，再从浏览器直接分块传给托管服务（存在 R2），最大 200MB */
export interface UpFile { id: string; name: string; size: number; type: string; k?: string; url?: string }
export const FILE_MAX = 200 * 1024 * 1024
export const fmtSize = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B')

function putPart(url: string, blob: Blob, onp: (loaded: number) => void): Promise<void> {
  return new Promise((ok, no) => {
    const x = new XMLHttpRequest()
    x.open('PUT', url)
    x.upload.onprogress = (e) => onp(e.loaded)
    x.onload = () => {
      if (x.status === 200) return ok()
      let m = ''; try { m = JSON.parse(x.responseText).error } catch { /* 不是 JSON */ }
      no(Object.assign(new Error(m || '上传失败（' + x.status + '）'), { fatal: x.status === 400 || x.status === 403 }))
    }
    x.onerror = () => no(new Error('网络断了，没传上'))
    x.send(blob)
  })
}

export async function uploadFile(f: File, ctx: 'chat' | 'ann', onp: (p: number) => void): Promise<UpFile> {
  if (!f.size) throw new Error('这是个空文件')
  if (f.size > FILE_MAX) throw new Error('太大了：最大 200MB')
  const t = await post<{ url: string; part: number; n: number }>('up', { ctx, name: f.name, size: f.size, type: f.type || '' })
  let off = 0
  for (let k = 1; k <= t.n; k++) {
    const blob = f.slice(off, off + t.part)
    for (let tries = 1; ; tries++) {
      try { await putPart(t.url + '/' + k, blob, (l) => onp((off + l) / f.size)); break }
      catch (e: any) { if (e.fatal || tries >= 3) throw e; await new Promise((z) => setTimeout(z, 1500 * tries)) }
    }
    off += blob.size; onp(off / f.size)
  }
  const r = await fetch(t.url + '/done', { method: 'POST' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || '上传失败')
  return j as UpFile
}

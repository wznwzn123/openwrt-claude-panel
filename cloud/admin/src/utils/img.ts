// 选的图片压缩成 JPEG（最长边 1600、大约 700KB 以内），变成 data 网址
export function shrinkImage(file: File, lim = 9e5): Promise<string> {
  return new Promise((ok, no) => {
    if (!file || !/^image\//.test(file.type || 'image/')) return no(new Error('只能选图片'))
    const url = URL.createObjectURL(file), img = new Image()
    img.onload = () => {
      try {
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k))
        const g = c.getContext('2d')!
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height)
        URL.revokeObjectURL(url)
        let q = 0.82, d = c.toDataURL('image/jpeg', q)
        while (d.length > lim && q > 0.3) { q -= 0.12; d = c.toDataURL('image/jpeg', q) }
        if (d.length > lim * 1.4) return no(new Error('图片太大了，换一张试试'))
        ok(d)
      } catch { URL.revokeObjectURL(url); no(new Error('这张图片处理不了，换一张试试')) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error('这种图片格式打不开，换成 JPG 或 PNG 试试')) }
    img.src = url
  })
}
// 点开看大图
export function viewImage(src: string) {
  const w = document.createElement('div')
  w.className = 'img-view'
  const im = document.createElement('img')
  im.src = src; im.alt = '大图'
  w.appendChild(im)
  w.onclick = () => w.remove()
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { w.remove(); document.removeEventListener('keydown', esc) } })
  document.body.appendChild(w)
}

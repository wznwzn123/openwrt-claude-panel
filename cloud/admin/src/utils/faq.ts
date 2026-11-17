/* 常见问题回答的显示：跟官网 /help 页面同一套写法（先转义，再认几种标记），用来在后台预览 */
const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
const inline = (s: string) => esc(s).replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+?)`/g, '<code>$1</code>')
  .replace(/\[([^\]]+?)\]\(((?:\/|https:\/\/)[^)\s]*)\)/g, (_m, t, u) => '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>')
export function faqRich(a: string) {
  const out: string[] = []
  let list: string[] | null = null, kind = ''
  const flush = () => { if (list) { out.push('<' + kind + '>' + list.join('') + '</' + kind + '>'); list = null } }
  for (const line of String(a || '').split('\n')) {
    const t = line.trim(), ul = /^[-•]\s+(.*)$/.exec(t), ol = /^\d+[.、]\s*(.*)$/.exec(t)
    if (!t) { flush(); continue }
    if (ul || ol) { const k = ul ? 'ul' : 'ol'; if (list && kind !== k) flush(); if (!list) { list = []; kind = k } list.push('<li>' + inline((ul || ol)![1]) + '</li>'); continue }
    flush(); out.push('<p>' + inline(t) + '</p>')
  }
  flush()
  return out.join('')
}

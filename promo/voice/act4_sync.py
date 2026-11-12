"""第四幕音画对位：从字级时间戳取旁白关键词时刻，推导三条指令的键入/发送/工具调用/回执与回滚时刻，
写入 src/act4.json —— 画面（Act4.tsx）与音效（audio/synth.py）读同一份，换配音后重跑即重新对齐。"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = json.load(open(os.path.join(ROOT, 'src', 'timing.json')))
kw = lambda s: next(p['start'] for p in T['phrases'] if s in p['text'] and p['start'] >= 54)  # 只在第四幕内匹配
CHAR = 0.06
SPEC = [
    ('切换高速节点', '把影音加速切到低延迟电竞专线', '节点切换 · 延迟测试', '已将「4K 超清本地影音加速」切换至 低延迟电竞专线 · 28 ms'),
    ('排查带宽占用', '看看现在哪台设备在占满网速', '实时网速 · 设备列表', '书房台式机正以 86.4 MB/s 下载，占用约 92% 带宽'),
    ('设定定时断网', '给儿童平板设置每晚11点自动断网', 'UCI 写入 · 防火墙', '已写入定时规则：儿童平板 每晚 23:00 断网，次日 07:00 恢复'),
]
cmds, prev_send = [], 0
for key, text, tool, reply in SPEC:
    tool_at = round(kw(key) - 0.15, 3)          # 状态响应 = toolAt + 0.15 = 关键词发声帧
    send = round(tool_at - 0.25, 3)
    t0 = round(send - len(text) * CHAR - 0.05, 3)
    assert t0 > prev_send, (key, t0, prev_send)  # 上一条发出后才开始键入
    cmds.append({'key': key, 'text': text, 't0': t0, 'send': send, 'tool': tool, 'toolAt': tool_at, 'reply': reply, 'replyAt': round(tool_at + 0.34, 3)})
    prev_send = send
out = {'char': CHAR, 'cmds': cmds, 'rollback': round(kw('回滚'), 3)}
json.dump(out, open(os.path.join(ROOT, 'src', 'act4.json'), 'w'), ensure_ascii=False, indent=1)
for c in cmds: print(f"{c['key']}  键入 {c['t0']:.2f} → 发送 {c['send']:.2f} → 工具 {c['toolAt']:.2f} → 状态 {c['toolAt'] + 0.15:.2f}")
print('回滚', out['rollback'])

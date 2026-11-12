"""第四幕音画对位（架构重构版）：三段动作各占一个旁白窗口——
   动作①「毫秒级切换高速专线」发声帧 = 线路切换生效；动作②「精准锁定高占用终端」发声帧 = 终端锁定；
   动作③ 在「自动下发定时管控与配置回滚」句内写入规则，句尾「配置回滚」处弹出回滚卡。
   画面（Act4.tsx）与音效（audio/synth.py）读同一份 src/act4.json；换配音后重跑即重新对齐。"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = json.load(open(os.path.join(ROOT, 'src', 'timing.json')))
ph = lambda s: next(p for p in T['phrases'] if s in p['text'] and p['start'] >= 53)
CHAR = 0.06
cmds = []
def add(text, tool, reply, state_at, t0=None):
    tool_at = round(state_at - 0.15, 3)
    send = round(tool_at - 0.25, 3)
    if t0 is None:
        t0 = round(send - len(text) * CHAR - 0.05, 3)
    cmds.append({'text': text, 't0': t0, 'send': send, 'tool': tool, 'toolAt': tool_at, 'reply': reply, 'replyAt': round(tool_at + 0.34, 3)})
add('把超清影音通道切到低延迟线路', '线路切换 · 延迟测试', '已将「超清影音通道」切换至 低延迟线路 01 · 28 ms', ph('毫秒级切换高速专线')['start'])
add('看看现在哪台设备在占满网速', '实时网速 · 设备列表', '书房台式机正以 86.4 MB/s 下载，占用约 92% 带宽', ph('精准锁定高占用终端')['start'])
p3 = ph('自动下发定时管控与配置回滚')
t0_3 = round(p3['start'] - 0.1, 3)
add('给儿童平板设置每晚十一点自动休眠', 'UCI 写入 · 防火墙', '已写入定时规则：儿童平板 每晚 23:00 自动休眠，次日 07:00 恢复', round(t0_3 + 16 * CHAR + 0.05 + 0.25 + 0.15, 3), t0_3)
for a, b in zip(cmds, cmds[1:]):
    assert b['t0'] > a['send'], (a['text'], b['text'])
out = {'char': CHAR, 'cmds': cmds, 'rollback': round(p3['end'] - 0.3, 3)}
json.dump(out, open(os.path.join(ROOT, 'src', 'act4.json'), 'w'), ensure_ascii=False, indent=1)
for c in cmds: print(f"{c['text']}\n   键入 {c['t0']:.2f} → 发送 {c['send']:.2f} → 工具 {c['toolAt']:.2f} → 状态生效 {c['toolAt'] + 0.15:.2f}")
print('回滚卡', out['rollback'])

"""第四幕音画对位（第六版）：三条指令都按「打字 → 发送 → 思考中 → 调用工具（可多个）→ 状态生效 → 回复」展开，
   第三条在调用「修改配置」前先向用户确认（uci_set 在连接器里标为危险操作，必须先说明并确认），改前自动备份。
   工具名用连接器里的真实中文标题（src/www/cgi-bin/mcp 的 title；「节点」按合规口径写作「线路」）。
   画面（Act4.tsx）与音效（audio/synth.py）读同一份 src/act4.json；换配音后重跑即重新对齐。"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = json.load(open(os.path.join(ROOT, 'src', 'timing.json')))
ph = lambda s: next(p for p in T['phrases'] if s in p['text'] and p['start'] >= 53)
CHAR = 0.06
r = lambda x: round(x, 3)
cmds = []

# ① 「说一句，切到低延迟线路，它先测速，再帮你切好」：测速发声时出「测速」，「再帮你切好」发声帧 = 切换生效
p_test, p_done = ph('它先测速'), ph('再帮你切好')
text1 = '把超清影音通道切到低延迟线路'
t0 = r(ph('说一句')['start'] - 0.1); send = r(t0 + len(text1) * CHAR + 0.05)
state = p_done['start']
cmds.append({'text': text1, 't0': t0, 'send': send, 'think': r(send + 0.12),
             'tools': [{'name': '测速', 'at': r(p_test['start'])}, {'name': '切换线路', 'at': r(state - 0.15)}],
             'toolAt': r(state - 0.15), 'state': r(state),
             'reply': '备用线路 05 超时，已把「超清影音通道」切到低延迟线路 01 · 28 ms', 'replyAt': r(state + 0.2)})

# ② 「问它谁在占网速，它查一遍连接，告诉你是哪台设备」：查看连接（含来源 IP 与流量，需扩展套件）+ 设备列表（IP→设备名），
#    「告诉你是哪台设备」发声帧 = 结果锁定。连接器没有「每台设备实时速率」工具，所以结果只给能推出来的「最近几分钟流量」
p_ask, p_look, p_tell = ph('问它谁在占网速'), ph('它查一遍连接'), ph('告诉你是哪台设备')
text2 = '看看现在哪台设备在占满网速'
t0 = r(p_ask['start'] - 0.15); send = r(t0 + len(text2) * CHAR + 0.05)
state = p_tell['start']
cmds.append({'text': text2, 't0': t0, 'send': send, 'think': r(send + 0.12),
             'tools': [{'name': '查看连接', 'at': r(p_look['start'])}, {'name': '设备列表', 'at': r(state - 0.15)}],
             'toolAt': r(state - 0.15), 'state': r(state),
             'reply': '这几分钟流量最大的是书房台式机，下载了约 2 GB', 'replyAt': r(state + 0.2)})

# ③ 「让它给书房电脑固定个 IP，它会先跟你确认，改之前还自动备份」
p_set, p_conf, p_bak = ph('固定个 IP'), ph('它会先问你同不同意'), ph('改之前还自动备份')
text3 = '给书房台式机固定 IP 192.168.1.10'
t0 = r(p_set['start'] - 0.1); send = r(t0 + len(text3) * CHAR + 0.05)
ask = r(p_conf['start'])            # Claude 客户端弹出工具授权（修改配置在连接器里标为危险操作，默认先请用户允许）
ok = r(p_conf['end'] - 0.05)        # 用户点「允许」
tool = r(ok + 0.25)                 # 修改配置（改前自动备份）
state = r(tool + 0.15)
cmds.append({'text': text3, 't0': t0, 'send': send, 'think': r(send + 0.12),
             'tools': [{'name': '读取配置', 'at': r(min(ask - 0.35, send + 0.6))}, {'name': '修改配置', 'at': tool}],
             'confirm': {'ask': ask, 'ok': ok, 'text': 'Claude 想使用「修改配置」 · 路由器面板', 'detail': 'DHCP 静态地址：书房台式机 → 192.168.1.10'},
             'toolAt': tool, 'state': state,
             'reply': '已固定：书房台式机 → 192.168.1.10。改动前已自动备份配置，可一键还原', 'replyAt': r(state + 0.2)})

for a, b in zip(cmds, cmds[1:]):
    assert b['t0'] > a['replyAt'], (a['text'], b['text'])
out = {'char': CHAR, 'cmds': cmds, 'rollback': r(max(p_bak['start'], cmds[2]['replyAt'] + 0.35))}
json.dump(out, open(os.path.join(ROOT, 'src', 'act4.json'), 'w'), ensure_ascii=False, indent=1)
for c in cmds:
    tl = ' → '.join(f"{t['name']} {t['at']:.2f}" for t in c['tools'])
    cf = f" · 确认 {c['confirm']['ask']:.2f}/{c['confirm']['ok']:.2f}" if 'confirm' in c else ''
    print(f"{c['text']}\n   键入 {c['t0']:.2f} → 发送 {c['send']:.2f} → 思考 {c['think']:.2f} → {tl}{cf} → 生效 {c['state']:.2f} → 回复 {c['replyAt']:.2f}")
print('备份卡', out['rollback'])

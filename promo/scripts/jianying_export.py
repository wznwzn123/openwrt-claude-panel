"""剪映（CapCut 国内版）多轨草稿导出（shotcraft references/jianying-export.md 流程）

底片 = 无字幕干净版（Promo90Clean）按五幕切段（可单独变速/重排/调色）；
字幕 = 剪映原生文本轨（逐句，可改内容/字号/颜色）；
人声 / BGM / SFX（按 cue 拆成独立小段，贪心分道）各自成轨。
用法：python3 scripts/jianying_export.py out/plate.mp4 out/jianying
产物：out/jianying/OpenWrt-Claude-Panel-90s/（整个文件夹拷进剪映草稿目录即可）
"""
import json
import os
import shutil
import subprocess
import sys

import pyJianYingDraft as draft

FPS = 60   # 第六版：底片改为 60fps 无字幕版（Promo90Clean），与主片一致（审片 B13）
TOTAL_F = 90 * FPS   # 第七版修正：原写死 2700（30fps 的 90 秒），改 60fps 后人声/BGM/字幕/音效被截在 45 秒
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATE = os.path.abspath(sys.argv[1])
STAGING = os.path.abspath(sys.argv[2])
NAME = 'OpenWrt-Claude-Panel-90s'
A = os.path.join(ROOT, 'public', 'audio')


def f2us(f):
    return round(f * 1_000_000 / FPS)


def s2f(s):
    return round(s * FPS)


def rng(f0, f1):
    return draft.Timerange(f2us(f0), f2us(f1) - f2us(f0))


os.makedirs(STAGING, exist_ok=True)
assets = os.path.join(STAGING, 'assets')
os.makedirs(assets, exist_ok=True)
# 素材拷贝进草稿旁（剪映按绝对路径引用，用户机器上需要重新链接时整个文件夹一起拷走即可）
plate_dst = os.path.join(assets, 'plate.mp4')
shutil.copyfile(PLATE, plate_dst)
for f in ('narration.wav', 'bgm.wav'):
    shutil.copyfile(os.path.join(A, f), os.path.join(assets, f))

# SFX：按 cue 从 sfx 总轨切出独立小段（窗口 = 到下一个 cue 或 1.4s）
cues = sorted(json.load(open(os.path.join(A, 'cues.json'))), key=lambda c: c['t'])
sfx_dir = os.path.join(assets, 'sfx')
shutil.rmtree(sfx_dir, ignore_errors=True)   # 第六版：先清空，避免历次导出残留的旧音效混进压缩包（审片 B13）
os.makedirs(sfx_dir, exist_ok=True)
sfx_items = []
for i, c in enumerate(cues):
    nxt = cues[i + 1]['t'] if i + 1 < len(cues) else 90.0
    dur = max(0.15, min(1.4, nxt - c['t'] - 0.01)) if c['name'] not in ('dictation-typing', 'terminal-typing', 'scan-sweep', 'rgb-glitch') else min(3.2, nxt - c['t'] - 0.01)
    out = os.path.join(sfx_dir, f'{i:02d}-{c["name"]}.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{c["t"]:.3f}', '-t', f'{dur:.3f}', '-i', os.path.join(A, 'sfx.wav'), out], check=True)
    sfx_items.append((s2f(c['t']), out, dur))

folder = draft.DraftFolder(STAGING)
script = folder.create_draft(NAME, 1920, 1080, fps=FPS, allow_replace=True)
script.append_track(draft.TrackSpec(draft.TrackType.video, name='底片'))
script.append_track(draft.TrackSpec(draft.TrackType.text, name='字幕'))
script.append_track(draft.TrackSpec(draft.TrackType.audio, name='人声'))
script.append_track(draft.TrackSpec(draft.TrackType.audio, name='BGM'))

plate = draft.VideoMaterial(plate_dst)
for a, b in [(0, 12), (12, 28), (28, 54), (54, 74), (74, 90)]:
    r = rng(s2f(a), s2f(b))
    script.add_segment(draft.VideoSegment(plate, r, source_timerange=r), '底片')

timing = json.load(open(os.path.join(ROOT, 'src', 'timing.json')))
phr = timing['phrases']
style = draft.TextStyle(size=3.2, color=(1.0, 1.0, 1.0), align=1)
starts = [s2f(p['start'] - 0.04) for p in phr]
for i, p in enumerate(phr):
    nxt = phr[i + 1]['start'] if i + 1 < len(phr) else 90
    f0 = starts[i]
    f1 = min(s2f(min(p['end'] + 0.3, nxt - 0.02)), TOTAL_F, starts[i + 1] if i + 1 < len(phr) else TOTAL_F)  # 帧取整后不得与下一句重叠
    if f1 <= f0:
        continue
    text = p['text'].replace('，', ' ').replace('。', ' ').strip()
    script.add_segment(
        draft.TextSegment(text, rng(f0, f1), style=style, clip_settings=draft.ClipSettings(transform_y=-0.85),
                          shadow=draft.TextShadow(alpha=0.6, diffuse=20, distance=3)),
        '字幕')

voice = draft.AudioMaterial(os.path.join(assets, 'narration.wav'))
script.add_segment(draft.AudioSegment(voice, draft.Timerange(0, min(voice.duration, f2us(TOTAL_F))), volume=1.0), '人声')
bgm = draft.AudioMaterial(os.path.join(assets, 'bgm.wav'))
script.add_segment(draft.AudioSegment(bgm, draft.Timerange(0, min(bgm.duration, f2us(TOTAL_F))), volume=0.3), 'BGM')

lanes, placed = [], []
for start_f, path, dur in sorted(sfx_items):
    mat = draft.AudioMaterial(path)
    start = f2us(start_f)
    d = min(mat.duration, f2us(TOTAL_F) - start)
    lane = next((i for i, end in enumerate(lanes) if end <= start), len(lanes))
    if lane == len(lanes):
        lanes.append(0)
    lanes[lane] = start + d
    placed.append((lane, start, d, mat))
for i in range(len(lanes)):
    script.append_track(draft.TrackSpec(draft.TrackType.audio, name=f'SFX{i + 1}'))
for lane, start, d, mat in placed:
    script.add_segment(draft.AudioSegment(mat, draft.Timerange(start, d), volume=0.4), f'SFX{lane + 1}')
script.save()
# 草稿里的素材是本机绝对路径（剪映草稿格式要求）：附一份重新链接说明（审片 B13）
open(os.path.join(STAGING, '如何重新链接素材.txt'), 'w', encoding='utf-8').write(
    '剪映草稿使用说明\n\n'
    '1. 把压缩包里的「%s」文件夹整个复制到剪映的草稿目录\n'
    '   （剪映 → 设置 → 草稿位置 可以看到路径）。\n'
    '2. 重启剪映，在草稿列表里打开它。\n'
    '3. 如果提示「素材丢失」：点「重新链接」，选择压缩包根目录下的 assets 文件夹（和草稿文件夹并列），剪映会按文件名自动匹配全部素材。\n\n'
    '轨道说明：底片（无字幕 1920×1080 · 60fps，按五幕切段）、字幕、人声、BGM、SFX1…N（每个音效单独一段）。\n' % NAME)
print('draft ok:', os.path.join(STAGING, NAME), 'sfx lanes', len(lanes), 'subs', len(phr))

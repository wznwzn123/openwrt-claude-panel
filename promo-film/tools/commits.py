# 从 git 历史生成「提交长卷」用的数据：src/data/commits.json
# 只取每条提交说明的第一小句；含代理、订阅一类字眼的提交不放进画面（按大陆平台的发布要求）
import json, re, subprocess, os
root = os.path.join(os.path.dirname(__file__), '..', '..')
out = subprocess.check_output(['git', '-C', root, 'log', '--reverse', '--format=%ad|%h|%s', '--date=format:%m.%d %H:%M'], text=True)
BAN = re.compile(r'代理|OpenClash|Clash|PassWall|Nikki|HomeProxy|SSR|节点|订阅|翻墙|梯子|VPN|vpn|GEO|chnroute|直连|分流|解锁', re.I)
rows = []
for i, line in enumerate(out.strip().split('\n'), 1):
    t, h, s = line.split('|', 2)
    short = re.split(r'[：:（(；;，,。]', s, maxsplit=1)[0].strip()
    if len(short) < 4:
        short = re.split(r'[（(；;。]', s, maxsplit=1)[0].strip()
    short = short[:28]
    rows.append({'n': i, 't': t, 'h': h, 's': short, 'ok': not BAN.search(s)})
json.dump(rows, open(os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'commits.json'), 'w'), ensure_ascii=False, indent=0)
print(len(rows), 'commits,', sum(r['ok'] for r in rows), 'shown')

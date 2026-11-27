#!/usr/bin/env python3
# 测试用的假 uci 命令（云端测试环境里没有 uci）：只支持面板用到的 show / get / set / delete / add_list / reorder / commit / revert。
# set / delete 直接写进文件（不像真 uci 那样先暂存），commit / revert 什么都不做。
import os, re, shlex, sys
a = sys.argv[1:]
d = '/etc/config'; quiet = False; ext = False
while a and a[0].startswith('-'):
    f = a.pop(0)
    if f == '-c': d = a.pop(0)
    elif f == '-q': quiet = True
    elif f == '-X': ext = True
def die(msg):
    if not quiet: print('uci: ' + msg, file=sys.stderr)
    sys.exit(1)
def load(cfg):
    p = os.path.join(d, cfg)
    if not os.path.isfile(p): die('Entry not found')
    secs = []; n = 0
    for ln in open(p, encoding='utf-8', errors='surrogateescape'):
        t = shlex.split(ln, comments=True)
        if not t: continue
        if t[0] == 'config':
            n += 1
            secs.append({'type': t[1], 'name': t[2] if len(t) > 2 else None, 'anon': len(t) < 3, 'idx': n, 'o': []})
        elif t[0] in ('option', 'list') and secs:
            o = secs[-1]['o']
            if t[0] == 'list':
                for x in o:
                    if x[0] == t[1] and isinstance(x[1], list): x[1].append(t[2]); break
                else: o.append([t[1], [t[2]]])
            else: o.append([t[1], t[2] if len(t) > 2 else ''])
    for s in secs:
        if s['anon']: s['name'] = 'cfg%06x' % (s['idx'] * 4099)
    return secs
def q(v): return "'" + v.replace("'", "'\\''") + "'"
def save(cfg, secs):
    out = []
    for s in secs:
        out.append('config %s%s' % (s['type'], '' if s['anon'] else ' ' + q(s['name'])))
        for k, v in s['o']:
            if isinstance(v, list): out += ['\tlist %s %s' % (k, q(x)) for x in v]
            else: out.append('\toption %s %s' % (k, q(v)))
        out.append('')
    open(os.path.join(d, cfg), 'w', encoding='utf-8', errors='surrogateescape').write('\n'.join(out))
def find(secs, name):
    for s in secs:
        if s['name'] == name: return s
    m = re.match(r'^@([A-Za-z0-9_-]+)\[(-?\d+)\]$', name)
    if m:
        l = [s for s in secs if s['type'] == m.group(1)]
        try: return l[int(m.group(2))]
        except IndexError: pass
    return None
if not a: die('no command')
cmd = a.pop(0)
if cmd == 'show':
    cfg = a[0].split('.')[0]; secs = load(cfg)
    for s in secs:
        nm = s['name'] if (ext or not s['anon']) else '@%s[%d]' % (s['type'], [x for x in secs if x['type'] == s['type']].index(s))
        print('%s.%s=%s' % (cfg, nm, s['type']))
        for k, v in s['o']:
            print('%s.%s.%s=%s' % (cfg, nm, k, ' '.join(q(x) for x in v) if isinstance(v, list) else q(v)))
elif cmd == 'get':
    p = a[0].split('.'); secs = load(p[0]); s = find(secs, p[1]) if len(p) > 1 else None
    if not s: die('Entry not found')
    if len(p) == 2: print(s['type']); sys.exit(0)
    for k, v in s['o']:
        if k == p[2]: print(' '.join(v) if isinstance(v, list) else v); sys.exit(0)
    die('Entry not found')
elif cmd == 'add_list':
    key, _, val = a[0].partition('=')
    p = key.split('.'); secs = load(p[0]); s = find(secs, p[1]) if len(p) > 2 else None
    if not s: die('Invalid argument')
    for x in s['o']:
        if x[0] == p[2]:
            if not isinstance(x[1], list): x[1] = [x[1]]
            x[1].append(val); break
    else: s['o'].append([p[2], [val]])
    save(p[0], secs)
elif cmd in ('set', 'delete'):
    key, _, val = a[0].partition('=')
    p = key.split('.'); secs = load(p[0])
    if cmd == 'set' and len(p) == 2:
        if not find(secs, p[1]): secs.append({'type': val, 'name': p[1], 'anon': False, 'idx': 0, 'o': []})
        save(p[0], secs); sys.exit(0)
    s = find(secs, p[1]) if len(p) > 1 else None
    if not s: die('Invalid argument')
    if cmd == 'delete' and len(p) == 2: secs.remove(s)
    else:
        s['o'] = [x for x in s['o'] if x[0] != p[2]]
        if cmd == 'set': s['o'].append([p[2], val])
    save(p[0], secs)
elif cmd == 'reorder':
    key, _, val = a[0].partition('=')
    p = key.split('.'); secs = load(p[0]); s = find(secs, p[1]) if len(p) == 2 else None
    if not s: die('Invalid argument')
    secs.remove(s); secs.insert(max(0, int(val)), s)
    save(p[0], secs)
elif cmd in ('commit', 'revert'): pass
else: die('unknown command ' + cmd)

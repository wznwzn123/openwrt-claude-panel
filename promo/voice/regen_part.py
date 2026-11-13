"""按段重合成配音（其余段保持原文件不动）。
用法：python3 regen_part.py a2 a4a a4b a4c a4d a5
- 段内可单独写 "rate"（缺省用全片 rate）；"anchor" 支持数字或 "after:<id>"（上一段结束 + gap 秒）。
- a5 等只需挪位置的段：加 --keep 只按新锚点重排，不重新合成。
"""
import asyncio, ssl, os, sys, json
import edge_tts, edge_tts.communicate as c
c._SSL_CTX = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
S = json.load(open('script.json'))
ids = [a for a in sys.argv[1:] if not a.startswith('--')]
keep = {a[7:] for a in sys.argv[1:] if a.startswith('--keep=')}
GAP = 0.4
async def synth(a, rate):
    comm = edge_tts.Communicate(a.get('speak', a['text']), S['voice'], rate=rate, pitch=S.get('pitch', '+0Hz'),
                                boundary='WordBoundary', proxy=os.environ.get('HTTPS_PROXY'))
    words = []
    with open(f"{a['id']}.mp3", 'wb') as f:
        async for ch in comm.stream():
            if ch['type'] == 'audio': f.write(ch['data'])
            elif ch['type'] == 'WordBoundary':
                words.append({'text': ch['text'], 'start': ch['offset'] / 1e7, 'end': (ch['offset'] + ch['duration']) / 1e7})
    json.dump(words, open(f"{a['id']}.words.json", 'w'), ensure_ascii=False)
    return words
async def main():
    ends = {}
    for a in S['acts']:
        if a['id'] in ids:
            anchor = a['anchor']
            if isinstance(anchor, str) and anchor.startswith('after:'):
                anchor = round(ends[anchor[6:]] + GAP, 3)
            rate = a.get('rate', S['rate'])
            w = json.load(open(f"{a['id']}.words.json")) if a['id'] in keep else await synth(a, rate)
            a['start'] = round(anchor - w[0]['start'], 3); a['first'] = round(anchor, 3)
            print(f"{a['id']:4s} rate {rate:5s} first@{anchor:.2f}  end {a['start'] + w[-1]['end']:.2f}  window≤{a['window'][1]}")
        else:
            w = json.load(open(f"{a['id']}.words.json"))
        end = a['start'] + w[-1]['end']
        assert end <= a['window'][1], (a['id'], end, a['window'][1])
        ends[a['id']] = end
    json.dump(S, open('script.json', 'w'), ensure_ascii=False, indent=1)
asyncio.run(main())

"""全片配音重合成：首字钉在锚点（或紧接上一段 +0.4s 换气），段尾超出时间窗则逐步提速重试"""
import asyncio, ssl, os, json
import edge_tts, edge_tts.communicate as c
c._SSL_CTX = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
S = json.load(open('script.json'))
ends = {}
async def synth(a, rate):
    comm = edge_tts.Communicate(a.get('speak', a['text']), S['voice'], rate=rate, pitch=S.get('pitch', '+0Hz'),
                                boundary='WordBoundary', proxy=os.environ.get('HTTPS_PROXY'))
    words = []
    with open(f"{a['id']}.mp3", 'wb') as f:
        async for ch in comm.stream():
            if ch['type'] == 'audio': f.write(ch['data'])
            elif ch['type'] == 'WordBoundary':
                words.append({'text': ch['text'], 'start': ch['offset'] / 1e7, 'end': (ch['offset'] + ch['duration']) / 1e7})
    return words
async def main():
    for a in S['acts']:
        anchor = a['anchor']
        if isinstance(anchor, str) and anchor.startswith('after:'):
            anchor = round(ends[anchor[6:]] + 0.4, 3)   # 紧接上一段，留 0.4s 换气
        rate = S.get('rate', '+0%')   # 全片统一语速，不逐段提速
        w = await synth(a, rate)
        start = round(anchor - w[0]['start'], 3)
        end = start + w[-1]['end']
        assert end <= a['window'][1], (a['id'], end, a['window'][1])
        a['start'] = start; a['rate'] = rate; a['first'] = round(anchor, 3)
        ends[a['id']] = end
        json.dump(w, open(f"{a['id']}.words.json", 'w'), ensure_ascii=False)
        print(f"{a['id']:4s} rate {rate:5s} first@{anchor:.2f}  end {end:.2f}  window≤{a['window'][1]}")
    json.dump(S, open('script.json', 'w'), ensure_ascii=False, indent=1)
asyncio.run(main())

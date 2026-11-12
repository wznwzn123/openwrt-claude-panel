"""按固定参数（+5% / -2Hz）合成每段，只测时长（首字偏移、语音长度）"""
import asyncio, ssl, os, json
import edge_tts, edge_tts.communicate as c
c._SSL_CTX = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
S = json.load(open('script.json'))
async def main():
    out = {}
    for a in S['acts']:
        comm = edge_tts.Communicate(a.get('speak', a['text']), S['voice'], rate=S['rate'], pitch=S['pitch'], boundary='WordBoundary', proxy=os.environ.get('HTTPS_PROXY'))
        words = []
        with open(f"{a['id']}.mp3", 'wb') as f:
            async for ch in comm.stream():
                if ch['type'] == 'audio': f.write(ch['data'])
                elif ch['type'] == 'WordBoundary': words.append({'text': ch['text'], 'start': ch['offset'] / 1e7, 'end': (ch['offset'] + ch['duration']) / 1e7})
        json.dump(words, open(f"{a['id']}.words.json", 'w'), ensure_ascii=False)
        out[a['id']] = (round(words[0]['start'], 3), round(words[-1]['end'] - words[0]['start'], 2))
        print(a['id'], 'lead', out[a['id']][0], 'speech', out[a['id']][1])
    json.dump(out, open('durations.json', 'w'))
asyncio.run(main())

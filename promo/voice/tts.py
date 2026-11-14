import asyncio, ssl, os, sys, json, subprocess
import edge_tts, edge_tts.communicate as c
c._SSL_CTX = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
S = json.load(open("script.json"))
rate = sys.argv[1] if len(sys.argv)>1 else "+0%"
pitch = sys.argv[2] if len(sys.argv)>2 else "-4Hz"
async def one(a):
    comm = edge_tts.Communicate(a.get("speak", a["text"]), S["voice"], rate=a.get("rate",rate), pitch=pitch,
                                boundary="WordBoundary", proxy=os.environ.get("HTTPS_PROXY"))
    words=[]
    with open(f"{a['id']}.mp3","wb") as f:
        async for ch in comm.stream():
            if ch["type"]=="audio": f.write(ch["data"])
            elif ch["type"]=="WordBoundary":
                words.append({"text":ch["text"],"start":ch["offset"]/1e7,"end":(ch["offset"]+ch["duration"])/1e7})
    json.dump(words, open(f"{a['id']}.words.json","w"), ensure_ascii=False)
    d=float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f"{a['id']}.mp3"]))
    print(a["id"], "dur=%.2f"%d, "speech_end=%.2f"%words[-1]["end"], "slot=%.2f"%(a["window"][1]-a["start"]))
async def main():
    for a in S["acts"]: await one(a)
asyncio.run(main())

import json, re, subprocess
S=json.load(open("script.json"))
P=r'[，。；、：]'
norm=lambda s: re.sub(r'[\s，。；、,.;]','',s).lower()
out={"acts":[],"phrases":[]}
filt=[]; inputs=[]
for k,a in enumerate(S["acts"]):
    words=json.load(open(f"{a['id']}.words.json"))
    disp=[x for x in re.split(P,a["text"]) if x.strip()]
    spk=[x for x in re.split(P,a.get("speak",a["text"])) if x.strip()]
    assert len(disp)==len(spk),(a['id'],len(disp),len(spk))
    # char stream with times
    stream=[]
    for w in words:
        t=norm(w["text"]); n=max(len(t),1)
        for i,ch in enumerate(t):
            stream.append((ch, w["start"]+(w["end"]-w["start"])*i/n, w["start"]+(w["end"]-w["start"])*(i+1)/n))
    full=''.join(c for c,_,_ in stream)
    pos=0
    for d,s in zip(disp,spk):
        key=norm(s); idx=full.find(key,pos)
        if idx<0: idx=pos
        e=min(idx+len(key)-1,len(stream)-1)
        st=stream[idx][1]+a["start"]; en=stream[e][2]+a["start"]
        out["phrases"].append({"act":a["id"],"text":d.strip(),"start":round(st,3),"end":round(en,3)})
        pos=idx+len(key)
    out["acts"].append({"id":a["id"],"start":a["start"],"words":[{"text":w["text"],"start":round(w["start"]+a["start"],3),"end":round(w["end"]+a["start"],3)} for w in words]})
    inputs+=["-i",f"{a['id']}.mp3"]; filt.append(f"[{k}]adelay={int(a['start']*1000)}|{int(a['start']*1000)},aresample=48000[v{k}]")
json.dump(out,open("../src/timing.json","w"),ensure_ascii=False,indent=1)
fc=";".join(filt)+";"+"".join(f"[v{k}]" for k in range(len(S['acts'])))+f"amix=inputs={len(S['acts'])}:normalize=0,apad=whole_dur=90,atrim=0:90[o]"
subprocess.run(["ffmpeg","-v","error","-y",*inputs,"-filter_complex",fc,"-map","[o]","-ac","2","-ar","48000","../public/audio/narration.wav"],check=True)
for p in out["phrases"]: print("%6.2f-%6.2f %s"%(p["start"],p["end"],p["text"]))

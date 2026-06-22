#!/usr/bin/env python3
"""HQ status engine — emits /tmp/helm_hq/status.json each tick (cached, fast).
Tracks per-agent live state, a mission-log event feed, throughput/ETA, severity
gauges and a fixed-over-time series. An outer loop runs this every ~2s; the
served index.html polls status.json and renders smoothly (no reload)."""
import json, glob, os, re, time, csv

REPO="/Users/ricknini/Downloads/helmv3"
WF_PARENT="/Users/ricknini/.claude/projects/-Users-ricknini/f091ec6b-b133-4061-91a2-2e5a2aff285f/subagents/workflows"
CSVP=f"{REPO}/docs/audits/_premium_scrub_2026-06-21/FINDINGS_CALIBRATED.csv"
HQ="/tmp/helm_hq"; os.makedirs(HQ,exist_ok=True)
STATE=f"{HQ}/state.json"; STATUS=f"{HQ}/status.json"

NAMES=["Eagle","Birdie","Albatross","Ace","Mulligan","Fairway","Bunker","Divot","Niblick","Mashie",
"Brassie","Stinger","Draw","Fade","Flop","Pitch","Chip","Lag","Tempo","Grip","Stance","Pin","Flag",
"Apron","Fringe","Rough","Tee","Hazard","Dogleg","Links","Bogey","Sandy","Scramble","Wedge","Hybrid",
"Driver","Putter","Cleat","Visor","Caddie","Yips","Gimme","Snowman","Shank","Whiff","Slice","Hook","Carry"]

feat={}; sevof={}
try:
    for r in csv.DictReader(open(CSVP)):
        feat[r["id"]]=r["feature"].replace("holistic:","global:")
        sevof[r["id"]]=r["severity"].strip().lower()
except Exception: pass
def sev_id(i):
    if "-" in i: return {"P0":"critical","P1":"high","P2":"medium","P3":"low"}.get(i[:2],"medium")
    return sevof.get(i,"medium")
def feats_of(ids):
    fs=[]
    for i in ids:
        f="CoachHelm engine" if "-" in i else feat.get(i)
        if f and f not in fs: fs.append(f)
    return fs[:3]

def read_events(fp):
    out=[]
    try:
        for ln in open(fp,encoding="utf-8",errors="ignore"):
            if ln.strip():
                try: out.append(json.loads(ln))
                except: pass
    except: pass
    return out

def first_ids(evs):
    for ev in evs:
        if ev.get("type")=="user":
            c=ev.get("message",{}).get("content")
            t=c if isinstance(c,str) else (" ".join(b.get("text","") for b in c if isinstance(b,dict)) if isinstance(c,list) else "")
            m=re.search(r"Your finding IDs:\s*([^\n]+)",t)
            if m: return [x.strip() for x in m.group(1).split(",") if x.strip()]
    return []

def first_ts(evs):
    for ev in evs:
        if ev.get("timestamp"):
            try: return _iso(ev["timestamp"])
            except: pass
    return None
def last_ts(evs):
    for ev in reversed(evs):
        if ev.get("timestamp"):
            try: return _iso(ev["timestamp"])
            except: pass
    return None
def _iso(s):
    # '2026-06-21T17:39:00.000Z' -> epoch (approx, tz Z)
    import datetime
    s=s.replace("Z","+00:00")
    return datetime.datetime.fromisoformat(s).timestamp()

def _label(n,inp):
    fp=inp.get("file_path") or inp.get("path") or ""; short=os.path.basename(fp) if fp else ""
    if n=="StructuredOutput": return ["flag","reporting results"]
    if n in ("Edit","Write","MultiEdit"): return ["edit",f"editing {short or 'a file'}"]
    if n=="Read": return ["read",f"reading {short or 'a file'}"]
    if n in ("Grep","Glob"): return ["search",f"searching {(inp.get('pattern','') or '')[:26]}"]
    if n=="Bash": return ["run",f"$ {(inp.get('command','') or '')[:40]}"]
    return ["tool",n.lower()]

def _tooluses(evs):
    """yield (name, input) tool_uses in order; with text reasoning lines marked."""
    for ev in evs:
        if ev.get("type")!="assistant": continue
        c=ev.get("message",{}).get("content")
        if not isinstance(c,list): continue
        for b in c:
            if isinstance(b,dict) and b.get("type")=="tool_use":
                yield ("tool", b.get("name",""), b.get("input",{}) or {})
            elif isinstance(b,dict) and b.get("type")=="text" and b.get("text","").strip():
                yield ("text", b["text"].strip().split("\n")[0][:64], None)

def action(evs):
    last=None
    for kind,a,b in _tooluses(evs):
        last=_label(a,b) if kind=="tool" else ["think",a]
    return last or ["wait","spinning up"]

def trail(evs,n=5):
    seq=[]
    for kind,a,b in _tooluses(evs):
        seq.append(_label(a,b) if kind=="tool" else ["think",a])
    return seq[-n:]

def edits_of(evs):
    d={}
    for kind,a,b in _tooluses(evs):
        if kind=="tool" and a in ("Edit","Write","MultiEdit"):
            fp=(b.get("file_path") or "")
            if fp: d[os.path.basename(fp)]=d.get(os.path.basename(fp),0)+1
    return d

def outcomes(evs):
    o=[]
    for ev in evs:
        if ev.get("type")!="assistant": continue
        c=ev.get("message",{}).get("content")
        if not isinstance(c,list): continue
        for b in c:
            if isinstance(b,dict) and b.get("type")=="tool_use" and b.get("name")=="StructuredOutput":
                for x in (b.get("input",{}) or {}).get("outcomes",[]):
                    if isinstance(x,dict) and x.get("id"): o.append(x)
    return o

def tool_count(evs):
    n=0
    for ev in evs:
        if ev.get("type")!="assistant": continue
        c=ev.get("message",{}).get("content")
        if isinstance(c,list): n+=sum(1 for b in c if isinstance(b,dict) and b.get("type")=="tool_use")
    return n

def tokens_of(evs):
    o=0;t=0
    for ev in evs:
        if ev.get("type")!="assistant": continue
        u=ev.get("message",{}).get("usage") or {}
        o+=u.get("output_tokens",0)
        t+=u.get("input_tokens",0)+u.get("output_tokens",0)+u.get("cache_read_input_tokens",0)+u.get("cache_creation_input_tokens",0)
    return [o,t]

def main():
    now=time.time()
    st=json.load(open(STATE)) if os.path.exists(STATE) else {"files":{},"events":[],"history":[],"counts":{}}
    cache=st.get("files",{})
    def newest(d):
        fs=glob.glob(d+"/agent-*.jsonl"); return max((os.path.getmtime(f) for f in fs),default=0)
    alld=[d for d in glob.glob(f"{WF_PARENT}/wf_*") if os.path.isdir(d)]
    gmax=max((newest(d) for d in alld),default=now)
    dirs=[d for d in alld if newest(d)>=gmax-300]

    agents=[]
    for d in dirs:
        for fp in glob.glob(d+"/agent-*.jsonl"):
            mt=os.path.getmtime(fp); key=fp
            c=cache.get(key)
            if c and c.get("mtime")==mt and c.get("done") and "tok" in c.get("a",{}):
                agents.append(c["a"]); continue
            evs=read_events(fp); ids=first_ids(evs)
            if not ids: continue
            outs=outcomes(evs); done=len(outs)>0
            a={"ids":ids,"feats":feats_of(ids),"total":len(ids),
               "fixed":sum(1 for o in outs if o.get("action") in ("fixed","already-ok")),
               "done":done,"fresh":(now-mt)<22,
               "act":action(evs),"tools":tool_count(evs),"trail":trail(evs,18),"edits":edits_of(evs),
               "tok":tokens_of(evs),
               "start":first_ts(evs) or mt,"last":last_ts(evs) or mt,
               "note":(outs[-1].get("note","")[:160] if outs else ""),
               "fixedids":[o["id"] for o in outs if o.get("action") in ("fixed","already-ok")],
               "sevmix":_sevmix(ids)}
            cache[key]={"mtime":mt,"done":done,"a":a}
            agents.append(a)

    agents.sort(key=lambda a:a["ids"][0] if a["ids"] else "z")
    for i,a in enumerate(agents): a["name"]=NAMES[i%len(NAMES)]

    # events: diff fixed-id sets + lifecycle vs prior counts
    prev=st.get("counts",{}); events=st.get("events",[])
    for a in agents:
        sig=a["ids"][0]; pc=prev.get(sig,{"fixed":0,"online":False,"done":False})
        if not pc.get("online"):
            events.append({"t":now,"kind":"online","who":a["name"],"text":f'{a["name"]} online · {a["feats"][0] if a["feats"] else "batch"}'})
        if a["fixed"]>pc.get("fixed",0):
            newly=a["fixedids"][pc.get("fixed",0):]
            for fid in newly:
                events.append({"t":now,"kind":"fix","who":a["name"],"text":f'{a["name"]} fixed {fid}','sev':sev_id(fid)})
        if a["done"] and not pc.get("done"):
            events.append({"t":now,"kind":"done","who":a["name"],"text":f'{a["name"]} cleared its batch — {a["fixed"]}/{a["total"]}'})
        prev[sig]={"fixed":a["fixed"],"online":True,"done":a["done"]}
    events=events[-60:]

    # totals + severity
    try: scope=json.load(open("/tmp/run_scope.json")); total=len(scope)
    except: total=sum(a["total"] for a in agents)
    started=sum(a["total"] for a in agents); total=max(total,started)
    fixed=sum(a["fixed"] for a in agents)
    sev_tot={"critical":0,"high":0,"medium":0,"low":0}; sev_fix={"critical":0,"high":0,"medium":0,"low":0}
    for a in agents:
        for i in a["ids"]: sev_tot[sev_id(i)]=sev_tot.get(sev_id(i),0)+1
        for i in a["fixedids"]: sev_fix[sev_id(i)]=sev_fix.get(sev_id(i),0)+1

    hist=st.get("history",[])
    if not hist or now-hist[-1][0]>=5: hist.append([now,fixed]); hist=hist[-400:]
    # throughput: try progressively wider windows, then whole-session average
    def rate_over(sec):
        win=[h for h in hist if now-h[0]<=sec]
        if len(win)>=2 and win[-1][0]>win[0][0] and win[-1][1]>win[0][1]:
            return (win[-1][1]-win[0][1])/(win[-1][0]-win[0][0])*60.0
        return 0.0
    rate=rate_over(120) or rate_over(300) or rate_over(99999)
    remaining=total-fixed
    if remaining<=0: eta=0
    elif rate>0.04: eta=int(remaining/rate*60)
    else: eta=None

    # ── mosaic: every scope finding as a cell, status-colored ──
    fixedset=set(); progset=set()
    for a in agents:
        fixedset.update(a["fixedids"])
        if not a["done"]:
            for i in a["ids"]:
                if i not in a["fixedids"]: progset.add(i)
    try: scope_ids=json.load(open("/tmp/run_scope.json"))
    except: scope_ids=sorted({i for a in agents for i in a["ids"]})
    sord={"critical":0,"high":1,"medium":2,"low":3}
    cells=sorted(scope_ids,key=lambda i:(sord.get(sev_id(i),4),i))
    cells=[{"id":i,"sev":sev_id(i),"st":("fix" if i in fixedset else "prog" if i in progset else "pend")} for i in cells]

    # reconstruct a fix-timeline from agent timings (spread each agent's fixes across its active window)
    fixlog=[]
    for a in agents:
        n=len(a["fixedids"]); s=a["start"]; e=max(a["last"],a["start"]+1)
        for i,fid in enumerate(a["fixedids"]):
            fixlog.append([round(s+((i+1)/max(n,1))*(e-s),1),fid,sev_id(fid)])
    fixlog.sort()

    # ── per-feature kanban rollup ──
    kan={}
    for i in scope_ids:
        f=("CoachHelm engine" if "-" in i else feat.get(i,"other"))
        d=kan.setdefault(f,{"feat":f,"total":0,"fixed":0,"prog":0})
        d["total"]+=1
        if i in fixedset: d["fixed"]+=1
        elif i in progset: d["prog"]+=1
    kanban=sorted(kan.values(),key=lambda d:(-d["fixed"]/max(d["total"],1),-d["total"]))

    # ── finding descriptions (for the agent drawer) ──
    fdesc={}
    try:
        import csv as _c
        for r in _c.DictReader(open(CSVP)):
            if r["id"] in set(scope_ids): fdesc[r["id"]]=r["sub_feature"][:80]
    except Exception: pass

    # ── hottest files (aggregate edit counts across agents) ──
    hot={}
    for a in agents:
        for f,c in (a.get("edits") or {}).items(): hot[f]=hot.get(f,0)+c
    hotfiles=sorted(hot.items(),key=lambda x:-x[1])[:9]

    # ── tokens ──
    tok_out=sum((a.get("tok") or [0,0])[0] for a in agents)
    tok_tot=sum((a.get("tok") or [0,0])[1] for a in agents)

    # ── git pulse ──
    git={"files":0,"ins":0,"dele":0}
    try:
        import subprocess
        out=subprocess.run(["git","-C",REPO,"diff","--shortstat"],capture_output=True,text=True,timeout=4).stdout
        mf=re.search(r"(\d+) files? changed",out); mi=re.search(r"(\d+) insertion",out); md=re.search(r"(\d+) deletion",out)
        git={"files":int(mf.group(1)) if mf else 0,"ins":int(mi.group(1)) if mi else 0,"dele":int(md.group(1)) if md else 0}
    except Exception: pass
    elapsed=int(now-min((a["start"] for a in agents),default=now))

    status={
      "now":now,"total":total,"fixed":fixed,"started":started,
      "cells":cells,"hotfiles":hotfiles,"git":git,"elapsed":elapsed,
      "kanban":kanban,"fdesc":fdesc,"fixlog":fixlog[-302:],"tok_out":tok_out,"tok_tot":tok_tot,
      "t0":(min((a["start"] for a in agents),default=now)),
      "working":sum(1 for a in agents if not a["done"] and a["fresh"]),
      "doneA":sum(1 for a in agents if a["done"]),
      "online":len(agents),
      "rate":round(rate,1),"eta":eta,
      "sev_tot":sev_tot,"sev_fix":sev_fix,
      "spark":[h[1] for h in hist[-60:]],
      "events":list(reversed(events[-40:])),
      "agents":[{**{k:a[k] for k in ("name","feats","total","fixed","done","fresh","act","tools","trail","start","last","note","sevmix")},
                 "ids":a["ids"],"fixedids":a["fixedids"],"tok":a.get("tok",[0,0])} for a in agents],
    }
    # atomic writes — never let the server read a half-written file (was the "glitch")
    def atomic(path,obj):
        tmp=path+".tmp";
        with open(tmp,"w") as f: json.dump(obj,f)
        os.replace(tmp,path)
    atomic(STATUS,status)
    atomic(STATE,{"files":cache,"events":events,"history":hist,"counts":prev})
    # frozen, self-contained report once the run is essentially complete
    if status["working"]==0 and status["doneA"]>0 and fixed>0:
        try:
            tpl=open(f"{HQ}/report_tpl.html").read()
            atomic(f"{HQ}/report.html", None) if False else open(f"{HQ}/report.html","w").write(
                tpl.replace("/*__DATA__*/", json.dumps(status)))
        except Exception: pass

def _sevmix(ids):
    m={"critical":0,"high":0,"medium":0,"low":0}
    for i in ids: m[sev_id(i)]=m.get(sev_id(i),0)+1
    return m

if __name__=="__main__":
    main(); print(STATUS)

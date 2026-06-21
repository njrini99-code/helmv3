#!/usr/bin/env python3
"""
Live agent dashboard — one self-refreshing HTML page showing every remediation agent:
its codename, what findings/features it owns, live status, what it's doing RIGHT NOW,
and findings fixed so far. Reads the running workflow transcripts each tick.

Run once per tick (an outer loop regenerates it); the HTML meta-refreshes itself.
"""
import json, glob, os, re, sys, time, html

REPO = "/Users/ricknini/Downloads/helmv3"
WF_PARENT = "/Users/ricknini/.claude/projects/-Users-ricknini/f091ec6b-b133-4061-91a2-2e5a2aff285f/subagents/workflows"
CSV = f"{REPO}/docs/audits/_premium_scrub_2026-06-21/FINDINGS_CALIBRATED.csv"
OUT = "/Users/ricknini/Desktop/helm_agents_live.html"

NAMES = ["Eagle","Birdie","Albatross","Ace","Mulligan","Fairway","Bunker","Divot","Niblick","Mashie",
"Brassie","Stinger","Draw","Fade","Flop","Pitch","Chip","Lag","Tempo","Grip","Stance","Pin","Flag",
"Apron","Fringe","Rough","Tee","Hazard","Dogleg","Links","Bogey","Sandy","Scramble","Wedge","Hybrid",
"Driver","Putter","Cleat","Visor","Caddie","Yips","Gimme","Snowman","Shank","Whiff","Slice","Hook","Carry"]

# feature lookup
feat={}
try:
    import csv as _csv
    for r in _csv.DictReader(open(CSV)):
        feat[r["id"]]=r["feature"].replace("holistic:","global:")
except Exception:
    pass
def feat_of(ids):
    fs=[]
    for i in ids:
        if i.startswith("P") and "-" in i: fs.append("CoachHelm engine")
        elif i in feat: fs.append(feat[i])
    # dedupe preserve order
    seen=[]; [seen.append(f) for f in fs if f not in seen]
    return seen[:4]

def parse_first_ids(events):
    for ev in events:
        if ev.get("type")=="user":
            msg=ev.get("message",{})
            c=msg.get("content")
            txt=c if isinstance(c,str) else " ".join(b.get("text","") for b in c if isinstance(b,dict)) if isinstance(c,list) else ""
            m=re.search(r"Your finding IDs:\s*([^\n]+)", txt)
            if m: return [x.strip() for x in m.group(1).split(",") if x.strip()]
    return []

def last_action(events):
    """Most recent meaningful tool use → human label."""
    for ev in reversed(events):
        if ev.get("type")!="assistant": continue
        msg=ev.get("message",{}); content=msg.get("content")
        if not isinstance(content,list): continue
        for b in reversed(content):
            if not isinstance(b,dict): continue
            if b.get("type")=="tool_use":
                n=b.get("name",""); inp=b.get("input",{}) or {}
                fp=inp.get("file_path") or inp.get("path") or ""
                short=os.path.basename(fp) if fp else ""
                if n=="StructuredOutput": return ("✅","wrapping up — writing results")
                if n in ("Edit","Write","MultiEdit"): return ("✏️", f"editing {short or 'a file'}")
                if n=="Read": return ("📖", f"reading {short or 'a file'}")
                if n in ("Grep","Glob"): return ("🔎", f"searching ({inp.get('pattern','')[:30]})")
                if n=="Bash":
                    cmd=(inp.get("command","") or "")[:46]
                    return ("⚙️", f"running: {cmd}")
                return ("🔧", n.lower())
            if b.get("type")=="text" and b.get("text","").strip():
                return ("💭", b["text"].strip().split("\n")[0][:70])
    return ("⏳","starting up")

def harvest_outcomes(events):
    outs=[]
    for ev in events:
        if ev.get("type")!="assistant": continue
        content=ev.get("message",{}).get("content")
        if not isinstance(content,list): continue
        for b in content:
            if isinstance(b,dict) and b.get("type")=="tool_use" and b.get("name")=="StructuredOutput":
                inp=b.get("input",{}) or {}
                for o in inp.get("outcomes",[]):
                    if isinstance(o,dict) and o.get("id"): outs.append(o)
    return outs

def read_events(fp):
    evs=[]
    try:
        for ln in open(fp,encoding="utf-8",errors="ignore"):
            if not ln.strip(): continue
            try: evs.append(json.loads(ln))
            except: pass
    except: pass
    return evs

def build():
    now=time.time()
    # only the LIVE cohort: dirs whose newest transcript is within 5 min of the most
    # recent activity anywhere (excludes the dead burst-attempt runs that stopped ~15 min ago)
    def newest(d):
        fs=glob.glob(d+"/agent-*.jsonl")
        return max((os.path.getmtime(f) for f in fs), default=0)
    alldirs=[d for d in glob.glob(f"{WF_PARENT}/wf_*") if os.path.isdir(d)]
    gmax=max((newest(d) for d in alldirs), default=now)
    dirs=[d for d in alldirs if newest(d) >= gmax-300]
    agents=[]
    for d in dirs:
        for fp in glob.glob(d+"/agent-*.jsonl"):
            evs=read_events(fp)
            ids=parse_first_ids(evs)
            if not ids: continue
            outs=harvest_outcomes(evs)
            done=len(outs)>0
            mtime=os.path.getmtime(fp)
            fresh=(now-mtime)<25
            emoji,act=last_action(evs)
            fixed=sum(1 for o in outs if o.get("action") in ("fixed","already-ok"))
            agents.append({"ids":ids,"feats":feat_of(ids),"outs":outs,"done":done,"fresh":fresh,
                           "emoji":emoji,"act":act,"fixed":fixed,"total":len(ids),"mtime":mtime,
                           "last_note":(outs[-1].get("note","")[:140] if outs else "")})
    # stable naming by first id
    agents.sort(key=lambda a:a["ids"][0] if a["ids"] else "z")
    for i,a in enumerate(agents): a["name"]=NAMES[i%len(NAMES)]

    started=sum(a["total"] for a in agents)
    try: total_findings=len(json.load(open("/tmp/run_scope.json")))
    except Exception: total_findings=started
    total_findings=max(total_findings, started)
    total_fixed=sum(a["fixed"] for a in agents)
    running=sum(1 for a in agents if not a["done"])
    done_agents=sum(1 for a in agents if a["done"])
    pct=int(100*total_fixed/total_findings) if total_findings else 0

    def card(a):
        if a["done"]:
            dot="#16a34a"; badge=f"done · {a['fixed']}/{a['total']} fixed"; cls="done"
        elif a["fresh"]:
            dot="#3b82f6"; badge=f"working · {a['fixed']}/{a['total']}"; cls="run"
        else:
            dot="#f59e0b"; badge="idle/queued"; cls="idle"
        feats=" · ".join(html.escape(f) for f in a["feats"]) or "—"
        nowline = "finished ✅" if a["done"] else f'{a["emoji"]} {html.escape(a["act"])}'
        note=html.escape(a["last_note"]) if a["last_note"] else ""
        return f'''<div class="card {cls}">
  <div class="hd"><span class="dot" style="background:{dot}"></span><b>{a["name"]}</b><span class="badge">{badge}</span></div>
  <div class="feat">{feats}</div>
  <div class="ids">{html.escape(" ".join(a["ids"]))}</div>
  <div class="now">{nowline}</div>
  {f'<div class="note">{note}</div>' if note else ''}
</div>'''

    cards="\n".join(card(a) for a in agents)
    stamp=time.strftime("%H:%M:%S")
    return f'''<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="4">
<title>Helm Agents — Live</title>
<style>
 :root{{--bg:#0b0f0d;--card:#13191620;--ink:#e7efe9;--mut:#8aa399;--grn:#16a34a}}
 *{{box-sizing:border-box}} body{{margin:0;background:radial-gradient(1200px 600px at 70% -10%,#15241b,#0b0f0d);color:var(--ink);font:14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif}}
 .wrap{{max-width:1320px;margin:0 auto;padding:26px}}
 h1{{font-size:22px;margin:0 0 2px;letter-spacing:-.3px}} .sub{{color:var(--mut);font-size:13px;margin-bottom:18px}}
 .bar{{height:14px;border-radius:9px;background:#1c2622;overflow:hidden;margin:14px 0 6px;border:1px solid #233028}}
 .fill{{height:100%;background:linear-gradient(90deg,#15803d,#22c55e);width:{pct}%;transition:width .6s}}
 .stats{{display:flex;gap:22px;flex-wrap:wrap;color:var(--mut);font-size:13px;margin-bottom:20px}}
 .stats b{{color:var(--ink);font-size:19px}}
 .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}}
 .card{{background:#121a16;border:1px solid #20302a;border-radius:14px;padding:13px 14px;box-shadow:0 1px 0 #0006}}
 .card.run{{border-color:#1d4ed833;box-shadow:0 0 0 1px #3b82f622, 0 8px 22px #3b82f615}}
 .card.done{{opacity:.82}}
 .hd{{display:flex;align-items:center;gap:8px;margin-bottom:6px}}
 .dot{{width:10px;height:10px;border-radius:50%;box-shadow:0 0 8px currentColor}}
 .hd b{{font-size:15px}} .badge{{margin-left:auto;font-size:11px;color:var(--mut);background:#0e1612;padding:2px 8px;border-radius:20px;border:1px solid #20302a}}
 .feat{{color:#bfe0cd;font-size:12px;font-weight:600;margin-bottom:3px}}
 .ids{{color:#5f7a6e;font-size:10.5px;font-family:ui-monospace,Menlo,monospace;margin-bottom:8px;word-break:break-all}}
 .now{{font-size:12.5px;color:#e7efe9;background:#0e1612;border:1px solid #20302a;border-radius:8px;padding:6px 9px}}
 .note{{font-size:11px;color:var(--mut);margin-top:6px;border-left:2px solid #16a34a55;padding-left:8px}}
 .live{{display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:6px;animation:p 1.4s infinite}}
 @keyframes p{{0%,100%{{opacity:1}}50%{{opacity:.25}}}}
</style></head><body><div class="wrap">
 <h1>⛳ Helm Remediation — Live Agent Floor</h1>
 <div class="sub"><span class="live"></span>auto-refreshes every 4s · last tick {stamp} · Phase 3 (premium) + Phase 4 (CoachHelm)</div>
 <div class="bar"><div class="fill"></div></div>
 <div class="stats">
   <div><b>{total_fixed}</b> / {total_findings} findings fixed ({pct}%)</div>
   <div><b>{running}</b> agents working</div>
   <div><b>{done_agents}</b> agents done</div>
   <div><b>{len(agents)}</b> on the floor</div>
 </div>
 <div class="grid">
{cards}
 </div>
</div></body></html>'''

if __name__=="__main__":
    open(OUT,"w").write(build())
    print(OUT)

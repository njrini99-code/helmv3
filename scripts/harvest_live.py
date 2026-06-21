#!/usr/bin/env python3
"""Harvest completed-bucket outcomes from a running/finished workflow's transcripts.
Usage: harvest_live.py <transcript_dir> [more_dirs...]  -> writes /tmp/live_outcomes.json"""
import json, sys, glob, os, re

def harvest(dirs):
    outcomes={}
    for d in dirs:
        for fp in glob.glob(os.path.join(d,'agent-*.jsonl')):
            try: lines=open(fp,encoding='utf-8',errors='ignore').read().splitlines()
            except: continue
            for ln in lines:
                if 'StructuredOutput' not in ln and '"outcomes"' not in ln: continue
                try: ev=json.loads(ln)
                except: continue
                # walk for tool_use input with outcomes[]
                def scan(obj):
                    found=[]
                    if isinstance(obj,dict):
                        if obj.get('name')=='StructuredOutput' and isinstance(obj.get('input'),dict) and 'outcomes' in obj['input']:
                            found.append(obj['input'])
                        if 'outcomes' in obj and isinstance(obj['outcomes'],list) and 'summary' in obj:
                            found.append(obj)
                        for v in obj.values(): found+=scan(v)
                    elif isinstance(obj,list):
                        for v in obj: found+=scan(v)
                    return found
                for inp in scan(ev):
                    for o in inp.get('outcomes',[]):
                        if isinstance(o,dict) and o.get('id'):
                            outcomes[o['id']]={'action':o.get('action','fixed'),'note':o.get('note',''),'files':o.get('files',[])}
    return outcomes

dirs=sys.argv[1:]
out=harvest(dirs)
json.dump(out, open('/tmp/live_outcomes.json','w'))
from collections import Counter
print("harvested findings:", len(out), "|", dict(Counter(v['action'] for v in out.values())))

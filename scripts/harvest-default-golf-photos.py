#!/usr/bin/env python3
"""
Harvest CINEMATIC, free-for-commercial golf photos from Openverse (CC search
engine) to serve as the DEFAULT course-card hero set. Only commercial+
modification licenses. Output: ranked candidates with thumbnail URL (for visual
QA), full image URL, dimensions, license + attribution. Nothing committed yet.
"""
import json, sys, time, urllib.parse, urllib.request

UA = "HelmSportsLabs-CourseImageResearch/1.0 (njrini99@gmail.com)"
API = "https://api.openverse.org/v1/images/"

QUERIES = [
    "golf course sunset",
    "golf course aerial drone",
    "golf links ocean coast",
    "golf course fairway morning",
    "golf course dawn fog mist",
    "golf green flag landscape",
    "links golf scotland dunes",
    "golf course mountains autumn",
]

def get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

BAD = ("sign", "logo", "scorecard", "map", "ball", "clubhouse", "cart ",
       "indoor", "trophy", "minigolf", "mini golf", "putt-putt")

seen = {}
for q in QUERIES:
    try:
        d = get({"q": q, "license_type": "commercial,modification",
                 "size": "large", "aspect_ratio": "wide", "page_size": 12})
    except Exception as e:
        print(f"[ERR] {q}: {e}", file=sys.stderr); continue
    for r in d.get("results", []):
        w = int(r.get("width") or 0); h = int(r.get("height") or 0)
        if w < 1600 or w <= h:           # require large + landscape
            continue
        title = (r.get("title") or "").lower()
        if any(b in title for b in BAD):
            continue
        if (r.get("filetype") or "jpg") not in ("jpg", "jpeg", "png", None):
            continue
        rid = r["id"]
        if rid in seen:
            continue
        seen[rid] = {
            "id": rid, "title": r.get("title"), "q": q,
            "url": r.get("url"), "thumb": r.get("thumbnail"),
            "w": w, "h": h, "license": f'{r.get("license")} {r.get("license_version")}',
            "creator": r.get("creator"), "attribution": r.get("attribution"),
            "source": r.get("source"),
        }
    time.sleep(0.5)

cands = sorted(seen.values(), key=lambda c: c["w"], reverse=True)
print(json.dumps(cands, indent=2))
print(f"{len(cands)} unique candidates", file=sys.stderr)

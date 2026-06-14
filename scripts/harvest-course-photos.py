#!/usr/bin/env python3
"""
Harvest FREE-LICENSED course photos from Wikimedia Commons for the real courses
in the GolfHelm system. Only public-domain / CC0 / CC-BY / CC-BY-SA files are
kept. Output is a vetted candidate list (course -> best photo + license +
attribution) printed as JSON; nothing is downloaded or committed.
"""
import json, sys, time, urllib.parse, urllib.request

UA = "HelmSportsLabs-CourseImageResearch/1.0 (njrini99@gmail.com)"
API = "https://commons.wikimedia.org/w/api.php"

# (id, name, search-hint, must_match[any-of])  must_match = relevance gate:
# at least one phrase must appear in the file title or description, else the
# candidate is rejected as a coincidental keyword hit.
COURSES = [
    ("c700788a-913f-47f2-81be-7e43ae6132cb", "Bethpage Black", "Bethpage Black golf course", ["bethpage"]),
    ("ee257690-fe52-4008-8ad2-ad8d2c617775", "Club at Savannah Habor", "Savannah Harbor golf course", ["savannah harbor", "savannah harbour"]),
    ("29034e4c-3a70-46b1-95b3-02b1d41b7529", "Forest Creek", "Forest Creek golf course", ["forest creek"]),
    ("8dfc10c6-4e50-4b84-afa6-276b8e08cb7c", "Golden Horseshoe gold course", "Golden Horseshoe golf Williamsburg", ["golden horseshoe"]),
    ("3b5b7d54-3784-4424-ae56-2d96bdb37bf8", "Harbour Town Golf Links", "Harbour Town Golf Links Hilton Head", ["harbour town"]),
    ("eaefce7a-9221-43dd-8026-6c49ee572aee", "Isleworth Golf & Country Club", "Isleworth golf Windermere Florida", ["isleworth"]),
    ("7c598ed3-7f89-433b-af73-e173105495c0", "Kiawah Island - Ocean Course", "Kiawah Island Ocean Course golf", ["kiawah", "ocean course"]),
    ("ea5a2fec-24fc-47e5-9690-53fe6825b984", "Marsh Landing Country Club", "Marsh Landing Country Club Ponte Vedra golf", ["marsh landing"]),
    ("9dcd1de8-126e-4287-b299-f9cc0ccb4526", "Pebble Beach Golf Club", "Pebble Beach Golf Links", ["pebble beach"]),
    ("aa1a29be-a49a-42b3-9adf-491b996e048a", "Pebble Beach Golf Links", "Pebble Beach Golf Links", ["pebble beach"]),
    ("7e9eb781-cadc-48ce-929f-1cf82f528126", "Pine Lakes Jekyll Island", "Pine Lakes golf Jekyll Island", ["pine lakes", "jekyll island golf"]),
    ("71c4eebc-f555-42f9-962f-9d16814e6172", "Pinehurst No. 2", "Pinehurst Number 2 golf course", ["pinehurst"]),
    ("a5e38378-62a4-4cbf-ba2a-edc88df0fdc8", "Poplar Grove (real)", "Poplar Grove golf course", ["poplar grove"]),
    ("39edfa12-c60f-4f14-b9f7-efabe30cafdf", "Reynolds Lake Oconee - Great Waters", "Reynolds Lake Oconee Great Waters golf", ["reynolds", "oconee", "great waters"]),
    ("1a9cf111-0347-4e90-9431-6e6e5a46a512", "Sawgrass Country Club", "Sawgrass golf Ponte Vedra", ["sawgrass"]),
    ("7de64d20-2781-4a86-81ed-8b2fff616226", "Sea Island - Seaside Course", "Sea Island Seaside Course golf Georgia", ["sea island", "seaside course golf"]),
    ("65069f6c-9576-4a22-8ade-ef11e2a28574", "The Cardinal", "Cardinal golf course Greensboro Pete Dye", ["cardinal"]),
    ("eb58f1c3-2e78-42bd-bdb9-3f0bbe4c5b55", "TPC Sawgrass", "TPC Sawgrass golf", ["sawgrass"]),
    ("0b630d08-525c-45c2-8cb1-5de36aa8db54", "TPC Sawgrass - Stadium", "TPC Sawgrass Stadium golf", ["sawgrass"]),
    ("18090c9b-2e97-4ab6-98eb-0a90266ff1ce", "Whistling Straits", "Whistling Straits golf course", ["whistling strait"]),
    ("40be0a21-ddde-4dc7-8b70-3640d11a2d3c", "World Golf Village - King & Bear", "King and Bear World Golf Village golf", ["king and bear", "world golf village"]),
]
# Per-course title/description tokens that disqualify a candidate (wrong subject).
EXCLUDE_PER_COURSE = {
    "Pinehurst No. 2": ["no. four", "no. 4", " 4 ", "number 4", "no. five", "no. 5", "no. 8", "no. eight"],
    "The Cardinal": ["bird", "cardinalis", "baseball", "cardinale", "richelieu", "church"],
}

FREE_TOKENS = ("cc0", "cc-by", "public domain", "pd-", "no restrictions", "attribution")
# License short-names we accept (lowercased substring match)
def is_free(lic_short, lic_url, usage):
    blob = " ".join(x.lower() for x in (lic_short or "", lic_url or "", usage or ""))
    if "noncommercial" in blob or "nc" == (lic_short or "").lower() or "-nc" in blob:
        return False
    if "noderiv" in blob or "-nd" in blob:
        return False
    return any(t in blob for t in FREE_TOKENS) or "creativecommons.org/publicdomain" in blob

def get(params):
    params = {**params, "format": "json"}
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)

def search_files(hint, limit=12):
    d = get({"action": "query", "list": "search", "srnamespace": 6,
             "srlimit": limit, "srsearch": hint})
    return [s["title"] for s in d.get("query", {}).get("search", [])]

def imageinfo(titles):
    if not titles:
        return {}
    d = get({"action": "query", "titles": "|".join(titles), "prop": "imageinfo",
             "iiprop": "url|size|extmetadata|mime"})
    out = {}
    for page in d.get("query", {}).get("pages", {}).values():
        ii = page.get("imageinfo")
        if ii:
            out[page["title"]] = ii[0]
    return out

BAD_WORDS = ("sign", "logo", "map", "diagram", "scorecard", "plaque", "clubhouse interior",
             "portrait", "trophy", "banner", "sink", "kitchen", "bathroom", "restaurant",
             "hotel room", "bedroom", "interior", ".svg")
OK_MIME = ("image/jpeg", "image/png", "image/webp")
MIN_W = 1000
GOOD_WORDS = ("hole", "green", "fairway", "course", "links", "tee", "bunker", "lighthouse",
              "aerial", "view", "island green", "18th", "17th")

def score(title, info):
    w = int(info.get("width") or 0)
    h = int(info.get("height") or 0)
    meta = info.get("extmetadata", {})
    desc = (meta.get("ImageDescription", {}).get("value", "") or "").lower()
    t = title.lower()
    s = 0.0
    if w >= 2000: s += 3
    elif w >= 1200: s += 2
    elif w >= 800: s += 1
    if w > h: s += 2          # landscape preferred for hero
    for g in GOOD_WORDS:
        if g in t or g in desc: s += 1.2
    for b in BAD_WORDS:
        if b in t or b in desc: s -= 4
    if (info.get("mime") or "").startswith("image") and "svg" not in (info.get("mime") or ""):
        s += 0.5
    return s

import re
results = []
for cid, name, hint, must_match in COURSES:
    excl = EXCLUDE_PER_COURSE.get(name, [])
    try:
        titles = search_files(hint, limit=20)
        info = imageinfo(titles)
        cands = []
        for t in titles:
            i = info.get(t)
            if not i:
                continue
            meta = i.get("extmetadata", {})
            lic_short = meta.get("LicenseShortName", {}).get("value")
            lic_url = meta.get("LicenseUrl", {}).get("value")
            usage = meta.get("UsageTerms", {}).get("value")
            if not is_free(lic_short, lic_url, usage):
                continue
            mime = i.get("mime") or ""
            if mime not in OK_MIME:
                continue
            w = int(i.get("width") or 0); h = int(i.get("height") or 0)
            if w < MIN_W:
                continue
            if w and h and (w / h > 3 or h / w > 1.6):   # banners / tall portraits
                continue
            desc = (meta.get("ImageDescription", {}).get("value", "") or "")
            hay = (t + " " + desc).lower()
            if must_match and not any(m in hay for m in must_match):
                continue                                  # relevance gate
            if any(x in hay for x in excl):
                continue                                  # wrong subject
            artist = meta.get("Artist", {}).get("value", "")
            artist = re.sub("<[^>]+>", "", artist).strip()
            cands.append({
                "title": t,
                "score": round(score(t, i), 2),
                "url": i.get("url"),
                "descurl": i.get("descriptionurl"),
                "width": i.get("width"), "height": i.get("height"),
                "license": lic_short, "license_url": lic_url,
                "artist": artist[:120],
            })
        cands.sort(key=lambda c: c["score"], reverse=True)
        results.append({"id": cid, "name": name, "n_free": len(cands),
                        "top": cands[:8]})
        print(f"[{len(cands):2d} free] {name}", file=sys.stderr)
    except Exception as e:
        results.append({"id": cid, "name": name, "error": str(e)})
        print(f"[ERR] {name}: {e}", file=sys.stderr)
    time.sleep(0.4)

print(json.dumps(results, indent=2))

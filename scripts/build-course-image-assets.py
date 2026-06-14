#!/usr/bin/env python3
"""
Build the bundled course-image asset set (both-layered imagery).

Reads the vetted candidate JSONs produced by the harvesters, downloads the
chosen full-res sources, strips EXIF, resizes to <=1600px wide, and writes
optimized .webp into public/courses/{defaults,real}/. Emits an asset manifest
(slug -> file + license + attribution) consumed by the TS generator and CREDITS.

Only free-for-commercial sources: CC0 / public domain / CC BY / CC BY-SA.
"""
import json, os, io, sys, urllib.request
from PIL import Image

ROOT = "/Users/ricknini/Downloads/helmv3"
PUB = os.path.join(ROOT, "public", "courses")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) HelmSportsLabs/1.0 njrini99@gmail.com"
MAXW = 1600

real_src = {c["name"]: c for c in json.load(open("/tmp/course-photos.json"))}
defs_src = json.load(open("/tmp/dg_keep.json"))

# --- curated selections --------------------------------------------------
# real: (display_name, top-index, normalized_name, slug)
REAL = [
    ("Bethpage Black", 0, "bethpage black", "bethpage-black"),
    ("Harbour Town Golf Links", 6, "harbour town golf links", "harbour-town"),
    ("Kiawah Island - Ocean Course", 0, "kiawah island - ocean course", "kiawah-ocean"),
    ("Pebble Beach Golf Club", 0, "pebble beach golf club", "pebble-beach"),
    ("Pebble Beach Golf Links", 0, "pebble beach golf links", "pebble-beach"),
    ("Reynolds Lake Oconee - Great Waters", 0, "reynolds lake oconee - great waters", "reynolds-great-waters"),
    ("TPC Sawgrass", 0, "tpc sawgrass", "tpc-sawgrass"),
    ("TPC Sawgrass - Stadium", 0, "tpc sawgrass - stadium", "tpc-sawgrass"),   # reuse TPC img
    ("Whistling Straits", 0, "whistling straits", "whistling-straits"),
]
# default: (keep-index, slug)
DEFAULTS = [
    (9,  "sunset-moon"),
    (6,  "red-flag-green"),
    (25, "dramatic-sky"),
    (3,  "sun-flare-fairway"),
    (22, "aerial"),
    (1,  "bunker-palms"),
    (7,  "green-pond"),
    (4,  "links-bunker"),
]

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

def optimize(raw, out_path):
    im = Image.open(io.BytesIO(raw))
    im = im.convert("RGB")                      # drops alpha + EXIF
    w, h = im.size
    if w > MAXW:
        im = im.resize((MAXW, round(h * MAXW / w)), Image.LANCZOS)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    im.save(out_path, "WEBP", quality=82, method=6)
    return im.size

manifest = {"defaults": [], "real": []}

print("== defaults ==")
done = {}
for idx, slug in DEFAULTS:
    c = defs_src[idx]
    out = os.path.join(PUB, "defaults", slug + ".webp")
    size = optimize(fetch(c["url"]), out)
    manifest["defaults"].append({
        "slug": slug, "file": f"/courses/defaults/{slug}.webp",
        "license": f'{c["license"]}', "attribution": c.get("attribution") or "",
        "title": c.get("title"), "source": c.get("source"), "w": size[0], "h": size[1],
    })
    print(f"  {slug:18s} {size[0]}x{size[1]}  {c['license']}")

print("== real ==")
slug_meta = {}
for name, ti, norm, slug in REAL:
    out = os.path.join(PUB, "real", slug + ".webp")
    if slug not in done:
        # canonical source for this slug (first occurrence defines the file)
        t = real_src[name]["top"][ti]
        size = optimize(fetch(t["url"]), out)
        done[slug] = size
        slug_meta[slug] = t
        print(f"  {slug:22s} {size[0]}x{size[1]}  {t['license']}  <- {name}")
    t = slug_meta[slug]
    size = done[slug]
    manifest["real"].append({
        "normalized_name": norm, "slug": slug, "file": f"/courses/real/{slug}.webp",
        "license": t["license"], "artist": t.get("artist") or "",
        "title": t["title"], "descurl": t.get("descurl"), "w": size[0], "h": size[1],
    })

json.dump(manifest, open("/tmp/asset-manifest.json", "w"), indent=2)
print("\nmanifest -> /tmp/asset-manifest.json")
print(f"defaults: {len(manifest['defaults'])}  real-mappings: {len(manifest['real'])}  unique-real-files: {len(done)}")

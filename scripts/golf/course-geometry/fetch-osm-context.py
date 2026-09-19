"""Retain a bounded Overpass extract of the outside world around one course.

Companion to fetch-osm-course.py. The golf extract carries playing surfaces,
holes, water and cart paths; this extract carries the non-playing context the
production player view needs to explain the land around the hole (outside-
world spec 2026-09-16 §5, §13–14): buildings, woods, wetlands, streams, roads,
service roads, paths, parking, fences, walls, bridges and lifts. Geometry is
retained unchanged as an immutable gzip + manifest and classified later by
prepare-context-layer.py; nothing here is invented or filtered by taste.

Usage:
  python3 scripts/golf/course-geometry/fetch-osm-context.py \
    scripts/golf/course-geometry/pilots/<course>.json \
    src/test/fixtures/course-geometry/sources/<course>-osm-context
"""
import argparse
import datetime as dt
import gzip
import hashlib
import json
import urllib.parse
import urllib.request
from pathlib import Path

ENDPOINT = 'https://overpass-api.de/api/interpreter'
MAX_BYTES = 12_000_000
CONTEXT_TAGS = ['highway', 'building', 'natural', 'landuse', 'waterway', 'man_made', 'barrier', 'amenity', 'leisure', 'aerialway', 'golf']


def query_for(bbox, margin_deg):
    south, west, north, east = bbox[1] - margin_deg, bbox[0] - margin_deg, bbox[3] + margin_deg, bbox[2] + margin_deg
    box = f'{south},{west},{north},{east}'
    ways = ''.join(f'way["{tag}"]({box});' for tag in CONTEXT_TAGS)
    return f'[out:json][timeout:120];({ways});out geom;'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scorecard', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--margin-m', type=float, default=250, help='extra margin around the course bbox (metres)')
    args = parser.parse_args()
    card = json.loads(args.scorecard.read_text())
    bbox = card['bboxWgs84']
    if len(bbox) != 4 or not (bbox[0] < bbox[2] and bbox[1] < bbox[3]) or (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > .01:
        raise ValueError('Course bbox must be [west, south, east, north] and bounded to one facility')
    target = args.output / 'overpass.json.gz'
    if target.exists():
        raise FileExistsError(f'{target} already exists; retained extracts are immutable, choose a new revision directory')
    margin_deg = args.margin_m / 111_000
    query = query_for(bbox, margin_deg)
    request = urllib.request.Request(ENDPOINT, data=urllib.parse.urlencode({'data': query}).encode(),
                                     headers={'User-Agent': 'GolfHelm course-geometry source review (bounded, one request per course revision)'})
    with urllib.request.urlopen(request, timeout=180) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('Overpass response exceeds the bounded extract budget')
    parsed = json.loads(raw)
    elements = parsed.get('elements', [])
    canonical = json.dumps(parsed, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    args.output.mkdir(parents=True, exist_ok=True)
    with gzip.open(target, 'wb', compresslevel=9) as handle:
        handle.write(canonical)
    retrieved_at = dt.datetime.now(dt.UTC).date().isoformat()
    tags = {}
    for element in elements:
        for key, value in (element.get('tags') or {}).items():
            if key in CONTEXT_TAGS:
                tags[f'{key}={value}'] = tags.get(f'{key}={value}', 0) + 1
    manifest = {
        'kind': 'golfhelm-osm-context-extract-v1', 'siteId': card['siteId'], 'slug': card['slug'],
        'bboxWgs84': bbox, 'marginM': args.margin_m, 'query': query, 'retrievedAt': retrieved_at,
        'endpoint': ENDPOINT, 'license': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors',
        'elementCount': len(elements), 'tagCounts': dict(sorted(tags.items())),
        'uncompressedSha256': hashlib.sha256(canonical).hexdigest(),
    }
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print(f'{target} elements={len(elements)} bytes={len(canonical)} sha256={manifest["uncompressedSha256"][:12]}')


if __name__ == '__main__':
    main()

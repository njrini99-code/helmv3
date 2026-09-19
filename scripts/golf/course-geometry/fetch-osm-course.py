"""Retain one bounded Overpass extract for a whole-course source candidate.

The response is stored gzip-compressed and immutable beside a manifest that
records the exact query, the SHA-256 of the uncompressed bytes and the retrieval
date. `prepare-osm-course.py` consumes that file; it never re-queries at build
time. Overpass is a community service: one bounded request per course revision,
no polling, no serving SLA assumed.

Usage:
  python3 scripts/golf/course-geometry/fetch-osm-course.py \
    scripts/golf/course-geometry/pilots/<course>.json \
    src/test/fixtures/course-geometry/sources/<course>-osm
"""
import argparse
import gzip
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ENDPOINT = 'https://overpass-api.de/api/interpreter'
MAX_BYTES = 40_000_000
RETRY_SECONDS = (5, 20, 60)   # overpass-api.de answers 429/502/503/504 under load; bounded retries, then fail


def fetch(request, limit):
    """One Overpass request with bounded retries on transient status codes."""
    for wait in (*RETRY_SECONDS, None):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return response.read(limit + 1)
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 502, 503, 504) or wait is None:
                raise
            print(f'overpass {exc.code}; retrying in {wait}s', flush=True)
            time.sleep(wait)
    raise RuntimeError('unreachable')


def query_for(bbox):
    south, west, north, east = bbox[1], bbox[0], bbox[3], bbox[2]
    box = f'{south},{west},{north},{east}'
    return (
        '[out:json][timeout:120];'
        f'(way["golf"]({box});way["natural"="water"]({box});way["leisure"="golf_course"]({box}););'
        'out geom;'
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scorecard', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    card = json.loads(args.scorecard.read_text())
    bbox = card['bboxWgs84']
    if len(bbox) != 4 or not (bbox[0] < bbox[2] and bbox[1] < bbox[3]) or (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > .01:
        raise ValueError('Course bbox must be [west, south, east, north] and bounded to one facility')
    target = args.output / 'overpass.json.gz'
    if target.exists():
        raise FileExistsError(f'{target} already exists; retained extracts are immutable, choose a new revision directory')
    query = query_for(bbox)
    request = urllib.request.Request(ENDPOINT, data=urllib.parse.urlencode({'data': query}).encode(),
                                     headers={'User-Agent': 'GolfHelm course-geometry source review (bounded, one request per course revision)'})
    raw = fetch(request, MAX_BYTES)
    if len(raw) > MAX_BYTES:
        raise ValueError('Overpass response exceeds the bounded extract budget')
    parsed = json.loads(raw)
    elements = parsed.get('elements', [])
    if not elements:
        raise ValueError('Overpass returned no elements; not writing an empty extract')
    args.output.mkdir(parents=True, exist_ok=True)
    target.write_bytes(gzip.compress(raw, mtime=0))
    manifest = {
        'schemaVersion': 1, 'provider': 'OpenStreetMap via Overpass API', 'endpoint': ENDPOINT, 'query': query,
        'bboxWgs84': bbox, 'siteId': card['siteId'], 'course': card['name'], 'retrievedAt': datetime.now(timezone.utc).date().isoformat(),
        'osm3sTimestamp': parsed.get('osm3s', {}).get('timestamp_osm_base'), 'elementCount': len(elements),
        'uncompressedSha256': hashlib.sha256(raw).hexdigest(), 'uncompressedBytes': len(raw), 'file': target.name,
        'licenseId': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors · ODbL 1.0',
        'licenseUrl': 'https://www.openstreetmap.org/copyright',
    }
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'elements': len(elements), 'sha256': manifest['uncompressedSha256'], 'osmBase': manifest['osm3sTimestamp']}))


if __name__ == '__main__':
    sys.exit(main())

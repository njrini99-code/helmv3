#!/usr/bin/env python3
"""Library source-coverage audit (enhancements plan P8: "DEM candidate check").

For every course in the app's library, answer the two questions that decide
whether the course-geometry pipeline can even start:

  1. Does OpenStreetMap carry the course with golf features (holes, greens,
     fairways, bunkers, tees) near the named city?
  2. Does USGS 3DEP publish a native 1 m DEM tile over it?

Read-only: public Nominatim (city geocode), Overpass (golf features) and the
3DEP ImageServer catalog (the same query `compile-course-terrain.py` runs).
Nothing here edits a package, a fixture or the app; it is an inventory for
choosing the next course, not a verdict on any boundary.

  python3 scripts/golf/course-geometry/audit-library-coverage.py courses.json \
      output/course-geometry/library-coverage [--sleep=1.5]

`courses.json`: a list of {id, name, city, state, country?} rows (the
`golf_courses` columns). Output: coverage.json (one row per facility with the
library ids it covers) and coverage.md (the table).
"""
from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

NOMINATIM = 'https://nominatim.openstreetmap.org/search'
OVERPASS = 'https://overpass-api.de/api/interpreter'
OVERPASS_MIRRORS = (OVERPASS, 'https://overpass.kumi.systems/api/interpreter')
DEM_CATALOG = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/query'
UA = 'GolfHelm course-geometry library audit (read-only inventory, one request per course)'
GOLF_KINDS = ('hole', 'green', 'fairway', 'bunker', 'tee', 'water_hazard', 'lateral_water_hazard', 'rough')
STATES = {'nc': 'North Carolina', 'va': 'Virginia', 'fl': 'Florida', 'ga': 'Georgia', 'sc': 'South Carolina', 'ny': 'New York', 'ca': 'California',
          'ky': 'Kentucky', 'oh': 'Ohio', 'wi': 'Wisconsin', 'wv': 'West Virginia', 'on': 'Ontario', 'pa': 'Pennsylvania', 'md': 'Maryland', 'tn': 'Tennessee'}


def get(url: str, params: dict, timeout: int = 60) -> dict:
    request = Request(url + '?' + urlencode(params), headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8'))


def post(url: str, body: str, timeout: int = 90) -> dict:
    request = Request(url, data=urlencode({'data': body}).encode('utf-8'), headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8'))


def overpass(body: str) -> dict:
    # Public Overpass instances shed load with 429/504; try the mirrors in turn with a backoff.
    last: Exception | None = None
    for attempt, wait in enumerate((0, 8, 20, 45)):
        if wait:
            time.sleep(wait)
        for url in OVERPASS_MIRRORS:
            try:
                return post(url, body)
            except Exception as error:  # noqa: BLE001 -- retried below
                last = error
    raise RuntimeError(f'Overpass unavailable after retries: {last}')


def normalize(text: str) -> str:
    text = unicodedata.normalize('NFKD', text or '').encode('ascii', 'ignore').decode('ascii').lower()
    text = re.sub(r'\(.*?\)', ' ', text)
    text = text.replace('&', ' and ')
    text = re.sub(r'\bcc\b', 'country club', text)
    text = re.sub(r'\bgc\b', 'golf club', text)
    text = re.sub(r'[^a-z0-9 ]+', ' ', text)
    stop = {'the', 'golf', 'club', 'course', 'links', 'country', 'resort', 'at', 'of', 'and', 'cc', 'gc', 'park', 'state', 'university'}
    return ' '.join(token for token in text.split() if token not in stop)


def tokens(text: str) -> set[str]:
    return set(normalize(text).split())


def facility_key(row: dict) -> str:
    name = normalize(row.get('name') or '')
    # Sister layouts ("(Marsh 9)", "No. 2", "- Stadium") share the facility.
    name = re.sub(r'\b(no|number)\s*\d+\b', '', name)
    name = re.sub(r'\d+', '', name)
    name = ' '.join(name.split()[:2])
    return f"{name}|{(row.get('city') or '').strip().lower()}"


def geocode_city(city: str, state: str, country: str | None) -> tuple[float, float] | None:
    state_name = STATES.get((state or '').strip().lower(), state or '')
    query = ', '.join(part for part in [city, state_name, country or ('Canada' if (state or '').lower() == 'on' else 'USA')] if part)
    rows = get(NOMINATIM, {'q': query, 'format': 'json', 'limit': 1})
    if not rows:
        return None
    return float(rows[0]['lat']), float(rows[0]['lon'])


def overpass_courses(lat: float, lon: float, radius_m: int) -> list[dict]:
    body = f'[out:json][timeout:60];(way["leisure"="golf_course"](around:{radius_m},{lat},{lon});relation["leisure"="golf_course"](around:{radius_m},{lat},{lon}););out tags center;'
    return overpass(body).get('elements', [])


def tally(elements: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for element in elements:
        kind = element.get('tags', {}).get('golf')
        if kind:
            counts[kind] = counts.get(kind, 0) + 1
    return counts


def overpass_features(course: dict, lat: float, lon: float, radius_m: int) -> tuple[dict[str, int], str]:
    # Inside the course's own polygon first (a neighbouring course must not
    # count); the radius is the fallback when Overpass has no area for it.
    selector = 'way' if course['type'] == 'way' else 'rel'
    body = f'[out:json][timeout:60];{selector}({course["id"]})->.c;.c map_to_area->.a;(way["golf"](area.a);relation["golf"](area.a););out tags;'
    try:
        inside = tally(overpass(body).get('elements', []))
    except RuntimeError:
        inside = {}
    if inside:
        return inside, 'course_area'
    time.sleep(1)
    body = f'[out:json][timeout:60];(way["golf"](around:{radius_m},{lat},{lon});relation["golf"](around:{radius_m},{lat},{lon}););out tags;'
    return tally(overpass(body).get('elements', [])), f'around_{radius_m}m'


def dem_1m_tiles(lat: float, lon: float, half_deg: float = 0.02) -> list[str]:
    geometry = {'xmin': lon - half_deg, 'ymin': lat - half_deg, 'xmax': lon + half_deg, 'ymax': lat + half_deg, 'spatialReference': {'wkid': 4326}}
    rows = get(DEM_CATALOG, {'f': 'json', 'where': 'Category=1', 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326, 'outSR': 4326,
                             'geometry': json.dumps(geometry), 'spatialRel': 'esriSpatialRelIntersects', 'returnGeometry': 'false',
                             'outFields': 'title,StartDate,EndDate'})
    titles = [str(feature.get('attributes', {}).get('title', '')) for feature in rows.get('features', [])]
    return sorted({title for title in titles if title.lower().startswith(('usgs 1 meter ', 'usgs one meter '))})


def pick_course(candidates: list[dict], name: str) -> dict | None:
    wanted = tokens(name)
    best, score = None, 0.0
    for element in candidates:
        label = element.get('tags', {}).get('name', '')
        have = tokens(label)
        if not have:
            continue
        overlap = len(wanted & have) / max(1, len(wanted))
        if overlap > score:
            best, score = element, overlap
    return {**best, 'matchScore': round(score, 2)} if best and score >= 0.34 else None


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    options = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
    if len(args) != 2:
        print(__doc__); return 2
    rows = json.loads(Path(args[0]).read_text())
    out = Path(args[1]); out.mkdir(parents=True, exist_ok=True)
    pause = float(options.get('sleep', '1.5'))
    facilities: dict[str, dict] = {}
    for row in rows:
        key = facility_key(row)
        entry = facilities.setdefault(key, {'name': row.get('name'), 'city': (row.get('city') or '').strip(), 'state': (row.get('state') or '').strip(), 'country': row.get('country'), 'libraryIds': [], 'libraryNames': []})
        entry['libraryIds'].append(row['id']); entry['libraryNames'].append(row.get('name'))
    results = []
    for index, (key, facility) in enumerate(sorted(facilities.items(), key=lambda item: (item[1]['state'], item[1]['name'] or '')), 1):
        record = {**facility, 'cityPoint': None, 'osmCourse': None, 'golfFeatures': {}, 'featureBasis': None, 'holes': 0, 'greens': 0, 'fairways': 0, 'bunkers': 0, 'tees': 0, 'dem1mTiles': [], 'verdict': 'unknown', 'notes': []}
        try:
            if not facility['city']:
                record['notes'].append('no city in the library row'); results.append(record); continue
            point = geocode_city(facility['city'], facility['state'], facility['country']); time.sleep(pause)
            if not point:
                record['notes'].append('city did not geocode'); results.append(record); continue
            record['cityPoint'] = list(point)
            candidates = overpass_courses(point[0], point[1], 15000); time.sleep(pause)
            course = pick_course(candidates, facility['name'] or '')
            if not course:
                record['notes'].append(f'no OSM golf_course matched the name among {len(candidates)} within 25 km of the city')
            else:
                centre = course.get('center') or {'lat': course.get('lat'), 'lon': course.get('lon')}
                record['osmCourse'] = {'type': course['type'], 'id': course['id'], 'siteId': f"osm-{course['type']}-{course['id']}", 'name': course.get('tags', {}).get('name'), 'matchScore': course['matchScore'], 'center': [centre.get('lat'), centre.get('lon')]}
                counts, basis = overpass_features(course, float(centre['lat']), float(centre['lon']), 1500); time.sleep(pause)
                record['golfFeatures'] = counts; record['featureBasis'] = basis
                record['holes'], record['greens'], record['fairways'], record['bunkers'], record['tees'] = (counts.get(k, 0) for k in ('hole', 'green', 'fairway', 'bunker', 'tee'))
                if (facility['country'] or '').lower() not in ('canada',) and (facility['state'] or '').lower() != 'on':
                    record['dem1mTiles'] = dem_1m_tiles(float(centre['lat']), float(centre['lon'])); time.sleep(pause)
                else:
                    record['notes'].append('outside USGS 3DEP (not in the US)')
        except Exception as error:  # noqa: BLE001 -- inventory keeps going; the row records the failure
            record['notes'].append(f'lookup failed: {type(error).__name__}: {str(error)[:120]}')
        mapped = record['holes'] >= 18 and record['greens'] >= 18 and record['fairways'] >= 12
        partial = record['greens'] >= 9 or record['holes'] >= 9
        dem = bool(record['dem1mTiles'])
        record['verdict'] = ('ready' if mapped and dem else 'partial-osm' if partial and dem else 'no-dem' if mapped or partial else 'no-osm' if record['osmCourse'] else 'not-found')
        results.append(record)
        print(f"{index:2d}/{len(facilities)} {facility['state']:>3} {facility['name'][:40]:40} holes={record['holes']:2d} greens={record['greens']:2d} fairways={record['fairways']:2d} bunkers={record['bunkers']:3d} dem1m={len(record['dem1mTiles'])} → {record['verdict']}{' · ' + '; '.join(record['notes']) if record['notes'] else ''}", flush=True)
    (out / 'coverage.json').write_text(json.dumps({'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'libraryRows': len(rows), 'facilities': results}, indent=2) + '\n')
    lines = ['| State | Facility (library rows) | OSM course | Holes | Greens | Fairways | Bunkers | Tees | 1 m DEM | Verdict |', '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |']
    for r in results:
        osm = r['osmCourse']['siteId'] if r['osmCourse'] else '—'
        lines.append(f"| {r['state']} | {r['name']} ({len(r['libraryIds'])}) | {osm} | {r['holes']} | {r['greens']} | {r['fairways']} | {r['bunkers']} | {r['tees']} | {len(r['dem1mTiles'])} | {r['verdict']}{' · ' + '; '.join(r['notes']) if r['notes'] else ''} |")
    tally = {}
    for r in results:
        tally[r['verdict']] = tally.get(r['verdict'], 0) + 1
    lines.append(''); lines.append('Verdicts: ' + ', '.join(f'{k} {v}' for k, v in sorted(tally.items())))
    (out / 'coverage.md').write_text('\n'.join(lines) + '\n')
    print('facilities', len(results), 'verdicts', tally)
    return 0


if __name__ == '__main__':
    sys.exit(main())

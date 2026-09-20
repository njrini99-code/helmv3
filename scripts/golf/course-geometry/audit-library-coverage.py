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
      output/course-geometry/library-coverage [--sleep=1.5] [--only=bryan,cardinal] [--resume]

`--only` re-audits the facilities whose name contains one of the parts and
keeps every other row from the directory's previous coverage.json.

`courses.json`: a list of {id, name, city, state, country?, osm?} rows (the
`golf_courses` columns; `osm` is an optional human pin such as "way/258229089"
for a facility the name search cannot resolve). Output: coverage.json (one row
per facility with the library ids it covers) and coverage.md (the table).
"""
from __future__ import annotations

import json
import math
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
        payload = json.loads(response.read().decode('utf-8'))
    # A loaded Overpass instance answers 200 with a partial element list and
    # a remark ("Query timed out…", "runtime error…"); that must retry, not count.
    remark = str(payload.get('remark', '')) if isinstance(payload, dict) else ''
    if re.search(r'timed out|runtime error|out of memory', remark, re.IGNORECASE):
        raise RuntimeError(f'Overpass partial answer: {remark[:120]}')
    return payload


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
    stop = {'the', 'golf', 'club', 'clubs', 'course', 'courses', 'links', 'country', 'resort', 'at', 'of', 'and', 'cc', 'gc', 'park', 'state', 'university'}
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


SEARCH_RADIUS_M = 30000  # resort courses sit well outside their postal city (Reynolds, King & Bear: ~21 km)


def overpass_courses(lat: float, lon: float, radius_m: int) -> list[dict]:
    body = f'[out:json][timeout:60];(way["leisure"="golf_course"](around:{radius_m},{lat},{lon});relation["leisure"="golf_course"](around:{radius_m},{lat},{lon}););out tags center;'
    return overpass(body).get('elements', [])


def overpass_element(ref: str) -> dict | None:
    """A pinned `osm` row value ("way/123" or "relation/123") as one element."""
    kind, _, ident = ref.strip().partition('/')
    if kind not in ('way', 'relation') or not ident.isdigit():
        raise ValueError(f'osm pin must be way/<id> or relation/<id>, got {ref!r}')
    elements = overpass(f'[out:json][timeout:60];{kind}({ident});out tags center;').get('elements', [])
    return elements[0] if elements else None


def anchor_by_name(name: str, city: str, state: str, country: str | None, lat: float, lon: float, radius_m: int) -> list[dict]:
    """Named places that carry the facility's distinctive words (a park, a
    hotel, a neighbourhood, a street), for a course mapped as holes and greens
    with no `leisure=golf_course` polygon at all (Magnolia Greens, Bryan Park,
    2026-09-18). Nominatim first (indexed by name); an Overpass name regex over
    a bounded radius only when it finds nothing. Hits are ordered by how much
    of the name they carry."""
    text = re.sub(r'[^a-z0-9 ]+', ' ', re.sub(r'\(.*?\)', ' ', unicodedata.normalize('NFKD', name or '').encode('ascii', 'ignore').decode('ascii').lower()))
    words = [w for w in text.split() if len(w) > 2 and w not in {'the', 'golf', 'club', 'course', 'country', 'links', 'resort', 'and'}]
    if not words:
        return []
    wanted = set(words)
    carried = lambda label: len(wanted & set(re.sub(r'[^a-z0-9 ]+', ' ', (label or '').lower()).split()))
    state_name = STATES.get((state or '').strip().lower(), state or '')
    place = ', '.join(part for part in [' '.join(words[:2]), city, state_name, country or ('Canada' if (state or '').lower() == 'on' else 'USA')] if part)
    rows = get(NOMINATIM, {'q': place, 'format': 'json', 'limit': 5})
    hits = [{'type': r.get('osm_type'), 'id': r.get('osm_id'), 'tags': {'name': r.get('display_name', '').split(',')[0]}, 'center': {'lat': float(r['lat']), 'lon': float(r['lon'])}}
            for r in rows if carried(r.get('display_name', '').split(',')[0]) and distance_km((lat, lon), (float(r['lat']), float(r['lon']))) <= radius_m / 1000]
    if hits:
        return sorted(hits, key=lambda e: -carried(e['tags']['name']))
    time.sleep(1)
    # A lone word only when it is all the name has: "river" alone would anchor on any riverside course.
    patterns = [words, words[:2]] if len(words) >= 2 else [words] if words and len(words[0]) >= 5 else []
    for pattern in [p for i, p in enumerate(patterns) if p and p not in patterns[:i]]:
        body = f'[out:json][timeout:90];nwr["name"~"{".*".join(re.escape(w) for w in pattern)}",i](around:{min(radius_m, 12000)},{lat},{lon});out tags center;'
        hits = overpass(body).get('elements', [])
        if hits:
            return sorted(hits, key=lambda e: -carried(e.get('tags', {}).get('name', '')))
        time.sleep(1)
    return []


def tally(elements: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for element in elements:
        kind = element.get('tags', {}).get('golf')
        if kind:
            counts[kind] = counts.get(kind, 0) + 1
    return counts


def overpass_features(course: dict | None, lat: float, lon: float, radius_m: int) -> tuple[dict[str, int], str]:
    # Inside the course's own polygon first (a neighbouring course must not
    # count); the radius is the fallback when Overpass has no area for it, and
    # the only option for an anchor point with no polygon.
    if course and course.get('type'):
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


def distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 111.2 * math.cos(lat))


def close_enough(a: str, b: str) -> bool:
    """Equal, or one typo apart for words of five letters or more (the library
    spells "Savannah Habor"): one insertion, deletion or substitution."""
    if a == b:
        return True
    if min(len(a), len(b)) < 5 or abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b, strict=True)) == 1
    short, long_ = (a, b) if len(a) < len(b) else (b, a)
    for i in range(len(long_)):
        if long_[:i] + long_[i + 1:] == short:
            return True
    return False


def shared_tokens(wanted: set[str], have: set[str]) -> tuple[set[str], set[str]]:
    """The wanted and the have tokens that found a partner on the other side."""
    matched_wanted, matched_have = set(), set()
    for w in wanted:
        for h in have:
            if h not in matched_have and close_enough(w, h):
                matched_wanted.add(w); matched_have.add(h)
                break
    return matched_wanted, matched_have


def rank_courses(candidates: list[dict], name: str, near: tuple[float, float] | None = None) -> list[dict]:
    # The library name carries the facility and the layout ("Sea Island -
    # Seaside Course"); OSM often names the layout and puts the facility in
    # `operator`/`brand`, so those tags count too. Ties go to the candidate
    # with the fewest tokens the library name lacks ("PGA National Resort"
    # over "PGA National Resort Fazio course"), then to the nearer course.
    # Every candidate above the floor is returned, best first: a facility is
    # often mapped twice (a way and a relation with the same name) and only
    # one of them carries the golf features.
    wanted = tokens(name)
    ranked = []
    for element in candidates:
        tags = element.get('tags', {})
        have = tokens(' '.join(tags.get(key, '') for key in ('name', 'old_name', 'operator', 'brand', 'alt_name')))
        if not have:
            continue
        matched_wanted, matched_have = shared_tokens(wanted, have)
        overlap = len(matched_wanted) / max(1, len(wanted))
        precision = len(matched_have) / len(have)
        centre = element.get('center') or element
        km = distance_km(near, (float(centre['lat']), float(centre['lon']))) if near and centre.get('lat') is not None else math.inf
        # One shared generic word is not a match when both names also carry a
        # word the other lacks ("Forest Oaks" is not "Starmount Forest"); a
        # name that covers the other completely is ("Bethpage Black" inside
        # "Bethpage State Park", "Great Waters" inside its Reynolds row).
        if overlap >= 0.34 and not (wanted - matched_wanted and have - matched_have):
            ranked.append((-overlap, -precision, km, {**element, 'matchScore': round(overlap, 2)}))
    return [element for *_, element in sorted(ranked, key=lambda item: item[:3])]


def pick_course(candidates: list[dict], name: str, near: tuple[float, float] | None = None) -> dict | None:
    ranked = rank_courses(candidates, name, near)
    return ranked[0] if ranked else None


def verdict_for(record: dict) -> str:
    """ready: holes, greens and fairways inside the course's own polygon and a
    1 m tile. An anchored count (no polygon: a radius around a named place)
    can include the club next door, so it never rates above partial-osm —
    the row that someone filters on to pick the next build must be bounded."""
    mapped = record['holes'] >= 18 and record['greens'] >= 18 and record['fairways'] >= 12 and not record.get('anchor')
    partial = record['greens'] >= 9 or record['holes'] >= 9
    dem = bool(record['dem1mTiles'])
    return ('ready' if mapped and dem else 'partial-osm' if partial and dem else 'no-dem' if mapped or partial else 'no-osm' if record['osmCourse'] else 'not-found')


def write_report(out: Path, results: list[dict], library_rows: int, complete: bool) -> None:
    """Checkpoint every completed facility. A public-source timeout must not
    erase the work already done or force a full costly retry. `complete` makes
    a partial inventory explicit for downstream callers."""
    payload = {'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'libraryRows': library_rows,
               'complete': complete, 'facilities': results}
    (out / 'coverage.json').write_text(json.dumps(payload, indent=2) + '\n')
    lines = ['| State | Facility (library rows) | OSM course | Holes | Greens | Fairways | Bunkers | Tees | 1 m DEM | Verdict |', '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |']
    for r in results:
        osm = r['osmCourse']['siteId'] if r['osmCourse'] else f"bbox near {r['anchor']['name']}" if r['anchor'] else '—'
        lines.append(f"| {r['state']} | {r['name']} ({len(r['libraryIds'])}) | {osm} | {r['holes']} | {r['greens']} | {r['fairways']} | {r['bunkers']} | {r['tees']} | {len(r['dem1mTiles'])} | {r['verdict']}{' · ' + '; '.join(r['notes']) if r['notes'] else ''} |")
    tally = {}
    for r in results:
        tally[r['verdict']] = tally.get(r['verdict'], 0) + 1
    lines.extend(['', 'Complete: ' + ('yes' if complete else 'no — resume required before intake'), 'Verdicts: ' + ', '.join(f'{k} {v}' for k, v in sorted(tally.items()))])
    (out / 'coverage.md').write_text('\n'.join(lines) + '\n')


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    options = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
    if len(args) != 2:
        print(__doc__); return 2
    source_payload = json.loads(Path(args[0]).read_text())
    # The raw library export is a list, while the active-team selector emits a
    # cohort envelope. Both retain the same course-row contract. Accepting the
    # envelope keeps the scale-out path auditable and avoids a lossy jq step.
    rows = source_payload.get('courses') if isinstance(source_payload, dict) else source_payload
    if not isinstance(rows, list):
        raise SystemExit('courses input must be a list or an object with a courses list')
    out = Path(args[1]); out.mkdir(parents=True, exist_ok=True)
    pause = float(options.get('sleep', '1.5'))
    only = [part.strip().lower() for part in options.get('only', '').split(',') if part.strip()]
    resume = '--resume' in sys.argv[1:]
    previous = {}
    if (only or resume) and (out / 'coverage.json').exists():
        previous = {f['name']: f for f in json.loads((out / 'coverage.json').read_text())['facilities']}
    facilities: dict[str, dict] = {}
    for row in rows:
        key = facility_key(row)
        entry = facilities.setdefault(key, {'name': row.get('name'), 'city': (row.get('city') or '').strip(), 'state': (row.get('state') or '').strip(), 'country': row.get('country'), 'osmPin': None, 'libraryIds': [], 'libraryNames': []})
        entry['libraryIds'].append(row['id']); entry['libraryNames'].append(row.get('name'))
        entry['osmPin'] = entry['osmPin'] or row.get('osm')
    results = []
    ordered = sorted(facilities.items(), key=lambda item: (item[1]['state'], item[1]['name'] or ''))
    try:
      for index, (key, facility) in enumerate(ordered, 1):
        if only and not any(part in (facility['name'] or '').lower() for part in only):
            if facility['name'] in previous:
                # Counts are evidence and stay; the verdict is derived, so a rule change reaches every kept row.
                results.append({**previous[facility['name']], 'verdict': verdict_for(previous[facility['name']])})
            continue
        if resume and facility['name'] in previous:
            results.append({**previous[facility['name']], 'verdict': verdict_for(previous[facility['name']])})
            continue
        record = {**facility, 'cityPoint': None, 'osmCourse': None, 'anchor': None, 'golfFeatures': {}, 'featureBasis': None, 'holes': 0, 'greens': 0, 'fairways': 0, 'bunkers': 0, 'tees': 0, 'dem1mTiles': [], 'verdict': 'unknown', 'notes': []}
        try:
            if not facility['city']:
                record['notes'].append('no city in the library row'); results.append(record); write_report(out, results, len(rows), False); continue
            point = geocode_city(facility['city'], facility['state'], facility['country']); time.sleep(pause)
            if not point:
                record['notes'].append('city did not geocode'); results.append(record); write_report(out, results, len(rows), False); continue
            record['cityPoint'] = list(point)
            if facility['osmPin']:
                pinned = overpass_element(facility['osmPin']); time.sleep(pause)
                matches = [{**pinned, 'matchScore': 1.0}] if pinned else []
                record['notes'].append(f"pinned to {facility['osmPin']}" + ('' if pinned else ' (not in OSM)'))
            else:
                candidates = overpass_courses(point[0], point[1], SEARCH_RADIUS_M); time.sleep(pause)
                matches = rank_courses(candidates, facility['name'] or '', point)
                if not matches:
                    record['notes'].append(f'no OSM golf_course matched the name among {len(candidates)} within {SEARCH_RADIUS_M // 1000} km of the city')
                    anchors = anchor_by_name(facility['name'] or '', facility['city'], facility['state'], facility['country'], point[0], point[1], SEARCH_RADIUS_M); time.sleep(pause)
                    best = None
                    for anchor in anchors[:6]:
                        centre = anchor.get('center') or anchor
                        if centre.get('lat') is None:
                            continue
                        # An anchor (a hotel, a street) sits at the edge of the property: count wider than a polygon centre.
                        counts, _basis = overpass_features(None, float(centre['lat']), float(centre['lon']), 2500); time.sleep(pause)
                        if (counts.get('green', 0) >= 9 or counts.get('hole', 0) >= 9) and counts.get('green', 0) > (best or [{}])[0].get('green', 0):
                            best = (counts, anchor, centre)
                    if best:
                        counts, anchor, centre = best
                        label = anchor.get('tags', {}).get('name')
                        record['anchor'] = {'type': anchor['type'], 'id': anchor['id'], 'name': label, 'center': [centre['lat'], centre['lon']]}
                        record['golfFeatures'] = counts; record['featureBasis'] = 'around_2500m'
                        record['notes'].append(f"no course polygon; holes and greens are mapped around {label} (osm-{anchor['type']}-{anchor['id']}): the build uses a bbox, not a polygon")
            # The best-named match is the row's course. When it carries no golf
            # features, only a polygon with the *same* name (the way/relation
            # duplicate) may stand in for it; a sister layout under another
            # name is noted, never substituted, so the siteId is never wrong.
            for course in matches[:4]:
                same_name = normalize(course.get('tags', {}).get('name', '')) == normalize(matches[0].get('tags', {}).get('name', ''))
                if record['golfFeatures'] and not same_name:
                    break
                centre = course.get('center') or {'lat': course.get('lat'), 'lon': course.get('lon')}
                counts, basis = overpass_features(course, float(centre['lat']), float(centre['lon']), 1500); time.sleep(pause)
                if counts and not same_name:
                    record['notes'].append(f"sister layout {course.get('tags', {}).get('name')} (osm-{course['type']}-{course['id']}) carries {counts.get('green', 0)} greens")
                    break
                if counts or course is matches[0]:
                    record['osmCourse'] = {'type': course['type'], 'id': course['id'], 'siteId': f"osm-{course['type']}-{course['id']}", 'name': course.get('tags', {}).get('name'), 'matchScore': course['matchScore'], 'center': [centre.get('lat'), centre.get('lon')]}
                    record['golfFeatures'] = counts; record['featureBasis'] = basis
                if counts:
                    break
            if record['osmCourse'] or record.get('anchor'):
                counts, (lat, lon) = record['golfFeatures'], (record['osmCourse'] or record['anchor'])['center']
                record['holes'], record['greens'], record['fairways'], record['bunkers'], record['tees'] = (counts.get(k, 0) for k in ('hole', 'green', 'fairway', 'bunker', 'tee'))
                if (facility['country'] or '').lower() not in ('canada',) and (facility['state'] or '').lower() != 'on':
                    record['dem1mTiles'] = dem_1m_tiles(float(lat), float(lon)); time.sleep(pause)
                else:
                    record['notes'].append('outside USGS 3DEP (not in the US)')
        except Exception as error:  # noqa: BLE001 -- inventory keeps going; the row records the failure
            record['notes'].append(f'lookup failed: {type(error).__name__}: {str(error)[:120]}')
        record['verdict'] = verdict_for(record)
        results.append(record)
        write_report(out, results, len(rows), False)
        print(f"{index:2d}/{len(facilities)} {facility['state']:>3} {facility['name'][:40]:40} holes={record['holes']:2d} greens={record['greens']:2d} fairways={record['fairways']:2d} bunkers={record['bunkers']:3d} dem1m={len(record['dem1mTiles'])} → {record['verdict']}{' · ' + '; '.join(record['notes']) if record['notes'] else ''}", flush=True)
    except KeyboardInterrupt:
        write_report(out, results, len(rows), False)
        print('interrupted; checkpoint written (re-run with --resume)', file=sys.stderr)
        return 130
    write_report(out, results, len(rows), True)
    tally = {}
    for r in results:
        tally[r['verdict']] = tally.get(r['verdict'], 0) + 1
    print('facilities', len(results), 'verdicts', tally)
    return 0


if __name__ == '__main__':
    sys.exit(main())

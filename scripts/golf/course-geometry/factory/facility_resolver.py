"""Automatic facility resolver (Factory v2 W4): finds the OSM element for a
played course the library coverage audit (`audit-library-coverage.py`)
could not pin, so `intake.py` never needs a human-supplied `osm` pin.

This module does not reimplement Nominatim/Overpass access or the pure name
matching -- it loads `audit-library-coverage.py` (a sibling script, not a
package module, hence the `importlib` load below) and reuses its proven
helpers: `geocode_city`, `overpass_courses`, `anchor_by_name`,
`overpass_features`, `dem_1m_tiles`, `verdict_for`, and the pure primitives
`normalize`/`tokens`/`shared_tokens`/`distance_km`/`tally`.

Two things differ from the audit's own `main()` loop, both because the
audit already tried and failed on exactly these facilities (Bryan Park,
Forest Oaks, Magnolia Greens, River Landing) before this module existed:

  1. `rank_courses` requires every one of the *library* name's tokens (once
     matched) to also cover the *OSM* name's tokens (`wanted - matched_wanted
     and have - matched_have`), which quietly drops a real course polygon
     that carries plenty of golf features but a name that only partially
     overlaps ("Magnolia Greens" vs. an OSM way named just "Cape Fear
     National" nearby, or a polygon with no `name` tag at all). This module
     scores name overlap and feature count independently and keeps a
     candidate that clears a feature-count floor even with a weak or absent
     name match -- the same floor `verdict_for` already uses (>=9 greens or
     >=9 holes).
  2. Every candidate considered -- not only the winner -- is kept as
     evidence (`resolution['candidates']`), with its score and, for a
     rejected one, why it lost.

Network calls go through a small on-disk cache (`ResponseCache`) so a
retried resolution, or the test suite, never re-hits a public API for a
query already answered -- `audit-library-coverage.py`'s own `get`/`post`
are monkeypatched in place (see `_install_cache`), so every helper that
calls them (including `overpass`, `anchor_by_name`, `dem_1m_tiles`) is
covered without editing that file.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import time
from pathlib import Path
from typing import Any

_SCRIPT_DIR = Path(__file__).resolve().parent.parent
_ALC_PATH = _SCRIPT_DIR / 'audit-library-coverage.py'
_spec = importlib.util.spec_from_file_location('_audit_library_coverage', _ALC_PATH)
_alc = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_alc)

FEATURE_FLOOR = 9  # same bar as verdict_for's "partial": >=9 greens or >=9 holes
TIGHT_RADIUS_M = 5000
ESCALATED_RADII_M = (5000, 15000, 30000)


class ResponseCache:
    """Content-addressed on-disk cache for one resolver run (or the whole
    factory's lifetime, if pointed at a persistent directory). Never used
    for anything that must reflect current OSM/USGS state at build time --
    only for repeated resolution attempts of the same query."""

    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, kind: str, key: str) -> Path:
        digest = hashlib.sha256(key.encode('utf-8')).hexdigest()
        return self.root / f'{kind}-{digest}.json'

    def get(self, kind: str, key: str) -> Any:
        path = self._path(kind, key)
        if not path.is_file():
            return None
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return None

    def put(self, kind: str, key: str, value: Any) -> None:
        self._path(kind, key).write_text(json.dumps(value), encoding='utf-8')


def install_cache(cache: ResponseCache | None, sleep: float):
    """Monkeypatch `_alc.get`/`_alc.post` with a cached, rate-limited
    version. Returns the originals so a caller (mainly tests) can restore
    them. Every `_alc` helper looks up `get`/`post` in the module's own
    globals at call time, so this covers all of them."""
    real_get, real_post = _alc.get, _alc.post

    def cached_get(url, params, timeout=60):
        key = url + '?' + json.dumps(params, sort_keys=True)
        cached = cache.get('get', key) if cache else None
        if cached is not None:
            return cached
        if sleep:
            time.sleep(sleep)
        value = real_get(url, params, timeout=timeout)
        if cache:
            cache.put('get', key, value)
        return value

    def cached_post(url, body, timeout=90):
        key = url + '\n' + body
        cached = cache.get('post', key) if cache else None
        if cached is not None:
            return cached
        if sleep:
            time.sleep(sleep)
        value = real_post(url, body, timeout=timeout)
        if cache:
            cache.put('post', key, value)
        return value

    _alc.get, _alc.post = cached_get, cached_post
    return real_get, real_post


def restore(originals) -> None:
    _alc.get, _alc.post = originals


def facility_key(name: str, city: str) -> str:
    return _alc.facility_key({'name': name, 'city': city})


def _verify_tags(element_type: str, element_id: int) -> dict:
    """Fetch an element's real tags with one cached Overpass call before it
    is trusted as `osmCourse` or `anchor`. A Nominatim hit only ever carries
    the tags this module synthesizes for it (`{'name': display_name}`), and
    a display name alone cannot say whether the element is a golf course, a
    park, or -- Forest Oaks' own failure -- a census-designated place
    boundary (`boundary=statistical`), which a name search ranks first
    because its name overlap is 1.0."""
    try:
        result = _alc.overpass(f'[out:json][timeout:60];{element_type}({element_id});out tags;')
    except Exception:  # noqa: BLE001 -- treat an unverifiable element as untagged, not fatal
        return {}
    elements = result.get('elements', [])
    return (elements[0].get('tags') or {}) if elements else {}


ADMINISTRATIVE_TAGS = {'boundary', 'place', 'admin_level'}


def _score(element: dict, wanted_tokens: set[str], near: tuple[float, float] | None) -> dict:
    tags = element.get('tags', {}) or {}
    have_text = ' '.join(tags.get(key, '') for key in ('name', 'old_name', 'operator', 'brand', 'alt_name'))
    have = _alc.tokens(have_text)
    matched_wanted, matched_have = _alc.shared_tokens(wanted_tokens, have) if have else (set(), set())
    overlap = len(matched_wanted) / max(1, len(wanted_tokens))
    centre = element.get('center') or element
    km = None
    if near and centre.get('lat') is not None:
        km = round(_alc.distance_km(near, (float(centre['lat']), float(centre['lon']))), 2)
    return {'type': element.get('type'), 'id': element.get('id'), 'osmName': tags.get('name'),
            'nameOverlap': round(overlap, 2), 'distanceKm': km, 'centre': centre}


def _rank_candidates(polygon_candidates: list[dict], wanted_tokens: set[str], near: tuple[float, float] | None,
                      name: str) -> tuple[list[tuple], list[dict]]:
    """Score every candidate on name + distance alone (no network yet) and
    split it into `ranked` (best-first `(rank_key, scored, element)`
    survivors) and `rejected` (scored dicts with a `rejected` reason).

    A tagged candidate (name/operator/brand/alt_name/old_name) that shares
    not one token with the wanted name is rejected outright as naming a
    different course -- a nearby "Pinehurst No. 2" must never win for
    "Longleaf Family Golf Club" just because it has 18 greens. Zero overlap
    is only ever tolerated for a genuinely untagged polygon (Bryan Park's
    own failure mode: real holes, no name at all), and only within 1.5 km of
    the reference point. This is called once per escalation radius, on the
    full candidate set accumulated so far, so a caller can keep escalating
    exactly until something survives."""
    ranked: list[tuple] = []
    rejected: list[dict] = []
    for element in polygon_candidates:
        centre = element.get('center') or element
        if centre.get('lat') is None:
            rejected.append({**_score(element, wanted_tokens, near), 'rejected': 'no recorded centre'})
            continue
        scored = _score(element, wanted_tokens, near)
        tags = element.get('tags', {}) or {}
        is_named = bool(tags.get('name') or tags.get('operator') or tags.get('brand') or tags.get('alt_name') or tags.get('old_name'))
        if is_named and scored['nameOverlap'] == 0:
            scored['rejected'] = f'names a different course ({scored["osmName"]!r} shares no token with {name!r})'
            rejected.append(scored)
            continue
        if not is_named and (scored['distanceKm'] is None or scored['distanceKm'] > 1.5):
            scored['rejected'] = 'untagged polygon too far from the reference point to guess at (no name to match against)'
            rejected.append(scored)
            continue
        rank = (-scored['nameOverlap'], scored['distanceKm'] if scored['distanceKm'] is not None else math.inf)
        ranked.append((rank, scored, element))
    ranked.sort(key=lambda item: item[0])
    return ranked, rejected


def resolve_facility(name: str, city: str, state: str, country: str | None = None, *,
                      sleep: float = 1.5, cache: ResponseCache | None = None,
                      radii_m: tuple[int, ...] = ESCALATED_RADII_M) -> dict:
    """Return one coverage.json-shaped facility record: the same shape
    `audit-library-coverage.py` writes, plus a `candidates` evidence list
    (every element considered, winner included, each with its score and a
    `rejected` reason when it lost).

    `libraryIds`/`libraryNames` are left empty here -- the caller (grouping
    several played-course rows under one facility, exactly as the audit's
    own `main()` groups by `facility_key`) attaches those.
    """
    originals = install_cache(cache, sleep)
    try:
        record: dict[str, Any] = {'name': name, 'city': (city or '').strip(), 'state': (state or '').strip(),
                                   'country': country, 'osmPin': None, 'libraryIds': [], 'libraryNames': [],
                                   'cityPoint': None, 'osmCourse': None, 'anchor': None, 'golfFeatures': {},
                                   'featureBasis': None, 'holes': 0, 'greens': 0, 'fairways': 0, 'bunkers': 0,
                                   'tees': 0, 'dem1mTiles': [], 'verdict': 'unknown', 'notes': [], 'candidates': []}
        if not city:
            record['notes'].append('no city given')
            record['verdict'] = 'not-found'
            return record

        # 1. Nominatim on the course name itself, tight radius first: the
        # audit only ever geocodes the *city*, so a facility whose own name
        # is well indexed (a well-known resort) never gets a direct hit.
        state_name = _alc.STATES.get((state or '').strip().lower(), state or '')
        place = ', '.join(part for part in [city, state_name, country or 'USA'] if part)
        try:
            point = _alc.geocode_city(city, state, country)
        except Exception as exc:  # noqa: BLE001 -- geocoding failure is retained evidence, not a crash
            record['notes'].append(f'city geocode failed: {type(exc).__name__}: {str(exc)[:120]}')
            record['verdict'] = 'not-found'
            return record
        if not point:
            record['notes'].append('city did not geocode')
            record['verdict'] = 'not-found'
            return record
        record['cityPoint'] = list(point)
        wanted = _alc.tokens(name)

        name_query = f'{name}, {place}'
        try:
            name_hits = _alc.get(_alc.NOMINATIM, {'q': name_query, 'format': 'json', 'limit': 5})
        except Exception:  # noqa: BLE001 -- fall through to the Overpass search
            name_hits = []
        named_candidates = [
            {'type': hit.get('osm_type'), 'id': hit.get('osm_id'), 'tags': {'name': (hit.get('display_name') or '').split(',')[0]},
             'center': {'lat': float(hit['lat']), 'lon': float(hit['lon'])}}
            for hit in name_hits if hit.get('osm_type') in ('way', 'relation') and hit.get('lat') is not None
        ]
        # Prefer to centre the search on the name hit's own coordinates when
        # one exists (checking every hit, including a bare node -- a node
        # can never itself become an osmCourse/anchor, per the OSM_REF
        # schema, but it still tells us roughly where the facility is)
        # rather than only the city point: a facility whose grounds sit well
        # away from the city centroid (a resort on the outskirts) is
        # otherwise searched, and distance-scored, from the wrong origin.
        name_hit_point = next(
            ((float(hit['lat']), float(hit['lon'])) for hit in name_hits if hit.get('lat') is not None), None)
        search_center = name_hit_point or point

        # 2. Overpass leisure=golf_course, escalating the radius only while
        # nothing survives the name/distance filter below -- not merely
        # until Overpass returns *some* raw result. A radius that turns up
        # only an unrelated element (rejected anyway) must not silently
        # starve every wider, more expensive radius that might hold the
        # real course.
        seen_keys: set[tuple] = set()
        polygon_candidates: list[dict] = []
        for element in named_candidates:
            key = (element.get('type'), element.get('id'))
            if key not in seen_keys:
                seen_keys.add(key)
                polygon_candidates.append(element)

        # Only the top 4 survivors (mirroring the audit's own `matches[:4]`)
        # ever reach `overpass_features` below -- Pinehurst alone can carry
        # 10+ golf_course elements within 5 km, and a feature-count call is
        # an expensive area query; fetching it for every candidate is what
        # made this resolver hang.
        basis_radius = radii_m[-1]
        ranked: list[tuple] = []
        rejected: list[dict] = []
        for i, radius_m in enumerate(radii_m):
            if i > 0:
                time.sleep(sleep)
            found = _alc.overpass_courses(search_center[0], search_center[1], radius_m)
            for element in found:
                key = (element.get('type'), element.get('id'))
                if key not in seen_keys:
                    seen_keys.add(key)
                    polygon_candidates.append(element)
            ranked, rejected = _rank_candidates(polygon_candidates, wanted, search_center, name)
            basis_radius = radius_m
            if ranked:
                break
        record['candidates'].extend(rejected)
        top, rest = ranked[:4], ranked[4:]
        for _, scored, _element in rest:
            scored['rejected'] = 'outside the top-scoring candidates considered for features'
            record['candidates'].append(scored)

        best = None
        for _, scored, element in top:
            centre = element.get('center') or element
            counts, feature_basis = _alc.overpass_features(element if element.get('type') else None,
                                                             float(centre['lat']), float(centre['lon']), 1500)
            time.sleep(sleep)
            feature_total = counts.get('hole', 0) + counts.get('green', 0)
            qualifies = counts.get('green', 0) >= FEATURE_FLOOR or counts.get('hole', 0) >= FEATURE_FLOOR
            scored.update(golfFeatures=counts, featureBasis=feature_basis, featureTotal=feature_total)
            if not qualifies:
                scored['rejected'] = f'fewer than {FEATURE_FLOOR} holes/greens found ({counts.get("hole", 0)} holes, {counts.get("green", 0)} greens)'
                record['candidates'].append(scored)
                continue
            # A name search alone cannot say what this element actually is:
            # Forest Oaks' own failure is a name search for "Forest Oaks,
            # Greensboro" returning relation/180400 -- a census-designated-
            # place boundary -- as a *named* candidate with overlap 1.0,
            # which then "qualifies" on features only because the real golf
            # holes geometrically sit inside that town-sized polygon. Fetch
            # its real tags before ever trusting it as a facility.
            real_tags = _verify_tags(element['type'], element['id'])
            time.sleep(sleep)
            if ADMINISTRATIVE_TAGS & set(real_tags):
                scored['rejected'] = f'real tags are an administrative/statistical boundary ({real_tags!r}), not a facility'
                record['candidates'].append(scored)
                continue
            real_leisure = real_tags.get('leisure')
            if real_leisure and real_leisure != 'golf_course':
                # Really tagged as something else non-administrative (Bryan
                # Park's own anchors are `leisure=park`) -- may still become
                # an *anchor* below, but never the course polygon itself.
                scored['rejected'] = f'real tags are leisure={real_leisure!r}, not a golf course polygon'
                record['candidates'].append(scored)
                continue
            scored['realTags'] = real_tags
            # Among qualifying, tag-verified candidates, prefer the
            # strongest name match; tie-break on more greens, then nearer.
            rank = (-scored['nameOverlap'], -counts.get('green', 0), scored['distanceKm'] if scored['distanceKm'] is not None else math.inf)
            if best is None or rank < best[0]:
                if best is not None:
                    best[1]['rejected'] = 'a better-scoring candidate was chosen'
                    record['candidates'].append(best[1])
                best = (rank, scored, element)
            else:
                scored['rejected'] = 'a better-scoring candidate was chosen'
                record['candidates'].append(scored)

        if best:
            _, scored, element = best
            tags = element.get('tags', {}) or {}
            centre = element.get('center') or element
            record['osmCourse'] = {'type': element['type'], 'id': element['id'], 'siteId': f"osm-{element['type']}-{element['id']}",
                                    'name': tags.get('name'), 'matchScore': scored['nameOverlap'], 'center': [centre.get('lat'), centre.get('lon')],
                                    'realTags': scored.get('realTags', {})}
            record['golfFeatures'] = scored['golfFeatures']
            record['featureBasis'] = scored['featureBasis']
            record['candidates'].append({**scored, 'chosen': True})
            record['notes'].append(f'resolved to {record["osmCourse"]["siteId"]} ({tags.get("name")!r}), radius {basis_radius}m, {len(polygon_candidates)} candidate(s) considered')
        else:
            # 3. Last resort: a named place with no golf_course tag at all
            # (Bryan Park / Magnolia Greens' own failure mode) -- reuse the
            # audit's proven anchor search rather than reinventing it.
            record['notes'].append(f'no qualifying golf_course polygon among {len(polygon_candidates)} candidate(s) within {basis_radius}m')
            try:
                anchors = _alc.anchor_by_name(name, city, state, country, search_center[0], search_center[1], radii_m[-1])
            except Exception as exc:  # noqa: BLE001
                anchors = []
                record['notes'].append(f'anchor search failed: {type(exc).__name__}: {str(exc)[:120]}')
            time.sleep(sleep)
            for anchor in anchors[:6]:
                centre = anchor.get('center') or anchor
                if centre.get('lat') is None:
                    continue
                anchor_tags = anchor.get('tags', {}) or {}
                label = anchor_tags.get('name')
                # An anchor from Nominatim/`anchor_by_name` carries only the
                # tags this module (or the audit) synthesized for it, which
                # is never enough to rule out an administrative boundary --
                # the same real-tag fetch used for the polygon path above,
                # not the embedded/synthesized tags, is what actually proves
                # this is a facility.
                real_tags = _verify_tags(anchor['type'], anchor['id'])
                time.sleep(sleep)
                if ADMINISTRATIVE_TAGS & set(real_tags):
                    # A census place / administrative boundary is not a
                    # facility -- Forest Oaks' own failure: relation/180400
                    # is `boundary=statistical, border_type=
                    # census_designated_place`, a town-sized polygon that
                    # would make the facility AOI the whole community.
                    record['candidates'].append({'type': anchor.get('type'), 'id': anchor.get('id'), 'osmName': label,
                                                  'rejected': f'real tags are an administrative/statistical boundary ({real_tags!r}), not a facility'})
                    continue
                counts, _basis = _alc.overpass_features(None, float(centre['lat']), float(centre['lon']), 2500)
                time.sleep(sleep)
                scored = {'type': anchor.get('type'), 'id': anchor.get('id'), 'osmName': label,
                          'nameOverlap': None, 'distanceKm': round(_alc.distance_km(search_center, (float(centre['lat']), float(centre['lon']))), 2),
                          'golfFeatures': counts, 'featureBasis': 'around_2500m', 'realTags': real_tags}
                qualifies = counts.get('green', 0) >= FEATURE_FLOOR or counts.get('hole', 0) >= FEATURE_FLOOR
                if qualifies and (record['anchor'] is None or counts.get('green', 0) > record['golfFeatures'].get('green', 0)):
                    if record['anchor'] is not None:
                        record['candidates'][-1]['rejected'] = 'a better-scoring anchor was chosen'
                    record['anchor'] = {'type': anchor['type'], 'id': anchor['id'], 'name': label, 'center': [centre['lat'], centre['lon']],
                                        'realTags': real_tags}
                    record['golfFeatures'] = counts
                    record['featureBasis'] = 'around_2500m'
                    scored['chosen'] = True
                else:
                    scored['rejected'] = 'no golf features at this anchor' if not qualifies else 'a better-scoring anchor was chosen'
                record['candidates'].append(scored)
            if record['anchor']:
                record['notes'].append(f"no course polygon; holes and greens are mapped around {record['anchor']['name']} "
                                        f"(osm-{record['anchor']['type']}-{record['anchor']['id']}): the build uses a bbox, not a polygon")

        counts = record['golfFeatures']
        record['holes'], record['greens'], record['fairways'], record['bunkers'], record['tees'] = (
            counts.get(k, 0) for k in ('hole', 'green', 'fairway', 'bunker', 'tee'))
        origin = (record['osmCourse'] or record['anchor'] or {}).get('center')
        if origin and (record['country'] or '').lower() != 'canada' and (record['state'] or '').lower() != 'on':
            record['dem1mTiles'] = _alc.dem_1m_tiles(float(origin[0]), float(origin[1]))
        elif origin:
            record['notes'].append('outside USGS 3DEP (not in the US)')
        record['verdict'] = _alc.verdict_for(record)
        return record
    finally:
        restore(originals)


def _already_resolved(facility: dict) -> bool:
    anchor = facility.get('anchor') or {}
    return bool(facility.get('osmPin') or facility.get('osmCourse') or anchor.get('type') in ('way', 'relation'))


def merge_played_courses(rows: list[dict], existing_coverage: dict, *, sleep: float = 1.5,
                          cache: ResponseCache | None = None, only_names: set[str] | None = None,
                          reresolve_library_ids: set[str] | None = None) -> dict:
    """Group `rows` ({id, name, city, state}) the same way the audit groups
    library rows -- by `facility_key`, first two name words + city -- resolve
    only the groups whose library rows have no usable pin, polygon or
    way/relation anchor yet in `existing_coverage` (keyed by library id, not
    by name: a name already present but still unresolved, like Magnolia
    Greens or River Landing, must not be skipped), and return a new coverage
    document. A resolved group REPLACES every existing facility row that
    shares one of its library ids (never mutates `existing_coverage`).

    `only_names` restricts resolution to rows whose name is in the set
    (case-insensitive substring), for a bounded, auditable run.

    `reresolve_library_ids`: library ids to re-resolve even though their
    existing coverage row looks resolved -- for a pin later found to be
    wrong (Forest Oaks' anchor turned out to be a census-place boundary,
    not a facility; see `resolve_facility`'s anchor tag check, added after
    that row was already on disk).
    """
    reresolve = reresolve_library_ids or set()
    existing_by_library_id: dict[str, dict] = {}
    for facility in existing_coverage.get('facilities', []):
        for library_id in facility.get('libraryIds', []):
            existing_by_library_id[library_id] = facility

    groups: dict[str, dict] = {}
    for row in rows:
        if only_names is not None and not any(part.lower() in (row.get('name') or '').lower() for part in only_names):
            continue
        existing_row = existing_by_library_id.get(row['id'])
        if row['id'] not in reresolve and existing_row and _already_resolved(existing_row):
            continue
        key = facility_key(row.get('name') or '', row.get('city') or '')
        group = groups.setdefault(key, {'name': row.get('name'), 'city': (row.get('city') or '').strip(),
                                         'state': (row.get('state') or '').strip(), 'country': row.get('country'),
                                         'libraryIds': [], 'libraryNames': []})
        group['libraryIds'].append(row['id'])
        group['libraryNames'].append(row.get('name'))

    new_rows = []
    for group in groups.values():
        record = resolve_facility(group['name'], group['city'], group['state'], group['country'], sleep=sleep, cache=cache)
        record['libraryIds'] = group['libraryIds']
        record['libraryNames'] = group['libraryNames']
        new_rows.append(record)

    # A group is built only from `rows` given to this call, which may be a
    # deliberately narrow subset -- `reresolve_library_ids` re-resolves one
    # library id of what may be a multi-id existing row. Dropping the whole
    # existing row wholesale would silently lose any library id it carried
    # that isn't part of this run's input (Forest Oaks CC's duplicate id,
    # `a2669ed5-...`, shares a coverage row with the library id a run might
    # re-resolve on its own). Carry such ids forward onto the new row that
    # replaces it; if no new row shares any id with the old one, keep the
    # old row untouched instead of losing it.
    new_library_ids = {library_id for record in new_rows for library_id in record['libraryIds']}
    all_existing = existing_coverage.get('facilities', [])
    replaced_ids = {id(f) for f in all_existing if set(f.get('libraryIds', [])) & new_library_ids}
    kept = [f for f in all_existing if id(f) not in replaced_ids]
    for old in all_existing:
        if id(old) not in replaced_ids:
            continue
        carry_over = [(lid, nm) for lid, nm in zip(old.get('libraryIds', []), old.get('libraryNames', []))
                      if lid not in new_library_ids]
        if not carry_over:
            continue
        target = next((r for r in new_rows if set(r['libraryIds']) & set(old.get('libraryIds', []))), None)
        if target is not None:
            target['libraryIds'] = target['libraryIds'] + [lid for lid, _ in carry_over]
            target['libraryNames'] = target['libraryNames'] + [nm for _, nm in carry_over]
        else:
            kept.append(old)
    return {**existing_coverage, 'facilities': kept + new_rows}

"""The library catalog, read the way `src/lib/golf/course-geometry/catalog.ts`
reads it. The invariants and their messages are kept identical to the zod
schema so both sides fail the same fixture the same way
(`src/test/fixtures/course-geometry/factory/catalog-invariants.json`).
"""
import json
import os
import re
from dataclasses import dataclass, field

SLUG = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
OSM_REF = re.compile(r'^(?:node|way|relation)/\d+$')
SITE_ID = re.compile(r'^osm-(?:node|way|relation)-\d+$')
HOLE_KEY = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*-\d{2}$')
ISO_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
TIERS = ('C0', 'C1', 'C2', 'C3', 'C4')
RETAINED_KEYS = ('osm', 'osmContext', 'terrain', 'compiled', 'context', 'contextReport', 'canopyReview',
                 'imageryReview', 'associations', 'reviewOverlay', 'naip', 'world', 'imageryTraces')


class CatalogError(Exception):
    def __init__(self, problems):
        super().__init__('; '.join(problems))
        self.problems = list(problems)


@dataclass
class Catalog:
    root: str
    facilities: dict = field(default_factory=dict)
    layouts: dict = field(default_factory=dict)
    scorecards: dict = field(default_factory=dict)
    problems: list = field(default_factory=list)

    def layouts_of(self, facility_id):
        return [l for l in self.layouts.values() if l['facilityId'] == facility_id]

    def scorecards_of(self, layout_id):
        return [c for c in self.scorecards.values() if c['layoutId'] == layout_id]

    def canonical_hash_inputs(self):
        return {'facilities': self.facilities, 'layouts': self.layouts, 'scorecards': self.scorecards}


def _read_dir(root, sub):
    out = {}
    folder = os.path.join(root, sub)
    if not os.path.isdir(folder):
        return out
    for name in sorted(os.listdir(folder)):
        if name.endswith('.json'):
            with open(os.path.join(folder, name), encoding='utf-8') as f:
                out[name[:-5]] = json.load(f)
    return out


def load_catalog(root):
    """Parse every manifest; schema problems are reported per file, then the
    cross-file check runs on whatever parsed. `problems` empty = consistent."""
    catalog = Catalog(root=root)
    for name, doc in _read_dir(root, 'facilities').items():
        errs = facility_problems(doc)
        if errs:
            catalog.problems += [f'facilities/{name}.json: {e}' for e in errs]
        elif doc['facilityId'] != name:
            catalog.problems.append(f'facilities/{name}.json declares facilityId {doc["facilityId"]}')
        else:
            catalog.facilities[name] = doc
    for name, doc in _read_dir(root, 'layouts').items():
        errs = layout_problems(doc)
        if errs:
            catalog.problems += [f'layouts/{name}.json: {e}' for e in errs]
        elif doc['layoutId'] != name:
            catalog.problems.append(f'layouts/{name}.json declares layoutId {doc["layoutId"]}')
        else:
            catalog.layouts[name] = doc
    for name, doc in _read_dir(root, 'scorecards').items():
        errs = scorecard_problems(doc)
        if errs:
            catalog.problems += [f'scorecards/{name}.json: {e}' for e in errs]
        elif doc['profileId'] != name:
            catalog.problems.append(f'scorecards/{name}.json declares profileId {doc["profileId"]}')
        else:
            catalog.scorecards[name] = doc
    catalog.problems += cross_problems(catalog)
    return catalog


def _require(doc, key, predicate, message, errs):
    if key not in doc or not predicate(doc[key]):
        errs.append(message)


def _is_position(v):
    return isinstance(v, list) and len(v) == 2 and all(isinstance(x, (int, float)) for x in v) and -180 <= v[0] <= 180 and -90 <= v[1] <= 90


def _str_list(v, pattern=None, lo=0, hi=10 ** 6):
    return isinstance(v, list) and lo <= len(v) <= hi and all(isinstance(x, str) and (pattern is None or pattern.match(x)) for x in v)


def facility_problems(doc):
    errs = []
    if not isinstance(doc, dict):
        return ['not an object']
    _require(doc, 'schema', lambda v: v == 'golfhelm-facility-v1', 'schema must be golfhelm-facility-v1', errs)
    _require(doc, 'facilityId', lambda v: isinstance(v, str) and SLUG.match(v), 'facilityId: kebab-case id', errs)
    _require(doc, 'name', lambda v: isinstance(v, str) and 1 <= len(v) <= 160, 'name required', errs)
    _require(doc, 'country', lambda v: isinstance(v, str) and len(v) == 2, 'country: two letters', errs)
    _require(doc, 'region', lambda v: isinstance(v, str) and 1 <= len(v) <= 40, 'region required', errs)
    _require(doc, 'originWgs84', _is_position, 'originWgs84: [lon, lat]', errs)
    aoi = doc.get('aoi')
    if not (isinstance(aoi, dict) and aoi.get('kind') == 'osm' and isinstance(aoi.get('id'), str) and OSM_REF.match(aoi['id'])
            and isinstance(aoi.get('marginM'), int) and 0 <= aoi['marginM'] <= 2000 and set(aoi) == {'kind', 'id', 'marginM'}):
        errs.append('aoi: {kind: osm, id: <type>/<id>, marginM: 0..2000}')
    pins = doc.get('sourcePins')
    if not (isinstance(pins, dict) and set(pins) == {'osm'} and _str_list(pins.get('osm'), OSM_REF, 1, 50)):
        errs.append('sourcePins.osm: 1..50 osm element refs')
    pol = doc.get('providerPolicy')
    if not (isinstance(pol, dict) and set(pol) == {'terrain', 'imagery', 'context'} and all(_str_list(pol.get(k), None, 1) for k in ('terrain', 'imagery', 'context'))):
        errs.append('providerPolicy: terrain/imagery/context provider lists')
    if 'knownRenovationAfter' in doc and doc['knownRenovationAfter'] is not None and not (isinstance(doc['knownRenovationAfter'], str) and ISO_DATE.match(doc['knownRenovationAfter'])):
        errs.append('knownRenovationAfter: YYYY-MM-DD')
    if 'notes' in doc and not _str_list(doc['notes'], None, 0, 20):
        errs.append('notes: up to 20 strings')
    extra = set(doc) - {'schema', 'facilityId', 'name', 'country', 'region', 'originWgs84', 'aoi', 'sourcePins', 'providerPolicy', 'knownRenovationAfter', 'notes'}
    if extra:
        errs.append(f'unknown keys: {", ".join(sorted(extra))}')
    return errs


def layout_problems(doc):
    errs = []
    if not isinstance(doc, dict):
        return ['not an object']
    _require(doc, 'schema', lambda v: v == 'golfhelm-layout-v1', 'schema must be golfhelm-layout-v1', errs)
    _require(doc, 'layoutId', lambda v: isinstance(v, str) and SLUG.match(v), 'layoutId: kebab-case id', errs)
    _require(doc, 'facilityId', lambda v: isinstance(v, str) and SLUG.match(v), 'facilityId: kebab-case id', errs)
    _require(doc, 'name', lambda v: isinstance(v, str) and 1 <= len(v) <= 160, 'name required', errs)
    _require(doc, 'siteIds', lambda v: _str_list(v, SITE_ID, 1, 8), 'siteIds: 1..8 osm site ids', errs)
    segments = doc.get('segments')
    if not (isinstance(segments, dict) and all(SLUG.match(k) and isinstance(v, dict) and set(v) == {'holes'} and _str_list(v['holes'], HOLE_KEY, 1, 27) for k, v in segments.items())):
        errs.append('segments: {<slug>: {holes: [<segment>-NN]}}')
        segments = {}
    _require(doc, 'segmentOrder', lambda v: _str_list(v, SLUG, 1, 4), 'segmentOrder: 1..4 segment ids', errs)
    _require(doc, 'holeOrder', lambda v: _str_list(v, HOLE_KEY, 1, 36), 'holeOrder: 1..36 hole keys', errs)
    routes = doc.get('routeWayIds', 'missing')
    if routes == 'missing' or not (routes is None or (isinstance(routes, list) and 1 <= len(routes) <= 36 and all(isinstance(x, int) and x > 0 for x in routes))):
        errs.append('routeWayIds: positive way ids or null')
    bbox = doc.get('bboxWgs84', 'missing')
    if bbox == 'missing' or not (bbox is None or (isinstance(bbox, list) and len(bbox) == 4 and all(isinstance(x, (int, float)) for x in bbox))):
        errs.append('bboxWgs84: [w, s, e, n] or null')
    _require(doc, 'capabilityTier', lambda v: v in TIERS, 'capabilityTier: C0..C4', errs)
    ext = doc.get('externalBindings')
    if not (isinstance(ext, dict) and set(ext) == {'golfCourseIds'} and _str_list(ext['golfCourseIds'], UUID, 0, 8)):
        errs.append('externalBindings.golfCourseIds: up to 8 uuids')
    _require(doc, 'scorecardProfiles', lambda v: _str_list(v, SLUG, 0, 8), 'scorecardProfiles: up to 8 profile ids', errs)
    geometry = doc.get('geometry', 'missing')
    if geometry == 'missing' or not (geometry is None or (isinstance(geometry, dict) and set(geometry) == {'package', 'published'} and isinstance(geometry['package'], str) and geometry['package']
                                                          and (geometry['published'] is None or (isinstance(geometry['published'], str) and geometry['published'])))):
        errs.append('geometry: {package, published|null} or null')
    retained = doc.get('retained')
    if retained is not None and not (isinstance(retained, dict) and all(k in RETAINED_KEYS and isinstance(v, str) and v for k, v in retained.items())):
        errs.append(f'retained: {{{"|".join(RETAINED_KEYS)}: path}}')
    if 'knownRenovationAfter' in doc and doc['knownRenovationAfter'] is not None and not (isinstance(doc['knownRenovationAfter'], str) and ISO_DATE.match(doc['knownRenovationAfter'])):
        errs.append('knownRenovationAfter: YYYY-MM-DD')
    if 'notes' in doc and not _str_list(doc['notes'], None, 0, 20):
        errs.append('notes: up to 20 strings')
    extra = set(doc) - {'schema', 'layoutId', 'facilityId', 'name', 'siteIds', 'segments', 'segmentOrder', 'holeOrder', 'routeWayIds', 'bboxWgs84',
                        'capabilityTier', 'externalBindings', 'scorecardProfiles', 'geometry', 'retained', 'knownRenovationAfter', 'notes'}
    if extra:
        errs.append(f'unknown keys: {", ".join(sorted(extra))}')
    if errs:
        return errs
    # The same refinements as the zod schema, same messages.
    in_segments = set()
    for s in doc['segmentOrder']:
        if s not in segments:
            errs.append(f'segmentOrder names unknown segment {s}')
        else:
            in_segments.update(segments[s]['holes'])
    if len(set(doc['holeOrder'])) != len(doc['holeOrder']):
        errs.append('holeOrder repeats a hole')
    for h in doc['holeOrder']:
        if h not in in_segments:
            errs.append(f'hole {h} is in no ordered segment')
    if doc['routeWayIds'] is not None and len(doc['routeWayIds']) != len(doc['holeOrder']):
        errs.append('one route way per hole')
    if doc['capabilityTier'] != 'C0' and not doc['geometry']:
        errs.append('a layout above C0 names its geometry package')
    return errs


def scorecard_problems(doc):
    errs = []
    if not isinstance(doc, dict):
        return ['not an object']
    _require(doc, 'schema', lambda v: v == 'golfhelm-scorecard-profile-v1', 'schema must be golfhelm-scorecard-profile-v1', errs)
    _require(doc, 'profileId', lambda v: isinstance(v, str) and SLUG.match(v), 'profileId: kebab-case id', errs)
    _require(doc, 'layoutId', lambda v: isinstance(v, str) and SLUG.match(v), 'layoutId: kebab-case id', errs)
    tee = doc.get('teeName', 'missing')
    if tee == 'missing' or not (tee is None or (isinstance(tee, str) and 1 <= len(tee) <= 60)):
        errs.append('teeName: string or null')
    src = doc.get('source')
    if not (isinstance(src, dict) and src.get('provider') in ('official_course_site', 'helm_course_library', 'owner_supplied')
            and (src.get('url') is None or isinstance(src.get('url'), str)) and isinstance(src.get('retrievedAt'), str) and ISO_DATE.match(src['retrievedAt'])
            and set(src) <= {'provider', 'url', 'retrievedAt', 'note'}):
        errs.append('source: {provider, url|null, retrievedAt, note?}')
    holes = doc.get('holes')
    ok = isinstance(holes, list) and 9 <= len(holes) <= 36 and all(
        isinstance(h, dict) and set(h) <= {'hole', 'par', 'yards', 'handicap'} and {'hole', 'par', 'yards'} <= set(h)
        and isinstance(h['hole'], int) and 1 <= h['hole'] <= 36 and isinstance(h['par'], int) and 3 <= h['par'] <= 6
        and isinstance(h['yards'], int) and 50 <= h['yards'] <= 800 for h in holes)
    if not ok:
        errs.append('holes: 9..36 of {hole, par, yards, handicap?}')
    extra = set(doc) - {'schema', 'profileId', 'layoutId', 'teeName', 'source', 'holes'}
    if extra:
        errs.append(f'unknown keys: {", ".join(sorted(extra))}')
    if errs:
        return errs
    for i, h in enumerate(holes):
        if h['hole'] != i + 1:
            errs.append(f'holes run 1..n in order (index {i} is hole {h["hole"]})')
    return errs


def cross_problems(catalog):
    """Same wording as `catalogProblems` in catalog.ts (without the registry
    half, which only the TypeScript side can see)."""
    problems = []
    facilities, layouts, cards = catalog.facilities, catalog.layouts, catalog.scorecards
    sites = {}
    for l in layouts.values():
        if l['facilityId'] not in facilities:
            problems.append(f'layout {l["layoutId"]}: unknown facility {l["facilityId"]}')
        for s in l['siteIds']:
            facility = facilities.get(l['facilityId'])
            ref = re.sub(r'^osm-(\w+)-(\d+)$', r'\1/\2', s)
            if facility and ref not in facility['sourcePins']['osm']:
                problems.append(f'layout {l["layoutId"]}: site {s} is not pinned by facility {l["facilityId"]}')
            other = sites.get(s)
            if other and layouts[other]['facilityId'] != l['facilityId']:
                problems.append(f'site {s} is claimed by {other} and {l["layoutId"]} in different facilities')
            sites[s] = l['layoutId']
        for p in l['scorecardProfiles']:
            card = cards.get(p)
            if not card:
                problems.append(f'layout {l["layoutId"]}: unknown scorecard profile {p}')
            elif card['layoutId'] != l['layoutId']:
                problems.append(f'scorecard {p} belongs to {card["layoutId"]}, listed by {l["layoutId"]}')
            elif len(card['holes']) != len(l['holeOrder']):
                problems.append(f'scorecard {p} has {len(card["holes"])} holes, layout {l["layoutId"]} plays {len(l["holeOrder"])}')
    for c in cards.values():
        if c['layoutId'] not in layouts:
            problems.append(f'scorecard {c["profileId"]}: unknown layout {c["layoutId"]}')
    return problems

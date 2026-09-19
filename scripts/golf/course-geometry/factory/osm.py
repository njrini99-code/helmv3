"""Reading retained Overpass extracts without geospatial dependencies:
the route proposal (Factory v2 §8.2) needs only tags, a point-in-polygon
test and a reference number per hole way."""
import gzip
import json
import re


def load_extract(path):
    with open(path, 'rb') as f:
        raw = f.read()
    if path.endswith('.gz'):
        raw = gzip.decompress(raw)
    return json.loads(raw)


def way_points(way):
    return [(p['lon'], p['lat']) for p in way.get('geometry') or []]


def point_in_ring(point, ring):
    x, y = point
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            cross = (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-18) + x1
            if x < cross:
                inside = not inside
    return inside


def bbox_of(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def in_bbox(point, bbox):
    return bbox[0] <= point[0] <= bbox[2] and bbox[1] <= point[1] <= bbox[3]


def parse_ref(tags):
    """A hole way's number: `ref` first, then `name` like "Hole 7"."""
    for key in ('ref', 'name'):
        value = str(tags.get(key) or '').strip()
        digits = ''.join(ch for ch in value if ch.isdigit())
        if digits and (key == 'ref' or value.lower().startswith('hole')):
            try:
                return int(digits)
            except ValueError:
                return None
    return None


def hole_ways(extract, site=None):
    """golf=hole ways with geometry, inside the site polygon (or bbox) when one
    is given. A way counts as inside when its midpoint is."""
    ways = []
    for element in extract.get('elements', []):
        if element.get('type') != 'way' or (element.get('tags') or {}).get('golf') != 'hole':
            continue
        points = way_points(element)
        if len(points) < 2:
            continue
        mid = points[len(points) // 2]
        if site:
            polygon, bbox = site.get('polygon'), site.get('bboxWgs84')
            if polygon and not point_in_ring(mid, polygon):
                continue
            if not polygon and bbox and not in_bbox(mid, bbox):
                continue
        tags = element.get('tags') or {}
        par = tags.get('par')
        ways.append({'id': element['id'], 'ref': parse_ref(tags), 'par': int(par) if str(par).isdigit() else None,
                     'name': tags.get('name'), 'description': tags.get('description'), 'points': len(points)})
    return ways


# Words that do not tell one course from another when a mapper names holes.
GENERIC_NAME_WORDS = frozenset(('course', 'golf', 'club', 'country', 'cc', 'links', 'resort', 'the', 'at', 'of', 'and'))
_HOLE_NUMBER_SUFFIX = re.compile(r'^(?P<label>.*?)[\s\-–:#]*(?:hole|no\.?|number)?[\s\-–:#]*0*(?P<n>\d{1,2})\s*$', re.IGNORECASE)


def _words(text):
    return re.findall(r'[a-z0-9]+', str(text or '').lower())


def series_label(way):
    """How a mapper told one course's holes from another's, minus the hole
    number: 'Big Blue Hole 1' → 'big blue'. None when the way carries no
    such naming ('Hole 7', a bare number, no tags)."""
    for text in (way.get('description'), way.get('name')):
        match = _HOLE_NUMBER_SUFFIX.match(str(text)) if text else None
        if match and _words(match.group('label')):
            return ' '.join(_words(match.group('label')))
    return None


def label_names_layout(label, layout_name):
    """A series label names the layout when every distinctive word of the
    label occurs in the layout's name ('big blue' ↔ 'Big Blue Course')."""
    words = [w for w in _words(label) if w not in GENERIC_NAME_WORDS]
    return bool(words) and set(words) <= set(_words(layout_name))


def named_series(ways, wanted, layout_name):
    """Among duplicate-numbered hole ways, the one series whose naming is the
    layout's and which numbers every wanted hole exactly once; None when no
    series or more than one qualifies. Evidence lists every label seen."""
    series = {}
    for way in ways:
        label = series_label(way)
        if label and way['ref'] in wanted:
            series.setdefault(label, {}).setdefault(way['ref'], []).append(way)
    qualifying = {label: group for label, group in series.items()
                  if label_names_layout(label, layout_name) and all(len(group.get(ref, ())) == 1 for ref in wanted)}
    chosen = next(iter(qualifying)) if len(qualifying) == 1 else None
    return (chosen, {ref: qualifying[chosen][ref][0] for ref in wanted} if chosen else None), sorted(series)


def propose_routes(extract, site, hole_count, pars=None, layout_name=None):
    """Pick one golf=hole way per played hole from the numbered ways inside
    the site, or explain why a person has to. Never guesses: a missing or
    repeated number is a blocker with the candidate list as evidence — except
    when the repeats are two courses sharing one polygon and exactly one series
    is named for this layout ('Big Blue Hole 1' … 'Big Blue Hole 18'), which
    is proposed as `osm_ref_named` and still queued for a person to confirm."""
    ways = hole_ways(extract, site)
    by_ref = {}
    for way in ways:
        if way['ref'] is not None:
            by_ref.setdefault(way['ref'], []).append(way)
    wanted = list(range(1, hole_count + 1))
    duplicates = {ref: [w['id'] for w in group] for ref, group in by_ref.items() if len(group) > 1 and ref in wanted}
    missing = [ref for ref in wanted if ref not in by_ref]
    unnumbered = [w['id'] for w in ways if w['ref'] is None]
    extra = sorted(ref for ref in by_ref if ref not in wanted)
    evidence = {'candidates': len(ways), 'numbered': len(by_ref), 'duplicateRefs': duplicates, 'missingRefs': missing,
                'unnumbered': len(unnumbered), 'extraRefs': extra}
    chosen = {ref: by_ref[ref][0] for ref in wanted} if not (duplicates or missing) else None
    if duplicates and not missing and layout_name:
        (label, chosen), evidence['namedSeries'] = named_series(ways, wanted, layout_name)
        if chosen:
            evidence['series'] = label
    if not chosen:
        return None, evidence
    ids = [chosen[ref]['id'] for ref in wanted]
    disagreements = []
    if pars:
        for ref, par in zip(wanted, pars):
            source = chosen[ref]['par']
            if source is not None and source != par:
                disagreements.append({'hole': ref, 'wayId': chosen[ref]['id'], 'osmPar': source, 'scorecardPar': par})
    evidence['parDisagreements'] = disagreements
    return ids, evidence

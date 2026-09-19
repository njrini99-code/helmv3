"""Reading retained Overpass extracts without geospatial dependencies:
the route proposal (Factory v2 §8.2) needs only tags, a point-in-polygon
test and a reference number per hole way."""
import gzip
import json


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
                     'name': tags.get('name'), 'points': len(points)})
    return ways


def propose_routes(extract, site, hole_count, pars=None):
    """Pick one golf=hole way per played hole from the numbered ways inside
    the site, or explain why a person has to. Never guesses: a missing or
    repeated number is a blocker with the candidate list as evidence."""
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
    if duplicates or missing:
        return None, evidence
    ids = [by_ref[ref][0]['id'] for ref in wanted]
    disagreements = []
    if pars:
        for ref, par in zip(wanted, pars):
            source = by_ref[ref][0]['par']
            if source is not None and source != par:
                disagreements.append({'hole': ref, 'wayId': by_ref[ref][0]['id'], 'osmPar': source, 'scorecardPar': par})
    evidence['parDisagreements'] = disagreements
    return ids, evidence

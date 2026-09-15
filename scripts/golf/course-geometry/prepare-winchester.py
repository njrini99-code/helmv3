"""Local Winchester candidate. OSM associations remain reviewable, not published.

Uses recorded Gold scorecard pars/yardages without rescaling source geometry.
Ambiguous nearby bunkers are omitted and reported, never assigned by convenience.
"""
import gzip
import hashlib
import importlib.util
import json
import xml.etree.ElementTree as ET
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon, box, mapping
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'src/test/fixtures/course-geometry'
CACHE = BASE / 'sources/top-course-osm'
spec = importlib.util.spec_from_file_location('pilot', Path(__file__).with_name('prepare-pilot.py'))
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)
pilot.ORIGIN = [-78.145, 39.170]


def main():
    source = next(c for c in json.loads((CACHE / 'discovery.json').read_text()) if c['name'] == 'Winchester CC')
    root = ET.fromstring(gzip.decompress((CACHE / source['sourceFile']).read_bytes()))
    nodes = {n.get('id'): [float(n.get('lon')), float(n.get('lat'))] for n in root.findall('node')}
    ways = {w.get('id'): w for w in root.findall('way')}
    raw, rejected = [], []
    for way in root.findall('way'):
        tags = {t.get('k'): t.get('v') for t in way.findall('tag')}
        kind = tags.get('golf')
        kind = 'route' if kind == 'hole' else 'water' if kind in ('water_hazard', 'lateral_water_hazard') or tags.get('natural') == 'water' else kind
        if tags.get('natural') == 'wood' or tags.get('landuse') == 'forest':
            kind = 'woods'
        if kind not in ('route', 'fairway', 'green', 'tee', 'bunker', 'water', 'woods', 'rough'):
            continue
        coords = [nodes[n.get('ref')] for n in way.findall('nd') if n.get('ref') in nodes]
        ident = 'osm-way-' + way.get('id')
        if len(coords) != len(way.findall('nd')) or len(coords) < 2:
            rejected.append(ident)
            continue
        shape = LineString([pilot.local(p) for p in coords]) if kind == 'route' else Polygon([pilot.local(p) for p in coords])
        if not shape.is_valid or (kind != 'route' and coords[0] != coords[-1]) or len(coords) > 512:
            rejected.append(ident)
            continue
        raw.append({'id': ident, 'kind': kind, 'coords': coords, 'shape': shape, 'tags': tags, 'version': way.get('version'), 'timestamp': way.get('timestamp')})
    for relation in root.findall('relation'):
        tags = {t.get('k'): t.get('v') for t in relation.findall('tag')}
        if tags.get('type') != 'multipolygon' or tags.get('golf') != 'fairway':
            continue
        rings = {'outer': [], 'inner': []}
        valid = True
        for member in relation.findall('member'):
            way = ways.get(member.get('ref'))
            if way is None or member.get('role') not in rings:
                valid = False
                break
            coords = [nodes[n.get('ref')] for n in way.findall('nd') if n.get('ref') in nodes]
            if len(coords) != len(way.findall('nd')) or len(coords)<4 or coords[0]!=coords[-1] or len(coords)>512:
                valid = False
                break
            rings[member.get('role')].append(coords)
        ident = 'osm-relation-' + relation.get('id')
        if not valid or not rings['outer']:
            rejected.append(ident)
            continue
        geographic = unary_union([Polygon(r) for r in rings['outer']]).difference(unary_union([Polygon(r) for r in rings['inner']]))
        local = unary_union([Polygon([pilot.local(p) for p in r]) for r in rings['outer']]).difference(unary_union([Polygon([pilot.local(p) for p in r]) for r in rings['inner']]))
        if not geographic.is_valid or not local.is_valid:
            rejected.append(ident)
            continue
        raw.append({'id':ident,'kind':'fairway','coords':rings['outer'][0],'shape':local,'geometry':mapping(geographic),
                    'tags':tags,'version':relation.get('version'),'timestamp':relation.get('timestamp')})
    routes = sorted([f for f in raw if f['kind'] == 'route'], key=lambda f: int(f['tags']['ref']))
    assert [int(r['tags']['ref']) for r in routes] == list(range(1, 19))
    card = next(t for t in json.loads((BASE / 'cohort-scorecards.json').read_text())['scorecards'] if t['course_id'] == source['courseId'] and t['tee_name'] == 'Gold')
    features, holes, reports = {}, [], []
    for route, score in zip(routes, card['holes']):
        ordinal = int(route['tags']['ref'])
        assert ordinal == score['number'] and int(route['tags']['par']) == score['par']
        key = f'winchester-{ordinal:02}'
        start, end = Point(route['shape'].coords[0]), Point(route['shape'].coords[-1])
        selected, omitted = [route], []
        greens = [f for f in raw if f['kind'] == 'green' and f['shape'].covers(end)]
        if len(greens) == 1:
            selected.extend(greens)
        for f in raw:
            if f['kind'] == 'fairway' and f['shape'].intersection(route['shape']).length > 10 or f['kind'] == 'tee' and f['shape'].distance(start) < 25:
                selected.append(f)
            elif f['kind'] in ('bunker', 'water'):
                distances = sorted((f['shape'].distance(r['shape']), r['id']) for r in routes)
                if distances[0][1] == route['id'] and distances[0][0] < 45:
                    if distances[1][0] - distances[0][0] > 15:
                        selected.append(f)
                    else:
                        omitted.append(f['id'])
        # Hole 7's two greenside bunkers visually agree with the 2022 native
        # 12-inch VBMP crop. Other holes retain candidate status and gap labels.
        geographic_bounds = Polygon(route['coords']).bounds if len(route['coords']) > 2 else LineString(route['coords']).bounds
        w, s, e, n = geographic_bounds
        for f in raw:
            if f['kind'] != 'woods':
                continue
            clipped = Polygon(f['coords']).intersection(box(w-.00065, s-.00045, e+.00065, n+.00045))
            if clipped.is_empty or clipped.area < .00000002 or clipped.geom_type not in ('Polygon', 'MultiPolygon'):
                continue
            geometry = mapping(clipped)
            woods_id = f['id'] + '-' + key + '-context-crop'
            features[woods_id] = {'id': woods_id, 'kind': 'woods', 'sourceIds': ['osm'], 'holeKeys': [key],
                'geometryWgs84': geometry, 'reviewed': ordinal == 7, 'accuracyMeters': None}
        ids = []
        for f in selected:
            ident = f['id']
            if ident not in features:
                features[ident] = {'id': ident, 'kind': f['kind'], 'sourceIds': ['osm'], 'holeKeys': [],
                    'geometryWgs84': f.get('geometry', {'type': 'LineString' if f['kind'] == 'route' else 'Polygon', 'coordinates': f['coords'] if f['kind'] == 'route' else [f['coords']]}),
                    'reviewed': False, 'accuracyMeters': None}
            features[ident]['holeKeys'].append(key)
            ids.append(ident)
        ids.extend(f['id'] for f in features.values() if f['kind'] == 'woods' and key in f['holeKeys'])
        holes.append({'key': key, 'ordinal': ordinal, 'par': score['par'], 'scorecardYards': score['yardage'],
            'featureIds': ids, 'routeFeatureId': route['id'], 'greenFeatureId': greens[0]['id'] if len(greens) == 1 else None,
            'nominalTargetWgs84': route['coords'][-1] if len(greens) == 1 else None, 'completeness': 'partial',
            'gaps': ['Source candidate; per-hole current boundary acceptance pending', 'Nearby ambiguous hazards omitted; absence is not confirmed coverage']})
        reports.append({'hole': ordinal, 'selectedFeatures': ids, 'omittedAmbiguousHazards': omitted})
    pkg = {'schemaVersion': 1, 'siteId': 'winchester-va-source-candidate', 'name': 'Winchester Country Club',
        'status': 'source_candidate', 'originWgs84': pilot.ORIGIN, 'projection': 'wgs84-local-enu-v1',
        'sources': [{'id': 'osm', 'provider': 'OpenStreetMap', 'licenseId': 'ODbL-1.0', 'url': source['sourceUrl'],
            'capturedAt': None, 'retrievedAt': '2026-09-13', 'attribution': '© OpenStreetMap contributors · ODbL 1.0'}],
        'features': list(features.values()), 'holes': holes}
    pkg['contentHash'] = hashlib.sha256(json.dumps(pkg, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    (BASE / 'winchester.json').write_text(json.dumps(pkg, separators=(',', ':')) + '\n')
    report = {'source': source, 'scorecardTeeId': card['tee_id'], 'status': 'source_candidate', 'rejectedWays': rejected,
        'holes': reports, 'limitations': ['OSM woods display copies clipped to context; crop edge is not a physical woodland edge',
            'Tree crowns illustrative, not measured tree heights', 'No production binding, pin, shot or terrain inference from imagery'],
        'sourceFeatures': [{k: f[k] for k in ('id','version','timestamp','tags')} for f in raw]}
    (BASE / 'winchester-review.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'holes': len(holes), 'features': len(features), 'hash': pkg['contentHash']}))


if __name__ == '__main__':
    main()

"""Rebuild the local Cacapon draft. Python 3 + Shapely 2.1.2; no network/writes to DB.

Usage: python3 scripts/golf/course-geometry/prepare-pilot.py /path/to/cacapon.osm
The downloaded XML is an OSM core map extract. Retain original WGS84 vertices,
source way/version/time and explicit per-hole association candidates. A source
review is NOT evidence of currentness, independent accuracy or a known pin.
"""
import hashlib
import json
import math
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

from shapely.geometry import LineString, Point, Polygon

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / 'src/test/fixtures/course-geometry'
ORIGIN = [-78.296, 39.512]


def local(point):
    """Same zero-altitude WGS84 local ENU as project.ts."""
    def ecef(p):
        lon, lat = [v * math.pi / 180 for v in p]
        e2 = 6.6943799901413165e-3
        n = 6378137 / math.sqrt(1 - e2 * math.sin(lat) ** 2)
        return [n * math.cos(lat) * math.cos(lon), n * math.cos(lat) * math.sin(lon),
                n * (1 - e2) * math.sin(lat)]
    d = [a - b for a, b in zip(ecef(point), ecef(ORIGIN))]
    lon, lat = [v * math.pi / 180 for v in ORIGIN]
    return [-math.sin(lon) * d[0] + math.cos(lon) * d[1],
            -math.sin(lat) * math.cos(lon) * d[0] - math.sin(lat) * math.sin(lon) * d[1] + math.cos(lat) * d[2]]


def main():
    source_path = Path(sys.argv[1])
    source_bytes = source_path.read_bytes()
    root = ET.fromstring(source_bytes)
    nodes = {n.attrib['id']: [float(n.attrib['lon']), float(n.attrib['lat'])] for n in root.findall('node')}
    raw = []
    for way in root.findall('way'):
        tags = {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
        kind = tags.get('golf')
        if tags.get('natural') == 'water':
            kind = 'water'
        if kind not in ('hole', 'tee', 'green', 'fairway', 'bunker', 'water'):
            continue
        coords = [nodes[n.attrib['ref']] for n in way.findall('nd')]
        if kind != 'hole' and coords[0] != coords[-1]:
            raise ValueError(f"Open area {way.attrib['id']}")
        raw.append({'id': 'osm-way-' + way.attrib['id'], 'version': way.attrib.get('version'),
                    'updatedAt': way.attrib.get('timestamp'), 'tags': tags, 'coordinates': coords,
                    'kind': 'route' if kind == 'hole' else kind})
    raw.sort(key=lambda f: f['id'])
    shapes = {f['id']: (LineString if f['kind'] == 'route' else Polygon)([local(p) for p in f['coordinates']]) for f in raw}
    for key, shape in shapes.items():
        if not shape.is_valid:
            raise ValueError(f'Invalid source topology: {key}')
    routes = sorted([f for f in raw if f['kind'] == 'route'], key=lambda f: int(f['tags']['ref']))
    assert [int(r['tags']['ref']) for r in routes] == list(range(1, 19))
    scorecard = json.loads((FIXTURES / 'cacapon-scorecard.json').read_text())
    holes, associations, report = [], {}, []
    reviewed_assignments = json.loads((FIXTURES / 'cacapon-associations.json').read_text())['holes']
    for route in routes:
        number = int(route['tags']['ref'])
        key = f'cacapon-{number:02}'
        reviewed = next(h for h in reviewed_assignments if h['hole'] == number)
        line = shapes[route['id']]
        end = Point(line.coords[-1])
        greens = [f for f in raw if f['kind'] == 'green' and shapes[f['id']].covers(end)]
        assert len(greens) == 1, (number, 'ambiguous/missing green')
        green = greens[0]
        selected = []
        for f in raw:
            shape = shapes[f['id']]
            include = f['id'] in (route['id'], green['id'])
            if f['kind'] == 'fairway':
                include = line.intersection(shape).length > 10
            elif f['kind'] == 'tee':
                include = shape.distance(Point(line.coords[0])) < 25
            elif f['kind'] == 'bunker':
                include = f['id'] in reviewed['bunkerIds']
            elif f['kind'] == 'water':
                include = f['id'] in reviewed['waterIds']
            # Source review: this tee overlaps the pond in NAIP 2022; quarantine it.
            if f['id'] == 'osm-way-885719212':
                include = False
            if include:
                selected.append(f['id'])
                associations.setdefault(f['id'], []).append(key)
        card = next(h for h in scorecard['holes'] if h['hole_number'] == number)
        assert card['par'] == int(route['tags']['par'])
        holes.append({'key': key, 'ordinal': number, 'par': card['par'], 'scorecardYards': card['yardage'],
                      'featureIds': selected, 'routeFeatureId': route['id'], 'greenFeatureId': green['id'],
                      # Route end is an interior orientation reference, NEVER a cup.
                      'nominalTargetWgs84': route['coordinates'][-1], 'completeness': 'partial',
                      'gaps': ['Current boundary accuracy and source capture date unverified',
                               'Independent course-familiar review pending',
                               'Daily tee markers and pin unknown; rough/fringe unmapped'] +
                              (['OSM tee 885719212 rejected: pond overlap; tee region unknown'] if number == 10 else [])})
        report.append({'hole': number, 'routeM': round(line.length, 3),
                       'scorecardYards': card['yardage'], 'greenId': green['id'],
                       'greenAreaM2': round(shapes[green['id']].area, 3),
                       'bunkerIds': [f['id'] for f in raw if f['id'] in selected and f['kind'] == 'bunker']})
    features = [{'id': f['id'], 'kind': f['kind'], 'sourceIds': ['osm-2026-09-12'],
                 'holeKeys': associations[f['id']], 'reviewed': True, 'accuracyMeters': None,
                 'geometryWgs84': {'type': 'LineString' if f['kind'] == 'route' else 'Polygon',
                                   'coordinates': f['coordinates'] if f['kind'] == 'route' else [f['coordinates']]}}
                for f in raw if f['id'] in associations]
    package = {'schemaVersion': 1, 'siteId': 'osm-way-223477412', 'name': 'Cacapon Golf Course',
               'status': 'reviewed_draft', 'originWgs84': ORIGIN, 'projection': 'wgs84-local-enu-v1',
               'features': features, 'holes': holes,
               'sources': [{'id': 'osm-2026-09-12', 'provider': 'OpenStreetMap', 'licenseId': 'ODbL-1.0',
                            'url': 'https://www.openstreetmap.org/way/223477412', 'capturedAt': None,
                            'retrievedAt': '2026-09-12', 'attribution': '© OpenStreetMap contributors · ODbL 1.0'}]}
    package['contentHash'] = hashlib.sha256(json.dumps(package, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    provenance = {'retrievedAt': '2026-09-12', 'url': 'https://www.openstreetmap.org/api/0.6/map?bbox=-78.308,39.500,-78.283,39.525',
                  'rawXmlSha256': hashlib.sha256(source_bytes).hexdigest(),
                  'license': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors',
                  'elements': raw}
    quality = {'reviewer': 'Codex source/geometry review; independent course-familiar acceptance pending',
               'date': '2026-09-12', 'packageHash': package['contentHash'], 'topology': 'All retained polygons valid (Shapely 2.1.2)',
               'simplification': 'None; all original WGS84 vertices retained',
               'associationPolicy': 'Routes by OSM ref; green contains route end; fairway intersects >10m; tees <25m from route start; explicit reviewed bunker/water IDs in cacapon-associations.json; shared green 4/8 retains shared bunkers. No distance-only hazard inclusion.',
               'imageryReview': {'provider': 'USDA NAIP via GeoPlatform', 'tile': 'm_3907830_se_17_060_20221020_20230117',
                                 'year': 2022, 'nominalPixelM': 0.6, 'public': 'yes',
                                 'service': 'https://imagery.geoplatform.gov/iipp/rest/services/NAIP/NAIP2022_CONUS/ImageServer',
                                 'exportBboxWgs84': [-78.308, 39.500, -78.283, 39.525], 'exportSize': [2048, 2048],
                                 'findings': '18 north-up comparisons inspected, then hazard membership corrected after the first proof exposed neighboring-hole contamination. Routing and major green/bunker groups agree visually; canopy and four-year imagery age prevent current boundary acceptance. Tee 885719212 rejected for pond overlap. No coordinates traced or shifted.',
                                 'independentAccuracyM': None},
               'holes': report, 'excludedSourceIds': [f['id'] for f in raw if f['id'] not in associations]}
    for name, data in [('cacapon.json', package), ('cacapon-source.json', provenance), ('cacapon-quality.json', quality)]:
        if name == 'cacapon-quality.json':
            rendered = json.dumps(data, ensure_ascii=False, indent=2)
        else:
            fields = []
            for key, value in data.items():
                if key in ('features', 'holes', 'elements'):
                    encoded = '[\n' + ',\n'.join('    ' + json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in value) + '\n  ]'
                else:
                    encoded = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
                fields.append('  ' + json.dumps(key) + ': ' + encoded)
            rendered = '{\n' + ',\n'.join(fields) + '\n}'
        (FIXTURES / name).write_text(rendered + '\n')
    print(json.dumps({'features': len(features), 'holes': len(holes), 'hash': package['contentHash'],
                      'excluded': len(quality['excludedSourceIds'])}))


if __name__ == '__main__':
    main()

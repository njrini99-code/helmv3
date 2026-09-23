"""Real importer regressions; no fake OSM ways, network, or approval bypass."""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from factory.context import Context
from source_geometry import identity, read_route_traces, validate

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = Path(__file__).with_name('prepare-osm-course.py')


def source_fixture():
    source = {'id': 'ortho', 'provider': 'test public survey', 'licenseId': 'test-license', 'url': 'https://example.org/source',
              'capturedAt': '2025-04-28', 'retrievedAt': '2026-09-20', 'attribution': 'Synthetic source for regression only'}
    doc = {'schema': 'golfhelm-source-geometry-v1', 'facilityId': 'test-facility', 'siteId': 'osm-way-1',
           'crs': 'EPSG:4326', 'coordinateOrder': 'longitude,latitude', 'sources': [source],
           'evidence': [{'id': 'image', 'sourceId': 'ortho', 'snapshotSha256': 'a' * 64, 'sourceCrs': 'EPSG:4326', 'method': 'guided trace'}],
           'features': [], 'holes': []}
    for i in range(1, 10):
        key = f'ocean-{i:02}'
        x, y = -79.0 + i * 0.001, 37.0
        route = [[x, y], [x, y + .002]]
        ring = [[x-.0001, y+.0019], [x+.0001, y+.0019], [x+.0001, y+.0021], [x-.0001, y+.0021], [x-.0001, y+.0019]]
        for kind, geometry in [('route', {'type': 'LineString', 'coordinates': route}), ('green', {'type': 'Polygon', 'coordinates': [ring]})]:
            doc['features'].append({'id': f'{kind}-{i}', 'kind': kind, 'holeKeys': [key], 'sourceIds': ['ortho'], 'evidenceIds': ['image'],
                                    'accuracyMeters': None, 'geometryWgs84': geometry})
        doc['holes'].append({'holeKey': key, 'routeFeatureId': f'route-{i}', 'greenFeatureId': f'green-{i}',
                             'identityReview': {'status': 'candidate', 'evidenceIds': ['image']}})
    return doc


def reviewed_route_trace_fixture():
    doc = source_fixture()
    doc['schema'] = 'golfhelm-route-traces-v1'
    doc['associationReview'] = {
        'status': 'confirmed', 'reviewer': 'synthetic reviewer', 'reviewedAt': '2026-09-21', 'evidenceIds': ['image'],
    }
    for hole in doc['holes']:
        hole['identityReview'] = {
            'status': 'confirmed', 'reviewer': 'synthetic reviewer', 'reviewedAt': '2026-09-21', 'evidenceIds': ['image'],
        }
    return doc


class SourceGeometryTests(unittest.TestCase):
    def test_reviewed_route_traces_resolve_without_osm_ids_and_satisfy_green_association(self):
        source = reviewed_route_trace_fixture()
        order = [h['holeKey'] for h in source['holes']]
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            path = folder/'routes.json'
            path.write_text(json.dumps(source))
            layout = {'facilityId': 'test-facility', 'siteIds': ['osm-way-1'], 'holeOrder': order,
                      'retained': {'routeTraces': str(path)}}
            catalog = SimpleNamespace(layouts={'test-layout': layout}, facilities={})
            resolution = Context(directory, catalog, str(folder/'output')).route_resolution('test-layout')
            self.assertEqual(resolution['source'], 'reviewed_route_traces')
            self.assertIsNone(resolution['routeWayIds'])
            self.assertTrue(resolution['routeTracesHash'])

            (folder/'osm.json').write_text(json.dumps({'elements': []}))
            card = {'facilityId': 'test-facility', 'siteId': 'osm-way-1', 'name': 'Reviewed routes', 'slug': 'test-layout',
                    'originWgs84': [-79, 37], 'holeOrder': order, 'pars': [4]*9, 'scorecardYards': [410]*9,
                    'routeWayIds': None, 'retrievedAt': '2026-09-21'}
            (folder/'card.json').write_text(json.dumps(card))
            result = subprocess.run([sys.executable, str(SCRIPT), str(folder/'osm.json'), str(folder/'card.json'), str(folder/'out'),
                                     '--route-traces', str(path)], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            package = json.loads((folder/'out/normalized.json').read_text())
            self.assertEqual([hole['greenFeatureId'] for hole in package['holes']], [f'green-{i}' for i in range(1, 10)])
            self.assertTrue((folder/'out/route-traces.json').is_file())
            metadata = json.loads((folder/'out/source-metadata.json').read_text())
            self.assertEqual(metadata['routeTracesHash'], resolution['routeTracesHash'])
            self.assertIsNone(metadata['sourceGeometryHash'])
            association = json.loads((folder/'out/association-report.json').read_text())
            self.assertIn('reviewed route-trace', association['routeSelection']['method'])
            self.assertEqual(association['routeTraces']['associationReview']['status'], 'confirmed')
            # Review confirms association only. It does not upgrade boundary
            # confidence or make the resulting package physically approved.
            self.assertTrue(all(not feature['reviewed'] for feature in package['features']))

    def test_route_trace_requires_confirmed_route_and_green_identity_review(self):
        doc = reviewed_route_trace_fixture()
        doc['holes'][0]['identityReview']['status'] = 'candidate'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'routes.json'
            path.write_text(json.dumps(doc))
            with self.assertRaisesRegex(ValueError, 'confirmed hole identity'):
                read_route_traces(path, 'test-facility', 'osm-way-1', [hole['holeKey'] for hole in doc['holes']])

    def test_factory_planning_accepts_import_without_osm_and_invalidates_changed_evidence(self):
        doc = source_fixture()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'source.json'
            path.write_text(json.dumps(doc))
            layout = {'facilityId': 'test-facility', 'siteIds': ['osm-way-1'], 'holeOrder': [h['holeKey'] for h in doc['holes']],
                      'retained': {'sourceGeometry': str(path)}}
            catalog = SimpleNamespace(layouts={'test-layout': layout}, facilities={})
            def context():
                return Context(directory, catalog, str(Path(directory)/'output'))
            before = context().route_resolution('test-layout')
            self.assertEqual(before['source'], 'source_geometry')
            self.assertIsNone(before['routeWayIds'])
            doc['evidence'][0]['snapshotSha256'] = 'b'*64
            path.write_text(json.dumps(doc))
            self.assertNotEqual(context().route_resolution('test-layout')['sourceGeometryHash'], before['sourceGeometryHash'])
            # A retained invalid import is a blocker, never a fallback to OSM.
            doc['holes'][0]['greenFeatureId'] = 'missing'
            path.write_text(json.dumps(doc))
            self.assertEqual(context().route_resolution('test-layout')['problem'], 'SOURCE_GEOMETRY_INVALID')

    def test_legacy_traced_green_is_available_before_osm_endpoint_association(self):
        source = source_fixture()
        elements, traces = [], []
        for index, hole in enumerate(source['holes'], 1):
            route = next(f for f in source['features'] if f['id'] == hole['routeFeatureId'])
            green = next(f for f in source['features'] if f['id'] == hole['greenFeatureId'])
            elements.append({'type': 'way', 'id': index, 'tags': {'golf': 'hole', 'ref': str(index), 'par': '4'},
                             'geometry': [{'lon': x, 'lat': y} for x, y in route['geometryWgs84']['coordinates']]})
            traces.append({'id': green['id'], 'kind': 'green', 'holeKey': hole['holeKey'], 'accuracyMeters': .5,
                           'coordinatesWgs84': green['geometryWgs84']['coordinates'][0]})
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder/'osm.json').write_text(json.dumps({'elements': elements}))
            card = {'siteId': 'osm-way-1', 'name': 'Legacy traced greens', 'slug': 'test-layout', 'originWgs84': [-79, 37],
                    'holeOrder': [h['holeKey'] for h in source['holes']], 'pars': [4]*9, 'scorecardYards': [410]*9,
                    'routeWayIds': list(range(1, 10)), 'retrievedAt': '2026-09-20'}
            (folder/'card.json').write_text(json.dumps(card))
            (folder/'traces.json').write_text(json.dumps({'kind': 'golfhelm-imagery-traces-v1', 'siteId': 'osm-way-1',
                'tracedAt': '2026-09-20', 'tracer': 'synthetic-test', 'source': {'provider': 'USDA NAIP', 'service': 'https://example.org/naip',
                'capturedAt': ['2025-04-28'], 'rasterSha256': 'a'*64}, 'features': traces}))
            result = subprocess.run([sys.executable, str(SCRIPT), str(folder/'osm.json'), str(folder/'card.json'), str(folder/'out'),
                                     '--traces', str(folder/'traces.json')], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            pkg = json.loads((folder/'out/normalized.json').read_text())
            for trace in traces:
                actual = next(f for f in pkg['features'] if f['id'] == trace['id'])
                self.assertEqual(actual['geometryWgs84']['coordinates'][0], trace['coordinatesWgs84'])
                self.assertFalse(actual['reviewed'])

    def test_real_preparer_without_osm_routes_or_greens_preserves_raw_vectors_and_keys(self):
        source = source_fixture()
        order = [h['holeKey'] for h in reversed(source['holes'])]
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder/'osm.json').write_text(json.dumps({'elements': []}))
            (folder/'source.json').write_text(json.dumps(source))
            card = {'facilityId': 'test-facility', 'siteId': 'osm-way-1', 'name': 'Test combined layout', 'slug': 'test-layout',
                    'originWgs84': [-79, 37], 'holeOrder': order, 'pars': [4]*9, 'scorecardYards': [410]*9,
                    'routeWayIds': None, 'retrievedAt': '2026-09-20'}
            (folder/'card.json').write_text(json.dumps(card))
            result = subprocess.run([sys.executable, str(SCRIPT), str(folder/'osm.json'), str(folder/'card.json'), str(folder/'out'), '--source-geometry', str(folder/'source.json')], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            pkg = json.loads((folder/'out/normalized.json').read_text())
            self.assertEqual([h['key'] for h in pkg['holes']], order)
            self.assertEqual(pkg['holes'][0]['greenFeatureId'], 'green-9')
            self.assertEqual(pkg['holes'][0]['scorecardYards'], 410)
            self.assertEqual(pkg['status'], 'source_candidate')
            self.assertTrue(all(not f['reviewed'] for f in pkg['features']))
            for feature in source['features']:
                actual = next(f for f in pkg['features'] if f['id'] == feature['id'])
                self.assertEqual(actual['geometryWgs84'], feature['geometryWgs84'])
            meta = json.loads((folder/'out/source-metadata.json').read_text())
            self.assertEqual(meta['sourceGeometryHash'], identity(source))
            command = [str(ROOT/'node_modules/.bin/tsx'), '-e', "import {readFileSync} from 'node:fs'; import {parseGeometryPackage} from './src/lib/golf/course-geometry/schema'; parseGeometryPackage(JSON.parse(readFileSync(process.argv[1], 'utf8')));", str(folder/'out/normalized.json')]
            parsed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=False)
            self.assertEqual(parsed.returncode, 0, parsed.stderr)

    def test_bad_identity_topology_and_associations_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'object required'):
            validate([], 'test-facility', 'osm-way-1', [])
        base = source_fixture()
        order = [h['holeKey'] for h in base['holes']]
        cases = [lambda d: d.update(facilityId='wrong'), lambda d: d.update(coordinateOrder='latitude,longitude'),
                 lambda d: d['holes'].pop(), lambda d: d['features'][0].update(sourceIds=['missing']),
                 lambda d: d['holes'][0].update(greenFeatureId='route-1'),
                 lambda d: d['features'][0]['geometryWgs84']['coordinates'][-1].__setitem__(0, -80),
                 lambda d: d['features'][1]['geometryWgs84']['coordinates'][0].pop(),
                 lambda d: d['features'][0]['geometryWgs84']['coordinates'][0].__setitem__(0, float('nan'))]
        for mutation in cases:
            doc = copy.deepcopy(base)
            mutation(doc)
            with self.assertRaises(ValueError):
                validate(doc, 'test-facility', 'osm-way-1', order)


if __name__ == '__main__':
    unittest.main()

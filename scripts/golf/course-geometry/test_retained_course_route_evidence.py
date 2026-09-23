"""Actual retained source identity checks; no network or factory ledger."""
import json
import unittest
from pathlib import Path

from factory.catalog import load_catalog
from shapely.geometry import LineString, Polygon

ROOT = Path(__file__).resolve().parents[3]


class HarbourTownRoutingEvidenceTests(unittest.TestCase):
    def test_catalog_pins_only_complete_routes_in_exact_named_relation(self):
        evidence = json.loads((ROOT / 'src/test/fixtures/course-geometry/harbour-town-routing-evidence.json').read_text())
        elements = evidence['relationResponse']['elements']
        nodes = {e['id']: e for e in elements if e['type'] == 'node'}
        ways = {e['id']: e for e in elements if e['type'] == 'way'}
        relation = next(e for e in elements if e['type'] == 'relation' and e['id'] == 4813858)
        self.assertEqual(relation['tags']['name'], 'Harbour Town Golf Links')
        remaining = [ways[m['ref']]['nodes'][:] for m in relation['members'] if m['role'] == 'outer']
        outer = remaining.pop(0)
        while remaining:
            matches = [(i, ns if ns[0] == outer[-1] else list(reversed(ns)))
                       for i, ns in enumerate(remaining) if outer[-1] in (ns[0], ns[-1])]
            self.assertEqual(len(matches), 1, 'relation must join uniquely by exact source node IDs')
            i, joined = matches[0]
            outer.extend(joined[1:])
            remaining.pop(i)
        self.assertEqual(outer[0], outer[-1])
        inner = [ways[m['ref']]['nodes'] for m in relation['members'] if m['role'] == 'inner']
        self.assertTrue(all(ring[0] == ring[-1] for ring in inner))

        def coordinates(ids):
            return [(nodes[i]['lon'], nodes[i]['lat']) for i in ids]

        polygon = Polygon(coordinates(outer), [coordinates(ring) for ring in inner])
        self.assertTrue(polygon.is_valid)
        routes = evidence['routeElements']
        contained = [way for way in routes if polygon.covers(LineString([(p['lon'], p['lat']) for p in way['geometry']]))]
        self.assertEqual(len(contained), 18)
        contained.sort(key=lambda way: int(way['tags']['ref']))
        self.assertEqual([way['tags']['ref'] for way in contained], [str(i) for i in range(1, 19)])
        duplicate = next(way for way in routes if way['id'] == 1238650440)
        self.assertEqual(duplicate['tags']['ref'], '11')
        self.assertEqual(duplicate['tags']['golf:course:name'], 'Heron Point')
        self.assertNotIn(duplicate, contained)
        catalog = load_catalog(str(ROOT / 'course-geometry/catalog'))
        self.assertEqual(catalog.problems, [])
        layout = catalog.layouts['harbour-town-golf-links']
        self.assertEqual(layout['routeWayIds'], [way['id'] for way in contained])
        self.assertEqual(layout['siteIds'], ['osm-relation-4813858'])
        self.assertEqual(layout['capabilityTier'], 'C0')
        self.assertEqual(layout['externalBindings']['golfCourseIds'], ['3b5b7d54-3784-4424-ae56-2d96bdb37bf8'])


class PinehurstSubcourseEvidenceTests(unittest.TestCase):
    def test_no8_keeps_named_aoi_and_tee_uuid_separate_from_no2(self):
        evidence = json.loads((ROOT / 'src/test/fixtures/course-geometry/pinehurst-no-8-aoi-evidence.json').read_text())
        elements = evidence['response']['elements']
        nodes = {e['id']: e for e in elements if e['type'] == 'node'}
        way = next(e for e in elements if e['type'] == 'way')
        self.assertEqual(way['id'], 428977993)
        self.assertEqual(way['tags']['name'], 'Pinehurst Course No. 8')
        self.assertEqual(way['tags']['website'], 'https://www.pinehurst.com/golf/courses/no-8/')
        self.assertEqual(way['nodes'][0], way['nodes'][-1])
        self.assertTrue(Polygon([(nodes[i]['lon'], nodes[i]['lat']) for i in way['nodes']]).is_valid)
        catalog = load_catalog(str(ROOT / 'course-geometry/catalog'))
        self.assertEqual(catalog.problems, [])
        eight, two = catalog.layouts['pinehurst-no-8'], catalog.layouts['pinehurst-no-2']
        self.assertEqual(eight['siteIds'], ['osm-way-428977993'])
        self.assertTrue(set(eight['siteIds']).isdisjoint(two['siteIds']))
        self.assertEqual(eight['externalBindings']['golfCourseIds'], ['991cae6b-4a6e-4018-b101-0288e1aa37af'])
        self.assertTrue(set(eight['externalBindings']['golfCourseIds']).isdisjoint(two['externalBindings']['golfCourseIds']))
        profiles = catalog.scorecards_of('pinehurst-no-8')
        self.assertEqual(len(profiles), 1)
        self.assertEqual(profiles[0]['libraryBinding'], {'courseId': '991cae6b-4a6e-4018-b101-0288e1aa37af',
                                                      'teeId': '70a67b06-78d6-4a48-8fad-3256340eaa6b'})
        self.assertEqual(len(profiles[0]['holes']), 18)
        self.assertEqual(eight['capabilityTier'], 'C0')
        self.assertIsNone(eight['routeWayIds'])
        self.assertIsNone(eight['geometry'])


if __name__ == '__main__':
    unittest.main()

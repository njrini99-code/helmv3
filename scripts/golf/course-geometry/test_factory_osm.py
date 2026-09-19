"""Route proposal from an OSM extract (Factory v2 PR B, layout.routes.resolve).
Uses the checked-in Peek'n Peak Upper extract: the shared resort polygon is
ambiguous and must block; the Upper course polygon reproduces the pinned
route ways and surfaces the one par disagreement. Network-free."""
import json
import os
import unittest

from factory import osm
from factory_testkit import HERE, World

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
EXTRACT = os.path.join(REPO, 'src/test/fixtures/course-geometry/sources/peek-n-peak-upper-osm/overpass.json.gz')
LAYOUT = os.path.join(REPO, 'course-geometry/catalog/layouts/peek-n-peak-upper.json')
CARD = os.path.join(REPO, 'course-geometry/catalog/scorecards/peek-n-peak-upper-official.json')
RESORT, UPPER = 136097904, 136098717


def polygon(extract, way_id):
    way = next(e for e in extract['elements'] if e.get('type') == 'way' and e['id'] == way_id)
    return [(p['lon'], p['lat']) for p in way['geometry']]


class UpperExtractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.extract = osm.load_extract(EXTRACT)
        with open(CARD, encoding='utf-8') as f:
            cls.pars = [h['par'] for h in json.load(f)['holes']]
        with open(LAYOUT, encoding='utf-8') as f:
            cls.pinned = json.load(f)['routeWayIds']

    def test_shared_resort_polygon_is_ambiguous_and_blocks(self):
        ids, evidence = osm.propose_routes(self.extract, {'polygon': polygon(self.extract, RESORT)}, 18, self.pars)
        self.assertIsNone(ids)
        self.assertEqual(evidence['duplicateRefs'], {})
        self.assertTrue(evidence['missingRefs'], evidence)
        # The whole bbox (no site) sees both courses: repeated hole numbers.
        ids, evidence = osm.propose_routes(self.extract, None, 18, self.pars)
        self.assertIsNone(ids)
        self.assertEqual(sorted(evidence['duplicateRefs']), [1, 9, 10, 12, 13, 18])
        self.assertEqual(evidence['candidates'], 24)

    def test_upper_polygon_reproduces_the_pinned_route_ways(self):
        ids, evidence = osm.propose_routes(self.extract, {'polygon': polygon(self.extract, UPPER)}, 18, self.pars)
        self.assertEqual(ids, self.pinned)
        self.assertEqual(evidence['missingRefs'], [])
        self.assertEqual(evidence['parDisagreements'], [{'hole': 12, 'wayId': 746383309, 'osmPar': 3, 'scorecardPar': 4}])

    def test_bbox_site_works_when_no_polygon_is_known(self):
        pts = polygon(self.extract, UPPER)
        bbox = osm.bbox_of(pts)
        ids, evidence = osm.propose_routes(self.extract, {'bboxWgs84': bbox}, 18, self.pars)
        # A bbox is looser than the polygon; it may or may not be unique, but
        # it never invents ids: either the pinned list or a blocker with evidence.
        self.assertTrue(ids == self.pinned or (ids is None and (evidence['duplicateRefs'] or evidence['missingRefs'])))

    def test_hole_ways_carry_ref_par_and_point_counts(self):
        ways = osm.hole_ways(self.extract, {'polygon': polygon(self.extract, UPPER)})
        self.assertEqual(len(ways), 18)
        self.assertEqual(sorted(w['ref'] for w in ways), list(range(1, 19)))
        self.assertTrue(all(w['points'] >= 2 for w in ways))


class HelperTests(unittest.TestCase):
    def test_parse_ref_accepts_ref_or_hole_name(self):
        self.assertEqual(osm.parse_ref({'ref': '7'}), 7)
        self.assertEqual(osm.parse_ref({'name': 'Hole 12'}), 12)
        self.assertEqual(osm.parse_ref({'name': 'Hole 12', 'ref': '3'}), 3)
        self.assertIsNone(osm.parse_ref({'name': 'Clubhouse 1'}))
        self.assertIsNone(osm.parse_ref({}))

    def test_point_in_ring_and_bbox(self):
        ring = [(0, 0), (2, 0), (2, 2), (0, 2), (0, 0)]
        self.assertTrue(osm.point_in_ring((1, 1), ring))
        self.assertFalse(osm.point_in_ring((3, 1), ring))
        self.assertEqual(osm.bbox_of(ring), [0, 0, 2, 2])
        self.assertTrue(osm.in_bbox((0.5, 1.5), [0, 0, 2, 2]))

    def test_synthetic_world_proposes_per_course_polygons(self):
        world = World()
        extract = world.extract()
        a = next(e for e in extract['elements'] if e['id'] == 900000002)
        ids, evidence = osm.propose_routes(extract, {'polygon': [(p['lon'], p['lat']) for p in a['geometry']]}, 18, [4] * 18)
        self.assertEqual(ids, [1000 + n for n in range(1, 19)])
        self.assertEqual(evidence['parDisagreements'], [])
        ids, evidence = osm.propose_routes(extract, None, 18, None)
        self.assertIsNone(ids)
        self.assertEqual(len(evidence['duplicateRefs']), 18)


if __name__ == '__main__':
    unittest.main()

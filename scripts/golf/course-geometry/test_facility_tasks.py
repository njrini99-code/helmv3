"""facility.aoi.resolve: the fetch bbox must cover every pinned route way,
not only the facility's own site element (Peek'n Peak's `leisure=golf_course`
way covers only the clubhouse grounds; its 18 pinned route ways sit up to
~2 km outside it)."""
import json
import os
import tempfile
import unittest
from unittest import mock

from factory.model import Node, Scope, TaskSpec
from factory.tasks import facility_tasks


class FakeCatalog:
    def __init__(self, layouts):
        self._layouts = layouts

    def layouts_of(self, facility_id):
        return [l for l in self._layouts if l['facilityId'] == facility_id]


class FakeCtx:
    def __init__(self, out_root, facility, layouts):
        self.catalog = FakeCatalog(layouts)
        self._facility = facility
        self.out_root = out_root

    def facility(self, facility_id):
        return self._facility if facility_id == self._facility['facilityId'] else None

    def aoi_path(self, facility_id):
        return os.path.join(self.out_root, 'facilities', facility_id, 'aoi.json')


SITE_ELEMENT = json.dumps({'elements': [{'type': 'way', 'geometry': [
    {'lon': -79.000, 'lat': 42.000}, {'lon': -78.999, 'lat': 42.000},
    {'lon': -78.999, 'lat': 42.001}, {'lon': -79.000, 'lat': 42.001},
]}]}).encode()

# Several km east/north of the site element: disjoint, like Peek Upper's real pins.
ROUTE_WAYS = json.dumps({'elements': [
    {'type': 'way', 'id': 10, 'geometry': [{'lon': -78.900, 'lat': 42.050}, {'lon': -78.890, 'lat': 42.050}]},
    {'type': 'way', 'id': 11, 'geometry': [{'lon': -78.880, 'lat': 42.060}, {'lon': -78.870, 'lat': 42.060}]},
]}).encode()


def fake_overpass(query, limit):
    return ROUTE_WAYS if 'way(id:' in query else SITE_ELEMENT


class ResolveAoiTests(unittest.TestCase):
    def _run(self, layouts):
        tmp = tempfile.mkdtemp()
        self.addCleanup(lambda: __import__('shutil').rmtree(tmp, ignore_errors=True))
        facility = {'facilityId': 'fac-1', 'aoi': {'kind': 'osm', 'id': 'way/1', 'marginM': 50}}
        ctx = FakeCtx(tmp, facility, layouts)
        node = Node(spec=TaskSpec('facility.aoi.resolve', '1', 'facility', (), None), scope=Scope('facility', 'fac-1'))
        with mock.patch('factory.adapters.overpass', side_effect=fake_overpass):
            facility_tasks.resolve_aoi(node, ctx, run=None)
        with open(ctx.aoi_path('fac-1')) as f:
            return json.load(f)

    def test_bbox_covers_disjoint_pinned_route_ways(self):
        doc = self._run([{'facilityId': 'fac-1', 'layoutId': 'lay-1', 'routeWayIds': [10, 11]}])
        west, south, east, north = doc['bboxWgs84']
        for lon, lat in [(-78.900, 42.050), (-78.890, 42.050), (-78.880, 42.060), (-78.870, 42.060)]:
            self.assertTrue(west <= lon <= east, doc['bboxWgs84'])
            self.assertTrue(south <= lat <= north, doc['bboxWgs84'])
        # the site element itself must still fall within the bbox too
        self.assertTrue(west <= -79.000 <= east)
        self.assertTrue(south <= 42.000 <= north)

    def test_contributing_route_way_ids_recorded(self):
        doc = self._run([{'facilityId': 'fac-1', 'layoutId': 'lay-1', 'routeWayIds': [11, 10, 10]}])
        self.assertEqual(doc['routeWayIds'], [10, 11])   # sorted, de-duplicated

    def test_element_bbox_stays_site_only(self):
        # `context.py::site_candidates()` matches OSM ways against
        # `elementBboxWgs84`/`polygon` at facilities with no pinned route;
        # widening the fetch bbox must not also widen these two fields.
        doc = self._run([{'facilityId': 'fac-1', 'layoutId': 'lay-1', 'routeWayIds': [10, 11]}])
        west, south, east, north = doc['elementBboxWgs84']
        self.assertAlmostEqual(west, -79.000, places=6)
        self.assertAlmostEqual(east, -78.999, places=6)
        self.assertNotIn(-78.900, [west, east])

    def test_no_pinned_routes_is_unchanged(self):
        doc = self._run([{'facilityId': 'fac-1', 'layoutId': 'lay-1', 'routeWayIds': None}])
        self.assertEqual(doc['routeWayIds'], [])
        self.assertIsNone(doc['routeWayBboxWgs84'])
        west, south, east, north = doc['bboxWgs84']
        self.assertTrue(west < -79.000 < east)  # margin-padded site bbox only


class PinnedRouteWayIdsTests(unittest.TestCase):
    def test_gathers_unique_sorted_ids_across_every_layout(self):
        catalog = FakeCatalog([
            {'facilityId': 'fac-1', 'routeWayIds': [3, 1]},
            {'facilityId': 'fac-1', 'routeWayIds': [1, 2]},
            {'facilityId': 'fac-2', 'routeWayIds': [99]},
        ])

        class Ctx:
            pass
        ctx = Ctx()
        ctx.catalog = catalog
        self.assertEqual(facility_tasks.pinned_route_way_ids(ctx, 'fac-1'), [1, 2, 3])

    def test_missing_or_none_route_way_ids_yield_empty(self):
        catalog = FakeCatalog([{'facilityId': 'fac-1'}, {'facilityId': 'fac-1', 'routeWayIds': None}])

        class Ctx:
            pass
        ctx = Ctx()
        ctx.catalog = catalog
        self.assertEqual(facility_tasks.pinned_route_way_ids(ctx, 'fac-1'), [])


if __name__ == '__main__':
    unittest.main()

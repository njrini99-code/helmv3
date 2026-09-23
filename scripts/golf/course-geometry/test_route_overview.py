"""Synthetic-data tests for `route-overview.py`: the OSM-route synthesizer
(`synthesize_doc_from_osm`) and the renderer (`render_overview`), covering
both the NAIP-backed map and the raster-less fallback used when a facility
has no retained NAIP export (e.g. Bryan Park Champs)."""
import importlib.util
import os
import tempfile
import unittest

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ro = load('route_overview', 'route-overview.py')

ORIGIN = [-79.74, 42.055]


def _way(way_id, ref, points, par=None):
    return {'type': 'way', 'id': way_id, 'tags': {'golf': 'hole', 'ref': str(ref), **({'par': str(par)} if par else {})},
            'geometry': [{'lon': p[0], 'lat': p[1]} for p in points]}


class SynthesizeFromOsmTests(unittest.TestCase):
    def test_route_lines_use_the_way_first_and_last_point_in_routeWayIds_order(self):
        extract = {'elements': [
            _way(101, 1, [ORIGIN, [ORIGIN[0] + 0.001, ORIGIN[1] + 0.001], [ORIGIN[0] + 0.002, ORIGIN[1] + 0.002]]),
            _way(102, 2, [[ORIGIN[0] + 0.002, ORIGIN[1] + 0.002], [ORIGIN[0] + 0.003, ORIGIN[1] + 0.003]]),
        ]}
        routes_doc = {'source': 'osm_ref_unique', 'routeWayIds': [101, 102]}
        scorecard = {'holes': [{'hole': 1, 'par': 4, 'yards': 400}, {'hole': 2, 'par': 3, 'yards': 150}]}
        doc = ro.synthesize_doc_from_osm(routes_doc, extract, scorecard, layout_name='Test Course')
        self.assertEqual(len(doc['features']), 2)
        self.assertEqual(len(doc['report']), 2)
        route1 = next(f for f in doc['features'] if f['id'] == 'hole-1-route')
        self.assertEqual(route1['geometryWgs84']['coordinates'][0], list(ORIGIN))
        self.assertEqual(route1['geometryWgs84']['coordinates'][1], [ORIGIN[0] + 0.002, ORIGIN[1] + 0.002])
        row1 = doc['report'][0]
        self.assertEqual(row1['decision'], 'proposed')
        self.assertEqual(row1['par'], 4)
        self.assertEqual(row1['scorecardYards'], 400)
        self.assertIsNotNone(row1['straightLineYards'])
        self.assertGreater(row1['straightLineYards'], 0)
        self.assertEqual(row1['confidenceLabel'], 'osm_ref_unique (resolved)')
        self.assertEqual(row1['wayId'], 101)

    def test_a_way_id_with_no_matching_element_is_unassigned_not_a_crash(self):
        extract = {'elements': [_way(101, 1, [ORIGIN, [ORIGIN[0] + 0.001, ORIGIN[1]]])]}
        routes_doc = {'source': 'osm_ref_unique', 'routeWayIds': [101, 999]}
        doc = ro.synthesize_doc_from_osm(routes_doc, extract, None)
        self.assertEqual(doc['report'][0]['decision'], 'proposed')
        self.assertEqual(doc['report'][1]['decision'], 'unassigned')
        self.assertEqual(doc['report'][1]['ordinal'], 2)

    def test_flat_scorecard_shape_is_accepted_like_the_holes_list_shape(self):
        extract = {'elements': [_way(101, 1, [ORIGIN, [ORIGIN[0] + 0.001, ORIGIN[1] + 0.001]])]}
        routes_doc = {'source': 'catalog', 'routeWayIds': [101]}
        flat_scorecard = {'pars': [5], 'scorecardYards': [520]}
        doc = ro.synthesize_doc_from_osm(routes_doc, extract, flat_scorecard)
        self.assertEqual(doc['report'][0]['par'], 5)
        self.assertEqual(doc['report'][0]['scorecardYards'], 520)


class RenderOverviewTests(unittest.TestCase):
    def _doc(self):
        return {'features': [
            {'id': 'hole-1-route', 'kind': 'route',
             'geometryWgs84': {'type': 'LineString', 'coordinates': [list(ORIGIN), [ORIGIN[0] + 0.002, ORIGIN[1] + 0.002]]}},
        ], 'report': [
            {'ordinal': 1, 'holeKey': 'hole-1', 'decision': 'proposed', 'par': 4, 'scorecardYards': 400.0,
             'straightLineYards': 395.0, 'yardageDeltaYards': -5.0, 'confidence': 0.87},
            {'ordinal': 2, 'holeKey': 'hole-2', 'decision': 'unassigned'},
        ]}

    def test_fallback_render_with_no_naip_produces_a_readable_png(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, 'overview.png')
            result = ro.render_overview(self._doc(), out, layout_name='Fallback Course', caption='2 holes, 1 unassigned')
            self.assertEqual(result, out)
            with Image.open(out) as image:
                self.assertEqual(image.format, 'PNG')
                self.assertGreater(image.width, 0)
                self.assertGreater(image.height, 0)

    def test_naip_backed_render_produces_a_png_at_least_as_tall_as_the_raster(self):
        array = np.random.randint(0, 255, size=(4, 40, 40), dtype=np.uint8).astype(float)
        # A simple north-up geotransform covering roughly the two hole points.
        geotransform = (ORIGIN[0] - 0.001, 0.0001, 0.0, ORIGIN[1] + 0.004, 0.0, -0.0001)
        naip = ro.cr.Raster(array, geotransform, 4326, None)
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, 'overview.png')
            ro.render_overview(self._doc(), out, naip=naip, naip_epsg=4326, layout_name='NAIP Course')
            with Image.open(out) as image:
                self.assertEqual(image.format, 'PNG')
                self.assertGreaterEqual(image.height, 40)

    def test_an_all_unassigned_doc_with_no_naip_raises_instead_of_rendering_nothing(self):
        doc = {'features': [], 'report': [{'ordinal': 1, 'holeKey': 'hole-1', 'decision': 'unassigned'}]}
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                ro.render_overview(doc, os.path.join(tmp, 'overview.png'))


class BuildOverviewTests(unittest.TestCase):
    def test_a_proposal_doc_is_used_as_is_without_needing_an_osm_extract(self):
        proposal_doc = {'features': [
            {'id': 'hole-1-route', 'kind': 'route',
             'geometryWgs84': {'type': 'LineString', 'coordinates': [list(ORIGIN), [ORIGIN[0] + 0.001, ORIGIN[1] + 0.001]]}},
        ], 'report': [{'ordinal': 1, 'holeKey': 'hole-1', 'decision': 'proposed', 'par': 4,
                       'scorecardYards': 400.0, 'straightLineYards': 390.0, 'yardageDeltaYards': -10.0, 'confidence': 0.9}]}
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, 'overview.png')
            ro.build_overview({'source': 'auto-route-v1'}, out, proposal_doc=proposal_doc)
            self.assertTrue(os.path.isfile(out))

    def test_neither_a_proposal_nor_routeWayIds_plus_extract_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                ro.build_overview({'source': None, 'routeWayIds': None}, os.path.join(tmp, 'overview.png'))


if __name__ == '__main__':
    unittest.main()

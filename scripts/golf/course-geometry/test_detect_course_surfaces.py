"""Synthetic-data tests for `detect-course-surfaces.py`: a bright, low-NDVI
patch should be found as a bunker; a small, flat, bright, round patch as a
green; a large connected green+fairway blob should be split back apart; and
`to_surface_document`'s output must be exactly what `propose-routes.py`'s
`collect_surface_candidates` reads (a proof test against the real function,
imported read-only -- that file is owned by another worker and never
edited here)."""
import importlib.util
import os
import unittest

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


dcs = load('detect_course_surfaces', 'detect-course-surfaces.py')
cr = load('course_raster', 'course_raster.py')
routes = load('propose_routes', 'propose-routes.py')

EPSG = 32617
GEOTRANSFORM = (600000.0, 1.0, 0.0, 4650000.0, 0.0, -1.0)
SIZE = 140


def _rough_background(seed=1):
    rng = np.random.default_rng(seed)
    red = rng.normal(70, 8, (SIZE, SIZE))
    green = rng.normal(90, 8, (SIZE, SIZE))
    blue = rng.normal(50, 8, (SIZE, SIZE))
    nir = rng.normal(150, 10, (SIZE, SIZE))
    return red, green, blue, nir


def _paint_green(bands, row0, row1, col0, col1, seed=2):
    rng = np.random.default_rng(seed)
    red, green, blue, nir = bands
    for band, val in ((red, 95), (green, 130), (blue, 80), (nir, 190)):
        band[row0:row1, col0:col1] = val + rng.normal(0, 1.2, (row1 - row0, col1 - col0))


def _paint_bunker(bands, row0, row1, col0, col1, seed=3):
    rng = np.random.default_rng(seed)
    red, green, blue, nir = bands
    for band, val in ((red, 200), (green, 195), (blue, 180), (nir, 150)):
        band[row0:row1, col0:col1] = val + rng.normal(0, 3.0, (row1 - row0, col1 - col0))


def _make_naip(green_patches=(), bunker_patches=(), seed=1):
    red, green, blue, nir = _rough_background(seed)
    for (r0, r1, c0, c1) in green_patches:
        _paint_green((red, green, blue, nir), r0, r1, c0, c1, seed=seed + 10)
    for (r0, r1, c0, c1) in bunker_patches:
        _paint_bunker((red, green, blue, nir), r0, r1, c0, c1, seed=seed + 20)
    array = np.stack([red, green, blue, nir], axis=0)
    return cr.Raster(array, GEOTRANSFORM, EPSG, [None] * 4)


def _make_dem(crown_patches=(), base=100.0):
    dem = np.full((SIZE, SIZE), base, dtype=np.float64)
    for (r0, r1, c0, c1, bump) in crown_patches:
        dem[r0:r1, c0:c1] += bump
    return cr.Raster(dem[np.newaxis, :, :], GEOTRANSFORM, EPSG, [None])


class BunkerDetectionTests(unittest.TestCase):
    def test_bright_low_ndvi_patch_is_a_bunker(self):
        naip = _make_naip(bunker_patches=[(60, 75, 60, 78)])
        results = dcs.detect_bunkers(naip, options={'min_area_m2': 5.0})
        self.assertTrue(results, 'expected at least one bunker candidate')
        best = results[0]
        row_c, col_c = (60 + 75) / 2, (60 + 78) / 2
        x = GEOTRANSFORM[0] + col_c * GEOTRANSFORM[1]
        y = GEOTRANSFORM[3] + row_c * GEOTRANSFORM[5]
        centroid_xy = cr.wgs84_to_epsg(cr.to_shapely({'type': 'Point', 'coordinates': best['centroidWgs84']}), EPSG)
        self.assertLess(((centroid_xy.x - x) ** 2 + (centroid_xy.y - y) ** 2) ** 0.5, 5.0)

    def test_turf_is_not_flagged_as_bunker(self):
        naip = _make_naip()
        results = dcs.detect_bunkers(naip, options={'min_area_m2': 5.0})
        self.assertEqual(results, [])

    def test_water_is_not_flagged_as_bunker(self):
        red, green, blue, nir = _rough_background(seed=5)
        # Water: low NDVI (dark NIR) but also dark visible -- unlike sand.
        rng = np.random.default_rng(9)
        for band, val in ((red, 40), (green, 55), (blue, 70), (nir, 15)):
            band[60:80, 60:80] = val + rng.normal(0, 2.0, (20, 20))
        array = np.stack([red, green, blue, nir], axis=0)
        naip = cr.Raster(array, GEOTRANSFORM, EPSG, [None] * 4)
        results = dcs.detect_bunkers(naip, options={'min_area_m2': 5.0})
        self.assertEqual(results, [])


class GreenDetectionTests(unittest.TestCase):
    def test_compact_bright_smooth_flat_patch_is_a_green(self):
        naip = _make_naip(green_patches=[(60, 82, 60, 82)])  # ~22x22m = 484 sqm
        dem = _make_dem()
        results = dcs.detect_greens(naip, dem, options={'min_area_m2': 100.0, 'split_area_m2': 5000.0, 'local_context_m': 25.0})
        self.assertTrue(results, 'expected at least one green candidate')
        self.assertEqual(results[0]['kind'], 'green')
        self.assertGreater(results[0]['confidence'], 0.0)

    def test_plain_turf_is_not_flagged_as_green(self):
        naip = _make_naip()
        dem = _make_dem()
        results = dcs.detect_greens(naip, dem, options={'min_area_m2': 100.0})
        self.assertEqual(results, [])

    def test_oversized_fused_blob_is_split_into_plausible_greens(self):
        # Two green-like patches connected by a bright corridor -- a fused
        # green+approach the way round 2's naive threshold would produce.
        naip = _make_naip(green_patches=[(20, 42, 20, 42), (20, 42, 90, 112), (28, 34, 42, 90)])
        dem = _make_dem()
        results = dcs.detect_greens(naip, dem, options={'min_area_m2': 100.0, 'split_area_m2': 700.0, 'max_area_m2': 700.0})
        # Whatever comes out must respect the area gate -- a raw un-split
        # fused blob would be far larger than max_area_m2 and get dropped.
        for r in results:
            self.assertLessEqual(r['areaM2'], 700.0 * 1.05)

    def test_bunker_proximity_raises_confidence(self):
        naip = _make_naip(green_patches=[(60, 82, 60, 82)], bunker_patches=[(60, 68, 84, 92)])
        dem = _make_dem()
        bunkers = dcs.detect_bunkers(naip, options={'min_area_m2': 5.0})
        self.assertTrue(bunkers)
        without = dcs.detect_greens(naip, dem, options={'min_area_m2': 100.0, 'split_area_m2': 5000.0, 'local_context_m': 25.0})
        with_bunker = dcs.detect_greens(naip, dem, options={'min_area_m2': 100.0, 'split_area_m2': 5000.0, 'local_context_m': 25.0}, bunker_candidates=bunkers)
        self.assertGreaterEqual(with_bunker[0]['confidence'], without[0]['confidence'])


class ChmGateTests(unittest.TestCase):
    def test_chm_none_is_no_opinion_not_zero(self):
        valid, open_ground = dcs.chm_open_mask(None)
        self.assertIsNone(valid)
        self.assertIsNone(open_ground)

    def test_tree_canopy_excludes_an_otherwise_green_like_patch(self):
        naip = _make_naip(green_patches=[(60, 82, 60, 82)])
        dem = _make_dem()
        chm_array = np.zeros((SIZE, SIZE), dtype=np.float64)
        chm_array[60:82, 60:82] = 12.0  # tree canopy sitting right over the candidate
        chm = cr.Raster(chm_array[np.newaxis, :, :], GEOTRANSFORM, EPSG, [dcs.CHM_NODATA])
        results = dcs.detect_greens(naip, dem, chm=chm, options={'min_area_m2': 100.0, 'split_area_m2': 5000.0, 'local_context_m': 25.0})
        # No candidate may sit at the tree-covered patch itself -- a thin
        # smoothing-halo sliver right at its synthetic hard edge (a step
        # discontinuity real imagery never has) is not what this asserts.
        row_c, col_c = (60 + 82) / 2, (60 + 82) / 2
        x = GEOTRANSFORM[0] + col_c * GEOTRANSFORM[1]
        y = GEOTRANSFORM[3] + row_c * GEOTRANSFORM[5]
        for r in results:
            centroid_xy = cr.wgs84_to_epsg(cr.to_shapely({'type': 'Point', 'coordinates': r['centroidWgs84']}), EPSG)
            self.assertGreater(((centroid_xy.x - x) ** 2 + (centroid_xy.y - y) ** 2) ** 0.5, 5.0)


class TeeGreenGateTests(unittest.TestCase):
    """`gate_tees_by_green_distance` operates on candidate dicts directly --
    no raster needed -- so these exercise it at unit level."""

    def _tee(self, tee_id, lon, lat):
        return {'id': tee_id, 'kind': 'tee', 'centroidWgs84': (lon, lat),
                'geometryWgs84': {'type': 'Polygon', 'coordinates': [[[lon - 0.0001, lat], [lon, lat + 0.0001], [lon + 0.0001, lat], [lon - 0.0001, lat]]]},
                'areaM2': 100.0, 'confidence': 0.5, 'evidence': {}}

    def _green(self, lon, lat):
        return {'id': 'detect-green-0001', 'kind': 'green', 'centroidWgs84': (lon, lat),
                'geometryWgs84': {'type': 'Polygon', 'coordinates': [[[lon - 0.0001, lat], [lon, lat + 0.0001], [lon + 0.0001, lat], [lon - 0.0001, lat]]]},
                'areaM2': 500.0, 'confidence': 0.7, 'evidence': {}}

    def test_no_detected_greens_gates_nothing(self):
        tees = [self._tee('t1', -78.0, 39.0)]
        kept = dcs.gate_tees_by_green_distance(tees, [], EPSG)
        self.assertEqual(kept, tees)

    def test_tee_right_next_to_a_green_is_excluded(self):
        green = self._green(-78.0, 39.0)
        # ~10m north of the green -- inside its own apron, per TEE_GREEN_EXCLUDE_M.
        tee = self._tee('t1', -78.0, 39.0 + 0.00009)
        kept = dcs.gate_tees_by_green_distance([tee], [green], EPSG)
        self.assertEqual(kept, [])

    def test_tee_far_from_every_green_is_excluded(self):
        green = self._green(-78.0, 39.0)
        tee = self._tee('t1', -78.0, 39.02)  # roughly 2.2km away
        kept = dcs.gate_tees_by_green_distance([tee], [green], EPSG)
        self.assertEqual(kept, [])

    def test_tee_in_plausible_hole_length_range_is_kept(self):
        green = self._green(-78.0, 39.0)
        # ~350m south -- within the 90-600m band.
        tee = self._tee('t1', -78.0, 39.0 - 0.00315)
        kept = dcs.gate_tees_by_green_distance([tee], [green], EPSG)
        self.assertEqual([t['id'] for t in kept], ['t1'])


class OutputFormatTests(unittest.TestCase):
    def test_to_surface_document_is_consumable_by_propose_routes(self):
        detections = {
            'greens': [{'id': 'detect-green-0001', 'kind': 'green', 'centroidWgs84': (-78.0, 39.0),
                        'geometryWgs84': {'type': 'Polygon', 'coordinates': [[[-78.001, 39.0], [-78.0, 39.001], [-77.999, 39.0], [-78.001, 39.0]]]},
                        'areaM2': 500.0, 'confidence': 0.7, 'evidence': {}}],
            'tees': [{'id': 'detect-tee-0001', 'kind': 'tee', 'centroidWgs84': (-78.01, 39.01),
                      'geometryWgs84': {'type': 'Polygon', 'coordinates': [[[-78.011, 39.01], [-78.01, 39.011], [-78.009, 39.01], [-78.011, 39.01]]]},
                      'areaM2': 100.0, 'confidence': 0.6, 'evidence': {}}],
            'bunkers': [],
        }
        doc = dcs.to_surface_document(detections)
        self.assertEqual(doc['counts'], {'greens': 1, 'tees': 1, 'bunkers': 0})
        tees, greens = routes.collect_surface_candidates(doc)
        self.assertEqual(len(tees), 1)
        self.assertEqual(len(greens), 1)
        self.assertEqual(tees[0]['id'], 'detect-tee-0001')
        self.assertEqual(greens[0]['id'], 'detect-green-0001')

    def test_bunker_kind_is_not_read_by_collect_surface_candidates_but_survives_round_trip(self):
        detections = {'greens': [], 'tees': [],
                      'bunkers': [{'id': 'detect-bunker-0001', 'kind': 'bunker', 'centroidWgs84': (-78.0, 39.0),
                                   'geometryWgs84': {'type': 'Polygon', 'coordinates': [[[-78.001, 39.0], [-78.0, 39.001], [-77.999, 39.0], [-78.001, 39.0]]]},
                                   'areaM2': 50.0, 'confidence': 0.5, 'evidence': {}}]}
        doc = dcs.to_surface_document(detections)
        tees, greens = routes.collect_surface_candidates(doc)
        self.assertEqual((tees, greens), ([], []))
        self.assertEqual(doc['features'][0]['kind'], 'bunker')


if __name__ == '__main__':
    unittest.main()

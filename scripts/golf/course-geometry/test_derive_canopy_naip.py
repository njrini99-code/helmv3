"""Per-export NDVI gate of the canopy pass: the gate is calibrated from the
package's own OSM fairway and woods pixels, never above the reviewed ceiling
and never below the floor; texture still separates turf from crowns."""
import importlib.util
import os
import unittest

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def load():
    spec = importlib.util.spec_from_file_location('derive_canopy_naip', os.path.join(HERE, 'derive-canopy-naip.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


canopy = load()


class GateTests(unittest.TestCase):
    def test_reviewed_exports_keep_the_ceiling(self):
        # Winchester / the Upper: fairways at 0.37 → gap lands above the ceiling → unchanged 0.28.
        self.assertEqual(canopy.calibrated_ndvi_min(0.369), (0.28, 'turf_plus_gap'))

    def test_a_compressed_export_loosens_the_gate(self):
        self.assertEqual(canopy.calibrated_ndvi_min(0.122), (0.182, 'turf_plus_gap'))   # Forsyth
        self.assertEqual(canopy.calibrated_ndvi_min(0.16), (0.22, 'turf_plus_gap'))     # Cacapon
        self.assertEqual(canopy.calibrated_ndvi_min(0.21), (0.27, 'turf_plus_gap'))     # Grande Dunes

    def test_floor_and_fixed_fallback(self):
        self.assertEqual(canopy.calibrated_ndvi_min(0.02), (canopy.NDVI_MIN_FLOOR, 'turf_plus_gap'))
        self.assertEqual(canopy.calibrated_ndvi_min(None), (canopy.NDVI_MIN, 'fixed_ceiling'))


class ClassifyTests(unittest.TestCase):
    def synthetic(self, forest_ndvi):
        rng = np.random.default_rng(7)
        size = 120
        ndvi = np.full((size, size), 0.12)            # smooth turf everywhere
        texture = np.full((size, size), 2.0)
        ndvi[20:80, 20:80] = forest_ndvi              # one 60 m forest block
        texture[20:80, 20:80] = 20 + rng.normal(0, 2, (60, 60))
        masked = np.zeros((size, size), dtype=bool)
        masked[90:110, 90:110] = True                 # a green: never canopy
        ndvi[90:110, 90:110] = 0.6; texture[90:110, 90:110] = 30
        return ndvi, texture, masked

    def test_fixed_ceiling_misses_a_compressed_forest_that_the_calibrated_gate_keeps(self):
        ndvi, texture, masked = self.synthetic(0.24)
        self.assertEqual(int(canopy.classify(ndvi, texture, masked, canopy.NDVI_MIN).sum()), 0)
        found = canopy.classify(ndvi, texture, masked, 0.18)
        self.assertGreater(int(found[20:80, 20:80].sum()), 3400)
        self.assertEqual(int(found[masked].sum()), 0)
        self.assertEqual(int(found[:20].sum()) + int(found[80:].sum()), 0, 'smooth turf never classifies, whatever the NDVI gate')

    def test_calibrate_samples_the_package_fairways_only(self):
        size = 100
        ndvi = np.full((size, size), 0.1)
        ndvi[:, 50:] = 0.4
        pkg = {'features': [
            {'kind': 'fairway', 'geometryWgs84': {'type': 'Polygon', 'coordinates': [[[0, 0], [40, 0], [40, 40], [0, 40], [0, 0]]]}},
            {'kind': 'green', 'geometryWgs84': {'type': 'Polygon', 'coordinates': [[[60, 0], [99, 0], [99, 40], [60, 40], [60, 0]]]}},
        ]}
        cal = canopy.calibrate(ndvi, pkg, lambda lon, lat: (lon, lat), (size, size))
        self.assertEqual((cal['turfNdviMedian'], cal['rule'], cal['ndviMin']), (0.1, 'turf_plus_gap', 0.16))
        self.assertGreater(cal['turfPixels'], 1500)
        # A package without fairways (or with a sliver too small to sample) keeps the reviewed ceiling.
        thin = {'features': [{'kind': 'fairway', 'geometryWgs84': {'type': 'Polygon', 'coordinates': [[[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]]]}}]}
        cal = canopy.calibrate(ndvi, thin, lambda lon, lat: (lon, lat), (size, size))
        self.assertEqual((cal['turfNdviMedian'], cal['rule'], cal['ndviMin']), (None, 'fixed_ceiling', canopy.NDVI_MIN))


if __name__ == '__main__':
    unittest.main()

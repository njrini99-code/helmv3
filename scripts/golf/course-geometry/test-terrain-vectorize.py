"""Analytic crossing-depth cases; no guessed golf coordinates."""
import hashlib
import importlib.util
import json
import unittest
from pathlib import Path

import numpy as np
from shapely.geometry import box

spec = importlib.util.spec_from_file_location('vectorize', Path(__file__).with_name('vectorize-terrain.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DepthClippingTest(unittest.TestCase):
    def test_frozen_package_hash_and_surface_coverage(self):
        fixture = Path(__file__).resolve().parents[3] / 'src/test/fixtures/course-geometry'
        mesh = json.loads((fixture / 'cacapon-07-terrain.json').read_text())
        expected = mesh.pop('contentHash')
        actual = hashlib.sha256(json.dumps(mesh, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        self.assertEqual(actual, expected)
        self.assertEqual(len(mesh['vertices']), len(mesh['triangleFeatures']) * 9)

    def test_crossing_planes_only_hide_nearer_half(self):
        result = module.closer_part(box(-1, -1, 1, 1), np.array([1., 0., 0.]))
        self.assertAlmostEqual(result.area, 2, places=6)
        self.assertLessEqual(result.bounds[2], 0)

    def test_coplanar_or_behind_does_not_hide_surface(self):
        for delta in [[0, 0, 0], [0, 0, 1]]:
            self.assertTrue(module.closer_part(box(-1, -1, 1, 1), np.array(delta)).is_empty)

    def test_entirely_nearer_hides_full_overlap(self):
        result = module.closer_part(box(-1, -1, 1, 1), np.array([0, 0, -1]))
        self.assertAlmostEqual(result.area, 4)


if __name__ == '__main__':
    unittest.main()

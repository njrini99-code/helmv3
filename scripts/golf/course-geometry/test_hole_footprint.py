"""Shared hazards must not inflate a played hole or replace source evidence."""
import copy
import unittest

from hole_footprint import clip_render_geometry, played_features


def grid():
    return {'width': 12, 'height': 12,
            'positionsMeters': [[x, 100 + .1 * x + .2 * z, z] for z in range(12) for x in range(12)]}


def polygon(points):
    return {'type': 'Polygon', 'coordinates': [[[x, 100 + .1*x + .2*z, z] for x, z in points]]}


class HoleFootprintTests(unittest.TestCase):
    def test_shared_water_rough_woods_cannot_size_played_footprint(self):
        features = [{'id': kind, 'kind': kind} for kind in ('route', 'green', 'tee', 'fairway', 'bunker', 'water', 'woods', 'rough')]
        self.assertEqual([f['id'] for f in played_features(features)], ['route', 'green', 'tee', 'fairway', 'bunker'])
        self.assertEqual(played_features([features[-3]])[0]['kind'], 'water')
        with self.assertRaises(ValueError):
            played_features([features[-2]])

    def test_display_clip_preserves_full_canonical_polygon_and_source_heights(self):
        source = polygon([(-100, -100), (100, -100), (100, 100), (-100, 100), (-100, -100)])
        unchanged = copy.deepcopy(source)
        render, report = clip_render_geometry(source, grid())
        self.assertEqual(source, unchanged)
        self.assertFalse(report['canonicalGeometryChanged'])
        self.assertEqual(report['authority'], 'render_only_subset_of_retained_canonical_polygon')
        self.assertEqual(report['sourceAreaM2'], 40000)
        self.assertEqual(report['visibleAreaM2'], 81)
        for x, y, z in render['coordinates'][0]:
            self.assertGreaterEqual(x, 1); self.assertLessEqual(x, 10)
            self.assertGreaterEqual(z, 1); self.assertLessEqual(z, 10)
            self.assertAlmostEqual(y, 100 + .1*x + .2*z)

    def test_outside_shared_feature_is_render_absent_without_deleting_evidence(self):
        source = polygon([(100, 100), (110, 100), (110, 110), (100, 110), (100, 100)])
        original = copy.deepcopy(source)
        render, report = clip_render_geometry(source, grid())
        self.assertIsNone(render)
        self.assertEqual(report['visibleAreaM2'], 0)
        self.assertEqual(source, original)

    def test_split_lake_remains_disconnected_in_display_clip(self):
        source = polygon([(2, 2), (4, 2), (4, 20), (6, 20), (6, 2), (8, 2), (8, 22), (2, 22), (2, 2)])
        render, report = clip_render_geometry(source, grid())
        self.assertEqual(render['type'], 'MultiPolygon')
        self.assertEqual(len(render['coordinates']), 2)
        self.assertEqual(report['visibleAreaM2'], 32)


if __name__ == '__main__':
    unittest.main()

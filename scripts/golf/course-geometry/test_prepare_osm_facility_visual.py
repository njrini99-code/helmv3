"""Contract tests for route-unresolved facility visual packages."""
import importlib.util
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location(
    'prepare_osm_facility_visual', Path(__file__).with_name('prepare-osm-facility-visual.py')
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FacilityVisualPackageTests(unittest.TestCase):
    def test_source_features_render_without_promoting_a_hole_route(self):
        raw = {
            'elements': [
                {'type': 'way', 'id': 10, 'tags': {'leisure': 'golf_course'}, 'geometry': [
                    {'lon': -80.0, 'lat': 35.0}, {'lon': -79.99, 'lat': 35.0},
                    {'lon': -79.99, 'lat': 35.01}, {'lon': -80.0, 'lat': 35.01},
                    {'lon': -80.0, 'lat': 35.0},
                ]},
                {'type': 'way', 'id': 11, 'tags': {'golf': 'green'}, 'geometry': [
                    {'lon': -79.998, 'lat': 35.001}, {'lon': -79.997, 'lat': 35.001},
                    {'lon': -79.997, 'lat': 35.002}, {'lon': -79.998, 'lat': 35.002},
                    {'lon': -79.998, 'lat': 35.001},
                ]},
                {'type': 'way', 'id': 12, 'tags': {'natural': 'water'}, 'geometry': [
                    {'lon': -79.996, 'lat': 35.004}, {'lon': -79.995, 'lat': 35.004},
                    {'lon': -79.995, 'lat': 35.005}, {'lon': -79.996, 'lat': 35.005},
                    {'lon': -79.996, 'lat': 35.004},
                ]},
            ]
        }
        card = {
            'siteId': 'osm-way-10', 'name': 'Example Club', 'slug': 'example-club',
            'originWgs84': [-79.995, 35.005], 'bboxWgs84': [-80.0, 35.0, -79.99, 35.01],
        }
        package, report = MODULE.build_package(raw, card, {'uncompressedSha256': 'a' * 64, 'retrievedAt': '2026-09-20'})

        self.assertEqual(package['kind'], 'golfhelm-facility-visual-package-v1')
        self.assertEqual(package['status'], 'source_candidate')
        self.assertFalse(package['canonicalHoleRoutesAdmitted'])
        self.assertEqual(len(package['holes']), 1)
        self.assertEqual(package['holes'][0]['completeness'], 'partial')
        self.assertIn('facility visual context does not identify any played hole route', package['holes'][0]['gaps'])
        self.assertTrue(all(feature['truthClass'] == 'derived' for feature in package['features'] if feature['kind'] != 'visual_context'))
        self.assertEqual(next(feature for feature in package['features'] if feature['kind'] == 'visual_context')['truthClass'], 'visual_only')
        self.assertTrue(report['renderingContract']['canRender'])
        self.assertFalse(report['renderingContract']['canMeasure'])
        self.assertFalse(report['renderingContract']['maySupplyHoleAssociation'])
        self.assertEqual(report['sourceCoverage']['status'], 'sparse')
        self.assertEqual(report['sourceCoverage']['missingSemanticKinds'], ['bunker', 'fairway', 'tee'])
        self.assertEqual(report['visualReadiness']['status'], 'requires_imagery_enhancement')
        self.assertFalse(report['visualReadiness']['highFidelityHoleWorld'])


if __name__ == '__main__':
    unittest.main()

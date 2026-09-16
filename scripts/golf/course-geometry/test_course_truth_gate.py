"""No-network contract tests for the upstream course source-truth gate."""
import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('course_truth_gate', Path(__file__).with_name('course-truth-gate.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CourseTruthGateTest(unittest.TestCase):
    def test_estimated_corridor_cannot_measure_but_can_render(self):
        feature = {
            'kind': 'fairway',
            'provenance': {
                'sourceIds': ['nc-onemap-visual'],
                'extraction': 'scorecard inference; not imagery-derived',
                'humanReviewed': False,
                'boundaryAccuracyMeters': None,
            },
        }
        self.assertEqual(MODULE.feature_truth(feature), 'estimated')
        result = MODULE.row('fairway', [feature])
        self.assertTrue(result['canRender'])
        self.assertFalse(result['canMeasure'])

    def test_missing_water_is_a_gate_failure_not_a_visual_failure(self):
        result = MODULE.row('water', [])
        self.assertTrue(result['canRender'])
        self.assertFalse(result['canMeasure'])

    def test_osm_boundary_remains_derived_when_not_imagery_segmented(self):
        feature = {'provenance': {'sourceIds': ['osm-way-1'], 'extraction': 'OSM source candidate; not imagery-derived'}}
        self.assertEqual(MODULE.feature_truth(feature), 'derived')

    def test_reviewed_bunker_boundary_can_pass_without_inventing_depth(self):
        feature = {
            'kind': 'bunker',
            'truthClass': 'derived',
            'provenance': {'sourceIds': ['osm-way-1'], 'humanReviewed': True, 'boundaryAccuracyMeters': .3},
        }
        result = MODULE.row('bunker', [feature])
        self.assertTrue(result['canMeasure'])
        self.assertIn('depth/lip/face analytics remain disabled', result['measurementLimitations'][0])

    def test_whole_course_package_reports_every_hole_without_crashing(self):
        package = {
            'schemaVersion': 1, 'status': 'source_candidate', 'siteId': 'osm-way-1', 'contentHash': 'abc',
            'features': [
                {'id': 'osm-way-10', 'kind': 'green', 'sourceIds': ['osm-overpass-2026-09-15'], 'reviewed': False, 'accuracyMeters': None},
                {'id': 'osm-way-11', 'kind': 'route', 'sourceIds': ['osm-overpass-2026-09-15'], 'reviewed': False, 'accuracyMeters': None},
            ],
            'holes': [{'key': 'course-01', 'ordinal': 1, 'featureIds': ['osm-way-10', 'osm-way-11']},
                      {'key': 'course-02', 'ordinal': 2, 'featureIds': []}],
        }
        holes = list(MODULE.package_holes(package))
        self.assertEqual([hole['hole'] for hole in holes], ['course-01', 'course-02'])
        self.assertFalse(any(hole['passed'] for hole in holes))
        green = next(item for item in holes[0]['features'] if item['feature'] == 'green')
        self.assertEqual(green['truthClass'], 'derived')
        self.assertTrue(green['canRender'])
        self.assertFalse(green['canMeasure'])
        self.assertIn('not human reviewed', green['validation'])
        distance = holes[0]['features'][-1]
        self.assertEqual(distance['feature'], 'hole-distance geometry')
        self.assertFalse(distance['canMeasure'])


if __name__ == '__main__':
    unittest.main()

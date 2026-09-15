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


if __name__ == '__main__':
    unittest.main()

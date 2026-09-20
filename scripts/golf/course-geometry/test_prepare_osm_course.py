"""Unit contracts for source-candidate package construction."""
import importlib.util
import os
import unittest


HERE = os.path.dirname(__file__)
SPEC = importlib.util.spec_from_file_location('prepare_osm_course', os.path.join(HERE, 'prepare-osm-course.py'))
prepare_osm_course = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare_osm_course)


class SourceRouteParTests(unittest.TestCase):
    def test_missing_osm_par_stays_missing_while_the_scorecard_remains_authoritative(self):
        self.assertIsNone(prepare_osm_course.source_route_par({}))
        self.assertEqual(prepare_osm_course.source_route_par({'par': '5'}), 5)


if __name__ == '__main__':
    unittest.main()

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


def _square(x, y, size=10.0):
    return [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]


def _imported(fid, kind, ring):
    return {'id': fid, 'kind': kind, 'geometryWgs84': {'type': 'Polygon', 'coordinates': [ring]}}


def _candidate(fid, kind, ring):
    return {'id': fid, 'kind': kind, 'shape': prepare_osm_course.Polygon(ring)}


def _identity(x, y, z=None):
    return (x, y)  # metric == input in these fixtures


class MergeImportedCandidateTests(unittest.TestCase):
    def test_a_proposal_recarrying_the_same_osm_way_is_deduplicated_not_a_conflict(self):
        candidates = [_candidate('osm-way-1', 'green', _square(0, 0))]
        prepare_osm_course.merge_imported_candidates(
            candidates, [_imported('osm-way-1', 'green', _square(0, 0))], _identity)
        self.assertEqual([c['id'] for c in candidates], ['osm-way-1'])
        self.assertNotIn('imported', candidates[0])

    def test_a_same_id_feature_with_different_geometry_is_still_refused(self):
        candidates = [_candidate('osm-way-1', 'green', _square(0, 0))]
        with self.assertRaisesRegex(ValueError, 'SOURCE_FEATURE_CONFLICT: osm-way-1'):
            prepare_osm_course.merge_imported_candidates(
                candidates, [_imported('osm-way-1', 'green', _square(5, 0))], _identity)

    def test_a_same_id_feature_of_a_different_kind_is_still_refused(self):
        candidates = [_candidate('osm-way-1', 'green', _square(0, 0))]
        with self.assertRaisesRegex(ValueError, 'SOURCE_FEATURE_CONFLICT'):
            prepare_osm_course.merge_imported_candidates(
                candidates, [_imported('osm-way-1', 'tee', _square(0, 0))], _identity)

    def test_a_curated_non_osm_id_collision_is_still_refused(self):
        candidates = [_candidate('curated-7', 'tee', _square(0, 0))]
        with self.assertRaisesRegex(ValueError, 'SOURCE_FEATURE_CONFLICT'):
            prepare_osm_course.merge_imported_candidates(
                candidates, [_imported('curated-7', 'tee', _square(0, 0))], _identity)

    def test_new_imported_features_are_added_and_routes_skipped(self):
        candidates = []
        route = {'id': 'route-1', 'kind': 'route',
                 'geometryWgs84': {'type': 'LineString', 'coordinates': [[0, 0], [1, 1]]}}
        prepare_osm_course.merge_imported_candidates(
            candidates, [_imported('curated-1', 'tee', _square(0, 0)), route], _identity)
        self.assertEqual([(c['id'], 'imported' in c) for c in candidates], [('curated-1', True)])


if __name__ == '__main__':
    unittest.main()

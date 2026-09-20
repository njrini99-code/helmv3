import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('batch_native_ortho_review', HERE / 'batch-native-ortho-review.py')
module = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(module)


class BatchNativeOrthoReviewTests(unittest.TestCase):
    def test_national_source_uses_embedded_provenance_without_forging_nc_sidecar(self):
        jobs = module.build_jobs([{'facilityId': 'national'}],
            {'national': {'nativeIndex': '/index.json', 'sourceItems': None, 'provider': 'usgs_naip_plus'}},
            {'layout': {'facilityId': 'national', 'package': '/normalized.json'}}, Path('/out'))
        self.assertEqual(jobs[0]['status'], 'ready_native_hole_review')
        self.assertIsNone(jobs[0]['sourceItems'])
        self.assertEqual(jobs[0]['provider'], 'usgs_naip_plus')

    def test_batches_only_complete_bound_native_sources_with_a_route_candidate_package(self):
        facilities = [
            {'facilityId': 'eligible'},
            {'facilityId': 'missing-source-items'},
        ]
        assets = {
            'eligible': {'nativeIndex': '/tmp/eligible/index.json', 'sourceItems': '/tmp/eligible/source-items.json'},
            'missing-source-items': {'nativeIndex': '/tmp/missing/index.json', 'sourceItems': None},
        }
        packages = {'eligible-layout': {'facilityId': 'eligible', 'package': '/tmp/package.json'}}
        jobs = module.build_jobs(facilities, assets, packages, Path('/out'))
        self.assertEqual(jobs[0]['status'], 'ready_native_hole_review')
        self.assertEqual(jobs[0]['layoutId'], 'eligible-layout')
        self.assertEqual(jobs[1]['status'], 'native_source_provenance_required')
        self.assertNotIn('layoutId', jobs[1])


if __name__ == '__main__':
    unittest.main()

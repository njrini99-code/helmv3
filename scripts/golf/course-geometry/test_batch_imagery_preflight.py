import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('batch_imagery_preflight', HERE / 'batch-imagery-preflight.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BatchImageryPreflightTests(unittest.TestCase):
    def test_batch_retains_per_facility_results_and_counts_only_acquisition_candidates(self):
        facilities = [
            {'facilityId': 'one', 'region': 'NC'},
            {'facilityId': 'two', 'region': 'VA'},
        ]

        def preflight(facility):
            if facility['facilityId'] == 'one':
                return {'sources': [{'status': 'metadata_recorded', 'metadata': {'acquisitionAllowed': True}}]}
            return {'sources': [{'status': 'metadata_recorded', 'metadata': {'acquisitionAllowed': False}}]}

        document = module.run(facilities, preflight)
        self.assertEqual(document['summary']['facilityCount'], 2)
        self.assertEqual(document['summary']['withAcquisitionCandidate'], 1)
        self.assertEqual(document['facilities'][0]['facilityId'], 'one')
        self.assertEqual(document['facilities'][1]['preflight']['sources'][0]['metadata']['acquisitionAllowed'], False)
        self.assertIn('does not admit', document['rule'])


if __name__ == '__main__':
    unittest.main()

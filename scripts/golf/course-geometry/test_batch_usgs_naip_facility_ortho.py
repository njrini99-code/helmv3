import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('batch_naip', Path(__file__).with_name('batch-usgs-naip-facility-ortho.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BatchNaipTests(unittest.TestCase):
    def test_one_download_per_facility_keeps_regional_sources_and_policy(self):
        facilities = [{'facilityId': fid, 'country': 'US', 'region': state,
                       'providerPolicy': {'imagery': ['usgs_naip_plus']}}
                      for fid, state in [('nc', 'NC'), ('multi', 'VA'), ('unrouted', 'OH')]]
        layouts = [{'layoutId': key, 'facilityId': fid} for key, fid in
                   [('upper', 'multi'), ('lower', 'multi'), ('main', 'nc')]]
        jobs = module.build_jobs(facilities, layouts, Path('/factory'))
        by_id = {job['facilityId']: job for job in jobs}
        self.assertEqual(len(jobs), 3)
        self.assertEqual(by_id['nc']['status'], 'regional_workflow')
        self.assertEqual(by_id['multi']['status'], 'ready')
        self.assertEqual(by_id['multi']['layoutId'], 'lower')
        self.assertEqual(by_id['unrouted']['status'], 'policy_or_layout_required')


if __name__ == '__main__':
    unittest.main()

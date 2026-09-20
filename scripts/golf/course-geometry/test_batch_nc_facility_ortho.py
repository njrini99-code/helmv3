import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('batch_nc_ortho', HERE / 'batch-nc-facility-ortho.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BatchNcFacilityOrthoTests(unittest.TestCase):
    def test_build_plan_queues_only_nc_analysis_facilities_with_resolved_aois(self):
        facilities = [
            {
                'facilityId': 'north-carolina-club', 'region': 'NC',
                'providerPolicy': {'imagery': ['nc_onemap_2024_2027_analysis', 'usgs_naip_plus']},
            },
            {
                'facilityId': 'virginia-club', 'region': 'VA',
                'providerPolicy': {'imagery': ['vgin_vbmp_most_recent', 'usgs_naip_plus']},
            },
        ]
        plan = module.build_plan(facilities, {
            'north-carolina-club': {'bboxWgs84': [-77.95, 34.20, -77.94, 34.21]},
        }, Path('/factory-output'), {'xmin': -2_000_000, 'ymin': -2_000_000})
        nc = next(job for job in plan['jobs'] if job['facilityId'] == 'north-carolina-club')
        va = next(job for job in plan['jobs'] if job['facilityId'] == 'virginia-club')
        self.assertEqual(nc['status'], 'ready_native_rgb_nir_v2')
        self.assertGreater(nc['tileCount'], 0)
        self.assertEqual(nc['output'].split('/')[-1], 'native-ortho-nir-v2')
        self.assertEqual(va['status'], 'not_nc_adapter')
        self.assertFalse(va['execute'])


if __name__ == '__main__':
    unittest.main()

class BatchNcFacilityOrthoNativeGridTests(unittest.TestCase):
    def test_build_plan_uses_the_live_service_extent_for_native_tile_estimates(self):
        facility = {
            'facilityId': 'north-carolina-club', 'region': 'NC',
            'providerPolicy': {'imagery': ['nc_onemap_2024_2027_analysis']},
        }
        aoi = {'bboxWgs84': [-77.95, 34.20, -77.94, 34.21]}
        extent = {'xmin': 1_000_000, 'ymin': 2_000_000}
        expected = len(module.ortho.native_tiles(module.ortho.source_bounds(aoi), extent, module.ortho.DEFAULT_TILE_M))
        plan = module.build_plan([facility], {'north-carolina-club': aoi}, Path('/factory-output'), extent)
        job = plan['jobs'][0]
        self.assertEqual(job['tileCount'], expected)
        self.assertEqual(job['nativeGridOriginUSFeet'], [extent['xmin'], extent['ymin']])

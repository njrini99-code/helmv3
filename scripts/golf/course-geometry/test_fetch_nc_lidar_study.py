"""No-network contract checks for NC OneMap DEM03 acquisition."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('nc_lidar', Path(__file__).with_name('fetch-nc-lidar-study.py'))
nc_lidar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nc_lidar)


class NcLidarStudyTest(unittest.TestCase):
    def test_native_grid_bounds_expand_to_service_grid_without_resampling(self):
        bounds, size = nc_lidar.native_grid_bounds((101.1, 202.1, 108.9, 209.9), {'xmin': 100, 'ymin': 200})
        self.assertEqual(bounds, [100.0, 200.0, 109.375, 212.5])
        self.assertEqual(size, [3, 4])

    def test_service_contract_rejects_changed_units_or_resolution(self):
        service = {'pixelType': 'F32', 'serviceDataType': 'esriImageServiceDataTypeElevation',
                   'pixelSizeX': 3.125, 'pixelSizeY': 3.125, 'spatialReference': {'wkt': 'UNIT["Foot_US",1]'}}
        nc_lidar.validate_service(service)
        service['pixelSizeX'] = 1
        with self.assertRaisesRegex(ValueError, 'resolution'):
            nc_lidar.validate_service(service)


if __name__ == '__main__':
    unittest.main()

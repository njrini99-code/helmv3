"""No-network checks for the NC OneMap native-orthophoto contract."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('nc_ortho', Path(__file__).with_name('fetch-nc-ortho-study.py'))
nc_ortho = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nc_ortho)


class NcOrthoStudyTest(unittest.TestCase):
    def test_native_grid_is_six_inches_and_never_downsampled(self):
        bounds, size = nc_ortho.native_grid_bounds((100.1, 200.1, 101.2, 201.2), {'xmin': 100, 'ymin': 200})
        self.assertEqual(bounds, [100.0, 200.0, 101.5, 201.5])
        self.assertEqual(size, [3, 3])
        self.assertAlmostEqual(nc_ortho.NATIVE_PIXEL_US_FEET * nc_ortho.US_SURVEY_FOOT_TO_METERS, .1524003048)

    def test_rejects_changed_band_or_grid_contract(self):
        valid = {'pixelType': 'U8', 'bandCount': 4, 'pixelSizeX': .5, 'pixelSizeY': .5, 'spatialReference': {'latestWkid': 6543}}
        nc_ortho.validate_service(valid, 4)
        valid['bandCount'] = 3
        with self.assertRaisesRegex(ValueError, 'band'):
            nc_ortho.validate_service(valid, 4)


if __name__ == '__main__':
    unittest.main()

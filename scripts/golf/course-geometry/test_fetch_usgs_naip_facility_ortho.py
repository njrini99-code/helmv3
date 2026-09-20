import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('usgs_naip_facility_ortho', HERE / 'fetch-usgs-naip-facility-ortho.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class UsgsNaipCatalogItemTests(unittest.TestCase):
    def test_chooses_one_highest_density_four_band_source_item(self):
        payload = {
            'catalogItems': {'features': [
                {'attributes': {'OBJECTID': 8, 'Category': 2, 'resolution_value': 0.3, 'band_count': 4}},
                {'attributes': {'OBJECTID': 7, 'Category': 1, 'resolution_value': 0.6, 'band_count': 4, 'acquisition_date': 1}},
                {'attributes': {'OBJECTID': 6, 'Category': 1, 'resolution_value': 0.3, 'band_count': 4, 'acquisition_date': 2}},
            ]},
        }
        selected = module.select_native_catalog_item(payload)
        self.assertEqual(selected['OBJECTID'], 6)
        self.assertEqual(selected['resolution_value'], 0.3)

    def test_rejects_ambiguous_best_resolution_items(self):
        payload = {
            'catalogItems': {'features': [
                {'attributes': {'OBJECTID': 1, 'Category': 1, 'resolution_value': 0.6, 'band_count': 4}},
                {'attributes': {'OBJECTID': 2, 'Category': 1, 'resolution_value': 0.6, 'band_count': 4}},
            ]},
        }
        with self.assertRaisesRegex(ValueError, 'ambiguous'):
            module.select_native_catalog_item(payload)


class UsgsNaipTilingTests(unittest.TestCase):
    def test_tiles_snap_to_requested_source_density_without_exceeding_budget(self):
        tiles = module.native_tiles((100.13, 200.17, 900.2, 850.7), 0.6, 280)
        self.assertTrue(tiles)
        self.assertTrue(all(tile['pixels'][0] * tile['pixels'][1] <= module.MAX_PIXELS_PER_EXPORT for tile in tiles))
        self.assertTrue(all(abs((tile['boundsLocalMeters'][2] - tile['boundsLocalMeters'][0]) / tile['pixels'][0] - 0.6) < 1e-9 for tile in tiles))


if __name__ == '__main__':
    unittest.main()

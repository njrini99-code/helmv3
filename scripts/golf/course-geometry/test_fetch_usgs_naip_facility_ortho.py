import importlib.util
import json
import tempfile
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse
from PIL import Image
import numpy as np
from osgeo import gdal, osr
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('usgs_naip_facility_ortho', HERE / 'fetch-usgs-naip-facility-ortho.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class UsgsNaipCatalogItemTests(unittest.TestCase):
    def test_overlapping_source_sheets_use_newest_capture_then_stable_id(self):
        items = [{'attributes': {'OBJECTID': ident, 'Category': 1, 'resolution_value': .6,
                                 'band_count': 4, 'resolution_units': 'METER', 'acquisition_date': date}}
                 for ident, date in [(8, 100), (7, 200), (6, 200)]]
        ranked = module.ranked_catalog_items({'catalogItems': {'features': items}})
        self.assertEqual([item['OBJECTID'] for item in ranked], [6, 7])

    def test_chooses_one_highest_density_four_band_source_item(self):
        payload = {
            'catalogItems': {'features': [
                {'attributes': {'OBJECTID': 8, 'Category': 2, 'resolution_value': 0.3, 'band_count': 4, 'resolution_units': 'METER'}},
                {'attributes': {'OBJECTID': 7, 'Category': 1, 'resolution_value': 0.6, 'band_count': 4, 'resolution_units': 'METER', 'acquisition_date': 1}},
                {'attributes': {'OBJECTID': 6, 'Category': 1, 'resolution_value': 0.3, 'band_count': 4, 'resolution_units': 'METER', 'acquisition_date': 2}},
            ]},
        }
        selected = module.select_native_catalog_item(payload)
        self.assertEqual(selected['OBJECTID'], 6)
        self.assertEqual(selected['resolution_value'], 0.3)

    def test_rejects_ambiguous_best_resolution_items(self):
        payload = {
            'catalogItems': {'features': [
                {'attributes': {'OBJECTID': 1, 'Category': 1, 'resolution_value': 0.6, 'band_count': 4, 'resolution_units': 'METER'}},
                {'attributes': {'OBJECTID': 2, 'Category': 1, 'resolution_value': 0.6, 'band_count': 4, 'resolution_units': 'METER'}},
            ]},
        }
        with self.assertRaisesRegex(ValueError, 'ambiguous'):
            module.select_native_catalog_item(payload)


class UsgsNaipTilingTests(unittest.TestCase):
    def test_multi_course_property_retains_native_density_with_bounded_requests(self):
        tiles = module.native_tiles((582528.3, 2965338., 586726.7, 2969314.6), .3, 280)
        pixels = sum(t['pixels'][0] * t['pixels'][1] for t in tiles)
        self.assertGreater(pixels, 128_000_000)
        self.assertLessEqual(pixels, module.MAX_FACILITY_PIXELS)
        self.assertLessEqual(len(tiles), module.MAX_FACILITY_TILES)
        self.assertTrue(all(t['pixels'][0] * t['pixels'][1] <= module.MAX_PIXELS_PER_EXPORT for t in tiles))

    def test_tiles_snap_to_requested_source_density_without_exceeding_budget(self):
        tiles = module.native_tiles((100.13, 200.17, 900.2, 850.7), 0.6, 280)
        self.assertTrue(tiles)
        self.assertTrue(all(tile['pixels'][0] * tile['pixels'][1] <= module.MAX_PIXELS_PER_EXPORT for tile in tiles))
        self.assertTrue(all(abs((tile['boundsLocalMeters'][2] - tile['boundsLocalMeters'][0]) / tile['pixels'][0] - 0.6) < 1e-9 for tile in tiles))


class UsgsNaipProvenanceTests(unittest.TestCase):
    def test_expired_export_url_retries_stream_with_the_identical_source_lock(self):
        tile = {'key': 'test', 'boundsLocalMeters': [100, 200, 106, 206], 'pixels': [10, 10]}
        item = {'OBJECTID': 42, 'resolution_value': .6}
        payload = {'width': 10, 'height': 10, 'href': 'https://example.test/expired.tif',
                   'extent': {'xmin': 100, 'ymin': 200, 'xmax': 106, 'ymax': 206}}
        image = Image.fromarray(np.arange(400, dtype=np.uint8).reshape(10, 10, 4))
        with patch.object(module, 'read_json', return_value=payload), \
             patch.object(module, 'read_tiff_with_retry', side_effect=[ValueError('expired URL'), (b'pixels', image)]) as read, \
             patch.object(module, 'validate_raster', return_value={'validPixelShare': 1.0}):
            result, _, _, _ = module.export_tile(tile, 26917, item)
        params = parse_qs(urlparse(read.call_args.args[0]).query)
        self.assertEqual(params['f'], ['image'])
        self.assertEqual(json.loads(params['mosaicRule'][0])['lockRasterIds'], [42])
        self.assertEqual(params['size'], ['10,10'])
        self.assertEqual(params['bandIds'], ['0,1,2,3'])
        self.assertEqual(result['delivery'], 'direct_image_after_href_failure')

    def test_rejects_resolution_without_units(self):
        payload = {'catalogItems': {'features': [{'attributes': {
            'OBJECTID': 4, 'Category': 1, 'resolution_value': 0.6, 'band_count': 4,
        }}]}}
        with self.assertRaisesRegex(ValueError, 'four-band'):
            module.select_native_catalog_item(payload)

    def test_export_locks_the_selected_raster(self):
        tile = {'key': 'test', 'boundsLocalMeters': [100, 200, 106, 206], 'pixels': [10, 10]}
        item = {'OBJECTID': 42, 'resolution_value': 0.6}
        payload = {'width': 10, 'height': 10, 'href': 'https://example.com/a.tif',
                   'extent': {'xmin': 100, 'ymin': 200, 'xmax': 106, 'ymax': 206,
                              'spatialReference': {'wkid': 26917}}}
        image = Image.fromarray(np.arange(400, dtype=np.uint8).reshape(10, 10, 4))
        with patch.object(module, 'read_json', return_value=payload) as request, \
             patch.object(module, 'read_tiff_with_retry', return_value=(b'pixels', image)), \
             patch.object(module, 'validate_raster', return_value={'validPixelShare': 1.0}):
            exported, _, _, _ = module.export_tile(tile, 26917, item)
        params = parse_qs(urlparse(request.call_args.args[0]).query)
        rule = json.loads(params['mosaicRule'][0])
        self.assertEqual(rule['mosaicMethod'], 'esriMosaicLockRaster')
        self.assertEqual(rule['lockRasterIds'], [42])
        self.assertEqual(exported['request']['mosaicRule'], rule)

    def test_raster_grid_and_band_validity_come_from_tiff(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'source.tif'
            ds = gdal.GetDriverByName('GTiff').Create(str(path), 10, 10, 4, gdal.GDT_Byte)
            sr = osr.SpatialReference(); sr.ImportFromEPSG(26917)
            ds.SetProjection(sr.ExportToWkt()); ds.SetGeoTransform((100, .6, 0, 206, 0, -.6))
            for i in range(1, 5):
                ds.GetRasterBand(i).WriteArray(np.full((10, 10), 120, dtype=np.uint8))
            ds = None
            bounds = [100, 200, 106, 206]
            self.assertEqual(module.validate_raster(path.read_bytes(), bounds, [10, 10], 26917)['validPixelShare'], 1.0)
            with self.assertRaisesRegex(ValueError, 'CRS'):
                module.validate_raster(path.read_bytes(), bounds, [10, 10], 26918)
            with self.assertRaisesRegex(ValueError, 'grid'):
                module.validate_raster(path.read_bytes(), [101, 200, 107, 206], [10, 10], 26917)

    def test_sparse_unknown_pixels_remain_unknown_and_large_coverage_gaps_reject(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'source.tif'
            def raster(void_size):
                ds = gdal.GetDriverByName('GTiff').Create(str(path), 100, 100, 4, gdal.GDT_Byte)
                sr = osr.SpatialReference(); sr.ImportFromEPSG(26917)
                ds.SetProjection(sr.ExportToWkt()); ds.SetGeoTransform((100, .6, 0, 260, 0, -.6))
                data = np.full((100, 100), 120, dtype=np.uint8); data[:void_size, :void_size] = 0
                for i in range(1, 5):
                    ds.GetRasterBand(i).WriteArray(data)
                ds = None
                return path.read_bytes()
            quality = module.validate_raster(raster(1), [100, 200, 160, 260], [100, 100], 26917)
            self.assertEqual(quality['unknownPixelCount'], 1)
            self.assertFalse(quality['physicalCoverageComplete'])
            self.assertFalse(quality['canMeasurePhysicalGeometry'])
            with self.assertRaisesRegex(ValueError, 'does not cover'):
                module.validate_raster(raster(20), [100, 200, 160, 260], [100, 100], 26917)

    def test_cache_rejects_legacy_unlocked_tile(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            for name in module.TILE_ARTIFACTS:
                (folder / name).write_text('{}')
            with self.assertRaisesRegex(ValueError, 'locked'):
                module.cached_tile({'key': 'x', 'boundsLocalMeters': [0, 0, 6, 6], 'pixels': [10, 10]}, folder, 26917)


if __name__ == '__main__':
    unittest.main()

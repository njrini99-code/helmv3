import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from osgeo import gdal, osr
from PIL import Image

import indexed_naip
from factory.fingerprints import native_imagery_identity


class IndexedCanopyTests(unittest.TestCase):
    def test_locked_pixels_survive_offline_reprojection_and_cache_tampering_fails(self):
        naip = indexed_naip._acquisition()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / 'source.tif'
            data = np.full((4, 100, 100), 180, dtype=np.uint8)
            data[:3, :40] = 90
            data[3] = 0  # valid NIR=0 must not act as transparency
            data[:, 50, 50] = 0  # unknown, retained and excluded
            ds = gdal.GetDriverByName('GTiff').Create(str(source), 100, 100, 4, gdal.GDT_Byte)
            ds.SetGeoTransform((500000, .6, 0, 4400060, 0, -.6))
            srs = osr.SpatialReference(); srs.ImportFromEPSG(26917)
            ds.SetProjection(srs.ExportToWkt())
            for band in range(4):
                ds.GetRasterBand(band + 1).WriteArray(data[band])
            ds.GetRasterBand(4).SetColorInterpretation(gdal.GCI_AlphaBand)
            ds = None
            bounds = [500000, 4400000, 500060, 4400060]
            tile = {'key': 'r00-c00', 'boundsLocalMeters': bounds, 'pixels': [100, 100]}
            item = {'OBJECTID': 42, 'Category': 1, 'resolution_value': .6, 'resolution_units': 'METER',
                    'band_count': 4, 'acquisition_date': 1704067200000}
            payload = {'width': 100, 'height': 100, 'href': 'https://example.test/image.tif',
                       'extent': dict(zip(('xmin', 'ymin', 'xmax', 'ymax'), bounds))}
            native = root / 'native'
            with patch.object(naip, 'identify', return_value={'catalogItems': {'features': [{'attributes': item}]}}), \
                    patch.object(naip, 'read_json', return_value=payload), \
                    patch.object(naip, 'read_tiff_with_retry', return_value=(source.read_bytes(), Image.open(source))):
                record = naip.acquire_tile(tile, native, 26917, 3857, .6)
            index = {'schema': naip.INDEX_SCHEMA, 'complete': True, 'facilityId': 'test',
                     'tileCountPlanned': 1, 'sourceResolutionMeters': .6,
                     'acquisitionContract': 'locked_catalog_item_four_band_geotiff_v2', 'tiles': [record],
                     'source': {'targetWkid': 26917, 'service': naip.SERVICE, 'licenseStatus': 'Public domain'}}
            index_path = native / 'index.json'; index_path.write_text(json.dumps(index))
            extent = dict(zip(('xmin', 'ymin', 'xmax', 'ymax'), bounds))
            out = root / 'derived'
            manifest = indexed_naip.acquire(index_path, out, extent, (100, 100), 26917)
            output = gdal.Open(str(out / 'naip.tif')).ReadAsArray()
            np.testing.assert_array_equal(output, data)
            self.assertEqual(manifest['validPixelShare'], .9999)
            self.assertEqual(manifest['captureDates'], ['2024-01-01'])
            self.assertFalse(manifest['canMeasurePhysicalGeometry'])
            # Resume metadata must not cause a new physical/source identity.
            index['retrievedAt'] = '2026-09-21'
            index['tiles'][0]['status'] = 'cached'
            index_path.write_text(json.dumps(index))
            self.assertEqual(manifest['sourceIdentity'], native_imagery_identity(index))
            self.assertEqual(indexed_naip.acquire(index_path, out, extent, (100, 100), 26917), manifest)
            ds = gdal.Open(str(native / 'tiles/r00-c00/ortho.tif'), gdal.GA_Update)
            ds.GetRasterBand(1).WriteArray(np.zeros((1, 1), dtype=np.uint8), 0, 0); ds = None
            with self.assertRaisesRegex(ValueError, 'hash changed'):
                indexed_naip.acquire(index_path, out, extent, (100, 100), 26917)


if __name__ == '__main__':
    unittest.main()

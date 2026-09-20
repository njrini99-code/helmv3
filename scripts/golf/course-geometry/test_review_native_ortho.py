import importlib.util
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pyproj
from osgeo import gdal, osr

gdal.UseExceptions()

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / 'review-native-ortho.py'


def write_tiff(path, array, geotransform):
    bands, height, width = array.shape
    dataset = gdal.GetDriverByName('GTiff').Create(str(path), width, height, bands, gdal.GDT_Byte)
    dataset.SetGeoTransform(geotransform)
    spatial_ref = osr.SpatialReference()
    spatial_ref.ImportFromEPSG(6543)
    dataset.SetProjection(spatial_ref.ExportToWkt())
    for index in range(bands):
        dataset.GetRasterBand(index + 1).WriteArray(array[index])
    dataset.FlushCache()
    dataset = None


class NativeOrthoReviewTests(unittest.TestCase):
    def test_native_source_review_emits_derived_observations_without_measurement_authority(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            native = root / 'native-ortho-nir-v2'
            tile_dir = native / 'tiles' / 'r00-c00'
            tile_dir.mkdir(parents=True)
            project = pyproj.Transformer.from_crs(4326, 6543, always_xy=True)
            unproject = pyproj.Transformer.from_crs(6543, 4326, always_xy=True)
            cx, cy = project.transform(-80.2997619, 36.1012026)
            west, north, cell = cx - 50, cy + 50, 0.5
            transform = (west, cell, 0, north, 0, -cell)
            rgb = np.full((3, 200, 200), 90, dtype=np.uint8)
            rgb[0, 80:120, 80:120] = 220
            rgb[1, 80:120, 80:120] = 185
            rgb[2, 80:120, 80:120] = 105
            nir = np.full((1, 200, 200), 180, dtype=np.uint8)
            nir[0, 80:120, 80:120] = 30
            write_tiff(tile_dir / 'rgb.tif', rgb, transform)
            write_tiff(tile_dir / 'nir.tif', nir, transform)
            index = {
                'schema': 'golfhelm-facility-native-ortho-index-v2', 'facilityId': 'synthetic',
                'complete': True, 'tileCountPlanned': 1, 'sourceGsdMeters': 0.1524003048,
                'qualitySummary': {'passedTiles': 1, 'failedTileKeys': []},
                'tiles': [{'key': 'r00-c00', 'boundsNativeUSFeet': [west, north - 100, west + 100, north]}],
            }
            index_path = native / 'index.json'
            index_path.write_text(json.dumps(index))
            source_items = {
                'schema': 'golfhelm-nc-ortho-source-items-v1', 'complete': True,
                'inputIndexSha256': hashlib.sha256(index_path.read_bytes()).hexdigest(),
                'tiles': [{'tileKey': 'r00-c00', 'status': 'one_native_resolution_catalog_item',
                           'item': {'objectid': 1, 'catalogDate': '2024-01-01T00:00:00Z'}}],
            }
            source_item_path = root / 'source-items.json'
            source_item_path.write_text(json.dumps(source_items))
            def lonlat(x, y):
                return [round(value, 7) for value in unproject.transform(x, y)]
            ring = [lonlat(cx - 10, cy - 10), lonlat(cx + 10, cy - 10), lonlat(cx + 10, cy + 10), lonlat(cx - 10, cy + 10), lonlat(cx - 10, cy - 10)]
            package = {
                'contentHash': 'synthetic-hash', 'status': 'source_candidate',
                'holes': [{'key': 'synthetic-01', 'ordinal': 1, 'par': 4, 'featureIds': ['route', 'bunker']}],
                'features': [
                    {'id': 'route', 'kind': 'route', 'holeKeys': ['synthetic-01'], 'geometryWgs84': {'type': 'LineString', 'coordinates': [lonlat(cx - 30, cy - 30), lonlat(cx + 30, cy + 30)]}},
                    {'id': 'bunker', 'kind': 'bunker', 'holeKeys': ['synthetic-01'], 'geometryWgs84': {'type': 'Polygon', 'coordinates': [ring]}},
                ],
            }
            package_path = root / 'normalized.json'
            package_path.write_text(json.dumps(package))
            output = root / 'review'
            result = subprocess.run([sys.executable, str(SCRIPT), str(package_path), str(index_path), str(source_item_path), str(output)], text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            contract = json.loads((output / 'review-contract.json').read_text())
            observations = json.loads((output / 'candidate-observations.json').read_text())
            self.assertTrue(contract['canCreateReviewCandidates'])
            self.assertFalse(contract['canMeasurePhysicalGeometry'])
            self.assertEqual(observations['candidateGeometryTruthClass'], 'derived')
            self.assertFalse(observations['canMeasurePhysicalGeometry'])
            self.assertEqual(observations['holes'][0]['scanScope']['route'], 'non_canonical_visual_crop_aid')
            self.assertTrue((output / 'synthetic-01-native-overlay.png').is_file())


if __name__ == '__main__':
    unittest.main()

class NativeOrthoObservationLimitsTests(unittest.TestCase):
    def test_large_or_elongated_spectral_regions_are_review_context_not_feature_candidates(self):
        spec = importlib.util.spec_from_file_location('review_native_ortho', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        spec.loader.exec_module(module)
        self.assertFalse(module.is_bounded_review_observation(10.0, 1.5))
        self.assertTrue(module.is_bounded_review_observation(85.0, 2.0))
        self.assertFalse(module.is_bounded_review_observation(2_000.0, 1.1))
        self.assertFalse(module.is_bounded_review_observation(80.0, 12.0))
        self.assertEqual(module.MAX_CANDIDATES_PER_HOLE, 3)

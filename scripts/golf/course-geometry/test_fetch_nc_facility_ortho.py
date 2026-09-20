import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('nc_facility_ortho', HERE / 'fetch-nc-facility-ortho.py')
facility_ortho = importlib.util.module_from_spec(spec)
spec.loader.exec_module(facility_ortho)


class NcFacilityOrthoTests(unittest.TestCase):
    def test_native_tiles_are_within_the_six_inch_pixel_budget(self):
        extent = {'xmin': 0, 'ymin': 0}
        tiles = facility_ortho.native_tiles((0.1, 0.1, 3000, 2000), extent, 280)
        self.assertTrue(tiles)
        self.assertTrue(all(tile['pixels'][0] * tile['pixels'][1] <= facility_ortho.source.MAX_PIXELS for tile in tiles))
        self.assertEqual(tiles[0]['boundsNativeUSFeet'][:2], [0.0, 0.0])

    def test_quality_summary_rejects_an_analysis_tile_without_nir(self):
        summary = facility_ortho.quality_summary([
            {'key': 'r00-c00', 'selected': 'analysis_rgb_nir', 'quality': {
                'nativeGsdMeters': 0.1524003048,
                'rgb': {'passed': True}, 'nir': {'passed': True},
            }},
            {'key': 'r00-c01', 'selected': 'analysis_rgb_nir', 'quality': {
                'nativeGsdMeters': 0.1524003048,
                'rgb': {'passed': True}, 'nir': {'passed': False},
            }},
        ])
        self.assertEqual(summary['passedTiles'], 1)
        self.assertEqual(summary['failedTileKeys'], ['r00-c01'])
        self.assertEqual(summary['nativeGsdMeters'], [0.1524003048])

    def test_accepts_a_large_facility_when_each_source_tile_is_bounded(self):
        tiles = [{'key': str(index)} for index in range(99)]
        facility_ortho.validate_facility_tile_count(tiles)

    def test_rejects_a_tile_size_that_cannot_honor_the_native_contract(self):
        with self.assertRaisesRegex(ValueError, 'between 50 and 300'):
            facility_ortho.native_tiles((0, 0, 1, 1), {'xmin': 0, 'ymin': 0}, 301)


if __name__ == '__main__':
    unittest.main()

class NcFacilityOrthoRetryTests(unittest.TestCase):
    def test_retries_a_truncated_tiff_before_accepting_source_pixels(self):
        from io import BytesIO
        from PIL import Image

        valid = BytesIO()
        Image.new('RGB', (2, 2), (12, 34, 56)).save(valid, format='TIFF')
        responses = [b'not-a-tiff', valid.getvalue()]

        def read(_url, _limit):
            return responses.pop(0)

        pixels, image = facility_ortho.read_tiff_with_retry('https://example.test/raster.tif', 'RGB', read=read)
        self.assertEqual(pixels, valid.getvalue())
        self.assertEqual(image.mode, 'RGB')
        self.assertEqual(image.size, (2, 2))
        self.assertEqual(responses, [])

class NcFacilityOrthoSourceFallbackTests(unittest.TestCase):
    def test_uses_historical_four_band_analysis_only_after_the_current_source_fails_quality(self):
        candidates = [
            {'id': 'current', 'service': 'https://example.test/current'},
            {'id': 'historical', 'service': 'https://example.test/historical'},
        ]
        calls = []

        def acquire(candidate):
            calls.append(candidate['id'])
            if candidate['id'] == 'current':
                raise ValueError('blank source raster')
            return {'selected': candidate['id']}

        result, failures = facility_ortho.acquire_from_analysis_candidates(candidates, acquire)
        self.assertEqual(result['selected'], 'historical')
        self.assertEqual(calls, ['current', 'historical'])
        self.assertEqual(failures, [{'sourceId': 'current', 'reason': 'blank source raster'}])

class NcFacilityOrthoNoCoverageTests(unittest.TestCase):
    def test_marks_an_all_zero_tiff_as_missing_source_coverage(self):
        from io import BytesIO
        from PIL import Image

        raster = BytesIO()
        Image.new('RGB', (3, 3), (0, 0, 0)).save(raster, format='TIFF')
        self.assertTrue(facility_ortho.tiff_is_all_zero(raster.getvalue()))

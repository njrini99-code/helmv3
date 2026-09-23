"""Per-export NDVI gate of the canopy pass: the gate is calibrated from the
package's own OSM fairway and woods pixels, never above the reviewed ceiling
and never below the floor; texture still separates turf from crowns."""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from shapely.geometry import box

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)


def load():
    spec = importlib.util.spec_from_file_location('derive_canopy_naip', os.path.join(HERE, 'derive-canopy-naip.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


canopy = load()


class GateTests(unittest.TestCase):
    def test_reviewed_exports_keep_the_ceiling(self):
        # Winchester / the Upper: fairways at 0.37 → gap lands above the ceiling → unchanged 0.28.
        self.assertEqual(canopy.calibrated_ndvi_min(0.369), (0.28, 'turf_plus_gap'))

    def test_a_compressed_export_loosens_the_gate(self):
        self.assertEqual(canopy.calibrated_ndvi_min(0.122), (0.182, 'turf_plus_gap'))   # Forsyth
        self.assertEqual(canopy.calibrated_ndvi_min(0.16), (0.22, 'turf_plus_gap'))     # Cacapon
        self.assertEqual(canopy.calibrated_ndvi_min(0.21), (0.27, 'turf_plus_gap'))     # Grande Dunes

    def test_floor_and_fixed_fallback(self):
        self.assertEqual(canopy.calibrated_ndvi_min(0.02), (canopy.NDVI_MIN_FLOOR, 'turf_plus_gap'))
        self.assertEqual(canopy.calibrated_ndvi_min(None), (canopy.NDVI_MIN, 'fixed_ceiling'))


class ClassifyTests(unittest.TestCase):
    def test_texture_matches_original_std_including_reflected_edges(self):
        from scipy import ndimage
        source = np.random.default_rng(42).integers(0, 256, (80, 110)).astype(float)
        expected = ndimage.generic_filter(source, np.std, size=7)
        np.testing.assert_allclose(canopy.nir_texture(source), expected, atol=1e-9)

    def test_morphology_never_fills_an_unknown_or_golf_surface_pixel(self):
        ndvi = np.full((100, 100), .8)
        texture = np.full((100, 100), 30.)
        masked = np.zeros((100, 100), dtype=bool)
        masked[40:60, 49] = True
        found = canopy.classify(ndvi, texture, masked, .28)
        self.assertFalse(found[masked].any())
        self.assertTrue(found[30:40, 30:40].all())

    def synthetic(self, forest_ndvi):
        rng = np.random.default_rng(7)
        size = 120
        ndvi = np.full((size, size), 0.12)            # smooth turf everywhere
        texture = np.full((size, size), 2.0)
        ndvi[20:80, 20:80] = forest_ndvi              # one 60 m forest block
        texture[20:80, 20:80] = 20 + rng.normal(0, 2, (60, 60))
        masked = np.zeros((size, size), dtype=bool)
        masked[90:110, 90:110] = True                 # a green: never canopy
        ndvi[90:110, 90:110] = 0.6; texture[90:110, 90:110] = 30
        return ndvi, texture, masked

    def test_fixed_ceiling_misses_a_compressed_forest_that_the_calibrated_gate_keeps(self):
        ndvi, texture, masked = self.synthetic(0.24)
        self.assertEqual(int(canopy.classify(ndvi, texture, masked, canopy.NDVI_MIN).sum()), 0)
        found = canopy.classify(ndvi, texture, masked, 0.18)
        self.assertGreater(int(found[20:80, 20:80].sum()), 3400)
        self.assertEqual(int(found[masked].sum()), 0)
        self.assertEqual(int(found[:20].sum()) + int(found[80:].sum()), 0, 'smooth turf never classifies, whatever the NDVI gate')

    def test_calibrate_samples_the_package_fairways_only(self):
        size = 100
        ndvi = np.full((size, size), 0.1)
        ndvi[:, 50:] = 0.4
        pkg = {'features': [
            {'kind': 'fairway', 'geometryWgs84': {'type': 'Polygon', 'coordinates': [[[0, 0], [40, 0], [40, 40], [0, 40], [0, 0]]]}},
            {'kind': 'green', 'geometryWgs84': {'type': 'Polygon', 'coordinates': [[[60, 0], [99, 0], [99, 40], [60, 40], [60, 0]]]}},
        ]}
        cal = canopy.calibrate(ndvi, pkg, lambda lon, lat: (lon, lat), (size, size))
        self.assertEqual((cal['turfNdviMedian'], cal['rule'], cal['ndviMin']), (0.1, 'turf_plus_gap', 0.16))
        self.assertGreater(cal['turfPixels'], 1500)
        # A package without fairways (or with a sliver too small to sample) keeps the reviewed ceiling.
        thin = {'features': [{'kind': 'fairway', 'geometryWgs84': {'type': 'Polygon', 'coordinates': [[[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]]]}}]}
        cal = canopy.calibrate(ndvi, thin, lambda lon, lat: (lon, lat), (size, size))
        self.assertEqual((cal['turfNdviMedian'], cal['rule'], cal['ndviMin']), (None, 'fixed_ceiling', canopy.NDVI_MIN))


class ImagerySelectionTests(unittest.TestCase):
    """FPAC conus_naip leaf-on is preferred whenever it has coverage; the
    facility's indexed NAIP Plus cache is only a fallback, and a retained
    cache is reused from whichever provider produced it."""

    def test_fpac_coverage_is_preferred_over_the_index(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp) / 'naip'
            fake_manifest = {'provider': 'USDA NAIP via FPAC conus_naip ImageServer'}
            with patch.object(canopy, 'acquire', return_value=fake_manifest) as fake_acquire:
                manifest, provider, reason = canopy.select_imagery(directory, {'xmin': 0, 'ymin': 0, 'xmax': 1, 'ymax': 1}, (10, 10), 32617, Path('index.json'))
            fake_acquire.assert_called_once()
            self.assertEqual((manifest, provider), (fake_manifest, 'fpac_conus_naip'))
            self.assertIn('coverage', reason)

    def test_naip_plus_is_a_fallback_when_fpac_has_no_coverage(self):
        import indexed_naip
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp) / 'naip'
            fake_manifest = {'provider': 'USGS NAIP Plus source-locked facility cache'}
            with patch.object(canopy, 'acquire', side_effect=canopy.NoFPACCoverage('no tiles')), \
                    patch.object(indexed_naip, 'acquire', return_value=fake_manifest) as fake_indexed:
                manifest, provider, reason = canopy.select_imagery(directory, {'xmin': 0, 'ymin': 0, 'xmax': 1, 'ymax': 1}, (10, 10), 32617, Path('index.json'))
            fake_indexed.assert_called_once()
            self.assertEqual((manifest, provider), (fake_manifest, 'naip_plus'))
            self.assertIn('no coverage', reason)

    def test_no_coverage_and_no_fallback_index_is_a_hard_stop(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp) / 'naip'
            with patch.object(canopy, 'acquire', side_effect=canopy.NoFPACCoverage('no tiles')):
                with self.assertRaises(SystemExit):
                    canopy.select_imagery(directory, {'xmin': 0, 'ymin': 0, 'xmax': 1, 'ymax': 1}, (10, 10), 32617, None)

    def test_a_retained_naip_plus_cache_is_reused_without_re_deciding(self):
        import indexed_naip
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp) / 'naip'
            directory.mkdir()
            (directory / 'manifest.json').write_text(json.dumps({'provider': 'USGS NAIP Plus source-locked facility cache'}))
            with patch.object(canopy, 'acquire') as fake_acquire, patch.object(indexed_naip, 'acquire', return_value={'provider': 'USGS NAIP Plus source-locked facility cache'}) as fake_indexed:
                _manifest, provider, reason = canopy.select_imagery(directory, {'xmin': 0, 'ymin': 0, 'xmax': 1, 'ymax': 1}, (10, 10), 32617, Path('index.json'))
            fake_acquire.assert_not_called()
            fake_indexed.assert_called_once()
            self.assertEqual(provider, 'naip_plus')
            self.assertEqual(reason, 'retained cache')


class AutoReviewRecordTests(unittest.TestCase):
    """The automatic sign-off that replaces the human canopy review."""

    def test_peeks_own_measurements_pass_the_bounds(self):
        # Peek'n Peak Upper's checked-in review: 144 groups, 46.9% canopy
        # share, no overlap with a playing surface, over a ~605 ha export.
        record = canopy.auto_review_record(0.469, 144, [], None, 605.3)
        self.assertTrue(record['withinBounds'])
        self.assertEqual(record['reviewer'], 'auto-canopy-review-v1')
        self.assertAlmostEqual(record['measurements']['groupDensityPerHectare'], 144 / 605.3, places=3)

    def test_a_share_below_the_floor_is_out_of_bounds(self):
        record = canopy.auto_review_record(0.01, 2, [], None, 500.0)
        self.assertFalse(record['withinBounds'])

    def test_a_share_above_the_ceiling_is_out_of_bounds(self):
        record = canopy.auto_review_record(0.9, 200, [], None, 500.0)
        self.assertFalse(record['withinBounds'])

    def test_final_regions_overlapping_a_playing_surface_are_out_of_bounds(self):
        # The vector region (after closing/opening/simplify) covers a fairway
        # box entirely: overlap is measured on the final shape, not the mask.
        fairway = box(0, 0, 100, 100)
        region = box(0, 0, 100, 100)
        record = canopy.auto_review_record(0.3, 1, [region], fairway, 100.0)
        self.assertFalse(record['withinBounds'])
        self.assertEqual(record['measurements']['surfaceOverlapShare'], 1.0)

    def test_a_small_overlap_from_buffering_stays_in_bounds(self):
        fairway = box(0, 0, 100, 100)
        region = box(99, 0, 199, 100)  # touches, 1% overlap of its own area
        record = canopy.auto_review_record(0.3, 1, [region], fairway, 100.0)
        self.assertLessEqual(record['measurements']['surfaceOverlapShare'], canopy.CANOPY_SURFACE_OVERLAP_MAX)
        self.assertTrue(record['withinBounds'])

    def test_over_segmented_groups_are_out_of_bounds_on_density(self):
        record = canopy.auto_review_record(0.3, 500, [], None, 10.0)
        self.assertFalse(record['withinBounds'])


class HoleFreePartsTests(unittest.TestCase):
    def test_a_clearing_survives_as_uncovered_area(self):
        from shapely.geometry import Polygon as P
        forest = P([(0, 0), (200, 0), (200, 100), (0, 100)], [[(50, 30), (150, 30), (150, 70), (50, 70)]])
        parts = canopy.hole_free_parts(forest)
        self.assertTrue(parts and all(not p.interiors for p in parts))
        written = [P(p.exterior) for p in parts]
        from shapely.ops import unary_union as U
        self.assertAlmostEqual(U(written).area, forest.area, delta=1.0)
        self.assertFalse(U(written).contains(P([(60, 40), (140, 40), (140, 60), (60, 60)]).centroid))

    def test_nested_and_multiple_clearings(self):
        from shapely.geometry import Polygon as P
        forest = P([(0, 0), (300, 0), (300, 100), (0, 100)],
                   [[(20, 20), (60, 20), (60, 80), (20, 80)], [(120, 20), (180, 20), (180, 80), (120, 80)], [(220, 40), (260, 40), (260, 60), (220, 60)]])
        parts = canopy.hole_free_parts(forest)
        self.assertTrue(all(not p.interiors for p in parts))
        from shapely.ops import unary_union as U
        self.assertAlmostEqual(U([P(p.exterior) for p in parts]).area, forest.area, delta=1.0)

    def test_gaps_between_crowns_are_filled_not_split(self):
        from shapely.geometry import Polygon as P
        forest = P([(0, 0), (100, 0), (100, 100), (0, 100)], [[(40, 40), (45, 40), (45, 45), (40, 45)]])
        parts = canopy.hole_free_parts(forest)
        self.assertEqual(len(parts), 1)
        self.assertEqual(parts[0].area, 10000)

    def test_plain_polygon_is_unchanged(self):
        from shapely.geometry import Polygon as P
        square = P([(0, 0), (50, 0), (50, 50), (0, 50)])
        self.assertEqual(canopy.hole_free_parts(square), [square])

class LidarMergeTests(unittest.TestCase):
    def test_lidar_decides_covered_cells_and_naip_fills_the_rest(self):
        chm = np.full((60, 60), 20.0)
        chm[:, 20:40] = 0.3            # a lidar-measured clearing (fairway)
        chm[:, 50:] = canopy.CHM_NODATA  # no returns: NAIP decides
        naip = np.ones((60, 60), bool)   # NAIP calls everything canopy
        merged, share = canopy.merge_lidar(chm, naip, np.zeros((60, 60), bool))
        self.assertAlmostEqual(share, 50 / 60, places=3)
        self.assertFalse(merged[:, 22:38].any())
        self.assertTrue(merged[3:-3, 52:57].all())  # the closing pass erodes the raster border

    def test_implausible_heights_are_no_return(self):
        chm = np.full((40, 40), 0.2)
        chm[10:20, 10:20] = 150.0      # birds / wires: not trees, and not ground either
        naip = np.zeros((40, 40), bool)
        merged, share = canopy.merge_lidar(chm, naip, np.zeros((40, 40), bool))
        self.assertFalse(merged.any())
        self.assertAlmostEqual(share, 1 - 100 / 1600, places=3)

    def test_patchy_lidar_does_not_lead(self):
        chm = np.full((40, 40), canopy.CHM_NODATA)
        chm[:10] = 20.0
        merged, share = canopy.merge_lidar(chm, np.zeros((40, 40), bool), np.zeros((40, 40), bool))
        self.assertIsNone(merged)
        self.assertLess(share, canopy.LIDAR_COVERAGE_MIN)

    def test_a_chm_for_another_export_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            export = Path(tmp) / 'export.json'
            export.write_text('{"width": 1}')
            lidar_dir = Path(tmp) / 'lidar'
            lidar_dir.mkdir()
            (lidar_dir / 'manifest.json').write_text(json.dumps({'status': 'covered', 'terrainExportSha256': '0' * 64}))
            with self.assertRaises(SystemExit) as caught:
                canopy.load_lidar(lidar_dir, export, 1, 1)
            self.assertIn('LIDAR_EXPORT_MISMATCH', str(caught.exception))

    def test_no_coverage_falls_back_to_naip_by_name(self):
        import hashlib
        with tempfile.TemporaryDirectory() as tmp:
            export = Path(tmp) / 'export.json'
            export.write_text('{"width": 1}')
            lidar_dir = Path(tmp) / 'lidar'
            lidar_dir.mkdir()
            (lidar_dir / 'manifest.json').write_text(json.dumps({'status': 'no_coverage', 'terrainExportSha256': hashlib.sha256(export.read_bytes()).hexdigest()}))
            chm, source = canopy.load_lidar(lidar_dir, export, 1, 1)
            self.assertIsNone(chm)
            self.assertEqual(source['kind'], 'naip')
            self.assertTrue(source['reason'].startswith('LIDAR_NO_COVERAGE'))


if __name__ == '__main__':
    unittest.main()

"""Synthetic-data tests for `detect-tee-complexes.py`: a small, flat, bright,
compact patch should be found; a large or elongated or sloped one should not."""
import importlib.util
import os
import unittest

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


dtc = load('detect_tee_complexes', 'detect-tee-complexes.py')
cr = load('course_raster', 'course_raster.py')

EPSG = 32617
GEOTRANSFORM = (600000.0, 1.0, 0.0, 4650000.0, 0.0, -1.0)  # 1m/px, matches the DEFAULTS' metre-based constants
SIZE = 120


def _rough_background(seed=1):
    rng = np.random.default_rng(seed)
    # Rough: darker, noisier turf (NDVI in range, but low brightness with high texture).
    red = rng.normal(70, 8, (SIZE, SIZE))
    green = rng.normal(90, 8, (SIZE, SIZE))
    blue = rng.normal(50, 8, (SIZE, SIZE))
    nir = rng.normal(110, 10, (SIZE, SIZE))
    return red, green, blue, nir


def _paint_patch(bands, row0, row1, col0, col1, brightness_boost=60.0, noise_scale=1.0, seed=2):
    rng = np.random.default_rng(seed)
    red, green, blue, nir = bands
    for band, boost in ((red, brightness_boost * 0.4), (green, brightness_boost * 0.4),
                         (blue, brightness_boost * 0.2), (nir, brightness_boost * 0.5)):
        band[row0:row1, col0:col1] = band[row0:row1, col0:col1].mean() + boost + rng.normal(0, 1.5 * noise_scale, (row1 - row0, col1 - col0))


def _make_naip_dem(patches, dem_flat_rows_cols=None, dem_base=100.0, dem_slope_grade=0.0, seed=1):
    """`patches`: list of (row0, row1, col0, col1) to brighten/smooth (a tee-like patch).
    `dem_flat_rows_cols`: list of (row0, row1, col0, col1) that stay flat in the DEM regardless
    of the ambient slope -- everywhere else ramps at `dem_slope_grade` (metres of rise per metre)."""
    red, green, blue, nir = _rough_background(seed)
    for (r0, r1, c0, c1) in patches:
        _paint_patch((red, green, blue, nir), r0, r1, c0, c1, seed=seed + 10)
    array = np.stack([red, green, blue, nir], axis=0)
    naip = cr.Raster(array, GEOTRANSFORM, EPSG, [None] * 4)

    cols = np.arange(SIZE)
    dem = dem_base + cols[np.newaxis, :] * dem_slope_grade  # ramps left->right everywhere
    dem = np.tile(dem, (SIZE, 1)).astype(np.float64)
    if dem_flat_rows_cols:
        for (r0, r1, c0, c1) in dem_flat_rows_cols:
            dem[r0:r1, c0:c1] = dem_base  # level, regardless of the ambient ramp
    dem_array = dem[np.newaxis, :, :]
    dem_raster = cr.Raster(dem_array, GEOTRANSFORM, EPSG, [None])
    return naip, dem_raster


class DetectTeeComplexesTests(unittest.TestCase):
    def test_a_small_bright_flat_compact_patch_on_sloped_ground_is_detected(self):
        # A ~20x24m tee-like patch, built level on ground that otherwise ramps steadily (a hillside
        # the property sits on) -- only the patch itself should pass the flatness filter. Sized well
        # above min_area_m2 so opening's few-pixel erosion at the edges can't shrink it below the
        # threshold on its own.
        patch = (45, 65, 45, 69)
        naip, dem = _make_naip_dem([patch], dem_flat_rows_cols=[patch], dem_slope_grade=0.08, seed=3)
        candidates = dtc.detect(naip, dem)
        self.assertGreaterEqual(len(candidates), 1, 'the flat, bright, compact patch should be detected')
        areas = [c['areaM2'] for c in candidates]
        self.assertTrue(any(60 <= a <= 500 for a in areas), f'expected a tee-sized area, got {areas}')

    def test_the_same_patch_is_not_detected_when_it_sits_on_the_slope_too(self):
        # Same bright/smooth patch, but the DEM is NOT flattened under it -- it's built on the same
        # ramp as everything else. A real tee complex is always built level; this should be filtered
        # out by the flatness check even though its spectral signature is identical to the case above.
        patch = (45, 65, 45, 69)
        naip, dem = _make_naip_dem([patch], dem_flat_rows_cols=None, dem_slope_grade=0.08, seed=3)
        candidates = dtc.detect(naip, dem)
        patch_center_xy = (GEOTRANSFORM[0] + 57 * GEOTRANSFORM[1], GEOTRANSFORM[3] + 55 * GEOTRANSFORM[5])
        nearby = [c for c in candidates
                  if abs(cr.wgs84_to_epsg(cr.to_shapely({'type': 'Point', 'coordinates': c['centroidWgs84']}), EPSG).x - patch_center_xy[0]) < 15]
        self.assertEqual(nearby, [], 'a bright/smooth patch on sloped ground must not pass the flatness filter')

    def test_a_long_narrow_bright_flat_strip_is_rejected_as_not_compact(self):
        # A fairway-landing-strip shape: bright, smooth and flat like a tee, but 60x8m -- long and
        # narrow, well outside a tee deck's compactness/size envelope.
        patch = (30, 90, 50, 58)  # 60 rows x 8 cols = 60m x 8m
        naip, dem = _make_naip_dem([patch], dem_flat_rows_cols=[patch], dem_slope_grade=0.0, seed=4)
        candidates = dtc.detect(naip, dem)
        long_strip_like = [c for c in candidates if c['evidence']['longSideM'] > 55.0]
        self.assertEqual(long_strip_like, [], 'an elongated strip must not be reported as a tee-sized candidate')


if __name__ == '__main__':
    unittest.main()

"""Synthetic-data tests for `derive-surface-traces.py`: the missing-fairway
detector, the per-pixel turf/smoothness scoring, and the full segmentation
against a hand-built corridor where the right answer is known."""
import hashlib
import importlib.util
import json
import os
import shutil
import tempfile
import unittest

import numpy as np
from shapely.geometry import Point, Polygon, box

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


dst = load('derive_surface_traces', 'derive-surface-traces.py')
cr = load('course_raster', 'course_raster.py')

EPSG = 32617
ORIGIN_WGS84 = [-79.74, 42.055]


def utm_to_wgs84(x, y):
    return list(cr.epsg_to_wgs84(Point(x, y), EPSG).coords[0])


def make_package(holes):
    return {'schemaVersion': 1, 'siteId': 'test-site', 'originWgs84': ORIGIN_WGS84,
            'projection': 'wgs84-local-enu-v1', 'holes': holes['holes'], 'features': holes['features']}


def hole_with_route(key='test-course-01', ordinal=1, route_xy=((604020.0, 4656700.0), (604280.0, 4656700.0)),
                     tee_center=(604020.0, 4656700.0), green_center=(604280.0, 4656700.0), extra_feature_ids=()):
    route_ring = [utm_to_wgs84(x, y) for x, y in route_xy]
    tee_poly = box(tee_center[0] - 6, tee_center[1] - 6, tee_center[0] + 6, tee_center[1] + 6)
    green_poly = box(green_center[0] - 8, green_center[1] - 8, green_center[0] + 8, green_center[1] + 8)
    tee_ring = [utm_to_wgs84(x, y) for x, y in tee_poly.exterior.coords]
    green_ring = [utm_to_wgs84(x, y) for x, y in green_poly.exterior.coords]
    route_id, tee_id, green_id = f'{key}-route', f'{key}-tee', f'{key}-green'
    features = [
        {'id': route_id, 'kind': 'route', 'holeKeys': [key], 'geometryWgs84': {'type': 'LineString', 'coordinates': route_ring}},
        {'id': tee_id, 'kind': 'tee', 'holeKeys': [key], 'geometryWgs84': {'type': 'Polygon', 'coordinates': [tee_ring]}},
        {'id': green_id, 'kind': 'green', 'holeKeys': [key], 'geometryWgs84': {'type': 'Polygon', 'coordinates': [green_ring]}},
    ]
    hole = {'key': key, 'ordinal': ordinal, 'featureIds': [route_id, tee_id, green_id, *extra_feature_ids],
            'routeFeatureId': route_id, 'greenFeatureId': green_id}
    return hole, features


def synthetic_grid(width=150, height=100, pixel=2.0, x0=604000.0, y0_top=4656800.0):
    geotransform = (x0, pixel, 0, y0_top, 0, -pixel)
    return geotransform, width, height


def make_rasters(ndvi_value, texture_noise_std, dem_flat=True, seed=1):
    geotransform, width, height = synthetic_grid()
    rng = np.random.default_rng(seed)
    ndvi = np.full((height, width), ndvi_value) + rng.normal(0, texture_noise_std, (height, width))
    # Reconstruct plausible red/nir bands from the target NDVI (nir = red * (1+ndvi)/(1-ndvi)).
    red = np.full((height, width), 900.0)
    denom = np.clip(1 - ndvi, 1e-3, None)
    nir = red * (1 + ndvi) / denom
    green = np.full((height, width), 800.0)
    blue = np.full((height, width), 700.0)
    array = np.stack([red, green, blue, nir], axis=0)
    naip = cr.Raster(array, geotransform, EPSG, [None] * 4)
    dem_array = np.zeros((1, height, width)) if dem_flat else np.random.default_rng(seed + 1).normal(0, 1, (1, height, width))
    dem = cr.Raster(dem_array, geotransform, EPSG, [None])
    return naip, dem


def make_fairway_rough_rasters(ndvi_value=0.30, seed=1):
    """A corridor with a narrow, bright, smooth fairway band along the route
    centerline (row 50) and a darker, coarser rough on either side out to the
    corridor edge -- same NDVI everywhere (so stage 1 keeps the whole
    corridor), different brightness and texture (so stage 2 should split
    fairway from rough)."""
    geotransform, width, height = synthetic_grid()
    rng = np.random.default_rng(seed)
    rows = np.arange(height).reshape(-1, 1).repeat(width, axis=1)
    dist_from_centerline_m = np.abs(rows - 50) * 2.0
    fairway_band = dist_from_centerline_m <= 10.0

    red = np.where(fairway_band, 1000.0, 650.0) + np.where(
        fairway_band, rng.normal(0, 3, (height, width)), rng.normal(0, 90, (height, width)))
    ndvi = np.full((height, width), ndvi_value)
    denom = np.clip(1 - ndvi, 1e-3, None)
    nir = red * (1 + ndvi) / denom
    green = red * 0.9
    blue = red * 0.8
    array = np.stack([red, green, blue, nir], axis=0)
    naip = cr.Raster(array, geotransform, EPSG, [None] * 4)
    dem = cr.Raster(np.zeros((1, height, width)), geotransform, EPSG, [None])
    return naip, dem, fairway_band


def make_row_striped_rasters(ndvi_value, amplitude):
    """NDVI alternating +/-`amplitude` every row: a deterministic stand-in
    for mowing-stripe/crown-edge texture. `local_std` over a 5-row window
    reads back ~`amplitude` at every pixel (unlike i.i.d. per-pixel noise,
    which speckles rather than blocks and gets erased by the corridor's
    morphological opening regardless of what the lidar boost does)."""
    geotransform, width, height = synthetic_grid()
    rows = np.arange(height).reshape(-1, 1).repeat(width, axis=1)
    ndvi = ndvi_value + amplitude * np.where(rows % 2 == 0, 1.0, -1.0)
    red = np.full((height, width), 900.0)
    denom = np.clip(1 - ndvi, 1e-3, None)
    nir = red * (1 + ndvi) / denom
    green = np.full((height, width), 800.0)
    blue = np.full((height, width), 700.0)
    array = np.stack([red, green, blue, nir], axis=0)
    naip = cr.Raster(array, geotransform, EPSG, [None] * 4)
    dem = cr.Raster(np.zeros((1, height, width)), geotransform, EPSG, [None])
    return naip, dem


def make_chm(value, shape=(100, 150)):
    """A single-band lidar CHM raster of one uniform height value (meters),
    on the same synthetic grid as `make_rasters`."""
    geotransform = synthetic_grid()[0]
    array = np.full((1,) + shape, value, dtype=np.float64)
    return cr.Raster(array, geotransform, EPSG, [dst.CHM_NODATA])


def write_geotiff(path, array, geotransform, epsg, nodata=None):
    from osgeo import gdal, osr
    height, width = array.shape
    ds = gdal.GetDriverByName('GTiff').Create(str(path), width, height, 1, gdal.GDT_Float32)
    ds.SetGeoTransform(geotransform)
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(epsg)
    ds.SetProjection(srs.ExportToWkt())
    band = ds.GetRasterBand(1)
    if nodata is not None:
        band.SetNoDataValue(nodata)
    band.WriteArray(array.astype('float32'))
    ds = None


OPTIONS = dict(dst.DEFAULTS)


class MissingKindsTests(unittest.TestCase):
    def test_default_target_holes_only_lists_holes_missing_a_traceable_kind(self):
        hole, features = hole_with_route()
        complete_hole = dict(hole, key='test-course-02', ordinal=2, featureIds=hole['featureIds'] + ['test-course-02-fairway'])
        features_all = features + [{'id': 'test-course-02-fairway', 'kind': 'fairway', 'holeKeys': ['test-course-02'],
                                    'geometryWgs84': {'type': 'Polygon', 'coordinates': [[[0, 0], [0, 0.0001], [0.0001, 0.0001], [0.0001, 0], [0, 0]]]}}]
        package = make_package({'holes': [hole, complete_hole], 'features': features_all})
        self.assertEqual(dst.default_target_holes(package), [1])
        self.assertEqual(dst.missing_kinds(package, hole), ['fairway'])
        self.assertEqual(dst.missing_kinds(package, complete_hole), [])


class ScoringTests(unittest.TestCase):
    def test_turf_score_peaks_mid_band_and_falls_off_at_the_edges(self):
        ndvi = np.array([0.10, 0.30, 0.50, 0.80])
        texture = np.zeros_like(ndvi)
        score = dst.turf_score(ndvi, texture, 0.05, 0.55, 0.12)
        self.assertAlmostEqual(score[1], 1.0)
        self.assertLess(score[0], score[1])
        self.assertLess(score[2], score[1])
        self.assertEqual(score[3], 0.0)

    def test_turf_score_is_zeroed_by_high_local_texture_even_at_ideal_ndvi(self):
        ndvi = np.full(3, 0.30)
        texture = np.array([0.0, 0.06, 0.20])
        score = dst.turf_score(ndvi, texture, 0.05, 0.55, 0.12)
        self.assertGreater(score[0], score[1])
        self.assertEqual(score[2], 0.0)

    def test_corridor_mask_matches_a_manual_buffer_containment_check(self):
        geotransform, width, height = synthetic_grid()
        naip = cr.Raster(np.zeros((4, height, width)), geotransform, EPSG, [None] * 4)
        xs, ys = naip.xy_grid()
        route_xy = [(604020.0, 4656700.0), (604280.0, 4656700.0)]
        mask = dst.corridor_mask(xs, ys, route_xy, 20.0)
        # A point known to be within 20m of the line, and one known to be far outside it.
        self.assertTrue(mask[50, 40])   # row 50 is the centerline; well inside the corridor
        self.assertFalse(mask[0, 0])    # top-left corner is ~150m away


class SegmentationTests(unittest.TestCase):
    def test_uniform_turf_corridor_yields_a_high_confidence_trace_matching_the_true_corridor(self):
        hole, features = hole_with_route()
        package = make_package({'holes': [hole], 'features': features})
        naip, dem = make_rasters(ndvi_value=0.30, texture_noise_std=0.005)
        options = dict(OPTIONS, corridor_m=18.0, expected_width_m=32.0)
        trace, evidence = dst.build_trace(package, hole, naip, dem, EPSG, options)
        self.assertIsNotNone(trace, evidence)
        self.assertEqual(trace['kind'], 'fairway')
        self.assertEqual(trace['producer'], dst.PRODUCER)
        self.assertGreaterEqual(trace['confidence'], options['confidence_min'])
        self.assertGreaterEqual(evidence['routeOverlapMeters'], dst.ROUTE_OVERLAP_MIN_M)
        # The traced polygon should closely match the true 36m-wide corridor, minus the tee/green squares.
        true_corridor = box(604020.0, 4656682.0, 604280.0, 4656718.0)
        true_corridor = true_corridor.difference(box(604014.0, 4656694.0, 604026.0, 4656706.0))
        true_corridor = true_corridor.difference(box(604272.0, 4656692.0, 604288.0, 4656708.0))
        traced = cr.wgs84_to_epsg(cr.to_shapely({'type': 'Polygon', 'coordinates': [trace['coordinatesWgs84']]}), EPSG)
        self.assertGreater(cr.iou(traced, true_corridor), 0.80)

    def test_forest_everywhere_yields_no_candidate_and_is_reported(self):
        hole, features = hole_with_route()
        package = make_package({'holes': [hole], 'features': features})
        # High-texture canopy noise well past `texture_max`, everywhere: nothing should classify as turf.
        naip, dem = make_rasters(ndvi_value=0.75, texture_noise_std=0.6)
        trace, evidence = dst.build_trace(package, hole, naip, dem, EPSG, OPTIONS)
        self.assertIsNone(trace)
        self.assertEqual(evidence['reason'], 'no_connected_candidate_touching_route')

    def test_a_weak_but_present_candidate_is_refused_below_the_confidence_floor(self):
        hole, features = hole_with_route()
        package = make_package({'holes': [hole], 'features': features})
        naip, dem = make_rasters(ndvi_value=0.30, texture_noise_std=0.005)
        options = dict(OPTIONS, corridor_m=18.0, expected_width_m=32.0, confidence_min=0.999)
        trace, evidence = dst.build_trace(package, hole, naip, dem, EPSG, options)
        self.assertIsNone(trace)
        self.assertEqual(evidence['reason'], 'confidence_below_threshold')
        self.assertLess(evidence['confidence'], options['confidence_min'])

    def test_fairway_rough_split_narrows_the_trace_to_the_bright_smooth_band(self):
        hole, features = hole_with_route()
        package = make_package({'holes': [hole], 'features': features})
        naip, dem, fairway_band = make_fairway_rough_rasters()
        options = dict(OPTIONS, corridor_m=30.0, expected_width_m=32.0, decay_m=0.0)
        trace, evidence = dst.build_trace(package, hole, naip, dem, EPSG, options)
        self.assertIsNotNone(trace, evidence)
        self.assertTrue(evidence['fairwayRoughSplit']['otsuAccepted'], evidence['fairwayRoughSplit'])
        # The true fairway band is 20m wide (rows within 10m of the centerline) inside a
        # 60m-wide corridor; the split should land much closer to the narrow band's area
        # than to the full corridor's.
        true_fairway_area = fairway_band.sum() * (2.0 ** 2)
        traced = cr.wgs84_to_epsg(cr.to_shapely({'type': 'Polygon', 'coordinates': [trace['coordinatesWgs84']]}), EPSG)
        self.assertLess(traced.area, true_fairway_area * 2.5)

    def test_run_reports_every_requested_hole_including_those_not_missing_a_fairway(self):
        hole, features = hole_with_route()
        complete_key = 'test-course-02'
        complete_hole = dict(hole, key=complete_key, ordinal=2,
                              featureIds=hole['featureIds'] + [f'{complete_key}-fairway'],
                              routeFeatureId=hole['routeFeatureId'], greenFeatureId=hole['greenFeatureId'])
        fairway_feature = {'id': f'{complete_key}-fairway', 'kind': 'fairway', 'holeKeys': [complete_key],
                            'geometryWgs84': {'type': 'Polygon', 'coordinates': [[[0, 0], [0, 0.0001], [0.0001, 0.0001], [0.0001, 0], [0, 0]]]}}
        package = make_package({'holes': [hole, complete_hole], 'features': features + [fairway_feature]})
        naip, dem = make_rasters(ndvi_value=0.30, texture_noise_std=0.005)
        options = dict(OPTIONS, corridor_m=18.0, expected_width_m=32.0)
        features_out, report, epsg = dst.run(package, [1, 2, 99], naip, dem, options)
        self.assertEqual(epsg, EPSG)
        decisions = {row['ordinal']: row['decision'] for row in report}
        self.assertEqual(decisions[1], 'written')
        self.assertEqual(decisions[2], 'skipped_fairway_already_present')
        self.assertEqual(decisions[99], 'skipped_unknown_hole')
        self.assertEqual(len(features_out), 1)


class LidarSignalTests(unittest.TestCase):
    """`--lidar-chm`: a CHM below `chm_turf_max_m` (inside the plausible NDVI
    band) strengthens the turf candidate; a CHM at/above `chm_tree_min_m`
    excludes outright; too little coverage of the hole's corridor is ignored
    and the trace falls back to NAIP alone, by name."""

    def test_high_chm_excludes_trees_regardless_of_ndvi_texture(self):
        hole, features = hole_with_route()
        package = make_package({'holes': [hole], 'features': features})
        naip, dem = make_rasters(ndvi_value=0.30, texture_noise_std=0.005)
        options = dict(OPTIONS, corridor_m=18.0, expected_width_m=32.0)
        baseline, _ = dst.build_trace(package, hole, naip, dem, EPSG, options)
        self.assertIsNotNone(baseline, 'sanity: this corridor traces fine without lidar')
        chm = make_chm(5.0)  # trees over the whole export
        traced, evidence = dst.build_trace(package, hole, naip, dem, EPSG, options, chm=chm)
        self.assertIsNone(traced)
        self.assertTrue(evidence['lidar']['used'], evidence['lidar'])
        self.assertGreater(evidence['lidar']['treePixels'], 0)
        self.assertEqual(evidence['reason'], 'no_connected_candidate_touching_route')

    def test_low_chm_confirms_turf_and_rescues_a_texture_degraded_corridor(self):
        hole, features = hole_with_route()
        package = make_package({'holes': [hole], 'features': features})
        # Row-alternating NDVI (+/- 0.15 around a mid-band 0.5) with a tight
        # texture_max override (0.1): local texture reads ~0.12-0.15, past
        # that override everywhere, zeroing the NAIP-only turf score -- no
        # candidate at all without lidar. Lidar only ever substitutes for the
        # texture term (see _lidar_evidence), never the NDVI band term, so
        # the rescued trace's confidence still comes from real NDVI-band
        # evidence (~0.5, mid-band) and DEM smoothness, not a flat constant.
        naip, dem = make_row_striped_rasters(ndvi_value=0.5, amplitude=0.15)
        options = dict(OPTIONS, corridor_m=18.0, expected_width_m=32.0, texture_max=0.1)
        baseline, baseline_evidence = dst.build_trace(package, hole, naip, dem, EPSG, options)
        self.assertIsNone(baseline, baseline_evidence)
        chm = make_chm(0.3)  # open turf height, covering the whole export
        traced, evidence = dst.build_trace(package, hole, naip, dem, EPSG, options, chm=chm)
        self.assertIsNotNone(traced, evidence)
        self.assertTrue(evidence['lidar']['used'], evidence['lidar'])
        self.assertEqual(traced['evidenceSource'], 'lidar_chm+naip')
        self.assertGreaterEqual(traced['confidence'], options['confidence_min'])

        # Same texture degradation and the same lidar coverage, but NDVI
        # sitting near the band edge instead of mid-band (a road or bare
        # dirt reads this way too): the rescue must NOT fire the same way --
        # confidence tracks the real NDVI band position, not the lidar
        # boost, so this stays without a usable candidate.
        naip_edge, dem_edge = make_row_striped_rasters(ndvi_value=0.2, amplitude=0.15)
        edge_traced, edge_evidence = dst.build_trace(package, hole, naip_edge, dem_edge, EPSG, options, chm=chm)
        self.assertIsNone(edge_traced, edge_evidence)
        self.assertTrue(edge_evidence['lidar']['used'], edge_evidence['lidar'])

    def test_partial_lidar_coverage_is_ignored_and_falls_back_to_naip_alone(self):
        hole, features = hole_with_route()
        package = make_package({'holes': [hole], 'features': features})
        naip, dem = make_rasters(ndvi_value=0.30, texture_noise_std=0.005)
        options = dict(OPTIONS, corridor_m=18.0, expected_width_m=32.0)
        baseline, _ = dst.build_trace(package, hole, naip, dem, EPSG, options)
        chm = make_chm(dst.CHM_NODATA)  # no returns anywhere
        traced, evidence = dst.build_trace(package, hole, naip, dem, EPSG, options, chm=chm)
        self.assertFalse(evidence['lidar']['used'])
        self.assertIn('LIDAR_COVERAGE_PARTIAL', evidence['lidar']['reason'])
        self.assertEqual(traced['confidence'], baseline['confidence'])
        self.assertEqual(traced['evidenceSource'], 'naip')

    def test_off_band_ndvi_is_never_force_admitted_by_a_low_chm_alone(self):
        """A road or bare ground reads as low CHM too; the confirmation is
        gated on the NDVI turf band, so it never admits either on height
        alone -- neither past the high edge (over-saturated vegetation
        reading) nor a real road/bare-dirt NDVI near/under the low edge."""
        hole, features = hole_with_route()
        package = make_package({'holes': [hole], 'features': features})
        chm = make_chm(0.3)

        naip, dem = make_rasters(ndvi_value=0.98, texture_noise_std=0.005)  # far outside [ndvi_min, ndvi_max]
        options = dict(OPTIONS, corridor_m=18.0, expected_width_m=32.0)
        traced, evidence = dst.build_trace(package, hole, naip, dem, EPSG, options, chm=chm)
        self.assertIsNone(traced, evidence)
        self.assertEqual(evidence['lidar']['turfConfirmedPixels'], 0)

        road_naip, road_dem = make_rasters(ndvi_value=0.03, texture_noise_std=0.005)  # pavement/bare-dirt-range NDVI
        road_traced, road_evidence = dst.build_trace(package, hole, road_naip, road_dem, EPSG, options, chm=chm)
        self.assertIsNone(road_traced, road_evidence)
        self.assertEqual(road_evidence['lidar']['turfConfirmedPixels'], 0)

    def test_a_chm_grid_that_does_not_match_the_imagery_is_ignored_not_crashed(self):
        hole, features = hole_with_route()
        package = make_package({'holes': [hole], 'features': features})
        naip, dem = make_rasters(ndvi_value=0.30, texture_noise_std=0.005)
        options = dict(OPTIONS, corridor_m=18.0, expected_width_m=32.0)
        mismatched = cr.Raster(np.zeros((1, 5, 5)), synthetic_grid()[0], EPSG, [dst.CHM_NODATA])
        traced, evidence = dst.build_trace(package, hole, naip, dem, EPSG, options, chm=mismatched)
        self.assertIsNotNone(traced)
        self.assertFalse(evidence['lidar']['used'])
        self.assertIn('does not match', evidence['lidar']['reason'])
        self.assertEqual(traced['evidenceSource'], 'naip')


class LoadLidarChmTests(unittest.TestCase):
    """`load_lidar_chm`: reads and validates a fetch-lidar-chm.py output
    directory the way derive-canopy-naip.py's `load_lidar` does -- an
    export/hash mismatch is an error, never silently NAIP."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='surface-trace-lidar-')
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.geotransform, self.width, self.height = synthetic_grid()
        self.naip = cr.Raster(np.zeros((4, self.height, self.width)), self.geotransform, EPSG, [None] * 4)
        self.terrain_source = os.path.join(self.tmp, 'terrain')
        os.makedirs(self.terrain_source)
        self.export_path = os.path.join(self.terrain_source, 'export.json')
        with open(self.export_path, 'w', encoding='utf-8') as f:
            f.write('{"extent": {}, "width": 1, "height": 1}')

    def _chm_dir(self, status='covered', bad_hash=False, mismatched_export=False):
        directory = os.path.join(self.tmp, 'lidar')
        os.makedirs(directory, exist_ok=True)
        with open(self.export_path, 'rb') as f:
            export_sha = hashlib.sha256(f.read()).hexdigest()
        manifest = {'status': status, 'terrainExportSha256': 'x' * 64 if mismatched_export else export_sha}
        if status == 'covered':
            chm_path = os.path.join(directory, 'chm.tif')
            write_geotiff(chm_path, np.full((self.height, self.width), 0.5), self.geotransform, EPSG, nodata=dst.CHM_NODATA)
            with open(chm_path, 'rb') as f:
                actual_sha = hashlib.sha256(f.read()).hexdigest()
            manifest['chmSha256'] = ('bad' * 20) if bad_hash else actual_sha
            manifest['project'] = {'name': 'TEST_2020', 'acquisitionYearInferred': 2020}
        with open(os.path.join(directory, 'manifest.json'), 'w', encoding='utf-8') as f:
            json.dump(manifest, f)
        return directory

    def test_no_directory_means_naip_alone(self):
        chm, meta = dst.load_lidar_chm(None, self.terrain_source, self.naip, EPSG)
        self.assertIsNone(chm)
        self.assertEqual(meta['kind'], 'naip')

    def test_no_coverage_status_means_naip_alone(self):
        directory = self._chm_dir(status='no_coverage')
        chm, meta = dst.load_lidar_chm(directory, self.terrain_source, self.naip, EPSG)
        self.assertIsNone(chm)
        self.assertEqual(meta['kind'], 'naip')
        self.assertIn('LIDAR_NO_COVERAGE', meta['reason'])

    def test_export_mismatch_raises(self):
        directory = self._chm_dir(mismatched_export=True)
        with self.assertRaises(ValueError):
            dst.load_lidar_chm(directory, self.terrain_source, self.naip, EPSG)

    def test_chm_hash_mismatch_raises(self):
        directory = self._chm_dir(bad_hash=True)
        with self.assertRaises(ValueError):
            dst.load_lidar_chm(directory, self.terrain_source, self.naip, EPSG)

    def test_covered_returns_a_warped_raster_on_the_naip_grid(self):
        directory = self._chm_dir(status='covered')
        chm, meta = dst.load_lidar_chm(directory, self.terrain_source, self.naip, EPSG)
        self.assertEqual(meta['kind'], 'lidar_chm+naip')
        self.assertEqual(chm.shape, self.naip.shape)
        self.assertAlmostEqual(float(chm.array[0].mean()), 0.5, places=1)


if __name__ == '__main__':
    unittest.main()

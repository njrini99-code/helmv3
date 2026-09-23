"""Synthetic-data tests for `derive-surface-traces.py`: the missing-fairway
detector, the per-pixel turf/smoothness scoring, and the full segmentation
against a hand-built corridor where the right answer is known."""
import importlib.util
import os
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


if __name__ == '__main__':
    unittest.main()

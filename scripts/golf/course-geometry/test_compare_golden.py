"""compare-golden.py on synthetic packages: hole matching by ordinal (not
key), per-class IoU in the golden's own local frame, the linear 'route'
class never entering the IoU gate, and the pass/fail/exception wiring."""
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))


def load():
    spec = importlib.util.spec_from_file_location('compare_golden', os.path.join(HERE, 'compare-golden.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cg = load()

ORIGIN = [-79.744, 42.06]


def square(cx, cy, half, project_back):
    """A small square centered on local metres (cx, cy), reprojected back to
    WGS84 lon/lat so it round-trips through the same aeqd frame the tool
    itself will build from `originWgs84`."""
    ring = [(cx - half, cy - half), (cx + half, cy - half), (cx + half, cy + half), (cx - half, cy + half), (cx - half, cy - half)]
    return {'type': 'Polygon', 'coordinates': [[list(project_back(x, y)) for x, y in ring]]}


def package(features_by_hole, origin=ORIGIN):
    """features_by_hole: {ordinal: [(kind, geometryWgs84), ...]}"""
    import pyproj
    unproject = pyproj.Transformer.from_crs(f'+proj=aeqd +lat_0={origin[1]} +lon_0={origin[0]} +units=m +datum=WGS84', 'EPSG:4326', always_xy=True).transform
    features, holes = [], []
    fid = 0
    for ordinal, entries in features_by_hole.items():
        feature_ids = []
        for kind, builder in entries:
            fid += 1
            fkey = f'f{fid}'
            features.append({'id': fkey, 'kind': kind, 'geometryWgs84': builder(unproject)})
            feature_ids.append(fkey)
        holes.append({'ordinal': ordinal, 'key': f'hole-{ordinal:02}', 'featureIds': feature_ids})
    return {'contentHash': 'test', 'originWgs84': origin, 'holes': holes, 'features': features}


class HoleMatchingTests(unittest.TestCase):
    def test_holes_match_by_ordinal_even_when_keys_differ(self):
        golden = package({1: [('fairway', lambda p: square(0, 0, 10, p))]})
        candidate = package({1: [('fairway', lambda p: square(0, 0, 10, p))]})
        candidate['holes'][0]['key'] = 'totally-different-key'
        reports, failures = cg.compare_holes(candidate, golden, cg.projector(golden['originWgs84']), cg.DEFAULT_IOU_FLOOR, set())
        self.assertEqual(failures, [])
        self.assertEqual(reports[0]['classes']['fairway']['iou'], 1.0)


class IoUTests(unittest.TestCase):
    def test_identical_polygons_score_1(self):
        golden = package({1: [('fairway', lambda p: square(0, 0, 20, p))]})
        candidate = package({1: [('fairway', lambda p: square(0, 0, 20, p))]})
        _reports, failures = cg.compare_holes(candidate, golden, cg.projector(golden['originWgs84']), 0.85, set())
        self.assertEqual(failures, [])

    def test_disjoint_polygons_score_0_and_fail(self):
        golden = package({1: [('fairway', lambda p: square(0, 0, 20, p))]})
        candidate = package({1: [('fairway', lambda p: square(1000, 1000, 20, p))]})
        reports, failures = cg.compare_holes(candidate, golden, cg.projector(golden['originWgs84']), 0.85, set())
        self.assertEqual(len(failures), 1)
        self.assertEqual(failures[0]['class'], 'fairway')
        self.assertEqual(reports[0]['classes']['fairway']['iou'], 0.0)

    def test_a_missing_candidate_feature_is_reported_not_crashed(self):
        golden = package({1: [('fairway', lambda p: square(0, 0, 20, p))]})
        candidate = package({1: []})
        reports, failures = cg.compare_holes(candidate, golden, cg.projector(golden['originWgs84']), 0.85, set())
        self.assertEqual(len(failures), 1)
        self.assertIsNone(reports[0]['classes']['fairway']['iou'])
        self.assertEqual(reports[0]['classes']['fairway']['candidateCount'], 0)

    def test_documented_exception_suppresses_the_failure(self):
        golden = package({1: [('fairway', lambda p: square(0, 0, 20, p))]})
        candidate = package({1: []})
        _reports, failures = cg.compare_holes(candidate, golden, cg.projector(golden['originWgs84']), 0.85, {'hole-01:fairway'})
        self.assertEqual(failures, [])

    def test_route_is_never_iou_gated(self):
        golden = package({1: [('route', lambda p: {'type': 'Polygon', 'coordinates': [[list(p(0, 0)), list(p(0, 1)), list(p(1, 1)), list(p(0, 0))]]})]})
        # The 'route' kind has no area gate at all, regardless of its geometry:
        # even a present-but-different route never appears in `failures`.
        candidate = package({1: [('route', lambda p: {'type': 'Polygon', 'coordinates': [[list(p(50, 50)), list(p(50, 51)), list(p(51, 51)), list(p(50, 50))]]})]})
        reports, failures = cg.compare_holes(candidate, golden, cg.projector(golden['originWgs84']), 0.85, set())
        self.assertEqual(failures, [])
        self.assertNotIn('iou', reports[0]['classes']['route'])

    def test_a_shared_projection_catches_an_origin_drift(self):
        # The candidate's own package carries a different origin; comparing
        # in the golden's frame must still measure the true overlap, not
        # silently pass because each side used its own local frame.
        golden = package({1: [('fairway', lambda p: square(0, 0, 20, p))]}, origin=ORIGIN)
        drifted_origin = [ORIGIN[0] + 0.01, ORIGIN[1]]
        candidate = package({1: [('fairway', lambda p: square(0, 0, 20, p))]}, origin=drifted_origin)
        reports, failures = cg.compare_holes(candidate, golden, cg.projector(golden['originWgs84']), 0.85, set())
        self.assertEqual(len(failures), 1)
        self.assertLess(reports[0]['classes']['fairway']['iou'], 0.85)


class ReportTests(unittest.TestCase):
    def test_terrain_report_compares_the_elevation_raster_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            golden_path = Path(tmp) / 'golden-manifest.json'
            cand_path = Path(tmp) / 'cand-manifest.json'
            golden_path.write_text(json.dumps({'fileHashes': {'elevation.tiff': 'ce26e9ad'}, 'selectedTitle': 'NY SW East 2017'}))
            cand_path.write_text(json.dumps({'fileHashes': {'elevation.tiff': 'ce26e9ad'}, 'selectedTitle': 'NY SW East 2017'}))
            report = cg.terrain_report(cand_path, golden_path)
            self.assertTrue(report['match'])

    def test_terrain_report_flags_a_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            golden_path = Path(tmp) / 'golden-manifest.json'
            cand_path = Path(tmp) / 'cand-manifest.json'
            golden_path.write_text(json.dumps({'fileHashes': {'elevation.tiff': 'ce26e9ad'}}))
            cand_path.write_text(json.dumps({'fileHashes': {'elevation.tiff': 'deadbeef'}}))
            report = cg.terrain_report(cand_path, golden_path)
            self.assertFalse(report['match'])

    def test_canopy_report_counts_groups(self):
        with tempfile.TemporaryDirectory() as tmp:
            golden_path = Path(tmp) / 'golden-canopy.json'
            cand_path = Path(tmp) / 'cand-canopy.json'
            golden_path.write_text(json.dumps({'regions': [{}] * 144, 'source': 'FPAC'}))
            cand_path.write_text(json.dumps({'regions': [{}] * 56, 'source': 'NAIP Plus'}))
            report = cg.canopy_report(cand_path, golden_path)
            self.assertEqual((report['candidateGroups'], report['goldenGroups']), (56, 144))


if __name__ == '__main__':
    unittest.main()

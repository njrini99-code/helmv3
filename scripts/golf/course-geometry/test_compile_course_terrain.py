"""Bounded analytic regression tests; no network or production data required."""
import gzip
import hashlib
import importlib.util
import json
import math
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from shapely.geometry import MultiPolygon, Polygon, box

spec = importlib.util.spec_from_file_location('compiler', Path(__file__).with_name('compile-course-terrain.py'))
compiler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compiler)


class PlaneSource:
    manifest = {'selectedTitle': 'Analytic fixture', 'sourceUrl': 'https://example.invalid/source',
                'selectedObjectId': 1, 'acquisitionStart': '2021-01-01', 'acquisitionEnd': '2021-01-01',
                'retrievedAt': '2026-09-13', 'licenseUrl': 'https://example.invalid/license',
                'fileHashes': {'elevation.tiff': '0'*64}, 'horizontalExportCrs': 'EPSG:32617', 'exportPixelM': [1, 1]}

    def sample(self, x, y):
        return 200 + .05*np.asarray(x) + .1*np.asarray(y)


def fixture():
    shapes = {
        'fairway': MultiPolygon([box(0, 0, 8, 12), box(0, 16, 8, 22)]),
        'green': Polygon([(-1, 24), (9, 24), (9, 34), (-1, 34)],
                         [[(2, 27), (4, 27), (4, 29), (2, 29)]]),
        'neighbor-bunker': box(14, 14, 18, 18),
    }
    features = [{'id': key, 'kind': 'bunker' if key == 'neighbor-bunker' else key, 'reviewed': True} for key in shapes]
    hole = {'key': 'analytic-hole', 'ordinal': 1, 'featureIds': ['fairway', 'green']}
    package = {'contentHash': '1'*64, 'originWgs84': [-78, 39], 'features': features, 'holes': [hole]}
    return hole, package, shapes, {f['id']: f for f in features}, \
        {f['id']: ({'id': f['id']}, shapes[f['id']]) for f in features}, \
        {f['id']: {'id': f['id'], 'boundaryDisplacementM': 0} for f in features}


class TerrainCompilerTest(unittest.TestCase):
    def test_declared_vertical_units_are_converted_without_guessing(self):
        self.assertEqual(compiler.vertical_unit_to_meters({'verticalUnitToMeters': 1}), 1)
        self.assertAlmostEqual(compiler.vertical_unit_to_meters({'verticalUnitToMeters': compiler.US_SURVEY_FOOT_TO_METERS}),
                               compiler.US_SURVEY_FOOT_TO_METERS)
        self.assertEqual(compiler.vertical_unit_to_meters({'selectedTitle': 'USGS 1 Meter legacy cache'}), 1)
        with self.assertRaisesRegex(ValueError, 'omits verticalUnitToMeters'):
            compiler.vertical_unit_to_meters({'selectedTitle': 'Unidentified raster'})

    @classmethod
    def setUpClass(cls):
        args = fixture()
        with patch.object(compiler, 'CONTEXT_MARGIN_M', 16):
            cls.fine, cls.report = compiler.compile_hole(*args, PlaneSource(), outer_step=16)
            cls.coarse, _ = compiler.compile_hole(*args, PlaneSource(), outer_step=32)
        cls.shapes = args[2]

    def test_metric_grid_is_independent_of_display_lod_and_row_order_is_northward(self):
        self.assertEqual(self.fine['metricGrid'], self.coarse['metricGrid'])
        grid = self.fine['metricGrid']
        self.assertAlmostEqual(grid['heightsM'][grid['columns']]-grid['heightsM'][0], .1*grid['spacingM'])
        self.assertAlmostEqual(grid['heightsM'][1]-grid['heightsM'][0], .05*grid['spacingM'])

    def test_source_normals_use_real_elevation_and_match_on_every_duplicate(self):
        expected = np.array([-.05, -.1, 1])/math.sqrt(1+.05**2+.1**2)
        actual = np.array(self.fine['sourceNormals']).reshape(-1, 3)
        np.testing.assert_allclose(actual, np.broadcast_to(expected, actual.shape), atol=1e-7)
        self.assertTrue(self.report['sourceNormalDuplicatesAgree'])
        self.assertTrue(self.report['sourceHeightDuplicatesAgree'])
        self.assertGreater(self.report['duplicateVertexCount'], 0)
        altered = list(self.fine['sourceNormals'])
        vertices = self.fine['vertices']
        first = tuple(vertices[:2])
        duplicate = next(i for i in range(3, len(vertices), 3) if tuple(vertices[i:i+2]) == first)
        altered[duplicate] += .01
        self.assertFalse(compiler.duplicate_vertex_report(vertices, altered)['sourceNormalDuplicatesAgree'])

    def test_polygon_cutouts_and_disconnected_fairways_survive_material_tessellation(self):
        vertices = self.fine['vertices']
        for i, feature_index in enumerate(self.fine['triangleFeatures']):
            key = self.fine['featureIds'][feature_index]
            if key not in ('green', 'fairway'):
                continue
            points = [vertices[i*9+j:i*9+j+2] for j in (0, 3, 6)]
            self.assertLess(Polygon(points).difference(self.shapes[key].buffer(.00001)).area, 1e-7)
        by_id = {f['id']: f for f in self.report['features']}
        self.assertAlmostEqual(by_id['green']['areaM2'], self.shapes['green'].area, places=4)
        self.assertAlmostEqual(by_id['fairway']['areaM2'], self.shapes['fairway'].area, places=4)

    def test_collinear_sliver_parts_cannot_inflate_a_cell_cut(self):
        # A buffer/difference chain left this near-zero collinear part in a
        # real surround band; GEOS's float overlay returned the entire 2m cell
        # for it, breaking area conservation by exactly the cell area.
        sliver = Polygon([(-1096.314791213845, 1097.1947286982538), (-1097.7095688360787, 1096.8884820883118),
                          (-1095.8691370968295, 1097.2925794669836)])
        self.assertLess(sliver.area, 1e-9)
        band = box(-1100, 1090, -1090, 1091)
        region = MultiPolygon([band, sliver])
        cell = box(-1096, 1096, -1094, 1098)
        bogus = region.intersection(cell)
        self.assertGreater(bogus.area, 1)  # the GEOS behaviour being guarded against
        self.assertTrue(compiler.parts_inside_region(region, bogus).is_empty)
        genuine = region.intersection(box(-1095, 1089, -1093, 1092))
        self.assertIs(compiler.parts_inside_region(region, genuine), genuine)
        self.assertAlmostEqual(genuine.area, 2)

    def test_context_uses_existing_features_without_synthesizing_missing_tee_or_trees(self):
        self.assertEqual(self.fine['contextFeatureIds'], ['neighbor-bunker'])
        self.assertEqual(self.fine['renderProfile']['teeGeometry'], 'missing')
        self.assertEqual(self.fine['renderProfile']['treeEvidence'], 'none')
        self.assertNotIn('tee', self.fine['featureKinds'])
        self.assertNotIn('woods', self.fine['featureKinds'])
        self.assertAlmostEqual(self.report['contextAreaM2'], self.report['triangulatedAreaM2'], places=3)

    def test_local_enu_round_trip_uses_existing_package_projection(self):
        with patch.object(compiler.pilot, 'ORIGIN', [-78.303, 39.051]):
            for original in [(-1000, -1000), (0, 0), (500, -600), (1500, 1500)]:
                lon, lat = compiler.geographic(*original)
                actual = compiler.pilot.local([float(lon), float(lat)])
                np.testing.assert_allclose(actual, original, atol=.00001)

    def test_native_bilinear_support_never_substitutes_zero_for_nodata(self):
        source = compiler.ElevationSource.__new__(compiler.ElevationSource)
        source.extent = {'xmin': 0, 'xmax': 3, 'ymin': 0, 'ymax': 3}
        source.raster = np.array([[0., 2., 4.], [3., 5., 7.], [6., 8., 10.]])
        class IdentityProjection:
            def transform(self, x, y):
                return x, y
        source.project = IdentityProjection()
        with patch.object(compiler, 'geographic', lambda x, y: (x, y)):
            self.assertEqual(float(source.sample(.5, 2.5)), 0.)
            self.assertEqual(float(source.sample(1., 2.)), 2.5)
            source.raster[1, 1] = np.nan
            self.assertTrue(math.isnan(float(source.sample(1., 2.))))
            self.assertTrue(math.isnan(float(source.sample(-1., 2.))))

    def test_elevation_source_converts_declared_us_survey_feet_before_sampling(self):
        with tempfile.TemporaryDirectory() as directory:
            source_dir = Path(directory)
            from PIL import Image
            Image.fromarray(np.array([[0., 10., 20.], [10., 20., 30.], [20., 30., 40.]], dtype=np.float32)).save(source_dir/'elevation.tiff')
            (source_dir/'export.json').write_text(json.dumps({'width': 3, 'height': 3,
                                                               'extent': {'xmin': 0, 'xmax': 3, 'ymin': 0, 'ymax': 3}}))
            source = compiler.ElevationSource(source_dir, {'horizontalExportCrs': 'EPSG:4326',
                                                            'verticalUnitToMeters': compiler.US_SURVEY_FOOT_TO_METERS})
            with patch.object(compiler, 'geographic', lambda x, y: (x, y)):
                self.assertAlmostEqual(float(source.sample(1., 2.)), 10 * compiler.US_SURVEY_FOOT_TO_METERS)

    def test_elevation_reader_masks_declared_nodata_and_reports_empty_fill(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'elevation.tiff'
            from PIL import Image
            image = Image.fromarray(np.array([[0., 10.], [-9999., 30.]], dtype=np.float32))
            image.save(path, tiffinfo={42113: '-9999'})
            raster, nodata, decoder = compiler.elevation_raster.read_elevation(path)
            self.assertIn(decoder, ('gdal', 'pillow'))
            self.assertEqual(nodata, -9999.)
            self.assertTrue(math.isnan(raster[1, 0]))
            self.assertEqual(raster[0, 1], 10.)
            # One NaN and one zero-fill pixel out of four.
            self.assertEqual(compiler.elevation_raster.empty_fraction(raster), 0.5)

    def test_native_1m_titles_accept_both_usgs_spellings(self):
        self.assertTrue(compiler.is_native_1m_title('USGS 1 Meter 17 x60y466 PA_WesternPA_2019_D20'))
        self.assertTrue(compiler.is_native_1m_title('USGS one meter x60y466 NY Southwest East 2017'))
        self.assertFalse(compiler.is_native_1m_title('USGS 1/3 Arc Second n43w080 20211122'))

    def test_unsupported_context_keeps_null_metrics_and_omits_mesh_faces(self):
        class PartialSource(PlaneSource):
            def sample(self, x, y):
                return np.where(np.asarray(x) > 40, np.nan, super().sample(x, y))
        with patch.object(compiler, 'CONTEXT_MARGIN_M', 16):
            mesh, report = compiler.compile_hole(*fixture(), PartialSource(), outer_step=16)
        self.assertEqual(mesh['renderProfile']['contextCoverage'], 'partial')
        self.assertGreater(report['metricNodataCells'], 0)
        self.assertGreater(report['omittedTriangles'], 0)
        self.assertGreater(report['omittedAreaM2'], 0)
        self.assertIn(None, mesh['metricGrid']['heightsM'])
        self.assertTrue(all(math.isfinite(value) for value in mesh['vertices']))
        self.assertLess(report['triangulatedAreaM2'], report['contextAreaM2'])

    def test_download_assets_are_reproducible_and_manifest_hashes_cover_actual_bytes(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            hole = {'key': 'analytic-hole', 'ordinal': 1}
            a = compiler.write_asset(Path(first), hole, self.fine)
            b = compiler.write_asset(Path(second), hole, self.fine)
            self.assertEqual(a, b)
            compressed = (Path(first)/a['fileName']).read_bytes()
            plain = gzip.decompress(compressed)
            self.assertEqual(plain, (Path(first)/'analytic-hole-terrain.json').read_bytes())
            self.assertEqual(a['compressedBytes'], len(compressed))
            self.assertEqual(a['uncompressedBytes'], len(plain))
            self.assertEqual(a['sha256'], hashlib.sha256(compressed).hexdigest())
            self.assertEqual(a['uncompressedSha256'], hashlib.sha256(plain).hexdigest())


if __name__ == '__main__':
    unittest.main()

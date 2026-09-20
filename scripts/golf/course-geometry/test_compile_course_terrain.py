"""Bounded analytic regression tests; no network or production data required."""
import gzip
import hashlib
import importlib.util
import io
import json
import math
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

import numpy as np
from shapely.geometry import LineString, MultiPolygon, Polygon, box

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
    def test_area_conservation_tolerance_is_strict_and_scale_aware(self):
        # The tolerance is only for accumulated floating-point triangle areas.
        # It is not a geometry displacement allowance: the face-cover and
        # source-boundary checks above it remain exact. Small features retain
        # the historical absolute check; a 400k m2 context mesh can absorb
        # sub-square-metre summation noise without accepting a material gap.
        self.assertEqual(compiler.area_conservation_tolerance(1000), .002)
        self.assertAlmostEqual(compiler.area_conservation_tolerance(425000), .425)
        self.assertGreater(abs(-.167573387), .002)
        self.assertLess(abs(-.167573387), compiler.area_conservation_tolerance(425000))

    def test_nc_onemap_native_grid_is_snapped_without_display_resampling(self):
        bounds, size = compiler.nc_native_grid_bounds([100.1, 200.1, 110.0, 209.4], {'xmin': 0, 'ymin': 0})
        self.assertEqual(bounds, [100.0, 200.0, 112.5, 212.5])
        self.assertEqual(size, [4, 4])

    def test_nc_onemap_service_contract_rejects_a_changed_grid_or_units(self):
        service = {'pixelType': 'F32', 'serviceDataType': 'esriImageServiceDataTypeElevation',
                   'pixelSizeX': 3.125, 'pixelSizeY': 3.125, 'spatialReference': {'wkt': 'UNIT["Foot_US",0.304800609601219]'}}
        compiler.validate_nc_onemap_service(service)
        with self.assertRaisesRegex(ValueError, 'resolution changed'):
            compiler.validate_nc_onemap_service({**service, 'pixelSizeX': 1})
        with self.assertRaisesRegex(ValueError, 'CRS'):
            compiler.validate_nc_onemap_service({**service, 'spatialReference': {'wkt': 'UNIT["metre",1]' }})

    def test_compilation_reuses_the_cached_provider_but_acquisition_cannot_switch_it(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            (source / 'source-manifest.json').write_text(json.dumps({
                'providerPolicyId': compiler.NC_ONEMAP_PROVIDER,
            }))
            self.assertEqual(
                compiler.resolve_source_provider(source, compiler.USGS_3DEP_PROVIDER),
                compiler.NC_ONEMAP_PROVIDER,
            )
            with self.assertRaisesRegex(ValueError, 'another terrain provider'):
                compiler.resolve_source_provider(source, compiler.USGS_3DEP_PROVIDER, acquire_only=True)
            self.assertEqual(
                compiler.resolve_source_provider(source / 'new', compiler.USGS_3DEP_PROVIDER),
                compiler.USGS_3DEP_PROVIDER,
            )

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
            cls.with_normals, cls.normals_report = compiler.compile_hole(*args, PlaneSource(), outer_step=16, source_normals=True)
        cls.shapes = args[2]

    def test_context_ribbons_become_breaklines_without_editing_heights(self):
        args = fixture()
        ribbon = LineString([(-6, 6), (12, 7)]).buffer(1.5, quad_segs=2)
        with patch.object(compiler, 'CONTEXT_MARGIN_M', 16):
            mesh, report = compiler.compile_hole(*args, PlaneSource(), outer_step=16, ribbons=ribbon)
        triangles = np.array(mesh['vertices']).reshape(-1, 3, 3)
        straddling = 0
        for triangle in triangles:
            poly = Polygon(triangle[:, :2])
            inside = poly.intersection(ribbon).area
            # 5-decimal vertex rounding leaves slivers of ~1e-5 m2; a real straddle is >= 1e-2 m2.
            if inside > 1e-3 and abs(inside-poly.area) > 1e-3:
                straddling += 1
        self.assertEqual(straddling, 0)
        self.assertTrue(np.allclose(triangles[:, :, 2], 200+.05*triangles[:, :, 0]+.1*triangles[:, :, 1], atol=1e-3))
        self.assertEqual(report['breaklines']['basis'], 'context_ribbons')
        self.assertGreater(report['breaklines']['ribbonAreaM2'], 0)
        self.assertGreater(report['triangles'], self.report['triangles'])
        self.assertEqual(self.report['breaklines']['basis'], 'none')

    def test_adjacent_pieces_share_every_boundary_vertex_so_the_mesh_has_no_cracks(self):
        # A rough polygon overlapping the fairway: the rough piece (rough minus
        # fairway) gets nodes where its outline crosses the fairway outline, the
        # fairway piece never sees the rough, so without global noding the two
        # sides of that shared edge carry different vertices (T-junctions).
        hole, package, shapes, features, displays, outlines = fixture()
        shapes = dict(shapes, rough=Polygon([(-5, 3), (5, -2), (13, 9), (3, 14)]))
        features['rough'] = {'id': 'rough', 'kind': 'rough', 'reviewed': True}
        package = dict(package, features=package['features']+[features['rough']])
        displays['rough'] = ({'id': 'rough'}, shapes['rough']); outlines['rough'] = {'id': 'rough', 'boundaryDisplacementM': 0}
        args = (hole, package, shapes, features, displays, outlines)
        with patch.object(compiler, 'CONTEXT_MARGIN_M', 16):
            mesh, report = compiler.compile_hole(*args, PlaneSource(), outer_step=16)
            with patch.object(compiler, 'node_pieces', lambda pieces: (pieces, {'faces': len(pieces), 'unassignedFaces': 0})):
                _, unnoded = compiler.compile_hole(*args, PlaneSource(), outer_step=16)
        self.assertGreater(unnoded['noding']['tJunctionVertices'], 0)
        self.assertEqual(report['noding']['tJunctionVertices'], 0)
        self.assertEqual(report['noding']['interiorSingleEdges'], 0)
        self.assertEqual(report['noding']['basis'], 'global_planar_arrangement')
        self.assertEqual(report['noding']['unassignedFaces'], 0)
        self.assertEqual(self.report['noding']['tJunctionVertices'], 0)
        # Materials and areas are untouched by noding: every feature still conserves its area.
        by_id = {f['id']: f for f in report['features']}
        self.assertAlmostEqual(by_id['rough']['areaM2'], shapes['rough'].difference(shapes['fairway']).difference(shapes['green']).area, places=2)
        triangles = np.array(mesh['vertices']).reshape(-1, 3, 3)
        self.assertTrue(np.allclose(triangles[:, :, 2], 200+.05*triangles[:, :, 0]+.1*triangles[:, :, 1], atol=1e-3))

    def test_metric_grid_is_independent_of_display_lod_and_row_order_is_northward(self):
        self.assertEqual(self.fine['metricGrid'], self.coarse['metricGrid'])
        grid = self.fine['metricGrid']
        self.assertAlmostEqual(grid['heightsM'][grid['columns']]-grid['heightsM'][0], .1*grid['spacingM'])
        self.assertAlmostEqual(grid['heightsM'][1]-grid['heightsM'][0], .05*grid['spacingM'])

    def test_per_vertex_source_normals_are_opt_in_because_the_renderer_shades_from_the_metric_grid(self):
        self.assertNotIn('sourceNormals', self.fine)
        self.assertEqual(self.report['sourceNormals'], 'metric_grid_slope')
        self.assertNotIn('sourceNormalDuplicatesAgree', self.report)
        self.assertTrue(self.report['sourceHeightDuplicatesAgree'])
        self.assertEqual(self.report['renderProfile']['compilerVersion'], 'course-terrain-v4')
        # The grid carries the same gradient the array would: z = 100 + .05x + .1y.
        grid = self.fine['metricGrid']
        self.assertAlmostEqual((grid['heightsM'][1]-grid['heightsM'][0])/grid['spacingM'], .05)
        self.assertAlmostEqual((grid['heightsM'][grid['columns']]-grid['heightsM'][0])/grid['spacingM'], .1)
        # Everything else about the mesh is unchanged by the flag.
        self.assertEqual(self.with_normals['vertices'], self.fine['vertices'])
        self.assertEqual(self.with_normals['triangleFeatures'], self.fine['triangleFeatures'])

    def test_source_normals_use_real_elevation_and_match_on_every_duplicate(self):
        expected = np.array([-.05, -.1, 1])/math.sqrt(1+.05**2+.1**2)
        actual = np.array(self.with_normals['sourceNormals']).reshape(-1, 3)
        np.testing.assert_allclose(actual, np.broadcast_to(expected, actual.shape), atol=1e-7)
        self.assertEqual(self.normals_report['sourceNormals'], 'per_vertex')
        self.assertTrue(self.normals_report['sourceNormalDuplicatesAgree'])
        self.assertTrue(self.normals_report['sourceHeightDuplicatesAgree'])
        self.assertGreater(self.normals_report['duplicateVertexCount'], 0)
        altered = list(self.with_normals['sourceNormals'])
        vertices = self.with_normals['vertices']
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


class AcquisitionCrsTests(unittest.TestCase):
    """The export is cut in the course's own UTM zone and the manifest says so;
    a raster already on disk keeps the CRS it was cut in."""

    def acquire(self, origin):
        requests, size = [], [48, 48]

        def fake_request(operation, values):
            requests.append((operation, values))
            if operation == 'query':
                return {'features': [{'attributes': {'OBJECTID': 7, 'Name': 'n', 'title': 'USGS 1 Meter 16 x70y422 KY_Statewide_2019_B19', 'URL': 'https://example.invalid/tile',
                                                     'StartDate': 1546300800000, 'EndDate': 1577750400000, 'Resolution_X': 1, 'VerticalDatum': 'NAVD88'},
                                      'geometry': {'rings': [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]]}}]}
            a, b, c, d = (float(v) for v in values['bbox'].split(','))
            width, height = (int(v) for v in values['size'].split(','))
            size[:] = [width, height]
            return {'width': width, 'height': height, 'href': 'https://example.invalid/export.tiff',
                    'extent': {'xmin': a, 'ymin': b, 'xmax': c, 'ymax': d, 'spatialReference': {'wkid': values['imageSR'], 'latestWkid': values['imageSR']}}}

        def fake_read(href, limit):
            from PIL import Image
            buffer = io.BytesIO()
            Image.fromarray(np.full((size[1], size[0]), 250., dtype=np.float32)).save(buffer, format='TIFF')
            return buffer.getvalue()

        pkg = {'contentHash': '2' * 64, 'originWgs84': origin, 'name': 'Zone fixture'}
        compiler.pilot.ORIGIN = origin
        with tempfile.TemporaryDirectory() as directory, patch.object(compiler.fetch, 'request', fake_request), patch.object(compiler.fetch, 'read', fake_read), \
                redirect_stdout(io.StringIO()):
            manifest = compiler.acquire_source(Path(directory), pkg, [-20, -20, 20, 20])
            export = json.loads((Path(directory) / 'export.json').read_text())
        return requests, manifest, export

    def test_a_zone_16_course_is_exported_in_utm_16n_and_the_manifest_records_it(self):
        requests, manifest, export = self.acquire([-84.6087659, 38.1162934])   # Lexington, KY
        image = next(values for operation, values in requests if operation == 'exportImage')
        self.assertEqual((image['bboxSR'], image['imageSR']), (32616, 32616))
        self.assertEqual(manifest['horizontalExportCrs'], 'EPSG:32616')
        self.assertEqual(export['sourceProjection'], 'EPSG:32616')
        self.assertEqual(export['extent']['spatialReference']['wkid'], 32616)
        # The tile query itself is geographic and does not depend on the zone.
        query = next(values for operation, values in requests if operation == 'query')
        self.assertEqual((query['inSR'], query['outSR']), (4326, 4326))

    def test_zone_17_courses_keep_the_crs_every_retained_export_was_cut_in(self):
        _requests, manifest, _export = self.acquire([-78.1467049, 39.1707734])  # Winchester, VA
        self.assertEqual(manifest['horizontalExportCrs'], 'EPSG:32617')

    def test_the_zone_is_part_of_the_source_identity(self):
        base = {'fileHashes': {'elevation.tiff': 'a'}, 'requestedLocalBoundsM': [0, 0, 1, 1]}
        self.assertNotEqual(compiler.source_identity({**base, 'horizontalExportCrs': 'EPSG:32616'}),
                            compiler.source_identity({**base, 'horizontalExportCrs': 'EPSG:32617'}))


class CourseCrsTests(unittest.TestCase):
    crs = compiler.course_crs

    def test_utm_epsg_follows_longitude_and_hemisphere(self):
        self.assertEqual(self.crs.utm_epsg(-78.3, 39.5), 32617)     # Cacapon
        self.assertEqual(self.crs.utm_epsg(-84.6, 38.1), 32616)     # Lexington
        self.assertEqual(self.crs.utm_epsg(-77.8, 34.2), 32618)     # Wilmington
        self.assertEqual(self.crs.utm_epsg(-78.0, 34.0), 32618)     # the zone edge belongs to the eastern zone
        self.assertEqual(self.crs.utm_epsg(151.2, -33.9), 32756)    # Sydney: southern hemisphere
        self.assertEqual(self.crs.origin_epsg({'originWgs84': [-79.744, 42.06]}), 32617)

    def test_export_epsg_reads_the_spatial_reference_and_defaults_to_the_legacy_zone(self):
        self.assertEqual(self.crs.export_epsg({'extent': {'spatialReference': {'wkid': 32616}}}), 32616)
        self.assertEqual(self.crs.export_epsg({'extent': {'spatialReference': {'wkid': 102100, 'latestWkid': 3857}}}), 3857)
        self.assertEqual(self.crs.export_epsg({'extent': {'xmin': 0}}), 32617)
        self.assertEqual(self.crs.export_epsg(None), 32617)


if __name__ == '__main__':
    unittest.main()


class TileSetTests(unittest.TestCase):
    """Source selection: one covering tile first, else the tiles of one
    project and date whose union covers the context; never mixed sources."""

    @staticmethod
    def tile(title, oid, west, south, east, north, end='1600000000000'):
        return {'attributes': {'OBJECTID': oid, 'title': title, 'EndDate': end, 'VerticalDatum': 'NAVD88', 'URL': 'u', 'StartDate': end},
                'geometry': {'rings': [[[west, south], [east, south], [east, north], [west, north], [west, south]]]}}

    def test_tile_project_strips_the_grid_token(self):
        self.assertEqual(compiler.tile_project('USGS 1 Meter 17 x74y435 VA_NorthernShenandoah_2020_D20'), 'VA_NorthernShenandoah_2020_D20')
        self.assertEqual(compiler.tile_project('USGS one meter x60y466 NY Southwest East 2017'), 'NY Southwest East 2017')

    def test_single_covering_tile_beats_an_adjacent_pair(self):
        extent = compiler.box(-78.154, 39.164, -78.139, 39.177)
        north = self.tile('USGS 1 Meter 17 x74y435 VA_NorthernShenandoah_2020_D20', 1, -78.22, 39.1733, -78.10, 39.27)
        south = self.tile('USGS 1 Meter 17 x74y434 VA_NorthernShenandoah_2020_D20', 2, -78.22, 39.08, -78.10, 39.1762)
        whole = self.tile('USGS 1 Meter 17 x74y434 VA_Older_2016_D17', 3, -78.3, 39.0, -78.0, 39.3, end='1500000000000')
        sets = compiler.covering_tile_sets([north, south, whole], extent)
        self.assertEqual([[r['attributes']['OBJECTID'] for r in tiles] for tiles in sets], [[3], [2, 1]])

    def test_pairs_never_mix_projects_or_dates(self):
        extent = compiler.box(-78.154, 39.164, -78.139, 39.177)
        north = self.tile('USGS 1 Meter 17 x74y435 VA_NorthernShenandoah_2020_D20', 1, -78.22, 39.1733, -78.10, 39.27)
        other_project = self.tile('USGS 1 Meter 17 x74y434 WV_Eastern_2019_D19', 2, -78.22, 39.08, -78.10, 39.1762)
        other_date = self.tile('USGS 1 Meter 17 x74y434 VA_NorthernShenandoah_2020_D20', 3, -78.22, 39.08, -78.10, 39.1762, end='1700000000000')
        self.assertEqual(compiler.covering_tile_sets([north, other_project, other_date], extent), [])
        gap = self.tile('USGS 1 Meter 17 x74y434 VA_NorthernShenandoah_2020_D20', 4, -78.22, 39.08, -78.10, 39.170)
        self.assertEqual(compiler.covering_tile_sets([north, gap], extent), [])

    def test_an_undated_tile_is_never_paired_and_sorts_last_alone(self):
        extent = compiler.box(-78.154, 39.164, -78.139, 39.177)
        north = self.tile('USGS 1 Meter 17 x74y435 VA_NorthernShenandoah_2020_D20', 1, -78.22, 39.1733, -78.10, 39.27)
        undated_south = self.tile('USGS 1 Meter 17 x74y434 VA_NorthernShenandoah_2020_D20', 2, -78.22, 39.08, -78.10, 39.1762, end=None)
        self.assertEqual(compiler.covering_tile_sets([north, undated_south], extent), [])
        dated_whole = self.tile('USGS 1 Meter 17 x74y434 VA_Older_2016_D17', 3, -78.3, 39.0, -78.0, 39.3, end='1500000000000')
        undated_whole = self.tile('USGS 1 Meter 17 x74y434 VA_Unknown', 4, -78.3, 39.0, -78.0, 39.3, end=None)
        sets = compiler.covering_tile_sets([undated_whole, dated_whole], extent)
        self.assertEqual([[r['attributes']['OBJECTID'] for r in tiles] for tiles in sets], [[3], [4]])

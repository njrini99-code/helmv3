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
from typing import ClassVar
from unittest.mock import patch

import numpy as np
import terrain_triangulate
from shapely.geometry import LineString, MultiPolygon, Polygon, box

spec = importlib.util.spec_from_file_location('compiler', Path(__file__).with_name('compile-course-terrain.py'))
compiler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compiler)


class TiledTerrainAcquisitionTests(unittest.TestCase):
    def test_large_course_partitions_without_downsampling_or_gaps(self):
        bounds = [100, 200, 3600, 3000]
        windows = compiler.terrain_export_windows(bounds, 3500, 2800)
        self.assertGreater(len(windows), 1)
        self.assertEqual(sum(w['pixels'][0] * w['pixels'][1] for w in windows), 3500 * 2800)
        self.assertTrue(compiler.unary_union([box(*w['bounds']) for w in windows]).equals(box(*bounds)))
        for window in windows:
            a, b, c, d = window['bounds']; width, height = window['pixels']
            self.assertLessEqual(width * height, 8_000_000)
            self.assertEqual([c-a, d-b], [width, height])
        with self.assertRaisesRegex(ValueError, '32M'):
            compiler.terrain_export_windows([0, 0, 9000, 9000], 9000, 9000)

    def test_tile_mosaic_preserves_elevations_coordinates_and_source_requests(self):
        from osgeo import gdal, osr
        gdal.UseExceptions()
        windows = [{'bounds': [100, 200, 103, 204], 'pixels': [3, 4]},
                   {'bounds': [103, 200, 106, 204], 'pixels': [3, 4]}]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); payloads = {}
            def request(operation, values):
                self.assertEqual(operation, 'exportImage')
                self.assertEqual(json.loads(values['mosaicRule'])['lockRasterIds'], [42, 43])
                a, b, c, d = map(float, values['bbox'].split(','))
                path = root / f'{int(a)}.tif'
                ds = gdal.GetDriverByName('GTiff').Create(str(path), 3, 4, 1, gdal.GDT_Float32)
                ds.SetGeoTransform((a, 1, 0, d, 0, -1))
                sr = osr.SpatialReference(); sr.ImportFromEPSG(32617); ds.SetProjection(sr.ExportToWkt())
                grid = np.asarray([[a + x + (d-y) / 10 for x in range(3)] for y in range(4)], dtype=np.float32)
                ds.GetRasterBand(1).WriteArray(grid); ds = None
                payloads[str(path)] = path.read_bytes()
                return {'width': 3, 'height': 4, 'href': str(path),
                        'extent': {'xmin': a, 'ymin': b, 'xmax': c, 'ymax': d}}
            with patch.object(compiler, 'terrain_export_windows', return_value=windows), \
                 patch.object(compiler.fetch, 'request', side_effect=request), \
                 patch.object(compiler.fetch, 'read', side_effect=lambda href, limit: payloads[href]):
                exported, raw, parts = compiler.export_usgs_grid(root, [100, 200, 106, 204], 6, 4, 32617, [42, 43])
            result = root / 'result.tif'; result.write_bytes(raw)
            ds = gdal.Open(str(result))
            expected = np.asarray([[100 + x + (204-y) / 10 for x in range(6)] for y in range(4)], dtype=np.float32)
            np.testing.assert_array_equal(ds.ReadAsArray(), expected)
            self.assertEqual(ds.GetGeoTransform(), (100, 1, 0, 204, 0, -1))
            self.assertEqual(len(parts), 2)
            self.assertEqual(exported['assembly'], 'exact_aligned_grid_mosaic_no_resampling')
            for row, part in zip(exported['parts'], parts):
                self.assertEqual(row['sha256'], hashlib.sha256(part['raster']).hexdigest())


class PlaneSource:
    manifest: ClassVar[dict] = {'selectedTitle': 'Analytic fixture', 'sourceUrl': 'https://example.invalid/source',
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
    def test_shared_lake_does_not_expand_played_bounds_but_source_envelope_survives(self):
        hole, _pkg, shapes, features, _displays, _outlines = fixture()
        shapes['lake'] = box(0, 10, 1000, 1000)
        features['lake'] = {'id': 'lake', 'kind': 'water', 'reviewed': False}
        hole['featureIds'].append('lake')
        source_bounds = compiler.hole_bounds(hole, shapes, features)
        played_bounds = compiler.hole_bounds(hole, shapes, features, played_only=True)
        self.assertGreater(source_bounds[0][2], 1000)
        self.assertLess(played_bounds[0][2], 30)
        self.assertLess(played_bounds[0][3], 50)
        self.assertEqual(shapes['lake'].bounds, (0, 10, 1000, 1000))

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

    def test_nc_onemap_rendering_only_grid_keeps_source_bounds_but_declares_derived_pixel_size(self):
        # A facility visual scene can be too large for the provider's native
        # one-request cap.  It may use a coarser render-only raster, but its
        # request extent still has to remain snapped to the provider grid and
        # the requested output cannot exceed the same hard cap.
        bounds, size, pixel_m = compiler.nc_rendering_only_grid_bounds(
            [100.1, 200.1, 110.0, 209.4], {'xmin': 0, 'ymin': 0}, 2,
        )
        self.assertEqual(bounds, [100.0, 200.0, 112.5, 212.5])
        self.assertEqual(size, [2, 2])
        self.assertAlmostEqual(pixel_m[0], 12.5 / 2 * compiler.US_SURVEY_FOOT_TO_METERS)
        self.assertAlmostEqual(pixel_m[1], 12.5 / 2 * compiler.US_SURVEY_FOOT_TO_METERS)
        with self.assertRaisesRegex(ValueError, 'coarser'):
            compiler.nc_rendering_only_grid_bounds([100.1, 200.1, 110.0, 209.4], {'xmin': 0, 'ymin': 0}, .5)

    def test_nc_selection_excludes_category_one_overview_rasters(self):
        # DEM03 labels coarse LERC overview levels category=1 as well as the
        # county source raster.  Selection must use the per-item native grid,
        # not its shared category or the larger overview envelope.
        footprint = box(2, 2, 8, 8)
        native = {'attributes': {'objectid': 1, 'lowps': 3.125, 'name': 'County native'},
                  'geometry': {'rings': [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]}}
        overview = {'attributes': {'objectid': 2, 'lowps': 500, 'name': 'L01 overview'},
                    'geometry': {'rings': [[[-100, -100], [100, -100], [100, 100], [-100, 100], [-100, -100]]]}}
        unknown = {'attributes': {'objectid': 3, 'name': 'unverified'}, 'geometry': native['geometry']}
        self.assertEqual(compiler.nc_native_covering_rasters({'features': [native, overview, unknown]}, footprint), [native])

    def test_nc_multiple_native_sources_remain_ambiguous(self):
        footprint = box(2, 2, 8, 8)
        rows = [{'attributes': {'objectid': value, 'lowps': 3.125},
                 'geometry': {'rings': [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]}}
                for value in (1, 2)]
        self.assertEqual(len(compiler.nc_native_covering_rasters({'features': rows}, footprint)), 2)

    def test_nc_overlapping_native_sources_are_visual_only_when_explicitly_requested(self):
        footprint = box(2, 2, 8, 8)
        rows = [{'attributes': {'objectid': value, 'lowps': 3.125},
                 'geometry': {'rings': [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]}}
                for value in (9, 2)]
        catalog = {'objectIdFieldName': 'objectid', 'features': rows}
        with self.assertRaisesRegex(ValueError, 'never blend'):
            compiler.nc_select_covering_raster(catalog, footprint)
        selected, candidate_ids, method = compiler.nc_select_covering_raster(catalog, footprint, 2)
        self.assertEqual(selected['attributes']['objectid'], 2)
        self.assertEqual(candidate_ids, [2, 9])
        self.assertEqual(method, 'visual_only_lowest_object_id_among_overlapping_native_coverage')

    def test_nc_overlap_dossier_retains_frames_without_promoting_a_physical_source(self):
        footprint = box(2, 2, 8, 8)
        rows = [
            {'attributes': {'objectid': value, 'lowps': 3.125, 'name': f'County {value}'},
             'geometry': {'rings': [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]}}
            for value in (9, 2)
        ]
        catalog = {'objectIdFieldName': 'objectid', 'features': rows}
        service = {'spatialReference': {'wkt': compiler.pyproj.CRS('EPSG:6543').to_wkt()}}
        item_info = {
            'pixelSizeX': 3.125, 'pixelSizeY': 3.125,
            'extent': {'xmin': 0, 'ymin': 0, 'xmax': 10, 'ymax': 10,
                       'spatialReference': {'latestWkid': 6543, 'latestVcsWkid': 6360}},
        }
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(compiler, 'nc_onemap_request', return_value=item_info):
            dossier = compiler.nc_selection_dossier(
                Path(directory), service, catalog, footprint, [2, 2, 8, 8],
                'multiple_full_coverage_native_candidates',
            )
            retained = json.loads((Path(directory) / 'source-selection-dossier.json').read_text())

        self.assertEqual(dossier['truthClass'], 'unknown')
        self.assertFalse(dossier['physicalTerrainAllowed'])
        self.assertTrue(dossier['renderingOnlySelectionAllowed'])
        self.assertEqual(dossier['candidateObjectIds'], [9, 2])
        self.assertEqual(retained['candidates'][0]['verticalEvidence']['verticalCrs'], 'EPSG:6360')
        self.assertIn('lowest object id is not physical source authority',
                      retained['requiredRemediation']['forbiddenShortcuts'])

    def test_nc_visual_selection_rejects_a_truncated_catalog(self):
        footprint = box(2, 2, 8, 8)
        catalog = {'objectIdFieldName': 'objectid', 'exceededTransferLimit': True,
                   'features': [{'attributes': {'objectid': 1, 'lowps': 3.125},
                                 'geometry': {'rings': [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]}}]}
        with self.assertRaisesRegex(ValueError, 'truncated'):
            compiler.nc_select_covering_raster(catalog, footprint, 2)

    def _nc_candidate_row(self, object_id, name):
        # A footprint far larger than any real request bounds: these tests
        # exercise selection and the empty-fill walk, not coverage geometry
        # (already covered by test_nc_native_covering_rasters above).
        return {'attributes': {'objectid': object_id, 'lowps': 3.125, 'name': name, 'category': 1},
                'geometry': {'rings': [[[-1e9, -1e9], [1e9, -1e9], [1e9, 1e9], [-1e9, 1e9], [-1e9, -1e9]]]}}

    def _nc_info(self, verified_vertical):
        extent_sr = {'latestWkid': 6543}
        if verified_vertical:
            extent_sr['latestVcsWkid'] = 6360
        return {'origin': {'x': 0.0, 'y': 0.0}, 'pixelSizeX': 3.125, 'pixelSizeY': 3.125,
                'extent': {'spatialReference': extent_sr}}

    def _run_nc_acquisition(self, rows, infos, empties, tmp):
        """`infos`/`empties` are keyed by objectid; `empties` may omit a
        candidate whose vertical reference is expected to fail first."""
        service = {'pixelType': 'F32', 'serviceDataType': 'esriImageServiceDataTypeElevation',
                   'pixelSizeX': 3.125, 'pixelSizeY': 3.125, 'spatialReference': {'wkt': compiler.pyproj.CRS('EPSG:6543').to_wkt()}}
        requests = []

        def request(operation, values):
            requests.append(operation)
            if operation == 'query':
                return {'objectIdFieldName': 'objectid', 'features': rows}
            if operation.endswith('/info'):
                return infos[int(operation.split('/')[0])]
            self.assertEqual(operation, 'exportImage')
            object_id = json.loads(values['mosaicRule'])['lockRasterIds'][0]
            size = list(map(int, values['size'].split(',')))
            bounds = list(map(float, values['bbox'].split(',')))
            return {'href': f'https://example.invalid/{object_id}.tiff', 'width': size[0], 'height': size[1],
                    'extent': dict(zip(('xmin', 'ymin', 'xmax', 'ymax'), bounds), spatialReference={'latestWkid': 6543})}

        def read(url, _limit):
            return json.dumps(service).encode() if url.endswith('?f=json') else b'fake-raster-bytes'

        def read_elevation(path):
            object_id = int(path.stem.split('-')[1])
            array = np.zeros((2, 2)) if empties[object_id] else np.ones((2, 2))
            return array, None, 'test'

        with patch.object(compiler, 'nc_onemap_request', side_effect=request), \
             patch.object(compiler, 'nc_onemap_read', side_effect=read), \
             patch.object(compiler.elevation_raster, 'read_elevation', side_effect=read_elevation):
            manifest = compiler.acquire_nc_onemap_source(Path(tmp) / 'source', {'contentHash': 'a' * 64}, [-10, -10, 10, 10])
        return manifest, requests

    def test_ambiguous_native_coverage_falls_back_to_the_next_newest_candidate_on_empty_fill(self):
        # Duke's real overlap: Durham 2024 and Orange 2024 (tied on year,
        # Durham tried first by object id), Wake undated. Durham's export is
        # empty fill here; Orange is the newest survivor.
        rows = [self._nc_candidate_row(1307, 'Durham_2024_QL1_03ft_CountywideRaster'),
                self._nc_candidate_row(1343, 'Orange_2024_QL1_03ft_CountywideRaster'),
                self._nc_candidate_row(1367, 'Wake_Countywide_DEM03')]
        infos = {1307: self._nc_info(True), 1343: self._nc_info(True), 1367: self._nc_info(True)}
        empties = {1307: True, 1343: False, 1367: True}
        with tempfile.TemporaryDirectory() as tmp:
            manifest, requests = self._run_nc_acquisition(rows, infos, empties, tmp)
        self.assertEqual(manifest['selectedTitle'], 'Orange_2024_QL1_03ft_CountywideRaster')
        self.assertEqual(manifest['selectionMethod'], 'single_native_full_coverage_raster_newest_acquisition_v1')
        self.assertEqual(manifest['sourceSelection'], 'single_native_full_coverage_raster_newest_acquisition_v1')
        self.assertEqual(len(manifest['rejectedCandidates']), 1)
        self.assertEqual(manifest['rejectedCandidates'][0]['objectId'], 1307)
        self.assertEqual(manifest['rejectedCandidates'][0]['reason'], 'export_empty_fraction_exceeds_threshold')
        self.assertEqual(manifest['verticalDatum'], 'North American Vertical Datum 1988')
        # Wake was never tried: the walk stops at the first survivor.
        self.assertNotIn('1367/info', requests)

    def test_ambiguous_native_coverage_falls_back_to_usgs_3dep_when_no_candidate_has_a_verified_datum(self):
        # Benvenue/Eagle Point's real shape: two full-coverage county rasters,
        # neither with an independently verified vertical CRS. NC OneMap
        # still can't blend or guess a datum, but USGS 3DEP is NAVD88 by
        # definition, so the course is not permanently blocked: it falls
        # through instead of raising VERTICAL_UNIT_UNKNOWN.
        rows = [self._nc_candidate_row(1308, 'Edgecombe_Ground_3ft'), self._nc_candidate_row(1339, 'Nash_Ground_3ft')]
        infos = {1308: self._nc_info(False), 1339: self._nc_info(False)}
        fallback_manifest = {'schemaVersion': 1, 'providerPolicyId': compiler.USGS_3DEP_PROVIDER,
                             'selectedTitle': 'VA_NorthernShenandoah_2020_D20', 'verticalDatum': 'NAVD88'}
        usgs_calls = []

        def fake_acquire_usgs_source(directory, pkg, bounds, rendering_only_resolution_m=None):
            usgs_calls.append((directory, pkg, bounds, rendering_only_resolution_m))
            compiler.write_json(directory / 'source-manifest.json', dict(fallback_manifest), True)
            return dict(fallback_manifest)

        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(compiler, 'acquire_usgs_source', side_effect=fake_acquire_usgs_source):
                manifest, _requests = self._run_nc_acquisition(rows, infos, {}, tmp)
            dossier = json.loads((Path(tmp) / 'source' / 'source-selection-dossier.json').read_text())
        self.assertEqual(dossier['selectionStatus'], 'all_candidates_lack_verified_vertical_reference')
        self.assertEqual(len(usgs_calls), 1)
        self.assertEqual(usgs_calls[0][2], [-10, -10, 10, 10])
        self.assertEqual(manifest['providerPolicyId'], compiler.USGS_3DEP_PROVIDER)
        self.assertEqual(manifest['fallbackFrom'], compiler.NC_ONEMAP_PROVIDER)
        self.assertEqual(manifest['fallbackReason'], 'all_candidates_lack_verified_vertical_reference')
        rejected_ids = sorted(r['objectId'] for r in manifest['fallbackRejectedCandidates'])
        self.assertEqual(rejected_ids, [1308, 1339])
        self.assertTrue(all(r['reason'] == 'vertical_datum_unverified' for r in manifest['fallbackRejectedCandidates']))

    def test_second_run_reuses_the_retained_3dep_fallback_without_requerying_nc(self):
        # `--acquire-only` always passes the facility policy's requested
        # provider (nc_onemap_dem03); once the directory holds a retained
        # 3DEP fallback, a second run must resolve to it rather than
        # re-running the NC walk or refusing the cache as mismatched.
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source'
            source.mkdir()
            manifest = {'schemaVersion': 1, 'providerPolicyId': compiler.USGS_3DEP_PROVIDER,
                       'fallbackFrom': compiler.NC_ONEMAP_PROVIDER, 'selectedTitle': 'VA_NorthernShenandoah_2020_D20'}
            (source / 'source-manifest.json').write_text(json.dumps(manifest))
            resolved = compiler.resolve_source_provider(source, compiler.NC_ONEMAP_PROVIDER, acquire_only=True)
        self.assertEqual(resolved, compiler.USGS_3DEP_PROVIDER)

    def test_usgs_rendering_only_grid_cannot_silently_claim_native_sampling(self):
        # 2 m would still exceed the provider cap; the caller must advance to
        # a separately declared 4 m visual-only raster.
        with self.assertRaisesRegex(ValueError, 'pixel cap'):
            compiler.usgs_rendering_only_grid_size(9447, 8722, 2)
        self.assertEqual(compiler.usgs_rendering_only_grid_size(9447, 8722, 4), [2362, 2181])
        with self.assertRaisesRegex(ValueError, 'coarser'):
            compiler.usgs_rendering_only_grid_size(9447, 8722, 1)

    def test_catalog_resolution_keeps_native_and_arc_second_grids_distinct(self):
        self.assertEqual(compiler.catalog_resolution_m({'title': 'USGS 1 Meter 17 x1y1 Test', 'Resolution_X': 1}, 40), 1)
        # 1/3 arc-second is about 10.3 m north/south.  The fallback may not
        # export it to a finer grid and call the result higher fidelity.
        self.assertAlmostEqual(compiler.catalog_resolution_m({'title': 'USGS 1/3 Arc Second n41w083', 'Resolution_X': 1 / 10800}, 40), 111_320 / 10800)

    def test_source_request_samples_every_local_bound_edge(self):
        # Projecting only four ENU corners into a different CRS can leave a
        # curved edge just outside the raster. The source request must include
        # its edge midpoints too, not merely the corners.
        samples = compiler.local_bounds_perimeter([0, 10, 100, 50], samples_per_edge=2)
        self.assertEqual(samples[0], (0, 10))
        self.assertIn((50, 10), samples)
        self.assertIn((100, 30), samples)
        self.assertIn((50, 50), samples)
        self.assertIn((0, 30), samples)

    def test_nc_onemap_service_contract_rejects_a_changed_grid_or_units(self):
        service = {'pixelType': 'F32', 'serviceDataType': 'esriImageServiceDataTypeElevation',
                   'pixelSizeX': 3.125, 'pixelSizeY': 3.125, 'spatialReference': {'wkt': compiler.pyproj.CRS('EPSG:6543').to_wkt()}}
        compiler.validate_nc_onemap_service(service)
        with self.assertRaisesRegex(ValueError, 'resolution changed'):
            compiler.validate_nc_onemap_service({**service, 'pixelSizeX': 1})
        with self.assertRaisesRegex(ValueError, 'CRS'):
            compiler.validate_nc_onemap_service({**service, 'spatialReference': {'wkt': 'UNIT["metre",1]' }})

    def test_nc_original_nad83_is_not_native_2011_and_horizontal_units_do_not_establish_z(self):
        with self.assertRaisesRegex(ValueError, 'CRS differs'):
            compiler.validate_nc_horizontal_crs({'latestWkid': 2264})
        self.assertIsNone(compiler.nc_vertical_evidence({'extent': {'spatialReference': {'latestWkid': 6543}}}))
        vertical = compiler.nc_vertical_evidence({'extent': {'spatialReference': {'latestWkid': 6543, 'latestVcsWkid': 6360}}})
        self.assertEqual(vertical['verticalCrs'], 'EPSG:6360')
        self.assertAlmostEqual(vertical['verticalUnitToMeters'], 1200 / 3937)
        with self.assertRaisesRegex(ValueError, 'NC_SOURCE_FRAME_UNVERIFIED'):
            compiler.vertical_unit_to_meters({'providerPolicyId': compiler.NC_ONEMAP_PROVIDER, 'verticalUnitToMeters': 1200 / 3937})
        self.assertIsNone(vertical['geoidModel'])

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

    def test_source_manifest_contract_rejects_finer_exports_and_missing_physical_z_evidence(self):
        manifest = {
            'providerPolicyId': compiler.USGS_3DEP_PROVIDER,
            'requestedLocalBoundsM': [-10, -10, 20, 20],
            'horizontalExportCrs': 'EPSG:32617',
            'sourceNativeResolutionM': 1,
            'exportPixelM': [1, 1],
            'verticalDatum': 'NAVD88',
            'rawVerticalUnit': 'meter',
            'verticalUnitToMeters': 1,
            'sourceFrameContract': compiler.USGS_3DEP_SOURCE_CONTRACT,
            'renderingOnly': False,
        }
        contract = compiler.source_manifest_contract(manifest)
        self.assertFalse(contract['legacyContract'])
        self.assertEqual(contract['expectedSourceContract'], compiler.USGS_3DEP_SOURCE_CONTRACT)

        finer = {**manifest, 'exportPixelM': [.5, .5]}
        with self.assertRaisesRegex(ValueError, 'finer'):
            compiler.source_manifest_contract(finer)
        unknown_z = {key: value for key, value in manifest.items() if key != 'verticalUnitToMeters'}
        with self.assertRaisesRegex(ValueError, 'verticalUnitToMeters'):
            compiler.source_manifest_contract(unknown_z)
        stale_frame = {**manifest, 'sourceFrameContract': 'usgs-3dep-native-grid-v0'}
        with self.assertRaisesRegex(ValueError, 'SOURCE_FRAME_UNVERIFIED'):
            compiler.source_manifest_contract(stale_frame)

    def test_rendering_only_source_can_be_coarser_but_remains_distinct(self):
        manifest = {
            'providerPolicyId': compiler.CHARLESTON_COUNTY_DEM_2025_PROVIDER,
            'requestedLocalBoundsM': [-10, -10, 20, 20],
            'horizontalExportCrs': compiler.CHARLESTON_COUNTY_DEM_2025_CRS,
            'sourceNativeResolutionM': compiler.CHARLESTON_COUNTY_DEM_2025_PIXEL_FEET * compiler.INTERNATIONAL_FOOT_TO_METERS,
            'exportPixelM': [2, 2],
            'renderingOnly': True,
            'sourceFrameContract': compiler.CHARLESTON_COUNTY_DEM_2025_SOURCE_CONTRACT,
        }
        contract = compiler.source_manifest_contract(manifest)
        self.assertTrue(contract['renderingOnly'])
        self.assertEqual(contract['expectedSourceContract'], compiler.CHARLESTON_COUNTY_DEM_2025_SOURCE_CONTRACT)

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

    def test_a_legitimate_near_tangent_sliver_is_not_dropped_from_only_one_side(self):
        # Two real, exactly-noded faces from Golden Horseshoe hole 18 (course-
        # geometry batch), captured hex-exact so the CDT reproduces bit for bit.
        # Where they meet at a near-tangent angle, one side's raw CDT output
        # includes a genuine, non-degenerate sliver triangle of area
        # ~9.6076e-09 m^2; the pre-v5 threshold (1e-8) discarded it, but only
        # on this side, since node_pieces already gave both faces the same
        # noded boundary and the mirror edge on the other face's independent
        # CDT pass was not similarly slivered. The dropped triangle's edge
        # then stayed single-use in the combined mesh: a T-junction, not a
        # detector false positive (see t_junction_report). DEGENERATE_AREA_M2
        # (1e-10) sits below this sliver and above true GEOS overlay noise
        # (~1e-15), so it keeps the triangle and the crack closes.
        def h(s):
            return float.fromhex(s)

        def face(hex_points):
            return Polygon([(h(x), h(y)) for x, y in hex_points])

        face_a = face([
            ('-0x1.c000000000000p+7', '0x1.7400000000000p+9'), ('-0x1.c000000000000p+7', '0x1.7405eda661284p+9'),
            ('-0x1.bf60512231833p+7', '0x1.7411da16616b5p+9'), ('-0x1.bf60407cc7d1cp+7', '0x1.7411dd7ecbb80p+9'),
            ('-0x1.bf602afdda8bdp+7', '0x1.7411dcf0307f2p+9'), ('-0x1.bc8662131a8efp+7', '0x1.74487a41e57dap+9'),
            ('-0x1.b82319e731d2ep+7', '0x1.7483082491afcp+9'), ('-0x1.b800000000000p+7', '0x1.74841bf37b8d4p+9'),
            ('-0x1.b800000000000p+7', '0x1.7400000000000p+9'), ('-0x1.c000000000000p+7', '0x1.7400000000000p+9'),
        ])
        face_b = face([
            ('-0x1.bf60407cc7d1cp+7', '0x1.7411dd7ecbb80p+9'), ('-0x1.bf60512231833p+7', '0x1.7411da16616b5p+9'),
            ('-0x1.c000000000000p+7', '0x1.7405eda661284p+9'), ('-0x1.c000000000000p+7', '0x1.748b841248d7ep+9'),
            ('-0x1.bff2ebc408d8fp+7', '0x1.748c7e175d13dp+9'), ('-0x1.bd0ebedfa43fep+7', '0x1.74c3e27179bfep+9'),
            ('-0x1.bcf996312f4cfp+7', '0x1.74c539a7c17a9p+9'), ('-0x1.b881276fb0920p+7', '0x1.7500e1c58255bp+9'),
            ('-0x1.b86c185058ddep+7', '0x1.7501c0a06e9ffp+9'), ('-0x1.b800000000000p+7', '0x1.750511f926c7fp+9'),
            ('-0x1.b800000000000p+7', '0x1.74841bf37b8d4p+9'), ('-0x1.b82319e731d2ep+7', '0x1.7483082491afcp+9'),
            ('-0x1.bc8662131a8efp+7', '0x1.74487a41e57dap+9'), ('-0x1.bf602afdda8bdp+7', '0x1.7411dcf0307f2p+9'),
            ('-0x1.bf60407cc7d1cp+7', '0x1.7411dd7ecbb80p+9'),
        ])
        faces = [(0, 'fairway', face_a), (0, 'fairway', face_b)]
        bounds = [min(face_a.bounds[0], face_b.bounds[0]) - 10, min(face_a.bounds[1], face_b.bounds[1]) - 10,
                  max(face_a.bounds[2], face_b.bounds[2]) + 10, max(face_a.bounds[3], face_b.bounds[3]) + 10]

        xy_old, tf_old, _tm, _ab, _cb = terrain_triangulate.triangulate_faces(faces, ['golf-hole-18-fairway'], 'test-hole', 1, 1e-8)
        cracked = compiler.t_junction_report(xy_old, bounds)
        self.assertGreater(cracked['tJunctionVertices'], 0, 'fixture no longer reproduces the old sliver-drop crack')

        xy_new, tf_new, _tm, _ab, _cb = terrain_triangulate.triangulate_faces(faces, ['golf-hole-18-fairway'], 'test-hole', 1, compiler.DEGENERATE_AREA_M2)
        fixed = compiler.t_junction_report(xy_new, bounds)
        self.assertEqual(fixed['tJunctionVertices'], 0)
        self.assertEqual(len(tf_new), len(tf_old) + 1, 'the fix keeps exactly the one previously-dropped legitimate sliver')

    def test_metric_grid_is_independent_of_display_lod_and_row_order_is_northward(self):
        self.assertEqual(self.fine['metricGrid'], self.coarse['metricGrid'])
        grid = self.fine['metricGrid']
        self.assertAlmostEqual(grid['heightsM'][grid['columns']]-grid['heightsM'][0], .1*grid['spacingM'])
        self.assertAlmostEqual(grid['heightsM'][1]-grid['heightsM'][0], .05*grid['spacingM'])

    def test_budget_discards_decorative_cuts_before_physical_detail(self):
        args = fixture()
        with patch.object(compiler, 'CONTEXT_MARGIN_M', 16):
            decorated, full_report = compiler.compile_hole(*args, PlaneSource(), outer_step=32)
            _plain, plain_report = compiler.compile_hole(*args, PlaneSource(), outer_step=32, decorative_bands=False)
            self.assertLess(plain_report['triangles'], full_report['triangles'])
            with patch.object(compiler, 'MAX_TRIANGLES', plain_report['triangles']):
                bounded, report = compiler.compile_hole(*args, PlaneSource(), outer_step=32)
            self.assertEqual(report['triangles'], plain_report['triangles'])
            self.assertFalse(bounded['renderProfile']['decorativeEdgeBands'])
            self.assertEqual(bounded['metricGrid'], decorated['metricGrid'])
            self.assertEqual(bounded['featureIds'], decorated['featureIds'])
            self.assertEqual(bounded['source']['renderSamplingM'], decorated['source']['renderSamplingM'])
            for actual, original in zip(report['features'], full_report['features']):
                self.assertAlmostEqual(actual['areaM2'], original['areaM2'], places=3)
            triangles = np.array(bounded['vertices']).reshape(-1, 3)
            np.testing.assert_allclose(triangles[:, 2], 200+.05*triangles[:, 0]+.1*triangles[:, 1], atol=1e-3)
            with patch.object(compiler, 'MAX_TRIANGLES', 1), self.assertRaisesRegex(ValueError, 'explicit LOD review required'):
                compiler.compile_hole(*args, PlaneSource(), outer_step=32)

    def test_per_vertex_source_normals_are_opt_in_because_the_renderer_shades_from_the_metric_grid(self):
        self.assertNotIn('sourceNormals', self.fine)
        self.assertEqual(self.report['sourceNormals'], 'metric_grid_slope')
        self.assertNotIn('sourceNormalDuplicatesAgree', self.report)
        self.assertTrue(self.report['sourceHeightDuplicatesAgree'])
        self.assertEqual(self.report['renderProfile']['compilerVersion'], 'course-terrain-v5')
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

    def test_a_covering_imageserver_tile_never_reaches_the_tnm_fallback(self):
        with patch.object(compiler, 'attempt_tnm_1m_fallback',
                          side_effect=AssertionError('TNM must not be queried when the ImageServer already covers the course')):
            _requests, manifest, _export = self.acquire([-78.1467049, 39.1707734])  # Winchester, VA
        self.assertEqual(manifest['horizontalExportCrs'], 'EPSG:32617')
        self.assertNotIn('discoveryPath', manifest)


class TnmFallbackTests(unittest.TestCase):
    """Benvenue/Eagle Point's real shape: the ImageServer catalog carries
    nothing for the course, but TNM Access lists the same USGS 3DEP
    one-meter product line's newer project. `tnm_1m_products`,
    `tnm_tile_vertical_evidence`, `tnm_item_metadata` and `tnm_warp_grid`
    are the only network/GDAL seams; patching them tests the
    orchestration (grouping, ordering, rejection, manifest assembly)
    without a live TNM query or a `/vsicurl/` read."""

    BENVENUE_TILE = {'title': 'USGS 1 Meter 18 x24y399 NC_HurricaneFlorence_2020_D20',
                     'downloadURL': 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/'
                                    'NC_HurricaneFlorence_2020_D20/TIFF/USGS_1M_18_x24y399_NC_HurricaneFlorence_2020_D20.tif',
                     'sizeInBytes': 390274764, 'boundingBoxWgs84': [-77.88514173599998, 35.92979034500007, -77.77114182699995, 36.02245323100004],
                     'publicationDate': '2025-03-25', 'metaUrl': 'https://www.sciencebase.gov/catalog/item/681c1326d4be0260c2c46a82'}

    def empty_imageserver_catalog(self, operation, values):
        self.assertEqual(operation, 'query')
        return {'features': []}

    def test_used_only_when_the_imageserver_finds_nothing_and_matches_peeks_source_rule(self):
        vertical = {'verticalDatum': 'North American Vertical Datum of 1988', 'rawVerticalUnit': 'meter',
                   'verticalUnitToMeters': 1, 'verticalUnitStatus': 'declared_by_product_metadata_record'}
        dates = {'dates': [{'type': 'Start', 'dateString': '2019-11-26'}, {'type': 'End', 'dateString': '2020-08-25'}]}

        def fake_warp(directory, tiles, out_bounds, width, height, crs):
            self.assertEqual(len(tiles), 1)
            self.assertEqual(crs, 32618)
            return b'FAKE-ELEVATION-BYTES', 0.0002, 'test'

        pkg = {'contentHash': '5' * 64, 'originWgs84': [-77.8178, 35.9811], 'name': 'Benvenue fixture'}
        compiler.pilot.ORIGIN = pkg['originWgs84']
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(compiler.fetch, 'request', self.empty_imageserver_catalog), \
                 patch.object(compiler, 'tnm_1m_products', return_value=[dict(self.BENVENUE_TILE)]), \
                 patch.object(compiler, 'tnm_tile_vertical_evidence', return_value=vertical), \
                 patch.object(compiler, 'tnm_item_metadata', return_value=dates), \
                 patch.object(compiler, 'tnm_warp_grid', side_effect=fake_warp), \
                 redirect_stdout(io.StringIO()):
                manifest = compiler.acquire_source(Path(directory), pkg, [-30, -30, 30, 30])
            self.assertEqual(manifest['providerPolicyId'], compiler.USGS_3DEP_PROVIDER)
            self.assertEqual(manifest['discoveryPath'], 'tnm_access')
            self.assertEqual(manifest['sourceSelection'], 'tnm_access_single_native_1m_tile')
            self.assertEqual(manifest['selectedTitle'], self.BENVENUE_TILE['title'])
            self.assertEqual(manifest['verticalDatum'], 'North American Vertical Datum of 1988')
            self.assertEqual(manifest['acquisitionStart'], '2019-11-26')
            self.assertEqual(manifest['acquisitionEnd'], '2020-08-25')
            self.assertEqual(manifest['nativeResolutionM'], 1.0)
            self.assertEqual(manifest['rejectedCandidates'], [])
            self.assertEqual((Path(directory) / 'elevation.tiff').read_bytes(), b'FAKE-ELEVATION-BYTES')
            # A retained TNM fallback reuses cleanly on a second acquire call.
            with patch.object(compiler.fetch, 'request', side_effect=AssertionError('cached; must not re-query')), \
                 patch.object(compiler, 'tnm_1m_products', side_effect=AssertionError('cached; must not re-query TNM')), \
                 redirect_stdout(io.StringIO()):
                reused = compiler.acquire_source(Path(directory), pkg, [-30, -30, 30, 30])
            self.assertEqual(reused['selectedTitle'], manifest['selectedTitle'])

    def test_a_candidate_with_no_verified_vertical_reference_is_rejected_and_the_blocker_message_is_unchanged(self):
        pkg = {'contentHash': '6' * 64, 'originWgs84': [-77.8178, 35.9811], 'name': 'Benvenue fixture'}
        compiler.pilot.ORIGIN = pkg['originWgs84']
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(compiler.fetch, 'request', self.empty_imageserver_catalog), \
             patch.object(compiler, 'tnm_1m_products', return_value=[dict(self.BENVENUE_TILE, metaUrl=None)]), \
             patch.object(compiler, 'tnm_tile_vertical_evidence', return_value=None), \
             redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(ValueError, 'No native-1m tile set covers the full bounded course context'):
                compiler.acquire_source(Path(directory), pkg, [-30, -30, 30, 30])
            report = json.loads((Path(directory) / 'coverage-exception.json').read_text())
        self.assertEqual(report['tnmRejectedCandidates'],
                         [{'project': 'NC_HurricaneFlorence_2020_D20', 'reason': 'vertical_datum_unverified'}])

    def test_no_tnm_tiles_at_all_still_raises_the_unchanged_blocker_message(self):
        pkg = {'contentHash': '7' * 64, 'originWgs84': [-77.8178, 35.9811], 'name': 'Benvenue fixture'}
        compiler.pilot.ORIGIN = pkg['originWgs84']
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(compiler.fetch, 'request', self.empty_imageserver_catalog), \
             patch.object(compiler, 'tnm_1m_products', return_value=[]), \
             redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(ValueError, 'No native-1m tile set covers the full bounded course context'):
                compiler.acquire_source(Path(directory), pkg, [-30, -30, 30, 30])


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

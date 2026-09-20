"""The S1M discovery spike's pure parts: tile squares from names, grid
coverage, the comparison arithmetic and the report — no network, no GDAL
dataset."""
import importlib.util
import os
import unittest

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def load():
    spec = importlib.util.spec_from_file_location('research_s1m_coverage', os.path.join(HERE, 'research-s1m-coverage.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


s1m = load()


class GridTests(unittest.TestCase):
    def test_a_tile_name_carries_its_north_west_corner_in_kilometres(self):
        # Verified against the tile's own geotransform: S1M_n2240e1330 starts at (1330000, 2240000).
        self.assertEqual(s1m.tile_square('S1M n2240e1330 20260521'), (1330000, 2230000, 1340000, 2240000))
        self.assertIsNone(s1m.tile_square('USGS 1 Meter 17 x60y466 NY Southwest East 2017'))

    def test_coverage_names_the_missing_cells(self):
        envelope = (1335000, 2228000, 1338000, 2232000)   # straddles n2230/n2240 rows of column e1330
        self.assertEqual(s1m.grid_cells(envelope), [(1330000, 2220000, 1340000, 2230000), (1330000, 2230000, 1340000, 2240000)])
        both = [{'title': 'S1M n2230e1330 20260521'}, {'title': 'S1M n2240e1330 20260521'}]
        self.assertEqual(s1m.coverage(envelope, both), {'cellsNeeded': 2, 'cellsCovered': 2, 'covered': True, 'missingCells': []})
        one = s1m.coverage(envelope, both[1:])
        self.assertEqual((one['covered'], one['missingCells']), (False, [(1330000, 2220000, 1340000, 2230000)]))


class ComparisonTests(unittest.TestCase):
    def test_bilinear_interpolates_and_leaves_the_array_as_nan(self):
        ramp = np.arange(16, dtype=np.float64).reshape(4, 4)   # value = 4*row + col
        values = s1m.bilinear(ramp, np.array([0.5, 2.0, 3.5]), np.array([0.5, 1.0, 1.0]))
        self.assertAlmostEqual(values[0], 2.5)
        self.assertAlmostEqual(values[1], 6.0)
        self.assertTrue(np.isnan(values[2]))

    def test_difference_stats_and_the_best_fit_shift(self):
        delta = np.array([0.01, -0.02, 0.05, 0.4, np.nan])
        stats = s1m.difference_stats(delta)
        self.assertEqual(stats['points'], 4)
        self.assertEqual(stats['maxAbsM'], 0.4)
        self.assertEqual(stats['within0p15m'], 0.75)
        self.assertEqual(s1m.difference_stats(np.array([np.nan])), {'points': 0})
        # A bowl sampled one metre east of where the reference was read: the search finds dx = +1 (a plane would tie).
        y, x = np.mgrid[0:40, 0:40]
        bowl = (((x - 20) ** 2 + 2 * (y - 15) ** 2) / 100.0).astype(np.float64)
        cols, rows = np.array([10.0, 22.0, 31.0, 15.0, 25.0, 7.0, 33.0]), np.array([12.0, 7.0, 29.0, 25.0, 12.0, 30.0, 9.0])
        sample = s1m.bilinear(bowl, cols + 1.0, rows)
        best = s1m.best_shift(sample, bowl, cols, rows)
        self.assertEqual((best['dxM'], best['dyM'], best['medianAbsM'], best['atSearchEdge']), (1.0, 0.0, 0.0, False))
        self.assertEqual(s1m.best_shift(sample, bowl, cols + 1.0, rows)['dxM'], 0.0)
        # An offset beyond the window comes back pinned to its edge, and says so.
        far = s1m.bilinear(bowl, cols + 3.0, rows)
        self.assertTrue(s1m.best_shift(far, bowl, cols, rows)['atSearchEdge'])

    def test_network_bytes_reads_the_top_level_methods_only(self):
        stats = {'methods': {'HEAD': {'count': 1}, 'GET': {'count': 2, 'downloaded_bytes': 2566402}},
                 'handlers': {'vsicurl': {'methods': {'GET': {'count': 2, 'downloaded_bytes': 2566402}}}}}
        self.assertEqual(s1m.network_bytes(stats), 2566402)
        self.assertEqual(s1m.network_bytes({}), 0)


class AoiTests(unittest.TestCase):
    def test_the_aoi_polygon_is_built_in_albers_and_shares_are_per_unit(self):
        from osgeo import ogr
        bbox = [-79.7388695, 42.0567613, -79.7173575, 42.070588]   # Peek'n Peak
        polygon = s1m.aoi_polygon_albers(bbox)
        self.assertTrue(polygon.IsValid())
        x0, x1, y0, y1 = polygon.GetEnvelope()
        self.assertEqual(s1m.grid_cells((x0, y0, x1, y1)), [(1320000, 2230000, 1330000, 2240000), (1330000, 2230000, 1340000, 2240000)])
        self.assertAlmostEqual(polygon.GetArea() / 1e6, 2.8, delta=0.4)   # ~1.8 km × 1.5 km
        # The AOI straddles the 1 330 000 m grid line by a sliver: the western
        # tile is needed for about 2 % of the course, the eastern for the rest.
        west = ogr.CreateGeometryFromWkt('POLYGON ((1320000 2230000, 1330000 2230000, 1330000 2240000, 1320000 2240000, 1320000 2230000))')
        east = ogr.CreateGeometryFromWkt('POLYGON ((1330000 2230000, 1340000 2230000, 1340000 2240000, 1330000 2240000, 1330000 2230000))')
        west_share = polygon.Intersection(west).GetArea() / polygon.GetArea()
        east_share = polygon.Intersection(east).GetArea() / polygon.GetArea()
        self.assertAlmostEqual(west_share + east_share, 1.0, places=6)
        self.assertTrue(0 < west_share < 0.05, west_share)
        self.assertGreater(east_share, 0.95)


class ReportTests(unittest.TestCase):
    def record(self):
        return {'facilityId': 'synthetic', 'terrainPolicy': ['usgs_s1m'], 'aoiSource': 'output/x/aoi.json', 'sourceProjects': ['NY_SouthwestNY_2017_A17/NY_Southwest-East_2017'],
                'sourceAcquisition': ['2017-04-18', '2017-05-09'],
                'sourceUnits': {'workUnits': ['NY_Southwest_East_2017'], 'dataTypes': ['Lidar'], 'coarsestSourceM': 1, 'finestSourceM': 1, 'collect': ['2017-04-18', '2017-05-09'], 'qualityLevels': ['QL2']},
                'tiles': [{'title': 'S1M n2240e1330 20260521', 'publicationDate': '2026-05-21', 'sizeInBytes': 319571257, 'sourceProject': 'NY_SouthwestNY_2017_A17/NY_Southwest-East_2017',
                           'square': (1330000, 2230000, 1340000, 2240000), 'acquisitionStart': '2017-04-18', 'acquisitionEnd': '2017-05-09', 'spatialMetadata': 'https://example.test/tile.gpkg',
                           'sources': [{'workunit_name': 'NY_Southwest_East_2017', 'percent_area': 1.0, 'aoiShare': 1.0, 'collect_start': '2017-04-18', 'collect_end': '2017-05-09', 'source_dem_pub_date': '2019-01-01',
                                        'quality_level': 'QL2', 'data_type': 'Lidar', 'source_resolution_meters': 1}]}],
                'coverage': {'cellsNeeded': 1, 'cellsCovered': 1, 'covered': True, 'missingCells': []},
                'window': {'albersWindow': [1335000, 2232000, 1337000, 2234000], 'pixels': [2000, 2000], 'nodataFraction': 0.0, 'elapsedS': 9.9, 'downloadBytes': 12_000_000,
                           'crs': 'NAD83(2011) / Conus Albers + NAVD88 height', 'pixelM': [1.0, 1.0]},
                'comparison': {'points': 1755, 'medianAbsM': 0.033, 'p95AbsM': 0.23, 'meanSignedM': -0.012, 'retainedAcquisition': ['2017-04-18', '2017-05-09'],
                               'bestShift': {'dxM': 0.5, 'dyM': -1.0, 'medianAbsM': 0.01}}}

    def test_mechanical_checks_read_the_record(self):
        record = self.record()
        self.assertEqual(s1m.mechanical_checks(record), {'aoiFullyCovered': True, 'emptyFractionUnderThreshold': True, 'crsAndGridRetained': True, 'sourceProjectsKnown': True,
                                                         'sourceFlightKnown': True, 'sourceNative1m': True, 'comparedToRetainedTile': True, 'reproducibleWindow': True})
        record['window']['nodataFraction'] = 0.05
        record['coverage']['covered'] = False
        record['sourceUnits']['coarsestSourceM'] = 3   # Greensboro: 1/9 arc-second NED resampled
        checks = s1m.mechanical_checks(record)
        self.assertEqual((checks['aoiFullyCovered'], checks['emptyFractionUnderThreshold'], checks['sourceNative1m']), (False, False, False))

    def test_the_report_renders_every_facility_including_an_empty_one(self):
        record = self.record()
        record['mechanicalChecks'] = s1m.mechanical_checks(record)
        empty = {'facilityId': 'nowhere', 'terrainPolicy': ['usgs_s1m'], 'aoiSource': 'origin_proxy_1500m', 'tiles': [], 'coverage': {'cellsNeeded': 1, 'cellsCovered': 0, 'covered': False, 'missingCells': [(0, 0, 10000, 10000)]}}
        text = s1m.render({'generatedAt': '2026-09-20T01:00:00+00:00', 'facilities': [record, empty]})
        self.assertIn('| synthetic | usgs_s1m | AOI | 1 | 1/1 ✓ | 2026-05-21 | 2017-04-18..2017-05-09 | 1 unit(s): Lidar, 1–1 m, flown 2017-04-18..2017-05-09 |', text)
        self.assertIn('1755, 0.033 m, 0.23 m, -0.012 m; 2017-04-18..2017-05-09 | +0.5, -1 m → 0.01 m |', text)
        self.assertIn('| nowhere | usgs_s1m | origin proxy | 0 | 0/1 ✗ | — | — | — | — | — | — | no retained export | — |', text)
        self.assertIn('| synthetic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |', text)
        self.assertIn('| nowhere | — | — | — | — | — | — | — | — |', text)
        self.assertIn('[source inputs](https://example.test/tile.gpkg)', text)
        self.assertIn('  - 100% of the tile, 100% of the AOI: `NY_Southwest_East_2017` — Lidar, source 1 m, QL QL2, flown 2017-04-18..2017-05-09', text)
        record['comparison']['bestShift'] = {'dxM': 2.0, 'dyM': 2.0, 'medianAbsM': 1.9, 'atSearchEdge': True}
        self.assertIn('+2, +2 m → 1.9 m (at search edge)', s1m.render({'generatedAt': 'x', 'facilities': [record]}))
        self.assertIn('no provider default changed', text)


if __name__ == '__main__':
    unittest.main()

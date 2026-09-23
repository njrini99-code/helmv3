"""Unit tests for fetch-lidar-chm.py: which 3DEP point cloud is trusted to
cover a terrain export, and in what order."""
import importlib.util
import json
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))


def load():
    spec = importlib.util.spec_from_file_location('fetch_lidar_chm', os.path.join(HERE, 'fetch-lidar-chm.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lidar = load()
AOI = (100.0, 200.0, 300.0, 400.0)


def ept(bounds_conforming, srs='3857'):
    return {'srs': {'horizontal': srs}, 'bounds': [-1e9, -1e9, -1e9, 1e9, 1e9, 1e9], 'boundsConforming': bounds_conforming, 'points': 10}


class AcquisitionYearTests(unittest.TestCase):
    def test_first_year_is_the_flight(self):
        self.assertEqual(lidar.acquisition_year('USGS_LPC_VA_Norfolk_2013_LAS_2015'), 2013)
        self.assertEqual(lidar.acquisition_year('VA_SouthamptonHenricoWMBG_1_2019'), 2019)

    def test_no_year_is_unknown(self):
        self.assertIsNone(lidar.acquisition_year('ARRA-CA_GoldenGate'))


class CoversTests(unittest.TestCase):
    def test_conforming_bounds_decide_not_the_octree_cube(self):
        # `bounds` (the padded cube) contains everything; the data does not.
        ok, reason = lidar.covers(ept([500, 500, 0, 900, 900, 10]), AOI)
        self.assertFalse(ok)
        self.assertIn('boundsConforming', reason)

    def test_containing_conforming_bounds_cover(self):
        self.assertEqual(lidar.covers(ept([0, 0, 0, 1000, 1000, 10]), AOI), (True, None))

    def test_other_srs_is_refused(self):
        self.assertFalse(lidar.covers(ept([0, 0, 0, 1000, 1000, 10], srs='26918'), AOI)[0])

    def test_missing_conforming_bounds_is_refused(self):
        doc = ept([0, 0, 0, 1000, 1000, 10])
        del doc['boundsConforming']
        self.assertFalse(lidar.covers(doc, AOI)[0])


class ChooseTests(unittest.TestCase):
    def test_newest_covering_project_wins_and_every_rejection_is_kept(self):
        docs = {'old': ept([0, 0, 0, 1000, 1000, 1]), 'new': ept([0, 0, 0, 1000, 1000, 1]), 'far': ept([5000, 5000, 0, 6000, 6000, 1])}
        candidates = [{'name': 'VA_Old_2013', 'url': 'old'}, {'name': 'VA_Far_2019', 'url': 'far'},
                      {'name': 'VA_New_2018', 'url': 'new'}, {'name': 'VA_Broken_2020', 'url': 'broken'}]

        def fetch(url):
            if url == 'broken':
                raise OSError('403')
            return json.dumps(docs[url]).encode()

        covering, rejected = lidar.choose(candidates, fetch, AOI)
        self.assertEqual([c['name'] for c in covering], ['VA_New_2018', 'VA_Old_2013'])
        self.assertEqual(covering[0]['acquisitionYearInferred'], 2018)
        self.assertEqual(len(covering[0]['eptJsonSha256']), 64)
        self.assertEqual({r['name'] for r in rejected}, {'VA_Far_2019', 'VA_Broken_2020'})


class IndexCandidatesTests(unittest.TestCase):
    def test_only_intersecting_polygons_are_candidates(self):
        from shapely.geometry import box
        square = lambda x0, y0: {'type': 'Polygon', 'coordinates': [[[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1], [x0, y0]]]}
        index = {'features': [{'properties': {'name': 'Here_2015', 'url': 'u1'}, 'geometry': square(-77, 37)},
                              {'properties': {'name': 'There_2016'}, 'geometry': square(-70, 40)},
                              {'properties': {}, 'geometry': square(-77, 37)}]}
        hits = lidar.index_candidates(index, box(-76.7, 37.2, -76.6, 37.3))
        self.assertEqual(hits, [{'name': 'Here_2015', 'url': 'u1'}])


class PipelineTests(unittest.TestCase):
    def test_single_leaf_on_the_export_grid_with_noise_dropped(self):
        extent = {'xmin': 349112, 'ymin': 4124150, 'xmax': 350109, 'ymax': 4126183}
        stages = lidar.pipeline('u', AOI, 32618, extent, 997, 2033, '/tmp/chm.tif')['pipeline']
        writers = [s for s in stages if s['type'].startswith('writers.')]
        self.assertEqual(len(writers), 1)
        self.assertEqual((writers[0]['origin_x'], writers[0]['origin_y'], writers[0]['width'], writers[0]['height'], writers[0]['resolution']),
                         (349112, 4124150, 997, 2033, 1.0))
        self.assertIn('Classification![7:7]', next(s for s in stages if s['type'] == 'filters.range')['limits'])


def tile(project, tile_id, box, size=10, published='2025-01-01'):
    return {'title': f'USGS Lidar Point Cloud {project} {tile_id}', 'downloadURL': f'https://x/{project}/{tile_id}.laz',
            'boundingBox': dict(zip(('minX', 'minY', 'maxX', 'maxY'), box)), 'sizeInBytes': size, 'publicationDate': published}


class NationalMapTileTests(unittest.TestCase):
    """Horry County, SC is 3DEP lidar published only as LAZ tiles."""
    def setUp(self):
        from shapely.geometry import box
        self.aoi = box(0, 0, 2, 1)

    def test_newest_project_whose_tiles_cover_the_export_leads(self):
        items = [tile('SC_2023Horry_D24', 'a', (0, 0, 1, 1)), tile('SC_2023Horry_D24', 'b', (1, 0, 2, 1)),
                 tile('SC_Coast_2017', 'a', (-1, -1, 3, 2)), tile('SC_2023Horry_D24', 'far', (10, 10, 11, 11))]
        covering, rejected = lidar.tnm_projects(items, self.aoi)
        self.assertEqual([p['name'] for p in covering], ['SC_2023Horry_D24', 'SC_Coast_2017'])
        # A tile that misses the export is never downloaded.
        self.assertEqual(covering[0]['tiles'], ['https://x/SC_2023Horry_D24/a.laz', 'https://x/SC_2023Horry_D24/b.laz'])
        self.assertEqual(rejected, [])

    def test_partial_tiles_and_oversized_projects_are_rejected_by_name(self):
        items = [tile('Half_2020', 'a', (0, 0, 1, 1)), tile('Huge_2021', 'a', (-1, -1, 3, 2), size=lidar.TNM_PROJECT_MAX_BYTES + 1),
                 {'title': 'USGS Lidar Point Cloud Meta_2022 x', 'downloadURL': 'https://x/meta.xml', 'boundingBox': {'minX': -1, 'minY': -1, 'maxX': 3, 'maxY': 2}}]
        covering, rejected = lidar.tnm_projects(items, self.aoi)
        self.assertEqual(covering, [])
        self.assertEqual({r['name']: r['reason'].split(' ')[0] for r in rejected}, {'Half_2020': 'tiles', 'Huge_2021': str(lidar.TNM_PROJECT_MAX_BYTES + 1)})

    def test_listing_pages_until_total(self):
        pages = {0: {'total': 3, 'items': [1, 2]}, 2: {'total': 3, 'items': [3]}}
        seen = []

        def fetch(url):
            offset = int(url.split('offset=')[1].split('&')[0])
            seen.append(offset)
            return pages[offset]
        self.assertEqual(lidar.tnm_items((0, 0, 1, 1), fetch), [1, 2, 3])
        self.assertEqual(seen, [0, 2])


class PdalRetryTests(unittest.TestCase):
    def test_a_transient_read_is_retried_then_a_persistent_one_fails(self):
        import tempfile
        from pathlib import Path
        from unittest import mock
        calls = iter([1, 0])
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(lidar.subprocess, 'run',
                side_effect=lambda *a, **k: mock.Mock(returncode=next(calls), stderr='Could not read tile')):
            self.assertEqual(lidar.run_pdal('pdal', {'pipeline': []}, Path(tmp), sleep=lambda s: None), 2)
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(lidar.subprocess, 'run',
                return_value=mock.Mock(returncode=1, stderr='Could not read tile')):
            with self.assertRaisesRegex(RuntimeError, 'after 3 attempts'):
                lidar.run_pdal('pdal', {'pipeline': []}, Path(tmp), sleep=lambda s: None)


class MosaicTests(unittest.TestCase):
    def test_cellwise_max_keeps_nodata_only_where_no_tile_has_returns(self):
        import tempfile
        from pathlib import Path
        import numpy as np
        from osgeo import gdal
        n = lidar.NODATA
        with tempfile.TemporaryDirectory() as tmp:
            paths = []
            for i, values in enumerate(([[n, 2.0], [5.0, n]], [[1.0, 7.0], [n, n]])):
                path = Path(tmp) / f'{i}.tif'
                ds = gdal.GetDriverByName('GTiff').Create(str(path), 2, 2, 1, gdal.GDT_Float32)
                ds.GetRasterBand(1).WriteArray(np.array(values, dtype='float32'))
                ds.GetRasterBand(1).SetNoDataValue(n)
                ds = None
                paths.append(path)
            out = Path(tmp) / 'chm.tif'
            lidar.mosaic(paths, out)
            ds = gdal.Open(str(out))
            self.assertEqual(ds.GetRasterBand(1).ReadAsArray().tolist(), [[1.0, 7.0], [5.0, n]])


if __name__ == '__main__':
    unittest.main()

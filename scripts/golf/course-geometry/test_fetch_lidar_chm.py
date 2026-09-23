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


if __name__ == '__main__':
    unittest.main()

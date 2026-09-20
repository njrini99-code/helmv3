import copy
import json
from pathlib import Path
import tempfile
import unittest

from factory.imagery_extent import acquisition_aoi, index_for_aoi, selected_index


class ImageryExtentTests(unittest.TestCase):
    def setUp(self):
        self.aoi = {'facilityId': 'resort', 'bboxWgs84': [-79.739, 42.056, -79.717, 42.071],
                    'responseSha256': 'original-osm-response', 'polygon': [[-79.73, 42.06]]}
        self.upper = {'layoutId': 'upper', 'facilityId': 'resort',
                      'bboxWgs84': [-79.76, 42.048, -79.733, 42.073]}

    def test_upper_loop_expands_coverage_without_altering_source_boundary(self):
        original = copy.deepcopy(self.aoi)
        result = acquisition_aoi(self.aoi, [self.upper])
        self.assertEqual(result['bboxWgs84'], [-79.76, 42.048, -79.717, 42.073])
        self.assertEqual(self.aoi, original)
        self.assertEqual(result['polygon'], original['polygon'])
        self.assertEqual(result['responseSha256'], original['responseSha256'])
        self.assertFalse(result['acquisitionExtent']['maySupplyHoleAssociation'])
        self.assertFalse(result['acquisitionExtent']['canMeasurePhysicalGeometry'])

    def test_other_facility_does_not_expand_and_unexpanded_keeps_cache(self):
        other = dict(self.upper, facilityId='elsewhere')
        result = acquisition_aoi(self.aoi, [other])
        self.assertEqual(result, self.aoi)
        self.assertEqual(index_for_aoi('/facility', result), Path('/facility/naip-plus-locked-v2/index.json'))

    def test_extent_revision_does_not_reuse_clipped_cache(self):
        expanded = acquisition_aoi(self.aoi, [self.upper])
        self.assertNotEqual(index_for_aoi('/facility', expanded), index_for_aoi('/facility', self.aoi))
        refreshed = dict(expanded, retrievedAt='tomorrow')
        self.assertEqual(index_for_aoi('/facility', expanded), index_for_aoi('/facility', refreshed))
        with tempfile.TemporaryDirectory() as folder:
            old = index_for_aoi(folder, self.aoi)
            old.parent.mkdir(); old.write_text('{}')
            (Path(folder) / 'imagery-aoi.json').write_text(json.dumps(expanded))
            self.assertEqual(selected_index(folder), index_for_aoi(folder, expanded))
            self.assertFalse(selected_index(folder).exists())

    def test_invalid_layout_bounds_fail_closed(self):
        for bounds in ([1, 2, 0, 3], [1, 2, float('nan'), 3], [-181, 2, 0, 3]):
            with self.subTest(bounds=bounds), self.assertRaises(ValueError):
                acquisition_aoi(self.aoi, [dict(self.upper, bboxWgs84=bounds)])


if __name__ == '__main__':
    unittest.main()

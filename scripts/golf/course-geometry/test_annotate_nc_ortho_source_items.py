import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('nc_ortho_source_items', HERE / 'annotate-nc-ortho-source-items.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NcOrthoSourceItemsTests(unittest.TestCase):
    def test_selects_the_single_item_covering_the_native_pixel_size(self):
        result = module.select_native_item([
            {'attributes': {'objectid': 11, 'name': 'pyramid', 'lowps': 20, 'highps': 40, 'date': 1735689600000}},
            {'attributes': {'objectid': 12, 'name': 'native-six-inch', 'lowps': 0.5, 'highps': 2, 'date': 1704067200000}},
        ], 0.5)
        self.assertEqual(result['status'], 'one_native_resolution_catalog_item')
        self.assertEqual(result['item']['objectid'], 12)
        self.assertEqual(result['item']['catalogDate'], '2024-01-01T00:00:00Z')

    def test_marks_overlapping_native_items_as_ambiguous(self):
        result = module.select_native_item([
            {'attributes': {'objectid': 1, 'name': 'first', 'lowps': 0.5, 'highps': 2, 'date': 1}},
            {'attributes': {'objectid': 2, 'name': 'second', 'lowps': 0.25, 'highps': 2, 'date': 2}},
        ], 0.5)
        self.assertEqual(result['status'], 'ambiguous_native_resolution_catalog_items')
        self.assertEqual(result['item'], None)


if __name__ == '__main__':
    unittest.main()

class NcOrthoSourceItemRetryTests(unittest.TestCase):
    def test_retries_transient_identify_failure_before_rejecting_provenance(self):
        from unittest.mock import patch

        responses = [OSError('busy'), b'{"catalogItems":{"features":[]}}']
        with patch.object(module.source, 'read', side_effect=responses) as read, patch.object(module.time, 'sleep') as sleep:
            response = module.identify([1, 2], 'https://example.test/ImageServer')
        self.assertEqual(response['catalogItems']['features'], [])
        self.assertEqual(read.call_count, 2)
        sleep.assert_called_once_with(1)

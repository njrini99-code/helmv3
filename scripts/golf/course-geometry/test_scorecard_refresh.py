import json
import tempfile
import unittest
from pathlib import Path

from factory.scorecard_refresh import refresh
from factory_testkit import COURSE_ID_A, write_catalog


class RefreshTests(unittest.TestCase):
    def test_fills_only_missing_cards_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_catalog(str(root))
            layout_path = root / 'layouts' / 'synthetic-a.json'
            layout = json.loads(layout_path.read_text())
            old = layout['scorecardProfiles']
            for profile in old:
                (root / 'scorecards' / f'{profile}.json').unlink()
            layout['scorecardProfiles'] = []
            layout_path.write_text(json.dumps(layout))
            snapshot = root / 'snapshot.json'
            snapshot.write_text(json.dumps({'queriedAt': '2026-09-20T00:00:00Z',
                'completeness': {'method': 'exact-count-stable-id-pagination'},
                'scorecards': [{'course_id': COURSE_ID_A, 'tee_name': 'Black', 'source': 'manual',
                               'holes': [{'number': i, 'par': 4, 'yardage': 400} for i in range(1, 19)]}]}))
            self.assertEqual(refresh(root, snapshot)['changed'], 1)
            self.assertEqual(json.loads(layout_path.read_text())['scorecardProfiles'], [])
            self.assertEqual(refresh(root, snapshot, True)['changed'], 1)
            self.assertEqual(refresh(root, snapshot, True)['changed'], 0)
            card = json.loads((root / 'scorecards' / 'synthetic-a-black.json').read_text())
            self.assertEqual(card['source']['provider'], 'helm_course_library')
            self.assertIn('source=manual', card['source']['note'])
            self.assertIsNone(json.loads(layout_path.read_text())['geometry'])

    def test_old_capped_export_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'snapshot.json'
            path.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'complete paginated'):
                refresh(tmp, path, True)


if __name__ == '__main__':
    unittest.main()

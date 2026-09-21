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
                'scorecards': [{'course_id': COURSE_ID_A, 'tee_id': '33333333-3333-4333-8333-333333333333', 'tee_name': 'Black', 'source': 'manual',
                               'holes': [{'number': i, 'par': 4, 'yardage': 400} for i in range(1, 19)]}]}))
            self.assertEqual(refresh(root, snapshot)['changed'], 1)
            self.assertEqual(json.loads(layout_path.read_text())['scorecardProfiles'], [])
            self.assertEqual(refresh(root, snapshot, True)['changed'], 1)
            self.assertEqual(refresh(root, snapshot, True)['changed'], 0)
            profile_id = json.loads(layout_path.read_text())['scorecardProfiles'][0]
            card = json.loads((root / 'scorecards' / f'{profile_id}.json').read_text())
            self.assertEqual(card['source']['provider'], 'helm_course_library')
            self.assertIn('source=manual', card['source']['note'])
            self.assertIsNone(json.loads(layout_path.read_text())['geometry'])

    def test_all_same_name_tees_and_revisions_append_without_changing_reference(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_catalog(str(root))
            path = root / 'layouts' / 'synthetic-a.json'
            original = json.loads(path.read_text())
            original_cards = {p: (root / 'scorecards' / f'{p}.json').read_bytes() for p in original['scorecardProfiles']}
            cards = [{'course_id': COURSE_ID_A, 'tee_id': f'{n}' * 8 + '-' + f'{n}' * 4 + '-4' + f'{n}' * 3 + '-8' + f'{n}' * 3 + '-' + f'{n}' * 12,
                      'tee_name': 'White', 'holes': [{'number': i, 'par': 4, 'yardage': yards} for i in range(1, 19)]}
                     for n, yards in [(3, 410), (4, 450)]]
            snapshot = root / 'snapshot.json'
            def save():
                snapshot.write_text(json.dumps({'queriedAt': '2026-09-20', 'completeness': {'method': 'exact-count-stable-id-pagination'}, 'scorecards': cards}))
            save()
            self.assertEqual(refresh(root, snapshot, True)['profilesAdded'], 2)
            current = json.loads(path.read_text())
            self.assertEqual(current['referenceScorecardProfileId'], original['scorecardProfiles'][0])
            first_revision = {p: (root / 'scorecards' / f'{p}.json').read_bytes() for p in current['scorecardProfiles']}
            cards[0]['tee_name'] = 'Tournament White'
            cards[0]['holes'][0]['yardage'] = 415
            save()
            self.assertEqual(refresh(root, snapshot, True)['profilesAdded'], 1)
            self.assertEqual(refresh(root, snapshot, True)['profilesAdded'], 0)
            for profile_id, raw in {**original_cards, **first_revision}.items():
                self.assertEqual((root / 'scorecards' / f'{profile_id}.json').read_bytes(), raw)
            self.assertEqual(json.loads(path.read_text())['referenceScorecardProfileId'], original['scorecardProfiles'][0])

    def test_conflicting_identity_in_one_export_and_missing_tee_id_fail_closed(self):
        from factory.tee_profiles import import_profiles
        card = {'course_id': COURSE_ID_A, 'tee_id': '33333333-3333-4333-8333-333333333333', 'tee_name': 'White',
                'holes': [{'number': i, 'par': 4, 'yardage': 410} for i in range(1, 19)]}
        with self.assertRaisesRegex(ValueError, 'SOURCE_CONFLICT'):
            import_profiles([card, {**card, 'tee_name': 'Other'}], 'synthetic-a', '2026-09-20', 'a' * 64)
        with self.assertRaisesRegex(ValueError, 'TEE_ID_REQUIRED'):
            import_profiles([{**card, 'tee_id': None}], 'synthetic-a', '2026-09-20', 'a' * 64)

    def test_old_capped_export_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'snapshot.json'
            path.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'complete paginated'):
                refresh(tmp, path, True)


if __name__ == '__main__':
    unittest.main()

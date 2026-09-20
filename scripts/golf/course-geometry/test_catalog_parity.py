"""The same accepted/rejected scorecards are exercised by Vitest."""
import copy
import json
import unittest
from pathlib import Path

from factory.catalog import load_catalog, scorecard_problems

ROOT = Path(__file__).resolve().parents[3]


class ScorecardParityTests(unittest.TestCase):
    def test_shared_corpus(self):
        corpus = json.loads((ROOT / 'src/test/fixtures/course-geometry/factory/catalog-invariants.json').read_text())
        for case in corpus['cases']:
            with self.subTest(case['name']):
                card = copy.deepcopy(corpus['base'])
                for change in case['changes']:
                    target = card
                    for key in change['path'][:-1]:
                        target = target[key]
                    key = change['path'][-1]
                    if change.get('remove'):
                        del target[key]
                    else:
                        target[key] = change['repeat'] * change['count'] if 'repeat' in change else change['value']
                self.assertEqual(not scorecard_problems(card), case['valid'], scorecard_problems(card))

    def test_actual_catalog(self):
        self.assertEqual(load_catalog(str(ROOT / 'course-geometry/catalog')).problems, [])


if __name__ == '__main__':
    unittest.main()

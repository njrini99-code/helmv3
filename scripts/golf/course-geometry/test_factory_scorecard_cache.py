"""Additional tee profiles never change the explicitly chosen build card."""
import copy
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from factory_testkit import Harness


class ScorecardCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.mkdtemp(prefix='tee-cache-')
        self.h = Harness(self.temp)

    def tearDown(self):
        self.h.ledger.close()
        shutil.rmtree(self.temp, ignore_errors=True)

    def test_nonreference_profile_import_leaves_geometry_and_acquisition_cached(self):
        layout_path = Path(self.h.catalog) / 'layouts' / 'synthetic-a.json'
        layout = json.loads(layout_path.read_text())
        layout['referenceScorecardProfileId'] = layout['scorecardProfiles'][0]
        layout_path.write_text(json.dumps(layout))
        code, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        original = Path(self.h.output) / 'layouts' / 'synthetic-a' / 'package' / 'normalized.json'
        original_bytes = original.read_bytes()
        other = copy.deepcopy(json.loads((Path(self.h.catalog) / 'scorecards' / 'synthetic-a-blue.json').read_text()))
        other['profileId'] = 'synthetic-a-white'
        other['teeName'] = 'White'
        for hole in other['holes']:
            hole['yards'] -= 30
        (Path(self.h.catalog) / 'scorecards' / 'synthetic-a-white.json').write_text(json.dumps(other))
        layout['scorecardProfiles'].insert(0, other['profileId'])
        layout_path.write_text(json.dumps(layout))
        mark = len(self.h.pipeline.calls)
        code, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        self.assertEqual(original.read_bytes(), original_bytes)
        changed = self.h.pipeline.calls[mark:]
        self.assertEqual([task for task in changed if task.startswith(('facility.', 'layout.package.', 'layout.terrain.', 'layout.canopy.', 'hole.'))], [])
        self.assertEqual(self.h.states('synthetic-a')['layout.identity.resolve[synthetic-a]'][0], 'cached')


if __name__ == '__main__':
    unittest.main()

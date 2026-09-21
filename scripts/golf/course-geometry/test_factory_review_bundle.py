"""The factory's review command uses retained outputs, never the fixture lab."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from factory_testkit import Harness


class ReviewBundleCommandTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='factory-review-', dir=os.path.realpath(tempfile.gettempdir()))
        self.h = Harness(self.temp.name)
        code, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)

    def tearDown(self):
        self.h.ledger.close()
        self.temp.cleanup()

    def test_exports_all_holes_without_mutating_sources_fixtures_or_approval(self):
        fixture = Path(self.h.repo) / 'src/test/fixtures/course-geometry/browser/fixture-assets.ts'
        fixture.parent.mkdir(parents=True)
        fixture.write_text('existing fixture registry; do not edit')
        source_files = [fixture, Path(self.h.catalog) / 'layouts/synthetic-a.json',
                        Path(self.h.output) / 'layouts/synthetic-a/package/normalized.json',
                        Path(self.h.output) / 'layouts/synthetic-a/capability-report.json']
        before = {path: path.read_bytes() for path in source_files}
        with patch('factory.review_bundle.subprocess.run') as run:
            code, text = self.h.run('review-bundle', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        self.assertIn('"holeCount": 18', text)
        self.assertIn('Local review only', text)
        self.assertEqual(before, {path: path.read_bytes() for path in source_files})
        run.assert_not_called()
        bundles = list((Path(self.h.output) / 'lab/bundles/synthetic-a').glob('*.json'))
        self.assertEqual(len(bundles), 1)
        self.assertFalse(json.loads(bundles[0].read_text())['measurementAuthority'])

    def test_unknown_layout_and_corrupt_source_hash_fail_closed(self):
        code, text = self.h.run('review-bundle', '--layout', 'missing-layout')
        self.assertEqual(code, 1)
        self.assertIn('unknown layout', text)
        package = Path(self.h.output) / 'layouts/synthetic-a/package/normalized.json'
        doc = json.loads(package.read_text())
        doc['contentHash'] = 'f' * 64
        package.write_text(json.dumps(doc))
        code, text = self.h.run('review-bundle', '--layout', 'synthetic-a')
        self.assertEqual(code, 1)
        self.assertIn('contentHash mismatch', text)

    def test_unavailable_lab_has_actionable_error_and_launches_no_server(self):
        with patch('factory.review_bundle.require_served_bundle', side_effect=OSError('connection refused')), \
                patch('factory.review_bundle.subprocess.run') as run:
            code, text = self.h.run('review-bundle', '--layout', 'synthetic-a', '--capture')
        self.assertEqual(code, 1)
        self.assertIn('factory-lab.config.ts', text)
        self.assertIn('No server was launched', text)
        run.assert_not_called()

    def test_server_manifest_wrong_hash_refuses_capture(self):
        with patch('factory.review_bundle.http.client.HTTPConnection') as connection, \
                patch('factory.review_bundle.subprocess.run') as run:
            response = connection.return_value.getresponse.return_value
            response.status, response.read.return_value = 200, b'{"another":"bundle"}'
            code, text = self.h.run('review-bundle', '--layout', 'synthetic-a', '--capture')
        self.assertEqual(code, 1)
        self.assertIn('lab manifest hash mismatch', text)
        run.assert_not_called()

    def test_capture_failure_returns_failure(self):
        with patch('factory.review_bundle.require_served_bundle'), \
                patch('factory.review_bundle.shutil.which', return_value='/usr/bin/node'), \
                patch('factory.review_bundle.subprocess.run', return_value=SimpleNamespace(returncode=7, stdout='', stderr='failed capture')):
            code, text = self.h.run('review-bundle', '--layout', 'synthetic-a', '--capture')
        self.assertEqual(code, 1)
        self.assertIn('exit 7', text)

    def test_capture_uses_one_serial_script_and_configured_output_root(self):
        def capture(command, **_kwargs):
            args = dict(arg[2:].split('=', 1) for arg in command[2:])
            folder = Path(args['out'])
            self.assertTrue(folder.is_relative_to(Path(self.h.output)))
            manifest = json.loads((Path(self.h.output) / f'lab/bundles/synthetic-a/{args["bundle"]}.json').read_text())
            folder.mkdir(parents=True)
            (folder / 'captures.json').write_text(json.dumps({
                'schema': 'golfhelm-factory-bundle-captures-v1', 'layoutId': 'synthetic-a',
                'bundleHash': args['bundle'], 'packageHash': manifest['packageHash'],
                'captures': [{'holeKey': hole['key']} for hole in manifest['holes']], 'errors': [], 'physicallyApproved': False}))
            return SimpleNamespace(returncode=0, stdout='', stderr='')

        with patch('factory.review_bundle.require_served_bundle'), \
                patch('factory.review_bundle.shutil.which', return_value='/usr/bin/node'), \
                patch('factory.review_bundle.subprocess.run', side_effect=capture) as run:
            code, text = self.h.run('review-bundle', '--layout', 'synthetic-a', '--capture')
        self.assertEqual(code, 0, text)
        self.assertIn('review captures:', text)
        run.assert_called_once()


if __name__ == '__main__':
    unittest.main()

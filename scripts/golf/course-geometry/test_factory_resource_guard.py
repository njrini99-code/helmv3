"""A long factory run must recheck disk capacity before each writer."""
import io
import tempfile
import unittest
from unittest.mock import patch

from factory import cli, disk
from factory_testkit import Harness


class LiveDiskGuardTests(unittest.TestCase):
    def test_prior_writer_consumption_blocks_next_writer_and_resume_reuses_output(self):
        with tempfile.TemporaryDirectory(prefix='factory-live-disk-') as tmp:
            harness = Harness(tmp)
            try:
                available = [disk.reserve_bytes() + 20_000_000]
                executors = harness.pipeline.executors()
                real_aoi = executors['facility.aoi.resolve']

                def consume_space(node, ctx, run):
                    result = real_aoi(node, ctx, run)
                    # The first source task succeeds, but another writer or
                    # application has consumed the remaining workspace.
                    available[0] = disk.reserve_bytes() + 1_000_000
                    return result

                executors['facility.aoi.resolve'] = consume_space
                argv = ['--repo-root', harness.repo, '--output', harness.output,
                        'run', '--layout', 'synthetic-a', '--task', 'facility.osm.snapshot']
                output = io.StringIO()
                with patch('factory.disk.free_bytes', side_effect=lambda _: available[0]):
                    result = cli.main(argv, out=output, ledger=harness.ledger, executors=executors)
                self.assertEqual(result, 0, output.getvalue())
                self.assertIn('DISK_GUARD_BLOCKED', output.getvalue())
                self.assertEqual(harness.pipeline.calls, ['facility.aoi.resolve[synthetic]'])

                available[0] = disk.reserve_bytes() + 20_000_000
                with patch('factory.disk.free_bytes', side_effect=lambda _: available[0]):
                    result = cli.main(argv, out=io.StringIO(), ledger=harness.ledger, executors=executors)
                self.assertEqual(result, 0)
                self.assertEqual(harness.pipeline.calls,
                                 ['facility.aoi.resolve[synthetic]', 'facility.osm.snapshot[synthetic]'])
            finally:
                harness.ledger.close()


if __name__ == '__main__':
    unittest.main()

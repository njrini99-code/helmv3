"""A reviewed-evidence edit invalidates only the affected physical admission."""
import os
import tempfile
import unittest

from factory_testkit import Harness, read_json, write_json
from physical_admission import REVIEW_KIND


class PhysicalReviewImpactTest(unittest.TestCase):
    def test_review_for_one_hole_rebuilds_that_world_without_raster_or_mesh_work(self):
        with tempfile.TemporaryDirectory(prefix='factory-review-') as temporary:
            harness = Harness(temporary)
            self.addCleanup(harness.ledger.close)
            code, text = harness.run('run', '--layout', 'synthetic-a')
            self.assertEqual(code, 0, text)
            layout_path = os.path.join(harness.catalog, 'layouts', 'synthetic-a.json')
            layout = read_json(layout_path)
            review_path = os.path.join(temporary, 'admission-review.json')
            layout.setdefault('retained', {})['physicalAdmission'] = review_path
            write_json(layout_path, layout)
            package = read_json(os.path.join(harness.output, 'layouts', 'synthetic-a', 'package', 'normalized.json'))
            review = {'kind': REVIEW_KIND, 'packageHash': package['contentHash'], 'holes': {}}
            write_json(review_path, review)
            code, text = harness.run('run', '--layout', 'synthetic-a')
            self.assertEqual(code, 0, text)
            review['holes']['synthetic-a-07'] = {'holeKey': 'synthetic-a-07', 'review': {'status': 'pending'}}
            write_json(review_path, review)
            mark = len(harness.pipeline.calls)
            code, text = harness.run('run', '--layout', 'synthetic-a')
            self.assertEqual(code, 0, text)
            calls = harness.pipeline.calls[mark:]
            self.assertEqual([key for key in calls if key.startswith('hole.world.build')], ['hole.world.build[synthetic-a:07]'])
            self.assertFalse(any(key.startswith(('hole.terrain.compile', 'layout.terrain.acquire', 'layout.terrain.base')) for key in calls), calls)
            report = read_json(os.path.join(harness.output, 'layouts', 'synthetic-a', 'capability-report.json'))
            self.assertFalse(report['perHole']['synthetic-a-07']['capabilities']['measureGreenDistance']['allowed'])
            self.assertTrue(report['admissionVersion'])
            # No pending review may be upgraded by a successful compiler run.
            self.assertEqual(read_json(review_path)['holes']['synthetic-a-07']['review']['status'], 'pending')


if __name__ == '__main__':
    unittest.main()

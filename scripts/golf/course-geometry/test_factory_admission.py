"""Admission is independent of successful rendering and catalog assertions."""
import copy
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from factory.tasks.aggregate_tasks import capability_report


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.pkg = {'contentHash': 'a' * 64, 'status': 'reviewed_draft',
                    'holes': [{'key': 'test-01', 'ordinal': 1}],
                    'features': [{'id': 'green', 'kind': 'green', 'reviewed': True},
                                 {'id': 'route', 'kind': 'route', 'reviewed': True}]}
        self.record = {'key': 'test-01', 'packageHash': 'a' * 64, 'truthGatePassed': True}
        self.verification = {'kind': 'golfhelm-factory-publish-verification-v1', 'layoutId': 'test',
                             'packageHash': 'a' * 64, 'ok': True}
        self.ctx = SimpleNamespace(
            layout=lambda _: {'capabilityTier': 'C4'}, package=lambda _: self.pkg,
            package_hash=lambda _: self.pkg['contentHash'], package_hole=lambda *_: self.pkg['holes'][0],
            graph=SimpleNamespace(layout_holes={'test': ['test:01']}), layout_out=lambda _: '/test',
            json=lambda path: self.verification if path.endswith('publish-verification.json') else self.record,
            states={key: 'cached' for key in ['hole.terrain.compile[test:01]', 'hole.world.build[test:01]',
                                             'layout.publish.prepare[test]', 'layout.publish.verify[test]']})
        self.node = SimpleNamespace(scope=SimpleNamespace(layout_id='test'))
        self.currency = patch('factory.tasks.aggregate_tasks.imagery.currency', return_value=None)
        self.currency.start()
        self.addCleanup(self.currency.stop)

    def report(self):
        return capability_report(self.node, self.ctx)

    def test_failed_verify_cannot_release_prepared_assets(self):
        self.ctx.states['layout.publish.verify[test]'] = 'failed'
        report = self.report()
        self.assertEqual(report['earnedTier'], 'C1')
        self.assertFalse(report['capabilities']['productionVisual'])
        self.assertFalse(report['capabilities']['tapToMeasure'])
        self.assertIn('PUBLISH_VERIFICATION_REQUIRED', report['blockedHigherTiers']['C2'])

    def test_approved_boundaries_promote_to_c3_without_fabricated_blocker(self):
        report = self.report()
        self.assertEqual(report['earnedTier'], 'C3')
        self.assertNotIn('C3', report['blockedHigherTiers'])
        self.assertFalse(report['capabilities']['fieldVerified'])

    def test_c2_does_not_grant_measurement(self):
        self.pkg['status'] = 'source_candidate'
        report = self.report()
        self.assertEqual(report['earnedTier'], 'C2')
        self.assertTrue(report['capabilities']['productionVisual'])
        self.assertFalse(report['capabilities']['tapToMeasure'])

    def test_stale_records_do_not_grant_admission(self):
        for record in (self.record, self.verification):
            with self.subTest(record=record):
                original = copy.deepcopy(record)
                record['packageHash'] = 'b' * 64
                self.assertFalse(self.report()['capabilities']['tapToMeasure'])
                record.update(original)

    def test_unreviewed_route_identity_blocks_physical_admission(self):
        self.pkg['features'][1]['reviewed'] = False
        self.assertEqual(self.report()['earnedTier'], 'C2')


if __name__ == '__main__':
    unittest.main()

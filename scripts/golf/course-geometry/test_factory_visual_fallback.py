"""Factory contract for route-unresolved visual facility worlds."""
import shutil
import tempfile
import unittest
import os

from factory_testkit import Harness, World, read_json


class VisualFallbackFactoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-visual-fallback-')
        self.harness = Harness(self.tmp, world=World(), site_a_shared=True)

    def tearDown(self):
        self.harness.ledger.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_unresolved_route_builds_a_renderable_non_measurable_facility_world(self):
        code, text = self.harness.run('run', '--layout', 'synthetic-a', '--task', 'layout.visual.world.build')
        self.assertEqual(code, 0, text)
        states = self.harness.states('synthetic-a')
        self.assertEqual(states['layout.routes.resolve[synthetic-a]'], ('blocked', 'ROUTE_WAY_IDS_REQUIRED'))
        self.assertEqual(states['layout.visual.world.build[synthetic-a]'][0], 'cached')
        pointer = read_json(os.path.join(self.harness.output, 'layouts', 'synthetic-a', 'visual-world.json'))
        self.assertTrue(pointer['renderingContract']['canRender'])
        self.assertFalse(pointer['renderingContract']['canMeasure'])
        self.assertFalse(pointer['canonicalHoleRoutesAdmitted'])

    def test_catalog_batch_includes_the_visual_fallback_for_unresolved_layouts(self):
        code, text = self.harness.run('batch', '--all-layouts', '--until', 'layout.world.aggregate')
        self.assertEqual(code, 0, text)
        self.assertIn('layout.visual.world.build[synthetic-a]', self.harness.pipeline.calls)
        self.assertTrue(os.path.isfile(os.path.join(self.harness.output, 'layouts', 'synthetic-a', 'visual-world.json')))


if __name__ == '__main__':
    unittest.main()

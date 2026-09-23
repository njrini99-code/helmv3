"""Factory contract for route-unresolved visual facility worlds."""
import json
import os
import shutil
import tempfile
import unittest

from factory.adapters import (
    canopy_source_precondition,
    derived_output_lock,
    reset_incomplete_visual_source_cache,
    terrain_acquisition_precondition,
    visual_source_cache_complete,
    visual_terrain_candidate_path,
    visual_terrain_source_root,
)
from factory.providers import TerrainProvider
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

    def test_stale_candidate_report_is_regenerated_when_coverage_contract_is_missing(self):
        code, text = self.harness.run('run', '--layout', 'synthetic-a', '--task', 'layout.visual.candidates.compose')
        self.assertEqual(code, 0, text)
        report_path = os.path.join(self.harness.output, 'facilities', 'synthetic', 'visual-candidate', 'visual-candidate-report.json')
        stale = read_json(report_path)
        stale.pop('sourceCoverage')
        stale.pop('visualReadiness')
        with open(report_path, 'w', encoding='utf-8') as handle:
            import json
            json.dump(stale, handle)
        code, text = self.harness.run('run', '--layout', 'synthetic-a', '--task', 'layout.visual.candidates.compose')
        self.assertEqual(code, 0, text)
        rebuilt = read_json(report_path)
        self.assertIn('sourceCoverage', rebuilt)
        self.assertIn('visualReadiness', rebuilt)

    def test_route_ready_but_failed_native_terrain_keeps_visual_fallback_non_measurable(self):
        # A good route cannot make a failed native terrain source disappear.
        # The scene may still be useful facility context, but it carries no
        # route association or measurement authority.
        layout_path = os.path.join(self.harness.catalog, 'layouts', 'synthetic-a.json')
        with open(layout_path, encoding='utf-8') as stream:
            layout = json.load(stream)
        layout['routeWayIds'] = list(range(1001, 1019))
        with open(layout_path, 'w', encoding='utf-8') as stream:
            json.dump(layout, stream)

        def failed_terrain(node, ctx, run):
            self.harness.pipeline._mark(node)
            raise RuntimeError('VERTICAL_UNIT_UNKNOWN: native terrain unavailable for physical use')

        executors = self.harness.pipeline.executors()
        executors['layout.terrain.acquire'] = failed_terrain
        code, text = self.harness.run('run', '--layout', 'synthetic-a', '--task', 'layout.visual.world.build', executors=executors)
        # The physical task remains failed and visible in the run result.
        # The independently useful visual branch still completes.
        self.assertEqual(code, 1, text)
        pointer = read_json(os.path.join(self.harness.output, 'layouts', 'synthetic-a', 'visual-world.json'))
        candidate = read_json(os.path.join(self.harness.output, 'layouts', 'synthetic-a', 'visual-candidate.json'))
        self.assertEqual(candidate['routeStatus'], 'route_admitted_terrain_unavailable')
        self.assertFalse(pointer['canonicalHoleRoutesAdmitted'])
        self.assertTrue(pointer['renderingContract']['canRender'])
        self.assertFalse(pointer['renderingContract']['canMeasure'])

    def test_route_ready_with_native_terrain_suppresses_facility_fallback(self):
        layout_path = os.path.join(self.harness.catalog, 'layouts', 'synthetic-a.json')
        with open(layout_path, encoding='utf-8') as stream:
            layout = json.load(stream)
        layout['routeWayIds'] = list(range(1001, 1019))
        with open(layout_path, 'w', encoding='utf-8') as stream:
            json.dump(layout, stream)
        code, text = self.harness.run('run', '--layout', 'synthetic-a', '--task', 'layout.visual.candidates.compose')
        self.assertEqual(code, 0, text)
        pointer = read_json(os.path.join(self.harness.output, 'layouts', 'synthetic-a', 'visual-candidate.json'))
        self.assertEqual(pointer['status'], 'not_required_source_route_available')
        self.assertTrue(pointer['canonicalHoleRoutesAdmitted'])

    def test_rendering_only_manifest_is_rejected_by_physical_terrain_task(self):
        # This models a future wiring regression: the visual fallback may
        # produce a terrain-shaped source manifest, but it cannot be adopted
        # by a physical layout task.
        layout_path = os.path.join(self.harness.catalog, 'layouts', 'synthetic-a.json')
        with open(layout_path, encoding='utf-8') as stream:
            layout = json.load(stream)
        layout['routeWayIds'] = list(range(1001, 1019))
        with open(layout_path, 'w', encoding='utf-8') as stream:
            json.dump(layout, stream)
        code, text = self.harness.run('run', '--layout', 'synthetic-a', '--task', 'layout.terrain.acquire')
        self.assertEqual(code, 0, text)
        pointer = read_json(os.path.join(self.harness.output, 'layouts', 'synthetic-a', 'terrain-source.json'))
        manifest_path = os.path.join(self.harness.repo, pointer['directory'], 'source-manifest.json')
        manifest = read_json(manifest_path)
        manifest['renderingOnly'] = True
        with open(manifest_path, 'w', encoding='utf-8') as stream:
            json.dump(manifest, stream)

        code, _text = self.harness.run('run', '--layout', 'synthetic-a', '--task', 'layout.terrain.acquire')
        self.assertEqual(code, 0)
        self.assertEqual(
            self.harness.states('synthetic-a')['layout.terrain.acquire[synthetic-a]'],
            ('blocked', 'RENDERING_ONLY_TERRAIN_SOURCE'),
        )

    def test_missing_visual_raster_does_not_poison_a_vertical_unknown_fallback_retry(self):
        # The Landfall failure mode: a physical NC attempt correctly refuses
        # unknown Z evidence, then a prior class-C eviction leaves a visual
        # manifest but no raster. The visual retry must start a fresh derived
        # cache; it may render, but cannot become physical terrain.
        cache = os.path.join(self.harness.output, 'facilities', 'synthetic', 'visual-terrain', 'native-visual-r2m-v1')
        os.makedirs(cache)
        with open(os.path.join(cache, 'source-manifest.json'), 'w', encoding='utf-8') as stream:
            json.dump({'fileHashes': {'elevation.tiff': '0' * 64}}, stream)
        self.assertFalse(visual_source_cache_complete(cache))
        class OutputContext:
            def inside_output(_self, path):
                return os.path.commonpath([self.harness.output, os.path.abspath(path)]) == self.harness.output
        reset_incomplete_visual_source_cache(OutputContext(), cache)
        self.assertFalse(os.path.exists(cache))

    def test_derived_output_lock_is_outside_the_replaceable_cache_directory(self):
        # A visual acquisition/world compile removes its output directory. The
        # lock therefore has to survive beside it rather than inside it.
        cache = os.path.join(self.harness.output, 'facilities', 'synthetic', 'visual-terrain', 'cache')

        class OutputContext:
            def inside_output(_self, path):
                return os.path.commonpath([self.harness.output, os.path.abspath(path)]) == self.harness.output

        with derived_output_lock(OutputContext(), cache):
            self.assertTrue(os.path.isfile(cache + '.lock'))
            os.makedirs(cache)
            shutil.rmtree(cache)
            self.assertTrue(os.path.isfile(cache + '.lock'))

    def test_new_visual_cache_namespace_does_not_reuse_old_nc_frame_contract(self):
        class OutputContext:
            def facility_out(_self, facility_id):
                return os.path.join(self.harness.output, 'facilities', facility_id)
        package = {'contentHash': 'a' * 64}
        provider = TerrainProvider('nc', 'nc_onemap_dem03', 'NC')
        root = visual_terrain_source_root(OutputContext(), 'synthetic', package, provider)
        candidate = visual_terrain_candidate_path(root, 2)
        self.assertTrue(root.endswith('aaaaaaaaaaaa-nc-native-frame-v3'))
        self.assertTrue(candidate.endswith('-visual-r2m-v2'))
        self.assertNotIn('nc-native-v2-visual-r2m-v1', candidate)

    def test_catalog_batch_includes_the_visual_fallback_for_unresolved_layouts(self):
        code, text = self.harness.run('batch', '--all-layouts', '--until', 'layout.world.aggregate')
        self.assertEqual(code, 0, text)
        self.assertIn('layout.visual.world.build[synthetic-a]', self.harness.pipeline.calls)
        self.assertTrue(os.path.isfile(os.path.join(self.harness.output, 'layouts', 'synthetic-a', 'visual-world.json')))

    def test_expected_terrain_evidence_gaps_become_blockers_not_factory_failures(self):
        nc = TerrainProvider('nc', 'nc_onemap_dem03', 'NC')
        usgs = TerrainProvider('usgs', 'usgs_3dep_project_1m', 'USGS')
        self.assertEqual(
            terrain_acquisition_precondition(RuntimeError('NC_SOURCE_SELECTION_UNRESOLVED'), 'synthetic-a', nc).blocker.code,
            'NC_SOURCE_SELECTION_UNRESOLVED',
        )
        selection = terrain_acquisition_precondition(
            RuntimeError('NC_SOURCE_SELECTION_UNRESOLVED'), 'synthetic-a', nc,
            'facilities/synthetic/terrain/source-selection-dossier.json',
        )
        self.assertEqual(selection.blocker.evidence['sourceSelectionDossierPath'],
                         'facilities/synthetic/terrain/source-selection-dossier.json')
        self.assertEqual(
            terrain_acquisition_precondition(RuntimeError('No native-1m tile set covers the full bounded course context'), 'synthetic-a', usgs).blocker.code,
            'NATIVE_TERRAIN_COVERAGE_GAP',
        )
        self.assertEqual(
            terrain_acquisition_precondition(RuntimeError('Every covering terrain tile exported empty fill over the course context'), 'synthetic-a', usgs).blocker.code,
            'TERRAIN_EXPORT_EMPTY',
        )
        self.assertEqual(
            terrain_acquisition_precondition(RuntimeError('SOURCE_FRAME_UNVERIFIED: cache frame differs'), 'synthetic-a', nc).blocker.code,
            'SOURCE_FRAME_UNVERIFIED',
        )
        self.assertEqual(
            canopy_source_precondition(RuntimeError('HTTP Error 500: upstream'), 'synthetic-a').blocker.code,
            'CANOPY_SOURCE_TRANSIENT',
        )


if __name__ == '__main__':
    unittest.main()

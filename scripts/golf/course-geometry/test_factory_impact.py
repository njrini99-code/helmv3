"""Change-impact tests for the course factory (Factory v2 PR B): a synthetic
two-layout facility built by fake executors, then edits whose blast radius
must stay exactly where the design says. Network-free."""
import json
import os
import shutil
import tempfile
import unittest

from factory.fingerprints import file_sha256
from factory.ledger import Ledger
from factory_testkit import Harness

DONE = ('cached', 'success')


def read_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


class ImpactTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-impact-')
        self.h = Harness(self.tmp)

    def tearDown(self):
        self.h.ledger.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def executable(self, states):
        """Nodes an adapter runs (sign-off captures and publishing stay blocked by design)."""
        skip = ('hole.visual.canary', 'hole.player.capture', 'layout.visual.aggregate', 'layout.player.aggregate', 'layout.publish.prepare', 'layout.publish.verify', 'layout.review.compose')
        return {k: v for k, v in states.items() if not k.startswith(skip)}

    def test_full_run_reaches_a_cached_fixed_point_and_shares_facility_nodes(self):
        code, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        self.assertIn('failed 0', text)
        states = self.h.states('synthetic-a')
        not_done = {k: v for k, v in self.executable(states).items() if v[0] not in DONE}
        self.assertEqual(not_done, {}, f'second plan should be all cached: {not_done}')
        self.assertEqual(states['layout.routes.resolve[synthetic-a]'][0], 'cached')
        routes = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'routes.json'))
        self.assertEqual(routes['source'], 'osm_ref_unique')
        self.assertEqual(len(routes['routeWayIds']), 18)
        # Layout B shares the facility snapshots: they are cached before B runs anything.
        b = self.h.states('synthetic-b')
        self.assertEqual(b['facility.osm.snapshot[synthetic]'][0], 'cached')
        self.assertEqual(b['facility.context.snapshot[synthetic]'][0], 'cached')
        self.assertEqual(b['facility.aoi.resolve[synthetic]'][0], 'cached')
        self.assertEqual(b['layout.routes.resolve[synthetic-b]'][0], 'ready')
        # Blocked-by-design rows stay honest.
        self.assertEqual(states['layout.publish.prepare[synthetic-a]'], ('blocked', 'PUBLISH_NOT_APPROVED'))
        self.assertEqual(states['hole.visual.canary[synthetic-a:01]'], ('blocked', 'ADAPTER_NOT_IMPLEMENTED'))
        report = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'capability-report.json'))
        self.assertEqual(report['earnedTier'], 'C1')
        self.assertIn('PUBLISH_NOT_APPROVED', report['blockedHigherTiers']['C2'])
        queue = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'review-queue.json'))
        self.assertIn('route_confirmation', [i['pass'] for i in queue['items']])

    def test_one_hole_bunker_edit_rebuilds_that_hole_only(self):
        self.h.run('run', '--layout', 'synthetic-a')
        self.h.world.bunker_shift[7] = 0.00002        # hole 7's bunker moved in OSM
        states = self.h.states('synthetic-a')
        stale_holes = sorted(k for k, v in states.items() if k.startswith('hole.terrain.compile') and v[0] != 'cached')
        self.assertEqual(stale_holes, [])                # the extract has not been re-fetched: nothing downstream may move yet
        self.assertEqual(states['facility.osm.snapshot[synthetic]'][0], 'cached', 'a retained extract is immutable until someone asks for a new one')
        code, text = self.h.run('invalidate', '--layout', 'synthetic-a', '--task', 'facility.osm.snapshot', '--reason', 'OSM edit reported')
        self.assertEqual(code, 0, text)
        self.assertEqual(self.h.states('synthetic-a')['facility.osm.snapshot[synthetic]'], ('stale', 'MANUAL_INVALIDATION'))
        mark = len(self.h.pipeline.calls)
        _code, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertIn('failed 0', text)
        # The first run built all 18 holes; the second run built hole 7 only.
        second = self.h.pipeline.calls[mark:]
        self.assertIn('facility.osm.snapshot[synthetic]', second)
        self.assertEqual([k for k in second if k.startswith('hole.terrain.compile')], ['hole.terrain.compile[synthetic-a:07]'])
        self.assertEqual([k for k in second if k.startswith('hole.world.build')], ['hole.world.build[synthetic-a:07]'])
        self.assertIn('layout.terrain.aggregate[synthetic-a]', second)
        self.assertNotIn('layout.terrain.acquire[synthetic-a]', second, 'the footprint did not change, so the raster is not re-acquired')

    def test_scorecard_only_edit_leaves_terrain_source_and_meshes_cached(self):
        self.h.run('run', '--layout', 'synthetic-a')
        card_path = os.path.join(self.h.catalog, 'scorecards', 'synthetic-a-blue.json')
        with open(card_path, encoding='utf-8') as f:
            card = json.load(f)
        card['holes'][2]['yards'] = 455
        with open(card_path, 'w', encoding='utf-8') as f:
            json.dump(card, f)
        states = self.h.states('synthetic-a')
        self.assertEqual(states['catalog.validate[synthetic]'][0], 'stale', states['catalog.validate[synthetic]'])
        mark = len(self.h.pipeline.calls)
        _code, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertIn('failed 0', text)
        second = self.h.pipeline.calls[mark:]
        self.assertIn('layout.scorecard.compose[synthetic-a]', second)
        self.assertNotIn('facility.aoi.resolve[synthetic]', second)
        self.assertNotIn('layout.terrain.acquire[synthetic-a]', second)
        self.assertEqual([k for k in second if k.startswith('hole.terrain.compile')], [])
        self.assertEqual([k for k in second if k.startswith('hole.world.build')], [])
        self.assertIn('layout.package.compose[synthetic-a]', second)   # yards live in the package, so it is re-prepared

    def test_renderer_version_bump_touches_visual_nodes_only(self):
        self.h.run('run', '--layout', 'synthetic-a')
        before = self.h.states('synthetic-a')
        self.h.overrides = {'hole.visual.canary': {'version': '2'}}
        after = self.h.states('synthetic-a')
        changed = {k for k in after if after[k] != before[k]}
        self.assertTrue(all(k.startswith(('hole.visual.canary', 'hole.player.capture', 'layout.visual.aggregate', 'layout.player.aggregate')) for k in changed) or not changed, changed)
        self.assertEqual(after['layout.package.compose[synthetic-a]'][0], 'cached')
        self.assertEqual(after['layout.terrain.acquire[synthetic-a]'][0], 'cached')
        self.assertEqual(after['hole.terrain.compile[synthetic-a:03]'][0], 'cached')

    def test_missing_and_corrupt_artifacts_invalidate_despite_a_success_row(self):
        self.h.run('run', '--layout', 'synthetic-a')
        compiled = os.path.join(self.h.output, 'layouts', 'synthetic-a', 'compiled')
        os.remove(os.path.join(compiled, 'synthetic-a-04-terrain.json'))
        with open(os.path.join(compiled, 'synthetic-a-09-terrain.json'), 'a') as f:
            f.write('\n// corrupted')
        states = self.h.states('synthetic-a')
        self.assertEqual(states['hole.terrain.compile[synthetic-a:04]'], ('stale', 'ARTIFACT_MISSING'))
        self.assertEqual(states['hole.terrain.compile[synthetic-a:09]'], ('stale', 'ARTIFACT_CORRUPT'))
        self.assertEqual(states['hole.terrain.compile[synthetic-a:05]'][0], 'cached')
        _code, text = self.h.run('run', '--layout', 'synthetic-a', '--task', 'hole.terrain.compile')
        self.assertIn('failed 0', text)
        self.assertEqual(self.h.states('synthetic-a')['hole.terrain.compile[synthetic-a:04]'][0], 'cached')

    def test_interrupted_run_is_recovered_and_rebuilt(self):
        self.h.run('run', '--layout', 'synthetic-a', '--until', 'layout.candidates.compose')
        node_key = 'layout.candidates.compose[synthetic-a]'
        # Simulate a crash: a running row whose pid is gone.
        self.h.ledger.db.execute("UPDATE task_runs SET state='running', finished_at=NULL, pid=999999 WHERE task_key=?", (node_key,))
        self.h.ledger.db.commit()
        states = self.h.states('synthetic-a')
        self.assertEqual(states[node_key], ('ready', 'INTERRUPTED_RUN_RECOVERED'))
        _code, text = self.h.run('run', '--layout', 'synthetic-a', '--until', 'layout.candidates.compose')
        self.assertIn('failed 0', text)
        self.assertEqual(self.h.states('synthetic-a')[node_key][0], 'cached')

    def test_manual_invalidation_rebuilds_one_hole(self):
        self.h.run('run', '--layout', 'synthetic-a')
        code, text = self.h.run('invalidate', '--layout', 'synthetic-a', '--task', 'hole.terrain.compile', '--hole', '11', '--reason', 'reviewer asked')
        self.assertEqual(code, 0, text)
        states = self.h.states('synthetic-a')
        self.assertEqual(states['hole.terrain.compile[synthetic-a:11]'], ('stale', 'MANUAL_INVALIDATION'))
        self.assertEqual(states['hole.terrain.compile[synthetic-a:12]'][0], 'cached')
        code, text = self.h.run('why', '--layout', 'synthetic-a', '--task', 'hole.terrain.compile', '--hole', '11')
        self.assertIn('MANUAL_INVALIDATION', text)



class BlockerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-blockers-')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_ambiguous_site_blocks_routes_and_the_root_reaches_every_descendant(self):
        # Layout A names the shared resort polygon: both courses' hole ways
        # sit inside it, every ref repeats, and the factory must not guess.
        h = Harness(self.tmp, site_a_shared=True)
        try:
            code, text = h.run('run', '--layout', 'synthetic-a')
            self.assertEqual(code, 0, text)
            rows = h.plan_rows('synthetic-a')
            routes = rows['layout.routes.resolve[synthetic-a]']
            self.assertEqual((routes['state'], routes['blockers'][0]['code']), ('blocked', 'ROUTE_WAY_IDS_REQUIRED'))
            evidence = routes['blockers'][0]['evidence']
            self.assertEqual(evidence['attempts'][0]['site'], 'osm-way-900000001')
            self.assertEqual(len(evidence['attempts'][0]['duplicateRefs']), 18)
            downstream = ('layout.candidates.compose[synthetic-a]', 'layout.terrain.acquire[synthetic-a]', 'hole.terrain.compile[synthetic-a:07]',
                          'hole.world.build[synthetic-a:18]', 'layout.terrain.aggregate[synthetic-a]', 'layout.capability.evaluate[synthetic-a]')
            for key in downstream:
                row = rows[key]
                self.assertEqual(row['state'], 'blocked', key)
                self.assertEqual(row['blockers'][0]['code'], 'DEPENDENCY_BLOCKED', key)
                self.assertEqual(row['blockers'][0]['evidence']['root'], 'ROUTE_WAY_IDS_REQUIRED', key)
            # Nothing past the snapshot ran, and no acquisition was attempted.
            self.assertNotIn('layout.terrain.acquire[synthetic-a]', h.pipeline.calls)
            self.assertNotIn('layout.candidates.compose[synthetic-a]', h.pipeline.calls)
            # Layout B (its own polygon) is unaffected and shares the snapshots.
            b = h.states('synthetic-b')
            self.assertEqual(b['facility.osm.snapshot[synthetic]'][0], 'cached')
            code, text = h.run('run', '--layout', 'synthetic-b')
            self.assertIn('failed 0', text)
            self.assertEqual(h.states('synthetic-b')['hole.terrain.compile[synthetic-b:07]'][0], 'cached')
        finally:
            h.ledger.close()

    def test_disk_guard_blocks_heavy_tasks_below_the_reserve(self):
        h = Harness(self.tmp)
        try:
            os.environ['COURSE_FACTORY_DISK_RESERVE_GB'] = '100000'   # nothing on this machine clears it
            code, text = h.run('run', '--layout', 'synthetic-a')
            self.assertEqual(code, 0, text)
            self.assertNotIn('facility.osm.snapshot[synthetic]', h.pipeline.calls)
            rows = h.plan_rows('synthetic-a')
            aoi = rows['facility.aoi.resolve[synthetic]']       # the first task that writes anything
            self.assertEqual((aoi['state'], aoi['blockers'][0]['code']), ('blocked', 'DISK_GUARD_BLOCKED'))
            self.assertEqual(set(aoi['blockers'][0]['evidence']), {'freeGb', 'reserveGb', 'estimatedNeedGb', 'suggestedEvictions'})
            self.assertEqual(rows['facility.osm.snapshot[synthetic]']['state'], 'pending')
            self.assertEqual(rows['catalog.validate[synthetic]']['state'], 'cached')   # inline validation needs no disk
            del os.environ['COURSE_FACTORY_DISK_RESERVE_GB']
            code, text = h.run('run', '--layout', 'synthetic-a')
            self.assertIn('failed 0', text)
            self.assertEqual(h.states('synthetic-a')['facility.osm.snapshot[synthetic]'][0], 'cached')
        finally:
            os.environ.pop('COURSE_FACTORY_DISK_RESERVE_GB', None)
            h.ledger.close()


def tree_hashes(root):
    return {os.path.relpath(os.path.join(d, f), root): file_sha256(os.path.join(d, f)) for d, _, files in os.walk(root) for f in files}


class RetainedSafetyTests(unittest.TestCase):
    """Retained evidence (checked-in fixtures, external exports) is read and
    adopted, never written to or deleted: every executor produces under the
    output root, and a manual invalidation rebuilds there."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-retained-')
        self.h = Harness(self.tmp)

    def tearDown(self):
        self.h.ledger.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_report(self, text):
        line = next(l for l in text.splitlines() if l.startswith('report: '))
        return read_json(os.path.join(os.path.dirname(line[len('report: '):]), 'report.json'))

    def promote_to_retained(self):
        """Build layout A once, then move its evidence outside the output root
        and point the catalog at it, the way a checked-in fixture would."""
        h = self.h
        code, text = h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        built = os.path.join(h.output, 'layouts', 'synthetic-a')
        facility_out = os.path.join(h.output, 'facilities', 'synthetic')
        keep = os.path.join(self.tmp, 'retained')
        for kind, name in (('osm', 'osm'), ('osm-context', 'osm-context'), ('terrain', 'terrain')):
            source = os.path.join(facility_out, kind)
            shutil.copytree(os.path.join(source, min(os.listdir(source))), os.path.join(keep, name))
        shutil.copytree(os.path.join(built, 'compiled'), os.path.join(keep, 'compiled'))
        os.makedirs(os.path.join(keep, 'layout'))
        for name in ('canopy-review.json', 'imagery-review.json', os.path.join('context', 'synthetic-a-context.json'), os.path.join('context', 'synthetic-a-context-report.json')):
            shutil.copy(os.path.join(built, name), os.path.join(keep, 'layout', os.path.basename(name)))
        facility_doc = os.path.join(h.catalog, 'facilities', 'synthetic.json')
        layout_doc = os.path.join(h.catalog, 'layouts', 'synthetic-a.json')
        facility = read_json(facility_doc)
        # The shape Peek'n Peak carries: OSM, context and the terrain source.
        facility['retained'] = {'osm': os.path.join(keep, 'osm'), 'osmContext': os.path.join(keep, 'osm-context'), 'terrain': os.path.join(keep, 'terrain')}
        layout = read_json(layout_doc)
        layout['retained'] = {'compiled': os.path.join(keep, 'compiled'), 'canopyReview': os.path.join(keep, 'layout', 'canopy-review.json'),
                              'imageryReview': os.path.join(keep, 'layout', 'imagery-review.json'), 'context': os.path.join(keep, 'layout', 'synthetic-a-context.json'),
                              'contextReport': os.path.join(keep, 'layout', 'synthetic-a-context-report.json')}
        for path, doc in ((facility_doc, facility), (layout_doc, layout)):
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(doc, f, indent=1)
        # A fresh factory: nothing built, nothing in the ledger.
        h.ledger.close()
        shutil.rmtree(h.output)
        h.output = os.path.join(self.tmp, 'fresh-output')
        h.ledger = Ledger(os.path.join(h.output, 'state.sqlite'))
        return keep

    def test_retained_evidence_is_adopted_then_left_alone_by_a_rebuild(self):
        h = self.h
        keep = self.promote_to_retained()
        before = tree_hashes(keep)
        code, text = h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        self.assertIn('failed 0', text)
        first = self.run_report(text)
        states = h.states('synthetic-a')
        for key in ('facility.osm.snapshot[synthetic]', 'facility.context.snapshot[synthetic]', 'layout.terrain.acquire[synthetic-a]', 'layout.canopy.derive[synthetic-a]',
                    'layout.context.classify[synthetic-a]', 'hole.terrain.compile[synthetic-a:03]'):
            # Adopted during the run (and recorded), so the next plan reads it
            # back from the ledger as ordinary cached work.
            self.assertNotIn(key, first['executed'], key)
            self.assertEqual(states[key][0], 'cached', (key, states[key]))
        self.assertEqual(tree_hashes(keep), before, 'adoption must not touch retained evidence')

        # Rebuild what the retained evidence stood for: OSM snapshot (the root
        # of everything), the canopy layer (its NAIP export is keyed by the
        # retained terrain directory), the context layer and one hole compile.
        for args in (('--task', 'facility.osm.snapshot'), ('--task', 'layout.canopy.derive'), ('--task', 'layout.context.classify'), ('--task', 'hole.terrain.compile', '--hole', '3')):
            code, text = h.run('invalidate', '--layout', 'synthetic-a', *args, '--reason', 'retained evidence superseded')
            self.assertEqual(code, 0, text)
        code, text = h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        self.assertIn('failed 0', text)
        report = self.run_report(text)
        for key in ('facility.osm.snapshot[synthetic]', 'layout.canopy.derive[synthetic-a]', 'layout.context.classify[synthetic-a]', 'hole.terrain.compile[synthetic-a:03]'):
            self.assertIn(key, report['executed'], key)
        self.assertNotIn('layout.terrain.acquire[synthetic-a]', report['executed'], 'the retained terrain source still serves')
        naip = [a['path'] for a in report['artifacts'] if a['key'].startswith('naip-')]
        self.assertEqual(len(naip), 2, report['artifacts'])
        self.assertTrue(all(p.startswith(os.path.join(h.output, 'facilities', 'synthetic', 'naip', 'terrain') + os.sep) for p in naip), naip)
        self.assertEqual(tree_hashes(keep), before, 'a rebuild must not write to or delete retained evidence')
        outside = [a['path'] for a in report['artifacts'] if not os.path.abspath(a['path']).startswith(os.path.abspath(h.output) + os.sep)]
        self.assertEqual(outside, [], 'every built artifact lives under the output root')
        self.assertTrue(os.path.isfile(os.path.join(h.output, 'layouts', 'synthetic-a', 'compiled', 'synthetic-a-03-report.json')) or
                        any(f.endswith('-report.json') for f in os.listdir(os.path.join(h.output, 'layouts', 'synthetic-a', 'compiled'))))
        # The next plan reads the rebuilt hole from the output root and the
        # untouched holes from the retained compile: nothing is stale.
        states = h.states('synthetic-a')
        not_done = {k: v for k, v in states.items() if k.startswith(('hole.terrain.compile', 'layout.context.classify', 'layout.canopy.derive', 'layout.terrain.acquire', 'facility.osm.snapshot')) and v[0] not in DONE}
        self.assertEqual(not_done, {})
        rows = h.plan_rows('synthetic-a')
        rebuilt = rows['hole.terrain.compile[synthetic-a:03]']['artifacts'][0]['path']
        self.assertTrue(os.path.abspath(rebuilt).startswith(os.path.abspath(h.output) + os.sep), rebuilt)
        untouched = rows['hole.terrain.compile[synthetic-a:04]']['artifacts'][0]['path']
        self.assertTrue(os.path.abspath(untouched).startswith(os.path.join(keep, 'compiled') + os.sep), untouched)

    def test_an_executor_reporting_an_artifact_outside_the_output_root_fails_the_task(self):
        h = self.h
        keep = self.promote_to_retained()
        rogue_path = os.path.join(keep, 'layout', 'canopy-review.json')
        real = h.pipeline.executors()

        def rogue_canopy(node, ctx, run):
            real['layout.canopy.derive'](node, ctx, run)
            from factory.tasks.common import artifact
            return [artifact('canopy-review', rogue_path, 'A')]

        code, text = h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        code, text = h.run('invalidate', '--layout', 'synthetic-a', '--task', 'layout.canopy.derive', '--reason', 'probe')
        self.assertEqual(code, 0, text)
        code, text = h.run('run', '--layout', 'synthetic-a', executors={**real, 'layout.canopy.derive': rogue_canopy})
        self.assertIn('ARTIFACT_OUTSIDE_OUTPUT_ROOT', text)
        self.assertIn('failed 1', text)
        self.assertNotIn(h.states('synthetic-a')['layout.canopy.derive[synthetic-a]'][0], DONE)

    def test_safe_rmtree_refuses_paths_outside_the_output_root(self):
        from factory import adapters
        from factory.context import Context
        keep = self.promote_to_retained()
        ctx = Context(self.h.repo, None, self.h.output)
        with self.assertRaises(RuntimeError):
            adapters.safe_rmtree(ctx, os.path.join(keep, 'compiled'))
        self.assertTrue(os.path.isdir(os.path.join(keep, 'compiled')))
        victim = os.path.join(self.h.output, 'scratch')
        os.makedirs(victim)
        adapters.safe_rmtree(ctx, victim)
        self.assertFalse(os.path.isdir(victim))


if __name__ == '__main__':
    unittest.main()

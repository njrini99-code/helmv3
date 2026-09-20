"""Change-impact tests for the course factory (Factory v2 PR B): a synthetic
two-layout facility built by fake executors, then edits whose blast radius
must stay exactly where the design says. Network-free."""
import json
import os
import shutil
import tempfile
import unittest

from factory import imagery
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
        self.assertEqual(states['hole.visual.canary[synthetic-a:01]'], ('blocked', 'LAB_COURSE_NOT_SERVED'))
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
        compiled = os.path.join(self.h.output, 'layouts', 'synthetic-a', 'compiled')
        untouched = {name: file_sha256(os.path.join(compiled, name)) for name in os.listdir(compiled) if not name.startswith('synthetic-a-07') and name not in ('asset-manifest.json', 'compilation-report.json')}
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
        # The compiled directory is shared by the 18 holes and the compiler
        # refuses one labelled with another package: the factory relabels it
        # for the new package instead of clearing it, so the 17 cached holes
        # keep their files, stay listed, and the next run has nothing to do.
        manifest = read_json(os.path.join(compiled, 'asset-manifest.json'))
        package = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'package', 'normalized.json'))
        self.assertEqual(manifest['geometryHash'], package['contentHash'])
        self.assertEqual(sorted(manifest['holes']), sorted(h['key'] for h in package['holes']))
        self.assertEqual({name: file_sha256(os.path.join(compiled, name)) for name in untouched}, untouched, 'cached holes are not rewritten')
        mark = len(self.h.pipeline.calls)
        _code, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertIn('executed 0', text)
        self.assertEqual(self.h.pipeline.calls[mark:], [], 'one run reaches the fixed point')

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

    def test_a_projection_rule_edit_reaches_every_task_that_projects(self):
        """course_crs.py is loaded by the compiler, the canopy, imagery and
        package scripts at import time; an edit there changes what every
        export is cut in, so it must move their fingerprints."""
        self.h.run('run', '--layout', 'synthetic-a')
        with open(os.path.join(self.h.repo, 'scripts', 'golf', 'course-geometry', 'course_crs.py'), 'a', encoding='utf-8') as f:
            f.write('\n# zone rule edited\n')
        states = self.h.states('synthetic-a')
        self.assertEqual(states['layout.candidates.compose[synthetic-a]'], ('stale', 'FINGERPRINT_CHANGED'))
        self.assertEqual(states['layout.terrain.acquire[synthetic-a]'][0], 'pending', 'downstream of the candidates package')
        for key in ('layout.package.compose[synthetic-a]', 'layout.canopy.derive[synthetic-a]', 'layout.terrain.base[synthetic-a]', 'layout.imagery.audit[synthetic-a]', 'hole.terrain.compile[synthetic-a:07]'):
            self.assertNotIn(states[key][0], DONE, (key, states[key]))
        self.assertEqual(states['facility.osm.snapshot[synthetic]'][0], 'cached')
        self.assertEqual(states['layout.scorecard.compose[synthetic-a]'][0], 'cached')

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

    def test_a_changed_canopy_classification_reaches_the_package_and_every_hole(self):
        """Same NAIP raster, different groups (a classifier change): the package
        merge rebuilds and, through the per-hole subhashes, only the hole whose
        groups changed recompiles; the terrain source does not move."""
        self.h.run('run', '--layout', 'synthetic-a')
        before = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'package', 'normalized.json'))['contentHash']
        self.h.world.canopy = False
        code, text = self.h.run('invalidate', '--layout', 'synthetic-a', '--task', 'layout.canopy.derive', '--reason', 'classifier calibrated')
        self.assertEqual(code, 0, text)
        code, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        self.assertIn('failed 0', text)
        executed = set(read_json(os.path.join(os.path.dirname(next(l for l in text.splitlines() if l.startswith('report: '))[len('report: '):]), 'report.json'))['executed'])
        self.assertIn('layout.canopy.derive[synthetic-a]', executed)
        self.assertIn('layout.package.compose[synthetic-a]', executed)
        self.assertIn('hole.terrain.compile[synthetic-a:05]', executed)
        self.assertEqual([k for k in executed if k.startswith('hole.terrain.compile') and not k.endswith(':05]')], [], 'other holes keep their compile')
        self.assertNotIn('layout.terrain.acquire[synthetic-a]', executed)
        after = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'package', 'normalized.json'))['contentHash']
        self.assertNotEqual(before, after)
        # And a re-derivation that reproduces the same groups is a no-op downstream.
        code, text = self.h.run('invalidate', '--layout', 'synthetic-a', '--task', 'layout.canopy.derive', '--reason', 'same classifier, re-run')
        code, text = self.h.run('run', '--layout', 'synthetic-a')
        executed = set(read_json(os.path.join(os.path.dirname(next(l for l in text.splitlines() if l.startswith('report: '))[len('report: '):]), 'report.json'))['executed'])
        self.assertEqual(executed, {'layout.canopy.derive[synthetic-a]'})

    def test_manual_invalidation_rebuilds_one_hole(self):
        self.h.run('run', '--layout', 'synthetic-a')
        code, text = self.h.run('invalidate', '--layout', 'synthetic-a', '--task', 'hole.terrain.compile', '--hole', '11', '--reason', 'reviewer asked')
        self.assertEqual(code, 0, text)
        states = self.h.states('synthetic-a')
        self.assertEqual(states['hole.terrain.compile[synthetic-a:11]'], ('stale', 'MANUAL_INVALIDATION'))
        self.assertEqual(states['hole.terrain.compile[synthetic-a:12]'][0], 'cached')
        code, text = self.h.run('why', '--layout', 'synthetic-a', '--task', 'hole.terrain.compile', '--hole', '11')
        self.assertIn('MANUAL_INVALIDATION', text)



class ImageryCurrencyTests(unittest.TestCase):
    """Factory v2 §21.5 / v2-next §20: imagery flown before the catalog's
    knownRenovationAfter is a freshness failure. The changed-surface audit
    blocks on it (an earlier success does not outrank the date), the review
    queue and the capability report name it, the canopy node notes it, and
    nothing that never read the date is rebuilt."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-currency-')
        self.h = Harness(self.tmp)
        self.layout_path = os.path.join(self.h.catalog, 'layouts', 'synthetic-a.json')
        self.facility_path = os.path.join(self.h.catalog, 'facilities', 'synthetic.json')

    def tearDown(self):
        self.h.ledger.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def set_date(self, path, value):
        doc = read_json(path)
        doc['knownRenovationAfter'] = value
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(doc, f)

    def executed(self, text):
        report = next(line for line in text.splitlines() if line.startswith('report: '))[len('report: '):]
        return set(read_json(os.path.join(os.path.dirname(report), 'report.json'))['executed'])

    def test_dates(self):
        self.assertEqual(imagery.iso_date('20240524'), '2024-05-24')
        self.assertEqual(imagery.iso_date('2024-06-01'), '2024-06-01')
        self.assertIsNone(imagery.iso_date('m_4207958_NE_18_60_20240824'))
        self.assertIsNone(imagery.iso_date(None))

    def test_imagery_flown_before_a_known_renovation_blocks_the_audit_and_queues_the_decision(self):
        code, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        self.assertEqual(self.h.states('synthetic-a')['layout.imagery.audit[synthetic-a]'][0], 'cached')
        queue = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'review-queue.json'))
        self.assertEqual([i['pass'] for i in queue['items'] if i['pass'].startswith('imagery')], ['imagery_review'])

        # The owner records a renovation after the 2024-06-01 capture.
        self.set_date(self.layout_path, '2025-03-01')
        states = self.h.states('synthetic-a')
        self.assertEqual(states['layout.imagery.audit[synthetic-a]'], ('blocked', 'IMAGERY_TOO_OLD_FOR_KNOWN_RENOVATION'))
        stale = sorted(k for k, v in states.items() if v[0] == 'stale')
        self.assertEqual(stale, ['catalog.validate[synthetic]', 'layout.capability.evaluate[synthetic-a]', 'layout.review.queue[synthetic-a]'], 'only the readers of the date move')
        rows = self.h.plan_rows('synthetic-a')
        self.assertTrue(any(n.startswith('IMAGERY_TOO_OLD_FOR_KNOWN_RENOVATION: captured 2024-06-01..2024-06-01, renovation after 2025-03-01') for n in rows['layout.canopy.derive[synthetic-a]']['notes']),
                        rows['layout.canopy.derive[synthetic-a]']['notes'])
        code, text = self.h.run('why', '--layout', 'synthetic-a', '--task', 'layout.imagery.audit')
        self.assertEqual(code, 0, text)
        self.assertIn("'knownRenovationAfter': '2025-03-01'", text)
        self.assertIn("'capturedAt': '2024-06-01'", text)

        code, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        self.assertIn('failed 0', text)
        self.assertIn('IMAGERY_TOO_OLD_FOR_KNOWN_RENOVATION — the retained imagery was flown before the catalog knownRenovationAfter date; retain a later capture or lift the date', text)
        # Identity is inline: it re-validates whenever the catalog does, at no cost.
        self.assertEqual(self.executed(text), {'catalog.validate[synthetic]', 'layout.identity.resolve[synthetic-a]', 'layout.route.dossier[synthetic-a]', 'layout.capability.evaluate[synthetic-a]', 'layout.review.queue[synthetic-a]'})
        queue = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'review-queue.json'))
        items = {i['pass']: i for i in queue['items']}
        self.assertNotIn('imagery_review', items, 'sand shares against pre-renovation ground are not offered for review')
        self.assertEqual(items['imagery_currency']['code'], 'IMAGERY_TOO_OLD_FOR_KNOWN_RENOVATION')
        self.assertEqual(items['imagery_currency']['evidence'], {'knownRenovationAfter': '2025-03-01', 'capturedAt': ['2024-06-01'], 'earliestCapture': '2024-06-01', 'latestCapture': '2024-06-01',
                                                                 'predatesRenovation': True, 'code': 'IMAGERY_TOO_OLD_FOR_KNOWN_RENOVATION'})
        report = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'capability-report.json'))
        self.assertIn('IMAGERY_TOO_OLD_FOR_KNOWN_RENOVATION', report['blockedHigherTiers']['C3'])
        self.assertTrue(report['evidence']['imageryCurrency']['predatesRenovation'])

        # A renovation the capture already shows is no failure; the facility's
        # date applies when the layout states none, and the layout's wins.
        self.set_date(self.layout_path, None)
        self.set_date(self.facility_path, '2023-01-01')
        states = self.h.states('synthetic-a')
        self.assertEqual(states['layout.imagery.audit[synthetic-a]'][0], 'cached')
        self.assertEqual(states['layout.review.queue[synthetic-a]'][0], 'stale')
        self.set_date(self.layout_path, '2025-03-01')
        self.assertEqual(self.h.states('synthetic-a')['layout.imagery.audit[synthetic-a]'], ('blocked', 'IMAGERY_TOO_OLD_FOR_KNOWN_RENOVATION'))

        # A later capture (a new raster) clears it without anyone touching the catalog.
        self.h.world.naip_dates = ['2025-09-10']
        self.h.world.naip_sha = 'naip-' + '1' * 60
        code, text = self.h.run('invalidate', '--layout', 'synthetic-a', '--task', 'layout.canopy.derive', '--reason', 'NAIP 2025 published')
        self.assertEqual(code, 0, text)
        code, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        self.assertIn('failed 0', text)
        executed = self.executed(text)
        self.assertIn('layout.canopy.derive[synthetic-a]', executed)
        self.assertIn('layout.imagery.audit[synthetic-a]', executed)
        self.assertEqual([k for k in executed if k.startswith('hole.')], [], 'the same groups compile nothing')
        self.assertEqual(self.h.states('synthetic-a')['layout.imagery.audit[synthetic-a]'][0], 'cached')
        queue = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'review-queue.json'))
        items = {i['pass']: i for i in queue['items']}
        self.assertNotIn('imagery_currency', items)
        self.assertEqual(items['imagery_review']['evidence']['knownRenovationAfter'], '2025-03-01')
        report = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'capability-report.json'))
        self.assertNotIn('IMAGERY_TOO_OLD_FOR_KNOWN_RENOVATION', report['blockedHigherTiers']['C3'])
        self.assertEqual(report['evidence']['imageryCurrency']['latestCapture'], '2025-09-10')


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

    def test_a_series_named_for_the_layout_is_proposed_and_still_queued_for_confirmation(self):
        """Two courses in one polygon, every ref repeated — but one series is
        named 'Synthetic A Hole n' (the way University Club of Kentucky maps
        its Big Blue course). That series is proposed as osm_ref_named with the
        duplicates kept as evidence, and a person still confirms it."""
        from factory_testkit import World
        world = World()
        world.hole_labels['a'] = 'Synthetic A'
        h = Harness(self.tmp, world=world, site_a_shared=True)
        try:
            code, text = h.run('run', '--layout', 'synthetic-a')
            self.assertEqual(code, 0, text)
            self.assertIn('failed 0', text)
            self.assertEqual(h.states('synthetic-a')['layout.routes.resolve[synthetic-a]'][0], 'cached')
            routes = read_json(os.path.join(h.output, 'layouts', 'synthetic-a', 'routes.json'))
            self.assertEqual(routes['source'], 'osm_ref_named')
            self.assertEqual(routes['routeWayIds'], [1000 + n for n in range(1, 19)], 'the labelled series, not the other course')
            chosen = routes['evidence']['chosen']
            self.assertEqual((chosen['series'], chosen['namedSeries'], len(chosen['duplicateRefs'])), ('synthetic a', ['synthetic a'], 18))
            queue = read_json(os.path.join(h.output, 'layouts', 'synthetic-a', 'review-queue.json'))
            self.assertIn('route_confirmation', [item['pass'] for item in queue['items']])
            # A second series whose naming also fits the layout makes it a person's call again.
            world.hole_labels['b'] = 'Synthetic'
            code, text = h.run('invalidate', '--layout', 'synthetic-a', '--task', 'facility.osm.snapshot', '--reason', 'mapper renamed the other course')
            self.assertEqual(code, 0, text)
            code, text = h.run('run', '--layout', 'synthetic-a')
            rows = h.plan_rows('synthetic-a')
            routes = rows['layout.routes.resolve[synthetic-a]']
            self.assertEqual((routes['state'], routes['blockers'][0]['code']), ('blocked', 'ROUTE_WAY_IDS_REQUIRED'))
            self.assertEqual(routes['blockers'][0]['evidence']['attempts'][0]['namedSeries'], ['synthetic', 'synthetic a'])
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

    def test_retained_evidence_stays_adopted_when_only_its_fingerprint_moved(self):
        """An implementation edit changes the fingerprint of every node the
        script implements. Retained evidence is judged by its content checks,
        so it stays adopted (a fresh ledger would adopt it again) instead of
        going pending on upstream work nobody asked for; built output rebuilds;
        a manual invalidation still asks for the rebuild."""
        h = self.h
        keep = self.promote_to_retained()
        before = tree_hashes(keep)
        code, text = h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        scripts = os.path.join(h.repo, 'scripts', 'golf', 'course-geometry')
        for name in ('compile-course-terrain.py', 'build-course-world.py'):
            with open(os.path.join(scripts, name), 'a', encoding='utf-8') as f:
                f.write('\n# edited after adoption\n')
        states = h.states('synthetic-a')
        compiles = {k: v for k, v in states.items() if k.startswith('hole.terrain.compile')}
        self.assertEqual(set(compiles.values()), {('cached', 'ADOPTED_EXTERNAL')}, compiles)
        self.assertEqual(states['layout.terrain.base[synthetic-a]'], ('cached', 'ADOPTED_EXTERNAL'))
        worlds = {k: v for k, v in states.items() if k.startswith('hole.world.build')}
        self.assertEqual(set(worlds.values()), {('stale', 'FINGERPRINT_CHANGED')}, worlds)
        mark = len(h.pipeline.calls)
        code, text = h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        self.assertIn('failed 0', text)
        executed = h.pipeline.calls[mark:]
        self.assertEqual([k for k in executed if k.startswith('hole.terrain.compile')], [], 'retained compiles are not rebuilt for a compiler edit')
        self.assertEqual(len([k for k in executed if k.startswith('hole.world.build')]), 18, 'built world records are')
        self.assertEqual(tree_hashes(keep), before)
        code, text = h.run('invalidate', '--layout', 'synthetic-a', '--task', 'hole.terrain.compile', '--hole', '3', '--reason', 'reviewer asked')
        self.assertEqual(code, 0, text)
        self.assertEqual(h.states('synthetic-a')['hole.terrain.compile[synthetic-a:03]'], ('stale', 'MANUAL_INVALIDATION'))
        self.assertEqual(h.states('synthetic-a')['hole.terrain.compile[synthetic-a:04]'][0], 'cached')

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


class LabCaptureTests(unittest.TestCase):
    """The sign-off captures run against the local lab, which draws checked-in
    fixtures only; the factory says so per hole and never writes under src."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-lab-')
        self.h = Harness(self.tmp)
        code, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)

    def tearDown(self):
        self.h.ledger.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def blocker(self, layout, key):
        row = self.h.plan_rows(layout, self.h.lab_executors())[key]
        return row['state'], row['blockers'][0]['code'] if row['blockers'] else None, (row['blockers'][0]['evidence'] if row['blockers'] else {})

    def test_a_course_the_lab_does_not_serve_is_blocked_per_hole_with_the_reason(self):
        state, code, evidence = self.blocker('synthetic-a', 'hole.visual.canary[synthetic-a:07]')
        self.assertEqual((state, code), ('blocked', 'LAB_COURSE_NOT_SERVED'))
        self.assertIn('checked-in fixtures only', evidence['detail'])
        self.assertEqual(evidence['holeKey'], 'synthetic-a-07')
        self.assertIsNone(evidence['labPackageHash'])
        # Retained in the lab, then the package moves (a bunker edit reaches OSM): the lab still holds the
        # old package, so the hole is not served, and the plan says which hash the lab holds.
        self.h.retain_in_lab('synthetic-a')
        self.assertEqual(self.blocker('synthetic-a', 'hole.visual.canary[synthetic-a:07]')[0], 'ready')
        self.h.world.bunker_shift[7] = 0.00002
        code_, text = self.h.run('invalidate', '--layout', 'synthetic-a', '--task', 'facility.osm.snapshot', '--reason', 'OSM edit reported')
        self.assertEqual(code_, 0, text)
        code_, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code_, 0, text)
        state, code, evidence = self.blocker('synthetic-a', 'hole.visual.canary[synthetic-a:07]')
        self.assertEqual((state, code), ('blocked', 'LAB_COURSE_NOT_SERVED'))
        self.assertIn('another package', evidence['detail'])
        self.assertNotEqual(evidence['labPackageHash'], evidence['packageHash'])
        # The aggregates and the review queue are not held hostage: blocked optional deps let the queue run.
        states = self.h.states('synthetic-a', self.h.lab_executors())
        self.assertEqual(states['layout.visual.aggregate[synthetic-a]'], ('blocked', 'DEPENDENCY_BLOCKED'))
        self.assertIn(states['layout.review.queue[synthetic-a]'][0], DONE)

    def test_a_lab_that_is_not_listening_blocks_the_capture_without_a_failed_run(self):
        self.h.retain_in_lab('synthetic-a')
        self.assertEqual(self.h.states('synthetic-a', self.h.lab_executors())['hole.visual.canary[synthetic-a:01]'], ('ready', 'NO_SUCCESSFUL_FINGERPRINT'))
        session, commands = self.h.lab_session(listening=False)
        with session:
            code, text = self.h.run('run', '--layout', 'synthetic-a', '--task', 'hole.visual.canary', executors=self.h.lab_executors())
        self.assertEqual(code, 0, text)
        self.assertIn('failed 0', text)
        self.assertIn('LAB_NOT_LISTENING', text)
        self.assertEqual(commands.calls, [])
        last = self.h.ledger.last_run('hole.visual.canary[synthetic-a:01]')
        self.assertEqual((last['state'], last['blocker_code']), ('blocked', 'LAB_NOT_LISTENING'))
        # Still ready, never "failed": nothing about the work went wrong.
        self.assertEqual(self.h.states('synthetic-a', self.h.lab_executors())['hole.visual.canary[synthetic-a:01]'], ('ready', 'NO_SUCCESSFUL_FINGERPRINT'))

    def test_captures_run_per_hole_and_the_reader_gets_the_sheets_and_the_breaches(self):
        self.h.retain_in_lab('synthetic-a')
        self.h.world.draw_call_over = {7}
        session, commands = self.h.lab_session()
        with session:
            code, text = self.h.run('run', '--layout', 'synthetic-a', executors=self.h.lab_executors())
        self.assertEqual(code, 0, text)
        self.assertIn('failed 0', text)
        names = [name for name, _ in commands.calls]
        self.assertEqual(names.count('capture-visual-canaries.cjs'), 18)
        self.assertEqual(names.count('capture-player-view.cjs'), 18 * 4)
        self.assertEqual(names.count('build-canary-sheet.py'), 4)
        self.assertEqual(names.count('build-player-sheet.py'), 2)
        canary_args = dict(a.split('=', 1) for a in next(args for name, args in commands.calls if name == 'capture-visual-canaries.cjs' and '--holes=7' in args) if '=' in a)
        self.assertEqual(canary_args['--course'], 'synthetic-a')
        self.assertEqual(canary_args['--presets'], 'Top,Terrain,Side')
        self.assertTrue(canary_args['--out'].startswith(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'visual', 'holes', 'synthetic-a-07')), canary_args['--out'])
        states = self.h.states('synthetic-a', self.h.lab_executors())
        not_done = {k: v for k, v in states.items() if v[0] not in DONE and not k.startswith(('layout.publish', 'layout.review.compose'))}
        self.assertEqual(not_done, {}, not_done)
        # One report for the layout, files relative to it, and the breach where the fake lab put it.
        merged = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'visual', 'canaries.json'))
        self.assertEqual(len(merged['captures']), 18 * 3 * 4)
        self.assertTrue(all(c['file'].startswith('holes/synthetic-a-') for c in merged['captures']))
        self.assertTrue(all(os.path.isfile(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'visual', c['file'])) for c in merged['captures']))
        summary = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'visual', 'visual-summary.json'))
        self.assertEqual(summary['captures'], 216)
        self.assertEqual({b['hole'] for b in summary['drawCallBreaches']}, {7})
        self.assertEqual(len(summary['drawCallBreaches']), 3)
        self.assertEqual(summary['sheets'], [f'output/course-geometry/factory/layouts/synthetic-a/visual/sheet-{v}.png' for v in ('390x844', '430x932', '768x1024', '1440x1000')])
        player = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'player', 'player-summary.json'))
        self.assertEqual((player['captures'], player['holes']), (72, 18))
        self.assertEqual({b['hole'] for b in player['drawCallBreaches']}, {7})
        self.assertEqual(player['views'], ['desktop-terrain', 'phone-green', 'phone-terrain', 'phone-top'])
        queue = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'review-queue.json'))
        signoff = next(i for i in queue['items'] if i['pass'] == 'visual_signoff')
        self.assertEqual(signoff['evidence']['drawCallBreaches'], 3 + 3)
        self.assertEqual(signoff['evidence']['canaryCaptures'], 216)
        # Every capture is a ledger artifact under the output root; a second run is a no-op.
        artifacts = self.h.ledger.artifacts_for('hole.visual.canary[synthetic-a:07]')
        self.assertEqual(len(artifacts), 13)
        self.assertTrue(all(a.path.startswith(self.h.output) for a in artifacts))
        with session:
            code, text = self.h.run('run', '--layout', 'synthetic-a', executors=self.h.lab_executors())
        self.assertIn('executed 0', text)

    def test_a_page_error_or_another_mesh_fails_that_hole_only(self):
        self.h.retain_in_lab('synthetic-a')
        self.h.world.lab_page_errors = {3}
        self.h.world.lab_mesh_override = {5: 'f' * 64}
        session, _commands = self.h.lab_session()
        with session:
            code, text = self.h.run('run', '--layout', 'synthetic-a', '--task', 'hole.visual.canary', executors=self.h.lab_executors())
        self.assertEqual(code, 1, text)
        self.assertIn('failed 2', text)
        rows = self.h.plan_rows('synthetic-a', self.h.lab_executors())
        self.assertEqual(rows['hole.visual.canary[synthetic-a:03]']['state'], 'failed')
        self.assertEqual(rows['hole.visual.canary[synthetic-a:05]']['state'], 'failed')
        self.assertEqual(rows['hole.visual.canary[synthetic-a:04]']['state'], 'cached')
        run_id = text.split('run ', 1)[1].split(':', 1)[0]
        with open(os.path.join(self.h.output, 'runs', run_id, 'logs', 'hole.visual.canary.synthetic-a-03.log'), encoding='utf-8') as f:
            self.assertIn('PAGE_ERRORS', f.read())
        self.assertIn('CAPTURE_MESH_MISMATCH', text)


class PublishVerifyTests(unittest.TestCase):
    """What is published under public/ is checked against the evidence, never written."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-publish-')
        self.h = Harness(self.tmp)
        code, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)

    def tearDown(self):
        self.h.ledger.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def executors(self):
        from factory import adapters
        return {**self.h.pipeline.executors(), 'layout.publish.verify': adapters.verify_publish}

    def test_published_assets_are_verified_against_the_evidence_and_a_drifted_mesh_fails(self):
        self.assertEqual(self.h.states('synthetic-a', self.executors())['layout.publish.verify[synthetic-a]'], ('blocked', 'DEPENDENCY_BLOCKED'))
        public = self.h.publish('synthetic-a')
        code, text = self.h.run('run', '--layout', 'synthetic-a', executors=self.executors())
        self.assertEqual(code, 0, text)
        states = self.h.states('synthetic-a', self.executors())
        self.assertEqual(states['layout.publish.prepare[synthetic-a]'][0], 'cached')
        self.assertIn(states['layout.publish.verify[synthetic-a]'][0], DONE)
        report = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'publish-verification.json'))
        self.assertTrue(report['ok'])
        self.assertEqual(len(report['checks']), 2 + 18 + 1)
        self.assertEqual(read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'capability-report.json'))['earnedTier'], 'C2')
        # A published mesh that is not the compiled one: the node fails and names the hole; public/ is untouched.
        name = next(n for n in os.listdir(os.path.join(public, 'terrain')) if n.startswith('synthetic-a-07'))
        path = os.path.join(public, 'terrain', name)
        drifted = {**read_json(path), 'contentHash': 'e' * 64}
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(drifted, f)
        before = {n: file_sha256(os.path.join(public, 'terrain', n)) for n in os.listdir(os.path.join(public, 'terrain'))}
        code, text = self.h.run('invalidate', '--layout', 'synthetic-a', '--task', 'layout.publish.verify', '--reason', 'probe')
        self.assertEqual(code, 0, text)
        code, text = self.h.run('run', '--layout', 'synthetic-a', '--task', 'layout.publish.verify', executors=self.executors())
        self.assertEqual(code, 1, text)
        self.assertIn('PUBLISH_MISMATCH: 1 of 21', text)
        self.assertIn('terrain:synthetic-a-07', text)
        self.assertEqual({n: file_sha256(os.path.join(public, 'terrain', n)) for n in os.listdir(os.path.join(public, 'terrain'))}, before)
        report = read_json(os.path.join(self.h.output, 'layouts', 'synthetic-a', 'publish-verification.json'))
        self.assertFalse(report['ok'])
        self.assertEqual([c['name'] for c in report['checks'] if not c['ok']], ['terrain:synthetic-a-07'])


class LabVerdictTests(unittest.TestCase):
    def report(self, **overrides):
        captures = [{'hole': 7, 'preset': p, 'viewport': v, 'file': f'hole-07-{p.lower()}-{v}.png', 'metadata': {'terrainHash': 'a' * 64, 'drawCallStatus': 'within'}}
                    for p in ('Top', 'Side') for v in ('390x844', '1440x1000')]
        return {'captures': captures, 'errors': [], **overrides}

    def test_canary_verdicts(self):
        from factory import lab
        tmp = tempfile.mkdtemp(prefix='factory-verdict-')
        try:
            report = self.report()
            for c in report['captures']:
                open(os.path.join(tmp, c['file']), 'wb').close()
            self.assertIsNone(lab.canary_problem(report, 7, ('Top', 'Side'), ('390x844', '1440x1000'), 'a' * 64, tmp))
            # A draw-call breach is a finding, not a failed capture.
            report['captures'][0]['metadata']['drawCallStatus'] = 'over'
            self.assertIsNone(lab.canary_problem(report, 7, ('Top', 'Side'), ('390x844', '1440x1000'), 'a' * 64, tmp))
            self.assertEqual(len(lab.budget_breaches(report['captures'])), 1)
            self.assertTrue(lab.canary_problem(None, 7, ('Top',), ('390x844',), 'a' * 64, tmp).startswith('CAPTURE_REPORT_MISSING'))
            self.assertTrue(lab.canary_problem(self.report(errors=[{'viewport': '390x844', 'message': 'boom'}]), 7, ('Top',), ('390x844',), 'a' * 64, tmp).startswith('PAGE_ERRORS'))
            self.assertTrue(lab.canary_problem(report, 7, ('Top', 'Side', 'Terrain'), ('390x844', '1440x1000'), 'a' * 64, tmp).startswith('CAPTURE_MISSING: 2 of 6'))
            os.remove(os.path.join(tmp, report['captures'][0]['file']))
            self.assertIn('not on disk', lab.canary_problem(report, 7, ('Top', 'Side'), ('390x844', '1440x1000'), 'a' * 64, tmp))
            open(os.path.join(tmp, report['captures'][0]['file']), 'wb').close()
            self.assertTrue(lab.canary_problem(report, 7, ('Top', 'Side'), ('390x844', '1440x1000'), 'b' * 64, tmp).startswith('CAPTURE_MESH_MISMATCH'))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_player_verdicts(self):
        from factory import lab
        tmp = tempfile.mkdtemp(prefix='factory-verdict-')
        try:
            image = os.path.join(tmp, 'phone-terrain.png')
            open(image, 'wb').close()
            doc = {'dataset': {'terrainHash': 'a' * 64, 'drawCallStatus': 'over'}, 'errors': []}
            self.assertIsNone(lab.player_problem(doc, image, 'a' * 64))
            self.assertTrue(lab.player_problem(None, image, 'a' * 64).startswith('CAPTURE_REPORT_MISSING'))
            self.assertTrue(lab.player_problem({**doc, 'errors': ['boom']}, image, 'a' * 64).startswith('PAGE_ERRORS'))
            self.assertTrue(lab.player_problem(doc, os.path.join(tmp, 'missing.png'), 'a' * 64).startswith('CAPTURE_MISSING'))
            self.assertTrue(lab.player_problem(doc, image, 'b' * 64).startswith('CAPTURE_MESH_MISMATCH'))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    unittest.main()

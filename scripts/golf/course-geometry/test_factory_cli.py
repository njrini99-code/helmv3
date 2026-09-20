"""CLI tests for the course factory: golden plans for the two catalogued
courses with adoption of output/ switched off, the operator commands on the
synthetic facility, and intake from a small cohort sample. Network-free:
plans never fetch, and the fake executors stand in for every adapter."""
import io
import json
import os
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout

from factory import cli
from factory_testkit import HERE, Harness, SITE_WAY, write_catalog, write_json

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SIGNOFF = ('hole.visual.canary', 'hole.player.capture', 'layout.visual.aggregate', 'layout.player.aggregate', 'layout.publish.prepare', 'layout.publish.verify')


def run_cli(argv, **kwargs):
    buf = io.StringIO()
    with redirect_stdout(buf):
        code = cli.main(argv, out=buf, **kwargs)
    return code, buf.getvalue()


class GoldenPlanTests(unittest.TestCase):
    """The plan for the real catalog, computed in a temporary output root so
    nothing built on this machine is adopted: what a fresh clone sees."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-golden-')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def golden(self, layout):
        code, text = run_cli(['--repo-root', REPO, '--output', os.path.join(self.tmp, 'out'), '--no-adopt-output', 'plan', '--layout', layout, '--golden'])
        self.assertEqual(code, 0, text)
        rows = json.loads(text)
        return {r['key']: (r['state'], r['reason']) for r in rows}

    def test_cacapon_plan_is_a_clean_slate_behind_the_aoi(self):
        rows = self.golden('cacapon')
        self.assertEqual(len(rows), 101)
        self.assertEqual(rows['catalog.validate[cacapon]'], ('cached', 'INLINE_VALIDATED'))
        self.assertEqual(rows['layout.identity.resolve[cacapon]'], ('cached', 'INLINE_VALIDATED'))
        self.assertEqual(rows['layout.scorecard.validate[cacapon]'], ('cached', 'INLINE_VALIDATED'))
        self.assertEqual(rows['facility.aoi.resolve[cacapon]'], ('ready', 'NO_SUCCESSFUL_FINGERPRINT'))
        self.assertEqual(rows['layout.publish.prepare[cacapon]'], ('blocked', 'PUBLISH_NOT_APPROVED'))
        self.assertEqual(rows['layout.publish.verify[cacapon]'], ('blocked', 'DEPENDENCY_BLOCKED'))
        pending = [k for k, v in rows.items() if v == ('pending', 'DEPENDENCY_PENDING')]
        self.assertEqual(len(pending), 95)
        self.assertIn('hole.terrain.compile[cacapon:07]', pending)

    def test_upper_plan_adopts_the_retained_evidence(self):
        rows = self.golden('peek-n-peak-upper')
        adopted = sorted(k for k, v in rows.items() if v == ('cached', 'ADOPTED_EXTERNAL'))
        for key in ('facility.osm.snapshot[peek-n-peak]', 'facility.context.snapshot[peek-n-peak]',
                    'layout.package.compose[peek-n-peak-upper]', 'layout.imagery.audit[peek-n-peak-upper]', 'layout.publish.prepare[peek-n-peak-upper]'):
            self.assertIn(key, adopted)
        # The retained raster used a four-corner crop. It remains preserved
        # evidence, but the factory must acquire perimeter-covered terrain
        # before treating derived terrain/world artifacts as current.
        self.assertEqual(rows['layout.terrain.acquire[peek-n-peak-upper]'], ('pending', 'DEPENDENCY_PENDING'))
        self.assertEqual(rows['layout.canopy.derive[peek-n-peak-upper]'], ('pending', 'DEPENDENCY_PENDING'))
        self.assertEqual(rows['layout.terrain.base[peek-n-peak-upper]'], ('pending', 'DEPENDENCY_PENDING'))
        self.assertEqual(rows['layout.context.classify[peek-n-peak-upper]'], ('pending', 'DEPENDENCY_PENDING'))
        self.assertEqual(sum(1 for k in adopted if k.startswith('hole.terrain.compile[')), 0)
        self.assertEqual(rows['hole.terrain.compile[peek-n-peak-upper:01]'], ('pending', 'DEPENDENCY_PENDING'))
        self.assertEqual(rows['layout.routes.resolve[peek-n-peak-upper]'], ('ready', 'NO_SUCCESSFUL_FINGERPRINT'))
        # The lab still serves the Upper, but sign-off capture waits for the
        # perimeter-covered terrain rebuild rather than capturing stale mesh.
        self.assertEqual(rows['hole.visual.canary[peek-n-peak-upper:01]'], ('pending', 'DEPENDENCY_PENDING'))
        self.assertEqual(rows['hole.player.capture[peek-n-peak-upper:01]'], ('pending', 'DEPENDENCY_PENDING'))
        self.assertEqual(rows['layout.publish.verify[peek-n-peak-upper]'], ('pending', 'DEPENDENCY_PENDING'))
        self.assertNotIn(('stale', 'FINGERPRINT_CHANGED'), rows.values())

    def test_whole_catalog_plan_names_concrete_blockers(self):
        code, text = run_cli(['--repo-root', REPO, '--output', os.path.join(self.tmp, 'out'), '--no-adopt-output', 'plan', '--json'])
        self.assertEqual(code, 0, text)
        rows = {r['key']: r for r in json.loads(text)['rows']}
        codes = {}
        for r in rows.values():
            if r['state'] == 'blocked' and r['blockers'] and r['blockers'][0]['code'] not in ('DEPENDENCY_BLOCKED', 'DEPENDENCY_PENDING'):
                codes.setdefault(r['blockers'][0]['code'], set()).add(r['key'])
        # Zone 16 (University Club of Kentucky) is no longer a blocker: the compilers project in the course's own zone.
        self.assertNotIn('UTM_ZONE_UNSUPPORTED', codes)
        self.assertNotEqual(rows['layout.terrain.acquire[big-blue-course-uk]']['state'], 'blocked', rows['layout.terrain.acquire[big-blue-course-uk]'])
        self.assertNotIn('TERRAIN_ADAPTER_MISSING', codes)
        self.assertNotEqual(rows['layout.terrain.acquire[the-cardinal]']['state'], 'blocked', rows['layout.terrain.acquire[the-cardinal]'])
        self.assertNotIn('HOLE_COUNT_UNSUPPORTED', codes)
        self.assertIn('layout.publish.prepare[cacapon]', codes['PUBLISH_NOT_APPROVED'])
        self.assertTrue(all(len(v) >= 1 for v in codes.values()))


class OperatorCommandTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-cli-')
        self.h = Harness(self.tmp)

    def tearDown(self):
        self.h.ledger.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_doctor_reports_the_catalog_and_python(self):
        code, text = self.h.run('doctor')
        self.assertIn('python', text)
        self.assertIn('1 facilities, 2 layouts, 2 scorecards', text)
        self.assertIn(code, (0, 1))  # optional tools may be absent; required checks decide the code

    def test_plan_table_and_json_agree(self):
        code, table = self.h.run('plan', '--layout', 'synthetic-a')
        self.assertEqual(code, 0)
        self.assertIn('STATE', table)
        rows = self.h.plan_rows('synthetic-a')
        self.assertEqual(len(rows), 101)
        self.assertEqual(rows['facility.aoi.resolve[synthetic]']['state'], 'ready')
        self.assertEqual(rows['layout.routes.resolve[synthetic-a]']['state'], 'pending')
        self.assertIn('facility.aoi.resolve[synthetic]', table)

    def test_run_writes_json_and_markdown_reports_and_a_ledger(self):
        code, text = self.h.run('run', '--layout', 'synthetic-a')
        self.assertEqual(code, 0, text)
        runs = os.listdir(os.path.join(self.h.output, 'runs'))
        self.assertEqual(len(runs), 1)
        folder = os.path.join(self.h.output, 'runs', runs[0])
        with open(os.path.join(folder, 'report.json'), encoding='utf-8') as f:
            report = json.load(f)
        self.assertEqual(report['failed'], [])
        self.assertGreater(report['totals']['success'], 40)
        self.assertEqual(report['totals'].get('failed', 0), 0)
        self.assertTrue(os.path.isfile(os.path.join(folder, 'report.md')))
        self.assertTrue(os.path.isfile(os.path.join(self.h.output, 'state.sqlite')))
        self.assertTrue(os.path.isdir(os.path.join(folder, 'logs')))
        code, status = self.h.run('status', '--layout', 'synthetic-a', '--json')
        doc = json.loads(status)
        self.assertEqual(doc['recentRuns'][0]['result'], 'ok')
        self.assertEqual(doc['capabilityReport']['earnedTier'], 'C1')

    def test_batch_is_ranked_serial_and_never_reaches_publish(self):
        cohort = os.path.join(self.tmp, 'batch-cohort.json')
        write_json(cohort, {'courses': [
            {'id': '22222222-2222-4222-8222-222222222222', 'name': 'Synthetic B', 'completed_rounds': 9},
            {'id': '11111111-1111-4111-8111-111111111111', 'name': 'Synthetic A', 'completed_rounds': 21},
            {'id': '33333333-3333-4333-8333-333333333333', 'name': 'Uncatalogued', 'completed_rounds': 99},
        ]})
        code, text = self.h.run('batch', '--cohort', cohort, '--max-layouts', '1', '--json')
        self.assertEqual(code, 0, text)
        body = json.loads(text)
        self.assertEqual([entry['layoutId'] for entry in body['selected']], ['synthetic-a'])
        self.assertEqual(body['selected'][0]['rounds'], 21)
        self.assertEqual(body['excluded'][0]['reason'], 'COURSE_NOT_CATALOGUED')
        self.assertNotIn('layout.publish.prepare[synthetic-a]', self.h.pipeline.calls)
        self.assertIn('layout.world.aggregate[synthetic-a]', self.h.pipeline.calls)

    def test_batch_all_layouts_uses_the_catalog_without_a_usage_cohort(self):
        code, text = self.h.run('batch', '--all-layouts', '--dry-run', '--json')
        self.assertEqual(code, 0, text)
        body = json.loads(text)
        self.assertEqual(body['selection'], 'catalog')
        self.assertEqual([entry['layoutId'] for entry in body['selected']], ['synthetic-a', 'synthetic-b'])
        self.assertEqual(body['excluded'], [])
        self.assertTrue(all(entry['executed'] == 0 for entry in body['selected']))

    def test_route_dossier_preserves_unresolved_route_evidence(self):
        code, text = self.h.run('run', '--layout', 'synthetic-a', '--task', 'layout.route.dossier')
        self.assertEqual(code, 0, text)
        path = os.path.join(self.h.output, 'layouts', 'synthetic-a', 'route-review.json')
        with open(path, encoding='utf-8') as f:
            dossier = json.load(f)
        self.assertEqual(dossier['status'], 'resolved')
        self.assertEqual(dossier['truthClass'], 'measured')
        self.assertEqual(len(dossier['routeWayIds']), 18)
        self.assertIn('layout.route.dossier[synthetic-a]', self.h.pipeline.calls)

    def test_route_dossier_never_promotes_an_ambiguous_route_to_canonical_geometry(self):
        layout_path = os.path.join(self.h.catalog, 'layouts', 'synthetic-a.json')
        with open(layout_path, encoding='utf-8') as f:
            layout = json.load(f)
        # The shared resort polygon contains two identically numbered courses.
        # Its OSM candidate set is useful evidence, but cannot select a route.
        layout['siteIds'] = [f'osm-way-{SITE_WAY}']
        write_json(layout_path, layout)
        code, text = self.h.run('run', '--layout', 'synthetic-a', '--task', 'layout.route.dossier')
        self.assertEqual(code, 0, text)
        path = os.path.join(self.h.output, 'layouts', 'synthetic-a', 'route-review.json')
        with open(path, encoding='utf-8') as f:
            dossier = json.load(f)
        self.assertEqual(dossier['status'], 'source_confirmation_required')
        self.assertIsNone(dossier['truthClass'])
        self.assertFalse(dossier['canonicalRouteAdmitted'])
        self.assertIsNone(dossier['routeWayIds'])
        self.assertTrue(dossier['evidenceSummary']['duplicateRefs'])

    def test_nine_hole_layout_is_a_supported_factory_shape(self):
        layout_path = os.path.join(self.h.catalog, 'layouts', 'synthetic-a.json')
        card_path = os.path.join(self.h.catalog, 'scorecards', 'synthetic-a-blue.json')
        with open(layout_path, encoding='utf-8') as f:
            layout = json.load(f)
        with open(card_path, encoding='utf-8') as f:
            card = json.load(f)
        nine = layout['holeOrder'][:9]
        layout['segments']['main']['holes'] = nine
        layout['holeOrder'] = nine
        card['holes'] = card['holes'][:9]
        write_json(layout_path, layout)
        write_json(card_path, card)

        code, text = self.h.run('plan', '--layout', 'synthetic-a', '--json')
        self.assertEqual(code, 0, text)
        rows = {row['key']: row for row in json.loads(text)['rows']}
        self.assertEqual(rows['layout.scorecard.validate[synthetic-a]']['state'], 'cached')
        self.assertNotIn('HOLE_COUNT_UNSUPPORTED', [b['code'] for b in rows['layout.scorecard.validate[synthetic-a]']['blockers']])

    def test_dry_run_executes_nothing(self):
        code, text = self.h.run('run', '--layout', 'synthetic-a', '--dry-run')
        self.assertEqual(code, 0, text)
        self.assertEqual(self.h.pipeline.calls, [])
        self.assertIn('dry-run skipped', text)

    def test_until_and_holes_bound_the_run(self):
        code, text = self.h.run('run', '--layout', 'synthetic-a', '--until', 'layout.terrain.acquire')
        self.assertEqual(code, 0, text)
        self.assertIn('layout.terrain.acquire[synthetic-a]', self.h.pipeline.calls)
        self.assertNotIn('layout.canopy.derive[synthetic-a]', self.h.pipeline.calls)
        mark = len(self.h.pipeline.calls)
        code, text = self.h.run('run', '--layout', 'synthetic-a', '--holes', '7', '--until', 'hole.terrain.compile')
        self.assertEqual(code, 0, text)
        compiled = [c for c in self.h.pipeline.calls[mark:] if c.startswith('hole.terrain.compile')]
        self.assertEqual(compiled, ['hole.terrain.compile[synthetic-a:07]'])

    def test_why_explains_a_pending_node_and_a_manual_invalidation(self):
        code, text = self.h.run('why', '--layout', 'synthetic-a', '--task', 'hole.terrain.compile', '--hole', '7')
        self.assertEqual(code, 0)
        self.assertIn('hole.terrain.compile[synthetic-a:07] is pending (DEPENDENCY_PENDING)', text)
        self.h.run('run', '--layout', 'synthetic-a')
        code, text = self.h.run('invalidate', '--layout', 'synthetic-a', '--task', 'layout.canopy.derive', '--reason', 'new NAIP year')
        self.assertEqual(code, 0)
        self.assertIn('invalidated layout.canopy.derive[synthetic-a]: new NAIP year', text)
        code, text = self.h.run('why', '--layout', 'synthetic-a', '--task', 'layout.canopy.derive')
        self.assertIn('is stale (MANUAL_INVALIDATION)', text)
        self.assertIn('new NAIP year', text)
        with self.assertRaises(SystemExit) as caught:
            self.h.run('why', '--layout', 'synthetic-a', '--task', 'no.such.task')
        self.assertIn('unknown task no.such.task', str(caught.exception))

    def test_unknown_layout_is_refused_with_the_known_list(self):
        with self.assertRaises(SystemExit) as caught:
            self.h.run('plan', '--layout', 'nowhere')
        self.assertIn('synthetic-a', str(caught.exception))

    def test_hole_task_needs_a_hole(self):
        with self.assertRaises(SystemExit):
            self.h.run('why', '--layout', 'synthetic-a', '--task', 'hole.terrain.compile')


class IntakeTests(unittest.TestCase):
    COURSE_A = '11111111-1111-4111-8111-aaaaaaaaaaaa'
    COURSE_B = '22222222-2222-4222-8222-bbbbbbbbbbbb'
    COURSE_C = '33333333-3333-4333-8333-cccccccccccc'
    COURSE_D = '44444444-4444-4444-8444-dddddddddddd'

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-intake-')
        self.h = Harness(self.tmp)
        card = [{'number': n, 'par': 4, 'yardage': 400} for n in range(1, 19)]
        write_json(os.path.join(self.tmp, 'cohort.json'), {'queriedAt': '2026-09-13', 'courses': [
            {'id': self.COURSE_A, 'name': 'Alpha Country Club', 'state': 'NC', 'completed_rounds': 40},
            {'id': self.COURSE_B, 'name': 'Bravo Links', 'state': 'MD', 'completed_rounds': 12},
            {'id': self.COURSE_C, 'name': 'Charlie No. 8', 'state': 'NC', 'completed_rounds': 7},
            {'id': self.COURSE_D, 'name': 'Delta Muni', 'state': 'WV', 'completed_rounds': 1},
        ]})
        write_json(os.path.join(self.tmp, 'coverage.json'), {'generatedAt': '2026-09-18T00:00:00Z', 'facilities': [
            {'name': 'Alpha Country Club', 'state': 'NC', 'libraryIds': [self.COURSE_A], 'libraryNames': ['Alpha Country Club'],
             'osmCourse': {'type': 'way', 'id': 111, 'name': 'Alpha Country Club', 'center': [36.1, -79.9]}, 'holes': 18, 'greens': 18, 'fairways': 18, 'bunkers': 40, 'tees': 50, 'dem1mTiles': [], 'verdict': 'ready'},
            {'name': 'Bravo Links', 'state': 'MD', 'libraryIds': [self.COURSE_B], 'libraryNames': ['Bravo Links'],
             'osmCourse': {'type': 'relation', 'id': 222, 'name': 'Bravo Golf Links', 'center': [39.5, -78.3]}, 'holes': 18, 'greens': 18, 'fairways': 0, 'bunkers': 0, 'tees': 0, 'dem1mTiles': ['USGS 1 Meter 17 x73y438 MD'], 'verdict': 'thin'},
            {'name': 'Charlie Resort (No. 2)', 'state': 'NC', 'libraryIds': ['99999999-9999-4999-8999-999999999999', self.COURSE_C], 'libraryNames': ['Charlie No. 2', 'Charlie No. 8'],
             'osmCourse': {'type': 'way', 'id': 333, 'name': 'Charlie No. 2', 'center': [35.2, -79.5]}, 'holes': 18, 'greens': 18, 'fairways': 18, 'bunkers': 90, 'tees': 60, 'dem1mTiles': [], 'verdict': 'ready'},
        ]})
        write_json(os.path.join(self.tmp, 'scorecards.json'), {'scorecards': [
            {'course_id': self.COURSE_A, 'tee_name': 'Blue', 'holes': card},
            {'course_id': self.COURSE_A, 'tee_name': 'White', 'holes': card},
        ]})

    def tearDown(self):
        self.h.ledger.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def intake(self, *extra):
        return self.h.run('intake', '--cohort', os.path.join(self.tmp, 'cohort.json'), '--coverage', os.path.join(self.tmp, 'coverage.json'),
                          '--scorecards', os.path.join(self.tmp, 'scorecards.json'), *extra)

    def test_report_ranks_by_rounds_and_explains_every_skip(self):
        code, text = self.intake('--json')
        self.assertEqual(code, 0, text)
        rows = json.loads(text)['rows']
        self.assertEqual([r['course'] for r in rows], ['Alpha Country Club', 'Bravo Links', 'Charlie No. 8', 'Delta Muni'])
        by_name = {r['course']: r for r in rows}
        self.assertEqual(by_name['Alpha Country Club']['status'], 'ready_to_write')
        self.assertEqual(by_name['Alpha Country Club']['layoutId'], 'alpha-country-club')
        self.assertEqual(by_name['Bravo Links']['status'], 'ready_to_write')
        self.assertEqual(by_name['Bravo Links']['facilityId'], 'bravo-golf-links')       # named by the OSM element
        self.assertIn('no library scorecard', by_name['Bravo Links']['reason'])
        self.assertEqual(by_name['Charlie No. 8']['status'], 'skipped')
        self.assertIn("polygon of 'Charlie No. 2'", by_name['Charlie No. 8']['reason'])
        self.assertEqual(by_name['Delta Muni']['status'], 'skipped')
        self.assertIn('not in the library coverage audit', by_name['Delta Muni']['reason'])
        self.assertEqual(json.loads(text)['written'], [])
        self.assertEqual(os.listdir(os.path.join(self.h.catalog, 'facilities')), ['synthetic.json'])

    def test_min_rounds_filters_the_tail(self):
        _code, text = self.intake('--json', '--min-rounds', '10')
        self.assertEqual([r['course'] for r in json.loads(text)['rows']], ['Alpha Country Club', 'Bravo Links'])

    def test_write_adds_c0_manifests_once_and_the_plan_names_their_blockers(self):
        code, text = self.intake('--write', '--json')
        self.assertEqual(code, 0, text)
        written = json.loads(text)['written']
        self.assertEqual(sorted(os.path.basename(w) for w in written),
                         ['alpha-country-club-blue.json', 'alpha-country-club.json', 'alpha-country-club.json', 'bravo-golf-links.json', 'bravo-links.json'])
        with open(os.path.join(self.h.catalog, 'layouts', 'alpha-country-club.json'), encoding='utf-8') as f:
            layout = json.load(f)
        self.assertEqual(layout['capabilityTier'], 'C0')
        self.assertIsNone(layout['routeWayIds'])
        self.assertEqual(layout['scorecardProfiles'], ['alpha-country-club-blue'])
        with open(os.path.join(self.h.catalog, 'facilities', 'alpha-country-club.json'), encoding='utf-8') as f:
            facility = json.load(f)
        self.assertEqual(facility['providerPolicy']['terrain'], ['nc_onemap_dem03'])
        self.assertEqual(facility['originWgs84'], [-79.9, 36.1])
        # A second intake sees them as catalogued and writes nothing.
        code, text = self.intake('--write', '--json')
        doc = json.loads(text)
        self.assertEqual(doc['written'], [])
        self.assertEqual({r['course']: r['status'] for r in doc['rows']}['Alpha Country Club'], 'catalogued')
        # The plan for the new layouts is honest about what blocks them.
        rows = self.h.plan_rows('alpha-country-club')
        self.assertEqual(rows['layout.terrain.acquire[alpha-country-club]']['state'], 'pending')
        self.assertEqual(rows['layout.terrain.acquire[alpha-country-club]']['reason'], 'DEPENDENCY_PENDING')
        rows = self.h.plan_rows('bravo-links')
        self.assertEqual(rows['layout.scorecard.validate[bravo-links]']['blockers'][0]['code'], 'SCORECARD_REQUIRED')


if __name__ == '__main__':
    unittest.main()


class OverpassRetryTests(unittest.TestCase):
    def test_transient_overpass_errors_are_retried_with_bounded_backoff(self):
        import urllib.error
        from unittest import mock

        from factory import adapters

        class Flaky:
            def __init__(self, failures, code):
                self.calls, self.failures, self.code = 0, failures, code

            def __call__(self, request, timeout):
                self.calls += 1
                if self.calls <= self.failures:
                    raise urllib.error.HTTPError(adapters.OVERPASS, self.code, 'busy', {}, io.BytesIO(b''))
                return mock.MagicMock(__enter__=lambda s: io.BytesIO(b'{"elements": []}'), __exit__=lambda *a: False)

        waits = []
        with mock.patch.object(adapters.urllib.request, 'urlopen', Flaky(2, 504)):
            self.assertEqual(adapters.overpass('q', 1000, sleep=waits.append), b'{"elements": []}')
        self.assertEqual(waits, list(adapters.OVERPASS_RETRY_SECONDS[:2]))
        waits.clear()
        with mock.patch.object(adapters.urllib.request, 'urlopen', Flaky(9, 429)), self.assertRaises(urllib.error.HTTPError):
            adapters.overpass('q', 1000, sleep=waits.append)
        self.assertEqual(waits, list(adapters.OVERPASS_RETRY_SECONDS))
        waits.clear()
        with mock.patch.object(adapters.urllib.request, 'urlopen', Flaky(1, 400)), self.assertRaises(urllib.error.HTTPError):
            adapters.overpass('q', 1000, sleep=waits.append)
        self.assertEqual(waits, [])


class SnapshotRevisionTests(unittest.TestCase):
    """The real snapshot adapters never overwrite an immutable extract."""

    def setUp(self):
        from factory.catalog import load_catalog
        from factory.context import Context
        from factory.graph import build_graph
        from factory.ledger import Ledger
        from factory.tasks import default_specs
        self.tmp = tempfile.mkdtemp(prefix='factory-snapshot-')
        catalog_root = os.path.join(self.tmp, 'catalog')
        write_catalog(catalog_root)
        self.output = os.path.join(self.tmp, 'out')
        self.ledger = Ledger(os.path.join(self.output, 'state.sqlite'))
        self.ctx = Context(self.tmp, load_catalog(catalog_root), self.output, self.ledger)
        graph = build_graph(self.ctx.catalog, default_specs(), layout_ids=['synthetic-a'])
        self.node = graph.nodes['facility.osm.snapshot[synthetic]']
        write_json(self.ctx.aoi_path('synthetic'), {'bboxWgs84': [-78.3, 39.5, -78.29, 39.51], 'element': 'way/1', 'centroidWgs84': [-78.295, 39.505]})
        self.fetches = []

    def tearDown(self):
        self.ledger.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def fake_run_script(self, ctx, run, node, script_rel, args):
        out = args[-1]
        self.fetches.append(out)
        os.makedirs(out, exist_ok=True)
        with open(os.path.join(out, 'overpass.json.gz'), 'wb') as f:
            f.write(b'gz' + str(len(self.fetches)).encode())
        write_json(os.path.join(out, 'manifest.json'), {'uncompressedSha256': f'sha-{len(self.fetches)}', 'elementCount': 1})

    def snapshot(self):
        from unittest import mock

        from factory import adapters
        from factory.runner import Run
        run = Run(run_id='run-t', out_dir=os.path.join(self.output, 'runs', 'run-t'))
        os.makedirs(os.path.join(run.out_dir, 'logs'), exist_ok=True)
        with mock.patch.object(adapters, 'run_script', self.fake_run_script):
            return adapters.snapshot_osm(self.node, self.ctx, run)

    def test_reuse_partial_and_manual_revisions(self):
        first = self.snapshot()
        key_dir = self.ctx.snapshot_dir('synthetic', 'osm')
        self.assertEqual(os.path.dirname(first[1].path), key_dir)
        self.assertEqual(len(self.fetches), 1)
        self.ledger.record_success('run-t', self.node, 'fp1', {}, first)
        # An implementation change re-runs the task: the complete extract is reused, no fetch.
        again = self.snapshot()
        self.assertEqual(len(self.fetches), 1)
        self.assertEqual(again[1].sha256, first[1].sha256)
        # A manual invalidation fetches a new revision and moves the pointer.
        self.ledger.invalidate(self.node.key, 'synthetic', 'OSM edit')
        fresh = self.snapshot()
        self.assertEqual(len(self.fetches), 2)
        self.assertTrue(self.fetches[1].endswith('-r2'), self.fetches[1])
        self.assertEqual(self.ctx.osm_dir('synthetic'), self.fetches[1])
        self.assertNotEqual(fresh[1].sha256, first[1].sha256)
        self.assertTrue(os.path.isfile(os.path.join(key_dir, 'overpass.json.gz')), 'the first revision stays immutable')
        # A partial directory (interrupted fetch) is replaced in place.
        self.ledger.record_success('run-t', self.node, 'fp2', {}, fresh)
        os.remove(os.path.join(self.fetches[1], 'manifest.json'))
        self.snapshot()
        self.assertEqual(len(self.fetches), 3)
        self.assertEqual(self.fetches[2], self.fetches[1])

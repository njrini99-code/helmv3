"""Bounded vector batches and retained-source route recovery; no network/raster."""
import gzip
import hashlib
import io
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from factory import cli, osm
from factory.route_recovery import visual_corridor_candidates, visual_render_plan
from factory.catalog import load_catalog
from factory.context import Context
from factory_testkit import SITE_A, SITE_WAY, Harness, read_json, write_json

ROOT = Path(__file__).resolve().parents[3]


class RouteRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-route-recovery-')
        self.h = Harness(self.tmp)

    def tearDown(self):
        self.h.ledger.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def report(self, *args):
        code, text = self.h.run('route-recovery', *args, '--json')
        return code, json.loads(text)

    def retain_routes(self):
        code, text = self.h.run('run', '--layout', 'synthetic-a', '--until', 'layout.routes.resolve')
        self.assertEqual(code, 0, text)
        self.h.pipeline.calls.clear()

    def change_layout(self, **changes):
        path = os.path.join(self.h.catalog, 'layouts', 'synthetic-a.json')
        layout = read_json(path)
        layout.update(changes)
        write_json(path, layout)
        return layout

    def test_missing_sources_produce_remediation_without_running_adapters(self):
        code, report = self.report()
        self.assertEqual(code, 0)
        self.assertEqual(report['totals']['layouts'], 2)
        self.assertEqual(report['totals']['candidateAssemblyReady'], 0)
        self.assertEqual(self.h.pipeline.calls, [])
        row = report['layouts'][0]
        self.assertIn('OSM_SNAPSHOT_REQUIRED', row['blockers'])
        self.assertEqual(row['commands'][0][-2:], ['--until', 'facility.osm.snapshot'])
        self.assertFalse(report['contract']['grantsReviewApproval'])
        self.assertFalse(report['contract']['maySupplyHoleAssociation'])

    def test_resolved_routes_offer_vector_assembly_and_keep_raw_candidate_ids(self):
        self.retain_routes()
        code, report = self.report('--layout', 'synthetic-a')
        self.assertEqual(code, 0)
        self.assertEqual(report['totals']['candidateAssemblyReady'], 1)
        row = report['layouts'][0]
        self.assertEqual(row['selectedWayIds'], list(range(1001, 1019)))
        self.assertEqual(row['source']['status'], 'verified')
        self.assertEqual({c['id'] for c in row['osmWayCandidates']}, set(range(1001, 1019)) | set(range(2001, 2019)))
        self.assertEqual(row['commands'][-1][-2:], ['--until', 'layout.candidates.compose'])
        self.assertEqual(self.h.pipeline.calls, [])

    def test_duplicate_numbered_routes_stay_ambiguous(self):
        self.retain_routes()
        self.change_layout(siteIds=[f'osm-way-{SITE_WAY}'])
        code, report = self.report('--layout', 'synthetic-a')
        self.assertEqual(code, 0)
        row = report['layouts'][0]
        self.assertEqual(row['routeStatus'], 'identity_review_required')
        self.assertIsNone(row['selectedWayIds'])
        self.assertFalse(row['candidateAssemblyReady'])
        self.assertTrue(row['attempts'][0]['duplicateRefs'])
        self.assertFalse(any('layout.candidates.compose' in cmd for cmd in row['commands']))
        sites = {site['siteId']: site for site in row['osmCourseSites']}
        self.assertIsNone(sites[f'osm-way-{SITE_WAY}']['proposedWayIds'])
        self.assertEqual(sites[f'osm-way-{SITE_A}']['proposedWayIds'], list(range(1001, 1019)))
        self.assertFalse(sites[f'osm-way-{SITE_A}']['catalogSelected'])

    def test_inventory_does_not_open_or_create_a_ledger(self):
        output = Path(self.tmp, 'never-created')
        with patch('factory.cli.Ledger', side_effect=AssertionError('inventory opened a ledger')):
            code = cli.main(['--repo-root', self.tmp, '--catalog', self.h.catalog, '--output', str(output),
                             'route-recovery', '--json'], out=io.StringIO())
        self.assertEqual(code, 0)
        self.assertFalse(output.exists())

    def test_malformed_retained_element_fails_closed(self):
        self.retain_routes()
        extract = next(Path(self.h.output).glob('facilities/synthetic/osm/**/overpass.json.gz'))
        raw = json.dumps({'elements': [None]}).encode()
        extract.write_bytes(gzip.compress(raw))
        manifest = read_json(extract.with_name('manifest.json'))
        manifest['uncompressedSha256'] = hashlib.sha256(raw).hexdigest()
        write_json(extract.with_name('manifest.json'), manifest)
        code, report = self.report()
        self.assertEqual(code, 1)
        self.assertEqual(report['totals']['invalidSources'], 2)
        self.assertTrue(all('ROUTE_SOURCE_UNREADABLE' in row['blockers'] for row in report['layouts']))

    def test_extract_size_is_bounded_before_proposals(self):
        self.retain_routes()
        with patch('factory.route_recovery.MAX_EXTRACT_BYTES', 100):
            code, report = self.report()
        self.assertEqual(code, 1)
        self.assertTrue(all(not row['osmWayCandidates'] for row in report['layouts']))

    def test_source_checksum_failure_blocks_proposals_and_does_not_hide_siblings(self):
        self.retain_routes()
        extract = next(Path(self.h.output).glob('facilities/synthetic/osm/**/overpass.json.gz'))
        raw = json.loads(gzip.decompress(extract.read_bytes()))
        raw['elements'][0]['tags']['name'] = 'Changed retained bytes'
        extract.write_bytes(gzip.compress(json.dumps(raw).encode()))
        code, report = self.report()
        self.assertEqual(code, 1)
        self.assertEqual(report['totals']['invalidSources'], 2)
        self.assertTrue(all(not row['osmWayCandidates'] and not row['candidateAssemblyReady'] for row in report['layouts']))

    def test_missing_scorecard_and_bad_pinned_routes_are_distinct_blockers(self):
        self.retain_routes()
        self.change_layout(routeWayIds=list(range(3001, 3019)), scorecardProfiles=[])
        Path(self.h.catalog, 'scorecards', 'synthetic-a-blue.json').unlink()
        code, report = self.report('--layout', 'synthetic-a')
        self.assertEqual(code, 0)
        row = report['layouts'][0]
        self.assertFalse(row['candidateAssemblyReady'])
        self.assertIn('SCORECARD_REQUIRED', row['blockers'])
        self.assertIn('OSM_ROUTE_ASSEMBLY_CONTRACT_MISMATCH', row['blockers'])

    def test_unknown_scope_is_rejected(self):
        with self.assertRaisesRegex(SystemExit, 'unknown layout'):
            self.report('--layout', 'made-up')
        self.assertEqual(self.h.pipeline.calls, [])


class VisualRouteCandidateTests(unittest.TestCase):
    @staticmethod
    def extract():
        def polygon(way_id, golf, x, y):
            return {
                'type': 'way', 'id': way_id, 'tags': {'golf': golf},
                'geometry': [
                    {'lon': x, 'lat': y}, {'lon': x + .0001, 'lat': y},
                    {'lon': x + .0001, 'lat': y + .0001}, {'lon': x, 'lat': y + .0001},
                    {'lon': x, 'lat': y},
                ],
            }
        return {'elements': [
            polygon(1, 'tee', -79.0000, 36.0000),
            polygon(2, 'green', -79.0000, 36.0030),
            polygon(3, 'fairway', -79.0001, 36.0015),
            # A malformed source way must be ignored, not repaired.
            {'type': 'way', 'id': 4, 'tags': {'golf': 'green'}, 'geometry': [{'lon': -79, 'lat': 36}]},
        ]}

    def test_pair_is_anonymous_visual_estimate_not_a_route_or_hole_identity(self):
        report = visual_corridor_candidates(self.extract(), {'layoutId': 'synthetic-a', 'holeOrder': ['synthetic-a-01']})
        self.assertEqual(report['candidateCount'], 1)
        self.assertEqual(report['greenOnlyCount'], 0)
        candidate = report['candidates'][0]
        self.assertEqual(candidate['truthClass'], 'estimated')
        self.assertEqual(candidate['authority'], 'visual_only')
        self.assertNotIn('physicalHoleId', candidate)
        self.assertNotIn('ordinal', candidate)
        self.assertNotIn('routeWayId', candidate)
        self.assertEqual(candidate['visualCorridorWgs84']['type'], 'LineString')
        self.assertFalse(candidate['pairingEvidence']['layoutScorecardUsed'])
        self.assertFalse(candidate['pairingEvidence']['holeOrderUsed'])
        contract = report['renderingContract']
        self.assertTrue(contract['canRender'])
        self.assertFalse(contract['canMeasure'])
        self.assertFalse(contract['maySupplyHoleAssociation'])
        self.assertFalse(contract['maySupplyTeeIdentity'])
        self.assertFalse(contract['maySupplyRouteIdentity'])

    def test_green_without_defensible_tee_range_is_green_only_context(self):
        extract = self.extract()
        extract['elements'][0]['geometry'] = [
            {'lon': -79, 'lat': 35}, {'lon': -78.9, 'lat': 35}, {'lon': -78.9, 'lat': 35.1},
            {'lon': -79, 'lat': 35.1}, {'lon': -79, 'lat': 35},
        ]
        report = visual_corridor_candidates(extract, {'layoutId': 'synthetic-a', 'holeOrder': ['synthetic-a-01']})
        self.assertEqual(report['candidateCount'], 0)
        self.assertEqual(report['greenOnlyCount'], 1)
        self.assertEqual(report['greenOnlyCandidates'][0]['truthClass'], 'derived')
        self.assertEqual(report['greenOnlyCandidates'][0]['authority'], 'visual_only')
        self.assertTrue(report['renderingContract']['canRender'])
        self.assertFalse(report['renderingContract']['maySupplyPhysicalGeometry'])

    def test_render_plan_requires_verified_retained_artifact_and_is_not_a_canonical_asset(self):
        class ContextForPlan:
            def layout_out(self, layout_id):
                return '/factory/layouts/' + layout_id

            def relpath(self, path):
                return path

        candidates = visual_corridor_candidates(self.extract(), {'layoutId': 'synthetic-a', 'holeOrder': ['synthetic-a-01']})
        plan = visual_render_plan(ContextForPlan(), {'layoutId': 'synthetic-a', 'holeOrder': ['synthetic-a-01']},
                                  {'status': 'verified', 'path': 'facility/osm/overpass.json.gz', 'sha256': 'a' * 64}, candidates, False)
        self.assertEqual(plan['status'], 'ready_display_only_compile')
        self.assertEqual(len(plan['assets']), 1)
        asset = plan['assets'][0]
        self.assertEqual(asset['authority'], 'visual_only')
        self.assertEqual(asset['sourceArtifact']['sha256'], 'a' * 64)
        self.assertNotIn('physicalHoleId', asset)
        self.assertNotIn('ordinal', asset)
        self.assertTrue(asset['suggestedDerivedDirectory'].endswith('visual-corridor-osm-way-2-from-1'))
        contract = plan['renderingContract']
        self.assertFalse(contract['canMeasure'])
        self.assertFalse(contract['mayEnterCanonicalPackage'])
        self.assertFalse(contract['mayEnterOneTap'])
        self.assertFalse(contract['mayPublishAsPhysicalHoleWorld'])
        blocked = visual_render_plan(ContextForPlan(), {'layoutId': 'synthetic-a', 'holeOrder': ['synthetic-a-01']},
                                     {'status': 'invalid'}, candidates, False)
        self.assertEqual(blocked['status'], 'blocked_source_artifact_unverified')
        self.assertEqual(blocked['assets'], [])

    def test_resolved_route_layout_has_no_competing_visual_candidate_asset_plan(self):
        class ContextForPlan:
            def layout_out(self, layout_id):
                return '/factory/layouts/' + layout_id

            def relpath(self, path):
                return path

        empty = {
            'candidateCount': 0, 'greenOnlyCount': 0, 'sourceFeatureCounts': {'tee': 0, 'green': 0, 'fairway': 0},
            'candidates': [], 'greenOnlyCandidates': [],
            'renderingContract': {'canRender': False, 'canMeasure': False, 'maySupplyHoleAssociation': False,
                                  'maySupplyTeeIdentity': False, 'maySupplyRouteIdentity': False,
                                  'maySupplyPhysicalGeometry': False, 'rule': 'canonical route wins'},
        }
        plan = visual_render_plan(ContextForPlan(), {'layoutId': 'synthetic-a', 'holeOrder': ['synthetic-a-01']},
                                  {'status': 'verified', 'path': 'facility/osm/overpass.json.gz', 'sha256': 'a' * 64}, empty, True)
        self.assertEqual(plan['status'], 'not_required_canonical_route_available')
        self.assertEqual(plan['assets'], [])


class EaglePointRoutingTests(unittest.TestCase):
    def test_explicit_main_course_site_resolves_retained_18_without_par3_guess(self):
        path = ROOT / 'src/test/fixtures/course-geometry/eagle-point-routing-evidence.json'
        extract = read_json(path)
        elements = {e['id']: e for e in extract['elements']}
        def site(way_id):
            return {'polygon': osm.way_points(elements[way_id])}
        enclosing, evidence = osm.propose_routes(extract, site(1509573612), 18, layout_name='Eagle Point')
        self.assertIsNone(enclosing)
        self.assertEqual(len(evidence['duplicateRefs']), 9)
        short = osm.hole_ways(extract, site(1509582683))
        self.assertEqual(sorted(h['ref'] for h in short), list(range(1, 10)))
        catalog = load_catalog(str(ROOT / 'course-geometry/catalog'))
        self.assertEqual(catalog.layouts['eagle-point']['siteIds'], ['osm-way-1509582682'])
        self.assertEqual(catalog.facilities['eagle-point-golf-club']['aoi']['id'], 'way/1509573612')
        self.assertIn('way/1509582682', catalog.facilities['eagle-point-golf-club']['sourcePins']['osm'])
        with tempfile.TemporaryDirectory() as output:
            ctx = Context(str(ROOT), catalog, output)
            ctx.snapshot = lambda _: ({'uncompressedSha256': hashlib.sha256(path.read_bytes()).hexdigest()}, str(path))
            result = ctx.route_resolution('eagle-point')
        self.assertEqual(result['source'], 'osm_ref_unique')
        self.assertEqual(result['site'], 'osm-way-1509582682')
        self.assertEqual(len(result['routeWayIds']), 18)
        self.assertTrue(set(result['routeWayIds']).isdisjoint(h['id'] for h in short))
        self.assertEqual([elements[i]['tags']['ref'] for i in result['routeWayIds']], [str(i) for i in range(1, 19)])
        self.assertIsNone(catalog.layouts['eagle-point']['routeWayIds'])
        self.assertEqual(catalog.layouts['eagle-point']['capabilityTier'], 'C0')


class BoundedBatchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='factory-bounded-batch-')
        self.h = Harness(self.tmp, site_a_shared=True)

    def tearDown(self):
        self.h.ledger.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_candidate_batch_keeps_unresolved_identity_blocked_without_rasters(self):
        code, text = self.h.run('batch', '--all-layouts', '--until', 'layout.candidates.compose', '--json')
        self.assertEqual(code, 0, text)
        body = json.loads(text)
        self.assertEqual(body['totals']['attempted'], 2)
        self.assertTrue(body['selected'][0]['blocked'])
        self.assertIn('layout.candidates.compose[synthetic-b]', self.h.pipeline.calls)
        allowed = {'facility.aoi.resolve', 'facility.osm.snapshot', 'layout.routes.propose', 'layout.routes.resolve',
                   'layout.scorecard.compose', 'layout.candidates.compose'}
        self.assertTrue(all(call.split('[', 1)[0] in allowed for call in self.h.pipeline.calls), self.h.pipeline.calls)

    def test_dossier_batch_does_not_build_visual_worlds(self):
        code, text = self.h.run('batch', '--all-layouts', '--until', 'layout.route.dossier', '--json')
        self.assertEqual(code, 0, text)
        allowed = {'facility.aoi.resolve', 'facility.osm.snapshot', 'layout.route.dossier'}
        self.assertTrue(all(call.split('[', 1)[0] in allowed for call in self.h.pipeline.calls), self.h.pipeline.calls)
        self.assertIn('layout.route.dossier[synthetic-a]', self.h.pipeline.calls)

    def test_default_world_batch_keeps_visual_fallback_for_unresolved_routes(self):
        code, text = self.h.run('batch', '--all-layouts', '--json')
        self.assertEqual(code, 0, text)
        self.assertIn('layout.visual.world.build[synthetic-a]', self.h.pipeline.calls)
        self.assertIn('layout.route.dossier[synthetic-a]', self.h.pipeline.calls)
        self.assertIn('layout.world.aggregate[synthetic-b]', self.h.pipeline.calls)

    def test_unknown_terminal_fails_before_any_adapter_runs(self):
        with self.assertRaisesRegex(SystemExit, 'unknown batch terminal'):
            self.h.run('batch', '--all-layouts', '--until', 'layout.candidate.typo')
        self.assertEqual(self.h.pipeline.calls, [])

    def test_early_terminal_does_not_force_route_prerequisites(self):
        code, text = self.h.run('batch', '--all-layouts', '--until', 'catalog.validate', '--json')
        self.assertEqual(code, 0, text)
        self.assertEqual(self.h.pipeline.calls, [])


if __name__ == '__main__':
    unittest.main()

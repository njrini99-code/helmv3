"""Unit tests for the `ship` QA gates (factory/ship.py) and the approve/
upload glue (factory/ship_publish.py). Gates are pure functions over
already-loaded documents, so every test here builds synthetic docs and never
touches disk, a subprocess, or the network -- per the plan, this is the
layer team-lead asked to be unit-tested directly."""
import io
import json
import unittest
import urllib.error
from unittest import mock

from factory import ship, ship_publish
from factory.fingerprints import digest


def make_content_hashed(**fields):
    fields = dict(fields)
    fields['contentHash'] = digest({k: v for k, v in fields.items() if k != 'contentHash'})
    return fields


def make_package(holes, features, **extra):
    return make_content_hashed(holes=holes, features=features, **extra)


def feature(fid, kind, hole_key):
    return {'id': fid, 'kind': kind, 'holeKeys': [hole_key]}


def make_hole(ordinal, par, feature_ids):
    return {'key': f'h{ordinal:02d}', 'ordinal': ordinal, 'par': par, 'featureIds': feature_ids}


def full_18_holes():
    holes, features = [], []
    for ordinal in range(1, 19):
        par = 3 if ordinal in (3, 8) else (4 if ordinal % 2 else 5)
        key = f'h{ordinal:02d}'
        ids = [f'{key}-tee', f'{key}-green']
        features += [feature(f'{key}-tee', 'tee', key), feature(f'{key}-green', 'green', key)]
        if par >= ship.FAIRWAY_MIN_PAR:
            ids.append(f'{key}-fairway')
            features.append(feature(f'{key}-fairway', 'fairway', key))
        holes.append(make_hole(ordinal, par, ids))
    return holes, features


class HolesShapeGateTests(unittest.TestCase):
    def test_full_18_holes_with_correct_surfaces_passes(self):
        holes, features = full_18_holes()
        package = make_package(holes, features)
        self.assertEqual(ship.gate_holes_shape(package), [])

    def test_missing_package_is_its_own_blocker(self):
        self.assertEqual(ship.gate_holes_shape(None), [ship.blocker('PACKAGE_MISSING')])

    def test_wrong_hole_count_is_flagged(self):
        holes, features = full_18_holes()
        package = make_package(holes[:17], features)
        codes = [b['code'] for b in ship.gate_holes_shape(package)]
        self.assertIn('HOLE_COUNT_WRONG', codes)

    def test_par_3_does_not_require_a_fairway(self):
        holes, features = full_18_holes()
        # hole 3 is par 3 in full_18_holes() and has no fairway feature.
        package = make_package(holes, features)
        blockers = [b for b in ship.gate_holes_shape(package) if b.get('holeKey') == 'h03']
        self.assertEqual(blockers, [])

    def test_par_5_missing_fairway_is_flagged_like_peek_hole_11(self):
        holes, features = full_18_holes()
        # Drop hole 11's fairway feature and its id, mirroring the real gap.
        key = 'h11'
        holes = [h if h['key'] != key else {**h, 'featureIds': [f for f in h['featureIds'] if not f.endswith('fairway')]} for h in holes]
        features = [f for f in features if f['id'] != f'{key}-fairway']
        package = make_package(holes, features)
        blockers = ship.gate_holes_shape(package)
        self.assertIn(ship.blocker('HOLE_SURFACE_MISSING', holeKey='h11', ordinal=11, par=4, surfaceClass='fairway'), blockers)

    def test_missing_green_or_tee_is_flagged_regardless_of_par(self):
        holes, features = full_18_holes()
        key = 'h03'  # par 3, so only tee/green apply here
        holes = [h if h['key'] != key else {**h, 'featureIds': [f for f in h['featureIds'] if not f.endswith('green')]} for h in holes]
        features = [f for f in features if f['id'] != f'{key}-green']
        package = make_package(holes, features)
        blockers = ship.gate_holes_shape(package)
        self.assertIn(ship.blocker('HOLE_SURFACE_MISSING', holeKey='h03', ordinal=3, par=3, surfaceClass='green'), blockers)


class TracedSurfacesTests(unittest.TestCase):
    def test_traced_fairway_passes_the_shape_gate_but_is_listed_for_review(self):
        holes, features = full_18_holes()
        traced = {'id': 'h01-fairway-trace', 'kind': 'fairway', 'holeKeys': ['h01'], 'sourceIds': ['naip-trace-2026-09-23T00:00:00Z']}
        holes[0]['featureIds'] = [fid for fid in holes[0]['featureIds'] if not fid.endswith('fairway')] + [traced['id']]
        package = make_package(holes, [f for f in features if f['id'] != 'h01-fairway'] + [traced])
        self.assertEqual(ship.gate_holes_shape(package), [])
        self.assertEqual(ship.traced_surfaces(package), [{'featureId': 'h01-fairway-trace', 'kind': 'fairway', 'holeKeys': ['h01'],
                                                          'sourceIds': ['naip-trace-2026-09-23T00:00:00Z']}])

    def test_mapped_surfaces_are_not_listed(self):
        holes, features = full_18_holes()
        mapped = [dict(f, sourceIds=['osm-overpass-2026-09-20']) for f in features]
        self.assertEqual(ship.traced_surfaces(make_package(holes, mapped)), [])
        self.assertEqual(ship.traced_surfaces(None), [])


class HashChainGateTests(unittest.TestCase):
    def setUp(self):
        holes, features = full_18_holes()
        self.package = make_package(holes, features)
        self.expected = self.package['contentHash']
        self.asset_manifest = {'geometryHash': self.expected, 'holes': {}}
        self.context_layer = make_content_hashed(packageHash=self.expected, zones=[])
        self.hole_docs = {
            'h01': {'mesh': {'geometryHash': self.expected, 'contentHash': 'meshhash'},
                    'report': {'contentHash': 'meshhash'}, 'entry': {'contentHash': 'meshhash'}},
        }

    def test_consistent_chain_passes(self):
        self.assertEqual(ship.gate_hash_chain(self.package, self.asset_manifest, self.context_layer, self.hole_docs), [])

    def test_missing_package_is_its_own_blocker(self):
        self.assertEqual(ship.gate_hash_chain(None, self.asset_manifest, self.context_layer, self.hole_docs), [ship.blocker('PACKAGE_MISSING')])

    def test_tampered_package_content_hash_is_flagged(self):
        tampered = {**self.package, 'contentHash': 'deadbeef'}
        codes = [b['code'] for b in ship.gate_hash_chain(tampered, self.asset_manifest, self.context_layer, {})]
        self.assertIn('PACKAGE_HASH_MISMATCH', codes)

    def test_terrain_geometry_hash_mismatch_is_flagged(self):
        bad_manifest = {**self.asset_manifest, 'geometryHash': 'stale'}
        blockers = ship.gate_hash_chain(self.package, bad_manifest, self.context_layer, {})
        self.assertTrue(any(b['code'] == 'HASH_CHAIN_BROKEN' and b['field'] == 'terrain.geometryHash' for b in blockers))

    def test_missing_asset_manifest_is_flagged(self):
        blockers = ship.gate_hash_chain(self.package, None, self.context_layer, {})
        self.assertIn(ship.blocker('TERRAIN_ASSET_MANIFEST_MISSING'), blockers)

    def test_context_package_hash_mismatch_is_flagged(self):
        bad_context = {**self.context_layer, 'packageHash': 'stale'}
        blockers = ship.gate_hash_chain(self.package, self.asset_manifest, bad_context, {})
        self.assertTrue(any(b['code'] == 'HASH_CHAIN_BROKEN' and b['field'] == 'context.packageHash' for b in blockers))

    def test_hole_mesh_hash_disagreement_is_flagged(self):
        docs = {'h01': {'mesh': {'geometryHash': self.expected, 'contentHash': 'A'},
                        'report': {'contentHash': 'B'}, 'entry': {'contentHash': 'A'}}}
        blockers = ship.gate_hash_chain(self.package, self.asset_manifest, self.context_layer, docs)
        self.assertTrue(any(b['code'] == 'HOLE_MESH_HASH_MISMATCH' and b['holeKey'] == 'h01' for b in blockers))

    def test_missing_hole_evidence_is_flagged(self):
        blockers = ship.gate_hash_chain(self.package, self.asset_manifest, self.context_layer, {'h01': {'mesh': None, 'report': None, 'entry': None}})
        self.assertIn(ship.blocker('HOLE_TERRAIN_EVIDENCE_MISSING', holeKey='h01'), blockers)


class TJunctionGateTests(unittest.TestCase):
    def test_zero_everywhere_passes(self):
        summary = {'holes': [{'key': 'h01', 'ordinal': 1, 'tJunctionVertices': 0}]}
        self.assertEqual(ship.gate_t_junctions(summary), [])

    def test_nonzero_is_flagged(self):
        summary = {'holes': [{'key': 'h01', 'ordinal': 1, 'tJunctionVertices': 3}]}
        self.assertEqual(ship.gate_t_junctions(summary), [ship.blocker('T_JUNCTIONS_PRESENT', holeKey='h01', ordinal=1, tJunctionVertices=3)])

    def test_missing_summary_is_flagged(self):
        self.assertEqual(ship.gate_t_junctions(None), [ship.blocker('TERRAIN_SUMMARY_MISSING')])


class ContextUncertainGateTests(unittest.TestCase):
    def test_within_bound_passes(self):
        # Real courses, including Peek's own golden, run well above the old
        # 0.15 target -- this is an advisory backstop now (0.60), not a
        # target: owner sign-off happens at `ship --approve`.
        report = {'holes': [{'key': 'h01', 'uncertainShare': 0.495}]}
        self.assertEqual(ship.gate_context_uncertain(report), [])

    def test_over_bound_is_flagged(self):
        report = {'holes': [{'key': 'h01', 'uncertainShare': 0.7}]}
        self.assertEqual(ship.gate_context_uncertain(report), [ship.blocker('CONTEXT_UNCERTAIN_SHARE_EXCEEDED', holeKey='h01', uncertainShare=0.7, max=0.60)])

    def test_missing_report_is_flagged(self):
        self.assertEqual(ship.gate_context_uncertain(None), [ship.blocker('CONTEXT_REPORT_MISSING')])

    def test_shares_are_reported_for_every_hole_regardless_of_the_backstop(self):
        report = {'holes': [{'key': 'h01', 'uncertainShare': 0.1}, {'key': 'h02', 'uncertainShare': 0.7}]}
        self.assertEqual(ship.context_uncertain_shares(report), [{'holeKey': 'h01', 'uncertainShare': 0.1}, {'holeKey': 'h02', 'uncertainShare': 0.7}])
        self.assertEqual(ship.context_uncertain_shares(None), [])


class BundleCapturesGateTests(unittest.TestCase):
    """Ship's own player-capture evidence, from the factory-lab bundle
    capture (`ship_run._capture_bundle`), not the legacy fixture-lab
    `hole.player.capture` DAG task."""
    def test_18_holes_no_errors_passes(self):
        report = {'captures': [{'holeKey': f'h{n:02d}', 'renderer': {'drawCallStatus': 'within'}} for n in range(18)], 'errors': []}
        self.assertEqual(ship.gate_bundle_captures(report), [])
        self.assertEqual(ship.gate_draw_call_budget(report), [])

    def test_wrong_hole_count_is_flagged(self):
        report = {'captures': [{'holeKey': 'h01', 'renderer': {}}], 'errors': []}
        self.assertIn(ship.blocker('SHIP_CAPTURE_HOLE_COUNT_WRONG', expected=18, actual=1), ship.gate_bundle_captures(report))

    def test_console_errors_are_flagged(self):
        report = {'captures': [], 'errors': [{'hole': 'h01', 'message': 'TypeError: x'}]}
        blockers = ship.gate_bundle_captures(report)
        self.assertTrue(any(b['code'] == 'SHIP_CAPTURE_CONSOLE_ERRORS' and b['holeKey'] == 'h01' for b in blockers))

    def test_missing_report_is_flagged(self):
        self.assertEqual(ship.gate_bundle_captures(None), [ship.blocker('SHIP_CAPTURES_MISSING')])
        self.assertEqual(ship.gate_draw_call_budget(None), [])  # gate_bundle_captures already covers total absence

    def test_draw_call_breach_is_flagged_but_within_and_absent_status_are_not(self):
        report = {'captures': [
            {'holeKey': 'h01', 'renderer': {'drawCallStatus': 'within', 'drawCalls': 10, 'drawCallBudget': 100}},
            {'holeKey': 'h02', 'renderer': {'drawCallStatus': 'over', 'drawCalls': 500, 'drawCallBudget': 100}},
            {'holeKey': 'h03', 'renderer': {}},
        ], 'errors': []}
        blockers = ship.gate_draw_call_budget(report)
        self.assertEqual(blockers, [ship.blocker('DRAW_CALL_BUDGET_EXCEEDED', holeKey='h02', drawCalls=500, drawCallBudget=100, status='over')])


class GlbSpanGateTests(unittest.TestCase):
    def test_no_report_is_not_gated_blender_did_not_run(self):
        self.assertEqual(ship.gate_glb_span({'h01': None}), [])

    def test_passing_report_within_tolerance_passes(self):
        self.assertEqual(ship.gate_glb_span({'h01': {'passed': True, 'absoluteErrorMeters': [0.001, 0.002, 0.0]}}), [])

    def test_over_tolerance_is_flagged(self):
        blockers = ship.gate_glb_span({'h01': {'passed': True, 'absoluteErrorMeters': [0.03, 0.0, 0.0]}})
        self.assertEqual(blockers, [ship.blocker('GLB_SPAN_EXCEEDED', holeKey='h01', worstErrorMeters=0.03, max=0.02)])

    def test_not_passed_is_flagged_even_if_error_looks_small(self):
        blockers = ship.gate_glb_span({'h01': {'passed': False, 'absoluteErrorMeters': [0.0]}})
        self.assertTrue(any(b['code'] == 'GLB_SPAN_EXCEEDED' for b in blockers))


class MergeApprovalTests(unittest.TestCase):
    def test_existing_layout_keeps_its_fields_and_only_gains_the_package(self):
        approvals = {'layouts': {'peek-n-peak-upper': {
            'geometryFeatureFlag': 'peek_n_peak_one_tap_v1', 'syncFeatureFlag': 'peek_n_peak_one_tap_sync_v1',
            'renderWorld': 'v2', 'pilotAcceptsSourceCandidate': True,
            'courseNamePatterns': [{'source': 'peek', 'flags': 'i'}],
            'packages': {'oldhash': {'packageBytesSha256': 'old', 'livePilot': True}},
        }}}
        new_doc, is_new = ship_publish.merge_approval(approvals, 'peek-n-peak-upper', 'newhash', 'newbytes')
        self.assertFalse(is_new)
        layout = new_doc['layouts']['peek-n-peak-upper']
        self.assertEqual(layout['geometryFeatureFlag'], 'peek_n_peak_one_tap_v1')
        self.assertEqual(layout['courseNamePatterns'], [{'source': 'peek', 'flags': 'i'}])
        self.assertEqual(layout['packages']['oldhash'], {'packageBytesSha256': 'old', 'livePilot': True})
        self.assertEqual(layout['packages']['newhash'], {'packageBytesSha256': 'newbytes'})
        # the caller's dict is never mutated
        self.assertNotIn('newhash', approvals['layouts']['peek-n-peak-upper']['packages'])

    def test_live_pilot_flag_is_only_set_when_requested(self):
        approvals = {'layouts': {}}
        new_doc, _ = ship_publish.merge_approval(approvals, 'x', 'h' * 8, 'bytes', live_pilot=True)
        self.assertTrue(new_doc['layouts']['x']['packages']['h' * 8]['livePilot'])
        new_doc2, _ = ship_publish.merge_approval(approvals, 'x', 'h' * 8, 'bytes', live_pilot=False)
        self.assertNotIn('livePilot', new_doc2['layouts']['x']['packages']['h' * 8])

    def test_new_layout_gets_shared_d3_defaults(self):
        new_doc, is_new = ship_publish.merge_approval({'layouts': {}}, 'starmount-forest', 'h' * 8, 'bytes')
        self.assertTrue(is_new)
        layout = new_doc['layouts']['starmount-forest']
        self.assertEqual(layout['geometryFeatureFlag'], ship_publish.DEFAULT_GEOMETRY_FLAG)
        self.assertEqual(layout['syncFeatureFlag'], ship_publish.DEFAULT_SYNC_FLAG)
        self.assertEqual(layout['courseNamePatterns'], [])


class StorageTests(unittest.TestCase):
    def test_missing_env_never_echoes_partial_values(self):
        with self.assertRaises(ship_publish.StorageEnvMissing) as ctx:
            ship_publish.storage_env({'NEXT_PUBLIC_SUPABASE_URL': '', 'SUPABASE_SERVICE_ROLE_KEY': 'super-secret-value'})
        self.assertNotIn('super-secret-value', str(ctx.exception))

    def test_process_env_wins_over_env_local(self):
        url, key, source = ship_publish.storage_env({'NEXT_PUBLIC_SUPABASE_URL': 'https://proc.example.co', 'SUPABASE_SERVICE_ROLE_KEY': 'proc-key'})
        self.assertEqual((url, key, source), ('https://proc.example.co', 'proc-key', 'process environment'))

    def test_falls_back_to_env_local_with_export_and_quotes(self):
        import tempfile
        import os as _os
        with tempfile.TemporaryDirectory() as tmp:
            with open(_os.path.join(tmp, '.env.local'), 'w') as f:
                f.write('# comment\nexport NEXT_PUBLIC_SUPABASE_URL="https://file.example.co/"\nSUPABASE_SERVICE_ROLE_KEY=\'file-key\'\n')
            url, key, source = ship_publish.storage_env({}, repo_root=tmp)
        self.assertEqual((url, key, source), ('https://file.example.co', 'file-key', '.env.local'))

    def test_strips_a_literal_trailing_backslash_n_artifact(self):
        # A real .env.local in this repo has exactly this artifact: a quoted
        # value ending in a literal two-character `\n`, not an actual
        # newline -- it silently broke DNS resolution before this was added.
        import tempfile
        import os as _os
        with tempfile.TemporaryDirectory() as tmp:
            with open(_os.path.join(tmp, '.env.local'), 'w') as f:
                f.write('NEXT_PUBLIC_SUPABASE_URL="https://proj.supabase.co\\n"\nSUPABASE_SERVICE_ROLE_KEY="file-key\\n"\n')
            url, key, source = ship_publish.storage_env({}, repo_root=tmp)
        self.assertEqual(url, 'https://proj.supabase.co')
        self.assertEqual(key, 'file-key')

    def test_error_message_never_contains_a_key_from_env_local(self):
        import tempfile
        import os as _os
        with tempfile.TemporaryDirectory() as tmp:
            with open(_os.path.join(tmp, '.env.local'), 'w') as f:
                f.write('NEXT_PUBLIC_SUPABASE_URL=https://file.example.co\n')  # key missing on purpose
            with self.assertRaises(ship_publish.StorageEnvMissing) as ctx:
                ship_publish.storage_env({}, repo_root=tmp)
        self.assertIn('.env.local', str(ctx.exception))

    def test_missing_bucket_is_a_clear_named_error(self):
        def fake_opener(_req, timeout=30):
            raise urllib.error.HTTPError('url', 404, 'Not Found', {}, io.BytesIO(b''))
        with self.assertRaises(ship_publish.StorageBucketMissing) as ctx:
            ship_publish.check_bucket('https://example.supabase.co', 'service-key-xyz', opener=fake_opener)
        self.assertNotIn('service-key-xyz', str(ctx.exception))
        self.assertIn('course-geometry', str(ctx.exception))

    def test_bucket_present_does_not_raise(self):
        def fake_opener(_req, timeout=30):
            return io.BytesIO(b'{}')
        ship_publish.check_bucket('https://example.supabase.co', 'service-key-xyz', opener=fake_opener)

    def test_upload_file_never_leaks_the_key_on_error(self):
        def fake_opener(_req, timeout=30):
            raise urllib.error.HTTPError('url', 500, 'Server Error', {}, io.BytesIO(b''))
        with self.assertRaises(ship_publish.StorageUploadError) as ctx:
            ship_publish.upload_file('https://example.supabase.co', 'service-key-xyz', 'peek/manifest.json', b'{}', 'application/json', 'public, max-age=60', True, opener=fake_opener)
        self.assertNotIn('service-key-xyz', str(ctx.exception))

    def test_upload_staged_uses_upsert_only_for_manifest(self):
        calls = []

        def fake_opener(req, timeout=30):
            calls.append({'url': req.full_url, 'headers': dict(req.header_items()), 'method': req.get_method()})
            return io.BytesIO(b'{}')
        import tempfile
        import os as _os
        with tempfile.TemporaryDirectory() as tmp:
            layout_dir = _os.path.join(tmp, 'peek-n-peak-upper')
            _os.makedirs(layout_dir)
            with open(_os.path.join(layout_dir, 'manifest.json'), 'w') as f:
                f.write('{}')
            with open(_os.path.join(layout_dir, 'package-abc.json'), 'w') as f:
                f.write('{}')
            uploaded = ship_publish.upload_staged('https://example.supabase.co', 'service-key-xyz', layout_dir, opener=fake_opener)
        self.assertEqual(len(uploaded), 2)
        by_path = {c['url'].rsplit('/', 1)[-1]: c for c in calls if c['method'] == 'POST'}
        self.assertEqual(by_path['manifest.json']['headers'].get('X-upsert'), 'true')
        self.assertEqual(by_path['package-abc.json']['headers'].get('X-upsert'), 'false')

class CanopyCorridorTests(unittest.TestCase):
    ORIGIN = [-80.0, 36.0]

    @staticmethod
    def square(lon, lat, half_deg):
        return {'type': 'Polygon', 'coordinates': [[[lon - half_deg, lat - half_deg], [lon + half_deg, lat - half_deg],
                                                    [lon + half_deg, lat + half_deg], [lon - half_deg, lat + half_deg], [lon - half_deg, lat - half_deg]]]}

    def package(self, woods):
        route = {'id': 'r1', 'kind': 'route', 'geometryWgs84': {'type': 'LineString', 'coordinates': [[-80.0, 36.0], [-80.0, 36.003]]}}
        return {'originWgs84': self.ORIGIN, 'holes': [{'key': 'h01', 'ordinal': 1, 'routeFeatureId': 'r1'}],
                'features': [route] + [{'id': f'w{i}', 'kind': 'woods', 'geometryWgs84': g} for i, g in enumerate(woods)]}

    def test_forest_over_the_route_blocks(self):
        shares = ship.canopy_corridor_shares(self.package([self.square(-80.0, 36.0015, 0.003)]))
        self.assertEqual(shares[0]['canopyShare'], 1.0)
        blockers = ship.gate_canopy_in_play(shares)
        self.assertEqual([b['code'] for b in blockers], ['CANOPY_IN_PLAY_CORRIDOR'])
        self.assertEqual(blockers[0]['holeKeys'], ['h01'])

    def test_woods_off_the_corridor_pass(self):
        shares = ship.canopy_corridor_shares(self.package([self.square(-79.995, 36.0015, 0.001)]))
        self.assertEqual(shares[0]['canopyShare'], 0.0)
        self.assertEqual(ship.gate_canopy_in_play(shares), [])

    def test_no_woods_is_zero_not_missing(self):
        self.assertEqual(ship.canopy_corridor_shares(self.package([]))[0]['canopyShare'], 0.0)


class RouteConfirmationItemTests(unittest.TestCase):
    """`ship.route_confirmation_item` -- Phase D1's REQUIRED (but non-
    DAG-blocking) owner sign-off item for an `auto-route-v1` layout. See
    `ship.py`'s own docstring: `ship --approve` (not this item, and not
    `layout.routes.resolve`) is what actually refuses without a matching
    confirmation."""
    ROUTES = {'source': 'auto-route-v1', 'sourceGeometryHash': 'hash-1'}
    PROPOSAL = {'producer': 'auto-route-v1', 'report': [
        {'ordinal': 1, 'holeKey': 'h01', 'decision': 'proposed', 'teeId': 't1', 'greenId': 'g1',
         'scorecardYards': 400.0, 'straightLineYards': 395.0, 'yardageDeltaYards': -5.0, 'confidence': 0.9},
        {'ordinal': 2, 'holeKey': 'h02', 'decision': 'unassigned'},
    ]}

    def test_none_when_the_route_source_is_not_auto_route_v1(self):
        self.assertIsNone(ship.route_confirmation_item('L', {'source': 'osm_ref_unique'}, None, None))
        self.assertIsNone(ship.route_confirmation_item('L', {'source': 'catalog'}, None, None))
        self.assertIsNone(ship.route_confirmation_item('L', None, None, None))

    def test_required_and_unconfirmed_with_no_confirmation_doc(self):
        item = ship.route_confirmation_item('layout-1', self.ROUTES, self.PROPOSAL, None)
        self.assertEqual(item['code'], 'HUMAN_ROUTE_CONFIRMATION')
        self.assertTrue(item['required'])
        self.assertFalse(item['confirmed'])
        self.assertEqual(item['proposalHash'], 'hash-1')
        self.assertIsNotNone(item['remediation'])
        # Only the proposed rows are reviewable holes; the unassigned slot
        # is not silently included as if it had a route.
        self.assertEqual(len(item['holes']), 1)
        self.assertEqual(item['holes'][0]['holeKey'], 'h01')
        self.assertEqual(item['holes'][0]['straightLineYards'], 395.0)

    def test_confirmed_when_the_recorded_hash_matches_the_current_proposal(self):
        confirmation = {'proposalHash': 'hash-1', 'confirmedAt': '2026-09-23T00:00:00Z', 'confirmedBy': 'owner@example.com'}
        item = ship.route_confirmation_item('layout-1', self.ROUTES, self.PROPOSAL, confirmation)
        self.assertTrue(item['confirmed'])
        self.assertEqual(item['confirmedBy'], 'owner@example.com')
        self.assertIsNone(item['remediation'])

    def test_a_new_proposal_hash_invalidates_an_old_confirmation(self):
        stale_confirmation = {'proposalHash': 'hash-0-stale', 'confirmedAt': '2026-09-01T00:00:00Z', 'confirmedBy': 'owner@example.com'}
        item = ship.route_confirmation_item('layout-1', self.ROUTES, self.PROPOSAL, stale_confirmation)
        self.assertFalse(item['confirmed'])
        self.assertIsNone(item['confirmedAt'])
        self.assertIsNone(item['confirmedBy'])


if __name__ == '__main__':
    unittest.main()

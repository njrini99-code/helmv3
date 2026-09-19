"""Fingerprint tests for the course factory (Factory v2 §9): per-hole
subhashes isolate a hole's geometry from its neighbours and from display-only
fields, and the terrain source identity ignores the served-package list."""
import copy
import json
import os
import unittest

from factory.fingerprints import (
    canonical_json,
    content_hash_matches,
    digest,
    fingerprint,
    hole_subhashes,
    package_subhashes,
    terrain_source_identity,
)
from factory_testkit import HERE, ORIGIN, World

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
CACAPON = os.path.join(REPO, 'src/test/fixtures/course-geometry/cacapon.json')
UPPER_SOURCE = os.path.join(REPO, 'src/test/fixtures/course-geometry/sources/peek-n-peak-upper-terrain/source-manifest.json')


def synthetic_package(world, layout_id='synthetic-a'):
    holes = [{'key': f'{layout_id}-{n:02}', 'ordinal': n, 'par': 4, 'scorecardYards': 400 + n, 'routeFeatureId': f'{layout_id}-route-{n}',
              'greenFeatureId': f'{layout_id}-green-{n}', 'completeness': 'partial'} for n in range(1, 19)]
    return {'schemaVersion': 1, 'originWgs84': ORIGIN, 'projection': 'EPSG:32617', 'holes': holes, 'features': world.features(layout_id, 0.0)}


class SubhashTests(unittest.TestCase):
    def test_bunker_edit_changes_only_that_holes_terrain_hashes(self):
        before = package_subhashes(synthetic_package(World()))
        world = World()
        world.bunker_shift[7] = 0.00002
        after = package_subhashes(synthetic_package(world))
        changed = sorted(k for k in before if before[k] != after[k])
        self.assertEqual(changed, ['synthetic-a-07'])
        b, a = before['synthetic-a-07'], after['synthetic-a-07']
        self.assertNotEqual(b['holeGolfGeometryHash'], a['holeGolfGeometryHash'])
        self.assertNotEqual(b['holeTerrainInputHash'], a['holeTerrainInputHash'])
        self.assertNotEqual(b['holeDisplayInputHash'], a['holeDisplayInputHash'])
        for key in ('holeCanopyHash', 'holeContextHash', 'holeReviewHash', 'holeSourceHash'):
            self.assertEqual(b[key], a[key], key)

    def test_yardage_and_par_live_only_in_the_display_hash(self):
        pkg = synthetic_package(World())
        before = hole_subhashes(pkg, pkg['holes'][6])
        edited = copy.deepcopy(pkg)
        edited['holes'][6]['scorecardYards'] = 455
        edited['holes'][6]['par'] = 5
        after = hole_subhashes(edited, edited['holes'][6])
        self.assertNotEqual(before['holeDisplayInputHash'], after['holeDisplayInputHash'])
        for key in ('holeGolfGeometryHash', 'holeCanopyHash', 'holeContextHash', 'holeTerrainInputHash', 'holeReviewHash', 'holeSourceHash'):
            self.assertEqual(before[key], after[key], key)

    def test_woods_change_canopy_hash_but_not_golf_geometry(self):
        pkg = synthetic_package(World())
        pkg['features'].append({'id': 'w1', 'kind': 'woods', 'holeKeys': ['synthetic-a-03'], 'sourceIds': ['naip'], 'reviewed': False, 'accuracyMeters': None,
                                'geometryWgs84': {'type': 'Polygon', 'coordinates': [[[0, 0], [0, 1], [1, 1], [0, 0]]]}})
        with_woods = hole_subhashes(pkg, pkg['holes'][2])
        pkg['features'][-1]['geometryWgs84']['coordinates'][0][1] = [0, 2]
        moved = hole_subhashes(pkg, pkg['holes'][2])
        self.assertNotEqual(with_woods['holeCanopyHash'], moved['holeCanopyHash'])
        self.assertEqual(with_woods['holeGolfGeometryHash'], moved['holeGolfGeometryHash'])
        self.assertNotEqual(with_woods['holeTerrainInputHash'], moved['holeTerrainInputHash'])
        untouched = hole_subhashes(pkg, pkg['holes'][3])
        self.assertEqual(untouched['holeCanopyHash'], digest([]))

    def test_context_zones_only_touch_the_holes_they_name(self):
        pkg = synthetic_package(World())
        context = {'zones': [{'id': 'z1', 'class': 'cart_path', 'holeKeys': ['synthetic-a-05'], 'geometryWgs84': {'type': 'LineString', 'coordinates': [[0, 0], [1, 1]]}, 'fidelity': 'osm'}]}
        plain = package_subhashes(pkg)
        with_context = package_subhashes(pkg, context)
        changed = sorted(k for k in plain if plain[k] != with_context[k])
        self.assertEqual(changed, ['synthetic-a-05'])
        self.assertEqual(plain['synthetic-a-05']['holeGolfGeometryHash'], with_context['synthetic-a-05']['holeGolfGeometryHash'])
        self.assertNotEqual(plain['synthetic-a-05']['holeContextHash'], with_context['synthetic-a-05']['holeContextHash'])

    def test_review_overlay_decisions_enter_the_review_hash_only(self):
        pkg = synthetic_package(World())
        overlay = {'decisions': [{'featureId': 'synthetic-a-bunker-2', 'action': 'accept'}]}
        plain = package_subhashes(pkg)
        reviewed = package_subhashes(pkg, None, overlay)
        changed = sorted(k for k in plain if plain[k] != reviewed[k])
        self.assertEqual(changed, ['synthetic-a-02'])
        self.assertEqual(plain['synthetic-a-02']['holeTerrainInputHash'], reviewed['synthetic-a-02']['holeTerrainInputHash'])
        self.assertNotEqual(plain['synthetic-a-02']['holeReviewHash'], reviewed['synthetic-a-02']['holeReviewHash'])

    def test_checked_in_cacapon_package_hashes_are_stable_per_hole(self):
        with open(CACAPON, encoding='utf-8') as f:
            pkg = json.load(f)
        self.assertTrue(content_hash_matches(pkg))
        subhashes = package_subhashes(pkg)
        self.assertEqual(len(subhashes), 18)
        self.assertEqual(subhashes, package_subhashes(json.loads(json.dumps(pkg))))
        self.assertEqual(len({v['holeGolfGeometryHash'] for v in subhashes.values()}), 18)


class IdentityTests(unittest.TestCase):
    def test_canonical_json_and_digest_are_order_independent(self):
        self.assertEqual(canonical_json({'b': 1, 'a': [1, 2]}), canonical_json({'a': [1, 2], 'b': 1}))
        self.assertEqual(digest({'b': 1, 'a': 2}), digest({'a': 2, 'b': 1}))
        self.assertNotEqual(digest([1, 2]), digest([2, 1]))

    def test_fingerprint_changes_with_every_component(self):
        base = fingerprint('t', '1', 'impl', {}, {'x': 'a'})
        self.assertNotEqual(base, fingerprint('t', '2', 'impl', {}, {'x': 'a'}))
        self.assertNotEqual(base, fingerprint('t', '1', 'impl2', {}, {'x': 'a'}))
        self.assertNotEqual(base, fingerprint('t', '1', 'impl', {'s': 1}, {'x': 'a'}))
        self.assertNotEqual(base, fingerprint('t', '1', 'impl', {}, {'x': 'b'}))
        self.assertEqual(base, fingerprint('t', '1', 'impl', {}, {'x': 'a'}))

    def test_content_hash_matches_rejects_tampering(self):
        doc = {'a': 1}
        doc['contentHash'] = digest(doc)
        self.assertTrue(content_hash_matches(doc))
        doc['a'] = 2
        self.assertFalse(content_hash_matches(doc))
        self.assertFalse(content_hash_matches({'a': 1}))

    def test_terrain_source_identity_ignores_served_packages(self):
        with open(UPPER_SOURCE, encoding='utf-8') as f:
            manifest = json.load(f)
        identity = terrain_source_identity(manifest)
        served = copy.deepcopy(manifest)
        served['packageHash'] = 'f' * 64
        served['previousPackageHashes'] = served.get('previousPackageHashes', []) + [manifest['packageHash']]
        self.assertEqual(terrain_source_identity(served), identity)
        self.assertNotEqual(digest(served), digest(manifest))
        moved = copy.deepcopy(manifest)
        moved['requestedLocalBoundsM'] = [b + 32 for b in manifest['requestedLocalBoundsM']]
        self.assertNotEqual(terrain_source_identity(moved), identity)
        self.assertIsNone(terrain_source_identity(None))

    def test_compiler_and_factory_agree_on_the_source_identity(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location('golfhelm_compiler_for_test', os.path.join(HERE, 'compile-course-terrain.py'))
        compiler = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(compiler)
        with open(UPPER_SOURCE, encoding='utf-8') as f:
            manifest = json.load(f)
        self.assertEqual(compiler.source_identity(manifest), terrain_source_identity(manifest))


if __name__ == '__main__':
    unittest.main()

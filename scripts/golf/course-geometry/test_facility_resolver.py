"""Automatic facility resolver (W4): grouping, feature-floor scoring instead
of the audit's strict symmetric name match, and the anchor fallback -- all
against fake `_alc` (`audit-library-coverage.py`) helpers. No network call is
ever made by this suite: every `_alc` function the resolver calls is
monkeypatched before use and restored in `tearDown`.
"""
import unittest

from factory import facility_resolver as fr
from factory.facility_resolver import _alc


class FakeCourse(dict):
    """A minimal Overpass-shaped element: {type, id, tags, center}."""


class ResolveFacilityTests(unittest.TestCase):
    def setUp(self):
        self._originals = {name: getattr(_alc, name) for name in
                            ('geocode_city', 'overpass_courses', 'overpass_features', 'dem_1m_tiles', 'anchor_by_name',
                             'get', 'overpass')}
        # A winning candidate (polygon or anchor) now costs one extra real-tag
        # fetch through `_alc.overpass` before it is trusted -- default it to
        # "no elements" (untagged) so a test that doesn't care about this
        # verification step still resolves deterministically and never
        # touches the network; a test that DOES care overrides it.
        _alc.overpass = lambda body: {'elements': []}

    def tearDown(self):
        for name, value in self._originals.items():
            setattr(_alc, name, value)

    def test_prefers_feature_count_over_a_weak_name_match(self):
        # A real course polygon with no useful name tag (so a strict
        # symmetric name-overlap gate would drop it) but 18 holes/greens
        # must still win over a well-named neighbour with almost no
        # features -- the audit's own bug this module exists to fix.
        _alc.get = lambda *a, **k: []  # the direct Nominatim name search: nothing
        _alc.geocode_city = lambda city, state, country: (35.0, -79.0)
        real_course = FakeCourse(type='way', id=1, tags={}, center={'lat': 35.001, 'lon': -79.001})
        named_but_sparse = FakeCourse(type='way', id=2, tags={'name': 'Pine Lakes'}, center={'lat': 35.002, 'lon': -79.002})
        _alc.overpass_courses = lambda lat, lon, radius: [real_course, named_but_sparse]

        def fake_features(element, lat, lon, radius):
            if element is real_course:
                return {'hole': 18, 'green': 18, 'fairway': 14, 'bunker': 40, 'tee': 18}, 'course_area'
            return {'hole': 1, 'green': 0}, 'course_area'
        _alc.overpass_features = fake_features
        _alc.dem_1m_tiles = lambda lat, lon: []

        record = fr.resolve_facility('Pine Lakes Golf Club', 'Some City', 'NC', sleep=0)

        self.assertEqual(record['osmCourse']['siteId'], 'osm-way-1')
        self.assertEqual(record['verdict'], 'no-dem')  # mapped, but this test names no DEM tile
        chosen = [c for c in record['candidates'] if c.get('chosen')]
        self.assertEqual(len(chosen), 1)
        self.assertEqual(chosen[0]['id'], 1)
        rejected = [c for c in record['candidates'] if c.get('id') == 2]
        self.assertEqual(len(rejected), 1)
        self.assertIn('rejected', rejected[0])

    def test_falls_back_to_a_named_anchor_when_no_polygon_qualifies(self):
        _alc.get = lambda *a, **k: []
        _alc.geocode_city = lambda city, state, country: (34.2, -78.0)
        _alc.overpass_courses = lambda lat, lon, radius: []

        def fake_features(element, lat, lon, radius):
            return {'hole': 18, 'green': 19, 'tee': 9, 'bunker': 8}, 'around_2500m'
        _alc.overpass_features = fake_features

        def fake_anchor_by_name(name, city, state, country, lat, lon, radius):
            return [FakeCourse(type='node', id=99, tags={'name': 'Comfort Suites at Magnolia Greens'}, center={'lat': 34.21, 'lon': -78.03})]
        _alc.anchor_by_name = fake_anchor_by_name
        _alc.dem_1m_tiles = lambda lat, lon: []

        record = fr.resolve_facility('Magnolia Greens (Cam 9)', 'Leland', 'NC', sleep=0)

        self.assertIsNone(record['osmCourse'])
        self.assertEqual(record['anchor']['id'], 99)
        self.assertEqual(record['holes'], 18)
        self.assertTrue(any('no course polygon' in note for note in record['notes']))

    def test_no_candidate_anywhere_is_not_found_not_a_crash(self):
        _alc.get = lambda *a, **k: []
        _alc.geocode_city = lambda city, state, country: (34.2, -78.0)
        _alc.overpass_courses = lambda lat, lon, radius: []
        _alc.overpass_features = lambda element, lat, lon, radius: ({}, 'around_2500m')
        _alc.anchor_by_name = lambda *a, **k: []

        record = fr.resolve_facility('Nowhere Golf Club', 'Nowhere', 'NC', sleep=0)

        self.assertIsNone(record['osmCourse'])
        self.assertIsNone(record['anchor'])
        self.assertEqual(record['verdict'], 'not-found')

    def test_city_geocode_failure_is_retained_as_evidence(self):
        def boom(city, state, country):
            raise RuntimeError('nominatim unavailable')
        _alc.get = lambda *a, **k: []
        _alc.geocode_city = boom

        record = fr.resolve_facility('Whatever GC', 'Nowhere', 'NC', sleep=0)

        self.assertEqual(record['verdict'], 'not-found')
        self.assertTrue(any('geocode failed' in note for note in record['notes']))

    def test_a_named_but_wrong_course_never_wins_on_feature_count_alone(self):
        # Longleaf Family Golf Club, Pinehurst: a nearby "Pinehurst No. 2"
        # polygon has 18 greens but shares not one token with the wanted
        # name. Feature count must never override a real name mismatch --
        # that is a different, real bug from the "no name at all" case
        # `test_prefers_feature_count_over_a_weak_name_match` covers.
        _alc.get = lambda *a, **k: []
        _alc.geocode_city = lambda city, state, country: (35.2, -79.4)
        wrong_course = FakeCourse(type='way', id=7, tags={'name': 'Pinehurst No. 2'}, center={'lat': 35.201, 'lon': -79.401})
        _alc.overpass_courses = lambda lat, lon, radius: [wrong_course]

        def fake_features(element, lat, lon, radius):
            self.fail('overpass_features must not be called for a candidate already rejected on name')
        _alc.overpass_features = fake_features

        def fake_anchor_by_name(name, city, state, country, lat, lon, radius):
            return []
        _alc.anchor_by_name = fake_anchor_by_name
        _alc.dem_1m_tiles = lambda lat, lon: []

        record = fr.resolve_facility('Longleaf Family Golf Club', 'Pinehurst', 'NC', sleep=0)

        self.assertIsNone(record['osmCourse'])
        self.assertEqual(record['verdict'], 'not-found')
        rejected = [c for c in record['candidates'] if c.get('id') == 7]
        self.assertEqual(len(rejected), 1)
        self.assertIn('names a different course', rejected[0]['rejected'])

    def test_only_the_top_four_candidates_ever_reach_a_feature_fetch(self):
        _alc.get = lambda *a, **k: []
        _alc.geocode_city = lambda city, state, country: (35.0, -79.0)
        # 6 identically-named candidates: only the 4 nearest may be scored
        # for features; the rest are rejected up front, unfetched.
        candidates = [FakeCourse(type='way', id=i, tags={'name': 'Sandhills Golf Club'},
                                  center={'lat': 35.0 + i * 0.001, 'lon': -79.0}) for i in range(6)]
        _alc.overpass_courses = lambda lat, lon, radius: candidates
        fetched = []

        def fake_features(element, lat, lon, radius):
            fetched.append(element['id'])
            return {'hole': 0, 'green': 0}, 'course_area'
        _alc.overpass_features = fake_features
        _alc.anchor_by_name = lambda *a, **k: []
        _alc.dem_1m_tiles = lambda lat, lon: []

        fr.resolve_facility('Sandhills Golf Club', 'Pinehurst', 'NC', sleep=0)

        self.assertEqual(len(fetched), 4)
        self.assertEqual(fetched, [0, 1, 2, 3])  # the 4 nearest by construction, not merely "some 4"

    def test_anchor_rejects_an_administrative_boundary(self):
        # Forest Oaks, Greensboro: relation/180400 is the census-designated
        # place, not the golf facility. An anchor from `anchor_by_name` only
        # ever carries the name Nominatim/the audit gave it -- exactly like
        # the real failure, the boundary tag is invisible until the real,
        # separately-fetched tags are checked. It must never become the
        # facility AOI even though it is a `relation` and carries the right
        # name.
        _alc.get = lambda *a, **k: []
        _alc.geocode_city = lambda city, state, country: (36.0, -79.7)
        _alc.overpass_courses = lambda lat, lon, radius: []
        _alc.overpass_features = lambda element, lat, lon, radius: ({'hole': 18, 'green': 19}, 'around_2500m')

        def fake_anchor_by_name(name, city, state, country, lat, lon, radius):
            return [FakeCourse(type='relation', id=180400, tags={'name': 'Forest Oaks'},
                                center={'lat': 35.99, 'lon': -79.71})]
        _alc.anchor_by_name = fake_anchor_by_name
        _alc.dem_1m_tiles = lambda lat, lon: []
        _alc.overpass = lambda body: {'elements': [{'tags': {'boundary': 'statistical',
                                                              'border_type': 'census_designated_place', 'name': 'Forest Oaks'}}]}

        record = fr.resolve_facility('Forest Oaks', 'Greensboro', 'NC', sleep=0)

        self.assertIsNone(record['anchor'])
        self.assertEqual(record['verdict'], 'not-found')
        rejected = [c for c in record['candidates'] if c.get('id') == 180400]
        self.assertEqual(len(rejected), 1)
        self.assertIn('administrative', rejected[0]['rejected'])

    def test_a_named_cdp_polygon_that_qualifies_on_features_is_still_rejected(self):
        # The real Forest Oaks failure: a name search for "Forest Oaks,
        # Greensboro" turns up relation/180400 as a *named*, untagged-at-
        # synthesis candidate (overlap 1.0), and the real golf holes
        # geometrically sit inside that census-designated-place polygon, so
        # a naive feature-count check "qualifies" it. Only the real,
        # separately-fetched tags -- `boundary=statistical` -- catch this,
        # and they must reject it from `osmCourse` even though it otherwise
        # wins outright on name and feature count.
        _alc.get = lambda *a, **k: []
        _alc.geocode_city = lambda city, state, country: (36.0, -79.7)
        cdp = FakeCourse(type='relation', id=180400, tags={'name': 'Forest Oaks'}, center={'lat': 35.99, 'lon': -79.71})
        _alc.overpass_courses = lambda lat, lon, radius: [cdp]
        _alc.overpass_features = lambda element, lat, lon, radius: ({'hole': 18, 'green': 19}, 'around_2500m')
        _alc.anchor_by_name = lambda *a, **k: []  # no facility anchor either: a genuinely unresolved case
        _alc.dem_1m_tiles = lambda lat, lon: []
        _alc.overpass = lambda body: {'elements': [{'tags': {'boundary': 'statistical',
                                                              'border_type': 'census_designated_place', 'name': 'Forest Oaks'}}]}

        record = fr.resolve_facility('Forest Oaks', 'Greensboro', 'NC', sleep=0)

        self.assertIsNone(record['osmCourse'])
        self.assertIsNone(record['anchor'])
        self.assertEqual(record['verdict'], 'not-found')
        rejected = [c for c in record['candidates'] if c.get('id') == 180400]
        self.assertEqual(len(rejected), 1)
        self.assertIn('administrative', rejected[0]['rejected'])

    def test_a_real_park_tag_may_become_an_anchor_but_never_the_course_polygon(self):
        # Bryan Park's own shape: a polygon that passes the feature floor
        # but whose real tags are `leisure=park`, not `leisure=golf_course`,
        # must never become `osmCourse` -- it is a facility (unlike a
        # boundary), so it is still allowed to become the *anchor* fallback.
        _alc.get = lambda *a, **k: []
        _alc.geocode_city = lambda city, state, country: (36.1, -79.8)
        park = FakeCourse(type='way', id=42, tags={'name': 'Bryan Park'}, center={'lat': 36.101, 'lon': -79.801})
        _alc.overpass_courses = lambda lat, lon, radius: [park]
        _alc.overpass_features = lambda element, lat, lon, radius: ({'hole': 18, 'green': 18}, 'around_2500m')
        _alc.anchor_by_name = lambda *a, **k: []
        _alc.dem_1m_tiles = lambda lat, lon: []
        _alc.overpass = lambda body: {'elements': [{'tags': {'leisure': 'park', 'name': 'Bryan Park'}}]}

        record = fr.resolve_facility('Bryan Park', 'Greensboro', 'NC', sleep=0)

        self.assertIsNone(record['osmCourse'])
        rejected = [c for c in record['candidates'] if c.get('id') == 42]
        self.assertEqual(len(rejected), 1)
        self.assertIn('leisure', rejected[0]['rejected'])


class MergePlayedCoursesTests(unittest.TestCase):
    def test_groups_sub_courses_of_one_facility_and_resolves_once(self):
        # "River Landing (River)" and "(Landing)" both normalize to "river
        # landing" (facility_key strips the parenthetical before taking the
        # first two words), so one resolution covers both library rows. Two
        # sub-courses that keep their distinguishing word *outside* parens
        # ("Bryan Park Champs"/"Players") do NOT collapse this way -- that
        # case is handled downstream, by intake.py sharing one facility_id
        # once both rows resolve to the same named anchor.
        rows = [
            {'id': 'a', 'name': 'River Landing (River)', 'city': 'Wallace', 'state': 'NC'},
            {'id': 'b', 'name': 'River Landing (Landing)', 'city': 'Wallace', 'state': 'NC'},
        ]
        calls = []

        def fake_resolve(name, city, state, country, **kwargs):
            calls.append(name)
            return {'name': name, 'city': city, 'state': state, 'country': country, 'osmPin': None,
                    'libraryIds': [], 'libraryNames': [], 'cityPoint': None, 'osmCourse': None, 'anchor': None,
                    'golfFeatures': {}, 'featureBasis': None, 'holes': 0, 'greens': 0, 'fairways': 0, 'bunkers': 0,
                    'tees': 0, 'dem1mTiles': [], 'verdict': 'not-found', 'notes': [], 'candidates': []}

        original = fr.resolve_facility
        fr.resolve_facility = fake_resolve
        try:
            merged = fr.merge_played_courses(rows, {'facilities': []}, sleep=0)
        finally:
            fr.resolve_facility = original

        self.assertEqual(len(calls), 1, 'both sub-courses must resolve as a single facility group')
        self.assertEqual(len(merged['facilities']), 1)
        self.assertEqual(sorted(merged['facilities'][0]['libraryIds']), ['a', 'b'])

    def test_never_re_resolves_a_facility_already_resolved_by_library_id(self):
        rows = [{'id': 'x', 'name': 'Forsyth Country Club', 'city': 'Winston-Salem', 'state': 'NC'}]
        existing = {'facilities': [{'name': 'Forsyth Country Club', 'libraryIds': ['x'], 'libraryNames': ['Forsyth Country Club'],
                                     'osmCourse': {'type': 'way', 'id': 1, 'siteId': 'osm-way-1'}, 'anchor': None}]}

        def must_not_be_called(*a, **k):
            raise AssertionError('resolve_facility must not run for an already-resolved library id')
        original = fr.resolve_facility
        fr.resolve_facility = must_not_be_called
        try:
            merged = fr.merge_played_courses(rows, existing, sleep=0)
        finally:
            fr.resolve_facility = original

        self.assertEqual(merged['facilities'], existing['facilities'])

    def test_a_row_present_by_name_but_unresolved_is_not_skipped(self):
        # This is the bug the library-id keying fixes: Magnolia Greens is
        # already a named row in coverage.json, but its only anchor is a
        # `node` (a hotel) -- not a usable facility AOI -- so it must still
        # be re-resolved, not skipped because a same-named row exists.
        rows = [{'id': 'm', 'name': 'Magnolia Greens (Cam 9)', 'city': 'Leland', 'state': 'NC'}]
        existing = {'facilities': [{'name': 'Magnolia Greens (Cam 9)', 'libraryIds': ['m'], 'libraryNames': ['Magnolia Greens (Cam 9)'],
                                     'osmCourse': None, 'anchor': {'type': 'node', 'id': 99, 'name': 'Comfort Suites'}}]}
        calls = []

        def fake_resolve(name, city, state, country, **kwargs):
            calls.append(name)
            return {'name': name, 'city': city, 'state': state, 'country': country, 'osmPin': None,
                    'libraryIds': [], 'libraryNames': [], 'cityPoint': None, 'osmCourse': None, 'anchor': None,
                    'golfFeatures': {}, 'featureBasis': None, 'holes': 0, 'greens': 0, 'fairways': 0, 'bunkers': 0,
                    'tees': 0, 'dem1mTiles': [], 'verdict': 'not-found', 'notes': [], 'candidates': []}
        original = fr.resolve_facility
        fr.resolve_facility = fake_resolve
        try:
            merged = fr.merge_played_courses(rows, existing, sleep=0)
        finally:
            fr.resolve_facility = original

        self.assertEqual(calls, ['Magnolia Greens (Cam 9)'])
        self.assertEqual(len(merged['facilities']), 1)  # the stale node-anchor row is replaced, not duplicated

    def test_reresolve_library_ids_forces_a_re_resolution(self):
        # Forest Oaks: its existing anchor (relation/180400) looked resolved
        # by type alone, but turned out to be a census-place boundary once
        # the anchor tag check existed. The caller must be able to force a
        # re-resolution for a specific library id despite `_already_resolved`
        # saying yes.
        rows = [{'id': 'f', 'name': 'Forest Oaks', 'city': 'Greensboro', 'state': 'NC'}]
        existing = {'facilities': [{'name': 'Forest Oaks', 'libraryIds': ['f'], 'libraryNames': ['Forest Oaks'],
                                     'osmCourse': None, 'anchor': {'type': 'relation', 'id': 180400, 'name': 'Forest Oaks'}}]}
        calls = []

        def fake_resolve(name, city, state, country, **kwargs):
            calls.append(name)
            return {'name': name, 'city': city, 'state': state, 'country': country, 'osmPin': None,
                    'libraryIds': [], 'libraryNames': [], 'cityPoint': None, 'osmCourse': None, 'anchor': None,
                    'golfFeatures': {}, 'featureBasis': None, 'holes': 0, 'greens': 0, 'fairways': 0, 'bunkers': 0,
                    'tees': 0, 'dem1mTiles': [], 'verdict': 'not-found', 'notes': [], 'candidates': []}
        original = fr.resolve_facility
        fr.resolve_facility = fake_resolve
        try:
            merged = fr.merge_played_courses(rows, existing, sleep=0, reresolve_library_ids={'f'})
        finally:
            fr.resolve_facility = original

        self.assertEqual(calls, ['Forest Oaks'])
        self.assertEqual(len(merged['facilities']), 1)

    def test_reresolve_carries_over_a_duplicate_library_id_not_in_the_input_rows(self):
        # Forest Oaks CC's duplicate DB row (`a2669ed5-...`) shares the same
        # coverage facility as the library id being force-re-resolved, but
        # isn't itself one of the `rows` given to this call (only the
        # library-catalog id is re-resolved; the played-course duplicate is
        # attached separately, downstream, by intake.py). Replacing the
        # whole existing row must not silently drop that id -- it belongs on
        # the new, re-resolved row.
        rows = [{'id': 'f', 'name': 'Forest Oaks', 'city': 'Greensboro', 'state': 'NC'}]
        existing = {'facilities': [{'name': 'Forest Oaks', 'libraryIds': ['f', 'dup'],
                                     'libraryNames': ['Forest Oaks', 'Forest Oaks CC'],
                                     'osmCourse': None, 'anchor': {'type': 'relation', 'id': 180400, 'name': 'Forest Oaks'}}]}

        def fake_resolve(name, city, state, country, **kwargs):
            return {'name': name, 'city': city, 'state': state, 'country': country, 'osmPin': None,
                    'libraryIds': [], 'libraryNames': [], 'cityPoint': None, 'osmCourse': None, 'anchor': None,
                    'golfFeatures': {}, 'featureBasis': None, 'holes': 0, 'greens': 0, 'fairways': 0, 'bunkers': 0,
                    'tees': 0, 'dem1mTiles': [], 'verdict': 'not-found', 'notes': [], 'candidates': []}
        original = fr.resolve_facility
        fr.resolve_facility = fake_resolve
        try:
            merged = fr.merge_played_courses(rows, existing, sleep=0, reresolve_library_ids={'f'})
        finally:
            fr.resolve_facility = original

        self.assertEqual(len(merged['facilities']), 1)  # no leftover stale row; the id was carried, not orphaned
        self.assertEqual(sorted(merged['facilities'][0]['libraryIds']), ['dup', 'f'])
        self.assertIn('Forest Oaks CC', merged['facilities'][0]['libraryNames'])

    def test_only_names_bounds_which_groups_resolve(self):
        rows = [
            {'id': 'a', 'name': 'Longleaf Family Golf Club', 'city': 'Pinehurst', 'state': 'NC'},
            {'id': 'b', 'name': 'Some Other Course', 'city': 'Pinehurst', 'state': 'NC'},
        ]
        calls = []

        def fake_resolve(name, city, state, country, **kwargs):
            calls.append(name)
            return {'name': name, 'city': city, 'state': state, 'country': country, 'osmPin': None,
                    'libraryIds': [], 'libraryNames': [], 'cityPoint': None, 'osmCourse': None, 'anchor': None,
                    'golfFeatures': {}, 'featureBasis': None, 'holes': 0, 'greens': 0, 'fairways': 0, 'bunkers': 0,
                    'tees': 0, 'dem1mTiles': [], 'verdict': 'not-found', 'notes': [], 'candidates': []}

        original = fr.resolve_facility
        fr.resolve_facility = fake_resolve
        try:
            merged = fr.merge_played_courses(rows, {'facilities': []}, sleep=0, only_names={'longleaf'})
        finally:
            fr.resolve_facility = original

        self.assertEqual(calls, ['Longleaf Family Golf Club'])
        self.assertEqual(len(merged['facilities']), 1)


if __name__ == '__main__':
    unittest.main()

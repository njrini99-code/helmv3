"""Synthetic-data tests for `propose-routes.py`: the tee/green candidate
collector, tee-complex clustering, and the beam search that jointly selects
and orders tee/green pairs into an 18-hole (or N-hole) sequence."""
import importlib.util
import os
import unittest

from shapely.geometry import Point, box

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pr = load('propose_routes', 'propose-routes.py')
cr = load('course_raster', 'course_raster.py')

EPSG = 32617
ORIGIN = [-79.74, 42.055]


def utm_to_wgs84(x, y):
    return list(cr.epsg_to_wgs84(Point(x, y), EPSG).coords[0])


def make_candidate(ident, kind, center_xy, size=6.0):
    poly = box(center_xy[0] - size, center_xy[1] - size, center_xy[0] + size, center_xy[1] + size)
    ring = [utm_to_wgs84(x, y) for x, y in poly.exterior.coords]
    centroid = utm_to_wgs84(*center_xy)
    return {'id': ident, 'kind': kind, 'geometryWgs84': {'type': 'Polygon', 'coordinates': [ring]}, 'centroidWgs84': centroid}


class TeeComplexClusteringTests(unittest.TestCase):
    def test_nearby_tee_markers_share_a_complex_id_and_far_ones_do_not(self):
        member = make_candidate('tee-member', 'tee', (0.0, 0.0))
        forward = make_candidate('tee-forward', 'tee', (5.0, 3.0))   # within radius of member
        other_hole = make_candidate('tee-other', 'tee', (500.0, 0.0))  # far away: different hole
        tees = pr.cluster_tee_complexes([member, forward, other_hole], EPSG, radius_m=25.0)
        by_id = {t['id']: t['complexId'] for t in tees}
        self.assertEqual(by_id['tee-member'], by_id['tee-forward'])
        self.assertNotEqual(by_id['tee-member'], by_id['tee-other'])


class BeamSearchTests(unittest.TestCase):
    def test_the_beam_finds_the_true_pairs_for_two_well_separated_holes(self):
        # Two true holes: ~150m (par 3 -> ~164 yards) and ~400m (par 4 -> ~437 yards).
        tee1 = make_candidate('tee-1', 'tee', (0.0, 0.0))
        green1 = make_candidate('green-1', 'green', (0.0, 150.0))
        tee2 = make_candidate('tee-2', 'tee', (1000.0, 0.0))
        green2 = make_candidate('green-2', 'green', (1000.0, 400.0))
        tees = pr.cluster_tee_complexes([tee1, tee2], EPSG)
        pairs = pr.build_pairs(tees, [green1, green2], EPSG)
        yards_m = [164 * pr.YARD_TO_M, 437 * pr.YARD_TO_M]
        assignment = pr.beam_search_assignment(pairs, yards_m)
        self.assertEqual(len(assignment), 2)
        self.assertEqual(pairs[assignment[0]]['tee']['id'], 'tee-1')
        self.assertEqual(pairs[assignment[0]]['green']['id'], 'green-1')
        self.assertEqual(pairs[assignment[1]]['tee']['id'], 'tee-2')
        self.assertEqual(pairs[assignment[1]]['green']['id'], 'green-2')

    def test_an_implausible_pair_is_never_assigned(self):
        tee = make_candidate('tee-1', 'tee', (0.0, 0.0))
        green = make_candidate('green-1', 'green', (0.0, 5000.0))  # absurd for any hole yardage below
        tees = pr.cluster_tee_complexes([tee], EPSG)
        pairs = pr.build_pairs(tees, [green], EPSG)
        yards_m = [400 * pr.YARD_TO_M]
        assignment = pr.beam_search_assignment(pairs, yards_m)
        self.assertEqual(assignment, {})

    def test_yardage_only_ties_two_holes_of_equal_target_yardage_but_the_beam_picks_the_truth(self):
        # This is the real Winchester CC failure mode in miniature: two holes
        # share (near enough) the same scorecard yardage (both slots target
        # 300m), so yardage-only assignment cost is a dead tie no matter which
        # physical hole (P or Q) goes in which slot -- |295-300| + |305-300|
        # == 10 either way. Only walking continuity tells P-then-Q (correct:
        # tee-q sits right next to green-p) from Q-then-P (green-q is ~600m
        # from tee-p, an impossible next tee walk).
        tee_p = make_candidate('tee-p', 'tee', (0.0, 0.0))
        green_p = make_candidate('green-p', 'green', (0.0, 295.0))   # true P distance: 295m
        tee_q = make_candidate('tee-q', 'tee', (3.0, 296.0))         # right next to green-p
        green_q = make_candidate('green-q', 'green', (3.0, 601.0))   # true Q distance: 305m

        tees = pr.cluster_tee_complexes([tee_p, tee_q], EPSG, radius_m=1.0)  # keep them separate complexes
        pairs = pr.build_pairs(tees, [green_p, green_q], EPSG)
        yards_m = [300.0, 300.0]  # both slots target the same yardage

        pair_p = next(p for p in pairs if p['tee']['id'] == 'tee-p' and p['green']['id'] == 'green-p')
        pair_q = next(p for p in pairs if p['tee']['id'] == 'tee-q' and p['green']['id'] == 'green-q')
        cost_p, cost_q = abs(pair_p['distanceM'] - 300.0), abs(pair_q['distanceM'] - 300.0)
        self.assertAlmostEqual(cost_p, cost_q, delta=0.5,
                                msg='the two physical holes must cost the same against either slot for this test to be meaningful')

        assignment = pr.beam_search_assignment(pairs, yards_m, continuity_weight=1.0)
        self.assertEqual(pairs[assignment[0]]['tee']['id'], 'tee-p')
        self.assertEqual(pairs[assignment[0]]['green']['id'], 'green-p')
        self.assertEqual(pairs[assignment[1]]['tee']['id'], 'tee-q')
        self.assertEqual(pairs[assignment[1]]['green']['id'], 'green-q')

    def test_reused_green_is_never_assigned_to_two_holes(self):
        # Hole A's true green is G1 at ~150m; hole B's true green is G2 at ~155m from tee B.
        # A decoy pair (teeB, G1) is almost as good a yardage match for hole B as (teeB, G2),
        # which would otherwise let the solver reuse G1 for both holes.
        tee_a = make_candidate('tee-a', 'tee', (0.0, 0.0))
        green_1 = make_candidate('green-1', 'green', (0.0, 150.0))
        tee_b = make_candidate('tee-b', 'tee', (500.0, 0.0))
        green_2 = make_candidate('green-2', 'green', (500.0, 155.0))
        tees = pr.cluster_tee_complexes([tee_a, tee_b], EPSG)
        pairs = pr.build_pairs(tees, [green_1, green_2], EPSG)
        yards_m = [164 * pr.YARD_TO_M, 169 * pr.YARD_TO_M]
        assignment = pr.beam_search_assignment(pairs, yards_m)
        used_greens = [pairs[p]['green']['id'] for p in assignment.values()]
        self.assertEqual(len(used_greens), len(set(used_greens)), 'no green should be assigned to two holes')

    def test_a_second_tee_marker_at_the_same_complex_cannot_be_reused_for_another_hole(self):
        # tee-1b sits right next to tee-1 (same physical tee complex, e.g. a
        # forward marker). Once tee-1 is used for hole 1, tee-1b must not be
        # usable for hole 2, even though its distance to green-2 is plausible.
        tee1 = make_candidate('tee-1', 'tee', (0.0, 0.0))
        tee1b = make_candidate('tee-1b', 'tee', (3.0, 2.0))
        green1 = make_candidate('green-1', 'green', (0.0, 150.0))
        green2 = make_candidate('green-2', 'green', (3.0, 152.0))
        tees = pr.cluster_tee_complexes([tee1, tee1b], EPSG, radius_m=25.0)
        pairs = pr.build_pairs(tees, [green1, green2], EPSG)
        yards_m = [164 * pr.YARD_TO_M]  # only one hole slot: both greens are candidates for it
        assignment = pr.beam_search_assignment(pairs, yards_m)
        self.assertEqual(len(assignment), 1)
        # whichever pair is chosen, it must be internally consistent (one tee, one green)
        chosen = pairs[assignment[0]]
        self.assertIn(chosen['tee']['id'], ('tee-1', 'tee-1b'))


class YardageCostTests(unittest.TestCase):
    def test_yardage_cost_is_free_in_the_normal_range_gentle_below_and_steep_above(self):
        yards = 400.0
        self.assertEqual(pr.yardage_cost(380.0, yards), 0.0)   # ratio 0.95: inside the flat zone
        self.assertEqual(pr.yardage_cost(408.0, yards), 0.0)   # ratio 1.02: still inside
        short_cost = pr.yardage_cost(340.0, yards)             # ratio 0.85: a real dogleg, gentle slope
        long_cost = pr.yardage_cost(440.0, yards)              # ratio 1.10: implausible overshoot, steep slope
        self.assertGreater(short_cost, 0.0)
        self.assertGreater(long_cost, 0.0)
        self.assertGreater(long_cost, short_cost, 'overshoot must be penalized harder than an equal-ratio undershoot')


class ContinuityCostTests(unittest.TestCase):
    def test_short_and_typical_walks_are_free_but_an_implausibly_long_one_is_penalized(self):
        import math
        median_walk = math.exp(pr.CONTINUITY_LOGNORMAL_MU)
        self.assertEqual(pr.continuity_cost(median_walk), 0.0)
        self.assertEqual(pr.continuity_cost(3.0), 0.0,
                          'a green sitting right next to the next tee must never be penalized')
        long_walk_cost = pr.continuity_cost(600.0)  # far longer than any real calibration transition
        self.assertGreater(long_walk_cost, 5.0)


class CorridorEvidenceTests(unittest.TestCase):
    def test_a_line_on_the_fairway_is_covered_and_one_off_it_is_not(self):
        from shapely.geometry import box as _box
        fairway = _box(-2.0, -2.0, 2.0, 400.0)  # a straight fairway strip along x=0
        on_fairway = pr.corridor_coverage_fraction((0.0, 0.0), (0.0, 400.0), fairway)
        off_fairway = pr.corridor_coverage_fraction((60.0, 0.0), (60.0, 400.0), fairway)  # 60m away the whole way
        self.assertGreater(on_fairway, 0.95)
        self.assertEqual(off_fairway, 0.0)

    def test_no_fairway_data_gives_zero_coverage_not_a_penalty(self):
        # No fairway to check against: coverage is 0 (neutral), matching a hole with no mapped
        # fairway feature at all -- this must never look like an off-fairway line (also 0), because
        # the beam-search cost only ever subtracts a coverage bonus, so both cases score identically:
        # no bonus, not a penalty.
        self.assertEqual(pr.corridor_coverage_fraction((0.0, 0.0), (0.0, 400.0), None), 0.0)

    def test_beam_search_prefers_the_pair_whose_line_is_covered_by_fairway(self):
        # Two equally yardage-plausible pairs for one hole slot; only one runs along the mapped fairway.
        tee_good = make_candidate('tee-good', 'tee', (0.0, 0.0))
        green_good = make_candidate('green-good', 'green', (0.0, 300.0))
        tee_bad = make_candidate('tee-bad', 'tee', (100.0, 0.0))
        green_bad = make_candidate('green-bad', 'green', (100.0, 300.0))
        tees = pr.cluster_tee_complexes([tee_good, tee_bad], EPSG, radius_m=1.0)
        from shapely.geometry import box as _box
        fairway_utm = _box(-5.0, -5.0, 5.0, 305.0)
        fairway_wgs84 = cr.epsg_to_wgs84(fairway_utm, EPSG)
        pairs = pr.build_pairs(tees, [green_good, green_bad], EPSG, fairway_union_wgs84=fairway_wgs84)
        yards_m = [300.0]
        assignment = pr.beam_search_assignment(pairs, yards_m)
        self.assertEqual(pairs[assignment[0]]['tee']['id'], 'tee-good')


class RefHintTests(unittest.TestCase):
    def test_a_matching_ref_tag_is_preferred_for_that_hole_slot(self):
        # Two candidate greens, equally yardage-plausible for the single hole slot (both at 300m).
        # Only green-1 carries an OSM ref naming this as hole 1; it should win the slot.
        tee1 = make_candidate('tee-1', 'tee', (0.0, 0.0))
        green1 = make_candidate('green-1', 'green', (0.0, 300.0))
        green1['ref'] = 1
        tee2 = make_candidate('tee-2', 'tee', (1000.0, 0.0))
        green2 = make_candidate('green-2', 'green', (1000.0, 300.0))
        green2['ref'] = 2  # names a *different* hole: must not win slot 0 over the matching ref
        tees = pr.cluster_tee_complexes([tee1, tee2], EPSG)
        pairs = pr.build_pairs(tees, [green1, green2], EPSG)
        yards_m = [300.0]
        assignment = pr.beam_search_assignment(pairs, yards_m, use_ref_hints=True)
        self.assertEqual(pairs[assignment[0]]['green']['id'], 'green-1')


class CandidateCollectionTests(unittest.TestCase):
    def test_collect_osm_candidates_filters_by_kind_and_bbox(self):
        extract = {'elements': [
            {'type': 'way', 'id': 1, 'tags': {'golf': 'tee'},
             'geometry': [{'lon': -79.001, 'lat': 42.001}, {'lon': -79.0005, 'lat': 42.001},
                          {'lon': -79.0005, 'lat': 42.0015}, {'lon': -79.001, 'lat': 42.0015}, {'lon': -79.001, 'lat': 42.001}]},
            {'type': 'way', 'id': 2, 'tags': {'golf': 'green'},
             'geometry': [{'lon': -70.0, 'lat': 40.0}, {'lon': -69.999, 'lat': 40.0},
                          {'lon': -69.999, 'lat': 40.001}, {'lon': -70.0, 'lat': 40.001}, {'lon': -70.0, 'lat': 40.0}]},
            {'type': 'way', 'id': 3, 'tags': {'golf': 'bunker'},
             'geometry': [{'lon': -79.001, 'lat': 42.001}, {'lon': -79.0005, 'lat': 42.001},
                          {'lon': -79.0005, 'lat': 42.0015}, {'lon': -79.001, 'lat': 42.0015}, {'lon': -79.001, 'lat': 42.001}]},
        ]}
        tees, greens = pr.collect_osm_candidates(extract, bbox_wgs84=[-79.1, 41.9, -78.9, 42.1])
        self.assertEqual([t['id'] for t in tees], ['osm-way-1'])
        self.assertEqual(greens, [])  # the green is outside the bbox


class NumberedSeriesRefusalTests(unittest.TestCase):
    def test_propose_refuses_when_osm_already_has_a_clean_numbered_series(self):
        def hole_way(way_id, ref, tee_xy, green_xy):
            return {'type': 'way', 'id': way_id, 'tags': {'golf': 'hole', 'ref': str(ref)},
                    'geometry': [{'lon': p[0], 'lat': p[1]} for p in
                                 [tee_xy, green_xy, (green_xy[0] + 0.0001, green_xy[1]), tee_xy]]}

        elements = [hole_way(100 + i, i, (ORIGIN[0], ORIGIN[1] + i * 0.001), (ORIGIN[0], ORIGIN[1] + i * 0.001 + 0.0005))
                    for i in range(1, 3)]
        extract = {'elements': elements}
        scorecard = {'siteId': 'site-1', 'facilityId': 'facility-1', 'originWgs84': ORIGIN,
                     'scorecardYards': [150, 150], 'pars': [4, 4]}
        with self.assertRaises(pr.NumberedSeriesExistsError):
            pr.propose(scorecard, extract, None, 'facility-1', 'layout-1', 'unused-osm-path.json')


if __name__ == '__main__':
    unittest.main()

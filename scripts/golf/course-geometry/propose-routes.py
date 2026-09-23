#!/usr/bin/env python3
"""Propose an 18-hole route for a course whose retained OSM extract has no
usable numbered `golf=hole` route set (Phase 2 item 6, decision D1).

For every retained `golf=tee`/`golf=green` way inside the course's bounding
box (plus, optionally, tee/green candidates carried in a `--surfaces` traces
file from `derive-surface-traces.py`), it:

  1. clusters tees within `--tee-complex-radius-m` of each other into one
     "tee complex" (a hole's member/forward/back markers), so using one
     marker for a hole blocks every other marker at that same complex from
     being reused by a different hole;
  2. builds every plausible tee -> green pair, where "plausible" means the
     straight-line distance is within a dogleg-tolerant ratio of some hole's
     scorecard yardage;
  3. solves the hole-number sequence with a beam search over slots 1..N: at
     each slot it extends every surviving partial sequence with every
     feasible, not-yet-used pair, scoring
     `|distance - scorecard yards| + continuity_weight * dist(green_{h-1}, tee_h)`,
     and keeps the best `--beam-width` partial sequences. This jointly
     chooses *and* orders the pairs, which a Hungarian-assignment-then-swap
     pipeline cannot: yardage alone is a weak discriminator once several
     holes share a similar length, so selection has to lean on continuity
     from the start, not as a later polish.

An earlier Hungarian-plus-swap version of this tool measured 0/18 exact
hole-number matches on both Peek'n Peak and Winchester even though ~80% of
the physical greens it picked were correct (see the validation notes in this
docstring's companion report) — the wrong-but-plausible tee/green pairs it
could reach by swapping were never actually re-selected, only reordered.
The beam search fixes this by making continuity part of selection itself.

It writes a `golfhelm-source-geometry-v1` document (the schema
`factory/context.py`'s `route_resolution` already reads via a layout's
retained `sourceGeometry`), tagged `producer: "auto-route-v1"` and
`status: "proposed"` at the top level, with each hole's `identityReview`
left at `status: "candidate"` — never `confirmed` — since per-hole
`identityReview` is the only status field the source-geometry schema itself
tracks; the confirmed/owner_confirmed workflow support to be tracked at the
D1 route-approval layer, and `ship --approve` is not implemented here.

This never invents a route on a course whose OSM already has a resolvable
numbered `golf=hole` series; it is only for courses that lack one.
"""
from __future__ import annotations

import argparse
import copy
import datetime
import hashlib
import json
import sys
from pathlib import Path

from shapely.geometry import Polygon

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import course_raster as cr  # noqa: E402
from course_crs import utm_epsg  # noqa: E402
from factory import osm as osmlib  # noqa: E402

SCHEMA = 'golfhelm-source-geometry-v1'
PRODUCER = 'auto-route-v1'
STATUS = 'proposed'
YARD_TO_M = 0.9144
MIN_DOGLEG_RATIO = 0.45   # a sharp dogleg's straight tee-to-green line can be well under its played yardage
MAX_DOGLEG_RATIO = 1.05   # a little slack over 100% for GPS/measurement noise on a straight hole
DEFAULT_TEE_COMPLEX_RADIUS_M = 25.0
DEFAULT_BEAM_WIDTH = 1500
SKIP_PENALTY = 2000.0  # cost of leaving a hole unassigned rather than forcing a bad pair

# Walk continuity: round 1's hinge (`|walk| capped free below 150m, 1x/metre above`) was too weak a
# discriminator once several candidate greens were all yardage-plausible for the same hole -- any tee
# within 150m of the previous green was equally "free" regardless of how typical that walk actually is.
# This replaces it with an empirical model: green-to-next-tee walk distances are approximately log-normal
# (always positive, right-skewed -- most transitions are a short walk to an adjacent tee, a few are a long
# walk back toward the clubhouse). mu/sigma below are fit on ln(walk) for all 34 real green->next-tee
# transitions at Peek'n Peak Upper and Statesville CC (both full 18-hole numbered courses, and both
# outside this tool's held-out route-proposal eval set) -- median ~85m, range 40-230m. The cost is the
# squared log-distance from that fitted median (a per-transition "how surprising is this walk" score),
# scaled by DEFAULT_CONTINUITY_WEIGHT so it's comparable in magnitude to the yardage-cost term below.
CONTINUITY_LOGNORMAL_MU = 4.4377
CONTINUITY_LOGNORMAL_SIGMA = 0.3449
DEFAULT_CONTINUITY_WEIGHT = 20.0

# Yardage cost: round-1 scored every hole against `abs(distance - yards)`, which is symmetric around
# 100% of the scorecard yardage. A validation diagnostic against Winchester's true tee/green pairs
# found their straight-line distance is *always* under the played yardage (median ratio ~0.97, two real
# doglegs down at ~0.83) -- doglegs and elevation change routinely play longer than they measure in a
# straight line, but essentially never shorter. The old symmetric cost charged the truth ~350 of its
# 465-cost total for being "short", while a decoy pair sitting at exactly 100% paid nothing. These flat
# and slope constants (FLAT_LOW/HIGH_RATIO from that same Peek+Statesville distribution) fix that: no
# cost inside the normal range, a gentle slope for legitimate doglegs below it, and a steep slope above
# it, since overshooting a straight-line distance past the scorecard yardage is basically GPS noise.
YARDAGE_FLAT_LOW_RATIO = 0.90
YARDAGE_FLAT_HIGH_RATIO = 1.02
YARDAGE_BELOW_SLOPE = 0.3
YARDAGE_ABOVE_SLOPE = 3.0

# Corridor-chain evidence, take 2: a straight-line "longest gap from the nearest mapped fairway" penalty
# (the first version of this) turned out to punish TRUE holes almost as hard as the old symmetric yardage
# cost did. A diagnostic against Winchester's true assignment found two distinct causes, neither of which
# is "this pair is wrong": (a) 2/18 Winchester holes have no fairway feature mapped in OSM at all, so
# *every* candidate for that hole was measuring distance to some unrelated neighbouring hole's fairway;
# (b) real doglegs (verified against truth) have their own correctly-mapped fairway curving well away from
# the straight tee-green line for much of its length, the same "dogleg problem" the yardage-cost fix
# already had to solve once. A hard gap penalty is not dogleg-safe or missing-data-safe; a coverage-based
# *bonus* is: it can only ever help a pair, never hurt one, so a hole with no mapped fairway (or a fairway
# that runs mostly off the straight line) simply gets ~0 bonus instead of a large penalty.
CORRIDOR_SAMPLE_STEP_M = 10.0
CORRIDOR_INSIDE_SLACK_M = 3.0  # a sample within this of a fairway polygon counts as "on" it (digitization slop)
DEFAULT_CORRIDOR_BONUS_WEIGHT = 60.0  # full-length coverage's bonus; weaker than REF_HINT_BONUS on purpose --
                                      # corridor coverage is circumstantial evidence, not a near-certain identity match

REF_HINT_BONUS = 300.0  # cost reduction when a candidate green's OSM `ref`/`name` names this hole number


def load_json(path):
    return json.loads(Path(path).read_text())


def load_osm_extract(path):
    return osmlib.load_extract(str(path))


def _way_polygon(element):
    points = osmlib.way_points(element)
    if len(points) < 4 or points[0] != points[-1]:
        return None
    polygon = Polygon(points)
    if polygon.is_empty or not polygon.is_valid or polygon.area <= 0:
        return None
    return polygon


def _in_bbox(point, bbox):
    return bbox is None or (bbox[0] <= point[0] <= bbox[2] and bbox[1] <= point[1] <= bbox[3])


def collect_osm_candidates(extract, bbox_wgs84=None):
    """Every `golf=tee`/`golf=green` way in the extract (inside `bbox_wgs84`
    when given), as `{id, wayId, kind, geometryWgs84, centroidWgs84, ref}`.
    `ref` is the hole number a mapper recorded on that tee/green itself
    (`ref`/`name` tag, via `factory/osm.py`'s generic parser), or `None`."""
    tees, greens = [], []
    for element in extract.get('elements', []):
        if element.get('type') != 'way':
            continue
        golf = (element.get('tags') or {}).get('golf')
        if golf not in ('tee', 'green'):
            continue
        polygon = _way_polygon(element)
        if polygon is None:
            continue
        centroid = (polygon.centroid.x, polygon.centroid.y)
        if not _in_bbox(centroid, bbox_wgs84):
            continue
        entry = {'id': f'osm-way-{element["id"]}', 'kind': golf,
                  'geometryWgs84': {'type': 'Polygon', 'coordinates': [[list(p) for p in polygon.exterior.coords]]},
                  'centroidWgs84': list(centroid), 'ref': osmlib.parse_ref(element.get('tags') or {})}
        (tees if golf == 'tee' else greens).append(entry)
    return tees, greens


def collect_fairway_union(extract, bbox_wgs84=None):
    """Every `golf=fairway` way in the extract (inside `bbox_wgs84` when
    given), merged into one shapely geometry in WGS84 -- corridor-chain
    evidence for `build_pairs`. `None` when the extract has no fairways at
    all (nothing to score a tee/green line's connectivity against)."""
    from shapely.ops import unary_union
    polygons = []
    for element in extract.get('elements', []):
        if element.get('type') != 'way' or (element.get('tags') or {}).get('golf') != 'fairway':
            continue
        polygon = _way_polygon(element)
        if polygon is None:
            continue
        centroid = (polygon.centroid.x, polygon.centroid.y)
        if not _in_bbox(centroid, bbox_wgs84):
            continue
        polygons.append(polygon)
    return unary_union(polygons) if polygons else None


def collect_surface_candidates(traces_doc, bbox_wgs84=None):
    """Extra tee/green candidates from a `derive-surface-traces.py`-style
    traces document, in the same shape as `collect_osm_candidates`."""
    tees, greens = [], []
    for feature in (traces_doc or {}).get('features', []):
        if feature.get('kind') not in ('tee', 'green'):
            continue
        ring = feature['coordinatesWgs84']
        polygon = Polygon(ring)
        if polygon.is_empty or not polygon.is_valid:
            continue
        centroid = (polygon.centroid.x, polygon.centroid.y)
        if not _in_bbox(centroid, bbox_wgs84):
            continue
        entry = {'id': feature['id'], 'kind': feature['kind'], 'ref': None,
                  'geometryWgs84': {'type': 'Polygon', 'coordinates': [ring]}, 'centroidWgs84': list(centroid)}
        (tees if feature['kind'] == 'tee' else greens).append(entry)
    return tees, greens


def _xy(centroid_wgs84, epsg):
    point = cr.wgs84_to_epsg(cr.to_shapely({'type': 'Point', 'coordinates': centroid_wgs84}), epsg)
    return (point.x, point.y)


def _dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def cluster_tee_complexes(tees, epsg, radius_m=DEFAULT_TEE_COMPLEX_RADIUS_M):
    """Assign each tee a `complexId`: tees within `radius_m` of each other
    (typically a hole's member/forward/back markers) share one id, via
    single-linkage union-find. Mutates and returns `tees`."""
    xy = [_xy(t['centroidWgs84'], epsg) for t in tees]
    parent = list(range(len(tees)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(len(tees)):
        for j in range(i + 1, len(tees)):
            if _dist(xy[i], xy[j]) <= radius_m:
                union(i, j)
    for i, tee in enumerate(tees):
        tee['complexId'] = f'complex-{find(i)}'
        tee['xy'] = xy[i]
    return tees


def yardage_cost(distance_m, yards_m):
    """Piecewise cost against the scorecard yardage: free inside the normal
    range real holes fall in, a gentle slope for a legitimate dogleg running
    short of it, a steep slope for running long (see the module-level
    constants' comment for why this replaced `abs(distance - yards)`)."""
    if yards_m <= 0:
        return 0.0
    low, high = YARDAGE_FLAT_LOW_RATIO * yards_m, YARDAGE_FLAT_HIGH_RATIO * yards_m
    if distance_m < low:
        return (low - distance_m) * YARDAGE_BELOW_SLOPE
    if distance_m > high:
        return (distance_m - high) * YARDAGE_ABOVE_SLOPE
    return 0.0


def corridor_coverage_fraction(tee_xy, green_xy, fairway_union_xy, sample_step_m=CORRIDOR_SAMPLE_STEP_M):
    """The fraction (0..1) of evenly-spaced samples along the straight
    tee-green line that fall within `CORRIDOR_INSIDE_SLACK_M` of any mapped
    fairway polygon. `0.0` when there's no fairway data at all, or when the
    line simply never comes close to one -- in both cases this contributes
    no bonus rather than a penalty (see the module-level comment: a missing
    fairway feature or a real dogleg both legitimately produce a line that
    isn't well covered, and neither should count against a true pair)."""
    if fairway_union_xy is None or fairway_union_xy.is_empty:
        return 0.0
    total = _dist(tee_xy, green_xy)
    if total <= 0:
        return 0.0
    from shapely.geometry import Point as _Point
    steps = max(1, int(total / sample_step_m))
    covered = 0
    for i in range(steps + 1):
        t = i / steps
        x = tee_xy[0] + (green_xy[0] - tee_xy[0]) * t
        y = tee_xy[1] + (green_xy[1] - tee_xy[1]) * t
        if _Point(x, y).distance(fairway_union_xy) <= CORRIDOR_INSIDE_SLACK_M:
            covered += 1
    return covered / (steps + 1)


def continuity_cost(walk_m, weight=DEFAULT_CONTINUITY_WEIGHT, mu=CONTINUITY_LOGNORMAL_MU, sigma=CONTINUITY_LOGNORMAL_SIGMA):
    """One-sided squared log-distance above the fitted green->next-tee walk
    median (see the module-level comment for the fit): free at or below a
    typical walk, growing for one that's unusually long. One-sided on
    purpose -- a green sitting right next to the next tee is completely
    ordinary routing (often *more* common than the ~85m calibration median,
    just under-sampled in a 34-transition fit), so a short walk must never
    cost more than a long one; only an implausibly long walk (crossing to
    the wrong side of the course) is real evidence against a pair."""
    if walk_m <= 0.0:
        return 0.0
    import math
    z = (math.log(walk_m) - mu) / sigma
    return weight * 0.5 * max(0.0, z) ** 2


def build_pairs(tees, greens, epsg, fairway_union_wgs84=None):
    """Every tee/green combination with its straight-line length in metres,
    precomputed projected coordinates, and its corridor-chain gap (the beam
    search evaluates many thousands of these; re-projecting or re-sampling
    the line per lookup is too slow)."""
    fairway_union_xy = cr.wgs84_to_epsg(fairway_union_wgs84, epsg) if fairway_union_wgs84 is not None else None
    pairs = []
    for tee in tees:
        tee_xy = tee.get('xy') or _xy(tee['centroidWgs84'], epsg)
        for green in greens:
            if tee['id'] == green['id']:
                continue
            green_xy = green.get('xy') or _xy(green['centroidWgs84'], epsg)
            green['xy'] = green_xy
            distance = _dist(tee_xy, green_xy)
            coverage = corridor_coverage_fraction(tee_xy, green_xy, fairway_union_xy)
            pairs.append({'tee': tee, 'green': green, 'distanceM': distance, 'teeXy': tee_xy, 'greenXy': green_xy,
                          'complexId': tee.get('complexId', tee['id']), 'corridorCoverageFraction': round(coverage, 3)})
    return pairs


def _feasible_pairs_by_hole(pairs, yards_m):
    by_hole = [[] for _ in yards_m]
    for i, pair in enumerate(pairs):
        for h, yards in enumerate(yards_m):
            if yards <= 0:
                continue
            ratio = pair['distanceM'] / yards
            if MIN_DOGLEG_RATIO <= ratio <= MAX_DOGLEG_RATIO:
                by_hole[h].append(i)
    return by_hole


def _run_beam(pairs, yards_m, beam_width=DEFAULT_BEAM_WIDTH, continuity_weight=DEFAULT_CONTINUITY_WEIGHT,
              corridor_bonus_weight=DEFAULT_CORRIDOR_BONUS_WEIGHT, use_ref_hints=True):
    """The final surviving beam (list of states), not just its best sequence.

    A beam of partial sequences is grown one hole slot at a time. Each state
    tracks which greens and tee complexes are already used (so no green or
    tee marker is reused across two holes) and the last hole's green
    position (so the next hole's tee can be scored for walking continuity).
    Leaving a slot unassigned is always an option, at `SKIP_PENALTY`, so one
    bad/missing hole cannot starve the rest of the course of candidates.

    Per-pair cost is `yardage_cost + continuity_cost - corridor-coverage
    bonus - ref-hint bonus`: yardage match, walking-distance plausibility
    against the fitted green->next-tee distribution, how much of the line is
    actually chained together by mapped fairway, and (when present) whether
    a mapper already labelled this green with this hole's number.
    """
    if not pairs or not yards_m:
        return []
    by_hole = _feasible_pairs_by_hole(pairs, yards_m)
    # (cost, assigned_dict, used_greens, used_complexes, last_green_xy, last_green_id)
    beam = [(0.0, {}, frozenset(), frozenset(), None, None)]
    for h, yards in enumerate(yards_m):
        expanded = []
        for cost, assigned, used_greens, used_complexes, last_green_xy, last_green_id in beam:
            expanded.append((cost + SKIP_PENALTY, assigned, used_greens, used_complexes, last_green_xy, last_green_id))
            for pair_idx in by_hole[h]:
                pair = pairs[pair_idx]
                green_id, complex_id = pair['green']['id'], pair['complexId']
                if green_id in used_greens or complex_id in used_complexes:
                    continue
                added = yardage_cost(pair['distanceM'], yards)
                added -= corridor_bonus_weight * pair.get('corridorCoverageFraction', 0.0)
                if use_ref_hints and pair['green'].get('ref') == h + 1:
                    added -= REF_HINT_BONUS
                if last_green_xy is not None:
                    walk = _dist(last_green_xy, pair['teeXy'])
                    added += continuity_cost(walk, continuity_weight)
                new_assigned = dict(assigned)
                new_assigned[h] = pair_idx
                expanded.append((cost + added, new_assigned, used_greens | {green_id}, used_complexes | {complex_id},
                                  pair['greenXy'], green_id))
        expanded.sort(key=lambda state: state[0])
        # Deduplicate states that reach the same (used_greens, used_complexes, last_green_id) with a
        # worse cost. `last_green_id` must be part of the key: it determines every later slot's
        # continuity cost, so collapsing two states that differ only in it discards information the
        # search still needs and can silently drop the true, lower-cost continuation.
        seen = set()
        pruned = []
        for state in expanded:
            key = (state[2], state[3], state[5])
            if key in seen:
                continue
            seen.add(key)
            pruned.append(state)
            if len(pruned) >= beam_width:
                break
        beam = pruned
    return beam


def beam_search_assignment(pairs, yards_m, beam_width=DEFAULT_BEAM_WIDTH, continuity_weight=DEFAULT_CONTINUITY_WEIGHT,
                            **kwargs):
    """Hole index -> pair index for the lowest-cost complete sequence found
    by `_run_beam`. This is the plain assignment, with no confidence
    information; `propose()` calls `beam_search_with_confidence` instead to
    get both in one search."""
    beam = _run_beam(pairs, yards_m, beam_width, continuity_weight, **kwargs)
    if not beam:
        return {}
    best = min(beam, key=lambda state: state[0])
    return best[1]


def hole_confidences(beam, assignment, pairs):
    """Per-hole confidence as beam agreement: among the final surviving beam
    states, the cost-weighted share that agree with the winning sequence's
    green for that slot. States close in cost to the best get almost as much
    weight as the best itself; states far worse barely count. Unlike a
    single pair's yardage margin (see the module docstring's confidence
    history), this reflects whether the search converged on one clear
    winner for a slot or was still torn between several similar-cost
    alternatives when it stopped -- which is what actually separates the
    holes this tool gets right from the ones it doesn't (see validation
    notes: raw yardage-margin confidence did not separate them)."""
    if not beam:
        return {}
    best_cost = min(state[0] for state in beam)
    weights = [1.0 / (1.0 + (state[0] - best_cost) / 50.0) for state in beam]  # 50m: a short walk's worth of slack
    total_weight = sum(weights)
    confidences = {}
    for h, chosen_pair_idx in assignment.items():
        chosen_green = pairs[chosen_pair_idx]['green']['id']
        agree_weight = sum(w for w, state in zip(weights, beam) if state[1].get(h) is not None
                           and pairs[state[1][h]]['green']['id'] == chosen_green)
        confidences[h] = round(agree_weight / total_weight, 4) if total_weight else 0.0
    return confidences


def beam_search_with_confidence(pairs, yards_m, beam_width=DEFAULT_BEAM_WIDTH, continuity_weight=DEFAULT_CONTINUITY_WEIGHT,
                                 **kwargs):
    beam = _run_beam(pairs, yards_m, beam_width, continuity_weight, **kwargs)
    if not beam:
        return {}, {}
    best = min(beam, key=lambda state: state[0])
    assignment = best[1]
    return assignment, hole_confidences(beam, assignment, pairs)


def _sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def build_document(facility_id, site_id, hole_key_prefix, assignment, pairs, yards_m, pars, osm_path, hole_count,
                    hole_keys=None, confidences=None):
    evidence_id = 'auto-route-osm-snapshot'
    sources = [{'id': 'auto-route-osm', 'provider': 'OpenStreetMap via Overpass API', 'licenseId': 'ODbL-1.0',
                'url': 'https://overpass-api.de/api/interpreter', 'capturedAt': None,
                'retrievedAt': datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
                'attribution': '© OpenStreetMap contributors · ODbL 1.0'}]
    evidence = [{'id': evidence_id, 'sourceId': 'auto-route-osm', 'snapshotSha256': _sha256(osm_path),
                 'method': f'{PRODUCER}: tee/green pairing + yardage assignment', 'sourceCrs': 'EPSG:4326'}]

    features, holes, report_rows = [], [], []
    seen_ids = set()

    def add_feature(feature):
        if feature['id'] in seen_ids:
            return
        seen_ids.add(feature['id'])
        features.append(feature)

    for hole_index in range(hole_count):
        key = hole_keys[hole_index] if hole_keys else f'{hole_key_prefix}-{hole_index + 1:02d}'
        if hole_index not in assignment:
            report_rows.append({'ordinal': hole_index + 1, 'holeKey': key, 'decision': 'unassigned'})
            continue
        pair = pairs[assignment[hole_index]]
        tee, green = pair['tee'], pair['green']
        route_id, green_feature_id, tee_feature_id = f'{key}-route', green['id'], tee['id']
        add_feature({'id': green_feature_id, 'kind': 'green', 'sourceIds': ['auto-route-osm'],
                     'evidenceIds': [evidence_id], 'holeKeys': [key], 'accuracyMeters': None,
                     'geometryWgs84': green['geometryWgs84']})
        add_feature({'id': tee_feature_id, 'kind': 'tee', 'sourceIds': ['auto-route-osm'],
                     'evidenceIds': [evidence_id], 'holeKeys': [key], 'accuracyMeters': None,
                     'geometryWgs84': tee['geometryWgs84']})
        add_feature({'id': route_id, 'kind': 'route', 'sourceIds': ['auto-route-osm'], 'evidenceIds': [evidence_id],
                     'holeKeys': [key], 'accuracyMeters': 75.0,
                     'geometryWgs84': {'type': 'LineString', 'coordinates': [tee['centroidWgs84'], green['centroidWgs84']]}})
        holes.append({'holeKey': key, 'routeFeatureId': route_id, 'greenFeatureId': green_feature_id,
                      'identityReview': {'status': 'candidate', 'evidenceIds': [evidence_id]}})
        yards_m_value = yards_m[hole_index]
        delta_yards = round((pair['distanceM'] - yards_m_value) / YARD_TO_M, 1)
        confidence = (confidences or {}).get(hole_index, 0.0)
        report_rows.append({'ordinal': hole_index + 1, 'holeKey': key, 'decision': 'proposed',
                             'par': pars[hole_index] if pars else None, 'scorecardYards': round(yards_m_value / YARD_TO_M, 1),
                             'straightLineYards': round(pair['distanceM'] / YARD_TO_M, 1), 'yardageDeltaYards': delta_yards,
                             'confidence': confidence, 'teeId': tee['id'], 'greenId': green['id']})

    doc = {
        'schema': SCHEMA, 'facilityId': facility_id, 'siteId': site_id, 'crs': 'EPSG:4326',
        'coordinateOrder': 'longitude,latitude', 'producer': PRODUCER, 'status': STATUS,
        'generatedAt': datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
        'sources': sources, 'evidence': evidence, 'features': features, 'holes': holes,
        'report': report_rows,
    }
    return doc


class NumberedSeriesExistsError(Exception):
    """Raised when the OSM extract already has a resolvable numbered
    `golf=hole` series for this layout: this tool is only for courses that
    lack one, per its docstring. Pass `--allow-numbered-osm` to override,
    e.g. to validate this tool against a course with known-truth numbering."""


def propose(scorecard, extract, surfaces_doc, facility_id, hole_key_prefix, osm_path,
            allow_numbered_osm=False, tee_complex_radius_m=DEFAULT_TEE_COMPLEX_RADIUS_M,
            beam_width=DEFAULT_BEAM_WIDTH, continuity_weight=DEFAULT_CONTINUITY_WEIGHT,
            corridor_bonus_weight=DEFAULT_CORRIDOR_BONUS_WEIGHT,
            use_ref_hints=True, extra_tee_candidates=None):
    bbox = scorecard.get('bboxWgs84')
    pars = scorecard.get('pars')
    hole_order = scorecard.get('holeOrder')
    hole_count = len(scorecard['scorecardYards'])
    if not allow_numbered_osm:
        site = {'bboxWgs84': bbox} if bbox else None
        layout_name = scorecard.get('layoutName') or hole_key_prefix
        chosen, series_evidence = osmlib.propose_routes(extract, site, hole_count, pars, layout_name)
        if chosen:
            raise NumberedSeriesExistsError(
                f'OSM extract already resolves a numbered golf=hole series for {hole_count} holes '
                f'(way ids {chosen}); this tool refuses to invent a route on top of it. '
                f'Pass allow_numbered_osm=True to override. Evidence: {series_evidence}')
    tees, greens = collect_osm_candidates(extract, bbox)
    if surfaces_doc:
        extra_tees, extra_greens = collect_surface_candidates(surfaces_doc, bbox)
        tees, greens = tees + extra_tees, greens + extra_greens
    if extra_tee_candidates:
        tees = tees + extra_tee_candidates
    fairway_union = collect_fairway_union(extract, bbox)
    epsg = utm_epsg(*scorecard['originWgs84'])
    cluster_tee_complexes(tees, epsg, tee_complex_radius_m)
    pairs = build_pairs(tees, greens, epsg, fairway_union_wgs84=fairway_union)
    yards_m = [y * YARD_TO_M for y in scorecard['scorecardYards']]
    assignment, confidences = beam_search_with_confidence(
        pairs, yards_m, beam_width=beam_width, continuity_weight=continuity_weight,
        corridor_bonus_weight=corridor_bonus_weight, use_ref_hints=use_ref_hints)
    doc = build_document(facility_id, scorecard['siteId'], hole_key_prefix, assignment, pairs, yards_m, pars,
                          osm_path, hole_count, hole_keys=hole_order, confidences=confidences)
    stats = {'teeCandidates': len(tees), 'greenCandidates': len(greens), 'pairCandidates': len(pairs),
              'fairwayCandidates': 0 if fairway_union is None else (len(fairway_union.geoms) if fairway_union.geom_type == 'MultiPolygon' else 1)}
    return doc, stats


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--layout', required=True, help='Layout id; also the default hole-key prefix')
    parser.add_argument('--scorecard', required=True, type=Path)
    parser.add_argument('--osm', required=True, type=Path, help='Retained Overpass extract (.json or .json.gz)')
    parser.add_argument('--surfaces', default=None, type=Path, help='Optional derive-surface-traces.py output for extra tee/green candidates')
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--facility-id', default=None, help="Defaults to the scorecard's facilityId, then --layout")
    parser.add_argument('--hole-key-prefix', default=None, help='Defaults to --layout')
    parser.add_argument('--allow-numbered-osm', action='store_true',
                         help='Run even when the OSM extract already resolves a numbered golf=hole series '
                              '(for validating this tool against a course with known-truth numbering)')
    parser.add_argument('--tee-complex-radius-m', type=float, default=DEFAULT_TEE_COMPLEX_RADIUS_M)
    parser.add_argument('--beam-width', type=int, default=DEFAULT_BEAM_WIDTH)
    parser.add_argument('--continuity-weight', type=float, default=DEFAULT_CONTINUITY_WEIGHT)
    parser.add_argument('--corridor-bonus-weight', type=float, default=DEFAULT_CORRIDOR_BONUS_WEIGHT)
    parser.add_argument('--no-ref-hints', action='store_true', help='Ignore OSM ref/name hole-number hints on tees/greens (for ablation)')
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    scorecard = load_json(args.scorecard)
    extract = load_osm_extract(args.osm)
    surfaces_doc = load_json(args.surfaces) if args.surfaces else None
    facility_id = args.facility_id or scorecard.get('facilityId') or args.layout
    hole_key_prefix = args.hole_key_prefix or args.layout
    doc, stats = propose(scorecard, extract, surfaces_doc, facility_id, hole_key_prefix, args.osm,
                          allow_numbered_osm=args.allow_numbered_osm,
                          tee_complex_radius_m=args.tee_complex_radius_m,
                          beam_width=args.beam_width, continuity_weight=args.continuity_weight,
                          corridor_bonus_weight=args.corridor_bonus_weight,
                          use_ref_hints=not args.no_ref_hints)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=2) + '\n')
    proposed = sum(1 for row in doc['report'] if row['decision'] == 'proposed')
    print(f'{proposed}/{len(doc["report"])} holes proposed; candidates: {stats}', file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

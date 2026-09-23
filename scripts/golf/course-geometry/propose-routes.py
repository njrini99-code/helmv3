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
DEFAULT_CONTINUITY_WEIGHT = 1.0
CONTINUITY_HINGE_M = 150.0  # a green-to-next-tee walk under this is "free"; only the excess over it is penalized,
                            # so continuity discourages implausible walks rather than rewarding merely-short ones
                            # (which let a decoy tee sitting next to the previous green outscore the true, longer walk)
SKIP_PENALTY = 2000.0  # cost of leaving a hole unassigned rather than forcing a bad pair


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
    when given), as `{id, wayId, kind, geometryWgs84, centroidWgs84}`."""
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
                  'centroidWgs84': list(centroid)}
        (tees if golf == 'tee' else greens).append(entry)
    return tees, greens


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
        entry = {'id': feature['id'], 'kind': feature['kind'],
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


def build_pairs(tees, greens, epsg):
    """Every tee/green combination with its straight-line length in metres
    and precomputed projected coordinates (the beam search evaluates many
    thousands of these; re-projecting per lookup is too slow)."""
    pairs = []
    for tee in tees:
        tee_xy = tee.get('xy') or _xy(tee['centroidWgs84'], epsg)
        for green in greens:
            if tee['id'] == green['id']:
                continue
            green_xy = green.get('xy') or _xy(green['centroidWgs84'], epsg)
            green['xy'] = green_xy
            distance = _dist(tee_xy, green_xy)
            pairs.append({'tee': tee, 'green': green, 'distanceM': distance, 'teeXy': tee_xy, 'greenXy': green_xy,
                          'complexId': tee.get('complexId', tee['id'])})
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


def _run_beam(pairs, yards_m, beam_width=DEFAULT_BEAM_WIDTH, continuity_weight=DEFAULT_CONTINUITY_WEIGHT):
    """The final surviving beam (list of states), not just its best sequence.

    A beam of partial sequences is grown one hole slot at a time. Each state
    tracks which greens and tee complexes are already used (so no green or
    tee marker is reused across two holes) and the last hole's green
    position (so the next hole's tee can be scored for walking continuity).
    Leaving a slot unassigned is always an option, at `SKIP_PENALTY`, so one
    bad/missing hole cannot starve the rest of the course of candidates.
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
                added = abs(pair['distanceM'] - yards)
                if last_green_xy is not None:
                    walk = _dist(last_green_xy, pair['teeXy'])
                    added += continuity_weight * max(0.0, walk - CONTINUITY_HINGE_M)
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


def beam_search_assignment(pairs, yards_m, beam_width=DEFAULT_BEAM_WIDTH, continuity_weight=DEFAULT_CONTINUITY_WEIGHT):
    """Hole index -> pair index for the lowest-cost complete sequence found
    by `_run_beam`. This is the plain assignment, with no confidence
    information; `propose()` calls `beam_search_with_confidence` instead to
    get both in one search."""
    beam = _run_beam(pairs, yards_m, beam_width, continuity_weight)
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


def beam_search_with_confidence(pairs, yards_m, beam_width=DEFAULT_BEAM_WIDTH, continuity_weight=DEFAULT_CONTINUITY_WEIGHT):
    beam = _run_beam(pairs, yards_m, beam_width, continuity_weight)
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
            beam_width=DEFAULT_BEAM_WIDTH, continuity_weight=DEFAULT_CONTINUITY_WEIGHT):
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
    epsg = utm_epsg(*scorecard['originWgs84'])
    cluster_tee_complexes(tees, epsg, tee_complex_radius_m)
    pairs = build_pairs(tees, greens, epsg)
    yards_m = [y * YARD_TO_M for y in scorecard['scorecardYards']]
    assignment, confidences = beam_search_with_confidence(pairs, yards_m, beam_width=beam_width,
                                                           continuity_weight=continuity_weight)
    doc = build_document(facility_id, scorecard['siteId'], hole_key_prefix, assignment, pairs, yards_m, pars,
                          osm_path, hole_count, hole_keys=hole_order, confidences=confidences)
    return doc, {'teeCandidates': len(tees), 'greenCandidates': len(greens), 'pairCandidates': len(pairs)}


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
                          beam_width=args.beam_width, continuity_weight=args.continuity_weight)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=2) + '\n')
    proposed = sum(1 for row in doc['report'] if row['decision'] == 'proposed')
    print(f'{proposed}/{len(doc["report"])} holes proposed; candidates: {stats}', file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

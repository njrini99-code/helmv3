#!/usr/bin/env python3
"""Held-out ordering accuracy for `propose-routes.py` (Phase D1 item 1).

For each of a set of catalogued courses whose retained OSM extract already
has a resolvable numbered `golf=hole` series (so we know ground truth), this:

  1. builds ground truth per hole ordinal: the nearest tee/green candidate to
     the numbered `golf=hole` way's first/last point;
  2. runs `propose-routes.py` with the numbered series's ordering signal
     removed -- `allow_numbered_osm=True` so the tool doesn't refuse to run
     at all, and `use_ref_hints=False` so a tee/green way's own `ref`/`name`
     tag (a second, independent hole-number label some mappers also add)
     cannot leak the answer either. This makes a "known-truth" course look,
     to the proposer, like the real held-out layouts (Boonsboro, Poplar
     Grove, ...) that have no numbered series and no ref-tagged markers;
  3. scores three ways, because an exact-match score of 0/18 or 1/18 can
     mean either "the chain is wrong" or "a correct chain is anchored at the
     wrong hole" -- these tell them apart:
       - exact: this ordinal's proposed (tee, green) is truth's (tee, green).
       - transitions: proposed green(h)->tee(h+1) edges that are also true
         edges, regardless of which ordinal they landed on.
       - bestRotation: the best exact-match score over all 18 cyclic
         rotations of the proposed sequence (a front/back-nine swap is
         rotation-by-9; a purely mis-anchored-but-correctly-chained course
         scores low on `exact` and high here).

Runs three variants against the current tool (`use_cartpaths` True/False)
and, for comparison, the pre-Phase-D1 baseline tool (no cart-path evidence
at all) via `--baseline`, a checked-out copy of `propose-routes.py` from a
prior commit. Strictly read-only against the real catalog/output: it only
opens retained artifacts, and writes nothing back to them.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from factory import osm as osmlib  # noqa: E402
from factory.catalog import load_catalog  # noqa: E402
from factory.context import Context  # noqa: E402

DEFAULT_COURSES = ['cacapon', 'winchester-cc', 'forsyth-country-club', 'starmount-forest',
                    'cutter-creek', 'statesville-country-club', 'denison-golf-club', 'duke-university-golf-club']


def _load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _element_points(extract, way_id):
    for element in extract.get('elements', []):
        if element.get('type') == 'way' and element.get('id') == way_id:
            return osmlib.way_points(element)
    return []


def ground_truth(extract, scorecard, tees, greens):
    """ordinal (1-based) -> {'teeId', 'greenId'} from the numbered
    `golf=hole` series, by snapping each way's first/last point to the
    nearest candidate tee/green centroid. Tried both orientations (some
    mappers digitize green->tee); the orientation with the smaller total
    snap distance across every hole wins for the whole course, since a
    course is digitized consistently."""
    site = {'bboxWgs84': scorecard.get('bboxWgs84')} if scorecard.get('bboxWgs84') else None
    ways = [w for w in osmlib.hole_ways(extract, site) if w['ref'] is not None]
    by_ref = {}
    for w in ways:
        by_ref.setdefault(w['ref'], w)  # first one wins; duplicates are not this harness's problem

    def nearest(point, candidates):
        best, best_d = None, None
        for c in candidates:
            d = (c['centroidWgs84'][0] - point[0]) ** 2 + (c['centroidWgs84'][1] - point[1]) ** 2
            if best_d is None or d < best_d:
                best, best_d = c, d
        return best, (best_d ** 0.5 if best_d is not None else None)

    def snap_all(tee_end_is_first):
        truth, total = {}, 0.0
        for ref, way in by_ref.items():
            points = _element_points(extract, way['id'])
            if len(points) < 2:
                continue
            tee_pt, green_pt = (points[0], points[-1]) if tee_end_is_first else (points[-1], points[0])
            tee, tee_d = nearest(tee_pt, tees)
            green, green_d = nearest(green_pt, greens)
            if tee is None or green is None:
                continue
            truth[ref] = {'teeId': tee['id'], 'greenId': green['id']}
            total += (tee_d or 0) + (green_d or 0)
        return truth, total

    truth_a, total_a = snap_all(True)
    truth_b, total_b = snap_all(False)
    return truth_a if total_a <= total_b else truth_b


def score(assignment_rows, truth, hole_count):
    """`assignment_rows`: `doc['report']` rows in ordinal order.
    Returns exact/transition/best-rotation counts, each out of `hole_count`."""
    proposed = {row['ordinal']: {'teeId': row.get('teeId'), 'greenId': row.get('greenId')}
                for row in assignment_rows if row.get('decision') == 'proposed'}
    exact = sum(1 for ref in range(1, hole_count + 1)
                if ref in proposed and ref in truth
                and proposed[ref]['teeId'] == truth[ref]['teeId'] and proposed[ref]['greenId'] == truth[ref]['greenId'])
    truth_edges = {(truth[r]['greenId'], truth[r + 1]['teeId']) for r in range(1, hole_count)
                   if r in truth and r + 1 in truth}
    proposed_edges = {(proposed[r]['greenId'], proposed[r + 1]['teeId']) for r in range(1, hole_count)
                      if r in proposed and r + 1 in proposed}
    transitions = len(truth_edges & proposed_edges)
    best_rotation = 0
    for k in range(hole_count):
        matches = sum(1 for ref in range(1, hole_count + 1)
                       if ref in proposed and ((ref - 1 + k) % hole_count) + 1 in truth
                       and proposed[ref]['teeId'] == truth[((ref - 1 + k) % hole_count) + 1]['teeId']
                       and proposed[ref]['greenId'] == truth[((ref - 1 + k) % hole_count) + 1]['greenId'])
        best_rotation = max(best_rotation, matches)
    return {'exact': exact, 'transitions': transitions, 'bestRotation': best_rotation, 'holeCount': hole_count}


def run_variant(module, scorecard, extract, facility_id, layout_id, osm_path, use_cartpaths=None):
    kwargs = {'allow_numbered_osm': True, 'use_ref_hints': False}
    # The pre-Phase-D1 baseline module's `propose()` predates the cart-path
    # feature entirely -- it has no `use_cartpaths` parameter at all, so this
    # kwarg is only ever passed to the current module.
    if use_cartpaths is not None:
        kwargs['use_cartpaths'] = use_cartpaths
    doc, stats = module.propose(scorecard, extract, None, facility_id, layout_id, str(osm_path), **kwargs)
    return doc, stats


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    worktree_root = HERE.parents[2]  # .../scripts/golf/course-geometry -> worktree root
    real_root = worktree_root.parent / 'golf-course-geometry'  # read-only sibling worktree
    # Retained snapshot pointers store repo-relative directories, so
    # `repo_root` must be the worktree that actually owns `--output`
    # (real_root) for `ctx.abspath` to resolve them -- not this agent
    # worktree, which only supplies the *code* being evaluated.
    parser.add_argument('--repo-root', default=str(real_root))
    parser.add_argument('--catalog', default=str(real_root / 'course-geometry' / 'catalog'))
    parser.add_argument('--output', default=str(real_root / 'output' / 'course-geometry' / 'factory'))
    parser.add_argument('--courses', default=','.join(DEFAULT_COURSES))
    parser.add_argument('--baseline', default=None, help='A checked-out prior-commit copy of propose-routes.py (no cart-path evidence)')
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args(argv)

    current = _load_module(str(HERE / 'propose-routes.py'), 'propose_routes_current')
    baseline = _load_module(args.baseline, 'propose_routes_baseline') if args.baseline else None

    catalog = load_catalog(args.catalog)
    if catalog.problems:
        print(f'catalog problems: {catalog.problems}', file=sys.stderr)
    ctx = Context(args.repo_root, catalog, args.output, adopt_output=True)

    rows = []
    for layout_id in args.courses.split(','):
        layout = ctx.layout(layout_id)
        if not layout:
            rows.append({'layoutId': layout_id, 'error': 'not in catalog'})
            continue
        facility_id = layout['facilityId']
        scorecard = ctx.route_proposal_scorecard(layout_id)
        manifest, osm_path = ctx.snapshot(facility_id)
        if not scorecard or not osm_path:
            rows.append({'layoutId': layout_id, 'error': 'no scorecard/OSM snapshot retained'})
            continue
        extract = osmlib.load_extract(osm_path)
        hole_count = len(scorecard['scorecardYards'])

        tees, greens = current.collect_osm_candidates(extract, scorecard.get('bboxWgs84'))
        truth = ground_truth(extract, scorecard, tees, greens)
        if len(truth) < hole_count:
            rows.append({'layoutId': layout_id, 'error': f'only {len(truth)}/{hole_count} numbered holes snapped to a candidate'})
            continue

        row = {'layoutId': layout_id, 'holeCount': hole_count}
        try:
            doc, _ = run_variant(current, scorecard, extract, facility_id, layout_id, osm_path, use_cartpaths=True)
            row['afterWithCartpaths'] = score(doc['report'], truth, hole_count)
            doc, _ = run_variant(current, scorecard, extract, facility_id, layout_id, osm_path, use_cartpaths=False)
            row['afterNoCartpaths'] = score(doc['report'], truth, hole_count)
            if baseline:
                doc, _ = run_variant(baseline, scorecard, extract, facility_id, layout_id, osm_path)
                row['before'] = score(doc['report'], truth, hole_count)
        except Exception as exc:  # noqa: BLE001 - one course's failure must not sink the whole table
            row['error'] = f'{type(exc).__name__}: {exc}'
        rows.append(row)

    def _sum(key, field):
        vals = [r[key][field] for r in rows if key in r]
        return sum(vals), sum(r[key]['holeCount'] for r in rows if key in r)

    summary = {}
    for key in ('before', 'afterNoCartpaths', 'afterWithCartpaths'):
        if any(key in r for r in rows):
            exact_n, denom = _sum(key, 'exact')
            trans_n, _ = _sum(key, 'transitions')
            rot_n, _ = _sum(key, 'bestRotation')
            summary[key] = {'exact': f'{exact_n}/{denom}', 'transitions': f'{trans_n}/{denom - len([r for r in rows if key in r])}',
                             'bestRotation': f'{rot_n}/{denom}'}

    out = {'courses': rows, 'summary': summary}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2) + '\n')
    for r in rows:
        print(r.get('layoutId'), {k: r[k] for k in ('before', 'afterNoCartpaths', 'afterWithCartpaths', 'error') if k in r},
              file=sys.stderr)
    print('summary:', json.dumps(summary, indent=2), file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

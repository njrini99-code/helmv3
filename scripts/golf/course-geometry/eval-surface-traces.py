#!/usr/bin/env python3
"""Held-out evaluation for `derive-surface-traces.py` (Phase 2 item 1, round 2).

For a course whose package already carries a real (OSM-derived) fairway
polygon per hole, this hides that polygon, re-derives it from imagery with
`derive-surface-traces.py`, and scores IoU against the hidden truth. Peek'n
Peak Upper hole 11 alone (round 1) is in-sample: its hand trace is exactly
what the round-1 thresholds were tuned against. This script is how the tracer
gets an honest, held-out number instead.

Protocol (per round-2 review):
  * Truth for a hole is the union of that hole's `fairway` features, minus
    the same exclusions the tracer itself applies (green/tee/bunker/water) --
    an apples-to-apples comparison against what `build_trace` is allowed to
    draw.
  * Holes with no truth fairway feature (most par 3s, plus any hole whose
    OSM fairway never actually reached the route) are skipped and not
    counted in the denominator; the report says how many were evaluated.
  * A hole the tracer refuses (no candidate, or below `--confidence-min`) is
    reported two ways: IoU over *traced* holes only, and IoU with refusals
    counted as 0 -- so raising the confidence floor cannot inflate the
    median by quietly dropping the hard cases.
  * `--tune-course` runs a small grid search over a few round-2 parameters
    (otsu_eta_min, brightness_smooth_m, close_radius_m) to maximize the
    refused-as-0 median across the given course(s), and can write the winning
    combination to `--freeze-out` for later runs to load with `--frozen`.
    Tune only on courses you intend to name as the training set; a held-out
    run should pass `--frozen` from that file and never call `--tune-course`
    on the same courses being reported as held-out.

Usage:
  eval-surface-traces.py --course winchester-cc:/path/normalized.json:/path/naip.tif:/path/elevation.tiff \\
      [--course ...] [--tune] [--freeze-out defaults.json] [--frozen defaults.json] [--out report.json]
"""
from __future__ import annotations

import argparse
import copy
import itertools
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import course_raster as cr  # noqa: E402
import importlib.util as _ilu  # noqa: E402


def _load_module(name, filename):
    spec = _ilu.spec_from_file_location(name, str(HERE / filename))
    module = _ilu.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


dst = _load_module('derive_surface_traces', 'derive-surface-traces.py')


def parse_course_spec(spec):
    course_id, package_path, naip_path, dem_path = spec.split(':')
    return {'courseId': course_id, 'package': package_path, 'naip': naip_path, 'dem': dem_path}


def _truth_polygon(package, hole, by_id, epsg):
    fairway_ids = [fid for fid in hole['featureIds'] if by_id[fid]['kind'] == 'fairway']
    if not fairway_ids:
        return None
    from shapely.ops import unary_union
    polys = [cr.to_shapely(by_id[fid]['geometryWgs84']) for fid in fairway_ids]
    truth = unary_union(polys)
    exclusion = dst._exclusion_union(package, hole, by_id, ('green', 'tee', 'bunker', 'water'))
    if exclusion is not None:
        truth = truth.difference(exclusion)
    return cr.wgs84_to_epsg(truth, epsg)


def _hide_fairway(package, ordinal):
    """A deep copy of `package` with hole `ordinal`'s fairway feature(s)
    removed from both `features` and its `featureIds`, so `derive-surface-
    traces.py` sees exactly what a real "missing fairway" course looks like."""
    package = copy.deepcopy(package)
    by_id = {f['id']: f for f in package['features']}
    hole = next(h for h in package['holes'] if h['ordinal'] == ordinal)
    fairway_ids = {fid for fid in hole['featureIds'] if by_id[fid]['kind'] == 'fairway'}
    hole['featureIds'] = [fid for fid in hole['featureIds'] if fid not in fairway_ids]
    package['features'] = [f for f in package['features'] if f['id'] not in fairway_ids]
    return package, hole


def evaluate_course(course, options, naip=None, dem=None):
    package = json.loads(Path(course['package']).read_text())
    epsg = dst.origin_epsg(package)
    if naip is None or dem is None:
        naip, dem = dst._resolve_grid(course['naip'], course['dem'], epsg)
    by_id = {f['id']: f for f in package['features']}

    rows = []
    for hole in package['holes']:
        truth = _truth_polygon(package, hole, by_id, epsg)
        if truth is None or truth.is_empty:
            rows.append({'ordinal': hole['ordinal'], 'holeKey': hole['key'], 'evaluated': False})
            continue
        hidden_package, hidden_hole = _hide_fairway(package, hole['ordinal'])
        try:
            bounds = dst._hole_bounds(hidden_package, hidden_hole, epsg, options['corridor_m'])
            hole_naip = cr.crop_to_bounds(naip, bounds)
            hole_dem = cr.crop_to_bounds(dem, bounds)
        except (ValueError, KeyError):
            hole_naip, hole_dem = naip, dem
        trace, evidence = dst.build_trace(hidden_package, hidden_hole, hole_naip, hole_dem, epsg, options)
        row = {'ordinal': hole['ordinal'], 'holeKey': hole['key'], 'evaluated': True,
               'truthAreaSqm': round(truth.area, 1)}
        if trace is None:
            row.update({'traced': False, 'reason': evidence.get('reason'), 'iou': 0.0})
        else:
            traced = cr.wgs84_to_epsg(cr.to_shapely({'type': 'Polygon', 'coordinates': [trace['coordinatesWgs84']]}), epsg)
            row.update({'traced': True, 'iou': round(cr.iou(traced, truth), 4), 'confidence': trace['confidence']})
        rows.append(row)
    return rows


def summarize(rows):
    evaluated = [r for r in rows if r['evaluated']]
    traced = [r for r in evaluated if r['traced']]
    ious_traced_only = [r['iou'] for r in traced]
    ious_with_refusals = [r['iou'] for r in evaluated]  # refused holes already carry iou=0.0
    worst5 = sorted(evaluated, key=lambda r: r['iou'])[:5]

    def stats(values):
        if not values:
            return {'median': None, 'p25': None, 'n': 0}
        values = sorted(values)
        return {'median': round(statistics.median(values), 4),
                'p25': round(values[max(0, int(len(values) * 0.25) - 1)], 4) if len(values) > 1 else round(values[0], 4),
                'n': len(values)}

    return {
        'holesTotal': len(rows), 'holesEvaluated': len(evaluated), 'holesTraced': len(traced),
        'coverage': round(len(traced) / len(evaluated), 4) if evaluated else None,
        'iouTracedOnly': stats(ious_traced_only),
        'iouWithRefusalsAsZero': stats(ious_with_refusals),
        'worst5': [{'holeKey': r['holeKey'], 'iou': r['iou'], 'traced': r['traced'], 'reason': r.get('reason')} for r in worst5],
    }


TUNE_GRID = {
    # otsu_eta_min: the round-2 acceptance gate for the fairway/rough split.
    # ndvi_max, roughness_max, confidence_min: round-1 params diagnosed (via a
    # direct pixel-stats check on Winchester) as Peek-specific and not
    # transferable -- Winchester's turf sits at a much lower NDVI (median
    # 0.19 in-corridor vs. Peek's ~0.38-0.47) and its DEM is noisier
    # (median roughness 0.018 but a long tail past Peek's 0.05 ceiling),
    # so both were suppressing the composite score on nearly every hole.
    # brightness_smooth_m / close_radius_m are left at the values the review
    # specified directly (~10m, ~3m), not grid-searched.
    'otsu_eta_min': [0.4, 0.5],
    'ndvi_max': [0.55, 0.95],
    'roughness_max': [0.05, 0.10, 0.15],
    'confidence_min': [0.35, 0.45],
}


def tune(courses, base_options):
    best_score, best_combo, best_rows = -1.0, None, None
    keys = list(TUNE_GRID.keys())
    combos = list(itertools.product(*(TUNE_GRID[k] for k in keys)))
    print(f'tuning over {len(combos)} combinations x {len(courses)} course(s)...', file=sys.stderr)
    cache = {}
    for combo in combos:
        options = dict(base_options, **dict(zip(keys, combo)))
        all_rows = []
        for course in courses:
            cache_key = course['courseId']
            if cache_key not in cache:
                package = json.loads(Path(course['package']).read_text())
                epsg = dst.origin_epsg(package)
                naip, dem = dst._resolve_grid(course['naip'], course['dem'], epsg)
                cache[cache_key] = (naip, dem)
            naip, dem = cache[cache_key]
            all_rows.extend(evaluate_course(course, options, naip=naip, dem=dem))
        summary = summarize(all_rows)
        score = summary['iouWithRefusalsAsZero']['median'] or 0.0
        print(f'  {dict(zip(keys, combo))} -> median(refused=0)={score}', file=sys.stderr)
        if score > best_score:
            best_score, best_combo, best_rows = score, dict(zip(keys, combo)), all_rows
    return best_combo, best_score, best_rows


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--course', action='append', required=True,
                         help='courseId:package.json:naip.tif:elevation.tiff (repeatable)')
    parser.add_argument('--tune', action='store_true', help='grid-search round-2 params over the given --course set')
    parser.add_argument('--freeze-out', type=Path, default=None, help='write the winning (or --frozen) options here')
    parser.add_argument('--frozen', type=Path, default=None, help='load frozen round-2 params from a prior --freeze-out')
    parser.add_argument('--out', type=Path, default=None)
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    courses = [parse_course_spec(s) for s in args.course]
    options = dict(dst.DEFAULTS)
    if args.frozen:
        options.update(json.loads(args.frozen.read_text()))

    if args.tune:
        best_combo, best_score, _ = tune(courses, options)
        options.update(best_combo)
        print(f'winning combo: {best_combo} (median IoU incl. refusals = {best_score})', file=sys.stderr)
        if args.freeze_out:
            args.freeze_out.parent.mkdir(parents=True, exist_ok=True)
            args.freeze_out.write_text(json.dumps(options, indent=2) + '\n')

    report = {}
    for course in courses:
        rows = evaluate_course(course, options)
        report[course['courseId']] = {'summary': summarize(rows), 'holes': rows}
        s = report[course['courseId']]['summary']
        print(f"{course['courseId']}: evaluated={s['holesEvaluated']} traced={s['holesTraced']} "
              f"coverage={s['coverage']} median(traced-only)={s['iouTracedOnly']['median']} "
              f"median(refused=0)={s['iouWithRefusalsAsZero']['median']} p25={s['iouWithRefusalsAsZero']['p25']}",
              file=sys.stderr)

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps({'options': options, 'courses': report}, indent=2) + '\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

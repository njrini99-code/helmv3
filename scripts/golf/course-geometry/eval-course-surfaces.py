#!/usr/bin/env python3
"""Held-out evaluation for `detect-course-surfaces.py`, against real OSM
truth -- required before this detector is ever wired into the factory DAG
(see that module's docstring and the task brief this was built against).

For each facility, this:
  1. resolves its most current terrain/naip/lidar/osm/osm-context inputs
     from a real `course-factory.py` output tree (read-only: this never
     runs the factory, never writes there);
  2. runs `detect-course-surfaces.py`'s whole-course detectors;
  3. loads OSM truth (`golf=green`/`golf=tee`/`golf=bunker` ways) restricted
     to the facility's own AOI polygon -- a practice green or a neighbouring
     course's markers sitting in the wider bbox is not this facility's
     truth;
  4. scores greens by greedy nearest-centroid matching within 15m (recall,
     precision -- the same definition `detect-tee-complexes.py.validate()`
     already uses in this codebase);
  5. scores tees at *complex* level: both truth and detected tees are
     clustered with `propose-routes.py`'s own `cluster_tee_complexes` at its
     default radius, then complexes are matched one-to-one when their
     closest pair of member centroids is within 15m (complex-centroid-to-
     complex-centroid would unfairly punish a long back-tee/forward-tee
     spread);
  6. optionally scores bunkers by greedy IoU matching (`--bunkers`).

`--tune-course` grid-searches a few detector parameters to maximize the
combined median (green recall+precision)/2 and tee-complex recall over the
named course(s) only; `--freeze-out` records the winner for later `--frozen`
loads. Tune only on the course(s) you intend to name as the training set --
a held-out run must load `--frozen` and never call `--tune-course` on the
courses it reports as held-out.

Usage:
  eval-course-surfaces.py --course cacapon:/path/to/facilities/cacapon \\
      [--course ...] [--tune-course winchester-country-club] \\
      [--freeze-out frozen.json] [--frozen frozen.json] \\
      [--out report.json] [--overlay-dir dir/]
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


dcs = _load_module('detect_course_surfaces', 'detect-course-surfaces.py')
routes = _load_module('propose_routes', 'propose-routes.py')
from course_crs import utm_epsg  # noqa: E402
from factory import osm as osmlib  # noqa: E402

TEE_COMPLEX_RADIUS_M = routes.DEFAULT_TEE_COMPLEX_RADIUS_M
GREEN_MATCH_TOLERANCE_M = 15.0
TEE_COMPLEX_MATCH_TOLERANCE_M = 15.0


# ---------------------------------------------------------------------------
# Facility input resolution (read-only; never runs the factory)


def _newest(paths):
    return max(paths, key=lambda p: p.stat().st_mtime) if paths else None


def _resolve_snapshot(facility_dir, kind):
    pointer = facility_dir / kind / 'current.json'
    if pointer.is_file():
        doc = json.loads(pointer.read_text())
        rev = doc.get('revision')
        if rev:
            gz = facility_dir / kind / rev / 'overpass.json.gz'
            if gz.is_file():
                return gz
    root = facility_dir / kind
    if root.is_dir():
        revs = [d / 'overpass.json.gz' for d in root.iterdir() if d.is_dir() and (d / 'overpass.json.gz').is_file()]
        return _newest(revs)
    return None


def _terrain_candidates(facility_dir):
    root = facility_dir / 'terrain'
    if not root.is_dir():
        return []
    return [d for d in root.iterdir() if d.is_dir() and (d / 'elevation.tiff').is_file() and (d / 'export.json').is_file()]


def _naip_for_key(facility_dir, key):
    root = facility_dir / 'naip'
    if not root.is_dir():
        return None
    candidates = [d for d in root.iterdir() if d.is_dir() and d.name.startswith(key) and (d / 'naip.tif').is_file()]
    locked = [d for d in candidates if '-locked-' in d.name]
    return _newest(locked or candidates)


def resolve_facility_inputs(facility_dir):
    """Picks one coherent (terrain, naip, lidar) triple: the lidar CHM is
    keyed to a specific terrain export's own bytes (`terrainExportSha256`),
    so a facility with more than one terrain export on disk (a stale key
    alongside a current one -- real for at least two validation courses)
    must not pair imagery/DEM from one export with a CHM cut for another.
    Preference order: a terrain key with a `covered` CHM, then
    `no_coverage`, then `failed` (still evidence a lidar attempt ran
    against it), then a `-perimeter-v1` key with no lidar directory at all,
    then any remaining terrain key."""
    facility_dir = Path(facility_dir)
    terrain_dirs = _terrain_candidates(facility_dir)
    if not terrain_dirs:
        return None

    def rank(terrain_dir):
        lidar_dir = facility_dir / 'lidar' / terrain_dir.name
        manifest_path = lidar_dir / 'manifest.json'
        status = json.loads(manifest_path.read_text()).get('status') if manifest_path.is_file() else None
        if status == 'covered':
            return 0
        if status == 'no_coverage':
            return 1
        if status == 'failed':
            return 2
        if terrain_dir.name.endswith('-perimeter-v1'):
            return 3
        return 4

    terrain_dir = sorted(terrain_dirs, key=rank)[0]
    naip_dir = _naip_for_key(facility_dir, terrain_dir.name)
    if naip_dir is None:
        return None
    lidar_dir = facility_dir / 'lidar' / terrain_dir.name
    manifest_path = lidar_dir / 'manifest.json'
    chm_path = None
    lidar_status = None
    if manifest_path.is_file():
        manifest = json.loads(manifest_path.read_text())
        lidar_status = manifest.get('status')
        candidate_chm = lidar_dir / 'chm.tif'
        if lidar_status == 'covered' and candidate_chm.is_file():
            chm_path = candidate_chm
    return {
        'terrainDir': terrain_dir, 'naipPath': naip_dir / 'naip.tif', 'demPath': terrain_dir / 'elevation.tiff',
        'chmPath': chm_path, 'lidarStatus': lidar_status,
        'osmPath': _resolve_snapshot(facility_dir, 'osm'), 'contextPath': _resolve_snapshot(facility_dir, 'osm-context'),
        'aoiPath': facility_dir / 'aoi.json' if (facility_dir / 'aoi.json').is_file() else None,
    }


# ---------------------------------------------------------------------------
# Truth extraction


def _way_polygon_or_point(element):
    points = osmlib.way_points(element)
    if len(points) < 3:
        return None
    if points[0] != points[-1]:
        points = points + [points[0]]
    from shapely.geometry import Polygon
    polygon = Polygon(points)
    if polygon.is_empty or not polygon.is_valid or polygon.area <= 0:
        return None
    return polygon


def load_truth(osm_extract, kinds, aoi_polygon_wgs84=None):
    """`{kind: [{'id', 'centroidWgs84', 'geometryWgs84'}]}` for every
    `golf=<kind>` way whose centroid falls inside `aoi_polygon_wgs84` (all
    of it, when the AOI is unavailable -- but every validation course this
    was run against has one)."""
    by_kind = {k: [] for k in kinds}
    excluded = 0
    for element in osm_extract.get('elements', []):
        if element.get('type') != 'way':
            continue
        golf = (element.get('tags') or {}).get('golf')
        if golf not in kinds:
            continue
        polygon = _way_polygon_or_point(element)
        if polygon is None:
            continue
        centroid = (polygon.centroid.x, polygon.centroid.y)
        if aoi_polygon_wgs84 is not None and not aoi_polygon_wgs84.contains(cr.to_shapely({'type': 'Point', 'coordinates': centroid})):
            excluded += 1
            continue
        by_kind[golf].append({'id': f'osm-way-{element["id"]}', 'centroidWgs84': centroid,
                              'geometryWgs84': {'type': 'Polygon', 'coordinates': [[list(p) for p in polygon.exterior.coords]]}})
    return by_kind, excluded


# ---------------------------------------------------------------------------
# Matching / scoring


def _greedy_match(truth_xy, detected_xy, tolerance_m):
    pairs = []
    for ti, t in enumerate(truth_xy):
        for di, d in enumerate(detected_xy):
            dist = ((t[0] - d[0]) ** 2 + (t[1] - d[1]) ** 2) ** 0.5
            if dist <= tolerance_m:
                pairs.append((dist, ti, di))
    pairs.sort()
    used_t, used_d, matches = set(), set(), []
    for dist, ti, di in pairs:
        if ti in used_t or di in used_d:
            continue
        used_t.add(ti)
        used_d.add(di)
        matches.append((ti, di, round(dist, 1)))
    precision = len(matches) / len(detected_xy) if detected_xy else (1.0 if not truth_xy else 0.0)
    recall = len(matches) / len(truth_xy) if truth_xy else None
    return {'truthCount': len(truth_xy), 'detectedCount': len(detected_xy), 'matchedCount': len(matches),
            'precision': round(precision, 4), 'recall': round(recall, 4) if recall is not None else None, 'matches': matches}


def score_greens(truth_greens, detected_greens, epsg):
    truth_xy = [_xy(g['centroidWgs84'], epsg) for g in truth_greens]
    detected_xy = [_xy(g['centroidWgs84'], epsg) for g in detected_greens]
    return _greedy_match(truth_xy, detected_xy, GREEN_MATCH_TOLERANCE_M)


def _xy(centroid_wgs84, epsg):
    point = cr.wgs84_to_epsg(cr.to_shapely({'type': 'Point', 'coordinates': centroid_wgs84}), epsg)
    return (point.x, point.y)


def score_tee_complexes(truth_tees, detected_tees, epsg):
    """Cluster both sides into complexes, then match complexes one-to-one
    when their nearest pair of member centroids is within
    `TEE_COMPLEX_MATCH_TOLERANCE_M` -- see the module docstring for why not
    complex-centroid-to-complex-centroid."""
    truth_clustered = routes.cluster_tee_complexes(
        [{'centroidWgs84': t['centroidWgs84']} for t in truth_tees], epsg, radius_m=TEE_COMPLEX_RADIUS_M)
    detected_clustered = routes.cluster_tee_complexes(
        [{'centroidWgs84': t['centroidWgs84']} for t in detected_tees], epsg, radius_m=TEE_COMPLEX_RADIUS_M)

    def group(clustered):
        groups = {}
        for t in clustered:
            groups.setdefault(t['complexId'], []).append(t['xy'])
        return list(groups.values())

    truth_groups = group(truth_clustered)
    detected_groups = group(detected_clustered)

    pairs = []
    for ti, tg in enumerate(truth_groups):
        for di, dg in enumerate(detected_groups):
            best = min(((tx - dx) ** 2 + (ty - dy) ** 2) ** 0.5 for tx, ty in tg for dx, dy in dg)
            if best <= TEE_COMPLEX_MATCH_TOLERANCE_M:
                pairs.append((best, ti, di))
    pairs.sort()
    used_t, used_d, matches = set(), set(), []
    for dist, ti, di in pairs:
        if ti in used_t or di in used_d:
            continue
        used_t.add(ti)
        used_d.add(di)
        matches.append((ti, di, round(dist, 1)))
    precision = len(matches) / len(detected_groups) if detected_groups else (1.0 if not truth_groups else 0.0)
    recall = len(matches) / len(truth_groups) if truth_groups else None
    return {'truthComplexCount': len(truth_groups), 'detectedComplexCount': len(detected_groups),
            'matchedCount': len(matches), 'precision': round(precision, 4), 'recall': round(recall, 4) if recall is not None else None}


def score_bunkers(truth_bunkers, detected_bunkers, epsg):
    """Greedy IoU matching: each truth bunker paired with its best-IoU
    unmatched detection above `iou_min`. Optional -- see the task brief."""
    iou_min = 0.1
    truth_polys = [cr.wgs84_to_epsg(cr.to_shapely(b['geometryWgs84']), epsg) for b in truth_bunkers]
    detected_polys = [cr.wgs84_to_epsg(cr.to_shapely(b['geometryWgs84']), epsg) for b in detected_bunkers]
    pairs = []
    for ti, tp in enumerate(truth_polys):
        for di, dp in enumerate(detected_polys):
            score = cr.iou(tp, dp)
            if score >= iou_min:
                pairs.append((-score, ti, di))
    pairs.sort()
    used_t, used_d, matches = set(), set(), []
    for neg_score, ti, di in pairs:
        if ti in used_t or di in used_d:
            continue
        used_t.add(ti)
        used_d.add(di)
        matches.append((ti, di, round(-neg_score, 4)))
    mean_iou = round(statistics.mean(m[2] for m in matches), 4) if matches else 0.0
    recall = len(matches) / len(truth_polys) if truth_polys else None
    return {'truthCount': len(truth_polys), 'detectedCount': len(detected_polys), 'matchedCount': len(matches),
            'meanIouOfMatched': mean_iou, 'recall': round(recall, 4) if recall is not None else None}


# ---------------------------------------------------------------------------
# Per-course run


def run_course(course_id, facility_dir, options, score_bunkers_flag=False, overlay_path=None):
    inputs = resolve_facility_inputs(facility_dir)
    if inputs is None:
        return {'courseId': course_id, 'error': 'NO_TERRAIN_OR_NAIP_INPUTS'}
    aoi = json.loads(inputs['aoiPath'].read_text()) if inputs['aoiPath'] else None
    epsg = utm_epsg(*aoi['centroidWgs84']) if aoi else 32617
    boundary = None
    if aoi and aoi.get('polygon'):
        from shapely.geometry import Polygon as _Polygon
        boundary = _Polygon(aoi['polygon'])

    naip, dem, chm = dcs.load_grid(inputs['naipPath'], inputs['demPath'], epsg, chm_path=inputs['chmPath'])
    context = dcs.load_osm_context(inputs['contextPath']) if inputs['contextPath'] else None
    detections = dcs.detect_all(naip, dem, chm=chm, boundary_wgs84=boundary, context_extract=context,
                                 green_options=options.get('green'), tee_options=options.get('tee'), bunker_options=options.get('bunker'))

    osm_extract = osmlib.load_extract(str(inputs['osmPath'])) if inputs['osmPath'] else {'elements': []}
    kinds = ('green', 'tee', 'bunker') if score_bunkers_flag else ('green', 'tee')
    truth, excluded = load_truth(osm_extract, kinds, aoi_polygon_wgs84=boundary)

    green_score = score_greens(truth.get('green', []), detections['greens'], epsg)
    tee_score = score_tee_complexes(truth.get('tee', []), detections['tees'], epsg)
    result = {
        'courseId': course_id, 'lidarStatus': inputs['lidarStatus'], 'truthExcludedOutsideAoi': excluded,
        'greens': green_score, 'teeComplexes': tee_score,
        'detectedCounts': {k: len(v) for k, v in detections.items()},
    }
    if score_bunkers_flag:
        result['bunkers'] = score_bunkers(truth.get('bunker', []), detections['bunkers'], epsg)
    if overlay_path:
        _render_overlay(naip, epsg, detections, truth, overlay_path, course_id, result)
    return result


def _render_overlay(naip, epsg, detections, truth, out_path, course_id, result):
    from PIL import Image, ImageDraw
    from overlay_png import _stretch, _to_pixel
    import numpy as np
    rgb = np.stack([_stretch(naip.array[i]) for i in (0, 1, 2)], axis=-1)
    image = Image.fromarray(rgb, mode='RGB').convert('RGBA')
    draw = ImageDraw.Draw(image)
    colors = {'greens': (60, 220, 60, 255), 'tees': (255, 210, 0, 255), 'bunkers': (255, 60, 60, 255)}
    for kind, dets in detections.items():
        for det in dets:
            polygon = cr.wgs84_to_epsg(cr.to_shapely(det['geometryWgs84']), epsg)
            pixels = [_to_pixel(xy, naip.geotransform) for xy in polygon.exterior.coords]
            draw.line(pixels + [pixels[0]], fill=colors[kind], width=2)
    for kind, color in (('green', (0, 120, 255, 255)), ('tee', (255, 255, 255, 255))):
        for t in truth.get(kind, []):
            x, y = cr.wgs84_to_epsg(cr.to_shapely({'type': 'Point', 'coordinates': t['centroidWgs84']}), epsg).coords[0]
            px, py = _to_pixel((x, y), naip.geotransform)
            r = 5
            draw.ellipse([px - r, py - r, px + r, py + r], outline=color, width=2)
    caption = (f"{course_id} | green recall {result['greens']['recall']} precision {result['greens']['precision']} | "
               f"tee-complex recall {result['teeComplexes']['recall']} precision {result['teeComplexes']['precision']} | "
               f"lidar={result['lidarStatus']}")
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    from PIL import ImageFont
    small_font = ImageFont.load_default(size=13)
    draw.rectangle([0, image.height - 24, image.width, image.height], fill=(0, 0, 0, 170))
    draw.text((6, image.height - 20), caption, fill=(255, 255, 255, 255), font=small_font)
    image.convert('RGB').save(out_path)


# ---------------------------------------------------------------------------
# Tuning / summarizing / CLI


def summarize(rows):
    def stats(values):
        values = [v for v in values if v is not None]
        if not values:
            return {'median': None, 'n': 0}
        return {'median': round(statistics.median(values), 4), 'n': len(values)}

    return {
        'greenRecall': stats([r['greens']['recall'] for r in rows if 'greens' in r]),
        'greenPrecision': stats([r['greens']['precision'] for r in rows if 'greens' in r]),
        'teeComplexRecall': stats([r['teeComplexes']['recall'] for r in rows if 'teeComplexes' in r]),
        'teeComplexPrecision': stats([r['teeComplexes']['precision'] for r in rows if 'teeComplexes' in r]),
    }


TUNE_GRID = {
    'green.seed_percentile': [90.0, 94.0, 97.0],
    'green.grow_percentile': [50.0, 60.0, 70.0, 80.0],
}


def _apply_combo(base_options, combo, keys):
    options = copy.deepcopy(base_options)
    for key, value in zip(keys, combo):
        group, field = key.split('.')
        options.setdefault(group, {})[field] = value
    return options


def tune(courses, base_options):
    keys = list(TUNE_GRID.keys())
    combos = list(itertools.product(*(TUNE_GRID[k] for k in keys)))
    print(f'tuning over {len(combos)} combinations x {len(courses)} course(s)...', file=sys.stderr)
    best_score, best_options, best_rows = -1.0, None, None
    for combo in combos:
        options = _apply_combo(base_options, combo, keys)
        rows = [run_course(c['courseId'], c['facilityDir'], options) for c in courses]
        s = summarize(rows)
        green_r = s['greenRecall']['median'] or 0.0
        green_p = s['greenPrecision']['median'] or 0.0
        tee_r = s['teeComplexRecall']['median'] or 0.0
        score = 0.5 * ((green_r + green_p) / 2) + 0.5 * tee_r
        print(f'  {dict(zip(keys, combo))} -> greenR={green_r} greenP={green_p} teeR={tee_r} score={round(score, 4)}', file=sys.stderr)
        if score > best_score:
            best_score, best_options, best_rows = score, options, rows
    return best_options, best_score, best_rows


def parse_course_spec(spec):
    course_id, facility_dir = spec.split(':', 1)
    return {'courseId': course_id, 'facilityDir': Path(facility_dir)}


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--course', action='append', required=True, help='courseId:facilityDir (repeatable)')
    parser.add_argument('--tune-course', action='append', default=None, help='courseId(s) to tune on; default: every --course')
    parser.add_argument('--freeze-out', type=Path, default=None)
    parser.add_argument('--frozen', type=Path, default=None)
    parser.add_argument('--bunkers', action='store_true')
    parser.add_argument('--overlay-dir', type=Path, default=None)
    parser.add_argument('--out', type=Path, default=None)
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    courses = [parse_course_spec(s) for s in args.course]
    base_options = json.loads(args.frozen.read_text()) if args.frozen else {}

    if args.tune_course:
        tune_ids = set(args.tune_course)
        tune_courses = [c for c in courses if c['courseId'] in tune_ids]
        best_options, best_score, _ = tune(tune_courses, base_options)
        base_options = best_options
        print(f'winning options: {best_options} (score={round(best_score, 4)})', file=sys.stderr)
        if args.freeze_out:
            args.freeze_out.parent.mkdir(parents=True, exist_ok=True)
            args.freeze_out.write_text(json.dumps(base_options, indent=2) + '\n')

    report = {}
    for course in courses:
        overlay_path = (args.overlay_dir / f"{course['courseId']}.png") if args.overlay_dir else None
        result = run_course(course['courseId'], course['facilityDir'], base_options, score_bunkers_flag=args.bunkers, overlay_path=overlay_path)
        report[course['courseId']] = result
        if 'error' in result:
            print(f"{course['courseId']}: {result['error']}", file=sys.stderr)
            continue
        print(f"{course['courseId']}: lidar={result['lidarStatus']} "
              f"green R/P={result['greens']['recall']}/{result['greens']['precision']} "
              f"({result['greens']['matchedCount']}/{result['greens']['truthCount']} matched, {result['greens']['detectedCount']} detected) "
              f"tee-complex R/P={result['teeComplexes']['recall']}/{result['teeComplexes']['precision']} "
              f"({result['teeComplexes']['matchedCount']}/{result['teeComplexes']['truthComplexCount']} matched, {result['teeComplexes']['detectedComplexCount']} detected)",
              file=sys.stderr)

    summary = summarize([r for r in report.values() if 'error' not in r])
    print(f'SUMMARY: {summary}', file=sys.stderr)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps({'options': base_options, 'summary': summary, 'courses': report}, indent=2) + '\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

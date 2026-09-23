#!/usr/bin/env python3
"""Auto-trace a hole's missing fairway from NAIP imagery and a DEM.

This replaces the Claude hand-trace Peek'n Peak Upper's hole 11 needed
(`pilots/peek-n-peak-upper-imagery-traces.json`): for a hole whose package has
no fairway (or, optionally, green/tee), it segments the mown corridor between
tee and green —

  * mown turf: NDVI in a plausible turf band, with low local NDVI texture
    (a crown edge or shadow break-up would raise texture even at similar NDVI);
  * smooth ground: low local DEM-slope roughness;
  * near the route: candidate strength decays with distance from the route
    centerline, so a lawn or a second green that classifies just as strongly
    but sits well off the line needs much stronger class evidence to survive;
  * on the route: the largest connected candidate region — after a small
    morphological opening that drops thin noise bridges — that actually
    touches the hole's route centerline, excluding known greens, tees,
    bunkers and water.

Defaults are calibrated against the Peek'n Peak Upper hole-11 pilot hand
trace (target IoU >= 0.70); a mountain course with house lots hard against
the fairway is a harder case than most, so the NDVI/texture bands here are
deliberately loose and rely on distance decay plus route connectivity to do
the real discrimination. `--roughness-max` in particular is in raw
slope-gradient units and is terrain-scale dependent; retune it per course.

It writes the same `golfhelm-imagery-traces-v1` schema
`prepare-osm-course.py --traces` already consumes (adding `producer` and a
per-trace `confidence`), and never writes a trace below `--confidence-min`;
low-confidence or no-candidate holes are reported instead in the output
document's `report` array so a run is auditable even when it produces zero
usable traces.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union
from shapely import contains_xy as vcontains

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import course_raster as cr  # noqa: E402
from course_crs import origin_epsg  # noqa: E402

SCHEMA = 'golfhelm-imagery-traces-v1'
PRODUCER = 'auto-trace-v1'
TRACEABLE_KINDS = ('fairway', 'tee', 'green')  # kinds prepare-osm-course.py --traces accepts
ROUTE_OVERLAP_MIN_M = 8.0  # prepare-osm-course.py only attaches a fairway that crosses the route by this much

DEFAULTS = {
    'corridor_m': 50.0,
    'ndvi_min': 0.05,
    'ndvi_max': 0.95,
    'texture_max': 0.42,
    'roughness_max': 0.05,
    'turf_threshold': 0.08,
    'decay_m': 52.0,
    'open_radius_m': 3.0,
    'expected_width_m': 32.0,
    'simplify_m': 1.5,
    'confidence_min': 0.55,
}


def _load_json(path):
    return json.loads(Path(path).read_text())


def _features_by_id(package):
    return {f['id']: f for f in package['features']}


def _hole_by_ordinal(package, ordinal):
    for hole in package['holes']:
        if hole['ordinal'] == ordinal:
            return hole
    return None


def missing_kinds(package, hole, by_id=None):
    by_id = by_id or _features_by_id(package)
    have = {by_id[fid]['kind'] for fid in hole['featureIds']}
    return [k for k in TRACEABLE_KINDS if k not in have]


def default_target_holes(package):
    """Ordinals whose package already flags a missing fairway/green/tee."""
    by_id = _features_by_id(package)
    return [hole['ordinal'] for hole in package['holes'] if missing_kinds(package, hole, by_id)]


def _route_geometry(package, hole, by_id):
    route = by_id[hole['routeFeatureId']]
    return route['geometryWgs84']['coordinates']


def _exclusion_union(package, hole, by_id, kinds):
    polys = [cr.to_shapely(by_id[fid]['geometryWgs84']) for fid in hole['featureIds'] if by_id[fid]['kind'] in kinds]
    return unary_union(polys) if polys else None


def turf_score(ndvi, ndvi_texture, ndvi_min, ndvi_max, texture_max):
    """Per-pixel mown-turf likelihood in [0, 1]: peaks mid-band and falls
    toward the NDVI edges, zeroed by NDVI texture a smooth mown corridor
    would not have (a crown edge, a shadow line, a cart path stripe)."""
    center = (ndvi_min + ndvi_max) / 2
    half = (ndvi_max - ndvi_min) / 2
    band_score = np.clip(1 - np.abs(ndvi - center) / half, 0, 1)
    texture_score = np.clip(1 - ndvi_texture / texture_max, 0, 1)
    return band_score * texture_score


def smoothness_score(dem, pixel_m, roughness_max):
    gy, gx = np.gradient(dem, pixel_m[1], pixel_m[0])
    slope = np.hypot(gx, gy)
    roughness = cr.local_std(slope, 5)
    return np.clip(1 - roughness / roughness_max, 0, 1), roughness


def corridor_mask(xs, ys, route_xy, half_width_m):
    line = LineString(route_xy)
    buffered = line.buffer(half_width_m)
    return vcontains(buffered, xs, ys)


def build_trace(package, hole, naip, dem, epsg, options):
    """Segment one hole's fairway candidate. Returns (traceFeature, evidence)
    where traceFeature is None when nothing crosses the confidence bar or no
    connected candidate touches the route; evidence always explains why."""
    by_id = _features_by_id(package)
    route_wgs84 = _route_geometry(package, hole, by_id)
    route_xy = [cr.wgs84_to_epsg(Point(lon, lat), epsg).coords[0] for lon, lat in route_wgs84]
    route_line = LineString(route_xy)

    if naip.array.shape[0] < 4:
        raise ValueError('NAIP raster needs 4 bands (red, green, blue, nir)')
    red, nir = naip.array[0], naip.array[3]
    with np.errstate(divide='ignore', invalid='ignore'):
        ndvi = np.where((nir + red) > 0, (nir - red) / (nir + red), 0.0)
    texture = cr.local_std(ndvi, 5)

    pixel_m = naip.pixel_size()
    smooth, roughness = smoothness_score(dem.array[0], pixel_m, options['roughness_max'])
    turf = turf_score(ndvi, texture, options['ndvi_min'], options['ndvi_max'], options['texture_max'])
    composite = turf * smooth

    xs, ys = naip.xy_grid()
    route_distance = cr.distance_to_geometry(xs, ys, route_line)
    decay = np.clip(1 - route_distance / options['decay_m'], 0, 1) if options['decay_m'] > 0 else np.ones_like(composite)
    weighted = composite * decay

    within_corridor = corridor_mask(xs, ys, route_xy, options['corridor_m'])
    exclusions = _exclusion_union(package, hole, by_id, ('green', 'tee', 'bunker', 'water'))
    excluded = vcontains(cr.wgs84_to_epsg(exclusions, epsg), xs, ys) if exclusions is not None else np.zeros_like(xs, dtype=bool)

    candidate_mask = (weighted >= options['turf_threshold']) & within_corridor & ~excluded
    candidate_mask = cr.binary_opening(candidate_mask, options['open_radius_m'], pixel_m)
    on_route = corridor_mask(xs, ys, route_xy, max(pixel_m[0], pixel_m[1]) * 1.5)
    component = cr.largest_component(candidate_mask, seed_mask=on_route)

    evidence = {'candidatePixels': int(candidate_mask.sum()), 'onRoutePixels': int(on_route.sum())}
    if not component.any():
        return None, {**evidence, 'reason': 'no_connected_candidate_touching_route'}

    merged = cr.polygonize_mask(component, naip.geotransform, epsg)
    if merged is None or merged.is_empty:
        return None, {**evidence, 'reason': 'polygonize_empty'}
    polygon = cr.largest_polygon(merged).buffer(0)
    polygon = polygon.simplify(options['simplify_m'], preserve_topology=True)
    if not polygon.is_valid or polygon.is_empty or polygon.area <= 0:
        return None, {**evidence, 'reason': 'invalid_topology_after_simplify'}

    overlap_length = polygon.intersection(route_line).length
    class_margin = float(weighted[component].mean()) - options['turf_threshold']
    margin_headroom = max(1e-6, 1 - options['turf_threshold'])
    class_score = float(np.clip(class_margin / margin_headroom, 0, 1))
    alignment_score = float(min(1.0, overlap_length / max(route_line.length * 0.6, 1.0)))
    expected_area = route_line.length * options['expected_width_m']
    area_ratio = polygon.area / expected_area if expected_area > 0 else 0.0
    area_score = math.exp(-(math.log(area_ratio) ** 2) / (2 * 0.6 ** 2)) if area_ratio > 0 else 0.0
    confidence = round(max(0.0, min(1.0, 0.40 * class_score + 0.35 * alignment_score + 0.25 * area_score)), 4)

    evidence.update({
        'classMargin': round(class_margin, 4), 'classScore': round(class_score, 4),
        'routeOverlapMeters': round(overlap_length, 2), 'alignmentScore': round(alignment_score, 4),
        'areaRatio': round(area_ratio, 4), 'areaScore': round(area_score, 4),
        'polygonAreaSqm': round(polygon.area, 1), 'confidence': confidence,
    })

    if overlap_length < ROUTE_OVERLAP_MIN_M:
        return None, {**evidence, 'reason': 'route_overlap_below_8m'}
    if confidence < options['confidence_min']:
        return None, {**evidence, 'reason': 'confidence_below_threshold'}

    polygon_wgs84 = cr.epsg_to_wgs84(polygon, epsg)
    ring = [[round(x, 7), round(y, 7)] for x, y in polygon_wgs84.exterior.coords]
    if ring[0] != ring[-1]:
        ring.append(list(ring[0]))
    accuracy = round(max(3.0, pixel_m[0] * 6), 1)
    trace_feature = {
        'id': f'auto-trace-{hole["key"]}-fairway', 'kind': 'fairway', 'holeKey': hole['key'],
        'accuracyMeters': accuracy, 'confidence': confidence, 'producer': PRODUCER,
        'note': f'Auto-traced mown corridor along the route for {hole["key"]} '
                f'(NDVI+DEM segmentation, {PRODUCER}); confidence {confidence}.',
        'coordinatesWgs84': ring,
    }
    return trace_feature, evidence


def _resolve_grid(naip_path, dem_path, epsg):
    naip_native = cr.read_raster(naip_path)
    if naip_native.epsg is None:
        raise ValueError('NAIP raster has no readable CRS')
    naip = naip_native if naip_native.epsg == epsg else cr.warp_to_grid(
        naip_path, epsg, cr.project_geometry(Polygon.from_bounds(*naip_native.bounds()), naip_native.epsg, epsg).bounds,
        naip_native.pixel_size(), resample='bilinear')
    dem = cr.warp_to_grid(dem_path, epsg, naip.bounds(), naip.pixel_size(), resample='bilinear')
    return naip, dem


def _source_block(naip_path):
    raw = Path(naip_path).read_bytes()
    naip = cr.read_raster(naip_path)
    return {
        'provider': 'Locally supplied NAIP raster (see --naip)', 'service': str(naip_path),
        'catalogTiles': [], 'capturedAt': [], 'rasterSha256': hashlib.sha256(raw).hexdigest(),
        'nativeResolutionM': round(naip.pixel_size()[0], 3),
    }


def run(package, holes, naip, dem, options, epsg=None):
    """Segment every requested hole against already-aligned `naip`/`dem`
    rasters (same CRS, grid and pixel size — see `_resolve_grid`)."""
    epsg = epsg or origin_epsg(package)
    features, report = [], []
    for ordinal in holes:
        hole = _hole_by_ordinal(package, ordinal)
        if hole is None:
            report.append({'ordinal': ordinal, 'holeKey': None, 'decision': 'skipped_unknown_hole'})
            continue
        wanted = missing_kinds(package, hole)
        if 'fairway' not in wanted:
            report.append({'ordinal': ordinal, 'holeKey': hole['key'], 'decision': 'skipped_fairway_already_present'})
            continue
        trace, evidence = build_trace(package, hole, naip, dem, epsg, options)
        if trace is None:
            report.append({'ordinal': ordinal, 'holeKey': hole['key'], 'decision': 'skipped_' + evidence.get('reason', 'unknown'), 'evidence': evidence})
            continue
        features.append(trace)
        report.append({'ordinal': ordinal, 'holeKey': hole['key'], 'decision': 'written', 'evidence': evidence})
    return features, report, epsg


def build_document(package, features, report, naip_path):
    return {
        'schemaVersion': 1, 'kind': SCHEMA, 'siteId': package['siteId'],
        'producer': PRODUCER, 'source': _source_block(naip_path),
        'tracer': f'Automated NDVI+DEM corridor segmentation ({PRODUCER}); not a course-supplied vector.',
        'tracedAt': datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
        'meaning': 'Unreviewed source candidates traced where the package has no fairway polygon. '
                   'Each carries a stated horizontal accuracy, a producer confidence, and never counts '
                   'as reviewed geometry.',
        'features': features, 'report': report,
    }


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--layout', required=True, help='Layout id (recorded for the caller; not read from disk here)')
    parser.add_argument('--package', required=True, type=Path, help='Compiled course package JSON (normalized.json)')
    parser.add_argument('--naip', required=True, type=Path, help='4-band (R,G,B,NIR) NAIP GeoTIFF covering the hole corridor')
    parser.add_argument('--dem', required=True, type=Path, help='Single-band elevation GeoTIFF covering the hole corridor')
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--holes', default=None, help='Comma-separated hole ordinals; default: every hole missing a fairway')
    parser.add_argument('--overlay', default=None, type=Path, help='Optional PNG overlay (trace over NAIP) for visual review')
    for key, default in DEFAULTS.items():
        parser.add_argument('--' + key.replace('_', '-'), type=float, default=default)
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    package = _load_json(args.package)
    holes = [int(h) for h in args.holes.split(',')] if args.holes else default_target_holes(package)
    options = {key: getattr(args, key) for key in DEFAULTS}
    epsg = origin_epsg(package)
    naip, dem = _resolve_grid(args.naip, args.dem, epsg)
    features, report, epsg = run(package, holes, naip, dem, options, epsg=epsg)
    doc = build_document(package, features, report, args.naip)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=2) + '\n')
    for row in report:
        print(f"{row.get('holeKey') or row['ordinal']}: {row['decision']}", file=sys.stderr)
    if args.overlay:
        from overlay_png import render_trace_overlay
        render_trace_overlay(naip, epsg, features, package, args.overlay)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

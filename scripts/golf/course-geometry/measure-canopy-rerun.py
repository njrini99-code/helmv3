#!/usr/bin/env python3
"""Measure what a canopy pass re-run out to the context report's hole bounds would change.

`report-unexplained-naip.py` found forest in the report's HOLE_MARGIN_M rim
that `derive-canopy-naip.py` never looked at, because the pass clips its groups
to each hole's features ± CONTEXT_MARGIN_M while the report's bounds run to
the compiled mesh ± HOLE_MARGIN_M. The pixel count is an upper bound; this
script measures the real answer by running the pass's own rules (same raster,
same thresholds, morphology, minimum group size, smoothing and simplification)
with the report's hole bounds as the clip box, then recomputing every hole's
uncertain share with the old woods swapped for the re-run regions.

Measurement only: nothing is written outside <out-dir>, no package, layer or
fixture changes. Doing it for real means a new package hash (woods are package
features), recompiled terrain and a full re-verification — an owner decision.

It first replays the pass with its own boxes and compares per-hole region area
with the retained canopy review, so a rule drift would show up as a
difference; a review derived from an earlier package revision explains small
per-hole differences (surface mask, feature boxes) and is reported as such.

Usage:
  python3 scripts/golf/course-geometry/measure-canopy-rerun.py \
    <package.json> <context.json> <context-report.json> <canopy-review.json> \
    <compiled-dir> <terrain-source-dir> <naip-dir> <out-dir> [--fixture=<path.json>]
"""
import argparse
import gzip
import importlib.util
import json
from pathlib import Path

import numpy as np
import pyproj
from osgeo import gdal
from PIL import Image, ImageDraw
from scipy import ndimage
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

gdal.UseExceptions()
HERE = Path(__file__).resolve().parent


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


canopy = load_module('derive_canopy_naip', HERE / 'derive-canopy-naip.py')
prepare = load_module('prepare_context_layer', HERE / 'prepare-context-layer.py')
GATE = .15
NOT_COVERING = ('fence', 'lift_line', 'wall')


def read_json(path):
    raw = path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix == '.gz' else raw)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('package', type=Path)
    parser.add_argument('context', type=Path)
    parser.add_argument('report', type=Path)
    parser.add_argument('canopy_review', type=Path)
    parser.add_argument('compiled', type=Path)
    parser.add_argument('terrain_source', type=Path)
    parser.add_argument('naip_directory', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--fixture', type=Path, default=None, help='also retain the measurement JSON here (read by build-context-prompt-sheet.py)')
    args = parser.parse_args()

    pkg = read_json(args.package)
    context = read_json(args.context)
    report = read_json(args.report)
    review = read_json(args.canopy_review)
    export = read_json(args.terrain_source / 'export.json')
    manifest = read_json(args.compiled / 'asset-manifest.json')
    if context['packageHash'] != pkg['contentHash'] or report['packageHash'] != pkg['contentHash'] or report['layerHash'] != context['contentHash']:
        raise SystemExit('context layer / report belong to another package or layer revision')
    if manifest['geometryHash'] != pkg['contentHash']:
        raise SystemExit('compiled terrain belongs to another package revision')
    extent, width, height = export['extent'], export['width'], export['height']
    naip_manifest = canopy.acquire(args.naip_directory, extent, (width, height))
    local = prepare.make_local(pkg['originWgs84'])
    project = pyproj.Transformer.from_crs(4326, 32617, always_xy=True)
    unproject = pyproj.Transformer.from_crs(32617, 4326, always_xy=True)
    px_x = (extent['xmax'] - extent['xmin']) / width
    px_y = (extent['ymax'] - extent['ymin']) / height

    def to_pixel(lon, lat):
        x, y = project.transform(lon, lat)
        return (x - extent['xmin']) / px_x, (extent['ymax'] - y) / px_y

    # --- the pass, as derive-canopy-naip.main runs it ---
    bands = gdal.Open(str(args.naip_directory / 'naip.tif')).ReadAsArray().astype(float)
    red, nir = bands[0], bands[3]
    ndvi = (nir - red) / (nir + red + 1e-6)
    cache = args.naip_directory / f"texture-std7-{naip_manifest['rasterSha256'][:12]}.npy"
    if cache.exists():
        texture = np.load(cache)
    else:
        texture = ndimage.generic_filter(nir, np.std, size=7)
        np.save(cache, texture)
    shapes = {}
    surface = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(surface)
    for feature in pkg['features']:
        geometry = feature['geometryWgs84']
        if geometry['type'] == 'LineString':
            shapes[feature['id']] = LineString([project.transform(*p) for p in geometry['coordinates']])
            continue
        if feature['kind'] == 'woods':
            continue
        shapes[feature['id']] = Polygon([project.transform(*p) for p in geometry['coordinates'][0]])
        draw.polygon([to_pixel(*p) for p in geometry['coordinates'][0]], fill=255)
    masked = ndimage.binary_dilation(np.array(surface) > 0, iterations=canopy.SURFACE_BUFFER_PX)
    # The gate the retained review was made with (per-export since the
    # calibration landed; older reviews recorded the fixed ceiling).
    ndvi_min = (review.get('method') or {}).get('ndviMin', canopy.NDVI_MIN)
    mask = canopy.classify(ndvi, texture, masked, ndvi_min)
    transform = (extent['xmin'], px_x, 0, extent['ymax'], 0, -px_y)
    groups = canopy.polygonize(mask, transform)
    canopy_union = unary_union([g for g in groups if g.area >= canopy.MIN_GROUP_M2])

    def regions_for(clip):
        """The pass's per-hole smoothing and simplification, in raster CRS."""
        clipped = canopy_union.intersection(clip).buffer(6, join_style='round').buffer(-8, join_style='round').buffer(2, join_style='round')
        out = []
        for part in sorted(getattr(clipped, 'geoms', [clipped]), key=lambda g: -g.area):
            if part.is_empty or part.geom_type != 'Polygon' or part.area < canopy.MIN_GROUP_M2:
                continue
            simple = part.simplify(2.0, preserve_topology=True)
            if len(simple.exterior.coords) > 400:
                simple = part.simplify(4.0, preserve_topology=True)
            if simple.is_empty or not simple.is_valid or simple.area < canopy.MIN_GROUP_M2:
                continue
            out.append(simple)
        return out

    def enu_to_wgs84(e, n):
        """Numeric inverse of make_local (three Newton steps; millimetres at course extents)."""
        lon, lat = pkg['originWgs84']
        for _ in range(3):
            cur = local([lon, lat])
            per_lon = (local([lon + 1e-4, lat])[0] - cur[0]) / 1e-4
            per_lat = (local([lon, lat + 1e-4])[1] - cur[1]) / 1e-4
            lon += (e - cur[0]) / per_lon
            lat += (n - cur[1]) / per_lat
        return lon, lat

    # --- (a) replay with the pass's own boxes against the retained review ---
    review_area = {}
    today_regions = {}
    for region in review['regions']:
        review_area[region['holeKey']] = review_area.get(region['holeKey'], 0) + region['areaM2']
    check = {}
    for hole in pkg['holes']:
        own = [shapes[i] for i in hole['featureIds'] if i in shapes]
        minx, miny, maxx, maxy = unary_union(own).bounds
        reach = canopy.CONTEXT_MARGIN_M
        today_regions[hole['key']] = regions_for(box(minx - reach, miny - reach, maxx + reach, maxy + reach))
        mine = sum(r.area for r in today_regions[hole['key']])
        check[hole['key']] = (round(mine), round(review_area.get(hole['key'], 0)))
    differences = {k[-2:]: {'replay': v[0], 'review': v[1]} for k, v in check.items() if abs(v[0] - v[1]) > 1}
    reproduction = {'reviewPackageHash': review['packageHash'], 'currentPackageHash': pkg['contentHash'],
                    'holesExact': len(check) - len(differences), 'differences': differences,
                    'note': 'a review derived from an earlier package revision differs in its surface mask and feature boxes; identical hashes must agree exactly'}
    if review['packageHash'] == pkg['contentHash'] and differences:
        raise SystemExit(f'replay differs from the retained canopy review on the same package: {differences}')

    # --- (b) the report's hole bounds as clip boxes ---
    hole_bounds = {}
    for key, entry in manifest['holes'].items():
        mesh = read_json(args.compiled / entry['fileName'])
        xs, ys = mesh['vertices'][0::3], mesh['vertices'][1::3]
        m = prepare.HOLE_MARGIN_M
        hole_bounds[key] = box(min(xs) - m, min(ys) - m, max(xs) + m, max(ys) + m)
    rerun = {}
    for key, bounds in hole_bounds.items():
        minx, miny, maxx, maxy = bounds.bounds
        pts = [project.transform(*enu_to_wgs84(e, n)) for e, n in ((minx, miny), (maxx, miny), (maxx, maxy), (minx, maxy))]
        # The local frame and UTM are rotated by the grid convergence, so clip to the envelope of the four corners.
        clip = box(min(p[0] for p in pts) - 1, min(p[1] for p in pts) - 1, max(p[0] for p in pts) + 1, max(p[1] for p in pts) + 1)
        rerun[key] = regions_for(clip)
    def to_local(poly):
        # Exterior ring only, as derive-canopy-naip.py writes its regions.
        return Polygon([local(list(unproject.transform(x, y))) for x, y in poly.exterior.coords])

    surfaces = unary_union([s for s in shapes.values() if s.geom_type == 'Polygon'])

    def clearings(regions_by_hole):
        """Ground enclosed by a group: the pass carries it as woods because it writes exterior rings only."""
        rings = [Polygon(ring) for regions in regions_by_hole.values() for r in regions for ring in r.interiors]
        enclosed = unary_union(rings) if rings else Polygon()
        return {'rings': len(rings), 'm2': round(enclosed.area), 'openM2': round(enclosed.difference(surfaces).area)}

    new_woods = unary_union([to_local(r) for regions in rerun.values() for r in regions])
    old_woods = unary_union([Polygon([local(p) for p in f['geometryWgs84']['coordinates'][0]]) for f in pkg['features'] if f['kind'] == 'woods'])

    # --- the report's covers with the woods swapped ---
    package_shapes = []
    for feature in pkg['features']:
        raw = feature['geometryWgs84']
        if raw['type'] == 'LineString' or feature['kind'] == 'woods':
            continue
        parts = [raw['coordinates']] if raw['type'] == 'Polygon' else raw['coordinates']
        for rings in parts:
            shape = Polygon([local(p) for p in rings[0]], [[local(p) for p in r] for r in rings[1:]])
            if shape.is_valid and not shape.is_empty:
                package_shapes.append((feature['kind'], shape))
    playing = unary_union([shape for kind, shape in package_shapes if kind in ('fairway', 'green', 'tee', 'bunker')])
    bands_derived = (playing.buffer(prepare.ROUGH_PRIMARY_M), playing.buffer(prepare.ROUGH_SECONDARY_M))
    zones = []
    for zone in context['zones']:
        raw = zone['geometryWgs84']
        if raw['type'] == 'LineString':
            footprint = LineString([local(p) for p in raw['coordinates']]).buffer(zone['attributes'].get('widthM', 1) / 2)
        else:
            footprint = Polygon([local(p) for p in raw['coordinates'][0]], [[local(p) for p in r] for r in raw['coordinates'][1:]])
        zones.append((zone, footprint))
    report_by_hole = {h['key']: h for h in report['holes']}
    rows = []
    for hole in sorted(pkg['holes'], key=lambda h: h['ordinal']):
        key = hole['key']
        bounds = hole_bounds[key]
        covers = [p for p in (shape.intersection(bounds) for _, shape in package_shapes) if not p.is_empty]
        covers += [p for p in (b.intersection(bounds) for b in bands_derived) if not p.is_empty]
        for zone, footprint in zones:
            if key not in zone['holeKeys'] or zone['class'] in NOT_COVERING:
                continue
            part = footprint.intersection(bounds)
            if not part.is_empty:
                covers.append(part)
        base = unary_union(covers)
        today = max(0.0, 1 - unary_union([base, old_woods.intersection(bounds)]).area / bounds.area)
        if round(today, 3) != report_by_hole[key]['uncertainShare']:
            raise SystemExit(f'{key}: rebuilt uncertain share {today:.4f} != report {report_by_hole[key]["uncertainShare"]}')
        after = max(0.0, 1 - unary_union([base, new_woods.intersection(bounds)]).area / bounds.area)
        rows.append({'key': key, 'ordinal': hole['ordinal'], 'uncertainShare': round(today, 3), 'uncertainShareRerun': round(after, 3),
                     'gate': 'pass' if today < GATE else 'fail', 'gateRerun': 'pass' if after < GATE else 'fail',
                     'woodsM2': round(old_woods.intersection(bounds).area), 'woodsM2Rerun': round(new_woods.intersection(bounds).area),
                     'regions': sum(1 for r in review['regions'] if r['holeKey'] == key), 'regionsRerun': len(rerun[key])})
    passing = {'today': sum(1 for r in rows if r['gate'] == 'pass'), 'rerun': sum(1 for r in rows if r['gateRerun'] == 'pass')}
    result = {'kind': 'golfhelm-canopy-rerun-measurement-v1', 'siteId': pkg['siteId'], 'packageHash': pkg['contentHash'], 'layerHash': context['contentHash'],
              'rasterSha256': naip_manifest['rasterSha256'],
              'clip': f'context report hole bounds (compiled mesh ± {prepare.HOLE_MARGIN_M} m) instead of features ± {canopy.CONTEXT_MARGIN_M} m; every other rule of derive-canopy-naip.py unchanged',
              'replayAgainstRetainedReview': reproduction, 'holesPassingGate': passing,
              'woodsUnionM2': {'today': round(old_woods.area), 'rerun': round(new_woods.area)},
              'regions': {'today': len(review['regions']), 'rerun': sum(len(v) for v in rerun.values())},
              'clearings': {'todayReplay': clearings(today_regions), 'rerun': clearings(rerun),
                            'note': ('derive-canopy-naip.py writes each region as its exterior ring, so ground a group encloses is carried as woods '
                                     '(today as much as after a re-run); rings are counted per region, areas are unions in the raster CRS, '
                                     'openM2 is the part no package surface covers')},
              'meaning': 'Measurement only. Doing this for real changes the package hash (woods are package features), the compiled terrain and every downstream hash.',
              'holes': rows}
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'canopy-rerun-measurement.json').write_text(json.dumps(result, indent=1) + '\n')
    if args.fixture:
        args.fixture.write_text(json.dumps(result, indent=1) + '\n')
    diff_note = ('exact on all 18 holes' if not differences else
                 f"exact on {reproduction['holesExact']} of 18 holes; " + ', '.join(f"{k}: {v['replay'] - v['review']:+d} m²" for k, v in differences.items())
                 + f" (the retained review was derived from package `{review['packageHash'][:12]}`, this package is `{pkg['contentHash'][:12]}`: its surface mask and feature boxes differ, the rules do not)")
    lines = ['# Canopy pass re-run to the hole bounds — measurement', '',
             (f"Same raster (`{naip_manifest['rasterSha256'][:12]}`), same rules; only the clip box changes: {result['clip']}. "
              f"Replay with the pass's own boxes against the retained canopy review: {diff_note}."), '',
             '| Hole | unexplained today | after re-run | gate today | gate after | woods ha today | after | regions today → after |', '|---|---|---|---|---|---|---|---|']
    for r in rows:
        lines.append(f"| {r['ordinal']} | {r['uncertainShare'] * 100:.1f} % | {r['uncertainShareRerun'] * 100:.1f} % | {r['gate']} | {r['gateRerun']} | "
                     f"{r['woodsM2'] / 1e4:.1f} | {r['woodsM2Rerun'] / 1e4:.1f} | {r['regions']} → {r['regionsRerun']} |")
    lines += ['', (f"Holes under the {GATE * 100:.0f} % gate: {passing['today']} today → {passing['rerun']} after the re-run "
                   f"({', '.join(str(r['ordinal']) for r in rows if r['gateRerun'] == 'pass')}). Woods union {old_woods.area / 1e4:.1f} ha → {new_woods.area / 1e4:.1f} ha; "
                   f"regions {result['regions']['today']} → {result['regions']['rerun']}. {result['meaning']}"), '',
             (f"Enclosed ground: the pass writes exterior rings only, so clearings inside a group are carried as woods — replayed today "
              f"{result['clearings']['todayReplay']['rings']} rings / {result['clearings']['todayReplay']['m2'] / 1e4:.1f} ha "
              f"({result['clearings']['todayReplay']['openM2'] / 1e4:.1f} ha not under any package surface), after the re-run "
              f"{result['clearings']['rerun']['rings']} rings / {result['clearings']['rerun']['m2'] / 1e4:.1f} ha "
              f"({result['clearings']['rerun']['openM2'] / 1e4:.1f} ha open). Keeping the rings means the review schema and its readers carry interior rings, at the same new-hash cost as the re-run."), '']
    (args.output / 'canopy-rerun-measurement.md').write_text('\n'.join(lines))
    print(json.dumps({k: v for k, v in result.items() if k not in ('holes', 'meaning', 'clip')}))


if __name__ == '__main__':
    main()

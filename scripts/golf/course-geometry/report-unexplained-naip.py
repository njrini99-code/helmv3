#!/usr/bin/env python3
"""What the unexplained context ground looks like in NAIP (report only).

The context report (`prepare-context-layer.py`) measures, per hole, the share
of the drawn context that no source or rule explains: hole bounds (compiled
mesh ± HOLE_MARGIN_M) minus the package polygons, the derived rough bands and
the context zone footprints. That share is the §35 gate (< 15 %) and the §39
human pass is what moves it. This script puts evidence in front of that pass:
it rebuilds exactly the same unexplained ground (and refuses to run unless the
rebuilt share matches the retained report on every hole), then classifies the
leaf-on NAIP pixels inside it with thresholds calibrated on the package's own
surfaces in the same raster (fairways for mown turf, woods for canopy, water
for water) and reports, per hole, how much of the unexplained ground is
canopy, meadow, mown turf, bare ground / hardscape or dark (water, shadow).

It changes nothing: no zone is created, the layer and package hashes are
untouched, and the what-if table is an upper bound on what a *new*
source-backed derivation could explain — the review sidecar
(`apply-review-adjustments.py`) only accepts, adjusts or rejects zones that
already exist; explaining this ground needs a new `derived` zone (design step 4).

Outputs (in <out-dir>): `unexplained-naip.json`, `unexplained-naip.md`, one
`hNN-unexplained.png` overlay per hole (NAIP RGB, explained ground dimmed,
unexplained ground tinted by class) and `contact-sheet.png`. `--fixture=<path>`
also writes the small per-hole JSON (no pixels) for the prompt sheet.

Usage:
  python3 scripts/golf/course-geometry/report-unexplained-naip.py \
    <package.json> <context.json> <context-report.json> <compiled-dir> \
    <terrain-source-dir> <naip-dir> <out-dir> [--fixture=<path.json>]
"""
import argparse
import gzip
import hashlib
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pyproj
import shapely
from osgeo import gdal
from PIL import Image, ImageDraw
from scipy import ndimage
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

gdal.UseExceptions()
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('prepare_context_layer', HERE / 'prepare-context-layer.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
spec = importlib.util.spec_from_file_location('derive_canopy_naip', HERE / 'derive-canopy-naip.py')
canopy_pass = importlib.util.module_from_spec(spec)
spec.loader.exec_module(canopy_pass)

GATE = .15
# Same canopy definition as derive-canopy-naip.py, so "canopy" here means
# "would have passed that pass's pixel test".
NDVI_CANOPY = canopy_pass.NDVI_MIN
TEXTURE_CANOPY = canopy_pass.TEXTURE_MIN
TEXTURE_WINDOW = 7
CLASSES = ('canopy', 'meadow', 'turf', 'bare', 'dark')
LABELS = {'canopy': 'canopy (NDVI > .28, NIR texture > 10.5)', 'meadow': 'meadow / long grass (NDVI > .28, smooth)',
          'turf': 'mown turf (fairway-like NDVI)', 'bare': 'bare ground / hardscape (soil, sand, gravel, roofs, asphalt)',
          'dark': 'dark (water, deep shadow)'}
TINT = {'canopy': (0, 96, 24), 'meadow': (150, 220, 0), 'turf': (255, 235, 0), 'bare': (255, 48, 200), 'dark': (40, 120, 255)}
NOT_COVERING = ('fence', 'lift_line', 'wall')  # counted by the report, never a cover
SCENARIOS = [
    ('canopy', ('canopy',), 'every canopy pixel explained (upper bound for a canopy pass re-run out to the hole bounds: its group size and smoothing rules would keep less; a new package hash)'),
    ('turf', ('turf',), 'mown turf beyond the derived bands counted as explained'),
    ('turf+meadow', ('turf', 'meadow'), 'every smooth vegetation pixel counted as explained (open field / native rule)'),
    ('vegetation', ('turf', 'meadow', 'canopy'), 'all vegetation explained (canopy groups extended to the hole bounds too)'),
    ('all-but-bare', ('turf', 'meadow', 'canopy', 'dark'), 'everything but bare ground / hardscape explained'),
]


def read_json(path):
    raw = path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix == '.gz' else raw)


def polygon_local(local, coordinates):
    return Polygon([local(p) for p in coordinates[0]], [[local(p) for p in ring] for ring in coordinates[1:]])


def enu_grid(export, origin):
    """Pixel centres of the NAIP export in the package's local ENU frame (numpy twin of `make_local`)."""
    extent, width, height = export['extent'], export['width'], export['height']
    px_x = (extent['xmax'] - extent['xmin']) / width
    px_y = (extent['ymax'] - extent['ymin']) / height
    xs = extent['xmin'] + (np.arange(width) + .5) * px_x
    ys = extent['ymax'] - (np.arange(height) + .5) * px_y
    grid_x, grid_y = np.meshgrid(xs, ys)
    epsg = extent['spatialReference']['wkid']
    lon, lat = pyproj.Transformer.from_crs(epsg, 4326, always_xy=True).transform(grid_x.ravel(), grid_y.ravel())

    def ecef(lon_deg, lat_deg):
        lon_r, lat_r = np.radians(lon_deg), np.radians(lat_deg)
        e2 = 6.6943799901413165e-3
        n = 6378137 / np.sqrt(1 - e2 * np.sin(lat_r) ** 2)
        return n * np.cos(lat_r) * np.cos(lon_r), n * np.cos(lat_r) * np.sin(lon_r), n * (1 - e2) * np.sin(lat_r)

    ox, oy, oz = ecef(origin[0], origin[1])
    o_lon, o_lat = np.radians(origin[0]), np.radians(origin[1])
    px, py, pz = ecef(lon, lat)
    dx, dy, dz = px - ox, py - oy, pz - oz
    east = -np.sin(o_lon) * dx + np.cos(o_lon) * dy
    north = -np.sin(o_lat) * np.cos(o_lon) * dx - np.sin(o_lat) * np.sin(o_lon) * dy + np.cos(o_lat) * dz
    return east.reshape(height, width), north.reshape(height, width), px_x * px_y


def texture_for(naip_dir, nir, raster_sha):
    cache = naip_dir / f'texture-std{TEXTURE_WINDOW}-{raster_sha[:12]}.npy'
    if cache.exists():
        return np.load(cache)
    texture = ndimage.generic_filter(nir, np.std, size=TEXTURE_WINDOW)
    np.save(cache, texture)
    return texture


class Sampler:
    def __init__(self, east, north):
        self.east, self.north = east, north

    def mask(self, geom):
        """Boolean raster of pixel centres inside `geom` (holes respected)."""
        out = np.zeros(self.east.shape, dtype=bool)
        if geom.is_empty:
            return out
        shapely.prepare(geom)
        minx, miny, maxx, maxy = geom.bounds
        window = (self.east >= minx) & (self.east <= maxx) & (self.north >= miny) & (self.north <= maxy)
        out[window] = shapely.contains_xy(geom, self.east[window], self.north[window])
        return out


def percentiles(values, points):
    return [round(float(v), 3) for v in np.percentile(values, points)] if values.size else None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('package', type=Path)
    parser.add_argument('context', type=Path)
    parser.add_argument('report', type=Path)
    parser.add_argument('compiled', type=Path, help='compiled terrain directory (asset-manifest.json + <hole>-terrain.json[.gz])')
    parser.add_argument('terrain_source', type=Path, help='terrain source directory (export.json names the NAIP export window)')
    parser.add_argument('naip_directory', type=Path, help='retained NAIP export (naip.tif + manifest.json)')
    parser.add_argument('output', type=Path)
    parser.add_argument('--fixture', type=Path, default=None, help='also write the per-hole summary JSON here (for build-context-prompt-sheet.py)')
    args = parser.parse_args()

    pkg = read_json(args.package)
    context = read_json(args.context)
    report = read_json(args.report)
    if context['packageHash'] != pkg['contentHash'] or report['packageHash'] != pkg['contentHash']:
        raise SystemExit('context layer / report belong to another package revision')
    if report['layerHash'] != context['contentHash']:
        raise SystemExit('context report belongs to another context layer revision')
    manifest = read_json(args.compiled / 'asset-manifest.json')
    if manifest['geometryHash'] != pkg['contentHash']:
        raise SystemExit('compiled terrain belongs to another package revision')
    naip_manifest = read_json(args.naip_directory / 'manifest.json')
    raster_path = args.naip_directory / 'naip.tif'
    raster_sha = hashlib.sha256(raster_path.read_bytes()).hexdigest()
    if raster_sha != naip_manifest['rasterSha256']:
        raise SystemExit('naip.tif does not match its retained manifest hash')
    export = read_json(args.terrain_source / 'export.json')
    if naip_manifest['request']['size'] != f"{export['width']},{export['height']}":
        raise SystemExit('NAIP export window does not match the terrain export')

    local = prepare.make_local(pkg['originWgs84'])
    margin = prepare.HOLE_MARGIN_M

    # --- the report's ground, rebuilt (same rules, same order) ---
    hole_bounds = {}
    for key, entry in manifest['holes'].items():
        mesh = read_json(args.compiled / entry['fileName'])
        xs, ys = mesh['vertices'][0::3], mesh['vertices'][1::3]
        hole_bounds[key] = box(min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin)
    package_shapes = []
    for feature in pkg['features']:
        raw = feature['geometryWgs84']
        if raw['type'] == 'LineString':
            continue
        parts = [raw['coordinates']] if raw['type'] == 'Polygon' else raw['coordinates']
        for rings in parts:
            shape = polygon_local(local, rings)
            if shape.is_valid and not shape.is_empty:
                package_shapes.append((feature['kind'], feature, shape))
    playing = unary_union([shape for kind, _, shape in package_shapes if kind in ('fairway', 'green', 'tee', 'bunker')])
    bands_derived = (playing.buffer(prepare.ROUGH_PRIMARY_M), playing.buffer(prepare.ROUGH_SECONDARY_M))
    zones = []
    for zone in context['zones']:
        raw = zone['geometryWgs84']
        if raw['type'] == 'LineString':
            footprint = LineString([local(p) for p in raw['coordinates']]).buffer(zone['attributes'].get('widthM', 1) / 2)
        else:
            footprint = polygon_local(local, raw['coordinates'])
        zones.append((zone, footprint))

    # The canopy pass clipped its groups to each hole's own feature box ± its
    # context margin; canopy beyond the union of those boxes was never offered.
    canopy_reach = []
    for hole in pkg['holes']:
        own = []
        for feature in pkg['features']:
            if feature['id'] not in hole['featureIds'] or feature['kind'] == 'woods':
                continue
            raw = feature['geometryWgs84']
            own.append(LineString([local(p) for p in raw['coordinates']]) if raw['type'] == 'LineString' else polygon_local(local, raw['coordinates']))
        minx, miny, maxx, maxy = unary_union(own).bounds
        reach = canopy_pass.CONTEXT_MARGIN_M
        canopy_reach.append(box(minx - reach, miny - reach, maxx + reach, maxy + reach))
    canopy_reach = unary_union(canopy_reach)

    report_by_hole = {h['key']: h for h in report['holes']}
    unexplained = {}
    woods_union = unary_union([shape for kind, _, shape in package_shapes if kind == 'woods'])
    for hole in pkg['holes']:
        key = hole['key']
        bounds = hole_bounds[key]
        covers = []
        for kind, _, shape in package_shapes:
            part = shape.intersection(bounds)
            if not part.is_empty:
                covers.append(part)
        for band in bands_derived:
            part = band.intersection(bounds)
            if not part.is_empty:
                covers.append(part)
        for zone, footprint in zones:
            if key not in zone['holeKeys'] or zone['class'] in NOT_COVERING:
                continue
            part = footprint.intersection(bounds)
            if not part.is_empty:
                covers.append(part)
        covered = unary_union(covers) if covers else box(0, 0, 0, 0)
        share = max(0.0, 1 - covered.area / bounds.area)
        expected = report_by_hole[key]['uncertainShare']
        if round(share, 3) != expected:
            raise SystemExit(f'{key}: rebuilt uncertain share {share:.4f} != report {expected} — the ground being classified is not the gate\'s ground')
        unexplained[key] = {'bounds': bounds, 'ground': bounds.difference(covered), 'share': share,
                            'woodsUnionShare': woods_union.intersection(bounds).area / bounds.area}

    # --- raster ---
    dataset = gdal.Open(str(raster_path))
    bands = dataset.ReadAsArray().astype(float)
    red, green, blue, nir = bands[0], bands[1], bands[2], bands[3]
    ndvi = (nir - red) / (nir + red + 1e-6)
    texture = texture_for(args.naip_directory, nir, raster_sha)
    east, north, pixel_m2 = enu_grid(export, pkg['originWgs84'])
    sampler = Sampler(east, north)

    # Calibration on the package's own surfaces, away from their edges.
    references = {}
    for kind, inset in (('fairway', 1.5), ('green', 1.5), ('tee', 1.5), ('bunker', 1.5), ('water', 3), ('woods', 3)):
        shape = unary_union([s for k, _, s in package_shapes if k == kind]).buffer(-inset)
        mask = sampler.mask(shape)
        references[kind] = {'pixels': int(mask.sum()), 'ndvi': percentiles(ndvi[mask], [5, 25, 50, 75, 95]),
                            'nir': percentiles(nir[mask], [5, 50, 95]), 'texture': percentiles(texture[mask], [25, 50, 75])}
    fairway_mask = sampler.mask(unary_union([s for k, _, s in package_shapes if k == 'fairway']).buffer(-1.5))
    water_mask = sampler.mask(unary_union([s for k, _, s in package_shapes if k == 'water']).buffer(-3))
    turf_floor = round(float(np.percentile(ndvi[fairway_mask], 5)) - .02, 2)
    water_nir_max = round(2 * float(np.median(nir[water_mask])), 0)
    water_ndvi_max = .05

    def classify(mask):
        v_ndvi, v_tex, v_nir = ndvi[mask], texture[mask], nir[mask]
        canopy = (v_ndvi > NDVI_CANOPY) & (v_tex > TEXTURE_CANOPY)
        meadow = (v_ndvi > NDVI_CANOPY) & ~canopy
        turf = (v_ndvi <= NDVI_CANOPY) & (v_ndvi >= turf_floor)
        dark = (v_ndvi < turf_floor) & (v_nir < water_nir_max) & (v_ndvi < water_ndvi_max)
        bare = (v_ndvi < turf_floor) & ~dark
        return {'canopy': canopy, 'meadow': meadow, 'turf': turf, 'bare': bare, 'dark': dark}

    # --- per hole ---
    stretch_lo, stretch_hi = np.percentile(np.stack([red, green, blue], -1), [2, 98])
    rgb8 = np.clip((np.stack([red, green, blue], -1) - stretch_lo) / (stretch_hi - stretch_lo) * 255, 0, 255).astype(np.uint8)
    args.output.mkdir(parents=True, exist_ok=True)
    reach_mask = sampler.mask(canopy_reach)
    holes_out, tiles = [], []
    for hole in sorted(pkg['holes'], key=lambda h: h['ordinal']):
        key, n = hole['key'], hole['ordinal']
        entry = unexplained[key]
        bounds_mask = sampler.mask(entry['bounds'])
        ground_mask = sampler.mask(entry['ground'])
        pixels = int(ground_mask.sum())
        vector_m2 = entry['ground'].area
        classes = classify(ground_mask)
        counts = {name: int(sel.sum()) for name, sel in classes.items()}
        shares = {name: (counts[name] / pixels if pixels else 0.0) for name in CLASSES}
        canopy_idx = np.flatnonzero(ground_mask)[classes['canopy']]
        beyond_reach = int((~reach_mask.ravel()[canopy_idx]).sum())
        scenario_out = {}
        for name, explained, _ in SCENARIOS:
            explained_share = sum(shares[c] for c in explained)
            remaining = entry['share'] * (1 - explained_share)
            scenario_out[name] = {'uncertainShare': round(remaining, 3), 'gate': 'pass' if remaining < GATE else 'fail'}
        holes_out.append({
            'key': key, 'ordinal': n, 'contextBoundsM2': round(entry['bounds'].area), 'uncertainShare': round(entry['share'], 3),
            'unexplainedM2': round(vector_m2), 'unexplainedPixels': pixels, 'pixelM2': round(pixel_m2, 3),
            'rasterVectorDelta': round(pixels * pixel_m2 / vector_m2 - 1, 4) if vector_m2 else None,
            'woodsUnionShare': round(entry['woodsUnionShare'], 3),
            'classes': {name: {'pixels': counts[name], 'share': round(shares[name], 3), 'm2': round(shares[name] * vector_m2)} for name in CLASSES},
            'canopy': {'beyondCanopyPassReach': beyond_reach, 'rejectedByCanopyPass': counts['canopy'] - beyond_reach},
            'scenarios': scenario_out,
        })
        # Overlay: the hole bounds window, explained ground dimmed, unexplained tinted.
        rows, cols = np.nonzero(bounds_mask)
        r0, r1, c0, c1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
        tile = rgb8[r0:r1, c0:c1].astype(float)
        explained = bounds_mask[r0:r1, c0:c1] & ~ground_mask[r0:r1, c0:c1]
        tile[explained] *= .42
        tile[~bounds_mask[r0:r1, c0:c1]] *= .25
        labels = np.full(ground_mask.shape, -1, dtype=np.int8)
        ground_idx = np.flatnonzero(ground_mask)
        for i, name in enumerate(CLASSES):
            labels.ravel()[ground_idx[classes[name]]] = i
        for i, name in enumerate(CLASSES):
            sel = labels[r0:r1, c0:c1] == i
            tile[sel] = tile[sel] * .45 + np.array(TINT[name], dtype=float) * .55
        image = Image.fromarray(tile.astype(np.uint8))
        legend = Image.new('RGB', (image.width, 58), (16, 16, 16))
        draw = ImageDraw.Draw(legend)
        draw.text((6, 4), f"Hole {n}  unexplained {entry['share'] * 100:.1f} % of {entry['bounds'].area / 1e4:.1f} ha  ({vector_m2 / 1e4:.1f} ha)", fill=(240, 240, 240))
        x = 6
        for name in CLASSES:
            draw.rectangle([x, 26, x + 12, 38], fill=TINT[name])
            text = f"{name} {shares[name] * 100:.0f} %"
            draw.text((x + 16, 25), text, fill=(240, 240, 240))
            x += 16 + int(draw.textlength(text)) + 14
        draw.text((6, 42), 'explained ground dimmed · north up · NAIP ' + ', '.join(naip_manifest['captureDates']), fill=(170, 170, 170))
        sheet = Image.new('RGB', (image.width, image.height + legend.height))
        sheet.paste(image, (0, 0))
        sheet.paste(legend, (0, image.height))
        sheet.save(args.output / f'h{n:02d}-unexplained.png')
        tiles.append((n, sheet))

    # Contact sheet: three columns, tiles scaled to a common width.
    tile_w = 420
    scaled = []
    for n, sheet in tiles:
        scale = tile_w / sheet.width
        scaled.append(sheet.resize((tile_w, max(1, int(sheet.height * scale)))))
    columns = 3
    row_heights = [max(t.height for t in scaled[i:i + columns]) for i in range(0, len(scaled), columns)]
    contact = Image.new('RGB', (columns * tile_w + (columns + 1) * 8, sum(row_heights) + (len(row_heights) + 1) * 8), (28, 28, 28))
    y = 8
    for row, i in enumerate(range(0, len(scaled), columns)):
        for j, tile in enumerate(scaled[i:i + columns]):
            contact.paste(tile, (8 + j * (tile_w + 8), y))
        y += row_heights[row] + 8
    contact.save(args.output / 'contact-sheet.png')

    # --- course level ---
    total_unexplained = sum(h['unexplainedM2'] for h in holes_out)
    course_classes = {name: round(sum(h['classes'][name]['m2'] for h in holes_out) / total_unexplained, 3) for name in CLASSES}
    gate_counts = {'report': sum(1 for h in holes_out if h['uncertainShare'] < GATE)}
    for name, _, _ in SCENARIOS:
        gate_counts[name] = sum(1 for h in holes_out if h['scenarios'][name]['gate'] == 'pass')
    result = {
        'kind': 'golfhelm-unexplained-naip-report-v1', 'siteId': pkg['siteId'], 'packageHash': pkg['contentHash'], 'layerHash': context['contentHash'],
        'contextReport': {'kind': report['kind'], 'layerHash': report['layerHash']},
        'raster': {'provider': naip_manifest['provider'], 'rasterSha256': raster_sha, 'captureDates': naip_manifest['captureDates'],
                   'catalogTiles': naip_manifest['catalogTiles'], 'exportPixelM': naip_manifest.get('exportPixelM'), 'license': naip_manifest['license']},
        'reportedAt': datetime.now(timezone.utc).date().isoformat(),
        'meaning': 'Report only. Classifies leaf-on NAIP pixels inside the ground the context report calls unexplained. '
                   'Nothing here creates a zone or changes a hash; the review sidecar only accepts, adjusts or rejects existing zones, '
                   'so the what-if scenarios are an upper bound on what a new source-backed derived zone could explain.',
        'method': {
            'ground': f'hole bounds (compiled mesh ± {margin} m) minus the union of package polygons, playing.buffer({prepare.ROUGH_PRIMARY_M}/{prepare.ROUGH_SECONDARY_M}) '
                      f'and context zone footprints (LineString = buffer(widthM/2, default 1); {", ".join(NOT_COVERING)} never cover) — rebuilt and checked against the report per hole',
            'pixelTest': 'pixel centre inside the unexplained polygon (holes respected), pixel centres taken UTM → WGS84 → local ENU',
            'classes': {
                'canopy': f'NDVI > {NDVI_CANOPY} and NIR std over {TEXTURE_WINDOW}×{TEXTURE_WINDOW} px > {TEXTURE_CANOPY} (the canopy pass\'s own pixel test)',
                'meadow': f'NDVI > {NDVI_CANOPY}, texture ≤ {TEXTURE_CANOPY}',
                'turf': f'{turf_floor} ≤ NDVI ≤ {NDVI_CANOPY} (floor = fairway NDVI p5 − .02, measured in this raster)',
                'dark': f'NDVI < {turf_floor}, NIR < {water_nir_max:.0f} (2 × median NIR of the package water), NDVI < {water_ndvi_max}',
                'bare': f'NDVI < {turf_floor}, not dark',
            },
            'derived': {'turfFloor': turf_floor, 'waterNirMax': water_nir_max, 'waterNdviMax': water_ndvi_max},
            'references': references,
            'canopyPass': {'contextMarginM': canopy_pass.CONTEXT_MARGIN_M, 'minGroupM2': canopy_pass.MIN_GROUP_M2, 'surfaceBufferPx': canopy_pass.SURFACE_BUFFER_PX,
                           'note': 'canopy pixels beyond the union of the pass\'s per-hole boxes were never candidates; the rest were rejected by its buffer, morphology or minimum group size'},
            'scenarios': {name: note for name, _, note in SCENARIOS},
            'caveats': [
                'Two NAIP flights (' + ', '.join(naip_manifest['captureDates']) + ') meet inside the export; NDVI of the package fairways agrees across them, so the turf floor holds on both, but absolute NIR does not (water/dark uses a ratio to the package water).',
                'Mown turf at 1 m has NDVI .14–.31 here, below the canopy threshold: a low NDVI is not bare ground.',
                'Bare ground / hardscape mixes tilled fields, gravel, pavement, roofs and sand; the raster cannot separate them.',
            ],
        },
        'gate': {'maxUncertainShare': GATE, 'holesPassing': gate_counts},
        'courseClasses': course_classes,
        'holes': holes_out,
    }
    lines = [f"# Unexplained context ground in NAIP — {pkg['name']} ({pkg['siteId']})", '',
             (f"Package `{pkg['contentHash'][:12]}`, context layer `{context['contentHash'][:12]}`, NAIP `{raster_sha[:12]}` ({', '.join(naip_manifest['captureDates'])}). "
              "Report only: no zone is created; the review sidecar only accepts, adjusts or rejects existing zones, so the what-if columns are an upper bound on what a new source-backed derived zone could explain."), '',
             f"Course-wide the unexplained ground ({total_unexplained / 1e4:.1f} ha) is: " + ', '.join(f"{name} {course_classes[name] * 100:.0f} %" for name in CLASSES) + '.', '',
             '| Hole | Unexplained | ha | canopy | meadow | turf | bare | dark | canopy beyond pass reach | ' + ' | '.join(f'if {name}' for name, _, _ in SCENARIOS) + ' |',
             '|---|---|---|---|---|---|---|---|---|' + '---|' * len(SCENARIOS)]
    for h in holes_out:
        c = h['classes']
        beyond = h['canopy']['beyondCanopyPassReach'] / c['canopy']['pixels'] if c['canopy']['pixels'] else 0
        lines.append(f"| {h['ordinal']} | {h['uncertainShare'] * 100:.1f} % | {h['unexplainedM2'] / 1e4:.1f} | " + ' | '.join(f"{c[name]['share'] * 100:.0f} %" for name in CLASSES)
                     + f" | {beyond * 100:.0f} % | " + ' | '.join(f"{h['scenarios'][name]['uncertainShare'] * 100:.1f} % {h['scenarios'][name]['gate']}" for name, _, _ in SCENARIOS) + ' |')
    beyond_m2 = sum(h['canopy']['beyondCanopyPassReach'] * h['pixelM2'] for h in holes_out)
    canopy_m2 = sum(h['classes']['canopy']['m2'] for h in holes_out)
    result['courseCanopy'] = {'m2': round(canopy_m2), 'beyondCanopyPassReachM2': round(beyond_m2), 'beyondShareOfUnexplained': round(beyond_m2 / total_unexplained, 3)}
    lines += ['', f"Holes under the {GATE * 100:.0f} % gate: report {gate_counts['report']} of {len(holes_out)}; " + '; '.join(f"if {name} → {gate_counts[name]}" for name, _, _ in SCENARIOS) + '.', '',
              '## Findings (numbers only)', '',
              (f"- Canopy the pass never looked at: {beyond_m2 / 1e4:.1f} ha of the {canopy_m2 / 1e4:.1f} ha canopy inside the unexplained ground lies beyond the union of the canopy pass's per-hole boxes "
               f"(features ± {canopy_pass.CONTEXT_MARGIN_M} m), i.e. {beyond_m2 / total_unexplained * 100:.0f} % of all unexplained ground is forest in the report's {margin} m rim that no derivation was offered. "
               "Re-running the pass out to the hole bounds would offer it to the same derivation (what survives its minimum group size and smoothing is not measured here), at the cost of a new package hash (woods are package features)."),
              f"- Vegetation without a class: turf + meadow is {(course_classes['turf'] + course_classes['meadow']) * 100:.0f} % of the unexplained ground; today it is painted as outer rough with terrain-following tone, which is what it is, but no zone says so.",
              f"- Bare ground / hardscape: {course_classes['bare'] * 100:.0f} % (tilled fields west of the road, driveways and roofs without an OSM footprint, the ski base); a source gap, not a render one.",
              '',
              '## Method', '', (f"Thresholds measured in this raster on the package's own surfaces: turf floor NDVI {turf_floor} (fairway p5 − .02), water NIR < {water_nir_max:.0f} (2 × package-water median). "
                                f"Canopy uses the canopy pass's own test (NDVI > {NDVI_CANOPY}, NIR texture > {TEXTURE_CANOPY})."), '',
              '| Class | Meaning | Rule |', '|---|---|---|'] + [f"| {name} | {LABELS[name]} | {result['method']['classes'][name]} |" for name in CLASSES] + ['',
              '| Reference | px | NDVI p5/25/50/75/95 | NIR p5/50/95 | texture p25/50/75 |', '|---|---|---|---|---|']
    for kind, ref in references.items():
        lines.append(f"| {kind} | {ref['pixels']} | {ref['ndvi']} | {ref['nir']} | {ref['texture']} |")
    lines += ['', '## Caveats', ''] + [f'- {c}' for c in result['method']['caveats']]
    lines += ['', '## Files', '', '`hNN-unexplained.png` per hole (NAIP RGB, explained ground dimmed to 42 %, outside the bounds to 25 %, unexplained ground tinted by class), `contact-sheet.png`, `unexplained-naip.json`.']
    (args.output / 'unexplained-naip.md').write_text('\n'.join(lines) + '\n')
    (args.output / 'unexplained-naip.json').write_text(json.dumps(result, indent=1, ensure_ascii=False) + '\n')
    if args.fixture:
        fixture = {k: v for k, v in result.items() if k != 'method'}
        fixture['method'] = {k: v for k, v in result['method'].items() if k in ('classes', 'derived', 'scenarios', 'caveats')}
        args.fixture.write_text(json.dumps(fixture, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps({'holes': len(holes_out), 'gate': gate_counts, 'courseClasses': course_classes, 'turfFloor': turf_floor, 'waterNirMax': water_nir_max}))


if __name__ == '__main__':
    main()

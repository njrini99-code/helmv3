"""Classify the outside world around a course into the context layer.

Production player-view spec (2026-09-16) §8, §31–34. Reads the retained golf
and context Overpass extracts, classifies every non-playing way with the
shared OSM rules (src/lib/golf/course-geometry/context-rules.json), attaches
each zone to the holes whose compiled terrain footprint it touches, and writes:

  <out>/<slug>-context.json         golfhelm-context-layer-v1, locked to the package hash
  <out>/<slug>-context-report.json  per-hole class areas, uncertain share, worst-first ranking

Nothing is invented: every zone cites its OSM way, records which numbers were
rule defaults, and starts unreviewed. Package playing surfaces are never
duplicated here.

Usage:
  python3 scripts/golf/course-geometry/prepare-context-layer.py \
    src/test/fixtures/course-geometry/peek-n-peak-upper.json \
    src/test/fixtures/course-geometry/sources/peek-n-peak-upper-osm/overpass.json.gz \
    src/test/fixtures/course-geometry/sources/peek-n-peak-upper-osm-context/overpass.json.gz \
    src/test/fixtures/course-geometry/compiled-peek-n-peak-upper \
    src/test/fixtures/course-geometry
"""
import argparse
import gzip
import hashlib
import json
import math
import re
from pathlib import Path

from shapely.geometry import LineString, Polygon, box
from shapely.ops import linemerge, unary_union

ROOT = Path(__file__).resolve().parents[3]
RULES = json.loads((ROOT / 'src/lib/golf/course-geometry/context-rules.json').read_text())
FIDELITY = {
    'tee': 'high', 'fairway': 'high', 'approach': 'medium', 'apron': 'high', 'fringe': 'high', 'green': 'high',
    'rough_primary': 'medium', 'rough_secondary': 'medium', 'rough_native': 'low', 'bunker_surround': 'high', 'green_surround': 'medium', 'bailout': 'medium',
    'woodland_edge': 'medium', 'tree_belt': 'medium', 'forest_mass': 'low', 'forest_interior': 'low', 'isolated_tree': 'high', 'tree_cluster': 'medium', 'understory': 'medium',
    'ridge': 'medium', 'shoulder': 'medium', 'swale': 'medium', 'ravine': 'medium', 'bank': 'medium', 'depression': 'medium', 'drainage': 'medium', 'hillside': 'low',
    'clubhouse': 'high', 'building': 'high', 'maintenance': 'high', 'bridge': 'high', 'wall': 'high', 'stairs': 'high', 'fence': 'medium', 'parking': 'medium', 'lift_line': 'medium', 'recreation': 'medium',
    'cart_path': 'high', 'service_path': 'high', 'road': 'high', 'crossing': 'high', 'path_shoulder': 'medium',
    'adjacent_fairway': 'high', 'adjacent_tee': 'high', 'adjacent_green': 'high', 'adjacent_bunker': 'high', 'crossing_corridor': 'medium', 'buffer_grass': 'medium',
    'pond_edge': 'high', 'stream': 'high', 'wetland': 'medium', 'shoreline_vegetation': 'medium', 'open_field': 'low', 'ski_slope': 'low', 'uncertain': 'low',
}
PLAYING_GOLF_TAGS = {'tee', 'fairway', 'green', 'bunker', 'water_hazard', 'lateral_water_hazard', 'hole', 'driving_range', 'rough'}
HOLE_MARGIN_M = 24
ROUGH_PRIMARY_M = 10
ROUGH_SECONDARY_M = 28
LEVEL_HEIGHT_M = 3.2
# A raw OSM way (a stream, a road) can run for kilometres past the course
# that happens to touch it; only the part near the course is context. Keep
# this margin generous enough that a ribbon can still be traced walking off
# the course bounds, never so generous that a whole way survives clipping.
CONTEXT_CLIP_MARGIN_M = 250
# Same limit and definition as `projectToLocal` (src/lib/golf/course-geometry
# /project.ts) and `wgs84ToEnuInFrame` (src/lib/golf/one-tap/geodesy.ts):
# horizontal distance only, not full 3D ENU including height.
LOCAL_FRAME_RADIUS_M = 5000


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def sha(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def make_local(origin):
    def ecef(p):
        lon, lat = [v * math.pi / 180 for v in p]
        e2 = 6.6943799901413165e-3
        n = 6378137 / math.sqrt(1 - e2 * math.sin(lat) ** 2)
        return [n * math.cos(lat) * math.cos(lon), n * math.cos(lat) * math.sin(lon), n * (1 - e2) * math.sin(lat)]
    o = ecef(origin)
    lon, lat = [v * math.pi / 180 for v in origin]

    def local(point):
        d = [a - b for a, b in zip(ecef(point), o)]
        return [-math.sin(lon) * d[0] + math.cos(lon) * d[1],
                -math.sin(lat) * math.cos(lon) * d[0] - math.sin(lat) * math.sin(lon) * d[1] + math.cos(lat) * d[2]]
    return local


def make_inverse(origin):
    """Local east/north (zero-altitude tangent plane) -> WGS84, inverting
    `make_local`. Newton-refined the same way as compile-course-terrain.py's
    `geographic`, scalar rather than vectorised: this runs per clipped vertex,
    not per raster pixel."""
    lon0, lat0 = [v * math.pi / 180 for v in origin]
    e2 = 6.6943799901413165e-3
    n0 = 6378137 / math.sqrt(1 - e2 * math.sin(lat0) ** 2)
    ox = n0 * math.cos(lat0) * math.cos(lon0)
    oy = n0 * math.cos(lat0) * math.sin(lon0)
    oz = n0 * (1 - e2) * math.sin(lat0)

    def inverse(point):
        x, y = point
        lon = origin[0] + x / (111320 * math.cos(lat0))
        lat = origin[1] + y / 111000
        for _ in range(6):
            la, ph = lon * math.pi / 180, lat * math.pi / 180
            n = 6378137 / math.sqrt(1 - e2 * math.sin(ph) ** 2)
            dx = n * math.cos(ph) * math.cos(la) - ox
            dy = n * math.cos(ph) * math.sin(la) - oy
            dz = n * (1 - e2) * math.sin(ph) - oz
            east = -math.sin(lon0) * dx + math.cos(lon0) * dy
            north = -math.sin(lat0) * math.cos(lon0) * dx - math.sin(lat0) * math.sin(lon0) * dy + math.cos(lat0) * dz
            lon += (x - east) / (111320 * math.cos(lat0))
            lat += (y - north) / 111000
        return [lon, lat]
    return inverse


def flatten_positions(geom):
    """Every WGS84 vertex a stored geometry dict carries, for the hard 5 km check."""
    if geom['type'] == 'LineString':
        return geom['coordinates']
    if geom['type'] == 'Polygon':
        return [p for ring in geom['coordinates'] for p in ring]
    return [p for poly in geom['coordinates'] for ring in poly for p in ring]


def read_extract(path):
    raw = path.read_bytes()
    if path.suffix == '.gz':
        raw = gzip.decompress(raw)
    manifest_path = path.with_name('manifest.json')
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    if manifest.get('uncompressedSha256') and manifest['uncompressedSha256'] != hashlib.sha256(raw).hexdigest():
        raise ValueError(f'{path} does not match its retained manifest hash')
    return json.loads(raw), manifest


def parse_metres(value):
    if value is None:
        return None
    match = re.match(r'^\s*([0-9]+(?:\.[0-9]+)?)\s*(m|ft|\')?\s*$', str(value))
    if not match:
        return None
    number = float(match.group(1))
    return number * .3048 if match.group(2) in ('ft', "'") else number


def classify(tags):
    golf = tags.get('golf')
    if golf in PLAYING_GOLF_TAGS or tags.get('leisure') == 'golf_course' or tags.get('natural') in ('water', 'sand'):
        return None  # package playing surfaces and hazards live in the package
    for rule in RULES:
        value = tags.get(rule['tag'])
        if value is None:
            continue
        if rule['value'] == '*' or rule['value'] == value:
            return rule
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('golf_extract', type=Path)
    parser.add_argument('context_extract', type=Path)
    parser.add_argument('compiled', type=Path, help='compiled terrain directory (asset-manifest.json + <hole>-terrain.json)')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()

    pkg = json.loads(args.package.read_text())
    local = make_local(pkg['originWgs84'])
    inverse = make_inverse(pkg['originWgs84'])
    golf_raw, golf_manifest = read_extract(args.golf_extract)
    context_raw, context_manifest = read_extract(args.context_extract)
    golf_source = f"osm-overpass-{golf_manifest.get('retrievedAt', 'retained')}"
    context_source = f"osm-context-{context_manifest.get('retrievedAt', 'retained')}"

    manifest = json.loads((args.compiled / 'asset-manifest.json').read_text())
    if manifest['geometryHash'] != pkg['contentHash']:
        raise ValueError('Compiled terrain belongs to another package revision')
    hole_bounds = {}
    for key, entry in manifest['holes'].items():
        mesh = json.loads((args.compiled / entry['fileName'].replace('.gz', '')).read_text())
        xs = mesh['vertices'][0::3]
        ys = mesh['vertices'][1::3]
        hole_bounds[key] = box(min(xs) - HOLE_MARGIN_M, min(ys) - HOLE_MARGIN_M, max(xs) + HOLE_MARGIN_M, max(ys) + HOLE_MARGIN_M)
    course_bounds = unary_union(list(hole_bounds.values()))
    cminx, cminy, cmaxx, cmaxy = course_bounds.bounds
    clip_region = box(cminx - CONTEXT_CLIP_MARGIN_M, cminy - CONTEXT_CLIP_MARGIN_M,
                      cmaxx + CONTEXT_CLIP_MARGIN_M, cmaxy + CONTEXT_CLIP_MARGIN_M)

    # Context extract first (superset with a margin); golf extract fills gaps.
    ways = {}
    for raw, source in ((context_raw, context_source), (golf_raw, golf_source)):
        for element in raw.get('elements', []):
            if element.get('type') == 'way' and element['id'] not in ways:
                ways[element['id']] = (element, source)

    zones = []
    skipped = {'no_rule': 0, 'playing': 0, 'geometry': 0, 'outside': 0, 'clipped_away': 0}
    for way_id in sorted(ways):
        element, source = ways[way_id]
        tags = element.get('tags') or {}
        rule = classify(tags)
        if rule is None:
            skipped['playing' if tags.get('golf') in PLAYING_GOLF_TAGS or tags.get('natural') in ('water', 'sand') else 'no_rule'] += 1
            continue
        coords = [[p['lon'], p['lat']] for p in element.get('geometry') or []]
        if len(coords) < 2:
            skipped['geometry'] += 1
            continue
        closed = len(coords) >= 4 and coords[0] == coords[-1]
        projected = [local(p) for p in coords]
        is_line = False
        if closed and rule['geometry'] in ('area', 'any'):
            shape = Polygon(projected)
            if not shape.is_valid or shape.is_empty or shape.area < 4:
                skipped['geometry'] += 1
                continue
        elif rule['geometry'] in ('line', 'any') and not (closed and rule['geometry'] == 'line' and rule['class'] in ('road', 'service_path')):
            shape = LineString(projected)
            if shape.length < 2:
                skipped['geometry'] += 1
                continue
            is_line = True
        else:
            skipped['geometry'] += 1
            continue
        if not shape.intersects(course_bounds):
            skipped['outside'] += 1
            continue
        # A retained OSM way can run kilometres past the course (a stream, a
        # road) even though it touches the course bounds. Clip to the course
        # bounds plus a fixed margin before storing WGS84 coordinates or
        # measuring anything against it, so one distant vertex can never push
        # a package past the runtime's 5 km local frame (project.ts:24,
        # geodesy.ts:66).
        shape = shape.intersection(clip_region)
        if shape.is_empty:
            skipped['clipped_away'] += 1
            continue
        if is_line:
            if shape.geom_type == 'MultiLineString':
                merged = linemerge(shape)
                shape = merged if merged.geom_type == 'LineString' else max(shape.geoms, key=lambda g: g.length)
            if shape.geom_type != 'LineString' or len(shape.coords) < 2:
                skipped['geometry'] += 1
                continue
            geometry = {'type': 'LineString', 'coordinates': [inverse(p) for p in shape.coords]}
        else:
            if shape.geom_type == 'Polygon':
                polys = [shape]
            elif shape.geom_type == 'MultiPolygon':
                polys = list(shape.geoms)
            else:
                skipped['geometry'] += 1
                continue
            polys = [p for p in polys if p.is_valid and not p.is_empty and p.area >= 4]
            if not polys:
                skipped['clipped_away'] += 1
                continue
            shape = polys[0] if len(polys) == 1 else unary_union(polys)

            def ring_coords(ring):
                return [inverse(p) for p in ring.coords]
            if len(polys) == 1:
                geometry = {'type': 'Polygon', 'coordinates': [ring_coords(polys[0].exterior)] + [ring_coords(r) for r in polys[0].interiors]}
            else:
                geometry = {'type': 'MultiPolygon', 'coordinates': [[ring_coords(p.exterior)] + [ring_coords(r) for r in p.interiors] for p in polys]}
        hole_keys = sorted(key for key, bounds in hole_bounds.items() if shape.intersects(bounds))
        attributes, defaults = {}, []
        if rule.get('widthM') is not None:
            width = parse_metres(tags.get('width'))
            attributes['widthM'] = round(width, 2) if width else rule['widthM']
            if not width:
                defaults.append('widthM')
        if rule.get('heightM') is not None:
            height = parse_metres(tags.get('height'))
            levels = tags.get('building:levels')
            if levels and str(levels).isdigit():
                attributes['levels'] = int(levels)
            if not height and attributes.get('levels'):
                height = attributes['levels'] * LEVEL_HEIGHT_M
            attributes['heightM'] = round(height, 2) if height else rule['heightM']
            if not height:
                defaults.append('heightM')
        if tags.get('surface'):
            attributes['surface'] = tags['surface'][:40]
        if tags.get('name'):
            attributes['name'] = tags['name'][:120]
        if defaults:
            attributes['defaults'] = defaults
        attributes['osmTags'] = {k: str(v)[:200] for k, v in tags.items() if k in (rule['tag'], 'surface', 'width', 'height', 'building:levels', 'name', 'golf', 'highway', 'building', 'natural', 'landuse', 'waterway', 'aerialway')}
        zones.append({'id': f'ctx-osm-way-{way_id}', 'class': rule['class'], 'geometryWgs84': geometry,
                      'sourceIds': [source], 'holeKeys': hole_keys, 'basis': 'source', 'reviewed': False,
                      'fidelity': FIDELITY[rule['class']], 'attributes': attributes, '_shape': shape})

    sources = [
        {'id': context_source, 'provider': 'OpenStreetMap', 'licenseId': 'ODbL-1.0', 'url': 'https://www.openstreetmap.org/copyright',
         'retrievedAt': context_manifest.get('retrievedAt', 'retained'), 'attribution': '© OpenStreetMap contributors'},
    ]
    if golf_source != context_source:
        sources.append({'id': golf_source, 'provider': 'OpenStreetMap', 'licenseId': 'ODbL-1.0', 'url': 'https://www.openstreetmap.org/copyright',
                        'retrievedAt': golf_manifest.get('retrievedAt', 'retained'), 'attribution': '© OpenStreetMap contributors'})
    layer = {'kind': 'golfhelm-context-layer-v1', 'siteId': pkg['siteId'], 'packageHash': pkg['contentHash'],
             'originWgs84': pkg['originWgs84'], 'sources': sources,
             'zones': [{k: v for k, v in zone.items() if k != '_shape'} for zone in zones],
             'review': {'status': 'unreviewed', 'reviewedAt': None,
                        'notes': ['Classified from retained OSM extracts by prepare-context-layer.py; every zone cites its way and its rule defaults.']}}
    layer['contentHash'] = sha(layer)

    # Hard check (independent of the clip above): push the written WGS84
    # coordinates back through the same forward projection the runtime uses
    # and confirm every one still lands inside its 5 km local frame. This
    # catches a bad inverse as well as a bad clip.
    worst = 0.0
    for zone in layer['zones']:
        for point in flatten_positions(zone['geometryWgs84']):
            east, north = local(point)
            worst = max(worst, math.hypot(east, north))
    if worst > LOCAL_FRAME_RADIUS_M:
        raise SystemExit(
            f'LOCAL_FRAME_EXTENT_EXCEEDED: a context zone coordinate is {worst:.1f} m from the origin, '
            f'over the {LOCAL_FRAME_RADIUS_M} m local-frame limit (project.ts, geodesy.ts)')

    # Report (§34–35, §42.4): what share of each hole's drawn context is explained.
    package_shapes = []
    for feature in pkg['features']:
        raw = feature['geometryWgs84']
        if raw['type'] == 'LineString':
            continue
        parts = [raw['coordinates']] if raw['type'] == 'Polygon' else raw['coordinates']
        for rings in parts:
            shape = Polygon([local(p) for p in rings[0]], [[local(p) for p in r] for r in rings[1:]])
            if shape.is_valid and not shape.is_empty:
                package_shapes.append((feature['kind'], shape))
    # Derived rough hierarchy (§9): the visual compiler tones ground by distance
    # from the nearest playing surface; the report counts those bands as
    # explained so `uncertain` measures land beyond every source and rule.
    playing = unary_union([shape for kind, shape in package_shapes if kind in ('fairway', 'green', 'tee', 'bunker')])
    rough_primary = playing.buffer(ROUGH_PRIMARY_M)
    rough_secondary = playing.buffer(ROUGH_SECONDARY_M)
    holes = []
    for hole in pkg['holes']:
        bounds = hole_bounds[hole['key']]
        area = bounds.area
        classes = {}
        covers = []
        for kind, shape in package_shapes:
            part = shape.intersection(bounds)
            if part.is_empty:
                continue
            covers.append(part)
            classes[f'package:{kind}'] = round(classes.get(f'package:{kind}', 0) + part.area)
        for label, band in (('derived:rough_primary', rough_primary), ('derived:rough_secondary', rough_secondary)):
            part = band.intersection(bounds)
            if not part.is_empty:
                covers.append(part)
                classes[label] = round(part.area)
        for zone in zones:
            if hole['key'] not in zone['holeKeys']:
                continue
            shape = zone['_shape']
            footprint = shape.buffer(zone['attributes'].get('widthM', 1) / 2) if zone['geometryWgs84']['type'] == 'LineString' else shape
            part = footprint.intersection(bounds)
            if part.is_empty:
                continue
            if zone['class'] not in ('fence', 'lift_line', 'wall'):
                covers.append(part)
            classes[zone['class']] = round(classes.get(zone['class'], 0) + part.area)
        covered = unary_union(covers).area if covers else 0
        uncertain = max(0.0, 1 - covered / area)
        holes.append({'key': hole['key'], 'ordinal': hole['ordinal'], 'contextBoundsM2': round(area), 'coveredShare': round(1 - uncertain, 3),
                      'uncertainShare': round(uncertain, 3), 'zoneCount': sum(1 for z in zones if hole['key'] in z['holeKeys']),
                      'classAreasM2': dict(sorted(classes.items(), key=lambda item: -item[1]))})
    ranking = sorted(holes, key=lambda h: -h['uncertainShare'])
    counts = {}
    for zone in zones:
        counts[zone['class']] = counts.get(zone['class'], 0) + 1
    report = {'kind': 'golfhelm-context-report-v1', 'siteId': pkg['siteId'], 'packageHash': pkg['contentHash'], 'layerHash': layer['contentHash'],
              'zoneCounts': dict(sorted(counts.items())), 'skipped': skipped,
              'worstFirst': [{'key': h['key'], 'ordinal': h['ordinal'], 'uncertainShare': h['uncertainShare']} for h in ranking],
              'holes': sorted(holes, key=lambda h: h['ordinal'])}
    slug = args.package.stem
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / f'{slug}-context.json').write_text(json.dumps(layer, indent=1, ensure_ascii=False) + '\n')
    (args.output / f'{slug}-context-report.json').write_text(json.dumps(report, indent=1, ensure_ascii=False) + '\n')
    print(f'{slug}-context.json zones={len(zones)} hash={layer["contentHash"][:12]} skipped={skipped}')
    print('classes', report['zoneCounts'])
    print('worst first', [(h['ordinal'], h['uncertainShare']) for h in ranking[:6]])


if __name__ == '__main__':
    main()

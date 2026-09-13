"""Compile the existing Cacapon package into deterministic per-hole terrain.

python3 scripts/golf/course-geometry/compile-course-terrain.py --holes 7
python3 scripts/golf/course-geometry/compile-course-terrain.py --holes all

Source acquisition is one bounded, immutable, native-1m USGS export locked to
one catalog tile. No production client, source geometry edits, or guessed woods.
Requires the existing terrain requirements plus pyproj (tested 3.7.2).
"""
import argparse
import bisect
import gzip
import hashlib
import importlib.util
import json
import math
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pyproj
import shapely
from PIL import Image
from shapely import constrained_delaunay_triangles
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / 'src/test/fixtures/course-geometry'
COMPILER_VERSION = 'course-terrain-v1'
STYLE_VERSION = 'narrow-surround-v1'
CONTEXT_MARGIN_M = 160
METRIC_STEP_M = 2
TACTICAL_STEP_M = 4
DETAIL_STEP_M = 2
ORIGINAL_TRIANGLE_ENVELOPE = 20000
# Deliberately reviewed for expanded source-backed neighboring context. Do not
# simplify source boundaries merely to fit the earlier single-hole envelope.
MAX_TRIANGLES = 40000
MAX_METRIC_CELLS = 1000000
SOURCE_CRS = 32617  # WGS84 UTM 17N; horizontal reprojection only, NAVD88 Z retained.


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


pilot = module('pilot', 'prepare-pilot.py')
fetch = module('fetch', 'fetch-terrain-pilot.py')


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def write_json(path, value, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text((json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) if pretty else canonical_json(value)) + '\n')


def write_asset(directory, hole, result):
    """Gzip is the versioned artifact; expanded JSON is a reproducible cache."""
    payload = (canonical_json(result)+'\n').encode()
    compressed = gzip.compress(payload, mtime=0)
    filename = hole['key']+'-terrain.json.gz'
    directory.mkdir(parents=True, exist_ok=True)
    (directory/filename).write_bytes(compressed)
    (directory/(hole['key']+'-terrain.json')).write_bytes(payload)
    return {'ordinal': hole['ordinal'], 'fileName': filename, 'encoding': 'gzip',
            'compressedBytes': len(compressed), 'uncompressedBytes': len(payload),
            'sha256': hashlib.sha256(compressed).hexdigest(),
            'uncompressedSha256': hashlib.sha256(payload).hexdigest(), 'contentHash': result['contentHash']}


def coordinates(value):
    if isinstance(value[0], (int, float)):
        yield value
    else:
        for child in value:
            yield from coordinates(child)


def local_geometry(feature):
    raw = feature['geometryWgs84']
    if raw['type'] == 'LineString':
        return LineString([pilot.local(p) for p in raw['coordinates']])
    parts = [raw['coordinates']] if raw['type'] == 'Polygon' else raw['coordinates']
    result = unary_union([Polygon([pilot.local(p) for p in rings[0]],
                                 [[pilot.local(p) for p in ring] for ring in rings[1:]]) for rings in parts])
    if result.is_empty or not result.is_valid:
        raise ValueError('Invalid canonical source shape: ' + feature['id'])
    return result


def geographic(x, y):
    """Invert the package's existing zero-altitude WGS84→local-EN math."""
    x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
    lon0, lat0 = np.radians(pilot.ORIGIN)
    e2 = 6.6943799901413165e-3
    n0 = 6378137 / math.sqrt(1 - e2 * math.sin(lat0) ** 2)
    origin = [n0 * math.cos(lat0) * math.cos(lon0), n0 * math.cos(lat0) * math.sin(lon0), n0 * (1-e2) * math.sin(lat0)]
    lon = pilot.ORIGIN[0] + x / (111320 * math.cos(lat0))
    lat = pilot.ORIGIN[1] + y / 111000
    for _ in range(5):
        la, ph = np.radians(lon), np.radians(lat)
        n = 6378137 / np.sqrt(1 - e2 * np.sin(ph) ** 2)
        dx = n * np.cos(ph) * np.cos(la) - origin[0]
        dy = n * np.cos(ph) * np.sin(la) - origin[1]
        dz = n * (1-e2) * np.sin(ph) - origin[2]
        east = -math.sin(lon0) * dx + math.cos(lon0) * dy
        north = -math.sin(lat0) * math.cos(lon0) * dx - math.sin(lat0) * math.sin(lon0) * dy + math.cos(lat0) * dz
        lon += (x-east) / (111320 * math.cos(lat0))
        lat += (y-north) / 111000
    return lon, lat


def snap_bounds(bounds, padding=0, step=16):
    a, b, c, d = bounds
    return [math.floor((a-padding)/step)*step, math.floor((b-padding)/step)*step,
            math.ceil((c+padding)/step)*step, math.ceil((d+padding)/step)*step]


def hole_bounds(hole, raw_shapes, raw_features):
    shapes = [raw_shapes[i] for i in hole['featureIds'] if raw_features[i]['kind'] != 'woods']
    tactical = snap_bounds(unary_union(shapes).bounds, 12, 4)
    return tactical, snap_bounds(tactical, CONTEXT_MARGIN_M, 32)


def date_text(value):
    if value is None:
        raise ValueError('Missing source acquisition date requires review')
    text = str(value)
    if len(text) == 8 and text.isdigit():
        return datetime.strptime(text, '%Y%m%d').date().isoformat()
    if len(text) == 4 and text.isdigit():
        return text
    return datetime.fromtimestamp(float(value)/1000, timezone.utc).date().isoformat()


def acquire_source(directory, pkg, bounds):
    names = ['catalog.json', 'export.json', 'elevation.tiff', 'source-manifest.json']
    existing = [(directory / name).exists() for name in names]
    if all(existing):
        manifest = json.loads((directory / 'source-manifest.json').read_text())
        if manifest['packageHash'] != pkg['contentHash'] or manifest['requestedLocalBoundsM'] != bounds:
            raise ValueError('Immutable source cache belongs to another package/context; choose a new directory')
        for name in names[:-1]:
            if hashlib.sha256((directory/name).read_bytes()).hexdigest() != manifest['fileHashes'][name]:
                raise ValueError('Immutable source cache hash mismatch: ' + name)
        return manifest
    if any(existing):
        raise ValueError('Incomplete source cache; preserve evidence and choose a new directory')
    directory.mkdir(parents=True, exist_ok=True)
    # Query the footprint of the entire future course context, not just a tee.
    x = [bounds[0], bounds[2], bounds[2], bounds[0]]
    y = [bounds[1], bounds[1], bounds[3], bounds[3]]
    lon, lat = geographic(x, y)
    west, south, east, north = float(min(lon)), float(min(lat)), float(max(lon)), float(max(lat))
    query = {'where': 'Category=1', 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326, 'outSR': 4326,
             'geometry': json.dumps({'xmin': west, 'ymin': south, 'xmax': east, 'ymax': north,
                                     'spatialReference': {'wkid': 4326}}),
             'spatialRel': 'esriSpatialRelIntersects', 'returnGeometry': 'true',
             'outFields': 'OBJECTID,Name,title,URL,StartDate,EndDate,Resolution_X,VerticalDatum'}
    catalog = fetch.request('query', query)
    if catalog.get('exceededTransferLimit'):
        raise ValueError('Truncated source catalog requires bounded pagination review')
    extent_wgs84 = box(west, south, east, north)
    candidates = []
    for row in catalog.get('features', []):
        attrs = row['attributes']
        if attrs['title'].startswith('USGS 1 Meter ') and attrs['VerticalDatum'] in ('NAVD88', 'North American Vertical Datum of 1988 (NAVD 88)'):
            footprint = Polygon(row['geometry']['rings'][0], row['geometry']['rings'][1:])
            if footprint.is_valid and footprint.covers(extent_wgs84):
                candidates.append(row)
    if not candidates:
        report = {'state': 'needs_source_review', 'reason': 'No single native-1m tile covers the full bounded course context',
                  'packageHash': pkg['contentHash'], 'bboxWgs84': [west, south, east, north],
                  'policy': 'No mixed-date or lower-resolution fallback is imported automatically', 'catalog': catalog}
        write_json(directory / 'coverage-exception.json', report, True)
        raise ValueError(report['reason'])
    selected = max(candidates, key=lambda row: (date_text(row['attributes']['EndDate']), row['attributes']['title']))
    attrs = selected['attributes']
    project = pyproj.Transformer.from_crs(4326, SOURCE_CRS, always_xy=True)
    source_x, source_y = project.transform(lon, lat)
    # Snap projected output pixels to a 1m grid. Never describe render grid
    # density or image enlargement as additional source resolution.
    a, b, c, d = snap_bounds([min(source_x), min(source_y), max(source_x), max(source_y)], 8, 1)
    width, height = int(c-a), int(d-b)
    if width*height > 8_000_000 or max(width, height) > 8000:
        raise ValueError('Bounded course export exceeds the fixed 8M pixel cap')
    exported = fetch.request('exportImage', {'bbox': f'{a},{b},{c},{d}', 'bboxSR': SOURCE_CRS, 'imageSR': SOURCE_CRS,
        'size': f'{width},{height}', 'format': 'tiff', 'pixelType': 'F32', 'interpolation': 'RSP_BilinearInterpolation',
        'renderingRule': json.dumps({'rasterFunction': 'None'}),
        'mosaicRule': json.dumps({'mosaicMethod': 'esriMosaicLockRaster', 'lockRasterIds': [attrs['OBJECTID']]})})
    if (exported['width'], exported['height']) != (width, height):
        raise ValueError('Export dimensions changed; source resampling requires review')
    ex = exported['extent']
    inverse = pyproj.Transformer.from_crs(SOURCE_CRS, 4326, always_xy=True)
    elon, elat = inverse.transform([ex['xmin'], ex['xmax'], ex['xmax'], ex['xmin']],
                                  [ex['ymin'], ex['ymin'], ex['ymax'], ex['ymax']])
    footprint = Polygon(selected['geometry']['rings'][0], selected['geometry']['rings'][1:])
    if not footprint.covers(Polygon(zip(elon, elat))):
        raise ValueError('Returned export exceeds the selected tile footprint')
    raster = fetch.read(exported['href'], 40_000_000)
    exported.update(selectedObjectId=attrs['OBJECTID'], retrievedAt=datetime.now(timezone.utc).date().isoformat(),
                    sourceProjection=f'EPSG:{SOURCE_CRS}', requestedLocalBoundsM=bounds)
    write_json(directory/'catalog.json', catalog, True)
    write_json(directory/'export.json', exported, True)
    (directory/'elevation.tiff').write_bytes(raster)
    manifest = {'schemaVersion': 1, 'packageHash': pkg['contentHash'], 'requestedLocalBoundsM': bounds,
                'selectedTitle': attrs['title'], 'selectedObjectId': attrs['OBJECTID'], 'sourceUrl': attrs['URL'],
                'acquisitionStart': date_text(attrs['StartDate']), 'acquisitionEnd': date_text(attrs['EndDate']),
                'nativeResolutionM': 1, 'exportPixelM': [(ex['xmax']-ex['xmin'])/width, (ex['ymax']-ex['ymin'])/height],
                'horizontalExportCrs': f'EPSG:{SOURCE_CRS}', 'verticalDatum': 'NAVD88',
                'retrievedAt': exported['retrievedAt'], 'sourceSelection': 'single_full_coverage_native_1m_tile',
                'licenseUrl': 'https://www.usgs.gov/3d-elevation-program/about-3dep-products-services',
                'fileHashes': {name: hashlib.sha256((directory/name).read_bytes()).hexdigest() for name in names[:-1]}}
    write_json(directory/'source-manifest.json', manifest, True)
    print(json.dumps({'source': attrs['title'], 'pixels': [width, height], 'bytes': len(raster)}), flush=True)
    return manifest


class ElevationSource:
    def __init__(self, directory, manifest):
        exported = json.loads((directory/'export.json').read_text())
        self.extent = exported['extent']
        with Image.open(directory/'elevation.tiff') as image:
            self.raster = np.asarray(image, dtype=float)
            nodata = image.tag_v2.get(42113)
        if nodata is not None:
            # Honor an explicit GDAL nodata tag, including a zero sentinel.
            # A genuine zero elevation otherwise remains a valid measurement.
            sentinel = float(str(nodata).strip('\x00'))
            self.raster = np.where(self.raster == sentinel, np.nan, self.raster)
        if self.raster.shape != (exported['height'], exported['width']):
            raise ValueError('Raster shape does not match immutable export metadata')
        self.project = pyproj.Transformer.from_crs(4326, SOURCE_CRS, always_xy=True)
        self.manifest = manifest

    def sample(self, x, y):
        """Bilinear native export samples: any missing support stays unknown."""
        lon, lat = geographic(x, y)
        sx, sy = self.project.transform(lon, lat)
        ex, raster = self.extent, self.raster
        px = (np.asarray(sx)-ex['xmin'])/(ex['xmax']-ex['xmin'])*raster.shape[1]-.5
        py = (ex['ymax']-np.asarray(sy))/(ex['ymax']-ex['ymin'])*raster.shape[0]-.5
        ix, iy = np.floor(px).astype(int), np.floor(py).astype(int)
        inside = (ix >= 0) & (ix < raster.shape[1]-1) & (iy >= 0) & (iy < raster.shape[0]-1)
        cx, cy = np.clip(ix, 0, raster.shape[1]-2), np.clip(iy, 0, raster.shape[0]-2)
        support = np.array([raster[cy, cx], raster[cy, cx+1], raster[cy+1, cx], raster[cy+1, cx+1]])
        valid = inside & np.all(np.isfinite(support) & (support > -1000) & (support < 9000), axis=0)
        fx, fy = px-ix, py-iy
        value = support[0]*(1-fx)*(1-fy)+support[1]*fx*(1-fy)+support[2]*(1-fx)*fy+support[3]*fx*fy
        return np.where(valid, value, np.nan)


def display_surfaces(pkg_path, pkg, source):
    """Use the exact TypeScript display-outline compiler, including bounds QA."""
    surfaces = {}
    reports = {}
    for hole in pkg['holes']:
        directory = source / 'display' / hole['key']
        directory.mkdir(parents=True, exist_ok=True)
        subprocess.run([str(ROOT/'node_modules/.bin/tsx'), str(Path(__file__).with_name('prepare-terrain-surfaces.ts')),
                        str(directory), str(pkg_path), hole['key']], cwd=ROOT, check=True, capture_output=True, text=True)
        manifest = json.loads((directory/'display-surfaces.json').read_text())
        if manifest['geometryHash'] != pkg['contentHash']:
            raise ValueError('Display geometry hash mismatch')
        for f in manifest['surfaces']:
            shape = unary_union([Polygon(rings[0], rings[1:]) for rings in f['parts']])
            original = unary_union([Polygon(rings[0], rings[1:]) for rings in f['canonicalParts']])
            displacement = shape.boundary.hausdorff_distance(original.boundary)
            if not shape.is_valid or displacement > manifest['maxBoundaryDisplacementM'] or abs(shape.area/original.area-1) > .015:
                raise ValueError('Display boundary review failed: ' + f['id'])
            if len(f['parts']) != len(f['canonicalParts']) or [len(p) for p in f['parts']] != [len(p) for p in f['canonicalParts']]:
                raise ValueError('Display topology changed: ' + f['id'])
            surfaces[f['id']] = (f, shape)
            reports[f['id']] = {'id': f['id'], 'boundaryDisplacementM': round(displacement, 6),
                                'areaChangePercent': round(100*(shape.area/original.area-1), 6)}
    return surfaces, reports


def leaf_cells(bounds, tactical, detail, outer_step):
    """Conforming local refinement: shared edges retain every T-junction node."""
    cells = []
    def split(x, y, step):
        cell = box(x, y, x+step, y+step)
        target = DETAIL_STEP_M if cell.intersects(detail) else TACTICAL_STEP_M if cell.intersects(tactical) else outer_step
        if step > target:
            half = step/2
            for dx, dy in [(0, 0), (half, 0), (half, half), (0, half)]:
                split(x+dx, y+dy, half)
        else:
            cells.append((x, y, step))
    for x in np.arange(bounds[0], bounds[2], outer_step):
        for y in np.arange(bounds[1], bounds[3], outer_step):
            split(float(x), float(y), outer_step)
    vertical, horizontal = {}, {}
    for x, y, step in cells:
        for px, py in [(x, y), (x+step, y), (x+step, y+step), (x, y+step)]:
            vertical.setdefault(px, set()).add(py)
            horizontal.setdefault(py, set()).add(px)
    vertical = {x: sorted(ys) for x, ys in vertical.items()}
    horizontal = {y: sorted(xs) for y, xs in horizontal.items()}
    result = []
    for x, y, step in cells:
        def between(values, low, high):
            return values[bisect.bisect_left(values, low):bisect.bisect_left(values, high)]
        points = [(px, y) for px in between(horizontal[y], x, x+step)]
        points += [(x+step, py) for py in between(vertical[x+step], y, y+step)]
        points += [(px, y+step) for px in reversed(between(horizontal[y+step], x, x+step)+[x+step]) if px > x]
        points += [(x, py) for py in reversed(between(vertical[x], y, y+step)+[y+step]) if py > y]
        result.append((Polygon(points), step))
    return result


def metric_grid(source, bounds):
    a, b, c, d = snap_bounds(bounds, 2, METRIC_STEP_M)
    columns, rows = int((c-a)/METRIC_STEP_M)+1, int((d-b)/METRIC_STEP_M)+1
    if columns*rows > MAX_METRIC_CELLS:
        raise ValueError('Metric grid exceeds the 1M sample cap')
    x, y = np.meshgrid(a+np.arange(columns)*METRIC_STEP_M, b+np.arange(rows)*METRIC_STEP_M)
    values = source.sample(x, y).reshape(-1)
    return {'originM': [a, b], 'spacingM': METRIC_STEP_M, 'columns': columns, 'rows': rows,
            'heightsM': [round(float(value), 4) if np.isfinite(value) else None for value in values]}, values


def duplicate_vertex_report(vertices, normals):
    seen = {}
    agree, height_agree, duplicates = True, True, 0
    for i in range(0, len(vertices), 3):
        xy = tuple(vertices[i:i+2])
        normal = tuple(normals[i:i+3])
        if xy in seen:
            duplicates += 1
            previous_z, previous_normal = seen[xy]
            agree &= normal == previous_normal
            height_agree &= vertices[i+2] == previous_z
        else:
            seen[xy] = (vertices[i+2], normal)
    return {'duplicateVertexCount': duplicates, 'sourceNormalDuplicatesAgree': agree,
            'sourceHeightDuplicatesAgree': height_agree}


def compile_hole(hole, pkg, raw_shapes, raw_features, displays, outline_reports, source, outer_step=16):
    tactical_bounds, context_bounds = hole_bounds(hole, raw_shapes, raw_features)
    context = box(*context_bounds)
    selected = [f for f in pkg['features'] if f['kind'] != 'route' and raw_shapes[f['id']].intersects(context)]
    order = ['woods', 'rough', 'fairway', 'tee', 'green', 'bunker', 'water']
    selected.sort(key=lambda f: (order.index(f['kind']), f['id']))
    surfaces = [(f['id'], f['kind'], displays[f['id']][1].intersection(context)) for f in selected]
    visible, covered = [], Polygon()
    for ident, kind, shape in reversed(surfaces):
        accepted = shape.difference(covered)
        visible.append((ident, kind, accepted))
        covered = covered.union(shape)
    visible.append(('terrain-context', 'ground', context.difference(covered)))
    visible.reverse()
    # Only the played hole receives fine terrain sampling. Neighbor surfaces
    # remain actual polygons, rendered in context without changing ownership.
    own = [raw_shapes[i] for i in hole['featureIds'] if raw_features[i]['kind'] != 'woods']
    tactical = unary_union(own).buffer(12).intersection(context)
    detail = unary_union([raw_shapes[i] for i in hole['featureIds'] if raw_features[i]['kind'] in ('green', 'bunker', 'tee')]).buffer(3)
    cells = leaf_cells(context_bounds, tactical, detail, outer_step)
    cell_shapes = [cell for cell, _ in cells]
    tree = shapely.STRtree(cell_shapes)
    fairways = unary_union([shape for ident, kind, shape in surfaces if kind == 'fairway' and ident in hole['featureIds']])
    greens = unary_union([shape for ident, kind, shape in surfaces if kind == 'green' and ident in hole['featureIds']])
    # These tiny visual bands are not source boundaries. A low arc subdivision
    # count avoids spending most of the mesh budget on neighboring decoration.
    surround = fairways.buffer(.6, quad_segs=2).difference(fairways)
    collar = greens.buffer(.45, quad_segs=2).difference(greens)
    xy, triangle_features, triangle_materials, ids, kinds, reports = [], [], [], [], [], []
    for ident, kind, shape in visible:
        feature_index = len(ids)
        ids.append(ident); kinds.append(kind)
        regions = [(0, shape)]
        if kind == 'ground':
            regions = [(0, shape.difference(surround).difference(collar)), (3, shape.intersection(surround).difference(collar)), (4, shape.intersection(collar))]
        widths = {'green': (.2, .35), 'bunker': (.2, .35)}
        if kind in widths and ident in hole['featureIds']:
            edge, light = widths[kind]
            inset, interior = shape.buffer(-edge, quad_segs=2), shape.buffer(-edge-light, quad_segs=2)
            regions = [(1, shape.difference(inset)), (2, inset.difference(interior)), (0, interior)]
        area, count = 0, 0
        for material, region in regions:
            if region.is_empty:
                continue
            for cell_index in sorted(tree.query(region, predicate='intersects').tolist()):
                cut = region.intersection(cell_shapes[cell_index])
                for triangle in constrained_delaunay_triangles(cut).geoms:
                    if triangle.area < 1e-8:
                        continue
                    points = list(triangle.exterior.coords)[:3]
                    # Normals and heights are sampled at these SAME rounded XY
                    # values, so coincident material/cell vertices cannot crease.
                    points = [(round(px, 5), round(py, 5)) for px, py in points]
                    if Polygon(points).area < 1e-10:
                        continue
                    xy.extend(points); triangle_features.append(feature_index); triangle_materials.append(material)
                    area += triangle.area; count += 1
        if abs(area-shape.area) > .002:
            raise ValueError(f'Triangulation area mismatch: {hole["key"]} {ident}: {area-shape.area}')
        reports.append({'id': ident, 'kind': kind, 'triangles': count, 'areaM2': round(area, 4),
                        'rendererContextOnly': ident not in hole['featureIds'] and ident != 'terrain-context'})
    if len(triangle_features) > MAX_TRIANGLES:
        if outer_step == 16:
            return compile_hole(hole, pkg, raw_shapes, raw_features, displays, outline_reports, source, 32)
        raise ValueError(f'{hole["key"]}: {len(triangle_features)} triangles exceeds {MAX_TRIANGLES}; explicit LOD review required')
    unique = np.array(sorted(set(xy)), dtype=float)
    heights = source.sample(unique[:, 0], unique[:, 1])
    east = source.sample(unique[:, 0]+1, unique[:, 1]); west = source.sample(unique[:, 0]-1, unique[:, 1])
    north = source.sample(unique[:, 0], unique[:, 1]+1); south = source.sample(unique[:, 0], unique[:, 1]-1)
    dzdx, dzdy = (east-west)/2, (north-south)/2
    normals = np.column_stack((-dzdx, -dzdy, np.ones(len(unique))))
    normals /= np.linalg.norm(normals, axis=1)[:, None]
    valid = np.isfinite(heights) & np.isfinite(normals).all(axis=1)
    lookup = {tuple(point): i for i, point in enumerate(unique)}
    vertices, source_normals, kept_features, kept_materials = [], [], [], []
    omitted, omitted_area = 0, 0
    for t, feature_index in enumerate(triangle_features):
        indices = [lookup[p] for p in xy[t*3:t*3+3]]
        if not valid[indices].all():
            omitted += 1
            omitted_area += Polygon(xy[t*3:t*3+3]).area
            continue
        for i in indices:
            vertices.extend([*unique[i].tolist(), round(float(heights[i]), 4)])
            source_normals.extend(np.round(normals[i], 7).tolist())
        kept_features.append(feature_index); kept_materials.append(triangle_materials[t])
    if not kept_features:
        raise ValueError(hole['key'] + ': terrain unavailable from the locked source')
    grid, grid_values = metric_grid(source, context_bounds)
    tee = [f for f in selected if f['id'] in hole['featureIds'] and f['kind'] == 'tee']
    own_canopy = any(f['id'] in hole['featureIds'] and f['kind'] == 'woods' and f['reviewed'] for f in selected)
    context_ids = [f['id'] for f in selected if f['id'] not in hole['featureIds']]
    limitations = ['Source candidate; independent registration, renovation and boundary review pending',
                  'Macro terrain only; no putting-break or bunker-lip accuracy claim',
                  'Daily tee markers, actual cup, ball positions and tree heights are unknown',
                  'Neutral ground is not classified rough; outward surrounds are illustrative and at most 0.6m',
                  'Neighbor features are renderer-only context, not reassigned played-hole surfaces',
                  '2021 terrain may predate current surfaces; currentness remains unverified']
    if not tee:
        limitations.append('Played-hole tee geometry missing; no tee shape synthesized')
    if not own_canopy:
        limitations.append('No reviewed canopy for this played hole; no tree groups synthesized')
    if omitted or not np.isfinite(grid_values).all():
        limitations.append('Source nodata remains unknown; unsupported triangles omitted')
    profile = {'compilerVersion': COMPILER_VERSION, 'styleVersion': STYLE_VERSION,
               'tacticalBoundsM': tactical_bounds, 'contextBoundsM': context_bounds, 'terrainAvailable': True,
               'contextCoverage': 'partial' if omitted or not np.isfinite(grid_values).all() else 'complete',
               'teeGeometry': 'approximate' if tee else 'missing', 'treeEvidence': 'canopy_only' if own_canopy else 'none',
               'limitations': limitations}
    meta = source.manifest
    source_meta = {'provider': 'USGS 3DEP', 'title': meta['selectedTitle'], 'url': meta['sourceUrl'],
                   'catalogObjectId': meta['selectedObjectId'], 'acquisitionStart': meta['acquisitionStart'], 'acquisitionEnd': meta['acquisitionEnd'],
                   'retrievedAt': meta['retrievedAt'], 'nativeResolutionM': 1, 'verticalAccuracyM': None, 'registrationResidualM': None,
                   'licenseUrl': meta['licenseUrl'], 'rasterSha256': meta['fileHashes']['elevation.tiff'],
                   'horizontalExportCrs': meta['horizontalExportCrs'], 'exportPixelM': meta['exportPixelM'],
                   'renderSamplingM': {'tactical': TACTICAL_STEP_M, 'detail': DETAIL_STEP_M, 'context': outer_step},
                   'metricSamplingM': METRIC_STEP_M, 'normalGradientStepM': 1}
    result = {'schemaVersion': 1, 'physicalHoleKey': hole['key'], 'geometryHash': pkg['contentHash'],
              'displayRevision': 'bounded-outline-v1', 'surfaceManifestHash': digest([displays[f['id']][0] for f in selected]),
              'status': 'source_candidate', 'horizontalFrame': 'wgs84-local-enu-v1', 'originWgs84': pkg['originWgs84'],
              'verticalDatum': 'NAVD88', 'verticalUnits': 'meters', 'referenceElevationM': round(float(np.min(heights[valid])), 4),
              'vertices': vertices, 'sourceNormals': source_normals, 'triangleFeatures': kept_features, 'triangleMaterials': kept_materials,
              'featureIds': ids, 'featureKinds': kinds, 'contextFeatureIds': context_ids, 'metricGrid': grid,
              'renderProfile': profile, 'source': source_meta, 'limitations': limitations}
    result['contentHash'] = digest(result)
    slopes = np.degrees(np.arctan(np.hypot(dzdx[valid], dzdy[valid])))
    report = {'physicalHoleKey': hole['key'], 'contentHash': result['contentHash'], 'geometryHash': pkg['contentHash'],
              'configuredBudget': MAX_TRIANGLES, 'originalEnvelope': ORIGINAL_TRIANGLE_ENVELOPE,
              'triangles': len(kept_features), 'uniqueVertices': len(unique), 'omittedTriangles': omitted,
              'metricCells': len(grid_values), 'metricNodataCells': int(np.count_nonzero(~np.isfinite(grid_values))),
              **duplicate_vertex_report(vertices, source_normals),
              'sourceNormalUnitMaxError': float(np.max(np.abs(np.linalg.norm(np.array(source_normals).reshape(-1, 3), axis=1)-1))),
              'slopesDegrees': {'max': float(max(slopes)), 'p95': float(np.percentile(slopes, 95)), 'p50': float(np.median(slopes))},
              'elevationRangeM': [float(min(heights[valid])), float(max(heights[valid]))],
              'contextAreaM2': context.area, 'triangulatedAreaM2': sum(f['areaM2'] for f in reports)-omitted_area,
              'omittedAreaM2': omitted_area,
              'contextClippedFeatureIds': [f['id'] for f in selected if not context.covers(displays[f['id']][1])],
              'tacticalDistanceToContextEdgeM': [tactical_bounds[0]-context_bounds[0], tactical_bounds[1]-context_bounds[1],
                                                 context_bounds[2]-tactical_bounds[2], context_bounds[3]-tactical_bounds[3]],
              'features': reports, 'contextFeatureIds': context_ids,
              'displayOutlines': [outline_reports[f['id']] for f in selected], 'renderProfile': profile, 'source': source_meta,
              'compressedBytes': len(gzip.compress((canonical_json(result)+'\n').encode(), mtime=0))}
    return result, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--holes', default='7', help='all or comma-separated played hole ordinals')
    parser.add_argument('--package', type=Path, default=FIXTURES/'cacapon.json')
    parser.add_argument('--source', type=Path, default=FIXTURES/'sources/cacapon-course-terrain')
    parser.add_argument('--output', type=Path, default=FIXTURES/'compiled-cacapon')
    args = parser.parse_args()
    pkg = json.loads(args.package.read_text())
    pilot.ORIGIN = pkg['originWgs84']
    raw_features = {f['id']: f for f in pkg['features']}
    raw_shapes = {i: local_geometry(f) for i, f in raw_features.items()}
    extents = [hole_bounds(hole, raw_shapes, raw_features)[1] for hole in pkg['holes']]
    bounds = [min(b[0] for b in extents)-8, min(b[1] for b in extents)-8,
              max(b[2] for b in extents)+8, max(b[3] for b in extents)+8]
    manifest = acquire_source(args.source, pkg, bounds)
    source = ElevationSource(args.source, manifest)
    displays, outlines = display_surfaces(args.package, pkg, args.source)
    wanted = {hole['ordinal'] for hole in pkg['holes']} if args.holes == 'all' else {int(n) for n in args.holes.split(',')}
    unknown = wanted.difference(hole['ordinal'] for hole in pkg['holes'])
    if unknown:
        raise ValueError('Unknown hole ordinals: ' + str(sorted(unknown)))
    reports, assets = [], {}
    asset_path = args.output/'asset-manifest.json'
    if asset_path.exists():
        previous = json.loads(asset_path.read_text())
        if previous['geometryHash'] != pkg['contentHash'] or previous['sourceManifestHash'] != digest(manifest):
            raise ValueError('Output manifest belongs to a different package/source; choose a new directory')
        assets = previous['holes']
    for hole in pkg['holes']:
        if hole['ordinal'] not in wanted:
            continue
        result, report = compile_hole(hole, pkg, raw_shapes, raw_features, displays, outlines, source)
        asset = write_asset(args.output, hole, result)
        assets[hole['key']] = asset
        report['asset'] = asset
        write_json(args.output/(hole['key']+'-report.json'), report, True)
        reports.append(report)
        print(json.dumps({'hole': hole['key'], 'triangles': report['triangles'], 'metricCells': report['metricCells'],
                          'contextFeatures': len(report['contextFeatureIds']), 'tee': report['renderProfile']['teeGeometry'],
                          'hash': report['contentHash']}), flush=True)
    summary = {'compilerVersion': COMPILER_VERSION, 'styleVersion': STYLE_VERSION, 'packageHash': pkg['contentHash'],
               'sourceManifestHash': digest(manifest), 'source': manifest,
               'requestedOrdinals': sorted(wanted), 'compiledHoleCount': len(reports),
               'runtimeVersions': {'python': sys.version.split()[0], 'numpy': np.__version__, 'shapely': shapely.__version__, 'pyproj': pyproj.__version__},
               'holes': reports, 'limitations': ['All artifacts are local source candidates; no production publication or geographic acceptance implied',
               'Metric grid is independent of display mesh; a query requires all four bilinear supports to be valid',
               'contextCoverage describes DEM support, not completeness of fairway/rough/tree mapping']}
    write_json(args.output/'compilation-report.json', summary, True)
    write_json(asset_path, {'schemaVersion': 1, 'compilerVersion': COMPILER_VERSION,
                          'geometryHash': pkg['contentHash'], 'sourceManifestHash': digest(manifest),
                          'holes': dict(sorted(assets.items()))}, True)
    readme = f'''# Cacapon whole-course terrain source\n\nOne locked native-1m USGS tile: **{manifest['selectedTitle']}**.\nAcquisition: {manifest['acquisitionStart']} to {manifest['acquisitionEnd']}.\nRetrieved: {manifest['retrievedAt']}. Immutable hashes and exact projected bounds\nare in source-manifest.json and export.json. Do not replace the cached raster.\n\nThe EPSG:{SOURCE_CRS} export is sampled at approximately 1m; the 2m canonical\nmetric grid, 4m tactical mesh, 2m detail cells and coarser outer cells are separate\nrender/query choices, not claims of finer source resolution. Heights remain\nNAVD88 meters. Registration residual and source vertical accuracy are unknown.\n\nNeighbor source features are renderer-only context. No cart paths, rough\nclassification, additional tree areas, daily tee markers or cup positions are\ncreated. Canopy evidence remains limited to the existing reviewed hole7 groups.\n\n[USGS 3DEP products and use terms](https://www.usgs.gov/3d-elevation-program/about-3dep-products-services).\nSource geometry attribution remains © OpenStreetMap contributors, ODbL1.0.\n'''
    (args.source/'README.md').write_text(readme)


if __name__ == '__main__':
    main()

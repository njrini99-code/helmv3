#!/usr/bin/env python3
"""Create source-backed, per-hole review overlays from retained RGB+NIR tiles.

This compiler consumes only a *complete* imagery index with either matching
NC OneMap source-item provenance or verified locked national source tiles.
It draws existing source-candidate
features over high-resolution imagery and emits sand-like observation regions
for reviewer attention. It never edits a canonical package, admits a route, or
creates measurement authority.

Usage:
  python3 scripts/golf/course-geometry/review-native-ortho.py \
    <normalized.json> <native-ortho-index.json> <source-items.json> <out-dir>
"""
import argparse
import hashlib
import importlib.util
import json
import math
import uuid
from pathlib import Path

import numpy as np
import pyproj
from osgeo import gdal
from PIL import Image, ImageDraw
from scipy import ndimage


gdal.UseExceptions()
HERE = Path(__file__).resolve().parent
_SOURCE_REGISTRY_SPEC = importlib.util.spec_from_file_location(
    'golfhelm_source_registry', HERE / 'factory' / 'source_registry.py',
)
source_registry = importlib.util.module_from_spec(_SOURCE_REGISTRY_SPEC)
assert _SOURCE_REGISTRY_SPEC and _SOURCE_REGISTRY_SPEC.loader
_SOURCE_REGISTRY_SPEC.loader.exec_module(source_registry)
_NAIP_SPEC = importlib.util.spec_from_file_location('naip_ortho', HERE / 'fetch-usgs-naip-facility-ortho.py')
naip_ortho = importlib.util.module_from_spec(_NAIP_SPEC)
_NAIP_SPEC.loader.exec_module(naip_ortho)

# These values produce review observations, never a classifier verdict. They
# deliberately mirror the existing NAIP review threshold family but always
# record their source and effective processing resolution.
SAND_BRIGHTNESS_MIN = 140
SAND_NDVI_MAX = 0.12
SAND_WARMTH_MIN = 12
OUTSIDE_RING_METERS = 1.0
MARGIN_METERS = 45.0
# Overlay thumbnails are capped independently. Four million pixels keeps an
# approximately 0.30 m scan on a 600 m x 300 m hole: enough for review
# prompts while retaining the original 0.1524 m GeoTIFF as source evidence.
MAX_ANALYSIS_PIXELS = 4_000_000
MAX_OVERLAY_PIXELS = 1_600
# Sub-20 m² leaf-off fragments are too easily confused with turf variation.
# They remain visible in the source overlay but cannot become review candidates.
CANDIDATE_MIN_AREA_M2 = 20.0
MAX_REVIEW_CANDIDATE_AREA_M2 = 350.0
MAX_REVIEW_CANDIDATE_ASPECT_RATIO = 6.0
# A reviewer needs the strongest bounded prompts, not every turf-colored blob.
MAX_CANDIDATES_PER_HOLE = 3
COLORS = {
    'fairway': (150, 255, 150), 'green': (255, 255, 130),
    'bunker': (255, 170, 70), 'tee': (140, 210, 255),
    'water': (100, 170, 255), 'route': (255, 255, 255),
}
PHYSICAL_KINDS = frozenset(COLORS)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def digest_path(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, document):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(document, indent=2, ensure_ascii=False) + '\n')


def geometry_points(geometry):
    """Yield lon/lat points from the GeoJSON geometry types a package carries."""
    kind = (geometry or {}).get('type')
    coords = (geometry or {}).get('coordinates') or []
    if kind == 'LineString':
        return coords
    if kind == 'Polygon':
        return [point for ring in coords for point in ring]
    if kind == 'MultiPolygon':
        return [point for polygon in coords for ring in polygon for point in ring]
    return []


def projected_points(feature, project):
    return [project.transform(*point) for point in geometry_points(feature.get('geometryWgs84'))]


def hole_features(package, hole):
    by_id = {feature.get('id'): feature for feature in package.get('features') or []}
    return [by_id[feature_id] for feature_id in hole.get('featureIds') or []
            if feature_id in by_id and by_id[feature_id].get('kind') in PHYSICAL_KINDS]


def analysis_bounds(features, project, margin_units):
    points = [point for feature in features for point in projected_points(feature, project)]
    if not points:
        raise ValueError('hole has no source-backed feature geometry for a visual review crop')
    xs, ys = zip(*points)
    return min(xs) - margin_units, min(ys) - margin_units, max(xs) + margin_units, max(ys) + margin_units


def intersects(bounds, tile_bounds):
    west, south, east, north = bounds
    tile_west, tile_south, tile_east, tile_north = tile_bounds
    return west < tile_east and east > tile_west and south < tile_north and north > tile_south


def tile_paths(index_path, index, bounds):
    root = Path(index_path).parent
    paths = []
    for tile in index.get('tiles') or []:
        if not intersects(bounds, tile.get('boundsNativeUSFeet') or tile.get('boundsLocalMeters') or []):
            continue
        folder = root / 'tiles' / tile['key']
        if index.get('schema') == naip_ortho.INDEX_SCHEMA:
            rgb = nir = folder / 'ortho.tif'
        else:
            rgb, nir = folder / 'rgb.tif', folder / 'nir.tif'
        if not rgb.is_file() or not nir.is_file():
            raise ValueError(f'native imagery tile {tile["key"]} is missing its RGB or NIR TIFF')
        paths.append((tile['key'], rgb, nir))
    if not paths:
        raise ValueError('review crop has no retained native imagery tiles')
    return paths


def raster_crs(paths):
    dataset = gdal.Open(str(paths[0][1]))
    if dataset is None or not dataset.GetProjectionRef():
        raise ValueError('native imagery tile has no CRS')
    return dataset.GetProjectionRef(), abs(float(dataset.GetGeoTransform()[1]))


def bounded_grid(bounds, base_pixel, max_pixels):
    west, south, east, north = bounds
    width_base = max(1, math.ceil((east - west) / base_pixel))
    height_base = max(1, math.ceil((north - south) / base_pixel))
    factor = max(1, math.ceil(math.sqrt((width_base * height_base) / max_pixels)))
    pixel = base_pixel * factor
    width = max(1, math.ceil((east - west) / pixel))
    height = max(1, math.ceil((north - south) / pixel))
    return {
        # Explicit square processing cells. Expanding the crop by less than
        # one cell keeps source/vector registration exact after GDAL resampling.
        'bounds': [west, north - height * pixel, west + width * pixel, north],
        'basePixelUnits': base_pixel,
        'analysisPixelUnits': pixel,
        'downsampleFactor': factor,
        'width': width,
        'height': height,
    }


def crop_vrt(paths, channel_index, grid):
    """Read only the selected review crop through a virtual mosaic."""
    suffix = uuid.uuid4().hex
    vrt_path = f'/vsimem/golfhelm-native-{suffix}-{channel_index}.vrt'
    source_paths = [str(row[channel_index]) for row in paths]
    # TIFF readers may label the fourth NAIP band as alpha. It is NIR, and
    # its low reflectance must not hide valid RGB water/shadow pixels.
    vrt = gdal.BuildVRT(vrt_path, source_paths, options=gdal.BuildVRTOptions(options=['-ignore_srcmaskband']))
    if vrt is None:
        raise ValueError('could not construct virtual native imagery mosaic')
    vrt = None
    west, south, east, north = grid['bounds']
    try:
        crop = gdal.Warp(
            '', vrt_path,
            options=gdal.WarpOptions(format='MEM', outputBounds=[west, south, east, north],
                                    width=grid['width'], height=grid['height'], resampleAlg='near',
                                    srcAlpha=False, dstAlpha=False),
        )
        if crop is None:
            raise ValueError('could not read native imagery review crop')
        data = crop.ReadAsArray()
        if data.ndim == 2:
            data = data[np.newaxis, :, :]
        if data.shape[1:] != (grid['height'], grid['width']):
            raise ValueError('native imagery crop dimensions do not match the review grid')
        expected = (west, grid['analysisPixelUnits'], 0, north, 0, -grid['analysisPixelUnits'])
        if not np.allclose(crop.GetGeoTransform(), expected, atol=1e-7, rtol=0):
            raise ValueError('review crop coordinates differ from the overlay grid')
        return data.astype(np.uint8, copy=False)
    finally:
        gdal.Unlink(vrt_path)


def to_pixel(point, grid):
    west, _south, _east, north = grid['bounds']
    pixel = grid['analysisPixelUnits']
    return (point[0] - west) / pixel, (north - point[1]) / pixel


def feature_pixels(feature, project, grid):
    geometry = feature.get('geometryWgs84') or {}
    kind = geometry.get('type')
    if kind == 'LineString':
        return [[to_pixel(project.transform(*point), grid) for point in geometry.get('coordinates') or []]]
    if kind == 'Polygon':
        return [[to_pixel(project.transform(*point), grid) for point in ring] for ring in geometry.get('coordinates') or []]
    if kind == 'MultiPolygon':
        return [[to_pixel(project.transform(*point), grid) for point in ring]
                for polygon in geometry.get('coordinates') or [] for ring in polygon]
    return []


def draw_overlay(rgb, features, project, grid, output):
    image = Image.fromarray(np.transpose(rgb, (1, 2, 0)), mode='RGB')
    scale = min(1.0, MAX_OVERLAY_PIXELS / max(image.size))
    if scale < 1.0:
        image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(image)
    for feature in features:
        rings = feature_pixels(feature, project, grid)
        color = COLORS[feature['kind']]
        for ring in rings:
            if len(ring) < 2:
                continue
            points = [(round(x * scale), round(y * scale)) for x, y in ring]
            draw.line(points + ([] if feature['kind'] == 'route' else [points[0]]), fill=color, width=max(1, round(2 * scale)))
    image.save(output)


def polygon_mask(feature, project, grid):
    mask = Image.new('L', (grid['width'], grid['height']), 0)
    draw = ImageDraw.Draw(mask)
    for ring in feature_pixels(feature, project, grid):
        if len(ring) >= 3:
            draw.polygon(ring, fill=1)
    return np.array(mask, dtype=bool)


def source_bbox_to_wgs84(bbox, unproject):
    west, south, east, north = bbox
    return [[round(value, 7) for value in unproject.transform(x, y)] for x, y in (
        (west, south), (east, south), (east, north), (west, north), (west, south),
    )]


def is_bounded_review_observation(area_m2, aspect_ratio):
    """Reject fairway-scale or strip-like spectral regions as features.

    A bright, low-NIR region can be dormant turf, a fairway, sand or hardscape.
    Large and elongated regions remain visual scene conditions for a person to
    inspect, never derived bunker candidates.
    """
    return CANDIDATE_MIN_AREA_M2 <= area_m2 <= MAX_REVIEW_CANDIDATE_AREA_M2 and aspect_ratio <= MAX_REVIEW_CANDIDATE_ASPECT_RATIO


def sand_observations(rgb, nir, features, project, unproject, grid, meters_per_unit):
    red, blue = rgb[0].astype(float), rgb[2].astype(float)
    brightness = rgb.astype(float).mean(axis=0)
    ndvi = (nir[0].astype(float) - red) / (nir[0].astype(float) + red + 1e-6)
    valid = np.any(rgb != 0, axis=0) | (nir[0] != 0)
    sand = valid & (brightness > SAND_BRIGHTNESS_MIN) & (ndvi < SAND_NDVI_MAX) & ((red - blue) > SAND_WARMTH_MIN)
    bunker_stats, claimed = [], np.zeros_like(sand, dtype=bool)
    for feature in features:
        if feature.get('kind') != 'bunker':
            continue
        inside = polygon_mask(feature, project, grid)
        ring_px = max(1, round(OUTSIDE_RING_METERS / (grid['analysisPixelUnits'] * meters_per_unit)))
        outside = ndimage.binary_dilation(inside, iterations=ring_px) & ~inside
        bunker_stats.append({
            'featureId': feature['id'],
            'validImageryShareInside': round(float(valid[inside].mean()), 6) if inside.any() else None,
            'sandShareInside': round(float(sand[inside & valid].mean()), 3) if (inside & valid).any() else None,
            'sandShareOutsideRing': round(float(sand[outside & valid].mean()), 3) if (outside & valid).any() else None,
            'analysisAreaM2': round(float(inside.sum()) * (grid['analysisPixelUnits'] * meters_per_unit) ** 2, 2),
        })
        claimed |= ndimage.binary_dilation(inside, iterations=ring_px)
    unclaimed = ndimage.binary_opening(sand & ~claimed, structure=np.ones((3, 3)))
    labels, _count = ndimage.label(unclaimed)
    minimum_pixels = max(1, math.ceil(CANDIDATE_MIN_AREA_M2 / (grid['analysisPixelUnits'] * meters_per_unit) ** 2))
    candidates, scene_conditions = [], []
    # Inspect each component's bounding slice, not the whole multi-megapixel
    # raster once per fragment. This keeps the review scan linear in practice.
    for label, region in enumerate(ndimage.find_objects(labels), start=1):
        if region is None:
            continue
        count = int(np.count_nonzero(labels[region] == label))
        if count < minimum_pixels:
            continue
        y0, y1 = region[0].start, region[0].stop
        x0, x1 = region[1].start, region[1].stop
        west, _south, _east, north = grid['bounds']
        pixel = grid['analysisPixelUnits']
        bbox = [west + x0 * pixel, north - y1 * pixel, west + x1 * pixel, north - y0 * pixel]
        area_m2 = round(count * (pixel * meters_per_unit) ** 2, 2)
        width_m = (x1 - x0) * pixel * meters_per_unit
        height_m = (y1 - y0) * pixel * meters_per_unit
        aspect_ratio = round(max(width_m, height_m) / max(min(width_m, height_m), 1e-6), 3)
        observation = {
            'method': 'bright, low-NIR/NDVI, warm RGB region outside mapped bunker masks',
            'analysisAreaM2': area_m2, 'aspectRatio': aspect_ratio,
            'bboxWgs84': source_bbox_to_wgs84(bbox, unproject),
            'canMeasurePhysicalGeometry': False,
        }
        if is_bounded_review_observation(area_m2, aspect_ratio):
            candidates.append({
                'id': f'sand-observation-{len(candidates) + 1}', 'kind': 'sand_like_observation',
                'truthClass': 'derived', 'reviewStatus': 'review_required', **observation,
            })
        else:
            scene_conditions.append({
                'kind': 'sand_like_scene_condition', 'truthClass': 'visual_only',
                'reviewStatus': 'review_required',
                'meaning': 'Large or elongated spectral region; not a candidate course feature.', **observation,
            })
    return (bunker_stats,
            sorted(candidates, key=lambda row: row['analysisAreaM2'], reverse=True)[:MAX_CANDIDATES_PER_HOLE],
            sorted(scene_conditions, key=lambda row: row['analysisAreaM2'], reverse=True)[:12])


def contact_sheet(paths, output):
    images = [Image.open(path).convert('RGB') for path in paths]
    if not images:
        return
    cell_w, cell_h, columns = 420, 420, 4
    rows = math.ceil(len(images) / columns)
    sheet = Image.new('RGB', (cell_w * columns, cell_h * rows), (20, 20, 20))
    for index, image in enumerate(images):
        image.thumbnail((cell_w - 8, cell_h - 8))
        sheet.paste(image, ((index % columns) * cell_w + 4, (index // columns) * cell_h + 4))
    sheet.save(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('native_index', type=Path)
    parser.add_argument('source_items', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    package = json.loads(args.package.read_text())
    index = json.loads(args.native_index.read_text())
    is_naip = index.get('schema') == naip_ortho.INDEX_SCHEMA
    if is_naip:
        # The national v2 index embeds tile hashes; check the original item,
        # locked export request and TIFF bytes, not an NC sidecar substitute.
        naip_ortho.validate_index(args.native_index)
        contract = {'canCreateReviewCandidates': True, 'canMeasurePhysicalGeometry': False,
                    'sourceTruthClass': 'measured', 'candidateGeometryTruthClass': 'derived',
                    'reviewRequired': True, 'reason': 'Source-locked four-band pixels verified for derived review only.'}
        items_hash = None
    else:
        source_items = json.loads(args.source_items.read_text())
        contract = source_registry.native_ortho_review_contract(
            index, source_items, index_sha256=digest_path(args.native_index),
        )
        items_hash = digest_path(args.source_items)
    args.output.mkdir(parents=True, exist_ok=True)
    write_json(args.output / 'review-contract.json', {
        **contract,
        'packageHash': package.get('contentHash'),
        'nativeIndexSha256': digest_path(args.native_index),
        'sourceItemsSha256': items_hash,
        'rule': 'This review output never changes canonical geometry, route admission, or physical measurement authority.',
    })
    if not contract['canCreateReviewCandidates']:
        raise ValueError(contract['reason'])
    # The imagery CRS and pixel size are read from the retained TIFF, not
    # trusted from catalog prose. NC State Plane is in US survey feet.
    sample_paths = tile_paths(args.native_index, index, [-math.inf, -math.inf, math.inf, math.inf])
    projection, base_pixel = raster_crs(sample_paths)
    crs = pyproj.CRS.from_wkt(projection)
    meters_per_unit = float(crs.axis_info[0].unit_conversion_factor)
    project = pyproj.Transformer.from_crs(4326, crs, always_xy=True)
    unproject = pyproj.Transformer.from_crs(crs, 4326, always_xy=True)
    overlays, rows = [], []
    for hole in package.get('holes') or []:
        features = hole_features(package, hole)
        if not features:
            rows.append({'holeKey': hole.get('key'), 'status': 'no_source_feature_geometry', 'reviewRequired': True})
            continue
        margin_units = MARGIN_METERS / meters_per_unit
        bounds = analysis_bounds(features, project, margin_units)
        paths = tile_paths(args.native_index, index, bounds)
        grid = bounded_grid(bounds, base_pixel, MAX_ANALYSIS_PIXELS)
        if is_naip:
            data = crop_vrt(paths, 1, grid)
            rgb, nir = data[:3], data[3:4]
        else:
            rgb = crop_vrt(paths, 1, grid)
            nir = crop_vrt(paths, 2, grid)
        if rgb.shape[0] != 3 or nir.shape[0] != 1:
            raise ValueError(f'{hole.get("key")}: retained native tile bands do not match RGB+NIR contract')
        overlay = args.output / f'{hole["key"]}-native-overlay.png'
        draw_overlay(rgb, features, project, grid, overlay)
        bunker_stats, candidates, scene_conditions = sand_observations(rgb, nir, features, project, unproject, grid, meters_per_unit)
        overlays.append(overlay)
        has_route = any(feature.get('kind') == 'route' for feature in features)
        rows.append({
            'holeKey': hole['key'], 'ordinal': hole.get('ordinal'), 'status': 'review_candidate_ready',
            'scanScope': {'route': 'non_canonical_visual_crop_aid' if has_route else 'feature_extent_only',
                          'rule': 'The crop scope cannot admit a route or support a distance measurement.'},
            'effectiveAnalysisGsdMeters': round(grid['analysisPixelUnits'] * meters_per_unit, 6),
            'validImageryShareInCrop': round(float((np.any(rgb != 0, axis=0) | (nir[0] != 0)).mean()), 6),
            'downsampleFactor': grid['downsampleFactor'], 'nativeTiles': [key for key, _rgb, _nir in paths],
            'mappedBunkers': bunker_stats, 'derivedObservationCandidates': candidates,
            'largeSandLikeSceneConditions': scene_conditions, 'overlay': overlay.name,
        })
        print(canonical({'hole': hole['key'], 'status': 'review_candidate_ready', 'candidates': len(candidates)}), flush=True)
    contact_sheet(overlays, args.output / 'contact-sheet.png')
    observations = {
        'schema': 'golfhelm-native-ortho-review-v1', 'packageHash': package.get('contentHash'),
        'sourceTruthClass': contract['sourceTruthClass'], 'candidateGeometryTruthClass': contract['candidateGeometryTruthClass'],
        'canMeasurePhysicalGeometry': False, 'reviewRequired': True,
        'source': {'nativeGsdMeters': index.get('sourceGsdMeters') or index.get('sourceResolutionMeters'),
                   'indexSha256': digest_path(args.native_index), 'sourceItemsSha256': items_hash,
                   'provider': 'USGS NAIP Plus' if is_naip else 'NC OneMap',
                   'gridAlignment': 'reprojected_native_density' if is_naip else 'native_source_grid'},
        'method': {'sandBrightnessMin': SAND_BRIGHTNESS_MIN, 'sandNdviMax': SAND_NDVI_MAX,
                   'sandWarmthMin': SAND_WARMTH_MIN, 'maximumAnalysisPixels': MAX_ANALYSIS_PIXELS,
                   'maximumCandidateAreaM2': MAX_REVIEW_CANDIDATE_AREA_M2,
                   'maximumCandidateAspectRatio': MAX_REVIEW_CANDIDATE_ASPECT_RATIO,
                   'maximumCandidatesPerHole': MAX_CANDIDATES_PER_HOLE},
        'meaning': 'Candidate observations are review prompts. They do not add, move, remove, or measure canonical course features.',
        'holes': rows,
    }
    write_json(args.output / 'candidate-observations.json', observations)
    print(canonical({'status': 'complete', 'holes': len(rows), 'overlays': len(overlays)}))


if __name__ == '__main__':
    main()
